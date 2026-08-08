# CHECKLIST QUYẾT ĐỊNH DATA/BA — GSM-14 NovaFour

**Phụ trách chốt:** Claude (theo ủy quyền của PM — Nguyễn Thành Duy, 2026-08-04)
**Mục đích:** Các vấn đề kỹ thuật/dữ liệu còn treo trong [SPEC-GSM14-NovaFour-Unified.md](SPEC-GSM14-NovaFour-Unified.md) mà PM ủy quyền cho việc phân tích desk-based (không cần PM tự chọn phương án). Team Data (Hồ Thanh Bình, Đồng Đại Huy) review lại — nếu không đồng ý điểm nào, sửa trực tiếp trong file này rồi báo lại để đồng bộ vào spec chính.

**Quy ước:** mỗi mục có 3 phần — **Vấn đề**, **Quyết định/Đề xuất**, **Lý do**. Mục nào cần dữ liệu/xác nhận từ bên ngoài (không thể tự chốt trên bàn giấy) được đánh dấu rõ **⚠️ CẦN HÀNH ĐỘNG THẬT** thay vì giả vờ chốt.

**Cập nhật 2026-08-04 (v1.1):** quyết định nhóm bổ sung **UI tài xế (Driver App) + Activation Engine** làm phát sinh 2 mục mới — **mục 7** (mô hình xác suất phản hồi tài xế) và **mục 8** (hành vi tài xế khi mưa, cần hành động thật), đồng thời làm giảm mức nghiêm trọng của **mục 6**.

---

## 1. Nguồn dữ liệu

**Vấn đề:** SPEC gốc để ngỏ 2 phương án — NYC TLC/Didi GAIA + rain injection, hoặc synthetic thuần. Deadline chốt theo kế hoạch ban đầu là cuối ngày 3 tuần 1.

**Quyết định: Synthetic thuần, tham số hóa từ research** (không dùng NYC TLC/Didi GAIA).

**Lý do:**
- C-02 đã xác định rõ: synthetic data, không tích hợp vận hành/người dùng thật — dùng dữ liệu ngoài (NYC/Didi) không giúp đúng hơn cho bài toán Hà Nội, chỉ tốn thời gian làm sạch/ánh xạ định dạng khác biệt (múi giờ, đơn vị zone, không có rain data đồng bộ theo phút).
- Nguyên tắc đánh giá 4 regime (`normal/peak/rain/rain_peak`, mục 3.2 SPEC) đòi hỏi gán nhãn chính xác — với synthetic, ta **kiểm soát hoàn toàn** injection mưa theo đúng hệ số research (Brodeur & Nield +19–22%; Liu et al. 0.59%/mm/h; Kamga & Yazici giảm cung chiều mưa), đảm bảo signal `rain × peak` đủ mạnh để model học được — dữ liệu thật không đảm bảo điều này trong 30 zone Hà Nội giả lập.
- Rủi ro lớn nhất theo bảng rủi ro gốc là "dữ liệu kéo dài quá 3 ngày đầu" — loại bỏ hẳn phương án dữ liệu ngoài giúp loại luôn rủi ro này thay vì chỉ có phương án dự phòng.
- Nhược điểm (đã ghi vào rủi ro mới trong SPEC mục 8): synthetic có thể bị đánh giá là kém thực tế — giảm thiểu bằng cách trích dẫn rõ nguồn hệ số trong slide/báo cáo.

**Việc cần làm (Data team):** xây dựng generator với tham số:
- Baseline demand/supply theo zone × hour × day_of_week (phân phối Poisson hoặc negative binomial, mean/variance tự chọn hợp lý theo quy mô GreenSM giả định).
- Rain injection: nhân hệ số cầu theo `rain_mm_h` (tham chiếu +0.59%/mm/h Liu et al.), giảm hệ số cung tại peak_flag=1 khi rain_mm_h vượt ngưỡng (tham chiếu Kamga & Yazici).
- Seed cố định — cùng seed phải tái tạo đúng 100% kịch bản (yêu cầu NFR reproducibility).

---

## 2. `price_index`

**Vấn đề:** Field có trong snapshot nhưng feature_dictionary không nêu rõ có dùng làm feature dự báo demand hay không ("nếu ảnh hưởng demand, cần xác nhận").

**Quyết định: Không dùng làm feature Model 1 ở MVP.** Giữ field trong snapshot contract cho khả năng mở rộng sau, nhưng loại khỏi bảng feature huấn luyện.

**Lý do:**
- Phạm vi MVP **không có surge pricing** (explicit out-of-scope theo PRD mục 4) — nếu đưa `price_index` vào làm feature dự báo, dễ tạo nhầm lẫn là hệ thống có cơ chế phản hồi giá, trong khi thực tế MVP không mô hình hóa quan hệ giá–cầu.
- Với dữ liệu synthetic, mối quan hệ giá–cầu phải tự giả lập — rủi ro tạo correlation nhân tạo không phản ánh hành vi thật, có thể bị đặt câu hỏi khi bảo vệ đồ án (leak/circular giả).
- Giữ feature set gọn, đúng tinh thần baseline-first (C-05) và giữ khả năng giải thích cho HITL (đã áp dụng cùng logic với quyết định "không dùng feature zone lân cận" của team Data).

**Việc cần làm:** không cần hành động — chỉ cần Data team xác nhận đồng ý khi review.

---

## 3. Công thức `avg_wait_proxy` / `est_cancel_rate`

**Vấn đề:** SPEC gốc chỉ mô tả dạng hàm (`f(ratio)`, `g(avg_wait_proxy)`) mà không có tham số cụ thể — không thể code Simulator nếu không chốt con số.

**Quyết định — công thức cụ thể:**

```
ratio = demand / max(supply, 1)

avg_wait_proxy (phút) = 3.0 × ratio ^ 1.5

est_cancel_rate = 1 / (1 + e^(−0.4 × (avg_wait_proxy − 8.0)))
```

| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| Wait nền (`ratio = 1`, cung=cầu) | 3.0 phút | Thời gian chờ tối thiểu hợp lý khi không thiếu xe |
| Số mũ ratio | 1.5 | Wait tăng nhanh hơn tuyến tính khi mất cân bằng — phản ánh hiệu ứng dồn ứ khi thiếu xe nặng |
| Điểm uốn logistic (50% cancel) | 8.0 phút chờ | Ngưỡng chờ đợi trung bình khách bắt đầu hủy quá nửa |
| Độ dốc logistic | 0.4 | Tốc độ chuyển từ "ít hủy" sang "nhiều hủy" quanh điểm uốn |

**Lý do:** đây là hàm hiệu chỉnh thô theo đúng giới hạn đã công bố (C-07) — không tuyên bố là học từ dữ liệu thật. Chọn dạng power-law cho wait (đơn điệu tăng, lồi — đúng yêu cầu SPEC "hàm đơn điệu tăng") và logistic chuẩn cho cancel rate (bị chặn [0,1], đúng bản chất xác suất). Các hằng số chọn ở mức hợp lý cho ngữ cảnh ride-hailing đô thị (chờ trung bình vài phút, hủy tăng mạnh khi chờ quá ~10 phút) — **không có nguồn thực nghiệm cụ thể, cần nêu rõ là giả định trong slide/báo cáo** đúng yêu cầu C-07.

**⚠️ Khuyến nghị kiểm tra:** sau khi có kết quả demo, vẽ đường cong `avg_wait_proxy` và `est_cancel_rate` theo `ratio` để sanity-check bằng mắt (có hợp lý không, có bị bão hòa quá sớm/quá muộn không) — nếu cần chỉnh, chỉ sửa 4 hằng số trên, không đổi dạng hàm (giữ tương thích ngược với mọi kết quả demo đã chạy).

---

## 4. Baseline no-action & Test set deterministic (khóa cuối W2)

**Vấn đề:** NFR yêu cầu khóa trước cuối W2 nhưng chưa có phương pháp cụ thể.

**Quyết định — phương pháp:**
- **Test set:** chọn cố định N ngày synthetic (đề xuất N=7, đủ 1 tuần) bằng seed neo riêng (khác seed dùng cho train), đảm bảo phủ đủ 4 regime (`normal/peak/rain/rain_peak`) — nếu ngày synthetic ngẫu nhiên không tự nhiên phủ đủ `rain_peak`, ép injection ít nhất 2 sự kiện mưa giờ cao điểm trong tập test.
- **Baseline no-action:** chính là kết quả `simulate()` khi `moves = []` (không áp bất kỳ relocation nào) trên cùng test set — không cần model riêng, tái dùng thẳng Simulator (mục 5.5 SPEC).
- Test set **không được dùng để train** bất kỳ model nào (Model 1 hay optimizer threshold tuning).

**Lý do:** cách này tận dụng lại đúng hạ tầng đã đặc tả (Simulator, Replay Engine), không cần xây thêm module riêng, và đảm bảo baseline "no-action" là fair comparison (cùng dữ liệu, chỉ khác có/không can thiệp) — đúng tinh thần Business Goal của PRD.

**Việc cần làm (Data team):** chốt N=7 hay số khác tùy khối lượng công việc backtest thực tế; sinh test set và đóng băng (freeze) trước cuối W2.

---

## 5. ⚠️ CẦN HÀNH ĐỘNG THẬT — Xác minh workflow Dispatcher

**Vấn đề:** Toàn bộ ngưỡng (`min_supply_per_zone`, `budget_cap`, `max_distance`, thời gian ra quyết định ≤2 phút...) hiện là **hypothesis chưa kiểm chứng** — PRD tự nhận "người vận hành theo dõi dashboard/nhiều nguồn nhưng chưa có workflow/thời gian thao tác đo được".

**Không thể tự chốt** — đây là dữ liệu thực địa, cần phỏng vấn/expert review thật với GreenSM hoặc người có kinh nghiệm vận hành tương tự.

**Đề xuất tạm thời (placeholder) để không block code trong lúc chờ phỏng vấn:** giữ nguyên giá trị `policy.yaml` như đã build (min_supply_per_zone, budget_cap, max_distance...) làm working assumption, gắn nhãn rõ "chưa kiểm chứng" trong mọi tài liệu/slide.

**Việc cần làm (BA — Hồ Thanh Bình):** tổ chức 1–2 buổi phỏng vấn/expert review trong W1–W2 theo đúng kế hoạch PRD (mục M2). Sau phỏng vấn, cập nhật lại `policy.yaml` và mục "Giả định cần kiểm chứng" (mục 9 SPEC chính) — chuyển từ "giả định" sang "đã xác minh" hoặc điều chỉnh số liệu.

---

## 6. ⚠️ CẦN HÀNH ĐỘNG THẬT — Giả định quyền sở hữu đội xe

**Vấn đề:** Giả định "doanh nghiệp sở hữu/kiểm soát đội xe đủ để đề xuất repositioning theo vùng" — chưa rõ tài xế là nhân viên hay đối tác (ảnh hưởng tính khả thi của toàn bộ relocation plan).

**Không thể tự chốt** — cần xác nhận từ đối tác GreenSM hoặc mentor.

**Việc cần làm (PM/BA):** đặt câu hỏi này trong buổi gặp đối tác đầu tiên (M2, W1–W2). Nếu câu trả lời là "tài xế là đối tác độc lập" thay vì nhân viên, cần đánh giá lại tính khả thi của "lệnh điều xe" — có thể phải đổi khung diễn giải plan từ "lệnh điều chuyển" sang "khuyến nghị/incentive mạnh hơn".

**Cập nhật 2026-08-04 (v1.1):** rủi ro này đã **giảm đáng kể** — nhóm chốt bổ sung Driver App + Activation Engine (Khối C, [SPEC mục 12](SPEC-GSM14-NovaFour-Unified.md)), tức là mô hình **offer tự nguyện có thưởng** đã trở thành một phần chính thức của sản phẩm chứ không còn là phương án dự phòng. Nếu câu trả lời là "đối tác độc lập", hệ thống vẫn đứng vững — chỉ cần đổi cách diễn giải Khối B từ "lệnh điều chuyển" sang "đề xuất điều chuyển mà tài xế có thể từ chối", và khi đó Khối C trở thành kênh thực thi chính. Vẫn cần hỏi, vì câu trả lời quyết định **cách trình bày**, không còn quyết định **tính khả thi**.

---

## 7. Mô hình xác suất phản hồi tài xế (mới v1.1)

**Vấn đề:** Quyết định nhóm 2026-08-04 đưa Driver App vào phạm vi, và phản hồi tài xế **quay ngược vào mô phỏng** (cập nhật supply → tính lại metrics). Nghĩa là bắt buộc phải có một hàm xác suất nhận offer — trong khi mục 1.5 SPEC v1.0 từng ghi rõ "**không mô hình hóa hành vi tài xế**". Đây là mâu thuẫn phải xử lý, không thể lờ đi.

**Quyết định: chấp nhận mô hình hóa, nhưng ở mức thấp nhất có thể và khai báo rõ là giả định.**

```
p_accept = clip(base_rate
                + w_incentive × (incentive_amount / incentive_max_per_offer)
                − w_distance  × (distance_km / activation_radius_km)
                − w_shift_end × is_near_shift_end,
                0.05, 0.95)
```

Tham số cụ thể: [Data-Checklist Phần 8B](Data-Checklist-Chot-Data.md).

**Lý do:**
- **Không có lựa chọn nào khác nếu muốn vòng phản hồi đóng.** Muốn đo được "activation giảm bao nhiêu residual gap" thì phải biết bao nhiêu người nhận. Dùng người thật bấm cho toàn bộ backtest là bất khả thi (hàng nghìn offer trên test set 7 ngày).
- **Chọn dạng tuyến tính có clip thay vì logistic hay model học.** Ba lý do: (a) giải thích được cho HITL và cho hội đồng — mỗi hệ số là một câu tiếng Việt; (b) chỉ có 4 tham số nên phân tích độ nhạy dễ trình bày; (c) đúng tinh thần baseline-first (C-05), giống cách đã chọn greedy cho optimizer thay vì min-cost flow.
- **Clip ở [0.05, 0.95]** để không bao giờ có tài xế "chắc chắn nhận" hay "chắc chắn từ chối" — tránh mô phỏng cho ra kết quả đẹp giả tạo.
- **Ranh giới với "không mô hình hóa hành vi tài xế":** cái bị cấm là **học hành vi từ dữ liệu** và **tối ưu theo từng cá nhân**. Cái đang làm là một hàm giả định 4 tham số, cố định, công khai, có phân tích độ nhạy. Cần sửa lại câu chữ ở mục 1.5 và mục 9 SPEC cho khớp — **đã sửa trong v1.1**.

**⚠️ Bắt buộc khi báo cáo:** không bao giờ đưa một con số accept rate duy nhất. Trình bày 3 mức (`base_rate` = 0.25 / 0.45 / 0.65) và nói rõ kết luận thay đổi thế nào. Nếu KPI "giảm residual gap ≥30%" chỉ đạt ở mức lạc quan nhất, phải nói thẳng điều đó.

**Việc cần làm (Data team):** chốt tham số Phần 8B trước cuối W2; chạy phân tích độ nhạy ở W4; nếu phỏng vấn tài xế (Phần 8D) cho số liệu thực tế, cập nhật lại tham số và ghi rõ đã chuyển từ "giả định" sang "có căn cứ phỏng vấn".

---

## 8. ⚠️ CẦN HÀNH ĐỘNG THẬT — Hành vi tài xế khi mưa (mới v1.1)

**Vấn đề:** Toàn bộ Khối C đứng trên 3 giả định chưa ai kiểm chứng:
1. Có đủ tài xế `offline` gần zone thiếu khi mưa giờ cao điểm (nếu không, không có ai để huy động).
2. Tài xế phản ứng với tiền thưởng theo hướng tăng đơn điệu, trong tầm mức thưởng đặt ra.
3. Tài xế đã bấm Nhận thì sẽ tới nơi (MVP không mô hình hóa việc nhận rồi không đi).

Giả định (1) đặc biệt đáng ngờ theo hướng ngược lại với mong muốn: theo chính research nhóm đang dùng (Kamga & Yazici), tài xế nghỉ sớm khi mưa vì **đã đạt mục tiêu thu nhập** — người đã đạt mục tiêu thu nhập là người **khó thuyết phục quay lại nhất**, chứ không phải dễ nhất.

**Không thể tự chốt** — cần hỏi tài xế thật hoặc người từng chạy xe công nghệ.

**Đề xuất tạm thời để không block code:** dùng tham số Phần 8B làm working assumption, gắn nhãn "chưa kiểm chứng" ở mọi tài liệu/slide, và **luôn kèm phân tích độ nhạy**.

**Việc cần làm (BA — Hồ Thanh Bình):** đưa 5 câu hỏi ở [Data-Checklist Phần 8D](Data-Checklist-Chot-Data.md) vào buổi phỏng vấn M2 (W1–W2). Câu 3 ("đang nghỉ rồi, cần thưởng bao nhiêu để quay lại chạy?") là câu quan trọng nhất — nó kiểm chứng trực tiếp giả định (1) và tham số 8.13.

---

## TÓM TẮT TRẠNG THÁI

| # | Mục | Trạng thái |
|---|---|---|
| 1 | Nguồn dữ liệu | ✅ Đã chốt (synthetic thuần) — đã cập nhật vào SPEC chính |
| 2 | `price_index` | ✅ Đã chốt (không dùng làm feature) — đã cập nhật vào SPEC chính |
| 3 | Công thức `avg_wait_proxy`/`est_cancel_rate` | ✅ Đã chốt (tham số cụ thể) — đã cập nhật vào SPEC chính |
| 4 | Baseline no-action + test set | ✅ Đã chốt phương pháp — cần Data team thực thi trước cuối W2 |
| 5 | Xác minh workflow Dispatcher | ⚠️ Chưa chốt — cần phỏng vấn thật W1–W2 |
| 6 | Giả định sở hữu đội xe | ⚠️ Chưa chốt — cần xác nhận với đối tác W1–W2. **Mức nghiêm trọng đã giảm** sau khi có Khối C (v1.1) |
| **7** | **Mô hình xác suất phản hồi tài xế** | ✅ **Đã chốt dạng hàm + lý do** — Data team chốt 7 tham số ở [Checklist Phần 8B](Data-Checklist-Chot-Data.md) trước cuối W2 |
| **8** | **Hành vi tài xế khi mưa (3 giả định nền của Khối C)** | ⚠️ **Chưa chốt — cần hỏi tài xế thật W1–W2** (Phần 8D) |

Mục 1–4 và 7 đã đồng bộ vào [SPEC-GSM14-NovaFour-Unified.md](SPEC-GSM14-NovaFour-Unified.md). Mục 5–6 và 8 vẫn nằm trong "Giả định cần kiểm chứng" (mục 9 SPEC chính) cho tới khi có kết quả phỏng vấn thật.
