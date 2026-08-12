---
name: frontend-engineering
description: Enforce the GSM-14 frontend engineering standard for React, TypeScript, Vite, Tailwind, routing, reusable components, feature architecture, local API integration, dependency selection, refactoring, and code review. Use whenever planning, creating, reviewing, or modifying any file under frontEnd/, including pages, components, hooks, state, routes, styles, tests, configuration, or package dependencies.
---

# GSM-14 Frontend Engineering

Build maintainable frontend code for the local-only GSM-14 operator and driver applications.

## Load the right references

- Read [references/architecture.md](references/architecture.md) before adding or changing a page, route, layout, feature, API boundary, or state owner.
- Read [references/code-quality.md](references/code-quality.md) before implementing or reviewing TypeScript, React components, hooks, forms, styling, or accessibility.
- Read [references/dependency-policy.md](references/dependency-policy.md) before installing, removing, replacing, or substantially using a package.

Read every reference that applies. Do not load unrelated references.

## Preserve the project contract

- Keep the frontend local-only. Do not add external service integrations, credentials, telemetry, hosted fonts, remote images, or third-party SDKs without explicit approval.
- Use React + TypeScript + Vite + Tailwind as the fixed foundation.
- Keep `/operator` for the dispatcher UI and reserve `/driver` for the driver UI.
- Treat the backend contract as replaceable. Access it only through typed modules under `shared/api` or a feature-local `api` directory.
- Do not call `fetch`, storage APIs, or timers directly from presentational components.

## Execute this workflow

### 1. Inspect before editing

1. Read the nearest instructions and relevant references.
2. Inspect the route, feature, shared component, types, tests, and package configuration affected by the task.
3. Identify existing patterns to reuse before creating a new abstraction.
4. Separate the requested behavior from speculative future work.

### 2. Design the smallest coherent change

1. Assign each responsibility to `app`, `pages`, `features`, or `shared` using the architecture reference.
2. Define data types and state ownership before writing UI logic.
3. Split the UI at responsibility boundaries, not arbitrary visual fragments.
4. Plan loading, empty, error, disabled, and success states when the feature reads or mutates data.
5. Keep routes and navigation consistent; do not create unreachable pages or dead links.

### 3. Pass the dependency gate

Before adding a package:

1. Confirm the platform or installed stack cannot solve the need clearly enough.
2. Research the current official documentation and compatibility with the installed React, TypeScript, and Vite versions.
3. Compare maintenance, bundle impact, type support, accessibility, and license.
4. Install only the smallest package that materially shortens or improves the implementation.
5. Use the package immediately. Do not add dependencies for hypothetical future work.

### 4. Implement within boundaries

- Keep pages compositional: pages assemble feature components and pass page-level parameters.
- Keep reusable domain behavior inside its feature.
- Keep generic UI and layouts free of GSM-14 business rules.
- Prefer explicit typed props, immutable data, pure transformations, and small hooks.
- Keep server state in TanStack Query. Use local component state by default; introduce Zustand only for genuinely shared client state.
- Keep route layouts nested and render child pages through `Outlet`.
- Preserve accessibility and responsive behavior from 360px upward.
- Add or update tests for business behavior, branching interactions, and regressions.

## Enforce size and complexity limits

- Target at most 120 lines for a page and 150 lines for a component or hook.
- Review every file over 150 lines for extraction before delivery.
- Do not deliver a source file over 250 lines without a concrete, task-specific reason.
- Extract when a file contains multiple responsibilities, independent state, reusable markup, repeated conditionals, or a testable pure transformation.
- Do not split a cohesive component solely to satisfy a line count.

## Prohibit shortcuts

- Do not use `any`, unsafe double assertions, `@ts-ignore`, silent error swallowing, or disabled lint rules to make checks pass.
- Do not duplicate domain types, query keys, route paths, status labels, or formatting rules across features.
- Do not place business logic in routers, layouts, UI primitives, or CSS.
- Do not use array indexes as keys for mutable lists.
- Do not add a global store for server state or ordinary parent-child state.
- Do not create generic abstractions before at least two real consumers exist.
- Do not leave unused generated assets, imports, dependencies, routes, or placeholder code.

## Complete the change

1. Re-read the diff for responsibility leaks and accidental scope expansion.
2. Confirm new files follow import boundaries and naming rules.
3. Run `npm run typecheck`.
4. Run `npm run lint`.
5. Run relevant tests when available.
6. Run `npm run build`.
7. Report changed behavior, validation performed, and any intentional limitation.

Never claim completion while a required check fails. Fix in-scope failures; report unrelated failures with evidence.
