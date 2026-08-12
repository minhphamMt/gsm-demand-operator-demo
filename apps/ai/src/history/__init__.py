"""History Store — nhật ký quyết định, append-only (§5.8, task T6).

Sẽ chứa (docs/design/ARCHITECTURE.md §7):
    store.py    §5.8 · SQLite WAL, UPDATE/DELETE bị trigger DB chặn
    queries.py  tra theo plan_id / khoảng thời gian

Append-only ép ở tầng DB chứ không chỉ ở tầng code: một audit trail mà ứng dụng
có quyền sửa thì không còn là audit trail. API không có endpoint sửa/xóa History.
"""
