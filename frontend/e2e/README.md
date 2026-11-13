# Playwright foundation (Issue #42, stage 1)

From `frontend`:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

On Linux CI, browser installation needs `playwright install --with-deps chromium`.
CI wiring and the remaining O1/conditions scenarios belong to later stages.

Playwright builds with `VITE_API_URL=/api` before starting Vite preview on
`127.0.0.1:4173`. It refuses to reuse an existing server or stale build. No backend,
database, or credentials are needed. API and map tiles are fulfilled locally;
unexpected requests, including localhost:3000, are blocked and fail the test.
Browser time is fixed without stopping timers. Chromium uses en-US and UTC.

The 35 catalog entries are synthetic and prove browser rendering only. Actual
DRNA-backed location-count verification is separate and remains unverified here.
The smoke test does not establish acceptance of all six O1 scenarios.

Vitest retains its existing `.test`/`.spec` discovery; Playwright uses `.e2e.ts`.
Failure artifacts are under `test-results/` and the HTML report under
`playwright-report/` (both ignored). Use `npx.cmd playwright show-report` to inspect.
