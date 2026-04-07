# GreenLink - Master System File

Last updated: 2026-04-07 (end of Phase 10)

## Canonical Role

This file is the canonical current system definition.
It reflects the locked completed baseline and is not used as a running work log.

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
- Admin tee-sheet route is live inside the router-owned persistent admin shell.
- Booking creation, editing, and move UX are live.
- `AdminGolfDashboardPage` at `/admin/golf/dashboard` is live: golf utilization KPIs, revenue posture, tee warnings, config readiness (courses, tees, rulesets, pricing matrices), primary golf actions.

### FIN - Finance
- Partial
- FinanceAccount, append-only FinanceTransaction, journal, ledger, revenue summary, outstanding summary, and transaction-volume summary are built.
- Revenue summary items now carry `revenue_share_pct`; transaction-volume items carry `volume_share_pct`; outstanding summary carries `accounts_in_arrears_pct`, `accounts_in_credit_pct`, and `accounts_settled_pct`, all computed backend-side.
- Canonical export batches and mapped accounting export profiles are built.
- Mapped export execution is backend-owned and tracked on canonical batches.
- Package-specific validation is live for `generic_journal`, `pastel_like`, and `sage_like`.
- Batch reconciliation is live and compares persisted canonical payloads against current live finance state.
- Drift blocks mapped export until reconciliation is resolved.
- Reconciliation-driven regeneration creates fresh canonical batches with typed supersede/regeneration lineage.
- Admin finance KPI surfaces (`admin-dashboard`, `admin-finance`, `admin-reports`, `admin-members`, `admin-halfway`, `admin-finance/dashboard`) use backend summary endpoints only. No finance math in React.
- `AdminReportsPage` chart bar widths are driven entirely by backend-provided pct fields.
- `AdminFinanceDashboardPage` at `/admin/finance/dashboard` is live: revenue, outstanding, transaction volume, and export batch status — all from backend read models.
- No direct third-party push/pull accounting integration exists beyond tracked export handoff.

### Orders and POS
- Partial
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, and POS terminal are live.
- `AdminOrderQueuePage` now uses the normalized `AdminWorkspace` shell/content pattern.
- `AdminGolfSettingsPage` and `AdminPosTerminalPage` now use the normalized `AdminWorkspace` shell/content pattern.
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
- Rules step reads real club-scoped rule sets and pricing matrices, including active counts and per-record summaries.
- Modules step reads the canonical backend module catalog and persists validated club module configuration.
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
- Backend player booking read model exists and the player home upcoming/history surfaces consume it directly.
- Player profile route exists at `/player/profile` and consumes a dedicated backend self-profile contract.
- Recently fixed: player home no longer shows fake upcoming bookings; it now renders backend booking truth when present and truthful empty states when none exist.

## Admin Navigation

- `AdminSidebar` is grouped by domain section: Overview · Golf · People · Finance · Operations · Communications · Club Settings.
- Group membership is driven by `PRIMARY_NAV_GROUPS` against backend-provided or fallback `menu_items`. Ungrouped items render below without a label.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the canonical nav registry. Frontend sidebar resolves against it.
- `pos` module is now labeled "Commerce" in the module catalog.

## Current Route Surface

### Admin
- `/admin/dashboard` — overview: action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` — golf domain dashboard (utilization, revenue, warnings, config readiness)
- `/admin/golf/tee-sheet` — operational tee sheet (create/edit/move/cancel bookings)
- `/admin/golf/settings` — golf settings (courses, tees, rule sets, pricing matrices)
- `/admin/people/dashboard` — people domain dashboard (member breakdown, account posture)
- `/admin/members` — member directory
- `/admin/finance/dashboard` — finance domain dashboard (revenue, outstanding, volume, export batches)
- `/admin/finance` — close-day workflow (export batches, reconciliation)
- `/admin/reports` — reports and analytics
- `/admin/halfway` — halfway house operations
- `/admin/pro-shop` — pro shop
- `/admin/pos-terminal` — POS terminal
- `/admin/orders` — order queue
- `/admin/settings/club` — club settings hub
- `/admin/communications` — news posts and comms
- `/admin/targets` — club targets

### Superadmin
- `/superadmin/overview`
- `/superadmin/clubs`

### Player
- `/player/home`
- `/player/book`
- `/player/order`
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

- Superadmin does not author golf rules or pricing directly; canonical authoring remains in admin golf settings.
- No direct third-party push/pull accounting sync exists beyond tracked export handoff.
- New domain dashboard pages (`AdminGolfDashboardPage`, `AdminPeopleDashboardPage`, `AdminFinanceDashboardPage`, `AdminClubSettingsPage`) have no Vitest coverage yet.

## Known Risks

- Local development can drift if frontend API base and backend CORS origins are mismatched between `localhost` and `127.0.0.1`.
- Some non-finance reporting visuals (order status breakdown, member breakdown) still compose charts in the frontend from backend records; a dedicated reporting aggregation slice does not exist yet.

## Validation State

Latest validation:
- `frontend`: `npm.cmd run typecheck` - passes clean
- `frontend`: `npm.cmd run test` - passes
- `backend`: `py -m uv run pytest -vv -s` - passes (`154 passed` in about `10m30s`)
- `frontend`: targeted Vitest `src/pages/superadmin-clubs-page.test.tsx` - passes
- `frontend`: targeted Vitest `src/pages/admin-dashboard-page.test.tsx` - passes
- `frontend`: targeted Vitest `src/pages/player-shell-page.test.tsx` - passes
- `frontend`: targeted Vitest `src/pages/player-profile-page.test.tsx` - passes
- `frontend`: targeted Vitest `src/pages/invitation-accept-page.test.tsx` - passes
- `frontend`: targeted Vitest `src/session/session-provider.test.tsx` - passes
- `backend`: targeted pytest `backend/tests/test_superadmin_onboarding_foundation.py` - passes
- `backend`: targeted pytest `backend/tests/test_auth_and_bootstrap.py` - passes
- `backend`: targeted pytest `backend/tests/test_player_booking_read_model.py` - passes
- `backend`: targeted pytest `backend/tests/test_player_profile.py` - passes
- `backend`: targeted pytest `backend/tests/test_superadmin_invitations.py` - passes
- `backend`: targeted pytest `backend/tests/test_invitation_acceptance.py` - passes
- `backend`: targeted pytest `backend/tests/test_auth_and_bootstrap.py` for additive `menu_items` contract - passes
- `backend`: targeted pytest `backend/tests/test_targets.py` - passes
- `backend`: `py -m uv run pytest -q` - passes

## Final Rule

If code and older notes disagree, code wins first and this file must be updated immediately after.
