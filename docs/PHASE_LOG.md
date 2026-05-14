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
## Phase 10 cleanup — Marshal-on-phone (Slice 13) deferred to Phase 12 (2026-05-14)

Docs + stub-wording cleanup. No new features, no new components, no behaviour change. Phase 10 closed at Slice 11; Slice 12 (tournament mode) was deferred to Phase 11 by user decision after the tournament-mode audit. Slice 13 (marshal-on-phone) was carried forward but never explicitly reassigned. This cleanup formalises the deferral and updates the `⇧M` shortcut handler's stub message so it no longer references the never-shipped Slice 13.

- **Scope**:
  - Update the Bucket C forward-reference stub handler for `⇧M` (`frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.ts:142`): `announce("Marshal view arrives in Slice 13.")` → `announce("Marshal view arrives in Phase 12.")`.
  - Update the corresponding test assertion (`frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.test.tsx:329`) to match the new wording.
  - DRIFT_LOG entry recording the deferral with the audit findings as evidence so future-phase authors don't redo the recon.
  - PHASE_LOG entry (this one).
- **Files modified** (4 expected):
  - `frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.ts` (1 line — announcement string)
  - `frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.test.tsx` (1 line — test assertion string)
  - `docs/DRIFT_LOG.md` (new entry)
  - `docs/PHASE_LOG.md` (this entry)
- **Outcome**: Tests unchanged in count and structure (the `⇧M` test still exists and still asserts the announcement; only the asserted string is updated). Lint clean, typecheck clean, full suite green. No new dependencies. FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13.
- **Decisions made**:
  - **Phase 12 owns all mobile surfaces** — marshal-on-phone + player app + any future mobile-shape work. Rationale: mobile surfaces share design patterns (touch targets, viewport assumptions, responsive breakpoints, chrome-shell decisions, gesture vs keyboard input model) and should be built together rather than one-off-by-one-off. The v1 locked decision (responsive web, not Expo/RN) remains in effect.
  - **The shortcut catalog entry, the test assertion, and the page header comment remain as forward references** — only the operator-facing stub announcement is updated. The catalog (`shortcuts.ts:36`) and the page comment (`admin-tee-sheet-page.tsx:23`) describe the keystroke for users / readers and will be updated when Phase 12 actually lands the surface.
- **Follow-ups created**:
  - Phase 12 implementation will replace the `⇧M` stub announcement with a real handler that opens the marshal view (probably routing to a separate marshal-shell route given the 360×720 viewport assumption + 3-button workflow).
  - The page-header comment in `admin-tee-sheet-page.tsx:23` will need updating when Phase 12 ships; harmless until then.
- **Notes**:
  - See DRIFT_LOG 2026-05-14 entry "Phase 10 Slice 13 (marshal-on-phone) deferred to Phase 12" for full audit findings.
  - The Slice 12 deferral (DRIFT_LOG 2026-05-14, tournament mode → Phase 11) was a backend-blocked deferral. Slice 13 is a different shape — backend largely supports the marshal workflow already (check-in / no-show endpoints from Slice 10) — but the design is part of a cohesive mobile-surface effort that belongs in its own phase.

---
## Phase 10 — Slice 11: Density toggle (density-only; interval toggle deferred) (2026-05-14)

Frontend slice. Ships the density-cycle half of Slice 11. The slot-interval segmented toggle was deferred during reconnaissance because the backend doesn't accept `interval_minutes` as a query param on `GET /tee-sheet/day` (the spec premise was wrong). Recorded in DRIFT_LOG 2026-05-14; future Slice 11.5 backend mini-slice + Slice 11b frontend slice will complete the interval-toggle path. Density itself is keyboard-only access via the `v` shortcut (Slice 10's stub is replaced); preference persists per-user via localStorage.

- **Scope**:
  - `use-density.ts` (new) — three-mode cycle (`compact | default | comfortable`). Hook reads `localStorage["gl.tee-sheet.density"]` on mount; defaults to `compact` when absent (per Slice 1 token reconciliation). `cycleDensity()` advances compact → default → comfortable → compact, writes to localStorage, applies `data-density` to `document.documentElement` (removed when value is `default` so :root tokens win). Returns `{ density, cycleDensity }` and accepts an optional `onCycle(next)` callback. Synchronous mirror via `useRef` so consecutive cycleDensity calls in the same tick advance correctly even when React batches the state update.
  - `use-tee-sheet-shortcuts.ts` — Slice 10's `v` stub (`announce("Density toggle arrives in Slice 11.")`) is replaced. New required param `onCycleDensity: () => string`. The keystroke handler calls it, captures the returned new-density string, and announces `Density: ${next}` on aria-live.
  - `admin-tee-sheet-page.tsx` — mounts `useDensity` and threads `onCycleDensity: () => densityController.cycleDensity()` to the shortcut hook. No visible chrome change.
  - 8 new tests: `use-density.test.tsx` (7 — default + stored value + malformed-value fallback + cycle order + localStorage write + data-density attribute + onCycle callback), `use-tee-sheet-shortcuts.test.tsx` (+1 — `v` fires onCycleDensity and announces the new density; the prior `v` stub assertion is removed).
- **Files touched**:
  - `frontend/src/features/tee-sheet/use-density.ts` (created, 100 lines)
  - `frontend/src/features/tee-sheet/use-density.test.tsx` (created, 80 lines)
  - `frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.ts` (replace stub; add `onCycleDensity` param)
  - `frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.test.tsx` (harness gains `onCycleDensity` mock; new test replaces the old stub assertion)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (mount useDensity, thread to shortcut hook)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`, `docs/DRIFT_LOG.md` (backend gap entry)
- **Outcome**: 576 frontend tests pass (was 569; net +7). Lint: 0 errors (13 pre-existing warnings unrelated). Typecheck clean. No new dependencies. FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex colors in any new file.
- **Decisions made**:
  - **Path A — density only**. Confirmed at stop-and-ask: the backend has no `interval_minutes` query param on `GET /tee-sheet/day`, so the SlotIntervalToggle component can't ship today. Drift recorded; Slice 11.5 (backend) + Slice 11b (frontend) will complete the interval-toggle path.
  - **Density preference is frontend-only**. localStorage (`gl.tee-sheet.density`). No backend persistence in v1; no `/users/me/preferences` endpoint. Survives across sessions per browser.
  - **Default density = `compact`** when localStorage is absent (per the Slice 1 reconciliation note). Note that tokens.css :root values (36px row) match the `default` density mode; the `data-density="default"` attribute is intentionally REMOVED on the document root in that case so :root wins (the alternative — adding a `[data-density="default"]` selector — duplicates the :root tokens for no benefit).
  - **Synchronous-mirror ref pattern in useDensity**. The naive implementation set a closure variable inside `setDensity`'s updater and read it after — but React 18 doesn't guarantee the updater has fired by the time the call returns. Caught by the cycle-sequence test (first cycle worked, second cycle saw stale state). Fix: a `useRef` tracks the "logical" current density synchronously so chained calls advance correctly.
  - **`v` keystroke remains keyboard-only access**. No chrome toggle. Phase 8 design's a11y note ("density lives in the shortcut modal") is preserved.
  - **aria-live announcement format**: `Density: {next}`. Mirrors the Slice 10 announcement protocol (clear-then-set via `setTimeout(0)` boundary).
- **Follow-ups created**:
  - **Slice 11.5 (backend)** — add `interval_minutes` to `GET /tee-sheet/day` route + `TeeSheetDayQuery` schema + `TeeSheetService.load_day` signature. Optional clamp / whitelist on the allowed set (Phase 8 specifies 6/8/10/12). Tests for round-tripping + ClubConfig default fallback when omitted.
  - **Slice 11b (frontend)** — wire the `SlotIntervalToggle` to the now-available query param. Selection clears on interval change. Selected value comes from the response's `interval_minutes` (truth-from-server).
  - Per-user backend preference store for density (deferred; localStorage covers v1).
- **Notes**:
  - The DnD audit's note "interval_minutes param already works" was the source of the spec premise. Recon disproved it. Confirmed via `grep -n "interval_minutes" backend/app/api/routes/golf.py backend/app/schemas/tee_sheet.py backend/app/services/tee_sheet_service.py` — only the response-side projection + the hardcoded service-side read from ClubConfig exist; no override path.
  - The synchronous-mirror useRef pattern surfaced here is the same shape as Slice 9a's `activeSlotRef` (stale-call coordination) and Slice 10's `multiKeyStateRef` (gg sequence). Pattern recurs anywhere a hook's callback identity needs to stay stable while reading state that updates async.

---
## Phase 10 — Slice 10: Wire keyboard shortcuts (2026-05-14)

Frontend slice. Wires the tee-sheet keyboard surface end-to-end. The 24-entry shortcut map (Slice 6) gains action handlers across three buckets: 13 fully wired (Bucket A), 6 honest aria-live stubs for deferred surfaces (Bucket B), 3 forward-references to Slices 11/12/13 (Bucket C). esc and ? remain on their Slice 4/6 handlers (Bucket D — pre-wired). The skip-gate honours focused inputs / textareas / contenteditables; the gg sequence handler decays after 1 second.

- **Scope**:
  - `use-checkin-booking.ts` (new) + `use-mark-no-show.ts` (new) — React Query mutations calling `POST /api/golf/bookings/{id}/check-in` and `/no-show`. Backend constructs the request body from URL + authenticated user, so the client sends an empty body. `decision !== "allowed"` throws a typed `CheckInBookingError` / `MarkNoShowError` carrying the full result; success invalidates the tee-sheet day query so the row's status flips visually.
  - `use-tee-sheet-shortcuts.ts` (new) — ONE document-level keydown listener installed via `useEffect`; the dispatch is a single switch over `event.key` plus modifier checks. Refs hold the live params + the gg-sequence state so the listener installs once at mount and never re-registers. The hook returns nothing — pure side-effect.
  - Bucket A handlers (13): `t` jumps to today via `setDate(todayInClubTimezone())`; `←/→` shift the URL `date` param by ±1 day (`shiftIsoDate` utility, UTC-based to dodge host TZ); `j/k` step `selectedSlotKey` through the rendered `slotRows`; `gg` scrolls the row list to top; `⇧G` scrolls to bottom; `/` focuses the topbar search input via the new `data-testid="admin-topbar-search"`; `w` focuses the WaitlistRail's Add button; `c` fires `onCheckInBooking` on the selected row's first booking (status must be `reserved`); `x` fires `onMarkNoShow` with the same eligibility gate; `⌥P` opens the price popover for the selected row by clicking its `[data-testid="row-price-button"]` — reuses the Slice 5 path.
  - Bucket B stubs (6): `n` ("New booking flow not yet built."), `s` ("Squeeze-insert deferred from Phase 10."), `p` ("Pace status flow not yet built."), `⌘Z` ("Undo not yet available."), `⌥A` ("Audit history not yet available."), `h/l` ("Column selection not yet available."). Each fires an aria-live announcement; no other side effects.
  - Bucket C forward refs (3): `⇧T` ("Tournament mode arrives in Slice 12."), `⇧M` ("Marshal view arrives in Slice 13."), `v` ("Density toggle arrives in Slice 11."). Slices 11/12/13 will replace these handler bodies; the keystroke wiring stays.
  - `SelectionFooter` extension — the four shortcut chips (n/s/c/p) are now real buttons when the page supplies handlers (`onShortcutN/S/C/P` props); they fall back to the Slice 4 visual `<span>` stub when handlers are absent (preserves isolated component-test mounts). Each chip click fires the same handler as the keystroke, so mouse + keyboard parity is preserved.
  - `AdminTopBar` — search input gains `data-testid="admin-topbar-search"` so the `/` shortcut can target it via DOM query without coupling to the input's id or label.
  - `admin-tee-sheet-page.tsx` — `searchParams` destructure now includes `setSearchParams`. The page maintains a new `shortcutAnnouncement` state and threads `setShortcutAnnouncement` to the hook. aria-live region now composes drag > shortcut > post-drop. The page also wires footer chip clicks: `c` fires the check-in mutation with the same eligibility guard as the keystroke handler.
  - Clear-then-set announcement protocol: the hook's internal `announce(message)` calls `setShortcutAnnouncement("")` then `window.setTimeout(() => setShortcutAnnouncement(message), 0)`. The empty interval forces React to commit the empty state before the new message, so screen readers re-announce on repeats.
  - 37 new tests: `use-checkin-booking` (3), `use-mark-no-show` (3), `use-tee-sheet-shortcuts` (29 — shiftIsoDate utility + Bucket A handlers + skip-gate + stubs + forward refs + ⌥P with/without selection), SelectionFooter extension (+2 — chip clicks fire handlers, chips fall back to spans when no handlers).
- **Files touched**:
  - `frontend/src/features/tee-sheet/use-checkin-booking.ts` + `.test.tsx` (created)
  - `frontend/src/features/tee-sheet/use-mark-no-show.ts` + `.test.tsx` (created)
  - `frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.ts` + `.test.tsx` (created)
  - `frontend/src/features/tee-sheet/components/SelectionFooter.tsx` (chip click handlers)
  - `frontend/src/features/tee-sheet/components/SelectionFooter.test.tsx` (+2 chip tests)
  - `frontend/src/components/admin-shell/AdminTopBar.tsx` (`data-testid="admin-topbar-search"`)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (mount hook + shared announce state + chip click wiring)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`
- **Outcome**: 569 frontend tests pass (was 532; +37). Lint: 0 errors (13 pre-existing warnings unrelated). Typecheck clean. No new dependencies. FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex colors in any new file.
- **Decisions made**:
  - **Single page-level keydown listener for the 22 new shortcuts** (existing esc + ? handlers stay on their own listeners — they predate this slice). The dispatch lives in one switch over `event.key` plus modifier checks. Refs hold the live params so the listener installs once and stays stable.
  - **gg sequence handler**: 1-second decay. Each `g` keydown checks if the previous keydown was `g` within 1s. Older state clears on any non-`g` key or on timeout naturally.
  - **Skip-gate**: respects `<input>`, `<textarea>`, and contenteditable elements — every shortcut is suppressed when one of these owns focus. Mirrors the Slice 6 "?" handler's gate verbatim.
  - **Clear-then-set aria-live protocol** for shortcut announcements. Forces screen readers to re-announce repeats (same message → same message). `setTimeout(0)` is the cheapest way to break the React state-batching boundary; `queueMicrotask` doesn't work because it stays inside the same batch.
  - **Eligibility checks at the keystroke level**, not at the mutation level. The hook inspects the selected row's first booking and verifies `status === "reserved"` before firing `c` / `x`. The backend would also reject (`booking_status_not_*`), but the client-side guard gives instant feedback via the aria-live "No eligible booking…" branch.
  - **Multi-booking rows: c / x act on the first booking only**. Bulk check-in / no-show is a future surface; not invented here.
  - **Backend ownership absolute**: the mutation hooks send empty bodies; `acting_user_id` is set on the backend from `current_user`. The client doesn't pass it. Matches `BookingLifecycleMutationRequest` in `backend/app/schemas/bookings.py:247-251`.
  - **Footer chip clicks fire the same handler as the keystroke** for mouse + keyboard parity. n/s/p chip clicks produce the same aria-live stub the keystroke would.
  - **`/` shortcut focuses the topbar search input via `data-testid`**. The topbar isn't owned by the tee-sheet page (it's the shell), so DOM-level query is the right boundary — `data-testid` is more robust than relying on `aria-label="Search"` (multiple search inputs could land in the DOM in the future).
  - **`⌥P` opens the popover by clicking the row's existing price button**, not by reconstructing the popover state directly. Reuses the Slice 5 click handler chain so the popover's anchor + dismiss behaviour are identical to mouse-driven activation.
- **Follow-ups created**:
  - Slice 11 will replace the `v` handler with a density-cycling implementation. The keystroke wiring is already in place.
  - Slice 12 will replace `⇧T`. Slice 13 will replace `⇧M`. Same shape.
  - New-booking flow (Bucket B `n`), pace-status flow (`p`), squeeze-insert (`s`), undo (`⌘Z`), audit-history overlay (`⌥A`), column selection (`h/l`) all remain Phase 11+ candidates. Each has an honest aria-live stub today.
- **Notes**:
  - The `j/k` test in `use-tee-sheet-shortcuts.test.tsx` initially tried to chain `j` and `k` in a single harness mount, expecting setSelectedSlotKey to advance and then retreat. That fails because the harness's `selectedSlotKey` prop is closed over at mount and doesn't actually update on each `setSelectedSlotKey` call — the hook computes the next slot from the stale prop. Fixed by splitting into per-direction tests with the right starting state. Pattern recorded: tests that exercise multiple sequential selection moves need a harness that actually re-renders with the updated prop, or split into one assertion per call.
  - The shortcut map continues to ship as-is (24 entries) — Slice 6 already shipped the map; Slice 10 only wires actions. The Phase 8 "28 shortcuts" count includes some affordances the map doesn't currently catalogue; reconciliation is a future-doc concern, not a code concern.

---
## Phase 10 — Slice 9b: Lock visibility (other-operator side) (2026-05-14)

Frontend slice. Completes the holder + observer pair: Slice 9a renders the operator's own lock in the selection footer; Slice 9b polls `GET /api/golf/tee-sheet/locks` every 15s and renders a non-interactive lock badge on rows held by OTHER operators. The badge sits in the action column, replacing the more_vert button per Phase 8 Annot #4 ("their tile carries a small lock badge in place of the chevron"). Locks remain advisory — booking mutations still fire.

- **Scope**:
  - New `use-tee-sheet-locks.ts` — React Query polling hook calling `GET /api/golf/tee-sheet/locks?course_id&date`. Key shape `["tee-sheet-locks", clubId, courseId, date]`. `refetchInterval: 15_000` (half the 60s lock TTL). `refetchIntervalInBackground: false` (pauses when the tab is backgrounded). `enabled` gated on (`accessToken && clubId && courseId && date`). `staleTime` matches refetch interval so consumers don't trigger extra fetches between ticks.
  - New `lock-utils.ts` — pure `buildLocksBySlot(locks, currentUserId)` indexes the polled list by `slot_datetime`, filtering out the current user's locks. Slice 9a's holder-side footer already renders the operator's own lock; rendering a row badge for the same lock would be redundant.
  - `components/TeeRow.tsx` extended — new `otherLock?: TeeSheetLockResponse | null` prop. The action column renders the lock badge (non-interactive `<span>` with the lock icon at 12px, atrisk-toned, on an atrisk 8% tinted background, radius `--gl-radius-sm`, 22×22 inside the existing 32px column) when `otherLock` is set; falls back to the existing more_vert button otherwise. `aria-label="Slot held by {holder_display_name}"`; `title="{holder_display_name} · {remaining_seconds}s remaining"` for hover-reveal. The badge is non-interactive — no popover; Phase 8 doesn't design one.
  - `pages/admin-tee-sheet-page.tsx` — mounts `useTeeSheetLocks`, derives the per-slot Map via `buildLocksBySlot` (memoised on `[locks, currentUserId]`), passes `locksBySlot.get(slot.slot_datetime) ?? null` to each `<TeeRow>` as `otherLock`.
  - Drop-target behaviour unchanged: rows with `otherLock` set are STILL drop targets. Locks are advisory; the backend handles whatever placement validation matters (capacity, hard-blocks). The badge is informational.
  - 12 new tests: `lock-utils.test.ts` (4 — empty input, own-lock filtering, slot indexing, null user behaviour), `use-tee-sheet-locks.test.tsx` (5 — refetch interval constant, query key composition, two disabled cases, enabled fetch path), `TeeRow.test.tsx` extension (+3 — more_vert when no lock, badge when lock present, row remains drop target with lock set).
- **Files touched**:
  - `frontend/src/features/tee-sheet/use-tee-sheet-locks.ts` (created)
  - `frontend/src/features/tee-sheet/use-tee-sheet-locks.test.tsx` (created)
  - `frontend/src/features/tee-sheet/lock-utils.ts` (created)
  - `frontend/src/features/tee-sheet/lock-utils.test.ts` (created)
  - `frontend/src/features/tee-sheet/components/TeeRow.tsx` (otherLock prop + badge render)
  - `frontend/src/features/tee-sheet/components/TeeRow.test.tsx` (+3 tests)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (mount poll, derive map, pass otherLock)
  - `frontend/src/features/tee-sheet/use-acquire-lock.test.tsx` (typecheck narrowing fix on the discriminated-union conflict result)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`
- **Outcome**: 532 frontend tests pass (was 520; +12). Lint: 0 errors (13 pre-existing warnings unrelated). Typecheck clean. No new dependencies; FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex colors in any new file.
- **Decisions made**:
  - **15-second polling cadence** at v1. Half the 60s lock TTL → operators see at most 15s lag between another operator's release and the badge disappearing. Tunable later (single constant).
  - **Polling pauses when backgrounded** (React Query's `refetchIntervalInBackground: false`). The lock list only matters when the operator is actively looking at the tee sheet.
  - **Page-level query, not per-row**. One fetch services every row's badge via the per-slot Map.
  - **Self-lock filtering at the page boundary**. The page filters `holder_user_id === currentUserId` before passing the map down. TeeRow stays unaware of the current user; it just renders whatever `otherLock` it receives.
  - **Badge is non-interactive**. Phase 8 doesn't design a popover for the badge; the `title` attribute is the fallback affordance. Click-through to a holder-detail popover is a future-phase candidate.
  - **No client-side countdown on the badge**. Unlike Slice 9a's footer (per-second countdown for your own lock), the badge shows `remaining_seconds` exactly as the backend returned it. The next poll refreshes it. Visual hierarchy is intentional: your own lock gets a precise countdown; other operators' locks get a coarser staleness window.
  - **Slice 9a and Slice 9b are independent observers**. Both watch the same backend data via separate paths; they sync by the 15s poll cadence, not by frontend coordination. When the operator selects a slot another operator holds, both surfaces show the same `holder_display_name` and approximately the same `remaining_seconds` (within poll-jitter tolerance).
  - **Drop targets unchanged**. Locks remain advisory; rows with `otherLock` set are still drop targets. The backend handles validation if it matters.
- **Follow-ups created**:
  - Future-phase real-time push (Yjs awareness) once polling is proven and a transport upgrade is on the roadmap.
  - Slice 9c+ candidate — popover on the lock badge (when Phase 8 designs the interaction shape).
- **Notes**:
  - The Slice 9a `use-acquire-lock.test.tsx` had a latent typecheck narrowing issue: `outcome!` on a `LockAcquireResult | null` doesn't preserve discriminated narrowing across multiple non-null assertions. Fixed by capturing into a typed const (`const settled = outcome as unknown as LockAcquireResult`) and narrowing through that. Recorded here so future tests with `let var: Union | null` + `mutateAsync` follow the same idiom.
  - The `_serialize_lock` helper on the backend already computes `remaining_seconds` at serialisation time (Slice 8.5). The frontend uses that value as-received in the badge tooltip — no client-side recomputation.

---
## Phase 10 — Slice 9a: Optimistic lock (holder side) (2026-05-14)

Frontend slice. Closes the holder-side half of the v1 concurrency gap documented in DRIFT_LOG 2026-05-14 (Slice 8A). Selection drives the lock lifecycle: when the operator selects a tee row, the page acquires the slot lock; when selection clears or shifts, the page releases. A single page-level setInterval ticks the countdown every second and auto-renews at 30s remaining. Other-operator visibility (Slice 9b) is out of scope — Slice 9a only renders the holder-side state in the SelectionFooter.

- **Scope**:
  - `frontend/src/api/client.ts` — `ApiError` now carries an optional `body` field so callers that need the structured response shape (lock 409 conflict detail) can read it without redoing the fetch. Backwards-compatible: the existing `status` + `message` are unchanged; the new field defaults to `null`.
  - `frontend/src/types/tee-sheet-locks.ts` (new) — mirrors `backend/app/schemas/tee_sheet_locks.py`: `TeeSheetLockAcquireRequest`, `TeeSheetLockResponse` (with `remaining_seconds` server-derived but re-derived client-side for the live countdown), `TeeSheetLockConflictDetail`, `TeeSheetLockListResponse`, and the FastAPI 409-body wrapping shape `TeeSheetLockConflict409Body`.
  - `frontend/src/api/operations.ts` — new client helpers: `acquireTeeSheetLock` (returns `LockAcquireResult` discriminated union — 409 surfaces as `kind: "conflict"`, never thrown), `renewTeeSheetLock` (same shape via `LockRenewResult`), `releaseTeeSheetLock` (DELETE; swallows errors silently per spec), `listTeeSheetLocks` (read endpoint for Slice 9b's eventual use). Private `unwrapLockConflict` narrows the FastAPI `{detail: ...}` wrapper into the typed conflict shape.
  - Three thin React Query mutation hooks: `use-acquire-lock.ts`, `use-renew-lock.ts`, `use-release-lock.ts`. They wrap the client helpers; the orchestrator does the coordination.
  - `use-selection-lock.ts` (new) — the orchestrator. State machine: `idle | acquiring | held-by-me | held-by-other | releasing | error`. Single page-level `window.setInterval(1000)` mounted via `useEffect` gated on `state.kind` ∈ {held-by-me, held-by-other}. Stale-call coordination via an `activeSlotRef` — every mutation callback re-checks the live `selectedSlotKey` before applying its result, and if the slot has moved on, a successful acquire fires an immediate release for the orphaned lock. Unmount cleanup fires release for any current lock.
  - 409 dual-path: when acquire returns conflict and `existing_lock.holder_user_id === currentUserId`, the orchestrator reuses the existing lock as `held-by-me` (no new lock created). When the holder is a different user, state is `held-by-other` and the footer shows their name + countdown.
  - `frontend/src/features/tee-sheet/components/SelectionFooter.tsx` — replaces the Slice 4 stub `"Slot — · — remaining"` line with state-driven rendering across all six SelectionLockState kinds. `lockLineColor` switches to `--gl-state-atrisk` for `held-by-other` and `error`; the held-by-me / held-by-other countdowns render in `gl-mono`. Acquiring/releasing use the existing Pill primitive (info / neutral). When `lockState` is omitted (isolated component-test mounts, legacy callers), the legacy empty placeholder still renders.
  - `frontend/src/pages/admin-tee-sheet-page.tsx` — mounts `useSelectionLock` at page level and threads `state` + `secondsRemaining` + `holderDisplayName` to SelectionFooter. The orchestrator observes `selectedSlotKey` and `courseId`; the existing esc/course-change/popover-dismiss selection-clear paths automatically flow through to lock release. Booking mutations (Slice 8A/8B) are untouched — locks remain advisory.
  - 25 new tests: `use-acquire-lock.test.tsx` (4), `use-renew-lock.test.tsx` (3), `use-release-lock.test.tsx` (3), `use-selection-lock.test.tsx` (8 — idle / acquire success / 409 by other / 409 by self / selection-clear release / auto-renewal at 30s / renewal failure → error / unmount release), `SelectionFooter.test.tsx` extension (+7 — each of the 6 lock-line states + countdown prop update).
- **Files touched**:
  - `frontend/src/api/client.ts` (ApiError + body)
  - `frontend/src/api/operations.ts` (4 lock helpers + unwrapper)
  - `frontend/src/types/tee-sheet-locks.ts` (created)
  - `frontend/src/features/tee-sheet/use-acquire-lock.ts` (created)
  - `frontend/src/features/tee-sheet/use-acquire-lock.test.tsx` (created)
  - `frontend/src/features/tee-sheet/use-renew-lock.ts` (created)
  - `frontend/src/features/tee-sheet/use-renew-lock.test.tsx` (created)
  - `frontend/src/features/tee-sheet/use-release-lock.ts` (created)
  - `frontend/src/features/tee-sheet/use-release-lock.test.tsx` (created)
  - `frontend/src/features/tee-sheet/use-selection-lock.ts` (created)
  - `frontend/src/features/tee-sheet/use-selection-lock.test.tsx` (created)
  - `frontend/src/features/tee-sheet/components/SelectionFooter.tsx` (state-driven lock line)
  - `frontend/src/features/tee-sheet/components/SelectionFooter.test.tsx` (+7 tests)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (mount orchestrator + pass to footer)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`
- **Outcome**: 520 frontend tests pass (was 495; +25). Lint: 0 errors (13 pre-existing warnings unrelated). Typecheck clean. No new dependencies; FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex colors in any new file.
- **Decisions made**:
  - **Selection drives the lock**. The existing Slice 4 selection state is the single source of truth — no parallel "lock state" lives outside the orchestrator. When selection changes (set → null, null → set, set → set), the hook releases the prior lock and acquires the new one.
  - **Single page-level interval** (window.setInterval, 1000ms) inside a `useEffect` gated on `state.kind`. The interval is created when the orchestrator enters held-by-me/held-by-other and cleared on exit. Renewal threshold: 30 seconds (half the 60s server TTL).
  - **409 typed, not thrown**. The acquire client helper returns `LockAcquireResult` as a discriminated union — `{kind: "lock"}` on 201 or `{kind: "conflict"}` on 409. The orchestrator decides whether 409 with `holder_user_id === currentUserId` means "reuse the existing lock" (held-by-me) or "another operator has it" (held-by-other). React Query's mutation `mutate` doesn't see 409 as an error; the hook resolves successfully with the conflict shape.
  - **ApiError body extension** chosen over a parallel fetch wrapper. The smallest surgical change to surface structured 409 bodies; backwards-compatible (every existing caller continues to use `status` + `message` exactly as before).
  - **Stale-call coordination via `activeSlotRef`**. Each per-call mutation callback compares the slot it was fired for against the ref's current value. Stale responses are ignored, and if a stale acquire succeeded for an abandoned slot, the orchestrator fires an immediate release. React Query's built-in mutation behavior preserves per-call callbacks correctly; the ref pattern is what makes the orchestrator's `state` only reflect the current selection.
  - **Browser unload uses standard fetch** via React Query's mutation (not `navigator.sendBeacon`). The 60s server-side TTL handles the eventual cleanup if the in-flight DELETE doesn't reach the server during page-close.
  - **Locks remain advisory**. Booking mutations (POST /api/golf/bookings, POST /move) still fire optimistically and the backend validates. The lock is a UI-coordination signal only.
- **Follow-ups created**:
  - Slice 9b — poll `GET /api/golf/tee-sheet/locks` and render the lock badge on other operators' tiles per Phase 8 annot #4.
  - Slice 9c+ candidate — consider `navigator.sendBeacon` for the unmount release to maximise delivery during browser-close (would tighten the TTL-decay window).
  - Future-phase real-time push (Yjs awareness) once the polling model is proven and a transport upgrade is on the roadmap.
- **Notes**:
  - The fake-timer test for auto-renewal needed two layers of awaiting (`Promise.resolve()` calls around `vi.advanceTimersByTime`) to flush the React Query microtask queue between ticks. Recorded here so future hooks with mixed timers + mutations follow the same idiom.
  - The orchestrator stores the current lock in a `useRef` (not state) so the interval can read it without re-creating itself on every renewal. A separate `useState<now>` is updated by the ticker to force re-renders and drive the countdown — the hook returns `secondsRemaining` computed at render time from `lock.expires_at` + `now`.

---
## Phase 10 — Slice 8.5: Backend tee-sheet lock primitive (2026-05-14)

Backend-only mini-slice. Adds the optimistic-lock primitive that Slice 9a/9b will use for UI coordination on the tee-sheet surface. Locks are advisory — booking endpoints do not consult them; the existing capacity check on `POST /api/golf/bookings` remains the source of truth for placement. Locks are a signal so operators can see when another operator is editing a slot.

- **Scope**:
  - New model `TeeSheetLock` (`backend/app/models/tee_sheet_lock.py`) — one row per (course_id, slot_datetime), enforced by `uq_tee_sheet_locks_course_slot` unique constraint. Uses `UUIDPrimaryKeyMixin` + `TimestampMixin` (created_at carries the acquire timestamp, exposed as `acquired_at` on the response schema; updated_at moves on renew).
  - New schemas (`backend/app/schemas/tee_sheet_locks.py`): `TeeSheetLockAcquireRequest`, `TeeSheetLockResponse` (with `remaining_seconds` derived at serialization), `TeeSheetLockConflictDetail` (409 body), `TeeSheetLockListResponse`. Helper `remaining_seconds_for(expires_at)` shared by route serializers.
  - New service `TeeSheetLockService` (`backend/app/services/tee_sheet_lock_service.py`) with 4 methods:
    - `acquire(*, club_id, course_id, slot_datetime, holder_user_id, context=None) -> TeeSheetLock | TeeSheetLockConflict`
    - `renew(*, club_id, lock_id, holder_user_id, context=None) -> TeeSheetLock` — raises `ConflictError` for expired or not-held-by-caller
    - `release(*, club_id, lock_id, holder_user_id, context=None) -> None` — idempotent; raises `ConflictError` only when the lock exists but isn't the caller's
    - `list_active(*, club_id, course_id, day) -> list[TeeSheetLock]` — uses the club's ClubConfig timezone to compute the day-range bounds; filters `expires_at > now()`
  - TTL = `LOCK_TTL_SECONDS = 60`. Hard-coded; v1 is not per-club configurable.
  - Expired-lock handling per spec Approach A: on acquire, an expired row for the target slot is deleted before INSERT and emits its own `tee_sheet_lock.released` event with `reason="expired"`. Clean audit trail.
  - Race-handling: if two concurrent acquires both pass the existence check, the second's INSERT raises `IntegrityError` on the unique constraint; the service rolls back, re-reads the winner row, and returns `TeeSheetLockConflict`.
  - Four routes registered on the existing `golf.router` (`backend/app/api/routes/golf.py`):
    - `POST /api/golf/tee-sheet/locks` → 201 / 409 with `TeeSheetLockConflictDetail`
    - `POST /api/golf/tee-sheet/locks/{lock_id}/renew` → 200
    - `DELETE /api/golf/tee-sheet/locks/{lock_id}` → 204 (idempotent)
    - `GET /api/golf/tee-sheet/locks?course_id=...&date=...` → 200 `TeeSheetLockListResponse`
  - Access guards: acquire/renew/release require `require_operations_write` (staff with write access); list uses `_require_golf_read` so members + staff who can see the tee sheet can see the locks on it (necessary for Slice 9b visibility).
  - Event types emitted via the existing `DatabaseEventPublisher` idiom:
    - `tee_sheet_lock.acquired` — payload includes lock_id, course_id, slot_datetime, holder_user_id, expires_at.
    - `tee_sheet_lock.renewed` — payload includes lock_id, new expires_at.
    - `tee_sheet_lock.released` — payload includes lock_id, previous_holder_user_id, reason (`"released"` or `"expired"`).
  - Migration `202605140001_add_tee_sheet_locks` (down_revision=`202605130001`): `create_table` with all columns + the unique constraint + three indexes (`ix_tee_sheet_locks_club_id`, `ix_tee_sheet_locks_course_id`, `ix_tee_sheet_locks_course_slot_expires`). Clean downgrade drops indexes + table. Round-trip verified (`alembic upgrade head` + `alembic downgrade -1` + re-upgrade).
  - 14 new tests in `backend/tests/test_tee_sheet_locks.py` (HTTP-level + service-level): acquire happy path + event, conflict 409, expired-then-acquire (release event + acquire event), renew happy + event, renew non-holder 409, renew expired 409, release happy + event, release non-holder 409, release nonexistent 204, list active filters expired, list empty, race condition fallback (mocks `_load_lock_for_slot` to exercise the IntegrityError path), renew missing → ConflictError, service-level release event emission.
- **Files touched**:
  - `backend/app/models/tee_sheet_lock.py` (created, 67 lines)
  - `backend/app/models/__init__.py` (TeeSheetLock import + __all__)
  - `backend/app/schemas/tee_sheet_locks.py` (created, 67 lines)
  - `backend/app/services/tee_sheet_lock_service.py` (created, 251 lines)
  - `backend/app/api/routes/golf.py` (HTTPException import + lock serializer helper + 4 new routes)
  - `backend/alembic/versions/202605140001_add_tee_sheet_locks.py` (created, 89 lines)
  - `backend/tests/test_tee_sheet_locks.py` (created, 405 lines)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`
- **Outcome**: Backend tests at HEAD: 306 → 320 (+14). Ruff clean. Alembic round-trip clean. No frontend code touched.
- **Decisions made**:
  - **Slot-level locks**, not row-level. Phase 8's selection footer says "Slot 06:46 held by you" — the unit is the slot (slot_datetime), not the row (lane + time). Matches the frontend's selection model which keys off slot_datetime.
  - **60-second TTL hard-coded** at the service layer (`LOCK_TTL_SECONDS`). Per-club configurability deferred until there is a concrete reason to vary it.
  - **Approach A** for expired locks (DELETE the expired row + emit release event, then INSERT the new lock) over Approach B (UPDATE in place). Cleaner audit trail — every state transition produces its own event.
  - **Optimistic locking via unique constraint**. No `pg_advisory_lock` or `SELECT FOR UPDATE` — the unique constraint on `(course_id, slot_datetime)` already serializes concurrent INSERTs at the storage layer.
  - **Locks are advisory**. Booking endpoints do NOT consult them. Two operators dropping different parties on the same slot still both fire `POST /api/golf/bookings`; the second is rejected by the existing availability check (Slice 8a's documented v1 concurrency gap), not by the lock. Locks are UI signal only.
  - **No real-time push**. v1 is REST + polling (Slice 9b decides the cadence). Yjs awareness is a future-phase migration; the route surface is stable enough to swap the transport later without breaking the contract.
  - **No scheduled cleanup job**. Expired rows accumulate but the unique constraint plus on-demand deletion (Approach A) means they never block acquires. Future-phase improvement.
  - **List endpoint requires golf-read, not operations-write**. Members who can see the tee sheet must also see the visibility-of-other-operators' holds (necessary for Slice 9b's "Slot held by {operator}" annotation).
- **Follow-ups created**:
  - Slice 9a (frontend) — wire acquire/renew/release into the selection lifecycle, render the selection-footer countdown, surface the 409 conflict with the existing holder visibility.
  - Slice 9b (frontend) — poll `GET /tee-sheet/locks` and render the lock badge on other operators' tiles per Phase 8 annot #4.
  - Cleanup task for expired lock rows (low-priority — unique constraint + on-demand delete handles correctness).
  - Yjs awareness migration once real-time push is on the roadmap.
- **Notes**:
  - The first full-suite run reported 67 failures + 13 errors, all transient. Confirmed via diagnosis: a previous background `pytest tests/ -q` job (the same suite) was still racing on the shared test database. Killing it cleared the contention; the focused rerun of representative failed tests passed cleanly. Documented here so future slices avoid the same false signal.
  - `_load_lock_for_slot` is patched in the race-condition test to simulate two concurrent acquires both passing the existence check. The unit-test approach (rather than threading) is the spec's explicit fallback when the codebase doesn't support pytest-async / parallel transactions natively.
  - The frontend's existing `BookingMoveResult.booking.id` capture pattern (DRIFT_LOG 2026-05-14, post Slice 8b) does not apply here — lock mutations have no split semantics. The acquire response carries a stable `id` that never changes; renew/release/list all operate on the same id.

---
## Phase 10 — Slice 8b: Player cell move + sequential swap with partial-state Pill (2026-05-14)

Frontend slice. Extends the Slice 8a DnD pipeline to support cross-row participant moves and two-step swaps. Filled player cells with moveable bookings (RESERVED / CHECKED_IN, mirroring `backend/app/services/booking_move_service.py:50`) become drag sources; empty AND filled cells in different rows become drop targets. Same-row reorder is rejected client-side before any backend call; partial-swap failures surface an inline action banner with Retry / Restore.

- **Scope**:
  - `dnd/types.ts` extended: `ParticipantDragPayload` variant on `DragPayload` (booking_id, participant_id, display_name, party_size, source_slot_datetime, source_row_key, source_cell_index); new `CellOccupant` record for the drop callback.
  - `dnd/use-drag-state.ts` extended: aria-live announcement now covers `kind: "participant"` ("Picking up {display_name} from {source_row_key}").
  - New `use-move-participant.ts`: typed mutation hook calling `POST /api/golf/bookings/{booking_id}/move` with `{target_slot_datetime, target_start_lane: null, target_tee_id: null, participant_id}`. `MoveParticipantError` carries the structured `BookingMoveResult` plus a categorised failure (`capacity_full | target_blocked | target_reserved | booking_not_moveable | crosses_day_boundary | no_op | target_tee_not_found | participant_not_found | booking_not_found | club_config_not_found | unknown`). Optimistic patch removes participant from source booking + adds an `optimistic-move-` transient at the target slot. Rollback on error, invalidate on settle.
  - New `use-participant-swap.ts`: orchestrator wrapping two `useMoveParticipant` calls in sequence. Reducer-based state machine: `idle | first-pending | second-pending | succeeded | partial-failure-first | partial-failure-second | rejected-target-row-full | restoring | restore-failed | restored`. `targetRowHasIntermediateSpace(targetRow, targetSlotDatetime)` checks for at least one open cell in the target slot — short-circuits with `rejected-target-row-full` if not viable. `restoreFirst` uses the NEW booking_id from move A's response (split case) for the reverse move.
  - New `components/PartialSwapPill.tsx`: info-toned action banner (heritage-500 at 7% / 35% — matches Slice 8a banner idiom). "Retry move" + "Restore" buttons; busy states; ARIA alert.
  - `components/TeeRow.tsx` extended: `buildPlayerCells` threads booking_id + participant_id + party_size + booking_status through each player-cell spec. Filled cells with moveable booking become drag sources (`draggable={true}`, cursor: grab); on dragstart they write a `ParticipantDragPayload` to the dataTransfer. Drop-mode per cell computed at row level: `none | valid | reject`. Cross-row drag of a participant + filled cell → drop-target valid; same-row drag + any cell → reject (dashed `--gl-state-atrisk` border, "Same-row reorder not yet supported" mono label). Drop on same-row cells is a client-side no-op (backend would also reject with `move_is_no_op`).
  - `pages/admin-tee-sheet-page.tsx` extended: mounts `useMoveParticipant` + `useParticipantSwap`. Drop handler routes by `payload.kind`:
    - `waitlist` → existing walk-in mutation (Slice 8a behaviour preserved).
    - `participant` + same-row → no-op (defensive double-guard; cell already short-circuits).
    - `participant` + cross-row + open cell → single move mutation.
    - `participant` + cross-row + filled cell → swap orchestrator with the live target row passed in for intermediate-space gating.
    - Renders `PartialSwapPill` when orchestrator is in `partial-failure-second` / `restoring`. Renders an inline error banner for move errors, restore failures, and the row-full rejection.
  - aria-live region now also announces post-drop outcomes: "Moved {name} to slot {target_slot_datetime}", "Swap complete", "Partial swap — {name} pending", "First move restored", "Swap not possible — target row is full".
  - 46 new tests: `use-move-participant.test.tsx` (22 — payload builder, failure categorisation, optimistic patch + rollback, missing session). `use-participant-swap.test.tsx` (10 — sequencing, success, partial failures, retry, restore using NEW booking_id, target-row-full rejection, reset). `PartialSwapPill.test.tsx` (5 — copy, button actions, busy states). `TeeRow.test.tsx` (+9 — drag source on moveable cells, non-draggable on cancelled, dragStart payload write, cross-row drop on filled cell, same-row rejection visual, drop on same-row no-op, occupant threading to onDropOnSlot, buildPlayerCells field threading).
- **Files touched**:
  - `frontend/src/features/tee-sheet/dnd/types.ts` (participant variant + CellOccupant)
  - `frontend/src/features/tee-sheet/dnd/use-drag-state.ts` (participant announcement)
  - `frontend/src/features/tee-sheet/use-move-participant.ts` (created, 245 lines)
  - `frontend/src/features/tee-sheet/use-move-participant.test.tsx` (created, 340 lines)
  - `frontend/src/features/tee-sheet/use-participant-swap.ts` (created, 230 lines)
  - `frontend/src/features/tee-sheet/use-participant-swap.test.tsx` (created, 314 lines)
  - `frontend/src/features/tee-sheet/components/PartialSwapPill.tsx` (created, 81 lines)
  - `frontend/src/features/tee-sheet/components/PartialSwapPill.test.tsx` (created, 86 lines)
  - `frontend/src/features/tee-sheet/components/TeeRow.tsx` (drag source + drop modes + occupant threading)
  - `frontend/src/features/tee-sheet/components/TeeRow.test.tsx` (+9 tests)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (move + swap mounts; drop router; banners; aria-live)
  - `docs/PHASE_LOG.md` (this entry), `docs/DRIFT_LOG.md`, `docs/LIVE_STATE.md`
- **Outcome**: 495 frontend tests pass (was 449; +46). Lint: 0 errors (13 pre-existing warnings unrelated). Typecheck clean. No new dependencies; no DnD library. FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex in any new file (grep `#[0-9a-fA-F]{3,8}\b` on use-move-participant.ts, use-participant-swap.ts, PartialSwapPill.tsx → 0).
- **Decisions made**:
  - **Native HTML5 DnD only**, no library. The interaction shape is well-bounded (cell-to-cell with a single payload kind).
  - **Cross-row participant move is the primary supported flow** (Phase 8 design's per-player drag primitive). Whole-booking move is deferred — Phase 8 doesn't design a row-handle drag for v1.
  - **Same-row reorder rejected client-side** (Q2 deferral). The drop visual uses `--gl-state-atrisk` at 4% / dashed border + a mono `--gl-text-secondary` "Same-row reorder not yet supported" label. Drop is a no-op; no backend call. Both the row-level onDrop and the cell-level handleDrop short-circuit (defence in depth per ENGINEERING_STANDARDS §1).
  - **Sequential two-call swap** (Q3 Option a). No atomic-swap backend endpoint exists; the orchestrator composes two `/move` calls. State machine surfaces every transition through a discriminated union. When move B fails after move A commits, the `PartialSwapPill` lets the operator Retry or Restore.
  - **Restore uses move A's NEW booking_id from the response**. When A is the sole participant of its source booking, no split → same id. When A is one of N>1 participants, split → new id. Either way, `firstResult.booking.id` is authoritative.
  - **Intermediate-cell viability check is "open cell present in target row at target slot"** (Q3 a's honest variant). The backend's capacity check has the same effect — the frontend short-circuits to avoid the network round trip with a clean "Swap not possible — target row is full" surface.
  - **PartialSwapPill is NOT a literal use of the `Pill` primitive** (Pill is badge-sized). The "Pill" name in the spec refers to the heritage-500 visual tone; the actual surface is a banner — a custom component using the same color-mix idiom as Slice 8a's `WalkinBookingErrorBanner`.
  - **Banner mount point** chosen at top-of-grid above the row list, mirroring `WalkinBookingErrorBanner`. SelectionFooter mounting was acceptable per spec but spec also offered a top banner; chosen for consistency with the in-flight error idiom and because the Pill persists across drag interactions independent of selection state.
  - **Optimistic patch is per-call (no whole-swap atomic optimistic state)**. Patch 1 lands after move A; patch 2 lands after move B succeeds. When move B fails, only patch 1's state is in flight, which matches backend reality (move A is committed). On rollback (move B failure invalidates the cache anyway through `onSettled`), the live data refreshes with A in its new slot.
  - **No concurrency lock** (Slice 9a). Two operators dragging onto the same cell simultaneously: backend rejects the second with a `BookingMoveResult.decision = "blocked"` → caller surfaces it via the inline error banner. Same trade-off as Slice 8a; documented in DRIFT_LOG.
- **Follow-ups created**:
  - Atomic-swap backend endpoint (Slice 9b candidate). The sequential two-call sequence works but introduces a partial-state failure mode that the operator must resolve manually. A single backend transaction would eliminate the Pill entirely.
  - Slot soft-locks during in-flight moves (Slice 9a, already tracked).
  - Whole-booking move (row-handle drag) — Phase 8 hasn't designed the interaction shape for v1.
  - Keyboard-driven move/swap parity — Slice 10+ candidate (pick up, navigate, place).
- **Notes**:
  - The Slice 8a `WalkinBookingErrorBanner` is now reused for three additional surfaces: move errors, restore failures, swap-not-possible. The component generalises cleanly because its message is a single string — no Slice 8b-specific component grew on its back.
  - `buildPlayerCells` previously called `bookingParticipantNames` (names-only); replaced with a direct iteration over `booking.participants` so the cell can carry participant_id + booking metadata. The fallback for bookings with empty `participants[]` arrays (party_size > 0, no participant records) preserves the prior "Player 1 / Player 2 / …" placeholder naming.
  - The teeSheetKeys.day shape is `["tee-sheet", clubId, courseId, day, membershipType, teeId]` — caught a typo in my first draft of the move hook's day-query predicate where I had `k[1] === "day"` (no such segment exists). Fixed by index-based matching against the actual shape; documented this here so it doesn't recur.

---
## Phase 10 — Slice 8a: Waitlist → tee-row drag-and-drop (2026-05-14)

Frontend slice. Wires the waitlist rail (Slice 7) and the tee-row grid (Slice 2) into a working drag-and-drop pipeline that creates walk-in bookings via the existing `POST /api/golf/bookings` endpoint with `source="walk_in"` (Slice 7.5) and N GUEST participants.

- **Scope**:
  - New DnD primitives module: `frontend/src/features/tee-sheet/dnd/types.ts` (DragPayload discriminated union, SlotDropTarget, DRAG_PAYLOAD_MIME) + `dnd/use-drag-state.ts` (page-level drag controller with payload + activeTarget + polite aria-live announcement).
  - New mutation hook `use-create-walkin-booking.ts`: builds the booking payload (N participants sharing `guest_name`, first `is_primary`), patches the tee-sheet day query cache optimistically, rolls back on error, invalidates on settle. Exports `BookingCreateError`, `isOptimisticBookingId`, `OPTIMISTIC_BOOKING_ID_PREFIX`.
  - `WaitlistCard` gains native HTML5 drag handlers: writes the payload into `dataTransfer` via the custom MIME, sets `data-dragging`, fires page-level `onDragStart`/`onDragEnd`, and dims to opacity 0.45 when the drop's mutation is in flight (`isOptimisticallyRemoved`).
  - `TeeRow` gains drop-target wiring on empty player cells: non-blocked rows accept waitlist drags, the active drop target renders a brand-dashed border + "Drop here · {name}" with `north_east` icon, the row dims to opacity 0.65 while an optimistic booking is in flight.
  - `WaitlistRail` forwards drag props down to each `WaitlistCard`.
  - Page integration: `useDragState` + `useCreateWalkinBooking` mounted at `AdminTeeSheetPage`, an absolutely-positioned aria-live polite region announces "Picking up {name} · {1 seat|N seats}" on drag start, a dismissible inline `WalkinBookingErrorBanner` surfaces decision-blocked or network errors using the existing color-mix idiom.
  - `BookingCreateInput.source` (`frontend/src/types/bookings.ts`) extended `"admin" | "member_portal"` → `"admin" | "member_portal" | "staff" | "walk_in"` to match the Slice 7.5 backend enum.
  - 14 new tests: `use-create-walkin-booking.test.tsx` (10 — payload builder + hook lifecycle including success, missing session, decision !== "allowed" → BookingCreateError, optimistic patch, rollback) + `use-drag-state.test.tsx` (4 — initial state, start/end, announcement pluralisation, setActiveTarget). 4 extension tests on `WaitlistCard.test.tsx` (dragStart writes payload + fires callback + sets data-dragging, dragEnd clears, isOptimisticallyRemoved dims). 8 extension tests on `TeeRow.test.tsx` (drop eligibility gating by dragPayload + non-blocked, activeDropTarget visual, dragEnter fires with slot target, drop parses payload, malformed payload swallowed, optimistic booking dims row).
  - `admin-tee-sheet-page.test.tsx` wrapped in `QueryClientProvider` (now required because the page mounts the walk-in mutation hook).
- **Files touched**:
  - `frontend/src/features/tee-sheet/dnd/types.ts` (created, 26 lines)
  - `frontend/src/features/tee-sheet/dnd/use-drag-state.ts` (created, 56 lines)
  - `frontend/src/features/tee-sheet/dnd/use-drag-state.test.tsx` (created, 69 lines)
  - `frontend/src/features/tee-sheet/use-create-walkin-booking.ts` (created, 199 lines)
  - `frontend/src/features/tee-sheet/use-create-walkin-booking.test.tsx` (created, 295 lines)
  - `frontend/src/features/tee-sheet/components/WaitlistCard.tsx` (drag handlers + optimistic dim)
  - `frontend/src/features/tee-sheet/components/WaitlistCard.test.tsx` (+4 tests)
  - `frontend/src/features/tee-sheet/components/WaitlistRail.tsx` (forwarded drag props)
  - `frontend/src/features/tee-sheet/components/TeeRow.tsx` (drop-target wiring + optimistic row dim)
  - `frontend/src/features/tee-sheet/components/TeeRow.test.tsx` (+8 tests)
  - `frontend/src/pages/admin-tee-sheet-page.tsx` (dragController + mutation + aria-live region + error banner)
  - `frontend/src/pages/admin-tee-sheet-page.test.tsx` (QueryClientProvider wrap; existing 28 tests preserved)
  - `frontend/src/types/bookings.ts` (BookingCreateInput.source extended)
  - `docs/PHASE_LOG.md` (this entry), `docs/LIVE_STATE.md`
- **Outcome**: 449 frontend tests pass (was 405, +44 — 22 new for Slice 8a + Slice 7.5 backend test additions previously merged + already-existing tests now passing under the QueryClientProvider wrap). Lint: 0 errors (13 pre-existing warnings unrelated to Slice 8a). Typecheck clean. No new dependencies; no DnD library introduced (`grep -rE "react-dnd|dnd-kit|react-beautiful-dnd"` in `frontend/src/` returns 0 matches). FROZEN count in `frontend/src/features/tee-sheet/` unchanged at 13. No new hex colors introduced — all visuals use `--gl-*` tokens and `color-mix(in oklab, ...)`.
- **Decisions made**:
  - **Native HTML5 Drag-and-Drop API**, no library (no `react-dnd`, no `@dnd-kit/core`). The drop interaction is one shape (waitlist card → empty player cell); library overhead bought nothing.
  - **Party-of-N → ONE booking with N participants** (Deliverable 4a option i). All N `BookingCreateParticipantInput.guest_name` values share the single party name on the waitlist card; only the first carries `is_primary=true`. The waitlist card carries one name; inventing N-1 names (suffixes, placeholders, generated unique strings) is invention. Verified backend resolver accepts identical `guest_name` across participants.
  - **Optimistic UI via React Query** (ENGINEERING_STANDARDS.md §7): `onMutate` snapshots the day-query cache and patches in a transient booking with id prefix `optimistic-`, `onError` restores the snapshot, `onSettled` invalidates the query. Consumers detect the optimistic booking via `isOptimisticBookingId`; `TeeRow` dims the row to opacity 0.65 while the mutation is in flight. The waitlist card dims to opacity 0.45 during the same window so users see the optimistic placement of party-of-N participants.
  - **aria-live polite region** at the page level, absolutely-positioned offscreen via the standard sr-only pattern. Announces "Picking up {name} · {1 seat|N seats}" on drag start, empties on drag end. Screen-reader announcement is the v1 accessibility surface; keyboard-driven DnD is a separate scope (Slice 9+).
  - **`aria-modal` DOM signal pattern reused** for layer coordination (Slice 6 standing contract): no new conflicts surfaced; the drag interaction is below the modal/popover layer and bails when those layers own focus.
  - **No locks / no concurrency check**: accepted v1 concurrency gap. Two operators drag onto the same empty cell simultaneously → both fire; backend availability check rejects the second with a `BookingCreateError` and the optimistic patch rolls back. Surfaced as a dismissible inline banner via the existing `color-mix(--gl-caddie)` idiom. Hardening (slot soft-locks during in-flight drops) deferred to a later slice once availability semantics are clearer.
  - **No new chrome action** for "place from waitlist" — drop is the only entry. The waitlist card's `Place` button stays Phase 8 stub (`onPlace` undefined → disabled). Suggestion engine remains FROZEN (`frontend/src/features/tee-sheet/components/WaitlistCard.tsx:136-145`). Behaviour symmetry is intentional: Slice 7 shipped chrome without an engine; Slice 8a ships the drop pathway without a one-click placement shortcut.
- **Follow-ups created**:
  - The Slice 2 channel-dot FROZEN now has live `source="walk_in"` data flowing through bookings — the per-cell channel dot can render the walk-in channel against real data when Slice 8b lands. Direct + aggregator channels still require enum additions before the four-channel taxonomy is renderable.
  - Slot soft-lock during in-flight optimistic drops (v1 concurrency gap above). Deferred until availability semantics are scoped.
  - Slice 8b: player → row drag (moving an existing player between time slots). Drag payload discriminated union has room for a `{ kind: "player"; … }` variant; drop target the same.
  - Keyboard-driven DnD parity (pick up via Enter, navigate slots with arrow keys, place via Enter, cancel via Escape). Slice 9+ scope; not yet specced.
- **Notes**:
  - The original spec premise that the slice "creates one booking per party member" was caught at recon — the backend resolver supports one booking with N participants (`bookings.party_size = N`), which is the correct shape per the schema. The slice spec was corrected before any code landed (the "DO NOT INVENT N-1 names" rule preserved option i exclusively).
  - The page test harness now requires a `QueryClientProvider` wrapper because the page mounts a mutation hook. Three inline `render(<MemoryRouter>...</MemoryRouter>)` callsites were also wrapped; existing 28 page tests pass unchanged after the wrap.
  - The `WaitlistRail`'s `Send to POS` button + waitlist `Add` button remain stub Phase 8 chrome (Slice 7); Slice 8a deliberately does not extend them.

---
## Phase 10 — Slice 7.5: BookingSource.WALK_IN enum addition (2026-05-13)

Backend mini-slice. One new value on an existing native Postgres ENUM type. Prerequisite for Slice 8a's waitlist→row drop, which needs to emit walk-in bookings with a distinct source tag.

- **Scope**:
  - `BookingSource` enum (`backend/app/models/enums.py:149-153`) gains `WALK_IN = "walk_in"`.
  - New Alembic migration `202605130001_add_walk_in_booking_source.py` runs `ALTER TYPE bookingsource ADD VALUE IF NOT EXISTS 'walk_in'` against the existing native Postgres ENUM type `bookingsource` (created by `202603290005_booking_aggregate_foundation.py:32-41`).
  - No frontend changes.
  - No service-layer changes — `BookingSource` is referenced as a passthrough at 9 sites; the only branches (`schemas/bookings.py:72`, `routes/golf.py:109,119`) gate on `== MEMBER_PORTAL` only, treating all other sources (now including `WALK_IN`) identically. No exhaustive match/elif chain anywhere.
  - Two new tests in `backend/tests/test_booking_creation_foundation.py`: `test_booking_source_enum_includes_walk_in` (enum-level guard) + `test_booking_create_with_walk_in_source_persists_and_emits_audit` (API-level acceptance — 201 response, `source="walk_in"` persists, `booking.created` event emitted).
- **Files touched**:
  - `backend/app/models/enums.py` (1 line added)
  - `backend/alembic/versions/202605130001_add_walk_in_booking_source.py` (created, 50 lines)
  - `backend/tests/test_booking_creation_foundation.py` (+78 lines, 2 new tests)
  - `docs/LIVE_STATE.md` (Migration head + count + most-recent-migration bullet updated)
  - `docs/PHASE_LOG.md` (this entry)
- **Outcome**: 306 backend tests pass (was 304, +2). Ruff clean. `alembic upgrade head` + `alembic downgrade -1` + re-upgrade round-trip succeeds against a clean DB. `alembic heads` reports `202605130001 (head)`.
- **Decisions made**:
  - **Path A — native `ALTER TYPE ADD VALUE`** chosen over Path B (convert column to String + CHECK). Reasons:
    - The bookings.source column has been a native Postgres ENUM since `202603290005`; the Phase 9A String+CHECK convention applies only to new columns added under that phase, not to retroactive conversion of existing enums.
    - Schema-style consistency with the other native enums on bookings (`status`) and adjacent tables (`bookingparticipanttype`, `pricingdaytype`, `pricingtimeband`).
    - Migration risk is minimal (single ALTER TYPE statement; no column type rewrite, no orphan-type drop).
    - The slice's stated goal was "tiny pre-8a backend slice"; Path B would have been a column-type rewrite dressed up as an enum addition.
  - **Empty downgrade body with explanatory docstring** chosen over `NotImplementedError`. Postgres has no `ALTER TYPE ... DROP VALUE`. A no-op downgrade completes cleanly against a DB with no walk_in rows; operators downgrading after walk_in data has been written discover the implication via subsequent migration attempts.
  - **`IF NOT EXISTS` clause** on ADD VALUE — idempotent, retry-safe.
- **Follow-ups created**:
  - The Slice 2 channel-dot FROZEN (`frontend/src/features/tee-sheet/components/TeeRow.tsx:302-306`) gets a partial resolution path: when Slice 8a starts emitting walk-in bookings with `source="walk_in"`, the per-cell channel dot can render the walk-in channel against real backend data. Direct + aggregator channels remain unrepresented in the BookingSource enum and will need separate enum additions before the full four-channel taxonomy is renderable.
- **Notes**:
  - The original Slice 7.5 spec referenced a `ck_bookings_source` CHECK constraint that does not exist (the spec author assumed Phase 9A's String+CHECK pattern applied universally). The actual column was a native ENUM. Caught via reconnaissance and corrected by the user before any code landed — exactly the STOP AND ASK shape the slice template prescribes.
  - Service-layer scan (`grep "BookingSource\." backend/app/`): 9 reference sites, all passthroughs or `== MEMBER_PORTAL` gates. Confirms no exhaustive enumeration that would silently misroute WALK_IN.

---
## Phase 9A — Legal foundations: POPIA + VAT + HNA Player ID (2026-05-12)

Backend extension wave. Three legal/regulatory fields the v1 product needs in the data model before any surface can capture them, plus the §10.3 WI-11 closeout.

- **Scope**:
  - POPIA consent capture on `people` (`consent_captured_at`, `consent_version`, `consent_source` + `ConsentSource` enum).
  - POPIA Information Officer on `clubs` (`information_officer_person_id` FK, `information_officer_designated_at`); `designate_information_officer` / `clear_information_officer` on `GolfSettingsService` emitting `information_officer.designated` / `.cleared` DomainEventRecord events.
  - VAT category at line-item level per SA §10(1)(cO): `bookings.vat_category` (default `green_fee`), `order_items.vat_category` (default `other`), `pos_transaction_items.vat_category` (default `other`); CHECK constraint validates the six-value `VatCategory` enum on each table. FinanceTransaction unchanged — VAT lives on originating records per the Phase 9A user decision (see Decisions below).
  - HNA Player ID on `people.hna_player_id` (`String(32)`, nullable) with global partial unique index `ix_people_hna_player_id_unique`.
  - §10.3 work item 11 (list-endpoint tenant-scoping audit) re-verified: 127 endpoints walked, 2 unscoped (`/health`, `/auth/login`) — both intentionally public. Audit's claim holds.
- **Migration**: `backend/alembic/versions/202605120001_legal_foundations.py` (single revision, schema + backfill defaults).
- **Files touched**: `app/models/enums.py`, `app/models/__init__.py`, `app/models/person.py`, `app/models/club.py`, `app/models/booking.py`, `app/models/order_item.py`, `app/models/pos_transaction.py`, `app/schemas/people.py`, `app/schemas/operations.py`, `app/services/people_service.py`, `app/services/people_integrity_service.py`, `app/services/golf_settings_service.py`, `app/services/booking_service.py`, `app/services/booking_move_service.py`, `app/services/order_service.py`, `app/services/pos_service.py`, new `alembic/versions/202605120001_legal_foundations.py`, new `tests/test_legal_foundations.py`, `docs/PRODUCT.md` (§10.3 WI-11 re-verification annotation).
- **Decisions made**:
  - **VAT placement** — chose "originating records only" (OrderItem + PosTransactionItem + Booking carry `vat_category`; FinanceTransaction does not). The booking pipeline emits a single FinanceTransaction header without any line-item backing, so a finance-side VAT column would force bookings to either tag at the wrong granularity or invent a pseudo-line. Tagging at source (the originating record) keeps the line-item integrity intact and lets the daily journal aggregate by VAT category via JOIN. Defaults: bookings → `green_fee` (always, by domain); player-app halfway-house orders → `fnb` (the menu is fixed F&B); staff-source orders and POS items → `other` (real Product → VatCategory mapping deferred to Phase 9B/9D when close-day reconciles).
  - **HNA uniqueness** — chose global partial unique on `people.hna_player_id` over the phase prompt's "per-tenant" wording. PRODUCT.md §6 item 6 treats HNA Player ID as the canonical cross-club identifier; HNA assigns one ID per SA golfer globally. Per-tenant uniqueness would duplicate data and risk divergence when the same person plays multiple clubs.
  - **Information Officer attachment** — IO designation requires an active `ClubMembership` in the same club (a club can't designate an arbitrary external person). Service method raises `ConflictError("information_officer_membership_required")` otherwise.
- **Follow-ups created**:
  - Phase 9B/9D: replace `VatCategory.OTHER` defaults on POS lines and staff-source orders with a real `Product.category → VatCategory` mapping; close-day wizard surfaces `OTHER`-tagged lines as needing categorisation.
  - Phase 10 / 12: UI surfaces that capture these fields (onboarding consent moment per §10.3 frontend surface 10; member directory IO designation per surface 1; member profile HNA Player ID per surface 7/11).
- **Notes**: No new dependencies. Ruff clean. No mypy in this project. Migration is one revision; downgrade reverses every column, FK, index, and CHECK added. CHECK constraints rather than native Postgres ENUM types match the most recent precedent (`pricing_rules.player_type`, `pricing_rules.season`) — strings with table-level validation, no enum-ALTER pain on future value additions.
---
## Phase 7.1 — LIVE_STATE.md regenerated post Phase 7 (2026-05-12)

Docs-only commit. LIVE_STATE.md regenerated to capture Phase 7's frontend rebuild burst: new design tokens, component primitives at `frontend/src/components/ui/`, new admin shell at `frontend/src/components/admin-shell/`, the `frontend/src/components/onboarding/` helper, three new `/onboarding/*` routes wrapped in ProtectedRoute, replaced Login + Admin dashboard + Settings hub surfaces, deleted old shell components and the stale `src/design-system/greenlink-design-system.md`.

Top-of-file stamp updated to commit `a97e071`. Router line-number references shifted to reflect the new `/onboarding/*` group (RootRedirect 35-45 → 38-48; `/admin/select-club` redirect 51 → 54; superadmin catchall 100 → 113; admin catchall 85 → 98; player catchall 111 → 124; settings/club redirect 80 → 93; settings/profile redirect 81 → 94). New "Design system" section added between Stack and Routes (tokens, fonts, primitives, admin chrome, onboarding helper, token-discipline grep status). New "Parallel implementations" section before "Known follow-ups" documenting the three rebuild-burst carry-overs per the Phase 7 commit message — `AdminWorkspace.tsx` (15 consumers), `material-symbol.tsx` (28 consumers), `app.css` — slated for Phase 10/12 cleanup. Identity & session notable surfaces extended with the three onboarding pages. Reporting & targets `admin-dashboard-page.tsx` line count corrected (355 → 375) and Phase 7 rebuild noted. Known follow-ups gained an entry enumerating the `TODO(Phase 9X)` stubs planted by Phase 7.

C9 and FROZEN backend-gap entries reviewed and left intact — they live in `frontend/src/features/tee-sheet/sheet-shared.tsx`, which Phase 7 did not touch. "What is NOT here" reviewed; entries still accurate.

No code, no schema, no tests.

---
## Phase 7 — Design system + first six surfaces in the live frontend (2026-05-12)

First Claude Code frontend rebuild burst. Implements Claude Design's Phase 6 deliverable in `frontend/src/`. Design tokens, seven component primitives, six surfaces, all wrapped in the Phase 6 `.gl` scope and built against `--gl-*` tokens.

- **Scope**: Phase 7 rebuilds Login + Admin shell & dashboard + Settings hub + three new Onboarding surfaces (welcome, POPIA, completion). Old chrome (`AdminShell.tsx`, `AdminSidebar.tsx`, `AdminTopbar.tsx` and the `AdminSidebar.test.tsx`) deleted alongside the pre-rebuild design-system doc `src/design-system/greenlink-design-system.md` (which the Phase 6 system supersedes).
- **Files touched**:
  - Added: `frontend/src/styles/tokens.css` (380 lines, ported from `docs/phase6_prototype/tokens.css` with `--gl-font-serif`→Newsreader and `--gl-font-sans`→Manrope overrides per the locked production defaults). Imported in `frontend/src/main.tsx` ahead of `app.css`.
  - Added: `frontend/index.html` Google Fonts link extended with Newsreader + IBM Plex Mono families (Manrope + Inter + Material Symbols Outlined kept; Inter still consumed by un-rebuilt surfaces).
  - Added primitives at `frontend/src/components/ui/`: `Button`, `Input`, `Card`, `Badge`, `Table`, `Icon`, `Wordmark`, `Avatar`, `HeroPlaceholder` — each with a `Path:` header comment and a vitest render test covering primary states.
  - Added admin chrome at `frontend/src/components/admin-shell/`: `AdminShell`, `AdminSidebar`, `AdminTopBar`. Sidebar nav structure ported verbatim from the prototype (Operate / Finance / Club + Settings); items without backing routes (`Bookings`, `Member ledger`, `Audit log`, `Handicaps`, `Competitions`) render as aria-disabled placeholders carrying the Phase that ships them.
  - Added shared onboarding component at `frontend/src/components/onboarding/OnboardingProgress.tsx`.
  - Replaced (delete + new file in the same commit): `frontend/src/pages/login-page.tsx`, `frontend/src/pages/admin-dashboard-page.tsx`, `frontend/src/pages/admin-settings-hub-page.tsx`.
  - Added new pages: `frontend/src/pages/onboarding-welcome-page.tsx`, `frontend/src/pages/onboarding-popia-page.tsx`, `frontend/src/pages/onboarding-completion-page.tsx`.
  - Modified routing: `frontend/src/routes/admin-layout.tsx` (replaces the old `AdminShell` import with the new admin-shell path, updates route metadata strings); `frontend/src/routes/router.tsx` (new `/onboarding/*` group under `ProtectedRoute`).
  - Modified `frontend/src/routes/route-truth.test.tsx` and `frontend/src/test/persistent-shell-layout.test.tsx` (mock the new `admin-shell/AdminShell` named export; route-truth title assertions updated to the new label set).
  - Deleted (4 files + 1 doc): `frontend/src/components/shell/AdminShell.tsx`, `frontend/src/components/shell/AdminSidebar.tsx`, `frontend/src/components/shell/AdminTopbar.tsx`, `frontend/src/components/shell/AdminSidebar.test.tsx`, `frontend/src/pages/admin-dashboard-page.test.tsx`, `frontend/src/pages/admin-settings-hub-page.test.tsx`, `frontend/src/design-system/greenlink-design-system.md` (pre-rebuild design doc superseded by the Phase 6 prototype + tokens.css; directory removed when empty).
- **Approved defaults locked in production**: Newsreader (display serif), Manrope (workhorse sans), default density, light mode. The prototype's `TWEAK_DEFAULTS`, `app.jsx`, and `tweaks-panel.jsx` are reference-only — the live app does not ship the runtime tweaks panel.
- **Parallel implementations carried into Phase 10/12** (per ENGINEERING_STANDARDS.md §3 rebuild-burst exception):
  - `frontend/src/components/shell/AdminWorkspace.tsx` stays — 15 un-rebuilt admin pages still import it for their internal title/KPI scaffold (`admin-finance-page`, `admin-golf-tee-sheet-page`, `admin-communications-page`, etc.). Phase 10/12 deletes it as those surfaces rebuild.
  - `frontend/src/components/benchmark/material-symbol.tsx` stays — consumed by un-rebuilt pages alongside `MaterialSymbol`. The new `Icon` primitive supersedes it for Phase 7 surfaces.
  - `frontend/src/styles/app.css` stays — un-rebuilt pages use `.auth-card`, `.admin-shell`, `.admin-card`, etc. Phase 7 surfaces use only `--gl-*` tokens.
  - Tailwind config + Inter font also stay for un-rebuilt pages.
- **Phase 9 TODOs planted** (anchor refs):
  - Dashboard live gross takings / members-on-course / per-acquirer close-day rows → Phase 9D (`WI-6` KPI metrics, multi-tender reconciliation).
  - "Next on the tee" card backed by tee-sheet read-model → Phase 9C.
  - Onboarding POPIA persistence + Information Officer designation + "Download a copy" → Phase 9A.
  - Settings hub `Save changes` wiring to `PUT /api/clubs/config` → Phase 9A.
  - Audit log nav item shipped as disabled placeholder per the brief → backed by Phase 9B WI-14 (audit-log query surface).
- **Accessibility**: tokens-driven single `--gl-focus-ring` treatment via `.gl :focus-visible`; semantic landmarks (`<main>`, `<header>`, `<aside>`, `<nav aria-label>`) on every surface; Phase 7 Input wires `htmlFor`/`id`/`aria-describedby`/`aria-invalid` automatically; Button exposes `aria-busy` while loading; OnboardingProgress carries `role="progressbar"` with valuemin/valuemax/valuenow; mobile touch-target floor (`min-height: 44px` under 600px) on `.gl-btn` and `.gl-input`.
- **Token discipline verification**: grep of `#[0-9a-fA-F]{3,6}` across all Phase 7 new code (tokens.css excluded as canonical, tests excluded) finds matches only in `frontend/src/components/ui/HeroPlaceholder.tsx` — the SVG hero placeholder's three tone palettes (`dawn`/`course`/`mist`), ported byte-for-byte from `docs/phase6_prototype/system.jsx`. These are atmospheric SVG-only palette values, deliberately one-off, not derivable from `--gl-*` tokens.
- **Verification chain**: `npm run typecheck` clean. `npm test` 280/280 passing across 40 files (includes the 7 new primitive test files = 17 new tests). `npm run lint` 13 warnings — all `react-hooks/exhaustive-deps` in pre-existing un-rebuilt code, no warnings in Phase 7 new code. `npm run build` succeeds; the existing chunk-size warning is unchanged from baseline.
- **Conflicts surfaced**: the prototype's `app.jsx` TWEAK_DEFAULTS specifies Source Serif 4 + IBM Plex Sans (matches `tokens.css` and the design conversation transcript at `docs/phase6_prototype/chats/chat1.md:80`), but the user-approved production defaults are Newsreader + Manrope. Resolution: Phase 7 honours the user-approved production defaults; the prototype is reference-only for these two values. This was confirmed before any code was written.
- **Outcome**: live app now boots through the new design system. `/login`, `/admin/dashboard`, `/admin/settings`, and the three `/onboarding/*` routes render against the Phase 6 visual contract with real backend endpoints wired (`POST /api/auth/login`, `GET /api/session/bootstrap`, `GET /api/admin/dashboard/summary`, `GET /api/clubs/config`, `GET /api/finance/accounting-profiles`). Un-rebuilt admin routes (`/admin/golf/tee-sheet`, `/admin/finance`, etc.) now render inside the new shell — visually mixed for the rebuild window, deliberately so per the §11 plan.
- **Follow-ups**: none blocking. Phase 8 (USP surfaces design) and Phase 9 (backend extension wave) run in parallel; Phase 10 begins the second rebuild burst (USP surface code) consuming the new design system foundation that Phase 7 lays down.

---
## Phase 6.1 — Claude Design prototype archived

Docs-only commit. Claude Design's Phase 6 deliverable (design system tokens + 5 foundation boards + 6 surfaces + design conversation transcripts) archived at docs/phase6_prototype/ as read-only reference for Phase 7 implementation.

Approved defaults: Newsreader, Manrope, default density, light mode.

No code, no schema, no tests.

---
## Phase 5.6 — PRODUCT.md amendment (WI-5 decision + Phase 5.5 audit conflict resolutions)

Docs-only commit. Seven surgical edits to docs/PRODUCT.md:
- §7: paragraph added clarifying v1 ships Python metric registry; dbt named as v2/v3 standard with named migration triggers
- §10.3: work item 17 added (semantic layer foundation); work item 11 marked complete with calibration note (~91 → 127)
- §11: sub-phase 9F (semantic-layer architecture) added
- §11: sub-phase 9G (contract-quality bundle) added
- §11: "Runs in parallel" subsection updated to cover 9A–9G
- §11: Phase 9 item-count narrative updated from "Sixteen items" to "Seventeen items" to match §10.3 (direct downstream of the work-item-17 addition)

Unblocks Phase 9 kickoff — WI-5 decision is now canonical. Phase 9 shape is 9A through 9G inclusive.

No code, no schema, no tests.

---
### Phase 5.5 — Backend audit report (2026-05-12)

- **Scope**: read-only backend audit covering domain event emission consistency, tenant scoping completeness, read-model pattern coverage, service-layer architecture coherence, API contract quality, and test coverage relative to v1 USP surfaces. v1-USP-weighted severity grading. Output feeds Phase 9 backend extension wave with a concrete prioritised work list.
- **Files touched**:
  - `docs/PHASE_5_5_BACKEND_AUDIT.md` (created)
  - `docs/PHASE_LOG.md` (this entry)
- **Findings**: **14 HIGH, 8 MEDIUM, 5 LOW** across the six audit areas.
  - Area 1 (Domain events): 13 HIGH (booking lifecycle × 8, finance × 4, pricing publish × 1), 4 MEDIUM (comms × 2, operational support × 2), 1 LOW (auth).
  - Area 2 (Tenant scoping): 0 findings — 125/127 endpoints scoped, 2 correctly public. PRODUCT.md §10.3 work item 11 closeable.
  - Area 3 (Read-model coverage): 2 HIGH (semantic-layer commitment unfulfilled, daily KPI metrics absent), 2 MEDIUM (member-stats, blast-engagement read-models absent).
  - Area 4 (Service coherence): 1 service (`superadmin_onboarding_service.py`, 946 lines / 4 domains) graded structural-rework-needed but MEDIUM in v1-USP weighting; 2 MEDIUM has-issues (golf_settings, accounting_profile_mapping); 1 LOW (blast_service `.query()` style drift). 36/40 services clean.
  - Area 5 (API contracts): 6 HIGH (USP creates default to 200 instead of 201 in finance × 3, orders × 1, pos × 1, golf bookings × 1), 2 MEDIUM (platform.py untyped dict × 2), 1 MEDIUM (superadmin.py inappropriate 400), 1 LOW (no OpenAPI docstrings).
  - Area 6 (Test coverage): 2 HIGH (zero `DomainEventRecord` assertions across the 197-test suite; no optimistic-locking regression sentinel before Phase 9C), 2 MEDIUM (tee-sheet + admin-dashboard test thinness).
- **Outcome**: Phase 9 backend extension wave has a concrete prioritised work list. 14 Phase 9 work items derived (WI-1 through WI-14). v1 USP surfaces graded against the standards in PRODUCT.md §3 / §4 / §7.
- **Phase 9 work items derived**: **14**, grouped by §11 sub-phase:
  - 9A (legal & foundations): WI-10.
  - 9B (audit-log expansion): WI-1, WI-2, WI-3, WI-4, WI-14.
  - 9C (tee sheet correctness): WI-9, WI-11.
  - 9D (finance USP deepening): WI-6, WI-13.
  - 9E (comms foundation): WI-12.
  - New 9F (semantic-layer architecture, proposed): WI-5.
  - New 9G (contract-quality bundle, proposed): WI-7, WI-8.
- **Follow-ups**: ONE item requires user decision before Phase 9 starts — **WI-5 dbt vs Python metric registry vs SQL views**. PRODUCT.md §7 commits to "dbt or equivalent"; the equivalents range from a Python dataclass metric registry (small, ships fast) to a real dbt project layered on Postgres (large, true semantic layer). User picks before WI-5 begins.
- **Conflicts with PRODUCT.md §10**: 2 minor, 0 blocking.
  - §10.3 cites "~91 endpoints" but actual count is 127 (37 list endpoints). Not a meaningful conflict — flagged for accuracy.
  - **§11 Phase 9 sub-phases do not include the semantic-layer architecture explicitly, but §7 commits to it in v1.** Recommendation in the report: amend §11 to add sub-phase 9F + amend §10.3 to add work item 17. User decision pending alongside WI-5.
- **Notes**: Tenant scoping is the strongest area in this audit — 125/127 endpoints correctly scoped, two intentional public exceptions (`/health`, `/auth/login`). The largest gap (audit-log USP) cuts across Areas 1 and 6 simultaneously, and both branches converge on Phase 9 sub-phase 9B. Phase 6 (Claude Design burst 1) is the next concrete phase — it runs in parallel with Phase 9 once both are queued.
---
### Phase 5 — Schema integrity: pricing_rules drift + Pattern B/C/E remediation, autogenerate-clean (2026-05-12)

- **Original scope**: resolve `pricing_rules.player_type`/`pricing_rules.season` model/migration type drift (Phase 2 finding: model declared `Enum(...)` but migration `202604130003` shipped `sa.String(64)`/`sa.String(32)`), and switch `backend/tests/conftest.py` from `Base.metadata.create_all()` to real Alembic migrations so future drift fails CI rather than passing silently against a synthesised schema.
- **Surfaced and fixed in the same phase**:
  - **Pattern A** (1 case, the original): pricing_rules columns converted VARCHAR → enum via new migration `202605110002`.
  - **Pattern B** (8 columns across 3 model files): the conftest switch immediately failed pytest with `invalid input value for enum bookingruleappliesto: "MEMBER"` — diagnosis was that `booking_rule_set.py`, `communication_blast.py`, and `news_post.py` declared `Mapped[<EnumClass>]` without wrapping the column in `Enum(EnumClass, values_callable=enum_values)`, so SQLAlchemy bound enum values by `.name` (uppercase) while Postgres enums are lowercase. Fixed in-place; no new migration required.
  - **Pattern C** (3 missing enum values): `pricingdaytype`/`pricingtimeband` were missing `"any"`, `pricingruleappliesto` was missing `"staff"`. Migration `202605110002` extended via `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (downgrade documented as no-op — Postgres has no DROP VALUE).
  - **Pattern E structural** (1 case): `finance_transactions` model omitted the `amount <> 0` CHECK declared by migration `202603300001`. Declared as `CheckConstraint("amount <> 0", name="ck_finance_transactions_amount_non_zero")` on the model.
  - **Pattern E indexes** (6 declarations + 1 redeclaration): every migration-created non-unique index that wasn't on its model is now declared, byte-exact-name-match: `ix_news_posts_status`, `ix_finance_transactions_account_created_at` (composite, replaces model's single-column `account_id` index), `ix_accounting_export_profiles_club_id`, `ix_accounting_export_profiles_created_by_person_id`, `ix_orders_club_status_created_at`, `ix_club_configs_preferred_accounting_profile_id`.
  - **Pattern E redundant UQs** (3 cases): `uq_finance_tender_records_charge_transaction_id`, `uq_finance_tender_records_settlement_transaction_id`, `uq_pos_transactions_finance_transaction_id` — migrations created these alongside the column-level `unique=True` (which produces a separate UNIQUE INDEX). The redundant explicit UNIQUE constraints are now declared on models too, so alembic stops proposing to drop them.
  - **Pattern E column-type drift** (1 case): `news_posts.body` is `Text` in DB (from migration) but the model omitted the type, defaulting to `String`. Model now declares `Text`.
  - **Pattern E server_default mirrors** (46 columns across 14 models): every migration-set `server_default` on a column whose model didn't mirror it is now declared with `server_default=text("<literal-matching-migration>")`. Excludes `platform_state.id` (SERIAL `nextval(...)` handled by autoincrement). The 2 `accounting_export_profiles.created_at/updated_at` columns whose migration used `CURRENT_TIMESTAMP` (rather than the mixin's `now()`) are canonicalized by Alembic as equivalent — autogenerate is silent on them.
  - **Census-confirmed clean**: Pattern D (foreign key target/ON DELETE/nullability/Postgres-compiled type) — 67/67 FKs match. No findings.
- **Files touched**:
  - `backend/alembic/versions/202605110002_fix_pricing_rules_enum_drift.py` (new — VARCHAR→enum conversion + 3 Pattern C `ALTER TYPE ADD VALUE` statements + documented no-op downgrade)
  - `backend/tests/conftest.py` (Base.metadata.create_all() → `alembic.command.upgrade(cfg, "head")` per-test fixture, with public-schema drop/recreate isolation)
  - `backend/tests/test_schema_consistency.py` (extended: 11 → 26 tests; new coverage for Pattern C enum value completeness, finance_transactions CHECK declaration, 6 Phase 5 indexes, 5-entry server_default sentinel)
  - Model files (18 total): `app/models/account_customer.py`, `app/models/booking.py`, `app/models/booking_participant.py`, `app/models/booking_rule.py`, `app/models/booking_rule_set.py`, `app/models/club.py`, `app/models/club_config.py`, `app/models/club_membership.py`, `app/models/communication_blast.py`, `app/models/finance/account.py`, `app/models/finance/accounting_export_profile.py`, `app/models/finance/export_batch.py`, `app/models/finance/tender_record.py`, `app/models/finance/transaction.py`, `app/models/news_post.py`, `app/models/order.py`, `app/models/person.py`, `app/models/pos_transaction.py`, `app/models/pricing_rule.py`, `app/models/product.py`, `app/models/tee_sheet_slot_state.py`
  - `docs/LIVE_STATE.md` (head/count updated)
  - `docs/PHASE_LOG.md` (this entry)
- **Outcome**:
  - `pricing_rules` and 35 enum-typed columns total now match between Python StrEnum, model `Enum(...)` declaration, and Postgres `USER-DEFINED` types byte-for-byte.
  - Conftest uses real migrations; future model/migration divergence fails the suite instead of silently passing against a synthesised schema.
  - `alembic --autogenerate` against a fresh-migrated DB proposes **zero ops**: the model files are now canonical schema documentation for the v3 GreenLink semantic layer (PRODUCT.md §7).
  - Schema-consistency sentinel grew from 11 to 26 parametrised tests covering enums, enum values, CHECK, indexes, and a server_default subset.
- **Decisions made**:
  - **Path B (full Pattern E remediation) chosen over Path A (defer informational items to Phase 5.5)**. Reasoning: PRODUCT.md §7 commits the v1 schema to be the truthful source for the v2 semantic layer; PRODUCT.md §11 (v3 GreenLink endpoint) requires autogenerate cleanliness so Phase 9 schema work isn't fighting historical declaration noise. Foundation work is cheapest while we're already in the schema layer. Deferring would create persistent autogenerate friction across every future backend phase.
  - **Cosmetic CHECK rendering noise explicitly documented as non-drift**: 5 CHECK constraints where the model declares `quantity > 0` and Postgres normalizes to `quantity > 0::numeric` (or `>= 0::numeric`) are functionally identical. Listed here so a future autogenerate run surfacing them is not treated as new drift: `ck_order_items_quantity_positive`, `ck_order_items_unit_price_snapshot_non_negative`, `ck_finance_tender_records_amount_positive`, `ck_pos_transactions_total_non_negative`, `ck_pos_transaction_items_quantity_positive`, `ck_pos_transaction_items_unit_price_non_negative`, `ck_products_price_non_negative`, plus the newly declared `ck_finance_transactions_amount_non_zero`. (Alembic's `compare_type=True, compare_server_default=True` mode correctly treats these as equal — the noise appears only if a future contributor introspects with a stricter comparator.)
  - **Pattern C `ALTER TYPE ADD VALUE` downgrade is intentionally a no-op**: Postgres provides no `DROP VALUE`; leaving the extra enum values present in the older schema is benign since nothing in the older schema reads them. The downgrade comment documents this so a future contributor doesn't try to "fix" it.
- **Verification chain (Hard Rule 7)**:
  - `uv run ruff check .` → All checks passed.
  - `uv run ruff format --check .` → 229 files clean (1 reformatted in-flight).
  - `uv run pytest -q` → 217 passed, 0 failed (baseline was 191; Phase 5 adds 11+15 schema-consistency parametrised cases).
  - Downgrade test: `alembic upgrade head` → `downgrade -1` (lands at `202605110001`) → `upgrade head` (lands at `202605110002`). Round-trip clean.
  - From-scratch test: `DROP SCHEMA public CASCADE` + `CREATE SCHEMA public` + full pytest → 217 passed.
  - Autogenerate-clean confirmed: `produce_migrations(MigrationContext, Base.metadata)` against fresh-migrated DB returns `upgrade_ops.ops == []`.
  - App boot smoke: `from app.main import app` imports cleanly; 131 routes registered.
- **Follow-ups created**: none. The 5 cosmetic `::numeric` CHECK renderings are explicitly documented above as non-drift, not as a follow-up.
- **Notes**:
  - The Phase 5 census deliberately escalated to the user after Pattern E was found, because the original scope was "type/value integrity." User chose Path B (full remediation) against PRODUCT.md §7 / §11. The expanded scope was bounded by the census: every Pattern A/B/C/D/E finding is enumerated above and closed.
  - The conftest switch is now a hard guard: a future model edit that diverges from migrations will fail pytest at suite startup, not at a per-test query. Any future PR that adds a new model column should also add the matching migration before pushing.
  - For Phase 9 (semantic layer / autogenerate-driven schema evolution), the baseline is genuinely zero. New migrations should be born from autogenerate runs that propose exactly the intended change.
---
### Phase 4.8 — Engineering docs aligned with PRODUCT.md (2026-05-11)

- **Scope**: address drift findings from Phase 4.7's read-only check. HIGH drift in `docs/ARCHITECTURE_REVIEW_CHECKLIST.md` (rebuild discipline), LOW drift in `docs/ENGINEERING_STANDARDS.md` (rebuild-aware clarifications + truncation fix). Stage `.gitignore` rule for Windows Zone.Identifier sidecar files added by user.
- **Files touched**:
  - `docs/ARCHITECTURE_REVIEW_CHECKLIST.md`
  - `docs/ENGINEERING_STANDARDS.md`
  - `.gitignore`
  - `docs/PHASE_LOG.md` (this entry)
- **Changes**:
  - `ARCHITECTURE_REVIEW_CHECKLIST.md`: split "preserve existing flows" question into backend-extension version and frontend-rebuild version. Backend extension preserves; frontend rebuild explicitly does not. Two new questions for frontend rebuild work (ground-up vs incremental patch; old code deletes as new lands).
  - `ENGINEERING_STANDARDS.md` rules 3 and 11: added rebuild-aware clarification (italicised note) that the rules apply at phase boundaries during a rebuild burst, not per commit.
  - `ENGINEERING_STANDARDS.md` line 99: fixed pre-existing truncation (`clarifies ownershi` → `clarifies ownership`).
  - `.gitignore`: added `*:Zone.Identifier` to ignore Windows Mark-of-the-Web sidecar files created when copying through the `\\wsl.localhost\` path.
- **Outcome**: engineering docs now align with PRODUCT.md §11 rebuild discipline. No silent contradictions between canonical product direction and review/standards docs.
- **Follow-ups**: Phase 5 (schema integrity) is the next concrete phase.
- **Notes**: If during Phase 7/10/12 the rebuild discipline reveals further drift in either document, address in a follow-up phase rather than silently. PRODUCT.md is the source of truth; review docs follow.
---
### Phase 4.7 — PRODUCT.md canonical commit (2026-05-11)

- **Scope**: commit `docs/PRODUCT.md` (499-line canonical product document) and link from `README.md`. Drift-check against `docs/ENGINEERING_STANDARDS.md` and `docs/ARCHITECTURE_REVIEW_CHECKLIST.md` performed (read-only).
- **Files touched**:
  - `docs/PRODUCT.md` (created)
  - `docs/PHASE_LOG.md` (appended)
  - `README.md` (Documentation section)
- **Outcome**: canonical product document is in the repo. v1 scope, rebuild plan, and v1/v2/v3 maturity tiers are now code-grounded reference. Drift report against existing engineering docs filed for user review.
- **Decisions made**:
  - v1 = "the basic done pristinely plus the USPs visibly deepened." Bridge logic applies where the standard isn't built (export instead of API, link-out instead of push).
  - Every customer-facing surface is rebuilt ground-up by Claude Design. Backend extends; frontend rebuilds.
  - Masters of golf is the visual north star for the rebuild.
  - Milestones drive timeline, not calendar dates.
- **Follow-ups created**:
  - **HIGH-severity drift**: `docs/ARCHITECTURE_REVIEW_CHECKLIST.md:7` ("Did this preserve existing working flows?") directly contradicts `docs/PRODUCT.md` §11's commitment to rebuild every customer-facing surface ground-up. The checklist's "preserve" framing was written when the repo was in correction-pass mode (Phase 1 era), not rebuild mode. User decides whether/when to revise.
  - **LOW-severity drift**: `docs/ENGINEERING_STANDARDS.md` rule 11 (file creation: "Do NOT create new files unless it reduces complexity, removes duplication, or clarifies ownership") and rule 3 (subtraction: "If nothing was removed, the change is wrong") are phrased for incremental work and don't anticipate wholesale-rebuild bursts. Reasonable reading is compatible with PRODUCT.md §11 (a rebuild reduces complexity, and old surfaces delete as new ones land), but the literal wording could prompt unnecessary review friction during Phases 7, 10, 12.
  - Phase 5 (schema integrity) is the next concrete phase — fix `pricing_rules` enum-vs-VARCHAR drift, switch conftest from `Base.metadata.create_all()` to actual Alembic migrations.
  - Phase 6 (Claude Design burst 1: design system + foundation surfaces) follows Phase 5.
- **Notes**: PRODUCT.md is canonical. Future product reasoning refers back to it. If PRODUCT.md disagrees with code, code wins (drift goes to `docs/DRIFT_LOG.md`); if PRODUCT.md disagrees with future product reasoning, PRODUCT.md wins unless explicitly revised here.
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
