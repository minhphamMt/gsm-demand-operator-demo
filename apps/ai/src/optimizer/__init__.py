"""Model 3 — Relocation Optimizer, greedy theo severity (§5.4, task T3).

Gồm (docs/design/ARCHITECTURE.md §7):
    greedy.py       §5.4 · xếp hotspot theo severity giảm dần rồi ghép nguồn gần nhất;
                    `solve()` là cửa vào duy nhất của tầng này
    constraints.py  §5.4 · budget_cap / max_distance / max_supply_move_pct /
                    min_supply_per_zone / cooldown_minutes, cùng phép quy đổi
                    khoảng cách → thời gian → `eta_steps`

Min-cost flow và OR-Tools đã bị cắt khỏi MVP (§7.1 #1) — greedy là phương án chốt,
không phải giải pháp tạm.

Mọi ngưỡng nhận qua tham số, không tự đọc policy.yaml (CLAUDE.md §5.2).
"""
