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
### Phase 4 — Bundled cleanups A–E (2026-05-11)

- **Scope**: Five isolated, low-risk cleanups — Item A (remove unused `@dnd-kit/core` dep), Item B (collapse two 4-line wrapper-page indirections), Item C (add missing `club_invitations` Alembic migration), Item D (move backend hardcoded dev defaults to env-only), Item E (add `dist/**` exclusion to ESLint config).
- **Files touched**:
  - **Item A**: `frontend/package.json` (-1 line: `@dnd-kit/core` dep removed), `frontend/package-lock.json` (npm install: -3 packages, lockfile reshuffle).
  - **Item B**:
    - Renamed `frontend/src/pages/admin-finance-close-day-page.tsx` → `frontend/src/pages/admin-finance-page.tsx`; renamed export `AdminFinanceCloseDayPage` → `AdminFinancePage`. (Old wrapper at `admin-finance-page.tsx` deleted as part of the rename.)
    - Renamed `frontend/src/pages/admin-finance-close-day-page.test.tsx` → `frontend/src/pages/admin-finance-page.test.tsx`. No internal edits needed — the test already imported `AdminFinancePage` from `./admin-finance-page` (it was always testing the wrapper, which transitively rendered the inner page).
    - Renamed `frontend/src/pages/admin-golf-settings-guided-page.tsx` → `frontend/src/pages/admin-golf-settings-page.tsx`; renamed export `AdminGolfSettingsGuidedPage` → `AdminGolfSettingsPage`.
    - Renamed `frontend/src/pages/admin-golf-settings-guided-page.test.tsx` → `frontend/src/pages/admin-golf-settings-page.test.tsx`; updated internal import path and component name (4 occurrences).
    - **Deleted** the obsolete 51-line shim test `frontend/src/pages/admin-golf-settings-page.test.tsx` (pre-existing). Its sole purpose was to test that the now-removed wrapper rendered the inner page; no purpose after the collapse. Test count drops by 1 (275 → 274).
  - **Item C**:
    - Created `backend/alembic/versions/202605110001_club_invitations.py` (123 lines). Creates the `clubinvitationstatus` Postgres enum (`pending`/`accepted`/`revoked`/`expired`) and the `club_invitations` table with 16 columns, 6 FK constraints (CASCADE on club/person/membership, SET NULL on linked/accepted, RESTRICT on invited_by), and 6 indexes including a unique index on `token_hash`. Hand-written (no `--autogenerate`).
    - `docs/LIVE_STATE.md` updated: migration head `202604150001` → `202605110001`, migration count `22` → `23`, removed the `club_invitations missing migration` follow-up entry.
  - **Item D**:
    - `backend/app/config/settings.py`: removed 4 hardcoded defaults (`secret_key`, `database_url`, `object_storage_access_key`, `object_storage_secret_key`) — each now required from env. Removed the `DEFAULT_DATABASE_URL` module constant.
    - `backend/.env.example`: rewrote secret + storage values to clearly-placeholder strings (`replace-with-...`) with `# REQUIRED.` comments. Kept the local-docker-compose URL as the working `GREENLINK_DATABASE_URL` default since copying example→`.env` should boot against the local stack.
    - `backend/alembic.ini`: `sqlalchemy.url` changed to placeholder (`postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME`) with a comment pointing at `alembic/env.py:18` which overrides via `set_main_option` from `Settings.database_url` at runtime. No alembic behaviour change.
    - `backend/tests/conftest.py`: added an `os.environ.setdefault(...)` block at the top — runs BEFORE the first `from app.* import …` so Settings() instantiation can succeed in CI (where `.env` is absent). Test-only values: `pytest-only-secret-not-for-production`, real Postgres URL (overridden by `db_session` fixture anyway), and `pytest-only` storage keys.
    - `backend/.env`: regenerated from the new `.env.example`. Gitignored — not committed.
  - **Item E**: `frontend/eslint.config.js` — added `{ ignores: ["dist/**"] }` as the first entry of the exported array. Minimal change, no other globs added.
  - `docs/PHASE_LOG.md` (this entry).
- **Outcome per item**: all PASS.
  - **Item A**: 0 `@dnd-kit` references in src/index.html/vite.config.ts; `npm install` removed 3 transitive packages (356 → 353); build/lint/typecheck/vitest/pytest all green.
  - **Item B**: zero stale `AdminFinanceCloseDayPage` / `AdminGolfSettingsGuidedPage` / `admin-finance-close-day-page` / `admin-golf-settings-guided-page` references in `frontend/src`. Test count: 275 → 274 (expected: -1 obsolete shim). Vitest passed 274/274 when run alone.
  - **Item C**: `alembic upgrade head` ran cleanly (`202604150001 → 202605110001`). `\d club_invitations` shows the table with 16 columns matching the model exactly: types, nullability, FK targets/actions, all 6 indexes (including the `UNIQUE btree (token_hash)`). Pytest 191/191 — confirms `Base.metadata.create_all()` in conftest produces a schema compatible with the new migration.
  - **Item D**: `Settings()` raises on missing env vars now. App boot smoke: `uv run python -c "from app.main import app"` succeeds against the regenerated placeholder `.env`. Alembic still finds the head and reports `202605110001`. Pytest 191/191 — the conftest `setdefault` block correctly supplies test env values before any app import.
  - **Item E**: `npm run build && npm run lint` reports 0 errors / 13 warnings (down from 1100+ when `dist/` is on disk). Vitest 274/274. Typecheck clean.
- **Decisions made**:
  - **Item B file naming**: per the prompt, kept the wrapper file names (`admin-finance-page.tsx`, `admin-golf-settings-page.tsx`) because they match the routes (`/admin/finance`, `/admin/golf/settings`). Promoted the real implementation into those names. The old "guided/close-day" descriptive names are gone.
  - **Item B obsolete-shim deletion**: the 51-line `admin-golf-settings-page.test.tsx` (the wrapper-shim test, not the real golf-settings test) was deleted outright. Its only assertion was that the wrapper renders the mocked inner page; after the collapse there's no wrapper, no inner page, just one page. No real coverage lost.
  - **Item B contention false-positive**: first vitest run (in parallel with the Item B pytest) hit a 5s timeout on `admin-golf-tee-sheet-page.test.tsx` (a file I didn't touch). Running vitest alone produced 274/274. Diagnosis: pytest + vitest sharing CPU caused a real test to exceed the 5s default timeout. **Lesson learned: don't run pytest and vitest in parallel.** Carried into subsequent items as a Hard Rule corollary.
  - **Item C enum types**: the `clubmembershiprole` Postgres enum already existed (created by `202603270001_foundation_scaffold`). The migration references it via `postgresql.ENUM(..., create_type=False)` and does NOT call `.create()` for it. The new `clubinvitationstatus` enum is created with `checkfirst=True` for idempotence. Downgrade drops the new enum but leaves `clubmembershiprole` (still used by other tables).
  - **Item D scope of "required"**: removed defaults ONLY for genuinely-sensitive values: `secret_key`, `database_url`, `object_storage_access_key`, `object_storage_secret_key`. Left defaults for non-secrets: `env`, `project_name`, `access_token_ttl_minutes`, `refresh_token_ttl_days`, `redis_url`, `allowed_origins`, `log_level`, `secure_cookies`, `object_storage_endpoint`, `object_storage_bucket`, `object_storage_region`. The prompt's recommendation was "remove the defaults entirely, make them required" but applying that to e.g. `project_name` would be over-zealous.
  - **Item D `DATABASE_URL` in `.env.example`**: kept the working local-docker-compose URL (`postgresql+psycopg://greenlink:greenlink@localhost:5432/greenlink`) rather than a "never accidentally works" placeholder, because copying example → `.env` should leave a working local-dev setup. The example file is for human reference; placing junk in `DATABASE_URL` would force every developer to fix one specific line before anything boots.
  - **Item D `conftest.py` mechanism**: chose `os.environ.setdefault` (per the prompt's "acceptable" option) over a pytest fixture (the prompt's "cleanest" option). Rationale: `setdefault` runs at module-import time, which is before pytest's collection hooks fire and before any `from app.* import …` triggers `Settings()`. A fixture wouldn't have run early enough. The fixture path would require deferring all top-level app imports inside conftest — a larger restructure than the prompt warrants.
  - **Item E exclusion glob minimalism**: per the prompt's "be MINIMAL", added only `dist/**`. Did not add `node_modules/**` (ESLint flat-config ignores it by default) or `*.config.js` (speculative; we want config files linted).
- **Follow-ups created**: none from Phase 4 itself.
- **Notes**:
  - This phase closes out four of Phase 0's "Obvious smells" findings: unused `@dnd-kit/core` (E), wrapper pages (D — bookkeeping note: Phase 0 listed this under "Duplicate implementations"), hardcoded dev defaults (F), missing `dist/` exclusion (which surfaced in Phase 3 retrospect, not in Phase 0). Item C closes out the `club_invitations missing migration` entry from Phase 1's `LIVE_STATE.md` "Known follow-ups".
  - Final verification chain (run after Item E):
    - Backend: `uv run ruff check .` clean, `uv run ruff format --check .` clean (226/226), `uv run pytest -q` 191/191.
    - Frontend: `npm run lint` 0 errors / 13 warnings (unchanged from Phase 3 — those 13 warnings are still deferred), `npm run typecheck` clean, `npm run test -- --reporter=basic` 36 files / 274 tests, `npm run build` 8.11s success.
  - The 13 frontend `react-hooks/exhaustive-deps` warnings remain — still deferred per Phase 3 decision. Not in Phase 4 scope.
  - The 811 kB JS bundle warning persists — not in Phase 4 scope.
  - Phase 4 did NOT touch CI yet (it's blocked by the user's GitHub billing issue). When CI is restored, the next push should be the first green CI run since 30 March.
---
### Phase 3 — CI to green (2026-05-11)

- **Scope**: Resolve every backend ruff error / unformatted-file violation and every frontend ESLint error so CI gates pass. Also fix the pydantic-settings env-format incompatibility in `backend/.env.example` (drift surfaced in Phase 2).
- **Files touched**:
  - `backend/.env.example` (Step 4 — JSON list format for `GREENLINK_ALLOWED_ORIGINS`).
  - 91 backend `.py` files via `ruff format` (Step 1).
  - 6 backend `.py` files via `ruff format` (Step 3 — post-E501-manual-wrap reformat).
  - ~30 backend service files via manual E501 line-wraps (Step 3).
  - 3 backend FastAPI route files via inline `# noqa: B008` on `Query()` defaults (Step 3, user-approved).
  - 13 frontend files via unused-imports / dead-code removal, type alias conversions, ESM imports, vi.mock factory rewrite, `makeLifecycleMutation → useLifecycleMutation`, and test-fixture typing fixes (Steps 5–6).
  - `docs/PHASE_LOG.md` (this entry).
  - `docs/DRIFT_LOG.md` (resolution notes on Phase 2 entries).
- **Outcome**:
  - **Backend ruff check**: 364 → **0 errors** (`All checks passed!`).
  - **Backend ruff format**: 91 unformatted → **0** (225/225 already formatted).
  - **Backend pytest**: 191 passed across every test-run after every rule-isolated auto-fix pass (I001, UP035, UP017, F401, UP037). Final run after E501 manual sweep + reformat: 191 passed in 494s.
  - **Frontend ESLint**: 48 errors → **0 errors**. 13 `react-hooks/exhaustive-deps` warnings remain (intentionally deferred — see Follow-ups). ESLint exits 0; CI's lint step passes.
  - **Frontend typecheck**: clean.
  - **Frontend vitest**: 37 files / 275 tests passed.
  - **Frontend build**: `vite build` 5.48s, 160 modules. Bundle still 811 kB (no change — bundle-size optimisation is out of scope).
  - **App boot smoke**: `GET /health` returned HTTP 200; port :8000 cleaned up post-test.
  - **Diff**: 121 files changed, +2419 / −992. Of those, ~91 are `ruff format` whitespace/wrap-only; the remaining ~30 carry semantic changes.
- **Decisions made**:
  - **No unsafe-fixes used.** Step 2's `--fix` (safe-only) caused a test regression on first attempt because the format pass + safe-fix combined diff was too large to reason about. Reverted via `git checkout -- backend/` per Step 2 sub-step 4, then re-applied changes rule-by-rule (`uv run ruff check . --select <CODE> --fix`) with pytest after each. **No unsafe-fixes (`--unsafe-fixes`) were ever applied.**
  - Rule application order and outcomes (each followed by pytest 191/191 unless noted):
    - **Step 1 ruff format** — 91 files, mostly long-line wraps. Trimmed ruff check from 364 → 112.
    - **I001** unsorted-imports — 34 fixes. 112 → 78. ✓
    - **UP035** deprecated-import (`typing.Iterable` → `collections.abc.Iterable` in seed script) — 1 fix. Re-triggered 1 I001, cleaned up via re-sort. 78 → 77.
    - **UP017** datetime-timezone-utc (`datetime.timezone.utc` → `datetime.UTC`) — 15 fixes. Re-triggered 6 I001 (now-unused `timezone` imports cleaned in the same pass). 77 → 68.
    - **F401** unused-import — 26 fixes (cascaded from UP017's stale `timezone` imports). 68 → 42.
    - **UP037** quoted-annotation — 9 fixes. All target files have `from __future__ import annotations`, so unquoting is a runtime no-op (verified by reading each file's header before applying). 42 → 33.
    - **B008** Query()-in-defaults — 3 fixes via inline `# noqa: B008` in `app/api/comms/routes.py:64`, `app/api/finance/routes.py:92`, `app/api/finance/routes.py:122`. User-approved (see "Decisions"). 33 → 30.
    - **E501** line-too-long — 30 manual wraps using implicit string concatenation (no behavioural change). All targets are long string literals inside service `failures=[…]` lists, log/print formatters, or accounting-template warnings. Final `ruff format` pass collapsed 6 of my wraps back into single lines where the new break point made the result fit cleanly. 30 → 0.
  - **B008 inline-noqa was a per-line targeted exception, user-approved.** Justification: the same files (`app/api/comms/routes.py`, `app/api/finance/routes.py`) already use `# noqa: B008` on adjacent `Depends()` lines for the same rule. The 3 `Query()` lines were simply missed when the noqa-pattern was first introduced. Matches existing local convention; no per-file-ignore-glob edit needed (Hard Rule 2 preserved). The B008 exemption pattern in `[tool.ruff.lint.per-file-ignores]` for `app/api/routes/*.py` was NOT extended.
  - **Frontend `handleVoidBatch` dead-code deletion was user-approved** (one specific case, not a sweep). Removed handler + `voidExportBatchMutation` + `useVoidFinanceExportBatchMutation` import — total ~17 lines. The void-batch capability remains in `features/finance/hooks.ts` for future wiring.
  - **`makeLifecycleMutation` renamed to `useLifecycleMutation`** in `admin-golf-tee-sheet-page.tsx`. The C7 architecture pass introduced this factory; ESLint's `react-hooks/rules-of-hooks` correctly flagged that a function calling `useMutation` must follow custom-hook naming (`use*`). The 4 call sites within the component body satisfy hook rules. No behavioural change.
  - **Test-file `any` → typed**: Test fixtures in `admin-golf-tee-sheet-page.test.tsx` and `golf-settings/hooks.test.tsx` had `: any` annotations on clone helpers, mock arg destructures, and `getQueryData<any>()` calls. Replaced with `TeeSheetDayResponse` (proper response type), `typeof teeSheetPayload` for clones, and `(...args: never[]) => unknown` for the multi-mutation harness. One inline booking fixture at line 1333 was missing `holes: 18` (now revealed by stricter typing) — added. Two `as` casts added on `(mutation.mutate as ...)` to keep the harness covariant. Tests pass unchanged: 275/275.
  - **`tailwind.config.js` converted to ESM imports** for `@tailwindcss/forms` and `@tailwindcss/container-queries`. The file already used `export default {…}` (ESM) but `require()` for the plugins; ESLint correctly flagged `require()` in an ESM module. No config-file changes elsewhere.
  - **Empty-interface idiom collapsed to `type` aliases** in `types/bookings.ts` (4 cases) and `types/orders.ts` (4 cases). TypeScript treats `interface X extends Y {}` and `type X = Y` identically for object-type cases — no behavioural change.
  - **vi.mock factories given PascalCase function names** in `persistent-shell-layout.test.tsx`. The previous shape `() => ({ default: ({ children }) => { React.useEffect(...) ... } })` triggered `rules-of-hooks` because the inner function was named `default` (lowercase). Rewriting as `function MockAdminShell(...)` returned via `{ default: MockAdminShell }` satisfies the rule without changing test behaviour.
- **Follow-ups created**:
  - **13 `react-hooks/exhaustive-deps` warnings** remain (10 "wrap in useMemo" + 3 "missing dependency"). Per user direction: each requires per-component review against actual render/effect behaviour. **Address in later phases as we touch the affected files, not as a sweep.** Files: `features/orders/order-management-drawer.tsx:168`, `features/targets/hooks.ts:229`, `features/tee-sheet/booking-management-drawer.tsx:316`, `pages/admin-golf-settings-guided-page.tsx:425`, `pages/admin-golf-tee-sheet-page.tsx:1421` & `:2081`, `pages/admin-reports-page.test.tsx:59`, `pages/admin-targets-page.test.tsx:42`, `pages/superadmin-accounting-profiles-page.tsx:116-117`, `pages/superadmin-clubs-page.tsx:150` (×2), `pages/superadmin-overview-page.tsx:28`.
  - **Frontend `dist/` artifact gotcha**: leaving `frontend/dist/` from a prior `npm run build` causes ESLint to lint the minified bundle (1100+ false errors before cleanup). Phase 3 deleted `dist/` before re-running lint. Consider whether `eslint.config.js` should explicitly exclude `dist/**` — currently it doesn't (Hard Rule 2 forbids the change here; flagging only).
  - **Backend bundle considerations**: pricing_rules enum drift (DRIFT_LOG, still open), club_invitations missing migration (LIVE_STATE.md), 811 kB JS bundle code-split — all unchanged by Phase 3.
- **Notes**:
  - Test-suite-after-every-pass discipline caught the only real regression (Step 2's bulk `--fix` mixing format+I001+UP017+UP035+UP037+F401 in one pass produced enough E's to require revert). The rule-isolated re-attempt avoided this entirely.
  - `ruff format` ran a second time after the E501 manual wraps because some wraps were narrow enough that the formatter chose to re-collapse them on a single line. No semantic difference; the final state is what the formatter chose given the now-shorter content.
  - `react-hooks/rules-of-hooks` finding for `makeLifecycleMutation` is itself a useful artifact — it caught a real anti-pattern that C7's lifecycle-factory refactor introduced. The fix (rename to `useLifecycleMutation`) is now consistent with React's hook conventions, which means the function will also be auto-memoized correctly by the React DevTools and won't trigger ESLint complaints on future call-site additions.
  - This phase touched both production source (services, route files, page components) and test fixtures. **Final pytest, vitest, typecheck, build, and smoke results all match baseline counts** (191 pytest, 275 vitest, 0 type errors, 5.48s build, 200 smoke).
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
