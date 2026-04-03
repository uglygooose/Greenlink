# GreenLink - Master System File

Last updated: 2026-04-03 11:23 SAST

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
- Canonical export batches and mapped accounting export profiles are built.
- No external accounting sync, reconciliation engine, or package-specific validation layer exists.
- Recently fixed:
  - admin and finance KPI surfaces no longer compute finance totals in React
  - `admin-dashboard`, `admin-finance`, `admin-reports`, `admin-members`, and `admin-halfway` now display backend summary values only for finance KPIs
  - unsupported finance visuals were removed instead of recreated in React

### Orders and POS
- Partial
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, and POS terminal are live.
- POS terminal is nested inside the router-owned AdminLayout and renders no standalone navigation chrome of its own.

### Communications
- Partial
- Admin news-post CRUD exists.
- Published posts are available to player-facing read flows.
- Player home reads backend news posts.

### SA - Superadmin
- Partial
- Distinct superadmin route group and shell exist.
- Club registry and club creation exist.
- Onboarding workspace exists for Basic Info, Finance, Rules, and Modules.
- Rules and Modules remain readiness scaffolds, not full configuration surfaces.
- Recently fixed:
  - onboarding progression is backend-owned
  - frontend no longer sets arbitrary current, next, or previous steps
  - backend validates transitions and returns the resulting onboarding state

### Player
- Partial
- Player home and player ordering are live.
- Player booking flow is not built.
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
- `/superadmin/clubs`

### Player
- `/player/home`
- `/player/order`

Not built:
- `/player/book`
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
- Rules and Modules onboarding steps are not complete configuration UIs.
- No player booking read model exists yet.
- No external accounting sync or reconciliation engine exists.

## Known Risks

- Login still hard-navigates superadmin users to `/admin/select-club` before route protection corrects them to `/superadmin/clubs`.
- Local development can drift if frontend API base and backend CORS origins are mismatched between `localhost` and `127.0.0.1`.
- Some reporting views still compose non-finance operational charts in the frontend from backend records because no dedicated reporting slice exists yet.

## Validation State

Latest correction-pass validation:
- `frontend`: `npm.cmd run typecheck`
- `frontend`: targeted Vitest suites for shell persistence, finance pages, player home, and superadmin onboarding
- `backend`: `py -m uv run pytest backend/tests/test_superadmin_onboarding_foundation.py -q`

## Final Rule

If code and older notes disagree, code wins first and this file must be updated immediately after.
