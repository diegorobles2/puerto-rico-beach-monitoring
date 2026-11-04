# Automatic NWS ingestion

The backend server refreshes NWS data immediately after listening and every 30 minutes while the process remains running. Each run reads distinct, non-null forecast zones from `beaches`, then reuses `NwsIngestionService.refreshZones` to refresh conditions and alerts independently. Failures retain last-known records and update source health; partial failures are logged without stopping other sources or zones. A database query failure is logged and retried on the next tick.

Set `NWS_SCHEDULER_ENABLED=false` in `backend/.env` to disable automatic NWS runs. Scheduling is enabled by default. DRNA has an independent six-hour schedule controlled by `DRNA_SCHEDULER_ENABLED`; see [DRNA scheduling](drna-scheduler.md). One-shot application contexts, including `npm run ingest:nws`, do not start either scheduler. Shutdown clears both intervals.

The overlap guard covers scheduler ticks within one backend process. Run one scheduler-enabled backend instance; disable scheduling in other replicas. Manual ingestion is independent of this guard and should not be run alongside an active scheduled refresh. Distributed locking is needed before enabling scheduling on multiple replicas. Sleeping or stopped hosting cannot meet the refresh interval.

## Local verification

Configure `DATABASE_URL`, apply migrations, and run `npm run map:nws` first. From `backend`:

```powershell
npx jest --runInBand src/ingestion/ingestion.scheduler.spec.ts src/ingestion/nws-ingestion.service.spec.ts
npm run build
npm run start:dev
```

Observe the startup `NWS refresh: saved/attempted requests saved` log and another run after 30 minutes. Only successful requests replace stored records. Check `nws_source_health` for per-source/zone outcomes. No mapped zones produces a logged 0/0 run rather than inventing mappings.

For a one-shot refresh, stop the backend or disable its scheduler, then run `npm run ingest:nws`. Automated tests use fake timers and mocked queries/sources, including overlap, partial-failure, and retry cases; they do not contact NWS or write to Supabase.
