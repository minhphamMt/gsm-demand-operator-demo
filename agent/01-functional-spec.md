# Đặc tả chức năng — Hệ thống AI Agent dự báo & điều phối xe

**Mã tài liệu:** FS-01
**Phiên bản:** 0.1 (draft)
**Nguồn:** 11 video concept, đã phân tích trong `00-video-evidence-map.md`
**Ngày:** 20/08/2026

> **Cách đọc tài liệu này.** Mỗi yêu cầu có một trong ba nhãn:
> `[V-n]` có bằng chứng trực tiếp trong video n — `[Chuẩn hoá]` tài liệu đề xuất để lấp chỗ video mờ — `[Cần xác nhận]` video không nói gì, cần nhóm quyết định.
> Không có yêu cầu nào trong tài liệu này được suy diễn ngoài ba nhãn trên.

---

## 1. Tổng quan

### 1.1 Sản phẩm

Một **bảng điều khiển vận hành nội bộ** (internal operations console) cho trung tâm điều hành của hãng gọi xe. Hệ thống dùng chuỗi AI agent để:

1. giám sát cung–cầu theo vùng theo thời gian thực,
2. phát hiện nhu cầu bất thường,
3. dự báo thiếu xe trong 10–30 phút tới,
4. sinh ra vài phương án điều xe và so sánh chúng,
5. trình phương án cho điều phối viên phê duyệt,
6. giám sát quá trình thực thi và **tự lập lại kế hoạch** khi dữ liệu thay đổi.

Điểm cốt lõi quan sát được xuyên suốt video: **AI đề xuất, con người quyết định.** Trong 11 clip, mọi đường dẫn tới thực thi đều đi qua một bước xác nhận (`APPROVE`, `Strategy Confirmed`, `APPROVE UPDATE`). Đây là điều **quan sát được**, không phải bằng chứng rằng không tồn tại chế độ tự động.

### 1.2 Người dùng

| Actor | Video | Mô tả | Quyền |
|---|---|---|---|
| **Điều phối viên** (Dispatcher) | V8, V9, V10, V11 — người ngồi trước desktop, thao tác chuột/bàn phím | Người dùng chính. Xem cảnh báo, mở phương án, bấm APPROVE/MODIFY/REJECT | Đọc toàn bộ; phê duyệt/từ chối kế hoạch |
| **Giám sát viên ca** (Shift Supervisor) | V1, V8 — nhiều người trong phòng, wall screen chung | Theo dõi bức tranh toàn thành phố trên wall screen | `[Cần xác nhận]` — video có nút `RECALL` `[V-5]` nhưng **không thể hiện vai trò hay phân quyền nào** |
| **Quản trị hệ thống** | — | Cấu hình zone, ngưỡng, tham số model | `[Cần xác nhận]` — không xuất hiện trong bất kỳ clip nào |
| **Tài xế** | — | Nhận lệnh điều xe | `[Cần xác nhận]` — không có clip nào cho thấy giao diện tài xế |

### 1.3 Phạm vi

**Trong phạm vi** (đều có bằng chứng video):

- Bản đồ vận hành realtime với lớp phủ vùng theo màu trạng thái
- Panel chỉ số cung–cầu–ETA
- Phát hiện & cảnh báo nhu cầu bất thường
- Thanh trượt dự báo NOW / +10 / +20 / +30 phút
- Pipeline agent hiển thị được cho người dùng
- Sinh 3 phương án, so sánh, gắn nhãn Recommended
- Luồng phê duyệt APPROVE / MODIFY / REJECT
- Giám sát thực thi
- Tự nạp dữ liệu mới → cập nhật dự báo → đề xuất kế hoạch mới kèm lý do

**Ngoài phạm vi** (video không có):

- Đăng nhập, phân quyền, quản trị người dùng
- Màn hình cấu hình
- Báo cáo & phân tích hậu sự cố
- Ứng dụng tài xế
- Định giá động và gói huy động tài xế

---

## 2. Đối tượng nghiệp vụ

### 2.1 Zone (Vùng)

`[V-7]` `[V-9]` Đơn vị không gian cơ bản, hiển thị dạng đa giác trên bản đồ, có nhãn dạng `ZONE B`.

| Thuộc tính | Kiểu | Nguồn |
|---|---|---|
| `zone_id` | string | `[V-7]` nhãn `ZONE B`, `ZONE C`, `ZONE D`, `Zone A` |
| `geometry` | polygon | `[V-7]` đa giác không đều bám theo lưới đường; `[V-2]` có frame dùng hexagon |
| `status` | enum | `[V-3]` `[V-9]` chuyển màu xanh → vàng → cam → đỏ |
| `supply` | int | `[V-2]` `TOTAL SUPPLY` |
| `demand` | int | `[V-2]` `ACTIVE DEMAND`, `[V-3]` `PASSENGER DEMAND` |
| `avg_eta` | float (phút) | `[V-2]` `AVERAGE ETA` |

**Thang trạng thái zone** — bốn mức **màu** có trong video `[V-3]` `[V-9]`; **tên enum là `[Chuẩn hoá]`**, video không hiển thị tên nào ngoài `ABNORMAL DEMAND DETECTED`:

| Trạng thái | Màu | Ý nghĩa | Bằng chứng |
|---|---|---|---|
| `BALANCED` | Xanh lá | Cung đáp ứng cầu | V3 t0.5, V7 (Zone B/C/D) |
| `WATCH` | Vàng | Nhu cầu đang tăng | V3 t5, V9 t5 (Zone D) |
| `ABNORMAL` | Cam | Nhu cầu bất thường đã xác nhận | V3 t9 |
| `SHORTAGE` | Đỏ | Thiếu xe nghiêm trọng | V4 t9, V7 (Zone A), V9 t9 |

> `[Cần xác nhận]` Video cho thấy **thang 4 mức** qua sự chuyển màu, nhưng không hiển thị ngưỡng số nào. Ngưỡng chuyển trạng thái phải do nhóm định nghĩa.

### 2.2 Plan (Phương án điều phối)

`[V-6]` `[V-7]` `[V-8]`

| Thuộc tính | Kiểu | Nguồn video |
|---|---|---|
| `plan_id` | string | `PLAN A` / `PLAN B` / `PLAN C` `[V-6]`; `PLAN V2` `[V-10]` |
| `is_recommended` | bool | badge `Recommended` `[V-6]` `[V-7]` |
| `vehicles` | int | `Vehicles: 45` `[V-6]` `[V-7]` |
| `eta_delta` | float (phút) | `ETA: -3.5min` `[V-6]` `[V-7]` |
| `cost` | enum Low/Med/High | `Cost: Low` `[V-6]` `[V-7]` |
| `relocation_distance` | float | `Relocation distance` `[V-6]` — có nhãn, không đọc được giá trị |
| `coverage` | int | `Coverage` `114` `[V-7]` |
| `ai_confidence` | % | `AI Confidence: 94%` `[V-8]` |
| `expected_eta_improvement` | float (phút) | `Expected ETA Improvement: 2.1 min` `[V-8]` |
| `expected_service_risk_reduction` | % | `Expected service risk` `31%` `[V-11]` |
| `reasons[]` | list | `High Demand Spike`, `Approaching Rain` `[V-8]`; block `Reasoning` `[V-11]` |
| `actions[]` | list | `Re-route 50 Vehicles to Zone B` `[V-5]` |
| `status` | enum | xem §2.3 |

### 2.3 Vòng đời trạng thái Plan

`[Chuẩn hoá]` — **không tên trạng thái nào dưới đây xuất hiện trong video**. Sơ đồ được suy ra từ các nút bấm và banner đọc được; nhãn `[V-n]` trên mỗi nhánh chỉ ra **nút/banner** làm căn cứ, không phải tên trạng thái. `COMPLETED` là suy diễn thuần, không có căn cứ.

```
   PROPOSED ──APPROVE──▶ DISPATCHING ──────▶ ACTIVE ──────▶ COMPLETED
      │  [V-6,7,8]        [V-5,8]            [V-10]
      │
      ├──MODIFY──▶ PROPOSED (đã sửa)   [V-8]
      ├──REJECT──▶ REJECTED             [V-8]
      └──CANCEL──▶ CANCELLED            [V-5]

   ACTIVE ──RECALL──▶ RECALLED          [V-5]
   ACTIVE ──dữ liệu mới──▶ SUPERSEDED bởi PLAN V2   [V-10, V-11]
```

Nhãn trạng thái nguyên văn quan sát được:

- `Strategy Confirmed - Dispatching` `[V-5]` `[V-7]`
- `PLAN APPROVED - DISPATCHING` `[V-8]`
- `ADAPTIVE ROUTING ACTIVE` `[V-10]`
- `CURRENT ACTIVE PLAN` `[V-11]`

> `[Chuẩn hoá]` Hai chuỗi `Strategy Confirmed - Dispatching` và `PLAN APPROVED - DISPATCHING` mô tả cùng một trạng thái nhưng viết khác nhau. Tài liệu đề xuất **thống nhất một chuỗi duy nhất**: `PLAN APPROVED — DISPATCHING`.

### 2.4 Action (Hành động điều xe)

`[V-5]` Nguyên văn: `Re-route 50 Vehicles to Zone B`, `Re-route 50 Vehicles to Zone A`.

Cấu trúc suy ra: `{ verb: "Re-route", quantity: int, unit: "Vehicles", target_zone: string }`.

`[V-5]` t9 Mỗi action là một dòng **có checkbox** — điều phối viên chọn/bỏ chọn từng hành động trong một plan. Video hiển thị **4 dòng**: 3 dòng `to Zone B`, 1 dòng `to Zone A`.

`[Cần xác nhận]` Video không cho biết `from_zone`. Một action chỉ ghi đích. Nguồn có thể do Optimization Agent tự chọn, hoặc bị ẩn ở nhãn nhiễu.

---

## 3. Use case

### UC-01 — Giám sát cung–cầu theo thời gian thực

**Actor:** Điều phối viên, Giám sát viên · **Kích hoạt:** mở ứng dụng · **Bằng chứng:** `[V-1]` `[V-2]`

**Luồng chính**

1. Hệ thống hiển thị bản đồ thành phố với toàn bộ zone được tô màu theo `status`.
2. Hệ thống hiển thị đội xe dưới dạng icon xe trên bản đồ. `[V-2]` frame t5 có ~40 icon xe kèm mũi tên chỉ hướng.
3. Panel **AI Monitoring** hiển thị `TOTAL SUPPLY`, `ACTIVE DEMAND`, `AVERAGE ETA` kèm biểu đồ đường theo thời gian. `[V-2]` `[V-3]`
4. Panel hiển thị **điều kiện thời tiết** (icon mây mưa). `[V-2]` t5/t9, `[V-3]` t5 — bằng chứng là icon, không phải chữ (xem `00 §4.7`)
5. Chỉ báo `AI MONITORING` sáng xanh lá cho biết agent đang chạy nền. `[V-2]`

**Tiêu chí chấp nhận**

- AC-01.1 Mỗi zone luôn có đúng một màu trạng thái tại mọi thời điểm.
- AC-01.2 Ba chỉ số `TOTAL SUPPLY` / `ACTIVE DEMAND` / `AVERAGE ETA` hiển thị đồng thời và luôn cùng một mốc thời gian.
- AC-01.3 `AVERAGE ETA` hiển thị kèm đơn vị `mins`. `[V-3]` nguyên văn `3.298 mins`, `[V-4]` `1.373 mins`. **Số chữ số thập phân là `[Cần xác nhận]`** — 3 chữ số có thể chỉ là artefact của video, không phải yêu cầu.
- AC-01.4 `[Cần xác nhận]` Tần suất làm mới. Video không cho biết.

---

### UC-02 — Phát hiện nhu cầu bất thường

**Actor:** Hệ thống (tự động) · **Kích hoạt:** demand vượt ngưỡng · **Bằng chứng:** `[V-3]`

**Luồng chính**

1. Zone đang ở `BALANCED` (xanh lá).
2. Nhu cầu tăng → zone chuyển **vàng**, hệ thống bung tooltip hiển thị giá trị nhu cầu: nguyên văn `PASSENGER DEMAND` / `368`, kèm icon ⚠ màu cam.
3. Nhu cầu tiếp tục tăng → zone chuyển **cam**, tooltip đổi thành `ABNORMAL DEMAND DETECTED` kèm icon ⚠ vàng.

> Ghi chú: màu icon ⚠ trong video **ngược** với màu vùng (vùng vàng ↔ icon cam, vùng cam ↔ icon vàng). `03-uiux-spec.md` C-alert `[Chuẩn hoá]` lại cho icon cùng màu với mức cảnh báo.
4. Biểu tượng trong zone đổi từ **icon xe** sang **icon hành khách** — `[V-3]` t9 có ~15 icon người, chỉ còn 1–2 xe. Đây là cách video thể hiện "cầu vượt cung" một cách trực quan.
5. Chỉ số `ACTIVE DEMAND` trong panel nhảy lên. `[V-3]` t9 đọc được `2213`. (Các con số giữa các clip **không so sánh được với nhau** — xem `00 §1`.)
6. Sự kiện này kích hoạt UC-03.

**Tiêu chí chấp nhận**

- AC-02.1 Khi zone rời khỏi `BALANCED`, một tooltip phải xuất hiện neo vào tâm zone.
- AC-02.2 Tooltip ở mức `WATCH` hiển thị **giá trị số**; ở mức `ABNORMAL` hiển thị **nhãn chữ**. `[V-3]`
- AC-02.3 Icon bên trong zone phản ánh phía đang trội: xe (cung trội) hoặc hành khách (cầu trội). `[V-3]`
- AC-02.4 `[Cần xác nhận]` Ngưỡng định nghĩa "bất thường".

---

### UC-03 — Dự báo thiếu xe theo chân trời thời gian

**Actor:** Điều phối viên · **Kích hoạt:** kéo thanh timeline, hoặc tự động sau UC-02 · **Bằng chứng:** `[V-4]`

**Luồng chính**

1. Thanh **timeline** ở đáy bản đồ có 4 mốc: `NOW`, `+10 MIN`, `+20 MIN`, `+30 MIN`. Núm trượt là icon xe màu vàng.
2. Người dùng kéo núm sang `+20 MIN`. Badge vàng `+20 MIN` bám theo núm; đoạn đã qua được tô vàng.
3. Bản đồ vẽ lại theo trạng thái **dự báo** tại mốc đó:
   - Viền **nét đứt cam** = ranh giới vùng ảnh hưởng dự báo
   - Vùng tô **cam** = mức rủi ro trung bình
   - Lõi **đỏ có gạch chéo (hatched)** = thiếu hụt nghiêm trọng
4. Bên trong vùng đỏ, icon xe được thay bằng **icon xe bị gạch chéo** (~13 icon ở V4 t9) = thiếu xe. Bên ngoài, các chấm xanh dương = nguồn xe sẵn có.
5. Panel đổi chỉ số `ACTIVE DEMAND` → `PREDICTED DEMAND` và hiển thị area chart có **dải nền vàng đánh dấu khoảng dự báo**.
6. Toggle `VEHICLE SHORTAGE RISK` bật (xanh lá) → bật lớp phủ rủi ro.

**Tiêu chí chấp nhận**

- AC-03.1 Timeline có đúng 4 mốc rời rạc `NOW / +10 / +20 / +30 MIN`. `[V-4]`
- AC-03.2 Khi núm ở `NOW`, bản đồ hiển thị dữ liệu thực; khi núm ở mốc tương lai, mọi lớp phải là dữ liệu dự báo và phải có dấu hiệu thị giác phân biệt (nét đứt / gạch chéo / dải vàng trên chart). `[V-4]`
- AC-03.3 `VEHICLE SHORTAGE RISK` là toggle bật/tắt lớp bản đồ. `[V-4]`
- AC-03.4 Vùng dự báo phải phân được ít nhất 2 mức nghiêm trọng (cam / đỏ-hatched). `[V-4]`
- AC-03.5 `[Cần xác nhận]` Chân trời dự báo trong video là **+10/+20/+30 phút**. Kế hoạch dự án hiện tại của nhóm ghi **5/10/15 phút**. Phải chốt một.

---

### UC-04 — Pipeline agent phân tích tình huống

**Actor:** Hệ thống (tự động), người dùng quan sát · **Bằng chứng:** `[V-5]`

**Luồng chính**

1. Mở modal `Autonomous Resolution Pipeline` (có tab `Overview`, `Charts`, nút ×).
2. Modal liệt kê chuỗi agent, mỗi thẻ có icon riêng và **dấu tick tròn** khi hoàn tất:

   | Thứ tự | Agent | Icon trong video | Output đọc được |
   |---|---|---|---|
   | 1 | `Forecast Agent` | quả cầu | — |
   | 2 | `Traffic Agent` | mây + mặt trời | `Rain Impact: +15% Travel Time` |
   | 3 | `Supply Agent` | mây | — (có icon ⚠ ở frame t9) |
   | 4 | `Dispatch Agent` | xe + pin định vị | danh sách `Re-route N Vehicles to Zone X` |
   | 5 | `Optimization Agent` | toà nhà | panel kết quả (donut + bar chart) |

3. **Sơ đồ luồng dữ liệu**: các đường nét đứt có chấm sáng chạy từ 4 agent đầu **hội tụ vào `Optimization Agent`**, rồi toả tiếp sang panel kết quả bên phải. `[V-5]` t5, t9.
4. `Dispatch Agent` mở rộng thành **4 dòng có checkbox**, mỗi dòng là một action `Re-route 50 Vehicles to Zone A/B` với 2 nút icon.
5. Trạng thái kết thúc: dòng `Strategy Confirmed - Dispatching` kèm tick tròn xanh lá; hai nút `RECALL` và `CANCEL` ở đáy panel.

**Tiêu chí chấp nhận**

- AC-04.1 Pipeline hiển thị đủ 5 agent theo đúng thứ tự trên. `[V-5]`
- AC-04.2 Mỗi agent có 3 trạng thái nhìn được: đang chạy / hoàn tất (tick) / cảnh báo (⚠). `[V-5]`
- AC-04.3 Output của agent hiển thị ngay trên thẻ agent đó (ví dụ `Rain Impact: +15% Travel Time` nằm trong thẻ `Traffic Agent`). `[V-5]`
- AC-04.4 Từng action của `Dispatch Agent` chọn/bỏ chọn được độc lập. `[V-5]`
- AC-04.5 `[Cần xác nhận]` `Weather Agent` và `Fee Agent` xuất hiện ở một frame rồi biến mất. Cần chốt: agent riêng, hay tool của `Traffic Agent`? Xem `02-technical-spec.md §3`.

---

### UC-05 — Sinh và so sánh phương án

**Actor:** Hệ thống sinh, người dùng so sánh · **Bằng chứng:** `[V-6]` `[V-7]`

**Luồng chính**

1. Mở modal `Strategy Generator`.
2. Hệ thống sinh **3 phương án**: `PLAN A`, `PLAN B`, `PLAN C`, hiển thị dạng 3 thẻ xếp dọc cùng kích thước.
3. Mỗi phương án được chấm theo bộ tiêu chí, hiển thị dạng **thanh ngang có màu**: xanh mint = tốt, vàng = trung bình, đỏ = kém. `[V-6]` t5.
4. Bộ tiêu chí đọc được: `Vehicles`, `ETA`, `Cost`, `Relocation distance` — kèm icon minh hoạ (xe / đồng hồ bấm giờ / ký hiệu tiền / con đường). `[V-6]` t5.
5. Một phương án được gắn badge xanh lá **`Recommended`** kèm tick tròn. Trong video là `PLAN B`. `[V-6]` t9, `[V-7]` t5.
6. Thẻ được khuyến nghị có **viền mint** và nền sáng hơn.
7. Thẻ `PLAN B` mở rộng hiển thị: bar chart 6 cột kèm đường line ngang, và bảng chỉ số — **3 dòng đọc được**:
   ```
   Vehicles: 45
   ETA:      -3.5min
   Cost:     Low
   ```
8. Người dùng chọn một phương án → chuyển sang UC-06.

**Tiêu chí chấp nhận**

- AC-05.1 `[Chuẩn hoá]` Hệ thống sinh 3 phương án. Video chỉ có **một** cảnh với 3 plan `[V-6]`; "luôn đúng 3" là quy ước tài liệu đề xuất, không phải quan sát lặp lại.
- AC-05.2 Đúng một phương án mang badge `Recommended` tại một thời điểm. `[V-6]`
- AC-05.3 Cả 3 phương án so sánh được trên **cùng một bộ tiêu chí**, mỗi tiêu chí có mã màu tốt/trung bình/kém. `[V-6]`
- AC-05.4 `ETA` hiển thị dạng **delta có dấu** (`-3.5min` = cải thiện). `[V-6]` `[V-7]`
- AC-05.5 `Cost` là thang định tính (`Low`), không phải số tiền. `[V-6]` `[V-7]`
- AC-05.6 `[Cần xác nhận]` Công thức xếp hạng để chọn `Recommended`.

---

### UC-06 — Điều phối viên phê duyệt phương án

**Actor:** Điều phối viên · **Bằng chứng:** `[V-8]`

**Luồng chính**

1. Màn hình chi tiết phương án hiển thị:
   - Tiêu đề `PLAN B`
   - `AI Confidence: 94%` — kèm donut gauge xanh lá
   - `Expected ETA Improvement: 2.1 min`
   - Danh sách lý do, mỗi dòng có **thanh màu bên trái** biểu thị mức độ:
     ```
     High Demand Spike     (thanh xanh lá)
     Approaching Rain      (thanh đỏ)
     ```
   - Bản đồ thu nhỏ hiển thị vùng đỏ và mũi tên xe hội tụ về tâm
2. Ba nút hành động:
   - **`APPROVE`** — nền xanh lá, có tick ✓
   - **`MODIFY`** — nền xám
   - **`REJECT`** — nền đỏ hồng
3. Chọn `APPROVE` → hiển thị `PLAN APPROVED - DISPATCHING` (chữ xanh lá, ngay trên hàng nút) → chuyển UC-07.
4. Chọn `MODIFY` → `[Cần xác nhận]` video không cho thấy màn hình sửa.
5. Chọn `REJECT` → `[Cần xác nhận]` video không cho thấy điều gì xảy ra sau đó.

**Tiêu chí chấp nhận**

- AC-06.1 Không kế hoạch nào được thực thi khi chưa có hành động rõ ràng của con người. `[Đề xuất]` dựa trên `[V-8]` — xem BR-01.
- AC-06.2 Ba nút `APPROVE` / `MODIFY` / `REJECT` luôn hiển thị đồng thời, phân biệt bằng màu xanh lá / xám / đỏ. `[V-8]`
- AC-06.3 `AI Confidence` hiển thị dạng % kèm biểu diễn đồ hoạ (donut). `[V-8]`
- AC-06.4 Phải có tối thiểu một dòng lý do; mỗi dòng có chỉ báo mức độ bằng màu. `[V-8]`
- AC-06.5 Sau khi duyệt, trạng thái xác nhận hiển thị **tại chỗ**, ngay trên hàng nút. `[V-8]`
- AC-06.6 `[Cần xác nhận]` Hành vi của `MODIFY` và `REJECT`.

---

### UC-07 — Giám sát thực thi

**Actor:** Điều phối viên · **Bằng chứng:** `[V-9]` `[V-7]` `[V-10]`

**Luồng chính**

1. Bản đồ vẽ **tuyến điều xe nét đứt màu xanh lá** từ vùng dư về vùng thiếu, có **waypoint tròn**. `[V-9]` `[V-10]`
2. Icon xe di chuyển dọc tuyến, kèm **mũi tên chỉ hướng**. `[V-9]` t9 có 4–5 xe hội tụ về một điểm đích tròn xanh lá cạnh nhãn `ZONE D`.
3. `[V-7]` t5: các tuyến cyan có mũi tên toả từ tâm vùng đỏ ra 6–8 vùng xanh xung quanh — biểu diễn ngược lại của cùng quan hệ.
4. Zone đang được xử lý được **highlight bằng viền sáng** quanh khung bản đồ. `[V-9]` t9.
5. Chỉ báo nền `ADAPTIVE ROUTING ACTIVE` hiển thị dưới bản đồ. `[V-10]` t9.
6. Panel bên phải hiển thị bảng log có dòng đỏ/xanh. `[V-9]` `[V-10]` `[V-11]`

**Tiêu chí chấp nhận**

- AC-07.1 Mỗi lệnh điều xe đang chạy hiển thị dưới dạng một tuyến trên bản đồ, kiểu nét đứt để phân biệt với đường thật. `[V-9]` `[V-10]`
- AC-07.2 Tuyến có chỉ hướng (mũi tên hoặc chấm chạy). `[V-9]`
- AC-07.3 Zone đích được phân biệt thị giác với các zone khác. `[V-9]`
- AC-07.4 `[Cần xác nhận]` Nội dung cột của bảng log — trong video là chữ nhiễu.

---

### UC-08 — Tự lập lại kế hoạch khi có dữ liệu mới

**Actor:** Hệ thống · **Bằng chứng:** `[V-10]` `[V-11]`

**Luồng chính**

1. Dữ liệu mới đến → hiện **toast** `NEW DATA INGESTED` (icon cam, nút × để đóng). `[V-10]`
2. Sidebar hiển thị pipeline xử lý dạng cây, các mục đọc được: `NEW DATA` → `FORECAST UPDATE` (mục đang highlight) → `OPERATION`. Kèm 2 thanh progress xanh lá. `[V-10]` `[V-11]`
3. Hệ thống chạy lại dự báo và sinh **phiên bản kế hoạch mới**: `PLAN V2`, hiển thị trong donut gauge ở sidebar. `[V-10]` `[V-11]`
4. Panel `UPDATED RECOMMENDATION` hiển thị:
   - `Expected service risk` + con số % kèm mũi tên ▲ xanh lá (`31%` / `30%` / `36%` tuỳ frame)
   - Đối chiếu với `CURRENT ACTIVE PLAN` `[V-11]` t5
   - Khối **`Reasoning`** bằng ngôn ngữ tự nhiên, nguyên văn:
     ```
     - Rain impact detected.
     - Demand forecast increased in Zone D.
     - Nearby supply is insufficient.
     ```
5. Hai nút: **`APPROVE UPDATE`** (nền xanh lá) và **`VIEW CHANGES`** (nút viền).
6. Bản đồ vẽ lại tuyến; trạng thái nền chuyển `ADAPTIVE ROUTING ACTIVE`. `[V-10]`

**Tiêu chí chấp nhận**

- AC-08.1 Dữ liệu mới phải sinh thông báo nhìn thấy được (toast), không thay đổi kế hoạch trong im lặng. `[V-10]`
- AC-08.2 Kế hoạch mới được **đánh version** (`PLAN V2`), không ghi đè kế hoạch cũ. `[V-10]`
- AC-08.3 Mọi khuyến nghị cập nhật phải kèm khối `Reasoning` bằng ngôn ngữ tự nhiên, tối thiểu một dòng. `[V-11]`
- AC-08.4 Người dùng so sánh được bản mới với `CURRENT ACTIVE PLAN` trước khi duyệt (`VIEW CHANGES`). `[V-11]`
- AC-08.5 Cập nhật kế hoạch cần **phê duyệt riêng** (`APPROVE UPDATE`), không tự áp dụng. `[V-11]`
- AC-08.6 `[Cần xác nhận]` Điều gì kích hoạt `NEW DATA INGESTED` — lịch định kỳ, sự kiện thời tiết, hay ngưỡng sai số dự báo?

---

### UC-09 — Thu hồi / huỷ kế hoạch đang chạy

**Actor:** Điều phối viên, Giám sát viên · **Bằng chứng:** `[V-5]`

Hai nút ở đáy panel `Optimization Agent`: `RECALL` (nền xám) và `CANCEL` (nền teal đậm — nút chính).

`[Cần xác nhận]` Video chỉ cho thấy hai nút, không cho thấy hậu quả. Cần định nghĩa:
- `RECALL` = gọi xe đang di chuyển quay về vị trí cũ?
- `CANCEL` = dừng kế hoạch nhưng giữ nguyên vị trí xe?

> ⚠️ **Lỗi trong video:** ở `[V-6]` t0.5 và t2, **cả hai nút đều mang nhãn `CANCEL`**. Đây gần như chắc chắn là lỗi sinh ảnh. Tài liệu này lấy cặp `RECALL` / `CANCEL` từ `[V-5]` t9 làm chuẩn.

---

## 4. Quy tắc nghiệp vụ

| ID | Quy tắc | Nguồn |
|---|---|---|
| BR-01 | Không kế hoạch nào chuyển sang `DISPATCHING` khi chưa có hành động phê duyệt rõ ràng của con người | `[Đề xuất]` — mọi đường dẫn **quan sát được** trong 11 clip đều đi qua `APPROVE` `[V-8]` / `Strategy Confirmed` `[V-5]`, nhưng 11 clip × 8–10s không đủ để kết luận không tồn tại đường tự động |
| BR-02 | Mỗi lần sinh phương án cho ra 3 phương án và đúng 1 phương án `Recommended` | `[V-6]` (1 mẫu) + `[Chuẩn hoá]` cho từ "mỗi lần" |
| BR-03 | Trạng thái zone chỉ nhận 1 trong 4 giá trị: BALANCED / WATCH / ABNORMAL / SHORTAGE | `[V-3]` `[V-9]` |
| BR-04 | Kế hoạch được đánh version khi lập lại; bản cũ giữ nguyên để đối chiếu | `[V-10]` `[V-11]` |
| BR-05 | Mọi khuyến nghị của AI đều kèm lý do đọc được bằng ngôn ngữ tự nhiên | `[V-8]` `[V-11]` |
| BR-06 | Dữ liệu dự báo phải phân biệt thị giác rõ với dữ liệu thực | `[V-4]` |
| BR-07 | Chân trời dự báo tối đa +30 phút | `[V-4]` — mâu thuẫn với kế hoạch nội bộ (5/10/15 phút), cần chốt |
| BR-08 | Từng action điều xe trong một plan chọn/bỏ chọn được độc lập | `[V-5]` |
| BR-09 | Thời tiết xuất hiện ở panel giám sát, output agent và lý do → `[Đề xuất]` đưa thời tiết thành đầu vào bắt buộc của mô hình | `[V-2]` t5/t9 (icon) · `[V-5]` `[V-8]` `[V-11]` (chữ) |

---

## 5. Yêu cầu phi chức năng

Video là mockup nên **không cung cấp số liệu phi chức năng nào**. Bảng dưới là những gì bố cục video *hàm ý*, mỗi dòng đều cần chốt.

| ID | Yêu cầu | Căn cứ |
|---|---|---|
| NFR-01 | Giao diện phải đọc được ở khoảng cách xa trên wall screen | `[V-1]` `[V-8]` `[V-9]` phòng điều hành có wall screen |
| NFR-02 | Hỗ trợ hai chế độ hiển thị: **wall board** (chữ lớn, ít tương tác) và **desktop** (đầy đủ chức năng) | `[V-1]` `[V-9]` cùng nội dung, hai kích thước |
| NFR-03 | Bản đồ giữ mượt khi hiển thị hàng chục icon xe đồng thời | `[V-2]` t5 có ~40 icon xe |
| NFR-04 | `[Cần xác nhận]` Độ trễ cập nhật dữ liệu | — |
| NFR-05 | `[Cần xác nhận]` Số người dùng đồng thời | — |
| NFR-06 | `[Cần xác nhận]` Yêu cầu lưu vết (audit trail) cho mọi quyết định phê duyệt | Suy ra từ BR-01, nhưng video không có màn hình lịch sử |

---

## 6. Danh sách câu hỏi mở

Xếp theo mức chặn tiến độ.

| # | Câu hỏi | Chặn |
|---|---|---|
| Q1 | Chân trời dự báo: **+10/+20/+30 phút** (video) hay **5/10/15 phút** (kế hoạch nhóm)? | UC-03, model, UI timeline |
| Q2 | Danh sách agent chính thức: 5 agent (Forecast/Traffic/Supply/Dispatch/Optimization) hay có thêm Weather/Fee? | UC-04, kiến trúc |
| Q3 | Ngưỡng chuyển trạng thái zone (BALANCED→WATCH→ABNORMAL→SHORTAGE) | UC-02, UC-03 |
| Q4 | Công thức xếp hạng phương án để chọn `Recommended` | UC-05 |
| Q5 | `MODIFY` mở màn hình gì? `REJECT` dẫn tới đâu? | UC-06 |
| Q6 | Phân biệt `RECALL` và `CANCEL` | UC-09 |
| Q7 | Điều gì kích hoạt `NEW DATA INGESTED` | UC-08 |
| Q8 | Zone được định nghĩa thế nào — hexagon (H3) hay đa giác hành chính? Video có cả hai kiểu | Toàn bộ mô hình dữ liệu |
| Q9 | Định giá động và gói huy động (bước 3, 4 của kế hoạch nhóm) — có trong sản phẩm này không? Không clip nào có | Phạm vi |
| Q10 | Theme mặc định: video 100% dark, kế hoạch design system ghi light | UI |

---

## 7. Truy vết yêu cầu

| Use case | Video | Màn hình (`03-uiux-spec.md`) | Contract (`02-technical-spec.md`) |
|---|---|---|---|
| UC-01 | V1, V2 | S0, S1, P1 | `ZoneState` (§2.1), `CityMetrics` (§2.2) |
| UC-02 | V3 | S1, C-alert | `ZoneAlert` (§2.3) |
| UC-03 | V4 | S1, C-timeline | `ForecastRequest` / `ForecastResponse` (§2.4) |
| UC-04 | V5 | S2 | `PipelineRun` (§2.5) |
| UC-05 | V6, V7 | S3, C-plan | `PlanSet` (§2.6) |
| UC-06 | V8 | S4 | `PlanDecision` (§2.7) |
| UC-07 | V7, V9, V10 | S5 | `ExecutionState` + `ExecutionState.orders[]` (§2.8) |
| UC-08 | V10, V11 | S5, S6, C-toast | `ReplanEvent` (§2.9) |
| UC-09 | V5 | **S2** | `PlanDecision` (§2.7) |
