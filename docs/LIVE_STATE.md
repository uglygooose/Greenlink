# GreenLink — Live State

Last updated: 2026-04-15

This file tracks what is built, what is partial, what is pending, and what is not started. It is the living complement to `docs/MASTER_SYSTEM.md`. Update it whenever the build state changes.

---

## Domain build status

### Platform and auth — COMPLETE

- FastAPI + PostgreSQL runtime in place.
- JWT access tokens + refresh-token rotation in place.
- `/api/session/bootstrap` is the frontend bootstrap truth.
- Club-scoped tenancy enforced through auth + selected-club resolution.

### Identity and membership — COMPLETE

- `User → Person → ClubMembership` identity model is live.
- People directory, membership, account-customer, and bulk-intake foundations are built.
- `membership_metadata` carries extended backend fields including `pricing_player_type`.

### Tee sheet — PARTIAL

Built and live:
- Tee sheet read model (swimlane + classic layouts, density toggle).
- Booking lifecycle: create, update, move, participant-level move, check-in, no-show, cancel.
- Booking finance commands: payment-status, post-charge, record-payment.
- Pricing matrix: 4-dimension fee resolution (player_type, holes, day_type, season) via `BookingCommercialService`. Fee snapshotted at create/update; re-resolved on tee sheet read if absent.
- `holes` field on bookings (9 or 18), resolved and validated at creation.
- Booking management drawer: fee_amount display, payment status badge, payment action CTAs.
- Inline quick actions, batch check-in-all, keyboard shortcuts, focus-trapped drawers.
- `AdminGolfDashboardPage` at `/admin/golf/dashboard`: utilisation, revenue posture, tee warnings, config readiness.
- Guided golf settings (draft/publish/rollback on rule sets and pricing matrices).
- Pricing editor includes playerType, holes, season, day_type, time_band dimensions.

Not built:
- Refund/correction path. `FinanceTransactionType` enum has `charge`, `payment`, `adjustment` only — no `refund` or `correction`. No backend model, service, or endpoint. Frontend `finance.ts` already declares `"refund"` in `FinanceTransactionType` ahead of backend.
- `/admin/golf/bookings` — dedicated booking-management read model (deferred until backend truth exists).

### Finance — PARTIAL

Built and live:
- `FinanceAccount`, append-only `FinanceTransaction`, journal, ledger, revenue/outstanding/volume summaries.
- Canonical export batches, mapped accounting export profiles.
- Mapped export execution, reconciliation, drift detection, regeneration.
- Finance close-day wizard: Exceptions → Generate Batch → Reconcile → Export → Audit Trail.
- `GET /api/finance/exceptions?date=YYYY-MM-DD`.
- Drift detection blocks Export step.
- `AdminFinanceDashboardPage` at `/admin/finance/dashboard`.
- Tee-sheet and orders deep-link handoffs from finance exceptions.

Not built:
- Refund/correction handling as a first-class day-close resolution path.

### Orders and POS — PARTIAL

Built and live:
- Player ordering, admin order queue, explicit charge posting, explicit settlement recording, POS terminal.
- POS terminal (`/admin/pos-terminal`) nested inside router-owned `AdminLayout`.

These surfaces remain operational extensions, not primary system pillars.

### Superadmin — COMPLETE (current scope)

Built and live:
- Distinct superadmin route group and persistent shell.
- Club registry, club creation, onboarding workspace (Basic Info, Finance, Rules, Modules).
- Rules step reads real club-scoped rule sets and pricing matrices.
- Modules step reads backend module catalog and persists validated club module configuration.
- Superadmin bridge into club-scoped admin workspaces.
- `/superadmin/accounting-profiles` route and page are live.
- Accounting template upload + profile bind: `AccountingTemplateService` (backend, 438 lines) — CSV parse with canonical field alias matching, sample layout generation, profile create/toggle-active/bind. `SuperadminAccountingProfilesPage` (frontend, 667 lines) — CSV upload, template parse, JSON helper upload, mapping config editor, club filter, profile list, bind. Backend tests: `test_accounting_profiles_superadmin.py`. Frontend tests: `superadmin-accounting-profiles-page.test.tsx`.

### Communications — PARTIAL

- Admin news-post CRUD exists.
- Published posts available to player-facing read flows.
- Player home reads backend news posts.

### Player — COMPLETE (current scope)

- Player home, book, order, profile all use live backend contracts.
- Player mobile-tab navigation driven by backend bootstrap truth across all player pages.
- `POST /api/golf/bookings` with `source="member_portal"` is the booking creation path.

### Reporting/Performance — COMPLETE (current scope)

- `/admin/reports` is the Performance hub: Targets section at top, reporting sections below.
- `/admin/targets` redirects to `/admin/reports`.
- Target creation: backend catalog-driven (domain → metric cascade), annual only, year picker.
- Target cards show annual target + derived monthly/daily pace.
- Action links per domain: golf→tee-sheet, finance→close-day, members→members, orders→orders.

---

## Pending: migrations not yet verified as applied

The following Alembic migrations are committed and correctly chained in the migration history. Whether they have been applied against the running database cannot be confirmed without DB access. Run `alembic current` to verify head state.

| Migration | What it adds |
|---|---|
| `202604130002_booking_fee_snapshot.py` | `bookings.fee_amount`, `bookings.fee_currency` |
| `202604130003_pricing_matrix_dimensions.py` | `pricing_rules.player_type`, `pricing_rules.holes`, `pricing_rules.season`, `bookings.holes` |

**Fee resolution and pricing dimension features will not function correctly until these migrations are applied.**

---

## Pending: not started

| Item | Description |
|---|---|
| Refund/correction | Backend-owned refund/correction intents exposed in tee-sheet and finance daily resolution flow. No backend model, service, or endpoint. Frontend type is ahead of backend — `"refund"` declared in `FinanceTransactionType` but not in backend enum. |

---

## Known gaps (post-seed pressure points)

| Gap | Where it will hurt | Priority |
|---|---|---|
| Refund/correction has no path | Tee sheet finance actions, close-day reconciliation | High |
| Today page is not a full shift-start work queue | Will surface more exception types (member/account exceptions, outstanding finance exceptions) once data is seeded | Medium |
| Filter burden on tee sheet | Dense-day scanning still asks operators to manage a lot of surface state | Medium |

---

## Validation posture

As of 2026-04-15:
- Frontend typecheck: green.
- Backend targeted pytest: green (pricing matrix, booking creation, booking finance, rule evaluation, golf settings, operational rules foundations).
- Full-suite recertification recommended before any protected-surface work beyond PR9.

---

## UX rebuild slice status (PR1–PR9)

| Slice | Description | Status |
|---|---|---|
| PR1 | Nav hierarchy reset | COMPLETE |
| PR2 | Today dashboard as work queue | COMPLETE |
| PR3 | Tee Sheet cockpit shell + next-action state per booking | COMPLETE |
| PR4 | Booking finance actions (payment-status, post-charge, record-payment) | COMPLETE |
| PR5 | Settings hub at `/admin/settings` | COMPLETE |
| PR6 | Golf guided setup + draft/publish/rollback on rule sets + pricing | COMPLETE |
| PR7 | Finance Close Day wizard | COMPLETE (2026-04-10) |
| PR8 | Performance hub (reports + targets merged, action bridges) | COMPLETE (2026-04-10) |
| PR9 | Superadmin accounting template upload + profile bind | COMPLETE (2026-04-15) |

## Hardening slice status (GL-01–GL-08)

| Slice | Description | Status |
|---|---|---|
| GL-01 | (cleanup) | COMPLETE |
| GL-02 | Quarantine runtime artifacts | COMPLETE |
| GL-03 | Restore superadmin accounting profiles nav | COMPLETE |
| GL-04–06 | UX cleanup slices 1–4, settings navigation | COMPLETE |
| GL-07 | Members workspace ownership cleanup | COMPLETE |
| GL-08 | Golf Settings and Finance Close-Day ownership cleanup | COMPLETE — both pages are content-area-only via `AdminWorkspace`; no page-level shell. |
