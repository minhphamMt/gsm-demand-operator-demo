"""T2 AC #1/#4/#5/#6 — công thức §4.3, ba chế độ gap, nguồn `idle_supply_current`, echo mode.

Chia làm hai lớp có chủ đích:

* **Vị từ thô** (`meets_condition`, `raw_conditions`, `gap_of`, `severity_of`) kiểm được
  từng ca biên trong một step.
* **`detect()`** luôn đi qua hysteresis, nên mọi test ở lớp này phải chạy ít nhất 2 step
  mới thấy hotspot. Đó là hành vi đúng chứ không phải bất tiện cần vòng tránh: một đường
  `detect()` bỏ qua hysteresis sẽ là lối tắt để nơi khác gọi và mất luôn §3.3.
"""

import inspect
from datetime import timedelta

import pytest
from src.common.regime import Regime
from src.contracts.forecast import ZoneForecast
from src.contracts.hotspot import Hotspot, HotspotOutput
from src.hotspot.detector import (
    GAP_RATIO_THRESHOLD,
    SEVERITY_EPSILON,
    GapMode,
    detect,
    gap_of,
    ground_truth_flag,
    meets_condition,
    raw_conditions,
    severity_of,
)

from .conftest import T0, make_forecast, zone_forecast

# Giá trị đang có trong policy.yaml, chép vào test để cố định ca biên. Module trong `src/`
# KHÔNG được chứa literal này (test tĩnh chặn); test thì ngược lại, phải nói rõ đo ở ngưỡng nào.
MIN_SUPPLY = 3

HOT = 5  # zone dựng làm hotspot trong các test dưới
COLD = 9  # zone dựng làm nguồn dư xe

# Zone khoảng p10–p90 rộng: p50 cân bằng nên KHÔNG phải hotspot ở chế độ thường, nhưng hai
# chế độ thận trọng cho ra hai con số gap khác hẳn — đúng ca AC #4 cần.
WIDE: dict[str, float] = {"demand": 10.0, "supply": 10.0, "demand_p90": 14.0, "supply_p10": 8.0}


def condition(zone_id: int, *, mode: GapMode = None, regime: Regime = "normal", **kwargs: float) -> bool:
    """Điều kiện §4.3 của một zone dựng tay, chưa qua hysteresis."""
    forecast = make_forecast({zone_id: zone_forecast(zone_id, **kwargs)}, regime=regime)
    return raw_conditions(forecast, min_supply_per_zone=MIN_SUPPLY, conservative_gap_mode=mode)[zone_id]


def only_hotspot(
    zones: dict[int, ZoneForecast],
    idle: dict[int, int],
    *,
    regime: Regime = "normal",
    mode: GapMode = None,
) -> Hotspot:
    """Chạy đủ 2 step (`ENTER_STEPS`) trên cùng một forecast rồi trả về hotspot duy nhất."""
    forecast = make_forecast(zones, regime=regime)
    kwargs = {"min_supply_per_zone": MIN_SUPPLY, "conservative_gap_mode": mode}
    first = detect(forecast, idle_supply_current=idle, **kwargs)
    second = detect(forecast, idle_supply_current=idle, state=first.state, **kwargs)
    assert len(second.output.hotspots) == 1
    return second.output.hotspots[0]


# ------------------------------------------------------------------- AC #1: công thức §4.3


def test_hang_so_cong_thuc_dung_spec() -> None:
    assert GAP_RATIO_THRESHOLD == 0.3
    assert SEVERITY_EPSILON == 1e-6


@pytest.mark.parametrize(
    ("demand", "supply", "expected", "ly_do"),
    [
        (1.0, 2.0, True, "supply < min_supply_per_zone — thỏa dù gap âm"),
        (0.0, 0.0, True, "zone chết: supply 0 < min, không cần xét tỷ lệ"),
        (10.0, 3.0, True, "supply == min nên rơi sang vế tỷ lệ; 7/10 = 0.7 ≥ 0.3"),
        (10.0, 7.0, True, "tỷ lệ đúng 0.3 — biên phải TÍNH LÀ hotspot"),
        (10.0, 7.001, False, "tỷ lệ 0.2999 — ngay dưới biên"),
        (10.0, 10.0, False, "cân bằng: không vế nào thỏa"),
        (10.0, 20.0, False, "dư xe: gap âm"),
    ],
)
def test_hai_ve_cua_dieu_kien_4_3(demand: float, supply: float, expected: bool, ly_do: str) -> None:
    """`(supply < min_supply_per_zone) OR (gap / demand ≥ 0.3)` — từng vế và từng biên."""
    assert condition(HOT, demand=demand, supply=supply) is expected, ly_do


def test_bien_0_3_khong_bi_epsilon_cua_severity_keo_lech() -> None:
    """Ca đã từng sai: tính vế tỷ lệ bằng `severity_score` (mẫu số `demand + ε`) làm lệch biên.

    Ở đúng gap/demand = 0.3, severity nhỏ hơn 0.3 một chút vì ε nằm dưới mẫu. §4.3 viết vế
    này bằng `predicted_demand` trần, nên biên phải là hotspot — hai biểu thức chỉ chênh nhau
    ở đúng ca này, không có ca nào khác lộ ra.
    """
    gap = 3.0
    demand = 10.0
    assert severity_of(gap, demand) < GAP_RATIO_THRESHOLD
    assert meets_condition(predicted_supply=7.0, gap=gap, predicted_demand=demand, min_supply_per_zone=MIN_SUPPLY)


def test_cau_du_bao_bang_khong_quy_ve_gap_duong() -> None:
    """Cầu 0 làm tỷ lệ không xác định; quy ước §4.3 là chỉ thiếu hụt khi gap dương thật."""
    assert (
        meets_condition(predicted_supply=5.0, gap=-5.0, predicted_demand=0.0, min_supply_per_zone=MIN_SUPPLY) is False
    )
    assert meets_condition(predicted_supply=5.0, gap=1.0, predicted_demand=0.0, min_supply_per_zone=MIN_SUPPLY) is True


def test_severity_score_dung_cong_thuc_va_epsilon() -> None:
    """`gap / (predicted_demand + ε)` — ε chỉ để không chia 0, không phải hệ số hiệu chỉnh."""
    assert severity_of(6.0, 10.0) == pytest.approx(6.0 / (10.0 + SEVERITY_EPSILON), abs=1e-12)
    assert severity_of(4.0, 0.0) == pytest.approx(4.0 / SEVERITY_EPSILON, rel=1e-12)


# --------------------------------------------------- AC #4: ba chế độ gap, chỉ ở `rain_peak`


def test_ba_che_do_cho_ba_gap_khac_nhau_o_rain_peak() -> None:
    """p50−p50 = 0 · p90−p50 = 4 · p90−p10 = 6 (§5.3, router R5/R6/R7)."""
    zone = zone_forecast(HOT, **WIDE)
    assert gap_of(zone, regime="rain_peak", conservative_gap_mode=None) == pytest.approx(0.0)
    assert gap_of(zone, regime="rain_peak", conservative_gap_mode="p90_p50") == pytest.approx(4.0)
    assert gap_of(zone, regime="rain_peak", conservative_gap_mode="p90_p10") == pytest.approx(6.0)


@pytest.mark.parametrize("regime", ["normal", "peak", "rain"])
def test_ngoai_rain_peak_ba_che_do_cho_ket_qua_giong_het(regime: Regime) -> None:
    """Chế độ thận trọng chỉ hiệu lực ở `rain_peak`; áp cả ngày sẽ thổi phồng gap giờ vắng."""
    zone = zone_forecast(HOT, **WIDE)
    modes: tuple[GapMode, ...] = (None, "p90_p50", "p90_p10")
    gaps = {mode: gap_of(zone, regime=regime, conservative_gap_mode=mode) for mode in modes}
    assert set(gaps.values()) == {0.0}


def test_che_do_than_trong_doi_ca_ket_luan_hotspot_o_rain_peak() -> None:
    """Khác gap phải dẫn tới khác KẾT LUẬN, nếu không thì AC #4 chỉ là khác số lẻ."""
    assert condition(HOT, regime="rain_peak", mode=None, **WIDE) is False
    assert condition(HOT, regime="rain_peak", mode="p90_p50", **WIDE) is True
    assert condition(HOT, regime="rain_peak", mode="p90_p10", **WIDE) is True


def test_mau_so_severity_van_la_p50_o_che_do_than_trong(idle_supply: dict[int, int]) -> None:
    """Chế độ thận trọng đổi TỬ SỐ của gap, KHÔNG đổi mẫu số của severity.

    Đổi cả mẫu số làm severity của `rain_peak` không so được với ba regime còn lại, mà
    severity chính là thứ tự ưu tiên của Optimizer (§5.4).
    """
    zones = {HOT: zone_forecast(HOT, demand=10.0, supply=5.0, demand_p90=20.0)}
    hotspot = only_hotspot(zones, idle_supply, regime="rain_peak", mode="p90_p50")

    assert hotspot.gap == pytest.approx(15.0)
    assert hotspot.severity_score == pytest.approx(15.0 / (10.0 + SEVERITY_EPSILON), abs=1e-9)


# -------------------------------------------------------------------------- detect() một step


def test_output_dung_contract_va_giu_moc_thoi_gian(idle_supply: dict[int, int]) -> None:
    """`forecast_ts`/`horizon_min` đi thẳng từ §4.2 sang §4.3 — lệch mốc là so sai ground truth."""
    result = detect(
        make_forecast(horizon_min=30),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode="p90_p50",
    )
    assert isinstance(result.output, HotspotOutput)
    assert result.output.horizon_min == 30
    assert result.output.forecast_ts == T0 + timedelta(minutes=30)


def test_hotspot_rong_la_hop_le_khong_phai_loi(idle_supply: dict[int, int]) -> None:
    """Không zone nào thiếu xe → danh sách rỗng, và R8 dựa vào đúng tín hiệu này để dừng step."""
    result = detect(
        make_forecast(),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode="p90_p50",
    )
    assert result.output.hotspots == ()


def test_chi_zone_da_qua_hysteresis_moi_vao_danh_sach(idle_supply: dict[int, int]) -> None:
    """Step 1 chưa đủ streak nên danh sách rỗng; step 2 mới có — `is_hotspot` luôn True."""
    forecast = make_forecast({HOT: zone_forecast(HOT, demand=10.0, supply=4.0)})
    first = detect(
        forecast,
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=None,
    )
    assert first.output.hotspots == ()

    second = detect(
        forecast,
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=None,
        state=first.state,
    )
    assert [item.zone_id for item in second.output.hotspots] == [HOT]
    assert all(item.is_hotspot for item in second.output.hotspots)


def test_surplus_chi_lay_zone_du_va_luon_tinh_bang_p50(idle_supply: dict[int, int]) -> None:
    """Surplus là số xe DÁM RÚT ĐI, nên chế độ thận trọng (vốn để phóng đại thiếu hụt) không đụng vào."""
    zones = {
        COLD: zone_forecast(COLD, demand=4.0, supply=9.0, demand_p90=30.0, supply_p10=1.0),
        HOT: zone_forecast(HOT, demand=10.0, supply=4.0),
    }
    result = detect(
        make_forecast(zones, regime="rain_peak"),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode="p90_p10",
    )
    surplus = {item.zone_id: item.surplus for item in result.output.surplus_zones}
    assert surplus == {COLD: pytest.approx(5.0)}


def test_cooldown_mac_dinh_null_va_chuyen_tiep_duoc(idle_supply: dict[int, int]) -> None:
    """`cooldown_until_ts` phải CÓ MẶT dù rỗng — bỏ field làm Optimizer lẫn "chưa rút bao giờ"."""
    zones = {COLD: zone_forecast(COLD, demand=4.0, supply=9.0)}
    until = T0 + timedelta(minutes=20)

    without = detect(
        make_forecast(zones),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=None,
    )
    assert all(item.cooldown_until_ts is None for item in without.output.surplus_zones)

    with_cooldown = detect(
        make_forecast(zones),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=None,
        cooldown_until_ts={COLD: until},
    )
    assert {item.zone_id: item.cooldown_until_ts for item in with_cooldown.output.surplus_zones}[COLD] == until


# ---------------------------------------------- AC #5: `idle_supply_current` lấy từ snapshot


def test_idle_supply_current_lay_tu_snapshot_khong_phai_du_bao(idle_supply: dict[int, int]) -> None:
    """AC #5. `predicted_supply` = 4 nhưng snapshot ghi 9 — output phải là 9.

    Lấy nhầm số dự báo sẽ khiến Optimizer rút xe không tồn tại, và không có dấu hiệu nào
    lộ ra trong output vì cả hai đều là số hợp lệ.
    """
    zones = {HOT: zone_forecast(HOT, demand=10.0, supply=4.0)}
    hotspot = only_hotspot(zones, idle_supply)

    assert hotspot.idle_supply_current == idle_supply[HOT]
    assert hotspot.idle_supply_current != round(4.0)


def test_surplus_zone_cung_lay_idle_tu_snapshot(idle_supply: dict[int, int]) -> None:
    """Cùng luật cho danh sách nguồn: `surplus` là số dự báo, `idle_supply_current` là số thật."""
    zones = {COLD: zone_forecast(COLD, demand=4.0, supply=9.0)}
    result = detect(
        make_forecast(zones),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=None,
    )
    entry = next(item for item in result.output.surplus_zones if item.zone_id == COLD)
    assert entry.idle_supply_current == idle_supply[COLD]
    assert entry.surplus == pytest.approx(5.0)


def test_thieu_zone_trong_idle_supply_thi_no_khong_mac_dinh_0(idle_supply: dict[int, int]) -> None:
    """Mặc định 0 sẽ vừa biến zone thiếu dữ liệu thành hotspot ảo, vừa loại nó khỏi nguồn điều chuyển."""
    incomplete = {zone_id: value for zone_id, value in idle_supply.items() if zone_id != HOT}
    with pytest.raises(KeyError):
        detect(
            make_forecast(),
            idle_supply_current=incomplete,
            min_supply_per_zone=MIN_SUPPLY,
            conservative_gap_mode=None,
        )


# ------------------------------------------- AC #6: `conservative_gap_mode` từ policy, echo ra


@pytest.mark.parametrize("mode", [None, "p90_p50", "p90_p10"])
def test_echo_conservative_gap_mode_ke_ca_khi_none(mode: GapMode, idle_supply: dict[int, int]) -> None:
    """Đọc lại một output cũ phải biết ngay nó tính bằng công thức nào, không phải tra policy hôm đó."""
    result = detect(
        make_forecast(regime="rain_peak"),
        idle_supply_current=idle_supply,
        min_supply_per_zone=MIN_SUPPLY,
        conservative_gap_mode=mode,
    )
    assert result.output.conservative_gap_mode == mode


def test_nguong_va_che_do_bat_buoc_truyen_vao_khong_co_mac_dinh() -> None:
    """Không có giá trị mặc định = không thể chạy mà quên đọc policy (CLAUDE.md §5.2)."""
    parameters = inspect.signature(detect).parameters
    for name in ("min_supply_per_zone", "conservative_gap_mode"):
        assert parameters[name].default is inspect.Parameter.empty, f"{name} không được có mặc định"


# ------------------------------------------------------------------ ground truth A4 (§3.3)


def test_ground_truth_dung_so_thuc_te_va_cung_vi_tu() -> None:
    """A4 chạy đúng vị từ §4.3 nhưng trên số THỰC TẾ của replay (DATA_CONTRACT §3.3)."""
    assert ground_truth_flag(actual_demand=10.0, actual_supply=7.0, min_supply_per_zone=MIN_SUPPLY) is True
    assert ground_truth_flag(actual_demand=10.0, actual_supply=8.0, min_supply_per_zone=MIN_SUPPLY) is False
    assert ground_truth_flag(actual_demand=1.0, actual_supply=2.0, min_supply_per_zone=MIN_SUPPLY) is True


def test_ground_truth_khong_nhan_che_do_gap_nen_khong_the_bi_keo_theo() -> None:
    """Đổi `conservative_gap_mode` mà ground truth nhúc nhích thì recall đo chính cấu hình của mình."""
    parameters = inspect.signature(ground_truth_flag).parameters
    assert "conservative_gap_mode" not in parameters
    assert set(parameters) == {"actual_demand", "actual_supply", "min_supply_per_zone"}
