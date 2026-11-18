# Security checks — issue #46

Use Node 22.13 or newer in the Node 22 line (CI and the backend Docker image use
Node 22). Node 24+ is also allowed by the package manifests. The development PC's
old Node 23 release is outside the supported Vitest engines.

## Local checks

Run in **both** `frontend/` and `backend/`:

```sh
npm ci
npm run lint
npm run audit:security
npm run build
npm test
```

For a serial backend test run, use `npm test -- --runInBand`. For browser
regressions, run `npm run test:e2e` in `frontend/` after installing Playwright's
matching Chromium browser. These browser tests use synthetic data, not live
DRNA/NWS responses.

Both application workflows now run lint and dependency auditing before their
existing build/test checks. `npm run audit:security` runs
[`scripts/audit-gate.mjs`](../../scripts/audit-gate.mjs), which runs `npm audit --json`
over **all** installed dependencies, including development tools. Any high or
critical advisory fails the job, as do registry/connectivity errors, unless that
exact advisory is listed in [`security/audit-allowlist.json`](../../security/audit-allowlist.json)
for the package it names. Moderate findings are counted in the output but do not
block. This is a point-in-time advisory check, not a guarantee that every
vulnerability is known.

### High/critical allowlist

Use the allowlist only for an advisory that has no compatible fix and does not
reach production code. Each entry needs a GHSA `id`, the vulnerable `package`, a
`reason` explaining the exposure, and a `revisitBy` date (`YYYY-MM-DD`):

- After `revisitBy`, the gate fails until someone re-checks the advisory and either
  removes the entry or sets a new date with an updated reason.
- An entry covers only its advisory on its named package; a new high advisory on
  any package still fails.
- Before allowing an entry, the gate checks every affected dependency path,
  including transitive dependents, against the current application's lockfile.
  Every path must explicitly have `dev: true`. Production/shared dependencies,
  linked dependencies, missing paths, and unsupported/missing lockfiles block
  the exception. A package moving into production cannot silently keep its waiver.
- The npm command explicitly includes development dependencies even if local
  npm configuration normally omits them. Only subprocess exit codes 0 and 1 are
  valid; errors, signals, other exits, malformed JSON, unsupported report
  versions, inconsistent counts, and unresolved advisory references fail closed.
  Dependency cycles are resolved without dropping their underlying advisories.
- The output prints every allowed advisory with its reason, and a notice when an
  entry no longer matches anything so it can be removed.
- `node --test scripts/audit-gate.test.mjs` covers these rules and runs in
  Frontend CI. Production-only exposure can be confirmed with
  `npm audit --omit=dev --audit-level=high`.

The gate has 18 offline regression tests, including CLI-level subprocess failure
and production-exposure cases. Tests also inspect both committed lockfiles to
confirm their picomatch copies remain development-only. The exposure checks do
not establish safety for arbitrary untrusted glob patterns; the temporary
exception still relies on the documented trusted build/test configuration.

| Advisory | Exposure and rationale | Revisit when |
| --- | --- | --- |
| [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), picomatch ReDoS through repeated extglobs (high) | Widened on November 17, 2026 to every release through 4.0.7, the latest; no patched version exists. Reached only through development tools: Vite, Vitest, Tailwind and typescript-eslint in the frontend; Jest, Nest CLI and ts-loader in the backend. They match glob patterns written in our own configuration, never user input. `npm audit --omit=dev` reports zero findings in both apps on November 18, 2026, and the frontend bundle and backend runtime image omit dev dependencies. | A patched picomatch is released (run `npm audit fix` in both apps and remove the entry), untrusted patterns are introduced, or the December 15, 2026 revisit date arrives. |

## Dependency remediation and remaining findings

The November 16, 2026 initial audit reported eight frontend findings (including
two critical) and 26 backend findings (including one critical).

- Updated Vite and migrated Vitest 2 to the patched Vitest 4 line. Frontend audit
  after installation: **zero findings**.
- Updated Nest 10/Swagger 8/CLI 10 together to patched Nest 11/Swagger 11/CLI 11
  releases, keeping their peer dependencies aligned. Nest 11 uses Express 5;
  HTTP tests verify routing, validation, errors, and CORS under the new adapter.
- Backend audit after installation: **three moderate entries**, no high or
  critical findings. These are the `@nestjs/cli` aggregate entry, its `glob`
  dependency, and `minimatch` beneath `glob`—not three independent runtime bugs.

The remaining CLI findings are accepted within this issue's high/critical gate:

| Advisory | Exposure and rationale | Revisit when |
| --- | --- | --- |
| [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), glob traversal continuing after abort | Development CLI only. Build/start scripts operate on the trusted local checkout; public API requests do not supply CLI glob patterns or abort signals. The runtime Docker stage omits dev dependencies. | CLI receives a compatible patched dependency, untrusted patterns are introduced, or severity increases. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), minimatch amplification | Same development-only CLI tree and trusted-pattern boundary. No major-version override is forced into the CLI's dependency graph. | A compatible fix is available, untrusted patterns are introduced, or severity increases. |

These are residual findings, not claims of zero backend vulnerabilities. Review
the full audit output on every dependency change. The lockfiles pin the tested
versions; the manifests permit subsequent compatible updates.

## Local verification — November 16, 2026

Verified on Windows with Node **22.23.5**, using `npx --package=node@22 --call`
to select the supported runtime without replacing the user's Node installation:

| Check | Result |
| --- | --- |
| Frontend `npm run lint` and `npm run build` | Passed |
| Frontend `npm test` | 10 files, **81 tests passed** |
| Frontend `npm run test:e2e` | **20 Chromium tests passed** |
| Backend `npm run lint` and `npm run build` | Passed |
| Backend `node node_modules/jest/bin/jest.js --runInBand` | 25 suites, **261 tests passed**; two suites / **10 database tests skipped** |
| Both `npm run audit:security` commands | Passed the high/critical gate |
| Backend `npm audit --omit=dev --audit-level=high` | **Zero findings** in production dependencies |
| Gitleaks history scan | 55 commits; no leaks detected |

The backend additions comprise 34 HTTP/OpenAPI checks and five parameterized
NWS malformed-payload checks. The database tests were skipped because no
disposable PostgreSQL test service was running locally (Docker's engine was
unavailable). No production database was used. The existing backend CI service
still provisions PostgreSQL and enables those suites; this local result does
not establish that the updated workflow has executed successfully on GitHub.

The three workflow YAML files parse successfully, manifest/lockfile root
dependencies and engines match, and `git diff --check` passes. No hosted load
test, live-source experiment, deployment, or human accessibility test was run
for this change.

## API boundaries

- All three `/conditions/:beachId/*` routes reject noncanonical, nonpositive,
  fractional, or unsafe identifiers with HTTP 400 **before** service
  or database access. Safe integers above the 32-bit range remain valid because
  beach IDs are PostgreSQL bigint values; valid IDs retain HTTP 200/404 behavior.
- Shared HTTP configuration is used by both production bootstrap and security
  tests. CORS permits the configured `FRONTEND_URL` (localhost fallback) and
  advertises only GET/HEAD/OPTIONS. It does not enable credentialed requests.
- CORS controls browser access; an unapproved origin may still receive an HTTP
  200 with a nonmatching allow-origin header. Public reads remain anonymous.
  CORS is not authentication or server-side abuse prevention.
- Removed the Express `X-Powered-By` header.
- NWS JSON parsing rejects null, arrays, and primitive top-level responses with
  explicit errors before consumers access properties. Existing adapter tests
  also cover malformed JSON, required fields, invalid dates, and failed fetches.
- No authentication, report writes, rate limiter, or database changes are added.
  Write authorization belongs to #49/#50; add abuse controls if measured public
  traffic or future write endpoints require them.

## Secret scanning

The separate `Secret scanning` workflow runs on every push and pull request,
with read-only repository permissions and complete checkout history. It installs
Gitleaks 8.30.1 from its official release, verifies the archive against that
release's SHA-256 checksums, and runs:

```sh
gitleaks git --redact --no-banner --log-opts="--all" .
```

Matches fail the workflow; values are redacted. No broad allowlist or baseline is
used. This checks committed history, not local ignored `.env` files or GitHub/
Render secret stores. The initial local history scan covered 55 commits with no
leaks detected. A scanner pass does not prove that credentials were never exposed.

If a real secret is found, revoke/rotate it first, then remediate its history
through a separately reviewed operation. Never paste the detected value into an
issue or CI log. This issue does not rewrite history or rotate credentials.
