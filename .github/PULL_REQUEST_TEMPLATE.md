<!--
Điền cả ba mục dưới đây trước khi xin review — theo đề xuất ở issue #15.
Xoá phần hướng dẫn (chữ nghiêng trong ngoặc) sau khi điền.
-->

## Thay đổi gì

<!-- Mô tả ngắn gọn thay đổi, và neo về task ID (IMPLEMENTATION_PLAN.md, T0.1–T11) hoặc mục spec (§x.y) theo CLAUDE.md §4.1. -->

## Kiểm thế nào

<!-- Lệnh đã chạy và kết quả, ví dụ: -->
- [ ] `pytest tests/ -v` xanh
- [ ] `ruff check src/ tests/` xanh
- [ ] `ruff format --check src/ tests/` xanh
- [ ] Nếu chạm Simulator/metrics/baseline: `pytest tests/test_simulation/test_invariants.py` (INV-1/2/3) xanh
- [ ] Test mới cho code mới (nếu có code mới)

## Phần nào do AI sinh, đã sửa gì

<!-- Nêu rõ phần nào AI viết, phần nào tự viết/tự sửa, và đã kiểm tra lại những gì trước khi merge.
Nếu không dùng AI cho PR này, ghi "Không dùng AI". -->
