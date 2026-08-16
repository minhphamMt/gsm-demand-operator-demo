"""Kiểm bằng chứng AC #4/#5/#6 của T1 — eval/results/model1_forecast_report.json.

Ba tiêu chí này là SỐ ĐO TRÊN TEST SET ĐÓNG BĂNG, không đo được bằng unit test trên
fixture tổng hợp: đo lại trên dữ liệu khác là đo một bài toán khác. Bằng chứng do
`python train_forecast.py` sinh ra và được commit (EVALUATION_PLAN §8); test ở đây đọc lại
file đó và kiểm hai thứ:

1.  **Báo cáo có đủ hình dạng bắt buộc** — 4 regime tách riêng ở MỌI ô, `rain_peak` không
    được giấu trong số tổng (CLAUDE.md §3 #6); walk-forward có baseline theo từng fold;
    ablation `rain × peak` có mặt (AC #6).
2.  **Kết luận AC khớp với số trong file** — không phải đọc bằng mắt rồi tin.

File không có nghĩa là bằng chứng của T1 đã mất, nên test ĐỎ chứ không skip.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from src.common.regime import REGIMES
from src.forecasting.features import FEATURE_COLUMNS, INTERACTION_FEATURES
from src.forecasting.lgbm_quantile import MODEL_VERSION, RANDOM_SEED

REPORT_PATH = Path(__file__).resolve().parents[2] / "eval" / "results" / "model1_forecast_report.json"

CELLS = ("demand_h15", "demand_h30", "supply_h15", "supply_h30")
MAPE_TARGET_H15_DEMAND = 0.15
BASELINE_GAIN_TARGET = 0.20


@pytest.fixture(scope="module")
def report() -> dict[str, Any]:
    assert REPORT_PATH.exists(), f"Thiếu bằng chứng T1 tại {REPORT_PATH} — chạy `python train_forecast.py`"
    payload: dict[str, Any] = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return payload


# --------------------------------------------------------------- truy vết được lần chạy


def test_bao_cao_gan_dung_task_model_version_va_seed(report: dict[str, Any]) -> None:
    """§3.2 #4: mọi run gắn `model_version`; không có nó thì số trong file không truy ngược được."""
    assert report["task"] == "T1"
    assert report["model_version"] == MODEL_VERSION
    assert report["baseline_version"] == "hist_avg_v1"
    assert report["seed"] == RANDOM_SEED
    assert report["trained_at"]


def test_bao_cao_dung_bo_feature_da_chot(report: dict[str, Any]) -> None:
    """Bộ feature khác đi thì mọi số trong file thuộc về một model khác."""
    assert tuple(report["feature_columns"]) == FEATURE_COLUMNS
    assert report["quantiles"] == [10, 50, 90]


def test_du_12_artifact_booster(report: dict[str, Any]) -> None:
    assert len(report["artifacts"]) == 12


# --------------------------------------------------------------- hình dạng bảng metric


def test_moi_o_metric_tach_du_bon_regime_va_rain_peak_dung_rieng(report: dict[str, Any]) -> None:
    """4 regime × 2 horizon × 2 target — `rain_peak` là thước đo thành công chính (§3 #6)."""
    for source in ("model", "baseline"):
        scores = report["frozen_test"][source]
        assert tuple(scores) == CELLS
        for cell in CELLS:
            assert set(scores[cell]) == {"overall", *REGIMES}
            for regime in REGIMES:
                assert scores[cell][regime]["n_rows"] > 0, f"{source}/{cell}/{regime} rỗng"


def test_walk_forward_co_baseline_theo_tung_fold(report: dict[str, Any]) -> None:
    """AC #6: backtest walk-forward theo `splits.yaml`, và fold nào cũng phải có mốc so."""
    folds = report["walk_forward"]
    assert len(folds) >= 3
    for index, fold in enumerate(folds, start=1):
        assert fold["fold"] == index
        assert fold["n_train_rows"] > 0
        assert fold["n_test_rows"] > 0
        assert tuple(fold["model"]) == CELLS
        assert tuple(fold["baseline"]) == CELLS
        assert tuple(fold["gain_vs_baseline"]) == CELLS
    # Walk-forward: cửa sổ train nở dần, không xáo trộn thời gian.
    sizes = [fold["n_train_rows"] for fold in folds]
    assert sizes == sorted(sizes)


def test_ablation_bo_dung_ba_feature_tuong_tac(report: dict[str, Any]) -> None:
    """AC #6 đòi báo cáo được ablation `rain × peak` — đó là signal chính của đề tài."""
    ablation = report["ablation_rain_x_peak"]
    assert tuple(ablation["removed_features"]) == INTERACTION_FEATURES
    assert ablation["n_features_with"] - ablation["n_features_without"] == len(INTERACTION_FEATURES)
    for key in ("with_interactions", "without_interactions", "gain_from_interactions"):
        assert tuple(ablation[key]) == CELLS


# --------------------------------------------------------------- kết luận AC


def test_ac3_100_phan_tram_dong_dung_thu_tu_quantile(report: dict[str, Any]) -> None:
    """AC #3 — và crossing TRƯỚC khi ép phải > 0, nếu không thì phép ép chưa được kiểm."""
    block = report["acceptance"]["ac3_quantile_order_100pct"]
    assert block["passed"] is True
    assert set(block["crossings_after_enforcement"].values()) == {0}
    assert sum(block["crossings_before_enforcement"].values()) > 0


def test_ac5_thang_baseline_it_nhat_20_phan_tram_o_rain_peak(report: dict[str, Any]) -> None:
    """AC #5, EVALUATION_PLAN §8 đặt tiêu chí này ở regime `rain_peak`."""
    block = report["acceptance"]["ac5_beat_baseline_20pct_rain_peak"]
    assert block["threshold"] == BASELINE_GAIN_TARGET
    assert block["value"] >= BASELINE_GAIN_TARGET
    assert block["passed"] is True

    model = report["frozen_test"]["model"]["demand_h15"]["rain_peak"]["mape"]
    baseline = report["frozen_test"]["baseline"]["demand_h15"]["rain_peak"]["mape"]
    assert (baseline - model) / baseline == pytest.approx(block["value"], abs=1e-6)


def test_ac4_mape_h15_demand_duoi_15_phan_tram(report: dict[str, Any]) -> None:
    block = report["acceptance"]["ac4_mape_h15_demand_under_15pct"]
    assert block["value"] < MAPE_TARGET_H15_DEMAND


def test_ac4_van_bao_cao_du_so_theo_4_regime_va_khong_con_blocker_cu(report: dict[str, Any]) -> None:
    """AC #4 phải có đủ số và không còn blocker thiếu vị trí trong giờ sau khi thêm `bucket_in_hour`."""
    block = report["acceptance"]["ac4_mape_h15_demand_under_15pct"]
    assert block["threshold"] == MAPE_TARGET_H15_DEMAND
    assert set(block["by_regime"]) == set(REGIMES)
    assert "mape_crosses_hour" in block
    assert "mape_same_hour" in block
    assert block["blocked_by"] is None


def test_do_phu_p10_p90_duoc_bao_cao_cho_ca_bon_o(report: dict[str, Any]) -> None:
    """Khoảng p10–p90 là đầu vào của chế độ thận trọng ở `rain_peak` (§5.3), nên độ phủ phải có số."""
    coverage = report["acceptance"]["coverage_p10_p90"]
    assert tuple(coverage) == CELLS
    assert all(0.0 <= value <= 1.0 for value in coverage.values())
