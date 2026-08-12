"""Mock của Model 1 — C-06, router R4 (AGENT_WORKFLOW §2.1 hàng 4).

Dùng khi **chưa có artifact LightGBM trên đĩa** (giai đoạn W2–W3): Khối B phải code và
test được trước khi Model 1 train xong, nên phải có một nguồn message §4.2 hợp lệ không
phụ thuộc gì cả — không cần Parquet, không cần bảng tra, không cần train.

Khác nhau giữa ba đường tạo forecast, để không gọi nhầm:

| Đường | Khi nào | `model_version` |
|---|---|---|
| `lgbm_quantile.forecast_at()` | có artifact | `lgbm_quantile_v1` |
| `baseline_hist_avg.forecast_at()` | có dữ liệu lịch sử; là fallback của R3 | `hist_avg_v1` |
| `mock.predict()` (file này) | chưa có gì cả; R4 | `mock_hist_avg_v0` |

`model_version` khác nhau là **có chủ đích**: History Store phải phân biệt được số KPI
sinh từ model thật với số sinh từ mock, nếu không thì mọi so sánh ở §5.14 mất nghĩa.

R4 không có fallback (ô "—" trong bảng router): mock đã là đáy của chuỗi, và fallback
không gọi fallback (C-06, CLAUDE.md §10 #3).
"""

import math
from datetime import timedelta

import pandas as pd

from src.common.regime import Regime, tag_regime
from src.contracts import ZONE_COUNT
from src.contracts.forecast import Forecast, ZoneForecast

# Chuỗi này đã dùng ở tests/test_contracts/mocks.py và ở ví dụ `forecast_ref` của §4.6 —
# giữ nguyên để một `forecast_ref` cũ vẫn tra ngược được về đúng nguồn sinh ra nó.
MODEL_VERSION = "mock_hist_avg_v0"


def _zone_profile(zone_id: int) -> tuple[float, float]:
    """Mức cầu/cung nền của một zone. Hằng số thuần, không random kể cả có seed (§3.2 #4).

    Hai công thức modulo lệch chu kỳ nhau (11 và 15) nên `demand - supply` đổi dấu giữa
    các zone: Khối B nhận được cả zone thiếu lẫn zone thừa để chạy, thay vì một bảng
    phẳng mà Optimizer không có gì để điều.
    """
    return 12.0 + (zone_id * 7) % 11, 8.0 + (zone_id * 5) % 15


def _spread(value: float) -> float:
    """Nửa độ rộng khoảng p10–p90.

    Cầu và cung là biến đếm nên độ lệch chuẩn xấp xỉ `√λ` — dùng luôn để khỏi bịa ra một
    hệ số phần trăm không có căn cứ trong tài liệu nào (CLAUDE.md §4 #6).
    """
    return math.sqrt(max(value, 0.0))


def predict(
    t: pd.Timestamp,
    horizon_min: int,
    *,
    rain_mm_h: float = 0.0,
    peak_flag: int = 0,
) -> Forecast:
    """Message §4.2 cho đủ 30 zone tại `t`, không đọc file, không cần model.

    `rain_mm_h`/`peak_flag` chỉ dùng để gắn nhãn `regime` — mock KHÔNG mô phỏng tác động
    của mưa lên cầu. Nó tồn tại để tầng dưới có dữ liệu đúng hình dạng mà chạy, không
    phải để cho ra con số dùng được; mọi KPI đo trên mock đều vô nghĩa và `model_version`
    đã nói rõ điều đó.
    """
    zones = tuple(_zone_forecast(zone_id) for zone_id in range(1, ZONE_COUNT + 1))
    regime: Regime = tag_regime(rain_mm_h, peak_flag)
    return Forecast(
        t=t.to_pydatetime(),
        horizon_min=horizon_min,
        forecast_ts=(t + timedelta(minutes=horizon_min)).to_pydatetime(),
        zones=zones,
        model_version=MODEL_VERSION,
        regime=regime,
    )


def _zone_forecast(zone_id: int) -> ZoneForecast:
    demand, supply = _zone_profile(zone_id)
    demand_spread = _spread(demand)
    supply_spread = _spread(supply)
    return ZoneForecast(
        zone_id=zone_id,
        predicted_demand=demand,
        predicted_supply=supply,
        demand_p10=max(demand - demand_spread, 0.0),
        demand_p90=demand + demand_spread,
        supply_p10=max(supply - supply_spread, 0.0),
        supply_p90=supply + supply_spread,
        confidence=None,
    )
