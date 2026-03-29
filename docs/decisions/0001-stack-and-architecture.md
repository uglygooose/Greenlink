# 0001 Stack And Architecture

## Status

Accepted

## Decision

GreenLink uses:

- Python, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL.
- Redis as an integration point for future cache and queue work.
- React, TypeScript, Vite, React Router, and TanStack Query.
- A modular monolith with explicit tenancy and backend-owned session bootstrap.

## Key choices

- Global user type is only `superadmin` or `user`.
- Real club authority lives in `ClubMembership.role`.
- Refresh tokens are stored server-side as hashed `AuthSession` rows and rotated on refresh.
- Platform bootstrap is one-time and permanently locked through persisted `PlatformState`.
- Selected club context is not embedded into access tokens; it is passed explicitly and validated centrally.
- Auth and session datetimes are normalized to UTC-aware values at the shared type/helper layer.
- JWT `sub` remains a string in the token, but is converted to `UUID` at the auth boundary before any ORM query.
