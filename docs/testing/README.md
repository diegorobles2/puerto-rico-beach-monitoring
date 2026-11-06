# Testing

Frontend unit tests use Vitest and React Testing Library. Backend unit and HTTP integration tests use Jest and Supertest. Playwright and k6 may be added later.

- [DRNA water-quality slice](drna-water-quality-slice.md): test coverage, manual demonstration, and known gaps.
- [NWS staleness and failure verification](nws-staleness-and-failure.md): source-specific freshness rules, last-known behavior, provenance checks, and repeatable backend regression commands.
- [Automatic NWS ingestion](nws-scheduler.md): scheduler configuration, overlap behavior, and local verification.
- [Automatic DRNA ingestion](drna-scheduler.md): six-hour refreshes, independent configuration, and verification.
- [Local PostgreSQL integration tests](postgres-integration.md): reproduce backend CI with isolated Docker databases, required roles, migrations, and the full test suite.
- [Source-to-API fidelity verifier](../../backend/src/verification/README.md): repeatable DRNA/NWS fixture replay with field-level JSON/CSV results and mismatch threshold checks.
