import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { fetchOrder, fetchOrderMenu, fetchOrders } from "../../api/operations";
import { useSession } from "../../session/session-context";
import type {
  OrderDetail,
  OrderMenuItem,
  OrderSettlementRequestInput,
  OrderSettlementResult,
  OrderStatus,
  OrderSummary,
} from "../../types/orders";

export const orderKeys = {
  menu: (clubId: string) => ["orders", clubId, "menu"] as const,
  list: (clubId: string, status: OrderStatus | null) => ["orders", clubId, "list", status ?? "all"] as const,
  detail: (clubId: string, orderId: string) => ["orders", clubId, "detail", orderId] as const,
};

interface OrdersQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  status: OrderStatus | null;
}

interface OrderMenuQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

interface OrderDetailQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  orderId: string | null;
}

function isReady(
  accessToken: string | null,
  selectedClubId: string | null,
  requiredId?: string | null,
): accessToken is string {
  return Boolean(accessToken && selectedClubId && (requiredId === undefined || requiredId));
}

export function useOrdersQuery({ accessToken, selectedClubId, status }: OrdersQueryOptions) {
  return useQuery<OrderSummary[]>({
    queryKey: orderKeys.list(selectedClubId ?? "none", status),
    queryFn: () =>
      fetchOrders(status, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useOrderMenuQuery({ accessToken, selectedClubId }: OrderMenuQueryOptions) {
  return useQuery<OrderMenuItem[]>({
    queryKey: orderKeys.menu(selectedClubId ?? "none"),
    queryFn: () =>
      fetchOrderMenu({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useOrderDetailQuery({
  accessToken,
  selectedClubId,
  orderId,
}: OrderDetailQueryOptions) {
  return useQuery<OrderDetail>({
    queryKey: orderKeys.detail(selectedClubId ?? "none", orderId ?? "none"),
    queryFn: () =>
      fetchOrder(orderId as string, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId, orderId),
  });
}

export async function prefetchOpenOrders(
  queryClient: QueryClient,
  accessToken: string | null,
  selectedClubId: string | null,
): Promise<void> {
  if (!accessToken || !selectedClubId) {
    return;
  }
  await queryClient.prefetchQuery({
    queryKey: orderKeys.list(selectedClubId, null),
    queryFn: () => fetchOrders(null, { accessToken, selectedClubId }),
  });
}

interface RecordPaymentVariables {
  orderId: string;
  tenderType: OrderSettlementRequestInput["tender_type"];
}

export function useRecordPaymentMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: ({ orderId, tenderType }: RecordPaymentVariables) =>
      apiRequest<OrderSettlementResult>(`/api/orders/${orderId}/record-payment`, {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify({ tender_type: tenderType }),
      }),
    onSuccess: async () => {
      if (!selectedClubId) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["orders", selectedClubId],
      });
    },
  });
}
