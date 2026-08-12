"""FastAPI app của GSM-14 NovaFour.

Skeleton: mới có hạ tầng + GET /health. Các router nghiệp vụ (routes_replay,
routes_plan, routes_activation, routes_driver, routes_history) được gắn vào ở
T0.7 trở đi — xem docs/design/IMPLEMENTATION_PLAN.md.
"""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from src.api.routes_inference import router as inference_router
from src.api.routes_inference import trained_model_readiness
from src.common.errors import ConfigError
from src.common.policy import REQUIRED_RULE_KEYS, get_policy
from src.config import Settings, get_settings

logger = logging.getLogger(__name__)

# config/policy.yaml phải đủ 19 key (docs/design/DATA_CONTRACT.md §5). Suy ra từ schema
# của loader thay vì viết literal 19 — thêm key mà quên sửa số ở đây là lỗi im lặng.
REQUIRED_POLICY_KEYS = len(REQUIRED_RULE_KEYS)


def build_readiness(settings: Settings) -> dict[str, Any]:
    """Báo cáo mức sẵn sàng theo đúng shape của docs/design/API_CONTRACT.md §8.2.

    policy.yaml được **parse thật** qua src/common/policy.py, không chỉ kiểm file có
    tồn tại: một file tồn tại nhưng thiếu key vẫn khiến mọi module dùng ngưỡng gãy.
    zones/drivers vẫn là 0 cho tới T0.4/T0.6 — báo một con số chưa kiểm chứng ở
    endpoint dùng cho healthcheck còn tệ hơn báo là chưa sẵn sàng.
    """
    try:
        get_policy(settings.policy_path)
    except ConfigError as exc:
        logger.error("policy.yaml không dùng được: %s", exc.message)
        policy_loaded, policy_keys = False, 0
    else:
        policy_loaded, policy_keys = True, REQUIRED_POLICY_KEYS

    zones = json.loads(settings.zone_registry_path.read_text(encoding="utf-8"))
    drivers = json.loads(settings.driver_registry_path.read_text(encoding="utf-8"))
    return {
        "status": "ok",
        "app_env": settings.app_env,
        "policy_loaded": policy_loaded,
        "policy_keys": policy_keys,
        "zones": len(zones),
        "drivers": len(drivers),
        "history_db": "ok" if settings.history_db_path.is_file() else "missing",
        "history_source": "supabase",
        "model_version": settings.model_version,
        "baseline_frozen": settings.baseline_freeze_path.is_file(),
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Khởi tạo theo thứ tự docs/design/ARCHITECTURE.md §6.4.

    Bước 1 là nạp policy.yaml và **fail-fast**: thiếu key ⇒ ConfigError bay lên, app
    không khởi động. Đây là chủ ý, không phải thiếu xử lý lỗi — chạy tiếp với ngưỡng
    khuyết nghĩa là mọi số KPI sinh ra sau đó đứng trên tham số không ai duyệt.
    Các bước 2–5 (zone_registry, driver_registry, history.db, snapshot store) vào ở
    T0.4/T0.6/T6.
    """
    settings = get_settings()
    logging.basicConfig(level=settings.log_level)
    logger.info("Khởi động %s | app_env=%s", settings.app_name, settings.app_env)

    get_policy(settings.policy_path)

    _mount_frontend(app, settings)
    yield
    logger.info("Dừng %s", settings.app_name)


app = FastAPI(
    title="GSM-14 NovaFour",
    description=(
        "Pipeline mô phỏng phân bổ xe giờ cao điểm — deterministic, không LLM trong luồng chính. "
        "Xem docs/design/ARCHITECTURE.md và docs/design/API_CONTRACT.md."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(inference_router)

# Không cấu hình CORS: frontend build tĩnh được chính app này phục vụ, cùng origin
# (quyết định A-01, docs/design/ARCHITECTURE.md §9). Dev server Vite dùng proxy thay vì CORS.


@app.get("/health", tags=["infra"])
async def health() -> JSONResponse:
    """Healthcheck cho Docker/orchestrator — docs/design/API_CONTRACT.md §8.2.

    policy_loaded == false hoặc policy_keys != 19 ⇒ HTTP 503.
    """
    settings = get_settings()
    report = build_readiness(settings)
    model_readiness = trained_model_readiness()
    report["inference_api"] = True
    report["forecast_mode"] = "trained_model_replay" if model_readiness["ready"] else "live_snapshot_baseline"
    report["trained_model_ready"] = model_readiness["ready"]
    report["model_artifacts"] = model_readiness["artifacts"]
    report["trained_model"] = model_readiness
    ready = report["policy_loaded"] and report["policy_keys"] == REQUIRED_POLICY_KEYS and bool(model_readiness["ready"])
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
