"""Loader DUY NHẤT của config/policy.yaml — docs/design/DATA_CONTRACT.md §5 và §5.1.

Đây là module duy nhất trong src/ được phép gọi `yaml.safe_load`. Test tĩnh
tests/test_architecture.py chặn mọi vi phạm (T0.1 AC #4). Lý do không phải khẩu vị:
19 ngưỡng này chi phối tiền thưởng, ràng buộc điều xe và mọi số KPI; đọc file ở hai
nơi là mở đường cho hai giá trị khác nhau cùng tồn tại trong một lần chạy.

Hợp đồng loader (§5.1), giữ nguyên không thêm không bớt:
    thiếu 1 trong 19 key   ⇒ ConfigError lúc boot, message nêu TÊN key
    thừa key lạ            ⇒ log WARNING, KHÔNG crash (cho phép thêm key thử nghiệm)
    sai kiểu               ⇒ ConfigError nêu tên key + kiểu mong đợi
    đọc trực tiếp bằng yaml ở module khác ⇒ cấm (test tĩnh)
    hard-code ngưỡng       ⇒ cấm

Ràng buộc kiến trúc: package src/common/ không import bất kỳ package nào khác của src/
(docs/design/ARCHITECTURE.md §6.2). Vì vậy hàm ở đây nhận `path` qua tham số thay vì tự
đọc src.config — nơi gọi (src/main.py) truyền `settings.policy_path` vào.
"""

import logging
from functools import cache
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from src.common.errors import ConfigError, PolicyOverrideRejectedError

logger = logging.getLogger(__name__)


class PolicyRules(BaseModel):
    """19 ngưỡng vận hành — docs/design/DATA_CONTRACT.md §5.

    Thứ tự field là thứ tự trong tài liệu, giữ nguyên để đối chiếu bằng mắt.
    Số 19 KHÔNG được viết ra ở đâu dưới dạng literal: nó là `len(REQUIRED_RULE_KEYS)`,
    suy ra từ chính class này — thêm key mà quên sửa hằng số là lỗi im lặng.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    # ---- Nhóm Optimizer / Hotspot ----
    min_supply_per_zone: int
    budget_cap: int  # VNĐ — int, cấm float cho tiền (CLAUDE.md §5.2)
    max_distance: float
    max_supply_move_pct: float
    cooldown_minutes: int
    priority_zones: tuple[int, ...]  # tuple để model bất biến thật, list thì vẫn sửa được
    deadhead_cost_per_km: int  # VNĐ/km
    avg_vehicle_speed_kmh: float

    # ---- Nhóm Activation / Khối C ----
    incentive_budget_cap: int  # VNĐ — trần ĐỘC LẬP với budget_cap (C-09)
    incentive_base: int  # VNĐ
    incentive_per_km: int  # VNĐ/km
    incentive_max_per_offer: int  # VNĐ
    activation_radius_km: float
    offer_ttl_minutes: int
    max_offers_per_driver_per_hour: int
    overbooking_factor: float
    assumed_accept_rate: float
    min_idle_before_activation: int

    # ---- Key thêm mới (quyết định A-03) ----
    conservative_gap_mode: Literal["p90_p50", "p90_p10"]

    # ---- Nhóm Giám sát vận hành ----
    # Thang bốn mức của bảng phân bố rủi ro, đọc theo `gap = max(0, demand − supply)` quan sát.
    # Là MỘT key chứ không phải ba: ba số này là một thang, và ba key rời có thể trôi ra khỏi
    # thứ tự mà không gì phát hiện. Ngưỡng dưới của: theo dõi | bất thường | thiếu xe.
    #
    # KHÔNG dùng cho việc sinh hotspot — luật đó ở SPEC §4.3 và tính theo tỉ lệ, không theo
    # số tuyệt đối. Trùng tên "severity" nhưng là hai thang khác nhau.
    zone_risk_gap_thresholds: tuple[int, int, int]

    @field_validator("zone_risk_gap_thresholds")
    @classmethod
    def _thresholds_must_ascend(cls, value: tuple[int, int, int]) -> tuple[int, int, int]:
        """Ba mức phải tăng nghiêm ngặt và bắt đầu từ ≥ 1.

        Không có ràng buộc này thì một thang sai thứ tự vẫn nạp được và chạy im lặng: mức
        nặng hơn sẽ không bao giờ với tới, nên bảng điều hành mất hẳn một màu mà không báo gì.
        Ngưỡng đầu ≥ 1 vì `gap = 0` là định nghĩa của "ổn định" — cho phép 0 sẽ xoá mức đó.
        """
        if value[0] < 1:
            raise ValueError("zone_risk_gap_thresholds: ngưỡng đầu phải ≥ 1")
        if not value[0] < value[1] < value[2]:
            raise ValueError("zone_risk_gap_thresholds: ba ngưỡng phải tăng nghiêm ngặt")
        return value


class PolicyKeyMeta(BaseModel):
    """Metadata truy vết đi kèm mỗi key: ai chốt, hạn nào, dựa vào đâu.

    Không phải trang trí — `verified` và `assumption` là thứ phân biệt "số đã được
    Data/BA duyệt" với "số tài liệu đề xuất", và mọi KPI công bố phải nói rõ mình
    đứng trên loại nào (C-07).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    value: Any
    unit: str | None = None
    used_by: tuple[str, ...] = ()
    verified: bool = False
    owner: str | None = None
    due: str | None = None
    src: str | None = None
    # Vắng khi key đã `verified: true` — số đã chốt thì không còn là assumption.
    assumption: str | None = None


class RainTravelFactor(BaseModel):
    """Hệ số kéo dài thời gian di chuyển khi mưa — SPEC §5.4."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    moderate: float
    heavy: float


class PolicyDerived(BaseModel):
    """Hằng dẫn xuất — KHÔNG thuộc 19 key, nhưng cũng chỉ được đọc qua module này.

    `rain_threshold_mm_h` là ngưỡng gán regime của src/common/regime.py (T0.2); để nó
    ở đây thay vì hard-code trong regime.py giữ đúng luật "một nguồn ngưỡng duy nhất".
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    rain_threshold_mm_h: float
    heavy_rain_mm_h: float
    travel_detour_factor: float
    rain_travel_factor: RainTravelFactor


class CustomerDriverPricing(BaseModel):
    """Giả định giá khách–tài xế; chỉ dùng cho MVP mock/synthetic generator."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    base_fare_first_2km_vnd: int = Field(ge=0)
    fare_per_km_after_2km_vnd: int = Field(ge=0)
    surge_base_multiplier: float = Field(gt=0)
    surge_gap_ratio_cap: float = Field(gt=0)
    surge_gap_ratio_weight: float = Field(ge=0)
    surge_min_multiplier: float = Field(gt=0)
    surge_max_multiplier: float = Field(gt=0)
    formula: str
    gap_ratio_definition: str


class BusinessDriverPricing(BaseModel):
    """Giả định hoa hồng doanh nghiệp–tài xế; chưa dùng cho settlement thật."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    commission_rate_car: float = Field(ge=0, le=1)
    driver_payout_formula: str
    platform_revenue_formula: str


class PricingProvenance(BaseModel):
    """Nguồn và giới hạn sử dụng của pricing research."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    source: str
    benchmark: str
    limitation: str


class PricingPolicy(BaseModel):
    """Policy pricing bổ sung, tách khỏi 19 ngưỡng vận hành đã khóa."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    version: str
    status: Literal["assumption", "verified"]
    approved_scope: str
    customer_driver: CustomerDriverPricing
    business_driver: BusinessDriverPricing
    provenance: PricingProvenance


class Policy(BaseModel):
    """Toàn bộ nội dung policy.yaml sau khi đã kiểm."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    version: str
    frozen_at: str
    rules: PolicyRules
    derived: PolicyDerived
    pricing: PricingPolicy
    # meta[key] ứng 1-1 với field của rules — tách ra để `policy.rules.budget_cap`
    # trả thẳng con số, nơi dùng không phải viết `.value` ở mọi lời gọi.
    meta: dict[str, PolicyKeyMeta]


# Danh sách key bắt buộc suy ra từ schema, không chép tay.
REQUIRED_RULE_KEYS: tuple[str, ...] = tuple(PolicyRules.model_fields)

# Vị trí mặc định của file, suy từ chính vị trí module (src/common/policy.py → gốc repo).
# Có ở đây thay vì lấy từ src/config.py vì src/common/ không được import tầng trên
# (docs/design/ARCHITECTURE.md §6.2). Tầng api/main luôn truyền settings.policy_path vào;
# hằng này chỉ để các hàm tiện ích trong src/common/ có đường lấy ngưỡng khi không ai truyền.
DEFAULT_POLICY_PATH: Path = Path(__file__).resolve().parents[2] / "config" / "policy.yaml"


def load_policy(path: Path) -> Policy:
    """Đọc và kiểm policy.yaml. Hàm thuần, không cache — dùng trong test.

    Ném ConfigError cho mọi ca hỏng; không có đường trả về giá trị mặc định. Fallback
    ở đây sẽ cho ra một lần chạy trông bình thường nhưng dùng ngưỡng khác ngưỡng đã duyệt.
    """
    raw = _read_yaml(path)

    rules_block = raw.get("rules")
    if not isinstance(rules_block, dict):
        raise ConfigError(
            f"{path}: thiếu khối 'rules' hoặc 'rules' không phải mapping",
            {"path": str(path)},
        )

    missing = [key for key in REQUIRED_RULE_KEYS if key not in rules_block]
    if missing:
        raise ConfigError(
            f"{path}: thiếu {len(missing)}/{len(REQUIRED_RULE_KEYS)} key bắt buộc: {', '.join(missing)}",
            {"path": str(path), "missing_keys": missing},
        )

    unknown = [key for key in rules_block if key not in REQUIRED_RULE_KEYS]
    if unknown:
        # §5.1: key thừa chỉ cảnh báo. Chặn ở đây sẽ khoá luôn khả năng thử nghiệm
        # một ngưỡng mới trước khi nó được đưa vào contract.
        logger.warning("%s: bỏ qua %d key không có trong contract: %s", path, len(unknown), ", ".join(unknown))

    meta = _parse_meta(path, rules_block)
    values = {key: meta[key].value for key in REQUIRED_RULE_KEYS}

    try:
        rules = PolicyRules(**values)
    except ValidationError as exc:
        raise ConfigError(f"{path}: sai kiểu giá trị — {_format_errors(exc, 'rules')}", {"path": str(path)}) from exc

    derived_block = raw.get("derived")
    if not isinstance(derived_block, dict):
        # T0.2 (regime.py) và Simulator đọc ngưỡng mưa từ đây; thiếu khối này thì
        # hai module đó buộc phải hard-code — đúng thứ §3.3 cấm.
        raise ConfigError(
            f"{path}: thiếu khối 'derived' hoặc 'derived' không phải mapping",
            {"path": str(path)},
        )

    try:
        policy = Policy(
            version=str(raw.get("version", "")),
            frozen_at=str(raw.get("frozen_at", "")),
            rules=rules,
            derived=PolicyDerived(**derived_block),
            pricing=PricingPolicy(**raw.get("pricing", {})),
            meta=meta,
        )
    except ValidationError as exc:
        raise ConfigError(f"{path}: cấu hình không hợp lệ — {_format_errors(exc)}", {"path": str(path)}) from exc

    logger.info("Đã nạp policy v%s (frozen_at=%s), %d key", policy.version, policy.frozen_at, len(REQUIRED_RULE_KEYS))
    return policy


@cache
def get_policy(path: Path) -> Policy:
    """Bản có cache của load_policy — dùng ở runtime.

    policy.yaml không đổi trong một lần chạy (I-08 khoá file), nên đọc lại mỗi request
    chỉ tốn I/O. Test cần đọc lại phải gọi `get_policy.cache_clear()` hoặc dùng load_policy.
    """
    return load_policy(path)


def policy_from_context(context: Any) -> Policy | None:
    """Lấy Policy khỏi validation context của Pydantic — `model_validate(..., context={"policy": p})`.

    Vì sao src/contracts/ KHÔNG tự đọc policy.yaml để kiểm ngưỡng: HistoryRecord §4.6 lưu
    nguyên bản plan và là append-only. Nếu validator so thẳng với ngưỡng đang hiệu lực thì
    một lần PM chỉnh `max_distance` sẽ làm mọi bản ghi cũ không parse lại được — mất luôn
    audit trail mà §3.2 #7 bắt buộc phải giữ.

    Nên ràng buộc phụ thuộc ngưỡng chỉ chạy khi NƠI PHÁT SINH (Optimizer, Activation Engine)
    chủ động truyền policy vào. Đọc lại từ kho thì không truyền, và bản ghi cũ vẫn đọc được.
    """
    if isinstance(context, dict):
        candidate = context.get("policy")
        if isinstance(candidate, Policy):
            return candidate
    return None


def _read_yaml(path: Path) -> dict[str, Any]:
    """Đọc YAML thành dict, mọi lỗi I/O và cú pháp quy về ConfigError."""
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ConfigError(f"Không tìm thấy {path} — xem docs/design/DATA_CONTRACT.md §5", {"path": str(path)}) from exc
    except OSError as exc:
        raise ConfigError(f"Không đọc được {path}: {exc}", {"path": str(path)}) from exc

    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path}: YAML sai cú pháp — {exc}", {"path": str(path)}) from exc

    if not isinstance(raw, dict):
        raise ConfigError(f"{path}: nội dung phải là mapping, nhận {type(raw).__name__}", {"path": str(path)})
    return raw


def _parse_meta(path: Path, rules_block: dict[str, Any]) -> dict[str, PolicyKeyMeta]:
    """Kiểm shape `rules.<key>.{value, ...}` của từng key bắt buộc."""
    meta: dict[str, PolicyKeyMeta] = {}
    for key in REQUIRED_RULE_KEYS:
        entry = rules_block[key]
        if not isinstance(entry, dict):
            raise ConfigError(
                f"{path}: rules.{key} phải là mapping có field 'value', nhận {type(entry).__name__}",
                {"path": str(path), "key": key},
            )
        if "value" not in entry:
            raise ConfigError(f"{path}: rules.{key} thiếu field 'value'", {"path": str(path), "key": key})
        try:
            meta[key] = PolicyKeyMeta(**entry)
        except ValidationError as exc:
            raise ConfigError(
                f"{path}: rules.{key} sai metadata — {_format_errors(exc)}",
                {"path": str(path), "key": key},
            ) from exc
    return meta


def _format_errors(exc: ValidationError, prefix: str = "") -> str:
    """Gộp lỗi pydantic thành một dòng có TÊN KEY và KIỂU MONG ĐỢI (§5.1)."""
    parts = []
    for err in exc.errors():
        loc = ".".join(str(item) for item in err["loc"])
        name = f"{prefix}.{loc}" if prefix else loc
        parts.append(f"{name}: {err['msg']} (nhận: {err.get('input')!r})")
    return "; ".join(parts)


# Ngưỡng do điều phối viên chỉnh chỉ sống trong MỘT lượt chạy. Không có đường nào từ đây
# ghi ngược vào policy.yaml: CLAUDE.md §3 #2 cho file này một người đọc duy nhất, và
# §13.2 bắt mọi thay đổi giá trị phải qua owner. Override là bản sao trong bộ nhớ của một
# request, không phải một phiên bản mới của chính sách.


def operator_tunable_keys(policy: Policy) -> tuple[str, ...]:
    """Key mà điều phối viên được phép chỉnh cho một lượt chạy.

    Danh sách SUY RA từ dữ liệu chứ không chép tay, vì một allowlist viết tay sẽ trôi khỏi
    policy.yaml ngay lần thêm key tiếp theo mà không gì phát hiện. Hai điều kiện:

    `verified: false` — số chưa được Data/BA chốt thì còn là đề xuất của tài liệu, chỉnh
    trong một lượt chạy là đúng bản chất của nó. Ngược lại `verified: true` đã qua owner
    (§11.2) nên không mở cho UI; hiện chỉ `avg_vehicle_speed_kmh` thuộc nhóm này, và nó
    còn dùng chung cho Optimizer/Generator/Activation — §3 #2 đòi một giá trị duy nhất.

    Vô hướng int/float — `priority_zones`, `zone_risk_gap_thresholds` và
    `conservative_gap_mode` đổi cấu trúc bài toán chứ không phải độ chặt của nó, không
    thuộc loại kéo một thanh trượt là xong.
    """
    return tuple(
        key for key in REQUIRED_RULE_KEYS if not policy.meta[key].verified and _is_scalar(getattr(policy.rules, key))
    )


def apply_overrides(policy: Policy, overrides: dict[str, Any]) -> Policy:
    """Policy mới với vài ngưỡng thay bằng giá trị của lượt chạy này.

    Trả về BẢN SAO; `policy` gốc và cache của `get_policy` không đổi — nếu override rò rỉ
    sang lượt chạy sau thì hai plan cùng `model_version` sẽ không tái lập được như nhau,
    đúng thứ tính deterministic (§3 #4) phải bảo vệ.

    Dựng lại `PolicyRules` thay vì `model_copy(update=...)` là có chủ đích: `model_copy`
    bỏ qua validator, nên một giá trị sai kiểu sẽ đi thẳng vào optimizer. Dựng lại thì mọi
    ràng buộc của schema chạy đúng như lúc nạp file.
    """
    if not overrides:
        return policy

    tunable = set(operator_tunable_keys(policy))
    cleaned: dict[str, Any] = {}
    for key, value in overrides.items():
        if key not in REQUIRED_RULE_KEYS:
            raise PolicyOverrideRejectedError(
                f"Không có ngưỡng '{key}' trong policy.",
                {"key": key},
            )
        if key not in tunable:
            reason = (
                "đã được owner chốt (verified: true)" if policy.meta[key].verified else "không phải ngưỡng vô hướng"
            )
            raise PolicyOverrideRejectedError(
                f"Ngưỡng '{key}' {reason}; không mở cho điều chỉnh tại chỗ.",
                {"key": key, "reason": reason},
            )
        cleaned[key] = _checked_override(policy, key, value)

    values = policy.rules.model_dump()
    values.update(cleaned)
    try:
        rules = PolicyRules(**values)
    except ValidationError as exc:
        raise PolicyOverrideRejectedError(
            f"Override không hợp lệ — {_format_errors(exc, 'rules')}",
            {"keys": sorted(cleaned)},
        ) from exc

    logger.info("Áp override ngưỡng cho một lượt chạy: %s", ", ".join(f"{k}={v}" for k, v in sorted(cleaned.items())))
    return policy.model_copy(update={"rules": rules})


def _is_scalar(value: Any) -> bool:
    """int/float thật, không tính bool — `isinstance(True, int)` là True trong Python."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _checked_override(policy: Policy, key: str, value: Any) -> float:
    """Chặn các giá trị vô nghĩa trước khi tới schema.

    Schema biết KIỂU nhưng không biết KHOẢNG: `budget_cap: int` nhận -1 mà không kêu, rồi
    optimizer lặng lẽ không xếp nổi một move nào và kết quả trông như "không có phương án".
    Chặn ở đây để lỗi nói đúng nguyên nhân.
    """
    if not _is_scalar(value):
        raise PolicyOverrideRejectedError(
            f"Ngưỡng '{key}' cần một số, nhận {type(value).__name__}.",
            {"key": key},
        )
    if value != value or value in (float("inf"), float("-inf")):  # NaN tự khác chính nó
        raise PolicyOverrideRejectedError(f"Ngưỡng '{key}' phải là số hữu hạn.", {"key": key})
    if value <= 0:
        raise PolicyOverrideRejectedError(f"Ngưỡng '{key}' phải lớn hơn 0, nhận {value}.", {"key": key})

    # Đọc trần từ `unit` thay vì liệt kê tên key: đơn vị là thứ đi cùng giá trị trong
    # policy.yaml, nên một key tỷ lệ mới sẽ tự được chặn mà không phải sửa hàm này.
    unit = policy.meta[key].unit or ""
    if unit.startswith("tỷ lệ") and value > 1:
        raise PolicyOverrideRejectedError(
            f"Ngưỡng '{key}' là tỷ lệ 0–1, nhận {value}.",
            {"key": key, "unit": unit},
        )
    # `_is_scalar` ở trên đã thu hẹp về int/float; ép kiểu để mypy thấy điều đó.
    return float(value) if isinstance(value, float) else int(value)
