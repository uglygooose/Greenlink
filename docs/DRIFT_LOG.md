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
