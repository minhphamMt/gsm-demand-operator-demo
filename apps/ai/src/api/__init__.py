"""Tầng HTTP — tầng DUY NHẤT được dùng async (CLAUDE.md §5.2).

Sẽ chứa (docs/design/ARCHITECTURE.md §7):
    routes_replay.py routes_plan.py routes_activation.py
    routes_driver.py routes_history.py
    errors.py  map exception nghiệp vụ → HTTP status theo docs/design/API_CONTRACT.md §1.2

Tầng này chỉ validate input bằng Pydantic rồi gọi xuống; công thức và ràng buộc
nghiệp vụ nằm ở tầng model/optimizer/simulator dưới dạng hàm đồng bộ thuần.

GET /health nằm ngoài /api/v1 và được định nghĩa ở src/main.py (docs/design/API_CONTRACT.md §8.2).
"""
