"""Khoảng cách great-circle giữa hai zone — NƠI DUY NHẤT của phép haversine (CLAUDE.md §5.2).

Tính **on-the-fly** từ `lat/lng` của config/zone_registry.json, **không** precompute ma trận
30×30 thành file riêng (SPEC §5.4, quyết định Data/BA 2026-08-04). Lý do không phải hiệu năng —
30 zone chỉ có 435 cặp và haversine là vài phép lượng giác — mà là **một nguồn dữ liệu**: có
thêm file ma trận là có thêm thứ phải đồng bộ mỗi khi toạ độ zone đổi, và lệch giữa hai nguồn
thì không có gì phát hiện ra.

Vì thế `distance_between()` CỐ Ý không cache. Chỉ toạ độ (đọc từ đĩa) mới được cache.

Ràng buộc kiến trúc: src/common/ không import package nào khác của src/ (ARCHITECTURE §6.2),
nên đường dẫn registry nhận qua tham số; hằng `DEFAULT_ZONE_REGISTRY_PATH` chỉ để các hàm
tiện ích trong src/common/ có đường đi khi không ai truyền — tầng api/main luôn truyền
`settings.zone_registry_path`.
"""

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

from src.common.errors import ConfigError

# Bán kính Trái Đất trung bình theo IUGG (km). Không phải ngưỡng nghiệp vụ nên không nằm ở
# policy.yaml; đổi số này là đổi đơn vị đo của toàn hệ thống.
EARTH_RADIUS_KM = 6371.0088

DEFAULT_ZONE_REGISTRY_PATH: Path = Path(__file__).resolve().parents[2] / "config" / "zone_registry.json"


@dataclass(frozen=True)
class ZoneCoord:
    """Toạ độ tâm của một zone — phần duy nhất của zone_registry mà phép đo khoảng cách cần."""

    zone_id: int
    lat: float
    lng: float


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Khoảng cách great-circle (km) giữa hai điểm.

    Hàm thuần, không đọc file, không cache — dùng được cả cho zone lẫn cho toạ độ tài xế
    ở Khối C (§5.11) mà không phải viết lại lần thứ hai.
    """
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def load_zone_coords(path: Path = DEFAULT_ZONE_REGISTRY_PATH) -> dict[int, ZoneCoord]:
    """Đọc và kiểm zone_registry.json. Hàm thuần, không cache — dùng trong test.

    Mọi ca hỏng quy về ConfigError giống loader policy: thiếu toạ độ một zone thì mọi move
    liên quan đến zone đó biến mất khỏi plan mà không có dấu hiệu nào lộ ra, nên phải chết
    lúc boot chứ không được rơi về giá trị mặc định.
    """
    raw = _read_json(path)
    if not isinstance(raw, list):
        raise ConfigError(f"{path}: nội dung phải là danh sách zone, nhận {type(raw).__name__}", {"path": str(path)})

    coords: dict[int, ZoneCoord] = {}
    for index, entry in enumerate(raw):
        if not isinstance(entry, dict):
            raise ConfigError(
                f"{path}: phần tử #{index} phải là mapping, nhận {type(entry).__name__}", {"path": str(path)}
            )
        try:
            zone_id = int(entry["zone_id"])
            coord = ZoneCoord(zone_id=zone_id, lat=float(entry["lat"]), lng=float(entry["lng"]))
        except KeyError as exc:
            raise ConfigError(f"{path}: phần tử #{index} thiếu field {exc.args[0]!r}", {"path": str(path)}) from exc
        except (TypeError, ValueError) as exc:
            raise ConfigError(f"{path}: phần tử #{index} sai kiểu toạ độ — {exc}", {"path": str(path)}) from exc

        if zone_id in coords:
            raise ConfigError(f"{path}: zone_id={zone_id} xuất hiện hai lần", {"path": str(path), "zone_id": zone_id})
        coords[zone_id] = coord

    if not coords:
        raise ConfigError(f"{path}: không có zone nào", {"path": str(path)})
    return coords


@cache
def get_zone_coords(path: Path = DEFAULT_ZONE_REGISTRY_PATH) -> Mapping[int, ZoneCoord]:
    """Bản có cache của load_zone_coords — dùng ở runtime.

    Trả MappingProxyType chứ không phải dict: object đã cache mà sửa được thì một nơi ghi
    nhầm sẽ đổi toạ độ của mọi nơi còn lại trong cùng lần chạy (CLAUDE.md §5.3 #3).
    Test cần đọc lại phải gọi `get_zone_coords.cache_clear()` hoặc dùng load_zone_coords.
    """
    return MappingProxyType(load_zone_coords(path))


def distance_between(coords: Mapping[int, ZoneCoord], zone_a: int, zone_b: int) -> float:
    """Khoảng cách (km) giữa hai zone, tính lại mỗi lần gọi.

    KHÔNG cache có chủ đích (T3 AC #5): cache theo cặp zone chính là ma trận 30×30 dựng dần,
    đúng thứ quyết định Data/BA 2026-08-04 loại bỏ.
    """
    try:
        first = coords[zone_a]
        second = coords[zone_b]
    except KeyError as exc:
        raise ConfigError(
            f"zone_registry không có zone_id={exc.args[0]}",
            {"zone_id": exc.args[0], "known_zones": sorted(coords)},
        ) from exc
    return haversine_km(first.lat, first.lng, second.lat, second.lng)


def _read_json(path: Path) -> Any:
    """Đọc JSON, mọi lỗi I/O và cú pháp quy về ConfigError."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ConfigError(f"Không tìm thấy {path} — xem docs/design/DATA_CONTRACT.md §3", {"path": str(path)}) from exc
    except OSError as exc:
        raise ConfigError(f"Không đọc được {path}: {exc}", {"path": str(path)}) from exc

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"{path}: JSON sai cú pháp — {exc}", {"path": str(path)}) from exc
