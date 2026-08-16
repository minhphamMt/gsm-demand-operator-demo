import json
import shutil
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from src.datasets.snapshot_replay import replay_features
from src.forecasting.lgbm_quantile import verify_model_bundle
from src.forecasting.live_snapshot_baseline import forecast_from_live_zones
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
        "offer_ttl_minutes": 10,
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
    source_at = "2026-09-25T07:00:00+07:00"

    with TestClient(app) as client:
        payload["zones"] = client.post(
            "/api/v1/datasets/snapshots/at",
            json={"source_at": source_at},
        ).json()["zones"]
        payload["replay_source_at"] = source_at
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["forecast_mode"] == "trained_model_replay"
    assert body["forecast"]["model_version"] == "lgbm_quantile_v1"
    assert len(body["forecast"]["zones"]) == 30
    assert body["data_provenance"]["source_kind"] == "hybrid_synthetic"
    assert body["data_provenance"]["replay_snapshot_verified"] is True
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


def test_exact_stored_replay_bucket_runs_trained_five_minute_model() -> None:
    source_at = "2026-09-25T08:15:00+07:00"
    with TestClient(app) as client:
        snapshot = client.post("/api/v1/datasets/snapshots/at", json={"source_at": source_at})
        window = client.post("/api/v1/datasets/snapshots/window", json={"source_at": source_at})
        payload = _request()
        payload["zones"] = snapshot.json()["zones"]
        payload["horizon_min"] = 5
        payload["replay_source_at"] = source_at
        decision = client.post("/api/v1/decisions", json=payload)

    assert snapshot.status_code == 200
    assert snapshot.json()["source_at"] == source_at
    assert len(snapshot.json()["zones"]) == 30
    assert window.status_code == 200
    assert len(window.json()["steps"]) == 13
    assert window.json()["steps"][-1]["source_at"] == source_at
    assert all("mean_rain_mm_h" in step for step in window.json()["steps"])
    assert decision.status_code == 200
    assert decision.json()["forecast_mode"] == "trained_model_replay"
    assert decision.json()["forecast"]["horizon_min"] == 5


def test_curated_demo_buckets_produce_relocation_for_every_horizon() -> None:
    source_times = (
        "2026-09-25T08:30:00+07:00",
        "2026-09-25T08:35:00+07:00",
        "2026-09-25T08:40:00+07:00",
    )
    with TestClient(app) as client:
        decisions = []
        for source_at in source_times:
            zones = client.post(
                "/api/v1/datasets/snapshots/at",
                json={"source_at": source_at},
            ).json()["zones"]
            raining_zones = sum(zone["rain_mm_h"] >= 0.5 for zone in zones)
            assert 0 < raining_zones < len(zones)
            for horizon in (5, 10, 15):
                payload = _request()
                payload["zones"] = zones
                payload["horizon_min"] = horizon
                payload["replay_source_at"] = source_at
                decisions.append(client.post("/api/v1/decisions", json=payload))

    assert all(response.status_code == 200 for response in decisions)
    assert all(response.json()["forecast_mode"] == "trained_model_replay" for response in decisions)
    for response in decisions:
        body = response.json()
        targets = body["plan"]["relocation_targets"]
        direct_units = sum(move["units_to_move"] for move in body["plan"]["moves"])
        assert body["hotspots"]["conservative_gap_mode"] == "p90_p50"
        assert body["simulation"]["basis"] == "forecast_p90_p50_after_all_moves_arrive"
        assert len(targets) >= 8
        assert all(target["target_basis"] == "p90_p50" for target in targets)
        assert direct_units == 2
        assert body["activation_recommendation"]["total_requested_offers"] > direct_units
        assert body["activation_recommendation"]["total_expected_units_gained"] > direct_units


def test_local_rain_cell_keeps_p90_planning_when_citywide_regime_is_peak() -> None:
    source_at = "2026-09-25T08:35:00+07:00"
    with TestClient(app) as client:
        zones = client.post(
            "/api/v1/datasets/snapshots/at",
            json={"source_at": source_at},
        ).json()["zones"]
        payload = _request()
        payload["zones"] = zones
        payload["horizon_min"] = 5
        payload["replay_source_at"] = source_at
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["forecast"]["regime"] == "peak"
    assert any(zone["rain_mm_h"] >= 0.5 for zone in zones)
    assert body["hotspots"]["conservative_gap_mode"] == "p90_p50"
    assert body["simulation"]["metrics_before"]["unmet_demand"] > 40
    assert sum(move["units_to_move"] for move in body["plan"]["moves"]) == 2
    assert body["activation_recommendation"]["total_requested_offers"] == 50


def test_replay_window_never_reads_future_steps_at_dataset_boundary() -> None:
    with TestClient(app) as client:
        status = client.get("/api/v1/datasets/snapshots/status").json()
        source_at = status["first_inference_source_at"]
        response = client.post("/api/v1/datasets/snapshots/window", json={"source_at": source_at})

    assert response.status_code == 200
    steps = response.json()["steps"]
    assert len(steps) == 1
    assert steps[0]["source_at"] == source_at
    assert all("mean_rain_mm_h" in step for step in steps)


def test_replay_rejects_zone_payload_from_a_different_source() -> None:
    payload = _request()
    payload["replay_source_at"] = "2026-09-25T07:00:00+07:00"

    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "REPLAY_PROVENANCE_MISMATCH"


def test_replay_model_failure_never_substitutes_live_baseline() -> None:
    source_at = "2026-09-25T07:00:00+07:00"
    with TestClient(app) as client:
        zones = client.post(
            "/api/v1/datasets/snapshots/at",
            json={"source_at": source_at},
        ).json()["zones"]
        payload = _request()
        payload["zones"] = zones
        payload["replay_source_at"] = source_at
        with patch("src.api.routes_inference.forecast_at", side_effect=RuntimeError("broken artifact")):
            response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "REPLAY_MODEL_UNAVAILABLE"
    assert response.json()["detail"]["cause"] == "RuntimeError"


def test_live_baseline_does_not_teleport_enroute_supply_without_eta() -> None:
    zones = [_zone(zone_id) for zone_id in range(1, 31)]
    zones[0]["idle_supply"] = 2
    zones[0]["enroute_supply"] = 9

    forecast = forecast_from_live_zones(
        datetime.fromisoformat(str(_request()["t"]).replace("Z", "+00:00")),
        15,
        [type("Zone", (), zone)() for zone in zones],
    )

    assert forecast.zones[0].predicted_supply == 2


def test_live_baseline_reports_missing_enroute_eta() -> None:
    payload = _request()
    payload["zones"][0]["enroute_supply"] = 9

    with TestClient(app) as client:
        response = client.post("/api/v1/decisions", json=payload)

    assert response.status_code == 200
    assert any(warning["code"] == "ENROUTE_ETA_UNAVAILABLE" for warning in response.json()["plan"]["warnings"])


def test_runtime_derives_features_from_the_checksummed_snapshot() -> None:
    frame = replay_features()

    assert len(frame) == 60_300
    assert frame["ts_bucket"].nunique() == 2_010


def test_model_bundle_manifest_verifies_all_eighteen_artifacts() -> None:
    from src.config import get_settings

    settings = get_settings()
    bundle = verify_model_bundle(settings.data_dir / "models", configured_model_version="lgbm_quantile_v1")

    assert bundle["verified"] is True
    assert bundle["artifacts"] == 18
    assert bundle["horizons"] == [5, 10, 15]
    training_data = bundle["training_data"]
    assert isinstance(training_data, dict)
    assert training_data["source_kind"] == "hybrid_synthetic"


def test_model_bundle_rejects_a_tampered_artifact(tmp_path) -> None:
    from src.config import get_settings

    settings = get_settings()
    model_directory = settings.data_dir / "models"
    manifest = json.loads((model_directory / "model_manifest.json").read_text(encoding="utf-8"))
    for filename in manifest["artifacts"].values():
        shutil.copy2(model_directory / str(filename).split("/")[-1], tmp_path)
    (tmp_path / "lgbm_demand_h5_p10.txt").write_bytes(
        (tmp_path / "lgbm_demand_h5_p10.txt").read_bytes() + b"tampered"
    )
    (tmp_path / "model_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    try:
        verify_model_bundle(tmp_path)
    except ValueError as error:
        assert "Checksum mismatch" in str(error)
    else:
        raise AssertionError("A partial/tampered model bundle must not be accepted")
