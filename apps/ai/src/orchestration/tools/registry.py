"""Tool registry và allowlist theo agent — `agent/04-agent-architecture.md` §4.3–4.4.

Hai luật được ép bằng code, không bằng lời dặn trong prompt:

1. **Agent chỉ gọi tool trong allowlist của mình.** Gọi ngoài allowlist ném lỗi, không phải
   cảnh báo — một agent gọi được tool ngoài phạm vi nghĩa là ranh giới quyền hạn chỉ tồn
   tại trên giấy.
2. **Tool có side effect không nằm trong allowlist nào.** `execute_relocation` và
   `issue_offers` không được đăng ký ở đây; chúng chạy ở NestJS sau hai cổng phê duyệt
   (CLAUDE.md §11.1). Prompt injection vì thế không mở được đường tới tiền hay tới xe.

Mọi tool trả về `dict` đã serialize được và có khoá `status` — không bao giờ trả `None` hay
dict rỗng (C-06, CLAUDE.md §10.1 #2).
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

# Tên agent dùng chung giữa registry, runner và state.
AGENT_ASSESSMENT = "situation_assessment"
AGENT_DISPATCH = "dispatch"
AGENT_EXPLANATION = "explanation"


class ToolPermissionError(Exception):
    """Agent gọi tool ngoài allowlist. Là lỗi lập trình/định tuyến, không phải lỗi dữ liệu."""


@dataclass(frozen=True)
class ToolSpec:
    """Một tool phơi ra cho LLM: mô tả + JSON schema tham số + hàm thực thi."""

    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., dict[str, Any]]

    def as_openai_schema(self) -> dict[str, Any]:
        """Định dạng `tools[]` của giao thức OpenAI chat completions."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    """Giữ tool và allowlist. Một instance cho một run — không có state toàn cục khả biến."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}
        self._allowlist: dict[str, frozenset[str]] = {}

    def register(self, spec: ToolSpec) -> None:
        if spec.name in self._tools:
            raise ValueError(f"Tool {spec.name!r} đã được đăng ký.")
        self._tools[spec.name] = spec

    def allow(self, agent: str, tool_names: frozenset[str]) -> None:
        unknown = tool_names - set(self._tools)
        if unknown:
            raise ValueError(f"Allowlist của {agent!r} nhắc tool chưa đăng ký: {sorted(unknown)}")
        self._allowlist[agent] = tool_names

    def schemas_for(self, agent: str) -> list[dict[str, Any]]:
        """Schema của đúng những tool agent này được thấy.

        Agent không được thấy tool ngoài phạm vi: che ở tầng schema khiến LLM không có cơ
        hội thử, còn kiểm tra ở `invoke` chặn trường hợp nó vẫn đoán tên.
        """
        return [self._tools[name].as_openai_schema() for name in sorted(self._allowlist.get(agent, frozenset()))]

    def invoke(self, agent: str, tool_name: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
        """Thực thi tool sau khi kiểm quyền. Lỗi của tool trở thành kết quả, không phải exception.

        Vì sao nuốt lỗi của handler: vòng lặp tool-use phải cho LLM biết tool hỏng để nó
        chuyển hướng (ví dụ sang adapter fallback). Ném ra ngoài sẽ giết cả run vì một
        capability lỗi, trái nguyên tắc suy giảm có kiểm soát (`agent/04` A4).
        """
        allowed = self._allowlist.get(agent, frozenset())
        if tool_name not in allowed:
            raise ToolPermissionError(
                f"Agent {agent!r} không được gọi tool {tool_name!r}. Allowlist: {sorted(allowed)}"
            )
        spec = self._tools[tool_name]
        try:
            result = spec.handler(**arguments)
        except Exception as error:  # noqa: BLE001 - lỗi tool là dữ liệu cho LLM, không phải sự cố của run.
            return {"status": "error", "error": type(error).__name__, "message": str(error)}
        return result

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset(self._tools)

    def allowlist_of(self, agent: str) -> frozenset[str]:
        return self._allowlist.get(agent, frozenset())


# Schema tham số dùng lại. Ba capability đọc-only đều chỉ cần "chạy trên snapshot hiện tại",
# nên không nhận tham số — cố ý: tham số tự do là chỗ để LLM đưa số do nó bịa vào pipeline.
NO_ARGS: dict[str, Any] = {"type": "object", "properties": {}, "additionalProperties": False}
