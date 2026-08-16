"""Reproduce the operator-flow acceptance evidence from real model output."""

from __future__ import annotations

import json
from collections import defaultdict

from fastapi.testclient import TestClient

from src.main import app

CASES = (
    ("EVAL-01", "2026-09-25T08:30:00+07:00", 5),
    ("EVAL-02", "2026-09-25T08:30:00+07:00", 10),
    ("EVAL-03", "2026-09-25T08:35:00+07:00", 5),
    ("EVAL-04", "2026-09-25T08:35:00+07:00", 15),
    ("EVAL-05", "2026-09-25T08:40:00+07:00", 15),
)


def evaluate() -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    with TestClient(app) as client:
        for case_id, source_at, horizon_min in CASES:
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
            body = response.json()
            moves = body["plan"]["moves"]
            source_capacities = {
                item["zone_id"]: item["movable_units"]
                for item in body["plan"]["source_capacities"]
            }
            used_by_source: defaultdict[int, int] = defaultdict(int)
            for move in moves:
                used_by_source[move["from_zone"]] += move["units_to_move"]
            activation = body["activation_recommendation"]
            metrics_before = body["simulation"]["metrics_before"]
            metrics_after = body["simulation"]["metrics_after_relocation"]
            results.append(
                {
                    "case_id": case_id,
                    "source_at": source_at,
                    "horizon_min": horizon_min,
                    "raining_zones": sum(zone["rain_mm_h"] >= 0.5 for zone in zones),
                    "forecast_regime": body["forecast"]["regime"],
                    "planning_basis": body["hotspots"]["conservative_gap_mode"],
                    "risk_targets": len(body["plan"]["relocation_targets"]),
                    "risk_gap_before": round(metrics_before["unmet_demand"], 3),
                    "direct_routes": len(moves),
                    "direct_vehicles": sum(move["units_to_move"] for move in moves),
                    "max_route_km": round(
                        max((move["estimated_distance_km"] for move in moves), default=0), 3
                    ),
                    "relocation_cost_vnd": body["plan"]["plan_totals"]["total_cost"],
                    "risk_gap_after_relocation": round(metrics_after["unmet_demand"], 3),
                    "activation_offers": activation["total_requested_offers"],
                    "activation_expected_vehicles": round(activation["total_expected_units_gained"], 3),
                    "risk_gap_after_activation_expected": round(
                        activation["total_expected_gap_remaining"], 3
                    ),
                    "constraints": {
                        "distance_within_policy": all(
                            move["estimated_distance_km"] <= 7 for move in moves
                        ),
                        "source_capacity_respected": all(
                            used <= source_capacities.get(zone_id, 0)
                            for zone_id, used in used_by_source.items()
                        ),
                        "relocation_budget_respected": (
                            body["plan"]["plan_totals"]["total_cost"]
                            <= body["plan"]["plan_totals"]["budget_cap"]
                        ),
                    },
                }
            )
    return results


if __name__ == "__main__":
    print(json.dumps(evaluate(), ensure_ascii=False, indent=2))
