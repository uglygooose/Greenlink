import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PlayerShellPage } from "./player-shell-page";

const mockUseSession = vi.fn();
const mockUsePublishedNewsFeedQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/comms/hooks", () => ({
  usePublishedNewsFeedQuery: () => mockUsePublishedNewsFeedQuery(),
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
  });

  test("shows an empty upcoming bookings state instead of fake booking cards", () => {
    renderPage();

    expect(screen.getByText("No upcoming bookings available.")).toBeInTheDocument();
    expect(screen.getByText(/backend member-booking read model/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tomorrow/i)).not.toBeInTheDocument();
  });
});
