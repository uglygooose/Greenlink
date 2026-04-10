# GreenLink System Status

Last updated: 2026-04-10

## Canonical Snapshot Role

This file is the canonical current snapshot of actual repo state.
It reflects the locked completed baseline and the approved UX rebuild direction.

## Current Phase State

- Platform/auth/identity: Completed
- Core club operations: Partial
- Finance: Partial
- Superadmin: Partial
- Player: Partial
- UX rebuild direction: PR1–PR9 landed; cleanup slices 1–4 landed

## Current Product Reality

GreenLink currently has strong backend foundations and partial operational surfaces, but the product hierarchy and UX weighting are not yet aligned to the intended premium system.

Current issues include:
- tee sheet that is operationally useful but still cluttered and incomplete as the main cockpit
- finance that is powerful in backend and reconciliation terms but not yet fully integrated into daily operational flow
- add-on operational modules that can feel too prominent relative to the core pillars

## TS Status

- Status: Partial
- Live: tee-sheet read model, booking lifecycle, admin tee-sheet route inside router-owned persistent admin shell
- Live: booking creation, editing, and move UX through backend-owned commands and the tee-sheet read model
- Live: participant-level booking move — single participant can be extracted from a multi-participant booking and moved independently; backend splits the source booking when needed and validates participant ownership
- Live: inline chip quick actions (check in / no-show / cancel), per-bucket check-in-all, create/edit cart-caddie toggles, keyboard shortcuts, and focus-trapped operational drawers
- Live: timeline swimlane layout alongside the classic table, reusing the same tee-sheet read model, mutations, drag/drop, quick actions, and localStorage-backed layout/density UI state
- Live: tee-sheet cockpit shell is now the unconditional baseline; the old `ux_rebuild_v1` client branch has been removed
- Live: `AdminGolfDashboardPage` at `/admin/golf/dashboard` — utilization KPIs, revenue posture, tee warnings, config readiness (courses, tees, rulesets, pricing matrices), primary golf actions
- Gap: tee sheet is not yet the full operational command center GreenLink requires
- Gap: refunds, close-day reconciliation handoff, and deeper finance resolution still remain outside the tee-sheet flow

## FIN Status

- Status: Partial
- Live: accounts, journal, ledger, revenue summary, outstanding summary, transaction-volume summary, canonical export batches, accounting export profile mapping
- Live: mapped export execution is backend-owned and tracked on canonical batches
- Live: package-specific validation for `generic_journal`, `pastel_like`, and `sage_like`
- Live: reconciliation endpoint compares persisted canonical payloads against live finance state for a selected batch
- Live: mapped exports are blocked when batch reconciliation detects drift
- Live: drift recovery uses backend-owned batch regeneration with typed supersede/regeneration lineage
- Backend now returns pre-computed pct fields on each summary item (`revenue_share_pct`, `volume_share_pct`, `accounts_*_pct`); `AdminReportsPage` consumes these directly and no client-side finance math remains
- Live: booking finance mutations are backend-owned and exposed through golf booking endpoints for payment-status changes, charge posting, and payment recording
- Not built: direct third-party push/pull integration beyond tracked export handoff
- Gap: finance is not yet sufficiently positioned as a first-class close-day operational workflow

## Orders and POS Status

- Status: Partial
- Live: player ordering, admin order queue, charge posting, settlement recording, POS terminal
- Live: `AdminOrderQueuePage` now uses the normalized `AdminWorkspace` shell/content pattern
- Live: `AdminGolfSettingsPage` and `AdminPosTerminalPage` now use the normalized `AdminWorkspace` shell/content pattern
- POS terminal is inside the router-owned AdminLayout; no standalone nav chrome
- Not built: member account checkout in POS
- Status note: these are extension surfaces, not the core product center of gravity

## SA Status

- Status: Partial
- Live: superadmin route group, persistent shell, club registry, club creation, onboarding workspace (Basic Info, Finance, Rules, Modules)
- Live: backend-owned onboarding progression; frontend sends intent only
- Live: Rules step reads real club-scoped rule sets and pricing matrices, including active counts and per-record summaries
- Live: Modules step reads the canonical backend module catalog and persists club module keys through backend validation
- Live: overview page at `/superadmin/overview` with fleet KPIs, finance/team readiness bars, needs-attention list, and clubs table
- Live: club pause/reactivate (`PATCH /clubs/{id}/status`) and club delete (`DELETE /clubs/{id}`, blocked for live clubs)
- Live: overview and clubs actions carry a concrete `clubId` route selection into the registry
- Live: superadmin can hand off into club-scoped admin workspaces (`/admin/finance`, `/admin/golf/settings`, `/admin/dashboard`) after selecting a club
- Default redirect is `/superadmin/overview`; sidebar has three real nav items (Overview, Clubs, Accounting Profiles)
- Live: superadmin invitation/provisioning flow with backend-owned invite creation, invitation listing, new-user acceptance, and logged-in activation for existing users
- Live: Superadmin Accounting Profiles page at `/superadmin/accounting-profiles` — fleet-level view and management of accounting export profiles across clubs
- Not built: superadmin-side authoring for golf rules/pricing; canonical authoring remains in admin golf settings
- Gap: onboarding is not yet sufficiently structured around true club go-live readiness

## Player Status

- Status: Partial
- Live: player home, member booking flow, player ordering, club updates news feed
- Live: player booking uses the tee-sheet read model and member-portal booking creation endpoint
- Live: player home upcoming bookings and recent history render the backend player-booking read model
- Live: `/player/profile` consumes the backend self-profile contract and refreshes session bootstrap after save
- Gap: player remains secondary until core admin lifecycle is corrected

## Dashboard Status

- Status: Extended (Phase 6 + Phase 7 + Phase 10 done)
- Live: `GET /api/admin/dashboard/summary` - member_count, tee_occupancy, tee_warnings, recent_activity, active_targets
- Live: `GET /api/admin/halfway/summary` - orders_today_count, active_queue_count, queue_orders, recent_transactions
- Live: `GET /api/admin/reports/summary` - member_breakdown (with role counts, pcts, no_account_count, new_member_count), order_status_breakdown, course_count
- Live: `AdminDashboardPage` - enhanced with action alerts, quick actions, target hints, halfway and reports queries; no React math
- Live: `AdminGolfDashboardPage` (`/admin/golf/dashboard`) - golf utilization, revenue posture, tee warnings, config readiness; all from backend read models
- Live: `AdminPeopleDashboardPage` (`/admin/people/dashboard`) - member breakdown, outstanding account posture, directory size; all from backend read models
- Live: `AdminFinanceDashboardPage` (`/admin/finance/dashboard`) - revenue, outstanding, transaction volume, export batch status; all from backend read models
- Live: `AdminSettingsHubPage` (`/admin/settings`) - structured settings hub linking to Golf Configuration, Finance, Modules, Communications, and Targets (Club Profile card removed)
- Live: `AdminHalfwayPage` - 3 queries (halfway summary, finance revenue, finance transaction volume); no React math
- Live: `AdminReportsPage` - 4 queries (reports summary, finance revenue, finance outstanding, finance transaction volume); no React math
- Live: `AdminMembersPage` - no_account_count and new_member_count come from reports summary; no client-side date math or cross-query counting
- Live: `active_targets` field on dashboard summary — backend reads live `ClubTarget` rows whose period spans today, joins domain/metric registry, and returns typed `DashboardTargetContext` items; no React math
- Tee operational warnings (`no_courses_configured`, `tee_sheet_closed_today`) are backend-emitted
- No React math or cross-query KPI stitching remains in any admin dashboard page
- Gap: dashboard is still too close to a domain summary surface and not yet a true "Today" operational work queue

## Admin Navigation

Superseding note as of 2026-04-10:
- `AdminSidebar` now follows lifecycle weighting: Today · Tee Sheet · Members · Finance · Performance · Operations · Settings.
- Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the shell/access contract.
- The sidebar is the visible primary-nav contract and intentionally hides some access-valid admin routes.
- Access-only admin routes retained in bootstrap truth include `/admin/people/dashboard` and `/admin/targets`.
- `/admin/settings/profile` no longer acts as a separate settings destination; it redirects into `/admin/settings`.

Current live state:
- `AdminSidebar` is lifecycle-weighted with collapsible groups.
- Ungrouped (always visible): Today, Members, Settings.
- Golf group (collapsible): Golf Summary, Tee Sheet.
- Finance group (collapsible): Finance Summary, Close Day.
- My Club group (collapsible): Performance, Communications.
- Operations group (collapsible): Halfway, Pro Shop, POS Terminal, Order Queue.
- Groups start open when the current route falls within them; toggle-able.
- Access-only keys (`people_dashboard`, `targets`) are filtered from sidebar but retained in bootstrap for `ProtectedRoute` enforcement.
- `PRIMARY_NAV_GROUPS` drives group membership against backend-provided or fallback `menu_items`; ungrouped items render below without a label.
- `pos` module relabeled "Commerce" in module catalog.

## Admin Routes

Superseding route naming note as of 2026-04-10:
- `/admin/dashboard` is Today.
- Legacy /admin/select-club now redirects to canonical /select-club.
- `/admin/golf/dashboard` and `/admin/finance/dashboard` are grouped summary routes that remain visible in admin navigation.
- `/admin/people/dashboard` remains a direct-link summary route.
- `/admin/reports` is the Performance hub.
- `/admin/settings/profile` is a legacy redirect route into `/admin/settings`.

- `/admin/dashboard` — overview with action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` — golf domain: utilization, revenue, warnings, config readiness
- `/admin/golf/tee-sheet` — operational tee sheet: create/edit/move/cancel bookings
- `/admin/golf/settings` — guided golf settings setup: courses, tees, booking rules, pricing, readiness, publish/rollback
- `/admin/people/dashboard` — people domain: member breakdown, account posture, directory
- `/admin/members` — member directory and account management
- `/admin/finance/dashboard` — finance domain: revenue, outstanding, transaction volume, export batches
- `/admin/finance` — close-day: export batch workflow and reconciliation
- `/admin/reports` — reports and analytics summaries
- `/admin/halfway` — halfway house operations
- `/admin/pro-shop` — pro shop
- `/admin/pos-terminal` — POS terminal
- `/admin/orders` — order queue
- `/admin/settings` — settings hub
- `/admin/settings/club` — legacy settings entry route; unconditional redirect to `/admin/settings`
- `/admin/settings/profile` — legacy redirect to `/admin/settings`
- `/admin/settings/modules` — read-only module visibility
- `/admin/communications` — communications and news posts
- `/admin/targets` — club targets

### Superadmin Routes
- `/superadmin/overview` — fleet KPIs, readiness bars, needs-attention list
- `/superadmin/clubs` — club registry and management
- `/superadmin/accounting-profiles` — fleet-level accounting export profiles

## Known Constraints

- Backend owns logic.
- Frontend sends intent only.
- No finance math in React. All chart widths and KPIs come from backend pct/summary fields.
- Tee sheet remains a read model.
- Orders remain distinct from payments.
- Admin and superadmin shells must remain router-owned persistent layouts.
- Benchmark UI references remain the visual authority.
- Canonical local backend port is `127.0.0.1:8000`; the frontend client now auto-recovers between loopback ports `8000` and `8001` during local development.
- Local frontend browser requests use the Vite dev proxy for loopback `/api/*` traffic, which removes browser CORS dependence from normal local development.

## Known Risks

- Backend test suite runs in file-declaration order — `-p no:randomly` is enforced via `pyproject.toml addopts`. No longer tribal knowledge.
- CORS: `allow_origin_regex` matches both `localhost` and `127.0.0.1` on any port. Vite proxy handles all local browser `/api/*` traffic. Effective CORS origins logged at startup. Risk is resolved.
- FALLBACK_NAV_ITEMS coverage is enforced by an AdminSidebar.test.tsx test that asserts all known MENU_ITEMS admin keys expand to visible links.
- The biggest product risk is preserving structurally bad UX because current implementation already exists.

## Known Gaps

- `active_targets` is tested implicitly via the dashboard summary endpoint; no isolated unit test for `_get_active_targets()` with live `ClubTarget` fixture rows.
- Communications: broadcast blasts (create/send/history) are live. Scheduling and in-app push surface remain future evolution.
- Pro shop: product CRUD (create, edit, toggle active) live; no hard delete (deactivation is the pattern).
- Halfway: 3-column kanban with placed/preparing/ready lanes and advance/cancel buttons; 30s polling active.
- Player module: no booking cancellation enforcement, no waitlist, no handicap (Phase 15).
- Superadmin cannot author golf rules or pricing directly (Phase 16).
- No third-party accounting sync beyond tracked handoff (Phase 17).

- Tee sheet still needs deeper finance and operational integration.
- Add-on modules still risk overexposure relative to core product pillars.

## Latest Validation

Last full suite: UX rebuild cleanup slices 1–4 (2026-04-10)
- `frontend`: `npm.cmd run test` - clean (35/35 test files, 200/200 tests)
- `frontend`: `npm.cmd run typecheck` - clean
- `backend`: `py -m uv run pytest` - clean (161 passed)

## Final Direction Rule

This file preserves factual current state.
It does not require preserving dead weight, weak logic, or structurally bad UX during the approved rebuild.


