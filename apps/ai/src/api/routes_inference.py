"""HTTP boundary for trained forecast, hotspot detection and relocation planning.

Tầng này chỉ làm ba việc: validate request, gọi các bước thuần ở
`src/orchestration/steps.py`, và dịch exception dự án sang mã HTTP. Mọi số học nằm ở
tầng dưới — đồ thị LangGraph gọi đúng các bước đó nên hai đường không thể lệch nhau.
"""

from typing import Literal

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator

from src.activation.recommendation import recommend_activation
from src.common.errors import (
    DatasetUnavailableError,
    PolicyOverrideRejectedError,
    ReplayModelUnavailableError,
    ReplayProvenanceMismatchError,
    ReplaySourceNotFoundError,
)
from src.common.haversine import get_zone_coords
from src.common.policy import apply_overrides, get_policy
from src.config import get_settings
from src.contracts import ContractModel, StepAlignedDatetime, ZoneId, ensure_full_zone_coverage
from src.contracts.forecast import HorizonMin
from src.contracts.plan import PlanTotals
from src.datasets.snapshot_replay import dataset_status, next_snapshot, snapshot_at, snapshot_window
from src.optimizer.greedy import SolveResult, solve
from src.orchestration.steps import (
    NO_POLICY_HOTSPOT,
    RISK_ADVISORY_PROPOSAL,
    assemble_decision,
    build_planning_targets,
    dataset_source_kind,
    detect_hotspots,
    select_forecast,
    simulation_features,
    trained_models,
    validate_replay_provenance,
    verified_model_bundle,
)

router = APIRouter(prefix="/api/v1", tags=["inference"])


class DatasetSnapshotRequest(ContractModel):
    after_source_at: StepAlignedDatetime | None = None
    regime: Literal["normal", "peak", "rain", "rain_peak"] | None = None


class ExactDatasetSnapshotRequest(ContractModel):
    source_at: StepAlignedDatetime


class DatasetWindowRequest(ExactDatasetSnapshotRequest):
    """Cửa sổ quan sát nhìn lại. Mặc định giữ 60 phút để caller cũ không đổi hành vi.

    Trần 1440 phút (24 giờ) là để một request không kéo về cả tuần dữ liệu — bảng vận hành
    chỉ vẽ xu hướng trong ngày.
    """

    lookback_minutes: int = Field(default=60, ge=5, le=1440)


@router.get("/datasets/snapshots/status")
def get_dataset_status() -> dict[str, object]:
    try:
        return dataset_status()
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/datasets/snapshots/next")
def get_next_dataset_snapshot(request: DatasetSnapshotRequest) -> dict[str, object]:
    try:
        source_at = pd.Timestamp(request.after_source_at) if request.after_source_at else None
        return next_snapshot(source_at, request.regime)
    except LookupError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/datasets/snapshots/at")
def get_dataset_snapshot_at(request: ExactDatasetSnapshotRequest) -> dict[str, object]:
    try:
        return snapshot_at(pd.Timestamp(request.source_at))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/datasets/snapshots/window")
def get_dataset_snapshot_window(request: DatasetWindowRequest) -> dict[str, object]:
    try:
        return {"steps": snapshot_window(pd.Timestamp(request.source_at), request.lookback_minutes)}
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


class LiveZoneInput(ContractModel):
    zone_id: ZoneId
    demand_observed: int = Field(ge=0)
    idle_supply: int = Field(ge=0)
    enroute_supply: int = Field(default=0, ge=0)
    rain_mm_h: float = Field(ge=0)
    rain_forecast_15: float = Field(ge=0)
    rain_forecast_30: float = Field(ge=0)
    peak_flag: Literal[0, 1]
    holiday_flag: Literal[0, 1]


class DecisionRequest(ContractModel):
    snapshot_id: int | str
    t: StepAlignedDatetime
    horizon_min: HorizonMin = 15
    data_source: str = Field(min_length=1)
    replay_source_at: StepAlignedDatetime | None = None
    zones: tuple[LiveZoneInput, ...]
    # Ngưỡng điều phối viên chỉnh cho ĐÚNG lượt chạy này. Optional và mặc định rỗng nên
    # contract cũ không đổi (CLAUDE.md §3 #1). Đi theo request thay vì nằm ở state server
    # vì một override sống ngoài request là state ẩn: lượt chạy sau sẽ dùng ngưỡng khác mà
    # không ai thấy trong input.
    policy_overrides: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_zone_coverage(self) -> "DecisionRequest":
        ensure_full_zone_coverage([zone.zone_id for zone in self.zones])
        return self


def trained_model_readiness() -> dict[str, object]:
    """Load artifacts for real so health cannot report a false ready state."""
    settings = get_settings()
    model_directory = settings.data_dir / "models"
    try:
        bundle = verified_model_bundle(str(model_directory), settings.model_version)
        models = trained_models(str(model_directory))
        features = simulation_features()
    except Exception as error:  # noqa: BLE001 - readiness reports loader failures.
        return {"ready": False, "error": str(error), "artifacts": len(list(model_directory.glob("*.txt")))}
    expected_artifacts = bundle["artifacts"]
    return {
        "ready": (
            isinstance(expected_artifacts, int)
            and expected_artifacts > 0
            and len(models) == expected_artifacts
            and bool(bundle["verified"])
        ),
        "artifacts": len(models),
        "model_version": bundle["model_version"],
        "bundle": bundle,
        "simulation_feature_rows": len(features),
        "simulation_features_source": "derived_from_verified_snapshot_test.parquet",
    }


@router.post("/decisions")
def generate_decision(request: DecisionRequest) -> dict[str, object]:
    settings = get_settings()
    policy = get_policy(settings.policy_path)
    try:
        policy = apply_overrides(policy, request.policy_overrides)
    except PolicyOverrideRejectedError as error:
        # 422 chứ không 400: request đúng cú pháp, giá trị mới là thứ bị từ chối.
        raise HTTPException(
            status_code=422,
            detail={"code": error.error_code, "message": error.message, **error.detail},
        ) from error
    replay_source_at = pd.Timestamp(request.replay_source_at) if request.replay_source_at else None

    try:
        if replay_source_at is not None:
            validate_replay_provenance(request.zones, replay_source_at)
        selection = select_forecast(
            zones=request.zones,
            t=request.t,
            horizon_min=request.horizon_min,
            replay_source_at=replay_source_at,
            model_directory=settings.data_dir / "models",
            configured_model_version=settings.model_version,
        )
    except ReplaySourceNotFoundError as error:
        raise HTTPException(
            status_code=409,
            detail={"code": error.error_code, "message": error.message},
        ) from error
    except ReplayProvenanceMismatchError as error:
        raise HTTPException(
            status_code=409,
            detail={"code": error.error_code, "message": error.message, **error.detail},
        ) from error
    except ReplayModelUnavailableError as error:
        raise HTTPException(
            status_code=503,
            detail={"code": error.error_code, "message": error.message, **error.detail},
        ) from error
    except DatasetUnavailableError as error:
        raise HTTPException(status_code=503, detail=error.message) from error

    forecast = selection.forecast
    hotspot_output = detect_hotspots(forecast, request.zones, policy)
    targets = build_planning_targets(forecast, hotspot_output, request.zones)
    rain = {zone.zone_id: zone.rain_mm_h for zone in request.zones}

    if targets.planning_output.hotspots:
        result = solve(
            targets.planning_output,
            t=request.t,
            rain_mm_h=rain,
            policy=policy,
            zone_coords=get_zone_coords(settings.zone_registry_path),
            protected_source_zone_ids=targets.policy_hotspot_ids,
        )
        planning_status = "optimizer_evaluated"
        reason_code = None if hotspot_output.hotspots else RISK_ADVISORY_PROPOSAL
    else:
        # Không có cả hotspot chính sách lẫn risk đủ một đơn vị xe để lập phương án.
        result = SolveResult(
            moves=(),
            residual_gap=(),
            plan_totals=PlanTotals(
                total_units=0,
                total_cost=0,
                total_deadhead_km=0,
                budget_cap=policy.rules.budget_cap,
            ),
        )
        planning_status = "not_required"
        reason_code = NO_POLICY_HOTSPOT

    activation = recommend_activation(
        result.residual_gap,
        incentive_amount=policy.rules.incentive_base,
        incentive_budget_cap=policy.rules.incentive_budget_cap,
        overbooking_factor=policy.rules.overbooking_factor,
        assumed_accept_rate=policy.rules.assumed_accept_rate,
    )

    try:
        source_kind = dataset_source_kind(replay_source_at)
    except DatasetUnavailableError as error:
        raise HTTPException(status_code=503, detail=error.message) from error

    return assemble_decision(
        snapshot_id=request.snapshot_id,
        data_source=request.data_source,
        selection=selection,
        targets=targets,
        result=result,
        activation=activation,
        policy=policy,
        replay_source_at_iso=(request.replay_source_at.isoformat() if request.replay_source_at else None),
        source_kind=source_kind,
        planning_status=planning_status,
        reason_code=reason_code,
        policy_overrides=request.policy_overrides,
    )
