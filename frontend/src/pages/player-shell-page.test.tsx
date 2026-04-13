import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PlayerShellPage } from "./player-shell-page";

const mockUseSession = vi.fn();
const mockUsePublishedNewsFeedQuery = vi.fn();
const mockUsePlayerBookingReadModelQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/comms/hooks", () => ({
  usePublishedNewsFeedQuery: () => mockUsePublishedNewsFeedQuery(),
}));

vi.mock("../features/bookings/hooks", () => ({
  usePlayerBookingReadModelQuery: () => mockUsePlayerBookingReadModelQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/player/home"]}>
      <QueryClientProvider client={queryClient}>
        <PlayerShellPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PlayerShellPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Avery Green", email: "avery@example.com" },
      },
      logout: vi.fn(),
    });

    mockUsePublishedNewsFeedQuery.mockReturnValue({
      data: { posts: [] },
      isLoading: false,
    });
    mockUsePlayerBookingReadModelQuery.mockReturnValue({
      data: { upcoming: [], history: [] },
      isLoading: false,
      error: null,
    });
  });

  test("shows backend upcoming bookings on player home", () => {
    mockUsePlayerBookingReadModelQuery.mockReturnValue({
      data: {
        upcoming: [
          {
            id: "booking-1",
            status: "reserved",
            source: "member_portal",
            slot_datetime: "2026-04-12T08:00:00Z",
            local_date: "2026-04-12",
            local_time: "10:00",
            course_name: "North Course",
            tee_name: "Blue",
            start_lane: "hole_10",
            party_size: 2,
            primary_participant_name: "Avery Green",
            participant_names: ["Avery Green", "Chris Guest"],
            fee_label: "Member Fourball",
            payment_status: "pending",
          },
        ],
        history: [
          {
            id: "booking-2",
            status: "completed",
            source: "member_portal",
            slot_datetime: "2026-04-07T08:00:00Z",
            local_date: "2026-04-07",
            local_time: "10:00",
            course_name: "North Course",
            tee_name: "Blue",
            start_lane: "hole_1",
            party_size: 1,
            primary_participant_name: "Avery Green",
            participant_names: ["Avery Green"],
            fee_label: null,
            payment_status: "paid",
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByText("10:00")).toHaveLength(2);
    expect(screen.getAllByText("North Course")).toHaveLength(2);
    expect(screen.getByText("Blue • 10th Tee")).toBeInTheDocument();
    expect(screen.getByText("Avery Green, Chris Guest")).toBeInTheDocument();
    expect(screen.getByText("Member Fourball")).toBeInTheDocument();
    expect(screen.getByText("Payment pending")).toBeInTheDocument();
    expect(screen.getByText("Recent Booking History")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.queryByText("No upcoming bookings available.")).not.toBeInTheDocument();
    expect(screen.queryByText("No recent bookings found.")).not.toBeInTheDocument();
  });

  test("shows the empty upcoming bookings state when the backend returns none", () => {
    renderPage();

    expect(screen.getByText("No upcoming bookings available.")).toBeInTheDocument();
    expect(screen.getByText(/next confirmed tee time will appear here automatically/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tomorrow/i)).not.toBeInTheDocument();
  });

  test("uses backend menu items to hide disabled player navigation domains during rollout", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Avery Green", email: "avery@example.com" },
        menu_items: [
          {
            key: "home",
            label: "Home",
            path: "/player/home",
            shell: "player",
            domain: "home",
            module_key: null,
          },
          {
            key: "profile",
            label: "Profile",
            path: "/player/profile",
            shell: "player",
            domain: "profile",
            module_key: null,
          },
        ],
      },
      logout: vi.fn(),
    });

    renderPage();

    expect(screen.queryByRole("link", { name: /book golf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /order food & drink/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Club/News")).not.toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  test("does not mount the profile menu on initial render", () => {
    renderPage();

    expect(screen.queryByTestId("player-profile-menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  test("opens and closes the player profile menu intentionally without a full-screen backdrop", () => {
    renderPage();

    const profileButton = screen.getByRole("button", { name: /avery green profile/i });
    fireEvent.click(profileButton);

    expect(screen.getByTestId("player-profile-menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId("player-profile-menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});
