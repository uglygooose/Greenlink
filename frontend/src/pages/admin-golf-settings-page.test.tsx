import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminGolfSettingsPage } from "./admin-golf-settings-page";

const mockUseSession = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("./admin-golf-settings-guided-page", () => ({
  AdminGolfSettingsGuidedPage: () => <div>guided-golf-settings</div>,
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminGolfSettingsPage />
    </QueryClientProvider>,
  );
}

describe("AdminGolfSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders the guided golf settings page", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One" },
        available_clubs: [],
      },
    });

    renderPage();

    expect(screen.getByText("guided-golf-settings")).toBeInTheDocument();
  });
});
