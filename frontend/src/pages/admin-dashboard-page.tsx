import { Link, NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useAdminDashboardSummaryQuery } from "../features/admin-dashboard/hooks";
import { useSession } from "../session/session-context";
import type { DashboardActivityItem } from "../types/admin-dashboard";

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

function activityIcon(entry: DashboardActivityItem): { icon: string; className: string } {
  if (entry.type === "refund") return { icon: "undo", className: "bg-amber-50 text-amber-600" };
  if (entry.source === "booking") return { icon: "golf_course", className: "bg-blue-50 text-blue-600" };
  if (entry.source === "pos") return { icon: "point_of_sale", className: "bg-emerald-50 text-emerald-600" };
  if (entry.source === "order") return { icon: "restaurant", className: "bg-amber-50 text-amber-600" };
  if (entry.type === "payment") return { icon: "payments", className: "bg-secondary-container text-secondary" };
  return { icon: "receipt_long", className: "bg-surface-container-high text-on-surface-variant" };
}

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
  const arrivalsCount = summary?.arrivals_due_count ?? 0;
  const closeDayReady = summary?.close_day_ready ?? true;
  const teeOccupancy = summary?.tee_occupancy ?? null;
  const occupancyPct = teeOccupancy?.occupancy_pct ?? null;
  const recentActivity = summary?.recent_activity ?? [];
  const activeTargets = summary?.active_targets ?? [];

  const workCards: WorkCardProps[] = [];

  if (arrivalsCount > 0) {
    workCards.push({
      icon: "directions_walk",
      iconClass: "bg-blue-100 text-blue-700",
      title: "Arrivals due soon",
      detail: `${arrivalsCount} reserved booking${arrivalsCount === 1 ? "" : "s"} ${arrivalsCount === 1 ? "is" : "are"} due to arrive in the next 90 minutes.`,
      actionLabel: "Check In",
      href: "/admin/golf/tee-sheet?filter=arrivals-due",
    });
  }

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
        <div className="flex flex-wrap items-center gap-3">
          {summaryQuery.isLoading ? (
            <div className="h-9 w-48 animate-pulse rounded-full bg-slate-100" />
          ) : (
            <>
              {arrivalsCount > 0 && (
                <AlertChip
                  count={arrivalsCount}
                  href="/admin/golf/tee-sheet?filter=arrivals-due"
                  label="arrivals due"
                  tone="blue"
                />
              )}
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
              {unpaidCount === 0 && noShowCount === 0 && arrivalsCount === 0 && closeDayReady && (
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

export function AdminDashboardPage(): JSX.Element {
  return <TodayLayout />;
}
