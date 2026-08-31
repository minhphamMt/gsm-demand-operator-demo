# GSM-14 NovaFour

NovaFour là hệ thống mô phỏng hỗ trợ điều phối cung–cầu tài xế theo vùng. Hệ
thống phát lại snapshot theo chu kỳ 5 phút, dự báo cung/cầu cho 30 zone, phát
hiện hotspot, đề xuất điều chuyển, đưa phương án qua bước duyệt của người vận
hành, sau đó quản lý campaign, offer và phản hồi từ Driver App.

> NovaFour là sản phẩm mô phỏng và hỗ trợ quyết định. Dữ liệu replay, tỷ lệ
> chấp nhận dự kiến và KPI activation không phải bằng chứng về tác động kinh
> doanh ngoài thực tế.

## Mục lục

- [Chức năng chính](#chức-năng-chính)
- [Kiến trúc tổng quan](#kiến-trúc-tổng-quan)
- [Cấu trúc repository](#cấu-trúc-repository)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Khởi động nhanh bằng Docker Compose](#khởi-động-nhanh-bằng-docker-compose)
- [Cấu hình biến môi trường](#cấu-hình-biến-môi-trường)
- [Chạy từng service khi phát triển](#chạy-từng-service-khi-phát-triển)
- [Sample queries](#sample-queries)
- [Eval evidence](#eval-evidence)
- [Kiểm thử và quality gates](#kiểm-thử-và-quality-gates)
- [Triển khai](#triển-khai)
- [Xử lý sự cố thường gặp](#xử-lý-sự-cố-thường-gặp)
- [Bảo mật và vận hành](#bảo-mật-và-vận-hành)

## Chức năng chính

- Phát lại dữ liệu cung–cầu theo snapshot 5 phút.
- Dự báo demand/supply theo các horizon 5, 10 và 15 phút bằng LightGBM quantile.
- Phát hiện vùng thiếu xe theo cơ sở thận trọng `p90 demand - p50 supply`.
- Tối ưu điều chuyển trực tiếp theo khoảng cách, nguồn dự trữ và ngân sách.
- Đề xuất activation bằng offer cho phần thiếu hụt không thể bù bằng relocation.
- Quy trình human-in-the-loop: chỉnh sửa, duyệt, từ chối và phát hành riêng.
- Operator Console theo dõi proposal, dispatch, campaign, offer, báo cáo và audit.
- Driver App hỗ trợ xem, chấp nhận hoặc từ chối offer.
- Ghi audit và request ID để truy vết các mutation quan trọng.

## Kiến trúc tổng quan

```text
Operator Web ─┐
              ├─> NestJS Backend ───────────────> Supabase/PostgreSQL
Driver App ───┘         │                              │
                        │                              │
                        └─> FastAPI AI Service ────────┘
                            │
                            ├─ Snapshot replay
                            ├─ LightGBM forecast
                            └─ Optimizer + simulator
```

Luồng quyết định chính:

```text
Snapshot → Forecast → Hotspot → Proposal → Operator review
→ Dispatch và/hoặc Campaign → Driver offer → Audit/Report
```

| Thành phần | Công nghệ | Trách nhiệm |
|---|---|---|
| Frontend | React, TypeScript, Vite | Operator Console và Driver App |
| Backend | NestJS | Auth, API, proposal review, dispatch, campaign, offer và audit |
| AI service | FastAPI, LightGBM | Replay, forecast, hotspot, optimizer và simulation |
| Database/Auth | Supabase/PostgreSQL | System of record, RPC atomic, RLS và authentication |
| Runtime | Docker, Cloud Run | Đóng gói và triển khai backend/AI |

Xem [ARCHITECTURE.md](ARCHITECTURE.md) để biết component, data flow và trust
boundary chi tiết.

## Cấu trúc repository

```text
apps/ai/                    FastAPI, replay, model, optimizer và policy
apps/backend/               NestJS API, Supabase integration và migrations
apps/frontend/              React/Vite Operator Console và Driver App
docs/                       Kiến trúc, runbook, checklist và tài liệu kỹ thuật
eval/                       Eval report, manual test và output thực tế
skill/                      Product/domain specification
legacy/                     Starter scaffold cũ, không thuộc product runtime
scripts/                    Script setup, hook và công cụ hỗ trợ
docker-compose.yml          Stack tích hợp local
Makefile                    Quality gates tổng hợp
```

Các thư mục `runs/`, `.ai-log/`, cache Python/Node và file `.env` là dữ liệu
local, không được commit. Artifact đánh giá cần chia sẻ phải đặt có chủ đích
trong `eval/`.

## Yêu cầu hệ thống

### Cách 1 — Docker Compose, được khuyến nghị

- Git.
- Docker Desktop hoặc Docker Engine.
- Docker Compose 2.24 trở lên.
- Một Supabase project đã được cấu hình schema phù hợp.
- Các cổng `5173`, `3000` và `8000` đang trống.

### Cách 2 — Chạy trực tiếp từng service

- Python 3.11.
- Node.js 22 và npm.
- Supabase project.
- Mapbox public token nếu muốn hiển thị nền bản đồ Mapbox.

## Khởi động nhanh bằng Docker Compose

### 1. Clone repository

```powershell
git clone <repository-url>
Set-Location P-042
```

### 2. Tạo file cấu hình local

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env
```

Trên bash:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Điền tối thiểu các biến sau:

| File | Biến bắt buộc |
|---|---|
| `apps/backend/.env` | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `apps/frontend/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `apps/frontend/.env` | `VITE_MAPBOX_ACCESS_TOKEN` nếu sử dụng Mapbox |

### 3. Chuẩn bị Supabase

Schema và RPC nằm trong `apps/backend/supabase/migrations/`. Migration phải được
áp dụng theo thứ tự tên file và ghi nhận vào migration history.

- Với project mới: áp dụng lần lượt toàn bộ migration bằng quy trình Supabase
  SQL Editor/CLI của nhóm.
- Với project đã có dữ liệu: không chạy lại migration một cách mù quáng. Kiểm
  tra schema drift, backup dữ liệu quan trọng và làm theo
  [Production Runbook](docs/PRODUCTION_RUNBOOK.md).
- Migration của dự án là forward-only; sửa schema bằng migration mới, không sửa
  migration đã áp dụng.

Để dùng luồng đăng nhập và smoke test, tạo file Git-ignored
`apps/backend/.env.test.local` với bốn biến `TEST_OPERATOR_EMAIL`,
`TEST_OPERATOR_PASSWORD`, `TEST_DRIVER_EMAIL`, `TEST_DRIVER_PASSWORD`, sau đó
khởi tạo hoặc cập nhật hai tài khoản test:

```powershell
npm --prefix apps/backend run setup:test-users
```

### 4. Kiểm tra cấu hình và khởi động

```powershell
docker compose config --quiet
docker compose up --build --wait
```

### 5. Kiểm tra service

| Thành phần | Địa chỉ | Kiểm tra |
|---|---|---|
| Frontend | http://localhost:5173 | `GET /` |
| Trang đăng nhập | http://localhost:5173/login | Supabase Auth |
| Operator Console | http://localhost:5173/operator | Role `OPERATOR` |
| Driver App | http://localhost:5173/driver | Role `DRIVER` |
| Backend API | http://localhost:3000/api/v1 | `/health/live`, `/health/ready` |
| Swagger | http://localhost:3000/docs | API contract |
| AI service | http://localhost:8000 | `/health` |

Kiểm tra nhanh:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:3000/api/v1/health/live
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
```

Xem log hoặc dừng stack:

```powershell
docker compose logs -f ai backend frontend
docker compose down
```

`docker-compose.yml` phục vụ phát triển và kiểm thử tích hợp local; không dùng
nguyên trạng làm cấu hình production.

## Cấu hình biến môi trường

### Nguyên tắc

- Không commit file `.env` đã điền giá trị thật.
- Chỉ key public/publishable được đặt dưới biến có tiền tố `VITE_`.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ được sử dụng trong backend.
- Biến `VITE_*` có thể xuất hiện trong bundle và được đọc bởi trình duyệt.
- Ngưỡng nghiệp vụ chỉ nằm trong `apps/ai/config/policy.yaml`, không nhân bản
  sang `.env`.

### AI service — `apps/ai/.env`

Tạo file khi chạy AI ngoài Compose:

```powershell
Copy-Item apps/ai/.env.example apps/ai/.env
```

| Biến | Mặc định/mẫu | Ý nghĩa |
|---|---|---|
| `APP_ENV` | `development` | Môi trường `development`, `production` hoặc `test` |
| `APP_HOST` | `0.0.0.0` | Host FastAPI |
| `APP_PORT` | `8000` | Cổng FastAPI |
| `LOG_LEVEL` | `INFO` | Mức log |
| `MODEL_VERSION` | `lgbm_quantile_v1` | Phải khớp model manifest |
| `POLICY_PATH` | tùy chọn | Override đường dẫn policy |
| `ZONE_REGISTRY_PATH` | tùy chọn | Override zone registry |
| `DRIVER_REGISTRY_PATH` | tùy chọn | Override driver registry |
| `HISTORY_DB_PATH` | tùy chọn | Override history database |

### Backend — `apps/backend/.env`

| Biến | Mặc định/mẫu | Bảo mật | Ý nghĩa |
|---|---|---|---|
| `NODE_ENV` | `development` | Public | Môi trường Node |
| `PORT` | `3000` | Public | Cổng API |
| `CORS_ORIGINS` | `http://localhost:5173` | Public | Danh sách origin, phân cách bằng dấu phẩy |
| `AI_SERVICE_URL` | `http://localhost:8000` | Internal | Địa chỉ AI service |
| `SUPABASE_URL` | URL project | Public | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | publishable key | Public | Xác thực token phía server |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key | **Secret** | Truy cập DB đặc quyền; chỉ backend |
| `TEST_OPERATOR_EMAIL` | email test | Sensitive | Tài khoản smoke test operator |
| `TEST_OPERATOR_PASSWORD` | password test | **Secret** | Mật khẩu test operator |
| `TEST_DRIVER_EMAIL` | email test | Sensitive | Tài khoản smoke test driver |
| `TEST_DRIVER_PASSWORD` | password test | **Secret** | Mật khẩu test driver |
| `CAMPAIGN_LIFECYCLE_ENABLED` | `true` | Internal | Bật reconciler campaign/offer |
| `CAMPAIGN_LIFECYCLE_INTERVAL_MS` | `30000` | Internal | Chu kỳ reconciler |
| `SIMULATION_WRITE_ENABLED` | `false` | Internal | Cho phép ghi dữ liệu mô phỏng |
| `OPERATOR_DISPATCH_ENABLED` | `false` | Internal | Bật phát hành dispatch |
| `OPERATOR_ACTIVATION_ENABLED` | `true` | Internal | Bật campaign/offer |
| `OPERATOR_SETTLEMENT_ENABLED` | `false` | Internal | Bật settlement |

### Frontend — `apps/frontend/.env`

| Biến | Mặc định/mẫu | Ý nghĩa |
|---|---|---|
| `VITE_DATA_SOURCE` | `api` | `api` dùng backend thật; `mock` dùng dữ liệu UI local |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Base URL backend |
| `VITE_SUPABASE_URL` | URL project | Supabase Auth URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable key | Key public cho đăng nhập |
| `VITE_MAPBOX_ACCESS_TOKEN` | `pk...` | Public Mapbox token |
| `VITE_DEMO_MODE` | `false` | Cờ demo UI |

`apps/frontend/.env.local` là override tùy chọn trên máy phát triển. Compose
không truyền `apps/backend/.env` vào frontend nên service-role key không đi vào
process Vite.

### Root `.env`

Root `.env` chỉ phục vụ hook nhật ký AI và một số công cụ ở cấp repository. Tạo
từ [`.env.example`](.env.example), không dùng nó thay cho file cấu hình riêng
của backend/frontend.

## Chạy từng service khi phát triển

### AI service

Từ thư mục gốc:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r apps/ai/requirements.txt

Set-Location apps/ai
..\..\.venv\Scripts\python.exe -m uvicorn src.main:app --host 0.0.0.0 --port 8000
```

### Backend

```powershell
Set-Location apps/backend
Copy-Item .env.example .env
npm ci
npm run start:dev
```

Swagger: http://localhost:3000/docs

### Frontend

```powershell
Set-Location apps/frontend
Copy-Item .env.example .env
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Đặt `VITE_DATA_SOURCE=mock` để phát triển UI độc lập hoặc `api` để dùng full
stack.

## Sample queries

### 1. Health check không cần token

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:3000/api/v1/health
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
```

### 2. Lấy snapshot replay và chạy model

```powershell
$sourceAt = '2026-09-25T08:35:00+07:00'

$snapshot = Invoke-RestMethod -Method Post `
  -Uri http://localhost:8000/api/v1/datasets/snapshots/at `
  -ContentType 'application/json' `
  -Body (@{ source_at = $sourceAt } | ConvertTo-Json)

$decisionBody = @{
  snapshot_id = 'readme-sample-0835'
  t = $sourceAt
  horizon_min = 5
  data_source = "replay:$sourceAt"
  replay_source_at = $sourceAt
  zones = $snapshot.zones
} | ConvertTo-Json -Depth 8

$decision = Invoke-RestMethod -Method Post `
  -Uri http://localhost:8000/api/v1/decisions `
  -ContentType 'application/json' `
  -Body $decisionBody

$decision.forecast
$decision.plan.moves
$decision.activation_recommendation
```

### 3. Đăng nhập Supabase để lấy operator access token

Điền các giá trị tương ứng từ `apps/backend/.env` vào terminal hiện tại:

```powershell
$env:SUPABASE_URL = 'https://your-project.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'your-publishable-key'
$env:TEST_OPERATOR_EMAIL = 'operator.test@example.com'
$env:TEST_OPERATOR_PASSWORD = 'your-test-password'

$authHeaders = @{
  apikey = $env:SUPABASE_PUBLISHABLE_KEY
  'Content-Type' = 'application/json'
}

$authBody = @{
  email = $env:TEST_OPERATOR_EMAIL
  password = $env:TEST_OPERATOR_PASSWORD
} | ConvertTo-Json

$auth = Invoke-RestMethod -Method Post `
  -Uri "$env:SUPABASE_URL/auth/v1/token?grant_type=password" `
  -Headers $authHeaders `
  -Body $authBody

$env:OPERATOR_ACCESS_TOKEN = $auth.access_token
$headers = @{ Authorization = "Bearer $env:OPERATOR_ACCESS_TOKEN" }
```

### 4. Đọc dữ liệu vận hành qua backend

```powershell
$api = 'http://localhost:3000/api/v1'

Invoke-RestMethod "$api/auth/me" -Headers $headers
Invoke-RestMethod "$api/operator/capabilities" -Headers $headers
Invoke-RestMethod "$api/operator/snapshots/latest" -Headers $headers
Invoke-RestMethod "$api/operator/proposals" -Headers $headers
Invoke-RestMethod "$api/operator/campaigns" -Headers $headers
Invoke-RestMethod "$api/operator/offers" -Headers $headers
Invoke-RestMethod "$api/operator/audit?pageSize=10" -Headers $headers
```

### 5. Ví dụ mutation có tác động dữ liệu

> Các lệnh dưới đây thay đổi trạng thái thật trong Supabase. Chỉ chạy bằng tài
> khoản test và proposal hợp lệ, còn hạn.

```powershell
$proposalId = '<proposal-uuid>'
$expectedVersion = 1

Invoke-RestMethod -Method Post `
  -Uri "$api/operator/proposals/$proposalId/approve" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ expectedVersion = $expectedVersion; note = 'Đã kiểm tra policy và ngân sách.' } | ConvertTo-Json)

Invoke-RestMethod -Method Post `
  -Uri "$api/operator/proposals/$proposalId/activate" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ responseMode = 'human' } | ConvertTo-Json)
```

Approval không tự phát offer. Activation là bước xác nhận riêng và chỉ thành
công khi proposal đã duyệt, còn hạn, hash/version còn khớp và không xung đột
với execution đang hoạt động.

## Eval evidence

- [Bằng chứng kiểm thử thủ công](eval/manual_test_cases.md): năm test case, quy
  trình, output thực tế và kết quả PASS/FAIL.
- [Decision-flow acceptance evidence](eval/decision_flow_evidence.md): bảng
  kết quả model cho replay 5/10/15 phút.
- Script tái lập: `apps/ai/eval_decision_flow.py`.

Chạy lại evidence:

```powershell
Set-Location apps/ai
$env:PYTHONPATH='.'
..\..\.venv\Scripts\python.exe eval_decision_flow.py
```

Kết quả chuẩn hiện tại: **5/5 test case PASS**. Activation trong evidence là
giá trị kỳ vọng của model, chưa phải số tài xế chấp nhận ngoài thực tế.

## Kiểm thử và quality gates

### AI

```powershell
.\.venv\Scripts\python.exe -m ruff check apps/ai/src apps/ai/tests
.\.venv\Scripts\python.exe -m mypy --config-file apps/ai/pyproject.toml apps/ai/src
.\.venv\Scripts\python.exe -m pytest -q apps/ai/tests
```

### Backend

```powershell
npm --prefix apps/backend run typecheck
npm --prefix apps/backend test
npm --prefix apps/backend run build
```

Hoặc chạy toàn bộ backend gate:

```powershell
npm --prefix apps/backend run check
```

### Frontend

```powershell
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run test
npm --prefix apps/frontend run build
```

Hoặc:

```powershell
npm --prefix apps/frontend run check
```

### Full repository

```powershell
make check
docker compose config --quiet
```

Các smoke test `check:live`, `smoke:api`, `smoke:campaign`, `smoke:dispatch` và
`smoke:security` truy cập Supabase thật. Chỉ chạy với `.env.test.local`, tài
khoản test và database được phép ghi.

GitHub Actions chạy các nhóm AI, backend, frontend và compose độc lập. Workflow
phải pass trước khi merge vào `main`.

## Triển khai

- Backend: `.github/workflows/deploy-backend.yml` build image và deploy Cloud Run.
- AI service: `.github/workflows/deploy-ai.yml` build image và deploy Cloud Run.
- Frontend: `.github/workflows/deploy-frontend.yml` chạy quality gate, build
  prebuilt artifact và deploy lên Vercel.
- Push thay đổi tương ứng vào `main` sẽ kích hoạt workflow theo path filter.

Frontend cần có các GitHub Actions secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` và
`VERCEL_PROJECT_ID`. Các biến public như `VITE_API_BASE_URL`,
`VITE_MAPBOX_ACCESS_TOKEN` và Supabase publishable key phải được khai báo trong
Vercel ở môi trường Production; không đưa secret vào repository.

Sau deploy, kiểm tra tối thiểu:

```powershell
Invoke-RestMethod <backend-url>/api/v1/health/ready
Invoke-RestMethod <ai-url>/health
```

Không lưu secret trong image hoặc workflow. Dùng secret store của GitHub,
Cloud Run hoặc Vercel.

## Xử lý sự cố thường gặp

### `docker compose config` thất bại

Kiểm tra đã tạo `apps/backend/.env` và `apps/frontend/.env` từ template.

### AI trả `503`

Kiểm tra `MODEL_VERSION`, policy, replay dataset, model manifest và đủ model
artifact. AI cố ý fail fast nếu bundle không xác minh được.

### Backend readiness không đạt

Kiểm tra `SUPABASE_URL`, service-role key, network và migration/schema hiện tại.

### Frontend không gọi được API

Kiểm tra `VITE_API_BASE_URL`, `CORS_ORIGINS`, trạng thái backend và tab Network
của trình duyệt.

### API trả `401` hoặc `403`

Access token đã hết hạn, user chưa có profile hợp lệ hoặc role không đúng với
endpoint `OPERATOR`/`DRIVER`.

### Phát hành offer trả `409`

Kiểm tra proposal còn hạn, đã được duyệt, chưa có campaign, hash/version duyệt
còn khớp và không có execution khác đang hoạt động. Dùng `requestId` trong lỗi
để truy log backend.

### Port đã được sử dụng

Kiểm tra process đang giữ `5173`, `3000`, `8000`, hoặc đổi port trong cấu hình
local tương ứng.

## Bảo mật và vận hành

- Không commit `.env`, access token, service-role key hoặc password test.
- Chỉ frontend được dùng Supabase publishable key; backend giữ service-role key.
- RLS và RPC database là lớp bảo vệ bắt buộc, không ghi trực tiếp business table
  từ frontend.
- Mọi mutation quan trọng phải đi qua backend, có request ID và audit.
- Rate limit hiện dùng storage trong process; chỉ chạy một backend replica cho
  tới khi có shared throttler storage.
- Backup và verify dữ liệu quan trọng trước migration hoặc release rủi ro cao.
- Rollback ứng dụng bằng image trước đó; sửa DB bằng migration forward mới.

Tài liệu liên quan:

- [Production Runbook](docs/PRODUCTION_RUNBOOK.md)
- [Backend–Frontend Integration Checklist](docs/BACKEND_FRONTEND_INTEGRATION_CHECKLIST.md)
- [DB First Hardening Checklist](docs/DB_FIRST_HARDENING_CHECKLIST.md)
- [Product Specification](skill/SPEC-GSM14-NovaFour-Unified.md)

## Nhật ký AI

Hook repository ghi hoạt động AI vào `.ai-log/session.jsonl` và gửi khi
`git push`. Không sửa dữ liệu `.ai-log`, không chạy tay hook và không dùng
`--no-verify`.

Cài hook sau khi clone:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1
```

Cấu hình `AI_LOG_SERVER` và `AI_LOG_API_KEY` trong root `.env`; không commit
khóa ingest.
