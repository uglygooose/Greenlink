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
### 2026-05-14 — BookingMoveService splits multi-participant bookings on participant moves; consumers must use the response booking_id

- **Surfaced by**: Phase 10 Slice 8b orchestrator implementation review (Restore handler).
- **Claim**: A participant move via `POST /api/golf/bookings/{booking_id}/move` with a `participant_id` body keeps the participant on the same booking, just at a new slot.
- **Reality**: When the source booking has more than one participant, `BookingMoveService._split_booking_for_participant` creates a NEW booking carrying only the moved participant; the original booking shrinks. The response's `booking.id` is the NEW booking's id — NOT the booking_id the caller sent in the URL. When the source booking has exactly one participant, no split occurs and the response carries the same id back. Either way, the response is authoritative for any follow-up mutation on the moved participant.
- **Evidence**: `backend/app/services/booking_move_service.py:302-306` (`if participant is not None and len(booking.participants) > 1: moved_booking = self._split_booking_for_participant(booking=booking, participant=participant)`); the function constructs a new `Booking` record and returns it via `BookingSummary.model_validate(moved_booking)` in the ALLOWED response. `BookingMoveResult.booking` (`backend/app/schemas/bookings.py:392-397`) carries this BookingSummary.
- **Resolution**: This is the standing contract for move-adjacent frontend code. Any follow-up mutation on a moved participant — Restore, second-step move, cancellation, check-in, finance posting — MUST use the booking_id from `BookingMoveResult.booking.id`, not the original. Slice 8b's `useParticipantSwap` orchestrator (`frontend/src/features/tee-sheet/use-participant-swap.ts`) captures `firstResult` on the state machine for exactly this reason; the Restore handler reads `firstResult.booking?.id` (with a defensive fallback to the original bookingId for the no-split case). Future move-adjacent slices (Slice 9 locks, Slice 11+ booking lifecycle, any participant-level workflow that chains operations) must apply the same pattern: capture the response, thread the new booking_id forward.
- **Status**: Standing architectural contract. Not a drift — the backend behavior is correct; this entry preserves the fact so future code doesn't reinvent the bug.
---
### 2026-05-14 — Slice 8b accepts v1 partial-state in two-call swap (no atomic-swap backend endpoint)

- **Surfaced by**: Phase 10 Slice 8b Deliverable 6 (swap orchestrator) design.
- **Claim**: A swap of two players between rows should be atomic — either both end at their new positions, or neither moves.
- **Reality**: There is no atomic-swap endpoint. `POST /api/golf/bookings/{booking_id}/move` is the only relevant endpoint; it moves one booking (or one participant of a multi-participant booking via the participant_id field) at a time. Two operators' worth of state needs two calls.
- **Evidence**: `backend/app/api/routes/golf.py:476` (`@router.post("/bookings/{booking_id}/move", ...)`) is the sole move route. `backend/app/services/booking_move_service.py:50` (`MOVEABLE_STATUSES = {RESERVED, CHECKED_IN}`) and the same file's validation chain (lines 130–306) are per-booking, not per-pair. No "/bookings/swap" or "/bookings/atomic-swap" route exists. `grep -rn "swap\b" backend/app/api/routes/` returns 0 matches.
- **Resolution**: Slice 8b ships a sequential orchestrator (`frontend/src/features/tee-sheet/use-participant-swap.ts`) that fires move A → move B. When move B fails after move A commits, the orchestrator enters `partial-failure-second`. The page renders a `PartialSwapPill` action banner with two operator-driven actions: Retry (re-fire move B) or Restore (reverse move A using its NEW booking_id from the split response). Restore failure surfaces a separate inline error banner; no further recovery is automated.
- **Status**: Open — Slice 9b candidate. Building an atomic-swap endpoint is a single backend slice; would eliminate the Pill state entirely.
---
### 2026-05-14 — Slice 8b same-row reorder rejected client-side (deferral, not a contract violation)

- **Surfaced by**: Phase 10 Slice 8b Q2 deferral.
- **Claim**: Drag-and-drop in a tee sheet should let operators reorder players within a single row.
- **Reality**: The backend rejects same-row, same-lane, same-tee moves as `move_is_no_op` (`backend/app/services/booking_move_service.py:138-157`) because nothing about the booking actually changes — the per-row participant order is derived at read time, not stored. The frontend currently has no way to express "reorder within a slot" because the move endpoint operates on (slot_datetime + start_lane + tee_id), not on a position index.
- **Evidence**: `BookingMoveInput` (`backend/app/schemas/bookings.py:347-360`) has no `target_position` or `target_cell_index` field. Read-side participant ordering is whatever the SQL query yields — no `cell_index` column exists on `booking_participants`. Adding intra-row reordering requires a new backend concept (`participants.sort_order` or `participants.cell_index`) and a new mutation endpoint.
- **Resolution**: Slice 8b rejects same-row drags client-side BEFORE any /move call. The cell renders a `--gl-state-atrisk`-toned banner ("Same-row reorder not yet supported"); the drop is a no-op. Both the row-level and cell-level drop handlers short-circuit for defence in depth. The reject visual is intentionally honest — it tells the operator the feature isn't supported rather than silently dropping the interaction.
- **Status**: Open — Slice 12+ candidate (depends on the read model gaining a participant ordering signal).
---
### 2026-05-14 — Slice 8a accepts v1 concurrency gap: no soft-lock during in-flight optimistic walk-in drop

- **Surfaced by**: Phase 10 Slice 8a Deliverable 5 (page integration) review.
- **Claim**: A waitlist→tee-row drop should be atomic against concurrent placements — two operators dragging onto the same empty cell must not both succeed against backend availability.
- **Reality**: Slice 8a ships without slot soft-locks. The mutation hook patches the tee-sheet day cache optimistically, fires `POST /api/golf/bookings`, and rolls back on backend rejection. Two operators dragging onto the same empty cell will both see an optimistic transient; the second `POST` is rejected by `BookingCreateError` (decision !== "allowed") and rolls back. Surfaced via an inline dismissible banner (`WalkinBookingErrorBanner`).
- **Evidence**: `frontend/src/features/tee-sheet/use-create-walkin-booking.ts:96-130` (no `cancelMutations` queue, no per-slot soft-lock map, no preflight availability poll). The optimistic patch unconditionally adds the transient booking to the slot regardless of whether another mutation is in flight against the same `slot_datetime`. The backend has no `/availability/reserve` or "slot soft-lock" endpoint.
- **Resolution**: Accepted as a v1 trade-off. The backend availability service is the source of truth and the optimistic UI rollback is correct on rejection — the cost is that the second operator's UI flickers a transient booking before the banner appears. Slot soft-locking deferred until availability-reservation semantics are scoped (likely Slice 9). Documented as a follow-up in PHASE_LOG Slice 8a notes.
- **Status**: Open — Slice 9 candidate.
---
### 2026-05-14 — Slice 8a party-of-N booking shares one guest_name across N participants (option i)

- **Surfaced by**: Phase 10 Slice 8a Deliverable 4 reconnaissance — payload shape for `BookingCreateInput.participants` when the waitlist card carries one party name but the party size is >1.
- **Claim**: A party-of-4 walk-in must show four named participants in the tee row.
- **Reality**: The waitlist card surface (Phase 8 + Slice 7) carries exactly one party name (the lead booker's name) and a party-size integer. Inventing N-1 additional names (numeric suffixes "Mokoena 2/3/4", placeholders "Guest 2/3/4", or any generative form) is invention — it fabricates data the operator did not provide.
- **Evidence**: `frontend/src/features/tee-sheet/use-waitlist.ts:15-25` (`WaitlistEntry` shape: one `name` string + one `party` integer); `frontend/src/features/tee-sheet/components/WaitlistCard.tsx` (renders one name + party number, no per-member name capture). Backend `BookingCreateParticipantInput.guest_name` accepts identical values across participants (no uniqueness constraint at the resolver level — verified via `backend/app/services/booking_service.py` resolver source).
- **Resolution**: Slice 8a payload builder (option i) emits ONE booking with N participants, all sharing the single party name, first marked `is_primary=true`. Verified by `use-create-walkin-booking.test.tsx` tests (`party-of-4 produces 4 participants — all share guest_name, only first is_primary`). When the waitlist add-flow ships (still Phase 8 stub today) and starts capturing per-member names, the payload builder picks up the new field with zero structural changes.
- **Status**: Resolved (current payload shape is correct for v1; reopen if backend gains a uniqueness constraint on `guest_name`).
---
### 2026-05-13 — Slice 7 waitlist rail ships against a Path-1 empty stub (no Waitlist model, no /api/golf/waitlist endpoint, no BookingSource.WALK_IN enum value)

- **Surfaced by**: Phase 10 Slice 7 Deliverable 1 reconnaissance across all four backend directories (`backend/app/api/routes/`, `backend/app/schemas/`, `backend/app/models/`, `backend/app/services/`).
- **Claim**: Phase 8's WaitlistRail mounts on the tee-sheet surface, fed by a backend list of walk-in parties — each with party name, party size, source (Walk-in / Member app), since-time, note, and an auto-fit suggestion ("Fits 06:46 · 2 slots").
- **Reality**: Three specific backend entities are missing:
  1. **No `Waitlist` model.** `grep -irln "waitlist\|walk_in\|walkin\|walk-in\|walkup" backend/app/models/` returns empty. No persisted entity for walk-in parties holding for placement.
  2. **No `/api/golf/waitlist` endpoint.** Same grep against `backend/app/api/routes/` returns empty. No read, no create, no delete.
  3. **No `BookingSource.WALK_IN` enum value.** `backend/app/models/enums.py:149` shows `class BookingSource(StrEnum)` with members `ADMIN | MEMBER_PORTAL | STAFF` only. Walk-in bookings cannot be tagged distinctly today — there is no path to "filter bookings by source = walk_in" as a fallback because the source value doesn't exist.
  Additionally, `BookingStatus` at `backend/app/models/enums.py:~135` has no `WAITLIST` / `HOLDING` / `PENDING` value — the booking lifecycle is `RESERVED → CHECKED_IN → COMPLETED` plus `CANCELLED`/`NO_SHOW`. Nothing models "waiting to be placed in a slot".
- **Evidence**: `backend/app/models/enums.py` lines 135 + 149 (BookingStatus, BookingSource enum members). Four grep commands across `backend/app/{api/routes,schemas,models,services}/` for `waitlist|walk_in|walkin|walk-in|walkup` returned empty. Slice 7 implementation report carries the full grep output.
- **Resolution**: Path 1 — ship the rail chrome against an empty stub. `frontend/src/features/tee-sheet/use-waitlist.ts` exports a typed hook (`useWaitlist(params): { waitlist, loading, error }`) that returns empty data unconditionally. Two new FROZEN annotations name the missing entities explicitly so the future backend slice has a starting point:
  - `use-waitlist.ts:6` — header FROZEN block listing missing model, endpoint, and enum value. Marks `synthesizeStubWaitlist()` as the swap-point.
  - `WaitlistCard.tsx:99` — JSX FROZEN inside the conditional suggestion strip. The strip auto-renders when `entry.suggestion` becomes truthy in the response; the engine that produces "best gap" semantics is itself a product decision (see Path 3 rejection below).
  - `WaitlistRail.tsx:43` — FROZEN at the footer running-total site. Sum of backend-provided `fee_amount` values, same idiom as Slices 2/3.

  **Path 3 (backend extension first) was rejected** not because the rail entity is hard to model — a `Waitlist` model + `/api/golf/waitlist` CRUD endpoints + adding `WALK_IN` to `BookingSource` is a straightforward backend slice. It was rejected because the suggestion engine (Phase 8's "Fits 06:46 · 2 slots" pill) is a real product decision: what counts as "fits" depends on capacity policy, party-mix rules, time-of-day preferences, and holdover rules — none of which have been scoped or product-decided for Umhlali's actual walk-in flow. Building the suggestion engine pre-emptively is speculative scope against an unknown. The rail chrome and the empty-state drop hint deliver value today (Slice 8a needs the drop target in the DOM), and the moment the backend lands the waitlist entity, the chrome lights up with zero frontend changes downstream of the hook. The suggestion engine ships when product decides "best gap" semantics.

  FROZEN count in `frontend/src/features/tee-sheet/` + `frontend/src/components/ui/` goes from 6 → 11 (5 new line matches across 4 logical gap-annotations; the 5th match is a meta-reference in `WaitlistRail.tsx` header that points readers to the gap-source in `use-waitlist.ts`).

---
### 2026-05-13 — Slice 6 shell→page bridge: AdminTopBar prop extension + ShortcutsProvider context

- **Surfaced by**: Phase 10 Slice 6 (shortcut help modal) when planning the path from page-owned modal state to the topbar's ? affordance.
- **Claim**: Slice 6 spec asked the page to "pass the handler down to AdminTopBar via whatever prop-passing convention AdminShell already uses (check the existing topbar prop interface; if it doesn't carry per-page callbacks, extend it conservatively)."
- **Reality**: The path page → AdminLayout → AdminShell → AdminTopBar carries no per-page callback channel today. Pages render as `<Outlet/>` children of `<AdminLayout/>` and `AdminLayout` derives chrome props from STATIC route meta (`ADMIN_ROUTE_META`). There is no prop-passing convention for runtime-derived callbacks because that convention doesn't exist yet on this surface. Extending route meta would couple compile-time config to runtime page state — wrong fit.
- **Evidence**: `frontend/src/routes/admin-layout.tsx:14-33` (route meta is static `{ title, breadcrumbs?, searchPlaceholder? }`); `frontend/src/components/admin-shell/AdminTopBar.tsx` pre-Slice-6 had no callback props.
- **Resolution**: Two-part extension. (1) `AdminTopBarProps` gains an optional `onOpenShortcuts?: () => void` — when supplied, the ? chip is interactive; when undefined, it stays disabled. (2) New shell context at `frontend/src/components/admin-shell/shortcuts-context.tsx` exposes `setOpenHandler(handler)` for pages to register their open-action and `openShortcuts()` / `hasOpenHandler` for chrome to consume. AdminLayout wraps with `<ShortcutsProvider>` and passes `hasOpenHandler ? openShortcuts : undefined` to AdminShell. Page registers its handler in a `useEffect` on mount; chrome's ? chip enables automatically. The context handles other surfaces too — future pages that ship shortcut maps just call `setOpenHandler` and get the topbar affordance for free. Documented because the architecture is now load-bearing for any future cross-cutting chrome-action that needs page-derived state (e.g. a "?" -style notifications surface).

---
### 2026-05-13 — Slice 6 esc priority enforced via aria-modal DOM signal in PricePopover

- **Surfaced by**: Phase 10 Slice 6 test "esc with modal open dismisses modal; popover survives" failing initially because the popover and modal both registered `document.addEventListener("keydown", ...)` and both fired their `onDismiss` on the same Escape event.
- **Claim**: Slice 6 spec specified esc priority order "modal > popover > selection" with "stop" semantics: "If modal is open → dismiss modal, stop. Else if popover is open → dismiss popover, stop. Else if selection is set → clear selection."
- **Reality**: `document.addEventListener` listeners on the same target fire in registration order; `event.preventDefault()` does not stop sibling listeners, and `stopImmediatePropagation()` only halts listeners registered AFTER the calling one. Because the popover mounts before the modal, its esc listener registers earlier — so even if the modal called `stopImmediatePropagation`, the popover would have already fired its `onDismiss`. The spec's "stop" wording assumes a coordination primitive that wasn't yet in the codebase.
- **Evidence**: Two `useEffect(() => { document.addEventListener("keydown", ...); }, [...])` blocks: `frontend/src/components/ui/PricePopover.tsx` (popover) and `frontend/src/components/ui/ShortcutHelpModal.tsx` (modal). Page-level esc listener in `admin-tee-sheet-page.tsx` already used a ref-based check to bail when popover open; the popover lacked an equivalent guard for the modal tier.
- **Resolution**: Added an aria-modal deferral to the popover's esc listener. The popover checks `document.querySelector('[role="dialog"][aria-modal="true"]')` before dismissing — when an aria-modal dialog is mounted, the popover bails. The modal dialog sets `aria-modal="true"`; the popover does not. This achieves the spec's priority order via a DOM signal that any future higher-tier overlay can opt into by setting `aria-modal="true"`. No shared dismiss-stack registry needed.

  **Contract for future overlays (Slice 7+ honour this without rediscovery):**
  1. **Modal-tier overlays** (full-screen dialogs, blocking flows, anything that captures the operator's attention until dismissed) set `role="dialog"` + `aria-modal="true"` on their root element. Their esc handler runs unconditionally — they're the top of the stack.
  2. **Non-modal overlays** (popovers, tooltips, inline menus, slide-overs that don't block the surface) set `role="dialog"` or `role="menu"` etc. but **must not** set `aria-modal="true"`. Their esc handler defers when an aria-modal dialog is mounted: `if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;`
  3. **Page-level handlers** (selection clear, etc.) read a ref-tracked flag for each lower-tier overlay they yield to (e.g. `pricePopoverOpenRef`, `shortcutsOpenRef`) and bail when any of them is set.

  Effect: esc priority composes naturally — modals fire and dismiss; popovers see the modal still mounted on the same tick and bail; page handlers see the popover (or modal) ref still true and bail. Adding a new modal tier requires no changes to existing overlays. Adding a new popover tier requires only the deferral check (one line). The aria-modal DOM query at esc-time is the load-bearing primitive.

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
