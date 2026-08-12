"""T0.7 AC #3 — 8 validator bắt buộc, mỗi cái một test, cộng các ràng buộc kèm theo.

Tám ca của AC (theo IMPLEMENTATION_PLAN T0.7):
    zone_id ∉ [1,30] · horizon_min ∉ {15,30} · enroute_supply ≠ Σ units ·
    p10 > p50 hoặc p50 > p90 · note rỗng khi action=="reject" ·
    driver_status_at_offer == "online_busy" · is_demo_account == false ·
    distance_km > activation_radius_km
"""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from src.common.policy import Policy
from src.contracts.driver import Driver
from src.contracts.forecast import Forecast, ZoneForecast
from src.contracts.history import HistoryActivationSummary, PlanDecisionRecord
from src.contracts.hotspot import HotspotOutput
from src.contracts.offer import ActivationOffer
from src.contracts.plan import ActivationSummary, Metrics, Move, PlanTotals, RelocationPlan
from src.contracts.response import DriverResponse
from src.contracts.revision import RevisionRequest
from src.contracts.snapshot import Snapshot
from tests.test_contracts import mocks
from tests.test_contracts import spec_examples as ex

# ======================================================================================
# AC #3 — tám ca bắt buộc
# ======================================================================================


@pytest.mark.parametrize("bad_zone_id", [0, 31, -1])
def test_ac3_1_zone_id_ngoai_1_30(bad_zone_id: int) -> None:
    payload = ex.snapshot_30_zones()
    payload["zones"][0]["zone_id"] = bad_zone_id

    with pytest.raises(ValidationError):
        Snapshot.model_validate(payload)


@pytest.mark.parametrize("bad_horizon", [10, 20, 45, 0])
def test_ac3_2_horizon_min_ngoai_15_30(bad_horizon: int) -> None:
    payload = ex.forecast_30_zones()
    payload["horizon_min"] = bad_horizon

    with pytest.raises(ValidationError):
        Forecast.model_validate(payload)


def test_ac3_3_enroute_supply_lech_tong_units() -> None:
    """INV-3 — số tổng và lịch đến chi tiết không được kể hai câu chuyện khác nhau."""
    payload = ex.snapshot_30_zones()
    zone7 = next(zone for zone in payload["zones"] if zone["zone_id"] == 7)
    zone7["enroute_supply"] = 7  # thật ra là 4 + 2 = 6

    with pytest.raises(ValidationError, match="INV-3 vỡ ở zone 7"):
        Snapshot.model_validate(payload)


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("demand_p10", 60.0, "demand_p10=60.0 vượt p50=55.0"),
        ("demand_p90", 50.0, "demand p50=55.0 vượt demand_p90=50.0"),
        ("supply_p10", 20.0, "supply_p10=20.0 vượt p50=14.0"),
        ("supply_p90", 10.0, "supply p50=14.0 vượt supply_p90=10.0"),
    ],
)
def test_ac3_4_quantile_crossing(field: str, value: float, expected: str) -> None:
    """LightGBM train 3 objective quantile độc lập nên crossing xảy ra được thật."""
    payload = deepcopy(ex.SPEC_4_2_ZONE_7)
    payload[field] = value

    with pytest.raises(ValidationError, match=expected):
        ZoneForecast.model_validate(payload)


@pytest.mark.parametrize("bad_note", [None, "", "   ", "\n\t"])
def test_ac3_5_reject_thieu_note(bad_note: str | None) -> None:
    payload = deepcopy(ex.SPEC_4_5_REVISION)
    payload["action"] = "reject"
    payload["revised_moves"] = None
    payload["note"] = bad_note

    with pytest.raises(ValidationError, match="bắt buộc có note không rỗng"):
        RevisionRequest.model_validate(payload)


def test_ac3_6_driver_status_at_offer_khong_duoc_online_busy() -> None:
    """Tài xế đang chở khách bị loại khỏi tập ứng viên TRƯỚC khi có offer nào (§4.8)."""
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["driver_status_at_offer"] = "online_busy"

    with pytest.raises(ValidationError):
        ActivationOffer.model_validate(payload)


def test_ac3_7_is_demo_account_false_bi_tu_choi() -> None:
    """C-03 — chốt chặn giữa hệ thống mô phỏng và hệ thống trả tiền cho người thật."""
    payload = deepcopy(ex.SPEC_4_7_DRIVER)
    payload["is_demo_account"] = False

    with pytest.raises(ValidationError, match="is_demo_account phải là true"):
        Driver.model_validate(payload)


def test_ac3_8_distance_km_vuot_activation_radius(policy: Policy) -> None:
    """Ràng buộc theo ngưỡng chỉ chạy khi NƠI PHÁT HÀNH truyền policy vào context."""
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["distance_km"] = policy.rules.activation_radius_km + 0.1

    with pytest.raises(ValidationError, match="vượt activation_radius_km"):
        ActivationOffer.model_validate(payload, context={"policy": policy})


def test_ac3_8_khong_co_context_thi_khong_kiem_nguong(policy: Policy) -> None:
    """Cùng payload đó phải parse được khi KHÔNG truyền policy.

    Đây là điều kiện để History (append-only) còn đọc lại được bản ghi cũ sau khi PM
    chỉnh ngưỡng — nếu không, một lần đổi `activation_radius_km` sẽ xoá sổ audit trail.
    """
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["distance_km"] = policy.rules.activation_radius_km + 0.1

    offer = ActivationOffer.model_validate(payload)
    assert offer.distance_km > policy.rules.activation_radius_km


# ======================================================================================
# Ràng buộc kèm theo — cùng nguồn SPEC, không phải tiêu chí tự nghĩ
# ======================================================================================


def test_snapshot_eta_steps_lech_arrival_ts() -> None:
    payload = ex.snapshot_30_zones()
    zone7 = next(zone for zone in payload["zones"] if zone["zone_id"] == 7)
    zone7["enroute_arrivals"][0]["eta_steps"] = 5  # đúng phải là 2

    with pytest.raises(ValidationError, match="eta_steps=5 không khớp"):
        Snapshot.model_validate(payload)


def test_snapshot_arrival_ts_trong_qua_khu() -> None:
    payload = ex.snapshot_30_zones()
    zone7 = next(zone for zone in payload["zones"] if zone["zone_id"] == 7)
    zone7["enroute_arrivals"][0]["arrival_ts"] = "2026-08-02T17:00:00+07:00"

    with pytest.raises(ValidationError, match="phải sau t="):
        Snapshot.model_validate(payload)


def test_snapshot_arrival_from_zone_trung_zone_dich() -> None:
    payload = ex.snapshot_30_zones()
    zone7 = next(zone for zone in payload["zones"] if zone["zone_id"] == 7)
    zone7["enroute_arrivals"][0]["from_zone"] = 7

    with pytest.raises(ValidationError, match="from_zone trùng chính zone đích"):
        Snapshot.model_validate(payload)


def test_snapshot_datetime_lech_luoi_5_phut() -> None:
    payload = ex.snapshot_30_zones()
    payload["t"] = "2026-08-02T17:07:00+07:00"

    with pytest.raises(ValidationError, match="phải rơi đúng bước 5 phút"):
        Snapshot.model_validate(payload)


def test_snapshot_datetime_khong_offset_bi_tu_choi() -> None:
    """CLAUDE.md §5.2 cấm naive datetime — thiếu offset là mất 7 tiếng một cách im lặng."""
    payload = ex.snapshot_30_zones()
    payload["t"] = "2026-08-02T17:05:00"

    with pytest.raises(ValidationError):
        Snapshot.model_validate(payload)


def test_forecast_ts_lech_horizon() -> None:
    payload = ex.forecast_30_zones()
    payload["horizon_min"] = 30  # forecast_ts vẫn là t + 15

    with pytest.raises(ValidationError, match="phải bằng t \\+ 30 phút"):
        Forecast.model_validate(payload)


def test_forecast_model_version_rong() -> None:
    payload = ex.forecast_30_zones()
    payload["model_version"] = ""

    with pytest.raises(ValidationError):
        Forecast.model_validate(payload)


def test_hotspot_surplus_khong_duong() -> None:
    payload = deepcopy(ex.SPEC_4_3_HOTSPOT_OUTPUT)
    payload["surplus_zones"][0]["surplus"] = 0.0

    with pytest.raises(ValidationError, match="phải dương mới vào surplus_zones"):
        HotspotOutput.model_validate(payload)


def test_hotspot_zone_lap_trong_cung_danh_sach() -> None:
    payload = deepcopy(ex.SPEC_4_3_HOTSPOT_OUTPUT)
    payload["hotspots"].append(deepcopy(payload["hotspots"][0]))

    with pytest.raises(ValidationError, match="hotspots có zone_id lặp"):
        HotspotOutput.model_validate(payload)


def test_move_from_zone_trung_to_zone() -> None:
    payload = deepcopy(ex.SPEC_4_4_PLAN["moves"][0])
    payload["to_zone"] = payload["from_zone"]

    with pytest.raises(ValidationError, match="move rỗng nghĩa"):
        Move.model_validate(payload)


def test_move_after_gap_khong_khop_cong_thuc() -> None:
    payload = deepcopy(ex.SPEC_4_4_PLAN["moves"][0])
    payload["after_gap"] = 30.0  # đúng phải là 41.0 − 8 = 33.0

    with pytest.raises(ValidationError, match="phải bằng before_gap − units_to_move"):
        Move.model_validate(payload)


def test_move_vuot_max_distance(policy: Policy) -> None:
    payload = deepcopy(ex.SPEC_4_4_PLAN["moves"][0])
    payload["estimated_distance_km"] = policy.rules.max_distance + 0.5
    payload["deadhead_km"] = payload["estimated_distance_km"]

    with pytest.raises(ValidationError, match="vượt max_distance"):
        Move.model_validate(payload, context={"policy": policy})


def test_plan_totals_vuot_budget_cap() -> None:
    """Trần điều chuyển là ràng buộc CỨNG, kiểm được ngay vì trần được echo trong object."""
    with pytest.raises(ValidationError, match="vượt budget_cap"):
        PlanTotals.model_validate(
            {"total_units": 8, "total_cost": 500001, "total_deadhead_km": 4.2, "budget_cap": 500000}
        )


def test_plan_totals_lech_tong_moves() -> None:
    payload = deepcopy(ex.SPEC_4_4_PLAN)
    payload["plan_totals"]["total_units"] = 99

    with pytest.raises(ValidationError, match="total_units=99 không bằng Σ moves"):
        RelocationPlan.model_validate(payload)


def test_metrics_by_regime_thieu_regime() -> None:
    """rain_peak là thước đo thành công chính, không được vắng mặt (CLAUDE.md §3 #6)."""
    payload = mocks.mock_metrics(1.0, with_by_regime=True)
    del payload["by_regime"]["rain_peak"]

    with pytest.raises(ValidationError, match="by_regime thiếu regime"):
        Metrics.model_validate(payload)


def test_metrics_by_regime_khong_duoc_long_tang() -> None:
    payload = mocks.mock_metrics(1.0, with_by_regime=True)
    payload["by_regime"]["rain"] = mocks.mock_metrics(1.0, with_by_regime=True)

    with pytest.raises(ValidationError, match="by_regime không được lồng thêm tầng"):
        Metrics.model_validate(payload)


def test_activation_summary_vuot_tran_incentive() -> None:
    """C-09 — trần incentive độc lập, không bù trừ với trần điều chuyển."""
    payload = deepcopy(ex.SPEC_4_4_PLAN["activation"])
    payload["incentive_committed"] = payload["incentive_budget_cap"] + 1000

    with pytest.raises(ValidationError, match="vượt incentive_budget_cap"):
        ActivationSummary.model_validate(payload)


def test_activation_summary_units_gained_lech_offers_accepted() -> None:
    payload = deepcopy(ex.SPEC_4_4_PLAN["activation"])
    payload["offers_accepted"] = 3
    payload["units_gained"] = 5

    with pytest.raises(ValidationError, match="phải bằng offers_accepted"):
        ActivationSummary.model_validate(payload)


def test_offer_incentive_khong_lam_tron_nghin() -> None:
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["incentive_amount"] = 33500

    with pytest.raises(ValidationError, match="phải làm tròn bội số 1000đ"):
        ActivationOffer.model_validate(payload)


def test_offer_expires_at_khong_khop_ttl(policy: Policy) -> None:
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["expires_at"] = "2026-08-02T17:20:30+07:00"  # +14 phút thay vì +10

    with pytest.raises(ValidationError, match="phải bằng created_at \\+ offer_ttl_minutes"):
        ActivationOffer.model_validate(payload, context={"policy": policy})


def test_offer_expires_at_truoc_created_at() -> None:
    payload = deepcopy(ex.SPEC_4_8_OFFER)
    payload["expires_at"] = payload["created_at"]

    with pytest.raises(ValidationError, match="phải sau created_at"):
        ActivationOffer.model_validate(payload)


def test_driver_display_name_khong_phai_nhan_gia() -> None:
    """§8 #4 — cấm dữ liệu cá nhân thật trong registry."""
    payload = deepcopy(ex.SPEC_4_7_DRIVER)
    payload["display_name"] = "Nguyễn Văn A"

    with pytest.raises(ValidationError):
        Driver.model_validate(payload)


def test_driver_response_khong_nhan_expired() -> None:
    """`expired` do hệ thống sinh, không phải hành động tài xế (§4.9)."""
    payload = deepcopy(ex.SPEC_4_9_RESPONSE)
    payload["decision"] = "expired"

    with pytest.raises(ValidationError):
        DriverResponse.model_validate(payload)


def test_driver_response_tu_choi_khong_can_ly_do() -> None:
    """C-08 — từ chối 1 chạm, lý do KHÔNG bắt buộc. Đây là ca phải PASS, không phải fail."""
    payload = deepcopy(ex.SPEC_4_9_RESPONSE)
    payload["decision"] = "decline"
    payload["decline_reason"] = None

    assert DriverResponse.model_validate(payload).decline_reason is None


def test_history_rejected_thieu_note() -> None:
    payload = mocks.mock_plan_decision_record()
    payload["note"] = "   "

    with pytest.raises(ValidationError, match="bắt buộc có note không rỗng"):
        PlanDecisionRecord.model_validate(payload)


def test_history_activation_summary_thieu_accept_rate_source() -> None:
    """C-07 — không có mặc định: thiếu field này thì bảng KPI không phân biệt được nguồn số."""
    payload = deepcopy(ex.SPEC_4_6_PLAN_DECISION_RAW["activation_summary"])
    del payload["accept_rate_source"]

    with pytest.raises(ValidationError):
        HistoryActivationSummary.model_validate(payload)


def test_history_activation_summary_dem_vuot_offers_sent() -> None:
    payload = deepcopy(ex.SPEC_4_6_PLAN_DECISION_RAW["activation_summary"])
    payload["offers_declined"] = 5  # 5 + 5 + 1 = 11 > 8

    with pytest.raises(ValidationError, match="vượt offers_sent"):
        HistoryActivationSummary.model_validate(payload)


def test_field_la_bi_tu_choi() -> None:
    """`extra="forbid"` — gõ sai tên field không được im lặng trôi qua."""
    payload = deepcopy(ex.SPEC_4_7_DRIVER)
    payload["driver_score"] = 0.9

    with pytest.raises(ValidationError):
        Driver.model_validate(payload)


def test_model_bat_bien() -> None:
    """`frozen=True` — object đã ghi vào History không được sửa tại chỗ (§3.2 #7)."""
    driver = Driver.model_validate(ex.SPEC_4_7_DRIVER)

    with pytest.raises(ValidationError):
        driver.home_zone = 5  # type: ignore[misc]


@pytest.mark.parametrize(
    ("bad_id", "model_key"),
    [("H-12345", "record_id"), ("H-1234567", "record_id")],
)
def test_record_id_sai_dinh_dang(bad_id: str, model_key: str) -> None:
    """`H-nnnnnn` đúng 6 chữ số — định dạng lệch làm thứ tự đơn điệu hết so sánh được."""
    payload = mocks.mock_plan_decision_record()
    payload[model_key] = bad_id

    with pytest.raises(ValidationError):
        PlanDecisionRecord.model_validate(payload)
