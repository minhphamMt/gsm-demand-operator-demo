"""Nhận ý định từ câu tiếng Việt của người vận hành — đường **đỡ**, không phải đường chính.

Đường chính là LLM (`AGENT_OBSERVER` gọi tool trong allowlist chỉ-đọc của nó). Module này
chạy khi tầng LLM hỏng: thiếu khóa, timeout, gateway lỗi, hết quota. Cùng nguyên tắc suy giảm
có kiểm soát đã áp cho ba agent kia — LLM hỏng làm mất phần hiểu ngôn ngữ, không làm mất khả
năng vận hành (`agent/04` A4, CLAUDE.md §10.1).

Hai điều module này **không** làm, và cả hai đều có chủ ý:

1. **Không chạm tới cổng phê duyệt.** Câu "duyệt luôn đi" được nhận ra chỉ để **từ chối** kèm
   lời giải thích. Không có ý định nào ánh xạ tới `approve` / `activate` / `issue_offers`
   (CLAUDE.md §11.1). Người vận hành duyệt bằng nút, và chỉ bằng nút.
2. **Không tự đoán khi không chắc.** Không khớp thì trả `unknown` kèm gợi ý việc làm được,
   chứ không chọn đại ý định gần nhất — đoán sai một lệnh "chạy phân tích" thì tốn một lượt
   chạy, còn đoán sai theo chiều ngược lại thì người dùng tưởng hệ thống đã làm mà nó chưa làm.

Module thuần: không đọc file, không mạng, không state. Bỏ dấu trước khi khớp nên "duyet",
"chay phan tich" gõ không dấu vẫn nhận ra.
"""

import unicodedata
from dataclasses import dataclass
from typing import Literal

IntentKind = Literal["run_analysis", "observe", "gate_blocked", "unknown"]

# Tool quan sát mà một ý định có thể dẫn tới. Đúng bằng allowlist của `AGENT_OBSERVER` —
# danh sách này không được phép rộng hơn allowlist đó.
ObserveTool = Literal["run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"]


@dataclass(frozen=True)
class Intent:
    """Kết quả nhận dạng. `tool` chỉ có nghĩa khi `kind == "observe"`."""

    kind: IntentKind
    tool: ObserveTool | None = None
    message: str = ""


def strip_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt để khớp được cả khi người dùng gõ không dấu.

    Tách `đ`/`Đ` riêng: chúng là chữ cái độc lập, không phải nguyên âm mang dấu, nên NFD
    không tách được — bỏ qua sẽ làm "dieu chuyen" không khớp "điều chuyển".
    """
    lowered = text.lower().replace("đ", "d")
    decomposed = unicodedata.normalize("NFD", lowered)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


# Thứ tự trong tuple LÀ thứ tự ưu tiên, và nó quan trọng: "duyệt phương án" chứa cả "duyet"
# lẫn "phuong an", nên nhóm cổng phê duyệt phải đứng trước nhóm chạy phân tích. Đảo thứ tự
# này là mở một đường vòng qua §11.1 bằng đúng một câu tiếng Việt.
_GATE_KEYWORDS: tuple[str, ...] = (
    "duyet",
    "phe duyet",
    "tu choi",
    "reject",
    "approve",
    "kich hoat",
    "phat offer",
    "phat hanh",
    "gui offer",
    "thuong cho tai xe",
    "dieu xe that",
)

_RUN_KEYWORDS: tuple[str, ...] = (
    "chay phan tich",
    "phan tich lai",
    "chay lai",
    "phan tich",
    "tao phuong an",
    "sinh phuong an",
    "lap phuong an",
    "chay pipeline",
    "chay agent",
)

# Mỗi tool một chùm từ khoá. Chỉ dùng khi LLM hỏng, nên chọn từ phổ thông thay vì tên tool.
_OBSERVE_KEYWORDS: tuple[tuple[ObserveTool, tuple[str, ...]], ...] = (
    ("get_weather", ("thoi tiet", "mua", "rain", "ngap")),
    ("get_travel_conditions", ("di chuyen", "toc do", "giao thong", "eta", "quang duong", "khoang cach")),
    ("get_supply_state", ("cung", "xe roi", "xe ranh", "thieu xe", "hotspot", "diem nong", "ton kho", "zone")),
    ("run_forecast", ("du bao", "forecast", "sap toi", "nhu cau", "cau")),
)

GATE_REFUSAL = (
    "Việc phê duyệt và phát hành offer không gõ được ở đây. "
    "Hai bước đó phải bấm ở đúng hộp thoại của chúng — tôi không có đường nào tới đó, và đó là có chủ ý: "
    "chúng cam kết điều xe và cam kết tiền thưởng."
)

UNKNOWN_HINT = (
    "Chưa hiểu ý. Tôi làm được: chạy phân tích · xem dự báo · xem thời tiết · "
    "xem điều kiện di chuyển · xem tình hình cung."
)


def classify(text: str) -> Intent:
    """Đọc câu của người vận hành thành một ý định.

    Khớp trên chuỗi đã bỏ dấu và viết thường. Không dùng regex phức tạp: bảng từ khoá đọc
    được bằng mắt là thứ người sau còn kiểm được, còn một regex dài thì không.
    """
    normalised = strip_accents(text).strip()
    if not normalised:
        return Intent(kind="unknown", message=UNKNOWN_HINT)

    if any(keyword in normalised for keyword in _GATE_KEYWORDS):
        return Intent(kind="gate_blocked", message=GATE_REFUSAL)

    if any(keyword in normalised for keyword in _RUN_KEYWORDS):
        return Intent(kind="run_analysis", message="Bắt đầu một lượt phân tích mới.")

    for tool, keywords in _OBSERVE_KEYWORDS:
        if any(keyword in normalised for keyword in keywords):
            return Intent(kind="observe", tool=tool, message=f"Chạy {tool} để trả lời.")

    return Intent(kind="unknown", message=UNKNOWN_HINT)
