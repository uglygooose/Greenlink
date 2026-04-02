import { Link } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { useFinanceAccountsQuery, useFinanceJournalQuery } from "../features/finance/hooks";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";

type ActionItem = { title: string; subtitle: string; icon: string };
type ActivityItem = { title: string; subtitle: string; icon: string; accentClassName: string };

const QUICK_ACTIONS: ActionItem[] = [
  { title: "Book Golf", subtitle: "Create new reservation", icon: "add_box" },
  { title: "Send Member News", subtitle: "Draft mass communication", icon: "mail" },
  { title: "Trigger Finance Export", subtitle: "Sync with accounting", icon: "file_export" },
  { title: "Adjust Tee Times", subtitle: "Bulk operational changes", icon: "calendar_month" },
];

const ACTIVITY: ActivityItem[] = [
  {
    title: "Finance Export completed",
    subtitle: "by Sarah Miller • 14 mins ago",
    icon: "file_download",
    accentClassName: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "New news post published",
    subtitle: "System • 2 hours ago",
    icon: "newspaper",
    accentClassName: "bg-blue-50 text-blue-600",
  },
  {
    title: 'Member "James Wilson" checked in',
    subtitle: "Front Desk • 3 hours ago",
    icon: "how_to_reg",
    accentClassName: "bg-purple-50 text-purple-600",
  },
];

function formatAmount(amount: number): string {
  return `$${Math.abs(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AdminDashboardPage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubName = bootstrap?.selected_club?.name ?? "Club workspace";
  const timezone = bootstrap?.selected_club?.timezone ?? "Club timezone";
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const accountsQuery = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const journalQuery = useFinanceJournalQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const firstCourseId = coursesQuery.data?.[0]?.id ?? null;
  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId: firstCourseId,
    date: todayIso(),
    membershipType: "member",
  });

  const totalOutstanding = (accountsQuery.data ?? []).reduce((sum, a) => {
    const bal = parseFloat(a.balance);
    return bal < 0 ? sum + Math.abs(bal) : sum;
  }, 0);
  const unpaidCount = (accountsQuery.data ?? []).filter((a) => parseFloat(a.balance) < 0).length;
  const memberCount = directoryQuery.data?.length ?? null;
  const txTotal = journalQuery.data?.total_count ?? null;
  const allSlots = (teeSheetQuery.data?.rows ?? []).flatMap((r) => r.slots);
  const bookedSlots = allSlots.filter((s) =>
    s.bookings.some((b) => b.status === "reserved" || b.status === "checked_in"),
  ).length;
  const totalSlots = allSlots.length;
  const occupancyPct = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : null;

  return (
    <AdminShell title="Dashboard" searchPlaceholder="Search operations...">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Metric cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 transition-all hover:-translate-y-[2px]">
            <div className="mb-4 flex items-start justify-between">
              <div className="rounded-lg bg-error-container p-2 text-on-error-container">
                <MaterialSymbol icon="account_balance" />
              </div>
              {accountsQuery.isSuccess && unpaidCount > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-error">
                  <MaterialSymbol className="text-sm" icon="warning" />
                </span>
              )}
            </div>
            <p className="mb-1 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
              Outstanding Balance
            </p>
            {accountsQuery.isLoading ? (
              <div className="h-8 w-24 animate-pulse rounded bg-slate-100" />
            ) : (
              <h3 className="font-headline text-2xl font-bold">{formatAmount(totalOutstanding)}</h3>
            )}
            <p className="mt-2 text-[10px] font-medium text-slate-400">
              {accountsQuery.isLoading ? "—" : `${unpaidCount} accounts in arrears`}
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 transition-all hover:-translate-y-[2px]">
            <div className="mb-4 flex items-start justify-between">
              <div className="rounded-lg bg-secondary-container p-2 text-on-secondary-container">
                <MaterialSymbol icon="golf_course" />
              </div>
              {occupancyPct !== null && (
                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                  <MaterialSymbol className="text-sm" icon="trending_up" />
                  {bookedSlots} / {totalSlots}
                </span>
              )}
            </div>
            <p className="mb-1 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
              Tee Occupancy Today
            </p>
            {teeSheetQuery.isLoading || coursesQuery.isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
            ) : occupancyPct !== null ? (
              <h3 className="font-headline text-2xl font-bold">{occupancyPct}%</h3>
            ) : (
              <h3 className="font-headline text-2xl font-bold text-slate-300">—</h3>
            )}
            {occupancyPct !== null && (
              <div className="mt-4 h-1 w-full rounded-full bg-surface-container-low">
                <div className="h-1 rounded-full bg-primary transition-all" style={{ width: `${occupancyPct}%` }} />
              </div>
            )}
          </div>

          <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 transition-all hover:-translate-y-[2px]">
            <div className="mb-4">
              <div className="rounded-lg bg-tertiary-container p-2 text-on-tertiary-container inline-block">
                <MaterialSymbol icon="group" />
              </div>
            </div>
            <p className="mb-1 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
              Total Members
            </p>
            {directoryQuery.isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
            ) : (
              <h3 className="font-headline text-2xl font-bold">{memberCount ?? "—"}</h3>
            )}
            <p className="mt-2 text-[10px] font-medium text-slate-400">
              {directoryQuery.isSuccess ? "Active club directory" : "—"}
            </p>
          </div>

          <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 transition-all hover:-translate-y-[2px]">
            <div className="mb-4">
              <div className="rounded-lg bg-surface-container-high p-2 text-on-surface inline-block">
                <MaterialSymbol icon="receipt_long" />
              </div>
            </div>
            <p className="mb-1 font-label text-label-sm uppercase tracking-wider text-on-surface-variant">
              Finance Transactions
            </p>
            {journalQuery.isLoading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-slate-100" />
            ) : (
              <h3 className="font-headline text-2xl font-bold">{txTotal ?? "—"}</h3>
            )}
            <p className="mt-2 text-[10px] font-medium text-slate-400">
              {journalQuery.isSuccess ? "All time" : "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-headline text-lg font-bold">
                  Operational Alerts
                  <span className="rounded-full bg-error-container px-2 py-0.5 text-[10px] uppercase tracking-tighter text-on-error-container">
                    3 Active
                  </span>
                </h3>
                <Link className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-primary" to="/admin/golf/tee-sheet">
                  View Tee Sheet
                </Link>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                  <div className="h-12 w-1 rounded-full bg-error" />
                  <div className="rounded-lg bg-error-container/20 p-2 text-error">
                    <MaterialSymbol icon="emergency_home" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold">3 bookings unmapped</h4>
                    <p className="text-xs text-on-surface-variant">Conflicting tee times on the North Course require manual resolution.</p>
                  </div>
                  <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">Resolve</button>
                </div>
                <div className="flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                  <div className="h-12 w-1 rounded-full bg-amber-500" />
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                    <MaterialSymbol icon="thunderstorm" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold">Weather warning: course closure</h4>
                    <p className="text-xs text-on-surface-variant">Severe lightning predicted for 2:00 PM. Automated alerts ready to send.</p>
                  </div>
                  <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">Notify All</button>
                </div>
                <div className="flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                  <div className="h-12 w-1 rounded-full bg-blue-500" />
                  <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                    <MaterialSymbol icon="inventory_2" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold">Pro Shop Inventory Low</h4>
                    <p className="text-xs text-on-surface-variant">Titleist Pro V1 stock below threshold. Reorder suggested.</p>
                  </div>
                  <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">Review</button>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-headline text-lg font-bold">Recent Activity</h3>
                <button className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-primary" type="button">View Log</button>
              </div>
              <div className="rounded-2xl bg-surface-container-low p-2">
                <div className="space-y-1">
                  {ACTIVITY.map((item) => (
                    <div className="flex items-center gap-4 rounded-xl bg-surface-container-lowest p-4" key={item.title}>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${item.accentClassName}`}>
                        <MaterialSymbol className="text-sm" icon={item.icon} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-[10px] text-slate-400">{item.subtitle}</p>
                      </div>
                      <button className="text-slate-300 transition-colors hover:text-slate-600" type="button">
                        <MaterialSymbol icon="more_horiz" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl bg-primary-container/20 p-6">
              <h3 className="mb-6 font-headline text-sm font-bold uppercase tracking-widest text-emerald-900">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-3">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    className="group flex w-full items-center gap-4 rounded-xl bg-white p-4 text-left transition-all hover:shadow-sm"
                    key={action.title}
                    type="button"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                      <MaterialSymbol icon={action.icon} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{action.title}</p>
                      <p className="text-[10px] text-slate-500">{action.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-surface-container-low p-6">
              <h3 className="mb-6 font-headline text-sm font-bold uppercase tracking-widest text-on-surface">Course Status</h3>
              <div className="space-y-4">
                {coursesQuery.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div className="h-6 animate-pulse rounded bg-slate-100" key={i} />
                    ))}
                  </div>
                ) : coursesQuery.data && coursesQuery.data.length > 0 ? (
                  coursesQuery.data.map((course) => (
                    <div className="flex items-center justify-between" key={course.id}>
                      <span className="text-sm font-medium">{course.name}</span>
                      <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">Open</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No courses configured.</p>
                )}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex items-center gap-3 text-on-surface-variant">
                    <MaterialSymbol className="text-lg" icon="device_thermostat" />
                    <p className="text-sm">18°C <span className="ml-1 text-xs opacity-60">Humidity: 45%</span></p>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Club: {selectedClubName} • {timezone}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
