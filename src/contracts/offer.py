"""Entity `ActivationOffer` — SPEC §4.8, docs/design/DATA_CONTRACT.md §2.8.

Activation Engine (Khối C) → Driver App. Object này mang một CAM KẾT TIỀN với người
ngoài hãng, nên mọi số trong nó là đã hứa: không tính lại, không tra ngược về sau.
"""

from datetime import timedelta
from typing import Literal

from pydantic import (
    AwareDatetime,
    Field,
    NonNegativeFloat,
    NonNegativeInt,
    ValidationInfo,
    model_validator,
)

from src.common.ids import CampaignId, DriverId, OfferId, PlanId
from src.common.policy import policy_from_context
from src.contracts import ContractModel, ZoneId

# Chỉ hai trạng thái, KHÔNG bao giờ `online_busy` (§4.8): tài xế đang chở khách bị loại
# khỏi tập ứng viên trước khi có offer nào được tạo.
DriverStatusAtOffer = Literal["online_idle", "offline"]

OfferStatus = Literal["Sent", "Accepted", "Declined", "Expired", "Cancelled"]

# Đơn vị làm tròn tiền thưởng (§4.8). Không phải ngưỡng vận hành nên không nằm trong
# 19 key policy: đây là đơn vị mệnh giá hiển thị cho tài xế, không phải núm để tune.
INCENTIVE_ROUNDING_VND = 1000


class ActivationOffer(ContractModel):
    """Một lời mời huy động: 1 tài xế × 1 zone đích — §4.8."""

    offer_id: OfferId
    # Gom nhóm offer cùng một plan để đếm accept rate theo chiến dịch.
    campaign_id: CampaignId
    plan_id: PlanId
    driver_id: DriverId
    # ĐÓNG BĂNG tại thời điểm phát hành, không tra lại `driver_states` lúc tài xế bấm
    # Nhận: offer sống 2 step replay, trạng thái đổi được trong khoảng đó và tra lại sẽ
    # phá tính deterministic (§3.2 #6). Đây cũng là field quyết định bước 4 của §4.9 —
    # `offline` là cung mới, `online_idle` là cung dịch chuyển.
    driver_status_at_offer: DriverStatusAtOffer
    target_zone: ZoneId
    target_zone_name: str = Field(min_length=1)
    # `current_zone` nếu online_idle, `home_zone` nếu offline (§4.8). Được phép trùng
    # `target_zone`: tài xế offline ngay trong zone thiếu xe vẫn là ứng viên hợp lệ.
    from_zone: ZoneId
    distance_km: NonNegativeFloat
    eta_min: NonNegativeInt
    incentive_amount: NonNegativeInt
    # Sinh bởi Explanation Lớp 1 (template). CẤM LLM viết field này — văn bản đi kèm
    # cam kết tiền thưởng (§5.6, CLAUDE.md §10.1 #5).
    reason_text: str = Field(min_length=1)
    created_at: AwareDatetime
    expires_at: AwareDatetime
    status: OfferStatus

    @model_validator(mode="after")
    def _check_offer(self, info: ValidationInfo) -> "ActivationOffer":
        """Ràng buộc tự kiểm được, cộng các ràng buộc theo policy khi context có truyền.

        Vì sao ràng buộc theo ngưỡng chỉ chạy khi có context: offer được lưu lại và đọc
        lại về sau, mà `activation_radius_km` có thể đã đổi giữa chừng. So với ngưỡng
        hiện hành sẽ làm bản ghi cũ hết parse được — mất audit trail (§3.2 #7). Nơi PHÁT
        HÀNH offer (src/activation/engine.py) là nơi bắt buộc truyền policy vào.
        """
        if self.expires_at <= self.created_at:
            raise ValueError(
                f"{self.offer_id}: expires_at={self.expires_at.isoformat()} phải sau "
                f"created_at={self.created_at.isoformat()}"
            )

        if self.incentive_amount % INCENTIVE_ROUNDING_VND:
            raise ValueError(
                f"{self.offer_id}: incentive_amount={self.incentive_amount} phải làm tròn "
                f"bội số {INCENTIVE_ROUNDING_VND}đ"
            )

        policy = policy_from_context(info.context)
        if policy is None:
            return self

        radius = policy.rules.activation_radius_km
        if self.distance_km > radius:
            raise ValueError(f"{self.offer_id}: distance_km={self.distance_km} vượt activation_radius_km={radius}")

        ceiling = policy.rules.incentive_max_per_offer
        if self.incentive_amount > ceiling:
            raise ValueError(
                f"{self.offer_id}: incentive_amount={self.incentive_amount} vượt incentive_max_per_offer={ceiling}"
            )

        expected_expiry = self.created_at + timedelta(minutes=policy.rules.offer_ttl_minutes)
        if self.expires_at != expected_expiry:
            raise ValueError(
                f"{self.offer_id}: expires_at phải bằng created_at + offer_ttl_minutes "
                f"= {expected_expiry.isoformat()}, nhận {self.expires_at.isoformat()}"
            )
        return self
