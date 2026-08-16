"""A1 → A2 (bảng feature) + A3 (bảng label) — task T1, §5.2.

Cột và ý nghĩa lấy nguyên văn từ docs/Data-Contract-Data-AI.md mục A2/A3; danh sách
feature bắt buộc lặp lại ở SPEC §5.2 và docs/feature_dictionary.md §1. Không thêm cột
nào ngoài ba tài liệu đó — `price_index`, feature zone lân cận, `avg_wait_time_sec`,
`avg_distance_km` đã bị loại có chủ đích (quyết định Data #2 và 2026-08-04).

Vì sao module này tồn tại dù Data-Contract nói "Data giao A2/A3 sẵn, AI không tự làm
feature engineering": trên đĩa `data/features/` và `data/labels/` đang RỖNG, trong khi
docs/design/ARCHITECTURE.md §7 đặt `forecasting/features.py` ("A1 → A2") vào phạm vi
code. Bảng cột dưới đây bám đúng contract của Data để hai bên không lệch nhau — đây là
cài đặt của contract đã chốt, không phải feature tự chế.

Hai quy ước dễ sai, ghi rõ để không phải đoán khi đọc lại:

1.  **Lag đánh số theo bước 5 phút, `lag_0` là chính giá trị tại `t0`.** `demand_observed_lag_6`
    là giá trị 30 phút trước. Lookback N = 6 bước đã chốt (quyết định Data #1).
2.  **Rolling 30 phút = 6 bước, tính TRÊN CỬA SỔ KẾT THÚC TẠI `t0`** (`lag_0..lag_5`).
    Không lấy 7 bước: 7 × 5 = 35 phút, không phải 30. `std` dùng ddof=0 (độ lệch của
    đúng 6 quan sát trong cửa sổ, không phải ước lượng của một tổng thể lớn hơn).

Chống leak — ràng buộc quan trọng nhất của file này (Data-Contract A2 mục 5 checklist):
mọi cột A2 chỉ được chứa thông tin có tại `t0` hoặc trước đó. `rain_forecast_15/30` là
NGOẠI LỆ HỢP LỆ và là ngoại lệ duy nhất: đó là bản tin nowcast phát tại `t0` (đã bị
làm nhiễu ở T0.4 theo DATA_CONTRACT §7), không phải giá trị mưa thật của tương lai.
"""

import pandas as pd

from src.common.regime import rain_threshold, tag_regime

# Bước thời gian của lưới replay (config/generator.yaml → time.step_minutes).
STEP_MINUTES = 5

# Lookback N = 6 bước = 30 phút (quyết định Data #1, Data-Contract A2).
LOOKBACK_STEPS = 6

# Cửa sổ rolling 30 phút = 6 bước.
ROLL_STEPS = 6

# Hai tầm dự báo của §4.2, tính theo số bước.
HORIZON_MINUTES: tuple[int, ...] = (5, 10, 15)

KEY_COLUMNS: tuple[str, ...] = ("zone_id", "ts_bucket")

# --- A2: đúng danh sách cột của Data-Contract mục A2, theo đúng thứ tự bảng đó ---
TIME_FEATURES: tuple[str, ...] = ("hour_of_day", "bucket_in_hour", "day_of_week", "peak_flag", "holiday_flag")
DEMAND_LAG_FEATURES: tuple[str, ...] = tuple(f"demand_observed_lag_{i}" for i in range(LOOKBACK_STEPS + 1))
SUPPLY_LAG_FEATURES: tuple[str, ...] = tuple(f"idle_supply_lag_{i}" for i in range(LOOKBACK_STEPS + 1))
ROLLING_FEATURES: tuple[str, ...] = (
    "demand_roll_mean_30",
    "demand_roll_std_30",
    "supply_roll_mean_30",
    "supply_roll_std_30",
)
RAIN_LAG_FEATURES: tuple[str, ...] = tuple(f"rain_lag_{i}" for i in range(1, LOOKBACK_STEPS + 1))
RAIN_FEATURES: tuple[str, ...] = ("rain_mm_h", *RAIN_LAG_FEATURES, "rain_forecast_15", "rain_forecast_30")

# Ba feature tương tác BẮT BUỘC (§5.2 in đậm) — signal chính của đề tài "mưa × giờ cao điểm".
INTERACTION_FEATURES: tuple[str, ...] = ("rain_x_peak", "rain_fc15_x_peak", "rain_fc30_x_peak")

FEATURE_COLUMNS: tuple[str, ...] = (
    "zone_id",
    *TIME_FEATURES,
    *DEMAND_LAG_FEATURES,
    *SUPPLY_LAG_FEATURES,
    *ROLLING_FEATURES,
    *RAIN_FEATURES,
    *INTERACTION_FEATURES,
)

# `zone_id` là categorical 1–30, không phải số đo (feature_dictionary §1).
CATEGORICAL_FEATURES: tuple[str, ...] = ("zone_id",)

# Cột của file A2 trên đĩa: khóa trước, rồi feature — `zone_id` nằm trong CẢ HAI nhóm nên
# phải khử trùng, một DataFrame có hai cột cùng tên sẽ làm merge A2 ↔ A3 ném lỗi.
OUTPUT_COLUMNS: tuple[str, ...] = (*KEY_COLUMNS, *(c for c in FEATURE_COLUMNS if c not in KEY_COLUMNS))

# --- A3: bảng label, join 1-1 với A2 theo (zone_id, ts_bucket) ---
TARGET_COLUMNS: tuple[str, ...] = tuple(
    f"target_{target}_{horizon}"
    for target in ("demand", "supply")
    for horizon in HORIZON_MINUTES
)
LABEL_REGIME_COLUMNS: tuple[str, ...] = tuple(f"regime_{horizon}" for horizon in HORIZON_MINUTES)

# Cột A1 mà A2/A3 cần đọc; thiếu một cột là dừng ngay chứ không sinh ra NaN im lặng.
REQUIRED_SNAPSHOT_COLUMNS: tuple[str, ...] = (
    "ts_bucket",
    "zone_id",
    "demand_observed",
    "idle_supply",
    "rain_mm_h",
    "rain_forecast_15",
    "rain_forecast_30",
    "peak_flag",
    "holiday_flag",
)


def _require_columns(snapshot: pd.DataFrame) -> None:
    missing = [name for name in REQUIRED_SNAPSHOT_COLUMNS if name not in snapshot.columns]
    if missing:
        raise ValueError(f"Snapshot A1 thiếu cột bắt buộc: {missing}")


def _sorted_snapshot(snapshot: pd.DataFrame) -> pd.DataFrame:
    """Sắp theo (zone_id, ts_bucket) — mọi phép lag/rolling bên dưới giả định thứ tự này.

    Sắp lại thay vì tin vào file: một lần đọc Parquet trả về thứ tự khác là đủ để mọi cột
    lag trỏ sai bước mà không có dấu hiệu nào lộ ra ở kiểu dữ liệu hay số dòng.
    """
    _require_columns(snapshot)
    return snapshot.sort_values(list(KEY_COLUMNS)).reset_index(drop=True)


def _assert_complete_grid(frame: pd.DataFrame) -> None:
    """Lưới thời gian phải liền mạch trong từng zone — lag chỉ đúng khi không thiếu bước.

    `shift(k)` của pandas dịch theo VỊ TRÍ DÒNG, không theo thời gian. Thiếu một bước
    5 phút thì `lag_6` lặng lẽ trỏ vào mốc 35 phút trước, sai lệch không thể phát hiện
    ở bất kỳ metric nào phía sau.
    """
    step = pd.Timedelta(minutes=STEP_MINUTES)
    gaps = frame.groupby("zone_id", sort=False)["ts_bucket"].diff().dropna()
    bad = gaps[gaps != step]
    if not bad.empty:
        raise ValueError(f"Lưới ts_bucket không liền mạch: {len(bad)} chỗ đứt (bước phải đúng {STEP_MINUTES} phút)")


def build_feature_table(snapshot: pd.DataFrame) -> pd.DataFrame:
    """A1 → A2. Trả bảng feature, chỉ giữ các `t0` có đủ 6 bước lịch sử phía trước.

    Không có cột NaN nào ở đầu ra: dòng thiếu lịch sử bị LOẠI chứ không điền 0
    (Data-Contract A2 grain, và checklist "không có ô null").
    """
    frame = _sorted_snapshot(snapshot)
    _assert_complete_grid(frame)

    by_zone = frame.groupby("zone_id", sort=False)
    out = frame[list(KEY_COLUMNS)].copy()

    # hour_of_day / day_of_week derive từ ts_bucket — KHÔNG dùng raw timestamp làm feature
    # (Data-Contract A2: raw timestamp cho model học "ngày 20/09" thay vì "thứ Ba 8 giờ").
    out["hour_of_day"] = frame["ts_bucket"].dt.hour.astype("int16")
    out["bucket_in_hour"] = (frame["ts_bucket"].dt.minute // STEP_MINUTES).astype("int16")
    out["day_of_week"] = frame["ts_bucket"].dt.dayofweek.astype("int16")
    out["peak_flag"] = frame["peak_flag"].astype("int16")
    out["holiday_flag"] = frame["holiday_flag"].astype("int16")

    for lag in range(LOOKBACK_STEPS + 1):
        out[f"demand_observed_lag_{lag}"] = by_zone["demand_observed"].shift(lag)
        out[f"idle_supply_lag_{lag}"] = by_zone["idle_supply"].shift(lag)
    for lag in range(1, LOOKBACK_STEPS + 1):
        out[f"rain_lag_{lag}"] = by_zone["rain_mm_h"].shift(lag)

    # Cửa sổ kết thúc tại t0, đúng 6 bước; min_periods = ROLL_STEPS để cửa sổ chưa đầy
    # thành NaN và bị loại cùng nhóm lag, thay vì trở thành trung bình của 2–3 điểm.
    for prefix, source in (("demand", "demand_observed"), ("supply", "idle_supply")):
        rolling = by_zone[source].rolling(window=ROLL_STEPS, min_periods=ROLL_STEPS)
        out[f"{prefix}_roll_mean_30"] = rolling.mean().reset_index(level=0, drop=True)
        out[f"{prefix}_roll_std_30"] = rolling.std(ddof=0).reset_index(level=0, drop=True)

    out["rain_mm_h"] = frame["rain_mm_h"]
    out["rain_forecast_15"] = frame["rain_forecast_15"]
    out["rain_forecast_30"] = frame["rain_forecast_30"]

    # Ba feature tương tác: tích thuần, không có so sánh ngưỡng nào ở đây — gắn nhãn
    # regime là việc của src/common/regime.py (CLAUDE.md §5.3).
    out["rain_x_peak"] = frame["rain_mm_h"] * frame["peak_flag"]
    out["rain_fc15_x_peak"] = frame["rain_forecast_15"] * frame["peak_flag"]
    out["rain_fc30_x_peak"] = frame["rain_forecast_30"] * frame["peak_flag"]

    # `zone_id` vừa là khóa vừa là feature (categorical) — chỉ giữ MỘT cột, nếu không
    # merge A2 ↔ A3 sẽ gãy vì nhãn cột trùng.
    out = out[list(OUTPUT_COLUMNS)].dropna().reset_index(drop=True)
    return _downcast_features(out)


def _downcast_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Ép kiểu ổn định để hai lần chạy trên hai máy cho cùng một file Parquet."""
    frame = frame.copy()
    frame["zone_id"] = frame["zone_id"].astype("int16")
    for name in (*DEMAND_LAG_FEATURES, *SUPPLY_LAG_FEATURES):
        frame[name] = frame[name].astype("int32")
    for name in (*ROLLING_FEATURES, *RAIN_FEATURES, *INTERACTION_FEATURES):
        frame[name] = frame[name].astype("float64")
    return frame


def build_label_table(snapshot: pd.DataFrame, rain_threshold_mm_h: float | None = None) -> pd.DataFrame:
    """A1 → A3. Bốn target + hai nhãn regime tại `t0+15` và `t0+30`.

    Nhãn regime lấy tại THỜI ĐIỂM TƯƠNG LAI, không phải tại `t0`: bảng metric §8 chia ô
    theo chế độ mà dự báo rơi vào, còn regime tại `t0` là thông tin của quá khứ.

    Dòng không đủ tương lai (cuối timeline) bị loại, không để null (Data-Contract A3).
    """
    frame = _sorted_snapshot(snapshot)
    _assert_complete_grid(frame)

    by_zone = frame.groupby("zone_id", sort=False)
    out = frame[list(KEY_COLUMNS)].copy()

    threshold = rain_threshold_mm_h if rain_threshold_mm_h is not None else rain_threshold()
    for horizon in HORIZON_MINUTES:
        steps = horizon // STEP_MINUTES
        out[f"target_demand_{horizon}"] = by_zone["demand_observed"].shift(-steps)
        out[f"target_supply_{horizon}"] = by_zone["idle_supply"].shift(-steps)
        future_rain = by_zone["rain_mm_h"].shift(-steps)
        future_peak = by_zone["peak_flag"].shift(-steps)
        out[f"regime_{horizon}"] = [
            None if pd.isna(rain) else tag_regime(float(rain), int(peak), threshold)
            for rain, peak in zip(future_rain, future_peak, strict=True)
        ]

    out = out[[*KEY_COLUMNS, *TARGET_COLUMNS, *LABEL_REGIME_COLUMNS]].dropna().reset_index(drop=True)
    for name in TARGET_COLUMNS:
        out[name] = out[name].astype("int32")
    out["zone_id"] = out["zone_id"].astype("int16")
    return out


def join_features_labels(features: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """Join 1-1 A2 ↔ A3 theo (zone_id, ts_bucket) — Data-Contract A3 grain.

    Dùng `inner`: giao của hai bảng là đúng tập dòng vừa đủ lịch sử VÀ vừa đủ tương lai.
    Kiểm bản số 1-1 tại chỗ vì một join nở dòng vẫn chạy được và chỉ lộ ra ở MAPE lệch.
    """
    merged = features.merge(labels, on=list(KEY_COLUMNS), how="inner", validate="one_to_one")
    return merged.sort_values(list(KEY_COLUMNS)).reset_index(drop=True)


def feature_matrix(frame: pd.DataFrame) -> pd.DataFrame:
    """Lấy đúng `FEATURE_COLUMNS` theo đúng thứ tự — thứ tự cột là một phần của artifact.

    LightGBM lưu model theo chỉ số cột. Đưa vào lúc predict một thứ tự khác lúc train thì
    model vẫn chạy và vẫn trả số, chỉ là số của một bài toán khác.
    """
    missing = [name for name in FEATURE_COLUMNS if name not in frame.columns]
    if missing:
        raise ValueError(f"Thiếu feature: {missing}")
    return frame[list(FEATURE_COLUMNS)]
