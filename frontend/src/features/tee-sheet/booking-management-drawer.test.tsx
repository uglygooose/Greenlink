import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { BookingManagementDrawer } from "./booking-management-drawer";
import type { BookingSummary } from "../../types/bookings";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

function buildBooking(paymentStatus: BookingSummary["payment_status"]): BookingSummary {
  return {
    id: "booking-1",
    club_id: "club-1",
    course_id: "course-1",
    tee_id: "tee-1",
    slot_datetime: "2026-03-30T04:00:00Z",
    slot_interval_minutes: 30,
    status: "reserved",
    source: "admin",
    party_size: 2,
    cart_flag: false,
    caddie_flag: false,
    fee_label: "Member Weekend Rate",
    payment_status: paymentStatus,
    created_at: "2026-03-25T06:00:00Z",
    updated_at: "2026-03-25T06:00:00Z",
    participants: [
      { id: "participant-1", display_name: "Member One", participant_type: "member", is_primary: true },
      { id: "participant-2", display_name: "Guest One", participant_type: "guest", is_primary: false },
    ],
  };
}

function buildSlot(booking: BookingSummary): TeeSheetSlotView {
  return {
    slot_datetime: "2026-03-30T04:00:00Z",
    local_time: "06:00:00",
    display_status: "reserved",
    state_flags: {},
    occupancy: {
      player_capacity: 4,
      occupied_player_count: 0,
      reserved_player_count: 2,
      confirmed_booking_count: 0,
      reserved_booking_count: 1,
      remaining_player_capacity: 2,
    },
    party_summary: {
      member_count: 1,
      guest_count: 1,
      staff_count: 0,
      total_players: 2,
      has_activity: true,
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
    bookings: [booking],
  };
}

function renderDrawer({
  paymentStatus = "pending",
  showFinanceActions = true,
}: {
  paymentStatus?: BookingSummary["payment_status"];
  showFinanceActions?: boolean;
} = {}): void {
  const booking = buildBooking(paymentStatus);
  const slot = buildSlot(booking);
  render(
    <BookingManagementDrawer
      colorCode="#1b4d8f"
      directory={[]}
      editCaddieFlag={false}
      editCartFlag={false}
      editingBookingId={null}
      editParticipants={[]}
      feedbackMessage={null}
      feedbackTone={null}
      laneLabel="1st Tee"
      onCancel={vi.fn()}
      onCheckIn={vi.fn()}
      onClose={vi.fn()}
      onComplete={vi.fn()}
      onEditAddParticipant={vi.fn()}
      onEditCancel={vi.fn()}
      onEditCaddieFlagChange={vi.fn()}
      onEditChangeParticipant={vi.fn()}
      onEditCartFlagChange={vi.fn()}
      onEditRemoveParticipant={vi.fn()}
      onEditSave={vi.fn()}
      onEditStart={vi.fn()}
      onMarkComplimentary={vi.fn()}
      onMarkWaived={vi.fn()}
      onNoShow={vi.fn()}
      onPostCharge={vi.fn()}
      onRecordPayment={vi.fn()}
      pendingAction={null}
      pendingBookingId={null}
      pendingFinanceAction={null}
      pendingFinanceBookingId={null}
      savingBookingId={null}
      selectedDate="2026-03-30"
      showFinanceActions={showFinanceActions}
      slot={slot}
      teeLabel="Blue"
    />,
  );
}

describe("BookingManagementDrawer finance actions", () => {
  test("shows the finance panel only when the rebuild flag path is enabled", () => {
    renderDrawer({ showFinanceActions: false });
    expect(screen.queryByText("Finance Actions")).not.toBeInTheDocument();

    renderDrawer({ showFinanceActions: true });
    expect(screen.getByText("Finance Actions")).toBeInTheDocument();
  });

  test("highlights pending bookings and enables the expected actions", () => {
    renderDrawer({ paymentStatus: "pending" });

    expect(screen.getByText("Unpaid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record Payment/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Mark Complimentary/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Mark Waived/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Post Charge/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Charge amount for booking booking-1/i), {
      target: { value: "85.00" },
    });

    expect(screen.getByRole("button", { name: /Post Charge/i })).toBeEnabled();
  });

  test("disables finance actions that should not be available once a booking is paid", () => {
    renderDrawer({ paymentStatus: "paid" });

    expect(screen.queryByText("Unpaid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Post Charge/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Record Payment/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mark Complimentary/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mark Waived/i })).toBeDisabled();
  });
});
