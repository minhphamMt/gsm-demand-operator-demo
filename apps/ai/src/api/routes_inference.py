"""HTTP boundary for trained forecast, hotspot detection and relocation planning."""

import math
from functools import lru_cache
from pathlib import Path
from typing import Literal

import lightgbm as lgb
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator

from src.activation.recommendation import recommend_activation
from src.common.haversine import get_zone_coords
from src.common.policy import Policy, get_policy
from src.config import get_settings
from src.contracts import ContractModel, StepAlignedDatetime, ZoneId, ensure_full_zone_coverage
from src.contracts.forecast import Forecast, HorizonMin
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.datasets.snapshot_replay import dataset_status, next_snapshot, replay_features, snapshot_at, snapshot_window
from src.forecasting.lgbm_quantile import ModelKey, forecast_at, load_models, verify_model_bundle
from src.forecasting.live_snapshot_baseline import forecast_from_live_zones
from src.hotspot.detector import gap_inputs, gap_of, meets_condition, severity_of
from src.optimizer.greedy import solve
from src.simulation.metrics import system_metrics

router = APIRouter(prefix="/api/v1", tags=["inference"])


class DatasetSnapshotRequest(ContractModel):
    after_source_at: StepAlignedDatetime | None = None
    regime: Literal["normal", "peak", "rain", "rain_peak"] | None = None


class ExactDatasetSnapshotRequest(ContractModel):
    source_at: StepAlignedDatetime


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


@router.post("/datasets/snapshots/at")
def get_dataset_snapshot_at(request: ExactDatasetSnapshotRequest) -> dict[str, object]:
    try:
        return snapshot_at(pd.Timestamp(request.source_at))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/datasets/snapshots/window")
def get_dataset_snapshot_window(request: ExactDatasetSnapshotRequest) -> dict[str, object]:
    try:
        return {"steps": snapshot_window(pd.Timestamp(request.source_at))}
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
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
def _trained_models(model_directory: str) -> dict[ModelKey, lgb.Booster]:
    return load_models(Path(model_directory))


@lru_cache(maxsize=1)
def _simulation_features() -> pd.DataFrame:
    return replay_features()


@lru_cache(maxsize=1)
def _verified_model_bundle(model_directory: str, configured_model_version: str) -> dict[str, object]:
    return verify_model_bundle(
        Path(model_directory),
        configured_model_version=configured_model_version,
    )


def trained_model_readiness() -> dict[str, object]:
    """Load artifacts for real so health cannot report a false ready state."""
    settings = get_settings()
    model_directory = settings.data_dir / "models"
    try:
        bundle = _verified_model_bundle(str(model_directory), settings.model_version)
        models = _trained_models(str(model_directory))
        features = _simulation_features()
    except Exception as error:  # noqa: BLE001 - readiness reports loader failures.
        return {"ready": False, "error": str(error), "artifacts": len(list(model_directory.glob("*.txt")))}
    return {
        "ready": len(models) == 18 and bool(bundle["verified"]),
        "artifacts": len(models),
        "model_version": bundle["model_version"],
        "bundle": bundle,
        "simulation_feature_rows": len(features),
        "simulation_features_source": "derived_from_verified_snapshot_test.parquet",
    }


def _validate_replay_provenance(request: DecisionRequest) -> None:
    if request.replay_source_at is None:
        return
    source_at = pd.Timestamp(request.replay_source_at)
    try:
        expected = snapshot_at(source_at)
    except LookupError as error:
        raise HTTPException(
            status_code=409,
            detail={"code": "REPLAY_SOURCE_NOT_FOUND", "message": str(error)},
        ) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    expected_by_zone = {int(zone["zone_id"]): zone for zone in expected["zones"]}
    integer_fields = ("demand_observed", "idle_supply", "enroute_supply", "peak_flag", "holiday_flag")
    float_fields = ("rain_mm_h", "rain_forecast_15", "rain_forecast_30")
    mismatches: list[dict[str, object]] = []
    for actual in request.zones:
        source = expected_by_zone[actual.zone_id]
        actual_payload = actual.model_dump()
        for field in integer_fields:
            if int(actual_payload[field]) != int(source[field]):
                mismatches.append({"zone_id": actual.zone_id, "field": field})
        for field in float_fields:
            if not math.isclose(
                float(actual_payload[field]),
                float(source[field]),
                rel_tol=1e-9,
                abs_tol=1e-9,
            ):
                mismatches.append({"zone_id": actual.zone_id, "field": field})

    if mismatches:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "REPLAY_PROVENANCE_MISMATCH",
                "message": "Replay zones do not match the checksummed source bucket; mixed-source inference was blocked.",
                "mismatches": mismatches[:20],
            },
        )


def _live_baseline_warnings(request: DecisionRequest, warning: dict[str, str]) -> list[dict[str, str]]:
    warnings = [warning]
    if any(zone.enroute_supply > 0 for zone in request.zones):
        warnings.append({
            "code": "ENROUTE_ETA_UNAVAILABLE",
            "message": "Live input has aggregate en-route supply but no arrival ETA; it was excluded from predicted supply.",
        })
    return warnings


def _forecast(request: DecisionRequest) -> tuple[Forecast, str, list[dict[str, str]]]:
    """Run trained LightGBM for verified replay; baseline only for live observations."""
    settings = get_settings()
    if request.replay_source_at is not None:
        try:
            bundle = _verified_model_bundle(str(settings.data_dir / "models"), settings.model_version)
            features = _simulation_features()
            source = forecast_at(
                _trained_models(str(settings.data_dir / "models")),
                features,
                t=pd.Timestamp(request.replay_source_at),
                horizon_min=request.horizon_min,
                model_version=str(bundle["model_version"]),
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
        except Exception as error:  # noqa: BLE001 - replay must fail closed for any bundle/inference error.
            # Replay is explicitly selected to demonstrate the trained bundle. Falling
            # back here would persist baseline output under a replay provenance path and
            # make model failures look like legitimate forecasts.
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "REPLAY_MODEL_UNAVAILABLE",
                    "message": "Verified replay requires the trained model bundle; no baseline was substituted.",
                    "cause": type(error).__name__,
                },
            ) from error

    return (
        forecast_from_live_zones(request.t, request.horizon_min, request.zones),
        "live_snapshot_baseline",
        _live_baseline_warnings(request, {
            "code": "MODEL_HISTORY_INCOMPLETE",
            "message": "Snapshot không có nguồn replay hoặc lịch sử feature; đang dùng baseline snapshot.",
        }),
    )


def _detect_without_hidden_state(
    forecast: Forecast,
    request: DecisionRequest,
    policy: Policy,
) -> HotspotOutput:
    idle = {zone.zone_id: zone.idle_supply for zone in request.zones}
    # The replay can contain a local rain cell while the citywide mean remains just
    # below the global rain-regime threshold. The map already exposes those wet zones
    # and their p90 risk. Planning must therefore use the same conservative basis when
    # a peak snapshot has any observed/near-term rain, instead of silently falling back
    # to p50 and dispatching a single vehicle against many red risk zones.
    has_peak = any(zone.peak_flag == 1 for zone in request.zones)
    has_local_rain = any(
        max(zone.rain_mm_h, zone.rain_forecast_15, zone.rain_forecast_30)
        >= policy.derived.rain_threshold_mm_h
        for zone in request.zones
    )
    mode = policy.rules.conservative_gap_mode if has_peak and has_local_rain else None
    planning_regime = "rain_peak" if mode else forecast.regime
    hotspots: list[Hotspot] = []
    surplus: list[SurplusZone] = []
    for zone in forecast.zones:
        gap = gap_of(zone, regime=planning_regime, conservative_gap_mode=mode)
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
    _validate_replay_provenance(request)
    forecast, forecast_mode, forecast_warnings = _forecast(request)
    hotspot_output = _detect_without_hidden_state(forecast, request, policy)
    policy_hotspot_ids = {hotspot.zone_id for hotspot in hotspot_output.hotspots}
    planning_regime = "rain_peak" if hotspot_output.conservative_gap_mode else forecast.regime
    planning_gap_by_zone = {
        zone.zone_id: gap_of(
            zone,
            regime=planning_regime,
            conservative_gap_mode=hotspot_output.conservative_gap_mode,
        )
        for zone in forecast.zones
    }
    risk_targets = tuple(
        Hotspot(
            zone_id=zone.zone_id,
            is_hotspot=True,
            gap=planning_gap_by_zone[zone.zone_id],
            severity_score=severity_of(planning_gap_by_zone[zone.zone_id], zone.predicted_demand),
            idle_supply_current=next(item.idle_supply for item in request.zones if item.zone_id == zone.zone_id),
        )
        for zone in forecast.zones
        if zone.zone_id not in policy_hotspot_ids and planning_gap_by_zone[zone.zone_id] >= 0.5
    )
    optimizer_output = HotspotOutput(
        forecast_ts=hotspot_output.forecast_ts,
        horizon_min=hotspot_output.horizon_min,
        hotspots=(*hotspot_output.hotspots, *risk_targets),
        surplus_zones=hotspot_output.surplus_zones,
        conservative_gap_mode=hotspot_output.conservative_gap_mode,
    )
    rain = {zone.zone_id: zone.rain_mm_h for zone in request.zones}
    result = solve(
        optimizer_output,
        t=request.t,
        rain_mm_h=rain,
        policy=policy,
        zone_coords=get_zone_coords(settings.zone_registry_path),
    )
    planning_inputs = {
        zone.zone_id: gap_inputs(
            zone,
            regime=planning_regime,
            conservative_gap_mode=hotspot_output.conservative_gap_mode,
        )
        for zone in forecast.zones
    }
    supply_after = {zone_id: supply for zone_id, (_, supply) in planning_inputs.items()}
    for move in result.moves:
        supply_after[move.from_zone] -= move.units_to_move
        supply_after[move.to_zone] += move.units_to_move
    metrics_before = system_metrics(
        planning_inputs.values()
    )
    metrics_after_relocation = system_metrics(
        (planning_inputs[zone.zone_id][0], supply_after[zone.zone_id]) for zone in forecast.zones
    )
    activation = recommend_activation(
        result.residual_gap,
        incentive_amount=policy.rules.incentive_base,
        incentive_budget_cap=policy.rules.incentive_budget_cap,
        overbooking_factor=policy.rules.overbooking_factor,
        assumed_accept_rate=policy.rules.assumed_accept_rate,
    )
    warnings = [*forecast_warnings, *result.warnings, {
        "code": "HYSTERESIS_STATE_UNAVAILABLE",
        "message": "Request đơn không có lịch sử hysteresis; hotspot dùng điều kiện thô.",
    }]
    return {
        "snapshot_id": request.snapshot_id,
        "data_source": request.data_source,
        "forecast_mode": forecast_mode,
        "data_provenance": {
            "observation_source": request.data_source,
            "forecast_feature_source": (
                "derived_from_verified_snapshot_test.parquet"
                if forecast_mode == "trained_model_replay"
                else "request.zones"
            ),
            "replay_source_at": request.replay_source_at.isoformat() if request.replay_source_at else None,
            "replay_snapshot_verified": request.replay_source_at is not None,
            "source_kind": (
                dataset_status()["provenance"]["source_kind"]
                if request.replay_source_at is not None
                else "caller_supplied_observation"
            ),
        },
        "activation_policy": {
            "incentive_amount": policy.rules.incentive_base,
            "incentive_budget_cap": policy.rules.incentive_budget_cap,
            "overbooking_factor": policy.rules.overbooking_factor,
            "assumed_accept_rate": policy.rules.assumed_accept_rate,
            "offer_ttl_minutes": policy.rules.offer_ttl_minutes,
        },
        "activation_recommendation": {
            "strategy": "residual_gap_desc_budget_constrained",
            "target_zones": [target.__dict__ for target in activation.target_zones],
            "total_requested_offers": activation.total_requested_offers,
            "total_expected_units_gained": activation.total_expected_units_gained,
            "total_expected_gap_remaining": activation.total_expected_gap_remaining,
            "projected_gap_reduction_pct": activation.projected_gap_reduction_pct,
            "worst_case_commitment": activation.worst_case_commitment,
            "constrained_by_budget": activation.constrained_by_budget,
            "accept_rate_source": "policy_assumption",
        },
        "forecast": forecast.model_dump(mode="json"),
        "hotspots": hotspot_output.model_dump(mode="json"),
        "simulation": {
            "metrics_before": metrics_before.__dict__,
            "metrics_after_relocation": metrics_after_relocation.__dict__,
            "basis": (
                f"forecast_{hotspot_output.conservative_gap_mode}_after_all_moves_arrive"
                if hotspot_output.conservative_gap_mode
                else "forecast_p50_after_all_moves_arrive"
            ),
        },
        "plan": {
            "moves": [move.model_dump(mode="json") for move in result.moves],
            "residual_gap": [gap.model_dump(mode="json") for gap in result.residual_gap],
            "plan_totals": result.plan_totals.model_dump(mode="json"),
            "relocation_targets": [
                {
                    "zone_id": target.zone_id,
                    "gap": target.gap,
                    "required_units": max(0, math.floor(target.gap + 0.5)),
                    "is_policy_hotspot": target.zone_id in policy_hotspot_ids,
                    "target_basis": hotspot_output.conservative_gap_mode or "p50",
                }
                for target in optimizer_output.hotspots
                if target.gap > 0
            ],
            "source_capacities": [
                {"zone_id": zone_id, "movable_units": units}
                for zone_id, units in result.source_capacities
            ],
            "warnings": warnings,
        },
    }
