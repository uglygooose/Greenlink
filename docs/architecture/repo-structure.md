# Repo Structure

## Root

- `backend/` API, services, models, migrations, CLI, and tests.
- `frontend/` shell app, route guards, session plumbing, and smoke tests.
- `docs/` architecture, contracts, and decisions.
- `docker-compose.yml` local PostgreSQL and Redis.

## Backend

- `app/api/` HTTP routes only.
- `app/auth/` token and dependency helpers.
- `app/config/` environment-driven settings.
- `app/db/` SQLAlchemy base and session setup.
- `app/models/` foundational entities only, including `ClubModule` and auth-session persistence.
- `app/services/` auth, platform bootstrap, and session bootstrap logic.
- `app/tenancy/` centralized selected-club validation and club resolution.
- `app/events/` event envelope persistence interface.
- `app/observability/` correlation id and logging helpers.
- `alembic/` migration environment and initial foundation migration.

## Frontend

- `src/api/` backend clients for auth and session bootstrap.
- `src/auth/` local token and selected-club storage.
- `src/session/` auth and bootstrap provider.
- `src/routes/` route tree and redirects.
- `src/pages/` placeholder login, select-club, admin, and player shells.
- `src/components/` route-guarding primitives.
- `src/types/` API-aligned contract types.
- `src/test/` frontend smoke tests for the route-guard and shell bootstrap behavior.
