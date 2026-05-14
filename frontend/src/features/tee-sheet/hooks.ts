import { useQuery, type QueryClient } from "@tanstack/react-query";

import { fetchCourses, fetchTeeSheetDay } from "../../api/operations";
import type { BookingRuleAppliesTo } from "../../types/operations";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

export const TEE_SHEET_STALE_TIME = 60_000;
export const TEE_SHEET_REFETCH_INTERVAL = 30_000;

export const teeSheetKeys = {
  // intervalMinutes null/undefined collapses to the "default" sentinel so a
  // call site that omits the override (PortfolioStrip per-course summaries)
  // shares cache with a call site that explicitly opts into the club default
  // (the page when no override is set). Numeric overrides get their own slot.
  day: (
    clubId: string,
    courseId: string,
    day: string,
    membershipType: BookingRuleAppliesTo,
    teeId?: string | null,
    intervalMinutes?: number | null,
  ) =>
    [
      "tee-sheet",
      clubId,
      courseId,
      day,
      membershipType,
      teeId ?? "all-tees",
      intervalMinutes ?? "default",
    ] as const,
};

interface TeeSheetQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  courseId: string | null;
  date: string;
  membershipType: BookingRuleAppliesTo;
  teeId?: string | null;
  intervalMinutes?: number | null;
}

function isReady(
  accessToken: string | null,
  selectedClubId: string | null,
  courseId: string | null,
): accessToken is string {
  return Boolean(accessToken && selectedClubId && courseId);
}

export function teeSheetDayQueryOptions({
  accessToken,
  selectedClubId,
  courseId,
  date,
  membershipType,
  teeId,
  intervalMinutes,
}: TeeSheetQueryOptions) {
  return {
    queryKey: teeSheetKeys.day(
      selectedClubId ?? "none",
      courseId ?? "none",
      date,
      membershipType,
      teeId,
      intervalMinutes,
    ),
    queryFn: () =>
      fetchTeeSheetDay(
        { courseId: courseId as string, date, membershipType, teeId, intervalMinutes },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    staleTime: TEE_SHEET_STALE_TIME,
  };
}

export function useTeeSheetDayQuery({
  accessToken,
  selectedClubId,
  courseId,
  date,
  membershipType,
  teeId,
  intervalMinutes,
}: TeeSheetQueryOptions) {
  return useQuery<TeeSheetDayResponse>({
    ...teeSheetDayQueryOptions({
      accessToken,
      selectedClubId,
      courseId,
      date,
      membershipType,
      teeId,
      intervalMinutes,
    }),
    enabled: isReady(accessToken, selectedClubId, courseId),
    placeholderData: (previousData) => previousData,
    refetchInterval: TEE_SHEET_REFETCH_INTERVAL,
    refetchOnWindowFocus: false,
  });
}

export async function prefetchTeeSheetDay(
  queryClient: QueryClient,
  accessToken: string | null,
  selectedClubId: string | null,
): Promise<void> {
  if (!accessToken || !selectedClubId) {
    return;
  }
  const courses = await queryClient.fetchQuery({
    queryKey: ["operations", selectedClubId, "courses"],
    queryFn: () => fetchCourses({ accessToken, selectedClubId }),
  });
  if (courses.length === 0) {
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  await queryClient.prefetchQuery({
    ...teeSheetDayQueryOptions({
      accessToken,
      selectedClubId,
      courseId: courses[0].id,
      date: today,
      membershipType: "staff",
    }),
  });
}
