// Path: frontend/src/features/tee-sheet/use-renew-lock.test.tsx — Phase 10 Slice 9a.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useRenewLock } from "./use-renew-lock";
import type { LockRenewResult } from "../../api/operations";
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

const mockRenew = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    renewTeeSheetLock: (...args: unknown[]) => mockRenew(...args),
  };
});

function lockResponse(overrides: Partial<TeeSheetLockResponse> = {}): TeeSheetLockResponse {
  return {
    id: "lock-1",
    club_id: "club-1",
    course_id: "course-1",
    slot_datetime: "2026-05-12T06:30:00+02:00",
    holder_user_id: "user-1",
    holder_display_name: "Operator A",
    acquired_at: "2026-05-12T06:29:00+02:00",
    expires_at: "2026-05-12T06:30:00+02:00",
    remaining_seconds: 60,
    ...overrides,
  };
}

function buildWrapper(): (props: { children: ReactNode }) => JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useRenewLock", () => {
  beforeEach(() => mockRenew.mockReset());

  test("calls /renew with the lock id and returns refreshed lock", async () => {
    const refreshed = lockResponse({ remaining_seconds: 60 });
    mockRenew.mockResolvedValueOnce({ kind: "lock", lock: refreshed } as LockRenewResult);
    const { result } = renderHook(
      () => useRenewLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    let resolved: LockRenewResult | null = null;
    await act(async () => {
      resolved = await result.current.mutateAsync({ lockId: "lock-1" });
    });
    expect(mockRenew).toHaveBeenCalledWith("lock-1", {
      accessToken: "tok",
      selectedClubId: "club-1",
    });
    expect(resolved).toEqual({ kind: "lock", lock: refreshed });
  });

  test("surfaces 409 typed (does NOT throw)", async () => {
    mockRenew.mockResolvedValueOnce({
      kind: "conflict",
      existing_lock: null,
      message: "Tee sheet lock not found or expired",
    } as LockRenewResult);
    const { result } = renderHook(
      () => useRenewLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    let outcome: LockRenewResult | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({ lockId: "lock-1" });
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.kind).toBe("conflict");
  });

  test("rejects when there is no active session", async () => {
    const { result } = renderHook(
      () => useRenewLock({ accessToken: null, selectedClubId: null }),
      { wrapper: buildWrapper() },
    );
    await expect(result.current.mutateAsync({ lockId: "lock-1" })).rejects.toThrow(
      /active session/i,
    );
    expect(mockRenew).not.toHaveBeenCalled();
  });
});
