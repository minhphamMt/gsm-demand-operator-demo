"""T2: chấm điểm Model 2 (hotspot detection) trên test set đóng băng.

Chạy: python eval_hotspot.py

Đọc:
  data/features/features_test.parquet + data/labels/labels_{train,test}.parquet
                                        (sinh bởi build_features.py)
  data/snapshots/snapshot_test.parquet  cột `idle_supply` — số xe rỗi THẬT tại `t` (AC #5)
  data/models/lgbm_*.txt                18 booster (h5/h10/h15) của Model 1
  config/policy.yaml                    min_supply_per_zone, conservative_gap_mode (AC #6)

Ghi:
  data/ground_truth/hotspot_gt_{train,test}.parquet   A4 — DATA_CONTRACT §3.3
  eval/results/model2_hotspot_report.json             recall/precision × 4 regime × 3 chế độ gap

Bốn acceptance criteria của T2 được TÍNH ở đây (AC #1 và phần luật của AC #2 nằm ở
tests/test_hotspot/, vì chúng là tính đúng của công thức chứ không phải số đo trên dữ liệu):

* AC #2 — chuỗi thật: đếm số lần đổi trạng thái trước/sau hysteresis trên toàn test set.
* AC #3 — recall ≥ 80% so với A4, tách 4 regime.
* AC #4 — ba chế độ gap chạy được và cho kết quả KHÁC NHAU ở `rain_peak`.
* AC #5 — `idle_supply_current` đến từ snapshot: đếm số bản ghi lệch với `predicted_supply`.
* AC #6 — `conservative_gap_mode` đọc từ policy và echo ra output.

A4 dựng trên NHÃN THỰC TẾ (A3), không dùng quantile: đổi `conservative_gap_mode` phải
không làm ground truth nhúc nhích, nếu không thì recall đang đo chính cấu hình của mình.
"""

import json
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from src.common.policy import DEFAULT_POLICY_PATH, load_policy
from src.forecasting import baseline_hist_avg as baseline
from src.forecasting import lgbm_quantile as lgbm
from src.forecasting.baseline_hist_avg import HORIZONS
from src.forecasting.features import join_features_labels
from src.hotspot import detector
from src.hotspot.detector import GAP_RATIO_THRESHOLD, SEVERITY_EPSILON, GapMode
from src.hotspot.hysteresis import ENTER_STEPS, EXIT_STEPS, count_transitions, initial_state

FEATURE_DIR = Path("data/features")
LABEL_DIR = Path("data/labels")
SNAPSHOT_DIR = Path("data/snapshots")
MODEL_DIR = Path("data/models")
GROUND_TRUTH_DIR = Path("data/ground_truth")
REPORT_PATH = Path("eval/results/model2_hotspot_report.json")

# Ngưỡng của chính task T2 (IMPLEMENTATION_PLAN AC #3), không phải ngưỡng vận hành —
# vì thế không nằm trong 19 key của policy.yaml.
RECALL_TARGET = 0.80

# Bề rộng dải "sát biên" khi giải thích độ khó của từng regime. Chỉ là tham số của phần
# CHẨN ĐOÁN, không tham gia vào bất kỳ quyết định nào của Model 2.
NEAR_BOUNDARY_BAND = 0.05

# Ba nhánh bắt buộc của AC #4. Khóa đặt theo CÔNG THỨC chứ không theo tên "thường/thận
# trọng": đọc lại báo cáo cũ sau vài tuần, `p50_p50` nói ngay nó tính bằng gì, còn
# "normal" thì dễ lẫn với regime `normal`.
GAP_MODES: dict[str, GapMode] = {"p50_p50": None, "p90_p50": "p90_p50", "p90_p10": "p90_p10"}

REGIMES_REPORTED = ("normal", "peak", "rain", "rain_peak")
STAGES = ("raw", "hysteresis")


def load_scored(models: dict) -> pd.DataFrame:
    """A2 ⋈ A3 của split test, kèm cột `pred_*` của 12 booster."""
    features = pd.read_parquet(FEATURE_DIR / "features_test.parquet")
    labels = pd.read_parquet(LABEL_DIR / "labels_test.parquet")
    frame = join_features_labels(features, labels)
    predictions = lgbm.predict(models, frame)
    extra = predictions.drop(columns=[c for c in predictions.columns if c in frame.columns])
    return pd.concat([frame, extra], axis=1)


def build_ground_truth(labels: pd.DataFrame, *, min_supply_per_zone: int) -> pd.DataFrame:
    """A4 — nhãn hotspot THỰC TẾ cho mỗi (zone, ts_bucket, horizon), DATA_CONTRACT §3.3.

    Chạy đúng vị từ §4.3 nhưng trên `target_*` của A3, tức số quan sát được ở `t + horizon`.
    """
    blocks = []
    for horizon in HORIZONS:
        demand = labels[baseline.target_column("demand", horizon)].to_numpy(dtype="float64")
        supply = labels[baseline.target_column("supply", horizon)].to_numpy(dtype="float64")
        blocks.append(
            pd.DataFrame(
                {
                    "zone_id": labels["zone_id"].to_numpy(),
                    "ts_bucket": labels["ts_bucket"].to_numpy(),
                    "horizon_min": horizon,
                    "forecast_ts": labels["ts_bucket"] + pd.Timedelta(minutes=horizon),
                    "actual_demand": demand,
                    "actual_supply": supply,
                    "gap_actual": demand - supply,
                    "is_hotspot_gt": [
                        detector.ground_truth_flag(
                            actual_demand=float(d),
                            actual_supply=float(s),
                            min_supply_per_zone=min_supply_per_zone,
                        )
                        for d, s in zip(demand, supply, strict=True)
                    ],
                    "regime": labels[f"regime_{horizon}"].to_numpy(),
                }
            )
        )
    return pd.concat(blocks, ignore_index=True)


def index_ground_truth(
    ground_truth: pd.DataFrame,
) -> tuple[dict[tuple[int, pd.Timestamp], dict[int, bool]], dict[tuple[int, pd.Timestamp], dict[int, str]]]:
    """A4 → tra cứu {(horizon, t): {zone: nhãn}} và {(horizon, t): {zone: regime}}.

    Khóa theo `ts_bucket` (= `t`) chứ không theo `forecast_ts`: một zone có hai nhãn khác
    nhau tại cùng `forecast_ts` nếu đến từ hai horizon, và ghép nhầm cặp làm recall sai mà
    không có dấu hiệu gì lộ ra.
    """
    flags: dict[tuple[int, pd.Timestamp], dict[int, bool]] = defaultdict(dict)
    regimes: dict[tuple[int, pd.Timestamp], dict[int, str]] = defaultdict(dict)
    for horizon, t, zone_id, flag, regime in zip(
        ground_truth["horizon_min"],
        ground_truth["ts_bucket"],
        ground_truth["zone_id"],
        ground_truth["is_hotspot_gt"],
        ground_truth["regime"],
        strict=True,
    ):
        flags[(int(horizon), t)][int(zone_id)] = bool(flag)
        regimes[(int(horizon), t)][int(zone_id)] = str(regime)
    return dict(flags), dict(regimes)


def snapshot_idle_supply(path: Path) -> dict[pd.Timestamp, dict[int, int]]:
    """`idle_supply` thật tại từng `t` — nguồn DUY NHẤT của `idle_supply_current` (AC #5)."""
    snapshot = pd.read_parquet(path, columns=["ts_bucket", "zone_id", "idle_supply"])
    table: dict[pd.Timestamp, dict[int, int]] = defaultdict(dict)
    for t, zone_id, idle in zip(snapshot["ts_bucket"], snapshot["zone_id"], snapshot["idle_supply"], strict=True):
        table[t][int(zone_id)] = int(idle)
    return dict(table)


def new_counters() -> dict[str, int]:
    return {"tp": 0, "fp": 0, "fn": 0, "tn": 0}


def update(counters: dict[str, int], *, predicted: bool, actual: bool) -> None:
    if predicted and actual:
        counters["tp"] += 1
    elif predicted:
        counters["fp"] += 1
    elif actual:
        counters["fn"] += 1
    else:
        counters["tn"] += 1


def summarize(counters: dict[str, int]) -> dict[str, float | int]:
    """tp/fp/fn/tn → recall, precision, f1 và mật độ nhãn dương.

    Mẫu số 0 trả `nan` chứ không trả 0: "không có ca dương nào để bắt" khác hẳn "bỏ lỡ
    hết", gộp hai thứ đó vào cùng một số 0 là tự làm hỏng bảng KPI.
    """
    tp, fp, fn, tn = counters["tp"], counters["fp"], counters["fn"], counters["tn"]
    recall = tp / (tp + fn) if (tp + fn) else float("nan")
    precision = tp / (tp + fp) if (tp + fp) else float("nan")
    f1 = 2 * precision * recall / (precision + recall) if (tp and precision + recall) else float("nan")
    total = tp + fp + fn + tn
    return {
        **counters,
        "n_rows": total,
        "n_positive": tp + fn,
        "positive_rate": round((tp + fn) / total, 6) if total else float("nan"),
        "recall": round(recall, 6),
        "precision": round(precision, 6),
        "f1": round(f1, 6),
    }


def run_detection(
    scored: pd.DataFrame,
    *,
    idle_table: dict[pd.Timestamp, dict[int, int]],
    gt_flags: dict[tuple[int, pd.Timestamp], dict[int, bool]],
    gt_regimes: dict[tuple[int, pd.Timestamp], dict[int, str]],
    min_supply_per_zone: int,
    policy_mode: str,
) -> dict:
    """Chạy replay tuần tự toàn bộ test set × 3 horizon × 3 chế độ gap.

    Tuần tự theo thời gian là bắt buộc: hysteresis mang trạng thái từ step trước, xáo trộn
    thứ tự làm chuỗi streak vô nghĩa. Mỗi (horizon, chế độ) giữ trạng thái RIÊNG — dùng
    chung một trạng thái thì ba chế độ can thiệp lẫn nhau và AC #4 đo phải thứ khác.
    """
    steps = sorted(scored["ts_bucket"].unique())
    groups = {t: group for t, group in scored.groupby("ts_bucket", sort=False)}

    states = {(horizon, mode): initial_state() for horizon in HORIZONS for mode in GAP_MODES}
    counters: dict[tuple[int, str, str, str], dict[str, int]] = defaultdict(new_counters)
    sequences: dict[tuple[int, str, str, int], list[bool]] = defaultdict(list)
    overlap_zones = 0
    surplus_total = 0
    hotspot_records = 0
    idle_matches_snapshot = 0
    idle_differs_from_predicted_supply = 0
    echo_mismatch = 0

    for index, t in enumerate(steps):
        group = groups[t]
        idle_now = idle_table[t]
        for horizon in HORIZONS:
            rain_horizon = 15 if horizon <= 15 else 30
            regime = baseline.city_regime(
                group[f"rain_forecast_{rain_horizon}"].tolist(),
                int(group["peak_flag"].iloc[0]),
            )
            forecast = baseline.build_forecast(
                group,
                t=t,
                horizon_min=horizon,
                model_version=lgbm.MODEL_VERSION,
                regime=regime,
            )
            actual = gt_flags[(horizon, t)]
            zone_regimes = gt_regimes[(horizon, t)]
            supply_by_zone = {zone.zone_id: zone.predicted_supply for zone in forecast.zones}

            for mode_key, mode in GAP_MODES.items():
                raw = detector.raw_conditions(
                    forecast,
                    min_supply_per_zone=min_supply_per_zone,
                    conservative_gap_mode=mode,
                )
                result = detector.detect(
                    forecast,
                    idle_supply_current=idle_now,
                    min_supply_per_zone=min_supply_per_zone,
                    conservative_gap_mode=mode,
                    state=states[(horizon, mode_key)],
                )
                states[(horizon, mode_key)] = result.state
                decided = {item.zone_id for item in result.output.hotspots}

                if result.output.conservative_gap_mode != mode:
                    echo_mismatch += 1

                for zone_id, raw_flag in raw.items():
                    zone_regime = zone_regimes[zone_id]
                    truth = actual[zone_id]
                    for stage, predicted in (("raw", raw_flag), ("hysteresis", zone_id in decided)):
                        update(counters[(horizon, mode_key, stage, "overall")], predicted=predicted, actual=truth)
                        update(counters[(horizon, mode_key, stage, zone_regime)], predicted=predicted, actual=truth)
                        sequences[(horizon, mode_key, stage, zone_id)].append(predicted)

                # Bằng chứng AC #5 chỉ lấy ở cấu hình đang hiệu lực — đo trên cả ba chế độ
                # sẽ đếm cùng một sự thật ba lần và con số mất ý nghĩa.
                if mode_key == policy_mode and horizon == HORIZONS[0]:
                    surplus_total += len(result.output.surplus_zones)
                    overlap_zones += len(decided & {item.zone_id for item in result.output.surplus_zones})
                    for item in result.output.hotspots:
                        hotspot_records += 1
                        if item.idle_supply_current == idle_now[item.zone_id]:
                            idle_matches_snapshot += 1
                        if item.idle_supply_current != round(supply_by_zone[item.zone_id]):
                            idle_differs_from_predicted_supply += 1

        if index % 240 == 0:
            print(f"  step {index + 1}/{len(steps)} · {pd.Timestamp(t).isoformat()}", flush=True)

    return {
        "n_steps": len(steps),
        "detection": {
            f"h{horizon}": {
                mode_key: {
                    stage: {
                        scope: summarize(counters[(horizon, mode_key, stage, scope)])
                        for scope in ("overall", *REGIMES_REPORTED)
                    }
                    for stage in STAGES
                }
                for mode_key in GAP_MODES
            }
            for horizon in HORIZONS
        },
        "flicker": {
            f"h{horizon}": {mode_key: _flicker(sequences, horizon=horizon, mode_key=mode_key) for mode_key in GAP_MODES}
            for horizon in HORIZONS
        },
        "idle_supply_evidence": {
            "measured_on": {"horizon_min": HORIZONS[0], "gap_mode": policy_mode},
            "source": (SNAPSHOT_DIR / "snapshot_test.parquet").as_posix(),
            "n_hotspot_records": hotspot_records,
            "n_equal_to_snapshot_idle_supply": idle_matches_snapshot,
            "n_differs_from_round_predicted_supply": idle_differs_from_predicted_supply,
        },
        "surplus": {
            "measured_on": {"horizon_min": HORIZONS[0], "gap_mode": policy_mode},
            "n_surplus_records": surplus_total,
            "n_zone_in_both_lists": overlap_zones,
        },
        "echo_mismatch": echo_mismatch,
    }


def _flicker(sequences: dict[tuple[int, str, str, int], list[bool]], *, horizon: int, mode_key: str) -> dict:
    """Tổng số lần đổi trạng thái của 30 zone, trước và sau hysteresis — AC #2."""
    raw = sum(
        count_transitions(values)
        for (h, m, stage, _), values in sequences.items()
        if (h, m, stage) == (horizon, mode_key, "raw")
    )
    smoothed = sum(
        count_transitions(values)
        for (h, m, stage, _), values in sequences.items()
        if (h, m, stage) == (horizon, mode_key, "hysteresis")
    )
    return {
        "raw_transitions": raw,
        "hysteresis_transitions": smoothed,
        "reduction": round((raw - smoothed) / raw, 6) if raw else float("nan"),
    }


def mode_comparison(detection: dict, *, horizon: int, regime: str = "rain_peak") -> dict:
    """AC #4: ba chế độ phải cho kết quả KHÁC NHAU ở `rain_peak`.

    So bằng bộ (tp, fp, fn) chứ bằng recall thôi là chưa đủ: hai chế độ có thể trùng recall
    mà khác hẳn precision, và kết luận "khác nhau" khi đó vẫn đúng nhưng bằng chứng thì hụt.
    """
    cells = {mode_key: detection[f"h{horizon}"][mode_key]["hysteresis"][regime] for mode_key in GAP_MODES}
    fingerprints = {mode_key: (cell["tp"], cell["fp"], cell["fn"]) for mode_key, cell in cells.items()}
    return {
        "horizon_min": horizon,
        "regime": regime,
        "by_mode": {
            mode_key: {metric: cell[metric] for metric in ("tp", "fp", "fn", "recall", "precision")}
            for mode_key, cell in cells.items()
        },
        "all_modes_differ": len(set(fingerprints.values())) == len(fingerprints),
        "n_distinct_outcomes": len(set(fingerprints.values())),
    }


def regime_difficulty(ground_truth: pd.DataFrame, *, horizon: int, min_supply_per_zone: int) -> dict:
    """Vì sao bốn regime KHÔNG khó như nhau — đọc thẳng từ A4, không liên quan dự báo.

    Hai con số giải thích được chênh lệch recall giữa các regime:

    *   `share_positive_from_min_supply` — tỷ lệ nhãn dương đến từ vế `supply < min_supply`.
        Vế này gần như đếm được: zone vắng thì dự báo cũng thấy vắng.
    *   `share_positive_near_ratio_threshold` — tỷ lệ nhãn dương có tỷ lệ thiếu hụt thực tế
        nằm sát 0.3. Nhãn sát biên lật theo sai số dự báo nhỏ nhất, nên regime nào dồn nhãn
        vào đó thì recall thấp mà không phải do model tệ hơn ở đó.

    Không có số này, một ô recall thấp chỉ còn cách giải thích bằng phỏng đoán.
    """
    block = ground_truth[ground_truth["horizon_min"] == horizon]
    ratio = block["gap_actual"] / (block["actual_demand"] + SEVERITY_EPSILON)
    near = (ratio - GAP_RATIO_THRESHOLD).abs() < NEAR_BOUNDARY_BAND
    by_min_supply = block["actual_supply"] < min_supply_per_zone

    out = {}
    for regime in REGIMES_REPORTED:
        mask = block["regime"] == regime
        positive = mask & block["is_hotspot_gt"]
        n_positive = int(positive.sum())
        out[regime] = {
            "n_rows": int(mask.sum()),
            "n_positive": n_positive,
            "positive_rate": round(float(block.loc[mask, "is_hotspot_gt"].mean()), 6),
            "share_positive_from_min_supply": round(float((positive & by_min_supply).sum() / n_positive), 6)
            if n_positive
            else float("nan"),
            "share_positive_near_ratio_threshold": round(float((positive & near).sum() / n_positive), 6)
            if n_positive
            else float("nan"),
        }
    return {"horizon_min": horizon, "band": NEAR_BOUNDARY_BAND, "by_regime": out}


def acceptance(report: dict, *, policy_mode: str) -> dict:
    """Kết luận đạt/không đạt — mỗi số trỏ ngược về một ô đã tính ở trên."""
    detection = report["detection"]
    primary_horizon = HORIZONS[0]
    primary = detection[f"h{primary_horizon}"][policy_mode]["hysteresis"]
    flicker = report["flicker"][f"h{primary_horizon}"][policy_mode]
    idle = report["idle_supply_evidence"]
    comparison = report["mode_comparison_rain_peak"]

    recall_overall = primary["overall"]["recall"]
    by_regime = {name: primary[name]["recall"] for name in REGIMES_REPORTED}

    return {
        "ac1_formula_matches_spec_4_3": {
            "checked_by": "tests/test_hotspot/test_detector.py",
            "gap_ratio_threshold": GAP_RATIO_THRESHOLD,
            "severity_epsilon": SEVERITY_EPSILON,
            "min_supply_per_zone": report["policy"]["min_supply_per_zone"],
        },
        "ac2_hysteresis_reduces_flicker": {
            "passed": flicker["hysteresis_transitions"] < flicker["raw_transitions"],
            "raw_transitions": flicker["raw_transitions"],
            "hysteresis_transitions": flicker["hysteresis_transitions"],
            "reduction": flicker["reduction"],
            "enter_steps": ENTER_STEPS,
            "exit_steps": EXIT_STEPS,
            "rule_checked_by": "tests/test_hotspot/test_hysteresis.py",
        },
        "ac3_recall_at_least_80pct": {
            # Ngưỡng đặt trên recall TỔNG (SPEC §5.3, EVALUATION_PLAN §11 KPI #2); bảng
            # 4 regime là yêu cầu BÁO CÁO. Ô nào dưới ngưỡng vẫn phải hiện ra ở
            # `regimes_below_threshold` — §3 #6 cấm giấu regime trong số tổng, và giấu một
            # ô yếu cũng là giấu.
            "passed": recall_overall >= RECALL_TARGET,
            "value": recall_overall,
            "threshold": RECALL_TARGET,
            "measured_on": {"horizon_min": primary_horizon, "gap_mode": policy_mode, "stage": "hysteresis"},
            "by_regime": by_regime,
            "regimes_below_threshold": sorted(name for name, value in by_regime.items() if value < RECALL_TARGET),
            "recall_before_hysteresis": detection[f"h{primary_horizon}"][policy_mode]["raw"]["overall"]["recall"],
        },
        "ac4_three_gap_modes_differ_on_rain_peak": {
            "passed": comparison["all_modes_differ"],
            "modes": list(GAP_MODES),
            "n_distinct_outcomes": comparison["n_distinct_outcomes"],
            "by_mode": comparison["by_mode"],
        },
        "ac5_idle_supply_current_from_snapshot": {
            "passed": (
                idle["n_hotspot_records"] > 0
                and idle["n_equal_to_snapshot_idle_supply"] == idle["n_hotspot_records"]
                and idle["n_differs_from_round_predicted_supply"] > 0
            ),
            **{key: value for key, value in idle.items() if key != "measured_on"},
            "measured_on": idle["measured_on"],
            "checked_by": "tests/test_hotspot/test_detector.py",
        },
        "ac6_conservative_gap_mode_from_policy_and_echoed": {
            "passed": report["echo_mismatch"] == 0,
            "policy_value": report["policy"]["conservative_gap_mode"],
            "policy_source": DEFAULT_POLICY_PATH.name,
            "n_outputs_with_wrong_echo": report["echo_mismatch"],
        },
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def print_table(title: str, block: dict) -> None:
    print(f"\n{title}")
    print(f"{'regime':<12}{'recall':>10}{'precision':>12}{'tp':>8}{'fp':>8}{'fn':>8}")
    for scope in ("overall", *REGIMES_REPORTED):
        cell = block[scope]
        print(
            f"{scope:<12}{cell['recall']:>10.4f}{cell['precision']:>12.4f}{cell['tp']:>8}{cell['fp']:>8}{cell['fn']:>8}"
        )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    generated_at = datetime.now(UTC).astimezone()
    policy = load_policy(DEFAULT_POLICY_PATH)
    min_supply_per_zone = policy.rules.min_supply_per_zone
    policy_mode = policy.rules.conservative_gap_mode
    print(f"policy v{policy.version}: min_supply_per_zone={min_supply_per_zone} · gap_mode={policy_mode}")

    # A4 cho cả hai split: ground truth chỉ cần A3, không cần model.
    ground_truth_paths = {}
    ground_truth_test = pd.DataFrame()
    for split in ("train", "test"):
        labels = pd.read_parquet(LABEL_DIR / f"labels_{split}.parquet")
        table = build_ground_truth(labels, min_supply_per_zone=min_supply_per_zone)
        GROUND_TRUTH_DIR.mkdir(parents=True, exist_ok=True)
        path = GROUND_TRUTH_DIR / f"hotspot_gt_{split}.parquet"
        table.to_parquet(path, index=False)
        ground_truth_paths[split] = path.as_posix()
        print(f"A4 {split}: {len(table)} dòng · {int(table['is_hotspot_gt'].sum())} nhãn dương → {path.as_posix()}")
        if split == "test":
            ground_truth_test = table

    models = lgbm.load_models(MODEL_DIR)
    scored = load_scored(models)
    gt_flags, gt_regimes = index_ground_truth(ground_truth_test)
    idle_table = snapshot_idle_supply(SNAPSHOT_DIR / "snapshot_test.parquet")

    print(f"\nReplay {scored['ts_bucket'].nunique()} step × {len(HORIZONS)} horizon × {len(GAP_MODES)} chế độ gap")
    run = run_detection(
        scored,
        idle_table=idle_table,
        gt_flags=gt_flags,
        gt_regimes=gt_regimes,
        min_supply_per_zone=min_supply_per_zone,
        policy_mode=policy_mode,
    )

    report = {
        "task": "T2",
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "model_version": lgbm.MODEL_VERSION,
        "policy": {
            "version": policy.version,
            "frozen_at": policy.frozen_at,
            "min_supply_per_zone": min_supply_per_zone,
            "conservative_gap_mode": policy_mode,
        },
        "formula": {
            "gap_ratio_threshold": GAP_RATIO_THRESHOLD,
            "severity_epsilon": SEVERITY_EPSILON,
            "enter_steps": ENTER_STEPS,
            "exit_steps": EXIT_STEPS,
        },
        "ground_truth": {
            "paths": ground_truth_paths,
            "n_rows_test": int(len(ground_truth_test)),
            "positive_rate_test": round(float(ground_truth_test["is_hotspot_gt"].mean()), 6),
        },
        "n_zones": int(scored["zone_id"].nunique()),
        "n_rows_scored": int(len(scored)),
        **run,
    }
    report["mode_comparison_rain_peak"] = mode_comparison(report["detection"], horizon=HORIZONS[0])
    report["regime_difficulty"] = regime_difficulty(
        ground_truth_test,
        horizon=HORIZONS[0],
        min_supply_per_zone=min_supply_per_zone,
    )
    report["acceptance"] = acceptance(report, policy_mode=policy_mode)
    write_json(REPORT_PATH, report)

    for horizon in HORIZONS:
        print_table(
            f"Model 2 · h{horizon} · gap_mode={policy_mode} · sau hysteresis",
            report["detection"][f"h{horizon}"][policy_mode]["hysteresis"],
        )
    print("\nAcceptance T2:")
    print(json.dumps(report["acceptance"], ensure_ascii=False, indent=2))
    print(f"\nĐã lưu: {REPORT_PATH.as_posix()}")
