# GreenLink - Master System File

Last updated: 2026-04-13

## Canonical Role

This file is the canonical current system definition.
It reflects the locked completed baseline and the approved direction of the GreenLink hardening program.

The canonical authority set is:
- `docs/MASTER_SYSTEM.md`
- `GreenLink-Master-Build-Plan.txt`
- `CODEX-EXECUTION-RULES.txt`
- `SYSTEM_STATUS.md`

## Product Definition

GreenLink is a multi-sport club operations OS.

GreenLink is not:
- a POS-first tool
- an accounting software replacement
- a disconnected dashboard bundle
- an admin panel with club features bolted on

GreenLink is:
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
- `User -> Person -> ClubMembership` is the working identity model.
- People directory, membership, account-customer, and bulk-intake foundations are built.
- GL-07 cleaned up members workspace ownership without changing backend authority.

### TS - Tee Sheet

- Partial
- Tee sheet read model exists.
- Booking lifecycle and admin lifecycle actions are live.
- Admin tee-sheet route is live inside the router-owned persistent admin shell.
- Booking creation, editing, and move UX are live.
- Participant-level booking move is live.
- Inline quick actions, bucket check-in-all, keyboard shortcuts, and focus-trapped drawers are live.
- Timeline swimlane layout is live alongside the classic tee-sheet table and consumes the same read model and mutation flows.
- `AdminGolfDashboardPage` at `/admin/golf/dashboard` is live for utilization, revenue posture, tee warnings, and config readiness.

### FIN - Finance

- Partial
- FinanceAccount, append-only FinanceTransaction, journal, ledger, revenue summary, outstanding summary, and transaction-volume summary are built.
- Revenue/volume/account-share pct fields are computed backend-side.
- Canonical export batches and mapped accounting export profiles are built.
- Mapped export execution, reconciliation, drift detection, and regeneration are backend-owned.
- Admin finance KPI surfaces use backend summary endpoints only. No finance math remains in React.
- `AdminFinanceDashboardPage` at `/admin/finance/dashboard` is live from backend read models.
- Booking finance commands are live through backend-owned golf booking endpoints:
  - `PATCH /api/golf/bookings/{booking_id}/payment-status`
  - `POST /api/golf/bookings/{booking_id}/post-charge`
  - `POST /api/golf/bookings/{booking_id}/record-payment`

### Orders and POS

- Partial
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, and POS terminal are live.
- GL-06 normalized order and halfway mutation ownership and invalidation around shared hooks.
- POS terminal (`/admin/pos-terminal`) is nested inside the router-owned `AdminLayout`.
- These surfaces remain operational extensions, not primary system pillars.

### Communications

- Partial
- Admin news-post CRUD exists.
- Published posts are available to player-facing read flows.
- Player home reads backend news posts.

### SA - Superadmin

- Partial
- Distinct superadmin route group and persistent shell exist.
- Onboarding progression is backend-owned. Frontend sends step intent only.
- Club registry, club creation, and onboarding workspace (Basic Info, Finance, Rules, Modules) are live.
- Rules step reads real club-scoped rule sets and pricing matrices.
- Modules step reads the canonical backend module catalog and persists validated club module configuration.
- Superadmin nav has three live routes:
  - Overview (`/superadmin/overview`)
  - Clubs (`/superadmin/clubs`)
  - Accounting Profiles (`/superadmin/accounting-profiles`)
- Runtime superadmin landing is `/superadmin/clubs`.
- Superadmin can bridge into existing club-scoped admin workspaces after selecting a club.

### Player

- Partial
- Player home, player ordering, and member booking creation are live.
- Player booking flow uses the live tee-sheet read model plus `POST /api/golf/bookings` with `source="member_portal"`.
- Backend player booking read model exists and player home consumes it directly.
- `/player/profile` consumes a dedicated backend self-profile contract.
- Recently fixed:
  - player home no longer mounts a blocking full-screen scrim on initial load
  - player order creation now succeeds against the live backend after enum binding alignment

## Admin Navigation - Current Baseline

Superseding note as of 2026-04-13:
- Primary admin navigation is lifecycle-weighted: Today · Tee Sheet · People · Finance · Performance · Operations · Settings.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the shell/access contract.
- `AdminSidebar` is the visible primary-nav contract and may intentionally hide valid direct-link admin routes that remain in bootstrap `menu_items` for access control.
- Access-only admin routes currently include `/admin/targets`.

Current implementation baseline:
- `AdminSidebar` is lifecycle-weighted with collapsible groups.
- Ungrouped (always visible): Today (`/admin/dashboard`), Settings (`/admin/settings`).
- Golf group (collapsible): Golf Summary, Tee Sheet.
- People group (collapsible): People Summary, Members.
- Finance group (collapsible): Finance Summary, Close Day.
- My Club group (collapsible): Performance, Communications.
- Operations group (collapsible): Halfway, Pro Shop, POS Terminal, Order Queue.
- Groups start open when the current route falls within them and can be toggled closed.
- Group membership is driven by `PRIMARY_NAV_GROUPS` against backend-provided or fallback `menu_items`.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` remains the canonical nav registry.
- Access-only key `targets` is filtered from the sidebar but retained in bootstrap for `ProtectedRoute` access enforcement.
- `pos` is labeled `Commerce` in the module catalog.

## Approved Hardening Direction

Target admin information architecture should trend toward:

- Today
- Tee Sheet
- People
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
- PR1-PR9 are landed and live.
- Cleanup slices GL-01 through GL-07 are landed in code and targeted validation.
- GL-08 is the next protected slice: Golf Settings and Finance Close-Day ownership cleanup.

## Current Route Surface

Superseding route naming note as of 2026-04-13:
- `/admin/dashboard` is the Today workspace.
- Legacy `/admin/select-club` redirects to canonical `/select-club`.
- `/admin/golf/dashboard` and `/admin/finance/dashboard` remain visible summary routes in grouped admin navigation.
- `/admin/people/dashboard` is the canonical People Summary route and is shown in the People sidebar group.
- `/admin/reports` is the Performance hub.
- `/admin/settings/profile` is a legacy route redirected into `/admin/settings`.

### Admin

- `/admin/dashboard` - overview: action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` - golf domain dashboard
- `/admin/golf/tee-sheet` - operational tee sheet
- `/admin/golf/settings` - guided golf settings setup
- `/admin/people/dashboard` - people summary dashboard
- `/admin/members` - member directory and operational member management
- `/admin/finance/dashboard` - finance summary dashboard
- `/admin/finance` - close-day workflow
- `/admin/reports` - reports and analytics
- `/admin/halfway` - halfway house operations
- `/admin/pro-shop` - pro shop
- `/admin/pos-terminal` - POS terminal
- `/admin/orders` - order queue
- `/admin/settings` - settings hub
- `/admin/settings/club` - legacy settings entry route redirected to `/admin/settings`
- `/admin/settings/profile` - legacy redirect to `/admin/settings`
- `/admin/settings/modules` - read-only module visibility
- `/admin/communications` - news posts and communications
- `/admin/targets` - club targets

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

- Admin shell is router-owned and persistent across `/admin/*` navigation.
- Superadmin shell is router-owned and persistent across `/superadmin/*` navigation.
- `ProtectedRoute` wraps the layout, not individual admin or superadmin pages.
- Admin and superadmin pages render content areas only.
- Benchmark references remain:
  - `frontend/src/ui-benchmarks/`
  - `frontend/src/design-system/greenlink-design-system.md`

## Current Validation Posture

- Frontend typecheck is currently green.
- Targeted Vitest is green for completed cleanup slices and follow-up fixes.
- Backend targeted pytest is green for targets, finance read models, and order foundation after the recent migration/enum fixes.
- Full-suite recertification should happen again after GL-08 and before protected-surface work proceeds further.
