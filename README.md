# GreenLink

GreenLink is a club-scoped golf operations platform rebuilt as a modular monolith with a FastAPI backend and React frontend.

## Repository layout

- `backend/` FastAPI app, SQLAlchemy models, Alembic migrations, tests, and CLI bootstrap tooling.
- `frontend/` React, TypeScript, Vite, React Router, and TanStack Query shell scaffold.
- `docs/` architecture notes, contracts, and decisions for the rebuild.

## Local setup

1. Start local infrastructure:
   - `docker compose up -d`
2. Start the backend:
   - `cd backend`
   - `py -m uv sync --extra dev`
   - `py -m uv run alembic upgrade head`
   - `py -m uv run uvicorn app.main:app --reload`
3. Start the frontend in another terminal:
   - `cd frontend`
   - `npm.cmd install`
   - `npm.cmd run dev`

## Tests and checks

- Backend tests: `cd backend && py -m uv run pytest`
- Backend lint: `cd backend && py -m uv run ruff check .`
- Backend format check: `cd backend && py -m uv run ruff format --check .`
- Frontend tests: `cd frontend && npm.cmd run test`
- Frontend lint: `cd frontend && npm.cmd run lint`
- Frontend typecheck: `cd frontend && npm.cmd run typecheck`

## Phase 1 scope

- Included: auth, refresh-token rotation, session bootstrap, tenancy, club onboarding primitives, docs, tests, and thin admin/player shells.
- Excluded: tee sheet, finance, POS, communications, imports, dashboards, pricing rules, and benchmark UI implementation.
