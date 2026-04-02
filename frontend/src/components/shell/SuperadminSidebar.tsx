import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../benchmark/material-symbol";
import { useSession } from "../../session/session-context";

const NAV_ITEMS = [
  { label: "Clubs", icon: "business", href: "/superadmin/clubs", active: true },
  { label: "System Health", icon: "monitor_heart", href: "/superadmin/clubs", active: false },
  { label: "Billing", icon: "payments", href: "/superadmin/clubs", active: false },
  { label: "Global Settings", icon: "settings_applications", href: "/superadmin/clubs", active: false },
];

function SignOutButton(): JSX.Element {
  const { logout } = useSession();
  return (
    <button
      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-surface-container-low hover:text-on-surface"
      onClick={() => {
        void logout();
      }}
      type="button"
    >
      <MaterialSymbol className="text-[20px]" icon="logout" />
      <span>Sign Out</span>
    </button>
  );
}

export default function SuperadminSidebar(): JSX.Element {
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-72 flex-col bg-surface-container-low px-5 py-6 text-on-surface">
      <div className="space-y-1 px-2">
        <h1 className="font-headline text-2xl font-extrabold tracking-tight text-primary">Superadmin</h1>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Implementation Control
        </p>
      </div>

      <nav className="mt-8 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            className={({ isActive }) =>
              isActive && item.active
                ? "flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-primary shadow-sm"
                : "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/70 hover:text-on-surface"
            }
            to={item.href}
          >
            <MaterialSymbol filled={item.active} icon={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 px-2">
        <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Mode</p>
          <p className="mt-1 text-sm font-semibold text-on-surface">Onboarding and rollout workspace</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Clubs are configured here before club admin and staff take over daily operations.
          </p>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
