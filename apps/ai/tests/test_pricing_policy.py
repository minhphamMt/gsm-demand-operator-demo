from pathlib import Path

import numpy as np

from generate_snapshots import calculate_price_index, resolve_rain_source
from src.common.policy import load_policy

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_leader_pricing_policy_is_loaded_with_assumption_provenance() -> None:
    policy = load_policy(PROJECT_ROOT / "config" / "policy.yaml")

    # 20 chứ không còn 19: `zone_risk_gap_thresholds` được thêm khi gỡ thang rủi ro
    # hard-code khỏi `snapshot.mapper.ts`. Con số này là chốt chặn có chủ đích — thêm hay
    # bớt key mà không sửa ở đây thì test đỏ, đúng như nó sinh ra để làm.
    assert len(type(policy.rules).model_fields) == 20
    assert policy.pricing.status == "assumption"
    assert policy.pricing.customer_driver.base_fare_first_2km_vnd == 27_000
    assert policy.pricing.customer_driver.fare_per_km_after_2km_vnd == 9_000
    assert policy.pricing.business_driver.commission_rate_car == 0.25
    assert "no real" in policy.pricing.provenance.limitation.lower()


def test_price_index_follows_gap_formula_and_handles_zero_demand() -> None:
    policy = load_policy(PROJECT_ROOT / "config" / "policy.yaml")
    demand = np.array([0.0, 10.0, 20.0, 100.0])
    supply = np.array([0.0, 10.0, 10.0, 0.0])

    result = calculate_price_index(demand, supply, policy.pricing)

    assert result.tolist() == [1.0, 1.0, 1.25, 1.5]
    assert np.all(result >= policy.pricing.customer_driver.surge_min_multiplier)
    assert np.all(result <= policy.pricing.customer_driver.surge_max_multiplier)


def test_rain_source_falls_back_to_tracked_pre_refactor_dataset(tmp_path: Path) -> None:
    source = resolve_rain_source(tmp_path)

    assert source.is_file()
    assert source.name == "rain_hanoi_2025.csv"
    assert source.parent.name == "external"
