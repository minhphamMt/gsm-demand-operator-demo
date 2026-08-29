"""Run store và `GET /runs/{id}` sau khi gộp nhật ký — MA-6.5.

Hai khẳng định đáng tiền ở đây:

1. **Thấy được dòng nhật ký trong lúc run còn RUNNING.** Đây là toàn bộ lý do tính năng tồn
   tại; trước đó `GET /runs/{id}` lúc RUNNING chỉ có `{run_id, status}`.
2. **Nhật ký sống và chết cùng bản ghi của nó.** Một map với `RunEntry`, không phải hai
   `OrderedDict` song song — hai vòng thu hồi phải luôn đồng ý mà không có gì ép chúng đồng ý.

Test #1 dựng deterministic bằng một stub chặn trên `threading.Event`, **không đua với pipeline
thật**: đua thì có ngày CI chậm hơn một nhịp và test đỏ mà chẳng có gì hỏng (CLAUDE.md §7 #3).
"""

import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient

from src.api import routes_orchestration as module
from src.common.errors import DatasetUnavailableError
from src.main import app
from src.orchestration.run_log import EventKind, EventSource
from tests.test_orchestration_parity import _zones_at

SOURCE_AT = "2026-09-25T08:30:00+07:00"


@pytest.fixture(autouse=True)
def run_store_sach() -> Any:
    """Run store là biến module dùng chung; trả lại nguyên trạng để test không phụ thuộc thứ tự chạy."""
    truoc = dict(module._runs)
    module._runs.clear()
    yield
    module._runs.clear()
    module._runs.update(truoc)


def _payload(zones: list[dict[str, object]]) -> dict[str, Any]:
    return {
        "snapshot_id": "runs-api",
        "t": SOURCE_AT,
        "horizon_min": 5,
        "data_source": "AI_PARQUET_REPLAY:runs-api",
        "replay_source_at": SOURCE_AT,
        "zones": zones,
    }


def test_thay_duoc_nhat_ky_khi_run_con_dang_chay(monkeypatch: pytest.MonkeyPatch) -> None:
    """Trước bản này, RUNNING không có gì để hiện nên UI nhảy thẳng từ 'đang chạy' sang 'xong hết'."""
    da_vao_stub = threading.Event()
    cho_tha = threading.Event()

    def _stub_chan_giua_chung(
        context: Any,
        *,
        snapshot_id: Any,
        data_source: str,
        llm_client: Any = None,
        emit: Any = None,
    ) -> dict[str, Any]:
        assert emit is not None, "_execute phải truyền sink của run xuống pipeline."
        emit("narration", "graph", "stub đang chạy dở")
        da_vao_stub.set()
        cho_tha.wait(timeout=15)
        return {"decision": {}, "warnings": []}

    monkeypatch.setattr(module, "run_pipeline", _stub_chan_giua_chung)

    try:
        with TestClient(app) as client:
            zones = _zones_at(client, SOURCE_AT)
            created = client.post("/api/v1/runs", json=_payload(zones))
            assert created.status_code == 202, created.text
            run_id = created.json()["run_id"]

            # Một lượt GET để event loop có nhịp chạy task nền, rồi chờ đúng tín hiệu của stub.
            client.get(f"/api/v1/runs/{run_id}")
            assert da_vao_stub.wait(timeout=15), "Task nền không khởi động."

            detail = client.get(f"/api/v1/runs/{run_id}")
            assert detail.status_code == 200, detail.text
            body = detail.json()

            assert body["status"] == "RUNNING"
            kinds = [event["kind"] for event in body["events"]]
            texts = [event["text"] for event in body["events"]]
            assert kinds[0] == "run_started"
            assert "stub đang chạy dở" in texts
            assert "run_finished" not in kinds
            assert [event["seq"] for event in body["events"]] == list(range(1, len(body["events"]) + 1))
    finally:
        cho_tha.set()


def test_run_started_co_mat_ngay_o_luot_poll_dau_tien(monkeypatch: pytest.MonkeyPatch) -> None:
    """Lượt poll đầu trả mảng rỗng thì trông y hệt 'chưa có gì xảy ra'."""
    cho_tha = threading.Event()

    def _stub_treo(context: Any, **kwargs: Any) -> dict[str, Any]:
        cho_tha.wait(timeout=15)
        return {"decision": {}, "warnings": []}

    monkeypatch.setattr(module, "run_pipeline", _stub_treo)

    try:
        with TestClient(app) as client:
            zones = _zones_at(client, SOURCE_AT)
            run_id = client.post("/api/v1/runs", json=_payload(zones)).json()["run_id"]
            body = client.get(f"/api/v1/runs/{run_id}").json()

        assert body["events"], "GET ngay sau POST phải đã có dòng run_started."
        assert body["events"][0]["kind"] == "run_started"
        assert body["events"][0]["source"] == "system"
        assert body["events"][0]["at"].endswith("+07:00")
    finally:
        cho_tha.set()


def test_duong_failed_van_giu_lai_nhat_ky() -> None:
    """Bản cũ trả về đúng `{run_id, status, error}` nên đường hỏng là đường mù nhất."""
    entry = module._open_entry("run-failed")
    entry.log.append("narration", "graph", "đã chạy được một đoạn")
    loi = DatasetUnavailableError("thiếu parquet")

    entry.log.append(
        "run_finished",
        "graph",
        f"dừng vì {loi.error_code}",
        source="system",
        ok=False,
        code=loi.error_code,
    )
    module._remember(
        "run-failed",
        {"run_id": "run-failed", "status": "FAILED", "error": {"code": loi.error_code, "message": loi.message}},
    )

    with TestClient(app) as client:
        body = client.get("/api/v1/runs/run-failed").json()

    assert body["status"] == "FAILED"
    assert [event["text"] for event in body["events"]][0] == "đã chạy được một đoạn"
    assert body["events"][-1]["code"] == "DATASET_UNAVAILABLE"


# --- Dòng chờ người vận hành (Chặng 6) ---------------------------------------------------


def _state(**patch: Any) -> Any:
    """State tối thiểu để `_awaiting_approval_text` đọc. Dùng dict: `PipelineState` là TypedDict."""
    base = {
        "quality_ok": True,
        "recommended_plan_id": "PLAN_B",
        "decision": {"planning_status": "optimizer_evaluated"},
    }
    return {**base, **patch}


def test_dat_proposed_thi_noi_ra_nhung_khong_hua_mot_cong_duyet() -> None:
    """`POST /runs` không ghi phương án nào vào CSDL, nên nó không có gì để hứa duyệt.

    Trạng thái "đang chờ duyệt" thuộc về phương án trong CSDL — thứ chỉ client biết. Một dòng
    "chờ bạn duyệt" phát từ đây sẽ để người vận hành ngồi đợi một nút không bao giờ hiện.
    """
    text = module._proposed_text(_state())

    assert text is not None
    assert "PLAN_B" in text
    assert "không ghi phương án" in text
    assert "chờ" not in text, "Lượt chạy này không tạo ra cổng duyệt nào."


@pytest.mark.parametrize(
    ("ten", "state"),
    [
        ("quality gate chặn", _state(quality_ok=False)),
        ("chưa chạy tới quality gate", _state(quality_ok=None)),
        ("không cần điều xe", _state(decision={"planning_status": "not_required"})),
        ("không dựng được quyết định", _state(decision={})),
    ],
)
def test_khong_hua_hen_mot_cong_se_khong_bao_gio_mo(ten: str, state: Any) -> None:
    """Ba nhánh này dừng vì **không đạt** hoặc **không cần**, không phải vì đang đợi ai.

    Một dòng "chờ bạn duyệt" ở đây là để người vận hành ngồi đợi một cổng không mở.
    `not_required` đặc biệt đáng chú ý: quy trình chốt là dừng ngay sau Dự báo, và
    `canReviewPlan` phía client cũng loại nó.
    """
    assert module._proposed_text(state) is None


def test_duong_failed_khong_bao_gio_co_dong_cho_duyet() -> None:
    """ "Đang chờ bạn" mà thật ra đã hỏng là nói dối đúng lúc cần sự thật nhất."""
    entry = module._open_entry("run-hong")
    loi = DatasetUnavailableError("thiếu parquet")
    entry.log.append("run_finished", "graph", f"dừng vì {loi.error_code}", source="system", ok=False)

    assert not [event for event in entry.log.snapshot() if event.kind == "awaiting_approval"]


def test_dong_proposed_dung_truoc_run_finished_chu_khong_sau() -> None:
    """Đây là chuyện xảy ra TRONG lượt chạy, không phải sau khi nó kết thúc."""
    entry = module._open_entry("run-thu-tu")
    entry.log.append("narration", "graph", "phân tích đạt PROPOSED", source="system", code="GRAPH_PROPOSED")
    entry.log.append("run_finished", "graph", "hoàn tất", source="system", ok=True)

    codes = [event.code for event in entry.log.snapshot()]
    kinds = [event.kind for event in entry.log.snapshot()]
    assert codes.index("GRAPH_PROPOSED") < kinds.index("run_finished")


def test_remember_thay_ban_ghi_nhung_giu_nguyen_nhat_ky() -> None:
    """Đây chính là lỗi mà `RunEntry` sinh ra để chặn: `_remember` cũ thay cả dict."""
    entry = module._open_entry("run-giu-log")
    entry.log.append("narration", "graph", "một")
    entry.log.append("narration", "graph", "hai")

    module._remember("run-giu-log", {"run_id": "run-giu-log", "status": "DONE"})

    giu = module._runs["run-giu-log"]
    assert giu.record["status"] == "DONE"
    assert [event.text for event in giu.log.snapshot()] == ["một", "hai"]


def test_run_cu_nhat_bi_thu_hoi_mang_theo_dung_nhat_ky_cua_no() -> None:
    """Một map, một vòng đời: không có đường nào để nhật ký sống lâu hơn bản ghi."""
    dau_tien = module._open_entry("run-dau-tien")
    dau_tien.log.append("narration", "graph", "dòng của run đầu tiên")

    for index in range(module.MAX_TRACKED_RUNS):
        module._open_entry(f"run-{index}")

    assert "run-dau-tien" not in module._runs
    assert len(module._runs) == module.MAX_TRACKED_RUNS

    with TestClient(app) as client:
        assert client.get("/api/v1/runs/run-dau-tien").status_code == 404


def test_remember_khong_hoi_sinh_run_da_bi_thu_hoi() -> None:
    """Bản ghi quay lại mà không còn nhật ký đi kèm chính là dạng lệch cần loại bỏ."""
    module._open_entry("run-se-bi-thu-hoi")
    for index in range(module.MAX_TRACKED_RUNS):
        module._open_entry(f"run-{index}")

    module._remember("run-se-bi-thu-hoi", {"run_id": "run-se-bi-thu-hoi", "status": "DONE"})

    assert "run-se-bi-thu-hoi" not in module._runs
    assert len(module._runs) == module.MAX_TRACKED_RUNS


def test_get_run_khong_ro_ri_nhat_ky_cua_run_khac() -> None:
    a = module._open_entry("run-a")
    b = module._open_entry("run-b")
    a.log.append("narration", "graph", "chỉ của A")
    b.log.append("narration", "graph", "chỉ của B")

    with TestClient(app) as client:
        body_a = client.get("/api/v1/runs/run-a").json()
        body_b = client.get("/api/v1/runs/run-b").json()

    assert [event["text"] for event in body_a["events"]] == ["chỉ của A"]
    assert [event["text"] for event in body_b["events"]] == ["chỉ của B"]


def test_su_kien_serialize_du_moi_truong_cho_client() -> None:
    """Client dựng nhãn `[HH:MM:SS] [ACTOR] > text` từ đúng những khóa này."""
    entry = module._open_entry("run-shape")
    kind: EventKind = "tool_finished"
    source: EventSource = "deterministic"
    entry.log.append(kind, "dispatch", "3 chặng", source=source, tool="compute_relocation", ok=True)

    with TestClient(app) as client:
        event = client.get("/api/v1/runs/run-shape").json()["events"][0]

    assert set(event) == {"seq", "at", "kind", "actor", "text", "source", "tool", "ok", "code"}
    assert event["seq"] == 1
    assert event["kind"] == "tool_finished"
    assert event["actor"] == "dispatch"
    assert event["tool"] == "compute_relocation"
    assert event["ok"] is True
    assert event["code"] is None


def test_run_khong_ton_tai_van_tra_404_nhu_cu() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/runs/khong-co-that")

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "RUN_NOT_FOUND"
