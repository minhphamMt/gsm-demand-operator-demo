"""T1: train Model 1, chấm điểm trên test set đóng băng, backtest walk-forward, ablation.

Chạy: python train_forecast.py

Đọc:
  data/features/features_{train,test}.parquet + data/labels/labels_{train,test}.parquet
                                          (sinh bởi build_features.py)
  data/splits.yaml                        (cửa sổ train + 3 fold walk-forward)

Ghi:
  data/models/lgbm_*.txt                  18 booster (h5/h10/h15)
  data/models/model_manifest.json         model_version + seed + danh sách feature
  eval/results/model1_forecast_report.json   ma trận 16 ô + backtest + ablation

Bốn acceptance criteria của T1 được TÍNH ở đây, không phải khẳng định suông:

* AC #3 — `p10 ≤ p50 ≤ p90` 100% dòng. Báo cáo cả tỷ lệ crossing TRƯỚC khi sắp lại.
* AC #4 — MAPE < 15% ở h15 demand trên toàn bộ test set, kèm bảng tách 4 regime.
* AC #5 — thắng baseline historical average ≥ 20% relative ở `rain_peak`.
* AC #6 — walk-forward 3 fold theo splits.yaml + ablation ba feature tương tác.

Test set `data/snapshots/snapshot_test.parquet` KHÔNG được dùng để train hay tune: bảng
tra baseline và 18 booster đều chỉ nhìn cửa sổ train, và ba fold walk-forward nằm trọn
trong cửa sổ train (splits.yaml). Đây là ràng buộc I-08.
"""

import hashlib
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from shutil import copy2

import pandas as pd
import yaml

from src.forecasting import baseline_hist_avg as baseline
from src.forecasting import lgbm_quantile as lgbm
from src.forecasting.baseline_hist_avg import HORIZONS, QUANTILES, TARGETS
from src.forecasting.features import (
    FEATURE_COLUMNS,
    INTERACTION_FEATURES,
    KEY_COLUMNS,
    join_features_labels,
)

SPLITS_PATH = Path("data/splits.yaml")
FEATURE_DIR = Path("data/features")
LABEL_DIR = Path("data/labels")
MODEL_DIR = Path("data/models")
REPORT_PATH = Path("eval/results/model1_forecast_report.json")
RUNS_DIR = Path("runs")
MODEL_MANIFEST_PATH = MODEL_DIR / "model_manifest.json"
FEATURE_BUILD_MANIFEST_PATH = FEATURE_DIR / "build_manifest.json"

# AC #4 và AC #5 — ngưỡng của chính task, không phải ngưỡng nghiệp vụ, nên không nằm ở
# policy.yaml (19 key ở đó là ngưỡng vận hành: hotspot, budget, incentive...).
MAPE_TARGET_H15_DEMAND = 0.15
BASELINE_GAIN_TARGET = 0.20


def file_sha256(path: Path) -> str:
    """Checksum artifact để runtime phát hiện model/file provenance bị lệch."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_split(split: str) -> pd.DataFrame:
    """A2 ⋈ A3 của một split, join 1-1 theo (zone_id, ts_bucket)."""
    features = pd.read_parquet(FEATURE_DIR / f"features_{split}.parquet")
    labels = pd.read_parquet(LABEL_DIR / f"labels_{split}.parquet")
    return join_features_labels(features, labels)


def attach(frame: pd.DataFrame, predictions: pd.DataFrame) -> pd.DataFrame:
    """Ghép cột `pred_*` vào frame nhãn. Hai bên cùng thứ tự dòng và cùng index."""
    extra = predictions.drop(columns=[c for c in KEY_COLUMNS if c in predictions.columns])
    return pd.concat([frame, extra], axis=1)


def window(frame: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Cắt theo NGÀY, bao gồm cả `end` — splits.yaml khai ngày cuối là ngày thuộc dải."""
    day = frame["ts_bucket"].dt.normalize().dt.tz_localize(None)
    return frame[(day >= pd.Timestamp(start)) & (day <= pd.Timestamp(end))]


def score_matrix(frame: pd.DataFrame) -> dict[str, dict[str, dict[str, float]]]:
    """Ma trận §8: 2 target × 2 horizon × (overall + 4 regime)."""
    return {
        f"{target}_h{horizon}": {
            name: asdict(cell) for name, cell in baseline.score_forecast(frame, target=target, horizon=horizon).items()
        }
        for target in TARGETS
        for horizon in HORIZONS
    }


def relative_gain(model: dict[str, dict[str, dict[str, float]]], base: dict[str, dict[str, dict[str, float]]]) -> dict:
    """(baseline − model) / baseline cho MAPE và MAE. Dương = model tốt hơn."""
    out: dict[str, dict[str, dict[str, float]]] = {}
    for cell_key, cells in model.items():
        out[cell_key] = {}
        for regime, values in cells.items():
            reference = base[cell_key][regime]
            out[cell_key][regime] = {metric: _gain(reference[metric], values[metric]) for metric in ("mape", "mae")}
    return out


def _gain(reference: float, value: float) -> float:
    if not reference or reference != reference:  # 0 hoặc NaN
        return float("nan")
    return round((reference - value) / reference, 6)


def fit_and_score(
    train: pd.DataFrame,
    test: pd.DataFrame,
    *,
    keys: tuple[lgbm.ModelKey, ...],
    feature_names: tuple[str, ...] = FEATURE_COLUMNS,
    progress: bool = False,
) -> tuple[dict, dict[lgbm.ModelKey, object]]:
    """Train trên `train`, chấm trên `test`. Dùng chung cho backtest và ablation."""
    models = lgbm.train_models(train, keys=keys, feature_names=feature_names, progress=progress)
    predictions = lgbm.predict(models, test, feature_names=feature_names)
    return score_matrix(attach(test, predictions)), models  # type: ignore[return-value]


def p50_keys() -> tuple[lgbm.ModelKey, ...]:
    """4 booster p50 — đủ cho MAPE/MAE, bỏ khoảng p10/p90 để backtest chạy trong vài phút."""
    return lgbm.all_model_keys(quantiles=(50,))


def walk_forward(train: pd.DataFrame, folds: list[dict]) -> list[dict]:
    """Backtest trượt theo thời gian, KHÔNG shuffle (splits.yaml `note`).

    Mỗi fold train lại từ đầu trên cửa sổ của fold đó và so với baseline dựng trên đúng
    cửa sổ ấy — so với baseline dựng trên toàn bộ train thì baseline được nhìn tương lai
    của fold, và con số "thắng bao nhiêu %" thành vô nghĩa.
    """
    results = []
    for fold in folds:
        print(
            f"\nWalk-forward fold {fold['fold']}: train {fold['train_start']}..{fold['train_end']} -> test {fold['test_start']}..{fold['test_end']}",
            flush=True,
        )
        fold_train = window(train, fold["train_start"], fold["train_end"])
        fold_test = window(train, fold["test_start"], fold["test_end"])
        model_scores, _ = fit_and_score(fold_train, fold_test, keys=p50_keys(), progress=True)

        lookup = baseline.build_lookup(
            fold_train,
            train_start=pd.Timestamp(fold["train_start"]),
            train_end=pd.Timestamp(fold["train_end"]),
        )
        base_scores = score_matrix(attach(fold_test, baseline.predict(lookup, fold_test)))

        results.append(
            {
                "fold": fold["fold"],
                "train": [fold["train_start"], fold["train_end"]],
                "test": [fold["test_start"], fold["test_end"]],
                "n_train_rows": int(len(fold_train)),
                "n_test_rows": int(len(fold_test)),
                "model": model_scores,
                "baseline": base_scores,
                "gain_vs_baseline": relative_gain(model_scores, base_scores),
            }
        )
    return results


def ablation(train: pd.DataFrame, test: pd.DataFrame) -> dict:
    """Bỏ ba feature tương tác `rain × peak` rồi train lại — EVALUATION_PLAN §8 AC #5.

    Chỉ p50: câu hỏi của ablation là "ba feature này có làm dự báo điểm chính xác hơn
    không", không phải câu hỏi về hiệu chỉnh khoảng.
    """
    reduced = tuple(name for name in FEATURE_COLUMNS if name not in INTERACTION_FEATURES)
    print("\nAblation: train p50 with rain x peak interaction features", flush=True)
    with_scores, _ = fit_and_score(train, test, keys=p50_keys(), progress=True)
    print("\nAblation: train p50 without rain x peak interaction features", flush=True)
    without_scores, _ = fit_and_score(train, test, keys=p50_keys(), feature_names=reduced, progress=True)
    return {
        "removed_features": list(INTERACTION_FEATURES),
        "n_features_with": len(FEATURE_COLUMNS),
        "n_features_without": len(reduced),
        "with_interactions": with_scores,
        "without_interactions": without_scores,
        "gain_from_interactions": relative_gain(with_scores, without_scores),
    }


def hour_boundary_diagnostic(scored: pd.DataFrame, *, target: str = "demand", horizon: int = 15) -> dict:
    """Tách MAPE theo việc mốc dự báo có VƯỢT SANG GIỜ KẾ TIẾP hay không.

    Lý do phải đo: generator dùng `hourly_curve_demand` là hàm BẬC THANG theo giờ (nhảy
    0.80 → 1.55 → 1.75 → 1.15 quanh giờ cao điểm sáng). Với horizon 15 phút, 3 trong
    12 bước mỗi giờ có nhãn rơi sang giờ sau. Sau khi A2 có `bucket_in_hour`, metric này
    là kiểm chứng trực tiếp xem feature vị trí trong giờ đã xử lý được biên chuyển giờ chưa.
    """
    minute = scored["ts_bucket"].dt.minute
    crosses = (minute + horizon) >= 60
    return {
        "target": f"{target}_h{horizon}",
        "same_hour": asdict(baseline.score_forecast(scored[~crosses], target=target, horizon=horizon)["overall"]),
        "crosses_hour": asdict(baseline.score_forecast(scored[crosses], target=target, horizon=horizon)["overall"]),
    }


def acceptance(report: dict) -> dict:
    """Kết luận đạt/không đạt cho từng AC — số nào cũng phải trỏ ngược về ô đã tính."""
    test_model = report["frozen_test"]["model"]
    gain = report["frozen_test"]["gain_vs_baseline"]
    mape_h15_demand = test_model["demand_h15"]["overall"]["mape"]
    ac4_passed = mape_h15_demand < MAPE_TARGET_H15_DEMAND
    gain_rain_peak = gain["demand_h15"]["rain_peak"]["mape"]
    crossings = report["quantile_order"]["after_enforcement"]

    return {
        "ac3_quantile_order_100pct": {
            "passed": all(count == 0 for count in crossings.values()),
            "crossings_after_enforcement": crossings,
            "crossings_before_enforcement": report["quantile_order"]["before_enforcement"],
        },
        "ac4_mape_h15_demand_under_15pct": {
            "passed": ac4_passed,
            "value": round(mape_h15_demand, 6),
            "threshold": MAPE_TARGET_H15_DEMAND,
            "by_regime": {
                name: round(test_model["demand_h15"][name]["mape"], 6)
                for name in ("normal", "peak", "rain", "rain_peak")
            },
            "mape_same_hour": round(report["hour_boundary_diagnostic"]["same_hour"]["mape"], 6),
            "mape_crosses_hour": round(report["hour_boundary_diagnostic"]["crosses_hour"]["mape"], 6),
            "blocked_by": None
            if ac4_passed
            else (
                "AC #4 vẫn chưa đạt sau khi bổ sung bucket_in_hour vào A2. Cần so mape_same_hour và "
                "mape_crosses_hour để xác định lỗi còn tập trung ở biên chuyển giờ hay đã chuyển sang "
                "nguồn khác trước khi đề xuất thêm feature/tune model."
            ),
        },
        "ac5_beat_baseline_20pct_rain_peak": {
            "passed": gain_rain_peak >= BASELINE_GAIN_TARGET,
            "value": round(gain_rain_peak, 6),
            "threshold": BASELINE_GAIN_TARGET,
            "mae_gain": round(gain["demand_h15"]["rain_peak"]["mae"], 6),
            "overall_mape_gain": round(gain["demand_h15"]["overall"]["mape"], 6),
        },
        "coverage_p10_p90": {
            cell: round(values["overall"]["coverage_p10_p90"], 6) for cell, values in test_model.items()
        },
    }


def print_matrix(title: str, scores: dict) -> None:
    print(f"\n{title}")
    header = f"{'regime':<12}" + "".join(f"{cell:>22}" for cell in scores)
    print(header)
    for regime in ("overall", "normal", "peak", "rain", "rain_peak"):
        row = f"{regime:<12}"
        for cell in scores:
            values = scores[cell][regime]
            row += f"{values['mape']:>10.4f}{values['mae']:>12.4f}"
        print(row)
    print(f"{'':<12}" + "".join(f"{'MAPE':>10}{'MAE':>12}" for _ in scores))


def make_run_id(now: datetime) -> str:
    """Tên run ổn định, dễ sort theo thời gian và an toàn cho tên thư mục."""
    return now.strftime("%Y%m%d_%H%M%S")


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def append_run_index(run_dir: Path, report: dict) -> None:
    """Ghi một dòng JSONL để gom số liệu nhiều run mà không phải quét mọi report lớn."""
    acceptance = report["acceptance"]
    summary = {
        "run_id": report["run_id"],
        "trained_at": report["trained_at"],
        "model_version": report["model_version"],
        "n_features": len(report["feature_columns"]),
        "num_boost_round": report["num_boost_round"],
        "n_train_rows": report["n_train_rows"],
        "n_test_rows": report["n_test_rows"],
        "ac3_passed": acceptance["ac3_quantile_order_100pct"]["passed"],
        "ac4_passed": acceptance["ac4_mape_h15_demand_under_15pct"]["passed"],
        "ac4_mape_h15_demand": acceptance["ac4_mape_h15_demand_under_15pct"]["value"],
        "ac4_mape_same_hour": acceptance["ac4_mape_h15_demand_under_15pct"]["mape_same_hour"],
        "ac4_mape_crosses_hour": acceptance["ac4_mape_h15_demand_under_15pct"]["mape_crosses_hour"],
        "ac5_passed": acceptance["ac5_beat_baseline_20pct_rain_peak"]["passed"],
        "ac5_rain_peak_mape_gain": acceptance["ac5_beat_baseline_20pct_rain_peak"]["value"],
        "report_path": (run_dir / "eval" / "model1_forecast_report.json").as_posix(),
        "manifest_path": (run_dir / "models" / "model_manifest.json").as_posix(),
    }
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    with (RUNS_DIR / "index.jsonl").open("a", encoding="utf-8") as file:
        file.write(json.dumps(summary, ensure_ascii=False) + "\n")


def write_versioned_outputs(report: dict, model_manifest: dict) -> tuple[Path, Path]:
    """Ghi latest như cũ và lưu thêm bản version để so sánh nhiều lần train."""
    run_dir = RUNS_DIR / report["run_id"]
    run_model_dir = run_dir / "models"
    run_eval_dir = run_dir / "eval"
    versioned_artifacts = {}

    # Only archive artifacts produced by this run. A directory glob can silently
    # carry obsolete horizons (for example h30 after switching to h10) forward.
    for artifact_name, artifact_path in model_manifest["artifacts"].items():
        source = Path(artifact_path)
        run_model_dir.mkdir(parents=True, exist_ok=True)
        target = run_model_dir / source.name
        copy2(source, target)
        versioned_artifacts[artifact_name] = target.as_posix()

    report["versioned_artifacts"] = versioned_artifacts
    model_manifest["versioned_artifacts"] = versioned_artifacts
    if FEATURE_BUILD_MANIFEST_PATH.exists():
        run_data_dir = run_dir / "data"
        run_data_dir.mkdir(parents=True, exist_ok=True)
        feature_manifest_path = run_data_dir / "feature_build_manifest.json"
        copy2(FEATURE_BUILD_MANIFEST_PATH, feature_manifest_path)
        report["feature_build_manifest"] = FEATURE_BUILD_MANIFEST_PATH.as_posix()
        report["versioned_feature_build_manifest"] = feature_manifest_path.as_posix()

    write_json(MODEL_MANIFEST_PATH, model_manifest)
    write_json(run_model_dir / "model_manifest.json", model_manifest)
    write_json(REPORT_PATH, report)
    write_json(run_eval_dir / "model1_forecast_report.json", report)
    append_run_index(run_dir, report)
    return run_dir, run_eval_dir / "model1_forecast_report.json"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    trained_at = datetime.now(UTC).astimezone()
    run_id = make_run_id(trained_at)
    splits = yaml.safe_load(SPLITS_PATH.read_text(encoding="utf-8"))
    data_range = splits["data_range"]

    train = load_split("train")
    test = load_split("test")
    print(f"run_id {run_id}")
    print(f"train {len(train)} dòng · test {len(test)} dòng · {len(FEATURE_COLUMNS)} feature")

    # --- Baseline historical average: chỉ nhìn cửa sổ train (§5.14.2 bước 1) ---
    lookup = baseline.build_lookup(
        train,
        train_start=pd.Timestamp(data_range["train_start"]),
        train_end=pd.Timestamp(data_range["train_end"]),
    )
    base_predictions = baseline.predict(lookup, test)
    base_scored = attach(test, base_predictions)
    base_matrix = score_matrix(base_scored)

    # --- Model 1 thật: 18 booster cho ba horizon 5/10/15 ---
    print("\nTrain full quantile LightGBM models", flush=True)
    models = lgbm.train_models(train, progress=True)
    paths = lgbm.save_models(models, MODEL_DIR)

    raw = lgbm.predict(models, test, enforce_order=False)
    ordered = lgbm.predict(models, test)
    model_scored = attach(test, ordered)
    model_matrix = score_matrix(model_scored)

    report = {
        "task": "T1",
        "run_id": run_id,
        "model_version": lgbm.MODEL_VERSION,
        "baseline_version": baseline.MODEL_VERSION,
        "seed": lgbm.RANDOM_SEED,
        "num_boost_round": lgbm.NUM_BOOST_ROUND,
        "params": {k: v for k, v in lgbm.BASE_PARAMS.items() if k != "objective"},
        "feature_columns": list(FEATURE_COLUMNS),
        "quantiles": list(QUANTILES),
        "data_range": data_range,
        "n_train_rows": int(len(train)),
        "n_test_rows": int(len(test)),
        "quantile_order": {
            "before_enforcement": lgbm.count_quantile_crossings(raw),
            "after_enforcement": lgbm.count_quantile_crossings(ordered),
        },
        "baseline_fallback_rate": baseline.fallback_rate(base_predictions),
        "frozen_test": {
            "model": model_matrix,
            "baseline": base_matrix,
            "gain_vs_baseline": relative_gain(model_matrix, base_matrix),
        },
        "hour_boundary_diagnostic": hour_boundary_diagnostic(model_scored),
        "walk_forward": walk_forward(train, splits["walk_forward_folds"]),
        "ablation_rain_x_peak": ablation(train, test),
        "artifacts": paths,
        "trained_at": trained_at.isoformat(timespec="seconds"),
    }
    report["acceptance"] = acceptance(report)

    model_manifest = {
        "schema_version": 2,
        "bundle_id": f"{report['model_version']}-{report['run_id']}",
        "run_id": report["run_id"],
        "model_version": report["model_version"],
        "seed": report["seed"],
        "num_boost_round": report["num_boost_round"],
        "params": report["params"],
        "feature_columns": report["feature_columns"],
        "trained_on": [data_range["train_start"], data_range["train_end"]],
        "n_train_rows": report["n_train_rows"],
        "artifacts": paths,
        "artifact_sha256": {
            name: file_sha256(Path(path))
            for name, path in paths.items()
        },
        "training_data": {
            "source_kind": "hybrid_synthetic",
            "snapshot_generator_seed": 42,
            "rain_source": "NASA POWER 2025",
            "train_range": [data_range["train_start"], data_range["train_end"]],
            "features_train_sha256": file_sha256(FEATURE_DIR / "features_train.parquet"),
            "labels_train_sha256": file_sha256(LABEL_DIR / "labels_train.parquet"),
        },
        "trained_at": report["trained_at"],
    }
    run_dir, versioned_report_path = write_versioned_outputs(report, model_manifest)

    print_matrix("Model 1 (lgbm_quantile_v1) — test set đóng băng", model_matrix)
    print_matrix("Baseline historical average (hist_avg_v1)", base_matrix)
    print("\nAcceptance T1:")
    print(json.dumps(report["acceptance"], ensure_ascii=False, indent=2))
    print(
        "\nĐã lưu latest:"
        f"\n- {REPORT_PATH.as_posix()}"
        f"\n- {MODEL_MANIFEST_PATH.as_posix()}"
        "\nĐã lưu versioned run:"
        f"\n- {run_dir.as_posix()}"
        f"\n- {versioned_report_path.as_posix()}"
    )
