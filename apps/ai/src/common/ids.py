"""Định dạng ID dùng chung — docs/design/DATA_CONTRACT.md §2, CLAUDE.md §5.2.

Ở T0.7 module này mới chỉ có PHẦN NHẬN DẠNG (regex + kiểu Annotated) để src/contracts/
kiểm được `plan_id`, `record_id`, `offer_id`, `campaign_id`, `driver_id`. Hàm SINH id
thuộc về task tạo ra chúng (plan_id ở T3, record_id ở T6, offer/campaign_id ở T7) —
khai báo trước sẽ tạo ra một API không đường code nào gọi (CLAUDE.md §4 #2).

Vì sao regex nằm ở src/common/ chứ không ở src/contracts/: ARCHITECTURE.md §6.1 xếp
ids.py ở Tầng 0. Đặt regex trong contracts thì hàm sinh id sau này buộc phải import
ngược từ Tầng 0 lên Tầng 1 — đúng thứ tests/test_architecture.py chặn. Một định dạng
phải có đúng một nơi phát biểu, nếu không bên sinh và bên kiểm sẽ trôi ra khỏi nhau.
"""

from typing import Annotated

from pydantic import StringConstraints

# UUID phiên bản 4 đúng chuẩn: nibble thứ 13 là '4', nibble variant ∈ {8,9,a,b}.
# Chặt tay có chủ đích — `uuid.uuid4()` luôn thoả, nên chuỗi không thoả chắc chắn
# không phải do hệ thống này sinh ra.
PLAN_ID_PATTERN = r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
RECORD_ID_PATTERN = r"^H-[0-9]{6}$"
OFFER_ID_PATTERN = r"^OF-[0-9]{6}$"
CAMPAIGN_ID_PATTERN = r"^ACT-[0-9]{8}-[0-9]{4}-[0-9]{2}$"
DRIVER_ID_PATTERN = r"^DRV-[0-9]{4}$"

PlanId = Annotated[str, StringConstraints(pattern=PLAN_ID_PATTERN)]
RecordId = Annotated[str, StringConstraints(pattern=RECORD_ID_PATTERN)]
OfferId = Annotated[str, StringConstraints(pattern=OFFER_ID_PATTERN)]
CampaignId = Annotated[str, StringConstraints(pattern=CAMPAIGN_ID_PATTERN)]
DriverId = Annotated[str, StringConstraints(pattern=DRIVER_ID_PATTERN)]
