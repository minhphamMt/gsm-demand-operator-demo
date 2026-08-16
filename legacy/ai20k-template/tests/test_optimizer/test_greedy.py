"""Model 3 — thuật toán greedy theo severity: T3 AC #1, #3, #4, #5, #6, #8 (SPEC §5.4).

Mọi kịch bản dựng trên lưới toạ độ thẳng hàng cách đều 1 km (xem conftest), nên "zone 9 cách
zone 10 một cây số" đọc thẳng ra được từ số hiệu zone. Với `avg_vehicle_speed_kmh = 25` thì
1 km ≈ 2.4 phút, và `deadhead_cost_per_km = 4000` cho 4 000 VNĐ mỗi km — hai con số đó đủ để
tính tay mọi khẳng định trong file này.
"""

from collections.abc import Mapping
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta

import pytest
from src.common.haversine import ZoneCoord
from src.common.policy import Policy
from src.contracts.hotspot import HotspotOutput
from src.optimizer import greedy
from src.optimizer.greedy import (
    BUDGET_NEAR_CAP,
    NO_SOLUTION,
    PLAN_NOT_FULLY_COVERING_GAP,
    SOURCE_ZONE_NEAR_MIN_SUPPLY,
    SolveResult,
    solve,
)

from .conftest import T0, dry, hotspot, line_coords, make_output, make_policy, source

COORDS = line_coords(1.0)


def run(
    output: HotspotOutput,
    *,
    policy: Policy,
    rain: Mapping[int, float] | None = None,
    t: datetime = T0,
    coords: Mapping[int, ZoneCoord] | None = None,
) -> SolveResult:
    """Gọi `solve` với mặc định "trời khô, lưới 1 km" để mỗi test chỉ nói phần nó quan tâm."""
    return solve(
        output,
        t=t,
        rain_mm_h=dry() if rain is None else rain,
        policy=policy,
        zone_coords=COORDS if coords is None else coords,
    )


def codes(result: SolveResult) -> list[object]:
    return [warning["code"] for warning in result.warnings]


# ------------------------------------------------------------------- AC #1: thứ tự greedy


def test_hotspot_severity_cao_duoc_phuc_vu_truoc(policy: Policy) -> None:
    """AC #1 — nguồn chỉ đủ cho một hotspot thì nó phải về tay zone căng hơn, không phải zone gần hơn.

    Zone 6 gần nguồn hơn zone 5; thuật toán xếp theo khoảng cách thay vì severity sẽ điều xe
    sai chỗ mà tổng số xe điều chuyển vẫn y hệt — sai lầm không lộ ra ở bất kỳ số tổng nào.
    """
    output = make_output(
        hotspots=[hotspot(5, gap=4.0, severity=0.9), hotspot(6, gap=4.0, severity=0.2)],
        surplus_zones=[source(7, surplus=4.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert len(result.moves) == 1
    assert (result.moves[0].from_zone, result.moves[0].to_zone) == (7, 5)
    assert [item.zone_id for item in result.residual_gap] == [6]


def test_priority_zones_xep_truoc_du_severity_thap() -> None:
    """AC #1 — `priority_zones` xếp TRƯỚC toàn bộ, không phải cộng điểm vào severity."""
    output = make_output(
        hotspots=[hotspot(5, gap=4.0, severity=0.9), hotspot(6, gap=4.0, severity=0.2)],
        surplus_zones=[source(7, surplus=4.0, idle=20)],
    )
    result = run(output, policy=make_policy(priority_zones=(6,)))

    assert len(result.moves) == 1
    assert result.moves[0].to_zone == 6


def test_chon_nguon_gan_nhat(policy: Policy) -> None:
    """§5.4 "tìm ứng viên gần nhất" — hai nguồn cùng sức chứa thì lấy nguồn gần."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(15, surplus=10.0, idle=20), source(9, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert len(result.moves) == 1
    assert result.moves[0].from_zone == 9
    assert result.moves[0].estimated_distance_km == pytest.approx(1.0)


def test_uu_tien_eta_khong_qua_ba_step_truoc_khi_xet_gan(policy: Policy) -> None:
    """§5.4 "ưu tiên eta ≤ 3 step" — ưu tiên này đứng TRƯỚC tiêu chí gần nhất.

    Zone 5 gần hơn (5 km) nhưng mưa to trên tuyến đẩy eta lên 4 step; zone 16 xa hơn (6 km)
    nhưng trời khô nên đến trong 3 step. Xe đến sau 20 phút thì đợt cao điểm đã qua.
    """
    rain = dry()
    rain[5] = 10.0
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(5, surplus=10.0, idle=20), source(16, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy, rain=rain)

    assert len(result.moves) == 1
    assert result.moves[0].from_zone == 16
    assert result.moves[0].eta_steps == 3


def test_deterministic_cung_input_cung_ket_qua(policy: Policy) -> None:
    """§3 #4 — hai lần chạy phải ra plan y hệt, kể cả thứ tự move lẫn thứ tự cảnh báo."""
    output = make_output(
        hotspots=[hotspot(10, gap=9.0, severity=0.5), hotspot(11, gap=9.0, severity=0.5)],
        surplus_zones=[source(12, surplus=8.0, idle=20), source(9, surplus=8.0, idle=20)],
    )
    assert run(output, policy=policy) == run(output, policy=policy)


# ----------------------------------------------------------------- AC #3: ràng buộc cứng


def test_khong_vuot_budget_cap() -> None:
    """AC #3 — chạm trần thì DỪNG, phần còn lại rơi vào residual_gap (AGENT_WORKFLOW §3.1)."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0, severity=0.9), hotspot(20, gap=3.0, severity=0.5)],
        surplus_zones=[source(9, surplus=8.0, idle=20), source(19, surplus=8.0, idle=20)],
    )
    result = run(output, policy=make_policy(budget_cap=4000))

    assert len(result.moves) == 1
    assert result.plan_totals.total_cost == 4000
    assert result.plan_totals.total_cost <= result.plan_totals.budget_cap
    assert [item.zone_id for item in result.residual_gap] == [20]


def test_budget_bang_khong_thi_khong_move_nao() -> None:
    """Ca biên: trần 0 đồng phải cho plan rỗng, không phải một move "miễn phí"."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=20)],
    )
    result = run(output, policy=make_policy(budget_cap=0))

    assert result.moves == ()
    assert result.plan_totals.total_cost == 0


def test_khong_move_nao_vuot_max_distance(policy: Policy) -> None:
    """AC #3 — nguồn ngoài bán kính bị loại hẳn, không "châm chước vì không còn ai khác"."""
    output = make_output(
        hotspots=[hotspot(1, gap=5.0)],
        surplus_zones=[source(10, surplus=10.0, idle=20)],  # 9 km > max_distance 7
    )
    result = run(output, policy=policy)

    assert result.moves == ()
    assert NO_SOLUTION in codes(result)
    assert result.residual_gap[0].gap_remaining == pytest.approx(5.0)


def test_bien_max_distance_van_dung_duoc(policy: Policy) -> None:
    """Đúng 7.0 km là hợp lệ — lệch biên ở đây là mất nguồn hợp lệ ở đúng chỗ khó nhất."""
    output = make_output(
        hotspots=[hotspot(1, gap=5.0)],
        surplus_zones=[source(8, surplus=10.0, idle=20)],  # đúng 7 km
    )
    result = run(output, policy=policy)

    assert len(result.moves) == 1
    assert result.moves[0].estimated_distance_km == pytest.approx(7.0)


def test_khong_rut_xuong_duoi_min_supply() -> None:
    """AC #3 (A6) — `idle_supply_current − min_supply_per_zone` là cận cứng của số xe rút."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(9, surplus=10.0, idle=4)],  # min_supply 3 → rút được đúng 1
    )
    result = run(output, policy=make_policy(max_supply_move_pct=0.9))

    assert result.moves[0].units_to_move == 1
    assert result.residual_gap[0].gap_remaining == pytest.approx(4.0)


def test_max_supply_move_pct_ap_tren_tong_da_rut(policy: Policy) -> None:
    """AC #3 (A7) — một zone nguồn phục vụ nhiều hotspot vẫn chỉ được rút tổng 40% cung hiện có.

    Đây là chỗ dễ sai nhất: tính lại cận từ `idle_supply_current` gốc cho mỗi move thì từng
    move nhìn vẫn hợp lệ, còn tổng thì vượt gấp đôi.
    """
    output = make_output(
        hotspots=[hotspot(9, gap=6.0, severity=0.9), hotspot(11, gap=6.0, severity=0.5)],
        surplus_zones=[source(10, surplus=50.0, idle=20)],  # floor(0.4 × 20) = 8
    )
    result = run(output, policy=policy)

    assert sum(move.units_to_move for move in result.moves) == 8
    assert [(move.to_zone, move.units_to_move) for move in result.moves] == [(9, 6), (11, 2)]


def test_zone_con_cooldown_khong_duoc_lam_nguon(policy: Policy) -> None:
    """AC #3 (A8) — §4.3 loại mọi surplus zone có `cooldown_until_ts > t`."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[
            source(9, surplus=10.0, idle=20, cooldown_until_ts=T0 + timedelta(minutes=1)),
            source(15, surplus=10.0, idle=20),
        ],
    )
    result = run(output, policy=policy)

    assert len(result.moves) == 1
    assert result.moves[0].from_zone == 15


def test_cooldown_het_dung_tai_t_thi_dung_duoc(policy: Policy) -> None:
    """Biên `≤ t` — chặt hơn một giây là mất một nguồn hợp lệ ở mỗi chu kỳ cooldown."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(9, surplus=10.0, idle=20, cooldown_until_ts=T0)],
    )
    result = run(output, policy=policy)

    assert result.moves[0].from_zone == 9


def test_zone_vua_hotspot_vua_surplus_khong_lam_nguon(policy: Policy) -> None:
    """§5.4 "không rút xe khiến zone nguồn tự trở thành hotspot mới", ở dạng nặng nhất.

    Ca này xảy ra thật ở `rain_peak`: gap tính bằng `demand_p90` còn surplus tính bằng p50
    nên một zone thoả cả hai điều kiện (§4.3 ghi rõ đó không phải lỗi dữ liệu). Rút xe khỏi
    một zone đang thiếu xe là điều không giải thích được cho người trực.
    """
    output = make_output(
        hotspots=[hotspot(10, gap=5.0, severity=0.9), hotspot(11, gap=3.0, severity=0.2)],
        surplus_zones=[source(11, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.moves == ()
    assert NO_SOLUTION in codes(result)


# ------------------------------------------------------------------ AC #4: residual_gap


def test_residual_la_phan_gap_khong_phu_duoc(policy: Policy) -> None:
    """AC #4 — residual = gap còn lại sau khi trừ số xe thực sự điều tới."""
    output = make_output(
        hotspots=[hotspot(10, gap=9.0)],
        surplus_zones=[source(9, surplus=4.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.moves[0].units_to_move == 4
    assert [(item.zone_id, item.gap_remaining) for item in result.residual_gap] == [(10, 5.0)]
    assert PLAN_NOT_FULLY_COVERING_GAP in codes(result)


def test_phu_het_gap_thi_khong_co_residual(policy: Policy) -> None:
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(9, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.residual_gap == ()
    assert PLAN_NOT_FULLY_COVERING_GAP not in codes(result)


def test_suggested_activation_lam_tron_len(policy: Policy) -> None:
    """AC #4 — "số xe cần huy động thêm" (§4.4): nửa chiếc xe không huy động được."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.5)],
        surplus_zones=[source(9, surplus=3.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.moves[0].units_to_move == 3
    residual = result.residual_gap[0]
    assert residual.gap_remaining == pytest.approx(2.5)
    assert residual.suggested_activation == 3


def test_phan_le_duoi_mot_xe_van_vao_residual(policy: Policy) -> None:
    """Điều chuyển làm tròn XUỐNG nên luôn còn phần lẻ — nó phải hiện ra ở residual chứ không
    bị nuốt, vì Khối C mới là nơi quyết định có huy động thêm hay không (§5.11)."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.4)],
        surplus_zones=[source(9, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.moves[0].units_to_move == 3
    assert result.residual_gap[0].gap_remaining == pytest.approx(0.4)
    assert result.residual_gap[0].suggested_activation == 1


def test_hotspot_gap_am_khong_duoc_dieu_xe_toi(policy: Policy) -> None:
    """Hysteresis giữ zone ở trạng thái hotspot thêm vài step sau khi hết căng (§3.3) — điều xe
    tới đó là điều xe vào nơi đang thừa, và nó cũng không phải residual."""
    output = make_output(
        hotspots=[hotspot(10, gap=-2.0, severity=0.1)],
        surplus_zones=[source(9, surplus=10.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.moves == ()
    assert result.residual_gap == ()
    assert result.warnings == ()


# ------------------------------------------------------------ AC #8: không nghiệm ≠ exception


def test_khong_co_nguon_thi_plan_rong_kem_canh_bao(policy: Policy) -> None:
    """F1 (EVALUATION_PLAN §4.2) — có hotspot, `surplus_zones` rỗng.

    Không ném exception: §5.9 dòng 1 quy định đây là 200 kèm cảnh báo, vì người trực vẫn cần
    thấy con số thiếu hụt để chuyển sang Khối C.
    """
    output = make_output(hotspots=[hotspot(10, gap=7.0), hotspot(12, gap=3.0)])
    result = run(output, policy=policy)

    assert result.moves == ()
    assert result.plan_totals.total_units == 0
    assert result.plan_totals.total_cost == 0
    assert [(item.zone_id, item.gap_remaining) for item in result.residual_gap] == [(10, 7.0), (12, 3.0)]
    assert NO_SOLUTION in codes(result)


def test_khong_hotspot_thi_khong_canh_bao_gi(policy: Policy) -> None:
    """Step yên ả không được coi là "không tìm được nghiệm" — R8 vốn dừng trước Optimizer."""
    result = run(make_output(surplus_zones=[source(9, surplus=10.0, idle=20)]), policy=policy)

    assert result.moves == ()
    assert result.residual_gap == ()
    assert result.warnings == ()


def test_nguon_het_suc_chua_van_la_khong_nghiem(policy: Policy) -> None:
    """Surplus zone có mặt nhưng không rút được xe nào (đang đứng đúng sàn min_supply)."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(9, surplus=10.0, idle=3)],
    )
    result = run(output, policy=policy)

    assert result.moves == ()
    assert NO_SOLUTION in codes(result)


# ----------------------------------------------------------------------------- cảnh báo §1.3


def test_canh_bao_khi_cham_90_phan_tram_ngan_sach() -> None:
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=20)],
    )
    result = run(output, policy=make_policy(budget_cap=4200))

    assert result.plan_totals.total_cost == 4000  # 4000/4200 ≈ 95%
    assert BUDGET_NEAR_CAP in codes(result)


def test_khong_canh_bao_ngan_sach_khi_con_thoai_mai(policy: Policy) -> None:
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=20)],
    )
    assert BUDGET_NEAR_CAP not in codes(run(output, policy=policy))


def test_canh_bao_zone_nguon_sat_san_kem_zone_id() -> None:
    """§1.3 — cảnh báo này mang `zone_id` để UI trỏ đúng zone cho người trực."""
    output = make_output(
        hotspots=[hotspot(10, gap=5.0)],
        surplus_zones=[source(9, surplus=10.0, idle=5)],  # rút 2 → còn 3, đúng sàn min_supply
    )
    result = run(output, policy=make_policy(max_supply_move_pct=0.9))

    warning = next(item for item in result.warnings if item["code"] == SOURCE_ZONE_NEAR_MIN_SUPPLY)
    assert warning["zone_id"] == 9
    assert "min_supply_per_zone=3" in str(warning["message"])


def test_nguon_con_du_xe_thi_khong_canh_bao(policy: Policy) -> None:
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=30)],
    )
    assert SOURCE_ZONE_NEAR_MIN_SUPPLY not in codes(run(output, policy=policy))


# ------------------------------------------------------- tính nhất quán của object trả về


def test_plan_totals_khop_tong_cac_move(policy: Policy) -> None:
    """Đúng ràng buộc mà validator của RelocationPlan §4.4 sẽ áp khi ghép plan — lệch ở đây
    nghĩa là plan sinh ra không dựng nổi thành object contract."""
    output = make_output(
        hotspots=[hotspot(9, gap=6.0, severity=0.9), hotspot(11, gap=6.0, severity=0.5)],
        surplus_zones=[source(10, surplus=50.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert result.plan_totals.total_units == sum(move.units_to_move for move in result.moves)
    assert result.plan_totals.total_cost == sum(move.estimated_cost for move in result.moves)
    assert result.plan_totals.total_deadhead_km == pytest.approx(sum(move.deadhead_km for move in result.moves))
    assert result.plan_totals.budget_cap == policy.rules.budget_cap


def test_gap_truoc_sau_noi_tiep_nhau_qua_cac_move(policy: Policy) -> None:
    """Hai move vào cùng một zone phải nối `after_gap` → `before_gap`, không cùng xuất phát từ
    gap gốc — nếu không, UI hiện hai lần cùng một mức thiếu hụt cho một zone."""
    output = make_output(
        hotspots=[hotspot(10, gap=9.0)],
        surplus_zones=[source(9, surplus=5.0, idle=20), source(11, surplus=5.0, idle=20)],
    )
    result = run(output, policy=policy)

    assert len(result.moves) == 2
    assert result.moves[0].before_gap == pytest.approx(9.0)
    assert result.moves[0].after_gap == pytest.approx(result.moves[1].before_gap)
    assert result.moves[1].after_gap == pytest.approx(0.0)


def test_deadhead_bang_quang_duong_va_chi_phi_dung_don_gia(policy: Policy) -> None:
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(7, surplus=8.0, idle=20)],
    )
    move = run(output, policy=policy).moves[0]

    assert move.estimated_distance_km == pytest.approx(3.0)
    assert move.deadhead_km == pytest.approx(move.estimated_distance_km)
    assert move.estimated_cost == 3 * policy.rules.deadhead_cost_per_km


def test_ket_qua_bat_bien(policy: Policy) -> None:
    """SolveResult là ảnh chụp một quyết định — sửa được tại chỗ là mở đường cho state ẩn (§3 #7)."""
    result = run(make_output(), policy=policy)
    with pytest.raises(FrozenInstanceError):
        result.moves = ()


# --------------------------------------------------- AC #5/#6: khoảng cách và eta trong plan


def test_khoang_cach_tinh_lai_moi_lan_goi(policy: Policy, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC #5 — không bảng tra nào sống sót giữa hai lần `solve()`."""
    calls = 0
    original = greedy.distance_between

    def counting(coords: Mapping[int, ZoneCoord], zone_a: int, zone_b: int) -> float:
        nonlocal calls
        calls += 1
        return original(coords, zone_a, zone_b)

    monkeypatch.setattr(greedy, "distance_between", counting)
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=20)],
    )
    run(output, policy=policy)
    after_first = calls
    run(output, policy=policy)

    assert after_first > 0
    assert calls == 2 * after_first


def test_mua_lam_xe_den_cham_hon_trong_plan(policy: Policy) -> None:
    """AC #6 — cùng tuyến, mưa to phải cho `eta_steps` lớn hơn mà quãng đường giữ nguyên."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(6, surplus=8.0, idle=20)],  # 4 km
    )
    rain = dry()
    rain[10] = 9.0

    dry_move = run(output, policy=policy).moves[0]
    wet_move = run(output, policy=policy, rain=rain).moves[0]

    assert dry_move.eta_steps == 2  # 4 km ÷ 25 km/h = 9.6 phút
    assert wet_move.eta_steps == 3  # × 1.5 = 14.4 phút
    assert wet_move.estimated_distance_km == dry_move.estimated_distance_km


def test_mua_o_dau_tuyen_nao_cung_lam_cham(policy: Policy) -> None:
    """Lấy `max` mưa hai đầu tuyến: chọn đầu khô hơn sẽ báo xe đến sớm hơn thực tế — sai về
    phía lạc quan, đúng thứ không được phép ở kịch bản `rain_peak`."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(6, surplus=8.0, idle=20)],
    )
    rain_at_source = dry()
    rain_at_source[6] = 9.0
    rain_at_target = dry()
    rain_at_target[10] = 9.0

    assert run(output, policy=policy, rain=rain_at_source).moves[0].eta_steps == 3
    assert run(output, policy=policy, rain=rain_at_target).moves[0].eta_steps == 3


def test_thieu_du_lieu_mua_thi_no_chu_khong_coi_la_kho_rao(policy: Policy) -> None:
    """Mặc định 0 mm/h cho zone thiếu dữ liệu sẽ rút ngắn eta mà không để lại dấu vết nào."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(9, surplus=8.0, idle=20)],
    )
    with pytest.raises(KeyError):
        run(output, policy=policy, rain={10: 0.0})


# ------------------------------------------------------------------- ngưỡng đến từ policy


def test_doi_nguong_policy_thi_ket_qua_doi_theo(policy: Policy) -> None:
    """CLAUDE.md §3 #2 — `max_distance` bị chép cứng thì siết nó xuống 2 km sẽ không đổi được gì."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(5, surplus=8.0, idle=20)],  # 5 km
    )
    assert len(run(output, policy=policy).moves) == 1
    assert run(output, policy=make_policy(max_distance=2.0)).moves == ()


def test_toc_do_xe_tu_policy_quyet_dinh_eta() -> None:
    """AC #7 — đổi `avg_vehicle_speed_kmh` phải đổi `eta_steps`, chứng minh nó không bị chép cứng."""
    output = make_output(
        hotspots=[hotspot(10, gap=3.0)],
        surplus_zones=[source(6, surplus=8.0, idle=20)],  # 4 km
    )
    fast = run(output, policy=make_policy(avg_vehicle_speed_kmh=50.0)).moves[0]
    slow = run(output, policy=make_policy(avg_vehicle_speed_kmh=10.0)).moves[0]

    assert fast.eta_steps == 1  # 4.8 phút
    assert slow.eta_steps == 5  # 24 phút
