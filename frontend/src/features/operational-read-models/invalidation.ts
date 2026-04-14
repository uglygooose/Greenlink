import type { QueryClient } from "@tanstack/react-query";

import { adminDashboardKeys } from "../admin-dashboard/hooks";
import { halfwayKeys } from "../admin-dashboard/halfway-hooks";
import { reportsKeys } from "../admin-dashboard/reports-hooks";
import { financeKeys } from "../finance/hooks";

export async function invalidateClubOperationalReadModels(
  queryClient: QueryClient,
  selectedClubId: string | null,
): Promise<void> {
  if (!selectedClubId) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["tee-sheet", selectedClubId] }),
    queryClient.invalidateQueries({ queryKey: ["orders", selectedClubId] }),
    queryClient.invalidateQueries({ queryKey: halfwayKeys.summary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.accounts(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.journal(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.revenueSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.outstandingSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.transactionVolumeSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: ["finance", selectedClubId, "exceptions"] }),
    queryClient.invalidateQueries({ queryKey: adminDashboardKeys.summary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: reportsKeys.summary(selectedClubId) }),
  ]);
}
