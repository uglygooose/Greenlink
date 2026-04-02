import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../benchmark/material-symbol";
import { useSession } from "../../session/session-context";

const NAV_ITEMS = [
  { label: "Dashboard", icon: "dashboard",      href: "/admin/dashboard" },
  { label: "Tee Sheet", icon: "calendar_today", href: "/admin/golf/tee-sheet" },
  { label: "Members",   icon: "group",           href: "/admin/members" },
  { label: "Finance",   icon: "payments",        href: "/admin/finance" },
  { label: "Inventory", icon: "inventory_2",     href: "/admin/inventory" },
  { label: "Comms",     icon: "chat_bubble",     href: "/admin/communications" },
  { label: "Reports",   icon: "analytics",       href: "/admin/reports" },
];

function SignOutButton(): JSX.Element {
  const { logout } = useSession();
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-error hover:bg-slate-100 transition-all duration-200"
      onClick={() => { void logout(); }}
    >
      <MaterialSymbol className="text-[20px]" icon="logout" />
      <span className="text-xs font-medium">Sign Out</span>
    </button>
  );
}

export default function AdminSidebar(): JSX.Element {
  return (
    <aside className="fixed left-0 top-0 z-30 h-screen w-64 flex flex-col bg-slate-50 border-r border-slate-200/50 dark:bg-slate-950">
      <div className="px-6 py-8">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
            <MaterialSymbol filled icon="forest" />
          </div>
          <div>
            <h1 className="font-headline font-bold text-xl text-emerald-900 tracking-tight leading-none">GreenLink</h1>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Golf Operations</span>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                isActive
                  ? "flex items-center gap-3 px-4 py-3 rounded-l-xl text-sm text-emerald-800 font-semibold bg-emerald-50/50 border-r-4 border-emerald-600 transition-all duration-200"
                  : "flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-all duration-200"
              }
            >
              {({ isActive }) => (
                <>
                  <MaterialSymbol filled={isActive} icon={item.icon} />
                  <span className="font-label font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto px-6 py-8 space-y-4">
        <NavLink
          to="/admin/golf/tee-sheet"
          className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-dim transition-colors shadow-sm"
        >
          <MaterialSymbol filled icon="add_circle" className="text-sm" />
          <span>Book Golf</span>
        </NavLink>
        <div className="border-t border-slate-200 pt-4 space-y-1 dark:border-slate-800">
          <NavLink
            to="/admin/golf/settings"
            className={({ isActive }) =>
              isActive
                ? "flex items-center gap-3 px-4 py-3 rounded-l-xl text-xs text-emerald-800 font-semibold bg-emerald-50/50 border-r-4 border-emerald-600 transition-all duration-200"
                : "flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-slate-100 transition-all duration-200"
            }
          >
            <MaterialSymbol className="text-[20px]" icon="settings" />
            <span className="text-xs font-medium">Settings</span>
          </NavLink>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
