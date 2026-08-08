# EVALUATION_PLAN.md — GSM-14 · NovaFour

> Neo: [SPEC §1.7](docs/SPEC-GSM14-NovaFour-Unified.md) (19 KPI), §5.9 (fallback), §5.14 (hai baseline + quy tắc khóa), §6 (NFR), C-07/C-08/C-03.
> **Mọi số KPI ở đây là simulation proxy trên synthetic data** (C-07). Không có số nào là đo lường thực địa.

**Mục lục:** [§0 Ánh xạ heading](#0-ánh-xạ-heading-yêu-cầu--hệ-thống-này) · [§1 Happy path](#1-happy-path) · [§2 Failure cases](#2-failure-cases) · [§3 Tool calling accuracy](#3-tool-calling-accuracy) · [§4 Argument accuracy](#4-argument-accuracy) · [§5 Hallucination](#5-hallucination) · [§6 Safety](#6-safety) · [§7 Latency & cost](#7-latency--cost) · [§8 Ma trận model](#8-ma-trận-đánh-giá-model-1) · [§9 Độ nhạy accept rate](#9-phân-tích-độ-nhạy-accept-rate--bắt-buộc) · [§10 UAT](#10-uat) · [§11 Bảng KPI tổng](#11-bảng-kpi-tổng--19-chỉ-số-17)

---

## 0. Ánh xạ heading yêu cầu → hệ thống này

| Heading | Trong hệ thống này |
|---|---|
| Happy path | Kịch bản demo mưa 17:00–19:00, 2 màn hình, chạy **5/5 lần** (§5.10) |
| Failure cases | **12 dòng §5.9** → 12 test case, mỗi dòng một test |
| Tool calling accuracy | **Router deterministic** chọn đúng module/fallback — bảng chân trị 22 luật ([AGENT_WORKFLOW.md §2.1](AGENT_WORKFLOW.md#21-bảng-router-chính)) |
| Argument accuracy | Tham số truyền vào module **hợp lệ contract + không vi phạm policy** |
| Hallucination | §5.6 "explanation khớp 100% số liệu" + **ba bất biến chống bịa xe** |
| Safety | C-08 (tự nguyện) · C-03 (không tác động thật) · C-07 (trung thực KPI) · riêng tư |
| Latency & cost | NFR §6 + **chi phí mô phỏng** (VNĐ), **không phải chi phí token** — MVP không gọi LLM |

---

## 1. Happy path

### 1.1. Kịch bản chính — mưa đột ngột giờ cao điểm chiều (§5.10)

| Bước | Hành động | Kết quả mong đợi |
|---|---|---|
| 1 | Nạp scenario `rain_peak_1700`, seed 2026 | 30 zone, `regime == rain_peak` từ 17:00 |
| 2 | `POST /replay/step` đến 17:05 | Snapshot §4.1 hợp lệ, INV-3 đúng |
| 3 | Model 1 dự báo h15 + h30 | `p10 ≤ p50 ≤ p90`, 100% dòng; < 1 s |
| 4 | Model 2 phát hiện hotspot | ≥ 1 hotspot; `severity_score` giảm dần |
| 5 | Model 3 sinh plan | `total_cost ≤ budget_cap`; mọi move `≤ max_distance`; p95 ≤ 5 s |
| 6 | Simulator 2 kịch bản | `metrics_after.unmet_demand < metrics_before.unmet_demand` |
| 7 | Explanation Lớp 1 | 100% số khớp `explanation_data` |
| 8 | **Cổng người #1** — Dispatcher approve | Plan → `Approved`; 1 `history_record` |
| 9 | `residual_gap > 0` → campaign `Pending` | **Không offer nào được phát** |
| 10 | **Cổng người #2** — `confirm: true` | Campaign → `Running`; offer sinh < 2 s |
| 11 | Offer hiện trên màn `/driver` | **< 2 s** (polling 2 s) |
| 12 | Tài xế bấm **Nhận** | `EnrouteArrival` với `source: "activation"` |
| 13 | Re-simulate | `metrics_after_activation` điền; **< 2 s** |
| 14 | Bảng 3 kịch bản | `no_action` > `plan_only` > `plan_activation` về `unmet_demand` |
| 15 | Sau `eta_steps` step | `enroute` → `idle_supply`; INV-3 vẫn đúng |

**AC happy path:** chạy **5/5 lần** không lỗi, **trên cả 2 màn hình** (§6 độ tin cậy demo). Cùng seed → cùng kết quả **100%**.

### 1.2. Hai kịch bản phụ (§5.10)

| Kịch bản | Kỳ vọng |
|---|---|
| Ngày thường | Ít hotspot; nhiều step **không sinh plan** (R8) — đây là hành vi đúng, không phải bug |
| Lễ | `holiday_flag = 1`, `holiday_demand_multiplier = 0.6`; plan nhỏ hơn |

---

## 2. Failure cases

**12 dòng §5.9 → 12 test.** Mỗi test dựng đúng điều kiện, kiểm hành vi **và** kiểm hệ thống **không treo**.

| # | Test | Điều kiện dựng | Kỳ vọng |
|---|---|---|---|
| F1 | `test_no_solution` | Có hotspot, `surplus_zones` rỗng | Plan **rỗng**, `residual_gap` = toàn bộ gap, `NO_SOLUTION` trong `warnings[]`, HTTP **200** |
| F2 | `test_optimizer_timeout` | Monkeypatch optimizer ngủ 6 s | Kill ở 5 s, fallback greedy `fast`, `OPTIMIZER_TIMEOUT`, HTTP 200 |
| F3 | `test_forecast_fallback` | Xóa model artifact | Dùng `baseline_hist_avg`, `FORECAST_FALLBACK`, plan vẫn sinh được |
| F4 | `test_explanation_fallback` | Bật Lớp 2, ép LLM trả số bịa | Validator bắt được → **dùng Lớp 1**, `EXPLANATION_FALLBACK` |
| F5 | `test_stale_data` | `t_snapshot` lệch > 1 step | **Chặn tạo plan**, `STALE_DATA`, HTTP **409**, badge trên UI |
| F6 | `test_mock_contract` | Chạy pipeline với mock mọi module | Mọi mock trả **đúng contract** §4.x; `MOCK_IN_USE` |
| F7 | `test_no_candidate_driver` | `activation_radius_km = 0.1` | Campaign `Closed` ngay, `offers_sent = 0`, `metrics_after_activation == metrics_after`, UI hiện "Không có tài xế khả dụng trong bán kính 0.1km" |
| F8 | `test_incentive_budget_exhausted` | `incentive_budget_cap = 50000` | Gửi tối đa theo severity; cảnh báo "chỉ phủ được {x}/{y} xe do trần thưởng"; **`incentive_committed ≤ cap`**; **không tự nới** |
| F9 | `test_offer_expired` | Tua qua `offer_ttl_minutes` | Offer → `Expired`; tính vào `accept_rate` như một lần không nhận; respond muộn → **409**; **luồng không treo** |
| F10 | `test_simulated_response` | `mode = "simulated"` | Phản hồi deterministic seed 7; `accept_rate_source = "simulated_model"`; UI hiện nhãn **"mô phỏng"** |
| F11 | `test_accept_after_gap_filled` | Bù đủ gap rồi mới accept | Vẫn `Accepted`, **vẫn trả thưởng**, `OVERBOOKING_SURPLUS` "huy động vượt nhu cầu {n} xe" |
| F12 | `test_concurrent_accepts` | 5 accept cùng lúc, cần 2 | Nhận theo `responded_at`; **không hủy ngược** offer đã gửi |

**Bốn failure case ngoài §5.9 — bất biến vỡ, cố ý crash, không fallback:**

| # | Test | Kỳ vọng |
|---|---|---|
| F13 | `test_missing_policy_key` | Xóa 1/19 key → **crash lúc boot**, message nêu tên key |
| F14 | `test_enroute_invariant_broken` | `enroute_supply != Σ enroute_arrivals[].units` → **crash**, HTTP 500 |
| F15 | `test_plan_state_invalid` | Approve plan đã `Rejected` → `PLAN_STATE_INVALID`, 409 |
| F16 | `test_history_immutable` | `UPDATE`/`DELETE` trên `history_record` → **trigger DB chặn** |

---

## 3. Tool calling accuracy

"Tool" = module được router chọn. Không có LLM chọn tool → đo **độ đúng của bảng tra**, không đo xác suất.

### 3.1. Bảng chân trị — 22 luật router

Test tham số hóa `pytest.mark.parametrize` trên đúng 22 luật R1–R22 ([AGENT_WORKFLOW.md §2.1](AGENT_WORKFLOW.md#21-bảng-router-chính)).

| Nhóm | Test |
|---|---|
| R2 vs R3 | Snapshot stale → chặn; snapshot tươi → forecast. Test tại **biên đúng 1 step** |
| R3 / R4 | Có artifact → LightGBM; không có → hist-avg. Không có trường hợp thứ ba |
| R5 / R6 / R7 | 3 chế độ gap × 4 regime = **12 tổ hợp**, mỗi tổ hợp một assertion về công thức được dùng |
| R8 / R9 / R10 | Hotspot rỗng → dừng; có surplus → greedy; không surplus → plan rỗng |
| R14 / R15 | Cờ Lớp 2 tắt → luôn Lớp 1. **Cờ bật + LLM lỗi → Lớp 1** |
| R16 / R17 | `residual_gap` rỗng → `NotNeeded`; `> 0` → `Pending` |
| R19 | Không ứng viên → `Closed` ngay, không phải `Running` rồi mới `Closed` |
| R20 / R21 / R22 | 3 chế độ phản hồi chọn đúng nhánh |

**AC:** **22/22 luật** có test; **100%** pass. Độ phủ nhánh của `src/replay/engine.py` ≥ 95%.

### 3.2. Ba quy tắc router — test tĩnh

| Test | Kiểm |
|---|---|
| `test_moi_module_co_fallback` | Mọi module trong bảng router có mock trả **đúng contract** (C-06) |
| `test_fallback_khong_goi_fallback` | Chuỗi fallback sâu **đúng 1 tầng** |
| `test_router_khong_doc_policy_truc_tiep` | `grep "yaml.safe_load"` trong `src/replay/` → **0 kết quả** |

### 3.3. Thứ tự ưu tiên ứng viên (§5.11)

| Test | Kỳ vọng |
|---|---|
| `test_offline_truoc_online_idle` | Với 2 ứng viên **cùng khoảng cách**, `offline` luôn được chọn trước |
| `test_khoang_cach_tang_dan` | Cùng status → khoảng cách tăng dần |
| `test_loai_online_busy` | `online_busy` **không bao giờ** trong tập ứng viên |
| `test_loai_khi_zone_nguon_can` | Rút làm zone nguồn `< min_idle_before_activation` → loại |
| `test_loai_khi_qua_gioi_han_offer` | Đã nhận `max_offers_per_driver_per_hour` trong 1h → loại |

---

## 4. Argument accuracy

Mọi tham số truyền vào module phải **(a)** hợp lệ contract §4.1–4.9 **và (b)** không vi phạm policy. (b) là phần dễ trượt: contract hợp lệ **không** đồng nghĩa với chính sách hợp lệ.

### 4.1. Ràng buộc policy — test property-based

Chạy trên **≥ 100 snapshot sinh ngẫu nhiên có seed**, mỗi ràng buộc một assertion:

| # | Ràng buộc | Nguồn |
|---|---|---|
| A1 | `plan_totals.total_cost ≤ budget_cap` | §5.4 |
| A2 | `Σ incentive_amount (cam kết xấu nhất) ≤ incentive_budget_cap` | §5.11 |
| A3 | **A1 và A2 độc lập** — cạn ngân sách thưởng **không** làm đổi `total_cost` (C-09) | C-09 |
| A4 | Mọi `move.estimated_distance_km ≤ max_distance` | §5.4 |
| A5 | Mọi `offer.distance_km ≤ activation_radius_km` | §4.8 |
| A6 | Zone nguồn sau move `≥ min_supply_per_zone` | §5.4 |
| A7 | `units_to_move ≤ max_supply_move_pct × idle_supply_current` | §5.4 |
| A8 | Zone có `cooldown_until_ts > t` **không** làm nguồn | §4.3 |
| A9 | **Không** offer cho `online_busy` | §4.8 |
| A10 | Zone nguồn của offer sau rút `≥ min_idle_before_activation` | §4.8 |
| A11 | `eta_steps ≥ 1` mọi move | §4.4 |
| A12 | `incentive_amount = min(base + per_km × d, max)`, làm tròn 1.000đ | §4.8 |
| A13 | `expires_at = created_at + offer_ttl_minutes` chính xác | §4.8 |
| A14 | `avg_vehicle_speed_kmh` **giống nhau** ở Optimizer / Generator / Activation | §3.3 |

### 4.2. Argument từ người vận hành — `revised_moves`

| Test | Kỳ vọng |
|---|---|
| `test_revise_vi_pham_budget` | `revised_moves` vượt `budget_cap` → `BUDGET_EXCEEDED` 422 |
| `test_revise_vi_pham_distance` | Vượt `max_distance` → `POLICY_VIOLATION` 422 |
| `test_revise_lam_can_zone_nguon` | Zone nguồn `< min_supply_per_zone` → `POLICY_VIOLATION` 422 |
| `test_revise_rong_hop_le` | `revised_moves: []` (bỏ hết move) → **hợp lệ**, `residual_gap` = toàn bộ |

> Người vận hành sửa được **số xe và cặp zone**; **không** sửa được chính sách. Đây là ranh giới của cổng người #1.

### 4.3. Test tĩnh chống hard-code

| Test | Kiểm |
|---|---|
| `test_khong_hardcode_nguong` | `grep -rn "budget_cap\s*=\s*[0-9]\|max_distance\s*=\s*[0-9]"` trong `src/` → 0 |
| `test_chi_policy_py_doc_yaml` | `grep -rn "yaml.safe_load" src/ \| grep -v "common/policy.py"` → 0 |
| `test_toc_do_mot_gia_tri` | Số `25` (tốc độ) **không** xuất hiện dạng literal ngoài `policy.yaml` |

---

## 5. Hallucination

Không có LLM ở luồng chính → "hallucination" ở đây là **số liệu bịa ra từ lỗi tính toán**, nguy hiểm hơn vì trông hợp lệ.

### 5.1. Explanation khớp số liệu — 100% (§5.6)

| Test | Phương pháp |
|---|---|
| `test_explanation_khop_100` | Regex trích **mọi số** trong `explanation_text`, đối chiếu `explanation_data`. Chạy trên **≥ 50 plan** sinh ngẫu nhiên có seed |
| `test_reason_text_khop_offer` | Mọi số trong `reason_text` khớp field của offer (`distance_km`, `incentive_amount`, `eta_min`) |
| `test_explanation_khong_goi_llm` | `grep -rn "openai\|anthropic\|llm" src/explanation/templates.py` → **0** |

**AC:** **100%**, không phải 99%. Một số sai trong lời giải thích làm mất toàn bộ niềm tin của người vận hành vào phần còn lại.

### 5.2. Ba bất biến chống "bịa xe" — **chạy trong CI từ W3**

| Mã | Bất biến | Bắt được lỗi gì |
|---|---|---|
| **INV-1** | `simulate(moves=[], include_activation=False)` **khớp baseline đã khóa**, sai số ≤ 1e-6 | Simulator âm thầm đổi công thức sau khi baseline đã khóa → mọi uplift công bố đều sai |
| **INV-2** | Tổng cung toàn hệ thống ở `plan_only` **bằng** `no_action` | Relocation "tạo" ra xe từ hư không → giảm unmet demand giả tạo |
| **INV-3** | `enroute_supply == Σ enroute_arrivals[].units` ở **mọi** step | Xe được đếm hai lần, hoặc biến mất giữa đường |

### 5.3. Hai luật cứng — test tĩnh (§5.14.1)

```python
# tests/test_architecture.py — chạy trong CI từ W3
def test_simulator_imports_metrics():
    src = Path("src/simulation/simulator.py").read_text(encoding="utf-8")
    assert "from src.simulation.metrics import" in src or "from .metrics import" in src

def test_simulator_khong_cai_lai_cong_thuc():
    src = Path("src/simulation/simulator.py").read_text(encoding="utf-8")
    for dau_van_tay in ["3.0 *", "** 1.5", "-0.4 *", "8.0)"]:
        assert dau_van_tay not in src, f"Công thức metric bị cài lại trong simulator.py: {dau_van_tay}"

def test_metrics_khong_nhiem_tham_so():
    src = Path("src/simulation/metrics.py").read_text(encoding="utf-8")
    for cam in ["policy", "yaml", "forecasting", "lgbm"]:
        assert cam not in src.lower(), f"metrics.py bị nhiễm: {cam}"
```

> Viết lại công thức lần thứ hai trong `simulator.py` làm **mọi so sánh KPI mất hiệu lực** — spec cấm rõ ràng (§5.14.1). Hai bản cài đặt trôi khỏi nhau là loại lỗi không ai phát hiện cho tới lúc trình bày kết quả.

### 5.4. Quantile crossing

| Test | Kỳ vọng |
|---|---|
| `test_quantile_khong_cheo` | `p10 ≤ p50 ≤ p90` cho **100%** dòng dự báo, cả demand lẫn supply |

LightGBM train 3 objective quantile **độc lập** → crossing xảy ra được. Chế độ thận trọng `rain_peak` dựa thẳng vào hai đầu khoảng, nên crossing sẽ tạo ra gap âm hoặc gap phóng đại.

---

## 6. Safety

Không có nội dung sinh tự do → "safety" ở đây là **an toàn cho tài xế** và **trung thực của số liệu**.

### 6.1. C-08 — tính tự nguyện

| # | Test | Kỳ vọng |
|---|---|---|
| S1 | `test_tu_choi_mot_cham` | Endpoint respond nhận `decision: "decline"` **không kèm** `decline_reason` → **200** |
| S2 | `test_khong_co_truong_cham_diem` | Quét **toàn bộ** schema response: không có `accept_rate_of_driver`, `driver_rank`, `driver_score`, `driver_tier`, `reliability` |
| S3 | `test_khong_che_tai` | Từ chối n lần liên tiếp → **không** thay đổi thứ tự ứng viên, **không** giảm số offer nhận được |
| S4 | `test_offer_het_han_im_lang` | Offer hết hạn biến mất, **không** thông báo trách móc |
| S5 | `test_khong_huy_offer_da_gui` | Gap đã đủ → offer đang mở **vẫn giữ nguyên**, accept vẫn được trả thưởng |
| S6 | `test_khong_so_sanh_giua_tai_xe` | Màn Driver App **không** hiện dữ liệu của tài xế khác dưới bất kỳ hình thức nào |

### 6.2. Riêng tư

| # | Test | Kỳ vọng |
|---|---|---|
| S7 | `test_tai_xe_chi_thay_cua_minh` | `GET /drivers/{A}/offers` **không** trả offer của tài xế B |
| S8 | `test_khong_du_lieu_ca_nhan_that` | `display_name` khớp `^Tài xế \d+$`; không SĐT, không email, không biển số |
| S9 | `test_is_demo_account_luon_true` | 100% bản ghi; validator **từ chối** `false` |

### 6.3. C-03 — không tác động thật

| # | Test | Kỳ vọng |
|---|---|---|
| S10 | `test_khong_lenh_xe_that` | `grep -rn "fcm\|apns\|twilio\|zalo\|payment\|momo\|vnpay" src/` → **0** |
| S11 | `test_hai_cong_nguoi` | E2E: approve plan → **0 offer** được tạo. Chỉ `confirm: true` mới phát |
| S12 | `test_khong_endpoint_sua_history` | Quét route table: **không** có PUT/PATCH/DELETE trên history |

### 6.4. C-07 — trung thực KPI

| # | Test / quy tắc | Kỳ vọng |
|---|---|---|
| S13 | `test_accept_rate_source_bat_buoc` | Mọi bản ghi activation có `accept_rate_source`; **không có giá trị mặc định** |
| S14 | `test_khong_tron_nguon` | Bảng kết quả **không** gộp `simulated_model` và `human_demo` vào **cùng một ô** |
| S15 | Quy tắc trình bày | Mọi số KPI dán nhãn **"simulation proxy trên synthetic data"** |
| S16 | Quy tắc §5.14.3 | **Baseline khóa trước khi biết kết quả; kết quả xấu vẫn phải công bố** |

> S16 không phải test tự động — nó là cam kết quy trình. Cơ chế cưỡng chế là `BASELINE_FREEZE.md` có **commit hash + SHA-256**: baseline sửa sau khi biết kết quả sẽ để lại dấu vết không xóa được.

---

## 7. Latency & cost

### 7.1. Latency — benchmark theo NFR §6

Đo bằng `pytest-benchmark`, máy CI, **10 lần lấy p95**.

| Thao tác | Ngưỡng | KPI §1.7 |
|---|---|---|
| Forecast 30 zone / 1 horizon | **< 1 s** | ✅ |
| Tạo relocation plan (p95) | **≤ 5 s** | ✅ |
| Optimizer (thành phần) | ≤ 5 s → kill | §5.4 |
| Simulator 1 kịch bản | < 2 s | §5.5 |
| Re-simulate khi revise | **< 2 s** | ✅ |
| Sinh chiến dịch offer 30 zone | **< 2 s** | ✅ |
| Offer → hiển thị trên Driver App | **< 2 s** | ✅ |
| Phản hồi tài xế → metrics cập nhật | **< 2 s** | ✅ |
| Replay 1 ngày (288 step) không HITL | **< 5 phút** | ✅ |
| Explanation Lớp 1 | < 100 ms | §5.6 |

**Hai KPI latency phụ thuộc con người, không phải hệ thống** — đo trong UAT, không đo trong CI:

| Chỉ số | Ngưỡng | Cách đo |
|---|---|---|
| Quyết định của người vận hành | **≤ 2 phút/plan** | Đồng hồ trong UAT Dispatcher |
| Quyết định của tài xế | **≤ 20 giây/offer** | `response_latency_sec` từ `driver_response`, **chỉ tính bản ghi `source == "human_demo"`** |

### 7.2. Cost — **chi phí mô phỏng, không phải chi phí token**

Hệ thống **không gọi LLM ở MVP**. "Cost" là chi phí vận hành mô phỏng bằng VNĐ.

| Chỉ số | Đo gì | Trần |
|---|---|---|
| `plan_totals.total_cost` | Chi phí điều chuyển = `deadhead_cost_per_km × Σ deadhead_km` | `budget_cap` |
| `incentive_committed` | Cam kết thưởng **xấu nhất** (giả định 100% nhận) | `incentive_budget_cap` |
| `incentive_paid` | Thưởng thực trả = `Σ` offer `Accepted` | ≤ `incentive_committed` |
| **Chi phí trên mỗi unmet demand giảm được** | `(total_cost + incentive_paid) / Δunmet_demand` | Không có trần — là chỉ số **so sánh 3 kịch bản** |
| Tỷ lệ lãng phí overbooking | `(offers_accepted − units_needed) / units_needed` | Đánh giá `overbooking_factor` |

> Chỉ số "chi phí trên mỗi unmet demand giảm được" là thứ trả lời câu hỏi mà `unmet_demand` một mình không trả lời được: **huy động có đáng tiền không**. Khối C luôn giảm được gap nếu đổ đủ tiền thưởng — chỉ số này cho biết nó giảm với giá nào so với relocation thuần.

**Nếu bật LLM Lớp 2** (ngoài MVP): thêm cột token in/out + chi phí/plan. Nhưng **mọi run đánh giá KPI vẫn phải dùng Lớp 1** — Lớp 2 phá tính deterministic.

---

## 8. Ma trận đánh giá Model 1

**4 regime × 2 horizon × 2 target = 16 ô.** Mỗi ô báo cáo MAPE, MAE, và độ phủ khoảng p10–p90.

| | h15 demand | h15 supply | h30 demand | h30 supply |
|---|---|---|---|---|
| `normal` | | | | |
| `peak` | | | | |
| `rain` | | | | |
| **`rain_peak`** | **← thước đo thành công chính** | | | |

**AC:**
1. **MAPE < 15%** ở h15 demand, tính trên **toàn bộ** test set (§1.7).
2. **Thắng baseline historical average ≥ 20%** relative (MAE/MAPE) ở regime **`rain_peak`** (§1.7).
3. **`rain_peak` không được giấu trong số tổng** (§3.2 #6) — mọi bảng phải có dòng riêng.
4. Độ phủ khoảng: **~80%** giá trị thực nằm trong `[p10, p90]` (kiểm calibration; lệch nhiều nghĩa là quantile chưa hiệu chỉnh).
5. Ablation `rain × peak`: báo cáo MAPE **có** và **không có** ba feature tương tác, chứng minh đóng góp.

**Model 2** (§1.7): **hotspot recall ≥ 80%** so với ground truth A4, tách 4 regime.

**Khối B tổng thể** (§1.7): **giảm unmet demand ≥ 20%** so với baseline no-action đã khóa.
**Khối C** (§1.7): **giảm residual gap ≥ 30%** so với chỉ relocation.

---

## 9. Phân tích độ nhạy accept rate — **bắt buộc**

C-07 quy định accept rate là **giả định tham số hóa**, phải trình bày dạng **phân tích độ nhạy**. **Cấm** công bố một con số duy nhất.

| Accept rate | Nhãn | Vì sao chọn mức này |
|---|---|---|
| **0.25** | Bi quan | Tài xế ít hưởng ứng — kiểm KPI "giảm residual gap ≥ 30%" còn đứng không |
| **0.45** | Trung bình | Giữa hai cực |
| **0.65** | Lạc quan | Gần `assumed_accept_rate = 0.6` đang dùng để tính `overbooking_factor` |

Mỗi mức báo cáo: `offers_sent`, `offers_accepted`, `units_gained`, `incentive_paid`, `Δresidual_gap`, chi phí trên mỗi unmet demand giảm được, **và `accept_rate_source`**.

**AC:**
1. Bảng có **đủ 3 mức**; không có bảng nào chỉ một con số.
2. Ghi rõ mức nào **đạt** và mức nào **không đạt** KPI ≥ 30% — nếu 0.25 không đạt thì phải nói ra, không được chỉ trình bày 0.65.
3. `overbooking_factor = 1.6` được đánh giá lại theo kết quả thật của cả 3 mức.

---

## 10. UAT

### 10.1. Dispatcher (§1.7, §7 W6)

| Hạng mục | Chốt |
|---|---|
| Số người | ≥ 2 (một người đã phỏng vấn ở W1, một người mới) |
| Nhiệm vụ | Chạy kịch bản mưa 17:00–19:00 từ đầu đến cuối, có ít nhất một lần `revise` và một lần `reject` |
| Đo | **Usefulness/clarity ≥ 4/5**; thời gian quyết định **≤ 2 phút/plan** |
| Câu hỏi bắt buộc | "Bạn có hiểu vì sao hệ thống đề xuất chuyển xe từ zone này sang zone kia không?" — đây là bài kiểm tra thật của Explanation Lớp 1 |

### 10.2. Tài xế (§1.7 mới v1.1)

| Hạng mục | Chốt |
|---|---|
| Số người | **≥ 3** |
| Nhiệm vụ | Nhận offer trên `/driver`, quyết định Nhận hoặc Từ chối |
| Đo | **Clarity ≥ 4/5** — hiểu đúng **"đi đâu, thưởng bao nhiêu, được từ chối"** mà **không cần giải thích thêm** |
| | Thời gian quyết định **≤ 20 giây/offer** (`response_latency_sec` thật) |
| | Dùng được **một tay** trên màn hình **≥ 360px** (§6 khả dụng mobile) |
| Ghi nhận | `source = "human_demo"`, `accept_rate_source = "human_demo"` — **tách khỏi** mọi số mô phỏng |

> **Nếu không mời được ≥ 3 tài xế:** chạy với người đóng vai và ghi `accept_rate_source = simulated_model`, **không** báo cáo là số người thật. §7.1 có sẵn phương án dự phòng: hạ Driver App xuống chế độ trình diễn, mất phần UAT tài xế nhưng giữ KPI residual gap.

---

## 11. Bảng KPI tổng — 19 chỉ số §1.7

| # | Chỉ số | Mục tiêu | Đo ở |
|---|---|---|---|
| 1 | Luồng demo end-to-end | **5/5 lần** | §1.1 |
| 2 | Hotspot recall | **≥ 80%** | §8 |
| 3 | Giảm unmet demand vs baseline no-action | **≥ 20%** | §8 |
| 4 | Thời gian tạo plan (p95) | **≤ 5 s** | §7.1 |
| 5 | Quyết định người vận hành | **≤ 2 phút/plan** | §10.1 |
| 6 | UAT usefulness/clarity Dispatcher | **≥ 4/5** | §10.1 |
| 7 | Lưu lịch sử quyết định | **100%** | T6 AC#6 |
| 8 | Giảm residual gap sau activation | **≥ 30%** | §9 |
| 9 | Thời gian tài xế quyết định | **≤ 20 s/offer** | §10.2 |
| 10 | Độ trễ offer → hiển thị | **< 2 s** | §7.1 |
| 11 | Độ trễ phản hồi → metrics | **< 2 s** | §7.1 |
| 12 | UAT clarity Tài xế | **≥ 4/5** | §10.2 |
| 13 | Lưu lịch sử offer + phản hồi | **100%** | T6 AC#6 |
| 14 | MAPE dự báo tổng thể | **< 15%** | §8 |
| 15 | Thắng baseline ở `rain_peak` | **≥ 20%** relative | §8 |
| 16 | Độ trễ inference forecast | **< 1 s** | §7.1 |
| 17 | Độ trễ re-simulate | **< 2 s** | §7.1 |
| 18 | Explanation khớp số liệu | **100%** | §5.1 |
| 19 | Replay 288 step | **< 5 phút** | §7.1 |

### 11.1. Điều kiện tiên quyết — KPI #3 và #15 vô nghĩa nếu thiếu

§1.7 ghi rõ: hai KPI **giảm unmet demand ≥ 20%** và **thắng baseline ≥ 20%** *"chỉ có nghĩa khi mốc so đã khóa"* (I-08).

| Điều kiện | Trạng thái 08/08/2026 |
|---|---|
| Baseline no-action khóa đúng §5.14.1 | ❌ **Chưa** — thiếu `unmet_demand`, `avg_wait_proxy`, `est_cancel_rate`, Parquet chi tiết, `BASELINE_FREEZE.md` |
| Test set deterministic khóa | ❌ **Chưa** — `data/test_set/` không tồn tại |
| `metrics.py` tồn tại + có commit hash | ❌ **Chưa tồn tại** |
| Regime tagging dùng ngưỡng đã chốt | ❌ Đang dùng `rain > 0`, **`rain_peak` bão hòa ở hotspot rate 0.99986** |

**Cho tới khi T0.3 và T0.4 xong, không được công bố bất kỳ con số nào cho KPI #3 và #15.** Công bố sớm rồi khóa baseline sau là đúng thứ tự mà §5.14.3 cấm.
