"""HTTP boundary for trained forecast, hotspot detection and relocation planning."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator

from src.common.haversine import get_zone_coords
from src.common.policy import Policy, get_policy
from src.config import get_settings
from src.contracts import ContractModel, StepAlignedDatetime, ZoneId, ensure_full_zone_coverage
from src.contracts.forecast import Forecast, HorizonMin
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.datasets.snapshot_replay import dataset_status, next_snapshot
from src.forecasting.lgbm_quantile import forecast_at, load_models
from src.forecasting.live_snapshot_baseline import forecast_from_live_zones
from src.hotspot.detector import gap_of, meets_condition, severity_of
from src.optimizer.greedy import solve

router = APIRouter(prefix="/api/v1", tags=["inference"])


class DatasetSnapshotRequest(ContractModel):
    after_source_at: StepAlignedDatetime | None = None
    regime: Literal["normal", "peak", "rain", "rain_peak"] | None = None


@router.get("/datasets/snapshots/status")
def get_dataset_status() -> dict[str, object]:
    try:
        return dataset_status()
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/datasets/snapshots/next")
def get_next_dataset_snapshot(request: DatasetSnapshotRequest) -> dict[str, object]:
    try:
        source_at = pd.Timestamp(request.after_source_at) if request.after_source_at else None
        return next_snapshot(source_at, request.regime)
    except LookupError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


class LiveZoneInput(ContractModel):
    zone_id: ZoneId
    demand_observed: int = Field(ge=0)
    idle_supply: int = Field(ge=0)
    enroute_supply: int = Field(default=0, ge=0)
    rain_mm_h: float = Field(ge=0)
    rain_forecast_15: float = Field(ge=0)
    rain_forecast_30: float = Field(ge=0)
    peak_flag: Literal[0, 1]
    holiday_flag: Literal[0, 1]


class DecisionRequest(ContractModel):
    snapshot_id: int | str
    t: StepAlignedDatetime
    horizon_min: HorizonMin = 15
    data_source: str = Field(min_length=1)
    replay_source_at: StepAlignedDatetime | None = None
    zones: tuple[LiveZoneInput, ...]

    @model_validator(mode="after")
    def validate_zone_coverage(self) -> "DecisionRequest":
        ensure_full_zone_coverage([zone.zone_id for zone in self.zones])
        return self


@lru_cache(maxsize=1)
def _trained_models(model_directory: str):
    return load_models(Path(model_directory))


@lru_cache(maxsize=1)
def _simulation_features(feature_path: str) -> pd.DataFrame:
    return pd.read_parquet(feature_path)


def trained_model_readiness() -> dict[str, object]:
    """Load artifacts for real so health cannot report a false ready state."""
    settings = get_settings()
    model_directory = settings.data_dir / "models"
    feature_path = settings.data_dir / "features" / "features_test.parquet"
    try:
        models = _trained_models(str(model_directory))
        features = _simulation_features(str(feature_path))
    except Exception as error:  # noqa: BLE001 - readiness reports loader failures.
        return {"ready": False, "error": str(error), "artifacts": len(list(model_directory.glob("*.txt")))}
    return {
        "ready": len(models) == 12,
        "artifacts": len(models),
        "model_version": "lgbm_quantile_v1",
        "simulation_feature_rows": len(features),
    }


def _forecast(request: DecisionRequest) -> tuple[Forecast, str, list[dict[str, str]]]:
    """Run trained LightGBM for a frozen simulation bucket, with an explicit fallback."""
    settings = get_settings()
    if request.replay_source_at is not None:
        try:
            features = _simulation_features(str(settings.data_dir / "features" / "features_test.parquet"))
            source = forecast_at(
                _trained_models(str(settings.data_dir / "models")),
                features,
                t=pd.Timestamp(request.replay_source_at),
                horizon_min=request.horizon_min,
            )
            forecast = Forecast(
                t=request.t,
                horizon_min=request.horizon_min,
                forecast_ts=request.t + (source.forecast_ts - source.t),
                zones=source.zones,
                model_version=source.model_version,
                regime=source.regime,
            )
            return forecast, "trained_model_replay", []
        except Exception as error:  # noqa: BLE001 - model errors must fall back audibly.
            return (
                forecast_from_live_zones(request.t, request.horizon_min, request.zones),
                "live_snapshot_baseline",
                [{
                    "code": "FORECAST_FALLBACK_USED",
                    "message": f"LightGBM không chạy được ({type(error).__name__}); đang dùng baseline snapshot.",
                }],
            )

    return (
        forecast_from_live_zones(request.t, request.horizon_min, request.zones),
        "live_snapshot_baseline",
        [{
            "code": "MODEL_HISTORY_INCOMPLETE",
            "message": "Snapshot không có nguồn replay hoặc lịch sử feature; đang dùng baseline snapshot.",
        }],
    )


def _detect_without_hidden_state(
    forecast: Forecast,
    request: DecisionRequest,
    policy: Policy,
) -> HotspotOutput:
    idle = {zone.zone_id: zone.idle_supply for zone in request.zones}
    mode = policy.rules.conservative_gap_mode if forecast.regime == "rain_peak" else None
    hotspots: list[Hotspot] = []
    surplus: list[SurplusZone] = []
    for zone in forecast.zones:
        gap = gap_of(zone, regime=forecast.regime, conservative_gap_mode=mode)
        if meets_condition(
            predicted_supply=zone.predicted_supply,
            gap=gap,
            predicted_demand=zone.predicted_demand,
            min_supply_per_zone=policy.rules.min_supply_per_zone,
        ):
            hotspots.append(Hotspot(
                zone_id=zone.zone_id,
                is_hotspot=True,
                gap=gap,
                severity_score=severity_of(gap, zone.predicted_demand),
                idle_supply_current=idle[zone.zone_id],
            ))
        available = zone.predicted_supply - zone.predicted_demand
        if available > 0:
            surplus.append(SurplusZone(
                zone_id=zone.zone_id,
                surplus=available,
                idle_supply_current=idle[zone.zone_id],
                cooldown_until_ts=None,
            ))
    return HotspotOutput(
        forecast_ts=forecast.forecast_ts,
        horizon_min=forecast.horizon_min,
        hotspots=tuple(hotspots),
        surplus_zones=tuple(surplus),
        conservative_gap_mode=mode,
    )


@router.post("/decisions")
def generate_decision(request: DecisionRequest) -> dict[str, object]:
    settings = get_settings()
    policy = get_policy(settings.policy_path)
    forecast, forecast_mode, forecast_warnings = _forecast(request)
    hotspot_output = _detect_without_hidden_state(forecast, request, policy)
    rain = {zone.zone_id: zone.rain_mm_h for zone in request.zones}
    result = solve(
        hotspot_output,
        t=request.t,
        rain_mm_h=rain,
        policy=policy,
        zone_coords=get_zone_coords(settings.zone_registry_path),
    )
    warnings = [*forecast_warnings, *result.warnings, {
        "code": "HYSTERESIS_STATE_UNAVAILABLE",
        "message": "Request đơn không có lịch sử hysteresis; hotspot dùng điều kiện thô.",
    }]
    return {
        "snapshot_id": request.snapshot_id,
        "data_source": request.data_source,
        "forecast_mode": forecast_mode,
        "activation_policy": {
            "incentive_amount": policy.rules.incentive_base,
            "incentive_budget_cap": policy.rules.incentive_budget_cap,
        },
        "forecast": forecast.model_dump(mode="json"),
        "hotspots": hotspot_output.model_dump(mode="json"),
        "plan": {
            "moves": [move.model_dump(mode="json") for move in result.moves],
            "residual_gap": [gap.model_dump(mode="json") for gap in result.residual_gap],
            "plan_totals": result.plan_totals.model_dump(mode="json"),
            "warnings": warnings,
        },
    }
