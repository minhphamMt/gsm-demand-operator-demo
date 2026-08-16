"""Ràng buộc và số học di chuyển của Model 3 — T3 AC #6, #7 và các cận của AC #3.

Kiểm từng vị từ tách khỏi thuật toán: nếu chỉ kiểm qua `solve()` thì một cận sai (ví dụ làm
tròn LÊN ở `max_supply_move_pct`) chỉ lộ ra khi tình cờ có snapshot chạm đúng biên đó.
"""

from dataclasses import FrozenInstanceError, replace
from datetime import timedelta

import pytest
from src.common.errors import ConfigError
from src.common.policy import load_policy
from src.optimizer.constraints import (
    MINUTES_PER_HOUR,
    NO_RAIN_TRAVEL_FACTOR,
    STEP_MINUTES,
    OptimizerLimits,
    eta_steps_of,
    is_source_available,
    limits_from_policy,
    movable_units,
    move_cost,
    travel_factor,
    travel_minutes,
    within_max_distance,
)

from .conftest import REAL_POLICY_PATH, T0

# --------------------------------------------------------------- ánh xạ policy → ngưỡng (AC #7)


def test_moi_nguong_lay_dung_tu_policy() -> None:
    """AC #7 — không field nào của OptimizerLimits là số Optimizer tự nghĩ ra."""
    policy = load_policy(REAL_POLICY_PATH)
    limits = limits_from_policy(policy)

    assert limits.min_supply_per_zone == policy.rules.min_supply_per_zone
    assert limits.budget_cap == policy.rules.budget_cap
    assert limits.max_distance == policy.rules.max_distance
    assert limits.max_supply_move_pct == policy.rules.max_supply_move_pct
    assert limits.deadhead_cost_per_km == policy.rules.deadhead_cost_per_km
    assert limits.avg_vehicle_speed_kmh == policy.rules.avg_vehicle_speed_kmh
    assert limits.priority_zones == policy.rules.priority_zones
    assert limits.rain_threshold_mm_h == policy.derived.rain_threshold_mm_h
    assert limits.heavy_rain_mm_h == policy.derived.heavy_rain_mm_h
    assert limits.rain_travel_moderate == policy.derived.rain_travel_factor.moderate
    assert limits.rain_travel_heavy == policy.derived.rain_travel_factor.heavy


def test_toc_do_xe_la_gia_tri_da_duoc_duyet() -> None:
    """AC #7 — `avg_vehicle_speed_kmh` là key `verified: true` duy nhất; Optimizer phải dùng
    đúng con số đó, cùng con số Generator (§5.1) và Activation Engine (§5.11) dùng."""
    policy = load_policy(REAL_POLICY_PATH)
    assert policy.meta["avg_vehicle_speed_kmh"].verified is True
    assert limits_from_policy(policy).avg_vehicle_speed_kmh == policy.rules.avg_vehicle_speed_kmh


def test_limits_bat_bien(policy_limits: OptimizerLimits) -> None:
    """Ngưỡng đổi giữa chừng là hai nửa plan chạy trên hai bộ luật khác nhau."""
    with pytest.raises(FrozenInstanceError):
        policy_limits.budget_cap = 1


# ------------------------------------------------------------------- hệ số mưa & travel time


def test_khong_mua_thi_khong_keo_dai(policy_limits: OptimizerLimits) -> None:
    assert travel_factor(0.0, limits=policy_limits) == NO_RAIN_TRAVEL_FACTOR
    assert travel_factor(0.49, limits=policy_limits) == NO_RAIN_TRAVEL_FACTOR


def test_ba_muc_mua_cho_ba_he_so(policy_limits: OptimizerLimits) -> None:
    """AC #6 — 1.3 (mưa vừa) / 1.5 (mưa to), lấy từ derived.rain_travel_factor."""
    assert travel_factor(0.5, limits=policy_limits) == pytest.approx(1.3)
    assert travel_factor(4.99, limits=policy_limits) == pytest.approx(1.3)
    assert travel_factor(5.0, limits=policy_limits) == pytest.approx(1.5)
    assert travel_factor(20.0, limits=policy_limits) == pytest.approx(1.5)


def test_travel_time_bang_quang_duong_chia_toc_do(policy_limits: OptimizerLimits) -> None:
    """AC #6/#7 — công thức đúng §5.4, không nhân thêm hệ số nào khi trời khô."""
    expected = 5.0 / policy_limits.avg_vehicle_speed_kmh * MINUTES_PER_HOUR
    assert travel_minutes(5.0, rain_mm_h=0.0, limits=policy_limits) == pytest.approx(expected)


def test_travel_time_khong_nhan_he_so_vong_veo(policy_limits: OptimizerLimits) -> None:
    """`derived.travel_detour_factor` = 1.4 vẫn là [ASSUMPTION-26] chưa chốt (DATA_CONTRACT §6).

    Nhân nó vào đây sẽ đội `eta_steps` của mọi move mà không tài liệu nào đỡ cho con số đó —
    test này ghi lại quyết định, để lần sau ai muốn đổi phải đổi cả tài liệu.
    """
    policy = load_policy(REAL_POLICY_PATH)
    plain = 10.0 / policy_limits.avg_vehicle_speed_kmh * MINUTES_PER_HOUR
    assert policy.derived.travel_detour_factor != 1.0
    assert travel_minutes(10.0, rain_mm_h=0.0, limits=policy_limits) == pytest.approx(plain)


def test_mua_lam_xe_den_cham_hon(policy_limits: OptimizerLimits) -> None:
    dry_minutes = travel_minutes(6.0, rain_mm_h=0.0, limits=policy_limits)
    wet_minutes = travel_minutes(6.0, rain_mm_h=2.0, limits=policy_limits)
    heavy_minutes = travel_minutes(6.0, rain_mm_h=9.0, limits=policy_limits)
    assert dry_minutes < wet_minutes < heavy_minutes


def test_toc_do_bang_khong_thi_bao_loi_cau_hinh(policy_limits: OptimizerLimits) -> None:
    """Chia cho 0 phải thành ConfigError có nêu tên key, không phải ZeroDivisionError trần."""
    broken = replace(policy_limits, avg_vehicle_speed_kmh=0.0)
    with pytest.raises(ConfigError, match="avg_vehicle_speed_kmh"):
        travel_minutes(1.0, rain_mm_h=0.0, limits=broken)


# -------------------------------------------------------------------------------- eta_steps


@pytest.mark.parametrize(
    ("minutes", "expected"),
    [
        (0.0, 1),
        (0.1, 1),
        (5.0, 1),
        (5.1, 2),
        (10.0, 2),
        (10.01, 3),
        (23.0, 5),
    ],
)
def test_eta_lam_tron_len_toi_thieu_mot_step(minutes: float, expected: int) -> None:
    """AC #6 — `ceil(travel_time / 5 phút)`, tối thiểu 1.

    Biên 5.0 → 1 và 5.1 → 2 là chỗ duy nhất phân biệt ceil với round; 0.0 → 1 là chỗ duy nhất
    phân biệt "tối thiểu 1" với ceil trần.
    """
    assert eta_steps_of(minutes) == expected


def test_eta_luon_duong() -> None:
    """`eta_steps` là PositiveInt trong contract §4.4 — 0 làm Simulator cộng cung ngay lập tức."""
    assert all(eta_steps_of(index / 7) >= 1 for index in range(200))


def test_step_dung_luoi_nam_phut() -> None:
    assert STEP_MINUTES == 5


# ------------------------------------------------------------------------------ chi phí move


def test_chi_phi_bang_don_gia_nhan_quang_duong(policy_limits: OptimizerLimits) -> None:
    """§5.4 / DATA_CONTRACT §2.4: `estimated_cost = deadhead_cost_per_km × deadhead_km`.

    KHÔNG nhân số xe: một lệnh điều chuyển vẫn là một quãng đường deadhead.
    """
    assert move_cost(4.2, deadhead_cost_per_km=4000) == 16800
    assert move_cost(1.0, deadhead_cost_per_km=policy_limits.deadhead_cost_per_km) == (
        policy_limits.deadhead_cost_per_km
    )


def test_chi_phi_la_so_nguyen_lam_tron_nua_len() -> None:
    """Tiền là int VNĐ (CLAUDE.md §5.2); half-up để không dính làm tròn về số chẵn của Python."""
    assert isinstance(move_cost(3.33333, deadhead_cost_per_km=4000), int)
    assert move_cost(0.00125, deadhead_cost_per_km=4000) == 5
    # round() của Python cho 2 ở đây (làm tròn về số chẵn); half-up phải cho 3.
    assert move_cost(0.5, deadhead_cost_per_km=5) == 3


def test_chi_phi_khong_am() -> None:
    """`estimated_cost` là NonNegativeInt trong contract §4.4."""
    assert move_cost(0.0, deadhead_cost_per_km=4000) == 0


# ------------------------------------------------------------------- ba cận của movable_units


def test_can_nho_nhat_thang(policy_limits: OptimizerLimits) -> None:
    """min của ba cận — đổi cận nào cũng phải đổi được kết quả, không cận nào "thường thắng"."""
    limits = replace(policy_limits, min_supply_per_zone=3, max_supply_move_pct=0.4)

    # surplus thắng: 2 < floor(0.4×20)=8 và < 20−3=17
    assert movable_units(idle_supply_current=20, surplus=2.0, limits=limits) == 2
    # max_supply_move_pct thắng: floor(0.4×20)=8 < 50 và < 17
    assert movable_units(idle_supply_current=20, surplus=50.0, limits=limits) == 8
    # min_supply_per_zone thắng: 4−3=1 < floor(0.9×4)=3 và < 50
    loose_pct = replace(limits, max_supply_move_pct=0.9)
    assert movable_units(idle_supply_current=4, surplus=50.0, limits=loose_pct) == 1


def test_lam_tron_xuong_o_moi_can(policy_limits: OptimizerLimits) -> None:
    """AC #3 (A6/A7) — làm tròn lên dù một đơn vị là vi phạm ràng buộc mà từng move vẫn "hợp lệ"."""
    limits = replace(policy_limits, min_supply_per_zone=0, max_supply_move_pct=0.4)
    # 0.4 × 7 = 2.8 → 2, không phải 3
    assert movable_units(idle_supply_current=7, surplus=99.0, limits=limits) == 2
    # surplus 3.9 → 3
    assert movable_units(idle_supply_current=99, surplus=3.9, limits=limits) == 3


def test_zone_o_hoac_duoi_min_supply_khong_rut_duoc(policy_limits: OptimizerLimits) -> None:
    """Rút xe khỏi zone đã chạm sàn là tự tạo hotspot mới (§5.4)."""
    limits = replace(policy_limits, min_supply_per_zone=3)
    assert movable_units(idle_supply_current=3, surplus=99.0, limits=limits) == 0
    assert movable_units(idle_supply_current=1, surplus=99.0, limits=limits) == 0


def test_khong_bao_gio_tra_so_am(policy_limits: OptimizerLimits) -> None:
    """`units_to_move` là PositiveInt; số âm lọt ra ngoài sẽ thành move ngược chiều."""
    limits = replace(policy_limits, min_supply_per_zone=10)
    assert movable_units(idle_supply_current=0, surplus=5.0, limits=limits) == 0


# --------------------------------------------------------------------- max_distance & cooldown


def test_bien_max_distance_la_nho_hon_hoac_bang(policy_limits: OptimizerLimits) -> None:
    """Cùng biên với validator Move §4.4 — lệch biên là Optimizer sinh ra move contract từ chối."""
    assert within_max_distance(7.0, max_distance=7.0) is True
    assert within_max_distance(7.000000001, max_distance=7.0) is True  # nằm trong FLOAT_TOLERANCE
    assert within_max_distance(7.01, max_distance=7.0) is False
    assert within_max_distance(0.0, max_distance=policy_limits.max_distance) is True


def test_cooldown_null_la_dung_duoc() -> None:
    """`null` = chưa từng bị rút xe (khởi động nguội §4.3), không phải thiếu dữ liệu."""
    assert is_source_available(None, t=T0) is True


def test_cooldown_bien_bang_t_la_da_het() -> None:
    """§4.3 loại zone có `cooldown_until_ts > t` — đúng bằng `t` là đã hết khoá."""
    assert is_source_available(T0, t=T0) is True
    assert is_source_available(T0 - timedelta(seconds=1), t=T0) is True


def test_cooldown_con_hieu_luc_thi_loai() -> None:
    assert is_source_available(T0 + timedelta(minutes=1), t=T0) is False
    assert is_source_available(T0 + timedelta(seconds=1), t=T0) is False
