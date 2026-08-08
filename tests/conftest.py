"""Fixture dùng chung.

Không còn fixture mock_llm: luồng chính không gọi LLM nữa (ARCHITECTURE.md §8).
Nếu Explanation Lớp 2 được làm ở W5, mock của nó nằm cùng chỗ với module đó chứ
không kéo ngược lên conftest gốc.
"""

from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """HTTP client bất đồng bộ gọi thẳng vào ASGI app, không mở cổng thật."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
