import { useState } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../benchmark/material-symbol";
import { useSession } from "../../session/session-context";

type NavItem = {
  key: string;
  label: string;
  icon: string;
  href: string;
};

type NavGroup = {
  id: string;
  label: string | null;
  keys: string[];
};

const FALLBACK_NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Overview", icon: "dashboard", href: "/admin/dashboard" },
  { key: "golf_dashboard", label: "Dashboard", icon: "dashboard", href: "/admin/golf/dashboard" },
  { key: "golf_tee_sheet", label: "Tee Sheet", icon: "calendar_today", href: "/admin/golf/tee-sheet" },
  { key: "people_dashboard", label: "Dashboard", icon: "dashboard", href: "/admin/people/dashboard" },
  { key: "members", label: "Members", icon: "group", href: "/admin/members" },
  { key: "finance_dashboard", label: "Dashboard", icon: "dashboard", href: "/admin/finance/dashboard" },
  { key: "finance", label: "Close Day", icon: "payments", href: "/admin/finance" },
  { key: "reports", label: "Reports", icon: "analytics", href: "/admin/reports" },
  { key: "halfway", label: "Halfway", icon: "storefront", href: "/admin/halfway" },
  { key: "pro_shop", label: "Pro Shop", icon: "store", href: "/admin/pro-shop" },
  { key: "pos_terminal", label: "POS Terminal", icon: "point_of_sale", href: "/admin/pos-terminal" },
  { key: "orders", label: "Order Queue", icon: "receipt_long", href: "/admin/orders" },
  { key: "communications", label: "Communications", icon: "chat_bubble", href: "/admin/communications" },
  { key: "club_settings", label: "Club Settings", icon: "settings_applications", href: "/admin/settings/club" },
  { key: "targets", label: "Targets", icon: "flag", href: "/admin/targets" },
];

const BACKEND_ICON_BY_KEY: Record<string, string> = {
  dashboard: "dashboard",
  golf_dashboard: "dashboard",
  golf_tee_sheet: "calendar_today",
  golf_settings: "settings",
  people_dashboard: "dashboard",
  members: "group",
  finance_dashboard: "dashboard",
  finance: "payments",
  reports: "analytics",
  halfway: "storefront",
  pro_shop: "store",
  pos_terminal: "point_of_sale",
  communications: "chat_bubble",
  club_settings: "settings_applications",
  orders: "receipt_long",
  targets: "flag",
};

const PRIMARY_NAV_GROUPS: NavGroup[] = [
  { id: "overview", label: null, keys: ["dashboard"] },
  { id: "golf", label: "Golf", keys: ["golf_dashboard", "golf_tee_sheet"] },
  { id: "people", label: "People", keys: ["people_dashboard", "members"] },
  { id: "finance", label: "Finance", keys: ["finance_dashboard", "finance", "reports"] },
  { id: "operations", label: "Operations", keys: ["halfway", "pro_shop", "pos_terminal", "orders"] },
  { id: "my_club", label: "My Club", keys: ["communications", "club_settings", "targets"] },
];

const SECONDARY_NAV_KEYS: string[] = [];

function navLinkClass(isActive: boolean): string {
  return isActive
    ? "flex items-center gap-3 rounded-l-xl border-r-4 border-emerald-600 bg-emerald-50/50 px-4 py-3 text-sm font-semibold text-emerald-800 transition-all duration-200"
    : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600 transition-all duration-200 hover:bg-slate-100 hover:text-emerald-700";
}


function NavItemLink({ item }: { item: NavItem }): JSX.Element {
  return (
    <NavLink className={({ isActive }) => navLinkClass(isActive)} to={item.href}>
      {({ isActive }) => (
        <>
          <MaterialSymbol filled={isActive} icon={item.icon} />
          <span className="font-label font-medium">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}


function SignOutButton(): JSX.Element {
  const { logout } = useSession();
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-error"
      onClick={() => {
        void logout();
      }}
    >
      <MaterialSymbol className="text-[20px]" icon="logout" />
      <span className="font-medium">Sign Out</span>
    </button>
  );
}

function CollapsibleGroup({
  label,
  items,
  open,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  open: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={label}
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
      >
        <span aria-hidden="true">{label}</span>
        <MaterialSymbol
          aria-hidden="true"
          className={`text-[18px] text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          icon="expand_more"
        />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5">
          {items.map((item) => (
            <NavItemLink item={item} key={item.key} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminSidebar(): JSX.Element {
  const { bootstrap } = useSession();
  const backendNavItems = (bootstrap?.menu_items ?? [])
    .filter((item) => item.shell === "admin")
    .map((item) => ({
      key: item.key,
      label: item.label,
      icon: BACKEND_ICON_BY_KEY[item.key] ?? "apps",
      href: item.path,
    }));
  const usesBackendMenu = backendNavItems.length > 0;
  const navItems = usesBackendMenu ? backendNavItems : FALLBACK_NAV_ITEMS;

  const assignedKeys = new Set<string>();
  const grouped = PRIMARY_NAV_GROUPS.map((group) => {
    const items = group.keys
      .map((key) => navItems.find((item) => item.key === key))
      .filter((item): item is NavItem => item !== undefined);
    items.forEach((item) => assignedKeys.add(item.key));
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  const ungrouped = navItems.filter((item) => !assignedKeys.has(item.key));

  // All labeled groups collapsed by default
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  function toggleGroup(id: string): void {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-slate-200/50 bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
            <MaterialSymbol filled icon="forest" />
          </div>
          <div>
            <h1 className="font-headline text-xl font-bold leading-none tracking-tight text-emerald-900">GreenLink</h1>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Club Operations</span>
          </div>
        </div>

        <nav className="space-y-1">
          {grouped.map((group, index) => (
            <div className={index > 0 ? "pt-2" : undefined} key={group.id}>
              {group.label ? (
                <CollapsibleGroup
                  label={group.label}
                  items={group.items}
                  open={openGroups.has(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                />
              ) : (
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItemLink item={item} key={item.key} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {ungrouped.length > 0 ? (
            <div className="pt-2">
              <div className="space-y-0.5">
                {ungrouped.map((item) => (
                  <NavItemLink item={item} key={item.key} />
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      </div>

      <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-800">
        <SignOutButton />
      </div>
    </aside>
  );
}
