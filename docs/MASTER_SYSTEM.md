# GreenLink — Master System File

Last updated: 2026-04-15

## Canonical role

This file is the single source of truth for GreenLink's product definition, architecture decisions, identity and session contracts, domain model, route surface, and navigation baseline. It supersedes all prior canonical doc sets (MASTER_SYSTEM.md, CODEX-EXECUTION-RULES.txt, GreenLink-Master-Build-Plan.txt, SYSTEM_STATUS.md, docs/restructure-plan.md, docs/decisions/0001-stack-and-architecture.md, docs/contracts/*).

For current build status, pending work, and known gaps see `docs/LIVE_STATE.md`.

---

## Product definition

GreenLink is a multi-sport club operations OS.

GreenLink is not:
- a POS-first tool
- an accounting software replacement
- a disconnected dashboard bundle
- an admin panel with club features bolted on

GreenLink is:
- a day-to-day operational system for clubs
- centred on tee-sheet-style operational control
- paired with finance operations that reconcile into the club's accounting software
- extensible across golf, tennis, bowls, pro shop, halfway house, and related club domains without losing a coherent system model

---

## Core operating lifecycle

All UX and information architecture must align to this sequence:

1. Setup (Superadmin)
2. Configure (Club Admin within controlled authority)
3. Operate (Staff / Club Admin through operational surfaces)
4. Close Day (Finance reconciliation and export)
5. Report and Improve (targets, performance, trends, interventions)

Lifecycle weighting takes precedence over domain grouping in UX structure.

---

## Non-negotiable rules

### Architecture
- Backend owns logic. Frontend sends intent only.
- No duplicated business rules between backend and frontend.
- No hidden side effects.
- No domain mixing at data/service boundaries.
- Tee sheet is a read model. Do not write tee-sheet state directly from the frontend.
- Orders are not payments. Order placement, charge posting, and settlement recording are distinct concerns.
- Pricing authority is backend-owned: superadmin defines dimensional rules → backend resolves fee → staff executes. No frontend pricing logic.

### Execution discipline
- Do not refactor unrelated code during correction work.
- Controlled architectural rebuilds are allowed only when explicitly scoped to a declared initiative.
- Rebuild work must be feature-flagged where practical, delivered in narrow PR-sized slices, and non-breaking to existing production-safe flows until replacement is validated.
- "Narrow slices only" does NOT prohibit replacing broken logic, duplicate surfaces, dead navigation, or low-value flows when that replacement is the declared purpose of the slice.
- Do not preserve broken logic or bad UX structure merely because it already exists.

### Shell and routing
- Admin and superadmin shells are router-owned persistent layouts. `ProtectedRoute` wraps the layout, not individual pages.
- Admin and superadmin pages render content areas only.
- Do not reintroduce page-level `AdminShell` or `SuperadminShell`.
- All `/admin/*` routes — including `/admin/pos-terminal` — are nested inside `AdminLayout`.
- All new live admin routes must be present in the backend bootstrap `menu_items` contract.

### UI
- Benchmark UI files are the visual authority. Adapt benchmark structure where useful; do not redesign the visual system.
- Do not invent a new design system or unrelated UI patterns during correction work.
- UX flow, navigation structure, and configuration journey may be rebuilt entirely if the visual language remains aligned.

### Finance
- No frontend financial calculations. React must not compute finance totals, balances, arrears, revenue, outstanding values, transaction-volume KPIs, chart widths, or proportions.
- Finance KPI displays and chart bars must use backend read-model endpoints and their pre-computed `pct` fields only (`revenue_share_pct`, `volume_share_pct`, `accounts_*_pct`). Never derive these client-side.
- If a backend finance summary does not exist for a metric, remove the metric or show a neutral unavailable state.
- Finance is a first-class system pillar, not a secondary dashboard. It assists club operations and reconciles into the client accounting system — it is not an accounting-system replacement.

### Player
- No fake booking data in player UI. Do not create placeholder booking arrays to fill empty states.
- If a backend member-booking read model does not exist, show loading or empty state only.

### Superadmin club management
- Pause and reactivate: `PATCH /superadmin/clubs/{id}/status` with `{ active: bool }`.
- Hard delete: `DELETE /superadmin/clubs/{id}` — blocked for live clubs (`registry_status == "active"`). Must clear non-cascading FK columns before deleting the club row. Requires confirmation modal in UI.
- Superadmin actions that are club-specific must carry a concrete club selection into the destination route; do not drop users into unscoped admin pages.
- Superadmin may bridge into existing club-scoped `/admin/*` workspaces after selecting a club; do not duplicate finance, rules, or dashboard surfaces inside superadmin when the admin workspace already exists.
- Superadmin owns structural setup, module enablement, finance/accounting alignment, and major configuration authority. Club admin owns controlled operational configuration within those guardrails.

### Onboarding
- Onboarding progression is backend-only. Frontend must not set current, next, or previous onboarding steps or state directly.
- Frontend sends step intent only. Backend validates transitions, rejects invalid progression, and returns resulting state.
- Superadmin onboarding must trend toward club readiness and go-live validity, not generic form completion.

---

## Product hierarchy

### Tier 1 — Core system pillars

- Tee Sheet / operational booking control
- Finance operations and export-to-accounting
- Members / accounts / club people operations
- Reporting, targets, and performance review

### Tier 2 — Operational extensions

- Pro Shop
- Halfway House
- Tennis
- Bowls

### Tier 3 — Add-on / adjunct surfaces

- POS
- Orders
- Communications

Tier 2 and Tier 3 surfaces may be important for some clubs but must not outweigh or structurally distort Tier 1.

---

## Stack and architecture

- Python, FastAPI, SQLAlchemy 2.x, Alembic, PostgreSQL.
- Redis as an integration point for future cache and queue work.
- React, TypeScript, Vite, React Router, TanStack Query.
- Modular monolith with explicit tenancy and backend-owned session bootstrap.

Key decisions:
- Global user type is only `superadmin` or `user`. Real club authority lives in `ClubMembership.role`.
- Refresh tokens are stored server-side as hashed `AuthSession` rows and rotated on refresh.
- Platform bootstrap is one-time and permanently locked through persisted `PlatformState`.
- Selected club context is not embedded in access tokens; passed explicitly and validated centrally.
- Auth and session datetimes normalised to UTC-aware values at the shared type/helper layer.
- JWT `sub` remains a string in token, converted to `UUID` at the auth boundary before any ORM query.

---

## Identity model

```
User (optional login) → Person (platform identity) → ClubMembership (club-local authority)
```

### Person

Platform-wide identity. Fields: `id`, `first_name`, `last_name`, `full_name`, `email`, `phone`, `date_of_birth`, `gender`, `external_ref`, `notes`, `profile_metadata`, timestamps.

Normalisation: emails stored lowercase; phone normalised for matching and duplicate detection.

### ClubMembership

Club-local relationship surface. Fields: `id`, `person_id`, `club_id`, `role`, `status`, `joined_at`, `is_primary`, `membership_number`, `membership_metadata`.

Role vocabulary: `club_admin`, `club_staff`, `member`.

Status vocabulary: `active`, `invited`, `suspended`, `inactive`.

`membership_metadata` carries backend-owned extended fields including `pricing_player_type`.

### User linkage

`User` is optional. People can exist without credentials. Membership records do not require a `User`. Tenancy for authenticated users is resolved through the linked person's memberships.

### AccountCustomer

Club-scoped, linked to `Person`. Fields: `id`, `club_id`, `person_id`, `account_code`, `active`, `billing_email`, `billing_phone`, `billing_metadata`.

---

## Session bootstrap contract

`GET /api/session/bootstrap` is the frontend source of truth.

Inputs: Bearer access token. Optional `selected_club_id` query param or `X-Club-Id` header.

Response fields: `user`, `available_clubs`, `selected_club_id`, `selected_club`, `club_selection_required`, `role_shell`, `default_workspace`, `landing_path`, `menu_items`, `module_flags`, `permissions`.

Resolution rules:
- One active club membership → auto-select.
- Multiple active club memberships → require explicit selection.
- Zero active memberships for non-superadmin → no selected club, no shell, `/login` landing path.
- Superadmin → resolves to dedicated superadmin shell without club selection.

Landing rules:
- `club_admin` and `club_staff` → `/admin/dashboard`.
- `member` → `/player/home`.
- `superadmin` → `/superadmin/clubs`.

`menu_items` is the shell/access contract. Frontend route access checks align to `menu_items`. The visible sidebar may intentionally expose a smaller primary-nav subset. Demoted but valid admin routes remain in `menu_items` for access control.

Related auth routes: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`.

---

## People API surface

- `GET /api/people`
- `POST /api/people`
- `GET /api/people/club-directory`
- `GET /api/people/{person_id}`
- `PATCH /api/people/{person_id}`
- `GET /api/people/{person_id}/memberships`
- `GET /api/people/{person_id}/integrity`
- `POST /api/people/memberships`
- `PATCH /api/people/memberships/{membership_id}`
- `POST /api/people/account-customers`
- `POST /api/people/bulk-intake/preview`
- `POST /api/people/bulk-intake/process`

Club-scoped people routes require explicit `selected_club_id` query param or `X-Club-Id` header.

`GET /api/people/{person_id}/integrity` returns: person summary, duplicate candidates, profile readiness, membership readiness, account-customer readiness, structured issues/exceptions. Readiness status values: `ready`, `warning`, `blocked`.

Bulk intake matching is deterministic: normalised email match, normalised phone match, ambiguous multi-person matches reject the row, no hidden fuzzy merge. Row outcomes: `create_person_create_membership`, `match_existing_create_membership`, `match_existing_update_membership`, `reject_row`, `warning_only`. `preview` classifies without persisting; `process` applies and persists.

---

## Pricing model

Pricing authority is fully backend-owned. The resolution stack:

1. Superadmin defines `PricingRule` rows inside a `PricingMatrix` attached to a `BookingRuleSet`.
2. `BookingCommercialService` resolves the correct fee at booking create/update time and snapshots it onto `bookings.fee_amount` / `bookings.fee_currency`.
3. `TeeSheetService` re-resolves fee for existing bookings without a snapshot when building the read model.

### Pricing dimensions (4)

| Dimension | Enum | ANY sentinel |
|---|---|---|
| `player_type` | `PricingPlayerType` | — (required, no ANY) |
| `holes` | int (9 or 18) | — (required, no ANY) |
| `day_type` | `PricingDayType` | `any` |
| `season` | `PricingSeason` | `any` |

Plus: `time_band` (`PricingTimeBand`): `any`, `morning`, `afternoon`, `custom`.

### PricingPlayerType values

`member_standard`, `visitor_affiliated`, `visitor_non_affiliated`, `scholar`, `student`, `pensioner`, `staff_courtesy`.

Stored in `membership_metadata.pricing_player_type`. Resolved by `BookingCommercialService.resolve_pricing_player_type()`:
- Guest participant + affiliated membership metadata → `visitor_affiliated`
- Guest participant otherwise → `visitor_non_affiliated`
- Staff participant / staff role → `staff_courtesy`
- Member with metadata → from metadata
- Member without metadata → `member_standard`

### PricingSeason values

`any`, `peak`, `off_peak`.

### Rule evaluation

`RuleEvaluationService.resolve_pricing()` matches on all dimensions in order: `applies_to`, `player_type`, `holes`, `day_type`, `season`, `time_band`. Rules are specificity-ranked (more specific dimensions = higher score). Collisions at equal specificity emit a warning trace. Unresolved context (no `pricing_player_type` or no `holes`) emits an unresolved trace.

### PricingRuleAppliesTo

`member`, `guest`, `staff`.

---

## Tee sheet domain

Tee sheet is a read model. All mutations go through backend commands.

Booking lifecycle commands:
- `POST /api/golf/bookings` — create booking
- `PATCH /api/golf/bookings/{id}` — update party/details
- `POST /api/golf/bookings/{id}/check-in`
- `POST /api/golf/bookings/{id}/no-show`
- `POST /api/golf/bookings/{id}/cancel`
- `POST /api/golf/bookings/{id}/move` — move booking to a different slot
- `POST /api/golf/bookings/{id}/move-participant` — participant-level split move

Booking finance commands:
- `PATCH /api/golf/bookings/{id}/payment-status`
- `POST /api/golf/bookings/{id}/post-charge`
- `POST /api/golf/bookings/{id}/record-payment`
- `POST /api/golf/bookings/{id}/post-refund`

Booking fields relevant to pricing:
- `holes` — 9 or 18, resolved at booking creation by `BookingCommercialService.resolve_booking_holes()`
- `fee_amount`, `fee_currency` — snapshotted at creation; re-resolved by tee sheet service if absent
- `fee_label` — optional human-readable label
- `payment_status` — `pending`, `paid`, `complimentary`, `waived`

---

## Finance domain

- `FinanceAccount`, append-only `FinanceTransaction`, journal, ledger, revenue summary, outstanding summary, transaction-volume summary are built.
- Revenue/volume/account-share pct fields are computed backend-side.
- Canonical export batches and mapped accounting export profiles are built.
- Mapped export execution, reconciliation, drift detection, and regeneration are backend-owned.
- Admin finance KPI surfaces use backend summary endpoints only. No finance math in React.
- Finance close-day wizard: Exceptions → Generate Batch → Reconcile → Export → Audit Trail.
- `GET /api/finance/exceptions?date=YYYY-MM-DD` — tenant-scoped finance exceptions endpoint.
- Drift detection blocks the Export step when `reconciliation.matches_live_state === false`.
- Refund/correction: `POST /api/golf/bookings/{id}/post-refund` — backend-owned, append-only refund. Creates a `FinanceTransactionType.REFUND` entry (positive amount, credit to member account). Requires booking in PAID status. Reverts `payment_status → PENDING` so the booking surfaces in the exceptions queue for close-day resolution. No frontend finance math — all logic is backend-owned.

---

## Superadmin domain

- Distinct superadmin route group and persistent shell.
- Onboarding progression is backend-owned; frontend sends step intent only.
- Club registry, club creation, and onboarding workspace (Basic Info, Finance, Rules, Modules) are live.
- Rules step reads real club-scoped rule sets and pricing matrices.
- Modules step reads the canonical backend module catalog and persists validated club module configuration.
- Superadmin can bridge into existing club-scoped admin workspaces after selecting a club.
- `/superadmin/accounting-profiles` — accounting profile management route is live.
- Superadmin accounting template upload + profile bind: BUILT. `AccountingTemplateService` handles CSV parse, sample-layout generation, profile creation, active toggle, and club binding. See LIVE_STATE.md for build status detail.

---

## Player domain

- Player home, player ordering, and member booking creation are live.
- Player booking flow uses live tee-sheet read model plus `POST /api/golf/bookings` with `source="member_portal"`.
- Backend player booking read model exists; player home consumes it directly.
- `/player/profile` consumes a dedicated backend self-profile contract.
- Player mobile-tab navigation is driven by backend bootstrap menu truth across all player pages.

---

## Admin navigation baseline

Primary admin navigation is lifecycle-weighted: Today · Tee Sheet · People · Finance · Performance · Operations · Settings.

Backend `MENU_ITEMS` in `session_bootstrap_service.py` is the shell/access contract.

`AdminSidebar` is the visible primary-nav contract and may intentionally hide valid direct-link admin routes that remain in bootstrap `menu_items` for access control.

Current sidebar structure:
- Ungrouped (always visible): Today (`/admin/dashboard`), Settings (`/admin/settings`).
- Golf group (collapsible): Golf Summary, Tee Sheet.
- People group (collapsible): People Summary, Members.
- Finance group (collapsible): Finance Summary, Close Day.
- My Club group (collapsible): Performance, Communications.
- Operations group (collapsible, module-driven): Halfway, Pro Shop, POS Terminal, Order Queue.
- Groups open when current route falls within them; can be toggled closed.
- `pos` is labelled `Commerce` in the module catalog.
- `targets` key is filtered from sidebar but retained in bootstrap for `ProtectedRoute` access enforcement.

---

## Route surface

### Admin

| Route | Surface |
|---|---|
| `/admin/dashboard` | Today workspace |
| `/admin/golf/dashboard` | Golf domain summary |
| `/admin/golf/tee-sheet` | Operational tee sheet |
| `/admin/golf/settings` | Guided golf settings setup |
| `/admin/people/dashboard` | People summary (access-only) |
| `/admin/members` | Member directory |
| `/admin/finance/dashboard` | Finance summary |
| `/admin/finance` | Close Day workflow |
| `/admin/reports` | Performance hub |
| `/admin/halfway` | Halfway house operations |
| `/admin/pro-shop` | Pro shop |
| `/admin/pos-terminal` | POS terminal |
| `/admin/orders` | Order queue |
| `/admin/settings` | Settings hub |
| `/admin/settings/modules` | Module visibility (read-only) |
| `/admin/targets` | Club targets (access-only) |
| `/admin/communications` | News posts |
| `/admin/settings/club` | Legacy redirect → `/admin/settings` |
| `/admin/settings/profile` | Legacy redirect → `/admin/settings` |

### Superadmin

| Route | Surface |
|---|---|
| `/superadmin/overview` | Fleet entry |
| `/superadmin/clubs` | Club setup workspace |
| `/superadmin/accounting-profiles` | Accounting profile management |

### Player

| Route | Surface |
|---|---|
| `/player/home` | Player home |
| `/player/book` | Booking flow |
| `/player/order` | Ordering |
| `/player/profile` | Self-profile |

---

## Layout and UI authority

- Admin shell: router-owned, persistent across `/admin/*`. `ProtectedRoute` wraps the layout, not individual pages.
- Superadmin shell: router-owned, persistent across `/superadmin/*`.
- Admin and superadmin pages render content areas only.
- Benchmark UI references: `frontend/src/ui-benchmarks/`, `frontend/src/design-system/greenlink-design-system.md`.

---

## Frontend invalidation pattern

`frontend/src/features/operational-read-models/invalidation.ts` — `invalidateClubOperationalReadModels()` is the canonical function for busting all cross-domain read model caches after any booking write operation. Use this; do not scatter individual `invalidateQueries` calls across mutation handlers.
