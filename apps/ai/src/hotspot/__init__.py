"""Model 2 — phát hiện hotspot từ forecast (§5.3, task T2).

Sẽ chứa (docs/design/ARCHITECTURE.md §7):
    detector.py    §5.3 · gap / severity / is_hotspot
    hysteresis.py  §4.3 · vào hotspot cần 2 step liên tiếp, ra cần 3

Hysteresis không phải tinh chỉnh cho đẹp: thiếu nó thì hotspot nhấp nháy theo từng
step, người điều phối nhận plan mâu thuẫn nhau mỗi 5 phút và mất tin vào hệ thống.
"""
