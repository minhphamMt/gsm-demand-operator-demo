"""Nhật ký chạy — MA-6.1.

Ba thứ được kiểm ở đây đều là thứ hỏng lặng lẽ nếu sai:

- `seq` đứt hoặc trùng → client sắp sai thứ tự mà không có dấu hiệu nào trên màn hình.
- `snapshot()` trả list thật → thread phục vụ GET lặp trên list đang bị pipeline append.
- Sink ném lỗi lan ra ngoài → một cơ chế ghi log giết được lượt chạy nó đang ghi.

Không test nào dùng `sleep`: test đồng thời khẳng định trên **tập `seq` thu được**, không
khẳng định trên thời điểm (CLAUDE.md §7 #3).
"""

import threading

import pytest

from src.orchestration.run_log import (
    MAX_EVENTS_PER_RUN,
    NULL_SINK,
    TRUNCATED_CODE,
    RunLog,
    guarded,
)


def test_seq_bat_dau_tu_1_don_dieu_va_khong_dut() -> None:
    log = RunLog()
    for index in range(10):
        log.append("narration", "graph", f"dòng {index}")

    events = log.snapshot()
    assert [event.seq for event in events] == list(range(1, 11))


def test_moc_thoi_gian_co_offset_gio_viet_nam() -> None:
    """Contract cấm datetime naive (CLAUDE.md §5.2); `at` đi thẳng ra API nên phải có offset."""
    log = RunLog()
    log.append("run_started", "graph", "bắt đầu", source="system")

    assert log.snapshot()[0].at.endswith("+07:00")


def test_snapshot_la_ban_sao_khong_phai_list_that() -> None:
    log = RunLog()
    log.append("narration", "graph", "một")

    first = log.snapshot()
    first.clear()
    log.append("narration", "graph", "hai")

    assert [event.text for event in log.snapshot()] == ["một", "hai"]


def test_giu_nguyen_truong_tool_ok_code() -> None:
    log = RunLog()
    log.append("tool_finished", "dispatch", "xong", tool="compute_relocation", ok=True, code=None)
    log.append("tool_denied", "explanation", "bị chặn", source="system", ok=False, code="TOOL_NOT_ALLOWED")

    finished, denied = log.snapshot()
    assert (finished.tool, finished.ok, finished.source) == ("compute_relocation", True, "deterministic")
    assert (denied.code, denied.ok, denied.source) == ("TOOL_NOT_ALLOWED", False, "system")


def test_tran_ghi_dong_bao_cat_chu_khong_bo_am_tham() -> None:
    """Nhật ký tự cụt mà không nói gì sẽ bị đọc thành 'pipeline dừng ở đây' (CLAUDE.md §9 #3)."""
    log = RunLog(max_events=5)
    for index in range(20):
        log.append("narration", "graph", f"dòng {index}")

    events = log.snapshot()
    assert len(events) == 5
    assert [event.text for event in events[:4]] == [f"dòng {index}" for index in range(4)]

    last = events[-1]
    assert last.code == TRUNCATED_CODE
    assert last.kind == "warning"
    assert "5" in last.text


def test_sau_khi_cat_khong_ghi_them_dong_nao() -> None:
    log = RunLog(max_events=3)
    for index in range(10):
        log.append("narration", "graph", f"dòng {index}")
    log.append("run_finished", "graph", "xong", source="system")

    assert len(log.snapshot()) == 3
    assert sum(1 for event in log.snapshot() if event.code == TRUNCATED_CODE) == 1


def test_tran_mac_dinh_dung_hang_so_da_cong_bo() -> None:
    assert MAX_EVENTS_PER_RUN == 500


def test_nhieu_thread_append_cho_ra_tap_seq_duy_nhat() -> None:
    """`get_run` chạy khác thread với `_execute`, nên khóa là bắt buộc chứ không phải trang trí.

    Khẳng định trên **tập `seq`** chứ không trên thứ tự hay thời điểm: thứ tự giữa các thread
    là không xác định và không nên xác định, nhưng không được có hai dòng cùng số.
    """
    threads_count, per_thread = 8, 50
    log = RunLog(max_events=10_000)
    barrier = threading.Barrier(threads_count)

    def worker(worker_id: int) -> None:
        barrier.wait()  # Ép các thread vào cùng lúc, không cần sleep để tạo tranh chấp.
        for index in range(per_thread):
            log.append("narration", f"worker-{worker_id}", f"{worker_id}-{index}")

    threads = [threading.Thread(target=worker, args=(worker_id,)) for worker_id in range(threads_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    total = threads_count * per_thread
    assert {event.seq for event in log.snapshot()} == set(range(1, total + 1))
    assert len(log.snapshot()) == total


def test_sink_nem_loi_khong_lan_ra_ngoai() -> None:
    """Ghi log hỏng không được giết lượt chạy nó đang ghi."""

    def _no_bao_gio_chiu_ghi(kind, actor, text, *, source="deterministic", tool=None, ok=None, code=None):  # type: ignore[no-untyped-def]
        raise RuntimeError("sink hỏng")

    safe = guarded(_no_bao_gio_chiu_ghi)
    safe("narration", "graph", "một dòng bình thường")  # Không được ném.


def test_guarded_van_chuyen_du_tham_so_khi_sink_chay_binh_thuong() -> None:
    log = RunLog()
    safe = guarded(log.append)
    safe("tool_finished", "dispatch", "xong", source="llm", tool="compute_relocation", ok=True, code="X")

    event = log.snapshot()[0]
    assert (event.kind, event.actor, event.source, event.tool, event.ok, event.code) == (
        "tool_finished",
        "dispatch",
        "llm",
        "compute_relocation",
        True,
        "X",
    )


def test_null_sink_nuot_su_kien_va_khong_nem_gi() -> None:
    """Mặc định là callable thật, không phải `None` — không có nhánh nào để quên."""
    NULL_SINK("narration", "graph", "không ai nghe")
    NULL_SINK("tool_denied", "observer", "cũng không ai nghe", source="system", ok=False, code="X")


def test_len_dem_dung_so_dong() -> None:
    log = RunLog()
    assert len(log) == 0
    log.append("narration", "graph", "một")
    assert len(log) == 1


@pytest.mark.parametrize("max_events", [0, 1, 2])
def test_tran_qua_nho_khong_lam_vo_log(max_events: int) -> None:
    """Trần vô lý là lỗi cấu hình, không được biến thành crash giữa lượt chạy."""
    log = RunLog(max_events=max_events)
    log.append("narration", "graph", "một")
    log.append("narration", "graph", "hai")

    assert len(log.snapshot()) <= max(2, max_events)
