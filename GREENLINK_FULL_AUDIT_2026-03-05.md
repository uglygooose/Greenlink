# GreenLink Full UI/Flow Audit (2026-03-05)

## Method used

1. Static UI coverage audit (`admin.html`, `admin.js`, `dashboard.html`, `player.js`, `index.html`, `booking.html`).
2. Route coverage audit vs backend routers (`admin.py`, `imports.py`, `tee.py`, `profile.py`, `scoring.py`).
3. Menu/action ownership review by domain (Golf / Pro Shop / People / Imports / Revenue).
4. Competitor and UX baseline review in `COMPETITOR_BENCHMARK_2026-03-05.md`.

## Automated checks completed

- Nav page -> section coverage: no missing admin page sections for nav entries.
- Tee-sheet manage `data-action` handlers: all actions wired.
- Inline `onclick` handlers in admin HTML: all referenced functions exist.
- Frontend API route coverage: no critical unknown API paths (except expected `/login` from auth flow and `/api/admin/imports` root path form).
- Player dashboard view controls (`home/book/rounds/profile`) map correctly to view sections.

## Gap matrix (priority-ordered)

| Priority | Area | Issue | Impact | Fix |
|---|---|---|---|---|
| P0 | Tee Sheet | Weather provider outage message was over-prominent and fallback behavior reduced trust | Staff loses confidence in auto-flag | Added provider fallback + cache fallback + cleaner status behavior |
| P0 | Action ownership | `Import Members CSV` appeared under Tee Sheet manage menu | Domain confusion, wrong mental model | Moved import entrypoint to People page tools |
| P0 | Navigation IA | Imported operation pages existed but were not in sidebar/quick-nav | Hidden capability, extra clicks | Added `Imported Operations` nav group + quick-nav entries |
| P1 | Cross-page efficiency | Common jumps required sidebar hunting | Slower execution in ops | Added direct shortcut buttons (Bookings -> Tee Sheet, Revenue -> Imports, Ops Config -> Revenue/People) |
| P1 | Status semantics | "provider unavailable" message appeared even with no booked players | Noise and alarm fatigue | Status now context-sensitive (no booked players -> neutral message) |
| P2 | Consistency | Quick-nav grouping labels were ambiguous | Lower scanability | Renamed/cleaned groups to align with sidebar ownership |
| P2 | Accessibility clarity | Status and action wording varied by page | Cognitive load | Standardized weather and flow microcopy where touched |

## Page-by-page review summary

## `Dashboard (All / Golf / Pro Shop)`

- Verified stream switch and period switch wiring.
- Verified operation-specific page title rendering.
- Verified AI assistant panel wiring is active.

## `Operations Config`

- Correct ownership for revenue import profile and CSV imports.
- Added one-click navigation to `Revenue` and `People` for reduced context switching.

## `Bookings`

- Verified date-basis and sort controls route to backend correctly.
- Added direct "Open Tee Sheet" shortcut.

## `People`

- Added `Import Members CSV` and `Import Log` entrypoints in-page.
- Kept role-based visibility logic (admin-only actions hidden for club staff).

## `Revenue`

- Verified period + stream focus model.
- Added direct "Open Import Setup" shortcut.

## `Tee Sheet`

- Removed non-tee member import action.
- Retained tee-specific operational actions only.
- Weather auto-flag now resilient and less noisy.

## `Pro Shop`

- Reviewed inventory/sales/checkout flow and period window options.
- Existing flow remains within expected baseline; no ownership conflicts found in this pass.

## `Imported Operations (Pub/Bowls/Other)`

- Pages already implemented and wired in JS.
- Added direct sidebar and quick-nav access.

## `Player App`

- Verified primary mobile flow structure (`home/book/rounds/profile`) and tab wiring.
- Verified view-state wiring in `player.js`.
- No major route or control dead-ends detected in this static pass.

## Implementation status in this cycle

- Completed: P0 + core P1 changes above.
- Remaining: broader visual-density/layout polish and optional component-level refinement pass.

## Next pass recommendations

1. Add end-to-end smoke tests for top 10 workflows (admin + player).
2. Add UI ownership test script in CI to block misplaced controls regressions.
3. Add operation-specific KPI acceptance checks per page.
