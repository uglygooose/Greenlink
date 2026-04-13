# GreenLink System Status

Last updated: 2026-04-13

## Canonical Snapshot Role

This file is the canonical current snapshot of actual repo state.
It reflects the locked completed baseline and the approved hardening direction.

## Current Phase State

- Platform/auth/identity: Completed
- Core club operations: Partial
- Finance: Partial
- Superadmin: Partial
- Player: Partial
- UX rebuild direction: PR1-PR9 landed; cleanup slices 1-7 landed in code and targeted validation

## Current Product Reality

GreenLink has strong backend foundations and partial operational surfaces. The core product hierarchy is now better aligned than it was on April 10, 2026, but tee sheet, finance close day, and superadmin onboarding still need protected cleanup work.

Current issues include:
- tee sheet is operationally useful but still not the full command surface GreenLink requires
- finance close day is backend-capable but still needs tighter ownership cleanup on the frontend
- superadmin onboarding and clubs remain behavior-dense protected surfaces

## TS Status

- Status: Partial
- Live: tee-sheet read model, booking lifecycle, admin tee-sheet route inside the router-owned persistent admin shell
- Live: booking creation, editing, and move UX through backend-owned commands and the tee-sheet read model
- Live: participant-level booking move, inline quick actions, bucket check-in-all, keyboard shortcuts, focus-trapped drawers
- Live: timeline swimlane layout alongside the classic table, backed by the same read model and mutation flows
- Live: `AdminGolfDashboardPage` at `/admin/golf/dashboard` for utilization, revenue posture, tee warnings, and config readiness
- Gap: tee sheet still needs deeper finance and operational integration

## FIN Status

- Status: Partial
- Live: accounts, journal, ledger, revenue summary, outstanding summary, transaction-volume summary, canonical export batches, mapped accounting export profiles
- Live: mapped export execution, reconciliation, drift detection, and regeneration lineage are backend-owned
- Live: admin finance KPI surfaces consume backend summary endpoints only; no finance math remains in React
- Live: booking finance mutations are backend-owned and exposed through golf booking endpoints for payment-status changes, charge posting, and payment recording
- Gap: finance is not yet sufficiently positioned as a first-class close-day operational workflow

## Orders and POS Status

- Status: Partial
- Live: player ordering, admin order queue, charge posting, settlement recording, POS terminal
- Live: GL-06 normalized order and halfway mutation ownership around shared hooks and shared invalidation behavior
- Live: queue, halfway, player ordering, and settlement flows now refresh through one consistent invalidation path
- Not built: member account checkout in POS
- Status note: these remain extension surfaces, not the core product center of gravity

## SA Status

- Status: Partial
- Live: superadmin route group, persistent shell, club registry, club creation, onboarding workspace (Basic Info, Finance, Rules, Modules)
- Live: backend-owned onboarding progression; frontend sends intent only
- Live: overview page at `/superadmin/overview`
- Live: clubs page at `/superadmin/clubs`
- Live: accounting profiles page at `/superadmin/accounting-profiles`
- Live: sidebar has three real nav items: Overview, Clubs, Accounting Profiles
- Runtime landing: `/superadmin/clubs`
- Gap: onboarding is not yet sufficiently structured around true club go-live readiness

## Player Status

- Status: Partial
- Live: player home, player ordering, member booking flow, club updates news feed
- Live: `/player/profile` consumes the backend self-profile contract and refreshes bootstrap after save
- Recently fixed: player home no longer mounts the blocking profile-menu scrim on initial load
- Recently fixed: player order creation now succeeds against the live backend after enum binding alignment and backend restart
- Gap: player remains secondary until core admin lifecycle work is complete

## Dashboard Status

- Status: Extended
- Live: `GET /api/admin/dashboard/summary` - member_count, tee_occupancy, tee_warnings, recent_activity, active_targets
- Live: `GET /api/admin/halfway/summary` - orders_today_count, active_queue_count, queue_orders, recent_transactions
- Live: `GET /api/admin/reports/summary` - member_breakdown, order_status_breakdown, course_count
- Live: `AdminDashboardPage` - action alerts, quick actions, target hints, halfway and reports queries; no React math
- Live: `AdminGolfDashboardPage` (`/admin/golf/dashboard`) - golf utilization, revenue posture, tee warnings, config readiness; all from backend read models
- Live: `AdminPeopleDashboardPage` (`/admin/people/dashboard`) - member breakdown, outstanding account posture, directory size; all from backend read models
- Live: `AdminFinanceDashboardPage` (`/admin/finance/dashboard`) - revenue, outstanding, transaction volume, export batch status; all from backend read models
- Live: `AdminSettingsHubPage` (`/admin/settings`) - structured settings hub linking to Golf Configuration, Finance, Modules, Communications, and Targets
- Live: `AdminHalfwayPage` - halfway summary and finance summary reads; no React math
- Live: `AdminReportsPage` - reports summary plus finance summaries; no React math
- Live: `AdminMembersPage` - no_account_count and new_member_count come from reports summary; no client-side date math or cross-query counting
- Gap: dashboard still needs stronger “Today” operational prioritization

## Admin Navigation

Superseding note as of 2026-04-13:
- `AdminSidebar` follows lifecycle weighting: Today · Tee Sheet · People · Finance · Performance · Operations · Settings.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the shell/access contract.
- The sidebar is the visible primary-nav contract and intentionally hides some access-valid admin routes.
- Access-only admin routes retained in bootstrap truth include `/admin/targets`.
- `/admin/settings/profile` no longer acts as a separate settings destination; it redirects into `/admin/settings`.

Current live state:
- `AdminSidebar` is lifecycle-weighted with collapsible groups.
- Ungrouped (always visible): Today, Settings.
- Golf group (collapsible): Golf Summary, Tee Sheet.
- People group (collapsible): People Summary, Members.
- Finance group (collapsible): Finance Summary, Close Day.
- My Club group (collapsible): Performance, Communications.
- Operations group (collapsible): Halfway, Pro Shop, POS Terminal, Order Queue.
- Groups start open when the current route falls within them; they are toggle-able.
- Access-only key `targets` is filtered from the sidebar but retained in bootstrap for `ProtectedRoute` enforcement.
- `PRIMARY_NAV_GROUPS` drives group membership against backend-provided or fallback `menu_items`.
- `pos` module is labeled `Commerce` in the module catalog.

## Admin Routes

Superseding route naming note as of 2026-04-13:
- `/admin/dashboard` is Today.
- Legacy `/admin/select-club` redirects to canonical `/select-club`.
- `/admin/golf/dashboard` and `/admin/finance/dashboard` are grouped summary routes that remain visible in admin navigation.
- `/admin/people/dashboard` is the canonical People Summary route and is visible in admin navigation.
- `/admin/reports` is the Performance hub.
- `/admin/settings/profile` is a legacy redirect route into `/admin/settings`.

- `/admin/dashboard` - overview with action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` - golf domain: utilization, revenue, warnings, config readiness
- `/admin/golf/tee-sheet` - operational tee sheet: create, edit, move, cancel bookings
- `/admin/golf/settings` - guided golf settings setup: courses, tees, booking rules, pricing, readiness, publish/rollback
- `/admin/people/dashboard` - people summary: member breakdown, account posture, directory
- `/admin/members` - member directory and account management
- `/admin/finance/dashboard` - finance summary: revenue, outstanding, transaction volume, export batches
- `/admin/finance` - close-day workflow: export batch workflow and reconciliation
- `/admin/reports` - reports and analytics summaries
- `/admin/halfway` - halfway house operations
- `/admin/pro-shop` - pro shop
- `/admin/pos-terminal` - POS terminal
- `/admin/orders` - order queue
- `/admin/settings` - settings hub
- `/admin/settings/club` - legacy settings entry route; unconditional redirect to `/admin/settings`
- `/admin/settings/profile` - legacy redirect to `/admin/settings`
- `/admin/settings/modules` - read-only module visibility
- `/admin/communications` - communications and news posts
- `/admin/targets` - club targets

### Superadmin Routes

- `/superadmin/overview` - fleet KPIs, readiness bars, needs-attention list
- `/superadmin/clubs` - club registry and management
- `/superadmin/accounting-profiles` - fleet-level accounting export profiles

## Known Constraints

- Backend owns logic.
- Frontend sends intent only.
- No finance math in React.
- Tee sheet remains a read model.
- Orders remain distinct from payments.
- Admin and superadmin shells remain router-owned persistent layouts.
- Benchmark UI references remain the visual authority.
- Canonical local backend port is `127.0.0.1:8000`; frontend loopback fallback remains supported for local development.

## Known Gaps

- Tee sheet still needs deeper finance and operational integration.
- Golf settings guided setup is a protected ownership-cleanup surface.
- Finance close day is a protected ownership-cleanup surface.
- Superadmin clubs/onboarding remains a protected cleanup surface.
- Player journey improvements beyond the two post-GL-06 hotfixes remain deferred.

## Latest Validation

Latest targeted validation: cleanup slices 5-7 plus player/order follow-up fixes (2026-04-13)
- `frontend`: `npm.cmd run typecheck` - clean
- `frontend`: targeted Vitest clean for targets/reports, orders/halfway/player-order, player-shell, admin-members, admin-sidebar, route truth, persistent shell
- `backend`: targeted pytest clean for targets, finance read models, and order foundation after migration/enum fixes

## Hardening Program State

- GL-01 — Admin/Superadmin Contract Audit Baseline: complete
- GL-03 — Shared Route / Nav Truth Normalization: complete
- GL-02 — Repo Hygiene Quarantine: complete
- GL-04 — Dashboard Family Safe Hygiene: complete
- GL-04B — User-Facing Dev / Scaffold Copy Sweep: complete
- GL-05 — Targets / Performance Ownership Deduplication: complete
- GL-06 — Orders / Halfway Mutation and Invalidation Normalization: complete
- GL-07 — Members / People Workspace Structural Cleanup: complete in code and targeted validation
- Next slice: GL-08 — Golf Settings and Finance Close-Day Ownership Cleanup

## Final Direction Rule

This file preserves factual current state.
It does not require preserving dead weight, weak logic, or structurally bad UX during the approved hardening program.
