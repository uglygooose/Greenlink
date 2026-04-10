# GreenLink - Master System File

Last updated: 2026-04-10

## Canonical Role

This file is the canonical current system definition.
It reflects the locked completed baseline and the approved direction of the GreenLink UX Rebuild.

The canonical authority set is:
- `docs/MASTER_SYSTEM.md`
- `GreenLink-Master-Build-Plan.txt`
- `CODEX-EXECUTION-RULES.txt`
- `SYSTEM_STATUS.md`

## Product Definition

GreenLink is a multi-sport club operations OS.

GreenLink is NOT:
- a POS-first tool
- an accounting software replacement
- a disconnected dashboard bundle
- an admin panel with club features bolted on

GreenLink IS:
- a day-to-day operational system for clubs
- centered on tee-sheet-style operational control
- paired with finance operations that reconcile into the club's accounting software
- extensible across golf, tennis, bowls, pro shop, halfway house, and related club domains without losing a coherent system model

## Core Operating Lifecycle

All UX and information architecture should align to this lifecycle:

1. Setup (Superadmin)
2. Configure (Club Admin within controlled authority)
3. Operate (Staff / Club Admin through operational surfaces)
4. Close Day (Finance reconciliation and export)
5. Report and Improve (targets, performance, trends, interventions)

Lifecycle weighting takes precedence over domain grouping in UX structure.

## Non-Negotiable Rules

- Backend owns logic.
- Frontend sends intent only.
- No duplicated business rules.
- No hidden side effects.
- No domain mixing at data/service boundaries.
- Tee sheet is a read model.
- Orders are not payments.
- Admin and superadmin shells are router-owned persistent layouts.
- Benchmark UI references remain the visual authority.

## Product Hierarchy

### Tier 1 - Core system pillars
- Tee Sheet / operational booking control
- Finance operations and export-to-accounting
- Members / accounts / club people operations
- Reporting, targets, and performance review

### Tier 2 - Operational extensions
- Pro Shop
- Halfway House
- Tennis
- Bowls

### Tier 3 - Add-on / adjunct surfaces
- POS
- Orders
- Communications

Tier 2 and Tier 3 surfaces may be important for some clubs, but must not outweigh or structurally distort Tier 1.

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
- Participant-level booking move is live: a single participant can be extracted from a multi-participant booking (splitting it) and moved independently; backend validates participant ownership and splits the source booking when needed.
- Inline chip quick actions, per-time-bucket bulk check-in, create/edit cart-caddie toggles, keyboard shortcuts, and focus-trapped drawers are live.
- Timeline swimlane layout is live alongside the classic tee-sheet table; both layouts consume the same tee-sheet read model and existing mutation flows, and the frontend-only layout/density preference is stored in localStorage.
- `feature_flags.ux_rebuild_v1` is still emitted by the backend and gates the tee-sheet cockpit shell (operate header, presets, reduced filter controls). PR1–PR8 rebuild work has been committed and the flag now scopes only remaining tee-sheet-specific cockpit gating:
  - Today-first admin navigation and shell weighting — landed and unconditional
  - Finance actions inside the booking drawer — landed and unconditional
  - Settings hub at `/admin/settings` with single Settings nav entry and read-only module visibility — landed and unconditional
  - Guided golf settings setup with readiness, section locking, draft/live publish, rollback — landed and unconditional
  - Finance Close Day wizard — landed and unconditional (PR7)
  - Performance hub at `/admin/reports` — landed and unconditional (PR8)
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
- Booking finance commands are now live through backend-owned golf booking endpoints:
  - `PATCH /api/golf/bookings/{booking_id}/payment-status`
  - `POST /api/golf/bookings/{booking_id}/post-charge`
  - `POST /api/golf/bookings/{booking_id}/record-payment`
- These commands are tenant-scoped, RBAC-protected, and surfaced in the feature-flagged tee-sheet booking drawer only.
- No direct third-party push/pull accounting integration exists beyond tracked export handoff.

### Orders and POS
- Partial
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, and POS terminal are live.
- `AdminOrderQueuePage` now uses the normalized `AdminWorkspace` shell/content pattern.
- `AdminGolfSettingsPage` and `AdminPosTerminalPage` now use the normalized `AdminWorkspace` shell/content pattern.
- POS terminal (`/admin/pos-terminal`) is nested inside the router-owned `AdminLayout` alongside all other `/admin/*` routes. It renders no standalone navigation chrome.
- These surfaces are operational extensions and not primary system pillars.

### Communications
- Partial
- Admin news-post CRUD exists.
- Published posts are available to player-facing read flows.
- Player home reads backend news posts.
- Communications remains secondary to the core operational lifecycle.

### SA - Superadmin
- Partial
- Distinct superadmin route group and persistent shell exist.
- Onboarding progression is backend-owned. Frontend sends step intent only; backend validates transitions.
- Club registry, club creation, and onboarding workspace (Basic Info, Finance, Rules, Modules) are live.
- Rules step reads real club-scoped rule sets and pricing matrices, including active counts and per-record summaries.
- Modules step reads the canonical backend module catalog and persists validated club module configuration.
- Superadmin nav has three live routes: Overview (`/superadmin/overview`), Clubs (`/superadmin/clubs`), and Accounting Profiles (`/superadmin/accounting-profiles`).
- Overview page: fleet KPIs, finance-readiness and team-assignment progress bars, needs-attention list, and clubs table, all derived from the club list endpoint.
- Overview action items and club rows route into the targeted club detail using the clubs page with a `clubId` query parameter.
- Club management: superadmin can pause (`PATCH /clubs/{id}/status`), reactivate, or permanently delete (`DELETE /clubs/{id}`) any non-live club. Delete is blocked for live clubs with a 409.
- Accounting Profiles page (`/superadmin/accounting-profiles`): fleet-level view and management of accounting export profiles across clubs.
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

## Admin Navigation - Current Baseline

Superseding note as of 2026-04-10:
- Primary admin navigation is lifecycle-weighted: Today · Tee Sheet · Members · Finance · Performance · Operations · Settings.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the shell/access contract.
- `AdminSidebar` is the visible primary-nav contract and may intentionally hide valid direct-link admin routes that remain in bootstrap `menu_items` for access control.
- Access-only admin routes currently include `/admin/golf/dashboard`, `/admin/people/dashboard`, `/admin/finance/dashboard`, and `/admin/targets`.

Current implementation baseline:
- `AdminSidebar` is lifecycle-weighted with collapsible groups.
- Ungrouped (always visible): Today (`/admin/dashboard`), Members (`/admin/members`), Settings (`/admin/settings`).
- Golf group (collapsible): Golf Summary, Tee Sheet.
- Finance group (collapsible): Finance Summary, Close Day.
- My Club group (collapsible): Performance, Communications.
- Operations group (collapsible): Halfway, Pro Shop, POS Terminal, Order Queue.
- Groups start open when the current route falls within them; they can be toggled closed.
- Group membership is driven by `PRIMARY_NAV_GROUPS` against backend-provided or fallback `menu_items`. Ungrouped items render below without a label.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the canonical nav registry. Frontend sidebar resolves against it.
- Access-only keys (`people_dashboard`, `targets`) are filtered from the sidebar but retained in bootstrap for `ProtectedRoute` access enforcement.
- `pos` module is now labeled "Commerce" in the module catalog.

## Approved UX Rebuild Direction

Target admin information architecture should trend toward:

- Today
- Tee Sheet
- Members
- Finance
- Performance
- Operations (conditional)
- Settings

Optional module grouping appears only when required by enabled modules.

The approved direction is:
- workflow-weighted navigation
- module demotion for non-core surfaces
- tee sheet as operational cockpit
- finance as close-day and accounting-handoff engine
- settings as structured configuration journey, not a monolithic CRUD/admin page

Current landing status:
- PR1–PR9 are landed. PR7 (Finance Close Day), PR8 (Performance hub), PR9 (Superadmin Accounting Profiles) are unconditional.
- UX rebuild cleanup slices 1–4 are landed: route truth fixes, settings consolidation, admin IA lifecycle reset, dead `ux_rebuild_v1` branch removal from sidebar/dashboard.
- `feature_flags.ux_rebuild_v1` remains in backend bootstrap and gates tee-sheet cockpit shell specifics only. All other rebuilt surfaces are unconditional.

## Current Route Surface

Superseding route naming note as of 2026-04-10:
- `/admin/dashboard` is the Today workspace.
- `/admin/golf/dashboard`, `/admin/people/dashboard`, and `/admin/finance/dashboard` are retained summary routes, not primary-nav destinations.
- `/admin/reports` is the Performance hub.
- `/admin/settings/profile` is a legacy route redirected into `/admin/settings`.

### Admin
- `/admin/dashboard` — overview: action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` — golf domain dashboard (utilization, revenue, warnings, config readiness)
- `/admin/golf/tee-sheet` — operational tee sheet (create/edit/move/cancel bookings)
- `/admin/golf/settings` — guided golf settings setup (courses, tees, rules, pricing with draft/live control)
- `/admin/people/dashboard` — people domain dashboard (member breakdown, account posture)
- `/admin/members` — member directory
- `/admin/finance/dashboard` — finance domain dashboard (revenue, outstanding, volume, export batches)
- `/admin/finance` — close-day workflow (export batches, reconciliation)
- `/admin/reports` — reports and analytics
- `/admin/halfway` — halfway house operations
- `/admin/pro-shop` — pro shop
- `/admin/pos-terminal` — POS terminal
- `/admin/orders` — order queue
- `/admin/settings` — settings hub
- `/admin/settings/club` — legacy settings entry route; unconditional redirect to `/admin/settings`
- `/admin/settings/profile` — club profile settings
- `/admin/settings/modules` — read-only module visibility
- `/admin/communications` — news posts and comms
- `/admin/targets` — club targets

### Superadmin
- `/superadmin/overview`
- `/superadmin/clubs`
- `/superadmin/accounting-profiles`

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

## UX Rebuild Principles

The UX rebuild exists to remove:
- dead weight
- duplicate or misleading surfaces
- domain-grouped navigation that obscures operational flow
- weak setup/configuration journeys
- add-on surfaces that dominate the product hierarchy
- logic that forces users to think like internal builders instead of club operators

The rebuild must preserve:
- backend ownership of logic
- canonical read models
- finance calculation boundaries
- routing/shell correctness
- tenant safety
- validated live functionality that remains useful under the new structure

## Forward Plan

Phases 11–17 are planned and partially in progress. See `GreenLink-Master-Build-Plan.txt` for full slice detail.
Phase 18 (UX Rebuild) is in progress: PR1–PR9 and cleanup slices 1–4 are landed. Remaining rebuild work continues in controlled slices.

## Final Rule

If code and older notes disagree, code wins first and this file must be updated immediately after.
If current UX structure disagrees with the approved GreenLink direction, the UX must be rebuilt in controlled slices without violating backend/system constraints.
