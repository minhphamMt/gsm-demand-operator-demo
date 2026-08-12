"""Test baseline historical average — task T1 AC #1, §5.14.2.

Baseline mang ba vai và test bám theo cả ba:

    #1 chuẩn so sánh KPI (§1.7)  ·  #2 mock của Model 1 (C-06)  ·  #3 fallback của R3 (§5.9)

Hai điều được kiểm kỹ nhất vì hỏng thì mọi con số phía sau vô nghĩa mà không có dấu hiệu:

*   **Chống leak.** `build_lookup` phải TỰ cắt theo cửa sổ train. Test truyền nguyên cả bộ
    dữ liệu (có cả ngày test) vào và đòi kết quả trùng khít với bảng dựng từ dữ liệu đã
    lọc sẵn — tức truyền nhầm cũng không leak được.
*   **Tách 4 regime.** `rain_peak` luôn là một dòng riêng, không được gộp vào số tổng
    (CLAUDE.md §3 #6).
"""

import math

import pandas as pd
import pytest

from src.common.regime import REGIMES
from src.contracts import ZONE_COUNT
from src.forecasting.baseline_hist_avg import (
    LOOKUP_LEVELS,
    MODEL_VERSION,
    QUANTILES,
    TARGETS,
    UNUSED_KEY,
    build_lookup,
    city_regime,
    fallback_rate,
    forecast_at,
    predict,
    prediction_column,
    score_forecast,
    step_offset,
    target_column,
)
from src.forecasting.features import HORIZON_MINUTES

from .conftest import START, TEST_DAY, TRAIN_END, TRAIN_START

TOL = 1e-9

# Ngày 6 là ngày chẵn (có mưa) và 18:00 nằm trong khung cao điểm → regime `rain_peak`.
RAIN_PEAK_T = START + pd.Timedelta(days=6, hours=18)


def _score_frame(frame: pd.DataFrame, lookup: pd.DataFrame) -> pd.DataFrame:
    """Ghép label + dự báo vào một frame để `score_forecast` chấm."""
    predictions = predict(lookup, frame)
    columns = [c for c in predictions.columns if c.startswith("pred_")]
    return frame.reset_index(drop=True).join(predictions[columns].reset_index(drop=True))


# --------------------------------------------------------------- dựng bảng tra


def test_bang_tra_co_du_ba_muc(lookup: pd.DataFrame) -> None:
    assert sorted(lookup["level"].unique()) == [1, 2, 3]


def test_o_khoa_khong_dung_o_muc_tho_duoc_dien_minus_1(lookup: pd.DataFrame) -> None:
    """-1 không đụng miền giá trị thật (hour 0–23, dow 0–6) nên Parquet giữ được kiểu int."""
    assert (lookup.loc[lookup["level"] == 2, "day_of_week"] == UNUSED_KEY).all()
    assert (lookup.loc[lookup["level"] == 3, ["hour_of_day", "day_of_week"]] == UNUSED_KEY).to_numpy().all()
    assert (lookup.loc[lookup["level"] == 1, "day_of_week"] != UNUSED_KEY).all()


def test_bang_tra_chi_dung_du_lieu_trong_cua_so_train(joined: pd.DataFrame, lookup: pd.DataFrame) -> None:
    """Truyền cả ngày test vào cũng phải ra đúng bảng dựng từ dữ liệu đã lọc sẵn."""
    filtered = joined[joined["ts_bucket"] < TEST_DAY]
    manual = build_lookup(filtered, train_start=TRAIN_START, train_end=TRAIN_END)
    pd.testing.assert_frame_equal(lookup, manual)


def test_train_end_bao_gom_ca_ngay_cuoi(joined: pd.DataFrame) -> None:
    """`splits.yaml` khai `train_end` là ngày CUỐI CÙNG thuộc train — cắt `<` sẽ mất trọn một ngày."""
    one_day = build_lookup(joined, train_start=START, train_end=START)
    expected = int((joined["ts_bucket"].dt.normalize() == START.normalize()).sum())
    assert int(one_day.loc[one_day["level"] == 3, "n_obs"].sum()) == expected


def test_cua_so_train_khong_co_dong_nao_thi_crash(joined: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="Không có dòng nào trong cửa sổ train"):
        build_lookup(joined, train_start=START - pd.Timedelta(days=10), train_end=START - pd.Timedelta(days=5))


def test_p50_la_trung_binh_nhom_va_p10_p90_la_phan_vi_thuc_nghiem(joined: pd.DataFrame, lookup: pd.DataFrame) -> None:
    """p50 = trung bình theo đúng định nghĩa §5.14.2, không phải median."""
    inside = joined[joined["ts_bucket"] < TEST_DAY]
    group = inside[(inside["zone_id"] == 7) & (inside["hour_of_day"] == 8) & (inside["day_of_week"] == 2)]
    assert len(group) > 0

    row = lookup[
        (lookup["level"] == 1) & (lookup["zone_id"] == 7) & (lookup["hour_of_day"] == 8) & (lookup["day_of_week"] == 2)
    ].iloc[0]
    column = target_column("demand", 15)
    assert row[f"{column}_p50"] == pytest.approx(group[column].mean(), abs=TOL)
    assert row[f"{column}_p10"] == pytest.approx(group[column].quantile(0.10), abs=TOL)
    assert row[f"{column}_p90"] == pytest.approx(group[column].quantile(0.90), abs=TOL)
    assert int(row["n_obs"]) == len(group)


# --------------------------------------------------------------- chuỗi tra 3 mức


def test_tra_trung_muc_1_khi_dow_da_co_trong_train(lookup: pd.DataFrame, test_frame: pd.DataFrame) -> None:
    predictions = predict(lookup, test_frame)
    assert (predictions["fallback_level"] == 1).all()
    assert fallback_rate(predictions)["fallback_any"] == 0.0


def test_roi_xuong_muc_2_khi_dow_chua_tung_thay(joined: pd.DataFrame) -> None:
    narrow = build_lookup(joined, train_start=START, train_end=START + pd.Timedelta(days=1))
    wednesday = joined[joined["ts_bucket"].dt.normalize() == (START + pd.Timedelta(days=2)).normalize()]
    predictions = predict(narrow, wednesday)
    assert (predictions["fallback_level"] == 2).all()
    assert fallback_rate(predictions)["level_2_zone_hour"] == 1.0


def test_roi_xuong_muc_3_khi_ca_gio_cung_chua_thay(joined: pd.DataFrame) -> None:
    """Mức 3 vẫn theo zone, không trộn 30 zone làm một — nền cầu/cung mỗi zone khác hẳn."""
    early = joined[joined["hour_of_day"] < 6]
    narrow = build_lookup(early, train_start=START, train_end=START)
    evening = joined[(joined["hour_of_day"] == 20) & (joined["ts_bucket"] < TEST_DAY)]
    predictions = predict(narrow, evening)
    assert (predictions["fallback_level"] == 3).all()
    assert fallback_rate(predictions)["fallback_any"] == 1.0


def test_ty_le_fallback_ba_muc_cong_lai_bang_1(lookup: pd.DataFrame, joined: pd.DataFrame) -> None:
    """§5.14.2 bước 3 buộc báo cáo tỷ lệ này — nó là thông tin về độ mỏng của bộ train."""
    rates = fallback_rate(predict(lookup, joined))
    total = rates["level_1_zone_hour_dow"] + rates["level_2_zone_hour"] + rates["level_3_zone"]
    assert total == pytest.approx(1.0, abs=TOL)


# --------------------------------------------------------------- thứ tự quantile (AC #3)


def test_moi_dong_du_bao_dung_thu_tu_quantile_va_khong_am(lookup: pd.DataFrame, test_frame: pd.DataFrame) -> None:
    predictions = predict(lookup, test_frame)
    for target in TARGETS:
        for horizon in HORIZON_MINUTES:
            low, mid, high = (predictions[prediction_column(target, horizon, q)] for q in QUANTILES)
            assert (low <= mid).all()
            assert (mid <= high).all()
            assert (low >= 0.0).all()


# --------------------------------------------------------------- message §4.2 (AC #1, #7)


def test_forecast_at_tra_message_4_2_hop_le(lookup: pd.DataFrame, features: pd.DataFrame) -> None:
    """Vai "mock của Model 1": Khối B phải nhận được một message §4.2 đúng contract."""
    forecast = forecast_at(lookup, features, t=RAIN_PEAK_T, horizon_min=15)
    assert forecast.model_version == MODEL_VERSION == "hist_avg_v1"
    assert len(forecast.zones) == ZONE_COUNT
    assert sorted(zone.zone_id for zone in forecast.zones) == list(range(1, ZONE_COUNT + 1))
    assert forecast.forecast_ts == (RAIN_PEAK_T + pd.Timedelta(minutes=15)).to_pydatetime()
    assert forecast.regime == "rain_peak"
    # Quyết định #5: `confidence` luôn null ở MVP.
    assert all(zone.confidence is None for zone in forecast.zones)


def test_forecast_at_cho_ca_hai_horizon(lookup: pd.DataFrame, features: pd.DataFrame) -> None:
    for horizon in HORIZON_MINUTES:
        forecast = forecast_at(lookup, features, t=RAIN_PEAK_T, horizon_min=horizon)
        assert forecast.horizon_min == horizon
        assert forecast.forecast_ts == (RAIN_PEAK_T + pd.Timedelta(minutes=horizon)).to_pydatetime()


def test_forecast_at_khong_co_dong_nao_tai_t_thi_bao_loi(lookup: pd.DataFrame, features: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="Không có dòng A2 nào"):
        forecast_at(lookup, features, t=START - pd.Timedelta(days=1), horizon_min=15)


def test_city_regime_lay_trung_binh_30_zone() -> None:
    """Contract §4.2 chỉ có MỘT trường `regime` cho cả 30 zone, trong khi mưa biến thiên theo zone (D4)."""
    # Trung bình đúng 0.5 mm/h — biên `>=` của ngưỡng mưa, phải tính là có mưa.
    assert city_regime([0.0] * (ZONE_COUNT - 1) + [15.0], peak_flag=1) == "rain_peak"
    assert city_regime([0.0] * ZONE_COUNT, peak_flag=1) == "peak"
    assert city_regime([0.0] * ZONE_COUNT, peak_flag=0) == "normal"


def test_city_regime_rong_thi_bao_loi() -> None:
    with pytest.raises(ValueError, match="rain_forecast rỗng"):
        city_regime([], peak_flag=0)


# --------------------------------------------------------------- chấm điểm 4 regime


def test_score_forecast_tach_du_bon_regime_va_rain_peak_dung_rieng(joined: pd.DataFrame, lookup: pd.DataFrame) -> None:
    scored = _score_frame(joined, lookup)
    cells = score_forecast(scored, target="demand", horizon=15)
    assert set(cells) == {"overall", *REGIMES}
    assert cells["overall"].n_rows == len(scored)
    assert sum(cells[name].n_rows for name in REGIMES) == len(scored)
    # Mọi ô đều có dòng: `rain_peak` rỗng thì test dưới xanh mà không kiểm được gì.
    for name in REGIMES:
        assert cells[name].n_rows > 0
    assert cells["rain_peak"].n_rows != cells["overall"].n_rows


def test_score_forecast_dung_cong_thuc_va_bo_qua_dong_actual_bang_0() -> None:
    """MAPE bỏ dòng actual = 0 (chia 0 không xác định) và PHẢI báo lại số dòng đã bỏ."""
    frame = pd.DataFrame(
        {
            target_column("demand", 15): [10.0, 0.0, 4.0],
            prediction_column("demand", 15, 50): [12.0, 3.0, 3.0],
            prediction_column("demand", 15, 10): [8.0, 0.0, 2.0],
            prediction_column("demand", 15, 90): [14.0, 5.0, 3.5],
            "regime_15": ["normal", "normal", "rain_peak"],
        }
    )
    cell = score_forecast(frame, target="demand", horizon=15)["overall"]
    assert cell.n_rows == 3
    assert cell.n_zero_actual == 1
    assert cell.mae == pytest.approx((2.0 + 3.0 + 1.0) / 3, abs=TOL)
    assert cell.mape == pytest.approx((2.0 / 10.0 + 1.0 / 4.0) / 2, abs=TOL)
    # Dòng 3: actual 4 nằm ngoài [2, 3.5] → 2/3 dòng được phủ.
    assert cell.coverage_p10_p90 == pytest.approx(2.0 / 3.0, abs=TOL)


def test_score_forecast_thieu_p10_p90_thi_coverage_la_nan() -> None:
    """Backtest và ablation chỉ train p50: không có khoảng thì không có gì để đo độ phủ."""
    frame = pd.DataFrame(
        {
            target_column("demand", 15): [10.0, 5.0],
            prediction_column("demand", 15, 50): [12.0, 4.0],
            "regime_15": ["normal", "rain_peak"],
        }
    )
    cell = score_forecast(frame, target="demand", horizon=15)["overall"]
    assert math.isnan(cell.coverage_p10_p90)
    assert cell.mae == pytest.approx(1.5, abs=TOL)


def test_score_forecast_o_rong_tra_nan_khong_crash() -> None:
    frame = pd.DataFrame(
        {
            target_column("demand", 15): [10.0],
            prediction_column("demand", 15, 50): [12.0],
            prediction_column("demand", 15, 10): [8.0],
            prediction_column("demand", 15, 90): [14.0],
            "regime_15": ["normal"],
        }
    )
    cell = score_forecast(frame, target="demand", horizon=15)["rain_peak"]
    assert cell.n_rows == 0
    assert math.isnan(cell.mae)
    assert math.isnan(cell.mape)


# --------------------------------------------------------------- tiện ích tên/bước


def test_ten_cot_theo_dung_quy_uoc_dung_chung() -> None:
    assert target_column("demand", 15) == "target_demand_15"
    assert prediction_column("supply", 30, 90) == "pred_supply_30_p90"


def test_step_offset_doi_horizon_sang_so_buoc() -> None:
    assert step_offset(15) == 3
    assert step_offset(30) == 6


def test_ba_muc_tra_dung_thu_tu_tho_dan() -> None:
    assert LOOKUP_LEVELS == (("zone_id", "hour_of_day", "day_of_week"), ("zone_id", "hour_of_day"), ("zone_id",))
