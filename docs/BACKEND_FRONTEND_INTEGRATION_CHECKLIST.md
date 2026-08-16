# GSM Backend-to-Frontend Integration Plan & Checklist

Updated: 2026-08-09

Status: **LIVE CONNECTION IMPLEMENTED AND E2E VERIFIED — remaining items are contract/test hardening**

Operator-first remaining work is tracked in
[`OPERATOR_REMAINING_WORK_CHECKLIST.md`](./OPERATOR_REMAINING_WORK_CHECKLIST.md).
The driver experience is intentionally limited to smoke coverage in that plan.

## Goal

Replace the frontend's in-memory mock data path with authenticated NestJS APIs
backed by the live Supabase project, while preserving a deliberate mock mode for
isolated UI tests and local scenario development.

## Non-negotiable architecture decisions

- [x] NestJS remains the only trusted business-operation boundary.
- [x] Supabase `service_role` remains backend-only and Git-ignored.
- [x] Frontend remote state remains in TanStack Query.
- [x] Backend access stays behind `shared/api` and feature-local API adapters.
- [x] Presentational components never call `fetch`, Supabase, storage, or timers.
- [x] Existing `OperatorDataAdapter` remains the replaceable mock/HTTP contract.
- [x] Select and document one canonical wire format for statuses and timestamps.
- [x] Select and document one canonical GeoJSON response format.
- [x] Freeze request/response examples in Swagger for implemented operator calls.
- [x] Confirm whether the frontend may add `@supabase/supabase-js` for browser auth.

Recommended dependency decision: use `@supabase/supabase-js` only for browser
authentication/session refresh. It solves a current requirement, has maintained
TypeScript types, and avoids hand-rolling Supabase token refresh. All GSM business
data must still go through NestJS.

## Phase 0 — Contract freeze and gap closure

### 0.1 Canonical response rules

- [x] Use a stable frontend boundary mapping backed by canonical DB states:
  - Proposal: `Generated | UnderReview | Approved | Rejected | Stale | FailedGeneration`.
  - Campaign: `Draft | Active | TargetReached | Completed | Cancelled | BudgetExhausted`.
  - Offer: DB `CREATED | SENT | VIEWED` maps to `Open`; terminal states remain distinct.
  - Driver: `offline | online_idle | en_route | activated | on_trip`.
- [x] Return ISO-8601 timestamps with timezone for every date field.
- [x] Return money as JSON numbers and document that values are integer VND.
- [x] Return distances in kilometres and ETA in minutes at the frontend boundary.
- [x] Return H3 IDs as strings without numeric conversion.
- [x] Return `center` and `boundary` as coordinate arrays derived from DB GeoJSON views.
- [x] Return `404` for missing single resources and empty arrays for empty collections.
- [x] Normalize errors to `{ code, message, details?, requestId }` without leaking SQL details.
- [x] Add request correlation IDs to backend responses and unexpected-error logs.

### 0.2 Current endpoint matrix

| Frontend capability | Backend endpoint | Current state | Required work |
|---|---|---:|---|
| Current identity/role | `GET /api/v1/auth/me` | Done | Freeze response type |
| Latest heatmap snapshot | `GET /api/v1/operator/snapshots/latest` | Partial | Normalize geometry, scenario and replay semantics |
| Scenario catalogue | `GET /api/v1/operator/scenarios` | Mock-only by design | Live mode fails explicitly instead of mixing mock data |
| Frozen baselines | `GET /api/v1/operator/baselines` | Done | Derived from live snapshots |
| Proposal list | `GET /api/v1/operator/proposals` | Done | Normalize casing and response shape |
| Proposal detail | `GET /api/v1/operator/proposals/:id` | Done | Normalize casing and not-found behavior |
| Revise proposal | `POST /api/v1/operator/proposals/:id/revisions` | Done | Full revision fields persisted by atomic RPC |
| Approve proposal | `POST /api/v1/operator/proposals/:id/approve` | Done | Add stale/policy conflict tests |
| Reject proposal | `POST /api/v1/operator/proposals/:id/reject` | Done | Freeze reason-code validation |
| Activate campaign | `POST /api/v1/operator/proposals/:id/activate` | Done | Verify real approved proposal transaction |
| Campaign list | `GET /api/v1/operator/campaigns` | Done | Normalize status and KPI aggregation |
| Cancel campaign | `POST /api/v1/operator/campaigns/:id/cancel` | Done | Atomic campaign/offer/participation/driver-state transition with audit |
| Offer list/filter | `GET /api/v1/operator/offers?campaignId=` | Done | Normalize status/reason fields |
| Expire offer | `POST /api/v1/offers/:id/expire` | Done | Atomic operator-only transition with audit |
| Respond to offer | `POST /api/v1/offers/:id/respond` | Done | Driver-only atomic response and participation creation |
| Audit history | `GET /api/v1/operator/audit` | Done | Add pagination and stable action mapping |
| Driver list | `GET /api/v1/drivers` | Done | Add pagination/filter only if UI needs it |
| Driver detail | `GET /api/v1/drivers/:id` | Done | Freeze `DriverView` response |
| Driver self view | `GET /api/v1/driver/me` | Done | Use this route for driver app |
| Driver status | `PATCH /api/v1/drivers/:id/status` | Done | Prefer `/driver/me/status` for driver self-update |
| Load demo scenario | `POST /api/v1/operator/demo/scenarios/:id/load` | Mock-only by design | Live adapter returns `LIVE_UNSUPPORTED` |
| Reset demo | `POST /api/v1/operator/demo/reset` | Mock-only by design | Live adapter returns `LIVE_UNSUPPORTED` |

### 0.3 Backend correctness before frontend wiring

- [x] Align `ReviseProposalDto` with all fields in `RevisePlanRequest`.
- [x] Map database uppercase statuses to the canonical frontend unions.
- [x] Convert PostGIS geography responses at the backend boundary.
- [x] Make campaign cancellation transactional with offer/participation/driver-state updates and audit.
- [x] Make offer acceptance transactional with participation creation/slot checks.
- [x] Add the missing offer-expiration transition.
- [x] Add the live baseline endpoint and formally keep scenarios mock-only.
- [ ] Add pagination parameters to audit if more than 200 rows are expected.
- [x] Add OpenAPI response DTOs instead of undocumented inferred objects.
- [x] Add unit coverage for DB JSON, status, offer, driver, and campaign mapper behavior.
- [x] Add live no-mutation integration tests for approve/reject/revise/activate failure paths.
- [x] Update `apps/backend/BACKEND_CHECKLIST.md` after verified backend milestones.

Exit gate: every API used by the first frontend slice has a frozen Swagger
example, passing unit test, and passing JWT integration smoke test.

## Phase 1 — Frontend auth and API foundation

### 1.1 Environment and dependency gate

- [x] Add `VITE_API_BASE_URL=http://localhost:3000/api/v1` to frontend env examples.
- [x] Add only the Supabase URL and publishable key to frontend env.
- [x] Confirm no `service_role`, database password, or backend secret exists under `apps/frontend/`.
- [x] Verify current `@supabase/supabase-js` version compatibility, types, license and bundle cost.
- [x] Install the SDK only when the auth implementation imports it.
- [x] Update the frontend lockfile.

### 1.2 Shared API boundary

- [x] Extend `shared/config/env.ts` with validated API/auth configuration.
- [x] Replace `requestLocal` with a typed HTTP client supporting:
  - Base URL joining.
  - Bearer-token injection.
  - JSON parsing.
  - Request timeout and cancellation.
  - Empty `204` responses.
  - Normalized Vietnamese `AppError` messages.
  - `401`, `403`, `404`, `409`, `422`, and `5xx` handling.
- [x] Keep original error causes available for debugging.
- [x] Never return raw `Response` objects to features.
- [x] Add tests for timeout, invalid JSON, normalized errors and token injection.

### 1.3 Authentication feature

- [x] Add an auth feature with session ownership in `app`/`features/auth`.
- [x] Add an accessible login page with loading, validation and error states.
- [x] Restore and refresh sessions on application bootstrap.
- [x] Resolve role through `GET /auth/me` after sign-in.
- [x] Add operator and driver route guards.
- [x] Redirect `OPERATOR` to `/operator` and `DRIVER` to `/driver`.
- [x] Add logout and clear the TanStack Query cache on logout.
- [x] Replace hard-coded operator name/role in `OperatorShell` with auth data.
- [x] Do not mirror authenticated server data into a second global store.
- [ ] Test login success, invalid credentials, refresh, logout and role redirects.

Exit gate: both test identities can sign in, refresh, reach only the allowed
shell, and log out without stale data from the other identity.

## Phase 2 — Real adapter behind the existing interface

- [x] Keep `mockOperatorAdapter` available for deterministic component/unit tests.
- [x] Add `httpOperatorAdapter` implementing the complete `OperatorDataAdapter`.
- [x] Add one adapter selector/configuration point; do not branch inside components.
- [x] Add boundary mappers for proposal, campaign, offer, driver, snapshot and audit.
- [x] Validate untrusted API payloads before returning domain objects.
- [x] Return `undefined` only for documented not-found adapter methods.
- [x] Change query/mutation modules to import the selected adapter, not the mock directly.
- [x] Preserve existing query-key definitions.
- [x] Replace global `invalidateQueries()` with targeted invalidation per mutation.
- [ ] Keep polling only where the UI benefits; pause it while the tab is hidden if appropriate.
- [ ] Add adapter contract tests that run against both mock and HTTP fixtures.

Exit gate: switching one environment flag changes the data source without any
page or component changes.

## Phase 3 — Incremental feature wiring order

### Slice A: authenticated read-only operator UI

- [x] Wire plans list/detail.
- [x] Wire campaigns, offers, drivers and audit history.
- [x] Wire latest snapshot and heatmap geometry.
- [ ] Add loading, empty, error, stale and retry states to every query screen.
- [x] Confirm UUID routing works for real proposal IDs.

### Slice B: operator mutations

- [x] Wire revise proposal and surface field-level `422` errors.
- [x] Wire approve/reject and handle `409`/state conflicts.
- [x] Wire activate campaign and disable duplicate submission while pending.
- [x] Wire campaign cancellation with a confirmation dialog.
- [ ] Use targeted optimistic UI only where rollback is safe.
- [x] Disable actions while mutations are pending.

### Slice C: driver workflow

- [x] Use `/driver/me` instead of a hard-coded demo driver ID.
- [x] Wire online/offline status update.
- [x] Wire offer accept/decline.
- [x] Refresh driver view and affected campaign queries after responses.
- [ ] Handle expired, already-answered and permission-denied offers.
- [ ] Preserve keyboard accessibility and mobile layout from 360px.

### Slice D: scenarios, reporting and demo controls

- [x] Wire live baselines and keep scenarios explicitly mock-only.
- [x] Prevent simulation-only load/reset controls from silently mutating live data.
- [ ] Wire demo reset only with operator confirmation and environment guard.
- [x] Verify report metrics use live snapshot, baseline, campaign and budget data.

Exit gate: no production-facing screen silently mixes mock and live records.

## Phase 4 — End-to-end verification

- [x] Start backend and frontend from clean terminals using documented commands.
- [x] Run backend `npm run check:live`.
- [x] Run frontend TypeScript compilation through `npm run check`.
- [x] Run frontend `npm run lint`.
- [x] Run frontend tests.
- [x] Run frontend production build.
- [x] Verify production dependency audits and review newly added packages.
- [x] Operator signs in and sees live snapshot/proposals/campaigns.
- [ ] Operator revises and approves a reviewable proposal.
- [x] Operator activates exactly one campaign; duplicate activation is rejected.
- [x] Driver signs in and sees only their own offers.
- [x] Driver accepts an offer; UI and live DB campaign participation update atomically.
- [ ] Unauthorized and cross-driver operations are rejected.
- [x] Refreshing the browser preserves the session and route.
- [x] Logout clears private cached data.
- [ ] Test loading, empty, API-down, expired-session and permission states.
- [x] Verify no backend secret appears in frontend source, production bundle or tracked files.
- [ ] Verify responsive layouts at 360px, tablet and desktop widths.
- [x] Update backend, DB-first and integration checklists with evidence.

## Definition of done

- [x] All production-facing frontend capabilities enabled in live mode have implemented backend contracts.
- [x] Mock mode remains deterministic and explicitly selectable for tests/demo fallback.
- [x] Authentication and role routing work with the real test identities.
- [x] All protected operations are authorized server-side, not merely hidden in UI.
- [x] No component directly accesses fetch/Supabase/storage/timers.
- [x] No raw backend/database casing or geometry leaks into presentational components.
- [x] All required backend and frontend checks pass.
- [x] Swagger, README, env examples and checklists match the implemented live connection.
- [x] The full operator-to-driver campaign flow succeeds end to end.

## Verified evidence (2026-08-09)

- [x] Frontend: 15 test files and 31 tests pass; lint and production build pass.
- [x] Backend: typecheck, 4 unit tests, production build, live DB smoke and authenticated API smoke pass.
- [x] Production dependency audits report zero vulnerabilities in both applications.
- [x] Browser E2E: operator login → approve proposal → activate campaign → driver login → accept offer.
- [x] Live DB after acceptance: offer `ACCEPTED`, participation `ACCEPTED`, driver `EN_ROUTE`, audit `OfferAccepted`.
- [x] Disposable E2E proposal/campaign/offer/participation were removed and the test driver restored to `OFFLINE`.

## Planned implementation sequence

1. Freeze API wire contracts and fix backend mismatches.
2. Add missing backend transitions and tests.
3. Add frontend auth/session and shared HTTP client.
4. Implement the real adapter without changing UI components.
5. Wire read-only operator screens.
6. Wire operator mutations.
7. Wire driver self-service flow.
8. Decide and wire simulation/demo-only features.
9. Run the complete end-to-end and security checklist.

Do not begin a later phase while the previous phase's exit gate is failing.
