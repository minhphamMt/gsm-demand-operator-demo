"""Entity `HotspotOutput` — SPEC §4.3, docs/design/DATA_CONTRACT.md §2.3.

Model 2 → Model 3 + UI.
"""

from typing import Literal

from pydantic import AwareDatetime, NonNegativeInt, model_validator

from src.contracts import ContractModel, StepAlignedDatetime, ZoneId
from src.contracts.forecast import HorizonMin

# Chế độ tính gap thận trọng ở regime rain_peak — quyết định #4, [ASSUMPTION-27].
ConservativeGapMode = Literal["p90_p50", "p90_p10"]


def _reject_duplicate_zone(zone_ids: list[int], field_name: str) -> None:
    """Một zone chỉ được xuất hiện một lần trong mỗi danh sách.

    Zone lặp ở `hotspots` làm Optimizer phục vụ cùng một gap hai lần; lặp ở
    `surplus_zones` làm nó rút quá `max_supply_move_pct` mà mọi phép kiểm từng dòng
    vẫn thấy hợp lệ.
    """
    duplicated = sorted({zone_id for zone_id in zone_ids if zone_ids.count(zone_id) > 1})
    if duplicated:
        raise ValueError(f"{field_name} có zone_id lặp: {duplicated}")


class Hotspot(ContractModel):
    """Một zone thiếu xe theo dự báo — §4.3.

    `gap` để dấu tự do: hysteresis giữ zone trong danh sách 2–3 step sau khi hết thỏa
    điều kiện, và ở những step đó `gap` âm là đúng. Cờ quyết định là `is_hotspot`.
    """

    zone_id: ZoneId
    is_hotspot: bool
    gap: float
    severity_score: float
    # Lấy thẳng từ snapshot §4.1 tại `t`, KHÔNG phải số dự báo. Do Replay Engine điền.
    idle_supply_current: NonNegativeInt


class SurplusZone(ContractModel):
    """Một zone dư xe, ứng viên làm nguồn điều chuyển — §4.3."""

    zone_id: ZoneId
    # Chỉ zone có surplus dương mới được đưa vào danh sách (§4.3).
    surplus: float
    idle_supply_current: NonNegativeInt
    # Bắt buộc CÓ MẶT nhưng được `null` (= không bị khóa). Bỏ hẳn field khi không có
    # cooldown sẽ khiến Optimizer không phân biệt "chưa bị rút bao giờ" với "quên điền".
    cooldown_until_ts: AwareDatetime | None

    @model_validator(mode="after")
    def _check_surplus_positive(self) -> "SurplusZone":
        """`surplus` phải dương — §4.3 chỉ đưa vào danh sách zone có dư."""
        if self.surplus <= 0:
            raise ValueError(f"zone {self.zone_id}: surplus={self.surplus} phải dương mới vào surplus_zones")
        return self


class HotspotOutput(ContractModel):
    """Output Model 2 cho một `(forecast_ts, horizon_min)` — §4.3."""

    forecast_ts: StepAlignedDatetime
    horizon_min: HorizonMin
    # Rỗng là hợp lệ: không phải step nào cũng có zone thiếu xe.
    hotspots: tuple[Hotspot, ...]
    surplus_zones: tuple[SurplusZone, ...]
    # Field optional thêm mới (§3.2 #1) — echo chế độ đang dùng để đọc lại số cũ biết
    # nó được tính bằng công thức nào.
    conservative_gap_mode: ConservativeGapMode | None = None

    @model_validator(mode="after")
    def _check_unique_zones(self) -> "HotspotOutput":
        """Không zone nào lặp trong cùng một danh sách.

        Cố ý KHÔNG cấm một zone vừa ở `hotspots` vừa ở `surplus_zones`: ở `rain_peak`,
        gap tính bằng `demand_p90` còn surplus tính bằng p50, nên hai điều kiện có thể
        cùng đúng — đó là hệ quả đã biết của chế độ thận trọng, không phải lỗi dữ liệu.
        """
        _reject_duplicate_zone([item.zone_id for item in self.hotspots], "hotspots")
        _reject_duplicate_zone([item.zone_id for item in self.surplus_zones], "surplus_zones")
        return self
