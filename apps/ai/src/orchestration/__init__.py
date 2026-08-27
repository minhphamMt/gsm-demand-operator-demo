"""Tầng điều phối multi-agent — LangGraph, tool registry và agent gọi LLM.

Ranh giới của gói này (docs/design/ARCHITECTURE.md §1, sửa đổi 2026-08-23):

- Đồ thị chỉ phủ **tầng phân tích** của Khối A+B và kết thúc ở trạng thái `PROPOSED`.
  Khối C, hai cổng phê duyệt và mọi side effect nằm ngoài — do NestJS giữ.
- `steps.py` là các bước tính toán **thuần và deterministic**, dùng chung cho cả route
  `/decisions` cũ lẫn đồ thị mới. Một công thức, một nơi cài — nhân đôi ở đây là cách
  làm hai đường sinh ra hai con số khác nhau mà test không thấy.
- Agent chỉ được gọi tool trong allowlist của mình; tool có side effect không nằm trong
  allowlist nào (CLAUDE.md §10.1).
"""
