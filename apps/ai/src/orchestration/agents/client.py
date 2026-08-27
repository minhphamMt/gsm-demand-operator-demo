"""Client tới gateway LLM OpenAI-compatible (mặc định OpenRouter).

Cố ý không dùng SDK của nhà cung cấp nào: giao thức `POST /chat/completions` là mẫu số
chung của mọi model trên gateway, nên đổi từ Gemini sang Claude sang DeepSeek là đổi một
biến môi trường, không phải đổi gói và viết lại vòng lặp (CLAUDE.md §6).

Bảo mật: khóa API chỉ đi trong header. Không log khóa ở bất kỳ mức nào, kể cả DEBUG
(CLAUDE.md §8 #9) — vì thế các hàm ở đây log tên model và mã lỗi, không log request đầy đủ.
"""

import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class LLMUnavailableError(Exception):
    """Gateway không dùng được: thiếu khóa, sai slug, timeout, lỗi mạng.

    Không phải `NovaFourError`: đây là sự cố hạ tầng phụ trợ, và mọi nơi bắt nó đều phải
    rơi về đường deterministic chứ không được biến thành lỗi trả về cho người dùng
    (CLAUDE.md §10.1 #9).
    """


@dataclass(frozen=True)
class LLMResponse:
    """Một lượt trả lời: hoặc văn bản, hoặc yêu cầu gọi tool."""

    content: str
    tool_calls: tuple[dict[str, Any], ...]
    finish_reason: str
    model: str


class LLMClient:
    """Bọc `POST {base_url}/chat/completions`.

    Không giữ state giữa các lượt gọi: lịch sử hội thoại do `runner.py` truyền vào trọn vẹn
    mỗi lần, đúng như giao thức stateless của endpoint.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str | None,
        timeout_seconds: float,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout_seconds

    @property
    def configured(self) -> bool:
        """Có khóa hay không. Thiếu khóa là cấu hình hợp lệ — nghĩa là chạy deterministic."""
        return bool(self._api_key)

    def complete(
        self,
        *,
        model: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        """Một lượt gọi. `temperature=0` để cùng đầu vào cho ra đầu ra ổn định nhất có thể.

        Lưu ý: `temperature=0` KHÔNG đủ để tái lập tuyệt đối — đó là lý do eval và CI chạy
        ở chế độ deterministic chứ không dựa vào tham số này (CLAUDE.md §3 #4).
        """
        if not self._api_key:
            raise LLMUnavailableError("Chưa cấu hình LLM_API_KEY; không gọi được gateway.")

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(
                    f"{self._base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
        except httpx.HTTPError as error:
            raise LLMUnavailableError(f"Gọi gateway thất bại: {type(error).__name__}") from error

        if response.status_code >= 400:
            # Không đưa body vào message: body của gateway có thể vọng lại request, và
            # request có thể chứa dữ liệu vận hành.
            logger.warning("Gateway trả %s cho model %s", response.status_code, model)
            raise LLMUnavailableError(f"Gateway trả HTTP {response.status_code} cho model {model}.")

        try:
            body = response.json()
            choice = body["choices"][0]
            message = choice["message"]
        except (ValueError, KeyError, IndexError) as error:
            raise LLMUnavailableError("Gateway trả cấu trúc ngoài dự kiến.") from error

        return LLMResponse(
            content=message.get("content") or "",
            tool_calls=tuple(message.get("tool_calls") or ()),
            finish_reason=str(choice.get("finish_reason") or ""),
            model=str(body.get("model") or model),
        )

    def health(self, *, model: str) -> dict[str, object]:
        """Preflight: gọi thử một request rẻ để phát hiện sai khóa/slug ngay lúc khởi động.

        Có endpoint riêng cho việc này vì sai slug model là lỗi cấu hình hay gặp nhất, và
        phát hiện nó giữa pipeline thì đã tốn công chạy dở.
        """
        if not self._api_key:
            return {"ok": False, "model": model, "error": "LLM_API_KEY chưa được đặt"}
        try:
            reply = self.complete(
                model=model,
                messages=[{"role": "user", "content": "ping"}],
            )
        except LLMUnavailableError as error:
            return {"ok": False, "model": model, "error": str(error)}
        return {"ok": True, "model": model, "served_by": reply.model}
