"""Property-based test cho Model 3 — T3 AC #3, ràng buộc A1/A4/A6/A7/A8/A11 (EVALUATION_PLAN §4.1).

Khác test đơn vị ở chỗ: test đơn vị dựng đúng một tình huống để bắt đúng một lỗi đã nghĩ ra
trước; test này bắn 120 snapshot ngẫu nhiên có seed vào `solve()` và đòi mọi output đều thoả
toàn bộ ràng buộc policy. Nó bắt được lỗi ở những tổ hợp không ai nghĩ tới — điển hình là một
zone nguồn phục vụ nhiều hotspot, hoặc gap lẻ cộng dồn qua nhiều move.

Sinh số bằng `random.Random(seed)` cho từng snapshot chứ không dùng `random` toàn cục: mỗi
snapshot tái lập độc lập, nên khi test đỏ ở snapshot #57 thì chạy lại một mình seed đó là ra
đúng ca lỗi, không cần chạy 56 ca trước (§3 #4).
"""

import math
from collections.abc import Mapping
from datetime import timedelta
from functools import cache
from random import Random

import pytest
from src.common.haversine import ZoneCoord, distance_between, load_zone_coords
from src.common.policy import Policy
from src.contracts import ZONE_COUNT
from src.contracts.hotspot import HotspotOutput
from src.contracts.plan import FLOAT_TOLERANCE
from src.optimizer.greedy import SolveResult, solve

from .conftest import REAL_ZONE_REGISTRY_PATH, T0, hotspot, make_output, make_policy, source

# 120 > 100 tối thiểu của AC #3; seed nền cố định để danh sách snapshot không đổi giữa các lần chạy.
SNAPSHOT_COUNT = 120
BASE_SEED = 4242

# Trần ngân sách quay vòng: phần lớn snapshot chạy với trần thật, một phần chạy với trần rất
# chặt để nhánh "dừng vì hết ngân sách" thực sự được đi qua chứ không chỉ tồn tại trong code.
BUDGET_CAPS = (500_000, 500_000, 20_000, 4_000, 0)

# Tỷ lệ snapshot bốc zone trên toàn lưới 30 zone thay vì trong vùng lõi — xem `zone_pool`.
FULL_GRID_SHARE = 0.25

# Zone được coi là "trong vùng lõi" khi có ít nhất chừng này láng giềng trong `max_distance`.
MIN_NEIGHBOURS_IN_CORE = 2


@cache
def dense_core() -> tuple[int, ...]:
    """Các zone có ít nhất 2 zone khác nằm trong `max_distance` theo registry thật.

    config/zone_registry.json trải rộng ~70 km, trong khi `max_distance = 7.0`: chỉ 37/435 cặp
    zone là điều chuyển được. Bốc zone đều tay trên cả 30 zone sẽ khiến phần lớn snapshot rơi
    thẳng vào nhánh NO_SOLUTION, và bộ 120 ca sẽ xanh mà chưa từng chạy qua vòng lặp chính.
    Vì vậy phần lớn snapshot bốc trong vùng lõi này; phần còn lại vẫn bốc trên cả lưới để ca
    "zone bị cô lập" không biến mất khỏi bộ test.

    Tính từ chính registry chứ không liệt kê tay: sửa toạ độ một zone thì vùng lõi tự đổi theo,
    thay vì để lại một danh sách đúng-hôm-nay trong file test.
    """
    coords = load_zone_coords(REAL_ZONE_REGISTRY_PATH)
    limit = make_policy().rules.max_distance
    return tuple(
        zone_id
        for zone_id in sorted(coords)
        if sum(1 for other in coords if other != zone_id and distance_between(coords, zone_id, other) <= limit)
        >= MIN_NEIGHBOURS_IN_CORE
    )


def build_snapshot(seed: int) -> tuple[HotspotOutput, dict[int, float], Policy]:
    """Một snapshot §4.3 ngẫu nhiên nhưng hợp lệ, cùng bản đồ mưa và policy đi kèm.

    Hotspot và surplus bốc từ hai lần lấy mẫu ĐỘC LẬP nên chúng chồng lấn nhau — đó là tình
    huống thật ở `rain_peak` (§4.3), và cũng là ca dễ làm vỡ A6/A7 nhất.
    """
    rng = Random(seed)

    pool = list(range(1, ZONE_COUNT + 1)) if rng.random() < FULL_GRID_SHARE else list(dense_core())
    hotspot_ids = rng.sample(pool, rng.randint(0, min(8, len(pool))))
    surplus_ids = rng.sample(pool, rng.randint(0, min(10, len(pool))))

    # Hai thang gap khác hẳn nhau: thang lớn cho ra "một nguồn không đủ cho một hotspot", thang
    # nhỏ cho ra "một nguồn phục vụ được nhiều hotspot". Chỉ sinh thang lớn thì nhánh cộng dồn
    # `max_supply_move_pct` qua nhiều move gần như không bao giờ được chạy (xem test cuối file).
    gap_scale = rng.choice([5.0, 25.0])

    hotspots = [
        hotspot(
            zone_id,
            # Gap âm là hợp lệ (hysteresis §3.3) nên dải sinh phải phủ cả phần âm.
            gap=round(rng.uniform(-3.0, gap_scale), 2),
            severity=round(rng.uniform(0.0, 1.0), 3),
            idle=rng.randint(0, 6),
        )
        for zone_id in hotspot_ids
    ]
    surplus_zones = [
        source(
            zone_id,
            surplus=round(rng.uniform(0.5, 30.0), 2),
            idle=rng.randint(0, 40),
            # 1/3 số zone nguồn đang trong cooldown, 1/3 đã hết hạn, 1/3 chưa bị rút bao giờ.
            cooldown_until_ts=rng.choice(
                [None, T0 - timedelta(minutes=rng.randint(1, 30)), T0 + timedelta(minutes=rng.randint(1, 30))]
            ),
        )
        for zone_id in surplus_ids
    ]

    # Mưa phủ đủ 30 zone; khoảng 40% step hoàn toàn khô để nhánh hệ số 1.0 cũng được đi qua.
    rain_mm_h = {
        zone_id: 0.0 if rng.random() < 0.4 else round(rng.uniform(0.0, 12.0), 2) for zone_id in range(1, ZONE_COUNT + 1)
    }
    policy = make_policy(budget_cap=BUDGET_CAPS[seed % len(BUDGET_CAPS)])
    return make_output(hotspots=hotspots, surplus_zones=surplus_zones), rain_mm_h, policy


def check_all_constraints(
    result: SolveResult,
    output: HotspotOutput,
    policy: Policy,
    coords: Mapping[int, ZoneCoord],
    seed: int,
) -> None:
    """14 ràng buộc §4.1 áp cho Model 3 — mọi assert đều nêu `seed` để tái hiện được một mình."""
    rules = policy.rules
    where = f"seed={seed}"

    # A1 — trần ngân sách điều chuyển.
    assert result.plan_totals.total_cost <= rules.budget_cap, where
    assert result.plan_totals.total_cost == sum(move.estimated_cost for move in result.moves), where

    hotspot_ids = {item.zone_id for item in output.hotspots}
    idle_by_zone = {zone.zone_id: zone.idle_supply_current for zone in output.surplus_zones}
    cooldown_by_zone = {zone.zone_id: zone.cooldown_until_ts for zone in output.surplus_zones}
    withdrawn: dict[int, int] = {}

    for move in result.moves:
        # A4 — bán kính điều chuyển.
        assert move.estimated_distance_km <= rules.max_distance + FLOAT_TOLERANCE, where
        assert move.estimated_distance_km == pytest.approx(distance_between(coords, move.from_zone, move.to_zone)), (
            where
        )
        # A11 — xe không bao giờ "đến ngay trong step này".
        assert move.eta_steps >= 1, where
        assert move.units_to_move >= 1, where
        assert move.from_zone != move.to_zone, where
        # Nguồn phải là một surplus zone thật và không phải zone đang thiếu xe.
        assert move.from_zone in idle_by_zone, where
        assert move.from_zone not in hotspot_ids, where
        assert move.to_zone in hotspot_ids, where
        # A8 — zone còn cooldown không được làm nguồn.
        cooldown = cooldown_by_zone[move.from_zone]
        assert cooldown is None or cooldown <= T0, where
        withdrawn[move.from_zone] = withdrawn.get(move.from_zone, 0) + move.units_to_move

    for zone_id, units in withdrawn.items():
        idle = idle_by_zone[zone_id]
        # A6 — sàn cung tối thiểu, tính trên TỔNG đã rút chứ không từng move.
        assert idle - units >= rules.min_supply_per_zone, where
        # A7 — trần tỷ lệ rút, cũng tính trên tổng.
        assert units <= math.floor(rules.max_supply_move_pct * idle), where

    check_gap_conservation(result, output, seed=seed)


def check_gap_conservation(result: SolveResult, output: HotspotOutput, *, seed: int) -> None:
    """AC #4 — với mỗi hotspot: gap ban đầu = số xe điều tới + `gap_remaining`.

    Đây là ràng buộc giữ cho `residual_gap` là input dùng được của Khối C: thiếu vế nào cũng
    làm Activation Engine huy động sai số xe mà không phép kiểm nào ở tầng dưới bắt được.
    """
    delivered: dict[int, int] = {}
    for move in result.moves:
        delivered[move.to_zone] = delivered.get(move.to_zone, 0) + move.units_to_move
    residual_by_zone = {item.zone_id: item.gap_remaining for item in result.residual_gap}

    for item in output.hotspots:
        if item.gap <= FLOAT_TOLERANCE:
            # Gap âm/không đáng kể: không được điều xe tới, cũng không sinh residual.
            assert item.zone_id not in delivered, f"seed={seed}, zone={item.zone_id}"
            assert item.zone_id not in residual_by_zone, f"seed={seed}, zone={item.zone_id}"
            continue
        covered = delivered.get(item.zone_id, 0) + residual_by_zone.get(item.zone_id, 0.0)
        assert covered == pytest.approx(item.gap, abs=FLOAT_TOLERANCE), f"seed={seed}, zone={item.zone_id}"

    for item in result.residual_gap:
        assert item.gap_remaining > 0.0, f"seed={seed}, zone={item.zone_id}"
        assert item.suggested_activation == math.ceil(item.gap_remaining), f"seed={seed}, zone={item.zone_id}"


@pytest.mark.parametrize("seed", range(BASE_SEED, BASE_SEED + SNAPSHOT_COUNT))
def test_moi_snapshot_ngau_nhien_deu_thoa_rang_buoc(seed: int, real_zone_coords: Mapping[int, ZoneCoord]) -> None:
    """AC #3 — 120 snapshot có seed, không snapshot nào vi phạm bất kỳ ràng buộc nào."""
    output, rain_mm_h, policy = build_snapshot(seed)
    result = solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)

    check_all_constraints(result, output, policy, real_zone_coords, seed)


@pytest.mark.parametrize("seed", range(BASE_SEED, BASE_SEED + 20))
def test_snapshot_ngau_nhien_cho_ket_qua_lap_lai_duoc(seed: int, real_zone_coords: Mapping[int, ZoneCoord]) -> None:
    """§3 #4 — cùng snapshot chạy hai lần cho plan giống hệt nhau, kể cả thứ tự."""
    output, rain_mm_h, policy = build_snapshot(seed)
    first = solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)
    second = solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)

    assert first == second


def test_bo_snapshot_du_da_dang_de_test_co_nghia(real_zone_coords: Mapping[int, ZoneCoord]) -> None:
    """Chốt chặn chống test rỗng nghĩa.

    120 snapshot mà toàn ra plan rỗng thì mọi assert ở trên đều đúng một cách vô ích. Test này
    đòi bộ sinh thực sự chạm được cả ba nhánh đáng quan tâm: có move, có residual, và có ít
    nhất một zone nguồn phục vụ nhiều hotspot.
    """
    with_moves = 0
    with_residual = 0
    with_shared_source = 0

    for seed in range(BASE_SEED, BASE_SEED + SNAPSHOT_COUNT):
        output, rain_mm_h, policy = build_snapshot(seed)
        result = solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)
        if result.moves:
            with_moves += 1
        if result.residual_gap:
            with_residual += 1
        sources = [move.from_zone for move in result.moves]
        if len(sources) > len(set(sources)):
            with_shared_source += 1

    assert with_moves >= 20
    assert with_residual >= 20
    assert with_shared_source >= 5
