# GSM-14 Operator Review Workflow Checklist

The fake adapter replaces the future API boundary. This checklist covers the operator/reviewer experience only; no new Driver App work is in scope.

## A. Seeded data on first load

- [x] Dashboard starts with current supply, demand, hotspots, forecasts and data-quality metadata.
- [x] GSM-14 Agent starts with three review-ready proposals from the same snapshot.
- [x] Plan history contains approved and rejected decisions with version and provenance data.
- [x] Campaigns contain running, completed and cancelled records.
- [x] Every seeded campaign has a complete, referentially valid offer list.
- [x] Audit history starts with Agent, operator, campaign and driver events.

## B. Operator workflow

- [x] Compare Agent proposals and open a detailed review.
- [x] Inspect source zones, moves, confidence, explanation, warnings and policy checks.
- [x] Revise campaign parameters and rerun impact calculations with a mandatory note.
- [x] Preserve every revision as a separate proposal record and mark its parent as superseded.
- [x] Approve through a checklist or reject with a structured reason.
- [x] Keep approval separate from campaign activation.
- [x] Block offer publication until the selected proposal is approved.
- [x] Preview the same live eligible-driver set used when offers are published.
- [x] Navigate directly to the newly created campaign after publication.
- [x] Track offer sent/viewed/accepted/en-route/GPS-verified funnel stages.
- [x] Track vehicles reaching the zone, qualified trips, committed cost and remaining budget.
- [x] Cancel a running campaign while preserving already accepted offers.
- [x] Compare impact against no-action and historical baselines.

## C. Product-like experience

- [x] No scenario selector, load snapshot, reset, replay or demo-account control appears in the UI.
- [x] Zone identifiers are translated to operator-facing place names.
- [x] All main routes have realistic data immediately after navigation.
- [x] Data access remains behind the typed adapter so the real backend can replace it later.
- [x] Open live proposal notifications directly into the review record and track read state.
- [x] Replace stale review proposals automatically with a fresh Agent batch.
- [x] Verify the complete operator flow in the desktop browser.
- [x] Cover revise → approve → publish → campaign with an integration test.
- [x] Pass typecheck, lint, tests and production build after the final UX review.
