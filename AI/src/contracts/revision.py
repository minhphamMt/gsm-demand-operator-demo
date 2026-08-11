"""Entity `RevisionRequest` — SPEC §4.5, docs/design/DATA_CONTRACT.md §2.5.

UI vận hành → Khối B. Đây là cổng người #1 (§5.7): approve/revise/reject một plan.
"""

from typing import Literal

from pydantic import PositiveInt, model_validator

from src.common.ids import PlanId
from src.contracts import ContractModel, ZoneId

RevisionAction = Literal["revise", "approve", "reject"]


class MoveLite(ContractModel):
    """Move do người sửa tay — §4.5.

    Chỉ 4 field: khoảng cách, chi phí và gap là số do hệ thống tính lại sau khi nhận
    bản sửa. Cho người nhập những số đó sẽ đưa số không kiểm chứng vào KPI.
    """

    from_zone: ZoneId
    to_zone: ZoneId
    units_to_move: PositiveInt
    eta_steps: PositiveInt

    @model_validator(mode="after")
    def _check_zones(self) -> "MoveLite":
        if self.from_zone == self.to_zone:
            raise ValueError(f"move rỗng nghĩa: from_zone == to_zone == {self.from_zone}")
        return self


class RevisionRequest(ContractModel):
    """Quyết định của Dispatcher trên một plan — §4.5."""

    plan_id: PlanId
    action: RevisionAction
    # `None` = không gửi field; `()` = gửi danh sách rỗng, tức bỏ hết move. Hai ca này
    # KHÁC nhau nên không được gộp về mặc định `()`.
    revised_moves: tuple[MoveLite, ...] | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _check_action_payload(self) -> "RevisionRequest":
        """`revise` phải kèm danh sách move; `reject` phải kèm lý do.

        Lý do bắt buộc khi từ chối là yêu cầu nghiệp vụ (PRD FR-7): bản ghi History của
        một lần từ chối mà không nói vì sao thì không dùng được để cải thiện vòng sau.
        Ngược lại, tài xế từ chối offer thì KHÔNG bắt buộc lý do (C-08) — hai chỗ khác
        nhau có chủ đích, đừng đồng bộ hoá chúng.
        """
        if self.action == "revise" and self.revised_moves is None:
            raise ValueError("action='revise' bắt buộc có revised_moves (được phép rỗng để bỏ hết move)")

        if self.action == "reject" and not (self.note or "").strip():
            raise ValueError("action='reject' bắt buộc có note không rỗng")
        return self
