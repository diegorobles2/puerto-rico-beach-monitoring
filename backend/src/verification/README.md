# Reproducible source-to-API fidelity check

Run from `backend/`:

```bash
npm run verify:fidelity
npm run verify:fidelity -- --format csv --output /tmp/source-api-fidelity.csv
npx jest --runInBand src/verification/verify-source-api-fidelity.spec.ts
```

The versioned manifest `src/verification/fixtures/source-api-fidelity.v1.json` contains manually reviewed expected normalized values, fixture references, source URLs, capture/publication dates, station or forecast-zone identifiers, synthetic in-memory beach IDs, and explicit normalized-to-REST field mappings. It covers ten rows from the captured DRNA results PDF, one captured NWS surf forecast, and one captured NWS alert.

The verifier runs the real DRNA parser and mapper or NWS mappers, constructs representative persistence rows, starts the real NestJS conditions controller with a deterministic in-memory database, and issues HTTP requests through Supertest. It compares expected values in the manifest against both actual normalized objects and actual REST response fields. DRNA identity is checked through the source station ID -> beach-row association and the beach ID used by the endpoint, since the water-quality response intentionally does not expose a station ID. No live source request or Supabase write is made.

The current manifest produces 321 field comparisons across 12 source cases. This counts checked fields, not 321 unique beaches or source records. JSON and CSV include field-level expected/actual values, matches, and source provenance. Both DRNA and NWS use explicit manifest replay clocks; production defaults keep using the real clock. Old DRNA samples must return current status unknown, availability stale, and their original status as historical lastKnownStatus. No stale-data policy is disabled to make the replay pass.

Fixture containment uses platform-native relative paths and rejects absolute/escaping paths on Windows and Linux. Tests also change a raw NWS source fixture while leaving expected values unchanged, and require the real normalizer and HTTP API to report mismatches. The 98% threshold uses unrounded counts; rounding is for display only. This is deterministic fixture verification, not live-source accuracy or PostgreSQL persistence evidence.

DRNA expected API sample dates are explicit ISO literals in each case's `expectedApi.observedAt`, independently transcribed from the captured source dates. Only actual persistence rows use the production date converter. A regression test forces that converter to return the same incorrect date for every sample and requires ten date mismatches and a failing report. Missing or invalid expected dates are configuration errors.

The CLI exits `0` when agreement meets the configured 98% minimum, `1` when it falls below the minimum, and `2` for invalid configuration or execution errors. A deliberate failure can be checked without modifying fixtures:

```bash
npm run verify:fidelity -- --corrupt-case drna-rw22-2026-09-21 --format json --output /tmp/source-api-fidelity-corrupt.json
```

That command deliberately corrupts the selected case's API field values, emits mismatch details and provenance, and exits nonzero because agreement falls below 98%. To test a single API-field mismatch while preserving the default threshold:

```bash
npm run verify:fidelity -- --corrupt-field drna-rw22-2026-09-21:api.status --threshold 100
```

The second command also intentionally exits nonzero. The acceptance tests verify the baseline, deliberate mismatch behavior, below-threshold failure, evidence links, and deterministic repeated runs.

After integrating current `dev`, local Windows / Node 22 verification passed lint,
build, and 315 backend tests; ten optional PostgreSQL tests were skipped. The CLI
returned 321/321 matches (exit 0), and its documented corrupt-case control returned
12 mismatches / 96.2617% agreement (exit 1). A separate test changes raw source
content and detects both normalized and API mismatches. These are fixture replay
results, not live-source or database integration measurements. The repository's
dependency-audit gate remains enabled. This branch now includes the reviewed
dev-only exception for `GHSA-fc5q-39xc-vjpf` from PR #73; the historical audit
failures above predate that integration. Fresh CI must verify the updated branch.
