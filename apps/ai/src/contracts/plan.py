"""Entity `RelocationPlan` — SPEC §4.4, docs/design/DATA_CONTRACT.md §2.4.

Model 3 → Simulator/UI. Đây cũng là object được nhúng nguyên vẹn vào History §4.6,
nên mọi ràng buộc ở đây phải đúng cả với plan vừa sinh lẫn plan đọc lại từ kho.
"""

import math
from typing import Annotated, Any, Literal

from pydantic import (
    AwareDatetime,
    Field,
    NonNegativeFloat,
    NonNegativeInt,
    PositiveFloat,
    PositiveInt,
    StringConstraints,
    ValidationInfo,
    model_validator,
)

from src.common.ids import CampaignId, PlanId
from src.common.policy import policy_from_context
from src.common.regime import REGIMES, Regime
from src.contracts import ContractModel, ZoneId

# Sai số cho phép khi đối chiếu hai vế của một công thức cộng dồn. Bằng ngưỡng INV-1
# (CLAUDE.md §3.1) để plan và baseline không dùng hai chuẩn "bằng nhau" khác nhau.
FLOAT_TOLERANCE = 1e-6

PlanStatus = Literal["Draft", "Proposed", "Revised", "Approved", "Rejected"]

# Vòng đời chiến dịch huy động — RIÊNG, không nhập vào PlanStatus (§5.7): approve plan
# không đồng nghĩa với duyệt cam kết tiền thưởng, đó là hai cổng người khác nhau (C-09).
CampaignStatus = Literal["NotNeeded", "Pending", "Running", "Closed"]

# `"{t}_h{horizon_min}"`, ví dụ "2026-08-02T17:05:00+07:00_h15" (§4.4).
ForecastRef = Annotated[str, StringConstraints(pattern=r"^.+_h(15|30)$")]


class Move(ContractModel):
    """Một lệnh điều chuyển xe giữa hai zone — §4.4."""

    from_zone: ZoneId
    to_zone: ZoneId
    units_to_move: PositiveInt
    # `ceil(travel_time / 5 phút)`, tối thiểu 1: một move "đến ngay trong step này" sẽ
    # làm Simulator cộng cung trước khi xe kịp đi.
    eta_steps: PositiveInt
    estimated_distance_km: PositiveFloat
    estimated_cost: NonNegativeInt
    deadhead_km: PositiveFloat
    before_gap: float
    after_gap: float

    @model_validator(mode="after")
    def _check_move(self, info: ValidationInfo) -> "Move":
        """Ràng buộc nội tại của một move; `max_distance` chỉ kiểm khi có policy trong context."""
        if self.from_zone == self.to_zone:
            raise ValueError(f"move rỗng nghĩa: from_zone == to_zone == {self.from_zone}")

        # MVP: xe chạy rỗng toàn tuyến nên deadhead bằng đúng quãng đường (§2.4).
        if not math.isclose(self.deadhead_km, self.estimated_distance_km, abs_tol=FLOAT_TOLERANCE):
            raise ValueError(
                f"deadhead_km={self.deadhead_km} phải bằng estimated_distance_km={self.estimated_distance_km}"
            )

        expected_after = self.before_gap - self.units_to_move
        if not math.isclose(self.after_gap, expected_after, abs_tol=FLOAT_TOLERANCE):
            raise ValueError(f"after_gap={self.after_gap} phải bằng before_gap − units_to_move = {expected_after}")

        policy = policy_from_context(info.context)
        if policy is not None and self.estimated_distance_km > policy.rules.max_distance + FLOAT_TOLERANCE:
            raise ValueError(
                f"estimated_distance_km={self.estimated_distance_km} vượt max_distance={policy.rules.max_distance}"
            )
        return self


class ResidualGap(ContractModel):
    """Phần thiếu còn lại sau điều chuyển — input của Activation Engine (FR-9, §5.11)."""

    zone_id: ZoneId
    gap_remaining: PositiveFloat
    suggested_activation: NonNegativeInt


class PlanTotals(ContractModel):
    """Tổng hợp toàn plan — §4.4."""

    total_units: NonNegativeInt
    total_cost: NonNegativeInt
    total_deadhead_km: NonNegativeFloat
    # Echo giá trị policy tại thời điểm sinh plan, để đọc lại bản ghi cũ vẫn biết nó bị
    # ràng buộc bởi trần nào — không tra ngược policy.yaml hiện hành (§3.2 #7).
    budget_cap: NonNegativeInt

    @model_validator(mode="after")
    def _check_budget(self) -> "PlanTotals":
        """Trần ngân sách điều chuyển là ràng buộc CỨNG (§2.4).

        Kiểm được ngay tại contract vì trần được echo ngay trong chính object này —
        không cần biết policy hiện hành, nên bản ghi lịch sử vẫn kiểm lại được.
        """
        if self.total_cost > self.budget_cap:
            raise ValueError(f"total_cost={self.total_cost} vượt budget_cap={self.budget_cap}")
        return self


class Metrics(ContractModel):
    """Bộ 3 chỉ số §5.5, sinh bởi src/simulation/metrics.py.

    Contract này KHÔNG cài lại công thức — cài lại lần thứ hai làm mọi so sánh KPI mất
    hiệu lực (§5.14.1). Ở đây chỉ kiểm miền giá trị và cấu trúc `by_regime`.
    """

    unmet_demand: NonNegativeFloat
    avg_wait_proxy: NonNegativeFloat
    est_cancel_rate: float = Field(ge=0.0, le=1.0)
    # Optional, nhưng khi có thì phải đủ 4 regime — `rain_peak` là thước đo thành công
    # chính và không được giấu trong số tổng (CLAUDE.md §3 #6).
    by_regime: dict[Regime, "Metrics"] | None = None

    @model_validator(mode="after")
    def _check_by_regime(self) -> "Metrics":
        """Đủ 4 khóa regime và không lồng thêm tầng nữa."""
        if self.by_regime is None:
            return self

        missing = [regime for regime in REGIMES if regime not in self.by_regime]
        if missing:
            raise ValueError(f"by_regime thiếu regime: {missing}")

        nested = sorted(name for name, item in self.by_regime.items() if item.by_regime is not None)
        if nested:
            # Metrics con là số của MỘT regime; lồng tiếp chỉ có thể là dữ liệu bị copy nhầm.
            raise ValueError(f"by_regime không được lồng thêm tầng: {nested}")
        return self


class ActivationSummary(ContractModel):
    """Tóm tắt chiến dịch huy động gắn với plan — §4.4."""

    campaign_id: CampaignId
    status: CampaignStatus
    offers_sent: NonNegativeInt
    offers_accepted: NonNegativeInt
    units_gained: NonNegativeInt
    incentive_committed: NonNegativeInt
    incentive_budget_cap: NonNegativeInt

    @model_validator(mode="after")
    def _check_counts_and_budget(self) -> "ActivationSummary":
        """Đếm phải nhất quán và cam kết không vượt trần incentive.

        Trần incentive độc lập hoàn toàn với trần điều chuyển (C-09) nên kiểm ở đây,
        không gộp vào PlanTotals — bù trừ giữa hai trần là điều dự án cấm.
        """
        if self.offers_accepted > self.offers_sent:
            raise ValueError(f"offers_accepted={self.offers_accepted} vượt offers_sent={self.offers_sent}")
        if self.units_gained != self.offers_accepted:
            raise ValueError(
                f"units_gained={self.units_gained} phải bằng offers_accepted={self.offers_accepted} "
                "(mỗi offer đúng 1 unit)"
            )
        if self.incentive_committed > self.incentive_budget_cap:
            raise ValueError(
                f"incentive_committed={self.incentive_committed} vượt incentive_budget_cap={self.incentive_budget_cap}"
            )
        return self


class RelocationPlan(ContractModel):
    """Kế hoạch điều chuyển của một step replay — §4.4."""

    plan_id: PlanId
    # KHÔNG ép về lưới 5 phút: plan sinh ra SAU snapshot (ví dụ §4.4 là 17:06 cho
    # snapshot 17:05), ép lưới sẽ loại đúng dữ liệu hợp lệ.
    created_at: AwareDatetime
    based_on_forecast: ForecastRef
    status: PlanStatus
    # Rỗng là hợp lệ — kịch bản NO_SOLUTION (§5.9).
    moves: tuple[Move, ...]
    residual_gap: tuple[ResidualGap, ...]
    plan_totals: PlanTotals
    metrics_before: Metrics
    metrics_after: Metrics
    activation: ActivationSummary | None = None
    metrics_after_activation: Metrics | None = None
    # Nguồn số liệu DUY NHẤT của Explanation Engine (§5.6): mọi con số trong câu giải
    # thích phải truy được về đây, nên field bắt buộc dù có thể rỗng.
    explanation_data: dict[str, Any]

    @model_validator(mode="after")
    def _check_totals(self) -> "RelocationPlan":
        """`plan_totals` phải là tổng đúng của `moves`.

        Một plan có tổng lệch với danh sách move chính là dạng "số bịa" mà toàn bộ
        thiết kế chống bịa (INV-1/2/3, §5.6) dựng lên để chặn — và nó lọt qua mọi phép
        kiểm từng dòng nếu không đối chiếu ở đây.
        """
        expected_units = sum(move.units_to_move for move in self.moves)
        if self.plan_totals.total_units != expected_units:
            raise ValueError(f"total_units={self.plan_totals.total_units} không bằng Σ moves = {expected_units}")

        expected_cost = sum(move.estimated_cost for move in self.moves)
        if self.plan_totals.total_cost != expected_cost:
            raise ValueError(f"total_cost={self.plan_totals.total_cost} không bằng Σ moves = {expected_cost}")

        expected_km = sum(move.deadhead_km for move in self.moves)
        if not math.isclose(self.plan_totals.total_deadhead_km, expected_km, abs_tol=FLOAT_TOLERANCE):
            raise ValueError(
                f"total_deadhead_km={self.plan_totals.total_deadhead_km} không bằng Σ moves = {expected_km}"
            )
        return self
