import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import { useSession } from "../../session/session-context";
import type { OrderDetail, OrderSettlementResult, OrderStatus, TenderType } from "../../types/orders";

type FeedbackTone = "error" | "info";
type LifecycleAction = "preparing" | "ready" | "collected" | "cancel" | "post_charge";

interface OrderManagementDrawerProps {
  order: OrderDetail;
  pendingAction: LifecycleAction | null;
  pendingOrderId: string | null;
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  onMarkPreparing: (orderId: string) => void;
  onMarkReady: (orderId: string) => void;
  onMarkCollected: (orderId: string) => void;
  onPostCharge: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onClose: () => void;
}

interface ActionButtonProps {
  ariaLabel: string;
  disabled: boolean;
  icon: string;
  isPending: boolean;
  label: string;
  pendingLabel: string;
  onClick: () => void;
}

const actionButtonClassName =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-slate-300";

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

function feedbackClassName(tone: FeedbackTone | null): string {
  if (tone === "error") {
    return "bg-error-container/40 text-on-error-container";
  }
  return "bg-secondary-container text-on-secondary-container";
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatOrderLabel(orderId: string): string {
  return `Order ${orderId.slice(0, 8)}`;
}

function tenderLabel(tenderType: TenderType): string {
  switch (tenderType) {
    case "cash":
      return "Cash";
    case "card":
      return "Card";
    case "member_account":
      return "Account";
  }
}

function tenderIcon(tenderType: TenderType): string {
  switch (tenderType) {
    case "cash":
      return "payments";
    case "card":
      return "credit_card";
    case "member_account":
      return "account_balance";
  }
}

function tenderButtonClassName(isSelected: boolean): string {
  return isSelected
    ? "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary/20 bg-primary-container/30 px-3 py-3 text-primary transition-colors"
    : "flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-container-low px-3 py-3 text-on-surface transition-colors hover:bg-surface-container";
}

function ActionButton({
  ariaLabel,
  disabled,
  icon,
  isPending,
  label,
  pendingLabel,
  onClick,
}: ActionButtonProps): JSX.Element {
  return (
    <button
      aria-label={ariaLabel}
      className={actionButtonClassName}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <MaterialSymbol className="text-sm" icon={isPending ? "progress_activity" : icon} />
      <span>{isPending ? pendingLabel : label}</span>
    </button>
  );
}

export function OrderManagementDrawer({
  order,
  pendingAction,
  pendingOrderId,
  feedbackMessage,
  feedbackTone,
  onMarkPreparing,
  onMarkReady,
  onMarkCollected,
  onPostCharge,
  onCancel,
  onClose,
}: OrderManagementDrawerProps): JSX.Element {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const recordPaymentMutation = useMutation<
    OrderSettlementResult,
    Error,
    { orderId: string; tenderType: TenderType }
  >({
    mutationFn: ({ orderId, tenderType }) =>
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
  const [selectedTender, setSelectedTender] = useState<TenderType | null>(null);
  const [settlementFeedbackMessage, setSettlementFeedbackMessage] = useState<string | null>(null);
  const [settlementFeedbackTone, setSettlementFeedbackTone] = useState<FeedbackTone | null>(null);
  const isPending = pendingOrderId === order.id;
  const isPreparingPending = isPending && pendingAction === "preparing";
  const isReadyPending = isPending && pendingAction === "ready";
  const isCollectedPending = isPending && pendingAction === "collected";
  const isCancelPending = isPending && pendingAction === "cancel";
  const isPostChargePending = isPending && pendingAction === "post_charge";
  const settlementOrder = recordPaymentMutation.data?.order?.id === order.id ? recordPaymentMutation.data.order : null;
  const financePaymentTransactionId =
    settlementOrder?.finance_payment_transaction_id ?? order.finance_payment_transaction_id ?? null;
  const financePaymentPosted =
    settlementOrder?.finance_payment_posted ?? order.finance_payment_posted ?? false;
  const financeTenderRecordId =
    settlementOrder?.finance_tender_record_id ?? order.finance_tender_record_id ?? null;
  const tenderRecorded =
    settlementOrder?.tender_recorded ?? order.tender_recorded ?? false;
  const paymentTenderType =
    settlementOrder?.payment_tender_type ?? recordPaymentMutation.data?.transaction?.tender_type ?? order.payment_tender_type ?? null;
  const effectiveFeedbackMessage = feedbackMessage ?? settlementFeedbackMessage;
  const effectiveFeedbackTone = feedbackMessage ? feedbackTone : settlementFeedbackTone;

  useEffect(() => {
    setSelectedTender(null);
    setSettlementFeedbackMessage(null);
    setSettlementFeedbackTone(null);
    recordPaymentMutation.reset();
  }, [order.id]);

  async function handleRecordPayment(): Promise<void> {
    if (!selectedTender || recordPaymentMutation.isPending) {
      return;
    }

    setSettlementFeedbackMessage(null);
    setSettlementFeedbackTone(null);
    const result = await recordPaymentMutation.mutateAsync({
      orderId: order.id,
      tenderType: selectedTender,
    });

    if (result.decision === "blocked") {
      setSettlementFeedbackTone("error");
      setSettlementFeedbackMessage(result.failures[0] ?? "Payment recording was blocked.");
      return;
    }

    setSelectedTender(null);
    setSettlementFeedbackTone("info");
    if (result.tender?.tender_type === "member_account" && !result.settlement_applied) {
      setSettlementFeedbackMessage(
        "Tender recorded to member account. Charge remains outstanding on the ledger.",
      );
      return;
    }
    setSettlementFeedbackMessage(
      result.settlement_applied
        ? "Payment recorded. Drawer refreshed from backend state."
        : "Tender was already recorded. Drawer refreshed from backend state.",
    );
  }

  return (
    <>
      <button
        aria-label="Close order drawer overlay"
        className="fixed inset-0 z-40 bg-slate-950/10"
        onClick={onClose}
        type="button"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 pb-5 pt-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Order Queue</h3>
            <p className="text-xs text-slate-500">{formatDateLabel(order.created_at)}</p>
          </div>
          <button
            aria-label="Close order drawer"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <MaterialSymbol icon="close" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <section className="rounded-2xl bg-surface-container-low p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Order</p>
                <p className="mt-1 text-sm font-bold text-on-surface">{formatOrderLabel(order.id)}</p>
                <p className="mt-1 break-all text-[11px] text-slate-500">{order.id}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClassName(order.status)}`}
              >
                {statusLabel(order.status)}
              </span>
            </div>
          </section>

          {effectiveFeedbackMessage ? (
            <section className={`rounded-2xl px-4 py-3 ${feedbackClassName(effectiveFeedbackTone)}`}>
              <div className="flex items-start gap-3">
                <MaterialSymbol
                  className="text-base"
                  icon={effectiveFeedbackTone === "error" ? "warning" : "info"}
                />
                <p className="text-sm font-medium">{effectiveFeedbackMessage}</p>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Customer</p>
            <div className="mt-3 space-y-2 text-sm text-on-surface">
              <div className="flex items-center gap-2">
                <MaterialSymbol className="text-sm text-slate-400" icon="person" />
                <span>{order.person.full_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <MaterialSymbol className="text-sm text-slate-400" icon="badge" />
                <span>{order.person.id}</span>
              </div>
              {order.booking_id ? (
                <div className="flex items-center gap-2">
                  <MaterialSymbol className="text-sm text-slate-400" icon="golf_course" />
                  <span>Linked booking {order.booking_id.slice(0, 8)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MaterialSymbol className="text-sm text-slate-400" icon="storefront" />
                  <span>Standalone clubhouse order</span>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Finance Posting</p>
            <div className="mt-3 space-y-2 text-sm text-on-surface">
              <div className="flex items-center gap-2">
                <MaterialSymbol className="text-sm text-slate-400" icon="payments" />
                <span>{order.finance_charge_posted ? "Charge posted" : "Charge not posted"}</span>
              </div>
              {order.finance_charge_transaction_id ? (
                <div className="flex items-center gap-2">
                  <MaterialSymbol className="text-sm text-slate-400" icon="receipt_long" />
                  <span className="break-all">{order.finance_charge_transaction_id}</span>
                </div>
              ) : null}
            </div>
          </section>

          {order.status === "collected" && order.finance_charge_posted ? (
            <section className="rounded-2xl bg-surface-container-low p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Tender</p>
              {tenderRecorded ? (
                <div className="mt-3 space-y-2 text-sm text-on-surface">
                  <div className="flex items-center gap-2">
                    <MaterialSymbol className="text-sm text-slate-400" icon="payments" />
                    <span>{financePaymentPosted ? "Payment recorded" : "Tender recorded"}</span>
                  </div>
                  {paymentTenderType ? (
                    <div className="flex items-center gap-2">
                      <MaterialSymbol className="text-sm text-slate-400" icon={tenderIcon(paymentTenderType)} />
                      <span>{tenderLabel(paymentTenderType)}</span>
                    </div>
                  ) : null}
                  {!financePaymentPosted && paymentTenderType === "member_account" ? (
                    <div className="flex items-center gap-2">
                      <MaterialSymbol className="text-sm text-slate-400" icon="schedule" />
                      <span>Outstanding remains on member ledger</span>
                    </div>
                  ) : null}
                  {financeTenderRecordId ? (
                    <div className="flex items-center gap-2">
                      <MaterialSymbol className="text-sm text-slate-400" icon="confirmation_number" />
                      <span className="break-all">{financeTenderRecordId}</span>
                    </div>
                  ) : null}
                  {financePaymentTransactionId ? (
                    <div className="flex items-center gap-2">
                      <MaterialSymbol className="text-sm text-slate-400" icon="receipt_long" />
                      <span className="break-all">{financePaymentTransactionId}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {(["cash", "card", "member_account"] as TenderType[]).map((tenderType) => (
                      <button
                        className={tenderButtonClassName(selectedTender === tenderType)}
                        key={tenderType}
                        onClick={() => setSelectedTender(tenderType)}
                        type="button"
                      >
                        <MaterialSymbol className="text-lg" icon={tenderIcon(tenderType)} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">
                          {tenderLabel(tenderType)}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={!selectedTender || recordPaymentMutation.isPending}
                    onClick={() => {
                      void handleRecordPayment();
                    }}
                    type="button"
                    >
                    <MaterialSymbol
                      className="text-sm"
                      icon={recordPaymentMutation.isPending ? "progress_activity" : "payments"}
                    />
                    <span>{recordPaymentMutation.isPending ? "Recording..." : "Record Tender"}</span>
                  </button>
                </div>
              )}
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Items</span>
              <span className="text-xs font-semibold text-slate-500">{order.item_count} items</span>
            </div>
            {order.items.map((item) => (
              <article className="rounded-2xl bg-surface-container-low p-4" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface">{item.item_name_snapshot}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Qty {item.quantity} • {item.unit_price_snapshot} each
                    </p>
                  </div>
                  <span className="text-sm font-bold text-on-surface">
                    {(Number(item.unit_price_snapshot) * item.quantity).toFixed(2)}
                  </span>
                </div>
              </article>
            ))}
          </section>
        </div>

        <div className="space-y-3 border-t border-slate-100 bg-surface-container-low px-6 py-5">
          {order.status === "placed" ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ActionButton
                ariaLabel="Mark Preparing"
                disabled={isPending}
                icon="restaurant"
                isPending={isPreparingPending}
                label="Mark Preparing"
                onClick={() => onMarkPreparing(order.id)}
                pendingLabel="Marking..."
              />
              <ActionButton
                ariaLabel="Cancel Order"
                disabled={isPending}
                icon="event_busy"
                isPending={isCancelPending}
                label="Cancel Order"
                onClick={() => onCancel(order.id)}
                pendingLabel="Cancelling..."
              />
            </div>
          ) : null}
          {order.status === "preparing" ? (
            <div className="flex justify-end">
              <ActionButton
                ariaLabel="Mark Ready"
                disabled={isPending}
                icon="task_alt"
                isPending={isReadyPending}
                label="Mark Ready"
                onClick={() => onMarkReady(order.id)}
                pendingLabel="Marking..."
              />
            </div>
          ) : null}
          {order.status === "ready" ? (
            <div className="flex justify-end">
              <ActionButton
                ariaLabel="Mark Collected"
                disabled={isPending}
                icon="shopping_bag"
                isPending={isCollectedPending}
                label="Mark Collected"
                onClick={() => onMarkCollected(order.id)}
                pendingLabel="Marking..."
              />
            </div>
          ) : null}
          {order.status === "collected" && !order.finance_charge_posted ? (
            <div className="flex justify-end">
              <ActionButton
                ariaLabel="Post Charge"
                disabled={isPending}
                icon="payments"
                isPending={isPostChargePending}
                label="Post Charge"
                onClick={() => onPostCharge(order.id)}
                pendingLabel="Posting..."
              />
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
