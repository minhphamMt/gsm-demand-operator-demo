"""Xác thực service-to-service giữa apps/backend và apps/ai (issue #12).

apps/ai là service nội bộ do apps/backend gọi qua HTTP, không phải Driver App demo —
quyết định "không tự thêm auth" ở CLAUDE.md §7.1 #4 / §11.2 chỉ nói về Driver App,
không miễn trừ cho service này. Thiếu khóa dùng chung nghĩa là POST /decisions
(endpoint nặng nhất, chạy trọn pipeline forecast → hotspot → optimizer) gọi được ẩn
danh trên Cloud Run.

Fail-closed khi app_env=production và chưa cấu hình khóa: không được để service
production chạy mà quên đặt AI_SERVICE_API_KEY. Fail-open khi chưa cấu hình ở
development/test để không phá vỡ luồng dev/test hiện có (CI không set biến này).
"""

import hmac
import logging

from fastapi import Header, HTTPException

from src.config import get_settings

logger = logging.getLogger(__name__)


def require_service_api_key(x_api_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    expected = settings.ai_service_api_key
    if not expected:
        if settings.app_env == "production":
            logger.error("AI_SERVICE_API_KEY chưa được cấu hình ở production")
            raise HTTPException(status_code=503, detail="AI_SERVICE_API_KEY chưa được cấu hình")
        return
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Thiếu hoặc sai X-API-Key")
