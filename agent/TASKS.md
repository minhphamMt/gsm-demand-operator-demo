# Task board — nâng cấp multi-agent

**Nhánh:** `feat/multi-agent-orchestration` · **Cập nhật:** 23/08/2026

> Bảng công việc để nhiều người cùng làm. Trạng thái hệ thống ở
> [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md); thiết kế ở `00`–`06`.
>
> **Mã task dùng tiền tố `MA-`** để không đụng `T0.1`–`T11` của
> [`docs/design/IMPLEMENTATION_PLAN.md`](../docs/design/IMPLEMENTATION_PLAN.md) — đó là bộ
> task của MVP gốc và vẫn còn hiệu lực.

| Ký hiệu | Nghĩa |
|---|---|
| ✅ | Xong, đã kiểm chứng |
| 🔵 | Sẵn sàng làm — không bị chặn |
| ⏸️ | Bị chặn, xem cột *Chặn bởi* |
| ❓ | Cần người quyết trước khi làm |
| ⬜ | Chưa xếp lịch |

---

## 0. Bắt đầu từ đây nếu bạn vừa pull về

```powershell
git checkout feat/multi-agent-orchestration
cd apps/ai
pip install -r requirements.txt      # thêm langgraph so với main
pytest -q                            # phải thấy 65 passed
```

`pytest` **luôn** chạy ở chế độ deterministic và không gọi mạng, bất kể `.env` của bạn đặt
gì — `tests/conftest.py` ép điều đó. Nếu test gọi ra internet thì đó là bug, báo ngay.

Muốn xem agent tự chủ chạy thật (tùy chọn, cần khoá OpenRouter riêng của bạn):

```powershell
# apps/ai/.env  — KHÔNG phải .env ở gốc repo, service không đọc file đó
LLM_ROUTING_ENABLED=true
LLM_API_KEY=sk-or-...

uvicorn src.main:app --reload --port 8000
curl http://localhost:8000/api/v1/llm/health
```

Đọc theo thứ tự: `IMPLEMENTATION_STATUS.md` §1 (chín quyết định) → §5 (phát hiện) → bảng
dưới đây.

---

## Phase 0 — Nền ✅

| ID | Việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| MA-0.1 | Gỡ lệnh cấm LangGraph ở `CLAUDE.md`, `AGENTS.md`, `docs/design/ARCHITECTURE.md` | ✅ | Ghi rõ ngày đảo ngược + lý do, giữ lịch sử quyết định cũ |
| MA-0.2 | Thêm `langgraph>=1.2,<2`; chuyển `httpx` sang runtime | ✅ | `requirements.txt`. Không thêm SDK LLM nào |
| MA-0.3 | 7 biến `LLM_*` trong `config.py` + `.env.example` | ✅ | Khoá để trống; ngưỡng nghiệp vụ vẫn ở `policy.yaml` |
| MA-0.4 | Tắt telemetry `langsmith` tường minh | ✅ | `LANGSMITH_TRACING=false` — đi kèm langgraph, repo cấm gọi ra ngoài |

## Phase 1 (R1) — Đồ thị chạy shadow ✅

| ID | Việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| MA-1.1 | Tách bước tính thuần ra `orchestration/steps.py`, dùng chung với `/decisions` | ✅ | Eval output **byte-identical** trước/sau |
| MA-1.2 | Thêm 4 exception replay/dataset vào `common/errors.py` | ✅ | Route dịch sang mã HTTP, giữ nguyên hành vi cũ |
| MA-1.3 | `assemble_decision()` dùng chung cho route và đồ thị | ✅ | Điều kiện để tiêu chí parity có nghĩa |
| MA-1.4 | `PipelineState` + reducer (`state.py`) | ✅ | `warnings`/`tool_calls` dùng `operator.add`, không ghi đè |
| MA-1.5 | Đồ thị LangGraph 9 node (`graph.py`) | ✅ | Kết thúc ở `PROPOSED`; không có node side effect |
| MA-1.6 | Tool registry + allowlist (`tools/registry.py`) | ✅ | 4 test chặn gọi ngoài allowlist |
| MA-1.7 | 6 tool bọc code số học (`tools/decision_tools.py`) | ✅ | Vỏ mỏng, không tự tính thêm gì |
| MA-1.8 | `POST /runs` · `GET /runs/{id}` · `GET /llm/health` | ✅ | Polling, không WebSocket |
| MA-1.9 | **Test parity: đồ thị == `/decisions`** | ✅ | 3 kịch bản replay, payload bằng nhau tuyệt đối |

## Phase 2 (R2a) — PLAN A/B/C ✅

| ID | Việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| MA-2.1 | `StrategyWeights` + 3 profile trong `optimizer/greedy.py` | ✅ | Chỉ đổi pha 2 của MILP |
| MA-2.2 | `solve(strategy=...)`, mặc định `BALANCED` | ✅ | Test so từng field với hành vi cũ |
| MA-2.3 | Node `generate_plans` sinh đủ 3 phương án | ✅ | Deterministic, không qua LLM (`agent/05` §5) |
| MA-2.4 | `score_and_rank` + luật chọn Recommended | ✅ | Phá hoà ưu tiên `BALANCED` để giữ parity |
| MA-2.5 | **Phát hiện và báo hội tụ** | ✅ | `plan_set.converged` + cảnh báo `PLAN_STRATEGIES_CONVERGED` |
| MA-2.6 | Test: severity luôn thắng mọi trọng số strategy | ✅ | Chặn trên trọng số < `TARGET_RANK_SCALE` |

> ⚠️ Ba plan **hội tụ về cùng một phương án** trên mọi case hiện có. Nguyên nhân cấu trúc,
> xem `IMPLEMENTATION_STATUS.md` §5.1. Đã quyết: giữ cơ chế, UI nói thật.

## Phase 3 (R2b) — Agent LLM tự chủ ✅

| ID | Việc | Trạng thái | Bằng chứng |
|---|---|---|---|
| MA-3.1 | Client httpx tới gateway OpenAI-compatible | ✅ | Không SDK nhà cung cấp; đổi model = đổi env |
| MA-3.2 | Vòng lặp tool-use tự viết | ✅ | `while finish_reason == "tool_calls"` |
| MA-3.3 | System prompt 3 agent | ✅ | Prompt **không** giữ an toàn — code giữ |
| MA-3.4 | Fallback: mọi lỗi LLM → đường deterministic | ✅ | Test: gateway hỏng, vượt vòng, JSON hỏng |
| MA-3.5 | Validator đối chiếu số trong văn bản với nguồn | ✅ | Ép "LLM đọc số, không sinh số" |
| MA-3.6 | Model theo vai trò (phân tích rẻ / diễn giải tốt) | ✅ | Slug đã đối chiếu danh sách OpenRouter |
| MA-3.7 | Chạy thật với gateway | ✅ | Gemini Flash tự chọn đúng 4 tool theo thứ tự phụ thuộc |
| MA-3.8 | **Sửa bug: validator chặn oan số tiếng Việt** | ✅ | `197.681` từng bị tách thành `197` + `681` |
| MA-3.9 | **Sửa bug: test gọi API thật** | ✅ | `conftest.py` ép deterministic ở tầng env |

---

## Phase 4 (R2c) — Panel Autonomous Resolution Pipeline ✅

Backend đã sẵn sàng. `GET /api/v1/runs/{id}` trả:
`agents{status,message,capabilities}` · `tool_calls[]` · `plan_set{plans[],converged,distinct_plan_count}` ·
`recommended_plan_id` · `explanation{text,layer}` · `warnings[]` · `decision`

| ID | Việc | Trạng thái | Chặn bởi | Ghi chú |
|---|---|---|---|---|
| MA-4.1 | Kiểu TS + hàm gọi `/runs` trong `shared/api/` | ✅ | — | Dùng lại `requestJson()` có sẵn ở `shared/api/client.ts` |
| MA-4.2 | `features/operator-pipeline/` — khung feature mới | ✅ | — | `components/` + `model/` + `hooks/`, test colocated |
| MA-4.3 | Lưới 7 thẻ agent, polling 2 giây | ✅ | MA-4.1, MA-4.2 | `PipelinePanel.tsx` + `model/agentCards.ts`; vòng đời run tách ra `hooks/usePipelineRun.ts` |
| MA-4.4 | `PlanSetComparison.tsx` — 3 thẻ A/B/C + badge Recommended | ✅ | MA-4.1, MA-4.2 | **Khi `converged=true` phải nói rõ ba chiến lược trùng nhau**, không hiện 3 thẻ giống hệt như thể là 3 lựa chọn |
| MA-4.5 | Hiển thị giải thích + nhãn `layer` (template/llm) | ✅ | MA-4.2 | Trong `OptimizationDetail.tsx`, tab Sơ đồ |
| MA-4.6 | Gắn vào route operator | ✅ | MA-4.3, MA-4.4 | Panel nổi trên `/operator`, không thêm route mới; hai nút điều hướng sang `/operator/execution` và `/operator/history` |
| MA-4.7 | Test vitest cho panel và bảng so plan | ✅ | MA-4.3, MA-4.4 | 38 test trong `features/operator-pipeline/`; dùng mock adapter, không gọi backend thật |
| MA-4.8 | NestJS: `ai.service.ts` thêm method gọi `/runs` | ✅ | — | Proxy mỏng, không tính lại nghiệp vụ trong route |
| MA-4.9 | Migration Supabase: `plan_set`, `selected_plan_id`, `run_id` | ❓ | **Cần duyệt** | Ghi DB — phải hỏi trước khi chạy (CLAUDE.md §11.2) |
| MA-4.10 | Tab `Overview` — giám sát sức khoẻ hệ thống (`agent/07-Design` §3) | ✅ | MA-4.2 | `SystemKpiHeader` + `MetricTrendChart` + `AlertThresholdSlider` + `ZoneBreakdownTable`; số lấy từ `snapshot.kpis`, **không** cài lại công thức metric |
| MA-4.11 | Nút bật chế độ dự báo +15 / +30 phút | ✅ | MA-4.10 | Mốc +30 là **ngoại suy**, có badge cảnh báo và mã `[ASSUMPTION-44]`; xem MA-Q6 |
| MA-4.12 | Tab `Connect` — sơ đồ fan-in, chấm dữ liệu chạy dọc cạnh nối | ✅ | MA-4.3 | `FlowGraph.tsx`; bấm thẻ ở tab Agent → chuyển tab kèm `focusedAgentId` |
| MA-4.13 | Chuỗi xu hướng cho biểu đồ §3.5 | ✅ | MA-4.10 | Backend không có endpoint series → tích lũy theo replay step **trong phiên xem** (`hooks/useMetricHistory.ts`); mất khi tải lại trang. Xem MA-Q7 |
| MA-4.14 | Token scoped cho panel | ✅ | MA-4.2 | `[data-surface="pipeline"]` trong `operator-pipeline.css`, **giá trị lấy từ bộ token sáng của console**. *(Sửa 2026-08-23: bản đầu dùng token tối và đảo quyết định "chỉ wallboard mới dark"; đã quay lại light để panel khớp phần còn lại của màn hình. Lớp tên `--nfp-*` giữ nguyên nên /wallboard chỉ cần ghi đè giá trị.)* |
| MA-4.15 | Thanh icon dọc ở rìa phải (`agent/07-Design` §2) | ✅ | MA-4.12 | `OpsIconRail.tsx`: 3 tab panel + 2 điều hướng; tab của panel chuyển sang controlled để thanh icon và tab bar nhìn cùng một state |
| MA-4.16 | Bỏ khối `TÌNH HÌNH VẬN HÀNH` khỏi bảng chỉ huy | ✅ | MA-4.10, MA-4.15 | Bỏ cả tiêu đề, 4 pha và lưới KPI. Bốn ô **trạng thái phương án** không trùng tab Tổng quan nên chuyển vào panel (`model/planStatusTiles.ts`), không xoá |
| MA-4.17 | Chuyển 12 bước `TIẾN TRÌNH HỆ THỐNG` vào tab Sơ đồ luồng, nhóm theo agent phụ trách | ✅ | MA-4.12 | `operator-console/model/systemSteps.ts` gắn `owner` cho từng bước: **5 bước trong đồ thị**, **7 bước ngoài đồ thị** (cổng người, Khối C, History Store) tách thành mục riêng có ghi lý do. Rail chỉ còn một dòng "bước hiện tại" |
| MA-4.18 | Panel chuyển từ modal có lớp phủ sang flyout "thòi ra" cạnh thanh icon | ✅ | MA-4.15 | `.nf-pipeline-flyout` nằm trong luồng của `.nf-ops-workspace`, lấy chỗ của bản đồ; vai trò ARIA đổi `dialog` → `region` |
| MA-4.19 | Bỏ thanh kịch bản trên cùng | ✅ | MA-4.10 | Giờ máy chủ đã có ở thanh điều hướng; nhãn kịch bản/thời tiết chuyển vào đầu tab Tổng quan; nút horizon và "Xem luồng agent" đã có chỗ khác. Xoá `ScenarioBar` + `formatServerDateTime` |
| MA-4.20 | Bỏ bảng chỉ huy, chuyển khối quyết định vào popup Sơ đồ luồng | ✅ | MA-4.19 | `RailActions` truyền vào panel qua prop `decisionSlot` — **toàn bộ logic hai cổng phê duyệt ở lại console**, panel chỉ đặt chỗ. Tab `connect` mở dạng `.nf-pipeline-stage` (popup rộng) vì sơ đồ + phương án + khối quyết định không vừa cột hẹp |
| MA-4.21 | Bỏ thanh tab trong panel | ✅ | MA-4.15 | Thanh icon dọc là bộ chuyển tab duy nhất; xoá `PipelineTabBar` |
| MA-4.23 | Dựng lại tab Sơ đồ luồng theo bố cục 3 cột của `agent/07-Design` §5–6 | ✅ | MA-4.20 | Thẻ agent (icon + chỉ số + bung task trong thẻ) → node Optimization (mini bar + chỉ số) → panel chi tiết (3 ô stat, thanh so sánh phương án, diễn giải, khối quyết định). Cạnh nối đo vị trí thật qua `hooks/useFlowAnchors.ts` nên vẫn đúng tâm khi thẻ đổi chiều cao |
| MA-4.22 | Cấu hình dự báo tự động / thủ công trong tab Tổng quan | ✅ | MA-4.19 | `ForecastConfig.tsx` + `hooks/useAutoForecast.ts`: mốc model 5/10/15, chu kỳ tự chạy 2/5/10 phút, tuỳ chọn **tự tính phương án khi có hotspot** (dừng ở Proposed, không vượt cổng duyệt). Mốc chiếu +30 ngoại suy tách riêng khỏi mốc model |

**Ràng buộc UI — đọc trước khi code:**

- Giữ **light theme** cho toàn bộ operator/driver UI, panel pipeline **bao gồm**. Panel khai
  báo token riêng `[data-surface="pipeline"]` nhưng giá trị lấy từ `operator-console.css`.
  Vẫn **không** sửa `src/styles/index.css`.
  *(Sửa 2026-08-23: có một vòng dùng nền tối cho panel theo mô tả của `agent/07-Design`, rồi
  quay lại light vì panel nằm trong luồng cạnh bảng chỉ huy chứ không nổi đè lên bản đồ, nên
  nền tối tạo hai hệ màu cạnh nhau trên cùng một màn hình.)*
- **Polling 2 giây, không WebSocket, không SSE** — CLAUDE.md §4.2 loại WebSocket khỏi phạm vi.
- Feature mới nằm riêng, không sửa feature đang chạy.

**Ba chỗ panel cố ý lệch `agent/07-Design`** (design mô tả UI tổng quát, code phải bám hệ thống thật):

| Design nói | Panel làm | Vì sao |
|---|---|---|
| 8 thẻ agent (có Weather, Fee) | **7 thẻ**, trải 3 capability của Situation Assessment thành thẻ riêng | Đồ thị thật chỉ có 4 agent; thẻ cho agent không tồn tại là số bịa |
| §6 "Permission Agent": Confirm tự động + nút `Recall` | Khối cổng phê duyệt **chỉ đọc**, có nút mở phương án để duyệt | CLAUDE.md §11.1 cấm mọi đường tự động vòng qua hai cổng người; C-08 cấm hủy ngược offer đã gửi |
| §5.2 checklist chặn có checkbox chọn/bỏ | Danh sách chặn **chỉ đọc** | Sửa phương án phải qua Revise rồi qua cổng duyệt, không thể là checkbox trong panel giám sát |
| §3.7 thanh trượt đặt ngưỡng | Ngưỡng **chỉ hiển thị trong phiên xem**, ghi rõ không ghi vào `policy.yaml` | `config/policy.yaml` là nguồn ngưỡng duy nhất (CLAUDE.md §3 #2) |
| Tab `Executions` / `History` / `Chats` | Hai nút điều hướng sang trang có sẵn; **bỏ** `Chats` | Tránh hai nguồn sự thật cho cùng lịch sử; CLAUDE.md §2 ghi rõ đây không phải chat agent |

| MA-4.24 | Nối preflight gateway LLM xuyên tầng | ✅ | MA-3.7 | `GET /api/v1/llm/health` đã có ở AI service nhưng chưa được NestJS proxy nên UI mù. Thêm `AiService.llmHealth()` + route `GET /operator/ai/llm/health`, guard `readLlmHealth()`, và băng **Chế độ agent** ở tab Agent: cho biết *lượt chạy tới* đi đường LLM hay đường cố định, kèm tình trạng từng model. Không bao giờ nhận/hiển thị khoá API |
| MA-4.25 | Đưa tầng multi-agent lên `main` mà không lấy bản viết lại của console | ✅ | MA-4.24 | Merge thẳng `feat/multi-agent-orchestration` vỡ 8 file: `main` đã tự phát triển `OperatorConsoleDashboard.tsx` (phục hồi phương án lỗi thời, ingest replay atomic, driver states mô phỏng) sau khi hai nhánh tách. Nhánh `integrate/multi-agent-orchestration` lấy **file mới không xung đột** của tầng agent, giữ nguyên console của `main`, và ghép tay 4 chỗ cả hai bên cùng sửa. `ai.service.ts` giữ logic mới của `main`; hai endpoint pipeline dùng lại nó qua `buildInferencePayload()` để đồ thị và `/api/v1/decisions` nhận **cùng một payload** |
| MA-4.26 | Dựng lại bảng điều hành theo bố cục v2 | ✅ | MA-4.25 | Lấy **thiết kế** của `prototypes/operations-v2` (đầu trang + thanh chặng + 3 cột + nền tối), **không** lấy code — prototype là mock tĩnh, không nối backend, thiếu cổng duyệt #2. Thêm `OpsHeader` (thanh chặng đọc `OperatorWorkflowStage` thật) và cột trái `ZoneBalanceChart`. **Cố ý bỏ** 3 biểu đồ xu hướng 24 giờ của bản mock: contract chỉ trả một snapshot, chuỗi thời gian sẽ phải bịa. Bảng màu tối khai báo cục bộ trên `.nf-ops`, không đụng `@theme` toàn cục |

| MA-4.27 | Cột trái thành bảng giám sát toàn mạng lưới | ✅ | MA-4.26 | Ba đồng hồ (`networkGauges`) + thanh phân bố rủi ro theo `severity` + biểu đồ cân bằng zone. **Không** sao chép bộ ba đồng hồ của bản mock: hệ thống không đo "độ ổn định", còn "độ tin cậy AI" đang bị chặn bởi **MA-Q3** (chưa chốt công thức) — gán số cho hai ô đó là bịa chỉ số. Thay bằng ba đại lượng có thật: tỷ lệ đáp ứng (`kpis.fulfillmentRate`), tỷ lệ zone trong tầm (`severity` Low+Medium), độ phủ dữ liệu (đo trên hợp đồng 30 zone, không trên số zone nhận được) |

**Vì sao không có đường xu hướng 24 giờ (MA-4.27).** Dataset **có** đủ dữ liệu (2016 mốc 5 phút,
7 ngày) và `snapshot_replay.snapshot_window()` đã đọc cả frame nhưng chỉ trả `mean_rain_mm_h`.
Phơi thêm cầu/cung là việc nhỏ (~1 giờ) nhưng chạm endpoint AI + thêm field vào contract, nên để
lại thành quyết định riêng. Đường cong theo **chân trời** (+5/+10/+15/+30) đã bị loại sau khi đo
dữ liệu thật: chỉ +15/+30 có số, +5/+10 rỗng, dải p10–p90 cũng rỗng — vẽ ra sẽ là biểu đồ thủng.

**Kiểm tra bằng chạy thật (MA-4.26, MA-4.27).** Bốn lỗi chỉ lộ khi mở app, test không bắt được — cột trái
làm hẹp khung bản đồ nên dòng trạng thái dự báo bị thanh điều khiển đè; rail "phương án đang chạy"
và panel agent còn nền trắng giữa nền tối. Đã sửa cả ba; panel agent dùng lại đúng chỗ ghi đè
`--nfp-*` mà `operator-pipeline.css` để sẵn cho bản tối. Lỗi thứ tư ở MA-4.27: biểu đồ cân bằng
zone cắt top-N sau khi sắp xếp giảm dần nên **mất sạch nhóm zone dư** khi số zone thiếu vượt hạn
mức — điều chuyển khi đó không còn thấy chỗ nào để rút xe. Đã đổi sang lấy từ cả hai đầu, có test
hồi quy.

## Đối chiếu với `02-technical-spec.md` (24/08/2026)

Rà toàn bộ §2–§5 của technical-spec so với code đang chạy. Cột **Xử lý** ghi việc đã làm hoặc
lý do cố ý lệch.

| Mục spec | Hiện trạng | Xử lý |
|---|---|---|
| §2.5 `AgentResult.status` (`PENDING/RUNNING/DONE/WARNING/FAILED`) | Khớp đúng 5 trạng thái | ✅ không đổi |
| §2.5 `started_at` / `finished_at` | Thiếu | ✅ **đã thêm** — `AgentReport` + `_render`; UI hiện thời lượng từng agent. Client không tự đo được vì polling 2 giây |
| §2.5 `agents[]` là mảng có `order`, `display_name` | Ta dùng map, thứ tự và nhãn do frontend giữ | ⚠️ cố ý giữ — đưa `order`/`display_name` vào backend là tạo nguồn sự thật thứ hai cho thứ tự hiển thị |
| §2.5 `output_ref` | Thiếu | ⚠️ chưa cần — run store là bộ nhớ tiến trình, không có kho artefact để trỏ tới |
| §2.5 `actions[].selected` (checkbox) | Danh sách chặng chỉ đọc | ⚠️ cố ý — sửa phương án phải qua Revise rồi qua hai cổng duyệt (CLAUDE.md §11.1) |
| §2.6 `scores.*` = `GOOD/MEDIUM/BAD`, `metrics.cost` = `LOW/MEDIUM/HIGH` | Thiếu | ✅ **đã thêm** — `model/planScores.ts`, xếp hạng **trong nhóm phương án**, không có phương án đơn lẻ nào được chấm điểm |
| §2.6 `metrics.coverage`, `eta_delta_min` | Thiếu | ❓ không suy ra được từ dữ liệu hiện có — cần chốt công thức trước |
| §2.6 `ai_confidence_pct` | Thiếu | ❓ chặn bởi **MA-Q3** / spec G5 (chưa có công thức) |
| §2.7 `PlanDecision` (`APPROVE/MODIFY/REJECT` + audit) | Có đủ ở NestJS + History Store | ✅ khớp |
| §2.7 `RECALL` / `CANCEL` | Không làm | ⚠️ cố ý — C-08 cấm hủy ngược offer đã gửi; spec G9 cũng ghi ngữ nghĩa hai nút này chưa rõ |
| §2.9 `ReplanEvent` / `PLAN V2` | Chưa có vòng re-plan | ❓ chặn bởi **MA-Q2** (ngưỡng "cải thiện đủ lớn") |
| §3.1 danh sách 5 agent, `explain` là **tool** của Optimization | Ta có Explanation là agent riêng | ⚠️ cố ý — `docs/design/ARCHITECTURE.md` và `AGENT_WORKFLOW.md` (tài liệu đã chốt, ưu tiên cao hơn `agent/`) định nghĩa 3 agent gồm Explanation |
| §3.2 tool có side effect (`dispatch`/`recall`/`cancel`) không nằm trong allowlist agent | Khớp — có test guardrail chặn | ✅ |
| §4.3 sinh 3 phương án bằng đa mục tiêu | Khớp — MIN_COST / BALANCED / MIN_ETA | ✅ |
| §4.3 assertion `to_zone` phải là vùng thiếu | Chưa bật | ⚠️ **cố ý chưa bật** — chính spec ghi phải chốt ngữ nghĩa `to_zone` trước (G10), bật sớm sẽ chặn nhầm dữ liệu hợp lệ |
| §6 server-push (WebSocket/SSE) cho toast và panel | Ta polling 2 giây | ⚠️ cố ý — CLAUDE.md §4.2 loại WebSocket khỏi phạm vi MVP |
| §7 G2 chân trời +10/+20/+30 (video) vs 5/10/15 (dự án) | Ta dùng 5/10/15 | ❓ khoảng trống của chính spec; mốc +30 hiện là ngoại suy có nhãn `[ASSUMPTION-44]` |

**Kết luận:** ba mục thiếu thật đã bổ sung (mốc thời gian agent, `scores`, `cost` band). Bảy mục
lệch là **cố ý** vì tài liệu đã chốt trong `docs/design/` hoặc ràng buộc an toàn của dự án
thắng technical-spec. Bốn mục còn lại bị chặn bởi câu hỏi mở đã ghi ở phần "Cần người quyết".

---

## Phase 5 — Wall Board (tùy chọn) ⬜

| ID | Việc | Trạng thái | Chặn bởi |
|---|---|---|---|
| MA-5.1 | Route `/wallboard` + token dark scoped `:root[data-view="wallboard"]` | ⬜ | Phase 4 xanh |
| MA-5.2 | Bảng màu theo `agent/03` §2.2 | ⬜ | MA-5.1 |

> Đây là **màn hình duy nhất** được dùng dark theme. Toàn bộ operator/driver UI giữ light.
> MA-5.1 nên ghi đè bộ token `--nfp-*` của `[data-surface="pipeline"]` thay vì định nghĩa
> bảng màu thứ hai — panel đã tách sẵn toàn bộ màu ra biến ở đúng một chỗ.

---

## Cần người quyết ❓

| ID | Câu hỏi | Chặn |
|---|---|---|
| MA-Q1 | Duyệt migration Supabase (MA-4.9)? | Phase 4 hoàn chỉnh |
| MA-Q2 | Ngưỡng "cải thiện đủ lớn" để đề xuất re-plan (`agent/04` A3) | Vòng re-plan |
| MA-Q3 | Công thức `ai_confidence` và mức phạt khi agent suy giảm (A5) | Hiển thị độ tin cậy |
| MA-Q4 | Ngưỡng chất lượng tối thiểu để một plan được hiện (A6) | `quality_gate` chặt hơn |
| MA-Q5 | Có gửi `04-wireframe.html` + `frames/` không? | Độ bám sát UI của Phase 4 |
| MA-Q6 | Đăng ký `[ASSUMPTION-44]` (ngoại suy +30 phút) vào ASSUMPTION register của `DATA_CONTRACT`? | Mốc +30 của panel đang chạy với mã chưa đăng ký |
| MA-Q7 | Có làm endpoint chuỗi KPI theo thời gian không? | Biểu đồ xu hướng hiện chỉ có dữ liệu của phiên xem, mất khi tải lại trang |
| MA-Q8 | Đóng panel có được phép mất lượt phân tích đang chạy không? | Hiện `PipelineModal` unmount khi đóng → mất `run` và chuỗi xu hướng. Giữ mounted thì phải chấp nhận polling 2 giây chạy nền |

Giá trị còn trống sẽ đề xuất kèm mã `[ASSUMPTION-nn]` theo CLAUDE.md §4 #6, không tự chốt.

## Nợ kỹ thuật — ghi nhận, chưa xếp lịch ⬜

| ID | Việc | Ghi chú |
|---|---|---|
| MA-9.1 | **EVAL-06 FAIL** — relocation làm tăng unmet demand 0.119 | Đã chẩn đoán ở `eval/decision_flow_evidence.md` §7. Có từ trước bản nâng cấp |
| MA-9.2 | 6 file không đạt `ruff format --check` | Có sẵn từ trước. CI không chạy format check nên không đỏ, nhưng DoD §12 #2 yêu cầu |
| MA-9.3 | `.env` gốc còn rác template | `CHROMA_PERSIST_DIR` (vector DB — cấm ở §6 #4), `OPENAI_API_KEY`, `LANGCHAIN_*`. Không module nào đọc |
| MA-9.4 | `eval_decision_flow.py` vỡ trên console Windows | File kết quả vẫn ghi đúng; chạy với `PYTHONIOENCODING=utf-8` |
| MA-9.5 | Đưa `orchestration/` vào cây thư mục `ARCHITECTURE.md` §7 | Cây hiện chưa có thư mục này |
| MA-9.6 | **Fallback timeout của Optimizer chưa tồn tại** | `AGENT_WORKFLOW.md` R11 + §6 và `API_CONTRACT.md` §1.3 mô tả: Optimizer quá 5 giây → kill → `solve(mode="fast")` → cảnh báo `OPTIMIZER_TIMEOUT` + `OPTIMIZER_FALLBACK_USED`. Code **không có** tham số `mode`, không đo giờ, không phát hai mã đó. Đây là **tính năng thiếu**, không phải tài liệu sai — nên tài liệu giữ nguyên, cần implement (T3 AC #2 cũng yêu cầu benchmark ≤ 5 giây, chưa có test đo) |
| MA-9.7 | Đổi tên `optimizer/greedy.py` cho khớp thuật toán | Tên file là dấu vết lịch sử; đổi tên chạm import ở 5+ file và mọi tham chiếu trong `docs/design/`. Tài liệu đã ghi rõ đây là dấu vết, nên không gấp |

---

## Luật khi làm task

1. **Không sửa `BALANCED`.** Nó bằng hành vi trước nâng cấp; đổi là phải tính lại baseline và
   mọi KPI đã công bố (§5.14.3).
2. **Test parity (MA-1.9) đỏ = dừng lại.** Nó nghĩa là đồ thị và `/decisions` đã lệch nhau,
   và mọi so sánh KPI giữa hai bản mất hiệu lực.
3. **Không thêm tool có side effect vào allowlist.** `execute_relocation`, `issue_offers` chạy
   ở NestJS sau hai cổng phê duyệt (CLAUDE.md §11.1).
4. **Test không được gọi mạng.** Cần đường LLM thì truyền client giả, đừng bật cờ toàn cục.
5. Sửa bug → viết test tái hiện đúng bug **trước** (§7 #5).
6. Trước khi báo xong: `pytest -q` · `ruff check src tests` · `mypy src` đều xanh, và
   `eval_decision_flow.py` giữ 8/9 PASS.
