import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "../api/client";
import { getAccessToken, getSelectedClubId, setAccessToken, setSelectedClubId } from "../auth/token-storage";
import { useSession } from "./session-context";
import { SessionProvider } from "./session-provider";

const mockFetchBootstrap = vi.fn();
const mockAcceptInvitation = vi.fn();
const mockActivateInvitation = vi.fn();
const mockRefresh = vi.fn();

vi.mock("../api/session", () => ({
  fetchBootstrap: (...args: unknown[]) => mockFetchBootstrap(...args),
}));

vi.mock("../api/auth", () => ({
  acceptInvitation: (...args: unknown[]) => mockAcceptInvitation(...args),
  activateInvitation: (...args: unknown[]) => mockActivateInvitation(...args),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: (...args: unknown[]) => mockRefresh(...args),
}));

function SessionProbe(): JSX.Element {
  const session = useSession();
  return (
    <div>
      <span data-testid="initialized">{String(session.initialized)}</span>
      <span data-testid="loading">{String(session.loading)}</span>
      <span data-testid="token">{session.accessToken ?? "none"}</span>
      <span data-testid="club">{session.bootstrap?.selected_club_id ?? "none"}</span>
    </div>
  );
}

function SessionAcceptProbe(): JSX.Element {
  const session = useSession();
  return (
    <button
      onClick={() => {
        void session.acceptInvitation("invite-token", "password123", "Jamie Staff");
      }}
      type="button"
    >
      Accept invitation
    </button>
  );
}

function SessionActivateProbe(): JSX.Element {
  const session = useSession();
  return (
    <button
      onClick={() => {
        void session.activateInvitation("invite-token");
      }}
      type="button"
    >
      Activate invitation
    </button>
  );
}

describe("SessionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  test("expires the session cleanly when bootstrap refresh also returns 401", async () => {
    setAccessToken("stale-token");
    setSelectedClubId("club-1");
    mockFetchBootstrap.mockRejectedValueOnce(new ApiError(401, "Invalid or expired token"));
    mockRefresh.mockRejectedValueOnce(new ApiError(401, "Refresh token is required"));

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("initialized")).toHaveTextContent("true");
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("token")).toHaveTextContent("none");
      expect(screen.getByTestId("club")).toHaveTextContent("none");
    });

    expect(getAccessToken()).toBeNull();
    expect(getSelectedClubId()).toBeNull();
    expect(mockFetchBootstrap).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  test("accepts an invitation and reloads bootstrap from the returned token", async () => {
    mockAcceptInvitation.mockResolvedValueOnce({
      access_token: "invite-token-access",
      token_type: "bearer",
      expires_in_seconds: 3600,
      user: {
        id: "user-1",
        email: "new.accept@example.com",
        display_name: "Jamie Staff",
        user_type: "user",
      },
    });
    mockFetchBootstrap.mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "new.accept@example.com",
        display_name: "Jamie Staff",
        user_type: "user",
      },
      available_clubs: [],
      selected_club_id: "club-1",
      selected_club: null,
      club_selection_required: false,
      role_shell: "player",
      default_workspace: "/player/home",
      landing_path: "/player/home",
      module_flags: {},
      permissions: [],
      feature_flags: {},
    });

    render(
      <SessionProvider>
        <SessionProbe />
        <SessionAcceptProbe />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith({
        token: "invite-token",
        password: "password123",
        display_name: "Jamie Staff",
      });
      expect(mockFetchBootstrap).toHaveBeenCalledWith("invite-token-access", null);
      expect(screen.getByTestId("token")).toHaveTextContent("invite-token-access");
    });
  });

  test("activates an invitation for an authenticated user and reloads bootstrap", async () => {
    setAccessToken("active-token");
    mockActivateInvitation.mockResolvedValueOnce({
      invitation_id: "invite-1",
      club_id: "club-1",
      membership_id: "membership-1",
      status: "accepted",
      membership_status: "active",
    });
    mockFetchBootstrap.mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "ops@example.com",
        display_name: "Ops User",
        user_type: "user",
      },
      available_clubs: [],
      selected_club_id: "club-1",
      selected_club: null,
      club_selection_required: false,
      role_shell: "admin",
      default_workspace: "/admin/dashboard",
      landing_path: "/admin/dashboard",
      module_flags: {},
      permissions: [],
      feature_flags: {},
    });

    render(
      <SessionProvider>
        <SessionProbe />
        <SessionActivateProbe />
      </SessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /activate invitation/i }));

    await waitFor(() => {
      expect(mockActivateInvitation).toHaveBeenCalledWith({ token: "invite-token" });
      expect(mockFetchBootstrap).toHaveBeenCalledWith("active-token", null);
    });
  });
});
