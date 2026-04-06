import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PlayerProfilePage } from "./player-profile-page";

const mockUseSession = vi.fn();
const mockUseSelfProfileQuery = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseUpdateSelfProfileMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/profile/hooks", () => ({
  useSelfProfileQuery: () => mockUseSelfProfileQuery(),
  useUpdateSelfProfileMutation: () => mockUseUpdateSelfProfileMutation(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/player/profile"]}
    >
      <QueryClientProvider client={queryClient}>
        <PlayerProfilePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("PlayerProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Avery Green", email: "avery@example.com" },
      },
      reloadBootstrap: vi.fn().mockResolvedValue(null),
    });

    mockUseSelfProfileQuery.mockReturnValue({
      data: {
        person_id: "person-1",
        first_name: "Avery",
        last_name: "Green",
        full_name: "Avery Green",
        contact_email: "avery.green@example.com",
        account_email: "avery@example.com",
        phone: "0820000000",
        club_name: "Club One",
      },
      isLoading: false,
      error: null,
    });

    mockUseUpdateSelfProfileMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      isError: false,
    });
    mockMutateAsync.mockResolvedValue(undefined);
  });

  test("renders backend profile fields and read-only sign-in email", () => {
    renderPage();

    expect(screen.getByDisplayValue("Avery")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Green")).toBeInTheDocument();
    expect(screen.getByDisplayValue("avery.green@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0820000000")).toBeInTheDocument();
    expect(screen.getByText("avery@example.com")).toBeInTheDocument();
  });

  test("submits profile updates and reloads bootstrap", async () => {
    const reloadBootstrap = vi.fn().mockResolvedValue(null);
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Avery Green", email: "avery@example.com" },
      },
      reloadBootstrap,
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Avery-Jane" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "0831112222" } });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        first_name: "Avery-Jane",
        last_name: "Green",
        contact_email: "avery.green@example.com",
        phone: "0831112222",
      });
    });

    await waitFor(() => {
      expect(reloadBootstrap).toHaveBeenCalledWith("club-1");
    });

    expect(await screen.findByText("Profile updated from backend truth.")).toBeInTheDocument();
  });
});
