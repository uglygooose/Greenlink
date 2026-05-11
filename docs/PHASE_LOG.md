# GreenLink — Phase Log

Append-only record of structured review phases. New entries at the top (most recent first).

Each entry uses this format:

```
---
### Phase <N> — <name> (<YYYY-MM-DD>)

- **Scope**: one-line summary.
- **Files touched**: list (or "none — read-only").
- **Outcome**: what was produced.
- **Decisions made**: bullets.
- **Follow-ups created**: bullets, or "none".
- **Notes**: anything worth carrying forward.
---
```

---
### Phase 2 — Local dev environment bootstrap (2026-05-11)

- **Scope**: Wipe stale Postgres state; bring up Postgres + Redis via docker-compose; install backend deps via uv; apply Alembic migrations; verify deferred Phase 1 drifts; run backend pytest; install frontend deps; run frontend typecheck / lint / test / build; smoke-boot both servers.
- **Files touched**:
  - `backend/.env` (created from `.env.example`, then edited to JSON list format for `GREENLINK_ALLOWED_ORIGINS` — gitignored).
  - `frontend/.env` (created from `.env.example`, no edits — gitignored).
  - `docs/PHASE_LOG.md` (this entry, append at top).
  - `docs/DRIFT_LOG.md` (3 new entries appended at top).
  - `~/.local/bin/uv` (installed via Astral installer; not part of the repo).
- **Outcome**:
  - **docker-compose**: stale `greenlink_postgres_data` volume wiped (one-shot, per scope). Fresh `postgres` (16-alpine) + `redis` (7-alpine) up, both healthy in ~15s. `pg_isready -U greenlink` returns `accepting connections`. Containers left running at end of phase.
  - **uv**: not installed in WSL at session start. User authorized install via `curl -LsSf https://astral.sh/uv/install.sh | sh`. Resulting binary `~/.local/bin/uv` v0.11.13.
  - **uv sync --extra dev**: 51 packages resolved + installed into `backend/.venv/` on first run. Re-run on a warm cache: "Checked 49 packages, 0 ms."
  - **ruff check .**: **364 errors** (90 auto-fixable). Top rules: 271 × E501 line-too-long, 45 × I001 unsorted-imports, 20 × F401 unused-import, 15 × UP017 datetime-timezone-utc, 9 × UP037 quoted-annotation, 3 × B008, 1 × UP035. Locked at `ruff==0.15.8` per `uv.lock` — CI on this commit would surface the same. Not auto-fixed per Hard Rule 1.
  - **ruff format --check .**: 91 files would be reformatted, 134 already formatted. Not auto-fixed.
  - **Backend import smoke**: `uv run python -c "from app.main import app; print(app.title)"` printed `GreenLink API` after the `backend/.env` JSON-list edit.
  - **alembic upgrade head**: applied all 22 revisions cleanly. Final `alembic current` = `202604150001 (head)`. **Matches `LIVE_STATE.md` claim** — no doc update needed.
  - **DB tables**: 33 app tables + 1 `alembic_version` = 34 rows in `pg_tables`. `club_invitations` table is **absent**, confirming the Phase 1 follow-up (model declared at `backend/app/models/club_invitation.py:21`, no migration creates it).
  - **pytest**: 191 tests passed, 0 failed (exit 0). One deprecation warning about `passlib` using `crypt` (slated for Python 3.13 removal). Test DB built by `Base.metadata.create_all()` per `backend/tests/conftest.py:62-67`, so tests do not catch the migration-vs-model drift in `pricing_rules`.
  - **npm install**: 356 packages added in 18s. 6 moderate-severity audit warnings (unchanged — Hard Rule 2 forbids lockfile mutations).
  - **npm run typecheck**: clean.
  - **npm run lint**: **48 errors, 13 warnings across 23 files** (top files: `admin-golf-tee-sheet-page.tsx` 11, its test 11, `tailwind.config.js` 5, `types/orders.ts` 4, `types/bookings.ts` 4, `booking-management-drawer.tsx` 4). Dominant rules: `react-hooks/rules-of-hooks` in test fixtures, `@typescript-eslint/no-empty-object-type` in `types/*`, `@typescript-eslint/no-require-imports` + `no-undef` for `require()` in `tailwind.config.js`. Not fixed.
  - **npm run test (vitest)**: 37 test files / 275 tests passed, 0 failed, in 60.5s. Matches the previously-claimed 275/275.
  - **npm run build (`tsc -b && vite build`)**: success in 6.41s. 160 modules transformed. Output: `index.html` 0.80 kB, CSS 65.28 kB (gzip 12.07 kB), **JS 811.81 kB (gzip 192.51 kB)** — over the 500 kB chunk-size warning threshold.
  - **Backend smoke boot**: uvicorn on `127.0.0.1:8000` → `GET /health` returned `HTTP 200` with body `{"app":{"ready":true},"db":{"ready":true},"redis":{"ready":true}}`. Killed cleanly via `fuser -k 8000/tcp`.
  - **Frontend smoke boot**: vite dev on `127.0.0.1:5173` → `GET /` returned `HTTP 200` with `<!doctype html>`. Killed cleanly via `fuser -k 5173/tcp`.
- **Decisions made**:
  - Authorized installing `uv` via the Astral installer into `~/.local/bin/`. Not committed to the repo; not part of the project. Phase 2 added a per-command `export PATH="$HOME/.local/bin:$PATH"` prefix to subsequent backend commands.
  - **Phase 1 deferred drift `pricing_rules.player_type` / `season`: CONFIRMED.** Migration `202604130003_pricing_matrix_dimensions.py` adds them as `sa.String`; models declare `Enum`. New `DRIFT_LOG.md` entry. Not fixed in Phase 2.
  - **Phase 1 deferred drift `news_posts.body`: DISMISSED.** `Mapped[str]` without explicit length renders as `TEXT` on Postgres, matching DB. New `DRIFT_LOG.md` entry recording the dismissal.
  - **New drift surfaced**: `pydantic-settings==2.13.1` (lockfile-pinned) is incompatible with `backend/.env.example`'s comma-separated `GREENLINK_ALLOWED_ORIGINS=http://localhost:5173`. Worked around in local `backend/.env` only. Recorded in `DRIFT_LOG.md`.
  - `LIVE_STATE.md` migration head claim (`202604150001`) matches reality — no update to that file.
  - Containers (postgres, redis) left running. No leftover app processes at end of phase.
- **Follow-ups created** (deferred):
  - **ruff lint** at 364 errors and **ruff format** at 91 files need a sweep. Lockfile pins the same ruff CI uses, so CI is also failing.
  - **frontend lint** at 48 errors / 13 warnings across 23 files (see Outcome for top offenders).
  - **`pricing_rules` enum/varchar drift**: needs either a model change to `String(64)` / `String(32)` OR a migration to convert columns to proper Postgres enums.
  - **`pydantic-settings` + `allowed_origins` env-format drift**: needs a real fix per options listed in the DRIFT_LOG entry.
  - **Frontend bundle**: single `index-*.js` chunk at 811 kB minified — over Vite's 500 kB warning. Code-split deferred.
  - **`passlib` `crypt` deprecation**: will break on Python 3.13.
  - **6 moderate-severity npm audit warnings**: not investigated.
  - **`club_invitations` missing migration** (carried forward from Phase 1) is still open; confirmed today that the table is absent from a freshly-migrated DB.
- **Notes**:
  - The Phase 1 annotation on `docs/runbooks/local-development.md` is now justified by more than just the gap-list issue: the runbook's `py -3.12 -m uv run …` commands are Windows-side and don't work from this WSL shell. WSL-side workflow uses `~/.local/bin/uv` directly.
  - Backend tests use `Base.metadata.create_all()` rather than Alembic — meaning the pytest pass DOES NOT validate that migrations produce a model-compatible schema. The `pricing_rules` drift would be invisible to the test suite. Worth flagging when designing the regression-test strategy in a later phase.
  - Both `.env` files are gitignored — confirm via `git status` (neither appears).
---
### Phase 1 — Doc reset and regeneration (2026-05-11)

- **Scope**: Regenerate `docs/LIVE_STATE.md` from code; create `docs/DRIFT_LOG.md` and `docs/PHASE_LOG.md`; clean up `README.md`; evaluate the remaining `docs/` files.
- **Files touched**:
  - `docs/LIVE_STATE.md` (full replace)
  - `docs/DRIFT_LOG.md` (created)
  - `docs/PHASE_LOG.md` (created)
  - `README.md` (broken refs removed; "Documentation" section added)
  - `docs/MASTER_SYSTEM.md` (deleted — see Decisions)
  - `docs/runbooks/local-development.md` (header annotation added — see Notes)
  - `docs/ENGINEERING_STANDARDS.md` (no change — see Notes)
  - `docs/ARCHITECTURE_REVIEW_CHECKLIST.md` (no change — see Notes)
- **Outcome**: Code-grounded `LIVE_STATE.md` built from direct reads of router files, route handler files, model `__tablename__` declarations, and frontend page/route files. Drift log and phase log established as append-only artifacts. README no longer points at missing files.
- **Decisions made**:
  - Lean doc set: only `LIVE_STATE.md` regenerated for now. `MASTER_SYSTEM.md` retired (deleted). A narrative architecture doc may be reconstructed in a later phase if needed.
  - C7 is current state. External "post-C10" claims dropped. C9 retained as a known follow-up because its target code is still present at `frontend/src/features/tee-sheet/sheet-shared.tsx:1027`. C8 and C10 dropped entirely.
  - `DRIFT_LOG.md` and `PHASE_LOG.md` are append-only and never edited.
  - `LIVE_STATE.md` deliberately omits status labels ("complete" / "partial" / "pending") except where code itself proves the status (e.g. a `FROZEN — backend gap` comment, a missing migration). The previous file's per-domain "COMPLETE"/"PARTIAL" labels were not regenerated.
- **Follow-ups created**: none from this phase.
- **Notes**:
  - Per-file decisions for the other `docs/` files:
    - `docs/MASTER_SYSTEM.md` — **DELETE** (per Phase 1 rule).
    - `docs/ENGINEERING_STANDARDS.md` — **KEEP AS-IS**. Stable principle-level rules; no code-grounded claims to drift against.
    - `docs/ARCHITECTURE_REVIEW_CHECKLIST.md` — **KEEP AS-IS**. 7-line checklist of review questions; nothing to drift.
    - `docs/runbooks/local-development.md` — **KEEP WITH ANNOTATION**. Operationally useful but the "Current implementation includes" and "Current major gaps" sections (lines 108-132) pre-date the rebuild and list as gaps several features that are now built per `LIVE_STATE.md` (e.g. tee-sheet booking lifecycle, player profile, superadmin invitations). Header note added to point readers at `LIVE_STATE.md` and `DRIFT_LOG.md`; body left untouched. Full rewrite is a separate phase.
  - One additional code-evidenced follow-up surfaced while regenerating: `club_invitations` model exists at `backend/app/models/club_invitation.py:21` but no Alembic migration declares the table (verified by `grep -rn club_invitations backend/alembic/versions/` returning zero matches). Recorded in `LIVE_STATE.md` under "Known follow-ups".
  - Two `FROZEN — backend gap` markers in `frontend/src/features/tee-sheet/sheet-shared.tsx:896-898` and `:922-924` were also added to "Known follow-ups" as explicit code-evidenced pending work (tee-sheet read model lacks next-action / arrivals-due / unresolved flags; booking read model lacks finance eligibility flags).
  - Phase 0 Notes flagged the lingering pre-rebuild model/DB drift items from the previous `LIVE_STATE.md` (pricing_rules.player_type stored as VARCHAR in DB while models use enums, news_posts.body type divergence, several index/constraint diffs on `accounting_export_profiles`, `finance_tender_records`, `finance_transactions`, `orders`, `pos_transactions`). These could not be re-verified in Phase 1 without a running DB and are therefore NOT carried into the regenerated `LIVE_STATE.md`. They should be re-checked in the phase that brings up the local stack.
---
### Phase 0 — Orientation (2026-05-11)

- **Scope**: Read-only audit of repo state, stack, build state, smells, and doc drift.
- **Files touched**: none — read-only.
- **Outcome**: Orientation report delivered to user (held outside the repo).
- **Decisions made**:
  - Treat in-repo post-C7 state as truth; external "post-C10" claims to be verified separately.
- **Follow-ups created**:
  - 4 doc drifts (now logged in `docs/DRIFT_LOG.md`).
  - Local dev environment not bootstrapped (no `node_modules`, no `.venv`, Postgres not running) — deferred to Phase 2.
  - Hardcoded dev defaults in backend settings (`backend/app/config/settings.py:11,23,36-37`; `backend/alembic.ini:6`) — deferred to Phase 3.
  - Monster files (`frontend/src/pages/admin-golf-tee-sheet-page.tsx` at 3284 lines, `frontend/src/pages/admin-golf-settings-guided-page.tsx` at 1363, `frontend/src/pages/superadmin-clubs-page.tsx` at 1235, `frontend/src/pages/admin-members-page.tsx` at 1206) — deferred to Phase 4+.
  - `@dnd-kit/core` appears unused (0 import sites in `frontend/src`) — deferred to Phase 3.
  - Two 4-line wrapper pages (`frontend/src/pages/admin-finance-page.tsx`, `frontend/src/pages/admin-golf-settings-page.tsx`) — deferred to Phase 3.
  - Backend dependency utilisation not audited — deferred.
- **Notes**: build / test / typecheck not run; `node_modules` missing, no venv, Postgres not running on `127.0.0.1:5432`.
---
