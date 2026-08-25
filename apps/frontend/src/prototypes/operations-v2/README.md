# Operations V2 prototype

This directory preserves the dark Operations V2 interface for design review.

- It is intentionally not imported by `src/app/router.tsx`.
- It has no production route and is excluded from the Vite bundle by tree shaking.
- The deployed product continues to use the classic operator interface at `/operator`.
- The shared car artwork remains in `src/features/operations-v2/assets` because the classic operator map also uses it.
- The prototype entry component is `OperationsV2Page.tsx`.

Do not wire this prototype into the production router without an explicit product decision.
