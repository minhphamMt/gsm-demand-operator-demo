"""Vòng lặp tool-use của agent, và đường deterministic tương đương.

Đây là chỗ hiện thực quyết định nền tảng của bản nâng cấp: **một agent, hai chế độ chạy,
cùng một tập tool**.

- `deterministic`: chạy đúng chuỗi tool cố định đã khai báo. Cùng snapshot luôn cho cùng
  kết quả, nên baseline đã khóa, INV-1/2/3 và eval vẫn so được (CLAUDE.md §3 #4).
- `llm`: LLM tự chọn gọi tool nào, thứ tự nào, dừng khi nào — trong allowlist của nó.

Hai chế độ dùng chung `ToolRegistry`, nên tập quyền hạn không thể lệch nhau giữa hai
đường. Và vì mọi con số do tool sinh ra, đổi chế độ không đổi số — chỉ đổi đường đi.

Suy giảm có kiểm soát: mọi lỗi của tầng LLM (thiếu khóa, timeout, gateway lỗi, vượt số
vòng) đều rơi về chuỗi deterministic. LLM hỏng làm mất phần suy luận, không làm mất phương
án (`agent/04` A4, CLAUDE.md §10.1 #9).
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from src.orchestration.agents.client import LLMClient, LLMUnavailableError
from src.orchestration.run_log import NULL_SINK, EventSink
from src.orchestration.state import ToolCall
from src.orchestration.tools.registry import ToolPermissionError, ToolRegistry

logger = logging.getLogger(__name__)

# Số vòng tool-use tối đa là chốt chặn cứng, độc lập với cấu hình: một LLM lặp vô hạn
# "gọi tool → đọc kết quả → gọi lại" sẽ đốt hết ngân sách token mà không bao giờ kết thúc.
HARD_ROUND_LIMIT = 20


@dataclass(frozen=True)
class AgentRun:
    """Kết quả một lượt chạy agent."""

    tool_calls: tuple[ToolCall, ...]
    results: dict[str, dict[str, Any]]
    text: str
    mode_used: str
    warnings: tuple[dict[str, object], ...]


def run_deterministic(
    *,
    agent: str,
    registry: ToolRegistry,
    sequence: Sequence[str],
) -> AgentRun:
    """Chạy đúng chuỗi tool đã khai báo, theo thứ tự, không rẽ nhánh."""
    calls: list[ToolCall] = []
    results: dict[str, dict[str, Any]] = {}
    for tool_name in sequence:
        result = registry.invoke(agent, tool_name, {})
        ok = result.get("status") != "error"
        calls.append(ToolCall(agent=agent, tool=tool_name, ok=ok, detail=str(result.get("message", ""))))
        results[tool_name] = result
    return AgentRun(
        tool_calls=tuple(calls),
        results=results,
        text="",
        mode_used="deterministic",
        warnings=(),
    )


def run_with_llm(
    *,
    agent: str,
    registry: ToolRegistry,
    client: LLMClient,
    model: str,
    system_prompt: str,
    user_prompt: str,
    fallback_sequence: Sequence[str],
    max_rounds: int,
    emit: EventSink = NULL_SINK,
) -> AgentRun:
    """Để LLM tự chọn tool trong allowlist; hỏng ở bất kỳ đâu thì rơi về deterministic."""
    rounds = min(max(max_rounds, 1), HARD_ROUND_LIMIT)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    schemas = registry.schemas_for(agent)
    calls: list[ToolCall] = []
    results: dict[str, dict[str, Any]] = {}

    for _ in range(rounds):
        try:
            reply = client.complete(model=model, messages=messages, tools=schemas)
        except LLMUnavailableError as error:
            return _fallback(agent, registry, fallback_sequence, calls, results, str(error), emit)

        if not reply.tool_calls:
            return AgentRun(
                tool_calls=tuple(calls),
                results=results,
                text=reply.content,
                mode_used="llm",
                warnings=(),
            )

        # Câu agent tự nói về việc nó sắp làm. Nó vẫn luôn được sinh ra và vẫn luôn đi vào
        # `messages`, nhưng trước đây không ai đọc nó ra — `AgentRun.text` chỉ giữ `content` ở
        # lượt KHÔNG có tool_calls, nên đúng phần thú vị nhất bị bỏ (kế hoạch §2.2).
        #
        # Phát dạng `narration` với `source="llm"`: nó **không** được `_numbers_are_grounded`
        # đối chiếu — validator đó canh `explanation.text`, thứ có dict nguồn xác định. Ở đây
        # không có dict nguồn nào để đối chiếu, nên thay vì diễn một phép kiểm không tồn tại,
        # dòng được đánh dấu nguồn `llm` và UI tô khác kèm chú giải (kế hoạch §4 Chặng 5).
        if reply.content and reply.content.strip():
            emit("narration", agent, reply.content.strip(), source="llm")
        messages.append(
            {
                "role": "assistant",
                "content": reply.content or None,
                "tool_calls": list(reply.tool_calls),
            }
        )
        for raw_call in reply.tool_calls:
            tool_name, arguments, parse_error = _parse_tool_call(raw_call)
            if parse_error is not None:
                calls.append(ToolCall(agent=agent, tool=tool_name, ok=False, detail=parse_error))
                messages.append(_tool_message(raw_call, {"status": "error", "message": parse_error}))
                continue
            try:
                result = registry.invoke(agent, tool_name, arguments)
            except ToolPermissionError as error:
                # Không rơi về fallback: LLM cố với ra ngoài phạm vi là tín hiệu cần thấy,
                # không phải sự cố cần che. Trả lỗi vào hội thoại để nó tự chỉnh.
                logger.warning("Agent %s bị chặn khi gọi tool ngoài allowlist: %s", agent, tool_name)
                calls.append(ToolCall(agent=agent, tool=tool_name, ok=False, detail="not_allowed"))
                messages.append(_tool_message(raw_call, {"status": "error", "message": str(error)}))
                continue
            ok = result.get("status") != "error"
            calls.append(ToolCall(agent=agent, tool=tool_name, ok=ok, detail=str(result.get("message", ""))))
            results[tool_name] = result
            messages.append(_tool_message(raw_call, result))

    return _fallback(
        agent,
        registry,
        fallback_sequence,
        calls,
        results,
        f"Vượt {rounds} vòng tool-use mà agent chưa kết luận.",
        emit,
    )


def _fallback(
    agent: str,
    registry: ToolRegistry,
    sequence: Sequence[str],
    calls: list[ToolCall],
    results: dict[str, dict[str, Any]],
    reason: str,
    emit: EventSink = NULL_SINK,
) -> AgentRun:
    """Rơi về chuỗi deterministic, chỉ chạy những tool chưa có kết quả hợp lệ.

    Không chạy lại tool đã thành công: chúng là hàm thuần nên kết quả không đổi, và chạy
    lại chỉ làm danh sách `tool_calls` hiển thị sai những gì đã thực sự xảy ra.
    """
    logger.warning("Agent %s rơi về chế độ deterministic: %s", agent, reason)
    # Vừa log WARNING vừa vào `warnings[]` vừa thành một dòng trên màn hình: một lượt suy
    # giảm mà người vận hành không thấy là một lượt suy giảm bị giấu (CLAUDE.md §9 #3).
    emit(
        "warning",
        agent,
        f"rơi về chuỗi tool cố định: {reason}",
        source="system",
        ok=False,
        code="LLM_ROUTING_FALLBACK",
    )
    remaining = [name for name in sequence if name not in results]
    recovered = run_deterministic(agent=agent, registry=registry, sequence=remaining)
    return AgentRun(
        tool_calls=(*calls, *recovered.tool_calls),
        results={**results, **recovered.results},
        text="",
        mode_used="llm_fallback_deterministic",
        warnings=(
            {
                "code": "LLM_ROUTING_FALLBACK",
                "severity": "info",
                "message": f"Agent {agent} dùng chuỗi tool cố định: {reason}",
            },
        ),
    )


def _parse_tool_call(raw_call: dict[str, Any]) -> tuple[str, dict[str, Any], str | None]:
    """Bóc tên tool và tham số. Tham số luôn parse bằng `json.loads`, không so chuỗi thô.

    Các model khác nhau escape JSON khác nhau trong `arguments`; so chuỗi hay dùng `eval`
    ở đây là lỗ hổng và là nguồn sai lặng lẽ.
    """
    function = raw_call.get("function") or {}
    tool_name = str(function.get("name") or "")
    if not tool_name:
        return "", {}, "Lời gọi tool thiếu tên hàm."
    raw_arguments = function.get("arguments") or "{}"
    if isinstance(raw_arguments, dict):
        return tool_name, dict(raw_arguments), None
    try:
        parsed = json.loads(raw_arguments)
    except (TypeError, ValueError):
        return tool_name, {}, "Tham số tool không phải JSON hợp lệ."
    if not isinstance(parsed, dict):
        return tool_name, {}, "Tham số tool phải là object."
    return tool_name, parsed, None


def _tool_message(raw_call: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Đóng gói kết quả tool thành message `role: "tool"` cho lượt gọi kế tiếp."""
    return {
        "role": "tool",
        "tool_call_id": str(raw_call.get("id") or ""),
        "content": json.dumps(result, ensure_ascii=False, default=str),
    }
