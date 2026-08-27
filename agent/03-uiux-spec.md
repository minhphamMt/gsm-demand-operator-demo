# Đặc tả UI/UX — Hệ thống AI Agent dự báo & điều phối xe

**Mã tài liệu:** UX-01
**Phiên bản:** 0.1 (draft)
**Nguồn:** 11 video concept (`00-video-evidence-map.md`)
**Ngày:** 20/08/2026

> Ký hiệu như các tài liệu khác: `[V-n]` có trong video n · `[Chuẩn hoá]` tài liệu đề xuất để lấp chỗ video mờ · `[Cần xác nhận]` video không nói gì.

---

## 1. Nguyên tắc trải nghiệm

Năm nguyên tắc rút trực tiếp từ hành vi lặp lại trên 43 frame:

**UX1 — Bản đồ là màn hình chính, panel là lớp bổ trợ.** 10/11 clip có bản đồ chiếm ≥ 60% diện tích (`00 §4.7`; ngoại lệ là V8 — cận cảnh panel phê duyệt). Mọi thông tin đều neo về một vị trí địa lý. Không có màn hình nào chỉ toàn bảng số.

**UX2 — Màu mang nghĩa trạng thái, không mang nghĩa thương hiệu.** Thang xanh → vàng → cam → đỏ giữ nguyên ý nghĩa trên mọi màn hình `[V-3]` `[V-4]` `[V-7]` `[V-9]`. Màu thương hiệu chỉ dùng cho hành động và điều hướng.

**UX3 — Mỗi khuyến nghị đi kèm lý do.** Không clip nào hiện một con số AI mà không có ngữ cảnh: `AI Confidence` đi với `Reasons` `[V-8]`, `UPDATED RECOMMENDATION` đi với `Reasoning` `[V-11]`.

**UX4 — Hành động phá huỷ và hành động thuận đều hiện diện cùng lúc.** `APPROVE` / `MODIFY` / `REJECT` luôn nằm cạnh nhau `[V-8]`; `RECALL` / `CANCEL` luôn ở đáy panel thực thi `[V-5]`. Không giấu lựa chọn từ chối sau menu.

**UX5 — Hai khoảng cách đọc.** Video cho thấy cùng nội dung xuất hiện trên **wall screen** (`[V-1]` `[V-9]`) và trên **màn hình desktop cá nhân** (`[V-8]`). `[Chuẩn hoá]` Đề xuất chuẩn: đọc được ở ~3–5m cho wall và ~60cm cho desktop — hai con số này là giả định thiết kế, video không cho biết.

---

## 2. Hệ thống thị giác

### 2.1 Theme

**Toàn bộ 43/43 frame là dark theme.** Không có frame nào light.

> ⚠️ Điều này **mâu thuẫn** với ghi chú design system trước đó của nhóm ("light theme làm mặc định"). Đề xuất giải quyết:
>
> | Chế độ | Theme mặc định | Lý do |
> |---|---|---|
> | **Wall board** (S0) | Dark — bắt buộc | Phòng điều hành thiếu sáng `[V-1]` `[V-8]` `[V-9]`; nền sáng gây chói và bóng phản chiếu |
> | **Desktop** (S1–S6) | `[Cần xác nhận]` | Video là dark; nhóm cần chốt |
>
> Token bên dưới định nghĩa **cả hai bộ giá trị** để đảo được ở một chỗ.

### 2.2 Token màu

`[Chuẩn hoá]` — **video không chứa mã màu nào**, chỉ cho biết *ngữ nghĩa* màu (`00 §5`). Toàn bộ giá trị hex dưới đây là đề xuất, lấy từ bảng màu tham chiếu đã kiểm định của skill dataviz, với surface chỉnh cho tông xanh-đen quan sát trong video.

```css
:root[data-theme="dark"] {
  /* Bề mặt */
  --plane:          #0D1114;   /* nền trang */
  --surface-1:      #141A1F;   /* bề mặt panel / biểu đồ */
  --surface-2:      #1C242B;   /* thẻ nổi trên panel */
  --surface-3:      #26313A;   /* hover / hàng được chọn */
  --border:         rgba(255,255,255,0.10);

  /* Chữ */
  --ink-primary:    #FFFFFF;
  --ink-secondary:  #C3C2B7;
  --ink-muted:      #898781;

  /* Trạng thái — CỐ ĐỊNH, không đổi theo thương hiệu */
  --status-good:     #0CA30C;  /* BALANCED  — xanh lá */
  --status-warning:  #FAB219;  /* WATCH     — vàng   */
  --status-serious:  #EC835A;  /* ABNORMAL  — cam    */
  --status-critical: #D03B3B;  /* SHORTAGE  — đỏ     */

  /* Chuỗi dữ liệu trên biểu đồ (thứ tự cố định, không xoay vòng) */
  --series-1:       #3987E5;   /* xanh dương — Demand thực tế */
  --series-2:       #D95926;   /* cam        — Demand dự báo  */
  --series-3:       #199E70;   /* aqua       — Supply         */

  /* Thương hiệu / hành động — CHỈ dùng cho UI, không dùng làm màu chuỗi dữ liệu */
  --accent:         #17B981;
  --accent-ink:     #04231A;
  --accent-soft:    rgba(23,185,129,0.14);

  /* Chrome biểu đồ */
  --grid:           #2C2C2A;
  --axis:           #383835;
}
```

**Ba quy tắc bắt buộc về màu:**

1. **Màu trạng thái được giữ riêng.** Bốn màu `--status-*` không bao giờ dùng làm màu chuỗi dữ liệu. Chạy `validate_palette.js` trên bộ 4 màu này (chế độ dark, surface `#141A1F`, `--pairs all`) cho kết quả **FAIL**: cặp tệ nhất `#D03B3B ↔ #0CA30C` (đỏ ↔ xanh lá) đo được **ΔE 4.1 deutan**, và cặp `#EC835A ↔ #FAB219` (cam ↔ vàng) đo **ΔE 13.6** ở thị lực bình thường (dưới sàn 15). Nghĩa là bốn màu này **luôn phải đi kèm icon + nhãn chữ**, không bao giờ đứng một mình. Video đã làm đúng: mọi vùng cảnh báo đều có icon ⚠ và nhãn `ZONE D` `[V-9]`.
2. **Màu thương hiệu `--accent` không được dùng làm màu chuỗi dữ liệu** — nó nằm ngoài dải sáng hợp lệ cho mark trên nền tối. Chỉ dùng cho nút, viền chọn, badge.
3. **Ba màu chuỗi dữ liệu gán theo thứ tự cố định, không xoay vòng.** `validate_palette.js` (dark, surface `#141A1F`) trả **ALL CHECKS PASS**: worst adjacent CVD ΔE 9.4 (deutan), normal-vision ΔE 26.5, contrast ≥ 3:1, chroma và dải sáng đều đạt.

### 2.3 Chữ

`[Chuẩn hoá]` Video không cho biết font. Đề xuất một sans hệ thống, hai thang cỡ theo UX5:

| Vai trò | Desktop | Wall board | Ghi chú |
|---|---|---|---|
| KPI lớn (hero) | 32px / 600 | 72px / 600 | `TOTAL SUPPLY 44,858` `[V-3]` |
| Tiêu đề màn hình | 20px / 600 | 40px / 600 | `Autonomous Resolution Pipeline` `[V-5]` |
| Tiêu đề thẻ | 16px / 600 | 32px / 600 | `PLAN B` `[V-6]` |
| Nhãn chỉ số | 11px / 500 / letter-spacing .06em / UPPERCASE | 20px | `AVERAGE ETA` `[V-2]` — video dùng chữ hoa cho toàn bộ nhãn chỉ số |
| Nội dung | 14px / 400 | 24px | `Rain impact detected.` `[V-11]` |
| Chú thích | 12px / 400 | 20px | |

Số trong bảng và trục biểu đồ dùng `font-variant-numeric: tabular-nums`.

### 2.4 Bo góc, khoảng cách, độ nổi

`[Chuẩn hoá]` — thống nhất từ hình dạng thẻ quan sát được:

- Lưới cơ sở 4px; khoảng đệm panel 16px (desktop) / 32px (wall).
- Bo góc: thẻ 10px, nút 8px, badge 999px.
- Độ nổi: panel dùng viền hairline `--border`, **không dùng đổ bóng** — video là giao diện phẳng, phân lớp bằng độ sáng bề mặt.
- Thẻ được chọn: viền 1px `--accent` + nền `--accent-soft` `[V-6]` t2 (`PLAN B` có viền teal sáng và nền sáng hơn).

---

## 3. Sitemap

```
┌── S0  Wall Board                    (chế độ trình chiếu, chỉ đọc)     [V-1]
│
└── Ứng dụng desktop
    ├── S1  Live Operations Map       (màn hình gốc)                     [V-2,3,4,7]
    │   ├── P1   Panel AI Monitoring   (cột phải, luôn hiện)
    │   ├── C-timeline  Thanh trượt dự báo (đáy bản đồ)                  [V-4]
    │   ├── C-alert     Tooltip cảnh báo vùng                            [V-3]
    │   └── C-plan      Thẻ phương án nổi                                [V-7]
    ├── S2  Autonomous Resolution Pipeline   (modal)                     [V-5]
    ├── S3  Strategy Generator               (modal)                     [V-6]
    ├── S4  Plan Review & Approval                                       [V-8]
    ├── S5  Execution Monitor                                            [V-9,10]
    └── S6  Updated Recommendation           (panel phải trên S5)        [V-11]
```

**Khung ứng dụng (app shell)** — có mặt ở mọi màn hình desktop `[V-5]` `[V-6]` `[V-7]`:

- **Top bar**: tên ứng dụng (`Operations` `[V-5]` `[V-6]` `[V-7]`) · dải tab (có tab `Info` `[V-5]` `[V-6]` `[V-7]`) · ô `Search` · icon chuông (có chấm đỏ khi có cảnh báo) · icon cài đặt · nhóm nút cửa sổ
- **Sidebar trái (rail)**: dải icon dọc ~8 mục `[V-5]` t0.5, luôn hiển thị dạng icon-only, mở rộng khi cần
- **Bottom status bar**: chỉ báo trạng thái + thanh zoom (`100%` `[V-5]` t9)

---

## 4. Đặc tả từng màn hình

### S0 — Wall Board `[V-1]`

**Mục đích:** bức tranh toàn thành phố cho cả phòng, đọc ở khoảng cách 3–5m, không tương tác.

**Bố cục** `[Chuẩn hoá]` — lưới 3 cột (video cho thấy bố cục 3 cột, không cho biết tỉ lệ):

```
┌──────────────┬───────────────────────────────┬──────────────┐
│ CỘT TRÁI     │        BẢN ĐỒ THÀNH PHỐ       │ CỘT PHẢI     │
│ (20%)        │            (55%)              │ (25%)        │
│              │                               │              │
│ Line chart   │  Toàn bộ zone tô màu trạng    │ 3 donut gauge│
│ Demand 24h   │  thái, đội xe, tuyến đang     │ hàng ngang   │
│              │  chạy                         │              │
│ Line chart   │                               │ KPI hero:    │
│ ETA 24h      │                               │ Active Rides │
│              │                               │              │
│ Bar chart    │                               │ Bảng zone    │
│ theo zone    │                               │ xếp theo rủi │
│              │                               │ ro           │
└──────────────┴───────────────────────────────┴──────────────┘
```

`[V-1]` Bằng chứng: cột trái có 2 line chart + 1 bar chart; cột phải có hàng 3 donut (`63%` `93%` `30%`), khối KPI (`959` `475`), các thanh progress, 1 line chart + 1 gauge nhãn `KPIs`.

**Nội dung**

| Vùng | Nội dung | Nguyên văn video |
|---|---|---|
| KPI hero | `Active Rides` | nhãn `[V-1]` |
| Donut hàng ngang | 3 chỉ số % | `63%` `93%` `30%` `[V-1]` |
| Gauge | `System Efficiency` | nhãn `[V-1]` |

> `[Chuẩn hoá]` Video hiển thị các **nhãn** và các **số** (`959`, `475`, `65%`, `0.62`…) nhưng **không ghép cặp nhãn↔số**. Việc gán `959 → Active Rides` và `65% → System Efficiency` là đề xuất của tài liệu, không phải quan sát.

**Quy tắc**

- Không có phần tử tương tác nào. Không tooltip, không nút.
- Tự luân phiên nếu có nhiều hơn một sự cố đang mở. `[Cần xác nhận]`
- Cỡ chữ theo cột "Wall board" ở §2.3.

---

### S1 — Live Operations Map `[V-2]` `[V-3]` `[V-4]` `[V-7]`

Màn hình gốc, nơi điều phối viên ở lâu nhất.

**Bố cục**

```
┌─ Top bar: Operations │ tabs │ Search │ 🔔 │ ⚙ ────────────────────┐
├──┬──────────────────────────────────────────┬─────────────────────┤
│  │                                          │  P1 AI MONITORING   │
│ R│                                          │ ┌─────────────────┐ │
│ A│            BẢN ĐỒ (lớp phủ zone)         │ │ 🌧 Rain  +15%   │ │
│ I│                                          │ ├─────────────────┤ │
│ L│         ● tooltip cảnh báo               │ │ TOTAL SUPPLY    │ │
│  │                                          │ │ 44,858          │ │
│  │                                          │ │ ACTIVE DEMAND   │ │
│  │                                          │ │ 2213            │ │
│  │                                          │ ├─────────────────┤ │
│  │                                          │ │ AVERAGE ETA     │ │
│  │                                          │ │ 3.298 mins      │ │
│  │                                          │ │ [line chart]    │ │
│  │                                          │ ├─────────────────┤ │
│  │                                          │ │ VEHICLE         │ │
│  │                                          │ │ SHORTAGE RISK ◉ │ │
│  ├──────────────────────────────────────────┤ └─────────────────┘ │
│  │ NOW ──●── +10 MIN ── +20 MIN ── +30 MIN  │                     │
├──┴──────────────────────────────────────────┴─────────────────────┤
│ Bottom status bar                                     100% ─────  │
└───────────────────────────────────────────────────────────────────┘
```

**Lớp bản đồ** (bật/tắt độc lập)

| Lớp | Biểu diễn | Nguồn |
|---|---|---|
| Zone status | đa giác tô màu, opacity ~0.35, viền đậm cùng hue | `[V-3]` `[V-7]` |
| Vehicles | icon xe nhìn từ trên, màu trắng, có mũi tên chỉ hướng khi đang di chuyển | `[V-2]` t5 |
| Passengers | icon người, **thay thế** icon xe khi `dominant_side = DEMAND` | `[V-3]` t9 |
| Shortage | icon **xe bị gạch chéo** màu đỏ-trắng trong vùng thiếu | `[V-4]` t9 |
| Available supply | chấm tròn xanh dương ở vùng dư | `[V-4]` t9 |
| Relocation routes | tuyến nét đứt có mũi tên + waypoint tròn | `[V-9]` `[V-10]` |
| Forecast overlay | viền **nét đứt** + lõi **gạch chéo (hatched)** | `[V-4]` t5, t9 |

> Quy ước quan trọng: **dữ liệu dự báo luôn có texture** (nét đứt hoặc gạch chéo); dữ liệu thực tế luôn đặc. Đây là kênh mã hoá thứ hai bên cạnh màu — cần thiết vì người mù màu không phân biệt được cam/đỏ.

**Panel P1 — AI Monitoring** `[V-2]` `[V-3]` `[V-4]`

Từ trên xuống:

1. **Khối thời tiết** — icon điều kiện (`[V-2]` t5/t9, `[V-3]` t5) + ảnh hưởng thời gian đi lại. Chuỗi `Rain Impact: +15% Travel Time` nguyên văn đến từ `[V-5]`; `[Chuẩn hoá]` đặt nó vào panel này cho nhất quán
2. **Chỉ báo `AI MONITORING`** — chấm xanh lá + nhãn
3. **Stat tile đôi** — `TOTAL SUPPLY` và `ACTIVE DEMAND` cạnh nhau, số lớn
4. **`AVERAGE ETA`** — số lớn (3 chữ số thập phân, hậu tố `mins`) + line chart theo thời gian, có tooltip crosshair
5. **Toggle `VEHICLE SHORTAGE RISK`** — bật/tắt lớp bản đồ
6. **Bảng zone** — xếp theo mức rủi ro giảm dần

Khi timeline không ở `NOW`, tile 3 đổi nhãn `ACTIVE DEMAND` → `PREDICTED DEMAND` `[V-4]`, và line chart bổ sung dải nền vàng đánh dấu đoạn dự báo `[V-4]` t9.

**C-timeline — Thanh trượt dự báo** `[V-4]`

- Bốn mốc rời rạc: `NOW` · `+10 MIN` · `+20 MIN` · `+30 MIN`. Không phải thanh trượt liên tục.
- Núm trượt là **icon xe màu vàng**; đoạn đã đi qua tô vàng.
- Badge bám theo núm hiển thị mốc đang chọn (`+20 MIN`).
- Ở mốc ≠ `NOW`, toàn bản đồ chuyển sang chế độ dự báo và hiển thị một **dải nhắc nhở** cố định.
- `[Cần xác nhận]` Chân trời +10/+20/+30 (video) hay 5/10/15 (kế hoạch nhóm).

**C-alert — Tooltip cảnh báo vùng** `[V-3]`

Hai mức:

| Mức | Nội dung tooltip | Icon | Màu icon |
|---|---|---|---|
| `WATCH` | `PASSENGER DEMAND` + số (`368`) | ⚠ | `--status-warning` |
| `ABNORMAL` | `ABNORMAL DEMAND DETECTED` | ⚠ | `--status-serious` |

> `[Chuẩn hoá]` Trong video, màu icon ⚠ **ngược** với màu vùng: vùng vàng đi với icon **cam**, vùng cam đi với icon **vàng** (`[V-3]` t5, t9). Bảng trên chuẩn hoá lại cho icon cùng màu với mức cảnh báo.

Tooltip nền tối đặc, neo bằng đường mảnh vào điểm pulse ở tâm zone.

**C-plan — Thẻ phương án nổi** `[V-7]`

Thẻ nhỏ nổi bên phải bản đồ, hiện khi có phương án được khuyến nghị:

```
┌───────────────────────────────┐
│ ✓ Recommended                 │  badge xanh lá
│ PLAN B                        │
│ ▁▃▅▂▆▄  Vehicles:  45         │  mini bar chart + bảng chỉ số
│          ETA:      -3.5min    │
│          Cost:     Low        │
└───────────────────────────────┘
```

Bấm vào thẻ → mở S4.

---

### S2 — Autonomous Resolution Pipeline (modal) `[V-5]`

**Mục đích:** cho người dùng thấy AI đang nghĩ gì, theo từng bước.

**Bố cục:** modal chiếm nửa phải màn hình, bản đồ vẫn hiện ở nửa trái (giữ ngữ cảnh không gian).

```
┌─ Autonomous Resolution Pipeline ──────────────────── × ─┐
│  [Overview]  Charts                                     │
├─────────────────────────────────────────────────────────┤
│  🌐  Forecast Agent                                  ✓  │
│      ────────────────────────────────────────────       │
│  🌦  Traffic Agent                                   ✓  │
│      Rain Impact: +15% Travel Time                      │
│      ────────────────────────────────────────────       │
│  ☁  Supply Agent                                    ⚠  │
│      ────────────────────────────────────────────       │
│  🚗  Dispatch Agent                                  ✓  │
│      ☑ Re-route 50 Vehicles to Zone B      [▸] [⋯]     │
│      ☑ Re-route 50 Vehicles to Zone B      [▸] [⋯]     │
│      ☑ Re-route 50 Vehicles to Zone B      [▸] [⋯]     │
│      ☑ Re-route 50 Vehicles to Zone A      [▸] [⋯]     │
│      ────────────────────────────────────────────       │
│  🏢  Optimization Agent                              ✓  │
├─────────────────────────────────────────────────────────┤
│  ✓ PLAN APPROVED — DISPATCHING                          │
│                                    [ RECALL ] [ CANCEL ]│
└─────────────────────────────────────────────────────────┘
```

**Chi tiết**

- Mỗi agent là một hàng: icon · tên · chỉ báo trạng thái bên phải.
- Trạng thái: `PENDING` (mờ) · `RUNNING` (spinner) · `DONE` (✓ tròn xanh lá) · `WARNING` (⚠ vàng) · `FAILED` `[Cần xác nhận]`.
- Agent hoàn tất có **viền xanh lá ở cạnh trái** `[V-5]` t9.
- Output ngắn của agent hiển thị **ngay dưới tên agent** — `Rain Impact: +15% Travel Time` nằm trong thẻ `Traffic Agent`, không ở panel riêng `[V-5]` t9.
- `Dispatch Agent` mở rộng thành danh sách action **có checkbox**, chọn/bỏ chọn độc lập `[V-5]`.
- Sơ đồ luồng dữ liệu (đường nét đứt có chấm sáng chạy, hội tụ về `Optimization Agent`) `[V-5]` t5 — `[Chuẩn hoá]` đề xuất đặt ở tab `Charts` thay vì đè lên danh sách, vì trong video nó gây rối thị giác.
- Banner kết thúc dùng chuỗi thống nhất `PLAN APPROVED — DISPATCHING` (`01` §2.3). Nguyên văn video ở đây là `Strategy Confirmed - Dispatching` `[V-5]` `[V-7]` — dùng gạch nối, không phải gạch dài.
- Hai nút đáy: `RECALL` (nút phụ) và `CANCEL` (nút chính). Đây là hành động trên **kế hoạch**; nút `Cancel` đóng modal ở S3 là chức năng khác, cần đặt tên khác (`[Chuẩn hoá]`).

> ⚠️ Ở `[V-6]` t0.5/t2, **cả hai nút đều ghi `CANCEL`** — lỗi sinh ảnh. Dùng cặp `RECALL` / `CANCEL` từ `[V-5]` t9.

---

### S3 — Strategy Generator (modal) `[V-6]`

**Mục đích:** so sánh 3 phương án cạnh nhau.

> ⚠️ Các số của **PLAN A** và **PLAN C** trong sơ đồ dưới đây là **minh hoạ** — video chỉ đọc được số của PLAN B (`Vehicles: 45` / `ETA: -3.5min` / `Cost: Low` / `Coverage 114`). Xem `00 §4.7`.

```
┌─ Strategy Generator ──────────────────────────────── × ─┐
│  [Overview]  Charts                                     │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐ │
│ │ PLAN A                                              │ │
│ │ 🚗 Vehicles          66   ████████████░░  BAD       │ │
│ │ ⏱ ETA            -2.1min  ████░░░░░░░░░  GOOD      │ │
│ │ 💰 Cost             High  ████████████░░  BAD       │ │
│ │ 🛣 Relocation      130km  ███████░░░░░░  MEDIUM    │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌═════════════════════════════════════════════════════┐ │
│ ║ ✓ Recommended                        PLAN B         ║ │ ← viền accent
│ ║ 🚗 Vehicles          45   ████░░░░░░░░░  GOOD      ║ │
│ ║ ⏱ ETA            -3.5min  ███░░░░░░░░░░  GOOD      ║ │
│ ║ 💰 Cost              Low  ███░░░░░░░░░░  GOOD      ║ │
│ ║ 🛣 Relocation       95km  ████░░░░░░░░░  GOOD      ║ │
│ └═════════════════════════════════════════════════════┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ PLAN C                                    …         │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                            [ CANCEL ]  [ REVIEW PLAN ]  │
└─────────────────────────────────────────────────────────┘
```

**Chi tiết**

- Đúng 3 thẻ, cùng kích thước, xếp dọc `[V-6]`.
- Bộ tiêu chí giống nhau ở cả 3 thẻ, kèm icon: xe / đồng hồ bấm giờ / tiền / con đường `[V-6]` t5.
- Mỗi tiêu chí có **thanh so sánh có màu**: mint = `GOOD`, vàng = `MEDIUM`, đỏ = `BAD` `[V-6]` t5.
  - **Bắt buộc:** kèm nhãn chữ `GOOD/MEDIUM/BAD` (hoặc giá trị số). Bốn màu trạng thái không đạt kiểm định phân biệt màu, nên không được đứng một mình — xem §2.2 quy tắc 1.
- Thẻ `Recommended`: viền `--accent` + nền `--accent-soft` + badge có tick `[V-6]` t2, t9.
- `[Chuẩn hoá]` Nút chính ở đáy đổi thành `REVIEW PLAN` — video ghi `CANCEL` ở cả hai nút, rõ ràng là lỗi.

---

### S4 — Plan Review & Approval `[V-8]`

**Mục đích:** màn hình quyết định. Là chốt chặn con người của toàn hệ thống.

```
┌──┬──────────────────────────────────────┬───────────────────────┐
│  │  PLAN B                              │                       │
│ S│                                      │   [bản đồ thu nhỏ]    │
│ I│  ╭───╮  AI Confidence                │   vùng đỏ + mũi tên   │
│ D│  │94%│  ──────────────────────       │   xe hội tụ           │
│ E│  ╰───╯                               │                       │
│ B│                                      │                       │
│ A│  Expected ETA Improvement            │                       │
│ R│  2.1 min                             │                       │
│  │                                      │                       │
│  │  Reasons                             │                       │
│  │  ▌ High Demand Spike        HIGH     │                       │
│  │  ▌ Approaching Rain         CRITICAL │                       │
│  │                                      │                       │
│  │  Actions   ([V-5], không phải V8)    │                       │
│  │  ☑ Re-route 50 Vehicles to Zone B    │                       │
│  │  ☑ Re-route 50 Vehicles to Zone A    │                       │
├──┴──────────────────────────────────────┴───────────────────────┤
│  ✓ PLAN APPROVED — DISPATCHING                                  │
│                        [ REJECT ]  [ MODIFY ]  [ ✓ APPROVE ]    │
└─────────────────────────────────────────────────────────────────┘
```

**Chi tiết**

| Thành phần | Đặc tả | Nguồn |
|---|---|---|
| `AI Confidence` | donut gauge + số % (`94%`), màu theo mức tin cậy | `[V-8]` t5, t9 |
| `Expected ETA Improvement` | stat tile, đơn vị `min` (`2.1 min`) | `[V-8]` |
| `Reasons` | danh sách, mỗi dòng có **thanh màu bên trái** + nhãn mức + chữ | `[V-8]` |
| Bản đồ thu nhỏ | vùng bị ảnh hưởng + mũi tên xe hội tụ về tâm | `[V-8]` t5 |
| Danh sách `Actions` | chuỗi `Re-route N Vehicles to Zone X` | `[V-5]` — **không có ở V8**; `[Chuẩn hoá]` đưa vào màn hình phê duyệt để người duyệt biết mình đang duyệt gì |
| Nút | `REJECT` (đỏ) · `MODIFY` (xám) · `APPROVE` (xanh lá, có ✓) | `[V-8]` |
| Banner xác nhận | nguyên văn `PLAN APPROVED - DISPATCHING` (gạch nối), hiện **tại chỗ ngay trên hàng nút** | `[V-8]` t9 · `[Chuẩn hoá]` dùng gạch dài `—` để thống nhất |

**Quy tắc tương tác**

- `APPROVE` chỉ bật khi có ≥ 1 action được chọn. `[Chuẩn hoá]`
- Sau khi bấm `APPROVE`: hàng nút bị vô hiệu hoá, banner xuất hiện tại chỗ, sau ~2s chuyển sang S5. Không dùng modal xác nhận — video cho thấy phản hồi tại chỗ.
- `MODIFY` → `[Cần xác nhận]` video không có màn hình sửa. Đề xuất tối thiểu: cho phép sửa `quantity` và `to_zone` của từng action, rồi tính lại chỉ số.
- `REJECT` → `[Cần xác nhận]` đề xuất: hỏi lý do (chọn từ danh sách) để làm dữ liệu phản hồi cho model.

---

### S5 — Execution Monitor `[V-9]` `[V-10]`

**Mục đích:** theo dõi kế hoạch đang chạy.

**Khác biệt so với S1**

| Yếu tố | Nguồn |
|---|---|
| Bản đồ ở giữa có **viền sáng (glow)** đánh dấu đang trong chế độ thực thi | `[V-9]` t9 |
| Tuyến điều xe **nét đứt xanh lá** có waypoint tròn, xe di chuyển dọc tuyến kèm mũi tên | `[V-9]` `[V-10]` |
| Zone đích có nhãn nổi bật kèm ⚠ (`ZONE D`) | `[V-9]` t9 |
| Sidebar có **donut gauge chứa nhãn kế hoạch** (`PLAN V2`) | `[V-10]` t9 |
| Panel phải hiển thị tiến độ (`92%`, `99%`) | `[V-10]` t9 |
| Dải trạng thái dưới bản đồ: `ADAPTIVE ROUTING ACTIVE` | `[V-10]` t9 |
| Bảng log sự kiện, dòng đỏ/xanh theo mức | `[V-9]` `[V-10]` `[V-11]` — nội dung cột `[Cần xác nhận]` |

**C-toast — Toast dữ liệu mới** `[V-10]`

```
┌──────────────────────────────────────────┐
│  🔔  NEW DATA INGESTED                ×  │
└──────────────────────────────────────────┘
```

- Vị trí: trên cùng, căn giữa vùng nội dung.
- Có nút × đóng; tự ẩn sau `[Cần xác nhận]` giây.
- Bấm vào toast → cuộn tới panel S6.

**Sidebar pipeline dữ liệu** `[V-10]` `[V-11]`

Cây 3 mục, mục đang chạy được highlight nền, kèm thanh progress:

```
▾ NEW DATA              ████████████  100%
▸ FORECAST UPDATE       ███████░░░░░   62%   ← highlight
▸ OPERATION             ░░░░░░░░░░░░    0%
```

---

### S6 — Updated Recommendation `[V-11]`

**Mục đích:** trình bày kế hoạch đã lập lại, kèm lý do, để phê duyệt riêng.

```
┌─ UPDATED RECOMMENDATION ────────────────────────┐
│                                                 │
│  Expected service risk                          │
│  ▲ 31%          reduction                       │
│                                                 │
│  vs CURRENT ACTIVE PLAN                         │
│  ─────────────────────────────────────────────  │
│  Reasoning                                      │
│  •  Rain impact detected.                       │
│  •  Demand forecast increased in Zone D.        │
│  •  Nearby supply is insufficient.              │
│  ─────────────────────────────────────────────  │
│         [ VIEW CHANGES ]  [ APPROVE UPDATE ]    │
└─────────────────────────────────────────────────┘
```

**Chi tiết**

- Tiêu đề `UPDATED RECOMMENDATION` chữ hoa `[V-11]`.
- Chỉ số chính `Expected service risk` với **mũi tên ▲ xanh lá** thể hiện cải thiện `[V-11]` t9.
  - Lưu ý: mũi tên lên + màu xanh lá ở đây nghĩa là *"mức giảm rủi ro tăng lên"*, tức là tốt. Nhãn `reduction` **bắt buộc** phải hiện, nếu không người đọc sẽ hiểu ngược.
- Khối `Reasoning` — câu đầy đủ, có dấu chấm, gạch đầu dòng `[V-11]`.
- `VIEW CHANGES` (nút viền) mở diff giữa `PLAN V2` và `CURRENT ACTIVE PLAN`. `[Cần xác nhận]` video không cho thấy màn hình diff.
- `APPROVE UPDATE` (nút nền xanh lá) là hành động chính.

---

## 5. Thư viện component

| ID | Component | Nguồn | Ghi chú đặc tả |
|---|---|---|---|
| C-01 | Zone polygon | `[V-3]` `[V-7]` | fill opacity 0.35, stroke 2px cùng hue đậm hơn; nhãn zone luôn hiện |
| C-02 | Vehicle marker | `[V-2]` | icon xe nhìn từ trên; biến thể: bình thường / đang di chuyển (có mũi tên) / thiếu (gạch chéo đỏ) |
| C-03 | Stat tile | `[V-2]` `[V-3]` | nhãn UPPERCASE nhỏ ở trên, số lớn ở dưới; tuỳ chọn sparkline |
| C-04 | Donut gauge | `[V-1]` `[V-8]` `[V-10]` | vòng 8px, chữ ở tâm; dùng cho `AI Confidence`, tiến độ, `PLAN V2` |
| C-05 | Line chart | `[V-2]` `[V-3]` | đường 2px, không marker trừ khi hover; crosshair + tooltip mặc định |
| C-06 | Forecast area chart | `[V-4]` | phần thực tế đặc, phần dự báo có **dải nền vàng + đường nét đứt** |
| C-07 | Comparison bar | `[V-6]` | thanh ngang, đầu bo 4px, luôn kèm nhãn chữ |
| C-08 | Agent row | `[V-5]` | icon + tên + trạng thái; mở rộng được để hiện action |
| C-09 | Action checkbox row | `[V-5]` | checkbox + nội dung + nút phụ |
| C-10 | Plan card | `[V-6]` `[V-7]` | badge Recommended, bảng chỉ số, mini bar chart |
| C-11 | Reason row | `[V-8]` | thanh màu 3px bên trái + chữ + nhãn mức |
| C-12 | Alert tooltip | `[V-3]` | nền đặc, đường neo mảnh, icon ⚠ |
| C-13 | Timeline scrubber | `[V-4]` | 4 mốc rời rạc, núm icon xe, badge bám theo |
| C-14 | Toast | `[V-10]` | icon + chữ + nút đóng |
| C-15 | Status banner | `[V-5]` `[V-8]` `[V-10]` | tick + chữ, hiện tại chỗ |
| C-16 | Pipeline tree | `[V-10]` `[V-11]` | mục cây + thanh progress + highlight mục đang chạy |
| C-17 | Route polyline | `[V-9]` `[V-10]` | nét đứt, waypoint tròn, có chỉ hướng |

---

## 6. Quy tắc biểu đồ

Áp dụng cho mọi biểu đồ trong sản phẩm.

1. **Một trục y duy nhất.** Không bao giờ dual-axis. `[Đề xuất]` Supply và demand khác thang → hai chart riêng hoặc quy về chỉ số chung, không ghép hai trục y.
2. **Chuỗi dữ liệu gán màu theo thứ tự cố định** `--series-1..3`, không xoay vòng. Lọc bớt chuỗi **không** được đổi màu các chuỗi còn lại.
3. **Dữ liệu dự báo luôn có texture** (nét đứt / dải nền), không chỉ khác màu `[V-4]`.
4. **Có legend khi ≥ 2 chuỗi**; ≤ 4 chuỗi thì thêm direct label ở cuối đường. Một chuỗi thì tiêu đề đã đủ, không cần legend.
5. **Grid và trục lùi về sau**: hairline `--grid`, không kẻ dọc trừ khi thật cần.
6. **Mọi line/area chart có crosshair + tooltip; mọi bar/donut có tooltip theo mark.**
7. **Không đặt số lên mọi điểm dữ liệu.** Chỉ direct label điểm đầu, điểm cuối, và điểm cực trị.
8. **Chữ mặc màu chữ, không mặc màu chuỗi.** Giá trị và nhãn dùng `--ink-*`; chấm màu nhỏ bên cạnh mang định danh.
9. **Có chế độ xem dạng bảng** cho mọi biểu đồ (yêu cầu tiếp cận).

---

## 7. Trạng thái & phản hồi

| Trạng thái | Xử lý | Nguồn |
|---|---|---|
| Đang tải panel | skeleton giữ nguyên chiều cao, không nhảy layout | `[V-5]` t0.5 panel rỗng rồi mới đổ nội dung |
| Đang chạy agent | spinner trên hàng agent, các hàng sau mờ | `[V-5]` |
| Không có sự cố | bản đồ toàn xanh, P1 hiển thị bình thường, không banner | `[V-3]` t0.5 |
| Agent lỗi | `[Cần xác nhận]` — video không có | — |
| Mất kết nối dữ liệu | `[Cần xác nhận]` — video không có | — |
| Rỗng (chưa có plan) | `[Cần xác nhận]` — video không có | — |

---

## 8. Tiếp cận (Accessibility)

Ràng buộc bắt buộc, không phải tuỳ chọn:

- **Không bao giờ dùng màu một mình.** Bốn màu trạng thái **trượt** kiểm định `--pairs all` (chi tiết ở §2.2): cặp đỏ↔xanh lá đo `ΔE 4.1` deutan, cặp cam↔vàng đo `ΔE 13.6` ở thị lực bình thường, kiểm định trên nền `#141A1F`. Mọi zone, mọi hàng lý do, mọi thanh so sánh đều **phải** có icon hoặc nhãn chữ đi kèm. Video đã làm đúng ở phần cảnh báo (⚠ + `ZONE D`) — cần áp dụng nhất quán.
- **Dự báo phân biệt bằng texture** (nét đứt / gạch chéo), không chỉ bằng màu `[V-4]`.
- Tương phản chữ ≥ 4.5:1 với bề mặt; nhãn chỉ số UPPERCASE 11px phải dùng `--ink-secondary` trở lên, không dùng `--ink-muted`.
- Điều hướng bàn phím đầy đủ cho luồng phê duyệt (S4) — đây là hành động có hậu quả.
- `APPROVE` / `REJECT` không được phân biệt **chỉ** bằng màu: `APPROVE` có ✓, `REJECT` đặt xa nhất bên trái.

---

## 9. Câu hỏi UI/UX mở

| # | Câu hỏi | Ảnh hưởng |
|---|---|---|
| U1 | Theme mặc định cho chế độ desktop — dark (theo video) hay light (theo ghi chú design system)? | Toàn bộ token |
| U2 | Chân trời timeline: +10/+20/+30 hay 5/10/15 phút? | C-13, S1 |
| U3 | `MODIFY` mở màn hình gì? | S4 |
| U4 | `VIEW CHANGES` hiển thị diff thế nào? | S6 |
| U5 | Bảng log ở S5 có những cột nào? | S5 |
| U6 | Wall board có tự luân phiên giữa nhiều sự cố không? | S0 |
| U7 | Xử lý màn hình khi agent lỗi / mất dữ liệu | Mọi màn hình |
| U8 | Zone là hexagon hay đa giác hành chính — ảnh hưởng cách vẽ nhãn | C-01 |
| U9 | Ngôn ngữ giao diện: video 100% tiếng Anh. Sản phẩm dùng tiếng Việt, tiếng Anh, hay song ngữ? | Toàn bộ chuỗi văn bản |
