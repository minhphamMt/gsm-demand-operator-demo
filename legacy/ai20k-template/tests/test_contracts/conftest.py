"""Fixture cho tầng contract."""

import pytest

from src.common.policy import Policy, load_policy
from src.config import PROJECT_ROOT

POLICY_PATH = PROJECT_ROOT / "config" / "policy.yaml"


@pytest.fixture(scope="session")
def policy() -> Policy:
    """Policy thật đọc từ config/policy.yaml.

    Dùng `load_policy` (không cache) thay vì `get_policy`: cache dùng chung giữa các
    test làm thứ tự chạy ảnh hưởng kết quả, đúng thứ CLAUDE.md §7.1 #3 cấm.
    """
    return load_policy(POLICY_PATH)
