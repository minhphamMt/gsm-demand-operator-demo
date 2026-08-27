# Đặc tả kỹ thuật — Hệ thống AI Agent dự báo & điều phối xe

**Mã tài liệu:** TS-01
**Phiên bản:** 0.1 (draft)
**Nguồn:** 11 video concept (`00-video-evidence-map.md`) + đặc tả chức năng (`01-functional-spec.md`)
**Ngày:** 20/08/2026

> **Ranh giới của tài liệu này.** Video là mockup giao diện — nó cho biết **hệ thống phải sản xuất ra cái gì**, không cho biết **sản xuất bằng cách nào**. Do đó:
> - **§2, §3, §5** (contract, agent, luồng) bám sát video — mọi trường dữ liệu đều truy về một nhãn đọc được trên màn hình.
> - **§4, §6, §7** (model, hạ tầng, phi chức năng) là **đề xuất kỹ thuật**, đánh dấu `[Đề xuất]`. Nhóm có thể thay hoàn toàn mà không ảnh hưởng UI.

---

## 1. Nguyên tắc thiết kế

Bốn nguyên tắc rút trực tiếp từ hành vi quan sát được trong video:

**N1 — Contract-first.** UI trong video hiển thị các trường rất cụ thể (`AI Confidence: 94%`, `ETA: -3.5min`, `Coverage 114`). Backend và frontend thống nhất qua JSON schema ở §2 trước khi code.

**N2 — Agent phải nhìn thấy được.** `[V-5]` cho thấy pipeline agent là một **màn hình cho người dùng**, không phải chi tiết ẩn. Mỗi agent phải phát ra trạng thái (running / done / warning) và output có thể render.

**N3 — Người quyết định là chốt chặn.** `[Đề xuất]` dựa trên `[V-8]`: mọi đường dẫn **quan sát được** trong video đều đi qua một quyết định của con người. Kiến trúc nên có một **hàng đợi quyết định** rõ ràng, không phải một side-effect. (11 clip ngắn không đủ để kết luận hệ thống không có chế độ tự động — xem `01` BR-01.)

**N4 — Kế hoạch bất biến, có version.** `[V-10]` `PLAN V2` tồn tại song song với `CURRENT ACTIVE PLAN`. Kế hoạch không bị sửa tại chỗ; re-plan tạo bản ghi mới.

---

## 2. JSON Contract

Toàn bộ **tên trường** dưới đây đều neo vào một nhãn đọc được trong video; cột **Nguồn** ghi rõ clip.

> ⚠️ **Các giá trị trong khối JSON chỉ là dữ liệu minh hoạ.** Chỉ những con số được cột Nguồn trích dẫn nguyên văn (`44,858`, `2213`, `3.298`, `94`, `2.1`, `31`, `45`, `-3.5`, `114`, `92`) mới đến từ video; phần còn lại do tài liệu bịa để khối JSON hợp lệ. Xem `00 §1`.

### 2.1 `ZoneState` — trạng thái một vùng

Cấp cho: bản đồ (S1), panel giám sát (P1).

```json
{
  "zone_id": "ZONE_D",
  "zone_name": "Zone D",
  "geometry_ref": "h3:8c65a1...",
  "as_of": "2026-08-20T18:05:00+07:00",
  "horizon_min": 0,
  "status": "SHORTAGE",
  "supply": 128,
  "demand": 368,
  "gap": -240,
  "avg_eta_min": 3.298,
  "dominant_side": "DEMAND",
  "weather": {
    "condition": "RAIN",
    "travel_time_impact_pct": 15
  }
}
```

| Trường | Nguồn |
|---|---|
| `zone_name` | `[V-7]` `ZONE B` / `ZONE C` / `ZONE D`, `[V-9]` `Zone D` |
| `status` | `[V-3]` `[V-9]` chuỗi màu xanh→vàng→cam→đỏ. Enum: `BALANCED` \| `WATCH` \| `ABNORMAL` \| `SHORTAGE` |
| `supply` | `[V-2]` `TOTAL SUPPLY` — `[Chuẩn hoá]`: video hiển thị nhãn này ở **cấp thành phố**; tài liệu tái dùng tên cho **cấp vùng**, giá trị cấp thành phố nằm ở `CityMetrics.total_supply` (§2.2) |
| `demand` | `[V-2]` `ACTIVE DEMAND`, `[V-3]` `PASSENGER DEMAND` `368` — cùng ghi chú cấp dữ liệu như trên |
| `avg_eta_min` | `[V-3]` `AVERAGE ETA` `3.298 mins` — 3 chữ số thập phân |
| `dominant_side` | `[V-3]` icon trong zone đổi từ xe → hành khách. Enum: `SUPPLY` \| `DEMAND` \| `NONE` |
| `weather.travel_time_impact_pct` | `[V-5]` `Rain Impact: +15% Travel Time` |
| `horizon_min` | `[V-4]` `NOW` / `+10 MIN` / `+20 MIN` / `+30 MIN` → `0 \| 10 \| 20 \| 30` |

`[Chuẩn hoá]` `gap = supply − demand`. Video hiển thị hai số riêng, không hiển thị hiệu; hiệu là thứ quyết định màu nên đưa vào contract.

---

### 2.2 `CityMetrics` — chỉ số toàn thành phố

Cấp cho: panel AI Monitoring (P1), wall board (S0).

```json
{
  "as_of": "2026-08-20T18:05:00+07:00",
  "ai_monitoring": true,
  "total_supply": 44858,
  "active_demand": 2213,
  "predicted_demand": 2680,
  "avg_eta_min": 3.298,
  "active_rides": 959,
  "system_efficiency_pct": 65.0,
  "vehicle_shortage_risk_enabled": true,
  "eta_series": [
    { "t": "2026-08-20T17:35:00+07:00", "v": 2.9 },
    { "t": "2026-08-20T17:40:00+07:00", "v": 3.1 }
  ],
  "demand_series": [
    { "t": "2026-08-20T18:10:00+07:00", "v": 2400, "is_forecast": true }
  ]
}
```

| Trường | Nguồn |
|---|---|
| `ai_monitoring` | `[V-2]` `AI MONITORING` + chấm xanh lá |
| `total_supply` | `[V-3]` `TOTAL SUPPLY` `44,858` |
| `active_demand` | `[V-3]` `ACTIVE DEMAND` `2213` |
| `predicted_demand` | `[V-4]` `PREDICTED DEMAND` |
| `active_rides` | `[V-1]` `Active Rides` `959` |
| `system_efficiency_pct` | `[V-1]` `System Efficiency` `65%` |
| `vehicle_shortage_risk_enabled` | `[V-4]` toggle `VEHICLE SHORTAGE RISK` |
| `demand_series[].is_forecast` | `[V-4]` area chart có **dải nền vàng** đánh dấu đoạn dự báo |

---

### 2.3 `ZoneAlert` — cảnh báo trên bản đồ

Cấp cho: tooltip cảnh báo (C-alert).

```json
{
  "alert_id": "alr_20260820_1805_zoneD",
  "zone_id": "ZONE_D",
  "level": "ABNORMAL",
  "headline": "ABNORMAL DEMAND DETECTED",
  "metric_label": "PASSENGER DEMAND",
  "metric_value": 368,
  "raised_at": "2026-08-20T18:05:00+07:00"
}
```

`[V-3]` Ở mức `WATCH`, tooltip hiển thị `metric_label` + `metric_value` (`PASSENGER DEMAND` / `368`). Ở mức `ABNORMAL`, tooltip hiển thị `headline` (`ABNORMAL DEMAND DETECTED`). Cả hai đều có icon ⚠.

---

### 2.4 `ForecastRequest` / `ForecastResponse`

```jsonc
// Request
{
  "as_of": "2026-08-20T18:05:00+07:00",
  "horizons_min": [0, 10, 20, 30],
  "zone_ids": ["ZONE_A", "ZONE_B", "ZONE_C", "ZONE_D"]
}
```

```jsonc
// Response
{
  "model_version": "lgbm-demand-2026.08.1",
  "generated_at": "2026-08-20T18:05:02+07:00",
  "horizons": [
    {
      "horizon_min": 20,
      "zones": [
        {
          "zone_id": "ZONE_A",
          "predicted_demand": 412,
          "predicted_supply": 96,
          "gap": -316,
          "shortage_risk": 0.87,
          "severity": "CRITICAL",
          "confidence_interval": [372, 455]
        }
      ]
    }
  ]
}
```

| Trường | Nguồn |
|---|---|
| `horizons_min` | `[V-4]` timeline 4 mốc |
| `shortage_risk` | `[V-4]` `VEHICLE SHORTAGE RISK` |
| `severity` | `[V-4]` vùng dự báo có **2 mức thị giác**: cam (viền nét đứt + fill) và đỏ-hatched (lõi). Enum: `MODERATE` \| `CRITICAL` |
| `confidence_interval` | `[Đề xuất]` — video không có, nhưng cần cho `AI Confidence` ở `[V-8]` |

---

### 2.5 `PipelineRun` + `AgentResult`

Cấp cho: modal Agent Pipeline (S2).

```json
{
  "run_id": "run_20260820_1805",
  "trigger": "ZONE_ALERT",
  "trigger_ref": "alr_20260820_1805_zoneD",
  "started_at": "2026-08-20T18:05:03+07:00",
  "status": "COMPLETED",
  "agents": [
    {
      "agent": "FORECAST_AGENT",
      "display_name": "Forecast Agent",
      "order": 1,
      "status": "DONE",
      "started_at": "2026-08-20T18:05:03+07:00",
      "finished_at": "2026-08-20T18:05:06+07:00",
      "summary": null,
      "output_ref": "fc_20260820_1805"
    },
    {
      "agent": "TRAFFIC_AGENT",
      "display_name": "Traffic Agent",
      "order": 2,
      "status": "DONE",
      "summary": "Rain Impact: +15% Travel Time",
      "output_ref": "tr_20260820_1805"
    },
    {
      "agent": "SUPPLY_AGENT",
      "display_name": "Supply Agent",
      "order": 3,
      "status": "WARNING",
      "summary": null
    },
    {
      "agent": "DISPATCH_AGENT",
      "display_name": "Dispatch Agent",
      "order": 4,
      "status": "DONE",
      "actions": [
        { "action_id": "a1", "verb": "Re-route", "quantity": 50, "unit": "Vehicles", "to_zone": "ZONE_B", "from_zone": null, "selected": true },
        { "action_id": "a2", "verb": "Re-route", "quantity": 50, "unit": "Vehicles", "to_zone": "ZONE_A", "from_zone": null, "selected": true }
      ]
    },
    {
      "agent": "OPTIMIZATION_AGENT",
      "display_name": "Optimization Agent",
      "order": 5,
      "status": "DONE",
      "output_ref": "planset_20260820_1805"
    }
  ]
}
```

| Trường | Nguồn |
|---|---|
| `display_name` | `[V-5]` nguyên văn 5 tên agent |
| `order` | `[V-5]` thứ tự trong danh sách dọc t5/t9 |
| `status` | `[V-5]` tick tròn = `DONE`, icon ⚠ trên `Supply Agent` = `WARNING`. Enum: `PENDING` \| `RUNNING` \| `DONE` \| `WARNING` \| `FAILED` |
| `summary` | `[V-5]` `Rain Impact: +15% Travel Time` hiển thị **bên trong thẻ agent** |
| `actions[]` | `[V-5]` `Re-route 50 Vehicles to Zone B` |
| `actions[].selected` | `[V-5]` mỗi dòng có checkbox |
| `actions[].from_zone` | `[Cần xác nhận]` — video chỉ ghi đích |

---

### 2.6 `PlanSet` + `Plan`

Cấp cho: Strategy Generator (S3), Plan Card (C-plan), Plan Review (S4).

```json
{
  "plan_set_id": "planset_20260820_1805",
  "run_id": "run_20260820_1805",
  "generated_at": "2026-08-20T18:05:12+07:00",
  "recommended_plan_id": "PLAN_B",
  "criteria": ["vehicles", "eta_delta_min", "cost", "relocation_distance_km"],
  // Giá trị của PLAN_A và các chỉ số ngoài PLAN_B đều là MINH HOẠ —
  // video chỉ đọc được số của PLAN B (45 / -3.5min / Low / coverage 114).
  "plans": [
    {
      "plan_id": "PLAN_A",
      "label": "PLAN A",
      "version": 1,
      "metrics": {
        "vehicles": 66,
        "eta_delta_min": -2.1,
        "cost": "HIGH",
        "relocation_distance_km": 130,
        "coverage": 95
      },
      "scores": { "vehicles": "BAD", "eta_delta_min": "GOOD", "cost": "BAD", "relocation_distance_km": "MEDIUM" },
      "status": "PROPOSED"
    },
    {
      "plan_id": "PLAN_B",
      "label": "PLAN B",
      "version": 1,
      "is_recommended": true,
      "metrics": {
        "vehicles": 45,
        "eta_delta_min": -3.5,
        "cost": "LOW",
        "relocation_distance_km": 95,
        "coverage": 114
      },
      "scores": { "vehicles": "GOOD", "eta_delta_min": "GOOD", "cost": "GOOD", "relocation_distance_km": "GOOD" },
      "ai_confidence_pct": 94,
      "expected_eta_improvement_min": 2.1,
      // expected_service_risk_reduction_pct và reasoning[] KHÔNG thuộc plan v1:
      // trong video chúng chỉ xuất hiện ở UPDATED RECOMMENDATION / PLAN V2 (§2.9).
      "reasons": [
        { "text": "High Demand Spike", "severity": "HIGH" },
        { "text": "Approaching Rain",  "severity": "CRITICAL" }
      ],
      "actions": [
        { "action_id": "a1", "verb": "Re-route", "quantity": 50, "unit": "Vehicles", "to_zone": "ZONE_B" }
      ],
      "status": "PROPOSED"
    }
  ]
}
```

| Trường | Nguồn (nguyên văn) |
|---|---|
| `label` | `PLAN A` / `PLAN B` / `PLAN C` `[V-6]` |
| `is_recommended` | badge `Recommended` `[V-6]` `[V-7]` |
| `metrics.vehicles` | `Vehicles: 45` `[V-6]` `[V-7]` |
| `metrics.eta_delta_min` | `ETA: -3.5min` `[V-6]` `[V-7]` |
| `metrics.cost` | `Cost: Low` `[V-6]` `[V-7]` — enum `LOW` \| `MEDIUM` \| `HIGH` |
| `metrics.relocation_distance_km` | `Relocation distance` `[V-6]` |
| `metrics.coverage` | `Coverage` `114` `[V-7]` |
| `scores.*` | `[V-6]` t5 — thanh so sánh **màu** mint / vàng / đỏ. Enum `GOOD` \| `MEDIUM` \| `BAD` |
| `ai_confidence_pct` | `AI Confidence: 94%` `[V-8]` |
| `expected_eta_improvement_min` | `Expected ETA Improvement: 2.1 min` `[V-8]` |
| `expected_service_risk_reduction_pct` | `Expected service risk` `31%` `[V-11]` — **chỉ có ở bản cập nhật (`PLAN V2`)**, xem §2.9; không xuất hiện trên plan gốc |
| `reasons[].severity` | `[V-8]` thanh màu bên trái mỗi dòng lý do |
| `reasoning[]` | `[V-11]` khối `Reasoning`, nguyên văn 3 dòng — **chỉ có ở bản cập nhật**, xem §2.9 |

> **Phân biệt `reasons` và `reasoning`.** Video dùng **hai dạng khác nhau**: `[V-8]` là **nhãn ngắn có mức độ màu** (`High Demand Spike`), `[V-11]` là **câu đầy đủ có dấu chấm** (`Rain impact detected.`). Contract giữ cả hai vì chúng render ở hai chỗ khác nhau.

---

### 2.7 `PlanDecision` — quyết định của con người

```json
{
  "decision_id": "dec_20260820_1806",
  "plan_id": "PLAN_B",
  "plan_version": 1,
  "decision": "APPROVE",
  "decided_by": "dispatcher_01",
  "decided_at": "2026-08-20T18:06:41+07:00",
  "selected_action_ids": ["a1", "a2"],
  "note": null
}
```

`decision` enum: `APPROVE` \| `MODIFY` \| `REJECT` `[V-8]` · `APPROVE_UPDATE` `[V-11]` · `RECALL` \| `CANCEL` `[V-5]`

`[Đề xuất]` Đây là bản ghi audit trail. Video không có màn hình lịch sử, nhưng BR-01 (con người là chốt chặn) chỉ có ý nghĩa nếu quyết định được lưu vết.

---

### 2.8 `ExecutionState` — trạng thái thực thi

Cấp cho: Execution Monitor (S5).

```json
{
  "plan_id": "PLAN_B",
  "plan_version": 2,
  "plan_label": "PLAN V2",
  "state": "DISPATCHING",
  "status_banner": "PLAN APPROVED — DISPATCHING",   // [Chuẩn hoá] — nguyên văn video dùng gạch nối "-"
  "adaptive_routing_active": true,
  "progress_pct": 92,
  "orders": [
    {
      "order_id": "ord_001",
      "from_zone": "ZONE_B",
      "to_zone": "ZONE_D",
      "vehicles_assigned": 12,
      "vehicles_arrived": 4,
      "route_polyline": "…",
      "waypoints": [[21.03, 105.85], [21.04, 105.86]],
      "state": "IN_TRANSIT"
    }
  ]
}
```

| Trường | Nguồn |
|---|---|
| `plan_label` | `PLAN V2` `[V-10]` `[V-11]` |
| `status_banner` | `PLAN APPROVED - DISPATCHING` `[V-8]`, `Strategy Confirmed - Dispatching` `[V-5]` `[V-7]` |
| `adaptive_routing_active` | `ADAPTIVE ROUTING ACTIVE` `[V-10]` |
| `progress_pct` | `[V-10]` `92%` trong donut gauge |
| `waypoints` | `[V-9]` `[V-10]` tuyến nét đứt có **waypoint tròn** |

> Không có contract riêng tên `DispatchOrder`. Một lệnh điều xe là một phần tử của `ExecutionState.orders[]`.

---

### 2.9 `ReplanEvent` + `PlanUpdate`

```json
{
  "event_id": "evt_20260820_1812",
  "type": "NEW_DATA_INGESTED",
  "toast": "NEW DATA INGESTED",
  "stages": [
    { "key": "NEW_DATA",        "label": "NEW DATA",        "state": "DONE",    "progress_pct": 100 },
    { "key": "FORECAST_UPDATE", "label": "FORECAST UPDATE", "state": "RUNNING", "progress_pct": 62  },
    { "key": "OPERATION",       "label": "OPERATION",       "state": "PENDING", "progress_pct": 0   }
  ],
  "result": {
    "new_plan_id": "PLAN_B",
    "new_plan_version": 2,
    "new_plan_label": "PLAN V2",
    "compared_to": { "plan_id": "PLAN_B", "version": 1, "label": "CURRENT ACTIVE PLAN" },
    "headline": "UPDATED RECOMMENDATION",
    "expected_service_risk_reduction_pct": 31,
    "reasoning": [
      "Rain impact detected.",
      "Demand forecast increased in Zone D.",
      "Nearby supply is insufficient."
    ],
    "requires_approval": true
  }
}
```

| Trường | Nguồn |
|---|---|
| `toast` | `NEW DATA INGESTED` `[V-10]` |
| `stages[].label` | `NEW DATA`, `FORECAST UPDATE`, `OPERATION` `[V-10]` `[V-11]` sidebar |
| `headline` | `UPDATED RECOMMENDATION` `[V-11]` |
| `compared_to.label` | `CURRENT ACTIVE PLAN` `[V-11]` |
| `requires_approval` | `APPROVE UPDATE` là nút riêng `[V-11]` |

---

## 3. Kiến trúc Agent

### 3.1 Danh sách agent chính thức

`[V-5]` cho hai danh sách khác nhau ở hai frame. Tài liệu chọn **danh sách 5 agent** (xuất hiện ở 2/3 frame, có sơ đồ luồng dữ liệu đi kèm) và xếp Weather/Fee xuống thành **tool**.

| # | Agent | Trách nhiệm | Đầu vào | Đầu ra |
|---|---|---|---|---|
| 1 | `Forecast Agent` | Dự báo cầu (và cung) theo zone theo từng chân trời | lịch sử chuyến, thời tiết, sự kiện, thời gian | `ForecastResponse` |
| 2 | `Traffic Agent` | Ước lượng ảnh hưởng giao thông & thời tiết lên thời gian di chuyển | dữ liệu giao thông, thời tiết | `summary` dạng `Rain Impact: +15% Travel Time` + ma trận thời gian đi lại |
| 3 | `Supply Agent` | Kiểm kê xe khả dụng theo zone, phát cảnh báo khi không đủ nguồn | trạng thái đội xe | tồn kho theo zone + cờ `WARNING` |
| 4 | `Dispatch Agent` | Sinh danh sách hành động điều xe cụ thể | output của 1+2+3 | `actions[]` dạng `Re-route N Vehicles to Zone X` |
| 5 | `Optimization Agent` | Tổng hợp, sinh 3 phương án, chấm điểm, chọn `Recommended` | tất cả các agent trên | `PlanSet` |

> **Quyết định runtime phase đầu:** năm dòng trên là agent/capability **hiển thị trên UI**. `Forecast Agent`, `Traffic Agent` và `Supply Agent` được triển khai bên trong một `Situation Assessment Agent` duy nhất; ba capability vẫn chạy song song, có status và output riêng để S2 render. `Dispatch Agent` và `Optimization Agent` vẫn là runtime agent/node riêng.

**Sơ đồ luồng** `[V-5]` t5/t9: bốn agent đầu **hội tụ vào `Optimization Agent`**, agent này toả tiếp sang panel kết quả.

```
Situation Assessment Agent
├── Forecast capability ─┐
├── Traffic capability  ─┼──▶ Dispatch Agent ─▶ Optimization Agent ─▶ PlanSet (PLAN A/B/C)
└── Supply capability   ─┘                                                   │
                                                                             ▼
                                                                      Human approval
```

> Lưu ý: sơ đồ trong video là **hội tụ**, không phải chuỗi tuần tự thuần tuý. Runtime gộp ba capability assessment để giảm checkpoint và orchestration overhead, nhưng không biến chúng thành xử lý tuần tự.

### 3.2 Tool của agent

`[Đề xuất]` Đây là phần **kế hoạch dự án hiện tại còn để ngỏ** ("chưa biết tích hợp Agent như thế nào và Agent sẽ gọi những tool nào"). Video cung cấp đủ dấu vết để đề xuất bộ tool tối thiểu — mọi tool dưới đây đều tồn tại vì có một con số trên màn hình cần nó.

| Tool | Agent gọi | Chữ ký | Vì sao cần (bằng chứng UI) |
|---|---|---|---|
| `get_zone_state(zone_ids, as_of)` | tất cả | → `ZoneState[]` | Bản đồ và panel `[V-2]` |
| `predict_demand(zone_ids, horizons)` | Situation Assessment › Forecast capability | → `ForecastResponse` | `PREDICTED DEMAND` `[V-4]` |
| `get_weather(bbox, horizon)` | Situation Assessment › Traffic capability | → `{condition, intensity, eta_impact_pct}` | icon mưa `[V-2]` t5/t9, `Rain Impact: +15% Travel Time` `[V-5]`, `Approaching Rain` `[V-8]`, `Rain impact detected.` `[V-11]` |
| `get_travel_time_matrix(zones)` | Situation Assessment › Traffic capability | → ma trận N×N phút | `ETA: -3.5min` phải tính được `[V-6]` |
| `list_available_vehicles(zone_id)` | Situation Assessment › Supply capability | → `{count, vehicle_ids[]}` | đếm icon xe trong zone `[V-7]` |
| `compute_relocation(deficit_zones, surplus_zones, constraints)` | Dispatch | → `actions[]` | `Re-route 50 Vehicles to Zone B` `[V-5]` |
| `score_plan(plan)` | Optimization | → `{scores, coverage, cost}` | thanh màu so sánh `[V-6]`, `Coverage 114` `[V-7]` |
| `explain(plan, context)` | Optimization | → `reasoning[]` | khối `Reasoning` `[V-11]` |
| `submit_for_approval(plan_set)` | Optimization | → `plan_set_id` | luồng phê duyệt `[V-8]` |
| `dispatch(plan_id, action_ids)` | — (sau approve) | → `ExecutionState` | `PLAN APPROVED - DISPATCHING` `[V-8]` |
| `recall(plan_id)` / `cancel(plan_id)` | — | → `ExecutionState` | nút `RECALL` / `CANCEL` `[V-5]` |

**Quy tắc quan trọng:** `dispatch`, `recall`, `cancel` là các tool **có tác dụng phụ**. Theo N3/BR-01, agent **không được** gọi trực tiếp — chỉ tầng ứng dụng gọi sau khi có `PlanDecision` hợp lệ.

`[Cần xác nhận]` Nếu `Fee Agent` `[V-5]` t2 là thật (không phải chữ méo), cần bổ sung `suggest_price_multiplier(zone_id, gap)`. Điều này khớp với bước 3 trong kế hoạch dự án ("đề xuất hệ số giá động") nhưng **không clip nào cho thấy UI của nó**.

### 3.3 Trạng thái agent hiển thị lên UI

Mọi agent phát ra một máy trạng thái chung để `S2` render:

```
PENDING ──▶ RUNNING ──┬──▶ DONE      (tick tròn xanh lá)   [V-5]
                      ├──▶ WARNING   (icon ⚠ vàng)          [V-5] Supply Agent
                      └──▶ FAILED    ([Cần xác nhận] — video không có)
```

`[Cần xác nhận]` Video không cho thấy agent lỗi. Cần định nghĩa: pipeline dừng hẳn, hay Optimization Agent chạy với dữ liệu thiếu và hạ `ai_confidence_pct`?

---

## 4. Mô hình dự báo `[Đề xuất]`

Phần này video **không** nói gì. Đề xuất dưới đây bám theo hướng nhóm đã chọn trong kế hoạch dự án.

### 4.1 Baseline

**LightGBM** hồi quy, một model cho `demand`, một cho `supply`, dự báo riêng cho từng chân trời.

Nhóm đặc trưng:

| Nhóm | Ví dụ | Vì sao (bằng chứng UI) |
|---|---|---|
| Thời gian | giờ trong ngày, thứ, cờ giờ cao điểm | — |
| Không gian | `zone_id`, thống kê zone lân cận | Video luôn hiển thị theo zone `[V-7]` |
| Trễ (lag) | demand t−5/−10/−15/−30/−60 | chart lịch sử `[V-2]` |
| Thời tiết | mưa (bool), cường độ, dự báo mưa | `Approaching Rain` `[V-8]` — mô hình phải nhìn **được về phía trước** |
| Cung | xe khả dụng, xe đang có khách | `TOTAL SUPPLY` `[V-2]` |
| Giao thông | tốc độ trung bình, hệ số tắc | `+15% Travel Time` `[V-5]` |

> `Approaching Rain` là ràng buộc thiết kế đáng chú ý: hệ thống phải dùng **dự báo thời tiết**, không chỉ thời tiết hiện tại.

### 4.2 Lộ trình

ST-GNN để nắm quan hệ lan truyền giữa các zone lân cận. `[Đề xuất]` Không bắt buộc cho MVP; UI không phân biệt được model nào sinh ra con số.

### 4.3 Sinh phương án

Video yêu cầu **3 phương án khác nhau đáng kể** với đánh đổi rõ giữa `vehicles` / `eta` / `cost` / `distance` `[V-6]`. Ba cách sinh khả dĩ:

| Cách | Bản chất |
|---|---|
| Đa mục tiêu | Chạy min-cost flow với 3 bộ trọng số khác nhau (ưu tiên ETA / ưu tiên chi phí / cân bằng) |
| Đa ngưỡng | Cùng thuật toán, 3 mức "quyết liệt" (số xe điều tối đa 30 / 50 / 80) |
| Đa thuật toán | Greedy / min-cost flow / heuristic có ràng buộc |

`[Đề xuất]` **Cách đa mục tiêu** khớp nhất với video: cả 3 plan đều hợp lệ, chỉ khác điểm số trên cùng bộ tiêu chí — đúng như thanh so sánh màu ở `[V-6]` t5.

> **Ghi chú với vấn đề nhóm đang gặp** (*"gợi ý điều từ vùng cân bằng sang vùng cân bằng"*).
>
> `[Đề xuất]` Đặt một assertion ở biên contract: mọi `action.to_zone` phải có `status ∈ {ABNORMAL, SHORTAGE}`, và `from_zone` (khi có) phải có `status = BALANCED` với `gap > 0`. Vi phạm → lỗi ở tầng sinh action, không phải tầng model.
>
> ⚠️ **Chính video cũng vi phạm assertion này.** `[V-5]` hiển thị `Re-route 50 Vehicles to Zone B`, trong khi `[V-7]` cho thấy Zone B là **vùng dư** (xanh lá). Hai khả năng: (a) video mô tả `to_zone` theo nghĩa "vùng nguồn được huy động" chứ không phải vùng đích, hoặc (b) đây chỉ là lỗi sinh ảnh. Vì `from_zone` là `[Cần xác nhận]` (G4), **ngữ nghĩa của `to_zone` phải được nhóm chốt trước khi bật assertion** — nếu không sẽ chặn nhầm dữ liệu hợp lệ.

---

## 5. Luồng dữ liệu đầu-cuối

```
 [Nguồn dữ liệu]
   chuyến đi · GPS đội xe · thời tiết · giao thông
        │
        ▼
 [Tầng nạp dữ liệu] ──── sự kiện NEW_DATA_INGESTED ──▶ toast  [V-10]
        │
        ▼
 [Trạng thái zone]  ZoneState / CityMetrics ──────────▶ S1 bản đồ + P1 panel  [V-2]
        │
        ▼
 [Bộ phát hiện]  vượt ngưỡng? ──▶ ZoneAlert ─────────▶ C-alert tooltip  [V-3]
        │
        ▼
 [Pipeline agent]  Forecast → Traffic → Supply → Dispatch
                                    └──▶ Optimization ──▶ S2 modal  [V-5]
        │
        ▼
 [PlanSet]  PLAN A / B / C + Recommended ─────────────▶ S3 modal  [V-6]
        │
        ▼
 ┌─────────────── CHỐT CHẶN CON NGƯỜI ───────────────┐
 │  S4: APPROVE / MODIFY / REJECT           [V-8]     │
 └────────────────────┬───────────────────────────────┘
                      │ APPROVE
                      ▼
 [Thực thi]  dispatch() ──▶ ExecutionState ──────────▶ S5 monitor  [V-9]
                      │
                      │ ◀── dữ liệu mới trong lúc đang chạy  [V-10]
                      ▼
 [Re-plan]  PLAN V2 + Reasoning ─────────────────────▶ S6  [V-11]
                      │
                      ▼
        ┌── APPROVE UPDATE ──▶ quay lại [Thực thi]
        └── VIEW CHANGES ───▶ so sánh với CURRENT ACTIVE PLAN
```

---

## 6. Ghi chú hạ tầng `[Đề xuất]`

Video không nói gì về hạ tầng. Những gợi ý dưới đây chỉ là hệ quả của yêu cầu UI:

| Yêu cầu UI | Hệ quả kỹ thuật |
|---|---|
| Toast tự xuất hiện, panel tự cập nhật `[V-10]` | **Nên dùng server-push** (WebSocket hoặc SSE). Polling chu kỳ ngắn vẫn khả thi nhưng tốn hơn ở mật độ cập nhật này |
| Pipeline agent hiện tick từng bước `[V-5]` | Trạng thái agent phải **stream**, không đợi chạy xong mới trả |
| `PLAN V2` tồn tại song song `CURRENT ACTIVE PLAN` `[V-11]` | Lưu trữ kế hoạch phải **append-only, có version** |
| Wall board và desktop cùng dữ liệu `[V-1]` `[V-9]` | Một nguồn state duy nhất, hai chế độ render |
| ~40 icon xe di chuyển mượt `[V-2]` | Render bản đồ nên dùng WebGL layer, không phải DOM marker |

`[Cần xác nhận]` Toàn bộ mục này. Không có con số hiệu năng, SLA, hay quy mô nào trong video.

---

## 7. Khoảng trống kỹ thuật

| # | Khoảng trống | Ảnh hưởng |
|---|---|---|
| G1 | Định nghĩa zone: hexagon (H3) hay đa giác hành chính? `[V-2]` dùng hexagon, `[V-7]` dùng đa giác bất quy tắc | Toàn bộ mô hình không gian |
| G2 | Chân trời dự báo: +10/+20/+30 (video) hay 5/10/15 (kế hoạch nhóm) | Model, contract, UI |
| G3 | Ngưỡng chuyển trạng thái zone | Bộ phát hiện |
| G4 | `from_zone` của action — video chỉ ghi đích | Thuật toán điều xe |
| G5 | Công thức tính `ai_confidence_pct` | Màn hình phê duyệt |
| G6 | Hành vi khi agent lỗi | Độ tin cậy pipeline |
| G7 | `Fee Agent` có thật không → có định giá động không | Phạm vi |
| G8 | Cơ chế lưu vết quyết định | Tuân thủ / audit |
| G9 | Ngữ nghĩa `RECALL` vs `CANCEL` | Điều khiển thực thi |
| G10 | Ngữ nghĩa của `to_zone` — vùng đích hay vùng được huy động? (§4.3) | Assertion kiểm tra action |
