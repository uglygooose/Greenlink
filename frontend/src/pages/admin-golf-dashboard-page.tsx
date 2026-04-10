import { Link, NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useAdminDashboardSummaryQuery } from "../features/admin-dashboard/hooks";
import { useFinanceRevenueSummaryQuery } from "../features/finance/hooks";
import { useCoursesQuery, usePricingMatricesQuery, useRuleSetsQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useSession } from "../session/session-context";
import type { DashboardTargetContext } from "../types/admin-dashboard";

function formatAmount(amount: number): string {
  return `R${Math.abs(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAmountStr(amount: string): string {
  return formatAmount(parseFloat(amount));
}

function findTarget(
  targets: DashboardTargetContext[] | undefined,
  domainKey: string,
  metricKey: string,
): DashboardTargetContext | null {
  return targets?.find((t) => t.domain_key === domainKey && t.metric_key === metricKey) ?? null;
}

function targetLabel(target: DashboardTargetContext | null): string {
  if (!target) {
    return "No live golf target";
  }
  const value = target.unit === "currency" ? formatAmount(target.target_value) : target.target_value.toLocaleString("en-ZA");
  return `${target.metric_label} · ${value}`;
}

export function AdminGolfDashboardPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const summaryQuery = useAdminDashboardSummaryQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });

  const summary = summaryQuery.data;
  const teeOccupancy = summary?.tee_occupancy;
  const occupancyPct = teeOccupancy?.occupancy_pct;
  const teeWarnings = summary?.tee_warnings ?? [];
  const activeTargets = summary?.active_targets;
  const golfRoundsTarget = findTarget(activeTargets, "golf", "rounds_booked");
  const golfRevenueTarget = findTarget(activeTargets, "finance", "cash_collected");

  return (
    <AdminWorkspace
      title="Golf Summary"
      description="Demand, utilization, revenue posture, and golf configuration readiness."
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/golf/tee-sheet"
          >
            <MaterialSymbol filled icon="golf_course" />
            Open Tee Sheet
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/golf/settings"
          >
            <MaterialSymbol icon="tune" />
            Golf Settings
          </NavLink>
        </>
      }
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Utilization</span>
              <MaterialSymbol className="text-primary" icon="golf_course" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : occupancyPct !== null && occupancyPct !== undefined ? (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{occupancyPct}%</span>
                  <span className="text-xs font-medium text-primary">
                    {teeOccupancy?.booked_slots}/{teeOccupancy?.total_slots} slots
                  </span>
                </>
              ) : (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue Today</span>
              <MaterialSymbol className="text-emerald-500" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {revenueSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmountStr(revenueSummaryQuery.data?.day.operational_revenue ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-emerald-600">live backend summary</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Courses</span>
              <MaterialSymbol className="text-secondary" icon="map" />
            </div>
            <div className="flex items-baseline gap-2">
              {coursesQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{coursesQuery.data?.length ?? 0}</span>
                  <span className="text-xs font-medium text-secondary">{teesQuery.data?.length ?? 0} tees</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-amber-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Warnings</span>
              <MaterialSymbol className="text-amber-500" icon="warning" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{teeWarnings.length}</span>
                  <span className="text-xs font-medium text-amber-700">tee sheet notices</span>
                </>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Revenue Engine</p>
            <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">Utilization and revenue posture</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Demand</p>
                <p className="mt-2 text-sm font-semibold text-on-surface">
                  {summaryQuery.isLoading
                    ? "Loading tee sheet posture..."
                    : occupancyPct !== null && occupancyPct !== undefined
                      ? `${teeOccupancy?.booked_slots ?? 0} booked slots across ${teeOccupancy?.total_slots ?? 0} live slots.`
                      : "Utilization unavailable."}
                </p>
                <p className="mt-3 text-xs text-slate-500">{targetLabel(golfRoundsTarget)}</p>
              </div>
              <div className="rounded-2xl bg-white p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Revenue vs capacity</p>
                <p className="mt-2 text-sm font-semibold text-on-surface">
                  {revenueSummaryQuery.isLoading
                    ? "Loading revenue posture..."
                    : `${formatAmountStr(revenueSummaryQuery.data?.day.operational_revenue ?? "0.00")} captured today across ${revenueSummaryQuery.data?.day.charge_count ?? 0} golf and operations charges.`}
                </p>
                <p className="mt-3 text-xs text-slate-500">{targetLabel(golfRevenueTarget)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Exceptions</p>
              <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Live golf issues</h3>
            </div>
            <div className="space-y-3 p-4">
              {summaryQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((item) => (
                    <div className="h-16 animate-pulse rounded-2xl bg-slate-100" key={item} />
                  ))}
                </div>
              ) : null}
              {!summaryQuery.isLoading && teeWarnings.length === 0 ? (
                <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-900">No live tee sheet issues are active.</div>
              ) : null}
              {teeWarnings.map((warning) => (
                <div className="flex items-start gap-4 rounded-2xl bg-surface-container-low p-4" key={warning.code}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <MaterialSymbol icon="golf_course" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-on-surface">{warning.message}</p>
                    <Link className="mt-2 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/golf/tee-sheet">
                      Resolve on tee sheet
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Configuration Readiness</p>
            <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Golf settings surface</h3>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface">Rulesets</span>
                  <span className="text-sm font-bold text-on-surface">{ruleSetsQuery.data?.length ?? 0}</span>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-on-surface">Pricing matrices</span>
                  <span className="text-sm font-bold text-on-surface">{pricingQuery.data?.length ?? 0}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Pricing insights</p>
                <p className="mt-1 text-xs text-slate-500">Structure is ready for pricing recommendations when backend optimization signals exist.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Primary Actions</p>
            <div className="mt-4 grid gap-3">
              <NavLink className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-on-surface transition-colors hover:bg-slate-50" to="/admin/golf/tee-sheet">
                <MaterialSymbol className="text-primary" icon="event_available" />
                Manage bookings in the tee sheet
              </NavLink>
              <NavLink className="flex items-center gap-3 rounded-2xl bg-white p-4 font-semibold text-on-surface transition-colors hover:bg-slate-50" to="/admin/golf/settings">
                <MaterialSymbol className="text-primary" icon="tune" />
                Update golf settings, rules, and pricing definitions
              </NavLink>
            </div>
          </div>
        </section>
      </div>
    </AdminWorkspace>
  );
}
