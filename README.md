<<<<<<< HEAD
# GSM-14 · NovaFour — Phân bổ xe giờ cao điểm

> Mưa đổ lúc 17:30, nhu cầu gọi xe dồn về vài quận trong khi xe rảnh nằm ở quận khác. Hệ thống này dự báo lệch cung–cầu trước 15–30 phút, đề xuất phương án điều chuyển cho người điều phối duyệt, và huy động thêm tài xế đang rảnh/offline khi điều chuyển vẫn chưa đủ.

Dự án VinUni AI20K Build Phase. **Đây là pipeline mô phỏng deterministic, không phải chat agent** — không có LLM trong luồng chính, mọi con số là simulation proxy trên dữ liệu synthetic.

---

## Trạng thái: skeleton

Hạ tầng đã dựng xong (cấu trúc package, lint, type-check, test, CI, `/health`). **Chưa có logic nghiệp vụ** — xem [IMPLEMENTATION_PLAN.md](docs/design/IMPLEMENTATION_PLAN.md) để biết task nào làm gì.

`GET /health` hiện trả **503** vì `config/policy.yaml` chưa tồn tại. Đây là hành vi đúng theo [API_CONTRACT.md §8.2](docs/design/API_CONTRACT.md#82-get-health), không phải lỗi: thiếu ngưỡng mà vẫn chạy sẽ cho ra KPI sai mà không ai biết. Endpoint chuyển sang 200 sau khi task **T0.1** tạo đủ 19 key.

---

## Chạy dự án

```powershell
# 1. Môi trường ảo (đã có sẵn tại .venv)
.\.venv\Scripts\Activate.ps1

# 2. Cài dependency
pip install -r requirements.txt

# 3. Biến môi trường
copy .env.example .env

# 4. Chạy API
uvicorn src.main:app --reload --port 8000
```

- Swagger UI: <http://localhost:8000/docs>
- Healthcheck: <http://localhost:8000/health>

Docker:

```powershell
docker compose up --build
```

---

## Kiểm tra chất lượng

Bốn lệnh dưới đây chính là bốn bước CI chạy — chạy được ở máy thì CI xanh.

```powershell
ruff check src/ tests/            # lint
ruff format --check src/ tests/   # format
mypy                              # type-check (đọc cấu hình từ pyproject.toml)
pytest tests/ -v                  # test
```

Chạy một file hoặc một test:

```powershell
pytest tests/test_api/test_health.py -v
pytest -k "health" -v
```

---

## Kiến trúc

```
Replay Engine → Khối A: Forecasting (p10/p50/p90)
                    ↓
              Khối B: Hotspot → Optimizer → Simulator → Explanation → người duyệt
                    ↓ residual gap
              Khối C: Activation Engine → Driver App
                    ↓ tài xế bấm Nhận
              enroute_supply tăng → Simulator tính lại (vòng phản hồi đóng)
```

Ba kịch bản luôn được so cạnh nhau: `no_action` / `plan_only` / `plan_activation`.

Chi tiết: [ARCHITECTURE.md](docs/design/ARCHITECTURE.md).

### Cây thư mục

| Thư mục | Vai trò | Task |
|---|---|---|
| `src/common/` | regime · haversine · policy loader · ids · errors — tầng L0, không import ngược | T0.1–T0.3 |
| `src/contracts/` | 9 Pydantic model §4.1–4.9 | T0.7 |
| `src/replay/` | phát lại snapshot 5 phút/step | T0.4 |
| `src/forecasting/` | Model 1 — LightGBM quantile + baseline trung bình lịch sử | T1 |
| `src/hotspot/` | Model 2 — phát hiện hotspot + hysteresis | T2 |
| `src/optimizer/` | Model 3 — greedy theo severity | T3 |
| `src/simulation/` | `metrics.py` (lõi công thức dùng chung) + `simulator.py` | T0.3, T4 |
| `src/explanation/` | giải thích Lớp 1 bằng template | T5 |
| `src/activation/` | Khối C — chọn ứng viên, incentive, mô phỏng phản hồi | T7 |
| `src/history/` | History Store SQLite append-only | T6 |
| `src/api/` | router HTTP — tầng duy nhất dùng async | T0.7+ |
| `frontend/` | SPA Vite + React + TS, build tĩnh do FastAPI phục vụ | T8 |

---

## Tài liệu

| File | Dùng khi |
|---|---|
| [CLAUDE.md](CLAUDE.md) | **Đọc trước tiên** — luật bắt buộc cho mọi phiên code (kể cả AI) |
| [docs/SPEC-GSM14-NovaFour-Unified.md](docs/SPEC-GSM14-NovaFour-Unified.md) | Nguồn sự thật về nghiệp vụ |
| [ARCHITECTURE.md](docs/design/ARCHITECTURE.md) | Sơ đồ component, luồng end-to-end, dependency |
| [API_CONTRACT.md](docs/design/API_CONTRACT.md) | 23 endpoint, schema, mã lỗi |
| [DATA_CONTRACT.md](docs/design/DATA_CONTRACT.md) | 9 entity, DDL, 19 key policy, ASSUMPTION register |
| [AGENT_WORKFLOW.md](docs/design/AGENT_WORKFLOW.md) | State machine, router, fallback, cổng người duyệt |
| [IMPLEMENTATION_PLAN.md](docs/design/IMPLEMENTATION_PLAN.md) | Task T0.1–T11 + Acceptance Criteria |
| [EVALUATION_PLAN.md](docs/design/EVALUATION_PLAN.md) | Cách đo, 19 KPI, failure case |

---

## Ràng buộc không được phá

Bốn điều dưới đây không phải quy ước style — phá là kết quả dự án mất hiệu lực.

1. **`config/policy.yaml` là nguồn ngưỡng duy nhất** (19 key). Cấm hard-code ngưỡng trong code.
2. **`src/simulation/metrics.py` là nguồn công thức duy nhất.** Baseline và Simulator phải import cùng module này; cài lại công thức lần hai làm mọi so sánh KPI vô nghĩa.
3. **Hai cổng người duyệt tách biệt**: duyệt plan ≠ xác nhận phát hành offer. Approve plan **không** tự gửi cam kết tiền thưởng cho tài xế.
4. **Tài xế luôn được từ chối** — một chạm, không cần lý do, không chấm điểm, không xếp hạng, không chế tài.

---

## Nhật ký AI (deliverable #4)

Hook tự ghi prompt vào `.ai-log/session.jsonl` và tự nộp khi `git push`. **Không** chạy tay `scripts/log_hook.py`, **không** sửa file trong `.ai-log/`, **không** dùng `--no-verify`. Cài hook một lần sau khi clone:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1
```
=======
# GSM-14 NovaFour

GSM-14 NovaFour là hệ thống mô phỏng hỗ trợ điều phối cung–cầu tài xế theo vùng. Hệ thống phát lại snapshot 5 phút, dự báo cung/cầu cho 30 zone, phát hiện hotspot, đề xuất điều chuyển, đưa quyết định qua bước duyệt của operator, rồi theo dõi chiến dịch và phản hồi offer từ Driver App.

Đây là sản phẩm mô phỏng/decision-support. Dữ liệu replay và các KPI activation không phải bằng chứng về tác động kinh doanh ngoài thực tế.

Kiến trúc hiện tại gồm React/Vite, NestJS, FastAPI/LightGBM và Supabase/PostgreSQL. Xem [ARCHITECTURE.md](ARCHITECTURE.md) để biết luồng dữ liệu và trust boundary.

## Mục lục nhanh

- [Chạy full stack](#chạy-full-stack-từ-clean-clone)
- [Chạy từng workspace](#chạy-và-kiểm-tra-từng-workspace)
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
>>>>>>> refactor/reorganize-project-structure
