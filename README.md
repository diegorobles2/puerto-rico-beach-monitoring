# Puerto Rico Beach Monitoring App

A beach-centered decision-support platform that combines official safety data and local reports while showing exactly where the information came from and how current it is.

This repository contains the initial application scaffold and PostgreSQL schema. Authentication, community-report submission, and live external-source integrations are intentionally not implemented.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React-Leaflet, Vitest, React Testing Library
- Backend: NestJS, TypeScript, REST, Swagger/OpenAPI, Jest, Supertest
- Database: Supabase PostgreSQL, Knex
- CI: GitHub Actions

## Repository structure

```text
.
|-- frontend/           React client
|-- backend/            NestJS REST API
|-- docs/
|   |-- architecture/
|   |-- diagrams/
|   `-- testing/
`-- .github/workflows/  Frontend and backend CI
```

## Prerequisites

- Node.js 20 or later
- npm 10 or later

## Install dependencies

From a fresh clone, install each application independently:

```bash
cd backend
npm install
cd ../frontend
npm install
```

Copy each example environment file before running locally:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

On PowerShell, use `Copy-Item` instead of `cp` if needed.

Set `DATABASE_URL` in `backend/.env`, then apply and verify the schema:

```bash
cd backend
npm run db:migrate
npm run db:verify
```

See `docs/architecture/database.md` for the database workflow and security notes.

## Run the backend

```bash
cd backend
npm run start:dev
```

The API defaults to `http://localhost:3000`. Swagger documentation is available at `http://localhost:3000/api/docs`.

## Run the frontend

```bash
cd frontend
npm run dev
```

Vite prints the local development URL, normally `http://localhost:5173`.

## Verify the projects

Run these commands inside both `frontend` and `backend`:

```bash
npm run build
npm test
```

## Current limitations

- The initial database schema is present; ingestion and repository persistence are not implemented yet.
- NWS and DRNA integrations are placeholders and make no external requests.
- Authentication and community-report submission are not implemented.
- Values in `.env` must be set for the local environment; never commit real secrets.
