import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

import { fetchCourses, fetchTeeSheetDay } from "../../api/operations";
import { prefetchTeeSheetDay, teeSheetDayQueryOptions, teeSheetKeys } from "./hooks";

vi.mock("../../api/operations", () => ({
  fetchCourses: vi.fn(),
  fetchTeeSheetDay: vi.fn(),
}));

describe("tee-sheet hooks", () => {
  test("builds query options that match the canonical tee-sheet key contract", async () => {
    vi.mocked(fetchTeeSheetDay).mockResolvedValue({ rows: [] } as never);

    const options = teeSheetDayQueryOptions({
      accessToken: "token",
      selectedClubId: "club-1",
      courseId: "course-1",
      date: "2026-03-30",
      membershipType: "staff",
      teeId: null,
    });

    expect(options.queryKey).toEqual(teeSheetKeys.day("club-1", "course-1", "2026-03-30", "staff", null));
    await options.queryFn();
    expect(fetchTeeSheetDay).toHaveBeenCalledWith(
      { courseId: "course-1", date: "2026-03-30", membershipType: "staff", teeId: null },
      { accessToken: "token", selectedClubId: "club-1" },
    );
    expect(options.staleTime).toBe(60_000);
  });

  test("reuses the canonical query options when prefetching the default tee-sheet", async () => {
    vi.useFakeTimers({ now: new Date("2026-03-30T12:00:00.000Z") });
    try {
      vi.mocked(fetchCourses).mockResolvedValue([{ id: "course-1", name: "North" }] as never);
      vi.mocked(fetchTeeSheetDay).mockResolvedValue({ rows: [] } as never);
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      const prefetchSpy = vi.spyOn(queryClient, "prefetchQuery");
      await prefetchTeeSheetDay(queryClient, "token", "club-1");

      expect(prefetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: teeSheetKeys.day("club-1", "course-1", "2026-03-30", "staff", undefined),
          staleTime: 60_000,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
