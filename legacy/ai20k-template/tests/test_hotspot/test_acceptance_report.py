"""Kiểm bằng chứng AC #2/#3/#4/#5/#6 của T2 — eval/results/model2_hotspot_report.json.

Năm tiêu chí này là SỐ ĐO TRÊN TEST SET ĐÓNG BĂNG (2004 step × 30 zone), không đo được
bằng fixture tổng hợp: recall so với ground truth A4 chỉ có nghĩa trên đúng bộ dữ liệu đó.
Bằng chứng do `python eval_hotspot.py` sinh ra và được commit (EVALUATION_PLAN §8); test ở
đây đọc lại file và kiểm hai thứ:

1.  **Báo cáo có đủ hình dạng bắt buộc** — 4 regime tách riêng ở MỌI ô, `rain_peak` không
    được giấu trong số tổng (CLAUDE.md §3 #6); đủ 2 horizon × 3 chế độ gap × 2 giai đoạn.
2.  **Kết luận AC khớp với số trong file** — tính lại từ tp/fp/fn chứ không tin dòng
    `"passed": true`.

Vì sao vẫn cần file này khi đã có unit test: `test_detector.py` chứng minh công thức ĐÚNG,
báo cáo chứng minh công thức đó ĐẠT NGƯỠNG trên dữ liệu thật. Thiếu vế nào cũng không kết
luận được T2 xong.

File không có nghĩa là bằng chứng của T2 đã mất, nên test ĐỎ chứ không skip.
"""

import json
from pathlib import Path
from typing import Any

import pytest

from src.common.policy import DEFAULT_POLICY_PATH, load_policy
from src.common.regime import REGIMES
from src.forecasting.lgbm_quantile import MODEL_VERSION
from src.hotspot.detector import GAP_RATIO_THRESHOLD, SEVERITY_EPSILON
from src.hotspot.hysteresis import ENTER_STEPS, EXIT_STEPS

REPORT_PATH = Path(__file__).resolve().parents[2] / "eval" / "results" / "model2_hotspot_report.json"

HORIZONS = ("h15", "h30")
GAP_MODES = ("p50_p50", "p90_p50", "p90_p10")
STAGES = ("raw", "hysteresis")
RECALL_TARGET = 0.80


@pytest.fixture(scope="module")
def report() -> dict[str, Any]:
    assert REPORT_PATH.exists(), f"Thiếu bằng chứng T2 tại {REPORT_PATH} — chạy `python eval_hotspot.py`"
    payload: dict[str, Any] = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    return payload


# --------------------------------------------------------------- truy vết được lần chạy


def test_bao_cao_gan_dung_task_va_model_version(report: dict[str, Any]) -> None:
    """§3.2 #4: mọi run gắn `model_version` — không có nó thì số trong file không truy ngược được."""
    assert report["task"] == "T2"
    assert report["model_version"] == MODEL_VERSION
    assert report["generated_at"]


def test_hang_so_cong_thuc_trong_bao_cao_khop_voi_code(report: dict[str, Any]) -> None:
    """Báo cáo ghi lại tham số đã chạy; lệch với code nghĩa là số cũ thuộc về một công thức khác."""
    formula = report["formula"]
    assert formula["gap_ratio_threshold"] == GAP_RATIO_THRESHOLD
    assert formula["severity_epsilon"] == SEVERITY_EPSILON
    assert formula["enter_steps"] == ENTER_STEPS
    assert formula["exit_steps"] == EXIT_STEPS


def test_nguong_trong_bao_cao_den_tu_policy_yaml(report: dict[str, Any]) -> None:
    """AC #6 — `min_supply_per_zone` và `conservative_gap_mode` phải là giá trị policy đang hiệu lực."""
    policy = load_policy(DEFAULT_POLICY_PATH)
    block = report["policy"]
    assert block["version"] == policy.version
    assert block["min_supply_per_zone"] == policy.rules.min_supply_per_zone
    assert block["conservative_gap_mode"] == policy.rules.conservative_gap_mode


def test_replay_phu_du_test_set(report: dict[str, Any]) -> None:
    """30 zone × số step = số dòng chấm điểm; lệch nghĩa là có step bị bỏ hoặc bị đếm hai lần."""
    assert report["n_zones"] == 30
    assert report["n_steps"] > 0
    assert report["n_rows_scored"] == report["n_steps"] * report["n_zones"]
    assert 0.0 < report["ground_truth"]["positive_rate_test"] < 1.0


# ------------------------------------------------------------------- hình dạng bảng metric


def test_moi_o_metric_tach_du_bon_regime(report: dict[str, Any]) -> None:
    """2 horizon × 3 chế độ × 2 giai đoạn, ô nào cũng đủ 4 regime — `rain_peak` không được gộp (§3 #6)."""
    for horizon in HORIZONS:
        for mode in GAP_MODES:
            for stage in STAGES:
                cell = report["detection"][horizon][mode][stage]
                assert set(cell) == {"overall", *REGIMES}, f"{horizon}/{mode}/{stage} thiếu regime"
                for regime in REGIMES:
                    assert cell[regime]["n_rows"] > 0, f"{horizon}/{mode}/{stage}/{regime} rỗng"


def test_bon_regime_cong_lai_dung_bang_so_tong(report: dict[str, Any]) -> None:
    """Số tổng phải là tổng của 4 regime — nếu không thì có dòng rơi ra ngoài mọi nhãn."""
    for horizon in HORIZONS:
        for mode in GAP_MODES:
            for stage in STAGES:
                cell = report["detection"][horizon][mode][stage]
                for key in ("tp", "fp", "fn", "tn", "n_rows"):
                    total = sum(cell[regime][key] for regime in REGIMES)
                    assert total == cell["overall"][key], f"{horizon}/{mode}/{stage}: {key} không khớp tổng"


def test_recall_precision_khop_voi_tp_fp_fn(report: dict[str, Any]) -> None:
    """Đọc lại số kết luận từ tp/fp/fn thay vì tin con số đã ghi sẵn."""
    for horizon in HORIZONS:
        for mode in GAP_MODES:
            for stage in STAGES:
                for scope in ("overall", *REGIMES):
                    cell = report["detection"][horizon][mode][stage][scope]
                    tp, fp, fn = cell["tp"], cell["fp"], cell["fn"]
                    assert cell["recall"] == pytest.approx(tp / (tp + fn), abs=1e-6)
                    assert cell["precision"] == pytest.approx(tp / (tp + fp), abs=1e-6)
                    assert cell["n_positive"] == tp + fn


# ------------------------------------------------------------------------------ kết luận AC


def test_ac2_hysteresis_giam_nhap_nhay_o_moi_o(report: dict[str, Any]) -> None:
    """AC #2 — không chỉ ở ô được báo cáo: 6 ô (horizon × chế độ) đều phải giảm."""
    block = report["acceptance"]["ac2_hysteresis_reduces_flicker"]
    assert block["passed"] is True
    assert block["enter_steps"] == ENTER_STEPS
    assert block["exit_steps"] == EXIT_STEPS
    assert block["hysteresis_transitions"] < block["raw_transitions"]

    for horizon in HORIZONS:
        for mode in GAP_MODES:
            cell = report["flicker"][horizon][mode]
            assert cell["hysteresis_transitions"] < cell["raw_transitions"], f"{horizon}/{mode} không giảm"
            expected = 1 - cell["hysteresis_transitions"] / cell["raw_transitions"]
            assert cell["reduction"] == pytest.approx(expected, abs=1e-6)


def test_ac3_recall_tong_dat_nguong_80_phan_tram(report: dict[str, Any]) -> None:
    """AC #3 — ngưỡng đặt trên recall TỔNG (SPEC §5.3, EVALUATION_PLAN §11 KPI #2)."""
    block = report["acceptance"]["ac3_recall_at_least_80pct"]
    assert block["threshold"] == RECALL_TARGET
    assert block["value"] >= RECALL_TARGET
    assert block["passed"] is True

    measured = block["measured_on"]
    cell = report["detection"][f"h{measured['horizon_min']}"][measured["gap_mode"]][measured["stage"]]
    assert block["value"] == pytest.approx(cell["overall"]["recall"], abs=1e-6)
    assert measured["gap_mode"] == report["policy"]["conservative_gap_mode"]


def test_ac3_bao_cao_tach_du_4_regime_va_khong_giau_o_yeu(report: dict[str, Any]) -> None:
    """AC #3 đòi BÁO CÁO tách 4 regime; regime dưới ngưỡng phải được nêu tên, không nuốt vào số tổng."""
    block = report["acceptance"]["ac3_recall_at_least_80pct"]
    assert set(block["by_regime"]) == set(REGIMES)

    measured = block["measured_on"]
    cell = report["detection"][f"h{measured['horizon_min']}"][measured["gap_mode"]][measured["stage"]]
    for regime in REGIMES:
        assert block["by_regime"][regime] == pytest.approx(cell[regime]["recall"], abs=1e-6)

    below = [regime for regime in REGIMES if block["by_regime"][regime] < RECALL_TARGET]
    assert block["regimes_below_threshold"] == sorted(below)


def test_ac3_rain_peak_khong_duoi_nguong(report: dict[str, Any]) -> None:
    """`rain_peak` là thước đo thành công chính (§3 #6) — recall ở đó tụt là hỏng chính đề tài."""
    block = report["acceptance"]["ac3_recall_at_least_80pct"]
    assert block["by_regime"]["rain_peak"] >= RECALL_TARGET


def test_ac4_ba_che_do_cho_ket_qua_khac_nhau_tren_rain_peak(report: dict[str, Any]) -> None:
    """AC #4 — "khác nhau" phải là khác ở tp/fp/fn, không phải khác vài số lẻ sau dấu phẩy."""
    block = report["acceptance"]["ac4_three_gap_modes_differ_on_rain_peak"]
    assert block["passed"] is True
    assert tuple(block["modes"]) == GAP_MODES
    assert block["n_distinct_outcomes"] == len(GAP_MODES)

    fingerprints = {mode: (cell["tp"], cell["fp"], cell["fn"]) for mode, cell in block["by_mode"].items()}
    assert len(set(fingerprints.values())) == len(GAP_MODES)

    # Thận trọng hơn ⇒ bắt nhiều hơn, đổi lại precision thấp hơn. Thứ tự ngược lại nghĩa là
    # chế độ bị áp nhầm chiều.
    recalls = [block["by_mode"][mode]["recall"] for mode in GAP_MODES]
    assert recalls == sorted(recalls)
    precisions = [block["by_mode"][mode]["precision"] for mode in GAP_MODES]
    assert precisions == sorted(precisions, reverse=True)


def test_ac5_idle_supply_current_den_tu_snapshot(report: dict[str, Any]) -> None:
    """AC #5 — mọi bản ghi khớp snapshot, VÀ có bản ghi lệch với số dự báo.

    Vế thứ hai mới là vế chứng minh: nếu hai nguồn tình cờ trùng nhau ở mọi dòng thì phép
    kiểm không phân biệt được "lấy đúng" với "lấy nhầm mà may".
    """
    block = report["acceptance"]["ac5_idle_supply_current_from_snapshot"]
    assert block["passed"] is True
    assert block["n_hotspot_records"] > 0
    assert block["n_equal_to_snapshot_idle_supply"] == block["n_hotspot_records"]
    assert block["n_differs_from_round_predicted_supply"] > 0
    assert block["source"].endswith(".parquet")


def test_ac6_che_do_doc_tu_policy_va_echo_dung_o_moi_output(report: dict[str, Any]) -> None:
    """AC #6 — không output nào echo sai chế độ đã dùng."""
    block = report["acceptance"]["ac6_conservative_gap_mode_from_policy_and_echoed"]
    assert block["passed"] is True
    assert block["n_outputs_with_wrong_echo"] == 0
    assert report["echo_mismatch"] == 0
    assert block["policy_value"] == report["policy"]["conservative_gap_mode"]


def test_bao_cao_do_kho_tung_regime_de_giai_thich_o_yeu(report: dict[str, Any]) -> None:
    """Regime nào dưới ngưỡng phải có số giải thích kèm, không để lại một con số trần.

    Hai chỉ số này phân biệt "model dự báo kém ở regime đó" với "regime đó toàn ca sát biên
    0.3", và chỉ cái thứ nhất mới là việc phải sửa ở Model 1.
    """
    difficulty = report["regime_difficulty"]["by_regime"]
    assert set(difficulty) == set(REGIMES)
    for regime in REGIMES:
        cell = difficulty[regime]
        assert cell["n_positive"] > 0
        assert 0.0 <= cell["share_positive_from_min_supply"] <= 1.0
        assert 0.0 <= cell["share_positive_near_ratio_threshold"] <= 1.0
