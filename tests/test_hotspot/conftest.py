"""Fixture dùng chung cho test T2 — message §4.2 dựng thẳng trong bộ nhớ.

**Không đọc `data/`.** Thư mục đó nằm trong .gitignore nên test phụ thuộc file trên đĩa
sẽ đỏ trong CI (cùng lý do đã ghi ở tests/test_forecasting/conftest.py). Số đo trên test
set đóng băng nằm ở eval/results/model2_hotspot_report.json và được kiểm ở
test_acceptance_report.py.

Ở đây KHÔNG train model: Model 2 nhận `Forecast` làm đầu vào, nên dựng thẳng message với
những con số chọn tay là cách duy nhất kiểm được ca biên (gap đúng 0.3, cầu bằng 0,
supply đúng bằng `min_supply_per_zone`). Đi qua LightGBM chỉ thêm nhiễu vào một phép thử
số học thuần.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta, timezone

import pytest

from src.common.regime import Regime
from src.contracts import ZONE_COUNT
from src.contracts.forecast import Forecast, HorizonMin, ZoneForecast

TZ = timezone(timedelta(hours=7))

# Mốc trung tính, rơi đúng lưới 5 phút; giá trị cụ thể không ảnh hưởng kết luận nào.
T0 = datetime(2026, 9, 25, 17, 0, tzinfo=TZ)

MODEL_VERSION = "test_forecast_v0"

# Zone "trung tính": cung bằng cầu nên không thỏa vế nào của §4.3. Mọi test chỉ ghi đè
# vài zone quan tâm, phần còn lại giữ mặc định này để nhiễu không lọt vào phép đếm.
NEUTRAL_DEMAND = 10.0
NEUTRAL_SUPPLY = 10.0


def zone_forecast(
    zone_id: int,
    *,
    demand: float,
    supply: float,
    demand_p90: float | None = None,
    supply_p10: float | None = None,
) -> ZoneForecast:
    """Một dòng §4.2. p10/p90 mặc định trùng p50 để chế độ thận trọng KHÔNG đổi gì.

    Trùng p50 là mặc định có chủ đích: test nào muốn đo tác động của `p90_p50`/`p90_p10`
    thì phải nói rõ bằng cách truyền `demand_p90`/`supply_p10`. Nếu mặc định đã nới sẵn
    khoảng thì mọi test đều dính ảnh hưởng của chế độ gap mà không ai chủ ý.
    """
    high_demand = demand if demand_p90 is None else demand_p90
    low_supply = supply if supply_p10 is None else supply_p10
    return ZoneForecast(
        zone_id=zone_id,
        predicted_demand=demand,
        predicted_supply=supply,
        demand_p10=demand,
        demand_p90=high_demand,
        supply_p10=low_supply,
        supply_p90=supply,
    )


def make_forecast(
    zones: Mapping[int, ZoneForecast] | None = None,
    *,
    regime: Regime = "normal",
    t: datetime = T0,
    horizon_min: HorizonMin = 15,
) -> Forecast:
    """Message §4.2 phủ đủ 30 zone; `zones` ghi đè những zone cần dựng riêng."""
    overrides = dict(zones or {})
    filled = tuple(
        overrides.get(zone_id) or zone_forecast(zone_id, demand=NEUTRAL_DEMAND, supply=NEUTRAL_SUPPLY)
        for zone_id in range(1, ZONE_COUNT + 1)
    )
    return Forecast(
        t=t,
        horizon_min=horizon_min,
        forecast_ts=t + timedelta(minutes=horizon_min),
        zones=filled,
        model_version=MODEL_VERSION,
        regime=regime,
    )


@pytest.fixture
def idle_supply() -> dict[int, int]:
    """`idle_supply_current` của 30 zone — số THẬT tại `t`, cố ý khác mọi giá trị dự báo.

    Chọn 7 + zone_id % 3 (7/8/9) trong khi cầu/cung dự báo quanh 10: nếu ở đâu đó module
    lấy nhầm `predicted_supply` làm `idle_supply_current`, con số trong output sẽ lộ ra
    ngay thay vì tình cờ trùng nhau.
    """
    return {zone_id: 7 + zone_id % 3 for zone_id in range(1, ZONE_COUNT + 1)}
