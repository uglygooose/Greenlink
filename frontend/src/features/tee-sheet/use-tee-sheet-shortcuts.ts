// Path: frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.ts — Phase 10 Slice 10.
// Centralised keyboard handler for the tee-sheet page. Mounts ONE
// document-level keydown listener that dispatches the 22 shortcuts
// Slice 10 wires (Buckets A + B + C). The existing esc and ? handlers
// live separately on the page — they predate this slice and stay where
// they were registered (Slices 4–6).
//
// Skip-gate: when an input, textarea, or contenteditable element owns
// focus, every shortcut is suppressed. Phase 8 explicitly requires this
// ("no shortcut steals focus from a search input").
//
// Multi-key sequence: `gg` is two `g` keypresses within 1 second.
// `multiKeyStateRef` tracks the last `g` press so the second one fires
// handleGoTop; older state decays naturally on the next non-`g` press.
import { useCallback, useEffect, useRef } from "react";

import type { TeeSheetSlotView } from "../../types/tee-sheet";

const G_SEQUENCE_TIMEOUT_MS = 1000;

// Each row in the slotRows[] array the page renders.
export interface ShortcutRow {
  slot: TeeSheetSlotView;
}

export interface UseTeeSheetShortcutsParams {
  // Rendered rows in display order. j/k navigate this array;
  // gg/G scroll the row list container to its top/bottom.
  slotRows: ShortcutRow[];
  // Current selection (slot_datetime, mirrored from the page state).
  selectedSlotKey: string | null;
  // Page state setters.
  setSelectedSlotKey: (key: string | null) => void;
  // Date shift (t, ←, →). YYYY-MM-DD; the page derives the resulting
  // date from `clubTimezone` for `t`.
  selectedDate: string;
  setDate: (date: string) => void;
  todayInClubTimezone: () => string;
  // Mutation triggers (c, x). The hook constructs the booking_id from
  // the selected row's first booking; the page-supplied callbacks
  // invoke React Query mutations and handle their own error path.
  onCheckInBooking: (bookingId: string) => void;
  onMarkNoShow: (bookingId: string) => void;
  // ⌥P — opens the price popover for the selected row. The page wires
  // this to a click on the row's price button (which already fires the
  // shared popover handler).
  onOpenPricePopoverForSelected: () => void;
  // v — Slice 11 density cycle. Returns the new density string so the
  // hook can announce it on aria-live. Slice 10 shipped a stub
  // ("Density toggle arrives in Slice 11."); Slice 11 replaces that.
  onCycleDensity: () => string;
  // Announce setter (shared aria-live region). The hook pushes shortcut
  // results + stub messages through this. The page is responsible for
  // composing this with the drag controller's announcement (priority is
  // a page concern, not a hook concern).
  setShortcutAnnouncement: (message: string) => void;
}

export function useTeeSheetShortcuts(params: UseTeeSheetShortcutsParams): void {
  // Refs so the keydown listener (registered once at mount) reads live
  // values without re-installing on every render.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const multiKeyStateRef = useRef<{ lastKey: string | null; lastKeyAt: number }>({
    lastKey: null,
    lastKeyAt: 0,
  });

  const announce = useCallback((message: string) => {
    // Clear-then-set so screen readers re-announce on repeats.
    // Using setTimeout(0) breaks the React update batch — the first
    // setState ("") commits before the second setState (message),
    // forcing the live region to observe the transition.
    paramsRef.current.setShortcutAnnouncement("");
    window.setTimeout(() => {
      paramsRef.current.setShortcutAnnouncement(message);
    }, 0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Skip-gate: respect focused inputs / textareas / contenteditables.
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (active.isContentEditable) return;
      }

      const p = paramsRef.current;

      // Two-keystroke sequence: gg → go to top.
      if (event.key === "g" && !event.shiftKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        const last = multiKeyStateRef.current;
        if (last.lastKey === "g" && now - last.lastKeyAt < G_SEQUENCE_TIMEOUT_MS) {
          multiKeyStateRef.current = { lastKey: null, lastKeyAt: 0 };
          event.preventDefault();
          handleGoTop();
          return;
        }
        multiKeyStateRef.current = { lastKey: "g", lastKeyAt: now };
        return; // wait for the second g
      }

      // Any non-`g` key (or modifier-laden g) breaks the sequence state.
      multiKeyStateRef.current = { lastKey: null, lastKeyAt: 0 };

      // -------- Modifier-bearing shortcuts (checked before the bare key) --------
      // ⌘Z (Bucket B stub).
      if (event.metaKey && (event.key === "z" || event.key === "Z")) {
        event.preventDefault();
        announce("Undo not yet available.");
        return;
      }
      // ⌥P — show price breakdown on the selected row.
      if (event.altKey && (event.key === "p" || event.key === "P")) {
        event.preventDefault();
        if (p.selectedSlotKey === null) {
          announce("Select a slot first to view its price breakdown.");
          return;
        }
        p.onOpenPricePopoverForSelected();
        return;
      }
      // ⌥A — show audit history (Bucket B stub).
      if (event.altKey && (event.key === "a" || event.key === "A")) {
        event.preventDefault();
        announce("Audit history not yet available.");
        return;
      }
      // ⇧T — tournament mode (Bucket C forward ref).
      if (event.shiftKey && event.key === "T") {
        event.preventDefault();
        announce("Tournament mode arrives in Slice 12.");
        return;
      }
      // ⇧M — marshal view (Bucket C forward ref).
      if (event.shiftKey && event.key === "M") {
        event.preventDefault();
        announce("Marshal view arrives in Slice 13.");
        return;
      }
      // ⇧G — go to bottom (Bucket A).
      if (event.shiftKey && event.key === "G") {
        event.preventDefault();
        handleGoBottom();
        return;
      }

      // -------- Bare keys --------
      // Skip the modifier-augmented variants we've already handled above.
      if (event.metaKey || event.altKey) return;
      if (event.shiftKey) return;

      switch (event.key) {
        case "t":
          event.preventDefault();
          handleJumpToday();
          return;
        case "ArrowLeft":
          event.preventDefault();
          handleShiftDay(-1);
          return;
        case "ArrowRight":
          event.preventDefault();
          handleShiftDay(1);
          return;
        case "j":
          event.preventDefault();
          handleMoveSelection(1);
          return;
        case "k":
          event.preventDefault();
          handleMoveSelection(-1);
          return;
        case "h":
        case "l":
          event.preventDefault();
          announce("Column selection not yet available.");
          return;
        case "/":
          event.preventDefault();
          handleFocusSearch();
          return;
        case "n":
          event.preventDefault();
          announce("New booking flow not yet built.");
          return;
        case "w":
          event.preventDefault();
          handleFocusWaitlistAdd();
          return;
        case "s":
          event.preventDefault();
          announce("Squeeze-insert deferred from Phase 10.");
          return;
        case "c":
          event.preventDefault();
          handleCheckInSelected();
          return;
        case "p":
          event.preventDefault();
          announce("Pace status flow not yet built.");
          return;
        case "x":
          event.preventDefault();
          handleNoShowSelected();
          return;
        case "v":
          event.preventDefault();
          handleCycleDensity();
          return;
        default:
          return;
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);

    // Bucket A handlers — defined inside the effect closure so they can
    // read paramsRef without dep churn.

    function handleJumpToday(): void {
      const p = paramsRef.current;
      p.setDate(p.todayInClubTimezone());
      p.setSelectedSlotKey(null);
    }

    function handleShiftDay(deltaDays: number): void {
      const p = paramsRef.current;
      const shifted = shiftIsoDate(p.selectedDate, deltaDays);
      if (shifted === null) return;
      p.setDate(shifted);
      p.setSelectedSlotKey(null);
    }

    function handleMoveSelection(delta: number): void {
      const p = paramsRef.current;
      if (p.slotRows.length === 0) return;
      const currentIndex = p.selectedSlotKey
        ? p.slotRows.findIndex((row) => row.slot.slot_datetime === p.selectedSlotKey)
        : -1;
      // No selection + j → start at first row. No selection + k → no-op
      // (Phase 8 implies movement is relative to current selection;
      // arrowing into the list begins at the top).
      if (currentIndex === -1) {
        if (delta > 0) {
          p.setSelectedSlotKey(p.slotRows[0].slot.slot_datetime);
        }
        return;
      }
      const next = currentIndex + delta;
      if (next < 0 || next >= p.slotRows.length) return; // clamp silently
      p.setSelectedSlotKey(p.slotRows[next].slot.slot_datetime);
    }

    function handleGoTop(): void {
      const list = document.querySelector('[data-testid="tee-sheet-row-list"]');
      if (list instanceof HTMLElement) {
        list.scrollTo({ top: 0, behavior: "smooth" });
      }
      paramsRef.current.setSelectedSlotKey(null);
    }

    function handleGoBottom(): void {
      const list = document.querySelector('[data-testid="tee-sheet-row-list"]');
      if (list instanceof HTMLElement) {
        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      }
      paramsRef.current.setSelectedSlotKey(null);
    }

    function handleFocusSearch(): void {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="admin-topbar-search"]',
      );
      if (input) {
        input.focus();
        input.select();
      }
    }

    function handleFocusWaitlistAdd(): void {
      const btn = document.querySelector<HTMLButtonElement>(
        '[data-testid="waitlist-rail-add"]',
      );
      if (btn) btn.focus();
    }

    function handleCheckInSelected(): void {
      const p = paramsRef.current;
      const eligible = eligibleBooking(p);
      if (!eligible) {
        announce("No eligible booking to check in.");
        return;
      }
      p.onCheckInBooking(eligible.id);
      announce(`Checking in ${describeBooking(eligible)}`);
    }

    function handleNoShowSelected(): void {
      const p = paramsRef.current;
      const eligible = eligibleBooking(p);
      if (!eligible) {
        announce("No eligible booking to mark no-show.");
        return;
      }
      p.onMarkNoShow(eligible.id);
      announce(`Marking no-show: ${describeBooking(eligible)}`);
    }

    function handleCycleDensity(): void {
      const p = paramsRef.current;
      const next = p.onCycleDensity();
      announce(`Density: ${next}`);
    }
  }, [announce]);
}

// ------------------- Pure helpers -------------------

type EligibleBooking = TeeSheetSlotView["bookings"][number];

function eligibleBooking(params: UseTeeSheetShortcutsParams): EligibleBooking | null {
  if (params.selectedSlotKey === null) return null;
  const row = params.slotRows.find((r) => r.slot.slot_datetime === params.selectedSlotKey);
  if (!row) return null;
  const booking = row.slot.bookings[0];
  if (!booking) return null;
  if (booking.status !== "reserved") return null;
  return booking;
}

function describeBooking(booking: EligibleBooking): string {
  const primary = booking.participants.find((p) => p.is_primary) ?? booking.participants[0];
  return primary?.display_name ?? `booking ${booking.id.slice(0, 6)}`;
}

// Shift a YYYY-MM-DD date by N days. Returns null if the input doesn't
// parse — the page's date validator already guards this on load, so the
// null branch is purely defensive.
export function shiftIsoDate(iso: string, deltaDays: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  // Use UTC so the day-shift doesn't get mangled by the host's local
  // timezone offset. The output is a calendar date string; no time
  // arithmetic involved.
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
