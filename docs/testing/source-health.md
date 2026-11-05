# Source-health API

`GET /health/sources` returns HTTP 200 with independent `nws` and `drna` objects:

```json
{
  "nws": {
    "lastAttemptAt": "2026-11-05T11:50:00.000Z",
    "lastAttemptSucceeded": false,
    "lastSuccessAt": "2026-11-05T11:30:00.000Z",
    "state": "failed"
  },
  "drna": {
    "lastAttemptAt": null,
    "lastAttemptSucceeded": null,
    "lastSuccessAt": null,
    "state": "no-history"
  }
}
```

The existing `SourceHealthService` reads persisted `source_refresh_history` rows
with `source_key = scheduled-run`. NWS per-zone `conditions`/`alerts` retrievals
do not affect this response. Timestamps are attempt start times normalized to UTC.
Unlike the seven-day CLI exporter, this status query has no reporting-window cutoff.

`no-history` means no recorded scheduled attempt. Otherwise `stale` takes precedence
when the last successful start is more than one hour old for NWS or twelve hours
old for DRNA. Exactly at the threshold is not stale. The remaining states are
`succeeded` and `failed`, according to the latest attempt. A failure with no earlier
success remains `failed`, with a null `lastSuccessAt`. Execution recency does not
establish freshness of upstream publications. Missing persisted attempts cannot be
inferred from the response.

Database query failures return a sanitized HTTP 503 with message
`Source health is unavailable`. A source failure/stale/no-history state itself
still returns HTTP 200. `/health/live` and `/health/ready` retain their existing
contracts. The source-health route does not run ingestion or query upstream services.

`source-health.http.spec.ts` boots the actual `AppModule` with its database provider
overridden by deterministic in-memory query fixtures. It covers module registration,
both source histories, stale boundaries, failures, missing history, zone exclusions,
and existing health endpoint compatibility without PostgreSQL or Supabase access.
The service, exporter, and CLI tests remain separate focused checks.
