"""Hysteresis chống nhấp nháy hotspot — §4.3, AGENT_WORKFLOW §3.3, task T2.

Bất đối xứng 2 vào / 3 ra là **có chủ đích** (AGENT_WORKFLOW §3.3): vào nhanh để không
bỏ lỡ thiếu hụt thật, ra chậm để không rút xe khỏi zone vừa mới hết căng. Đảo hai số
này làm mất đúng cái nó sinh ra để chống.

Máy trạng thái viết dưới dạng **hàm thuần**: `advance(state, raw) -> (state mới, quyết định)`.
Không có biến toàn cục khả biến (CLAUDE.md §5.3 #3) và không có trạng thái ẩn (§3 #7) —
`replay.engine` giữ giá trị trạng thái và tự truyền qua từng step, `POST /replay/reset`
chỉ việc vứt nó đi và gọi lại `initial_state()`.

Vì sao đếm streak thay vì nhìn 2–3 phần tử cuối của lịch sử: lịch sử phải lưu bao nhiêu
step là một câu hỏi không có đáp án đúng, còn hai bộ đếm thì đủ và luôn có kích thước
cố định.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

# AGENT_WORKFLOW §3.3 — hằng số của CƠ CHẾ, không phải ngưỡng vận hành: chúng không nằm
# trong 19 key của config/policy.yaml và không được thêm vào đó mà chưa hỏi (CLAUDE.md §11.2).
ENTER_STEPS = 2
EXIT_STEPS = 3


@dataclass(frozen=True)
class ZoneState:
    """Trạng thái hysteresis của một zone.

    Hai bộ đếm loại trừ nhau: một step thỏa điều kiện thì `miss_streak` về 0 và ngược lại.
    Giữ cả hai thay vì một số có dấu để đọc log không phải suy ra dấu nghĩa là gì.
    """

    active: bool = False
    meet_streak: int = 0
    miss_streak: int = 0


@dataclass(frozen=True)
class HysteresisState:
    """Trạng thái của toàn bộ zone tại một step.

    Zone chưa từng xuất hiện coi như `ZoneState()` — khởi động nguội đúng nghĩa: chưa có
    lịch sử thì chưa có zone nào là hotspot.
    """

    zones: Mapping[int, ZoneState] = field(default_factory=dict)

    def is_active(self, zone_id: int) -> bool:
        return self.zones.get(zone_id, ZoneState()).active

    def active_zones(self) -> tuple[int, ...]:
        return tuple(sorted(zone_id for zone_id, state in self.zones.items() if state.active))


def initial_state() -> HysteresisState:
    """Trạng thái khởi động nguội — cũng là trạng thái sau `POST /replay/reset` (§3.3)."""
    return HysteresisState()


def advance(
    state: HysteresisState,
    raw: Mapping[int, bool],
    *,
    enter_steps: int = ENTER_STEPS,
    exit_steps: int = EXIT_STEPS,
) -> tuple[HysteresisState, dict[int, bool]]:
    """Một step: điều kiện thô của từng zone → trạng thái mới + quyết định `is_hotspot`.

    Trả về trạng thái MỚI chứ không sửa `state` tại chỗ. Nơi gọi bắt buộc dùng giá trị
    trả về; giữ lại bản cũ sẽ làm mọi step tính trên cùng một điểm xuất phát và hysteresis
    không bao giờ tích đủ streak.

    `enter_steps`/`exit_steps` là tham số để test kiểm được biên, không phải để mỗi nơi
    tự chọn một cặp số — mặc định là cặp đã chốt ở AGENT_WORKFLOW §3.3.
    """
    zones = dict(state.zones)
    decided: dict[int, bool] = {}
    for zone_id, meets in raw.items():
        updated = _step_zone(
            zones.get(zone_id, ZoneState()),
            meets,
            enter_steps=enter_steps,
            exit_steps=exit_steps,
        )
        zones[zone_id] = updated
        decided[zone_id] = updated.active
    return HysteresisState(zones=zones), decided


def _step_zone(current: ZoneState, meets: bool, *, enter_steps: int, exit_steps: int) -> ZoneState:
    """Chuyển trạng thái của MỘT zone.

    Streak được reset về 0 ngay khi đổi trạng thái: nếu không, một zone vừa vào hotspot
    vẫn mang `meet_streak` cũ và lần ra/vào kế tiếp sẽ lệch nhịp đếm.
    """
    if meets:
        meet_streak = current.meet_streak + 1
        if current.active:
            return ZoneState(active=True, meet_streak=meet_streak, miss_streak=0)
        if meet_streak >= enter_steps:
            return ZoneState(active=True)
        return ZoneState(active=False, meet_streak=meet_streak, miss_streak=0)

    miss_streak = current.miss_streak + 1
    if not current.active:
        return ZoneState(active=False, meet_streak=0, miss_streak=miss_streak)
    if miss_streak >= exit_steps:
        return ZoneState(active=False)
    return ZoneState(active=True, meet_streak=0, miss_streak=miss_streak)


def count_transitions(sequence: Sequence[bool]) -> int:
    """Số lần chuỗi đổi giá trị — thước đo "nhấp nháy" của T2 AC #2.

    Đặt ở đây thay vì trong test để báo cáo `eval_hotspot.py` và test dùng CÙNG một định
    nghĩa: "giảm số lần đổi trạng thái" chỉ có nghĩa khi hai bên đếm giống nhau.
    """
    values = list(sequence)
    return sum(1 for previous, current in zip(values[:-1], values[1:], strict=True) if previous != current)
