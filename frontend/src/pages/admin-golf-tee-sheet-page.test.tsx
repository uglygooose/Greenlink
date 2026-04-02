import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  createBooking,
  markBookingNoShow,
} from "../api/operations";
import { AdminGolfTeeSheetPage } from "./admin-golf-tee-sheet-page";
import type { BookingNoShowResult } from "../types/bookings";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
}));

vi.mock("../features/tee-sheet/hooks", () => ({
  teeSheetKeys: {
    day: (clubId: string, courseId: string, day: string, membershipType: string) => [
      "tee-sheet",
      clubId,
      courseId,
      day,
      membershipType,
    ],
  },
  useTeeSheetDayQuery: () => mockUseTeeSheetDayQuery(),
}));

vi.mock("../api/operations", () => ({
  cancelBooking: vi.fn(),
  checkInBooking: vi.fn(),
  completeBooking: vi.fn(),
  createBooking: vi.fn(),
  markBookingNoShow: vi.fn(),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(): void {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/admin/golf/tee-sheet"]}
    >
      <QueryClientProvider client={buildQueryClient()}>
        <AdminGolfTeeSheetPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function deferredPromise<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      resolvePromise?.(value);
    },
  };
}

const teeSheetPayload = {
  club_id: "club-1",
  course_id: "course-1",
  course_name: "North",
  date: "2026-03-30",
  timezone: "Africa/Johannesburg",
  interval_minutes: 30,
  membership_type: "member" as const,
  reference_datetime: "2026-03-25T06:00:00Z",
  warnings: [],
  rows: [
    {
      row_key: "tee-1",
      tee_id: "tee-1",
      label: "Blue",
      color_code: "#1b4d8f",
      slots: [
        {
          slot_datetime: "2026-03-30T04:00:00Z",
          local_time: "06:00:00",
          display_status: "available" as const,
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
            applies_to: "member" as const,
            availability_status: "allowed",
            blocker_count: 0,
            unresolved_count: 1,
            warning_count: 0,
          },
          blockers: [],
          unresolved_checks: [],
          warnings: [],
          bookings: [
            {
              id: "booking-1",
              status: "reserved" as const,
              party_size: 2,
              slot_datetime: "2026-03-30T04:00:00Z",
              participants: [
                { display_name: "Member One", participant_type: "member" as const, is_primary: true },
                { display_name: "Guest One", participant_type: "guest" as const, is_primary: false },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("AdminGolfTeeSheetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        user: { display_name: "Club Admin" },
      },
    });

    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "North" }],
    });

    mockUseTeeSheetDayQuery.mockReturnValue({
      data: teeSheetPayload,
      isLoading: false,
      error: null,
    });

    mockUseClubDirectoryQuery.mockReturnValue({
      data: [
        {
          person: { id: "person-1", full_name: "Member One" },
          membership: { role: "MEMBER" },
        },
        {
          person: { id: "person-2", full_name: "Staff One" },
          membership: { role: "CLUB_STAFF" },
        },
      ],
    });
  });

  test("creates a booking from an open slot through the backend endpoint", async () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        ...teeSheetPayload,
        rows: [
          {
            ...teeSheetPayload.rows[0],
            slots: [
              {
                ...teeSheetPayload.rows[0].slots[0],
                bookings: [],
                party_summary: {
                  member_count: 0,
                  guest_count: 0,
                  staff_count: 0,
                  total_players: 0,
                  has_activity: false,
                },
                occupancy: {
                  ...teeSheetPayload.rows[0].slots[0].occupancy,
                  occupied_player_count: 0,
                  reserved_player_count: 0,
                  confirmed_booking_count: 0,
                  reserved_booking_count: 0,
                  remaining_player_capacity: 4,
                },
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    vi.mocked(createBooking).mockResolvedValue({
      decision: "allowed",
      booking: {
        id: "booking-2",
        status: "reserved",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      availability: {
        applies_to: "member",
        availability_status: "allowed",
        blockers: [],
        warnings: [],
        resolved_checks: [{ code: "slot_capacity_available", reason: "Capacity available", details: {} }],
        unresolved_checks: [],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /create booking for blue 06:00/i }));
    expect(await screen.findByRole("heading", { name: "Create Booking" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/club person/i), { target: { value: "person-1" } });
    fireEvent.click(screen.getByRole("button", { name: /add participant/i }));
    fireEvent.change(screen.getAllByLabelText(/participant type/i)[1], { target: { value: "guest" } });
    fireEvent.change(screen.getByPlaceholderText(/guest name/i), { target: { value: "Guest One" } });
    fireEvent.click(screen.getByRole("button", { name: /^create booking$/i }));

    await waitFor(() => {
      expect(createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          course_id: "course-1",
          tee_id: "tee-1",
          slot_datetime: "2026-03-30T04:00:00Z",
          applies_to: "member",
          participants: [
            { participant_type: "member", person_id: "person-1", guest_name: null, is_primary: true },
            { participant_type: "guest", person_id: null, guest_name: "Guest One", is_primary: false },
          ],
        }),
        {
          accessToken: "token",
          selectedClubId: "club-1",
        },
      );
    });

    expect(await screen.findByText("Booking created. Tee sheet refreshed from backend state.")).toBeInTheDocument();
  });

  test("opens the booking drawer and cancels through the backend endpoint", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: {
        id: "booking-1",
        status: "cancelled",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));

    expect(await screen.findByText("Booking Management")).toBeInTheDocument();
    expect(screen.getByText("Booking booking-")).toBeInTheDocument();
    expect(screen.getByText(/Member One, Guest One/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel booking/i }));

    await waitFor(() => {
      expect(cancelBooking).toHaveBeenCalledWith("booking-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });

    expect(
      await screen.findByText("Booking cancelled. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("keeps the drawer open when the backend blocks cancellation", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "blocked",
      transition_applied: false,
      booking: {
        id: "booking-1",
        status: "checked_in",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [
        {
          code: "booking_status_not_cancellable",
          message: "Only reserved bookings may transition to cancelled in this phase",
          current_status: "checked_in",
        },
      ],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /cancel booking/i }));

    expect(
      await screen.findByText("Only reserved bookings may transition to cancelled in this phase"),
    ).toBeInTheDocument();
    expect(screen.getByText("Booking Management")).toBeInTheDocument();
  });

  test("shows the idempotent no-show notice through the shared lifecycle handler", async () => {
    vi.mocked(markBookingNoShow).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: false,
      booking: {
        id: "booking-1",
        status: "no_show",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^mark no-show$/i }));

    expect(
      await screen.findByText("Booking was already marked no-show. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("checks in a reserved booking through the backend endpoint", async () => {
    vi.mocked(checkInBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: {
        id: "booking-1",
        status: "checked_in",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^check in$/i }));

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledWith("booking-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });

    expect(
      await screen.findByText("Booking checked in. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("hides the check-in action for non-reserved bookings", async () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        ...teeSheetPayload,
        rows: [
          {
            ...teeSheetPayload.rows[0],
            slots: [
              {
                ...teeSheetPayload.rows[0].slots[0],
                bookings: [
                  {
                    ...teeSheetPayload.rows[0].slots[0].bookings[0],
                    status: "checked_in" as const,
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));

    expect(await screen.findByText("Booking Management")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^check in$/i })).not.toBeInTheDocument();
  });

  test("completes a checked-in booking through the backend endpoint", async () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        ...teeSheetPayload,
        rows: [
          {
            ...teeSheetPayload.rows[0],
            slots: [
              {
                ...teeSheetPayload.rows[0].slots[0],
                occupancy: {
                  ...teeSheetPayload.rows[0].slots[0].occupancy,
                  occupied_player_count: 2,
                  reserved_player_count: 0,
                  confirmed_booking_count: 1,
                  reserved_booking_count: 0,
                },
                bookings: [
                  {
                    ...teeSheetPayload.rows[0].slots[0].bookings[0],
                    status: "checked_in" as const,
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    vi.mocked(completeBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: {
        id: "booking-1",
        status: "completed",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^complete booking$/i }));

    await waitFor(() => {
      expect(completeBooking).toHaveBeenCalledWith("booking-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });

    expect(
      await screen.findByText("Booking completed. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("keeps the drawer open when the backend blocks completion", async () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        ...teeSheetPayload,
        rows: [
          {
            ...teeSheetPayload.rows[0],
            slots: [
              {
                ...teeSheetPayload.rows[0].slots[0],
                occupancy: {
                  ...teeSheetPayload.rows[0].slots[0].occupancy,
                  occupied_player_count: 2,
                  reserved_player_count: 0,
                  confirmed_booking_count: 1,
                  reserved_booking_count: 0,
                },
                bookings: [
                  {
                    ...teeSheetPayload.rows[0].slots[0].bookings[0],
                    status: "checked_in" as const,
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    vi.mocked(completeBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "blocked",
      transition_applied: false,
      booking: {
        id: "booking-1",
        status: "reserved",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [
        {
          code: "booking_status_not_completable",
          message: "Only checked_in bookings may transition to completed in this phase",
          current_status: "reserved",
        },
      ],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^complete booking$/i }));

    expect(
      await screen.findByText("Only checked_in bookings may transition to completed in this phase"),
    ).toBeInTheDocument();
    expect(screen.getByText("Booking Management")).toBeInTheDocument();
  });

  test("hides the complete action for non-checked-in bookings", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));

    expect(await screen.findByText("Booking Management")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^complete booking$/i })).not.toBeInTheDocument();
  });

  test("marks a reserved booking as no-show through the backend endpoint", async () => {
    vi.mocked(markBookingNoShow).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: {
        id: "booking-1",
        status: "no_show",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^mark no-show$/i }));

    await waitFor(() => {
      expect(markBookingNoShow).toHaveBeenCalledWith("booking-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });

    expect(
      await screen.findByText("Booking marked no-show. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("disables the reserved-booking actions coherently while a no-show request is pending", async () => {
    const deferred = deferredPromise<BookingNoShowResult>();
    vi.mocked(markBookingNoShow).mockReturnValue(deferred.promise);

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^mark no-show$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^check in$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^mark no-show$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^cancel booking$/i })).toBeDisabled();
    });

    deferred.resolve({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: {
        id: "booking-1",
        status: "no_show",
        party_size: 2,
        slot_datetime: "2026-03-30T04:00:00Z",
        participants: [
          { display_name: "Member One", participant_type: "member", is_primary: true },
          { display_name: "Guest One", participant_type: "guest", is_primary: false },
        ],
      },
      failures: [],
    });

    expect(
      await screen.findByText("Booking marked no-show. Tee sheet refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("hides the no-show action for non-reserved bookings", async () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        ...teeSheetPayload,
        rows: [
          {
            ...teeSheetPayload.rows[0],
            slots: [
              {
                ...teeSheetPayload.rows[0].slots[0],
                bookings: [
                  {
                    ...teeSheetPayload.rows[0].slots[0].bookings[0],
                    status: "checked_in" as const,
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /manage bookings for blue 06:00/i }));

    expect(await screen.findByText("Booking Management")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^mark no-show$/i })).not.toBeInTheDocument();
  });
});
