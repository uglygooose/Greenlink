import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import type { AdminDashboardSummary } from "../../types/admin-dashboard";

interface DashboardQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

export const adminDashboardKeys = {
  summary: (clubId: string) => ["admin-dashboard", clubId, "summary"] as const,
};

export function useAdminDashboardSummaryQuery({ accessToken, selectedClubId }: DashboardQueryOptions) {
  return useQuery<AdminDashboardSummary>({
    queryKey: adminDashboardKeys.summary(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<AdminDashboardSummary>("/api/admin/dashboard/summary", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}
