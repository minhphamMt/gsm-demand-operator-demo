"""Endpoint phơi ngưỡng vận hành, và ràng buộc của thang rủi ro.

Endpoint này tồn tại để backend NestJS không phải tự parse `policy.yaml` — CLAUDE.md §3 #2
cho phép đúng một người đọc file. Test giữ đúng cái hợp đồng đó: bên gọi phải lấy được
ngưỡng qua HTTP, và thang phải từ chối những bộ số chấm sai lặng lẽ.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from src.common.policy import PolicyRules, load_policy
from src.config import get_settings
from src.main import app


def _rules_payload() -> dict:
    """Bộ key hợp lệ, lấy từ chính policy đang chạy để test không tự dựng bảng ngưỡng riêng."""
    return load_policy(get_settings().policy_path).rules.model_dump()


def test_endpoint_tra_ve_thang_rui_ro():
    response = TestClient(app).get("/api/v1/policy")

    assert response.status_code == 200
    body = response.json()
    assert body["rules"]["zone_risk_gap_thresholds"] == [1, 6, 11]


def test_endpoint_kem_phien_ban_de_truy_vet():
    """`version` và `frozen_at` đi kèm để bên gọi biết ngưỡng đã đổi mà không phải so từng số."""
    body = TestClient(app).get("/api/v1/policy").json()

    assert body["version"]
    assert body["frozen_at"]


def test_thang_phai_tang_nghiem_ngat():
    # Thang sai thứ tự vẫn nạp được sẽ làm một mức không bao giờ với tới — bảng điều hành
    # mất hẳn một màu mà không có lỗi nào báo ra.
    for broken in [(6, 1, 11), (1, 6, 6), (11, 6, 1)]:
        with pytest.raises(ValidationError, match="tăng nghiêm ngặt"):
            PolicyRules(**{**_rules_payload(), "zone_risk_gap_thresholds": broken})


def test_nguong_dau_phai_it_nhat_mot_xe():
    """`gap = 0` là định nghĩa của "ổn định"; cho phép ngưỡng 0 sẽ xoá hẳn mức đó."""
    with pytest.raises(ValidationError, match="≥ 1"):
        PolicyRules(**{**_rules_payload(), "zone_risk_gap_thresholds": (0, 6, 11)})


def test_endpoint_kem_meta_va_danh_sach_chinh_duoc():
    """Giao diện dựng bảng chỉ số từ payload này, nên đơn vị và `tunable` phải đi cùng.

    `tunable` do server quyết chứ không phải UI tự suy: nếu UI tự chọn, nó sẽ mở một ngưỡng
    mà `apply_overrides` từ chối, và điều phối viên gặp lỗi 422 sau khi đã kéo xong thanh.
    """
    body = TestClient(app).get("/api/v1/policy").json()

    assert body["meta"]["budget_cap"]["unit"] == "VNĐ/plan"
    assert body["meta"]["avg_vehicle_speed_kmh"]["verified"] is True
    assert "budget_cap" in body["tunable"]
    assert "avg_vehicle_speed_kmh" not in body["tunable"]


def test_endpoint_khong_co_duong_ghi():
    """§13.2: giá trị policy chỉ đổi qua owner. Một endpoint ghi ở đây là đường vòng qua đó."""
    client = TestClient(app)

    assert client.post("/api/v1/policy", json={"budget_cap": 1}).status_code == 405
    assert client.put("/api/v1/policy", json={"budget_cap": 1}).status_code == 405
