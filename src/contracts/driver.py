"""Entity `Driver` — SPEC §4.7, docs/design/DATA_CONTRACT.md §2.7.

Config tĩnh `config/driver_registry.json`. KHÔNG chứa dữ liệu cá nhân thật (C-03):
`display_name` là nhãn giả, không SĐT, không email, không biển số.
"""

from typing import Annotated, Literal

from pydantic import AwareDatetime, StringConstraints, model_validator

from src.common.ids import DriverId
from src.contracts import ContractModel, ZoneId

DriverStatus = Literal["online_idle", "online_busy", "offline"]

# Nhãn giả bắt buộc dạng "Tài xế {n}" (§8 #4). Ràng buộc bằng regex chứ không bằng
# quy ước: một cái tên người thật lọt vào registry sẽ không có dấu hiệu nào lộ ra khi
# đọc code, và đó đúng là loại nhầm lẫn `is_demo_account` sinh ra để chặn.
DISPLAY_NAME_PATTERN = r"^Tài xế [0-9]+$"
DisplayName = Annotated[str, StringConstraints(pattern=DISPLAY_NAME_PATTERN)]


class Driver(ContractModel):
    """Một tài xế demo — §4.7.

    Danh sách field dưới đây là ĐẦY ĐỦ. Không có chỗ nào ghi nhận tỷ lệ nhận, thứ hạng
    hay điểm uy tín của tài xế — C-08 cấm; xem danh sách tên field bị cấm ở CLAUDE.md §8
    #6. Sự vắng mặt đó là ràng buộc an toàn, không phải nợ schema chờ ai đó bổ sung.
    """

    driver_id: DriverId
    display_name: DisplayName
    # Dùng làm `from_zone` khi tài xế `offline` — lúc đó hệ thống không biết vị trí thật.
    home_zone: ZoneId
    current_zone: ZoneId
    status: DriverStatus
    # `null` là hợp lệ và hiện là mặc định trên đĩa: chưa có lịch ca nào được Data/BA
    # cấp, xem data/driver_states/README.md §5.
    shift_end_ts: AwareDatetime | None = None
    is_demo_account: bool

    @model_validator(mode="after")
    def _check_demo_account(self) -> "Driver":
        """`is_demo_account` phải là `true` — C-03, §2.7.

        Validator từ chối `false` thay vì chỉ cảnh báo: đây là chốt chặn duy nhất giữa
        "hệ thống mô phỏng" và "hệ thống gửi tiền cho người thật". Nới nó ra thì mọi
        ràng buộc an toàn còn lại chỉ còn là quy ước.
        """
        if not self.is_demo_account:
            raise ValueError(f"{self.driver_id}: is_demo_account phải là true ở MVP (C-03)")
        return self
