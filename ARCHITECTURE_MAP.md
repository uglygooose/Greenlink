# GreenLink Architecture Map (2026-03-06)

## 1) Product Category and Purpose
- Category: multi-tenant golf club operations platform.
- Core jobs:
  - tee sheet and booking operations
  - player profile + round scoring workflow
  - pricing/fee management
  - daily cashbook export and close/reopen workflow
  - operational/admin dashboards
  - CSV imports for bookings, members, and non-golf revenue streams
  - weather-risk reconfirm messaging for booked players

## 2) Repository Topology
- `Greenlink/`: primary application root.
- `Greenlink/app/`: FastAPI backend, domain logic, data layer.
- `Greenlink/app/routers/`: API route modules.
- `Greenlink/frontend/`: static frontend pages/scripts/styles served by FastAPI.
- `Greenlink/supabase/migrations/`: SQL migrations for Supabase/Postgres.
- `Greenlink/*.sql`: migration/utility SQL scripts.
- `Greenlink/*.py`: setup, seeding, data migration, and utility scripts.
- `Greenlink/sales/`, `Greenlink/sample_csv/`: business assets and sample import data.

## 3) Runtime Architecture
- API framework: FastAPI.
- ORM/data access: SQLAlchemy.
- DB strategy:
  - primary via `DATABASE_URL` (Postgres preferred; normalized to `postgresql+psycopg`).
  - fallback to MySQL.
  - final fallback to SQLite (`greenlink.dev.db`).
- Auth:
  - JWT bearer tokens (`/login`).
  - role-based authorization (`super_admin`, `admin`, `club_staff`, `player`).
- Multi-tenancy:
  - per-request active club resolved via `get_active_club_id`.
  - tenant scoping enforced by SQLAlchemy session hook (`Session.do_orm_execute` + `with_loader_criteria`) for core club-scoped models.
- Frontend delivery:
  - static files mounted at `/frontend`.
  - cache strategy: immutable headers for static assets, no-cache for HTML.

## 4) Backend Module Map
- `app/main.py`
  - app boot, middleware, exception handling, router registration, health endpoint.
  - request ID and response timing headers.
  - security headers (nosniff, frame deny, HSTS on HTTPS, etc.).
- `app/database.py`
  - DB URL normalization and connection fallback orchestration.
  - engine/session setup and health probe.
- `app/models.py`
  - SQLAlchemy models for clubs/users/bookings/rounds/ledger/settings/imports/pro-shop/notifications.
- `app/schemas.py`
  - Pydantic request/response models for auth, users, tee times, bookings, rounds.
- `app/auth.py`
  - password hashing/verifying, JWT creation/decoding, current-user resolver.
- `app/crud.py`
  - core booking/check-in/score submission logic and ledger linkage.
- `app/services/`
  - extracted service-layer business logic for shared router workflows.
  - currently includes booking/account-customer/cashbook/payment-method services used by admin and cashbook routers.
- `app/pricing.py` + `app/fee_models.py`
  - fee catalog model and fee-selection engine.
- `app/tenancy.py`
  - club context resolution and role guards.
- `app/weather_alerts.py`
  - weather provider integration, forecast caching, risk classification, notification payload building.
- `app/club_config.py`
  - per-club branding/label config with in-memory TTL cache.
- `app/tee_profile.py`
  - tee-sheet profile normalization and seasonal schedule planning.
- `app/migrations.py`
  - idempotent auto-migration path for Postgres (`AUTO_MIGRATE`).
- `app/runtime_env.py`
  - environment-mode helpers used by startup security guards (production-like vs local-like behavior).

## 4.1) Frontend Admin Modularity
- `frontend/admin.html` remains the same entrypoint path and now loads modular helper scripts first:
  - `frontend/js/utils/request.js`
  - `frontend/js/utils/state.js`
  - `frontend/js/api/client.js`
  - `frontend/js/admin/*`
- `frontend/admin.js` remains the top-level page controller, with request/state and domain helper delegation extracted to the modules above.

## 5) API Surface Map

### Auth + Health
- `POST /login`
- `GET /health`
- `GET /` (redirect to frontend)

### Users
- `POST /users/` (signup, rate-limited)
- `GET /users/` (super admin)
- `GET /users/me`

### Tee Sheet
- `POST /tsheet/create`
- `POST /tsheet/generate`
- `GET /tsheet/range`
- `GET /tsheet/`
- `POST /tsheet/booking`
- `GET /tsheet/bookings/{tee_id}`
- `PUT /tsheet/bookings/{booking_id}/move`

### Check-in / Scoring
- `POST /checkin/{booking_id}`
- `POST /scoring/submit` (staff)
- `GET /scoring/my-bookings`
- `GET /scoring/my-rounds`
- `POST /scoring/my-rounds/open`
- `PUT /scoring/my-rounds/{round_id}/submit`
- `POST /scoring/my-rounds/{round_id}/no-return`

### Player Profile
- `GET /profile/me`
- `PUT /profile/me`
- `GET /profile/notifications`
- `POST /profile/notifications/{notification_id}/action`
- `GET /profile/fees-available`

### Fee Catalog / Suggestions
- `GET /fees/`, `/fees/golf`, `/fees/cart`, `/fees/push-cart`, `/fees/caddy`
- `GET /fees/code/{code}`
- `GET /fees/{fee_id}`
- `POST /fees/suggest/golf`
- `POST /fees/suggest/cart`
- `POST /fees/suggest/push-cart`
- `POST /fees/suggest/caddy`

### Public Club Config
- `GET /api/public/club`
- `GET /api/public/club/me`

### Settings
- `GET /settings/booking-window`

### Admin (prefix `/api/admin`)
- booking-window settings
- tee-sheet profile settings
- club profile settings
- bulk tee-sheet booking + undo
- weather preview/flags/reconfirm/responses
- dashboard metrics
- KPI targets
- booking list/detail/status/payment/account-code/batch updates/delete
- players/members/guests/member search
- club staff CRUD (club admin scope)
- pro-shop inventory/sales
- revenue/ledger/summary/tee-times
- fee categories + player/booking price management

### Super Admin (prefix `/api/super`)
- club CRUD
- cross-club staff CRUD

### Imports (prefix `/api/admin/imports`)
- revenue import settings (get/save)
- import batch listing
- CSV import endpoints: revenue, members, bookings

### Cashbook (prefix `/cashbook`)
- layout + mapping config
- daily summary
- export excel/csv/preview
- close/reopen/finalize day
- accounting settings

## 6) Data Model Map (Core Entities)
- `clubs` -> root tenant.
- `users` -> auth + role + player profile fields.
- `members` -> club member roster, linkable to users/bookings.
- `tee_times` -> tee slot records with capacity/status.
- `bookings` -> tee bookings with pricing snapshot and optional external IDs.
- `rounds` -> scoring lifecycle, Handicap SA sync metadata.
- `ledger_entries` + `ledger_entry_meta` -> paid booking accounting records + payment method metadata.
- `day_closures` -> daily close/reopen control.
- `accounting_settings` -> per-club accounting defaults.
- `fee_categories` -> fee catalog with optional pricing filters.
- `kpi_targets` -> per-club annual targets by metric.
- `club_settings` -> per-club key/value config (branding/labels/rules).
- `import_batches` + `revenue_transactions` -> import history and external revenue stream records.
- `pro_shop_products`, `pro_shop_sales`, `pro_shop_sale_items` -> inventory + POS.
- `player_notifications` -> in-app prompts and responses (weather reconfirm etc.).

## 7) Key Workflow Chains
- Signup/login:
  - `POST /users/` -> `crud.create_user` -> `POST /login` -> JWT in local storage.
- Player booking:
  - `/tsheet/range` -> choose tee -> `POST /tsheet/booking` -> auto pricing + add-ons -> optional immediate check-in for prepaid.
- Check-in:
  - `POST /checkin/{booking_id}` -> booking status update -> paid ledger upsert -> Handicap SA round open.
- Score submit:
  - `POST /scoring/submit` (staff) or player round endpoints -> close round -> sync to Handicap SA mock -> booking completion.
- Cashbook close:
  - ledger query by date/payment method -> preview/export -> close/finalize day.
- Imports:
  - CSV parse + normalize + dedupe + upsert -> batch metrics recorded.
- Weather reconfirm:
  - forecast fetch + classification + candidate filtering -> notification creation -> player response captured.

## 8) Environment and Deployment
- Required runtime env:
  - DB values (`DATABASE_URL` preferred, or MySQL vars).
  - JWT settings (`SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`).
  - optional strict/fallback controls (`DATABASE_URL_STRICT`, `FORCE_SQLITE`, `PREFER_LOCAL_DB`).
  - optional seeds (`GREENLINK_BOOTSTRAP`, `DEMO_SEED_*`).
- Deployment artifacts:
  - `Dockerfile` (uvicorn startup).
  - `cloudbuild.yaml` (Cloud Run deploy flow).

## 9) Cross-Cutting Controls in Current Code
- gzip middleware.
- CORS policy.
- trusted-host support via env.
- request IDs + response timing headers.
- login/signup in-memory rate limiting.
- password policy enforcement.
- tenant isolation hooks in ORM session.
- static asset caching and HTML no-cache behavior.
- weather forecast in-memory cache.

## 10) Recent Hardening and Optimization Applied
- fee suggestion endpoints now enforce same-club tee-time lookup and normalize holes.
- profile endpoints hardened to player-only access, stricter input normalization, and handicap index validation.
- KPI target upsert now correctly writes/queries per-club targets.
- booking payment ledger creation path deduplicated to centralized `ensure_paid_ledger_entry`.
- public club-profile lookup now supports case-insensitive slug matching + explicit cache headers.
- frontend club-config now has TTL cache + stale-token fallback to public branding endpoint.
- legacy check-in and scoring pages rewritten to remove N+1 API call patterns and improve request/error handling.
