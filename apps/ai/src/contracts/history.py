"""Entity `HistoryRecord` — SPEC §4.6, docs/design/DATA_CONTRACT.md §2.6.

Append-only. HAI biến thể phân biệt bằng `record_type`. 100% quyết định (plan và phản
hồi tài xế) phải đi qua đây — §3.2 #7 cấm mọi state ẩn.
"""

from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    Field,
    NonNegativeInt,
    StringConstraints,
    TypeAdapter,
    model_validator,
)

from src.common.ids import CampaignId, DriverId, OfferId, PlanId, RecordId
from src.contracts import ContractModel, StepAlignedDatetime
from src.contracts.plan import Metrics, RelocationPlan
from src.contracts.response import DeclineReason

# `"{t}_h{horizon}@{model_version}"`, ví dụ "2026-08-02T17:05:00+07:00_h15@lgbm_v2_rainpeak".
ForecastRefWithVersion = Annotated[str, StringConstraints(pattern=r"^.+_h(5|10|15)@.+$")]

PlanDecision = Literal["approved", "rejected", "revised"]

# `expired` do HỆ THỐNG sinh khi quá `expires_at`, không phải hành động tài xế (§4.6) —
# nên tập này rộng hơn `DriverResponse.decision` ở §4.9, có chủ đích.
DriverResponseDecision = Literal["accept", "decline", "expired"]

ResponseSource = Literal["human_demo", "simulated_model"]

AcceptRateSource = Literal["simulated_model", "human_demo", "mixed"]


class HistoryActivationSummary(ContractModel):
    """Kết quả chiến dịch huy động đã đóng — §4.6.

    Khác `plan.ActivationSummary` (§4.4, ảnh chụp lúc phát hành): ở đây có thêm
    `offers_declined`/`offers_expired`, tiền ĐÃ TRẢ thay vì tiền cam kết, và
    `accept_rate_source`. Hai object cố ý tách nhau vì chúng đo hai thời điểm khác nhau.
    """

    campaign_id: CampaignId
    offers_sent: NonNegativeInt
    offers_accepted: NonNegativeInt
    offers_declined: NonNegativeInt
    offers_expired: NonNegativeInt
    units_gained: NonNegativeInt
    incentive_paid: NonNegativeInt
    accept_rate: float = Field(ge=0.0, le=1.0)
    # BẮT BUỘC, không mặc định (C-07): accept rate do mô hình giả định sinh ra không
    # được trình bày ngang hàng với số do người thật bấm trong UAT. Thiếu field này thì
    # bảng kết quả cuối kỳ không còn phân biệt được hai loại số.
    accept_rate_source: AcceptRateSource

    @model_validator(mode="after")
    def _check_counts(self) -> "HistoryActivationSummary":
        """Số offer đã kết thúc không vượt số đã gửi; mỗi offer nhận đúng 1 unit.

        Dùng `≤` chứ không `==`: lúc ghi bản ghi vẫn có thể còn offer đang mở, hoặc đã
        bị `Cancelled` khi gap được bù đủ (§4.8) — cả hai đều không thuộc ba nhóm dưới.
        """
        resolved = self.offers_accepted + self.offers_declined + self.offers_expired
        if resolved > self.offers_sent:
            raise ValueError(
                f"{self.campaign_id}: accepted+declined+expired={resolved} vượt offers_sent={self.offers_sent}"
            )
        if self.units_gained != self.offers_accepted:
            raise ValueError(
                f"{self.campaign_id}: units_gained={self.units_gained} phải bằng offers_accepted={self.offers_accepted}"
            )
        return self


class PlanDecisionRecord(ContractModel):
    """Biến thể A — một quyết định của Dispatcher trên một plan (§4.6)."""

    record_id: RecordId
    record_type: Literal["plan_decision"]
    snapshot_t: StepAlignedDatetime
    forecast_ref: ForecastRefWithVersion
    # Bản ĐẦY ĐỦ tại thời điểm quyết định, không phải con trỏ tới plan hiện hành: plan
    # còn sửa được sau đó, mà bản ghi lịch sử thì không được đổi nghĩa (§2.6).
    plan: RelocationPlan
    explanation_text: str
    decision: PlanDecision
    # FR-7: lưu kèm NGƯỜI thực hiện. Từ header `X-Operator-Id`.
    decided_by: str = Field(min_length=1)
    decided_at: AwareDatetime
    note: str | None = None
    metrics_before: Metrics
    metrics_after: Metrics
    metrics_after_activation: Metrics | None = None
    activation_summary: HistoryActivationSummary | None = None

    @model_validator(mode="after")
    def _check_note(self) -> "PlanDecisionRecord":
        """Từ chối phải kèm lý do — đối xứng với `RevisionRequest` §4.5.

        Kiểm lại ở tầng History chứ không tin tầng trên đã kiểm: đây là bản ghi cuối
        cùng còn lại sau khi mọi thứ khác bị xoá, nên nó phải tự đứng vững.
        """
        if self.decision == "rejected" and not (self.note or "").strip():
            raise ValueError(f"{self.record_id}: decision='rejected' bắt buộc có note không rỗng")
        return self


class DriverResponseRecord(ContractModel):
    """Biến thể B — một phản hồi tài xế (§4.6).

    Mỗi phản hồi là MỘT bản ghi riêng, không gộp theo chiến dịch: gộp lại là mất thứ tự
    thời gian và không đếm lại được `accept_rate` từ dữ liệu gốc.
    """

    record_id: RecordId
    record_type: Literal["driver_response"]
    plan_id: PlanId
    campaign_id: CampaignId
    offer_id: OfferId
    driver_id: DriverId
    decision: DriverResponseDecision
    # KHÔNG bắt buộc (C-08) — hỏi lý do là tạo ma sát khi từ chối.
    decline_reason: DeclineReason | None = None
    responded_at: AwareDatetime
    # `= responded_at − offer.created_at`; phục vụ KPI quyết định ≤ 20 giây.
    response_latency_sec: NonNegativeInt
    source: ResponseSource


# Biến thể `system_reset` có trong enum §2.6 nhưng KHÔNG có bảng field nào mô tả nó,
# nên không được cài ở đây — bịa schema cho nó là tự nghĩ ra contract (CLAUDE.md §4 #2).
HistoryRecord = Annotated[
    PlanDecisionRecord | DriverResponseRecord,
    Field(discriminator="record_type"),
]

# Dùng để parse một bản ghi chưa biết biến thể: `HistoryRecordAdapter.validate_python(raw)`.
HistoryRecordAdapter: TypeAdapter[PlanDecisionRecord | DriverResponseRecord] = TypeAdapter(HistoryRecord)
