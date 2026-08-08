# API_CONTRACT.md — GSM-14 · NovaFour

> **Nguồn sự thật:** [docs/SPEC-GSM14-NovaFour-Unified.md](../SPEC-GSM14-NovaFour-Unified.md) v1.3.
> **Lưu ý quan trọng:** spec **không có** REST API surface — spec chỉ chốt 9 message contract (§4.1–4.9, *cái gì đi qua dây*), không chốt *ai gọi ai*. Toàn bộ endpoint dưới đây là **thiết kế mới** (quyết định A-07, [ARCHITECTURE.md §9](ARCHITECTURE.md#9-quyết-định-kiến-trúc-spec-để-trống--chốt-ở-đây)). Mỗi endpoint đều truy ngược được về một FR/§ ở cột "Neo spec" — **không endpoint nào thêm chức năng mới**.
> Schema thân request/response là các entity §4.1–4.9, đặc tả field đầy đủ ở [DATA_CONTRACT.md](DATA_CONTRACT.md).

---

## 1. Quy ước chung

| Hạng mục | Chốt |
|---|---|
| Base URL | `/api/v1` |
| Content-Type | `application/json; charset=utf-8` |
| Datetime | ISO-8601 có offset, luôn `+07:00` (`config/generator.yaml → time.timezone`) |
| Tiền | số nguyên VNĐ (không phải chuỗi, không phần thập phân) |
| `zone_id` | int 1–30 (§4 quy ước chốt) |
| Phân trang | `?limit` (mặc định 50, tối đa 500) + `?offset` — chỉ ở `GET /history` |
| Idempotency | `plan_id` / `offer_id` / `campaign_id` là khóa tự nhiên; gọi lại một hành động đã ghi History trả lỗi trạng thái, **không ghi trùng** (§3.2 #5 append-only) |
| OpenAPI | FastAPI tự sinh tại `/docs` (§ "Lệnh thường dùng" CLAUDE.md) |

### 1.1. Authentication — **không có**

**Có chủ đích, không phải nợ kỹ thuật bị bỏ quên.** §7.1 #4 cắt auth thật khỏi MVP; C-03 giới hạn toàn bộ ở tài khoản demo.

| Actor | Cách định danh | Dùng để |
|---|---|---|
| Dispatcher | Header `X-Operator-Id: operator_demo_01` (mặc định nếu thiếu) | Điền `decided_by` của History Record §4.6 |
| Tài xế | `driver_id` trong path/body, chọn từ dropdown `GET /drivers` | Lọc offer của chính tài xế đó (§5.13 nguyên tắc #4: tài xế chỉ thấy dữ liệu của mình) |

Không có token, không session, không CORS (SPA build tĩnh phục vụ cùng origin qua `StaticFiles`). Không có rate limiting ở tầng HTTP — chống spam tài xế làm ở tầng nghiệp vụ bằng `max_offers_per_driver_per_hour` (§3.3).

### 1.2. Error response — thống nhất toàn API

```json
{
  "error_code": "INCENTIVE_BUDGET_EXCEEDED",
  "message": "Chỉ phủ được 12/20 xe do trần thưởng.",
  "detail": {"committed": 950000, "cap": 1000000, "zones_covered": 3, "zones_total": 5},
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `error_code` | enum (bảng dưới) | ✅ | Máy đọc; frontend map sang UI |
| `message` | string tiếng Việt | ✅ | Người đọc; hiển thị trực tiếp |
| `detail` | object | ⬜ | Số liệu kèm theo, cấu trúc tùy `error_code` |
| `plan_id` | string | ⬜ | Có khi lỗi gắn với một plan |

**Bảng mã lỗi — bám §5.9 (Cảnh báo & Fallback):**

| `error_code` | HTTP | Tình huống | Neo spec |
|---|---|---|---|
| `STALE_DATA` | 409 | Snapshot quá cũ so với đồng hồ replay → **chặn tạo plan mới** | §5.9 |
| `OPTIMIZER_TIMEOUT` | 200 ⚠️ | Optimizer vượt 5 giây → **kill, fallback greedy**. Trả 200 kèm `warnings[]`, không phải lỗi | §5.9, §5.4 |
| `NO_SOLUTION` | 200 ⚠️ | Không tìm được nghiệm → plan **rỗng**, `residual_gap` = toàn bộ gap. Trả 200 kèm cảnh báo | §5.9 |
| `PLAN_STATE_INVALID` | 409 | Chuyển trạng thái sai (approve plan đã Rejected, revise plan đã Approved…) | §5.7 |
| `POLICY_VIOLATION` | 422 | `revised_moves` vi phạm ràng buộc policy — trả kèm ràng buộc nào vi phạm | §5.7 |
| `BUDGET_EXCEEDED` | 422 | Move vượt `budget_cap` | §5.4, §3.3 |
| `INCENTIVE_BUDGET_EXCEEDED` | 200 ⚠️ | Hết `incentive_budget_cap` trước khi phủ đủ gap → gửi số offer tối đa trong ngân sách theo thứ tự severity, cảnh báo "chỉ phủ được {x}/{y} xe do trần thưởng". **Không tự nới ngân sách** | §5.9, C-09 |
| `NO_CANDIDATE_DRIVER` | 200 ⚠️ | Không có tài xế nào trong bán kính → campaign `Closed` ngay, `offers_sent=0`, `metrics_after_activation = metrics_after` | §5.9 |
| `OFFER_EXPIRED` | 409 | Tài xế bấm Nhận sau `expires_at` → hiển thị "Lời mời đã hết hạn", **không tính vào metrics** | §4.9 bước 1, §5.9 |
| `OFFER_ALREADY_RESPONDED` | 409 | Offer đã `Accepted`/`Declined`/`Cancelled` | §4.8 state machine |
| `NOT_FOUND` | 404 | `plan_id` / `offer_id` / `campaign_id` / `driver_id` không tồn tại | — |
| `VALIDATION_ERROR` | 422 | Pydantic v2 bắt được — trả nguyên `detail` của FastAPI | — |

> **Vì sao 4 tình huống trả HTTP 200 kèm cảnh báo thay vì 4xx:** đó là **kết quả nghiệp vụ hợp lệ**, không phải lỗi gọi API. §5.9 quy định rõ hành vi là "cảnh báo UI + vẫn trả kết quả", và §5.10 đòi luồng demo **không được treo**. Trả 4xx sẽ khiến frontend rơi vào nhánh lỗi và mất bảng metrics đang cần hiển thị.

### 1.3. Cảnh báo (`warnings[]`) — có ở mọi response trả plan hoặc campaign

```json
{"code": "SOURCE_ZONE_NEAR_MIN_SUPPLY", "message": "Zone 12 sau khi rút còn 4 xe, sát ngưỡng min_supply_per_zone=3.", "zone_id": 12}
```

Danh mục lấy từ §5.6 ("trường cảnh báo") và §5.9:

| `code` | Khi nào |
|---|---|
| `BUDGET_NEAR_CAP` | `total_cost ≥ 90%` `budget_cap` |
| `SOURCE_ZONE_NEAR_MIN_SUPPLY` | Zone nguồn sau khi rút còn ≤ `min_supply_per_zone + 1` |
| `STALE_DATA` | Snapshot cũ hơn đồng hồ replay |
| `PLAN_NOT_FULLY_COVERING_GAP` | `residual_gap` khác rỗng |
| `OPTIMIZER_FALLBACK_USED` | Đã kill và rơi về greedy |
| `FORECAST_FALLBACK_USED` | Model 1 lỗi → dùng `baseline_hist_avg` |
| `INCENTIVE_BUDGET_EXCEEDED` | Chiến dịch bị cắt bởi trần thưởng |
| `NO_CANDIDATE_DRIVER` | Không tìm được ứng viên |
| `OVERBOOKING_SURPLUS` | Số nhận vượt số cần — "huy động vượt nhu cầu {n} xe" (§5.9) |
| `SIMULATED_ACCEPT_RATE` | Kết quả dùng driver response simulator, không phải người thật (C-07) |

---

## 2. Bảng endpoint

| # | Method | Path | Mục đích | Neo spec |
|---|---|---|---|---|
| 1 | POST | `/api/v1/replay/session` | Mở phiên replay, chọn kịch bản | §5.1, §5.10 |
| 2 | POST | `/api/v1/replay/step` | Tiến 1 step 5 phút | §5.1 |
| 3 | POST | `/api/v1/replay/seek` | Tua tới/lui một mốc | §5.1 |
| 4 | GET | `/api/v1/replay/snapshot` | Snapshot §4.1 tại `t` hiện tại (heatmap) | §5.1, §5.12 |
| 5 | POST | `/api/v1/replay/scenario` | Nạp kịch bản demo | §5.10 |
| 6 | POST | `/api/v1/replay/reset` | Reset nhanh (gồm xóa offer queue + driver_registry) | §5.10 |
| 7 | GET | `/api/v1/forecast` | Forecast §4.2 | §5.2 |
| 8 | GET | `/api/v1/hotspots` | Hotspot §4.3 | §5.3 |
| 9 | POST | `/api/v1/plans` | Sinh plan §4.4 + simulate + explanation | §5.4, §5.5, §5.6 |
| 10 | GET | `/api/v1/plans/{plan_id}` | Đọc plan | §5.12 |
| 11 | POST | `/api/v1/plans/{plan_id}/revise` | HITL revise → re-simulate <2s | §5.7 |
| 12 | POST | `/api/v1/plans/{plan_id}/approve` | **Cổng người #1** | §5.7, C-03 |
| 13 | POST | `/api/v1/plans/{plan_id}/reject` | Từ chối kèm note bắt buộc | §5.7, §4.5 |
| 14 | GET | `/api/v1/plans/{plan_id}/activation-preview` | Xem trước chiến dịch (chưa phát hành) | §5.7, §5.12 |
| 15 | POST | `/api/v1/plans/{plan_id}/campaign` | **Cổng người #2** — phát hành offer | §5.7, §5.11, C-09 |
| 16 | GET | `/api/v1/campaigns/{campaign_id}` | Theo dõi Nhận/Từ chối/Hết hạn | §5.12 |
| 17 | POST | `/api/v1/campaigns/{campaign_id}/cancel` | Hủy chiến dịch | §5.7 |
| 18 | GET | `/api/v1/drivers` | Dropdown demo | §5.13, C-03 |
| 19 | GET | `/api/v1/drivers/{driver_id}/offers` | **Polling 2 giây** | §5.13, §7.1 #3 |
| 20 | POST | `/api/v1/offers/{offer_id}/respond` | Nhận/Từ chối | §4.9, C-08 |
| 21 | GET | `/api/v1/plans/{plan_id}/scenarios` | Bảng 3 kịch bản | §3.1, §5.12 |
| 22 | GET | `/api/v1/history` | Audit trail | §5.8, §5.12 |
| 23 | GET | `/health` | Healthcheck Docker (ngoài `/api/v1`) | hạ tầng |

---

## 3. Replay

### 3.1. `POST /api/v1/replay/session`

Mở một phiên replay. Một tiến trình chỉ giữ **một** phiên hoạt động (demo 1 người vận hành, §5.10).

**Request**
```json
{"scenario": "rain_peak_1700", "split": "test", "start_ts": "2026-08-02T16:00:00+07:00", "speed": "manual"}
```

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `scenario` | enum | ⬜ | `normal \| rain_peak_1700 \| holiday` (§5.10). Mặc định `normal` |
| `split` | enum | ⬜ | `train \| test`. Mặc định `test` (bộ deterministic đã khóa) |
| `start_ts` | datetime | ⬜ | Phải nằm trong dải snapshot của `split`. Mặc định: step đầu tiên |
| `speed` | enum | ⬜ | `manual \| auto_1x`. Mặc định `manual` (bấm step từng bước khi demo) |

**Response 201**
```json
{
  "session_id": "RPL-20260808-1030",
  "scenario": "rain_peak_1700",
  "split": "test",
  "t": "2026-08-02T16:00:00+07:00",
  "step_index": 192,
  "total_steps": 2016,
  "seed": 2026
}
```

**Lỗi:** `VALIDATION_ERROR` 422 (`start_ts` ngoài dải), `NOT_FOUND` 404 (không có snapshot cho `split`).

### 3.2. `POST /api/v1/replay/step`

**Request** `{"n_steps": 1}` — `n_steps` int ≥1, mặc định 1.

**Response 200**
```json
{"t": "2026-08-02T16:05:00+07:00", "step_index": 193, "snapshot": { /* §4.1 */ }, "warnings": []}
```

Mỗi step, Replay Engine cũng cập nhật `enroute_arrivals` đến hạn → `idle_supply` (§5.5) và tính lại `cooldown_until_ts` (§4.3).

### 3.3. `POST /api/v1/replay/seek`

**Request** `{"t": "2026-08-02T17:00:00+07:00"}` hoặc `{"step_index": 204}` — đúng **một** trong hai.

**Response 200** giống `/step`. Tua **lui** đưa trạng thái `enroute_arrivals`/`cooldown` về đúng mốc đó bằng cách replay lại từ đầu phiên (không có undo tăng dần — giữ tính deterministic, §3.2 #6).

### 3.4. `GET /api/v1/replay/snapshot`

**Query:** `t` (⬜, mặc định `t` hiện tại) · `zone_id` (⬜, lọc 1 zone).

**Response 200** = Snapshot §4.1 nguyên vẹn + `warnings[]` (có `STALE_DATA` nếu áp dụng).

### 3.5. `POST /api/v1/replay/scenario`

**Request** `{"scenario": "rain_peak_1700"}` → nạp lại timeline theo kịch bản, giữ nguyên `session_id`.

### 3.6. `POST /api/v1/replay/reset`

Reset nhanh cho demo (§5.10). **Bắt buộc gồm:** xóa toàn bộ hàng đợi offer đang mở + reset `driver_registry` về trạng thái đầu.

**Request** `{"purge_history": false}`

| Field | Kiểu | R/O | Ghi chú |
|---|---|---|---|
| `purge_history` | bool | ⬜ | Mặc định `false`. `true` chỉ dùng khi **chuẩn bị demo**, ghi rõ một dòng History `record_type="system_reset"` trước khi xóa — không bao giờ xóa im lặng (§3.2 #5) |

**Response 200** `{"session_id": "...", "t": "...", "offers_cancelled": 14, "drivers_reset": 600, "history_purged": false}`

---

## 4. Pipeline dự báo

### 4.1. `GET /api/v1/forecast`

**Query:** `horizon_min` ∈ {15, 30} (✅ bắt buộc) · `t` (⬜) · `model_version` (⬜, mặc định model đang nạp).

**Response 200** = Forecast §4.2. `demand_p10/p90` **và** `supply_p10/p90` không được `null` (§5.2 acceptance). `confidence` luôn `null` ở MVP (quyết định #5).

Nếu Model 1 lỗi → trả kết quả của `baseline_hist_avg` với `model_version: "hist_avg_v1"` + `warnings: [{"code": "FORECAST_FALLBACK_USED"}]`, **HTTP vẫn 200** (§5.9).

### 4.2. `GET /api/v1/hotspots`

**Query:** `horizon_min` ∈ {15, 30} (✅) · `t` (⬜) · `apply_hysteresis` bool (⬜, mặc định `true`).

**Response 200** = Hotspot §4.3, gồm `hotspots[]` (có `idle_supply_current`) và `surplus_zones[]` (có `idle_supply_current` + `cooldown_until_ts`).

Ở regime `rain_peak` dùng chế độ thận trọng theo `conservative_gap_mode` của policy (mặc định `p90_p50`: `gap = demand_p90 − predicted_supply`; `p90_p10`: `gap = demand_p90 − supply_p10`). Response echo lại chế độ đang dùng:

```json
{"forecast_ts": "...", "horizon_min": 15, "regime": "rain_peak",
 "conservative_gap_mode": "p90_p50", "hotspots": [...], "surplus_zones": [...]}
```

> `conservative_gap_mode` là **field optional thêm mới** trong response §4.3 — đúng nguyên tắc contract-first (§3.2 #1: chỉ thêm optional, không sửa field cũ). Có mặt để [EVALUATION_PLAN.md](EVALUATION_PLAN.md) đo được cả hai chế độ ở W4 (quyết định A-03).

---

## 5. Plan (Khối B)

### 5.1. `POST /api/v1/plans`

Sinh plan + chạy 2 kịch bản (`no_action`, `plan_only`) + sinh explanation trong **một** lần gọi. Gộp lại vì UI cần cả ba để hiển thị một màn hình (§5.12) và ngân sách thời gian p95 ≤5s là cho **toàn bộ** thao tác này (§1.7).

**Request**
```json
{"t": "2026-08-02T17:05:00+07:00", "horizon_min": 15, "dry_run": false}
```

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `t` | datetime | ⬜ | Mặc định `t` hiện tại của phiên |
| `horizon_min` | int | ⬜ | ∈ {15, 30}, mặc định 15 |
| `dry_run` | bool | ⬜ | `true` → **không ghi History**, `status` giữ `Draft`. Dùng khi tune ngưỡng, không dùng khi demo |

**Response 201**
```json
{
  "plan": { /* §4.4 đầy đủ, status="Proposed" */ },
  "explanation_text": "Dự báo mưa 10.5mm/h lúc 17:20, zone Cầu Giấy - Cụm 2 thiếu 41 xe. Đề xuất điều 8 xe từ Zone 12 (đến sau 10 phút, chi phí 126.000đ, chạy rỗng 4.2km), giảm unmet demand 39%. Cảnh báo: plan chưa phủ hết gap.",
  "warnings": [{"code": "PLAN_NOT_FULLY_COVERING_GAP", "message": "Còn 12 xe chưa phủ ở zone 7."}],
  "timing_ms": {"optimize": 1840, "simulate": 620, "explain": 15}
}
```

**Lỗi:**

| Mã | HTTP | Khi nào |
|---|---|---|
| `STALE_DATA` | 409 | Snapshot cũ hơn đồng hồ replay — **chặn tạo plan** (§5.9) |
| `NO_SOLUTION` | 200 ⚠️ | Plan rỗng, `residual_gap` = toàn bộ gap |
| `OPTIMIZER_TIMEOUT` | 200 ⚠️ | Đã kill và fallback greedy; `warnings` có `OPTIMIZER_FALLBACK_USED` |

`timing_ms` tồn tại để [EVALUATION_PLAN.md](EVALUATION_PLAN.md) đo p95 ≤5s mà không cần đo từ ngoài.

### 5.2. `GET /api/v1/plans/{plan_id}`

**Response 200** `{"plan": {...}, "explanation_text": "...", "warnings": [...]}` · **404** `NOT_FOUND`.

### 5.3. `POST /api/v1/plans/{plan_id}/revise`

**Request** = Revision Request §4.5 với `action: "revise"`:
```json
{
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "action": "revise",
  "revised_moves": [{"from_zone": 12, "to_zone": 7, "units_to_move": 5, "eta_steps": 2}],
  "note": "Giảm bớt vì Z12 sắp vào giờ tan tầm"
}
```

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `plan_id` | string | ✅ | Phải khớp path |
| `action` | enum | ✅ | Ở endpoint này bắt buộc `"revise"` |
| `revised_moves` | list | ✅ | Có thể **rỗng** (bỏ hết move). Mỗi phần tử: `from_zone`/`to_zone` ∈ 1–30 và khác nhau, `units_to_move` ≥1 |
| `note` | string | ⬜ | Optional với `revise` (bắt buộc chỉ với `reject`, §4.5) |

**Xử lý (§5.7):** kiểm tra lại ràng buộc policy **ngay lập tức** → `simulate()` → trả metrics + explanation mới, **< 2 giây**.

**Response 200** giống `POST /plans` + `plan.status = "Revised"`. Ghi History `decision: "revised"`.

**Lỗi:**

| Mã | HTTP | Khi nào |
|---|---|---|
| `POLICY_VIOLATION` | 422 | `detail` liệt kê ràng buộc vi phạm: `max_distance`, `max_supply_move_pct`, `min_supply_per_zone`, `cooldown_minutes` |
| `BUDGET_EXCEEDED` | 422 | Tổng `estimated_cost` vượt `budget_cap` |
| `PLAN_STATE_INVALID` | 409 | Plan đã `Approved` hoặc `Rejected` |

```json
{"error_code": "POLICY_VIOLATION", "message": "Rút 5 xe khỏi zone 12 làm zone này còn 2 xe, dưới min_supply_per_zone=3.",
 "detail": {"rule": "min_supply_per_zone", "zone_id": 12, "after": 2, "limit": 3}, "plan_id": "f47ac..."}
```

### 5.4. `POST /api/v1/plans/{plan_id}/approve`

**Cổng người bắt buộc #1** (C-03). Chỉ ghi trạng thái + note, **không tính lại metrics** (§5.7).

**Request** `{"note": "Đồng ý, ưu tiên Cầu Giấy"}` — `note` optional. Header `X-Operator-Id` → `decided_by`.

**Response 200**
```json
{
  "plan_id": "f47ac...", "status": "Approved",
  "decided_by": "operator_demo_01", "decided_at": "2026-08-02T17:07:12+07:00",
  "record_id": "H-000512",
  "residual_gap": [{"zone_id": 7, "gap_remaining": 12.0, "suggested_activation": 5}],
  "activation_available": true
}
```

> `activation_available: true` chỉ báo cho UI **hiện khối "Huy động thêm"** — nó **không** phát hành offer. Approve plan **không tự động** kích hoạt huy động (§5.7, C-09: hai quyết định tiêu hai loại ngân sách khác nhau).
> **Không gửi lệnh xe thật** — "approved" chỉ kích hoạt mô phỏng và lưu lịch sử (C-03).

**Lỗi:** `PLAN_STATE_INVALID` 409 (đã Approved/Rejected).

### 5.5. `POST /api/v1/plans/{plan_id}/reject`

**Request** `{"note": "Chi phí deadhead quá cao so với lợi ích"}`

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `note` | string | ✅ **bắt buộc** | Không rỗng sau khi trim. §4.5: *"`note` bắt buộc khi `reject`"* |

**Response 200** `{"plan_id": "...", "status": "Rejected", "decided_by": "...", "decided_at": "...", "record_id": "H-000514"}`

**Lỗi:** `VALIDATION_ERROR` 422 (thiếu `note`), `PLAN_STATE_INVALID` 409.

### 5.6. `GET /api/v1/plans/{plan_id}/scenarios`

Bảng 3 kịch bản (§3.1, §5.12).

**Response 200**
```json
{
  "plan_id": "f47ac...",
  "scenarios": {
    "no_action":       {"unmet_demand": 31, "avg_wait_proxy": 7.2, "est_cancel_rate": 0.18},
    "plan_only":       {"unmet_demand": 19, "avg_wait_proxy": 4.8, "est_cancel_rate": 0.11},
    "plan_activation": {"unmet_demand": 13, "avg_wait_proxy": 3.9, "est_cancel_rate": 0.08}
  },
  "by_regime": {
    "rain_peak": {"no_action": {...}, "plan_only": {...}, "plan_activation": {...}},
    "peak": {...}, "rain": {...}, "normal": {...}
  },
  "deltas": {
    "unmet_demand_reduction_pct": 38.7,
    "residual_gap_reduction_pct": 41.2
  },
  "accept_rate_source": "simulated_model",
  "invariants": {"total_supply_plan_only_equals_no_action": true, "no_action_matches_frozen_baseline": true},
  "warnings": [{"code": "SIMULATED_ACCEPT_RATE", "message": "Số liệu activation từ mô phỏng, không phải người thật bấm."}]
}
```

| Field | Bắt buộc | Ghi chú |
|---|---|---|
| `by_regime` | ✅ | Tách 4 regime — `rain_peak` **không được giấu trong số tổng** (§3.2 #4, §5.14.1 #5) |
| `accept_rate_source` | ✅ | `simulated_model \| human_demo \| mixed` (§4.6, C-07) |
| `invariants` | ✅ | INV-1 và INV-2 ([ARCHITECTURE.md §6.2](ARCHITECTURE.md#62-hai-luật-cứng--có-test-tĩnh-trong-ci)); `false` → UI hiện cảnh báo đỏ |

`plan_activation` = `null` cho tới khi chiến dịch đóng (§4.4 `metrics_after_activation`).

---

## 6. Activation (Khối C)

### 6.1. `GET /api/v1/plans/{plan_id}/activation-preview`

Xem trước **trước khi** phát hành — cấp dữ liệu cho khối "Huy động thêm" (§5.7, §5.12). **Không tạo offer, không ghi History.**

**Response 200**
```json
{
  "plan_id": "f47ac...",
  "residual_gap": [{"zone_id": 7, "gap_remaining": 12.0, "suggested_activation": 5}],
  "planned_offers": 20,
  "candidates_found": 34,
  "candidates_by_status": {"offline": 22, "online_idle": 12},
  "worst_case_incentive": 660000,
  "incentive_budget_cap": 1000000,
  "expected_units_gained": 12.0,
  "assumed_accept_rate": 0.6,
  "accept_rate_source": "simulated_model",
  "warnings": []
}
```

| Field | Nguồn |
|---|---|
| `planned_offers` | `Σ ceil(gap_remaining × overbooking_factor)` (§3.3, §5.11) |
| `worst_case_incentive` | **Tổng `incentive_amount` giả định 100% nhận** — §4.8: chốt ngân sách theo cam kết xấu nhất, không theo kỳ vọng |
| `expected_units_gained` | `planned_offers × assumed_accept_rate` — **chỉ để tham khảo**, luôn kèm `accept_rate_source` (C-07) |

### 6.2. `POST /api/v1/plans/{plan_id}/campaign`

**Cổng người bắt buộc #2** (§5.7). Đây là hành động phát hành offer thật tới Driver App.

**Request**
```json
{"confirm": true, "response_mode": "mixed", "human_driver_ids": ["DRV-0142", "DRV-0271"]}
```

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `confirm` | bool | ✅ | Phải `true`. Bắt buộc tường minh vì đây là quyết định tiêu ngân sách thứ hai (C-09) |
| `response_mode` | enum | ⬜ | `human \| simulated \| mixed` (§5.11). Mặc định `simulated` |
| `human_driver_ids` | list[string] | ⬜ | Chỉ có nghĩa khi `mixed` — các tài khoản để người thật bấm ở demo 2 màn hình (§5.10) |

**Điều kiện tiên quyết:** plan `status == "Approved"` **và** `residual_gap` khác rỗng.

**Response 201**
```json
{
  "campaign_id": "ACT-20260802-1706-01",
  "plan_id": "f47ac...",
  "status": "Running",
  "offers_sent": 20,
  "incentive_committed": 660000,
  "incentive_budget_cap": 1000000,
  "response_mode": "mixed",
  "accept_rate_source": "mixed",
  "offers": [ /* danh sách Offer §4.8 */ ],
  "warnings": [],
  "timing_ms": {"select_candidates": 210, "issue_offers": 340}
}
```

**Bất biến bắt buộc (§5.11 acceptance):** `incentive_committed ≤ incentive_budget_cap` **kể cả khi 100% offer được nhận**. Đây là điều kiện kiểm ở tầng nghiệp vụ, không phải gợi ý.

**Lỗi:**

| Mã | HTTP | Khi nào |
|---|---|---|
| `PLAN_STATE_INVALID` | 409 | Plan chưa `Approved`, hoặc đã có campaign đang `Running` |
| `VALIDATION_ERROR` | 422 | `confirm != true`, hoặc `residual_gap` rỗng |
| `NO_CANDIDATE_DRIVER` | 200 ⚠️ | Campaign trả về `status: "Closed"`, `offers_sent: 0`; UI hiện "Không có tài xế khả dụng trong bán kính {r}km" (§5.9) |
| `INCENTIVE_BUDGET_EXCEEDED` | 200 ⚠️ | Campaign `Running` với số offer bị cắt; `warnings` ghi rõ "chỉ phủ được {x}/{y} xe do trần thưởng" |

### 6.3. `GET /api/v1/campaigns/{campaign_id}`

Nguồn dữ liệu cho bảng theo dõi realtime (§5.7). UI vận hành polling **2 giây**, cùng nhịp với Driver App.

**Response 200**
```json
{
  "campaign_id": "ACT-20260802-1706-01",
  "plan_id": "f47ac...",
  "status": "Running",
  "offers_sent": 20, "offers_accepted": 5, "offers_declined": 2,
  "offers_expired": 1, "offers_pending": 12, "offers_cancelled": 0,
  "units_gained": 5,
  "incentive_committed": 660000,
  "incentive_paid": 165000,
  "accept_rate": 0.625,
  "accept_rate_source": "mixed",
  "offers": [{"offer_id": "OF-000031", "driver_id": "DRV-0142", "target_zone": 7,
              "status": "Accepted", "responded_at": "2026-08-02T17:08:04+07:00",
              "response_latency_sec": 14, "decline_reason": null}],
  "warnings": []
}
```

`accept_rate = offers_accepted / (offers_accepted + offers_declined + offers_expired)` — offer **hết hạn tính như một lần không nhận** (§5.9), offer đang chờ không vào mẫu số.

### 6.4. `POST /api/v1/campaigns/{campaign_id}/cancel`

**Request** `{"note": "Gap đã được bù đủ"}` (optional).

**Xử lý:** mọi offer chưa phản hồi → `Cancelled` (§4.8). Campaign → `Closed`. Ghi History.

**Response 200** `{"campaign_id": "...", "status": "Closed", "offers_cancelled": 12, "metrics_after_activation": {...}}`

> **Không hủy ngược offer đã được nhận** (C-08 — không rút lời hứa đã đưa ra). Tài xế bấm Nhận sau khi gap đã đủ **vẫn được ghi `Accepted` và vẫn trả thưởng**; phần dư ghi cảnh báo `OVERBOOKING_SURPLUS` để đánh giá lại `overbooking_factor` (§5.9).

---

## 7. Driver App

### 7.1. `GET /api/v1/drivers`

Dropdown đăng nhập demo — **không phải auth** (C-03, §7.1 #4).

**Query:** `status` (⬜, lọc `online_idle|online_busy|offline`) · `zone_id` (⬜) · `has_open_offer` bool (⬜).

**Response 200**
```json
{"drivers": [{"driver_id": "DRV-0142", "display_name": "Tài xế 142", "current_zone": 12,
              "status": "online_idle", "is_demo_account": true, "open_offers": 1}],
 "total": 600}
```

`is_demo_account` **luôn `true`** ở MVP (§4.7, C-03). API **từ chối phục vụ** bất kỳ bản ghi nào có `is_demo_account == false` — chốt chặn chống nhầm lẫn khi có dữ liệu thật sau này.

### 7.2. `GET /api/v1/drivers/{driver_id}/offers`

**Endpoint được polling 2 giây** (§5.13, §7.1 #3 — không WebSocket).

**Query:** `include_history` bool (⬜, mặc định `false`).

**Response 200**
```json
{
  "driver_id": "DRV-0142",
  "server_time": "2026-08-02T17:08:00+07:00",
  "open_offers": [{
    "offer_id": "OF-000031", "campaign_id": "ACT-20260802-1706-01",
    "target_zone": 7, "target_zone_name": "Cầu Giấy - Cụm 2",
    "distance_km": 4.2, "eta_min": 12, "incentive_amount": 33000,
    "reason_text": "Zone Cầu Giấy - Cụm 2 dự báo thiếu 12 xe lúc 17:20 do mưa 8mm/h giờ cao điểm. Thưởng 33.000đ, cách 4.2km (~12 phút). Bạn có thể từ chối.",
    "expires_at": "2026-08-02T17:16:30+07:00", "seconds_remaining": 510, "status": "Sent"
  }],
  "history": []
}
```

**Ràng buộc riêng tư (§5.13 nguyên tắc #4, NFR §6 "Riêng tư"):** response chỉ chứa dữ liệu của chính `driver_id` đó. **Tuyệt đối không** trả heatmap, plan điều chuyển, thông tin tài xế khác, hay bất kỳ số liệu so sánh giữa các tài xế.

**Ràng buộc tự nguyện (C-08):** response **không có** field nào kiểu `accept_rate_of_driver`, `driver_rank`, `driver_score`. `open_offers` sắp xếp theo `expires_at` tăng dần (§5.13). Offer hết hạn **tự biến mất** khỏi `open_offers`, chuyển sang `history` với nhãn "Đã bỏ lỡ" — không dùng từ mang tính trách móc.

`server_time` + `seconds_remaining` để client đếm ngược không lệ thuộc đồng hồ máy tài xế.

### 7.3. `POST /api/v1/offers/{offer_id}/respond`

**Request**
```json
{"driver_id": "DRV-0142", "decision": "accept", "decline_reason": null}
```

| Field | Kiểu | R/O | Validation |
|---|---|---|---|
| `driver_id` | string | ✅ | Phải khớp `offer.driver_id` |
| `decision` | enum | ✅ | `accept \| decline`. **`expired` không hợp lệ ở đây** — hệ thống tự sinh khi quá `expires_at`, không phải hành động tài xế (§4.9) |
| `decline_reason` | enum/null | ⬜ | **Không bắt buộc** (C-08). Nếu có: `Quá xa \| Sắp hết ca \| Thưởng chưa đủ \| Đang bận \| Khác` |

> **Ràng buộc C-08 ở tầng API:** `decline_reason` là optional **theo hợp đồng**, backend không được thêm validation bắt buộc nó, frontend không được chặn nút Từ chối khi chưa chọn lý do. Từ chối phải là **1 chạm**.

**Xử lý `accept` — 5 bước §4.9** (chi tiết ở [ARCHITECTURE.md §3.2](ARCHITECTURE.md#32-vòng-phản-hồi-đóng-fr-13)):

1. Offer còn hiệu lực? → nếu không, `OFFER_EXPIRED` 409, **không tính vào metrics**
2. `incentive_paid += offer.incentive_amount`
3. Append `enroute_arrivals` của `target_zone`: `{arrival_ts, eta_steps, units: 1, source: "activation", from_zone}`; cộng dồn `enroute_supply` cho khớp bất biến INV-3
4. Đọc **`offer.driver_status_at_offer`** (đã đóng băng lúc phát hành, §4.8): `online_idle` → trừ 1 `idle_supply` zone nguồn; `offline` → **không trừ ở đâu cả** (cung mới). **Tuyệt đối không tra lại `driver_states`**
5. `simulate(include_activation=true)` → cập nhật `metrics_after_activation`, **< 2 giây**

**Response 200**
```json
{
  "offer_id": "OF-000031", "status": "Accepted",
  "responded_at": "2026-08-02T17:08:04+07:00", "response_latency_sec": 14,
  "record_id": "H-000513",
  "target_zone": 7, "target_zone_name": "Cầu Giấy - Cụm 2",
  "eta_min": 12, "incentive_amount": 33000,
  "metrics_after_activation": {"unmet_demand": 13, "avg_wait_proxy": 3.9, "est_cancel_rate": 0.08}
}
```

Với `decision: "decline"` → `status: "Declined"`, không có `metrics_after_activation`. **Không có hậu quả nào** ghi vào hồ sơ tài xế (C-08).

**Lỗi:**

| Mã | HTTP | Khi nào |
|---|---|---|
| `OFFER_EXPIRED` | 409 | Quá `expires_at`. `message`: "Lời mời đã hết hạn." |
| `OFFER_ALREADY_RESPONDED` | 409 | Đã `Accepted`/`Declined`/`Cancelled` |
| `VALIDATION_ERROR` | 422 | `driver_id` không khớp, hoặc `decision == "expired"` |
| `NOT_FOUND` | 404 | `offer_id` không tồn tại |

---

## 8. History & hạ tầng

### 8.1. `GET /api/v1/history`

Audit trail (§5.8, FR-7). **Chỉ đọc — không có endpoint sửa/xóa History ở bất kỳ đâu trong API này** (append-only, §3.2 #5).

**Query:** `plan_id` · `campaign_id` · `driver_id` · `record_type` (`plan_decision|driver_response|system_reset`) · `from_ts` · `to_ts` · `limit` (mặc định 50, tối đa 500) · `offset`.

**Response 200**
```json
{"records": [ /* History Record §4.6 */ ], "total": 512, "limit": 50, "offset": 0}
```

### 8.2. `GET /health`

Ngoài `/api/v1` — dùng cho Docker healthcheck.

```json
{"status": "ok", "app_env": "dev", "policy_loaded": true, "policy_keys": 19,
 "zones": 30, "drivers": 600, "history_db": "ok", "model_version": "lgbm_v2_rainpeak",
 "baseline_frozen": true}
```

`policy_keys != 19` hoặc `policy_loaded == false` → HTTP **503**. Ứng dụng đã fail-fast lúc boot ([ARCHITECTURE.md §6.4](ARCHITECTURE.md#64-thứ-tự-khởi-tạo-fail-fast-lúc-boot)); endpoint này để orchestrator phát hiện.

---

## 9. Ma trận truy vết endpoint → spec

| Endpoint | FR | § | Contract vào | Contract ra |
|---|---|---|---|---|
| `POST /replay/session\|step\|seek`, `GET /replay/snapshot` | FR-1 | §5.1 | — | §4.1 |
| `POST /replay/scenario\|reset` | FR-10 | §5.10 | — | — |
| `GET /forecast` | FR-2 | §5.2 | §4.1 | §4.2 |
| `GET /hotspots` | FR-2 | §5.3 | §4.2 | §4.3 |
| `POST /plans` | FR-3, FR-4, FR-5, FR-9 | §5.4, §5.5, §5.6 | §4.3 | §4.4 |
| `GET /plans/{id}` | FR-12a | §5.12 | — | §4.4 |
| `POST /plans/{id}/revise` | FR-6 | §5.7 | §4.5 | §4.4 |
| `POST /plans/{id}/approve\|reject` | FR-6, FR-7 | §5.7, §5.8 | §4.5 | §4.6 |
| `GET /plans/{id}/activation-preview` | FR-11 | §5.7, §5.12 | §4.4 | — |
| `POST /plans/{id}/campaign` | FR-11 | §5.11 | §4.4 | §4.8 |
| `GET /campaigns/{id}` | FR-11, FR-12a | §5.12 | — | §4.4 `activation` |
| `POST /campaigns/{id}/cancel` | FR-11 | §5.7 | — | §4.8 |
| `GET /drivers` | FR-12b | §5.13 | — | §4.7 |
| `GET /drivers/{id}/offers` | FR-12b | §5.13 | — | §4.8 |
| `POST /offers/{id}/respond` | FR-13 | §4.9, §5.11 | §4.9 | §4.6 |
| `GET /plans/{id}/scenarios` | FR-4 | §3.1, §5.5 | — | metrics |
| `GET /history` | FR-7 | §5.8 | — | §4.6 |
| `GET /health` | — | hạ tầng | — | — |

**Không có endpoint nào** cho: gửi lệnh xe thật (C-03), push notification (§1.5), thanh toán thưởng (§1.5), sửa/xóa History (§3.2 #5), chấm điểm hoặc xếp hạng tài xế (C-08), đấu giá mức thưởng (§1.5), WebSocket (§7.1 #3), auth/token (§7.1 #4).
