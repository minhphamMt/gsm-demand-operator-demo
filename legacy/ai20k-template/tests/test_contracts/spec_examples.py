"""Ví dụ JSON của SPEC §4.1–4.9, chép NGUYÊN VĂN, cộng phần mở rộng có ghi chú.

T0.7 AC #2 đòi mọi ví dụ trong SPEC §4 parse được. Ba ví dụ không parse được y nguyên
vì bản thân chúng là đoạn trích chứ không phải message đầy đủ — chỗ nào phải bồi thêm
đều ghi rõ ở đây, KHÔNG sửa ngầm trong test:

    §4.1  chỉ in 1 zone (zone 7) thay vì 30      → bồi 29 zone đệm
    §4.2  chỉ in 1 zone (zone 7) thay vì 30      → bồi 29 zone đệm
    §4.6A `record_type` bị bỏ; `decision` là chuỗi liệt kê "approved | rejected |
          revised"; `plan`/`metrics_*` là `{}` giữ chỗ  → điền giá trị thật
    §4.6B `decision` là chuỗi liệt kê "accept | decline | expired" → chọn "accept"

Hai chỗ SPEC tự mâu thuẫn với công thức của chính nó, KHÔNG sửa ở đây và cũng không
ràng buộc trong contract — xem báo cáo T0.7:
    §4.4 `estimated_cost: 126000` với 4.2 km, trong khi deadhead_cost_per_km × 4.2 = 16 800
    §4.8 `eta_min: 12` với 4.2 km, trong khi 4.2 / 25 × 60 = 10.08 → làm tròn lên là 11
"""

from copy import deepcopy
from typing import Any

# --------------------------------------------------------------------------------------
# §4.1 Snapshot
# --------------------------------------------------------------------------------------

SPEC_4_1_ZONE_7: dict[str, Any] = {
    "zone_id": 7,
    "demand_observed": 42,
    "idle_supply": 18,
    "enroute_supply": 6,
    "enroute_arrivals": [
        {
            "arrival_ts": "2026-08-02T17:15:00+07:00",
            "eta_steps": 2,
            "units": 4,
            "source": "relocation",
            "from_zone": 12,
        },
        {
            "arrival_ts": "2026-08-02T17:20:00+07:00",
            "eta_steps": 3,
            "units": 2,
            "source": "activation",
            "from_zone": 9,
        },
    ],
    "price_index": 1.1,
    "rain_mm_h": 8.2,
    "rain_forecast_15": 10.5,
    "rain_forecast_30": 6.0,
    "peak_flag": 1,
    "holiday_flag": 0,
}

SPEC_4_1_SNAPSHOT: dict[str, Any] = {
    "t": "2026-08-02T17:05:00+07:00",
    "zones": [SPEC_4_1_ZONE_7],
}


def filler_zone_snapshot(zone_id: int) -> dict[str, Any]:
    """Zone đệm hợp lệ, không có xe đang đến — dùng bồi cho đủ 30 zone.

    Số cố định theo `zone_id`, không random: T0.7 nằm trong luật deterministic (§3.2 #4)
    và một test đổi dữ liệu mỗi lần chạy thì không tái hiện được lỗi nào.
    """
    return {
        "zone_id": zone_id,
        "demand_observed": zone_id,
        "idle_supply": zone_id % 7,
        "enroute_supply": 0,
        "enroute_arrivals": [],
        "price_index": 1.0,
        "rain_mm_h": 0.0,
        "rain_forecast_15": 0.0,
        "rain_forecast_30": 0.0,
        "peak_flag": 1,
        "holiday_flag": 0,
    }


def snapshot_30_zones() -> dict[str, Any]:
    """§4.1 mở rộng đủ 30 zone; zone 7 giữ nguyên số liệu của SPEC."""
    zones = [deepcopy(SPEC_4_1_ZONE_7) if zone_id == 7 else filler_zone_snapshot(zone_id) for zone_id in range(1, 31)]
    return {"t": SPEC_4_1_SNAPSHOT["t"], "zones": zones}


# --------------------------------------------------------------------------------------
# §4.2 Forecast
# --------------------------------------------------------------------------------------

SPEC_4_2_ZONE_7: dict[str, Any] = {
    "zone_id": 7,
    "predicted_demand": 55.0,
    "predicted_supply": 14.0,
    "demand_p10": 48.0,
    "demand_p90": 63.0,
    "supply_p10": 9.0,
    "supply_p90": 19.0,
    "confidence": None,
}

SPEC_4_2_FORECAST: dict[str, Any] = {
    "t": "2026-08-02T17:05:00+07:00",
    "horizon_min": 15,
    "forecast_ts": "2026-08-02T17:20:00+07:00",
    "zones": [SPEC_4_2_ZONE_7],
    "model_version": "lgbm_v2_rainpeak",
    "regime": "rain_peak",
}


def filler_zone_forecast(zone_id: int) -> dict[str, Any]:
    """Zone đệm hợp lệ với quantile không giao nhau."""
    demand = float(zone_id)
    supply = float(zone_id) / 2.0
    return {
        "zone_id": zone_id,
        "predicted_demand": demand,
        "predicted_supply": supply,
        "demand_p10": demand - 1.0 if demand >= 1.0 else 0.0,
        "demand_p90": demand + 1.0,
        "supply_p10": max(0.0, supply - 1.0),
        "supply_p90": supply + 1.0,
        "confidence": None,
    }


def forecast_30_zones() -> dict[str, Any]:
    """§4.2 mở rộng đủ 30 zone; zone 7 giữ nguyên số liệu của SPEC."""
    payload = deepcopy(SPEC_4_2_FORECAST)
    payload["zones"] = [
        deepcopy(SPEC_4_2_ZONE_7) if zone_id == 7 else filler_zone_forecast(zone_id) for zone_id in range(1, 31)
    ]
    return payload


# --------------------------------------------------------------------------------------
# §4.3 HotspotOutput — danh sách hotspot/surplus vốn là tập con, không cần bồi
# --------------------------------------------------------------------------------------

SPEC_4_3_HOTSPOT_OUTPUT: dict[str, Any] = {
    "forecast_ts": "2026-08-02T17:20:00+07:00",
    "horizon_min": 15,
    "hotspots": [{"zone_id": 7, "is_hotspot": True, "gap": 41.0, "severity_score": 0.75, "idle_supply_current": 4}],
    "surplus_zones": [{"zone_id": 12, "surplus": 15.0, "idle_supply_current": 22, "cooldown_until_ts": None}],
}


# --------------------------------------------------------------------------------------
# §4.4 RelocationPlan
# --------------------------------------------------------------------------------------

SPEC_4_4_PLAN: dict[str, Any] = {
    "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "created_at": "2026-08-02T17:06:00+07:00",
    "based_on_forecast": "2026-08-02T17:05:00+07:00_h15",
    "status": "Proposed",
    "moves": [
        {
            "from_zone": 12,
            "to_zone": 7,
            "units_to_move": 8,
            "eta_steps": 2,
            "estimated_distance_km": 4.2,
            "estimated_cost": 126000,
            "deadhead_km": 4.2,
            "before_gap": 41.0,
            "after_gap": 33.0,
        }
    ],
    "residual_gap": [{"zone_id": 7, "gap_remaining": 12.0, "suggested_activation": 5}],
    "plan_totals": {"total_units": 8, "total_cost": 126000, "total_deadhead_km": 4.2, "budget_cap": 500000},
    "metrics_before": {"unmet_demand": 31, "avg_wait_proxy": 7.2, "est_cancel_rate": 0.18},
    "metrics_after": {"unmet_demand": 19, "avg_wait_proxy": 4.8, "est_cancel_rate": 0.11},
    "activation": {
        "campaign_id": "ACT-20260802-1706-01",
        "status": "Pending",
        "offers_sent": 8,
        "offers_accepted": 0,
        "units_gained": 0,
        "incentive_committed": 0,
        "incentive_budget_cap": 200000,
    },
    "metrics_after_activation": None,
    "explanation_data": {},
}


# --------------------------------------------------------------------------------------
# §4.5 RevisionRequest
# --------------------------------------------------------------------------------------

SPEC_4_5_REVISION: dict[str, Any] = {
    "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "action": "revise",
    "revised_moves": [{"from_zone": 12, "to_zone": 7, "units_to_move": 5, "eta_steps": 2}],
    "note": "Giảm bớt vì Z12 sắp vào giờ tan tầm",
}


# --------------------------------------------------------------------------------------
# §4.6 HistoryRecord — hai biến thể
# --------------------------------------------------------------------------------------

# Nguyên văn SPEC, giữ lại để đối chiếu bằng mắt phần nào là giữ chỗ.
SPEC_4_6_PLAN_DECISION_RAW: dict[str, Any] = {
    "record_id": "H-000512",
    "snapshot_t": "2026-08-02T17:05:00+07:00",
    "forecast_ref": "2026-08-02T17:05:00+07:00_h15@lgbm_v2_rainpeak",
    "plan": {},
    "explanation_text": "...",
    "decision": "approved | rejected | revised",
    "decided_by": "operator_demo_01",
    "decided_at": "2026-08-02T17:07:12+07:00",
    "note": "...",
    "metrics_before": {},
    "metrics_after": {},
    "metrics_after_activation": {},
    "activation_summary": {
        "campaign_id": "ACT-20260802-1706-01",
        "offers_sent": 8,
        "offers_accepted": 5,
        "offers_declined": 2,
        "offers_expired": 1,
        "units_gained": 5,
        "incentive_paid": 165000,
        "accept_rate": 0.625,
        "accept_rate_source": "simulated_model",
    },
}


def plan_decision_record() -> dict[str, Any]:
    """§4.6 biến thể A, điền 5 chỗ giữ chỗ của SPEC.

    `metrics_after_activation` trong SPEC là `{}` — không thể là Metrics rỗng (thiếu cả
    ba field bắt buộc), nên hiểu là "chiến dịch đã đóng, có số" và điền bằng một Metrics
    thật; ca `null` (plan không phát sinh chiến dịch) được kiểm riêng ở test khác.
    """
    payload = deepcopy(SPEC_4_6_PLAN_DECISION_RAW)
    payload["record_type"] = "plan_decision"
    payload["decision"] = "approved"
    payload["plan"] = deepcopy(SPEC_4_4_PLAN)
    payload["metrics_before"] = deepcopy(SPEC_4_4_PLAN["metrics_before"])
    payload["metrics_after"] = deepcopy(SPEC_4_4_PLAN["metrics_after"])
    payload["metrics_after_activation"] = {"unmet_demand": 14.0, "avg_wait_proxy": 4.1, "est_cancel_rate": 0.09}
    return payload


SPEC_4_6_DRIVER_RESPONSE_RAW: dict[str, Any] = {
    "record_id": "H-000513",
    "record_type": "driver_response",
    "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "campaign_id": "ACT-20260802-1706-01",
    "offer_id": "OF-000031",
    "driver_id": "DRV-0142",
    "decision": "accept | decline | expired",
    "decline_reason": None,
    "responded_at": "2026-08-02T17:08:04+07:00",
    "response_latency_sec": 14,
    "source": "human_demo",
}


def driver_response_record() -> dict[str, Any]:
    """§4.6 biến thể B; `decision` là chuỗi liệt kê nên chọn `accept`."""
    payload = deepcopy(SPEC_4_6_DRIVER_RESPONSE_RAW)
    payload["decision"] = "accept"
    return payload


# --------------------------------------------------------------------------------------
# §4.7 Driver
# --------------------------------------------------------------------------------------

SPEC_4_7_DRIVER: dict[str, Any] = {
    "driver_id": "DRV-0142",
    "display_name": "Tài xế 142",
    "home_zone": 12,
    "current_zone": 12,
    "status": "online_idle",
    "shift_end_ts": "2026-08-02T19:00:00+07:00",
    "is_demo_account": True,
}


# --------------------------------------------------------------------------------------
# §4.8 ActivationOffer
# --------------------------------------------------------------------------------------

SPEC_4_8_OFFER: dict[str, Any] = {
    "offer_id": "OF-000031",
    "campaign_id": "ACT-20260802-1706-01",
    "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "driver_id": "DRV-0142",
    "driver_status_at_offer": "offline",
    "target_zone": 7,
    "target_zone_name": "Cầu Giấy - Cụm 2",
    "from_zone": 12,
    "distance_km": 4.2,
    "eta_min": 12,
    "incentive_amount": 33000,
    "reason_text": "Zone Cầu Giấy - Cụm 2 dự báo thiếu 12 xe lúc 17:20 do mưa 8mm/h giờ cao điểm.",
    "created_at": "2026-08-02T17:06:30+07:00",
    "expires_at": "2026-08-02T17:16:30+07:00",
    "status": "Sent",
}


# --------------------------------------------------------------------------------------
# §4.9 DriverResponse
# --------------------------------------------------------------------------------------

SPEC_4_9_RESPONSE: dict[str, Any] = {
    "offer_id": "OF-000031",
    "driver_id": "DRV-0142",
    "decision": "accept",
    "decline_reason": None,
    "responded_at": "2026-08-02T17:08:04+07:00",
}
