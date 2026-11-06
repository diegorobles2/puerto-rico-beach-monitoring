# Puerto Rico Beach Monitoring

A beach-centered decision-support app that combines DRNA water-quality measurements with NWS rip-current risk and active alerts. The interface keeps water quality separate from ocean risk and shows source, timestamps, stale data, and unavailable states.

## Project status

- DRNA PDF ingestion and PostgreSQL persistence are implemented.
- NWS forecast-zone mapping, reviewed coordinate fallbacks, risk/alert ingestion, and persistence are implemented.
- Public REST endpoints serve water-quality, ocean-risk, and alert information from stored data.
- DRNA and NWS ingestion run automatically while the backend server is running. One-shot commands remain available for setup and manual refreshes.
- Authentication and community-report submission are not implemented.

## Stack and layout

- Frontend: React, TypeScript, Vite, Tailwind CSS, React-Leaflet, Vitest, React Testing Library
- Backend: NestJS, TypeScript, Knex, PostgreSQL, Swagger/OpenAPI, Jest, Supertest
- Database: Supabase PostgreSQL for application development; disposable local PostgreSQL databases for optional integration tests

```text
frontend/                 React app
backend/                  NestJS REST API and ingestion
docs/architecture/        Database and NWS mapping decisions
docs/testing/             Schedulers, API states, CI, and verification
.github/workflows/        Frontend and PostgreSQL-backed backend CI
```

## Prerequisites

- Node.js 20 or later and npm
- A Supabase PostgreSQL project for application data
- Network access to Supabase, DRNA, and api.weather.gov
- Docker with PostgreSQL 16 only if reproducing the optional local database-integration tests

## Install and configure

From the repository root, install both applications:

```bash
cd backend
npm ci
cd ../frontend
npm ci
cd ..
```

For a fresh clone only, create local environment files. Do not overwrite an existing `.env` containing working credentials.

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set these values in `backend/.env`:

```dotenv
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>?sslmode=require
FRONTEND_URL=http://localhost:5173
NWS_SCHEDULER_ENABLED=true
DRNA_SCHEDULER_ENABLED=true
```

Get the PostgreSQL connection URI from the Supabase project's **Connect** dialog. Use the session pooler if your network requires IPv4 and keep SSL enabled. The backend connects to Supabase; the browser does not connect to the database directly. `PORT` is optional and defaults to `3000`.

The frontend's `VITE_API_URL` is optional. It defaults to `http://localhost:3000`; set `VITE_API_URL=http://localhost:3000` in `frontend/.env` when you want to make the API origin explicit.

Never commit `.env` files, database credentials, service-role keys, or other secrets. See [database setup and security](docs/architecture/database.md) for role and migration guidance.

## Initialize the database and source data

Run the following from `backend/` against the configured application database, in order:

```bash
npm run db:migrate
npm run db:verify
npm run ingest
npm run map:nws
npm run ingest:nws
```

This applies Knex migrations, verifies the schema, imports DRNA beaches and observations, maps imported beach coordinates to NWS forecast zones (using reviewed fallbacks only where appropriate), then stores the initial NWS risk, alerts, and source-health results. The DRNA and NWS source commands make external requests. See [NWS fallback review](docs/architecture/nws-fallback-verification.md).

One-shot commands remain available: `npm run ingest` refreshes DRNA, `npm run map:nws` refreshes NWS zone mappings, and `npm run ingest:nws` refreshes NWS records. Do not run manual refreshes concurrently with an active scheduler. Stop the backend first or disable the relevant scheduler flag.

## Run the application

For production images, isolated local Compose startup, health checks, HTTPS and
scheduler configuration, see [deployment setup](docs/deployment.md).

Start the backend in one terminal:

```bash
cd backend
npm run start:dev
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open the URL Vite prints, normally <http://localhost:5173>. The API defaults to <http://localhost:3000>; interactive Swagger docs are at <http://localhost:3000/api/docs>.

When the backend server starts, it runs an initial DRNA refresh and an initial NWS refresh, then schedules DRNA every six hours and NWS every 30 minutes. Set `DRNA_SCHEDULER_ENABLED=false` or `NWS_SCHEDULER_ENABLED=false` in `backend/.env` to disable either schedule. Overlap protection is process-local: run only one scheduler-enabled backend instance. Details and scheduler tests are in [DRNA scheduling](docs/testing/drna-scheduler.md) and [NWS scheduling](docs/testing/nws-scheduler.md).

## REST API

Replace `<beachId>` with an ID returned by `GET /beaches`. Responses below are representative examples; live measurements, alert contents, and timestamps change as sources publish and ingestion runs.

### Water quality

`GET /conditions/<beachId>/water-quality`

```json
{
  "status": "unknown",
  "lastKnownStatus": "advisory",
  "source": "DRNA",
  "sourceUrl": "https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf",
  "observedAt": "2026-09-21",
  "retrievedAt": "2026-10-03T20:44:00.000Z",
  "availability": "stale",
  "enterococcusValue": 231,
  "enterococcusQualifier": null,
  "samplingType": "routine",
  "temperatureCelsius": 29,
  "ph": 8.19
}
```

When no observation is available, the API returns `status: "unknown"`, `availability: "unavailable"`, and null timestamps. The normalized response may include Enterococcus, sampling type, temperature, and pH when the source provides them.

Samples older than 48 hours (or with missing, invalid, or future sample dates) return
`availability: "stale"`, `status: "unknown"`, and the retained `lastKnownStatus`.
Measurements remain historical; a fresh retrieval does not reset the sample age.
This is a conservative application policy, not a DRNA publication schedule or safety
guarantee. See [DRNA sample freshness](docs/testing/drna-freshness.md).

### Ocean risk

`GET /conditions/<beachId>/ocean-risk`

```json
{
  "beachId": 7,
  "zoneId": "PRZ001",
  "status": "moderate",
  "summary": "Moderate rip-current risk.",
  "forecastPeriod": "TODAY",
  "source": "NWS",
  "sourceUrl": "https://api.weather.gov/products/example",
  "observedAt": "2026-10-17T09:15:00.000Z",
  "retrievedAt": "2026-10-17T12:00:00.000Z",
  "availability": "available"
}
```

For stale risk, the API returns `status: "unknown"`, `availability: "stale"`, and a separate `lastKnownStatus`; the historical value must not be interpreted as current. A low risk is not a safety guarantee.

### Alerts

`GET /conditions/<beachId>/alerts`

```json
{
  "beachId": 7,
  "zoneId": "PRZ001",
  "status": "active-alerts",
  "source": "NWS",
  "retrievedAt": "2026-10-17T12:00:00.000Z",
  "availability": "available",
  "alerts": [
    {
      "id": "urn:oid:2.49.0.1.840.0.example",
      "title": "High Surf Advisory",
      "description": "Hazardous surf conditions are expected.",
      "instruction": "Stay out of the water.",
      "severity": "Moderate",
      "certainty": "Likely",
      "urgency": "Expected",
      "effectiveAt": "2026-10-17T10:00:00.000Z",
      "expiresAt": "2026-10-18T22:00:00.000Z",
      "observedAt": "2026-10-17T10:00:00.000Z",
      "retrievedAt": "2026-10-17T12:00:00.000Z",
      "sourceUrl": "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.example"
    }
  ]
}
```

A current successful check with no alerts returns `status: "no-active-alerts"`, `availability: "available"`, and `alerts: []`. A stale check with no retained alerts returns `status: "unknown"`; an unavailable source returns `alerts: null` and `availability: "unavailable"`. Stale or unavailable responses never claim that no alerts exist. See [NWS freshness and failure behavior](docs/testing/nws-staleness-and-failure.md) for the source-specific thresholds.

## Repeatable demo checklist

1. Complete database initialization, then start both applications.
2. Open the frontend, select a beach using the map or selector, and note its ID from `GET /beaches`.
3. Check all three endpoints above. Confirm the DRNA sample date is distinct from its retrieval timestamp, and the NWS responses identify the source and include retrieval/issuance timestamps and source links when available.
4. For current ocean risk, confirm the card displays the API status only when `availability` is `available`. The card must not describe low risk as safe.
5. For a current empty alert check, confirm `alerts: []` is displayed as “No active alerts”; it is not an unavailable-source state.
6. For stale risk or alerts, confirm the API/UI clearly marks the data stale and does not present it as current. For a repeatable demonstration independent of live source timing, run the focused backend and frontend tests below; do not age or modify rows in shared Supabase to manufacture stale data.
7. For unavailable NWS data, confirm an unmapped beach or a beach with no successful stored check returns `availability: "unavailable"` (`alerts: null` for alerts). The UI should say the current condition is unknown, not safe or clear.
8. While refreshing a beach that already has data, verify loading or a request failure does not erase the last-known values; they should remain labeled as historical where appropriate.

Focused state verification:

```bash
cd backend
npx jest --runInBand src/data-sources/nws src/ingestion/nws-ingestion.service.spec.ts src/conditions/nws-conditions.service.spec.ts src/conditions/nws-conditions.http.spec.ts
cd ../frontend
npx vitest run src/components/status/NwsCards.test.tsx src/pages/BeachPage.test.tsx
```

## Tests and CI

Run the application builds and frontend tests locally, from the repository root:

```bash
cd backend
npm ci
npm run build
cd ../frontend
npm ci
npm run build
npm test
```

For the **full backend test suite**, follow [the isolated PostgreSQL test guide](docs/testing/postgres-integration.md) first. It creates disposable databases, supplies their connection URLs, applies migrations, and runs all tests. Do not run an unrestricted backend `npm test` or `npx jest` using the application Supabase configuration: the DRNA ingestion suite loads `backend/.env` and runs database-writing tests whenever `DATABASE_URL` is set. Its test transactions roll back, but they still write and acquire locks. Only the NWS database suites enforce the local host/database-name guards.

The focused state-verification command above selects mocked backend suites and does not run the database integration suites. Backend CI provisions PostgreSQL 16, creates the Supabase-compatible roles and a separate empty migration-test database, applies migrations, then runs the full backend suite. Frontend CI runs its build and tests. No database test should target Supabase or another shared application database.

More details: [testing index](docs/testing/README.md), [DRNA water-quality verification](docs/testing/drna-water-quality-slice.md), and [API architecture](docs/architecture/README.md).
