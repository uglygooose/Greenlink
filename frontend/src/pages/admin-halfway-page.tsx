import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  useFinanceJournalQuery,
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
} from "../features/finance/hooks";
import { useOrdersQuery } from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { FinanceJournalEntry } from "../types/finance";
import type { OrderSummary } from "../types/orders";

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-R${abs}` : `R${abs}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function statusColor(status: OrderSummary["status"]): string {
  switch (status) {
    case "placed":
      return "bg-amber-100 text-amber-800";
    case "preparing":
      return "bg-blue-100 text-blue-800";
    case "ready":
      return "bg-emerald-100 text-emerald-800";
    case "collected":
      return "bg-slate-100 text-slate-500";
    case "cancelled":
      return "bg-red-100 text-red-600";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function tenderIcon(entry: FinanceJournalEntry): string {
  if (entry.source === "pos") return "point_of_sale";
  if (entry.source === "order") return "restaurant";
  return "receipt";
}

export function AdminHalfwayPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const journalQuery = useFinanceJournalQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });
  const allOrdersQuery = useOrdersQuery({ accessToken, selectedClubId, status: null });
  const activeOrdersQuery = useOrdersQuery({ accessToken, selectedClubId, status: "placed" });
  const preparingQuery = useOrdersQuery({ accessToken, selectedClubId, status: "preparing" });
  const readyQuery = useOrdersQuery({ accessToken, selectedClubId, status: "ready" });

  const allOrders = allOrdersQuery.data ?? [];
  const todayOrders = allOrders.filter((order) => isToday(order.created_at));

  const queueOrders: OrderSummary[] = [
    ...(activeOrdersQuery.data ?? []),
    ...(preparingQuery.data ?? []),
    ...(readyQuery.data ?? []),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const recentEntries = [...(journalQuery.data?.entries ?? [])]
    .filter((entry) => (entry.source === "pos" || entry.source === "order") && isToday(entry.created_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

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
                  <span className="text-xs font-medium text-primary">backend summary</span>
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
                  <span className="text-xs font-medium text-emerald-600">backend summary</span>
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
              {activeOrdersQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{queueOrders.length}</span>
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
              {allOrdersQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{todayOrders.length}</span>
                  <span className="text-xs font-medium text-secondary">placed</span>
                </>
              )}
            </div>
          </div>
        </div>
      }
      title="Halfway House"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h3 className="text-sm font-bold text-on-surface">Active Order Queue</h3>
            <NavLink
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-primary-dim"
              to="/admin/orders"
            >
              <MaterialSymbol className="text-sm" icon="open_in_new" />
              Manage
            </NavLink>
          </div>
          <div className="divide-y divide-slate-50">
            {activeOrdersQuery.isLoading && <p className="px-6 py-4 text-sm text-slate-400">Loading orders...</p>}
            {!activeOrdersQuery.isLoading && queueOrders.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <MaterialSymbol className="text-3xl text-slate-200" icon="check_circle" />
                <p className="text-sm text-slate-400">Queue is clear</p>
              </div>
            )}
            {queueOrders.slice(0, 6).map((order) => (
              <div className="flex items-center justify-between px-6 py-3" key={order.id}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-on-surface">{order.person.full_name}</span>
                  <span className="text-xs text-slate-400">{order.item_summary}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">{formatTime(order.created_at)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusColor(order.status)}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
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
            {journalQuery.isLoading && <p className="px-6 py-4 text-sm text-slate-400">Loading transactions...</p>}
            {!journalQuery.isLoading && recentEntries.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <MaterialSymbol className="text-3xl text-slate-200" icon="receipt_long" />
                <p className="text-sm text-slate-400">No transactions yet today</p>
              </div>
            )}
            {recentEntries.map((entry) => (
              <div className="flex items-center justify-between px-6 py-3" key={entry.id}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-primary">
                    <MaterialSymbol className="text-sm" icon={tenderIcon(entry)} />
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
      </div>
    </AdminWorkspace>
  );
}
