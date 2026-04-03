import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  useFinanceOutstandingSummaryQuery,
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
} from "../features/finance/hooks";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useOrdersQuery } from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { FinanceTransactionSource, FinanceTransactionType } from "../types/finance";

function formatR(amount: string): string {
  return `R${Math.abs(parseFloat(amount)).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const ordersQuery = useOrdersQuery({ accessToken, selectedClubId, status: null });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });

  const revenuePeriod = revenueSummaryQuery.data?.month;
  const transactionVolumePeriod = transactionVolumeSummaryQuery.data?.month;
  const outstandingSummary = outstandingSummaryQuery.data;
  const members = directoryQuery.data ?? [];
  const orders = ordersQuery.data ?? [];

  const revenueBySource = revenuePeriod?.by_source ?? [];
  const transactionTypes = transactionVolumePeriod?.by_type ?? [];

  const adminCount = members.filter((member) => member.membership.role === "CLUB_ADMIN").length;
  const staffCount = members.filter((member) => member.membership.role === "CLUB_STAFF").length;
  const memberOnlyCount = members.length - adminCount - staffCount;

  const ordersByStatus = ["placed", "preparing", "ready", "collected", "cancelled"].map((status) => ({
    status,
    count: orders.filter((order) => order.status === status).length,
  })).filter((order) => order.count > 0);

  const totalOrders = orders.length;

  return (
    <AdminWorkspace
        description="Cross-module finance, membership, and order reporting from live operational data."
        kpis={
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Revenue</span>
                <MaterialSymbol className="text-primary" icon="payments" />
              </div>
              <div className="flex items-baseline gap-2">
                {revenueSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">â€”</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {formatR(revenuePeriod?.total_revenue ?? "0.00")}
                    </span>
                    <span className="text-xs font-medium text-primary">{revenuePeriod?.charge_count ?? 0} charges</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Members</span>
                <MaterialSymbol className="text-secondary" icon="group" />
              </div>
              <div className="flex items-baseline gap-2">
                {directoryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">â€”</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{members.length}</span>
                    <span className="text-xs font-medium text-secondary">{coursesQuery.data?.length ?? 0} courses</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-emerald-500">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Orders</span>
                <MaterialSymbol className="text-emerald-500" icon="receipt_long" />
              </div>
              <div className="flex items-baseline gap-2">
                {ordersQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">â€”</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{totalOrders}</span>
                    <span className="text-xs font-medium text-emerald-600">
                      {orders.filter((order) => order.status === "collected").length} collected
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finance Accounts</span>
                <MaterialSymbol className="text-error" icon="account_balance" />
              </div>
              <div className="flex items-baseline gap-2">
                {outstandingSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">â€”</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{outstandingSummary?.total_accounts ?? 0}</span>
                    <span className="text-xs font-medium text-error">{outstandingSummary?.accounts_in_arrears ?? 0} in arrears</span>
                  </>
                )}
              </div>
            </div>
          </div>
        }
        title="Reports"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Revenue by Source</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
                Full Journal
              </NavLink>
            </div>
            {revenueSummaryQuery.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((item) => <div className="h-8 animate-pulse rounded bg-slate-100" key={item} />)}</div>
            ) : revenueBySource.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No revenue data yet.</p>
            ) : (
              <div className="space-y-4">
                {revenueBySource.map(({ source, total_revenue, charge_count, revenue_share_pct }) => {
                  const meta = SOURCE_META[source];
                  return (
                    <div key={source}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MaterialSymbol className="text-sm text-slate-500" icon={meta.icon} />
                          <span className="text-sm font-semibold text-on-surface">{meta.label}</span>
                          <span className="text-[10px] text-slate-400">{charge_count} entries</span>
                        </div>
                        <span className="text-sm font-bold text-on-surface">{formatR(total_revenue)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${meta.color} transition-all`}
                          style={{ width: `${revenue_share_pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between text-sm font-bold text-on-surface">
                    <span>Total</span>
                    <span>{formatR(revenuePeriod?.total_revenue ?? "0.00")}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <h3 className="mb-5 font-headline text-base font-bold text-on-surface">Transaction Types</h3>
            {transactionVolumeSummaryQuery.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((item) => <div className="h-8 animate-pulse rounded bg-slate-100" key={item} />)}</div>
            ) : transactionTypes.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No transactions yet.</p>
            ) : (
              <div className="space-y-4">
                {transactionTypes.map(({ type, total_absolute_amount, transaction_count, volume_share_pct }) => {
                  const meta = TYPE_META[type];
                  return (
                    <div key={type}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${meta.color}`} />
                          <span className="text-sm font-semibold text-on-surface">{meta.label}</span>
                          <span className="text-[10px] text-slate-400">{transaction_count}</span>
                        </div>
                        <span className="text-sm font-bold text-on-surface">{formatR(total_absolute_amount)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${meta.color} transition-all`}
                          style={{ width: `${volume_share_pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Member Breakdown</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/members">
                View All
              </NavLink>
            </div>
            {directoryQuery.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((item) => <div className="h-8 animate-pulse rounded bg-slate-100" key={item} />)}</div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "Members", count: memberOnlyCount, color: "bg-primary" },
                  { label: "Staff",   count: staffCount,      color: "bg-secondary" },
                  { label: "Admins",  count: adminCount,      color: "bg-tertiary" },
                ].filter((row) => row.count > 0).map(({ label, count, color }) => (
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

          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-headline text-base font-bold text-on-surface">Account Health</h3>
              <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
                Resolve
              </NavLink>
            </div>
            {outstandingSummaryQuery.isLoading ? (
              <div className="space-y-3">{[1, 2, 3].map((item) => <div className="h-8 animate-pulse rounded bg-slate-100" key={item} />)}</div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: "In Credit",    count: outstandingSummary?.accounts_in_credit ?? 0,  pct: outstandingSummary?.accounts_in_credit_pct ?? "0",  color: "bg-emerald-500" },
                  { label: "Zero Balance", count: outstandingSummary?.accounts_settled ?? 0,     pct: outstandingSummary?.accounts_settled_pct ?? "0",     color: "bg-slate-300" },
                  { label: "In Arrears",   count: outstandingSummary?.accounts_in_arrears ?? 0,  pct: outstandingSummary?.accounts_in_arrears_pct ?? "0",  color: "bg-error" },
                ].map(({ label, count, pct, color }) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-on-surface">{label}</span>
                      <span className="text-sm font-bold text-on-surface">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-sm font-bold text-on-surface">
                    <span>Total Accounts</span>
                    <span>{outstandingSummary?.total_accounts ?? 0}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

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
    </AdminWorkspace>
  );
}
