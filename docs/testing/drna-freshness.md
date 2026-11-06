# DRNA sample freshness (#64)

The water-quality API applies the existing UI's 48-hour sample-age policy server-side.
It is an application cutoff, not an assertion about DRNA's publication frequency or
scientific validity period. A recent sample is not a guarantee that swimming is safe.

## Contract

- No observation: `availability: unavailable`, `status: unknown`; no invented history.
- Sample at most 48 hours old: `availability: available`, with the normalized sample status.
- Sample older than 48 hours: `availability: stale`, `status: unknown`, and
  `lastKnownStatus` containing the retained sample's normalized status.
- Missing, malformed, impossible calendar dates or future dates cannot establish current
  conditions; retained observations are also stale. Invalid/missing dates normalize to null.
- Date-only samples are compared from midnight UTC. PostgreSQL date values retain their
  calendar date before comparison; no collection time is invented. Exactly 48 hours is
  within the policy, and one millisecond beyond is stale.
- Values, qualifiers, source links, and retrieval timestamps remain available for historical
  inspection. Fetching the same PDF again does not make its sample newer.

The card displays Unknown for stale observations and explicitly labels the retained sample
status and measurements as historical. It does not describe historical suitable/advisory
results as current conditions. For mixed frontend/backend releases, the client also checks
the sample date, so an older API's `available` flag cannot override an old/unusable date.
Freshness is evaluated on API requests and UI renders, not by a continuous browser timer.

## Verification

From `backend/` (mocked database; no shared Supabase writes):

```sh
npx jest --runInBand src/conditions/conditions.service.spec.ts src/conditions/conditions.http.spec.ts src/conditions/source-outages.http.spec.ts
npm run build
```

From `frontend/`:

```sh
npm test
npm run build
```

Tests cover recent/old/future/invalid/missing dates, impossible dates, the exact cutoff,
fresh retrieval of old samples, preserved measurements, historical suitable/advisory cards,
legacy API responses, page integration and existing source-failure behavior.

## Release and limitations

No schema migration or observation rewrite is required. Release through `dev` and then
`main`; both API and frontend must deploy before claiming the public fix is verified.
Historical audit documents describe their original snapshots and are not rewritten as
though the fix had existed then.

This fixes sample age, not every DRNA outage case: a failed retrieval of a still-recent
sample is not independently reflected in per-beach availability. Source-health results
remain separate. A scientifically agreed freshness policy and browser acceptance evidence
are still separate validation tasks; this change alone does not complete proposal O2.
