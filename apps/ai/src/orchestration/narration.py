"""Câu tường thuật cho từng lượt gọi tool — kế hoạch `agent/08-interaction-log-plan.md` §3.3.

Đây là thứ giữ cho nhật ký còn đọc được khi `LLM_ROUTING_ENABLED=false` — tức mặc định của
dự án, của CI và của eval. Không có nó, chế độ deterministic chỉ có tên tool trơ trọi.

**Luật một dòng, và là luật quan trọng nhất của file: đọc nguyên văn số từ dict tool trả về.**
Không cộng, không chia, không làm tròn, không định dạng lại. Cùng luật "vỏ mỏng" mà
`decision_tools.py` đang giữ. Lý do: một câu tường thuật tính lại con số là một chỗ thứ hai
cài công thức, và khi hai chỗ lệch nhau thì người đọc log tin vào chỗ sai.

Module thuần: không đọc file, không đọc policy, không biết gì về `RunContext`.
"""

from collections.abc import Callable, Mapping
from typing import Any

Formatter = Callable[[Mapping[str, Any]], str]


def _forecast(result: Mapping[str, Any]) -> str:
    return (
        f"dự báo {result.get('zone_count')} zone, horizon {result.get('horizon_min')} phút — "
        f"regime {result.get('regime')}, chế độ {result.get('forecast_mode')}, "
        f"model {result.get('model_version')}"
    )


def _weather(result: Mapping[str, Any]) -> str:
    return (
        f"{result.get('wet_zone_count')} zone mưa (ngưỡng {result.get('rain_threshold_mm_h')} mm/h), "
        f"{result.get('peak_zone_count')} zone cao điểm, mưa lớn nhất {result.get('max_rain_mm_h')} mm/h"
    )


def _travel(result: Mapping[str, Any]) -> str:
    return (
        f"tốc độ trung bình {result.get('avg_vehicle_speed_kmh')} km/h, "
        f"trần khoảng cách {result.get('max_distance_km')} km, "
        f"hệ số mưa {'có áp dụng' if result.get('rain_travel_factor_applied') else 'không áp dụng'}"
    )


def _supply(result: Mapping[str, Any]) -> str:
    hotspots = result.get("policy_hotspot_ids") or []
    risks = result.get("risk_zone_ids") or []
    return (
        f"{len(hotspots)} hotspot chính sách {sorted(hotspots)}, {len(risks)} zone rủi ro, "
        f"{result.get('surplus_zone_count')} zone dư, tổng cung rỗi {result.get('total_idle_supply')} xe — "
        f"regime {result.get('planning_regime')}"
    )


def _relocation(result: Mapping[str, Any]) -> str:
    if result.get("planning_status") == "not_required":
        return "không có hotspot chính sách nên không cần điều chuyển — 0 chặng"
    return (
        f"{result.get('move_count')} chặng, {result.get('total_units')} xe, "
        f"chi phí {result.get('total_cost')} VNĐ / trần {result.get('budget_cap')} VNĐ, "
        f"còn {result.get('residual_zone_count')} zone chưa phủ hết"
    )


def _explanation(result: Mapping[str, Any]) -> str:
    return (
        f"lấy số nguồn để viết giải thích: {result.get('move_count')} chặng, "
        f"{result.get('total_units')} xe, {result.get('total_cost')} VNĐ, "
        f"{result.get('policy_hotspot_count')} hotspot chính sách"
    )


# Bảng tra, không phải chuỗi if/elif: thêm tool mới mà quên thêm dòng ở đây thì rơi vào
# nhánh mặc định và vẫn có một dòng đọc được, thay vì im lặng biến mất khỏi nhật ký.
FORMATTERS: dict[str, Formatter] = {
    "run_forecast": _forecast,
    "get_weather": _weather,
    "get_travel_conditions": _travel,
    "get_supply_state": _supply,
    "compute_relocation": _relocation,
    "render_explanation": _explanation,
}


def describe_call(tool: str) -> str:
    """Dòng phát lúc bắt đầu gọi tool, trước khi có kết quả."""
    return f"gọi {tool}()"


def narrate(tool: str, result: Mapping[str, Any]) -> str:
    """Dựng câu tường thuật từ kết quả tool.

    Lỗi của tool cũng phải thành một dòng đọc được — nuốt nó đi sẽ để lại một khoảng trống
    trong nhật ký đúng ở chỗ người xem cần biết nhất (CLAUDE.md §9 #3).
    """
    if result.get("status") == "error":
        message = result.get("message") or result.get("code") or result.get("error") or "không rõ nguyên nhân"
        return f"{tool} lỗi: {message}"
    formatter = FORMATTERS.get(tool)
    if formatter is None:
        return f"{tool} xong"
    return formatter(result)
