"""Mock producer cho 9 entity — C-06 và DoD #7.

Mỗi hàm ở đây đóng vai module CHƯA LÀM XONG: nó trả về payload đúng contract mà không
chạy một dòng nghiệp vụ nào. Nhờ vậy tầng dưới (Model 2, Optimizer, UI) code được và
test được trước khi tầng trên tồn tại.

Số liệu cố ý KHÁC ví dụ SPEC và đi qua những nhánh mà ví dụ SPEC không chạm tới:
`Metrics.by_regime` đủ 4 regime, `HotspotOutput.conservative_gap_mode`,
`RevisionRequest` nhánh `reject`, `HistoryRecord` biến thể phản hồi `decline`.
Toàn bộ là hằng số — không random, kể cả có seed (§3.2 #4).
"""

from typing import Any

# Mốc thời gian dùng chung cho mọi mock, nằm đúng lưới 5 phút.
MOCK_T = "2026-08-02T17:05:00+07:00"
MOCK_FORECAST_TS_H15 = "2026-08-02T17:20:00+07:00"
MOCK_PLAN_ID = "3f2a1c94-7b6d-4e51-9a03-8c5d2e7f4b10"
MOCK_CAMPAIGN_ID = "ACT-20260802-1705-01"


def mock_metrics(scale: float = 1.0, *, with_by_regime: bool = False) -> dict[str, Any]:
    """Bộ 3 chỉ số §5.5. `scale` chỉ để hai lần gọi ra hai bộ số khác nhau."""
    base: dict[str, Any] = {
        "unmet_demand": round(20.0 * scale, 4),
        "avg_wait_proxy": round(6.0 * scale, 4),
        "est_cancel_rate": round(min(1.0, 0.15 * scale), 4),
    }
    if with_by_regime:
        # Bốn regime luôn có mặt: rain_peak là thước đo thành công chính, không được
        # gộp vào số tổng (CLAUDE.md §3 #6).
        base["by_regime"] = {
            "normal": mock_metrics(0.5),
            "peak": mock_metrics(0.9),
            "rain": mock_metrics(1.1),
            "rain_peak": mock_metrics(1.4),
        }
    return base


def mock_snapshot() -> dict[str, Any]:
    """§4.1 — 30 zone, zone 1 có một lượt xe đang đến để INV-3 thật sự bị kiểm."""
    zones: list[dict[str, Any]] = []
    for zone_id in range(1, 31):
        arrivals: list[dict[str, Any]] = []
        enroute = 0
        if zone_id == 1:
            arrivals = [
                {
                    "arrival_ts": "2026-08-02T17:15:00+07:00",
                    "eta_steps": 2,
                    "units": 3,
                    "source": "relocation",
                    "from_zone": 5,
                }
            ]
            enroute = 3
        zones.append(
            {
                "zone_id": zone_id,
                "demand_observed": 10 + zone_id,
                "idle_supply": zone_id % 9,
                "enroute_supply": enroute,
                "enroute_arrivals": arrivals,
                "price_index": 1.0,
                "rain_mm_h": 0.0,
                "rain_forecast_15": 0.0,
                "rain_forecast_30": 0.0,
                "peak_flag": 1,
                "holiday_flag": 0,
            }
        )
    return {"t": MOCK_T, "zones": zones}


def mock_forecast() -> dict[str, Any]:
    """§4.2 — mock của Model 1 là historical average (§5.14), nên `model_version` nói rõ."""
    zones = []
    for zone_id in range(1, 31):
        demand = 10.0 + zone_id
        supply = 5.0 + zone_id / 2.0
        zones.append(
            {
                "zone_id": zone_id,
                "predicted_demand": demand,
                "predicted_supply": supply,
                "demand_p10": demand - 2.0,
                "demand_p90": demand + 2.0,
                "supply_p10": supply - 1.0,
                "supply_p90": supply + 1.0,
                "confidence": None,
            }
        )
    return {
        "t": MOCK_T,
        "horizon_min": 15,
        "forecast_ts": MOCK_FORECAST_TS_H15,
        "zones": zones,
        "model_version": "mock_hist_avg_v0",
        "regime": "peak",
    }


def mock_hotspot_output() -> dict[str, Any]:
    """§4.3 — kèm `conservative_gap_mode`, field optional mà ví dụ SPEC không có."""
    return {
        "forecast_ts": MOCK_FORECAST_TS_H15,
        "horizon_min": 15,
        "hotspots": [
            {"zone_id": 3, "is_hotspot": True, "gap": 12.0, "severity_score": 0.4, "idle_supply_current": 2},
            {"zone_id": 4, "is_hotspot": False, "gap": -1.0, "severity_score": -0.05, "idle_supply_current": 9},
        ],
        "surplus_zones": [
            {"zone_id": 20, "surplus": 8.0, "idle_supply_current": 15, "cooldown_until_ts": None},
            {
                "zone_id": 21,
                "surplus": 3.0,
                "idle_supply_current": 11,
                "cooldown_until_ts": "2026-08-02T17:20:00+07:00",
            },
        ],
        "conservative_gap_mode": "p90_p50",
    }


def mock_relocation_plan() -> dict[str, Any]:
    """§4.4 — hai move, `plan_totals` khớp đúng tổng, chưa có chiến dịch."""
    moves = [
        {
            "from_zone": 20,
            "to_zone": 3,
            "units_to_move": 3,
            "eta_steps": 2,
            "estimated_distance_km": 3.0,
            "estimated_cost": 12000,
            "deadhead_km": 3.0,
            "before_gap": 12.0,
            "after_gap": 9.0,
        },
        {
            "from_zone": 21,
            "to_zone": 3,
            "units_to_move": 2,
            "eta_steps": 1,
            "estimated_distance_km": 2.0,
            "estimated_cost": 8000,
            "deadhead_km": 2.0,
            "before_gap": 9.0,
            "after_gap": 7.0,
        },
    ]
    return {
        "plan_id": MOCK_PLAN_ID,
        "created_at": "2026-08-02T17:06:00+07:00",
        "based_on_forecast": f"{MOCK_T}_h15",
        "status": "Proposed",
        "moves": moves,
        "residual_gap": [{"zone_id": 3, "gap_remaining": 7.0, "suggested_activation": 4}],
        "plan_totals": {"total_units": 5, "total_cost": 20000, "total_deadhead_km": 5.0, "budget_cap": 500000},
        "metrics_before": mock_metrics(1.0, with_by_regime=True),
        "metrics_after": mock_metrics(0.7, with_by_regime=True),
        "activation": None,
        "metrics_after_activation": None,
        "explanation_data": {"zone_id": 3, "gap": 12.0, "source_zones": [20, 21]},
    }


def mock_revision_request() -> dict[str, Any]:
    """§4.5 — nhánh `reject`, nhánh bắt buộc có `note` mà ví dụ SPEC không chạm tới."""
    return {
        "plan_id": MOCK_PLAN_ID,
        "action": "reject",
        "revised_moves": None,
        "note": "Zone 20 sắp vào giờ tan tầm, không rút được",
    }


def mock_driver() -> dict[str, Any]:
    """§4.7 — tài xế offline, `shift_end_ts` null đúng như trạng thái A6 hiện tại."""
    return {
        "driver_id": "DRV-0007",
        "display_name": "Tài xế 7",
        "home_zone": 20,
        "current_zone": 20,
        "status": "offline",
        "shift_end_ts": None,
        "is_demo_account": True,
    }


def mock_offer() -> dict[str, Any]:
    """§4.8 — số liệu thoả cả bốn ràng buộc theo policy, kiểm được với context."""
    return {
        "offer_id": "OF-000001",
        "campaign_id": MOCK_CAMPAIGN_ID,
        "plan_id": MOCK_PLAN_ID,
        "driver_id": "DRV-0007",
        "driver_status_at_offer": "offline",
        "target_zone": 3,
        "target_zone_name": "Zone 3",
        "from_zone": 20,
        "distance_km": 2.0,
        # ceil(2.0 / 25 km/h × 60) = 5 phút
        "eta_min": 5,
        # min(20000 + 3000 × 2.0, 50000) = 26000, đã là bội số 1.000đ
        "incentive_amount": 26000,
        "reason_text": "Zone 3 dự báo thiếu 7 xe lúc 17:20.",
        "created_at": "2026-08-02T17:06:00+07:00",
        "expires_at": "2026-08-02T17:16:00+07:00",
        "status": "Sent",
    }


def mock_driver_response() -> dict[str, Any]:
    """§4.9 — từ chối KHÔNG kèm lý do, đúng quyền của tài xế (C-08)."""
    return {
        "offer_id": "OF-000001",
        "driver_id": "DRV-0007",
        "decision": "decline",
        "decline_reason": None,
        "responded_at": "2026-08-02T17:07:10+07:00",
    }


def mock_plan_decision_record() -> dict[str, Any]:
    """§4.6 biến thể A — quyết định `rejected`, nhánh bắt buộc có `note`."""
    return {
        "record_id": "H-000001",
        "record_type": "plan_decision",
        "snapshot_t": MOCK_T,
        "forecast_ref": f"{MOCK_T}_h15@mock_hist_avg_v0",
        "plan": mock_relocation_plan(),
        "explanation_text": "Zone 3 thiếu 12 xe; đề xuất rút 5 xe từ zone 20 và 21.",
        "decision": "rejected",
        "decided_by": "operator_demo_01",
        "decided_at": "2026-08-02T17:07:12+07:00",
        "note": "Chi phí deadhead chưa tương xứng",
        "metrics_before": mock_metrics(1.0),
        "metrics_after": mock_metrics(0.7),
        "metrics_after_activation": None,
        "activation_summary": None,
    }


def mock_driver_response_record() -> dict[str, Any]:
    """§4.6 biến thể B — `expired` do hệ thống sinh, không phải hành động tài xế."""
    return {
        "record_id": "H-000002",
        "record_type": "driver_response",
        "plan_id": MOCK_PLAN_ID,
        "campaign_id": MOCK_CAMPAIGN_ID,
        "offer_id": "OF-000001",
        "driver_id": "DRV-0007",
        "decision": "expired",
        "decline_reason": None,
        "responded_at": "2026-08-02T17:16:00+07:00",
        "response_latency_sec": 600,
        "source": "simulated_model",
    }
