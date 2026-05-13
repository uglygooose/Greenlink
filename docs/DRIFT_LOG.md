# GreenLink — Drift Log

Append-only record of drifts between documentation, code, and expected state. New entries go at the top (most recent first). Never edit past entries. If a past entry needs correction, add a new entry referencing it.

Each entry uses this format:

```
---
### <YYYY-MM-DD> — <short title>

- **Surfaced by**: <Phase N orientation / manual review / etc.>
- **Claim**: what some artifact said.
- **Reality**: what the code shows.
- **Evidence**: file:line references.
- **Resolution**: how it was resolved (doc updated, code fixed, deferred to phase N, etc.).
---
```

---
### 2026-05-13 — Slice 5 price popover ships against a Path-1 single-line stub (additive breakdown endpoint TBD)

- **Surfaced by**: Phase 10 Slice 5 Deliverable 2 read of `backend/app/schemas/rule_evaluation.py`, `backend/app/services/booking_commercial_service.py`, and `backend/app/schemas/tee_sheet.py`.
- **Claim**: Phase 8's `PricePopover` design renders an additive rule-line stack — `Base R 650 + Weekend AM premium +R 100 + Cart +R 70 + Channel · Direct R 0 = R 820` — composed by the backend and rendered as-is by the frontend.
- **Reality**: The backend models pricing as a set of **competing** `PricingCandidate`s (each carrying an absolute `price: Decimal` and a `reason` string). `BookingCommercialService.snapshot_from_availability` picks the one candidate when exactly one matches and returns `BookingCommercialSnapshot(fee_amount, fee_currency)` — single absolute price, no decomposition. `TeeSheetBookingSummary` carries `fee_label / fee_amount / fee_currency`, no `breakdown` field. The additive `Base + Premium + Addon + Channel + Discount` shape does not exist anywhere in the current backend. Deriving deltas (e.g. `+R 100` premium) in the frontend would require subtracting two PricingCandidates → frontend pricing math → forbidden by `ENGINEERING_STANDARDS.md` §1.
- **Evidence**: `backend/app/schemas/rule_evaluation.py:52-92` (PricingCandidate carries absolute `price`, not deltas; `PricingEvaluationResult.candidate_rules` is a list of competing matches, not a stack); `backend/app/services/booking_commercial_service.py:38-51` (`snapshot_from_availability` returns one snapshot when `len(candidates) == 1` else empty); `backend/app/schemas/tee_sheet.py:76-89` (`TeeSheetBookingSummary` exposes only `fee_label`/`fee_amount`/`fee_currency`, no breakdown).
- **Resolution**: Per slice owner's Path-1 decision, Slice 5 ships a degraded stub. `frontend/src/features/tee-sheet/use-price-breakdown.ts` synthesises one `kind: "base"` line per booking in the slot, sourced from `fee_label` + `fee_amount` + `fee_currency`; the row-level total is the same presentation aggregation the row Price column already uses (sum of `fee_amount` across bookings). Channel renders as `"—"` because `TeeSheetBookingSummary.source` doesn't exist (already recorded in DRIFT_LOG 2026-05-13 #1). A new FROZEN comment in `use-price-breakdown.ts` marks the swap point for the future real endpoint. Once backend exposes either (a) `breakdown: list[PriceLine]` per `TeeSheetBookingSummary`, or (b) a dedicated `GET /api/golf/tee-sheet/slot-breakdown` returning `{ lines, channel, total, currency }`, the hook implementation swaps without touching the popover component or the wiring in `admin-tee-sheet-page.tsx`. FROZEN count in `frontend/src/features/tee-sheet/` + `frontend/src/components/ui/` goes from 5 → 6.

---
### 2026-05-13 — Slice 4 selection-dismiss + price-click semantics differ from slice spec; followed Phase 8

- **Surfaced by**: Phase 10 Slice 4 (row selection + selection footer) when verifying the spec's listed dismiss behaviours against the Phase 8 prototype.
- **Claim**: Slice 4 spec section "LOCKED DECISIONS" listed three dismiss paths for row selection — "cleared by esc or by clicking the same row twice OR by clicking outside the grid" — and then qualified with "Verify the exact dismiss behaviour against Phase 8; match it." Spec section "Deliverables 2" also asked the price button to be a stop-propagation no-op so selection does not fire on price click.
- **Reality**: The Phase 8 prototype implements **only** esc-to-dismiss. `phase8-tee-sheet.jsx:574-575` wires `onSelect={() => setSelectedRow(row.time)}` with no toggle: clicking the already-selected row is a no-op setter, not a clear. The prototype's `TeeSheetAB` mounts no outside-click dismisser; no `onClick` handler on a wrapping div or document-level listener exists. The only "clear" affordance is the esc keyboard shortcut, documented in `phase8-shared.jsx:39` as `["esc", "Close panel · clear selection"]`. Separately, the Phase 8 prototype's price-click handler at `phase8-tee-sheet.jsx:576` reads `onPriceClick={(r) => { setSelectedRow(r.time); setOverlay("price"); }}` — clicking the price DOES set selection AND open the popover.
- **Evidence**: `/tmp/greenlink-phase8/greenlink/project/phase8-tee-sheet.jsx:208-294` (TeeRow + onClick handlers), `:476` (`useTSState("06:46")` initial value, no toggle), `:574-576` (selection assignment patterns), `phase8-shared.jsx:39-42` (shortcut group "Help" → esc maps to clear-selection).
- **Resolution**: Followed Phase 8 on both points. Slice 4 implements esc-only dismiss at the page level (`frontend/src/pages/admin-tee-sheet-page.tsx` document-level keydown listener); no toggle, no click-outside handler. The spec's "click same row twice / click outside" phrasings were spec-author assumptions that don't match the canonical design; the spec's "match Phase 8" qualifier wins. For the price-click stub: Slice 4 keeps the spec's stop-propagation no-op since the popover that the prototype opens isn't wired until Slice 5 — at which point Slice 5 can choose to additionally fire `onSelect` (matching the prototype) when wiring the popover. Flagged here so Slice 5 doesn't re-derive the question.

---
### 2026-05-13 — Phase 8 tee-sheet design vs backend response orientation mismatch

- **Surfaced by**: Phase 10 Slice 2 (tee-sheet skeleton read-only) when diffing the Phase 8 design against the live `GET /api/golf/tee-sheet/day` response shape.
- **Claim**: Phase 8 design renders a single course's tee sheet as one row per TEE-TIME with four player columns inside each row (e.g. row "06:30" → players P1 / P2 / P3 / P4). The recon report (B.1–B.2) treated this as the canonical layout.
- **Reality**: The backend response models the same data with the opposite axes. `TeeSheetDayResponse.rows` is a list of physical LANES (e.g. "1st Tee", "10th Tee"); each row's `slots: list[TeeSheetSlotView]` is the time sequence in that lane. The 4-up player-column unit of Phase 8 maps to a single `TeeSheetSlotView`, not to a backend row. For a single-tee course the backend returns a single row whose slots ARE the Phase 8 rows, so the visual translation is one-to-one — but the orientation flip becomes load-bearing the moment a course has two start lanes (shotgun) or the design needs to compare across lanes side-by-side.
- **Evidence**: `backend/app/schemas/tee_sheet.py:111-129` (`TeeSheetRow.row_key/tee_id/start_lane/label/slots` — row is per-lane); `backend/app/schemas/tee_sheet.py:92-108` (`TeeSheetSlotView` carries the per-time `bookings` list with up to `occupancy.player_capacity` participants — slot is the 4-up unit). Prototype evidence: Phase 8 mock data at `phase8-tee-sheet.jsx:17-86` lists rows as `{ time, state, players: [4 entries], price }` — explicitly time-row × 4-player-column.
- **Resolution**: Slice 2 handles by rendering only `response.rows[0].slots` (single lane, the dominant case for single-tee courses). The orientation mismatch is recorded here for Slice 12 (tournament-mode / shotgun view), which is where multi-lane on one course actually matters: that slice will need to either (a) treat each backend row as its own shotgun section and lay them out vertically inside the same surface, or (b) merge slots from multiple lanes at the same time index into a single Phase 8 row. The decision is not Slice 2's to make; flagged here so it isn't re-derived.

---
### 2026-05-13 — Tee-sheet row state, channel dot, audit cue not derivable from current backend response

- **Surfaced by**: Phase 10 Slice 2 implementation against the live tee-sheet day response.
- **Claim**: Phase 8 design specifies six row states (open / booked / checkedin / atrisk / noshow / blocked), a per-player-cell channel dot encoding booking source (member-direct / member-app / aggregator / walk-in), and a per-row audit clock indicating "row has audit events today".
- **Reality**: The backend response exposes none of the three.
  1. **Row state**: `TeeSheetSlotView.display_status` is `available | blocked | reserved | indeterminate | warning`. `checkedin` and `noshow` are booking-level statuses (`TeeSheetBookingSummary.status`); deriving the row-level state from them would require aggregation the slice spec forbids.
  2. **Channel/source**: `TeeSheetBookingSummary` has no `source` / `channel` field. `BookingSource` enum exists on the backend but is not surfaced via the day response.
  3. **Audit cue**: `TeeSheetSlotView` has no `has_audit_events` or equivalent boolean. The Phase 9B emission infrastructure records the events but no read-model summary is published per-slot.
- **Evidence**: `backend/app/schemas/tee_sheet.py:26-30` (`TeeSheetSlotDisplayStatus` — 5 values, no checkedin/noshow); `backend/app/schemas/tee_sheet.py:76-89` (`TeeSheetBookingSummary` — no source/channel/audit fields); `backend/app/services/tee_sheet_service.py:121-137` (state_flags dict carries `manually_blocked | reserved_state_active | competition_controlled | event_controlled | externally_unavailable` only — none useful for the missing decorations).
- **Resolution**: Defer-and-flag. Slice 2 renders `checkedin`/`noshow` as `booked`, omits the per-cell channel dot, and omits the audit clock. Three new FROZEN comments added inside `frontend/src/features/tee-sheet/components/TeeRow.tsx` at the exact render sites (row-state mapping function, PlayerCell body, time-cell body), worded to match the existing FROZEN comments in `sheet-shared.tsx:896` and `sheet-shared.tsx:922`. These mark the contract: when the backend exposes the named field, the comment is the search target for the implementer. Per the slice owner's decision, the three gaps belong to a future Phase 9B-style backend-extension burst, not slice-by-slice chasing.

---
### 2026-05-13 — assert_event_emitted legacy-kwarg shim

- **Surfaced by**: Phase 9.1 standards remediation (Item 4 — EmissionContext sweep).
- **Claim**: Phase 9.1 introduced `EmissionContext` and applied "replace, don't layer" across 33 emission call sites + 4 route files.
- **Reality**: The `assert_event_emitted` test helper in `backend/tests/conftest.py` accepts both `context=EmissionContext(...)` (the canonical shape) and the legacy `actor_user_id` / `source_channel` kwarg pair, for backwards compatibility with inline assertions in pre-9B foundation test files (e.g. `tests/test_booking_cancellation_foundation.py` and ~13 similar). Phase 9.1's "replace, don't layer" rule was held narrowly because stripping the shim required rewriting inline assertions across ~14 test files at meaningful regression risk.
- **Evidence**: `backend/tests/conftest.py:168-203` — `assert_event_emitted` carries both `context: EmissionContext | None = None` AND `actor_user_id`, `source_channel` legacy parameters. The legacy kwargs unwrap context when both are supplied and otherwise act as a passthrough.
- **Resolution**: Deferred. Convert the foundation tests' inline assertions to construct `EmissionContext` directly and drop the shim as a discrete cleanup phase — small, mechanical, low risk done in isolation. No urgency; the shim is a test-only convenience that doesn't leak into production code paths.
---
### 2026-05-12 — blast_service.py .query() residuals

- **Surfaced by**: Phase 9E WI-12 cleanup of audit Finding 4.4.
- **Claim**: Phase 9E converted the audit-named `.query()` block in `blast_service.py` to SQLAlchemy 2.0 `select(...)` style.
- **Reality**: Three `.query()` usages remain in `backend/app/services/comms/blast_service.py` — `send_blast` (load by id+club) and `_resolve_recipients` (memberships, persons). Audit Finding 4.4 named only the `list_blasts` block at lines :59-64; Phase 9E's brief scope was "those four lines" so the residuals were left.
- **Evidence**: `backend/app/services/comms/blast_service.py` `send_blast` and `_resolve_recipients` still use `self._db.query(...).filter(...).all()` / `.first()` patterns.
- **Resolution**: Deferred. Cosmetic, non-functional — `.query()` is still supported by SQLAlchemy 2.x with a deprecation path. Convert when comms is next touched (a Phase 11 frontend integration or a v1.5 transactional-provider phase is the natural fold-in point). No urgency.
---
### 2026-05-12 — platform.py create routes return status string instead of resource

- **Surfaced by**: Phase 9G WI-8 (typing platform.py dict returns).
- **Claim**: REST create / update endpoints should return the affected resource (or at least a richer envelope) so callers don't need a follow-up GET.
- **Reality**: `POST /api/platform/memberships` returns `{"status": "created"}` and `PUT /api/platform/clubs/{club_id}/modules` returns `{"status": "updated"}`. Phase 9G typed both as `PlatformMembershipAssignResponse` / `PlatformModuleUpdateResponse` mirroring the exact-same shape — typed envelopes around a status string, no resource payload. The superadmin frontend currently has to re-fetch the membership list / module list after each call.
- **Evidence**: `backend/app/api/routes/platform.py:52-66` (post-9G shape); `PlatformMembershipAssignResponse` / `PlatformModuleUpdateResponse` in `backend/app/schemas/platform.py`.
- **Resolution**: Resolved in Phase 9.1. `POST /api/platform/memberships` now returns the created `ClubMembership` resource (id, club_id, person_id, role, status, is_primary, membership_number) via `PlatformMembershipAssignResponse`. `PUT /api/platform/clubs/{club_id}/modules` now returns the post-update module-key list via `PlatformModuleUpdateResponse`. `PlatformService.assign_membership` and `update_modules` updated to return the resource alongside the emission.
---
### 2026-05-12 — membership transition timestamps

- **Surfaced by**: Phase 9D WI-13 (PeopleReadModelService.summary).
- **Claim**: Member-stats can report month-over-month churn alongside growth.
- **Reality**: `ClubMembership` tracks current `status` only (`active` / `invited` / `suspended` / `inactive`) with no transition-timestamp columns (e.g. `lapsed_at`, `inactive_at`). `summary` surfaces `growth_this_month` (joins via `joined_at`) but cannot surface `churn_this_month` because the date a membership left active status is not persisted.
- **Evidence**: `backend/app/models/club_membership.py` has no `*_at` transition columns; `app/services/people_read_model_service.py:summary` therefore omits `churn_this_month` from `MemberStatsSummaryResponse`.
- **Resolution**: Deferred. Two viable fixes — (a) add transition-timestamp columns on `ClubMembership` (`lapsed_at`, `inactive_at`, etc.); (b) query `DomainEventRecord` (Phase 9B) for `club_membership.updated` events to reconstruct the transition history. Path (b) is cleaner since the audit log is already capturing the transitions. Needs a dedicated phase.
---
### 2026-05-12 — booking-finance two-commit pattern

- **Surfaced by**: Phase 9B emission tracing.
- **Claim**: `booking_finance_service` methods (`post_charge`, `record_payment`, `post_refund`) are described as atomic booking-side mutations that move money and update booking state together.
- **Reality**: Each method calls `self.ledger_service.create_transaction(...)` which commits the FinanceTransaction (commit #1) before the booking-status change is committed (commit #2). If commit #2 raises, the ledger row persists without the booking acknowledgement — money moves without the booking state catching up.
- **Evidence**: `backend/app/services/booking_finance_service.py` post_charge / record_payment / post_refund each call `ledger_service.create_transaction(...)`, which commits internally in `backend/app/services/finance/ledger_service.py` before the parent booking-status `self.db.commit()`.
- **Resolution**: Deferred. Needs a dedicated phase to wrap both writes in a single SQLAlchemy transaction (refactor `ledger_service.create_transaction` to not commit when invoked from a parent service, or pass a session-scoped flag). Pre-dates Phase 9B; surfaced when audit-log emissions made the two-commit boundary visible. Not touched in 9B per phase discipline.
---
### 2026-05-11 — CI on main has been red since at least 30 March

- **Surfaced by**: Phase 2 verification (lint failures locally) + GitHub Actions history review.
- **Claim**: `.github/workflows/ci.yml` defines a CI pipeline (backend: uv sync → ruff check → ruff format check → pytest; frontend: npm install → lint → typecheck → test). Repo presents as having a working CI gate.
- **Reality**: Every visible workflow run on `main` since at least 30 March 2026 has failed. 24/24 most-recent runs are red. Run durations of 3–7 seconds indicate failure in the first lint step before tests are ever executed. Phase 2 confirmed locally: 364 ruff errors + 91 files needing format on backend; 48 lint errors + 13 warnings on frontend.
- **Evidence**: GitHub Actions history at https://github.com/uglygooose/Greenlink/actions; local `uv run ruff check .` (364 errors) and `npm run lint` (48 errors) in Phase 2.
- **Resolution**: Phase 3 scope is now "get CI to green." All other cleanup work is deferred until CI provides a real signal.
- **Update (Phase 3, 2026-05-11)**: Resolved locally. Backend `uv run ruff check .` returns "All checks passed!" (364 → 0), `uv run ruff format --check .` clean (91 → 0). Frontend `npm run lint` exits 0 with 13 `react-hooks/exhaustive-deps` warnings (errors: 48 → 0). All three test gates green: 191 pytest passed, 275 vitest passed, `tsc --noEmit` clean. CI verification on next push.
---
### 2026-05-11 — `pricing_rules.player_type` / `season` stored as VARCHAR, models declare Enum

- **Surfaced by**: Phase 2 bootstrap. Inherited deferred check from Phase 1.
- **Claim**: Phase 1's deferred drift list flagged this without verification.
- **Reality**: Confirmed and reproducible from a clean migration apply. Migration `backend/alembic/versions/202604130003_pricing_matrix_dimensions.py:38-46,48-56` adds both columns as `sa.String(length=64)` / `sa.String(length=32)` with text server defaults. Models `backend/app/models/pricing_rule.py:32-35,41-45` declare them as `Mapped[PricingPlayerType]` / `Mapped[PricingSeason]` wrapped in `Enum(...)`. DB stores `character varying`; SQLAlchemy expects Postgres enum. For contrast, `day_type` and `time_band` ARE stored as proper Postgres enums (`pricingdaytype`, `pricingtimeband` in `pg_type`).
- **Evidence**: `docker compose exec postgres psql -U greenlink -d greenlink -c "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='pricing_rules' AND column_name IN ('player_type','season','day_type','time_band');"` returns `player_type | character varying | varchar`, `season | character varying | varchar`, `day_type | USER-DEFINED | pricingdaytype`, `time_band | USER-DEFINED | pricingtimeband`. Backend tests do NOT catch this drift — `backend/tests/conftest.py:62-67` builds the test schema via `Base.metadata.create_all()` from models (which produces enums), not from Alembic.
- **Resolution**: Recorded. Fix is out of scope for Phase 2 (would require a model change OR a new migration to convert the columns). Deferred to a later phase.
---
### 2026-05-11 — `news_posts.body` model/DB type drift — DISMISSED

- **Surfaced by**: Phase 2 bootstrap. Inherited deferred check from Phase 1.
- **Claim**: Phase 1 deferred-drift list said "`news_posts.body` TEXT vs String divergence".
- **Reality**: No drift. Model declares `body: Mapped[str] = mapped_column(nullable=False)` at `backend/app/models/news_post.py:29`. SQLAlchemy 2.0 renders unbounded `Mapped[str]` as `TEXT` on Postgres, which matches the DB column type (`text`).
- **Evidence**: `information_schema.columns` query returns `news_posts | body | text | (no max length) | text`. Model has no explicit `String(N)` length.
- **Resolution**: Recorded as dismissed. No follow-up needed.
---
### 2026-05-11 — `pydantic-settings` 2.13 vs `.env.example` `GREENLINK_ALLOWED_ORIGINS` format

- **Surfaced by**: Phase 2 bootstrap. Backend `from app.main import app` import failed.
- **Claim**: `.env.example:8` ships `GREENLINK_ALLOWED_ORIGINS=http://localhost:5173` (comma-separated style). `backend/app/config/settings.py:39-44` defines a `@field_validator("allowed_origins", mode="before")` that splits comma-separated strings into a list.
- **Reality**: Locked `pydantic-settings==2.13.1` (`backend/uv.lock`) JSON-decodes complex (list-typed) env values inside its dotenv source *before* the `before` validator runs (`pydantic_settings/sources/providers/dotenv.py:108` → `base.py:550`). `http://localhost:5173` is not valid JSON, so loading the `Settings()` model raises `SettingsError: error parsing value for field "allowed_origins"`. The shipped `.env.example` cannot produce a usable runtime with the pinned dependency.
- **Evidence**: `uv run python -c "from app.main import app"` raised `pydantic_settings.exceptions.SettingsError` from `prepare_field_value` → `decode_complex_value` → `json.loads`. Phase 2 worked around by editing `backend/.env` to `GREENLINK_ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`.
- **Resolution**: Local-only workaround applied to `backend/.env` (gitignored). Real fix options for a later phase: (a) update `.env.example` to use JSON list format, (b) pin `pydantic-settings` below the version that introduced the strict JSON-first decode, or (c) configure `Settings` to skip JSON decode for complex env values. None of those are in scope here.
- **Update (Phase 3, 2026-05-11)**: Resolved via option (a). `backend/.env.example:8` now ships `GREENLINK_ALLOWED_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]`. Verified by deleting local `backend/.env`, re-copying from `.env.example`, and running `uv run python -c "from app.main import app; print(app.title)"` — boot succeeds without further edits.
---
### 2026-05-11 — Phantom C8/C9/C10 work claimed in deleted external project docs

- **Surfaced by**: Phase 0 orientation.
- **Claim**: External project documentation (held by the user, since discarded) claimed GreenLink was at "post-C10" state with completed C8/C9/C10 slices and additional B/C/D/E stabilization passes.
- **Reality**: The repo is at post-C7. There is no code evidence of C8, C9, or C10 work being completed. C9's target code (`party_summary.staff_count` recomputation in `updateSlotFromBookings`) is still present.
- **Evidence**: Phase 0 orientation report; `git log --oneline -1` returns `1151ea7 Architecture correction pass C1–C7: subtraction, centralization, state collapse`; `grep -rn "C8\|C9\|C10" frontend/src` returns 0 matches outside test data unrelated to the C-series naming; `frontend/src/features/tee-sheet/sheet-shared.tsx:1027` still has `staff_count: staffCount,`.
- **Resolution**: External claim discarded. C7 is the current state. C9 retained as a known follow-up in `docs/LIVE_STATE.md` because the underlying code evidence exists. C8 and C10 dropped entirely — no code evidence, no concrete next step.
---
### 2026-05-11 — Missing `/complete` endpoint from MASTER_SYSTEM.md booking list

- **Surfaced by**: Phase 0 orientation.
- **Claim**: Previous `docs/MASTER_SYSTEM.md` booking-lifecycle command list (under "Tee sheet domain") omitted `POST /api/golf/bookings/{booking_id}/complete`.
- **Reality**: The endpoint exists and is registered.
- **Evidence**: `backend/app/api/routes/golf.py:532` (`@router.post("/bookings/{booking_id}/complete", response_model=BookingCompleteResult)`), handler `complete_booking` at line 533.
- **Resolution**: The new `docs/LIVE_STATE.md` includes the endpoint in the `/api/golf` section. `docs/MASTER_SYSTEM.md` is being retired in this phase, so the omission there is moot.
---
### 2026-05-11 — Phantom `/move-participant` endpoint in MASTER_SYSTEM.md

- **Surfaced by**: Phase 0 orientation.
- **Claim**: Previous `docs/MASTER_SYSTEM.md:277` documented a distinct `POST /api/golf/bookings/{id}/move-participant` endpoint for participant-level split moves.
- **Reality**: Only `POST /api/golf/bookings/{booking_id}/move` exists. Participant-level moves go through that single endpoint via an optional `participant_id` body field.
- **Evidence**: `backend/app/api/routes/golf.py:468` (the only `/move` route); `backend/app/schemas/bookings.py:353` (`participant_id: uuid.UUID | None = None` on `BookingMoveInput`).
- **Resolution**: `docs/MASTER_SYSTEM.md` is being retired in this phase. New `docs/LIVE_STATE.md` lists only the real endpoint and notes the optional `participant_id` field.
---
### 2026-05-11 — `/admin/targets` falsely documented as redirect

- **Surfaced by**: Phase 0 orientation.
- **Claim**: Previous `docs/LIVE_STATE.md` claimed `/admin/targets` redirects to `/admin/reports`.
- **Reality**: `/admin/targets` is a real route rendering `AdminTargetsPage`. A test explicitly asserts it does not redirect.
- **Evidence**: `frontend/src/routes/router.tsx:71` (`{ path: "targets", element: <AdminTargetsPage /> }`); `frontend/src/pages/admin-targets-page.tsx:26` (`export function AdminTargetsPage(): JSX.Element { … }`); `frontend/src/pages/admin-targets-redirect.test.tsx:14-30` (test titled "navigating to /admin/targets resolves the targets route" asserting `getByTestId("targets-page")` is present and `queryByTestId("performance-page")` is not).
- **Resolution**: New `docs/LIVE_STATE.md` documents `/admin/targets` as a real route under the Admin shell.
---
### 2026-05-11 — README references files that don't exist

- **Surfaced by**: Phase 0 orientation.
- **Claim**: `README.md:14-19` pointed to `GreenLink-Master-Build-Plan.txt`, `CODEX-EXECUTION-RULES.txt`, `SYSTEM_STATUS.md`, `docs/contracts/`, and `docs/decisions/`.
- **Reality**: None of these paths exist. `ls` on the repo root and `docs/` returns no match for any of them.
- **Evidence**: `README.md:14-19`; repo-root and `docs/` listings.
- **Resolution**: `README.md` updated in Phase 1 to remove the dead references and replaced with a "Documentation" section pointing at the live `docs/` files.
---
