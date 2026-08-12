# GSM backend production runbook

## Release contract

- Build the immutable image from `apps/backend/Dockerfile`; inject secrets at runtime, never at build time.
- Required secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Set `CORS_ORIGINS` explicitly. Keep `CAMPAIGN_LIFECYCLE_ENABLED=true` and an interval of at least 5000 ms.
- Keep `SIMULATION_WRITE_ENABLED=false` until a model owner approves a separate production rollout.
- Run one API instance while throttling is process-local. Shared throttler storage is required before horizontal scaling.

## Migration and deploy

1. Create and verify a critical-data backup.
2. Apply pending SQL migrations in filename order and record them in Supabase migration history.
3. Run `npm run check:live` against the target project.
4. Deploy the image and wait for `/api/v1/health/live` and `/api/v1/health/ready` to return `200`.
5. Verify `/api/v1/health/metrics`, one authenticated operator read and the lifecycle audit stream.

Rollback the application by redeploying the previous immutable image. Database migrations in this project are forward-only; do not delete audit or operational rows. Correct a faulty migration with a new migration.

## Monitoring and alerts

- Scrape `/api/v1/health/metrics` every 30 seconds and probe `/api/v1/health/ready` every 15 seconds.
- Alert after 3 consecutive readiness failures, any sustained 5xx rate above 2%, lifecycle failure logs, or no successful lifecycle execution for twice the configured interval while active campaigns exist.
- Ingest JSON logs and index `event`, `requestId`, `status`, `durationMs` and `timestamp`.
- Alert on p95 request latency above 2 seconds for 5 minutes and memory RSS above the container limit's 85%.

## Backup, restore drill and retention

Create an encrypted storage destination outside the repository, then run:

```powershell
npm run backup:critical -- D:\secure-backups\gsm-critical-YYYYMMDD.json
npm run backup:verify -- D:\secure-backups\gsm-critical-YYYYMMDD.json
```

The backup includes snapshot headers/cells, hotspots and append-only audit with counts and SHA-256. A restore drill must first run `backup:verify`, then import into an isolated Supabase project, compare counts and foreign-key relationships, and run `smoke:db`; never restore over production.

- Keep audit backups for the legally approved retention period; audit rows are not automatically purged.
- Keep at least 90 days of snapshots unless product/legal approves another period.
- Run a restore drill monthly and after any schema change affecting the four backed-up tables.
- Supabase platform backups remain the primary full-database disaster-recovery mechanism; this export is the independently verifiable critical-data copy.

## Incident handling

Use `requestId` to trace HTTP and mutation audit entries. If lifecycle reconciliation fails, keep the API available for reads, disable it with `CAMPAIGN_LIFECYCLE_ENABLED=false`, inspect the latest migration and run the RPC once manually after correction. Never edit or delete an existing audit row.
