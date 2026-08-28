"""Ô nhập của người vận hành — kế hoạch `agent/08-interaction-log-plan.md` §3.6, Chặng 7.

Người vận hành gõ tiếng Việt tự nhiên vào nhật ký; agent quan sát trả lời trong cùng dòng
chảy đó. **LLM là đường chính**, bảng từ khoá (`intent.py`) chỉ đỡ khi tầng LLM hỏng — đúng
khuôn suy giảm mà ba agent trong đồ thị đang dùng.

Hai chỗ **cố ý deterministic, không giao cho LLM**, và lý do khác nhau ở từng chỗ:

1. **Từ chối lệnh chạm cổng phê duyệt.** Kiểm trước khi gọi LLM. Model không có tool để duyệt
   nên nó *không thể* duyệt, nhưng nó có thể viết ra một câu nghe như đã duyệt — và một dòng
   nhật ký nói dối về chuyện tiền và chuyện điều xe thì tệ hơn là không có dòng nào.
2. **Phát lệnh chạy phân tích.** Không phải lựa chọn mà là sự thật cấu trúc: allowlist của
   observer chỉ-đọc, nên nó **không có tool nào** để diễn đạt "hãy chạy một lượt". Route trả
   về một *directive*, client tự gọi `POST /runs` như khi bấm nút. Một đường tạo run, không
   phải hai.

Ngoài hai chỗ đó, việc hiểu câu hỏi và chọn tool là của LLM.

Phiên hỏi–đáp **không đi vào `PipelineState`**: xoá sạch mọi phiên thì từng `decision` vẫn
giống hệt từng byte. Đó là bản viết lại của điều luật "nhật ký không bao giờ là nguồn" sau khi
ô nhập làm nhật ký thành hai chiều (§5.1).
"""

import asyncio
import logging
import threading
from collections import OrderedDict
from dataclasses import asdict
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import Field

from src.api.routes_inference import DecisionRequest
from src.common.errors import NovaFourError
from src.common.policy import get_policy
from src.config import get_settings
from src.orchestration.agents.client import LLMClient
from src.orchestration.agents.runner import run_with_llm
from src.orchestration.intent import UNKNOWN_HINT, Intent, classify
from src.orchestration.prompts import PROMPTS
from src.orchestration.run_log import RunLog
from src.orchestration.tools.decision_tools import RunContext, build_registry
from src.orchestration.tools.registry import AGENT_OBSERVER

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["observe"])

# Trần phiên giữ trong bộ nhớ. Cùng lý do như trần 64 run: không có trần thì một tiến trình
# chạy lâu phình bộ nhớ theo số người mở màn hình.
MAX_TRACKED_SESSIONS = 32

# Directive client được phép thi hành. Client có allowlist riêng của nó nữa — hai khoá, một
# não. Danh sách này KHÔNG bao giờ được chứa hành động chạm tiền hay chạm cổng phê duyệt.
ACTION_START_RUN = "start_run"

_sessions_lock = threading.Lock()
_sessions: OrderedDict[str, RunLog] = OrderedDict()


class ObserveRequest(DecisionRequest):
    """Câu hỏi cộng đúng snapshot mà lượt chạy đang xem.

    Kế thừa `DecisionRequest` chứ không dựng payload riêng: observer phải nhìn **cùng một
    snapshot** với pipeline, nếu không nó trả lời về một thế giới khác với thế giới người
    vận hành đang nhìn.
    """

    session_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=500)


def _session_log(session_id: str) -> RunLog:
    with _sessions_lock:
        log = _sessions.get(session_id)
        if log is None:
            log = RunLog()
            _sessions[session_id] = log
        _sessions.move_to_end(session_id)
        while len(_sessions) > MAX_TRACKED_SESSIONS:
            _sessions.popitem(last=False)
        return log


def _context(request: ObserveRequest) -> RunContext:
    settings = get_settings()
    return RunContext(
        zones=request.zones,
        t=pd.Timestamp(request.t),
        horizon_min=request.horizon_min,
        replay_source_at=(pd.Timestamp(request.replay_source_at) if request.replay_source_at else None),
        policy=get_policy(settings.policy_path),
        settings=settings,
    )


def _answer_with_llm(request: ObserveRequest, log: RunLog) -> bool:
    """Đường chính. Trả `False` nếu tầng LLM không dùng được để bên gọi rơi về bảng từ khoá.

    `fallback_sequence=()` là cố ý: fallback của `run_with_llm` không được chạy thay một chuỗi
    tool nào ở đây — nó chỉ báo hỏng, còn việc đỡ là của `intent.py`. Fallback không gọi
    fallback (CLAUDE.md §10.1 #3).
    """
    settings = get_settings()
    client = LLMClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        timeout_seconds=settings.llm_timeout_seconds,
    )
    if not settings.llm_routing_enabled or not client.configured:
        return False

    registry = build_registry(_context(request))
    registry.observe(log.append)
    run = run_with_llm(
        agent=AGENT_OBSERVER,
        registry=registry,
        client=client,
        model=settings.llm_model_analysis,
        system_prompt=PROMPTS[AGENT_OBSERVER],
        user_prompt=request.text,
        fallback_sequence=(),
        max_rounds=settings.llm_max_tool_rounds,
        emit=log.append,
    )
    if run.mode_used != "llm" or not run.text.strip():
        return False
    log.append("narration", AGENT_OBSERVER, run.text.strip(), source="llm")
    return True


def _answer_with_keywords(request: ObserveRequest, log: RunLog, intent: Intent) -> None:
    """Đường đỡ. Chạy đúng một tool và đọc lại số nguyên văn — không diễn giải thêm."""
    log.append(
        "warning",
        AGENT_OBSERVER,
        "tầng LLM không dùng được; trả lời bằng đường cố định",
        source="system",
        ok=False,
        code="OBSERVER_LLM_FALLBACK",
    )
    if intent.kind != "observe" or intent.tool is None:
        log.append("narration", AGENT_OBSERVER, UNKNOWN_HINT, source="deterministic")
        return
    registry = build_registry(_context(request))
    registry.observe(log.append)
    # `get_supply_state` cần forecast chạy trước — ràng buộc dữ liệu thật, không phải quy ước.
    if intent.tool == "get_supply_state":
        registry.invoke(AGENT_OBSERVER, "run_forecast", {})
    registry.invoke(AGENT_OBSERVER, intent.tool, {})


def _respond(request: ObserveRequest, log: RunLog, intent: Intent) -> None:
    """Chạy trong thread riêng: tool đọc parquet và giải model, không được chặn event loop."""
    try:
        if _answer_with_llm(request, log):
            return
        _answer_with_keywords(request, log, intent)
    except NovaFourError as error:
        logger.warning("Phiên %s dừng vì %s", request.session_id, error.error_code)
        log.append("warning", AGENT_OBSERVER, error.message, source="system", ok=False, code=error.error_code)
    except Exception as error:  # noqa: BLE001 - một câu hỏi hỏng không được làm chết tiến trình.
        logger.exception("Phiên %s lỗi ngoài dự kiến", request.session_id)
        log.append("warning", AGENT_OBSERVER, str(error), source="system", ok=False, code="INTERNAL_ERROR")


@router.post("/observe", status_code=202)
async def ask(request: ObserveRequest) -> dict[str, Any]:
    """Nhận một câu, trả ngay directive cho client; câu trả lời về sau qua lượt poll.

    Route **không tự echo lại câu người dùng vừa gõ**: client đã hiện nó ngay lúc bấm Enter,
    echo thêm một bản nữa sẽ thành hai dòng giống nhau trên cùng màn hình.
    """
    log = _session_log(request.session_id)
    intent = classify(request.text)

    if intent.kind == "gate_blocked":
        # Chặn TRƯỚC khi LLM có cơ hội nói bất cứ điều gì về việc duyệt.
        log.append("narration", AGENT_OBSERVER, intent.message, source="system", ok=False, code="GATE_IS_UI_ONLY")
        return {"session_id": request.session_id, "action": None}

    if intent.kind == "run_analysis":
        log.append("narration", AGENT_OBSERVER, intent.message, source="deterministic")
        return {"session_id": request.session_id, "action": ACTION_START_RUN}

    log.append("agent_started", AGENT_OBSERVER, "đọc câu hỏi của điều phối viên", source="system")
    asyncio.create_task(asyncio.to_thread(_respond, request, log, intent))
    return {"session_id": request.session_id, "action": None}


@router.get("/observe/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    """Nhật ký của một phiên hỏi–đáp. Luồng riêng, `seq` riêng, không dính run nào."""
    with _sessions_lock:
        log = _sessions.get(session_id)
    if log is None:
        return {"session_id": session_id, "events": []}
    return {"session_id": session_id, "events": [asdict(event) for event in log.snapshot()]}


@router.delete("/observe/{session_id}", status_code=204)
def clear_session(session_id: str) -> None:
    """Xoá một phiên. Có để chứng minh được điều luật §5.1: xoá sạch phiên thì `decision`
    không đổi một byte nào — thứ đó phải kiểm được, không chỉ nói."""
    with _sessions_lock:
        if _sessions.pop(session_id, None) is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "SESSION_NOT_FOUND", "message": f"Không có phiên {session_id}."},
            )
