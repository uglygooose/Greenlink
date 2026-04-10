import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useAdminDashboardSummaryQuery } from "../features/admin-dashboard/hooks";
import { useHalfwaySummaryQuery } from "../features/admin-dashboard/halfway-hooks";
import {
  useFinanceExportBatchesQuery,
  useFinanceOutstandingSummaryQuery,
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
} from "../features/finance/hooks";
import { useSession } from "../session/session-context";

function formatAmount(amount: string): string {
  const value = parseFloat(amount);
  return `R${Math.abs(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function batchStatusClassName(status: string): string {
  if (status === "generated") return "bg-secondary-container text-on-secondary-container";
  if (status === "void") return "bg-error-container text-on-error-container";
  if (status === "exported") return "bg-primary-container text-on-primary-container";
  return "bg-slate-100 text-slate-700";
}

export function AdminFinanceDashboardPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });
  const exportBatchesQuery = useFinanceExportBatchesQuery({ accessToken, selectedClubId });
  const summaryQuery = useAdminDashboardSummaryQuery({ accessToken, selectedClubId });
  const halfwaySummaryQuery = useHalfwaySummaryQuery({ accessToken, selectedClubId });

  const latestBatch = exportBatchesQuery.data?.batches?.[0] ?? null;
  const teeWarnings = summaryQuery.data?.tee_warnings ?? [];
  const activeQueueCount = halfwaySummaryQuery.data?.active_queue_count ?? 0;
  const unpaidOrderPostingsCount = outstandingSummaryQuery.data?.unpaid_order_postings_count ?? 0;

  return (
    <AdminWorkspace
      title="Finance Summary"
      description="Finance posture, operational close workflow, and export readiness using backend summaries only."
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/finance"
          >
            <MaterialSymbol filled icon="task_alt" />
            Open Close Day
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/reports"
          >
            <MaterialSymbol icon="analytics" />
            Reports
          </NavLink>
        </>
      }
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue Today</span>
              <MaterialSymbol className="text-primary" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {revenueSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmount(revenueSummaryQuery.data?.day.operational_revenue ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-primary">{revenueSummaryQuery.data?.day.charge_count ?? 0} charges</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Month Revenue</span>
              <MaterialSymbol className="text-secondary" icon="price_check" />
            </div>
            <div className="flex items-baseline gap-2">
              {revenueSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmount(revenueSummaryQuery.data?.month.total_revenue ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-secondary">month to date</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-error bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</span>
              <MaterialSymbol className="text-error" icon="pending_actions" />
            </div>
            <div className="flex items-baseline gap-2">
              {outstandingSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmount(outstandingSummaryQuery.data?.total_outstanding_amount ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-error">{outstandingSummaryQuery.data?.accounts_in_arrears ?? 0} accounts</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Export Batches</span>
              <MaterialSymbol className="text-emerald-500" icon="file_export" />
            </div>
            <div className="flex items-baseline gap-2">
              {exportBatchesQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{exportBatchesQuery.data?.total_count ?? 0}</span>
                  <span className="text-xs font-medium text-emerald-600">{latestBatch ? latestBatch.status : "none yet"}</span>
                </>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Close Day System</p>
            <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">Operational close workflow</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">1. Golf closure</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${teeWarnings.length > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {teeWarnings.length > 0 ? "attention" : "clear"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {summaryQuery.isLoading
                    ? "Loading golf closure posture..."
                    : teeWarnings.length > 0
                      ? `${teeWarnings.length} tee sheet issue${teeWarnings.length === 1 ? "" : "s"} still require operator review.`
                      : "No live tee sheet notices are currently blocking close posture."}
                </p>
                <NavLink className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/golf/tee-sheet">
                  Open tee sheet
                </NavLink>
              </div>

              <div className="rounded-2xl bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">2. Commerce settlement check</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${(activeQueueCount > 0 || unpaidOrderPostingsCount > 0) ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {(activeQueueCount > 0 || unpaidOrderPostingsCount > 0) ? "active" : "clear"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {halfwaySummaryQuery.isLoading || outstandingSummaryQuery.isLoading
                    ? "Loading commerce posture..."
                    : `${activeQueueCount} active queue item${activeQueueCount === 1 ? "" : "s"} and ${unpaidOrderPostingsCount} unpaid posting${unpaidOrderPostingsCount === 1 ? "" : "s"} remain.`}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <NavLink className="text-xs font-bold uppercase tracking-wide text-primary" to="/admin/orders">
                    Order queue
                  </NavLink>
                  <NavLink className="text-xs font-bold uppercase tracking-wide text-primary" to="/admin/pos-terminal">
                    POS terminal
                  </NavLink>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">3. Finance posting and export</p>
                  {latestBatch ? (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${batchStatusClassName(latestBatch.status)}`}>
                      {latestBatch.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {exportBatchesQuery.isLoading
                    ? "Loading export posture..."
                    : latestBatch
                      ? `Latest batch covers ${formatDate(latestBatch.date_from)} to ${formatDate(latestBatch.date_to)} with ${latestBatch.transaction_count} persisted rows.`
                      : "No export batch has been generated yet."}
                </p>
                <NavLink className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/finance">
                  Open close day
                </NavLink>
              </div>

              <div className="rounded-2xl bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-on-surface">4. Final summary snapshot</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                    descriptive
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Reports provide the end-state read surface today. A persisted close snapshot is still a backend evolution item.
                </p>
                <NavLink className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/reports">
                  Open reports
                </NavLink>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Finance Summary</p>
              <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Current backend posture</h3>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-sm font-semibold text-on-surface">Transaction volume</p>
                <p className="mt-2 text-xs text-slate-500">
                  {transactionVolumeSummaryQuery.isLoading
                    ? "Loading transaction volume..."
                    : `${transactionVolumeSummaryQuery.data?.day.total_transaction_count ?? 0} transactions today and ${transactionVolumeSummaryQuery.data?.month.total_transaction_count ?? 0} month to date.`}
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-sm font-semibold text-on-surface">Outstanding exposure</p>
                <p className="mt-2 text-xs text-slate-500">
                  {outstandingSummaryQuery.isLoading
                    ? "Loading exposure..."
                    : `${outstandingSummaryQuery.data?.pending_items_count ?? 0} pending finance items remain across the club ledger.`}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Separation of Concerns</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Reports</p>
                <p className="mt-1 text-xs text-slate-500">Analytics and read surfaces only.</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Finance exports</p>
                <p className="mt-1 text-xs text-slate-500">Canonical batch generation, reconciliation, and mapped handoff.</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Operational close</p>
                <p className="mt-1 text-xs text-slate-500">Cross-domain workflow spanning golf, commerce, and finance.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminWorkspace>
  );
}
