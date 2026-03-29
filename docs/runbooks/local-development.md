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
py -m uv run uvicorn app.main:app --reload
```

GreenLink local/dev is PostgreSQL-first. Alembic and the backend runtime should use the PostgreSQL DSN from `backend/.env`, and SQLite is not a supported runtime or migration target for this rebuild.

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
- Superadmin can authenticate without a selected club and sees active clubs for preview/select behavior.
- Zero-active-membership users can authenticate but bootstrap returns no usable club-scoped shell.
- Refresh tokens are cookie-backed and rotated on refresh; logout revokes the current session.

## Phase 1 includes

- Auth foundation
- Refresh-token rotation
- Session bootstrap contract
- Tenancy and selected-club resolution
- Platform bootstrap and club onboarding primitives
- Thin admin/player shell scaffold
- Tests, docs, and local infra scaffold

## Phase 1 does not include

- Tee sheet
- Finance
- POS
- Communications
- Imports
- Dashboard domain logic
- Benchmark UI implementation
- Any Phase 2 product modules
