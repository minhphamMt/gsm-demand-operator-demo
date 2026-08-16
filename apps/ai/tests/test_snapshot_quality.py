import json
from pathlib import Path

import pandas as pd

from generate_snapshots import operational_quality

AI_DIR = Path(__file__).resolve().parents[1]


def load_snapshot_and_zones():
    snapshot = pd.read_parquet(AI_DIR / "data" / "snapshots" / "snapshot_test.parquet")
    with (AI_DIR / "config" / "zone_registry.json").open(encoding="utf-8") as stream:
        zones = json.load(stream)
    return snapshot, zones


def test_sample_snapshot_is_feasible_for_relocation():
    snapshot, zones = load_snapshot_and_zones()

    quality = operational_quality(snapshot, zones)

    assert quality["relocatable_peak_pct"] >= 0.70
    assert quality["top_demand_all_high"] is True


def test_long_bien_no_longer_outranks_the_dense_urban_core():
    snapshot, zones = load_snapshot_and_zones()
    names = {int(zone["zone_id"]): zone["zone_name"] for zone in zones}
    mean_demand = snapshot.groupby("zone_id")["demand_observed"].mean()
    by_name = {names[int(zone_id)]: value for zone_id, value in mean_demand.items()}

    assert by_name["Long Biên"] < by_name["Hai Bà Trưng"]
    assert by_name["Sơn Tây"] < by_name["Cầu Giấy"]


def test_default_replay_window_has_enough_citywide_surplus():
    snapshot, _ = load_snapshot_and_zones()
    current = snapshot[snapshot["ts_bucket"] == pd.Timestamp("2026-09-25T08:40:00+07:00")].copy()
    gap = current["demand_observed"] - current["idle_supply"]

    assert int((-gap).clip(lower=0).sum()) >= int(gap.clip(lower=0).sum())
