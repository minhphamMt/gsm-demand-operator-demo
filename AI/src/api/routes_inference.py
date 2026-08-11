"""HTTP boundary for live forecast, hotspot detection and relocation planning."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import Field, model_validator

from src.common.haversine import get_zone_coords
from src.common.policy import Policy, get_policy
from src.config import get_settings
from src.contracts import ContractModel, StepAlignedDatetime, ZoneId, ensure_full_zone_coverage
from src.contracts.forecast import Forecast, HorizonMin
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.forecasting.live_snapshot_baseline import forecast_from_live_zones
from src.hotspot.detector import gap_of, meets_condition, severity_of
from src.optimizer.greedy import solve

router = APIRouter(prefix="/api/v1", tags=["inference"])


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
    zones: tuple[LiveZoneInput, ...]

    @model_validator(mode="after")
    def validate_zone_coverage(self) -> "DecisionRequest":
        ensure_full_zone_coverage([zone.zone_id for zone in self.zones])
        return self


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
    forecast = forecast_from_live_zones(request.t, request.horizon_min, request.zones)
    hotspot_output = _detect_without_hidden_state(forecast, request, policy)
    rain = {zone.zone_id: zone.rain_mm_h for zone in request.zones}
    result = solve(
        hotspot_output,
        t=request.t,
        rain_mm_h=rain,
        policy=policy,
        zone_coords=get_zone_coords(settings.zone_registry_path),
    )
    artifacts = sorted(Path(settings.data_dir, "models").glob("*.txt"))
    warnings = list(result.warnings)
    if not artifacts:
        warnings.insert(0, {
            "code": "MODEL_ARTIFACT_MISSING",
            "message": "Không có artifact LightGBM; kết quả dùng baseline từ snapshot live.",
        })
    else:
        warnings.insert(0, {
            "code": "TRAINED_MODEL_NOT_WIRED",
            "message": "Đã thấy artifact nhưng endpoint live chưa có feature history để chạy LightGBM.",
        })
    warnings.append({
        "code": "HYSTERESIS_STATE_UNAVAILABLE",
        "message": "Request đơn không có lịch sử hysteresis; hotspot dùng điều kiện thô.",
    })
    return {
        "snapshot_id": request.snapshot_id,
        "data_source": request.data_source,
        "forecast_mode": "live_snapshot_baseline",
        "forecast": forecast.model_dump(mode="json"),
        "hotspots": hotspot_output.model_dump(mode="json"),
        "plan": {
            "moves": [move.model_dump(mode="json") for move in result.moves],
            "residual_gap": [gap.model_dump(mode="json") for gap in result.residual_gap],
            "plan_totals": result.plan_totals.model_dump(mode="json"),
            "warnings": warnings,
        },
    }
