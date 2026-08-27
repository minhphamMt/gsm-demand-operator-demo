"""Đồ thị LangGraph của tầng phân tích — `agent/04-agent-architecture.md` §3.

Node được dựng dạng closure quanh `RunContext` và `ToolRegistry` của đúng run đó, thay vì
nhét hai object này vào state. Lý do: state của LangGraph là thứ đi vào checkpoint, còn
`RunContext` giữ tham chiếu tới policy, settings và kết quả model — không phải dữ liệu để
tuần tự hoá. Dựng đồ thị là thao tác rẻ, nên dựng mới mỗi run là đánh đổi đúng.

Đồ thị dừng ở trạng thái `PROPOSED`. Không có node `apply_relocation`, `campaign_gate` hay
`issue_offers`: hai cổng phê duyệt và mọi side effect do NestJS giữ (CLAUDE.md §11.1).
"""

import logging
import re
import uuid
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from src.activation.recommendation import recommend_activation
from src.common.errors import DatasetUnavailableError
from src.optimizer.greedy import PlanStrategy, SolveResult
from src.orchestration.agents.client import LLMClient
from src.orchestration.agents.runner import AgentRun, run_deterministic, run_with_llm
from src.orchestration.prompts import PROMPTS
from src.orchestration.state import (
    AgentReport,
    AssessmentContext,
    PipelineState,
    initial_agent_reports,
    now_iso,
)
from src.orchestration.steps import (
    NO_POLICY_HOTSPOT,
    RISK_ADVISORY_PROPOSAL,
    assemble_decision,
    dataset_source_kind,
)
from src.orchestration.tools.decision_tools import (
    DETERMINISTIC_SEQUENCE,
    RunContext,
    build_registry,
    solve_strategy,
)
from src.orchestration.tools.registry import (
    AGENT_ASSESSMENT,
    AGENT_DISPATCH,
    AGENT_EXPLANATION,
    ToolRegistry,
)

logger = logging.getLogger(__name__)

# Thứ tự hiển thị A → B → C và ánh xạ sang strategy — `agent/05` §5.
PLAN_ORDER: tuple[PlanStrategy, ...] = ("MIN_COST", "BALANCED", "MIN_ETA")
PLAN_IDS: dict[PlanStrategy, str] = {"MIN_COST": "PLAN_A", "BALANCED": "PLAN_B", "MIN_ETA": "PLAN_C"}
STRATEGY_BY_PLAN_ID: dict[str, PlanStrategy] = {plan_id: strategy for strategy, plan_id in PLAN_IDS.items()}

# Gắn version vào scoring để một bản ghi cũ vẫn tra được nó đã chấm bằng luật nào.
SCORING_VERSION = "v1"


def _recommend(variants: dict[PlanStrategy, SolveResult]) -> PlanStrategy:
    """Chọn phương án khuyến nghị bằng luật deterministic.

    Thứ tự tiêu chí: phủ được nhiều xe nhất → rẻ nhất → tới sớm nhất → `BALANCED` khi hoà.

    Ưu tiên `BALANCED` ở bước phá hoà không phải cho tiện: ba strategy hiện hội tụ, và neo
    kết quả vào `BALANCED` giữ cho quyết định của đồ thị trùng đúng `POST /decisions`. Khi
    nào chúng thực sự tách ra, test parity sẽ đỏ — đó là tín hiệu cần thấy, không phải lỗi
    cần che.
    """
    def key(strategy: PlanStrategy) -> tuple[int, int, int, int]:
        result = variants[strategy]
        return (
            -result.plan_totals.total_units,
            result.plan_totals.total_cost,
            sum(move.eta_steps * move.units_to_move for move in result.moves),
            0 if strategy == "BALANCED" else 1,
        )

    return min(PLAN_ORDER, key=key)


class GraphDependencies:
    """Phụ thuộc của một run: context, registry, client LLM và cấu hình chế độ."""

    def __init__(self, context: RunContext, *, llm_client: LLMClient | None = None) -> None:
        self.context = context
        self.registry: ToolRegistry = build_registry(context)
        settings = context.settings
        self.llm_enabled = settings.llm_routing_enabled
        self.max_rounds = settings.llm_max_tool_rounds
        self.model_analysis = settings.llm_model_analysis
        self.model_explanation = settings.llm_model_explanation
        self.client = llm_client or LLMClient(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            timeout_seconds=settings.llm_timeout_seconds,
        )

    def run_agent(self, agent: str, *, model: str, user_prompt: str) -> AgentRun:
        """Chạy một agent theo chế độ đang bật.

        Thiếu khóa API cũng chạy deterministic chứ không phải lỗi: một máy demo chưa cấu
        hình gateway vẫn phải cho ra phương án đầy đủ.
        """
        sequence = DETERMINISTIC_SEQUENCE[agent]
        if not self.llm_enabled or not self.client.configured:
            return run_deterministic(agent=agent, registry=self.registry, sequence=sequence)
        return run_with_llm(
            agent=agent,
            registry=self.registry,
            client=self.client,
            model=model,
            system_prompt=PROMPTS[agent],
            user_prompt=user_prompt,
            fallback_sequence=sequence,
            max_rounds=self.max_rounds,
        )


def build_graph(deps: GraphDependencies) -> Any:
    """Dựng và compile đồ thị cho một run."""
    context = deps.context

    def load_context(state: PipelineState) -> dict[str, Any]:
        return {
            "run_id": state.get("run_id") or str(uuid.uuid4()),
            "trace_id": state.get("trace_id") or str(uuid.uuid4()),
            "routing_mode": "llm" if (deps.llm_enabled and deps.client.configured) else "deterministic",
            "policy_version": context.policy.version,
            "agent_reports": initial_agent_reports(),
            "warnings": [],
            "tool_calls": [],
        }

    def route_trigger(state: PipelineState) -> dict[str, Any]:
        """Chặn sớm khi không có gì để phân tích.

        Ở phiên bản này chỉ có nhánh NEW_INCIDENT: dedup/cooldown/REPLAN cần state liên
        tục giữa các step, mà state đó nằm ở Supabase chứ không ở đây. Khai báo sẵn nhánh
        SUPPRESS mà không có đường nào đi vào sẽ là nhánh chết (CLAUDE.md §4 #2).
        """
        return {"route": "NEW_INCIDENT", "route_reason": "Snapshot mới cần đánh giá."}

    def situation_assessment(state: PipelineState) -> dict[str, Any]:
        started_at = now_iso()
        run = deps.run_agent(
            AGENT_ASSESSMENT,
            model=deps.model_analysis,
            user_prompt=(
                f"Đánh giá tình hình cung–cầu tại thời điểm {context.t.isoformat()}, "
                f"horizon {context.horizon_min} phút, {len(context.zones)} zone."
            ),
        )
        reports = dict(state.get("agent_reports") or initial_agent_reports())
        assessment_report = AgentReport(
            capabilities=reports[AGENT_ASSESSMENT].capabilities,
            started_at=started_at,
        )

        # Ánh xạ tool → capability để UI vẽ đúng ba thẻ Forecast/Traffic/Supply.
        tool_to_capability = {
            "run_forecast": "forecast",
            "get_weather": "traffic",
            "get_travel_conditions": "traffic",
            "get_supply_state": "supply",
        }
        for call in run.tool_calls:
            capability = tool_to_capability.get(call.tool)
            if capability is None:
                continue
            report = assessment_report.capabilities[capability]
            report.status = "DONE" if call.ok else "FAILED"
            report.message = call.detail

        if context.selection is None or context.targets is None:
            assessment_report.status = "FAILED"
            assessment_report.message = "Không dựng được bối cảnh đánh giá."
            assessment_report.finished_at = now_iso()
            reports[AGENT_ASSESSMENT] = assessment_report
            return {
                "agent_reports": reports,
                "tool_calls": list(run.tool_calls),
                "warnings": [*run.warnings, {"code": "ASSESSMENT_INCOMPLETE", "message": assessment_report.message}],
                "quality_ok": False,
                "quality_reason": "assessment_incomplete",
            }

        assessment_report.status = "WARNING" if any(not call.ok for call in run.tool_calls) else "DONE"
        assessment_report.finished_at = now_iso()
        reports[AGENT_ASSESSMENT] = assessment_report
        return {
            "assessment": AssessmentContext(
                selection=context.selection,
                targets=context.targets,
                rain_mm_h=context.rain_mm_h,
                idle_supply=context.idle_supply,
            ),
            "agent_reports": reports,
            "tool_calls": list(run.tool_calls),
            "warnings": list(run.warnings),
            "model_version": context.selection.forecast.model_version,
        }

    def dispatch(state: PipelineState) -> dict[str, Any]:
        started_at = now_iso()
        run = deps.run_agent(
            AGENT_DISPATCH,
            model=deps.model_analysis,
            user_prompt="Sinh phương án điều chuyển xe từ zone dư sang zone thiếu.",
        )
        reports = dict(state.get("agent_reports") or initial_agent_reports())
        ok = context.solve_result is not None
        reports[AGENT_DISPATCH] = AgentReport(
            status="DONE" if ok else "FAILED",
            message="" if ok else "Không giải được bài toán điều chuyển.",
            started_at=started_at,
            finished_at=now_iso(),
        )
        return {
            "agent_reports": reports,
            "tool_calls": list(run.tool_calls),
            "warnings": list(run.warnings),
        }

    def generate_plans(state: PipelineState) -> dict[str, Any]:
        """Sinh ba phương án theo strategy cố định — `agent/05` §5.

        Deterministic có chủ ý, không phải tool của LLM: "Ba phương án được tạo bằng strategy
        cố định, không để LLM tự quyết định". LLM chọn strategy sẽ làm mất khả năng tái lập
        của chính tập phương án đem cho người duyệt.
        """
        if context.targets is None:
            return {}
        for strategy in PLAN_ORDER:
            context.plan_variants[strategy] = solve_strategy(context, strategy)
        return {}

    def score_and_rank(state: PipelineState) -> dict[str, Any]:
        started_at = now_iso()
        """Chấm điểm và chọn phương án khuyến nghị — code thuần, không qua LLM.

        Ba strategy tối ưu ba hàm mục tiêu đều tăng theo khoảng cách, nên trên dữ liệu và
        policy hiện tại chúng thường **hội tụ về cùng một phương án**. Đó là thông tin thật
        và được ghi vào `plan_set.converged` — hiện ba thẻ giống hệt nhau mà không nói gì là
        làm điều phối viên tưởng mình có ba lựa chọn.
        """
        reports = dict(state.get("agent_reports") or initial_agent_reports())
        if not context.plan_variants:
            reports["optimization"] = AgentReport(
                status="FAILED",
                message="Không có phương án để chấm điểm.",
                started_at=started_at,
                finished_at=now_iso(),
            )
            return {"agent_reports": reports, "quality_ok": False, "quality_reason": "no_plan"}

        plans = [
            {
                "plan_id": PLAN_IDS[strategy],
                "strategy": strategy,
                "move_count": len(result.moves),
                "total_units": result.plan_totals.total_units,
                "total_cost": result.plan_totals.total_cost,
                "total_eta_step_units": sum(move.eta_steps * move.units_to_move for move in result.moves),
                "residual_zone_count": len(result.residual_gap),
            }
            for strategy, result in ((s, context.plan_variants[s]) for s in PLAN_ORDER)
        ]
        distinct = {context.plan_variants[strategy].moves for strategy in PLAN_ORDER}
        converged = len(distinct) == 1

        reports["optimization"] = AgentReport(
            status="DONE",
            message="Ba chiến lược hội tụ về cùng một phương án." if converged else "",
            started_at=started_at,
            finished_at=now_iso(),
        )
        warnings: list[dict[str, object]] = []
        if converged:
            warnings.append(
                {
                    "code": "PLAN_STRATEGIES_CONVERGED",
                    "severity": "info",
                    "message": (
                        "Ba chiến lược MIN_COST/BALANCED/MIN_ETA cho ra cùng một phương án: "
                        "với dữ liệu và ngưỡng hiện tại, chi phí và ETA cùng tăng theo quãng đường "
                        "nên không có đánh đổi giữa chúng."
                    ),
                }
            )
        return {
            "agent_reports": reports,
            "warnings": warnings,
            "plan_set": {
                "plans": plans,
                "scoring_version": SCORING_VERSION,
                "converged": converged,
                "distinct_plan_count": len(distinct),
            },
            "recommended_plan_id": PLAN_IDS[_recommend(context.plan_variants)],
        }

    def quality_gate(state: PipelineState) -> dict[str, Any]:
        """Loại phương án vi phạm ràng buộc tối thiểu trước khi đưa cho người duyệt."""
        result = context.solve_result
        if result is None:
            return {"quality_ok": False, "quality_reason": "no_plan"}
        cap = result.plan_totals.budget_cap
        if cap > 0 and result.plan_totals.total_cost > cap:
            # Guardrail deterministic: LLM không có đường đi vòng qua trần ngân sách.
            return {"quality_ok": False, "quality_reason": "budget_exceeded"}
        return {"quality_ok": True, "quality_reason": ""}

    def explain(state: PipelineState) -> dict[str, Any]:
        started_at = now_iso()
        run = deps.run_agent(
            AGENT_EXPLANATION,
            model=deps.model_explanation,
            user_prompt="Viết 2–3 câu tiếng Việt giải thích phương án cho điều phối viên.",
        )
        reports = dict(state.get("agent_reports") or initial_agent_reports())
        source = run.results.get("render_explanation", {})
        template_text = _render_template(source)
        llm_text = run.text.strip()
        used_llm = bool(llm_text) and _numbers_are_grounded(llm_text, source)
        if llm_text and not used_llm:
            logger.warning("Văn bản LLM chứa số không khớp nguồn; dùng template Lớp 1.")
        reports[AGENT_EXPLANATION] = AgentReport(status="DONE", started_at=started_at, finished_at=now_iso())
        extra_warnings = list(run.warnings)
        if llm_text and not used_llm:
            extra_warnings.append(
                {
                    "code": "EXPLANATION_LLM_REJECTED",
                    "severity": "info",
                    "message": "Văn bản LLM chứa số không có trong nguồn; đã thay bằng template.",
                }
            )
        return {
            "agent_reports": reports,
            "tool_calls": list(run.tool_calls),
            "warnings": extra_warnings,
            "explanation": {
                "text": llm_text if used_llm else template_text,
                "source_values": source,
                "layer": "llm" if used_llm else "template",
            },
        }

    def assemble(state: PipelineState) -> dict[str, Any]:
        """Dựng payload cuối, dùng đúng hàm mà `POST /decisions` dùng."""
        selection = context.selection
        targets = context.targets
        # Quyết định đem đi duyệt là phương án ĐƯỢC KHUYẾN NGHỊ, không phải phương án mà
        # Dispatch tình cờ giải trước. Hôm nay hai thứ trùng nhau vì ba strategy hội tụ;
        # test parity sẽ đỏ ngay khi chúng tách ra, và đó đúng là lúc cần biết.
        strategy = STRATEGY_BY_PLAN_ID.get(str(state.get("recommended_plan_id")), "BALANCED")
        result = context.plan_variants.get(strategy) or context.solve_result
        if selection is None or targets is None or result is None:
            return {"decision": {}}

        if targets.planning_output.hotspots:
            planning_status = "optimizer_evaluated"
            reason_code = None if targets.hotspot_output.hotspots else RISK_ADVISORY_PROPOSAL
        else:
            planning_status = "not_required"
            reason_code = NO_POLICY_HOTSPOT

        activation = recommend_activation(
            result.residual_gap,
            incentive_amount=context.policy.rules.incentive_base,
            incentive_budget_cap=context.policy.rules.incentive_budget_cap,
            overbooking_factor=context.policy.rules.overbooking_factor,
            assumed_accept_rate=context.policy.rules.assumed_accept_rate,
        )
        try:
            source_kind = dataset_source_kind(context.replay_source_at)
        except DatasetUnavailableError as error:
            return {"decision": {}, "warnings": [{"code": error.error_code, "message": error.message}]}

        payload = state.get("request_payload") or {}
        return {
            "decision": assemble_decision(
                snapshot_id=payload.get("snapshot_id", ""),  # type: ignore[arg-type]
                data_source=str(payload.get("data_source", "")),
                selection=selection,
                targets=targets,
                result=result,
                activation=activation,
                policy=context.policy,
                replay_source_at_iso=(
                    context.replay_source_at.isoformat() if context.replay_source_at is not None else None
                ),
                source_kind=source_kind,
                planning_status=planning_status,
                reason_code=reason_code,
            )
        }

    graph: StateGraph = StateGraph(PipelineState)
    graph.add_node("load_context", load_context)
    graph.add_node("route_trigger", route_trigger)
    graph.add_node("situation_assessment", situation_assessment)
    graph.add_node("dispatch", dispatch)
    graph.add_node("generate_plans", generate_plans)
    graph.add_node("score_and_rank", score_and_rank)
    graph.add_node("quality_gate", quality_gate)
    graph.add_node("explain", explain)
    graph.add_node("assemble", assemble)

    graph.add_edge(START, "load_context")
    graph.add_edge("load_context", "route_trigger")
    graph.add_conditional_edges(
        "route_trigger",
        lambda state: state.get("route", "NEW_INCIDENT"),
        {"NEW_INCIDENT": "situation_assessment", "SUPPRESS": END},
    )
    graph.add_conditional_edges(
        "situation_assessment",
        lambda state: "ok" if state.get("assessment") is not None else "stop",
        {"ok": "dispatch", "stop": END},
    )
    graph.add_edge("dispatch", "generate_plans")
    graph.add_edge("generate_plans", "score_and_rank")
    graph.add_edge("score_and_rank", "quality_gate")
    graph.add_conditional_edges(
        "quality_gate",
        lambda state: "ok" if state.get("quality_ok") else "stop",
        {"ok": "explain", "stop": END},
    )
    graph.add_edge("explain", "assemble")
    graph.add_edge("assemble", END)

    return graph.compile(checkpointer=InMemorySaver())


def _render_template(source: dict[str, Any]) -> str:
    """Giải thích Lớp 1: ghép từ số nguồn, deterministic, không cần mạng."""
    if source.get("status") != "ok":
        return "Chưa đủ dữ liệu để giải thích phương án."
    moves = source.get("move_count", 0)
    units = source.get("total_units", 0)
    cost = source.get("total_cost", 0)
    residual = source.get("residual_zone_count", 0)
    hotspots = source.get("policy_hotspot_count", 0)
    if moves == 0:
        return f"Không sinh phương án điều chuyển: {hotspots} hotspot chính sách, không có nguồn phù hợp."
    return (
        f"Điều {units} xe qua {moves} chặng, chi phí {cost} VNĐ, "
        f"xử lý {hotspots} hotspot chính sách. Còn {residual} zone chưa phủ hết thiếu hụt."
    )


# Dấu phân cách hàng nghìn: đứng giữa một chữ số và ĐÚNG ba chữ số tiếp theo. Tiếng Việt dùng
# dấu chấm (197.681), một số model trả về dấu phẩy (197,681) — nhận cả hai.
# Điều kiện `(?!\d)` giữ cho "3,5 phút" không bị nối thành "35": sau dấu phải đúng ba chữ số.
_THOUSANDS_SEPARATOR = re.compile(r"(?<=\d)[.,](?=\d{3}(?!\d))")


def _numbers_are_grounded(text: str, source: dict[str, Any]) -> bool:
    """Mọi số nguyên trong văn bản phải có mặt trong tập số nguồn.

    Đây là chỗ ép nguyên tắc "LLM đọc số, không sinh số" (CLAUDE.md §10.1 #5).

    Phải gỡ dấu phân cách hàng nghìn TRƯỚC khi tách số. Không gỡ thì "197.681 đồng" bị đọc
    thành hai số "197" và "681", cả hai đều không có trong nguồn — nên mọi văn bản tiếng Việt
    có định dạng tiền đều bị loại, và tầng LLM thành code chết trong khi log vẫn trông như
    guardrail đang làm đúng việc.

    Nới cho dấu phân cách không phải nới cho số bịa: sau khi chuẩn hoá vẫn là phép kiểm tập
    con, nên số không có trong nguồn vẫn bị loại.
    """
    allowed = {str(value) for value in source.values() if isinstance(value, int) and not isinstance(value, bool)}
    normalised = _THOUSANDS_SEPARATOR.sub("", text)
    found = set(re.findall(r"\d+", normalised))
    return found.issubset(allowed)


def run_pipeline(
    context: RunContext,
    *,
    snapshot_id: int | str,
    data_source: str,
    llm_client: LLMClient | None = None,
) -> PipelineState:
    """Chạy trọn đồ thị cho một snapshot và trả state cuối.

    `thread_id` gắn với `run_id`: một run là một thread checkpoint, nên hai request song
    song không giẫm lên state của nhau.
    """
    deps = GraphDependencies(context, llm_client=llm_client)
    compiled = build_graph(deps)
    run_id = str(uuid.uuid4())
    initial: PipelineState = {
        "run_id": run_id,
        "snapshot_id": snapshot_id,
        "request_payload": {"snapshot_id": snapshot_id, "data_source": data_source},
    }
    final: PipelineState = compiled.invoke(
        initial,
        config={"configurable": {"thread_id": run_id}},
    )
    return final
