# Local verification — November 3, 2026

Working-tree implementation for issue #41; not a deployed-environment certification. The generated raw reports remain locally in `tests/load/results/` and are ignored by git.

## Environment

- Windows development laptop, Intel Core i5-1235U (12 logical processors), 16 GB RAM.
- Node 23.11.0, k6 2.3.0, PostgreSQL 14.19 in a disposable Docker container using an already-cached image. Backend CI uses PostgreSQL 16; this run does not claim to test that version.
- Compiled NestJS backend on localhost:3041, default database pool, both ingestion schedulers disabled.
- 35 synthetic beaches, 140 observations, five forecast zones, and active/empty alert snapshots. Seeding twice preserved the 35/140 counts. The seed rejected a different database name before connecting.

## Full workload

50 constant virtual users for 10 minutes; each iteration reads all four endpoint types and sleeps one second. Catalog IDs are distributed across users and iterations. The real PostgreSQL-backed API handled 71,676 requests, including preflight requests.

| Endpoint | p95 latency | HTTP error rate |
| --- | ---: | ---: |
| Beaches | 208.04 ms | 0% |
| Water quality | 411.19 ms | 0% |
| Ocean risk | 612.79 ms | 0% |
| Alerts | 696.15 ms | 0% |

All per-endpoint p95 <=1000 ms and HTTP error rate <1% thresholds passed. Invalid-response rate was 0%. k6 exited 0; raw metrics are in `results/acceptance.json`. The one-user/five-second smoke run also passed (`results/smoke.json`).

Deliberate slow responses and HTTP 503 responses from the separate localhost-only threshold fixture each produced k6 exit code 99. The respective reports are `results/slow-threshold.json` and `results/http-threshold.json`; neither is application performance evidence.

## Functional checks

- 74 backend adapter/ingestion/outage HTTP tests passed across 10 suites.
- 20 frontend water-quality/NWS/refresh-state tests passed across three files.
- Backend production build and diff whitespace checks passed.

The source-outage tests inject failures at the fetch boundary and mock persistence/database reads. They are not live-provider or PostgreSQL fault injection tests. DRNA still exposes retained sample dates rather than a failed-retrieval availability flag; its old-sample warning and the separate #40 work are described in the load guide. Browser-driven full-stack regression remains in #42.

Re-run on the intended hosted environment with representative deployment settings before treating these local measurements as production capacity. The temporary backend, database container/volume, and portable k6 download were removed after verification; the pre-existing PostgreSQL image was retained.
