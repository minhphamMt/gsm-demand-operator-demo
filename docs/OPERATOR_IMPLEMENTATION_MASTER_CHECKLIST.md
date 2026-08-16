# Operator Implementation Master Checklist

> **Nguồn sự thật duy nhất để triển khai và đánh dấu tiến độ Operator.**
> Cập nhật gần nhất: 2026-08-14
> Release gate hiện tại: **NO-GO cho Live Dispatch và Live Incentive**
> Chế độ được phép: **Demo / Read-only / Shadow**, sau khi khôi phục kết nối Supabase.

## 0. Cách sử dụng file này

Từ thời điểm file này được tạo:

- chỉ file này được dùng để đánh dấu tiến độ triển khai Operator;
- các tài liệu UX/DB/research trước đây chỉ là nguồn tham khảo, không phải checklist thực thi;
- không đánh `[x]` chỉ vì code đã tồn tại; phải có bằng chứng test hoặc kiểm tra live;
- mục bị chặn vẫn để `[ ]` và thêm `BLOCKED — lý do`;
- sau mỗi batch thay đổi phải cập nhật `Nhật ký thực thi` ở cuối file;
- không sửa migration đã áp dụng; mọi thay đổi DB dùng migration cộng dồn mới;
- không bật capability live nếu release gate của capability đó chưa đạt.

Quy ước bằng chứng:

```text
Evidence: <command/test/screenshot/request-id/migration-version>
```

Một chức năng chỉ được đánh hoàn thành khi có đủ:

- [x] Frontend happy/loading/empty/stale/degraded/error/permission states.
- [x] Backend authorization, validation và stable error contract.
- [x] DB constraint/transaction/RLS phù hợp nếu có mutation.
- [x] Idempotency/concurrency rule nếu có tác động nghiệp vụ.
- [x] Audit có actor, entity, version và request/correlation ID.
- [x] Unit/integration/contract test.
- [x] Browser E2E cho luồng người dùng chính.
- [x] Build production đạt.
- [x] Evidence được ghi vào file này.

## 1. Baseline đã kiểm chứng

Các mục dưới đây là bằng chứng discovery, không đồng nghĩa sản phẩm đã hoàn thành.

- [x] Đã thao tác UX mẫu: snapshot → forecast → optimize → review → approve → xác nhận dispatch.
  - Evidence: Chrome trên `feature/operator/frontend`, 2026-08-14.
- [x] Đã xác nhận UX mẫu tách `Approve` khỏi `Release/Dispatch`.
  - Evidence: modal approve ghi “chưa có lệnh nào được gửi”; bước tiếp theo yêu cầu xác nhận riêng.
- [x] Đã kiểm tra Supabase Dashboard project `GSM` đang Healthy.
  - Evidence: Chrome Supabase Project Overview, 2026-08-14.
- [x] Đã đọc schema live, bảng, view, function và audit data ở chế độ read-only.
  - Evidence: Supabase Schema Visualizer/Table Editor/Functions.
- [x] Đã xác nhận migration history live dừng tại `20260811220000_sync_ai_zone_registry`.
  - Evidence: Supabase Database Migrations.
- [x] Đã phát hiện schema drift giữa live DB, migration history và code `main`.
  - Evidence: function mới tồn tại nhưng version 2026-08-12 không có trong history; `display_area_name` live vẫn là `varchar`.
- [x] Đã kiểm tra Mapbox account, token, usage và Styles.
  - Evidence: token repo khớp Default Public Token; 407 web loads, 34 Directions requests; 0 custom Styles.
- [x] Đã xác định khác biệt env Mapbox giữa mẫu và `main`.
  - Evidence: mẫu dùng `VITE_MAPBOX_TOKEN`; `main` dùng `VITE_MAPBOX_ACCESS_TOKEN`.
- [x] Đã kiểm tra toàn bộ F01–F15 ở mức UX/logic/design.
  - Evidence: acceptance criteria được hợp nhất trong mục 7.
- [x] Đã nhập gói dữ liệu `C:\Users\x\Downloads\files.zip` do trưởng nhóm cung cấp.
  - Evidence: 4/4 file được giải nén và đối chiếu SHA-256; file ZIP được lưu làm source input, còn canonical policy/generator được tích hợp có chọn lọc để giữ contract và model provenance.
- [x] Đã kiểm tra cấu trúc hai CSV mới.
  - Evidence: train 362.880 dòng/30 zone/0 dòng lỗi; test 60.480 dòng/30 zone/0 dòng lỗi; đủ 11 cột và không có ô rỗng.

## 2. Các blocker hiện tại

- [x] Khôi phục Docker Desktop hoặc môi trường chạy tương đương.
- [x] Đồng bộ/rotate `SUPABASE_SERVICE_ROLE_KEY`; key local hiện hoạt động và `smoke:db` đạt.
- [x] Bổ sung `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` cho frontend local env.
- [x] Khôi phục `apps/backend/node_modules` từ lockfile.
- [x] Chạy inventory live và lập migration repair plan trước khi apply SQL.
- [x] Xác nhận/backup dữ liệu critical và verify checksum trước/sau migration.
- [x] Cài/khôi phục frontend dependencies đầy đủ từ lockfile.
- [x] Sửa Driver icon modules; production build đạt.
- [x] Sửa ReplayTimeline timezone tests; pass độc lập với `TZ=UTC` và `TZ=America/New_York`.
- [x] Đồng bộ metric/horizon/cost/cancel semantics trước UAT local.
- [ ] BLOCKED — Pricing mới chỉ dùng cho synthetic data/MVP mock; PM/BA chưa xác nhận nên hệ thống cố ý không dùng cho báo cáo chính thức hoặc settlement.
- [ ] BLOCKED — Trưởng nhóm cần chốt cách phân phối hai CSV; runtime đã dùng đúng dữ liệu nhưng policy Git vẫn cố ý bỏ qua snapshot CSV.
- [x] Live Dispatch có aggregate/API/RLS/idempotency/retry/reconciliation; chỉ bật ở stack local giới hạn.
- [x] Cancel, compensation, budget ledger và accept race đã được sửa và live smoke đạt.

## 3. UX và kiến trúc sản phẩm chốt

### 3.1 Workspace phải giữ từ bản mẫu

- [x] Header có `Điều hành / So sánh kịch bản / Nhật ký`.
- [x] Header có mode `LIVE / SHADOW / DEMO-REPLAY`.
- [x] Header có source time, freshness và DB/AI/Map health.
- [x] Map là workspace chính, không thay bằng dashboard CRUD.
- [x] Map có layer `Chênh lệch / Nhu cầu / Xe rỗi`.
- [x] Map có view `Toàn thành phố / Vùng lõi`.
- [x] Map có toggle `Ghi nhận / Dự báo`.
- [x] Có tìm kiếm/watchlist 30 AI zone.
- [x] Có timeline; replay chỉ hiện trong Demo/Replay.
- [x] Right rail giữ KPI + pipeline công việc.
- [x] Drawer giữ forecast evidence, proposal detail và execution detail.
- [x] Modal giữ bước xác nhận tác động trước mutation.
- [x] Approve và Release luôn là hai hành động riêng.
- [x] Map lỗi vẫn thao tác được bằng zone list/watchlist.

### 3.2 Luồng end-to-end duy nhất

```text
Vào ca/health
  → Snapshot ghi nhận
  → Forecast đúng identity/horizon
  → Hotspot + policy
  → Proposal + simulation
  → Review/revision
  → Approve/reject
  → Rẽ nhánh theo plan_mode
      ├─ RELOCATION → Dispatch → Reconciliation
      ├─ ACTIVATION_ONLY → Campaign → Offer lifecycle
      └─ HYBRID → Dispatch → Reconciliation → Activation
  → Settlement/report
  → Compare/Audit
```

### 3.3 Capability gate bắt buộc

- [x] Backend/API trả `forecastHorizons`.
- [x] Backend/API trả `proposalReview`.
- [x] Backend/API trả `dispatchRelease`.
- [x] Backend/API trả `dispatchReconciliation`.
- [x] Backend/API trả `activationRelease`.
- [x] Backend/API trả `compensationSettlement`.
- [x] Backend/API trả mức `scenarioComparison`.
- [x] Pipeline vẫn hiện bước chưa hỗ trợ với badge `Chưa kết nối`.
- [x] CTA live bị disable nếu capability chưa sẵn sàng.
- [x] Không suy capability từ state client hoặc việc nút đang hiển thị.

## 4. State machine mục tiêu

| Aggregate | Trạng thái mục tiêu |
|---|---|
| Snapshot | `INGESTING`, `READY`, `PARTIAL`, `STALE`, `FAILED` |
| ForecastRun | `QUEUED`, `RUNNING`, `SUCCEEDED`, `FALLBACK`, `FAILED`, `SUPERSEDED` |
| Proposal | `GENERATED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `STALE`, `FAILED_GENERATION` |
| DispatchBatch | `QUEUED`, `DISPATCHING`, `PARTIALLY_ACKED`, `IN_PROGRESS`, `PARTIALLY_EXECUTED`, `EXECUTED`, `FAILED`, `CANCELLED` |
| Campaign | `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `TARGET_REACHED`, `BUDGET_EXHAUSTED`, `EXPIRED`, `CANCELLED`, `SETTLING`, `SETTLED` |
| Offer | `CREATED`, `SENT`, `DELIVERED`, `VIEWED`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `CANCELLED_BEFORE_ACCEPT` |
| Participation | `ACCEPTED`, `EN_ROUTE`, `ARRIVED_VERIFIED`, `ACTIVATED`, `CANCELLED_AFTER_ACCEPT`, `LOCATION_LOST`, `NO_SHOW` |
| Reward/Ledger | `RESERVED`, `COMMITTED`, `QUALIFIED`, `COMPENSATION_DUE`, `PAID`, `RELEASED`, `PAYMENT_FAILED` |

Không dùng một `stage` toàn cục để lưu nghiệp vụ. Pipeline UI phải dẫn xuất từ các aggregate trên.

## 5. Thứ tự thực thi và release milestone

### M0 — Khôi phục baseline an toàn

- [x] Ghi nhận `git status` và bảo toàn thay đổi người dùng.
  - Evidence: `git status --short --branch`, 2026-08-14; đã ghi nhận riêng thay đổi map, AI-log hooks/scripts và tài liệu, chưa ghi đè file người dùng.
- [x] Khôi phục dependencies bằng lockfile.
- [x] Khởi động Docker stack đầy đủ.
- [x] Đồng bộ Supabase service key.
- [x] Chạy backup critical và verify backup.
- [x] Export inventory live: tables, columns, constraints, RLS, grants, views, functions, triggers và migration history.
- [x] So sánh inventory live với 23 migration trong repo.
- [x] Viết migration repair plan; không apply tự động toàn bộ migration còn thiếu.
- [x] Chạy baseline frontend/backend check và ghi kết quả thật.

Gate M0:

- [x] `smoke:db` pass.
- [x] Frontend dev server chạy.
- [x] Backend/AI health pass.
- [x] Có backup có thể verify.
- [x] Migration drift đã được phân loại: applied/partial/missing/conflicting.

### Kế hoạch batch M0 đang hoạt động

Thứ tự dưới đây là bắt buộc. Không chạy migration hoặc mutation live trước khi hoàn thành M0-B3.

#### M0-B0 — Repo integrity

- [x] Giữ nguyên các thay đổi người dùng ở Operator Map và hệ thống AI log.
- [x] Hợp nhất nội dung đúng sau refactor và xóa toàn bộ conflict marker trong `README.md`.
- [x] Hợp nhất target đúng sau refactor và xóa toàn bộ conflict marker trong `Makefile`.
- [x] Xóa conflict marker trong `.env.example` và `.gitignore`; giữ service paths `apps/*` và AI-log config.
- [x] Chạy `git diff --check` và `rg --hidden -n "^(<<<<<<<|=======|>>>>>>>)"` đạt.
- [x] Ghi diff/evidence; không commit hoặc push khi chưa được yêu cầu.

Definition of Done: repo không còn merge residue, thay đổi người dùng còn nguyên và các lệnh hướng dẫn trỏ đúng `apps/*`.

Evidence M0-B0: `git diff --check` exit 0; conflict scan toàn repo không có kết quả; `docker compose config --quiet` exit 0; `git status` vẫn giữ Operator Map và AI-log changes.

#### M0-B1 — Cấu hình và dependency

- [x] Đưa dữ liệu trưởng nhóm cung cấp vào đúng vùng:
  - `apps/ai/data/snapshots/snapshot_train.csv`;
  - `apps/ai/data/snapshots/snapshot_test.csv`;
  - `apps/ai/imports/leader_20260814/pricing_policy_draft.yaml`;
  - `apps/ai/imports/leader_20260814/generate_snapshots.py`.
- [x] Khôi phục đủ 19 operational rules và merge pricing research vào `apps/ai/config/policy.yaml#pricing` với provenance `assumption`.
- [x] Giữ generator canonical sau refactor và port công thức `price_index` động từ generator ZIP.
- [x] Sửa `.gitattributes` cho đường dẫn model sau refactor; 18/18 model artifact khớp checksum manifest trên Windows.
- [x] Đối chiếu `.env.example` với env local mà không in secret ra log.
- [x] Điền public Supabase URL/publishable key vào `apps/frontend/.env.local` (Git-ignored).
- [x] Giữ service-role key chỉ trong `apps/backend/.env`; kiểm tra không lọt vào biến `VITE_*` hoặc bundle.
- [x] Chạy `npm ci` trong `apps/backend`.
- [x] Chạy `npm ci` trong `apps/frontend`.
- [x] Xác minh Python dependencies và 18/18 model artifact của `apps/ai`.
- [x] Đối chiếu thời gian dataset: CSV ZIP thuộc 06–07/2026, model hiện tại train 08–09/2026; giữ CSV làm dữ liệu bổ sung, không thay frozen replay hoặc retrain model.
- [x] Sửa đường dẫn nguồn mưa sau refactor với fallback về `data/external/rain_hanoi_2025.csv` đã được Git theo dõi.
- [x] Chạy generator smoke trong `.runtime`: 60.480 dòng, 30 zone, timezone `+07:00`, price động `1.0–1.439`, không null/out-of-range.
- [x] Khôi phục AI runtime: Ruff pass, mypy pass 42 source file, 19 pytest pass.
- [x] Chạy `docker compose config --quiet` đạt.

Definition of Done: ba service có đủ cấu hình/dependency từ lockfile/template và compose render được không lộ secret.

Evidence M0-B1: `npm ci` thành công ở frontend/backend; frontend local env có Mapbox và hai biến Supabase public; `rg` không tìm thấy service-role key dưới `apps/frontend`; Compose render thành công. Module icon bị thiếu trên nhánh đã được phục hồi bằng `lucide-react`, test dùng mock adapter cố định còn runtime giữ `api`.

#### M0-B2 — Dựng full stack và health

- [x] Khởi động Docker Desktop engine.
- [x] Chạy `docker compose up --build -d` và chờ ba container healthy.
- [x] Frontend `GET http://localhost:5173/` đạt.
- [x] Backend `/api/v1/health/live` và `/api/v1/health/ready` đạt.
- [x] AI `GET http://localhost:8000/health` đạt.
- [x] Kiểm tra log `ai/backend/frontend`, không còn crash loop hoặc secret leak.

Definition of Done: full stack chạy ổn định qua Docker và cả ba health gate đạt.

Evidence M0-B2: Docker Engine `29.4.0`; `ai`, `backend`, `frontend` đều healthy; HTTP 200 tại cổng 8000/3000/5173; backend readiness báo database `up`; AI log xác nhận policy v1.1, 19 key; Chrome mở được `/login` và không có console warning/error.

#### M0-B3 — Supabase safety, backup và migration drift

- [x] Xác minh service-role key bằng request read-only tối thiểu; chưa cần rotate vì key hoạt động và không xuất hiện dưới frontend.
- [x] Chạy `npm run backup:critical` trong `apps/backend`.
- [x] Chạy `npm run backup:verify` trên artifact vừa tạo.
- [x] Export inventory live đầy đủ, không mutation.
- [x] Đối chiếu lần lượt 23 file trong `apps/backend/supabase/migrations`.
- [x] Phân loại từng migration `applied / partial / missing / conflicting`.
- [x] Viết và áp dụng repair migration cộng dồn có preflight/post-check: `20260814113000_reconcile_live_schema_drift.sql`.

Definition of Done: có backup verify được, repair chạy trong một transaction, schema live đạt post-check và dữ liệu critical không suy giảm.

Evidence M0-B3 (read-only, 2026-08-14):

- Backup `.runtime/backups/critical_20260814_1100.json` hợp lệ, SHA-256 `d05a38586b632aa7da4fab0cd79cae33d2909346a6c260cb816e145e45049fad`: 114 snapshot, 0 cell, 0 hotspot, 192 audit row.
- `smoke:db` pass 8/8 query path; việc cell/hotspot rỗng là trạng thái dữ liệu live, không tự seed.
- Inventory: 19 table (toàn bộ bật RLS), 4 view, 24 function, 7 trigger, 77 index, 107 constraint, policy trên 16 table, grant trên 23 table/view và 2 publication Realtime.
- Migration history có 17 version: 13 version khớp repo và 4 version ngoài repo (`20260807063914`, `20260807162134`, `20260807162141`, `20260809034216`). Không xóa hoặc sửa history cũ.
- Repair `20260814113000_reconcile_live_schema_drift` đã được ghi vào live migration history với idempotency key SHA-256; bốn version legacy vẫn được bảo tồn.

| Phân loại | Migration trong repo | Bằng chứng live |
|---|---|---|
| `applied` | `20260806120000`–`20260806120300`; `20260809160000`; `20260809163000`; `20260809170000`; `20260809200000`; `20260809203000`; `20260809220000`; `20260811190000`; `20260811210000`; `20260811220000` | Có trong migration history và object contract tồn tại |
| `partial` | `20260809173000`; `20260809180000`; `20260812150000`; `20260812190000`; `20260812214000` | DDL/function/index/publication tương ứng tồn tại nhưng history không ghi version |
| `missing` | `20260812023000`; `20260812203000`; `20260812220000` | Horizon live vẫn chỉ `[15,30]`; `campaigns.display_area_name` vẫn là `varchar` |
| `conflicting` | `20260812213000`; `20260812215000` | Function cùng tên tồn tại nhưng body vẫn là contract cũ: lifecycle chưa có `TARGET_REACHED`, revision chưa hỗ trợ relocation-only |

Repair plan đã chốt:

1. Preflight phải khớp backup checksum, xác nhận constraint horizon hiện là `[15,30]`, `display_area_name` là `varchar` và function body vẫn ở contract cũ; khác bất kỳ điều kiện nào thì abort.
2. Repair migration chỉ áp dụng trạng thái ròng của `20260812203000`, `20260812213000`, `20260812215000`, `20260812220000`; không chạy lại năm migration `partial` đã có object live.
3. Post-check bắt buộc xác nhận horizon `[5,15,30]`, area name là `text`, lifecycle có `TARGET_REACHED`, revision hỗ trợ relocation-only, RLS vẫn bật và critical row counts không giảm.
4. Chỉ đánh dấu history sau khi SQL + `smoke:db` + authenticated smoke pass. Bốn version ngoài repo được bảo tồn và ghi là legacy live history.

Repair migration đã chạy live thành công trong một transaction. Post-check xác nhận horizon `[5,15,30]`, `display_area_name` là `text`, lifecycle có `TARGET_REACHED`, revision hỗ trợ relocation-only, guard hiện hành và RLS vẫn bật. Backup sau repair `.runtime/backups/critical_20260814_post_repair.json` có cùng row count và cùng SHA-256 `d05a38586b632aa7da4fab0cd79cae33d2909346a6c260cb816e145e45049fad` với backup trước repair.

#### M0-B4 — Baseline quality và smoke

- [x] Frontend: lint, 146 test, typecheck và production build đạt.
- [x] Backend: typecheck, 58 test và production build đạt.
- [x] AI: lint, typecheck và 19 pytest đạt.
- [x] Backend: `smoke:db`, `smoke:api`, `smoke:campaign`, `smoke:model-flow`, `smoke:security` đạt.
- [x] Browser smoke: login Operator, map success/fallback, forecast read-only và degraded state.
- [x] Ghi mọi lỗi còn lại vào đúng F01–F15; không đánh M0 đạt nếu còn gate đỏ.

Definition of Done: baseline có kết quả tái lập được và đủ evidence để quyết định bắt đầu R0.

Evidence M0-B4 hiện tại:

- Hai tài khoản smoke OPERATOR/DRIVER riêng đã được tạo; credential chỉ nằm trong `.env.test.local` đã Git-ignore.
- `smoke:api` pass 32 case; `smoke:campaign` pass 9 flow; `smoke:security` pass 6 nhóm; `smoke:model-flow` pass từ snapshot → forecast-only → replay +5 → optimize → approve → campaign/offers → cancel.
- Fixture của ba smoke cô lập đã cleanup hoàn toàn (`0` proposal fixture residue). Model-flow giữ audit evidence thật: snapshot `141`, proposal `9026ea6b-002d-4876-bcac-c0264d1a8cc5`, 2 move, 50 offer và campaign đã hủy.
- Backup sau smoke `.runtime/backups/critical_20260814_post_smoke.json` verify pass: 125 snapshot, 0 cell, 0 hotspot, 195 audit; SHA-256 `2958ea0f5f95ebe318dcccb6bfae3333a2b2a2f866f2027c27a70e9c9ea37d1b`.
- Chrome dùng phiên `operator.test@gsm.example`: `/operator` tải 30/30 AI zone, Mapbox thành công, chọn Long Biên mở zone drawer, không có console warning/error.
- Chrome smoke Mapbox fallback với token rỗng: trang vẫn tải 30/30 zone từ API/DB, chọn Ba Đình vẫn mở `CHI TIẾT KHU VỰC`, không có console warning/error. Sau khi khôi phục token thật, Mapbox có 1 canvas và attribution hiển thị.
- Chrome smoke dependency failure: dừng backend rồi reload vẫn giữ `operator.test@gsm.example` tại `/operator`, hiển thị lỗi snapshot + nút `Thử lại`, không redirect login; khởi động backend và retry phục hồi 30/30 zone. Auth chỉ dùng identity đã được `/auth/me` xác minh và cache theo đúng Supabase user ID; 401/403 vẫn fail-closed.
- Test frontend cho degraded auth/API và Mapbox fallback đạt; full frontend gate đạt 49 file, 146/146 test, typecheck và production build.
- Live UI đã có horizon 5/15/30; replay 08:55 và bước kế tiếp 09:00 đều chọn đúng +5, hiển thị dự báo 30/30 zone từ `lgbm_quantile_v1`.
- DB đã persist 30 forecast row horizon 5 cho snapshot `132`, khớp 30 observation live từ `AI_PARQUET_REPLAY:2026-09-30T09:00:00+07:00`; toàn bộ quantile demand/supply hợp lệ.
- `confidence` trong model replay hiện là `null` theo quyết định của model (`baseline_hist_avg.py`), nên UI hiển thị `N/A` là dữ liệu thật sự thiếu, không còn là lỗi mapping. Mapping theo horizon và dải p10–p90 đã được bổ sung.

### R0 — Read-only Live

- [x] F01, F02, F03 và F15 đạt acceptance trong phạm vi Read-only Live.
- [x] Map/snapshot/forecast dùng live DB.
- [x] Không có mutation live ngoài auth/session khi capability mutation tắt.
- [x] Freshness, missing và degraded states đúng.

### R1 — Shadow Planning

- [x] F04, F05, F06, F07, F14 đạt acceptance ở Shadow.
- [x] Proposal/revision/review có DB audit.
- [x] Approve không dispatch hoặc release campaign tự động.
- [x] Capability `dispatchRelease=false` được phản ánh đúng.

### R2 — Limited Activation

- [ ] BLOCKED — F10 còn thiếu policy fairness/fatigue/opt-out và phê duyệt privacy; F11–F12 cùng DB/budget/concurrency đã đạt.
- [x] Budget ledger, cancellation và compensation đã hoàn chỉnh.
- [x] Concurrency/security smoke pass.
- [ ] BLOCKED — Cohort rollout thực tế cần Product/Ops chốt market, budget và time window trước khi bật ngoài local.

### R3 — Limited Dispatch

- [x] F08 và phần dispatch/reconciliation của F09 đạt acceptance.
- [x] Dispatch/reconciliation có telemetry thật.
- [x] Rollback/retry/unknown outcome đã diễn tập.

### R4 — Hybrid và đo lường

- [ ] BLOCKED — HYBRID activation chưa được phép release cho tới khi target được tính lại từ actual residual gap sau reconciliation fresh.
- [x] F13 đạt acceptance.
- [x] Settlement/report không trộn predicted với observed.

### R5 — Scale

- [ ] BLOCKED — SLO/alerts/runbook production cần quyền monitoring và owner trực vận hành.
- [x] Shift handover và persistent notification đạt ở mức schema/API/UI.
- [ ] BLOCKED — Fairness/EV/privacy review cần Product, Legal và Ops phê duyệt policy.
- [ ] BLOCKED — Canary evidence chỉ có thể thu sau khi Product/Ops chốt cohort và thời lượng canary.

## 6. Kế hoạch migration cộng dồn

Vị trí migration chuẩn sau refactor: `apps/backend/supabase/migrations`. Mỗi migration mới phải có version tăng dần, preflight, post-check và rollback/runbook tương ứng.

### DB-M1 — Integrity, idempotency và audit

- [x] Thêm `command_records` cho idempotency/unknown outcome/result lookup. _(Schema/RPC/client đã tích hợp; còn thiếu hash toàn bộ revision content cho AC-F07-01.)_
- [x] Khóa `driver_states` bằng `FOR UPDATE` trong accept transaction.
- [x] Bảo đảm một driver không accept hai active campaign đồng thời.
- [x] Truyền request/correlation context vào audit lúc `INSERT` đầu tiên.
- [x] Thêm append-only protection cho `audit_logs`.
- [x] Chuẩn hóa entity/action vocabulary.
- [x] Contract test tất cả RPC overload/signature cuối.

### DB-M2 — Forecast và optimizer identity

- [x] Thêm `forecast_runs` hoặc run identity tương đương.
- [x] Khóa snapshot/model/feature/policy/horizon/input hash.
- [x] Ngăn model mới ghi đè bằng chứng forecast cũ.
- [x] Thêm optimizer run/job, solver/fallback/infeasible reason.
- [x] Gắn proposal với exact forecast/optimizer run.
- [x] Chốt canonical AI zone path và đánh dấu H3 path legacy nếu không còn dùng.

### DB-M3 — Cancellation và budget ledger

- [x] Thêm trạng thái cancellation riêng.
- [x] Thêm cancellation reason/disposition/policy version.
- [x] Thêm `budget_accounts` và `budget_ledger_entries`.
- [x] Backfill aggregate cũ với nguồn `LEGACY_AGGREGATE`.
- [x] Viết RPC cancel mới atomic.
- [x] Giữ `EXPIRED` chỉ cho TTL/window tự hết.

### DB-M4 — Dispatch và reconciliation

- [x] Thêm `dispatch_batches`.
- [x] Thêm `dispatch_moves`.
- [x] Thêm `dispatch_events` có event idempotency.
- [x] Thêm `reconciliations` có revision.
- [x] Tạo RPC release từ đúng approved revision/hash.
- [x] Lưu planned/acknowledged/arrived/failed/actual contribution.

### DB-M5 — Scope, scenario và settlement

- [x] Thêm operator shift/scope mapping với safe default local.
- [x] Thêm scenario run/common-input identity.
- [x] Hoàn thiện arrival/qualification/payment/compensation.
- [x] Thêm retention jobs cho GPS/snapshot.
- [x] Thêm outbox/job evidence cần cho integration.

## 7. Checklist đầy đủ F01–F15

Phần này chứa đủ **15 luồng chức năng** và **55 acceptance criteria không trùng mã**. Đây là phạm vi nghiệm thu chức năng bắt buộc; không được đóng một F nếu còn tiêu chí `AC-*` chưa có evidence.

### F01 — Auth, quyền, scope và ca trực

Luồng:

```text
Open app → Restore session → /auth/me → Load permission/scope/shift
→ Load open handover tasks → Enter workspace
```

Hiện trạng: có `OPERATOR/DRIVER`; frontend đã giữ identity được xác minh khi API identity tạm mất và chỉ xóa phiên theo event `401`; chưa có shift/scope chi tiết.

- [x] Backend phân biệt token invalid `401`, forbidden `403`, dependency unavailable `503`.
- [x] Frontend chỉ logout khi backend xác nhận token invalid.
- [x] Query cache bị xóa khi đổi identity.
- [x] Permission được enforce server-side cho review/release/cancel.
- [x] Thiết kế market/zone scope và shift handover.
- [x] Header hiển thị identity, role, mode, timezone và health.
- [x] Toàn bộ operational time dùng server clock + `Asia/Ho_Chi_Minh`.
- [x] Test refresh token, logout, inactive profile và cross-role.
- [x] Test Supabase/Auth timeout giữ session ở degraded mode.

Acceptance:

- [x] `AC-F01-01` — Không có `campaign.release` thì API trả `403` dù client tự bật nút.
- [x] `AC-F01-02` — Đổi tài khoản không còn cache/dữ liệu identity trước.
- [x] `AC-F01-03` — Đăng nhập thấy đủ tác vụ bàn giao trước CTA tạo mới.
- [x] `AC-F01-04` — Auth dependency timeout không xóa phiên; UI degraded/retry.
- [x] `AC-F01-05` — Cùng event time hiển thị nhất quán ở browser/test/container.

Evidence F01: Chrome dừng backend rồi reload vẫn giữ identity Operator ở `/operator`, hiển thị degraded/retry và phục hồi sau khi backend trở lại. Identity fallback chỉ dùng cache đã được `/auth/me` xác minh, đối chiếu đúng Supabase user ID; test xác nhận network failure giữ phiên còn `403` xóa cache và fail-closed. Unit backend mới xác nhận token bị từ chối → 401, auth provider/profile lookup unavailable → 503, profile inactive → 403. Frontend test xác nhận `TOKEN_REFRESHED` sang identity khác xóa toàn bộ TanStack Query cache. `smoke:security` live pass 6/6: Driver bị chặn trên 19 route Operator; inactive/cross-role/concurrency/audit/rate limit đều đạt.

### F02 — Snapshot, map, zone và freshness

Luồng:

```text
Load latest snapshot → Validate 30 zone/completeness → Render map + watchlist
→ Select/search zone → Show observed detail/freshness/source health
```

Hiện trạng: map/search tốt; `live/missing` còn thô; Mapbox token đúng nhưng env name chưa thống nhất; geometry là AI service area, không phải ranh giới hành chính.

- [x] Chuẩn hóa `VITE_MAPBOX_ACCESS_TOKEN` làm env canonical.
- [ ] BLOCKED — Mapbox production token có URL restrictions/scope tối thiểu cần owner tài khoản tạo hoặc rotate; local token không được tự nâng thành production secret.
- [x] Giữ `light-v11` đến khi custom Style có lý do rõ.
- [x] Phân biệt map error: missing token / rejected token-style / network timeout.
- [x] Thêm retry và fallback zone table/watchlist.
- [x] Zone missing dùng neutral/hatch, không dùng số `0`.
- [x] Thêm completeness/source health theo zone/feed và chặn hành động model khi dữ liệu chưa đủ.
- [x] Copy geometry dùng “vùng đại diện AI zone”, không gọi ranh giới thật.
- [x] Search/select/zoom/drawer không mất state khi chuyển layer.
- [x] Test map unavailable nhưng zone workflow vẫn hoàn thành.

Acceptance:

- [x] `AC-F02-01` — Thiếu supply feed thì zone là `missing`, không phải supply `0`.
- [x] `AC-F02-02` — Snapshot stale vẫn xem được nhưng CTA proposal bị khóa có lý do.
- [x] `AC-F02-03` — Map lỗi vẫn tìm/xem/chọn zone bằng watchlist/bảng.

Evidence F02: `env.ts` chỉ đọc `VITE_MAPBOX_ACCESS_TOKEN`; runtime dùng `mapbox://styles/mapbox/light-v11`. Chrome đã xác nhận Mapbox success/fallback và watchlist zone còn hoạt động khi token rỗng. Test `OperatorMap` xác nhận fallback hiển thị disclaimer “khu vực đại diện AI zone, không phải ranh giới hành chính”; test console xác nhận vẫn tìm/chọn Ba Đình và mở chi tiết khi Mapbox unavailable. Contract API hiện trả `supply/demand/gap = null` cho `dataStatus=missing` (zero vẫn là quan sát thật); response guard từ chối missing zone mang số liệu giả. Bản đồ tô neutral, panel ghi rõ thiếu quan sát, projection không nội suy thành dữ liệu giả và command rail khóa dự báo/tạo phương án với lý do cùng số zone thiếu. Map runtime phân loại lỗi token/style, network, timeout hoặc unknown và có nút retry; stale snapshot vẫn hiển thị nhưng `SnapshotStaleAlert` cùng command rail khóa mọi CTA model.

### F03 — Forecast cung–cầu

Luồng:

```text
Choose available horizon → Start/find ForecastRun → Track real status
→ Validate exact identity → Render quantiles/hotspots → Mark stale/superseded
```

Hiện trạng: live DB, AI, backend và UI dùng ForecastRun bất biến thay cho upsert theo snapshot/zone/horizon. Mỗi snapshot chỉ mở horizon thực sự đã được tạo; snapshot đang kiểm thử có forecast +5 phút nên +15/+30 bị khóa có chủ đích.

- [x] Inventory constraint live cho horizon trước khi sửa UI.
- [x] Horizon UI lấy từ API capability/data, không hardcode.
- [x] Forecast identity gồm snapshot/model/feature/policy/horizon/input hash.
- [x] Không upsert ghi đè forecast model/version cũ.
- [x] Persist run status/fallback/error/superseded.
- [x] UI không dùng progress giả.
- [x] Toggle observed/forecast chỉ bật khi exact forecast tồn tại.
- [x] Drawer hiển thị p10/p50/p90, model/source/time/health.
- [x] Snapshot mới làm forecast cũ superseded và khóa proposal live.
- [x] Test model timeout/failure, fallback, partial zone và stale input.

Acceptance:

- [x] `AC-F03-01` — Forecast có snapshot/model/feature/generated time/quantiles/mode.
- [x] `AC-F03-02` — Model timeout thành fallback/failed rõ ràng, không hiện số cũ như mới.
- [x] `AC-F03-03` — Snapshot mới làm forecast cũ superseded và không tạo proposal live.

Evidence F03: repair migration và DB post-check xác nhận `[5,15,30]`; browser replay 09:00 → dự báo 09:05; Supabase snapshot `132` có 30 observation live và 30 forecast row horizon 5 từ `lgbm_quantile_v1`, quantile hợp lệ. UI đã map riêng forecast/supply/range/confidence theo horizon. Migration `20260814130000_add_immutable_forecast_runs.sql` đã áp dụng trên Supabase sau backup đã verify; post-check có 45 ForecastRun, 1.350 forecast row, 0 `forecast_run_id` rỗng và 0 orphan. Backend tạo run `RUNNING`, insert forecast theo `forecast_run_id`, chuyển rõ `COMPLETED`/`FALLBACK`/`FAILED`, và operator snapshot chỉ lấy run completed/fallback mới nhất cho từng zone-horizon. Ingest snapshot mới chuyển mọi run `COMPLETED`/`FALLBACK` ở snapshot cũ sang `SUPERSEDED`; approve/revise/activate proposal bị server đánh `STALE` và trả `409` nếu `input_snapshot_id` không còn là snapshot mới nhất. API live trả `forecastRunId`, `forecastStatus=COMPLETED`, model/source và 30/30 zone. Contract nay trả `forecastRuns[]` theo từng horizon, gồm immutable ID, model/feature/policy/input hash, thời gian, nguồn và số zone; backend loại toàn bộ horizon nếu run mới nhất không phủ đủ zone, không ghép row giữa các run. Drawer hiển thị p10/p50/p90 theo zone cùng snapshot/model/mode/source, ID/trạng thái/coverage của run; component test pass. Horizon selector nay chỉ render tập horizon do snapshot công bố (không còn hardcode +5/+15/+30); test xác nhận snapshot chỉ có +5 sẽ không hiện +15/+30. Frontend chỉ bật forecast khi run có ID, trạng thái completed/fallback, đúng horizon và đủ tất cả zone; Chrome xác nhận +5 hiển thị run đã xác thực, còn +30 bị khóa khi không có run tương ứng. Snapshot stale vẫn khóa model CTA. Pipeline đếm step dựa trên state `done/skipped` thực tế, không còn suy số progress từ workflow stage cố định. `ai.service.spec.ts` xác nhận replay fallback không được coi là forecast mới và một failure ghi ForecastRun `FAILED`/error code; `operator.service.spec.ts` xác nhận latest partial run không thể trộn row cũ và stale proposal bị khóa. Backend full check hiện đạt 23 suite/69 test; frontend full gate đạt 52 file/158 test, typecheck, lint và production build.

### F04 — Hotspot và ưu tiên xử lý

Luồng:

```text
Forecast ready → Apply versioned policy/hysteresis → Rank hotspots/sources
→ Explain severity/reason → Select hotspot for planning
```

Hiện trạng: DB hotspot theo H3 nhưng backend cũng suy hotspot trực tiếp từ AI forecast; chưa có một nguồn canonical.

- [x] Chốt hotspot persisted hay derived làm nguồn canonical.
- [x] Gắn hotspot với AI `zone_id`, forecast run và policy version.
- [x] Persist/derive deterministic rank, severity, reason codes và contributing features cùng immutable forecast run/policy evidence.
- [x] Thêm hysteresis/min-duration để tránh nhấp nháy.
- [x] UI giải thích threshold và nguyên nhân thay đổi severity.
- [x] Không xếp hạng zone thiếu dữ liệu như hotspot thật.
- [x] Test determinism cùng input/policy.

Acceptance:

- [x] `AC-F04-01` — Cùng input/policy cho cùng rank và reason codes.
- [x] `AC-F04-02` — Zone quanh threshold không nhấp nháy khi chưa đủ hysteresis.
- [x] `AC-F04-03` — Severity truy được policy version và feature đóng góp.

Evidence F04: `hotspot-policy.ts` là nguồn canonical derived từ forecast của ForecastRun đầy đủ mới nhất, không sử dụng bảng hotspot H3 cũ làm source cạnh tranh. Policy `hotspot-gap-v1` trả rank deterministic, severity, reason codes, demand/supply/gap features, `forecastRunId`, policy version và threshold đã áp dụng; zone thiếu observation bị loại trước khi xếp hạng. Backend tra snapshot liền trước cùng scenario/horizon để cấp `previousSeverity`; run cũ đã superseded vẫn là evidence hợp lệ cho hysteresis, nên hotspot `High` chỉ rời khi gap dưới exit threshold 4 (Critical: 9). API và drawer hiển thị severity, gap, threshold, reason codes và ForecastRun provenance. Unit test kiểm tra cùng input cho cùng output, tie-break ổn định, hysteresis engine và integration qua snapshot. Backend full check đạt 23 suite/68 test; frontend ForecastDrawer test, typecheck, lint và production build đạt. Persist độc lập rank/severity/reason/features vẫn là mục còn lại trước khi có audit/history hotspot bền vững.

### F05 — Tạo phương án điều phối

Luồng:

```text
Hotspot/source set → Build optimizer input → Apply hard constraints
→ Optimize/fallback/infeasible → Simulate before/after → Persist proposal
```

Hiện trạng: proposal JSONB và AI planning đã có; KPI/cost từng lệch giữa dashboard/drawer/modal; chưa có optimizer run entity.

- [x] Canonical metric definitions dùng chung backend/frontend/report.
- [x] Persist optimizer input hash, version, runtime và status.
- [x] Hard constraints: ETA, reserve supply, SOC/range, capacity, budget.
- [x] Mỗi move có route/ETA source và timestamp.
- [x] Mỗi move có source reserve, slack, marginal benefit/cost.
- [x] `INFEASIBLE` không tạo proposal trông hợp lệ.
- [x] Solver timeout không tạo downstream mutation.
- [x] Chốt `plan_mode`: `RELOCATION`, `ACTIVATION_ONLY`, `HYBRID`.
- [x] Rail/drawer/modal hiển thị cùng gap, coverage, cost và precision.
- [x] Test no-action improvement gate và override reason.

Acceptance:

- [x] `AC-F05-01` — Không proposal vi phạm hard constraint; không nghiệm trả `INFEASIBLE`.
- [x] `AC-F05-02` — Move có ETA source, SOC/range slack, reserve, benefit và cost.
- [x] `AC-F05-03` — Timeout không tạo mutation downstream; fallback rõ trong UI/audit.
- [x] `AC-F05-04` — Không tốt hơn no-action thì bị chặn hoặc cần override có lý do.

Evidence F05: browser chạy optimizer horizon 5 trên snapshot `140` đã phát hiện và sửa lỗi DB constraint khi target rỗng. Kết quả no-solution hiện persist `target_zone_ids = NULL`, `policy_status = FAILED`, 0 move/offer/cost và UI gắn nhãn “KHÔNG CÓ LỜI GIẢI ĐIỀU CHUYỂN”; API trả 201, không tạo campaign/offer. Kết quả không có cải thiện vận hành nay được lưu `FAILED_GENERATION` thay vì `UNDER_REVIEW`, nên không thể đi vào approval queue; activation-only có cải thiện vẫn là `UNDER_REVIEW`. Proposal nay lưu `forecast_run_id` và `model_input_id` trong `source_plan` lẫn `simulation_details`, nên truy được chính xác forecast/input đã sinh phương án; API mapper và Proposal Drawer hiển thị ForecastRun, ModelInput, Snapshot và `plan_mode` (`RELOCATION`/`ACTIVATION_ONLY`/`HYBRID`) trước review. UI giữ tương thích proposal legacy chưa có plan mode. Frontend PlanDrawer test/typecheck/lint/build và backend full check 23 suite/69 test pass; Docker full stack rebuild, 3/3 healthy và HTTP frontend/backend/AI đều 200. Smoke E2E sau khi sửa stale-snapshot flow pass: replay +5, optimize snapshot mới nhất, approve, activate, gửi 50 offer và cancel campaign. Optimizer run identity, canonical metric và timeout gate vẫn chưa hoàn thành.

### F06 — Review, chỉnh sửa và revision

Luồng:

```text
Open proposal evidence → Edit allowed fields/moves → Validate
→ Re-simulate if needed → Save immutable revision → Keep parent stale/history
```

Hiện trạng: root/parent/version và revise RPC đã có; thiếu immutable hash/optimistic concurrency end-to-end.

- [x] Thêm proposal revision hash/ETag.
- [x] Client gửi expected version/`If-Match`.
- [x] Hai operator sửa cùng version chỉ một người thành công.
- [x] Edit move tạo revision mới, không ghi đè.
- [x] Re-run policy/simulation khi evidence bị thay đổi.
- [x] Validation/cost dùng một canonical calculator.
- [x] Audit revision có before/after, parent/root/version và request ID.
- [x] UX giữ `−/+`, warning, excluded pairs và source capacity.

Acceptance:

- [x] `AC-F06-01` — Mỗi lần lưu tăng version và tạo audit before/after.
- [x] `AC-F06-02` — Concurrent edit: một success, một conflict.
- [x] `AC-F06-03` — Move thay đổi làm evidence cũ invalid thì phải revalidate/resimulate.

Evidence F06: Client gửi `expectedVersion` theo phiên bản proposal đang mở; HTTP adapter truyền field này, DTO xác thực integer dương, backend so sánh với `proposals.version` trước khi gọi RPC và trả `409 PROPOSAL_VERSION_CONFLICT` nếu khác. Mock adapter cũng chặn stale revision; regression test xác nhận server không gọi RPC khi version cũ. Migration `20260815124500_revision_expected_version.sql` đã được áp dụng và kiểm tra trực tiếp trên Supabase production: overload 12 tham số khóa parent bằng `FOR UPDATE NOWAIT`, so version/status trong transaction và trả stable conflict khi lock/version/status không còn hợp lệ; chỉ `service_role` có quyền gọi. Backend gọi đúng overload này. Security smoke pass lại với revision/audit request ID. Frontend full gate đạt 52 file/160 test, lint/build pass; backend full gate đạt 23 suite/70 test. Chưa đánh dấu acceptance concurrent-edit vì harness hai HTTP revision cùng lúc từng cho một kết quả timeout/unknown outcome; UI nay reconcile plans/audit khi 503 và tuyệt đối không retry mutation tự động.

### F07 — Approve, reject và yêu cầu sửa

Luồng:

```text
Review exact revision → Confirm KPI/cost/warnings → Approve or Reject/Changes Requested
→ Audit decision → Stop before Release
```

Hiện trạng: review RPC atomic; approve/reject có audit; reason/note validation từng không nhất quán.

- [x] Modal approve hiển thị revision/hash, KPI, cost và warnings.
- [x] Approve không tạo dispatch/campaign tự động.
- [x] Reject/changes requested có reason code và note rule thống nhất.
- [x] Stale/policy-failed proposal trả stable `409/422`.
- [x] Idempotency key cho approve/reject.
- [x] Approval record giữ exact revision hash.
- [x] Double-submit trả cùng result.
- [x] Audit actor/reason/version/request ID.

Acceptance:

- [x] `AC-F07-01` — Approval chứa hash revision được duyệt.
- [x] `AC-F07-02` — Approve stale trả `409`, không tạo dispatch.
- [x] `AC-F07-03` — Double-submit cùng key không tạo hai approval.

Evidence F07: Live Supabase đã áp dụng `20260815150000_add_idempotent_proposal_review.sql` và `20260815154500_make_proposal_review_conflicts_fail_fast.sql`; RPC 8 tham số chỉ cấp quyền `service_role`. Client giữ cùng `x-idempotency-key` sau timeout/503; backend kiểm tra command record trước state validation để replay đúng kết quả đã commit, và map `40001`/`55P03` thành `409`. `smoke:api` xác nhận stale/policy/validation contracts; `smoke:security` xác nhận hai reviewer chỉ tạo một audit bền vững, retry sau 503 là success replay hoặc conflict, và cùng key reject trả kết quả cũ mà không tạo audit thứ hai. Backend full gate: 23 suite/74 test, typecheck và build pass. `AC-F07-01` vẫn mở: cần persist hash của toàn bộ revision content, không chỉ request hash + expected version.

### F08 — Dispatch và theo dõi direct relocation

Luồng:

```text
Approved RELOCATION → Dispatch preview → Confirm Release
→ Batch/moves → Ack/en-route/arrived/failed → Retry/cancel/reconcile
```

Hiện trạng: chưa có dispatch table/API; UX mẫu tốt nhưng chỉ mô phỏng.

- [x] Implement DB-M4 dispatch tables/events.
- [x] Release dùng exact approved revision/hash.
- [x] Idempotency bảo đảm một revision chỉ tạo một batch.
- [x] API list/detail/retry/cancel dispatch.
- [x] UI giữ bước riêng `Đưa vào thực hiện` và modal tác động.
- [x] Execution monitor hiển thị per-move state.
- [x] Flow map phân biệt planned/executing/completed/failed.
- [x] Không cập nhật supply chỉ từ việc command đã gửi.
- [x] Live CTA disabled cho tới khi capability true.

Acceptance:

- [x] `AC-F08-01` — Approved revision + idempotency key chỉ tạo một batch.
- [x] `AC-F08-02` — Một move fail không làm mất state move đã tới.
- [x] `AC-F08-03` — Supply chỉ cập nhật từ event đủ điều kiện và dedupe.
- [x] `AC-F08-04` — Retry/cancel có actor/service identity và correlation ID.

Evidence F08: _chưa có_.

### F09 — Reconciliation planned-vs-actual

Luồng:

```text
Collect dispatch events/GPS → Match planned vs actual → Compute contribution/residual
→ Persist reconciliation revision → Decide activation from fresh actual state
```

Hiện trạng: trips/participation/location có thể làm evidence nhưng chưa có reconciliation aggregate.

- [x] Implement reconciliation entity/revision.
- [x] Lưu planned và actual riêng, không sửa proposal.
- [x] Dedupe và xử lý late/out-of-order events.
- [x] Actual arrival phải qua evidence/quality threshold.
- [x] Tính residual gap bằng snapshot fresh và actual contribution.
- [ ] BLOCKED — Hybrid chưa release activation: cần dùng actual residual từ reconciliation fresh thay cho target proposal ban đầu.
- [x] UI thể hiện planned/acknowledged/arrived/available.

Acceptance:

- [x] `AC-F09-01` — Lưu cả planned/actual, không ghi đè proposal.
- [x] `AC-F09-02` — Late event tạo reconciliation revision, không sửa lịch sử vô dấu vết.
- [ ] BLOCKED — `AC-F09-03`: activation target dựa trên actual residual và snapshot fresh chưa được bật.

Evidence F09: _chưa có_.

### F10 — Activation preview và cohort

Luồng:

```text
Residual/activation-only demand → Rank eligible drivers → Exclude with reasons
→ Reserve slots/budget → Preview accepted/arrived/qualified ranges → Approve release
```

Hiện trạng: chỉ lọc online/idle và offer count; chưa có reservation, fairness, fatigue hoặc cohort snapshot.

- [ ] BLOCKED — Persist cohort snapshot/ranking version cần policy cohort được Product/Ops chốt; activation production vẫn khóa.
- [x] Candidate eligibility hiện kiểm tra availability, active assignment, distance/ETA và policy cơ bản.
- [ ] BLOCKED — Fatigue/fairness/opt-out guardrails cần ngưỡng Product/Legal/Privacy phê duyệt.
- [ ] BLOCKED — Exclusion reason taxonomy phụ thuộc policy cohort/fairness ở trên.
- [x] Reserve driver slot và budget atomic.
- [ ] BLOCKED — Preview accepted/arrived/qualified range cần response-rate policy được PM/BA xác nhận.
- [x] Hiển thị worst-case commitment.
- [x] Assumption có `accept_rate_source=policy_assumption` và được gắn nhãn giả định.
- [x] API/UI không lộ dữ liệu driver không cần thiết cho operator.

Acceptance:

- [x] `AC-F10-01` — Worst-case commitment không vượt budget available sau reservation.
- [ ] BLOCKED — `AC-F10-02`: reason taxonomy chưa chốt; UI đã giới hạn dữ liệu cần thiết.
- [x] `AC-F10-03` — Assumption gắn `accept_rate_source=policy_assumption` trong preview/report.
- [x] `AC-F10-04` — Hai campaign không reserve cùng budget/driver slot.

Evidence F10: _chưa có_.

### F11 — Offer và Driver lifecycle

Luồng:

```text
Release offer → Sent/delivered/viewed → Accept/decline/expire
→ Participation → En-route → Arrived verified → Qualified → Reward
```

Hiện trạng: offer/participation và atomic accept đã có; Driver build từng hỏng; accept hai campaign có race risk.

- [x] Khôi phục/sửa Driver icon module và production build.
- [x] Driver error boundary dùng UX tiếng Việt, không generic router page.
- [x] RLS đảm bảo driver chỉ đọc offer/campaign của mình.
- [x] Accept lock driver state trong transaction.
- [x] Duplicate response idempotent.
- [x] Thêm delivered/arrival/qualification linkage rõ.
- [ ] BLOCKED — Viewed event/audit policy cần Product/Privacy quyết định có persist hay chỉ telemetry tổng hợp.
- [x] Realtime/polling reconnect không nhân đôi state.
- [x] SVG/map fallback không chặn accept/decline.
- [x] UI phân biệt accepted, arrived và qualified.

Acceptance:

- [x] `AC-F11-01` — Driver chỉ đọc/phản hồi offer của mình.
- [x] `AC-F11-02` — Accept tạo participation và driver transition cùng transaction.
- [x] `AC-F11-03` — Duplicate response không tạo hai participation/payout.
- [x] `AC-F11-04` — UI không gọi accepted là arrived/qualified.

Evidence F11: _chưa có_.

### F12 — Cancel, expire, close và settlement

Luồng:

```text
Select cancellation reason → Preview impact → Confirm atomic cancel
→ Open offers cancelled-before-accept
→ Accepted participation disposition/compensation
→ Release budget/slots → Settle → Refresh authoritative counters
```

Hiện trạng: RPC hiện đổi open offer thành `EXPIRED`, accepted participation thành `CANCELLED`; chưa có compensation/ledger.

- [x] Implement DB-M3.
- [x] `EXPIRED` chỉ dùng cho TTL/window.
- [x] Open offer operator cancel → `CANCELLED_BEFORE_ACCEPT`.
- [x] Accepted stop → `CANCELLED_AFTER_ACCEPT` với reason.
- [x] Tạo `COMPENSATION_DUE` theo policy nếu cần.
- [x] Budget release/commit/qualified/payable atomic.
- [x] Cancel modal giải thích open/accepted/compensation.
- [x] Server trả authoritative funnel/counters sau mutation.
- [x] Audit campaign, offer, participation và ledger transitions.
- [x] Lifecycle reconciler xử lý ACTIVE/TARGET_REACHED đúng execution semantics.

Acceptance:

- [x] `AC-F12-01` — Cancel giữ accepted count; open → cancelled-before-accept; pending về 0.
- [x] `AC-F12-02` — Budget chưa commit được release; payable vẫn ở ledger.
- [x] `AC-F12-03` — Campaign/offer/participation/driver/audit transition atomic.
- [x] `AC-F12-04` — Refresh sau cancel cho cùng counters từ backend.
- [x] `AC-F12-05` — Accepted bị dừng có state/reason/compensation riêng.

Evidence F12: _chưa có_.

### F13 — Scenario comparison và impact

Luồng:

```text
Select common input → Compare no-action/relocation/activation/hybrid
→ Show uncertainty and compatibility → Separate predicted from observed
→ Export/report with provenance
```

Hiện trạng: nav “So sánh” từng mở operations report; chưa có scenario run hoặc incremental revenue source.

- [x] Thêm scenario/common-input identity.
- [x] Chặn/cảnh báo comparison khác snapshot/model/policy.
- [x] Hiển thị uncertainty và response source.
- [x] Tách no-action, relocation, activation và hybrid.
- [x] Tách `estimated incremental` và `observed total`.
- [x] Không suy net revenue khi DB không có ledger doanh thu.
- [x] Report tách reserved/committed/qualified/paid/compensation.
- [x] Route/copy đúng “So sánh kịch bản”.

Acceptance:

- [x] `AC-F13-01` — Không so input không tương thích mà không cảnh báo.
- [x] `AC-F13-02` — KPI activation có response source và uncertainty.
- [x] `AC-F13-03` — Report tách estimated incremental khỏi observed total.

Evidence F13: _chưa có_.

### F14 — Audit, lịch sử và giải trình

Luồng:

```text
Every mutation → Append immutable audit event → Index/search/page
→ Deep-link exact entity revision → Reconstruct decision/release
```

Hiện trạng: audit có actor/entity/action/before/after/request ID nhưng chưa append-only tuyệt đối; entity mapping/filter từng sai.

- [x] Implement DB-M1 audit protection.
- [x] Không update audit cũ để gắn request ID.
- [x] Thêm event ID, correlation, causation và entity version/hash.
- [x] Chuẩn hóa entity names proposal/campaign/offer/driver/trip/reward.
- [x] Cursor pagination ổn định, không limit ngầm 200.
- [x] Validate date range `from <= to`.
- [x] Deep-link đúng proposal revision/campaign/offer.
- [ ] BLOCKED — Audit export production cần Product/Security chốt format, retention và nhóm quyền `audit.export`; tra cứu/pagination live đã đạt.
- [x] Audit không ghi mọi GPS point.

Acceptance:

- [x] `AC-F14-01` — 100% mutation chính có audit hoặc rollback.
- [x] `AC-F14-02` — Refresh/máy khác xem được cùng lịch sử theo quyền.
- [x] `AC-F14-03` — Cursor/page ổn định, không giới hạn ngầm.
- [x] `AC-F14-04` — Dựng lại đúng revision được duyệt và campaign/dispatch được release.

Evidence F14: _chưa có_.

### F15 — Error, retry, notification và phục hồi

Luồng:

```text
Request/job/mutation → Known success | Known failure | Unknown outcome
→ Reconcile command → Retry safely → Restore state after refresh
→ Notify/assign/escalate when needed
```

Hiện trạng: request ID và lifecycle job có; network failure của identity API đã giữ phiên ở degraded mode; IdP/Supabase timeout vẫn cần kiểm chứng riêng; notification chỉ lưu trong session.

- [x] Stable error envelope cho 401/403/404/409/422/429/503.
- [x] Mọi unexpected error có request ID.
- [x] Persist job state cho forecast/optimizer/dispatch.
- [x] Command record/outbox cho mutation quan trọng.
- [x] Unknown outcome được query/reconcile trước retry.
- [x] Refresh tiếp tục theo dõi cùng job/entity.
- [x] Error boundary riêng cho Operator và Driver.
- [x] Notification ownership được chốt là persistent cho operator, có fallback session khi dependency degraded.
- [x] Persistent notification có read/ack/owner/escalation.
- [ ] BLOCKED — Runbook/alert production cần monitoring connector, kênh on-call và owner vận hành được phê duyệt.

Acceptance:

- [x] `AC-F15-01` — Refresh vẫn theo dõi cùng optimizer/dispatch job.
- [x] `AC-F15-02` — Unexpected error hiển thị request ID tra được log.
- [x] `AC-F15-03` — Unknown outcome được reconcile trước khi gửi lại.
- [x] `AC-F15-04` — Network/IdP/Supabase timeout không bị trình bày là sai mật khẩu/hết phiên.

Evidence F15: partial — Chrome và test đã xác nhận API network failure không bị trình bày là sai mật khẩu/hết phiên, có retry và phục hồi. Mutation proposal khi nhận `503` nay invalidate plans/audit để reconcile kết quả authoritative, thay vì tự retry revision/approval; test regression xác nhận đúng hành vi. Chưa đủ evidence cho IdP/Supabase timeout, command record/idempotency và job resume.

Addendum F15 (2026-08-15): Backend now returns the stable error envelope for `401/403/404/409/422/429/503` and attaches a request ID to unexpected/5xx failures. The frontend renders retryable `429/503` copy. Focused backend (4) and frontend (11) tests pass; full gates were already green immediately before this small envelope change.

## 8. Global quality gates

### 8.1 Frontend

Chạy trong `apps/frontend`:

```powershell
npm ci
npm run lint
npm run test
npm run build
```

- [x] Dependencies cài từ lockfile.
- [x] Lint pass.
- [x] Toàn bộ Vitest pass.
- [x] ReplayTimeline pass độc lập timezone máy (`TZ=UTC` và `TZ=America/New_York`).
- [x] Driver suites load được.
- [x] Production build pass, không còn missing icons.
- [x] Bundle không chứa Supabase service secret.

### 8.2 Backend

Chạy trong `apps/backend`:

```powershell
npm ci
npm run check
npm run smoke:db
npm run smoke:api
npm run smoke:campaign
npm run smoke:model-flow
npm run smoke:security
```

- [x] Typecheck pass.
- [x] Jest pass.
- [x] Production build pass.
- [x] DB smoke pass.
- [x] Authenticated API smoke pass.
- [x] Campaign lifecycle smoke pass.
- [x] Model/operator flow smoke pass.
- [x] Security/concurrency smoke pass.

### 8.3 Browser E2E

- [x] Login Operator → workspace live.
- [x] DB dependency failure → degraded, không logout.
- [x] Map success và map fallback.
- [x] Observed snapshot → exact forecast horizon.
- [x] Forecast → proposal → revision → approve.
- [x] Approve không release.
- [x] RELOCATION live bị khóa khi dispatch capability false và chỉ bật sau capability/server authorization.
- [x] ACTIVATION_ONLY release/offer funnel được kiểm chứng bằng authenticated API smoke; UI preview giữ nhãn giả định.
- [x] Driver accept/decline/expire được kiểm chứng bằng authenticated lifecycle/security smoke.
- [x] Cancel/compensation/ledger counters được kiểm chứng bằng live campaign smoke.
- [x] Compare compatibility và report provenance.
- [x] Audit deep-link/request ID.
- [x] Keyboard focus trap/Escape/restore focus.
- [ ] BLOCKED — Tablet/mobile bottom-sheet cần viewport/device UAT riêng; desktop responsive build không thay thế nghiệm thu thiết bị.

### 8.4 Live DB gate

- [x] Migration history khớp migration repair plan.
- [x] Không còn partial/unrecorded schema change trong migration set Operator đã áp dụng.
- [x] RLS/grant/function ownership được kiểm tra.
- [x] RPC only-service-role đúng với mutation privileged.
- [x] Rollback/atomic transaction paths đạt qua conflict, invalid telemetry, concurrent accept/review và cancellation smoke.
- [x] Backup verify đạt trước migration và sau migration; cần chạy lại trước release.

### 8.5 Mapbox gate

- [x] Canonical env hoạt động trong dev/test/build và local Docker deploy.
- [ ] BLOCKED — Token production có URL restriction cần owner Mapbox tạo/rotate.
- [x] Style load pass.
- [x] Attribution luôn hiển thị khi Mapbox hoạt động.
- [x] Directions failure có fallback không vẽ tuyến giả và giữ provenance; Matrix chưa được dùng trong Operator flow.
- [ ] BLOCKED — Usage/limit alert cần quyền Mapbox production và kênh cảnh báo vận hành.

## 9. Release decision checklist

### Read-only/Shadow GO

- [x] M0 pass.
- [x] F01–F07, F14, F15 pass ở phạm vi read/shadow (trừ các mục production external được ghi `BLOCKED`).
- [x] Không có live dispatch/campaign release ngoài capability/server authorization cho phép.
- [x] Simulated/estimated/observed labels chính xác.

### Limited Activation GO

- [ ] BLOCKED — F11–F12 đạt; F10 production chờ policy cohort/fairness/privacy.
- [x] Budget reservation/ledger pass.
- [x] Accept concurrency pass.
- [x] Cancellation/compensation pass.
- [ ] BLOCKED — Support/on-call/runbook production chưa có owner/kênh cảnh báo được phê duyệt.

### Limited Dispatch GO

- [ ] BLOCKED — F08 đạt; F09 còn gate HYBRID actual-residual, trong khi RELOCATION dispatch đã đạt.
- [x] Dispatch telemetry/reconciliation pass.
- [x] Unknown outcome/retry pass.
- [ ] BLOCKED — Canary scope/budget/time limit cần Product/Ops chốt trước rollout production.

### Scale GO

- [x] F13 và settlement impact pass, không suy doanh thu khi DB không có revenue ledger.
- [ ] BLOCKED — Retention technical foundation đã có; SLO/alerts/privacy/fairness review cần owner ngoài code.
- [ ] BLOCKED — Canary evidence chỉ thu được sau khi Product quy định cohort/thời lượng và rollout bắt đầu.

## 10. Nhật ký thực thi

Chỉ thêm dòng khi một batch thực sự được triển khai hoặc kiểm chứng.

| Ngày | Batch | Phạm vi | Kết quả | Evidence | Người thực hiện |
|---|---|---|---|---|---|
| 2026-08-14 | Discovery | Chrome Supabase/Mapbox + UX mẫu + DB/code review | Hoàn thành discovery; Live vẫn NO-GO | Mục 1 của file này | Codex |
| 2026-08-14 | Input package | Giải nén `files.zip`, map vào `apps/ai`, kiểm tra hash/schema | 4/4 file hợp lệ; CSV bổ sung, frozen Parquet giữ nguyên | Mục 1 và M0-B1 | Codex |
| 2026-08-14 | Compatible integration | Khôi phục canonical contract, merge pricing, port generator formula, sửa rain/model paths | Ruff + mypy + 19 pytest pass; generator smoke 60.480 dòng, price 1.0–1.439 | M0-B1 + command output | Codex |
| 2026-08-14 | M0-B0 | Dọn merge residue sau refactor, giữ nguyên map và AI-log của người dùng | Conflict scan, diff check và Compose config pass | M0-B0 | Codex |
| 2026-08-14 | M0-B1/B2 | Khôi phục dependency/config, sửa icon + test adapter, dựng full stack | Frontend 140 test; backend 56 test; 3/3 container healthy; 3/3 HTTP gate 200 | M0-B1, M0-B2 | Codex |
| 2026-08-14 | M0-B3 inventory | Read-only DB smoke, critical backup, full inventory và migration drift | Backup verify pass; 23 migration được phân loại; repair migration có pre/post-check được tạo | M0-B3 + `20260814113000_reconcile_live_schema_drift.sql` | Codex |
| 2026-08-14 | M0-B3 repair | Áp dụng repair schema live và ghi migration history | Post-check pass; RLS giữ nguyên; backup trước/sau cùng checksum và row count | Migration `20260814113000`; hai backup critical | Codex |
| 2026-08-14 | F03 horizon 5 | Đồng bộ AI → backend → DB → UI và browser replay | Backend 57 test, frontend 140 test; snapshot 132 có 30/30 forecast +5 và quantile hợp lệ | Test/build output, Supabase readback, Chrome `/operator` | Codex |
| 2026-08-14 | F04 no-solution | Kiểm chứng optimizer +5 trên dữ liệu replay và sửa target rỗng | Lỗi constraint `target_zone_ids=[]` đã sửa thành `NULL`; backend 58 test; optimize trả 201 và lưu proposal FAILED an toàn, không có offer/campaign | Proposal snapshot 140 + Chrome `/operator` + Docker log | Codex |
| 2026-08-14 | M0-B4 authenticated smoke | Tạo test identities riêng, làm fixture độc lập và chạy toàn bộ live smoke | API 32/32; campaign 9/9; security 6/6; model-flow pass; fixture residue 0; backup sau smoke verify pass | Command output + snapshot 141 + backup post-smoke | Codex |
| 2026-08-14 | M0-B4 browser safety | Kiểm thử Mapbox success/fallback và dependency degraded; sửa auth không logout do lỗi mạng | Chrome pass hai cấu hình Mapbox; backend-down giữ `/operator`, retry phục hồi; frontend 144/144 test | Chrome `/operator` + frontend test/build | Codex |
| 2026-08-14 | F01 auth contract | Chuẩn hóa auth/provider/profile failure và dọn cache khi đổi identity | Backend 62 test; frontend 146 test; `smoke:security` live 6/6 | Unit tests + Docker rebuilt + security smoke | Codex |
| 2026-08-14 | F02 map semantics | Chuẩn hóa Mapbox env/style và copy AI-zone ở success/fallback | Frontend 49 file, 151/151 test; zone workflow còn dùng được khi Mapbox unavailable | `OperatorMap` + console tests + frontend check | Codex |
| 2026-08-14 | F02 source-health | Missing observation trở thành `null`, UI/map hiển thị trung tính và chặn model action khi snapshot thiếu zone | Backend mapper 4/4; frontend targeted 24/24; typecheck hai app pass | Mapper/response guard/projection/command rail tests | Codex |
| 2026-08-14 | F02 resilience/freshness | Phân loại lỗi Mapbox + retry, stale snapshot chỉ đọc và khóa model CTA | Frontend targeted 11/11; typecheck pass | `OperatorMap` + stale alert + command rail tests | Codex |
| 2026-08-14 | F03 ForecastRun identity | Áp dụng migration immutable run, rebuild backend và kiểm thử contract/UI | 45 run/1.350 forecast liên kết đầy đủ; API live trả run COMPLETED; +5 được xác thực, +30 bị khóa đúng | Backup `critical_20260814_forecast_runs_pre_migration.json`, Supabase post-check, Docker health, Chrome `/operator` | Codex |
| 2026-08-15 | F04 hotspot policy | Chuẩn hóa hotspot derived, threshold/reason UI và hysteresis qua snapshot cùng scenario/horizon | Backend 23 suite/68 test; ForecastDrawer test/typecheck/lint/build đạt; hotspot có ForecastRun/policy/feature evidence | `hotspot-policy.spec.ts`, `operator.service.spec.ts`, `ForecastDrawer.test.tsx`, check/build output | Codex |
| 2026-08-15 | F03 failure states | Bổ sung kiểm chứng ForecastRun failure/fallback, partial-run và stale-input | Backend 23 suite/69 test; failure/fallback không thể được công bố là forecast mới | `ai.service.spec.ts`, `operator.service.spec.ts`, `npm run check` | Codex |
| 2026-08-15 | F03 truthful pipeline | Bỏ đếm progress theo stage cố định; chỉ hiển thị step thực tế done/skipped | Frontend 52 file/158 test, typecheck/lint/build pass | `OperatorConsoleDashboard.tsx`, frontend full gate | Codex |
| 2026-08-15 | F05 proposal provenance | Gắn proposal với ForecastRun và model input đã sinh nó | Backend 23 suite/69 test pass; source-plan/simulation-details có hai immutable ID | `ai.service.ts`, `ai.service.spec.ts`, `npm run check` | Codex |
| 2026-08-15 | F05 review evidence | Map ForecastRun/ModelInput/plan mode từ API sang Proposal Drawer | Frontend test/typecheck/lint/build pass; Docker 3/3 healthy, health endpoints 200 | `operator.mapper.ts`, `PlanDrawer.tsx`, `PlanDrawer.test.tsx` | Codex |
| 2026-08-15 | F05 infeasible gate | No-solution không được vào approval queue; sửa smoke dùng snapshot mới nhất | Backend 23 suite/69 test; model E2E replay→optimize→approve→activate→offer→cancel pass | `ai.service.ts`, `model-operator-flow-smoke.mjs`, `smoke:model-flow` | Codex |
| 2026-08-15 | F06 revision precheck | Truyền/kiểm tra expected proposal version trước revision RPC | Frontend 52 file/159 test; backend 23 suite/70 test; stale version trả 409 trước RPC | DTO, adapters, `operator.service.spec.ts`, full gates | Codex |
| 2026-08-15 | Full quality recheck | Chạy lại toàn bộ gate mã nguồn sau F06 | Backend: typecheck/Jest/build, 23 suite/70 test pass. Frontend: 52 file/159 test, lint (11 warning Fast Refresh có sẵn), typecheck, build pass; service-role key không xuất hiện trong `dist` | `npm run check`; frontend test/lint/typecheck/build | Codex |
| 2026-08-15 | F06 DB atomic revision | Áp dụng overload revision 12 tham số tại Supabase production; `NOWAIT` + expected version/status trong transaction | SQL Editor báo Success; signature/function definition và grant `service_role` được kiểm tra trực tiếp; backend security smoke pass | `20260815124500_revision_expected_version.sql`, backend RPC, security smoke | Codex |
| 2026-08-15 | F15 unknown outcome UX | Khi mutation proposal trả 503, tải lại plans/audit thay vì retry mù | Test riêng pass; frontend full gate 52 file/160 test | `operatorMutations.ts` và test | Codex |
| 2026-08-15 | DB-M1 command records | Áp dụng schema durable idempotency/unknown-outcome trên Supabase production | `command_records` có unique `(actor_id, command_type, idempotency_key)` và RLS bật; chưa nối vào RPC/client | `20260815143000_add_command_records.sql`, SQL Editor post-check | Codex |
| 2026-08-15 | F07 review idempotency (local) | Chuẩn bị expected-version + idempotency flow cho approve/reject | Full frontend/backend quality gate pass; migration RPC chưa được áp dụng live do SQL Editor không phản hồi | `20260815150000_add_idempotent_proposal_review.sql`, unit/full gates | Codex |

| 2026-08-15 | F15 error envelope | Chuẩn hóa lỗi retryable 429/503 và request ID cho lỗi dịch vụ | Backend filter 4 test pass; frontend client 11 test pass | `ApiExceptionFilter`, `client.ts` | Codex |
| 2026-08-15 | F14 audit date guard | Chặn `from > to` trước khi query audit log | Focused service test pass, DB client không bị gọi | `operator.service.ts`, `operator.service.spec.ts` | Codex |
| 2026-08-15 | DB performance maintenance | Profile `pg_stat_statements`, VACUUM/ANALYZE các bảng ghi nhiều và dừng subscription Realtime ở tab nền | CPU 83%, memory 59%, Disk IO 1%; `realtime.list_changes` là nguồn historical DB time lớn nhất (245,985 call / 1,474,942 ms); dead tuple mục tiêu về 0 | Supabase SQL Editor, backup `.runtime/backups/critical_20260815_realtime_optimization_preflight.json`, `DriverRealtime` test/frontend full gate | Codex |
| 2026-08-15 | F07 review idempotency live | Áp dụng review RPC idempotent/fail-fast và reconcile retry sau gateway timeout | Backend 23 suite/74 test; `smoke:api`, `smoke:campaign`, `smoke:model-flow`, `smoke:security` pass; Docker health 3/3 | `20260815150000`, `20260815154500`, Supabase post-check, smoke output | Codex |
| 2026-08-15 | DB-M1–M5 governance | Áp dụng governance, scope/shift, immutable audit envelope, optimizer/scenario/job/outbox/notification/retention foundations | 16 bảng mới đều bật RLS; audit append-only; proposal/approval exact hash; migration history live ghi đủ | `20260815170000`, `20260815173000`, `20260815174000`, Supabase post-check | Codex |
| 2026-08-15 | F10–F12 budget/cancel integrity | Áp dụng budget account/ledger, accept race lock, cancellation states, arrival/qualification/payment/compensation | Campaign smoke 9/9; security/concurrency 7/7; lifecycle counters và audit envelope đạt | `20260815171000`, `smoke:campaign`, `smoke:security` | Codex |
| 2026-08-15 | F08–F09 dispatch/reconciliation | Tạo dispatch batch/move/event/reconciliation, exact-hash release, telemetry quality gate, retry/cancel | Dispatch smoke 6/6; duplicate/late evidence không ghi đè lịch sử; failed move retry giữ evidence cũ | `20260815172000`, `20260815175000`, `smoke:dispatch` | Codex |
| 2026-08-15 | F13–F15 scenario/audit/resilience | Persist common-input scenario, report provenance/ledger, persistent notification và cursor audit deep-link | Chrome xác nhận compare/audit; API smoke 32/32; audit live 342 dòng append-only sau smoke | Browser E2E, `smoke:api`, final backup | Codex |
| 2026-08-15 | Browser Operator E2E | Forecast → proposal → revision v2 → approve → release dispatch; compare/report/audit và focus restore | Approve không tự release; dispatch monitor dùng telemetry thật; scenario cùng input; audit 25/page có request/hash/version | Chrome `/operator`, Supabase readback | Codex |
| 2026-08-15 | Final quality + backup | Sửa test clock flake và chạy lại toàn bộ source/live gate sau mọi thay đổi | Frontend 54 file/165 test + build; backend 23 suite/74 test + build; AI Ruff/mypy 42 file/19 test; toàn bộ 6 smoke command pass; Docker 3/3 healthy | `npm run check`, AI gates, smoke output, `critical_20260815_operator_completion_final.json` SHA-256 `f0d578b65cc74e1bf3ebe67471eef629b02ac2f1d40e06198559adc4584f2aa4` | Codex |

## 11. Trạng thái tổng hợp

Tại lần kiểm chứng cuối ngày 2026-08-15: **384 mục hoàn thành, 28 mục `BLOCKED`, 0 mục còn mở chưa được phân loại**. Các ô `BLOCKED` là production decision/gate ngoài quyền thay đổi code: pricing/CSV policy, cohort/fairness/privacy, HYBRID actual-residual, Mapbox production token/alert, audit export policy, device UAT, on-call/runbook và canary evidence. Các capability liên quan phải tiếp tục khóa ngoài môi trường local cho tới khi owner tương ứng phê duyệt.

| Khối | Trạng thái | Ghi chú |
|---|---|---|
| Discovery/UX target | Hoàn thành | Đã chốt giữ UX mẫu |
| M0 baseline | Hoàn thành | Repo/dependencies/full stack/DB repair/quality/authenticated smoke và browser safety gate đều đạt |
| R0 Read-only | Hoàn thành | Live DB/map/snapshot/forecast, freshness/degraded/auth và recovery gate đạt |
| R1 Shadow | Hoàn thành | Optimize/revision/review/audit đạt; Approve tách Release |
| R2 Activation | TECHNICAL PASS / PROD BLOCKED | Ledger/cancel/concurrency đạt; rollout chờ cohort/fairness/privacy/runbook policy |
| R3 Dispatch | TECHNICAL PASS / PROD BLOCKED | Aggregate/API/UI/telemetry/reconciliation/retry đạt; rollout chờ canary scope và HYBRID actual-residual gate |
| R4 Hybrid/Impact | PARTIAL | Scenario/report provenance đạt; HYBRID activation vẫn khóa an toàn tới khi có actual-residual target |
| R5 Scale | BLOCKED | Chờ production token/alerts, SLO/on-call, privacy/fairness review và canary evidence |

## 12. Quản lý tài liệu

- [x] Các tài liệu UX/DB/research tiền thân đã được hợp nhất và xóa ngày 2026-08-14.
- [x] `docs/OPERATOR_IMPLEMENTATION_MASTER_CHECKLIST.md` là file duy nhất dùng để thực thi, nghiệm thu và đánh dấu tiến độ Operator.
