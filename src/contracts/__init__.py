"""9 message contract §4.1–4.9 dưới dạng Pydantic v2 — task T0.7.

Một file cho mỗi entity, tên file theo DATA_CONTRACT.md §2:
    snapshot.py forecast.py hotspot.py plan.py revision.py
    history.py driver.py offer.py response.py

Đây là ranh giới đông cứng của hệ thống: contract khóa cuối W2 (I-08). Sau mốc đó
chỉ được THÊM field optional — đổi tên, đổi kiểu hay bỏ field làm hỏng mọi bản ghi
đã sinh ra trước đó và mọi số KPI đã công bố.

Chỉ được import từ src.common (ARCHITECTURE.md §6.2).
"""
