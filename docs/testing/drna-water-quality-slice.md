# DRNA water-quality slice: verification

This document records how the Sprint 2 DRNA water-quality slice is verified, from the published DRNA PDF through the beach page.

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

```bash
cd backend; npm test
cd frontend; npm test
```

The database integration test in `backend/src/ingestion/ingestion.service.spec.ts` runs only when `DATABASE_URL` is set. Otherwise it is skipped.

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

   Expected, if the 25 September 2026 publication is still the newest: `"status": "advisory"`, `"enterococcusValue": 231`, `"observedAt": "2026-09-21"`, `"source": "DRNA"`, and `sourceUrl` pointing at the PDF. If DRNA has published newer results, compare the response with the last RW-22 row of that PDF instead.

3. Start the frontend (`cd frontend && npm run dev`), open <http://localhost:5173>, and choose **Pico de Piedra** from the beach list or the map.

4. In the **Water quality** card, confirm that:
   - the status label reads **Advisory** (as text, not only as color);
   - the source reads **DRNA**, and **Read report** opens the DRNA PDF;
   - **Observed** shows the sample date and **Retrieved** shows when ingestion ran;
   - the **Ocean risk** card is separate and makes no water-quality claim.

5. Stop the backend and reload the page. The card should show **Water quality unavailable** with an error message, not a status.

## Known gaps for the rest of Sprint 2

- **Ingestion is not tested in CI.** The ingestion database test needs `DATABASE_URL`, which CI does not have, so the step from parsed rows to stored rows runs only on developer machines.
- **No browser end-to-end test.** The slice is verified in layers (parser, HTTP, rendered page with a mocked API). Nothing drives a real browser against a running backend yet.
- **Ingestion is manual.** `IngestionScheduler` is still a placeholder, so data is only as recent as the last `npm run ingest`.
- **Failed samples are not shown.** Ingestion keeps the newest row that has a result. If DRNA's latest sample for a beach failed (as for 22 stations on 21 September 2026), the card shows the previous result with its older date and does not mention the failed sample.
- **Ambiguous rows remain possible.** A row that has no result and an integer temperature (for example `Routine 30 8.17`) cannot be told apart from a result with a missing pH. No such row appears in the current PDF.
- **Provenance is incomplete.** `source_published_at` is always null; `sourceUrl` points to the results PDF rather than the notification page; and `observedAt` is a date without a time.
- **Notes can include noise.** Some rows repeat the pH reading (`8.12, 8.12`), and the repeat ends up in the notes. Station names also vary between publications, and the most recent name is used.
- **Fixtures cover one publication.** If DRNA changes its PDF layout, the parser can only detect it at ingestion time: ingestion fails when more than 2% of rows are rejected.
- **Water-quality card follow-ups:**
  - the stale warning triggers after 48 hours, although DRNA samples about once a week;
  - errors and unavailable data share the heading "Water quality unavailable";
  - a failure to load the beach list is shown inside the water-quality card.
