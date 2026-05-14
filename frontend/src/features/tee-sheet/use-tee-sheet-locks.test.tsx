// Path: frontend/src/features/tee-sheet/use-tee-sheet-locks.test.tsx — Phase 10 Slice 9b.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  TEE_SHEET_LOCKS_REFETCH_INTERVAL,
  teeSheetLocksKeys,
  useTeeSheetLocks,
} from "./use-tee-sheet-locks";
import type { TeeSheetLockListResponse } from "../../types/tee-sheet-locks";

const mockListLocks = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    listTeeSheetLocks: (...args: unknown[]) => mockListLocks(...args),
  };
});

function buildWrapper(): (props: { children: ReactNode }) => JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useTeeSheetLocks", () => {
  beforeEach(() => mockListLocks.mockReset());

  test("refetch interval is exactly 15s", () => {
    expect(TEE_SHEET_LOCKS_REFETCH_INTERVAL).toBe(15_000);
  });

  test("query key composition: tee-sheet-locks / clubId / courseId / date", () => {
    expect(teeSheetLocksKeys.list("club-1", "course-1", "2026-05-12")).toEqual([
      "tee-sheet-locks",
      "club-1",
      "course-1",
      "2026-05-12",
    ]);
  });

  test("disabled when accessToken is null — no fetch fires", () => {
    renderHook(
      () =>
        useTeeSheetLocks({
          accessToken: null,
          clubId: "club-1",
          courseId: "course-1",
          date: "2026-05-12",
        }),
      { wrapper: buildWrapper() },
    );
    expect(mockListLocks).not.toHaveBeenCalled();
  });

  test("disabled when courseId is null — no fetch fires", () => {
    renderHook(
      () =>
        useTeeSheetLocks({
          accessToken: "tok",
          clubId: "club-1",
          courseId: null,
          date: "2026-05-12",
        }),
      { wrapper: buildWrapper() },
    );
    expect(mockListLocks).not.toHaveBeenCalled();
  });

  test("enabled with all params → fetches and returns locks", async () => {
    const response: TeeSheetLockListResponse = {
      locks: [
        {
          id: "lock-1",
          club_id: "club-1",
          course_id: "course-1",
          slot_datetime: "2026-05-12T06:30:00+02:00",
          holder_user_id: "user-2",
          holder_display_name: "Operator B",
          acquired_at: "2026-05-12T06:29:00+02:00",
          expires_at: "2026-05-12T06:30:00+02:00",
          remaining_seconds: 60,
        },
      ],
    };
    mockListLocks.mockResolvedValueOnce(response);

    const { result } = renderHook(
      () =>
        useTeeSheetLocks({
          accessToken: "tok",
          clubId: "club-1",
          courseId: "course-1",
          date: "2026-05-12",
        }),
      { wrapper: buildWrapper() },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockListLocks).toHaveBeenCalledWith(
      { courseId: "course-1", date: "2026-05-12" },
      { accessToken: "tok", selectedClubId: "club-1" },
    );
    expect(result.current.data?.locks).toHaveLength(1);
  });
});
