# Issue #13 — `POST /auth/demo-session` phát session operator thật, không kiểm `NODE_ENV`

Trạng thái: **Đã xử lý** · Repo: `AI20K-Build-Phase-Cohort-3/P-042`

## Nguyên nhân

- `POST /auth/demo-session` (`auth.controller.ts:19-27`) đăng ký `@Public()` — không qua `AuthGuard`, ai cũng gọi được.
- Chốt chặn duy nhất trước khi sửa nằm ở `demo-auth.service.ts:39-41`: nếu thiếu `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` hoặc chưa cấu hình `DEMO_OPERATOR_EMAIL`/`DEMO_OPERATOR_PASSWORD` thì mới `throw UnauthorizedException`. Không có bất kỳ chỗ nào trong request path kiểm `NODE_ENV`/`APP_ENV`.
- Rate limit 5 request/60s (`@Throttle` ở controller) không giảm nhẹ được rủi ro: response (`demo-auth.service.ts:58-65`, trước sửa) trả cả `access_token` **và** `refresh_token` Supabase thật. Một request lọt lưới là đủ — có refresh token thì gia hạn phiên vô thời hạn, không cần gọi lại endpoint để bị rate-limit chặn.
- Kết quả: an toàn của endpoint phụ thuộc hoàn toàn vào việc **không ai từng set** hai biến `DEMO_OPERATOR_*` trên production — phòng thủ kiểu "dựa vào sự quên", đúng cho tới lần đầu có người thêm biến để demo rồi để nguyên.

## Hậu quả

- Nếu `DEMO_OPERATOR_EMAIL`/`DEMO_OPERATOR_PASSWORD` từng bị set trên production (kể cả tạm thời để thử demo), bất kỳ ai biết URL backend đều gọi ẩn danh và nhận session Supabase thật của tài khoản operator được cấu hình — tức toàn quyền operator (duyệt/từ chối/revise plan, phát campaign, v.v.) mà không cần đăng nhập.
- Vì response kèm `refresh_token`, kẻ tấn công giữ được quyền truy cập lâu dài ngay cả sau khi hai biến env bị gỡ lại hoặc `access_token` hết hạn — cửa sổ rủi ro không đóng lại cùng lúc với việc "sửa cấu hình".

## Cách chữa

1. **`demo-auth.service.ts`**: đọc `NODE_ENV` qua `ConfigService` lúc khởi tạo (mặc định `'development'` nếu không đọc được, không mặc định `'production'` lẫn không mặc định "cho phép"). Trong `createSession()`, chặn **ngay đầu hàm**, trước khi chạm Supabase, nếu `nodeEnv === 'production'` — ném cùng `UnauthorizedException('Demo access is disabled')` như case thiếu cấu hình, để không lộ thêm thông tin phân biệt hai lý do chặn.
2. **Log cảnh báo mỗi lần gọi** (đề xuất #3 của issue): `demo_auth_blocked_production` khi bị chặn vì production, `demo_session_issued` khi phát session thành công — cả hai ở mức `WARNING`, phục vụ phát hiện dùng sai/dùng nhầm sau này.
3. **Đã xác nhận chặn thật trên đường deploy thật**, không chỉ lý thuyết: `apps/backend/Dockerfile:10` hard-code `ENV NODE_ENV=production` ở stage runtime — mọi image chạy production đều có biến này, nên fix có hiệu lực ngay cả khi ai đó lỡ set `DEMO_OPERATOR_*` trên Cloud Run.
4. **Không đổi contract response**, không đổi hành vi ở môi trường ngoài production (dev/test vẫn hoạt động như cũ khi có đủ cấu hình).
5. Đề xuất #2 của issue (bỏ hẳn endpoint demo, dùng tài khoản demo mật khẩu thật qua luồng login thường) là thay đổi UX/sản phẩm lớn hơn phạm vi vá bảo mật tối thiểu — không tự làm, ghi ở mục "Còn thiếu".

## Test mới

`apps/backend/src/auth/demo-auth.service.spec.ts` (4 case):
- `NODE_ENV=production` + đủ credentials hợp lệ vẫn bị chặn (`UnauthorizedException`).
- `NODE_ENV=production`: chưa từng gọi `signInWithPassword` — chặn trước khi chạm mạng, không tạo cơ hội lộ thông tin qua lỗi Supabase.
- Ngoài production, thiếu credentials vẫn bị vô hiệu hoá như hành vi cũ — xác nhận không phá behavior hiện có.
- `NODE_ENV` không set rõ ràng vẫn rơi vào nhánh non-production (mặc định an toàn là "không phải production", không phải "cho phép mặc định").

## Đã kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `apps/backend`: `npx jest src/auth/demo-auth.service.spec.ts` | **4/4 xanh** |
| `apps/backend`: `npx jest --runInBand` (toàn bộ) | **110/110 xanh** (106 cũ + 4 mới) |
| `apps/backend`: `npx tsc --noEmit` | xanh |
| `apps/backend`: `npx nest build` | thành công |

File thay đổi: `apps/backend/src/auth/demo-auth.service.ts`, `apps/backend/src/auth/demo-auth.service.spec.ts` (mới).

## Còn thiếu — ngoài phạm vi vá bảo mật tối thiểu này

- **Đề xuất #2 của issue**: cân nhắc bỏ hẳn `POST /auth/demo-session`, thay bằng tài khoản demo có mật khẩu thật đăng nhập qua luồng thường — quyết định sản phẩm/UX, cần PM/BA chốt, không tự làm.
- **Xoay vòng tài khoản demo nếu nghi ngờ đã từng bị lộ**: nếu `DEMO_OPERATOR_EMAIL`/`PASSWORD` từng được set trên production trước ngày vá này, nên đổi mật khẩu tài khoản operator đó trên Supabase — phiên AI coding không có quyền truy cập Supabase production để tự kiểm tra lịch sử cấu hình này.

## Rút kinh nghiệm

- Một route `@Public()` không nên chỉ dựa vào "biến môi trường bị bỏ trống" làm chốt chặn duy nhất — đó là phòng thủ dựa trên sự quên, sẽ vỡ ngay lần đầu có người cấu hình biến đó vì lý do khác (demo, thử nghiệm nội bộ) rồi không dọn lại.
- Trả kèm `refresh_token` biến "một request lọt lưới" thành "quyền truy cập vô thời hạn" — bất kỳ endpoint phát hành credential/session thật nào cũng phải được xem là rủi ro cao hơn endpoint chỉ đọc dữ liệu, kể cả khi đã có rate limit.
- Kiểm `NODE_ENV`/môi trường nên là bước bắt buộc ngay khi thêm bất kỳ route `@Public()` nào phát hành session/token thật, không phải việc chỉ được nhớ ra sau một đợt rà bảo mật.
