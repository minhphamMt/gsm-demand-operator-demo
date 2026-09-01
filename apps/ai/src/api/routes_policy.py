"""Phơi ngưỡng vận hành ra cho các dịch vụ khác đọc.

Tồn tại vì CLAUDE.md §3 #2 chốt hai điều cùng lúc: `policy.yaml` là **nguồn ngưỡng duy nhất**,
và **chỉ `src/common/policy.py` được đọc file đó**. Hai luật ấy cộng lại có nghĩa là backend
NestJS không được tự parse YAML — nếu nó parse, sẽ có người đọc thứ hai và một bản sao ngưỡng
lặng lẽ trôi khỏi bản gốc, đúng thứ luật này sinh ra để cấm.

Nên đường duy nhất là: một người đọc file (Python), các dịch vụ khác hỏi qua HTTP.

Chỉ-đọc và không tham số: không có gì để chọn, và không có gì để ghi.
"""

from typing import Any

from fastapi import APIRouter

from src.common.policy import get_policy
from src.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["policy"])


@router.get("/policy")
def read_policy() -> dict[str, Any]:
    """Toàn bộ ngưỡng vận hành, kèm phiên bản để bên gọi truy vết được.

    Trả cả bộ chứ không chỉ key đang cần: cắt theo nhu cầu hôm nay thì mỗi lần thêm một
    consumer lại phải sửa endpoint, và mỗi lần sửa là một dịp để hai bên lệch nhau.

    `frozen_at` đi kèm vì I-08 khoá file — bên gọi thấy mốc này đổi là biết ngưỡng đã đổi,
    không phải đoán qua giá trị.
    """
    policy = get_policy(get_settings().policy_path)
    return {
        "version": policy.version,
        "frozen_at": policy.frozen_at,
        "rules": policy.rules.model_dump(),
    }
