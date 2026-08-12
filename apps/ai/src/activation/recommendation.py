"""Build an auditable activation recommendation from optimizer residual gaps."""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from src.contracts.plan import ResidualGap


@dataclass(frozen=True)
class ZoneActivationRecommendation:
    zone_id: int
    gap_remaining: float
    requested_offers: int
    expected_units_gained: float
    expected_gap_remaining: float


@dataclass(frozen=True)
class ActivationRecommendation:
    target_zones: tuple[ZoneActivationRecommendation, ...]
    total_requested_offers: int
    total_expected_units_gained: float
    total_expected_gap_remaining: float
    projected_gap_reduction_pct: float
    worst_case_commitment: int
    constrained_by_budget: bool


def recommend_activation(
    residual: Sequence[ResidualGap],
    *,
    incentive_amount: int,
    incentive_budget_cap: int,
    overbooking_factor: float,
    assumed_accept_rate: float,
) -> ActivationRecommendation:
    """Size offers from residual demand; the budget is a guard, not an allocation target."""
    offer_capacity = incentive_budget_cap // incentive_amount if incentive_amount > 0 else 0
    targets: list[ZoneActivationRecommendation] = []
    requested_without_budget = 0
    remaining_capacity = offer_capacity

    ordered = sorted(
        (item for item in residual if item.gap_remaining > 0),
        key=lambda item: (-item.gap_remaining, item.zone_id),
    )
    for item in ordered:
        desired_offers = math.ceil(item.gap_remaining * overbooking_factor)
        requested_without_budget += desired_offers
        offers = min(desired_offers, remaining_capacity)
        if offers <= 0:
            continue
        expected_gain = min(item.gap_remaining, offers * assumed_accept_rate)
        targets.append(ZoneActivationRecommendation(
            zone_id=item.zone_id,
            gap_remaining=item.gap_remaining,
            requested_offers=offers,
            expected_units_gained=expected_gain,
            expected_gap_remaining=max(0.0, item.gap_remaining - expected_gain),
        ))
        remaining_capacity -= offers

    total_gap = sum(item.gap_remaining for item in ordered)
    total_offers = sum(item.requested_offers for item in targets)
    expected_gain = sum(item.expected_units_gained for item in targets)
    expected_remaining = max(0.0, total_gap - expected_gain)
    return ActivationRecommendation(
        target_zones=tuple(targets),
        total_requested_offers=total_offers,
        total_expected_units_gained=expected_gain,
        total_expected_gap_remaining=expected_remaining,
        projected_gap_reduction_pct=(expected_gain / total_gap * 100) if total_gap > 0 else 0.0,
        worst_case_commitment=total_offers * incentive_amount,
        constrained_by_budget=requested_without_budget > offer_capacity,
    )
