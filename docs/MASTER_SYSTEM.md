# GreenLink - Master System File

Last updated: 2026-04-06 11:20 SAST

## Canonical Role

This file is the canonical current system definition.

The canonical authority set is:
- `docs/MASTER_SYSTEM.md`
- `GreenLink-Master-Build-Plan.txt`
- `CODEX-EXECUTION-RULES.txt`
- `SYSTEM_STATUS.md`

## Non-Negotiable Rules

- Backend owns logic.
- Frontend sends intent only.
- No duplicated business rules.
- No hidden side effects.
- No domain mixing.
- Tee sheet is a read model.
- Orders are not payments.
- Admin and superadmin shells are router-owned persistent layouts.
- Benchmark UI references remain the visual authority.

## Current System Definition

### Platform and auth
- Completed
- FastAPI backend with PostgreSQL runtime is in place.
- JWT access tokens plus refresh-token rotation are in place.
- `/api/session/bootstrap` remains the frontend bootstrap truth.
- Club-scoped tenancy is enforced through auth plus selected-club resolution.

### Identity and membership
- Completed
- User -> Person -> ClubMembership is the working identity model.
- People directory, membership, account-customer, and bulk-intake foundations are built.

### TS - Tee Sheet
- Partial
- Tee sheet read model exists.
- Booking lifecycle and admin lifecycle actions are live.
- Admin tee-sheet route is live.
- Booking creation/editing UX is not built.
- Recently fixed: admin tee-sheet now runs inside the router-owned persistent admin shell.

### FIN - Finance
- Partial
- FinanceAccount, append-only FinanceTransaction, journal, ledger, revenue summary, outstanding summary, and transaction-volume summary are built.
- Revenue summary items now carry `revenue_share_pct`; transaction-volume items carry `volume_share_pct`; outstanding summary carries `accounts_in_arrears_pct`, `accounts_in_credit_pct`, and `accounts_settled_pct`, all computed backend-side.
- Canonical export batches and mapped accounting export profiles are built.
- No external accounting sync, reconciliation engine, or package-specific validation layer exists.
- Admin finance KPI surfaces (`admin-dashboard`, `admin-finance`, `admin-reports`, `admin-members`, `admin-halfway`) use backend summary endpoints only. No finance math in React.
- `AdminReportsPage` chart bar widths are driven entirely by backend-provided pct fields.

### Orders and POS
- Partial
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, and POS terminal are live.
- POS terminal (`/admin/pos-terminal`) is nested inside the router-owned `AdminLayout` alongside all other `/admin/*` routes. It renders no standalone navigation chrome.

### Communications
- Partial
- Admin news-post CRUD exists.
- Published posts are available to player-facing read flows.
- Player home reads backend news posts.

### SA - Superadmin
- Partial
- Distinct superadmin route group and persistent shell exist.
- Onboarding progression is backend-owned. Frontend sends step intent only; backend validates transitions.
- Club registry, club creation, and onboarding workspace (Basic Info, Finance, Rules, Modules) are live.
- Rules and Modules steps are readiness scaffolds, not full configuration surfaces.
- Superadmin nav has two live routes: Overview (`/superadmin/overview`) and Clubs (`/superadmin/clubs`).
- Overview page: fleet KPIs, finance-readiness and team-assignment progress bars, needs-attention list, and clubs table, all derived from the club list endpoint.
- Overview action items and club rows route into the targeted club detail using the clubs page with a `clubId` query parameter.
- Club management: superadmin can pause (`PATCH /clubs/{id}/status`), reactivate, or permanently delete (`DELETE /clubs/{id}`) any non-live club. Delete is blocked for live clubs with a 409.
- Superadmin can bridge into existing club-scoped admin workspaces after selecting a club:
  - Finance step -> `/admin/finance`
  - Rules step -> `/admin/golf/settings`
  - Modules preview -> `/admin/dashboard`
- `ProtectedRoute` allows that superadmin-to-admin bridge only when a selected club exists.
- Default superadmin redirect is `/superadmin/overview`.

### Player
- Partial
- Player home, player ordering, and member booking creation are live.
- Player booking flow uses the live tee-sheet read model plus `POST /api/golf/bookings` with `source="member_portal"`.
- No player booking history or member-booking read model exists yet.
- Player profile route is not built.
- Recently fixed: player home no longer shows fake upcoming bookings; it now shows an honest empty state until a backend member-booking read model exists.

## Current Route Surface

### Admin
- `/admin/dashboard`
- `/admin/golf/tee-sheet`
- `/admin/golf/settings`
- `/admin/orders`
- `/admin/members`
- `/admin/finance`
- `/admin/communications`
- `/admin/halfway`
- `/admin/pro-shop`
- `/admin/reports`
- `/admin/pos-terminal`

### Superadmin
- `/superadmin/overview`
- `/superadmin/clubs`

### Player
- `/player/home`
- `/player/book`
- `/player/order`

Not built:
- `/player/profile`

## Layout and UI Authority

- Admin shell is router-owned and persistent across `/admin/*` workspace navigation.
- Superadmin shell is router-owned and persistent across `/superadmin/*` workspace navigation.
- `ProtectedRoute` wraps the layout, not individual admin or superadmin pages.
- Admin and superadmin pages render content areas only.
- Benchmark references remain:
  - `frontend/src/ui-benchmarks/`
  - `frontend/src/design-system/greenlink-design-system.md`

## Known Gaps

- Tee-sheet booking creation and editing UX is not built.
- Golf settings remains visually older than the normalized admin workspaces.
- Rules and Modules onboarding steps are not complete configuration surfaces.
- No player booking history or member-booking read model exists yet.
- No external accounting sync or reconciliation engine exists.
- Superadmin invitation/provisioning workflow is not built.
- Player profile route is not built.

## Known Risks

- Local development can drift if frontend API base and backend CORS origins are mismatched between `localhost` and `127.0.0.1`.
- Some non-finance reporting visuals (order status breakdown, member breakdown) still compose charts in the frontend from backend records; a dedicated reporting aggregation slice does not exist yet.

## Validation State

Latest validation:
- `frontend`: `npm.cmd run typecheck` - passes clean
- `frontend`: targeted Vitest suites for shell persistence, route protection, finance pages, player home, and superadmin onboarding
- `backend`: `py -m uv run pytest -q` - full suite
- `backend`: `py -m uv run ruff check .` - passes (pre-existing E501 violations in superadmin service are not introduced by this session)

## Final Rule

If code and older notes disagree, code wins first and this file must be updated immediately after.
