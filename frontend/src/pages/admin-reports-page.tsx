import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useReportsSummaryQuery } from "../features/admin-dashboard/reports-hooks";
import {
  useFinanceOutstandingSummaryQuery,
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
} from "../features/finance/hooks";
import {
  useArchiveClubTargetMutation,
  useClubTargetsQuery,
  useCreateClubTargetMutation,
  useTargetMetricCatalogQuery,
  useUpdateClubTargetMutation,
} from "../features/targets/hooks";
import { useSession } from "../session/session-context";
import type { ClubTarget, ClubTargetUpsertInput } from "../types/targets";
import type { FinanceTransactionSource, FinanceTransactionType } from "../types/finance";

function formatR(amount: string): string {
  return `R${Math.abs(parseFloat(amount)).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTargetValue(target: ClubTarget): string {
  if (target.unit === "currency") {
    return `R${target.target_value.toFixed(2)}`;
  }
  return `${target.target_value}`;
}

const DOMAIN_ACTION: Record<string, { label: string; href: string; icon: string }> = {
  golf:    { label: "Open Tee Sheet",  href: "/admin/golf/tee-sheet", icon: "golf_course" },
  finance: { label: "Close Day",       href: "/admin/finance",        icon: "payments" },
  members: { label: "View Members",    href: "/admin/members",        icon: "group" },
  orders:  { label: "Order Queue",     href: "/admin/orders",         icon: "receipt_long" },
};

const CURRENT_YEAR = new Date().getFullYear();

function defaultTargetForm(year = CURRENT_YEAR): ClubTargetUpsertInput {
  return {
    domain_key: "golf",
    metric_key: "",
    period_key: "yearly",
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
    target_value: 1,
  };
}

function deriveYearFromForm(form: ClubTargetUpsertInput): number {
  return parseInt(form.period_start.slice(0, 4), 10) || CURRENT_YEAR;
}

function formatPace(value: number, unit: string, divisor: number): string {
  const pace = value / divisor;
  if (unit === "currency") return `R${pace.toFixed(2)}`;
  if (pace < 1) return pace.toFixed(2);
  return Math.round(pace).toLocaleString("en-ZA");
}

const SOURCE_META: Record<FinanceTransactionSource, { label: string; icon: string; color: string }> = {
  booking:    { label: "Bookings",   icon: "golf_course",   color: "bg-blue-500" },
  pos:        { label: "POS",        icon: "point_of_sale", color: "bg-emerald-500" },
  order:      { label: "Orders",     icon: "restaurant",    color: "bg-amber-500" },
  manual:     { label: "Manual",     icon: "edit_note",     color: "bg-slate-400" },
  settlement: { label: "Settlement", icon: "handshake",     color: "bg-purple-400" },
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

  const reportsSummaryQuery = useReportsSummaryQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const catalogQuery = useTargetMetricCatalogQuery({ accessToken, selectedClubId });
  const createTargetMutation = useCreateClubTargetMutation();
  const updateTargetMutation = useUpdateClubTargetMutation();
  const archiveTargetMutation = useArchiveClubTargetMutation();

  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [targetForm, setTargetForm] = useState<ClubTargetUpsertInput>(defaultTargetForm);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reports = reportsSummaryQuery.data;
  const revenuePeriod = revenueSummaryQuery.data?.month;
  const transactionVolumePeriod = transactionVolumeSummaryQuery.data?.month;
  const outstandingSummary = outstandingSummaryQuery.data;

  const revenueBySource = revenuePeriod?.by_source ?? [];
  const transactionTypes = transactionVolumePeriod?.by_type ?? [];
  const activeTargets = (targetsQuery.data?.items ?? []).filter((t) => !t.archived);

  const arrears = outstandingSummary?.accounts_in_arrears ?? 0;
  const pendingItems = outstandingSummary?.pending_items_count ?? 0;

  // Catalog-driven form cascades
  const selectedDomain = catalogQuery.data?.items.find((item) => item.domain_key === targetForm.domain_key) ?? null;
  const availableMetrics = selectedDomain?.metrics ?? [];

  // When domain changes and current metric_key is no longer valid, reset to first available
  useEffect(() => {
    if (!selectedDomain || availableMetrics.some((m) => m.metric_key === targetForm.metric_key)) return;
    setTargetForm((c) => ({ ...c, metric_key: availableMetrics[0]?.metric_key ?? "" }));
  }, [availableMetrics, targetForm.metric_key, selectedDomain]);

  // Seed form from catalog once loaded (only if not already set)
  useEffect(() => {
    if (catalogQuery.data?.items.length && !targetForm.metric_key) {
      const first = catalogQuery.data.items[0];
      setTargetForm((c) => ({
        ...c,
        domain_key: first.domain_key,
        metric_key: first.metrics[0]?.metric_key ?? "",
      }));
    }
  }, [catalogQuery.data, targetForm.metric_key]);

  function beginEdit(target: ClubTarget): void {
    setEditingTargetId(target.id);
    const year = parseInt(target.period_start.slice(0, 4), 10) || CURRENT_YEAR;
    setTargetForm({
      domain_key: target.domain_key,
      metric_key: target.metric_key,
      period_key: "yearly",
      period_start: `${year}-01-01`,
      period_end: `${year}-12-31`,
      target_value: target.target_value,
    });
    setShowTargetForm(true);
    setNotice(null);
  }

  async function handleTargetSubmit(): Promise<void> {
    setNotice(null);
    if (editingTargetId) {
      await updateTargetMutation.mutateAsync({ targetId: editingTargetId, payload: targetForm });
      setNotice("Target updated.");
    } else {
      await createTargetMutation.mutateAsync(targetForm);
      setNotice("Target created.");
    }
    setEditingTargetId(null);
    setTargetForm(defaultTargetForm());
    setShowTargetForm(false);
  }

  async function handleArchive(targetId: string): Promise<void> {
    setNotice(null);
    await archiveTargetMutation.mutateAsync(targetId);
    setNotice("Target archived.");
  }

  return (
    <AdminWorkspace
      description="Club performance targets, finance summaries, and operational reporting from live data."
      actions={
        notice ? (
          <div className="rounded-xl bg-primary-container/40 px-4 py-2 text-sm font-semibold text-on-primary-container">
            {notice}
          </div>
        ) : null
      }
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Revenue</span>
              <MaterialSymbol className="text-primary" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {revenueSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
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

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Members</span>
              <MaterialSymbol className="text-secondary" icon="group" />
            </div>
            <div className="flex items-baseline gap-2">
              {reportsSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {reports?.member_breakdown.total ?? 0}
                  </span>
                  <span className="text-xs font-medium text-secondary">
                    {reports?.course_count ?? 0} courses
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Orders</span>
              <MaterialSymbol className="text-emerald-500" icon="receipt_long" />
            </div>
            <div className="flex items-baseline gap-2">
              {reportsSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {reports?.order_status_breakdown.total ?? 0}
                  </span>
                  <span className="text-xs font-medium text-emerald-600">
                    {reports?.order_status_breakdown.collected_count ?? 0} collected
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border-l-4 border-error bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finance Accounts</span>
              <MaterialSymbol className="text-error" icon="account_balance" />
            </div>
            <div className="flex items-baseline gap-2">
              {outstandingSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {outstandingSummary?.total_accounts ?? 0}
                  </span>
                  {arrears > 0 ? (
                    <NavLink
                      aria-label="Resolve arrears in finance"
                      className="text-xs font-medium text-error underline"
                      to="/admin/finance"
                    >
                      {arrears} in arrears
                    </NavLink>
                  ) : (
                    <span className="text-xs font-medium text-error">
                      {arrears} in arrears
                    </span>
                  )}
                </>
              )}
            </div>
            {pendingItems > 0 ? (
              <NavLink
                aria-label="Close day to resolve pending finance items"
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline"
                to="/admin/finance"
              >
                <MaterialSymbol className="text-[14px]" icon="warning" />
                {pendingItems} pending — close day
              </NavLink>
            ) : null}
          </div>
        </div>
      }
      title="Performance"
    >
      {/* ── Targets section ─────────────────────────────────── */}
      <section aria-label="Performance targets">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Targets</p>
            <h2 className="mt-1 font-headline text-xl font-bold text-on-surface">Club Performance Targets</h2>
          </div>
          <button
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"
            onClick={() => {
              setEditingTargetId(null);
              setTargetForm(defaultTargetForm());
              setShowTargetForm((prev) => !prev);
            }}
            type="button"
          >
            <MaterialSymbol className="text-[16px]" icon="add" />
            {showTargetForm && !editingTargetId ? "Cancel" : "Add Target"}
          </button>
        </div>

        {showTargetForm ? (
          <div className="mb-6 rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
            <h3 className="mb-4 font-headline text-base font-bold text-on-surface">
              {editingTargetId ? "Edit Target" : "Create Target"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                Domain
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(e) =>
                    setTargetForm((c) => ({
                      ...c,
                      domain_key: e.target.value,
                      metric_key:
                        catalogQuery.data?.items.find((item) => item.domain_key === e.target.value)?.metrics[0]
                          ?.metric_key ?? "",
                    }))
                  }
                  value={targetForm.domain_key}
                >
                  {(catalogQuery.data?.items ?? []).map((domain) => (
                    <option key={domain.domain_key} value={domain.domain_key}>
                      {domain.domain_label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                Metric
                <select
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(e) => setTargetForm((c) => ({ ...c, metric_key: e.target.value }))}
                  value={targetForm.metric_key}
                >
                  {availableMetrics.map((metric) => (
                    <option key={metric.metric_key} value={metric.metric_key}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                Annual Target
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(e) => setTargetForm((c) => ({ ...c, target_value: Number(e.target.value || "0") }))}
                  type="number"
                  value={targetForm.target_value}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                Year
                <select
                  aria-label="Target year"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(e) => {
                    const year = Number(e.target.value);
                    setTargetForm((c) => ({
                      ...c,
                      period_key: "yearly",
                      period_start: `${year}-01-01`,
                      period_end: `${year}-12-31`,
                    }));
                  }}
                  value={deriveYearFromForm(targetForm)}
                >
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
                onClick={() => { void handleTargetSubmit(); }}
                type="button"
              >
                {editingTargetId ? "Save Target" : "Create Target"}
              </button>
              {editingTargetId ? (
                <button
                  className="rounded-xl bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface"
                  onClick={() => {
                    setEditingTargetId(null);
                    setTargetForm(defaultTargetForm());
                    setShowTargetForm(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {targetsQuery.isLoading ? (
          <div className="space-y-3 mb-6">
            {[1, 2].map((i) => <div className="h-16 animate-pulse rounded-2xl bg-slate-100" key={i} />)}
          </div>
        ) : activeTargets.length === 0 ? (
          <div className="mb-6 rounded-2xl border border-dashed border-slate-200 bg-surface-container-lowest px-6 py-8 text-center text-sm text-slate-400">
            No active targets defined. Add a target to start tracking performance.
          </div>
        ) : (
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeTargets.map((target) => {
              const action = DOMAIN_ACTION[target.domain_key];
              return (
                <div
                  className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-5 shadow-sm"
                  key={target.id}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {target.domain_label} · {target.period_start.slice(0, 4)} annual
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-on-surface">{target.metric_label}</p>
                      <p className="mt-1 font-headline text-xl font-extrabold text-on-surface">
                        {formatTargetValue(target)}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">/ year</span>
                      </p>
                      <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
                        <span title="Monthly pace">
                          <span className="font-semibold">{formatPace(target.target_value, target.unit, 12)}</span>
                          /mo
                        </span>
                        <span title="Daily pace">
                          <span className="font-semibold">{formatPace(target.target_value, target.unit, 365)}</span>
                          /day
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <button
                        className="rounded-lg bg-surface-container px-2.5 py-1.5 text-[11px] font-semibold text-on-surface"
                        onClick={() => beginEdit(target)}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        aria-label={`Archive ${target.metric_label} target`}
                        className="rounded-lg bg-error/10 px-2.5 py-1.5 text-[11px] font-semibold text-error"
                        onClick={() => { void handleArchive(target.id); }}
                        type="button"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                  {action ? (
                    <NavLink
                      aria-label={`${action.label} — take action on ${target.metric_label}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                      to={action.href}
                    >
                      <MaterialSymbol className="text-[14px]" icon={action.icon} />
                      {action.label}
                    </NavLink>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Finance + operational reporting ─────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">Revenue by Source</h3>
            <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
              Full Journal
            </NavLink>
          </div>
          {revenueSummaryQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
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
                      <div className={`h-full rounded-full ${meta.color} transition-all`} style={{ width: `${revenue_share_pct}%` }} />
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

        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <h3 className="mb-5 font-headline text-base font-bold text-on-surface">Transaction Types</h3>
          {transactionVolumeSummaryQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
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
                      <div className={`h-full rounded-full ${meta.color} transition-all`} style={{ width: `${volume_share_pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">Member Breakdown</h3>
            <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/members">
              View All
            </NavLink>
          </div>
          {reportsSummaryQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
          ) : (
            <div className="space-y-4">
              {[
                { label: "Members", count: reports?.member_breakdown.member_count ?? 0, pct: reports?.member_breakdown.member_pct ?? 0, color: "bg-primary" },
                { label: "Staff",   count: reports?.member_breakdown.staff_count ?? 0,  pct: reports?.member_breakdown.staff_pct ?? 0,  color: "bg-secondary" },
                { label: "Admins",  count: reports?.member_breakdown.admin_count ?? 0,  pct: reports?.member_breakdown.admin_pct ?? 0,  color: "bg-tertiary" },
              ].filter((row) => row.count > 0).map(({ label, count, pct, color }) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-on-surface">{label}</span>
                    <span className="text-sm font-bold text-on-surface">{count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex justify-between text-sm font-bold text-on-surface">
                  <span>Total</span>
                  <span>{reports?.member_breakdown.total ?? 0}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">Account Health</h3>
            <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/finance">
              Resolve
            </NavLink>
          </div>
          {outstandingSummaryQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}</div>
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
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
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

      {(reports?.order_status_breakdown.by_status.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">Order Status Summary</h3>
            <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/admin/orders">
              Order Queue
            </NavLink>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {reports?.order_status_breakdown.by_status.map(({ status, count }) => (
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
