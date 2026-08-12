"""T0.7 AC #1 — `src/contracts/` có ĐÚNG 9 file entity, ánh xạ 1-1 với SPEC §4.1–4.9.

Không thừa, không thiếu. Test này giữ ranh giới đã khóa ở I-08: một file entity thứ 10
xuất hiện lặng lẽ nghĩa là có message contract nào đó ra đời ngoài SPEC §4.
"""

import importlib

import pytest
from pydantic import BaseModel

from src.config import PROJECT_ROOT

CONTRACTS_DIR = PROJECT_ROOT / "src" / "contracts"

# module → (mục SPEC, tên class entity gốc). Thứ tự theo §4.1 → §4.9.
ENTITY_MAP: dict[str, tuple[str, str]] = {
    "snapshot": ("§4.1", "Snapshot"),
    "forecast": ("§4.2", "Forecast"),
    "hotspot": ("§4.3", "HotspotOutput"),
    "plan": ("§4.4", "RelocationPlan"),
    "revision": ("§4.5", "RevisionRequest"),
    "history": ("§4.6", "PlanDecisionRecord"),
    "driver": ("§4.7", "Driver"),
    "offer": ("§4.8", "ActivationOffer"),
    "response": ("§4.9", "DriverResponse"),
}


def test_dung_9_file_entity() -> None:
    """Đếm file .py trong src/contracts/, trừ __init__.py."""
    found = sorted(path.stem for path in CONTRACTS_DIR.glob("*.py") if path.stem != "__init__")
    assert found == sorted(ENTITY_MAP), f"src/contracts/ phải có đúng 9 file entity §4.1–4.9, đang có: {found}"


@pytest.mark.parametrize(("module_name", "spec_ref", "class_name"), [(k, v[0], v[1]) for k, v in ENTITY_MAP.items()])
def test_moi_file_co_entity_goc(module_name: str, spec_ref: str, class_name: str) -> None:
    """Mỗi file khai báo đúng class entity gốc của mục SPEC tương ứng."""
    module = importlib.import_module(f"src.contracts.{module_name}")
    entity = getattr(module, class_name, None)
    assert entity is not None, f"{module_name}.py thiếu class {class_name} ({spec_ref})"
    assert issubclass(entity, BaseModel)


@pytest.mark.parametrize("module_name", list(ENTITY_MAP))
def test_entity_cam_field_la_va_bat_bien(module_name: str) -> None:
    """Mọi model contract kế thừa ContractModel: `extra="forbid"` + `frozen=True`.

    Một model quên nền chung sẽ im lặng nuốt field gõ sai, hoặc cho sửa tại chỗ một
    object đã ghi vào History — cả hai đều là state ẩn (§3.2 #7).
    """
    module = importlib.import_module(f"src.contracts.{module_name}")
    models = [
        obj
        for obj in vars(module).values()
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj.__module__ == module.__name__
    ]
    assert models, f"{module_name}.py không khai báo model nào"
    for model in models:
        assert model.model_config.get("extra") == "forbid", f"{model.__name__} phải extra='forbid'"
        assert model.model_config.get("frozen") is True, f"{model.__name__} phải frozen=True"


def test_khong_co_field_cham_diem_tai_xe() -> None:
    """C-08 — không schema nào được có field xếp hạng/chấm điểm tài xế.

    Quét toàn bộ 9 file chứ không riêng driver.py: field kiểu này len vào được ở
    `offer.py` hay `history.py` cũng gây đúng hậu quả — biến từ chối thành có giá.
    """
    forbidden = ("accept_rate_of_driver", "driver_rank", "driver_score", "driver_tier", "reliability")
    offenders = [
        f"{path.name}:{lineno}: {line.strip()}"
        for path in sorted(CONTRACTS_DIR.glob("*.py"))
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if any(word in line for word in forbidden)
    ]
    assert offenders == [], f"C-08 cấm field chấm điểm tài xế. Vi phạm: {offenders}"


def test_contracts_chi_import_common() -> None:
    """docs/design/ARCHITECTURE.md §6.2 — tầng contract chỉ được import src.common và chính nó."""
    offenders: list[str] = []
    for path in sorted(CONTRACTS_DIR.glob("*.py")):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            stripped = line.strip()
            if not stripped.startswith(("from src.", "import src.")):
                continue
            if stripped.startswith(
                ("from src.common", "import src.common", "from src.contracts", "import src.contracts")
            ):
                continue
            offenders.append(f"{path.name}:{lineno}: {stripped}")
    assert offenders == [], f"src/contracts/ chỉ được import src.common. Vi phạm: {offenders}"


def test_khong_tao_them_thu_muc_trong_contracts() -> None:
    """Cây thư mục theo ARCHITECTURE.md §7 — contracts là một tầng phẳng."""
    subdirs = [path.name for path in CONTRACTS_DIR.iterdir() if path.is_dir() and path.name != "__pycache__"]
    assert subdirs == [], f"src/contracts/ không có thư mục con, đang có: {subdirs}"


def test_contracts_dir_ton_tai() -> None:
    """Chốt chặn cho chính các test quét file ở trên."""
    assert CONTRACTS_DIR.is_dir()
    assert (CONTRACTS_DIR / "__init__.py").exists()


def test_khong_file_thua_ngoai_py() -> None:
    """Không file lạ (json/yaml/…) lẫn vào tầng contract — dữ liệu không thuộc về đây."""
    strays = sorted(path.name for path in CONTRACTS_DIR.iterdir() if path.is_file() and path.suffix != ".py")
    assert strays == [], f"src/contracts/ chỉ chứa file .py, đang có thêm: {strays}"
