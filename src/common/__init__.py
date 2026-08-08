"""Tầng L0 — tiện ích thuần, dùng chung toàn hệ thống.

Sẽ chứa (ARCHITECTURE.md §7):
    regime.py     gán 4 regime normal/peak/rain/rain_peak — MỘT nơi duy nhất (§3.2 #4, T0.2)
    haversine.py  khoảng cách on-the-fly, không precompute ma trận 30x30 (§5.4)
    policy.py     loader 19 key của config/policy.yaml, fail-fast (§3.3, T0.1)
    ids.py        sinh plan_id / campaign_id / offer_id / record_id
    errors.py     exception nghiệp vụ mang error_code khớp API_CONTRACT.md §1.2

Ràng buộc kiến trúc: package này KHÔNG import bất kỳ package nào khác của src/
(ARCHITECTURE.md §6.2) — nếu nó phụ thuộc ngược lên tầng trên thì mọi tầng đều
kéo theo cả cây, và test tĩnh trong CI sẽ chặn.
"""
