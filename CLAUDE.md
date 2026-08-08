# CLAUDE.md — chỉ dẫn bắt buộc cho mọi phiên AI coding

Áp dụng cho **mọi** công cụ AI làm việc trên repo này (Claude Code, Cursor, Codex, Gemini, Copilot, Antigravity). Không phải gợi ý — là ràng buộc. Vi phạm các luật ở [§3](#3-luật-cứng--vi-phạm-là-làm-hỏng-kết-quả), [§4](#4-scope-control), [§8](#8-security) hoặc [§13](#13-file-ai-không-được-tự-ý-thay-đổi) làm **mất hiệu lực kết quả dự án**, không chỉ là lỗi style.

Repo là dự án **GSM-14 · NovaFour** (VinUni AI20K Build Phase), khởi tạo từ template AI20K Agent.

---

## 1. Đọc gì trước khi gõ dòng code đầu tiên

**Bắt buộc mở tài liệu tương ứng trước khi implement.** Không đoán từ tên file, không suy từ code có sẵn.

| Loại việc | Mở trước |
|---|---|
| Bất kỳ việc gì | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — tìm task ID (T0.1–T11), đọc **Acceptance Criteria** của nó |
| Hiểu hệ thống / thêm module mới | [ARCHITECTURE.md](ARCHITECTURE.md) §3 diagram, §4 trách nhiệm, §6 dependency |
| Viết/sửa endpoint | [API_CONTRACT.md](API_CONTRACT.md) — endpoint, schema, mã lỗi, `warnings[]` |
| Viết/sửa Pydantic model, schema DB, config | [DATA_CONTRACT.md](DATA_CONTRACT.md) — 9 entity, DDL, `policy.yaml` 19 key, ASSUMPTION register |
| Viết state machine, router, fallback, xử lý lỗi | [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) |
| Viết test, báo cáo số liệu | [EVALUATION_PLAN.md](EVALUATION_PLAN.md) |
| Chi tiết nghiệp vụ mà 6 file trên không nói | [docs/SPEC-GSM14-NovaFour-Unified.md](docs/SPEC-GSM14-NovaFour-Unified.md) — mục §5.x tương ứng |

### 1.1. Thứ tự ưu tiên khi tài liệu mâu thuẫn

```
SPEC Unified §10  >  SPEC Unified (phần còn lại)  >  ARCHITECTURE / API_CONTRACT / DATA_CONTRACT
                                                     / AGENT_WORKFLOW / IMPLEMENTATION_PLAN / EVALUATION_PLAN
                                                  >  docs/Data-Contract-Data-AI.md, feature_dictionary.md
                                                  >  docs/Data-Checklist, DataBA-Decisions
                                                  >  code hiện có
```

`docs/SPEC-AI-Agent-Phan-Bo-Xe-Gio-Cao-Diem.md` là spec v1.0 **đã bị thay thế** — chỉ tra cứu, không làm căn cứ.

**Code hiện có xếp cuối.** Nếu code mâu thuẫn tài liệu, code sai — trừ khi tài liệu đã ghi nhận đó là nợ dữ liệu ([DATA_CONTRACT.md §9](DATA_CONTRACT.md#9-nợ-dữ-liệu--12-điểm-lệch-giữa-tài-liệu-và-đĩa), D1–D12).

### 1.2. Trạng thái repo

- `docs/` + 6 tài liệu thiết kế ở root: **đã chốt**, là nguồn sự thật.
- `src/`: **vẫn nguyên boilerplate template** (`example_node.py`, `example_tool.py`, `ChatRequest/ChatResponse`, LangGraph chat demo). Đây **không** phải kiến trúc mục tiêu. **Đừng bắt chước nó, đừng mở rộng nó** — nó bị xóa ở task T0.5.
- `config/policy.yaml`, `src/simulation/metrics.py`, `config/driver_registry.json`: **chưa tồn tại**, là task chặn T0.1/T0.3/T0.6.

---

## 2. Kiến trúc mục tiêu

**Pipeline mô phỏng deterministic 3 khối, KHÔNG phải chat agent.** Không LLM trong luồng chính, không LangGraph, không vector DB, không WebSocket.

```
Replay Engine ──snapshot(§4.1)──> Khối A: Model 1 Forecasting ──forecast(§4.2)──┐
                                                                                v
                              Khối B: Model 2 Hotspot ──hotspot(§4.3)──> Model 3 Relocation Optimizer
                                                                                │
                                                          relocation_plan(§4.4) v
                                          Simulator Before/After ──> Explanation Engine
                                                                                │
                                                   UI vận hành: Revise/Approve/Reject (§4.5)
                                                                                │
                                     residual_gap ─> Khối C: Activation Engine ─> offer(§4.8)
                                                                                v
                                              Driver App: Nhận/Từ chối ──response(§4.9)──┐
                                                                                v        │
                                        enroute_supply zone đích ──> re-simulate <───────┘
                                                                                │
                                                          History Store (§4.6, append-only)
```

Ba điểm mấu chốt:

- **Vòng phản hồi đóng (FR-13):** tài xế bấm Nhận → `enroute_arrivals` zone đích tăng → sau `eta_steps` thành `idle_supply` → Simulator tính lại → so sánh **3 kịch bản** `no_action` / `plan_only` / `plan_activation`. Không có module riêng — logic nằm ở §5.5 + §5.11 + contract §4.9.
- **Hai baseline độc lập** (§5.14): `no-action` (mốc của Khối B/C) và `historical average` (mốc của Model 1, đồng thời là **mock của Model 1**).
- **`src/simulation/metrics.py` là lõi metric dùng chung.** Baseline và Simulator **bắt buộc** import cùng module này. Viết lại công thức lần thứ hai trong `simulator.py` làm mọi so sánh KPI mất hiệu lực — spec cấm rõ ràng (§5.14.1), và có test tĩnh chặn trong CI.

### 2.1. Ánh xạ module → spec → contract

| Module | Spec | Contract in/out | Task |
|---|---|---|---|
| Replay Engine + synthetic generator | §5.1 | → §4.1 | T0.4 |
| Model 1 — Forecasting (LightGBM quantile p10/p50/p90) | §5.2 | §4.1 → §4.2 | T1 |
| Model 2 — Hotspot Detection (+ hysteresis) | §5.3 | §4.2 → §4.3 | T2 |
| Model 3 — Relocation Optimizer (greedy theo severity) | §5.4 | §4.3 → §4.4 | T3 |
| Simulator Before/After (3 kịch bản) | §5.5 | §4.4 → metrics | T4 |
| Explanation Engine (Lớp 1 template) | §5.6 | §4.4 → text | T5 |
| HITL Revise/Approve/Reject | §5.7 | §4.5 | T6 |
| History Store | §5.8 | §4.6 | T6 |
| Cảnh báo & Fallback | §5.9 | — | mọi task |
| Activation Engine (Khối C) | §5.11 | §4.7 → §4.8 | T7 |
| UI vận hành / Driver App | §5.12 / §5.13 | §4.8 → §4.9 | T8 |
| Baseline & đối chứng | §5.14 | — | T0.3, T0.4 |

---

## 3. Luật cứng — vi phạm là làm hỏng kết quả

Từ ràng buộc dự án (§1.6) và nguyên tắc kiến trúc (§3.2).

1. **Contract-first — không sửa field cũ sau W2.** Chỉ được thêm field **optional**. Contract §4.1–4.9 khóa cuối W2 (I-08).
2. **`config/policy.yaml` là nguồn ngưỡng duy nhất (19 key).** Cấm hard-code ngưỡng. Chỉ `src/common/policy.py` được đọc file. `avg_vehicle_speed_kmh` dùng chung cho Optimizer, Generator/Simulator và Activation Engine — **một giá trị, không mỗi nơi một số**.
3. **Ngân sách incentive tách riêng khỏi ngân sách điều chuyển** (C-09): `incentive_budget_cap` và `budget_cap` là hai trần **độc lập, không bù trừ**. Chốt theo **cam kết xấu nhất** (giả định 100% nhận), không theo kỳ vọng.
4. **Deterministic.** Seed cố định: synthetic train=42 / test=2026, driver response=7, nowcast=13. Simulator deterministic. Mọi run gắn `model_version`. **Không dùng random không seed.**
5. **Mock-first (C-06):** module chưa xong phải có mock trả **đúng contract**; mọi module có fallback riêng; fallback không gọi fallback.
6. **Mọi metric tách theo 4 regime** `normal / peak / rain / rain_peak`. `rain_peak` là thước đo thành công chính — **không được giấu trong số tổng**. Gắn nhãn regime chỉ bằng `src/common/regime.py`, ngưỡng `rain ⇔ rain_mm_h ≥ 0.5`.
7. **Không state ẩn:** 100% quyết định (plan, revise, approve/reject, **và phản hồi tài xế**) ghi vào History Store, **append-only**, ép bằng trigger DB.
8. **Tài xế luôn được từ chối** (C-08): 1 chạm, lý do không bắt buộc, **không chấm điểm, không xếp hạng, không chế tài**. Offer hết hạn tự hủy im lặng. Không hủy ngược offer đã gửi.
9. **Mọi số KPI là simulation proxy trên synthetic data** (C-07). Accept rate là **giả định tham số hóa** — trình bày dạng phân tích độ nhạy 3 mức, và mọi bản ghi phải có `accept_rate_source` phân biệt `simulated_model` / `human_demo` / `mixed`.

### 3.1. Ba bất biến chạy trong CI

| Mã | Bất biến |
|---|---|
| INV-1 | `simulate(moves=[], include_activation=False)` khớp baseline đã khóa, sai số ≤ 1e-6 |
| INV-2 | Tổng cung toàn hệ thống ở `plan_only` **bằng** `no_action` (relocation chỉ dời, không tạo xe) |
| INV-3 | `enroute_supply == Σ enroute_arrivals[].units` ở **mọi** step |

Bất biến vỡ → **crash**, không tự sửa, không fallback. Che bằng fallback sẽ cho ra số KPI trông hợp lệ nhưng sai.

---

## 4. Scope control

### 4.1. Luật

| # | Luật |
|---|---|
| 1 | **Mỗi thay đổi phải truy ngược được về một task ID** (T0.1–T11) hoặc một mục spec `§x.y`. Không có neo → không làm. |
| 2 | **Không tự thêm chức năng ngoài SPEC**, kể cả khi "rõ ràng là tốt hơn". |
| 3 | **Không tự mở rộng phạm vi task.** Được yêu cầu sửa Model 2 thì không đụng Model 3. |
| 4 | **Không refactor cơ hội.** Thấy code xấu ở chỗ khác → báo, đừng sửa kèm. |
| 5 | Phát hiện việc cần làm ngoài task hiện tại → **ghi ra cho user quyết định**, không tự làm. |
| 6 | Giá trị spec để trống → dùng giá trị trong ASSUMPTION register và **giữ nguyên mã `[ASSUMPTION-nn]`**; không tự nghĩ số mới. |
| 7 | Thứ tự cắt phạm vi khi trễ lịch đã chốt ở §7.1 — **không cắt tùy hứng**. |

### 4.2. Ngoài phạm vi — không implement, không đề xuất "nâng cấp cho tốt hơn"

Đã bị cắt khỏi MVP ở §7.1 để hấp thụ Khối C:

- **Min-cost flow / OR-Tools** — bỏ hẳn; greedy theo severity là phương án chốt
- **Explanation Lớp 2 (LLM)** — chỉ làm nếu W5 dư thời gian; Lớp 1 template đã thỏa acceptance
- **WebSocket cho Driver App** — dùng polling 2 giây
- **Auth thật cho Driver App** — chọn `driver_id` từ dropdown demo

Ngoài phạm vi theo §1.5/C-05: RL/MARL, ST-GNN (DCRNN, Graph WaveNet, ST-MGCN, PDFormer, WGNN), fine-tuning, nowcasting model riêng, kết nối radar thời tiết thật, push notification thật (FCM/APNs/SMS/Zalo), thanh toán thưởng thật, GPS thật, surge pricing, matching cuốc khách, chấm điểm/xếp hạng tài xế, đấu giá mức thưởng.

---

## 5. Coding convention

### 5.1. Ràng buộc công cụ (từ [ruff.toml](ruff.toml) — không sửa file này để né lỗi)

```
target-version = "py311"      line-length = 120
lint.select = ["E","F","I","N","W","UP"]      lint.ignore = ["E501"]
format.quote-style = "double"                 format.indent-style = "space"
```

### 5.2. Quy ước dự án

| Hạng mục | Chốt |
|---|---|
| Ngôn ngữ định danh | **Tên hàm/biến/class tiếng Anh**, `snake_case` / `PascalCase` (ruff `N`) |
| Comment & docstring | **Tiếng Việt**, giải thích **vì sao**, không mô tả lại code |
| Layout module | Đúng cây `src/` ở [ARCHITECTURE.md §7](ARCHITECTURE.md#7-cây-thư-mục-mục-tiêu). Không tạo thư mục mới ngoài cây đó |
| Contract | Pydantic **v2**, 1 file/entity trong `src/contracts/`, tên file theo [DATA_CONTRACT.md §2](DATA_CONTRACT.md#2-message-contract--9-entity) |
| Type hints | Bắt buộc cho **public function** (tham số + return) |
| Ngưỡng | Truyền vào qua tham số, đọc từ `src/common/policy.py`. **Cấm literal ngưỡng trong module** |
| Số học metric | Chỉ ở `src/simulation/metrics.py`. Cấm cài lại ở nơi khác |
| Regime | Chỉ ở `src/common/regime.py`. Cấm `rain_mm_h > 0` rải rác |
| Haversine | Chỉ ở `src/common/haversine.py`, tính **on-the-fly**, không precompute ma trận 30×30 |
| ID | Sinh ở `src/common/ids.py`: `plan_id` UUID4, `H-nnnnnn`, `OF-nnnnnn`, `ACT-YYYYMMDD-HHMM-nn`, `DRV-nnnn` |
| Lỗi | Exception dự án ở `src/common/errors.py`, mang `error_code` khớp [API_CONTRACT.md §1.2](API_CONTRACT.md#12-error-response--thống-nhất-toàn-api) |
| Datetime | ISO-8601 **có offset `+07:00`**. Cấm naive datetime |
| Tiền | `int` VNĐ. Cấm float cho tiền |
| Import | Tuyệt đối (`from src.simulation.metrics import ...`); ruff `I` sắp xếp |
| Async | Chỉ ở tầng `src/api/`. Tầng model/optimizer/simulator là hàm đồng bộ thuần |

### 5.3. Ba điều cấm về cấu trúc

1. **Cấm import ngược tầng.** `src/common/` không import gì của dự án; `src/contracts/` chỉ import `common`; `metrics.py` không import `policy`, `yaml`, `forecasting`, `lgbm`.
2. **Cấm side effect lúc import.** Không đọc file, không load model ở top-level module.
3. **Cấm biến global khả biến.** Trạng thái bền chỉ nằm ở History Store và các bảng DB.

---

## 6. Dependency management

| # | Luật |
|---|---|
| 1 | **Không thêm dependency mới nếu chưa hỏi user.** Nêu tên, lý do, và cái nó thay thế được. |
| 2 | Chỉ được thêm vào `requirements.txt` các gói task đang làm **thực sự cần**, kèm ràng buộc phiên bản `>=`. |
| 3 | **Cấm** `langgraph`, `langchain`, `langchain-openai` (§6 NFR loại LangGraph khỏi luồng chính) — phải **gỡ** ở T0.5, không được thêm lại. |
| 4 | **Cấm** vector DB (`chromadb`, `faiss`, …), OR-Tools, thư viện WebSocket, SDK push notification, SDK thanh toán. |
| 5 | Bộ được duyệt cho MVP: `fastapi`, `uvicorn`, `pydantic`, `pydantic-settings`, `python-dotenv`, `pandas`, `numpy`, `pyarrow`, `pyyaml`, `lightgbm`, `scikit-learn`, `scipy`; dev: `ruff`, `mypy`, `pytest`, `pytest-asyncio`, `httpx`. |
| 9 | `requirements.txt` phải giữ dòng `# -*- coding: utf-8 -*-` ở đầu — pip trên Windows đọc file bằng cp1252 và vỡ ở ký tự tiếng Việt nếu thiếu. |
| 6 | Frontend: **chỉ** Vite + React + TypeScript. Không thêm UI framework nặng, không thêm state manager nếu chưa hỏi. |
| 7 | Gỡ gói nào thì gỡ luôn code dùng nó — không để import gãy. |
| 8 | Thay đổi `requirements.txt` phải chạy lại `pip install -r requirements.txt` và `pytest` trước khi báo xong. |

---

## 7. Testing

### 7.1. Luật

| # | Luật |
|---|---|
| 1 | **Code mới phải có test mới.** Không test → task chưa xong. |
| 2 | **Test không được gọi API thật.** CI chạy `APP_ENV=test`, `OPENAI_API_KEY=test-key`. Không còn fixture `mock_llm` — luồng chính không gọi LLM (ARCHITECTURE.md §8); mock của Explanation Lớp 2, nếu làm, đặt cạnh module đó. |
| 3 | Test phải **deterministic** — seed cố định, không phụ thuộc đồng hồ thật, không phụ thuộc thứ tự chạy. |
| 4 | Test viết theo **Acceptance Criteria của task** trong IMPLEMENTATION_PLAN, không tự nghĩ tiêu chí khác. |
| 5 | Sửa bug → thêm **test hồi quy tái hiện đúng bug đó** trước khi sửa. |
| 6 | **Cấm nới lỏng test để cho xanh.** Test đỏ → sửa code, hoặc báo user nếu tiêu chí sai. Cấm `pytest.mark.skip` không kèm lý do và task theo dõi. |
| 7 | Thay đổi chạm Simulator/metrics/baseline phải chạy được **INV-1/2/3**. |

### 7.2. Phân tầng test

Cây test theo [ARCHITECTURE.md §7](ARCHITECTURE.md#7-cây-thư-mục-mục-tiêu) — **không tạo thư mục test ngoài cây này**.

| Tầng | Ở đâu | Nội dung |
|---|---|---|
| Contract | `tests/test_contracts/` | Mọi ví dụ JSON trong SPEC §4 parse được; validator bắt đúng ca lỗi |
| Đơn vị | `tests/test_simulation/`, `test_optimizer/`, `test_activation/`, `test_api/` | Công thức, ràng buộc, biên |
| Tĩnh (kiến trúc) | `tests/test_architecture.py` | `simulator` import `metrics`; không cài lại công thức; `metrics` không nhiễm tham số; không `yaml.safe_load` ngoài `policy.py`; không hard-code ngưỡng |
| Bất biến | `tests/test_simulation/test_invariants.py` | INV-1/2/3 — **chạy trong CI từ W3** |
| Property-based | `tests/test_optimizer/`, `tests/test_activation/` | ≥ 100 snapshot có seed, 14 ràng buộc policy ([EVALUATION_PLAN.md §4.1](EVALUATION_PLAN.md#41-ràng-buộc-policy--test-property-based)) |
| Failure | cùng thư mục với module gây lỗi | 12 dòng §5.9 (F1–F12) + 4 ca bất biến vỡ (F13–F16) |
| E2E | `tests/test_api/` | Kịch bản demo mưa 17:00–19:00, 2 màn hình cùng `plan_id` |

### 7.3. Lệnh

```powershell
pytest tests/ -v
pytest tests/test_simulation/test_metrics.py -v                        # 1 file
pytest tests/test_simulation/test_invariants.py::test_inv1_baseline -v # 1 test
pytest -k "hotspot" -v                                                 # theo tên
```

---

## 8. Security

Repo demo, dữ liệu synthetic — nhưng **có ràng buộc an toàn thật** (C-03, C-07, C-08).

| # | Luật |
|---|---|
| 1 | **Không secret trong code, không commit `.env`.** Cấu hình qua biến môi trường; `.env.example` chỉ chứa khóa rỗng. |
| 2 | **Không gọi API thật ra ngoài** trong test và trong luồng MVP. Không API key thật trong repo, log, hay test fixture. |
| 3 | **Không lệnh tác động thật** (C-03): không điều xe thật, không push thật (FCM/APNs/SMS/Zalo), không thanh toán thưởng thật. `grep "fcm\|apns\|twilio\|zalo\|momo\|vnpay"` trong `src/` phải trả về rỗng. |
| 4 | **Không dữ liệu cá nhân thật** trong `driver_registry.json`: `display_name` chỉ dạng `"Tài xế {n}"`, không SĐT/email/biển số. `is_demo_account == true` cho 100% bản ghi — validator **từ chối** `false`. |
| 5 | **Riêng tư:** tài xế chỉ thấy dữ liệu của chính mình. `GET /drivers/{A}/offers` không được trả offer của B. |
| 6 | **Không trường chấm điểm tài xế** ở bất kỳ schema nào: `accept_rate_of_driver`, `driver_rank`, `driver_score`, `driver_tier`, `reliability` (C-08). |
| 7 | **Không có auth là quyết định phạm vi có chủ đích** (§7.1 #4, C-03) — không tự thêm auth, cũng không coi là lỗ hổng cần vá. |
| 8 | Mọi input từ API validate bằng Pydantic **trước** khi vào tầng nghiệp vụ. Truy vấn SQL dùng tham số hóa, cấm nối chuỗi. |
| 9 | Không log giá trị nhạy cảm (khóa, token) kể cả ở mức DEBUG. |

---

## 9. Logging

| # | Luật |
|---|---|
| 1 | Dùng `logging` chuẩn của Python, logger theo module (`logging.getLogger(__name__)`). **Cấm `print()`** trong `src/`. |
| 2 | Mức dùng đúng: `DEBUG` chi tiết dev · `INFO` mốc pipeline (step, plan sinh ra, campaign phát hành) · `WARNING` **mọi fallback** · `ERROR` bất biến vỡ, lỗi không phục hồi. |
| 3 | **Không nuốt lỗi im lặng.** Mọi fallback vừa ghi log `WARNING` vừa thêm mã vào `warnings[]` của response. |
| 4 | Log mang định danh truy vết được: `plan_id`, `campaign_id`, `offer_id`, `snapshot_t`, `model_version`. |
| 5 | **Log ≠ History Store.** Log để debug, có thể mất. Quyết định nghiệp vụ **bắt buộc** vào History Store (§3.2 #7) — không được chỉ log rồi coi là đã ghi nhận. |
| 6 | Không log nội dung nhạy cảm (§8 #9), không log toàn bộ snapshot 30 zone ở mức `INFO`. |
| 7 | `.ai-log/` là **hệ thống khác** — xem [§13](#13-file-ai-không-được-tự-ý-thay-đổi), tuyệt đối không đụng. |

---

## 10. Tool calling

### 10.1. Trong hệ thống được xây (router deterministic)

**Không có LLM chọn tool.** "Tool selection" là bảng tra 22 luật R1–R22 ở [AGENT_WORKFLOW.md §2.1](AGENT_WORKFLOW.md#21-bảng-router-chính).

| # | Luật |
|---|---|
| 1 | Thêm nhánh xử lý mới → **phải thêm một dòng vào bảng router** và một test tương ứng. Nhánh không có trong bảng là state ẩn. |
| 2 | Mọi module trong bảng có **fallback trả đúng contract** (C-06). Cấm trả `None`, cấm trả dict rỗng. |
| 3 | **Fallback không gọi fallback** — chuỗi sâu đúng 1 tầng. |
| 4 | Router **không đọc `policy.yaml` trực tiếp**; nhận ngưỡng qua tham số. |
| 5 | **Cấm đưa LLM vào luồng chính.** LLM chỉ được xuất hiện ở Explanation Lớp 2 (cờ tắt mặc định) và **không bao giờ** sinh `reason_text` của offer — văn bản đó đi kèm cam kết tiền thưởng. |

### 10.2. Trong phiên AI coding (công cụ của trợ lý)

| # | Luật |
|---|---|
| 1 | Đọc trước khi sửa: mở file và mục spec liên quan trước khi đề xuất thay đổi. |
| 2 | Ưu tiên công cụ chuyên dụng (đọc/sửa/tìm file) hơn lệnh shell tương đương. |
| 3 | **Cấm** chạy thủ công `scripts/log_hook.py`, `scripts/log_antigravity.py` — tạo entry giả, hỏng deliverable #4. |
| 4 | **Cấm** `git push --no-verify`, `git commit --no-verify`, và mọi cách bỏ qua pre-push hook. Hook lỗi → **báo user**. |
| 5 | **Cấm** lệnh phá hủy (`git reset --hard`, `git clean -fd`, xóa thư mục dữ liệu) nếu user chưa yêu cầu rõ. |
| 6 | Chỉ commit/push khi user yêu cầu. Đang ở `main` → tạo nhánh trước. |
| 7 | Chạy lệnh sinh lại dữ liệu (`generate_snapshots.py`, `compute_baseline_no_action.py`) **phải hỏi trước** — chúng ghi đè dữ liệu đã khóa. |

---

## 11. Human approval

### 11.1. Hai cổng người trong sản phẩm — bắt buộc, không được gộp

| Cổng | Ở đâu | Luật |
|---|---|---|
| **#1 Duyệt plan** | `POST /plans/{id}/approve` · `/revise` · `/reject` | `reject` **bắt buộc `note`**. Hệ thống **không tự approve** sau timeout. Mỗi hành động ghi 1 `history_record`. |
| **#2 Xác nhận phát hành offer** | `POST /plans/{id}/campaign`, **bắt buộc `confirm: true`** | **Approve plan KHÔNG tự phát offer.** Cổng #1 duyệt điều xe của hãng; cổng #2 duyệt cam kết tiền với người ngoài — hai loại rủi ro, hai ngân sách độc lập (C-09). |

`activation.engine.issue_offers()` chỉ được gọi từ route đã kiểm `confirm == true`. **Cấm** tạo bất kỳ đường tự động nào vòng qua hai cổng này, kể cả "cho tiện khi demo".

**Không cần người duyệt:** sinh plan `Proposed`, chạy Simulator, tài xế bấm Nhận/Từ chối (là **quyền của tài xế**, C-08), offer hết hạn.

### 11.2. Khi nào AI phải dừng và hỏi user

| Tình huống | Hành động |
|---|---|
| Cần thêm/gỡ dependency | **Hỏi trước** (§6 #1) |
| Cần sửa file trong [§13](#13-file-ai-không-được-tự-ý-thay-đổi) | **Hỏi trước**, nêu rõ hệ quả |
| Cần đổi field cũ của contract §4.1–4.9 | **Hỏi trước** — mặc định là **không**, chỉ thêm field optional |
| Cần đổi giá trị `policy.yaml` đã có `verified: true` | **Hỏi trước** + cần owner (Data/BA hoặc PM) xác nhận |
| Cần sinh lại snapshot / tính lại baseline | **Hỏi trước** — §5.14.3 buộc tính lại **toàn bộ** số đã công bố |
| Spec mâu thuẫn nhau và §10 không phân xử | **Hỏi**, kèm đề xuất và lý do |
| Acceptance Criteria không đạt được với thiết kế hiện tại | **Báo ngay**, không tự hạ tiêu chí |
| Phát hiện việc ngoài phạm vi task | **Ghi ra**, không tự làm (§4 #5) |

Việc nằm trong phạm vi task và có neo tài liệu → **cứ làm**, không hỏi lại từng bước.

---

## 12. Definition of Done

Task chỉ được báo xong khi **tất cả** thỏa. Báo xong khi chưa đủ là báo cáo sai.

Dòng 1–10 là DoD chuẩn ở [IMPLEMENTATION_PLAN.md §1](IMPLEMENTATION_PLAN.md#1-definition-of-done-áp-cho-mọi-task). Dòng 11–13 là điều kiện bổ sung riêng cho phiên AI coding.

| # | Điều kiện | Kiểm bằng |
|---|---|---|
| 1 | `ruff check src/ tests/` xanh | exit 0 |
| 2 | `ruff format --check src/ tests/` xanh | exit 0 |
| 3 | Có test mới cho code mới; `pytest tests/ -v` xanh | exit 0 |
| 4 | Test không gọi API thật | CI `APP_ENV=test` |
| 5 | **Không sửa field cũ** contract §4.1–4.9; chỉ thêm field optional | diff + test contract |
| 6 | Mọi ngưỡng đọc từ `policy.yaml` qua `src/common/policy.py` | `grep "yaml.safe_load" src/ \| grep -v policy.py` → 0 |
| 7 | Module chưa xong có mock **đúng contract** (C-06) | test contract chạy trên cả mock lẫn bản thật |
| 8 | Mọi run gắn `model_version`; không random không seed | grep `random.` / `np.random` không seed → 0 |
| 9 | Metric mới tách theo **4 regime** | output có `normal/peak/rain/rain_peak` |
| 10 | Quyết định mới ghi vào History (append-only) | test đếm bản ghi trước/sau |
| 11 | **Acceptance Criteria của task trong IMPLEMENTATION_PLAN đạt hết** | chạy đúng lệnh/ngưỡng ghi trong AC |
| 12 | Nếu chạm Simulator/metrics/baseline: **INV-1/2/3 xanh** | `pytest tests/test_simulation/test_invariants.py` |
| 13 | Báo cáo trung thực: test đỏ thì nói rõ kèm output; bước bị bỏ thì nói rõ | — |
| 14 | `mypy` xanh | exit 0 (cấu hình ở `pyproject.toml`) |

---

## 13. File AI không được tự ý thay đổi

### 13.1. Tuyệt đối cấm — không sửa kể cả khi được yêu cầu chung chung

| Đường dẫn | Vì sao |
|---|---|
| `.ai-log/**` | Nhật ký AI usage, deliverable #4. Sửa/xóa = gian lận đánh giá |
| `scripts/log_hook.py`, `scripts/log_antigravity.py` | Chạy tay tạo entry giả. Chỉ hook được gọi |
| `.git/hooks/**`, `scripts/setup_hooks.*` | Bypass hook = hỏng deliverable |
| `data/baseline/BASELINE_FREEZE.md` | Khóa baseline có commit hash + SHA-256. Sửa sau khi biết kết quả để lại dấu vết vĩnh viễn (§5.14.3) |
| `data/baseline/no_action_metrics.parquet`, `no_action_summary.json` (sau khi khóa) | Mốc so của KPI #3 và #15 |
| `data/test_set/**` (sau khi khóa) | Test set deterministic (I-08) |

### 13.2. Chỉ sửa khi user yêu cầu rõ ràng và hiểu hệ quả

| Đường dẫn | Ràng buộc |
|---|---|
| `docs/**` | Tài liệu spec đã chốt. Sửa spec là quyết định của PM/BA, không phải của AI |
| `ARCHITECTURE.md`, `API_CONTRACT.md`, `DATA_CONTRACT.md`, `AGENT_WORKFLOW.md`, `IMPLEMENTATION_PLAN.md`, `EVALUATION_PLAN.md` | Đã duyệt. Sửa thiết kế trước, code sau — **không** sửa tài liệu cho khớp code đã lỡ viết sai |
| `src/contracts/**` (sau W2) | Chỉ **thêm field optional**. Cấm đổi tên, đổi kiểu, bỏ field |
| `config/policy.yaml` | Thêm key mới được; **đổi giá trị `verified: true` phải có owner xác nhận**; cấm xóa key |
| `config/generator.yaml` seed | `train=42`, `test=2026`, nowcast `13` — đổi seed là mất tính tái lập |
| `data/snapshots/**`, `data/splits.yaml` | Sinh lại buộc tính lại baseline và mọi số đã công bố |
| `ruff.toml`, `.github/workflows/ci.yml` | Không nới lỏng lint/CI để cho xanh |
| `requirements.txt` | §6 #1 — hỏi trước |
| `.env`, `.env.example` | §8 #1 |

### 13.3. Được xóa — đúng theo task T0.5

`src/agents/**`, `src/services/llm.py`, `ChatRequest`/`ChatResponse` trong `src/models/schemas.py`, `tests/test_agents/`, `docs/architecture_diagram.md`, và `langgraph`/`langchain`/`langchain-openai` trong `requirements.txt`.

---

## 14. Lệnh thường dùng

`make` **không có** trên máy này (Windows). Makefile chỉ để tham khảo tên target.

```powershell
.\.venv\Scripts\Activate.ps1          # venv có sẵn tại .venv
pip install -r requirements.txt

uvicorn src.main:app --reload --port 8000     # Swagger: http://localhost:8000/docs

pytest tests/ -v
ruff check src/ tests/                 # bắt buộc xanh trước commit — CI chạy đúng lệnh này
ruff format --check src/ tests/
mypy                                   # cấu hình ở pyproject.toml, không cần truyền path
```

Docker: `docker compose up --build` (multi-stage, healthcheck `/health`).

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy trên push `main`/`develop` và PR vào `main`: `ruff check` + `pytest` với `APP_ENV=test`, `OPENAI_API_KEY=test-key`.

---

## 15. AI usage logging — tự động, không can thiệp

Repo cài sẵn hook cho 6 AI tool ([.claude/settings.json](.claude/settings.json), `.cursor/`, `.codex/`, `.gemini/`, `.github/hooks/`). Prompt log vào `.ai-log/session.jsonl`, tự submit lên grading server khi `git push` (deliverable #4).

- **KHÔNG** chạy thủ công `scripts/log_hook.py`, `scripts/log_antigravity.py`.
- **KHÔNG** sửa/xóa file trong `.ai-log/`.
- Pre-push hook lỗi → **báo user**, không bypass bằng `--no-verify`.
- `scripts/log_manual.py` chỉ dùng cho ChatGPT / web tool.
- Cài hook một lần sau khi clone: `bash scripts/setup_hooks.sh` (hoặc `powershell -ExecutionPolicy Bypass -File scripts\setup_hooks.ps1`).

Chi tiết: [.agents/rules/ai-log-hook.md](.agents/rules/ai-log-hook.md).

---

## 16. Deliverable AI20K chạy song song

`JOURNAL.md` (theo tuần) và `WORKLOG.md` (theo ngày) là **deliverable bắt buộc #8/#9**, hiện vẫn là template rỗng — cập nhật cuối mỗi sprint. `eval/` chứa evidence đánh giá, `presentation/` chứa slide + video demo. `README_boilerplate.md` là mẫu README cho đội, copy đè `README.md` (README hiện tại là của template, không phải của dự án).
