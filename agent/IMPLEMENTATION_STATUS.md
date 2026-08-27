# Trạng thái triển khai — nâng cấp multi-agent

**Cập nhật:** 23/08/2026 · **Nhánh:** `feat/multi-agent-orchestration` · **Chưa commit**

> Đây **không phải tài liệu thiết kế**. Bộ thiết kế là `00`–`06` trong cùng thư mục. File này
> ghi việc đã làm, đã kiểm chứng bằng gì, và chỗ nào còn là giả định — để theo dõi tiến độ
> mà không phải đọc diff.

---

## 1. Chín quyết định đã chốt

Ghi lại vì chúng giải thích mọi lệch pha giữa code và bộ tài liệu `00`–`06`.

| # | Quyết định | Hệ quả |
|---|---|---|
| 1 | **LangGraph được dùng** | Đảo ngược quyết định PM 2026-08-04. Đã sửa lệnh cấm ở `CLAUDE.md` §2/§6/§10.1, `AGENTS.md`, `docs/design/ARCHITECTURE.md` §1/§8/§9 |
| 2 | **Ranh giới**: LangGraph chỉ điều phối tầng phân tích trong `apps/ai` | NestJS giữ nguyên HITL, campaign, offer, audit, Supabase. Đồ thị kết thúc ở `PROPOSED` |
| 3 | **Phạm vi**: R1 + R2 | Không làm R3 (automation grant / conditional_auto) |
| 4 | **PLAN A/B/C**: `BALANCED` = hành vi cũ nguyên vẹn | Không phải tính lại baseline hay KPI đã công bố |
| 5 | **Agent tự chủ thật** — LLM chọn tool trong allowlist | Guardrail deterministic có quyền phủ quyết |
| 6 | **Hai chế độ** `llm_routing_enabled` | `false` (mặc định) cho eval/CI/baseline; `true` cho demo |
| 7 | **LLM qua OpenRouter, giao thức OpenAI-compatible, dùng `httpx`** | Không thêm SDK nhà cung cấp nào. Đổi model = đổi biến env |
| 8 | **Model theo vai trò** | Gemini Flash cho phân tích, Claude Haiku 4.5 cho diễn giải |
| 9 | **Theme giữ light** | Chỉ Wall Board (nếu làm) mới dùng dark |

---

## 2. Tiến độ theo phase

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Gỡ lệnh cấm, dependency, config | ✅ Xong |
| 1 (R1) | Đồ thị chạy shadow, khớp `/decisions` | ✅ Xong · parity byte-identical |
| 2 (R2a) | PLAN A/B/C + báo hội tụ | ✅ Xong |
| 3 (R2b) | Agent LLM tự chủ | ✅ Xong · **đã chạy với gateway thật** |
| 4 (R2c) | UI 5 thẻ agent + 3 plan | ⬜ Chưa bắt đầu |
| 5 | Wall Board dark (tùy chọn) | ⬜ Chưa bắt đầu |

### Phase 0 — nền

- `requirements.txt`: thêm **duy nhất** `langgraph>=1.2,<2`. `httpx` chuyển từ mục dev sang runtime.
- `src/config.py` + `.env.example`: 7 biến `LLM_*`, khoá để trống.
- Tắt telemetry `langsmith` tường minh (đi kèm `langgraph`; repo cấm gọi API ra ngoài).

### Phase 1 (R1) — đồ thị

Thư mục mới `apps/ai/src/orchestration/`:

| File | Vai trò |
|---|---|
| `steps.py` | Bước tính thuần, **dùng chung** cho `/decisions` và đồ thị |
| `graph.py` | 9 node LangGraph + hàm chấm điểm |
| `state.py` | `PipelineState`, trạng thái agent, reducer |
| `prompts.py` | System prompt 3 agent |
| `tools/registry.py` | Registry + allowlist |
| `tools/decision_tools.py` | 6 tool bọc quanh code số học |
| `agents/client.py` | Client httpx tới gateway |
| `agents/runner.py` | Vòng lặp tool-use + đường deterministic |

Endpoint: `POST /api/v1/runs` · `GET /api/v1/runs/{id}` · `GET /api/v1/llm/health`

### Phase 2 (R2a) — ba phương án

Chỉ đổi **pha 2** của MILP trong `optimizer/greedy.py`. Pha 1 (tối đa số xe phủ) dùng chung
cho cả ba → ba plan luôn điều đúng cùng một lượng xe, nên so sánh được với nhau.

### Phase 3 (R2b) — agent LLM

Ba agent gọi LLM: Situation Assessment, Dispatch, Explanation. Vòng lặp tool-use tự viết
trên `chat/completions`. Mọi lỗi LLM rơi về đường deterministic.

---

## 3. Đã kiểm chứng bằng gì

| Kiểm tra | Kết quả |
|---|---|
| `ruff check src tests` | xanh |
| `mypy src` (54 file) | xanh |
| `pytest` | **65 passed** (30 cũ + 35 mới), 17 giây |
| Parity: đồ thị vs `POST /decisions` | payload **bằng nhau tuyệt đối**, 3 kịch bản replay |
| `eval_decision_flow.py` | 8/9 PASS, output **byte-identical** với trước khi bắt đầu |
| Preflight gateway thật | 2/2 model thông |
| Pipeline thật ở chế độ LLM | Gemini Flash tự chọn đúng 4 tool theo thứ tự phụ thuộc |

Phân bố test mới: `test_orchestration_guardrails.py` 18 · `test_plan_strategies.py` 13 ·
`test_orchestration_parity.py` 4.

**Diff eval byte-identical là bằng chứng mạnh nhất**: toàn bộ refactor không đổi một con số nào.

---

## 4. Hai bug thật đã tìm và sửa

### 4.1. Guardrail chặn oan văn bản tiếng Việt

Claude Haiku viết giải thích chính xác 100%, nhưng validator tách `197.681` thành `197` và
`681` — không hiểu dấu chấm là phân cách hàng nghìn. Hậu quả: tầng LLM bị loại **mọi lần**,
thành code chết trong khi log vẫn trông như guardrail đang làm đúng việc.

Đã sửa, giữ nguyên độ chặt — số bịa (`47 phút`, `197.682`, `35%`) vẫn bị chặn. Test hồi quy
dùng đúng văn bản model thật đã sinh ra.

### 4.2. Test gọi API thật

Khi `.env` bật `LLM_ROUTING_ENABLED=true`, `pytest` thừa hưởng cấu hình đó và bắt đầu gọi
gateway — vi phạm CLAUDE.md §7 #2, đốt token mỗi lần chạy test (54 giây thay vì 17).

Lỗi ở test, không ở cấu hình: test phải tự ép chế độ. `tests/conftest.py` nay chặn ở tầng
biến môi trường (`pydantic-settings` ưu tiên env hơn `.env`), nên vá được cả module đã bind
tên `get_settings` lúc import.

---

## 5. Phát hiện cần bạn biết

### 5.1. Ba plan A/B/C hội tụ về cùng một phương án

Trên **mọi** case eval, ba strategy cho ra plan giống hệt nhau. Nguyên nhân là cấu trúc,
không phải lỗi cài đặt:

- `move_cost = units × deadhead_cost_per_km × distance_km` → chi phí là hàm tăng của quãng đường
- `eta_steps = ceil(distance_km / speed × hệ_số_mưa / 5)` → ETA cũng vậy

Ba mục tiêu "rẻ nhất / cân bằng / nhanh nhất" đang tối ưu **cùng một đại lượng**, nên không
có đánh đổi để khai thác.

**Đã quyết:** giữ cơ chế, UI nói thật. `plan_set.converged` + cảnh báo
`PLAN_STRATEGIES_CONVERGED` giải thích vì sao chúng trùng. Khi nới `max_distance` hoặc đổi
mô hình chi phí, chúng sẽ tự tách ra mà không cần sửa code.

### 5.2. Lệch có chủ ý so với `agent/04`

`interrupt()` HITL, `apply_relocation`, `campaign_gate`, `issue_offers` **không** đưa vào đồ
thị. Bản thiết kế `04` mô tả hệ 2-service; repo thực tế đã tách 3-service và NestJS đang làm
tốt phần đó. Đưa vào sẽ phải viết lại ~16 file + 26 file test đang chạy ổn.

### 5.3. Model 3 là MILP, không phải greedy — tài liệu đã sai, đã sửa

Tài liệu mô tả Model 3 là *"greedy theo severity"* và ghi min-cost flow *"bỏ hẳn"*. Code thực
tế giải bài toán vận tải nguyên bằng `scipy.optimize.milp` — về bản chất chính là min-cost
flow — từ commit `a23ea7d "chore: sync verified production baseline"`, một commit đồng bộ
hàng loạt không nhắc gì tới việc đổi thuật toán.

MILP **tốt hơn** greedy ở đây: greedy duyệt lần lượt sẽ để một hotspot xếp trước tiêu mất zone
nguồn vốn là lựa chọn khả thi duy nhất của hotspot xếp sau. Và không phát sinh dependency —
`scipy` đã nằm trong bộ duyệt.

Đã cập nhật tài liệu cho khớp code (23/08/2026), giữ lại nguyên văn câu cũ trong ghi chú sửa
đổi để không mất dấu vết quyết định: `CLAUDE.md` §2.1/§4.2 · `AGENTS.md` · `ARCHITECTURE.md`
§2/§3/§4/§7/§9 · `IMPLEMENTATION_PLAN.md` T3 AC #1 và §7.1 · docstring `optimizer/greedy.py`.

> Phát hiện kèm theo: fallback timeout của Optimizer (`OPTIMIZER_TIMEOUT` → `mode="fast"`) được
> tài liệu mô tả nhưng **chưa được cài**. Đó là tính năng thiếu chứ không phải tài liệu sai, nên
> tài liệu giữ nguyên — xem `TASKS.md` MA-9.6.

### 5.4. Node nằm trong `graph.py`, không tách thư mục `nodes/`

Node là vỏ mỏng, và closure quanh `RunContext` tránh phải nhét object không tuần tự hoá được
vào checkpoint. 8 file 30 dòng khó đọc hơn 1 file gắn kết.

---

## 6. Ngoài phạm vi — ghi nhận, không tự sửa

Theo CLAUDE.md §4 #5.

| Việc | Ghi chú |
|---|---|
| **EVAL-06 FAIL** | Relocation làm tăng unmet demand 0.119. Đã chẩn đoán ở `eval/decision_flow_evidence.md` §7, chưa sửa |
| **6 file không đạt `ruff format`** | `optimizer/greedy.py`, `activation/recommendation.py`, `forecasting/features.py`, `forecasting/live_snapshot_baseline.py`, `datasets/snapshot_replay.py`, `tests/test_live_decision_api.py`. Có sẵn từ trước; CI không chạy format check nên không đỏ, nhưng DoD §12 #2 yêu cầu |
| **`.env` gốc còn rác template** | `CHROMA_PERSIST_DIR` (vector DB — bị cấm §6 #4), `OPENAI_API_KEY`, `LANGCHAIN_*`, `DATABASE_URL`. Không module nào đọc; dễ gây nhầm là file cấu hình thật |
| **`eval_decision_flow.py` vỡ trên console Windows** | File kết quả vẫn ghi đúng, chỉ dòng `print` cuối lỗi cp1252. Chạy được với `PYTHONIOENCODING=utf-8` |
| **File thiếu trong `agent/`** | `04-wireframe.html`, `05-agent-pipeline-architecture.html`, `frames/` được `README.md` tham chiếu nhưng không tồn tại |

---

## 7. Việc còn lại

### Phase 4 — UI 5 thẻ agent + 3 plan

Backend đã sẵn sàng: `GET /runs/{id}` trả đủ trạng thái từng agent, dấu vết tool, ba plan,
cờ `converged`, và văn bản giải thích.

- `apps/frontend/src/features/operator-pipeline/` — feature mới, không đụng feature cũ
- Polling 2 giây (khớp `PollingTransport` của `agent/06`; CLAUDE.md cấm WebSocket)
- Dùng lại token light hiện có ở `operator-console.css`. **Không** sửa `styles/index.css`
- NestJS: `ai.service.ts` thêm method gọi `/runs`
- **Cần hỏi trước:** migration Supabase thêm cột `plan_set`, `selected_plan_id`, `run_id`

### Câu hỏi mở của `agent/` chưa có lời giải

A3 ngưỡng "cải thiện đủ lớn" để re-plan · A4 ba bộ trọng số cụ thể · A5 công thức
`ai_confidence` · A6 ngưỡng chất lượng tối thiểu. Sẽ đề xuất giá trị kèm mã `[ASSUMPTION-nn]`
theo CLAUDE.md §4 #6, không tự chốt.

---

## 8. Cách chạy

```powershell
cd apps/ai

# Kiểm tra — luôn chạy deterministic bất kể .env đặt gì
pytest -q
ruff check src tests
mypy src

# Eval (console Windows cần biến này)
$env:PYTHONIOENCODING="utf-8"; python eval_decision_flow.py

# Chạy thật
uvicorn src.main:app --reload --port 8000
curl http://localhost:8000/api/v1/llm/health     # preflight gateway
```

Bật agent tự chủ: đặt `LLM_ROUTING_ENABLED=true` và `LLM_API_KEY` trong **`apps/ai/.env`**
(không phải `.env` ở gốc repo — service không đọc file đó).
