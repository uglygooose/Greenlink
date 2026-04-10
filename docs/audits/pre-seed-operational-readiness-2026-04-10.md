# GreenLink Pre-Seed Operational Readiness Audit

Date: 2026-04-10

## Executive verdict

Recommendation: `READY TO SEED AFTER SMALL FIXES`

GreenLink's route ownership, persistent shell model, role separation, core admin/superadmin/player flows, tee-sheet mutation wiring, and finance close-day workflow are materially sound. The repo is not in a broken pre-seed state.

The main risks are not foundational router failures. They are:

- canonical doc drift around current nav truth
- one real player navigation truth defect that was corrected in this pass
- an undocumented duplicate admin route surface
- lifecycle IA that is improved but still not fully operator-first
- tee-sheet and Today surfaces that are usable, but not yet as deep as 6 months of seeded operations will eventually demand

## Repo truth vs canonical docs

### Aligned with repo truth

- Router-owned admin and superadmin layouts are live in `frontend/src/routes/router.tsx`, `frontend/src/routes/admin-layout.tsx`, and `frontend/src/routes/superadmin-layout.tsx`.
- `ProtectedRoute` wraps layout-level role groups, not individual admin or superadmin pages, in `frontend/src/components/protected-route.tsx`.
- POS terminal is correctly nested under `/admin/*` in `frontend/src/routes/router.tsx`.
- Legacy settings paths redirect to `/admin/settings`.
- Backend `MENU_ITEMS` in `backend/app/services/session_bootstrap_service.py` is the menu/bootstrap truth.
- Only tee-sheet shell specifics still meaningfully depend on `feature_flags.ux_rebuild_v1`; backend still emits the flag from bootstrap.

### Divergence found

- `docs/MASTER_SYSTEM.md` and `SYSTEM_STATUS.md` previously described `/admin/golf/dashboard` and `/admin/finance/dashboard` as access-only routes, while live code exposes both in the sidebar and backend `MENU_ITEMS`.
Status: corrected in this pass.

- `docs/MASTER_SYSTEM.md` also mixed two incompatible claims:
  - admin nav is lifecycle-weighted
  - golf and finance summary dashboards are not primary-nav destinations
  while current sidebar clearly renders them.
Status: corrected in this pass for current factual truth.

- `GreenLink-Master-Build-Plan.txt` still says PR9 Superadmin Accounting Profiles is "in progress", but the route, page, and tests are live.
Status: remaining doc drift.

- Router includes `/admin/select-club` in addition to canonical `/select-club` in `frontend/src/routes/router.tsx`.
Status: legacy/dead-weight duplicate surface; not currently documented.

- `frontend/src/pages/admin-shell-page.tsx` is a legacy page-level shell that is no longer router-wired.
Status: dead-weight structure; not an active regression.

## Routing and shell integrity

- `AdminLayout` is router-owned and persistent.
Evidence: `frontend/src/routes/router.tsx`, `frontend/src/routes/admin-layout.tsx`, `frontend/src/test/persistent-shell-layout.test.tsx`.

- `SuperadminLayout` is router-owned and persistent.
Evidence: `frontend/src/routes/router.tsx`, `frontend/src/routes/superadmin-layout.tsx`, `frontend/src/test/persistent-shell-layout.test.tsx`.

- `ProtectedRoute` is applied at layout-group level.
Evidence: `frontend/src/routes/router.tsx`, `frontend/src/components/protected-route.tsx`.

- Admin and superadmin pages render content area only.
Evidence: layout routes own `AdminShell` and `SuperadminShell`; pages use `AdminWorkspace` or content components instead of page-level shells.

- POS terminal is correctly nested under admin layout.
Evidence: `/admin/pos-terminal` is inside the admin layout children in `frontend/src/routes/router.tsx`.

- Legacy redirects are correct.
Evidence: `/admin/settings/club` and `/admin/settings/profile` redirect to `/admin/settings` in `frontend/src/routes/router.tsx`; route-truth tests cover both.

- No active duplicate shell chrome was found in live routes.
Evidence: `frontend/src/routes/admin-layout.tsx`, `frontend/src/routes/superadmin-layout.tsx`, `frontend/src/components/shell/AdminShell.tsx`, `frontend/src/components/shell/SuperadminShell.tsx`.

- One duplicate route surface remains:
  - `/admin/select-club` duplicates `/select-club`
  - no live nav points to it
  - it competes with the canonical selection handoff path

## Navigation and IA assessment

### Admin

- Golf Dashboard and Finance Dashboard are currently present in navigation.
Evidence: `backend/app/services/session_bootstrap_service.py`, `frontend/src/components/shell/AdminSidebar.tsx`.

- Their presence is not a missing-nav defect. It is current repo truth.
- The bigger issue is weighting: the sidebar is still partly domain-grouped (`Golf`, `Finance`, `My Club`, `Operations`) instead of cleanly expressing the full lifecycle model at top level.

- Current strengths:
  - Today, Members, and Settings remain stable anchors.
  - Operations routes are module-driven by backend bootstrap.
  - People Summary and Targets remain access-only in sidebar while still protected by bootstrap/menu truth.

- Current weaknesses:
  - Golf Summary and Finance Summary remain prominent enough to dilute the intended "Today -> Tee Sheet -> Finance -> Performance" operating story.
  - `My Club` is a builder-facing label, not an operator-facing one.
  - Communications lives under `My Club`, which weakens lifecycle clarity.

### Superadmin

- Superadmin nav is clean and aligned: Overview, Clubs, Accounting Profiles.
Evidence: `frontend/src/components/shell/SuperadminSidebar.tsx`.

### Player

- Player home respected backend menu truth before this pass.
- Player book/order/profile pages did not; they hardcoded tab bars and could expose disabled destinations plus a dead `Club/News` placeholder.
Status: corrected in this pass.

## End-to-end flow assessment

### 1. Superadmin club setup

- Strong continuity.
- Overview routes into Clubs with `clubId`.
- Clubs page preserves club-scoped onboarding state and bridges into admin finance, golf settings, and dashboard after setting selected club.
- Backend owns onboarding progression; frontend sends intent only.

### 2. Club admin configuration

- Strong overall.
- `/admin/settings` works as a hub into golf settings, finance, modules, communications, and targets.
- Guided golf settings readiness/publish/rollback flow is in place.
- Module visibility remains read-only for club admins.
- Weakness: docs still needed cleanup around legacy profile/settings language.

### 3. Daily operations

- Good continuity from Today into Tee Sheet.
- Today deep-links unpaid and no-show work into tee-sheet filters and close-day blockers into finance.
- Tee sheet supports create/edit/move/check-in/no-show/cancel and backend-owned finance intents.
- Extension workflows exist, but they still feel adjacent rather than fully subordinated to the core daily flow.

### 4. Close Day / finance

- Strongest end-to-end journey after tee sheet.
- Finance dashboard -> close-day wizard -> exceptions -> batch -> reconcile -> mapped export -> audit trail is coherent.
- Good tee-sheet and orders handoff links from finance exceptions.
- Weakness: refunds/corrections are still not first-class day-close resolution paths.

### 5. Reporting / performance

- Useful and more actionable than a passive report bundle.
- Targets route back into tee sheet, finance, and members.
- Weakness: reporting value is diluted by coexistence with Today, Golf Summary, and Finance Summary.

### 6. Player

- Backend-truth aligned after correction.
- Home, book, order, and profile all use live backend contracts.
- No fake booking filler was found.
- Remaining weakness is module-dependent continuity for clubs without ordering; corrected navigation now matches bootstrap truth.

## Tee sheet readiness

### Strong

- Correct route and shell placement.
- Backend-owned command wiring for booking lifecycle and finance intents.
- Booking drawer, inline context panel, quick actions, batch no-show, and classic/timeline parity are all in place.
- Local preference handling exists for layout mode.
- Tests are deep and credible.

### Gaps that seeded data will expose harder

- No refund path in tee-sheet finance actions or backend tee-sheet-adjacent flow.
- Close-day linkage is good by deep link, but not yet deeply embedded in booking resolution context.
- Filter burden remains high; presets help, but the page still asks operators to manage a lot of surface state.
- Dense-day scanning is better in timeline mode than classic mode, but not yet clearly "command center" caliber for long-lived operational data density.

## Dashboard/Today readiness

- Better than a summary collage, but still not fully a shift-start control page.
- It answers unpaid bookings, no-show risk, close-day readiness, active targets, recent activity, and occupancy.
- It does not yet surface enough operational exception breadth for a 6-month seeded club:
  - member/account exceptions
  - outstanding finance exception types beyond unpaid/no-show
  - operational module backlog in a controlled way

## Extension module assessment

- Orders, POS, Halfway, and Pro Shop are generally placed as extensions, not top-level pillars.
- Module visibility is controlled from bootstrap/menu truth.
- The main distortion risk is not extension over-promotion anymore; it is summary dashboard over-weighting in the core admin nav.

## Demo readiness

### Strong in a demo

- Superadmin overview -> clubs -> onboarding -> admin bridge
- Guided golf settings
- Tee-sheet daily operation flow, including move/check-in/no-show/payment handling
- Finance close-day wizard and mapped export flow
- Player home/book/order/profile using backend truth

### Feels unfinished or structurally weak

- Lifecycle story in admin nav is still mixed with domain grouping
- Today is not yet a full operator command page
- Canonical docs were recently contradictory about live nav truth
- Duplicate `/admin/select-club` route muddies route surface cleanliness

## Seed readiness

- Core system behavior is good enough to seed.
- The repo is not failing at route ownership, shell persistence, or basic operational continuity.
- The remaining pre-seed work is about removing avoidable confusion and aligning truth, not rescuing broken foundations.

## High-priority gaps before seeding

1. Remove or redirect the undocumented `/admin/select-club` duplicate route to canonical `/select-club`.
2. Align the remaining canonical doc drift, especially PR9 status in `GreenLink-Master-Build-Plan.txt`.
3. Keep Golf Dashboard and Finance Dashboard exposed in nav while clarifying their role as secondary summary surfaces, not replacements for Today/Tee Sheet/Finance workflow.

## Lower-priority gaps after seeding

1. Refund/correction handling inside tee-sheet and finance daily resolution.
2. Stronger Today work-queue coverage for seeded operational exceptions.
3. Further lifecycle-first admin IA cleanup without removing required dashboard exposure.
4. Remove dead legacy structures like `frontend/src/pages/admin-shell-page.tsx` once no longer useful for reference.

## Recommended next correction slice order

1. Route-surface cleanup: canonicalize `/select-club` and retire `/admin/select-club`.
2. Canonical doc cleanup: fix remaining PR9/build-plan drift.
3. Admin IA tightening: preserve Golf/Finance dashboards, but reduce builder-facing grouping language and clarify lifecycle weighting.
4. Tee-sheet/finance depth: refunds, correction flows, and denser exception posture.
5. Today expansion: broader shift-start action coverage tied to seeded realities.

## Severity-ranked issue list

### Critical

- None found.

### High

| Issue | Where | Why it matters | Blocks | Recommended fix |
|---|---|---|---|---|
| Player subpages were bypassing backend menu truth and could show disabled routes plus dead placeholder tabs | `frontend/src/pages/player-book-page.tsx`, `frontend/src/pages/player-order-page.tsx`, `frontend/src/pages/player-profile-page.tsx` | Clubs without enabled modules could still present invalid player navigation and weaken demo credibility | Demo, Seed | Fixed in this pass via shared backend-truth tab builder and targeted tests |
| Admin IA still mixes lifecycle weighting with domain-grouped summary emphasis | `frontend/src/components/shell/AdminSidebar.tsx`, `backend/app/services/session_bootstrap_service.py` | Operators still have to think in Golf/Finance/My Club buckets rather than a cleaner operating sequence | Demo | Keep Golf/Finance dashboards visible, but tighten grouping language and weighting in a later narrow IA slice |

### Medium

| Issue | Where | Why it matters | Blocks | Recommended fix |
|---|---|---|---|---|
| Undocumented duplicate route `/admin/select-club` competes with canonical `/select-club` | `frontend/src/routes/router.tsx` | Creates route-surface ambiguity and legacy drift | Neither | Redirect `/admin/select-club` to `/select-club` or remove it |
| Canonical docs still had contradictory nav truth until this pass; build plan still says PR9 is in progress | `docs/MASTER_SYSTEM.md`, `SYSTEM_STATUS.md`, `GreenLink-Master-Build-Plan.txt` | Weakens trust in canonical authority during future correction work | Neither | Finish doc alignment, especially PR9 status |
| Today page is still not a full shift-start work queue | `frontend/src/pages/admin-dashboard-page.tsx` | Seeded operations will expose more exception types than the page currently surfaces | Seed | Expand action coverage, not dashboard decoration |
| Tee sheet still lacks refund/correction depth | `frontend/src/pages/admin-golf-tee-sheet-page.tsx`, backend booking finance endpoints | Seeded real-world reconciliation pressure will surface this quickly | Seed | Add backend-owned refund/correction intents and expose them in tee-sheet/finance flow |
| Feature-flag contract had stale tee-sheet finance-action gating at page level | `frontend/src/pages/admin-golf-tee-sheet-page.tsx` | Docs said unconditional; code still depended on the flag path | Neither | Fixed in this pass by making page-level finance actions unconditional |

### Low

| Issue | Where | Why it matters | Blocks | Recommended fix |
|---|---|---|---|---|
| Legacy unused page-level shell remains in repo | `frontend/src/pages/admin-shell-page.tsx` | Dead-weight structure can mislead future correction work | Neither | Remove or archive when convenient |

## Route audit matrix

| Route | Role | Shell owner | Source page/component | Reachable from nav | Correct redirect/handoff | Canonical-doc aligned | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| `/` | root | none | `RootRedirect` | No | Yes | Yes | OK | Sends user to landing path |
| `/login` | public | none | `LoginPage` | No | Yes | Yes | OK | Auth entry |
| `/accept-invitation` | public | none | `InvitationAcceptPage` | No | Yes | Not documented | OK | Valid public flow |
| `/select-club` | protected | none | `SelectClubPage` | No | Yes | Implicit | OK | Canonical club-selection handoff |
| `/admin/select-club` | admin | `ProtectedRoute` only | `SelectClubPage` | No | Weak | No | Legacy | Duplicate of `/select-club` |
| `/admin/dashboard` | admin | `AdminLayout` | `AdminDashboardPage` | Yes | Yes | Yes | OK | Today workspace |
| `/admin/golf/dashboard` | admin | `AdminLayout` | `AdminGolfDashboardPage` | Yes | Yes | Yes | OK | Summary route, visible in nav |
| `/admin/golf/tee-sheet` | admin | `AdminLayout` | `AdminGolfTeeSheetPage` | Yes | Yes | Yes | OK | Core operational surface |
| `/admin/golf/settings` | admin | `AdminLayout` | `AdminGolfSettingsPage` | Secondary | Yes | Yes | OK | Reached via settings hub and superadmin bridge |
| `/admin/people/dashboard` | admin | `AdminLayout` | `AdminPeopleDashboardPage` | Direct-link only | Yes | Yes | OK | Access-only summary route |
| `/admin/members` | admin | `AdminLayout` | `AdminMembersPage` | Yes | Yes | Yes | OK | Core route |
| `/admin/finance/dashboard` | admin | `AdminLayout` | `AdminFinanceDashboardPage` | Yes | Yes | Yes | OK | Summary route, visible in nav |
| `/admin/finance` | admin | `AdminLayout` | `AdminFinancePage` -> `AdminFinanceCloseDayPage` | Yes | Yes | Yes | OK | Finance / Close Day |
| `/admin/reports` | admin | `AdminLayout` | `AdminReportsPage` | Yes | Yes | Yes | OK | Performance hub |
| `/admin/communications` | admin | `AdminLayout` | `AdminCommunicationsPage` | Yes | Yes | Yes | OK | Module/extension surface |
| `/admin/halfway` | admin | `AdminLayout` | `AdminHalfwayPage` | Yes | Yes | Yes | OK | Module/extension surface |
| `/admin/pro-shop` | admin | `AdminLayout` | `AdminProShopPage` | Yes | Yes | Yes | OK | Module/extension surface |
| `/admin/orders` | admin | `AdminLayout` | `AdminOrderQueuePage` | Yes | Yes | Yes | OK | Module/extension surface |
| `/admin/pos-terminal` | admin | `AdminLayout` | `AdminPosTerminalPage` | Yes | Yes | Yes | OK | Correctly nested under admin shell |
| `/admin/settings` | admin | `AdminLayout` | `AdminSettingsHubPage` | Yes | Yes | Yes | OK | Settings hub |
| `/admin/settings/club` | admin | `AdminLayout` | redirect | No | Yes | Yes | OK | Legacy redirect |
| `/admin/settings/profile` | admin | `AdminLayout` | redirect | No | Yes | Yes | OK | Legacy redirect |
| `/admin/settings/modules` | admin | `AdminLayout` | `AdminSettingsModulesPage` | Secondary | Yes | Yes | OK | Reached from settings hub |
| `/admin/targets` | admin | `AdminLayout` | `AdminTargetsPage` | Secondary | Yes | Yes | OK | Access-only from sidebar; linked via settings/performance |
| `/superadmin/overview` | superadmin | `SuperadminLayout` | `SuperadminOverviewPage` | Yes | Yes | Yes | OK | Fleet entry |
| `/superadmin/clubs` | superadmin | `SuperadminLayout` | `SuperadminClubsPage` | Yes | Yes | Yes | OK | Club setup workspace |
| `/superadmin/accounting-profiles` | superadmin | `SuperadminLayout` | `SuperadminAccountingProfilesPage` | Yes | Yes | Yes | OK | Live route; docs/build-plan disagree on PR9 status |
| `/player/home` | player | page-owned player shell | `PlayerShellPage` | Yes | Yes | Yes | OK | Backend-truth player home |
| `/player/book` | player | page-owned player shell | `PlayerBookPage` | Yes | Yes | Yes | OK | Player booking flow |
| `/player/order` | player | page-owned player shell | `PlayerOrderPage` | Yes | Yes | Yes | OK | Module-dependent player ordering |
| `/player/profile` | player | page-owned player shell | `PlayerProfilePage` | Yes | Yes | Yes | OK | Backend self-profile contract |

## Journey audit matrix

| Journey | Entry point | Key surfaces | Handoff quality | Continuity score | Blockers | Notes |
|---|---|---|---|---|---|---|
| Superadmin setup | `/superadmin/overview` | Overview, Clubs, onboarding, accounting profiles, admin bridge | Strong | 4/5 | None | Good club-scoped bridge into admin workspaces |
| Admin config | `/admin/settings` | Settings hub, golf settings, modules, finance, targets | Strong | 4/5 | None | Legacy settings-profile language had doc drift |
| Daily operations | `/admin/dashboard` | Today, Tee Sheet, members, operations modules | Good | 4/5 | None | Today is useful but still narrow |
| Close day | `/admin/finance/dashboard` or `/admin/finance` | Finance summary, exceptions, batch, reconcile, export, audit | Strong | 4/5 | None | Refund/correction gap remains |
| Reporting/performance | `/admin/reports` | Targets, finance KPIs, member breakdowns, action links | Moderate | 3/5 | None | Useful but overlaps with summary dashboards |
| Player | `/player/home` | Home, book, order, profile | Good | 4/5 | None after fix | Now consistent with backend menu truth across pages |

## Corrections made in this pass

### Fixes

1. Normalized player mobile-tab navigation to backend bootstrap truth across all player pages.
2. Removed dead placeholder `Club/News` tab from fallback player nav.
3. Made tee-sheet page-level finance actions unconditional to match the current documented contract.
4. Corrected canonical doc statements that wrongly treated Golf/Finance dashboards as access-only sidebar routes.
5. Corrected canonical doc wording for `/admin/settings/profile` to reflect its current redirect behavior.

### Files changed

- `frontend/src/pages/player-shell-page.tsx`
- `frontend/src/pages/player-book-page.tsx`
- `frontend/src/pages/player-order-page.tsx`
- `frontend/src/pages/player-profile-page.tsx`
- `frontend/src/pages/player-tab-items.ts`
- `frontend/src/pages/player-book-page.test.tsx`
- `frontend/src/pages/player-order-page.test.tsx`
- `frontend/src/pages/player-profile-page.test.tsx`
- `frontend/src/pages/admin-golf-tee-sheet-page.tsx`
- `docs/MASTER_SYSTEM.md`
- `SYSTEM_STATUS.md`

### Validation run

- `frontend`: `npm.cmd run typecheck` — clean
- `frontend`: targeted `vitest` run for route/sidebar/player tests — 47 passed
- `frontend`: targeted `vitest` run for tee-sheet page and booking drawer — 69 passed

