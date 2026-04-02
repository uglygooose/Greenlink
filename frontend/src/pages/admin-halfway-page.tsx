import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { useFinanceJournalQuery } from "../features/finance/hooks";
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
    case "placed":     return "bg-amber-100 text-amber-800";
    case "preparing":  return "bg-blue-100 text-blue-800";
    case "ready":      return "bg-emerald-100 text-emerald-800";
    case "collected":  return "bg-slate-100 text-slate-500";
    case "cancelled":  return "bg-red-100 text-red-600";
    default:           return "bg-slate-100 text-slate-500";
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
  const allOrdersQuery = useOrdersQuery({ accessToken, selectedClubId, status: null });
  const activeOrdersQuery = useOrdersQuery({ accessToken, selectedClubId, status: "placed" });
  const preparingQuery  = useOrdersQuery({ accessToken, selectedClubId, status: "preparing" });
  const readyQuery      = useOrdersQuery({ accessToken, selectedClubId, status: "ready" });

  // POS + Order journal entries from today
  const todayEntries = (journalQuery.data?.entries ?? []).filter(
    (e) => (e.source === "pos" || e.source === "order") && e.type === "charge" && isToday(e.created_at),
  );

  // Revenue metrics
  const todayRevenue = todayEntries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
  const todayTxCount = todayEntries.length;
  const avgSpend = todayTxCount > 0 ? todayRevenue / todayTxCount : 0;

  // Payment method split from today's order entries
  const allOrders = allOrdersQuery.data ?? [];
  const todayOrders = allOrders.filter((o) => isToday(o.created_at));
  const cashCount    = todayOrders.filter((o) => o.payment_tender_type === "cash").length;
  const cardCount    = todayOrders.filter((o) => o.payment_tender_type === "card").length;
  const accountCount = todayOrders.filter((o) => o.payment_tender_type === "member_account").length;
  const totalSettled = cashCount + cardCount + accountCount || 1; // avoid div/0

  // Active queue
  const queueOrders: OrderSummary[] = [
    ...(activeOrdersQuery.data ?? []),
    ...(preparingQuery.data ?? []),
    ...(readyQuery.data ?? []),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Hourly revenue (last 8 hours)
  const now = new Date();
  const hourlyBuckets = Array.from({ length: 8 }, (_, i) => {
    const hour = new Date(now);
    hour.setHours(now.getHours() - (7 - i), 0, 0, 0);
    const label = hour.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
    const total = todayEntries
      .filter((e) => {
        const d = new Date(e.created_at);
        return d.getHours() === hour.getHours();
      })
      .reduce((sum, e) => sum + parseFloat(e.amount), 0);
    return { label, total };
  });
  const maxHourly = Math.max(...hourlyBuckets.map((b) => b.total), 1);

  // Recent transactions (last 10 POS/order entries)
  const recentEntries = [...todayEntries]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  return (
    <AdminShell title="Halfway House" searchPlaceholder="Search orders...">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Revenue</span>
              <MaterialSymbol className="text-primary" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {journalQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">R{todayRevenue.toFixed(2)}</span>
                  <span className="text-xs font-medium text-primary">{todayTxCount} tx</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-emerald-500">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Spend</span>
              <MaterialSymbol className="text-emerald-500" icon="show_chart" />
            </div>
            <div className="flex items-baseline gap-2">
              {journalQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">R{avgSpend.toFixed(2)}</span>
                  <span className="text-xs font-medium text-emerald-600">per tx</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-amber-500">
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

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
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

        {/* Middle row: Hourly + Payment split + Queue */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Hourly Revenue */}
          <div className="col-span-1 rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100 lg:col-span-2">
            <h3 className="mb-4 text-sm font-bold text-on-surface">Revenue — Last 8 Hours</h3>
            <div className="flex h-32 items-end gap-2">
              {hourlyBuckets.map((bucket) => (
                <div className="flex flex-1 flex-col items-center gap-1" key={bucket.label}>
                  <span className="text-[10px] font-semibold text-emerald-600">
                    {bucket.total > 0 ? `R${bucket.total.toFixed(0)}` : ""}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-primary/80 transition-all"
                    style={{ height: `${Math.max(4, (bucket.total / maxHourly) * 100)}%` }}
                  />
                  <span className="text-[9px] text-slate-400">{bucket.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Split */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <h3 className="mb-4 text-sm font-bold text-on-surface">Payment Split</h3>
            <div className="space-y-3">
              {[
                { label: "Card", count: cardCount, color: "bg-primary" },
                { label: "Cash", count: cashCount, color: "bg-emerald-400" },
                { label: "Account", count: accountCount, color: "bg-secondary" },
              ].map(({ label, count, color }) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-600">{label}</span>
                    <span className="font-bold text-on-surface">{count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${Math.round((count / totalSettled) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {todayOrders.length === 0 && (
                <p className="pt-4 text-center text-xs text-slate-400">No settled orders yet today.</p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom row: Active Queue + Recent Transactions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Active Queue */}
          <div className="rounded-2xl bg-surface-container-lowest shadow-sm border border-slate-100">
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
              {activeOrdersQuery.isLoading && (
                <p className="px-6 py-4 text-sm text-slate-400">Loading orders…</p>
              )}
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

          {/* Recent Transactions */}
          <div className="rounded-2xl bg-surface-container-lowest shadow-sm border border-slate-100">
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
              {journalQuery.isLoading && (
                <p className="px-6 py-4 text-sm text-slate-400">Loading transactions…</p>
              )}
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

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
            to="/admin/pos-terminal"
          >
            <MaterialSymbol filled icon="point_of_sale" />
            Open POS Terminal
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-surface-container-lowest px-5 py-3 font-bold text-on-surface shadow-sm border border-slate-200 transition-colors hover:bg-slate-50"
            to="/admin/orders"
          >
            <MaterialSymbol icon="pending_actions" />
            Order Queue
          </NavLink>
        </div>

      </div>
    </AdminShell>
  );
}
