# DRNA water-quality slice: verification

This document records how the Sprint 2 DRNA water-quality slice is verified, from the published DRNA PDF through the beach page.

The parser evidence below is historical. The current API/card contract additionally
applies [sample freshness](drna-freshness.md): samples over 48 hours old have unknown
current status and a separate historical `lastKnownStatus`; retrieval does not reset age.

DRNA PDF ─▶ parseMonitoringRecords ─▶ mapDrnaWaterQuality ─▶ IngestionService ─▶ Supabase
       WaterQualityCard ◀─ BeachPage ◀─ GET /conditions/:beachId/water-quality ◀────┘

## Automated coverage

| Acceptance criterion | Test file | What it checks |
________________________________________________________________________________________

| Parser: normal record | `backend/src/data-sources/drna/drna.fixtures.spec.ts` | RW-22 (advisory, 231) and RW-16 (suitable, 10) from real DRNA PDF text map to the correct status, measurements, and provenance. |
________________________________________________________________________________________

| Parser: irregular or missing data | `backend/src/data-sources/drna/drna.fixtures.spec.ts` | Rows the lab did not analyze map to `unknown`. A missing Enterococcus result is not read from the temperature column. Wrapped beach names, resampling rows without pH, lab notes, and page headers are handled. |
________________________________________________________________________________________

| Parser: notification pages | `backend/src/data-sources/drna/drna.fixtures.spec.ts` | The advisory notification leads to its results PDF. The all-clear notification is rejected because it links to no results. |
________________________________________________________________________________________

| Backend: normalized status and provenance | `backend/src/conditions/conditions.http.spec.ts` | Real HTTP requests (Supertest) return status, source, source URL, observed date, and retrieval time. They also cover `unavailable` → `unknown`, 404 for an unknown beach, and 400 for an invalid identifier. |
________________________________________________________________________________________

| Frontend: status, source, timestamp, unavailable | `frontend/src/pages/BeachPage.test.tsx` | Using a mocked API, the page shows the advisory status, DRNA source and report link, and observed and retrieved times. It also covers the loading, unavailable, and error states, and checks that no ocean-risk wording appears in the water-quality card. |
________________________________________________________________________________________

| Frontend: card states | `frontend/src/components/status/WaterQualityCard.test.tsx` | Current, unavailable, and `>` qualified measurements. |
________________________________________________________________________________________

Supporting tests: `drna.mapper.spec.ts` and `drna.service.spec.ts` (mapping rules and source discovery), `conditions.service.spec.ts` and `conditions.controller.spec.ts` (database row → response).

### Fixtures

`backend/src/data-sources/drna/fixtures/monitoring-results-pdf-text.txt` contains lines copied unchanged from the text that `pdf-parse` extracts from DRNA's 25 September 2026 results PDF. It includes page headers, wrapped names, and the rows from 21 September 2026 that the lab could not analyze. See the fixture `README.md` for sources.

### Full-document check

On 7 October 2026 the complete 25 September 2026 PDF (55 pages) was run through the parser: all **2,602** rows parsed and none were rejected. That check found two defects, both fixed on this branch:

- When a row had no Enterococcus result, the parser read the integer part of the temperature as the result. For example, RW-12B on 21 September 2026 showed `30.9 °C` as **30 colonies, suitable**. Three resampling rows from 13 March 2023 had the same problem.
- The page-1 header lines `R I C O` and `Ambientales` were stored as notes on the preceding row.

All other rows parsed identically before and after the fix.

> **Data cleanup:** if ingestion ran before this fix, the database may still hold an incorrect `suitable` observation for RW-12B (Playa el Combate) dated 2026-09-21. Re-running ingestion does not remove it, because the fixed parser now skips that row. Delete the row manually.

## Running the tests

For the full backend suite, follow [the isolated PostgreSQL integration guide](postgres-integration.md). Do not run unrestricted backend tests with the application's Supabase connection: `ingestion.service.spec.ts` loads `backend/.env` and runs whenever `DATABASE_URL` exists. Unlike the NWS suites, it does not enforce a local database guard. Its transactions roll back, but still perform writes and take locks. Backend CI supplies a disposable PostgreSQL 16 database.

To check the parser, API, and frontend with mocked data instead, run these explicitly selected suites from the repository root:

```bash
cd backend
npx jest --runInBand src/data-sources/drna src/conditions/conditions.service.spec.ts src/conditions/conditions.controller.spec.ts src/conditions/conditions.http.spec.ts
cd ../frontend
npm test
```

## Continuous integration

`.github/workflows/backend-ci.yml` and `frontend-ci.yml` run `npm ci`, `npm run build`, and `npm test` on Node 20. They run for every push and pull request that changes files under `backend/` or `frontend/` (or the workflow file itself). An integration pull request that touches both applications therefore runs both workflows.

## Manual demonstration: Pico de Piedra (RW-22)

Prerequisites: `DATABASE_URL` in `backend/.env`.

1. Load the latest DRNA data:

   ```bash
   cd backend
   npm run db:migrate
   npm run ingest        # prints "Ingestion complete: N beaches, M observations"
   npm run start:dev
   ```

2. Find the beach identifier and check the API response:

   ```bash
   curl http://localhost:3000/beaches                      # note the "id" of "Pico de Piedra"
   curl http://localhost:3000/conditions/<id>/water-quality
   ```

   For the September 21 sample after the 48-hour cutoff, expect `"status": "unknown"`,
   `"lastKnownStatus": "advisory"`, `"availability": "stale"`, `"enterococcusValue": 231`,
   `"observedAt": "2026-09-21"`, `"source": "DRNA"`, and the PDF source URL. If DRNA
   has published newer results, compare the retained measurement with that source and
   evaluate freshness using its sample date instead.

3. Start the frontend (`cd frontend && npm run dev`), open <http://localhost:5173>, and choose **Pico de Piedra** from the beach list or the map.

4. In the **Water quality** card, confirm that:
   - an old sample shows **Unknown** current status and explicitly historical **Advisory**;
   - the source reads **DRNA**, and **Read report** opens the DRNA PDF;
   - **Observed** shows the sample date and **Retrieved** shows when ingestion ran;
   - the **Ocean risk** card is separate and makes no water-quality claim.

5. Stop the backend and reload the page. The card should show **Water quality unavailable** with an error message, not a status.

## Current limitations and related workflows

- DRNA ingestion is scheduled at startup and every six hours while the backend server is running. `npm run ingest` remains available for a one-shot refresh; see [automatic DRNA ingestion](drna-scheduler.md).
- Backend CI runs persistence coverage against an isolated PostgreSQL 16 service. Locally, only the NWS suites enforce host/database-name guards; DRNA integration tests run whenever `DATABASE_URL` is set, including through `.env`. Use the isolated test guide for the full suite.
- Automated source tests use fixtures and do not call the live DRNA service. Frontend tests exercise the rendered page with a mocked API; there is no browser-driven full-stack test in this slice.
- The parser fixtures represent the 25 September 2026 results publication. Add fixtures and review parser behavior when DRNA changes its PDF format.
- **Unsuccessful samples are not displayed.** Ingestion selects the newest row with an Enterococcus result. If a later sample was not analyzed, the card can show an older result without explaining the unsuccessful sample.
- **The water-quality stale warning uses 48 hours.** This is a frontend threshold based on the sample date, not a verified DRNA publication schedule. A six-hour retrieval does not make an old laboratory sample current; the threshold still needs review.
- **Publication provenance is incomplete.** `source_published_at` remains null; the source link points to the results PDF, and `observedAt` contains the sample date without a time.
- **Some PDF rows remain ambiguous.** A row without an Enterococcus result but with an integer temperature can be indistinguishable from a result with a missing pH. Existing fixtures do not establish that every future layout is unambiguous.
- **Names and notes can contain source noise.** Names vary between publications; repeated pH text can remain in notes.
- **Water-quality UI errors are not fully differentiated.** Request errors and missing data share the unavailable heading; a beach-list request failure is displayed in the water-quality card.
- See [NWS staleness and failure verification](nws-staleness-and-failure.md) for ocean-risk and alert freshness behavior, and [the PostgreSQL integration guide](postgres-integration.md) for isolated database tests.
