# GreenLink

GreenLink is a club-scoped golf operations platform built with a FastAPI backend and a React/Vite frontend.

## Repository layout

- `backend/` FastAPI app, SQLAlchemy models, Alembic migrations, tests, and bootstrap tooling.
- `frontend/` React, TypeScript, Vite, React Router, TanStack Query, and the current admin/player app.
- `docs/` live state, drift log, phase log, engineering standards, and the local development runbook.

## Documentation

- `docs/PRODUCT.md` — canonical product document: what GreenLink is, the two USPs, v1 build list, rebuild plan.
- `docs/LIVE_STATE.md` — current state of the system (canonical, regenerated from code).
- `docs/DRIFT_LOG.md` — record of drifts between docs and code, and their resolutions.
- `docs/PHASE_LOG.md` — record of structured review phases.
- `docs/ENGINEERING_STANDARDS.md` — coding standards.
- `docs/ARCHITECTURE_REVIEW_CHECKLIST.md` — review checklist.
- `docs/runbooks/local-development.md` — local dev runbook.

## Local defaults

- Frontend dev server: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:8000`
- Local frontend API calls use same-origin `/api/*` requests through the Vite dev proxy when the configured backend is loopback, which avoids browser CORS drift between local ports.
- The Vite dev proxy and frontend client both auto-recover between local loopback backend ports `8000`, `8001`, and `8002`, but `8000` remains the canonical backend port for this repo.

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
