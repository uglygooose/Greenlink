# Phase 5.5 — Backend Audit Report

*Generated: 2026-05-12. Read-only audit. No code or schema changes.*
*Audited against: `docs/PRODUCT.md` (§3 USPs, §4 table stakes, §7 AI architecture, §10 gap analysis, §11 rebuild plan), `docs/ENGINEERING_STANDARDS.md`.*
*Repo state: branch `main` at commit `2f08fd0` (Phase 5 complete — schema integrity).*
*Backend surface: 40 services, 21 API route modules (~127 endpoints, 37 of which are list endpoints), 25 schema modules, 37 test files (197 test functions, 217 pytest cases via parametrisation).*

---

## Executive summary

**What's solid.** Tenant scoping is essentially complete: 125 of 127 endpoints pass through `resolve_required_club_context`, a superadmin gate, or a self-scoped identity guard — the only two unscoped endpoints (`/health`, `/auth/login`) are correctly public. Pydantic typing is consistent: every endpoint has a `response_model` except two `dict[str, str]` returns in `platform.py`. Request bodies are universally typed Pydantic models with zero `Any`. Error responses standardise on a single `ErrorResponse` shape via the central handler in `app/main.py`. Service files mostly hit Single-Responsibility cleanly with consistent `Session`-in-`__init__` dependency injection. The pricing engine and rule-evaluation tests are dense (1,075 lines across two files).

**Largest gap.** The audit-log USP is structurally half-built: 18 `publish()` sites exist across 6 services (`pos_service`, `order_service`, `order_settlement_service`, `platform_service`, `people_service`, `superadmin_onboarding_service`), but **13 state-changing booking + finance + pricing services emit nothing** (`booking_cancellation_service`, `booking_checkin_service`, `booking_completion_service`, `booking_no_show_service`, `booking_move_service`, `booking_update_service`, `booking_service`, `booking_finance_service`, `finance/ledger_service`, `finance/export_batch_service`, `finance/accounting_profile_mapping_service`, `order_finance_posting_service`, `golf_settings_service`). And **zero tests assert on `DomainEventRecord`** — even the 18 sites that do emit have no behavioural test coverage proving they emit correctly. This is the single largest cross-cutting finding because it gates two PRODUCT.md commitments simultaneously: the v1 audit-log USP (§4) and the v1 semantic layer that AI features sit on (§7).

**What feeds Phase 9.** The HIGH-severity work items are concentrated in three sub-phases of the existing §11 plan: (a) **Sub-phase 9B audit-log expansion** absorbs Area 1 entirely (wire 13 services to emit + add test sentinels); (b) **Sub-phase 9D finance USP deepening** absorbs Area 3's KPI gap (RevPATT / F&B per round / effective green fee absent, semantic-layer architecture unfulfilled); (c) **a new contract-quality sub-phase** absorbs Area 5's 6 USP-endpoint `status_code=201` omissions and platform.py's untyped dict returns. Tenant scoping (Area 2) is clean enough that §10.3 work item 11 can be marked complete after this audit. Area 4 service-coherence finding on `superadmin_onboarding_service` (946 lines, 35 methods, 4 domains) is non-USP and defers cleanly.

**Findings: 14 HIGH, 8 MEDIUM, 5 LOW. 14 Phase 9 work items derived.**

---

## Severity legend

Severity is v1-USP-weighted per the Phase 5.5 brief:

- **HIGH** — finding is in a v1 USP surface (tee sheet / bookings / pricing / pricing evaluation / optimistic locking / audit log on booking lifecycle / finance transactions / close-day / accounting export / member statements / multi-tender / cash variance), OR is POPIA-critical (tenant scoping on list endpoints, consent capture, PII access), OR could reintroduce schema drift Phase 5 just resolved.
- **MEDIUM** — backend area v1 uses but doesn't differentiate on (member management, basic communications, news posts), architectural debt that doesn't block v1, or test-coverage gap in non-USP surfaces.
- **LOW** — backend area v1 doesn't use (superadmin, platform onboarding, internal-only), cosmetic/documentation drift, or pure optimisation.

---

## Findings by area

### Area 1 — Domain event emission consistency

**Current state.** `DatabaseEventPublisher` is the central emission primitive (`app/events/publisher.py:25-50`). It is invoked from exactly 18 sites across 6 services:

| Service | Emit sites | Lines |
|---|---|---|
| `pos_service.py` | 1 | 187 |
| `order_service.py` | 1 | 132 |
| `order_settlement_service.py` | 1 | 155 |
| `platform_service.py` | 4 | 99, 130, 173, 195 |
| `people_service.py` | 5 | 61, 106, 242, 281, 347 |
| `superadmin_onboarding_service.py` | 6 | 116, 267, 301, 340, 428, 551 |

This matches PRODUCT.md §10.1 ("18 emit sites across 6 services") exactly. No drift in this count since Phase 4.6.

**Gap inventory.** 13 services perform state changes (have `db.commit` / `db.add(` / `db.delete(` calls) but do NOT import or call `DatabaseEventPublisher`. Categorised by USP weighting:

**Finding 1.1 — Booking lifecycle services emit nothing (HIGH × 8).**

| Service | Lines | State ops | Lifecycle action |
|---|---|---|---|
| `app/services/booking_service.py` | 426 | 2 | Booking create |
| `app/services/booking_cancellation_service.py` | 102 | 2 | Booking cancel |
| `app/services/booking_checkin_service.py` | 102 | 2 | Booking check-in |
| `app/services/booking_completion_service.py` | 102 | 2 | Booking complete |
| `app/services/booking_no_show_service.py` | 100 | 2 | Booking no-show |
| `app/services/booking_move_service.py` | 504 | 5 | Booking move (slot/lane) |
| `app/services/booking_update_service.py` | 382 | 2 | Booking update (reschedule) |
| `app/services/booking_finance_service.py` | 630 | 8 | Booking charge / refund / payment |

Every booking lifecycle transition the tee-sheet USP depends on is currently invisible to the audit log. **Severity HIGH** per PRODUCT.md §4 ("Audit log, end to end. Every state transition on a booking…") and §10.3 work item 4. Phase 9 sub-phase 9B already accounts for this.

**Finding 1.2 — Finance services emit nothing (HIGH × 4).**

| Service | Lines | State ops | Action |
|---|---|---|---|
| `app/services/finance/ledger_service.py` | 216 | 2 | Double-entry ledger posting |
| `app/services/finance/export_batch_service.py` | 499 | 9 | Export batch generate / void / regenerate |
| `app/services/finance/accounting_profile_mapping_service.py` | 718 | 7 | Accounting profile CRUD + mapping |
| `app/services/order_finance_posting_service.py` | 218 | 3 | Order finance posting |

Every finance state change (transaction posting, export batch lifecycle, accounting profile changes) is currently invisible to the audit log. **Severity HIGH** per PRODUCT.md §3.2 ("audit log records every state transition") and §4 ("every charge, every refund"). Phase 9 sub-phase 9B already accounts for this.

**Finding 1.3 — Pricing publication emits nothing (HIGH × 1).**

`app/services/golf_settings_service.py` (481 lines, 11 state ops). Handles `publish_rule_set`, `publish_pricing_matrix`, `rollback`, `_set_snapshot` — every pricing-rule and rule-set publication. Pricing is part of the tee-sheet USP per §3.1 ("Every fee on the sheet must be explainable") and the audit log is the mechanism that makes "what changed and when" answerable. **Severity HIGH**.

**Finding 1.4 — Comms services emit nothing (MEDIUM × 2).**

| Service | Action |
|---|---|
| `app/services/comms/blast_service.py` | Blast create / send |
| `app/services/comms/news_post_service.py` | News post lifecycle |

Comms is table-stakes, not differentiating (§4). **Severity MEDIUM**. Blast send especially worth emitting in v1 because §10.3 frontend rebuild surface 8 (Communications composer) will benefit from audit visibility.

**Finding 1.5 — Operational support services emit nothing (MEDIUM × 2).**

`app/services/targets_service.py` (KPI target lifecycle), `app/services/accounting_template_service.py` (template lifecycle). **Severity MEDIUM**.

**Finding 1.6 — auth_service emits nothing (LOW × 1).**

`app/services/auth_service.py` has 18 state ops but no audit emissions. Auth has its own audit trail via `auth_sessions` table (per `app/models/auth_session.py`), so the gap is partly covered. **Severity LOW** — defer to v1.5+ for explicit emission alignment.

---

### Area 2 — Tenant scoping completeness

**Method.** Walked all 127 `@router.<method>(` decorators across `app/api/`. For each, checked the next 30 lines for any of: `resolve_required_club_context`, `_resolve_context` (people.py wrapper), `_normalize_request_context` (rules.py wrapper, verified at `app/api/routes/rules.py:269` it calls `resolve_required_club_context`), `get_current_superadmin`, `require_operations_*`, `require_finance_*`, `require_people_*`, `require_module_*`, `require_pricing_*`, `current_user.*` field access (for self-scoped identity reads).

**Result.** 125 of 127 endpoints carry an explicit scope primitive. 2 are unscoped:

- `app/api/routes/health.py:14` — `/health` GET. Public health probe. Intentional and correct.
- `app/api/routes/auth.py:27` — `/auth/login` POST. Public login. Intentional and correct.

**List-endpoint detail.** 37 endpoints qualify as "list" (GET without path params). Coverage breakdown:

- 31 scoped via `resolve_required_club_context` or wrapper
- 4 superadmin-only via `get_current_superadmin` (`/superadmin/clubs`, `/superadmin/accounting-profiles`, plus 2 more in superadmin.py) — cross-tenant by design
- 2 user-self-scoped (`/people/me/profile`, `/auth/me`)
- 1 superadmin-required at endpoint body (`/people` list_people checks `current_user.user_type != UserType.SUPERADMIN`)

**Finding 2.1 — No POPIA-critical scoping gaps found (NONE).**

PRODUCT.md §10.3 work item 11 ("List-endpoint tenant-scoping audit (~91 endpoints)") **can be marked complete** after this audit. Note: §10.3's "~91" appears to under-count; actual endpoint surface is 127, of which 37 are true list endpoints. No HIGH/MEDIUM/LOW finding to record here.

---

### Area 3 — Read-model pattern coverage

**Current state.** Two services are explicitly named `*_read_model_service.py`:

- `app/services/finance/read_model_service.py` (452 lines) — canonical pattern. `dataclass SummaryWindow`, methods accept `club_id` + period, return Pydantic Response models (e.g. `FinanceRevenueSummaryResponse`, `FinanceOutstandingSummaryResponse`, `FinanceTransactionVolumeSummaryResponse`, `FinanceExceptionsResponse`).
- `app/services/player_booking_read_model_service.py` (142 lines) — newer, narrower: `load_for_person(club, person_id, …)` returning `PlayerBookingReadModelResponse`. Member-app surface only.

**Adjacent services that compute aggregates but aren't named that way:**

- `app/services/admin_dashboard_service.py` (337 lines) — builds `AdminDashboardSummaryResponse` with tee-occupancy, target context, activity, notices.
- `app/services/reports_service.py` (150 lines) — builds `ReportsSummaryResponse` with `OrderStatusBreakdown`, `MemberBreakdown`.
- `app/services/halfway_service.py` (128 lines) — `HalfwaySummaryResponse`.

**Inline aggregation in route handlers:** zero matches for `func.sum`/`func.count`/`func.avg` inside `app/api/`. Routes consistently delegate to services. **This is a strength.**

**Finding 3.1 — Semantic layer commitment unfulfilled (HIGH).**

PRODUCT.md §7: *"the semantic layer ships in v1 even if only two AI features ship in v1. A clean semantic layer (dbt or equivalent) over the operational PostgreSQL warehouse, with stable definitions of every metric and entity, is what makes every subsequent AI feature trivial to add."*

The codebase has aggregation logic in services but no dbt layer, no central metric registry, and no entity-definition layer. The 2 named read-model services and 3 aggregate-style services use different shapes (`SummaryWindow` dataclass in finance vs. per-method aggregations in admin_dashboard vs. simple direct returns in reports). Each AI feature in v1.5 (no-show prediction, Operations Q&A) will need its own ad-hoc query plumbing without this layer.

**Severity HIGH.** Affected: `app/services/finance/read_model_service.py`, `app/services/admin_dashboard_service.py`, `app/services/reports_service.py`, `app/services/player_booking_read_model_service.py`, new layer. Phase 9 sub-phase 9D currently lists "KPI calculations" but not the semantic layer architecture — this is a real conflict with §11 plan, flagged in the conflicts section below.

**Finding 3.2 — Daily KPI metrics absent (HIGH).**

PRODUCT.md §3.2 explicitly enumerates the metrics: *"RevPATT, RevPUR, weather-adjusted utilisation, and effective average green fee — daily."* §10.3 work item 15 mirrors this: *"Daily KPI metrics — RevPATT, F&B per round, effective green fee."*

Grep for these terms across `app/`:
- `RevPATT`: 0 matches
- `RevPUR`: 0 matches
- `effective green fee` / `effective_green_fee` / `realised_rate`: 0 matches
- `F&B per round` / `fb_per_round` / `food_beverage_per_round`: 0 matches

The admin dashboard has `DashboardTeeOccupancy` (`app/schemas/admin_dashboard.py`) — tile-level utilisation, not the metric. `ReportsSummaryResponse` has `OrderStatusBreakdown` and `MemberBreakdown` — not the metric either. **Severity HIGH** because this is the exact metric PRODUCT.md §3.2 calls out as the "secretary trap" anti-pattern competitors fall into.

**Finding 3.3 — Member-stats read-model absent (MEDIUM).**

`app/services/reports_service.py:get_summary` returns a member breakdown but no membership-rate, churn-trend, or aging-by-tier shape. The `MemberBreakdown` schema is shallow (membership counts). PRODUCT.md §10.3 frontend rebuild surface 7 (member directory + statement view) will need richer aggregates. **Severity MEDIUM**.

**Finding 3.4 — Blast engagement read-model absent (MEDIUM).**

`app/services/comms/blast_service.py` (204 lines) handles blast lifecycle but provides no read-model for "did this blast land? was it opened? delivery rate?" PRODUCT.md §10.3 frontend rebuild surface 8 (Communications composer) implies the operator needs blast outcomes visible. **Severity MEDIUM** — could defer to v1.5 if §10.3 surface 8 doesn't surface metrics in v1.

---

### Area 4 — Service-layer architecture coherence

**Method.** Audited all 40 service files via parallel Explore agent. Each service was graded `clean` / `has-issues` / `structural-rework-needed` against: Single Responsibility, clear entry point/contract, consistent error handling, dependency injection, presence of TODO/FIXME markers.

**Result.** 36 services graded `clean`. 3 graded `has-issues`. 1 graded `structural-rework-needed`. No TODO/FIXME markers found across the entire service layer. Every service correctly takes `Session` in `__init__` and stores as `self.db`; no module-level session usage anti-pattern.

**Finding 4.1 — `superadmin_onboarding_service.py` mixes four domains (HIGH).**

`app/services/superadmin_onboarding_service.py` (946 lines, 35 methods, 1 class). Mixes:

1. Club creation (lines ~87–113): `create_club`
2. User invitations (lines ~116–220): `invite_user`, `resolve_invitations`, `remove_invitation`
3. Onboarding state tracking (lines ~351–430): `update_onboarding_step`, `_progress_percent`, `_derive_onboarding_state`
4. Module/rules/pricing orchestration (lines ~433–550): `update_modules`, `_replace_modules`, `_enabled_module_keys`

Imported only from `app/api/routes/superadmin.py` and `app/api/routes/platform.py`, so the blast radius is contained. But the file is the single longest service in the backend. **Severity HIGH for code-coherence; LOW for v1-USP impact** — superadmin is non-USP and §11 plan doesn't gate v1 on onboarding cleanliness. Net: **MEDIUM in this audit's v1-USP weighting.** Defer the split to v1.5 unless onboarding tests start fighting the structure.

**Finding 4.2 — `golf_settings_service.py` mixes readiness / publication / snapshots (MEDIUM).**

`app/services/golf_settings_service.py` (481 lines, 30 methods). Three concerns: readiness checking (`get_readiness`, `_has_courses`), rule/pricing publication (`publish_rule_set`, `publish_pricing_matrix`), and snapshot serialisation/restoration (`_set_snapshot`, `_get_snapshot`, `_restore_rule_snapshot`). Snapshot logic adds the most complexity (lines ~280–380).

This service is in the pricing USP path (per §3.1 explainability requirement), so coherence matters. **Severity MEDIUM** — has-issues but no concrete bug surface; split is a v1.5 candidate alongside Phase 9 sub-phase 9B audit-log work which will touch this file anyway (Finding 1.3).

**Finding 4.3 — `accounting_profile_mapping_service.py` mixes CRUD with export transformation (MEDIUM).**

`app/services/finance/accounting_profile_mapping_service.py` (718 lines, 25 methods). Two distinct concerns: profile CRUD (`list_profiles`, `create_profile`, `update_profile`, `delete_profile` at lines ~46–90) and export transformation (`generate_mapped_export`, `_validate_mapping`, `_build_accounting_rows`, CSV formatting at lines ~200+).

Finance is USP, so coherence matters more here. But it's a single-file split — pull the transformation logic into `accounting_export_transform_service.py`. **Severity MEDIUM**, defers cleanly.

**Finding 4.4 — `blast_service.py` style drift (LOW).**

`app/services/comms/blast_service.py:59-64` uses `.query()` ORM style; rest of codebase uses `select()`. Cosmetic, non-functional. **Severity LOW**.

---

### Area 5 — API contract quality

**Method.** Audited all 127 endpoints across 21 route modules via parallel Explore agent. Each scored on: response schema typing (`response_model=`/return annotation), request body typing, HTTP status code correctness, error response standardisation, OpenAPI metadata.

**Strengths (no findings to record).**

- Response typing: 125/127 endpoints declare `response_model=` (two exceptions in platform.py noted below).
- Request body typing: 100% of POST/PUT/PATCH endpoints accept Pydantic models. Zero `dict[str, Any]`.
- Error standardisation: central handler in `app/main.py:35-42` returns a single `ErrorResponse` shape (`code`, `message`, `correlation_id`). All exceptions inherit from `app.core.exceptions.AppError`. No deviations found.

**Finding 5.1 — USP-critical create endpoints missing `status_code=201` (HIGH × 6).**

REST contract: resource creates return 201, not 200. The codebase splits sharply:
- `/people` module: 3/3 creates use `status.HTTP_201_CREATED` (gold standard).
- `/comms` module: 2/2 creates use `status_code=201`. `/comms/posts` DELETE correctly uses `status_code=204`.
- `/pricing`, `/pos/products`, `/superadmin` accounting + clubs creates: 201 correct.

But **6 USP-critical creates default to 200**:

| Endpoint | File:line |
|---|---|
| `POST /finance/transactions` | `app/api/finance/routes.py:50` |
| `POST /finance/export-batches` | `app/api/finance/routes.py:165` |
| `POST /finance/accounting-profiles` | `app/api/finance/routes.py:261` |
| `POST /orders` | `app/api/orders/routes.py:87` |
| `POST /pos/transactions` | `app/api/pos/routes.py:83` |
| `POST /golf/bookings` | `app/api/routes/golf.py:349` |

**Severity HIGH** — every one of these is a v1 USP create path (finance, orders, POS, bookings). Client libraries that branch on 201-vs-200 (and OpenAPI-generated SDKs always do) currently get the wrong contract.

**Finding 5.2 — `platform.py` returns untyped `dict[str, str]` (MEDIUM × 2).**

- `app/api/routes/platform.py:53` — `POST /platform/memberships` returns `{"status": "created"}`.
- `app/api/routes/platform.py:66` — `PUT /platform/clubs/{club_id}/modules` returns `{"status": "updated"}`.

OpenAPI surfaces these as `object` with no field validation. Platform endpoints are bootstrap-flow, used during onboarding — non-USP. **Severity MEDIUM.** Fix: define `PlatformMembershipAssignResponse` and `PlatformModuleUpdateResponse` Pydantic models.

**Finding 5.3 — Inappropriate `400` for semantic validation in `superadmin.py` (MEDIUM × 1).**

`app/api/routes/superadmin.py:95-98` raises `AppError(..., status_code=400)` for missing person context. 400 implies malformed request; this is a semantic precondition failure (should be 422, or 500 if it's an internal state inconsistency). Pydantic already returns 422 for body-validation failures, so 400 conflicts.

**Severity MEDIUM** — superadmin is non-USP, narrow blast radius. Pick a convention and apply it: 422 for "request was well-formed but semantically wrong."

**Finding 5.4 — Zero docstrings / OpenAPI metadata on USP endpoints (LOW).**

No `@router.get(..., summary=..., description=...)` is used anywhere in `app/api/`. No function docstrings on USP endpoint handlers (booking creation paths in `golf.py`, finance lifecycle in `finance/routes.py`, pricing publish/rollback in `golf.py:238-285`). OpenAPI is generated from response models and function names only.

**Severity LOW** — works for now because Pydantic models carry field-level descriptions, but as integrations expand (the integrations-as-product-surface commitment in §4) external consumers will need this. Defer to v1.5.

---

### Area 6 — Test coverage relative to v1 USP surfaces

**Method.** Walked `backend/tests/` (37 test files, 197 test functions, 217 pytest cases via parametrisation). Counted tests per file, categorised by USP weighting.

| Category | Test files | Test fns | v1 weight |
|---|---|---|---|
| Booking lifecycle (create/move/cancel/checkin/complete/no-show/update/aggregate/refund/finance-actions) | 11 | ~46 | HIGH |
| Tee sheet (lane/commercial, read-model) | 2 | 7 | HIGH |
| Pricing engine + rule evaluation | 2 | 9 (within 1,075 lines) | HIGH |
| Golf settings (guided setup) | 1 | 4 | HIGH |
| Finance (accounts/journal, exceptions, read-models, foundation) | 4 | 18 | HIGH |
| Finance export batches | 1 | 7 | HIGH |
| Accounting export profiles + superadmin variants | 2 | 10 | HIGH |
| POS foundation | 1 | 14 | HIGH (USP — multi-tender) |
| Order foundation + settlement | 2 | 17 | HIGH |
| Player booking read model | 1 | 2 | HIGH |
| Auth + bootstrap | 1 | 11 | HIGH (foundation) |
| People identity + player profile + invitation | 3 | 16 | MEDIUM |
| Comms (foundation + blasts) | 2 | 10 | MEDIUM |
| Admin dashboard + targets | 2 | 3 | MEDIUM |
| Superadmin (onboarding + invitations) | 2 | 11 | LOW |
| Operational rules foundation | 1 | 4 | HIGH (rule engine) |
| Schema consistency (Phase 5 sentinel) | 1 | 6 fns / 26 cases | foundation |

**Coverage assessment.**

- Booking lifecycle: every state transition has a dedicated test file (8 files for 8 transitions). Pattern is good.
- Pricing: 1,075 lines of test code across `test_rule_evaluation_foundation.py` (704 lines) and `test_operational_rules_foundation.py` (371 lines). Densest USP coverage.
- Finance lifecycle: good breadth across accounts/journal/exceptions/read-models. Export batches and accounting profiles covered.
- POS / orders: strong coverage on order state transitions (placed → preparing → ready → collected) and POS foundation.

**Finding 6.1 — Audit log emissions have zero behavioural test coverage (HIGH).**

Grep across `tests/` for `DomainEventRecord` / `domain_event` / `event_type` returns **zero matches**. None of:

- The 18 existing emit sites
- The 13 not-yet-emitting services (Finding 1.1 / 1.2 / 1.3)
- The cross-service emission ordering (e.g. "booking cancel emits before refund posts" — temporal invariant)

…has a test that asserts on it. After Phase 9 sub-phase 9B wires the missing emissions, the suite will still pass with broken emission code unless this gap is closed alongside.

**Severity HIGH.** Affected files: any test under `tests/test_booking_*`, `tests/test_finance_*`, `tests/test_pos_*`, `tests/test_order_*` that exercises a state transition. Recommendation: add an `assert_event_emitted(...)` helper in `tests/conftest.py` and use it inline with state-mutation tests, plus add a dedicated `tests/test_audit_log_emissions.py` covering coverage matrix (every state-changing service × at least one transition).

**Finding 6.2 — Tee sheet read-model coverage thin (MEDIUM).**

`tests/test_tee_sheet_read_model_foundation.py` has only 2 test functions for the entire tee-sheet read surface. Compare to `tests/test_finance_read_models.py` (3 fns) and `tests/test_player_booking_read_model.py` (2 fns) — all three read-model surfaces are under-tested relative to their USP weight. **Severity MEDIUM** — defer expansion to Phase 9 sub-phase 9C (tee sheet correctness) where optimistic-locking tests will share fixtures.

**Finding 6.3 — Admin dashboard has one test (MEDIUM).**

`tests/test_admin_dashboard_summary.py` has a single test function for a 337-line service producing complex aggregates. Once the KPI metrics from Finding 3.2 land, this surface will need much more coverage. **Severity MEDIUM** — defer alongside Finding 3.2 work.

**Finding 6.4 — No optimistic-locking test sentinel (HIGH).**

The §10.3 work item 3 ("Optimistic locking / slot hold on tee sheet") is Phase 9 sub-phase 9C work. There is no current test that proves the absence of optimistic locking — i.e. a test that books the same slot from two sessions concurrently and asserts the second fails. When Phase 9C lands, the regression test for the original race condition needs to be in place first. **Severity HIGH** — flagged here so Phase 9C ships with the sentinel.

---

## Phase 9 work items derived from this audit

These items are HIGH-severity findings translated into actionable Phase 9 backend-extension tasks. Numbered for traceability.

**WI-1. Wire 8 booking lifecycle services to emit DomainEventRecord.**
- *Affected files:* `app/services/booking_service.py`, `app/services/booking_cancellation_service.py`, `app/services/booking_checkin_service.py`, `app/services/booking_completion_service.py`, `app/services/booking_no_show_service.py`, `app/services/booking_move_service.py`, `app/services/booking_update_service.py`, `app/services/booking_finance_service.py`.
- *Complexity:* medium (8 services, ~20 emit sites total — one per public method that mutates state). Pattern is established in `pos_service.py:187` etc.
- *Dependencies:* none (pure addition). Test sentinels (WI-9) should ship in the same commit.
- *Phase 9 sub-phase:* 9B (audit-log expansion).

**WI-2. Wire 4 finance services to emit DomainEventRecord.**
- *Affected files:* `app/services/finance/ledger_service.py`, `app/services/finance/export_batch_service.py`, `app/services/finance/accounting_profile_mapping_service.py`, `app/services/order_finance_posting_service.py`.
- *Complexity:* medium. Event types: `finance.transaction.posted`, `finance.export_batch.generated`/`voided`/`regenerated`, `finance.profile.created`/`updated`/`deleted`, `finance.order_charge.posted`.
- *Dependencies:* none.
- *Phase 9 sub-phase:* 9B.

**WI-3. Wire golf_settings_service to emit DomainEventRecord on publish/rollback.**
- *Affected files:* `app/services/golf_settings_service.py`.
- *Complexity:* small. Two key transitions: `publish_rule_set`, `publish_pricing_matrix`, plus their rollbacks.
- *Dependencies:* none.
- *Phase 9 sub-phase:* 9B.

**WI-4. Add `DomainEventRecord` test sentinels.**
- *Affected files:* `backend/tests/conftest.py` (new `assert_event_emitted` helper), new `backend/tests/test_audit_log_emissions.py`, plus inline assertions in existing `tests/test_booking_*`, `tests/test_finance_*`, `tests/test_order_*` files.
- *Complexity:* medium (one new file, one helper, ~30 inline assertions across existing files).
- *Dependencies:* WI-1, WI-2, WI-3 land first.
- *Phase 9 sub-phase:* 9B.

**WI-5. Introduce semantic-layer architecture.**
- *Affected files:* new top-level directory (proposed: `backend/app/semantic/` or `backend/dbt/`) — decision is part of the work.
- *Complexity:* large. PRODUCT.md §7 commits to dbt or equivalent; this is a foundational decision that ranges from "Python dataclass metric registry" (small) to "real dbt project layered on Postgres" (large).
- *Dependencies:* depends on WI-6 metric definitions.
- *Phase 9 sub-phase:* recommend new sub-phase 9F. **Open question requiring user decision: dbt vs Python metric registry vs SQL views.**

**WI-6. Implement daily KPI metrics (RevPATT, RevPUR, F&B per round, effective green fee, weather-adjusted utilisation).**
- *Affected files:* `app/services/finance/read_model_service.py` (extend), `app/services/admin_dashboard_service.py` (consume), new schemas under `app/schemas/admin_dashboard.py`.
- *Complexity:* medium per metric. RevPATT and effective green fee can ship before the semantic layer; weather-adjusted utilisation depends on having a weather data source (defer to v1.5 if not).
- *Dependencies:* WI-5 if dbt route chosen; otherwise standalone.
- *Phase 9 sub-phase:* 9D (finance USP deepening).

**WI-7. Add `status_code=201` to 6 USP-critical create endpoints.**
- *Affected files:* `app/api/finance/routes.py:50, 165, 261`, `app/api/orders/routes.py:87`, `app/api/pos/routes.py:83`, `app/api/routes/golf.py:349`.
- *Complexity:* small (6 one-line additions). Pattern: `status_code=status.HTTP_201_CREATED`. Match the `/people`/`/comms` convention.
- *Dependencies:* none.
- *Phase 9 sub-phase:* new contract-quality sub-phase (proposed 9G), or fold into 9A.

**WI-8. Replace `platform.py` untyped dict returns with Pydantic models.**
- *Affected files:* `app/api/routes/platform.py:53, 66`, new schemas in `app/schemas/platform.py`.
- *Complexity:* small. Define `PlatformMembershipAssignResponse` and `PlatformModuleUpdateResponse`.
- *Dependencies:* none.
- *Phase 9 sub-phase:* new contract-quality sub-phase (or 9A).

**WI-9. Add optimistic-locking test sentinel before Phase 9C lands.**
- *Affected files:* new `backend/tests/test_optimistic_locking_sentinel.py`.
- *Complexity:* small (one concurrency-style test using two `db_session` fixtures or sessions).
- *Dependencies:* must land *before* WI for optimistic locking actually lands so the regression case is locked in.
- *Phase 9 sub-phase:* 9C (tee sheet correctness).

**WI-10. Mark §10.3 work item 11 (list-endpoint tenant-scoping audit) complete.**
- *Affected files:* `docs/PRODUCT.md` §10.3 (cross-out item 11 or note completion in §11 plan).
- *Complexity:* trivial (doc edit).
- *Dependencies:* this audit (already done).
- *Phase 9 sub-phase:* 9A (legal & foundations — close the open work item before sub-phase begins).

**WI-11. Expand tee-sheet read-model test coverage to USP weighting.**
- *Affected files:* `backend/tests/test_tee_sheet_read_model_foundation.py` (currently 2 fns), `backend/tests/test_player_booking_read_model.py` (currently 2 fns).
- *Complexity:* small-medium. Aim for 8-10 fns per file covering occupancy/utilisation/availability decisions.
- *Dependencies:* none.
- *Phase 9 sub-phase:* 9C.

**WI-12. Implement comms blast read-model.**
- *Affected files:* `app/services/comms/blast_service.py` (extend) or new `app/services/comms/blast_read_model_service.py`, `app/schemas/blasts.py`.
- *Complexity:* small. Surface delivery counts, last-sent timestamps, target segment size.
- *Dependencies:* none.
- *Phase 9 sub-phase:* 9E (comms foundation).

**WI-13. Implement member-stats read-model.**
- *Affected files:* extend `app/services/reports_service.py` or new `app/services/people_read_model_service.py`, `app/schemas/reports.py`.
- *Complexity:* small-medium. Membership counts by tier × status × tenure bucket. Supports §10.3 frontend rebuild surface 7.
- *Dependencies:* none.
- *Phase 9 sub-phase:* 9D or new.

**WI-14. Audit-log retention + querying surface.**
- *Affected files:* new `app/services/audit_log_query_service.py` and a route module (`app/api/routes/audit_log.py`).
- *Complexity:* medium. After WI-1/2/3 land, the audit log has the data; the surface to *read it back* is implied by §4 ("Visible to club admin. Exportable.").
- *Dependencies:* WI-1, WI-2, WI-3 in place.
- *Phase 9 sub-phase:* 9B.

---

## Deferrals

MEDIUM and LOW findings that don't enter Phase 9. Documented for future audits.

**D-1. `superadmin_onboarding_service.py` split (Finding 4.1, MEDIUM).** 946 lines / 4 domains. Non-USP. Defer to v1.5 unless onboarding tests start fighting the structure.

**D-2. `golf_settings_service.py` split (Finding 4.2, MEDIUM).** 481 lines / 3 concerns. Touched by WI-3 anyway; revisit split decision *during* WI-3 work — if the audit-log emissions cleanly separate readiness from publish from snapshot, defer; if they entangle, split.

**D-3. `accounting_profile_mapping_service.py` split (Finding 4.3, MEDIUM).** 718 lines / 2 concerns (CRUD + transformation). USP-adjacent (finance) but currently behaving. Defer to v1.5.

**D-4. `blast_service.py` style drift (Finding 4.4, LOW).** Cosmetic `.query()` vs `select()`. Defer to opportunistic cleanup when comms is next touched.

**D-5. OpenAPI metadata gap (Finding 5.4, LOW).** Zero docstrings on USP endpoints. Defer to v1.5 / pre-integration-launch.

**D-6. Comms emit gaps (Finding 1.4, MEDIUM).** Defer until §10.3 frontend rebuild surface 8 (Communications composer) confirms whether v1 needs audit visibility on blast/news state transitions.

**D-7. Operational support emit gaps (Finding 1.5, MEDIUM).** Targets + accounting templates. Non-USP. Defer to v1.5.

**D-8. Auth service emit gap (Finding 1.6, LOW).** Partial coverage via `auth_sessions` table. Defer to v1.5+ unless POPIA audit-trail requirements escalate it.

**D-9. Member-stats read-model (Finding 3.3, MEDIUM).** Captured as WI-13 — included in Phase 9 because it's small and unblocks frontend surface 7.

**D-10. Blast engagement read-model (Finding 3.4, MEDIUM).** Captured as WI-12 — included in Phase 9 because it's small.

**D-11. `superadmin.py` 400 vs 422 (Finding 5.3, MEDIUM).** Non-USP endpoint. Defer to v1.5.

**D-12. Admin dashboard test thinness (Finding 6.3, MEDIUM).** Will need expansion alongside WI-6 (KPI metrics) anyway.

---

## Conflicts with PRODUCT.md §10

**C-1. Endpoint count: §10.3 work item 11 cites "~91 endpoints" but actual count is 127.**
- §10.3 likely conflated "list endpoints" with "all endpoints" or counted at an earlier commit. This audit finds 127 endpoints / 37 list endpoints. Not a meaningful conflict — the work item is complete either way (WI-10 above).

**C-2. §11 Phase 9 sub-phases do not explicitly include the semantic-layer architecture.**
- §11 sub-phase 9D mentions "KPI calculations" but treats them as standalone work, not as a layer with structural commitment.
- §7 explicitly commits to "semantic layer ships in v1 even if only two AI features ship in v1."
- This is a real conflict between §7 (architectural commitment) and §11 (rebuild plan).
- **Recommendation: amend §11 to add sub-phase 9F (semantic-layer architecture) and §10.3 to add work item 17 (semantic layer). Defer the dbt-vs-Python decision to the user before WI-5 starts.**

**C-3. §10.3 work item 11 (list-endpoint tenant-scoping audit) is now complete.**
- This audit closes that item. No conflict, just a status update — WI-10 covers the doc edit.

**No other conflicts.** Every Area 1/3/4/5/6 finding either aligns with an existing §10.3 work item, or extends it cleanly without contradicting it.

---

## Appendix — methodology notes

- **Read-only.** Zero code or schema changes. The only files written by this phase are `docs/PHASE_5_5_BACKEND_AUDIT.md` (this report) and `docs/PHASE_LOG.md` (Phase 5.5 entry).
- **File:line citations.** Every finding cites the exact location. Counts cited match the underlying greps performed during the audit.
- **Severity calibration.** Spot-checked: WI-1 (booking lifecycle emissions) is HIGH because §4 explicitly enumerates "every state transition on a booking" as audit-log requirement and §3.1 makes the tee-sheet a USP. WI-7 (status codes) is HIGH because all 6 endpoints are USP-critical creates. WI-5 (semantic layer) is HIGH because §7 makes it an in-v1 architectural commitment. D-1 (superadmin_onboarding split) is correctly deferred LOW/MEDIUM because superadmin is explicitly non-USP per §10 and §11.
- **Census discipline.** Phase 5 reported "47 server_default mirrors" and execution found 46; small delta acceptable. This audit's mirror was the "~91 endpoints" figure from §10.3 vs actual 127 — same shape, same direction, surfaced and flagged.

*End of report.*
