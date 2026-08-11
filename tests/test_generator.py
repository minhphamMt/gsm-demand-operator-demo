"""Test cho generate_snapshots.py — T0.4.

Đặt ở gốc tests/ (không tạo thư mục mới) vì bộ sinh dữ liệu là script gốc repo, chưa nằm
trong cây src/ mà ARCHITECTURE §7 đặc tả — cùng chỗ với tests/test_architecture.py.

Chỉ test HÀM THUẦN: không đọc data/, không đọc file mưa NASA. Test phụ thuộc file trong
data/ sẽ đỏ trong CI vì data/ nằm trong .gitignore.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from generate_snapshots import (
    apply_nowcast,
    count_rain_peak_events,
    find_rain_events,
    is_peak,
    normalized_curve,
    pick_sample_windows,
    spatial_rain_factors,
    write_sample,
)
from src.common.regime import tag_regime

PEAK_HOURS = [["07:00", "09:00"], ["17:00", "19:00"]]

# 4 zone đặt ở 4 góc để dải mưa quét qua tạo chênh lệch rõ rệt.
ZONES = [
    {"zone_id": 1, "lat": 20.95, "lng": 105.75},
    {"zone_id": 2, "lat": 20.95, "lng": 105.90},
    {"zone_id": 3, "lat": 21.10, "lng": 105.75},
    {"zone_id": 4, "lat": 21.10, "lng": 105.90},
]
SPATIAL = {"enabled": True, "amplitude": 0.55, "rotation_period_hours": 6.0, "factor_range": [0.30, 1.70]}


# --------------------------------------------------------------------------- normalized_curve


def test_duong_cong_24h_duoc_chuan_hoa_ve_trung_binh_1() -> None:
    """Chuẩn hóa là thứ giữ tổng lượng cả ngày không trôi khi tinh chỉnh một giờ."""
    curve = normalized_curve([1.0] * 12 + [3.0] * 12)
    assert curve.mean() == pytest.approx(1.0, abs=1e-12)
    # Tỷ lệ giữa các giờ phải giữ nguyên sau chuẩn hóa.
    assert curve[12] / curve[0] == pytest.approx(3.0)


def test_duong_cong_sai_do_dai_bi_tu_choi() -> None:
    with pytest.raises(ValueError, match="24"):
        normalized_curve([1.0] * 23)


# --------------------------------------------------------------------------- spatial_rain_factors


def test_he_so_mua_theo_zone_trung_binh_bang_1_o_moi_step() -> None:
    """Biến thiên không gian chỉ phân bố lại mưa, KHÔNG được thêm/bớt lượng mưa toàn thành phố."""
    factors = spatial_rain_factors(ZONES, n_steps=288, step_minutes=5, spatial_cfg=SPATIAL)
    assert factors.shape == (4, 288)
    np.testing.assert_allclose(factors.mean(axis=0), 1.0, atol=1e-12)


def test_he_so_mua_tao_ra_chenh_lech_that_giua_cac_zone() -> None:
    """Nếu mọi zone vẫn như nhau thì D4 chưa được sửa — hotspot do mưa lại nổi đồng loạt."""
    factors = spatial_rain_factors(ZONES, n_steps=72, step_minutes=5, spatial_cfg=SPATIAL)
    spread = factors.max(axis=0) - factors.min(axis=0)
    assert spread.max() > 0.5


def test_he_so_mua_tat_dinh_khong_can_seed() -> None:
    a = spatial_rain_factors(ZONES, 100, 5, SPATIAL)
    b = spatial_rain_factors(ZONES, 100, 5, SPATIAL)
    np.testing.assert_array_equal(a, b)


def test_tat_bien_thien_khong_gian_thi_he_so_toan_1() -> None:
    factors = spatial_rain_factors(ZONES, 10, 5, {"enabled": False})
    np.testing.assert_array_equal(factors, np.ones((4, 10)))


# --------------------------------------------------------------------------- find_rain_events


def test_tach_su_kien_mua_lien_tiep() -> None:
    flags = np.array([0, 1, 1, 0, 0, 1, 0], dtype=bool)
    assert find_rain_events(flags) == [(1, 3), (5, 6)]


def test_su_kien_cham_bien_duoc_dong_lai() -> None:
    """Sự kiện chạy tới hết chuỗi vẫn phải được đếm — bỏ sót ở đây là đếm thiếu sự kiện."""
    assert find_rain_events(np.array([1, 1, 0, 1, 1], dtype=bool)) == [(0, 2), (3, 5)]
    assert find_rain_events(np.zeros(5, dtype=bool)) == []


# --------------------------------------------------------------------------- apply_nowcast


def _rain_with_two_events() -> np.ndarray:
    rain = np.zeros(60)
    rain[10:20] = 3.0
    rain[40:50] = 4.0
    return rain


def test_nowcast_deterministic_theo_seed() -> None:
    rain = _rain_with_two_events()
    kwargs = dict(threshold=0.5, horizon_steps=3, sigma_rel=0.2, sigma_abs=0.2, p_miss=0.0)
    a, _ = apply_nowcast(rain, np.random.default_rng(13), **kwargs)
    b, _ = apply_nowcast(rain, np.random.default_rng(13), **kwargs)
    np.testing.assert_array_equal(a, b)


def test_nowcast_khong_am_va_khong_con_hoan_hao() -> None:
    """A-06: forecast phải LỆCH so với mưa thật, và không bao giờ âm (max(0, ...))."""
    rain = _rain_with_two_events()
    fc, _ = apply_nowcast(
        rain, np.random.default_rng(13), threshold=0.5, horizon_steps=3, sigma_rel=0.2, sigma_abs=0.2, p_miss=0.0
    )
    assert (fc >= 0).all()
    # Nhiễu CỘNG khiến cả những step khô cũng có dự báo khác 0 -> không suy ngược được mưa thật.
    assert (fc[:5] > 0).any()
    # AC #8 đo trên các dòng CÓ MƯA. Dòng khô bị max(0, ·) kẹp về đúng 0.0 khá nhiều nên
    # tỷ lệ trên toàn chuỗi không nói lên điều gì về chất lượng dự báo.
    rainy = rain >= 0.5
    assert (fc[rainy] != rain[rainy]).mean() > 0.9


def test_nowcast_p_miss_bo_sot_tron_ven_su_kien() -> None:
    """p_miss = 1.0 -> cả hai sự kiện bị ép về 0 ở đúng cửa sổ dịch theo horizon."""
    rain = _rain_with_two_events()
    fc, missed = apply_nowcast(
        rain, np.random.default_rng(13), threshold=0.5, horizon_steps=3, sigma_rel=0.2, sigma_abs=0.2, p_miss=1.0
    )
    assert missed == 2
    # Sự kiện [10,20) nhìn từ horizon 3 step nằm ở [7,17).
    np.testing.assert_array_equal(fc[7:17], np.zeros(10))
    np.testing.assert_array_equal(fc[37:47], np.zeros(10))


def test_nowcast_p_miss_0_khong_bo_sot_gi() -> None:
    _, missed = apply_nowcast(
        _rain_with_two_events(),
        np.random.default_rng(13),
        threshold=0.5,
        horizon_steps=6,
        sigma_rel=0.35,
        sigma_abs=0.4,
        p_miss=0.0,
    )
    assert missed == 0


# --------------------------------------------------------------------------- count_rain_peak_events


def _snapshot(rows: list[tuple[int, int, float, int]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["ts_bucket", "zone_id", "rain_mm_h", "peak_flag"])


def test_dem_su_kien_rain_peak_theo_step_lien_tiep() -> None:
    """[D12] Sự kiện = chuỗi ts_bucket liên tiếp có ÍT NHẤT MỘT zone rain_peak."""
    rows = []
    for t in range(6):
        # t=1,2 -> zone 1 rain_peak; t=4 -> zone 2 rain_peak; t=0,3,5 khô hoặc ngoài cao điểm.
        rows.append((t, 1, 3.0 if t in (1, 2) else 0.0, 1))
        rows.append((t, 2, 3.0 if t == 4 else 0.0, 1 if t == 4 else 0))
    n_events, n_steps = count_rain_peak_events(_snapshot(rows), threshold=0.5)
    assert (n_events, n_steps) == (2, 3)


def test_mot_zone_du_de_giu_su_kien_khong_bi_dut() -> None:
    """Hai zone mưa nối tiếp nhau không tạo hai sự kiện — chuỗi step vẫn liền."""
    rows = []
    for t in range(4):
        rows.append((t, 1, 3.0 if t in (0, 1) else 0.0, 1))
        rows.append((t, 2, 3.0 if t in (2, 3) else 0.0, 1))
    assert count_rain_peak_events(_snapshot(rows), threshold=0.5) == (1, 4)


def test_mua_duoi_nguong_khong_tinh_la_rain_peak() -> None:
    """Ngưỡng đã chốt là >= 0.5 mm/h; luật cũ `> 0` đếm cả mưa phùn."""
    rows = [(t, 1, 0.4, 1) for t in range(5)]
    assert count_rain_peak_events(_snapshot(rows), threshold=0.5) == (0, 0)


# --------------------------------------------------------------------------- is_peak


@pytest.mark.parametrize(
    ("hour", "minute", "expected"),
    [(6, 55, 0), (7, 0, 1), (8, 59, 1), (9, 0, 0), (17, 0, 1), (18, 55, 1), (19, 0, 0), (12, 0, 0)],
)
def test_bien_gio_cao_diem_dong_mo(hour: int, minute: int, expected: int) -> None:
    """Khoảng nửa mở [start, end): 09:00 và 19:00 KHÔNG còn là cao điểm."""
    ts = pd.Timestamp(2026, 8, 14, hour, minute)
    assert is_peak(ts, PEAK_HOURS) == expected


# --------------------------------------------------------------------------- sample


SAMPLE_COLUMNS = ["ts_bucket", "zone_id", "rain_mm_h", "peak_flag", "enroute_arrivals"]


def _steps_frame(rows: list[tuple[int, float, int]], n_zones: int) -> pd.DataFrame:
    """Dựng snapshot rút gọn từ danh sách (step, mưa, peak_flag)."""
    base = pd.Timestamp("2026-09-25 00:00", tz="+07:00")
    out = []
    for t, rain, peak in rows:
        for z in range(1, n_zones + 1):
            # Lệch nhỏ theo zone để tổng mưa mỗi step vẫn xếp hạng được như dữ liệu thật.
            out.append((base + pd.Timedelta(minutes=5 * t), z, round(rain + 0.01 * z, 3), peak, []))
    return pd.DataFrame(out, columns=SAMPLE_COLUMNS)


def _four_regime_frame(n_zones: int = 3) -> pd.DataFrame:
    """40 step, mỗi khối 10 step một regime; đỉnh mưa đặt giữa khối để cửa sổ không dính biên."""
    rows = []
    for t in range(40):
        peak = 1 if (10 <= t < 20 or t >= 30) else 0
        rain = 0.0 if t < 20 else 6.0 - abs(t - (25 if t < 30 else 35))
        rows.append((t, rain, peak))
    return _steps_frame(rows, n_zones)


def test_sample_chon_du_bon_regime() -> None:
    """Sample tồn tại để người mở ra kiểm bằng mắt — thiếu regime nào là mất chỗ để kiểm."""
    df = _four_regime_frame()
    picked = pick_sample_windows(df, threshold=0.5)
    assert len(picked) == 16  # 4 cửa sổ × 4 step, không chồng nhau
    sample = df[df["ts_bucket"].isin(picked)]
    labels = {tag_regime(r, p, 0.5) for r, p in zip(sample["rain_mm_h"], sample["peak_flag"], strict=True)}
    assert labels == {"normal", "peak", "rain", "rain_peak"}


def test_sample_chon_dung_step_mua_to_nhat() -> None:
    """Cửa sổ mưa phải bám đỉnh mưa (step 25 ngoài cao điểm, step 35 trong cao điểm)."""
    picked = pick_sample_windows(_four_regime_frame(), threshold=0.5)
    base = pd.Timestamp("2026-09-25 00:00", tz="+07:00")
    assert base + pd.Timedelta(minutes=5 * 25) in picked
    assert base + pd.Timedelta(minutes=5 * 35) in picked


def test_sample_tat_dinh_khong_can_seed() -> None:
    df = _four_regime_frame()
    assert pick_sample_windows(df, 0.5) == pick_sample_windows(df, 0.5)


def test_cua_so_khong_tran_ra_ngoai_bien() -> None:
    """Regime rơi vào step cuối vẫn phải lấy đủ 4 step, lùi vào trong thay vì vượt biên."""
    df = _steps_frame([(t, 3.0 if t == 4 else 0.0, 1 if t == 4 else 0) for t in range(5)], n_zones=2)
    picked = pick_sample_windows(df, threshold=0.5)
    assert picked == sorted(df["ts_bucket"].unique())  # 5 step, không sinh index âm/vượt


def test_write_sample_them_cot_regime_va_giu_nguyen_so_dong(tmp_path: Path) -> None:
    """Sample là bản TRÍCH: thêm cột suy ra `regime`, không đụng dữ liệu gốc."""
    df = _four_regime_frame(n_zones=3)
    out = tmp_path / "sample.csv"
    n_rows, n_windows = write_sample(df, str(out), threshold=0.5)
    assert (n_rows, n_windows) == (16 * 3, 16)

    written = pd.read_csv(out)
    assert written.columns[-1] == "regime"  # cột suy ra, KHÔNG thuộc contract §4.1
    assert (written["enroute_arrivals"] == "[]").all()
    assert list(written["regime"]) == [
        tag_regime(r, p, 0.5) for r, p in zip(written["rain_mm_h"], written["peak_flag"], strict=True)
    ]
    # Sắp xếp theo (thời gian, zone) để người đọc dò được từng step một.
    assert list(written["zone_id"][:4]) == [1, 2, 3, 1]
    assert "regime" not in df.columns  # write_sample không được sửa DataFrame đầu vào
