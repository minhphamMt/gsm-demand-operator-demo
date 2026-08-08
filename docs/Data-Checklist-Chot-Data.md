# CHECKLIST CHỐT DATA & CÔNG VIỆC DATA/BA — GSM-14 NovaFour

**Người nhận:** Hồ Thanh Bình (Data/BA), Đồng Đại Huy (Fullstack/AI)
**Người gửi:** Nguyễn Thành Duy (PM)
**Mục đích:** Chốt toàn bộ thông số dữ liệu chi tiết để bắt đầu code Sprint 3–4. Điền trực tiếp vào cột **"Giá trị chốt"** rồi gửi lại — các ô có đề xuất sẵn thì xác nhận ✅ hoặc sửa.
**Deadline:** trước khi khóa contract + KPI cuối Tuần 2 (I-08).
**Cập nhật 2026-08-04 (v1.1):** nhóm chốt bổ sung **UI tài xế (Driver App)** → phát sinh **Phần 1B** (10 key policy activation) và **Phần 8** (driver registry + tham số mô hình phản hồi tài xế). Hai phần này **cùng deadline cuối W2** với các phần cũ — xem [SPEC mục 12](SPEC-GSM14-NovaFour-Unified.md).
**Tài liệu liên quan:** [SPEC-GSM14-NovaFour-Unified.md](SPEC-GSM14-NovaFour-Unified.md) · [DataBA-Decisions.md](DataBA-Decisions.md) · [feature_dictionary.md](feature_dictionary.md)

---

## PHẦN 0 — NGUỒN DỮ LIỆU (ĐÃ CHỐT, chỉ cần xác nhận)

| # | Hạng mục | Quyết định | Trạng thái |
|---|---|---|---|
| 0.1 | Nguồn dữ liệu chính | **Synthetic thuần 100%**, tham số hóa từ research — KHÔNG dùng NYC TLC / Didi GAIA | ✅ Đã chốt (PM 2026-08-04, lý do tại [DataBA-Decisions.md](DataBA-Decisions.md#1-nguồn-dữ-liệu)) — Data xác nhận: ☐ |
| 0.2 | Hệ số rain injection (cầu) | +0.59% ridership / mm/h mưa (Liu et al. 2021, Haikou DiDi); tham chiếu thêm +19–22% tổng thể khi mưa (Brodeur & Nield 2018) | ✅ Có citation — Data xác nhận cách áp dụng: ☐ |
| 0.3 | Hệ số rain injection (cung) | Cung giảm khi mưa trúng giờ cao điểm chiều 17:00–19:00 (Kamga & Yazici) — **mức giảm % cụ thể cần Data đề xuất** (paper không cho số trực tiếp áp được) | ⬜ Cần chốt: giảm ___% supply khi rain ≥ ngưỡng tại peak |
| 0.4 | Dữ liệu mưa | Input ngoại sinh có sẵn trong snapshot (`rain_mm_h`, `rain_forecast_15/30`) — giả lập nowcasting, KHÔNG gọi API thời tiết thật | ✅ Đã chốt theo SPEC — Data xác nhận: ☐ |
| 0.5 | Công thức wait/cancel proxy | `avg_wait_proxy = 3.0 × ratio^1.5` (phút); `est_cancel_rate = logistic(0.4, điểm uốn 8 phút)` | ✅ Đã chốt (chi tiết [DataBA-Decisions.md](DataBA-Decisions.md#3-công-thức-avg_wait_proxy--est_cancel_rate)) — Data xác nhận: ☐ |
| 0.6 | Baseline no-action + test set | Test set = 7 ngày synthetic seed riêng, ép ≥2 sự kiện `rain_peak`; baseline = `simulate(moves=[])`; test set không dùng để train | ✅ Đã chốt phương pháp — Data thực thi trước cuối W2: ☐ |
| 0.7 | `price_index` | KHÔNG dùng làm feature Model 1 (giữ field trong snapshot cho tương lai) | ✅ Đã chốt — Data xác nhận: ☐ |

---

## PHẦN 1 — POLICY.YAML (🔴 khẩn nhất — Optimizer không code được nếu thiếu)

> feature_dictionary ghi "dùng nguyên bảng policy.yaml đã build" — nhưng repo chưa có file này hoặc chưa có giá trị. Cần Data/BA điền số + căn cứ.

| # | Field | Mô tả | Đề xuất khởi điểm | **Giá trị chốt** | Căn cứ |
|---|---|---|---|---|---|
| 1.1 | `min_supply_per_zone` | Số xe tối thiểu phải giữ lại mỗi zone (điều kiện hotspot + ràng buộc zone nguồn) | 3 xe | | |
| 1.2 | `budget_cap` | Trần ngân sách điều chuyển — **cần chốt cả đơn vị**: VNĐ/ngày hay VNĐ/plan? | 500.000 VNĐ/plan | | |
| 1.3 | `max_distance` | Khoảng cách điều xe tối đa 1 move | 7 km | | |
| 1.4 | `max_supply_move_pct` | % tối đa idle_supply được rút khỏi zone nguồn trong 1 plan | 40% (theo SPEC gốc) | | |
| 1.5 | `cooldown_minutes` | Zone vừa được điều chỉnh bị loại khỏi plan mới trong bao lâu | 15 phút (3 step) | | |
| 1.6 | `priority_zones` | Danh sách zone ưu tiên xử lý trước khi hết budget | Chờ Zone Registry (Phần 2) | | |
| 1.7 | `deadhead_cost_per_km` | Đồng/km chạy rỗng — để tính `estimated_cost` so với `budget_cap` | 4.000 VNĐ/km | | |
| 1.8 | `avg_vehicle_speed_kmh` | Tốc độ trung bình xe nội đô — dùng chung cho **(a)** Generator/Simulator chuyển `enroute_supply` → `idle_supply`, **(b)** Optimizer tính `eta_steps` và **(c)** Activation Engine tính ETA cho offer | 25 km/h | **✅ 25** (Data/BA chốt 2026-08-04) | Tốc độ nội đô giờ cao điểm, đã tính yếu tố kẹt xe; một giá trị dùng chung để 3 module không lệch nhau |

### PHẦN 1B — POLICY.YAML: NHÓM ACTIVATION (🔴 mới v1.1 — Driver App/Activation Engine không code được nếu thiếu)

> Phát sinh từ quyết định nhóm 2026-08-04 (bổ sung UI tài xế — [SPEC mục 12](SPEC-GSM14-NovaFour-Unified.md)). **Phải chốt cùng mốc khóa contract cuối W2**, không được để sang W3.

| # | Field | Mô tả | Đề xuất khởi điểm | **Giá trị chốt** | Căn cứ |
|---|---|---|---|---|---|
| 1.9 | `incentive_budget_cap` | Trần ngân sách thưởng huy động — **độc lập với `budget_cap`** (C-09), cùng đơn vị VNĐ/plan | 200.000 VNĐ/plan | | |
| 1.10 | `incentive_base` | Thưởng nền cho 1 offer được nhận | 20.000 VNĐ | | |
| 1.11 | `incentive_per_km` | Phụ cấp theo km tài xế phải di chuyển tới zone thiếu | 3.000 VNĐ/km | | |
| 1.12 | `incentive_max_per_offer` | Trần thưởng 1 offer — chặn zone xa đẩy thưởng lên vô lý | 50.000 VNĐ | | |
| 1.13 | `activation_radius_km` | Bán kính tìm tài xế ứng viên quanh zone thiếu | 5 km | | Nên **≤ `max_distance`** (1.3) — tài xế tự đi thường chấp nhận quãng ngắn hơn xe được điều |
| 1.14 | `offer_ttl_minutes` | Thời hạn offer trước khi tự hết hạn | 10 phút (2 step) | | Phải **ngắn hơn horizon 15 phút**, nếu không offer hết hạn khi nhu cầu đã qua |
| 1.15 | `max_offers_per_driver_per_hour` | Chống spam tài xế (C-08) | 3 | | |
| 1.16 | `overbooking_factor` | Gửi dư offer vì không phải ai cũng nhận. `n_offers = ceil(gap × factor)` | 1.6 | | Nên xấp xỉ `1 / assumed_accept_rate` — nếu lệch nhiều sẽ luôn thừa hoặc luôn thiếu |
| 1.17 | `assumed_accept_rate` | Tỷ lệ nhận **giả định** để ước lượng trước | 0.6 | | ⚠️ Là giả định, không có nguồn thực nghiệm — phải ghi rõ ở mọi báo cáo (C-07) |
| 1.18 | `min_idle_before_activation` | Không rút tài xế `online_idle` khỏi zone nếu xuống dưới ngưỡng này | Bằng `min_supply_per_zone` (1.1) | | Nên để bằng 1.1 cho nhất quán, tránh 2 ngưỡng gần giống nhau gây nhầm |

> ⚠️ **Kiểm tra chéo bắt buộc trước khi khóa:** `incentive_budget_cap` phải đủ cho ít nhất `ceil(residual_gap điển hình × overbooking_factor)` offer ở mức `incentive_max_per_offer`, tính theo **cam kết xấu nhất (100% nhận)**. Nếu không, chiến dịch sẽ luôn bị cắt giữa chừng vì hết ngân sách và KPI "giảm residual gap ≥30%" không bao giờ đạt. Với đề xuất khởi điểm: gap 12 xe × 1.6 = 20 offer × 50.000 = 1.000.000đ ≫ 200.000đ → **hoặc nâng `incentive_budget_cap`, hoặc hạ `incentive_max_per_offer`, hoặc chấp nhận chỉ phủ được một phần gap**. Cần Data/BA chọn hướng và ghi rõ lý do.

---

## PHẦN 2 — ZONE REGISTRY (🔴 chưa tồn tại — cần tạo file `zone_registry.csv/json`)

| # | Hạng mục | Cần chốt | **Giá trị chốt** |
|---|---|---|---|
| 2.1 | Danh sách 30 zone | 30 khu vực Hà Nội cụ thể (gợi ý: theo quận/cụm phường — Cầu Giấy, Đống Đa, Hoàn Kiếm, Ba Đình, Hai Bà Trưng, Thanh Xuân, Nam/Bắc Từ Liêm, Long Biên, Hà Đông, Tây Hồ, Hoàng Mai...) | |
| 2.2 | Tọa độ centroid | `zone_lat`, `zone_lng` mỗi zone — dùng tính travel time matrix + kiểm tra `max_distance` | |
| 2.3 | Phân loại zone | Mỗi zone gắn nhãn `busy / medium / quiet` — quyết định mức demand/supply nền khi sinh synthetic | |
| 2.4 | Schema file | Đề xuất: `zone_registry.json` gồm `{zone_id, zone_name, lat, lng, tier}` — cố định, không đổi sau W2 | |

---

## PHẦN 3 — THAM SỐ SYNTHETIC GENERATOR (🟡 cần trước Sprint 3)

| # | Hạng mục | Cần chốt | Đề xuất khởi điểm | **Giá trị chốt** |
|---|---|---|---|---|
| 3.1 | Tổng fleet size | Tổng số xe toàn hệ thống (30 zone) | 600 xe (~20 xe/zone trung bình) | |
| 3.2 | Demand nền | Range request/5 phút theo tier zone × khung giờ (đêm / thấp điểm / cao điểm) | quiet: 2–8; medium: 5–20; busy: 10–45 | |
| 3.3 | Phân phối demand | Poisson hay Negative Binomial (kèm tham số) | Poisson với λ theo bảng 3.2 | |
| 3.4 | Ngưỡng "đang mưa" | `rain_mm_h ≥ ?` để gán regime `rain`/`rain_peak` và kích hoạt hệ số kẹt xe | ≥ 0.5 mm/h = mưa; ≥ 5 mm/h = mưa to (kích hoạt hệ số travel 1.3–1.5) | |
| 3.5 | Số ngày dữ liệu sinh | Đủ walk-forward backtest (train N tuần → test 1 tuần, trượt) + 7 ngày test set | 6 tuần train + 1 tuần test = 49 ngày | |
| 3.6 | Tỷ lệ ngày có `rain_peak` | `rain_peak` hiếm tự nhiên — ép tỷ lệ đủ để model học | ~30% số ngày có ≥1 sự kiện mưa trúng giờ cao điểm | |
| 3.7 | Seed | Seed train / seed test tách riêng, ghi vào config | train=42, test=2026 | |
| 3.8 | Kịch bản mưa | Hình dạng sự kiện mưa: bắt đầu đột ngột hay tăng dần, kéo dài bao lâu | Ramp 10–15 phút, kéo dài 30–90 phút, cường độ đỉnh 5–15 mm/h | |

---

## PHẦN 4 — ĐỊNH NGHĨA FIELD CHÍNH XÁC (🟡 tránh hiểu lệch khi code)

| # | Field | Câu hỏi cần chốt | Đề xuất | **Chốt** |
|---|---|---|---|---|
| 4.1 | `demand_observed` | Đếm request **phát sinh** trong step hay chỉ chuyến **hoàn thành**? | Request phát sinh (kể cả bị hủy/không có xe) — vì cần đo unmet demand | |
| 4.2 | `idle_supply` | Có trần tối đa cố định theo zone không? Xe hết chuyến ở zone nào thì tính vào zone đó? | Không trần; xe idle tính theo zone hiện diện | |
| 4.3 | `enroute_supply` | Chỉ gồm xe do plan điều đến, hay cả xe tự di chuyển? | Chỉ xe do plan (synthetic không mô phỏng xe tự di chuyển) | |
| 4.4 | `holiday_flag` | Ngày lễ VN trong khung 27/07–31/08/2026 | Chỉ 02/09 nằm ngoài khung → toàn bộ = 0; giữ field cho tính tổng quát + inject 1 ngày lễ giả vào synthetic để test | |
| 4.5 | Tên field lịch sử | `supply_count/demand_count` (feature_dictionary) vs `idle_supply/demand_observed` (snapshot) — cùng dữ liệu, khác tên | Chuẩn hóa theo snapshot: `idle_supply[t-6..t0]`, `demand_observed[t-6..t0]` | |

---

## PHẦN 5 — TRAVEL TIME MATRIX (🟢 cần trước Sprint 5)

| # | Hạng mục | Cần chốt | Đề xuất | **Chốt** |
|---|---|---|---|---|
| 5.1 | Tốc độ trung bình | km/h để đổi khoảng cách → `eta_steps` | ~~22 km/h~~ | **✅ 25 km/h** — đã chuyển thành key `avg_vehicle_speed_kmh` trong policy.yaml (mục **1.8**), không để rời ở đây nữa |
| 5.2 | Hệ số khi mưa | Nhân travel time khi `rain_mm_h` vượt ngưỡng 3.4 | 1.3 (mưa vừa) / 1.5 (mưa to) | |
| 5.3 | Nguồn khoảng cách | Precompute ma trận 30×30 thành file, hay tính on-the-fly? | Haversine trực tiếp từ `zone_registry.json` | **✅ Haversine on-the-fly, KHÔNG tạo file matrix** (Data/BA chốt 2026-08-04) |
| 5.3b | Hệ số mạng lưới đường | Haversine là đường chim bay — có nhân hệ số detour không? | Haversine × 1.4 (đường Hà Nội không thẳng) | ⬜ **CÒN TREO — xem cảnh báo dưới bảng** |
| 5.4 | Làm tròn eta | `eta_steps = ceil(travel_time / 5 phút)` | ceil, tối thiểu 1 step | |
| 5.5 | Đơn vị của `max_distance` | 7 km (mục 1.3) đo theo đường chim bay hay đường thật? | Thống nhất với quyết định 5.3b | ⬜ **CÒN TREO** |

> ⚠️ **Cần Data/BA làm rõ — ảnh hưởng trực tiếp đến tập move khả thi:** `avg_vehicle_speed_kmh = 25` là tốc độ đo trên **quãng đường thật** hay áp thẳng lên **đường chim bay haversine**? Ví dụ 2 zone cách nhau 7 km chim bay:
> - Còn nhân hệ số detour 1.4 → 9.8 km đường thật → 23,5 phút → **5 step**
> - Bỏ hệ số detour (25 km/h áp thẳng lên haversine) → 16,8 phút → **4 step**
>
> SPEC quy định optimizer **ưu tiên nguồn có `eta ≤ 3 step`**, nên chênh 1–2 step làm đổi hẳn tập zone nguồn được chọn. Chốt 5.3b thế nào thì 5.5 (`max_distance`) phải theo đúng thế đó để không so sánh nhầm đơn vị.

---

## PHẦN 6 — HẠ TẦNG LƯU TRỮ (🟢 chọn 1 để code)

| # | Hạng mục | Lựa chọn | Đề xuất | **Chốt** |
|---|---|---|---|---|
| 6.1 | Snapshot Store | Parquet hay SQLite | Parquet (đọc nhanh theo cột, hợp replay + backtest pandas) | |
| 6.2 | History Store | JSON append-only hay SQLite | SQLite (truy vấn theo `plan_id`/khoảng thời gian dễ hơn) | |
| 6.3 | Vị trí file | Cấu trúc thư mục data trong repo | `data/snapshots/`, `data/history.db`, `config/policy.yaml`, `config/zone_registry.json`, **`config/driver_registry.json`** | |
| 6.4 | Offer Store (mới v1.1) | Lưu offer + phản hồi ở đâu | Cùng SQLite với History (bảng `offers`, `driver_responses`) — cần join theo `plan_id`/`campaign_id` để tính accept rate | |

---

## PHẦN 8 — DRIVER REGISTRY & MÔ HÌNH PHẢN HỒI TÀI XẾ (🔴 mới v1.1 — đánh số 8 để giữ nguyên số của các phần cũ)

> Phát sinh từ quyết định nhóm 2026-08-04 (bổ sung UI tài xế). Cần chốt **cùng mốc cuối W2**. Chi tiết contract: [SPEC mục 4.7](SPEC-GSM14-NovaFour-Unified.md) · thuật toán: SPEC mục 5.11.

### 8A. `driver_registry.json`

| # | Hạng mục | Cần chốt | Đề xuất | **Chốt** |
|---|---|---|---|---|
| 8.1 | Tổng số tài xế trong registry | Phải khớp tổng fleet size (mục 3.1) | 600 tài xế = 600 xe (1 tài xế/1 xe, đúng ràng buộc 1 loại phương tiện) | |
| 8.2 | Phân bổ tài xế theo zone | `home_zone` phân bổ theo tier zone (busy nhiều hơn quiet) | Tỷ lệ theo demand nền mục 3.2 | |
| 8.3 | Tỷ lệ `offline` theo khung giờ | Bao nhiêu % tài xế đang nghỉ ở mỗi khung giờ — **đây là "hồ chứa" mà activation kéo từ đó** | Đêm 60%, thấp điểm 30%, cao điểm 15%; **khi mưa trúng peak: tăng thêm 10–15%** (đúng hiệu ứng Kamga & Yazici) | |
| 8.4 | Tỷ lệ `online_busy` / `online_idle` | Trong số tài xế online, bao nhiêu đang có khách | Suy ra từ `demand_observed` và `idle_supply` đã sinh ở A1 — **không sinh độc lập** | |
| 8.5 | Quy tắc nhất quán với snapshot | Số tài xế `online_*` theo zone phải **khớp** `idle_supply` trong A1 tại cùng `ts_bucket` | Sinh `driver_registry` **từ** A1 (dẫn xuất), không sinh song song | |
| 8.6 | `shift_end_ts` | Có mô phỏng giờ tan ca không | Có — phân phối quanh 19:00–22:00, dùng cho hệ số `w_shift_end` | |

> ⚠️ **Điểm dễ sai nhất:** nếu sinh `driver_registry` độc lập với A1, số tài xế online sẽ lệch `idle_supply` và toàn bộ metrics mô phỏng sai. Bắt buộc **dẫn xuất từ A1**, và có test kiểm tra khớp 100% ở mọi `ts_bucket`.

### 8B. Tham số mô hình phản hồi tài xế (`driver response simulator`)

Công thức (SPEC 5.11):
```
p_accept = clip(base_rate
                + w_incentive × (incentive_amount / incentive_max_per_offer)
                − w_distance  × (distance_km / activation_radius_km)
                − w_shift_end × is_near_shift_end,
                0.05, 0.95)
```

| # | Tham số | Ý nghĩa | Đề xuất | **Chốt** |
|---|---|---|---|---|
| 8.7 | `base_rate` | Xác suất nhận nền khi thưởng trung bình, gần, chưa sắp hết ca | 0.45 | |
| 8.8 | `w_incentive` | Mức thưởng kéo xác suất lên bao nhiêu | 0.35 | |
| 8.9 | `w_distance` | Khoảng cách kéo xác suất xuống bao nhiêu | 0.25 | |
| 8.10 | `w_shift_end` | Trừ thêm nếu còn <30 phút là hết ca | 0.20 | |
| 8.11 | Ngưỡng `is_near_shift_end` | Còn bao lâu thì tính là "sắp hết ca" | 30 phút | |
| 8.12 | Seed | Seed riêng cho RNG phản hồi (khác seed train/test) | `driver=7` | |
| 8.13 | Chênh lệch `offline` vs `online_idle` | Tài xế đang offline có khó thuyết phục hơn không | Trừ thêm 0.10 cho `offline` (phải quay lại làm việc, không chỉ di chuyển) | |

> ⚠️ **Bắt buộc khi báo cáo:** với đề xuất trên, `p_accept` trung bình rơi khoảng 0.5–0.6 — **đây là con số do nhóm tự đặt, không phải đo được**. Mọi slide/báo cáo dùng số activation phải trình bày dạng **phân tích độ nhạy** (`base_rate` = 0.25 / 0.45 / 0.65 → residual gap giảm bao nhiêu), không đưa một con số duy nhất (C-07).

### 8C. Việc cần làm

| # | Việc | Ai | Hạn |
|---|---|---|---|
| 8.14 | Điền 8.1–8.13, sinh `config/driver_registry.json` dẫn xuất từ A1 | Data/BA | Cuối W2 |
| 8.15 | Viết test kiểm tra khớp `driver_registry` ↔ `idle_supply` ở mọi `ts_bucket` | Data/BA | Cuối W2 |
| 8.16 | Chạy phân tích độ nhạy accept rate (3 mức) trên test set đã freeze | Data/BA | W4 |
| 8.17 | Bổ sung câu hỏi cho **tài xế** vào kịch bản phỏng vấn W1–W2 (xem 8D) | BA | W2 |

### 8D. Câu hỏi cần hỏi tài xế (bổ sung vào buổi phỏng vấn M2)

Toàn bộ giả định về hành vi tài xế hiện **chưa ai kiểm chứng**. Nếu buổi gặp đối tác có thể tiếp cận tài xế (hoặc người từng chạy xe công nghệ), cần hỏi tối thiểu:
1. Khi trời mưa giờ cao điểm, anh/chị thường chạy tiếp hay nghỉ sớm? Vì sao?
2. Mức thưởng thêm bao nhiêu thì đáng để di chuyển 3–5km sang khu khác khi đang rảnh?
3. Đang nghỉ rồi, cần thưởng bao nhiêu để quay lại chạy? (con số này **khác hẳn** câu 2 — đây là tham số 8.13)
4. Nhận thông báo kiểu này bao nhiêu lần/giờ thì thấy phiền? (kiểm chứng 1.15)
5. Có bao giờ nhận rồi không đi không? Vì lý do gì? (kiểm chứng giới hạn "giả định nhận là tới nơi", SPEC mục 9)

---

## PHẦN 7 — CÔNG VIỆC DATA/BA THEO TUẦN

### Hồ Thanh Bình (Data/BA)

| Tuần | Việc | Deliverable | Gắn với |
|---|---|---|---|
| W1 | Điền toàn bộ checklist này (Phần 1–6), ưu tiên Phần 1–2 | File này đã điền + `policy.yaml` + `zone_registry.json` | Sprint 1–2 |
| **W2** | 🔴 **Điền Phần 1B (10 key activation) + Phần 8 (driver registry + tham số phản hồi)** — mới v1.1, ưu tiên ngang Phần 1–2 | `policy.yaml` đủ 18 key + `config/driver_registry.json` + test khớp với A1 | **Khóa contract cuối W2 (I-08)** |
| W1–W2 | **Phỏng vấn/expert review Dispatcher** (1–2 buổi) — xác minh ngưỡng policy, thời gian ra quyết định, workflow thật; hỏi câu "tài xế là nhân viên hay đối tác?"; **bổ sung nhóm câu hỏi cho tài xế (Phần 8D)** | Biên bản phỏng vấn + cập nhật policy.yaml + cập nhật mục 5–6 của [DataBA-Decisions.md](DataBA-Decisions.md) | M2, RC-05 |
| W1–W2 | Xây synthetic generator theo tham số Phần 3 (làm cùng Huy) | Script generator + 49 ngày dữ liệu + doc tham số kèm citation | Sprint 3 |
| W2 | Sinh & đóng băng test set 7 ngày (seed riêng, ≥2 sự kiện rain_peak); chạy baseline no-action | Test set frozen + bảng metric baseline | I-08, khóa KPI cuối W2 |
| W3–W4 | Hỗ trợ tune ngưỡng hotspot trên dữ liệu synthetic; kiểm tra hotspot recall ≥80% | Báo cáo recall theo 4 regime | Sprint 4–6 |
| **W4** | **Phân tích độ nhạy accept rate (3 mức) cho KPI residual gap ≥30%** (mục 8.16) | Bảng độ nhạy | Mới v1.1 |
| W5 | Chuẩn bị số liệu cho slide demo: bảng **3 kịch bản** (no_action / plan_only / plan_activation), ghi chú "simulation proxy" (C-07) **và nhãn nguồn accept rate** | Bảng metric demo | M6 |

### Đồng Đại Huy (Fullstack/AI — phần liên quan data)

| Tuần | Việc | Deliverable |
|---|---|---|
| W1 | Review checklist này về mặt feasibility model (đặc biệt 3.2–3.6 có đủ signal cho LightGBM + quantile p10/p90 không) | Feedback vào file này |
| W2 | Feature store từ snapshot theo feature list mục 5.2 SPEC (lookback 6 bước, rain×peak) | Feature pipeline |
| W2 | LightGBM demand + supply + quantile p10/p50/p90 (bắt buộc), walk-forward backtest | Model v1 + bảng metric 4 regime |
| W3 | Calibration p10/p90 (coverage ~80%), ablation rain×peak | Báo cáo ablation |

---

## QUY TRÌNH CHỐT

1. Data/BA điền cột **"Giá trị chốt"** (hoặc tick ✅ xác nhận đề xuất) → commit lại file này.
2. Các giá trị Phần 1–2 đổ vào `config/policy.yaml` + `config/zone_registry.json` — đây là **nguồn chân lý duy nhất**, code chỉ đọc từ config, không hardcode.
3. Sau phỏng vấn Dispatcher (W1–W2), nếu ngưỡng thay đổi → chỉ sửa config + cập nhật file này, không sửa spec chính.
4. **Khóa toàn bộ giá trị cuối W2** cùng thời điểm khóa contract + KPI (I-08). Sau đó chỉ đổi khi có phê duyệt PM.
