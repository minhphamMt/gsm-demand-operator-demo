"""Test khoảng cách haversine — Task T3 AC #5 (SPEC §5.4, quyết định Data/BA 2026-08-04).

Hai thứ được kiểm ở đây:
    #1 con số đúng — đối chiếu với một công thức ĐỘC LẬP (spherical law of cosines) chứ không
       chép lại kết quả của chính hàm đang test, vì như thế chỉ khoá được lỗi hồi quy chứ
       không phát hiện được công thức sai từ đầu;
    #2 tính on-the-fly — không hàm nào cache theo cặp zone, vì cache theo cặp chính là ma trận
       30×30 dựng dần, đúng thứ quyết định Data/BA loại bỏ.
"""

import json
import math
from pathlib import Path

import pytest

from src.common.errors import ConfigError
from src.common.haversine import (
    DEFAULT_ZONE_REGISTRY_PATH,
    EARTH_RADIUS_KM,
    ZoneCoord,
    distance_between,
    get_zone_coords,
    haversine_km,
    load_zone_coords,
)
from src.contracts import ZONE_COUNT

REAL_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "zone_registry.json"


def law_of_cosines_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Công thức great-circle KHÁC, dùng làm trọng tài cho haversine.

    Kém ổn định số học ở khoảng cách rất nhỏ nên không dùng trong src/, nhưng ở thang vài km
    trở lên nó thừa chính xác để bắt lỗi công thức.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta = math.radians(lng2 - lng1)
    cos_central = math.sin(phi1) * math.sin(phi2) + math.cos(phi1) * math.cos(phi2) * math.cos(delta)
    return EARTH_RADIUS_KM * math.acos(min(1.0, max(-1.0, cos_central)))


# ------------------------------------------------------------------------------ công thức


def test_hai_diem_trung_nhau_cho_khoang_cach_khong() -> None:
    """Zone tới chính nó phải là 0 — asin(sqrt(0)) không được ra NaN."""
    assert haversine_km(21.0343, 105.8142, 21.0343, 105.8142) == 0.0


def test_mot_do_vi_tuyen_bang_cung_tron_tuong_ung() -> None:
    """Dọc kinh tuyến, 1 độ = R × π/180 — mốc kiểm được bằng tay, không phụ thuộc dữ liệu zone."""
    assert haversine_km(0.0, 105.8, 1.0, 105.8) == pytest.approx(EARTH_RADIUS_KM * math.pi / 180.0)


def test_hai_diem_doi_xung_qua_tam_bang_nua_chu_vi() -> None:
    """Ca biên của asin: a = 1 đúng, sai số float làm sqrt(1.0000000002) là ném ValueError."""
    assert haversine_km(0.0, 0.0, 0.0, 180.0) == pytest.approx(math.pi * EARTH_RADIUS_KM)


@pytest.mark.parametrize(("zone_a", "zone_b"), [(1, 2), (1, 30), (7, 12), (15, 16)])
def test_khop_cong_thuc_doc_lap_tren_toa_do_that(zone_a: int, zone_b: int) -> None:
    """AC #5 — số phải đúng trên chính toạ độ Hà Nội mà Optimizer sẽ dùng."""
    coords = load_zone_coords(REAL_REGISTRY_PATH)
    first, second = coords[zone_a], coords[zone_b]
    expected = law_of_cosines_km(first.lat, first.lng, second.lat, second.lng)
    assert distance_between(coords, zone_a, zone_b) == pytest.approx(expected, abs=1e-6)


def test_khoang_cach_doi_xung() -> None:
    """A→B và B→A phải bằng nhau tuyệt đối: Optimizer so ứng viên bằng khoảng cách, lệch
    một ulp ở đây là thứ tự chọn nguồn đổi giữa hai lần chạy (§3 #4)."""
    coords = load_zone_coords(REAL_REGISTRY_PATH)
    for zone_b in range(2, ZONE_COUNT + 1):
        assert distance_between(coords, 1, zone_b) == distance_between(coords, zone_b, 1)


# ------------------------------------------------------------- on-the-fly, không ma trận 30×30


def test_khong_ham_nao_cache_theo_cap_zone() -> None:
    """AC #5 — `functools.cache` gắn `cache_info` vào hàm; có nó nghĩa là đang dựng ma trận dần."""
    assert not hasattr(haversine_km, "cache_info")
    assert not hasattr(distance_between, "cache_info")


def test_moi_lan_goi_deu_tinh_lai(monkeypatch: pytest.MonkeyPatch) -> None:
    """Gọi hai lần cùng cặp zone phải chạy công thức hai lần, không lấy lại kết quả cũ."""
    calls = 0
    original = haversine_km

    def counting(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        nonlocal calls
        calls += 1
        return original(lat1, lng1, lat2, lng2)

    monkeypatch.setattr("src.common.haversine.haversine_km", counting)
    coords = load_zone_coords(REAL_REGISTRY_PATH)
    distance_between(coords, 1, 2)
    distance_between(coords, 1, 2)
    assert calls == 2


def test_toa_do_duoc_cache_con_khoang_cach_thi_khong() -> None:
    """Đọc file mới là thứ đáng cache; khoảng cách thì không (T3 AC #5)."""
    assert hasattr(get_zone_coords, "cache_info")
    get_zone_coords.cache_clear()
    first = get_zone_coords(REAL_REGISTRY_PATH)
    assert get_zone_coords(REAL_REGISTRY_PATH) is first


def test_toa_do_da_cache_khong_sua_duoc() -> None:
    """Object dùng chung mà sửa được thì một nơi ghi nhầm đổi toạ độ của mọi nơi còn lại."""
    coords = get_zone_coords(REAL_REGISTRY_PATH)
    with pytest.raises(TypeError):
        coords[999] = ZoneCoord(zone_id=999, lat=0.0, lng=0.0)


# ------------------------------------------------------------------------------- loader


def test_duong_dan_mac_dinh_tro_dung_registry_that() -> None:
    """Hằng suy từ vị trí module — sai một cấp thư mục là mọi khoảng cách biến mất lúc runtime."""
    assert DEFAULT_ZONE_REGISTRY_PATH == REAL_REGISTRY_PATH
    assert DEFAULT_ZONE_REGISTRY_PATH.is_file()


def test_registry_that_du_30_zone() -> None:
    """Thiếu một zone thì mọi move liên quan tới nó lặng lẽ biến mất khỏi plan."""
    coords = load_zone_coords(REAL_REGISTRY_PATH)
    assert sorted(coords) == list(range(1, ZONE_COUNT + 1))


def test_thieu_file_thi_bao_loi_cau_hinh(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="Không tìm thấy"):
        load_zone_coords(tmp_path / "khong-ton-tai.json")


def test_json_sai_cu_phap_thi_crash(tmp_path: Path) -> None:
    path = tmp_path / "zone_registry.json"
    path.write_text("[{", encoding="utf-8")
    with pytest.raises(ConfigError, match="sai cú pháp"):
        load_zone_coords(path)


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"zone_id": 1}, "nội dung phải là danh sách"),
        ([{"zone_id": 1, "lat": 21.0}], "thiếu field 'lng'"),
        ([{"zone_id": 1, "lat": "bắc", "lng": 105.8}], "sai kiểu toạ độ"),
        ([{"zone_id": 1, "lat": 21.0, "lng": 105.8}, {"zone_id": 1, "lat": 21.1, "lng": 105.9}], "hai lần"),
        ([], "không có zone nào"),
    ],
)
def test_registry_hong_thi_bao_loi_ro_rang(tmp_path: Path, payload: object, message: str) -> None:
    """Mọi ca hỏng quy về ConfigError có nêu chỗ sai — không có đường rơi về giá trị mặc định."""
    path = tmp_path / "zone_registry.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ConfigError, match=message):
        load_zone_coords(path)


def test_zone_khong_co_trong_registry_thi_bao_loi() -> None:
    """Hỏi khoảng cách tới zone lạ phải nổ chứ không trả 0 — 0 km là "gần nhất" của mọi so sánh."""
    coords = load_zone_coords(REAL_REGISTRY_PATH)
    with pytest.raises(ConfigError, match="zone_id=99"):
        distance_between(coords, 1, 99)
