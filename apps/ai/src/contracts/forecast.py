"""Entity `Forecast` — SPEC §4.2, docs/design/DATA_CONTRACT.md §2.2.

Model 1 → Model 2.
"""

from datetime import timedelta
from typing import Literal

from pydantic import Field, NonNegativeFloat, model_validator

from src.common.regime import Regime
from src.contracts import (
    ContractModel,
    StepAlignedDatetime,
    ZoneId,
    ensure_full_zone_coverage,
)

# Chỉ hai tầm dự báo, không giá trị nào khác (§4.2).
HorizonMin = Literal[5, 10, 15]


class ZoneForecast(ContractModel):
    """Dự báo cầu/cung của một zone tại `forecast_ts` — §4.2."""

    zone_id: ZoneId
    # Dự báo điểm, tức p50.
    predicted_demand: NonNegativeFloat
    predicted_supply: NonNegativeFloat
    demand_p10: NonNegativeFloat
    demand_p90: NonNegativeFloat
    supply_p10: NonNegativeFloat
    supply_p90: NonNegativeFloat
    # Luôn `null` ở MVP (quyết định #5); khai báo sẵn để không phải sửa contract sau W2.
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _check_quantile_order(self) -> "ZoneForecast":
        """p10 ≤ p50 ≤ p90 cho cả cầu lẫn cung — §2.2.

        Đây phải là validator thật chứ không phải quy ước miệng: LightGBM train ba
        objective quantile ĐỘC LẬP nên quantile crossing xảy ra được, mà chế độ thận
        trọng ở `rain_peak` lấy thẳng hai đầu khoảng này làm gap.
        """
        for name, low, mid, high in (
            ("demand", self.demand_p10, self.predicted_demand, self.demand_p90),
            ("supply", self.supply_p10, self.predicted_supply, self.supply_p90),
        ):
            if low > mid:
                raise ValueError(f"zone {self.zone_id}: {name}_p10={low} vượt p50={mid}")
            if mid > high:
                raise ValueError(f"zone {self.zone_id}: {name} p50={mid} vượt {name}_p90={high}")
        return self


class Forecast(ContractModel):
    """Output Model 1 cho một `(t, horizon_min)` — §4.2."""

    t: StepAlignedDatetime
    horizon_min: HorizonMin
    forecast_ts: StepAlignedDatetime
    zones: tuple[ZoneForecast, ...]
    # Ghi vào History để audit lại được số đã công bố (§3.2 #6).
    model_version: str = Field(min_length=1)
    # Gán bởi src/common/regime.py — cấm tự tính lại ở nơi khác (CLAUDE.md §5.3).
    regime: Regime

    @model_validator(mode="after")
    def _check_horizon_and_zones(self) -> "Forecast":
        """`forecast_ts == t + horizon_min` và `zones` phủ đủ 30 zone.

        Để hai mốc lệch nhau thì Model 2 so hotspot của một thời điểm với ground truth
        của thời điểm khác — sai lệch này không có dấu hiệu nào lộ ra ở số recall.
        """
        expected_ts = self.t + timedelta(minutes=self.horizon_min)
        if self.forecast_ts != expected_ts:
            raise ValueError(
                f"forecast_ts={self.forecast_ts.isoformat()} phải bằng t + {self.horizon_min} phút "
                f"= {expected_ts.isoformat()}"
            )
        ensure_full_zone_coverage([zone.zone_id for zone in self.zones])
        return self
