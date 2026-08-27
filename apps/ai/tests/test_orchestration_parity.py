"""Tiêu chí nghiệm thu R1: đồ thị và `POST /decisions` cho ra cùng một quyết định.

Đây là test khoá của cả bản nâng cấp. Nếu nó đỏ, nghĩa là hai đường đã trôi xa nhau và mọi
so sánh KPI giữa "bản cũ" với "bản multi-agent" mất hiệu lực — vì hai bên không còn tính
cùng một thứ.

Test chạy ở chế độ deterministic (`llm_routing_enabled=false`), đúng chế độ mà CI, eval và
baseline đã khóa dùng. Không có request mạng nào trong file này.
"""

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.common.policy import get_policy
from src.config import get_settings
from src.main import app
from src.orchestration.graph import run_pipeline
from src.orchestration.tools.decision_tools import RunContext

# Ba mốc phủ ba tình huống khác nhau: mưa cao điểm (đường bảo thủ p90), cao điểm khô, và
# đêm không cao điểm (đường không sinh phương án). Một mốc duy nhất sẽ bỏ lọt nhánh rẽ.
REPLAY_SOURCES = (
    ("2026-09-25T08:30:00+07:00", 5),
    ("2026-09-25T07:00:00+07:00", 15),
    ("2026-09-25T02:00:00+07:00", 15),
)


def _zones_at(client: TestClient, source_at: str) -> list[dict[str, object]]:
    response = client.post("/api/v1/datasets/snapshots/at", json={"source_at": source_at})
    assert response.status_code == 200, response.text
    return list(response.json()["zones"])


class _Zone:
    """Bản sao tối thiểu của một zone, khớp Protocol `ZoneObservation`."""

    def __init__(self, raw: dict[str, object]) -> None:
        self.zone_id = int(raw["zone_id"])  # type: ignore[arg-type]
        self.demand_observed = int(raw["demand_observed"])  # type: ignore[arg-type]
        self.idle_supply = int(raw["idle_supply"])  # type: ignore[arg-type]
        self.enroute_supply = int(raw["enroute_supply"])  # type: ignore[arg-type]
        self.rain_mm_h = float(raw["rain_mm_h"])  # type: ignore[arg-type]
        self.rain_forecast_15 = float(raw["rain_forecast_15"])  # type: ignore[arg-type]
        self.rain_forecast_30 = float(raw["rain_forecast_30"])  # type: ignore[arg-type]
        self.peak_flag = int(raw["peak_flag"])  # type: ignore[arg-type]
        self.holiday_flag = int(raw["holiday_flag"])  # type: ignore[arg-type]


@pytest.mark.parametrize(("source_at", "horizon_min"), REPLAY_SOURCES)
def test_graph_matches_decisions_endpoint(source_at: str, horizon_min: int) -> None:
    settings = get_settings()
    assert not settings.llm_routing_enabled, "Test parity phải chạy ở chế độ deterministic."

    with TestClient(app) as client:
        zones = _zones_at(client, source_at)
        payload = {
            "snapshot_id": f"parity-{source_at}",
            "t": source_at,
            "horizon_min": horizon_min,
            "data_source": "AI_PARQUET_REPLAY:parity",
            "replay_source_at": source_at,
            "zones": zones,
        }
        http_response = client.post("/api/v1/decisions", json=payload)
        assert http_response.status_code == 200, http_response.text

        context = RunContext(
            zones=[_Zone(zone) for zone in zones],
            t=pd.Timestamp(source_at),
            horizon_min=horizon_min,  # type: ignore[arg-type]
            replay_source_at=pd.Timestamp(source_at),
            policy=get_policy(settings.policy_path),
            settings=settings,
        )
        state = run_pipeline(
            context,
            snapshot_id=payload["snapshot_id"],
            data_source=payload["data_source"],
        )

    assert state["decision"] == http_response.json()


def test_graph_reports_five_agent_cards_and_tool_trail() -> None:
    """UI cần trạng thái từng agent và dấu vết tool — kể cả khi không có LLM."""
    settings = get_settings()
    source_at = "2026-09-25T08:30:00+07:00"
    with TestClient(app) as client:
        zones = _zones_at(client, source_at)
        context = RunContext(
            zones=[_Zone(zone) for zone in zones],
            t=pd.Timestamp(source_at),
            horizon_min=5,
            replay_source_at=pd.Timestamp(source_at),
            policy=get_policy(settings.policy_path),
            settings=settings,
        )
        state = run_pipeline(context, snapshot_id="cards", data_source="AI_PARQUET_REPLAY:cards")

    reports = state["agent_reports"]
    assert set(reports) == {"situation_assessment", "dispatch", "optimization", "explanation"}
    assert set(reports["situation_assessment"].capabilities) == {"forecast", "traffic", "supply"}
    assert all(report.status == "DONE" for report in reports["situation_assessment"].capabilities.values())

    # Chế độ deterministic vẫn ghi tool_calls, nên so sánh hai chế độ là so hai danh sách
    # cùng định dạng chứ không phải đọc log tự do.
    assert [call.tool for call in state["tool_calls"]] == [
        "run_forecast",
        "get_weather",
        "get_travel_conditions",
        "get_supply_state",
        "compute_relocation",
        "render_explanation",
    ]
    assert all(call.ok for call in state["tool_calls"])
    assert state["routing_mode"] == "deterministic"
    assert state["explanation"]["layer"] == "template"
    assert state["recommended_plan_id"] == "PLAN_B"
