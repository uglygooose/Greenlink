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
