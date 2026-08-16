"""Test TĨNH — soi mã nguồn src/ để ép các luật kiến trúc không thể diễn đạt bằng test đơn vị.

Đây là loại test bảo vệ tính hợp lệ của KẾT QUẢ chứ không phải tính đúng của một hàm:
một module đọc thẳng policy.yaml, hay một ngưỡng chép cứng, vẫn chạy xanh mọi test
đơn vị nhưng làm cho hai phần hệ thống chạy trên hai giá trị khác nhau.

Phạm vi hiện tại:
    T0.1 AC #4  chỉ src/common/policy.py được đọc YAML
    T0.1        không chép cứng 19 ngưỡng của policy.yaml       (CLAUDE.md §5.2)
    T0.2 AC #3  chỉ src/common/regime.py được gắn nhãn regime
    T0.3 AC #1  src/simulation/metrics.py không nhiễm tham số
    T3   AC #7  giá trị tốc độ xe chỉ đến từ policy, không chép lại ở đâu
    T3   AC #1  không OR-Tools, không min-cost flow (§7.1 #1)
Sẽ thêm ở T4: simulator.py phải import metrics.py, không cài lại công thức
(docs/design/ARCHITECTURE.md §6.3).
"""

import re
from pathlib import Path

from src.common.policy import DEFAULT_POLICY_PATH, REQUIRED_RULE_KEYS, get_policy

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

# T3 AC #7 — mọi cách gán một con số cho định danh mang nghĩa "tốc độ".
SPEED_LITERAL_ASSIGN = re.compile(r"\b\w*(?:speed|kmh|km_h|velocity)\w*\b\s*(?::[^=]+)?=\s*[-.\d]")

# T3 AC #1 — §7.1 #1 cắt hẳn min-cost flow và OR-Tools khỏi MVP. Bắt IMPORT và LỜI GỌI chứ
# không bắt chuỗi ký tự: docstring của greedy.py phải nói được "OR-Tools đã bị cắt" mà không
# tự vi phạm luật do chính nó giải thích.
OPTIMIZER_FORBIDDEN_CALL = re.compile(
    r"^\s*(?:from|import)\s+\S*(?:ortools|networkx|pulp|cvxpy|csgraph)"
    r"|\b(?:min_cost_flow|max_flow_min_cost|linear_sum_assignment|min_weight_full_bipartite_matching)\s*\("
)


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


def test_gia_tri_toc_do_xe_khong_xuat_hien_o_dau_trong_src() -> None:
    """T3 AC #7 — `avg_vehicle_speed_kmh` chỉ có một giá trị, và nó nằm ở config/policy.yaml.

    Ba nơi dùng tốc độ này — Optimizer (§5.4), Generator/Simulator (§5.5) và Activation Engine
    (§5.11) — phải cùng một con số, nếu không thì `eta_steps` của plan và thời điểm xe thực sự
    tới trong Simulator lệch nhau, và mọi so sánh before/after nói về hai thế giới khác nhau.
    Cách duy nhất chắc chắn không lệch là con số không tồn tại trong `src/` dưới bất kỳ dạng
    hằng nào.

    Quét cả comment và docstring: một chú thích "mặc định 25 km/h" hôm nay đúng, nhưng nó sẽ ở
    lại nguyên vẹn sau lần đầu tiên ai đó đổi giá trị trong policy.yaml.
    """
    speed = get_policy(DEFAULT_POLICY_PATH).rules.avg_vehicle_speed_kmh
    forms = sorted({f"{speed:g}", f"{speed}"}, key=len, reverse=True)
    literal = re.compile(r"(?<![\w.])(?:" + "|".join(re.escape(form) for form in forms) + r")(?![\w.])")

    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in _src_files()
        if _rel(path) not in YAML_READER_ALLOWLIST
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if literal.search(line)
    ]
    assert offenders == [], f"Tốc độ xe ({speed}) chỉ được đến từ policy.yaml qua policy.py. Vi phạm: {offenders}"


def test_khong_gan_hang_so_cho_bat_ky_dinh_danh_toc_do_nao() -> None:
    """T3 AC #7, vế thứ hai — bắt cả cách né bằng cách đổi tên biến.

    Test trên khoá đúng con số đang dùng; test này khoá dạng viết. Đặt `speed_kmh = 30.0` ở
    một module khác vẫn tạo ra hai giá trị tốc độ trong hệ thống dù không trùng số nào.
    """
    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in _src_files()
        if _rel(path) not in YAML_READER_ALLOWLIST
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if SPEED_LITERAL_ASSIGN.search(line)
    ]
    assert offenders == [], f"Tốc độ phải nhận qua tham số từ policy, không gán hằng. Vi phạm: {offenders}"


def test_optimizer_khong_dung_or_tools_hay_min_cost_flow() -> None:
    """T3 AC #1 — §7.1 #1 cắt hẳn hai hướng này để đổi lấy thời gian làm Khối C.

    Kiểm bằng test tĩnh chứ không bằng requirements.txt: một `from scipy.sparse.csgraph import
    min_weight_full_bipartite_matching` không thêm dependency mới nào mà vẫn thay đổi bản chất
    thuật toán, và khi đó "greedy theo severity" trong báo cáo không còn mô tả đúng code.
    """
    offenders = [
        f"{_rel(path)}:{lineno}: {line.strip()}"
        for path in _src_files()
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if OPTIMIZER_FORBIDDEN_CALL.search(line)
    ]
    assert offenders == [], f"MVP dùng greedy theo severity (§7.1 #1). Vi phạm: {offenders}"


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
