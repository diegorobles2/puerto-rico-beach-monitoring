# API load and outage verification (O3 / issue #41)

See [the recorded local verification](local-verification.md) for measured results and environment limitations.

The k6 workload performs the real PostgreSQL-backed reads for the beach catalog and water-quality, ocean-risk, and alerts endpoints. No provider is contacted during measured requests. Defaults are 50 constant virtual users for 10 minutes, each cycling through four reads and pausing one second. This measures concurrent read users, not a fixed requests-per-second target.

Each endpoint must have p95 latency <=1000 ms and HTTP failure rate <1%. Invalid normalized responses have a separate <1% threshold. A threshold failure makes k6 exit nonzero. `BASE_URL` and `TEST_ENV=local` or `staging` are mandatory; there is no default target. Select only an authorized isolated environment. Never inject faults or run a load test against the shared Supabase application database.

## Isolated data and server

Use an isolated local PostgreSQL database named `beach_monitoring_load_test`. Reuse the Docker instructions in [the PostgreSQL test guide](../../docs/testing/postgres-integration.md), changing the main database name to `beach_monitoring_load_test`. Create the same `anon` and `authenticated` roles. The separate migration-test database is unnecessary for this load run. If an appropriate PostgreSQL image is already installed, reuse it rather than downloading another version; record its version with results.

In a dedicated PowerShell terminal, from `backend` (replace the port if needed):

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:55432/beach_monitoring_load_test'
$env:NWS_SCHEDULER_ENABLED='false'
$env:DRNA_SCHEDULER_ENABLED='false'
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migrations failed' }
npm run seed:load
if ($LASTEXITCODE -ne 0) { throw 'Load fixture seeding failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm run start
```

The seed refuses remote hosts, other database names, and databases containing non-load-test beaches. It upserts 35 **synthetic** beaches, four observations per beach, five mapped zones with forecasts, and active/empty alert snapshots in a transaction. These fixtures represent query paths and small-catalog cardinalities, not official geographic/source correctness. Re-seeding on the same day is idempotent; seeding on later days adds historical dates. It does not call DRNA/NWS. No schema changes are needed. Never enable provider schedulers on this synthetic database.

## Run k6

Install the standalone [Grafana k6 CLI](https://grafana.com/docs/k6/latest/set-up/install-k6/) separately; it is not an npm dependency. In another PowerShell terminal, from `backend`:

```powershell
$env:BASE_URL='http://localhost:3000'
$env:TEST_ENV='local'
# Optional: comma-separated IDs returned by this target's GET /beaches.
# Without BEACH_IDS, all catalog IDs are exercised.
npm run test:load
if ($LASTEXITCODE -ne 0) { throw 'Load test failed; inspect its summary' }
```

`VUS` and `DURATION` override defaults for a smoke test (for example `VUS=1`, `DURATION=5s`); remove them for the acceptance run. `BEACH_IDS` selects target-specific IDs, never assumed identity sequence values. Setup requires >=35 catalog records and populated water/risk/alert reads for the first selected beach, preventing a benchmark of an empty database.

The summary is written to `tests/load/results/summary.json` (ignored by git) when run from `backend`. `SUMMARY_PATH` overrides it; create its parent directory before running. It contains target/environment, user count, duration, per-endpoint metrics and threshold results. Preserve that file alongside the git SHA, PostgreSQL/k6/Node versions, host hardware, database location, and scheduler settings. Smoke results are not the 50-user/10-minute acceptance evidence. Failed setup may abort before a summary is available. Do not use `--no-thresholds` or override thresholds in an acceptance run.

The first run against an environment should be a short smoke run. For acceptance, keep the machine awake and run only one load generator. Afterwards stop the backend, remove only the disposable container and its database volume using the test guide, and close the terminals so their test environment variables are discarded. Do not delete shared databases or prune unrelated Docker storage.

## Check that failed thresholds fail the command

The small Node fixture intentionally violates thresholds. It is not a performance target or evidence of application speed. From the repository root, run `node tests/load/threshold-fixture.cjs` in one terminal. It binds only localhost:3042 and delays responses beyond one second. In a second terminal from `backend`, set `BASE_URL=http://localhost:3042`, `TEST_ENV=local`, `VUS=1`, `DURATION=2s`, and `SUMMARY_PATH=../tests/load/results/slow-threshold.json`, then run `npm run test:load`. A nonzero exit is expected (verified with k6 exit code 99); inspect latency thresholds in the JSON summary.

Stop the fixture with Ctrl+C. Restart it with `FAULT_MODE=http` in its environment and rerun k6 with `SUMMARY_PATH=../tests/load/results/http-threshold.json`. Setup succeeds, then responses become HTTP 503; error-rate and invalid-response thresholds must fail. Stop the fixture afterwards. These checks are short and never use the application database. Remove the smoke overrides and restore the real isolated `BASE_URL` before a full acceptance run.

## Deterministic outage regression

From `backend`, select these suites explicitly; no database connection or external network is used:

```powershell
npx jest --runInBand src/conditions/source-outages.http.spec.ts src/data-sources/drna src/data-sources/nws src/ingestion/ingestion.failure.spec.ts src/ingestion/nws-ingestion.service.spec.ts src/conditions/nws-conditions.http.spec.ts
```

`source-outages.http.spec.ts` wires real adapters, ingestion orchestration, and read services/controllers, with injected failed fetchers and an in-memory database/persistence boundary. Timeout, 404, 503, invalid content, and malformed payloads must not overwrite previous data; public reads still return 200. Failed NWS refreshes return stale/unknown risk and alerts, with historical provenance. DRNA retains the sample and retrieval timestamps; old samples now return stale/unknown with historical lastKnownStatus under the 48-hour sample policy. DRNA still has no separate failed-retrieval per-beach availability flag. This does not claim real PostgreSQL retention coverage: that is provided by the existing isolated database suites.

From `frontend`, run `npx vitest run src/components/status/WaterQualityCard.test.tsx src/components/status/NwsCards.test.tsx src/pages/BeachPage.test.tsx` for old-sample, unknown/stale/unavailable, and refresh-failure UI coverage. Real browser automation is tracked in #42. No production fault toggle is introduced. DRNA source-health/freshness improvements remain separate work; these tests preserve and expose its current limitations rather than treating a retained sample as newly collected.

References: [k6 thresholds](https://grafana.com/docs/k6/latest/using-k6/thresholds/) and [JSON summaries](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/).
