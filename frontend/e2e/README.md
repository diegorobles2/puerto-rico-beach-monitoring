# Playwright discovery and conditions suite (Issue #42, Stages 1-4)

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

## Conditions coverage (Stage 3)

Run only conditions with `npx.cmd playwright test conditions.e2e.ts`. The 12
independent browser cases cover:

- Water quality declared stale by the API, and an old sample still marked
  available by the API: both show Unknown and a stale warning, preserve the
  historical advisory, 231 colonies/100 mL, observed/retrieved dates, and DRNA
  report link, without changing current ocean risk or alerts.
- Stale ocean risk: the last-known low risk, old summary, issued/retrieved times,
  and NWS link remain historical; current risk is unknown and the swimming-safety
  caveat stays visible. Water quality and the current no-active-alerts response
  retain their own meanings.
- Unavailable water quality: no measurement or suitable/advisory claim is shown;
  current NWS categories and beach selection remain usable. Stage 2 continues to
  cover unavailable ocean risk with available water quality and an active alert.
- Initial water-quality and ocean-risk HTTP failures: the failed category shows
  an explicit error and no invented last-known reading, while the other categories
  still load normally.
- Unavailable alerts and a stale empty alert list: neither means confirmed absence
  of current alerts; available water quality and ocean risk stay independent.
- Failed ocean-risk refresh: the previous successful forecast, timestamp, and link
  remain, explicitly historical with unknown current risk. Alerts still refresh
  successfully. A subsequent successful retry clears the error and historical
  label and restores the current risk.
- Failed alerts refresh with either an empty list or an active alert: the empty
  list becomes unknown rather than confirmed clear; the active alert retains its
  title, description, timestamp, and source as last-known, not verified as current.
  Ocean risk still refreshes successfully and water quality is unchanged.
- Switching Beach 01 (stale water and ocean risk) to Beach 02 (fresh and distinct)
  and back: warnings, status badges, measurements, summaries, and alert meaning
  follow the selected beach and do not leak between locations.

`conditionOverrides` is an optional map from beach ID and endpoint category to a
complete typed response, leaving the default and Stage 2 fixtures unchanged.
Retained fixture dates are November 10 against the fixed November 13 browser clock.
The water-quality API-declared case deliberately uses recent November 13 dates
with `availability: stale` to isolate the API flag from the age guard; the age-guard
case uses `availability: available` with the old November 10 sample. Stale payloads use unknown
current status plus a separate `lastKnownStatus`.

`failedConditionRequests` is a fresh Set for each test, keyed by e.g.
`1/ocean-risk`. Adding a key makes only that endpoint return a local HTTP 503;
removing it restores its normal response. Refresh tests first await a successful
render, then enable the failure and click the actual Refresh NWS data button.
There are no request-order counters, external calls, or shared mutable failure
state. Assertions await visible results and finished loading states without sleeps.

### Existing behavior and limits

Refresh NWS data reloads ocean risk and alerts only. Those resources retain their
last successful response per beach on an HTTP failure. The suite exercises the
actual UI error paths; it does not simulate or verify backend cache retention.
Water quality has no refresh control and clears its condition on a failed load.
Consequently, a water-quality refresh retaining last-known-good data cannot be
tested through the current UI; no control or retention behavior was added.

Ocean-risk and alert staleness is supplied by the API availability state; these
cards do not independently age an available payload based on its timestamp.
Water quality does have a client-side age guard, covered separately. These tests
do not verify live ingestion, backend freshness calculations, every malformed or
missing timestamp, all exact age boundaries, or transient out-of-order responses
while requests are in flight.

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

## GitHub Actions (Stage 4)

The **Frontend CI** workflow in `.github/workflows/frontend-ci.yml` has two
independent jobs on `ubuntu-latest`, using Node 22 and `npm ci` from `frontend`:

- `build-and-test`: the unchanged production build and Vitest checks.
- `playwright`: installs only Chromium and its Linux dependencies with
  `npx playwright install --with-deps chromium`, then runs the 32-test
  suite once with `npm run test:e2e`. It has a 20-minute job timeout and does not
  depend on the build-and-test job, so browser failures are reported independently.

Both jobs use the existing workflow triggers: `push` and `pull_request` events
whose changed paths match `frontend/**` or `.github/workflows/frontend-ci.yml`.
There is no additional branch filter or manual dispatch trigger. Permissions and
concurrency settings are unchanged. A push and a pull-request event can each
produce a workflow run; each run executes the suite once.

The Playwright configuration builds with `VITE_API_URL=/api` and starts/stops Vite
preview itself. The job does not start another server or separately run the build
or Vitest. Its internal build is required for the isolated browser job. Fixtures,
request blocking, tile responses, browser clock, and geolocation behavior are
unchanged. No backend, PostgreSQL, or live condition/tile services are needed;
installing npm packages, Chromium, and Linux packages still requires network access.

### Inspecting failed CI runs

In GitHub, open **Actions > Frontend CI > the failed run > playwright** and inspect
**Run Playwright tests** for failed test names and assertions. Installation failures
appear in their respective setup steps.

The **Upload Playwright failure artifacts** step uses `actions/upload-artifact@v4`
with `if: failure()`. The run summary's **Artifacts** section contains
`playwright-failure-artifacts`, retained for **7 days**, when files were generated.
It includes the actual configured/default output directories:

- `frontend/playwright-report/`: HTML report and its supporting files.
- `frontend/test-results/`: retained failure traces, failure screenshots, and other
  non-hidden test-result files such as error context, when available.

Upload-action paths are relative to the repository root; the `frontend` default
working directory applies only to shell steps. With both directories present,
the downloaded archive contains `playwright-report/` and `test-results/` at its root.
Extract the artifact and, from `frontend`, use the extracted absolute paths:

```powershell
npx.cmd playwright show-report C:\path\to\extracted\playwright-report
npx.cmd playwright show-trace C:\path\to\extracted\test-results\CASE\trace.zip
```

Open PNG screenshots directly. Keep the complete report directory together.
Artifacts are uploaded only on failure; `if-no-files-found: ignore` avoids an error
if setup failed before artifacts existed. Cancellation or the job timeout may
prevent upload, and hidden files (such as `.last-run.json`) are not included.

### Reproducing a CI failure

Use Node 22 and the committed lockfile. On a supported Linux machine, from
`frontend`, run the same browser-job commands:

```bash
npm ci
npx playwright install --with-deps chromium
CI=true npm run test:e2e
```

The Linux dependency installation may require sudo privileges. For the separate
build-and-test job, run `npm run build` and `npm test`. On Windows, use the local
commands at the top of this document; optionally set `$env:CI = 'true'` before the
Playwright run to match its CI-only focused-test guard. Use the failed test's title
with `npx.cmd playwright test --grep "TITLE"` for a focused reproduction.

Local Windows results do not verify Linux runner setup or artifact uploads. The
first GitHub run must confirm runner installation, workflow execution, and artifact
behavior on an actual failed run. No GitHub Actions success is claimed from local
verification alone.

## Limits and artifacts

The 35 catalog entries are synthetic and prove browser rendering only. Independently
verifying at least 35 official DRNA locations remains outside this suite and has
not been demonstrated here. These cases do not establish the accuracy of live
conditions, external source availability, other browser behavior, or ingestion.
No production UI changes were needed.

Vitest retains its existing `.test`/`.spec` discovery; Playwright uses `.e2e.ts`.
Failure artifacts are under `test-results/` and the HTML report under
`playwright-report/` (both ignored within frontend). Use
`npx.cmd playwright show-report` to inspect the latest report.
