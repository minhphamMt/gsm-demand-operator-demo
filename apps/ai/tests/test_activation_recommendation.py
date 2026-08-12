import pytest

from src.activation.recommendation import recommend_activation
from src.contracts.plan import ResidualGap


def test_recommendation_sizes_each_zone_from_residual_without_filling_to_budget() -> None:
    result = recommend_activation(
        (
            ResidualGap(zone_id=2, gap_remaining=10, suggested_activation=10),
            ResidualGap(zone_id=1, gap_remaining=20, suggested_activation=20),
        ),
        incentive_amount=20_000,
        incentive_budget_cap=500_000,
        overbooking_factor=1.6,
        assumed_accept_rate=0.6,
    )

    assert result.total_requested_offers == 25
    assert [target.zone_id for target in result.target_zones] == [1]
    assert [target.requested_offers for target in result.target_zones] == [25]
    assert result.total_expected_units_gained == pytest.approx(15)
    assert result.total_expected_gap_remaining == pytest.approx(15)
    assert result.projected_gap_reduction_pct == pytest.approx(50)
    assert result.worst_case_commitment == 500_000
    assert result.constrained_by_budget is True


def test_recommendation_is_empty_without_residual_gap() -> None:
    result = recommend_activation(
        (),
        incentive_amount=20_000,
        incentive_budget_cap=500_000,
        overbooking_factor=1.6,
        assumed_accept_rate=0.6,
    )

    assert result.total_requested_offers == 0
    assert result.total_expected_units_gained == 0
    assert result.projected_gap_reduction_pct == 0
