# GSM Backend

NestJS API backed by the existing GSM Supabase/PostgreSQL project.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run start:dev
```

Set `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
Never expose the service-role key to Vite or commit it.

Create or refresh the two live Auth test accounts (credentials are read from
the Git-ignored `.env.test.local`):

```powershell
npm run setup:test-users
```

Swagger is available at `http://localhost:3000/docs`. Health is available at
`http://localhost:3000/api/v1/health`.

All API timestamps are ISO-8601 values with timezone. Money fields are integer
VND. Clients may send `x-request-id`; the backend preserves safe values or
generates a UUID and returns it in the response header. Error responses use:

```json
{
  "code": "NOT_FOUND",
  "message": "Không tìm thấy dữ liệu được yêu cầu.",
  "requestId": "9f57be2a-760b-4b5e-8b5e-fd2d6df370bb"
}
```

Validation failures may additionally contain `details.issues`. Unexpected
errors never expose SQL, credentials, or internal Supabase response details.
Missing single resources return `404`; collection endpoints return an empty
array when no rows match.

## Implemented API

- `GET /api/v1/auth/me`
- `GET /api/v1/operator/snapshots/latest`
- `GET /api/v1/operator/snapshots` with DB-backed time/scenario/H3 filters
- `GET /api/v1/operator/baselines`
- `GET /api/v1/operator/proposals` and `GET /:id`
- `POST /api/v1/operator/proposals/:id/revisions`
- `POST /api/v1/operator/proposals/:id/approve`
- `POST /api/v1/operator/proposals/:id/reject`
- `POST /api/v1/operator/proposals/:id/activate`
- `GET /api/v1/operator/campaigns`
- `POST /api/v1/operator/campaigns/:id/cancel`
- `GET /api/v1/operator/offers`
- `GET /api/v1/operator/audit`
- `GET /api/v1/drivers`
- `GET /api/v1/drivers/:id`
- `GET /api/v1/driver/me`
- `PATCH /api/v1/drivers/:id/status`
- `POST /api/v1/offers/:id/respond`
- `POST /api/v1/offers/:id/expire`

Operator mutations depend on the atomic RPC migrations under
`supabase/migrations/`. Apply and record migrations in version order before
calling revision, review, activation, cancellation, response, or expiry APIs.

All eight mutation routes are limited to 10 attempts per authenticated actor,
per endpoint, per 60 seconds. A blocked request returns `429/RATE_LIMITED` and
the `Retry-After-sensitive` header. The built-in storage is process-local; a
multi-instance production deployment must replace it with shared throttler
storage (for example Redis) before horizontal scaling.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run smoke:db
npm run smoke:api
```

`npm run check` runs the local quality gates. `npm run check:live` additionally
checks the live Supabase query paths and authenticated OPERATOR/DRIVER requests.

Campaign lifecycle reconciliation is DB-atomic and runs every 30 seconds by
default. It closes campaigns at `end_at` or `budget_limit`, expires remaining
open offers and writes `SYSTEM` audit rows. Configure it with
`CAMPAIGN_LIFECYCLE_ENABLED` and `CAMPAIGN_LIFECYCLE_INTERVAL_MS`.

Until a real model is integrated, `npm run simulate:planning` is a dry-run-only
adapter over the latest DB snapshot. Its output is explicitly `SIMULATED`; the
script rejects `--commit` and cannot create proposals or campaigns.
