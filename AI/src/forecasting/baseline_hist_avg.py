"""Baseline historical average — §5.14.2, task T1 AC #1.

Ba vai trong một module, đúng như §5.2 và §5.14.2 mô tả:

1.  **Chuẩn so sánh KPI.** LightGBM phải thắng bảng tra này ≥ 20% relative ở `rain_peak`
    (§1.7, EVALUATION_PLAN §8 AC #2). Bảng tra khóa trước khi biết kết quả model chính.
2.  **Mock của Model 1** (§5.14.2, C-06) — Khối B khởi động được trước khi có LightGBM.
3.  **Fallback khi Model 1 lỗi** (§5.9, router R3) — trả `hist_avg_v1` + cảnh báo.

Module này cũng giữ hai tiện ích DÙNG CHUNG cho cả Model 1 thật lẫn baseline, đặt ở đây
vì baseline chính là bản cài đặt tham chiếu của Model 1: `build_forecast()` (frame dự báo
→ contract §4.2) và `score_forecast()` (MAE/MAPE/độ phủ p10–p90). Để mỗi module tự viết
sẽ đúng cái bẫy mà §5.14.1 cấm ở phía metric KPI — hai bản cài đặt lệch nhau thì con số
"thắng baseline 20%" không còn nghĩa gì.

Quy tắc chống leak (§5.14.2 bước 1) được ép ở TRONG CODE, không phải bằng lời dặn:
`build_lookup()` bắt buộc nhận cửa sổ train và tự loại mọi dòng ngoài cửa sổ đó. Truyền
nhầm cả bộ dữ liệu vào cũng không leak được.

Module KHÔNG đọc `data/splits.yaml`: chỉ `src/common/policy.py` được đọc YAML
(CLAUDE.md §3 #2, có test tĩnh chặn). Cửa sổ train do script gọi truyền vào.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta

import numpy as np
import pandas as pd

from src.common.regime import REGIMES, Regime, tag_regime
from src.contracts.forecast import Forecast, ZoneForecast
from src.forecasting.features import KEY_COLUMNS, STEP_MINUTES

# §4.1 API_CONTRACT chốt đúng chuỗi này cho nhánh fallback — đổi là đổi contract.
MODEL_VERSION = "hist_avg_v1"

TARGETS: tuple[str, ...] = ("demand", "supply")
HORIZONS: tuple[int, ...] = (5, 15, 30)
QUANTILES: tuple[int, ...] = (10, 50, 90)

# Ba mức tra, dùng theo thứ tự; mức sau chỉ chạy cho dòng mà mức trước không có số
# (§5.14.2 bước 3). Mức 3 là "trung bình toàn bộ lịch sử của chính zone đó" — vẫn theo
# zone chứ không trộn 30 zone làm một, vì mức nền cầu/cung của mỗi zone khác nhau hẳn.
LOOKUP_LEVELS: tuple[tuple[str, ...], ...] = (
    ("zone_id", "hour_of_day", "day_of_week"),
    ("zone_id", "hour_of_day"),
    ("zone_id",),
)

# Ô khóa không dùng ở mức tra thô hơn được điền -1: Parquet giữ được kiểu số nguyên,
# và -1 không đụng miền giá trị thật (hour 0–23, dow 0–6).
UNUSED_KEY = -1


def target_column(target: str, horizon: int) -> str:
    """Tên cột label A3 — `target_demand_15`, `target_supply_30`, ..."""
    return f"target_{target}_{horizon}"


def prediction_column(target: str, horizon: int, quantile: int) -> str:
    """Tên cột dự báo — `pred_demand_15_p50`. Dùng chung cho baseline và LightGBM."""
    return f"pred_{target}_{horizon}_p{quantile}"


@dataclass(frozen=True)
class ScoreCell:
    """Một ô của ma trận đánh giá §8: một (regime × horizon × target)."""

    n_rows: int
    mae: float
    mape: float
    coverage_p10_p90: float
    n_zero_actual: int


def build_lookup(
    frame: pd.DataFrame,
    *,
    train_start: pd.Timestamp,
    train_end: pd.Timestamp,
) -> pd.DataFrame:
    """Bảng tra `zone × hour × dow` (+ hai mức thô hơn) — CHỈ từ dòng nằm trong cửa sổ train.

    `train_end` tính theo NGÀY và bao gồm cả ngày đó: `data/splits.yaml` khai `train_end`
    là ngày cuối cùng thuộc train, nên cắt bằng `< train_end` sẽ vứt mất trọn một ngày.

    Ngoài trung bình (là dự báo điểm p50 theo đúng định nghĩa §5.14.2), bảng còn giữ
    phân vị 10/90 thực nghiệm của chính nhóm đó. Không phải để làm đẹp: contract §4.2
    cấm `demand_p10/p90` và `supply_p10/p90` null, mà baseline phải dùng được làm mock
    và làm fallback — tức phải trả về một message §4.2 hợp lệ.
    """
    inside = _within_train_window(frame, train_start=train_start, train_end=train_end)
    if inside.empty:
        raise ValueError(f"Không có dòng nào trong cửa sổ train {train_start.date()}..{train_end.date()}")

    value_columns = [target_column(target, horizon) for target in TARGETS for horizon in HORIZONS]
    tables = []
    for level, keys in enumerate(LOOKUP_LEVELS, start=1):
        grouped = inside.groupby(list(keys), sort=True)
        table = pd.DataFrame(index=grouped.size().index)
        table["n_obs"] = grouped.size()
        for column in value_columns:
            table[f"{column}_p50"] = grouped[column].mean()
            table[f"{column}_p10"] = grouped[column].quantile(0.10)
            table[f"{column}_p90"] = grouped[column].quantile(0.90)
        table = table.reset_index()
        table["level"] = level
        for key in LOOKUP_LEVELS[0]:
            if key not in keys:
                table[key] = UNUSED_KEY
        tables.append(table)

    columns = ["level", *LOOKUP_LEVELS[0], "n_obs", *(f"{c}_p{q}" for c in value_columns for q in QUANTILES)]
    lookup = pd.concat(tables, ignore_index=True)[columns]
    return lookup.sort_values(["level", *LOOKUP_LEVELS[0]]).reset_index(drop=True)


def _within_train_window(frame: pd.DataFrame, *, train_start: pd.Timestamp, train_end: pd.Timestamp) -> pd.DataFrame:
    """Giữ đúng các dòng có `ts_bucket` trong [train_start, train_end] tính theo ngày."""
    day = frame["ts_bucket"].dt.normalize().dt.tz_localize(None)
    return frame[(day >= _as_naive_day(train_start)) & (day <= _as_naive_day(train_end))]


def _as_naive_day(value: pd.Timestamp) -> pd.Timestamp:
    """Về mốc NGÀY không offset, để so được với cột `ts_bucket` đã bỏ offset.

    Nhận cả mốc naive (`data/splits.yaml` khai ngày trần, `pd.Timestamp("2026-09-17")`)
    lẫn mốc có offset +07:00 của pipeline. So một cột naive với một Timestamp có offset
    thì pandas ném `TypeError: Invalid comparison`, và thông báo đó không nói được gì về
    việc cửa sổ train đang bị truyền sai kiểu.
    """
    stamp = pd.Timestamp(value)
    if stamp.tzinfo is not None:
        stamp = stamp.tz_localize(None)
    return stamp.normalize()


def predict(lookup: pd.DataFrame, frame: pd.DataFrame) -> pd.DataFrame:
    """Tra bảng cho từng dòng của `frame`; trả 12 cột `pred_*` + `fallback_level`.

    `fallback_level` = 1 khi tra trúng `zone × hour × dow`, 2 và 3 là hai mức thô hơn.
    §5.14.2 bước 3 buộc **báo cáo tỷ lệ % phải fallback** — tỷ lệ cao nghĩa là bộ train
    quá mỏng, và đó là thông tin về chất lượng dữ liệu chứ không phải chi tiết cài đặt.
    """
    result = frame[list(KEY_COLUMNS)].copy()
    pending = pd.Series(True, index=frame.index)
    result["fallback_level"] = 0
    for column in _prediction_columns():
        result[column] = float("nan")

    for level, keys in enumerate(LOOKUP_LEVELS, start=1):
        if not pending.any():
            break
        table = lookup[lookup["level"] == level].drop(columns=["level", "n_obs"])
        table = table[[*keys, *(c for c in table.columns if c.startswith("target_"))]]
        merged = frame.loc[pending, list(keys)].merge(table, on=list(keys), how="left")
        merged.index = frame.index[pending]

        hit = merged[f"{target_column('demand', 15)}_p50"].notna()
        for target in TARGETS:
            for horizon in HORIZONS:
                for quantile in QUANTILES:
                    source = f"{target_column(target, horizon)}_p{quantile}"
                    destination = prediction_column(target, horizon, quantile)
                    result.loc[hit[hit].index, destination] = merged.loc[hit, source]
        result.loc[hit[hit].index, "fallback_level"] = level
        pending = pending & ~hit.reindex(frame.index, fill_value=False)

    if pending.any():
        raise ValueError(f"{int(pending.sum())} dòng không tra được ở cả 3 mức — bảng tra hỏng")

    return _enforce_quantile_order(result)


def _prediction_columns() -> list[str]:
    return [
        prediction_column(target, horizon, quantile)
        for target in TARGETS
        for horizon in HORIZONS
        for quantile in QUANTILES
    ]


def _enforce_quantile_order(frame: pd.DataFrame) -> pd.DataFrame:
    """Ép `p10 ≤ p50 ≤ p90` và chặn giá trị âm — T1 AC #3, contract §4.2.

    Phân vị thực nghiệm của một nhóm thì không tự cắt nhau, nhưng LightGBM train ba
    objective ĐỘC LẬP thì có (DATA_CONTRACT §2.2). Sắp lại bằng cách sort ba số của cùng
    một dòng: đây là phép chiếu tối thiểu, không đổi bộ ba nào vốn đã đúng thứ tự.

    Cầu và cung là số xe/số chuyến nên âm là vô nghĩa; contract khai `NonNegativeFloat`.

    Nhóm (target, horizon) không có đủ cả ba quantile thì bỏ qua — backtest và ablation
    chỉ train p50, ở đó không có gì để sắp.
    """
    frame = frame.copy()
    for target in TARGETS:
        for horizon in HORIZONS:
            columns = [prediction_column(target, horizon, q) for q in QUANTILES]
            if not all(column in frame.columns for column in columns):
                continue
            # copy=True bắt buộc: pandas trả view chỉ-đọc khi ba cột cùng nằm một block,
            # và `sort` tại chỗ sẽ ném ngay.
            values = frame[columns].to_numpy(dtype="float64", copy=True)
            values.sort(axis=1)
            frame[columns] = values.clip(min=0.0)
    return frame


def build_forecast(
    predictions: pd.DataFrame,
    *,
    t: pd.Timestamp,
    horizon_min: int,
    model_version: str,
    regime: Regime,
) -> Forecast:
    """Frame dự báo (30 dòng của cùng một `t`) → message §4.2.

    Hàm dùng chung cho baseline lẫn LightGBM: contract chỉ có một, nên phép lắp ráp cũng
    chỉ nên có một. `confidence` để `null` theo quyết định đã chốt #5.
    """
    rows = predictions[predictions["ts_bucket"] == t].sort_values("zone_id")
    zones = tuple(
        ZoneForecast(
            zone_id=int(row.zone_id),
            predicted_demand=float(getattr(row, prediction_column("demand", horizon_min, 50))),
            predicted_supply=float(getattr(row, prediction_column("supply", horizon_min, 50))),
            demand_p10=float(getattr(row, prediction_column("demand", horizon_min, 10))),
            demand_p90=float(getattr(row, prediction_column("demand", horizon_min, 90))),
            supply_p10=float(getattr(row, prediction_column("supply", horizon_min, 10))),
            supply_p90=float(getattr(row, prediction_column("supply", horizon_min, 90))),
            confidence=None,
        )
        for row in rows.itertuples(index=False)
    )
    return Forecast(
        t=t.to_pydatetime(),
        horizon_min=horizon_min,
        forecast_ts=(t + timedelta(minutes=horizon_min)).to_pydatetime(),
        zones=zones,
        model_version=model_version,
        regime=regime,
    )


def city_regime(rain_forecast: Sequence[float], peak_flag: int) -> Regime:
    """Nhãn regime cấp thành phố cho một message §4.2.

    Contract §4.2 có MỘT trường `regime` cho cả 30 zone, trong khi mưa biến thiên theo
    zone (D4). Lấy trung bình 30 zone là cách khớp lại đúng chuỗi mưa toàn thành phố:
    generator chuẩn hóa hệ số không gian sao cho trung bình trên 30 zone bằng 1
    (config/generator.yaml → rain.spatial), nên trung bình nowcast ≈ giá trị thành phố.

    Nhãn gán qua `src/common/regime.py`, không tự so ngưỡng ở đây (CLAUDE.md §3 #6).
    """
    values = list(rain_forecast)
    if not values:
        raise ValueError("rain_forecast rỗng — không suy được regime của message")
    return tag_regime(sum(values) / len(values), peak_flag)


def score_forecast(
    frame: pd.DataFrame,
    *,
    target: str,
    horizon: int,
    regime_column: str | None = None,
) -> dict[str, ScoreCell]:
    """MAE / MAPE / độ phủ p10–p90 cho một (target, horizon), tách theo 4 regime.

    Trả về dict có khóa `"overall"` và bốn khóa regime — `rain_peak` LUÔN là một dòng
    riêng, không được gộp vào số tổng (CLAUDE.md §3 #6, EVALUATION_PLAN §8 AC #3).

    MAPE bỏ qua dòng có giá trị thực bằng 0 (chia 0 không xác định) và **báo lại số dòng
    đã bỏ** ở `n_zero_actual`: giấu con số này là giấu việc mẫu số đã bị đổi.

    Thiếu cột p10/p90 (backtest và ablation chỉ train p50) thì `coverage_p10_p90` = NaN —
    không có khoảng thì không có gì để đo độ phủ, và NaN nói đúng điều đó.
    """
    regime_column = regime_column or f"regime_{horizon}"
    actual = frame[target_column(target, horizon)].to_numpy(dtype="float64")
    p50 = frame[prediction_column(target, horizon, 50)].to_numpy(dtype="float64")

    bound_columns = [prediction_column(target, horizon, q) for q in (10, 90)]
    has_bounds = all(column in frame.columns for column in bound_columns)
    p10 = frame[bound_columns[0]].to_numpy(dtype="float64") if has_bounds else None
    p90 = frame[bound_columns[1]].to_numpy(dtype="float64") if has_bounds else None
    regimes = frame[regime_column].to_numpy()

    cells = {"overall": _score_cell(actual, p50, p10, p90)}
    for name in REGIMES:
        mask = regimes == name
        cells[name] = _score_cell(
            actual[mask],
            p50[mask],
            None if p10 is None else p10[mask],
            None if p90 is None else p90[mask],
        )
    return cells


def _score_cell(
    actual: np.ndarray,
    predicted: np.ndarray,
    p10: np.ndarray | None,
    p90: np.ndarray | None,
) -> ScoreCell:
    if len(actual) == 0:
        return ScoreCell(n_rows=0, mae=math.nan, mape=math.nan, coverage_p10_p90=math.nan, n_zero_actual=0)

    absolute_error = abs(actual - predicted)
    nonzero = actual != 0
    mape = float((absolute_error[nonzero] / actual[nonzero]).mean()) if nonzero.any() else math.nan
    coverage = math.nan
    if p10 is not None and p90 is not None:
        coverage = float(((actual >= p10) & (actual <= p90)).mean())
    return ScoreCell(
        n_rows=int(len(actual)),
        mae=float(absolute_error.mean()),
        mape=mape,
        coverage_p10_p90=coverage,
        n_zero_actual=int((~nonzero).sum()),
    )


def fallback_rate(predictions: pd.DataFrame) -> dict[str, float]:
    """Tỷ lệ dòng phải dùng mức tra thô hơn — §5.14.2 bước 3 buộc báo cáo."""
    levels = predictions["fallback_level"]
    total = len(levels)
    return {
        "level_1_zone_hour_dow": float((levels == 1).sum()) / total,
        "level_2_zone_hour": float((levels == 2).sum()) / total,
        "level_3_zone": float((levels == 3).sum()) / total,
        "fallback_any": float((levels > 1).sum()) / total,
    }


def forecast_at(
    lookup: pd.DataFrame,
    features: pd.DataFrame,
    *,
    t: pd.Timestamp,
    horizon_min: int,
) -> Forecast:
    """Đường ngắn nhất: bảng tra + A2 → một message §4.2 tại `t`.

    Đây là hàm mà router R3 gọi khi Model 1 lỗi và R4 gọi khi chưa có artifact LightGBM.
    """
    rows = features[features["ts_bucket"] == t]
    if len(rows) == 0:
        raise ValueError(f"Không có dòng A2 nào tại t={t.isoformat()}")
    predictions = predict(lookup, rows)
    regime = city_regime(rows[f"rain_forecast_{horizon_min}"].tolist(), int(rows["peak_flag"].iloc[0]))
    return build_forecast(
        predictions,
        t=t,
        horizon_min=horizon_min,
        model_version=MODEL_VERSION,
        regime=regime,
    )


def step_offset(horizon_min: int) -> int:
    """Số bước replay tương ứng một horizon — dùng chung để không rải `// 5` khắp nơi."""
    return horizon_min // STEP_MINUTES
