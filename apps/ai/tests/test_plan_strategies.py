"""Ba strategy PLAN A/B/C — `agent/05-business-logic.md` §5.

Hai điều được khoá ở đây:

1. **`BALANCED` không đổi hành vi.** Nó là đường đang chạy; nếu nó lệch một field, baseline
   đã khóa và mọi số KPI đã công bố phải tính lại (§5.14.3). Test so từng field chứ không so
   tổng — hai plan khác tuyến vẫn có thể trùng tổng chi phí.
2. **Ba strategy phủ đúng cùng một lượng xe.** Pha 1 của MILP không nhận trọng số, nên khác
   biệt giữa ba plan chỉ nằm ở việc chọn tuyến. Nếu tổng số xe lệch nhau thì việc "so ba
   phương án" đã mất nghĩa.
"""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.common.haversine import get_zone_coords
from src.common.policy import get_policy
from src.config import get_settings
from src.main import app
from src.optimizer.greedy import STRATEGY_WEIGHTS, TARGET_RANK_SCALE, PlanStrategy, solve
from src.orchestration.graph import SCORING_VERSION, _recommend, run_pipeline
from src.orchestration.steps import build_planning_targets, detect_hotspots, select_forecast
from src.orchestration.tools.decision_tools import RunContext
from tests.test_orchestration_parity import _Zone, _zones_at

STRATEGIES: tuple[PlanStrategy, ...] = ("MIN_COST", "BALANCED", "MIN_ETA")

# Mưa giờ cao điểm: kịch bản duy nhất mà ETA KHÔNG tỉ lệ thuần với khoảng cách, vì hệ số mưa
# lấy max của hai đầu tuyến. Đây là nơi ba strategy có cơ hội khác nhau thật sự.
RAIN_PEAK_SOURCE = "2026-09-25T08:30:00+07:00"


def _solve_all(source_at: str) -> dict[PlanStrategy, object]:
    settings = get_settings()
    policy = get_policy(settings.policy_path)
    with TestClient(app) as client:
        raw_zones = _zones_at(client, source_at)
    zones = [_Zone(zone) for zone in raw_zones]
    t = pd.Timestamp(source_at)
    selection = select_forecast(
        zones=zones,
        t=t,
        horizon_min=15,
        replay_source_at=t,
        model_directory=settings.data_dir / "models",
        configured_model_version=settings.model_version,
    )
    hotspot_output = detect_hotspots(selection.forecast, zones, policy)
    targets = build_planning_targets(selection.forecast, hotspot_output, zones)
    return {
        strategy: solve(
            targets.planning_output,
            t=t,
            rain_mm_h={zone.zone_id: zone.rain_mm_h for zone in zones},
            policy=policy,
            zone_coords=get_zone_coords(settings.zone_registry_path),
            protected_source_zone_ids=targets.policy_hotspot_ids,
            strategy=strategy,
        )
        for strategy in STRATEGIES
    }


def test_balanced_is_the_default_strategy() -> None:
    """Gọi `solve()` không truyền strategy phải cho ra đúng plan BALANCED.

    Đây là điều giữ cho mọi caller cũ — kể cả `POST /decisions` — không đổi hành vi.
    """
    settings = get_settings()
    policy = get_policy(settings.policy_path)
    with TestClient(app) as client:
        raw_zones = _zones_at(client, RAIN_PEAK_SOURCE)
    zones = [_Zone(zone) for zone in raw_zones]
    t = pd.Timestamp(RAIN_PEAK_SOURCE)
    selection = select_forecast(
        zones=zones,
        t=t,
        horizon_min=15,
        replay_source_at=t,
        model_directory=settings.data_dir / "models",
        configured_model_version=settings.model_version,
    )
    hotspot_output = detect_hotspots(selection.forecast, zones, policy)
    targets = build_planning_targets(selection.forecast, hotspot_output, zones)
    common = {
        "t": t,
        "rain_mm_h": {zone.zone_id: zone.rain_mm_h for zone in zones},
        "policy": policy,
        "zone_coords": get_zone_coords(settings.zone_registry_path),
        "protected_source_zone_ids": targets.policy_hotspot_ids,
    }
    implicit = solve(targets.planning_output, **common)  # type: ignore[arg-type]
    explicit = solve(targets.planning_output, **common, strategy="BALANCED")  # type: ignore[arg-type]

    assert implicit.moves == explicit.moves
    assert implicit.residual_gap == explicit.residual_gap
    assert implicit.plan_totals == explicit.plan_totals
    assert implicit.source_capacities == explicit.source_capacities
    assert implicit.warnings == explicit.warnings


def test_every_strategy_moves_the_same_number_of_vehicles() -> None:
    """Pha phủ dùng chung → ba plan luôn điều đúng cùng một lượng xe."""
    results = _solve_all(RAIN_PEAK_SOURCE)
    totals = {strategy: result.plan_totals.total_units for strategy, result in results.items()}  # type: ignore[attr-defined]
    assert len(set(totals.values())) == 1, f"Số xe lệch giữa các strategy: {totals}"


def test_every_strategy_respects_the_relocation_budget() -> None:
    """Trần ngân sách là ràng buộc cứng của cả ba, không phải mục tiêu để đánh đổi."""
    for strategy, result in _solve_all(RAIN_PEAK_SOURCE).items():
        totals = result.plan_totals  # type: ignore[attr-defined]
        assert totals.total_cost <= totals.budget_cap, f"{strategy} vượt budget_cap"


def test_min_cost_is_never_more_expensive_than_min_eta() -> None:
    """Kiểm tra strategy thật sự tối ưu đúng thứ nó tuyên bố."""
    results = _solve_all(RAIN_PEAK_SOURCE)
    min_cost = results["MIN_COST"].plan_totals.total_cost  # type: ignore[attr-defined]
    min_eta = results["MIN_ETA"].plan_totals.total_cost  # type: ignore[attr-defined]
    assert min_cost <= min_eta


def test_min_eta_never_arrives_later_than_min_cost() -> None:
    results = _solve_all(RAIN_PEAK_SOURCE)
    eta_of = {
        strategy: sum(move.eta_steps * move.units_to_move for move in result.moves)  # type: ignore[attr-defined]
        for strategy, result in results.items()
    }
    assert eta_of["MIN_ETA"] <= eta_of["MIN_COST"]


@pytest.mark.parametrize("strategy", STRATEGIES)
def test_severity_priority_outranks_every_strategy_weight(strategy: PlanStrategy) -> None:
    """Thứ tự severity là luật chính sách, không phải thứ strategy được đánh đổi.

    Tổng trọng số tối đa của một cạnh phải nhỏ hơn một bậc `target_rank`, nếu không một
    tuyến rẻ tới hotspot nhẹ có thể thắng một tuyến đắt tới hotspot nặng.
    """
    weights = STRATEGY_WEIGHTS[strategy]
    # Chặn trên rộng rãi: ETA 12 step, quãng đường 50 km, chi phí một xe 200k VNĐ.
    worst_case = (
        weights.eta_over_threshold
        + 12 * weights.eta_step
        + 5_000 * weights.distance_centi_km
        + 200_000 * weights.unit_cost
        + 30
    )
    assert worst_case < TARGET_RANK_SCALE, f"{strategy}: {worst_case} >= {TARGET_RANK_SCALE}"


@pytest.mark.parametrize("strategy", STRATEGIES)
def test_solve_is_deterministic_across_repeated_runs(strategy: PlanStrategy) -> None:
    """Cùng input, cùng strategy → cùng plan. Không có tie-break ngẫu nhiên nào lọt vào."""
    first = _solve_all(RAIN_PEAK_SOURCE)[strategy]
    second = _solve_all(RAIN_PEAK_SOURCE)[strategy]
    assert first.moves == second.moves  # type: ignore[attr-defined]


def test_pipeline_reports_all_three_plans_and_flags_convergence() -> None:
    """Đồ thị phải trả đủ ba plan và nói rõ khi chúng trùng nhau.

    Hiện ba thẻ giống hệt nhau mà không nói gì sẽ làm điều phối viên tưởng mình đang có ba
    lựa chọn thật. `converged` là để UI nói thẳng điều đó.
    """
    settings = get_settings()
    with TestClient(app) as client:
        raw_zones = _zones_at(client, RAIN_PEAK_SOURCE)
    context = RunContext(
        zones=[_Zone(zone) for zone in raw_zones],
        t=pd.Timestamp(RAIN_PEAK_SOURCE),
        horizon_min=15,
        replay_source_at=pd.Timestamp(RAIN_PEAK_SOURCE),
        policy=get_policy(settings.policy_path),
        settings=settings,
    )
    state = run_pipeline(context, snapshot_id="plans", data_source="AI_PARQUET_REPLAY:plans")

    plan_set = state["plan_set"]
    assert [plan["plan_id"] for plan in plan_set["plans"]] == ["PLAN_A", "PLAN_B", "PLAN_C"]
    assert [plan["strategy"] for plan in plan_set["plans"]] == list(STRATEGIES)
    assert plan_set["scoring_version"] == SCORING_VERSION

    # Trạng thái hội tụ phải khớp thực tế, không phải hằng số viết cứng.
    distinct = {result.moves for result in context.plan_variants.values()}  # type: ignore[attr-defined]
    assert plan_set["converged"] is (len(distinct) == 1)
    assert plan_set["distinct_plan_count"] == len(distinct)

    if plan_set["converged"]:
        assert any(warning["code"] == "PLAN_STRATEGIES_CONVERGED" for warning in state["warnings"])


def test_recommended_plan_prefers_balanced_when_all_strategies_tie() -> None:
    """Hoà thì chọn BALANCED — đây là điều giữ quyết định của đồ thị trùng `POST /decisions`."""
    variants = _solve_all(RAIN_PEAK_SOURCE)
    if len({result.moves for result in variants.values()}) > 1:  # type: ignore[attr-defined]
        pytest.skip("Ba strategy đã tách nhau; luật phá hoà không còn áp dụng ở đây.")
    assert _recommend(variants) == "BALANCED"  # type: ignore[arg-type]
