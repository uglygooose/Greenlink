# GreenLink — Live State

Last regenerated: 2026-05-11 from commit `1151ea7`.
Source of truth: code in this repo. If this file disagrees with code, code wins.

## How this file is maintained

This file is regenerated, not edited. To update it, re-run the Phase 1 regeneration procedure (read endpoints, routes, models, and migrations from source and rewrite the file). Drifts between this file and code are recorded in `DRIFT_LOG.md`. Phase history is recorded in `PHASE_LOG.md`.

## Stack

- Frontend: React 18 (`frontend/package.json:17-18`), Vite 5 (`frontend/package.json:38`), TypeScript 5 (`frontend/package.json:36`), `react-router-dom` 6 (`frontend/package.json:19`), `@tanstack/react-query` 5 (`frontend/package.json:15`), Vitest 2 (`frontend/package.json:39`). Entry `frontend/src/main.tsx`; routes `frontend/src/routes/router.tsx`.
- Backend: FastAPI (`backend/pyproject.toml:8`), SQLAlchemy 2 (`backend/pyproject.toml:16`), Alembic (`backend/pyproject.toml:7`), pydantic / pydantic-settings (`backend/pyproject.toml:11-12`), Python `>=3.12` (`backend/pyproject.toml:5`). Entry `backend/app/main.py`; router aggregation `backend/app/api/router.py`.
- Database: PostgreSQL, required by validator at `backend/app/config/settings.py:46-51`. Connection string read from `GREENLINK_DATABASE_URL` (env prefix `GREENLINK_`, `backend/app/config/settings.py:15-19,26`); default literal in `backend/app/config/settings.py:11`; Alembic-side URL hardcoded in `backend/alembic.ini:6`.
- Dev infra: `docker-compose.yml` defines two services — `postgres` (`postgres:16-alpine`, `docker-compose.yml:2-17`) and `redis` (`redis:7-alpine`, `docker-compose.yml:19-28`). No app container.

## Routes (frontend)

All routes defined in `frontend/src/routes/router.tsx`. ProtectedRoute wraps each shell; layouts wrap the protected children.

### Public

- `/` → `RootRedirect` (`frontend/src/routes/router.tsx:35-45`) — redirects to bootstrap `landing_path` or `/login`.
- `/login` → `frontend/src/pages/login-page.tsx`.
- `/accept-invitation` → `frontend/src/pages/invitation-accept-page.tsx` — reads `?token=…` query param.
- `/select-club` → `frontend/src/pages/select-club-page.tsx` — club picker.
- `/admin/select-club` → redirect to `/select-club` (`frontend/src/routes/router.tsx:51`).

### Superadmin (wrapped by `SuperadminLayout`, `frontend/src/routes/superadmin-layout.tsx`)

- `/superadmin/overview` → `frontend/src/pages/superadmin-overview-page.tsx`.
- `/superadmin/clubs` → `frontend/src/pages/superadmin-clubs-page.tsx`.
- `/superadmin/accounting-profiles` → `frontend/src/pages/superadmin-accounting-profiles-page.tsx`.
- `/superadmin/*` → redirect to `/superadmin/overview` (`frontend/src/routes/router.tsx:100`).

### Admin (wrapped by `AdminLayout`, `frontend/src/routes/admin-layout.tsx`)

- `/admin/dashboard` → `frontend/src/pages/admin-dashboard-page.tsx` — Today workspace.
- `/admin/golf/dashboard` → `frontend/src/pages/admin-golf-dashboard-page.tsx`.
- `/admin/golf/tee-sheet` → `frontend/src/pages/admin-golf-tee-sheet-page.tsx`.
- `/admin/golf/settings` → `frontend/src/pages/admin-golf-settings-page.tsx` (4-line wrapper re-exporting `admin-golf-settings-guided-page.tsx`).
- `/admin/orders` → `frontend/src/pages/admin-order-queue-page.tsx`.
- `/admin/people/dashboard` → `frontend/src/pages/admin-people-dashboard-page.tsx`.
- `/admin/members` → `frontend/src/pages/admin-members-page.tsx`.
- `/admin/targets` → `frontend/src/pages/admin-targets-page.tsx` (real route, see `admin-targets-redirect.test.tsx:14-30`).
- `/admin/finance/dashboard` → `frontend/src/pages/admin-finance-dashboard-page.tsx`.
- `/admin/finance` → `frontend/src/pages/admin-finance-page.tsx` (4-line wrapper re-exporting `admin-finance-close-day-page.tsx`).
- `/admin/communications` → `frontend/src/pages/admin-communications-page.tsx`.
- `/admin/halfway` → `frontend/src/pages/admin-halfway-page.tsx`.
- `/admin/pro-shop` → `frontend/src/pages/admin-pro-shop-page.tsx`.
- `/admin/reports` → `frontend/src/pages/admin-reports-page.tsx`.
- `/admin/pos-terminal` → `frontend/src/pages/admin-pos-terminal-page.tsx`.
- `/admin/settings` → `frontend/src/pages/admin-settings-hub-page.tsx`.
- `/admin/settings/club` → redirect to `/admin/settings` (`frontend/src/routes/router.tsx:80`).
- `/admin/settings/profile` → redirect to `/admin/settings` (`frontend/src/routes/router.tsx:81`).
- `/admin/settings/modules` → `frontend/src/pages/admin-settings-modules-page.tsx`.
- `/admin/*` → redirect to `/admin/dashboard` (`frontend/src/routes/router.tsx:85`).

### Player

- `/player/home` → `frontend/src/pages/player-shell-page.tsx`.
- `/player/book` → `frontend/src/pages/player-book-page.tsx`.
- `/player/order` → `frontend/src/pages/player-order-page.tsx`.
- `/player/profile` → `frontend/src/pages/player-profile-page.tsx`.
- `/player/*` → redirect to `/player/home` (`frontend/src/routes/router.tsx:111`).

## API endpoints (backend)

Prefixes set in `backend/app/api/router.py`. Endpoints listed with absolute path (prefix + relative path), handler function, and source location.

### Health (`backend/app/api/routes/health.py`)

- `GET /health` — `health` (`backend/app/api/routes/health.py:14-15`)

### Auth — `/api/auth` (`backend/app/api/routes/auth.py`)

- `POST /api/auth/login` — `login` (`backend/app/api/routes/auth.py:27-28`)
- `POST /api/auth/refresh` — `refresh` (`backend/app/api/routes/auth.py:39-40`)
- `POST /api/auth/invitations/accept` — `accept_invitation` (`backend/app/api/routes/auth.py:51-52`)
- `POST /api/auth/invitations/activate` — `activate_invitation` (`backend/app/api/routes/auth.py:63-64`)
- `POST /api/auth/logout` — `logout` (`backend/app/api/routes/auth.py:73-74`)
- `GET /api/auth/me` — `me` (`backend/app/api/routes/auth.py:86-87`)

### Session — `/api/session` (`backend/app/api/routes/session.py`)

- `GET /api/session/bootstrap` — `bootstrap` (`backend/app/api/routes/session.py:16-17`)

### Platform — `/api/platform` (`backend/app/api/routes/platform.py`)

- `POST /api/platform/bootstrap` — `bootstrap_platform` (`backend/app/api/routes/platform.py:21-26`)
- `POST /api/platform/clubs` — `create_club` (`backend/app/api/routes/platform.py:36-41`)
- `POST /api/platform/memberships` — `assign_membership` (`backend/app/api/routes/platform.py:52-53`)
- `PUT /api/platform/clubs/{club_id}/modules` — `update_modules` (`backend/app/api/routes/platform.py:65-66`)

### Superadmin — `/api/superadmin` (`backend/app/api/routes/superadmin.py`)

- `GET /api/superadmin/clubs` — `list_superadmin_clubs` (`backend/app/api/routes/superadmin.py:42-43`)
- `POST /api/superadmin/clubs` — `create_superadmin_club` (`backend/app/api/routes/superadmin.py:115-116`)
- `PATCH /api/superadmin/clubs/{club_id}/status` — `update_superadmin_club_status` (`backend/app/api/routes/superadmin.py:129-130`)
- `DELETE /api/superadmin/clubs/{club_id}` — `delete_superadmin_club` (`backend/app/api/routes/superadmin.py:145-146`)
- `GET /api/superadmin/clubs/{club_id}/onboarding` — `get_superadmin_club_onboarding` (`backend/app/api/routes/superadmin.py:159-160`)
- `PUT /api/superadmin/clubs/{club_id}/onboarding` — `update_superadmin_club_onboarding` (`backend/app/api/routes/superadmin.py:168-169`)
- `POST /api/superadmin/clubs/{club_id}/onboarding/finance/bind-profile` — `bind_superadmin_club_accounting_profile` (`backend/app/api/routes/superadmin.py:184-188`)
- `GET /api/superadmin/clubs/{club_id}/assignment-candidates` — `list_superadmin_assignment_candidates` (`backend/app/api/routes/superadmin.py:199-203`)
- `POST /api/superadmin/clubs/{club_id}/assignments` — `assign_superadmin_club_user` (`backend/app/api/routes/superadmin.py:215-220`)
- `GET /api/superadmin/clubs/{club_id}/invitations` — `list_superadmin_club_invitations` (`backend/app/api/routes/superadmin.py:235-239`)
- `POST /api/superadmin/clubs/{club_id}/invitations` — `create_superadmin_club_invitation` (`backend/app/api/routes/superadmin.py:247-252`)
- `GET /api/superadmin/accounting-profiles` — `list_superadmin_accounting_profiles` (`backend/app/api/routes/superadmin.py:50-51`)
- `GET /api/superadmin/accounting-profiles/sample-layout` — `get_superadmin_accounting_sample_layout` (`backend/app/api/routes/superadmin.py:59-60`)
- `POST /api/superadmin/accounting-profiles/parse-template` — `parse_superadmin_accounting_template` (`backend/app/api/routes/superadmin.py:68-69`)
- `POST /api/superadmin/accounting-profiles` — `create_superadmin_accounting_profile` (`backend/app/api/routes/superadmin.py:80-85`)
- `PATCH /api/superadmin/accounting-profiles/{profile_id}/active` — `update_superadmin_accounting_profile_active` (`backend/app/api/routes/superadmin.py:102-103`)

### People — `/api/people` (`backend/app/api/routes/people.py`)

- `GET /api/people` — `list_people` (`backend/app/api/routes/people.py:84-85`)
- `POST /api/people` — `create_person` (`backend/app/api/routes/people.py:116-117`)
- `GET /api/people/club-directory` — `list_club_people` (`backend/app/api/routes/people.py:101-102`)
- `POST /api/people/memberships` — `create_or_update_membership` (`backend/app/api/routes/people.py:137-142`)
- `PATCH /api/people/memberships/{membership_id}` — `update_membership` (`backend/app/api/routes/people.py:162-163`)
- `POST /api/people/account-customers` — `create_account_customer` (`backend/app/api/routes/people.py:189-194`)
- `POST /api/people/bulk-intake/preview` — `preview_bulk_intake` (`backend/app/api/routes/people.py:214-215`)
- `POST /api/people/bulk-intake/process` — `process_bulk_intake` (`backend/app/api/routes/people.py:228-229`)
- `GET /api/people/me/profile` — `get_self_profile` (`backend/app/api/routes/people.py:248-249`)
- `PATCH /api/people/me/profile` — `update_self_profile` (`backend/app/api/routes/people.py:273-274`)
- `GET /api/people/{person_id}` — `get_person` (`backend/app/api/routes/people.py:306-307`)
- `PATCH /api/people/{person_id}` — `update_person` (`backend/app/api/routes/people.py:326-327`)
- `GET /api/people/{person_id}/memberships` — `list_person_memberships` (`backend/app/api/routes/people.py:354-355`)
- `GET /api/people/{person_id}/integrity` — `evaluate_person_integrity` (`backend/app/api/routes/people.py:374-375`)

### Clubs — `/api/clubs` (`backend/app/api/routes/clubs.py`)

- `GET /api/clubs/config` — `get_club_config` (`backend/app/api/routes/clubs.py:22-23`)
- `PUT /api/clubs/config` — `update_club_config` (`backend/app/api/routes/clubs.py:34-35`)

### Golf — `/api/golf` (`backend/app/api/routes/golf.py`)

- `GET /api/golf/courses` — `list_courses` (`backend/app/api/routes/golf.py:137-138`)
- `POST /api/golf/courses` — `create_course` (`backend/app/api/routes/golf.py:152-153`)
- `GET /api/golf/tees` — `list_tees` (`backend/app/api/routes/golf.py:175-176`)
- `POST /api/golf/tees` — `create_tee` (`backend/app/api/routes/golf.py:198-199`)
- `GET /api/golf/settings/readiness` — `get_golf_settings_readiness` (`backend/app/api/routes/golf.py:226-227`)
- `POST /api/golf/settings/rules/publish` — `publish_golf_rules` (`backend/app/api/routes/golf.py:238-239`)
- `POST /api/golf/settings/rules/rollback` — `rollback_golf_rules` (`backend/app/api/routes/golf.py:251-252`)
- `POST /api/golf/settings/pricing/publish` — `publish_golf_pricing` (`backend/app/api/routes/golf.py:263-264`)
- `POST /api/golf/settings/pricing/rollback` — `rollback_golf_pricing` (`backend/app/api/routes/golf.py:276-277`)
- `GET /api/golf/tee-sheet/day` — `get_tee_sheet_day` (`backend/app/api/routes/golf.py:288-289`)
- `GET /api/golf/bookings/player` — `get_player_bookings` (`backend/app/api/routes/golf.py:322-323`)
- `POST /api/golf/bookings` — `create_booking` (`backend/app/api/routes/golf.py:347-348`)
- `PATCH /api/golf/bookings/{booking_id}` — `update_booking` (`backend/app/api/routes/golf.py:365-366`)
- `PATCH /api/golf/bookings/{booking_id}/payment-status` — `update_booking_payment_status` (`backend/app/api/routes/golf.py:380-381`)
- `POST /api/golf/bookings/{booking_id}/post-charge` — `post_booking_charge` (`backend/app/api/routes/golf.py:402-403`)
- `POST /api/golf/bookings/{booking_id}/record-payment` — `record_booking_payment` (`backend/app/api/routes/golf.py:425-426`)
- `POST /api/golf/bookings/{booking_id}/post-refund` — `post_booking_refund` (`backend/app/api/routes/golf.py:445-446`)
- `POST /api/golf/bookings/{booking_id}/move` — `move_booking` (`backend/app/api/routes/golf.py:468-469`); accepts optional `participant_id` for participant-level moves (`backend/app/schemas/bookings.py:353`).
- `POST /api/golf/bookings/{booking_id}/cancel` — `cancel_booking` (`backend/app/api/routes/golf.py:492-493`)
- `POST /api/golf/bookings/{booking_id}/check-in` — `check_in_booking` (`backend/app/api/routes/golf.py:512-513`)
- `POST /api/golf/bookings/{booking_id}/complete` — `complete_booking` (`backend/app/api/routes/golf.py:532-533`)
- `POST /api/golf/bookings/{booking_id}/no-show` — `mark_booking_no_show` (`backend/app/api/routes/golf.py:552-553`)

### Rules — `/api/rules` (`backend/app/api/routes/rules.py`)

- `GET /api/rules` — `list_rule_sets` (`backend/app/api/routes/rules.py:164-165`)
- `POST /api/rules` — `create_rule_set` (`backend/app/api/routes/rules.py:182-183`)
- `PUT /api/rules/{rule_set_id}` — `update_rule_set` (`backend/app/api/routes/rules.py:219-220`)
- `GET /api/rules/evaluate` — `evaluate_rules` (`backend/app/api/routes/rules.py:46-47`)
- `GET /api/rules/availability-preview` — `preview_availability` (`backend/app/api/routes/rules.py:87-88`)
- `POST /api/rules/slot-preview` — `preview_slot` (`backend/app/api/routes/rules.py:129-130`)

### Pricing — `/api/pricing` (`backend/app/api/routes/pricing.py`)

- `GET /api/pricing` — `list_pricing_matrices` (`backend/app/api/routes/pricing.py:32-33`)
- `POST /api/pricing` — `create_pricing_matrix` (`backend/app/api/routes/pricing.py:50-51`)
- `PUT /api/pricing/{matrix_id}` — `update_pricing_matrix` (`backend/app/api/routes/pricing.py:80-81`)

### Targets — `/api/targets` (`backend/app/api/routes/targets.py`)

- `GET /api/targets/metrics` — `list_target_metrics` (`backend/app/api/routes/targets.py:27-28`)
- `GET /api/targets` — `list_targets` (`backend/app/api/routes/targets.py:38-39`)
- `POST /api/targets` — `create_target` (`backend/app/api/routes/targets.py:50-51`)
- `PATCH /api/targets/{target_id}` — `update_target` (`backend/app/api/routes/targets.py:63-64`)
- `POST /api/targets/{target_id}/archive` — `archive_target` (`backend/app/api/routes/targets.py:81-82`)

### Admin dashboard — `/api/admin/dashboard` (`backend/app/api/routes/admin_dashboard.py`)

- `GET /api/admin/dashboard/summary` — `get_dashboard_summary` (`backend/app/api/routes/admin_dashboard.py:21-22`)

### Halfway — `/api/admin/halfway` (`backend/app/api/routes/halfway.py`)

- `GET /api/admin/halfway/summary` — `get_halfway_summary` (`backend/app/api/routes/halfway.py:21-22`)

### Reports — `/api/admin/reports` (`backend/app/api/routes/reports.py`)

- `GET /api/admin/reports/summary` — `get_reports_summary` (`backend/app/api/routes/reports.py:21-22`)

### Finance — `/api/finance` (`backend/app/api/finance/routes.py`)

- `POST /api/finance/transactions` — `create_finance_transaction` (`backend/app/api/finance/routes.py:50-51`)
- `GET /api/finance/accounts` — `list_finance_accounts` (`backend/app/api/finance/routes.py:64-65`)
- `GET /api/finance/accounts/{account_id}/ledger` — `get_account_ledger` (`backend/app/api/finance/routes.py:151-152`)
- `GET /api/finance/journal` — `get_club_journal` (`backend/app/api/finance/routes.py:77-78`)
- `GET /api/finance/summaries/revenue` — `get_finance_revenue_summary` (`backend/app/api/finance/routes.py:90-91`)
- `GET /api/finance/summaries/outstanding` — `get_finance_outstanding_summary` (`backend/app/api/finance/routes.py:107-108`)
- `GET /api/finance/summaries/transaction-volume` — `get_finance_transaction_volume_summary` (`backend/app/api/finance/routes.py:120-121`)
- `GET /api/finance/exceptions` — `get_finance_exceptions` (`backend/app/api/finance/routes.py:137-138`)
- `POST /api/finance/export-batches` — `create_finance_export_batch` (`backend/app/api/finance/routes.py:165-166`)
- `GET /api/finance/export-batches` — `list_finance_export_batches` (`backend/app/api/finance/routes.py:185-186`)
- `GET /api/finance/export-batches/{batch_id}` — `get_finance_export_batch` (`backend/app/api/finance/routes.py:198-199`)
- `GET /api/finance/export-batches/{batch_id}/reconciliation` — `get_finance_export_batch_reconciliation` (`backend/app/api/finance/routes.py:212-213`)
- `GET /api/finance/export-batches/{batch_id}/download` — `download_finance_export_batch` (`backend/app/api/finance/routes.py:226-227`)
- `POST /api/finance/export-batches/{batch_id}/void` — `void_finance_export_batch` (`backend/app/api/finance/routes.py:367-368`)
- `POST /api/finance/export-batches/{batch_id}/regenerate` — `regenerate_finance_export_batch` (`backend/app/api/finance/routes.py:381-382`)
- `GET /api/finance/export-batches/{batch_id}/mapped-export` — `get_mapped_finance_export_preview` (`backend/app/api/finance/routes.py:297-298`)
- `GET /api/finance/export-batches/{batch_id}/mapped-export/download` — `download_mapped_finance_export` (`backend/app/api/finance/routes.py:316-317`)
- `POST /api/finance/export-batches/{batch_id}/mapped-export/export` — `export_mapped_finance_batch` (`backend/app/api/finance/routes.py:340-341`)
- `GET /api/finance/accounting-profiles` — `list_accounting_export_profiles` (`backend/app/api/finance/routes.py:245-246`)
- `POST /api/finance/accounting-profiles` — `create_accounting_export_profile` (`backend/app/api/finance/routes.py:258-259`)
- `PUT /api/finance/accounting-profiles/{profile_id}` — `update_accounting_export_profile` (`backend/app/api/finance/routes.py:278-279`)

### Orders — `/api/orders` (`backend/app/api/orders/routes.py`)

- `GET /api/orders/menu` — `get_order_menu` (`backend/app/api/orders/routes.py:74-75`)
- `POST /api/orders` — `create_order` (`backend/app/api/orders/routes.py:87-88`)
- `GET /api/orders` — `list_orders` (`backend/app/api/orders/routes.py:114-115`)
- `GET /api/orders/{order_id}` — `get_order` (`backend/app/api/orders/routes.py:131-132`)
- `POST /api/orders/{order_id}/preparing` — `mark_order_preparing` (`backend/app/api/orders/routes.py:147-148`)
- `POST /api/orders/{order_id}/ready` — `mark_order_ready` (`backend/app/api/orders/routes.py:164-165`)
- `POST /api/orders/{order_id}/collected` — `mark_order_collected` (`backend/app/api/orders/routes.py:181-182`)
- `POST /api/orders/{order_id}/cancel` — `cancel_order` (`backend/app/api/orders/routes.py:198-199`)
- `POST /api/orders/{order_id}/post-charge` — `post_order_charge` (`backend/app/api/orders/routes.py:215-216`)
- `POST /api/orders/{order_id}/record-payment` — `record_order_payment` (`backend/app/api/orders/routes.py:232-233`)

### POS — `/api/pos` (`backend/app/api/pos/routes.py`)

- `GET /api/pos/products` — `list_products` (`backend/app/api/pos/routes.py:33-34`)
- `POST /api/pos/products` — `create_product` (`backend/app/api/pos/routes.py:50-51`)
- `PATCH /api/pos/products/{product_id}` — `update_product` (`backend/app/api/pos/routes.py:64-65`)
- `POST /api/pos/transactions` — `create_pos_transaction` (`backend/app/api/pos/routes.py:83-84`)

### Comms — `/api/comms` (`backend/app/api/comms/routes.py`)

- `GET /api/comms/feed` — `list_published_news_feed` (`backend/app/api/comms/routes.py:49-50`)
- `GET /api/comms/posts` — `list_news_posts` (`backend/app/api/comms/routes.py:62-63`)
- `POST /api/comms/posts` — `create_news_post` (`backend/app/api/comms/routes.py:76-77`)
- `GET /api/comms/posts/{post_id}` — `get_news_post` (`backend/app/api/comms/routes.py:94-95`)
- `PATCH /api/comms/posts/{post_id}` — `update_news_post` (`backend/app/api/comms/routes.py:108-109`)
- `DELETE /api/comms/posts/{post_id}` — `delete_news_post` (`backend/app/api/comms/routes.py:127-128`)
- `GET /api/comms/blasts` — `list_blasts` (`backend/app/api/comms/routes.py:144-145`)
- `POST /api/comms/blasts` — `create_blast` (`backend/app/api/comms/routes.py:156-157`)
- `POST /api/comms/blasts/{blast_id}/send` — `send_blast` (`backend/app/api/comms/routes.py:173-174`)

## Database

- Migration head: `202605110002` (`backend/alembic/versions/202605110002_fix_pricing_rules_enum_drift.py`).
- Migration count: 24 revision files in `backend/alembic/versions/`. Chain is linear (single head, single root at `202603270001_foundation_scaffold.py` with `down_revision = None`).
- Schema/model parity: Phase 5 closed the `pricing_rules.player_type` and `pricing_rules.season` VARCHAR→enum drift (the original Pattern A finding), the 8 Pattern B model columns missing `values_callable`, the 3 Pattern C Postgres-enum-missing-Python-value gaps, and all Pattern E declaration gaps (1 CHECK, 6 indexes, 3 redundant UNIQUE constraints, 1 Text-vs-String column, 46 server_default mirrors). `alembic --autogenerate` against a fresh-migrated DB produces zero proposed ops as of 2026-05-12.
- Models live in: `backend/app/models/`.
- Tables (from `__tablename__` declarations):
  - `accounting_export_profiles` (`backend/app/models/finance/accounting_export_profile.py:14`)
  - `account_customers` (`backend/app/models/account_customer.py:13`)
  - `auth_sessions` (`backend/app/models/auth_session.py:15`)
  - `booking_participants` (`backend/app/models/booking_participant.py:15`)
  - `booking_rule_sets` (`backend/app/models/booking_rule_set.py:20`)
  - `booking_rules` (`backend/app/models/booking_rule.py:16`)
  - `bookings` (`backend/app/models/booking.py:18`)
  - `clubs` (`backend/app/models/club.py:12`)
  - `club_configs` (`backend/app/models/club_config.py:14`)
  - `club_invitations` (`backend/app/models/club_invitation.py:21`)
  - `club_memberships` (`backend/app/models/club_membership.py:22`)
  - `club_modules` (`backend/app/models/club_module.py:13`)
  - `club_settings` (`backend/app/models/club_setting.py:14`)
  - `club_targets` (`backend/app/models/club_target.py:15`)
  - `communication_blasts` (`backend/app/models/communication_blast.py:16`)
  - `courses` (`backend/app/models/course.py:13`)
  - `domain_event_records` (`backend/app/models/domain_event_record.py:16`)
  - `finance_accounts` (`backend/app/models/finance/account.py:18`)
  - `finance_export_batches` (`backend/app/models/finance/export_batch.py:18`)
  - `finance_tender_records` (`backend/app/models/finance/tender_record.py:18`)
  - `finance_transactions` (`backend/app/models/finance/transaction.py:19`)
  - `news_posts` (`backend/app/models/news_post.py:16`)
  - `orders` (`backend/app/models/order.py:17`)
  - `order_items` (`backend/app/models/order_item.py:16`)
  - `people` (`backend/app/models/person.py:13`)
  - `platform_state` (`backend/app/models/platform_state.py:14`)
  - `pos_transactions` (`backend/app/models/pos_transaction.py:18`)
  - `pos_transaction_items` (`backend/app/models/pos_transaction.py:66`)
  - `pricing_matrices` (`backend/app/models/pricing_matrix.py:13`)
  - `pricing_rules` (`backend/app/models/pricing_rule.py:22`)
  - `products` (`backend/app/models/product.py:16`)
  - `tees` (`backend/app/models/tee.py:14`)
  - `tee_sheet_slot_states` (`backend/app/models/tee_sheet_slot_state.py:17`)
  - `users` (`backend/app/models/user.py:23`)

## Domains (what exists, terse)

### Identity & session

- Backend services: `backend/app/services/auth_service.py` (302 lines), `backend/app/services/session_bootstrap_service.py` (242 lines), `backend/app/services/platform_service.py` (241 lines), `backend/app/services/people_service.py` (494 lines), `backend/app/services/people_integrity_service.py` (273 lines), `backend/app/services/bulk_intake_service.py` (376 lines).
- Frontend feature dirs: `frontend/src/session/`, `frontend/src/auth/`, `frontend/src/features/people/`, `frontend/src/features/profile/`.
- Key routes: `/login`, `/accept-invitation`, `/select-club`.
- Key endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/invitations/accept`, `POST /api/auth/invitations/activate`, `GET /api/session/bootstrap`, full `/api/people/*` group.
- Notable surfaces: `frontend/src/components/protected-route.tsx`, `frontend/src/session/session-provider.tsx`, `frontend/src/pages/login-page.tsx`, `frontend/src/pages/invitation-accept-page.tsx`, `frontend/src/pages/select-club-page.tsx`.
- Bootstrap menu_items source: `backend/app/services/session_bootstrap_service.py:18-51`.

### Tee sheet

- Backend services: `backend/app/services/tee_sheet_service.py` (371 lines), `backend/app/services/availability_service.py` (624 lines), `backend/app/services/booking_service.py` (429 lines), `backend/app/services/booking_update_service.py` (380 lines), `backend/app/services/booking_move_service.py` (505 lines), `backend/app/services/booking_checkin_service.py`, `backend/app/services/booking_completion_service.py`, `backend/app/services/booking_cancellation_service.py`, `backend/app/services/booking_no_show_service.py`, `backend/app/services/booking_state_service.py`, `backend/app/services/booking_commercial_service.py`, `backend/app/services/booking_participant_resolver.py`.
- Frontend feature dir: `frontend/src/features/tee-sheet/` (12 files), `frontend/src/features/bookings/`.
- Key routes: `/admin/golf/tee-sheet`, `/admin/golf/dashboard`.
- Key endpoints: `GET /api/golf/tee-sheet/day`, `POST /api/golf/bookings`, `PATCH /api/golf/bookings/{booking_id}`, `POST /api/golf/bookings/{booking_id}/check-in`, `POST /api/golf/bookings/{booking_id}/complete`, `POST /api/golf/bookings/{booking_id}/no-show`, `POST /api/golf/bookings/{booking_id}/cancel`, `POST /api/golf/bookings/{booking_id}/move`.
- Notable surfaces: `frontend/src/pages/admin-golf-tee-sheet-page.tsx` (3284 lines), `frontend/src/features/tee-sheet/sheet-shared.tsx` (1057 lines), `frontend/src/features/tee-sheet/booking-management-drawer.tsx` (627 lines), `frontend/src/features/tee-sheet/tee-sheet-swimlane-grid.tsx` (639 lines).
- Gaps:
  - Frontend re-derives `staff_count` / `party_summary` locally in `updateSlotFromBookings` (`frontend/src/features/tee-sheet/sheet-shared.tsx:1027`).
  - Two `FROZEN — backend gap` markers in `frontend/src/features/tee-sheet/sheet-shared.tsx:896-898` and `:922-924` flag client-side derivation of next-action / arrivals-due / finance-eligibility flags pending backend exposure.

### Pricing & rules

- Backend services: `backend/app/services/rule_evaluation_service.py` (454 lines), `backend/app/services/rule_context_service.py` (260 lines), `backend/app/services/golf_settings_service.py` (456 lines), `backend/app/services/booking_commercial_service.py`.
- Frontend feature dir: `frontend/src/features/golf-settings/`.
- Key routes: `/admin/golf/settings`.
- Key endpoints: full `/api/rules/*` and `/api/pricing/*` groups, plus `GET /api/golf/settings/readiness`, `POST /api/golf/settings/rules/publish`, `POST /api/golf/settings/rules/rollback`, `POST /api/golf/settings/pricing/publish`, `POST /api/golf/settings/pricing/rollback`.
- Notable surfaces: `frontend/src/pages/admin-golf-settings-guided-page.tsx` (1363 lines), accessed via 4-line wrapper `frontend/src/pages/admin-golf-settings-page.tsx`.

### Finance & close-day

- Backend services: `backend/app/services/booking_finance_service.py` (599 lines), `backend/app/services/finance/accounting_profile_mapping_service.py` (699 lines), `backend/app/services/finance/export_batch_service.py` (496 lines), `backend/app/services/finance/read_model_service.py` (413 lines), `backend/app/services/finance/ledger_service.py`, `backend/app/services/accounting_template_service.py` (438 lines).
- Frontend feature dir: `frontend/src/features/finance/`.
- Key routes: `/admin/finance/dashboard`, `/admin/finance` (Close Day), `/superadmin/accounting-profiles`.
- Key endpoints: full `/api/finance/*` group (21 endpoints); plus booking-side commands `POST /api/golf/bookings/{booking_id}/post-charge`, `POST /api/golf/bookings/{booking_id}/record-payment`, `POST /api/golf/bookings/{booking_id}/post-refund`, `PATCH /api/golf/bookings/{booking_id}/payment-status`; plus superadmin accounting-profile endpoints (`POST /api/superadmin/accounting-profiles`, `POST /api/superadmin/accounting-profiles/parse-template`, `POST /api/superadmin/clubs/{club_id}/onboarding/finance/bind-profile`).
- Notable surfaces: `frontend/src/pages/admin-finance-close-day-page.tsx` (885 lines), accessed via 4-line wrapper `frontend/src/pages/admin-finance-page.tsx`; `frontend/src/pages/admin-finance-dashboard-page.tsx`; `frontend/src/pages/superadmin-accounting-profiles-page.tsx` (667 lines).

### Orders & POS

- Backend services: `backend/app/services/order_service.py` (458 lines), `backend/app/services/order_settlement_service.py` (373 lines), `backend/app/services/order_finance_posting_service.py`, `backend/app/services/pos_service.py` (315 lines).
- Frontend feature dirs: `frontend/src/features/orders/`, `frontend/src/features/pos/`.
- Key routes: `/admin/orders`, `/admin/pos-terminal`, `/player/order`.
- Key endpoints: full `/api/orders/*` group (10), full `/api/pos/*` group (4).
- Notable surfaces: `frontend/src/pages/admin-order-queue-page.tsx` (523 lines), `frontend/src/pages/admin-pos-terminal-page.tsx` (364 lines), `frontend/src/features/orders/order-management-drawer.tsx` (455 lines).

### Communications

- Backend services: `backend/app/services/comms/news_post_service.py` (165 lines), `backend/app/services/comms/blast_service.py` (183 lines).
- Frontend feature dir: `frontend/src/features/comms/`.
- Key routes: `/admin/communications`.
- Key endpoints: full `/api/comms/*` group (9).
- Notable surfaces: `frontend/src/pages/admin-communications-page.tsx` (845 lines).

### Members

- Backend services: people-side services (above) plus account-customer support.
- Frontend feature dir: covered via `frontend/src/features/people/`.
- Key routes: `/admin/members`, `/admin/people/dashboard`.
- Key endpoints: `GET /api/people/club-directory`, `POST /api/people/memberships`, `PATCH /api/people/memberships/{membership_id}`, `POST /api/people/account-customers`, `POST /api/people/bulk-intake/preview`, `POST /api/people/bulk-intake/process`, `GET /api/people/{person_id}/integrity`.
- Notable surfaces: `frontend/src/pages/admin-members-page.tsx` (1206 lines), `frontend/src/pages/admin-people-dashboard-page.tsx`.

### Halfway / Pro shop

- Backend services: `backend/app/services/halfway_service.py` (126 lines).
- Frontend feature dirs: no dedicated `features/halfway/` or `features/pro-shop/` directory.
- Key routes: `/admin/halfway`, `/admin/pro-shop`.
- Key endpoints: `GET /api/admin/halfway/summary`.
- Notable surfaces: `frontend/src/pages/admin-halfway-page.tsx` (343 lines), `frontend/src/pages/admin-pro-shop-page.tsx` (400 lines).

### Superadmin

- Backend services: `backend/app/services/superadmin_onboarding_service.py` (898 lines), `backend/app/services/accounting_template_service.py` (438 lines), `backend/app/services/platform_service.py` (241 lines), `backend/app/services/module_catalog.py`.
- Frontend feature dir: `frontend/src/features/superadmin/`.
- Key routes: `/superadmin/overview`, `/superadmin/clubs`, `/superadmin/accounting-profiles`.
- Key endpoints: full `/api/superadmin/*` group (16), plus `POST /api/platform/bootstrap`, `POST /api/platform/clubs`, `POST /api/platform/memberships`, `PUT /api/platform/clubs/{club_id}/modules`.
- Notable surfaces: `frontend/src/pages/superadmin-clubs-page.tsx` (1235 lines), `frontend/src/pages/superadmin-accounting-profiles-page.tsx`, `frontend/src/pages/superadmin-overview-page.tsx`.

### Player

- Backend services: `backend/app/services/player_booking_read_model_service.py` (138 lines); player profile served via `backend/app/services/people_service.py` (`GET/PATCH /api/people/me/profile`).
- Frontend feature dir: `frontend/src/features/profile/`.
- Key routes: `/player/home`, `/player/book`, `/player/order`, `/player/profile`.
- Key endpoints: `GET /api/golf/bookings/player`, `GET /api/comms/feed`, `POST /api/golf/bookings` (with `source="member_portal"`), `GET /api/people/me/profile`, `PATCH /api/people/me/profile`, `POST /api/orders`.
- Notable surfaces: `frontend/src/pages/player-shell-page.tsx`, `frontend/src/pages/player-book-page.tsx`, `frontend/src/pages/player-order-page.tsx`, `frontend/src/pages/player-profile-page.tsx`, `frontend/src/pages/player-tab-items.ts`.

### Reporting & targets

- Backend services: `backend/app/services/admin_dashboard_service.py` (318 lines), `backend/app/services/reports_service.py` (144 lines), `backend/app/services/targets_service.py` (226 lines).
- Frontend feature dirs: `frontend/src/features/admin-dashboard/`, `frontend/src/features/targets/`.
- Key routes: `/admin/dashboard`, `/admin/reports`, `/admin/targets`.
- Key endpoints: `GET /api/admin/dashboard/summary`, `GET /api/admin/reports/summary`, full `/api/targets/*` group (5).
- Notable surfaces: `frontend/src/pages/admin-dashboard-page.tsx` (355 lines), `frontend/src/pages/admin-reports-page.tsx` (608 lines), `frontend/src/pages/admin-targets-page.tsx`.

## Known follow-ups (code-evidenced only)

- **C9 — staff_count recomputation in tee sheet read model.** Frontend re-derives `party_summary.staff_count` locally; backend should be the source. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:1027`.
- **Tee-sheet read model lacks `next_action` / arrivals-due / unresolved flags.** Frontend derives them from raw booking state. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:896-898` (`// FROZEN — backend gap. … Replace when backend read model exposes computed flags (is_at_risk, is_arrivals_due, next_action, is_unresolved).`).
- **Booking read model lacks finance eligibility flags.** Frontend derives `canPostCharge` / `canRecordPayment` / `canMarkComplimentary` / `canMarkWaived` / `canPostRefund` from `payment_status`. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:922-924` (`// FROZEN — backend gap. … Replace when backend read model exposes computed finance eligibility flags …`).

## What is NOT here

- **No `/admin/golf/bookings` dedicated booking-management page.** Not registered in `frontend/src/routes/router.tsx`; no file `frontend/src/pages/admin-golf-bookings-page.tsx`.
- **No `/api/golf/bookings/{id}/move-participant` endpoint.** Participant-level moves go through the single `POST /api/golf/bookings/{booking_id}/move` endpoint with an optional `participant_id` body field (`backend/app/schemas/bookings.py:353`).
- **No app container in `docker-compose.yml`.** Only `postgres` and `redis` are declared (`docker-compose.yml:1-32`); backend and frontend run on the host.
- **No backend mypy/pyright config.** `backend/pyproject.toml:22-27` lists only `httpx`, `pytest`, `pytest-asyncio`, `ruff` in `[project.optional-dependencies].dev`.
- **No `/api/orders` settlement endpoint distinct from `record-payment`.** Order settlement is exposed as `POST /api/orders/{order_id}/record-payment` (`backend/app/api/orders/routes.py:232-233`); there is no separate `/settle` route.
- **No CI step for `npm run build`.** `.github/workflows/ci.yml:38-49` runs install, lint, typecheck, and test only; build is not invoked.
