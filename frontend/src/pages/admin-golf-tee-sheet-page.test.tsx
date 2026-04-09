import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkInBooking,
  createBooking,
  moveBooking,
  postBookingCharge,
  recordBookingPayment,
  updateBookingPaymentStatus,
  updateBooking,
} from "../api/operations";
import { AdminGolfTeeSheetPage, deriveBookingNextAction, nearestBucketTime, optimisticallyTransitionBooking } from "./admin-golf-tee-sheet-page";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockTeeSheetDayQueryOptions = vi.fn();
const scrollIntoViewMock = vi.fn();
const scrollToMock = vi.fn();

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
    day: (clubId: string, courseId: string, day: string, membershipType: string, teeId?: string | null) => [
      "tee-sheet",
      clubId,
      courseId,
      day,
      membershipType,
      teeId ?? "all-tees",
    ],
  },
  teeSheetDayQueryOptions: (...args: unknown[]) => mockTeeSheetDayQueryOptions(...args),
  useTeeSheetDayQuery: () => mockUseTeeSheetDayQuery(),
}));

vi.mock("../api/operations", () => ({
  cancelBooking: vi.fn(),
  checkInBooking: vi.fn(),
  completeBooking: vi.fn(),
  createBooking: vi.fn(),
  markBookingNoShow: vi.fn(),
  moveBooking: vi.fn(),
  postBookingCharge: vi.fn(),
  recordBookingPayment: vi.fn(),
  updateBookingPaymentStatus: vi.fn(),
  updateBooking: vi.fn(),
}));

function renderPage(
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
  initialEntry = "/admin/golf/tee-sheet",
): QueryClient {

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <AdminGolfTeeSheetPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return queryClient;
}

function openFiltersView(): void {
  fireEvent.click(screen.getByTestId("filters-view-toggle"));
}

function cloneTeeSheetPayload(): any {
  return JSON.parse(JSON.stringify(teeSheetPayload));
}

function cloneDuplicateLanePayload(): any {
  const payload = cloneTeeSheetPayload();
  payload.rows.push(
    {
      row_key: "white-hole-1",
      tee_id: "tee-2",
      start_lane: "hole_1",
      label: "White",
      color_code: "#d9d9d9",
      slots: payload.rows[0].slots.map((slot: any) => ({
        ...slot,
        bookings: [],
        occupancy: {
          ...slot.occupancy,
          occupied_player_count: 0,
          reserved_player_count: 0,
          confirmed_booking_count: 0,
          reserved_booking_count: 0,
          remaining_player_capacity: slot.occupancy.player_capacity,
        },
        party_summary: {
          ...slot.party_summary,
          member_count: 0,
          guest_count: 0,
          staff_count: 0,
          total_players: 0,
          has_activity: false,
        },
      })),
    },
    {
      row_key: "white-hole-10",
      tee_id: "tee-2",
      start_lane: "hole_10",
      label: "White",
      color_code: "#d9d9d9",
      slots: payload.rows[1].slots.map((slot: any) => ({
        ...slot,
        bookings: [],
        occupancy: {
          ...slot.occupancy,
          occupied_player_count: 0,
          reserved_player_count: 0,
          confirmed_booking_count: 0,
          reserved_booking_count: 0,
          remaining_player_capacity: slot.occupancy.player_capacity,
        },
        party_summary: {
          ...slot.party_summary,
          member_count: 0,
          guest_count: 0,
          staff_count: 0,
          total_players: 0,
          has_activity: false,
        },
      })),
    },
  );
  return payload;
}

function teeSheetDayKey(date: string, membershipType = "staff", teeId: string | null = null): string[] {
  return ["tee-sheet", "club-1", "course-1", date, membershipType, teeId ?? "all-tees"];
}

function testLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addTestDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return testLocalDateString(date);
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
        {
          slot_datetime: "2026-03-30T04:10:00Z",
          local_time: "06:10:00",
          display_status: "reserved" as const,
          state_flags: { event_controlled: true },
          occupancy: {
            player_capacity: 4,
            occupied_player_count: 0,
            reserved_player_count: 4,
            confirmed_booking_count: 0,
            reserved_booking_count: 1,
            remaining_player_capacity: 0,
          },
          party_summary: {
            member_count: 4,
            guest_count: 0,
            staff_count: 0,
            total_players: 4,
            has_activity: true,
          },
          policy_summary: {
            applies_to: "member" as const,
            availability_status: "blocked",
            blocker_count: 1,
            unresolved_count: 0,
            warning_count: 0,
          },
          blockers: [],
          unresolved_checks: [],
          warnings: [],
          bookings: [
            {
              id: "booking-2",
              status: "reserved" as const,
              party_size: 4,
              slot_datetime: "2026-03-30T04:10:00Z",
              start_lane: "hole_1" as const,
              fee_label: "Golf Day Allocation",
              payment_status: "paid" as const,
              cart_flag: true,
              caddie_flag: false,
              participants: [
                { display_name: "Event One", participant_type: "member" as const, is_primary: true },
                { display_name: "Event Two", participant_type: "member" as const, is_primary: false },
                { display_name: "Event Three", participant_type: "member" as const, is_primary: false },
                { display_name: "Event Four", participant_type: "member" as const, is_primary: false },
              ],
            },
          ],
        },
        {
          slot_datetime: "2026-03-30T04:20:00Z",
          local_time: "06:20:00",
          display_status: "blocked" as const,
          state_flags: { manually_blocked: true },
          occupancy: {
            player_capacity: 4,
            occupied_player_count: 0,
            reserved_player_count: 0,
            confirmed_booking_count: 0,
            reserved_booking_count: 0,
            remaining_player_capacity: 0,
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
            availability_status: "blocked",
            blocker_count: 1,
            unresolved_count: 0,
            warning_count: 0,
          },
          blockers: [{ code: "manual_block", reason: "Closed for maintenance", details: {} }],
          unresolved_checks: [],
          warnings: [],
          bookings: [],
        },
        {
          slot_datetime: "2026-03-30T04:30:00Z",
          local_time: "06:30:00",
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
        {
          slot_datetime: "2026-03-30T04:10:00Z",
          local_time: "06:10:00",
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
        {
          slot_datetime: "2026-03-30T04:20:00Z",
          local_time: "06:20:00",
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
        {
          slot_datetime: "2026-03-30T04:30:00Z",
          local_time: "06:30:00",
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
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
      writable: true,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollToMock,
      writable: true,
    });
    mockUseSession.mockReturnValue({
      accessToken: "token",
      initialized: true,
      loading: false,
      bootstrap: {
        feature_flags: { ux_rebuild_v1: true },
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
    mockTeeSheetDayQueryOptions.mockImplementation(
      ({ selectedClubId, courseId, date, membershipType, teeId }: { selectedClubId: string; courseId: string; date: string; membershipType: string; teeId?: string | null }) => ({
        queryKey: ["tee-sheet", selectedClubId, courseId, date, membershipType, teeId ?? "all-tees"],
        queryFn: vi.fn().mockResolvedValue(teeSheetPayload),
        staleTime: 60_000,
      }),
    );
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

  test("applies the no-show risk URL filter from dashboard deep links", () => {
    const payload = cloneTeeSheetPayload();
    payload.reference_datetime = "2026-03-30T04:15:00Z";
    mockUseTeeSheetDayQuery.mockReturnValue({ data: payload, isLoading: false, error: null });

    renderPage(undefined, "/admin/golf/tee-sheet?filter=no-shows");

    openFiltersView();
    expect(screen.getByRole("button", { name: "No-Show Risk" })).toHaveClass("bg-primary", "text-white");
    expect(screen.getByText("Member One")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create booking for 1st tee 06:30/i })).not.toBeInTheDocument();
  });

  test("derives a single operational next action from booking state", () => {
    expect(deriveBookingNextAction({ payment_status: "pending", slot_datetime: "2026-03-30T04:00:00Z", status: "reserved" }, "2026-03-30T03:30:00Z")).toBe("needs_payment");
    expect(deriveBookingNextAction({ payment_status: "paid", slot_datetime: "2026-03-30T04:00:00Z", status: "reserved" }, "2026-03-30T03:30:00Z")).toBe("ready_to_check_in");
    expect(deriveBookingNextAction({ payment_status: "paid", slot_datetime: "2026-03-30T04:00:00Z", status: "reserved" }, "2026-03-30T04:15:00Z")).toBe("at_risk");
    expect(deriveBookingNextAction({ payment_status: "paid", slot_datetime: "2026-03-30T04:00:00Z", status: "completed" }, "2026-03-30T04:15:00Z")).toBe("completed");
  });

  test("renders time-first lanes and commercial hooks from backend payload", async () => {
    renderPage();

    expect(screen.getByRole("table")).toHaveClass("table-fixed");
    expect(screen.getAllByText("Player 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Player 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Player 3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Player 4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1st Tee").length).toBeGreaterThan(0);
    expect(screen.getAllByText("10th Tee").length).toBeGreaterThan(0);
    expect(screen.getAllByText("06:00").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /open booking booking-1/i })).toBeInTheDocument();
    expect(screen.getByText("Member One")).toBeInTheDocument();
    expect(screen.getByText("Guest One")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /create booking for 1st tee 06:00/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i }));

    expect((await screen.findAllByText("Member Weekend Rate")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cart").length).toBeGreaterThan(0);
  });

  test("groups duplicate tee rows into one lane per time row across both layouts", () => {
    mockUseTeesQuery.mockReturnValue({
      data: [
        { id: "tee-1", course_id: "course-1", active: true },
        { id: "tee-2", course_id: "course-1", active: true },
      ],
      isLoading: false,
      error: null,
    });
    mockUseTeeSheetDayQuery.mockReturnValue({ data: cloneDuplicateLanePayload(), isLoading: false, error: null });

    renderPage();

    expect(screen.getAllByLabelText(/lane row 06:00/i)).toHaveLength(2);

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    expect(screen.getAllByTestId("timeline-lane-row-hole_1")).toHaveLength(1);
    expect(screen.getAllByTestId("timeline-lane-row-hole_10")).toHaveLength(1);
    expect(screen.queryByText("White")).not.toBeInTheDocument();
  });

  test("renders the cockpit operate header when the rebuild flag is enabled", () => {
    renderPage();

    expect(screen.getByTestId("tee-sheet-toolbar")).toHaveClass("sticky", "top-20");
    expect(screen.getByTestId("operate-header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Booking/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Close Day/i })).toHaveAttribute("href", "/admin/finance");
    expect(screen.getByPlaceholderText("Search players, bookings, or time")).toBeInTheDocument();
    expect(screen.getByTestId("filters-view-toggle")).toBeInTheDocument();
    expect(screen.getByText("Occupancy")).toBeInTheDocument();
    expect(screen.getAllByText("Unpaid").length).toBeGreaterThan(0);
    expect(screen.getByText("Warnings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No-shows/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Arrivals Due/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Competitions/i })).toBeInTheDocument();
  });

  test("keeps the legacy toolbar when the rebuild flag is disabled", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      initialized: true,
      loading: false,
      bootstrap: {
        feature_flags: {},
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One" },
        user: { display_name: "Club Admin" },
      },
    });

    renderPage();

    expect(screen.queryByTestId("operate-header")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next Available/i })).toBeInTheDocument();
    expect(screen.getByText("Filters & View")).toBeInTheDocument();
  });

  test("uses preset chips to drive the existing filter layer", () => {
    const payload = cloneTeeSheetPayload();
    payload.reference_datetime = "2026-03-30T04:15:00Z";
    mockUseTeeSheetDayQuery.mockReturnValue({ data: payload, isLoading: false, error: null });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /No-shows/i }));
    openFiltersView();

    expect(screen.getByRole("button", { name: "No-Show Risk" })).toHaveClass("bg-primary", "text-white");
    expect(screen.getByText("Member One")).toBeInTheDocument();
  });

  test("opens the existing create drawer from the cockpit primary action", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /\+ Booking/i }));

    const drawer = await screen.findByRole("heading", { name: "Create Booking" });
    expect(drawer).toBeInTheDocument();
  });

  test("runs finance actions through the booking drawer and invalidates the tee sheet query", async () => {
    vi.mocked(updateBookingPaymentStatus).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      update_applied: true,
      booking: {
        ...teeSheetPayload.rows[0].slots[0].bookings[0],
        id: "booking-1",
        club_id: "club-1",
        course_id: "course-1",
        slot_interval_minutes: 30,
        source: "admin",
        created_at: "2026-03-25T06:00:00Z",
        updated_at: "2026-03-25T06:00:00Z",
      },
      failures: [],
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderPage(queryClient);

    fireEvent.click(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Mark Complimentary/i }));

    await waitFor(() => {
      expect(updateBookingPaymentStatus).toHaveBeenCalledWith(
        "booking-1",
        { payment_status: "complimentary" },
        { accessToken: "token", selectedClubId: "club-1" },
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: teeSheetDayKey(testLocalDateString(new Date()), "staff", null),
      });
    });
  });

  test("opens secondary controls from the filters and view panel only", () => {
    renderPage();

    expect(screen.queryByTestId("filters-view-panel")).not.toBeInTheDocument();

    openFiltersView();

    expect(screen.getByTestId("filters-view-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  test("removes tee and participant controls from the tee-sheet surface", () => {
    renderPage();

    expect(screen.queryByText("View As")).not.toBeInTheDocument();
    expect(screen.queryByText("Type")).not.toBeInTheDocument();
    expect(screen.queryByText("All Tees")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Staff" })).not.toBeInTheDocument();
  });

  test("filters the sheet to open sellable slots", () => {
    renderPage();

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Open Slots" }));

    expect(screen.getByLabelText(/10th tee lane row 06:20/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/1st tee lane row 06:30/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/1st tee lane row 06:10/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/1st tee lane row 06:20/i)).not.toBeInTheDocument();
  });

  test("filters the sheet to golf day allocations", () => {
    renderPage();

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Golf Day" }));

    expect(screen.getByLabelText(/1st tee lane row 06:10/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/10th tee lane row 06:10/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/1st tee lane row 06:20/i)).not.toBeInTheDocument();
  });

  test("filters the sheet to closed or held lanes", () => {
    renderPage();

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Closed / Holds" }));

    expect(screen.getByLabelText(/1st tee lane row 06:10/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/1st tee lane row 06:20/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/10th tee lane row 06:20/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/1st tee lane row 06:30/i)).not.toBeInTheDocument();
  });

  test("opens the create drawer for remaining player capacity on a partially filled slot", async () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /create booking for 1st tee 06:00/i })[0]);

    expect(await screen.findByRole("heading", { name: /create booking/i })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /^check in$/i }));

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledWith("booking-1", expect.anything());
    });
  });

  test("fires quick chip actions without opening the management drawer", async () => {
    vi.mocked(checkInBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: null,
      failures: [],
    });

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /check in booking booking-1/i })[0]);

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledWith("booking-1", expect.anything());
    });
    expect(screen.queryByRole("heading", { name: /booking management/i })).not.toBeInTheDocument();
    expect(await screen.findByText("Booking checked in. Tee sheet refreshed from backend state.")).toBeInTheDocument();
  });

  test("disables invalid quick chip actions from the current backend booking state", () => {
    const payload = cloneTeeSheetPayload();
    payload.rows[0].slots[0].bookings[0].status = "checked_in";
    mockUseTeeSheetDayQuery.mockReturnValue({ data: payload, isLoading: false, error: null });

    renderPage();

    screen.getAllByRole("button", { name: /check in booking booking-1/i }).forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole("button", { name: /no-show booking booking-1/i }).forEach((button) => expect(button).toBeDisabled());
    screen.getAllByRole("button", { name: /cancel booking booking-1/i }).forEach((button) => expect(button).toBeDisabled());
  });

  test("checks in all reserved bookings in a time bucket and surfaces partial failures", async () => {
    const payload = cloneTeeSheetPayload();
    payload.rows[1].slots[0].bookings = [
      {
        id: "booking-3",
        status: "reserved",
        party_size: 1,
        slot_datetime: "2026-03-30T04:00:00Z",
        start_lane: "hole_10",
        fee_label: "Member Rate",
        payment_status: "paid",
        cart_flag: false,
        caddie_flag: false,
        participants: [{ display_name: "Member Three", participant_type: "member", is_primary: true }],
      },
    ];
    payload.rows[1].slots[0].occupancy.reserved_player_count = 1;
    payload.rows[1].slots[0].occupancy.reserved_booking_count = 1;
    payload.rows[1].slots[0].party_summary.member_count = 1;
    payload.rows[1].slots[0].party_summary.total_players = 1;
    payload.rows[1].slots[0].party_summary.has_activity = true;
    mockUseTeeSheetDayQuery.mockReturnValue({ data: payload, isLoading: false, error: null });
    vi.mocked(checkInBooking)
      .mockResolvedValueOnce({
        booking_id: "booking-1",
        decision: "allowed",
        transition_applied: true,
        booking: null,
        failures: [],
      })
      .mockResolvedValueOnce({
        booking_id: "booking-3",
        decision: "blocked",
        transition_applied: false,
        booking: null,
        failures: [{ code: "booking_status_not_eligible", message: "Only reserved bookings may be checked in." }],
      });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /check in all reserved bookings at 06:00/i }));

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Check In All completed 1/2. Only reserved bookings may be checked in.")).toBeInTheDocument();
  });

  test("optimistically updates lifecycle cache data and rolls back on error", async () => {
    const today = testLocalDateString(new Date());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(teeSheetDayKey(today), cloneTeeSheetPayload());

    let rejectCheckIn!: (error: Error) => void;
    vi.mocked(checkInBooking).mockReturnValue(
      new Promise((_, reject: (error: Error) => void) => {
        rejectCheckIn = reject;
      }) as ReturnType<typeof checkInBooking>,
    );

    renderPage(queryClient);
    await waitFor(() => {
      expect(screen.getByTestId("tee-sheet-toolbar")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("button", { name: /check in booking booking-1/i })[0]);

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<any>(teeSheetDayKey(today));
      expect(optimistic.rows[0].slots[0].bookings[0].status).toBe("checked_in");
      expect(optimistic.rows[0].slots[0].occupancy.reserved_player_count).toBe(0);
      expect(optimistic.rows[0].slots[0].occupancy.occupied_player_count).toBe(2);
    });

    rejectCheckIn(new Error("network down"));

    await waitFor(() => {
      const rolledBack = queryClient.getQueryData<any>(teeSheetDayKey(today));
      expect(rolledBack.rows[0].slots[0].bookings[0].status).toBe("reserved");
      expect(rolledBack.rows[0].slots[0].occupancy.reserved_player_count).toBe(2);
      expect(rolledBack.rows[0].slots[0].occupancy.occupied_player_count).toBe(0);
    });
  });

  test("only applies deterministic optimistic lifecycle transitions", () => {
    const reservedPayload = cloneTeeSheetPayload();
    const checkedInPayload = cloneTeeSheetPayload();
    checkedInPayload.rows[0].slots[0].bookings[0].status = "checked_in";
    checkedInPayload.rows[0].slots[0].occupancy.occupied_player_count = 2;
    checkedInPayload.rows[0].slots[0].occupancy.reserved_player_count = 0;
    checkedInPayload.rows[0].slots[0].occupancy.confirmed_booking_count = 1;
    checkedInPayload.rows[0].slots[0].occupancy.reserved_booking_count = 0;

    expect(optimisticallyTransitionBooking(reservedPayload, "booking-1", "check_in")?.rows[0].slots[0].bookings[0].status).toBe("checked_in");
    expect(optimisticallyTransitionBooking(reservedPayload, "booking-1", "cancel")?.rows[0].slots[0].bookings[0].status).toBe("cancelled");
    expect(optimisticallyTransitionBooking(reservedPayload, "booking-1", "no_show")?.rows[0].slots[0].bookings[0].status).toBe("no_show");
    expect(optimisticallyTransitionBooking(checkedInPayload, "booking-1", "complete")?.rows[0].slots[0].bookings[0].status).toBe("completed");
    expect(optimisticallyTransitionBooking(checkedInPayload, "booking-1", "cancel")).toBe(checkedInPayload);
  });

  test("prefetches adjacent days after the current day loads", async () => {
    const today = testLocalDateString(new Date());
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const prefetchSpy = vi.spyOn(queryClient, "prefetchQuery");

    renderPage(queryClient);
    await waitFor(() => {
      expect(screen.getByTestId("tee-sheet-toolbar")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(prefetchSpy).toHaveBeenCalledTimes(2);
    });
    expect(mockTeeSheetDayQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "course-1", date: addTestDays(today, -1), membershipType: "staff", teeId: null }),
    );
    expect(mockTeeSheetDayQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: "course-1", date: addTestDays(today, 1), membershipType: "staff", teeId: null }),
    );
  });

  test("debounces search, shows an honest no-results state, and clears back to the live sheet", async () => {
    vi.useFakeTimers({ now: new Date("2026-03-30T12:00:00.000Z") });
    try {
      renderPage();

      const search = screen.getByPlaceholderText(/search players, bookings, or time/i);
      fireEvent.change(search, { target: { value: "zzz" } });

      expect(screen.getByLabelText(/1st tee lane row 06:00/i)).toBeInTheDocument();

      vi.advanceTimersByTime(200);
      await Promise.resolve();
      expect(screen.getByText(/No results match "zzz" on this view/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /clear tee-sheet search/i }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
      expect(screen.queryByText(/No results match "zzz" on this view/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/1st tee lane row 06:00/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("supports keyboard shortcuts while avoiding interference with active text entry", async () => {
    vi.useFakeTimers({ now: new Date("2026-04-08T12:00:00.000Z") });
    try {
      renderPage();
      // Date is surfaced via a custom calendar popover button (5.6) — verify using long date text.
      expect(screen.getAllByText("April 8, 2026").length).toBeGreaterThan(0);

      // "/" focuses search input
      fireEvent.keyDown(window, { key: "/" });
      expect(screen.getByPlaceholderText(/search players, bookings, or time/i)).toHaveFocus();

      // ArrowRight while search is focused does NOT change date
      fireEvent.keyDown(screen.getByPlaceholderText(/search players, bookings, or time/i), { key: "ArrowRight" });
      expect(screen.getAllByText("April 8, 2026").length).toBeGreaterThan(0);

      // ArrowRight from window advances date by 1
      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(screen.getAllByText("April 9, 2026").length).toBeGreaterThan(0);

      // T returns to today
      fireEvent.keyDown(window, { key: "t" });
      expect(screen.getAllByText("April 8, 2026").length).toBeGreaterThan(0);

      // D toggles the calendar popover open
      fireEvent.keyDown(window, { key: "d" });
      expect(screen.getByRole("button", { name: /open date picker/i })).toHaveAttribute("aria-expanded", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  test("closes the topmost drawer on Escape and traps focus within the drawer", async () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /create booking for 1st tee 06:00/i })[0]);

    const closeButton = await screen.findByRole("button", { name: /^close create booking drawer$/i });
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    const createButton = screen.getByRole("button", { name: /^create booking$/i });
    createButton.focus();
    expect(createButton).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("date navigation", () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date("2026-04-04T12:00:00.000Z") });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    test("displays today's date on initial render", () => {
      renderPage();
      // dateLabel formats with en-US locale; in UTC test env "2026-04-04T00:00:00" = April 4
      expect(screen.getAllByText("April 4, 2026").length).toBeGreaterThan(0);
    });

    test("picks the tee time nearest the current clock time", () => {
      vi.setSystemTime(new Date("2026-04-04T12:07:00.000Z"));

      expect(
        nearestBucketTime(
          [
            { localTime: "06:00:00" },
            { localTime: "12:00:00" },
            { localTime: "15:00:00" },
          ],
          "UTC",
        ),
      ).toBe("12:00");
    });

    test("next day button advances the selected date by one day", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Next day" }));
      expect(screen.getAllByText("April 5, 2026").length).toBeGreaterThan(0);
    });

    test("previous day button moves the selected date back by one day", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
      expect(screen.getAllByText("April 3, 2026").length).toBeGreaterThan(0);
    });

    test("next and previous are symmetric — two forward then two back returns to today", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Next day" }));
      fireEvent.click(screen.getByRole("button", { name: "Next day" }));
      fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
      fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
      expect(screen.getAllByText("April 4, 2026").length).toBeGreaterThan(0);
    });

    test("Today button returns to current date after navigating forward", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Next day" }));
      expect(screen.getAllByText("April 5, 2026").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "Today" }));
      expect(screen.getAllByText("April 4, 2026").length).toBeGreaterThan(0);
    });

    test("future date navigation is not blocked by the frontend", () => {
      renderPage();
      // Advance 30 days forward — no frontend cap should prevent this
      for (let i = 0; i < 30; i++) {
        fireEvent.click(screen.getByRole("button", { name: "Next day" }));
      }
      expect(screen.getAllByText("May 4, 2026").length).toBeGreaterThan(0);
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

  test("includes cart and caddie intent in the create flow payload", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      decision: "allowed",
      booking: null,
      availability: null,
      failures: [],
    });

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /create booking for 1st tee 06:00/i })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /^cart$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^caddie$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create booking$/i }));

    await waitFor(() => {
      expect(createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          cart_flag: true,
          caddie_flag: true,
        }),
        expect.anything(),
      );
    });
  });

  test("includes cart and caddie intent in the edit flow payload", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /^cart$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^caddie$/i }));
    fireEvent.click(screen.getByRole("button", { name: /save booking booking-1/i }));

    await waitFor(() => {
      expect(updateBooking).toHaveBeenCalledWith(
        "booking-1",
        expect.objectContaining({
          cart_flag: false,
          caddie_flag: true,
        }),
        expect.anything(),
      );
    });
  });

  test("booking cards are draggable in classic mode", () => {
    renderPage();

    expect(screen.getByRole("button", { name: /open booking booking-1/i })).toHaveAttribute("draggable", "true");
  });

  test("clicking a booking card opens details instead of moving the booking", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /open booking booking-1/i }));

    expect((await screen.findAllByText("Member Weekend Rate")).length).toBeGreaterThan(0);
    expect(moveBooking).not.toHaveBeenCalled();
  });

  test("toggles timeline layout and persists the feature flag", () => {
    renderPage();

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    expect(localStorage.getItem("gl-tee-sheet-layout")).toBe("timeline");
    expect(screen.getByTestId("tee-sheet-swimlane-grid")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("only the active layout renders the expensive tee-sheet surface", () => {
    renderPage();

    expect(screen.getByTestId("classic-tee-sheet-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("tee-sheet-swimlane-grid")).not.toBeInTheDocument();

    openFiltersView();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    expect(screen.getByTestId("tee-sheet-swimlane-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("classic-tee-sheet-grid")).not.toBeInTheDocument();
  });

  test("renders the timeline grid from the existing bucket data with a current-time indicator", () => {
    vi.useFakeTimers({ now: new Date("2026-03-30T04:05:00.000Z") });
    try {
      localStorage.setItem("gl-tee-sheet-layout", "timeline");

      renderPage();

      expect(screen.getByTestId("tee-sheet-swimlane-grid")).toBeInTheDocument();
      expect(screen.getByTestId("timeline-header-06:00")).toHaveTextContent("06:00");
      expect(screen.getByTestId("timeline-header-06:10")).toHaveTextContent("06:10");
      expect(screen.getByTestId("timeline-current-time-indicator")).toBeInTheDocument();
      expect(screen.getAllByText("Now").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /manage bookings for 1st tee 06:00/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create new booking at 06:30/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("clicking the day overview scrolls the timeline", () => {
    localStorage.setItem("gl-tee-sheet-layout", "timeline");

    renderPage();
    scrollToMock.mockClear();

    fireEvent.click(screen.getByTestId("timeline-overview-06:00"));

    expect(scrollToMock).toHaveBeenCalled();
  });

  test("timeline mode keeps drag and drop wired to the existing move mutation", async () => {
    localStorage.setItem("gl-tee-sheet-layout", "timeline");
    vi.mocked(moveBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: null,
      failures: [],
    });

    renderPage();

    fireEvent.dragStart(screen.getByRole("button", { name: /open booking booking-1/i }));
    const targetCell = screen.getByLabelText(/10th tee timeline row 06:00/i);
    fireEvent.dragEnter(targetCell);
    fireEvent.dragOver(targetCell);
    fireEvent.drop(targetCell);

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

  test("timeline mode keeps quick actions wired to the existing lifecycle mutations", async () => {
    localStorage.setItem("gl-tee-sheet-layout", "timeline");
    vi.mocked(checkInBooking).mockResolvedValue({
      booking_id: "booking-1",
      decision: "allowed",
      transition_applied: true,
      booking: null,
      failures: [],
    });

    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /check in booking booking-1/i })[0]);

    await waitFor(() => {
      expect(checkInBooking).toHaveBeenCalledWith("booking-1", expect.anything());
    });
    expect(screen.queryByRole("heading", { name: /booking management/i })).not.toBeInTheDocument();
  });
});
