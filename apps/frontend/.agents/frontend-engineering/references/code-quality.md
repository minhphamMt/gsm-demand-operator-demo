# React and TypeScript Quality Rules

## Type safety

- Enable strict TypeScript. Prefer `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Model finite domain states with unions instead of free-form strings.
- Use `unknown` at untrusted boundaries and narrow it before use.
- Prefer `satisfies` when checking configuration objects while preserving inferred literals.
- Keep nullable, optional, empty, loading, and unavailable states distinct.
- Avoid type assertions. If an assertion is unavoidable, document the runtime fact that makes it safe.

## React components

- Give each component one reason to change.
- Keep data transformation outside JSX when it obscures rendering intent.
- Prefer composition over boolean-heavy components.
- Keep callbacks and memoization simple; add `useMemo` or `useCallback` only for measured identity/performance needs or stable library contracts.
- Do not store derived values in state.
- Use controlled components when the parent must own the value; otherwise keep state local.
- Handle asynchronous race, cancellation, retry, empty, error, and stale states through the query layer.

## Hooks

- Name custom hooks `use...` and give each hook one orchestration responsibility.
- Do not hide unrelated side effects in a convenience hook.
- Return a small named object when several values are exposed.
- Keep pure domain calculations as ordinary functions, not hooks.

## Naming

- Components, pages, and types: `PascalCase`.
- Hooks, functions, variables: `camelCase`.
- Constants shared across modules: descriptive `camelCase`; use `UPPER_SNAKE_CASE` only for true compile-time constants.
- Files containing one component: match the component name.
- Feature folders and route segments: lowercase kebab-case.
- Name booleans as questions: `isLoading`, `hasHotspots`, `canApprove`.

Avoid vague names such as `data`, `item`, `handleThing`, `utils`, or `common` when a domain name exists.

## UI and styling

- Use Tailwind utilities and shared design tokens; avoid repeated arbitrary values.
- Build reusable variants for recurring button, badge, card, input, and status styles.
- Keep color meaning consistent for supply status, severity, warning, success, and disabled states.
- Preserve readable contrast and visible focus.
- Design mobile-first from 360px, then add tablet/desktop layout.
- Avoid inline styles except for truly dynamic values that Tailwind cannot express cleanly.

## Accessibility

- Use native semantic elements before ARIA.
- Associate every form control with a visible or accessible label.
- Ensure all interactions work by keyboard.
- Use real buttons for actions and links for navigation.
- Give icon-only buttons an accessible name.
- Announce important async status changes where appropriate.
- Do not encode status using color alone.
- Respect reduced-motion preferences for nonessential animation.

## Error handling

- Show user-facing errors in Vietnamese and keep technical details out of the UI.
- Preserve the original cause in normalized application errors for debugging.
- Never catch an error only to return fake success or an empty value.
- Provide retry only when the operation is safe to repeat.

## Testing priority

Test behavior, not implementation details. Prioritize:

1. Domain calculations and status transitions.
2. Operator approve/revise/reject interactions.
3. Loading, empty, error, permission, and stale-data states.
4. Router behavior and critical user flows.
5. Accessibility of interactive components.

Avoid snapshots for large pages and avoid tests that only assert Tailwind class strings.
