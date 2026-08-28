"""Forecast fallback driven by the live operational snapshot.

This is intentionally labelled as a baseline, never as the trained LightGBM model.
It lets Model 2 and Model 3 run on caller-supplied observations while trained artifacts
are unavailable. It deliberately excludes aggregate en-route supply because the live
contract does not carry arrival timestamps; counting it immediately would teleport cars.
"""

import math
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Protocol

from src.common.regime import tag_regime
from src.contracts.forecast import Forecast, ZoneForecast

MODEL_VERSION = "live_snapshot_baseline_v1"


class LiveZone(Protocol):
    @property
    def zone_id(self) -> int: ...

    @property
    def demand_observed(self) -> int: ...

    @property
    def idle_supply(self) -> int: ...

    @property
    def enroute_supply(self) -> int: ...

    @property
    def rain_forecast_15(self) -> float: ...

    @property
    def rain_forecast_30(self) -> float: ...

    @property
    def peak_flag(self) -> int: ...


def forecast_from_live_zones(
    t: datetime,
    horizon_min: int,
    zones: Sequence[LiveZone],
) -> Forecast:
    """Build an auditable no-growth baseline from current observations.

    The trained target is future ``idle_supply``. ``enroute_supply`` cannot be added
    safely without per-arrival ETA, which this reduced live contract does not provide.
    """
    forecast_zones: list[ZoneForecast] = []
    for zone in zones:
        demand = float(zone.demand_observed)
        supply = float(zone.idle_supply)
        demand_spread = math.sqrt(max(demand, 0.0))
        supply_spread = math.sqrt(max(supply, 0.0))
        forecast_zones.append(
            ZoneForecast(
                zone_id=zone.zone_id,
                predicted_demand=demand,
                predicted_supply=supply,
                demand_p10=max(0.0, demand - demand_spread),
                demand_p90=demand + demand_spread,
                supply_p10=max(0.0, supply - supply_spread),
                supply_p90=supply + supply_spread,
                confidence=None,
            )
        )

    rain_values = [zone.rain_forecast_15 if horizon_min <= 15 else zone.rain_forecast_30 for zone in zones]
    rain = sum(rain_values) / len(rain_values)
    peak = max(zone.peak_flag for zone in zones)
    return Forecast(
        t=t,
        horizon_min=horizon_min,
        forecast_ts=t + timedelta(minutes=horizon_min),
        zones=tuple(forecast_zones),
        model_version=MODEL_VERSION,
        regime=tag_regime(rain, peak),
    )
