import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TeeSheetSwimLaneGrid } from "./tee-sheet-swimlane-grid";
import type { LaneSlot, TeeSheetBucket } from "./sheet-shared";

const scrollToMock = vi.fn();

function buildLaneSlot(
  laneLabel: "1st Tee" | "10th Tee",
  startLane: "hole_1" | "hole_10",
  rowKey: string,
  slotDatetime: string,
  localTime: string,
  withBooking = false,
): LaneSlot {
  return {
    colorCode: "#1b4d8f",
    laneLabel,
    rowKey,
    rowLabel: "Blue",
    startLane,
    teeId: "tee-1",
    slot: {
      slot_datetime: slotDatetime,
      local_time: localTime,
      display_status: "available",
      state_flags: {},
      occupancy: {
        player_capacity: 4,
        occupied_player_count: 0,
        reserved_player_count: withBooking ? 2 : 0,
        confirmed_booking_count: 0,
        reserved_booking_count: withBooking ? 1 : 0,
        remaining_player_capacity: withBooking ? 2 : 4,
      },
      party_summary: {
        member_count: withBooking ? 1 : 0,
        guest_count: withBooking ? 1 : 0,
        staff_count: 0,
        total_players: withBooking ? 2 : 0,
        has_activity: withBooking,
      },
      policy_summary: {
        applies_to: "member",
        availability_status: "allowed",
        blocker_count: 0,
        unresolved_count: 0,
        warning_count: 0,
      },
      blockers: [],
      unresolved_checks: [],
      warnings: [],
      bookings: withBooking
        ? [
            {
              id: "booking-1",
              status: "reserved",
              party_size: 2,
              holes: 18,
              slot_datetime: slotDatetime,
              start_lane: startLane,
              fee_label: "Member Weekend Rate",
              payment_status: "pending",
              cart_flag: true,
              caddie_flag: false,
              participants: [
                { display_name: "Member One", participant_type: "member", is_primary: true },
                { display_name: "Guest One", participant_type: "guest", is_primary: false },
              ],
            },
          ]
        : [],
    },
  };
}

function buildColumns(): TeeSheetBucket[] {
  return [
    {
      localTime: "06:00:00",
      slotDatetime: "2026-03-30T04:00:00Z",
      slots: [
        buildLaneSlot("1st Tee", "hole_1", "lane-hole-1", "2026-03-30T04:00:00Z", "06:00:00", true),
        buildLaneSlot("10th Tee", "hole_10", "lane-hole-10", "2026-03-30T04:00:00Z", "06:00:00"),
      ],
    },
    {
      localTime: "06:10:00",
      slotDatetime: "2026-03-30T04:10:00Z",
      slots: [
        buildLaneSlot("1st Tee", "hole_1", "lane-hole-1", "2026-03-30T04:10:00Z", "06:10:00"),
        buildLaneSlot("10th Tee", "hole_10", "lane-hole-10", "2026-03-30T04:10:00Z", "06:10:00"),
      ],
    },
  ];
}

describe("TeeSheetSwimLaneGrid", () => {
  beforeEach(() => {
    scrollToMock.mockClear();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
      writable: true,
    });
  });

  test("renders clear time headers with a visible now indicator", () => {
    vi.useFakeTimers({ now: new Date("2026-03-30T04:05:00.000Z") });
    try {
      render(
        <TeeSheetSwimLaneGrid
          checkingInAllBucket={null}
          columns={buildColumns()}
          dropAllowed={() => true}
          dropKey={(slot) => `${slot.rowKey}:${slot.slot.slot_datetime}`}
          highlightedSlotKey={null}
          intervalMinutes={10}
          movingBookingId={null}
          onCheckInAll={vi.fn()}
          onEndDrag={vi.fn()}
          onMoveBooking={vi.fn()}
          onOpenCreate={vi.fn()}
          onOpenManage={vi.fn()}
          onQuickAction={vi.fn()}
          onStartDrag={vi.fn()}
          onToggleBookingExpansion={vi.fn()}
          pendingAction={null}
          pendingBookingId={null}
          isBookingExpanded={() => false}
          renderExpandedBookingPanel={() => <div>Expanded booking</div>}
          setExpandedBookingCardElement={vi.fn()}
          selectedDate="2026-03-30"
          timezone="Africa/Johannesburg"
        />,
      );

      expect(screen.getByTestId("timeline-header-06:00")).toHaveTextContent("06:00");
      expect(screen.getByTestId("timeline-header-06:10")).toHaveTextContent("06:10");
      expect(screen.getAllByText("Now").length).toBeGreaterThan(0);
      expect(screen.getByTestId("timeline-current-time-indicator")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("renders booking cards as draggable booking-level move surfaces", () => {
    render(
      <TeeSheetSwimLaneGrid
        checkingInAllBucket={null}
        columns={buildColumns()}
        dropAllowed={() => true}
        dropKey={(slot) => `${slot.rowKey}:${slot.slot.slot_datetime}`}
        highlightedSlotKey={null}
        intervalMinutes={10}
        movingBookingId={null}
        onCheckInAll={vi.fn()}
        onEndDrag={vi.fn()}
        onMoveBooking={vi.fn()}
        onOpenCreate={vi.fn()}
        onOpenManage={vi.fn()}
        onQuickAction={vi.fn()}
        onStartDrag={vi.fn()}
        onToggleBookingExpansion={vi.fn()}
        pendingAction={null}
        pendingBookingId={null}
        isBookingExpanded={() => false}
        renderExpandedBookingPanel={() => <div>Expanded booking</div>}
        setExpandedBookingCardElement={vi.fn()}
        selectedDate="2026-03-30"
        timezone="Africa/Johannesburg"
      />,
    );

    expect(screen.getByRole("button", { name: /open booking booking-1/i })).toHaveAttribute("draggable", "true");
  });
});
