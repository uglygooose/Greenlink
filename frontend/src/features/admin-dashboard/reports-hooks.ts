import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import type { ReportsSummary } from "../../types/reports";

interface ReportsQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

export const reportsKeys = {
  summary: (clubId: string) => ["admin-reports", clubId, "summary"] as const,
};

export function useReportsSummaryQuery({ accessToken, selectedClubId }: ReportsQueryOptions) {
  return useQuery<ReportsSummary>({
    queryKey: reportsKeys.summary(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<ReportsSummary>("/api/admin/reports/summary", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}
