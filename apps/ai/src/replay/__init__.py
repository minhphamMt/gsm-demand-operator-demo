"""Replay Engine — phát lại snapshot 5 phút/step từ dữ liệu synthetic (§5.1).

Sẽ chứa (docs/design/ARCHITECTURE.md §7):
    engine.py    §5.1 · điền idle_supply_current + cooldown_until_ts (§4.3)
    scenario.py  §5.10 · reset gồm xóa offer queue + driver_registry
    store.py     đọc Parquet random-access

Không có đồng hồ thật ở đây: thời gian là chỉ số step trong dữ liệu đã sinh sẵn,
nhờ vậy mọi lần chạy cho cùng một kết quả (§3.2 deterministic).
"""
