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
    assert body["activation_policy"] == {
        "incentive_amount": 20_000,
        "incentive_budget_cap": 1_000_000,
        "overbooking_factor": 1.6,
        "assumed_accept_rate": 0.6,
    }
    activation = body["activation_recommendation"]
    assert activation["total_requested_offers"] >= 0
    assert activation["total_expected_units_gained"] >= 0
    assert activation["total_expected_gap_remaining"] >= 0
    assert activation["accept_rate_source"] == "policy_assumption"
    assert len(body["forecast"]["zones"]) == 30
    assert body["plan"]["moves"]
    assert any(
        warning["code"] == "MODEL_HISTORY_INCOMPLETE"
        for warning in body["plan"]["warnings"]
    )


def test_decision_rejects_incomplete_zone_coverage() -> None:
    payload = _request()
    payload["zones"] = [_zone(zone_id) for zone_id in range(1, 30)]

    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 422


def test_decision_uses_trained_model_for_frozen_replay_bucket() -> None:
    payload = _request()
    payload["replay_source_at"] = "2026-09-25T07:00:00+07:00"

    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["forecast_mode"] == "trained_model_replay"
    assert body["forecast"]["model_version"] == "lgbm_quantile_v1"
    assert len(body["forecast"]["zones"]) == 30
    assert not any(
        warning["code"] == "FORECAST_FALLBACK_USED"
        for warning in body["plan"]["warnings"]
    )


def test_frozen_dataset_exposes_complete_replay_steps() -> None:
    with TestClient(app) as client:
        status = client.get("/api/v1/datasets/snapshots/status")
        snapshot = client.post(
            "/api/v1/datasets/snapshots/next",
            json={"regime": "rain_peak"},
        )

    assert status.status_code == 200
    assert status.json()["dataset"] == "snapshot_test.parquet"
    assert status.json()["steps"] == 2016
    assert status.json()["inference_ready_steps"] == 2010
    assert snapshot.status_code == 200
    assert snapshot.json()["regime"] == "rain_peak"
    assert [zone["zone_id"] for zone in snapshot.json()["zones"]] == list(range(1, 31))


def test_frozen_dataset_advances_after_source_timestamp() -> None:
    with TestClient(app) as client:
        first = client.post("/api/v1/datasets/snapshots/next", json={}).json()
        second = client.post(
            "/api/v1/datasets/snapshots/next",
            json={"after_source_at": first["source_at"]},
        ).json()

    assert second["source_at"] > first["source_at"]


def test_exact_replay_bucket_runs_trained_five_minute_model() -> None:
    source_at = "2026-09-25T08:15:00+07:00"
    with TestClient(app) as client:
        snapshot = client.post("/api/v1/datasets/snapshots/at", json={"source_at": source_at})
        window = client.post("/api/v1/datasets/snapshots/window", json={"source_at": source_at})
        payload = _request()
        payload["horizon_min"] = 5
        payload["replay_source_at"] = source_at
        decision = client.post("/api/v1/decisions", json=payload)

    assert snapshot.status_code == 200
    assert snapshot.json()["source_at"] == source_at
    assert len(snapshot.json()["zones"]) == 30
    assert window.status_code == 200
    assert all("mean_rain_mm_h" in step for step in window.json()["steps"])
    assert decision.status_code == 200
    assert decision.json()["forecast_mode"] == "trained_model_replay"
    assert decision.json()["forecast"]["horizon_min"] == 5
