import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SelectionFooter } from "./SelectionFooter";
import type { TeeSheetSlotView } from "../../../types/tee-sheet";

function slot(overrides: Partial<TeeSheetSlotView> = {}): TeeSheetSlotView {
  return {
    slot_datetime: "2026-05-12T06:46:00+02:00",
    local_time: "06:46:00",
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

describe("SelectionFooter", () => {
  test("empty state: no selection → greyed chips, em-dash selection label, stub lock line", () => {
    render(<SelectionFooter selectedSlot={null} />);
    const footer = screen.getByTestId("selection-footer");
    expect(footer.getAttribute("data-has-selection")).toBe("false");

    // Selection label shows em-dash, not a time
    expect(screen.getByTestId("selection-label").textContent).toContain("—");

    // Chips wrapper is at reduced opacity
    expect(screen.getByTestId("selection-shortcut-chips").style.opacity).toBe("0.45");

    // Lock line shows the stub
    expect(screen.getByTestId("selection-lock-line").textContent).toContain("Slot — · — remaining");
  });

  test("hydrated state: selected slot → mono time, chips at full opacity", () => {
    render(<SelectionFooter selectedSlot={slot()} />);
    const footer = screen.getByTestId("selection-footer");
    expect(footer.getAttribute("data-has-selection")).toBe("true");
    expect(screen.getByTestId("selection-label").textContent).toContain("06:46");
    expect(screen.getByTestId("selection-shortcut-chips").style.opacity).toBe("1");
  });

  test("lock line stays stubbed even when a slot is selected (Slice 9a wires real locks)", () => {
    render(<SelectionFooter selectedSlot={slot()} />);
    expect(screen.getByTestId("selection-lock-line").textContent).toContain("Slot — · — remaining");
  });

  test("? button without onOpenShortcuts is disabled (no consumer wired)", () => {
    render(<SelectionFooter selectedSlot={null} />);
    const btn = screen.getByTestId("selection-shortcuts-button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-label")).toMatch(/open keyboard shortcuts/i);
  });

  test("? button click fires onOpenShortcuts when wired", () => {
    const onOpenShortcuts = vi.fn();
    render(<SelectionFooter selectedSlot={null} onOpenShortcuts={onOpenShortcuts} />);
    const btn = screen.getByTestId("selection-shortcuts-button");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  test("four shortcut chips render: n, s, c, p", () => {
    render(<SelectionFooter selectedSlot={null} />);
    const chips = screen.getByTestId("selection-shortcut-chips");
    const kbds = chips.querySelectorAll(".gl-kbd");
    expect(kbds).toHaveLength(4);
    const keys = Array.from(kbds).map((k) => k.textContent);
    expect(keys).toEqual(["n", "s", "c", "p"]);
    expect(chips.textContent).toContain("new");
    expect(chips.textContent).toContain("squeeze");
    expect(chips.textContent).toContain("check-in");
    expect(chips.textContent).toContain("pace");
  });

  // ---------- Slice 9a lock-line states ----------

  test("idle lock state renders the empty placeholder", () => {
    render(<SelectionFooter selectedSlot={null} lockState={{ kind: "idle" }} />);
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("idle");
    expect(line.textContent).toContain("Slot — · — remaining");
  });

  test("acquiring renders the info pill", () => {
    render(<SelectionFooter selectedSlot={slot()} lockState={{ kind: "acquiring" }} />);
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("acquiring");
    expect(line.textContent).toContain("Acquiring slot lock");
  });

  test("held-by-me renders 'held by you' with countdown", () => {
    const lock = makeLock({ holder_user_id: "user-1" });
    render(
      <SelectionFooter
        selectedSlot={slot()}
        lockState={{ kind: "held-by-me", lock }}
        lockSecondsRemaining={38}
      />,
    );
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("held-by-me");
    expect(line.textContent).toContain("Slot 06:46 held by you · 38s remaining");
  });

  test("held-by-other renders holder name + countdown in atrisk tone", () => {
    const lock = makeLock({
      holder_user_id: "user-2",
      holder_display_name: "Mokoena",
    });
    render(
      <SelectionFooter
        selectedSlot={slot()}
        lockState={{ kind: "held-by-other", lock }}
        lockSecondsRemaining={22}
        lockHolderDisplayName="Mokoena"
      />,
    );
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("held-by-other");
    expect(line.textContent).toContain("Slot 06:46 held by Mokoena · 22s remaining");
    expect(line.style.color).toContain("var(--gl-state-atrisk)");
  });

  test("releasing renders the neutral pill", () => {
    render(<SelectionFooter selectedSlot={slot()} lockState={{ kind: "releasing" }} />);
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("releasing");
    expect(line.textContent).toContain("Releasing");
  });

  test("error renders the recovery hint in atrisk tone", () => {
    render(
      <SelectionFooter
        selectedSlot={slot()}
        lockState={{ kind: "error", message: "Renew failed" }}
      />,
    );
    const line = screen.getByTestId("selection-lock-line");
    expect(line.getAttribute("data-lock-kind")).toBe("error");
    expect(line.textContent).toContain("Lock error — try selecting again");
    expect(line.style.color).toContain("var(--gl-state-atrisk)");
  });

  test("Slice 10 — chip clicks fire the corresponding handlers", () => {
    const onN = vi.fn();
    const onS = vi.fn();
    const onC = vi.fn();
    const onP = vi.fn();
    render(
      <SelectionFooter
        selectedSlot={null}
        onShortcutN={onN}
        onShortcutS={onS}
        onShortcutC={onC}
        onShortcutP={onP}
      />,
    );
    fireEvent.click(screen.getByTestId("selection-shortcut-chip-n"));
    fireEvent.click(screen.getByTestId("selection-shortcut-chip-s"));
    fireEvent.click(screen.getByTestId("selection-shortcut-chip-c"));
    fireEvent.click(screen.getByTestId("selection-shortcut-chip-p"));
    expect(onN).toHaveBeenCalledTimes(1);
    expect(onS).toHaveBeenCalledTimes(1);
    expect(onC).toHaveBeenCalledTimes(1);
    expect(onP).toHaveBeenCalledTimes(1);
  });

  test("Slice 10 — chips fall back to span (no test-id) when no handlers supplied", () => {
    render(<SelectionFooter selectedSlot={null} />);
    expect(screen.queryByTestId("selection-shortcut-chip-n")).toBeNull();
    expect(screen.queryByTestId("selection-shortcut-chip-c")).toBeNull();
    const chips = screen.getByTestId("selection-shortcut-chips");
    const kbds = chips.querySelectorAll(".gl-kbd");
    expect(kbds).toHaveLength(4);
  });

  test("countdown updates when prop changes", () => {
    const lock = makeLock({ holder_user_id: "user-1" });
    const { rerender } = render(
      <SelectionFooter
        selectedSlot={slot()}
        lockState={{ kind: "held-by-me", lock }}
        lockSecondsRemaining={59}
      />,
    );
    expect(screen.getByTestId("selection-lock-line").textContent).toContain("59s remaining");
    rerender(
      <SelectionFooter
        selectedSlot={slot()}
        lockState={{ kind: "held-by-me", lock }}
        lockSecondsRemaining={58}
      />,
    );
    expect(screen.getByTestId("selection-lock-line").textContent).toContain("58s remaining");
  });
});

function makeLock(overrides: Partial<import("../../../types/tee-sheet-locks").TeeSheetLockResponse> = {}) {
  return {
    id: "lock-1",
    club_id: "club-1",
    course_id: "course-1",
    slot_datetime: "2026-05-12T06:46:00+02:00",
    holder_user_id: "user-1",
    holder_display_name: "Operator A",
    acquired_at: "2026-05-12T06:45:00+02:00",
    expires_at: "2026-05-12T06:46:00+02:00",
    remaining_seconds: 60,
    ...overrides,
  };
}
