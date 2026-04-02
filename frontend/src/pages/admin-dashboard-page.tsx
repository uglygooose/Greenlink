import { Link, NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useFinanceAccountsQuery, useFinanceJournalQuery } from "../features/finance/hooks";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";
import type { FinanceJournalEntry } from "../types/finance";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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

function journalIcon(entry: FinanceJournalEntry): { icon: string; className: string } {
  if (entry.source === "booking") return { icon: "golf_course", className: "bg-blue-50 text-blue-600" };
  if (entry.source === "pos")     return { icon: "point_of_sale", className: "bg-emerald-50 text-emerald-600" };
  if (entry.source === "order")   return { icon: "restaurant", className: "bg-amber-50 text-amber-600" };
  if (entry.type === "payment")   return { icon: "payments", className: "bg-secondary-container text-secondary" };
  return { icon: "receipt_long", className: "bg-surface-container-high text-on-surface-variant" };
}

const QUICK_ACTIONS = [
  { title: "Book a Tee Time",    subtitle: "Create new reservation",   icon: "add_box",       href: "/admin/golf/tee-sheet" },
  { title: "View Members",       subtitle: "Directory & accounts",     icon: "group",          href: "/admin/members" },
  { title: "Finance Journal",    subtitle: "Review transactions",      icon: "receipt_long",   href: "/admin/finance" },
  { title: "Halfway Dashboard",  subtitle: "POS & order activity",     icon: "storefront",     href: "/admin/halfway" },
];

export function AdminDashboardPage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubName = bootstrap?.selected_club?.name ?? "Club workspace";
  const timezone = bootstrap?.selected_club?.timezone ?? "";
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const accountsQuery  = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const journalQuery   = useFinanceJournalQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const coursesQuery   = useCoursesQuery({ accessToken, selectedClubId });
  const firstCourseId  = coursesQuery.data?.[0]?.id ?? null;

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId: firstCourseId,
    date: todayIso(),
    membershipType: "member",
  });

  // --- Derived metrics ---
  const accounts = accountsQuery.data ?? [];
  const inArrears = accounts.filter((a) => parseFloat(a.balance) < 0);
  const totalOutstanding = inArrears.reduce((sum, a) => sum + Math.abs(parseFloat(a.balance)), 0);

  const memberCount = directoryQuery.data?.length ?? null;

  const allSlots    = (teeSheetQuery.data?.rows ?? []).flatMap((r) => r.slots);
  const bookedSlots = allSlots.filter((s) => s.bookings.some((b) => b.status === "reserved" || b.status === "checked_in")).length;
  const totalSlots  = allSlots.length;
  const occupancyPct = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : null;

  const entries = journalQuery.data?.entries ?? [];
  const todayPosRevenue = entries
    .filter((e) => (e.source === "pos" || e.source === "order") && e.type === "charge" && isToday(e.created_at))
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  // Recent activity = last 6 journal entries
  const recentActivity = [...entries]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  // Alerts: accounts in arrears + tee sheet warnings
  const teeWarnings = teeSheetQuery.data?.warnings ?? [];

  return (
    <AdminShell title="Dashboard" searchPlaceholder="Search operations...">
      <AdminWorkspace
        description={`${selectedClubName}${timezone ? ` • ${timezone}` : ""}`}
        kpis={
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</span>
              <MaterialSymbol className="text-error" icon="account_balance" />
            </div>
            <div className="flex items-baseline gap-2">
              {accountsQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{formatAmount(totalOutstanding)}</span>
                  <span className="text-xs font-medium text-error">{inArrears.length} accounts</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tee Occupancy</span>
              <MaterialSymbol className="text-primary" icon="golf_course" />
            </div>
            <div className="flex items-baseline gap-2">
              {teeSheetQuery.isLoading || coursesQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : occupancyPct !== null ? (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{occupancyPct}%</span>
                  <span className="text-xs font-medium text-primary">{bookedSlots}/{totalSlots} slots</span>
                </>
              ) : (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              )}
            </div>
            {occupancyPct !== null && (
              <div className="mt-3 h-1 w-full rounded-full bg-slate-100">
                <div className="h-1 rounded-full bg-primary" style={{ width: `${occupancyPct}%` }} />
              </div>
            )}
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Members</span>
              <MaterialSymbol className="text-secondary" icon="group" />
            </div>
            <div className="flex items-baseline gap-2">
              {directoryQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{memberCount ?? "—"}</span>
                  <span className="text-xs font-medium text-secondary">members</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-emerald-500">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">POS Revenue Today</span>
              <MaterialSymbol className="text-emerald-500" icon="payments" />
            </div>
            <div className="flex items-baseline gap-2">
              {journalQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{formatAmount(todayPosRevenue)}</span>
                  <span className="text-xs font-medium text-emerald-600">today</span>
                </>
              )}
            </div>
          </div>
          </div>
        }
        title="Dashboard"
      >

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">

            {/* Operational Alerts */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-headline text-lg font-bold">
                  Operational Alerts
                  {(inArrears.length > 0 || teeWarnings.length > 0) && (
                    <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] uppercase tracking-tighter text-on-error-container">
                      {inArrears.length + teeWarnings.length} Active
                    </span>
                  )}
                </h3>
                <Link className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-primary" to="/admin/finance">
                  View Finance
                </Link>
              </div>
              <div className="space-y-3">
                {inArrears.length === 0 && teeWarnings.length === 0 && !accountsQuery.isLoading && (
                  <div className="flex items-center gap-4 rounded-xl bg-emerald-50 p-4">
                    <MaterialSymbol className="text-emerald-500" icon="check_circle" />
                    <p className="text-sm font-medium text-emerald-800">No operational alerts — all clear.</p>
                  </div>
                )}
                {inArrears.slice(0, 3).map((account) => (
                  <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm" key={account.id}>
                    <div className="h-12 w-1 rounded-full bg-error" />
                    <div className="rounded-lg bg-error-container/20 p-2 text-error">
                      <MaterialSymbol icon="account_balance_wallet" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">Account in arrears</h4>
                      <p className="text-xs text-on-surface-variant">
                        {account.account_customer.account_code} — balance {formatAmountStr(account.balance)}
                      </p>
                    </div>
                    <NavLink className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" to="/admin/members">
                      View
                    </NavLink>
                  </div>
                ))}
                {inArrears.length > 3 && (
                  <p className="pl-4 text-xs text-slate-400">+{inArrears.length - 3} more accounts in arrears</p>
                )}
                {teeWarnings.map((w, i) => (
                  <div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm" key={i}>
                    <div className="h-12 w-1 rounded-full bg-amber-500" />
                    <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                      <MaterialSymbol icon="thunderstorm" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">Tee Sheet Notice</h4>
                      <p className="text-xs text-on-surface-variant">{w.message}</p>
                    </div>
                    <NavLink className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" to="/admin/golf/tee-sheet">
                      View
                    </NavLink>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-headline text-lg font-bold">Recent Activity</h3>
                <NavLink className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-primary" to="/admin/finance">
                  Full Journal
                </NavLink>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-2">
                {journalQuery.isLoading && (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((i) => <div className="h-12 animate-pulse rounded-xl bg-slate-100" key={i} />)}
                  </div>
                )}
                {!journalQuery.isLoading && recentActivity.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-sm text-slate-400">No transactions yet.</p>
                  </div>
                )}
                <div className="space-y-1">
                  {recentActivity.map((entry) => {
                    const { icon, className } = journalIcon(entry);
                    return (
                      <div className="flex items-center gap-4 rounded-xl bg-surface-container-lowest p-4" key={entry.id}>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
                          <MaterialSymbol className="text-sm" icon={icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-on-surface">{entry.description}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{entry.source} • {timeAgo(entry.created_at)}</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-on-surface">{formatAmountStr(entry.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <section className="rounded-2xl bg-primary-container/20 p-6">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-emerald-900">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-3">
                {QUICK_ACTIONS.map((action) => (
                  <NavLink
                    className="group flex w-full items-center gap-4 rounded-xl bg-white p-4 text-left transition-all hover:shadow-sm"
                    key={action.href}
                    to={action.href}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                      <MaterialSymbol icon={action.icon} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-on-surface">{action.title}</p>
                      <p className="text-[10px] text-slate-500">{action.subtitle}</p>
                    </div>
                  </NavLink>
                ))}
              </div>
            </section>

            {/* Course Status */}
            <section className="rounded-2xl bg-surface-container-low p-6">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-on-surface">Course Status</h3>
              <div className="space-y-3">
                {coursesQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => <div className="h-6 animate-pulse rounded bg-slate-100" key={i} />)}
                  </div>
                ) : coursesQuery.data && coursesQuery.data.length > 0 ? (
                  coursesQuery.data.map((course) => (
                    <div className="flex items-center justify-between" key={course.id}>
                      <span className="text-sm font-medium text-on-surface">{course.name}</span>
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Open</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No courses configured.</p>
                )}
                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-on-surface">{selectedClubName}</p>
                  {timezone && <p className="mt-0.5 text-[10px] text-slate-400">{timezone}</p>}
                </div>
              </div>
            </section>
          </div>
        </div>
      </AdminWorkspace>
    </AdminShell>
  );
}
