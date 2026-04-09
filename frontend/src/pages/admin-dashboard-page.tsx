import { Link, NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useAdminDashboardSummaryQuery } from "../features/admin-dashboard/hooks";
import { useHalfwaySummaryQuery } from "../features/admin-dashboard/halfway-hooks";
import { useReportsSummaryQuery } from "../features/admin-dashboard/reports-hooks";
import { useFinanceOutstandingSummaryQuery, useFinanceRevenueSummaryQuery } from "../features/finance/hooks";
import { useSession } from "../session/session-context";
import type { DashboardActivityItem, DashboardTargetContext } from "../types/admin-dashboard";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ActionAlert {
  code: string;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  tone: "critical" | "warning" | "info";
  icon: string;
}

interface QuickAction {
  title: string;
  subtitle: string;
  href: string;
  icon: string;
}

function formatAmount(amount: number): string {
  return `R${Math.abs(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAmountStr(amount: string): string {
  return formatAmount(parseFloat(amount));
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function findTarget(
  targets: DashboardTargetContext[] | undefined,
  domainKey: string,
  metricKey: string,
): DashboardTargetContext | null {
  return targets?.find((t) => t.domain_key === domainKey && t.metric_key === metricKey) ?? null;
}

function TargetHint({ target }: { target: DashboardTargetContext }): JSX.Element {
  const value =
    target.unit === "currency"
      ? formatAmount(target.target_value)
      : target.target_value.toLocaleString("en-ZA");
  return (
    <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
      {target.period_key} goal · {value}
    </p>
  );
}

function activityIcon(entry: DashboardActivityItem): { icon: string; className: string } {
  if (entry.source === "booking") return { icon: "golf_course", className: "bg-blue-50 text-blue-600" };
  if (entry.source === "pos") return { icon: "point_of_sale", className: "bg-emerald-50 text-emerald-600" };
  if (entry.source === "order") return { icon: "restaurant", className: "bg-amber-50 text-amber-600" };
  if (entry.type === "payment") return { icon: "payments", className: "bg-secondary-container text-secondary" };
  return { icon: "receipt_long", className: "bg-surface-container-high text-on-surface-variant" };
}

function alertToneClassName(tone: ActionAlert["tone"]): string {
  if (tone === "critical") return "bg-error-container/50 text-on-error-container";
  if (tone === "warning") return "bg-amber-100 text-amber-800";
  return "bg-primary-container/35 text-on-primary-container";
}

function buildQuickActions(hasComms: boolean): QuickAction[] {
  const actions: QuickAction[] = [
    {
      title: "Book Round",
      subtitle: "Open the tee sheet to place a booking",
      href: "/admin/golf/tee-sheet",
      icon: "event_available",
    },
    {
      title: "Open Tee Sheet",
      subtitle: "Move directly into live golf operations",
      href: "/admin/golf/tee-sheet",
      icon: "golf_course",
    },
    {
      title: "Start Close Day",
      subtitle: "Move into finance posting, export, and reconciliation",
      href: "/admin/finance",
      icon: "task_alt",
    },
    {
      title: "Open POS",
      subtitle: "Jump into the live commerce terminal",
      href: "/admin/pos-terminal",
      icon: "point_of_sale",
    },
  ];

  if (hasComms) {
    actions.push({
      title: "Communications",
      subtitle: "Open club updates and member messaging surfaces",
      href: "/admin/communications",
      icon: "campaign",
    });
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Today layout (ux_rebuild_v1)
// ---------------------------------------------------------------------------

interface AlertChipProps {
  count: number;
  label: string;
  href: string;
  tone: "amber" | "red" | "blue" | "green";
}

function AlertChip({ count, label, href, tone }: AlertChipProps): JSX.Element {
  const toneMap = {
    amber: "bg-amber-100 text-amber-800 hover:bg-amber-200",
    red: "bg-error-container/60 text-on-error-container hover:bg-error-container",
    blue: "bg-blue-100 text-blue-800 hover:bg-blue-200",
    green: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  };
  return (
    <Link
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${toneMap[tone]}`}
      to={href}
    >
      <span className="font-bold">{count}</span>
      <span>{label}</span>
      <MaterialSymbol className="text-[16px]" icon="arrow_forward" />
    </Link>
  );
}

interface WorkCardProps {
  icon: string;
  iconClass: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
}

function WorkCard({ icon, iconClass, title, detail, actionLabel, href }: WorkCardProps): JSX.Element {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconClass}`}>
        <MaterialSymbol icon={icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface">{title}</p>
        <p className="mt-1 text-sm text-on-surface-variant">{detail}</p>
      </div>
      <NavLink
        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-primary-dim"
        to={href}
      >
        {actionLabel}
      </NavLink>
    </div>
  );
}

function TodayLayout(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClubName = bootstrap?.selected_club?.name ?? "Club workspace";
  const timezone = bootstrap?.selected_club?.timezone ?? "";

  const summaryQuery = useAdminDashboardSummaryQuery({ accessToken, selectedClubId });
  const summary = summaryQuery.data;

  const unpaidCount = summary?.unpaid_bookings_today ?? 0;
  const noShowCount = summary?.no_show_risk_count ?? 0;
  const closeDayReady = summary?.close_day_ready ?? true;
  const teeOccupancy = summary?.tee_occupancy ?? null;
  const occupancyPct = teeOccupancy?.occupancy_pct ?? null;
  const recentActivity = summary?.recent_activity ?? [];
  const activeTargets = summary?.active_targets ?? [];

  // Build work queue cards — only show items that need attention
  const workCards: WorkCardProps[] = [];

  if (unpaidCount > 0) {
    workCards.push({
      icon: "payments",
      iconClass: "bg-amber-100 text-amber-700",
      title: "Unpaid bookings",
      detail: `${unpaidCount} booking${unpaidCount === 1 ? "" : "s"} today ${unpaidCount === 1 ? "has" : "have"} outstanding payment.`,
      actionLabel: "Open Tee Sheet",
      href: "/admin/golf/tee-sheet?filter=unpaid",
    });
  }

  if (noShowCount > 0) {
    workCards.push({
      icon: "person_off",
      iconClass: "bg-error-container/60 text-on-error-container",
      title: "No-show risk",
      detail: `${noShowCount} reserved booking${noShowCount === 1 ? "" : "s"} ${noShowCount === 1 ? "has" : "have"} passed their start time without check-in.`,
      actionLabel: "Review",
      href: "/admin/golf/tee-sheet?filter=no-shows",
    });
  }

  if (!closeDayReady) {
    workCards.push({
      icon: "task_alt",
      iconClass: "bg-primary-container/50 text-primary",
      title: "Close Day not ready",
      detail: "Resolve unpaid bookings or no-show risks before closing the day.",
      actionLabel: "Go to Finance",
      href: "/admin/finance",
    });
  }

  const hasWorkItems = workCards.length > 0;

  return (
    <AdminWorkspace
      description={`${selectedClubName}${timezone ? ` · ${timezone}` : ""}`}
      title="Today"
    >
      <div className="space-y-8">
        {/* Alerts strip */}
        <div className="flex flex-wrap items-center gap-3">
          {summaryQuery.isLoading ? (
            <div className="h-9 w-48 animate-pulse rounded-full bg-slate-100" />
          ) : (
            <>
              {unpaidCount > 0 && (
                <AlertChip
                  count={unpaidCount}
                  href="/admin/golf/tee-sheet?filter=unpaid"
                  label="unpaid today"
                  tone="amber"
                />
              )}
              {noShowCount > 0 && (
                <AlertChip
                  count={noShowCount}
                  href="/admin/golf/tee-sheet?filter=no-shows"
                  label="no-show risk"
                  tone="red"
                />
              )}
              {!closeDayReady && (
                <Link
                  className="flex items-center gap-2 rounded-full bg-primary-container/40 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-container"
                  to="/admin/finance"
                >
                  <MaterialSymbol className="text-[16px]" icon="warning" />
                  Close Day blocked
                  <MaterialSymbol className="text-[16px]" icon="arrow_forward" />
                </Link>
              )}
              {unpaidCount === 0 && noShowCount === 0 && closeDayReady && (
                <span className="flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
                  <MaterialSymbol className="text-[16px]" icon="check_circle" />
                  All clear — no outstanding issues
                </span>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.65fr)_360px]">
          <div className="space-y-8">
            {/* Work queue */}
            <section className="rounded-2xl bg-surface-container-low p-6">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Work Queue</p>
                <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">What needs action</h2>
              </div>
              <div className="space-y-3">
                {summaryQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((item) => (
                      <div className="h-20 animate-pulse rounded-2xl bg-slate-100" key={item} />
                    ))}
                  </div>
                ) : null}
                {!summaryQuery.isLoading && !hasWorkItems ? (
                  <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600">
                      <MaterialSymbol icon="check_circle" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">No outstanding items.</p>
                      <p className="text-xs text-emerald-800">All bookings are settled and the day is ready to close.</p>
                    </div>
                  </div>
                ) : null}
                {workCards.map((card) => (
                  <WorkCard key={card.title} {...card} />
                ))}
              </div>
            </section>

            {/* Recent activity */}
            <section className="rounded-2xl bg-surface-container-lowest shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Recent Movement</p>
                  <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Activity feed</h3>
                </div>
                <NavLink className="text-xs font-bold uppercase tracking-wider text-primary hover:text-primary-dim" to="/admin/finance">
                  Full Journal
                </NavLink>
              </div>
              <div className="space-y-1 p-2">
                {summaryQuery.isLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((item) => (
                      <div className="h-12 animate-pulse rounded-xl bg-slate-100" key={item} />
                    ))}
                  </div>
                ) : null}
                {!summaryQuery.isLoading && recentActivity.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No recent activity yet.</div>
                ) : null}
                {recentActivity.map((entry) => {
                  const { icon, className } = activityIcon(entry);
                  return (
                    <div className="flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-surface-container-low" key={entry.id}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                        <MaterialSymbol className="text-sm" icon={icon} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-on-surface">{entry.description}</p>
                        <p className="text-[10px] capitalize text-slate-400">
                          {entry.source} · {timeAgo(entry.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-on-surface">{formatAmountStr(entry.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Targets row */}
          <div className="space-y-6">
            <section className="rounded-2xl bg-surface-container-low p-6">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Performance</p>
                <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Active targets</h3>
              </div>
              {summaryQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((item) => (
                    <div className="h-14 animate-pulse rounded-xl bg-slate-100" key={item} />
                  ))}
                </div>
              ) : activeTargets.length === 0 ? (
                <p className="text-sm text-slate-400">No active targets for this period.</p>
              ) : (
                <div className="space-y-3">
                  {activeTargets.map((t) => (
                    <div className="rounded-xl bg-white p-4" key={`${t.domain_key}-${t.metric_key}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.domain_label}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.period_key}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-on-surface">{t.metric_label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Target:{" "}
                        {t.unit === "currency"
                          ? formatAmount(t.target_value)
                          : t.target_value.toLocaleString("en-ZA")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Tee occupancy summary */}
            <section className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
              <div className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Tee Sheet</p>
                <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Today's occupancy</h3>
              </div>
              {summaryQuery.isLoading ? (
                <div className="h-10 animate-pulse rounded-xl bg-slate-100" />
              ) : occupancyPct !== null ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{occupancyPct}%</span>
                    <span className="text-xs font-medium text-primary">
                      {teeOccupancy?.booked_slots}/{teeOccupancy?.total_slots} slots
                    </span>
                  </div>
                  <div className="mt-3 h-1 w-full rounded-full bg-slate-100">
                    <div className="h-1 rounded-full bg-primary" style={{ width: `${occupancyPct}%` }} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">No tee sheet data for today.</p>
              )}
              <Link className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary" to="/admin/golf/tee-sheet">
                Open Tee Sheet
                <MaterialSymbol className="text-[14px]" icon="arrow_forward" />
              </Link>
            </section>
          </div>
        </div>
      </div>
    </AdminWorkspace>
  );
}

// ---------------------------------------------------------------------------
// Legacy layout (fallback when ux_rebuild_v1 is false)
// ---------------------------------------------------------------------------

function LegacyDashboardLayout(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubName = bootstrap?.selected_club?.name ?? "Club workspace";
  const timezone = bootstrap?.selected_club?.timezone ?? "";
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const hasCommunications = bootstrap?.module_flags?.communications ?? false;

  const summaryQuery = useAdminDashboardSummaryQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const halfwaySummaryQuery = useHalfwaySummaryQuery({ accessToken, selectedClubId });
  const reportsSummaryQuery = useReportsSummaryQuery({ accessToken, selectedClubId });

  const summary = summaryQuery.data;
  const outstandingSummary = outstandingSummaryQuery.data;
  const revenueSummary = revenueSummaryQuery.data;
  const halfwaySummary = halfwaySummaryQuery.data;
  const reportsSummary = reportsSummaryQuery.data;

  const memberCount = summary?.member_count ?? null;
  const teeOccupancy = summary?.tee_occupancy ?? null;
  const occupancyPct = teeOccupancy?.occupancy_pct ?? null;
  const teeWarnings = summary?.tee_warnings ?? [];
  const recentActivity = summary?.recent_activity ?? [];
  const activeTargets = summary?.active_targets;
  const activeQueueCount = halfwaySummary?.active_queue_count ?? 0;

  const golfRoundsTarget = findTarget(activeTargets, "golf", "rounds_booked");
  const membersTarget = findTarget(activeTargets, "members", "active_members");
  const outstandingTarget = findTarget(activeTargets, "finance", "outstanding_balance");
  const revenueTarget = findTarget(activeTargets, "finance", "cash_collected");

  const alerts: ActionAlert[] = [];
  if ((outstandingSummary?.accounts_in_arrears ?? 0) > 0) {
    alerts.push({
      code: "finance-arrears",
      title: "Accounts in arrears",
      detail: `${outstandingSummary?.accounts_in_arrears ?? 0} accounts carry ${formatAmountStr(outstandingSummary?.total_outstanding_amount ?? "0.00")} outstanding.`,
      href: "/admin/members",
      actionLabel: "Review Members",
      tone: "critical",
      icon: "account_balance_wallet",
    });
  }
  if ((outstandingSummary?.unpaid_order_postings_count ?? 0) > 0) {
    alerts.push({
      code: "unpaid-order-postings",
      title: "Unpaid order postings",
      detail: `${outstandingSummary?.unpaid_order_postings_count ?? 0} postings are awaiting settlement totaling ${formatAmountStr(outstandingSummary?.unpaid_order_postings_amount ?? "0.00")}.`,
      href: "/admin/finance",
      actionLabel: "Open Close Day",
      tone: "warning",
      icon: "payments",
    });
  }
  if (activeQueueCount > 0) {
    alerts.push({
      code: "queue-pressure",
      title: "Commerce queue pressure",
      detail: `${activeQueueCount} order${activeQueueCount === 1 ? "" : "s"} remain active in the commerce queue.`,
      href: "/admin/orders",
      actionLabel: "Open Order Queue",
      tone: "info",
      icon: "pending_actions",
    });
  }
  teeWarnings.forEach((warning) => {
    alerts.push({
      code: warning.code,
      title: "Tee sheet notice",
      detail: warning.message,
      href: "/admin/golf/tee-sheet",
      actionLabel: "Open Tee Sheet",
      tone: "warning",
      icon: "golf_course",
    });
  });

  const quickActions = buildQuickActions(hasCommunications);
  const totalAlertCount = alerts.length;

  return (
    <AdminWorkspace
      description={`${selectedClubName}${timezone ? ` · ${timezone}` : ""}`}
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tee Occupancy</span>
              <MaterialSymbol className="text-primary" icon="golf_course" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : occupancyPct !== null ? (
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
            {occupancyPct !== null && (
              <div className="mt-3 h-1 w-full rounded-full bg-slate-100">
                <div className="h-1 rounded-full bg-primary" style={{ width: `${occupancyPct}%` }} />
              </div>
            )}
            {golfRoundsTarget !== null && <TargetHint target={golfRoundsTarget} />}
          </div>

          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Members</span>
              <MaterialSymbol className="text-secondary" icon="group" />
            </div>
            <div className="flex items-baseline gap-2">
              {summaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{memberCount ?? "--"}</span>
                  <span className="text-xs font-medium text-secondary">
                    {reportsSummary?.member_breakdown.member_count ?? 0} active members
                  </span>
                </>
              )}
            </div>
            {membersTarget !== null && <TargetHint target={membersTarget} />}
          </div>

          <div className="rounded-xl border-l-4 border-error bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</span>
              <MaterialSymbol className="text-error" icon="account_balance" />
            </div>
            <div className="flex items-baseline gap-2">
              {outstandingSummaryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">--</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    {formatAmountStr(outstandingSummary?.total_outstanding_amount ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-error">{outstandingSummary?.accounts_in_arrears ?? 0} accounts</span>
                </>
              )}
            </div>
            {outstandingTarget !== null && <TargetHint target={outstandingTarget} />}
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
                    {formatAmountStr(revenueSummary?.day.operational_revenue ?? "0.00")}
                  </span>
                  <span className="text-xs font-medium text-emerald-600">{revenueSummary?.day.charge_count ?? 0} charges</span>
                </>
              )}
            </div>
            {revenueTarget !== null && <TargetHint target={revenueTarget} />}
          </div>
        </div>
      }
      title="Overview"
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <div className="space-y-8">
          <section className="rounded-2xl bg-surface-container-low p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Decision Engine</p>
                <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">Problems and next steps</h2>
              </div>
              {totalAlertCount > 0 ? (
                <span className="rounded-full bg-error-container px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-on-error-container">
                  {totalAlertCount} active
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              {summaryQuery.isLoading || outstandingSummaryQuery.isLoading || halfwaySummaryQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div className="h-20 animate-pulse rounded-2xl bg-slate-100" key={item} />
                  ))}
                </div>
              ) : null}
              {!summaryQuery.isLoading && !outstandingSummaryQuery.isLoading && !halfwaySummaryQuery.isLoading && alerts.length === 0 ? (
                <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-600">
                    <MaterialSymbol icon="check_circle" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">No live operational issues are active.</p>
                    <p className="text-xs text-emerald-800">Future weather, stock, and demand signals can plug into this rail when backend support exists.</p>
                  </div>
                </div>
              ) : null}
              {alerts.map((alert) => (
                <div className="flex items-start gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm" key={alert.code}>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${alertToneClassName(alert.tone)}`}>
                    <MaterialSymbol icon={alert.icon} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-on-surface">{alert.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          alert.tone === "critical"
                            ? "bg-error-container text-on-error-container"
                            : alert.tone === "warning"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-primary-container text-on-primary-container"
                        }`}
                      >
                        next step ready
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface-variant">{alert.detail}</p>
                  </div>
                  <NavLink
                    className="shrink-0 rounded-xl bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-primary-dim"
                    to={alert.href}
                  >
                    {alert.actionLabel}
                  </NavLink>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-2xl bg-surface-container-lowest shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Recent Movement</p>
                  <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Activity feed</h3>
                </div>
                <NavLink className="text-xs font-bold uppercase tracking-wider text-primary hover:text-primary-dim" to="/admin/finance">
                  Full Journal
                </NavLink>
              </div>
              <div className="space-y-1 p-2">
                {summaryQuery.isLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((item) => (
                      <div className="h-12 animate-pulse rounded-xl bg-slate-100" key={item} />
                    ))}
                  </div>
                ) : null}
                {!summaryQuery.isLoading && recentActivity.length === 0 ? (
                  <div className="py-10 text-center text-sm text-slate-400">No recent activity yet.</div>
                ) : null}
                {recentActivity.map((entry) => {
                  const { icon, className } = activityIcon(entry);
                  return (
                    <div className="flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-surface-container-low" key={entry.id}>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                        <MaterialSymbol className="text-sm" icon={icon} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-on-surface">{entry.description}</p>
                        <p className="text-[10px] capitalize text-slate-400">
                          {entry.source} · {timeAgo(entry.created_at)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-on-surface">{formatAmountStr(entry.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-surface-container-low p-6">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Current Shape</p>
                <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Operational snapshot</h3>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Commerce</p>
                  <p className="mt-2 text-sm font-semibold text-on-surface">
                    {halfwaySummaryQuery.isLoading
                      ? "Loading commerce state..."
                      : `${halfwaySummary?.orders_today_count ?? 0} orders today and ${activeQueueCount} active queue item${activeQueueCount === 1 ? "" : "s"}.`}
                  </p>
                  <Link className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/orders">
                    Open order queue
                  </Link>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">People</p>
                  <p className="mt-2 text-sm font-semibold text-on-surface">
                    {reportsSummaryQuery.isLoading
                      ? "Loading member coverage..."
                      : `${reportsSummary?.member_breakdown.no_account_count ?? 0} people have no finance account and ${reportsSummary?.member_breakdown.new_member_count ?? 0} joined recently.`}
                  </p>
                  <Link className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/people/dashboard">
                    Open people dashboard
                  </Link>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Golf</p>
                  <p className="mt-2 text-sm font-semibold text-on-surface">
                    {summaryQuery.isLoading
                      ? "Loading tee sheet posture..."
                      : `${teeWarnings.length} tee warning${teeWarnings.length === 1 ? "" : "s"} and ${reportsSummary?.course_count ?? 0} configured course${(reportsSummary?.course_count ?? 0) === 1 ? "" : "s"}.`}
                  </p>
                  <Link className="mt-3 inline-flex text-xs font-bold uppercase tracking-wide text-primary" to="/admin/golf/dashboard">
                    Open golf dashboard
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-primary-container/20 p-6">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-900">Quick Actions</p>
              <h3 className="mt-2 font-headline text-lg font-bold text-emerald-950">Move operators faster</h3>
            </div>
            <div className="grid gap-3">
              {quickActions.map((action) => (
                <NavLink
                  className="group flex items-center gap-4 rounded-2xl bg-white p-4 transition-all hover:shadow-sm"
                  key={`${action.href}-${action.title}`}
                  to={action.href}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <MaterialSymbol icon={action.icon} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-surface">{action.title}</p>
                    <p className="text-[11px] text-slate-500">{action.subtitle}</p>
                  </div>
                </NavLink>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-surface-container-low p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Club</p>
                <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">{selectedClubName}</h3>
              </div>
              <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Active</span>
            </div>
            {timezone ? <p className="mt-3 text-sm text-on-surface-variant">{timezone}</p> : null}
          </section>
        </div>
      </div>
    </AdminWorkspace>
  );
}

// ---------------------------------------------------------------------------
// Entry point — gate on feature flag
// ---------------------------------------------------------------------------

export function AdminDashboardPage(): JSX.Element {
  const { bootstrap } = useSession();
  const uxRebuildV1 = bootstrap?.feature_flags?.ux_rebuild_v1 === true;
  return uxRebuildV1 ? <TodayLayout /> : <LegacyDashboardLayout />;
}
