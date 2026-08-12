"""Fixture dùng chung cho test T1 — snapshot A1 tổng hợp, dựng trong bộ nhớ.

**Không đọc `data/`.** Thư mục đó nằm trong .gitignore nên mọi test phụ thuộc file trên
đĩa sẽ đỏ trong CI — cùng lý do đã ghi ở đầu tests/test_generator.py. Số liệu AC #4/#5
(đo trên test set đóng băng) nằm ở eval/results/model1_forecast_report.json và được kiểm
riêng ở test_acceptance_report.py.

Snapshot cố ý dựng để chạm đủ các nhánh, không phải để giống dữ liệu thật:

*   **Đủ 4 regime.** Mưa rơi vào giờ 8 và 18 (cao điểm → `rain_peak`) lẫn giờ 13 (không
    cao điểm → `rain`), nên mọi ô của bảng metric §8 đều có dòng. Bộ dữ liệu thiếu
    `rain_peak` sẽ cho `score_forecast` trả NaN mà test vẫn xanh.
*   **Đủ 7 `day_of_week`.** Bảng tra baseline nhóm theo `zone × hour × dow`; dữ liệu chỉ
    vài dow thì mọi dòng rơi xuống mức tra thô hơn và nhánh mức 1 không bao giờ chạy.
*   **Ngày test trùng dow với ngày đầu** (8 ngày, bắt đầu thứ Hai) để tra trúng mức 1.

Seed lấy lại 42 (config/generator.yaml → `seed.train`) thay vì đặt số mới — CLAUDE.md §4 #6.
"""

from datetime import timedelta, timezone

import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest

from src.contracts import ZONE_COUNT
from src.forecasting.baseline_hist_avg import build_lookup
from src.forecasting.features import (
    STEP_MINUTES,
    build_feature_table,
    build_label_table,
    join_features_labels,
)
from src.forecasting.lgbm_quantile import ModelKey, train_models

TZ = timezone(timedelta(hours=7))

# 2026-09-07 là thứ Hai; 8 ngày liên tiếp phủ đủ 7 dow và ngày thứ 8 lặp lại thứ Hai.
START = pd.Timestamp("2026-09-07 00:00", tz=TZ)
N_DAYS = 8
STEPS_PER_DAY = 24 * 60 // STEP_MINUTES
N_STEPS = N_DAYS * STEPS_PER_DAY

TRAIN_START = START
TRAIN_END = START + pd.Timedelta(days=6)  # ngày cuối THUỘC train (biên đóng, xem build_lookup)
TEST_DAY = START + pd.Timedelta(days=7)

# Giờ có mưa và giờ cao điểm — giao nhau ở 8h/18h để sinh ra regime `rain_peak`.
RAIN_HOURS = (8, 13, 18)
PEAK_HOURS = (7, 8, 17, 18)
RAIN_MM_H = 2.4
HOLIDAY_DAY_INDEX = 3
SEED = 42

# Đường cong 24 giờ: nhân theo giờ, hai đỉnh sáng/chiều — đủ để model học được một
# tín hiệu thật, nếu không thì test "train xong dự báo có nghĩa" không kiểm được gì.
HOURLY_DEMAND = np.array(
    [0.35, 0.25, 0.20, 0.20, 0.30, 0.55, 0.90, 1.55, 1.75, 1.30, 1.05, 1.10]
    + [1.15, 1.10, 1.00, 1.05, 1.35, 1.80, 1.70, 1.30, 1.05, 0.85, 0.65, 0.45]
)
HOURLY_SUPPLY = np.array(
    [1.20, 1.10, 1.00, 0.90, 0.90, 1.00, 1.10, 0.90, 0.85, 1.00, 1.10, 1.15]
    + [1.10, 1.15, 1.20, 1.15, 0.95, 0.80, 0.85, 1.00, 1.10, 1.15, 1.20, 1.25]
)

# Train model trong test chỉ lấy 3 ngày cuối cửa sổ train và 10 vòng boosting: test này
# kiểm CƠ CHẾ (đủ booster, đúng thứ tự quantile, nạp lại khớp), không kiểm độ chính xác —
# số MAPE thật đo trên test set đóng băng bằng train_forecast.py.
MODEL_TRAIN_START = START + pd.Timedelta(days=4)
MODEL_BOOST_ROUND = 10


def _shift_future(values: np.ndarray, steps: int) -> np.ndarray:
    """Bản tin nowcast tại t0 = lượng mưa thật ở t0+steps; cuối timeline điền 0.

    Nowcast thật đã bị làm nhiễu ở T0.4 (DATA_CONTRACT §7); ở đây lấy bản hoàn hảo vì
    fixture chỉ cần một cột hợp lệ, không cần mô phỏng sai số dự báo mưa.
    """
    return np.concatenate([values[steps:], np.zeros(steps)])


def _build_snapshot() -> pd.DataFrame:
    ts = pd.date_range(START, periods=N_STEPS, freq=f"{STEP_MINUTES}min")
    hour = ts.hour.to_numpy()
    day_index = (ts.normalize() - START.normalize()).days.to_numpy()
    peak = np.isin(hour, PEAK_HOURS).astype("int16")
    holiday = (day_index == HOLIDAY_DAY_INDEX).astype("int16")
    rain_on = np.isin(hour, RAIN_HOURS) & (day_index % 2 == 0)

    rng = np.random.default_rng(SEED)
    frames = []
    for zone_id in range(1, ZONE_COUNT + 1):
        # Hệ số không gian 0.6–1.4: mưa khác nhau giữa các zone (D4) nhưng luôn ≥ ngưỡng
        # 0.5 mm/h khi có mưa, nên nhãn regime không phụ thuộc zone.
        spatial = 0.6 + 0.2 * (zone_id % 5)
        rain = np.where(rain_on, RAIN_MM_H * spatial, 0.0)
        wet = rain > 0

        demand = (8.0 + 2.0 * (zone_id % 7)) * HOURLY_DEMAND[hour] * (1.0 + 0.35 * wet)
        supply = (6.0 + 1.5 * (zone_id % 5)) * HOURLY_SUPPLY[hour] * (1.0 - 0.20 * wet)
        demand = np.maximum(np.rint(demand * (1.0 + 0.10 * rng.standard_normal(N_STEPS))), 1.0)
        supply = np.maximum(np.rint(supply * (1.0 + 0.10 * rng.standard_normal(N_STEPS))), 1.0)

        frames.append(
            pd.DataFrame(
                {
                    "ts_bucket": ts,
                    "zone_id": np.int16(zone_id),
                    "demand_observed": demand.astype("int32"),
                    "idle_supply": supply.astype("int32"),
                    "rain_mm_h": rain,
                    "rain_forecast_15": _shift_future(rain, 15 // STEP_MINUTES),
                    "rain_forecast_30": _shift_future(rain, 30 // STEP_MINUTES),
                    "peak_flag": peak,
                    "holiday_flag": holiday,
                }
            )
        )
    frame = pd.concat(frames, ignore_index=True)
    return frame.sort_values(["zone_id", "ts_bucket"]).reset_index(drop=True)


@pytest.fixture(scope="session")
def snapshot() -> pd.DataFrame:
    """A1 tổng hợp: 30 zone × 8 ngày × bước 5 phút."""
    return _build_snapshot()


@pytest.fixture(scope="session")
def features(snapshot: pd.DataFrame) -> pd.DataFrame:
    return build_feature_table(snapshot)


@pytest.fixture(scope="session")
def labels(snapshot: pd.DataFrame) -> pd.DataFrame:
    return build_label_table(snapshot)


@pytest.fixture(scope="session")
def joined(features: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    return join_features_labels(features, labels)


@pytest.fixture(scope="session")
def train_frame(joined: pd.DataFrame) -> pd.DataFrame:
    return joined[joined["ts_bucket"] < TEST_DAY].reset_index(drop=True)


@pytest.fixture(scope="session")
def test_frame(joined: pd.DataFrame) -> pd.DataFrame:
    return joined[joined["ts_bucket"] >= TEST_DAY].reset_index(drop=True)


@pytest.fixture(scope="session")
def lookup(joined: pd.DataFrame) -> pd.DataFrame:
    """Bảng tra baseline. Cố ý truyền CẢ bộ dữ liệu (kể cả ngày test) vào.

    `build_lookup` phải tự cắt theo cửa sổ train — nếu nó không cắt thì test chống leak
    ở test_baseline_hist_avg.py sẽ đỏ, chứ không phải fixture này che đi.
    """
    return build_lookup(joined, train_start=TRAIN_START, train_end=TRAIN_END)


@pytest.fixture(scope="session")
def model_train_frame(train_frame: pd.DataFrame) -> pd.DataFrame:
    return train_frame[train_frame["ts_bucket"] >= MODEL_TRAIN_START].reset_index(drop=True)


@pytest.fixture(scope="session")
def models(model_train_frame: pd.DataFrame) -> dict[ModelKey, lgb.Booster]:
    """12 booster train nhanh — chỉ để kiểm cơ chế, không phải để đo chất lượng."""
    return train_models(model_train_frame, num_boost_round=MODEL_BOOST_ROUND)
