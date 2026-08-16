"""Ràng buộc cứng và số học di chuyển của Model 3 — SPEC §5.4, AGENT_WORKFLOW §3.1.

Tách khỏi greedy.py để `greedy.solve()` chỉ còn phần *chọn ai điều cho ai*: mỗi vị từ ở đây
kiểm được độc lập bằng test property-based (EVALUATION_PLAN §4.1 A1/A4/A6/A7/A8/A11) mà không
phải dựng cả một snapshot.

Module KHÔNG đọc policy.yaml. Ngưỡng đi vào qua `OptimizerLimits` — nơi gọi dựng nó bằng
`limits_from_policy(get_policy(path))`, nên vẫn chỉ có src/common/policy.py chạm vào file
(CLAUDE.md §3 #2).
"""

import math
from dataclasses import dataclass
from datetime import datetime

from src.common.errors import ConfigError
from src.common.policy import Policy
from src.common.regime import is_heavy_rain, is_rain
from src.contracts.plan import FLOAT_TOLERANCE

# Lưới thời gian của replay (§4.1). Không phải ngưỡng policy — đổi nó là đổi định nghĩa
# một "step" của toàn hệ thống, không phải tinh chỉnh vận hành.
STEP_MINUTES = 5

MINUTES_PER_HOUR = 60.0

# Không mưa thì thời gian di chuyển giữ nguyên. Viết ra thành hằng để ba nhánh của
# `travel_factor` cùng một hình dạng, không có nhánh nào "ngầm hiểu là 1".
NO_RAIN_TRAVEL_FACTOR = 1.0


@dataclass(frozen=True)
class OptimizerLimits:
    """Toàn bộ ngưỡng Model 3 cần, gom một chỗ để `solve()` không có 11 tham số rời.

    Mỗi field ứng đúng một key của policy.yaml (hoặc một hằng dẫn xuất) — không có field nào
    là số do Optimizer tự nghĩ ra. Bất biến, nên không nhánh nào sửa được ngưỡng giữa chừng.
    """

    min_supply_per_zone: int
    budget_cap: int
    max_distance: float
    max_supply_move_pct: float
    deadhead_cost_per_km: int
    avg_vehicle_speed_kmh: float
    priority_zones: tuple[int, ...]
    rain_threshold_mm_h: float
    heavy_rain_mm_h: float
    rain_travel_moderate: float
    rain_travel_heavy: float


def limits_from_policy(policy: Policy) -> OptimizerLimits:
    """Ánh xạ 1-1 từ Policy sang ngưỡng Optimizer — NƠI DUY NHẤT ánh xạ này tồn tại.

    `avg_vehicle_speed_kmh` đi qua đây chứ không được chép lại thành hằng số ở bất kỳ đâu:
    Generator/Simulator (§5.5) và Activation Engine (§5.11) phải dùng đúng con số này, hai
    nơi tự khai một tốc độ là hai thế giới vật lý khác nhau trong cùng một bảng KPI (T3 AC #7).
    """
    return OptimizerLimits(
        min_supply_per_zone=policy.rules.min_supply_per_zone,
        budget_cap=policy.rules.budget_cap,
        max_distance=policy.rules.max_distance,
        max_supply_move_pct=policy.rules.max_supply_move_pct,
        deadhead_cost_per_km=policy.rules.deadhead_cost_per_km,
        avg_vehicle_speed_kmh=policy.rules.avg_vehicle_speed_kmh,
        priority_zones=policy.rules.priority_zones,
        rain_threshold_mm_h=policy.derived.rain_threshold_mm_h,
        heavy_rain_mm_h=policy.derived.heavy_rain_mm_h,
        rain_travel_moderate=policy.derived.rain_travel_factor.moderate,
        rain_travel_heavy=policy.derived.rain_travel_factor.heavy,
    )


def travel_factor(rain_mm_h: float, *, limits: OptimizerLimits) -> float:
    """Hệ số kéo dài thời gian di chuyển khi mưa — §5.4 ("nhân 1.3–1.5 khi vượt ngưỡng").

    Phân loại mưa gọi qua src/common/regime.py chứ không so `rain_mm_h` tại chỗ: ngưỡng mưa
    chỉ được định nghĩa ở một nơi (CLAUDE.md §3 #6), và test tĩnh chặn mọi phép so rải rác.
    """
    if is_heavy_rain(rain_mm_h, threshold=limits.heavy_rain_mm_h):
        return limits.rain_travel_heavy
    if is_rain(rain_mm_h, threshold=limits.rain_threshold_mm_h):
        return limits.rain_travel_moderate
    return NO_RAIN_TRAVEL_FACTOR


def travel_minutes(distance_km: float, *, rain_mm_h: float, limits: OptimizerLimits) -> float:
    """`khoảng cách ÷ avg_vehicle_speed_kmh`, nhân hệ số mưa — §5.4.

    CỐ Ý không nhân `derived.travel_detour_factor`: §5.4 viết travel time = khoảng cách ÷ tốc độ,
    và hệ số vòng vèo 1.4 vẫn là [ASSUMPTION-26] chưa chốt. Nhân thêm ở đây sẽ đội `eta_steps`
    của mọi move mà không có tài liệu nào đỡ cho con số đó.
    """
    if limits.avg_vehicle_speed_kmh <= 0:
        raise ConfigError(
            f"avg_vehicle_speed_kmh={limits.avg_vehicle_speed_kmh} phải dương — không tính được eta_steps",
            {"avg_vehicle_speed_kmh": limits.avg_vehicle_speed_kmh},
        )
    base_minutes = distance_km / limits.avg_vehicle_speed_kmh * MINUTES_PER_HOUR
    return base_minutes * travel_factor(rain_mm_h, limits=limits)


def eta_steps_of(minutes: float) -> int:
    """`ceil(travel_time / 5 phút)`, tối thiểu 1 — §5.4 và ràng buộc của Move §4.4.

    Tối thiểu 1 không phải để tránh số 0 cho đẹp: `eta_steps = 0` làm Simulator cộng cung vào
    zone đích ngay trong step ra lệnh, tức là xe teleport và mọi KPI "sau khi điều" bị thổi lên.
    """
    return max(1, math.ceil(minutes / STEP_MINUTES))


def move_cost(distance_km: float, *, units: int = 1, deadhead_cost_per_km: int) -> int:
    """`estimated_cost = units × deadhead_cost_per_km × deadhead_km`.

    Tiền là int VNĐ (CLAUDE.md §5.2) nên phải làm tròn; dùng half-up thay vì `round()` để
    tránh làm tròn về số chẵn của Python — hai plan chênh nhau 1 đồng vì luật làm tròn là
    thứ không giải thích được cho người duyệt.

    MVP: `deadhead_km == estimated_distance_km` (xe chạy rỗng toàn tuyến), ràng buộc này do
    validator của Move §4.4 giữ.
    """
    if units < 0:
        raise ValueError(f"units={units} phải không âm")
    return math.floor(units * deadhead_cost_per_km * distance_km + 0.5)


def movable_units(*, idle_supply_current: int, surplus: float, limits: OptimizerLimits) -> int:
    """Số xe TỐI ĐA được rút khỏi một zone nguồn — ba cận dưới của `units` ở §5.4.

    Ba cận áp cùng lúc, không cận nào thay thế cận nào:
        surplus                                   dự báo dư bao nhiêu thì mới dám rút bấy nhiêu
        max_supply_move_pct × idle_supply_current  không rút quá một phần cung ĐANG có
        idle_supply_current − min_supply_per_zone  không rút đến mức zone nguồn tự thành hotspot

    Làm tròn XUỐNG mọi cận: làm tròn lên dù chỉ một đơn vị là phá đúng ràng buộc A6/A7 mà
    test property-based kiểm (EVALUATION_PLAN §4.1).
    """
    by_surplus = math.floor(surplus)
    by_move_pct = math.floor(limits.max_supply_move_pct * idle_supply_current)
    by_min_supply = idle_supply_current - limits.min_supply_per_zone
    return max(0, min(by_surplus, by_move_pct, by_min_supply))


def within_max_distance(distance_km: float, *, max_distance: float) -> bool:
    """`estimated_distance_km ≤ max_distance` — cùng biên với validator Move §4.4.

    Dùng chung FLOAT_TOLERANCE với contract: lỏng hơn thì contract từ chối move mà Optimizer
    vừa sinh ra, chặt hơn thì Optimizer tự bỏ mất những move hợp lệ ở đúng biên.
    """
    return distance_km <= max_distance + FLOAT_TOLERANCE


def is_source_available(cooldown_until_ts: datetime | None, *, t: datetime) -> bool:
    """Zone nguồn đã hết cooldown chưa — §4.3: loại mọi surplus zone có `cooldown_until_ts > t`.

    `None` là "chưa từng bị rút xe" (khởi động nguội), không phải "thiếu dữ liệu".
    """
    return cooldown_until_ts is None or cooldown_until_ts <= t
