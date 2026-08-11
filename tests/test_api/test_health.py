"""Test GET /health — docs/design/API_CONTRACT.md §8.2."""

from pathlib import Path

from httpx import AsyncClient

from src.config import Settings
from src.main import REQUIRED_POLICY_KEYS, build_readiness

EXPECTED_FIELDS = {
    "status",
    "app_env",
    "policy_loaded",
    "policy_keys",
    "zones",
    "drivers",
    "history_db",
    "model_version",
    "baseline_frozen",
}


async def test_health_tra_dung_9_field(client: AsyncClient) -> None:
    """Shape của response phải khớp §8.2, không thiếu không thừa field."""
    response = await client.get("/health")
    assert set(response.json().keys()) == EXPECTED_FIELDS


async def test_health_status_code_theo_dung_luat_503(client: AsyncClient) -> None:
    """policy_loaded == false hoặc policy_keys != 19 ⇒ 503, ngược lại 200.

    Viết theo luật chứ không hard-code 200/503: trước T0.1 chưa có policy.yaml nên
    endpoint trả 503, sau T0.1 sẽ trả 200 — test này đúng ở cả hai giai đoạn.
    """
    response = await client.get("/health")
    body = response.json()
    ready = body["policy_loaded"] and body["policy_keys"] == REQUIRED_POLICY_KEYS
    assert response.status_code == (200 if ready else 503)
    assert body["status"] == ("ok" if ready else "degraded")


def test_readiness_bao_policy_chua_load_khi_thieu_file(tmp_path: Path) -> None:
    """Thiếu config/policy.yaml thì phải báo false, không được im lặng cho qua."""
    settings = Settings(policy_path=tmp_path / "khong-ton-tai.yaml")
    report = build_readiness(settings)
    assert report["policy_loaded"] is False
    assert report["policy_keys"] == 0


def test_readiness_bao_policy_hong_khi_file_ton_tai_nhung_thieu_key(tmp_path: Path) -> None:
    """File có mặt vẫn chưa đủ: T0.1 đổi nghĩa policy_loaded thành 'parse được và đủ 19 key'.

    Ca này chính là cái mà phiên bản chỉ-kiểm-file-tồn-tại cho qua — và nó nguy hiểm hơn
    thiếu file, vì app khởi động bình thường rồi mới chạy sai ngưỡng.
    """
    policy = tmp_path / "policy.yaml"
    policy.write_text("rules: {}\n", encoding="utf-8")
    report = build_readiness(Settings(policy_path=policy))
    assert report["policy_loaded"] is False
    assert report["policy_keys"] == 0


def test_readiness_bao_policy_da_san_sang_voi_file_that() -> None:
    """config/policy.yaml thật của repo phải đưa /health về trạng thái 200 (T0.5 AC #5)."""
    report = build_readiness(Settings())
    assert report["policy_loaded"] is True
    assert report["policy_keys"] == REQUIRED_POLICY_KEYS
    assert REQUIRED_POLICY_KEYS == 19
