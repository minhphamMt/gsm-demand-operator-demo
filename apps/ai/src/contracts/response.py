"""Entity `DriverResponse` — SPEC §4.9, docs/design/DATA_CONTRACT.md §2.9.

Driver App → Khối C. Đây là đầu vào của vòng phản hồi đóng FR-13.
"""

from typing import Literal

from pydantic import AwareDatetime

from src.common.ids import DriverId, OfferId
from src.contracts import ContractModel

# `expired` KHÔNG hợp lệ ở input: hết hạn là việc hệ thống tự sinh khi quá `expires_at`,
# không phải hành động của tài xế (§4.9). Nhận `expired` từ Driver App sẽ tạo ra một
# bản ghi History quy trách nhiệm cho người không làm gì cả.
DriverDecision = Literal["accept", "decline"]

# Danh sách chọn nhanh — KHÔNG bắt buộc (C-08: không tạo ma sát khi từ chối).
DeclineReason = Literal["Quá xa", "Sắp hết ca", "Thưởng chưa đủ", "Đang bận", "Khác"]


class DriverResponse(ContractModel):
    """Phản hồi của tài xế trên một offer — §4.9."""

    offer_id: OfferId
    driver_id: DriverId
    decision: DriverDecision
    decline_reason: DeclineReason | None = None
    # Dùng tính `response_latency_sec` cho KPI "quyết định ≤ 20 giây".
    responded_at: AwareDatetime
