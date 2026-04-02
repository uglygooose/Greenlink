import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { useFinanceAccountsQuery, useFinanceJournalQuery } from "../features/finance/hooks";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useOrdersQuery } from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { FinanceTransactionSource, FinanceTransactionType } from "../types/finance";

function formatR(amount: number): string {
  return `R${Math.abs(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SOURCE_META: Record<FinanceTransactionSource, { label: string; icon: string; color: string }> = {
  booking: { label: "Bookings",  icon: "golf_course",    color: "bg-blue-500" },
  pos:     { label: "POS",       icon: "point_of_sale",  color: "bg-emerald-500" },
  order:   { label: "Orders",    icon: "restaurant",     color: "bg-amber-500" },
  manual:  { label: "Manual",    icon: "edit_note",      color: "bg-slate-400" },
  settlement: { label: "Settlement", icon: "handshake", color: "bg-purple-400" },
};

const TYPE_META: Record<FinanceTransactionType, { label: string; color: string }> = {
  charge:     { label: "Charges",     color: "bg-error" },
  payment:    { label: "Payments",    color: "bg-primary" },
  refund:     { label: "Refunds",     color: "bg-secondary" },
  adjustment: { label: "Adjustments", color: "bg-slate-400" },
};

export function AdminReportsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const journalQuery   = useFinanceJournalQuery({ accessToken, selectedClubId });
  const accountsQuery  = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const ordersQuery    = useOrdersQuery({ accessToken, selectedClubId, status: null });
  const coursesQuery   = useCoursesQuery({ accessToken, selectedClubId });

  const entries  = journalQuery.data?.entries ?? [];
  const accounts = accountsQuery.data ?? [];
  const members  = directoryQuery.data ?? [];
  const orders   = ordersQuery.data ?? [];

  // Revenue by source (charges only)
  const chargeEntries = entries.filter((e) => e.type === "charge");
  const revenueBySource = (Object.keys(SOURCE_META) as FinanceTransactionSource[]).map((source) => {
    const sourceEntries = chargeEntries.filter((e) => e.source === source);
    const total = sourceEntries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    return { source, total, count: sourceEntries.length };
  }).filter((r) => r.count > 0);

  const totalRevenue = revenueBySource.reduce((sum, r) => sum + r.total, 0);
  const maxRevenue   = Math.max(...revenueBySource.map((r) => r.total), 1);

  // Transaction type breakdown
  const txByType = (Object.keys(TYPE_META) as FinanceTransactionType[]).map((type) => {
    const typeEntries = entries.filter((e) => e.type === type);
    const total = typeEntries.reduce((sum, e) => sum + Math.abs(parseFloat(e.amount)), 0);
    return { type, total, count: typeEntries.length };
  }).filter((r) => r.count > 0);

  const maxTx = Math.max(...txByType.map((r) => r.total), 1);

  // Member role breakdown
  const adminCount = members.filter((m) => m.membership.role === "CLUB_ADMIN").length;
  const staffCount = members.filter((m) => m.membership.role === "CLUB_STAFF").length;
  const memberOnlyCount = members.length - adminCount - staffCount;

  // Order status breakdown
  const ordersByStatus = ["placed", "preparing", "ready", "collected", "cancelled"].map((status) => ({
    status,
    count: orders.filter((o) => o.status === status).length,
  })).filter((o) => o.count > 0);

  const totalOrders = orders.length;

  // Accounts health
  const inArrears    = accounts.filter((a) => parseFloat(a.balance) < 0).length;
  const inCredit     = accounts.filter((a) => parseFloat(a.balance) > 0).length;
  const zero         = accounts.filter((a) => parseFloat(a.balance) === 0).length;

  return (
    <AdminShell title="Reports" searchPlaceholder="Search reports...">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-primary p-5 text-white shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Revenue</p>
            <p className="mt-2 font-headline text-2xl font-extrabold">
              {journalQuery.isLoading ? "—" : formatR(totalRevenue)}
            </p>
            <p className="mt-1 text-[10px] opacity-70">{chargeEntries.length} charge records</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Members</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">
              {directoryQuery.isLoading ? "—" : members.length}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">{coursesQuery.data?.length ?? 0} courses</p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Orders</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">
              {ordersQuery.isLoading ? "—" : totalOrders}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              {orders.filter((o) => o.status === "collected").length} collected
            </p>
          </div>
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm border border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Finance Accounts</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-on-surface">
              {accountsQuery.isLoading ? "—" : accounts.length}
            </p>
            <p className="mt-1 text-[10px] text-error">{inArrears} in arrears</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Revenue by Source */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Revenue by Source</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
                Full Journal
              </NavLink>
            </div>
            {journalQuery.isLoading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
            ) : revenueBySource.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No revenue data yet.</p>
            ) : (
              <div className="space-y-4">
                {revenueBySource
                  .sort((a, b) => b.total - a.total)
                  .map(({ source, total, count }) => {
                    const meta = SOURCE_META[source];
                    return (
                      <div key={source}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <MaterialSymbol className="text-sm text-slate-500" icon={meta.icon} />
                            <span className="text-sm font-semibold text-on-surface">{meta.label}</span>
                            <span className="text-[10px] text-slate-400">{count} entries</span>
                          </div>
                          <span className="text-sm font-bold text-on-surface">{formatR(total)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${meta.color} transition-all`}
                            style={{ width: `${(total / maxRevenue) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between text-sm font-bold text-on-surface">
                    <span>Total</span>
                    <span>{formatR(totalRevenue)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Transaction Type Breakdown */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <h3 className="mb-5 font-headline text-base font-bold text-on-surface">Transaction Types</h3>
            {journalQuery.isLoading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
            ) : txByType.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No transactions yet.</p>
            ) : (
              <div className="space-y-4">
                {txByType
                  .sort((a, b) => b.count - a.count)
                  .map(({ type, total, count }) => {
                    const meta = TYPE_META[type];
                    return (
                      <div key={type}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${meta.color}`} />
                            <span className="text-sm font-semibold text-on-surface">{meta.label}</span>
                            <span className="text-[10px] text-slate-400">{count}</span>
                          </div>
                          <span className="text-sm font-bold text-on-surface">{formatR(total)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${meta.color} transition-all`}
                            style={{ width: `${(total / maxTx) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Member Directory Breakdown */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Member Breakdown</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/members">
                View All
              </NavLink>
            </div>
            {directoryQuery.isLoading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "Members", count: memberOnlyCount, color: "bg-primary" },
                  { label: "Staff",   count: staffCount,      color: "bg-secondary" },
                  { label: "Admins",  count: adminCount,      color: "bg-tertiary" },
                ].filter((r) => r.count > 0).map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-on-surface">{label}</span>
                      <span className="text-sm font-bold text-on-surface">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${members.length > 0 ? (count / members.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-sm font-bold text-on-surface">
                    <span>Total</span>
                    <span>{members.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Health */}
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Account Health</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
                Resolve
              </NavLink>
            </div>
            {accountsQuery.isLoading ? (
              <div className="space-y-3">{[1,2,3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "In Credit",  count: inCredit,  color: "bg-emerald-500" },
                  { label: "Zero Balance", count: zero,    color: "bg-slate-300" },
                  { label: "In Arrears", count: inArrears, color: "bg-error" },
                ].map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-on-surface">{label}</span>
                      <span className="text-sm font-bold text-on-surface">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${accounts.length > 0 ? (count / accounts.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-sm font-bold text-on-surface">
                    <span>Total Accounts</span>
                    <span>{accounts.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order status summary */}
        {ordersByStatus.length > 0 && (
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Order Status Summary</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/orders">
                Order Queue
              </NavLink>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ordersByStatus.map(({ status, count }) => (
                <div className="rounded-xl bg-surface-container-low p-4 text-center" key={status}>
                  <p className="font-headline text-2xl font-extrabold text-on-surface">{count}</p>
                  <p className="mt-1 text-[11px] font-bold capitalize text-slate-500">{status}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </AdminShell>
  );
}
