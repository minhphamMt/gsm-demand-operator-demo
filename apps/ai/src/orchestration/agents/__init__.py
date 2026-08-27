"""Agent gọi LLM: client tới gateway và vòng lặp tool-use.

Gói này là ranh giới duy nhất được phép nói chuyện với LLM. Module tính số
(`simulation/metrics.py`, `optimizer/`, `hotspot/`, `forecasting/`) không được import gì ở
đây — test kiến trúc canh đúng điều đó, vì "LLM đọc số, không sinh số" (CLAUDE.md §10.1 #5)
chỉ giữ được nếu hai tầng không chạm nhau.
"""
