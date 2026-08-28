"""Nhật ký không được làm dịch một con số nào — MA-6.4, MA-6.6.

`test_decision_giong_het_khi_co_va_khong_co_sink` là test giá trị cao nhất của cả phase: nó
biến câu khẳng định *"nhật ký là điểm cuối, không bao giờ là nguồn"* từ một dòng trong tài
liệu thành một phát biểu kiểm được bằng máy.

Cách kiểm: chạy đúng một pipeline hai lần trên cùng snapshot — một lần với `NULL_SINK` (mặc
định), một lần với `RunLog` thật — rồi so `decision` từng byte. Sự kiện không đi vào
`PipelineState`, nên hai bên bắt buộc bằng nhau; nếu một ngày nào đó có người nhét sự kiện
vào state cho tiện, test này đỏ trước khi kịp có ai tin vào một con số sai.

Chạy ở chế độ deterministic (`conftest.py` ép `LLM_ROUTING_ENABLED=false`), không request mạng.
"""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.common.policy import get_policy
from src.config import get_settings
from src.main import app
from src.orchestration.graph import run_pipeline
from src.orchestration.narration import narrate
from src.orchestration.run_log import EventKind, EventSource, RunLog
from src.orchestration.tools.decision_tools import RunContext, build_registry
from src.orchestration.tools.registry import AGENT_EXPLANATION, ToolPermissionError
from tests.test_orchestration_parity import _Zone, _zones_at

SOURCE_AT = "2026-09-25T08:30:00+07:00"
HORIZON_MIN = 5

# Chuỗi tool của chế độ deterministic, đúng thứ tự đã khóa ở test parity.
EXPECTED_TOOLS = (
    "run_forecast",
    "get_weather",
    "get_travel_conditions",
    "get_supply_state",
    "compute_relocation",
    "render_explanation",
)


@pytest.fixture(scope="module")
def zones() -> list[dict[str, object]]:
    with TestClient(app) as client:
        return _zones_at(client, SOURCE_AT)


def _fresh_context(zones: list[dict[str, object]]) -> RunContext:
    """Context mới cho mỗi lượt chạy.

    Bắt buộc phải mới: pipeline ghi `selection`, `targets`, `plan_variants`, `solve_result`
    ngược vào context. Dùng lại một context cho hai lượt sẽ là so lượt hai với chính kết quả
    lượt một — test xanh mà không chứng minh được gì.
    """
    settings = get_settings()
    return RunContext(
        zones=[_Zone(zone) for zone in zones],
        t=pd.Timestamp(SOURCE_AT),
        horizon_min=HORIZON_MIN,
        replay_source_at=pd.Timestamp(SOURCE_AT),
        policy=get_policy(settings.policy_path),
        settings=settings,
    )


def test_decision_giong_het_khi_co_va_khong_co_sink(zones: list[dict[str, object]]) -> None:
    """Bật nhật ký lên không được làm đổi một con số nào của quyết định."""
    im_lang = run_pipeline(_fresh_context(zones), snapshot_id="ev", data_source="AI_PARQUET_REPLAY:ev")

    log = RunLog()
    co_nhat_ky = run_pipeline(
        _fresh_context(zones),
        snapshot_id="ev",
        data_source="AI_PARQUET_REPLAY:ev",
        emit=log.append,
    )

    assert co_nhat_ky["decision"] == im_lang["decision"]
    assert co_nhat_ky["plan_set"] == im_lang["plan_set"]
    assert co_nhat_ky["recommended_plan_id"] == im_lang["recommended_plan_id"]
    assert [call.tool for call in co_nhat_ky["tool_calls"]] == [call.tool for call in im_lang["tool_calls"]]
    assert co_nhat_ky["warnings"] == im_lang["warnings"]

    # Và nhật ký thật sự có ghi được gì đó — nếu không, phép so trên là so hai lượt im lặng.
    assert len(log.snapshot()) > 0


def test_su_kien_khong_ro_ri_vao_state(zones: list[dict[str, object]]) -> None:
    """Sự kiện chảy ra ngoài qua sink, không nằm lại trong `PipelineState`."""
    log = RunLog()
    state = run_pipeline(
        _fresh_context(zones),
        snapshot_id="ev",
        data_source="AI_PARQUET_REPLAY:ev",
        emit=log.append,
    )

    assert "events" not in state
    assert log.snapshot(), "Sink phải nhận được sự kiện, nếu không test này vô nghĩa."


def test_nhat_ky_ghi_du_dau_vet_sau_tool_theo_dung_thu_tu(zones: list[dict[str, object]]) -> None:
    """Mỗi lượt gọi tool để lại một cặp started/finished — đây là thứ CLI agent hiển thị."""
    log = RunLog()
    run_pipeline(_fresh_context(zones), snapshot_id="ev", data_source="AI_PARQUET_REPLAY:ev", emit=log.append)

    events = log.snapshot()
    started = [event.tool for event in events if event.kind == "tool_started"]
    finished = [event.tool for event in events if event.kind == "tool_finished"]

    assert tuple(started) == EXPECTED_TOOLS
    assert tuple(finished) == EXPECTED_TOOLS
    assert all(event.ok for event in events if event.kind == "tool_finished")


def test_nhat_ky_ghi_moc_bat_dau_va_ket_thuc_cua_tung_agent(zones: list[dict[str, object]]) -> None:
    log = RunLog()
    run_pipeline(_fresh_context(zones), snapshot_id="ev", data_source="AI_PARQUET_REPLAY:ev", emit=log.append)

    events = log.snapshot()
    started = [event.actor for event in events if event.kind == "agent_started"]
    finished = [event.actor for event in events if event.kind == "agent_finished"]

    assert started == ["situation_assessment", "dispatch", "optimization", "explanation"]
    assert finished == started


def test_moi_dong_deu_co_seq_don_dieu_va_actor_khong_rong(zones: list[dict[str, object]]) -> None:
    log = RunLog()
    run_pipeline(_fresh_context(zones), snapshot_id="ev", data_source="AI_PARQUET_REPLAY:ev", emit=log.append)

    events = log.snapshot()
    assert [event.seq for event in events] == list(range(1, len(events) + 1))
    assert all(event.actor for event in events)
    assert all(event.text for event in events)


def test_sink_hong_khong_lam_hong_quyet_dinh(zones: list[dict[str, object]]) -> None:
    """Một sink ném lỗi ở mọi dòng vẫn phải cho ra đúng quyết định đó."""

    def _sink_hong(
        kind: EventKind,
        actor: str,
        text: str,
        *,
        source: EventSource = "deterministic",
        tool: str | None = None,
        ok: bool | None = None,
        code: str | None = None,
    ) -> None:
        raise RuntimeError("sink hỏng ở mọi dòng")

    lanh_lan = run_pipeline(_fresh_context(zones), snapshot_id="ev", data_source="AI_PARQUET_REPLAY:ev")
    voi_sink_hong = run_pipeline(
        _fresh_context(zones),
        snapshot_id="ev",
        data_source="AI_PARQUET_REPLAY:ev",
        emit=_sink_hong,
    )

    assert voi_sink_hong["decision"] == lanh_lan["decision"]


def test_tool_ngoai_allowlist_phat_tool_denied_truoc_khi_nem(zones: list[dict[str, object]]) -> None:
    """`tool_denied` là dòng đáng phơi ra nhất: lúc một agent với ra ngoài phạm vi của nó.

    Phát ở `ToolRegistry.invoke` chứ không ở runner, nên nhánh guardrail cũng được ghi lại —
    kể cả khi bên trên bắt exception rồi đi tiếp.
    """
    registry = build_registry(_fresh_context(zones))
    log = RunLog()
    registry.observe(log.append)

    with pytest.raises(ToolPermissionError):
        registry.invoke(AGENT_EXPLANATION, "compute_relocation", {})

    events = log.snapshot()
    assert len(events) == 1
    assert events[0].kind == "tool_denied"
    assert events[0].tool == "compute_relocation"
    assert events[0].ok is False
    assert events[0].code == "TOOL_NOT_ALLOWED"


@pytest.mark.parametrize(
    ("tool", "result", "phai_chua"),
    [
        ("compute_relocation", {"status": "ok", "planning_status": "not_required", "move_count": 0}, "0 chặng"),
        (
            "compute_relocation",
            {
                "status": "ok",
                "planning_status": "optimizer_evaluated",
                "move_count": 3,
                "total_units": 15,
                "total_cost": 197681,
                "budget_cap": 500000,
                "residual_zone_count": 1,
            },
            "197681",
        ),
        (
            "run_forecast",
            {"status": "error", "code": "DATASET_UNAVAILABLE", "message": "thiếu parquet"},
            "thiếu parquet",
        ),
        ("tool_khong_co_formatter", {"status": "ok"}, "xong"),
    ],
)
def test_narration_doc_nguyen_van_so_tu_dict_tool(tool: str, result: dict[str, object], phai_chua: str) -> None:
    """Không cộng, không chia, không làm tròn, không định dạng lại — cùng luật vỏ mỏng.

    Đặc biệt: `197681` phải xuất hiện nguyên vẹn, không thành `197.681`. Một câu tường thuật
    tự định dạng số là một chỗ thứ hai cài quy tắc, và khi hai chỗ lệch thì người đọc log tin
    vào chỗ sai.
    """
    assert phai_chua in narrate(tool, result)


def test_narration_khong_nuot_loi_cua_tool() -> None:
    """Lỗi tool phải thành một dòng đọc được, không thành khoảng trống (CLAUDE.md §9 #3)."""
    text = narrate("get_supply_state", {"status": "error", "message": "Chưa có dự báo; gọi run_forecast trước."})
    assert "get_supply_state" in text
    assert "run_forecast" in text
