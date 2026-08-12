# Checklist công việc Kiểm duyệt viên / Điều hành viên GSM

Cập nhật: 2026-08-09

Trạng thái: **Luồng operator live đã hoạt động — còn giai đoạn hoàn thiện để phát hành**

## 1. Phạm vi và người phụ trách

- [x] Workstream này ưu tiên vai trò `OPERATOR`: kiểm duyệt viên và điều hành viên.
- [x] Supabase DB live là nguồn sự thật cho trạng thái, ràng buộc và vòng đời nghiệp vụ.
- [x] Frontend chỉ thực hiện nghiệp vụ thông qua NestJS API.
- [x] UI tài xế không thuộc phạm vi hoàn thiện chính của workstream này.
- [x] Giữ một luồng tài xế tối thiểu để smoke test offer và campaign của operator.
- [x] Không mở rộng UI tài xế nếu không cần thiết để kiểm chứng nghiệp vụ operator.

## 2. Những phần operator đã hoàn thành

### Nền tảng

- [x] Đăng nhập, khôi phục session, đăng xuất và bảo vệ route theo role `OPERATOR`.
- [x] Operator shell, điều hướng, hồ sơ và menu thông báo.
- [x] HTTP client có token, timeout và chuẩn hóa lỗi.
- [x] `httpOperatorAdapter` kết nối backend live; mock mode vẫn dùng được cho test.
- [x] Kiểm tra response API trước khi đưa dữ liệu vào component.

### Dashboard và bản đồ

- [x] Đọc snapshot cung–cầu live từ DB.
- [x] Hiển thị bản đồ H3/GeoJSON, mức độ thiếu xe và chi tiết vùng.
- [x] KPI, hotspot, loading và lỗi API cơ bản.
- [x] Baseline live được suy ra từ snapshot DB.

### Kiểm duyệt proposal

- [x] Danh sách, bộ lọc, route UUID và trang chi tiết proposal.
- [x] Policy check, cảnh báo, bằng chứng, so sánh trước/sau và lịch sử phiên bản.
- [x] Chỉnh sửa, duyệt, từ chối và kích hoạt proposal qua DB RPC atomic.
- [x] Checklist bắt buộc trước khi duyệt và khóa thao tác khi policy/input không hợp lệ.
- [x] Revision lưu đầy đủ move, thời lượng, ngân sách, bonus và multiplier.

### Điều hành campaign

- [x] Danh sách campaign, funnel offer, theo dõi offer/tài xế và ngân sách.
- [x] Xác nhận hủy campaign và xử lý hủy atomic.
- [x] API operator để expire offer.
- [x] Màn hình audit live.
- [x] Báo cáo dùng snapshot, baseline, campaign và ngân sách từ API live.

### Tích hợp đã kiểm chứng

- [x] Operator đăng nhập và xem snapshot, proposal, campaign live.
- [x] Operator duyệt proposal và kích hoạt campaign end-to-end.
- [x] Driver smoke test nhận offer và cập nhật participation/audit trong DB.
- [x] Backend live checks, frontend lint/test/build và dependency audit đều pass.

## 3. P0 — phải hoàn thành trước khi phát hành operator

### 3.1 Chuẩn hóa hợp đồng API

- [x] Thêm OpenAPI response DTO cho toàn bộ endpoint operator.
- [x] Thêm Swagger request/response example cho snapshot, baseline, proposal, campaign, offer, driver và audit.
- [x] Ghi rõ tiền là số nguyên VND; thời gian là ISO-8601 có timezone.
- [x] Thống nhất tài nguyên không tồn tại trả `404`; collection không có dữ liệu trả mảng rỗng.
- [x] Thống nhất lỗi thành `{ code, message, details?, requestId }`.
- [x] Thêm request/correlation ID vào response và backend log.
- [x] Bảo đảm lỗi validation/DB không làm lộ SQL hoặc chi tiết nội bộ Supabase.
- [x] Thêm contract test cho Swagger/HTTP error contract và frontend error parsing.

### 3.2 Hoàn thiện kiểm duyệt proposal

- [x] Trả lỗi `422` theo từng trường: số xe, nguồn xe, ngân sách, thời lượng và bonus.
- [x] Hiển thị lỗi revision ngay cạnh trường operator cần sửa.
- [x] Xử lý `409` khi proposal đã bị đồng nghiệp duyệt hoặc chỉnh sửa trước.
- [x] Tự refresh proposal/audit sau conflict và khóa nút thao tác đã lỗi thời.
- [x] Kiểm chứng proposal stale bị chặn ở cả UI và backend.
- [x] Kiểm chứng policy lỗi không thể bị bỏ qua bằng cách gọi API trực tiếp.
- [x] Kiểm chứng reason code và note bắt buộc khi từ chối đúng contract API/DB.
- [x] Thêm live no-mutation test cho nhánh lỗi revise/approve/reject/activate bằng fixture dùng một lần.

### 3.3 Hoàn thiện điều hành campaign

- [x] Chặn kích hoạt trùng ở UI và kiểm chứng uniqueness conflict từ DB.
- [x] Đưa thao tác expire từng offer đang mở lên UI operator nếu nghiệp vụ cần.
- [x] Hiển thị đúng kết quả hủy đối với offer mở, participation đã nhận và tài xế đang gán.
- [x] Hoàn thiện trạng thái: không có ứng viên, hết ngân sách, đạt mục tiêu, hết hạn và đã hủy.
- [x] Chỉ poll campaign đang chạy khi tab trình duyệt đang hiển thị.
- [x] Dừng polling với campaign đã kết thúc.
- [x] Invalidate đúng proposal/campaign/offer/audit/notification sau mutation.
- [x] E2E luồng activate → monitor → cancel.
- [x] E2E luồng activate → đạt mục tiêu.

### 3.4 Audit dùng được trong production

- [x] Thêm phân trang backend cho `GET /operator/audit`, bỏ giới hạn cứng 200 dòng.
- [x] Thêm filter backend theo entity/proposal, action, actor và khoảng ngày.
- [x] Lưu filter/page vào URL để chia sẻ được màn hình đã lọc.
- [x] API trả total count và cursor/page metadata ổn định.
- [x] Kiểm chứng audit append-only và operator không thể sửa/xóa audit.
- [x] Test empty, filter sai, API error và nhiều trang.

### 3.5 Kiểm thử trạng thái phát hành

- [x] Mọi màn hình operator có loading, empty, error, stale và retry an toàn.
- [x] Test API down, session hết hạn, `403`, `404`, `409` và `422` trên trình duyệt.
- [x] Kiểm thử bàn phím cho proposal review và dialog campaign.
- [x] Kiểm thử layout tại 360px, tablet, laptop và desktop rộng.
- [x] Kiểm tra table/dialog không tràn ngang ở 360px.
- [x] Kiểm tra tiếng Việt, tiền, ngày giờ, phần trăm và nhãn trạng thái với dữ liệu live.
- [x] Chạy luồng E2E operator hoàn chỉnh 3 lần bằng fixture dùng một lần.

## 4. P1 — hoàn thiện vận hành

### Dashboard và độ mới dữ liệu

- [x] Hiển thị cảnh báo stale nổi bật dựa trên thời gian snapshot live.
- [x] Chốt chính sách refresh/polling cho bản đồ và KPI.
- [x] Quyết định forecast +15/+30 do backend cung cấp hay chỉ là client projection có nhãn rõ ràng.
- [x] Thêm API snapshot/forecast theo time window từ DB; dữ liệu forecast vẫn được ghi rõ là mô phỏng cho tới khi có model.
- [x] DB query contract hỗ trợ filter `from`, `to`, `scenarioCode`, `h3Index` và giới hạn số snapshot.

### Thông báo operator

- [x] Chốt read/unread lưu bền trong DB hay chỉ tồn tại trong session.
- [x] Định nghĩa trigger: proposal chờ duyệt, campaign đổi trạng thái, sắp hết ngân sách, offer hết hạn và đạt mục tiêu.
- [x] Chỉ thêm polling/realtime sau khi chốt ownership của notification.
- [x] Kiểm chứng mỗi notification mở đúng proposal hoặc campaign.

### Chất lượng báo cáo

- [x] Chốt nguồn DB chính thức cho qualified trips, reward đã trả và net cost.
- [x] Không gọi số liệu suy diễn là “đã ghi nhận” khi chưa có trip/reward ledger.
- [x] Thêm filter campaign/khoảng ngày bằng server query.
- [x] Đối soát tổng báo cáo với campaign, participation, reward và audit.
- [x] Chỉ thêm export sau khi định nghĩa báo cáo và quyền truy cập được khóa.

### Bảo mật và xử lý đồng thời

- [x] Live test chứng minh driver không gọi được bất kỳ endpoint operator nào.
- [x] Test hai operator cùng duyệt và cùng kích hoạt một proposal.
- [x] Xác nhận chỉ profile operator đang active được duyệt, kích hoạt, hủy và expire.
- [x] Thêm rate limit cho endpoint nhạy cảm nếu cần.
- [x] Mỗi mutation ghi được request ID, actor, entity, trạng thái cũ và trạng thái mới.

## 5. P2 — công việc nền tảng về sau

- [x] Chốt backend chưa sở hữu nguồn đầu vào nên không tự sinh snapshot production; chỉ đọc snapshot DB thật, không dựng dữ liệu giả.
- [x] Thêm pipeline hotspot/proposal dry-run ghi rõ `SIMULATED`, khóa hoàn toàn `--commit` cho tới khi tích hợp và duyệt model thật.
- [x] Job tự động expire offer và chuyển vòng đời campaign.
- [x] Giữ polling hiện tại vì đã đủ cho vận hành MVP; chưa thêm WebSocket/realtime không cần thiết.
- [x] Structured logging, health/readiness, monitoring và cảnh báo production.
- [x] Kiểm chứng backup/restore dry-run, checksum, quan hệ dữ liệu và chính sách retention cho snapshot/audit.
- [x] Cấu hình deployment và production runbook.

## 6. Phạm vi tài xế tối thiểu

- [x] Tài khoản test driver đăng nhập được.
- [x] Driver chỉ thấy offer của chính mình trong smoke workflow.
- [x] Accept/decline cập nhật DB atomic.
- [x] Campaign/audit phía operator phản ánh response của driver.
- [x] Giữ trang driver đơn giản; không dùng thời gian operator để polish UI này.
- [x] Dùng fixture driver xác định hoặc test helper cho operator E2E.
- [ ] Mọi thay đổi contract driver cần phối hợp với đồng nghiệp phụ trách driver.

## 7. Thứ tự triển khai đề xuất

1. [x] OpenAPI DTO, error envelope, quy tắc `404` và request ID.
2. [x] Lỗi/conflict của proposal review và live integration tests.
3. [x] Edge state campaign, expire offer, polling và kiểm chứng cancel.
4. [x] Audit phân trang/filter phía server và filter URL phía frontend.
5. [x] Kiểm thử error/session/responsive toàn bộ operator UI.
6. [x] Chốt ownership và nhãn dữ liệu của notification/report.
7. [x] Chạy E2E operator lặp lại và hoàn tất release checks.

## 8. Definition of done cho operator

- [x] Mọi màn hình operator dùng dữ liệu DB live hoặc ghi rõ là simulated/session-only.
- [x] Mọi mutation được phân quyền, atomic, audited và an toàn khi có request đồng thời.
- [x] Proposal review xử lý đủ success, validation, stale, policy failure và reviewer conflict.
- [x] Campaign xử lý đủ activate, activate trùng, monitor, expiry, đạt mục tiêu, hết ngân sách và cancel.
- [x] Audit được filter/phân trang tại server, trace được và append-only.
- [x] Báo cáo phân biệt rõ dữ liệu ghi nhận và số liệu suy diễn.
- [x] Operator UI dùng được bằng bàn phím và từ 360px đến desktop.
- [x] Backend live checks và frontend lint/test/typecheck/build đều pass.
- [x] Driver smoke fixture đủ để chứng minh toàn bộ luồng operator.

## Quy tắc tick checklist

Chỉ tick `[x]` sau khi đã hoàn thành code và kiểm chứng tương ứng. Khi hoàn thành
một mục, cập nhật test trong cùng thay đổi và ghi bằng chứng vào checklist này
hoặc checklist tích hợp.

## Bằng chứng gần nhất

### 2026-08-09 — P0.1 API contract

- [x] Backend `npm run check:live`: typecheck, build, 6 suites/10 tests, DB smoke và API smoke đều pass.
- [x] API smoke kiểm chứng Swagger JSON, `401`, `403`, `404/NOT_FOUND` và `x-request-id` qua HTTP thật.
- [x] Unit test kiểm chứng validation details và lỗi nội bộ không xuất hiện trong response.
- [x] Frontend `npm run check`: lint, build và 15 files/32 tests đều pass.
- [x] Frontend giữ `details` và `requestId` trong `AppError` để dùng cho form operator ở bước tiếp theo.

### 2026-08-09 — P0.2 proposal validation và conflict

- [x] Backend `npm run check:live`: 9 suites/17 tests, build, DB smoke và API smoke đều pass.
- [x] Live API smoke: revision lỗi trả `422`; review/revision trùng trả `409`; rejection thiếu lý do trả `422`.
- [x] Live fixture xác nhận policy bypass `422`, stale approval `409` và duplicate activation `409`.
- [x] Sau các failure path, fixture vẫn `UNDER_REVIEW`, không có audit mới và được xóa sạch trong `finally`.
- [x] Backend kiểm tra stale input, policy status, source supply cộng dồn và worst-case budget trước RPC.
- [x] Frontend `npm run check`: lint, build và 17 files/35 tests đều pass.
- [x] Form liên kết lỗi với đúng control bằng `aria-invalid`/`aria-describedby` và hiển thị request ID.
- [x] Mutation conflict tự invalidate proposal list/detail và audit để tải lại trạng thái mới nhất.

### 2026-08-09 — P0.3 campaign lifecycle và điều hành

- [x] Migration live chuyển campaign sang `TARGET_REACHED`, tự expire offer còn mở và ghi `CampaignTargetReached` audit ngay khi đủ lượt nhận.
- [x] UI chặn phát hành trùng, cho operator expire offer mở và mô tả đúng kết quả cancel đối với offer/participation/driver.
- [x] Campaign hiển thị riêng các trạng thái không có ứng viên, hết ngân sách, đạt mục tiêu, quá thời gian và đã hủy.
- [x] Polling chỉ chạy khi tab hiển thị và còn campaign/offer thực sự đang vận hành; dừng cho trạng thái terminal, hết thời gian, hết ngân sách hoặc không có ứng viên.
- [x] Mutation campaign invalidate proposal, campaign, offer, audit và nguồn driver; notification hiện tại tự cập nhật từ proposal/campaign query.
- [x] Backend `npm run check:live`: typecheck, build, 9 suites/18 tests, DB/API smoke và campaign live smoke đều pass.
- [x] Campaign live smoke dùng fixture dùng một lần đã pass `activate → monitor → accept → cancel`, giải phóng participation/driver và `activate → accept → TARGET_REACHED`.
- [x] Frontend `npm run check`: lint, 20 files/43 tests và production build đều pass.

### 2026-08-09 — P0.4 audit production

- [x] `GET /operator/audit` trả page metadata ổn định, total count chính xác và sắp xếp theo `created_at`, `id` giảm dần.
- [x] Backend lọc tại DB theo UUID thực thể/proposal/campaign, loại thực thể, action chuẩn hóa, actor type/ID và khoảng thời gian.
- [x] Migration live thêm index cho thời gian, thực thể, action, actor và `metadata.proposal_id` của audit.
- [x] Frontend lưu filter, page và page size vào URL; hỗ trợ UUID validation, khoảng ngày, empty, API error, retry và điều hướng nhiều trang.
- [x] Live smoke chứng minh operator đăng nhập không thể update hoặc delete audit; bản ghi vẫn nguyên vẹn sau hai lần thử.
- [x] Backend `npm run check:live`: 9 suites/18 tests, DB smoke, API audit smoke và campaign smoke đều pass.
- [x] Frontend `npm run check`: lint, 22 files/48 tests và production build đều pass.

### 2026-08-09 — P0.5 release state, keyboard và responsive

- [x] Client/AuthProvider test API down, session hết hạn và lỗi `401`, `403`, `404`, `409`, `422`; dialog có focus ban đầu, focus trap, Escape và khôi phục focus.
- [x] Chrome chạy ma trận 5 màn hình operator tại 360/768/1366/1920px; 20/20 trường hợp không cuộn ngang toàn trang sau khi proposal mobile chuyển sang dạng thẻ và report grid được giới hạn `min-width`.
- [x] Dialog campaign ở 360px nằm trọn viewport, không tràn ngang; proposal review và campaign dùng chung dialog đã kiểm chứng bàn phím.
- [x] Chạy riêng campaign E2E live 3 lần liên tiếp; mỗi lần đều đạt 5/5 kiểm chứng và fixture được dọn trong `finally`.
- [x] Backend `npm run check:live`: 9 suites/18 tests, DB smoke, 25 API checks và campaign smoke đều pass.
- [x] Frontend `npm run check`: lint, 24 files/54 tests và production build đều pass.
- [x] Chrome vẫn chặn request trực tiếp tới Supabase bằng `net::ERR_BLOCKED_BY_CLIENT`; ma trận live đã được hoàn tất qua auth proxy localhost tạm thời, dùng backend và dữ liệu production thật. Proxy, fixture và ngoại lệ localhost đã được gỡ sau kiểm thử.

### 2026-08-09 — P1 snapshot freshness và forecast DB-first

- [x] Snapshot tự refetch mỗi 2 phút khi tab hiển thị, dừng polling nền; sau 5 phút hiển thị cảnh báo stale nổi bật và nút tải lại an toàn.
- [x] Backend tách đúng `current_demand` cho hiện tại và `predicted_demand` cho dự báo +15; gap/severity hiện tại được tính từ cung và nhu cầu hiện tại.
- [x] UI giới hạn horizon ở +15 theo DB hiện có, bỏ +30 suy diễn, đổi nhãn “AI forecast” thành “Snapshot DB/Dự báo DB”.
- [x] Không còn dựng confidence: API trả `null` và UI hiển thị “Chưa có” khi DB chưa cung cấp độ tin cậy.
- [x] Payload live xác nhận cung 16, nhu cầu hiện tại 15, forecast +15 là 22, gap 0 và confidence `null`; snapshot live cũ nên thỏa điều kiện cảnh báo.
- [x] Backend `npm run check:live`: 10 suites/19 tests, DB/API/campaign smoke đều pass; frontend `npm run check`: 26 files/58 tests và production build đều pass.

### 2026-08-09 — P1 notification session-only

- [x] DB design xác nhận MVP không có bảng notification; UI ghi rõ read/unread chỉ lưu trong phiên và không giả là dữ liệu bền.
- [x] Notification được suy ra từ proposal/campaign/offer DB: chờ duyệt, campaign terminal/đạt mục tiêu, không còn ứng viên, dùng từ 80% ngân sách, sắp hết hạn và offer đã hết hạn.
- [x] Campaign/offer polling hiện có được tái sử dụng sau khi ownership được chốt; không thêm realtime hoặc dịch vụ ngoài DB.
- [x] Unit test xác nhận proposal mở đúng `/operator/plans/:id`, mọi cảnh báo campaign/offer mở `/operator/campaigns` và terminal state không bị hiển thị như campaign đang chạy.
- [x] Frontend `npm run check`: lint, 27 files/61 tests và production build đều pass.

### 2026-08-09 — P1 báo cáo DB ledger

- [x] Thêm `GET /operator/reports/operations` đọc trực tiếp campaign, participation, trip, reward ledger và audit; hỗ trợ filter `campaignId`, `from`, `to` tại server.
- [x] Qualified trips chỉ đếm `trips.status=COMPLETED`; reward đã trả chỉ cộng `reward_records.status=SIMULATED_PAID`; ngân sách lấy từ `campaigns.budget_used`.
- [x] Net cost trả `null` và UI ghi rõ chưa khả dụng vì DB chưa có ledger doanh thu tăng thêm; không còn suy diễn trips/net cost từ snapshot.
- [x] Report trả chênh lệch `budget_used - reward đủ điều kiện`, số audit theo campaign và tổng summary; live smoke kiểm chứng tổng khớp từng dòng campaign.
- [x] Filter ngày được quy đổi theo ngày Hà Nội, lưu trong URL; khoảng ngày đảo ngược bị chặn ở UI và trả `422` ổn định ở backend.
- [x] Export được giữ khóa, chưa xuất hiện trên UI cho tới khi định nghĩa file và quyền tải dữ liệu được duyệt.
- [x] Backend `npm run check:live`: 11 suites/20 tests, 28 API checks, DB/campaign smoke đều pass; frontend `npm run check`: 28 files/64 tests và production build đều pass.

### 2026-08-09 — P1 bảo mật và xử lý đồng thời

- [x] Thêm security smoke vào `check:live`; driver thật bị chặn `403/FORBIDDEN` trên toàn bộ 16 route chỉ dành cho operator, gồm cả route nằm ngoài prefix `/operator`.
- [x] Operator tạm có token hợp lệ nhưng `profiles.is_active=false` bị chặn trước mutation approve, activate, cancel và expire; fixture không đi vào service.
- [x] Hai operator active gửi approve đồng thời: đúng một `201`, một `409`; audit duyệt chỉ có một bản ghi với actor, before và after.
- [x] Hai operator active gửi activate đồng thời: đúng một `201`, một `409` và DB chỉ có một campaign cho proposal.
- [x] User/profile operator tạm, proposal, campaign, offer và audit thử nghiệm được dọn trong `finally`.
- [x] Backend `npm run check:live`: 11 suites/20 tests, DB smoke, 28 API checks, campaign smoke và 4 nhóm security/concurrency smoke đều pass.
- [x] Áp dụng và ghi lịch sử live migrations `20260809200000_audit_request_context` và `20260809203000_complete_mutation_audit` trên Supabase production.
- [x] `x-request-id` đi xuyên controller/service/RPC vào `audit_logs.metadata.request_id`; approve, reject, revise, activate, expire và cancel đều được live smoke đối chiếu actor, entity, before/after.
- [x] Driver status chuyển sang RPC atomic có audit; offer response và chuyển `TARGET_REACHED` cùng giữ request ID nguồn. Contract HTTP `online_idle` được ánh xạ sang vocabulary RPC mà không đổi frontend/driver API.
- [x] Backend `npm run check:live` sau migration: 11 suites/20 tests, 28 API checks, 6 campaign checks và 5 security/concurrency checks đều pass.
- [x] Cả 8 mutation route dùng quota 10 lần/actor/endpoint/60 giây; actor ID tách quota cho hai operator dùng chung IP và chỉ fallback IP trước authentication.
- [x] OpenAPI công bố response `429`; error filter trả `RATE_LIMITED` cùng request ID và throttler trả `Retry-After-sensitive`.
- [x] Live burst trên proposal terminal không làm đổi DB: 9 conflict hợp lệ rồi request thứ 10 của cùng actor bị chặn `429`; operator thứ hai không dùng chung bucket.
- [x] Backend `npm run check:live`: 12 suites/22 tests, DB smoke, 28 API checks, 6 campaign checks và 6 security/concurrency checks đều pass.
- [x] Ghi rõ storage hiện tại là process-local; deployment nhiều instance phải dùng shared throttler storage trước khi scale ngang.

### 2026-08-09 — P1 trạng thái phát hành operator UI

- [x] Dashboard, proposal list/detail, campaign/offer, audit và report đều phân biệt initial loading, initial error, empty và background refresh.
- [x] Refresh nền thất bại giữ nguyên dữ liệu cache, hiển thị cảnh báo stale và nút tải lại; refresh đang chạy được thông báo bằng live region mà không thay nội dung bằng skeleton.
- [x] Proposal detail chờ đủ proposal, version list, audit và campaign; dependency lỗi không còn làm UI suy luận sai lịch sử hoặc trạng thái phát hành.
- [x] Offer filter không còn trả bảng trắng: khi không khớp trạng thái, UI hiển thị empty state và hướng dẫn bỏ lọc.
- [x] Test ma trận xác nhận initial error/retry cho dashboard, proposal, campaign và report; test riêng dependency proposal detail, filtered offer empty và cached stale retry.
- [x] Frontend `npm run check`: lint, 29 files/72 tests và production build đều pass.

### 2026-08-09 — P1 ma trận lỗi/session trên trình duyệt

- [x] API down: dashboard giữ dữ liệu cache, cảnh báo dữ liệu có thể đã cũ và cung cấp nút tải lại an toàn.
- [x] Session hết hạn: response `401` xóa query cache, đăng xuất và chuyển về `/login` với thông báo đăng nhập để tiếp tục.
- [x] `403`: tài khoản driver bị route guard đưa về `/driver`, không thể mở màn operator.
- [x] `404`: proposal UUID không tồn tại hiển thị initial error an toàn và nút thử lại.
- [x] `422`: revision sai ngân sách hiển thị lỗi cạnh trường, thông báo tiếng Việt và `requestId`; sửa `PlanDetail` để giữ nguyên structured `AppError` thay vì làm mất details.
- [x] `409`: quyết định đồng thời hiển thị conflict cùng `requestId`, tự refresh proposal/audit và khóa thao tác đã lỗi thời.
- [x] Sửa API boundary dùng `cache: no-store`, loại bỏ lỗi giả do response `304`; proposal lịch sử có `targetZoneId = null` được đọc đúng theo DB và hàng đợi live hiển thị đủ 7 bản ghi.
- [x] Fixture proposal/audit, auth proxy, server `401` và cấu hình localhost tạm đã được xóa; các cổng 3000, 5173 và 54321 đều đã dừng.
- [x] Frontend `npm run check`: lint, 29 files/74 tests và production build đều pass.

### 2026-08-09 — P1 nguồn dữ liệu và định dạng live

- [x] Đối chiếu Supabase production: 7 proposal hiện có gồm 5 nguồn `MANUAL`, 2 nguồn `MOCK` và không có proposal do model/agent thật tạo; 40/40 ô snapshot có `predicted_demand`, vì vậy forecast và gợi ý từ model được ghi rõ là mô phỏng cho tới khi tích hợp model thật.
- [x] Proposal review, version, validation, approval, audit và activation vẫn dùng DB/API thật; nhãn nguồn phân biệt gợi ý nhập thủ công, mô phỏng, theo luật và model mô phỏng, không còn gọi mọi proposal là AI/Agent.
- [x] API trả `confidence=null` và `simulationAvailable=false` khi DB không có dữ liệu; UI hiển thị “Chưa có/Chưa có mô phỏng” thay vì dựng `0%`, bảng toàn số 0 hoặc phép tính `NaN`.
- [x] Bỏ thời gian đồng bộ hard-code; tiền dùng định dạng VND, phần trăm dùng ratio có xử lý null, ngày giờ hiển thị năm và múi giờ `Asia/Ho_Chi_Minh`.
- [x] Nhãn live đã phủ proposal `APPROVED`, campaign `ACTIVE/COMPLETED`, offer `SENT/ACCEPTED/DECLINED` và reward `SIMULATED_PAID`; report ghi rõ sổ vận hành DB và trạng thái trả thưởng mô phỏng.
- [x] Frontend `npm run check`: lint, 32 files/85 tests và production build đều pass; backend `npm run check`: 12 suites/23 tests, typecheck và build đều pass.
- [x] Live smoke đạt 8/8 DB checks, 28/28 API checks, 6/6 campaign checks và 6/6 security/concurrency checks. Lần chạy gộp đầu có một lỗi clock/token tạm thời `JWT issued at future` ở query proposal; chạy lại riêng ngay sau đó và toàn bộ nhóm live tiếp theo đều pass.

### 2026-08-09 — P2 lifecycle và production hardening

- [x] Áp dụng và ghi migration history `20260809220000_campaign_lifecycle_reconciliation` trên Supabase production; RPC dùng row lock + `skip locked`, an toàn khi nhiều scheduler chạy đồng thời.
- [x] Scheduler mặc định chạy mỗi 30 giây, tự chuyển campaign `ACTIVE → BUDGET_EXHAUSTED/COMPLETED`, expire offer còn mở và ghi audit `SYSTEM` với request ID, before/after và lý do.
- [x] Campaign live smoke xác nhận đủ cancel/release, budget exhaustion, end-time completion, target reached, expire offer và append-only audit; fixture được dọn sau kiểm thử.
- [x] Thêm `/health/live`, readiness query Supabase thật, process metrics và JSON request log; bổ sung Dockerfile, healthcheck, cấu hình env, monitoring/alert/rollback runbook.
- [x] Backup critical live gồm 2 snapshot, 80 cells, 1 hotspot và audit; restore dry-run kiểm đúng format, count, SHA-256 và liên kết snapshot. File kiểm chứng nằm trong `apps/backend/backups/` đã git-ignore.
- [x] `GET /operator/snapshots` đọc DB theo time window/scenario/H3; khoảng ngày đảo ngược trả `422`. Polling hiện tại tiếp tục là transport chính, chưa cần WebSocket.
- [x] `simulate:planning` đọc snapshot live nhưng chỉ xuất artifact `SIMULATED/DRY_RUN_ONLY`; `--commit` bị từ chối để không ghi proposal giả vào production trước khi có model.
- [x] Backend `npm run check:live`: 14 suites/27 tests, 8 DB checks, 32 API checks, 8 campaign checks và 6 security/concurrency checks đều pass.
- [x] Frontend `npm run check`: lint, 32 files/85 tests và production build đều pass.
- [x] Dockerfile đã được kiểm tra qua TypeScript/build contract; Docker Desktop trên máy không chạy nên chưa thực hiện được lệnh build image cục bộ. Runbook đã ghi rõ health gate bắt buộc khi deploy.
