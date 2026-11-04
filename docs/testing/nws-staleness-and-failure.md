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
npx jest --runInBand src/data-sources/nws src/ingestion/nws-ingestion.service.spec.ts src/conditions/nws-conditions.service.spec.ts src/conditions/nws-conditions.http.spec.ts
```

For the full backend regression gate, use [the isolated PostgreSQL integration guide](postgres-integration.md), including database setup and environment variables, before running the full suite and build. Do not run unrestricted backend tests using the application's Supabase `.env`: the DRNA ingestion suite also runs when `DATABASE_URL` is present and does not enforce the NWS local-database guards. The focused command above runs mocked suites only.

Coverage includes current and stale risk, missing timestamps, the exact freshness boundary, current and stale empty alert checks, stale last-known values through HTTP, failed-refresh behavior, expired-alert filtering, timeout, HTTP errors, malformed JSON/payloads, and source URL/timestamp preservation. The HTTP tests exercise Nest controllers with Supertest. The adapter tests use local fixtures and mocked fetchers.

## Database-boundary verification

The persistence integration suite is deliberately restricted to a local database named `beach_monitoring_test`; a basic local test run skips it unless the guarded URL is configured. Backend CI provisions PostgreSQL 16, sets the test URL, applies migrations, and runs this suite. To run it locally, create an isolated test database, then apply migrations and run the suite with the same connection string:

```bash
cd backend
DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/beach_monitoring_test' npm run db:migrate
NWS_PERSISTENCE_TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/beach_monitoring_test' npx jest --runInBand src/ingestion/nws-persistence.service.spec.ts
```

PowerShell:

```powershell
cd backend
$env:DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/beach_monitoring_test'
npm run db:migrate
$env:NWS_PERSISTENCE_TEST_DATABASE_URL=$env:DATABASE_URL
npx jest --runInBand src/ingestion/nws-persistence.service.spec.ts
```

Do not point this variable at production or a shared Supabase project. The persistence regression verifies that stored source URLs and observed/retrieved timestamps survive the database boundary, and that older snapshots cannot replace newer ones. The full local reproduction, including the separate migration-test database, is documented in [the PostgreSQL integration guide](postgres-integration.md).
