from datetime import datetime, timedelta, timezone

import pytest

from src.common.haversine import EARTH_RADIUS_KM, ZoneCoord
from src.common.policy import DEFAULT_POLICY_PATH, Policy, load_policy
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.optimizer.greedy import solve

T0 = datetime(2026, 9, 25, 8, 0, tzinfo=timezone(timedelta(hours=7)))
KM_PER_DEGREE_LAT = EARTH_RADIUS_KM * 3.141592653589793 / 180.0


def policy(**overrides: object) -> Policy:
    loaded = load_policy(DEFAULT_POLICY_PATH)
    return loaded.model_copy(update={"rules": loaded.rules.model_copy(update=overrides)})


def line_coords() -> dict[int, ZoneCoord]:
    return {
        zone_id: ZoneCoord(zone_id=zone_id, lat=(zone_id - 1) / KM_PER_DEGREE_LAT, lng=105.8)
        for zone_id in range(1, 31)
    }


def hotspot(zone_id: int, gap: float, severity: float) -> Hotspot:
    return Hotspot(
        zone_id=zone_id,
        is_hotspot=True,
        gap=gap,
        severity_score=severity,
        idle_supply_current=0,
    )


def source(zone_id: int, surplus: float, idle: int = 20) -> SurplusZone:
    return SurplusZone(
        zone_id=zone_id,
        surplus=surplus,
        idle_supply_current=idle,
        cooldown_until_ts=None,
    )


def output(hotspots: list[Hotspot], sources: list[SurplusZone]) -> HotspotOutput:
    return HotspotOutput(
        forecast_ts=T0 + timedelta(minutes=15),
        horizon_min=15,
        hotspots=tuple(hotspots),
        surplus_zones=tuple(sources),
        conservative_gap_mode=None,
    )


def run(problem: HotspotOutput, configured_policy: Policy):
    return solve(
        problem,
        t=T0,
        rain_mm_h=dict.fromkeys(range(1, 31), 0.0),
        policy=configured_policy,
        zone_coords=line_coords(),
    )


def test_transport_graph_does_not_strand_a_constrained_source() -> None:
    problem = output(
        hotspots=[hotspot(3, 2.0, 0.9), hotspot(6, 2.0, 0.5)],
        sources=[source(1, 2.0), source(4, 2.0)],
    )

    result = run(problem, policy(max_distance=2.1, budget_cap=500_000))

    assert result.plan_totals.total_units == 4
    assert {(move.from_zone, move.to_zone, move.units_to_move) for move in result.moves} == {
        (1, 3, 2),
        (4, 6, 2),
    }
    assert result.residual_gap == ()


def test_cost_and_deadhead_are_multiplied_by_vehicle_count() -> None:
    problem = output(
        hotspots=[hotspot(3, 3.0, 0.9)],
        sources=[source(2, 3.0)],
    )

    result = run(problem, policy(budget_cap=500_000))
    move = result.moves[0]

    assert move.units_to_move == 3
    assert move.estimated_distance_km == pytest.approx(1.0)
    assert move.estimated_cost == 3 * 4_000
    assert result.plan_totals.total_cost == 12_000
    assert result.plan_totals.total_deadhead_km == pytest.approx(3.0)


def test_budget_is_applied_per_vehicle_not_per_route() -> None:
    problem = output(
        hotspots=[hotspot(3, 3.0, 0.9)],
        sources=[source(2, 3.0)],
    )

    result = run(problem, policy(budget_cap=8_000))

    assert result.plan_totals.total_units == 2
    assert result.plan_totals.total_cost == 8_000
    assert result.residual_gap[0].gap_remaining == pytest.approx(1.0)


def test_fractional_forecast_gap_rounds_to_the_nearest_vehicle() -> None:
    problem = output(
        hotspots=[hotspot(3, 0.8, 0.2), hotspot(5, 0.2, 0.1)],
        sources=[source(2, 2.0)],
    )

    result = run(problem, policy(budget_cap=500_000))

    assert result.plan_totals.total_units == 1
    assert result.moves[0].to_zone == 3
    assert result.residual_gap[0].zone_id == 5
    assert result.residual_gap[0].gap_remaining == pytest.approx(0.2)
