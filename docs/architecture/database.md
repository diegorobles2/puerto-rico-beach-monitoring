# Database setup

Supabase hosts the project's PostgreSQL database. The NestJS backend connects through Knex; the React frontend does not connect to Supabase directly.

## Local configuration

Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to the connection URI from the Supabase **Connect** dialog. Use the session pooler for development when the machine requires IPv4. Keep `sslmode=require` in the URI.

Never commit `backend/.env`, database passwords, connection strings, secret keys, or service-role keys.

## Install and migrate

```bash
cd backend
npm install
npm run db:migrate
npm run db:verify
```

Rollback the most recent migration with:

```bash
npm run db:rollback
```

## Team workflow

- Knex migration files in `backend/src/database/migrations` are the schema source of truth.
- Create and test schema changes on a feature branch.
- Do not make untracked schema changes in the Supabase Table Editor or SQL Editor.
- Only one teammate should apply newly merged migrations to the shared project at a time.
- The initial public tables have RLS enabled and grant no Data API access to `anon` or `authenticated`.
- Use a restricted application database role before production deployment; the project-owner connection is for development and migrations only.
