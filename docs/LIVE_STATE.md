# GreenLink — Live State

Last updated: 2026-04-15 (post-B5)

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
- `AdminDashboardPage` at `/admin/dashboard` (Today): work queue with unpaid, no-show risk, and arrivals-due alert chips + work cards. AlertChip links deep into tee sheet with pre-scoped filter params. `arrivals_due_count` = reserved bookings due within 90 minutes (B4).
- Guided golf settings (draft/publish/rollback on rule sets and pricing matrices).
- Pricing editor includes playerType, holes, season, day_type, time_band dimensions.
- Refund/correction surface (B2): tee-sheet drawer "Refund" ghost button (enabled when `payment_status === "paid"`), `POST /api/golf/bookings/{id}/post-refund` call, canonical invalidation. Close-day exceptions panel: "Refund follow-up" badge + "Review on Tee Sheet" link for `has_refund_transaction === true`.

Not built:
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
- `FinanceTransactionType.REFUND` — append-only refund transaction type. `POST /api/golf/bookings/{id}/post-refund` endpoint live. Refunded bookings revert to `payment_status=PENDING` and surface in the existing exceptions query. Migration `202604150001_finance_refund_transaction_type.py` chains from `202604130003` and is **applied** (verified 2026-04-15). Frontend type drift resolved (`finance.ts` `"refund"` now matches backend enum).
- Refund/correction surface wiring (B2) complete: tee-sheet drawer "Refund" ghost button (enabled when `payment_status === "paid"`), `POST /api/golf/bookings/{id}/post-refund` call, canonical invalidation. Close-day exceptions panel: "Refund follow-up" badge + "Review on Tee Sheet" link for bookings with `has_refund_transaction === true`.

All finance domain work is complete for current approved scope.

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

## Migration state — verified 2026-04-15

`alembic current` confirmed DB at `202604150001 (head)` — all migrations applied.

| Migration | What it adds | Applied |
|---|---|---|
| `202604130002_booking_fee_snapshot.py` | `bookings.fee_amount`, `bookings.fee_currency` | ✓ |
| `202604130003_pricing_matrix_dimensions.py` | `pricing_rules.player_type`, `pricing_rules.holes`, `pricing_rules.season`, `bookings.holes` | ✓ |
| `202604150001_finance_refund_transaction_type.py` | `refund` value in `financetransactiontype` PostgreSQL enum | ✓ applied 2026-04-15 |

**All features are safe to use. DB is at head.**

### Pre-existing model/DB drift (not blocking, not caused by B-series work)

`alembic check` detects differences between SQLAlchemy models and the live DB schema that are **not covered by any migration**. These represent model changes committed without a corresponding migration file. They are pre-existing and do not affect any feature in the approved scope. They will need migration files before a clean production deploy:

- `club_invitations` table present in models, no migration
- Several index and constraint changes on `accounting_export_profiles`, `finance_tender_records`, `finance_transactions`, `orders`, `pos_transactions`
- `pricing_rules.player_type` / `pricing_rules.season` stored as `VARCHAR` in DB, models use enums
- `news_posts.body` type divergence (`TEXT` vs `String`)

---

## Pending: not started

Nothing in the current approved scope is pending.

---

## Known gaps (post-seed pressure points)

| Gap | Where it will hurt | Priority |
|---|---|---|
| Today page work queue covers tee-sheet-scoped signals only | Unpaid, no-show risk, and arrivals-due are live (B4). Member/account exceptions and finance-wide exception surfacing remain unbuilt. | Medium |
| Filter burden on tee sheet | Dense-day scanning still asks operators to manage a lot of surface state | Medium |

---

## Validation posture

As of 2026-04-15 (post-B5):
- Frontend typecheck: green.
- Frontend test suite: 275/275 passing, 37 test files.
- Backend targeted pytest: green (pricing matrix, booking creation, booking finance, refund foundation, accounting profiles, finance exceptions, superadmin onboarding, rule evaluation, golf settings, operational rules foundations, admin dashboard summary including arrivals-due).
- Full backend suite: passes when run without cross-test DB contention. Pre-existing non-deterministic deadlocks affect some test runs due to shared DB fixture isolation; this is not caused by B-series work and does not indicate logic failures.
- Migration state: DB at head (`202604150001`). All features operational.

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

## B-series hardening slice status

| Slice | Description | Status |
|---|---|---|
| B1 | Refund transaction type + backend endpoint | COMPLETE (2026-04-15) |
| B2 | Refund/correction surface wiring (tee-sheet drawer + close-day exceptions) | COMPLETE (2026-04-15) |
| B3 | Migration/deployment truth pass — Alembic chain verified, test regressions fixed | COMPLETE (2026-04-15) |
| B4 | Seeded-pressure hardening — arrivals-due signal on Today page | COMPLETE (2026-04-15) |
| B5 | Final doc truth pass | COMPLETE (2026-04-15) |
