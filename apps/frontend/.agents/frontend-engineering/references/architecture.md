# Frontend Architecture

## Layer map

```text
src/
├── app/                    # bootstrap, providers, router composition
├── pages/                  # route-level composition only
├── features/<feature>/     # one domain capability
│   ├── api/                # feature requests and query options
│   ├── components/         # feature UI
│   ├── hooks/              # feature orchestration
│   ├── model/              # domain types, schemas, pure rules
│   └── index.ts            # optional public API
├── shared/
│   ├── api/                # base client, shared API errors
│   ├── components/ui/      # domain-free primitives
│   ├── components/layout/  # shells and structural layout
│   ├── config/             # route paths, environment-safe config
│   ├── hooks/              # genuinely cross-feature hooks
│   ├── lib/                # pure generic utilities
│   └── types/              # types shared by multiple features
└── styles/                 # global tokens and base styles
```

Create only directories required by the current feature.

## Import boundaries

| Layer | May import from | Must not import from |
|---|---|---|
| `app` | pages, features, shared | — |
| `pages` | features, shared | another page |
| `features` | own feature, shared | pages, app, another feature's internals |
| `shared` | shared | app, pages, features |

If two features need the same domain concept, move the stable shared contract to `shared/types` or expose it through a deliberate feature public API. Do not reach into another feature's internal folder.

## Route rules

- Declare route paths in one typed configuration when they are used by both router and navigation.
- Use a nested route for each application shell:

```text
/operator -> OperatorShell
  index   -> dashboard
  plans   -> plan list/detail
  history -> decision history
```

- Keep navigation metadata separate from layout markup.
- Lazy-load route-level pages once real dashboard/map/chart screens make the initial bundle meaningfully larger.
- Provide a not-found route and a route-level error state.
- Never use router code to fetch business data or mutate feature state.

## Component ownership

- `pages`: compose sections, set route-level title, read route parameters.
- `features`: own GSM-14 behavior such as heatmap, hotspot, proposal review, campaign tracking, and simulation comparison.
- `shared/components/ui`: own generic Button, Badge, Card, Dialog, Table, Skeleton, and similar primitives.
- `shared/components/layout`: own sidebar, header, content frame, and responsive shell behavior.

Promote a component to `shared` only after two real features need the same behavior and vocabulary.

## State ownership

- Remote/backend state: TanStack Query.
- Form state: local React state for simple forms; React Hook Form only when form complexity justifies it.
- URL state: router search params for shareable filters, selected IDs, tabs, and pagination.
- Local visual state: nearest owning component.
- Cross-page client-only state: Zustand only after documenting why URL, server state, or lifted local state is insufficient.

Never mirror query data into Zustand.

## API boundary

- Centralize base URL, request execution, timeout, JSON parsing, and normalized errors in `shared/api`.
- Keep endpoint-specific functions and query keys in the owning feature's `api` directory.
- Validate untrusted response data at the boundary when the backend contract is not guaranteed.
- Return domain data from API modules; do not leak raw `Response` objects into UI code.
- Keep mock and real adapters behind the same typed interface so local development can switch without rewriting components.
