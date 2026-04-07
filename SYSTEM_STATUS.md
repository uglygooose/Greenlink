# GreenLink System Status

Last updated: 2026-04-08 (Phase 14 complete, Phase 15 next)

## Canonical Snapshot Role

This file is the canonical current snapshot of actual repo state.
It reflects the locked completed baseline and no longer tracks active slice-by-slice work.

## Current Phase State

- Platform/auth/identity: Completed
- Core club operations: Partial
- Finance: Partial
- Superadmin: Partial
- Player: Partial

## TS Status

- Status: Partial
- Live: tee-sheet read model, booking lifecycle, admin tee-sheet route inside router-owned persistent admin shell
- Live: booking creation, editing, and move UX through backend-owned commands and the tee-sheet read model
- Live: `AdminGolfDashboardPage` at `/admin/golf/dashboard` — utilization KPIs, revenue posture, tee warnings, config readiness (courses, tees, rulesets, pricing matrices), primary golf actions

## FIN Status

- Status: Partial
- Live: accounts, journal, ledger, revenue summary, outstanding summary, transaction-volume summary, canonical export batches, accounting export profile mapping
- Live: mapped export execution is backend-owned and tracked on canonical batches
- Live: package-specific validation for `generic_journal`, `pastel_like`, and `sage_like`
- Live: reconciliation endpoint compares persisted canonical payloads against live finance state for a selected batch
- Live: mapped exports are blocked when batch reconciliation detects drift
- Live: drift recovery uses backend-owned batch regeneration with typed supersede/regeneration lineage
- Backend now returns pre-computed pct fields on each summary item (`revenue_share_pct`, `volume_share_pct`, `accounts_*_pct`); `AdminReportsPage` consumes these directly and no client-side finance math remains
- Not built: direct third-party push/pull integration beyond tracked export handoff

## Orders and POS Status

- Status: Partial
- Live: player ordering, admin order queue, charge posting, settlement recording, POS terminal
- Live: `AdminOrderQueuePage` now uses the normalized `AdminWorkspace` shell/content pattern
- Live: `AdminGolfSettingsPage` and `AdminPosTerminalPage` now use the normalized `AdminWorkspace` shell/content pattern
- POS terminal is inside the router-owned AdminLayout; no standalone nav chrome
- Not built: member account checkout in POS

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
- Default redirect is `/superadmin/overview`; sidebar has two real nav items (Overview, Clubs)
- Live: superadmin invitation/provisioning flow with backend-owned invite creation, invitation listing, new-user acceptance, and logged-in activation for existing users
- Not built: superadmin-side authoring for golf rules/pricing; canonical authoring remains in admin golf settings

## Player Status

- Status: Partial
- Live: player home, member booking flow, player ordering, club updates news feed
- Live: player booking uses the tee-sheet read model and member-portal booking creation endpoint
- Live: player home upcoming bookings and recent history render the backend player-booking read model
- Live: `/player/profile` consumes the backend self-profile contract and refreshes session bootstrap after save

## Dashboard Status

- Status: Extended (Phase 6 + Phase 7 + Phase 10 done)
- Live: `GET /api/admin/dashboard/summary` - member_count, tee_occupancy, tee_warnings, recent_activity, active_targets
- Live: `GET /api/admin/halfway/summary` - orders_today_count, active_queue_count, queue_orders, recent_transactions
- Live: `GET /api/admin/reports/summary` - member_breakdown (with role counts, pcts, no_account_count, new_member_count), order_status_breakdown, course_count
- Live: `AdminDashboardPage` - enhanced with action alerts, quick actions, target hints, halfway and reports queries; no React math
- Live: `AdminGolfDashboardPage` (`/admin/golf/dashboard`) - golf utilization, revenue posture, tee warnings, config readiness; all from backend read models
- Live: `AdminPeopleDashboardPage` (`/admin/people/dashboard`) - member breakdown, outstanding account posture, directory size; all from backend read models
- Live: `AdminFinanceDashboardPage` (`/admin/finance/dashboard`) - revenue, outstanding, transaction volume, export batch status; all from backend read models
- Live: `AdminClubSettingsPage` (`/admin/settings/club`) - configuration hub linking to golf settings and module config; does not duplicate superadmin ownership
- Live: `AdminHalfwayPage` - 3 queries (halfway summary, finance revenue, finance transaction volume); no React math
- Live: `AdminReportsPage` - 4 queries (reports summary, finance revenue, finance outstanding, finance transaction volume); no React math
- Live: `AdminMembersPage` - no_account_count and new_member_count come from reports summary; no client-side date math or cross-query counting
- Live: `active_targets` field on dashboard summary — backend reads live `ClubTarget` rows whose period spans today, joins domain/metric registry, and returns typed `DashboardTargetContext` items; no React math
- Tee operational warnings (`no_courses_configured`, `tee_sheet_closed_today`) are backend-emitted
- No React math or cross-query KPI stitching remains in any admin dashboard page

## Admin Navigation

- Live: `AdminSidebar` is grouped by domain: Overview · Golf · People · Finance · Operations · My Club
- Live: My Club group contains: Communications · Club Settings · Targets · Golf Settings
- Live: Groups are collapsible; all start collapsed; labeled groups show nothing when closed
- Live: Group structure is driven by `PRIMARY_NAV_GROUPS` against backend-provided or fallback `menu_items`; ungrouped items are rendered below without a label
- Live: backend `MENU_ITEMS` in `session_bootstrap_service.py` is the canonical nav registry; sidebar resolves against it
- Live: `pos` module relabeled "Commerce" in module catalog
- Live: `AdminGolfSettingsPage` redesigned — all old CSS class patterns replaced with `AdminWorkspace` + Tailwind utility classes; all mutation logic unchanged
- Live: `AdminClubSettingsPage` rebuilt — shows live ClubConfig data, course/tee/ruleset/pricing counts, active target count, active export profile name

## Admin Routes

- `/admin/dashboard` — overview with action alerts, quick actions, targets, recent activity
- `/admin/golf/dashboard` — golf domain: utilization, revenue, warnings, config readiness
- `/admin/golf/tee-sheet` — operational tee sheet: create/edit/move/cancel bookings
- `/admin/golf/settings` — golf settings: courses, tees, rule sets, pricing matrices
- `/admin/people/dashboard` — people domain: member breakdown, account posture, directory
- `/admin/members` — member directory and account management
- `/admin/finance/dashboard` — finance domain: revenue, outstanding, transaction volume, export batches
- `/admin/finance` — close-day: export batch workflow and reconciliation
- `/admin/reports` — reports and analytics summaries
- `/admin/halfway` — halfway house operations
- `/admin/pro-shop` — pro shop
- `/admin/pos-terminal` — POS terminal
- `/admin/orders` — order queue
- `/admin/settings/club` — club settings hub
- `/admin/communications` — communications and news posts
- `/admin/targets` — club targets

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

## Known Gaps

- `active_targets` is tested implicitly via the dashboard summary endpoint; no isolated unit test for `_get_active_targets()` with live `ClubTarget` fixture rows.
- Communications: broadcast blasts (create/send/history) are live. Scheduling and in-app push surface remain future evolution.
- Pro shop: product CRUD (create, edit, toggle active) live; no hard delete (deactivation is the pattern).
- Halfway: 3-column kanban with placed/preparing/ready lanes and advance/cancel buttons; 30s polling active.
- Player module: no booking cancellation enforcement, no waitlist, no handicap (Phase 15).
- Superadmin cannot author golf rules or pricing directly (Phase 16).
- No third-party accounting sync beyond tracked handoff (Phase 17).

## Latest Validation

- `frontend`: `npm.cmd run typecheck` - clean
- `frontend`: `npm.cmd run test` - clean (`126 passed`, 26 test files)
- `backend`: `py -m uv run pytest` - clean (`161 passed`; conftest enum cleanup fix resolves pre-existing startlane duplicate-type drift)
- `backend`: Phase 13 blast endpoints tested (7 new tests: create, list, send, RBAC, 404, tenant isolation)
- `frontend`: targeted Vitest `src/pages/admin-golf-dashboard-page.test.tsx` - clean (Phase 11-A, new)
- `frontend`: targeted Vitest `src/pages/admin-finance-dashboard-page.test.tsx` - clean (Phase 11-A, new)
- `frontend`: targeted Vitest `src/pages/admin-people-dashboard-page.test.tsx` - clean (Phase 11-A, new)
- `frontend`: targeted Vitest `src/pages/admin-club-settings-page.test.tsx` - clean (Phase 11-A, new)
- `frontend`: targeted Vitest `src/components/shell/AdminSidebar.test.tsx` - clean (`3 passed`)
- `frontend`: targeted Vitest `src/pages/admin-golf-tee-sheet-page.test.tsx` - clean (`18 passed`)
- `frontend`: targeted Vitest `src/pages/admin-dashboard-page.test.tsx` - clean (`5 passed`)
- `frontend`: targeted Vitest `src/pages/superadmin-clubs-page.test.tsx` - clean
- `frontend`: targeted Vitest `src/pages/player-shell-page.test.tsx` - clean
- `frontend`: targeted Vitest `src/pages/player-profile-page.test.tsx` - clean
- `frontend`: targeted Vitest `src/pages/invitation-accept-page.test.tsx` - clean
- `frontend`: targeted Vitest `src/session/session-provider.test.tsx` - clean
- `backend`: targeted pytest `backend/tests/test_superadmin_onboarding_foundation.py` - clean
- `backend`: targeted pytest `backend/tests/test_auth_and_bootstrap.py` - clean
- `backend`: targeted pytest `backend/tests/test_player_booking_read_model.py` - clean
- `backend`: targeted pytest `backend/tests/test_player_profile.py` - clean
- `backend`: targeted pytest `backend/tests/test_superadmin_invitations.py` - clean
- `backend`: targeted pytest `backend/tests/test_invitation_acceptance.py` - clean
- `backend`: targeted pytest `backend/tests/test_targets.py` - clean
