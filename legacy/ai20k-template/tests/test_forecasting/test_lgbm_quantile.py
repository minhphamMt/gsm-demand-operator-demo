"""Test Model 1 — LightGBM quantile — task T1, §5.2.

Acceptance Criteria được kiểm ở đây (docs/design/IMPLEMENTATION_PLAN.md §3 T1):

    #2 train cả demand lẫn supply, mỗi cái 3 objective quantile → 6 model mỗi horizon
    #3 `p10 ≤ p50 ≤ p90` cho 100% dòng — và AC ghi rõ "kiểm sau khi train", không tin lý thuyết
    #7 output đúng §4.2, `confidence = null`, `model_version` không rỗng
    #8 model lỗi → rơi về `baseline_hist_avg` + thêm mã vào `warnings[]`

AC #4/#5/#6 là số đo trên TEST SET ĐÓNG BĂNG, không đo được bằng unit test trên fixture
tổng hợp — chúng nằm ở eval/results/model1_forecast_report.json, kiểm ở
test_acceptance_report.py. Booster ở đây chỉ train 10 vòng trên 3 ngày: đủ để kiểm cơ chế,
cố ý KHÔNG đủ để kết luận gì về độ chính xác.
"""

import json
import logging
from pathlib import Path

import lightgbm as lgb
import pandas as pd
import pytest

from src.contracts import ZONE_COUNT
from src.forecasting.baseline_hist_avg import QUANTILES, TARGETS, prediction_column
from src.forecasting.features import FEATURE_COLUMNS, HORIZON_MINUTES, INTERACTION_FEATURES
from src.forecasting.lgbm_quantile import (
    BASE_PARAMS,
    FORECAST_FALLBACK_WARNING,
    MODEL_VERSION,
    RANDOM_SEED,
    ForecastResult,
    ModelKey,
    all_model_keys,
    count_quantile_crossings,
    forecast_at,
    load_models,
    predict,
    predict_with_fallback,
    save_models,
    train_models,
    write_manifest,
)

from .conftest import MODEL_BOOST_ROUND, START, TEST_DAY

RAIN_PEAK_T = START + pd.Timedelta(days=6, hours=18)
FORECAST_T = TEST_DAY + pd.Timedelta(hours=18)


class _BrokenBooster:
    """Booster hỏng lúc suy luận — mô phỏng F-line §5.9 "Model 1 lỗi" mà không phải xoá file."""

    def predict(self, *args: object, **kwargs: object) -> object:
        raise RuntimeError("booster hỏng giữa chừng")


# --------------------------------------------------------------- AC #2: đủ số booster


def test_du_12_booster_va_6_cho_moi_horizon() -> None:
    """§5.2 "2 model riêng cho horizon 15/30" × AC #2 "6 model" = 12 booster."""
    keys = all_model_keys()
    assert len(keys) == 12
    for horizon in HORIZON_MINUTES:
        assert len([key for key in keys if key.horizon == horizon]) == 6
    assert {key.target for key in keys} == set(TARGETS)
    assert {key.quantile for key in keys} == set(QUANTILES)
    assert len({key.name for key in keys}) == 12


def test_thu_hep_quantile_cho_backtest_chi_p50() -> None:
    """Backtest và ablation chỉ cần dự báo điểm — không train thừa 2/3 số booster."""
    keys = all_model_keys(quantiles=(50,))
    assert len(keys) == 4
    assert {key.quantile for key in keys} == {50}


def test_train_models_tra_dung_mot_booster_moi_khoa(models: dict[ModelKey, lgb.Booster]) -> None:
    assert set(models) == set(all_model_keys())
    for key, booster in models.items():
        assert isinstance(booster, lgb.Booster)
        assert booster.num_trees() == MODEL_BOOST_ROUND
        assert booster.feature_name() == list(FEATURE_COLUMNS)
        assert key.name.startswith("lgbm_")


def test_moi_booster_train_dung_alpha_cua_quantile(model_train_frame: pd.DataFrame) -> None:
    """alpha = quantile/100: nhầm chỗ này thì p10 và p90 đổi vai mà không có lỗi nào."""
    key = ModelKey(target="demand", horizon=15, quantile=10)
    booster = train_models(model_train_frame, keys=[key], num_boost_round=3)[key]
    assert booster.params["objective"] == "quantile"
    assert booster.params["alpha"] == pytest.approx(0.10)


# --------------------------------------------------------------- AC #3: thứ tự quantile


def test_moi_dong_du_bao_dung_thu_tu_quantile_sau_khi_ep(
    models: dict[ModelKey, lgb.Booster], test_frame: pd.DataFrame
) -> None:
    """AC #3 đòi 100% dòng, và đòi KIỂM sau khi train chứ không tin vào lý thuyết."""
    predictions = predict(models, test_frame)
    assert count_quantile_crossings(predictions) == {f"{t}_h{h}": 0 for t in TARGETS for h in HORIZON_MINUTES}
    for target in TARGETS:
        for horizon in HORIZON_MINUTES:
            low, mid, high = (predictions[prediction_column(target, horizon, q)] for q in QUANTILES)
            assert (low <= mid).all()
            assert (mid <= high).all()
            assert (low >= 0.0).all()


def test_count_quantile_crossings_bat_duoc_vi_pham_that() -> None:
    """Bộ đếm phải thật sự đếm — nếu nó luôn trả 0 thì test trên xanh mà không kiểm gì."""
    frame = pd.DataFrame(
        {
            prediction_column("demand", 15, 10): [5.0, 1.0, 2.0],
            prediction_column("demand", 15, 50): [3.0, 2.0, 2.0],  # dòng 0: p10 > p50
            prediction_column("demand", 15, 90): [9.0, 1.5, 2.0],  # dòng 1: p50 > p90
        }
    )
    assert count_quantile_crossings(frame) == {"demand_h15": 2}


def test_bo_du_bao_chi_co_p50_di_qua_nguyen_ven(model_train_frame: pd.DataFrame, test_frame: pd.DataFrame) -> None:
    """Nhóm thiếu quantile không có gì để sắp — và không được ném KeyError."""
    keys = all_model_keys(quantiles=(50,))
    models = train_models(model_train_frame, keys=keys, num_boost_round=3)
    predictions = predict(models, test_frame)
    assert count_quantile_crossings(predictions) == {}
    assert prediction_column("demand", 15, 50) in predictions.columns
    assert prediction_column("demand", 15, 10) not in predictions.columns


def test_enforce_order_false_tra_output_tho_cua_lightgbm(
    models: dict[ModelKey, lgb.Booster], test_frame: pd.DataFrame
) -> None:
    """Cần đo được tỷ lệ crossing TRƯỚC khi sắp; nói "đã sắp nên 100% đúng" không phải là kiểm tra."""
    key = ModelKey(target="demand", horizon=15, quantile=50)
    raw = predict(models, test_frame, enforce_order=False)
    expected = models[key].predict(test_frame[list(FEATURE_COLUMNS)])
    assert raw[prediction_column("demand", 15, 50)].to_numpy() == pytest.approx(expected)


def test_ablation_bo_ba_feature_tuong_tac_van_chay(model_train_frame: pd.DataFrame) -> None:
    """`feature_names` thu hẹp được đúng vì AC #6 đòi báo cáo ablation `rain × peak`."""
    reduced = tuple(name for name in FEATURE_COLUMNS if name not in INTERACTION_FEATURES)
    keys = all_model_keys(targets=("demand",), horizons=(15,), quantiles=(50,))
    models = train_models(model_train_frame, keys=keys, feature_names=reduced, num_boost_round=3)
    assert models[keys[0]].feature_name() == list(reduced)
    predictions = predict(models, model_train_frame, feature_names=reduced)
    assert predictions[prediction_column("demand", 15, 50)].notna().all()


def test_predict_thieu_feature_thi_bao_loi(models: dict[ModelKey, lgb.Booster], test_frame: pd.DataFrame) -> None:
    with pytest.raises(ValueError, match="Thiếu feature"):
        predict(models, test_frame.drop(columns=["rain_x_peak"]))


# --------------------------------------------------------------- tính tái lập (§3.2 #4)


def test_hai_lan_train_cung_seed_cho_ket_qua_giong_het(
    model_train_frame: pd.DataFrame, test_frame: pd.DataFrame
) -> None:
    """Seed cố định + `deterministic=True` + `num_threads` cố định, nếu không `model_version` mất nghĩa."""
    keys = all_model_keys(targets=("demand",), horizons=(15,), quantiles=(50,))
    first = train_models(model_train_frame, keys=keys, num_boost_round=5)
    second = train_models(model_train_frame, keys=keys, num_boost_round=5)
    column = prediction_column("demand", 15, 50)
    assert predict(first, test_frame)[column].to_numpy() == pytest.approx(
        predict(second, test_frame)[column].to_numpy()
    )


def test_tham_so_khoa_tinh_tai_lap_khong_bi_bo_quen() -> None:
    """Bỏ `num_threads` cho LightGBM tự chọn theo số nhân CPU thì hai máy ra hai model khác nhau."""
    assert BASE_PARAMS["deterministic"] is True
    assert BASE_PARAMS["force_row_wise"] is True
    assert BASE_PARAMS["num_threads"] == 4
    for name in ("seed", "bagging_seed", "feature_fraction_seed", "data_random_seed"):
        assert BASE_PARAMS[name] == RANDOM_SEED


# --------------------------------------------------------------- artifact trên đĩa


def test_luu_va_nap_lai_cho_du_bao_giong_het(
    models: dict[ModelKey, lgb.Booster], test_frame: pd.DataFrame, tmp_path: Path
) -> None:
    paths = save_models(models, tmp_path)
    assert len(paths) == 12
    reloaded = load_models(tmp_path)
    before = predict(models, test_frame)
    after = predict(reloaded, test_frame)
    pd.testing.assert_frame_equal(before, after)


def test_thieu_mot_artifact_thi_bao_loi_ngay_khong_nap_mot_phan(
    models: dict[ModelKey, lgb.Booster], tmp_path: Path
) -> None:
    """Nạp thiếu rồi chạy tiếp = một horizon im lặng không có dự báo, lỗi chỉ lộ ở tận Model 2."""
    save_models(models, tmp_path)
    (tmp_path / "lgbm_supply_h30_p90.txt").unlink()
    with pytest.raises(FileNotFoundError, match="Thiếu artifact model"):
        load_models(tmp_path)


def test_write_manifest_giu_nguyen_tieng_viet(tmp_path: Path) -> None:
    path = tmp_path / "model_manifest.json"
    write_manifest(path, {"model_version": MODEL_VERSION, "ghi_chu": "đã train xong"})
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["model_version"] == MODEL_VERSION
    assert payload["ghi_chu"] == "đã train xong"


# --------------------------------------------------------------- AC #7: message §4.2


def test_forecast_at_tra_message_4_2_hop_le(models: dict[ModelKey, lgb.Booster], joined: pd.DataFrame) -> None:
    forecast = forecast_at(models, joined, t=FORECAST_T, horizon_min=15)
    assert forecast.model_version == MODEL_VERSION == "lgbm_quantile_v1"
    assert forecast.model_version != ""
    assert len(forecast.zones) == ZONE_COUNT
    assert forecast.forecast_ts == (FORECAST_T + pd.Timedelta(minutes=15)).to_pydatetime()
    assert all(zone.confidence is None for zone in forecast.zones)
    assert forecast.regime in ("normal", "peak", "rain", "rain_peak")


def test_forecast_at_dung_regime_rain_peak_khi_mua_vao_gio_cao_diem(
    models: dict[ModelKey, lgb.Booster], joined: pd.DataFrame
) -> None:
    assert forecast_at(models, joined, t=RAIN_PEAK_T, horizon_min=15).regime == "rain_peak"


def test_forecast_at_khong_co_dong_nao_tai_t_thi_bao_loi(
    models: dict[ModelKey, lgb.Booster], joined: pd.DataFrame
) -> None:
    with pytest.raises(ValueError, match="Không có dòng A2 nào"):
        forecast_at(models, joined, t=START - pd.Timedelta(days=1), horizon_min=15)


# --------------------------------------------------------------- AC #8: fallback (router R3)


def test_model_chay_duoc_thi_khong_co_canh_bao_nao(
    models: dict[ModelKey, lgb.Booster], joined: pd.DataFrame, lookup: pd.DataFrame
) -> None:
    result = predict_with_fallback(joined, t=FORECAST_T, horizon_min=15, models=models, lookup=lookup)
    assert isinstance(result, ForecastResult)
    assert result.warnings == ()
    assert not result.used_fallback
    assert result.forecast.model_version == MODEL_VERSION


def test_model_loi_thi_roi_ve_baseline_va_them_ma_vao_warnings(
    joined: pd.DataFrame, lookup: pd.DataFrame, caplog: pytest.LogCaptureFixture
) -> None:
    """§5.9 đòi đủ ba: vẫn trả message hợp lệ · log WARNING · thêm mã vào `warnings[]`."""
    broken = {ModelKey(target="demand", horizon=15, quantile=50): _BrokenBooster()}
    with caplog.at_level(logging.WARNING, logger="src.forecasting.lgbm_quantile"):
        result = predict_with_fallback(joined, t=FORECAST_T, horizon_min=15, models=broken, lookup=lookup)

    assert result.used_fallback
    assert result.forecast.model_version == "hist_avg_v1"
    assert len(result.forecast.zones) == ZONE_COUNT
    assert [warning["code"] for warning in result.warnings] == [FORECAST_FALLBACK_WARNING]
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_chua_co_artifact_thi_cung_roi_ve_baseline_router_r4(
    joined: pd.DataFrame, lookup: pd.DataFrame, caplog: pytest.LogCaptureFixture
) -> None:
    """Khối B phải chạy được trước khi Model 1 train xong (C-06, §5.14.2)."""
    with caplog.at_level(logging.WARNING, logger="src.forecasting.lgbm_quantile"):
        result = predict_with_fallback(joined, t=FORECAST_T, horizon_min=15, models=None, lookup=lookup)
    assert result.used_fallback
    assert result.forecast.model_version == "hist_avg_v1"
    assert any("baseline_hist_avg" in record.getMessage() for record in caplog.records)


def test_fallback_khong_goi_fallback(joined: pd.DataFrame) -> None:
    """Chuỗi fallback sâu đúng 1 tầng (C-06, CLAUDE.md §10 #3): hết đường thì ném ra ngoài."""
    with pytest.raises(ValueError, match="Không có cả model lẫn bảng tra"):
        predict_with_fallback(joined, t=FORECAST_T, horizon_min=15, models=None, lookup=None)


def test_ma_canh_bao_dung_chuoi_cua_api_contract(models: dict[ModelKey, lgb.Booster], joined: pd.DataFrame) -> None:
    """API_CONTRACT §1.3 và ví dụ §4.1 dùng `FORECAST_FALLBACK_USED` — đó là chuỗi đi ra trên dây.

    AGENT_WORKFLOW §5.9 hàng 3 viết tắt là `FORECAST_FALLBACK`; hai tài liệu lệch nhau và
    §10 xếp API_CONTRACT là nơi khai `warnings[]`, nên lấy bản của nó.
    """
    assert FORECAST_FALLBACK_WARNING == "FORECAST_FALLBACK_USED"
    # `used_fallback` phải soi ĐÚNG mã đó, không phải "có cảnh báo nào cũng tính".
    other = ForecastResult(
        forecast=forecast_at(models, joined, t=FORECAST_T, horizon_min=15),
        warnings=({"code": "NOWCAST_STALE", "message": "bản tin mưa cũ"},),
    )
    assert not other.used_fallback
