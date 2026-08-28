"""Bảng nhận ý định — đường đỡ khi LLM hỏng.

Test đắt nhất ở đây là `test_lenh_cham_cong_phe_duyet_luon_bi_chan`: nó khẳng định rằng
không câu tiếng Việt nào — có dấu, không dấu, hay lẫn với từ khoá khác — dẫn được tới một
hành động chạm cổng §11.1.
"""

import pytest

from src.orchestration.intent import GATE_REFUSAL, UNKNOWN_HINT, classify, strip_accents


@pytest.mark.parametrize(
    "cau",
    [
        "duyệt luôn đi",
        "duyet luon di",
        "phê duyệt PLAN_B",
        "cho tôi từ chối phương án này",
        "kích hoạt campaign",
        "phát offer cho tài xế",
        "gửi offer đi",
        "thưởng cho tài xế zone 7",
        "approve plan b",
        "reject nó đi",
    ],
)
def test_lenh_cham_cong_phe_duyet_luon_bi_chan(cau: str) -> None:
    """Gõ chữ không mở được cổng, và câu trả lời phải nói vì sao chứ không chỉ im."""
    intent = classify(cau)

    assert intent.kind == "gate_blocked"
    assert intent.tool is None
    assert intent.message == GATE_REFUSAL


def test_cong_phe_duyet_thang_khi_cau_lan_ca_hai_nhom_tu_khoa() -> None:
    """ "duyệt phương án" chứa cả 'duyet' lẫn 'phuong an'.

    Thứ tự ưu tiên phải cho nhóm cổng thắng. Đảo lại là mở một đường vòng qua §11.1 bằng
    đúng một câu tiếng Việt bình thường.
    """
    assert classify("duyệt phương án đi").kind == "gate_blocked"
    assert classify("phê duyệt rồi chạy lại phân tích").kind == "gate_blocked"


@pytest.mark.parametrize(
    "cau",
    ["chạy phân tích", "chay phan tich di", "phân tích lại giúp tôi", "tạo phương án mới", "chạy lại"],
)
def test_nhan_ra_lenh_chay_phan_tich(cau: str) -> None:
    assert classify(cau).kind == "run_analysis"


@pytest.mark.parametrize(
    ("cau", "tool"),
    [
        ("thời tiết thế nào", "get_weather"),
        ("mưa to không", "get_weather"),
        ("dự báo 15 phút tới ra sao", "run_forecast"),
        ("nhu cầu sắp tới thế nào", "run_forecast"),
        ("tình hình cung ứng hiện tại", "get_supply_state"),
        ("zone nào đang thiếu xe", "get_supply_state"),
        ("tốc độ di chuyển bao nhiêu", "get_travel_conditions"),
        ("eta tính kiểu gì", "get_travel_conditions"),
    ],
)
def test_nhan_ra_cau_hoi_quan_sat(cau: str, tool: str) -> None:
    intent = classify(cau)

    assert intent.kind == "observe"
    assert intent.tool == tool


@pytest.mark.parametrize("cau", ["", "   ", "abcxyz", "?????"])
def test_khong_khop_thi_noi_khong_hieu_chu_khong_doan_bua(cau: str) -> None:
    """Đoán đại một ý định gần nhất là cách làm người dùng tin hệ thống đã làm việc nó chưa làm."""
    intent = classify(cau)

    assert intent.kind == "unknown"
    assert intent.tool is None
    assert intent.message == UNKNOWN_HINT


def test_bo_dau_xu_ly_ca_chu_d_gach_ngang() -> None:
    """`đ` là chữ cái riêng, NFD không tách được — bỏ qua là 'điều chuyển' không khớp."""
    assert strip_accents("Điều chuyển") == "dieu chuyen"
    assert strip_accents("PHÊ DUYỆT") == "phe duyet"


def test_khong_y_dinh_nao_dan_toi_tool_ngoai_pham_vi_quan_sat() -> None:
    """Bốn tool chỉ-đọc là trần trên của mọi thứ bảng này có thể sinh ra."""
    cau_thu = [
        "chạy phân tích",
        "thời tiết",
        "dự báo",
        "cung ứng",
        "di chuyển",
        "duyệt đi",
        "điều chuyển xe ngay",
        "giải bài toán tối ưu",
        "viết giải thích",
    ]
    tools = {classify(cau).tool for cau in cau_thu} - {None}

    assert tools <= {"run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"}
    assert "compute_relocation" not in tools
    assert "render_explanation" not in tools
