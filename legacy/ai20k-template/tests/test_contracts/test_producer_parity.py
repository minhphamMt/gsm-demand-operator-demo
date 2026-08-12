"""T0.7 AC #5 — bộ test contract chạy được trên CẢ mock LẪN bản thật (DoD #7).

C-06 nói mọi module chưa xong phải có mock trả **đúng** contract. Câu đó chỉ có giá trị
nếu mock và bản thật đi qua **cùng một** bộ kiểm — mock được nới lỏng riêng thì tầng dưới
code theo mock rồi vỡ đúng lúc tầng trên xong.

Hôm nay (cuối W2) chỉ hai entity có bản thật trên đĩa:

    §4.1 Snapshot ← data/snapshots/snapshot_test.parquet   (T0.4)
    §4.7 Driver   ← config/driver_registry.json            (T0.6)

Bảy entity còn lại do Model 1 (T1) → Activation Engine (T7) sinh ra, chưa tồn tại. Nguồn
"không phải mock" gần nhất của chúng là ví dụ JSON trong SPEC §4 — cũng do người ngoài
repo viết, cũng không biết gì về code này. Nên bảng dưới đặt hai nguồn `mock` và `spec`
cạnh nhau cho đủ 9 entity, và thêm nguồn `real` cho hai entity đã có dữ liệu thật.

Khi T1–T7 xong, thêm producer thật vào đúng dòng entity tương ứng — không phải viết
test mới.
"""

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

import pytest
from pydantic import BaseModel

from src.common.regime import tag_regime
from src.config import PROJECT_ROOT
from src.contracts import ZONE_COUNT
from src.contracts.driver import Driver
from src.contracts.forecast import Forecast
from src.contracts.history import DriverResponseRecord, PlanDecisionRecord
from src.contracts.hotspot import HotspotOutput
from src.contracts.offer import ActivationOffer
from src.contracts.plan import RelocationPlan
from src.contracts.response import DriverResponse
from src.contracts.revision import RevisionRequest
from src.contracts.snapshot import Snapshot
from tests.test_contracts import mocks
from tests.test_contracts import spec_examples as ex

DRIVER_REGISTRY_PATH = PROJECT_ROOT / "config" / "driver_registry.json"
SNAPSHOT_TEST_PARQUET = PROJECT_ROOT / "data" / "snapshots" / "snapshot_test.parquet"

# Số tài xế đã chốt ở T0.6 — trùng với tổng đội xe của A1.
EXPECTED_DRIVER_COUNT = 600

Producer = Callable[[], dict[str, Any]]

# entity → model → {tên nguồn: producer}. Mọi nguồn của cùng một entity phải qua cùng model.
PARITY_CASES: dict[str, tuple[type[BaseModel], dict[str, Producer]]] = {
    "§4.1 Snapshot": (Snapshot, {"mock": mocks.mock_snapshot, "spec": ex.snapshot_30_zones}),
    "§4.2 Forecast": (Forecast, {"mock": mocks.mock_forecast, "spec": ex.forecast_30_zones}),
    "§4.3 HotspotOutput": (
        HotspotOutput,
        {"mock": mocks.mock_hotspot_output, "spec": lambda: dict(ex.SPEC_4_3_HOTSPOT_OUTPUT)},
    ),
    "§4.4 RelocationPlan": (
        RelocationPlan,
        {"mock": mocks.mock_relocation_plan, "spec": lambda: dict(ex.SPEC_4_4_PLAN)},
    ),
    "§4.5 RevisionRequest": (
        RevisionRequest,
        {"mock": mocks.mock_revision_request, "spec": lambda: dict(ex.SPEC_4_5_REVISION)},
    ),
    "§4.6 PlanDecisionRecord": (
        PlanDecisionRecord,
        {"mock": mocks.mock_plan_decision_record, "spec": ex.plan_decision_record},
    ),
    "§4.6 DriverResponseRecord": (
        DriverResponseRecord,
        {"mock": mocks.mock_driver_response_record, "spec": ex.driver_response_record},
    ),
    "§4.7 Driver": (Driver, {"mock": mocks.mock_driver, "spec": lambda: dict(ex.SPEC_4_7_DRIVER)}),
    "§4.8 ActivationOffer": (ActivationOffer, {"mock": mocks.mock_offer, "spec": lambda: dict(ex.SPEC_4_8_OFFER)}),
    "§4.9 DriverResponse": (
        DriverResponse,
        {"mock": mocks.mock_driver_response, "spec": lambda: dict(ex.SPEC_4_9_RESPONSE)},
    ),
}

PARITY_PARAMS = [
    pytest.param(model, producer, id=f"{entity} [{source}]")
    for entity, (model, producers) in PARITY_CASES.items()
    for source, producer in producers.items()
]


@pytest.mark.parametrize(("model", "producer"), PARITY_PARAMS)
def test_moi_nguon_deu_qua_cung_mot_model(model: type[BaseModel], producer: Producer) -> None:
    """Mock và nguồn ngoài repo cùng phải hợp lệ với đúng model của entity."""
    assert isinstance(model.model_validate(producer()), model)


@pytest.mark.parametrize(("model", "producer"), PARITY_PARAMS)
def test_round_trip_json_khong_lam_lech_du_lieu(model: type[BaseModel], producer: Producer) -> None:
    """dump → validate lại phải ra đúng object cũ.

    History Store ghi bản ghi xuống JSON rồi đọc lên để đối chứng KPI (§5.8). Một field
    không round-trip được nghĩa là số đọc lên khác số đã duyệt — sai lệch im lặng.
    """
    original = model.model_validate(producer())
    assert model.model_validate(original.model_dump(mode="json")) == original


@pytest.mark.parametrize("entity", list(PARITY_CASES))
def test_mock_phu_het_field_cua_model(entity: str) -> None:
    """Mock phải cấp ĐỦ field của model, kể cả field optional.

    Model chấp nhận mock thiếu field optional — nhưng khi đó tầng dưới code theo mock sẽ
    không bao giờ chạm tới `activation`, `by_regime` hay `conservative_gap_mode`, và
    nhánh đó chỉ vỡ lúc bản thật xuất hiện. Mock là bản mô tả contract, không phải
    payload tối thiểu.

    Chỉ soát tầng field ngoài cùng — đủ để bắt field bị bỏ quên, và không giả vờ là
    phép kiểm đệ quy.
    """
    model, producers = PARITY_CASES[entity]
    declared = set(model.model_fields)
    missing = declared - set(producers["mock"]())
    assert missing == set(), f"{entity}: mock thiếu field {sorted(missing)}"


@pytest.mark.parametrize("entity", list(PARITY_CASES))
def test_moi_nguon_cap_du_field_bat_buoc(entity: str) -> None:
    """Nguồn ngoài repo được phép vắng field optional, nhưng không được vắng field bắt buộc.

    Ví dụ SPEC §4.3 không có `conservative_gap_mode` vì field đó sinh sau (quyết định #4)
    — đúng nghĩa "chỉ thêm field optional" của I-08. Cái không được phép là thiếu field
    bắt buộc, hoặc mang field mà model không khai (`extra="forbid"` bắt lúc validate,
    test này chỉ gọi tên thủ phạm sớm hơn).
    """
    model, producers = PARITY_CASES[entity]
    declared = set(model.model_fields)
    required = {name for name, field in model.model_fields.items() if field.is_required()}

    for source, producer in producers.items():
        fields = set(producer())
        assert required <= fields, f"{entity}: nguồn '{source}' thiếu field bắt buộc {sorted(required - fields)}"
        assert fields <= declared, f"{entity}: nguồn '{source}' có field lạ {sorted(fields - declared)}"


# ---------------------------------------------------------------------------
# §4.7 Driver — bản thật: toàn bộ config/driver_registry.json
# ---------------------------------------------------------------------------


def _real_drivers() -> list[dict[str, Any]]:
    """A6 trên đĩa. `config/` được commit nên không cần skip — thiếu file là lỗi thật."""
    with DRIVER_REGISTRY_PATH.open(encoding="utf-8") as handle:
        drivers: list[dict[str, Any]] = json.load(handle)
    return drivers


def test_toan_bo_driver_registry_that_hop_le() -> None:
    """600/600 bản ghi thật qua đúng model §4.7 — không lấy mẫu, không bỏ sót.

    Validate cả 600 chứ không phải bản ghi đầu: ràng buộc C-03 (`is_demo_account == true`)
    và ràng buộc "không dữ liệu cá nhân thật" (`display_name` dạng `Tài xế {n}`) chỉ có
    nghĩa khi không bản ghi nào lọt.
    """
    raw = _real_drivers()
    assert len(raw) == EXPECTED_DRIVER_COUNT

    drivers = [Driver.model_validate(record) for record in raw]
    assert len({driver.driver_id for driver in drivers}) == EXPECTED_DRIVER_COUNT
    assert all(driver.is_demo_account for driver in drivers)


def test_driver_that_va_mock_cung_bo_field() -> None:
    """Mock của §4.7 phải mô tả đúng cái A6 thật có, không nhiều không ít."""
    assert set(_real_drivers()[0]) == set(mocks.mock_driver())


# ---------------------------------------------------------------------------
# §4.1 Snapshot — bản thật: data/snapshots/snapshot_test.parquet
# ---------------------------------------------------------------------------


def _read_snapshot_frame() -> Any:
    """Đọc A1. `data/` nằm trong .gitignore nên CI sạch sẽ không có file này."""
    pd = pytest.importorskip("pandas", reason="A1 lưu dạng Parquet, cần pandas + pyarrow")
    pytest.importorskip("pyarrow", reason="A1 lưu dạng Parquet, cần pandas + pyarrow")
    if not SNAPSHOT_TEST_PARQUET.exists():
        pytest.skip(f"thiếu {SNAPSHOT_TEST_PARQUET.relative_to(PROJECT_ROOT)} — sinh lại bằng generate_snapshots.py")
    return pd.read_parquet(SNAPSHOT_TEST_PARQUET)


def _row_to_zone_snapshot(row: dict[str, Any]) -> dict[str, Any]:
    """Một dòng A1 → payload §4.1. Đây là phần Replay Engine (T1) sẽ làm thật."""
    arrivals = row["enroute_arrivals"]
    return {
        "zone_id": int(row["zone_id"]),
        "demand_observed": int(row["demand_observed"]),
        "idle_supply": int(row["idle_supply"]),
        "enroute_supply": int(row["enroute_supply"]),
        "enroute_arrivals": [
            {
                "arrival_ts": _iso(arrival["arrival_ts"]),
                "eta_steps": int(arrival["eta_steps"]),
                "units": int(arrival["units"]),
                "source": str(arrival["source"]),
                "from_zone": int(arrival["from_zone"]),
            }
            for arrival in (arrivals if arrivals is not None else [])
        ],
        "price_index": float(row["price_index"]),
        "rain_mm_h": float(row["rain_mm_h"]),
        "rain_forecast_15": float(row["rain_forecast_15"]),
        "rain_forecast_30": float(row["rain_forecast_30"]),
        "peak_flag": int(row["peak_flag"]),
        "holiday_flag": int(row["holiday_flag"]),
    }


def _iso(value: Any) -> str:
    """Parquet trả pandas.Timestamp; contract đòi ISO-8601 có offset +07:00."""
    return value.isoformat() if isinstance(value, datetime) else str(value)


def _pick_buckets(frame: Any) -> dict[str, Any]:
    """Bốn mốc cố định, chọn bằng dữ liệu chứ không bằng chỉ số gõ tay.

    Có `rain_peak` trong đó vì đó là regime quyết định thành công của dự án — nếu
    contract vỡ ở đúng mốc mưa + cao điểm thì mọi số KPI chính đều không dựng được.
    """
    buckets = sorted(frame["ts_bucket"].unique())
    regimes = [tag_regime(float(rain), int(peak)) for rain, peak in zip(frame["rain_mm_h"], frame["peak_flag"])]
    frame = frame.assign(_regime=regimes)

    picked: dict[str, Any] = {"đầu kỳ": buckets[0], "cuối kỳ": buckets[-1]}
    for regime in ("rain", "rain_peak"):
        matched = frame.loc[frame["_regime"] == regime, "ts_bucket"]
        if len(matched):
            picked[regime] = sorted(matched.unique())[0]
    return picked


def test_snapshot_that_hop_le_o_bon_moc() -> None:
    """Bản thật của §4.1 qua đúng model đã kiểm INV-3 và độ phủ 30 zone."""
    frame = _read_snapshot_frame()
    picked = _pick_buckets(frame)
    assert "rain_peak" in picked, "A1 phải có ít nhất một mốc rain_peak (§5.14.1)"

    for label, ts_bucket in picked.items():
        rows = frame[frame["ts_bucket"] == ts_bucket].sort_values("zone_id")
        payload = {
            "t": _iso(ts_bucket),
            "zones": [_row_to_zone_snapshot(row) for row in rows.to_dict("records")],
        }
        snapshot = Snapshot.model_validate(payload)
        assert len(snapshot.zones) == ZONE_COUNT, label
        assert sorted(zone.zone_id for zone in snapshot.zones) == list(range(1, ZONE_COUNT + 1)), label


def test_snapshot_that_va_mock_cung_bo_field_zone() -> None:
    """Cột A1 phải phủ đúng field §4.1 — thiếu cột nào thì Replay Engine sẽ phải bịa."""
    frame = _read_snapshot_frame()
    first = frame.sort_values(["ts_bucket", "zone_id"]).to_dict("records")[0]

    real_fields = set(_row_to_zone_snapshot(first))
    mock_fields = set(mocks.mock_snapshot()["zones"][0])
    assert real_fields == mock_fields, f"lệch field zone: {real_fields ^ mock_fields}"

    # `ts_bucket` là tên cột A1 của `Snapshot.t`; ngoài nó ra không được thừa cột lạ.
    assert set(frame.columns) - {"ts_bucket"} == real_fields


def test_duong_dan_du_lieu_that_khai_bao_dung() -> None:
    """Chốt chặn cho chính hai test ở trên: sai đường dẫn thì chúng skip lặng lẽ."""
    assert DRIVER_REGISTRY_PATH.name == "driver_registry.json"
    assert SNAPSHOT_TEST_PARQUET.parent == PROJECT_ROOT / "data" / "snapshots"


def test_khong_entity_nao_bi_bo_quen() -> None:
    """Đủ 9 mục §4.1–4.9 (§4.6 có hai biến thể nên bảng có 10 dòng)."""
    sections = {entity.split()[0] for entity in PARITY_CASES}
    assert sections == {f"§4.{i}" for i in range(1, 10)}
    assert len(PARITY_CASES) == 10, "chỉ §4.6 được có hai dòng"
