"""Test loader policy — docs/design/DATA_CONTRACT.md §5, §5.1 · Task T0.1.

Viết theo Acceptance Criteria của T0.1 trong docs/design/IMPLEMENTATION_PLAN.md §3:
    AC #1  policy.yaml có đúng 19 key
    AC #3  thiếu bất kỳ 1 trong 19 key ⇒ ConfigError, message nêu TÊN key
    AC #5  avg_vehicle_speed_kmh có verified: true; 18 key còn lại có mã ASSUMPTION-nn
AC #2 (script baseline) và AC #4 (test tĩnh yaml.safe_load) nằm ở chỗ khác — xem
tests/test_architecture.py và báo cáo của task.
"""

import logging
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from pydantic import ValidationError

from src.common.errors import ConfigError
from src.common.policy import REQUIRED_RULE_KEYS, get_policy, load_policy
from src.config import PROJECT_ROOT

REAL_POLICY_PATH = PROJECT_ROOT / "config" / "policy.yaml"
ASSUMPTION_CODE = re.compile(r"^ASSUMPTION-\d{2}$")


def _raw() -> dict[str, Any]:
    """Nội dung thật của config/policy.yaml, dùng làm gốc để đục lỗ trong test.

    Đọc bằng yaml ở đây là hợp lệ: luật "chỉ policy.py được safe_load" áp cho src/,
    còn test thì cần dựng được ca hỏng mà loader phải bắt.
    """
    return yaml.safe_load(REAL_POLICY_PATH.read_text(encoding="utf-8"))


def _write(tmp_path: Path, data: dict[str, Any]) -> Path:
    path = tmp_path / "policy.yaml"
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")
    return path


# ---------------------------------------------------------------- AC #1: 19 key


def test_schema_dinh_nghia_dung_19_key() -> None:
    """Số 19 là hằng số contract (§5), không phải chi tiết cài đặt."""
    assert len(REQUIRED_RULE_KEYS) == 19


def test_file_that_nap_duoc_va_du_19_key() -> None:
    policy = load_policy(REAL_POLICY_PATH)
    assert set(_raw()["rules"]) == set(REQUIRED_RULE_KEYS)
    assert policy.version == "1.0"


# ------------------------------------------------- AC #3: thiếu key ⇒ crash nêu tên


@pytest.mark.parametrize("missing_key", REQUIRED_RULE_KEYS)
def test_thieu_bat_ky_key_nao_cung_crash_va_neu_dung_ten(tmp_path: Path, missing_key: str) -> None:
    """Chạy cho cả 19 key: mất key nào thì message phải gọi đúng tên key đó.

    Kiểm từng key chứ không chỉ một key mẫu, vì lỗi hay gặp là danh sách key bắt buộc
    bị chép tay và bỏ sót vài dòng — khi đó key bị sót sẽ mất im lặng.
    """
    data = _raw()
    del data["rules"][missing_key]
    path = _write(tmp_path, data)

    with pytest.raises(ConfigError) as exc_info:
        load_policy(path)
    assert missing_key in str(exc_info.value)
    assert exc_info.value.detail["missing_keys"] == [missing_key]


def test_thieu_nhieu_key_thi_liet_ke_het(tmp_path: Path) -> None:
    """Liệt kê đủ, không dừng ở key đầu tiên — sửa 1 lần thay vì chạy lại 3 lần."""
    data = _raw()
    for key in ("budget_cap", "offer_ttl_minutes", "assumed_accept_rate"):
        del data["rules"][key]

    with pytest.raises(ConfigError) as exc_info:
        load_policy(_write(tmp_path, data))
    assert set(exc_info.value.detail["missing_keys"]) == {"budget_cap", "offer_ttl_minutes", "assumed_accept_rate"}


def test_thieu_field_value_cua_mot_key_cung_bi_bat(tmp_path: Path) -> None:
    """Có key nhưng rỗng ruột vẫn là thiếu ngưỡng, không được coi là hợp lệ."""
    data = _raw()
    del data["rules"]["max_distance"]["value"]

    with pytest.raises(ConfigError, match="max_distance"):
        load_policy(_write(tmp_path, data))


# ------------------------------------------------- §5.1: key thừa chỉ WARNING


def test_key_thua_chi_canh_bao_khong_crash(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    data = _raw()
    data["rules"]["experimental_threshold"] = {"value": 1, "verified": False}
    path = _write(tmp_path, data)

    with caplog.at_level(logging.WARNING, logger="src.common.policy"):
        policy = load_policy(path)

    assert policy.rules.min_supply_per_zone == 3
    assert "experimental_threshold" in caplog.text
    assert not hasattr(policy.rules, "experimental_threshold")


# ------------------------------------------------- §5.1: sai kiểu ⇒ nêu key + kiểu


def test_sai_kieu_thi_crash_neu_ten_key_va_kieu_mong_doi(tmp_path: Path) -> None:
    data = _raw()
    data["rules"]["min_supply_per_zone"]["value"] = "ba xe"

    with pytest.raises(ConfigError) as exc_info:
        load_policy(_write(tmp_path, data))
    message = str(exc_info.value)
    assert "min_supply_per_zone" in message
    assert "integer" in message


def test_tien_khong_nhan_so_le(tmp_path: Path) -> None:
    """Tiền là int VNĐ (CLAUDE.md §5.2). 500000.5đ không phải là số tiền hợp lệ."""
    data = _raw()
    data["rules"]["budget_cap"]["value"] = 500000.5

    with pytest.raises(ConfigError, match="budget_cap"):
        load_policy(_write(tmp_path, data))


def test_conservative_gap_mode_chi_nhan_hai_gia_tri(tmp_path: Path) -> None:
    """Enum của quyết định A-03 — giá trị thứ ba nghĩa là hotspot chạy luật không ai định nghĩa."""
    data = _raw()
    data["rules"]["conservative_gap_mode"]["value"] = "p50_p10"

    with pytest.raises(ConfigError, match="conservative_gap_mode"):
        load_policy(_write(tmp_path, data))


# ------------------------------------------------- AC #5: verified / assumption


def test_avg_vehicle_speed_kmh_da_duoc_chot() -> None:
    """Key duy nhất verified: true — và vì đã chốt nên không mang mã assumption."""
    meta = load_policy(REAL_POLICY_PATH).meta["avg_vehicle_speed_kmh"]
    assert meta.verified is True
    assert meta.assumption is None


def test_18_key_con_lai_deu_tro_ve_mot_ma_assumption() -> None:
    """Mọi số chưa chốt phải truy ngược được về ASSUMPTION register (§8)."""
    meta = load_policy(REAL_POLICY_PATH).meta
    unverified = {key: value for key, value in meta.items() if not value.verified}

    assert len(unverified) == 18
    assert all(item.assumption is not None and ASSUMPTION_CODE.match(item.assumption) for item in unverified.values())
    codes = [item.assumption for item in unverified.values()]
    assert len(set(codes)) == 18, "mã ASSUMPTION bị dùng lại cho hai key khác nhau"


def test_moi_key_deu_khai_owner() -> None:
    """Không có số mồ côi: mỗi ngưỡng phải có người chịu trách nhiệm chốt."""
    meta = load_policy(REAL_POLICY_PATH).meta
    assert [key for key, value in meta.items() if not value.owner] == []


# ------------------------------------------------- Giá trị khớp đặc tả §5


def test_gia_tri_khop_dac_ta() -> None:
    rules = load_policy(REAL_POLICY_PATH).rules
    assert rules.min_supply_per_zone == 3
    assert rules.budget_cap == 500000
    assert rules.max_distance == pytest.approx(7.0)
    assert rules.max_supply_move_pct == pytest.approx(0.40)
    assert rules.cooldown_minutes == 15
    assert rules.priority_zones == ()
    assert rules.deadhead_cost_per_km == 4000
    assert rules.avg_vehicle_speed_kmh == pytest.approx(25.0)
    assert rules.incentive_budget_cap == 1000000
    assert rules.incentive_base == 20000
    assert rules.incentive_per_km == 3000
    assert rules.incentive_max_per_offer == 50000
    assert rules.activation_radius_km == pytest.approx(5.0)
    assert rules.offer_ttl_minutes == 10
    assert rules.max_offers_per_driver_per_hour == 3
    assert rules.overbooking_factor == pytest.approx(1.6)
    assert rules.assumed_accept_rate == pytest.approx(0.6)
    assert rules.min_idle_before_activation == 3
    assert rules.conservative_gap_mode == "p90_p50"


def test_moi_key_tien_deu_la_int() -> None:
    """bool là subclass của int nên phải so bằng type(), không dùng isinstance."""
    rules = load_policy(REAL_POLICY_PATH).rules
    for key in (
        "budget_cap",
        "deadhead_cost_per_km",
        "incentive_budget_cap",
        "incentive_base",
        "incentive_per_km",
        "incentive_max_per_offer",
    ):
        assert type(getattr(rules, key)) is int, f"{key} phải là int VNĐ"


def test_activation_radius_khong_vuot_max_distance() -> None:
    """Tài xế tự nguyện không được điều đi xa hơn xe bị điều chuyển (§5.11)."""
    rules = load_policy(REAL_POLICY_PATH).rules
    assert rules.activation_radius_km <= rules.max_distance


# ------------------------------------------------- Khối derived


def test_derived_giu_nguong_mua_dung_quyet_dinh_7() -> None:
    derived = load_policy(REAL_POLICY_PATH).derived
    assert derived.rain_threshold_mm_h == pytest.approx(0.5)
    assert derived.heavy_rain_mm_h == pytest.approx(5.0)
    assert derived.travel_detour_factor == pytest.approx(1.4)
    assert derived.rain_travel_factor.moderate == pytest.approx(1.3)
    assert derived.rain_travel_factor.heavy == pytest.approx(1.5)


def test_thieu_khoi_derived_thi_crash(tmp_path: Path) -> None:
    """T0.2 lấy ngưỡng mưa từ đây; thiếu khối này thì regime.py buộc phải hard-code."""
    data = _raw()
    del data["derived"]

    with pytest.raises(ConfigError, match="derived"):
        load_policy(_write(tmp_path, data))


# ------------------------------------------------- Ca hỏng cấp file


def test_thieu_file_thi_crash(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="Không tìm thấy"):
        load_policy(tmp_path / "khong-ton-tai.yaml")


def test_yaml_sai_cu_phap_thi_crash(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text("rules: [\n  khong dong ngoac", encoding="utf-8")

    with pytest.raises(ConfigError, match="YAML sai cú pháp"):
        load_policy(path)


def test_thieu_khoi_rules_thi_crash(tmp_path: Path) -> None:
    path = tmp_path / "policy.yaml"
    path.write_text("version: '1.0'\n", encoding="utf-8")

    with pytest.raises(ConfigError, match="rules"):
        load_policy(path)


# ------------------------------------------------- Tính chất của object trả về


def test_policy_la_bat_bien() -> None:
    """Ngưỡng bị sửa lúc chạy = hai module cùng lần chạy dùng hai giá trị khác nhau."""
    rules = load_policy(REAL_POLICY_PATH).rules
    with pytest.raises(ValidationError):
        rules.budget_cap = 1  # type: ignore[misc]


def test_get_policy_dung_cache() -> None:
    get_policy.cache_clear()
    assert get_policy(REAL_POLICY_PATH) is get_policy(REAL_POLICY_PATH)
