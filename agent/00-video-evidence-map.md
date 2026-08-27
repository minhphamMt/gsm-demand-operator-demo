# Bản đồ bằng chứng: Video → Màn hình → Tài liệu

> Tài liệu nền. Mọi khẳng định trong `01`, `02`, `03` đều truy vết được về bảng này.
> Nguồn: 11 clip MP4 (`1.mp4` … `11.mp4`), 1280×720, 24fps, mỗi clip 8–10 giây, **không có audio**.
> Phương pháp: trích 3–4 keyframe/clip (t = 0.5s, 2s, 5s, 9s) → tổng 43 frame → đọc trực tiếp.

---

## 1. Cảnh báo về chất lượng nguồn

Đây là **video concept do AI sinh** (cinematic mockup), không phải bản ghi màn hình sản phẩm thật. Hệ quả:

| Đặc điểm | Ảnh hưởng tới spec |
|---|---|
| Phần lớn nhãn phụ là chữ nhiễu (gibberish) | Chỉ những chuỗi **đọc rõ** mới được đưa vào spec, trích nguyên văn |
| Số liệu không nhất quán giữa các frame (TOTAL SUPPLY 24,893 / 34,003 / 42,676 / 44,858) | Coi là **số minh hoạ**, không phải yêu cầu dữ liệu |
| Bố cục thay đổi giữa các clip cùng chủ đề | Spec chuẩn hoá lại thành một hệ thống nhất quán, và **ghi rõ chỗ chuẩn hoá** |
| Không có audio, không có narration | Không có ngữ cảnh nghiệp vụ ngoài phần nhìn thấy → mọi suy luận nghiệp vụ đều gắn nhãn `[Cần xác nhận]` |

**Quy ước ký hiệu dùng xuyên suốt bộ tài liệu:**

- `[V-n]` — có bằng chứng trực tiếp trong video n (chữ đọc được hoặc yếu tố đồ hoạ rõ ràng).
- `[Chuẩn hoá]` — video có gợi ý nhưng không đủ rõ; tài liệu đề xuất một phương án nhất quán.
- `[Cần xác nhận]` — **không có trong video**; là khoảng trống cần nhóm quyết định.

---

## 2. Mạch câu chuyện 11 clip

Mười một clip xâu thành một vòng đời sự cố hoàn chỉnh:

```
V1  Bối cảnh & Dashboard tổng
      ↓
V2  Giám sát cung–cầu realtime          ── AI MONITORING
      ↓
V3  Phát hiện nhu cầu bất thường         ── ABNORMAL DEMAND DETECTED
      ↓
V4  Dự báo thiếu xe theo timeline        ── VEHICLE SHORTAGE RISK, NOW/+10/+20/+30
      ↓
V5  Pipeline đa tác tử phân tích         ── Forecast→Traffic→Supply→Dispatch→Optimization
      ↓
V6  Sinh & so sánh phương án             ── PLAN A / B / C, "Recommended"
      ↓
V7  Bản đồ điều xe giữa các zone         ── Zone A (đỏ) ← Zone B/C/D (xanh)
      ↓
V8  Con người phê duyệt                  ── APPROVE / MODIFY / REJECT
      ↓
V9  Thực thi & giám sát                  ── Zone D amber → red, xe hội tụ
      ↓
V10 Dữ liệu mới → lập lại kế hoạch       ── NEW DATA INGESTED → PLAN V2
      ↓
V11 Khuyến nghị cập nhật + giải thích    ── Reasoning, APPROVE UPDATE / VIEW CHANGES
```

---

## 3. Bảng ánh xạ chi tiết

| Clip | Màn hình / trạng thái | Chuỗi chữ **đọc rõ** trong video | Ánh xạ tới màn hình trong `03-uiux-spec.md` |
|---|---|---|---|
| **V1** | Phòng điều hành + wall screen tổng quan | `Self-Updating`, `Help`, `Search`, `Active Rides`, `System Efficiency`, `Active Efficiency`, `KPIs`; số: `63%` `93%` `30%` `959` `475` `88%` `0.62` `65%` `33%` `19.3%` `+2%` (**các nhãn và các số nằm rời nhau — video không ghép cặp nhãn↔số**) | **S0** Wall Board (chế độ trình chiếu) |
| **V2** | Giám sát cung–cầu realtime | `AI MONITORING`, `TOTAL SUPPLY`, `ACTIVE DEMAND`, `AVERAGE ETA`, `Search`, `Settings`; số: `34,003` `24,893` `801` `273` `94.41` `0.90%` `130%` `100%` | **S1** Live Operations Map + **P1** AI Monitoring Panel |
| **V3** | Phát hiện bất thường | `PASSENGER DEMAND` `368`, **`ABNORMAL DEMAND DETECTED`**, `AI`, `AI MONITORING`, `TOTAL SUPPLY` `44,858`, `ACTIVE DEMAND` `2213`, `AVERAGE ETA` `3.298 mins`, `153.50 ms` | **S1** + **C-alert** Zone Alert Tooltip |
| **V4** | Dự báo theo timeline | **`NOW`**, **`+10 MIN`**, **`+20 MIN`**, **`+30 MIN`**, `PREDICTED DEMAND`, **`VEHICLE SHORTAGE RISK`**, `TOTAL SUPPLY` `42,676`, `1.373 mins`, `0.97%` | **S1** + **C-timeline** Forecast Timeline Scrubber |
| **V5** | Pipeline đa tác tử | `Operations`, `Search`, `Info`, `100%`, **`Autonomous Resolution Pipeline`**, `Overview`, `Charts`, **`Forecast Agent`**, **`Traffic Agent`**, **`Supply Agent`**, **`Dispatch Agent`**, **`Optimization Agent`**, `Weather Agent`, `Fee Agent`, **`Rain Impact: +15% Travel Time`**, **`Re-route 50 Vehicles to Zone B`**, **`Re-route 50 Vehicles to Zone A`**, **`Strategy Confirmed - Dispatching`**, `RECALL`, `CANCEL`, `Coverage`, `ETA` | **S2** Agent Pipeline (modal) |
| **V6** | Sinh & so sánh phương án | `Operations`, `Search`, `Info`, **`Strategy Generator`**, **`PLAN A`**, **`PLAN B`**, **`PLAN C`**, **`Recommended`**, **`Vehicles: 45`**, **`ETA: -3.5min`**, **`Cost: Low`**, **`Relocation distance`**, `Optimization Agent`, `CANCEL` | **S3** Strategy Generator (modal) |
| **V7** | Bản đồ điều xe giữa zone | **`ZONE B`**, **`ZONE C`**, **`ZONE D`**, `Zone A` (nhãn đỏ ở tâm), `Operations`, `Info`, `Search`, `Recommended`, `PLAN B`, `Vehicles:` `45`, `ETA` `-3.5min`, `Cost` `Low`, `Optimization Agent`, `Coverage` `114`, `+15%`, `Strategy Confirmed - Dispatching` | **S1** (lớp Relocation) + **C-plan** Plan Card |
| **V8** | Con người phê duyệt | **`PLAN B`**, **`AI Confidence:` `94%`**, **`Expected ETA Improvement:` `2.1 min`**, **`High Demand Spike`**, **`Approaching Rain`**, **`APPROVE`**, **`MODIFY`**, **`REJECT`**, **`PLAN APPROVED - DISPATCHING`**, `Summary`, `Settings` | **S4** Plan Review & Approval |
| **V9** | Thực thi & giám sát | **`Zone D`** / **`ZONE D`** (kèm icon ⚠) | **S5** Execution Monitor |
| **V10** | Dữ liệu mới → lập lại kế hoạch | **`NEW DATA INGESTED`** (toast), **`FORECAST UPDATE`**, `NEW DATA`, `OPERATION`, **`PLAN V2`**, `99%`, `92%`, **`ADAPTIVE ROUTING ACTIVE`** | **S5** + **C-toast** + **S6** |
| **V11** | Khuyến nghị cập nhật + giải thích | **`UPDATED RECOMMENDATION`**, **`CURRENT ACTIVE PLAN`**, **`Expected service risk`** `31%` / `30%` / `36%`, **`Reasoning`**: `- Rain impact detected.` / `- Demand forecast increased in Zone D.` / `- Nearby supply is insufficient.`, **`APPROVE UPDATE`**, **`VIEW CHANGES`**, `PLAN V2` | **S6** Updated Recommendation |

---

## 4. Từ vựng nghiệp vụ rút ra từ video

Danh sách này là **toàn bộ** thuật ngữ đọc rõ được, dùng làm nguồn duy nhất cho naming trong code và UI.

### 4.1 Thực thể

| Thuật ngữ (nguyên văn) | Clip | Diễn giải |
|---|---|---|
| `Zone A` / `ZONE B` / `ZONE C` / `ZONE D` | V7, V9 | Đơn vị không gian cơ bản. Zone A = vùng thiếu, B/C/D = vùng dư trong kịch bản V7 |
| `PLAN A` / `PLAN B` / `PLAN C` | V6 | Phương án điều phối do AI sinh, tối đa 3 |
| `PLAN V2` | V10, V11 | Phiên bản kế hoạch sau khi re-plan |
| `CURRENT ACTIVE PLAN` | V11 | Kế hoạch đang chạy, dùng để đối chiếu với bản cập nhật |

### 4.2 Tác tử (Agent)

| Tên agent | Clip | Ghi chú |
|---|---|---|
| `Forecast Agent` | V5 | Xuất hiện ở cả hai danh sách agent trong V5 |
| `Traffic Agent` | V5 | Gắn với output `Rain Impact: +15% Travel Time` |
| `Supply Agent` | V5 | Trong frame t9 có icon ⚠ cảnh báo |
| `Dispatch Agent` | V5 | Mở rộng thành danh sách hành động `Re-route N Vehicles to Zone X` |
| `Optimization Agent` | V5, V6, V7 | Node hội tụ của sơ đồ; cũng là tiêu đề panel kết quả |
| `Weather Agent` | V5 (t2) | Chỉ có ở danh sách đầu, biến mất ở danh sách sau |
| `Fee Agent` | V5 (t2) | Chỉ có ở danh sách đầu. Nhãn có thể là chữ méo → `[Cần xác nhận]` |

> **Mâu thuẫn nội tại của video:** V5 hiển thị **hai danh sách agent khác nhau** ở hai thời điểm — {Forecast, Traffic, Fee, Weather} ở t=2s và {Forecast, Traffic, Supply, Dispatch, Optimization} ở t=5s/t=9s. Tài liệu này lấy **danh sách 5 agent** làm chuẩn (xuất hiện ở 2/3 frame, có sơ đồ luồng dữ liệu đi kèm) và xếp Weather/Fee thành **tool** thay vì agent. Xem `02-technical-spec.md §3`.

### 4.3 Chỉ số

| Chỉ số (nguyên văn) | Clip | Đơn vị thấy trong video |
|---|---|---|
| `TOTAL SUPPLY` | V2, V3, V4 | số nguyên |
| `ACTIVE DEMAND` | V2, V3, V4 | số nguyên |
| `PASSENGER DEMAND` | V3 | số nguyên (`368`) |
| `PREDICTED DEMAND` | V4 | số nguyên |
| `AVERAGE ETA` | V2, V3, V4 | phút (`3.298 mins`, `1.373 mins`) |
| `VEHICLE SHORTAGE RISK` | V4 | toggle bật/tắt (lớp bản đồ) |
| `AI Confidence` | V8 | % (`94%`) |
| `Expected ETA Improvement` | V8 | phút (`2.1 min`) |
| `Expected service risk` (reduction) | V11 | % (`31%`) |
| `Coverage` | V5, V7 | số (`114`) |
| `Vehicles` | V6, V7 | số (`45`) |
| `ETA` (delta) | V6, V7 | phút có dấu (`-3.5min`) |
| `Cost` | V6, V7 | thang định tính (`Low`) |
| `Relocation distance` | V6 | — |
| `System Efficiency` | V1 | % |
| `Active Rides` | V1 | số |

### 4.4 Trạng thái & thông báo

| Chuỗi (nguyên văn) | Clip | Loại |
|---|---|---|
| `AI MONITORING` | V2, V3, V4 | trạng thái nền |
| `ABNORMAL DEMAND DETECTED` | V3 | cảnh báo trên bản đồ |
| `Strategy Confirmed - Dispatching` | V5, V7 | trạng thái sau xác nhận |
| `PLAN APPROVED - DISPATCHING` | V8 | trạng thái sau phê duyệt |
| `NEW DATA INGESTED` | V10 | toast |
| `FORECAST UPDATE` | V10, V11 | mục pipeline |
| `ADAPTIVE ROUTING ACTIVE` | V10 | trạng thái nền |
| `UPDATED RECOMMENDATION` | V11 | tiêu đề panel |
| `Recommended` | V6, V7 | badge trên plan card |

### 4.5 Hành động (nút bấm)

| Nút | Clip | Ngữ cảnh |
|---|---|---|
| `APPROVE` / `MODIFY` / `REJECT` | V8 | Phê duyệt kế hoạch mới |
| `APPROVE UPDATE` / `VIEW CHANGES` | V11 | Phê duyệt bản cập nhật kế hoạch |
| `RECALL` / `CANCEL` | V5 | Thu hồi / huỷ kế hoạch đang chạy |

### 4.7 Bằng chứng **đồ hoạ** (không phải chữ)

Nhiều khẳng định trong `01`/`02`/`03` neo vào yếu tố nhìn thấy chứ không phải chữ đọc được. Liệt kê riêng ở đây để `[V-n]` truy vết được.

| Quan sát | Clip | Chi tiết |
|---|---|---|
| Icon thời tiết (mây mưa) trong panel phải | V2 (t5, t9), V3 (t5) | đi kèm icon nhiệt kế ở V2 t5 |
| Vùng dạng **hexagon** | V2 (t5, t9) | 3 hexagon xanh lá + 1 hexagon cam ở t9 — khác kiểu đa giác bất quy tắc của V7 |
| Mật độ icon xe | V2 t5 ~40 icon · V3 t0.5 ~20 · V4 t9 ~13 icon xe-gạch-chéo · V7 t0.5 ~26 icon trong 4 vùng | đếm từ frame |
| Icon **hành khách** thay icon xe trong vùng | V3 t9 | ~15 icon người, chỉ còn 1–2 xe |
| Icon **xe bị gạch chéo** màu đỏ | V4 t9 | ~13 icon trong vùng đỏ |
| Chấm tròn xanh dương ngoài vùng | V4 t9 | ~25 chấm — nguồn xe sẵn có |
| Vùng dự báo 3 lớp: viền **nét đứt** cam → fill cam → lõi **đỏ gạch chéo** | V4 t5, t9 | texture phân biệt dự báo với thực tế |
| Icon ⚠ của tooltip: **cam** ở mức WATCH, **vàng** ở mức ABNORMAL | V3 t5, t9 | video dùng ngược thang màu thông thường — xem ghi chú ở `01` UC-02 |
| **Checkbox** trên từng dòng action của Dispatch Agent | V5 t9 | 4 dòng: 3 dòng `to Zone B`, 1 dòng `to Zone A` |
| Sơ đồ luồng dữ liệu hội tụ vào Optimization Agent | V5 t5, t9 | đường nét đứt có chấm sáng |
| Viền xanh lá cạnh trái thẻ agent hoàn tất; icon ⚠ trên `Supply Agent` | V5 t9 | |
| Thanh so sánh **màu** trong Strategy Generator (mint / vàng / đỏ) + icon xe/đồng hồ/tiền/đường | V6 t5 | chỉ có màu và icon — **không đọc được giá trị số của PLAN A và PLAN C** |
| Thanh màu bên trái mỗi dòng lý do (xanh lá / đỏ) | V8 t5 | |
| Tuyến **nét đứt** xanh lá + waypoint tròn + mũi tên chỉ hướng | V9 t5/t9, V10, V11 | |
| Bố cục wall screen 3 cột (chart trái · map giữa · KPI phải) | V1 | 2 line chart + 1 bar chart bên trái; hàng 3 donut + KPI bên phải |
| Bản đồ chiếm ≥ 60% diện tích | 10/11 clip | mọi clip trừ V8 (cận cảnh panel phê duyệt) |

### 4.6 Lý do (Reasoning) — nguyên văn V11

```
- Rain impact detected.
- Demand forecast increased in Zone D.
- Nearby supply is insufficient.
```

Và nguyên văn V8:

```
High Demand Spike
Approaching Rain
```

---

## 5. Bảng màu ngữ nghĩa quan sát được

Nhất quán trên cả 43 frame:

| Màu | Ý nghĩa | Bằng chứng |
|---|---|---|
| Xanh lá | Vùng dư xe / trạng thái tốt / đã duyệt / cải thiện | V3 (vùng ban đầu), V7 (Zone B/C/D), V8 (nút APPROVE), V11 (mũi tên ▲) |
| Vàng / amber | Nhu cầu tăng, cảnh báo mức 1 | V3 (vùng chuyển vàng), V9 (Zone D), V4 (timeline) |
| Cam | Bất thường, cảnh báo mức 2 | V3 (`ABNORMAL DEMAND DETECTED`), V2 (vùng đối lập), V10 (toast) |
| Đỏ | Thiếu xe nghiêm trọng / từ chối | V4 (vùng hatched đỏ), V7 (Zone A), V8 (nút REJECT), V9 |
| Cyan / teal | Dữ liệu, biểu đồ, tuyến điều xe | mọi clip |
| Mint / teal đậm | Hành động chính, phương án được khuyến nghị | V6 (`Recommended`), V5 (nút chính) |

**Toàn bộ 43/43 frame là dark theme.** Không có frame nào light theme.

> ⚠️ **Mâu thuẫn với quyết định trước đó của nhóm:** hồ sơ design system của dự án ghi *"light theme làm mặc định"*. Video mô tả 100% dark. `03-uiux-spec.md §2` xử lý bằng cách định nghĩa token theo cặp light/dark, mặc định dark cho **chế độ wall board / phòng điều hành** và để nhóm chọn mặc định cho **chế độ desktop**. Đây là điểm cần chốt.

---

## 6. Những gì video **không** cho biết

Liệt kê thẳng để không ai nhầm là spec đã bao phủ:

1. **Không có audio, không có narration** → không có mô tả nghiệp vụ bằng lời.
2. **Không thấy màn hình đăng nhập, phân quyền, quản trị người dùng.**
3. **Không thấy màn hình cấu hình** (ngưỡng cảnh báo, tham số model, định nghĩa zone).
4. **Không thấy màn hình lịch sử / báo cáo sau sự cố** (chỉ có icon "history" trong sidebar, không mở ra).
5. **Không thấy giao diện phía tài xế** — toàn bộ là phía điều hành.
6. **Không thấy nội dung "gói huy động" hay "hệ số giá động"** — hai bước 3 và 4 trong kế hoạch dự án hiện tại không xuất hiện trong bất kỳ clip nào. (`Fee Agent` ở V5 là gợi ý duy nhất, và nhãn đó không chắc chắn.)
7. **Không thấy nguồn dữ liệu, tần suất cập nhật, độ trễ hệ thống.**
8. **Không thấy xử lý lỗi**: agent fail, mất kết nối, dữ liệu thiếu.
9. **Chân trời dự báo trong video là `+10 / +20 / +30 MIN`**, khác với `5 / 10 / 15 phút` trong kế hoạch dự án hiện tại. Cần chốt một con số.

---

## 7. Ảnh chụp keyframe

43 frame đã trích nằm cùng gói bàn giao (`frames/`), đặt tên `v{clip}_t{giây}.jpg` — mốc 2 giây ghi là `t02` (ví dụ `v10_t02.jpg`). V1 chỉ có 3 frame (thiếu `t9`); 10 clip còn lại đủ 4 frame.
