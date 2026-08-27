"""Reproduce the operator-flow acceptance evidence from real model output.

Script này KHÔNG phải test tự động thay cho `pytest`: nó chạy lại đúng chuỗi thao tác
thủ công đã ghi trong `eval/manual_test_cases.md` (lấy snapshot replay → gọi API quyết
định → đọc output) và in ra số thật để đối chiếu. Mọi giá trị trong tài liệu evidence
phải copy từ output của script này, không viết tay.

Bộ case phủ cả bốn regime của §3 #6: `rain_peak`, `peak` (có mưa cục bộ), `peak` khô,
`rain` không cao điểm và `normal`. Ba case khô/đêm là ca đối chứng — chúng chứng minh hệ
thống chỉ nâng cơ sở lập phương án lên `p90_p50` khi có đồng thời cao điểm và mưa, chứ
không mặc định dùng P90 cho mọi snapshot.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from src.main import app

# (case_id, mốc replay, horizon, cơ sở lập phương án kỳ vọng, mô tả)
# `expected_basis=None` nghĩa là kỳ vọng hệ thống giữ p50 − p50.
CASES: tuple[tuple[str, str, int, str | None, str], ...] = (
    (
        "EVAL-01",
        "2026-09-25T08:30:00+07:00",
        5,
        "p90_p50",
        "Mưa giờ cao điểm, quyết định ngắn hạn 5 phút",
    ),
    (
        "EVAL-02",
        "2026-09-25T08:30:00+07:00",
        10,
        "p90_p50",
        "Cùng snapshot mưa cao điểm, mở rộng horizon lên 10 phút",
    ),
    (
        "EVAL-03",
        "2026-09-25T08:35:00+07:00",
        5,
        "p90_p50",
        "Regime tổng thể là peak nhưng còn mưa cục bộ, horizon 5 phút",
    ),
    (
        "EVAL-04",
        "2026-09-25T08:35:00+07:00",
        15,
        "p90_p50",
        "Cùng snapshot mưa cục bộ, phương án dài hơn 15 phút",
    ),
    (
        "EVAL-05",
        "2026-09-25T08:40:00+07:00",
        15,
        "p90_p50",
        "Chuyển tiếp sang snapshot kế tiếp, horizon 15 phút",
    ),
    (
        "EVAL-06",
        "2026-09-25T07:00:00+07:00",
        15,
        "p90_p50",
        "Cao điểm, mưa chưa rơi nhưng nowcast 15/30 phút vượt ngưỡng — vẫn phải dùng P90",
    ),
    (
        "EVAL-07",
        "2026-09-25T17:10:00+07:00",
        15,
        None,
        "Đối chứng: cao điểm KHÔ hoàn toàn (mốc duy nhất trong test set) — phải giữ p50",
    ),
    (
        "EVAL-08",
        "2026-09-25T09:00:00+07:00",
        10,
        None,
        "Đối chứng: mưa toàn thành phố nhưng ngoài cao điểm — phải giữ p50",
    ),
    (
        "EVAL-09",
        "2026-09-25T00:30:00+07:00",
        15,
        None,
        "Đối chứng: đêm khuya, không mưa, không cao điểm",
    ),
)

EVIDENCE_PATH = Path(__file__).resolve().parents[2] / "eval" / "results" / "decision_flow_cases.json"


def _case_record(
    case_id: str,
    source_at: str,
    horizon_min: int,
    expected_basis: str | None,
    title: str,
    zones: list[dict[str, Any]],
    body: dict[str, Any],
) -> dict[str, Any]:
    """Rút đúng các trường được trích dẫn trong tài liệu evidence, kèm phán quyết PASS/FAIL."""
    moves = body["plan"]["moves"]
    source_capacities = {item["zone_id"]: item["movable_units"] for item in body["plan"]["source_capacities"]}
    used_by_source: defaultdict[int, int] = defaultdict(int)
    for move in moves:
        used_by_source[move["from_zone"]] += move["units_to_move"]
    activation = body["activation_recommendation"]
    metrics_before = body["simulation"]["metrics_before"]
    metrics_after = body["simulation"]["metrics_after_relocation"]
    plan_totals = body["plan"]["plan_totals"]
    planning_basis = body["hotspots"]["conservative_gap_mode"]
    gap_before = round(metrics_before["unmet_demand"], 3)
    gap_after = round(metrics_after["unmet_demand"], 3)

    constraints = {
        "planning_basis_as_expected": planning_basis == expected_basis,
        "distance_within_policy": all(move["estimated_distance_km"] <= 7 for move in moves),
        "source_capacity_respected": all(
            used <= source_capacities.get(zone_id, 0) for zone_id, used in used_by_source.items()
        ),
        "relocation_budget_respected": plan_totals["total_cost"] <= plan_totals["budget_cap"],
        # Relocation chỉ dời xe nên tổng thiếu hụt không được phép tăng sau phương án.
        "relocation_does_not_worsen_gap": gap_after <= gap_before + 1e-9,
        # Cam kết xấu nhất (100% tài xế nhận) phải nằm trong trần incentive độc lập — C-09.
        "incentive_budget_respected": (
            activation["worst_case_commitment"] <= body["activation_policy"]["incentive_budget_cap"]
        ),
        # Không có residual gap thì không được phát offer.
        "activation_matches_residual": (
            activation["total_requested_offers"] > 0
            if body["plan"]["residual_gap"]
            else activation["total_requested_offers"] == 0
        ),
    }

    return {
        "case_id": case_id,
        "title": title,
        "source_at": source_at,
        "horizon_min": horizon_min,
        "http_status": 200,
        "raining_zones": sum(zone["rain_mm_h"] >= 0.5 for zone in zones),
        "peak_zones": sum(zone["peak_flag"] for zone in zones),
        "forecast_regime": body["forecast"]["regime"],
        "forecast_mode": body["forecast_mode"],
        "expected_planning_basis": expected_basis,
        "planning_basis": planning_basis,
        "planning_status": body["planning_status"],
        "reason_code": body["reason_code"],
        "policy_hotspots": len(body["hotspots"]["hotspots"]),
        "risk_zones": len(body["risk_zones"]),
        "relocation_targets": len(body["plan"]["relocation_targets"]),
        "risk_gap_before": gap_before,
        "risk_gap_after_relocation": gap_after,
        "gap_reduced_by_relocation": round(gap_before - gap_after, 3),
        "avg_wait_before_min": round(metrics_before["avg_wait_proxy"], 3),
        "avg_wait_after_relocation_min": round(metrics_after["avg_wait_proxy"], 3),
        "est_cancel_before": round(metrics_before["est_cancel_rate"], 4),
        "est_cancel_after_relocation": round(metrics_after["est_cancel_rate"], 4),
        "direct_routes": len(moves),
        "direct_vehicles": sum(move["units_to_move"] for move in moves),
        "max_route_km": round(max((move["estimated_distance_km"] for move in moves), default=0), 3),
        "relocation_cost_vnd": plan_totals["total_cost"],
        "relocation_budget_cap_vnd": plan_totals["budget_cap"],
        "residual_zones": len(body["plan"]["residual_gap"]),
        # Giữ nguyên danh sách tuyến trong evidence: bảng tổng hợp không cho thấy được
        # các cặp move đối lưu (A→B và B→A trong cùng một phương án).
        "moves": [
            {
                "from_zone": move["from_zone"],
                "to_zone": move["to_zone"],
                "units": move["units_to_move"],
                "distance_km": move["estimated_distance_km"],
                "cost_vnd": move["estimated_cost"],
                "eta_steps": move["eta_steps"],
            }
            for move in moves
        ],
        "activation_offers": activation["total_requested_offers"],
        "activation_expected_vehicles": round(activation["total_expected_units_gained"], 3),
        "risk_gap_after_activation_expected": round(activation["total_expected_gap_remaining"], 3),
        "activation_worst_case_commitment_vnd": activation["worst_case_commitment"],
        "incentive_budget_cap_vnd": body["activation_policy"]["incentive_budget_cap"],
        "accept_rate_source": activation["accept_rate_source"],
        "warnings": sorted({warning["code"] for warning in body["plan"]["warnings"]}),
        "constraints": constraints,
        "verdict": "PASS" if all(constraints.values()) else "FAIL",
    }


def evaluate() -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    with TestClient(app) as client:
        for case_id, source_at, horizon_min, expected_basis, title in CASES:
            snapshot_response = client.post(
                "/api/v1/datasets/snapshots/at",
                json={"source_at": source_at},
            )
            snapshot_response.raise_for_status()
            zones = snapshot_response.json()["zones"]
            response = client.post(
                "/api/v1/decisions",
                json={
                    "snapshot_id": f"{case_id.lower()}-{horizon_min}",
                    "t": source_at,
                    "horizon_min": horizon_min,
                    "data_source": f"replay:{source_at}",
                    "replay_source_at": source_at,
                    "zones": zones,
                },
            )
            response.raise_for_status()
            results.append(_case_record(case_id, source_at, horizon_min, expected_basis, title, zones, response.json()))
    return results


if __name__ == "__main__":
    records = evaluate()
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(records, ensure_ascii=False, indent=2))
    passed = sum(record["verdict"] == "PASS" for record in records)
    print(f"\n{passed}/{len(records)} PASS -> {EVIDENCE_PATH}")
