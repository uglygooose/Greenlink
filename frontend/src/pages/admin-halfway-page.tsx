import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useHalfwaySummaryQuery } from "../features/admin-dashboard/halfway-hooks";
import {
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
} from "../features/finance/hooks";
import {
  useCancelOrderMutation,
  useMarkOrderCollectedMutation,
  useMarkOrderPreparingMutation,
  useMarkOrderReadyMutation,
} from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { DashboardActivityItem } from "../types/admin-dashboard";
import type { OrderSummary } from "../types/orders";

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  return `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function transactionIcon(entry: DashboardActivityItem): string {
  if (entry.source === "pos") return "point_of_sale";
  if (entry.source === "order") return "restaurant";
  return "receipt";
}

interface OrderKanbanCardProps {
  order: OrderSummary;
}

function OrderKanbanCard({ order }: OrderKanbanCardProps): JSX.Element {
  const markPreparing = useMarkOrderPreparingMutation();
  const markReady = useMarkOrderReadyMutation();
  const markCollected = useMarkOrderCollectedMutation();
  const cancelOrder = useCancelOrderMutation();
  const busy = markPreparing.isPending || markReady.isPending || markCollected.isPending || cancelOrder.isPending;

  async function advance(): Promise<void> {
    if (order.status === "placed") await markPreparing.mutateAsync(order.id);
    else if (order.status === "preparing") await markReady.mutateAsync(order.id);
    else if (order.status === "ready") await markCollected.mutateAsync(order.id);
  }

  async function cancel(): Promise<void> {
    if (!confirm(`Cancel order for ${order.person.full_name}?`)) return;
    await cancelOrder.mutateAsync(order.id);
  }

  const advanceLabel =
    order.status === "placed" ? "Start Prep" :
    order.status === "preparing" ? "Mark Ready" :
    order.status === "ready" ? "Collected" : null;

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-on-surface">{order.person.full_name}</span>
        <span className="text-[10px] text-slate-400">{formatTime(order.created_at)}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500 line-clamp-2">{order.item_summary}</p>
      <div className="flex gap-1.5">
        {advanceLabel ? (
          <button
            className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
            disabled={busy}
            onClick={() => void advance()}
            type="button"
          >
            {busy ? "..." : advanceLabel}
          </button>
        ) : null}
        <button
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => void cancel()}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AdminHalfwayPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const summaryQuery = useHalfwaySummaryQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });

  const summary = summaryQuery.data;
  const queueOrders = summary?.queue_orders ?? [];
  const recentTransactions = summary?.recent_transactions ?? [];

  const placed = queueOrders.filter((o) => o.status === "placed");
  const preparing = queueOrders.filter((o) => o.status === "preparing");
  const ready = queueOrders.filter((o) => o.status === "ready");

  return (
    <AdminWorkspace
      description="Revenue, queue pressure, and transaction movement for today."
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Revenue</span>
              <MaterialSymbol className="text-primary" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {revenueSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmount(revenueSummaryQuery.data?.day.operational_revenue ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-primary">today</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Transactions Today</span>
              <MaterialSymbol className="text-emerald-500" icon="receipt_long" />
            </div>
            <div className="flex items-baseline gap-2">
              {transactionVolumeSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {transactionVolumeSummaryQuery.data?.day.total_transaction_count ?? 0}
                  </span>
                  <span className="text-xs font-medium text-emerald-600">today</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-amber-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Queue</span>
              <MaterialSymbol className="text-amber-500" icon="pending_actions" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {summary?.active_queue_count ?? 0}
                  </span>
                  <span className="text-xs font-medium text-amber-600">in progress</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Orders Today</span>
              <MaterialSymbol className="text-secondary" icon="receipt_long" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {summary?.orders_today_count ?? 0}
                  </span>
                  <span className="text-xs font-medium text-secondary">placed</span>
                </>
              )}
            </div>
          </div>
        </div>
      }
      title="Halfway House"
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/orders"
          >
            <MaterialSymbol filled icon="pending_actions" />
            Order Queue
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/pos-terminal"
          >
            <MaterialSymbol icon="point_of_sale" />
            POS Terminal
          </NavLink>
        </>
      }
    >
      {/* Kanban queue */}
      <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Active Order Queue</h3>
            <p className="text-xs text-slate-400">Auto-refreshes every 30s · advance orders through stages</p>
          </div>
          <NavLink
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/orders"
          >
            <MaterialSymbol className="text-sm" icon="open_in_new" />
            Full Queue
          </NavLink>
        </div>

        {summaryQuery.isLoading ? (
          <div className="grid grid-cols-3 gap-4 p-4">
            {[1, 2, 3].map((v) => (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" key={v} />
            ))}
          </div>
        ) : queueOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MaterialSymbol className="text-3xl text-slate-200" icon="check_circle" />
            <p className="text-sm text-slate-400">Queue is clear</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
            {(
              [
                { label: "Placed", orders: placed, color: "border-amber-400" },
                { label: "Preparing", orders: preparing, color: "border-blue-400" },
                { label: "Ready", orders: ready, color: "border-emerald-400" },
              ] as const
            ).map(({ color, label, orders: col }) => (
              <div className={`rounded-xl border-t-4 bg-slate-50 p-3 ${color}`} key={label}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm">
                    {col.length}
                  </span>
                </div>
                {col.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-300">—</p>
                ) : (
                  <div className="space-y-2">
                    {col.map((order) => (
                      <OrderKanbanCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h3 className="text-sm font-bold text-on-surface">Recent Transactions</h3>
            <NavLink
              className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-200"
              to="/admin/pos-terminal"
            >
              <MaterialSymbol className="text-sm" icon="point_of_sale" />
              POS
            </NavLink>
          </div>
          <div className="divide-y divide-slate-50">
            {summaryQuery.isLoading && (
              <p className="px-6 py-4 text-sm text-slate-400">Loading transactions...</p>
            )}
            {!summaryQuery.isLoading && recentTransactions.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <MaterialSymbol className="text-3xl text-slate-200" icon="receipt_long" />
                <p className="text-sm text-slate-400">No transactions yet today</p>
              </div>
            )}
            {recentTransactions.map((entry) => (
              <div className="flex items-center justify-between px-6 py-3" key={entry.id}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-primary">
                    <MaterialSymbol className="text-sm" icon={transactionIcon(entry)} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-on-surface">{entry.description}</span>
                    <span className="text-[10px] text-slate-400">{formatTime(entry.created_at)}</span>
                  </div>
                </div>
                <span className="text-sm font-bold text-on-surface">{formatAmount(entry.amount)}</span>
              </div>
            ))}
          </div>
        </div>

      <div className="flex flex-wrap gap-3">
        <NavLink
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
          to="/admin/pos-terminal"
        >
          <MaterialSymbol filled icon="point_of_sale" />
          Open POS Terminal
        </NavLink>
        <NavLink
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface-container-lowest px-5 py-3 font-bold text-on-surface shadow-sm transition-colors hover:bg-slate-50"
          to="/admin/orders"
        >
          <MaterialSymbol icon="pending_actions" />
          Order Queue
        </NavLink>
        <NavLink
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface-container-lowest px-5 py-3 font-bold text-on-surface shadow-sm transition-colors hover:bg-slate-50"
          to="/admin/pro-shop"
        >
          <MaterialSymbol icon="store" />
          Pro Shop
        </NavLink>
      </div>
    </AdminWorkspace>
  );
}
