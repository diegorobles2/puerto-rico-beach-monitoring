# NWS staleness and failure verification

This regression slice verifies the NWS adapter, ingestion, persistence contract, and public REST responses. It does not call the live NWS service in automated tests; adapter tests use deterministic fixtures and injected fetchers.

## Freshness rules

| Data | Current when | Stale behavior |
| --- | --- | --- |
| Rip-current risk | Last successful retrieval is no older than 6 hours, the forecast issuance is no older than 36 hours, and no newer refresh failed. | `status` is `unknown`, `availability` is `stale`, and `lastKnownStatus` carries the stored historical risk. Source URL and observed/retrieved timestamps remain present. |
| Active alerts | Last successful alert check is no older than 1 hour and no newer refresh failed. | `availability` is `stale`; retained unexpired alerts remain visible. With no retained alerts, `status` is `unknown`, not `no-active-alerts`. |

Expired alert records are excluded from the active-alert response. A successful, current empty check returns `alerts: []` and `status: no-active-alerts`; an unqueried source returns `alerts: null` and `availability: unavailable`.

The freshness limits are source-specific constants in `backend/src/conditions/nws-conditions.service.ts`. A missing or unparseable timestamp is treated as stale, never current. A failed refresh updates source health only; it does not save a new condition or alert snapshot, so last-known records remain available with a stale warning.

## Automated verification

Run the focused regression slice:

```bash
cd backend
npm test -- --runInBand src/data-sources/nws src/ingestion/nws-ingestion.service.spec.ts src/conditions/nws-conditions.service.spec.ts src/conditions/nws-conditions.http.spec.ts
```

Run the documented backend regression gate:

```bash
cd backend
npm test -- --runInBand
npm run build
```

Coverage includes current and stale risk, missing timestamps, the exact freshness boundary, current and stale empty alert checks, stale last-known values through HTTP, failed-refresh behavior, expired-alert filtering, timeout, HTTP errors, malformed JSON/payloads, and source URL/timestamp preservation. The HTTP tests exercise Nest controllers with Supertest. The adapter tests use local fixtures and mocked fetchers.

## Database-boundary verification

The persistence integration suite is deliberately restricted to a local database named `beach_monitoring_test`; it is skipped otherwise. Apply the migrations to that isolated test database, then provide its connection string as `NWS_PERSISTENCE_TEST_DATABASE_URL` and run:

```bash
cd backend
NWS_PERSISTENCE_TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/beach_monitoring_test' npm test -- --runInBand src/ingestion/nws-persistence.service.spec.ts
```

Do not point this variable at production or a shared Supabase project. The persistence regression verifies that stored source URLs and observed/retrieved timestamps survive the database boundary, and that older snapshots cannot replace newer ones.