# Kế hoạch triển khai: AI Agent Interaction Log

**Ngày:** 28/08/2026 · **Nhánh:** `integrate/multi-agent-orchestration` · **Task:** MA-6.1…MA-6.15

*Cập nhật 28/08/2026 — PM bổ sung hai yêu cầu: vòng chờ người vận hành hiện thành dòng log, và ô
nhập cho phép sai agent chạy lại tool quan sát. Xem §2.5, §3.6, §3.7, Chặng 6–7, và §5.1 (một điều
luật an toàn đã được viết lại, không phải bỏ đi).*

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

Bản kế hoạch đầu chỉ lấp được ba mắt xích giữa. Hai đầu còn đứt:

- **"người duyệt"** là một khoảng lặng trong log. Agent trình phương án xong là hết dòng, log đứng
  im cho tới khi có người bấm. Nhìn vào không phân biệt được *hệ thống đang chờ mình* với *hệ thống
  đã chết*.
- **"người vận hành giao việc"** mới đúng ở đúng lần khởi động. Đang xem mà muốn hỏi thêm — dự báo
  zone khác, thời tiết ra sao — thì phải rời màn hình.

Chặng 6 và Chặng 7 lấp đúng hai chỗ đó: một **dòng chờ duyệt treo ở đáy log**, và một **ô nhập chỉ
gọi được tool quan sát**. Không phải tool quyết định — ranh giới này là toàn bộ nội dung §3.6.

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

## 2. Hiện trạng — năm phát hiện định hình thiết kế

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

### 2.5. Đồ thị đã kết thúc trước khi người vận hành bấm duyệt

Docstring `graph.py` dòng 8–10 nói thẳng:

> Đồ thị dừng ở trạng thái `PROPOSED`. Không có node `apply_relocation`, `campaign_gate` hay
> `issue_offers`: hai cổng phê duyệt và mọi side effect do NestJS giữ.

Lúc thẻ phương án hiện lên màn hình, `run_pipeline` đã trả về và thread đã thoát. **Không còn task
nào trong đồ thị để chạy tiếp.** Việc sau duyệt — điều xe, phát campaign — do NestJS làm.

→ **Hệ quả kiến trúc:** "agent đợi người rồi chạy tiếp" phải cài thành **trạng thái của phiên**, chứ
không phải trạng thái của đồ thị. Người vận hành nhìn thấy y hệt nhau; §3.7 ghi vì sao không dùng
`interrupt()` để làm cho nó "thật".

---

## 3. Kiến trúc

```
route tạo RunEntry{record, log} ──emit──> run_pipeline(emit=…) ──> GraphDependencies.emit
                                            ├─ ToolRegistry.invoke: tool_started/finished/denied
                                            ├─ graph nodes: agent_started/finished, narration
                                            └─ runner: narration (reply.content), warning
GET /runs/{id} → {**record, "events": log.snapshot()}     ← poll 2 giây thấy dòng hiện dần

POST /observe {session_id, text} ──emit──> observer (allowlist CON, chỉ đọc) ──> ObserveLog riêng
GET  /observe/{session_id} → {"events": […]}              ← luồng thứ hai, KHÔNG chạm PipelineState
```

**`PipelineState`, `ToolCall`, `_render`, `decision` — không đổi một dòng nào.**

### 3.1. Lược đồ sự kiện

Module mới `apps/ai/src/orchestration/run_log.py`:

```python
EventKind = Literal["run_started","agent_started","agent_finished","tool_started",
                    "tool_finished","tool_denied","narration","warning","run_finished",
                    # Chặng 6–7
                    "awaiting_approval","approval_resolved","operator_message"]

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

`awaiting_approval` là **dòng treo**: client giữ nó ở đáy log, có hiệu ứng nhấp nháy, cho tới khi
nhận `approval_resolved`. Nó không phải trạng thái máy — nó là cách nói cho người xem biết *hệ thống
đang chờ chính bạn*. Đúng một dòng, và nó không khoá gì cả.

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
| `awaiting_approval` | `routes_orchestration.py::_execute` — phát **ngay trước** `run_finished` khi state đạt `PROPOSED`. AI service là nơi duy nhất biết đồ thị dừng vì hết việc hay vì lỗi |
| `approval_resolved` | client, tại `onSuccess`/`onError` của approve/reject/revise — đúng 3 trong 10 handler Chặng 3 đã ghi log |
| `operator_message` | client, ngay lúc gửi. Câu trả lời quay về qua `GET /observe/{session_id}` |

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

### 3.6. Agent quan sát — agent thứ tư, chỉ-đọc

`decision_tools.py:274` đã nhóm sẵn đúng bốn tool quan sát, không phải dựng mới:

```python
AGENT_ASSESSMENT: ("run_forecast", "get_weather", "get_travel_conditions", "get_supply_state")
```

Agent mới chỉ là một **tên thứ tư** dùng lại `run_with_llm` (đã generic sẵn: `agent` + `registry` +
`system_prompt`) với allowlist là **tập con** của trên:

```python
AGENT_OBSERVER = "observer"
registry.allow(AGENT_OBSERVER, frozenset({
    "run_forecast", "get_weather", "get_travel_conditions", "get_supply_state",
}))
```

Ba nhóm cố ý **không** có mặt, và lý do khác nhau ở từng nhóm:

| Vắng mặt | Vì sao |
|---|---|
| `compute_relocation` | Sinh ra phương án. Chat mà đẻ được plan là đẻ ra ngoài cổng duyệt §11.1 |
| `render_explanation` | Văn bản đi kèm quyết định, có `_numbers_are_grounded` canh riêng — không cho đi đường vòng |
| `execute_relocation`, `issue_offers` | Chưa từng đăng ký ở bất kỳ đâu (`registry.py` dòng 8). Không phải bỏ sót — prompt injection vì thế không mở được đường tới tiền hay tới xe |

**"Chạy lại phương án đi" thì observer không tự chạy.** Nó trả lời, và client hiện nút gọi
`POST /runs` như bình thường → **run mới, `run_id` mới, thẻ mới, cổng duyệt cũ**. Không có đường nào
sửa tại chỗ plan đang chờ duyệt — đó là cách duy nhất giữ `expectedVersion` còn nghĩa.

**Hai chế độ, và chế độ không-LLM làm trước.** `llm_routing_enabled` mặc định `False`
(`config.py:58`) — mặc định của dự án, của CI và của eval. Nên ô nhập có hai hình thái:

- LLM **tắt** → command palette: `/forecast zone 7`, `/weather`, `/supply`. Gọi thẳng registry,
  deterministic, chạy được trong CI, và **không chết giữa buổi trình bày vì hết quota**.
- LLM **bật** → câu chữ tự nhiên qua `run_with_llm`, hỏng ở đâu rơi về đúng bốn lệnh trên.

Làm chế độ lệnh trước vì nó là cái chắc chắn chạy được lúc demo; chế độ LLM là phần tô thêm.

### 3.7. Vì sao không dùng `interrupt()` để pause thật

`langgraph` có `interrupt()` + resume, và đồ thị **đã** compile với `InMemorySaver()`, `thread_id`
đã gắn với `run_id`. Về mặt thư viện thì làm được. Không làm, ghi lại lý do:

1. **Phải kéo side effect vào đồ thị.** Muốn "chạy tiếp sau khi duyệt" thì đồ thị phải có node sau
   duyệt — tức `apply_relocation` / `issue_offers` chui vào graph. Ngược thẳng quyết định đã chốt ở
   docstring `graph.py` và ở §11.1: gate và side effect do NestJS giữ.
2. **`InMemorySaver` không chịu được restart.** Một lượt chờ duyệt kéo dài vài phút mà server nạp
   lại là mất trắng. Pause "thật" nhưng dễ vỡ hơn pause "giả" là đánh đổi lỗ.
3. **Đúng đường code parity đang canh.** `state["decision"] == http_response.json()` byte-identical;
   thêm interrupt là đổi hình dạng lượt chạy, bốn ngày trước bàn giao.
4. **Người vận hành không phân biệt được.** Hệ thống *thật sự* đứng im chờ người bấm ở cả hai
   phương án. Khác biệt duy nhất là một process có bị treo hay không — thứ không hiện ra màn hình.

Đổi lại: `awaiting_approval` phải do AI service phát (§3.2), vì chỉ nó biết đồ thị dừng vì **hết
việc** hay vì **lỗi** — client đoán sẽ đoán sai ở đường FAILED.

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

**Bốn chỗ lệch so với bản kế hoạch đầu, ghi lại vì mỗi chỗ đều có lý do riêng:**

1. **Hai trạng thái, không phải ba.** Bỏ nút đóng, chỉ còn mở ↔ thu gọn (PM chốt 28/08). Đóng
   hẳn thì phải có chỗ mở lại, mà chỗ đó nằm ngoài danh sách file của chặng này — thu gọn
   thành thanh mỏng đã trả lại đủ chỗ cho bản đồ.
2. **`usePipelineRun()` không nhận tham số**; horizon và snapshot đi vào ở `start()`. Không
   phải lựa chọn thẩm mỹ: `OperatorConsoleDashboard` có **ba guard clause trả về sớm** (đang
   tải plan, đang tải snapshot, lỗi snapshot) đứng *trước* chỗ hai giá trị đó được tính, nên
   hook phải gọi được khi chúng chưa tồn tại. Lợi thêm: đọc ngay lúc bấm thì không có closure
   cũ nào để lỡ chạy sai horizon.
3. **`position: fixed`, `z-index: 40`** — không phải `absolute` neo vào `.nf-ops-workspace`.
   `.nf-pipeline-stage` **không có khai báo CSS nào**, nên tab `connect` nằm trong luồng
   thường và đẩy workspace lên; neo theo workspace đưa nhật ký ra ngoài vùng nhìn đúng lúc nó
   cần được nhìn nhất (đã dựng lại được bằng Playwright: `y = -198`). `40` là cố ý nằm **dưới**
   `z-50` của `Dialog`: hộp thoại phê duyệt phải phủ được nhật ký. Và `bottom: 68px` chứ không
   `16px` — ở `16px`, popup **che trọn nút "Chạy phân tích"** ở footer panel: `elementFromPoint`
   tại tâm nút trả về chính popup, ở cả trạng thái mở lẫn thu gọn. Đo lại sau khi sửa: chồng lấn
   0 px.
4. **Mock adapter nhả dòng dần** (4 dòng mỗi lượt poll) thay vì trả cả mảng ngay. Bắt buộc,
   không phải tiện tay: tiêu chí nghiệm thu §6 là *"dòng phải hiện dần"*, và bản mock là nơi
   duy nhất kiểm được điều đó mà không cần dựng AI service.

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

**Một chỗ lệch so với kế hoạch, ghi lại vì nó là bớt việc chứ không phải bỏ sót:**

Kế hoạch dự kiến `state/InteractionLogContext.tsx` với `useReducer` + `createContext`. Kiểm lại
thì **cả mười handler đều nằm trong chính `OperatorConsoleDashboard`** — không có ranh giới
component nào để vượt qua, nên Context ở đây là nghi thức chứ không phải cơ chế. Thay bằng
`useOperatorActionLog` (một `useState` + hai callback) và một module thuần `operatorLog.ts`.
Cùng kết quả, ít máy móc hơn. Luật "không ghi trong `operatorMutations.ts`" giữ nguyên: file đó
dùng chung với màn hình khác.

Thêm một quyết định nhỏ: `origin` tách **`operator`** (câu vừa gõ) khỏi **`action`** (thao tác đã
bấm). Một câu gõ vào là *ý muốn*, một thao tác đã xong là *sự việc* — trộn lại là làm mờ đúng chỗ
người đọc cần phân biệt. Hai cổng §11.1 còn mang mã riêng (`GATE_PLAN_APPROVED`,
`GATE_CAMPAIGN_CONFIRMED`) và được tô khác, vì đọc lại nhật ký về sau thì thứ phải tìm thấy trước
tiên là "ai đã quyết định gì", không phải agent đã gọi tool nào.

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

### Chặng 6 — Vòng chờ người vận hành · BẮT BUỘC

Lấp mắt xích "người duyệt" ở §1. Ba mảnh, không mảnh nào chạm đồ thị.

- **AI service:** phát `awaiting_approval` ngay trước `run_finished` khi state đạt `PROPOSED` —
  không phát ở đường FAILED, vì "đang chờ bạn" mà thật ra đã hỏng là nói dối người xem.
- **Client:** dòng treo ở đáy log, nhấp nháy, kèm số phương án đang chờ; `approval_resolved` từ
  handler approve/reject/revise thay nó bằng dòng tĩnh. Mạch đọc ra:

  ```
  [17:02:09] [DISPATCH_AGENT] > 3 phương án đã chấm điểm, đề xuất PLAN_B
  [17:02:09] [GRAPH]          > ⏸ chờ người vận hành duyệt — hệ thống không tự quyết
  [17:04:31] [NGƯỜI VẬN HÀNH] > đã phê duyệt PLAN_B (v1)
  [17:04:31] [THỰC THI]       > tạo lệnh điều 15 xe Cầu Giấy → Hoàn Kiếm
  ```

- **Thẻ phương án:** nút trên thẻ **chỉ gọi lại** `openDialog("approve")` đã có
  (`OperatorConsoleDashboard.tsx:805`). Không viết đường mới, không nút duyệt-một-chạm.

**Không làm nút "duyệt nhanh" bỏ qua popup.** `approve()` (`OperatorConsoleDashboard.tsx:474`) đang
mang bốn lớp canh — `canReviewPlan`, `expectedVersion`, `recoverFromActionConflict`, và hộp thoại
xác nhận. Một nút đi vòng qua chúng là cửa thứ hai vào §11.1 (xem §5.1). Nhãn trên thẻ phải nói
đúng việc nó làm: **mở phương án để xem**, không phải "duyệt".

**Test mới:** `awaiting_approval` xuất hiện đúng một lần ở đường PROPOSED và **không** xuất hiện ở
đường FAILED · dòng treo bị thay chứ không bị nhân đôi khi `approval_resolved` tới · thẻ phương án
gọi đúng handler cũ (assert trên `openDialog`, không assert trên network).

### Chặng 7 — Ô nhập cho người vận hành ra lệnh · BẮT BUỘC

> **Sửa 28/08 theo yêu cầu của PM.** Hai điểm đảo so với bản viết ở trên:
>
> 1. **Popup luôn hiện**, không đợi có lượt chạy. Nó là chỗ *ra lệnh*, không chỉ chỗ xem kết
>    quả — mà một chỗ ra lệnh chỉ xuất hiện sau khi đã ra lệnh bằng đường khác thì vô nghĩa.
> 2. **LLM là đường chính, bảng từ khoá là đường đỡ** — không phải ngược lại. `apps/ai/.env`
>    trên máy phát triển đã có `LLM_ROUTING_ENABLED=true` và khóa gateway thật, nên ngôn ngữ
>    tự nhiên chạy được ngay; `intent.py` chỉ vào cuộc khi tầng LLM hỏng. Mặc định của
>    `config.py` vẫn là `false`, nên CI và eval chạy đúng đường đỡ — tức đường phải còn sống
>    khi hết quota giữa buổi trình bày.
>
> Phạm vi PM chốt: **chạy + hỏi**. Hai cổng phê duyệt vẫn chỉ mở bằng nút bấm.

Lấp mắt xích "người vận hành giao việc" ở §1. Thiết kế ở §3.6.

- **AI service:** `AGENT_OBSERVER` + allowlist chỉ-đọc, `POST /observe` (202 + `message_id`, chạy
  trong `to_thread`), `GET /observe/{session_id}` cùng khuôn `GET /runs/{id}`. `ObserveLog` là
  **object riêng, seq riêng** — không dùng chung `RunEntry`, vì vòng đời khác hẳn: phiên hội thoại
  sống theo người xem, run sống theo trần 64.
- **Client:** ô nhập ở đáy popup log. Chế độ lệnh trước (`/forecast`, `/weather`, `/supply`), chế độ
  LLM sau. `operator_message` hiện ngay khi gửi để ô nhập có phản hồi tức thì; câu trả lời về sau
  theo lượt poll.
- **Trộn hai luồng:** `interactionLog.ts` đã phải trộn ba nguồn sẵn (sự kiện run, thao tác người
  vận hành, dòng audit). Nguồn thứ tư đi đúng khuôn đó — sắp theo `seq` **trong cùng một nguồn**,
  theo thứ tự đến giữa các nguồn. Không cố đồng bộ hai không gian `seq`; terminal cũng làm vậy.
- **Nhãn nguồn phải khác nhau trên màn hình:** dòng của pipeline và dòng của phiên hỏi-đáp không
  được lẫn. Một câu quan sát trông như một bước của lượt chạy là hiểu nhầm tệ nhất mà tính năng này
  có thể gây ra.

**Hai chỗ cố ý deterministic, không giao cho LLM** — lý do khác nhau ở từng chỗ:

- **Từ chối lệnh chạm cổng phê duyệt**, kiểm *trước* khi gọi LLM. Model không có tool để duyệt
  nên nó không thể duyệt, nhưng nó viết được một câu nghe như đã duyệt — và một dòng nhật ký
  nói dối về tiền và về điều xe thì tệ hơn là không có dòng nào. Bảng từ khoá xếp nhóm cổng
  **trước** mọi nhóm khác: "duyệt phương án" chứa cả `duyet` lẫn `phuong an`, đảo thứ tự là mở
  một đường vòng qua §11.1 bằng một câu tiếng Việt bình thường.
- **Phát lệnh chạy phân tích.** Không phải lựa chọn mà là sự thật cấu trúc: allowlist observer
  chỉ-đọc nên nó *không có tool nào* để diễn đạt "hãy chạy một lượt". Route trả về directive,
  client gọi `POST /runs` như khi bấm nút. Một đường tạo run, không phải hai — và client có
  allowlist directive riêng, nên đó là hai khoá cho một não.

**Test mới:** observer gọi `compute_relocation` → `tool_denied`, không phải kết quả · mọi câu
chạm cổng đều bị chặn và **không tool nào được gọi** trên đường đó · đường đỡ chạy được với
`llm_routing_enabled=false` · client bỏ qua mọi directive lạ (`approve_plan`, `issue_offers`,
kể cả `START_RUN` viết hoa) · **test giá trị cao nhất của chặng:** chạy pipeline khi có một
phiên observer đang hoạt động và khi không có, assert `decision` bằng nhau từng byte.

---

## 5. Quyết định và đánh đổi

### 5.1. Ranh giới an toàn — không được vượt

| Rủi ro | Chốt chặn |
|---|---|
| Log trở thành đầu vào của một quyết định | **Sự kiện không bao giờ đi vào `PipelineState`.** Xóa sạch log và mọi phiên hỏi-đáp, từng `decision` vẫn giống hệt từng byte — kiểm bằng MA-6.6 và MA-6.14 |
| Nút trong popup tạo đường thứ hai tới cổng duyệt | **Popup không có control hành động nào.** Ô nhập không phải ngoại lệ: nó chỉ đưa chữ cho một agent chỉ-đọc. Câu chạm cổng bị chặn ở server *trước* LLM, rồi bị chặn lần nữa bởi allowlist directive của client |
| Chat sai được agent làm việc thật | Allowlist observer là **tập con** của `AGENT_ASSESSMENT`; `ToolRegistry.invoke` ném lỗi chứ không cảnh báo, và phát `tool_denied` để lần thử hiện lên màn hình |
| "Chạy lại đi" sửa tại chỗ plan đang chờ duyệt | Observer không tự chạy pipeline. Người dùng bấm → `POST /runs` → **run mới, thẻ mới, cổng cũ**. `expectedVersion` vì thế còn nghĩa |
| Endpoint mới bị nhầm là kênh lệnh | `events` đi nhờ `GET /runs/{id}`. `POST /observe` là endpoint mới **duy nhất**, và nó không tới được tool nào có side effect |
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
3. Narration LLM trong đồ thị + nâng prompt — log deterministic đã đủ
4. `narration` cho `route_trigger` / `generate_plans` / `quality_gate`

**Lõi không cắt được:** Chặng 1 + Chặng 2 + ghi log 4 handler cổng duyệt + **Chặng 6** +
**Chặng 7**.

Chặng 7 vào lõi sau khi PM đảo phạm vi: ô nhập giờ là đường ra lệnh chính, cắt nó đi là cắt
mất cách người vận hành nói chuyện với hệ thống. Đường đỡ bằng từ khoá cũng không cắt được —
nó là thứ duy nhất chắc chắn chạy khi gateway hỏng.

Chặng 6 vào lõi vì nó là thứ làm cho log đọc ra thành một mạch có người trong đó. Chặng 7 thì không:
nó thêm chiều sâu, nhưng cắt đi vẫn còn một câu chuyện hoàn chỉnh. Cắt theo thứ tự trên, mỗi bước
vẫn để lại một bản demo tự đứng được — đó là tiêu chí chọn thứ tự, không phải công sức bỏ ra.

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
>
> *Đã kiểm 28/08 bằng Playwright trên `VITE_DATA_SOURCE=mock`: số dòng qua bốn lát cắt là
> **8 → 12 → 20 → 23**, không lỗi console. Cùng lượt chạy đó bắt được lỗi vị trí ở mục 3 phía
> trên — 380 test frontend đều xanh trong khi popup nằm ngoài màn hình.*

Hai tiêu chí nghiệm thu bổ sung, cũng chỉ chạy thật mới thấy:

> **Chặng 6: từ lúc agent trình phương án tới lúc người bấm duyệt, log phải nói được là nó đang
> chờ.** Màn hình đứng im không kèm dòng chờ là hỏng, kể cả khi mọi test xanh.
>
> **Chặng 7: hỏi một câu quan sát trong lúc pipeline đang chạy, `decision` không được đổi.**
> Chụp lại `decision` trước và sau — đây là bản chạy tay của MA-6.14.
