"""T0.7 AC #4 — `zones` đúng 30 phần tử, `zone_id` phủ đủ 1–30, không trùng.

Đếm `len == 30` là chưa đủ: một message có 30 phần tử nhưng lặp zone 7 và thiếu zone 19
vẫn qua phép đếm, rồi zone 19 biến mất khỏi mọi bảng KPI mà không dòng log nào báo.
"""

from copy import deepcopy
from typing import Any

import pytest
from pydantic import ValidationError
from src.contracts import ZONE_COUNT
from src.contracts.forecast import Forecast
from src.contracts.snapshot import Snapshot

from tests.test_contracts import spec_examples as ex


def test_snapshot_du_30_zone_thi_hop_le() -> None:
    snapshot = Snapshot.model_validate(ex.snapshot_30_zones())
    assert len(snapshot.zones) == ZONE_COUNT
    assert sorted(zone.zone_id for zone in snapshot.zones) == list(range(1, ZONE_COUNT + 1))


def test_forecast_du_30_zone_thi_hop_le() -> None:
    forecast = Forecast.model_validate(ex.forecast_30_zones())
    assert len(forecast.zones) == ZONE_COUNT
    assert sorted(zone.zone_id for zone in forecast.zones) == list(range(1, ZONE_COUNT + 1))


@pytest.mark.parametrize("drop_count", [1, 5])
def test_snapshot_thieu_zone_bi_tu_choi(drop_count: int) -> None:
    payload = ex.snapshot_30_zones()
    payload["zones"] = payload["zones"][:-drop_count]

    with pytest.raises(ValidationError, match=f"phải có đúng {ZONE_COUNT} zone"):
        Snapshot.model_validate(payload)


def test_snapshot_thua_zone_bi_tu_choi() -> None:
    """31 phần tử — kể cả khi zone_id vẫn nằm trong 1–30."""
    payload = ex.snapshot_30_zones()
    payload["zones"].append(deepcopy(payload["zones"][0]))

    with pytest.raises(ValidationError, match=f"phải có đúng {ZONE_COUNT} zone"):
        Snapshot.model_validate(payload)


def test_snapshot_trung_zone_va_thieu_zone_bi_tu_choi() -> None:
    """Đúng 30 phần tử nhưng zone 7 lặp hai lần và zone 19 biến mất."""
    payload = ex.snapshot_30_zones()
    zones: list[dict[str, Any]] = payload["zones"]
    index_19 = next(i for i, zone in enumerate(zones) if zone["zone_id"] == 19)
    zones[index_19] = ex.filler_zone_snapshot(7)

    assert len(zones) == ZONE_COUNT
    with pytest.raises(ValidationError, match=r"thiếu \[19\], trùng \[7\]"):
        Snapshot.model_validate(payload)


def test_forecast_trung_zone_va_thieu_zone_bi_tu_choi() -> None:
    payload = ex.forecast_30_zones()
    zones: list[dict[str, Any]] = payload["zones"]
    index_19 = next(i for i, zone in enumerate(zones) if zone["zone_id"] == 19)
    zones[index_19] = ex.filler_zone_forecast(7)

    assert len(zones) == ZONE_COUNT
    with pytest.raises(ValidationError, match=r"thiếu \[19\], trùng \[7\]"):
        Forecast.model_validate(payload)
