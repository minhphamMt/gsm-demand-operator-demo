# DB-first hardening checklist

Updated: 2026-08-09

Current gate: **COMPLETE — live backend/frontend connection verified**

## Live database

- [x] Inspect all live public tables, columns, constraints, RLS policies, grants, functions, views, data values, and migration history.
- [x] Treat the live Supabase schema as the source of truth for lifecycle and transaction design.
- [x] Normalize legacy seed values to the canonical DB vocabulary.
- [x] Add missing lifecycle check constraints.
- [x] Enforce one campaign per proposal and one participation per offer.
- [x] Force all public signups to the `DRIVER` role; operator promotion stays an admin operation.
- [x] Keep all privileged business RPCs executable only by `service_role`.
- [x] Add RLS-aware GeoJSON views instead of returning PostGIS WKB.
- [x] Apply live migration `20260809160000_db_first_hardening`.
- [x] Apply live migration `20260809163000_fix_activation_postgis_path`.
- [x] Apply live migration `20260809170000_extend_revision_contract`.
- [x] Record all three versions in `supabase_migrations.schema_migrations`.
- [x] Apply and record live migrations `20260809200000_audit_request_context` and `20260809203000_complete_mutation_audit`.

## Atomic domain workflows

- [x] Revise a reviewable proposal, stale the parent, and write audit in one transaction.
- [x] Approve/reject a policy-valid proposal and record reviewer/audit in one transaction.
- [x] Activate one approved proposal into one `ACTIVE` campaign and send offers atomically.
- [x] Accept an active offer with target-slot locking, participation creation, driver-state update, and audit.
- [x] Decline an offer atomically with audit.
- [x] Expire an open offer atomically with audit.
- [x] Cancel a campaign with offer expiry, participation cancellation, driver release, and audit.
- [x] Run rollback-only live transaction tests for revise/approve and activate/respond/cancel.

## Backend contract

- [x] Route every mutation through the DB transaction RPCs.
- [x] Pass the authenticated operator/driver identity into audited operations.
- [x] Restrict offer response to the owning `DRIVER` endpoint.
- [x] Map actual `source_plan.moves` and `simulation_details.metrics_*` JSON keys.
- [x] Preserve all H3 target arrays while retaining the primary target convenience field.
- [x] Return GeoJSON coordinate arrays for heatmap and driver location data.
- [x] Map canonical DB states to stable frontend-facing states.
- [x] Count completed trips and normalized simulated-paid rewards from live records.
- [x] Normalize known DB conflicts/validation errors without leaking unexpected SQL details.

## Verification

- [x] Backend typecheck passes.
- [x] Backend unit tests pass.
- [x] Backend production build passes.
- [x] Live DB smoke checks pass, including both GeoJSON views.
- [x] Authenticated API smoke checks pass for public/operator/driver authorization.
- [x] Frontend lint passes after DB status-contract updates.
- [x] Frontend tests pass (31/31 across 15 test files).
- [x] Frontend production build passes.

## Next phase: connect backend and frontend

- [x] Add browser Supabase authentication/session refresh.
- [x] Add the authenticated HTTP client and `httpOperatorAdapter`.
- [x] Transform the existing UI revision form into the DB-aligned revision request.
- [x] Wire operator read screens, then operator mutations, then driver self-service.
- [x] Run the operator-to-driver end-to-end flow with dedicated disposable fixtures and clean them afterward.
- [x] Verify no backend secret exists in the frontend source or production bundle.
