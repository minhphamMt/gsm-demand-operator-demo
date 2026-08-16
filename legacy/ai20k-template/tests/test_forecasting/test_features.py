"""Test A1 → A2/A3 — task T1, docs/Data-Contract-Data-AI.md mục A2/A3 + §5.2.

Bảng feature là nền của cả T1: sai một bước lag thì mọi con số MAPE ở AC #4/#5 đo trên
một bài toán khác mà không có dấu hiệu nào lộ ra. Nên bốn quy ước dễ sai được kiểm bằng
số học tay chứ không bằng "chạy thấy không lỗi":

    lag_0 = giá trị tại t0 · lag_6 = 30 phút trước · rolling = 6 bước KẾT THÚC tại t0
    (ddof=0) · target_* = giá trị tại t0+horizon · regime_* gắn tại t0+horizon

Ràng buộc quan trọng nhất — chống leak (Data-Contract A2 checklist mục 5) — có test riêng
`test_bang_a2_khong_leak_thong_tin_tuong_lai`.
"""

import numpy as np
import pandas as pd
import pytest
from src.common.regime import tag_regime
from src.forecasting.features import (
    DEMAND_LAG_FEATURES,
    FEATURE_COLUMNS,
    INTERACTION_FEATURES,
    KEY_COLUMNS,
    LOOKBACK_STEPS,
    OUTPUT_COLUMNS,
    ROLL_STEPS,
    STEP_MINUTES,
    SUPPLY_LAG_FEATURES,
    TARGET_COLUMNS,
    build_feature_table,
    build_label_table,
    feature_matrix,
    join_features_labels,
)

from .conftest import START

TOL = 1e-9

# Một dòng nằm sâu trong timeline: đủ 6 bước lịch sử phía trước và đủ 6 bước tương lai.
SAMPLE_ZONE = 7
SAMPLE_T = START + pd.Timedelta(days=3, hours=12)


def _row(frame: pd.DataFrame, zone_id: int, t: pd.Timestamp) -> pd.Series:
    match = frame[(frame["zone_id"] == zone_id) & (frame["ts_bucket"] == t)]
    assert len(match) == 1, f"phải có đúng 1 dòng cho zone {zone_id} tại {t.isoformat()}"
    return match.iloc[0]


# --------------------------------------------------------------- hình dạng bảng A2


def test_a2_dung_danh_sach_va_thu_tu_cot_cua_data_contract(features: pd.DataFrame) -> None:
    assert tuple(features.columns) == OUTPUT_COLUMNS


def test_a2_khong_co_cot_trung_ten(features: pd.DataFrame) -> None:
    """`zone_id` vừa là khóa vừa là feature categorical — chỉ được giữ MỘT cột.

    Hai cột cùng tên vẫn ghi ra Parquet được, chỉ gãy ở bước merge A2 ↔ A3.
    """
    assert len(set(features.columns)) == len(features.columns)


def test_a2_khong_con_o_null(features: pd.DataFrame) -> None:
    """Dòng thiếu lịch sử bị LOẠI, không điền 0 (Data-Contract A2 checklist)."""
    assert not features.isna().to_numpy().any()


def test_a2_bo_dung_so_dong_dau_moi_zone(features: pd.DataFrame, snapshot: pd.DataFrame) -> None:
    """Mỗi zone mất đúng `LOOKBACK_STEPS` dòng đầu — không hơn (mất dữ liệu), không kém (còn NaN)."""
    n_zones = snapshot["zone_id"].nunique()
    assert len(features) == len(snapshot) - n_zones * LOOKBACK_STEPS


# --------------------------------------------------------------- ngữ nghĩa lag/rolling


def test_lag_0_la_gia_tri_tai_t0_va_lag_6_la_30_phut_truoc(features: pd.DataFrame, snapshot: pd.DataFrame) -> None:
    row = _row(features, SAMPLE_ZONE, SAMPLE_T)
    source = snapshot.set_index(list(KEY_COLUMNS))
    for lag in range(LOOKBACK_STEPS + 1):
        at = SAMPLE_T - pd.Timedelta(minutes=lag * STEP_MINUTES)
        assert row[f"demand_observed_lag_{lag}"] == source.loc[(SAMPLE_ZONE, at), "demand_observed"]
        assert row[f"idle_supply_lag_{lag}"] == source.loc[(SAMPLE_ZONE, at), "idle_supply"]
    # lag_6 = 30 phút, không phải 6 phút — đơn vị của chỉ số lag là BƯỚC.
    assert SAMPLE_T - pd.Timedelta(minutes=LOOKBACK_STEPS * STEP_MINUTES) == SAMPLE_T - pd.Timedelta(minutes=30)


def test_rain_lag_bat_dau_tu_1_khong_co_lag_0(features: pd.DataFrame, snapshot: pd.DataFrame) -> None:
    """`rain_mm_h` tại t0 đã là một cột riêng; thêm `rain_lag_0` sẽ là cột lặp."""
    assert "rain_lag_0" not in features.columns
    row = _row(features, SAMPLE_ZONE, SAMPLE_T)
    source = snapshot.set_index(list(KEY_COLUMNS))
    assert row["rain_mm_h"] == pytest.approx(source.loc[(SAMPLE_ZONE, SAMPLE_T), "rain_mm_h"], abs=TOL)
    for lag in range(1, LOOKBACK_STEPS + 1):
        at = SAMPLE_T - pd.Timedelta(minutes=lag * STEP_MINUTES)
        assert row[f"rain_lag_{lag}"] == pytest.approx(source.loc[(SAMPLE_ZONE, at), "rain_mm_h"], abs=TOL)


def test_rolling_30_phut_la_6_buoc_ket_thuc_tai_t0_ddof_0(features: pd.DataFrame) -> None:
    """Cửa sổ là `lag_0..lag_5`, KHÔNG phải 7 bước (7 × 5 = 35 phút)."""
    row = _row(features, SAMPLE_ZONE, SAMPLE_T)
    for prefix, columns in (("demand", DEMAND_LAG_FEATURES), ("supply", SUPPLY_LAG_FEATURES)):
        window = np.array([row[name] for name in columns[:ROLL_STEPS]], dtype="float64")
        assert row[f"{prefix}_roll_mean_30"] == pytest.approx(window.mean(), abs=TOL)
        assert row[f"{prefix}_roll_std_30"] == pytest.approx(window.std(ddof=0), abs=TOL)
        # ddof=1 cho số khác hẳn — khẳng định test này phân biệt được hai lựa chọn.
        assert row[f"{prefix}_roll_std_30"] != pytest.approx(window.std(ddof=1), abs=1e-6)


def test_ba_feature_tuong_tac_la_tich_thuan(features: pd.DataFrame) -> None:
    """§5.2 in đậm ba feature này; chúng phải là tích, không được lén so ngưỡng ở đây."""
    assert INTERACTION_FEATURES == ("rain_x_peak", "rain_fc15_x_peak", "rain_fc30_x_peak")
    peak = features["peak_flag"].to_numpy(dtype="float64")
    for name, source in (
        ("rain_x_peak", "rain_mm_h"),
        ("rain_fc15_x_peak", "rain_forecast_15"),
        ("rain_fc30_x_peak", "rain_forecast_30"),
    ):
        expected = features[source].to_numpy(dtype="float64") * peak
        np.testing.assert_allclose(features[name].to_numpy(dtype="float64"), expected, atol=TOL)


def test_time_features_derive_tu_ts_bucket(features: pd.DataFrame) -> None:
    """Không dùng raw timestamp làm feature — model phải học "thứ Ba 8 giờ", không phải "ngày 20/09"."""
    assert (features["hour_of_day"] == features["ts_bucket"].dt.hour).all()
    assert (features["bucket_in_hour"] == features["ts_bucket"].dt.minute // STEP_MINUTES).all()
    assert features["bucket_in_hour"].between(0, 11).all()
    assert (features["day_of_week"] == features["ts_bucket"].dt.dayofweek).all()


# --------------------------------------------------------------- chống leak


def test_bang_a2_khong_leak_thong_tin_tuong_lai(snapshot: pd.DataFrame) -> None:
    """Đổi sạch quan sát ở nửa sau timeline; A2 của nửa trước phải KHÔNG đổi.

    Đây là cách duy nhất kiểm được ràng buộc "chỉ chứa thông tin ≤ t0" mà không phải đọc
    lại từng dòng code: một cột nào đó lỡ dùng `shift(-k)` sẽ lộ ra ngay.

    Phép nhiễu chỉ chạm `demand_observed`/`idle_supply`. `rain_forecast_15/30` là bản tin
    nowcast phát tại t0 — ngoại lệ hợp lệ và là ngoại lệ duy nhất, nên không kiểm ở đây.
    """
    cutoff = START + pd.Timedelta(days=4)
    tampered = snapshot.copy()
    future = tampered["ts_bucket"] >= cutoff
    tampered.loc[future, "demand_observed"] = 999
    tampered.loc[future, "idle_supply"] = 999

    before = build_feature_table(snapshot)
    after = build_feature_table(tampered)
    past = before[before["ts_bucket"] < cutoff].reset_index(drop=True)
    past_tampered = after[after["ts_bucket"] < cutoff].reset_index(drop=True)
    pd.testing.assert_frame_equal(past, past_tampered)


# --------------------------------------------------------------- bảng label A3


def test_target_tro_dung_ve_moc_tuong_lai(labels: pd.DataFrame, snapshot: pd.DataFrame) -> None:
    row = _row(labels, SAMPLE_ZONE, SAMPLE_T)
    source = snapshot.set_index(list(KEY_COLUMNS))
    for horizon in (15, 30):
        at = SAMPLE_T + pd.Timedelta(minutes=horizon)
        assert row[f"target_demand_{horizon}"] == source.loc[(SAMPLE_ZONE, at), "demand_observed"]
        assert row[f"target_supply_{horizon}"] == source.loc[(SAMPLE_ZONE, at), "idle_supply"]


def test_nhan_regime_gan_tai_thoi_diem_tuong_lai_khong_phai_tai_t0(
    labels: pd.DataFrame, snapshot: pd.DataFrame
) -> None:
    """Bảng metric §8 chia ô theo chế độ mà DỰ BÁO rơi vào; regime tại t0 là quá khứ."""
    source = snapshot.set_index(list(KEY_COLUMNS))
    for horizon in (15, 30):
        at = SAMPLE_T + pd.Timedelta(minutes=horizon)
        expected = tag_regime(
            float(source.loc[(SAMPLE_ZONE, at), "rain_mm_h"]),
            int(source.loc[(SAMPLE_ZONE, at), "peak_flag"]),
        )
        assert _row(labels, SAMPLE_ZONE, SAMPLE_T)[f"regime_{horizon}"] == expected


def test_regime_15_va_regime_30_khac_nhau_o_bien_chuyen_che_do(labels: pd.DataFrame) -> None:
    """Hai cột phải là hai nhãn độc lập; gộp làm một sẽ giấu mất biên vào/ra cao điểm."""
    assert (labels["regime_15"] != labels["regime_30"]).any()


def test_a3_khong_con_o_null_va_dung_kieu_int(labels: pd.DataFrame) -> None:
    assert not labels.isna().to_numpy().any()
    for name in TARGET_COLUMNS:
        assert labels[name].dtype == np.int32


# --------------------------------------------------------------- kiểm đầu vào


def test_thieu_cot_a1_thi_dung_ngay(snapshot: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="thiếu cột bắt buộc"):
        build_feature_table(snapshot.drop(columns=["rain_forecast_15"]))


def test_luoi_ts_bucket_dut_buoc_thi_dung_ngay(snapshot: pd.DataFrame) -> None:
    """`shift(k)` dịch theo VỊ TRÍ DÒNG: thiếu một bước thì lag_6 lặng lẽ trỏ vào 35 phút trước."""
    broken = snapshot.drop(index=snapshot.index[100]).reset_index(drop=True)
    with pytest.raises(ValueError, match="không liền mạch"):
        build_feature_table(broken)
    with pytest.raises(ValueError, match="không liền mạch"):
        build_label_table(broken)


def test_a2_khong_phu_thuoc_thu_tu_dong_cua_file_dau_vao(snapshot: pd.DataFrame) -> None:
    """Một lần đọc Parquet trả thứ tự khác không được làm mọi cột lag trỏ sai."""
    shuffled = snapshot.sample(frac=1.0, random_state=13).reset_index(drop=True)
    pd.testing.assert_frame_equal(build_feature_table(snapshot), build_feature_table(shuffled))


# --------------------------------------------------------------- join và ma trận feature


def test_join_a2_a3_la_mot_mot(features: pd.DataFrame, labels: pd.DataFrame) -> None:
    """Join nở dòng vẫn chạy được và chỉ lộ ra ở MAPE lệch — nên chặn ngay tại chỗ."""
    merged = join_features_labels(features, labels)
    assert len(merged) == len(merged.drop_duplicates(subset=list(KEY_COLUMNS)))
    assert len(merged) <= min(len(features), len(labels))
    assert merged["ts_bucket"].is_monotonic_increasing or merged["zone_id"].is_monotonic_increasing


def test_feature_matrix_giu_dung_thu_tu_cot(joined: pd.DataFrame) -> None:
    """LightGBM lưu model theo CHỈ SỐ cột: sai thứ tự thì model vẫn trả số, của bài toán khác."""
    assert tuple(feature_matrix(joined).columns) == FEATURE_COLUMNS


def test_feature_matrix_thieu_cot_thi_bao_loi(joined: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="Thiếu feature"):
        feature_matrix(joined.drop(columns=["rain_x_peak"]))
