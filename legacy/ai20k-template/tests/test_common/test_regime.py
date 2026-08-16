"""Test gán nhãn regime — Task T0.2, quyết định A-05.

Acceptance Criteria (docs/design/IMPLEMENTATION_PLAN.md §3 T0.2):
    #1 một hàm duy nhất tag_regime(rain_mm_h, peak_flag)
    #2 bốn nhãn tại biên: (0.49,0)→normal, (0.5,0)→rain, (0.49,1)→peak, (0.5,1)→rain_peak
AC #3 (test tĩnh) ở tests/test_architecture.py; AC #4 (script baseline) ở T0.4.
"""

import pytest
from src.common.regime import REGIMES, Regime, is_heavy_rain, is_rain, rain_threshold, tag_regime


def test_dung_bon_nhan_khong_hon_khong_kem() -> None:
    """Thêm nhãn thứ 5 là đổi contract báo cáo KPI (§3 #6)."""
    assert REGIMES == ("normal", "peak", "rain", "rain_peak")


@pytest.mark.parametrize(
    ("rain_mm_h", "peak_flag", "expected"),
    [
        (0.49, 0, "normal"),
        (0.50, 0, "rain"),
        (0.49, 1, "peak"),
        (0.50, 1, "rain_peak"),
    ],
)
def test_bon_nhan_tai_bien(rain_mm_h: float, peak_flag: int, expected: Regime) -> None:
    """AC #2 — biên là `>=`, đúng 0.5 đã tính là mưa.

    Kiểm tại biên chứ không ở giữa dải: sai lầm thực tế là dùng `>` thay `>=`, mà lỗi đó
    chỉ lộ ra đúng ở điểm 0.5.
    """
    assert tag_regime(rain_mm_h, peak_flag) == expected


def test_nguong_lay_tu_file_cau_hinh_khong_viet_cung() -> None:
    """0.5 phải đến từ derived.rain_threshold_mm_h, không phải hằng trong regime.py."""
    assert rain_threshold() == pytest.approx(0.5)


def test_truyen_nguong_tay_de_phan_tich_do_nhay() -> None:
    """Cửa cho phân tích độ nhạy quanh ngưỡng — mặc định vẫn là giá trị đã chốt."""
    assert tag_regime(0.3, 0) == "normal"
    assert tag_regime(0.3, 0, rain_threshold_mm_h=0.2) == "rain"
    assert tag_regime(0.3, 1, rain_threshold_mm_h=0.2) == "rain_peak"


def test_peak_flag_nhan_bool_lan_int() -> None:
    """Snapshot lưu 0/1, pandas có thể trả bool — hai kiểu phải cho cùng nhãn."""
    assert tag_regime(0.0, 1) == tag_regime(0.0, True) == "peak"
    assert tag_regime(0.0, 0) == tag_regime(0.0, False) == "normal"


def test_khong_mua_thi_khong_bao_gio_ra_nhan_rain() -> None:
    assert tag_regime(0.0, 0) == "normal"
    assert tag_regime(0.0, 1) == "peak"


@pytest.mark.parametrize(("rain_mm_h", "expected"), [(4.99, False), (5.0, True), (7.32, True)])
def test_mua_to_theo_nguong_rieng(rain_mm_h: float, expected: bool) -> None:
    """`mưa to` là trục khác, không sinh thêm regime — chỉ dùng cho hệ số di chuyển §5.4."""
    assert is_heavy_rain(rain_mm_h) is expected
    # và nó không làm đổi nhãn regime
    assert tag_regime(rain_mm_h, 1) == "rain_peak"


# ------------------------------------------------------- is_rain: cửa cho Optimizer §5.4 (T3)


@pytest.mark.parametrize(("rain_mm_h", "expected"), [(0.49, False), (0.5, True), (12.0, True)])
def test_co_mua_dung_cung_bien_voi_tag_regime(rain_mm_h: float, expected: bool) -> None:
    """`is_rain` và `tag_regime` phải cùng một định nghĩa "mưa".

    Hai định nghĩa lệch nhau thì Optimizer nhân hệ số mưa ở những step mà bảng KPI xếp là
    `normal` — số liệu và hành vi nói hai chuyện khác nhau mà không test nào thấy.
    """
    assert is_rain(rain_mm_h) is expected
    assert (tag_regime(rain_mm_h, 0) == "rain") is expected


def test_ba_muc_mua_khong_chong_lan() -> None:
    """Ba nhánh hệ số di chuyển §5.4 (khô / vừa / to) phải phân hoạch được dải mưa."""
    assert (is_rain(0.2), is_heavy_rain(0.2)) == (False, False)
    assert (is_rain(2.0), is_heavy_rain(2.0)) == (True, False)
    assert (is_rain(6.0), is_heavy_rain(6.0)) == (True, True)


def test_truyen_nguong_tay_cho_ca_hai_muc() -> None:
    """Optimizer nhận ngưỡng qua tham số (CLAUDE.md §5.2) nên phải ghi đè được, mặc định giữ nguyên."""
    assert is_rain(0.3) is False
    assert is_rain(0.3, threshold=0.2) is True
    assert is_heavy_rain(3.0) is False
    assert is_heavy_rain(3.0, threshold=2.0) is True
