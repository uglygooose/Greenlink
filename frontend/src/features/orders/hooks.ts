import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import {
  cancelOrder,
  createOrder,
  fetchOrder,
  fetchOrderMenu,
  fetchOrders,
  markOrderCollected,
  markOrderPreparing,
  markOrderReady,
  postOrderCharge,
} from "../../api/operations";
import { useSession } from "../../session/session-context";
import { adminDashboardKeys } from "../admin-dashboard/hooks";
import { halfwayKeys } from "../admin-dashboard/halfway-hooks";
import { reportsKeys } from "../admin-dashboard/reports-hooks";
import { financeKeys } from "../finance/hooks";
import type {
  OrderChargePostResult,
  OrderCreateInput,
  OrderCreateResult,
  OrderDetail,
  OrderLifecycleMutationResult,
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

function syncOrderDetail(
  queryClient: QueryClient,
  selectedClubId: string,
  order: OrderDetail | null | undefined,
): void {
  if (!order) {
    return;
  }
  queryClient.setQueryData(orderKeys.detail(selectedClubId, order.id), order);
}

async function invalidateOrderReads(
  queryClient: QueryClient,
  selectedClubId: string,
  orderId?: string,
): Promise<void> {
  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: ["orders", selectedClubId] }),
    queryClient.invalidateQueries({ queryKey: halfwayKeys.summary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.revenueSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.outstandingSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.transactionVolumeSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: adminDashboardKeys.summary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: reportsKeys.summary(selectedClubId) }),
  ];

  if (orderId) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: orderKeys.detail(selectedClubId, orderId) }));
  }

  await Promise.all(invalidations);
}

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

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: OrderCreateInput) =>
      createOrder(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => {
      if (!selectedClubId) {
        return;
      }
      syncOrderDetail(queryClient, selectedClubId, result.order);
      await invalidateOrderReads(queryClient, selectedClubId, result.order.id);
    },
  });
}

interface RecordPaymentVariables {
  orderId: string;
  tenderType: OrderSettlementRequestInput["tender_type"];
}

function makeOrderStatusMutation(
  mutationFn: (
    orderId: string,
    options: { accessToken: string; selectedClubId: string },
  ) => Promise<OrderLifecycleMutationResult>,
) {
  return function useOrderStatusMutation() {
    const queryClient = useQueryClient();
    const { accessToken, bootstrap } = useSession();
    const selectedClubId = bootstrap?.selected_club_id ?? null;

    return useMutation({
      mutationFn: (orderId: string) =>
        mutationFn(orderId, {
          accessToken: accessToken as string,
          selectedClubId: selectedClubId as string,
        }),
      onSuccess: async (result, orderId) => {
        if (!selectedClubId) return;
        syncOrderDetail(queryClient, selectedClubId, result.order);
        await invalidateOrderReads(queryClient, selectedClubId, orderId);
      },
    });
  };
}

export const useMarkOrderPreparingMutation = makeOrderStatusMutation(markOrderPreparing);
export const useMarkOrderReadyMutation = makeOrderStatusMutation(markOrderReady);
export const useMarkOrderCollectedMutation = makeOrderStatusMutation(markOrderCollected);
export const useCancelOrderMutation = makeOrderStatusMutation(cancelOrder);

export function usePostOrderChargeMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (orderId: string) =>
      postOrderCharge(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result: OrderChargePostResult, orderId) => {
      if (!selectedClubId) {
        return;
      }
      syncOrderDetail(queryClient, selectedClubId, result.order);
      await invalidateOrderReads(queryClient, selectedClubId, orderId);
    },
  });
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
    onSuccess: async (result, variables) => {
      if (!selectedClubId) {
        return;
      }
      syncOrderDetail(queryClient, selectedClubId, result.order);
      await invalidateOrderReads(queryClient, selectedClubId, variables.orderId);
    },
  });
}
