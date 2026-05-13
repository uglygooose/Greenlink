# GreenLink — Live State

Last regenerated: 2026-05-13 from commit `1fe0466`.
Source of truth: code in this repo. If this file disagrees with code, code wins.

## How this file is maintained

This file is regenerated, not edited. To update it, re-run the Phase 1 regeneration procedure (read endpoints, routes, models, and migrations from source and rewrite the file). Drifts between this file and code are recorded in `DRIFT_LOG.md`. Phase history is recorded in `PHASE_LOG.md`.

## Stack

- Frontend: React 18 (`frontend/package.json:16-17`), Vite 5 (`frontend/package.json:37`), TypeScript 5 (`frontend/package.json:35`), `react-router-dom` 6 (`frontend/package.json:18`), `@tanstack/react-query` 5 (`frontend/package.json:14`), Vitest 2 (`frontend/package.json:38`). Entry `frontend/src/main.tsx`; routes `frontend/src/routes/router.tsx`.
- Backend: FastAPI (`backend/pyproject.toml:8`), SQLAlchemy 2 (`backend/pyproject.toml:16`), Alembic (`backend/pyproject.toml:7`), pydantic / pydantic-settings (`backend/pyproject.toml:11-12`), PyJWT (`backend/pyproject.toml:13`), Python `>=3.12` (`backend/pyproject.toml:5`). Entry `backend/app/main.py`; router aggregation `backend/app/api/router.py`.
- Database: PostgreSQL, required by validator at `backend/app/config/settings.py:45-49`. Connection string read from `GREENLINK_DATABASE_URL` (env prefix `GREENLINK_`, `backend/app/config/settings.py:16,25`); Alembic-side URL hardcoded in `backend/alembic.ini:6`.
- Dev infra: `docker-compose.yml` defines two services — `postgres` (`postgres:16-alpine`, `docker-compose.yml:2-17`) and `redis` (`redis:7-alpine`, `docker-compose.yml:19-28`). No app container.

## Design system

Phase 7 ported the Phase 6 prototype into the live frontend. Locked production defaults: Newsreader (display serif), Manrope (workhorse sans), default density, light mode. Dark-mode tokens exist (no user toggle in v1). All Phase 7 surfaces are wrapped in the `.gl` token scope so they sit alongside un-rebuilt pages without colliding with `frontend/src/styles/app.css`.

- Tokens: `frontend/src/styles/tokens.css` (389 lines). Imported in `frontend/src/main.tsx:5` ahead of `app.css`. `--gl-font-serif` → Newsreader and `--gl-font-sans` → Manrope (`frontend/src/styles/tokens.css:75-76`); `--gl-font-mono` → IBM Plex Mono (`frontend/src/styles/tokens.css:77`). Canonical reference: `docs/phase6_prototype/tokens.css`.
- Web fonts: Google Fonts link in `frontend/index.html:16-19` covers Newsreader, Manrope, IBM Plex Mono, Material Symbols Outlined (plus Inter, kept for un-rebuilt pages). `font-display: swap`. Self-hosting deferred to v1.5.
- Component primitives (`frontend/src/components/ui/`):
  - `Button.tsx` (52 lines) — primary / secondary / tertiary / destructive; sm / md / lg sizes; loading state via `aria-busy`.
  - `Input.tsx` (116 lines) — wires `useId`-derived `htmlFor`/`id`, `aria-describedby` (helper + error IDs), `aria-invalid` automatically.
  - `Card.tsx` (26 lines) — default / flat / sunken variants; semantic `as=` for `div` / `section` / `article` / `aside`.
  - `Badge.tsx` (36 lines) — 9 tones mapped to `--gl-*` palette; optional dot.
  - `Table.tsx` (99 lines) — generic over row type; tabular figures on `.num` cells; `aria-sort` on sortable headers.
  - `Icon.tsx` (43 lines) — Material Symbols Outlined wrapper with `FILL`/`wght`/`GRAD`/`opsz` variation-settings; `aria-hidden` by default, `role="img"` + `aria-label` when labelled.
  - `Wordmark.tsx` (47 lines) — serif "Green" + sans "link" + Caddie Red dot.
  - `Avatar.tsx` (31 lines) — heritage circle, parchment glyph, serif tile.
  - `HeroPlaceholder.tsx` (90 lines) — SVG-only brand-surface stand-in (tones `dawn` / `course` / `mist`). Three tone palettes are intentional hex literals scoped to this file (atmospheric SVG values not derivable from `--gl-*` tokens). Real photography deferred to v1.5.
  - Each primitive ships with a vitest render test alongside (17 tests total across the seven primitives that have explicit tests; Avatar + HeroPlaceholder do not have dedicated test files).
- Admin chrome (`frontend/src/components/admin-shell/`):
  - `AdminShell.tsx` (27 lines) — sidebar + topbar + scrollable main, wrapped in `.gl`.
  - `AdminSidebar.tsx` (258 lines) — nav structure: Operate / Finance / Club groups + Settings. Items without backing routes (`Bookings`, `Member ledger`, `Audit log`, `Handicaps`, `Competitions`) render as `aria-disabled` placeholders.
  - `AdminTopBar.tsx` (117 lines) — 64px top bar with title + breadcrumbs + search + (currently-disabled) action buttons.
- Onboarding helper (`frontend/src/components/onboarding/OnboardingProgress.tsx`, 38 lines) — `role="progressbar"` with `aria-valuemin`/`aria-valuemax`/`aria-valuenow`.
- Token discipline: arbitrary hex values in new code are confined to `tokens.css` (canonical) and `HeroPlaceholder.tsx`'s three tone palettes (documented above). Every other rebuilt surface references `--gl-*` tokens only.

## Routes (frontend)

All routes defined in `frontend/src/routes/router.tsx`. ProtectedRoute wraps each shell; layouts wrap the protected children.

### Public

- `/` → `RootRedirect` (`frontend/src/routes/router.tsx:38-48`) — redirects to bootstrap `landing_path` or `/login`.
- `/login` → `frontend/src/pages/login-page.tsx`.
- `/accept-invitation` → `frontend/src/pages/invitation-accept-page.tsx` — reads `?token=…` query param.
- `/select-club` → `frontend/src/pages/select-club-page.tsx` — club picker.
- `/admin/select-club` → redirect to `/select-club` (`frontend/src/routes/router.tsx:54`).

### Onboarding (wrapped by `ProtectedRoute`, no admin shell — brand-flavoured flow)

- `/onboarding/welcome` → `frontend/src/pages/onboarding-welcome-page.tsx` — Step 1 of 6.
- `/onboarding/popia` → `frontend/src/pages/onboarding-popia-page.tsx` — Step 3 of 6; POPIA consent + Information Officer designation, persistence still stubbed.
- `/onboarding/complete` → `frontend/src/pages/onboarding-completion-page.tsx` — Step 6 of 6; "Open dashboard" navigates to `/admin/dashboard`.
- `/onboarding/*` → redirect to `/onboarding/welcome` (`frontend/src/routes/router.tsx:67`).

### Superadmin (wrapped by `SuperadminLayout`, `frontend/src/routes/superadmin-layout.tsx`)

- `/superadmin/overview` → `frontend/src/pages/superadmin-overview-page.tsx`.
- `/superadmin/clubs` → `frontend/src/pages/superadmin-clubs-page.tsx`.
- `/superadmin/accounting-profiles` → `frontend/src/pages/superadmin-accounting-profiles-page.tsx`.
- `/superadmin/*` → redirect to `/superadmin/overview` (`frontend/src/routes/router.tsx:113`).

### Admin (wrapped by `AdminLayout`, `frontend/src/routes/admin-layout.tsx`)

- `/admin/dashboard` → `frontend/src/pages/admin-dashboard-page.tsx` — Dashboard workspace.
- `/admin/golf/dashboard` → `frontend/src/pages/admin-golf-dashboard-page.tsx`.
- `/admin/golf/tee-sheet` → `frontend/src/pages/admin-golf-tee-sheet-page.tsx`.
- `/admin/golf/settings` → `frontend/src/pages/admin-golf-settings-page.tsx`.
- `/admin/orders` → `frontend/src/pages/admin-order-queue-page.tsx`.
- `/admin/people/dashboard` → `frontend/src/pages/admin-people-dashboard-page.tsx`.
- `/admin/members` → `frontend/src/pages/admin-members-page.tsx`.
- `/admin/targets` → `frontend/src/pages/admin-targets-page.tsx` (real route, see `admin-targets-redirect.test.tsx:14-30`).
- `/admin/finance/dashboard` → `frontend/src/pages/admin-finance-dashboard-page.tsx`.
- `/admin/finance` → `frontend/src/pages/admin-finance-page.tsx` (Close Day).
- `/admin/communications` → `frontend/src/pages/admin-communications-page.tsx`.
- `/admin/halfway` → `frontend/src/pages/admin-halfway-page.tsx`.
- `/admin/pro-shop` → `frontend/src/pages/admin-pro-shop-page.tsx`.
- `/admin/reports` → `frontend/src/pages/admin-reports-page.tsx`.
- `/admin/pos-terminal` → `frontend/src/pages/admin-pos-terminal-page.tsx`.
- `/admin/settings` → `frontend/src/pages/admin-settings-hub-page.tsx` — Club details + sectioned sub-nav.
- `/admin/settings/club` → redirect to `/admin/settings` (`frontend/src/routes/router.tsx:93`).
- `/admin/settings/profile` → redirect to `/admin/settings` (`frontend/src/routes/router.tsx:94`).
- `/admin/settings/modules` → `frontend/src/pages/admin-settings-modules-page.tsx`.
- `/admin/*` → redirect to `/admin/dashboard` (`frontend/src/routes/router.tsx:98`).

### Player

- `/player/home` → `frontend/src/pages/player-shell-page.tsx`.
- `/player/book` → `frontend/src/pages/player-book-page.tsx`.
- `/player/order` → `frontend/src/pages/player-order-page.tsx`.
- `/player/profile` → `frontend/src/pages/player-profile-page.tsx`.
- `/player/*` → redirect to `/player/home` (`frontend/src/routes/router.tsx:124`).

## API endpoints (backend)

Prefixes set in `backend/app/api/router.py`. Endpoints listed with absolute path (prefix + relative path), handler function, and source location. Non-200 default status codes annotated; `→ 201` / `→ 204` mark explicit overrides.

### Health (`backend/app/api/routes/health.py`)

- `GET /health` — `health` (`backend/app/api/routes/health.py:14`)

### Auth — `/api/auth` (`backend/app/api/routes/auth.py`)

- `POST /api/auth/login` — `login` (`backend/app/api/routes/auth.py:27`)
- `POST /api/auth/refresh` — `refresh` (`backend/app/api/routes/auth.py:39`)
- `POST /api/auth/invitations/accept` — `accept_invitation` (`backend/app/api/routes/auth.py:51`)
- `POST /api/auth/invitations/activate` — `activate_invitation` (`backend/app/api/routes/auth.py:63`)
- `POST /api/auth/logout` → 204 — `logout` (`backend/app/api/routes/auth.py:73`)
- `GET /api/auth/me` — `me` (`backend/app/api/routes/auth.py:86`)

### Session — `/api/session` (`backend/app/api/routes/session.py`)

- `GET /api/session/bootstrap` — `bootstrap` (`backend/app/api/routes/session.py:16`)

### Platform — `/api/platform` (`backend/app/api/routes/platform.py`)

- `POST /api/platform/bootstrap` → 201 — `bootstrap_platform` (`backend/app/api/routes/platform.py:30-34`)
- `POST /api/platform/clubs` → 201 — `create_club` (`backend/app/api/routes/platform.py:44-48`)
- `POST /api/platform/memberships` → 201 — `assign_membership` returns the created `ClubMembership` resource (`backend/app/api/routes/platform.py:59-63`)
- `PUT /api/platform/clubs/{club_id}/modules` — `update_modules` returns the post-update module-key list (`backend/app/api/routes/platform.py:83`)

### Superadmin — `/api/superadmin` (`backend/app/api/routes/superadmin.py`)

- `GET /api/superadmin/clubs` — `list_superadmin_clubs` (`backend/app/api/routes/superadmin.py:43`)
- `GET /api/superadmin/accounting-profiles` — `list_superadmin_accounting_profiles` (`backend/app/api/routes/superadmin.py:51`)
- `GET /api/superadmin/accounting-profiles/sample-layout` — `get_superadmin_accounting_sample_layout` (`backend/app/api/routes/superadmin.py:60-62`)
- `POST /api/superadmin/accounting-profiles/parse-template` — `parse_superadmin_accounting_template` (`backend/app/api/routes/superadmin.py:71-73`)
- `POST /api/superadmin/accounting-profiles` → 201 — `create_superadmin_accounting_profile` (`backend/app/api/routes/superadmin.py:85-89`)
- `PATCH /api/superadmin/accounting-profiles/{profile_id}/active` — `update_superadmin_accounting_profile_active` (`backend/app/api/routes/superadmin.py:107-109`)
- `POST /api/superadmin/clubs` → 201 — `create_superadmin_club` (`backend/app/api/routes/superadmin.py:122`)
- `PATCH /api/superadmin/clubs/{club_id}/status` — `update_superadmin_club_status` (`backend/app/api/routes/superadmin.py:138`)
- `DELETE /api/superadmin/clubs/{club_id}` → 204 — `delete_superadmin_club` (`backend/app/api/routes/superadmin.py:156`)
- `GET /api/superadmin/clubs/{club_id}/onboarding` — `get_superadmin_club_onboarding` (`backend/app/api/routes/superadmin.py:172`)
- `PUT /api/superadmin/clubs/{club_id}/onboarding` — `update_superadmin_club_onboarding` (`backend/app/api/routes/superadmin.py:181`)
- `POST /api/superadmin/clubs/{club_id}/onboarding/finance/bind-profile` — `bind_superadmin_club_accounting_profile` (`backend/app/api/routes/superadmin.py:199-202`)
- `GET /api/superadmin/clubs/{club_id}/assignment-candidates` — `list_superadmin_assignment_candidates` (`backend/app/api/routes/superadmin.py:214-217`)
- `POST /api/superadmin/clubs/{club_id}/assignments` → 201 — `assign_superadmin_club_user` (`backend/app/api/routes/superadmin.py:230-234`)
- `GET /api/superadmin/clubs/{club_id}/invitations` — `list_superadmin_club_invitations` (`backend/app/api/routes/superadmin.py:252-255`)
- `POST /api/superadmin/clubs/{club_id}/invitations` → 201 — `create_superadmin_club_invitation` (`backend/app/api/routes/superadmin.py:264-268`)

### People — `/api/people` (`backend/app/api/routes/people.py`)

- `GET /api/people` — `list_people` (`backend/app/api/routes/people.py:85`)
- `GET /api/people/club-directory` — `list_club_people` (`backend/app/api/routes/people.py:102`)
- `POST /api/people` → 201 — `create_person` (`backend/app/api/routes/people.py:117`)
- `POST /api/people/memberships` → 201 — `create_or_update_membership` (`backend/app/api/routes/people.py:140-144`)
- `PATCH /api/people/memberships/{membership_id}` — `update_membership` (`backend/app/api/routes/people.py:167`)
- `POST /api/people/account-customers` → 201 — `create_account_customer` (`backend/app/api/routes/people.py:196-200`)
- `POST /api/people/bulk-intake/preview` — `preview_bulk_intake` (`backend/app/api/routes/people.py:223`)
- `POST /api/people/bulk-intake/process` — `process_bulk_intake` (`backend/app/api/routes/people.py:237`)
- `GET /api/people/me/profile` — `get_self_profile` (`backend/app/api/routes/people.py:259`)
- `PATCH /api/people/me/profile` — `update_self_profile` (`backend/app/api/routes/people.py:286`)
- `GET /api/people/{person_id}` — `get_person` (`backend/app/api/routes/people.py:321`)
- `PATCH /api/people/{person_id}` — `update_person` (`backend/app/api/routes/people.py:341`)
- `GET /api/people/{person_id}/memberships` — `list_person_memberships` (`backend/app/api/routes/people.py:371`)
- `GET /api/people/{person_id}/integrity` — `evaluate_person_integrity` (`backend/app/api/routes/people.py:391`)

### Clubs — `/api/clubs` (`backend/app/api/routes/clubs.py`)

- `GET /api/clubs/config` — `get_club_config` (`backend/app/api/routes/clubs.py:22`)
- `PUT /api/clubs/config` — `update_club_config` (`backend/app/api/routes/clubs.py:36`)

### Golf — `/api/golf` (`backend/app/api/routes/golf.py`)

- `GET /api/golf/courses` — `list_courses` (`backend/app/api/routes/golf.py:137`)
- `POST /api/golf/courses` → 201 — `create_course` (`backend/app/api/routes/golf.py:152`)
- `GET /api/golf/tees` — `list_tees` (`backend/app/api/routes/golf.py:175`)
- `POST /api/golf/tees` → 201 — `create_tee` (`backend/app/api/routes/golf.py:198`)
- `GET /api/golf/settings/readiness` — `get_golf_settings_readiness` (`backend/app/api/routes/golf.py:226`)
- `POST /api/golf/settings/rules/publish` — `publish_golf_rules` (`backend/app/api/routes/golf.py:238`)
- `POST /api/golf/settings/rules/rollback` — `rollback_golf_rules` (`backend/app/api/routes/golf.py:251`)
- `POST /api/golf/settings/pricing/publish` — `publish_golf_pricing` (`backend/app/api/routes/golf.py:263`)
- `POST /api/golf/settings/pricing/rollback` — `rollback_golf_pricing` (`backend/app/api/routes/golf.py:278`)
- `GET /api/golf/tee-sheet/day` — `get_tee_sheet_day` (`backend/app/api/routes/golf.py:290`)
- `GET /api/golf/bookings/player` — `get_player_bookings` (`backend/app/api/routes/golf.py:324`)
- `POST /api/golf/bookings` → 201 — `create_booking` (`backend/app/api/routes/golf.py:349-353`)
- `PATCH /api/golf/bookings/{booking_id}` — `update_booking` (`backend/app/api/routes/golf.py:371`)
- `PATCH /api/golf/bookings/{booking_id}/payment-status` — `update_booking_payment_status` (`backend/app/api/routes/golf.py:386`)
- `POST /api/golf/bookings/{booking_id}/post-charge` — `post_booking_charge` (`backend/app/api/routes/golf.py:410`)
- `POST /api/golf/bookings/{booking_id}/record-payment` — `record_booking_payment` (`backend/app/api/routes/golf.py:433`)
- `POST /api/golf/bookings/{booking_id}/post-refund` — `post_booking_refund` (`backend/app/api/routes/golf.py:453`)
- `POST /api/golf/bookings/{booking_id}/move` — `move_booking` (`backend/app/api/routes/golf.py:476`); accepts optional `participant_id` for participant-level moves (`backend/app/schemas/bookings.py:353`).
- `POST /api/golf/bookings/{booking_id}/cancel` — `cancel_booking` (`backend/app/api/routes/golf.py:500`)
- `POST /api/golf/bookings/{booking_id}/check-in` — `check_in_booking` (`backend/app/api/routes/golf.py:520`)
- `POST /api/golf/bookings/{booking_id}/complete` — `complete_booking` (`backend/app/api/routes/golf.py:540`)
- `POST /api/golf/bookings/{booking_id}/no-show` — `mark_booking_no_show` (`backend/app/api/routes/golf.py:560`)

### Rules — `/api/rules` (`backend/app/api/routes/rules.py`)

- `GET /api/rules` — `list_rule_sets` (`backend/app/api/routes/rules.py:168`)
- `POST /api/rules` → 201 — `create_rule_set` (`backend/app/api/routes/rules.py:190`)
- `PUT /api/rules/{rule_set_id}` — `update_rule_set` (`backend/app/api/routes/rules.py:231`)
- `GET /api/rules/evaluate` — `evaluate_rules` (`backend/app/api/routes/rules.py:50`)
- `GET /api/rules/availability-preview` — `preview_availability` (`backend/app/api/routes/rules.py:91`)
- `POST /api/rules/slot-preview` — `preview_slot` (`backend/app/api/routes/rules.py:133`)

### Pricing — `/api/pricing` (`backend/app/api/routes/pricing.py`)

- `GET /api/pricing` — `list_pricing_matrices` (`backend/app/api/routes/pricing.py:32`)
- `POST /api/pricing` → 201 — `create_pricing_matrix` (`backend/app/api/routes/pricing.py:54`)
- `PUT /api/pricing/{matrix_id}` — `update_pricing_matrix` (`backend/app/api/routes/pricing.py:88`)

### Targets — `/api/targets` (`backend/app/api/routes/targets.py`)

- `GET /api/targets/metrics` — `list_target_metrics` (`backend/app/api/routes/targets.py:27`)
- `GET /api/targets` — `list_targets` (`backend/app/api/routes/targets.py:38`)
- `POST /api/targets` — `create_target` (`backend/app/api/routes/targets.py:50`)
- `PATCH /api/targets/{target_id}` — `update_target` (`backend/app/api/routes/targets.py:63`)
- `POST /api/targets/{target_id}/archive` — `archive_target` (`backend/app/api/routes/targets.py:81`)

### Admin dashboard — `/api/admin/dashboard` (`backend/app/api/routes/admin_dashboard.py`)

- `GET /api/admin/dashboard/summary` — `get_dashboard_summary` (`backend/app/api/routes/admin_dashboard.py:21`)

### Halfway — `/api/admin/halfway` (`backend/app/api/routes/halfway.py`)

- `GET /api/admin/halfway/summary` — `get_halfway_summary` (`backend/app/api/routes/halfway.py:21`)

### Reports — `/api/admin/reports` (`backend/app/api/routes/reports.py`)

- `GET /api/admin/reports/summary` — `get_reports_summary` (`backend/app/api/routes/reports.py:21`)

### Finance — `/api/finance` (`backend/app/api/finance/routes.py`)

- `POST /api/finance/transactions` → 201 — `create_finance_transaction` (`backend/app/api/finance/routes.py:50-54`)
- `GET /api/finance/accounts` — `list_finance_accounts` (`backend/app/api/finance/routes.py:68`)
- `GET /api/finance/accounts/{account_id}/ledger` — `get_account_ledger` (`backend/app/api/finance/routes.py:155`)
- `GET /api/finance/journal` — `get_club_journal` (`backend/app/api/finance/routes.py:81`)
- `GET /api/finance/summaries/revenue` — `get_finance_revenue_summary` (`backend/app/api/finance/routes.py:94`)
- `GET /api/finance/summaries/outstanding` — `get_finance_outstanding_summary` (`backend/app/api/finance/routes.py:111`)
- `GET /api/finance/summaries/transaction-volume` — `get_finance_transaction_volume_summary` (`backend/app/api/finance/routes.py:124`)
- `GET /api/finance/exceptions` — `get_finance_exceptions` (`backend/app/api/finance/routes.py:141`)
- `POST /api/finance/export-batches` → 201 — `create_finance_export_batch` (`backend/app/api/finance/routes.py:169-173`)
- `GET /api/finance/export-batches` — `list_finance_export_batches` (`backend/app/api/finance/routes.py:193`)
- `GET /api/finance/export-batches/{batch_id}` — `get_finance_export_batch` (`backend/app/api/finance/routes.py:206`)
- `GET /api/finance/export-batches/{batch_id}/reconciliation` — `get_finance_export_batch_reconciliation` (`backend/app/api/finance/routes.py:220-223`)
- `GET /api/finance/export-batches/{batch_id}/download` — `download_finance_export_batch` (`backend/app/api/finance/routes.py:237`)
- `POST /api/finance/export-batches/{batch_id}/void` — `void_finance_export_batch` (`backend/app/api/finance/routes.py:386`)
- `POST /api/finance/export-batches/{batch_id}/regenerate` — `regenerate_finance_export_batch` (`backend/app/api/finance/routes.py:400-402`)
- `GET /api/finance/export-batches/{batch_id}/mapped-export` — `get_mapped_finance_export_preview` (`backend/app/api/finance/routes.py:314-316`)
- `GET /api/finance/export-batches/{batch_id}/mapped-export/download` — `download_mapped_finance_export` (`backend/app/api/finance/routes.py:335`)
- `POST /api/finance/export-batches/{batch_id}/mapped-export/export` — `export_mapped_finance_batch` (`backend/app/api/finance/routes.py:359`)
- `GET /api/finance/accounting-profiles` — `list_accounting_export_profiles` (`backend/app/api/finance/routes.py:256`)
- `POST /api/finance/accounting-profiles` → 201 — `create_accounting_export_profile` (`backend/app/api/finance/routes.py:269-273`)
- `PUT /api/finance/accounting-profiles/{profile_id}` — `update_accounting_export_profile` (`backend/app/api/finance/routes.py:295`)

### Orders — `/api/orders` (`backend/app/api/orders/routes.py`)

- `GET /api/orders/menu` — `get_order_menu` (`backend/app/api/orders/routes.py:75`)
- `POST /api/orders` → 201 — `create_order` (`backend/app/api/orders/routes.py:88-92`)
- `GET /api/orders` — `list_orders` (`backend/app/api/orders/routes.py:121`)
- `GET /api/orders/{order_id}` — `get_order` (`backend/app/api/orders/routes.py:138`)
- `POST /api/orders/{order_id}/preparing` — `mark_order_preparing` (`backend/app/api/orders/routes.py:154`)
- `POST /api/orders/{order_id}/ready` — `mark_order_ready` (`backend/app/api/orders/routes.py:171`)
- `POST /api/orders/{order_id}/collected` — `mark_order_collected` (`backend/app/api/orders/routes.py:188`)
- `POST /api/orders/{order_id}/cancel` — `cancel_order` (`backend/app/api/orders/routes.py:205`)
- `POST /api/orders/{order_id}/post-charge` — `post_order_charge` (`backend/app/api/orders/routes.py:222`)
- `POST /api/orders/{order_id}/record-payment` — `record_order_payment` (`backend/app/api/orders/routes.py:239`)

### POS — `/api/pos` (`backend/app/api/pos/routes.py`)

- `GET /api/pos/products` — `list_products` (`backend/app/api/pos/routes.py:33`)
- `POST /api/pos/products` → 201 — `create_product` (`backend/app/api/pos/routes.py:50`)
- `PATCH /api/pos/products/{product_id}` — `update_product` (`backend/app/api/pos/routes.py:64`)
- `POST /api/pos/transactions` → 201 — `create_pos_transaction` (`backend/app/api/pos/routes.py:83-87`)

### Comms — `/api/comms` (`backend/app/api/comms/routes.py`)

- `GET /api/comms/feed` — `list_published_news_feed` (`backend/app/api/comms/routes.py:49`)
- `GET /api/comms/posts` — `list_news_posts` (`backend/app/api/comms/routes.py:62`)
- `POST /api/comms/posts` → 201 — `create_news_post` (`backend/app/api/comms/routes.py:76`)
- `GET /api/comms/posts/{post_id}` — `get_news_post` (`backend/app/api/comms/routes.py:94`)
- `PATCH /api/comms/posts/{post_id}` — `update_news_post` (`backend/app/api/comms/routes.py:108`)
- `DELETE /api/comms/posts/{post_id}` → 204 — `delete_news_post` (`backend/app/api/comms/routes.py:127`)
- `GET /api/comms/blasts` — `list_blasts` (`backend/app/api/comms/routes.py:144`)
- `POST /api/comms/blasts` → 201 — `create_blast` (`backend/app/api/comms/routes.py:156`)
- `POST /api/comms/blasts/{blast_id}/send` — `send_blast` (`backend/app/api/comms/routes.py:173`)

## Database

- Migration head: `202605120001` (`backend/alembic/versions/202605120001_legal_foundations.py`).
- Migration count: 25 revision files in `backend/alembic/versions/`. Chain is linear (single head, single root at `202603270001_foundation_scaffold.py` with `down_revision = None`).
- Schema/model parity: `alembic --autogenerate` against a fresh-migrated DB produces zero proposed ops (Phase 5 baseline, preserved through the 9-series).
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
- Columns added by the most recent migration (`202605120001_legal_foundations.py`):
  - `people.consent_captured_at` (timestamptz, nullable) — POPIA consent timestamp (`backend/app/models/person.py:33`).
  - `people.consent_version` (String(64), nullable) — POPIA consent version label (`backend/app/models/person.py:34`).
  - `people.consent_source` (String(32), nullable) + CHECK `ck_people_consent_source_valid` over `{onboarding, member_app, admin_capture, import}` (`backend/app/models/person.py:35`; `backend/alembic/versions/202605120001_legal_foundations.py:43-60`).
  - `people.hna_player_id` (String(32), nullable) + global partial unique index `ix_people_hna_player_id_unique` (`backend/app/models/person.py:36`; `backend/alembic/versions/202605120001_legal_foundations.py:63-66`).
  - `clubs.information_officer_person_id` (Uuid, FK → `people.id`, `ON DELETE SET NULL`) (`backend/app/models/club.py:41`; `backend/alembic/versions/202605120001_legal_foundations.py:81-88`).
  - `clubs.information_officer_designated_at` (timestamptz, nullable) (`backend/app/models/club.py:45`).
  - `bookings.vat_category` (String(32), NOT NULL, `server_default 'green_fee'`) + CHECK `ck_bookings_vat_category_valid` over `VatCategory` six-value set (`backend/app/models/booking.py:90`; `backend/alembic/versions/202605120001_legal_foundations.py:91-104`).
  - `order_items.vat_category` (String(32), NOT NULL, `server_default 'other'`) + CHECK `ck_order_items_vat_category_valid` (`backend/app/models/order_item.py:34`; `backend/alembic/versions/202605120001_legal_foundations.py:107-120`).
  - `pos_transaction_items.vat_category` (String(32), NOT NULL, `server_default 'other'`) + CHECK `ck_pos_transaction_items_vat_category_valid` (`backend/app/models/pos_transaction.py:97`; `backend/alembic/versions/202605120001_legal_foundations.py:123-136`).

## Domains (what exists, terse)

### Identity & session

- Backend services: `backend/app/services/auth_service.py` (322 lines), `backend/app/services/session_bootstrap_service.py` (410 lines), `backend/app/services/platform_service.py` (285 lines), `backend/app/services/people_service.py` (499 lines), `backend/app/services/people_integrity_service.py` (278 lines), `backend/app/services/bulk_intake_service.py` (368 lines).
- Frontend feature dirs: `frontend/src/session/`, `frontend/src/auth/`, `frontend/src/features/people/`, `frontend/src/features/profile/`.
- Key routes: `/login`, `/accept-invitation`, `/select-club`.
- Key endpoints: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/invitations/accept`, `POST /api/auth/invitations/activate`, `GET /api/session/bootstrap`, full `/api/people/*` group.
- Notable surfaces: `frontend/src/components/protected-route.tsx`, `frontend/src/session/session-provider.tsx`, `frontend/src/pages/login-page.tsx` (225 lines), `frontend/src/pages/invitation-accept-page.tsx`, `frontend/src/pages/select-club-page.tsx`, `frontend/src/pages/onboarding-welcome-page.tsx` (148 lines), `frontend/src/pages/onboarding-popia-page.tsx` (249 lines), `frontend/src/pages/onboarding-completion-page.tsx` (153 lines).
- Bootstrap menu_items source: `backend/app/services/session_bootstrap_service.py:18-51`.

### Tee sheet

- Backend services: `backend/app/services/tee_sheet_service.py` (379 lines), `backend/app/services/availability_service.py` (652 lines), `backend/app/services/booking_service.py` (447 lines), `backend/app/services/booking_update_service.py` (399 lines), `backend/app/services/booking_move_service.py` (534 lines), `backend/app/services/booking_checkin_service.py`, `backend/app/services/booking_completion_service.py`, `backend/app/services/booking_cancellation_service.py`, `backend/app/services/booking_no_show_service.py`, `backend/app/services/booking_state_service.py`, `backend/app/services/booking_commercial_service.py`, `backend/app/services/booking_participant_resolver.py`.
- Frontend feature dir: `frontend/src/features/tee-sheet/` (12 files), `frontend/src/features/bookings/`.
- Key routes: `/admin/golf/tee-sheet`, `/admin/golf/dashboard`.
- Key endpoints: `GET /api/golf/tee-sheet/day`, `POST /api/golf/bookings`, `PATCH /api/golf/bookings/{booking_id}`, `POST /api/golf/bookings/{booking_id}/check-in`, `POST /api/golf/bookings/{booking_id}/complete`, `POST /api/golf/bookings/{booking_id}/no-show`, `POST /api/golf/bookings/{booking_id}/cancel`, `POST /api/golf/bookings/{booking_id}/move`.
- Notable surfaces: `frontend/src/pages/admin-golf-tee-sheet-page.tsx` (3276 lines), `frontend/src/features/tee-sheet/sheet-shared.tsx` (1057 lines), `frontend/src/features/tee-sheet/booking-management-drawer.tsx` (622 lines), `frontend/src/features/tee-sheet/tee-sheet-swimlane-grid.tsx` (639 lines).
- Gaps:
  - Frontend re-derives `staff_count` / `party_summary` locally in `updateSlotFromBookings` (`frontend/src/features/tee-sheet/sheet-shared.tsx:1023-1027`).
  - Two `FROZEN — backend gap` markers in `frontend/src/features/tee-sheet/sheet-shared.tsx:896` and `:922` flag client-side derivation of next-action / arrivals-due / finance-eligibility flags pending backend exposure.

### Pricing & rules

- Backend services: `backend/app/services/rule_evaluation_service.py` (454 lines), `backend/app/services/rule_context_service.py` (260 lines), `backend/app/services/golf_settings_service.py` (655 lines), `backend/app/services/booking_commercial_service.py`.
- Frontend feature dir: `frontend/src/features/golf-settings/`.
- Key routes: `/admin/golf/settings`.
- Key endpoints: full `/api/rules/*` and `/api/pricing/*` groups, plus `GET /api/golf/settings/readiness`, `POST /api/golf/settings/rules/publish`, `POST /api/golf/settings/rules/rollback`, `POST /api/golf/settings/pricing/publish`, `POST /api/golf/settings/pricing/rollback`.
- Notable surfaces: `frontend/src/pages/admin-golf-settings-page.tsx` (1363 lines).

### Finance & close-day

- Backend services: `backend/app/services/booking_finance_service.py` (702 lines), `backend/app/services/finance/accounting_profile_mapping_service.py` (793 lines), `backend/app/services/finance/export_batch_service.py` (553 lines), `backend/app/services/finance/read_model_service.py` (452 lines), `backend/app/services/finance/ledger_service.py`, `backend/app/services/accounting_template_service.py` (544 lines).
- Frontend feature dir: `frontend/src/features/finance/`.
- Key routes: `/admin/finance/dashboard`, `/admin/finance` (Close Day), `/superadmin/accounting-profiles`.
- Key endpoints: full `/api/finance/*` group (21 endpoints); plus booking-side commands `POST /api/golf/bookings/{booking_id}/post-charge`, `POST /api/golf/bookings/{booking_id}/record-payment`, `POST /api/golf/bookings/{booking_id}/post-refund`, `PATCH /api/golf/bookings/{booking_id}/payment-status`; plus superadmin accounting-profile endpoints (`POST /api/superadmin/accounting-profiles`, `POST /api/superadmin/accounting-profiles/parse-template`, `POST /api/superadmin/clubs/{club_id}/onboarding/finance/bind-profile`).
- Period bucketing: `SummaryWindow` dataclass at `backend/app/services/finance/read_model_service.py:47-53` retains day/week/month period semantics distinct from the cross-cutting `TimeWindow`.
- Notable surfaces: `frontend/src/pages/admin-finance-page.tsx` (869 lines, Close Day); `frontend/src/pages/admin-finance-dashboard-page.tsx`; `frontend/src/pages/superadmin-accounting-profiles-page.tsx` (667 lines).

### Orders & POS

- Backend services: `backend/app/services/order_service.py` (467 lines), `backend/app/services/order_settlement_service.py` (371 lines), `backend/app/services/order_finance_posting_service.py`, `backend/app/services/pos_service.py` (319 lines).
- Frontend feature dirs: `frontend/src/features/orders/`, `frontend/src/features/pos/`.
- Key routes: `/admin/orders`, `/admin/pos-terminal`, `/player/order`.
- Key endpoints: full `/api/orders/*` group (10), full `/api/pos/*` group (4).
- Notable surfaces: `frontend/src/pages/admin-order-queue-page.tsx` (523 lines), `frontend/src/pages/admin-pos-terminal-page.tsx` (364 lines), `frontend/src/features/orders/order-management-drawer.tsx` (455 lines).

### Communications

- Backend services: `backend/app/services/comms/news_post_service.py` (162 lines), `backend/app/services/comms/blast_service.py` (206 lines), `backend/app/services/comms/blast_read_model_service.py` (112 lines).
- Read model: `BlastReadModelService` (`backend/app/services/comms/blast_read_model_service.py:33-112`) exposes two methods — `summary` (`:37-80`, club-wide rollup by lifecycle state over an optional `TimeWindow`) and `list_recent` (`:82-112`, per-blast history ordered newest-first). Not yet consumed by any route at HEAD.
- Frontend feature dir: `frontend/src/features/comms/`.
- Key routes: `/admin/communications`.
- Key endpoints: full `/api/comms/*` group (9).
- Notable surfaces: `frontend/src/pages/admin-communications-page.tsx` (845 lines).

### Members

- Backend services: people-side services (above) plus account-customer support; member-stats / activity served by `backend/app/services/people_read_model_service.py` (259 lines).
- Read model: `PeopleReadModelService` (`backend/app/services/people_read_model_service.py:57-249`) exposes three methods — `summary` (`:63-123`, role × status × tenure-bucket counts plus `growth_this_month`), `member_activity` (`:127-141`, single-person rounds/spend/last-played over an optional `TimeWindow`), `list_member_activity` (`:143-163`, all-club fan-out of the same shape). Consumed by the `member_stats` semantic-layer metric (`backend/app/semantic/metrics/member_stats.py`); no route consumes it directly at HEAD.
- Frontend feature dir: covered via `frontend/src/features/people/`.
- Key routes: `/admin/members`, `/admin/people/dashboard`.
- Key endpoints: `GET /api/people/club-directory`, `POST /api/people/memberships`, `PATCH /api/people/memberships/{membership_id}`, `POST /api/people/account-customers`, `POST /api/people/bulk-intake/preview`, `POST /api/people/bulk-intake/process`, `GET /api/people/{person_id}/integrity`.
- Notable surfaces: `frontend/src/pages/admin-members-page.tsx` (1206 lines), `frontend/src/pages/admin-people-dashboard-page.tsx`.

### Halfway / Pro shop

- Backend services: `backend/app/services/halfway_service.py` (128 lines).
- Frontend feature dirs: no dedicated `features/halfway/` or `features/pro-shop/` directory.
- Key routes: `/admin/halfway`, `/admin/pro-shop`.
- Key endpoints: `GET /api/admin/halfway/summary`.
- Notable surfaces: `frontend/src/pages/admin-halfway-page.tsx` (332 lines), `frontend/src/pages/admin-pro-shop-page.tsx` (400 lines).

### Superadmin

- Backend services: `backend/app/services/superadmin_onboarding_service.py` (935 lines), `backend/app/services/accounting_template_service.py` (544 lines), `backend/app/services/platform_service.py` (285 lines), `backend/app/services/module_catalog.py`.
- Frontend feature dir: `frontend/src/features/superadmin/`.
- Key routes: `/superadmin/overview`, `/superadmin/clubs`, `/superadmin/accounting-profiles`.
- Key endpoints: full `/api/superadmin/*` group (16), plus `POST /api/platform/bootstrap`, `POST /api/platform/clubs`, `POST /api/platform/memberships`, `PUT /api/platform/clubs/{club_id}/modules`.
- Notable surfaces: `frontend/src/pages/superadmin-clubs-page.tsx` (1235 lines), `frontend/src/pages/superadmin-accounting-profiles-page.tsx` (667 lines), `frontend/src/pages/superadmin-overview-page.tsx`.

### Player

- Backend services: `backend/app/services/player_booking_read_model_service.py` (142 lines); player profile served via `backend/app/services/people_service.py` (`GET/PATCH /api/people/me/profile`).
- Frontend feature dir: `frontend/src/features/profile/`.
- Key routes: `/player/home`, `/player/book`, `/player/order`, `/player/profile`.
- Key endpoints: `GET /api/golf/bookings/player`, `GET /api/comms/feed`, `POST /api/golf/bookings` (with `source="member_portal"`), `GET /api/people/me/profile`, `PATCH /api/people/me/profile`, `POST /api/orders`.
- Notable surfaces: `frontend/src/pages/player-shell-page.tsx`, `frontend/src/pages/player-book-page.tsx`, `frontend/src/pages/player-order-page.tsx`, `frontend/src/pages/player-profile-page.tsx`, `frontend/src/pages/player-tab-items.ts`.

### Reporting & targets

- Backend services: `backend/app/services/admin_dashboard_service.py` (337 lines), `backend/app/services/reports_service.py` (150 lines), `backend/app/services/targets_service.py` (234 lines).
- Frontend feature dirs: `frontend/src/features/admin-dashboard/`, `frontend/src/features/targets/`.
- Key routes: `/admin/dashboard`, `/admin/reports`, `/admin/targets`.
- Key endpoints: `GET /api/admin/dashboard/summary`, `GET /api/admin/reports/summary`, full `/api/targets/*` group (5).
- Notable surfaces: `frontend/src/pages/admin-dashboard-page.tsx` (375 lines — "Live gross takings", "Members on course", "Next on the tee" still stubbed pending wiring to the semantic-layer KPIs + tee-sheet read-model), `frontend/src/pages/admin-reports-page.tsx` (608 lines), `frontend/src/pages/admin-targets-page.tsx`. Settings hub lives under "Identity & session" → `/admin/settings` (`admin-settings-hub-page.tsx`, 336 lines).

### Audit-log emission

- Canonical carrier: `EmissionContext` dataclass at `backend/app/events/emission_context.py:18-22` — three fields (`actor_user_id`, `source_channel`, `correlation_id`). Routes construct one per request and thread it into the emitting service method.
- Publisher: `DatabaseEventPublisher` at `backend/app/events/publisher.py:28-64` — writes `DomainEventRecord` rows via the session, enriching payload with `source_channel`, optional `actor_person_id`, `before` / `after` snapshots.
- Record model: `backend/app/models/domain_event_record.py` (table `domain_event_records`).
- Emission call sites: 43 `.publish(...)` invocations across 19 services — `booking_cancellation_service`, `booking_checkin_service`, `booking_completion_service`, `booking_finance_service` (×4), `booking_move_service`, `booking_no_show_service`, `booking_service`, `booking_update_service`, `finance/accounting_profile_mapping_service` (×3), `finance/export_batch_service` (×3), `finance/ledger_service`, `golf_settings_service` (×6), `order_finance_posting_service`, `order_service`, `order_settlement_service`, `people_service` (×5), `platform_service` (×4), `pos_service`, `superadmin_onboarding_service` (×6).
- Test helper: `assert_event_emitted` at `backend/tests/conftest.py:168` — asserts a `DomainEventRecord` matching `(entity_type, entity_id, action)` was emitted; preferred form takes `context=EmissionContext(...)`, legacy `actor_user_id` / `source_channel` kwargs still accepted as a transition shim.

### Time windows

- Canonical: `TimeWindow` dataclass at `backend/app/services/_window.py:27-34` — tenant-bound, tz-aware range with inclusive lower / exclusive upper local-date bounds and pre-computed UTC instants. Resolver `resolve_window` at `:37-62` defaults to "today" in the club's timezone. `optional_date` helper at `:65-75` coerces freeform `**params` to `date | None`.
- Consumed by: `PeopleReadModelService`, `BlastReadModelService`, and the semantic-layer metric modules.
- Parallel: `SummaryWindow` (`backend/app/services/finance/read_model_service.py:47-53`) is retained because finance summaries carry an explicit `period` enum (day/week/month) that the cross-cutting `TimeWindow` doesn't model.

### Semantic layer

Python metric registry — on-demand materialisation, no cache / no scheduler / no dbt at v1 (`backend/app/semantic/registry.py:33-44`).

- Registry: `backend/app/semantic/registry.py` (44 lines) — `register`, `get_metric`, `list_metrics`, `compute(name, session, club_id, **params)`.
- Contract: `Metric` Pydantic base at `backend/app/semantic/base.py:9-33` — `name`, `description`, `result_schema`, `version`, `owner`, `dependencies`, plus `compute(session, club_id, **params) → BaseModel`.
- Shared queries: `backend/app/semantic/_queries.py` (228 lines).
- v1 metrics (`backend/app/semantic/metrics/`, 6 modules):
  - `revpatt.py` (74 lines) — revenue per available tee time.
  - `revpur.py` (64 lines) — revenue per utilised round.
  - `effective_green_fee.py` (65 lines) — green fee net of discounts and refunds.
  - `fnb_per_round.py` (74 lines) — F&B spend per utilised round.
  - `weather_adjusted_utilisation.py` (45 lines) — stub; no weather data source at v1.
  - `member_stats.py` (69 lines) — thin delegation to `PeopleReadModelService`.

### Legal & compliance

- POPIA fields on `people` (`backend/app/models/person.py:33-36`): `consent_captured_at`, `consent_version`, `consent_source`. `ConsentSource` enum: `{onboarding, member_app, admin_capture, import}` (`backend/app/models/enums.py`).
- POPIA Information Officer on `clubs` (`backend/app/models/club.py:41-46`): `information_officer_person_id` (FK → `people.id`, `SET NULL`) + `information_officer_designated_at`. Service methods `designate_information_officer` / `clear_information_officer` on `backend/app/services/golf_settings_service.py` emit `information_officer.designated` / `.cleared` events. Service requires the target person to hold an active membership in the same club (`ConflictError("information_officer_membership_required")` otherwise).
- HNA Player ID on `people.hna_player_id` (`backend/app/models/person.py:36`) — global partial unique index `ix_people_hna_player_id_unique` (NULL rows excluded). PRODUCT.md §6 item 6: HNA Player ID is the canonical cross-club identifier.
- VAT category (§10(1)(cO)) at line-item level on three tables:
  - `bookings.vat_category` (`backend/app/models/booking.py:90`, default `green_fee`).
  - `order_items.vat_category` (`backend/app/models/order_item.py:34`, default `other`).
  - `pos_transaction_items.vat_category` (`backend/app/models/pos_transaction.py:97`, default `other`).
  - `VatCategory` six-value set: `{sub_fee, green_fee, fnb, non_member_income, pro_shop, other}` (`backend/app/models/enums.py`). FinanceTransaction is untagged by design: VAT lives on the originating record so the daily journal aggregates by JOIN.

## Parallel implementations (rebuild-burst carry-overs)

Per ENGINEERING_STANDARDS.md §3, the rebuild burst's subtraction discipline applies across the burst as a whole, not per commit. Three pre-rebuild artefacts remain in tree because un-rebuilt surfaces still consume them; later rebuild bursts delete them as the consuming pages rebuild against the new design system.

- `frontend/src/components/shell/AdminWorkspace.tsx` (55 lines) — content-area scaffold (title + KPIs + body) imported by **15** un-rebuilt admin pages: `admin-finance-page`, `admin-finance-dashboard-page`, `admin-golf-tee-sheet-page`, `admin-golf-dashboard-page`, `admin-golf-settings-page`, `admin-communications-page`, `admin-halfway-page`, `admin-members-page`, `admin-order-queue-page`, `admin-people-dashboard-page`, `admin-pos-terminal-page`, `admin-pro-shop-page`, `admin-reports-page`, `admin-settings-modules-page`, `admin-targets-page`. Phase 7 surfaces do NOT use it.
- `frontend/src/components/benchmark/material-symbol.tsx` (29 lines) — older `MaterialSymbol` icon component, imported by **31** files (un-rebuilt admin pages + a handful of features + superadmin chrome + player pages). Phase 7 surfaces use `frontend/src/components/ui/Icon.tsx` instead.
- `frontend/src/styles/app.css` (459 lines) — pre-rebuild Tailwind + custom CSS (`.auth-card`, `.admin-shell`, `.admin-card`, `.tee-sheet-slot-card`, etc.) consumed by un-rebuilt pages. `tokens.css` is imported ahead of it in `frontend/src/main.tsx:5-6` so the new system takes precedence within `.gl` scope. Phase 7 surfaces use only `--gl-*` tokens.

No new parallels emerged from the 9-series (which was backend-only).

## Known follow-ups (code-evidenced only)

- **Booking-finance two-commit pattern.** `booking_finance_service` methods (`post_charge`, `record_payment`, `post_refund`) call `ledger_service.create_transaction(...)` which commits the `FinanceTransaction` row before the parent booking-status commit. If the parent commit raises, the ledger row persists while the booking acknowledgement does not — money moves without booking state catching up. Evidence: `backend/app/services/booking_finance_service.py:111,295,464,609` (publish sites following an internal ledger commit) and `backend/app/services/finance/ledger_service.py` (internal commit). Fix needs a session-scoped flag on `LedgerService.create_transaction` so the inner commit is suppressed when called from a parent service.
- **Membership transition timestamps absent.** `ClubMembership` tracks current `status` only — no `lapsed_at` / `inactive_at` columns. `PeopleReadModelService.summary` surfaces `growth_this_month` from `joined_at` but omits `churn_this_month` because the transition date is not persisted. Evidence: `backend/app/models/club_membership.py` (no `*_at` transition columns); `backend/app/services/people_read_model_service.py:114-123` (`MemberStatsSummaryResponse` returned without `churn_this_month`). Two viable paths: add transition columns, or reconstruct the history from `DomainEventRecord` `club_membership.updated` events.
- **Member tier system gap.** `ClubMembership` has `ClubMembershipRole` only — no `tier` column. `PeopleReadModelService.summary` uses role as the "tier" proxy (`backend/app/services/people_read_model_service.py:74-101` — `by_role` reported alongside `by_status` / `by_tenure_bucket`). A real tier field on `ClubMembership` is a future phase.
- **`blast_service.py` `.query()` residuals.** Three SQLAlchemy 1.x `.query()` usages remain in `backend/app/services/comms/blast_service.py` (`send_blast` load by id+club; `_resolve_recipients` memberships + persons). Cosmetic; convert when comms is next touched.
- **`assert_event_emitted` legacy-kwarg shim.** Test helper at `backend/tests/conftest.py:168-203` accepts both `context=EmissionContext(...)` (canonical) and legacy `actor_user_id` / `source_channel` kwargs for backwards compatibility with inline assertions in ~14 pre-9B foundation test files. Convert and drop the shim as a discrete cleanup phase.
- **Tee-sheet read model lacks `next_action` / arrivals-due / unresolved flags.** Frontend derives them from raw booking state. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:896` (`// FROZEN — backend gap. … Replace when backend read model exposes computed flags …`).
- **Booking read model lacks finance eligibility flags.** Frontend derives `canPostCharge` / `canRecordPayment` / `canMarkComplimentary` / `canMarkWaived` / `canPostRefund` from `payment_status`. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:922` (`// FROZEN — backend gap. … Replace when backend read model exposes computed finance eligibility flags …`).
- **`staff_count` recomputation in tee sheet read model.** Frontend re-derives `party_summary.staff_count` locally; backend should be the source. Evidence: `frontend/src/features/tee-sheet/sheet-shared.tsx:1023-1027`.
- **Dashboard / settings stubs awaiting wiring.** `frontend/src/pages/admin-dashboard-page.tsx` "Live gross takings", "Members on course", "Next on the tee" cards and per-acquirer close-day rows are stubbed; `frontend/src/pages/admin-settings-hub-page.tsx` `Save changes` / `Discard` disabled pending `PUT /api/clubs/config` wiring; `frontend/src/pages/onboarding-popia-page.tsx`, `onboarding-welcome-page.tsx`, `onboarding-completion-page.tsx` POPIA consent + IO designation + "Save & exit" persist nowhere yet (the 9A schema is in place; frontend wiring pending). `frontend/src/components/admin-shell/AdminSidebar.tsx` `Bookings` / `Member ledger` / `Audit log` / `Handicaps` / `Competitions` nav items render as `aria-disabled` placeholders.

## What is NOT here

- **No `/admin/golf/bookings` dedicated booking-management page.** Not registered in `frontend/src/routes/router.tsx`; no file `frontend/src/pages/admin-golf-bookings-page.tsx`.
- **No `/api/golf/bookings/{id}/move-participant` endpoint.** Participant-level moves go through the single `POST /api/golf/bookings/{booking_id}/move` endpoint with an optional `participant_id` body field (`backend/app/schemas/bookings.py:353`).
- **No routes consume `PeopleReadModelService` or `BlastReadModelService` yet.** Both stand up tenant-scoped read methods (member stats; blast rollup) but no `/api/people/...` or `/api/comms/...` endpoint reads them at HEAD.
- **No app container in `docker-compose.yml`.** Only `postgres` and `redis` are declared (`docker-compose.yml:1-31`); backend and frontend run on the host.
- **No backend mypy/pyright config.** `backend/pyproject.toml:22-27` lists only `httpx`, `pytest`, `pytest-asyncio`, `ruff` in `[project.optional-dependencies].dev`.
- **No `/api/orders` settlement endpoint distinct from `record-payment`.** Order settlement is exposed as `POST /api/orders/{order_id}/record-payment` (`backend/app/api/orders/routes.py:239`); there is no separate `/settle` route.
- **No CI step for `npm run build`.** `.github/workflows/ci.yml:38-49` runs install, lint, typecheck, and test only; build is not invoked.
