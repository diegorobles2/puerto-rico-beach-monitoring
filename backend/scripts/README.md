# Seven-day source-health exporter

Run from `backend` using an authorized local or isolated PostgreSQL database:

```powershell
npm.cmd run metrics:export -- --reference 2026-11-03T12:00:00Z
npm.cmd run --silent metrics:export -- --reference 2026-11-03T12:00:00Z --format json > source-health.json
npm.cmd run --silent metrics:export -- --reference 2026-11-03T12:00:00Z --format csv > source-health.csv
```

JSON is the default. Both formats write only the report to stdout; use `--silent`
when redirecting npm output. Errors go to stderr with a nonzero exit code. `--help`
does not connect to the database. No output files are created unless redirected.
Use a UTF-8 redirect or terminal when exporting files.

The existing `knexfile.ts` loads `.env` via dotenv and requires `DATABASE_URL`
(PostgreSQL connection URL for a role allowed to SELECT `public.source_refresh_history`).
Connection/SSL settings are those in that URL and the existing Knex configuration.
Do not use the team's shared Supabase database for exporter development/verification.
The exporter performs a SELECT only; it starts no Nest application or scheduler and
runs no migrations.

The reference defaults to the current instant captured once at invocation. Supply
an ISO timestamp with an explicit `Z` or numeric timezone offset for repeatability.
The report normalizes timestamps to UTC and covers exactly the preceding 168 hours:
`windowStart <= started_at < windowEnd`. Attempts belong to the window by start
time, regardless of finish time. Latest timestamps refer only to this window.
Repeated exports assume the underlying persisted history has not changed.

Only `source_key = scheduled-run` rows for `drna` and `nws` count, in that order.
NWS `conditions` and `alerts` zone retrieval rows are excluded to prevent counting
both a scheduled refresh and its requests. Manual zone retrievals are excluded too.
Scheduled NWS success requires at least one request and zero failed requests; no
mapped zones records a failed run rather than a success. DRNA success
means its refresh returned without throwing. These metrics measure recorded execution,
not upstream publication freshness or confirmed source reachability.

Schedule coverage is reported separately from attempt success. Split the full
168-hour window into fixed slots anchored at `windowStart`: 336 half-hour slots
for NWS and 28 six-hour slots for DRNA. `expectedRuns` is that slot count;
`coveredSlots` counts slots with at least one recorded attempt (successful or
failed), `missingRuns = expectedRuns - coveredSlots`, and
`scheduleCoveragePercentage = 100 * coveredSlots / expectedRuns`. Multiple restart
runs in one slot do not compensate for an empty slot elsewhere. A single successful
NWS attempt therefore gives 100% attempt success but only 0.30% schedule coverage.

This is a fixed-window, continuous-operation baseline, not an exact count of missed
timer callbacks: timer drift/restarts can cross slot boundaries. It assumes both
schedulers were intended to be enabled for the whole reporting week. New deployments,
intentional disabling, and sleeping hosts still have uncovered slots; missing rows
cannot distinguish downtime from a failed history write. Collect a full week after
deployment before using this as release evidence. `successPercentage` is the
denominator for recorded attempts only; neither percentage alone proves O2's 95%
reachable-source target, because upstream reachability is not separately classified.

Each row counts as one attempt; `succeeded` determines success/failure counts.
Success percentage is `100 * successes / attempts`, null when there are no attempts.
Average duration uses persisted `duration_ms` from successes and failures alike;
null, missing, negative, or nonfinite durations are excluded from its denominator.
Zero durations are valid. No usable durations gives null. Missing/invalid start
timestamps are excluded (the current schema requires timestamps and durations).
Latest attempt and success use `started_at`, with null for no matching attempt.
Percentages and averages round to two decimal places; JSON keeps numeric types
(so trailing zeros may be omitted), while CSV uses two fixed decimal places.
JSON uses null and CSV empty cells for unavailable values. Field/source ordering
and LF line endings are fixed. CSV fields are controlled identifiers, UTC timestamps,
and numbers, so they require no escaping.
