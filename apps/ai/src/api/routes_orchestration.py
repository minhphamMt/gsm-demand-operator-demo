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
import threading
import uuid
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException

from src.api.routes_inference import DecisionRequest
from src.common.errors import NovaFourError
from src.common.policy import get_policy
from src.config import get_settings
from src.orchestration.agents.client import LLMClient
from src.orchestration.graph import run_pipeline
from src.orchestration.run_log import RunLog
from src.orchestration.state import PipelineState
from src.orchestration.tools.decision_tools import RunContext

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["orchestration"])

# Trần số run giữ lại. Không có trần thì một tiến trình chạy lâu sẽ phình bộ nhớ theo số
# request — dạng rò rỉ chỉ lộ ra ở môi trường chạy dài, không lộ khi demo.
MAX_TRACKED_RUNS = 64


@dataclass
class RunEntry:
    """Bản ghi tiến độ và nhật ký của một run, gộp trong **một** object.

    Không phải hai `OrderedDict` song song: hai map nghĩa là hai vòng thu hồi phải luôn đồng
    ý với nhau mà không có gì ép chúng đồng ý — lệch một nhịp là hỏng im lặng (nhật ký sống
    lâu hơn bản ghi, hoặc ngược lại). Gộp lại thì chỉ còn một vòng đời.

    Vấn đề thật cần giải hẹp hơn thế: `_remember()` cũ **thay cả dict**, nên thứ gì để bên
    trong đều bị hủy ở bước RUNNING→DONE. Ở đây nó chỉ thay `record`, `log` giữ nguyên.
    """

    record: dict[str, Any]
    log: RunLog = field(default_factory=RunLog)


# Khóa của run store. `get_run` là `def` nên FastAPI chạy nó trong threadpool, còn `_execute`
# chạy trong worker của `asyncio.to_thread` — hai thread thật sự khác nhau, và `OrderedDict`
# bị sửa từ cả hai phía.
_store_lock = threading.Lock()

_runs: OrderedDict[str, RunEntry] = OrderedDict()


def _open_entry(run_id: str) -> RunEntry:
    """Mở bản ghi mới cho một run và thu hồi run cũ nếu vượt trần."""
    entry = RunEntry(record={"run_id": run_id, "status": "RUNNING"})
    with _store_lock:
        _runs[run_id] = entry
        _runs.move_to_end(run_id)
        while len(_runs) > MAX_TRACKED_RUNS:
            _runs.popitem(last=False)
    return entry


def _remember(run_id: str, record: dict[str, Any]) -> None:
    """Cập nhật bản ghi tiến độ, **giữ nguyên** nhật ký của run đó.

    Run đã bị thu hồi vì trần thì không hồi sinh: một bản ghi quay lại mà không còn nhật ký
    đi kèm chính là dạng lệch mà `RunEntry` sinh ra để loại bỏ.
    """
    with _store_lock:
        entry = _runs.get(run_id)
        if entry is None:
            return
        entry.record = record
        _runs.move_to_end(run_id)


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


def _proposed_text(state: PipelineState) -> str | None:
    """Câu đóng một lượt phân tích đạt `PROPOSED`, hoặc `None` nếu lượt này không đạt.

    **Cố ý KHÔNG nói "chờ bạn duyệt".** `POST /runs` không ghi gì vào CSDL — nó chạy đồ thị
    rồi trả kết quả trong bộ nhớ (`ai.service.ts::startRun` chỉ proxy, không `insert`). Nên
    lượt chạy này **không tạo ra phương án nào để duyệt**, và một dòng hứa cổng phê duyệt ở
    đây là để người vận hành ngồi đợi một cổng không tồn tại.

    Trạng thái "đang chờ duyệt" thuộc về **phương án trong CSDL**, thứ chỉ client biết. Nó
    được dựng ở đó, từ `isProposalReviewable(plan)`.

    Ba trường hợp trả `None` vì lượt chạy dừng do **không đạt** hoặc **không cần**:
    `quality_ok` sai (quality gate chặn), `planning_status == "not_required"` (không có hotspot
    chính sách nên quy trình dừng ngay sau Dự báo), và `decision` rỗng.
    """
    if state.get("quality_ok") is not True:
        return None
    decision = state.get("decision") or {}
    if not decision or decision.get("planning_status") == "not_required":
        return None
    plan_id = state.get("recommended_plan_id") or "phương án"
    # Nói đúng phạm vi của MÌNH: đồ thị dừng ở PROPOSED và không ghi gì. Câu cũ — "lượt chạy
    # này không ghi phương án nào vào CSDL" — đúng về `POST /runs` nhưng đọc ra thành sai ở
    # bảng điều hành, nơi lượt chạy luôn đi kèm một bước ghi ngay sau đó rồi phương án hiện ra.
    return f"đồ thị dừng ở PROPOSED, khuyến nghị {plan_id} — việc ghi phương án do bước sau đảm nhiệm"


def _execute(run_id: str, request: DecisionRequest, entry: RunEntry) -> None:
    """Chạy đồ thị. Hàm đồng bộ — được gọi trong thread riêng để không chặn event loop.

    Mọi lối ra đều phát `run_finished` **trước** khi ghi trạng thái cuối. Ghi ngược thứ tự
    thì một lượt poll chen vào giữa sẽ thấy `DONE`, dừng poll, và mất đúng dòng cuối cùng.
    """
    settings = get_settings()
    log = entry.log
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
            emit=log.append,
        )
    except NovaFourError as error:
        logger.warning("Run %s dừng vì %s", run_id, error.error_code)
        log.append(
            "run_finished",
            "graph",
            f"dừng vì {error.error_code}: {error.message}",
            source="system",
            ok=False,
            code=error.error_code,
        )
        _remember(
            run_id,
            {"run_id": run_id, "status": "FAILED", "error": {"code": error.error_code, "message": error.message}},
        )
        return
    except Exception as error:  # noqa: BLE001 - run hỏng không được làm chết tiến trình phục vụ.
        logger.exception("Run %s lỗi ngoài dự kiến", run_id)
        log.append(
            "run_finished",
            "graph",
            f"lỗi ngoài dự kiến: {error}",
            source="system",
            ok=False,
            code="INTERNAL_ERROR",
        )
        _remember(
            run_id, {"run_id": run_id, "status": "FAILED", "error": {"code": "INTERNAL_ERROR", "message": str(error)}}
        )
        return
    # Phát TRƯỚC `run_finished`: đây là chuyện xảy ra trong lượt chạy, không phải sau nó.
    # Chỉ ở đường thành công.
    proposed = _proposed_text(state)
    if proposed is not None:
        log.append("narration", "graph", proposed, source="system", code="GRAPH_PROPOSED")
    log.append("run_finished", "graph", "hoàn tất — quyết định sẵn sàng để duyệt", source="system", ok=True)
    _remember(run_id, {"run_id": run_id, "status": "DONE", **_render(state)})


@router.post("/runs", status_code=202)
async def start_run(request: DecisionRequest) -> dict[str, Any]:
    """Khởi động một lần chạy đồ thị và trả `run_id` ngay.

    Trả 202 chứ không phải 200: kết quả chưa có tại thời điểm trả lời, UI phải hỏi lại.
    """
    run_id = str(uuid.uuid4())
    entry = _open_entry(run_id)
    # Phát trước khi trả 202: lượt poll đầu tiên của UI phải có sẵn một dòng để hiện, chứ
    # không phải một mảng rỗng trông y hệt "chưa có gì xảy ra".
    entry.log.append(
        "run_started",
        "graph",
        f"nhận yêu cầu phân tích snapshot {request.snapshot_id}, horizon {request.horizon_min} phút",
        source="system",
    )
    # Đồ thị là code đồng bộ (optimizer chạy MILP), nên đẩy sang thread — chạy thẳng trên
    # event loop sẽ chặn mọi request khác trong lúc giải bài toán.
    asyncio.create_task(asyncio.to_thread(_execute, run_id, request, entry))
    return {"run_id": run_id, "status": "RUNNING"}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    """Tiến độ **và** nhật ký trong cùng một response.

    Không thêm endpoint riêng cho sự kiện, và không thêm tham số fetch tăng dần: một run
    deterministic phát khoảng 35 dòng, chế độ LLM khoảng 120 — nhỏ hơn payload `decision`
    đang gửi sẵn. Fetch tăng dần chỉ đổi lấy một đường merge phía client mà một response
    rớt là thủng nhật ký vĩnh viễn. Gửi cả mảng, client thay trọn gói.
    """
    with _store_lock:
        entry = _runs.get(run_id)
        record = dict(entry.record) if entry is not None else None
    if entry is None or record is None:
        raise HTTPException(status_code=404, detail={"code": "RUN_NOT_FOUND", "message": f"Không có run {run_id}."})
    return {**record, "events": [asdict(event) for event in entry.log.snapshot()]}


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
