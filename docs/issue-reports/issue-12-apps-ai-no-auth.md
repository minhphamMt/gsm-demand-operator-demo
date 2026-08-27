# Issue #12 — `apps/ai` không có xác thực, 6 route (gồm `POST /decisions`) gọi được ẩn danh

Trạng thái: **Đã xử lý** · Repo: `AI20K-Build-Phase-Cohort-3/P-042`

## Nguyên nhân

- `apps/backend` được làm rất kỹ: guard áp global qua `APP_GUARD`, route muốn miễn trừ phải khai `@Public()`, verify token bằng `supabase.auth.getUser()` thật (`apps/backend/src/auth/auth.guard.ts`).
- `apps/ai` là **service thứ hai** trong cùng monorepo, deploy lên Cloud Run bằng workflow riêng (`.github/workflows/deploy-ai.yml`), và **không thừa hưởng gì** từ tầng bảo vệ của `apps/backend` — hai service độc lập, hai cơ chế triển khai độc lập.
- 5 route nghiệp vụ trong `apps/ai/src/api/routes_inference.py` (`GET /datasets/snapshots/status`, `POST .../next`, `.../at`, `.../window`, `POST /decisions`) đăng ký thẳng vào router, không có `Depends`/`Security(` nào kiểm caller — grep toàn `apps/ai` cho các từ khóa đó trả về 0 kết quả trước khi sửa.
- `apps/backend/src/ai/ai.service.ts` (nơi duy nhất gọi sang `apps/ai`) dùng `fetch()` thuần, không đính kèm bất kỳ credential nào — kể cả khi thêm auth phía `apps/ai`, phía gọi vẫn chưa có cơ chế gửi nếu không sửa luôn.

## Hậu quả

- `POST /decisions` — endpoint nặng nhất, chạy trọn pipeline forecast → hotspot → optimizer — gọi được ẩn danh từ Internet vì Cloud Run URL là public.
- Bất kỳ ai biết URL service đều có thể: burn compute/cost bằng cách gọi lặp `/decisions`; dò cấu trúc dữ liệu vận hành (zone, snapshot, policy ngưỡng) qua response; hoặc DoS riêng service AI mà không cần vượt qua lớp bảo vệ của backend.

## Cách chữa

1. **`apps/ai/src/api/auth.py`** (mới): dependency `require_service_api_key` so khớp header `X-API-Key` với `AI_SERVICE_API_KEY` bằng `hmac.compare_digest` (tránh timing attack).
2. **`apps/ai/src/api/routes_inference.py`**: áp dependency lên toàn `router` (`APIRouter(..., dependencies=[Depends(...)])`) — bảo vệ cả 5 route cùng lúc thay vì sửa từng route. `GET /health` (`src/main.py`) **giữ nguyên public** — có chủ đích, vì Docker/Cloud Run healthcheck và bước "Verify health" trong `deploy-ai.yml` gọi trực tiếp, không mang credential.
3. **Fail-closed ở production, fail-open ở dev/test**: nếu `app_env=production` mà chưa cấu hình `AI_SERVICE_API_KEY` → 503 ngay lúc gọi, không âm thầm mở cửa. Nếu chưa cấu hình ở development/test → cho qua như cũ, để không phá hành vi CI hiện tại (CI không set biến này) và không phải sửa 30 test cũ.
4. **`apps/backend/src/ai/ai.service.ts`**: mọi request sang `apps/ai` giờ gửi kèm header `X-API-Key` lấy từ `AI_SERVICE_API_KEY` (khi biến này được cấu hình).
5. **`.env.example`** của cả hai app: thêm `AI_SERVICE_API_KEY=` (rỗng, đúng quy ước CLAUDE.md §8 #1 — không secret thật trong file mẫu).
6. **Test mới**:
   - `apps/ai/tests/test_service_auth.py` (5 case): `/health` vẫn public; mặc định anonymous khi chưa cấu hình khóa; 401 khi thiếu khóa; 401 khi sai khóa; qua khi đúng khóa.
   - `apps/backend/src/ai/ai.service.spec.ts` (+2 case): có gửi header khi `AI_SERVICE_API_KEY` được cấu hình; không gửi header thừa khi chưa cấu hình.

## Đã kiểm chứng

| Lệnh | Kết quả |
|---|---|
| `apps/ai`: `pytest tests/ -q` | **35/35 xanh** (30 test cũ không sửa một dòng nào + 5 test mới) |
| `apps/ai`: `ruff check src tests` | xanh |
| `apps/ai`: `ruff format --check` | 7 file báo lệch định dạng — **toàn bộ pre-existing**, không nằm trong diff của issue này (đã đối chiếu `git diff`); không đụng vào theo luật "không refactor cơ hội" (CLAUDE.md §4.1 #4) |
| `apps/ai`: `mypy src` | lỗi ngay từ stub `numpy` (`Type statement is only supported in Python 3.12+`) — lỗi môi trường có sẵn, không liên quan thay đổi này |
| `apps/backend`: `npm run check` (tsc + jest + build) | **106/106 test xanh** (104 cũ + 2 mới), typecheck xanh, build thành công |

File thay đổi: `apps/ai/src/config.py`, `apps/ai/src/api/auth.py` (mới), `apps/ai/src/api/routes_inference.py`, `apps/ai/tests/test_service_auth.py` (mới), `apps/ai/.env.example`, `apps/backend/src/ai/ai.service.ts`, `apps/backend/src/ai/ai.service.spec.ts`, `apps/backend/.env.example`.

## Còn thiếu — ngoài khả năng của phiên AI coding này

- **Đặt giá trị thật cho `AI_SERVICE_API_KEY` trên Cloud Run** (Secret Manager) cho cả service `gsm-ai` lẫn backend, rồi wire vào `.github/workflows/deploy-ai.yml` / `deploy-backend.yml`. Cả hai workflow hiện **không** set biến môi trường nào qua `--set-env-vars`/`--set-secrets` — cấu hình runtime đang nằm ngoài CI (khả năng ở Cloud Run console). Không có quyền truy cập GCP nên không tự làm được — cần user/DevOps thao tác trực tiếp trên GCP rồi xác nhận lại `app_env=production` sẽ fail-closed đúng như thiết kế.
- **Cân nhắc đề xuất #1 của issue**: đặt `apps/ai` sau tầng nội bộ (Cloud Run ingress internal / VPC), chỉ `apps/backend` gọi được — chắc chắn hơn API key dùng chung vì loại bỏ hẳn bề mặt public. Đây là quyết định hạ tầng, không nằm trong phạm vi sửa code của phiên này.

## Rút kinh nghiệm

- Service thứ hai trong cùng hệ thống **không tự động thừa hưởng** bảo mật của service thứ nhất — mỗi boundary public phải tự kiểm tra riêng, dù "cùng một sản phẩm, cùng team, cùng đợt deploy".
- Rà bảo mật nên chạy trên **toàn bộ `apps/*`**, không dừng ở app "chính" trông có vẻ được làm kỹ nhất — `grep "Depends\|Security(\|api_key\|Authorization"` nên là bước định kỳ quét hết monorepo, không riêng một thư mục.
- Thêm auth cho service nội bộ phải sửa **cả hai đầu trong cùng một đổi thay**: server kiểm (`apps/ai`) và client gửi (`apps/backend`) — vá phía server mà quên cập nhật caller thì auth mới thêm cũng vô dụng (caller vẫn gửi request trần, nhận lỗi 401 ngay khi lên production).
