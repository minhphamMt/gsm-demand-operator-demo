# GSM-14 Operator Frontend Checklist

Tick a task only after its required validation succeeds.

## 0. Project foundation

- [x] Scaffold React + TypeScript + Vite frontend.
- [x] Add and validate the `frontend-engineering` skill.
- [x] Create the implementation checklist.
- [x] Create frontend-only `.env` and `.env.example`.
- [x] Store the Mapbox public token in ignored local environment configuration.
- [x] Enable strict TypeScript safety options.
- [x] Convert operator routes to a nested layout with centralized route paths.
- [x] Add route-level not-found and error states.
- [x] Add Vitest and React Testing Library foundation.
- [x] Remove unused direct dependencies and obsolete scaffold components.
- [ ] Remove the remaining unused binary Vite scaffold asset (the environment's text patcher cannot safely delete it).
- [x] Remove duplicate type checking from the validation pipeline.
- [x] Pass foundation lint, test, typecheck, and production build.

## 1. Shared design system

- [x] Define color, spacing, typography, radius, shadow, and status tokens.
- [x] Build Button and IconButton variants.
- [x] Build Card, Badge, StatusBadge, and SeverityBadge.
- [x] Build Input, Select, Textarea, and form field primitives.
- [x] Build Table, Tabs, Dialog, Drawer, and confirmation patterns.
- [x] Build Skeleton, EmptyState, ErrorState, and loading patterns.
- [x] Complete responsive OperatorShell and mobile navigation.
- [x] Add notification and operator profile menus.

## 2. Typed data and local adapter

- [x] Define snapshot, zone, forecast, hotspot, plan, campaign, and audit types.
- [x] Create normalized API errors and typed request client.
- [x] Create one interface for mock and future backend adapters.
- [x] Create deterministic 30-zone mock dataset.
- [x] Add TanStack Query keys and query option factories.
- [x] Cover loading, empty, error, and stale states.

## 3. Replay dashboard and map

- [x] Research and install Mapbox GL when first used.
- [x] Initialize Mapbox from typed frontend environment config.
- [x] Render the Hà Nội operator map.
- [x] Verify the real Mapbox token and map controls in Chrome without console errors.
- [x] Render local zone/H3 GeoJSON overlays.
- [x] Add supply-demand severity styling and legend.
- [x] Add zone hover, selection, and detail drawer.
- [x] Add scenario selector and five-minute replay controls.
- [x] Add operational KPI cards and stale-data warning.
- [x] Add hotspot ranking and drill-down.

## 4. Relocation proposals

- [x] Build proposal list with filters and statuses.
- [x] Build plan detail and move table.
- [x] Build policy-check results and warning states.
- [x] Build before/after simulation metrics.
- [x] Build deadhead, ETA, budget, and residual-gap views.
- [x] Build deterministic explanation panel.
- [x] Build proposal version history.

## 5. Human-in-the-loop

- [x] Revise move quantities and remove moves.
- [x] Validate source supply, distance, and budget before submission.
- [x] Re-simulate after revision.
- [x] Approve a valid proposal with confirmation.
- [x] Reject a proposal with a required reason.
- [x] Block approval for failed policy or stale input.
- [x] Record every decision in local audit history.

## 6. Activation and campaign monitoring

- [x] Show residual-gap activation summary after plan approval.
- [x] Confirm activation separately from plan approval.
- [x] Show candidate count, offer count, and worst-case incentive commitment.
- [x] Poll campaign state every two seconds.
- [x] Show Sent, Accepted, Declined, Expired, and Cancelled funnel stages.
- [x] Show units gained and incentive budget usage.
- [x] Cancel a running campaign safely.
- [x] Handle no candidates, exhausted budget, overbooking, and expiry.

## 7. Reporting, notifications, and history

- [x] Compare no-action, plan-only, and plan-plus-activation scenarios.
- [x] Build campaign effectiveness and cost reports.
- [x] Label simulated and human-demo metrics distinctly.
- [x] Build notification center and event badges.
- [x] Filter audit history by plan, time, actor, and action.
- [x] Show plan, activation, offer, and driver-response timeline.

## 8. Release quality

- [ ] Validate layouts from 360px through desktop widths.
- [x] Complete keyboard and screen-reader checks.
- [x] Add tests for loading, empty, error, and stale states.
- [x] Add tests for revise, approve, and reject behavior.
- [x] Add tests for activation and campaign cancellation.
- [x] Lazy-load remaining chart and route-level bundles (Mapbox map complete).
- [x] Review bundle size and rendering performance (Mapbox worker chunks remain intentionally large).
- [x] Run the complete local demo successfully five times.
- [x] Pass typecheck, lint, tests, and production build.
