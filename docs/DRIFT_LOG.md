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
