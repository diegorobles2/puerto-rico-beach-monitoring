# Docker deployment rehearsal (#45)

This supplies deployable builds, not a public deployment. Compose uses its own local
PostgreSQL volume, never `backend/.env` or Supabase. Its fixed password is for this
isolated, unexposed database only. The API and frontend bind to host loopback;
do not expose this development stack directly to the internet.

Prerequisites: Docker Desktop/Engine with Compose v2, running Linux containers;
Node 22+ for the host-side smoke command; network access to image/npm registries.
No environment file is required for the local rehearsal. Check disk space first.

## Build, migrate, initialize, start

From the repository root:

```sh
docker compose --profile tools build
docker compose up -d --wait db
docker compose run --rm tools npm run db:migrate
docker compose run --rm tools npm run db:verify
docker compose run --rm tools npm run ingest
docker compose run --rm tools npm run map:nws
docker compose run --rm tools npm run ingest:nws
docker compose up -d --wait backend frontend
node scripts/smoke.mjs http://localhost:8080
```

Source initialization contacts DRNA and NWS and can fail when upstream services are
unavailable. Stop and resolve failed commands; don't interpret an empty catalog as
a successful initialization. Open <http://localhost:8080>. Direct backend Swagger
is <http://localhost:3000/api/docs>. The frontend uses same-origin `/api`, and Nginx
strips that prefix when forwarding requests. API errors do not fall back to SPA HTML.
The frontend proxy is for application endpoints, not the backend Swagger UI.

Migrations are explicit, not run by every API replica. Subsequent starts reuse the
volume. PostgreSQL's init script creates the `anon`/`authenticated` roles referenced
by migrations only on an empty volume. Compose waits for dependency health using
[Docker's documented startup conditions](https://docs.docker.com/compose/how-tos/startup-order/).
`POSTGRES_IMAGE` can select another compatible PostgreSQL image for local testing;
keep the same major version for an existing volume (default: PostgreSQL 16).

```sh
docker compose logs --tail 100 backend frontend
docker compose down
```

`down` preserves data. `docker compose down --volumes` **permanently deletes this
Compose project's local database**; use only when intentionally resetting it.

## Health and smoke checks

- `GET /health/live`: 200 if the API process can respond; no database dependency.
- `GET /health/ready`: 200 after a database round trip, otherwise sanitized 503.
  Pool acquisition/connection attempts are bounded to three seconds and the SQL
  query to two seconds. Readiness checks connectivity, not catalog completeness or
  external DRNA/NWS health. The smoke command checks the migrated application paths.
- Through the frontend these become `/api/health/live` and `/api/health/ready`.
- Smoke requires HTML at `/`, JSON health responses, a nonempty beach catalog and
  all three condition endpoints. Non-2xx, HTML in place of JSON, timeouts, or missing
  condition fields fail with nonzero exit status. Truthful stale/unavailable source
  conditions are accepted; a green smoke check is not proof of current source data.

Self-checks (no database writes):

```sh
node --test scripts/smoke.test.mjs
cd backend
npx jest --runInBand src/health/health.controller.spec.ts
```

## Scheduled refreshes

Both schedulers default to **disabled in Compose** for predictable local startup.
After initialization, set `DRNA_SCHEDULER_ENABLED=true` and
`NWS_SCHEDULER_ENABLED=true` in the shell (PowerShell: `$env:NAME='true'`), then
`docker compose up -d backend` to recreate the server with those settings.
The server immediately refreshes both sources, then DRNA every six hours and NWS
every 30 minutes. Keep one continuously running scheduler-enabled instance;
overlap guards are process-local. Disable scheduling or stop the server before
manual imports. Sleeping/free-tier hosts cannot guarantee this refresh schedule.

## Public deployment handoff

1. Merge the reviewed feature into `dev`, run CI, then release `dev` to `main` using
   a reviewed PR. Branch naming alone does not deploy anything.
2. Build `backend/Dockerfile` target `runtime`, and `frontend/Dockerfile`. The tools
   target contains migration/import tooling; do not run it as the public API.
3. Inject backend `DATABASE_URL`, `PORT`, `FRONTEND_URL` (exact public HTTPS origin),
   and explicit scheduler flags through the host's runtime secret/environment
   settings. Use the existing Supabase connection guidance in the README; do not
   replace shared Supabase with this local Compose database. Use an appropriate
   migration connection/role and run migrations once before routing traffic.
4. For **both hosting layouts**, set frontend runtime `API_UPSTREAM` to a backend
   HTTP(S) origin reachable from the frontend container, without a trailing slash.
   The default `http://backend:3000` works only when that hostname resolves, as in
   Compose. Nginx resolves this upstream at startup even when browser requests use
   a separate API origin; an unresolved hostname prevents the frontend from starting.
   For same-origin hosting, keep the default build-time `VITE_API_URL=/api`.
   For separate frontend/API origins, additionally build with public
   `VITE_API_URL=https://...`; this does not replace runtime `API_UPSTREAM`.
   Changing `VITE_API_URL` requires rebuilding. Configure CORS
   using `FRONTEND_URL`. Never supply database credentials or private keys as Vite
   variables/build arguments: browser bundles are public. Docker contexts exclude
   `.env` files; backend secrets are runtime-only.
5. Terminate HTTPS at the hosting platform's ingress or a TLS reverse proxy with a
   valid certificate and HTTP-to-HTTPS redirect. Forward internally to port 8080
   (frontend) and/or 3000 (API); keep the database and internal API private. This
   repo intentionally does not manage certificates, DNS, or paid hosting.
6. Route readiness probes to `/health/ready`, process liveness to `/health/live`,
   verify initial data and scheduler logs, then run smoke against the public
   same-origin frontend URL. A separate-origin deployment requires equivalent
   checks against its actual API origin and a browser CORS check.

Issue #33 can build the provider-specific operational runbook on this baseline.

## Implementation verification

Issue #45 was checked with Node 22 container builds and a disposable Compose project
using the already-cached PostgreSQL 14 image (not the default PostgreSQL 16): both
production images built, all eight migrations applied, schema verification passed,
and all services became healthy. A synthetic beach in that database passed the
frontend/proxy smoke check, including truthful unavailable condition responses.
The direct API returned the configured CORS origin. With the database stopped,
readiness returned 503, liveness stayed 200, and smoke failed with nonzero status.
No live source ingestion or shared Supabase writes were used for these checks.
