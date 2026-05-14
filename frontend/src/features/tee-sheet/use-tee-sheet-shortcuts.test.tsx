// Path: frontend/src/features/tee-sheet/use-tee-sheet-shortcuts.test.tsx — Phase 10 Slice 10.
// Behavioural tests for the central keydown dispatch. Mounts the hook
// inside a tiny harness component, fires keydown events on document, and
// asserts handler / announcement effects.
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { shiftIsoDate, useTeeSheetShortcuts } from "./use-tee-sheet-shortcuts";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

function slot(overrides: Partial<TeeSheetSlotView> = {}): TeeSheetSlotView {
  return {
    slot_datetime: "2026-05-12T06:30:00+02:00",
    local_time: "06:30:00",
    display_status: "available",
    state_flags: {},
    occupancy: {
      player_capacity: 4,
      occupied_player_count: 0,
      reserved_player_count: 0,
      confirmed_booking_count: 0,
      reserved_booking_count: 0,
      remaining_player_capacity: 4,
    },
    party_summary: { member_count: 0, guest_count: 0, staff_count: 0, total_players: 0, has_activity: false },
    policy_summary: { applies_to: "staff", availability_status: "available", blocker_count: 0, unresolved_count: 0, warning_count: 0 },
    blockers: [],
    unresolved_checks: [],
    warnings: [],
    bookings: [],
    ...overrides,
  } as TeeSheetSlotView;
}

interface HarnessOverrides {
  selectedSlotKey?: string | null;
  slotRows?: Array<{ slot: TeeSheetSlotView }>;
  selectedDate?: string;
}

function buildHarness(overrides: HarnessOverrides = {}) {
  const setSelectedSlotKey = vi.fn();
  const setDate = vi.fn();
  const todayInClubTimezone = vi.fn(() => "2026-06-01");
  const onCheckInBooking = vi.fn();
  const onMarkNoShow = vi.fn();
  const onOpenPricePopoverForSelected = vi.fn();
  const onCycleDensity = vi.fn(() => "default");
  const setShortcutAnnouncement = vi.fn();

  const slotRows = overrides.slotRows ?? [
    { slot: slot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00" }) },
    { slot: slot({ slot_datetime: "2026-05-12T06:38:00+02:00", local_time: "06:38:00" }) },
    { slot: slot({ slot_datetime: "2026-05-12T06:46:00+02:00", local_time: "06:46:00" }) },
  ];

  function Harness(): null {
    useTeeSheetShortcuts({
      slotRows,
      selectedSlotKey: overrides.selectedSlotKey ?? null,
      setSelectedSlotKey,
      selectedDate: overrides.selectedDate ?? "2026-05-12",
      setDate,
      todayInClubTimezone,
      onCheckInBooking,
      onMarkNoShow,
      onOpenPricePopoverForSelected,
      onCycleDensity,
      setShortcutAnnouncement,
    });
    return null;
  }
  const utils = render(<Harness />);
  return {
    setSelectedSlotKey,
    setDate,
    todayInClubTimezone,
    onCheckInBooking,
    onMarkNoShow,
    onOpenPricePopoverForSelected,
    onCycleDensity,
    setShortcutAnnouncement,
    ...utils,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("shiftIsoDate", () => {
  test("shifts forward by 1 day", () => {
    expect(shiftIsoDate("2026-05-12", 1)).toBe("2026-05-13");
  });
  test("shifts backward by 1 day", () => {
    expect(shiftIsoDate("2026-05-12", -1)).toBe("2026-05-11");
  });
  test("crosses month boundary cleanly", () => {
    expect(shiftIsoDate("2026-01-31", 1)).toBe("2026-02-01");
  });
  test("returns null for malformed input", () => {
    expect(shiftIsoDate("not-a-date", 1)).toBeNull();
  });
});

describe("useTeeSheetShortcuts — Bucket A", () => {
  test("t fires setDate to today + clears selection", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "t" });
    expect(h.todayInClubTimezone).toHaveBeenCalled();
    expect(h.setDate).toHaveBeenCalledWith("2026-06-01");
    expect(h.setSelectedSlotKey).toHaveBeenCalledWith(null);
  });

  test("→ shifts day +1, ← shifts day -1; both clear selection", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(h.setDate).toHaveBeenLastCalledWith("2026-05-13");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(h.setDate).toHaveBeenLastCalledWith("2026-05-11");
    expect(h.setSelectedSlotKey).toHaveBeenCalledWith(null);
  });

  test("j moves selection down a row", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "j" });
    expect(h.setSelectedSlotKey).toHaveBeenLastCalledWith("2026-05-12T06:38:00+02:00");
  });

  test("k moves selection up a row", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:38:00+02:00" });
    fireEvent.keyDown(document, { key: "k" });
    expect(h.setSelectedSlotKey).toHaveBeenLastCalledWith("2026-05-12T06:30:00+02:00");
  });

  test("j at the last row is a no-op (clamped)", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:46:00+02:00" });
    fireEvent.keyDown(document, { key: "j" });
    expect(h.setSelectedSlotKey).not.toHaveBeenCalled();
  });

  test("j with no selection lands on the first row; k with no selection is a no-op", () => {
    const h = buildHarness({ selectedSlotKey: null });
    fireEvent.keyDown(document, { key: "j" });
    expect(h.setSelectedSlotKey).toHaveBeenLastCalledWith("2026-05-12T06:30:00+02:00");
    h.setSelectedSlotKey.mockClear();
    fireEvent.keyDown(document, { key: "k" });
    expect(h.setSelectedSlotKey).not.toHaveBeenCalled();
  });

  test("gg within 1s scrolls top + clears selection; gg outside the window does not", () => {
    vi.useFakeTimers({ now: new Date("2026-05-12T06:00:00Z") });
    const list = document.createElement("div");
    list.setAttribute("data-testid", "tee-sheet-row-list");
    list.scrollTo = vi.fn();
    document.body.appendChild(list);
    try {
      const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
      fireEvent.keyDown(document, { key: "g" });
      vi.advanceTimersByTime(500);
      fireEvent.keyDown(document, { key: "g" });
      expect(list.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      expect(h.setSelectedSlotKey).toHaveBeenLastCalledWith(null);

      // Outside the 1s window — the second `g` resets the sequence.
      (list.scrollTo as ReturnType<typeof vi.fn>).mockClear();
      fireEvent.keyDown(document, { key: "g" });
      vi.advanceTimersByTime(1500);
      fireEvent.keyDown(document, { key: "g" });
      expect(list.scrollTo).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(list);
    }
  });

  test("⇧G scrolls to bottom + clears selection", () => {
    const list = document.createElement("div");
    list.setAttribute("data-testid", "tee-sheet-row-list");
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    list.scrollTo = vi.fn();
    document.body.appendChild(list);
    try {
      const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
      fireEvent.keyDown(document, { key: "G", shiftKey: true });
      expect(list.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
      expect(h.setSelectedSlotKey).toHaveBeenLastCalledWith(null);
    } finally {
      document.body.removeChild(list);
    }
  });

  test("/ focuses the topbar search input (by data-testid)", () => {
    const input = document.createElement("input");
    input.setAttribute("data-testid", "admin-topbar-search");
    input.type = "search";
    const focus = vi.fn();
    input.focus = focus;
    input.select = vi.fn();
    document.body.appendChild(input);
    try {
      buildHarness();
      fireEvent.keyDown(document, { key: "/" });
      expect(focus).toHaveBeenCalled();
    } finally {
      document.body.removeChild(input);
    }
  });

  test("w focuses the waitlist-rail Add button (by data-testid)", () => {
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", "waitlist-rail-add");
    const focus = vi.fn();
    btn.focus = focus;
    document.body.appendChild(btn);
    try {
      buildHarness();
      fireEvent.keyDown(document, { key: "w" });
      expect(focus).toHaveBeenCalled();
    } finally {
      document.body.removeChild(btn);
    }
  });

  test("c with eligible reserved booking fires onCheckInBooking", () => {
    const rows = [
      {
        slot: slot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          bookings: [
            {
              id: "booking-1",
              status: "reserved",
              party_size: 1,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              participants: [
                { id: "p-1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
              ],
            },
          ],
        }),
      },
    ];
    const h = buildHarness({ slotRows: rows, selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "c" });
    expect(h.onCheckInBooking).toHaveBeenCalledWith("booking-1");
  });

  test("c with no selection announces 'No eligible booking to check in'", () => {
    const h = buildHarness({ selectedSlotKey: null });
    fireEvent.keyDown(document, { key: "c" });
    expect(h.onCheckInBooking).not.toHaveBeenCalled();
    // The clear-then-set pattern uses setTimeout(0); both calls go through
    // setShortcutAnnouncement.
    expect(h.setShortcutAnnouncement).toHaveBeenCalledWith("");
  });

  test("x with eligible reserved booking fires onMarkNoShow", () => {
    const rows = [
      {
        slot: slot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          bookings: [
            {
              id: "booking-2",
              status: "reserved",
              party_size: 1,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              participants: [],
            },
          ],
        }),
      },
    ];
    const h = buildHarness({ slotRows: rows, selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "x" });
    expect(h.onMarkNoShow).toHaveBeenCalledWith("booking-2");
  });

  test("⌥P with selection fires onOpenPricePopoverForSelected; without selection announces stub", () => {
    const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
    fireEvent.keyDown(document, { key: "p", altKey: true });
    expect(h.onOpenPricePopoverForSelected).toHaveBeenCalled();
    h.onOpenPricePopoverForSelected.mockClear();

    const h2 = buildHarness({ selectedSlotKey: null });
    fireEvent.keyDown(document, { key: "p", altKey: true });
    expect(h2.onOpenPricePopoverForSelected).not.toHaveBeenCalled();
  });
});

describe("useTeeSheetShortcuts — Bucket B (stubs)", () => {
  test.each([
    ["n", "New booking flow not yet built."],
    ["s", "Squeeze-insert deferred from Phase 10."],
    ["p", "Pace status flow not yet built."],
    ["h", "Column selection not yet available."],
    ["l", "Column selection not yet available."],
  ])("%s announces %s", (key, message) => {
    vi.useFakeTimers();
    const h = buildHarness();
    fireEvent.keyDown(document, { key });
    vi.runAllTimers();
    expect(h.setShortcutAnnouncement).toHaveBeenCalledWith("");
    expect(h.setShortcutAnnouncement).toHaveBeenLastCalledWith(message);
  });

  test("⌘Z (meta+z) announces 'Undo not yet available.'", () => {
    vi.useFakeTimers();
    const h = buildHarness();
    fireEvent.keyDown(document, { key: "z", metaKey: true });
    vi.runAllTimers();
    expect(h.setShortcutAnnouncement).toHaveBeenLastCalledWith("Undo not yet available.");
  });

  test("⌥A announces 'Audit history not yet available.'", () => {
    vi.useFakeTimers();
    const h = buildHarness();
    fireEvent.keyDown(document, { key: "a", altKey: true });
    vi.runAllTimers();
    expect(h.setShortcutAnnouncement).toHaveBeenLastCalledWith("Audit history not yet available.");
  });
});

describe("useTeeSheetShortcuts — Bucket C (forward refs)", () => {
  test.each([
    [{ key: "T", shiftKey: true }, "Tournament mode arrives in Slice 12."],
    [{ key: "M", shiftKey: true }, "Marshal view arrives in Slice 13."],
  ])("%o announces %s", (eventInit, message) => {
    vi.useFakeTimers();
    const h = buildHarness();
    fireEvent.keyDown(document, eventInit);
    vi.runAllTimers();
    expect(h.setShortcutAnnouncement).toHaveBeenLastCalledWith(message);
  });

  // Slice 11 — v moved from forward-ref stub to real Bucket A handler.
  test("v fires onCycleDensity and announces the new density", () => {
    vi.useFakeTimers();
    const h = buildHarness();
    h.onCycleDensity.mockReturnValueOnce("comfortable");
    fireEvent.keyDown(document, { key: "v" });
    vi.runAllTimers();
    expect(h.onCycleDensity).toHaveBeenCalledTimes(1);
    expect(h.setShortcutAnnouncement).toHaveBeenLastCalledWith("Density: comfortable");
  });
});

describe("useTeeSheetShortcuts — skip-gate", () => {
  test("keystrokes are ignored when an input has focus", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    try {
      const h = buildHarness({ selectedSlotKey: "2026-05-12T06:30:00+02:00" });
      fireEvent.keyDown(document, { key: "j" });
      fireEvent.keyDown(document, { key: "t" });
      fireEvent.keyDown(document, { key: "c" });
      expect(h.setSelectedSlotKey).not.toHaveBeenCalled();
      expect(h.setDate).not.toHaveBeenCalled();
      expect(h.onCheckInBooking).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(input);
    }
  });
});
