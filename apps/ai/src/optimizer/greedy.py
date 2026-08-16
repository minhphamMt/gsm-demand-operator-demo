"""Model 3 — Relocation Optimizer: greedy theo severity (SPEC §5.4, task T3).

Min-cost flow và OR-Tools đã bị cắt khỏi MVP (§7.1 #1) — greedy là phương án chốt, không phải
giải pháp tạm. Vì thế mọi quyết định "chọn ai điều cho ai" ở đây phải đọc được bằng mắt: thứ tự
hotspot, thứ tự ứng viên nguồn và điều kiện dừng đều là hàm thuần của input.

Ba điểm dễ hiểu sai:

1. `solve()` KHÔNG trả `RelocationPlan` §4.4 mà trả `SolveResult` — gồm đúng các thành phần
   Model 3 sinh ra được. `metrics_before`/`metrics_after` là field bắt buộc của plan nhưng do
   Simulator (§5.5, task T4) tính; Optimizer tự dựng số đó là cài lại công thức metric lần thứ
   hai, điều §5.14.1 cấm thẳng. Tầng pipeline ghép SolveResult + metrics thành plan.
2. Không tìm được nghiệm là **kết quả hợp lệ**, không phải lỗi: plan rỗng + `residual_gap` =
   toàn bộ gap + cảnh báo `NO_SOLUTION`, HTTP 200 (§5.9, AGENT_WORKFLOW §3.1 dòng 1).
3. Zone đang là hotspot KHÔNG được làm nguồn, kể cả khi nó có mặt trong `surplus_zones` —
   chuyện xảy ra thật ở `rain_peak` vì gap tính bằng `demand_p90` còn surplus tính bằng p50
   (§4.3). Rút xe khỏi một zone đang thiếu xe là đúng thứ §5.4 cấm ("không rút xe khiến zone
   nguồn tự trở thành hotspot mới") ở dạng nặng nhất.
"""

import logging
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

from src.common.haversine import ZoneCoord, distance_between
from src.common.policy import Policy
from src.contracts.hotspot import Hotspot, HotspotOutput
from src.contracts.plan import FLOAT_TOLERANCE, Move, PlanTotals, ResidualGap
from src.optimizer.constraints import (
    OptimizerLimits,
    eta_steps_of,
    is_source_available,
    limits_from_policy,
    movable_units,
    move_cost,
    travel_minutes,
    within_max_distance,
)

logger = logging.getLogger(__name__)

# Mã cảnh báo — docs/design/API_CONTRACT.md §1.3. Chuỗi viết ra một lần ở đây, nơi khác
# import lại: gõ tay mã cảnh báo ở tầng API là cách hai bên lệch nhau mà test không thấy.
NO_SOLUTION = "NO_SOLUTION"
PLAN_NOT_FULLY_COVERING_GAP = "PLAN_NOT_FULLY_COVERING_GAP"
BUDGET_NEAR_CAP = "BUDGET_NEAR_CAP"
SOURCE_ZONE_NEAR_MIN_SUPPLY = "SOURCE_ZONE_NEAR_MIN_SUPPLY"

# Điều kiện phát cảnh báo, theo bảng §1.3. Không phải ngưỡng vận hành nên không nằm ở
# policy.yaml: đổi chúng chỉ đổi lúc nào UI nhắc người trực, không đổi plan sinh ra.
BUDGET_NEAR_CAP_RATIO = 0.9
NEAR_MIN_SUPPLY_MARGIN = 1

# "Ưu tiên eta ≤ 3 step" (§5.4): xe đến sau 15 phút thì đợt cao điểm đã qua, nên ứng viên xa
# hơn ngưỡng này chỉ được dùng khi không còn ai gần hơn.
PREFERRED_ETA_STEPS = 3


@dataclass(frozen=True)
class SolveResult:
    """Phần §4.4 mà Model 3 sinh ra được, chưa gồm metric.

    Ba field đầu là object contract thật (không phải dict trung gian), nên sai cấu trúc là
    vỡ ngay tại đây chứ không đợi đến lúc ghép plan.
    """

    moves: tuple[Move, ...]
    residual_gap: tuple[ResidualGap, ...]
    plan_totals: PlanTotals
    source_capacities: tuple[tuple[int, int], ...] = ()
    warnings: tuple[dict[str, object], ...] = ()


@dataclass(frozen=True)
class _Candidate:
    """Một zone nguồn khả dụng, đã quy đổi sang khoảng cách/eta/chi phí cho MỘT hotspot."""

    zone_id: int
    distance_km: float
    eta_steps: int
    unit_cost: int


def _required_units(gap: float) -> int:
    """Convert a continuous forecast gap to indivisible vehicles by nearest integer.

    Dispatching one vehicle to a predicted gap of 0.8 reduces imbalance; flooring every
    zone separately stranded real safe capacity. Values below half a vehicle stay zero.
    """
    return max(0, math.floor(gap + 0.5))


def solve(
    hotspot_output: HotspotOutput,
    *,
    t: datetime,
    rain_mm_h: Mapping[int, float],
    policy: Policy,
    zone_coords: Mapping[int, ZoneCoord],
) -> SolveResult:
    """Một step Model 3: `HotspotOutput` §4.3 → danh sách move + `residual_gap` §4.4.

    `t` là mốc snapshot hiện tại, dùng để so `cooldown_until_ts`. `rain_mm_h` phải phủ đủ mọi
    zone xuất hiện trong hotspot/surplus — thiếu zone thì nổ `KeyError` chứ không mặc định 0:
    coi nhầm một zone là khô ráo sẽ rút ngắn `eta_steps` và làm Simulator cộng cung sớm hơn
    thực tế, đúng loại sai lệch không để lại dấu vết nào trong output.

    Hàm thuần và deterministic: cùng input cho ra cùng plan, không đọc đồng hồ, không random.
    """
    limits = limits_from_policy(policy)
    idle_by_zone = {zone.zone_id: zone.idle_supply_current for zone in hotspot_output.surplus_zones}
    capacity = _source_capacity(hotspot_output, t=t, limits=limits)
    targets = _ordered_targets(hotspot_output.hotspots, priority_zones=limits.priority_zones)

    remaining: dict[int, float] = {hotspot.zone_id: hotspot.gap for hotspot in targets}
    moves: list[Move] = []
    withdrawn: dict[int, int] = {}
    allocations = _optimal_allocations(
        targets,
        capacity=capacity,
        rain_mm_h=rain_mm_h,
        limits=limits,
        zone_coords=zone_coords,
    )
    total_cost = 0
    total_deadhead_km = 0.0
    for hotspot, option, units in allocations:
        before_gap = remaining[hotspot.zone_id]
        after_gap = before_gap - units
        estimated_cost = move_cost(
            option.distance_km,
            units=units,
            deadhead_cost_per_km=limits.deadhead_cost_per_km,
        )
        moves.append(
            Move.model_validate(
                {
                    "from_zone": option.zone_id,
                    "to_zone": hotspot.zone_id,
                    "units_to_move": units,
                    "eta_steps": option.eta_steps,
                    "estimated_distance_km": option.distance_km,
                    "estimated_cost": estimated_cost,
                    "deadhead_km": option.distance_km,
                    "before_gap": before_gap,
                    "after_gap": after_gap,
                },
                context={"policy": policy},
            )
        )
        remaining[hotspot.zone_id] = after_gap
        withdrawn[option.zone_id] = withdrawn.get(option.zone_id, 0) + units
        total_cost += estimated_cost
        total_deadhead_km += option.distance_km * units

    residual = tuple(
        ResidualGap(
            zone_id=zone_id,
            gap_remaining=gap_left,
            # "Số xe cần huy động thêm" (§4.4): làm tròn LÊN vì nửa chiếc xe không tồn tại,
            # và thiếu xe là rủi ro vận hành còn thừa một offer thì tài xế được quyền từ chối.
            # Hệ số overbooking là việc của Activation Engine (§5.11), không nhân sẵn ở đây.
            suggested_activation=math.ceil(gap_left),
        )
        for zone_id, gap_left in sorted(remaining.items())
        if gap_left > FLOAT_TOLERANCE
    )

    plan_totals = PlanTotals(
        total_units=sum(move.units_to_move for move in moves),
        total_cost=total_cost,
        total_deadhead_km=total_deadhead_km,
        budget_cap=limits.budget_cap,
    )
    warnings = _collect_warnings(
        moves=moves,
        residual=residual,
        total_cost=total_cost,
        withdrawn=withdrawn,
        idle_by_zone=idle_by_zone,
        limits=limits,
    )

    logger.info(
        "Plan draft: %d move, %d xe, %d VNĐ/%d, residual %d zone",
        len(moves),
        plan_totals.total_units,
        total_cost,
        limits.budget_cap,
        len(residual),
    )
    return SolveResult(
        moves=tuple(moves),
        residual_gap=residual,
        plan_totals=plan_totals,
        source_capacities=tuple(sorted(capacity.items())),
        warnings=warnings,
    )


def _source_capacity(
    hotspot_output: HotspotOutput,
    *,
    t: datetime,
    limits: OptimizerLimits,
) -> dict[int, int]:
    """Số xe mỗi zone nguồn được rút, sau khi loại cooldown và zone đang là hotspot.

    Sức chứa tính MỘT LẦN rồi trừ dần: một zone nguồn có thể phục vụ nhiều hotspot, và nếu
    mỗi lần lại tính lại từ `idle_supply_current` gốc thì ràng buộc `max_supply_move_pct` và
    `min_supply_per_zone` chỉ đúng cho từng move chứ không đúng cho tổng — đó là cách A6/A7
    bị vi phạm mà từng move nhìn vẫn hợp lệ.
    """
    hotspot_ids = {hotspot.zone_id for hotspot in hotspot_output.hotspots}
    capacity: dict[int, int] = {}

    for zone in hotspot_output.surplus_zones:
        if zone.zone_id in hotspot_ids:
            logger.debug("Zone %d vừa là hotspot vừa có surplus (§4.3) — không dùng làm nguồn", zone.zone_id)
            continue
        if not is_source_available(zone.cooldown_until_ts, t=t):
            logger.debug("Zone %d còn cooldown đến %s — loại khỏi nguồn", zone.zone_id, zone.cooldown_until_ts)
            continue
        units = movable_units(
            idle_supply_current=zone.idle_supply_current,
            surplus=zone.surplus,
            limits=limits,
        )
        if units > 0:
            capacity[zone.zone_id] = units
    return capacity


def _ordered_targets(hotspots: Sequence[Hotspot], *, priority_zones: tuple[int, ...]) -> tuple[Hotspot, ...]:
    """Hotspot theo severity giảm dần, `priority_zones` xếp trước — §5.4.

    Chỉ giữ hotspot có gap DƯƠNG: hysteresis giữ một zone ở trạng thái hotspot thêm 3 step sau
    khi hết căng (§3.3), nên gap âm là chuyện bình thường — điều xe đến đó là điều xe vào nơi
    đang thừa.

    `zone_id` là khoá phá hoà cuối cùng để hai lần chạy cùng input cho ra cùng thứ tự (§3 #4).
    """
    priority = set(priority_zones)
    targets = [hotspot for hotspot in hotspots if hotspot.gap > FLOAT_TOLERANCE]
    return tuple(
        sorted(
            targets,
            key=lambda hotspot: (hotspot.zone_id not in priority, -hotspot.severity_score, hotspot.zone_id),
        )
    )


def _candidates_for(
    hotspot: Hotspot,
    *,
    sources: tuple[int, ...],
    rain_mm_h: Mapping[int, float],
    limits: OptimizerLimits,
    zone_coords: Mapping[int, ZoneCoord],
) -> tuple[_Candidate, ...]:
    """Ứng viên nguồn của MỘT hotspot, đã lọc `max_distance` và xếp theo "gần nhất, ưu tiên eta ≤ 3".

    Khoảng cách tính on-the-fly mỗi lần gọi (T3 AC #5) — không có bảng tra nào được giữ lại
    giữa các lần gọi, kể cả dạng cache trong bộ nhớ.

    Mưa lấy `max` của hai đầu tuyến: xe phải đi qua cả zone nguồn lẫn zone đích, nên lấy đầu
    nào khô hơn sẽ báo xe đến sớm hơn thực tế — sai về phía lạc quan, đúng thứ không được phép
    ở kịch bản `rain_peak`.
    """
    candidates: list[_Candidate] = []
    for source_id in sources:
        distance_km = distance_between(zone_coords, source_id, hotspot.zone_id)
        if not within_max_distance(distance_km, max_distance=limits.max_distance):
            continue
        rain_on_route = max(rain_mm_h[source_id], rain_mm_h[hotspot.zone_id])
        minutes = travel_minutes(distance_km, rain_mm_h=rain_on_route, limits=limits)
        candidates.append(
            _Candidate(
                zone_id=source_id,
                distance_km=distance_km,
                eta_steps=eta_steps_of(minutes),
                unit_cost=move_cost(distance_km, deadhead_cost_per_km=limits.deadhead_cost_per_km),
            )
        )

    return tuple(
        sorted(
            candidates,
            key=lambda candidate: (candidate.eta_steps > PREFERRED_ETA_STEPS, candidate.distance_km, candidate.zone_id),
        )
    )


def _optimal_allocations(
    targets: Sequence[Hotspot],
    *,
    capacity: Mapping[int, int],
    rain_mm_h: Mapping[int, float],
    limits: OptimizerLimits,
    zone_coords: Mapping[int, ZoneCoord],
) -> tuple[tuple[Hotspot, _Candidate, int], ...]:
    """Maximise covered vehicles, then minimise priority/ETA/distance cost.

    The previous target-by-target greedy could consume a source that was the only
    feasible source for another target. This integer transport model evaluates the
    complete source-target graph at once, so safe capacity is not stranded by order.
    """
    edges: list[tuple[Hotspot, _Candidate, int]] = []
    target_rank = {target.zone_id: rank for rank, target in enumerate(targets)}
    for target in targets:
        demand = _required_units(target.gap)
        if demand <= 0:
            continue
        for candidate in _candidates_for(
            target,
            sources=tuple(capacity),
            rain_mm_h=rain_mm_h,
            limits=limits,
            zone_coords=zone_coords,
        ):
            upper = min(demand, capacity[candidate.zone_id])
            if upper > 0:
                edges.append((target, candidate, upper))
    if not edges or limits.budget_cap <= 0:
        return ()

    variable_count = len(edges)
    rows: list[np.ndarray] = []
    lower: list[float] = []
    upper_bounds: list[float] = []
    for source_id, source_capacity in sorted(capacity.items()):
        row = np.array([1.0 if candidate.zone_id == source_id else 0.0 for _, candidate, _ in edges])
        rows.append(row)
        lower.append(0.0)
        upper_bounds.append(float(source_capacity))
    for target in targets:
        row = np.array([1.0 if edge_target.zone_id == target.zone_id else 0.0 for edge_target, _, _ in edges])
        rows.append(row)
        lower.append(0.0)
        upper_bounds.append(float(_required_units(target.gap)))
    unit_costs = np.array([float(candidate.unit_cost) for _, candidate, _ in edges])
    rows.append(unit_costs)
    lower.append(0.0)
    upper_bounds.append(float(limits.budget_cap))
    base_constraints = LinearConstraint(np.vstack(rows), np.array(lower), np.array(upper_bounds))
    bounds = Bounds(np.zeros(variable_count), np.array([float(edge_upper) for _, _, edge_upper in edges]))
    integrality = np.ones(variable_count)

    coverage_result = milp(
        c=-np.ones(variable_count),
        integrality=integrality,
        bounds=bounds,
        constraints=base_constraints,
    )
    if not coverage_result.success or coverage_result.x is None:
        raise RuntimeError(f"Không giải được bài toán phủ nguồn–đích: {coverage_result.message}")
    covered_units = int(round(float(np.sum(coverage_result.x))))
    if covered_units <= 0:
        return ()

    exact_coverage = LinearConstraint(np.ones((1, variable_count)), [float(covered_units)], [float(covered_units)])
    operational_cost = np.array([
        target_rank[target.zone_id] * 10_000_000
        + (candidate.eta_steps > PREFERRED_ETA_STEPS) * 1_000_000
        + candidate.eta_steps * 100_000
        + round(candidate.distance_km * 100) * 100
        + candidate.unit_cost
        + candidate.zone_id
        for target, candidate, _ in edges
    ], dtype=float)
    quality_result = milp(
        c=operational_cost,
        integrality=integrality,
        bounds=bounds,
        constraints=(base_constraints, exact_coverage),
    )
    if not quality_result.success or quality_result.x is None:
        raise RuntimeError(f"Không tối ưu được chất lượng phương án: {quality_result.message}")

    selected = [
        (target, candidate, int(round(value)))
        for (target, candidate, _), value in zip(edges, quality_result.x, strict=True)
        if value > FLOAT_TOLERANCE
    ]
    return tuple(sorted(selected, key=lambda item: (target_rank[item[0].zone_id], item[1].eta_steps, item[1].distance_km, item[1].zone_id)))


def _collect_warnings(
    *,
    moves: Sequence[Move],
    residual: Sequence[ResidualGap],
    total_cost: int,
    withdrawn: Mapping[int, int],
    idle_by_zone: Mapping[int, int],
    limits: OptimizerLimits,
) -> tuple[dict[str, object], ...]:
    """Cảnh báo §1.3 kèm theo plan. Mỗi cảnh báo cũng đi vào log WARNING (CLAUDE.md §9 #3).

    Thứ tự cố định (nặng → nhẹ, rồi theo zone_id) để hai lần chạy cùng input cho ra cùng
    `warnings[]` — UI và test so được từng phần tử.
    """
    warnings: list[dict[str, object]] = []

    if not moves and residual:
        # §5.9 dòng 1: không nghiệm là kết quả hợp lệ, KHÔNG ném exception.
        message = f"Không tìm được nguồn điều chuyển hợp lệ; {len(residual)} zone giữ nguyên toàn bộ gap."
        logger.warning("%s: %s", NO_SOLUTION, message)
        warnings.append({"code": NO_SOLUTION, "message": message})

    if limits.budget_cap > 0 and total_cost >= BUDGET_NEAR_CAP_RATIO * limits.budget_cap:
        message = (
            f"Chi phí điều chuyển {total_cost} VNĐ, đã chạm {BUDGET_NEAR_CAP_RATIO:.0%} budget_cap={limits.budget_cap}."
        )
        logger.warning("%s: %s", BUDGET_NEAR_CAP, message)
        warnings.append({"code": BUDGET_NEAR_CAP, "message": message})

    if residual:
        units_left = sum(item.gap_remaining for item in residual)
        message = f"Còn {units_left:.1f} xe chưa phủ ở {len(residual)} zone."
        logger.warning("%s: %s", PLAN_NOT_FULLY_COVERING_GAP, message)
        warnings.append({"code": PLAN_NOT_FULLY_COVERING_GAP, "message": message})

    for zone_id, units in sorted(withdrawn.items()):
        left = idle_by_zone[zone_id] - units
        if left > limits.min_supply_per_zone + NEAR_MIN_SUPPLY_MARGIN:
            continue
        message = (
            f"Zone {zone_id} sau khi rút còn {left} xe, sát ngưỡng min_supply_per_zone={limits.min_supply_per_zone}."
        )
        logger.warning("%s: %s", SOURCE_ZONE_NEAR_MIN_SUPPLY, message)
        warnings.append({"code": SOURCE_ZONE_NEAR_MIN_SUPPLY, "message": message, "zone_id": zone_id})

    return tuple(warnings)
