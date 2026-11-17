# NWS weather forecasts — issue #48

Weather is a **forecast for an NWS grid cell**, not a beach sensor observation,
water-quality assessment, or rip-current forecast. Its card and API are separate
from those categories.

## Authoritative source and coverage

The [official NWS API guide](https://www.weather.gov/documentation/services-web-api)
and [NWS gridpoint documentation](https://github.com/weather-gov/api/blob/master/gridpoints.md)
describe discovering a forecast through `/points/{latitude},{longitude}`. The
backend follows the returned `properties.forecast` URL; it does not construct a
grid from guessed coordinates or reuse the application's surf-zone fallbacks.

Read-only live checks on **November 17, 2026, 00:45 UTC** returned HTTP 200:

| Beach / coordinate | Point mapping | Forecast verification |
| --- | --- | --- |
| El Escambrón, 18.4672361,-66.0899583 | `/gridpoints/SJU/163,132/forecast` | HTTP 200, updateTime `2026-11-16T17:43:18+00:00`; first period Tonight, 81°F, wind 6–9 mph E, precipitation probability 30%. |
| Pico de Piedra, 18.3843639,-67.2129889 | `/gridpoints/SJU/69,124/forecast` | HTTP 200, same updateTime; first period Tonight, 76°F, wind 9 mph ENE, precipitation probability 20%. |

An inland control at 18.25,-66.5 also returned a point mapping to SJU/129,113.
These checks establish availability at those locations and capture times only,
**not all 35 beaches' coverage or continuous NWS availability**. Source responses
change over time. The checked-in weather JSON is a labeled synthetic schema
fixture, not a saved live forecast or experimental accuracy result.

Only HTTPS `api.weather.gov/gridpoints/SJU/<x>,<y>/forecast` links are followed.
Other hosts, paths, and offices are rejected. A point 404 or absent forecast link
means unsupported coverage. Other HTTP errors, timeouts, invalid JSON, malformed
periods, and invalid units degrade explicitly. Coordinates are not moved inland
to obtain a result. Grid-cell resolution is not precise beach-local measurement.

## Endpoint and contract

`GET /conditions/<beachId>/weather`

- HTTP 400 for an invalid/nonpositive/unsafe integer ID; HTTP 404 for a missing
  beach. The beach lookup uses the existing PostgreSQL catalog and coordinates.
- HTTP 200 with `availability: available | stale | unavailable` for source-state
  responses; database failures can still produce HTTP 500.
- `forecast` contains the active period's name, valid-from/until timestamps,
  temperature and C/F unit, verbatim wind speed/direction, precipitation
  probability (0–100 or null), and short/detailed forecast text.
- `observedAt` carries NWS **updateTime / issuance**, not a sensor observation or
  API generation time. `retrievedAt` is when this backend retrieved the forecast.
  `sourceUrl` is the verified forecast endpoint.
- `unavailableReason` distinguishes `unsupported-location`, `no-forecast`, and
  `upstream-error`. An unavailable response has no invented forecast values.
- A stale response retains the last good forecast and its original timestamps.
  Those values are historical and cannot establish current conditions.

The normalizer selects a period whose start is at/before retrieval and whose end
is after retrieval. Empty or wholly expired/future periods produce no active
forecast; malformed periods fail validation. Missing precipitation probability
stays null rather than becoming 0%. Wind units are preserved, not guessed or
converted. Period temperatures are forecast values (for example, a nighttime
low), not a measured current air temperature.

## Caching, refresh, and freshness policy

- Weather uses a **process-local, per-beach cache**. Concurrent requests share an
  in-flight fetch; changed coordinates invalidate the previous entry. Missing
  beach IDs do not populate the cache.
- A first request discovers the point mapping and retrieves a forecast. Normal
  cache refresh interval is **30 minutes**. Failed upstream requests have a
  **one-minute retry cooldown**; unsupported/no-forecast results normally retry
  after 30 minutes. This bounds repeated upstream calls from normal UI refreshes.
- Existing NWS scheduler ticks refresh weather only for previously requested
  beaches, using the same provider instance as the API. No extra weather timer or
  cold fetch of every catalog beach is added. `NWS_SCHEDULER_ENABLED=false`
  disables scheduled refresh; on-demand cache refresh still works.
- Weather refresh failures do not block surf/alert or DRNA results. Existing
  persisted source-health success/publication fields continue to describe the
  surf/alert scheduler work; weather failures have warning logs and per-response
  availability, not separate persisted weather execution history.
- Freshness requires retrieval age **at most six hours**, issuance age **at most
  24 hours**, no future timestamps, and an active forecast period. Crossing any
  boundary makes retained values stale, even if the HTTP cache entry remains.
  These are conservative application policies, not a verified NWS publication
  guarantee or safety rule. A new retrieval does not reset issuance freshness.
- No schema migration is required. **Restarting the backend loses its weather
  cache/history.** Restart-proof retention, shared caching across replicas, and
  persisted weather-health metrics would require additional work. After a cold
  restart with NWS unavailable, the API reports unavailable honestly.

The browser fetches only this application API. Loading/failure state and retained
values are keyed by beach ID; aborted/late or mismatched-beach responses cannot
replace the selected beach's weather. A failed HTTP refresh preserves client
history with a warning. If a restarted backend returns no history, the client
also retains its own same-beach forecast as historical. Forecast expiry and age
deadlines trigger a card update even while the page is idle. Data is not silently
presented as current. `Refresh NWS data` reloads cached API responses; it does not
force an upstream fetch outside the backend cache policy.

## Verification

From `backend/`, using supported Node 22:

```sh
npm run lint
npm run build
npm test -- --runInBand
```

Focused coverage:

```sh
npx jest --runInBand src/data-sources/nws/nws-weather.spec.ts src/conditions/weather.http.spec.ts src/ingestion/ingestion.scheduler.spec.ts src/security.http.spec.ts
```

From `frontend/`:

```sh
npm run lint
npm run build
npm test
npm run test:usability
npm run test:e2e
```

Adapter tests cover exact mapping, rejected foreign URLs, unsupported coverage,
HTTP/timeout/JSON failures, malformed fields, units, issuance, and period expiry.
HTTP/cache tests cover coalescing, cache reuse, cooldown/recovery, source-age
boundaries, retained values, coordinate changes, beach isolation, IDs, and
scheduled refresh. Component/request/browser tests cover current, stale,
unavailable, malformed, failed refresh, same-beach retention after a backend
restart, automatic idle expiry, and late-response suppression.

Browser and unit tests use synthetic weather; they are not live-weather accuracy
experiments or human acceptance evidence. No existing hosted/local k6 result
establishes latency for this new endpoint, especially its two-request cold path.
No production database records are changed by this implementation.

Local verification (Windows, Node 22.23.5): both lint checks and production builds
passed; the full backend run passed 303 tests with ten optional PostgreSQL tests
skipped. After adding two cache-age boundary cases, the final focused backend run
passed all 95 tests across four suites. Frontend verification passed 103 tests in
13 files, 11 usability CLI tests, and all 32 Chromium browser tests. PostgreSQL
integration requires its isolated test service/CI; no new GitHub CI run or
deployment is claimed here.
