"""FastAPI app của GSM-14 NovaFour.

Skeleton: mới có hạ tầng + GET /health. Các router nghiệp vụ (routes_replay,
routes_plan, routes_activation, routes_driver, routes_history) được gắn vào ở
T0.7 trở đi — xem IMPLEMENTATION_PLAN.md.
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.config import Settings, get_settings

logger = logging.getLogger(__name__)

# config/policy.yaml phải đủ 19 key (DATA_CONTRACT.md §5). Đây là hằng số toàn vẹn
# schema, không phải ngưỡng nghiệp vụ — nên nằm ở đây là đúng chỗ.
REQUIRED_POLICY_KEYS = 19


def build_readiness(settings: Settings) -> dict[str, Any]:
    """Báo cáo mức sẵn sàng theo đúng shape của API_CONTRACT.md §8.2.

    Skeleton chỉ kiểm **sự tồn tại** của artefact, chưa parse nội dung: đếm 19 key
    của policy.yaml là việc của src/common/policy.py (T0.1), đếm 600 tài xế là việc
    của T0.6. Trả 0 khi chưa có loader là cố ý — báo một con số chưa kiểm chứng ở
    endpoint dùng cho healthcheck còn tệ hơn báo là chưa sẵn sàng.
    """
    policy_loaded = settings.policy_path.is_file()
    return {
        "status": "ok",
        "app_env": settings.app_env,
        "policy_loaded": policy_loaded,
        "policy_keys": 0,  # T0.1 nối vào src.common.policy
        "zones": 0,  # T0.4
        "drivers": 0,  # T0.6
        "history_db": "ok" if settings.history_db_path.is_file() else "missing",
        "model_version": settings.model_version,
        "baseline_frozen": settings.baseline_freeze_path.is_file(),
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Khởi tạo theo thứ tự ARCHITECTURE.md §6.4.

    Fail-fast thật (thiếu key ⇒ crash) được bật ở T0.1 khi policy.yaml tồn tại.
    Ở skeleton chỉ cảnh báo, nếu không thì repo không khởi động được lần nào
    trước khi T0.1 xong — trong khi T0.5 AC #5 cần app chạy được.
    """
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)
    logger.info("Khởi động %s | app_env=%s", settings.app_name, settings.app_env)

    readiness = build_readiness(settings)
    if not readiness["policy_loaded"]:
        logger.warning("Chưa có %s — /health sẽ trả 503 cho tới khi T0.1 xong", settings.policy_path)

    _mount_frontend(app, settings)
    yield
    logger.info("Dừng %s", settings.app_name)


app = FastAPI(
    title="GSM-14 NovaFour",
    description=(
        "Pipeline mô phỏng phân bổ xe giờ cao điểm — deterministic, không LLM trong luồng chính. "
        "Xem ARCHITECTURE.md và API_CONTRACT.md."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# Không cấu hình CORS: frontend build tĩnh được chính app này phục vụ, cùng origin
# (quyết định A-01, ARCHITECTURE.md §9). Dev server Vite dùng proxy thay vì CORS.


@app.get("/health", tags=["infra"])
async def health() -> JSONResponse:
    """Healthcheck cho Docker/orchestrator — API_CONTRACT.md §8.2.

    policy_loaded == false hoặc policy_keys != 19 ⇒ HTTP 503.
    """
    settings = get_settings()
    report = build_readiness(settings)
    ready = report["policy_loaded"] and report["policy_keys"] == REQUIRED_POLICY_KEYS
    if not ready:
        report["status"] = "degraded"
        return JSONResponse(status_code=503, content=report)
    return JSONResponse(status_code=200, content=report)


def _mount_frontend(application: FastAPI, settings: Settings) -> None:
    """Gắn bản build tĩnh của SPA (T8). Chưa có dist thì bỏ qua, không chặn boot."""
    if settings.frontend_dist_dir.is_dir():
        application.mount(
            "/",
            StaticFiles(directory=settings.frontend_dist_dir, html=True),
            name="frontend",
        )
    else:
        logger.info("Chưa có %s — bỏ qua mount frontend (T8)", settings.frontend_dist_dir)
