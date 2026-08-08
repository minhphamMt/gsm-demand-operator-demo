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
