"""Cấu hình chung cho toàn bộ test.

Một việc duy nhất, nhưng bắt buộc: **cắt test khỏi `.env` của máy đang chạy.**

Không có nó, một máy đã đặt `LLM_ROUTING_ENABLED=true` và `LLM_API_KEY` sẽ khiến `pytest`
gọi gateway thật — vi phạm CLAUDE.md §7 #2 (test không gọi API thật), đốt token mỗi lần
chạy, và làm kết quả test phụ thuộc cấu hình cục bộ thay vì phụ thuộc code (§7 #3).

Cách chặn: đặt biến môi trường **ở thời điểm import conftest**, trước khi bất kỳ module test
nào được nạp. `pydantic-settings` ưu tiên biến môi trường hơn file `.env`, nên cách này bịt
được cả những module đã `from src.config import get_settings` (bind tên lúc import, vá lại
hàm không còn tác dụng).

Test nào cần kiểm đường LLM thì tự truyền client giả vào (`llm_client=...`), chứ không bật
cờ toàn cục. Nhờ vậy "chạy đường LLM" luôn là lựa chọn tường minh của một test cụ thể.
"""

import os

# Phải chạy TRƯỚC `from src.config import ...` bên dưới: `get_settings` có lru_cache, và một
# lần gọi sớm sẽ đóng băng cấu hình đọc từ .env của máy.
os.environ["LLM_ROUTING_ENABLED"] = "false"
os.environ["LLM_API_KEY"] = ""

from src.config import get_settings  # noqa: E402 - phải import sau khi đã ép biến môi trường.

# Xoá cache phòng trường hợp một import khác đã kịp gọi get_settings() trước conftest.
get_settings.cache_clear()

_settings = get_settings()
assert not _settings.llm_routing_enabled, "Test phải chạy ở chế độ deterministic."
assert not _settings.llm_api_key, "Test không được mang theo khóa API thật."
