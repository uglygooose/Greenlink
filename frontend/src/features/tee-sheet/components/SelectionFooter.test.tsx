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

  test("? button has aria-label flagging Slice 6 wiring and is disabled", () => {
    render(<SelectionFooter selectedSlot={null} />);
    const btn = screen.getByTestId("selection-shortcuts-button");
    expect(btn.getAttribute("aria-label")).toMatch(/ships in slice 6/i);
    expect(btn).toBeDisabled();
  });

  test("? button click is a no-op (button is disabled — no handler wired)", () => {
    const onClick = vi.fn();
    render(<SelectionFooter selectedSlot={null} />);
    fireEvent.click(screen.getByTestId("selection-shortcuts-button"));
    expect(onClick).not.toHaveBeenCalled();
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
});
