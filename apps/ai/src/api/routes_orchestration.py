"""Endpoint của tầng điều phối multi-agent.

Giao thức là **polling**, không WebSocket, không SSE: `agent/06` chốt `PollingTransport` cho
giai đoạn đầu và CLAUDE.md §4.2 loại WebSocket khỏi phạm vi. Frontend đã polling 2 giây ở
các màn hình khác, nên đây cũng là lựa chọn ít lệch nhất với phần đang chạy.

Run store là bộ nhớ trong tiến trình và **cố ý tạm bợ**: nó chỉ giữ tiến độ của một lần
chạy để UI vẽ 5 thẻ agent. Sự thật nghiệp vụ — plan, quyết định phê duyệt, audit — nằm ở
Supabase qua NestJS (CLAUDE.md §3 #7). Mất run store khi restart là chấp nhận được; mất một
bản ghi phê duyệt thì không, và đó là lý do hai thứ này không ở cùng một chỗ.
"""

import asyncio
import logging
import uuid
from collections import OrderedDict
from dataclasses import asdict
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from src.api.routes_inference import DecisionRequest
from src.common.errors import NovaFourError
from src.common.policy import get_policy
from src.config import get_settings
from src.orchestration.agents.client import LLMClient
from src.orchestration.graph import run_pipeline
from src.orchestration.state import PipelineState
from src.orchestration.tools.decision_tools import RunContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["orchestration"])

# Trần số run giữ lại. Không có trần thì một tiến trình chạy lâu sẽ phình bộ nhớ theo số
# request — dạng rò rỉ chỉ lộ ra ở môi trường chạy dài, không lộ khi demo.
MAX_TRACKED_RUNS = 64

_runs: OrderedDict[str, dict[str, Any]] = OrderedDict()


def _remember(run_id: str, record: dict[str, Any]) -> None:
    _runs[run_id] = record
    _runs.move_to_end(run_id)
    while len(_runs) > MAX_TRACKED_RUNS:
        _runs.popitem(last=False)


def _render(state: PipelineState) -> dict[str, Any]:
    """Chuyển state của đồ thị thành shape mà UI đọc được."""
    reports = state.get("agent_reports") or {}
    return {
        "routing_mode": state.get("routing_mode"),
        "policy_version": state.get("policy_version"),
        "model_version": state.get("model_version"),
        "agents": {
            name: {
                "status": report.status,
                "message": report.message,
                "started_at": report.started_at,
                "finished_at": report.finished_at,
                "capabilities": {
                    capability: {"status": item.status, "message": item.message}
                    for capability, item in report.capabilities.items()
                },
            }
            for name, report in reports.items()
        },
        "tool_calls": [asdict(call) for call in state.get("tool_calls") or []],
        "plan_set": state.get("plan_set"),
        "recommended_plan_id": state.get("recommended_plan_id"),
        "quality_ok": state.get("quality_ok"),
        "quality_reason": state.get("quality_reason"),
        "explanation": state.get("explanation"),
        "warnings": state.get("warnings") or [],
        "decision": state.get("decision"),
    }


def _execute(run_id: str, request: DecisionRequest) -> None:
    """Chạy đồ thị. Hàm đồng bộ — được gọi trong thread riêng để không chặn event loop."""
    settings = get_settings()
    try:
        context = RunContext(
            zones=request.zones,
            t=pd.Timestamp(request.t),
            horizon_min=request.horizon_min,
            replay_source_at=(pd.Timestamp(request.replay_source_at) if request.replay_source_at else None),
            policy=get_policy(settings.policy_path),
            settings=settings,
        )
        state = run_pipeline(
            context,
            snapshot_id=request.snapshot_id,
            data_source=request.data_source,
        )
    except NovaFourError as error:
        logger.warning("Run %s dừng vì %s", run_id, error.error_code)
        _remember(
            run_id,
            {"run_id": run_id, "status": "FAILED", "error": {"code": error.error_code, "message": error.message}},
        )
        return
    except Exception as error:  # noqa: BLE001 - run hỏng không được làm chết tiến trình phục vụ.
        logger.exception("Run %s lỗi ngoài dự kiến", run_id)
        _remember(
            run_id, {"run_id": run_id, "status": "FAILED", "error": {"code": "INTERNAL_ERROR", "message": str(error)}}
        )
        return
    _remember(run_id, {"run_id": run_id, "status": "DONE", **_render(state)})


@router.post("/runs", status_code=202)
async def start_run(request: DecisionRequest) -> dict[str, Any]:
    """Khởi động một lần chạy đồ thị và trả `run_id` ngay.

    Trả 202 chứ không phải 200: kết quả chưa có tại thời điểm trả lời, UI phải hỏi lại.
    """
    run_id = str(uuid.uuid4())
    _remember(run_id, {"run_id": run_id, "status": "RUNNING"})
    # Đồ thị là code đồng bộ (optimizer chạy MILP), nên đẩy sang thread — chạy thẳng trên
    # event loop sẽ chặn mọi request khác trong lúc giải bài toán.
    asyncio.create_task(asyncio.to_thread(_execute, run_id, request))
    return {"run_id": run_id, "status": "RUNNING"}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    record = _runs.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail={"code": "RUN_NOT_FOUND", "message": f"Không có run {run_id}."})
    return record


@router.get("/llm/health")
def llm_health() -> dict[str, Any]:
    """Preflight cấu hình gateway.

    Có endpoint riêng vì sai slug model là lỗi cấu hình hay gặp nhất, và phát hiện nó giữa
    pipeline thì đã chạy dở. Không bao giờ trả về khóa API.
    """
    settings = get_settings()
    client = LLMClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        timeout_seconds=settings.llm_timeout_seconds,
    )
    return {
        "llm_routing_enabled": settings.llm_routing_enabled,
        "base_url": settings.llm_base_url,
        "api_key_configured": client.configured,
        "analysis": client.health(model=settings.llm_model_analysis),
        "explanation": client.health(model=settings.llm_model_explanation),
    }
