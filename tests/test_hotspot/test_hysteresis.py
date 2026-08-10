"""T2 AC #2 — hysteresis 2 vào / 3 ra và tác dụng chống nhấp nháy (§4.3, AGENT_WORKFLOW §3.3).

Chuỗi trong file này viết tay chứ không sinh ngẫu nhiên: cái cần chứng minh là "bao nhiêu
step thì đổi trạng thái", nên phải nhìn thấy từng step. Chuỗi ngẫu nhiên chỉ kiểm được
tính chất trung bình và không bắt được lỗi lệch một nhịp.

Chuỗi dài viết dạng chuỗi ký tự `"TTFTF"` để đọc được cả nhịp trong một dòng — 18 giá trị
`True/False` xuống dòng theo formatter thì không ai soi ra được nhịp vào/ra nữa.
"""

from collections.abc import Sequence

from src.hotspot.hysteresis import (
    ENTER_STEPS,
    EXIT_STEPS,
    HysteresisState,
    ZoneState,
    advance,
    count_transitions,
    initial_state,
)

ZONE = 7


def seq(pattern: str) -> list[bool]:
    """`"TTF"` → `[True, True, False]`."""
    return [char == "T" for char in pattern]


def run(sequence: Sequence[bool], *, zone_id: int = ZONE) -> list[bool]:
    """Chạy một chuỗi điều kiện thô qua hysteresis, trả về chuỗi quyết định từng step."""
    state = initial_state()
    decided: list[bool] = []
    for meets in sequence:
        state, result = advance(state, {zone_id: meets})
        decided.append(result[zone_id])
    return decided


# --------------------------------------------------------------------- hằng số của cơ chế


def test_hai_vao_ba_ra_dung_agent_workflow() -> None:
    """Bất đối xứng là điểm cốt lõi của §3.3 — hai số bằng nhau là mất tác dụng chống rung."""
    assert ENTER_STEPS == 2
    assert EXIT_STEPS == 3
    assert EXIT_STEPS > ENTER_STEPS


def test_khoi_dong_nguoi_khong_zone_nao_bat() -> None:
    """Chưa có lịch sử thì chưa có hotspot — cũng là trạng thái sau `POST /replay/reset` (§3.3)."""
    state = initial_state()
    assert state.active_zones() == ()
    assert state.is_active(ZONE) is False


# ------------------------------------------------------------------------------- vào: 2 step


def test_mot_step_thoa_dieu_kien_chua_du_de_vao() -> None:
    """Đúng cái hysteresis sinh ra để chặn: một step nhiễu không được kéo cả kế hoạch điều xe."""
    assert run(seq("T")) == seq("F")


def test_dung_hai_step_lien_tiep_thi_vao() -> None:
    assert run(seq("TT")) == seq("FT")


def test_hai_step_thoa_nhung_bi_ngat_quang_thi_khong_vao() -> None:
    """T, F, T không phải là "hai lần thỏa" — §3.3 đòi LIÊN TIẾP, nên bộ đếm phải reset."""
    assert run(seq("TFT")) == seq("FFF")


# -------------------------------------------------------------------------------- ra: 3 step


def test_hai_step_khong_thoa_van_giu_hotspot() -> None:
    """Ra chậm là có chủ đích: zone vừa hết căng mà tắt ngay sẽ bị rút xe đi rồi căng lại."""
    assert run(seq("TTFF")) == seq("FTTT")


def test_dung_ba_step_khong_thoa_lien_tiep_thi_ra() -> None:
    assert run(seq("TTFFF")) == seq("FTTTF")


def test_chuoi_khong_thoa_bi_ngat_thi_dem_lai_tu_dau() -> None:
    """Hai step trượt bị một step thỏa cắt ngang thì streak về 0 — chưa đủ điều kiện ra."""
    assert run(seq("TTFFTFF")) == seq("FTTTTTT")


def test_vao_lai_sau_khi_ra_van_can_du_hai_step() -> None:
    """Streak được reset lúc đổi trạng thái; không reset thì lần vào sau chỉ tốn 1 step."""
    assert run(seq("TTFFFTT")) == seq("FTTTFFT")


# ------------------------------------------------------- AC #2: số lần đổi trạng thái giảm

# Zone "rung": vài đợt thỏa xen kẽ ngắt quãng — đúng kiểu dữ liệu quanh ngưỡng 0.3 sinh ra
# trong replay thật, và là ca hysteresis phải xử lý.
FLICKERING = "TTTFTFTFFFTTFTTFFF"
EXPECTED_DECIDED = "FTTTTTTTTFFTTTTTTF"


def test_chuoi_nhap_nhay_giam_so_lan_doi_trang_thai() -> None:
    """AC #2 — thước đo là `count_transitions`, dùng chung với eval_hotspot.py."""
    decided = run(seq(FLICKERING))
    assert decided == seq(EXPECTED_DECIDED)

    raw_transitions = count_transitions(seq(FLICKERING))
    hysteresis_transitions = count_transitions(decided)
    assert raw_transitions == 9
    assert hysteresis_transitions == 4
    assert hysteresis_transitions < raw_transitions


def test_chuoi_luan_phien_hoan_toan_khong_bao_gio_bat() -> None:
    """Ca cực đoan: T/F xen kẽ không bao giờ đủ 2 step liên tiếp → im hoàn toàn."""
    alternating = [index % 2 == 0 for index in range(20)]
    decided = run(alternating)
    assert not any(decided)
    assert count_transitions(decided) == 0
    assert count_transitions(alternating) == 19


def test_count_transitions_chuoi_ngan() -> None:
    """Chuỗi 0 hoặc 1 phần tử không có cặp nào để so — phải trả 0 chứ không nổ."""
    assert count_transitions([]) == 0
    assert count_transitions([True]) == 0
    assert count_transitions([True, False]) == 1


# ------------------------------------------------------------------ tính thuần & độc lập zone


def test_advance_khong_sua_trang_thai_cu() -> None:
    """Hàm thuần: nơi gọi giữ được bản cũ để so, và không có trạng thái ẩn (§3 #7)."""
    state = initial_state()
    after_first, _ = advance(state, {ZONE: True})
    after_second, decided = advance(after_first, {ZONE: True})

    assert decided[ZONE] is True
    assert after_first.is_active(ZONE) is False
    assert after_second.is_active(ZONE) is True
    assert state.active_zones() == ()


def test_cac_zone_dem_streak_doc_lap() -> None:
    """Zone 1 thỏa liên tục, zone 2 rung — trộn bộ đếm sẽ làm zone 2 vào hotspot oan."""
    state = initial_state()
    for step, zone2 in enumerate(seq("TFTF")):
        state, decided = advance(state, {1: True, 2: zone2})
        assert decided[1] is (step >= 1)
        assert decided[2] is False
    assert state.active_zones() == (1,)


def test_zone_moi_xuat_hien_giua_chung_bat_dau_tu_khong() -> None:
    """Zone chưa từng gặp không được thừa hưởng streak của ai — mặc định là `ZoneState()`."""
    state, _ = advance(initial_state(), {1: True})
    _, decided = advance(state, {1: True, 2: True})
    assert decided == {1: True, 2: False}


def test_tham_so_enter_exit_dieu_khien_duoc_bien() -> None:
    """Truyền tham số để kiểm biên; mặc định vẫn là cặp đã chốt, không nơi nào tự chọn số khác."""
    state = initial_state()
    state, decided = advance(state, {ZONE: True}, enter_steps=1, exit_steps=1)
    assert decided[ZONE] is True
    _, decided = advance(state, {ZONE: False}, enter_steps=1, exit_steps=1)
    assert decided[ZONE] is False


def test_trang_thai_dung_lai_duoc_tu_ben_ngoai() -> None:
    """Replay Engine phải dựng lại được state đúng hình dạng khi tiếp tục một phiên replay."""
    resumed = HysteresisState(zones={ZONE: ZoneState(active=True, meet_streak=0, miss_streak=2)})
    _, decided = advance(resumed, {ZONE: False})
    assert decided[ZONE] is False
