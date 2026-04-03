import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkInBooking,
  createBooking,
  moveBooking,
  updateBooking,
} from "../api/operations";
import { AdminGolfTeeSheetPage } from "./admin-golf-tee-sheet-page";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
  useTeesQuery: () => mockUseTeesQuery(),
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
  moveBooking: vi.fn(),
  updateBooking: vi.fn(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter initialEntries={["/admin/golf/tee-sheet"]}>
      <QueryClientProvider client={queryClient}>
        <AdminGolfTeeSheetPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
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
      row_key: "blue-hole-1",
      tee_id: "tee-1",
      start_lane: "hole_1" as const,
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
            occupied_player_count: 2,
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
            unresolved_count: 0,
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
              start_lane: "hole_1" as const,
              fee_label: "Member Weekend Rate",
              payment_status: "pending" as const,
              cart_flag: true,
              caddie_flag: false,
              participants: [
                { display_name: "Member One", participant_type: "member" as const, is_primary: true },
                { display_name: "Guest One", participant_type: "guest" as const, is_primary: false },
              ],
            },
          ],
        },
      ],
    },
    {
      row_key: "blue-hole-10",
      tee_id: "tee-1",
      start_lane: "hole_10" as const,
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
            applies_to: "member" as const,
            availability_status: "allowed",
            blocker_count: 0,
            unresolved_count: 0,
            warning_count: 0,
          },
          blockers: [],
          unresolved_checks: [],
          warnings: [],
          bookings: [],
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
        selected_club: { id: "club-1", name: "Club One" },
        user: { display_name: "Club Admin" },
      },
    });
    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "North" }],
      isLoading: false,
      error: null,
    });
    mockUseTeesQuery.mockReturnValue({
      data: [{ id: "tee-1", course_id: "course-1", active: true }],
      isLoading: false,
      error: null,
    });
    mockUseTeeSheetDayQuery.mockReturnValue({ data: teeSheetPayload, isLoading: false, error: null });
    mockUseClubDirectoryQuery.mockReturnValue({
      data: [{ person: { id: "person-1", full_name: "Member One" }, membership: { role: "MEMBER" } }],
    });
  });

  test("shows setup guidance when the club has no courses", () => {
    mockUseCoursesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseTeesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseTeeSheetDayQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    renderPage();

    expect(screen.getByText("No courses are configured for this club.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open golf settings/i })).toHaveAttribute("href", "/admin/golf/settings");
    expect(screen.queryByText("Showing 2 of 2 lane slots")).not.toBeInTheDocument();
  });

  test("shows setup guidance when the selected course has no active tees", () => {
    mockUseTeesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockUseTeeSheetDayQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    renderPage();

    expect(screen.getByText("This course has no active tees.")).toBeInTheDocument();
    expect(screen.getByText(/without at least one active tee definition/i)).toBeInTheDocument();
  });

  test("renders time-first lanes and commercial hooks from backend payload", async () => {
    renderPage();

    expect(screen.getByText("1st Tee")).toBeInTheDocument();
    expect(screen.getByText("10th Tee")).toBeInTheDocument();
    expect(screen.getByText("06:00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i }));

    expect((await screen.findAllByText("Member Weekend Rate")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cart").length).toBeGreaterThan(0);
  });

  test("dispatches backend move with lane-aware target on drop", async () => {
    vi.mocked(moveBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: null,
      failures: [],
    });

    renderPage();

    fireEvent.dragStart(screen.getByRole("button", { name: /open booking booking-1/i }));
    const targetRow = screen.getByLabelText(/10th tee lane row 06:00/i);
    fireEvent.dragEnter(targetRow);
    fireEvent.dragOver(targetRow);
    fireEvent.drop(targetRow);

    await waitFor(() => {
      expect(moveBooking).toHaveBeenCalledWith(
        "booking-1",
        expect.objectContaining({
          target_slot_datetime: "2026-03-30T04:00:00Z",
          target_start_lane: "hole_10",
          target_tee_id: "tee-1",
        }),
        expect.anything(),
      );
    });
  });

  test("keeps lifecycle actions in the existing drawer flow", async () => {
    vi.mocked(checkInBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: null,
      failures: [],
    });
    vi.mocked(createBooking).mockResolvedValue({
      decision: "allowed",
      booking: null,
      availability: null,
      failures: [],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /check in/i }));

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledWith("booking-1", expect.anything());
    });
  });

  test("edits a reserved booking party through the drawer and sends backend intent", async () => {
    vi.mocked(updateBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      booking: null,
      availability: null,
      failures: [],
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /edit booking booking-1/i }));
    fireEvent.click(screen.getByRole("button", { name: /save booking booking-1/i }));

    await waitFor(() => {
      expect(updateBooking).toHaveBeenCalledWith(
        "booking-1",
        expect.objectContaining({
          participants: expect.any(Array),
        }),
        expect.anything(),
      );
    });
  });
});
