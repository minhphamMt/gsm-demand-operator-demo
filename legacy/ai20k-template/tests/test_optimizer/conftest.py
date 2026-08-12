"""Fixture dùng chung cho test T3 — message §4.3 dựng thẳng trong bộ nhớ.

**Không đọc `data/`.** Thư mục đó nằm trong .gitignore nên test phụ thuộc file trên đĩa sẽ đỏ
trong CI (cùng lý do đã ghi ở tests/test_hotspot/conftest.py). `config/policy.yaml` và
`config/zone_registry.json` thì ngược lại: hai file này được commit và là nguồn ngưỡng/toạ độ
thật, nên test đọc trực tiếp.

Toạ độ trong test mặc định là lưới THẲNG HÀNG chứ không phải toạ độ Hà Nội thật: cái cần kiểm
là "chọn nguồn gần nhất", "cắt ở đúng max_distance", "eta đúng ngưỡng làm tròn" — với toạ độ
thật thì mỗi khẳng định phải kèm một con số haversine không ai đọc ra được, và sửa một zone
trong registry là đỏ hàng loạt test không liên quan. Toạ độ thật vẫn được dùng ở phép đo thời
gian (AC #2) và ở test đối chiếu khoảng cách của chính module haversine.
"""

from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from src.common.haversine import EARTH_RADIUS_KM, ZoneCoord, load_zone_coords
from src.common.policy import Policy, load_policy
from src.contracts import ZONE_COUNT
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.optimizer.constraints import OptimizerLimits, limits_from_policy

TZ = timezone(timedelta(hours=7))

# Mốc trung tính, rơi đúng lưới 5 phút (StepAlignedDatetime của §4.3).
T0 = datetime(2026, 9, 25, 17, 0, tzinfo=TZ)

REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_POLICY_PATH = REPO_ROOT / "config" / "policy.yaml"
REAL_ZONE_REGISTRY_PATH = REPO_ROOT / "config" / "zone_registry.json"

# Độ dài 1 độ vĩ tuyến (km) theo đúng bán kính haversine đang dùng. Dựng lưới toạ độ theo
# kinh tuyến (lng cố định) nên khoảng cách hai zone bằng đúng hiệu vĩ độ — không xấp xỉ.
KM_PER_DEGREE_LAT = EARTH_RADIUS_KM * 3.141592653589793 / 180.0


def line_coords(spacing_km: float, count: int = ZONE_COUNT) -> dict[int, ZoneCoord]:
    """`count` zone thẳng hàng trên một kinh tuyến, cách đều `spacing_km`.

    Khoảng cách zone i → zone j đúng bằng `|i − j| × spacing_km`, nên mọi khẳng định trong
    test viết được bằng số nguyên km thay vì hằng haversine chép tay.
    """
    return {
        zone_id: ZoneCoord(zone_id=zone_id, lat=(zone_id - 1) * spacing_km / KM_PER_DEGREE_LAT, lng=105.8)
        for zone_id in range(1, count + 1)
    }


def make_policy(**rule_overrides: Any) -> Policy:
    """Policy thật của repo, ghi đè vài `rules` cho ca cần kiểm.

    Dựng từ file thật chứ không bịa 19 key: test đi qua đúng loader mà production dùng, nên
    một key đổi kiểu trong policy.yaml sẽ làm test T3 đỏ thay vì âm thầm chạy trên số khác.
    `model_copy` giữ nguyên `meta`, `derived` — chỉ những gì test nói rõ mới đổi.
    """
    policy = load_policy(REAL_POLICY_PATH)
    if not rule_overrides:
        return policy
    return policy.model_copy(update={"rules": policy.rules.model_copy(update=rule_overrides)})


def hotspot(zone_id: int, *, gap: float, severity: float | None = None, idle: int = 0) -> Hotspot:
    """Một dòng `hotspots[]` §4.3. `severity` mặc định tỷ lệ thuận với gap để thứ tự dễ đọc."""
    return Hotspot(
        zone_id=zone_id,
        is_hotspot=True,
        gap=gap,
        severity_score=gap / 10.0 if severity is None else severity,
        idle_supply_current=idle,
    )


def source(zone_id: int, *, surplus: float, idle: int, cooldown_until_ts: datetime | None = None) -> SurplusZone:
    """Một dòng `surplus_zones[]` §4.3 — tên hàm là "source" vì đây là ứng viên nguồn của §5.4."""
    return SurplusZone(
        zone_id=zone_id,
        surplus=surplus,
        idle_supply_current=idle,
        cooldown_until_ts=cooldown_until_ts,
    )


def make_output(
    hotspots: Iterable[Hotspot] = (),
    surplus_zones: Iterable[SurplusZone] = (),
    *,
    forecast_ts: datetime = T0,
    horizon_min: int = 15,
) -> HotspotOutput:
    """Message §4.3 tối thiểu — chỉ những zone test quan tâm, không phải đủ 30."""
    return HotspotOutput.model_validate(
        {
            "forecast_ts": forecast_ts,
            "horizon_min": horizon_min,
            "hotspots": tuple(hotspots),
            "surplus_zones": tuple(surplus_zones),
        }
    )


def dry(zone_ids: Iterable[int] | None = None, *, count: int = ZONE_COUNT) -> dict[int, float]:
    """`rain_mm_h` = 0 cho mọi zone — mặc định của test không nói gì về thời tiết."""
    zones = range(1, count + 1) if zone_ids is None else zone_ids
    return dict.fromkeys(zones, 0.0)


@pytest.fixture
def policy() -> Policy:
    """Policy thật, không ghi đè — mốc mặc định của mọi test không nói rõ ngưỡng."""
    return make_policy()


@pytest.fixture
def policy_limits() -> OptimizerLimits:
    """Ngưỡng thật của repo ở dạng OptimizerLimits — dùng cho test từng vị từ ràng buộc."""
    return limits_from_policy(make_policy())


@pytest.fixture
def real_zone_coords() -> Mapping[int, ZoneCoord]:
    """Toạ độ 30 zone thật từ config/zone_registry.json."""
    return load_zone_coords(REAL_ZONE_REGISTRY_PATH)
