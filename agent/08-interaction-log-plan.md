# Kế hoạch triển khai: AI Agent Interaction Log

**Ngày:** 28/08/2026 · **Nhánh:** `integrate/multi-agent-orchestration` · **Task:** MA-6.1…MA-6.9

> **Không phải spec.** Đây là kế hoạch triển khai cho một tính năng đã có neo trong bộ thiết kế.
> Bộ spec là `00`–`07`. File này mô tả *cách làm* và *vì sao làm như vậy*, để người khác đọc lại
> hiểu được các đánh đổi đã cân nhắc.

---

## 1. Vì sao làm

Hệ thống đã có ba agent LLM chạy qua LangGraph và panel bảy thẻ hiển thị trạng thái. Nhưng người
vận hành **không nhìn thấy quá trình**: mở panel chỉ thấy kết quả cuối, không thấy agent nào gọi
tool gì, theo thứ tự nào, vì sao lại chọn tool đó.

Mục tiêu: trải nghiệm như xem một agent chạy trong terminal — từng dòng hiện dần theo thời gian
thực — và **thao tác thủ công của người vận hành cũng nằm trong cùng dòng chảy đó**, để đọc ra
thành một mạch:

```
người vận hành giao việc → agent thực thi → agent trình phương án → người duyệt → agent chạy tiếp
```

### 1.1. Neo tài liệu

Theo CLAUDE.md §4.1 #1, mọi thay đổi phải truy ngược được về một task ID hoặc một mục spec.
Neo của tính năng này là **`04-agent-architecture.md` §9**, dòng cuối bảng ánh xạ UI:

> `stream trạng thái node` | pipeline hiện tick **từng bước**, không đợi chạy xong | `[V-5]`
>
> …orchestrator phải **stream** trạng thái node ra ngoài chứ không trả kết quả một lần khi xong.

Yêu cầu này đã nằm trong thiết kế từ đầu và **chưa được cài**. Đây là việc lấp một khoảng trống
đã ghi nhận, không phải thêm chức năng ngoài spec.

Tính năng này cũng buộc phải trả lời câu hỏi mở **MA-Q8** — xem §5.2.

---

## 2. Hiện trạng — bốn phát hiện định hình thiết kế

### 2.1. Backend hiện không stream

`routes_orchestration.py` ghi run store đúng **hai lần**:

| Thời điểm | Nội dung ghi |
|---|---|
| Trước khi chạy (dòng ~121) | `{"run_id": …, "status": "RUNNING"}` |
| Khi xong (dòng ~111) | `{"run_id": …, "status": "DONE", **_render(state)}` |

`_execute` gọi `run_pipeline(...)` là **một lệnh chặn** trong `asyncio.to_thread`. Trong lúc
RUNNING, `GET /runs/{id}` **không có** `agents` lẫn `tool_calls`. UI vì thế nhảy thẳng từ "đang
chạy" sang "xong hết", không có gì ở giữa.

LangGraph `.stream()` / `astream_events` không được dùng ở đâu trong `apps/ai`.

### 2.2. Lời tường thuật của LLM đang bị vứt đi

`run_with_llm` (`agents/runner.py`) gọi `client.complete(...)` mỗi vòng và nhận `reply.content` —
đây là câu LLM tự nói về việc nó đang làm. Nhưng `reply.content` **chỉ được giữ khi reply không
có tool_calls** (dòng 100). Ở mọi vòng có gọi tool, nó bị bỏ.

Đây chính là thứ các CLI agent production hiển thị. Nó đã được sinh ra rồi, chỉ chưa ai đọc.

### 2.3. Parity là ràng buộc cứng, và nó định hình kiến trúc

`test_orchestration_parity.py` là test khóa của cả bản nâng cấp:

- dòng 83: `assert state["decision"] == http_response.json()` — **byte-identical**
- dòng 109: assert đúng thứ tự `tool_calls`

Và **6 trong 7 nơi gọi `run_pipeline` nằm trong test**, không nơi nào truyền tham số mới.

→ **Hệ quả kiến trúc:** sự kiện **không được vào `PipelineState`**. Đưa vào state là chạm
`_render`, chạm reducer, và rước rủi ro parity không cần thiết. Thay vào đó truyền một callable
`emit` với **mặc định no-op**; buffer do route sở hữu. Cách này làm parity an toàn **về mặt cấu
trúc**, chứ không phải an toàn nhờ cẩn thận.

### 2.4. `get_run` chạy khác thread với `_execute`

`get_run` khai báo là `def` chứ không phải `async def` → FastAPI chạy nó trong threadpool, trong
khi `_execute` chạy trong worker của `asyncio.to_thread`. Hai thread thật sự khác nhau.

→ `threading.Lock` trong `RunLog` là **bắt buộc**, không phải trang trí.

---

## 3. Kiến trúc

```
route tạo RunEntry{record, log} ──emit──> run_pipeline(emit=…) ──> GraphDependencies.emit
                                            ├─ ToolRegistry.invoke: tool_started/finished/denied
                                            ├─ graph nodes: agent_started/finished, narration
                                            └─ runner: narration (reply.content), warning
GET /runs/{id} → {**record, "events": log.snapshot()}     ← poll 2 giây thấy dòng hiện dần
```

**`PipelineState`, `ToolCall`, `_render`, `decision` — không đổi một dòng nào.**

### 3.1. Lược đồ sự kiện

Module mới `apps/ai/src/orchestration/run_log.py`:

```python
EventKind = Literal["run_started","agent_started","agent_finished","tool_started",
                    "tool_finished","tool_denied","narration","warning","run_finished"]

@dataclass(frozen=True)
class RunEvent:
    seq: int          # 1-based, đơn điệu, không đứt — ĐÂY là thứ tự chuẩn
    at: str           # now_iso(), offset +07:00 (dùng lại state.py)
    kind: EventKind
    actor: str        # tên agent thật, hoặc "graph"
    text: str         # dòng hiển thị tiếng Việt
    source: Literal["deterministic","llm","system"]
    tool: str | None = None
    ok: bool | None = None
    code: str | None = None
```

**`seq` là thẩm quyền sắp xếp duy nhất.** `at` là đồng hồ tường: có thể trùng ở mức mili-giây và
có thể lùi khi NTP chỉnh giờ. Client sắp theo `seq`, không bao giờ theo `at`.

**Không đặt `run_id` vào sự kiện.** `run_pipeline` tự sinh id riêng (`graph.py:495`) khác với id
route dùng làm khóa — hiện id đó ra UI sẽ là một số không khớp URL người dùng vừa gọi.

### 3.2. Nơi phát sự kiện

| Sự kiện | File · hàm |
|---|---|
| `run_started` | `routes_orchestration.py::start_run` — phát **trước** khi trả 202, để lượt poll đầu không rỗng |
| `tool_started` / `tool_finished` / `tool_denied` | `tools/registry.py::ToolRegistry.invoke` |
| `agent_started` / `agent_finished` | `graph.py` — `situation_assessment`, `dispatch`, `score_and_rank`, `explain` |
| `narration` (deterministic) | `graph.py` — `route_trigger`, `generate_plans`, `quality_gate`, `assemble` |
| `narration` (llm) | `agents/runner.py::run_with_llm` — chỗ `reply.content` đang bị bỏ |
| `warning` | `runner.py::_fallback`; `graph.py::explain`, `score_and_rank` |
| `run_finished` | `routes_orchestration.py::_execute` — cả ba lối ra |

### 3.3. Ba chỗ đã sửa so với thiết kế nháp đầu tiên

Ghi lại vì đây là phần dễ làm sai nhất, và người đọc sau có thể thắc mắc "sao không làm cách kia".

**1. Một map với `RunEntry`, không phải hai `OrderedDict` song song.**
Thiết kế nháp để `_run_logs` riêng cạnh `_runs`. Hai map nghĩa là **hai vòng thu hồi phải luôn
đồng ý với nhau, mà không có gì ép chúng đồng ý** — lệch thì hỏng im lặng (log sống lâu hơn bản
ghi, hoặc ngược lại). Vấn đề thật sự cần giải hẹp hơn: `_remember()` **thay cả dict**, nên thứ gì
để bên trong đều bị hủy ở bước RUNNING→DONE. Sửa thẳng chỗ đó: gộp `record` + `log` vào một object.
Một vòng đời, không lệch. Lợi thêm: đường FAILED cũng giữ được log (hiện chỉ trả
`{run_id, status, error}`).

**2. Phát sự kiện ở `ToolRegistry.invoke`, không phải ở hai runner.**
`invoke` là chốt duy nhất mọi tool đi qua ở **cả hai chế độ**. Thiết kế nháp đặt ở
`run_deterministic` và `run_with_llm` → ba chỗ phát trùng nhau (`_fallback` gọi lại
`run_deterministic`), và **bỏ sót hoàn toàn nhánh guardrail**: `tool_denied` khi agent với ra
ngoài allowlist là đúng thứ log cần phơi ra nhất.

**3. `text` của `tool_finished` chính là câu tường thuật.**
Không phát thêm một sự kiện `narration` sau mỗi tool. Một tool call = một dòng. Bỏ được hẳn một
loại sự kiện và giảm nửa lượng dòng.

### 3.4. Vì sao không dùng `astream_events` như §9 gợi ý

`04-agent-architecture.md` §9 nêu đích danh `astream_events`. Đây là **chỗ cố ý làm khác**, ghi
lại lý do:

1. **Sai độ mịn.** `.stream()` chỉ tick sau mỗi **node**. Mà 4 trong 6 tool call nằm *bên trong*
   một node `situation_assessment` (§3.2 của `04` đã chốt gộp ba capability vào một node). Streaming
   theo node **về mặt vật lý không thể** sinh ra dòng `[FORECAST_AGENT] > gọi get_weather()`.
2. **Sai mô hình thực thi.** `astream_events` là async, trong khi `run_pipeline` cố ý chạy sync
   trong `to_thread` vì MILP là CPU-bound và phải nằm ngoài event loop. Chuyển sang async là cấu
   trúc lại đúng đường code mà test parity đang canh, bốn ngày trước bàn giao.
3. **Bị bao hàm.** Cơ chế callback cho ra sự kiện mức node *và* mức tool *và* narration LLM từ
   một đường duy nhất. `.stream()` chỉ cho tập con.

### 3.5. Không thêm `?since_seq=`

Run deterministic phát ~35 sự kiện, chế độ LLM ~120; khoảng 5–18 KB mỗi lượt poll — nhỏ hơn payload
`decision` đang gửi sẵn. Fetch tăng dần chỉ đổi lấy một đường merge phía client mà **một response
rớt là thủng log vĩnh viễn**. Gửi cả mảng, client thay trọn gói.

---

## 4. Các chặng

### Chặng 1 — Đường sự kiện ở AI service · BẮT BUỘC

- **Tạo** `run_log.py`: `RunEvent`, `RunLog` (list + `threading.Lock`, `seq` tự tăng, `snapshot()`
  trả bản sao dưới khóa). Trần `MAX_EVENTS_PER_RUN = 500`; tràn thì **thêm một dòng báo bị cắt**,
  không bỏ âm thầm (CLAUDE.md §9 #3). Sink **không bao giờ được ném lỗi** ra ngoài — một cơ chế
  ghi log mà giết được lượt chạy thì tệ hơn là không có log.
- **Tạo** `narration.py`: `dict[tên tool → formatter]` thuần, đọc **nguyên văn** số từ dict tool
  trả về. Không tính, không làm tròn, không suy diễn — cùng luật "vỏ mỏng" của `decision_tools.py`.
- **Sửa** `tools/registry.py`: thêm `observe(sink)`, phát sự kiện trong `invoke`. **Giữ nguyên chữ
  ký `build_registry(context)`** — bốn test guardrail gọi trực tiếp.
- **Sửa** `graph.py`: `run_pipeline(..., emit: EventSink = NULL_SINK)`. Dùng **no-op callable
  thật**, không phải `None` rồi rải `if emit is not None` — bản không nhánh làm cho khẳng định
  "log không thể đổi luồng điều khiển" nhìn một cái là thấy.
- **Sửa** `routes_orchestration.py`: `RunEntry`, merged GET, `run_started`/`run_finished`,
  `_store_lock`.
- **Sửa** `runner.py`: `_fallback` phát `warning` mã `LLM_ROUTING_FALLBACK`.

**Test mới:**

- `test_run_log.py` — seq đơn điệu · `snapshot()` là bản sao · trần cắt đúng · N thread × M append
  cho ra tập seq duy nhất (**assert trên tập seq, không dùng `sleep`** — CLAUDE.md §7 #3) · sink
  ném lỗi không lan ra ngoài.
- `test_orchestration_events.py` — **test giá trị cao nhất: chạy hai lần, một với `NULL_SINK`, một
  với `RunLog` thật, assert `decision` bằng nhau.** Đây là phát biểu kiểm được bằng máy rằng nhật
  ký không thể làm dịch một con số nào.
- `test_runs_api.py` — thấy `events` khi còn RUNNING (dựng deterministic bằng stub chặn trên
  `threading.Event`, **không đua với pipeline thật**) · tạo 65 run → run cũ nhất mất **cùng log của
  nó** (chứng minh thiết kế một-map không rò rỉ).

**Parity + guardrails + INV phải xanh mà không sửa một dòng test nào.**

### Chặng 2 — Popup log · BẮT BUỘC

- `pipelineRun.ts`: thêm `events?` (**field optional**, đúng CLAUDE.md §3 #1) + guard nới tay.
- **Nâng `usePipelineRun` từ `PipelineModal` lên `OperatorConsoleDashboard`** — xem §5.2.
- Hook tích lũy sự kiện bằng `Map<seq, RunEvent>`: run bị thu hồi (404) → dừng poll, **giữ nguyên
  phần đã tải**, hiện một dòng hệ thống; lỗi mạng thoáng qua → không mất gì.
- `AgentInteractionLog.tsx`: monospace `[HH:MM:SS] [ACTOR] > text`; ba trạng thái mở / thu gọn
  (thanh nhỏ + số dòng chưa đọc) / đóng; tự cuộn **trừ khi người dùng đã cuộn lên**, kèm nút
  "↓ N dòng mới"; `role="log"` + `aria-live="polite"`.
- Nhãn `[FORECAST_AGENT]` suy ra **ở client** từ `actor` + `tool`, dùng lại `attributedAgent` đã có
  trong `agentTasks.ts`. Trên dây vẫn là tên agent thật — không bịa tên agent không tồn tại.

### Chặng 3 — Người vận hành là người tham gia · BẮT BUỘC

- `model/interactionLog.ts` (thuần, có test) + `state/InteractionLogContext.tsx` (`useReducer` +
  `createContext`). **Đây là React built-in, không phải state manager mới** — cùng khuôn với
  `AuthProvider` / `RouteContext` đã có, nên không vi phạm §6 #6.
- Provider đặt **trong `OperatorConsoleDashboard`**, không phải `AppProviders` — log là việc của
  console, đặt toàn cục là gánh nặng thừa cho driver app.
- Ghi log ở **10 handler** đã có, tại callback `onSuccess`/`onError` **chứ không lúc bấm** — bấm mà
  lỗi thì log phải nói là lỗi.
- **Ghi trong handler, không ghi trong `operatorMutations.ts`** — file đó dùng chung với màn hình
  khác; nhét log vào là rò rỉ sang nơi không có log.

### Chặng 4 — Bước thực thi sau khi duyệt · NÊN CÓ

- Ánh xạ `AuditEntry` → dòng log qua `auditLabels.ts` đã có.
- **Trung thực về chủ thể:** các bước sau duyệt do NestJS làm, **không phải** agent trong đồ thị →
  gán actor riêng `[THỰC THI]`. Không dán nhãn `[DISPATCH_AGENT]`. Cùng lý lẽ đã ghi trong TASKS.md
  về việc không dựng thẻ cho agent không tồn tại.
- `auditQuery` poll 60 giây, quá chậm để đọc ra "trực tiếp" → thêm `invalidateQueries(audit)` vào
  nhánh thành công của `activate` và `releaseDispatch`.
- **Trùng dòng: chấp nhận, không gộp.** Dòng tức thì phía client và bản ghi audit từ DB là cùng một
  sự kiện; bản từ DB gắn tiền tố `[LƯU]`. Đọc ra thành "đã bấm" rồi "đã lưu" — chấp nhận được, và
  tiết kiệm một ngày công so với đối chiếu khóa.

### Chặng 5 — System prompt & narration LLM · CÓ LÀM

- `prompts.py` cấu trúc lại kiểu agent production: vai trò → bối cảnh nghiệp vụ → hợp đồng tool →
  cách làm việc → ranh giới. **Giữ nguyên `_COMMON`** — nó đang gánh §10.1, không được pha loãng.
- Câu chốt tạo ra narration: *"Trước mỗi lượt gọi tool, viết một câu ngắn nói bạn đang kiểm tra gì
  và vì sao."* Đây chính là thứ làm `reply.content` không rỗng ở lượt có tool_calls.
- Ranh giới viết là *"bạn mô tả và diễn giải; KHÔNG chọn phương án, KHÔNG phê duyệt, KHÔNG phát
  thưởng"* — tránh chữ "nêu ý kiến" có thể đọc thành được phép khuyến nghị. `_recommend()`
  (`graph.py:63`) là deterministic và phải giữ độc quyền việc chọn.
- **Cố ý KHÔNG chạy `_numbers_are_grounded()` lên narration.** Validator đó tồn tại để canh
  `explanation.text` — thứ có dict nguồn xác định để đối chiếu. Narration giữa chừng không có dict
  nguồn nào; chạy validator lên nó là diễn. Thay vào đó gắn `source="llm"` trên dây, tô màu khác và
  có chú giải *"dòng do LLM viết"*.
- Rủi ro với CI/parity/eval bằng **0**: prompt chỉ đọc trong nhánh `run_with_llm`, không với tới
  được khi `llm_routing_enabled=false` — tức là ở mặc định của dự án, của CI và của eval.

---

## 5. Quyết định và đánh đổi

### 5.1. Ranh giới an toàn — không được vượt

| Rủi ro | Chốt chặn |
|---|---|
| Log trở thành đầu vào của một quyết định | Không module nào đọc `RunLog`; sink chỉ ghi. Nhật ký là **điểm cuối, không bao giờ là nguồn** |
| Nút trong popup tạo đường thứ hai tới cổng duyệt | **Popup chỉ đọc, không có control nào.** Một nút trong log là con đường thứ hai tới §11.1 |
| Endpoint mới bị nhầm là kênh lệnh | Không có endpoint mới; `events` đi nhờ `GET /runs/{id}` |
| "Đã log được thực thi thì đưa luôn vào đồ thị" | Ngoài phạm vi. `execute_relocation`/`issue_offers` vẫn vắng mặt ở mọi allowlist, đã có test canh |
| Prompt dài làm LLM nói sai số | Bán kính đúng một dòng log; `explanation.text` vẫn được `_numbers_are_grounded` canh |

Không WebSocket (§4.2). Không dependency mới. Không đổi NestJS. Log **không thay History Store**
(§9 #5) — sự thật nghiệp vụ vẫn append-only ở DB.

### 5.2. MA-Q8 được trả lời

Câu hỏi mở MA-Q8: *"Đóng panel có được phép mất lượt phân tích đang chạy không?"*

`usePipelineRun` hiện nằm trong `PipelineModal`, mà dashboard render `{pipelineOpen && <PipelineModal/>}`
→ **đóng panel là hủy luôn lượt chạy**. Một popup log chết khi thu gọn thì vô nghĩa.

**Trả lời: không.** Nâng hook lên `OperatorConsoleDashboard`, panel nhận `run` qua props.
**Chấp nhận đánh đổi:** polling 2 giây tiếp tục chạy nền khi panel đóng mà run còn RUNNING — nó đã
tự dừng khi DONE/FAILED.

### 5.3. Thứ tự cắt khi thiếu thời gian

1. Giữ log qua reload (`sessionStorage`)
2. Dòng thực thi từ audit — lùi về chỉ có sự kiện người vận hành, vẫn mạch lạc
3. Narration LLM + nâng prompt — log deterministic đã đủ, và LLM mặc định tắt
4. `narration` cho `route_trigger` / `generate_plans` / `quality_gate`

**Lõi không cắt được:** Chặng 1 + Chặng 2 + ghi log 4 handler cổng duyệt.

---

## 6. Kiểm chứng

- `apps/ai`: `pytest -q` (**parity xanh mà không sửa test**), `ruff check`, `mypy`
  (`disallow_untyped_defs = true` → module mới phải annotate đầy đủ).
- `apps/frontend`: `npx tsc -b`, `npx oxlint src` (giữ nguyên 11 cảnh báo nền), `npx vitest run`.
- `apps/backend`: `npx jest src/ai`. `eval_decision_flow.py` vẫn 8/9 PASS.
- **Chạy thật** (`VITE_DATA_SOURCE=mock`, Playwright trong `.venv`): chụp ba trạng thái — thu gọn,
  mở lúc đang chạy, sau khi duyệt.

> **Tiêu chí nghiệm thu của Chặng 1: dòng phải hiện dần, không hiện một lượt.**
> Đây là thứ chỉ chạy thật mới thấy — test không bắt được.
