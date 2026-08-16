# GSM-14 NovaFour

GSM-14 NovaFour là hệ thống mô phỏng hỗ trợ điều phối cung–cầu tài xế theo vùng. Hệ thống phát lại snapshot 5 phút, dự báo cung/cầu cho 30 zone, phát hiện hotspot, đề xuất điều chuyển, đưa quyết định qua bước duyệt của operator, rồi theo dõi chiến dịch và phản hồi offer từ Driver App.

Đây là sản phẩm mô phỏng/decision-support. Dữ liệu replay và các KPI activation không phải bằng chứng về tác động kinh doanh ngoài thực tế.

Kiến trúc hiện tại gồm React/Vite, NestJS, FastAPI/LightGBM và Supabase/PostgreSQL. Xem [ARCHITECTURE.md](ARCHITECTURE.md) để biết luồng dữ liệu và trust boundary.

## Mục lục nhanh

- [Chạy full stack](#chạy-full-stack-từ-clean-clone)
- [Chạy từng workspace](#chạy-và-kiểm-tra-từng-workspace)
- [Biến môi trường](#biến-môi-trường)
- [Sample queries](#sample-queries)
- [Eval evidence](#eval-evidence)
- [Cấu trúc và mô tả file](#cấu-trúc-và-mô-tả-file)
- [CI và quality gates](#ci-và-quality-gates)
- [Vận hành và bảo mật](#vận-hành-và-bảo-mật)

## Chạy full stack từ clean clone

Yêu cầu:

- Docker Engine/Desktop có Docker Compose 2.24 trở lên.
- Một Supabase project đã áp dụng các migration trong `apps/backend/supabase/migrations/` theo thứ tự tên file.
- Các cổng local `5173`, `3000` và `8000` đang trống.

Tạo file cấu hình local từ các template. Các file đích đã được Git-ignore và không được commit:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env
Copy-Item apps/frontend/.env.example apps/frontend/.env
```

Tương đương trên bash:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Điền ít nhất các biến sau:

| File | Biến | Ghi chú |
|---|---|---|
| `apps/backend/.env` | `SUPABASE_URL` | URL project Supabase |
| `apps/backend/.env` | `SUPABASE_SERVICE_ROLE_KEY` | Secret phía server; tuyệt đối không đặt dưới `apps/frontend/` |
| `apps/frontend/.env` | `VITE_SUPABASE_URL` | URL public dùng cho Supabase Auth |
| `apps/frontend/.env` | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key; mọi biến `VITE_*` đều có thể xuất hiện trong bundle trình duyệt |
| `apps/frontend/.env` | `VITE_MAPBOX_ACCESS_TOKEN` | Public token; có thể bỏ trống nếu không cần nền bản đồ Mapbox |

`apps/frontend/.env.local` là override tùy chọn cho máy phát triển và không bắt buộc trong clean clone. Compose không đọc `apps/backend/.env` vào frontend, vì vậy service-role key không đi vào process Vite.

Kiểm tra cấu hình rồi khởi động:

```powershell
docker compose config --quiet
docker compose up --build --wait
```

Các địa chỉ local:

| Thành phần | URL | Health/readiness |
|---|---|---|
| Frontend | http://localhost:5173 | `GET /` |
| Backend API | http://localhost:3000/api/v1 | `/health/live`, `/health/ready`, `/health/metrics` |
| Swagger | http://localhost:3000/docs | — |
| AI inference | http://localhost:8000 | `/health` |

## Biến môi trường

Không commit `.env`. Copy các template rồi chỉ thay giá trị trên máy hoặc secret store của môi trường deploy:

| Service | Template | Biến runtime |
|---|---|---|
| AI | [`apps/ai/.env.example`](apps/ai/.env.example) | `APP_ENV`, `APP_HOST`, `APP_PORT`, `LOG_LEVEL`, `MODEL_VERSION`; các path `POLICY_PATH`, `ZONE_REGISTRY_PATH`, `DRIVER_REGISTRY_PATH`, `HISTORY_DB_PATH` là tùy chọn |
| Backend | [`apps/backend/.env.example`](apps/backend/.env.example) | `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `AI_SERVICE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, các tài khoản test và feature flag vận hành |
| Frontend | [`apps/frontend/.env.example`](apps/frontend/.env.example) | `VITE_DATA_SOURCE`, `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_MAPBOX_ACCESS_TOKEN`, `VITE_DEMO_MODE` |
| AI logging hook | [`.env.example`](.env.example) | `AI_LOG_SERVER`, `AI_LOG_API_KEY`, `AI_LOG_DIR` |

Các ngưỡng nghiệp vụ như bán kính điều chuyển, nguồn dự trữ, budget, incentive và acceptance rate chỉ nằm trong [`apps/ai/config/policy.yaml`](apps/ai/config/policy.yaml), không nhân bản sang `.env`.

## Sample queries

Health check không cần token:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:3000/api/v1/health/ready
```

Đọc một bucket replay thật, sau đó chạy model cho 5 phút tới:

```powershell
$sourceAt = '2026-09-25T08:35:00+07:00'
$snapshot = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/datasets/snapshots/at `
  -ContentType 'application/json' -Body (@{ source_at = $sourceAt } | ConvertTo-Json)

$decisionBody = @{
  snapshot_id = 'readme-sample-0835'
  t = $sourceAt
  horizon_min = 5
  data_source = "replay:$sourceAt"
  replay_source_at = $sourceAt
  zones = $snapshot.zones
} | ConvertTo-Json -Depth 8

$decision = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/decisions `
  -ContentType 'application/json' -Body $decisionBody
$decision.plan.moves
$decision.activation_recommendation
```

Đọc capability và snapshot vận hành qua backend. Các endpoint operator cần Supabase access token hợp lệ:

```powershell
$headers = @{ Authorization = "Bearer $env:OPERATOR_ACCESS_TOKEN" }
Invoke-RestMethod http://localhost:3000/api/v1/operator/capabilities -Headers $headers
Invoke-RestMethod http://localhost:3000/api/v1/operator/snapshots/latest -Headers $headers
```

Swagger tại `http://localhost:3000/docs` mô tả toàn bộ request/response của backend.

## Eval evidence

[`eval/decision_flow_evidence.md`](eval/decision_flow_evidence.md) lưu năm acceptance case với output model thực tế cho replay 5/10/15 phút. Có thể tái tạo JSON evidence mà không sửa model bằng:

```powershell
Set-Location apps/ai
$env:PYTHONPATH='.'
./.venv/Scripts/python.exe eval_decision_flow.py
```

Compose cố ý fail fast:

- Thiếu `apps/backend/.env` hoặc `apps/frontend/.env` làm `docker compose config` thất bại.
- Backend chỉ healthy khi truy vấn readiness tới Supabase thành công; frontend chờ trạng thái này trước khi start.
- AI trả `503` nếu policy, replay snapshot, manifest hoặc đủ 18 model artifact không xác minh được; backend chờ AI healthy.

Xem log hoặc dừng stack:

```powershell
docker compose logs -f ai backend frontend
docker compose down
```

`docker-compose.yml` là stack tích hợp local. Nó bind các cổng vào `127.0.0.1` và chạy Vite dev server; không dùng nguyên trạng làm cấu hình production.

## Chạy và kiểm tra từng workspace

### AI service

```powershell
Set-Location apps/ai
python -m venv .venv
./.venv/Scripts/python -m pip install -r requirements.txt
./.venv/Scripts/python -m pytest -q
./.venv/Scripts/python -m uvicorn src.main:app --host 0.0.0.0 --port 8000
```

Copy `apps/ai/.env.example` thành `apps/ai/.env` nếu chạy ngoài Compose. `MODEL_VERSION` phải khớp manifest của model bundle.

### Backend

```powershell
Set-Location apps/backend
npm ci
npm run check
npm run start:dev
```

Các smoke test có hậu tố `:live` hoặc dùng `--env-file=.env.test.local` sẽ truy cập Supabase thật và cần tài khoản test riêng. Xem [apps/backend/README.md](apps/backend/README.md).

### Frontend

```powershell
Set-Location apps/frontend
npm ci
npm run check
npm run dev -- --host 127.0.0.1 --port 5173
```

Đặt `VITE_DATA_SOURCE=mock` để phát triển không cần backend, hoặc `api` để dùng full stack.

### Legacy starter scaffold

`legacy/ai20k-template/` là scaffold Python AI20K cũ, được tách khỏi product runtime. Product runtime nằm trong `apps/ai/`, `apps/backend/` và `apps/frontend/`.

```powershell
Set-Location legacy/ai20k-template
python -m pytest -q
ruff check src tests
```

## CI và quality gates

GitHub Actions chạy độc lập bốn nhóm kiểm tra:

- Root scaffold: Ruff và pytest.
- AI: Ruff, mypy và pytest.
- Backend: typecheck, Jest và production build qua `npm run check`.
- Frontend: Oxlint, Vitest và production build qua `npm run check`.
- Compose: materialize các template không chứa secret và chạy `docker compose config --quiet`.

## Cấu trúc và mô tả file

```text
apps/ai/                    FastAPI inference, replay, model và policy
apps/backend/               NestJS API, Supabase integration và migrations
apps/frontend/              React/Vite Operator Console và Driver App
docs/                       Runbook, checklist và tài liệu kỹ thuật
skill/                      Product/domain specification
eval/                       Kết quả đánh giá model và báo cáo replay
legacy/                     Starter scaffold cũ, không thuộc product runtime
scripts/                    Script setup, logging và hỗ trợ phát triển
docker-compose.yml          Local integration stack
Makefile                    Lệnh kiểm tra tổng hợp cho các workspace
ARCHITECTURE.md             Kiến trúc, data flow và trust boundary
.github/workflows/ci.yml    CI quality gates
```

Các file cấu hình quan trọng:

- `apps/ai/requirements.txt`: dependency Python của AI service; `apps/ai/ruff.toml` và `apps/ai/pyproject.toml` chứa cấu hình lint, test và mypy.
- `apps/backend/package.json`: script NestJS, typecheck, Jest, build và các smoke test; `package-lock.json` khóa phiên bản dependency.
- `apps/frontend/package.json`: script Vite, Oxlint, Vitest và build production; `package-lock.json` khóa phiên bản dependency.
- `apps/backend/supabase/migrations/`: migration PostgreSQL/Supabase, áp dụng theo thứ tự tên file.
- `apps/*/.env.example`: template biến môi trường. Tạo `.env` local từ template; không commit secret.
- `docker-compose.yml`: stack tích hợp local gồm AI, backend và frontend; phục vụ phát triển và kiểm thử tích hợp, không phải cấu hình production.
- `.gitignore`: loại file hệ thống, cache, log, dependency và artifact local khỏi Git.

`runs/`, `.ai-log/`, cache Python/Node và các file `.env` local là dữ liệu sinh trong quá trình phát triển. Chúng được bỏ qua bởi `.gitignore`; các artifact đánh giá có giá trị chia sẻ nên đặt trong `eval/` và commit có chủ đích.

## Vận hành và bảo mật

- Inject secret ở runtime; không bake secret vào image và không commit `.env`.
- Chỉ publishable/anon key được phép có tiền tố `VITE_`; service-role key chỉ tồn tại ở backend.
- Rate limit mutation hiện dùng storage trong process. Chạy một backend replica cho tới khi có shared throttler storage.
- Migration là forward-only; rollback ứng dụng bằng image trước đó và sửa schema bằng migration mới.
- Trước production, thực hiện backup/restore drill và các bước trong [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md).

Tài liệu liên quan: [architecture diagram](docs/architecture_diagram.md), [integration checklist](docs/BACKEND_FRONTEND_INTEGRATION_CHECKLIST.md), [database hardening checklist](docs/DB_FIRST_HARDENING_CHECKLIST.md), và [product specification](skill/SPEC-GSM14-NovaFour-Unified.md).

## Nhật ký AI

Hook tự ghi hoạt động AI vào `.ai-log/session.jsonl` và nộp khi `git push`. Không chạy tay script hook, không sửa dữ liệu trong `.ai-log/`, không dùng `--no-verify`.

Cài hook sau khi clone:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1
```

Cấu hình `AI_LOG_SERVER` và `AI_LOG_API_KEY` trong file `.env` local; không commit khóa ingest.
