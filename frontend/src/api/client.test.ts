import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "./client";
import { getAccessToken, SESSION_EXPIRED_EVENT, setAccessToken } from "../auth/token-storage";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("apiRequest", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes once and retries protected tee-sheet requests with the new token", async () => {
    setAccessToken("stale-token");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { rows: [] }));

    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ rows: unknown[] }>("/api/golf/tee-sheet/day?date=2026-04-03", {
      method: "GET",
      accessToken: "stale-token",
      selectedClubId: "club-1",
    });

    expect(result.rows).toEqual([]);
    expect(getAccessToken()).toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.headers.get("Authorization")).toBe("Bearer stale-token");
    expect(fetchMock.mock.calls[2]?.[1]?.headers.get("Authorization")).toBe("Bearer fresh-token");
    expect(fetchMock.mock.calls[2]?.[1]?.headers.get("X-Club-Id")).toBe("club-1");
  });

  it("emits session expiry and clears stored auth when refresh fails", async () => {
    setAccessToken("stale-token");
    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Invalid or expired token" }))
      .mockResolvedValueOnce(jsonResponse(401, { message: "Refresh failed" }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/golf/tee-sheet/day?date=2026-04-03", {
        method: "GET",
        accessToken: "stale-token",
        selectedClubId: "club-1",
      }),
    ).rejects.toMatchObject({ status: 401, message: "Session expired. Please sign in again." });

    expect(getAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });
});
