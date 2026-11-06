# Reproducible source-to-API fidelity check

Run from `backend/`:

```bash
npm run verify:fidelity
npm run verify:fidelity -- --format csv --output /tmp/source-api-fidelity.csv
npx jest --runInBand src/verification/verify-source-api-fidelity.spec.ts
```

The versioned manifest `src/verification/fixtures/source-api-fidelity.v1.json` contains manually reviewed expected normalized values, fixture references, source URLs, capture/publication dates, station or forecast-zone identifiers, synthetic in-memory beach IDs, and explicit normalized-to-REST field mappings. It covers ten rows from the captured DRNA results PDF, one captured NWS surf forecast, and one captured NWS alert.

The verifier runs the real DRNA parser and mapper or NWS mappers, constructs representative persistence rows, starts the real NestJS conditions controller with a deterministic in-memory database, and issues HTTP requests through Supertest. It compares expected values in the manifest against both actual normalized objects and actual REST response fields. DRNA identity is checked through the source station ID -> beach-row association and the beach ID used by the endpoint, since the water-quality response intentionally does not expose a station ID. No live source request or Supabase write is made.

The current manifest produces 311 field comparisons across 12 source cases. This is a count of checked fields, not 311 unique beaches or source records. JSON output includes each comparison's expected and actual value, match result, and source provenance. CSV includes the same field-level evidence and a summary row. Output order, replay timestamps, and values are fixed by the manifest, so repeated runs against the same code and fixtures are byte-for-byte reproducible.

The CLI exits `0` when agreement meets the configured 98% minimum, `1` when it falls below the minimum, and `2` for invalid configuration or execution errors. A deliberate failure can be checked without modifying fixtures:

```bash
npm run verify:fidelity -- --corrupt-case drna-rw22-2026-09-21 --format json --output /tmp/source-api-fidelity-corrupt.json
```

That command deliberately corrupts the selected case's API field values, emits mismatch details and provenance, and exits nonzero because agreement falls below 98%. To test a single API-field mismatch while preserving the default threshold:

```bash
npm run verify:fidelity -- --corrupt-field drna-rw22-2026-09-21:api.status --threshold 100
```

The second command also intentionally exits nonzero. The acceptance tests verify the baseline, deliberate mismatch behavior, below-threshold failure, evidence links, and deterministic repeated runs.