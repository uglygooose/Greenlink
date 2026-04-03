import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "../api/client";
import { getAccessToken, getSelectedClubId, setAccessToken, setSelectedClubId } from "../auth/token-storage";
import { useSession } from "./session-context";
import { SessionProvider } from "./session-provider";

const mockFetchBootstrap = vi.fn();
const mockRefresh = vi.fn();

vi.mock("../api/session", () => ({
  fetchBootstrap: (...args: unknown[]) => mockFetchBootstrap(...args),
}));

vi.mock("../api/auth", () => ({
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
});
