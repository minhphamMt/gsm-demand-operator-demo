"""9 message contract §4.1–4.9 dưới dạng Pydantic v2 — task T0.7.

Một file cho mỗi entity, tên file theo docs/design/DATA_CONTRACT.md §2:
    snapshot.py forecast.py hotspot.py plan.py revision.py
    history.py driver.py offer.py response.py

Đây là ranh giới đông cứng của hệ thống: contract khóa cuối W2 (I-08). Sau mốc đó
chỉ được THÊM field optional — đổi tên, đổi kiểu hay bỏ field làm hỏng mọi bản ghi
đã sinh ra trước đó và mọi số KPI đã công bố.

Chỉ được import từ src.common (docs/design/ARCHITECTURE.md §6.2).

---

Phần dưới là các nguyên thủy DÙNG CHUNG cho cả 9 entity. Chúng nằm ở đây thay vì ở
một file thứ 10 vì T0.7 AC #1 chốt `src/contracts/` có đúng 9 file entity; và nằm ở đây
thay vì ở file entity nào đó vì "lưới 30 zone" và "mốc 5 phút" là quy ước của cả tầng
contract (DATA_CONTRACT §1), không thuộc riêng entity nào.

`__init__.py` KHÔNG import 9 module con: chúng import ngược lên đây, thêm chiều nữa là
vòng tròn. Nơi dùng import thẳng `from src.contracts.snapshot import Snapshot`.
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field

# 30 zone cố định, đánh số 1–30 (DATA_CONTRACT §1 — không phải string, không 0-index).
# KHÔNG phải ngưỡng vận hành nên không nằm trong 19 key policy.yaml: đổi số zone là đổi
# bộ dữ liệu A1 và mọi model, không phải xoay một núm cấu hình.
ZONE_ID_MIN = 1
ZONE_ID_MAX = 30
ZONE_COUNT = 30

# Bước thời gian replay, `config/generator.yaml → time.step_minutes`.
STEP_MINUTES = 5


class ContractModel(BaseModel):
    """Nền chung của mọi entity §4.1–4.9.

    `extra="forbid"`: field lạ là lỗi, không phải dữ liệu thừa vô hại. Gõ nhầm tên field
    mà im lặng bỏ qua sẽ cho ra một message thiếu nội dung nhưng vẫn "hợp lệ".

    `frozen=True`: message đi qua ranh giới module và được lưu nguyên vẹn vào History
    (append-only, §3.2 #7). Sửa tại chỗ một object đã ghi nhận chính là "state ẩn" mà
    kiến trúc cấm. Cần bản khác thì tạo bản mới bằng `model_copy(update=...)`.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)


def _reject_off_grid(value: datetime) -> datetime:
    """Chặn mốc thời gian không rơi đúng bước 5 phút.

    Replay chạy theo lưới `ts_bucket`; một mốc lệch lưới sẽ không join được với snapshot
    A1 nào và lặng lẽ biến thành dòng rỗng ở mọi phép tính sau đó.
    """
    if value.minute % STEP_MINUTES or value.second or value.microsecond:
        raise ValueError(f"phải rơi đúng bước {STEP_MINUTES} phút (mm:00), nhận {value.isoformat()}")
    return value


# Datetime bắt buộc có offset (CLAUDE.md §5.2 cấm naive datetime) VÀ nằm trên lưới 5 phút.
StepAlignedDatetime = Annotated[AwareDatetime, AfterValidator(_reject_off_grid)]

ZoneId = Annotated[int, Field(ge=ZONE_ID_MIN, le=ZONE_ID_MAX)]


def ensure_full_zone_coverage(zone_ids: Sequence[int]) -> None:
    """Kiểm `zones` phủ đủ 30 zone, không trùng, không thiếu — T0.7 AC #4.

    Không chỉ đếm `len == 30`: một message có 30 phần tử nhưng lặp zone 7 hai lần và
    thiếu zone 19 vẫn qua được phép đếm, rồi zone 19 biến mất khỏi mọi bảng KPI mà
    không dòng log nào báo.
    """
    if len(zone_ids) != ZONE_COUNT:
        raise ValueError(f"phải có đúng {ZONE_COUNT} zone, nhận {len(zone_ids)}")

    seen = set(zone_ids)
    missing = sorted(set(range(ZONE_ID_MIN, ZONE_ID_MAX + 1)) - seen)
    if missing:
        duplicated = sorted(zone_id for zone_id in seen if zone_ids.count(zone_id) > 1)
        raise ValueError(f"zone_id phải phủ đủ {ZONE_ID_MIN}–{ZONE_ID_MAX}: thiếu {missing}, trùng {duplicated}")
