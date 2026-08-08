"""Lõi đo lường và mô phỏng Before/After.

Sẽ chứa (ARCHITECTURE.md §7):
    metrics.py    §5.14.1 · 4 công thức KPI · task T0.3 · KHÔNG import policy/forecast
    simulator.py  §5.5 · 3 kịch bản no_action / plan_only / plan_activation · task T4

metrics.py là nguồn công thức duy nhất: baseline đã khóa và Simulator bắt buộc gọi
cùng module này. Cài lại công thức lần thứ hai trong simulator.py làm mọi so sánh KPI
mất hiệu lực — spec cấm rõ (§5.14.1) và có test tĩnh chặn trong CI.
"""
