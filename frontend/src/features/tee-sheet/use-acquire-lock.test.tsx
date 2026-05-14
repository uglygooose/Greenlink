// Path: frontend/src/features/tee-sheet/use-acquire-lock.test.tsx — Phase 10 Slice 9a.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useAcquireLock } from "./use-acquire-lock";
import type { LockAcquireResult } from "../../api/operations";
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

const mockAcquire = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    acquireTeeSheetLock: (...args: unknown[]) => mockAcquire(...args),
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

describe("useAcquireLock", () => {
  beforeEach(() => mockAcquire.mockReset());

  test("emits POST body with course_id + slot_datetime and returns lock on success", async () => {
    const lock = lockResponse();
    mockAcquire.mockResolvedValueOnce({ kind: "lock", lock } as LockAcquireResult);
    const { result } = renderHook(
      () => useAcquireLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    let resolved: LockAcquireResult | null = null;
    await act(async () => {
      resolved = await result.current.mutateAsync({
        courseId: "course-1",
        slotDatetime: "2026-05-12T06:30:00+02:00",
      });
    });
    expect(mockAcquire).toHaveBeenCalledWith(
      { course_id: "course-1", slot_datetime: "2026-05-12T06:30:00+02:00" },
      { accessToken: "tok", selectedClubId: "club-1" },
    );
    expect(resolved).toEqual({ kind: "lock", lock });
  });

  test("returns conflict (typed) on 409 — does NOT throw", async () => {
    const existing = lockResponse({ holder_user_id: "user-2", holder_display_name: "Operator B" });
    mockAcquire.mockResolvedValueOnce({
      kind: "conflict",
      existing_lock: existing,
      message: "Slot is currently held by another operator.",
    } as LockAcquireResult);
    const { result } = renderHook(
      () => useAcquireLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    let outcome: LockAcquireResult | null = null;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        courseId: "course-1",
        slotDatetime: "2026-05-12T06:30:00+02:00",
      });
    });
    expect(outcome).not.toBeNull();
    const settled = outcome as unknown as LockAcquireResult;
    expect(settled.kind).toBe("conflict");
    if (settled.kind === "conflict") {
      expect(settled.existing_lock.holder_user_id).toBe("user-2");
    }
  });

  test("throws on network error (non-409 path)", async () => {
    mockAcquire.mockRejectedValueOnce(new Error("Network down"));
    const { result } = renderHook(
      () => useAcquireLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    await expect(
      result.current.mutateAsync({
        courseId: "course-1",
        slotDatetime: "2026-05-12T06:30:00+02:00",
      }),
    ).rejects.toThrow(/network down/i);
  });

  test("rejects when there is no active session", async () => {
    const { result } = renderHook(
      () => useAcquireLock({ accessToken: null, selectedClubId: null }),
      { wrapper: buildWrapper() },
    );
    await expect(
      result.current.mutateAsync({
        courseId: "course-1",
        slotDatetime: "2026-05-12T06:30:00+02:00",
      }),
    ).rejects.toThrow(/active session/i);
    expect(mockAcquire).not.toHaveBeenCalled();
  });
});
