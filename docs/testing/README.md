# Testing

Frontend unit tests use Vitest and React Testing Library. Backend unit and HTTP integration tests use Jest and Supertest. k6 verifies API load thresholds; browser-driven Playwright regression is tracked in #42.

- [API load and outage verification](../../tests/load/README.md): k6 workload, synthetic isolated fixtures, thresholds, and deterministic failure regression.
- [DRNA water-quality slice](drna-water-quality-slice.md): test coverage, manual demonstration, and known gaps.
- [DRNA sample freshness](drna-freshness.md): 48-hour sample policy, historical response/UI contract, boundaries, and release limitations.
- [NWS staleness and failure verification](nws-staleness-and-failure.md): source-specific freshness rules, last-known behavior, provenance checks, and repeatable backend regression commands.
- [Automatic NWS ingestion](nws-scheduler.md): scheduler configuration, overlap behavior, and local verification.
- [Automatic DRNA ingestion](drna-scheduler.md): six-hour refreshes, independent configuration, and verification.
- [Local PostgreSQL integration tests](postgres-integration.md): reproduce backend CI with isolated Docker databases, required roles, migrations, and the full test suite.
