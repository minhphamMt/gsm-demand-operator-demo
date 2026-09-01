"""Ô nhập của người vận hành — Chặng 7.

Hai khẳng định đáng tiền:

1. **Không câu chữ nào chạm được cổng phê duyệt.** Route chặn trước khi LLM có cơ hội nói
   bất cứ điều gì, và không tool nào được gọi trên đường đó.
2. **Phiên hỏi–đáp không làm dịch một con số nào của quyết định.** Đây là bản viết lại của
   điều luật "nhật ký không bao giờ là nguồn" sau khi ô nhập làm nhật ký thành hai chiều.

Test chạy với `LLM_ROUTING_ENABLED=false` (conftest ép), nên chúng đi đúng **đường đỡ** —
tức là đường phải còn chạy khi gateway hỏng giữa buổi demo.
"""

from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.api import routes_observe as module
from src.api.routes_observe import ObserveRequest, _respond
from src.common.policy import get_policy
from src.config import get_settings
from src.hotspot.detector import meets_condition
from src.main import app
from src.orchestration.graph import run_pipeline
from src.orchestration.intent import classify
from src.orchestration.narration import narrate
from src.orchestration.run_log import RunLog
from src.orchestration.tools.decision_tools import OBSERVER_TOOLS, RunContext, build_registry
from src.orchestration.tools.registry import AGENT_ASSESSMENT, AGENT_OBSERVER, ToolPermissionError
from src.simulation.metrics import system_metrics, unmet
from tests.test_orchestration_parity import _Zone, _zones_at

SOURCE_AT = "2026-09-25T08:30:00+07:00"


@pytest.fixture(autouse=True)
def phien_sach() -> Any:
    truoc = dict(module._sessions)
    module._sessions.clear()
    yield
    module._sessions.clear()
    module._sessions.update(truoc)


@pytest.fixture(scope="module")
def zones() -> list[dict[str, object]]:
    with TestClient(app) as client:
        return _zones_at(client, SOURCE_AT)


def _payload(zones: list[dict[str, object]], text: str, session_id: str = "S1") -> dict[str, Any]:
    return {
        "session_id": session_id,
        "text": text,
        "snapshot_id": "observe",
        "t": SOURCE_AT,
        "horizon_min": 15,
        "data_source": "AI_PARQUET_REPLAY:observe",
        "replay_source_at": SOURCE_AT,
        "zones": zones,
    }


def _context(zones: list[dict[str, object]]) -> RunContext:
    settings = get_settings()
    return RunContext(
        zones=[_Zone(zone) for zone in zones],
        t=pd.Timestamp(SOURCE_AT),
        horizon_min=15,
        replay_source_at=pd.Timestamp(SOURCE_AT),
        policy=get_policy(settings.policy_path),
        settings=settings,
    )


# --- Ranh giới cứng: không câu chữ nào mở được cổng --------------------------------------


@pytest.mark.parametrize("cau", ["duyệt luôn đi", "phê duyệt PLAN_B", "phát offer cho tài xế", "kich hoat campaign"])
def test_lenh_cham_cong_bi_tu_choi_va_khong_goi_tool_nao(zones: list[dict[str, object]], cau: str) -> None:
    with TestClient(app) as client:
        response = client.post("/api/v1/observe", json=_payload(zones, cau))

    assert response.status_code == 202
    assert response.json()["action"] is None, "Không directive nào được sinh ra từ lệnh chạm cổng."

    events = module._sessions["S1"].snapshot()
    assert [event.code for event in events] == ["GATE_IS_UI_ONLY"]
    # Chặn trước khi chạy bất cứ thứ gì: không có dòng tool nào trên đường này.
    assert not [event for event in events if event.kind.startswith("tool_")]


def test_directive_chi_co_the_la_start_run(zones: list[dict[str, object]]) -> None:
    """Danh sách hành động client được phép thi hành đúng bằng một, và nó vô hại."""
    with TestClient(app) as client:
        chay = client.post("/api/v1/observe", json=_payload(zones, "chạy phân tích giúp tôi")).json()
        hoi = client.post("/api/v1/observe", json=_payload(zones, "thời tiết thế nào", "S2")).json()
        cong = client.post("/api/v1/observe", json=_payload(zones, "duyệt đi", "S3")).json()

    assert chay["action"] == "start_run"
    assert hoi["action"] is None
    assert cong["action"] is None


@pytest.mark.parametrize(
    ("cau", "directive"),
    [
        ("chạy phân tích giúp tôi", "start_run"),
        ("chạy dự báo", "start_forecast"),
        ("tính phương án điều chuyển", "start_optimize"),
    ],
)
def test_ba_directive_va_khong_cai_nao_cham_cong(zones: list[dict[str, object]], cau: str, directive: str) -> None:
    """Cả ba chỉ khởi động thứ một cú bấm nút vẫn khởi động được, đi đúng đường cũ."""
    with TestClient(app) as client:
        body = client.post("/api/v1/observe", json=_payload(zones, cau)).json()

    assert body["action"] == directive


def test_route_khong_tu_chay_pipeline_ma_chi_bao_client(zones: list[dict[str, object]]) -> None:
    """Một đường tạo run, không phải hai: route chỉ phát directive, client gọi POST /runs."""
    with TestClient(app) as client:
        client.post("/api/v1/observe", json=_payload(zones, "chạy phân tích"))
        events = module._sessions["S1"].snapshot()

    assert [event.kind for event in events] == ["narration"]
    assert not [event for event in events if event.kind.startswith("tool_")]


# --- Allowlist của observer -------------------------------------------------------------


def test_allowlist_observer_la_tap_con_that_su_cua_registry(zones: list[dict[str, object]]) -> None:
    """Bằng đúng Assessment (bốn tool đó vốn chỉ-đọc cả bốn), nhưng NHỎ HƠN HẲN cả registry.

    Vế thứ hai mới là vế giữ an toàn: nó nói rằng có tool trong hệ thống mà observer không
    với tới được, và `compute_relocation` là một trong số đó.
    """
    registry = build_registry(_context(zones))
    observer = registry.allowlist_of(AGENT_OBSERVER)

    assert observer == OBSERVER_TOOLS
    assert observer == registry.allowlist_of(AGENT_ASSESSMENT)
    assert observer < registry.tool_names
    assert {"compute_relocation", "render_explanation"}.isdisjoint(observer)


@pytest.mark.parametrize("tool", ["compute_relocation", "render_explanation"])
def test_observer_khong_cham_duoc_tool_sinh_quyet_dinh(zones: list[dict[str, object]], tool: str) -> None:
    """Chat mà đẻ được phương án là đẻ ra ngoài cổng phê duyệt."""
    registry = build_registry(_context(zones))
    log = RunLog()
    registry.observe(log.append)

    with pytest.raises(ToolPermissionError):
        registry.invoke(AGENT_OBSERVER, tool, {})

    assert [event.kind for event in log.snapshot()] == ["tool_denied"]


def test_observer_khong_thay_schema_cua_tool_ngoai_pham_vi(zones: list[dict[str, object]]) -> None:
    registry = build_registry(_context(zones))
    names = {schema["function"]["name"] for schema in registry.schemas_for(AGENT_OBSERVER)}

    assert names == set(OBSERVER_TOOLS)


# --- Tool trả lời câu hỏi về hiện tại ----------------------------------------------------


def test_shortage_hien_tai_khong_can_forecast_chay_truoc(zones: list[dict[str, object]]) -> None:
    """Khác biệt cốt lõi so với `get_supply_state`: không có `selection` vẫn trả số, không trả lỗi.

    Đây là lý do tool này tồn tại. `get_supply_state` chặn ngay ở dòng đầu khi chưa có dự báo,
    nên mọi câu hỏi đi qua nó đều bị kéo sang mốc +horizon phút.
    """
    context = _context(zones)
    registry = build_registry(context)

    assert context.selection is None
    result = registry.invoke(AGENT_OBSERVER, "get_current_shortage", {})

    assert result["status"] == "ok"
    assert context.selection is None, "tool hiện tại không được âm thầm chạy dự báo"


def test_shortage_dung_lai_luat_hotspot_va_loi_metric_chung(zones: list[dict[str, object]]) -> None:
    """Không có công thức thứ hai: cùng `meets_condition` (§4.3) và `system_metrics` đã khoá.

    Test tự tính lại bằng CHÍNH hai hàm nguồn. Nếu tool cài lại phép tính, con số sẽ lệch và
    test đỏ — đó là toàn bộ mục đích của CLAUDE.md §2 và §5.2.
    """
    context = _context(zones)
    result = build_registry(context).invoke(AGENT_OBSERVER, "get_current_shortage", {})

    min_supply = context.policy.rules.min_supply_per_zone
    mong_doi = sorted(
        zone.zone_id
        for zone in context.zones
        if meets_condition(
            predicted_supply=float(zone.idle_supply),
            gap=unmet(float(zone.demand_observed), float(zone.idle_supply)),
            predicted_demand=float(zone.demand_observed),
            min_supply_per_zone=min_supply,
        )
    )
    totals = system_metrics((float(z.demand_observed), float(z.idle_supply)) for z in context.zones)

    assert sorted(result["shortage_zone_ids"]) == mong_doi
    assert result["shortage_zone_count"] == len(mong_doi)
    assert result["total_unmet_now"] == pytest.approx(totals.unmet_demand)
    assert result["min_supply_per_zone"] == min_supply


def test_shortage_chi_dem_xe_dang_ranh_khong_cong_xe_dang_tren_duong(
    zones: list[dict[str, object]],
) -> None:
    """`enroute_supply` là tương lai. Cộng vào là trộn lại đúng thứ tool này sinh ra để tách."""
    context = _context(zones)
    result = build_registry(context).invoke(AGENT_OBSERVER, "get_current_shortage", {})

    assert result["total_idle_supply"] == sum(zone.idle_supply for zone in context.zones)
    for row in result["zone_shortages"]:
        goc = next(zone for zone in context.zones if zone.zone_id == row["zone_id"])
        assert row["idle_supply"] == goc.idle_supply
        assert row["demand_observed"] == goc.demand_observed


def test_shortage_xep_hang_on_dinh_giua_hai_lan_chay(zones: list[dict[str, object]]) -> None:
    """Cùng snapshot phải cho cùng thứ tự — CLAUDE.md §3 #4, không random không seed."""
    lan_1 = build_registry(_context(zones)).invoke(AGENT_OBSERVER, "get_current_shortage", {})
    lan_2 = build_registry(_context(zones)).invoke(AGENT_OBSERVER, "get_current_shortage", {})

    assert lan_1["shortage_zone_ids"] == lan_2["shortage_zone_ids"]
    gaps = [row["gap"] for row in lan_1["zone_shortages"]]
    assert gaps == sorted(gaps, reverse=True), "thiếu nặng nhất phải đứng đầu"


def test_shortage_khong_bao_gio_noi_0_zone_khi_van_con_cau_chua_phuc_vu(
    zones: list[dict[str, object]],
) -> None:
    """Hồi quy cho câu tự mâu thuẫn gặp lúc chạy thật: "0 zone đang thiếu xe … 22.0 cầu chưa phục vụ".

    Nguyên nhân: luật §4.3 lọc theo TỶ LỆ `gap/demand ≥ 0.3`, nên cầu hụt rải mỏng dưới ngưỡng
    biến mất khỏi danh sách trong khi vẫn được cộng vào tổng. Bất biến ở đây buộc hai con số
    phải kể cùng một câu chuyện, bất kể snapshot nào.
    """
    result = build_registry(_context(zones)).invoke(AGENT_OBSERVER, "get_current_shortage", {})

    assert (result["total_unmet_now"] > 0) == (result["unmet_zone_count"] > 0)
    if result["total_unmet_now"] > 0:
        cau = narrate("get_current_shortage", result)
        assert str(result["unmet_zone_count"]) in cau
        assert "chưa phục vụ" in cau


def test_shortage_hai_tap_tach_bach_va_khong_tap_nao_nuot_tap_kia(
    zones: list[dict[str, object]],
) -> None:
    """`shortage` (vượt ngưỡng §4.3) và `unmet` (có cầu hụt) là hai tập khác nhau, có chủ ý.

    Zone dưới `min_supply_per_zone` mà cầu bằng 0 vượt ngưỡng nhưng `gap` vẫn là 0 — nên không
    được viết test kiểu "tập này là tập con của tập kia", nó sẽ đỏ trên đúng ca biên đó.
    """
    context = _context(zones)
    result = build_registry(context).invoke(AGENT_OBSERVER, "get_current_shortage", {})

    theo_co = {row["zone_id"] for row in result["zone_shortages"] if row["meets_policy_condition"]}
    theo_gap = {row["zone_id"] for row in result["zone_shortages"] if row["gap"] > 0}

    assert set(result["shortage_zone_ids"]) == theo_co
    assert set(result["unmet_zone_ids"]) == theo_gap
    # Mọi zone được liệt kê phải thuộc ít nhất một trong hai lý do — không có dòng thừa.
    assert all(row["meets_policy_condition"] or row["gap"] > 0 for row in result["zone_shortages"])


def test_narration_cua_hai_tool_noi_ro_thi_khac_nhau(zones: list[dict[str, object]]) -> None:
    """Nhật ký phải tự phân biệt được hai loại số, vì đọc lại log là lúc không còn ngữ cảnh."""
    context = _context(zones)
    registry = build_registry(context)
    hien_tai = registry.invoke(AGENT_OBSERVER, "get_current_shortage", {})
    registry.invoke(AGENT_OBSERVER, "run_forecast", {})
    du_bao = registry.invoke(AGENT_OBSERVER, "get_supply_state", {})

    cau_hien_tai = narrate("get_current_shortage", hien_tai)
    cau_du_bao = narrate("get_supply_state", du_bao)

    assert "đang thiếu xe" in cau_hien_tai
    assert "dự báo +" in cau_du_bao
    assert "đang" not in cau_du_bao, "dòng dự báo không được đội lốt hiện tại"


# --- Đường đỡ khi LLM tắt ---------------------------------------------------------------


def test_llm_tat_van_tra_loi_duoc_bang_duong_co_dinh(zones: list[dict[str, object]]) -> None:
    """Đây là đường duy nhất chắc chắn chạy lúc trình bày — không phụ thuộc quota."""
    request = ObserveRequest(**_payload(zones, "thời tiết thế nào"))
    log = RunLog()

    _respond(request, log, classify(request.text))

    events = log.snapshot()
    assert any(event.code == "OBSERVER_LLM_FALLBACK" for event in events), "Phải nói rõ là đang chạy đường đỡ."
    finished = [event for event in events if event.kind == "tool_finished"]
    assert [event.tool for event in finished] == ["get_weather"]
    assert finished[0].ok is True


def test_cau_hoi_ve_hotspot_chay_forecast_truoc_vi_rang_buoc_du_lieu(zones: list[dict[str, object]]) -> None:
    """`get_supply_state` cần forecast trước; thiếu bước đó nó trả lỗi chứ không trả số.

    Câu hỏi đổi từ "zone nào đang thiếu xe" sang "hotspot dự báo ở đâu" vì câu cũ hỏi về HIỆN
    TẠI và giờ đã có tool đúng thì cho nó. Tính chất mà test này canh — ràng buộc dữ liệu của
    `get_supply_state` — không đổi, chỉ được kiểm bằng câu hỏi thật sự thuộc về nó.
    """
    request = ObserveRequest(**_payload(zones, "hotspot dự báo ở đâu"))
    log = RunLog()

    _respond(request, log, classify(request.text))

    finished = [event for event in log.snapshot() if event.kind == "tool_finished"]
    assert [event.tool for event in finished] == ["run_forecast", "get_supply_state"]
    assert all(event.ok for event in finished)


def test_cau_hoi_hien_tai_khong_can_du_bao_va_khong_dung_so_tuong_lai(
    zones: list[dict[str, object]],
) -> None:
    """Hồi quy cho đúng lỗi đã gặp: "zone nào đang thiếu xe" từng trả hotspot +15 phút.

    Hai vế phải cùng đúng. Chỉ kiểm "có gọi tool mới" là chưa đủ — nếu `run_forecast` vẫn chạy
    kèm thì câu trả lời lại có sẵn số tương lai để LLM vin vào, và lỗi cũ quay lại qua cửa sau.
    """
    request = ObserveRequest(**_payload(zones, "zone nào đang thiếu xe"))
    log = RunLog()

    _respond(request, log, classify(request.text))

    finished = [event for event in log.snapshot() if event.kind == "tool_finished"]
    assert [event.tool for event in finished] == ["get_current_shortage"]
    assert all(event.ok for event in finished)


def test_cau_khong_hieu_thi_goi_y_viec_lam_duoc(zones: list[dict[str, object]]) -> None:
    request = ObserveRequest(**_payload(zones, "abcxyz"))
    log = RunLog()

    _respond(request, log, classify(request.text))

    assert not [event for event in log.snapshot() if event.kind.startswith("tool_")]
    assert any("chạy phân tích" in event.text for event in log.snapshot())


# --- Mốc dự báo -------------------------------------------------------------------------


def test_hoi_moc_ngoai_tap_bi_chan_truoc_llm_va_khong_goi_tool_nao(zones: list[dict[str, object]]) -> None:
    """Model 1 chỉ có booster ở {15, 30} (DATA_CONTRACT §4.2). Mốc +10 không còn số để trả lời.

    Chặn TRƯỚC khi LLM kịp viết gì: để nó tự xoay xở với một mốc không có số sẽ ra một câu
    nghe hợp lý dựng trên mốc khác — tức trả lời sai câu hỏi mà không ai biết.
    """
    with TestClient(app) as client:
        response = client.post("/api/v1/observe", json=_payload(zones, "dự báo 10 phút tới ra sao"))

    assert response.status_code == 202
    assert response.json()["action"] is None

    events = module._sessions["S1"].snapshot()
    assert [event.code for event in events] == ["HORIZON_NOT_FORECAST"]
    assert not [event for event in events if event.kind.startswith("tool_")]
    assert "15 phút, 30 phút" in events[0].text


def test_moc_neu_trong_cau_ghi_de_moc_dang_chon_tren_man_hinh(zones: list[dict[str, object]]) -> None:
    """Hỏi "dự báo 30 phút" mà chạy ở mốc đang chọn là trả lời sai câu hỏi, không dấu hiệu nào."""
    # Payload mang horizon_min=15, nhưng câu hỏi nêu 30 — cả hai đều là mốc hợp lệ, nên chỗ
    # này đo đúng thứ cần đo: câu chữ thắng mốc đang chọn trên màn hình.
    request = ObserveRequest(**_payload(zones, "dự báo 30 phút tới thế nào"))
    assert request.horizon_min == 15
    log = RunLog()

    _respond(request, log, classify(request.text))

    forecast = [event for event in log.snapshot() if event.tool == "run_forecast" and event.kind == "tool_finished"]
    assert forecast, "Phải có dòng kết quả dự báo để đọc mốc ra."
    assert "horizon 30 phút" in forecast[0].text


def test_khong_neu_moc_thi_dung_moc_dang_chon(zones: list[dict[str, object]]) -> None:
    request = ObserveRequest(**_payload(zones, "dự báo thế nào"))
    log = RunLog()

    _respond(request, log, classify(request.text))

    forecast = [event for event in log.snapshot() if event.tool == "run_forecast" and event.kind == "tool_finished"]
    assert "horizon 15 phút" in forecast[0].text


# --- Vòng đời phiên ---------------------------------------------------------------------


def test_phien_chua_ton_tai_tra_mang_rong_chu_khong_404() -> None:
    """Client poll trước khi gõ câu nào là chuyện bình thường, không phải lỗi."""
    with TestClient(app) as client:
        response = client.get("/api/v1/observe/chua-co")

    assert response.status_code == 200
    assert response.json()["events"] == []


def test_hai_phien_khong_ro_ri_sang_nhau(zones: list[dict[str, object]]) -> None:
    with TestClient(app) as client:
        client.post("/api/v1/observe", json=_payload(zones, "duyệt đi", "A"))
        client.post("/api/v1/observe", json=_payload(zones, "chạy phân tích", "B"))
        a = client.get("/api/v1/observe/A").json()["events"]
        b = client.get("/api/v1/observe/B").json()["events"]

    assert [event["code"] for event in a] == ["GATE_IS_UI_ONLY"]
    assert [event["code"] for event in b] == [None]


def test_xoa_phien_roi_thi_khong_con_gi(zones: list[dict[str, object]]) -> None:
    with TestClient(app) as client:
        client.post("/api/v1/observe", json=_payload(zones, "chạy phân tích"))
        assert client.delete("/api/v1/observe/S1").status_code == 204
        assert client.get("/api/v1/observe/S1").json()["events"] == []
        assert client.delete("/api/v1/observe/S1").status_code == 404


def test_tran_phien_thu_hoi_phien_cu_nhat(zones: list[dict[str, object]]) -> None:
    with TestClient(app) as client:
        for index in range(module.MAX_TRACKED_SESSIONS + 1):
            client.post("/api/v1/observe", json=_payload(zones, "chạy phân tích", f"S{index}"))

    assert "S0" not in module._sessions
    assert len(module._sessions) == module.MAX_TRACKED_SESSIONS


# --- Điều luật §5.1 bản viết lại ---------------------------------------------------------


def test_phien_hoi_dap_khong_lam_dich_mot_con_so_nao_cua_quyet_dinh(zones: list[dict[str, object]]) -> None:
    """Xoá sạch phiên thì `decision` vẫn giống hệt từng byte — MA-6.14.

    Đây là thứ thay cho câu "nhật ký không bao giờ là nguồn" đã hết đúng khi ô nhập làm nhật
    ký thành hai chiều. Cái mất đi: nhật ký được phép ảnh hưởng tới **con người**. Cái giữ
    lại: nó không ảnh hưởng tới **máy** — và đó là phần kiểm được bằng máy.
    """
    khong_hoi = run_pipeline(_context(zones), snapshot_id="ob", data_source="AI_PARQUET_REPLAY:ob")

    request = ObserveRequest(**_payload(zones, "tình hình cung ứng thế nào"))
    log = RunLog()
    _respond(request, log, classify(request.text))
    assert log.snapshot(), "Phiên phải thật sự có chạy, nếu không phép so dưới đây vô nghĩa."

    co_hoi = run_pipeline(_context(zones), snapshot_id="ob", data_source="AI_PARQUET_REPLAY:ob")

    assert co_hoi["decision"] == khong_hoi["decision"]
    assert co_hoi["plan_set"] == khong_hoi["plan_set"]
    assert co_hoi["recommended_plan_id"] == khong_hoi["recommended_plan_id"]
