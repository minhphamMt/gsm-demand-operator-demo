"""Model 2 — phát hiện hotspot & zone dư xe từ forecast (§5.3, §4.3, task T2).

Số học thuần: `Forecast` (§4.2) + `idle_supply` của snapshot (§4.1) → `HotspotOutput` (§4.3).
Không đọc file, không đọc policy — ngưỡng vào qua tham số (CLAUDE.md §5.2). Không có
fallback: AGENT_WORKFLOW §4.1 ghi rõ khối này "thuần số học, vượt là bug", nên input sai
phải nổ ra chứ không được trả danh sách rỗng — hotspot rỗng là tín hiệu nghiệp vụ hợp lệ
(R8: dừng step, không sinh plan) và không được lẫn với "đã lỗi nhưng nuốt".

Ba mảnh dễ nhầm, ghi rõ ở đây:

1.  **Chế độ gap thận trọng chỉ đổi TỬ SỐ.** Ở `rain_peak`, `gap` lấy `demand_p90`
    (và với `p90_p10` thì lấy thêm `supply_p10`) — nhưng mẫu số của `severity_score`
    vẫn là `predicted_demand` đúng như §4.3 viết. Đổi cả mẫu số làm severity của
    `rain_peak` không so được với ba regime còn lại, mà severity chính là thứ tự ưu tiên
    của Optimizer (§5.4).
2.  **`idle_supply_current` KHÔNG do module này tính.** Nó là số thật tại `t` trong
    snapshot §4.1; Model 2 chỉ chuyển tiếp. Lấy `predicted_supply` thay vào sẽ khiến
    Optimizer rút xe không tồn tại.
3.  **`hotspots[]` chỉ chứa zone đang bật sau hysteresis.** Nếu nhét cả 30 zone kèm cờ
    `is_hotspot=False` thì danh sách không bao giờ rỗng và luật R8 mất hiệu lực. Zone
    đang trong 3 step chờ ra vẫn nằm trong danh sách và `gap` của nó âm là đúng — contract
    §4.3 để dấu tự do chính vì thế.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from src.common.regime import Regime
from src.contracts.forecast import Forecast, ZoneForecast
from src.contracts.hotspot import ConservativeGapMode, Hotspot, HotspotOutput, SurplusZone
from src.hotspot.hysteresis import HysteresisState, advance, initial_state

# Hằng số CÔNG THỨC của §4.3, không phải ngưỡng vận hành: cả hai không nằm trong 19 key
# của config/policy.yaml. Đưa chúng vào policy là mở đường chỉnh tay tỉ lệ 0.3 giữa các
# lần chạy, và mọi số recall đã công bố mất mốc so.
GAP_RATIO_THRESHOLD = 0.3
SEVERITY_EPSILON = 1e-6

# Regime DUY NHẤT được áp chế độ thận trọng (§5.3). Không phải điều kiện mưa/cao điểm
# tự suy — nhãn đã do src/common/regime.py gắn sẵn trong `Forecast.regime`.
CONSERVATIVE_REGIME: Regime = "rain_peak"

# `None` = chế độ thường (luôn p50 − p50, kể cả ở `rain_peak`). Là một trong ba nhánh
# bắt buộc đo được của AC #4, không phải giá trị "chưa cấu hình".
GapMode = ConservativeGapMode | None


@dataclass(frozen=True)
class DetectionResult:
    """Output §4.3 kèm trạng thái hysteresis MỚI.

    Trả trạng thái ra ngoài thay vì giữ trong module: Replay Engine sở hữu vòng đời của nó
    và `POST /replay/reset` phải xóa được (§3.3). Module giữ state riêng là state ẩn (§3 #7).
    """

    output: HotspotOutput
    state: HysteresisState


def gap_inputs(
    zone: ZoneForecast,
    *,
    regime: Regime,
    conservative_gap_mode: GapMode,
) -> tuple[float, float]:
    """Cặp (cầu, cung) dùng để tính `gap` theo router R5/R6/R7 (AGENT_WORKFLOW §2.1).

    Ngoài `rain_peak` thì mọi chế độ đều rơi về p50 − p50: chế độ thận trọng sinh ra cho
    đúng regime mưa + cao điểm, áp cả ngày sẽ thổi phồng gap ở giờ thấp điểm và ăn hết
    ngân sách điều chuyển vào những zone không căng.
    """
    if regime != CONSERVATIVE_REGIME or conservative_gap_mode is None:
        return zone.predicted_demand, zone.predicted_supply
    if conservative_gap_mode == "p90_p50":
        return zone.demand_p90, zone.predicted_supply
    return zone.demand_p90, zone.supply_p10


def gap_of(zone: ZoneForecast, *, regime: Regime, conservative_gap_mode: GapMode) -> float:
    """`gap = cầu − cung` theo chế độ đang hiệu lực — §4.3."""
    demand, supply = gap_inputs(zone, regime=regime, conservative_gap_mode=conservative_gap_mode)
    return demand - supply


def severity_of(gap: float, predicted_demand: float) -> float:
    """`severity_score = gap / (predicted_demand + ε)` — §4.3.

    ε tồn tại để zone có cầu dự báo bằng 0 không làm vỡ phép chia; nó KHÔNG phải hệ số
    hiệu chỉnh, nên giữ đúng 1e-6 để severity của hai lần chạy so được với nhau.
    """
    return gap / (predicted_demand + SEVERITY_EPSILON)


def meets_condition(
    *,
    predicted_supply: float,
    gap: float,
    predicted_demand: float,
    min_supply_per_zone: int,
) -> bool:
    """Điều kiện thô §4.3: `supply < min_supply_per_zone` HOẶC `gap / demand ≥ 0.3`.

    Cố ý KHÔNG tính qua `severity_score`, dù hai biểu thức chỉ chênh nhau ở ε: §4.3 viết
    vế này bằng `predicted_demand` trần, nên `gap/demand` đúng 0.3 phải là hotspot. Dùng
    mẫu số `demand + ε` sẽ đẩy biên xuống dưới ngưỡng và làm ca biên trả ngược kết quả.

    Cầu dự báo bằng 0 là ca riêng: tỷ lệ không xác định (chia 0), nên quy về "chỉ thiếu
    hụt khi gap dương thật" — xảy ra được ở chế độ thận trọng, nơi gap tính bằng
    `demand_p90` trong khi `predicted_demand` là p50.
    """
    if predicted_supply < min_supply_per_zone:
        return True
    if predicted_demand <= 0:
        return gap > 0
    return gap / predicted_demand >= GAP_RATIO_THRESHOLD


def raw_conditions(
    forecast: Forecast,
    *,
    min_supply_per_zone: int,
    conservative_gap_mode: GapMode,
) -> dict[int, bool]:
    """Điều kiện §4.3 của từng zone TRƯỚC hysteresis — đầu vào của `advance()`.

    Tách riêng để đo được mức nhấp nháy trước/sau hysteresis (AC #2) trên cùng một chuỗi
    dữ liệu, thay vì phải suy ngược từ output đã lọc.
    """
    conditions: dict[int, bool] = {}
    for zone in forecast.zones:
        gap = gap_of(zone, regime=forecast.regime, conservative_gap_mode=conservative_gap_mode)
        conditions[zone.zone_id] = meets_condition(
            predicted_supply=zone.predicted_supply,
            gap=gap,
            predicted_demand=zone.predicted_demand,
            min_supply_per_zone=min_supply_per_zone,
        )
    return conditions


def detect(
    forecast: Forecast,
    *,
    idle_supply_current: Mapping[int, int],
    min_supply_per_zone: int,
    conservative_gap_mode: GapMode,
    state: HysteresisState | None = None,
    cooldown_until_ts: Mapping[int, datetime | None] | None = None,
) -> DetectionResult:
    """Một step Model 2: `Forecast` → `HotspotOutput` + trạng thái hysteresis mới.

    `idle_supply_current` phải phủ đủ các zone của forecast và đến TỪ SNAPSHOT tại `t`
    (§4.1) — thiếu zone thì nổ `KeyError` chứ không mặc định 0: một zone bị coi là 0 xe rỗi
    sẽ vừa thành hotspot ảo vừa bị loại khỏi nguồn điều chuyển, và không có dấu hiệu nào
    lộ ra trong output.

    `state=None` là khởi động nguội (step đầu của một lần replay), không phải "bỏ hysteresis".
    """
    current_state = initial_state() if state is None else state
    conditions = raw_conditions(
        forecast,
        min_supply_per_zone=min_supply_per_zone,
        conservative_gap_mode=conservative_gap_mode,
    )
    next_state, decided = advance(current_state, conditions)

    hotspots: list[Hotspot] = []
    surplus_zones: list[SurplusZone] = []
    for zone in forecast.zones:
        idle_now = idle_supply_current[zone.zone_id]
        if decided[zone.zone_id]:
            gap = gap_of(zone, regime=forecast.regime, conservative_gap_mode=conservative_gap_mode)
            hotspots.append(
                Hotspot(
                    zone_id=zone.zone_id,
                    is_hotspot=True,
                    gap=gap,
                    severity_score=severity_of(gap, zone.predicted_demand),
                    idle_supply_current=idle_now,
                )
            )
        # Surplus luôn tính bằng p50 − p50: đây là số xe DÁM RÚT ĐI, nên chế độ thận trọng
        # (vốn để phóng đại thiếu hụt) áp vào đây sẽ làm rút nhiều hơn mức an toàn.
        surplus = zone.predicted_supply - zone.predicted_demand
        if surplus > 0:
            surplus_zones.append(
                SurplusZone(
                    zone_id=zone.zone_id,
                    surplus=surplus,
                    idle_supply_current=idle_now,
                    cooldown_until_ts=None if cooldown_until_ts is None else cooldown_until_ts.get(zone.zone_id),
                )
            )

    output = HotspotOutput(
        forecast_ts=forecast.forecast_ts,
        horizon_min=forecast.horizon_min,
        hotspots=tuple(hotspots),
        surplus_zones=tuple(surplus_zones),
        # Echo cả khi `None` (chế độ thường): đọc lại một output cũ phải biết ngay nó được
        # tính bằng công thức nào, không phải tra lại policy của ngày hôm đó.
        conservative_gap_mode=conservative_gap_mode,
    )
    return DetectionResult(output=output, state=next_state)


def ground_truth_flag(*, actual_demand: float, actual_supply: float, min_supply_per_zone: int) -> bool:
    """Nhãn A4 của một (zone, forecast_ts) — DATA_CONTRACT §3.3.

    Cùng vị từ §4.3 nhưng chạy trên SỐ THỰC TẾ của replay, không phải quantile: ground truth
    là "zone đó có thiếu xe thật không", nên đổi `conservative_gap_mode` không được làm nó
    nhúc nhích — nếu có, recall đo chính cấu hình của mình chứ không đo dự báo.

    Cũng KHÔNG áp hysteresis: hysteresis là chính sách làm mượt của phía quyết định,
    đưa vào cả hai vế thì hai lỗi triệt tiêu nhau và recall trông đẹp lên vô cớ.
    """
    gap = actual_demand - actual_supply
    return meets_condition(
        predicted_supply=actual_supply,
        gap=gap,
        predicted_demand=actual_demand,
        min_supply_per_zone=min_supply_per_zone,
    )
