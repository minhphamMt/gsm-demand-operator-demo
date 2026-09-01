"""Override ngưỡng theo lượt chạy — điều phối viên chỉnh thông số trên bảng chỉ số.

Ranh giới mà bộ test này giữ: override sống trong đúng một request. Nó KHÔNG ghi vào
`policy.yaml` (§13.2 bắt phải qua owner), KHÔNG rò sang lượt chạy sau (§3 #4 deterministic),
và KHÔNG chạm tới key đã `verified: true` (§11.2).
"""

import pytest
from fastapi.testclient import TestClient

from src.common.errors import PolicyOverrideRejectedError
from src.common.policy import apply_overrides, load_policy, operator_tunable_keys
from src.config import get_settings
from src.main import app


@pytest.fixture
def policy():
    return load_policy(get_settings().policy_path)


def test_chi_mo_key_chua_duoc_owner_chot(policy):
    """`verified: true` là dấu số đã qua Data/BA; UI không được đi vòng qua cổng đó."""
    tunable = operator_tunable_keys(policy)

    assert "avg_vehicle_speed_kmh" not in tunable
    assert all(not policy.meta[key].verified for key in tunable)


def test_khong_mo_key_doi_cau_truc_bai_toan(policy):
    """Danh sách zone ưu tiên và enum chế độ gap không phải thứ kéo một thanh trượt là xong."""
    tunable = operator_tunable_keys(policy)

    assert "priority_zones" not in tunable
    assert "zone_risk_gap_thresholds" not in tunable
    assert "conservative_gap_mode" not in tunable


def test_override_khong_sua_policy_goc(policy):
    """Nếu bản gốc đổi theo, lượt chạy kế tiếp sẽ dùng ngưỡng của lượt trước — mất tái lập."""
    before = policy.rules.budget_cap

    adjusted = apply_overrides(policy, {"budget_cap": 400_000})

    assert adjusted.rules.budget_cap == 400_000
    assert policy.rules.budget_cap == before


def test_override_giu_nguyen_cac_key_khac(policy):
    adjusted = apply_overrides(policy, {"budget_cap": 400_000})

    assert adjusted.rules.min_supply_per_zone == policy.rules.min_supply_per_zone
    assert adjusted.rules.avg_vehicle_speed_kmh == policy.rules.avg_vehicle_speed_kmh


def test_khong_override_thi_tra_ve_chinh_no(policy):
    assert apply_overrides(policy, {}) is policy


def test_tu_choi_key_da_chot(policy):
    with pytest.raises(PolicyOverrideRejectedError, match="verified: true"):
        apply_overrides(policy, {"avg_vehicle_speed_kmh": 30})


def test_tu_choi_key_khong_ton_tai(policy):
    with pytest.raises(PolicyOverrideRejectedError, match="Không có ngưỡng"):
        apply_overrides(policy, {"khong_co_that": 1})


@pytest.mark.parametrize("value", [0, -5])
def test_tu_choi_gia_tri_khong_duong(policy, value):
    """`budget_cap` âm không làm optimizer kêu — nó chỉ lặng lẽ không xếp nổi move nào."""
    with pytest.raises(PolicyOverrideRejectedError, match="lớn hơn 0"):
        apply_overrides(policy, {"budget_cap": value})


@pytest.mark.parametrize("value", [float("nan"), float("inf")])
def test_tu_choi_gia_tri_khong_huu_han(policy, value):
    with pytest.raises(PolicyOverrideRejectedError, match="hữu hạn"):
        apply_overrides(policy, {"max_distance": value})


def test_tu_choi_ty_le_vuot_mot(policy):
    """Trần đọc từ `unit`, nên một key tỷ lệ mới cũng được chặn mà không phải sửa code."""
    with pytest.raises(PolicyOverrideRejectedError, match="tỷ lệ 0–1"):
        apply_overrides(policy, {"assumed_accept_rate": 1.4})


def test_tien_van_la_so_nguyen(policy):
    """CLAUDE.md §5.2 cấm float cho tiền — schema phải chặn, không làm tròn im lặng."""
    with pytest.raises(PolicyOverrideRejectedError, match="budget_cap"):
        apply_overrides(policy, {"budget_cap": 4.7})


def test_tu_choi_gia_tri_khong_phai_so(policy):
    with pytest.raises(PolicyOverrideRejectedError, match="cần một số"):
        apply_overrides(policy, {"budget_cap": "nhiều"})


# ---- Override đi hết đường tới quyết định -------------------------------------------------
#
# Các test trên chứng minh hàm `apply_overrides` đúng. Chúng KHÔNG chứng minh giá trị đã
# chỉnh tới được optimizer — mà đó mới là điều bảng chỉ số hứa với điều phối viên. Hai
# test dưới đi qua đúng endpoint mà giao diện gọi.


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


def _request(**extra: object) -> dict[str, object]:
    return {
        "snapshot_id": "snapshot-001",
        "t": "2026-08-11T10:00:00Z",
        "horizon_min": 15,
        "data_source": "supabase:supply_demand_snapshots:snapshot-001",
        "zones": [_zone(zone_id) for zone_id in range(1, 31)],
        **extra,
    }


def test_override_doi_thuc_su_ket_qua_chay():
    """Hạ trần ngân sách phải hạ chi phí phương án — nếu không, thanh trượt chỉ là trang trí."""
    with TestClient(app) as client:
        baseline = client.post("/api/v1/decisions", json=_request()).json()
        tightened = client.post(
            "/api/v1/decisions",
            json=_request(policy_overrides={"budget_cap": 60_000}),
        ).json()

    assert baseline["plan"]["plan_totals"]["budget_cap"] == 500_000
    assert tightened["plan"]["plan_totals"]["budget_cap"] == 60_000
    assert tightened["plan"]["plan_totals"]["total_cost"] <= 60_000
    assert tightened["plan"]["plan_totals"]["total_cost"] < baseline["plan"]["plan_totals"]["total_cost"]


def test_quyet_dinh_noi_ro_no_chay_duoi_nguong_nao():
    """§3 #7 cấm state ẩn: một plan không nói ra ngưỡng của nó thì không dựng lại được."""
    with TestClient(app) as client:
        plain = client.post("/api/v1/decisions", json=_request()).json()
        adjusted = client.post(
            "/api/v1/decisions",
            json=_request(policy_overrides={"incentive_base": 25_000}),
        ).json()

    assert plain["policy_overrides"] == {}
    assert adjusted["policy_overrides"] == {"incentive_base": 25_000}
    # Ngưỡng đã chỉnh phải hiện ra ở chỗ nó có hiệu lực, không chỉ ở phần echo.
    assert adjusted["activation_policy"]["incentive_amount"] == 25_000


def test_override_hong_tra_ve_422_khong_lang_le_chay_tiep():
    """Chạy tiếp bằng ngưỡng cũ sẽ cho ra một phương án trông hợp lệ dưới ngưỡng không ai chọn."""
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/decisions",
            json=_request(policy_overrides={"avg_vehicle_speed_kmh": 90}),
        )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "POLICY_OVERRIDE_REJECTED"
