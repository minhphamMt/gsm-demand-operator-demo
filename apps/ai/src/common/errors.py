"""Exception nghiệp vụ của dự án — docs/design/API_CONTRACT.md §1.2.

Mỗi exception mang sẵn `error_code` để tầng src/api/ dịch thẳng thành error response
`{error_code, message, detail}` mà không phải tra bảng ánh xạ ở nơi khác — bảng ánh xạ
thứ hai là chỗ để hai bên lệch nhau.

Hiện chỉ có ConfigError (T0.1). 8 mã nghiệp vụ của §5.9 (OFFER_EXPIRED, BUDGET_EXCEEDED,
INCENTIVE_BUDGET_EXCEEDED, NO_CANDIDATE_DRIVER, STALE_DATA, OPTIMIZER_TIMEOUT,
PLAN_STATE_INVALID, POLICY_VIOLATION) được thêm cùng task sinh ra chúng — khai báo trước
sẽ tạo ra danh sách mã lỗi không đường code nào ném ra (CLAUDE.md §4 #2).
"""

from typing import Any


class NovaFourError(Exception):
    """Gốc của mọi exception dự án. Không ném trực tiếp class này."""

    error_code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, detail: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail: dict[str, Any] = detail or {}

    def __str__(self) -> str:
        return f"[{self.error_code}] {self.message}"


class ConfigError(NovaFourError):
    """Cấu hình khởi động sai — thiếu key policy.yaml, sai kiểu, file hỏng.

    CỐ Ý KHÔNG có trong bảng mã lỗi HTTP §1.2: đây là lỗi lúc boot theo
    docs/design/ARCHITECTURE.md §6.4, app chết trước khi nhận request đầu tiên nên
    không bao giờ trở thành một response. Bắt nó rồi chạy tiếp = chạy với ngưỡng sai.
    """

    error_code = "CONFIG_ERROR"


class ReplaySourceNotFoundError(NovaFourError):
    """Mốc replay được yêu cầu không có trong bộ dữ liệu đã checksum."""

    error_code = "REPLAY_SOURCE_NOT_FOUND"


class ReplayProvenanceMismatchError(NovaFourError):
    """Zone gửi lên không khớp bucket nguồn đã checksum.

    Chặn cứng thay vì cảnh báo: trộn nguồn quan sát với nguồn replay tạo ra một kết quả
    mang nhãn "đã kiểm chứng" nhưng không tái lập được từ bộ dữ liệu đã khóa.
    """

    error_code = "REPLAY_PROVENANCE_MISMATCH"


class ReplayModelUnavailableError(NovaFourError):
    """Replay đã chọn tường minh nhưng bundle model không dùng được.

    Fail-closed, không hạ xuống baseline: baseline chạy dưới nhãn provenance của replay
    sẽ khiến lỗi model trông như một dự báo hợp lệ.
    """

    error_code = "REPLAY_MODEL_UNAVAILABLE"


class DatasetUnavailableError(NovaFourError):
    """Bộ dữ liệu replay thiếu file, sai manifest hoặc không đọc được."""

    error_code = "DATASET_UNAVAILABLE"


class PolicyOverrideRejectedError(NovaFourError):
    """Điều phối viên gửi lên một override ngưỡng không hợp lệ cho lượt chạy này.

    Tách khỏi ConfigError vì hai lỗi sống ở hai thời điểm khác nhau: ConfigError là lỗi
    lúc boot và app chết trước khi nhận request (§6.4), còn lỗi này đến từ một request
    cụ thể và phải trở thành response 422 — bắt ConfigError để trả HTTP sẽ xoá mất ranh
    giới "cấu hình sai thì không được chạy tiếp".

    Cũng KHÔNG dùng lại POLICY_VIOLATION: mã đó dành riêng cho `revised_moves` vi phạm
    ràng buộc (API_CONTRACT.md §1.2), tức là kế hoạch sai dưới ngưỡng đúng. Ở đây ngược
    lại — chính ngưỡng gửi lên mới là thứ bị từ chối. Gộp hai mã làm bên gọi không phân
    biệt được phải sửa phương án hay sửa thông số.
    """

    error_code = "POLICY_OVERRIDE_REJECTED"
