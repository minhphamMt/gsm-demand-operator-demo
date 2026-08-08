# TÀI LIỆU ĐẶC TẢ KỸ THUẬT HỢP NHẤT (UNIFIED TECHNICAL SPEC)
# GSM-14 · NovaFour — AI Agent Dự Báo Thiếu Xe Theo Vùng & Đề Xuất Điều Chuyển Có Kiểm Soát (HITL) Dưới Ảnh Hưởng Của Mưa Giờ Cao Điểm

**Mã dự án:** GSM-14 · **Nhóm:** NovaFour
**Thời gian:** 27/07/2026 – 31/08/2026 (6 tuần, 11 sprint) — demo ổn định cuối **Tuần 5**
**Kho mã nguồn:** https://github.com/AI20K-Build-Phase-Cohort-3/P-042
**Phiên bản:** 1.3 — Hợp nhất từ 3 tài liệu nguồn + **UI tài xế (Driver App)** (2026-08-04) + **đặc tả Baseline & Đối chứng** (2026-08-05) + **bổ sung field contract cho điều phối/tối ưu** (2026-08-06)
**Trạng thái:** Draft cho triển khai

> **Thay đổi ở v1.3 (2026-08-06) — 6 field bổ sung, vào trước mốc khóa contract cuối W2 (I-08):**
> | Field | Contract | Lý do |
> |---|---|---|
> | `enroute_arrivals[]` (`arrival_ts`, `eta_steps`) | 4.1 | `enroute_supply` là số vô hướng → không biết unit nào khả dụng lúc nào, và không tách được xe từ relocation với xe từ activation (acceptance 5.5) |
> | `supply_p10` / `supply_p90` | 4.2 | Chế độ thận trọng `rain_peak` mới chỉ thận trọng ở phía cầu (`demand_p90`); phía cung vẫn dùng điểm p50 |
> | `idle_supply_current` | 4.3 | Optimizer cần cung **hiện tại** của zone nguồn để áp `max_supply_move_pct` và `min_supply_per_zone` — số này không suy ra được từ `surplus` (vốn là hiệu dự báo) |
> | `cooldown_until_ts` | 4.3 | Ràng buộc `cooldown_minutes` (5.4) trước nay không có field nào lưu trạng thái |
> | `driver_status_at_offer` | 4.8 | Quyết định accept làm **tăng tổng cung** hay chỉ **dịch chuyển cung**; phải đóng băng lúc phát hành vì offer sống 2 step, trạng thái tài xế đổi được trong khoảng đó |
> | `rain_fc30_x_peak` | A2 (feature) | Đối xứng với `rain_fc15_x_peak`; horizon 30 phút hiện không có feature tương tác nào |

> **Thay đổi ở v1.2 (2026-08-05):** bổ sung **mục 5.14 — Baseline & Đối chứng (FR-14)**: đặc tả đầy đủ hai baseline (`no-action` và `historical average`), quy ước tính ở mức tổng hợp, artifact bàn giao, quy tắc khóa, và **xử lý phụ thuộc ngược về tiến độ** (baseline khóa cuối W2 nhưng Simulator ở W3 → tách `metrics.py` làm trước).

> **Thay đổi lớn ở v1.1 (2026-08-04):** nhóm chốt bổ sung **actor thứ 2 có UI riêng — Tài xế**, với ứng dụng nhận **thông báo incentive/huy động** và phản hồi Nhận/Từ chối; phản hồi này **quay ngược vào mô phỏng** (cập nhật supply → tính lại metrics). Xem tóm tắt toàn bộ thay đổi và tác động tiến độ tại **mục 12**.

**Tài liệu nguồn:**
1. `GSM14_NovaFour_Brief_PRD.docx` — Project Brief & PRD (chuẩn về phạm vi, KPI, actor, timeline, FR/NFR)
2. `SPEC-AI-Agent-Phan-Bo-Xe-Gio-Cao-Diem.md` — Technical Spec v1.0 (chuẩn về kiến trúc, data contract, chi tiết module)
3. `feature_dictionary.md` — Feature Dictionary (chuẩn về quyết định kỹ thuật đã chốt của team Data: lookback, công thức hotspot, thuật toán optimizer, policy.yaml)

> Khi 3 tài liệu vênh nhau, mục 10 (Bảng đối chiếu mâu thuẫn) ghi rõ phương án chốt và lý do.

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1. Bối cảnh & Problem Statement
GreenSM (khu vực Hà Nội) gặp khó khăn khi tối ưu phân bổ và huy động xe trong bối cảnh **trời mưa vào giờ cao điểm**. Việc huy động tài xế online, điều xe và thiết lập giá đang thực hiện **bị động**, dẫn đến: thiếu xe cục bộ, thời gian chờ dài, khách hủy chuyến.

**Nguyên nhân gốc (tổng hợp từ PRD + research):**
- Dữ liệu cung–cầu phân tán trên nhiều nguồn (dashboard/Excel/chat nội bộ), không có ngưỡng/forecast thống nhất để phát hiện sớm vùng sẽ thiếu xe.
- Người vận hành không có công cụ đánh giá nhanh phương án điều chuyển giữa 20–50 vùng dưới nhiều ràng buộc cùng lúc (ngân sách, khoảng cách, số xe khả dụng).
- Mưa tạo **mất cân bằng cung–cầu kép**: cầu tăng đột biến (Brodeur & Nield 2018: +19–22%; Liu et al. 2021, Haikou: +0.59%/mm/h), đồng thời cung giảm — đặc biệt giờ cao điểm chiều 17:00–19:00 (Kamga & Yazici: tài xế đạt mục tiêu thu nhập sớm rồi nghỉ ca khi mưa).

### 1.2. Product Vision & Goals

| Mục | Nội dung |
|---|---|
| **Product Vision** | "Copilot điều phối" đáng tin cậy giúp Người vận hành chuyển từ quan sát dữ liệu sang một quyết định điều phối có căn cứ trong vài phút — quyền kiểm soát và trách nhiệm vẫn thuộc về con người; **tài xế nhận được lời mời huy động rõ ràng, tự nguyện, và phản hồi của họ được đưa ngược vào mô phỏng**. |
| **Product Goal (6 tuần)** | Luồng mô phỏng end-to-end cho 30 zone, time step 5 phút, horizon 15–30 phút: replay snapshot → forecast → hotspot → plan → explanation → before/after → revise/approve/reject → **activation offer → phản hồi tài xế → re-simulate** → history. Demo ổn định cuối Tuần 5. |
| **Business Goal** | Trong mô phỏng: giảm ≥20% unmet demand so với no-action; không vượt ngân sách (bao gồm **ngân sách incentive** tách riêng); không làm thiếu xe vùng nguồn; không vượt giới hạn khoảng cách; thể hiện rõ chi phí chạy rỗng (deadhead). |
| **User Goal — Người vận hành** | Nhận biết vùng thiếu xe, hiểu lý do và tác động của đề xuất, phê duyệt/chỉnh sửa/từ chối trong ≤2 phút. UAT usefulness/clarity ≥4/5. |
| **User Goal — Tài xế** | Nhận thông báo huy động dễ hiểu (zone nào, thiếu bao nhiêu, thưởng bao nhiêu, đi bao xa/bao lâu) và quyết định Nhận/Từ chối trong **≤20 giây**, không cần đọc thêm gì khác. UAT clarity ≥4/5. |

### 1.3. Actor & Quyền quyết định

| Actor | Loại | Phạm vi MVP |
|---|---|---|
| Người vận hành (Dispatcher) | Primary user #1 / Decision maker | **Must** — UI vận hành đầy đủ (5.12) |
| **Tài xế (Driver)** | **Primary user #2 / Người thực thi tự nguyện** | **Must** — **UI riêng (Driver App, 5.13)**: nhận thông báo incentive/huy động, Nhận hoặc Từ chối. Phản hồi cập nhật ngược supply mô phỏng. Ràng buộc "không rút cạn vùng nguồn" tiếp tục bảo vệ actor này |
| Quản lý vận hành | Business/policy owner | Indirect |
| AI/Platform Admin | Supporting system role | Tài khoản demo/bypass |
| Mentor/Evaluator | Project stakeholder | Ngoài nghiệp vụ vận hành |

> **Ranh giới quyền quyết định (quan trọng):** Dispatcher quyết định **plan điều chuyển** (approve/reject/revise). Tài xế **không nhận lệnh** — chỉ nhận **lời mời (offer)** và có toàn quyền từ chối, không bị phạt. Hệ thống không tự ý thay đổi trạng thái xe khi tài xế chưa bấm Nhận.

### 1.4. Cấu trúc bài toán
Tách 3 khối, giao tiếp qua contract dữ liệu (mục 4):

```
┌─────────────────┐   ┌────────────────────────────────┐   ┌──────────────────────────────┐
│   KHỐI A         │   │   KHỐI B — ĐIỀU PHỐI          │   │  KHỐI C — HUY ĐỘNG           │
│   DỰ BÁO         │──▶│   Hotspot → Plan → Simulate → │──▶│  (ACTIVATION)                │
│   (Model 1)      │   │   Explanation → HITL          │   │  Residual gap → Offer →      │
│                  │   │   (Model 2 + 3 + Simulator)   │   │  Driver App → Phản hồi →     │
│                  │   │   ↑ UI Người vận hành         │   │  Re-simulate                 │
│                  │   │                                │   │  ↑ UI Tài xế (Driver App)    │
└─────────────────┘   └────────────────────────────────┘   └──────────────────────────────┘
                                    ▲                                      │
                                    └──── supply cập nhật (enroute) ───────┘
```

### 1.5. Phạm vi (Scope)

**Trong phạm vi (In-scope) — MVP:**
- Replay snapshot cung–cầu **30 zone**, time step **5 phút**, synthetic data có seed cố định.
- Dự báo demand/supply **t+15 và t+30 phút** theo zone (baseline-first: historical average → LightGBM).
- Hotspot detection theo ngưỡng policy + mức ưu tiên (severity), có hysteresis chống nhấp nháy.
- Optimizer đề xuất relocation plan zone-to-zone (**greedy theo severity** là chính; min-cost flow/OR-Tools là nâng cấp có điều kiện), tuân thủ policy.yaml (ngân sách, khoảng cách, min supply vùng nguồn…).
- Mô phỏng trước–sau **deterministic**, so sánh baseline no-action; thể hiện chi phí deadhead.
- Explanation contract: lý do, chi phí, rủi ro, cảnh báo, độ tin cậy — template bắt buộc, LLM optional có fallback.
- **HITL bắt buộc:** chỉnh sửa/phê duyệt/từ chối; state machine `Draft → Proposed → Revised → Approved/Rejected`.
- Lưu **100% quyết định** vào History Store (audit trail, append-only) — bao gồm **cả phản hồi của tài xế**.
- **Activation Engine (FR-11, Must):** từ `residual_gap` sinh **offer incentive nhắm tới tài xế cụ thể** trong môi trường mô phỏng (chọn ứng viên theo khoảng cách/trạng thái, định mức thưởng, TTL, ngân sách incentive riêng).
- **UI Người vận hành (FR-12a, Must):** gom yêu cầu UI vốn rải rác ở 5.1–5.9 + khối "Huy động thêm" và bảng so sánh 3 kịch bản (5.12).
- **Driver App — UI tài xế (FR-12b, Must):** màn hình nhận thông báo huy động (zone, gap, thưởng, khoảng cách, ETA, hạn phản hồi) + nút **Nhận / Từ chối** (lý do không bắt buộc); danh sách offer đang mở và lịch sử offer của tài xế đó (5.13).
- **Vòng phản hồi đóng (FR-13, Must):** tài xế bấm Nhận → cập nhật `enroute_supply` zone đích sau `eta_steps` → Simulator tính lại metrics (`metrics_after_activation`) → so sánh 3 kịch bản no-action / plan-only / plan+activation. Đặc tả nằm ở contract 4.9 + Simulator 5.5 + Activation Engine 5.11 (không tách module riêng).
- **Mô hình phản hồi tài xế mô phỏng (deterministic, có seed):** dùng cho các tài xế không do người thật thao tác trong demo — xác suất Nhận theo mức thưởng/khoảng cách (giả định thô, C-07).
- Công cụ nạp scenario & reset trạng thái demo (chạy ổn định 5/5 lần), bao gồm reset hàng đợi offer.
- **Baseline & Đối chứng (FR-14, Must):** hai baseline làm mốc so cho KPI — `no-action` (mốc của Khối B/C) và `historical average` (mốc của Model 1), kèm quy ước tính, artifact bàn giao và quy tắc khóa cuối W2 (5.14).

**Ngoài phạm vi (Out-of-scope) — MVP:**
- Gửi lệnh điều phối xe thật; tích hợp vận hành/người dùng/**tài xế thật** của GreenSM. Driver App chỉ chạy với **tài khoản tài xế demo** trong môi trường mô phỏng.
- Push notification thật (FCM/APNs/SMS/Zalo), thanh toán/quyết toán thưởng thật, xác thực danh tính tài xế, định vị GPS thật.
- Đấu giá/thương lượng mức thưởng; tài xế đề xuất ngược giá; xếp hạng/chấm điểm tài xế; chế tài khi từ chối.
- Điều hướng turn-by-turn, matching cuốc khách–xe, surge pricing, sạc EV.
- Mô hình nâng cao: MARL/RL, DeepETA, ST-GNN (DCRNN, Graph WaveNet, ST-MGCN, PDFormer, WGNN), fine-tuning, production-scale.
- Kết nối radar khí tượng NCHMF/VNMHA thời gian thực; nowcasting model riêng (DGMR/NowcastNet).
- Learning loop dài hạn dựa trên dữ liệu thực thi thật; **học xác suất phản hồi tài xế từ dữ liệu thật** (MVP chỉ dùng hàm giả định có tham số, xem 5.11).

### 1.6. Ràng buộc dự án (Constraints)

| Mã | Ràng buộc |
|---|---|
| C-01 | 4 thành viên, 6 tuần; demo ổn định cuối Tuần 5. |
| C-02 | Synthetic data; không tích hợp vận hành hoặc người dùng thật. |
| C-03 | Human approval bắt buộc; không gửi lệnh xe thật — "approved" chỉ kích hoạt mô phỏng/lưu lịch sử. **Sửa v1.1:** hệ thống có gửi **thông báo huy động** nhưng chỉ tới **tài khoản tài xế demo trong môi trường mô phỏng**, không tới tài xế thật, không qua kênh push/SMS thật. |
| C-04 | Một loại phương tiện, một khu vực mô phỏng, 30 zone cố định (trong dải 20–50). |
| C-05 | Baseline-first; không fine-tune, MARL/RL, DeepETA/STGCN hoặc production-scale. |
| C-06 | Mọi module phải có mock/fallback để không chờ dependency. |
| C-07 | KPI business chỉ là **simulation proxy**; không tuyên bố ROI/impact thực tế. **Áp dụng đặc biệt cho activation:** mọi tỷ lệ nhận offer là **giả định tham số hóa**, không phải hành vi tài xế đo được. |
| **C-08** | **Tài xế luôn có quyền từ chối, không bị phạt, không bị chấm điểm.** Không có cơ chế ép buộc, không hiển thị xếp hạng/áp lực. Offer hết hạn tự hủy — im lặng không bị coi là từ chối có ghi nhận tiêu cực. |
| **C-09** | **Ngân sách incentive tách riêng khỏi `budget_cap` điều chuyển** — hai trần độc lập, không bù trừ cho nhau (tránh tình huống tăng thưởng làm hết ngân sách deadhead hoặc ngược lại). |

### 1.7. Chỉ số thành công (Success Metrics)

| Chỉ số | Mục tiêu | Nguồn |
|---|---|---|
| Luồng demo end-to-end | Chạy ổn định **5/5 lần** | PRD |
| Hotspot recall (trên test set deterministic) | **≥ 80%** | PRD |
| Giảm unmet demand so với baseline no-action | **≥ 20%** | PRD |
| Thời gian tạo relocation plan (p95) | **≤ 5 giây** | PRD |
| Thời gian ra quyết định của người vận hành | **≤ 2 phút/plan** | PRD |
| Điểm UAT usefulness/clarity (Dispatcher) | **≥ 4/5** | PRD |
| Lưu lịch sử quyết định | **100%** | PRD |
| **Giảm residual gap sau activation** | **≥ 30%** phần gap còn lại sau relocation (so với chỉ relocation) | **Mới v1.1** — đo trong mô phỏng, dùng accept-rate giả định đã công bố |
| **Thời gian tài xế ra quyết định** | **≤ 20 giây/offer** (đo trong UAT với người thật bấm thử) | **Mới v1.1** |
| **Độ trễ offer → hiển thị trên Driver App** | **< 2 giây** | **Mới v1.1** |
| **Độ trễ phản hồi tài xế → metrics cập nhật** | **< 2 giây** | **Mới v1.1** — dùng chung ngân sách thời gian với re-simulate |
| **Điểm UAT clarity (Tài xế)** | **≥ 4/5** — tài xế hiểu đúng "đi đâu, thưởng bao nhiêu, được từ chối" mà không cần giải thích thêm | **Mới v1.1** |
| **Lưu lịch sử offer + phản hồi tài xế** | **100%** | **Mới v1.1** |
| MAPE dự báo tổng thể | **< 15%** | SPEC kỹ thuật |
| Thắng baseline (historical average) ở regime `rain_peak` | **≥ 20%** relative trên MAE/MAPE | SPEC kỹ thuật |
| Độ trễ inference dự báo (30 zone/horizon) | **< 1 giây** | SPEC kỹ thuật |
| Độ trễ re-simulate khi revise | **< 2 giây** | SPEC kỹ thuật |
| Explanation khớp số liệu plan gốc | **100%** | SPEC kỹ thuật |

> Lưu ý (I-08): baseline no-action và bộ test set deterministic phải **khóa trước cuối Tuần 2 (Sprint 4)** rồi mới chốt target cuối cùng. Hai KPI in đậm ở trên (**giảm unmet demand ≥20%** và **thắng baseline historical average ≥20%**) chỉ có nghĩa khi mốc so đã khóa — đặc tả đầy đủ cách dựng, quy ước tính và quy tắc khóa của cả hai baseline nằm ở **mục 5.14**.

---

## 2. JOB-TO-BE-DONE, PAIN POINTS & BOTTLENECK

### 2.1. JTBD

| Mã | Tình huống → Công việc | Scope |
|---|---|---|
| JTBD-01 | Mưa giờ cao điểm / tín hiệu cung–cầu thay đổi → phát hiện sớm vùng nguy cơ thiếu xe trong 15–30 phút | **Primary** |
| JTBD-02 | Hotspot được phát hiện → đánh giá phương án di chuyển xe từ vùng dư sang vùng thiếu dưới ràng buộc | Secondary |
| JTBD-03 | AI đưa khuyến nghị → hiểu lý do/chi phí/rủi ro/tác động; chỉnh/phê duyệt/từ chối | Secondary |
| JTBD-04 | Quyết định được ghi nhận → xem lịch sử, người sửa/duyệt, kết quả mô phỏng | Secondary |
| JTBD-05 | Relocation không bù đủ shortage → biết residual gap và **huy động tài xế bằng offer có thưởng, thấy được bao nhiêu người nhận** | **Must** (nâng từ Should ở v1.0) |
| **JTBD-07** | **(Tài xế) Trời mưa giờ cao điểm, tôi đang rảnh/định nghỉ → tôi muốn biết đi vùng nào thì có khách và được thưởng bao nhiêu, để quyết định trong vài giây có nên chạy tiếp không** | **Must** — Driver App (5.13) |
| **JTBD-08** | **(Tài xế) Tôi nhận offer → tôi muốn biết mình phải tới đâu, còn bao nhiêu thời gian, và có thể đổi ý không** | Secondary — Driver App |
| JTBD-06 | Tự động gửi lệnh/thông báo **tới tài xế thật qua kênh push/SMS**, theo dõi tuân thủ trong vận hành thật | **Won't** (ngoài MVP — trong MVP chỉ gửi tới tài khoản demo, xem C-03) |

### 2.2. Pain Points (P0/P1)

| Mã | Pain point | Ưu tiên | Module giải quyết |
|---|---|---|---|
| PP-01 | Mất thời gian tổng hợp/diễn giải snapshot theo nhiều vùng | P0 | Replay + UI heatmap (5.1) |
| PP-02 | Phát hiện vùng sắp thiếu xe quá muộn | P0 | Forecasting + Hotspot (5.2, 5.3) |
| PP-03 | Không đánh giá thủ công được nhiều phương án giữa 20–50 vùng | P0 | Optimizer (5.4) |
| PP-04 | Không biết tác động dự kiến trước khi phê duyệt | P0 | Simulator before/after (5.5) |
| PP-05 | Khó tin AI nếu chỉ nhận một con số/plan không lý do | P1 | Explanation (5.6) |
| PP-06 | Khó cân bằng giảm shortage với deadhead và ngân sách | P1 | Optimizer + policy.yaml (5.4) |
| PP-07 | Khó truy vết ai sửa/duyệt và plan có hiệu quả không | P1 | HITL + History (5.7, 5.8) |
| **PP-08** | **Điều chuyển xe đang chạy không bù đủ gap — cần thêm xe từ nguồn tài xế đang rảnh/offline nhưng không có cách chạm tới họ** | **P0** | Activation Engine (5.11) |
| **PP-09** | **(Tài xế) Mưa giờ cao điểm không biết vùng nào đang thiếu xe; nếu chạy tiếp mà vẫn ế thì lỗ công — nên chọn nghỉ sớm** | **P0** | Driver App (5.13) — hiện rõ zone thiếu + mức thưởng cụ thể |
| **PP-10** | **(Tài xế) Sợ bị "ép" nhận lệnh điều chuyển, mất quyền tự chủ giờ giấc** | P1 | C-08 + thiết kế UI: offer tự nguyện, từ chối 1 chạm, không chấm điểm |
| **PP-11** | Không biết chiến dịch huy động có hiệu quả không (bao nhiêu người nhận, tốn bao nhiêu tiền thưởng) | P1 | Activation metrics + History (5.11, 5.8) |

### 2.3. Bottleneck nghiệp vụ (MVP tập trung BN-01 → BN-03 **+ BN-05**)

| Mã | Bottleneck | Cần giải quyết |
|---|---|---|
| BN-01 | Không phát hiện đủ sớm vùng thiếu xe trong 15–30 phút | Phát hiện sớm thay vì phản ứng khi đã quá tải |
| BN-02 | Không đánh giá nhanh được kế hoạch điều chuyển tối ưu dưới ràng buộc | Tính toán & đo lường tác động trước/sau |
| BN-03 | Người vận hành không đủ bằng chứng để tin, chỉnh và chịu trách nhiệm | Giải thích, mô phỏng kịch bản, lưu vết quyết định |
| **BN-05** | **Tổng cung trong hệ thống không đủ — điều chuyển chỉ chia lại chiếc bánh, không làm nó to ra** | **Kênh chạm tới tài xế đang rảnh/offline (Driver App) + đòn bẩy incentive; đo được bao nhiêu người thực sự nhận** |

BN-04 (dữ liệu doanh nghiệp), BN-06 (learning loop): ghi nhận nhưng ngoài phạm vi MVP.

> **Lý do nâng BN-05 vào phạm vi (2026-08-04):** BN-01→BN-03 chỉ tối ưu *phân bổ* lượng cung sẵn có. Ở kịch bản demo chính (mưa 17:00–19:00), cung giảm đồng thời với cầu tăng (Kamga & Yazici) — nghĩa là có những thời điểm **tổng cung < tổng cầu toàn hệ thống**, khi đó không phương án điều chuyển nào bù nổi `residual_gap`. Không có kênh huy động thì `residual_gap` mãi chỉ là một con số hiển thị mà không có hành động tiếp theo.

---

## 3. KIẾN TRÚC HỆ THỐNG

### 3.1. Sơ đồ luồng dữ liệu

```
[Snapshot Store] --5min--> [Replay Engine] --t--> [Model 1: Forecast (Khối A)]
                                                         |
                                                         v (forecast t+15, t+30)
                                                   [Model 2: Hotspot Detection]
                                                         |
                                                         v (hotspot + surplus zones)
                                                   [Model 3: Relocation Optimizer]
                                                         |
                                                         v (plan JSON, status=Proposed)
                                                   [Simulator Before/After]
                                                         |
                                                         v (metrics_before/after + residual gap)
                                                   [Explanation Engine]
                                                         |
                                                         v
                                          [UI VẬN HÀNH — HITL: Revise / Approve / Reject]
                                                         |            ▲
                                                         |  revise → re-simulate (<2s)
                                                         v (status=Approved + residual_gap)
                                          ┌──────────────────────────────────┐
                                          │  KHỐI C — ACTIVATION ENGINE      │
                                          │  chọn ứng viên → định mức thưởng │
                                          │  → sinh Activation Offer         │
                                          └──────────────────────────────────┘
                                                         |
                                                         v (offer, TTL)
                                          ┌──────────────────────────────────┐
                                          │  UI TÀI XẾ — DRIVER APP          │
                                          │  Nhận / Từ chối (kèm lý do)      │
                                          └──────────────────────────────────┘
                                                         |
                                                         v (Driver Response)
                                          [Cập nhật enroute_supply → Simulator]
                                                         |
                                                         v (metrics_after_activation, <2s)
                                          [UI vận hành: bảng 3 kịch bản]
                                                         |
                                                         v
                                                   [History Store (append-only)]
                                          ghi: plan · quyết định · offer · phản hồi tài xế
```

**Ba kịch bản luôn được tính song song để so sánh:**

| Kịch bản | Nội dung | Dùng để |
|---|---|---|
| `no_action` | `moves = []`, không offer | Baseline chính thức (KPI ≥20%) |
| `plan_only` | Áp relocation đã approve, không activation | Đo riêng đóng góp của Khối B |
| `plan_activation` | Relocation + số xe tài xế thực sự **Nhận** | Đo đóng góp thêm của Khối C (KPI residual gap ≥30%) |

### 3.2. Nguyên tắc kiến trúc bắt buộc
1. **Contract-first:** mọi module giao tiếp qua JSON schema chốt ở Tuần 1–2 (mục 4). Sau Tuần 2 **không sửa field cũ** — chỉ thêm field optional.
2. **Mock-first (C-06):** module chưa hoàn thiện luôn có mock trả đúng contract để module khác/UI phát triển song song; mọi module có fallback riêng.
3. **Baseline-first (C-05):** rule/historical average trước, model học sau; heuristic trước, optimizer trước–OR-Tools sau (nếu kịp). Baseline vừa là mock để chạy song song, vừa là **mốc đối chứng của KPI** — **khóa cuối W2, trước khi biết kết quả của chính mình** (mục 5.14).
4. **Đánh giá theo 4 regime:** mọi metric dự báo và điều phối tách riêng theo `normal / peak / rain / rain_peak`. Regime `rain_peak` là thước đo thành công chính.
5. **Không state ẩn:** mọi quyết định (plan, revise, approve/reject) log đầy đủ vào History Store — audit và demo.
6. **Deterministic:** simulator và test set deterministic; synthetic data có seed cố định; mọi run gắn `model_version`.

### 3.3. Policy (policy.yaml — nguồn ngưỡng duy nhất)
Toàn bộ ngưỡng vận hành lấy **nguyên bảng** từ `policy.yaml` — không tạo ngưỡng riêng trong từng module:

| Key | Kiểu | Dùng bởi |
|---|---|---|
| `min_supply_per_zone` | int | Hotspot (điều kiện), Optimizer (ràng buộc zone nguồn) |
| `budget_cap` | float | Optimizer |
| `max_distance` | float (km) | Optimizer |
| `max_supply_move_pct` | float (%) | Optimizer (không rút quá % idle supply của zone nguồn) |
| `cooldown_minutes` | int | Optimizer (loại zone vừa được điều chỉnh) |
| `priority_zones` | list[int] | Optimizer (ưu tiên trước khi hết budget) |
| `deadhead_cost_per_km` | float (VNĐ/km) | Optimizer (tính `estimated_cost` so với `budget_cap`) |
| `avg_vehicle_speed_kmh` | float (km/h) | Optimizer (tính `eta_steps`) **và** Generator/Simulator (chuyển `enroute_supply` → `idle_supply`) **và** Activation Engine (tính ETA cho offer) — dùng chung một giá trị, không mỗi nơi một số |

**Bổ sung v1.1 — nhóm key cho Activation (Khối C):**

| Key | Kiểu | Dùng bởi |
|---|---|---|
| `incentive_budget_cap` | float (VNĐ/plan) | Activation Engine — **trần độc lập với `budget_cap`** (C-09) |
| `incentive_base` | float (VNĐ) | Mức thưởng nền cho 1 offer |
| `incentive_per_km` | float (VNĐ/km) | Phụ cấp theo quãng đường tài xế phải di chuyển tới zone thiếu |
| `incentive_max_per_offer` | float (VNĐ) | Trần thưởng 1 offer — chặn trường hợp zone quá xa đẩy thưởng lên vô lý |
| `activation_radius_km` | float (km) | Bán kính tìm tài xế ứng viên quanh zone thiếu |
| `offer_ttl_minutes` | int | Thời hạn offer; hết hạn tự chuyển `Expired` |
| `max_offers_per_driver_per_hour` | int | Chống spam tài xế (C-08) |
| `overbooking_factor` | float | Gửi dư offer so với số xe cần, vì không phải ai cũng nhận. Số offer = `ceil(gap_remaining × overbooking_factor)` |
| `assumed_accept_rate` | float 0–1 | Tỷ lệ nhận **giả định** dùng để ước lượng trước khi biết kết quả thật; **phải ghi rõ là giả định** ở mọi báo cáo (C-07) |
| `min_idle_before_activation` | int | Không gửi offer cho tài xế ở zone mà rút đi sẽ tạo hotspot mới — dùng chung tinh thần với `min_supply_per_zone` |

---

## 4. ĐẶC TẢ DỮ LIỆU (DATA CONTRACTS)

> Quy ước chốt: `zone_id` là **int 1–30** (theo feature_dictionary, quyết định đã chốt); có bảng ánh xạ `zone_id → zone_name, zone_lat, zone_lng` riêng (zone registry), không lặp trong từng message. 1 loại xe duy nhất → mọi số lượng là "units", không có `unit_type`.

### 4.1. Snapshot (Replay Engine → toàn pipeline)

```json
{
  "t": "2026-08-02T17:05:00+07:00",
  "zones": [
    {
      "zone_id": 7,
      "demand_observed": 42,
      "idle_supply": 18,
      "enroute_supply": 6,
      "enroute_arrivals": [
        {"arrival_ts": "2026-08-02T17:15:00+07:00", "eta_steps": 2, "units": 4, "source": "relocation", "from_zone": 12},
        {"arrival_ts": "2026-08-02T17:20:00+07:00", "eta_steps": 3, "units": 2, "source": "activation",  "from_zone": 9}
      ],
      "price_index": 1.1,
      "rain_mm_h": 8.2,
      "rain_forecast_15": 10.5,
      "rain_forecast_30": 6.0,
      "peak_flag": 1,
      "holiday_flag": 0
    }
  ]
}
```

| Field | Kiểu | Mô tả |
|---|---|---|
| `t` | ISO datetime | Mốc snapshot (bước 5 phút, `ts_bucket`) |
| `zone_id` | int (1–30) | Cố định 30 zone |
| `demand_observed` | int | Số yêu cầu quan sát trong step |
| `idle_supply` | int | Số xe rảnh trong zone |
| `enroute_supply` | int | Số xe đang di chuyển đến zone (do plan trước). **Bằng đúng `Σ enroute_arrivals[].units`** — giữ lại làm số tổng cho UI/feature, không phải nguồn sự thật về thời điểm đến |
| `enroute_arrivals` | list, **mới v1.3** | Lịch đến chi tiết của số xe đang trên đường. Mỗi phần tử: `arrival_ts` (mốc 5 phút xe khả dụng), `eta_steps` (số bước còn lại tính từ `t`), `units`, `source ∈ {relocation, activation}`, `from_zone`. **`source` là field bắt buộc**: acceptance 5.5 đòi tách được đóng góp Khối B với Khối C, và kiểm tra tự động "tổng cung `plan_only` == `no_action`" chỉ chạy được khi phân biệt được hai nguồn. Rỗng `[]` nếu không có xe nào đang đến |
| `price_index` | float | Chỉ số giá (cần xác nhận có dùng làm feature không — mặc định có trong snapshot, model có thể bỏ) |
| `rain_mm_h` | float | Cường độ mưa hiện tại (mm/h) |
| `rain_forecast_15/30` | float | Dự báo mưa 15/30 phút tới — **input ngoại sinh**, không phải output Model 1 |
| `peak_flag` | 0/1 | 1 nếu 7:00–9:00 hoặc 17:00–19:00 |
| `holiday_flag` | 0/1 | Ngày lễ/Tết Việt Nam |

> **Ranh giới dữ liệu đã chốt (đồng bộ Data Contract v1.3):**
> - **A1** chỉ là snapshot thô như bảng trên.
> - **A2** là feature store dẫn xuất từ A1; trong đó các cột lag/rolling như `demand_observed_lag_0..6`, `idle_supply_lag_0..6`, `rain_lag_1..6`, `demand_roll_mean_30`, `supply_roll_std_30` **phải được role Data sinh sẵn**.
> - **A3** là label/target join 1-1 với A2 theo (`zone_id`, `ts_bucket`); AI đọc A2/A3 để train, **không tự làm feature engineering ngoài contract**.
> - **A6** là `config/driver_registry.json` + `data/driver_states/`, dẫn xuất từ A1 cho Khối C.

### 4.2. Forecast Output (Model 1 → Model 2)

```json
{
  "t": "2026-08-02T17:05:00+07:00",
  "horizon_min": 15,
  "forecast_ts": "2026-08-02T17:20:00+07:00",
  "zones": [
    {
      "zone_id": 7,
      "predicted_demand": 55.0,
      "predicted_supply": 14.0,
      "demand_p10": 48.0,
      "demand_p90": 63.0,
      "supply_p10": 9.0,
      "supply_p90": 19.0,
      "confidence": null
    }
  ],
  "model_version": "lgbm_v2_rainpeak",
  "regime": "rain_peak"
}
```

| Field | Kiểu | Mô tả |
|---|---|---|
| `horizon_min` | int | 15 hoặc 30 |
| `forecast_ts` | datetime | t + horizon |
| `predicted_demand` / `predicted_supply` | float | Dự báo điểm (p50) |
| `demand_p10` / `demand_p90` | float | **Bắt buộc** (quyết định PM 2026-08-04) — khoảng tin cậy, dùng cho chế độ thận trọng ở `rain_peak` |
| `supply_p10` / `supply_p90` | float | **Bắt buộc, mới v1.3** — quantile phía cung. Model supply vốn đã bắt buộc train song song với demand (5.2) và A3 đã có `target_supply_15/30`, nên đây là **xuất thêm output của model có sẵn, không phải model mới**. Dùng cho chế độ thận trọng `rain_peak`: thiếu xe nặng nhất xảy ra khi cầu cao *và* cung thấp cùng lúc — dùng `demand_p90` với `predicted_supply` p50 là mới thận trọng có một nửa |
| `confidence` | float 0–1, optional | **Để `null` ở MVP** (quyết định đã chốt #5); bổ sung sau Sprint 6 nếu kịp |
| `model_version` | string | Audit/history |
| `regime` | enum | `normal \| peak \| rain \| rain_peak` — gán bởi hàm regime tagging dùng chung |

### 4.3. Hotspot Output (Model 2 → Model 3 + UI)

```json
{
  "forecast_ts": "2026-08-02T17:20:00+07:00",
  "horizon_min": 15,
  "hotspots": [
    {"zone_id": 7, "is_hotspot": true, "gap": 41.0, "severity_score": 0.75, "idle_supply_current": 4}
  ],
  "surplus_zones": [
    {"zone_id": 12, "surplus": 15.0, "idle_supply_current": 22, "cooldown_until_ts": null}
  ]
}
```

```
gap            = predicted_demand − predicted_supply
is_hotspot     = (predicted_supply < min_supply_per_zone)
                 OR (gap / predicted_demand ≥ 0.3)
severity_score = gap / (predicted_demand + ε)
surplus        = predicted_supply − predicted_demand   (chỉ zone có surplus > 0)
```

- Ở regime `rain_peak` (chế độ thận trọng): dùng `demand_p90` thay `predicted_demand` để tính gap (luôn khả dụng vì p10/p90 là output bắt buộc của Model 1).
  - ⬜ **CẦN CHỐT trước 09/08 (phát sinh từ v1.3):** đã có `supply_p10` thì chế độ thận trọng nên dùng `gap = demand_p90 − supply_p10` cho đối xứng. **Chưa áp dụng trong v1.3** vì đổi công thức này làm đổi tập hotspot dự báo → đổi recall đo được, mà lịch tune ngưỡng hotspot ở W3–W4 đã chốt theo công thức cũ. Field đã sẵn sàng; chỉ cần một quyết định. Lưu ý: **A4 ground-truth không đổi** (tính trên số thực tế, không dùng quantile) nên đây thuần túy là đổi phía dự báo.
- **Hysteresis bắt buộc:** zone chỉ vào/ra danh sách hotspot sau 2–3 step liên tiếp thỏa/không thỏa điều kiện — chống nhấp nháy (flicker) khi replay.

**Hai field trạng thái vận hành (mới v1.3) — do pipeline điền, không phải Model 2 tính:**

| Field | Có ở | Mô tả |
|---|---|---|
| `idle_supply_current` | `hotspots[]` và `surplus_zones[]` | `idle_supply` **thực tế tại `t`** lấy thẳng từ snapshot 4.1 — **không phải** giá trị dự báo. Optimizer bắt buộc cần số này: `max_supply_move_pct × idle_supply nguồn` và ràng buộc `min_supply_per_zone` (5.4) đều áp trên cung hiện có, trong khi `surplus` là **hiệu của hai số dự báo** nên không suy ngược ra được. Ở `hotspots[]` dùng cho điều kiện `min_supply_per_zone` và hiển thị UI |
| `cooldown_until_ts` | `surplus_zones[]` | Mốc zone hết cooldown = `thời điểm zone bị rút xe lần cuối + cooldown_minutes`. `null` nghĩa là không bị khóa. Optimizer **loại** mọi surplus zone có `cooldown_until_ts > t`. Chỉ có ở `surplus_zones` vì cooldown chỉ ràng buộc **zone nguồn** |

> **Ai điền hai field này:** lớp pipeline (Replay Engine) — nó có snapshot `t` và có History để tra `from_zone` của các plan gần nhất. Model 2 chỉ **truyền qua**. Cố ý **không** đưa `cooldown_until_ts` vào snapshot 4.1: snapshot là deliverable A1 do generator sinh, mà generator không được biết gì về plan — nhét vào đó sẽ tạo phụ thuộc ngược Data ← AI.
>
> **Khởi động nguội:** khi replay bắt đầu, chưa có plan nào → `cooldown_until_ts = null` cho toàn bộ 30 zone.

### 4.4. Relocation Plan (Model 3 → Simulator/UI)

```json
{
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "created_at": "2026-08-02T17:06:00+07:00",
  "based_on_forecast": "2026-08-02T17:05:00+07:00_h15",
  "status": "Proposed",
  "moves": [
    {
      "from_zone": 12,
      "to_zone": 7,
      "units_to_move": 8,
      "eta_steps": 2,
      "estimated_distance_km": 4.2,
      "estimated_cost": 126000,
      "deadhead_km": 4.2,
      "before_gap": 41.0,
      "after_gap": 33.0
    }
  ],
  "residual_gap": [
    {"zone_id": 7, "gap_remaining": 12.0, "suggested_activation": 5}
  ],
  "plan_totals": {"total_units": 8, "total_cost": 126000, "total_deadhead_km": 4.2, "budget_cap": 500000},
  "metrics_before": {"unmet_demand": 31, "avg_wait_proxy": 7.2, "est_cancel_rate": 0.18},
  "metrics_after":  {"unmet_demand": 19, "avg_wait_proxy": 4.8, "est_cancel_rate": 0.11},
  "activation": {
    "campaign_id": "ACT-20260802-1706-01",
    "status": "Pending",
    "offers_sent": 8,
    "offers_accepted": 0,
    "units_gained": 0,
    "incentive_committed": 0,
    "incentive_budget_cap": 200000
  },
  "metrics_after_activation": null,
  "explanation_data": {}
}
```

| Field | Ghi chú |
|---|---|
| `plan_id` | UUID — điểm nối xuyên suốt với HITL (Sprint 7) và audit trail (Sprint 8), giữ nguyên qua toàn pipeline |
| `status` | State machine: `Draft → Proposed → Revised → Approved / Rejected` (chốt theo PRD; "edited" trong feature_dictionary ánh xạ thành `Revised`) |
| `units_to_move` | 1 loại xe → chỉ 1 số lượng |
| `estimated_cost`, `deadhead_km` | So với `budget_cap`; deadhead hiển thị rõ trên UI (Business Goal) |
| `eta_steps` | Số bước 5 phút để xe đến zone đích |
| `before_gap` / `after_gap` | Cho mô phỏng trước–sau từng move |
| `residual_gap` | FR-9 (**Must** từ v1.1): phần thiếu còn lại; `suggested_activation` = số xe cần huy động thêm, là **input cho Activation Engine** (5.11) chứ không còn chỉ để hiển thị |
| `activation` | **Mới v1.1** — tóm tắt chiến dịch huy động gắn với plan này. `status ∈ {NotNeeded, Pending, Running, Closed}`. `units_gained` = số tài xế đã bấm Nhận. Chi tiết từng offer nằm ở contract 4.9 |
| `metrics_after_activation` | **Mới v1.1, optional** — cùng schema với `metrics_after`, `null` cho tới khi chiến dịch đóng. Đây là kịch bản `plan_activation` (mục 3.1) |

> **Ghi chú tương thích contract:** `activation` và `metrics_after_activation` là **field optional thêm mới**, không sửa field cũ — đúng nguyên tắc 3.2. Hai field này phải **có mặt trong bản khóa contract cuối W2** (I-08); nếu để sau W2 mới thêm sẽ vi phạm quy tắc đóng băng.

### 4.5. Revision Request (UI → Khối B, vòng revise)

```json
{
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "action": "revise",
  "revised_moves": [
    {"from_zone": 12, "to_zone": 7, "units_to_move": 5, "eta_steps": 2}
  ],
  "note": "Giảm bớt vì Z12 sắp vào giờ tan tầm"
}
```

`action ∈ {revise, approve, reject}`; `note` bắt buộc khi `reject` (PRD: phê duyệt/từ chối kèm ghi chú lý do).

### 4.6. History Record (append-only)

```json
{
  "record_id": "H-000512",
  "snapshot_t": "2026-08-02T17:05:00+07:00",
  "forecast_ref": "2026-08-02T17:05:00+07:00_h15@lgbm_v2_rainpeak",
  "plan": {},
  "explanation_text": "...",
  "decision": "approved | rejected | revised",
  "decided_by": "operator_demo_01",
  "decided_at": "2026-08-02T17:07:12+07:00",
  "note": "...",
  "metrics_before": {},
  "metrics_after": {},
  "metrics_after_activation": {},
  "activation_summary": {
    "campaign_id": "ACT-20260802-1706-01",
    "offers_sent": 8,
    "offers_accepted": 5,
    "offers_declined": 2,
    "offers_expired": 1,
    "units_gained": 5,
    "incentive_paid": 165000,
    "accept_rate": 0.625,
    "accept_rate_source": "simulated_model"
  }
}
```

Bổ sung `decided_by` (PRD FR-7: lưu kèm **người thực hiện**, thời điểm, kết quả mô phỏng). Truy vấn theo `plan_id` hoặc khoảng thời gian.

**Bổ sung v1.1:** `activation_summary` + `metrics_after_activation` (optional, `null` nếu plan không phát sinh chiến dịch huy động). `accept_rate_source ∈ {simulated_model, human_demo, mixed}` — bắt buộc ghi rõ vì con số accept rate từ mô hình giả định **không được trình bày ngang hàng** với số do người thật bấm trong UAT (C-07).

Mỗi **phản hồi tài xế** cũng là một bản ghi History riêng (không gộp) để giữ được thứ tự thời gian và phục vụ đếm lại `accept_rate`:

```json
{
  "record_id": "H-000513",
  "record_type": "driver_response",
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "campaign_id": "ACT-20260802-1706-01",
  "offer_id": "OF-000031",
  "driver_id": "DRV-0142",
  "decision": "accept | decline | expired",
  "decline_reason": null,
  "responded_at": "2026-08-02T17:08:04+07:00",
  "response_latency_sec": 14,
  "source": "human_demo"
}
```

### 4.7. Driver Registry (config tĩnh — `config/driver_registry.json`)

Danh sách tài xế mô phỏng, tương tự `zone_registry.json`. **Không chứa dữ liệu cá nhân thật** — tên là nhãn giả (`Tài xế 042`).

```json
{
  "driver_id": "DRV-0142",
  "display_name": "Tài xế 142",
  "home_zone": 12,
  "current_zone": 12,
  "status": "online_idle",
  "shift_end_ts": "2026-08-02T19:00:00+07:00",
  "is_demo_account": true
}
```

**A6 gồm 2 artifact khác vai trò:**
- `config/driver_registry.json`: danh sách tài xế tĩnh (`driver_id`, `display_name`, `home_zone`, `is_demo_account`, pattern giờ tan ca).
- `data/driver_states/`: trạng thái theo thời gian (`current_zone`, `status`, `minutes_to_shift_end`) cho từng `ts_bucket`.

| Field | Kiểu | Mô tả |
|---|---|---|
| `driver_id` | string | Khóa chính, dạng `DRV-nnnn` |
| `home_zone` | int 1–30 | Zone hoạt động chính — dùng khi tài xế offline (không biết vị trí) |
| `current_zone` | int 1–30 | Zone hiện diện; cập nhật theo replay |
| `status` | enum | `online_idle` (rảnh, ứng viên tốt nhất) \| `online_busy` (đang có khách, **không gửi offer**) \| `offline` (đã nghỉ ca — ứng viên của activation, dùng `home_zone`) |
| `shift_end_ts` | datetime, optional | Mốc dự kiến hết ca — tài xế sắp hết ca có xác suất nhận thấp hơn |
| `is_demo_account` | bool | **Luôn `true` ở MVP** (C-03). Trường này tồn tại để chặn nhầm lẫn khi có dữ liệu thật sau này |

> **Ràng buộc nhất quán (đã chốt theo A6):** với mọi (`ts_bucket`, `zone`), số tài xế trong `driver_states` thỏa `status = online_idle` và `current_zone = zone` phải **bằng đúng** `idle_supply` của snapshot A1 tại cùng thời điểm. Không cộng `online_busy` vào phép khớp này. Đây là điểm dễ lệch nhất giữa generator và bộ A6; bắt buộc có test tự động kiểm tra khớp 100%.

### 4.8. Activation Offer (Activation Engine → Driver App)

```json
{
  "offer_id": "OF-000031",
  "campaign_id": "ACT-20260802-1706-01",
  "plan_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "driver_id": "DRV-0142",
  "driver_status_at_offer": "offline",
  "target_zone": 7,
  "target_zone_name": "Cầu Giấy - Cụm 2",
  "from_zone": 12,
  "distance_km": 4.2,
  "eta_min": 12,
  "incentive_amount": 33000,
  "reason_text": "Zone Cầu Giấy - Cụm 2 dự báo thiếu 12 xe lúc 17:20 do mưa 8mm/h giờ cao điểm.",
  "created_at": "2026-08-02T17:06:30+07:00",
  "expires_at": "2026-08-02T17:16:30+07:00",
  "status": "Sent"
}
```

| Field | Ghi chú |
|---|---|
| `offer_id` | Khóa chính; 1 offer = 1 tài xế × 1 zone đích |
| `campaign_id` | Gom nhóm offer của cùng 1 plan — dùng để đếm accept rate |
| `driver_status_at_offer` | **Mới v1.3**, `∈ {online_idle, offline}` (không bao giờ `online_busy` — nhóm đó không nhận offer). **Đóng băng tại thời điểm phát hành**, không tra lại lúc tài xế bấm Nhận. Đây là field quyết định bước 4 của 4.9: `offline` → cung mới, tổng cung tăng; `online_idle` → dịch chuyển cung, phải trừ zone nguồn. Lý do phải đóng băng: offer sống `offer_ttl_minutes` = 10 phút = **2 step**, trong đó trạng thái tài xế ở `driver_states` đổi được — tra lúc accept sẽ cho kết quả khác lúc phát hành và **phá tính deterministic** (nguyên tắc 3.2 mục 6). Cùng logic đã áp cho `incentive_amount`: đã hiện ra là đã cam kết |
| `incentive_amount` | `min(incentive_base + incentive_per_km × distance_km, incentive_max_per_offer)` — làm tròn 1.000đ |
| `reason_text` | Sinh bởi Explanation Engine **Lớp 1** (template, 5.6) — cùng nguồn số liệu với plan, không để LLM tự viết cho tài xế |
| `expires_at` | `created_at + offer_ttl_minutes` |
| `status` | `Sent → Accepted / Declined / Expired / Cancelled`. `Cancelled` khi Dispatcher hủy chiến dịch hoặc gap đã được bù đủ |

**Ràng buộc phát hành offer:**
- Không gửi cho tài xế `online_busy`.
- Không gửi cho tài xế ở zone mà rút đi làm `idle_supply` xuống dưới `min_idle_before_activation`.
- Không vượt `max_offers_per_driver_per_hour`.
- Tổng `incentive_amount` của các offer đang mở không vượt `incentive_budget_cap` — **tính theo cam kết xấu nhất (tất cả cùng nhận)**, không tính theo kỳ vọng, để không bao giờ bội chi.

### 4.9. Driver Response (Driver App → Khối C)

```json
{
  "offer_id": "OF-000031",
  "driver_id": "DRV-0142",
  "decision": "accept",
  "decline_reason": null,
  "responded_at": "2026-08-02T17:08:04+07:00"
}
```

| Field | Ghi chú |
|---|---|
| `decision` | `accept \| decline` (`expired` do hệ thống tự sinh khi quá `expires_at`, không phải hành động tài xế) |
| `decline_reason` | Optional, **không bắt buộc** (C-08 — không tạo ma sát khi từ chối). Chọn nhanh từ danh sách: `Quá xa \| Sắp hết ca \| Thưởng chưa đủ \| Đang bận \| Khác` |
| `responded_at` | Dùng tính `response_latency_sec` cho KPI ≤20 giây |

**Xử lý sau khi nhận `accept`:**
1. Kiểm tra offer còn hiệu lực (chưa `Expired`/`Cancelled`) — nếu không, trả lỗi hiển thị "Lời mời đã hết hạn", không tính vào metrics.
2. Ghi nhận `incentive_amount` vào `incentive_paid`.
3. Thêm một phần tử vào `enroute_arrivals` của `target_zone` (4.1): `{arrival_ts, eta_steps, units: 1, source: "activation", from_zone}` — `eta_steps` tính bằng `avg_vehicle_speed_kmh`. Cộng dồn `enroute_supply` cho khớp. **Không** cộng thẳng vào `enroute_supply` rồi thôi: mất `source` là mất khả năng tách đóng góp Khối C khỏi Khối B ở bảng 3 kịch bản.
4. Đọc **`driver_status_at_offer`** của offer (4.8 — giá trị đã đóng băng lúc phát hành, **không tra lại `driver_states` tại thời điểm này**): `online_idle` → trừ 1 unit khỏi `idle_supply` zone nguồn; `offline` → **không trừ ở đâu cả**, đây là cung mới thêm vào hệ thống.
5. Gọi `simulate()` → cập nhật `metrics_after_activation` (< 2 giây).

> **Điểm số 4 chính là lý do activation có giá trị riêng so với relocation:** relocation chỉ chuyển cung giữa các zone (tổng không đổi), activation kéo tài xế `offline` trở lại → **tăng tổng cung**. Bảng so sánh 3 kịch bản (3.1) phải tách được hai hiệu ứng này.

---

## 5. ĐẶC TẢ MODULE

### 5.1. Replay Engine & Synthetic Data (FR-1)
**Chức năng:** Sinh/đọc snapshot synthetic theo timeline, phát theo bước 5 phút; hỗ trợ tua tới/lui; UI xem heatmap cung–cầu theo zone.

- Synthetic generator: 30 zone, seed cố định (C-02, reproducibility); **rain injection** theo hệ số research (+0.59% ridership/mm/h; cung giảm giờ cao điểm chiều khi mưa).
- Kho snapshot: Parquet hoặc SQLite; random-access theo index thời gian, không cần streaming thật.
- **Nguồn dữ liệu (chốt tại T0.4, nợ dữ liệu D3): lai — mưa thật, phần còn lại synthetic.**
  - `rain_mm_h` lấy từ **NASA POWER 2025** (`data/external/rain_hanoi_2025.csv`, hourly, quy đổi mm/ngày → mm/h), cắt theo cửa sổ khai ở `config/generator.yaml → rain.source_window`; upsample 1 giờ → 5 phút. Biến thiên không gian giữa 30 zone là **synthetic tất định** từ toạ độ zone (mô hình dải mưa quét qua thành phố), trung bình hệ số trên 30 zone = 1 nên tổng lượng mưa toàn thành phố vẫn đúng bằng chuỗi NASA.
  - `demand_observed`, `idle_supply`, `enroute_supply`, `rain_forecast_15/30`, `peak_flag`, `holiday_flag`, `price_index`: **synthetic 100%**, tham số hóa từ research (Brodeur & Nield; Liu et al.; Kamga & Yazici) — xem lý do quyết định trong [DataBA-Decisions.md](DataBA-Decisions.md#1-nguồn-dữ-liệu).
  - Vì sao dùng mưa thật thay vì sinh mưa: chuỗi mưa synthetic không tái tạo được tương quan thời gian của mưa thật (cụm mưa, thời lượng, phân bố cường độ lệch mạnh), mà đúng những đặc tính đó mới quyết định `rain_peak` xuất hiện bao nhiêu lần và kéo dài bao lâu — tức quyết định chính thước đo thành công của dự án. Không có mưa thật, số sự kiện `rain_peak` trở thành tham số ta tự chọn.
  - Ràng buộc C-02 (reproducibility) **không đổi**: file mưa là input tĩnh nằm trong repo, cùng seed + cùng file → cùng kịch bản 100%. Không gọi API thời tiết lúc chạy (§1.5 vẫn cấm kết nối radar/API thời tiết thật).

**Acceptance:** replay 1 ngày (288 step) < 5 phút toàn pipeline; cùng seed → cùng kịch bản 100%.

### 5.2. Model 1 — Forecasting (Khối A, FR-2)
**Chức năng:** Dự báo `predicted_demand`, `predicted_supply` cho 30 zone tại t+15 và t+30.

**Baseline (bắt buộc, làm trước):** historical average theo `zone × hour × day_of_week` — vừa là mock, vừa là chuẩn so sánh KPI. **Quy trình dựng, quy tắc chống leak, artifact và tiêu chí nghiệm thu: xem 5.14.2.**

**Model chính:** LightGBM (2 model riêng cho horizon 15/30 hoặc multi-output); objective quantile cho p10/p50/p90 — **bắt buộc** (quyết định PM 2026-08-04, không còn là "nếu kịp"). `confidence` vẫn để `null` ở MVP (quyết định đã chốt #5 team Data).

**Feature (chốt theo feature_dictionary + SPEC):**

| Feature | Ghi chú |
|---|---|
| `zone_id` | categorical 1–30 |
| `hour_of_day`, `day_of_week` | derive từ `ts_bucket` — KHÔNG dùng raw timestamp |
| `demand_observed_lag_0..6`, `idle_supply_lag_0..6` | **Lookback N = 6 bước (30 phút)** — tên cột A2 đã chốt theo Data Contract |
| `demand_roll_mean_30`, `demand_roll_std_30`, `supply_roll_mean_30`, `supply_roll_std_30` | Rolling window 30 phút |
| `peak_flag`, `holiday_flag` | |
| `rain_mm_h`, `rain_lag_1..6` | **Bắt buộc có đủ trong A2**; `rain_lag_1..6` là lịch sử mưa 6 bước trước |
| `rain_forecast_15/30` | input ngoại sinh |
| **`rain_x_peak` = `rain_mm_h × peak_flag`** | **Bắt buộc** — feature quyết định cho đúng problem statement |
| **`rain_fc15_x_peak` = `rain_forecast_15 × peak_flag`** | **Bắt buộc** — tương tác cho horizon 15 |
| **`rain_fc30_x_peak` = `rain_forecast_30 × peak_flag`** (mới v1.3) | **Bắt buộc** — horizon 30 trước v1.3 không có feature tương tác nào, tức là model h30 phải tự học tích của hai biến từ hai cột rời. Không có lý do để h15 có mà h30 không |

`price_index` **không dùng làm feature** ở MVP — xem lý do trong [DataBA-Decisions.md](DataBA-Decisions.md#2-price_index). Field vẫn giữ trong snapshot (4.1) cho khả năng mở rộng sau MVP.

- **KHÔNG dùng feature zone lân cận ở MVP** (quyết định đã chốt #2) — giữ khả năng giải thích cho HITL; mở rộng nếu recall không đạt.
- Ranh giới thực thi: role Data giao A2/A3 hoàn chỉnh; role AI bắt đầu từ việc đọc Parquet và train, **không tự bù cột lag/rolling còn thiếu**.
- Model supply **bắt buộc** dự báo song song với demand (cung giảm đồng thời khi mưa giờ cao điểm — không được bỏ).
- Backtest: **walk-forward** theo thời gian (train N tuần → test 1 tuần, trượt), không shuffle.
- Regime tagging: một hàm gán nhãn `normal/peak/rain/rain_peak` dùng chung cho forecasting, hotspot, explanation.

**Acceptance Criteria:**
- MAPE tổng thể < 15%; ở `rain_peak` thắng baseline ≥ 20% relative (MAE/MAPE).
- Inference 30 zone/horizon < 1 giây.
- Báo cáo ablation: có/không nhóm feature mưa và 3 feature tương tác `rain_x_peak` / `rain_fc15_x_peak` / `rain_fc30_x_peak`.
- Bảng metric tách 4 regime.
- `demand_p10`/`demand_p90` **và `supply_p10`/`supply_p90`** (v1.3) **không được `null`** trong output cuối cùng; kiểm tra calibration cơ bản (coverage p10–p90 xấp xỉ 80% trên test set) — **đo riêng cho cả hai phía cầu và cung**, vì chế độ thận trọng `rain_peak` dựa vào chính hai khoảng này.

### 5.3. Model 2 — Hotspot Detection (Khối B, FR-2)
**Chức năng:** Xác định hotspot (thiếu cung) và surplus zone, xếp hạng theo `severity_score`.

- Công thức và output: theo contract 4.3 (điều kiện policy `min_supply_per_zone` OR thiếu hụt tương đối ≥30%).
- Hysteresis 2–3 step (mục 4.3).
- Cảnh báo hotspot hiển thị trên UI, xếp hạng theo severity.

**Acceptance Criteria:**
- **Hotspot recall ≥ 80%** trên test set deterministic (ground truth = shortage thực tế xảy ra trong replay).
- Replay 1 ngày synthetic: hotspot xuất hiện đúng kịch bản mưa đã inject, không flicker giữa các step.

### 5.4. Model 3 — Relocation Optimizer (Khối B, FR-3)
**Chức năng:** Sinh relocation plan zone-to-zone trong ≤5 giây, tuân thủ policy.yaml.

**Thuật toán chính (quyết định đã chốt #4): Greedy theo severity**
```
sort hotspots theo severity_score giảm dần (priority_zones của policy xếp trước)
với mỗi hotspot:
    ứng viên nguồn = surplus_zones có cooldown_until_ts là null HOẶC ≤ t     (4.3)
    tìm ứng viên gần nhất trong max_distance (ưu tiên eta ≤ 3 step)
    units = min(gap,
                surplus,                                                     (4.3)
                max_supply_move_pct × idle_supply_current,                    (4.3)
                idle_supply_current − min_supply_per_zone)
    trừ dần budget_cap theo estimated_cost; dừng khi hết budget
```

> **v1.3 — hai ràng buộc trước đây không có dữ liệu để kiểm:** `max_supply_move_pct` và `min_supply_per_zone` áp trên **cung hiện có** của zone nguồn, không phải trên `surplus` (vốn là hiệu của hai số **dự báo**) — nên cần `idle_supply_current` (4.3). Ràng buộc `cooldown_minutes` cần `cooldown_until_ts` (4.3); trước v1.3 không field nào lưu trạng thái này nên ràng buộc chỉ tồn tại trên giấy.

**Nâng cấp có điều kiện (nếu Sprint 5 dư thời gian):** min-cost flow (`scipy.sparse.csgraph` / OR-Tools) — nguồn = surplus zone (capacity ≤ `max_supply_move_pct` × idle_supply), đích = hotspot (demand = gap), cost = travel time. Greedy giữ làm fallback bắt buộc khi optimizer lỗi hoặc vượt thời gian (FR-8).

**Travel time & chi phí:**
- Khoảng cách tính **on-the-fly bằng haversine** từ `zone_lat/lng` trong `zone_registry.json`; travel time = khoảng cách ÷ `avg_vehicle_speed_kmh` (policy.yaml). **Không precompute ma trận 30×30 thành file riêng** — quyết định Data/BA 2026-08-04: 30 zone chỉ có tối đa 435 cặp, haversine là phép toán rẻ; tránh phải đồng bộ 2 nguồn dữ liệu (matrix + lat/lng) dễ lệch nhau.
- **Nhân hệ số 1.3–1.5 khi `rain_mm_h` vượt ngưỡng** (mô phỏng kẹt xe khi mưa).
- `eta_steps = ceil(travel_time / 5 phút)`, tối thiểu 1 step.
- `estimated_cost` gồm chi phí deadhead (`deadhead_cost_per_km` × `deadhead_km`) — hiển thị rõ cho từng move.

**Ràng buộc bổ sung:**
- Xe điều đi chỉ tính vào supply zone đích sau `eta_steps`.
- Không rút xe khiến zone nguồn tự trở thành hotspot mới.
- Phần gap không phủ được → ghi vào `residual_gap` + activation gợi ý mức tổng hợp (FR-9, Should).

**Acceptance Criteria:**
- p95 thời gian tạo plan ≤ 5 giây (benchmark từ Sprint 5).
- Kịch bản demo mưa: plan phủ ≥ 60% tổng gap các hotspot; không tạo hotspot mới tại zone nguồn; không vượt `budget_cap`/`max_distance`.

### 5.5. Simulator Before/After (FR-4)
**Chức năng:** Áp plan vào timeline **deterministic**, tính lại metric so với counterfactual no-action.

- Áp `moves` theo đúng `eta_steps`; demand giữ nguyên theo kịch bản replay (không giả lập phản hồi cầu).
- **Xe đang trên đường đọc từ `enroute_arrivals` (4.1, v1.3), không từ `enroute_supply`:** mỗi phần tử chuyển thành `idle_supply` của zone đích đúng tại `arrival_ts`. Với số vô hướng thì hai move đến ở step khác nhau bị gộp làm một và không unit nào có thời điểm chín xác định. Kiểm tra bất biến mỗi step: `enroute_supply == Σ enroute_arrivals[].units`.
- Công thức metric (tham số cụ thể — xem lý do trong [DataBA-Decisions.md](DataBA-Decisions.md#3-công-thức-avg_wait_proxy--est_cancel_rate); tất cả là **giả định hiệu chỉnh thô**, không học từ dữ liệu thật, C-07):
  - `unmet_demand = Σ_zone max(0, demand − supply)`
  - `ratio = demand / max(supply, 1)`
  - `avg_wait_proxy (phút) = 3.0 × ratio^1.5` — 3.0 phút là baseline wait khi cung=cầu (ratio=1); số mũ 1.5 làm wait tăng nhanh hơn tuyến tính khi mất cân bằng
  - `est_cancel_rate = 1 / (1 + e^(−0.4 × (avg_wait_proxy − 8.0)))` — logistic, điểm uốn 50% tại wait = 8 phút
- Chạy song song **3 timeline** (v1.1): `no_action` / `plan_only` / `plan_activation` → bảng so sánh chứng minh **giảm unmet demand ≥ 20%** (plan_only vs no_action) và **giảm residual gap ≥ 30%** (plan_activation vs plan_only).
- `simulate(plan_modified)` phục vụ vòng revise: trả kết quả **< 2 giây**.
- **Áp phản hồi tài xế (v1.1):** mỗi `accept` thêm một phần tử `enroute_arrivals` với `source: "activation"` vào zone đích theo đúng quy tắc 4.9. Tài xế từ `offline` là **cung mới** (tổng cung tăng); tài xế từ `online_idle` là **dịch chuyển cung** (tổng cung không đổi) — Simulator phải phân biệt hai trường hợp, nếu không sẽ **thổi phồng** hiệu quả của activation. **Căn cứ phân biệt là `driver_status_at_offer` trong offer (4.8, v1.3)** — đọc field đã đóng băng, tuyệt đối không tra `driver_states` tại thời điểm accept.
- `simulate()` nhận tham số `include_activation: bool` để tính bất kỳ kịch bản nào trong 3 kịch bản mà không cần code riêng.
- **Lõi metric dùng chung (bắt buộc):** 4 công thức trên nằm ở `src/simulation/metrics.py` — module được viết trước ở W2 để dựng baseline no-action khi Simulator chưa có (lý do và cách tách: 5.14.1). `simulator.py` **import** `metrics.py`, **cấm** cài lại công thức lần thứ hai.
- **Kịch bản `no_action` chính là baseline đã khóa cuối W2**, không tính lại theo cách khác: `simulate(moves=[], include_activation=false)` phải khớp đúng số trong `data/baseline/no_action_summary.json`.

**Acceptance:** demo "có agent vs không agent" trên cùng kịch bản cho chênh lệch `unmet_demand`, `avg_wait_proxy` quan sát rõ; kết quả lặp lại 100% cùng seed. **Test hồi quy bắt buộc trong CI: kịch bản `no_action` khớp baseline đã khóa (5.14.1).** Bảng 3 kịch bản tách được đóng góp của Khối B và Khối C; tổng cung ở kịch bản `plan_only` **phải bằng** `no_action` (kiểm tra tự động — nếu lệch tức là relocation đang tự sinh xe).

### 5.6. Explanation Engine (FR-5)
**Chức năng:** Diễn giải plan/hotspot bằng tiếng Việt theo **explanation contract**: lý do, chi phí, rủi ro, cảnh báo, độ tin cậy.

- **Lớp 1 (bắt buộc, luôn chạy):** template từ `explanation_data` — ví dụ: *"Dự báo mưa {rain_15}mm/h lúc {t15}, zone {name} thiếu {gap} xe. Đề xuất điều {n} xe từ {src} (đến sau {eta} phút, chi phí {cost}đ, chạy rỗng {deadhead}km), giảm unmet demand {delta}%. Cảnh báo: {warnings}."*
- **Lớp 2 (tùy chọn):** LLM diễn đạt lại JSON cho tự nhiên. Prompt **cấm sinh số liệu không có trong input**. Cờ bật/tắt; LLM lỗi/không khả dụng → rơi về Lớp 1 (C-06).
- **Văn bản cho tài xế (v1.1) — chỉ dùng Lớp 1, không dùng LLM:** `reason_text` trong offer (4.8) sinh từ template cố định, tối đa 2 câu, chỉ chứa số liệu có trong `explanation_data`. Lý do: văn bản gửi tới tài xế đi kèm **cam kết tiền thưởng** — một con số sai do LLM là sai lệch tài chính chứ không chỉ là diễn đạt kém. Template tài xế: *"Zone {name} dự báo thiếu {gap} xe lúc {t15} do mưa {rain}mm/h giờ cao điểm. Thưởng {incentive}đ, cách {dist}km (~{eta} phút). Bạn có thể từ chối."*
- Kiểm tra tự động: so khớp mọi con số trong văn bản với `explanation_data` gốc (regex/parse).
- Trường cảnh báo: vi phạm sát ngưỡng budget, zone nguồn gần `min_supply_per_zone`, dữ liệu stale, plan không phủ hết gap.

**Acceptance:** 100% explanation khớp số liệu; tắt LLM bằng 1 flag không ảnh hưởng luồng.

### 5.7. HITL — Revise / Approve / Reject (FR-6)
**Chức năng:** Người vận hành chỉnh sửa số xe/bỏ move, phê duyệt hoặc từ chối kèm ghi chú.

- **State machine:** `Draft → Proposed → Revised → Approved / Rejected`. Mọi chuyển trạng thái ghi History ngay (append-only).
- `revise`: nhận Revision Request (4.5) → **kiểm tra lại ràng buộc policy ngay lập tức** → gọi `simulate()` → trả metrics + explanation mới (< 2 giây).
- `approve`/`reject`: chỉ ghi trạng thái + note, không tính lại; **approved không gửi lệnh xe thật** (C-03).
- UI hỗ trợ ra quyết định trong ≤ 2 phút/plan: hiển thị so sánh before/after, cảnh báo, deadhead, residual gap trên 1 màn hình.

**Bổ sung v1.1 — HITL cho chiến dịch huy động:**
- Khi plan chuyển `Approved` và `residual_gap` khác rỗng, UI hiện khối **"Huy động thêm"**: số xe còn thiếu, số offer sẽ gửi (đã nhân `overbooking_factor`), tổng thưởng cam kết xấu nhất, số tài xế ứng viên tìm được.
- **Người vận hành phải bấm xác nhận riêng** để phát hành offer — approve plan điều chuyển **không tự động** kích hoạt huy động. Lý do: hai quyết định tiêu hai loại ngân sách khác nhau (C-09) và chiến dịch huy động chạm tới tài xế, cần một hành động có chủ đích.
- Trong lúc chiến dịch chạy: UI cập nhật realtime số Nhận/Từ chối/Hết hạn; Dispatcher có nút **Hủy chiến dịch** (mọi offer chưa phản hồi → `Cancelled`).
- Trạng thái chiến dịch **không** đưa vào state machine của plan — plan giữ `Approved`, chiến dịch có vòng đời riêng (`NotNeeded → Pending → Running → Closed`) để không phá contract state machine đã chốt ở mục 10 (#7).

### 5.8. History Store & Audit Trail (FR-7)
**Chức năng:** Lưu vết 100% (snapshot ref, forecast ref, plan, explanation, quyết định, người thực hiện, metrics).

- JSON append-only hoặc SQLite; schema 4.6; **không được ghi đè**.
- Truy vấn theo `plan_id` hoặc khoảng thời gian; UI tra cứu lịch sử phục vụ giải trình (JTBD-04).

### 5.9. Cảnh báo & Fallback (FR-8)

| Tình huống | Hành vi |
|---|---|
| Optimizer không tìm được nghiệm (no-solution) | Cảnh báo UI + trả plan rỗng với residual gap = toàn bộ gap |
| Optimizer vượt 5 giây | Kill → fallback greedy |
| Forecast lỗi | Fallback historical average baseline |
| LLM explanation lỗi/bịa số | Fallback template Lớp 1 |
| Dữ liệu stale (snapshot quá cũ so với đồng hồ replay) | Badge cảnh báo trên UI, chặn tạo plan mới |
| Dependency chưa xong | Mock đúng contract (C-06) |
| **Không tìm được tài xế ứng viên nào (v1.1)** | Chiến dịch `Closed` ngay với `offers_sent = 0`; UI vận hành hiện "Không có tài xế khả dụng trong bán kính {r}km"; `metrics_after_activation = metrics_after` |
| **Hết `incentive_budget_cap` trước khi phủ đủ gap** | Gửi số offer tối đa trong ngân sách theo thứ tự severity zone; cảnh báo rõ "chỉ phủ được {x}/{y} xe do trần thưởng" — **không tự nới ngân sách** |
| **Driver App không kết nối được / tài xế không phản hồi** | Offer hết `offer_ttl_minutes` → `Expired`; tính vào `accept_rate` như một lần không nhận; luồng demo vẫn chạy tiếp, không treo |
| **Không có người thật bấm Nhận/Từ chối khi demo** | Bật **driver response simulator** (5.11) — phản hồi deterministic theo seed; ghi `accept_rate_source = simulated_model`, hiển thị nhãn "mô phỏng" trên UI |
| **Tài xế bấm Nhận sau khi gap đã được bù đủ** | Vẫn ghi nhận `Accepted` và **vẫn trả thưởng** (đã cam kết trong offer); phần dư ghi vào cảnh báo "huy động vượt nhu cầu {n} xe" để đánh giá `overbooking_factor` |
| **Nhiều tài xế nhận cùng lúc vượt số cần** | Chấp nhận theo thứ tự `responded_at`; không hủy ngược offer đã gửi (C-08 — không rút lời hứa đã đưa ra) |

### 5.10. Vận hành Demo (FR-10)
- Công cụ nạp scenario (chọn kịch bản: ngày thường / mưa đột ngột 17:00–19:00 / lễ) và **reset trạng thái nhanh** — bao gồm **xóa hàng đợi offer và reset `driver_registry` về trạng thái đầu** (v1.1).
- Kịch bản demo chính: **"mưa đột ngột giờ cao điểm chiều 17:00–19:00"** — so sánh có/không agent, và có/không huy động tài xế.
- **Kịch bản demo 2 màn hình (v1.1):** màn Dispatcher và màn Driver App chạy song song, cùng một `plan_id` — người xem thấy offer bay từ màn này sang màn kia và metrics đổi ngay sau khi bấm Nhận. Đây là điểm nhấn trình diễn của v1.1.
- Có bản staging + phương án chạy local dự phòng; mục tiêu chạy ổn định 5/5 lần (tính cả luồng activation).

### 5.11. Activation Engine (Khối C, FR-11 — **Must**, mới v1.1)
**Chức năng:** Từ `residual_gap` của plan đã approve, chọn tài xế ứng viên, định mức thưởng, phát hành offer, thu phản hồi, cập nhật supply mô phỏng.

**Thuật toán chọn ứng viên (greedy, cùng tinh thần với Model 3 — baseline-first C-05):**
```
với mỗi zone trong residual_gap, sắp xếp theo gap_remaining giảm dần:
    n_offers = ceil(gap_remaining × overbooking_factor)
    ứng viên = tài xế thỏa TẤT CẢ:
        - status ∈ {online_idle, offline}          (bỏ online_busy)
        - haversine(zone tài xế, target_zone) ≤ activation_radius_km
        - số offer đã nhận trong 1h < max_offers_per_driver_per_hour
        - nếu online_idle: rút đi không làm zone nguồn xuống dưới min_idle_before_activation
    xếp hạng ứng viên: offline trước online_idle (ưu tiên tăng tổng cung),
                       sau đó khoảng cách tăng dần
    lấy n_offers ứng viên đầu; tính incentive_amount từng offer
    ghi driver_status_at_offer = status của ứng viên TẠI THỜI ĐIỂM NÀY   (4.8, v1.3)
    dừng khi tổng cam kết chạm incentive_budget_cap
```

**Ưu tiên `offline` trước `online_idle` là quyết định có chủ đích:** kéo tài xế offline về làm **tăng tổng cung** — thứ mà relocation không làm được; rút tài xế `online_idle` chỉ là một dạng relocation tự nguyện, dễ tạo hotspot mới ở zone nguồn.

**Driver response simulator (bắt buộc — C-06, và cần cho backtest):**
```
p_accept = clip(
    base_rate
    + w_incentive × (incentive_amount / incentive_max_per_offer)
    − w_distance  × (distance_km / activation_radius_km)
    − w_shift_end × is_near_shift_end,
    0.05, 0.95)
```
- Tham số `base_rate`, `w_*` chốt tại [Data-Checklist-Chot-Data.md](Data-Checklist-Chot-Data.md) Phần 8 — **là giả định thô, không học từ dữ liệu thật** (C-07).
- Rút quyết định bằng RNG **có seed cố định** → cùng seed, cùng kịch bản, cùng kết quả (nguyên tắc deterministic 3.2 mục 6).
- Có công tắc: `human` (chờ người thật bấm trên Driver App) / `simulated` / `mixed` (một vài tài khoản để người thật bấm, còn lại mô phỏng — dùng cho demo 2 màn hình).

**Acceptance Criteria:**
- Sinh chiến dịch offer < 2 giây cho 30 zone.
- **Không bao giờ** vượt `incentive_budget_cap` kể cả khi 100% offer được nhận (kiểm bằng test cam kết xấu nhất).
- Không gửi offer cho tài xế `online_busy`; không tạo hotspot mới tại zone nguồn khi rút tài xế `online_idle` (cùng chuẩn với optimizer, 5.4).
- Với accept rate giả định đã chốt, kịch bản demo mưa cho **giảm residual gap ≥ 30%**.
- Cùng seed → cùng tập offer và cùng tập phản hồi mô phỏng, lặp lại 100%.

### 5.12. UI Người vận hành (FR-12a — Must)
Gom các yêu cầu UI vốn nằm rải rác ở 5.1–5.9, làm rõ ranh giới với UI tài xế.

| Màn hình | Nội dung chính |
|---|---|
| Bảng điều khiển | Heatmap cung–cầu 30 zone theo thời gian replay; badge cảnh báo dữ liệu stale; điều khiển tua/replay |
| Chi tiết plan | Danh sách move, deadhead, chi phí vs `budget_cap`, bảng before/after, cảnh báo, explanation; nút Revise/Approve/Reject |
| **Huy động thêm** (mới v1.1) | Residual gap theo zone; số offer dự kiến + tổng thưởng cam kết; nút **Phát hành offer** (xác nhận riêng); bảng theo dõi Nhận/Từ chối/Hết hạn realtime; nút Hủy chiến dịch |
| **So sánh 3 kịch bản** (mới v1.1) | `no_action` / `plan_only` / `plan_activation` cạnh nhau, có nhãn rõ số nào từ accept rate mô phỏng |
| Lịch sử | Tra cứu theo `plan_id`/khoảng thời gian; hiển thị cả phản hồi tài xế của chiến dịch tương ứng |

### 5.13. UI Tài xế — Driver App (FR-12b — **Must**, mới v1.1)
**Chức năng:** Ứng dụng cho tài xế nhận thông báo huy động và phản hồi. Thiết kế **mobile-first**, dùng được bằng một tay, đọc được ngoài trời/khi đang mưa.

| Màn hình | Nội dung |
|---|---|
| **Thông báo huy động** (màn chính) | Một thẻ lớn: tên zone đích, số xe đang thiếu, **mức thưởng (số to nhất màn hình)**, khoảng cách + ETA, đồng hồ đếm ngược tới `expires_at`, 1 câu lý do (`reason_text`). Hai nút: **Nhận** (chính) / **Từ chối** (phụ, 1 chạm, không bắt buộc chọn lý do) |
| Offer đang mở | Danh sách các offer chưa hết hạn nếu tài xế nhận nhiều lúc; sắp xếp theo thời gian hết hạn gần nhất |
| Chuyến đã nhận | Zone đích, ETA, thưởng đã cam kết, trạng thái. **Không** điều hướng turn-by-turn (ngoài phạm vi) |
| Lịch sử của tôi | Các offer đã nhận/từ chối/bỏ lỡ + tổng thưởng — chỉ dữ liệu của chính tài xế đó |
| Trạng thái ca | Công tắc `online_idle / offline` để tài xế tự đặt trạng thái trong demo |

**Nguyên tắc thiết kế bắt buộc (bám C-08):**
1. **Không có gì trên màn hình gây cảm giác bị ép.** Không đếm ngược kiểu hù dọa, không hiển thị "tỷ lệ nhận của bạn", không xếp hạng, không cảnh báo hậu quả khi từ chối. Câu "Bạn có thể từ chối" nằm ngay trong `reason_text`.
2. **Số tiền thưởng phải rõ trước khi bấm Nhận** và không thay đổi sau đó — đã hiện là đã cam kết.
3. **Quyết định trong ≤20 giây:** mọi thông tin cần thiết nằm trên một màn hình, không cuộn, không mở thêm popup.
4. Tài xế chỉ thấy dữ liệu của chính mình — **không** thấy heatmap toàn hệ thống, không thấy plan điều chuyển, không thấy tài xế khác (tránh lộ thông tin vận hành và tránh so bì).
5. Trạng thái rỗng phải tử tế: khi không có offer, hiển thị "Hiện chưa có lời mời nào" — không phải màn hình trắng.

**Kỹ thuật:** cùng codebase/stack với UI vận hành, tách route (`/driver`), phân biệt bằng **tài khoản demo** (chọn `driver_id` từ dropdown ở màn đăng nhập demo — **không làm auth thật**, C-03). Cập nhật offer bằng **polling 2 giây** — đủ đáp ứng KPI "<2 giây hiển thị", không cần WebSocket (giảm rủi ro tiến độ; WebSocket là nâng cấp có điều kiện nếu W5 dư thời gian).

**Acceptance Criteria:**
- Offer xuất hiện trên Driver App < 2 giây sau khi Dispatcher phát hành.
- Bấm Nhận → metrics ở màn Dispatcher cập nhật < 2 giây.
- Bấm Từ chối cần đúng **1 chạm** (không bắt buộc chọn lý do).
- Offer hết hạn tự biến mất khỏi màn chính, chuyển vào lịch sử với nhãn "Đã bỏ lỡ" — không dùng từ mang tính trách móc.
- UAT với ≥3 người đóng vai tài xế: hiểu đúng "đi đâu, thưởng bao nhiêu, được từ chối" mà không cần giải thích; clarity ≥4/5; thời gian quyết định ≤20 giây.
- Chạy được trên màn hình rộng 360px (mobile phổ thông).

### 5.14. Baseline & Đối chứng (FR-14 — **bắt buộc**, khóa cuối W2)

**Mục đích:** con số hệ thống chạy ra không tự nó chứng minh điều gì — *"unmet demand = 240 chuyến"* là tốt hay xấu thì không ai trả lời được nếu thiếu mốc so. Baseline là **nhóm đối chứng**: nó biến số đo thành bằng chứng, và biến kết quả kém thành cảnh báo sớm thay vì bất ngờ ở W5.

Dự án có **hai baseline độc lập, không thay thế nhau** vì chúng bảo vệ hai nửa khác nhau của hệ thống:

| | **Baseline no-action** | **Baseline historical average** |
|---|---|---|
| Trả lời câu chất vấn | *"Không điều xe gì thì sao?"* | *"Chỉ lấy trung bình quá khứ bằng Excel cũng đoán được — LightGBM hơn ở chỗ nào?"* |
| Chứng minh giá trị của | Khối B + Khối C (điều chuyển, huy động, HITL) | Model 1 — phần **AI/ML** của đề tài |
| Là mốc của KPI | Giảm unmet demand **≥20%** (mục 1.7) | Thắng ≥20% relative MAE/MAPE tại `rain_peak` (mục 1.7) |
| Đầu vào | Giá trị **thực tế** trong replay (A1) | Phần **train** của A3 |
| Có dùng Model 1 không | **Không** | Không (chính nó là mock của Model 1) |
| Chủ trì | Data/BA | Data/BA |

> Baseline `historical average` cũng là **mock của Model 1 theo nguyên tắc Mock-first/Baseline-first (3.2 #2, #3)** — làm xong ở W1 thì Khối B có dữ liệu forecast hợp lệ để phát triển song song, không phải chờ LightGBM.

---

#### 5.14.1. Baseline no-action

**Định nghĩa:** kết quả của Simulator khi `moves = []` và `include_activation = false` — tức timeline replay để nguyên, không can thiệp gì. **Không phải một model riêng.**

**Xử lý phụ thuộc ngược về tiến độ (quyết định 2026-08-05 — bắt buộc tuân thủ):**

Baseline phải khóa **cuối W2** (I-08) nhưng Simulator đầy đủ mới có ở **W3 (Sprint 6)**. Gỡ bằng cách tách phần lõi metric ra thành module riêng, làm trước ở W2:

```
src/simulation/metrics.py      ← W2 · công thức metric thuần, ~40 dòng · phục vụ baseline
src/simulation/simulator.py    ← W3 · import metrics.py, bổ sung phần áp moves/eta/activation
```

Với `moves = []` thì **không có** logic áp move, không `eta_steps`, không chuyển `enroute_supply`, **không đọc `policy.yaml`**, không gọi Model 1 — nên baseline chạy được ngay khi có A1 test set, không chờ optimizer hay Simulator. Bắt buộc dùng chung `metrics.py` cho cả hai; **cấm** viết lại công thức lần thứ hai trong `simulator.py` (hai bản sẽ trôi khỏi nhau và mọi so sánh mất hiệu lực).

**Đầu vào:** A1 snapshot của bộ test set deterministic đã khóa (7 ngày, seed test = 2026). Grain: 30 zone × 288 step × 7 ngày.

**Quy ước tính — chốt (trước đây chưa định nghĩa ở mức tổng hợp; cách chọn ảnh hưởng trực tiếp tới con số KPI):**

| # | Vấn đề | Quy ước chốt | Lý do |
|---|---|---|---|
| 1 | Dùng cung nào | `supply = idle_supply`; `enroute_supply` **luôn = 0** | Theo 4.3, enroute chỉ phát sinh từ plan — kịch bản no-action không có plan |
| 2 | `avg_wait_proxy` toàn hệ thống | **Trung bình có trọng số theo `demand`**: `Σ(wait_zt × demand_zt) / Σ demand_zt` | Trung bình cộng làm zone vắng (demand 2) nặng ngang zone đông (demand 45) → bóp méo kết quả |
| 3 | `est_cancel_rate` toàn hệ thống | **Trung bình có trọng số của cancel rate từng zone**, KHÔNG phải logistic của wait trung bình | Logistic là hàm phi tuyến — đưa wait trung bình vào cho ra số khác và **thấp hơn thực tế** |
| 4 | Step có `demand = 0` | Không cần luật riêng — trọng số bằng 0 tự loại | Tránh chia 0 và tránh kéo trung bình xuống giả tạo |
| 5 | Đơn vị báo cáo | `unmet_demand`: **tổng** 7 ngày · `avg_wait_proxy`, `est_cancel_rate`: **trung bình** · tất cả **tách theo 4 regime** (3.2 #4) | KPI ≥20% phải kiểm được riêng ở `rain_peak`, không được giấu trong số tổng |

**Artifact bàn giao:**

| File | Nội dung |
|---|---|
| `data/baseline/no_action_metrics.parquet` | Chi tiết theo `zone × ts_bucket`: `unmet`, `ratio`, `avg_wait_proxy`, `est_cancel_rate`, `regime` |
| `data/baseline/no_action_summary.json` | Bảng tổng hợp theo 4 regime + tổng, theo đúng quy ước #5 |
| `data/baseline/BASELINE_FREEZE.md` | Ngày khóa, người khóa, **commit hash của `metrics.py`**, seed, checksum SHA-256 của 2 file trên |

Thiếu commit hash thì "khóa" là vô nghĩa: sửa công thức về sau sẽ âm thầm làm lệch mọi so sánh mà không ai phát hiện.

**Acceptance Criteria:**
- Chạy lại trên cùng seed → checksum khớp **100%**.
- Bảng kết quả có đủ 4 regime, có ít nhất 2 sự kiện `rain_peak` (theo định nghĩa test set).
- **Test hồi quy để dành cho W3:** khi Simulator đầy đủ hoàn thành, `simulate(moves=[], include_activation=false)` phải trả về **đúng** con số đã khóa. Đây là chốt chặn bảo đảm hai đường code không trôi khỏi nhau — test này phải nằm trong CI từ W3 trở đi.
- Không import `policy.yaml`, không import module forecast (kiểm tra tĩnh) — nếu import được tức là baseline đã bị nhiễm tham số điều chỉnh được.

---

#### 5.14.2. Baseline historical average

**Định nghĩa:** dự báo `target_demand_15/30` và `target_supply_15/30` bằng giá trị trung bình theo tổ hợp `zone × hour_of_day × day_of_week`.

**Quy trình:**
1. Tính bảng tra trung bình **chỉ trên phần train** của A3. Chạm vào ngày test là **leak** — kết quả mất giá trị.
2. Dự báo trên test set bằng cách tra bảng.
3. Tổ hợp không tồn tại trong train → fallback về trung bình `zone × hour`; nếu vẫn thiếu → trung bình toàn zone. **Báo cáo rõ tỷ lệ % phải fallback** — tỷ lệ cao là dấu hiệu bộ train quá mỏng.
4. Chấm MAE/MAPE trên test set, **tách 4 regime × 2 horizon × 2 target**.

**Artifact bàn giao:**

| File | Nội dung |
|---|---|
| `models/baseline_hist_avg.parquet` | Bảng tra `zone × hour × dow` → giá trị trung bình |
| `data/baseline/hist_avg_metrics.json` | MAE/MAPE tách theo 4 regime × 2 horizon × 2 target + tỷ lệ fallback |

**Acceptance Criteria:**
- Test tự động chứng minh bảng tra **chỉ đọc từ split train** (dựa trên `data/splits.yaml`).
- Chạy lại → kết quả khớp 100%.
- Có bảng metric đầy đủ 4 regime — đây là mốc mà LightGBM phải thắng ≥20% relative tại `rain_peak` (5.2).
- Dùng được làm mock forecast đúng contract 4.2 (Mock-first).

---

#### 5.14.3. Quy tắc khóa (áp dụng cho cả hai baseline)

1. **Khóa trước khi biết kết quả của mình** — hạn cuối W2 (I-08). Tính baseline sau khi đã thấy kết quả hệ thống sẽ tạo xu hướng, kể cả vô thức, chọn cách tính làm baseline trông tệ đi (đổi cách trung bình, loại vài ngày "bất thường"). Khi đó hệ thống chỉ đang tự so với chính nó.
2. **Sau khi khóa, mọi thay đổi công thức hay quy ước tính đều là thay đổi contract** — phải ghi vào `BASELINE_FREEZE.md` kèm lý do, và **phải tính lại toàn bộ số liệu so sánh đã công bố**.
3. **Kết quả xấu vẫn phải công bố.** Nếu LightGBM chỉ thắng historical average 5%, đó là phát hiện có giá trị khi biết ở W2 — còn kịp đổi hướng (thêm feature mưa, đổi target, hoặc dồn nguồn lực sang Khối B/C). Giấu tới W5 thì hết đường xử lý. Ràng buộc này là hệ quả trực tiếp của C-07 (trung thực KPI).

---

## 6. YÊU CẦU PHI CHỨC NĂNG (NFR)

| Nhóm | Yêu cầu |
|---|---|
| Hiệu năng | Plan p95 ≤ 5s; inference forecast < 1s/30 zone/horizon; re-simulate < 2s; replay 1 ngày (288 step) < 5 phút; quyết định người vận hành ≤ 2 phút/plan; **sinh chiến dịch offer < 2s; offer hiển thị trên Driver App < 2s; phản hồi tài xế → metrics cập nhật < 2s** |
| Độ tin cậy demo | End-to-end ổn định 5/5 lần **trên cả 2 màn hình (Dispatcher + Driver App)**; staging + local fallback |
| Khả năng kiểm thử | Test set deterministic khóa trước khi chốt KPI (cuối W2); **cả 2 baseline khóa kèm commit hash + checksum, có test hồi quy trong CI (5.14)**; **driver response simulator có seed để backtest activation lặp lại được** |
| Tái lập | Seed cố định cho synthetic **và cho driver response simulator**; mọi run gắn `model_version` |
| Minh bạch & giải trình | Mọi đề xuất kèm lý do/cảnh báo/độ tin cậy; 100% quyết định có audit trail, không ghi đè; **mọi offer + phản hồi tài xế đều lưu, kể cả offer hết hạn** |
| **Tính tự nguyện (mới v1.1)** | **Tài xế từ chối bằng 1 chạm, không lý do bắt buộc, không hậu quả (C-08). Không có màn hình nào của Driver App tạo áp lực hoặc so sánh giữa các tài xế** |
| **Riêng tư (mới v1.1)** | **Tài xế chỉ thấy dữ liệu của chính mình. `driver_registry` không chứa dữ liệu cá nhân thật — toàn bộ là tài khoản demo (`is_demo_account = true`)** |
| **Khả dụng mobile (mới v1.1)** | **Driver App dùng được một tay trên màn hình ≥360px; nút Nhận/Từ chối đủ lớn để bấm khi đang di chuyển** |
| Giới hạn kỹ thuật | Baseline-first (C-05); **không dùng LangGraph** — orchestration Khối B **và Khối C** code thuần (quyết định PM 2026-08-04); không vector DB; **không WebSocket ở MVP** — polling 2s (nâng cấp có điều kiện) |
| Trung thực KPI | Mọi chỉ số business là simulation proxy trên synthetic data (C-07); **mọi số liệu activation phải ghi rõ `accept_rate_source`, không trộn số mô phỏng với số người thật bấm**; **baseline khóa trước khi biết kết quả, kết quả xấu vẫn phải công bố (5.14.3)** |
| Contract | Sau Tuần 2 chỉ thêm field optional, không sửa field cũ — **contract 4.7–4.9 phải nằm trong bản khóa cuối W2** |

---

## 7. KẾ HOẠCH THỰC HIỆN (6 TUẦN · 11 SPRINT · 27/07 – 31/08/2026)

> Hợp nhất: timeline 6 tuần/11 sprint của PRD là chuẩn; kế hoạch 5 tuần của SPEC cũ ánh xạ vào W1–W5, demo ổn định cuối W5, W6 dành cho đóng gói + đánh giá cuối kỳ.

| Tuần | Sprint | Khối A (Dự báo) | Khối B (Điều phối) + UI vận hành | **Khối C (Huy động) + Driver App** | Mốc / Bàn giao |
|---|---|---|---|---|---|
| **W1** (27/07) | S1–S2 | Synthetic generator + rain injection (nguồn: **lai — mưa thật NASA POWER 2025 + phần còn lại synthetic**, chốt lại tại T0.4 ngày 08/08, xem §5.1); feature store; baseline historical average | Chốt contract 4.1–4.4 + policy.yaml; mock forecast + mock plan; khung UI heatmap | — (chưa phát sinh ở thời điểm đó) | **M1** Charter; **M2** gặp đối tác (W1–W2); phỏng vấn/expert review xác minh workflow Dispatcher |
| **W2** | S3–S4 | LightGBM demand + supply + **quantile p10/p50/p90 bắt buộc** (Sprint 4), backtest walk-forward, ablation `rain×peak` | Model 2 hotspot (Sprint 4): công thức + hysteresis; khóa test set deterministic; **`metrics.py` (lõi metric) + khóa baseline no-action + `BASELINE_FREEZE.md` (5.14)** | 🔴 **Chốt contract 4.7–4.9 + 10 key policy activation + `driver_registry.json`** — phải kịp mốc khóa contract, không được để sang W3 | **M3** thiết kế giải pháp; **khóa contract + KPI target cuối W2 (I-08) — nay gồm cả contract activation** |
| **W3** | S5–S6 | Tune model + calibration p10/p90 | Model 3 optimizer greedy (Sprint 5, benchmark ≤5s); simulator bản đầu (Sprint 6) — **import `metrics.py` của W2, kèm test hồi quy khớp baseline** | **Activation Engine lõi**: chọn ứng viên + định mức thưởng + phát hành offer (API, chưa có UI); **driver response simulator có seed** | **M4** Demo 1 — bản thử nghiệm chạy được (luồng B; luồng C demo bằng API/log) |
| **W4** | S7–S8 | Freeze model, hỗ trợ tune ngưỡng | Simulator 3 kịch bản + Explanation; HITL revise/approve/reject (Sprint 7); audit trail (Sprint 8) | 🔴 **Driver App màn chính (Nhận/Từ chối) + vòng phản hồi đóng → re-simulate**; khối "Huy động thêm" trên UI vận hành | **M5** xử lý phản hồi Demo 1; **freeze scope cuối W4** |
| **W5** | S9–S10 | Bảng metric 4 regime, báo cáo ablation | Tune ngưỡng theo kịch bản demo; edge case; scenario loader + reset; chạy thử 5/5 | Màn phụ Driver App (offer đang mở, lịch sử); **kịch bản demo 2 màn hình**; **UAT tài xế ≥3 người** | **M6** Demo 2 — **demo ổn định cuối W5**; code freeze giữa W5 (chỉ sửa bug chặn demo) |
| **W6** (–31/08) | S11 | Đánh giá cuối, tài liệu giả định & giới hạn | Đóng gói staging + local fallback; UAT Dispatcher (≥4/5) | Báo cáo activation: accept rate, chi phí thưởng, **ghi rõ đâu là số mô phỏng** | **M7** phiên bản chính thức; **M8** đánh giá cuối kỳ (slide, báo cáo tác động) |

Chi tiết 48 công việc / 28 user story: file "Quản lý công việc — NovaFour.xlsx" — **cần bổ sung user story cho Driver App và Activation Engine (ước tính +8–10 story)**.

### 7.1. Đánh đổi phạm vi để hấp thụ Khối C (bắt buộc đọc)

Bổ sung một actor có UI riêng ở **đầu W2** vào kế hoạch 6 tuần đã kín là thay đổi lớn: thêm 1 module backend, 1 ứng dụng frontend, 3 contract, 10 key policy và 1 vòng UAT mới, trong khi **không thêm người và không lùi ngày demo**. Muốn giữ được mốc M6 cuối W5, phải cắt bớt ở chỗ khác. Đề xuất cắt theo thứ tự sau:

| # | Hạng mục cắt/giảm | Trạng thái mới | Ảnh hưởng |
|---|---|---|---|
| 1 | **Min-cost flow / OR-Tools** (nâng cấp có điều kiện của Model 3) | **Bỏ hẳn khỏi MVP**, không còn là "nếu kịp" | Không ảnh hưởng KPI — greedy đã là phương án chốt và luôn phải là fallback (mục 10 #3) |
| 2 | **Explanation Lớp 2 (LLM)** | Hạ xuống "chỉ làm nếu W5 dư thời gian" | Lớp 1 template đã đủ thỏa acceptance "100% khớp số liệu"; Lớp 2 vốn đã là optional |
| 3 | **WebSocket cho Driver App** | Không làm — dùng polling 2 giây | Vẫn thỏa KPI hiển thị <2s |
| 4 | **Auth thật cho Driver App** | Không làm — chọn `driver_id` từ dropdown demo | Đúng C-03; tiết kiệm đáng kể thời gian W4 |
| 5 | **Màn "Chuyến đã nhận" + "Lịch sử của tôi"** | Đẩy sang W5, cắt được nếu W5 căng | Màn chính (Nhận/Từ chối) là bắt buộc; hai màn này chỉ hỗ trợ |

Nếu đến **giữa W4** vòng phản hồi đóng (accept → supply → re-simulate) chưa chạy được end-to-end, phương án dự phòng là **hạ Driver App xuống chế độ trình diễn**: giữ nguyên UI và luồng offer, nhưng phản hồi chạy hoàn toàn bằng `driver response simulator`, bỏ phần người thật bấm. Khi đó vẫn giữ được kịch bản demo và KPI residual gap, chỉ mất phần UAT tài xế — báo PM để quyết định trước khi freeze scope cuối W4.

---

## 8. RỦI RO & PHƯƠNG ÁN DỰ PHÒNG

| Rủi ro | Dấu hiệu | Phương án |
|---|---|---|
| Chưa xác nhận workflow/threshold thực tế của Dispatcher | Thiếu phỏng vấn W1–W2 | Gắn nhãn hypothesis; 1–2 buổi xác minh/expert review W1–W2 (theo dõi tại [DataBA-Decisions.md](DataBA-Decisions.md)) |
| Synthetic data không đủ realism để thuyết phục evaluator | Phản hồi Demo 1 (M4/W3) chê dữ liệu giả | Bám sát hệ số research khi tham số hóa (Brodeur & Nield; Liu et al.; Kamga & Yazici); nêu rõ nguồn trích dẫn trong slide |
| Quantile p10/p90 bắt buộc làm tăng độ phức tạp/thời gian train Model 1 | Đến giữa W3 chưa có model quantile chạy được | Dùng LightGBM quantile objective (không cần model riêng cho từng percentile); nếu trễ, báo PM để cân nhắc lùi lại "nếu kịp" |
| Model không thắng baseline ở `rain_peak` | Ablation delta < 10% | Kiểm tra rò rỉ/lag feature; tăng sample weight `rain_peak`; dùng p90 demand thận trọng |
| Optimizer không đạt p95 ≤ 5s | Benchmark Sprint 5 vượt ngưỡng | Greedy là mặc định; min-cost flow chỉ là nâng cấp có điều kiện |
| Scope kéo giãn bởi công nghệ nâng cao (RL, STGCN…) | Đề xuất ngoài C-05 | Baseline-first, mock-first; freeze scope cuối W4 |
| LLM explanation bịa số liệu | So khớp số thất bại | Tắt LLM, dùng template Lớp 1 |
| Demo không ổn định 5/5 do dịch vụ ngoài | Lỗi phụ thuộc khi chạy thử | Mọi module có mock/fallback (C-06); local dự phòng |
| Vỡ tích hợp giữa các module | Contract bị sửa sau W2 | Cấm sửa field cũ; chỉ thêm optional |
| KPI bị hiểu nhầm là tác động thực | Báo cáo/slide thiếu chú thích | Ghi rõ "simulation proxy trên synthetic data" ở mọi báo cáo (C-07) |
| **Bổ sung Khối C giữa chừng làm vỡ tiến độ demo W5** | Đến giữa W4 vòng phản hồi đóng chưa chạy end-to-end | Cắt phạm vi theo đúng thứ tự mục 7.1; phương án cuối: hạ Driver App xuống chế độ trình diễn (chỉ dùng response simulator), báo PM trước freeze scope cuối W4 |
| **Contract 4.7–4.9 không kịp mốc khóa cuối W2** | Cuối W2 chưa có `driver_registry.json` + 10 key policy activation | Ưu tiên cao nhất trong W2, trước cả việc code Activation Engine — contract khóa trễ sẽ kéo theo vi phạm nguyên tắc 3.2 và làm vỡ tích hợp W4 |
| **Accept rate giả định bị chất vấn "lấy đâu ra con số này"** | Hội đồng/mentor hỏi nguồn tại M8 | Không tô vẽ: khai báo thẳng là **giả định tham số hóa** (C-07), trình bày dạng **phân tích độ nhạy** (accept rate 30%/50%/70% → residual gap giảm bao nhiêu) thay vì một con số duy nhất |
| **Số liệu mô phỏng bị trộn với số người thật bấm trong UAT** | Bảng kết quả không phân biệt nguồn | Bắt buộc field `accept_rate_source` ở mọi bản ghi (4.6); UI và slide hiển thị nhãn "mô phỏng"/"người thật" tách bạch |
| **Activation bị hiểu nhầm là ép tài xế** | Phản hồi UAT tài xế thấy áp lực; mentor hỏi về đạo đức | C-08 là ràng buộc cứng: từ chối 1 chạm, không lý do bắt buộc, không chấm điểm; nêu rõ nguyên tắc tự nguyện trong slide |
| **Bội chi ngân sách thưởng khi nhiều tài xế cùng nhận** | Tổng `incentive_paid` vượt `incentive_budget_cap` | Chốt ngân sách theo **cam kết xấu nhất** (giả định 100% nhận) chứ không theo kỳ vọng — đã đưa vào acceptance của 5.11 |
| **Giả định "tài xế là đối tác độc lập" làm sai khung diễn giải** | Kết quả phỏng vấn M2 trả lời là đối tác, không phải nhân viên | Đây thực ra là **lý do củng cố** cho Khối C: nếu tài xế là đối tác thì "lệnh điều chuyển" không khả thi, và mô hình offer tự nguyện có thưởng chính là phương án đúng — cần cập nhật lại cách diễn giải Khối B tương ứng (xem [DataBA-Decisions.md](DataBA-Decisions.md) mục 6) |

---

## 9. GIẢ ĐỊNH & GIỚI HẠN (đưa vào slide "future work")

**Giả định cần kiểm chứng** (đang theo dõi trong [DataBA-Decisions.md](DataBA-Decisions.md)):
- Doanh nghiệp sở hữu/kiểm soát đội xe đủ để repositioning theo vùng (chưa rõ tài xế là nhân viên hay đối tác).
- Người vận hành theo dõi dashboard/nhiều nguồn nhưng chưa có workflow/thời gian thao tác đo được.
- Một số KPI target là gợi ý — chốt sau khi khóa baseline + test set cuối W2.
- **(v1.1) Tài xế phản ứng với incentive theo hướng tăng đơn điệu và trong tầm mức thưởng đặt ra** — chưa có dữ liệu nào của GreenSM xác nhận độ nhạy này.
- **(v1.1) Có một lượng tài xế `offline` đủ lớn ở gần zone thiếu, sẵn sàng quay lại khi mưa** — nếu thực tế tài xế nghỉ vì lý do không thể đảo ngược bằng tiền (hết pin, kẹt xe, mệt), hiệu quả activation sẽ thấp hơn nhiều so với mô phỏng.
- **(v1.1) Tài xế sẵn lòng dùng thêm một app/màn hình** để nhận offer — chưa kiểm chứng.

**Đã chốt:**
- Lịch W1 bắt đầu **27/07/2026** (quyết định PM 2026-08-04, theo header Brief) — nếu chương trình thực tế lệch, cần dịch toàn bộ deadline tương ứng.

**Giới hạn MVP:**
- `avg_wait_proxy`, `est_cancel_rate` là hàm hiệu chỉnh thô, tham số giả định — không học từ hành vi khách thật.
- **(sửa v1.1)** Activation nhắm tới tài xế cụ thể, nhưng **chỉ trong môi trường mô phỏng với tài khoản demo**. Xác suất nhận offer là **hàm giả định có tham số** (5.11), không học từ dữ liệu thật — con số `accept_rate` trong mọi báo cáo phải kèm nhãn nguồn.
- **(v1.1)** Không có thanh toán thưởng thật, không push notification thật, không auth thật, không GPS thật. `incentive_paid` chỉ là con số kế toán trong mô phỏng.
- **(v1.1)** Mô hình phản hồi tài xế không tính tới: hiệu ứng học/chán khi nhận quá nhiều offer, ảnh hưởng của lịch sử thưởng trước đó, cạnh tranh giữa các tài xế, hay quyết định theo nhóm.
- **(v1.1)** Driver App không có điều hướng, không theo dõi vị trí thực — sau khi tài xế bấm Nhận, hệ thống **giả định** họ tới nơi sau `eta_steps`; không mô hình hóa việc nhận rồi không đi.
- Dữ liệu mưa là input ngoại sinh trong snapshot (giả lập nowcasting), chưa nối radar/API thời tiết.
- 30 zone cố định, 1 loại xe; không zone động.
- Roadmap dài hạn (ngoài MVP): ST-GNN có weather cross-attention (hướng WGNN), pipeline nowcasting→demand 2 tầng, kết nối radar VNMHA/Himawari, RL cho dispatch, **học xác suất nhận offer từ dữ liệu thật và tối ưu mức thưởng theo từng tài xế**.

---

## 10. BẢNG ĐỐI CHIẾU MÂU THUẪN GIỮA 3 TÀI LIỆU NGUỒN — PHƯƠNG ÁN CHỐT

| # | Chủ đề | SPEC cũ | Feature Dictionary | PRD | **Chốt** |
|---|---|---|---|---|---|
| 1 | Timeline | 5 tuần | 6 tuần (Sprint 3–8) | 6 tuần, 11 sprint, demo cuối W5 | **6 tuần/11 sprint theo PRD**; kế hoạch 5 tuần của SPEC ánh xạ vào W1–W5 |
| 2 | Kiểu `zone_id` | string "Z07" | int 1–30 (đã chốt) | — | **int 1–30**; tên/tọa độ zone tách vào zone registry |
| 3 | Thuật toán optimizer | Min-cost flow chính, greedy fallback | Greedy theo severity (đã chốt) | Rule/heuristic + OR-Tools | **Greedy chính** (đảm bảo ≤5s + giải thích được); min-cost flow/OR-Tools là nâng cấp có điều kiện, greedy luôn là fallback |
| 4 | Công thức hotspot | top-k(5) + gap≥5 + gap/demand≥30% + hysteresis | `supply < min_supply_per_zone` OR `gap/demand ≥ 0.3` (đã chốt) | Ngưỡng đã kiểm thử + ưu tiên | **Công thức feature_dictionary** (dùng policy.yaml nhất quán) + **hysteresis từ SPEC** + xếp hạng severity |
| 5 | Uncertainty forecast | p10/p90 bắt buộc (quantile loss) | `confidence` để null ở MVP (đã chốt) | — | **p10/p90 bắt buộc** (quyết định PM 2026-08-04, ngả theo SPEC gốc) — dùng cho tính gap ở `rain_peak`; `confidence = null` ở MVP (giữ nguyên) |
| 6 | Lookback window | lag 5–60 phút + rolling 30–60' | N = 6 bước = 30 phút (đã chốt) | — | **N = 6 bước (30')**; lag 60' của SPEC bỏ khỏi MVP, thêm lại nếu MAPE không đạt |
| 7 | State machine | approved/rejected/revised | proposed/approved/edited/rejected | Draft→Proposed→Revised→Approved/Rejected | **Theo PRD**; "edited" ≡ `Revised` |
| 8 | Plan time budget | (không nêu, chỉ revise <2s) | ≤ 5 giây | p95 ≤ 5 giây | **p95 ≤ 5s cho plan**, < 2s cho re-simulate |
| 9 | Incentive/activation | Gợi ý `online_call` trong plan (có `target_drivers`) | — | FR-9 Should, mức tổng hợp, không nhắm cá nhân | ~~Should — mức tổng hợp~~ → **ĐÃ SỬA v1.1: Must, nhắm tới tài xế cụ thể** qua Activation Engine (5.11) + Driver App (5.13), chỉ trong môi trường mô phỏng với tài khoản demo. Hóa ra SPEC gốc (`target_drivers`) gần với hướng chốt cuối hơn là PRD |
| 10 | Ngưỡng plan coverage | Phủ ≥60% gap | — | Giảm unmet demand ≥20% vs no-action | **Cả hai**: coverage ≥60% là acceptance nội bộ của optimizer; ≥20% unmet demand là KPI chính thức |
| 11 | Ngày bắt đầu W1 | — | — | Brief: 27/07; Phụ lục: 03/08 | **27/07/2026** (theo header PRD, PM xác nhận 2026-08-04); nếu lịch chương trình khác → dịch toàn bộ deadline |

---

## 11. QUYẾT ĐỊNH PM XÁC NHẬN (2026-08-04)

Các mục sau là quyết định phạm vi/kiến trúc do PM (Nguyễn Thành Duy) trực tiếp chốt, đã cập nhật vào các mục tương ứng ở trên:

| # | Vấn đề | Quyết định | Lý do |
|---|---|---|---|
| 1 | Ngày bắt đầu W1 (mục 1.6, 7, 9) | **27/07/2026** | Theo header Brief; giữ nguyên toàn bộ timeline đã tính ở mục 7 |
| 2 | p10/p90 quantile forecast — Model 1 (mục 4.2, 4.3, 5.2) | **Bắt buộc phải có**, không còn là "nếu kịp" | Cần cho chế độ thận trọng ở `rain_peak`; chấp nhận rủi ro tiến độ (mục 8) đổi lại độ tin cậy cao hơn cho quyết định hotspot |
| 3 | Min-cost flow/OR-Tools — Model 3 (mục 5.4) | **Giữ nguyên**: nâng cấp có điều kiện, Greedy là mặc định bắt buộc | An toàn tiến độ p95 ≤5s; Greedy luôn là fallback theo feature_dictionary |
| 4 | LangGraph orchestration — Khối B (mục 6) | **Không dùng** — code thuần | Giảm dependency, dễ debug, phù hợp quy mô MVP |

Các mục còn lại cần chuyên môn Data/BA (nguồn dữ liệu, feature `price_index`, công thức simulator, xác minh giả định nghiệp vụ với GreenSM) được Claude phụ trách chốt/đề xuất tại file riêng: **[DataBA-Decisions.md](DataBA-Decisions.md)**.

---

## 12. QUYẾT ĐỊNH NHÓM (2026-08-04) — BỔ SUNG UI TÀI XẾ

Sau thảo luận nhóm, phạm vi mở rộng từ **1 actor có UI** (Người vận hành) sang **2 actor có UI** (Người vận hành + Tài xế).

### 12.1. Nội dung quyết định

| # | Vấn đề | Quyết định | Ghi vào mục |
|---|---|---|---|
| 1 | Tài xế có UI riêng không? | **Có — Driver App, actor chính thứ 2, mức Must** | 1.3, 5.13 |
| 2 | Driver App làm gì? | **Nhận thông báo incentive/huy động** + phản hồi Nhận/Từ chối. **Không** hiển thị heatmap toàn hệ thống, **không** nhận lệnh điều chuyển cá nhân | 5.13 |
| 3 | Phản hồi tài xế có quay ngược vào hệ thống không? | **Có — cập nhật supply mô phỏng**: accept → `enroute_supply` → re-simulate → `metrics_after_activation` | 4.9, 5.5, 5.11 |
| 4 | FR-9 (activation) | Nâng từ **Should → Must**, từ "mức tổng hợp" → **nhắm tài xế cụ thể** (trong mô phỏng) | 1.5, mục 10 #9 |
| 5 | Ngân sách thưởng | **Tách riêng** khỏi `budget_cap` điều chuyển, hai trần độc lập | C-09, 3.3 |
| 6 | Tính tự nguyện | **Ràng buộc cứng C-08** — từ chối 1 chạm, không lý do bắt buộc, không chấm điểm, không chế tài | C-08, 5.13 |

### 12.2. Tác động — cần xử lý ngay

| Việc | Hạn | Ai | Vì sao gấp |
|---|---|---|---|
| Chốt contract 4.7–4.9 + 10 key policy activation + `driver_registry.json` | **Cuối W2** cùng mốc I-08 | Data/BA + AI | Sau W2 contract đóng băng — thêm sau là vi phạm nguyên tắc 3.2 |
| Chốt tham số `driver response simulator` (Phần 8 checklist) | **Cuối W2** | Data/BA | Không có tham số thì không backtest được activation, không đo được KPI residual gap |
| Bổ sung 8–10 user story vào "Quản lý công việc — NovaFour.xlsx" | W2 | PM | Khối lượng W3–W5 hiện chưa phản ánh Khối C |
| Quyết định cắt phạm vi theo mục 7.1 | **Trước khi bắt đầu W3** | PM | Không cắt thì không đủ thời gian cho Khối C mà vẫn giữ demo W5 |
| Bổ sung câu hỏi UAT/phỏng vấn cho **tài xế** (không chỉ Dispatcher) | W2 khi làm M2 | BA | Toàn bộ giả định về hành vi tài xế hiện chưa được kiểm chứng bởi ai |

### 12.3. Điểm cần PM cân nhắc

Bổ sung này **tăng đáng kể tính thuyết phục của sản phẩm** — nó giải quyết đúng nửa còn lại của problem statement (mưa làm **cung giảm**, không chỉ cầu tăng), thứ mà chỉ điều chuyển xe không xử lý được. Đổi lại:

1. **Tiến độ là rủi ro thật, không phải rủi ro hình thức.** Thêm 1 module + 1 app + 3 contract + 1 vòng UAT vào tuần 2 của kế hoạch 6 tuần, không thêm người. Mục 7.1 đã liệt kê những gì phải cắt — nếu không cắt gì mà vẫn giữ nguyên mọi hạng mục cũ thì mốc M6 cuối W5 nhiều khả năng trượt.
2. **Đây là thời điểm cuối cùng còn sửa contract được.** Hôm nay là đầu W2; contract khóa cuối W2. Nếu quyết định này đến sau W2 thì chi phí cao hơn nhiều.
3. **KPI mới (residual gap ≥30%) phụ thuộc vào một con số giả định.** Khuyến nghị trình bày dạng phân tích độ nhạy (accept rate 30/50/70%) thay vì một con số — vừa trung thực hơn, vừa khó bị chất vấn hơn khi bảo vệ.

---

## 13. QUYẾT ĐỊNH (2026-08-05) — ĐẶC TẢ BASELINE & ĐỐI CHỨNG

**Bối cảnh:** hai baseline đã được nhắc rải rác ở mục 1.7, 3.2, 5.2, 5.5 và NFR nhưng **chưa nơi nào nói cách dựng**. Cả hai KPI in đậm của đề tài đều đo bằng chúng, nên thiếu đặc tả là thiếu nền của toàn bộ phần chứng minh kết quả.

**Các quyết định chốt (chi tiết ở mục 5.14):**

| # | Quyết định |
|---|---|
| 1 | Tạo mục **5.14 (FR-14)** đặc tả đầy đủ 2 baseline: mục đích, quy trình dựng, artifact, tiêu chí nghiệm thu |
| 2 | **Tách `src/simulation/metrics.py` làm ở W2**, `simulator.py` (W3) import lại — gỡ phụ thuộc ngược "baseline khóa W2 nhưng Simulator có ở W3" |
| 3 | Chốt **5 quy ước tính ở mức tổng hợp** (trọng số theo demand, cách gộp `est_cancel_rate`, xử lý `demand = 0`, định nghĩa supply, đơn vị báo cáo) — trước đây bỏ ngỏ, mà cách chọn ảnh hưởng trực tiếp tới con số KPI |
| 4 | Khóa baseline kèm **commit hash + checksum SHA-256** trong `data/baseline/BASELINE_FREEZE.md` |
| 5 | Thêm **test hồi quy trong CI**: `simulate(moves=[])` ở W3 phải khớp đúng baseline đã khóa ở W2 |

**Cần hành động:**

| Việc | Hạn | Ai | Vì sao |
|---|---|---|---|
| Viết `metrics.py` + sinh 3 artifact baseline no-action | **Cuối W2** | Data/BA | Là điều kiện của mốc I-08; chặn việc chốt KPI target |
| Đối chiếu 5 quy ước tính (5.14.1) với công thức đã ghi ở [DataBA-Decisions.md](DataBA-Decisions.md) mục 3–4 và bổ sung vào đó | W2 | Data/BA | Hai tài liệu phải khớp, tránh W4 tranh luận lại |
| Bổ sung user story cho FR-14 vào file quản lý công việc | W2 | PM | 48 công việc hiện tại chưa có hạng mục baseline riêng |

**Điểm cần PM biết:** nếu kết quả W2 cho thấy LightGBM chỉ thắng historical average dưới ~10%, đó **không phải thất bại mà là tín hiệu để đổi hướng sớm** — còn 4 tuần để thêm feature mưa, đổi target, hoặc dồn nguồn lực sang Khối B/C. Ràng buộc "kết quả xấu vẫn phải công bố" (5.14.3) tồn tại chính để tín hiệu này không bị phát hiện muộn ở W5.

---

## PHỤ LỤC A — THAM CHIẾU NGHIÊN CỨU

- Brodeur & Nield (2018), *Has Uber Made It Easier to Get a Ride in the Rain?*, JEBO vol. 152 — hệ số tăng cầu khi mưa.
- Liu et al. (2021), Haikou DiDi data — co giãn 0.59%/mm/h dùng cho rain injection.
- Kamga & Yazici, *Hailing in the Rain*, TRB — mô hình giảm cung giờ cao điểm chiều khi mưa.
- ST-MGCN (Geng et al., AAAI 2019); DMVST-Net (Yao et al., AAAI 2018); ST-ResNet (Zhang et al., AAAI 2017) — roadmap dài hạn.
- WGNN (ICSOC 2024) — weather-demand cross-attention cho giai đoạn sau MVP.

## PHỤ LỤC B — LIÊN KẾT TÀI LIỆU DỰ ÁN

- Snapshot schema + Policy: T-006 · User story: US-001…US-025 (file "Quản lý công việc — NovaFour.xlsx") — **cần bổ sung US cho Driver App + Activation Engine**
- Config bắt buộc: `config/policy.yaml` (18 key — 8 gốc + 10 activation), `config/zone_registry.json`, **`config/driver_registry.json` (mới v1.1)**, `config/generator.yaml`
- Feature dictionary chi tiết: [feature_dictionary.md](feature_dictionary.md)
- Spec kỹ thuật gốc: [SPEC-AI-Agent-Phan-Bo-Xe-Gio-Cao-Diem.md](SPEC-AI-Agent-Phan-Bo-Xe-Gio-Cao-Diem.md)
- Brief & PRD: `GSM14_NovaFour_Brief_PRD.docx`
- Checklist Data/BA chưa chốt: [DataBA-Decisions.md](DataBA-Decisions.md)
- Checklist chốt thông số data chi tiết + công việc Data/BA: [Data-Checklist-Chot-Data.md](Data-Checklist-Chot-Data.md)
- Hợp đồng dữ liệu Data ↔ AI (6 bộ dữ liệu A1–A6): [Data-Contract-Data-AI.md](Data-Contract-Data-AI.md)
