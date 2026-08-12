# Dependency Policy

## Decision gate

Answer these questions before installation:

1. What concrete current requirement does the package solve?
2. Why are React, browser APIs, Tailwind, or an installed package insufficient?
3. Is the package documented as compatible with the installed React, TypeScript, and Vite versions?
4. Does it ship maintained TypeScript types?
5. What are its runtime bundle cost, transitive dependency cost, license, maintenance status, and accessibility implications?
6. Can a smaller focused package solve the same requirement?
7. Will the package be imported by the current change?

If question 1 or 7 has no concrete answer, do not install it.

## Research rules

- Prefer official documentation, release notes, package registry metadata, and source repositories.
- Verify current APIs instead of relying on memory when versions may have changed.
- Record a short implementation note when choosing between meaningful alternatives.
- Never copy a package example without adapting types, error states, accessibility, and project boundaries.

## Approved roles in this project

| Need | Preferred package | Constraint |
|---|---|---|
| Routing | React Router | Use nested layouts and typed central paths |
| Server state | TanStack Query | Do not duplicate its state in Zustand |
| Shared client state | Zustand | Add a store only after proving cross-page need |
| Styling | Tailwind CSS | Extract recurring variants/components |
| Icons | Lucide React | Import icons individually; label icon-only controls |
| Charts | Recharts | Isolate charts and strongly type chart data |
| Forms | React Hook Form + Zod | Install only when real form/schema complexity appears |
| Map | Mapbox GL + h3-js + Turf | Install when implementing the map feature; keep adapters local/mockable |

This table is a preference, not permission to preinstall unused packages.

## Removal rule

Remove a direct dependency when it has no current import, no immediate implementation task, and no required build/config role. Confirm removal with `npm ls`, typecheck, tests, and build.

## Security and local-only rules

- Never put secrets in frontend code or `VITE_*` variables intended for the browser.
- Do not add analytics, telemetry, error-reporting SaaS, CDN scripts, remote fonts, or remote assets without explicit approval.
- Avoid dependencies that execute install scripts unless clearly necessary and reviewed.
- Commit the lockfile after dependency changes.
