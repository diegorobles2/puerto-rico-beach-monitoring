# Validated NWS coastal-zone fallbacks (Issue #32)

The automatic-first mapper uses **15 verified station-specific fallbacks**, registry revision `2026-10-27.v2`. The concise geographic evidence is [nws-fallback-verification.csv](nws-fallback-verification.csv), [the methodology note](nws-fallback-verification.md), and `backend/scripts/verify-nws-fallbacks.py`. The review uses the official April 16, 2026 NWS public-zone shapefile and exact DRNA coordinates checked against Supabase in a read-only transaction.

RW-1A is verified as **PRZ002 by polygon containment**. The exact point is inside that polygon; its API-normalized point is outside and returns AMZ712. Its fallback uses `verified-fallback` provenance. A successful automatic NWS land-zone result takes precedence, including for RW-1A. There are no unresolved records in this reviewed set; unknown or future unresolved stations remain ineligible for inferred fallbacks.

## Geographic review history and limits

The initial Phase 1 review verified 14 adjacent stations and held RW-1A unresolved because it treated containment alongside a marine point result as a contradiction. Independent GeoPandas verification showed that the land-zone candidate was consistent; point normalization explains the shoreline discrepancy. The revised review accepts containment and adjacency as separate geographic methods. The compact verification package replaces that initial review's bulky response snapshots and outside-only verification gates.

All 15 assignments, exact coordinates and the nearest/second-nearest results are listed in the CSV. Runtime code reads only the compiled reviewed registry, not the CSV, polygons, Python output, or live nearest-zone calculations. Geographic verification is not an explicit NWS beach-coordinate assignment and does not establish beach-specific forecast or alert coverage. It also does not certify the original DRNA coordinate accuracy. Future coordinate or zone-boundary changes require re-review; the dated shapefile is not a permanent guarantee.

## Selection and operational eligibility

- Attempt the exact-coordinate NWS lookup first for every beach with valid coordinates. A successful PRZ result writes automatic provenance and clears registry provenance and previous mapping errors, replacing an earlier fallback if necessary.
- Only a recognized `NwsMarinePointError` for the requested coordinates may enter fallback selection. Exactly one verified registry record must match the station ID, both exact coordinates and original marine zone, with complete compact evidence metadata. Containment and adjacency are distinguished explicitly. No rounding or proximity tolerance is applied to runtime coordinates.
- HTTP 404, rate limits, server errors, network failures, timeouts, malformed responses and invalid inputs never activate fallbacks. Unknown or unresolved registry entries are rejected.
- An existing automatic mapping for the same coordinates remains preferred if a later point lookup returns a marine zone. An eligible reviewed fallback is selected/reapplied on marine results; an unmatched marine result cannot establish an unreviewed fallback.
- Legacy assignments are retained as historical data after failed lookups, including HTTP 404, malformed responses and unmatched marine results. No coordinate provenance is invented. A successful automatic lookup or eligible marine-based fallback can revalidate that history.
- The shared operational selector accepts only automatic/verified-fallback mappings with valid current coordinates exactly matching both recorded coordinates and method-appropriate registry provenance. Legacy history and stale provenance do not authorize current forecasts, conditions, alerts or ingestion-zone refreshes.
- Public ocean-risk and alert endpoints retain their existing unavailable/unknown, null-zone response shapes for ineligible mappings. Stored readers retain their unmapped shapes. Beach-list and water-quality endpoints do not use NWS zone assignments.

## Database requirements and coordinate invalidation

Install `20261025230000_add_nws_mapping_provenance.ts` and `20261025233000_invalidate_stale_nws_mappings.ts` with the new mapper before enabling mapping jobs.

The provenance migration preserves existing zones as legacy without inventing coordinates. Unmapped records require null provenance; automatic mappings require valid coordinate provenance; verified fallbacks also require a nonblank registry revision. Existing zone-format and zone/error constraints remain enforced. Rollback removes provenance fields without deleting beach records, coordinates or zone assignments.

The invalidation migration installs a PostgreSQL trigger clearing the active zone and all provenance whenever either DRNA coordinate actually changes, including legacy mappings and changes to NULL. Coordinate no-ops preserve mappings. Restoring old coordinates does not restore an invalidated assignment. Pre-existing stale proven mappings are cleared on installation. Rolling back the trigger cannot safely restore invalidated mapping values.

The mapper takes short row locks, releases them before NWS requests, then rereads under a lock. Station/coordinate edits during lookup defer that beach to another run. Writes retain station and coordinate predicates. A later coordinate edit invalidates the saved mapping through the trigger. All proposed mapping fields, including errors, are compared against the freshly locked row; an identical state skips UPDATE while preserving counters. Actual state/provenance/error changes still write.

## Deployment and revalidation sequence

The provenance migration intentionally makes all existing mapped rows `legacy`. For the reviewed catalog, that includes the 20 previously mapped beaches. Their zone values survive, but the new readers return unavailable/unknown NWS ocean-risk and alert responses until successful revalidation. Water-quality responses are unaffected. A preserved legacy row after a failed lookup remains unavailable; `preserved` is not evidence of successful revalidation.

For the initial deployment:

1. Pause DRNA/NWS ingestion and mapping schedules, and drain old application instances/workers. Use a maintenance window so old writers cannot run against the new provenance constraints.
2. Apply pending migrations with `npm run db:migrate` from `backend`, including `20261025230000_add_nws_mapping_provenance.ts` followed by `20261025233000_invalidate_stale_nws_mappings.ts`.
3. Deploy the matching application/CLI build everywhere before restarting jobs. Keep public NWS traffic paused if the temporary unavailable responses are unacceptable.
4. Run `npm run map:nws` in the intended deployment environment to revalidate exact coordinates. Automatic lookup remains first; only eligible marine responses receive reviewed fallbacks. Inspect counters and per-beach provenance; retry failed lookups rather than manually promoting legacy records. The expected 20 automatic/15 fallback split is a review baseline, not a guarantee of live NWS responses.
5. Run `npm run ingest:nws` to refresh conditions and alerts for operational zones. Check per-beach `GET /conditions/:beachId/ocean-risk` and `/alerts`, including previously legacy beaches and RW-1A. Verify operational rows have matching coordinates and method-appropriate registry versions; inspect source freshness and ingestion failures. Mapping success alone does not guarantee available/current source data.
6. Restore traffic and schedules after verification. Document any remaining unavailable beaches and retry/review them without bypassing provenance gates.

Verified fallbacks are operational only when their stored revision exactly equals the deployed `NWS_FALLBACK_REGISTRY_VERSION`. Older, unknown, future or padded revisions remain stored but cannot authorize forecasts, conditions, alerts or zone refreshes. Automatic mappings require null registry provenance and are unaffected by a registry-only release; coordinate changes still invalidate either method through the trigger.

Every future registry revision requires coordinated deployment and another mapping run before its older fallback rows become eligible again, even when an assignment is unchanged. A successful automatic lookup upgrades the row to automatic; a matching reviewed marine response writes the current fallback revision. Temporary lookup failures may retain the old row as history but cannot make it operational. This deliberately favors unavailable data over silently retaining a withdrawn assignment. Avoid mixed registry-version application instances during rollout: old readers would still accept their old revision. Stop/drain them before switching traffic and revalidating mappings; a rollback to an older registry likewise requires revalidation and must not be treated as an automatic restoration of eligibility.

## Counters and verification

`automatic`, `verifiedFallbacks`, `preserved` and `unresolved` are exclusive outcomes and sum to the number of beach IDs considered. A repeated identical mapping still counts its selected outcome. `preserved` includes historical non-operational legacy assignments and is not a usable-mapping count. `lookupFailures` overlaps preserved/unresolved outcomes and excludes recognized marine results. Database failures fail the run instead of being counted as unsupported points.

Backend tests validate the 15 CSV/registry assignments, RW-1A's containment metadata and AMZ712 fallback, automatic precedence, strict eligibility, legacy retention, reader eligibility, coordinate invalidation, no-op writes, errors, counters and independent-connection races. Actual `IngestionService.refresh()` tests verify repeated DRNA upserts, changes affecting only one station, and restoration without automatic mapping restoration.

The nine existing persistence regressions are also part of the final regression. Their disposable fixture mode uses localhost `beach_monitoring_migration_test`, refuses existing application tables and rolls back its schema afterward. Configure `NWS_MIGRATION_TEST_DATABASE_URL` and `NWS_PERSISTENCE_TEST_DATABASE_URL` for the test process to that dedicated local database and run `npm.cmd test -- --runInBand`. Database suites must run serially because they share the disposable schema. No application database URL is needed.

The independent GIS verifier is separate from the backend suite: see the methodology note for the local-shapefile command. No application mapping job or Supabase write is part of verification.
