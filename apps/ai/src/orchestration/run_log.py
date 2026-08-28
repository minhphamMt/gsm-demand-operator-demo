"""Nhật ký sự kiện của một lượt chạy — kế hoạch `agent/08-interaction-log-plan.md` §3.1.

Module này tồn tại để trả lời một câu hỏi duy nhất: *pipeline đang làm gì, ngay lúc này*.
Trước đó `GET /runs/{id}` chỉ có hai trạng thái RUNNING và DONE, nên UI nhảy thẳng từ "đang
chạy" sang "xong hết" mà không có gì ở giữa.

Ba quyết định định hình toàn bộ file, ghi lại vì chúng dễ bị "sửa cho gọn" thành sai:

1. **Sự kiện không đi vào `PipelineState`.** Nó chảy ra ngoài qua một sink truyền từ route.
   Vào state là chạm `_render`, chạm reducer, và rước rủi ro parity không cần thiết (§2.3).
2. **`seq` do log tự gán, producer không đặt được.** Vì thế `EventSink` nhận *nội dung* chứ
   không nhận `RunEvent` dựng sẵn — "seq là thẩm quyền sắp xếp duy nhất" trở thành ràng
   buộc của kiểu chứ không phải một lời dặn trong tài liệu. `at` là đồng hồ tường: trùng ở
   mức mili-giây và lùi được khi NTP chỉnh giờ, nên không bao giờ dùng nó để sắp xếp.
3. **Ghi log không bao giờ được giết lượt chạy.** `RunLog` tự nó không ném; sink lạ thì bọc
   bằng `guarded()` đúng một lần ở biên. Một cơ chế ghi log mà làm hỏng được kết quả thì tệ
   hơn hẳn việc không có log.
"""

import logging
import threading
from dataclasses import dataclass
from typing import Literal, Protocol

from src.orchestration.state import now_iso

logger = logging.getLogger(__name__)

EventKind = Literal[
    "run_started",
    "agent_started",
    "agent_finished",
    "tool_started",
    "tool_finished",
    "tool_denied",
    "narration",
    "warning",
    "run_finished",
    # Đồ thị dừng ở PROPOSED và cổng duyệt là của con người — dòng này nói ra điều đó thay vì
    # để màn hình im lặng (Chặng 6). Nó KHÔNG khoá gì cả: đồ thị đã chạy xong khi nó được phát.
    "awaiting_approval",
]

# Nguồn của dòng chữ, không phải nguồn của con số. `llm` được tô màu khác trên UI kèm chú
# giải, vì một câu do model viết và một câu dựng từ template không đáng tin ngang nhau.
EventSource = Literal["deterministic", "llm", "system"]

# Trần số dòng một run được giữ. Một run deterministic phát ~35 dòng, chế độ LLM ~120; trần
# này chỉ chạm tới khi có gì đó lặp bất thường — và đúng lúc đó ta muốn thấy dòng báo cắt.
MAX_EVENTS_PER_RUN = 500

TRUNCATED_CODE = "RUN_LOG_TRUNCATED"


@dataclass(frozen=True)
class RunEvent:
    """Một dòng nhật ký. Bất biến: đã ghi thì không sửa, chỉ ghi thêm."""

    seq: int
    at: str
    kind: EventKind
    actor: str
    text: str
    source: EventSource
    tool: str | None = None
    ok: bool | None = None
    code: str | None = None


class EventSink(Protocol):
    """Nơi nhận sự kiện.

    Producer mô tả *chuyện gì xảy ra*; `seq` và `at` do bên nhận gán. Nhờ vậy không có
    đường nào để một node tự đánh số dòng của mình.
    """

    def __call__(
        self,
        kind: EventKind,
        actor: str,
        text: str,
        *,
        source: EventSource = "deterministic",
        tool: str | None = None,
        ok: bool | None = None,
        code: str | None = None,
    ) -> None: ...


def _null_sink(
    kind: EventKind,
    actor: str,
    text: str,
    *,
    source: EventSource = "deterministic",
    tool: str | None = None,
    ok: bool | None = None,
    code: str | None = None,
) -> None:
    """Nuốt sự kiện, không làm gì.

    Mặc định là một callable thật chứ không phải `None`: bản không nhánh khiến khẳng định
    "log không thể đổi luồng điều khiển" nhìn một cái là thấy, thay vì phải rà từng
    `if emit is not None` để tin. Quên một `if` là `AttributeError` lúc chạy thật; ở đây
    không có nhánh nào để quên.
    """


NULL_SINK: EventSink = _null_sink


def guarded(sink: EventSink) -> EventSink:
    """Bọc sink lạ để lỗi khi ghi log không leo ra luồng chính.

    Bọc đúng một lần ở biên (`run_pipeline`), không phải try/except ở từng chỗ phát — cách
    kia đưa nhánh trở lại đúng chỗ vừa dọn sạch ở `_null_sink`.
    """

    def _safe(
        kind: EventKind,
        actor: str,
        text: str,
        *,
        source: EventSource = "deterministic",
        tool: str | None = None,
        ok: bool | None = None,
        code: str | None = None,
    ) -> None:
        try:
            sink(kind, actor, text, source=source, tool=tool, ok=ok, code=code)
        except Exception:  # noqa: BLE001 - sink hỏng là chuyện của log, không phải của run.
            logger.exception("Sink nhật ký ném lỗi; bỏ qua để lượt chạy đi tiếp.")

    return _safe


class RunLog:
    """Danh sách sự kiện có khóa, dùng chung giữa thread chạy pipeline và thread phục vụ GET.

    `threading.Lock` là bắt buộc chứ không phải trang trí: `get_run` khai báo `def` nên
    FastAPI chạy nó trong threadpool, còn `_execute` chạy trong worker của
    `asyncio.to_thread` — hai thread thật sự khác nhau (§2.4).
    """

    def __init__(self, *, max_events: int = MAX_EVENTS_PER_RUN) -> None:
        self._lock = threading.Lock()
        self._events: list[RunEvent] = []
        self._seq = 0
        self._max_events = max(2, max_events)
        self._truncated = False

    def append(
        self,
        kind: EventKind,
        actor: str,
        text: str,
        *,
        source: EventSource = "deterministic",
        tool: str | None = None,
        ok: bool | None = None,
        code: str | None = None,
    ) -> None:
        """Ghi một dòng. Khớp `EventSink`, nên bản thân bound method này là một sink.

        Chạm trần thì ghi **một dòng báo bị cắt** rồi ngưng, không bỏ âm thầm (CLAUDE.md
        §9 #3): một nhật ký tự cụt mà không nói gì sẽ bị đọc thành "pipeline dừng ở đây".
        """
        with self._lock:
            if self._truncated:
                return
            if len(self._events) >= self._max_events - 1:
                self._truncated = True
                self._append_locked(
                    kind="warning",
                    actor="graph",
                    text=f"Nhật ký vượt trần {self._max_events} dòng; phần sau không được ghi lại.",
                    source="system",
                    tool=None,
                    ok=None,
                    code=TRUNCATED_CODE,
                )
                return
            self._append_locked(kind=kind, actor=actor, text=text, source=source, tool=tool, ok=ok, code=code)

    def _append_locked(
        self,
        *,
        kind: EventKind,
        actor: str,
        text: str,
        source: EventSource,
        tool: str | None,
        ok: bool | None,
        code: str | None,
    ) -> None:
        """Ghi thật. Chỉ gọi khi đã giữ khóa — `seq` tăng và append phải cùng một thao tác."""
        self._seq += 1
        self._events.append(
            RunEvent(
                seq=self._seq,
                at=now_iso(),
                kind=kind,
                actor=actor,
                text=text,
                source=source,
                tool=tool,
                ok=ok,
                code=code,
            )
        )

    def snapshot(self) -> list[RunEvent]:
        """Bản sao danh sách, lấy dưới khóa.

        Trả bản sao chứ không trả list thật: bên gọi lặp qua nó ở thread khác trong khi
        pipeline vẫn đang append, và lặp trên list đang bị sửa là lỗi lúc chạy.
        """
        with self._lock:
            return list(self._events)

    def __len__(self) -> int:
        with self._lock:
            return len(self._events)
