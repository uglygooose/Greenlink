import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useSession } from "../session/session-context";

type FinanceMetric = {
  label: string;
  value: string;
  detail: string;
  icon: string;
  accentClassName: string;
  borderClassName: string;
};

type JournalEntry = {
  date: string;
  title: string;
  reference: string;
  category: string;
  amount: string;
  status: string;
  statusClassName: string;
};

const METRICS: FinanceMetric[] = [
  {
    label: "Total Unpaid",
    value: "$14,280.00",
    detail: "24 entries",
    icon: "pending_actions",
    accentClassName: "text-error",
    borderClassName: "border-l-4 border-error",
  },
  {
    label: "Pending Exports",
    value: "45",
    detail: "Ready for sync",
    icon: "ios_share",
    accentClassName: "text-primary",
    borderClassName: "border-l-4 border-primary",
  },
  {
    label: "Accounting Status",
    value: "Synced with Xero",
    detail: "Last automated sync: 14 mins ago",
    icon: "verified_user",
    accentClassName: "text-secondary",
    borderClassName: "border-l-4 border-secondary",
  },
];

const JOURNAL: JournalEntry[] = [
  {
    date: "Aug 24, 2023",
    title: "Member Dues - John Smith",
    reference: "INV-882910",
    category: "Subscriptions",
    amount: "$450.00",
    status: "Queued",
    statusClassName: "bg-primary-container text-on-primary-container",
  },
  {
    date: "Aug 23, 2023",
    title: "Catering Supply - Fresh Greens",
    reference: "EXP-44021",
    category: "Operations",
    amount: "$1,240.00",
    status: "Pending",
    statusClassName: "border border-outline-variant text-slate-600",
  },
  {
    date: "Aug 22, 2023",
    title: "Golf Cart Maintenance",
    reference: "MNT-9912",
    category: "Fleet",
    amount: "$890.50",
    status: "Exported",
    statusClassName: "bg-secondary-container text-on-secondary-container",
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

function sidebarLinkClass(isActive: boolean): string {
  return isActive
    ? "flex items-center gap-3 rounded-l-xl border-r-4 border-emerald-600 bg-emerald-50/50 px-4 py-3 font-bold text-emerald-800 transition-all duration-200 ease-in-out dark:bg-emerald-900/20 dark:text-emerald-400"
    : "group flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 transition-all duration-200 ease-in-out hover:bg-slate-100 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-emerald-300";
}

export function AdminFinancePage(): JSX.Element {
  const { bootstrap } = useSession();
  const displayName = bootstrap?.user.display_name ?? "Club Admin";

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r border-slate-100/50 bg-slate-50 dark:bg-slate-950 lg:flex">
        <div className="px-6 py-8">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <MaterialSymbol icon="forest" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-none text-emerald-900">GreenLink</h1>
              <span className="font-label text-[10px] uppercase tracking-widest text-slate-500">Golf Operations</span>
            </div>
          </div>
          <nav className="space-y-1">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/dashboard">
              <MaterialSymbol icon="dashboard" />
              <span className="font-label text-sm font-medium">Dashboard</span>
            </NavLink>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/tee-sheet">
              <MaterialSymbol icon="calendar_today" />
              <span className="font-label text-sm font-medium">Tee Sheet</span>
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol icon="group" />
              <span className="font-label text-sm font-medium">Members</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/finance">
              <MaterialSymbol filled icon="payments" />
              <span className="font-label text-sm font-medium">Finance</span>
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol icon="inventory_2" />
              <span className="font-label text-sm font-medium">Inventory</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/communications">
              <MaterialSymbol icon="analytics" />
              <span className="font-label text-sm font-medium">Reports</span>
            </NavLink>
          </nav>
        </div>
        <div className="mt-auto space-y-4 px-6 py-8">
          <NavLink
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-headline font-bold text-white shadow-sm transition-colors hover:bg-primary-dim"
            to="/admin/pos-terminal"
          >
            <MaterialSymbol className="text-sm" icon="add" />
            <span>Open POS</span>
          </NavLink>
          <div className="space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/settings">
              <MaterialSymbol className="text-[20px]" icon="settings" />
              <span className="text-xs font-medium">Settings</span>
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol className="text-[20px]" icon="contact_support" />
              <span className="text-xs font-medium">Support</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col lg:ml-64">
        <header className="glass-header fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-100/50 px-8 lg:left-64">
          <div className="flex items-center gap-4">
            <h2 className="font-headline text-lg font-bold text-emerald-900">Cashbook Flow</h2>
            <div className="h-4 w-px bg-slate-200"></div>
            <nav className="hidden items-center gap-6 md:flex">
              <button className="text-sm font-semibold text-emerald-700" type="button">
                Audit Log
              </button>
              <button className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700" type="button">
                Settings
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <MaterialSymbol className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" icon="search" />
              <input
                className="w-64 rounded-full border-none bg-surface-container-low py-1.5 pl-10 pr-4 text-sm transition-all focus:ring-2 focus:ring-primary/20"
                placeholder="Search transactions..."
                type="text"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50" type="button">
                <MaterialSymbol icon="notifications" />
              </button>
              <UserAvatar
                alt={`${displayName} profile`}
                className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-primary-container text-primary shadow-sm"
                initials={initials(displayName)}
              />
            </div>
          </div>
        </header>

        <div className="mt-16 flex-1 p-8">
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {METRICS.map((metric) => (
              <div className={`rounded-xl bg-surface-container-lowest p-6 shadow-sm ${metric.borderClassName}`} key={metric.label}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.label}</span>
                  <MaterialSymbol className={metric.accentClassName} icon={metric.icon} />
                </div>
                {metric.label === "Accounting Status" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-on-surface">{metric.value}</span>
                      <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase text-on-secondary-container">
                        Live
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">{metric.detail}</p>
                  </>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{metric.value}</span>
                    <span className={`text-xs font-medium ${metric.accentClassName}`}>{metric.detail}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-slate-800">Cashbook Journal</h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">August 2023</span>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50" type="button">
                  <MaterialSymbol className="text-lg" icon="filter_list" />
                  Filter
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition-all active:scale-95 hover:shadow-md" type="button">
                  <MaterialSymbol className="text-lg" icon="publish" />
                  Trigger Export
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Item / Transaction</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Category</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {JOURNAL.map((entry) => (
                    <tr className="group transition-colors hover:bg-surface-container-low" key={entry.reference}>
                      <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-on-surface">{entry.title}</span>
                          <span className="text-[11px] text-slate-400">{entry.reference}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{entry.category}</span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-on-surface">{entry.amount}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${entry.statusClassName}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 transition-colors hover:text-primary" type="button">
                          <MaterialSymbol icon="more_vert" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 p-4">
              <span className="text-xs font-medium text-slate-500">Showing 45 of 45 records ready for export.</span>
              <div className="flex gap-2">
                <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:bg-white" type="button">
                  Previous
                </button>
                <button className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm" type="button">
                  1
                </button>
                <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:bg-white" type="button">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <aside className="fixed inset-y-0 right-0 z-50 hidden w-[420px] translate-x-0 flex-col border-l border-slate-200 bg-white shadow-2xl xl:flex">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Export Preview</h3>
            <p className="text-xs text-slate-500">Reviewing 45 records for General Ledger sync</p>
          </div>
          <button className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50" type="button">
            <MaterialSymbol icon="close" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="rounded-xl border border-primary/20 bg-primary-container/30 p-4">
            <div className="flex gap-3">
              <MaterialSymbol className="text-primary" icon="info" />
              <div>
                <p className="text-sm font-bold text-on-primary-container">Ready to Trigger Export</p>
                <p className="mt-1 text-xs leading-relaxed text-on-primary-container/80">
                  Are you sure you want to export 45 records to Xero? This will mark them as exported and lock them for further editing.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Handoff Summary</span>
              <button className="text-[11px] font-bold text-primary" type="button">
                Select All
              </button>
            </div>
            <div className="space-y-2">
              <div className="group flex items-center justify-between rounded-lg border border-transparent bg-surface p-3 transition-all hover:border-slate-200 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-on-surface">INV-882910</span>
                    <span className="text-[10px] text-slate-500">Member Dues</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-on-surface">$450.00</span>
              </div>
              <div className="group flex items-center justify-between rounded-lg border border-transparent bg-surface p-3 transition-all hover:border-slate-200 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-on-surface">MNT-9912</span>
                    <span className="text-[10px] text-slate-500">Cart Maintenance</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-on-surface">$890.50</span>
              </div>
              <div className="py-2 text-center">
                <span className="text-[10px] font-medium text-slate-400">... and 43 more records</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Export Value</span>
              <span className="text-xs font-bold text-emerald-400">Validated</span>
            </div>
            <div className="font-headline text-2xl font-extrabold">$18,452.25</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <button className="rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50" type="button">
            Cancel
          </button>
          <button className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dim" type="button">
            <MaterialSymbol className="text-sm" icon="sync" />
            Confirm Export
          </button>
        </div>
      </aside>

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/admin/dashboard" },
          { label: "Book", icon: "add_circle" },
          { label: "Activity", icon: "history", isActive: true },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="mt-1 font-label text-[10px] font-medium"
      />
    </div>
  );
}
