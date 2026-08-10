# Prompt thiết kế demo UI — NovaFour theo tinh thần SEA + XanhSM/Green SM

## Prompt

Bạn là senior product designer + frontend engineer. Hãy thiết kế một demo web app cho repo **GSM-14 · NovaFour — Phân bổ xe giờ cao điểm**, dựa trên tinh thần thiết kế của demo SEA/QuantaSlice nhưng phải đúng nghiệp vụ của repo hiện tại.

### Bối cảnh sản phẩm

NovaFour là dashboard mô phỏng điều phối xe điện trong giờ cao điểm mưa tại Hà Nội. Hệ thống dự báo lệch cung-cầu trước 15-30 phút, phát hiện hotspot thiếu xe, đề xuất kế hoạch điều chuyển cho dispatcher duyệt, sau đó nếu vẫn còn residual gap thì phát hành offer thưởng tới tài xế demo. Đây là **pipeline deterministic trên dữ liệu synthetic**, không phải chat agent, không dùng LLM trong luồng chính.

Kịch bản demo chính: **mưa đột ngột lúc 17:30, nhu cầu tăng ở một số quận, xe rảnh nằm lệch ở quận khác**. Demo phải cho người xem thấy rõ vòng lặp:

1. Replay snapshot 5 phút.
2. Forecast demand/supply p10/p50/p90 cho 30 zone.
3. Detect hotspot + surplus source.
4. Sinh relocation plan.
5. Dispatcher duyệt hoặc revise.
6. Nếu còn thiếu xe, phát hành chiến dịch activation.
7. Driver App nhận offer, tài xế bấm Nhận/Từ chối.
8. Metrics cập nhật lại trong bảng 3 kịch bản: `no_action`, `plan_only`, `plan_activation`.

### Tham chiếu thiết kế từ SEA

Giữ tinh thần thiết kế của SEA/QuantaSlice:

- Dashboard kiểu **operational control room**, không phải landing page.
- Bản đồ là trung tâm thị giác; panel metric và plan bám quanh bản đồ.
- Layout dạng modular grid, nhiều đường chia rõ ràng, ít radius, không trang trí thừa.
- Dùng số lớn để tạo nhịp: gap, hotspots, ETA, offer sent, accept rate, unmet demand reduction.
- Slide/demo copy ngắn, dứt khoát, không paragraph dài.
- Tông nền sáng, nhiều khoảng trắng kỹ thuật, typography đậm cho heading và số.
- Cảm giác “live operation” qua simulated clock, trạng thái queue, badges, progress bars.

### Theme XanhSM/Green SM

Thiết kế lấy cảm hứng từ XanhSM/Green SM: xe điện, di chuyển xanh, hiện đại, đáng tin, sạch và nhanh. Không dùng logo thật nếu không được cung cấp. Không copy nguyên nhận diện thương hiệu; chỉ lấy cảm hứng từ palette và mood.

Palette đề xuất:

- Primary electric green: `#00B14F`
- Deep green: `#006B3F`
- Mint surface: `#E8FFF4`
- Cyan accent: `#00C2B8`
- Clean white: `#FFFFFF`
- Ink: `#10231C`
- Muted text: `#5B6F67`
- Divider: `#CFE8DD`
- Warning amber: `#F5A524`
- Critical red: `#E5484D`
- Rain blue: `#2F80ED`

Ưu tiên cảm giác trắng/xanh điện/cyan, tránh UI xanh đậm nặng nề. Dùng green cho hành động chính và trạng thái tốt, red/amber cho hotspot/cảnh báo, blue/cyan cho mưa/forecast/enroute.

Typography:

- Heading: Archivo hoặc một font sans đậm, gọn.
- Body: Inter hoặc Lato.
- Số liệu dùng tabular numerals.
- Không dùng letter spacing âm.

### Màn hình cần thiết kế

#### 1. Dispatcher Dashboard `/`

Màn hình đầu tiên là app thật, không có hero marketing.

Bố cục:

- Top bar: “NovaFour Ops”, scenario dropdown, simulated time `17:30`, replay controls, stale data badge, horizon toggle `15m / 30m`.
- Metric strip 4-6 ô: active hotspots, total gap, available surplus, plan coverage, residual gap, forecast latency.
- Main map: heatmap 30 zone Hà Nội. Zone thiếu xe màu đỏ/amber, zone dư xe xanh, zone ổn định xám nhạt. Circle size theo demand p50, halo theo severity. Có tooltip.
- Right panel: danh sách Priority Hotspots và Surplus Sources, sortable by severity/gap.
- Bottom band: timeline 17:00-19:00, step 5 phút, có vùng mưa peak được tô nền xanh lam nhạt.

Các control phải có:

- Segmented control: Forecast / Hotspot / Plan impact.
- Icon buttons cho step back, play/pause, step forward, reset.
- Toggle “simulation proxy”.
- Button chính: “Generate plan”.

#### 2. Plan Detail `/plan/:planId`

Bố cục:

- Header plan: `PLAN-...`, status Draft/Proposed/Approved, generated at, model version.
- Before/After comparison: unmet demand, avg wait proxy, est cancel rate, total deadhead km, total cost.
- Move table: from zone, to zone, cars, ETA steps, distance, cost, policy warnings.
- Explanation panel tiếng Việt ngắn, số phải khớp metric.
- Action bar cố định dưới: Revise, Reject, Approve.

Ràng buộc UX:

- Approve plan không được tự phát hành offer.
- Cảnh báo rõ nếu no solution hoặc policy violation.
- Không làm UI như chat.

#### 3. Activation `/plan/:planId/activation`

Đây là cổng người thứ hai, tách với approve plan.

Hiển thị:

- Residual gap sau relocation.
- Số offer dự kiến gửi.
- Worst-case incentive committed.
- Candidate drivers found.
- Accept rate source: `simulated_model`, `human_demo`, hoặc `mixed`.
- Nút chính: “Phát hành offer”.
- Sau khi phát hành: counters Sent / Accepted / Declined / Expired / Cancelled.
- Nút “Hủy chiến dịch”.

Copy phải nhấn mạnh đây là tài khoản demo và dữ liệu mô phỏng. Không dùng ngôn ngữ ép buộc tài xế.

#### 4. Scenarios `/plan/:planId/scenarios`

Bảng so sánh 3 kịch bản:

- `no_action`: không điều chuyển.
- `plan_only`: chỉ relocation, tổng cung không đổi.
- `plan_activation`: relocation + tài xế nhận offer.

Mỗi cột có:

- unmet demand
- avg wait proxy
- est cancel rate
- residual gap
- label “simulation proxy”

Thiết kế dạng scorecard ngang, có sparkline nhỏ cho mỗi metric.

#### 5. History `/history`

Audit trail gọn:

- Filter theo plan_id, time range, record type.
- Timeline append-only: plan proposed, revise, approve/reject, campaign issued, driver response.
- Không có nút sửa/xóa history.

#### 6. Driver App `/driver`

Thiết kế như mobile-first app cho tài xế demo.

Luồng:

- Chọn `driver_id` từ dropdown demo, không auth thật.
- Card offer đang mở: zone đích, khoảng cách, ETA, thưởng, lý do, countdown TTL.
- Hai nút lớn: “Nhận” và “Từ chối”.
- Từ chối một chạm, không bắt buộc lý do, không có chấm điểm/ranking/penalty.
- Offer hết hạn tự biến mất nhẹ nhàng.

Tone:

- Thân thiện, tự nguyện, rõ tiền thưởng, rõ quãng đường.
- Không dùng từ “bắt buộc”, “vi phạm”, “điểm tài xế”, “xếp hạng”.

### Interaction demo cần nhìn thấy

Thiết kế demo 2 màn hình song song:

- Bên trái: Dispatcher Dashboard/Activation.
- Bên phải: Driver App dạng mobile frame.
- Khi dispatcher phát hành offer, offer xuất hiện ở Driver App trong dưới 2 giây.
- Khi tài xế bấm “Nhận”, counter Accepted tăng và `plan_activation` cải thiện metric.
- Có trạng thái fallback simulated driver response nếu không có người thật bấm.

### Visual rules

- Không dùng hero marketing, không dùng card lồng card.
- Radius nhỏ: 0-8px.
- Đường chia rõ, grid chắc, table scan nhanh.
- Nền sáng, không gradient tím/xanh đậm, không blob/orb trang trí.
- Dùng icon cho replay/action buttons nếu có lucide icons.
- Các button text không được vỡ dòng xấu trên mobile.
- Mobile phải ưu tiên Driver App; desktop ưu tiên dispatcher control room.
- Tất cả text trong UI là tiếng Việt, trừ contract keys kỹ thuật (`no_action`, `plan_only`, `plan_activation`, `simulated_model`) có thể giữ nguyên.

### Nội dung mẫu

Tên app: **NovaFour Ops**

Scenario: **Mưa giờ cao điểm 17:30**

Các zone ví dụ:

- Cầu Giấy
- Hoàn Kiếm
- Ba Đình
- Đống Đa
- Hai Bà Trưng
- Thanh Xuân
- Nam Từ Liêm
- Hà Đông

Microcopy gợi ý:

- “Thiếu xe dự báo”
- “Nguồn dư khả dụng”
- “Kế hoạch đang chờ duyệt”
- “Phát hành offer là xác nhận riêng”
- “Tài khoản tài xế demo”
- “Số liệu là simulation proxy trên dữ liệu synthetic”
- “Tài xế có thể từ chối một chạm”

### Deliverable mong muốn

Tạo thiết kế demo có thể implement thành Vite + React + TypeScript trong `frontend/`, hoặc prototype HTML/CSS/JS tĩnh nếu cần dựng nhanh. Ưu tiên một trải nghiệm polished, chạy được local, có dữ liệu mock deterministic và thể hiện rõ khác biệt giữa có/không có điều phối.

Kết quả phải gồm:

- Design system tokens.
- Layout desktop + mobile.
- Component list.
- Mock data shape.
- Các màn hình route nêu trên.
- Interaction states: loading, stale data, no solution, offer expired, campaign running, driver accepted/declined.
- Một demo script 2-3 phút để trình bày cho giám khảo.
