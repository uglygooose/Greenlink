# GreenLink

GreenLink is a club-scoped golf operations platform built with a FastAPI backend and a React/Vite frontend.

## Repository layout

- `backend/` FastAPI app, SQLAlchemy models, Alembic migrations, tests, and bootstrap tooling.
- `frontend/` React, TypeScript, Vite, React Router, TanStack Query, and the current admin/player app.
- `docs/` retained system references, contracts, decisions, and local runbooks.

## Current references

- System authority: `docs/MASTER_SYSTEM.md`
- Build plan and progress: `GreenLink-Master-Build-Plan.txt`
- Execution rules: `CODEX-EXECUTION-RULES.txt`
- Current snapshot: `SYSTEM_STATUS.md`
- Local setup and runtime commands: `docs/runbooks/local-development.md`
- Core backend contracts: `docs/contracts/`
- Architectural decision records: `docs/decisions/`

## Local defaults

- Frontend dev server: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8000`
- Local frontend API calls use same-origin `/api/*` requests through the Vite dev proxy when the configured backend is loopback, which avoids browser CORS drift between local ports.
- The frontend client still auto-recovers between loopback backend ports `8000` and `8001` if a direct local call is attempted, but `8000` remains the canonical backend port for this repo.

## Design references

Keep these in-repo for future page work:

- Benchmark UI references: `frontend/src/ui-benchmarks/`
- Design system notes: `frontend/src/design-system/greenlink-design-system.md`

These are the retained visual source-of-truth files when building new pages. They are intentionally kept even when older planning docs are removed.

## Local auth seed

Run the deterministic local auth seed from `backend/`:

- `py -3.12 -m uv run python -m app.scripts.seed_users`

Seeded credentials:

- Superadmin: `greenlinkgolfsa@gmail.com` / `Admin123!`
- Admin: `admin@greenlink.test` / `Admin123!`
- Staff: `staff@greenlink.test` / `Admin123!`
- Member: `member@greenlink.test` / `Admin123!`
