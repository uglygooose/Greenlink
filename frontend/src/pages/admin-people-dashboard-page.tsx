import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useReportsSummaryQuery } from "../features/admin-dashboard/reports-hooks";
import { useFinanceOutstandingSummaryQuery } from "../features/finance/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useSession } from "../session/session-context";

function formatAmount(amount: string): string {
  const value = parseFloat(amount);
  return `R${Math.abs(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AdminPeopleDashboardPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const hasCommunications = bootstrap?.module_flags?.communications ?? false;

  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const reportsSummaryQuery = useReportsSummaryQuery({ accessToken, selectedClubId });

  const members = directoryQuery.data ?? [];
  const outstandingSummary = outstandingSummaryQuery.data;
  const reportsSummary = reportsSummaryQuery.data;
  const memberBreakdown = reportsSummary?.member_breakdown;

  return (
    <AdminWorkspace
      title="People Dashboard"
      description="CRM-lite visibility across member coverage, account health, and future engagement structure."
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/members"
          >
            <MaterialSymbol filled icon="group" />
            Open Members
          </NavLink>
          {hasCommunications ? (
            <NavLink
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
              to="/admin/communications"
            >
              <MaterialSymbol icon="campaign" />
              Communications
            </NavLink>
          ) : null}
        </>
      }
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Directory</span>
              <MaterialSymbol className="text-primary" icon="group" />
            </div>
            <div className="flex items-baseline gap-2">
              {directoryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{members.length}</span>
                  <span className="text-xs font-medium text-primary">people on record</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finance Accounts</span>
              <MaterialSymbol className="text-emerald-500" icon="account_balance_wallet" />
            </div>
            <div className="flex items-baseline gap-2">
              {outstandingSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{outstandingSummary?.total_accounts ?? 0}</span>
                  <span className="text-xs font-medium text-emerald-600">backend linked</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-error bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">In Arrears</span>
              <MaterialSymbol className="text-error" icon="pending_actions" />
            </div>
            <div className="flex items-baseline gap-2">
              {outstandingSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmount(outstandingSummary?.total_outstanding_amount ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-error">{outstandingSummary?.accounts_in_arrears ?? 0} accounts</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">No Account</span>
              <MaterialSymbol className="text-secondary" icon="person_add" />
            </div>
            <div className="flex items-baseline gap-2">
              {reportsSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{memberBreakdown?.no_account_count ?? 0}</span>
                  <span className="text-xs font-medium text-secondary">{memberBreakdown?.new_member_count ?? 0} new members</span>
                </>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Coverage</p>
            <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">People and account health</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Member mix</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">
                    Admin {memberBreakdown?.admin_count ?? 0}
                  </span>
                  <span className="rounded-full bg-secondary-container px-3 py-1 text-xs font-bold text-on-secondary-container">
                    Staff {memberBreakdown?.staff_count ?? 0}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    Members {memberBreakdown?.member_count ?? 0}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Actionable gaps</p>
                <p className="mt-2 text-sm font-semibold text-on-surface">
                  {(memberBreakdown?.no_account_count ?? 0) > 0
                    ? `${memberBreakdown?.no_account_count ?? 0} people still need finance account coverage.`
                    : "All visible people are covered by current finance-account provisioning."}
                </p>
                <NavLink className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/members">
                  Review members
                </NavLink>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">CRM Lite</p>
              <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Signals available now</h3>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-sm font-semibold text-on-surface">Arrears follow-up</p>
                <p className="mt-1 text-xs text-slate-500">
                  Use backend outstanding summaries to route finance follow-up without client-side account math.
                </p>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-4">
                <p className="text-sm font-semibold text-on-surface">Communication foundation</p>
                <p className="mt-1 text-xs text-slate-500">
                  Directory and communications already provide the base for retention workflows.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Requires Backend Evolution</p>
            <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Future CRM panels</h3>
            <div className="mt-4 space-y-3">
              {[
                "Member value or spend proxy",
                "Rounds played and booking activity",
                "Segments and retention groups",
              ].map((label) => (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4" key={label}>
                  <p className="text-sm font-semibold text-on-surface">{label}</p>
                  <p className="mt-1 text-xs text-slate-500">Unavailable until backend rollups exist.</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Next Actions</p>
            <div className="mt-4 grid gap-3">
              <NavLink className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-on-surface transition-colors hover:bg-slate-50" to="/admin/members">
                <MaterialSymbol className="text-primary" icon="group" />
                Work the full member directory
              </NavLink>
              {hasCommunications ? (
                <NavLink className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-on-surface transition-colors hover:bg-slate-50" to="/admin/communications">
                  <MaterialSymbol className="text-primary" icon="campaign" />
                  Move into member communications
                </NavLink>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </AdminWorkspace>
  );
}
