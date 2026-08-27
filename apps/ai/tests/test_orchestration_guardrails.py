"""Guardrail của tầng agent — những luật phải đúng kể cả khi LLM cư xử bất thường.

Các test ở đây không kiểm "agent chạy đúng" mà kiểm "agent **không thể** làm sai": gọi tool
ngoài phạm vi, chạm tới tiền, hay đưa số bịa vào văn bản. Đó là ranh giới mà prompt không
giữ được — chỉ code giữ được (CLAUDE.md §10.1).

Không test nào ở đây chạm mạng: `LLMClient` được thay bằng bản giả.
"""

from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.common.policy import get_policy
from src.config import get_settings
from src.main import app
from src.orchestration.agents.client import LLMClient, LLMResponse, LLMUnavailableError
from src.orchestration.agents.runner import run_with_llm
from src.orchestration.graph import _numbers_are_grounded, run_pipeline
from src.orchestration.tools.decision_tools import RunContext, build_registry
from src.orchestration.tools.registry import (
    AGENT_ASSESSMENT,
    AGENT_DISPATCH,
    AGENT_EXPLANATION,
    ToolPermissionError,
)
from tests.test_orchestration_parity import _Zone, _zones_at

SOURCE_AT = "2026-09-25T08:30:00+07:00"

# Tool có side effect thật. Chúng phải KHÔNG tồn tại trong registry của tầng phân tích —
# đây là ranh giới ngăn prompt injection với tới tiền thưởng và lệnh điều xe.
SIDE_EFFECT_TOOLS = frozenset(
    {"execute_relocation", "issue_offers", "send_offer", "record_driver_response", "build_campaign"}
)


def _context(*, llm_routing_enabled: bool = False) -> RunContext:
    """Dựng context mới với bản sao Settings riêng.

    `get_settings()` có `lru_cache` nên trả về một singleton dùng chung: sửa trực tiếp lên
    nó sẽ rò cấu hình sang test khác và làm kết quả phụ thuộc thứ tự chạy (CLAUDE.md §7 #3).
    """
    settings = get_settings().model_copy(update={"llm_routing_enabled": llm_routing_enabled})
    with TestClient(app) as client:
        zones = _zones_at(client, SOURCE_AT)
    return RunContext(
        zones=[_Zone(zone) for zone in zones],
        t=pd.Timestamp(SOURCE_AT),
        horizon_min=5,
        replay_source_at=pd.Timestamp(SOURCE_AT),
        policy=get_policy(settings.policy_path),
        settings=settings,
    )


class _FakeClient(LLMClient):
    """Client giả: trả sẵn kịch bản, không mở kết nối nào."""

    def __init__(self, replies: list[LLMResponse | Exception]) -> None:
        super().__init__(base_url="http://never.invalid", api_key="test-key", timeout_seconds=1.0)
        self._replies = replies
        self.calls: list[dict[str, Any]] = []

    def complete(self, **kwargs: Any) -> LLMResponse:
        self.calls.append(kwargs)
        if not self._replies:
            return LLMResponse(content="xong", tool_calls=(), finish_reason="stop", model="fake")
        reply = self._replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _tool_call(name: str, call_id: str = "call_1") -> dict[str, Any]:
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": "{}"}}


def test_side_effect_tools_are_absent_from_every_allowlist() -> None:
    """Không agent nào được thấy tool điều xe thật hay phát thưởng."""
    registry = build_registry(_context())
    assert registry.tool_names.isdisjoint(SIDE_EFFECT_TOOLS)
    for agent in (AGENT_ASSESSMENT, AGENT_DISPATCH, AGENT_EXPLANATION):
        assert registry.allowlist_of(agent).isdisjoint(SIDE_EFFECT_TOOLS)


def test_agent_cannot_invoke_tool_outside_its_allowlist() -> None:
    """Explanation Agent không được chạm vào optimizer, dù biết đúng tên tool."""
    registry = build_registry(_context())
    with pytest.raises(ToolPermissionError):
        registry.invoke(AGENT_EXPLANATION, "compute_relocation", {})
    with pytest.raises(ToolPermissionError):
        registry.invoke(AGENT_DISPATCH, "run_forecast", {})


def test_agent_only_sees_schemas_of_its_own_tools() -> None:
    registry = build_registry(_context())
    dispatch_tools = {schema["function"]["name"] for schema in registry.schemas_for(AGENT_DISPATCH)}
    assert dispatch_tools == {"compute_relocation"}


def test_llm_asking_for_forbidden_tool_is_blocked_not_executed() -> None:
    """LLM đòi tool ngoài phạm vi → bị chặn, run vẫn kết thúc bằng đường deterministic."""
    context = _context()
    registry = build_registry(context)
    client = _FakeClient(
        [
            LLMResponse(
                content="",
                tool_calls=(_tool_call("compute_relocation"),),
                finish_reason="tool_calls",
                model="fake",
            ),
            LLMResponse(content="Tình hình ổn.", tool_calls=(), finish_reason="stop", model="fake"),
        ]
    )
    run = run_with_llm(
        agent=AGENT_ASSESSMENT,
        registry=registry,
        client=client,
        model="fake",
        system_prompt="s",
        user_prompt="u",
        fallback_sequence=("run_forecast",),
        max_rounds=4,
    )
    blocked = [call for call in run.tool_calls if call.tool == "compute_relocation"]
    assert blocked and not blocked[0].ok and blocked[0].detail == "not_allowed"
    # Quan trọng: tool bị chặn KHÔNG để lại kết quả nào trong context.
    assert context.solve_result is None


def test_llm_failure_falls_back_to_deterministic_and_still_produces_a_plan() -> None:
    """Gateway hỏng không được làm mất phương án (CLAUDE.md §10.1 #9)."""
    context = _context()
    registry = build_registry(context)
    client = _FakeClient([LLMUnavailableError("gateway down")])
    run = run_with_llm(
        agent=AGENT_ASSESSMENT,
        registry=registry,
        client=client,
        model="fake",
        system_prompt="s",
        user_prompt="u",
        fallback_sequence=("run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"),
        max_rounds=4,
    )
    assert run.mode_used == "llm_fallback_deterministic"
    assert context.selection is not None and context.targets is not None
    assert any(warning["code"] == "LLM_ROUTING_FALLBACK" for warning in run.warnings)


def test_tool_round_limit_stops_a_looping_agent() -> None:
    """Agent gọi tool không dừng bị cắt và rơi về deterministic thay vì chạy mãi."""
    context = _context()
    registry = build_registry(context)
    looping = [
        LLMResponse(
            content="",
            tool_calls=(_tool_call("get_weather", f"call_{index}"),),
            finish_reason="tool_calls",
            model="fake",
        )
        for index in range(10)
    ]
    client = _FakeClient(list(looping))
    run = run_with_llm(
        agent=AGENT_ASSESSMENT,
        registry=registry,
        client=client,
        model="fake",
        system_prompt="s",
        user_prompt="u",
        fallback_sequence=("run_forecast", "get_supply_state"),
        max_rounds=3,
    )
    assert len(client.calls) == 3
    assert run.mode_used == "llm_fallback_deterministic"


def test_malformed_tool_arguments_do_not_crash_the_run() -> None:
    """Tham số không phải JSON là chuyện thường với model rẻ — phải xử lý, không nổ."""
    context = _context()
    registry = build_registry(context)
    broken = {"id": "c1", "type": "function", "function": {"name": "get_weather", "arguments": "{not json"}}
    client = _FakeClient(
        [
            LLMResponse(content="", tool_calls=(broken,), finish_reason="tool_calls", model="fake"),
            LLMResponse(content="ok", tool_calls=(), finish_reason="stop", model="fake"),
        ]
    )
    run = run_with_llm(
        agent=AGENT_ASSESSMENT,
        registry=registry,
        client=client,
        model="fake",
        system_prompt="s",
        user_prompt="u",
        fallback_sequence=("run_forecast",),
        max_rounds=3,
    )
    assert any(not call.ok for call in run.tool_calls)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Điều 12 xe qua 3 chặng.", True),
        ("Điều 12 xe qua 3 chặng, tiết kiệm 47 phút.", False),
        ("Không có con số nào.", True),
    ],
)
def test_explanation_numbers_must_come_from_source(text: str, expected: bool) -> None:
    """Số lạ trong văn bản LLM bị loại — đây là chỗ ép 'LLM đọc số, không sinh số'."""
    source = {"status": "ok", "total_units": 12, "move_count": 3}
    assert _numbers_are_grounded(text, source) is expected


# Hồi quy: văn bản thật do anthropic/claude-haiku-4.5 sinh ra ngày 2026-08-23. Mọi con số
# trong đó đều đúng nguồn, nhưng validator tách "197.681" thành "197" và "681" nên loại oan —
# tức là tầng LLM bị vô hiệu hoá 100% số lần trên tiếng Việt có định dạng tiền.
REAL_LLM_TEXT = (
    "Phương án này yêu cầu điều động 9 lần để phân bổ 10 đơn vị xe, với tổng chi phí "
    "197.681 đồng (nằm trong ngân sách 500.000 đồng). Trong chế độ cao điểm mưa, phương án "
    "bao phủ 12 khu vực còn lại và quản lý 14 khu vực rủi ro mà không có điểm nóng chính "
    "sách nào cần ưu tiên đặc biệt."
)
REAL_SOURCE = {
    "status": "ok",
    "move_count": 9,
    "total_units": 10,
    "total_cost": 197681,
    "budget_cap": 500000,
    "residual_zone_count": 12,
    "policy_hotspot_count": 0,
    "risk_zone_count": 14,
}


def test_thousands_separator_is_not_mistaken_for_a_fabricated_number() -> None:
    """Dấu chấm hàng nghìn tiếng Việt phải được hiểu, không bị coi là số bịa."""
    assert _numbers_are_grounded(REAL_LLM_TEXT, REAL_SOURCE) is True


@pytest.mark.parametrize(
    "text",
    [
        "Tổng chi phí 197.681 đồng.",  # dấu chấm
        "Tổng chi phí 197,681 đồng.",  # dấu phẩy
        "Ngân sách 500.000 đồng.",
    ],
)
def test_grouped_numbers_are_accepted_in_both_separator_styles(text: str) -> None:
    assert _numbers_are_grounded(text, REAL_SOURCE) is True


@pytest.mark.parametrize(
    "text",
    [
        "Tiết kiệm 47 phút.",  # số hoàn toàn không có trong nguồn
        "Tổng chi phí 197.682 đồng.",  # lệch một chữ số so với nguồn
        "Giảm 35% thời gian chờ.",  # tỷ lệ phần trăm tự nghĩ ra
    ],
)
def test_fabricated_numbers_are_still_rejected_after_normalisation(text: str) -> None:
    """Nới cho dấu phân cách KHÔNG được nới cho số bịa — đó mới là thứ cần chặn."""
    assert _numbers_are_grounded(text, REAL_SOURCE) is False


def test_llm_mode_produces_the_same_numbers_as_deterministic_mode() -> None:
    """Đổi chế độ đổi đường đi, KHÔNG đổi số — cơ sở để KPI hai chế độ so được với nhau."""
    deterministic = run_pipeline(_context(), snapshot_id="s", data_source="d")

    context = _context(llm_routing_enabled=True)
    client = _FakeClient(
        [
            LLMResponse(
                content="",
                tool_calls=(
                    _tool_call("run_forecast", "a1"),
                    _tool_call("get_supply_state", "a2"),
                ),
                finish_reason="tool_calls",
                model="fake",
            ),
            LLMResponse(content="Đã đánh giá xong.", tool_calls=(), finish_reason="stop", model="fake"),
            LLMResponse(
                content="",
                tool_calls=(_tool_call("compute_relocation", "d1"),),
                finish_reason="tool_calls",
                model="fake",
            ),
            LLMResponse(content="Đã sinh phương án.", tool_calls=(), finish_reason="stop", model="fake"),
            LLMResponse(
                content="",
                tool_calls=(_tool_call("render_explanation", "e1"),),
                finish_reason="tool_calls",
                model="fake",
            ),
            LLMResponse(content="Phương án đã sẵn sàng.", tool_calls=(), finish_reason="stop", model="fake"),
        ]
    )
    llm_state = run_pipeline(context, snapshot_id="s", data_source="d", llm_client=client)

    assert llm_state["routing_mode"] == "llm"
    assert llm_state["decision"] == deterministic["decision"]


def test_every_agent_reports_when_it_started_and_finished() -> None:
    """`agent/02-technical-spec.md` §2.5 (`AgentResult`) yêu cầu hai mốc thời gian này.

    Client polling 2 giây nên không tự đo được: nó chỉ thấy nhịp polling, không thấy nhịp agent.
    """
    state = run_pipeline(_context(), snapshot_id="s", data_source="d")
    reports = state["agent_reports"]

    assert reports, "đồ thị phải báo cáo ít nhất một agent"
    for name, report in reports.items():
        if report.status == "PENDING":
            continue
        assert report.started_at is not None, f"{name} chạy rồi mà không có started_at"
        assert report.finished_at is not None, f"{name} chạy rồi mà không có finished_at"
        started = datetime.fromisoformat(report.started_at)
        finished = datetime.fromisoformat(report.finished_at)
        assert started.utcoffset() == timedelta(hours=7), f"{name} phải dùng offset +07:00"
        assert finished >= started, f"{name} kết thúc trước khi bắt đầu"
