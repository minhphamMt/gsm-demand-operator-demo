"""Read one complete 30-zone step from the frozen Parquet test dataset."""

from functools import lru_cache
from typing import Any

import pandas as pd

from src.common.regime import REGIMES, Regime, tag_regime
from src.config import get_settings

SNAPSHOT_COLUMNS = (
    "ts_bucket",
    "zone_id",
    "demand_observed",
    "idle_supply",
    "enroute_supply",
    "rain_mm_h",
    "rain_forecast_15",
    "rain_forecast_30",
    "peak_flag",
    "holiday_flag",
)


@lru_cache(maxsize=1)
def _dataset() -> pd.DataFrame:
    path = get_settings().data_dir / "snapshots" / "snapshot_test.parquet"
    if not path.is_file():
        raise FileNotFoundError(f"Frozen replay dataset is missing: {path}")
    frame = pd.read_parquet(path, columns=list(SNAPSHOT_COLUMNS))
    frame = frame.sort_values(["ts_bucket", "zone_id"]).reset_index(drop=True)
    counts = frame.groupby("ts_bucket")["zone_id"].nunique()
    if frame.empty or not counts.eq(30).all():
        raise ValueError("Every frozen replay step must contain exactly 30 unique zones")
    return frame


@lru_cache(maxsize=1)
def _inference_timestamps() -> frozenset[pd.Timestamp]:
    path = get_settings().data_dir / "features" / "features_test.parquet"
    if not path.is_file():
        raise FileNotFoundError(f"Frozen feature dataset is missing: {path}")
    values = pd.read_parquet(path, columns=["ts_bucket"])["ts_bucket"].drop_duplicates()
    return frozenset(pd.Timestamp(value) for value in values)


def dataset_status() -> dict[str, Any]:
    frame = _dataset()
    timestamps = frame["ts_bucket"].drop_duplicates().sort_values()
    inference_timestamps = sorted(_inference_timestamps())
    return {
        "dataset": "snapshot_test.parquet",
        "steps": int(len(timestamps)),
        "zones_per_step": 30,
        "first_source_at": timestamps.iloc[0].isoformat(),
        "last_source_at": timestamps.iloc[-1].isoformat(),
        "inference_ready_steps": len(inference_timestamps),
        "first_inference_source_at": inference_timestamps[0].isoformat(),
    }


def next_snapshot(after_source_at: pd.Timestamp | None, regime: Regime | None) -> dict[str, Any]:
    if regime is not None and regime not in REGIMES:
        raise ValueError(f"Unsupported regime: {regime}")
    frame = _dataset()
    inference_timestamps = _inference_timestamps()
    grouped = frame.groupby("ts_bucket", sort=True)
    candidates: list[tuple[pd.Timestamp, pd.DataFrame, Regime]] = []
    for timestamp, rows in grouped:
        source_at = pd.Timestamp(timestamp)
        if source_at not in inference_timestamps:
            continue
        if after_source_at is not None and source_at <= after_source_at:
            continue
        step_regime = tag_regime(float(rows["rain_mm_h"].max()), int(rows["peak_flag"].max()))
        if regime is None or step_regime == regime:
            candidates.append((source_at, rows, step_regime))
    if not candidates:
        raise LookupError("No later dataset snapshot matches the requested regime")

    source_at, rows, step_regime = candidates[0]
    zones = [
        {
            "zone_id": int(row.zone_id),
            "demand_observed": int(row.demand_observed),
            "idle_supply": int(row.idle_supply),
            "enroute_supply": int(row.enroute_supply),
            "rain_mm_h": float(row.rain_mm_h),
            "rain_forecast_15": float(row.rain_forecast_15),
            "rain_forecast_30": float(row.rain_forecast_30),
            "peak_flag": int(row.peak_flag),
            "holiday_flag": int(row.holiday_flag),
        }
        for row in rows.itertuples(index=False)
    ]
    return {
        **dataset_status(),
        "source_at": source_at.isoformat(),
        "regime": step_regime,
        "zones": zones,
    }
