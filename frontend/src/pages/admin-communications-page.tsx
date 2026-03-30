import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { useSession } from "../session/session-context";

type CommunicationRow = {
  status: string;
  statusClassName: string;
  title: string;
  recipients: string;
  date: string;
  engagement: string;
};

type NewsItem = {
  author: string;
  role: string;
  time: string;
  title: string;
  description: string;
  visibility: string;
  pinned?: boolean;
};

const RECENT_COMMUNICATIONS: CommunicationRow[] = [
  {
    status: "Sent",
    statusClassName: "bg-primary-container text-on-primary-container",
    title: "Monthly Tournament Schedule - Oct",
    recipients: "All Members",
    date: "Oct 12, 2023",
    engagement: "92% views • 48% clicks",
  },
  {
    status: "Scheduled",
    statusClassName: "bg-secondary-container text-on-secondary-container",
    title: "Clubhouse Renovation Update",
    recipients: "Premium Tier",
    date: "Oct 28, 2023",
    engagement: "---",
  },
  {
    status: "Draft",
    statusClassName: "bg-surface-container-highest text-slate-600",
    title: "Winter League Invitation",
    recipients: "Men's A-Grade",
    date: "Last edit: 2h ago",
    engagement: "---",
  },
];

const NEWS_ITEMS: NewsItem[] = [
  {
    author: "Marcus Thorne",
    role: "Captain",
    time: "1 hour ago",
    title: "New Pro-Shop discounts for Platinum members",
    description:
      "Effective immediately, all Platinum tier members receive an additional 15% off at the clubhouse store...",
    visibility: "Public Visibility",
    pinned: true,
  },
  {
    author: "Sarah Jenkins",
    role: "Events Mgr",
    time: "1 day ago",
    title: "Staff Training: Clubhouse closure Monday",
    description:
      "Please note the main lounge will be closed for quarterly training on Monday between 9AM and 1PM.",
    visibility: "Internal Only",
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
    ? "flex items-center rounded-xl border-r-2 border-emerald-700 bg-emerald-50/50 px-3 py-2.5 font-['Inter'] text-sm font-semibold tracking-tight text-emerald-700 transition-colors duration-200 dark:bg-emerald-900/20 dark:text-emerald-400"
    : "flex items-center rounded-xl px-3 py-2.5 font-['Inter'] text-sm font-medium tracking-tight text-slate-600 transition-colors duration-200 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";
}

export function AdminCommunicationsPage(): JSX.Element {
  const { bootstrap } = useSession();
  const displayName = bootstrap?.user.display_name ?? "Club Admin";

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r-0 bg-slate-50 dark:bg-slate-900 md:flex">
        <div className="flex h-full flex-col px-4 py-6">
          <div className="mb-10 px-2">
            <span className="font-['Manrope'] text-xl font-bold text-emerald-900 dark:text-emerald-50">
              The Operational Architect
            </span>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Club Management</p>
          </div>
          <nav className="flex-1 space-y-1">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/dashboard">
              <MaterialSymbol className="mr-3" icon="dashboard" />
              Dashboard
            </NavLink>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/communications">
              <MaterialSymbol className="mr-3" icon="chat_bubble" />
              Communications
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol className="mr-3" icon="group" />
              Members
            </button>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol className="mr-3" icon="trophy" />
              Competitions
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/settings">
              <MaterialSymbol className="mr-3" icon="settings" />
              Settings
            </NavLink>
          </nav>
          <div className="mt-auto border-t border-slate-100 pt-6 dark:border-slate-800">
            <div className="flex items-center px-2">
              <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-on-primary-container">
                {initials(displayName)}
              </div>
              <div className="text-xs">
                <p className="font-bold text-on-surface">{displayName}</p>
                <p className="text-slate-500">GreenLink Pro</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-slate-100 bg-white/80 px-8 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
          <div className="flex flex-1 items-center space-x-6">
            <h1 className="font-['Manrope'] text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Communications
            </h1>
            <div className="relative hidden w-full max-w-md lg:block">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <MaterialSymbol className="text-sm" icon="search" />
              </span>
              <input
                className="w-full rounded-xl border-none bg-surface-container-low py-2 pl-10 pr-4 text-sm transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                placeholder="Search threads or members..."
                type="text"
              />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button className="p-2 text-slate-500 transition-all hover:text-emerald-600 dark:hover:text-emerald-300" type="button">
              <MaterialSymbol icon="notifications" />
            </button>
            <button className="p-2 text-slate-500 transition-all hover:text-emerald-600 dark:hover:text-emerald-300" type="button">
              <MaterialSymbol icon="help_outline" />
            </button>
            <button className="flex items-center rounded-xl bg-gradient-to-r from-primary to-primary-dim px-5 py-2 text-sm font-semibold text-white shadow-sm duration-150 active:scale-95" type="button">
              <MaterialSymbol className="mr-2 text-sm" icon="add" />
              New Message
            </button>
          </div>
        </header>

        <div className="space-y-10 p-8">
          <div className="flex space-x-8 border-b border-slate-100 dark:border-slate-800">
            <button className="border-b-2 border-primary pb-4 text-sm font-semibold text-primary" type="button">
              All Messages
            </button>
            <button className="pb-4 text-sm font-medium text-slate-500 transition-colors hover:text-on-surface" type="button">
              Member News
            </button>
            <button className="pb-4 text-sm font-medium text-slate-500 transition-colors hover:text-on-surface" type="button">
              Competition Results
            </button>
          </div>

          <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div className="space-y-4 rounded-xl bg-surface-container-lowest p-6 md:col-span-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-label-sm font-semibold uppercase tracking-wider text-slate-500">Communication Health</p>
                  <h3 className="mt-1 text-2xl font-bold">84.2% Average Open Rate</h3>
                </div>
                <MaterialSymbol className="rounded-lg bg-emerald-50 p-2 text-emerald-600" icon="trending_up" />
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full w-[84%] bg-primary"></div>
              </div>
              <p className="text-xs text-slate-400">+12.5% from previous month</p>
            </div>
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-6">
              <p className="text-label-sm font-semibold uppercase tracking-wider text-slate-500">Scheduled</p>
              <h3 className="text-3xl font-bold">12</h3>
              <p className="text-xs text-slate-400">Next: Annual AGM Notice</p>
            </div>
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-6">
              <p className="text-label-sm font-semibold uppercase tracking-wider text-slate-500">Unread Replies</p>
              <h3 className="text-3xl font-bold">08</h3>
              <p className="flex items-center text-xs font-medium text-emerald-600">
                <MaterialSymbol className="mr-1 text-xs" icon="check_circle" />
                Queue under control
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold tracking-tight">Recent Communications</h2>
              <button className="flex items-center text-sm font-semibold text-primary hover:underline" type="button">
                View Archive
                <MaterialSymbol className="ml-1 text-sm" icon="chevron_right" />
              </button>
            </div>
            <div className="overflow-hidden rounded-xl bg-surface-container-lowest">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Title</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Recipients</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Engagement</th>
                      <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-0">
                    {RECENT_COMMUNICATIONS.map((row) => (
                      <tr className="group transition-colors hover:bg-surface-container-high" key={row.title}>
                        <td className="px-6 py-5">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${row.statusClassName}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 font-semibold text-on-surface">{row.title}</td>
                        <td className="px-6 py-5 text-sm text-slate-600">{row.recipients}</td>
                        <td className="px-6 py-5 text-sm text-slate-500">{row.date}</td>
                        <td className="px-6 py-5 text-sm text-slate-400">{row.engagement}</td>
                        <td className="px-6 py-5 text-right">
                          <button className="opacity-0 transition-opacity group-hover:opacity-100" type="button">
                            <MaterialSymbol className="text-slate-400" icon="more_vert" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Member News</h2>
                <button className="rounded-lg bg-primary-container/30 px-3 py-1 text-xs font-bold text-primary" type="button">
                  Manage Feed
                </button>
              </div>
              <div className="space-y-4">
                {NEWS_ITEMS.map((item) => (
                  <div
                    className={item.pinned ? "rounded-xl border-l-4 border-primary bg-surface-container-lowest p-5" : "rounded-xl bg-surface-container-lowest p-5"}
                    key={item.title}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center">
                        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                          <MaterialSymbol className="text-sm" icon="person" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{item.author}</p>
                          <p className="text-[10px] uppercase tracking-tighter text-slate-400">
                            {item.role} • {item.time}
                          </p>
                        </div>
                      </div>
                      <button className={item.pinned ? "text-primary" : "text-slate-300 transition-colors hover:text-primary"} title="Pinned to Player App" type="button">
                        <MaterialSymbol className="text-sm" filled={item.pinned} icon="push_pin" />
                      </button>
                    </div>
                    <h4 className="mb-2 font-bold text-on-surface">{item.title}</h4>
                    <p className="line-clamp-2 text-sm text-slate-600">{item.description}</p>
                    <div className="mt-4 flex items-center justify-between text-[11px] font-bold uppercase text-slate-500">
                      <span className="flex items-center">
                        <MaterialSymbol className="mr-1 text-xs" icon={item.visibility === "Public Visibility" ? "public" : "group"} />
                        {item.visibility}
                      </span>
                      <button className="transition-colors hover:text-primary" type="button">
                        Edit Post
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">Competition Results</h2>
                <button className="rounded-lg bg-primary-container/30 px-3 py-1 text-xs font-bold text-primary" type="button">
                  Upload CSV
                </button>
              </div>
              <div className="space-y-6 rounded-xl bg-surface-container-lowest p-6">
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-surface-container-low/50 p-8 text-center">
                  <MaterialSymbol className="mb-2 text-3xl text-slate-400" icon="upload_file" />
                  <p className="text-sm font-semibold text-slate-600">Drop latest tournament results here</p>
                  <p className="mt-1 text-xs text-slate-400">Supports PDF, CSV, or Excel formats</p>
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Recently Processed</p>
                  <div className="group flex items-center rounded-lg bg-surface-container-low p-4">
                    <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                      <MaterialSymbol className="text-emerald-600" icon="description" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Fall Classic - Round 3.pdf</p>
                      <div className="mt-1 flex items-center">
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          PUBLISHED
                        </span>
                        <span className="ml-2 text-[10px] uppercase text-slate-400">Oct 14, 2:30 PM</span>
                      </div>
                    </div>
                    <button className="p-2 text-slate-400 transition-colors hover:text-on-surface" type="button">
                      <MaterialSymbol icon="visibility" />
                    </button>
                  </div>
                  <div className="group flex items-center rounded-lg bg-surface-container-low p-4">
                    <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                      <MaterialSymbol className="text-secondary" icon="description" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">Member Guest Invitationals.xlsx</p>
                      <div className="mt-1 flex items-center">
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          Internal Only
                        </span>
                        <span className="ml-2 text-[10px] uppercase text-slate-400">Oct 12, 10:15 AM</span>
                      </div>
                    </div>
                    <button className="p-2 text-slate-400 transition-colors hover:text-primary" type="button">
                      <MaterialSymbol icon="publish" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
