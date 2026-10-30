# Run the backend PostgreSQL tests locally

This reproduces `.github/workflows/backend-ci.yml`: PostgreSQL 16, the Supabase-compatible `anon` and `authenticated` roles, a migrated persistence database, and a separate empty database for migration tests. These are disposable local databases, not the application's Supabase database.

Prerequisites: Docker with Linux containers running, the project's Node/npm prerequisites, and a fresh PowerShell terminal at the repository root. Use this terminal only for tests, then close it so the test environment variables do not affect later application commands. Nothing below requires changing `backend/.env`.

## Start isolated PostgreSQL

Use port 55432 to avoid an existing PostgreSQL server on port 5432. The database guards allow this port; they require localhost and the exact database names below. The container name must not already exist: if it does, inspect it or choose another name consistently rather than deleting an unknown container.

```powershell
docker run --detach --name capstone-postgres-ci-test --publish 127.0.0.1:55432:5432 --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=beach_monitoring_test --health-cmd "pg_isready -U postgres -d beach_monitoring_test" --health-interval 5s --health-timeout 5s --health-retries 10 postgres:16
if ($LASTEXITCODE -ne 0) { throw 'Could not start the test database container' }

$testDbHealthy = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  $testDbStatus = docker inspect --format '{{.State.Health.Status}}' capstone-postgres-ci-test
  if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the test database container' }
  if ($testDbStatus -eq 'healthy') { $testDbHealthy = $true; break }
  if ($testDbStatus -eq 'unhealthy') { break }
  Start-Sleep -Seconds 1
}
if (-not $testDbHealthy) { throw 'Test PostgreSQL did not become healthy; inspect docker logs capstone-postgres-ci-test' }
```

Create roles once in this fresh cluster, then create the migration-test database. Roles belong to the cluster, so both databases share them. `ON_ERROR_STOP` prevents SQL errors from being ignored.

```powershell
docker exec capstone-postgres-ci-test psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE anon NOLOGIN;" -c "CREATE ROLE authenticated NOLOGIN;" -c "CREATE DATABASE beach_monitoring_migration_test;"
if ($LASTEXITCODE -ne 0) { throw 'Test database setup failed' }
```

## Migrate, build, and test

```powershell
Set-Location backend
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }

$env:DATABASE_URL='postgresql://postgres:postgres@localhost:55432/beach_monitoring_test'
$env:NWS_PERSISTENCE_TEST_DATABASE_URL=$env:DATABASE_URL
$env:NWS_MIGRATION_TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:55432/beach_monitoring_migration_test'

npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migrations failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
npx jest --runInBand
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
```

Apply application migrations **only** to `beach_monitoring_test`. Leave `beach_monitoring_migration_test` empty: `nws-migration.spec.ts` creates and removes its own tables and rejects an already-migrated database. The suite runs serially, matching CI.

Confirm that `ingestion.service.spec.ts`, `nws-persistence.service.spec.ts`, and `nws-migration.spec.ts` all report `PASS`, with no environment-related skipped suites. Missing or incorrect NWS test URLs deliberately skip guarded suites; a green command with skipped database suites does not reproduce CI. Database assertion failures return a nonzero exit code and fail the CI step. The original PR #55 CI run reported 19 suites and 132 tests passed; totals may grow as tests are added.

## Cleanup

After testing, including a failed setup or test run, remove only the disposable container created above:

```powershell
docker rm --force --volumes capstone-postgres-ci-test
```

This removes the test container and its anonymous database volume, including all test records. To repeat from scratch, run the setup again in a fresh terminal. No shared Supabase data is involved. Do not reuse these example credentials outside this isolated test container.
