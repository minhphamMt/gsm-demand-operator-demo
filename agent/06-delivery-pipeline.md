# Kiến trúc triển khai và pipeline phát triển

**Mã tài liệu:** DP-01 · **Phiên bản:** 0.1 (draft) · **Ngày:** 22/08/2026  
**Liên quan:** `04-agent-architecture.md`, `05-business-logic.md`

## 1. Mục tiêu triển khai

Phiên bản nâng cấp phải cho phép chạy MVP và agent mới song song, bật theo feature flag, quan sát được và rollback được mà không làm mất plan hoặc audit event.

Nguyên tắc:

- orchestration, side effect và data store tách nhau;
- model/agent mới có shadow-run trước khi được cấp quyền tự động;
- database là nguồn sự thật nghiệp vụ;
- checkpoint LangGraph chỉ phục vụ resume pipeline;
- mọi release có contract test, replay test và safety gate.

## 2. Kiến trúc runtime tham chiếu

```text
                    ┌────────────────────┐
                    │ React Operator UI  │
                    │ Driver UI          │
                    └─────────┬──────────┘
                              │ HTTPS / polling hoặc SSE
                    ┌─────────▼──────────┐
                    │ FastAPI API        │
                    │ Auth + Commands    │
                    └──────┬───────┬─────┘
                           │       │
              ┌────────────▼─┐   ┌─▼──────────────┐
              │ Query/Command │   │ LangGraph      │
              │ Application   │   │ Orchestrator   │
              │ Services      │   │ Worker         │
              └──────┬────────┘   └──────┬─────────┘
                     │                   │
             ┌───────▼───────┐   ┌───────▼────────┐
             │ PostgreSQL    │   │ Redis/Queue    │
             │ domain+audit  │   │ lock+events    │
             └───────────────┘   └───────┬────────┘
                                         │
                              ┌──────────▼─────────┐
                              │ Agent tools/models │
                              │ adapters/providers │
                              └──────────┬─────────┘
                                         │
                              ┌──────────▼─────────┐
                              │ Object storage     │
                              │ snapshots/models   │
                              └────────────────────┘
```

### 2.1. Ranh giới trách nhiệm

| Thành phần | Được làm | Không được làm |
|---|---|---|
| API | nhận command, validate, kiểm quyền, trả trạng thái | tự tính lại nghiệp vụ trong route |
| Application service | thay đổi domain state sau authorization | bỏ qua audit |
| LangGraph worker | điều phối node, retry, checkpoint, stream event | tự cấp quyền hoặc tự ghi side effect |
| Agent/tool | đọc context, tính toán, trả proposal | tự approve hoặc tự tăng ngân sách |
| PostgreSQL | lưu domain state và audit | lưu prompt tạm thay checkpoint |
| Redis/queue | lock, dedup, event delivery | nguồn sự thật duy nhất |
| Object storage | snapshot/model artifact/evidence | lưu quyết định nghiệp vụ thay database |

## 3. Các adapter bắt buộc

```text
ForecastProvider
├── MvpForecastAdapter
├── HistoricalForecastAdapter
└── UpgradeForecastAdapter

TrafficProvider
├── SyntheticTrafficAdapter
├── HistoricalTrafficAdapter
└── RealTrafficAdapter

ExecutionProvider
├── SimulationExecutionAdapter
└── RealFleetExecutionAdapter (phase sau, cần phê duyệt riêng)

EventTransport
├── PollingTransport
└── SseTransport (phase nâng cấp)
```

Giai đoạn đầu dùng `SyntheticTrafficAdapter`, `HistoricalTrafficAdapter` và `SimulationExecutionAdapter`. `RealTrafficAdapter` hoặc `RealFleetExecutionAdapter` không được bật chỉ vì service đã deploy.

## 4. Môi trường

| Môi trường | Mục đích | Quyền auto |
|---|---|---|
| `local` | phát triển và demo | simulation only |
| `test` | unit, contract, replay, failure | không side effect |
| `staging` | shadow/canary với dữ liệu gần production | `suggest` |
| `production` | vận hành thật | theo AutomationGrant |

Mỗi môi trường phải có policy version và feature-flag configuration riêng. Không copy nguyên quyền production sang staging hoặc local.

## 5. Pipeline CI

```text
commit
  → format/lint/type check
  → unit tests
  → contract tests
  → deterministic replay tests
  → agent failure/retry tests
  → authorization and audit tests
  → integration tests
  → frontend test/build
  → security/dependency scan
  → build immutable image
```

### 5.1. Quality gates

- Contract mới phải tương thích ngược hoặc có migration rõ ràng.
- Cùng input snapshot và seed phải cho cùng output ở deterministic mode.
- Test chứng minh agent không thể gọi side effect khi thiếu grant.
- Test chứng minh human gate không bị bypass.
- Test chứng minh hai ngân sách không bù trừ.
- Replay mới không làm thay đổi baseline khi feature flag tắt.
- Mọi agent failure có warning/error code và trace id.
- Image build không chứa secret.

## 6. Pipeline CD và migration

```text
build artifact
  → deploy staging
  → database migration check
  → shadow-run cùng snapshot
  → compare KPI/contract/latency
  → canary theo tenant/zone
  → bật feature flag
  → theo dõi safety metrics
  → promote hoặc rollback flag
```

Rollback ưu tiên theo thứ tự:

1. tắt feature flag;
2. thu hồi AutomationGrant mới;
3. chuyển pipeline về adapter MVP;
4. chỉ rollback database nếu migration đã có kế hoạch tương thích ngược.

Không dùng rollback để xóa plan, execution hoặc audit event đã ghi.

## 7. Model và data promotion

Mỗi model artifact phải có:

```text
model_version
training_data_version
feature_schema_version
evaluation_report_ref
created_at
approved_by
```

Promotion model:

```text
trained → offline evaluated → shadow → canary → active
```

Model chưa qua shadow không được cấp capability `APPLY_RELOCATION` hoặc `APPROVE_REPLAN`.

## 8. Observability

Mọi log, metric và trace phải nối được bằng:

```text
trace_id
incident_id
run_id
plan_id
plan_version
grant_id
model_version
```

Theo dõi tối thiểu:

- thời gian từng node;
- tỷ lệ fallback và warning;
- số trigger bị suppress;
- số plan được approve/reject/auto-approved;
- số lần grant bị từ chối;
- budget đã cam kết và còn lại;
- re-plan rate;
- execution deviation;
- tỷ lệ rollback feature flag.

## 9. Feature flag tối thiểu

```text
agent_upgrade_enabled
traffic_provider
optimizer_engine
plan_strategy_set
explanation_llm_enabled
replan_enabled
automation_mode
driver_offer_auto_issue
```

Mỗi flag phải có owner, mô tả, default-safe value, ngày hết hạn và rollback action. `default-safe value` phải là implementation MVP hoặc `manual`.

## 10. Lộ trình triển khai

### Release R1 — Orchestration shadow

- LangGraph chạy fan-out/join.
- Dùng toàn bộ adapter synthetic/historical.
- Không có side effect.
- So sánh với MVP.

### Release R2 — Operator-assisted

- Hiển thị 5 agent và PlanSet A/B/C.
- Human approve/modify/reject.
- Có plan version và re-plan.
- Automation mode giữ `suggest`.

### Release R3 — Conditional automation

- Bật `conditional_auto` theo tenant/zone.
- Giới hạn relocation và incentive budget.
- Có kill switch, grant expiry và audit đầy đủ.

### Release R4 — Real adapters

- Thay traffic provider bằng real API theo canary.
- Đánh giá riêng execution provider thật.
- Không tự động điều xe thật nếu chưa có safety approval và operational UAT.
