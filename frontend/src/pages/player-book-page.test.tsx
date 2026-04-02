import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createBooking } from "../api/operations";
import { PlayerBookPage } from "./player-book-page";
import { PlayerShellPage } from "./player-shell-page";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();
const mockUsePublishedNewsFeedQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("../features/tee-sheet/hooks", () => ({
  teeSheetKeys: {
    day: (clubId: string, courseId: string, day: string, membershipType: string) =>
      ["tee-sheet", clubId, courseId, day, membershipType],
  },
  useTeeSheetDayQuery: () => mockUseTeeSheetDayQuery(),
}));

vi.mock("../features/comms/hooks", () => ({
  usePublishedNewsFeedQuery: () => mockUsePublishedNewsFeedQuery(),
}));

vi.mock("../api/operations", () => ({
  createBooking: vi.fn(),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPlayerBookPage(queryClient = buildQueryClient()): QueryClient {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/player/book"]}
    >
      <QueryClientProvider client={queryClient}>
        <PlayerBookPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

describe("Player booking flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        user: {
          id: "user-1",
          email: "member@example.com",
          display_name: "Jordan Member",
          user_type: "user",
        },
        available_clubs: [],
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "GreenLink Club",
          slug: "greenlink-club",
          location: "Durban",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: null },
        },
        club_selection_required: false,
        role_shell: "player",
        default_workspace: "player",
        landing_path: "/player/home",
        module_flags: {},
        permissions: [],
        feature_flags: {},
      },
    });

    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "North Course", holes: 18, active: true }],
      isLoading: false,
      error: null,
    });

    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        club_id: "club-1",
        course_id: "course-1",
        course_name: "North Course",
        date: "2026-04-02",
        timezone: "Africa/Johannesburg",
        interval_minutes: 10,
        membership_type: "member",
        reference_datetime: "2026-04-02T06:00:00Z",
        warnings: [],
        rows: [
          {
            row_key: "tee-1:hole_1",
            tee_id: "tee-1",
            start_lane: "hole_1",
            label: "Blue",
            color_code: "#1b4d8f",
            slots: [
              {
                slot_datetime: "2026-04-02T06:00:00Z",
                local_time: "08:00:00",
                display_status: "available",
                state_flags: {},
                occupancy: {
                  player_capacity: 4,
                  occupied_player_count: 1,
                  reserved_player_count: 1,
                  confirmed_booking_count: 1,
                  reserved_booking_count: 1,
                  remaining_player_capacity: 3,
                },
                party_summary: {
                  member_count: 1,
                  guest_count: 0,
                  staff_count: 0,
                  total_players: 1,
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
                bookings: [],
              },
            ],
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    mockUsePublishedNewsFeedQuery.mockReturnValue({
      data: {
        posts: [],
        total_count: 0,
      },
      isLoading: false,
      error: null,
    });
  });

  test("adds a clear player-home entry point into the booking flow", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <PlayerShellPage />
      </MemoryRouter>,
    );

    const bookLink = screen.getByRole("link", { name: /book golf/i });
    expect(bookLink).toHaveAttribute("href", "/player/book");
  });

  test("creates a member portal booking from a selected tee-sheet slot", async () => {
    vi.mocked(createBooking).mockResolvedValue({
      decision: "allowed",
      booking: {
        id: "booking-1",
        status: "reserved",
        source: "member_portal",
        party_size: 1,
        slot_datetime: "2026-04-02T06:00:00Z",
        participants: [{ display_name: "Jordan Member", participant_type: "member", is_primary: true }],
      },
      availability: null,
      failures: [],
    });

    renderPlayerBookPage();

    fireEvent.click(await screen.findByRole("button", { name: /select 08:00:00 blue 1st tee/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    await waitFor(() => {
      expect(createBooking).toHaveBeenCalledWith(
        {
          course_id: "course-1",
          tee_id: "tee-1",
          start_lane: "hole_1",
          slot_datetime: "2026-04-02T06:00:00Z",
          source: "member_portal",
          participants: [],
        },
        {
          accessToken: "token",
          selectedClubId: "club-1",
        },
      );
    });

    expect(
      await screen.findByText("Booking confirmed. Admin tee sheet reflects backend state immediately."),
    ).toBeInTheDocument();
  });
});
