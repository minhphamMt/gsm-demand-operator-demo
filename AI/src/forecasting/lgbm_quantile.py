"""Model 1 — LightGBM quantile p10/p50/p90 cho cầu và cung — §5.2, task T1.

**Bao nhiêu model.** §5.2 chốt "2 model riêng cho horizon 15/30", còn T1 AC #2 chốt
"cả demand và supply, mỗi cái 3 objective quantile — 6 model". Hai câu này nhân với nhau:
**6 booster cho mỗi horizon, 12 booster tất cả**. Không thể gộp hai horizon vào một model
vì target khác nhau (`target_demand_15` ≠ `target_demand_30`), và không thể bỏ phía cung
vì §5.2 ghi rõ "model supply BẮT BUỘC dự báo song song với demand".

**Quantile crossing.** Ba objective train độc lập nên p10 > p50 xảy ra được trên một số
dòng — validator Pydantic của §4.2 sẽ ném ngay tại chỗ. Xử lý ở `predict()` bằng cách sắp
lại ba số của cùng một dòng (dùng chung hàm với baseline). Đây là phép chiếu tối thiểu:
bộ ba nào vốn đã đúng thứ tự thì không đổi. T1 AC #3 đòi 100% dòng đúng thứ tự, và "tin
vào lý thuyết" bị AC ghi rõ là không đủ.

**Tính tái lập.** `deterministic=True` + `force_row_wise=True` + seed cố định + số luồng
cố định. Bỏ `num_threads` cho LightGBM tự chọn theo số nhân CPU thì hai máy khác nhau ra
hai model khác nhau, và `model_version` mất ý nghĩa truy vết (§3.2 #4).

**Không side effect lúc import** (CLAUDE.md §5.3 #2): không nạp model ở top-level. Nơi
dùng gọi `load_models()` tường minh.
"""

import json
import logging
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import pandas as pd

from src.common.regime import Regime
from src.contracts.forecast import Forecast
from src.forecasting.baseline_hist_avg import (
    HORIZONS,
    QUANTILES,
    TARGETS,
    _enforce_quantile_order,
    build_forecast,
    city_regime,
    prediction_column,
    target_column,
)
from src.forecasting.features import (
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    KEY_COLUMNS,
    feature_matrix,
)

logger = logging.getLogger(__name__)

MODEL_VERSION = "lgbm_quantile_v1"

# Mã cảnh báo của API_CONTRACT §1.3 và ví dụ JSON §4.1. AGENT_WORKFLOW §5.9 hàng 3 viết
# tắt là `FORECAST_FALLBACK`; lấy bản của API_CONTRACT vì đó là chuỗi thật sự đi ra
# `warnings[]` trên dây, và nó xuất hiện ở cả bảng danh mục lẫn ví dụ response.
FORECAST_FALLBACK_WARNING = "FORECAST_FALLBACK_USED"

# Dùng lại seed train của generator (config/generator.yaml → seed.train) thay vì đặt thêm
# một số mới: CLAUDE.md §4 #6 cấm tự nghĩ hằng số khi spec không khai.
RANDOM_SEED = 42

# Cố định để hai máy cho cùng một model. 4 là số luồng có ở mọi máy dev của nhóm.
NUM_THREADS = 4

BASE_PARAMS: dict[str, object] = {
    "objective": "quantile",
    "num_leaves": 63,
    "learning_rate": 0.05,
    "min_data_in_leaf": 40,
    "feature_fraction": 0.9,
    "bagging_fraction": 0.9,
    "bagging_freq": 1,
    "verbose": -1,
    "deterministic": True,
    "force_row_wise": True,
    "seed": RANDOM_SEED,
    "bagging_seed": RANDOM_SEED,
    "feature_fraction_seed": RANDOM_SEED,
    "data_random_seed": RANDOM_SEED,
    "num_threads": NUM_THREADS,
}

# Chọn bằng thực nghiệm trên fold 3 của walk-forward (train ≤ 2026-09-17, validate
# 09-18..09-24) — KHÔNG tune trên test set đóng băng (I-08). So sánh trên demand h15:
#   300 vòng → MAPE 0.1589 · 600 → 0.1578 · 1500 (127 lá) → 0.1563 · 3000 (255 lá) → 0.1578
# Chênh lệch ≤ 0.003 trên dải 10× số vòng: sức chứa model KHÔNG phải chỗ nghẽn, nên lấy
# mức rẻ nhất còn thấy cải thiện thay vì đẩy số vòng lên cho có.
NUM_BOOST_ROUND = 600


@dataclass(frozen=True)
class ModelKey:
    """Định danh một booster: (target, horizon, quantile)."""

    target: str
    horizon: int
    quantile: int

    @property
    def name(self) -> str:
        return f"lgbm_{self.target}_h{self.horizon}_p{self.quantile}"


@dataclass(frozen=True)
class ForecastResult:
    """Message §4.2 kèm `warnings[]` của §1.3.

    `Forecast` không có chỗ cho cảnh báo — theo API_CONTRACT, `warnings[]` nằm ở tầng
    response chứ không nằm trong entity. Gói lại ở đây để tầng gọi không phải đoán xem
    kết quả đến từ model thật hay từ fallback (§5.9, AGENT_WORKFLOW §4 luật 4).
    """

    forecast: Forecast
    warnings: tuple[dict[str, str], ...] = ()

    @property
    def used_fallback(self) -> bool:
        return any(warning["code"] == FORECAST_FALLBACK_WARNING for warning in self.warnings)


def all_model_keys(
    targets: Sequence[str] = TARGETS,
    horizons: Sequence[int] = HORIZONS,
    quantiles: Sequence[int] = QUANTILES,
) -> tuple[ModelKey, ...]:
    """12 khóa mặc định. Thu hẹp `quantiles` khi chỉ cần p50 (backtest, ablation)."""
    return tuple(
        ModelKey(target=target, horizon=horizon, quantile=quantile)
        for target in targets
        for horizon in horizons
        for quantile in quantiles
    )


def train_models(
    train: pd.DataFrame,
    *,
    keys: Sequence[ModelKey] | None = None,
    feature_names: Sequence[str] = FEATURE_COLUMNS,
    num_boost_round: int = NUM_BOOST_ROUND,
    progress: bool = False,
) -> dict[ModelKey, lgb.Booster]:
    """Train một booster cho mỗi khóa. `train` là A2 ⋈ A3 đã join 1-1.

    `feature_names` thu hẹp được để chạy ablation (bỏ 3 feature tương tác) — đó là lý do
    duy nhất nó là tham số chứ không phải hằng.
    """
    keys = tuple(keys) if keys is not None else all_model_keys()
    features = train[list(feature_names)]
    categorical = [name for name in CATEGORICAL_FEATURES if name in feature_names]

    models: dict[ModelKey, lgb.Booster] = {}
    total = len(keys)
    for index, key in enumerate(keys, start=1):
        label = train[target_column(key.target, key.horizon)]
        params = {**BASE_PARAMS, "alpha": key.quantile / 100.0}
        dataset = lgb.Dataset(features, label=label, categorical_feature=categorical, free_raw_data=False)
        if progress:
            print(f"[{index:02d}/{total:02d}] Train {key.name} ({num_boost_round} trees)...", flush=True)
        models[key] = lgb.train(
            params,
            dataset,
            num_boost_round=num_boost_round,
            callbacks=_progress_callbacks(key.name, num_boost_round) if progress else None,
        )
        if progress:
            print(f"[{index:02d}/{total:02d}] Done  {key.name}", flush=True)
        logger.info("Đã train %s trên %d dòng", key.name, len(train))
    return models


def _progress_callbacks(model_name: str, num_boost_round: int) -> list:
    """In tiến độ train mà không thêm dependency như tqdm."""
    period = 50 if num_boost_round >= 100 else 1

    def _callback(env: lgb.callback.CallbackEnv) -> None:
        current = env.iteration + 1
        if current == 1 or current % period == 0 or current == num_boost_round:
            print(f"    {model_name}: {current:>4}/{num_boost_round} trees", flush=True)

    _callback.order = 10  # type: ignore[attr-defined]
    _callback.before_iteration = False  # type: ignore[attr-defined]
    return [_callback]


def predict(
    models: Mapping[ModelKey, lgb.Booster],
    frame: pd.DataFrame,
    *,
    feature_names: Sequence[str] = FEATURE_COLUMNS,
    enforce_order: bool = True,
) -> pd.DataFrame:
    """Dự báo cho mọi khóa có trong `models`; trả frame `pred_*` cùng index với `frame`.

    Thứ tự quantile được ép lại cho những (target, horizon) có đủ cả ba quantile. Bộ chỉ
    có p50 (backtest, ablation) đi qua nguyên vẹn — không có gì để sắp.

    `enforce_order=False` trả về output THÔ của LightGBM. Chỉ dùng để ĐO tỷ lệ crossing
    khi báo cáo T1 AC #3: nói "đã sắp lại nên 100% đúng thứ tự" mà không biết trước khi
    sắp có bao nhiêu dòng sai thì không phải là kiểm tra.
    """
    if tuple(feature_names) == FEATURE_COLUMNS:
        matrix = feature_matrix(frame)
    else:
        missing = [name for name in feature_names if name not in frame.columns]
        if missing:
            raise ValueError(f"Thiếu feature: {missing}")
        matrix = frame[list(feature_names)]

    result = frame[list(KEY_COLUMNS)].copy()
    for key, booster in models.items():
        result[prediction_column(key.target, key.horizon, key.quantile)] = booster.predict(matrix)
    return _enforce_quantile_order(result) if enforce_order else result


def count_quantile_crossings(predictions: pd.DataFrame) -> dict[str, int]:
    """Đếm dòng vi phạm `p10 ≤ p50 ≤ p90` theo từng (target, horizon) — T1 AC #3."""
    counts: dict[str, int] = {}
    for target in TARGETS:
        for horizon in HORIZONS:
            columns = [prediction_column(target, horizon, q) for q in QUANTILES]
            if not all(column in predictions.columns for column in columns):
                continue
            low, mid, high = (predictions[column].to_numpy(dtype="float64") for column in columns)
            counts[f"{target}_h{horizon}"] = int(((low > mid) | (mid > high)).sum())
    return counts


def save_models(models: Mapping[ModelKey, lgb.Booster], directory: Path) -> dict[str, str]:
    """Ghi mỗi booster ra một file `.txt` của LightGBM; trả bảng {tên khóa: đường dẫn}."""
    directory.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    for key, booster in models.items():
        path = directory / f"{key.name}.txt"
        booster.save_model(str(path))
        paths[key.name] = path.as_posix()
    return paths


def load_models(directory: Path, keys: Sequence[ModelKey] | None = None) -> dict[ModelKey, lgb.Booster]:
    """Nạp booster từ đĩa. Thiếu bất kỳ file nào → `FileNotFoundError`, KHÔNG nạp một phần.

    Nạp thiếu rồi chạy tiếp nghĩa là một horizon nào đó im lặng không có dự báo, và lỗi
    chỉ lộ ra ở tận Model 2 dưới dạng "zone không có hotspot".
    """
    keys = tuple(keys) if keys is not None else all_model_keys()
    models: dict[ModelKey, lgb.Booster] = {}
    for key in keys:
        path = directory / f"{key.name}.txt"
        if not path.exists():
            raise FileNotFoundError(f"Thiếu artifact model {path} — chạy `python train_forecast.py` trước")
        models[key] = lgb.Booster(model_file=str(path))
    return models


def forecast_at(
    models: Mapping[ModelKey, lgb.Booster],
    features: pd.DataFrame,
    *,
    t: pd.Timestamp,
    horizon_min: int,
    model_version: str = MODEL_VERSION,
) -> Forecast:
    """A2 tại `t` → message §4.2 bằng model thật."""
    rows = features[features["ts_bucket"] == t]
    if len(rows) == 0:
        raise ValueError(f"Không có dòng A2 nào tại t={t.isoformat()}")
    predictions = predict(models, rows)
    regime: Regime = city_regime(rows[f"rain_forecast_{horizon_min}"].tolist(), int(rows["peak_flag"].iloc[0]))
    return build_forecast(
        predictions,
        t=t,
        horizon_min=horizon_min,
        model_version=model_version,
        regime=regime,
    )


def predict_with_fallback(
    features: pd.DataFrame,
    *,
    t: pd.Timestamp,
    horizon_min: int,
    models: Mapping[ModelKey, lgb.Booster] | None = None,
    lookup: pd.DataFrame | None = None,
) -> ForecastResult:
    """Router R3 dạng hàm: Model 1 lỗi → `baseline_hist_avg`, T1 AC #8 và §5.9.

    Ba điều luật §5.9 và CLAUDE.md §9 đòi, làm đủ cả ba: (a) vẫn trả message §4.2 hợp lệ
    chứ không ném exception; (b) ghi log mức WARNING; (c) thêm mã vào `warnings[]` để
    History phân biệt được plan chạy bằng model thật với plan chạy bằng bảng tra —
    thiếu (c) thì hai loại plan bị đem so với nhau như nhau (AGENT_WORKFLOW §4 luật 4).

    Fallback KHÔNG gọi fallback (C-06, CLAUDE.md §10 #3): baseline lỗi thì ném ra ngoài.
    """
    from src.forecasting import baseline_hist_avg

    if models:
        try:
            return ForecastResult(forecast=forecast_at(models, features, t=t, horizon_min=horizon_min))
        except Exception as error:  # noqa: BLE001 — mọi lỗi model đều phải rơi về baseline (§5.9)
            logger.warning(
                "Model 1 lỗi tại t=%s horizon=%s (%s) — rơi về baseline_hist_avg",
                t.isoformat(),
                horizon_min,
                error,
            )
    else:
        logger.warning("Chưa nạp được artifact LightGBM — dùng baseline_hist_avg (router R4)")

    if lookup is None:
        raise ValueError("Không có cả model lẫn bảng tra baseline — không dựng được forecast")

    forecast = baseline_hist_avg.forecast_at(lookup, features, t=t, horizon_min=horizon_min)
    return ForecastResult(
        forecast=forecast,
        warnings=(
            {"code": FORECAST_FALLBACK_WARNING, "message": "Model 1 lỗi, đang dùng baseline historical average."},
        ),
    )


def write_manifest(path: Path, payload: Mapping[str, object]) -> None:
    """Ghi `models/model_manifest.json` — mọi run gắn `model_version` (§3.2 #4)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
