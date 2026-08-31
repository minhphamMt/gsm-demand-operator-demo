"""Cấu hình ứng dụng đọc từ biến môi trường / .env.

Ranh giới cần giữ: file này chỉ giữ **đường dẫn và tham số hạ tầng**. Mọi ngưỡng
nghiệp vụ (min_supply_per_zone, budget_cap, incentive_*, activation_radius_km, ...)
nằm ở config/policy.yaml và chỉ src/common/policy.py được đọc — xem CLAUDE.md §3 #2.
Đưa ngưỡng vào đây là mở ra một nguồn sự thật thứ hai.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Gốc repo — src/config.py nằm ở src/, nên lùi một cấp.
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "GSM-14 NovaFour"
    app_env: Literal["development", "production", "test"] = "development"
    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, ge=1, le=65535)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # ---- Đường dẫn config (docs/design/ARCHITECTURE.md §6.4, thứ tự khởi tạo) ----
    policy_path: Path = PROJECT_ROOT / "config" / "policy.yaml"
    zone_registry_path: Path = PROJECT_ROOT / "config" / "zone_registry.json"
    driver_registry_path: Path = PROJECT_ROOT / "config" / "driver_registry.json"
    driver_response_path: Path = PROJECT_ROOT / "config" / "driver_response.yaml"

    # ---- Đường dẫn dữ liệu ----
    data_dir: Path = PROJECT_ROOT / "data"
    history_db_path: Path = PROJECT_ROOT / "data" / "history.db"
    baseline_freeze_path: Path = PROJECT_ROOT / "data" / "baseline" / "BASELINE_FREEZE.md"
    replay_dataset_manifest_path: Path = PROJECT_ROOT / "config" / "replay_dataset_manifest.json"

    # ---- Frontend build tĩnh (T8) ----
    frontend_dist_dir: Path = PROJECT_ROOT / "frontend" / "dist"

    # ---- Truy vết ----
    # Mọi run phải gắn model_version (CLAUDE.md §3 #4). Giá trị thật do task T1 đặt
    # khi Model 1 được huấn luyện; "unset" là tín hiệu chưa có model, không phải mặc định hợp lệ.
    model_version: str = "unset"

    # ---- Điều phối multi-agent ----
    # Mặc định TẮT là điều kiện để KPI tái lập: khi tắt, mỗi agent chạy đúng chuỗi tool cố
    # định nên cùng snapshot luôn cho cùng kết quả — baseline đã khóa, INV-1/2/3 và eval vẫn
    # so được. Bật lên là chấp nhận đường đi do LLM chọn, chỉ dùng cho demo (CLAUDE.md §3 #4).
    llm_routing_enabled: bool = False

    # Gateway OpenAI-compatible. Đổi nhà cung cấp = đổi base_url + slug, không sửa code.
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str | None = None

    # Model tách theo vai trò: hai agent phân tích chỉ chọn tool và đọc số nên dùng model rẻ;
    # riêng Explanation viết tiếng Việt cho điều phối viên đọc nên đáng dùng model khá hơn.
    # Slug đã đối chiếu với danh sách model của OpenRouter (2026-08-23) và cả hai đều khai
    # báo hỗ trợ tool calling. Không dùng biến thể `:batch` — batch chạy bất đồng bộ, không
    # hợp với vòng lặp tool-use đồng bộ ở đây.
    llm_model_analysis: str = "google/gemini-3.7-flash"
    llm_model_explanation: str = "anthropic/claude-haiku-4.5"

    # Trần thời gian một lượt gọi LLM. Vượt là rơi về fallback template, không treo pipeline.
    llm_timeout_seconds: float = Field(default=30.0, gt=0)
    # Số vòng tool-use tối đa cho một agent — chặn vòng lặp LLM gọi tool không dừng.
    llm_max_tool_rounds: int = Field(default=6, ge=1, le=20)

    # ---- Bảo mật service-to-service (issue #12) ----
    # Khóa dùng chung giữa apps/backend và apps/ai, kiểm ở src/api/auth.py. Rỗng nghĩa
    # là chưa cấu hình — chỉ được phép ở development/test, xem require_service_api_key.
    ai_service_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
