# Local Development

## Prerequisites

- Python 3.12+
- `uv`
- Node.js 20+
- Docker Desktop or compatible Docker runtime

## Start local services

From the repo root:

```bash
docker compose up -d
```

This starts PostgreSQL and Redis for normal local development.

## Backend setup

```bash
cd backend
copy .env.example .env
py -m uv sync --extra dev
py -m uv run alembic upgrade head
py -m uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

GreenLink local/dev is PostgreSQL-first. Alembic and the backend runtime should use the PostgreSQL DSN from `backend/.env`, and SQLite is not a supported runtime or migration target for this rebuild.

Default local ports:
- Backend API: `http://127.0.0.1:8000`
- Frontend Vite app: `http://127.0.0.1:5173`
- Frontend local-dev API resolution now auto-recovers between loopback ports `8000` and `8001` if a stale local override is present, but `8000` remains the canonical backend port.

## Backend validation

```bash
cd backend
py -m uv run pytest
py -m uv run ruff check .
py -m uv run ruff format --check .
```

Backend tests also run against PostgreSQL. Keep the local Compose database running, or point `GREENLINK_TEST_DATABASE_URL` at a PostgreSQL test database.

## Frontend setup

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

## Frontend validation

```bash
cd frontend
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
```

## Auth and bootstrap notes

- First platform bootstrap is one-time only and permanently locks after success.
- Non-superadmin users with one active membership auto-select that club.
- Non-superadmin users with multiple active memberships must provide selected club context.
- Superadmin can authenticate without a selected club and resolves to the dedicated `/superadmin/clubs` workspace.
- Once a superadmin selects a club, superadmin actions may hand off into existing club-scoped `/admin/*` workspaces for finance, golf settings, and dashboard preview.
- Zero-active-membership users can authenticate but bootstrap returns no usable club-scoped shell.
- Refresh tokens are cookie-backed and rotated on refresh; logout revokes the current session.

## Current implementation includes

- Auth foundation and refresh-token rotation
- Session bootstrap and tenancy resolution
- Router-owned persistent admin and superadmin shells (all `/admin/*` including POS inside AdminLayout)
- Golf operations backend plus admin tee-sheet lifecycle UI
- Player member booking creation from `/player/book` using the live tee-sheet read model
- People and membership foundations
- Finance accounts, journal, backend summaries with pre-computed pct fields, canonical export batches, and accounting profile mapping
- Orders, order finance posting, settlement recording, and POS terminal (inside AdminLayout)
- Communications CRUD plus player published-post feed
- Superadmin club onboarding with backend-owned progression
- Superadmin overview page (fleet KPIs, readiness bars, needs-attention list)
- Club lifecycle management: pause, reactivate, and delete from superadmin
- Superadmin handoff into real admin workspaces for finance, rules/settings, and dashboard preview

## Current major gaps

- Full tee-sheet booking creation and editing UX
- Player booking history/read model and profile flow
- Full rules/modules onboarding configuration surfaces
- Superadmin invitation/provisioning workflow
- External accounting-system integration or validation
- Reconciliation engine
- Inventory accounting
