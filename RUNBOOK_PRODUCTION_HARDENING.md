# GreenLink Production Hardening Runbook

## Scope

This runbook documents the post-hardening runtime contract and operational checks introduced in the latest SaaS hardening pass.

## Application Structure

- FastAPI entrypoint: `app/main.py`
- Router layer:
  - `app/routers/admin.py`
  - `app/routers/cashbook.py`
  - `app/routers/imports.py`
  - plus existing user/checkin/scoring/tee/profile/public/super admin routers
- Service layer (new/refined):
  - `app/services/bookings_service.py`
  - `app/services/account_customers_service.py`
  - `app/services/cashbook_service.py`
  - `app/services/payment_methods.py`
- Database/ORM:
  - SQLAlchemy models in `app/models.py`
  - DB bootstrap in `app/database.py`
- Frontend admin modular helpers:
  - `frontend/js/utils/*`
  - `frontend/js/api/client.js`
  - `frontend/js/admin/*`

## Auth and Tenancy Model

- Login endpoint: `POST /login` (JWT bearer token).
- Tenant scope is applied through `get_active_club_id` (`app/tenancy.py`) and ORM query scoping (`app/auth.py` session hook).
- Admin users are club-scoped and cannot override to a different club.
- Super admins must supply explicit club context (`club_id` or `X-Club-Id`) on club-scoped routes.

## Startup and Bootstrap Expectations

- Startup health and diagnostics: `GET /health`
- Startup hard-fail state triggers guarded 503 behavior for most routes.
- Bootstrap credentials are now environment-aware:
  - Unsafe default bootstrap passwords are blocked in production-like runtime.
  - Local-like runtime remains backward-compatible for developer bootstrap.

## Metrics and Security Controls

- Metrics route remains: `GET /metrics`
- Protection logic:
  - If `METRICS_TOKEN` is set, `X-Metrics-Token` must match.
  - If `METRICS_TOKEN` is unset:
    - production-like runtime fails closed (`403`) by default.
    - local-like runtime allows unauthenticated access unless explicitly disabled.
- Optional override:
  - `METRICS_ALLOW_UNAUTHENTICATED=1|0`
- Runtime mode helpers:
  - `app/runtime_env.py`
  - `GREENLINK_ENV`
  - `GREENLINK_ASSUME_LOCAL`

## Environment Variables (New Optional Controls)

- `METRICS_ALLOW_UNAUTHENTICATED` (optional, default fail-closed in production-like)
- `GREENLINK_ASSUME_LOCAL` (optional local override)
- `DEMO_SEED_ADMIN_ALLOW_PRODUCTION` (optional gate for production-like demo seed)

Existing env var names remain unchanged.

## Frontend Asset Contract

- `frontend/admin.html` now loads shared modular JS helpers before `frontend/admin.js`.
- Confirmed stale assets removed:
  - `frontend/login.js`
  - `frontend/dashboard.js`
- Asset references were validated against all frontend HTML entry points.

## Verification and Smoke Tests

- Route baseline snapshot: `tests/route_snapshot_baseline.json`
- Contract smoke suite: `tests/test_contract_smoke.py`
  - route snapshot preservation
  - metrics fail-closed behavior in production-like mode
  - auth login smoke
  - admin/super-admin tenancy scope checks
  - bootstrap password guard checks
  - startup diagnostics availability

Run:

```bash
python -m pytest -q --ignore-glob=pytest-cache-files-*
```

## Deployment Notes

- Do not run production with default `SECRET_KEY` or bootstrap defaults.
- Set explicit `GREENLINK_ENV=production` in hosted environments.
- Set `METRICS_TOKEN` in production and keep `METRICS_ALLOW_UNAUTHENTICATED=0`.
- Validate `/health` startup diagnostics after deploy before opening traffic.
