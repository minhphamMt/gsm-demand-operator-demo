# DATA_CONTRACT.md — GSM-14 · NovaFour

> **Nguồn sự thật:** [docs/SPEC-GSM14-NovaFour-Unified.md](../SPEC-GSM14-NovaFour-Unified.md) v1.3 §4.1–4.9 + [docs/Data-Contract-Data-AI.md](../Data-Contract-Data-AI.md) (A1–A6) + [docs/feature_dictionary.md](../feature_dictionary.md).
> Tài liệu này **không thêm field nào ngoài spec**. Mọi giá trị spec để trống được điền bằng giá trị đề xuất và đeo nhãn `[ASSUMPTION-nn]` — tra ngược ở [§8 ASSUMPTION register](#8-assumption-register).
> **Contract §4.1–4.9 khóa cuối W2 (I-08).** Sau đó chỉ được thêm field **optional**, cấm sửa field cũ (§3.2 #1).

**Mục lục:** [§1 Quy ước](#1-quy-ước-chung) · [§2 Message contract §4.1–4.9](#2-message-contract--9-entity) · [§3 Dataset A1–A6](#3-dataset-a1a6--đối-chiếu-với-file-thật-trên-đĩa) · [§4 Persistence](#4-persistence) · [§5 policy.yaml 19 key](#5-configpolicyyaml--19-key) · [§6 driver_registry + driver_response](#6-config-khối-c) · [§7 Nowcast](#7-tham-số-nowcast-rain_forecast_1530) · [§8 ASSUMPTION register](#8-assumption-register) · [§9 Nợ dữ liệu D1–D12](#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa)

---

## 1. Quy ước chung

| Hạng mục | Chốt | Nguồn |
|---|---|---|
| `zone_id` | **int 1–30** (không phải string, không phải 0-index) | §4 quy ước chốt |
| Số lượng xe | Luôn là "units", **không có `unit_type`** — 1 loại phương tiện duy nhất | §4, C-04 |
| Datetime | ISO-8601 **có offset `+07:00`** | `config/generator.yaml → time.timezone` |
| Bước thời gian | 5 phút, 288 step/ngày; `ts_bucket` là mốc đầu step | `config/generator.yaml → time` |
| Tiền | int VNĐ | §4.4, §4.8 |
| Tầng validate | **Pydantic v2** trong `src/contracts/` — 1 file/entity | [ARCHITECTURE.md §7](ARCHITECTURE.md#7-cây-thư-mục-mục-tiêu) |
| Ký hiệu | ✅ bắt buộc · ⬜ optional · 🆕 mới v1.3 · 🔒 khóa cuối W2 | — |

---

## 2. Message contract — 9 entity

### 2.1. Entity `Snapshot` (§4.1) — `src/contracts/snapshot.py` 🔒

Replay Engine → toàn pipeline.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `t` | datetime | ✅ | ISO-8601 có offset; phải là bội số 5 phút (`minute % 5 == 0`, `second == 0`) |
| `zones` | list[ZoneSnapshot] | ✅ | `len == 30`; `zone_id` **không trùng**, phủ đủ 1–30 |

**`ZoneSnapshot`:**

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `zone_id` | int | ✅ | `1 ≤ zone_id ≤ 30` |
| `demand_observed` | int | ✅ | `≥ 0` |
| `idle_supply` | int | ✅ | `≥ 0` |
| `enroute_supply` | int | ✅ | `≥ 0` **và** `== Σ enroute_arrivals[].units` — **bất biến INV-3, kiểm mỗi step** (§4.1, §5.5) |
| `enroute_arrivals` | list[EnrouteArrival] | ✅ 🆕 | Rỗng `[]` nếu không có xe đang đến. **Không được `null`** |
| `price_index` | float | ✅ | `> 0`. **Không dùng làm feature Model 1/2** ở MVP (§5.2) — giữ cột cho khả năng mở rộng |
| `rain_mm_h` | float | ✅ | `≥ 0` |
| `rain_forecast_15` | float | ✅ | `≥ 0`. **Input ngoại sinh**, không phải output Model 1 (§4.1) |
| `rain_forecast_30` | float | ✅ | `≥ 0` |
| `peak_flag` | int | ✅ | ∈ {0, 1}; `1` ⟺ 07:00–09:00 hoặc 17:00–19:00 (`config/generator.yaml → peak_hours`) |
| `holiday_flag` | int | ✅ | ∈ {0, 1} |

**`EnrouteArrival`** 🆕 (v1.3 — không có ở v1.0/v1.1):

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `arrival_ts` | datetime | ✅ | Bội số 5 phút; `> t` |
| `eta_steps` | int | ✅ | `≥ 1`; `== (arrival_ts − t) / 5 phút` |
| `units` | int | ✅ | `≥ 1` |
| `source` | enum | ✅ | `relocation \| activation` — **bắt buộc**. Mất field này là mất khả năng tách đóng góp Khối B/Khối C (§4.1, §5.5 acceptance) |
| `from_zone` | int | ✅ | `1 ≤ from_zone ≤ 30`; `≠ zone_id` của zone chứa |

> **Vì sao `enroute_arrivals` không thể thay bằng số vô hướng:** với số vô hướng thì hai move đến ở step khác nhau bị gộp làm một và không unit nào có thời điểm chín xác định — Simulator §5.5 không biết chuyển bao nhiêu xe thành `idle_supply` tại mỗi step.

### 2.2. Entity `Forecast` (§4.2) — `src/contracts/forecast.py` 🔒

Model 1 → Model 2.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `t` | datetime | ✅ | Mốc snapshot gốc |
| `horizon_min` | int | ✅ | ∈ **{15, 30}** — không giá trị nào khác |
| `forecast_ts` | datetime | ✅ | `== t + horizon_min` |
| `zones` | list[ZoneForecast] | ✅ | `len == 30`, phủ đủ 1–30 |
| `model_version` | string | ✅ | Không rỗng. Ghi vào History để audit (§3.2 #6) |
| `regime` | enum | ✅ | `normal \| peak \| rain \| rain_peak` — gán bởi `src/common/regime.py`, **không tự tính lại nơi khác** |

**`ZoneForecast`:**

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `zone_id` | int | ✅ | 1–30 |
| `predicted_demand` | float | ✅ | `≥ 0`. Dự báo điểm (p50) |
| `predicted_supply` | float | ✅ | `≥ 0`. Dự báo điểm (p50) |
| `demand_p10` | float | ✅ | `≥ 0`; `≤ predicted_demand`. **Không được `null`** (§5.2 acceptance) |
| `demand_p90` | float | ✅ | `≥ predicted_demand`. **Không được `null`** |
| `supply_p10` | float | ✅ 🆕 | `≥ 0`; `≤ predicted_supply`. **Không được `null`** (v1.3) |
| `supply_p90` | float | ✅ 🆕 | `≥ predicted_supply`. **Không được `null`** |
| `confidence` | float\|null | ⬜ | **Luôn `null` ở MVP** (quyết định đã chốt #5). Nếu có: `0 ≤ c ≤ 1` |

> Ràng buộc thứ tự quantile `p10 ≤ p50 ≤ p90` phải là validator Pydantic thật, không phải quy ước miệng: LightGBM train 3 objective quantile **độc lập** nên quantile crossing xảy ra được, và chế độ thận trọng `rain_peak` dựa thẳng vào hai đầu khoảng này.

### 2.3. Entity `HotspotOutput` (§4.3) — `src/contracts/hotspot.py` 🔒

Model 2 → Model 3 + UI.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `forecast_ts` | datetime | ✅ | Khớp `Forecast.forecast_ts` |
| `horizon_min` | int | ✅ | ∈ {15, 30} |
| `hotspots` | list[Hotspot] | ✅ | Có thể rỗng |
| `surplus_zones` | list[SurplusZone] | ✅ | Có thể rỗng |
| `conservative_gap_mode` | enum | ⬜ 🆕 | `p90_p50 \| p90_p10` — echo chế độ đang dùng. Field **optional thêm mới**, đúng §3.2 #1. Xem [ASSUMPTION-27](#8-assumption-register) |

**`Hotspot`:**

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `zone_id` | int | ✅ | 1–30 |
| `is_hotspot` | bool | ✅ | `(predicted_supply < min_supply_per_zone) OR (gap / predicted_demand ≥ 0.3)`, **sau hysteresis 2–3 step** |
| `gap` | float | ✅ | `predicted_demand − predicted_supply`. Ở `rain_peak`: thay `predicted_demand` bằng `demand_p90` (và `predicted_supply` bằng `supply_p10` nếu `conservative_gap_mode == "p90_p10"`) |
| `severity_score` | float | ✅ | `gap / (predicted_demand + ε)`, `ε = 1e-6`. Dùng xếp hạng ở Optimizer |
| `idle_supply_current` | int | ✅ 🆕 | **`idle_supply` thực tế tại `t` lấy thẳng từ snapshot §4.1 — KHÔNG phải giá trị dự báo.** Do Replay Engine điền, Model 2 chỉ truyền qua |

**`SurplusZone`:**

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `zone_id` | int | ✅ | 1–30 |
| `surplus` | float | ✅ | `predicted_supply − predicted_demand`; **chỉ đưa vào list khi `> 0`** |
| `idle_supply_current` | int | ✅ 🆕 | Như trên. Optimizer bắt buộc cần: `max_supply_move_pct × idle_supply_current` và ràng buộc `min_supply_per_zone` áp trên **cung hiện có**, trong khi `surplus` là hiệu của hai số **dự báo** nên không suy ngược ra được |
| `cooldown_until_ts` | datetime\|null | ✅ 🆕 | `= thời điểm zone bị rút xe lần cuối + cooldown_minutes`. `null` = không bị khóa. Optimizer **loại** mọi zone có `cooldown_until_ts > t`. **Chỉ có ở `surplus_zones`** vì cooldown chỉ ràng buộc zone nguồn. Khởi động nguội: toàn bộ 30 zone = `null` |

> **Ai điền `idle_supply_current` và `cooldown_until_ts`:** lớp pipeline (Replay Engine) — nơi duy nhất vừa có snapshot tại `t` vừa tra được History. Cố ý **không** đưa `cooldown_until_ts` vào snapshot §4.1: snapshot là deliverable A1 do generator sinh, generator không được biết gì về plan (tránh phụ thuộc ngược Data ← AI).

### 2.4. Entity `RelocationPlan` (§4.4) — `src/contracts/plan.py` 🔒

Model 3 → Simulator/UI.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `plan_id` | string (UUID4) | ✅ | Giữ nguyên xuyên suốt HITL + audit trail |
| `created_at` | datetime | ✅ | — |
| `based_on_forecast` | string | ✅ | Dạng `"{t}_h{horizon_min}"`, ví dụ `"2026-08-02T17:05:00+07:00_h15"` |
| `status` | enum | ✅ | `Draft → Proposed → Revised → Approved \| Rejected`. Chuyển trạng thái ngoài đồ thị → `PLAN_STATE_INVALID` |
| `moves` | list[Move] | ✅ | Có thể rỗng (kịch bản `NO_SOLUTION`) |
| `residual_gap` | list[ResidualGap] | ✅ | Có thể rỗng. **Input cho Activation Engine** (FR-9, §5.11) |
| `plan_totals` | PlanTotals | ✅ | — |
| `metrics_before` | Metrics | ✅ | — |
| `metrics_after` | Metrics | ✅ | — |
| `activation` | ActivationSummary\|null | ⬜ | `null` nếu chưa có chiến dịch |
| `metrics_after_activation` | Metrics\|null | ⬜ | Cùng schema `metrics_after`; **`null` cho tới khi chiến dịch đóng** |
| `explanation_data` | object | ✅ | Nguồn số liệu duy nhất của Explanation Engine (§5.6) |

**`Move`:**

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `from_zone` | int | ✅ | 1–30; `≠ to_zone` |
| `to_zone` | int | ✅ | 1–30 |
| `units_to_move` | int | ✅ | `≥ 1`; `≤ min(gap, surplus, max_supply_move_pct × idle_supply_current, idle_supply_current − min_supply_per_zone)` (§5.4) |
| `eta_steps` | int | ✅ | `= ceil(travel_time / 5 phút)`, **tối thiểu 1** |
| `estimated_distance_km` | float | ✅ | Haversine từ `zone_registry.json`, **on-the-fly, không precompute ma trận 30×30** (quyết định Data/BA 2026-08-04); `≤ max_distance` |
| `estimated_cost` | int | ✅ | `= deadhead_cost_per_km × deadhead_km`, làm tròn |
| `deadhead_km` | float | ✅ | `= estimated_distance_km` ở MVP (xe chạy rỗng toàn tuyến) |
| `before_gap` | float | ✅ | Gap của `to_zone` trước move |
| `after_gap` | float | ✅ | `= before_gap − units_to_move` |

**`ResidualGap`:** `zone_id` int ✅ (1–30) · `gap_remaining` float ✅ (`> 0`) · `suggested_activation` int ✅ (`≥ 0`, số xe cần huy động thêm).

**`PlanTotals`:** `total_units` int ✅ · `total_cost` int ✅ (**`≤ budget_cap`** — cứng) · `total_deadhead_km` float ✅ · `budget_cap` int ✅ (echo giá trị policy để audit).

**`Metrics`** (dùng chung cho `metrics_before/after/after_activation`, sinh bởi `src/simulation/metrics.py`):

| Field | Type | R/O | Công thức (§5.5) |
|---|---|---|---|
| `unmet_demand` | float | ✅ | `Σ_zone max(0, demand − supply)` |
| `avg_wait_proxy` | float | ✅ | `3.0 × ratio^1.5` phút, với `ratio = demand / max(supply, 1)`. Tổng hợp toàn hệ thống = **trung bình có trọng số theo `demand`** |
| `est_cancel_rate` | float | ✅ | `1 / (1 + e^(−0.4 × (avg_wait_proxy − 8.0)))`. Tổng hợp = **trung bình có trọng số của cancel rate từng zone**, KHÔNG phải logistic của wait trung bình |
| `by_regime` | dict | ⬜ | 4 khóa `normal/peak/rain/rain_peak`, mỗi khóa là một `Metrics` con |

> Ba tham số `3.0`, `1.5`, `−0.4`, `8.0` là **giả định hiệu chỉnh thô, không học từ dữ liệu thật** (C-07, §5.5). Chúng nằm cứng trong `metrics.py` và **không** đọc từ `policy.yaml` — nếu đọc được thì baseline đã bị nhiễm tham số điều chỉnh được (§5.14.1 acceptance).

**`ActivationSummary`** (nhúng trong plan, §4.4):

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `campaign_id` | string | ✅ | `ACT-YYYYMMDD-HHMM-nn` |
| `status` | enum | ✅ | `NotNeeded → Pending → Running → Closed`. **Vòng đời riêng, KHÔNG nhập vào `plan.status`** (§5.7) |
| `offers_sent` | int | ✅ | `≥ 0` |
| `offers_accepted` | int | ✅ | `≤ offers_sent` |
| `units_gained` | int | ✅ | `= offers_accepted` (mỗi offer = 1 unit) |
| `incentive_committed` | int | ✅ | **`≤ incentive_budget_cap` kể cả khi 100% nhận** (§5.11 acceptance) |
| `incentive_budget_cap` | int | ✅ | Echo giá trị policy |

### 2.5. Entity `RevisionRequest` (§4.5) — `src/contracts/revision.py` 🔒

UI → Khối B.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `plan_id` | string | ✅ | Phải tồn tại |
| `action` | enum | ✅ | `revise \| approve \| reject` |
| `revised_moves` | list[MoveLite] | ⬜ | Bắt buộc khi `action == "revise"`; có thể **rỗng** (bỏ hết move). `MoveLite` = `{from_zone, to_zone, units_to_move, eta_steps}` |
| `note` | string | ⬜/✅ | **Bắt buộc khi `action == "reject"`** (§4.5), không rỗng sau trim. Optional với `revise`/`approve` |

### 2.6. Entity `HistoryRecord` (§4.6) — `src/contracts/history.py` 🔒

Append-only. **Hai biến thể** phân biệt bằng `record_type`.

**Biến thể A — quyết định plan** (`record_type: "plan_decision"`):

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `record_id` | string | ✅ | `H-nnnnnn`, tăng đơn điệu |
| `record_type` | enum | ✅ | `plan_decision \| driver_response \| system_reset` |
| `snapshot_t` | datetime | ✅ | — |
| `forecast_ref` | string | ✅ | `"{t}_h{horizon}@{model_version}"` |
| `plan` | RelocationPlan | ✅ | Bản **đầy đủ** tại thời điểm quyết định (snapshot bất biến, không phải con trỏ) |
| `explanation_text` | string | ✅ | — |
| `decision` | enum | ✅ | `approved \| rejected \| revised` |
| `decided_by` | string | ✅ | Từ header `X-Operator-Id`, mặc định `operator_demo_01` (FR-7: lưu kèm **người thực hiện**) |
| `decided_at` | datetime | ✅ | — |
| `note` | string\|null | ⬜ | Bắt buộc khi `decision == "rejected"` |
| `metrics_before` | Metrics | ✅ | — |
| `metrics_after` | Metrics | ✅ | — |
| `metrics_after_activation` | Metrics\|null | ⬜ | `null` nếu plan không phát sinh chiến dịch |
| `activation_summary` | object\|null | ⬜ | Xem dưới |

**`activation_summary`:** `campaign_id` ✅ · `offers_sent` ✅ · `offers_accepted` ✅ · `offers_declined` ✅ · `offers_expired` ✅ · `units_gained` ✅ · `incentive_paid` int ✅ · `accept_rate` float ✅ (0–1) · **`accept_rate_source`** enum ✅ ∈ `simulated_model | human_demo | mixed`.

> **`accept_rate_source` là bắt buộc, không có mặc định.** Con số accept rate từ mô hình giả định **không được trình bày ngang hàng** với số do người thật bấm trong UAT (C-07, §4.6). Thiếu field này thì bảng kết quả cuối kỳ không phân biệt được nguồn.

**Biến thể B — phản hồi tài xế** (`record_type: "driver_response"`) — **mỗi phản hồi là một bản ghi riêng, không gộp** (§4.6), để giữ thứ tự thời gian và đếm lại `accept_rate`:

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `record_id` | string | ✅ | `H-nnnnnn` |
| `record_type` | enum | ✅ | `"driver_response"` |
| `plan_id` | string | ✅ | — |
| `campaign_id` | string | ✅ | — |
| `offer_id` | string | ✅ | — |
| `driver_id` | string | ✅ | `DRV-nnnn` |
| `decision` | enum | ✅ | `accept \| decline \| expired` — `expired` do **hệ thống** sinh, không phải hành động tài xế |
| `decline_reason` | enum\|null | ⬜ | **Không bắt buộc** (C-08) |
| `responded_at` | datetime | ✅ | — |
| `response_latency_sec` | int | ✅ | `= responded_at − offer.created_at`; phục vụ KPI ≤20 giây |
| `source` | enum | ✅ | `human_demo \| simulated_model` |

### 2.7. Entity `Driver` (§4.7) — `src/contracts/driver.py` 🔒

Config tĩnh `config/driver_registry.json`. **Không chứa dữ liệu cá nhân thật** — tên là nhãn giả.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `driver_id` | string | ✅ | `^DRV-\d{4}$`, khóa chính, không trùng |
| `display_name` | string | ✅ | Nhãn giả dạng `"Tài xế {n}"`. **Cấm** tên người thật |
| `home_zone` | int | ✅ | 1–30. Dùng khi tài xế `offline` (không biết vị trí) |
| `current_zone` | int | ✅ | 1–30. Cập nhật theo replay |
| `status` | enum | ✅ | `online_idle \| online_busy \| offline`. **`online_busy` không bao giờ nhận offer** |
| `shift_end_ts` | datetime\|null | ⬜ | Mốc dự kiến hết ca |
| `is_demo_account` | bool | ✅ | **Luôn `true` ở MVP** (C-03). Validator từ chối `false` — chốt chặn chống nhầm lẫn khi có dữ liệu thật sau này |

**Ràng buộc nhất quán A6 — bắt buộc có test tự động (§4.7):**

```
∀ (ts_bucket, zone):
    COUNT(driver_states WHERE status == "online_idle" AND current_zone == zone)
    == snapshot_A1[ts_bucket, zone].idle_supply
```

Không cộng `online_busy` vào phép khớp này. Đây là điểm dễ lệch nhất giữa generator và A6; test phải khớp **100%** mọi `ts_bucket`.

### 2.8. Entity `ActivationOffer` (§4.8) — `src/contracts/offer.py` 🔒

Activation Engine → Driver App.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `offer_id` | string | ✅ | `OF-nnnnnn`. 1 offer = 1 tài xế × 1 zone đích |
| `campaign_id` | string | ✅ | Gom nhóm offer cùng plan — dùng đếm accept rate |
| `plan_id` | string | ✅ | — |
| `driver_id` | string | ✅ | Tài xế phải có `is_demo_account == true` |
| `driver_status_at_offer` | enum | ✅ 🆕 | ∈ **{`online_idle`, `offline`}** — **không bao giờ `online_busy`**. **Đóng băng tại thời điểm phát hành** |
| `target_zone` | int | ✅ | 1–30 |
| `target_zone_name` | string | ✅ | Từ `zone_registry.json` |
| `from_zone` | int | ✅ | 1–30. `current_zone` nếu `online_idle`, `home_zone` nếu `offline` |
| `distance_km` | float | ✅ | Haversine; **`≤ activation_radius_km`** |
| `eta_min` | int | ✅ | `= distance_km / avg_vehicle_speed_kmh × 60`, làm tròn lên. Dùng **cùng một** `avg_vehicle_speed_kmh` với Optimizer và Generator (§3.3) |
| `incentive_amount` | int | ✅ | `= min(incentive_base + incentive_per_km × distance_km, incentive_max_per_offer)`, **làm tròn 1.000đ** |
| `reason_text` | string | ✅ | Sinh bởi Explanation **Lớp 1** (template). **Cấm LLM** — văn bản này đi kèm cam kết tiền thưởng (§5.6) |
| `created_at` | datetime | ✅ | — |
| `expires_at` | datetime | ✅ | `= created_at + offer_ttl_minutes` |
| `status` | enum | ✅ | `Sent → Accepted \| Declined \| Expired \| Cancelled` |

**Ràng buộc phát hành (§4.8) — kiểm ở tầng nghiệp vụ, không phải gợi ý:**

| # | Ràng buộc | Vi phạm → |
|---|---|---|
| 1 | Không gửi cho `online_busy` | Loại khỏi tập ứng viên |
| 2 | Không gửi cho tài xế ở zone mà rút đi làm `idle_supply` xuống dưới `min_idle_before_activation` | Loại khỏi tập ứng viên |
| 3 | Không vượt `max_offers_per_driver_per_hour` | Loại khỏi tập ứng viên |
| 4 | `Σ incentive_amount` của offer đang mở `≤ incentive_budget_cap`, **tính theo cam kết xấu nhất (tất cả cùng nhận)** | Dừng phát hành, cảnh báo `INCENTIVE_BUDGET_EXCEEDED` |

> **Vì sao `driver_status_at_offer` phải đóng băng:** offer sống `offer_ttl_minutes` = 10 phút = **2 step replay**, trong đó trạng thái tài xế ở `driver_states` đổi được. Tra lúc accept sẽ cho kết quả khác lúc phát hành và **phá tính deterministic** (§3.2 #6). Cùng logic đã áp cho `incentive_amount`: **đã hiện ra là đã cam kết**.

### 2.9. Entity `DriverResponse` (§4.9) — `src/contracts/response.py` 🔒

Driver App → Khối C.

| Field | Type | R/O | Validation rule |
|---|---|---|---|
| `offer_id` | string | ✅ | Phải đang `Sent` |
| `driver_id` | string | ✅ | Phải khớp `offer.driver_id` |
| `decision` | enum | ✅ | `accept \| decline`. **`expired` không hợp lệ ở input** — hệ thống tự sinh (§4.9) |
| `decline_reason` | enum\|null | ⬜ | **Không bắt buộc** (C-08 — không tạo ma sát khi từ chối). Nếu có: `Quá xa \| Sắp hết ca \| Thưởng chưa đủ \| Đang bận \| Khác` |
| `responded_at` | datetime | ✅ | Dùng tính `response_latency_sec` cho KPI ≤20 giây |

Xử lý 5 bước sau `accept`: xem [ARCHITECTURE.md §3.2](ARCHITECTURE.md#32-vòng-phản-hồi-đóng-fr-13) và [API_CONTRACT.md §7.3](API_CONTRACT.md#73-post-apiv1offersoffer_idrespond).

---

## 3. Dataset A1–A6 — đối chiếu với file thật trên đĩa

| Bộ | Nội dung | Vị trí theo contract | Trạng thái thật (09/08/2026) |
|---|---|---|---|
| **A1** | Snapshot thô §4.1 | `data/snapshots/*.parquet` | ✅ **Có** — `snapshot_train.parquet` + `snapshot_test.parquet`, đã có `enroute_arrivals` (T0.4, đóng [D1, D2](#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa)). Kèm `sample_snapshot_*.csv` để đọc mắt thường |
| **A2** | Feature store dẫn xuất từ A1 | `data/features/` | ❌ **Chưa có** — task **T1** |
| **A3** | Label/target, join 1-1 với A2 theo (`zone_id`, `ts_bucket`) | `data/labels/` | ❌ **Chưa có** — task **T1** |
| **A4** | Ground truth hotspot (tính trên số **thực tế**, không dùng quantile) | `data/ground_truth/` | ❌ **Chưa có** — task **T2** |
| **A5** | Test set deterministic đã khóa (7 ngày, seed 2026) | `data/test_set/` | ✅ **Có** — `snapshot_test.parquet` + `manifest.json` (T0.4, đóng [D5](#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa)); `splits.yaml` đã trỏ đúng dải ngày thật |
| **A6** | `config/driver_registry.json` + `data/driver_states/` | như tên | ✅ **Có cả hai** — 600 tài xế + `driver_states_{train,test}.parquet` (T0.6, đóng [D9](#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa)) |
| *(phụ)* | Chuỗi mưa NASA POWER 2025 — input tĩnh của A1 | `data/external/rain_hanoi_2025.csv` | ✅ **Có** (D3: nguồn lai, xem §9) |
| *(phụ)* | Baseline `no_action` đã khóa | `data/baseline/` | ✅ **Có** — 3 file, ký 2026-08-08, xem [§9.1](#91-baseline---đã-đạt-chuẩn-5141-khóa-2026-08-08) |

Ba bộ còn thiếu (A2/A3/A4) đều là **đầu ra của T1/T2**, không phải nợ dữ liệu — chúng chỉ tồn tại sau khi Model 1 và Model 2 chạy lần đầu.

**Ranh giới thực thi đã chốt (§4.1):** role Data giao A2/A3 **hoàn chỉnh**, gồm cả các cột lag/rolling. Role AI bắt đầu từ việc đọc Parquet và train, **không tự bù cột lag/rolling còn thiếu**.

### 3.1. A2 — feature store (36 feature, §5.2 + `docs/feature_dictionary.md`)

| Nhóm | Cột | Bắt buộc |
|---|---|---|
| Khóa | `zone_id`, `ts_bucket` | ✅ |
| Thời gian | `hour_of_day`, `bucket_in_hour`, `day_of_week` — derive từ `ts_bucket`, **KHÔNG dùng raw timestamp**. `bucket_in_hour = minute(ts_bucket) // 5` | ✅ |
| Lag cầu | `demand_observed_lag_0..6` (7 cột) | ✅ |
| Lag cung | `idle_supply_lag_0..6` (7 cột) | ✅ |
| Rolling 30' | `demand_roll_mean_30`, `demand_roll_std_30`, `supply_roll_mean_30`, `supply_roll_std_30` | ✅ |
| Cờ | `peak_flag`, `holiday_flag` | ✅ |
| Mưa | `rain_mm_h`, `rain_lag_1..6` (6 cột), `rain_forecast_15`, `rain_forecast_30` | ✅ |
| **Tương tác** | `rain_x_peak` = `rain_mm_h × peak_flag` | ✅ |
| | `rain_fc15_x_peak` = `rain_forecast_15 × peak_flag` | ✅ |
| | `rain_fc30_x_peak` = `rain_forecast_30 × peak_flag` 🆕 | ✅ |

**Không có trong A2:** `price_index` (không dùng làm feature ở MVP, §5.2), feature zone lân cận (quyết định đã chốt #2 — giữ khả năng giải thích cho HITL).

Lookback **N = 6 bước (30 phút)** — tên cột đã chốt theo Data Contract, không đổi.

### 3.2. A3 — label

`target_demand_15`, `target_demand_30`, `target_supply_15`, `target_supply_30` — join 1-1 với A2 theo (`zone_id`, `ts_bucket`). Model supply **bắt buộc** train song song với demand (§5.2).

### 3.3. A4 — ground truth hotspot

Tính trên **số thực tế** trong replay (shortage thực sự xảy ra), **không dùng quantile** (§4.3). Đây là mốc đo `hotspot recall ≥ 80%` (§1.7). Đổi `conservative_gap_mode` **không** làm đổi A4 — chỉ đổi phía dự báo.

---

## 4. Persistence

Quyết định A-02 ([ARCHITECTURE.md §9](ARCHITECTURE.md#9-quyết-định-kiến-trúc-spec-để-trống--chốt-ở-đây)): spec §5.1/§5.8 để "Parquet **hoặc** SQLite" — chốt dùng cả hai theo đặc tính dữ liệu.

### 4.1. Parquet — dữ liệu bất biến, đọc theo cột

| Đường dẫn | Nội dung | Partition |
|---|---|---|
| `data/snapshots/snapshot_{split}.parquet` | A1 | `split ∈ {train, test}` |
| `data/features/features_{split}.parquet` | A2 | như trên |
| `data/labels/labels_{split}.parquet` | A3 | như trên |
| `data/ground_truth/hotspot_gt_{split}.parquet` | A4 | như trên |
| `data/driver_states/driver_states_{split}.parquet` | A6 phần động | như trên |
| `data/baseline/no_action_metrics.parquet` | Baseline chi tiết `zone × ts_bucket`: `unmet`, `ratio`, `avg_wait_proxy`, `est_cancel_rate`, `regime` | — |
| `models/baseline_hist_avg.parquet` | Bảng tra `zone × hour × dow` | — |

### 4.2. SQLite — `data/history.db` (WAL) — append-only ép ở tầng DB

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE history_record (
    record_id     TEXT PRIMARY KEY,               -- H-nnnnnn
    record_type   TEXT NOT NULL CHECK (record_type IN ('plan_decision','driver_response','system_reset')),
    plan_id       TEXT,
    campaign_id   TEXT,
    snapshot_t    TEXT,
    forecast_ref  TEXT,
    decision      TEXT,
    decided_by    TEXT,
    decided_at    TEXT NOT NULL,
    note          TEXT,
    payload_json  TEXT NOT NULL,                  -- HistoryRecord §4.6 đầy đủ
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_history_plan   ON history_record(plan_id);
CREATE INDEX ix_history_time   ON history_record(decided_at);
CREATE INDEX ix_history_type   ON history_record(record_type);

CREATE TABLE campaign (
    campaign_id          TEXT PRIMARY KEY,        -- ACT-YYYYMMDD-HHMM-nn
    plan_id              TEXT NOT NULL,
    status               TEXT NOT NULL CHECK (status IN ('NotNeeded','Pending','Running','Closed')),
    offers_sent          INTEGER NOT NULL DEFAULT 0,
    incentive_committed  INTEGER NOT NULL DEFAULT 0,
    incentive_budget_cap INTEGER NOT NULL,
    response_mode        TEXT NOT NULL CHECK (response_mode IN ('human','simulated','mixed')),
    accept_rate_source   TEXT NOT NULL CHECK (accept_rate_source IN ('simulated_model','human_demo','mixed')),
    created_at           TEXT NOT NULL,
    closed_at            TEXT
);

CREATE TABLE offer (
    offer_id               TEXT PRIMARY KEY,      -- OF-nnnnnn
    campaign_id            TEXT NOT NULL REFERENCES campaign(campaign_id),
    plan_id                TEXT NOT NULL,
    driver_id              TEXT NOT NULL,
    driver_status_at_offer TEXT NOT NULL CHECK (driver_status_at_offer IN ('online_idle','offline')),
    target_zone            INTEGER NOT NULL CHECK (target_zone BETWEEN 1 AND 30),
    from_zone              INTEGER NOT NULL CHECK (from_zone   BETWEEN 1 AND 30),
    distance_km            REAL    NOT NULL,
    eta_min                INTEGER NOT NULL,
    incentive_amount       INTEGER NOT NULL,
    reason_text            TEXT    NOT NULL,
    created_at             TEXT    NOT NULL,
    expires_at             TEXT    NOT NULL,
    status                 TEXT    NOT NULL CHECK (status IN ('Sent','Accepted','Declined','Expired','Cancelled'))
);
CREATE INDEX ix_offer_driver   ON offer(driver_id, status);
CREATE INDEX ix_offer_campaign ON offer(campaign_id);

CREATE TABLE driver_response (
    response_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    offer_id             TEXT NOT NULL REFERENCES offer(offer_id),
    driver_id            TEXT NOT NULL,
    decision             TEXT NOT NULL CHECK (decision IN ('accept','decline','expired')),
    decline_reason       TEXT,                    -- NULL hợp lệ — C-08
    responded_at         TEXT NOT NULL,
    response_latency_sec INTEGER NOT NULL,
    source               TEXT NOT NULL CHECK (source IN ('human_demo','simulated_model'))
);

-- Append-only ép ở tầng DB (§3.2 #5) — không tin vào kỷ luật code
CREATE TRIGGER trg_history_no_update BEFORE UPDATE ON history_record
BEGIN SELECT RAISE(ABORT, 'history_record la append-only'); END;
CREATE TRIGGER trg_history_no_delete BEFORE DELETE ON history_record
BEGIN SELECT RAISE(ABORT, 'history_record la append-only'); END;
CREATE TRIGGER trg_response_no_update BEFORE UPDATE ON driver_response
BEGIN SELECT RAISE(ABORT, 'driver_response la append-only'); END;
CREATE TRIGGER trg_response_no_delete BEFORE DELETE ON driver_response
BEGIN SELECT RAISE(ABORT, 'driver_response la append-only'); END;
```

> `offer.status` và `campaign.status` **được phép** UPDATE (state machine `Sent → Accepted` là chuyển trạng thái hợp lệ, §4.8). `history_record` và `driver_response` thì **không** — chúng là sổ cái. Mọi chuyển trạng thái offer đều sinh thêm một dòng `history_record` tương ứng, nên vẫn truy vết được đầy đủ.

---

## 5. `config/policy.yaml` — 19 key

**❌ File này CHƯA TỒN TẠI trên đĩa** dù là dependency cứng của `compute_baseline_no_action.py` và `generate_snapshots.py`. Đây là task chặn **T0.1** ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)).

Giữ nguyên nesting `rules.<key>.value` mà code hiện tại đang đọc (`policy["rules"]["min_supply_per_zone"]["value"]`).

```yaml
# config/policy.yaml — NGUỒN NGƯỠNG DUY NHẤT (§3.3)
# Cấm hard-code ngưỡng trong bất kỳ module nào. Thiếu 1 key ⇒ app crash lúc boot (fail-fast).
version: "1.0"
frozen_at: "2026-08-08"          # I-08 — sau mốc này chỉ thêm key mới, không đổi ngữ nghĩa key cũ

rules:
  # ---- Nhóm Optimizer / Hotspot (§3.3 bảng 1) ----
  min_supply_per_zone:
    value: 3
    unit: "xe"
    used_by: ["hotspot.detector", "optimizer.constraints", "activation.engine"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "Data-Checklist-Chot-Data.md 1.1"
    assumption: "ASSUMPTION-01"

  budget_cap:
    value: 500000
    unit: "VNĐ/plan"
    used_by: ["optimizer.greedy"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "SPEC §4.4 ví dụ JSON"
    assumption: "ASSUMPTION-02"

  max_distance:
    value: 7.0
    unit: "km"
    used_by: ["optimizer.constraints"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "đường chim bay ≈ 5km thực tế × travel_detour_factor 1.4"
    assumption: "ASSUMPTION-03"

  max_supply_move_pct:
    value: 0.40
    unit: "tỷ lệ 0–1"
    used_by: ["optimizer.constraints"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "Data-Checklist-Chot-Data.md 1.4"
    assumption: "ASSUMPTION-04"

  cooldown_minutes:
    value: 15
    unit: "phút"
    used_by: ["optimizer.constraints", "replay.engine"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "= 3 step replay"
    assumption: "ASSUMPTION-05"

  priority_zones:
    value: []
    unit: "list[int] 1–30"
    used_by: ["optimizer.greedy"]
    verified: false
    owner: "BA"
    due: "W3"
    src: "CHƯA CÓ — chờ BA xác nhận zone ưu tiên"
    assumption: "ASSUMPTION-06"

  deadhead_cost_per_km:
    value: 4000
    unit: "VNĐ/km"
    used_by: ["optimizer.greedy"]
    verified: false
    owner: "Data/BA"
    due: "W2"
    src: "SPEC §4.4: estimated_cost 126000 / deadhead 4.2km × 8 units ≈ 3750 → làm tròn 4000"
    assumption: "ASSUMPTION-07"

  avg_vehicle_speed_kmh:
    value: 25
    unit: "km/h"
    used_by: ["optimizer.greedy", "replay.engine", "activation.engine", "generator"]
    verified: true                # ✅ GIÁ TRỊ DUY NHẤT ĐÃ CHỐT
    owner: "Data/BA"
    src: "quyết định Data/BA 2026-08-04"

  # ---- Nhóm Activation / Khối C (§3.3 bảng 2) ----
  incentive_budget_cap:
    value: 1000000
    unit: "VNĐ/plan"
    used_by: ["activation.engine"]
    verified: false
    owner: "PM"
    due: "W3"
    src: "quyết định A-04 — trần ĐỘC LẬP với budget_cap, không bù trừ (C-09)"
    assumption: "ASSUMPTION-08"

  incentive_base:
    value: 20000
    unit: "VNĐ"
    used_by: ["activation.incentive"]
    verified: false
    owner: "Data/BA"
    due: "W3"
    src: "SPEC §4.8 ví dụ: 33000 = base + per_km × 4.2km"
    assumption: "ASSUMPTION-09"

  incentive_per_km:
    value: 3000
    unit: "VNĐ/km"
    used_by: ["activation.incentive"]
    verified: false
    owner: "Data/BA"
    due: "W3"
    src: "khớp ví dụ §4.8: 20000 + 3000×4.2 = 32600 → làm tròn 1.000đ = 33000 ✓"
    assumption: "ASSUMPTION-10"

  incentive_max_per_offer:
    value: 50000
    unit: "VNĐ"
    used_by: ["activation.incentive"]
    verified: false
    owner: "PM"
    due: "W3"
    src: "chặn zone xa đẩy thưởng lên vô lý; ở activation_radius_km=5 thì công thức cho tối đa 35000, trần này là biên an toàn"
    assumption: "ASSUMPTION-11"

  activation_radius_km:
    value: 5.0
    unit: "km"
    used_by: ["activation.engine"]
    verified: false
    owner: "Data/BA"
    due: "W3"
    src: "< max_distance 7.0 — tài xế tự nguyện đi ngắn hơn xe được điều"
    assumption: "ASSUMPTION-12"

  offer_ttl_minutes:
    value: 10
    unit: "phút"
    used_by: ["activation.engine"]
    verified: false
    owner: "PM"
    due: "W3"
    src: "= 2 step replay; SPEC §4.8 ví dụ 17:06:30 → 17:16:30"
    assumption: "ASSUMPTION-13"

  max_offers_per_driver_per_hour:
    value: 3
    unit: "offer/giờ"
    used_by: ["activation.engine"]
    verified: false
    owner: "PM"
    due: "W3"
    src: "chống spam tài xế (C-08)"
    assumption: "ASSUMPTION-14"

  overbooking_factor:
    value: 1.6
    unit: "hệ số"
    used_by: ["activation.engine"]
    verified: false
    owner: "Data/BA"
    due: "W3"
    src: "≈ 1 / assumed_accept_rate (1/0.6 = 1.67) → làm tròn xuống cho an toàn ngân sách"
    assumption: "ASSUMPTION-15"

  assumed_accept_rate:
    value: 0.6
    unit: "tỷ lệ 0–1"
    used_by: ["activation.engine", "ui.activation_preview"]
    verified: false
    owner: "PM"
    due: "W3"
    src: "GIẢ ĐỊNH THAM SỐ HÓA — C-07. Phải trình bày dạng phân tích độ nhạy 0.25/0.45/0.65, KHÔNG phải một con số"
    assumption: "ASSUMPTION-16"

  min_idle_before_activation:
    value: 3
    unit: "xe"
    used_by: ["activation.engine"]
    verified: false
    owner: "Data/BA"
    due: "W3"
    src: "= min_supply_per_zone — cùng tinh thần, không tạo hotspot mới ở zone nguồn"
    assumption: "ASSUMPTION-17"

  # ---- Key thêm mới (quyết định A-03) ----
  conservative_gap_mode:
    value: "p90_p50"              # p90_p50 | p90_p10
    unit: "enum"
    used_by: ["hotspot.detector"]
    verified: false
    owner: "AI"
    due: "W4"
    src: "SPEC §4.3 mục ⬜ CẦN CHỐT trước 09/08. Mặc định giữ nguyên v1.3; đo cả hai ở W4 rồi chốt bằng số"
    assumption: "ASSUMPTION-27"

# ---- Hằng dẫn xuất — KHÔNG phải ngưỡng vận hành, không thuộc 19 key ----
derived:
  rain_threshold_mm_h: 0.5        # ASSUMPTION-18 · ngưỡng regime `rain`
  heavy_rain_mm_h: 5.0            # ASSUMPTION-25 · ngưỡng "mưa to"
  travel_detour_factor: 1.4       # ASSUMPTION-26 · CÒN TREO — Data-Checklist 5.3b
  rain_travel_factor:             # §5.4 "nhân hệ số 1.3–1.5 khi rain vượt ngưỡng"
    moderate: 1.3                 # rain_threshold ≤ rain < heavy
    heavy: 1.5                    # rain ≥ heavy
```

### 5.1. Hợp đồng của loader `src/common/policy.py`

| Quy tắc | Hành vi |
|---|---|
| Thiếu 1 trong 19 key | **Crash lúc boot**, không chạy tiếp (§3.3 — nguồn ngưỡng **duy nhất**) |
| Key thừa không nằm trong 19 | Cảnh báo log, không crash (cho phép thử nghiệm) |
| Sai kiểu | Crash, nêu rõ key + kiểu mong đợi |
| Module gọi trực tiếp `yaml.safe_load` | **Cấm** — có test tĩnh grep `yaml.safe_load` ngoài `policy.py` |
| Hard-code ngưỡng trong module | **Cấm** — CLAUDE.md luật #2. Một ngoại lệ đang chờ chốt: `gap_ratio_threshold=0.3` trong `compute_baseline_no_action.py` — xem [§9.2 N1](#92-nợ-phát-sinh-sau-t04t06t07) |

---

## 6. Config Khối C

### 6.1. `config/driver_registry.json` — ✅ đã có (T0.6, 2026-08-09)

600 tài xế, schema §4.7 ([§2.7](#27-entity-driver-47--srccontractsdriverpy-)). Ràng buộc sinh:

| Ràng buộc | Giá trị |
|---|---|
| Tổng số tài xế | 600 `[ASSUMPTION-20]` — cần đủ ứng viên cho kịch bản mưa (30 zone × ~20 offer) |
| `is_demo_account` | `true` **toàn bộ**, không ngoại lệ (C-03) |
| `display_name` | `"Tài xế {n}"` — **cấm** tên người thật (§4.7) |
| Phân bố `home_zone` | Tỷ lệ thuận `population_density` của `zone_registry.json` |
| Tỷ lệ `offline` giờ cao điểm mưa | 25% `[ASSUMPTION-21]` — nếu quá thấp thì Khối C không có ứng viên; giả định "có lượng tài xế offline đủ lớn gần zone thiếu" đã ghi ở §9 spec |
| **Khớp A6** | `COUNT(online_idle, zone) == idle_supply` **100% mọi `ts_bucket`** (§4.7) |

Bản giao thỏa cả 6 dòng trên; test chặn ở `tests/test_driver_registry.py`, riêng ràng buộc A6 ở
`test_a6_khop_100_phan_tram` (0 dòng lệch trên toàn bộ `ts_bucket` × zone). Bộ sinh:
`generate_drivers.py`. Contract §4.7 kiểm bằng `src/contracts/driver.py`, và
`tests/test_contracts/test_producer_parity.py` validate **cả 600 bản ghi thật**, không lấy mẫu.

### 6.2. `config/driver_response.yaml` — ✅ đã có (T0.6, 2026-08-09)

Tham số hàm `p_accept` (§5.11). **Là giả định thô, không học từ dữ liệu thật** (C-07).

```yaml
# p_accept = clip(base_rate
#                 + w_incentive × (incentive_amount / incentive_max_per_offer)
#                 − w_distance  × (distance_km / activation_radius_km)
#                 − w_shift_end × is_near_shift_end,
#                 0.05, 0.95)
seed: 7                          # độc lập seed synthetic (train 42 / test 2026) và nowcast (13)
base_rate:   0.55                # ASSUMPTION-22 (đã hiệu chỉnh ở T0.6 — xem bên dưới)
w_incentive: 0.40                # ASSUMPTION-23
w_distance:  0.25                # ASSUMPTION-24
w_shift_end: 0.20                # ASSUMPTION-19
near_shift_end_minutes: 30       # is_near_shift_end = (shift_end_ts − t) ≤ 30 phút
clip: [0.05, 0.95]               # cứng theo §5.11, KHÔNG chỉnh
mode: "simulated"                # human | simulated | mixed  (§5.11)
```

**Kiểm tra hiệu chỉnh bắt buộc:** với offer trung vị (`incentive = 33.000đ`, `distance = 4.2km`, không sắp hết ca), `p_accept` phải ≈ `assumed_accept_rate = 0.6`:
`0.55 + 0.40×(33/50) − 0.25×(4.2/5) − 0 = 0.55 + 0.264 − 0.210 = 0.604` → lệch 0.004 ≤ 0.05 ✅

✅ **Đã đóng ở T0.6.** Bản đề xuất ban đầu để `base_rate = 0.35` cho ra `0.404` vs `0.600` — lệch 0.196. Hai cách đóng khoảng lệch: (a) nâng `base_rate` lên ≈0.55, (b) hạ `assumed_accept_rate` xuống 0.40. **Chọn (a)**, vì `assumed_accept_rate` đang được `overbooking_factor` tham chiếu (1/0.6 ≈ 1.67 → 1.6), đổi nó kéo theo phải tính lại trần ngân sách incentive; còn `base_rate` chưa có consumer nào. Muốn lật sang (b) thì phải đổi **cả hai** cùng lúc.

Vì sao không để lệch: `assumed_accept_rate` là con số **hiển thị ra UI** khi preview chiến dịch, `base_rate` là con số **quyết định kết quả mô phỏng** — lệch nhau nghĩa là preview nói một đằng, kết quả ra một nẻo. Test chặn: `tests/test_driver_registry.py::test_hieu_chinh_base_rate_khop_assumed_accept_rate`.

⏳ **Nợ chưa trả — `w_shift_end` hiện vô hiệu.** A6 để `shift_end_ts = null` cho toàn bộ 600 tài xế vì chưa có lịch ca nào trong tài liệu, nên `is_near_shift_end` **luôn false** và số hạng `− w_shift_end × …` không bao giờ kích hoạt. Tham số vẫn giữ trong file để công thức §5.11 đầy đủ. **Cần Data/BA cấp lịch ca** trước khi công bố bất kỳ số activation nào phụ thuộc yếu tố "sắp hết ca" — trước lúc đó, mọi kết luận về nhóm tài xế sắp hết ca đều không có căn cứ.

---

## 7. Tham số nowcast `rain_forecast_15/30`

**Vấn đề:** `generate_snapshots.py` hiện đọc thẳng `rain_series[i+3]` và `rain_series[i+6]` — tức là **dự báo hoàn hảo**. Model 1 sẽ học được luật *"`rain_forecast_15 > 0` ⟺ chắc chắn sắp mưa"*, làm MAPE ở `rain_peak` đẹp giả tạo và KPI "thắng baseline ≥20%" mất ý nghĩa.

**Công thức chốt (quyết định A-06):**

```
rain_forecast_15 = max(0.0, rain_true(t+15) × (1 + ε_rel_15) + ε_abs_15)
rain_forecast_30 = max(0.0, rain_true(t+30) × (1 + ε_rel_30) + ε_abs_30)

ε_rel_15 ~ N(0, 0.20)      ε_abs_15 ~ N(0, 0.20) mm/h
ε_rel_30 ~ N(0, 0.35)      ε_abs_30 ~ N(0, 0.40) mm/h
p_miss_15 = 0.05           p_miss_30 = 0.10       (bỏ sót TRỌN một sự kiện mưa)
seed_nowcast = 13          (độc lập seed train=42 / test=2026 → vẫn deterministic)
```

| Tham số | Giá trị | Mã |
|---|---|---|
| `sigma_rel_15` | 0.20 | `[ASSUMPTION-28]` |
| `sigma_abs_15` | 0.20 mm/h | `[ASSUMPTION-29]` |
| `sigma_rel_30` | 0.35 | `[ASSUMPTION-30]` |
| `sigma_abs_30` | 0.40 mm/h | `[ASSUMPTION-31]` |
| `p_miss_15` | 0.05 | `[ASSUMPTION-32]` |
| `p_miss_30` | 0.10 | `[ASSUMPTION-33]` |
| `seed_nowcast` | 13 | `[ASSUMPTION-34]` |

**Vì sao số hạng cộng là bắt buộc:** chỉ có nhiễu **nhân** thì `rain_true = 0 ⇒ forecast = 0` — model vẫn học được luật hoàn hảo "forecast > 0 ⟺ sắp mưa", chỉ là dự báo hoàn hảo trá hình. Số hạng cộng tạo ra **báo động giả** (forecast > 0 khi trời không mưa), là loại sai số thật của nowcasting.

**Vì sao có `p_miss`:** sai số Gaussian không mô phỏng được kiểu sai nguy hiểm nhất — **bỏ sót trọn một sự kiện mưa**. Khi rút trúng, toàn bộ sự kiện mưa bị đặt `forecast = 0` (không chỉ một step lẻ), buộc model học cách chịu đựng trường hợp mất tín hiệu ngoại sinh.

**Sàn `max(0, …)`:** lượng mưa âm không có nghĩa vật lý, và validator §4.1 đòi `rain_forecast_15/30 ≥ 0`.

Tham số này thuộc **generator**, ghi vào `config/generator.yaml → rain.nowcast`, **không** vào `policy.yaml` (không phải ngưỡng vận hành — module runtime không được đọc).

---

## 8. ASSUMPTION register

**Cách đọc:** mọi giá trị dưới đây là **đề xuất của tài liệu này**, không phải giá trị đã được Data/BA/PM xác nhận. Đây là bảng mang đi họp chốt.

**Trạng thái:** 🔴 chưa xác nhận · 🟡 đang chờ nguồn · 🟢 đã chốt

| Mã | Tham số | Giá trị đề xuất | Nguồn suy ra | Owner | Hạn | TT |
|---|---|---|---|---|---|---|
| ASSUMPTION-01 | `min_supply_per_zone` | 3 xe | Data-Checklist 1.1 | Data/BA | W2 | 🔴 |
| ASSUMPTION-02 | `budget_cap` | 500.000đ/plan | SPEC §4.4 ví dụ JSON | Data/BA | W2 | 🔴 |
| ASSUMPTION-03 | `max_distance` | 7.0 km | 5km chim bay × detour 1.4 | Data/BA | W2 | 🔴 |
| ASSUMPTION-04 | `max_supply_move_pct` | 0.40 | Data-Checklist 1.4 | Data/BA | W2 | 🔴 |
| ASSUMPTION-05 | `cooldown_minutes` | 15 phút (3 step) | suy từ bước replay | Data/BA | W2 | 🔴 |
| ASSUMPTION-06 | `priority_zones` | `[]` | **chưa có nguồn nào** | BA | W3 | 🟡 |
| ASSUMPTION-07 | `deadhead_cost_per_km` | 4.000đ/km | ngược từ ví dụ §4.4 | Data/BA | W2 | 🔴 |
| — | `avg_vehicle_speed_kmh` | **25 km/h** | quyết định Data/BA 2026-08-04 | Data/BA | — | 🟢 |
| ASSUMPTION-08 | `incentive_budget_cap` | 1.000.000đ/plan | quyết định A-04 (cam kết xấu nhất) | PM | W3 | 🔴 |
| ASSUMPTION-09 | `incentive_base` | 20.000đ | ngược từ ví dụ §4.8 | Data/BA | W3 | 🔴 |
| ASSUMPTION-10 | `incentive_per_km` | 3.000đ/km | ngược từ ví dụ §4.8 (33.000đ @ 4.2km) | Data/BA | W3 | 🔴 |
| ASSUMPTION-11 | `incentive_max_per_offer` | 50.000đ | biên an toàn | PM | W3 | 🔴 |
| ASSUMPTION-12 | `activation_radius_km` | 5.0 km | < `max_distance` | Data/BA | W3 | 🔴 |
| ASSUMPTION-13 | `offer_ttl_minutes` | 10 phút | ví dụ §4.8 | PM | W3 | 🔴 |
| ASSUMPTION-14 | `max_offers_per_driver_per_hour` | 3 | C-08 chống spam | PM | W3 | 🔴 |
| ASSUMPTION-15 | `overbooking_factor` | 1.6 | ≈ 1/`assumed_accept_rate` | Data/BA | W3 | 🔴 |
| ASSUMPTION-16 | `assumed_accept_rate` | 0.6 | **giả định tham số hóa** (C-07) | PM | W3 | 🔴 |
| ASSUMPTION-17 | `min_idle_before_activation` | 3 xe | = `min_supply_per_zone` | Data/BA | W3 | 🔴 |
| ASSUMPTION-18 | `rain_threshold_mm_h` | **0.5 mm/h** | quyết định A-05 | Data/BA | **W2 — chặn khóa baseline** | 🔴 |
| ASSUMPTION-19 | `w_shift_end` | 0.20 | Data-Checklist Phần 8B | Data/BA | W3 | 🔴 |
| ASSUMPTION-20 | Số tài xế demo | 600 | đủ ứng viên kịch bản mưa | Data/BA | W2 | 🔴 |
| ASSUMPTION-21 | Tỷ lệ `offline` khi mưa cao điểm | 25% | giả định §9 spec | Data/BA | W2 | 🔴 |
| ASSUMPTION-22 | `base_rate` | **0.55** | Data-Checklist Phần 8B, hiệu chỉnh T0.6 về `assumed_accept_rate` | Data/BA | W3 | 🔴 |
| ASSUMPTION-23 | `w_incentive` | 0.40 | Data-Checklist Phần 8B | Data/BA | W3 | 🔴 |
| ASSUMPTION-24 | `w_distance` | 0.25 | Data-Checklist Phần 8B | Data/BA | W3 | 🔴 |
| ASSUMPTION-25 | `heavy_rain_mm_h` | 5.0 mm/h | quyết định A-05 | Data/BA | W2 | 🔴 |
| ASSUMPTION-26 | `travel_detour_factor` | 1.4 | **CÒN TREO** — Data-Checklist 5.3b | Data/BA | W3 | 🟡 |
| ASSUMPTION-27 | `conservative_gap_mode` | `"p90_p50"` | quyết định A-03, đo cả hai ở W4 | AI | W4 | 🔴 |
| ASSUMPTION-28 | `sigma_rel_15` | 0.20 | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-29 | `sigma_abs_15` | 0.20 mm/h | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-30 | `sigma_rel_30` | 0.35 | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-31 | `sigma_abs_30` | 0.40 mm/h | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-32 | `p_miss_15` | 0.05 | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-33 | `p_miss_30` | 0.10 | quyết định A-06 | AI | W2 | 🔴 |
| ASSUMPTION-34 | `seed_nowcast` | 13 | độc lập seed 42/2026 | AI | W2 | 🔴 |

**Bổ sung ở T0.4** (2026-08-08) — tham số generator sinh ra khi trả nợ D4/D7. Tất cả nằm ở `config/generator.yaml`, **không** vào `policy.yaml` (tham số **sinh** dữ liệu, module runtime không được đọc):

| Mã | Tham số | Giá trị đề xuất | Nguồn suy ra | Owner | Hạn | TT |
|---|---|---|---|---|---|---|
| ASSUMPTION-35 | `demand_score_weights` | `{population: 0.40, building: 0.60}` | cầu bám mật độ tòa nhà (điểm đến) | Data/BA | W3 | 🔴 |
| ASSUMPTION-36 | `supply_score_weights` | `{population: 0.80, building: 0.20}` | cung bám mật độ dân cư (nơi tài xế đỗ chờ) | Data/BA | W3 | 🔴 |
| ASSUMPTION-37 | `base_demand_range` | `[3, 22]` chuyến/5 phút/zone | thay `tier_base_demand` chết (D6) | Data/BA | W3 | 🔴 |
| ASSUMPTION-38 | `base_supply_range` | `[3, 20]` | thay `tier_base_supply` chết (D6) | Data/BA | W3 | 🔴 |
| ASSUMPTION-39 | `hourly_curve_demand` | 24 hệ số, đỉnh 1.80 lúc 18h | D7 — thay `peak_multiplier_demand` | Data/BA | W3 | 🔴 |
| ASSUMPTION-40 | `hourly_curve_supply` | 24 hệ số, trễ pha và nông hơn cầu | D7 — tài xế phản ứng **sau** khi cầu lên | Data/BA | W3 | 🔴 |
| ASSUMPTION-41 | `rain.spatial.amplitude` | 0.55 | D4 — biên độ dải mưa quét | AI | W3 | 🔴 |
| ASSUMPTION-42 | `rain.spatial.rotation_period_hours` | 6.0 | D4 — chu kỳ quay của hướng dải mưa | AI | W3 | 🔴 |
| ASSUMPTION-43 | `rain.spatial.factor_range` | `[0.30, 1.70]` | D4 — kẹp để không sinh mưa âm hay đột biến | AI | W3 | 🔴 |

**Tổng: 43 assumption, 1 giá trị đã chốt (`avg_vehicle_speed_kmh`).**

Assumption chặn mốc I-08 (phải chốt **trước** khi khóa baseline): **ASSUMPTION-01, -18, -25, -28..-43**. ASSUMPTION-35..43 vào danh sách chặn vì chúng quyết định phân phối của A1 — baseline đã khóa ngày 2026-08-08 tính trên đúng bộ giá trị này, nên đổi bất kỳ dòng nào cũng buộc tính lại toàn bộ (§5.14.3). Các assumption còn lại chốt được ở W3 mà không ảnh hưởng baseline.

---

## 9. Nợ dữ liệu — 12 điểm lệch giữa tài liệu và đĩa

Ghi nhận, **không tự sửa** trong bước viết tài liệu. Xử lý ở T0 ([IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)).

**Trạng thái tính đến 2026-08-09 (sau T0.4, T0.6, T0.7):** **10/12 đã trả** — D1, D2, D3, D4, D5, D7, D9, D10, D11, D12 (riêng D3 và D10 là quyết định chốt của PM, không phải sửa code). **Còn treo: D6, D8.** Cả hai **không chặn W3**; D8 là khoản đắt nhất vì sửa nó buộc sinh lại A1 và tính lại baseline đã khóa. Nợ **mới phát sinh** trong lúc trả nợ cũ: xem [§9.2](#92-nợ-phát-sinh-sau-t04t06t07).

<a id="d1"></a>

| # | Lệch | Bằng chứng | Ảnh hưởng | Xử lý |
|---|---|---|---|---|
| **D1** | Snapshot trên đĩa là **CSV**, contract và cả 2 script root dùng **Parquet** | `data/snapshots/snapshot_test.csv` tồn tại; `compute_baseline_no_action.py:68` đọc `.parquet` | Script **không chạy được** | ✅ **ĐÃ TRẢ (T0.4)** — `data/snapshots/snapshot_{train,test}.parquet`. CSV chỉ còn `sample_snapshot_*.csv` (480 dòng, để đọc bằng mắt); không module nào đọc nó và nó **không** nằm trong danh sách khóa SHA-256 |
| **D2** | Thiếu cột `enroute_arrivals` (v1.3 **bắt buộc**, dù rỗng `[]`) | Header CSV: `ts_bucket,zone_id,demand_observed,idle_supply,enroute_supply,rain_mm_h,...` — không có cột này | Simulator §5.5 đọc từ đây; bất biến INV-3 không kiểm được | ✅ **ĐÃ TRẢ (T0.4)** — cột kiểu `list<struct<arrival_ts, eta_steps, units, source, from_zone>>`, khởi tạo `[]`. INV-3 nay kiểm được, và `src/contracts/snapshot.py` ép nó ở tầng contract |
| **D3** | Mưa lấy từ **NASA POWER 2025 thật**, trong khi §5.1 và quyết định 0.1 ghi "synthetic thuần 100%" | `generate_snapshots.py` đọc `data/external/rain_hanoi_2025.csv` | Mâu thuẫn tài liệu ↔ code — **không thể để cả hai** | ✅ **ĐÃ CHỐT 2026-08-08 (T0.4)** — PM chọn **giữ mưa thật, sửa tài liệu**. [SPEC §5.1](../SPEC-GSM14-NovaFour-Unified.md) đã đổi thành nguồn **lai**: `rain_mm_h` từ NASA POWER 2025 + biến thiên không gian và toàn bộ cột còn lại là synthetic. Lý do: chuỗi mưa synthetic không tái tạo được cụm mưa/thời lượng/phân bố cường độ, mà chính ba đặc tính đó quyết định số sự kiện `rain_peak` — thước đo thành công của dự án. C-02 không bị vi phạm: file mưa là input tĩnh trong repo, không gọi API lúc chạy |
| **D4** | Mưa **giống hệt ở cả 30 zone**, không có biến thiên không gian | Rain series broadcast chung | Hotspot do mưa nổi **đồng loạt toàn thành phố** → optimizer không có zone surplus để rút | ✅ **ĐÃ TRẢ (T0.4)** — `generator.yaml → rain.spatial`: mô hình dải mưa quét, `factor(zone,t) = clip(1 + 0.55·u, 0.30, 1.70)` với hướng quay chu kỳ 6h. Trung bình 30 zone = 1 nên **tổng lượng mưa toàn thành phố vẫn khớp NASA**; chỉ phân bố không gian đổi. Tất định từ toạ độ, **không cần seed riêng** |
| **D5** | `splits.yaml` fold **01–02/2026**, dữ liệu sinh ra **06–07/2026** — không giao nhau | `data/splits.yaml` vs `snapshot_test.csv` dòng đầu `2026-07-13` | Walk-forward trỏ vào dữ liệu **không tồn tại**; `data/test_set/` cũng chưa có | ✅ **ĐÃ TRẢ (T0.4)** — dải thật `train 2026-08-14..09-24`, `test 2026-09-25..10-01` (bám cửa sổ mưa NASA để giữ đúng mùa vụ); 3 fold walk-forward nằm **trọn trong train**, bộ test đóng băng không bị chạm khi tune. `data/test_set/` đã sinh |
| **D6** | `tier_base_demand/supply` trong `generator.yaml` **không được đọc** | Code dùng `0.6·pop_norm + 0.4·building_density` | **Config chết**, gây hiểu nhầm khi tune | ⏳ **CÒN TREO** — T0.4 thay bằng `demand_score_weights`/`base_demand_range` (ASSUMPTION-35..38) nhưng **giữ nguyên** hai key cũ kèm cảnh báo inline. Cần PM/BA quyết: **xóa hẳn** hay dùng thật. Xóa là thay đổi `generator.yaml` → phải xác nhận không ai đang tune theo chúng |
| **D7** | Không có đường cong theo giờ — demand chỉ đổi theo `peak_flag` | `generate_snapshots.py` | `hour_of_day` gần như vô nghĩa; **baseline hist-avg mất phần lớn sức mạnh** → KPI "thắng baseline ≥20%" thành thắng dễ giả tạo | ✅ **ĐÃ TRẢ (T0.4)** — `hourly_curve_demand`/`_supply` 24 hệ số (ASSUMPTION-39/40), tự chuẩn hóa về trung bình 1. `peak_multiplier_*` **đã bỏ**: nhân 1.8 cầu và 0.85 cung đúng 4 giờ cao điểm tạo thiếu cung hệ thống ở **mọi** zone → hotspot rate `rain_peak` bão hòa 0.99986 |
| **D8** | Nhiễu **Gaussian**, checklist 3.3 đề xuất **Poisson** | `noise_std_pct: 0.15` | Sàn MAPE ≈ 12% → mục tiêu <15% rất sát, không còn biên | ⏳ **CÒN TREO** — vẫn Gaussian `0.15`. **Không sửa được nữa mà không trả giá:** đổi phân phối nhiễu là đổi phân phối A1, buộc sinh lại snapshot và **tính lại toàn bộ baseline đã khóa** ngày 2026-08-08 (§5.14.3). Quyết định thuộc PM: chấp nhận biên MAPE hẹp, hay chịu một đợt khóa lại |
| **D9** | Tổng đội xe **không được bảo toàn** (mỗi zone sinh độc lập) | `generate_snapshots.py` | Ràng buộc cứng A6 (`COUNT(online_idle) == idle_supply`) khó thỏa | ✅ **ĐÃ TRẢ (T0.6)** — A6 sinh **ngược từ** `idle_supply` của A1 đã khóa thay vì sinh độc lập rồi mong khớp. Test `tests/test_driver_registry.py::test_a6_khop_100_phan_tram`: 0 dòng lệch trên toàn bộ `ts_bucket` × zone |
| **D10** | `zone_registry.json` dùng `lat`/`lng`, spec §4 nói `zone_lat`/`zone_lng`; tier `high/medium/low` vs checklist `busy/medium/quiet` | File thật có thêm 6 field load-bearing: `area_km2`, `population_k`, `population_density`, `radius_m`, `building_count`, `building_density` | Tên field không khớp tài liệu | ✅ **ĐÃ CHỐT — theo file thật.** Tên chuẩn là `lat`/`lng`, tier `high/medium/low`; 6 field trên là một phần contract A5 (`population_density` quyết định phân bố `home_zone` §6.1, `building_density` vào `demand_score_weights`). Mọi tài liệu và code dùng tên này, **không** đổi file cho khớp spec |
| **D11** | `rain_intensity_mm_h_range: [2,25]` khai trong config nhưng mưa thật max **5.58 mm/h** | `generator.yaml` vs dữ liệu NASA POWER | Config sai lệch thực tế; ngưỡng `heavy_rain_mm_h = 5.0` gần như không bao giờ chạm | ✅ **ĐÃ TRẢ (T0.4)** — `rain_intensity_mm_h_range: [0.0, 9.2]`, đúng dải quan sát của hai cửa sổ đang dùng (đỉnh **9.19 mm/h** > `heavy_rain_mm_h = 5.0`, nên ngưỡng mưa to **có** chạm tới). Key này giờ chỉ còn nhánh fallback synthetic thuần đọc |
| **D12** | `splits.yaml` ghi `rain_peak_events_verified: 41` — là **số step**, không phải số **sự kiện**; §5.14.1 đòi ≥2 *sự kiện* mà chưa ai định nghĩa "sự kiện" | `data/splits.yaml:27` | **Acceptance không kiểm được** | ✅ **ĐÃ TRẢ (T0.4)** — định nghĩa chốt: **một sự kiện = một chuỗi `ts_bucket` liên tiếp có ít nhất một zone ở regime `rain_peak`**; chuỗi đứt khi không zone nào `rain_peak`. Test set: **13 sự kiện** (≥ 2 ✅) trên 256 step; train 34 sự kiện. Đếm bằng `count_rain_peak_events()` |

**D1, D2, D3, D5 + quyết định A-05 (ngưỡng mưa 0.5) + A-06 (nowcast) đều buộc sinh lại A1 và tính lại baseline.** Gộp làm **một đợt duy nhất**, xong **trước** khi ký `BASELINE_FREEZE.md` — §5.14.3 #2 quy định sau khi khóa, mọi thay đổi quy ước tính đều là thay đổi contract và phải tính lại toàn bộ số liệu đã công bố.

### 9.1. Baseline — ✅ đã đạt chuẩn §5.14.1 (khóa 2026-08-08)

Sáu dòng dưới đây từng là ❌ toàn bộ. T0.3 (`metrics.py`) + T0.4 (sinh lại A1, tính lại baseline) đã đóng cả sáu; `data/baseline/BASELINE_FREEZE.md` ký ngày **2026-08-08T22:57:55+07:00**.

| §5.14.1 đòi | Có? | Bằng chứng |
|---|---|---|
| `unmet_demand` | ✅ | `no_action_summary.json → overall.unmet_demand = 65 027.0` |
| `avg_wait_proxy` (trung bình có trọng số theo demand) | ✅ | `overall.avg_wait_proxy = 4.83395` |
| `est_cancel_rate` (trung bình có trọng số của cancel rate từng zone) | ✅ | `overall.est_cancel_rate = 0.249867` |
| `data/baseline/no_action_metrics.parquet` | ✅ | 60 480 dòng, SHA-256 `1efdbb0b…3b363` |
| `BASELINE_FREEZE.md` (ngày khóa, người khóa, **hash `metrics.py`**, seed, SHA-256) | ✅ | `git_blob_sha1(src/simulation/metrics.py) = 82f41b85…70d0` |
| Regime tagging dùng ngưỡng đã chốt | ✅ | `rain_threshold_mm_h = 0.5`, gắn nhãn bằng `src/common/regime.py` |

Số liệu 4 regime sau khi tính lại (60 480 step = 2 016 `ts_bucket` × 30 zone):

| Regime | n_steps | unmet_demand | avg_wait_proxy | est_cancel_rate | avg_gap | hotspot_rate |
|---|---:|---:|---:|---:|---:|---:|
| `normal` | 19 488 | 11 995.0 | 3.873713 | 0.198611 | −0.271449 | 0.375975 |
| `peak` | 3 344 | 8 451.0 | 5.382745 | 0.286383 | 1.933313 | 0.269737 |
| `rain` | 30 912 | 17 352.0 | 3.542100 | 0.179952 | −0.761290 | 0.265334 |
| **`rain_peak`** | **6 736** | **27 229.0** | **8.595921** | **0.448878** | **3.831651** | **0.615647** |

Điểm đáng chú ý: `rain_peak` chỉ chiếm 11.1% số step nhưng gánh **41.9% tổng unmet demand**, và ba metric của nó đều xấu hơn `normal` rõ rệt — đúng đặc tính cần có để `rain_peak` làm thước đo thành công chính (§3 #6).

Quan trọng hơn, **hotspot rate `rain_peak` xuống 0.615647** từ mức bão hòa 0.99986 của bản trước. Bản cũ hỏng vì hai nguyên nhân cộng dồn, cả hai đã sửa ở T0.4:

- Regime gắn bằng `rain_mm_h > 0` thay vì `≥ 0.5` → `normal` chỉ còn 14 400/60 480 step (23.8%), `rain` phình lên 36 000 (59.5%).
- `peak_multiplier_demand: 1.8` × `peak_multiplier_supply: 0.85` áp đồng loạt 4 giờ cao điểm → **mọi** zone thiếu cung cùng lúc (D7), không còn zone surplus nào để optimizer rút xe.

Ở mức 0.99986, so sánh `plan_only` với `no_action` là so hai con số bằng nhau — KPI #3 "giảm hotspot rate ≥ 20%" sẽ không thể đạt dù thuật toán có tốt đến đâu, vì không còn chỗ để cải thiện. Đó là lý do §5.14.3 buộc tính lại **trước** khi ký, không phải sau.

> Thiếu commit hash thì "khóa" là vô nghĩa: sửa công thức về sau sẽ âm thầm làm lệch mọi so sánh mà không ai phát hiện (§5.14.1). `BASELINE_FREEZE.md` nằm trong danh sách **cấm sửa** ở [CLAUDE.md §13.1](../../CLAUDE.md#131-tuyệt-đối-cấm--không-sửa-kể-cả-khi-được-yêu-cầu-chung-chung) — muốn đổi baseline thì tính lại và ký bản mới, không sửa bản cũ.

### 9.2. Nợ phát sinh sau T0.4/T0.6/T0.7

Ba khoản dưới đây **không** nằm trong D1–D12 gốc — chúng sinh ra trong lúc trả nợ cũ. Ghi ở đây để không ai phải phát hiện lại lần nữa.

| # | Nợ | Ở đâu | Vì sao chưa xử lý | Cần ai quyết |
|---|---|---|---|---|
| **N1** | `gap_ratio_threshold = 0.3` **hard-code**, không có key trong `policy.yaml` | [compute_baseline_no_action.py:38](../../compute_baseline_no_action.py#L38) | Đây là ngưỡng định nghĩa "zone bị coi là hotspot" khi tính `hotspot_rate` của baseline. Thêm nó vào `policy.yaml` sẽ thành **key thứ 20**, mà "19 key" đang được viết cứng ở §5, [ARCHITECTURE.md](ARCHITECTURE.md), [CLAUDE.md §3 #2](../../CLAUDE.md#3-luật-cứng--vi-phạm-là-làm-hỏng-kết-quả) và trong test `test_policy.py`. Đổi số 19 sau khi baseline đã khóa là đổi contract | **PM** — hai lựa chọn: (a) thêm key thứ 20 + sửa mọi chỗ ghi "19 key" + **tính lại baseline** (§5.14.3), hoặc (b) giữ nguyên và ghi nhận đây là hằng số của **script tính baseline**, không phải ngưỡng vận hành của pipeline |
| **N2** | `w_shift_end: 0.20` trong `driver_response.yaml` hiện **vô hiệu** | [config/driver_response.yaml](../../config/driver_response.yaml), §6.2 | Cả 600 tài xế đều có `shift_end_ts = null` (Data/BA chưa cấp lịch ca), nên nhánh "sắp hết ca" không bao giờ kích hoạt. Mô hình phản hồi thực tế chỉ chạy trên 2/3 hệ số | **Data/BA** — cấp lịch ca thật, hoặc chốt bỏ hẳn `w_shift_end` và hiệu chỉnh lại `base_rate` cho khớp `assumed_accept_rate = 0.6` |
| **N3** | `docs/SPEC-AI-Agent-Phan-Bo-Xe-Gio-Cao-Diem.md` được tham chiếu nhưng **không có trên đĩa** | [CLAUDE.md:33](../../CLAUDE.md), `SPEC-GSM14-NovaFour-Unified.md:26` và `:1186` | Đây là SPEC v1.0 đã bị v1.3 thay thế. Ba chỗ tham chiếu đều nói rõ "chỉ tra cứu, không làm căn cứ" nên **không chặn việc gì** — nhưng link chết vẫn là link chết | **PM** — khôi phục file để tra cứu lịch sử, hoặc gỡ ba tham chiếu |

Không khoản nào chặn W3. N1 là khoản duy nhất có thể phải trả bằng một đợt tính lại baseline, nên nên chốt sớm.
