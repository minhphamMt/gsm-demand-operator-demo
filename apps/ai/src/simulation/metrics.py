"""LÕI METRIC DÙNG CHUNG — bốn công thức của §5.5, cài đúng MỘT lần, ở đây.

Baseline no-action và Simulator Before/After **bắt buộc** import module này. Viết lại
công thức lần thứ hai ở simulator.py làm mọi so sánh KPI mất hiệu lực (§5.14.1) — hai
bản cài đặt lệch nhau một chữ số thập phân là đủ để "uplift" trở thành nhiễu.

Module này cố ý KHÔNG đọc cấu hình ngưỡng và KHÔNG biết gì về tầng dự báo: nó chỉ nhận
demand/supply thành số và trả về số. Nhiễm tham số vào đây nghĩa là baseline đã khóa và
lần chạy hôm nay không còn tính bằng cùng một hàm. Có test tĩnh chặn trong CI.

Năm quy ước tổng hợp (§5.14.1), dễ sai nên ghi rõ:
    1. supply = idle_supply; ở baseline enroute LUÔN bằng 0.
    2. wait toàn hệ thống = trung bình có TRỌNG SỐ theo demand.
    3. cancel toàn hệ thống = trung bình có trọng số của cancel TỪNG ZONE,
       KHÔNG phải logistic của wait trung bình (hai cách cho hai số khác nhau).
    4. Zone demand = 0 tự loại nhờ trọng số 0, không cần lọc riêng.
    5. unmet CỘNG DỒN; wait/cancel LẤY TRUNG BÌNH; tất cả tách theo 4 regime.
"""

import math
from collections.abc import Iterable
from dataclasses import dataclass

# Hệ số của công thức §5.5. Đây là hằng ĐỊNH NGHĨA metric, không phải ngưỡng vận hành:
# đổi chúng là đổi thước đo, buộc tính lại toàn bộ số đã công bố (§5.14.3).
WAIT_SCALE = 3.0
WAIT_EXPONENT = 1.5
CANCEL_SLOPE = 0.4
CANCEL_MIDPOINT = 8.0


@dataclass(frozen=True)
class ZoneMetrics:
    """Metric của một (zone, ts_bucket)."""

    unmet: float
    ratio: float
    avg_wait_proxy: float
    est_cancel_rate: float


@dataclass(frozen=True)
class SystemMetrics:
    """Metric tổng hợp trên một tập zone — quy ước 2, 3, 4, 5."""

    unmet_demand: float
    avg_wait_proxy: float
    est_cancel_rate: float
    total_demand: float


def unmet(demand: float, supply: float) -> float:
    """max(0, demand − supply). Dư cung KHÔNG bù cho zone thiếu cung."""
    return max(0.0, demand - supply)


def ratio(demand: float, supply: float) -> float:
    """demand / max(supply, 1) — mẫu số kẹp ở 1 để zone cung bằng 0 không cho vô cực."""
    return demand / max(supply, 1.0)


def avg_wait_proxy(demand_supply_ratio: float) -> float:
    """3.0 × ratio^1.5 (phút)."""
    # float() vì mypy suy ra `float ** float` là Any (toán tử này còn nhánh trả complex);
    # ép kiểu ở đây rẻ hơn là mở `no-any-return` cho cả module.
    return WAIT_SCALE * float(demand_supply_ratio**WAIT_EXPONENT)


def est_cancel_rate(wait_minutes: float) -> float:
    """1 / (1 + e^(−0.4 × (wait − 8.0)))."""
    return 1.0 / (1.0 + math.exp(-CANCEL_SLOPE * (wait_minutes - CANCEL_MIDPOINT)))


def zone_metrics(demand: float, supply: float) -> ZoneMetrics:
    """Bốn công thức áp cho một zone, theo đúng thứ tự phụ thuộc."""
    zone_ratio = ratio(demand, supply)
    wait = avg_wait_proxy(zone_ratio)
    return ZoneMetrics(
        unmet=unmet(demand, supply),
        ratio=zone_ratio,
        avg_wait_proxy=wait,
        est_cancel_rate=est_cancel_rate(wait),
    )


def system_metrics(zones: Iterable[tuple[float, float]]) -> SystemMetrics:
    """Tổng hợp từ các cặp (demand, supply).

    unmet cộng dồn; wait và cancel là trung bình có trọng số theo demand. Cancel được
    lấy trung bình từ cancel của TỪNG zone (quy ước 3) — logistic là hàm lồi/lõm nên
    logistic(mean(wait)) khác mean(logistic(wait)), và cách sai luôn cho số đẹp hơn.

    Tổng demand = 0 ⇒ wait và cancel trả 0.0: không có khách thì không có ai chờ hay hủy.
    """
    total_unmet = 0.0
    total_demand = 0.0
    weighted_wait = 0.0
    weighted_cancel = 0.0

    for demand, supply in zones:
        metrics = zone_metrics(demand, supply)
        total_unmet += metrics.unmet
        total_demand += demand
        weighted_wait += metrics.avg_wait_proxy * demand
        weighted_cancel += metrics.est_cancel_rate * demand

    if total_demand <= 0.0:
        return SystemMetrics(unmet_demand=total_unmet, avg_wait_proxy=0.0, est_cancel_rate=0.0, total_demand=0.0)

    return SystemMetrics(
        unmet_demand=total_unmet,
        avg_wait_proxy=weighted_wait / total_demand,
        est_cancel_rate=weighted_cancel / total_demand,
        total_demand=total_demand,
    )
