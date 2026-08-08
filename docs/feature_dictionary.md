# Feature Dictionary — Model Input/Output
**Dự án:** MVP AI Agent điều phối xe theo zone
**Phạm vi:** 1 loại xe, 30 zone, time step 5 phút, forecast horizon 15–30 phút
**Liên quan:** T-006 (Snapshot schema + Policy), US-001
**Trạng thái:** Draft — cần nhóm trưởng chốt trước Sprint 4
**Cập nhật 2026-08-04 (v1.1):** bổ sung **mục 3B — Activation Engine (Khối C)** và quyết định 6–8, theo quyết định nhóm thêm **UI tài xế (Driver App)**.
**Cập nhật 2026-08-06 (v1.3, đồng bộ [SPEC](SPEC-GSM14-NovaFour-Unified.md) v1.3):** bổ sung 6 field cho bài toán điều phối/tối ưu — `rain_fc30_x_peak` (Model 1 input), `supply_p10/p90` (Model 1 output), `idle_supply_current` + `cooldown_until_ts` (Model 2 output → Model 3 input), `driver_status_at_offer` (Activation Offer), `enroute_arrivals` với `arrival_ts`/`eta_steps` (snapshot).

---

## 0. Ràng buộc bài toán (bám theo mục tiêu dự án)

| Ràng buộc | Giá trị | Ảnh hưởng đến feature |
|---|---|---|
| Số zone | 30 | `zone_id` là categorical 1–30, không phải free text |
| Loại xe | 1 loại duy nhất | Không cần feature phân loại xe — output đơn giản hóa (chỉ tính "units", không cần "unit_type") |
| Time step snapshot | 5 phút | Mọi feature lịch sử phải align theo bội số 5 phút |
| Forecast horizon | 15–30 phút | = 3–6 bước snapshot về tương lai |
| Hotspot recall mục tiêu | ≥80% | Output Model 2 cần đủ granularity để tính recall (so với ground truth) |
| Plan generation time | ≤5 giây | Input Model 3 không nên quá nặng (tránh feature engineering phức tạp real-time) |
| Giảm nhu cầu mô phỏng | ≥20% | Output cần có "before/after" để đo tác động |
| 100% quyết định lưu lịch sử | — | Mọi output (đặc biệt Model 3 + HITL) cần `plan_id`, `timestamp`, `status` để audit (Sprint 8) |

---

## 1. Model 1 — Forecasting (Sprint 4)
**Mục tiêu:** Dự báo supply/demand tại t+15 và t+30 phút cho từng zone.

### Input
| Feature | Nguồn | Kiểu | Ghi chú |
|---|---|---|---|
| `zone_id` | snapshot | int (1–30) | |
| `ts_bucket` | snapshot | datetime | mốc 5 phút hiện tại (t0) |
| `hour_of_day`, `day_of_week` | derive từ `ts_bucket` | int | feature thời gian, KHÔNG dùng raw timestamp trực tiếp |
| `supply_count[t-N..t0]` | snapshot lịch sử | array[int] | lookback window — **cần chốt N (số bước)** |
| `demand_count[t-N..t0]` | snapshot lịch sử | array[int] | |
| `avg_wait_time_sec` | snapshot | float | ❌ **KHÔNG có trong A2** — đã chốt loại ([Data-Contract A2](Data-Contract-Data-AI.md)) |
| `avg_distance_km` | snapshot | float | ❌ **KHÔNG có trong A2** — đã chốt loại |
| `price_index` | snapshot | float | ❌ **KHÔNG dùng làm feature** (quyết định 2026-08-04, [DataBA-Decisions mục 2](DataBA-Decisions.md)) — giữ field trong snapshot cho tương lai |
| `zone_lat`, `zone_lng` | snapshot | float | ❌ **KHÔNG dùng** — feature lân cận đã chốt loại (quyết định #2) |
| `rain_x_peak` | derive | float | `rain_mm_h × peak_flag` — **bắt buộc** |
| `rain_fc15_x_peak` | derive | float | `rain_forecast_15 × peak_flag` — **bắt buộc** |
| `rain_fc30_x_peak` | derive | float | `rain_forecast_30 × peak_flag` — **bắt buộc, mới v1.3.** Trước đó horizon 30 không có feature tương tác nào |

- **Lookback window N = 6 bước (30 phút)** — đủ bắt trend ngắn hạn, giữ feature vector gọn, phù hợp giai đoạn data synthetic còn ít (Sprint 3).
- **KHÔNG dùng feature zone lân cận ở bản MVP** — tránh tăng độ phức tạp, giữ khả năng giải thích (phục vụ HITL Sprint 7). Có thể mở rộng ở bản sau nếu recall không đạt mục tiêu.

### Output
| Field | Kiểu | Ghi chú |
|---|---|---|
| `zone_id` | int | |
| `forecast_ts` | datetime | t+15 hoặc t+30 |
| `horizon_min` | int | 15 hoặc 30 |
| `predicted_demand` | float | điểm dự báo (p50) |
| `predicted_supply` | float | điểm dự báo (p50) |
| `demand_p10`, `demand_p90` | float | **bắt buộc** (quyết định PM 2026-08-04) — chế độ thận trọng `rain_peak` dùng `demand_p90` |
| `supply_p10`, `supply_p90` | float | **bắt buộc, mới v1.3** — train trên `target_supply_15/30` đã có ở A3, **không phát sinh label mới**. Thiếu xe nặng nhất là khi cầu cao *và* cung thấp cùng lúc; dùng `demand_p90` với supply p50 là mới thận trọng một nửa |
| `confidence` | float (0–1) | optional — **để `null` ở MVP** (quyết định #5) |

---

## 2. Model 2 — Hotspot Detection (Sprint 4)
**Mục tiêu:** Xác định zone nào thiếu cung nghiêm trọng (hotspot), phục vụ chỉ số **recall ≥80%**.

### Input
| Feature | Nguồn | Kiểu | Ghi chú |
|---|---|---|---|
| `zone_id` | Model 1 output | int | |
| `forecast_ts`, `horizon_min` | Model 1 output | datetime, int | |
| `predicted_demand` | Model 1 output | float | |
| `predicted_supply` | Model 1 output | float | |
| `min_supply_per_zone` | policy.yaml | int | ngưỡng tối thiểu — dùng làm điều kiện hotspot |

### Output
| Field | Kiểu | Ghi chú |
|---|---|---|
| `zone_id` | int | |
| `forecast_ts` | datetime | |
| `is_hotspot` | boolean | `true` nếu gap vượt ngưỡng |
| `gap` | float | `predicted_demand - predicted_supply` |
| `severity_score` | float | dùng để rank ưu tiên xử lý (Model 3 dùng lại) |
| `idle_supply_current` | int | **Mới v1.3** — `idle_supply` **thực tế tại t** lấy thẳng từ snapshot, **không phải dự báo**. Có ở cả `hotspots[]` và `surplus_zones[]`. Model 3 bắt buộc cần: `max_supply_move_pct` và `min_supply_per_zone` áp trên cung hiện có, mà `surplus` là hiệu hai số dự báo nên không suy ngược ra được |
| `cooldown_until_ts` | datetime \| null | **Mới v1.3** — chỉ có ở `surplus_zones[]` (cooldown chỉ ràng buộc zone nguồn). `null` = không bị khóa. **Do pipeline điền, không phải Model 2 tính** — Model 2 chỉ truyền qua |

```
Công thức:
is_hotspot = (predicted_supply < min_supply_per_zone)
             OR (gap / predicted_demand >= 0.3)
severity_score = gap / (predicted_demand + ε)
```
Lý do: tận dụng lại `min_supply_per_zone` sẵn có trong `policy.yaml` (nhất quán, không phát sinh số liệu tùy ý), kết hợp thêm điều kiện thiếu hụt tương đối ≥30% để không bỏ sót zone lớn — giúp đạt mục tiêu recall ≥80%.

---

## 3. Model 3 — Relocation Optimizer (Sprint 5)
**Mục tiêu:** Tạo relocation plan trong ≤5 giây, tuân thủ policy.

### Input
| Feature | Nguồn | Kiểu | Ghi chú |
|---|---|---|---|
| Danh sách hotspot (`zone_id`, `gap`, `severity_score`, `idle_supply_current`) | Model 2 output | list | zone cần bổ sung cung |
| Danh sách zone dư cung (`zone_id`, `surplus`, **`idle_supply_current`**, **`cooldown_until_ts`**) | Model 2 output (4.3) | list | zone có thể điều xe đi. **v1.3:** hai field mới là điều kiện để kiểm được `max_supply_move_pct`, `min_supply_per_zone` và `cooldown_minutes` — trước đó ba ràng buộc này có key trong policy nhưng **không có dữ liệu nào để đối chiếu** |
| `budget_cap` | policy.yaml | float | |
| `max_distance` | policy.yaml | float (km) | |
| `min_supply_per_zone` | policy.yaml | int | zone nguồn không được điều xuống dưới ngưỡng này |
| `max_supply_move_pct` | policy.yaml | float (%) | |
| `cooldown_minutes` | policy.yaml | int | loại trừ zone vừa mới được điều chỉnh |
| `priority_zones` | policy.yaml | list[int] | ưu tiên xử lý trước khi hết budget |
| `zone_lat`, `zone_lng` (tất cả zone) | snapshot | float | tính khoảng cách for `max_distance` |

### Output (Relocation Plan)
| Field | Kiểu | Ghi chú |
|---|---|---|
| `plan_id` | UUID | phục vụ audit trail (Sprint 8) |
| `created_at` | datetime | |
| `from_zone` | int | |
| `to_zone` | int | |
| `units_to_move` | int | 1 loại xe → chỉ 1 số lượng, không cần phân loại |
| `estimated_cost` | float | so với `budget_cap` |
| `estimated_distance_km` | float | so với `max_distance` |
| `before_gap` | float | dùng cho mô phỏng trước–sau (Sprint 6) |
| `after_gap` | float (dự kiến) | dùng cho mô phỏng trước–sau |
| `explanation` | string | lý do đề xuất, phục vụ HITL (Sprint 7) |
| `status` | enum | `proposed` \| `approved` \| `edited` \| `rejected` — cập nhật khi người vận hành thao tác |

**Sử dụng thuật toán Greedy theo severity**
Logic: sắp xếp hotspot theo `severity_score` giảm dần → với mỗi hotspot, tìm zone dư cung gần nhất trong `max_distance` → trừ dần `budget_cap` → không cho zone nguồn xuống dưới `min_supply_per_zone`.
Lý do: 30 zone/1 loại xe là bài toán nhỏ, greedy đủ tốt và đảm bảo chạy dưới ngưỡng **≤5 giây**; không dùng LP/ILP để tránh rủi ro tiến độ Sprint 5 và giữ khả năng giải thích quyết định cho người vận hành (HITL).

---

## 3B. Activation Engine (Khối C — mới v1.1, Sprint 7–8)
**Mục tiêu:** Từ `residual_gap` của plan đã approve, sinh offer incentive nhắm tới tài xế cụ thể; thu phản hồi Nhận/Từ chối và cập nhật supply mô phỏng.
**Nguồn:** quyết định nhóm 2026-08-04 — bổ sung UI tài xế. Chi tiết: [SPEC mục 5.11 + 5.13](SPEC-GSM14-NovaFour-Unified.md).

### Input
| Feature | Nguồn | Kiểu | Ghi chú |
|---|---|---|---|
| `residual_gap[]` (`zone_id`, `gap_remaining`) | Model 3 output | list | phần thiếu relocation không phủ được |
| `driver_id`, `current_zone`, `status`, `minutes_to_shift_end` | `driver_states` (bộ A6) | — | ứng viên; `status ∈ {online_idle, online_busy, offline}` |
| `home_zone` | `driver_registry.json` | int 1–30 | vị trí dùng khi tài xế `offline` |
| `incentive_base`, `incentive_per_km`, `incentive_max_per_offer` | policy.yaml | float | tính mức thưởng |
| `incentive_budget_cap` | policy.yaml | float | **trần độc lập** với `budget_cap` |
| `activation_radius_km`, `offer_ttl_minutes`, `max_offers_per_driver_per_hour`, `overbooking_factor`, `min_idle_before_activation` | policy.yaml | — | ràng buộc phát hành offer |
| `zone_lat`, `zone_lng` | zone_registry | float | haversine tính khoảng cách/ETA |

### Output (Activation Offer)
| Field | Kiểu | Ghi chú |
|---|---|---|
| `offer_id` | string `OF-nnnnnn` | khóa chính |
| `campaign_id` | string | gom offer cùng 1 plan — dùng tính accept rate |
| `plan_id` | UUID | nối với plan, HITL và audit trail |
| `driver_id` | string | 1 offer = 1 tài xế × 1 zone đích |
| `driver_status_at_offer` | enum | **Mới v1.3** — `online_idle \| offline`, **đóng băng lúc phát hành**. Quyết định accept làm *tăng tổng cung* (`offline`) hay chỉ *dịch chuyển cung* (`online_idle` → trừ zone nguồn). Không tra lại `driver_states` lúc tài xế bấm Nhận: offer sống 2 step, trạng thái đổi được trong khoảng đó → phá tính deterministic |
| `target_zone`, `from_zone` | int 1–30 | |
| `distance_km`, `eta_min` | float, int | haversine + `avg_vehicle_speed_kmh` |
| `incentive_amount` | float | `min(base + per_km × dist, max_per_offer)` |
| `reason_text` | string | **template Lớp 1, không dùng LLM** — văn bản đi kèm cam kết tiền |
| `expires_at` | datetime | `created_at + offer_ttl_minutes` |
| `status` | enum | `Sent \| Accepted \| Declined \| Expired \| Cancelled` |

### Output (Driver Response)
`offer_id`, `driver_id`, `decision` (`accept \| decline`), `decline_reason` (optional — **không bắt buộc**), `responded_at`.

**Thuật toán: Greedy theo severity zone** (cùng tinh thần Model 3). Ứng viên xếp hạng **`offline` trước `online_idle`** — kéo tài xế offline về làm *tăng tổng cung*, trong khi rút tài xế `online_idle` chỉ là relocation tự nguyện và có thể tạo hotspot mới ở zone nguồn.

**Mô hình phản hồi mô phỏng** (cần cho backtest, C-06): hàm tuyến tính 4 tham số có clip `[0.05, 0.95]`, RNG có seed cố định — xem [DataBA-Decisions mục 7](DataBA-Decisions.md) và [Data-Checklist Phần 8B](Data-Checklist-Chot-Data.md). **Là giả định, không học từ dữ liệu thật (C-07).**

---

## 4. Quyết định kỹ thuật đã chốt (tóm tắt — để build mock data)

| # | Quyết định | Giá trị |
|---|---|---|
| 1 | Lookback window Model 1 | N = 6 bước (30 phút) |
| 2 | Feature zone lân cận | Không dùng ở MVP |
| 3 | Công thức hotspot | `predicted_supply < min_supply_per_zone` HOẶC `gap/predicted_demand ≥ 0.3` |
| 4 | Thuật toán Model 3 | Greedy theo `severity_score`, ràng buộc theo policy.yaml |
| 5 | `confidence` ở Model 1 | Bỏ qua ở bản MVP (field optional, để `null`) — bổ sung nếu có thời gian sau Sprint 6 |
| **6** | **Thuật toán Activation Engine** (mới v1.1) | Greedy theo severity zone, ưu tiên ứng viên `offline` trước `online_idle` |
| **7** | **Mô hình phản hồi tài xế** (mới v1.1) | Hàm tuyến tính 4 tham số + clip `[0.05, 0.95]`, seed cố định — **giả định, không học từ dữ liệu** |
| **8** | **Văn bản gửi tài xế** (mới v1.1) | Chỉ template Lớp 1, **không dùng LLM** — vì đi kèm cam kết tiền thưởng |

Các quyết định 1–5 do team Data chốt dựa trên ràng buộc MVP (6 tuần, plan ≤5s, recall ≥80%, cần giải thích được cho HITL) — không cần leader duyệt lại, chỉ thông báo để đồng bộ tiến độ.
Quyết định 6–8 phát sinh từ **quyết định nhóm 2026-08-04** (bổ sung UI tài xế); tham số cụ thể còn chờ Data chốt tại [Data-Checklist Phần 1B + Phần 8](Data-Checklist-Chot-Data.md) trước cuối W2.

---

## 5. Ghi chú liên kết
- Field trong Model 1/2/3 input phần lớn kế thừa trực tiếp từ **snapshot_schema** (T-006) — không phát sinh field mới ngoài dự kiến.
- **v1.3 (2026-08-06):** snapshot bổ sung `enroute_arrivals[]` = `{arrival_ts, eta_steps, units, source, from_zone}`. `enroute_supply` giữ nguyên làm số tổng (`= Σ units`) nhưng **không còn là nguồn sự thật về thời điểm xe khả dụng** — Simulator đọc `enroute_arrivals`. Trong dữ liệu A1 do generator sinh, cột này luôn rỗng `[]`; chỉ runtime mới điền.
- Toàn bộ ngưỡng policy dùng **nguyên bảng `policy.yaml`** đã build (**18 key từ v1.1**: 8 gốc + 10 nhóm activation), không tạo policy riêng cho từng module.
- `plan_id` + `status` là điểm nối quan trọng với Sprint 7 (HITL) và Sprint 8 (audit trail) — cần giữ nguyên field này xuyên suốt pipeline. **`campaign_id` + `offer_id` (v1.1) đóng vai trò tương tự cho Khối C.**
- **Activation Engine (3B) dùng bộ dữ liệu A6** (`driver_registry.json` + `driver_states/`), phải **dẫn xuất từ A1** chứ không sinh song song — xem [Data-Contract-Data-AI.md](Data-Contract-Data-AI.md).
