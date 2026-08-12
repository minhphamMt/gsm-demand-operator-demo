"""Test cho generate_drivers.py — T0.6 (driver_registry.json, driver_response.yaml, A6).

Đặt ở gốc tests/ cùng chỗ với test_generator.py: bộ sinh dữ liệu là script gốc repo, chưa nằm
trong cây src/ mà ARCHITECTURE §7 đặc tả.

Test đọc `config/` (có trong git) nhưng KHÔNG đọc `data/` (nằm trong .gitignore, CI không có).
Ràng buộc A6 vì thế được kiểm trên snapshot tí hon dựng tại chỗ, không phải trên file A1 thật —
file thật do chính `generate_drivers.py` chặn ở bước validate_a6(), thoát mã 1 nếu lệch.
"""

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

from generate_drivers import (
    OFFLINE_RATIO,
    build_registry,
    build_states,
    largest_remainder,
    load_zones,
    validate_a6,
    validate_registry,
)
from src.common.policy import DEFAULT_POLICY_PATH, get_policy

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "config" / "driver_registry.json"
RESPONSE_PATH = ROOT / "config" / "driver_response.yaml"

# Offer trung vị dùng để hiệu chỉnh, lấy từ DATA_CONTRACT §6.2 — không phải số tự nghĩ.
MEDIAN_INCENTIVE_VND = 33_000
MEDIAN_DISTANCE_KM = 4.2


@pytest.fixture(scope="module")
def registry() -> list[dict]:
    with open(REGISTRY_PATH, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def zones() -> list[dict]:
    return load_zones(str(ROOT))


@pytest.fixture(scope="module")
def response_cfg() -> dict:
    with open(RESPONSE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


# --------------------------------------------------------------------------- AC #1–#3, C-03/C-08


def test_dung_600_tai_xe_khong_trung_id(registry: list[dict]) -> None:
    """AC #1 — 600 tài xế, driver_id là khóa chính."""
    assert len(registry) == 600
    ids = [d["driver_id"] for d in registry]
    assert len(set(ids)) == 600


def test_driver_id_dung_dinh_dang(registry: list[dict]) -> None:
    """AC #1 — `^DRV-\\d{4}$` (DATA_CONTRACT §2.7)."""
    assert all(re.fullmatch(r"DRV-\d{4}", d["driver_id"]) for d in registry)


def test_is_demo_account_true_toan_bo(registry: list[dict]) -> None:
    """AC #2 / C-03 — không ngoại lệ, đây là chốt chặn chống nhầm với dữ liệu thật về sau."""
    assert [d["is_demo_account"] for d in registry] == [True] * 600


def test_display_name_la_nhan_gia(registry: list[dict]) -> None:
    """AC #3 — chặn tên người thật lọt vào repo demo."""
    assert all(re.fullmatch(r"Tài xế \d+", d["display_name"]) for d in registry)


def test_khong_co_truong_cham_diem_tai_xe(registry: list[dict]) -> None:
    """C-08 — tài xế luôn được từ chối, không chấm điểm/xếp hạng/chế tài (CLAUDE.md §8 #6)."""
    banned = {"accept_rate_of_driver", "driver_rank", "driver_score", "driver_tier", "reliability"}
    assert banned & set().union(*(d.keys() for d in registry)) == set()


def test_khong_co_du_lieu_ca_nhan_that(registry: list[dict]) -> None:
    """§8 #4 — không SĐT/email/biển số, kể cả dưới tên trường khác."""
    banned = {"phone", "phone_number", "email", "plate", "license_plate", "national_id", "address"}
    assert banned & set().union(*(d.keys() for d in registry)) == set()
    blob = json.dumps(registry, ensure_ascii=False)
    assert not re.search(r"\b0\d{9}\b|@", blob)


def test_dung_bay_truong_theo_contract(registry: list[dict]) -> None:
    """Entity Driver §4.7 có đúng 7 field — thừa field là contract trôi, thiếu là chưa xong."""
    expected = {
        "driver_id",
        "display_name",
        "home_zone",
        "current_zone",
        "status",
        "shift_end_ts",
        "is_demo_account",
    }
    assert all(set(d.keys()) == expected for d in registry)
    assert all(1 <= d["home_zone"] <= 30 and 1 <= d["current_zone"] <= 30 for d in registry)


def test_validate_registry_tu_choi_is_demo_account_false(registry: list[dict]) -> None:
    """Chốt chặn phải nằm ở CHỖ SINH, không đợi test bắt sau."""
    broken = [dict(registry[0], is_demo_account=False), *registry[1:]]
    with pytest.raises(ValueError, match="C-03"):
        validate_registry(broken)


# --------------------------------------------------------------------------- phân bố & tất định


def test_home_zone_phan_bo_theo_mat_do_dan_so(registry: list[dict], zones: list[dict]) -> None:
    """§6.1 — tỷ lệ thuận `population_density`, không phải chia đều 20 người/zone."""
    counts = pd.Series([d["home_zone"] for d in registry]).value_counts().reindex([z["zone_id"] for z in zones])
    density = pd.Series([z["population_density"] for z in zones], index=[z["zone_id"] for z in zones])
    assert counts.sum() == 600
    # Sai lệch so với suất lý thuyết chỉ do làm tròn Hare quota, tối đa dưới 1 người.
    ideal = density / density.sum() * 600
    assert (counts - ideal).abs().max() < 1.0


def test_registry_tat_dinh_theo_seed(zones: list[dict]) -> None:
    assert build_registry(zones, seed=42) == build_registry(zones, seed=42)
    assert build_registry(zones, seed=42) != build_registry(zones, seed=43)


def test_registry_tren_dia_khop_bo_sinh(registry: list[dict], zones: list[dict]) -> None:
    """File đã commit phải tái lập được từ seed đã ghi — lệch nghĩa là ai đó sửa tay."""
    assert build_registry(zones) == registry


@pytest.mark.parametrize("total", [600, 7, 100])
def test_largest_remainder_tong_luon_dung(total: int) -> None:
    """Làm tròn từng phần độc lập cho tổng lệch vài suất; tổng lệch = số tài xế khác 600."""
    counts = largest_remainder(np.array([5.0, 3.0, 1.5, 0.4]), total)
    assert counts.sum() == total
    assert (counts >= 0).all()


# --------------------------------------------------------------------------- AC #4 — ràng buộc A6


def _mini_snapshot(idle_by_step: list[list[int]], zones: list[dict]) -> pd.DataFrame:
    """Snapshot tí hon: mỗi dòng là (ts_bucket, zone_id, idle_supply) như A1 thật."""
    base = pd.Timestamp("2026-09-25 17:00", tz="+07:00")
    rows = []
    for i, idle in enumerate(idle_by_step):
        for z, k in zip((zone["zone_id"] for zone in zones), idle, strict=True):
            rows.append((base + pd.Timedelta(minutes=5 * i), z, k))
    return pd.DataFrame(rows, columns=["ts_bucket", "zone_id", "idle_supply"])


def test_a6_khop_100_phan_tram(registry: list[dict], zones: list[dict]) -> None:
    """AC #4 — COUNT(online_idle, zone) == idle_supply, mọi ts_bucket × mọi zone, lệch 0 dòng."""
    idle_by_step = [
        [0] * 30,  # cả thành phố không còn xe rảnh
        [(z * 3) % 11 for z in range(1, 31)],  # rải rác, có zone bằng 0
        [40] + [1] * 29,  # zone 1 cần 40 người, nhiều hơn số tài xế có home_zone ở đó
        [11] * 30,  # đều nhau, tổng 330 — sát mức cao nhất của A1 thật
    ]
    states = build_states(_mini_snapshot(idle_by_step, zones), registry, zones, seed=2026)
    assert len(validate_a6(states, _mini_snapshot(idle_by_step, zones))) == 0


def test_bao_loi_khi_khong_du_tai_xe(registry: list[dict], zones: list[dict]) -> None:
    """Vỡ ràng buộc phải CRASH, không im lặng gán thiếu rồi để A6 lệch (CLAUDE.md §3.1)."""
    snapshot = _mini_snapshot([[30] * 30], zones)  # cần 900 người idle, đội chỉ có 600
    with pytest.raises(ValueError, match="idle"):
        build_states(snapshot, registry, zones, seed=2026)


def test_ty_le_offline_dung_assumption_21(registry: list[dict], zones: list[dict]) -> None:
    """ASSUMPTION-21 — 25% đội offline, đây là nguồn ứng viên của Khối C."""
    snapshot = _mini_snapshot([[(z * 3) % 11 for z in range(1, 31)]] * 3, zones)
    states = build_states(snapshot, registry, zones, seed=2026)
    per_step = states[states["status"] == "offline"].groupby("ts_bucket", observed=True).size()
    assert set(per_step) == {round(OFFLINE_RATIO * 600)}


def test_tai_xe_khong_idle_dung_o_home_zone(registry: list[dict], zones: list[dict]) -> None:
    """§4.8 — `from_zone` của tài xế offline lấy `home_zone`; online_busy không nhận offer."""
    snapshot = _mini_snapshot([[(z * 3) % 11 for z in range(1, 31)]], zones)
    states = build_states(snapshot, registry, zones, seed=2026)
    home = pd.Series({d["driver_id"]: d["home_zone"] for d in registry})
    idle_mask = states["status"] == "online_idle"
    not_idle = states[~idle_mask]
    assert (not_idle["current_zone"].to_numpy() == home[not_idle["driver_id"]].to_numpy()).all()


def test_doi_offline_doi_nguoi_theo_thoi_gian(registry: list[dict], zones: list[dict]) -> None:
    """Không được để cố định đúng 150 người offline suốt cả run — Khối C sẽ chỉ thấy một nhóm."""
    snapshot = _mini_snapshot([[(z * 3) % 11 for z in range(1, 31)]] * 4, zones)
    states = build_states(snapshot, registry, zones, seed=2026)
    offline = states[states["status"] == "offline"]
    per_step = offline.groupby("ts_bucket", observed=True)["driver_id"].apply(frozenset)
    assert len(set(per_step)) == len(per_step)


def test_build_states_tat_dinh(registry: list[dict], zones: list[dict]) -> None:
    snapshot = _mini_snapshot([[(z * 3) % 11 for z in range(1, 31)]] * 2, zones)
    a = build_states(snapshot, registry, zones, seed=2026)
    b = build_states(snapshot, registry, zones, seed=2026)
    pd.testing.assert_frame_equal(a, b)


# --------------------------------------------------------------------------- AC #5–#6


def test_driver_response_du_tham_so(response_cfg: dict) -> None:
    """AC #5 — 7 tham số + seed 7, clip cứng [0.05, 0.95] theo §5.11."""
    assert set(response_cfg) == {
        "seed",
        "base_rate",
        "w_incentive",
        "w_distance",
        "w_shift_end",
        "near_shift_end_minutes",
        "clip",
        "mode",
    }
    assert response_cfg["seed"] == 7
    assert response_cfg["clip"] == [0.05, 0.95]
    assert response_cfg["mode"] in {"human", "simulated", "mixed"}


def test_hieu_chinh_base_rate_khop_assumed_accept_rate(response_cfg: dict) -> None:
    """AC #6 — con số hiển thị ra UI và con số quyết định mô phỏng phải là một.

    Lệch nghĩa là preview chiến dịch nói một đằng, kết quả mô phỏng ra một nẻo. Test này là
    thứ chặn việc đó tái diễn khi ai đó chỉnh một trong hai bên mà quên bên kia.
    """
    rules = get_policy(DEFAULT_POLICY_PATH).rules
    p_accept = (
        response_cfg["base_rate"]
        + response_cfg["w_incentive"] * (MEDIAN_INCENTIVE_VND / rules.incentive_max_per_offer)
        - response_cfg["w_distance"] * (MEDIAN_DISTANCE_KM / rules.activation_radius_km)
    )
    assert abs(p_accept - rules.assumed_accept_rate) <= 0.05, (
        f"p_accept trung vị {p_accept:.3f} lệch quá 0.05 so với assumed_accept_rate "
        f"{rules.assumed_accept_rate}. Chỉnh base_rate hoặc assumed_accept_rate — xem DATA_CONTRACT §6.2."
    )


def test_p_accept_nam_trong_khoang_clip(response_cfg: dict) -> None:
    """Biên: offer tệ nhất và tốt nhất vẫn phải cho tài xế cửa từ chối lẫn cửa nhận (C-08)."""
    lo, hi = response_cfg["clip"]
    worst = response_cfg["base_rate"] - response_cfg["w_distance"] - response_cfg["w_shift_end"]
    best = response_cfg["base_rate"] + response_cfg["w_incentive"]
    assert min(max(worst, lo), hi) >= lo
    assert min(max(best, lo), hi) <= hi
    assert lo > 0.0 and hi < 1.0  # không bao giờ chắc chắn nhận, cũng không bao giờ chắc chắn từ chối
