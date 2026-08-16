"""Read verified 30-zone steps from the frozen hybrid-synthetic replay dataset."""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

import pandas as pd

from src.common.regime import REGIMES, Regime, tag_regime
from src.config import get_settings
from src.contracts import STEP_MINUTES, ZONE_COUNT, ZONE_ID_MAX, ZONE_ID_MIN
from src.forecasting.features import build_feature_table

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
def _dataset_manifest() -> dict[str, Any]:
    path = get_settings().replay_dataset_manifest_path
    if not path.is_file():
        raise FileNotFoundError(f"Replay dataset manifest is missing: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    required = {"dataset", "source_kind", "rows", "zones", "steps", "ts_start", "ts_end", "sha256"}
    missing = sorted(required - payload.keys())
    if missing:
        raise ValueError(f"Replay dataset manifest is missing fields: {missing}")
    return cast(dict[str, Any], payload)


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_dataset_frame(frame: pd.DataFrame, manifest: dict[str, Any]) -> None:
    expected_ids = tuple(range(ZONE_ID_MIN, ZONE_ID_MAX + 1))
    if int(manifest["zones"]) != ZONE_COUNT:
        raise ValueError(f"Replay manifest declares {manifest['zones']} zones; runtime contract requires {ZONE_COUNT}")
    if len(frame) != int(manifest["rows"]):
        raise ValueError(f"Replay dataset has {len(frame)} rows; manifest declares {manifest['rows']}")
    if frame.duplicated(["ts_bucket", "zone_id"]).any():
        raise ValueError("Replay dataset contains duplicate (ts_bucket, zone_id) rows")

    grouped_ids = frame.groupby("ts_bucket", sort=True)["zone_id"].agg(lambda values: tuple(sorted(values)))
    if len(grouped_ids) != int(manifest["steps"]):
        raise ValueError(f"Replay dataset has {len(grouped_ids)} steps; manifest declares {manifest['steps']}")
    invalid_steps = grouped_ids[grouped_ids.map(lambda zone_ids: zone_ids != expected_ids)]
    if not invalid_steps.empty:
        raise ValueError("Every replay step must contain exactly zone IDs 1..30 once")

    timestamps = pd.Series(grouped_ids.index).sort_values().reset_index(drop=True)
    if timestamps.empty:
        raise ValueError("Replay dataset is empty")
    if timestamps.iloc[0] != pd.Timestamp(manifest["ts_start"]):
        raise ValueError("Replay dataset start timestamp does not match its manifest")
    if timestamps.iloc[-1] != pd.Timestamp(manifest["ts_end"]):
        raise ValueError("Replay dataset end timestamp does not match its manifest")
    gaps = timestamps.diff().dropna()
    if not gaps.eq(pd.Timedelta(minutes=STEP_MINUTES)).all():
        raise ValueError(f"Replay timestamps must be contiguous {STEP_MINUTES}-minute buckets")


@lru_cache(maxsize=1)
def _dataset() -> pd.DataFrame:
    settings = get_settings()
    manifest = _dataset_manifest()
    path = settings.data_dir / "snapshots" / str(manifest["dataset"])
    if not path.is_file():
        raise FileNotFoundError(f"Frozen replay dataset is missing: {path}")
    actual_sha256 = _file_sha256(path)
    if actual_sha256 != str(manifest["sha256"]).lower():
        raise ValueError(
            f"Replay dataset checksum mismatch: expected {manifest['sha256']}, received {actual_sha256}"
        )
    frame = pd.read_parquet(path, columns=list(SNAPSHOT_COLUMNS))
    frame = frame.sort_values(["ts_bucket", "zone_id"]).reset_index(drop=True)
    _validate_dataset_frame(frame, manifest)
    return frame


@lru_cache(maxsize=1)
def replay_features() -> pd.DataFrame:
    """Derive inference features from the checksummed snapshot source of truth.

    Runtime no longer depends on an ignored, potentially stale ``features_test`` file.
    The same feature builder used during training is the only transformation path.
    """
    return build_feature_table(_dataset())


@lru_cache(maxsize=1)
def _inference_timestamps() -> frozenset[pd.Timestamp]:
    values = replay_features()["ts_bucket"].drop_duplicates()
    return frozenset(pd.Timestamp(value) for value in values)


def dataset_status() -> dict[str, Any]:
    frame = _dataset()
    manifest = _dataset_manifest()
    timestamps = frame["ts_bucket"].drop_duplicates().sort_values()
    inference_timestamps = sorted(_inference_timestamps())
    return {
        "dataset": manifest["dataset"],
        "steps": int(len(timestamps)),
        "zones_per_step": ZONE_COUNT,
        "first_source_at": timestamps.iloc[0].isoformat(),
        "last_source_at": timestamps.iloc[-1].isoformat(),
        "inference_ready_steps": len(inference_timestamps),
        "first_inference_source_at": inference_timestamps[0].isoformat(),
        "last_inference_source_at": inference_timestamps[-1].isoformat(),
        "provenance": {
            "source_kind": manifest["source_kind"],
            "generator": manifest.get("generator"),
            "seed": manifest.get("seed"),
            "seed_nowcast": manifest.get("seed_nowcast"),
            "sha256": manifest["sha256"],
            "field_provenance": manifest.get("field_provenance", {}),
        },
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


def snapshot_at(source_at: pd.Timestamp) -> dict[str, Any]:
    """Return the exact stored 5-minute bucket; never interpolate or synthesize rows at runtime."""
    frame = _dataset()
    if source_at not in _inference_timestamps():
        raise LookupError(f"Dataset has no inference-ready snapshot at {source_at.isoformat()}")
    rows = frame[frame["ts_bucket"] == source_at]
    if len(rows) != 30:
        raise LookupError(f"Dataset snapshot at {source_at.isoformat()} does not contain 30 zones")
    step_regime = tag_regime(float(rows["rain_mm_h"].max()), int(rows["peak_flag"].max()))
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
    return {**dataset_status(), "source_at": source_at.isoformat(), "regime": step_regime, "zones": zones}


def snapshot_window(center_at: pd.Timestamp, lookback_minutes: int = 120) -> list[dict[str, Any]]:
    """Return only observed buckets from the lookback window through ``center_at``.

    Replay is an observation reader, not an inference loop.  Keeping future
    buckets out of this response prevents the UI from presenting ground truth
    that would not yet be available at the live edge.
    """
    timestamps = sorted(_inference_timestamps())
    if center_at not in timestamps:
        raise LookupError(f"Dataset has no inference-ready snapshot at {center_at.isoformat()}")
    center_index = timestamps.index(center_at)
    lookback_steps = max(0, lookback_minutes // STEP_MINUTES)
    start = max(0, center_index - lookback_steps)
    selected = timestamps[start:center_index + 1]
    frame = _dataset()
    return [
        {
            "source_at": timestamp.isoformat(),
            "mean_rain_mm_h": float(frame.loc[frame["ts_bucket"] == timestamp, "rain_mm_h"].mean()),
        }
        for timestamp in selected
    ]
