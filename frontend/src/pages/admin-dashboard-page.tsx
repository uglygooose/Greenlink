import { Link, NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useSession } from "../session/session-context";

type MetricCard = {
  label: string;
  value: string;
  icon: string;
  accentClassName: string;
  trend?: string;
  detail?: string;
  progress?: string;
  bars?: number;
};

type ActionItem = { title: string; subtitle: string; icon: string };
type ActivityItem = { title: string; subtitle: string; icon: string; accentClassName: string };

const METRIC_CARDS: MetricCard[] = [
  {
    label: "Today's Revenue",
    value: "$14,280",
    icon: "payments",
    accentClassName: "bg-primary-container text-on-primary-container",
    trend: "+8.2%",
    progress: "75%",
  },
  {
    label: "Tee Time Occupancy",
    value: "82%",
    icon: "golf_course",
    accentClassName: "bg-secondary-container text-on-secondary-container",
    trend: "84 / 102",
    bars: 3,
  },
  {
    label: "New Memberships",
    value: "12",
    icon: "person_add",
    accentClassName: "bg-tertiary-container text-on-tertiary-container",
    detail: "8 pending approval",
  },
  {
    label: "Pace of Play",
    value: "4h 12m",
    icon: "timer",
    accentClassName: "bg-surface-container-high text-on-surface",
    trend: "warning",
    detail: "Avg delay: +8 mins",
  },
];

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

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GL"
  );
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function sidebarLinkClass(isActive: boolean): string {
  return isActive
    ? "flex items-center gap-3 px-4 py-3 text-emerald-800 dark:text-emerald-400 font-bold border-r-4 border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/20 transition-all duration-200 ease-in-out"
    : "flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-200 ease-in-out";
}

export function AdminDashboardPage(): JSX.Element {
  const { bootstrap, logout } = useSession();
  const displayName = bootstrap?.user.display_name ?? "Club Admin";
  const selectedClubName = bootstrap?.selected_club?.name ?? "Club workspace";
  const timezone = bootstrap?.selected_club?.timezone ?? "Club timezone";

  return (
    <div className="bg-background text-on-surface">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r border-slate-200/50 bg-slate-50 lg:flex">
        <div className="px-6 py-8">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <MaterialSymbol icon="forest" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-emerald-900">{selectedClubName}</h1>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Golf Operations</p>
            </div>
          </div>
          <nav className="space-y-1">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/dashboard">
              {({ isActive }) => (
                <>
                  <MaterialSymbol filled={isActive} icon="dashboard" />
                  <span className="font-label text-sm">Dashboard</span>
                </>
              )}
            </NavLink>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/tee-sheet">
              <MaterialSymbol icon="calendar_today" />
              <span className="font-label text-sm">Tee Sheet</span>
            </NavLink>
            <button
              className={sidebarLinkClass(false)}
              type="button"
            >
              <MaterialSymbol icon="group" />
              <span className="font-label text-sm">Members</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/finance">
              <MaterialSymbol icon="payments" />
              <span className="font-label text-sm">Finance</span>
            </NavLink>
            <button
              className={sidebarLinkClass(false)}
              type="button"
            >
              <MaterialSymbol icon="inventory_2" />
              <span className="font-label text-sm">Inventory</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/communications">
              <MaterialSymbol icon="chat_bubble" />
              <span className="font-label text-sm">Comms</span>
            </NavLink>
          </nav>
        </div>
        <div className="mt-auto border-t border-slate-100 px-6 py-8">
          <button className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white hover:opacity-90 transition-opacity">
            <MaterialSymbol icon="add_circle" />
            <span>New Action</span>
          </button>
          <div className="space-y-1">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/settings">
              <MaterialSymbol icon="settings" />
              <span className="text-sm font-medium">Settings</span>
            </NavLink>
            <button
              className="flex items-center gap-3 px-4 py-2 text-slate-500 transition-colors hover:text-error"
              onClick={() => {
                void logout();
              }}
              type="button"
            >
              <MaterialSymbol className="text-xl" icon="logout" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="min-h-screen pb-24 lg:ml-64 lg:pb-12">
        <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md lg:left-64">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold tracking-tight text-emerald-900">Dashboard</h2>
            <span className="text-slate-300">|</span>
            <p className="text-sm font-medium text-slate-500">{todayLabel()}</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative hidden md:block">
              <input
                className="w-64 rounded-full border-none bg-surface-container-low py-2 pl-10 pr-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
                placeholder="Search operations..."
                type="text"
              />
              <MaterialSymbol className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-slate-400" icon="search" />
            </div>
            <div className="flex items-center gap-2">
              <button className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50" type="button">
                <MaterialSymbol icon="notifications" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-error"></span>
              </button>
              <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50" type="button">
                <MaterialSymbol icon="help" />
              </button>
              <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50" type="button">
                <MaterialSymbol icon="settings" />
              </button>
            </div>
            <UserAvatar
              alt={`${displayName} profile`}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700"
              initials={initials(displayName)}
            />
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-6 pt-24">
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {METRIC_CARDS.map((card) => (
              <div
                className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-6 transition-all hover:-translate-y-[2px]"
                key={card.label}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className={`rounded-lg p-2 ${card.accentClassName}`}>
                    <MaterialSymbol icon={card.icon} />
                  </div>
                  {card.trend === "warning" ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-error">
                      <MaterialSymbol className="text-sm" icon="warning" />
                    </span>
                  ) : card.trend ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                      <MaterialSymbol className="text-sm" icon="trending_up" />
                      {card.trend}
                    </span>
                  ) : null}
                </div>
                <p className="mb-1 text-label-sm font-label uppercase tracking-wider text-on-surface-variant">{card.label}</p>
                <h3 className="font-headline text-2xl font-bold">{card.value}</h3>
                {card.progress ? (
                  <div className="mt-4 h-1 w-full rounded-full bg-surface-container-low">
                    <div className="h-1 rounded-full bg-primary" style={{ width: card.progress }}></div>
                  </div>
                ) : null}
                {card.bars ? (
                  <div className="mt-4 flex gap-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        className={index < card.bars! ? "h-1 flex-1 rounded-full bg-primary" : "h-1 flex-1 rounded-full bg-surface-container-low"}
                        key={`${card.label}-${index}`}
                      ></div>
                    ))}
                  </div>
                ) : null}
                {card.detail ? <p className="mt-2 text-[10px] font-medium text-slate-400">{card.detail}</p> : null}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-bold font-headline">
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
                  <div className="group flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                    <div className="h-12 w-1 rounded-full bg-error"></div>
                    <div className="rounded-lg bg-error-container/20 p-2 text-error">
                      <MaterialSymbol icon="emergency_home" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">3 bookings unmapped</h4>
                      <p className="text-xs text-on-surface-variant">
                        Conflicting tee times on the North Course require manual resolution.
                      </p>
                    </div>
                    <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">
                      Resolve
                    </button>
                  </div>
                  <div className="group flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                    <div className="h-12 w-1 rounded-full bg-amber-500"></div>
                    <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                      <MaterialSymbol icon="thunderstorm" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">Weather warning: course closure</h4>
                      <p className="text-xs text-on-surface-variant">
                        Severe lightning predicted for 2:00 PM. Automated alerts ready to send.
                      </p>
                    </div>
                    <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">
                      Notify All
                    </button>
                  </div>
                  <div className="group flex items-center gap-4 rounded-xl bg-white p-4 transition-colors hover:bg-slate-50">
                    <div className="h-12 w-1 rounded-full bg-blue-500"></div>
                    <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                      <MaterialSymbol icon="inventory_2" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold">Pro Shop Inventory Low</h4>
                      <p className="text-xs text-on-surface-variant">
                        Titleist Pro V1 stock below threshold. Reorder suggested.
                      </p>
                    </div>
                    <button className="rounded-lg px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary-container" type="button">
                      Review
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold font-headline">Recent Activity</h3>
                  <button className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-primary" type="button">
                    View Log
                  </button>
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
                <h3 className="mb-6 text-sm font-bold font-headline uppercase tracking-widest text-emerald-900">
                  Quick Actions
                </h3>
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
                <h3 className="mb-6 text-sm font-bold font-headline uppercase tracking-widest text-on-surface">
                  Course Status
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">North Course</span>
                    <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">
                      Open
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">South Course</span>
                    <span className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase text-primary">
                      Open
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Driving Range</span>
                    <span className="rounded-lg bg-error-container/20 px-2 py-1 text-[10px] font-bold uppercase text-error">
                      Maintenance
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center gap-3 text-on-surface-variant">
                      <MaterialSymbol className="text-lg" icon="device_thermostat" />
                      <p className="text-sm">
                        18°C <span className="ml-1 text-xs opacity-60">Humidity: 45%</span>
                      </p>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Club context: {selectedClubName} • {timezone}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 backdrop-blur-xl lg:hidden"
        inactiveClassName="text-slate-500 active:bg-slate-100 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/admin/dashboard", isActive: true },
          { label: "Book", icon: "add_circle" },
          { label: "Activity", icon: "history" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="font-label text-[10px] font-medium"
      />
    </div>
  );
}
