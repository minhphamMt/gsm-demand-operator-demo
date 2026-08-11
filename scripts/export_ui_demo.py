"""Export a small forecast + hotspot scenario for the static UI demo.

Run:
    python scripts/export_ui_demo.py

Writes:
    frontend/demo-data.js
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.common.policy import DEFAULT_POLICY_PATH, load_policy  # noqa: E402
from src.forecasting import baseline_hist_avg as baseline  # noqa: E402
from src.forecasting import lgbm_quantile as lgbm  # noqa: E402
from src.forecasting.features import join_features_labels  # noqa: E402
from src.hotspot import detector  # noqa: E402
from src.hotspot.hysteresis import HysteresisState, initial_state  # noqa: E402

FEATURE_DIR = ROOT / "data" / "features"
LABEL_DIR = ROOT / "data" / "labels"
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
MODEL_DIR = ROOT / "data" / "models"
ZONE_REGISTRY_PATH = ROOT / "config" / "zone_registry.json"
OUTPUT_PATH = ROOT / "frontend" / "demo-data.js"

SCENARIO_T = pd.Timestamp("2026-09-26T17:45:00+07:00")
HORIZON_MIN = 15


def _load_scored() -> pd.DataFrame:
    features = pd.read_parquet(FEATURE_DIR / "features_test.parquet")
    labels = pd.read_parquet(LABEL_DIR / "labels_test.parquet")
    frame = join_features_labels(features, labels)
    models = lgbm.load_models(MODEL_DIR)
    predictions = lgbm.predict(models, frame)
    extra = predictions.drop(columns=[column for column in predictions.columns if column in frame.columns])
    return pd.concat([frame, extra], axis=1)


def _idle_supply_table() -> dict[pd.Timestamp, dict[int, int]]:
    snapshot = pd.read_parquet(SNAPSHOT_DIR / "snapshot_test.parquet", columns=["ts_bucket", "zone_id", "idle_supply"])
    table: dict[pd.Timestamp, dict[int, int]] = {}
    for t, group in snapshot.groupby("ts_bucket", sort=False):
        table[t] = {int(row.zone_id): int(row.idle_supply) for row in group.itertuples(index=False)}
    return table


def _forecast_for(group: pd.DataFrame, *, t: pd.Timestamp) -> object:
    regime = baseline.city_regime(group[f"rain_forecast_{HORIZON_MIN}"].tolist(), int(group["peak_flag"].iloc[0]))
    return baseline.build_forecast(
        group,
        t=t,
        horizon_min=HORIZON_MIN,
        model_version=lgbm.MODEL_VERSION,
        regime=regime,
    )


def _advance_to_scenario(
    scored: pd.DataFrame,
    *,
    idle_table: dict[pd.Timestamp, dict[int, int]],
    min_supply_per_zone: int,
    conservative_gap_mode: str,
) -> tuple[object, object, HysteresisState]:
    state = initial_state()
    scenario_forecast = None
    scenario_detection = None
    for t in sorted(scored["ts_bucket"].unique()):
        group = scored[scored["ts_bucket"] == t]
        forecast = _forecast_for(group, t=t)
        result = detector.detect(
            forecast,
            idle_supply_current=idle_table[t],
            min_supply_per_zone=min_supply_per_zone,
            conservative_gap_mode=conservative_gap_mode,
            state=state,
        )
        state = result.state
        if t == SCENARIO_T:
            scenario_forecast = forecast
            scenario_detection = result.output
            break
    if scenario_forecast is None or scenario_detection is None:
        raise ValueError(f"Scenario timestamp not found in test features: {SCENARIO_T.isoformat()}")
    return scenario_forecast, scenario_detection, state


def _project_zones(zones: list[dict]) -> dict[int, dict[str, float]]:
    min_lat = min(zone["lat"] for zone in zones)
    max_lat = max(zone["lat"] for zone in zones)
    min_lng = min(zone["lng"] for zone in zones)
    max_lng = max(zone["lng"] for zone in zones)
    width = max_lng - min_lng
    height = max_lat - min_lat
    projected = {}
    for zone in zones:
        x = 7 + ((zone["lng"] - min_lng) / width) * 86
        y = 7 + ((max_lat - zone["lat"]) / height) * 86
        projected[int(zone["zone_id"])] = {"x": round(x, 2), "y": round(y, 2)}
    return projected


def _round(value: float | int, digits: int = 2) -> float:
    return round(float(value), digits)


def build_payload() -> dict:
    policy = load_policy(DEFAULT_POLICY_PATH)
    scored = _load_scored()
    idle_table = _idle_supply_table()
    zones = json.loads(ZONE_REGISTRY_PATH.read_text(encoding="utf-8"))
    projected = _project_zones(zones)

    forecast, hot_output, _ = _advance_to_scenario(
        scored,
        idle_table=idle_table,
        min_supply_per_zone=policy.rules.min_supply_per_zone,
        conservative_gap_mode=policy.rules.conservative_gap_mode,
    )
    group = scored[scored["ts_bucket"] == SCENARIO_T].set_index("zone_id")
    hotspots = {item.zone_id: item for item in hot_output.hotspots}
    surplus = {item.zone_id: item for item in hot_output.surplus_zones}
    raw = detector.raw_conditions(
        forecast,
        min_supply_per_zone=policy.rules.min_supply_per_zone,
        conservative_gap_mode=policy.rules.conservative_gap_mode,
    )

    zone_payload = []
    for zone in forecast.zones:
        row = group.loc[zone.zone_id]
        gap = detector.gap_of(zone, regime=forecast.regime, conservative_gap_mode=policy.rules.conservative_gap_mode)
        severity = detector.severity_of(gap, zone.predicted_demand)
        zone_info = next(item for item in zones if int(item["zone_id"]) == zone.zone_id)
        actual_demand = float(row[f"target_demand_{HORIZON_MIN}"])
        actual_supply = float(row[f"target_supply_{HORIZON_MIN}"])
        is_hotspot = zone.zone_id in hotspots
        zone_payload.append(
            {
                "zoneId": zone.zone_id,
                "name": zone_info["zone_name"],
                "tier": zone_info["tier"],
                "x": projected[zone.zone_id]["x"],
                "y": projected[zone.zone_id]["y"],
                "rain": _round(row["rain_mm_h"]),
                "rainForecast15": _round(row["rain_forecast_15"]),
                "peak": bool(row["peak_flag"]),
                "idleCurrent": int(idle_table[SCENARIO_T][zone.zone_id]),
                "demandP10": _round(zone.demand_p10),
                "demandP50": _round(zone.predicted_demand),
                "demandP90": _round(zone.demand_p90),
                "supplyP10": _round(zone.supply_p10),
                "supplyP50": _round(zone.predicted_supply),
                "supplyP90": _round(zone.supply_p90),
                "actualDemand": int(actual_demand),
                "actualSupply": int(actual_supply),
                "gap": _round(gap),
                "severity": _round(severity, 3),
                "rawHotspot": bool(raw[zone.zone_id]),
                "isHotspot": is_hotspot,
                "isSurplus": zone.zone_id in surplus,
                "surplus": _round(surplus[zone.zone_id].surplus) if zone.zone_id in surplus else 0,
            }
        )

    zone_payload.sort(key=lambda item: item["zoneId"])
    hotspots_sorted = sorted((item for item in zone_payload if item["isHotspot"]), key=lambda item: item["severity"], reverse=True)
    surplus_sorted = sorted((item for item in zone_payload if item["isSurplus"]), key=lambda item: item["surplus"], reverse=True)
    return {
        "scenario": {
            "t0": SCENARIO_T.isoformat(),
            "forecastTs": forecast.forecast_ts.isoformat(),
            "horizonMin": HORIZON_MIN,
            "regime": forecast.regime,
            "modelVersion": lgbm.MODEL_VERSION,
            "gapMode": policy.rules.conservative_gap_mode,
            "minSupplyPerZone": policy.rules.min_supply_per_zone,
            "enterSteps": 2,
            "exitSteps": 3,
        },
        "summary": {
            "zones": len(zone_payload),
            "hotspots": len(hotspots_sorted),
            "rawHotspots": sum(1 for item in zone_payload if item["rawHotspot"]),
            "surplusZones": len(surplus_sorted),
            "totalGap": _round(sum(max(0, item["gap"]) for item in zone_payload)),
            "avgDemandP50": _round(sum(item["demandP50"] for item in zone_payload) / len(zone_payload)),
            "avgSupplyP50": _round(sum(item["supplyP50"] for item in zone_payload) / len(zone_payload)),
        },
        "zones": zone_payload,
        "topHotspots": hotspots_sorted[:8],
        "topSurplus": surplus_sorted[:8],
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    payload = build_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        "window.__HOTSPOT_DEMO__ = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT).as_posix()}")
    print(
        f"{payload['scenario']['t0']} -> {payload['scenario']['forecastTs']} | "
        f"{payload['summary']['hotspots']} hotspots | {payload['summary']['surplusZones']} surplus zones"
    )
