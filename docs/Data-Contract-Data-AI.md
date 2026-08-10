# HỢP ĐỒNG DỮ LIỆU DATA ↔ AI — GSM-14 NovaFour

**Mục đích:** Định nghĩa **6 bộ dữ liệu/artifact** role Data phải bàn giao để role AI dùng làm input/output huấn luyện — kèm danh sách công việc role Data theo tuần.
**Người thực hiện:** Hồ Thanh Bình (Data/BA) · 
**Nguyên tắc ranh giới:** Data giao đến hết **A2 + A3 + A4 + A5 + A6** (feature và label đã sẵn sàng, có schema); role AI bắt đầu từ việc đọc Parquet và train — **không tự làm feature engineering**. Thiếu feature nào phải quay lại yêu cầu Data bổ sung, không tự chế để hai bên không lệch nhau.
**Cập nhật 2026-08-04 (v1.1):** bổ sung **A6 — Driver Registry & tham số phản hồi tài xế**, phát sinh từ quyết định thêm UI tài xế ([SPEC mục 12](SPEC-GSM14-NovaFour-Unified.md)).

---

## SƠ ĐỒ QUAN HỆ CÁC BỘ DỮ LIỆU

```
[zone_registry.json] + [policy.yaml] + [config generator (seed, tham số)]
        │
        v
   A1. Snapshot thô  ──────────────┬──────────────────────────┐
        │                          │                          │
        v (feature engineering)    v (join tương lai)         v (công thức hotspot trên số thực)
   A2. Bảng Feature ──── join ──── A3. Bảng Label ─────────── A4. Ground-truth Hotspot
        │                          │                          │
        └──────────────┬───────────┴──────────────────────────┘
                       v
   A5. Split walk-forward + Test set 7 ngày (freeze cuối W2)
                       │
                       v
              Role AI: train Model 1 (LightGBM quantile p10/p50/p90)
                       đo Model 2 (hotspot recall ≥80% so với A4)

   A1. Snapshot thô ──(dẫn xuất, KHÔNG sinh song song)──▶ A6. Driver Registry + tham số phản hồi
                                                              │
                                                              v
                                              Khối C: Activation Engine + Driver App
```

---

## A1. BẢNG SNAPSHOT THÔ (nền tảng của mọi thứ)

**Nguồn:** **lai** — cập nhật 2026-08-08 theo quyết định D3 ([DATA_CONTRACT.md §9](design/DATA_CONTRACT.md#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa)). Cột `rain_mm_h` lấy từ **NASA POWER 2025 thật** (file tĩnh `data/external/rain_hanoi_2025.csv`, có thêm biến thiên không gian theo zone); **mọi cột còn lại là synthetic generator**. Bản trước ghi "synthetic thuần 100%" — không còn đúng.
**Grain:** mỗi dòng = 1 zone × 1 bước 5 phút.
**Format:** Parquet — `data/snapshots/`.
**Quy mô:** 30 zone × 288 step/ngày × 49 ngày ≈ **423.000 dòng** (6 tuần train + 1 tuần test).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `ts_bucket` | datetime | mốc 5 phút, timezone +07:00 |
| `zone_id` | int 1–30 | khớp `zone_registry.json` |
| `demand_observed` | int | request **phát sinh** trong step (kể cả không được phục vụ — cần cho unmet demand) |
| `idle_supply` | int | xe rảnh trong zone |
| `enroute_supply` | int | xe đang di chuyển đến zone (chỉ do plan, synthetic không mô phỏng xe tự di chuyển). Chuyển thành `idle_supply` sau `eta_steps`, tính bằng `avg_vehicle_speed_kmh` trong `policy.yaml` — **dùng chung đúng giá trị với optimizer**, không hardcode riêng trong generator. **Phải bằng đúng `Σ enroute_arrivals[].units`** |
| `enroute_arrivals` | list[struct] | **Mới v1.3** — lịch đến chi tiết: `{arrival_ts, eta_steps, units, source ∈ {relocation, activation}, from_zone}`. Số vô hướng `enroute_supply` không cho biết unit nào khả dụng lúc nào, cũng không tách được xe từ Khối B với xe từ Khối C (acceptance SPEC 5.5). **Trong dữ liệu A1 do generator sinh, cột này luôn là list rỗng `[]`** — snapshot lịch sử không có plan nào, field chỉ được điền ở runtime bởi Simulator/Replay Engine. Giữ cột trong schema để A1 và snapshot runtime cùng một hình dạng, tránh hai schema song song |
| `rain_mm_h` | float | cường độ mưa hiện tại |
| `rain_forecast_15` | float | "nowcast" giả lập 15 phút tới — input ngoại sinh |
| `rain_forecast_30` | float | "nowcast" giả lập 30 phút tới |
| `peak_flag` | 0/1 | 1 nếu 7:00–9:00 hoặc 17:00–19:00 |
| `holiday_flag` | 0/1 | ngày lễ VN (xem mục 4.4 checklist — inject 1 ngày lễ giả để test) |
| `price_index` | float | giữ trong bảng nhưng AI **KHÔNG** dùng làm feature (đã chốt) |

**Yêu cầu chất lượng:**
- Không có ô null; không có bước 5 phút bị thiếu (đủ 288 step/ngày × 30 zone).
- Cùng seed → tái tạo đúng 100% (kiểm bằng checksum).
- Rain injection đúng hệ số research: cầu +0.59%/mm/h (Liu et al.); cung giảm tại `peak_flag=1` khi mưa (Kamga & Yazici, % giảm chốt tại checklist 0.3).

---

## A2. BẢNG FEATURE (input Model 1)

**Grain:** mỗi dòng = 1 zone × 1 thời điểm t0 (chỉ các t0 có đủ 6 bước lịch sử phía trước).
**Format:** Parquet — `data/features/`.
**Nguyên tắc:** Data làm feature engineering sẵn — AI không tự chế thêm.

| Nhóm | Cột | Ghi chú |
|---|---|---|
| Khóa | `zone_id`, `ts_bucket` | join key với A3 |
| Định danh | `zone_id` (categorical) | |
| Thời gian | `hour_of_day`, `bucket_in_hour`, `day_of_week`, `peak_flag`, `holiday_flag` | derive từ `ts_bucket`, KHÔNG dùng raw timestamp. `bucket_in_hour = minute(ts_bucket) // 5` để model phân biệt đầu/cuối giờ khi dự báo `t0+15` |
| Lịch sử demand | `demand_observed_lag_0` … `demand_observed_lag_6` | 7 cột, lookback N=6 bước (30 phút) — đã chốt |
| Lịch sử supply | `idle_supply_lag_0` … `idle_supply_lag_6` | 7 cột |
| Rolling | `demand_roll_mean_30`, `demand_roll_std_30`, `supply_roll_mean_30`, `supply_roll_std_30` | window 30 phút |
| Mưa | `rain_mm_h`, `rain_lag_1` … `rain_lag_6`, `rain_forecast_15`, `rain_forecast_30` | |
| **Tương tác** | **`rain_x_peak` = `rain_mm_h × peak_flag`**, **`rain_fc15_x_peak` = `rain_forecast_15 × peak_flag`**, **`rain_fc30_x_peak` = `rain_forecast_30 × peak_flag`** (mới v1.3) | **Bắt buộc — feature quyết định của đề tài.** `rain_fc30_x_peak` bổ sung 2026-08-06: model horizon 30 trước đó không có feature tương tác nào, phải tự học tích của hai biến từ hai cột rời — trong khi đây chính là signal của đề tài. 3 cột, chi phí sinh gần bằng 0 |

**KHÔNG có trong bảng này (đã chốt):** feature zone lân cận, `price_index`, `avg_wait_time_sec`, `avg_distance_km`.

---

## A3. BẢNG LABEL (target để AI train — phần dễ bị bỏ sót nhất)

**Grain:** join 1-1 với A2 theo (`zone_id`, `ts_bucket`).
**Format:** Parquet — `data/labels/` (hoặc gộp chung file với A2, cột prefix `target_`).

| Cột | Định nghĩa |
|---|---|
| `target_demand_15` | `demand_observed` của chính zone đó tại bucket t0+15 phút |
| `target_demand_30` | ... tại t0+30 phút |
| `target_supply_15` | `idle_supply` tại t0+15 phút |
| `target_supply_30` | `idle_supply` tại t0+30 phút |
| `regime_15` | nhãn `normal/peak/rain/rain_peak` **tại thời điểm t0+15** — tách metric 4 chế độ |
| `regime_30` | nhãn tại t0+30 |

**Lưu ý:**
- AI train quantile p10/p50/p90 trên đúng các target này — không cần label riêng cho quantile.
- **v1.3:** SPEC 4.2 bổ sung `supply_p10`/`supply_p90` vào forecast output. Đây là **quantile train trên `target_supply_15/30` đã có sẵn ở bảng này** — **A3 không phát sinh cột mới**, Data không phải sinh thêm gì. Chỉ là phía AI xuất thêm 2 đầu ra từ model supply vốn đã bắt buộc train.
- Nhãn regime sinh từ **hàm regime tagging dùng chung** (một hàm duy nhất, cả 3 model + explanation cùng import — không mỗi nơi tự viết).
- Dòng nào không đủ tương lai (cuối timeline) → loại khỏi bảng, không để null.

---

## A4. BẢNG GROUND-TRUTH HOTSPOT (đáp án chấm Model 2, recall ≥80%)

**Grain:** mỗi dòng = 1 zone × 1 forecast_ts × 1 horizon.
**Format:** Parquet — `data/ground_truth/`.

| Cột | Định nghĩa |
|---|---|
| `zone_id`, `forecast_ts`, `horizon_min` | khóa |
| `demand_actual`, `supply_actual` | giá trị thực tế tại forecast_ts (từ A1) |
| `gap_actual` | `demand_actual − supply_actual` |
| `is_hotspot_actual` | áp **đúng công thức hotspot của spec** lên số thực tế: `(supply_actual < min_supply_per_zone) OR (gap_actual / demand_actual ≥ 0.3)` |
| `regime` | nhãn tại forecast_ts |

**Lưu ý:** tính từ giá trị **thực tế**, không phải dự báo — đây là đáp án; Model 2 chạy trên dự báo rồi so với bảng này để tính recall theo từng regime.

---

## A5. SPLIT & TEST SET ĐÓNG BĂNG

**Format:** file config `data/splits.yaml` + thư mục `data/test_set/` (freeze).

| Thành phần | Định nghĩa |
|---|---|
| Walk-forward folds | Train N tuần → test 1 tuần, trượt theo thời gian, **không shuffle**. Ghi rõ ngày bắt đầu/kết thúc từng fold. |
| Test set cuối | **7 ngày** synthetic, **seed riêng** (khác seed train — đề xuất train=42, test=2026), ép **≥2 sự kiện `rain_peak`** |
| Quy tắc | Test set **không được dùng** để train Model 1 hay tune ngưỡng hotspot/optimizer. **Freeze cuối W2** cùng thời điểm khóa KPI (I-08) — sau đó không sửa. |

**Kèm theo (điều kiện tiên quyết cho A1–A6):**
- `config/zone_registry.json` — 30 zone: `{zone_id, zone_name, lat, lng, tier}`
- `config/policy.yaml` — **18 giá trị**: 8 key Phần 1 checklist (gồm `avg_vehicle_speed_kmh`, dùng chung cho generator, optimizer và activation) + **10 key nhóm activation Phần 1B** (mới v1.1)
- `config/generator.yaml` — seed + toàn bộ tham số synthetic (Phần 3 checklist), kèm citation hệ số research
- **`config/driver_registry.json`** — mới v1.1, xem A6

---

## A6. DRIVER REGISTRY & THAM SỐ PHẢN HỒI TÀI XẾ (mới v1.1 — input cho Khối C)

**Nguồn:** **dẫn xuất từ A1**, không sinh độc lập.
**Grain:** mỗi dòng = 1 tài xế × 1 bước 5 phút (bảng trạng thái) + 1 file config tĩnh cho danh sách tài xế.
**Format:** `config/driver_registry.json` (danh sách tĩnh) + Parquet `data/driver_states/` (trạng thái theo thời gian).
**Quy mô:** 600 tài xế × 288 step/ngày × 49 ngày ≈ **8,5 triệu dòng** → nếu quá nặng, chỉ sinh cho **7 ngày test set + các ngày dùng demo**, không sinh cho toàn bộ 49 ngày (AI không train trên bảng này).

### A6a. Danh sách tài xế tĩnh — `config/driver_registry.json`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `driver_id` | string `DRV-nnnn` | khóa chính |
| `display_name` | string | nhãn giả (`Tài xế 142`) — **không dùng dữ liệu cá nhân thật** |
| `home_zone` | int 1–30 | zone hoạt động chính; dùng làm vị trí khi tài xế `offline` |
| `shift_end_ts_pattern` | string/time | mẫu giờ tan ca (phân phối quanh 19:00–22:00) |
| `is_demo_account` | bool | **luôn `true`** ở MVP (C-03) |

### A6b. Trạng thái tài xế theo thời gian — `data/driver_states/`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `ts_bucket` | datetime | khớp A1 |
| `driver_id` | string | |
| `current_zone` | int 1–30 | |
| `status` | enum | `online_idle \| online_busy \| offline` |
| `minutes_to_shift_end` | int | dùng cho hệ số `w_shift_end` trong mô hình phản hồi |

**🔴 Ràng buộc nhất quán (quan trọng nhất của bộ A6):**
```
với mọi (ts_bucket, zone):
    COUNT(driver_states WHERE status = 'online_idle' AND current_zone = zone)
      ==  A1.idle_supply[ts_bucket, zone]
```
Nếu sinh `driver_states` độc lập với A1, số tài xế online sẽ lệch `idle_supply` và **toàn bộ metrics mô phỏng sai** mà không có cảnh báo nào. Bắt buộc dẫn xuất từ A1 và có **test tự động kiểm tra khớp 100% ở mọi bucket** — đây là DoD số 7 bên dưới.

### A6c. Tham số mô hình phản hồi tài xế

Không phải bảng dữ liệu mà là **file tham số** (`config/driver_response.yaml`): `base_rate`, `w_incentive`, `w_distance`, `w_shift_end`, ngưỡng `is_near_shift_end`, seed, chênh lệch `offline` vs `online_idle`. Giá trị chốt tại [Data-Checklist Phần 8B](Data-Checklist-Chot-Data.md).

> ⚠️ **Đây là giả định, không phải dữ liệu.** Khác hẳn bản chất với A1–A5 (được tham số hóa từ research có citation). Không có nguồn thực nghiệm nào cho các hệ số này — bắt buộc kèm phân tích độ nhạy 3 mức khi báo cáo (C-07).

**Tỷ lệ `offline` là biến quan trọng nhất của bộ này:** nó quyết định "hồ chứa" mà activation kéo từ đó. Phải phản ánh đúng hiệu ứng Kamga & Yazici — **khi mưa trúng giờ cao điểm, tỷ lệ offline tăng** (tài xế nghỉ sớm). Nếu generator không tạo ra hiệu ứng này thì Khối C mất phần lớn ý nghĩa: không có ai để huy động.

---

## CÔNG VIỆC ROLE DATA THEO THỨ TỰ

| # | Tuần | Việc | Deliverable |
|---|---|---|---|
| 1 | W1 | Chốt `zone_registry.json` (30 zone + lat/lng + tier) và `policy.yaml` — điền Phần 1–2 [checklist](Data-Checklist-Chot-Data.md) | 2 file config |
| 2 | W1 | Viết synthetic generator (tham số Phần 3 checklist): demand/supply nền theo tier × giờ, rain injection theo hệ số research, seed cố định | Script generator + **A1** |
| 3 | W1 | Viết hàm **regime tagging dùng chung** (`normal/peak/rain/rain_peak`) — một hàm duy nhất cho cả pipeline | Module `regime.py` |
| 4 | W1–W2 | Pipeline feature engineering A1 → **A2** (lag, rolling, rain×peak) + join label → **A3**; xuất Parquet + schema doc từng cột | **A2 + A3** + schema doc |
| 5 | W2 | Sinh **A4** (ground-truth hotspot) và **A5** (folds + test set 7 ngày, freeze) | **A4 + A5** |
| **5b** | **W2** | 🔴 **Sinh A6** — `driver_registry.json` + `driver_states/` dẫn xuất từ A1 + `driver_response.yaml`; viết test khớp `idle_supply`. Đảm bảo tỷ lệ `offline` tăng khi mưa trúng peak | **A6** + test nhất quán |
| 6 | W2 | Chạy **baseline historical average** (zone × giờ × dow) trên A3 → bảng metric theo 4 regime — mốc model AI phải thắng ≥20% ở `rain_peak` | Bảng metric baseline |
| 7 | W2 | EDA/sanity check: phân phối demand hợp lý; sự kiện mưa tạo spike cầu + sụt cung đúng hệ số; tỷ lệ mẫu `rain_peak` đủ (~30% ngày) | Báo cáo ngắn + biểu đồ |
| 8 | W1–W2 | (Nhánh BA) Phỏng vấn Dispatcher → cập nhật ngược `policy.yaml` + mục 5–6 [DataBA-Decisions.md](DataBA-Decisions.md) | Biên bản + config cập nhật |
| 9 | W3+ | Hỗ trợ AI kiểm tra leak (label không lọt vào feature), tune ngưỡng hotspot; W5 chuẩn bị bảng số liệu demo (ghi chú "simulation proxy", C-07) | Báo cáo hỗ trợ |

---

## ĐỊNH NGHĨA HOÀN THÀNH (DoD) CHO BÀN GIAO DATA → AI

1. A1–A6 đều ở dạng Parquet/config, đọc được bằng pandas không cần xử lý thêm.
2. Mỗi bảng có schema doc: tên cột, kiểu, định nghĩa, cách sinh.
3. Chạy lại generator cùng seed → checksum khớp 100% (**gồm cả A6**).
4. Không null, không thiếu bước thời gian, join A2↔A3 khớp 1-1.
5. Kiểm tra leak cơ bản: không cột nào trong A2 chứa thông tin từ tương lai sau t0.
6. Baseline metric (việc #6) có sẵn để AI so sánh ngay khi train xong model đầu tiên.
7. **(v1.1) Test nhất quán A6 ↔ A1 pass 100%:** số tài xế `online_idle` theo zone khớp `idle_supply` ở **mọi** `ts_bucket`. Đây là điều kiện chặn — A6 lệch A1 làm sai toàn bộ metrics của Khối C mà không phát ra lỗi.
8. **(v1.1)** Kiểm chứng bằng biểu đồ: tỷ lệ tài xế `offline` **tăng rõ** trong các sự kiện mưa trúng giờ cao điểm (nếu không, activation không có ai để huy động và KPI residual gap ≥30% là không đạt được).
