import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import type { HalfwaySummary } from "../../types/halfway";

interface HalfwayQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

export const halfwayKeys = {
  summary: (clubId: string) => ["halfway", clubId, "summary"] as const,
};

export function useHalfwaySummaryQuery({ accessToken, selectedClubId }: HalfwayQueryOptions) {
  return useQuery<HalfwaySummary>({
    queryKey: halfwayKeys.summary(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<HalfwaySummary>("/api/admin/halfway/summary", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
    refetchInterval: 30_000,
  });
}
