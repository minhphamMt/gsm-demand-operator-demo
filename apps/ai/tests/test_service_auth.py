"""Test cho src/api/auth.py::require_service_api_key (issue #12).

Không sửa test_live_decision_api.py: các test đó chạy khi AI_SERVICE_API_KEY chưa
được cấu hình (đúng trạng thái CI hiện tại), nên hành vi fail-open ở
development/test phải giữ nguyên — xem test đầu tiên dưới đây.
"""

import pytest
from fastapi.testclient import TestClient

from src.config import get_settings
from src.main import app


@pytest.fixture
def configured_api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    key = "test-shared-secret"
    monkeypatch.setenv("AI_SERVICE_API_KEY", key)
    get_settings.cache_clear()
    yield key
    get_settings.cache_clear()


def test_health_stays_public_without_api_key() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code != 401


def test_inference_route_allows_anonymous_when_key_not_configured() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/datasets/snapshots/status")

    assert response.status_code != 401


def test_inference_route_rejects_missing_key_when_configured(configured_api_key: str) -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/datasets/snapshots/status")

    assert response.status_code == 401


def test_inference_route_rejects_wrong_key_when_configured(configured_api_key: str) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/datasets/snapshots/status",
            headers={"X-API-Key": "wrong-key"},
        )

    assert response.status_code == 401


def test_inference_route_accepts_correct_key_when_configured(configured_api_key: str) -> None:
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/datasets/snapshots/status",
            headers={"X-API-Key": configured_api_key},
        )

    assert response.status_code != 401
