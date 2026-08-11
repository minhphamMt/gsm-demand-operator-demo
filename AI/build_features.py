"""T1: sinh bảng feature A2 và bảng label A3 từ snapshot A1.

Chạy: python build_features.py

Đọc:
  data/snapshots/snapshot_train.parquet
  data/snapshots/snapshot_test.parquet
  data/splits.yaml                        (chỉ để đối chiếu dải ngày, không cắt lại)

Ghi:
  data/features/features_train.parquet    data/labels/labels_train.parquet
  data/features/features_test.parquet     data/labels/labels_test.parquet
  data/features/build_manifest.json

Script chỉ ĐIỀU PHỐI. Toàn bộ định nghĩa cột nằm ở src/forecasting/features.py — viết
lại phép lag/rolling ở đây là tạo ra bản thứ hai của A2, đúng cái bẫy §5.14.1 cấm.

Số dòng đầu ra ÍT HƠN snapshot là đúng: mỗi zone mất 6 bước đầu (chưa đủ lookback) ở A2
và 6 bước cuối (chưa đủ tương lai cho horizon 30) ở A3. Dòng thiếu bị loại, không điền 0
(Data-Contract A2/A3: "không có ô null").
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import yaml

from src.forecasting.features import (
    FEATURE_COLUMNS,
    KEY_COLUMNS,
    LABEL_REGIME_COLUMNS,
    TARGET_COLUMNS,
    build_feature_table,
    build_label_table,
    join_features_labels,
)

SPLITS_PATH = Path("data/splits.yaml")
SNAPSHOT_DIR = Path("data/snapshots")
FEATURE_DIR = Path("data/features")
LABEL_DIR = Path("data/labels")
MANIFEST_PATH = FEATURE_DIR / "build_manifest.json"

SPLITS = ("train", "test")


def build_split(split: str) -> dict[str, object]:
    """Sinh A2 + A3 cho một split và ghi ra đĩa; trả về phần manifest của split đó."""
    snapshot_path = SNAPSHOT_DIR / f"snapshot_{split}.parquet"
    snapshot = pd.read_parquet(snapshot_path)

    features = build_feature_table(snapshot)
    labels = build_label_table(snapshot)
    # Join ở đây chỉ để KIỂM bản số 1-1 và đếm dòng dùng được; hai bảng vẫn ghi riêng
    # đúng như Data-Contract mô tả (A2 và A3 là hai artifact).
    joined = join_features_labels(features, labels)

    FEATURE_DIR.mkdir(parents=True, exist_ok=True)
    LABEL_DIR.mkdir(parents=True, exist_ok=True)
    feature_path = FEATURE_DIR / f"features_{split}.parquet"
    label_path = LABEL_DIR / f"labels_{split}.parquet"
    features.to_parquet(feature_path, index=False)
    labels.to_parquet(label_path, index=False)

    return {
        "split": split,
        "source_snapshot": snapshot_path.as_posix(),
        "snapshot_rows": int(len(snapshot)),
        "feature_rows": int(len(features)),
        "label_rows": int(len(labels)),
        "joined_rows": int(len(joined)),
        "n_features": len(FEATURE_COLUMNS),
        "ts_min": joined["ts_bucket"].min().isoformat(),
        "ts_max": joined["ts_bucket"].max().isoformat(),
        "n_zones": int(joined["zone_id"].nunique()),
        "regime_counts": {
            column: {str(k): int(v) for k, v in joined[column].value_counts().items()}
            for column in LABEL_REGIME_COLUMNS
        },
        "n_zero_target": {name: int((joined[name] == 0).sum()) for name in TARGET_COLUMNS},
        "feature_path": feature_path.as_posix(),
        "label_path": label_path.as_posix(),
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    splits_config = yaml.safe_load(SPLITS_PATH.read_text(encoding="utf-8"))
    manifest: dict[str, object] = {
        "task": "T1",
        "data_range": splits_config["data_range"],
        "key_columns": list(KEY_COLUMNS),
        "feature_columns": list(FEATURE_COLUMNS),
        "target_columns": list(TARGET_COLUMNS),
        "splits": [build_split(split) for split in SPLITS],
        "built_at": datetime.now(UTC).astimezone().isoformat(timespec="seconds"),
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest["splits"], ensure_ascii=False, indent=2))
    print(f"\nĐã lưu manifest: {MANIFEST_PATH.as_posix()}")
