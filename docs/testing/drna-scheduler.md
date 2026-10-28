# Automatic DRNA ingestion

The backend server runs `IngestionService.refresh()` after it starts listening, then every six hours while the process remains running. The existing adapter discovers the latest official results PDF, validates parsed rows, and upserts beach metadata and observations in a transaction. Retrieval time is not the laboratory sample date: downloading the same report does not make its samples new. Existing observation keys prevent duplicate samples.

Scheduling defaults to enabled. Set `DRNA_SCHEDULER_ENABLED=false` in `backend/.env` to disable DRNA independently of `NWS_SCHEDULER_ENABLED`. DRNA and NWS have separate timers and overlap guards; failure or a pending request for one does not block the other. Failed DRNA runs are logged and retried at the next six-hour tick. No data is deleted on a fetch/parser failure, and failed database writes roll back the batch.

Run only one scheduler-enabled backend instance. Guards are process-local and do not coordinate manual commands or other replicas. Disable both scheduler flags on other replicas; add distributed locking before enabling multiple scheduler instances. An always-running host is required to meet refresh targets.

## Verification

From `backend`, run deterministic scheduler tests and build:

```powershell
npx jest --runInBand src/ingestion/ingestion.scheduler.spec.ts src/ingestion/nws-ingestion.service.spec.ts
npm run build
```

Scheduler tests use fake timers and mocked services; they do not contact DRNA/NWS or write to Supabase. Existing database regression tests in `src/ingestion/ingestion.service.spec.ts` check duplicate prevention and transaction rollback and require a migrated database. Do not point database tests at production.

For live verification, configure the application database, apply migrations, and run `npm run start:dev`. Observe `DRNA refresh complete` at startup and after six hours. Inspect `water_quality_observations.retrieved_at` and `sampled_at` independently; repeated retrieval should preserve sample dates and avoid duplicate sample keys. A fresh database with no NWS mappings will need `npm run map:nws` after beaches have been imported.

`npm run ingest` remains a one-shot DRNA command: it creates an application context without calling the server scheduler. Stop the backend or disable DRNA scheduling before running it manually to avoid concurrent refreshes. Source-health history and seven-day execution metrics are tracked separately in #40.
