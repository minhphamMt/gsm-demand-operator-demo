"""Test mock của Model 1 — C-06, router R4 (AGENT_WORKFLOW §2.1 hàng 4).

DoD #7 đòi "module chưa xong có mock ĐÚNG CONTRACT". Mock chỉ có nghĩa nếu nó không phụ
thuộc gì cả: không Parquet, không bảng tra, không train. Nên test ở đây cố ý KHÔNG dùng
fixture snapshot — gọi thẳng `predict()` là ra message §4.2.

Ba `model_version` phải khác nhau (`lgbm_quantile_v1` / `hist_avg_v1` / `mock_hist_avg_v0`):
History Store phải phân biệt được số KPI sinh từ model thật với số sinh từ mock, nếu không
thì mọi so sánh §5.14 mất nghĩa.
"""

from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from src.contracts import ZONE_COUNT
from src.contracts.forecast import Forecast
from src.forecasting import baseline_hist_avg, lgbm_quantile, mock

TZ = timezone(timedelta(hours=7))
T = pd.Timestamp("2026-08-02 17:05", tz=TZ)


def test_mock_tra_message_4_2_hop_le_khong_can_du_lieu_gi() -> None:
    forecast = mock.predict(T, 15)
    assert isinstance(forecast, Forecast)
    assert len(forecast.zones) == ZONE_COUNT
    assert sorted(zone.zone_id for zone in forecast.zones) == list(range(1, ZONE_COUNT + 1))
    assert forecast.t == datetime(2026, 8, 2, 17, 5, tzinfo=TZ)
    assert forecast.forecast_ts == datetime(2026, 8, 2, 17, 20, tzinfo=TZ)


@pytest.mark.parametrize("horizon", [15, 30])
def test_mock_dung_cho_ca_hai_horizon(horizon: int) -> None:
    forecast = mock.predict(T, horizon)
    assert forecast.horizon_min == horizon
    assert forecast.forecast_ts == (T + pd.Timedelta(minutes=horizon)).to_pydatetime()


def test_mock_giu_confidence_null_va_model_version_khong_rong() -> None:
    """T1 AC #7 áp cho MỌI đường sinh forecast, kể cả mock."""
    forecast = mock.predict(T, 15)
    assert all(zone.confidence is None for zone in forecast.zones)
    assert forecast.model_version == mock.MODEL_VERSION == "mock_hist_avg_v0"


def test_ba_duong_sinh_forecast_co_ba_model_version_khac_nhau() -> None:
    versions = {mock.MODEL_VERSION, baseline_hist_avg.MODEL_VERSION, lgbm_quantile.MODEL_VERSION}
    assert len(versions) == 3


def test_mock_deterministic_khong_random_ke_ca_co_seed() -> None:
    """§3.2 #4: hai lần gọi phải cho đúng một message, nếu không thì mock không tái lập được."""
    assert mock.predict(T, 15) == mock.predict(T, 15)


def test_mock_co_ca_zone_thieu_lan_zone_thua() -> None:
    """Bảng phẳng "zone nào cũng như nhau" làm Optimizer của Khối B không có gì để điều."""
    gaps = [zone.predicted_demand - zone.predicted_supply for zone in mock.predict(T, 15).zones]
    assert max(gaps) > 0
    assert min(gaps) < 0


def test_mock_giu_dung_thu_tu_quantile() -> None:
    """Validator §4.2 ném ngay nếu p10 > p50 — nhưng vẫn kiểm để hỏng thì lỗi chỉ đúng một chỗ."""
    for zone in mock.predict(T, 15).zones:
        assert zone.demand_p10 <= zone.predicted_demand <= zone.demand_p90
        assert zone.supply_p10 <= zone.predicted_supply <= zone.supply_p90
        assert zone.demand_p10 >= 0.0
        assert zone.supply_p10 >= 0.0


@pytest.mark.parametrize(
    ("rain_mm_h", "peak_flag", "expected"),
    [(0.0, 0, "normal"), (0.0, 1, "peak"), (2.5, 0, "rain"), (2.5, 1, "rain_peak")],
)
def test_mock_gan_du_bon_nhan_regime(rain_mm_h: float, peak_flag: int, expected: str) -> None:
    assert mock.predict(T, 15, rain_mm_h=rain_mm_h, peak_flag=peak_flag).regime == expected


def test_mock_khong_mo_phong_tac_dong_cua_mua_len_cau() -> None:
    """`rain_mm_h` chỉ dùng để gắn nhãn regime — mọi KPI đo trên mock đều vô nghĩa và phải nhìn thấy điều đó."""
    khong_mua = mock.predict(T, 15, rain_mm_h=0.0, peak_flag=0)
    mua_to = mock.predict(T, 15, rain_mm_h=20.0, peak_flag=1)
    assert [zone.predicted_demand for zone in khong_mua.zones] == [zone.predicted_demand for zone in mua_to.zones]
