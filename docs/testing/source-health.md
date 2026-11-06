# Source-health API

`GET /health/sources` returns HTTP 200 with independent `nws` and `drna` objects:

```json
{
  "nws": {
    "lastAttemptAt": "2026-11-05T11:50:00.000Z",
    "lastAttemptSucceeded": false,
    "lastSuccessAt": "2026-11-05T11:30:00.000Z",
    "state": "failed",
    "executionFreshness": "current",
    "lastPublishedAt": "2026-11-05T09:00:00.000Z",
    "publicationFreshness": "current"
  },
  "drna": {
    "lastAttemptAt": null,
    "lastAttemptSucceeded": null,
    "lastSuccessAt": null,
    "state": "no-history",
    "executionFreshness": "unknown",
    "lastPublishedAt": null,
    "publicationFreshness": "unknown"
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
inferred from the legacy `state` alone.

Two independent fields remove that ambiguity:

- `executionFreshness` uses the **latest attempt**, whether successful or failed:
  `current` through one hour for NWS/twelve hours for DRNA, `overdue` beyond that,
  and `unknown` with no recorded attempts. A recent failure is not a missed execution;
  an old failure without any success can still be overdue.
- `publicationFreshness` describes NWS surf-forecast issuance, not alert status.
  The scheduler stores the oldest forecast issuance across all requested zones in
  `published_at` after a successful run. Every zone must supply a valid issuance.
  `lastPublishedAt` comes from the latest successful run; it is `current` through
  the existing 36-hour ocean-risk issuance threshold, `stale` beyond it, or
  `unknown` for missing/invalid/future timestamps. Old history is not backfilled.
  A recently retrieved but old forecast can have `state: succeeded`,
  `executionFreshness: current`, and `publicationFreshness: stale` simultaneously.
  DRNA publication freshness remains explicitly unknown: sample dates are not
  publication dates, and the ingestion pipeline does not retain a verified publication
  timestamp or freshness policy. The per-beach endpoints remain authoritative for
  individual forecasts/alerts/measurements.

Empty NWS zone sets record unsuccessful scheduled runs. Seven-day missing-slot
accounting and its continuous-operation assumptions are documented in
[the exporter guide](../../backend/scripts/README.md).

Database query failures return a sanitized HTTP 503 with message
`Source health is unavailable`. A source failure/stale/no-history state itself
still returns HTTP 200. `/health/live` and `/health/ready` retain their existing
contracts. The source-health route does not run ingestion or query upstream services.

`source-health.http.spec.ts` boots the actual `AppModule` with its database provider
overridden by deterministic in-memory query fixtures. It covers module registration,
both source histories, stale boundaries, failures, missing history, zone exclusions,
and existing health endpoint compatibility without PostgreSQL or Supabase access.
The service, exporter, and CLI tests remain separate focused checks.
