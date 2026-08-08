"""Gán nhãn 4 regime — NƠI DUY NHẤT trong hệ thống làm việc này (CLAUDE.md §3 #6).

    normal      không mưa, không cao điểm
    peak        không mưa, cao điểm
    rain        mưa, không cao điểm
    rain_peak   mưa VÀ cao điểm  ← thước đo thành công chính, không được giấu trong số tổng

Vì sao phải tập trung một chỗ: mỗi nơi tự viết `rain_mm_h > 0` hay `>= 0.5` là mỗi nơi
một định nghĩa "mưa", và hai bảng KPI cùng một lần chạy sẽ không so được với nhau.
Bản baseline cũ dùng `rain_mm_h > 0`, ngưỡng đã chốt là `>= 0.5` (quyết định A-05) —
đúng loại sai lệch mà test tĩnh ở tests/test_architecture.py chặn.

Ngưỡng lấy từ `derived.rain_threshold_mm_h` của config/policy.yaml, không viết cứng ở đây.
"""

from pathlib import Path
from typing import Literal

from src.common.policy import DEFAULT_POLICY_PATH, get_policy

Regime = Literal["normal", "peak", "rain", "rain_peak"]

REGIMES: tuple[Regime, ...] = ("normal", "peak", "rain", "rain_peak")


def tag_regime(rain_mm_h: float, peak_flag: int, rain_threshold_mm_h: float | None = None) -> Regime:
    """Trả nhãn regime của một (zone, ts_bucket).

    `rain_threshold_mm_h` để None thì đọc từ config/policy.yaml. Truyền tay chỉ dùng khi
    cần kiểm biên trong test hoặc khi phân tích độ nhạy quanh ngưỡng — không phải cửa sau
    để mỗi nơi tự chọn một ngưỡng khác.

    Biên là `>=`: 0.5 mm/h đã tính là mưa, 0.49 thì chưa.
    """
    threshold = rain_threshold_mm_h if rain_threshold_mm_h is not None else rain_threshold()
    is_rain = rain_mm_h >= threshold
    is_peak = bool(peak_flag)

    if is_rain and is_peak:
        return "rain_peak"
    if is_peak:
        return "peak"
    if is_rain:
        return "rain"
    return "normal"


def rain_threshold(policy_path: Path = DEFAULT_POLICY_PATH) -> float:
    """Ngưỡng mưa đang hiệu lực (mm/h) — đọc qua loader, có cache."""
    return get_policy(policy_path).derived.rain_threshold_mm_h


def is_heavy_rain(rain_mm_h: float, policy_path: Path = DEFAULT_POLICY_PATH) -> bool:
    """Mưa to theo `derived.heavy_rain_mm_h` — dùng cho hệ số di chuyển (§5.4), KHÔNG đổi nhãn regime.

    Tách riêng khỏi tag_regime vì spec chỉ có 4 regime; gộp "mưa to" vào sẽ thành 6 regime
    và mọi bảng KPI đã chốt phải làm lại.
    """
    return rain_mm_h >= get_policy(policy_path).derived.heavy_rain_mm_h
