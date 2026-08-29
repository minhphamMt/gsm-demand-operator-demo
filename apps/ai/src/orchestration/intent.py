"""Nhận ý định từ câu tiếng Việt của người vận hành — đường **đỡ**, không phải đường chính.

Đường chính là LLM (`AGENT_OBSERVER` gọi tool trong allowlist chỉ-đọc của nó). Module này
chạy khi tầng LLM hỏng: thiếu khóa, timeout, gateway lỗi, hết quota. Cùng nguyên tắc suy giảm
có kiểm soát đã áp cho ba agent kia — LLM hỏng làm mất phần hiểu ngôn ngữ, không làm mất khả
năng vận hành (`agent/04` A4, CLAUDE.md §10.1).

Hai điều module này **không** làm, và cả hai đều có chủ ý:

1. **Không chạm tới cổng phê duyệt.** Câu "duyệt luôn đi" được nhận ra chỉ để **từ chối** kèm
   lời giải thích. Không có ý định nào ánh xạ tới `approve` / `activate` / `issue_offers`
   (CLAUDE.md §11.1). Người vận hành duyệt bằng nút, và chỉ bằng nút.
2. **Không nhận mốc dự báo mà model không chạy.** Model 1 chỉ tới +15 phút; mốc +30 trên bảng
   là ngoại suy tuyến tính. Hỏi "dự báo 30 phút" mà im lặng trả lời bằng mốc 15 là trả lời sai
   câu hỏi, còn đọc số ngoại suy ra như số dự báo là trình bày sai bản chất của nó.
3. **Không tự đoán khi không chắc.** Không khớp thì trả `unknown` kèm gợi ý việc làm được,
   chứ không chọn đại ý định gần nhất — đoán sai một lệnh "chạy phân tích" thì tốn một lượt
   chạy, còn đoán sai theo chiều ngược lại thì người dùng tưởng hệ thống đã làm mà nó chưa làm.

Module thuần: không đọc file, không mạng, không state. Bỏ dấu trước khi khớp nên "duyet",
"chay phan tich" gõ không dấu vẫn nhận ra.
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

IntentKind = Literal[
    "run_analysis",
    "start_forecast",
    "start_optimize",
    "observe",
    "gate_blocked",
    "horizon_unsupported",
    "unknown",
]

# Tool quan sát mà một ý định có thể dẫn tới. Đúng bằng allowlist của `AGENT_OBSERVER` —
# danh sách này không được phép rộng hơn allowlist đó.
ObserveTool = Literal["run_forecast", "get_weather", "get_travel_conditions", "get_supply_state"]


# Mốc dự báo Model 1 thật sự cho ra. Trùng `HorizonMin` ở `src/contracts/forecast.py` — mốc
# nào ngoài tập này thì không có số của model để trả lời.
SUPPORTED_HORIZONS: tuple[int, ...] = (5, 10, 15)

# Mốc +30 có trên panel nhưng là **ngoại suy tuyến tính**, không chạy model và không được dùng
# để tạo hay duyệt phương án (`ForecastConfig.tsx`). Nó được gọi tên riêng để câu từ chối nói
# đúng chuyện đang xảy ra thay vì chỉ báo "không hỗ trợ".
EXTRAPOLATED_HORIZON = 30


@dataclass(frozen=True)
class Intent:
    """Kết quả nhận dạng. `tool` chỉ có nghĩa khi `kind == "observe"`."""

    kind: IntentKind
    tool: ObserveTool | None = None
    message: str = ""
    # Mốc phút người vận hành nêu trong câu. `None` = không nêu, dùng mốc đang chọn trên màn hình.
    horizon: int | None = None


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

# Ba nhóm hành động, và **thứ tự kiểm giữa chúng quan trọng**. Cả ba đều chứa chữ "chạy",
# nên nhóm hẹp hơn phải đứng trước nhóm rộng hơn: "chạy dự báo" không được rơi vào
# "chay lai" của nhóm phân tích.
#
# Ba việc này khác nhau ở chỗ chúng ĐỂ LẠI GÌ, không phải ở chỗ chúng chạy cái gì:
#   · dự báo   — ghi một forecast run vào DB, chưa có phương án nào
#   · tối ưu   — ghi một proposal vào DB, đây mới là thứ đem đi duyệt
#   · phân tích — lượt chạy đồ thị đa-agent, KHÔNG ghi gì; nó cho xem agent suy luận
#
# Trước bản này, "tạo phương án" nằm ở nhóm phân tích — gõ câu đó chạy một lượt agent rồi
# không sinh ra phương án nào. Người dùng tưởng đã tạo, mà chưa.
_FORECAST_KEYWORDS: tuple[str, ...] = (
    "chay du bao",
    "chay lai du bao",
    "du bao lai",
    "chay model du bao",
    "chay model",
    "cap nhat du bao",
)

_OPTIMIZE_KEYWORDS: tuple[str, ...] = (
    "tinh phuong an",
    "tao phuong an",
    "sinh phuong an",
    "lap phuong an",
    "toi uu",
    "optimize",
    "dieu chuyen xe",
)

_RUN_KEYWORDS: tuple[str, ...] = (
    "chay phan tich",
    "phan tich lai",
    "chay lai",
    "phan tich",
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

# Đòi đơn vị thời gian đứng ngay sau số. Không có nó thì "zone 15 thế nào" bị đọc thành mốc
# 15 phút — một câu hỏi về địa điểm biến thành câu hỏi về thời gian.
_HORIZON_PATTERN = re.compile(r"(\d{1,3})\s*(?:phut|p|min|minute|phút)\b")


def parse_horizon(text: str) -> int | None:
    """Mốc phút nêu trong câu, nếu có."""
    match = _HORIZON_PATTERN.search(strip_accents(text))
    return int(match.group(1)) if match else None


def horizon_refusal(horizon: int) -> str:
    """Vì sao không trả lời được ở mốc này. Nói đúng chuyện, không nói chung chung."""
    if horizon == EXTRAPOLATED_HORIZON:
        return (
            f"Model 1 chỉ dự báo tới +{SUPPORTED_HORIZONS[-1]} phút. Mốc +{EXTRAPOLATED_HORIZON} phút có trên "
            "bảng nhưng là ngoại suy tuyến tính, không phải output model — và theo thiết kế thì nó "
            "không được dùng để tạo hay duyệt phương án. Tôi không đọc số ngoại suy ra như số dự báo. "
            f"Hỏi lại ở {', '.join(f'{value} phút' for value in SUPPORTED_HORIZONS)} thì tôi trả lời được."
        )
    return (
        f"Không có dự báo cho mốc +{horizon} phút. Model 1 chỉ chạy ở "
        f"{', '.join(f'{value} phút' for value in SUPPORTED_HORIZONS)}."
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

    # Mốc phút được đọc TRƯỚC khi chọn tool, và mốc ngoài tầm model thì chặn ngay — cùng lý lẽ
    # với nhóm cổng phê duyệt: để LLM tự xoay xở với một mốc không có số sẽ ra một câu trả lời
    # nghe hợp lý dựng trên mốc khác, tức là trả lời sai câu hỏi mà không ai biết.
    horizon = parse_horizon(text)
    if horizon is not None and horizon not in SUPPORTED_HORIZONS:
        return Intent(kind="horizon_unsupported", message=horizon_refusal(horizon), horizon=horizon)

    if any(keyword in normalised for keyword in _FORECAST_KEYWORDS):
        return Intent(kind="start_forecast", message="Chạy dự báo cung–cầu cho mốc đang chọn.", horizon=horizon)

    if any(keyword in normalised for keyword in _OPTIMIZE_KEYWORDS):
        return Intent(kind="start_optimize", message="Tính phương án điều chuyển từ dự báo hiện có.", horizon=horizon)

    if any(keyword in normalised for keyword in _RUN_KEYWORDS):
        return Intent(kind="run_analysis", message="Bắt đầu một lượt phân tích mới.", horizon=horizon)

    for tool, keywords in _OBSERVE_KEYWORDS:
        if any(keyword in normalised for keyword in keywords):
            return Intent(kind="observe", tool=tool, message=f"Chạy {tool} để trả lời.", horizon=horizon)

    return Intent(kind="unknown", message=UNKNOWN_HINT, horizon=horizon)
