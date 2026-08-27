"""State của đồ thị điều phối — `agent/04-agent-architecture.md` §8, cắt theo ranh giới thật.

Khác bản thiết kế ở một điểm có chủ ý: `execution`, `campaign`, `responses`,
`authorization_result` **không** có ở đây. Đồ thị kết thúc ở trạng thái `PROPOSED`; việc
thực thi, phát offer và hai cổng phê duyệt do NestJS giữ (docs/design/ARCHITECTURE.md §1,
sửa đổi 2026-08-23). Đưa chúng vào state sẽ tạo một bản sao thứ hai của sự thật nghiệp vụ
đang nằm ở Supabase.

Luật ghi state: mỗi node chỉ ghi vào field của mình. Các list tích luỹ (`warnings`,
`tool_calls`) dùng reducer `operator.add` để nhánh chạy song song không ghi đè lẫn nhau —
phép gán cuối cùng sẽ làm mất cảnh báo của nhánh về trước.
"""

import operator
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, TypedDict

from src.orchestration.steps import ForecastSelection, PlanningTargets

AgentStatus = Literal["PENDING", "RUNNING", "DONE", "WARNING", "FAILED"]
RoutingMode = Literal["deterministic", "llm"]
Route = Literal["NEW_INCIDENT", "SUPPRESS"]

# Tên capability hiển thị trên UI. Ba thẻ Forecast/Traffic/Supply là ba capability chạy
# song song bên trong MỘT node `situation_assessment` (`agent/04` §3.2) — thứ tự 1→5 trên
# giao diện là thứ tự hiển thị, không phải số node của đồ thị.
CAPABILITIES: tuple[str, ...] = ("forecast", "traffic", "supply")


@dataclass(frozen=True)
class ToolCall:
    """Một lượt gọi tool, ghi lại để audit và để UI hiện agent đã làm gì.

    Có cả ở chế độ deterministic lẫn chế độ LLM: nhờ vậy so hai chế độ là so hai danh sách
    tool cùng định dạng, không phải so log tự do.
    """

    agent: str
    tool: str
    ok: bool
    detail: str = ""


@dataclass(frozen=True)
class AssessmentContext:
    """Kết quả hợp nhất của ba capability đọc-only.

    Bất biến sau khi `join_assessment` chạy xong — Dispatch và UI chỉ đọc.
    """

    selection: ForecastSelection
    targets: PlanningTargets
    rain_mm_h: dict[int, float]
    idle_supply: dict[int, int]


@dataclass
class CapabilityReport:
    """Trạng thái từng capability, tách khỏi output của nó.

    Cố ý không dùng `None` để vừa nghĩa "chưa chạy" vừa nghĩa "chạy lỗi" (`agent/04` §4.2):
    hai tình huống đó dẫn tới hai cách xử lý khác nhau ở quality gate.
    """

    status: AgentStatus = "PENDING"
    message: str = ""


# Múi giờ vận hành. Contract cấm datetime naive (CLAUDE.md §5.2), và mốc thời gian của agent
# là thứ duy nhất trong run store không suy ra được từ phía client — UI polling 2 giây nên tự
# đo sẽ ra thời lượng của vòng polling, không phải của agent.
VN_TIMEZONE = timezone(timedelta(hours=7))


def now_iso() -> str:
    """Mốc hiện tại dạng ISO-8601 có offset +07:00."""
    return datetime.now(VN_TIMEZONE).isoformat()


@dataclass
class AgentReport:
    """Trạng thái một agent để UI vẽ thẻ, kèm capability con nếu có.

    `started_at` / `finished_at` theo `agent/02-technical-spec.md` §2.5 (`AgentResult`).
    """

    status: AgentStatus = "PENDING"
    message: str = ""
    capabilities: dict[str, CapabilityReport] = field(default_factory=dict)
    started_at: str | None = None
    finished_at: str | None = None


class PipelineState(TypedDict, total=False):
    """State chạy qua đồ thị. `total=False` vì node điền dần theo tiến trình."""

    # ---- Định danh bất biến trong một run ----
    run_id: str
    trace_id: str
    snapshot_id: int | str
    routing_mode: RoutingMode
    policy_version: str
    model_version: str

    # ---- Đầu vào đã validate ----
    request_payload: dict[str, object]

    # ---- Định tuyến ----
    route: Route
    route_reason: str

    # ---- Situation Assessment ----
    assessment: AssessmentContext
    agent_reports: dict[str, AgentReport]

    # ---- Dispatch / Optimization ----
    plan_set: dict[str, object]
    recommended_plan_id: str
    quality_ok: bool
    quality_reason: str

    # ---- Explanation ----
    explanation: dict[str, object]

    # ---- Tích luỹ: reducer, không ghi đè ----
    warnings: Annotated[list[dict[str, object]], operator.add]
    tool_calls: Annotated[list[ToolCall], operator.add]

    # ---- Kết quả cuối, đúng shape của POST /decisions ----
    decision: dict[str, object]


def initial_agent_reports() -> dict[str, AgentReport]:
    """Trạng thái khởi điểm của 5 thẻ agent trên UI (`agent/03` §2)."""
    return {
        "situation_assessment": AgentReport(
            capabilities={name: CapabilityReport() for name in CAPABILITIES},
        ),
        "dispatch": AgentReport(),
        "optimization": AgentReport(),
        "explanation": AgentReport(),
    }
