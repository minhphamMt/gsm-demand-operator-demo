"""Các bước tính toán thuần của pipeline quyết định — dùng chung cho route và đồ thị.

Vì sao module này tồn tại: `POST /decisions` (đường cũ) và đồ thị LangGraph (đường mới)
phải cho ra **cùng một con số** trên cùng một snapshot. Cách duy nhất bảo đảm điều đó là
hai bên gọi chung một hàm, chứ không phải hai bản cài đặt được so bằng mắt.

Ranh giới: mọi hàm ở đây là hàm thuần, ném exception dự án (`src/common/errors.py`) chứ
không ném `HTTPException`. Việc dịch sang mã HTTP là của tầng `src/api/`. Đưa FastAPI vào
đây sẽ khoá các bước này lại chỉ dùng được sau một request HTTP.
"""

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol

import lightgbm as lgb
import pandas as pd

from src.activation.recommendation import ActivationRecommendation
from src.common.errors import (
    DatasetUnavailableError,
    ReplayModelUnavailableError,
    ReplayProvenanceMismatchError,
    ReplaySourceNotFoundError,
)
from src.common.policy import Policy
from src.contracts.forecast import Forecast, HorizonMin, ZoneForecast
from src.contracts.hotspot import Hotspot, HotspotOutput, SurplusZone
from src.datasets.snapshot_replay import dataset_status, replay_features, snapshot_at
from src.forecasting.lgbm_quantile import ModelKey, forecast_at, load_models, verify_model_bundle
from src.forecasting.live_snapshot_baseline import forecast_from_live_zones
from src.hotspot.detector import gap_inputs, gap_of, meets_condition, severity_of
from src.optimizer.greedy import SolveResult
from src.simulation.metrics import system_metrics

# Mã cảnh báo. Viết một lần ở đây, nơi khác import lại — gõ tay ở tầng API là cách hai bên
# lệch nhau mà test không bắt được.
NO_POLICY_HOTSPOT = "NO_POLICY_HOTSPOT"
RISK_ADVISORY_PROPOSAL = "RISK_ADVISORY_PROPOSAL"
MODEL_HISTORY_INCOMPLETE = "MODEL_HISTORY_INCOMPLETE"
ENROUTE_ETA_UNAVAILABLE = "ENROUTE_ETA_UNAVAILABLE"
HYSTERESIS_STATE_UNAVAILABLE = "HYSTERESIS_STATE_UNAVAILABLE"


class ZoneObservation(Protocol):
    """Hình dạng tối thiểu của một zone đầu vào.

    Dùng Protocol thay vì import model của tầng API: các bước này phải gọi được từ đồ thị
    mà không kéo theo schema của request HTTP.

    Khai báo dạng `@property` chứ không phải attribute: thành viên protocol đọc-ghi khớp
    bất biến, nên `peak_flag: Literal[0, 1]` của model request sẽ không thoả `int`. Chỉ đọc
    là đủ cho mọi bước ở đây, và cho phép kiểu hẹp hơn đi vào.
    """

    @property
    def zone_id(self) -> int: ...
    @property
    def demand_observed(self) -> int: ...
    @property
    def idle_supply(self) -> int: ...
    @property
    def enroute_supply(self) -> int: ...
    @property
    def rain_mm_h(self) -> float: ...
    @property
    def rain_forecast_15(self) -> float: ...
    @property
    def rain_forecast_30(self) -> float: ...
    @property
    def peak_flag(self) -> int: ...
    @property
    def holiday_flag(self) -> int: ...


@dataclass(frozen=True)
class ForecastSelection:
    """Kết quả bước dự báo, kèm nhãn nguồn để hạ nguồn không phải đoán."""

    forecast: Forecast
    mode: str
    warnings: tuple[dict[str, str], ...]


@dataclass(frozen=True)
class RiskZone:
    """Zone chưa đạt điều kiện hotspot chính sách nhưng p90 đã cho thấy thiếu hụt.

    Thứ tự field là thứ tự khoá trong response `risk_zones[]` — giữ nguyên khi sửa.
    """

    zone_id: int
    gap: float
    required_units: int
    risk_basis: str


@dataclass(frozen=True)
class PlanningTargets:
    """Tập zone cần điều xe tới, đã gộp hotspot chính sách và risk tư vấn."""

    hotspot_output: HotspotOutput
    planning_output: HotspotOutput
    policy_hotspot_ids: frozenset[int]
    risk_zones: tuple[RiskZone, ...]
    planning_regime: str
    planning_inputs: dict[int, tuple[float, float]]
    planning_gap_by_zone: dict[int, float]


@lru_cache(maxsize=1)
def trained_models(model_directory: str) -> dict[ModelKey, lgb.Booster]:
    return load_models(Path(model_directory))


@lru_cache(maxsize=1)
def simulation_features() -> pd.DataFrame:
    return replay_features()


@lru_cache(maxsize=1)
def verified_model_bundle(model_directory: str, configured_model_version: str) -> dict[str, object]:
    return verify_model_bundle(
        Path(model_directory),
        configured_model_version=configured_model_version,
    )


def validate_replay_provenance(zones: Sequence[ZoneObservation], replay_source_at: pd.Timestamp) -> None:
    """Chặn việc trộn quan sát tự do vào một đường mang nhãn replay đã kiểm chứng.

    So từng field thay vì so tổng: một zone lệch `peak_flag` đủ để đổi regime và do đó đổi
    toàn bộ ngưỡng gap, nhưng tổng số xe vẫn khớp.
    """
    try:
        expected = snapshot_at(replay_source_at)
    except LookupError as error:
        raise ReplaySourceNotFoundError(str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise DatasetUnavailableError(str(error)) from error

    expected_by_zone = {int(zone["zone_id"]): zone for zone in expected["zones"]}
    integer_fields = ("demand_observed", "idle_supply", "enroute_supply", "peak_flag", "holiday_flag")
    float_fields = ("rain_mm_h", "rain_forecast_15", "rain_forecast_30")
    mismatches: list[dict[str, object]] = []
    for actual in zones:
        source = expected_by_zone[actual.zone_id]
        for field in integer_fields:
            if int(getattr(actual, field)) != int(source[field]):
                mismatches.append({"zone_id": actual.zone_id, "field": field})
        for field in float_fields:
            if not math.isclose(
                float(getattr(actual, field)),
                float(source[field]),
                rel_tol=1e-9,
                abs_tol=1e-9,
            ):
                mismatches.append({"zone_id": actual.zone_id, "field": field})

    if mismatches:
        raise ReplayProvenanceMismatchError(
            "Replay zones do not match the checksummed source bucket; mixed-source inference was blocked.",
            {"mismatches": mismatches[:20]},
        )


def select_forecast(
    *,
    zones: Sequence[ZoneObservation],
    t: pd.Timestamp,
    horizon_min: HorizonMin,
    replay_source_at: pd.Timestamp | None,
    model_directory: Path,
    configured_model_version: str,
) -> ForecastSelection:
    """Chạy LightGBM đã huấn luyện cho replay đã kiểm chứng; baseline cho quan sát trực tiếp.

    Replay fail-closed có chủ ý: nhánh này được chọn tường minh để chứng minh bundle model,
    nên hạ xuống baseline ở đây sẽ ghi kết quả baseline dưới nhãn provenance của replay và
    làm lỗi model trông như một dự báo hợp lệ.
    """
    if replay_source_at is not None:
        try:
            bundle = verified_model_bundle(str(model_directory), configured_model_version)
            source = forecast_at(
                trained_models(str(model_directory)),
                simulation_features(),
                t=replay_source_at,
                horizon_min=horizon_min,
                model_version=str(bundle["model_version"]),
            )
            forecast = Forecast(
                t=t,
                horizon_min=horizon_min,
                forecast_ts=t + (source.forecast_ts - source.t),
                zones=source.zones,
                model_version=source.model_version,
                regime=source.regime,
            )
            return ForecastSelection(forecast=forecast, mode="trained_model_replay", warnings=())
        except Exception as error:  # noqa: BLE001 - replay phải fail-closed cho mọi lỗi bundle/inference.
            raise ReplayModelUnavailableError(
                "Verified replay requires the trained model bundle; no baseline was substituted.",
                {"cause": type(error).__name__},
            ) from error

    warnings: list[dict[str, str]] = [
        {
            "code": MODEL_HISTORY_INCOMPLETE,
            "message": "Snapshot không có nguồn replay hoặc lịch sử feature; đang dùng baseline snapshot.",
        }
    ]
    if any(zone.enroute_supply > 0 for zone in zones):
        warnings.append(
            {
                "code": ENROUTE_ETA_UNAVAILABLE,
                "message": (
                    "Live input has aggregate en-route supply but no arrival ETA; "
                    "it was excluded from predicted supply."
                ),
            }
        )
    return ForecastSelection(
        forecast=forecast_from_live_zones(t, horizon_min, zones),
        mode="live_snapshot_baseline",
        warnings=tuple(warnings),
    )


def detect_hotspots(
    forecast: Forecast,
    zones: Sequence[ZoneObservation],
    policy: Policy,
) -> HotspotOutput:
    """Phát hiện hotspot mà không giữ state ẩn giữa các request.

    Replay có thể chứa một ổ mưa cục bộ trong khi trung bình toàn thành phố vẫn dưới ngưỡng
    regime `rain`. Bản đồ đã hiện những zone ướt đó cùng rủi ro p90, nên khi một snapshot
    cao điểm có bất kỳ lượng mưa quan sát/ngắn hạn nào, việc lập phương án phải dùng cùng
    cơ sở thận trọng — thay vì âm thầm rơi về p50 rồi điều một xe cho nhiều zone đỏ.
    """
    idle = {zone.zone_id: zone.idle_supply for zone in zones}
    has_peak = any(zone.peak_flag == 1 for zone in zones)
    has_local_rain = any(
        max(zone.rain_mm_h, zone.rain_forecast_15, zone.rain_forecast_30) >= policy.derived.rain_threshold_mm_h
        for zone in zones
    )
    mode = policy.rules.conservative_gap_mode if has_peak and has_local_rain else None
    planning_regime = "rain_peak" if mode else forecast.regime
    hotspots: list[Hotspot] = []
    surplus: list[SurplusZone] = []
    for zone in forecast.zones:
        gap = gap_of(zone, regime=planning_regime, conservative_gap_mode=mode)
        if meets_condition(
            predicted_supply=zone.predicted_supply,
            gap=gap,
            predicted_demand=zone.predicted_demand,
            min_supply_per_zone=policy.rules.min_supply_per_zone,
        ):
            hotspots.append(
                Hotspot(
                    zone_id=zone.zone_id,
                    is_hotspot=True,
                    gap=gap,
                    severity_score=severity_of(gap, zone.predicted_demand),
                    idle_supply_current=idle[zone.zone_id],
                )
            )
        available = zone.predicted_supply - zone.predicted_demand
        if available > 0:
            surplus.append(
                SurplusZone(
                    zone_id=zone.zone_id,
                    surplus=available,
                    idle_supply_current=idle[zone.zone_id],
                    cooldown_until_ts=None,
                )
            )
    return HotspotOutput(
        forecast_ts=forecast.forecast_ts,
        horizon_min=forecast.horizon_min,
        hotspots=tuple(hotspots),
        surplus_zones=tuple(surplus),
        conservative_gap_mode=mode,
    )


def required_units(gap: float) -> int:
    """Quy gap liên tục sang số xe không chia nhỏ được, làm tròn về gần nhất."""
    return max(0, math.floor(gap + 0.5))


def build_planning_targets(
    forecast: Forecast,
    hotspot_output: HotspotOutput,
    zones: Sequence[ZoneObservation],
) -> PlanningTargets:
    """Gộp hotspot chính sách với zone risk p90 đủ một đơn vị xe thành tập đích lập phương án.

    Zone risk không phải hotspot: nó chưa vượt điều kiện chính sách nhưng p90 đã cho thấy
    thiếu hụt đủ để điều ít nhất một xe. Tách hai loại ra để `reason_code` nói đúng bản chất
    phương án — khuyến nghị sớm hay xử lý hotspot đã xác nhận.
    """
    policy_hotspot_ids = frozenset(hotspot.zone_id for hotspot in hotspot_output.hotspots)
    planning_regime = "rain_peak" if hotspot_output.conservative_gap_mode else forecast.regime
    planning_gap_by_zone = {
        zone.zone_id: gap_of(
            zone,
            regime=planning_regime,
            conservative_gap_mode=hotspot_output.conservative_gap_mode,
        )
        for zone in forecast.zones
    }
    planning_inputs = {
        zone.zone_id: gap_inputs(
            zone,
            regime=planning_regime,
            conservative_gap_mode=hotspot_output.conservative_gap_mode,
        )
        for zone in forecast.zones
    }
    idle_supply_by_zone = {zone.zone_id: zone.idle_supply for zone in zones}
    risk_zones = tuple(
        RiskZone(
            zone_id=zone.zone_id,
            gap=planning_gap_by_zone[zone.zone_id],
            required_units=required_units(planning_gap_by_zone[zone.zone_id]),
            risk_basis=hotspot_output.conservative_gap_mode or "p50",
        )
        for zone in forecast.zones
        if zone.zone_id not in policy_hotspot_ids and planning_gap_by_zone[zone.zone_id] > 0
    )
    risk_targets = tuple(
        Hotspot(
            zone_id=risk.zone_id,
            is_hotspot=False,
            gap=risk.gap,
            severity_score=severity_of(risk.gap, planning_inputs[risk.zone_id][0]),
            idle_supply_current=idle_supply_by_zone[risk.zone_id],
        )
        for risk in risk_zones
        if risk.required_units > 0
    )
    planning_targets = (*hotspot_output.hotspots, *risk_targets)
    return PlanningTargets(
        hotspot_output=hotspot_output,
        planning_output=hotspot_output.model_copy(update={"hotspots": planning_targets}),
        policy_hotspot_ids=policy_hotspot_ids,
        risk_zones=risk_zones,
        planning_regime=planning_regime,
        planning_inputs=planning_inputs,
        planning_gap_by_zone=planning_gap_by_zone,
    )


def supply_after_moves(
    planning_inputs: dict[int, tuple[float, float]],
    moves: Iterable[tuple[int, int, int]],
) -> dict[int, float]:
    """Cung mỗi zone sau khi mọi move đã tới nơi. `moves` là (from_zone, to_zone, units)."""
    supply = {zone_id: supply for zone_id, (_, supply) in planning_inputs.items()}
    for from_zone, to_zone, units in moves:
        supply[from_zone] -= units
        supply[to_zone] += units
    return supply


def forecast_zone_by_id(forecast: Forecast) -> dict[int, ZoneForecast]:
    return {zone.zone_id: zone for zone in forecast.zones}


def _widen(warning: Mapping[str, object]) -> dict[str, object]:
    """Nới `dict[str, str]` thành `dict[str, object]`.

    Cần hàm riêng vì `dict` bất biến theo kiểu value: cảnh báo của forecast là
    `dict[str, str]`, của optimizer là `dict[str, object]`, và gộp thẳng hai loại vào một
    list sẽ không qua được type check.
    """
    return dict(warning)


def assemble_decision(
    *,
    snapshot_id: int | str,
    data_source: str,
    selection: ForecastSelection,
    targets: PlanningTargets,
    result: SolveResult,
    activation: ActivationRecommendation,
    policy: Policy,
    replay_source_at_iso: str | None,
    source_kind: str,
    planning_status: str,
    reason_code: str | None,
    extra_warnings: Sequence[dict[str, object]] = (),
    policy_overrides: Mapping[str, float] | None = None,
) -> dict[str, object]:
    """Dựng payload quyết định. Một nơi duy nhất — route và đồ thị đều gọi hàm này.

    Đây là điều kiện để tiêu chí nghiệm thu R1 ("đồ thị cho ra đúng output của
    `POST /decisions`") có nghĩa: nếu hai đường tự dựng payload riêng, chúng sẽ trôi xa nhau
    theo từng lần sửa mà không test nào bắt được.
    """
    forecast = selection.forecast
    hotspot_output = targets.hotspot_output
    supply_after = supply_after_moves(
        targets.planning_inputs,
        ((move.from_zone, move.to_zone, move.units_to_move) for move in result.moves),
    )
    metrics_before = system_metrics(targets.planning_inputs.values())
    metrics_after_relocation = system_metrics(
        (targets.planning_inputs[zone.zone_id][0], supply_after[zone.zone_id]) for zone in forecast.zones
    )

    planning_basis_warnings: list[dict[str, object]] = []
    if reason_code == RISK_ADVISORY_PROPOSAL:
        planning_basis_warnings.append(
            {
                "code": RISK_ADVISORY_PROPOSAL,
                "severity": "info",
                "message": (
                    "Không có hotspot chính sách; phương án này là khuyến nghị sớm từ risk p90 "
                    "và cần điều phối viên xem xét, chỉnh sửa, phê duyệt."
                ),
            }
        )
    elif reason_code == NO_POLICY_HOTSPOT:
        planning_basis_warnings.append(
            {
                "code": NO_POLICY_HOTSPOT,
                "message": "Không có hotspot chính sách hoặc risk đủ một đơn vị xe; không sinh phương án.",
            }
        )

    warnings: list[dict[str, object]] = [
        *[_widen(warning) for warning in selection.warnings],
        *[_widen(warning) for warning in result.warnings],
        *planning_basis_warnings,
        {
            "code": HYSTERESIS_STATE_UNAVAILABLE,
            "message": "Request đơn không có lịch sử hysteresis; hotspot dùng điều kiện thô.",
        },
        *[_widen(warning) for warning in extra_warnings],
    ]

    return {
        "snapshot_id": snapshot_id,
        "data_source": data_source,
        "forecast_mode": selection.mode,
        "planning_status": planning_status,
        "reason_code": reason_code,
        "risk_zones": [asdict(risk) for risk in targets.risk_zones],
        "data_provenance": {
            "observation_source": data_source,
            "forecast_feature_source": (
                "derived_from_verified_snapshot_test.parquet"
                if selection.mode == "trained_model_replay"
                else "request.zones"
            ),
            "replay_source_at": replay_source_at_iso,
            "replay_snapshot_verified": replay_source_at_iso is not None,
            "source_kind": source_kind,
        },
        # Ngưỡng điều phối viên đổi cho lượt chạy này, rỗng nếu chạy bằng policy.yaml
        # nguyên bản. Đi kèm quyết định vì §3 #7 cấm state ẩn: một plan không nói ra nó
        # được tính dưới ngưỡng nào thì không ai dựng lại được nó về sau.
        "policy_overrides": dict(policy_overrides or {}),
        "activation_policy": {
            "incentive_amount": policy.rules.incentive_base,
            "incentive_budget_cap": policy.rules.incentive_budget_cap,
            "overbooking_factor": policy.rules.overbooking_factor,
            "assumed_accept_rate": policy.rules.assumed_accept_rate,
            "offer_ttl_minutes": policy.rules.offer_ttl_minutes,
        },
        "activation_recommendation": {
            "strategy": "residual_gap_desc_budget_constrained",
            "target_zones": [asdict(target) for target in activation.target_zones],
            "total_requested_offers": activation.total_requested_offers,
            "total_expected_units_gained": activation.total_expected_units_gained,
            "total_expected_gap_remaining": activation.total_expected_gap_remaining,
            "projected_gap_reduction_pct": activation.projected_gap_reduction_pct,
            "worst_case_commitment": activation.worst_case_commitment,
            "constrained_by_budget": activation.constrained_by_budget,
            "accept_rate_source": "policy_assumption",
        },
        "forecast": forecast.model_dump(mode="json"),
        "hotspots": hotspot_output.model_dump(mode="json"),
        "simulation": {
            "metrics_before": metrics_before.__dict__,
            "metrics_after_relocation": metrics_after_relocation.__dict__,
            "basis": (
                f"forecast_{hotspot_output.conservative_gap_mode}_after_all_moves_arrive"
                if hotspot_output.conservative_gap_mode
                else "forecast_p50_after_all_moves_arrive"
            ),
        },
        "plan": {
            "moves": [move.model_dump(mode="json") for move in result.moves],
            "residual_gap": [gap.model_dump(mode="json") for gap in result.residual_gap],
            "plan_totals": result.plan_totals.model_dump(mode="json"),
            "relocation_targets": [
                {
                    "zone_id": target.zone_id,
                    "gap": target.gap,
                    "required_units": required_units(target.gap),
                    "is_policy_hotspot": target.zone_id in targets.policy_hotspot_ids,
                    "target_basis": hotspot_output.conservative_gap_mode or "p50",
                }
                for target in targets.planning_output.hotspots
                if target.gap > 0
            ],
            "source_capacities": [
                {"zone_id": zone_id, "movable_units": units} for zone_id, units in result.source_capacities
            ],
            "warnings": warnings,
        },
    }


def dataset_source_kind(replay_source_at: pd.Timestamp | None) -> str:
    """Nhãn nguồn dữ liệu cho khối provenance của response."""
    if replay_source_at is None:
        return "caller_supplied_observation"
    try:
        return str(dataset_status()["provenance"]["source_kind"])
    except (FileNotFoundError, ValueError, KeyError) as error:
        raise DatasetUnavailableError(str(error)) from error
