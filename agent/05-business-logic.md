# Logic nghiệp vụ phiên bản nâng cấp

**Mã tài liệu:** BL-01 · **Phiên bản:** 0.1 (draft) · **Ngày:** 22/08/2026  
**Liên quan:** `01-functional-spec.md`, `02-technical-spec.md`, `04-agent-architecture.md`

## 1. Mục tiêu

Phiên bản nâng cấp vẫn giải quyết bài toán cốt lõi: phát hiện thiếu hụt cung–cầu, dự báo ngắn hạn, sinh phương án điều phối, xin quyết định hoặc quyền tự động phù hợp, theo dõi thực thi và lập lại kế hoạch khi tình hình thay đổi.

Nâng cấp công nghệ không được làm mất các nguyên tắc nghiệp vụ sau:

- Kế hoạch có version và không bị sửa đè.
- Hành động có side effect phải được kiểm quyền.
- Tài xế có quyền nhận hoặc từ chối offer.
- Ngân sách điều chuyển và ngân sách incentive độc lập.
- Quyết định và tự động hóa phải audit được.

## 2. Thực thể nghiệp vụ

| Thực thể | Ý nghĩa |
|---|---|
| `Zone` | vùng vận hành và trạng thái cung–cầu |
| `Incident` | một vấn đề cần hệ thống phân tích và xử lý |
| `PipelineRun` | một lần chạy các agent cho incident |
| `SituationAssessment` | context thống nhất do một runtime agent tạo từ ba capability Forecast/Traffic/Supply chạy song song |
| `Action` | hành động điều xe hoặc thay đổi vận hành |
| `PlanSet` | tập ba phương án cùng bối cảnh |
| `PlanVersion` | một phiên bản bất biến của phương án |
| `Execution` | việc thực thi plan đã được duyệt |
| `AutomationGrant` | quyền tự động có giới hạn |
| `ReplanEvent` | sự kiện khiến hệ thống đánh giá lại plan |
| `AuditEvent` | dấu vết bất biến của quyết định và side effect |

## 3. State machine nghiệp vụ

### 3.1. Incident

```text
DETECTED
  → ANALYZING
  → PLAN_PROPOSED
  → AWAITING_APPROVAL
  → APPROVED
  → EXECUTING
  → MONITORING
  → RESOLVED
```

Nhánh kết thúc hoặc ngoại lệ:

```text
AWAITING_APPROVAL → REJECTED
EXECUTING → CANCELLED
MONITORING → REPLAN_PENDING
REPLAN_PENDING → MONITORING
REPLAN_PENDING → PLAN_PROPOSED
```

Một incident có thể có nhiều `PipelineRun` và nhiều `PlanVersion`, nhưng chỉ có tối đa một execution active trong cùng scope.

### 3.2. PlanVersion

```text
DRAFT → PROPOSED → APPROVED
                ├→ REJECTED
                └→ SUPERSEDED
```

`APPROVED` không có nghĩa là mọi capability downstream đã được cấp. Việc phát hành driver offer cần grant hoặc human confirmation riêng.

### 3.3. Execution

```text
PENDING
  → DISPATCHING
  → IN_TRANSIT
  → COMPLETED
```

Các nhánh:

```text
PENDING / DISPATCHING / IN_TRANSIT → CANCELLED
DISPATCHING / IN_TRANSIT → REPLAN_PENDING
```

## 4. Trigger và chống lặp

Trigger hợp lệ:

- `ZONE_ALERT`: zone vượt ngưỡng.
- `NEW_DATA`: dữ liệu mới làm thay đổi dự báo hoặc trạng thái.
- `EXECUTION_DEVIATION`: thực thi lệch so với plan.
- `WEATHER_CHANGE`: điều kiện thời tiết thay đổi đáng kể.
- `SCHEDULED`: chạy định kỳ.
- `MANUAL`: người vận hành yêu cầu.

Mỗi trigger phải có:

```text
event_id
event_type
occurred_at
source
zone_ids
dedup_key
payload_version
```

Router phải:

1. deduplicate theo `dedup_key`;
2. gộp các alert cùng incident;
3. không tạo run mới khi một run tương đương đang mở;
4. áp dụng cooldown theo policy;
5. ghi cả quyết định `SUPPRESS` vào audit trail.

## 5. Tạo và chọn phương án

Ba phương án được tạo bằng strategy cố định, không để LLM tự quyết định:

| Plan | Strategy | Ưu tiên |
|---|---|---|
| `PLAN_A` | `MIN_COST` | giảm chi phí điều chuyển |
| `PLAN_B` | `BALANCED` | cân bằng coverage, ETA và cost |
| `PLAN_C` | `MIN_ETA` | cải thiện ETA tối đa |

Mọi strategy dùng chung các hard constraint:

- zone đích phải có thiếu hụt hợp lệ;
- zone nguồn không được thấp hơn mức cung tối thiểu;
- không vượt khoảng cách tối đa;
- không vượt relocation budget;
- không vi phạm cooldown;
- không điều xe vượt khả năng nguồn.

Scoring có thể khác nhau giữa ba strategy, nhưng phải deterministic và lưu:

```text
scoring_version
weights
input_snapshot_id
constraint_results
```

`Recommended` là kết quả của scoring code. Explanation Agent chỉ giải thích kết quả.

## 6. Quyền tự động

Mặc định agent có quyền:

```text
READ_CONTEXT
RUN_ANALYSIS
CREATE_PROPOSAL
```

Các quyền sau phải được cấp riêng:

```text
APPLY_RELOCATION
ISSUE_DRIVER_OFFERS
CANCEL_EXECUTION
APPROVE_REPLAN
```

Một `AutomationGrant` phải giới hạn:

- zone được phép tác động;
- số xe tối đa mỗi action;
- relocation budget tối đa;
- incentive budget tối đa;
- confidence tối thiểu;
- loại trigger được phép;
- thời hạn quyền;
- người hoặc hệ thống cấp quyền.

### 6.1. Quy tắc auto-approval

Agent chỉ được auto-approve khi đồng thời thỏa tất cả điều kiện:

1. grant còn hiệu lực;
2. action nằm trong zone scope;
3. không vượt hai loại ngân sách;
4. không có invariant hoặc validation failure;
5. dữ liệu không stale;
6. confidence đạt ngưỡng;
7. mức rủi ro nằm trong policy được cấp;
8. capability tương ứng đã bật bằng feature flag.

Nếu một điều kiện không đạt, pipeline chuyển sang `AWAITING_APPROVAL`, không tự fallback sang quyền rộng hơn.

## 7. Re-plan

Hệ thống chỉ đề xuất re-plan khi:

- service risk cải thiện dự kiến vượt ngưỡng tối thiểu;
- execution deviation vượt ngưỡng;
- forecast drift vượt ngưỡng;
- zone shortage mới có ảnh hưởng đáng kể;
- trigger manual.

Re-plan phải tạo `PlanVersion` mới, giữ bản cũ và hiển thị diff:

```text
CURRENT_ACTIVE_PLAN
UPDATED_RECOMMENDATION
CHANGES
EXPECTED_IMPACT
REASONING
```

Plan mới không được thay thế active plan nếu thiếu `APPROVE_UPDATE` hoặc capability `APPROVE_REPLAN` hợp lệ.

## 8. Xử lý lỗi và rollback

| Lỗi | Hành vi nghiệp vụ |
|---|---|
| Dữ liệu stale | không tạo plan mới |
| Agent phân tích lỗi | dùng adapter/fallback nếu có; ghi warning |
| Không có phương án | incident chuyển `NO_VIABLE_PLAN`, không tạo plan rỗng |
| Vượt budget | dừng tạo action, phần còn lại thành residual gap |
| Agent timeout | retry theo policy hoặc chuyển human gate |
| LLM lỗi | dùng template explanation |
| Side effect thất bại | giữ audit event, chuyển execution sang trạng thái cần xử lý |
| Grant bị thu hồi | chặn action mới; không tự hủy side effect đã cam kết |

Không được rollback bằng cách xóa audit event hoặc sửa plan version cũ.

## 9. Audit bắt buộc

Các sự kiện phải ghi bất biến:

- trigger và quyết định suppress/dedup;
- agent run và warning;
- plan được tạo, score và recommend;
- approve/modify/reject;
- automation grant được cấp/sửa/thu hồi;
- auto-approval;
- execution command;
- re-plan và approve update;
- driver offer và response.

Mỗi audit event tối thiểu có:

```text
event_id
event_type
incident_id
run_id
plan_id / plan_version
actor_type
actor_id
policy_version
model_version
trace_id
occurred_at
payload_hash
```

## 10. Chiến lược migration

Mỗi agent mới phải triển khai theo bốn bước:

1. `shadow`: chạy song song với MVP, không có side effect;
2. `compare`: so contract, KPI, latency và warnings;
3. `canary`: bật theo zone hoặc tenant;
4. `adopt`: bật mặc định sau khi đạt acceptance criteria.

Feature flag phải có owner, phạm vi, ngày hết hạn, rollback action và phiên bản policy đi kèm.
