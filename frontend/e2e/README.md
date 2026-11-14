# Playwright discovery regression suite (Issue #42, Stage 2)

From `frontend`:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd test
npx.cmd playwright test --list
npm.cmd run test:e2e
```

On Linux, browser installation needs `playwright install --with-deps chromium`.
Run only discovery with `npx.cmd playwright test discovery.e2e.ts`; run an individual
case with `npx.cmd playwright test discovery.e2e.ts --grep "O1 map loading"`
(replace the grep text with the desired test title from `--list`).

## O1 coverage

- Map loading: the real Leaflet container, all 35 markers and catalog options,
  discovery controls, and clicking a marker to select a beach and open its popup.
- Search/filter: exact expected options and marker counts for a beach search,
  municipality subset, combined filters, no matches, and clearing back to 35.
- Geolocation: a granted Chromium permission and fixed Puerto Rico coordinate at
  Beach 35 put that beach first with zero distance; clearing location restores
  catalog order. A separate isolated context denies permission and verifies that
  search, selection, map, and conditions still work.
- Details: selecting Beach 02 updates its name, municipality, coordinates, water
  measurement/status, ocean risk/summary, and active alert. Its responses differ
  from Beach 01 to detect conditions left over from the previous selection.
- Sources: category-scoped accessible DRNA report and NWS forecast/alert links
  have the expected href, new-tab target, and noreferrer relationship. Links are
  inspected without navigating to external sites.
- Unavailable category: the per-test `unavailableOceanRisk` option makes only
  ocean risk unknown/unavailable; water quality and the active alert stay visible,
  and discovery remains usable. No current low/high risk is shown for that category.

The original smoke test remains unchanged and verifies default map/condition cards.
Geolocation's granted and denied paths are separate tests, making seven discovery
cases plus one smoke case. Each case can run independently.

## Determinism and isolation

Playwright builds with `VITE_API_URL=/api` before starting Vite preview on
`127.0.0.1:4173`. It refuses to reuse an existing server or stale build. No backend,
database, credentials, DRNA, NWS, or external network access is needed. API responses
and map tiles are fulfilled locally; unexpected requests, including localhost:3000,
are blocked and fail the test. Only local application assets pass through routing.

The existing 35 synthetic names, municipalities, IDs, and coordinates are preserved.
Beach 02 has distinct typed condition payloads and a synthetic active alert. Source
hrefs use official DRNA/NWS domains (the alert ID is synthetic); these tests verify
frontend rendering of API-provided URLs, not that external documents exist or are
current. No source URL is fetched.

Browser time is fixed to `2026-11-13T12:00:00Z` without stopping timers. Chromium
uses en-US and UTC. Fresh browser contexts isolate permissions and fixture options.
The granted case uses Playwright geolocation and permission APIs, never the host's
location. The denied case grants an empty permission allowlist and checks Chromium's denied permission
state before requesting location. The fallback option is test-local, with no shared
mutable route state. No arbitrary timeout delays are used.

## Limits and artifacts

The 35 catalog entries are synthetic and prove browser rendering only. Independently
verifying at least 35 official DRNA locations remains outside this suite and has
not been demonstrated here. These cases do not establish the accuracy of live
conditions, external source availability, other browser behavior, or ingestion.
No production UI changes were needed. Complete stale-data and failed-refresh
regressions belong to Stage 3; GitHub Actions integration belongs to Stage 4.

Vitest retains its existing `.test`/`.spec` discovery; Playwright uses `.e2e.ts`.
Failure artifacts are under `test-results/` and the HTML report under
`playwright-report/` (both ignored within frontend). Use
`npx.cmd playwright show-report` to inspect the latest report.
