"""Test TĨNH — soi mã nguồn src/ để ép các luật kiến trúc không thể diễn đạt bằng test đơn vị.

Đây là loại test bảo vệ tính hợp lệ của KẾT QUẢ chứ không phải tính đúng của một hàm:
một module đọc thẳng policy.yaml, hay một ngưỡng chép cứng, vẫn chạy xanh mọi test
đơn vị nhưng làm cho hai phần hệ thống chạy trên hai giá trị khác nhau.

Phạm vi hiện tại:
    T0.1 AC #4  chỉ src/common/policy.py được đọc YAML
    T0.1        không chép cứng 19 ngưỡng của policy.yaml       (CLAUDE.md §5.2)
    T0.2 AC #3  chỉ src/common/regime.py được gắn nhãn regime
    T0.3 AC #1  src/simulation/metrics.py không nhiễm tham số
Sẽ thêm ở T4: simulator.py phải import metrics.py, không cài lại công thức
(docs/design/ARCHITECTURE.md §6.3).
"""

import re
from pathlib import Path

from src.common.policy import REQUIRED_RULE_KEYS
from src.config import PROJECT_ROOT

SRC_DIR = PROJECT_ROOT / "src"

# Module DUY NHẤT được phép đọc YAML, tính theo đường dẫn tương đối gốc repo.
YAML_READER_ALLOWLIST = {"src/common/policy.py"}

# Module DUY NHẤT được phép tự suy ra nhãn regime từ rain/peak.
REGIME_TAGGER_ALLOWLIST = {"src/common/regime.py"}

METRICS_FILE = SRC_DIR / "simulation" / "metrics.py"

YAML_READ_CALL = re.compile(r"\byaml\.(safe_load|load|full_load|unsafe_load)\b")

# Bắt mọi cách viết tay điều kiện regime: `rain_mm_h > 0`, `>= 0.5`, `peak_flag == 1`, ...
REGIME_CONDITION = re.compile(r"\b(rain_mm_h|rain_forecast_\d+|peak_flag)\s*(==|>=|>|<=|<)")

# T0.3 AC #1 — bốn dấu hiệu nhiễm tham số, so khớp không phân biệt hoa thường.
METRICS_FORBIDDEN_WORDS = ("policy", "yaml", "forecasting", "lgbm")


def _src_files() -> list[Path]:
    return sorted(path for path in SRC_DIR.rglob("*.py") if "__pycache__" not in path.parts)


def _rel(path: Path) -> str:
    return path.relative_to(PROJECT_ROOT).as_posix()


def test_co_quet_duoc_file_trong_src() -> None:
    """Chốt chặn cho chính test này: quét rỗng thì mọi luật dưới đây xanh giả."""
    assert len(_src_files()) >= 5


def test_chi_common_policy_duoc_doc_yaml() -> None:
    """T0.1 AC #4 — tương đương `grep -rn "yaml.safe_load" src/ | grep -v common/policy.py` → 0.

    Chặn cả yaml.load/full_load/unsafe_load chứ không riêng safe_load: mục đích là
    "một nguồn ngưỡng duy nhất", né bằng cách đổi tên hàm đọc thì luật mất tác dụng.
    """
    offenders = [
        f"{_rel(path)}:{lineno}"
        for path in _src_files()
        if _rel(path) not in YAML_READER_ALLOWLIST
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if YAML_READ_CALL.search(line)
    ]
    assert offenders == [], f"Chỉ src/common/policy.py được đọc YAML. Vi phạm: {offenders}"


def test_khong_chep_cung_nguong_policy_trong_src() -> None:
    """Không module nào được gán trực tiếp một trong 19 key bằng hằng số.

    Bắt dạng `budget_cap = 500000` / `max_distance = 7.0`; KHÔNG bắt dạng truyền tham
    số `budget_cap=policy.rules.budget_cap` — đó chính là cách dùng đúng.
    """
    literal_assign = re.compile(rf"^\s*({'|'.join(REQUIRED_RULE_KEYS)})\s*(:[^=]+)?=\s*[-\d\"'\[]")
    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in _src_files()
        if _rel(path) not in YAML_READER_ALLOWLIST
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if literal_assign.match(line)
    ]
    assert offenders == [], f"Ngưỡng phải đọc từ config/policy.yaml, không chép cứng. Vi phạm: {offenders}"


def test_chi_common_regime_duoc_gan_nhan_regime() -> None:
    """T0.2 AC #3 — tương đương `grep -rn "rain_mm_h > 0\\|peak_flag == 1" src/ | grep -v common/regime.py` → 0.

    Bắt rộng hơn hai chuỗi trong AC (mọi toán tử so sánh, cả `rain_forecast_15/30`) vì mục
    đích là "một định nghĩa mưa duy nhất": viết `rain_mm_h >= 0.5` ở module khác cũng phá
    luật đó y hệt `> 0`, chỉ là tình cờ trùng giá trị hôm nay.
    """
    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in _src_files()
        if _rel(path) not in REGIME_TAGGER_ALLOWLIST
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if REGIME_CONDITION.search(line)
    ]
    assert offenders == [], f"Gán nhãn regime chỉ ở src/common/regime.py. Vi phạm: {offenders}"


def test_metrics_khong_nhiem_tham_so() -> None:
    """T0.3 AC #1 — metrics.py không được chứa policy/yaml/forecasting/lgbm.

    Lõi metric phải là hàm thuần demand/supply → số. Cho nó đọc ngưỡng hay biết về tầng
    dự báo nghĩa là baseline đã khóa và lần chạy hôm nay không còn tính bằng cùng một hàm,
    và mọi so sánh before/after mất hiệu lực (§5.14.1).

    Quét cả comment và docstring — chuỗi "policy" trong chú thích tuy vô hại, nhưng luật
    dạng "kể cả nhắc đến cũng không" mới rõ ràng và không thể lách; §5.14.1 phát biểu đúng
    như vậy.
    """
    assert METRICS_FILE.exists(), f"Thiếu {_rel(METRICS_FILE)} — lõi metric là task T0.3."
    lowered = METRICS_FILE.read_text(encoding="utf-8").lower()
    offenders = [word for word in METRICS_FORBIDDEN_WORDS if word in lowered]
    assert offenders == [], f"metrics.py bị nhiễm tham số: {offenders}"


def test_common_khong_import_nguoc_len_tang_tren() -> None:
    """docs/design/ARCHITECTURE.md §6.2 — src/common/ chỉ được import chính nó.

    Cho common phụ thuộc lên tầng trên (config, api, simulation) là biến tầng tiện ích
    thành tầng kéo theo cả cây, và mọi test đơn vị đều phải dựng nguyên hệ thống.
    """
    allowed = re.compile(r"^\s*(from|import)\s+src\.common\b")
    any_src_import = re.compile(r"^\s*(from|import)\s+src\.")
    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in sorted((SRC_DIR / "common").rglob("*.py"))
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if any_src_import.match(line) and not allowed.match(line)
    ]
    assert offenders == [], f"src/common/ không được import package khác của src/. Vi phạm: {offenders}"
