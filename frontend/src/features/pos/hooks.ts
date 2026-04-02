import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  PosProduct,
  PosTransactionCreateInput,
  PosTransactionResult,
} from "../../types/pos";

export const posKeys = {
  products: (clubId: string, includeInactive = false) =>
    ["pos", clubId, "products", includeInactive ? "all" : "active"] as const,
};

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

interface PosQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  includeInactive?: boolean;
}

export function usePosProductsQuery({
  accessToken,
  selectedClubId,
  includeInactive = false,
}: PosQueryOptions) {
  const params = includeInactive ? "?include_inactive=true" : "";
  return useQuery<PosProduct[]>({
    queryKey: posKeys.products(selectedClubId ?? "none", includeInactive),
    queryFn: () =>
      apiRequest<PosProduct[]>(`/api/pos/products${params}`, {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCreatePosTransactionMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: PosTransactionCreateInput) =>
      apiRequest<PosTransactionResult>("/api/pos/transactions", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      if (!selectedClubId) return;
      queryClient.invalidateQueries({ queryKey: ["pos", selectedClubId] });
    },
  });
}
