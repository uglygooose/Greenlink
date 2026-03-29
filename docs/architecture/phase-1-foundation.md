# Phase 1 Foundation

Phase 1 establishes GreenLink's platform foundation only. It intentionally stops before tee-sheet, finance, dashboard, POS, communications, pricing, or any other product domain behavior.

## Outcomes

- FastAPI backend with modular monolith boundaries.
- React and Vite frontend with thin admin and player shells.
- PostgreSQL and Alembic foundation models for clubs, users, memberships, platform state, `ClubModule`, auth sessions, and domain events.
- JWT access token plus rotating refresh-token session foundation.
- Explicit club-context resolution and selection support.
- One-time platform bootstrap lock persisted in the database.
- UTC-aware auth and session datetime handling.
- UUID conversion at the auth boundary before ORM access.

## Guardrails

- Business logic stays in backend services, not in React or route handlers.
- Club scope is resolved centrally through the tenancy service.
- `/api/session/bootstrap` remains the frontend truth source for shell, landing path, available clubs, selected club, module flags, and permission scaffolding.
- `/api/auth/me` is intentionally minimal and does not overlap the bootstrap payload.
- `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, and `/api/auth/me` are the only Phase 1 auth routes.
- Global user types are `superadmin` and `user`; club authority lives in `ClubMembership.role`.
