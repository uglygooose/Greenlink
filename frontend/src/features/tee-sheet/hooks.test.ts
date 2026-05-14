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
      {
        courseId: "course-1",
        date: "2026-03-30",
        membershipType: "staff",
        teeId: null,
        intervalMinutes: undefined,
      },
      { accessToken: "token", selectedClubId: "club-1" },
    );
    expect(options.staleTime).toBe(60_000);
  });

  test("omitted intervalMinutes collapses to the 'default' sentinel so cache reuse is preserved", () => {
    const omitted = teeSheetDayQueryOptions({
      accessToken: "token",
      selectedClubId: "club-1",
      courseId: "course-1",
      date: "2026-03-30",
      membershipType: "staff",
      teeId: null,
    });
    const explicitNull = teeSheetDayQueryOptions({
      accessToken: "token",
      selectedClubId: "club-1",
      courseId: "course-1",
      date: "2026-03-30",
      membershipType: "staff",
      teeId: null,
      intervalMinutes: null,
    });
    expect(omitted.queryKey).toEqual(explicitNull.queryKey);
    expect(omitted.queryKey[6]).toBe("default");
  });

  test("explicit intervalMinutes appears in the query key and reaches the API client", async () => {
    vi.mocked(fetchTeeSheetDay).mockResolvedValue({ rows: [] } as never);
    const options = teeSheetDayQueryOptions({
      accessToken: "token",
      selectedClubId: "club-1",
      courseId: "course-1",
      date: "2026-03-30",
      membershipType: "staff",
      teeId: null,
      intervalMinutes: 10,
    });
    expect(options.queryKey).toEqual(
      teeSheetKeys.day("club-1", "course-1", "2026-03-30", "staff", null, 10),
    );
    await options.queryFn();
    expect(fetchTeeSheetDay).toHaveBeenCalledWith(
      expect.objectContaining({ intervalMinutes: 10 }),
      { accessToken: "token", selectedClubId: "club-1" },
    );
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
