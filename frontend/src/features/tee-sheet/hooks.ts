import { useQuery, type QueryClient } from "@tanstack/react-query";

import { fetchCourses, fetchTeeSheetDay } from "../../api/operations";
import type { BookingRuleAppliesTo } from "../../types/operations";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

export const teeSheetKeys = {
  day: (clubId: string, courseId: string, day: string, membershipType: BookingRuleAppliesTo) =>
    ["tee-sheet", clubId, courseId, day, membershipType] as const,
};

interface TeeSheetQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  courseId: string | null;
  date: string;
  membershipType: BookingRuleAppliesTo;
}

function isReady(
  accessToken: string | null,
  selectedClubId: string | null,
  courseId: string | null,
): accessToken is string {
  return Boolean(accessToken && selectedClubId && courseId);
}

export function useTeeSheetDayQuery({
  accessToken,
  selectedClubId,
  courseId,
  date,
  membershipType,
}: TeeSheetQueryOptions) {
  return useQuery<TeeSheetDayResponse>({
    queryKey: teeSheetKeys.day(selectedClubId ?? "none", courseId ?? "none", date, membershipType),
    queryFn: () =>
      fetchTeeSheetDay(
        { courseId: courseId as string, date, membershipType },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    enabled: isReady(accessToken, selectedClubId, courseId),
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
    queryKey: teeSheetKeys.day(selectedClubId, courses[0].id, today, "member"),
    queryFn: () =>
      fetchTeeSheetDay(
        {
          courseId: courses[0].id,
          date: today,
          membershipType: "member",
        },
        { accessToken, selectedClubId },
      ),
  });
}
