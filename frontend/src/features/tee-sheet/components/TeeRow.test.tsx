import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { TeeRow, buildPlayerCells, rowPriceLabel, rowStateFromDisplayStatus } from "./TeeRow";
import type { TeeSheetSlotView } from "../../../types/tee-sheet";

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
    party_summary: {
      member_count: 0,
      guest_count: 0,
      staff_count: 0,
      total_players: 0,
      has_activity: false,
    },
    policy_summary: {
      applies_to: "staff",
      availability_status: "available",
      blocker_count: 0,
      unresolved_count: 0,
      warning_count: 0,
    },
    blockers: [],
    unresolved_checks: [],
    warnings: [],
    bookings: [],
    ...overrides,
  } as TeeSheetSlotView;
}

describe("rowStateFromDisplayStatus", () => {
  test("maps each backend display_status to a row state", () => {
    expect(rowStateFromDisplayStatus("available")).toBe("open");
    expect(rowStateFromDisplayStatus("blocked")).toBe("blocked");
    expect(rowStateFromDisplayStatus("reserved")).toBe("booked");
    expect(rowStateFromDisplayStatus("indeterminate")).toBe("booked");
    expect(rowStateFromDisplayStatus("warning")).toBe("atrisk");
  });
});

describe("buildPlayerCells", () => {
  test("returns 4 open cells when slot has no bookings", () => {
    const cells = buildPlayerCells(slot());
    expect(cells).toHaveLength(4);
    expect(cells.every((c) => c.kind === "open")).toBe(true);
  });

  test("fills cells with participants and pads to 4", () => {
    const cells = buildPlayerCells(
      slot({
        bookings: [
          {
            id: "b1",
            status: "reserved",
            party_size: 2,
            holes: 18,
            slot_datetime: "2026-05-12T06:30:00+02:00",
            cart_flag: true,
            participants: [
              { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
              { id: "p2", display_name: "T. Botha", participant_type: "member", is_primary: false },
            ],
          },
        ],
      }),
    );
    expect(cells).toHaveLength(4);
    expect(cells[0]).toMatchObject({ kind: "player", name: "M. Dlamini", cart: true });
    expect(cells[1]).toMatchObject({ kind: "player", name: "T. Botha", cart: true });
    expect(cells[2].kind).toBe("open");
    expect(cells[3].kind).toBe("open");
  });

  test("does not exceed slot capacity even with overlapping bookings", () => {
    const cells = buildPlayerCells(
      slot({
        occupancy: { ...slot().occupancy, player_capacity: 4 },
        bookings: [
          {
            id: "b1",
            status: "reserved",
            party_size: 3,
            holes: 18,
            slot_datetime: "2026-05-12T06:30:00+02:00",
            participants: [
              { id: "p1", display_name: "A", participant_type: "member", is_primary: true },
              { id: "p2", display_name: "B", participant_type: "member", is_primary: false },
              { id: "p3", display_name: "C", participant_type: "member", is_primary: false },
            ],
          },
          {
            id: "b2",
            status: "reserved",
            party_size: 2,
            holes: 18,
            slot_datetime: "2026-05-12T06:30:00+02:00",
            participants: [
              { id: "p4", display_name: "D", participant_type: "member", is_primary: true },
              { id: "p5", display_name: "E", participant_type: "member", is_primary: false },
            ],
          },
        ],
      }),
    );
    expect(cells).toHaveLength(4);
    expect(cells.filter((c) => c.kind === "player").map((c) => c.name)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("rowPriceLabel", () => {
  test('returns "—" for empty slots', () => {
    expect(rowPriceLabel(slot())).toBe("—");
  });

  test("sums fee_amount across bookings and prefixes R for ZAR", () => {
    const label = rowPriceLabel(
      slot({
        bookings: [
          {
            id: "b1",
            status: "reserved",
            party_size: 2,
            holes: 18,
            slot_datetime: "2026-05-12T06:30:00+02:00",
            fee_amount: "550.00",
            fee_currency: "ZAR",
            participants: [],
          },
          {
            id: "b2",
            status: "reserved",
            party_size: 1,
            holes: 18,
            slot_datetime: "2026-05-12T06:30:00+02:00",
            fee_amount: "320.00",
            fee_currency: "ZAR",
            participants: [],
          },
        ],
      }),
    );
    expect(label).toBe("R 870");
  });
});

describe("TeeRow rendering", () => {
  test("open row: state band has no glyph and the 4 cells are all 'Add player'", () => {
    const { container } = render(<TeeRow slot={slot()} />);
    const row = container.querySelector("[data-row-state]") as HTMLElement;
    expect(row.getAttribute("data-row-state")).toBe("open");
    expect(screen.getAllByText(/add player/i)).toHaveLength(4);
  });

  test("booked row: state-band glyph appears, players render with names", () => {
    render(
      <TeeRow
        slot={slot({
          display_status: "reserved",
          bookings: [
            {
              id: "b1",
              status: "reserved",
              party_size: 2,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              participants: [
                { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
                { id: "p2", display_name: "T. Botha", participant_type: "member", is_primary: false },
              ],
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/m\. dlamini/i)).toBeInTheDocument();
    expect(screen.getByText(/t\. botha/i)).toBeInTheDocument();
  });

  test("blocked row: hatched overlay replaces cells and renders blocker reason", () => {
    const { container } = render(
      <TeeRow
        slot={slot({
          display_status: "blocked",
          blockers: [{ code: "aeration", reason: "Greenkeeper · aeration block · 07:18 – 07:34", details: {} }],
        })}
      />,
    );
    const row = container.querySelector("[data-row-state='blocked']");
    expect(row).not.toBeNull();
    expect(screen.getByText(/Greenkeeper · aeration block/i)).toBeInTheDocument();
    // No add-player placeholders rendered when blocked
    expect(screen.queryByText(/add player/i)).toBeNull();
  });

  test("atrisk row: warning message renders as the italic note below", () => {
    render(
      <TeeRow
        slot={slot({
          display_status: "warning",
          warnings: [{ code: "incomplete_fourball", message: "Incomplete fourball · waitlist suggests 2 hold-overs" }],
        })}
      />,
    );
    expect(screen.getByText(/incomplete fourball/i)).toBeInTheDocument();
  });

  test("coalesceWithPrevious + blocked → renders nothing (hideHead behaviour)", () => {
    const { container } = render(
      <TeeRow
        slot={slot({
          display_status: "blocked",
          blockers: [{ code: "aeration", reason: "Aeration", details: {} }],
        })}
        coalesceWithPrevious
      />,
    );
    expect(container.querySelector("[data-row-state]")).toBeNull();
  });

  test("coalesceWithPrevious + non-blocked → renders normally", () => {
    const { container } = render(<TeeRow slot={slot()} coalesceWithPrevious />);
    expect(container.querySelector("[data-row-state='open']")).not.toBeNull();
  });
});

describe("TeeRow selection (Slice 4)", () => {
  test("clicking a non-blocked row fires onSelect with slot_datetime", () => {
    const onSelect = vi.fn();
    const { container } = render(<TeeRow slot={slot()} onSelect={onSelect} />);
    fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("2026-05-12T06:30:00+02:00");
  });

  test("clicking a blocked row does NOT fire onSelect", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TeeRow
        slot={slot({
          display_status: "blocked",
          blockers: [{ code: "x", reason: "Closed", details: {} }],
        })}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("price button click fires onSelect AND onPriceClick (Phase 8 parity)", () => {
    const onSelect = vi.fn();
    const onPriceClick = vi.fn();
    render(<TeeRow slot={slot()} onSelect={onSelect} onPriceClick={onPriceClick} />);
    fireEvent.click(screen.getByTestId("row-price-button"));
    // Fires once (price button), NOT twice (row bubble suppressed via stopPropagation)
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("2026-05-12T06:30:00+02:00");
    expect(onPriceClick).toHaveBeenCalledTimes(1);
    // Anchor element is the button itself
    expect(onPriceClick.mock.calls[0][0]).toBe("2026-05-12T06:30:00+02:00");
    expect((onPriceClick.mock.calls[0][1] as HTMLElement).tagName).toBe("BUTTON");
  });

  test("blocked row's price button is disabled and fires no callbacks", () => {
    const onSelect = vi.fn();
    const onPriceClick = vi.fn();
    render(
      <TeeRow
        slot={slot({
          display_status: "blocked",
          blockers: [{ code: "x", reason: "Closed", details: {} }],
        })}
        onSelect={onSelect}
        onPriceClick={onPriceClick}
      />,
    );
    const priceButton = screen.getByTestId("row-price-button");
    expect(priceButton).toBeDisabled();
    fireEvent.click(priceButton);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onPriceClick).not.toHaveBeenCalled();
  });

  test("price button carries data-role for the popover anchor-swap listener", () => {
    render(<TeeRow slot={slot()} />);
    expect(screen.getByTestId("row-price-button").getAttribute("data-role")).toBe("row-price-button");
  });

  test("more_vert button click does NOT fire onSelect (stopPropagation)", () => {
    const onSelect = vi.fn();
    render(<TeeRow slot={slot()} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("row-actions-button"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("isSelected=true sets aria-selected, data-selected, and brand outline+tint", () => {
    const { container } = render(<TeeRow slot={slot()} isSelected onSelect={() => {}} />);
    const row = container.querySelector("[data-row-state]") as HTMLElement;
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(row.style.outline).toContain("var(--gl-brand)");
    expect(row.style.background).toContain("color-mix");
    expect(row.style.background).toContain("var(--gl-brand)");
  });

  test("blocked row is not aria-selected even when isSelected is passed", () => {
    const { container } = render(
      <TeeRow
        slot={slot({
          display_status: "blocked",
          blockers: [{ code: "x", reason: "Closed", details: {} }],
        })}
        isSelected
        onSelect={() => {}}
      />,
    );
    const row = container.querySelector("[data-row-state='blocked']") as HTMLElement;
    expect(row.hasAttribute("aria-selected")).toBe(false);
  });
});
