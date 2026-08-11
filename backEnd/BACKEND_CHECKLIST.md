# GSM Backend Implementation Checklist

Updated: 2026-08-09

Backend DB-first readiness: **LIVE INTEGRATION READY**

## 1. Discovery and architecture

- [x] Review the existing repository and preserve unrelated user changes.
- [x] Read the GSM domain, database, and technology-stack specifications.
- [x] Inspect the live Supabase project and verify that it is healthy.
- [x] Compare the live `public` schema with the frontend data contract.
- [x] Confirm NestJS + TypeScript as the project backend stack.
- [x] Confirm the live tables, view, status constraints, and current public functions.

## 2. Backend foundation

- [x] Scaffold the NestJS project in `backEnd/`.
- [x] Add TypeScript, build, test, and development scripts.
- [x] Add environment templates and ignore local secrets.
- [x] Configure global validation, CORS, Helmet, API prefix, and Swagger.
- [x] Implement the public health endpoint.
- [x] Implement a reusable server-only Supabase service.
- [x] Pin the patched `js-yaml` dependency override.

## 3. Authentication and authorization

- [x] Validate Supabase bearer tokens on protected endpoints.
- [x] Load the active application profile for every authenticated request.
- [x] Enforce `OPERATOR` and `DRIVER` endpoint roles.
- [x] Prevent drivers from updating another driver's status.
- [x] Prevent drivers from responding to another driver's offer.
- [x] Keep the Supabase service-role key out of frontend code and Git.
- [x] Create idempotent setup for live `OPERATOR` and `DRIVER` test users.
- [x] Store test credentials only in Git-ignored `.env.test.local`.
- [x] Implement `/auth/me` so the frontend can resolve the authenticated role.

## 4. Operator and driver API

- [x] Implement latest supply-demand snapshot and hotspot API.
- [x] Implement live baselines derived from snapshots.
- [x] Implement proposal list/detail API.
- [x] Implement proposal revision, approval, and rejection APIs.
- [x] Implement campaign list and cancellation APIs.
- [x] Implement offer list and response APIs.
- [x] Implement driver list and status update APIs.
- [x] Implement operator driver-detail and authenticated driver self-view APIs.
- [x] Implement audit-history API.
- [x] Map database snake_case records to the frontend camelCase contract.

## 5. Transaction and Supabase setup

- [x] Apply and record `20260809160000_db_first_hardening.sql` in live migration history.
- [x] Apply and record `20260809163000_fix_activation_postgis_path.sql`.
- [x] Apply and record `20260809170000_extend_revision_contract.sql`.
- [x] Normalize legacy campaign, proposal-policy, hotspot, reward-type, and reward-status values.
- [x] Add canonical lifecycle constraints and proposal/participation uniqueness indexes.
- [x] Prevent public signup metadata from assigning `OPERATOR`; new signups are always `DRIVER`.
- [x] Add atomic `revise_proposal`, `review_proposal`, `activate_proposal`, `cancel_campaign`, `respond_to_offer`, and `expire_offer` RPCs.
- [x] Restrict every business RPC to the Supabase `service_role`.
- [x] Add RLS-aware GeoJSON views for H3 cells and driver locations.
- [x] Add the live project service-role key to local `backEnd/.env`.
- [x] Verify all RPC signatures, removed legacy activation signature, and execute permissions in Supabase.
- [x] Run rollback-only transaction tests for revise/approve and activate/respond/cancel.
- [x] Run read-only live database smoke checks from the backend configuration.
- [x] Add a repeatable `npm run smoke:db` live database smoke command.

## 6. Quality gates

- [x] TypeScript typecheck passes.
- [x] Unit tests pass, including real DB JSON/status mapper cases.
- [x] NestJS production build passes.
- [x] Production dependency audit reports zero vulnerabilities.
- [x] Run a local health smoke test with the live environment.
- [x] Run authenticated API integration tests against Supabase.
- [x] Verify public, unauthenticated, OPERATOR, and DRIVER authorization responses.
- [x] Add repeatable `npm run check` and `npm run check:live` quality gates.
- [x] Add explicit Swagger response DTOs and request/response examples for operator APIs.
- [x] Add the stable API error envelope and hide unexpected internal error details.
- [x] Add and live-test `x-request-id` correlation headers.
- [x] Document integer VND, ISO-8601 timestamps, `404`, and empty-collection rules.
- [x] Return field-level `422` details for proposal revision and rejection validation.
- [x] Map concurrent proposal review/revision state changes to stable `409` conflicts.
- [x] Enforce stale-input and policy preconditions in the operator service before review RPCs.
- [x] Live-test proposal revision/review/activation failure paths with disposable fixtures and verify no audit/state mutation.
- [x] Connect the frontend adapter to the real backend API.
- [x] Run the disposable frontend/backend end-to-end flow and verify DB state.

## 7. Later MVP modules

- [ ] Add the deterministic supply-demand simulator service.
- [ ] Add hotspot/proposal generation jobs.
- [ ] Add GPS ingestion and arrival verification.
- [ ] Add trip simulation and reward-ledger transactions.
- [ ] Add WebSocket events for campaign and driver updates.
- [ ] Add retention jobs for snapshots and location events.
- [ ] Add deployment configuration for Railway.

## 8. Frontend handoff gate

- [x] Live Supabase environment is configured locally.
- [x] Operator and driver test identities are ready.
- [x] `/auth/me` exposes the authenticated role.
- [x] Operator and driver read APIs pass live JWT checks.
- [x] Backend can be started with `npm run start:dev`.
- [x] Swagger contract is available at `/docs`.
- [x] Repeatable full readiness command is available as `npm run check:live`.
- [x] Select the HTTP/Supabase auth adapter in live mode while preserving mock mode for tests.
