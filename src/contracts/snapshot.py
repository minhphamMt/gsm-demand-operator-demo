"""Entity `Snapshot` — SPEC §4.1, docs/design/DATA_CONTRACT.md §2.1.

Replay Engine → toàn pipeline. Đây là message gốc: mọi số của Model 1/2/3 và của
Simulator đều dẫn xuất từ đây, nên ràng buộc lỏng ở file này sẽ lan ra toàn hệ thống.
"""

from datetime import timedelta
from typing import Literal

from pydantic import NonNegativeFloat, NonNegativeInt, PositiveFloat, PositiveInt, model_validator

from src.contracts import (
    STEP_MINUTES,
    ContractModel,
    StepAlignedDatetime,
    ZoneId,
    ensure_full_zone_coverage,
)

# Nguồn của một lượt xe đang đến — Khối B (điều chuyển) hay Khối C (huy động).
ArrivalSource = Literal["relocation", "activation"]


class EnrouteArrival(ContractModel):
    """Một lượt xe đang trên đường tới zone — §4.1, mới ở v1.3.

    Vì sao không gộp thành một số vô hướng: với số vô hướng thì hai lượt đến ở hai step
    khác nhau bị nhập làm một và không unit nào còn thời điểm chín xác định — Simulator
    §5.5 không biết mỗi step phải chuyển bao nhiêu xe thành `idle_supply`.
    """

    arrival_ts: StepAlignedDatetime
    eta_steps: PositiveInt
    units: PositiveInt
    # `source` là bắt buộc: mất nó là mất khả năng tách đóng góp Khối B khỏi Khối C ở
    # bảng 3 kịch bản, và INV-2 (tổng cung plan_only == no_action) hết kiểm được.
    source: ArrivalSource
    from_zone: ZoneId


class ZoneSnapshot(ContractModel):
    """Trạng thái quan sát được của một zone tại `t` — §4.1."""

    zone_id: ZoneId
    demand_observed: NonNegativeInt
    idle_supply: NonNegativeInt
    enroute_supply: NonNegativeInt
    # Rỗng `[]` khi không có xe nào đang đến; KHÔNG được `null` (§4.1).
    enroute_arrivals: tuple[EnrouteArrival, ...]
    price_index: PositiveFloat
    rain_mm_h: NonNegativeFloat
    # Input ngoại sinh, không phải output Model 1 (§4.1).
    rain_forecast_15: NonNegativeFloat
    rain_forecast_30: NonNegativeFloat
    peak_flag: Literal[0, 1]
    holiday_flag: Literal[0, 1]

    @model_validator(mode="after")
    def _check_enroute(self) -> "ZoneSnapshot":
        """INV-3 và ràng buộc `from_zone ≠ zone_id` — CLAUDE.md §3.1.

        INV-3 vỡ nghĩa là số xe tổng và lịch đến chi tiết đang kể hai câu chuyện khác nhau;
        bất biến vỡ thì crash, không fallback — che đi sẽ cho ra KPI trông hợp lệ mà sai.
        """
        total_units = sum(arrival.units for arrival in self.enroute_arrivals)
        if self.enroute_supply != total_units:
            raise ValueError(
                f"INV-3 vỡ ở zone {self.zone_id}: enroute_supply={self.enroute_supply} "
                f"nhưng Σ enroute_arrivals[].units={total_units}"
            )

        self_sourced = [arrival for arrival in self.enroute_arrivals if arrival.from_zone == self.zone_id]
        if self_sourced:
            raise ValueError(f"zone {self.zone_id}: enroute_arrivals có from_zone trùng chính zone đích")
        return self


class Snapshot(ContractModel):
    """Snapshot toàn thành phố tại một `ts_bucket` — §4.1."""

    t: StepAlignedDatetime
    zones: tuple[ZoneSnapshot, ...]

    @model_validator(mode="after")
    def _check_zones_and_schedule(self) -> "Snapshot":
        """Phủ đủ 30 zone; mỗi lượt đến phải ở tương lai và `eta_steps` khớp `arrival_ts`.

        `eta_steps` là số bước còn lại tính từ `t` (§4.1). Để nó lệch với `arrival_ts` thì
        Simulator và UI đọc ra hai thời điểm khác nhau cho cùng một lượt xe.
        """
        ensure_full_zone_coverage([zone.zone_id for zone in self.zones])

        step = timedelta(minutes=STEP_MINUTES)
        for zone in self.zones:
            for arrival in zone.enroute_arrivals:
                if arrival.arrival_ts <= self.t:
                    raise ValueError(
                        f"zone {zone.zone_id}: arrival_ts={arrival.arrival_ts.isoformat()} "
                        f"phải sau t={self.t.isoformat()}"
                    )
                expected_steps = (arrival.arrival_ts - self.t) // step
                if arrival.eta_steps != expected_steps:
                    raise ValueError(
                        f"zone {zone.zone_id}: eta_steps={arrival.eta_steps} không khớp "
                        f"(arrival_ts − t)/{STEP_MINUTES}phút={expected_steps}"
                    )
        return self
