"""T0.7 AC #2 — mọi ví dụ JSON trong SPEC §4 parse được, mỗi ví dụ một test.

Ba ví dụ phải bồi thêm trước khi parse (§4.1, §4.2 chỉ in 1 zone; §4.6 dùng chuỗi giữ
chỗ). Phần bồi nằm ở spec_examples.py và được ghi rõ ở đó, không giấu trong test.
"""

from src.common.policy import Policy
from src.contracts.driver import Driver
from src.contracts.forecast import Forecast
from src.contracts.history import DriverResponseRecord, HistoryRecordAdapter, PlanDecisionRecord
from src.contracts.hotspot import HotspotOutput
from src.contracts.offer import ActivationOffer
from src.contracts.plan import RelocationPlan
from src.contracts.response import DriverResponse
from src.contracts.revision import RevisionRequest
from src.contracts.snapshot import Snapshot

from tests.test_contracts import spec_examples as ex


def test_spec_4_1_snapshot() -> None:
    snapshot = Snapshot.model_validate(ex.snapshot_30_zones())

    zone7 = next(zone for zone in snapshot.zones if zone.zone_id == 7)
    assert zone7.demand_observed == 42
    assert zone7.enroute_supply == 6
    assert [arrival.units for arrival in zone7.enroute_arrivals] == [4, 2]
    assert [arrival.source for arrival in zone7.enroute_arrivals] == ["relocation", "activation"]


def test_spec_4_2_forecast() -> None:
    forecast = Forecast.model_validate(ex.forecast_30_zones())

    zone7 = next(zone for zone in forecast.zones if zone.zone_id == 7)
    assert forecast.horizon_min == 15
    assert forecast.regime == "rain_peak"
    assert (zone7.demand_p10, zone7.predicted_demand, zone7.demand_p90) == (48.0, 55.0, 63.0)
    assert zone7.confidence is None


def test_spec_4_3_hotspot_output() -> None:
    hotspot_output = HotspotOutput.model_validate(ex.SPEC_4_3_HOTSPOT_OUTPUT)

    assert hotspot_output.hotspots[0].zone_id == 7
    assert hotspot_output.hotspots[0].is_hotspot is True
    assert hotspot_output.surplus_zones[0].cooldown_until_ts is None
    # Ví dụ SPEC không có field optional này — mặc định phải là None, không phải giá trị đoán.
    assert hotspot_output.conservative_gap_mode is None


def test_spec_4_4_relocation_plan() -> None:
    plan = RelocationPlan.model_validate(ex.SPEC_4_4_PLAN)

    assert plan.status == "Proposed"
    assert plan.plan_totals.total_units == 8
    assert plan.moves[0].after_gap == 33.0
    assert plan.activation is not None
    assert plan.activation.status == "Pending"
    assert plan.metrics_after_activation is None


def test_spec_4_4_relocation_plan_voi_policy_context(policy: Policy) -> None:
    """Ví dụ SPEC còn phải thoả `max_distance` khi nơi phát sinh truyền policy vào."""
    plan = RelocationPlan.model_validate(ex.SPEC_4_4_PLAN, context={"policy": policy})
    assert plan.moves[0].estimated_distance_km <= policy.rules.max_distance


def test_spec_4_5_revision_request() -> None:
    revision = RevisionRequest.model_validate(ex.SPEC_4_5_REVISION)

    assert revision.action == "revise"
    assert revision.revised_moves is not None
    assert revision.revised_moves[0].units_to_move == 5


def test_spec_4_6_plan_decision_record() -> None:
    record = PlanDecisionRecord.model_validate(ex.plan_decision_record())

    assert record.record_id == "H-000512"
    assert record.decided_by == "operator_demo_01"
    assert record.plan.plan_id == ex.SPEC_4_4_PLAN["plan_id"]
    assert record.activation_summary is not None
    assert record.activation_summary.accept_rate_source == "simulated_model"


def test_spec_4_6_driver_response_record() -> None:
    record = DriverResponseRecord.model_validate(ex.driver_response_record())

    assert record.record_id == "H-000513"
    assert record.decision == "accept"
    assert record.decline_reason is None
    assert record.response_latency_sec == 14


def test_spec_4_6_hai_bien_the_phan_biet_duoc_bang_record_type() -> None:
    """Union phân biệt bằng `record_type` — đọc kho về vẫn ra đúng biến thể."""
    assert isinstance(HistoryRecordAdapter.validate_python(ex.plan_decision_record()), PlanDecisionRecord)
    assert isinstance(HistoryRecordAdapter.validate_python(ex.driver_response_record()), DriverResponseRecord)


def test_spec_4_7_driver() -> None:
    driver = Driver.model_validate(ex.SPEC_4_7_DRIVER)

    assert driver.driver_id == "DRV-0142"
    assert driver.display_name == "Tài xế 142"
    assert driver.is_demo_account is True


def test_spec_4_8_activation_offer() -> None:
    offer = ActivationOffer.model_validate(ex.SPEC_4_8_OFFER)

    assert offer.driver_status_at_offer == "offline"
    assert offer.incentive_amount == 33000
    assert offer.status == "Sent"


def test_spec_4_8_activation_offer_voi_policy_context(policy: Policy) -> None:
    """Ví dụ SPEC thoả cả 3 ràng buộc theo policy: bán kính, trần thưởng, thời hạn.

    `eta_min = 12` của ví dụ KHÔNG được kiểm ở đây: 4.2 km / 25 km/h × 60 = 10.08, làm
    tròn lên là 11 — ví dụ SPEC tự lệch với công thức của chính nó. Ràng buộc công thức
    vào contract sẽ biến một lỗi tài liệu thành lỗi hệ thống; xem báo cáo T0.7.
    """
    offer = ActivationOffer.model_validate(ex.SPEC_4_8_OFFER, context={"policy": policy})

    assert offer.distance_km <= policy.rules.activation_radius_km
    assert offer.incentive_amount <= policy.rules.incentive_max_per_offer


def test_spec_4_9_driver_response() -> None:
    response = DriverResponse.model_validate(ex.SPEC_4_9_RESPONSE)

    assert response.decision == "accept"
    assert response.decline_reason is None
