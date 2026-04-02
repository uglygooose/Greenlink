import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  cancelOrder,
  markOrderCollected,
  markOrderPreparing,
  markOrderReady,
  postOrderCharge,
} from "../api/operations";
import AdminShell from "../components/shell/AdminShell";
import { OrderManagementDrawer } from "../features/orders/order-management-drawer";
import { useOrderDetailQuery, useOrdersQuery } from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { OrderChargePostResult, OrderLifecycleMutationResult, OrderStatus, OrderSummary } from "../types/orders";

type QueueFilter = "open" | "collected";
type LifecycleAction = "preparing" | "ready" | "collected" | "cancel" | "post_charge";
type OperationNotice = {
  tone: "success" | "info";
  message: string;
};

const OPEN_ORDER_STATUSES: OrderStatus[] = ["placed", "preparing", "ready"];

const LIFECYCLE_NOTICE_COPY: Record<
  LifecycleAction,
  { blockedFallback: string; success: string; already: string }
> = {
  preparing: {
    blockedFallback: "Preparing transition blocked.",
    success: "Order moved to preparing. Queue refreshed from backend state.",
    already: "Order was already preparing. Queue refreshed from backend state.",
  },
  ready: {
    blockedFallback: "Ready transition blocked.",
    success: "Order moved to ready. Queue refreshed from backend state.",
    already: "Order was already ready. Queue refreshed from backend state.",
  },
  collected: {
    blockedFallback: "Collected transition blocked.",
    success: "Order marked collected. Queue refreshed from backend state.",
    already: "Order was already collected. Queue refreshed from backend state.",
  },
  cancel: {
    blockedFallback: "Cancellation blocked.",
    success: "Order cancelled. Queue refreshed from backend state.",
    already: "Order was already cancelled. Queue refreshed from backend state.",
  },
  post_charge: {
    blockedFallback: "Charge posting blocked.",
    success: "Finance charge posted. Queue refreshed from backend state.",
    already: "Finance charge was already posted. Queue refreshed from backend state.",
  },
};

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed";
}

function formatOrderLabel(orderId: string): string {
  return `Order ${orderId.slice(0, 8)}`;
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClassName(status: OrderStatus): string {
  switch (status) {
    case "placed":
      return "bg-primary-container/50 text-on-primary-container";
    case "preparing":
      return "bg-secondary-container text-on-secondary-container";
    case "ready":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-surface-container-high text-on-surface";
  }
}

function statusLabel(status: OrderStatus): string {
  return status.replace("_", " ");
}

function statusCount(orders: OrderSummary[], status: OrderStatus): number {
  return orders.filter((order) => order.status === status).length;
}

function queueFilterButtonClassName(isActive: boolean): string {
  return isActive
    ? "rounded-xl bg-white px-4 py-2 text-sm font-semibold text-on-surface shadow-sm"
    : "rounded-xl px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-surface";
}

function chargeStatusClassName(posted: boolean): string {
  return posted ? "text-primary" : "text-on-surface-variant";
}

export function AdminOrderQueuePage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const queryClient = useQueryClient();
  const [selectedFilter, setSelectedFilter] = useState<QueueFilter>("open");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [drawerFeedbackMessage, setDrawerFeedbackMessage] = useState<string | null>(null);
  const [drawerFeedbackTone, setDrawerFeedbackTone] = useState<"error" | "info" | null>(null);
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const backendStatusFilter = selectedFilter === "collected" ? "collected" : null;

  const ordersQuery = useOrdersQuery({
    accessToken,
    selectedClubId,
    status: backendStatusFilter,
  });
  const orderDetailQuery = useOrderDetailQuery({
    accessToken,
    selectedClubId,
    orderId: selectedOrderId,
  });

  const visibleOrders = useMemo(() => {
    const orders = ordersQuery.data ?? [];
    if (selectedFilter === "open") {
      return orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status));
    }
    return orders.filter((order) => order.status === "collected");
  }, [ordersQuery.data, selectedFilter]);

  useEffect(() => {
    if (selectedOrderId && orderDetailQuery.error) {
      setSelectedOrderId(null);
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
    }
  }, [orderDetailQuery.error, selectedOrderId]);

  async function invalidateOrders(): Promise<void> {
    if (!selectedClubId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["orders", selectedClubId],
    });
  }

  async function handleLifecycleSuccess(
    action: LifecycleAction,
    result: OrderLifecycleMutationResult | OrderChargePostResult,
  ): Promise<void> {
    const copy = LIFECYCLE_NOTICE_COPY[action];
    if (result.decision === "blocked") {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(result.failures[0]?.message ?? copy.blockedFallback);
      return;
    }

    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setSelectedOrderId(null);
    const mutationApplied =
      "transition_applied" in result ? result.transition_applied : result.posting_applied;
    setOperationNotice({
      tone: mutationApplied ? "success" : "info",
      message: mutationApplied ? copy.success : copy.already,
    });
    await invalidateOrders();
  }

  function handleLifecycleError(error: unknown): void {
    setDrawerFeedbackTone("error");
    setDrawerFeedbackMessage(asMessage(error));
  }

  const preparingMutation = useMutation({
    mutationFn: (orderId: string) =>
      markOrderPreparing(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("preparing", result),
    onError: handleLifecycleError,
  });

  const readyMutation = useMutation({
    mutationFn: (orderId: string) =>
      markOrderReady(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("ready", result),
    onError: handleLifecycleError,
  });

  const collectedMutation = useMutation({
    mutationFn: (orderId: string) =>
      markOrderCollected(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("collected", result),
    onError: handleLifecycleError,
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) =>
      cancelOrder(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("cancel", result),
    onError: handleLifecycleError,
  });

  const postChargeMutation = useMutation({
    mutationFn: (orderId: string) =>
      postOrderCharge(orderId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("post_charge", result),
    onError: handleLifecycleError,
  });

  const pendingAction = preparingMutation.isPending
    ? "preparing"
    : readyMutation.isPending
      ? "ready"
      : collectedMutation.isPending
        ? "collected"
        : cancelMutation.isPending
          ? "cancel"
          : postChargeMutation.isPending
            ? "post_charge"
          : null;
  const pendingOrderId = preparingMutation.isPending
    ? preparingMutation.variables ?? null
    : readyMutation.isPending
      ? readyMutation.variables ?? null
      : collectedMutation.isPending
        ? collectedMutation.variables ?? null
        : cancelMutation.isPending
          ? cancelMutation.variables ?? null
          : postChargeMutation.isPending
            ? postChargeMutation.variables ?? null
          : null;

  return (
    <AdminShell title="Order Queue" searchPlaceholder="Search orders...">
      <div className="p-6">
          <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className="font-headline text-2xl font-bold tracking-tight text-on-surface">Order Queue</h1>
              <p className="text-sm text-on-surface-variant">
                {selectedFilter === "open"
                  ? "Defaulting to active operational work for staff handling."
                  : "Collected orders with charge-posting visibility."}
              </p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-2xl bg-surface-container-highest p-1">
              <button
                className={queueFilterButtonClassName(selectedFilter === "open")}
                onClick={() => {
                  setSelectedFilter("open");
                  setSelectedOrderId(null);
                  setDrawerFeedbackMessage(null);
                  setDrawerFeedbackTone(null);
                }}
                type="button"
              >
                Open Orders
              </button>
              <button
                className={queueFilterButtonClassName(selectedFilter === "collected")}
                onClick={() => {
                  setSelectedFilter("collected");
                  setSelectedOrderId(null);
                  setDrawerFeedbackMessage(null);
                  setDrawerFeedbackTone(null);
                }}
                type="button"
              >
                Collected Orders
              </button>
            </div>
          </div>

          {operationNotice ? (
            <div
              className={
                operationNotice.tone === "success"
                  ? "mb-4 rounded-2xl bg-primary-container/50 px-4 py-3 text-sm font-medium text-on-primary-container"
                  : "mb-4 rounded-2xl bg-secondary-container px-4 py-3 text-sm font-medium text-on-secondary-container"
              }
            >
              {operationNotice.message}
            </div>
          ) : null}

          {selectedFilter === "open" ? (
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Placed</p>
                <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
                  {statusCount(ordersQuery.data ?? [], "placed")}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Preparing</p>
                <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
                  {statusCount(ordersQuery.data ?? [], "preparing")}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Ready</p>
                <p className="mt-2 font-headline text-3xl font-extrabold text-on-surface">
                  {statusCount(ordersQuery.data ?? [], "ready")}
                </p>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-left">
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Order
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Created
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Customer
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Context
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Summary
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Status
                    </th>
                    <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordersQuery.isLoading ? (
                    <tr>
                      <td className="px-6 py-4 text-sm text-slate-500" colSpan={7}>
                        Loading orders...
                      </td>
                    </tr>
                  ) : null}
                  {ordersQuery.error ? (
                    <tr>
                      <td className="px-6 py-4 text-sm text-error" colSpan={7}>
                        {ordersQuery.error.message}
                      </td>
                    </tr>
                  ) : null}
                  {visibleOrders.map((order) => (
                    <tr
                      className="cursor-pointer transition-colors hover:bg-surface-container-low"
                      key={order.id}
                      onClick={() => {
                        setOperationNotice(null);
                        setDrawerFeedbackMessage(null);
                        setDrawerFeedbackTone(null);
                        setSelectedOrderId(order.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOperationNotice(null);
                          setDrawerFeedbackMessage(null);
                          setDrawerFeedbackTone(null);
                          setSelectedOrderId(order.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span className="text-sm font-bold text-on-surface">{formatOrderLabel(order.id)}</span>
                          <p className="text-[11px] text-slate-500">{order.id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        {formatCreatedAt(order.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span className="text-sm font-medium text-on-surface">{order.person.full_name}</span>
                          <p className="text-[11px] text-slate-500">{order.person.id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">
                        {order.booking_id ? `Booking ${order.booking_id.slice(0, 8)}` : "Clubhouse"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span className="text-sm font-medium text-on-surface">{order.item_summary}</span>
                          <p className="text-[11px] text-slate-500">{order.item_count} items</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClassName(order.status)}`}
                          >
                            {statusLabel(order.status)}
                          </span>
                          {selectedFilter === "collected" ? (
                            <p className={`text-[11px] font-medium ${chargeStatusClassName(order.finance_charge_posted)}`}>
                              {order.finance_charge_posted ? "Posted" : "Not Posted"}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          aria-label={`Open order ${order.id}`}
                          className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-white transition-colors hover:bg-primary-dim"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOperationNotice(null);
                            setDrawerFeedbackMessage(null);
                            setDrawerFeedbackTone(null);
                            setSelectedOrderId(order.id);
                          }}
                          type="button"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!ordersQuery.isLoading && !ordersQuery.error && visibleOrders.length === 0 ? (
                    <tr>
                      <td className="px-6 py-4 text-sm text-slate-500" colSpan={7}>
                        No orders matched the current filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {selectedOrderId ? (
        orderDetailQuery.isLoading || !orderDetailQuery.data ? (
          <>
            <button
              aria-label="Close order drawer overlay"
              className="fixed inset-0 z-40 bg-slate-950/10"
              onClick={() => setSelectedOrderId(null)}
              type="button"
            />
            <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] items-center justify-center bg-white shadow-2xl">
              <div className="text-sm font-medium text-slate-500">Loading order details...</div>
            </aside>
          </>
        ) : (
          <OrderManagementDrawer
            feedbackMessage={drawerFeedbackMessage}
            feedbackTone={drawerFeedbackTone}
            onCancel={(orderId) => {
              setOperationNotice(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
              cancelMutation.mutate(orderId);
            }}
            onClose={() => {
              setSelectedOrderId(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
            }}
            onMarkCollected={(orderId) => {
              setOperationNotice(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
              collectedMutation.mutate(orderId);
            }}
            onPostCharge={(orderId) => {
              setOperationNotice(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
              postChargeMutation.mutate(orderId);
            }}
            onMarkPreparing={(orderId) => {
              setOperationNotice(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
              preparingMutation.mutate(orderId);
            }}
            onMarkReady={(orderId) => {
              setOperationNotice(null);
              setDrawerFeedbackMessage(null);
              setDrawerFeedbackTone(null);
              readyMutation.mutate(orderId);
            }}
            order={orderDetailQuery.data}
            pendingAction={pendingAction}
            pendingOrderId={pendingOrderId}
          />
        )
      ) : null}

    </AdminShell>
  );
}
