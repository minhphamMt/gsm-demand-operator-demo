"""Dựng `ToolRegistry` gắn với một run cụ thể.

Tool ở đây là lớp vỏ mỏng bọc quanh các bước thuần ở `orchestration/steps.py` và các
module số học có sẵn (`optimizer/`, `hotspot/`, `simulation/metrics.py`). Vỏ mỏng là chủ ý:
nếu tool tự tính thêm bất cứ thứ gì, đường đồ thị sẽ lệch khỏi `POST /decisions` và cả hai
đều mang danh "kết quả của hệ thống".

`RunContext` là object khả biến **theo từng run**, không phải state toàn cục — mỗi request
dựng một cái mới. CLAUDE.md §5.3 #3 cấm biến global khả biến, không cấm state cục bộ của
một lần chạy.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from src.common.errors import NovaFourError
from src.common.haversine import get_zone_coords
from src.common.policy import Policy
from src.config import Settings
from src.contracts.forecast import HorizonMin
from src.contracts.plan import PlanTotals
from src.optimizer.constraints import limits_from_policy
from src.optimizer.greedy import PlanStrategy, SolveResult, solve
from src.orchestration.steps import (
    ForecastSelection,
    PlanningTargets,
    ZoneObservation,
    build_planning_targets,
    detect_hotspots,
    select_forecast,
)
from src.orchestration.tools.registry import (
    AGENT_ASSESSMENT,
    AGENT_DISPATCH,
    AGENT_EXPLANATION,
    AGENT_OBSERVER,
    NO_ARGS,
    ToolRegistry,
    ToolSpec,
)


@dataclass
class RunContext:
    """Dữ liệu đầu vào bất biến của một run, cộng với kết quả tích luỹ dần."""

    zones: Sequence[ZoneObservation]
    t: pd.Timestamp
    horizon_min: HorizonMin
    replay_source_at: pd.Timestamp | None
    policy: Policy
    settings: Settings

    selection: ForecastSelection | None = None
    targets: PlanningTargets | None = None
    solve_result: SolveResult | None = None
    # Ba phương án theo strategy. Rỗng cho tới khi node `generate_plans` chạy.
    plan_variants: dict[PlanStrategy, SolveResult] = field(default_factory=dict)
    warnings: list[dict[str, object]] = field(default_factory=list)

    @property
    def rain_mm_h(self) -> dict[int, float]:
        return {zone.zone_id: zone.rain_mm_h for zone in self.zones}

    @property
    def idle_supply(self) -> dict[int, int]:
        return {zone.zone_id: zone.idle_supply for zone in self.zones}


def empty_result(context: RunContext) -> SolveResult:
    """Phương án rỗng hợp lệ — không có đích nào cần điều xe.

    Không nghiệm là kết quả hợp lệ chứ không phải lỗi (§5.9): plan rỗng, không cảnh báo
    `NO_SOLUTION`, HTTP 200.
    """
    return SolveResult(
        moves=(),
        residual_gap=(),
        plan_totals=PlanTotals(
            total_units=0,
            total_cost=0,
            total_deadhead_km=0,
            budget_cap=context.policy.rules.budget_cap,
        ),
    )


def solve_strategy(context: RunContext, strategy: PlanStrategy) -> SolveResult:
    """Giải bài toán điều chuyển theo một strategy. Hàm thuần, gọi lại bao nhiêu lần cũng vậy."""
    targets = context.targets
    if targets is None or not targets.planning_output.hotspots:
        return empty_result(context)
    return solve(
        targets.planning_output,
        t=context.t,
        rain_mm_h=context.rain_mm_h,
        policy=context.policy,
        zone_coords=get_zone_coords(context.settings.zone_registry_path),
        protected_source_zone_ids=targets.policy_hotspot_ids,
        strategy=strategy,
    )


def build_registry(context: RunContext) -> ToolRegistry:
    """Đăng ký tool và gán allowlist cho ba agent.

    Không có `execute_relocation` hay `issue_offers` ở đây, và đó là điều kiện an toàn chứ
    không phải thiếu sót: side effect chỉ chạy ở NestJS sau hai cổng phê duyệt
    (CLAUDE.md §10.1 #8, §11.1).
    """
    registry = ToolRegistry()

    def run_forecast() -> dict[str, Any]:
        """Dự báo cung–cầu cho toàn bộ zone ở horizon đã chọn."""
        try:
            selection = select_forecast(
                zones=context.zones,
                t=context.t,
                horizon_min=context.horizon_min,
                replay_source_at=context.replay_source_at,
                model_directory=context.settings.data_dir / "models",
                configured_model_version=context.settings.model_version,
            )
        except NovaFourError as error:
            return {"status": "error", "code": error.error_code, "message": error.message}
        context.selection = selection
        context.warnings.extend(dict(warning) for warning in selection.warnings)
        return {
            "status": "ok",
            "forecast_mode": selection.mode,
            "regime": selection.forecast.regime,
            "model_version": selection.forecast.model_version,
            "zone_count": len(selection.forecast.zones),
            "horizon_min": selection.forecast.horizon_min,
        }

    def get_weather() -> dict[str, Any]:
        """Lượng mưa quan sát và dự báo ngắn hạn theo zone."""
        wet = [
            zone.zone_id
            for zone in context.zones
            if max(zone.rain_mm_h, zone.rain_forecast_15, zone.rain_forecast_30)
            >= context.policy.derived.rain_threshold_mm_h
        ]
        return {
            "status": "ok",
            "rain_threshold_mm_h": context.policy.derived.rain_threshold_mm_h,
            "wet_zone_ids": wet,
            "wet_zone_count": len(wet),
            "peak_zone_count": sum(1 for zone in context.zones if zone.peak_flag == 1),
            "max_rain_mm_h": max((zone.rain_mm_h for zone in context.zones), default=0.0),
        }

    def get_travel_conditions() -> dict[str, Any]:
        """Tham số di chuyển dùng để quy khoảng cách sang ETA.

        Trả tham số chứ không trả ma trận 30×30: khoảng cách được tính on-the-fly trong
        optimizer (T3 AC #5), và dựng sẵn ma trận ở đây là cài lại phép tính lần thứ hai.
        """
        limits = limits_from_policy(context.policy)
        return {
            "status": "ok",
            "avg_vehicle_speed_kmh": limits.avg_vehicle_speed_kmh,
            "rain_travel_factor_applied": any(
                zone.rain_mm_h >= context.policy.derived.rain_threshold_mm_h for zone in context.zones
            ),
            "max_distance_km": limits.max_distance,
        }

    def get_supply_state() -> dict[str, Any]:
        """Kiểm kê cung hiện tại, hotspot chính sách và zone dư."""
        if context.selection is None:
            return {"status": "error", "message": "Chưa có dự báo; gọi run_forecast trước."}
        hotspot_output = detect_hotspots(context.selection.forecast, context.zones, context.policy)
        targets = build_planning_targets(context.selection.forecast, hotspot_output, context.zones)
        context.targets = targets
        return {
            "status": "ok",
            "policy_hotspot_ids": sorted(targets.policy_hotspot_ids),
            "risk_zone_ids": [risk.zone_id for risk in targets.risk_zones],
            "surplus_zone_count": len(hotspot_output.surplus_zones),
            "conservative_gap_mode": hotspot_output.conservative_gap_mode,
            "planning_regime": targets.planning_regime,
            "total_idle_supply": sum(context.idle_supply.values()),
        }

    def compute_relocation() -> dict[str, Any]:
        """Giải bài toán điều chuyển từ zone dư sang zone thiếu (strategy cân bằng)."""
        if context.targets is None:
            return {"status": "error", "message": "Chưa có tập đích; gọi get_supply_state trước."}
        if not context.targets.planning_output.hotspots:
            context.solve_result = empty_result(context)
            return {"status": "ok", "planning_status": "not_required", "move_count": 0}
        result = solve_strategy(context, "BALANCED")
        context.solve_result = result
        return {
            "status": "ok",
            "planning_status": "optimizer_evaluated",
            "move_count": len(result.moves),
            "total_units": result.plan_totals.total_units,
            "total_cost": result.plan_totals.total_cost,
            "budget_cap": result.plan_totals.budget_cap,
            "residual_zone_count": len(result.residual_gap),
            "warning_codes": [str(warning.get("code")) for warning in result.warnings],
        }

    def render_explanation() -> dict[str, Any]:
        """Số liệu đã chốt để viết lời giải thích. Không tự sinh câu chữ.

        Tool này cố tình chỉ trả **số nguồn**: văn bản do node explanation dựng từ template
        hoặc do LLM viết lại, và bước validate sau đó đối chiếu từng con số với chính dict
        này. Nếu tool tự viết câu, sẽ không còn nguồn nào để đối chiếu.
        """
        if context.targets is None or context.solve_result is None:
            return {"status": "error", "message": "Chưa có phương án để giải thích."}
        result = context.solve_result
        return {
            "status": "ok",
            "move_count": len(result.moves),
            "total_units": result.plan_totals.total_units,
            "total_cost": result.plan_totals.total_cost,
            "budget_cap": result.plan_totals.budget_cap,
            "residual_zone_count": len(result.residual_gap),
            "policy_hotspot_count": len(context.targets.policy_hotspot_ids),
            "risk_zone_count": len(context.targets.risk_zones),
            "planning_regime": context.targets.planning_regime,
        }

    specs = (
        ToolSpec("run_forecast", "Dự báo cung–cầu 30 zone cho horizon hiện tại.", NO_ARGS, run_forecast),
        ToolSpec("get_weather", "Mưa quan sát và dự báo ngắn hạn theo zone.", NO_ARGS, get_weather),
        ToolSpec(
            "get_travel_conditions",
            "Tốc độ di chuyển trung bình và trần khoảng cách điều xe.",
            NO_ARGS,
            get_travel_conditions,
        ),
        ToolSpec(
            "get_supply_state",
            "Kiểm kê cung, hotspot chính sách và zone dư.",
            NO_ARGS,
            get_supply_state,
        ),
        ToolSpec(
            "compute_relocation",
            "Giải bài toán điều chuyển xe từ zone dư sang zone thiếu.",
            NO_ARGS,
            compute_relocation,
        ),
        ToolSpec(
            "render_explanation",
            "Lấy các con số đã chốt của phương án để viết lời giải thích.",
            NO_ARGS,
            render_explanation,
        ),
    )
    for spec in specs:
        registry.register(spec)

    registry.allow(
        AGENT_ASSESSMENT,
        frozenset({"run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"}),
    )
    registry.allow(AGENT_DISPATCH, frozenset({"compute_relocation"}))
    registry.allow(AGENT_EXPLANATION, frozenset({"render_explanation"}))
    # Observer nhìn thấy ĐÚNG bằng Assessment — bốn tool đó vốn đã chỉ-đọc cả bốn. Điều đáng
    # nói không phải nó nhỏ hơn Assessment, mà là nó là **tập con thật sự của cả registry**:
    # ba thứ vắng mặt dưới đây có ba lý do khác nhau, và không cái nào là bỏ sót.
    #   - `compute_relocation` sinh ra phương án. Một câu chat đẻ được plan là đẻ ra ngoài
    #     cổng phê duyệt §11.1.
    #   - `render_explanation` cho ra văn bản đi kèm quyết định, đã có `_numbers_are_grounded`
    #     canh riêng — không mở đường vòng.
    #   - `execute_relocation` / `issue_offers` chưa từng đăng ký ở đâu (xem docstring đầu file).
    registry.allow(AGENT_OBSERVER, OBSERVER_TOOLS)
    return registry


# Allowlist của agent quan sát. Khai báo trên cùng để test tĩnh so được nó với allowlist của
# Assessment mà không phải dựng registry.
OBSERVER_TOOLS: frozenset[str] = frozenset(
    {"run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"}
)

# Chuỗi tool cố định của chế độ deterministic. Thứ tự này là ràng buộc dữ liệu thật, không
# phải quy ước: `get_supply_state` cần forecast, `compute_relocation` cần tập đích.
DETERMINISTIC_SEQUENCE: dict[str, tuple[str, ...]] = {
    AGENT_ASSESSMENT: ("run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"),
    AGENT_DISPATCH: ("compute_relocation",),
    AGENT_EXPLANATION: ("render_explanation",),
}
