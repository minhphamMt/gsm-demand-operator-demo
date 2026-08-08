"""Khối C — Activation Engine, huy động tài xế đang rảnh/offline (§5.11, task T7).

Sẽ chứa (ARCHITECTURE.md §7):
    engine.py      §5.11 · chọn ứng viên, phát hành offer
    incentive.py   §4.8 · min(base + per_km × d, max), làm tròn 1.000đ
    driver_sim.py  §5.11 · mô phỏng phản hồi tài xế, seed=7, chế độ human/simulated/mixed

Hai ràng buộc không được nới:
  - issue_offers() chỉ được gọi từ route đã kiểm confirm == true (cổng người #2, C-09).
  - Trần incentive chốt theo cam kết xấu nhất (giả định 100% nhận), không theo kỳ vọng.
"""
