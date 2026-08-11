from fastapi.testclient import TestClient

from src.main import app


def _zone(zone_id: int) -> dict[str, int | float]:
    return {
        "zone_id": zone_id,
        "demand_observed": 20 if zone_id == 1 else 5,
        "idle_supply": 2 if zone_id == 1 else 10,
        "enroute_supply": 0,
        "rain_mm_h": 0.0,
        "rain_forecast_15": 0.0,
        "rain_forecast_30": 0.0,
        "peak_flag": 0,
        "holiday_flag": 0,
    }


def _request() -> dict[str, object]:
    return {
        "snapshot_id": "snapshot-001",
        "t": "2026-08-11T10:00:00Z",
        "horizon_min": 15,
        "data_source": "supabase:supply_demand_snapshots:snapshot-001",
        "zones": [_zone(zone_id) for zone_id in range(1, 31)],
    }


def test_decision_uses_live_snapshot_and_returns_auditable_mode() -> None:
    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=_request())

    assert response.status_code == 200
    body = response.json()
    assert body["data_source"].startswith("supabase:")
    assert body["forecast_mode"] == "live_snapshot_baseline"
    assert len(body["forecast"]["zones"]) == 30
    assert body["plan"]["moves"]
    assert any(
        warning["code"] == "MODEL_ARTIFACT_MISSING"
        for warning in body["plan"]["warnings"]
    )


def test_decision_rejects_incomplete_zone_coverage() -> None:
    payload = _request()
    payload["zones"] = [_zone(zone_id) for zone_id in range(1, 30)]

    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 422
