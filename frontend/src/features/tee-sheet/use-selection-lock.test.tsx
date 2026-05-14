// Path: frontend/src/features/tee-sheet/use-selection-lock.test.tsx — Phase 10 Slice 9a.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useSelectionLock } from "./use-selection-lock";
import type { LockAcquireResult, LockRenewResult } from "../../api/operations";
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

const mockAcquire = vi.fn();
const mockRenew = vi.fn();
const mockRelease = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    acquireTeeSheetLock: (...args: unknown[]) => mockAcquire(...args),
    renewTeeSheetLock: (...args: unknown[]) => mockRenew(...args),
    releaseTeeSheetLock: (...args: unknown[]) => mockRelease(...args),
  };
});

function lockResponse(overrides: Partial<TeeSheetLockResponse> = {}): TeeSheetLockResponse {
  const acquiredAt = new Date();
  const expiresAt = new Date(acquiredAt.getTime() + 60_000);
  return {
    id: "lock-1",
    club_id: "club-1",
    course_id: "course-1",
    slot_datetime: "2026-05-12T06:30:00+02:00",
    holder_user_id: "user-1",
    holder_display_name: "Operator A",
    acquired_at: acquiredAt.toISOString(),
    expires_at: expiresAt.toISOString(),
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

describe("useSelectionLock", () => {
  beforeEach(() => {
    mockAcquire.mockReset();
    mockRenew.mockReset();
    mockRelease.mockReset();
    mockRelease.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("idle when no selection", () => {
    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: null,
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );
    expect(result.current.state.kind).toBe("idle");
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  test("selection set → acquiring → held-by-me on success", async () => {
    const lock = lockResponse();
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);

    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );

    await waitFor(() => expect(result.current.state.kind).toBe("held-by-me"));
    if (result.current.state.kind === "held-by-me") {
      expect(result.current.state.lock).toEqual(lock);
    }
    expect(result.current.secondsRemaining).toBeGreaterThan(55);
  });

  test("409 from different user → held-by-other", async () => {
    const otherLock = lockResponse({
      holder_user_id: "user-2",
      holder_display_name: "Operator B",
    });
    mockAcquire.mockResolvedValueOnce({
      kind: "conflict",
      existing_lock: otherLock,
      message: "Slot is currently held by another operator.",
    } as LockAcquireResult);

    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );

    await waitFor(() => expect(result.current.state.kind).toBe("held-by-other"));
    expect(result.current.holderDisplayName).toBe("Operator B");
  });

  test("409 from same user → held-by-me reusing existing lock", async () => {
    const ownLock = lockResponse({ holder_user_id: "user-1" });
    mockAcquire.mockResolvedValueOnce({
      kind: "conflict",
      existing_lock: ownLock,
      message: "Slot is currently held by another operator.",
    } as LockAcquireResult);

    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );

    await waitFor(() => expect(result.current.state.kind).toBe("held-by-me"));
    if (result.current.state.kind === "held-by-me") {
      expect(result.current.state.lock.id).toBe(ownLock.id);
    }
  });

  test("selection clears → release fires + state returns to idle", async () => {
    const lock = lockResponse();
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);

    const { result, rerender } = renderHook(
      ({ selectedSlotKey }: { selectedSlotKey: string | null }) =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey,
          currentUserId: "user-1",
        }),
      {
        wrapper: buildWrapper(),
        initialProps: { selectedSlotKey: "2026-05-12T06:30:00+02:00" as string | null },
      },
    );
    await waitFor(() => expect(result.current.state.kind).toBe("held-by-me"));

    rerender({ selectedSlotKey: null });
    await waitFor(() => expect(result.current.state.kind).toBe("idle"));
    expect(mockRelease).toHaveBeenCalledWith("lock-1", expect.any(Object));
  });

  test("auto-renewal fires at the 30s threshold", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-12T06:29:00.000Z") });

    // Acquire returns a lock that expires in 30s (puts us right at the
    // renewal threshold on the first tick).
    const lock = lockResponse({
      acquired_at: "2026-05-12T06:28:30.000Z",
      expires_at: "2026-05-12T06:29:30.000Z",
      remaining_seconds: 30,
    });
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);
    const renewed = lockResponse({
      acquired_at: "2026-05-12T06:29:01.000Z",
      expires_at: "2026-05-12T06:30:01.000Z",
      remaining_seconds: 60,
    });
    mockRenew.mockResolvedValueOnce({ kind: "lock", lock: renewed } as LockRenewResult);

    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );

    // Resolve the acquire microtask.
    await act(async () => {
      await Promise.resolve();
    });
    // Advance the ticker by 1 second — should trigger the renewal.
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(mockRenew).toHaveBeenCalledWith("lock-1", expect.any(Object));
    // Resolve the renew microtask + advance one more second so the new
    // lock lands.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.state.kind).toBe("held-by-me");
  });

  test("renewal failure transitions to error", async () => {
    vi.useFakeTimers({ now: new Date("2026-05-12T06:29:00.000Z") });
    const lock = lockResponse({
      expires_at: "2026-05-12T06:29:30.000Z",
      remaining_seconds: 30,
    });
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);
    mockRenew.mockRejectedValueOnce(new Error("Network down"));

    const { result } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    // The renew rejection propagates through the mutation onError.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.state.kind).toBe("error");
  });

  test("unmount cleanup fires release for current lock", async () => {
    const lock = lockResponse();
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);

    const { result, unmount } = renderHook(
      () =>
        useSelectionLock({
          accessToken: "tok",
          selectedClubId: "club-1",
          courseId: "course-1",
          selectedSlotKey: "2026-05-12T06:30:00+02:00",
          currentUserId: "user-1",
        }),
      { wrapper: buildWrapper() },
    );
    await waitFor(() => expect(result.current.state.kind).toBe("held-by-me"));

    unmount();
    await waitFor(() =>
      expect(mockRelease).toHaveBeenCalledWith("lock-1", expect.any(Object)),
    );
  });
});
