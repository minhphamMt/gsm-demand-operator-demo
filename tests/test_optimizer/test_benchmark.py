"""Phép đo thời gian của Model 3 — T3 AC #2: ≤ 5 giây cho 30 zone (SPEC §5.4, §6).

Ngưỡng 5 giây là ràng buộc vận hành: replay chạy theo bước 5 phút, nên một step tốn hơn 5 giây
làm hàng đợi dồn lại và AGENT_WORKFLOW §3.1 buộc chuyển sang `mode="fast"`. Đo ở đây để mốc đó
được canh gác tự động, thay vì chỉ được kiểm bằng mắt lúc demo.

Instance đem đo KHÓ HƠN thực tế có chủ đích: 15 hotspot × 15 zone nguồn trên toạ độ Hà Nội
thật, `max_distance` nới rộng để MỌI cặp zone đều là ứng viên (thực tế bán kính 7 km loại bớt
kha khá), gap lớn và sức chứa nguồn nhỏ để vòng lặp trong phải chạy nhiều lượt nhất có thể.
Qua được ca này thì mọi snapshot thật đều qua.
"""

import time
from collections.abc import Mapping

from src.common.haversine import ZoneCoord
from src.contracts import ZONE_COUNT
from src.contracts.hotspot import HotspotOutput
from src.optimizer.greedy import solve

from .conftest import T0, hotspot, make_output, make_policy, source

# §5.4/§6 — trần cứng cho một step Model 3.
TIME_BUDGET_SECONDS = 5.0

# Nới bán kính để không ứng viên nào bị lọc sớm: đây là cách làm bài toán NẶNG hơn thực tế,
# không phải cách né ràng buộc — plan sinh ra ở đây không dùng cho bất kỳ số liệu nào.
UNBOUNDED_DISTANCE_KM = 100.0


def worst_case_snapshot() -> tuple[HotspotOutput, dict[int, float]]:
    """30 zone chia đôi: 15 hotspot gap lớn, 15 nguồn sức chứa nhỏ.

    Sức chứa nhỏ là điều khiến vòng lặp trong chạy nhiều nhất: mỗi hotspot phải gom xe từ nhiều
    nguồn liên tiếp thay vì xong trong một move.
    """
    half = ZONE_COUNT // 2
    hotspots = [hotspot(zone_id, gap=60.0, severity=zone_id / ZONE_COUNT, idle=0) for zone_id in range(1, half + 1)]
    surplus_zones = [source(zone_id, surplus=8.0, idle=20) for zone_id in range(half + 1, ZONE_COUNT + 1)]
    rain_mm_h = {zone_id: 6.0 for zone_id in range(1, ZONE_COUNT + 1)}
    return make_output(hotspots=hotspots, surplus_zones=surplus_zones), rain_mm_h


def test_mot_step_30_zone_duoi_5_giay(real_zone_coords: Mapping[int, ZoneCoord]) -> None:
    """AC #2 — một lần `solve()` trên snapshot 30 zone nặng nhất phải xong dưới 5 giây."""
    output, rain_mm_h = worst_case_snapshot()
    policy = make_policy(max_distance=UNBOUNDED_DISTANCE_KM, budget_cap=100_000_000)

    started = time.perf_counter()
    result = solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)
    elapsed = time.perf_counter() - started

    # Plan phải thực sự có việc để làm — đo một lần chạy rỗng thì con số không nói lên gì.
    assert len(result.moves) >= ZONE_COUNT // 2
    assert elapsed < TIME_BUDGET_SECONDS, f"solve() mất {elapsed:.3f}s, vượt trần {TIME_BUDGET_SECONDS}s"


def test_mot_gio_replay_van_duoi_tran_moi_step(real_zone_coords: Mapping[int, ZoneCoord]) -> None:
    """12 step liên tiếp (một giờ replay) — không step nào chạm trần 5 giây.

    Đo nhiều step vì thứ làm hỏng benchmark ngoài đời thường là chi phí tích luỹ (cache phình,
    cấu trúc dữ liệu dựng lại mỗi lần), chứ không phải một lần chạy đơn lẻ.
    """
    output, rain_mm_h = worst_case_snapshot()
    policy = make_policy(max_distance=UNBOUNDED_DISTANCE_KM, budget_cap=100_000_000)

    slowest = 0.0
    for _ in range(12):
        started = time.perf_counter()
        solve(output, t=T0, rain_mm_h=rain_mm_h, policy=policy, zone_coords=real_zone_coords)
        slowest = max(slowest, time.perf_counter() - started)

    assert slowest < TIME_BUDGET_SECONDS, f"step chậm nhất mất {slowest:.3f}s, vượt trần {TIME_BUDGET_SECONDS}s"
