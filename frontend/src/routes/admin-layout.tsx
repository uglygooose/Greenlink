import { Outlet, useLocation } from "react-router-dom";

import AdminShell from "../components/shell/AdminShell";

type AdminRouteMeta = {
  title: string;
  searchPlaceholder: string;
};

const ADMIN_ROUTE_META: Array<{ match: (pathname: string) => boolean; meta: AdminRouteMeta }> = [
  {
    match: (pathname) => pathname === "/admin/dashboard",
    meta: { title: "Today", searchPlaceholder: "Search today..." },
  },
  {
    match: (pathname) => pathname === "/admin/golf/dashboard",
    meta: { title: "Golf Summary", searchPlaceholder: "Search golf summary..." },
  },
  {
    match: (pathname) => pathname === "/admin/golf/tee-sheet",
    meta: { title: "Tee Sheet", searchPlaceholder: "Search tee times..." },
  },
  {
    match: (pathname) => pathname === "/admin/golf/settings",
    meta: { title: "Golf Settings", searchPlaceholder: "Search settings..." },
  },
  {
    match: (pathname) => pathname === "/admin/settings",
    meta: { title: "Settings", searchPlaceholder: "Search settings..." },
  },
  {
    match: (pathname) => pathname === "/admin/orders",
    meta: { title: "Order Queue", searchPlaceholder: "Search orders..." },
  },
  {
    match: (pathname) => pathname === "/admin/people/dashboard",
    meta: { title: "People Summary", searchPlaceholder: "Search people summary..." },
  },
  {
    match: (pathname) => pathname === "/admin/members",
    meta: { title: "Members", searchPlaceholder: "Search members..." },
  },
  {
    match: (pathname) => pathname === "/admin/finance/dashboard",
    meta: { title: "Finance Summary", searchPlaceholder: "Search finance summary..." },
  },
  {
    match: (pathname) => pathname === "/admin/finance",
    meta: { title: "Close Day", searchPlaceholder: "Search close workflow..." },
  },
  {
    match: (pathname) => pathname === "/admin/communications",
    meta: { title: "Communications", searchPlaceholder: "Search posts..." },
  },
  {
    match: (pathname) => pathname === "/admin/halfway",
    meta: { title: "Halfway House", searchPlaceholder: "Search orders..." },
  },
  {
    match: (pathname) => pathname === "/admin/pro-shop",
    meta: { title: "Pro Shop", searchPlaceholder: "Search products..." },
  },
  {
    match: (pathname) => pathname === "/admin/reports",
    meta: { title: "Performance", searchPlaceholder: "Search performance..." },
  },
  {
    match: (pathname) => pathname === "/admin/targets",
    meta: { title: "Targets", searchPlaceholder: "Search targets..." },
  },
  {
    match: (pathname) => pathname === "/admin/pos-terminal",
    meta: { title: "POS Terminal", searchPlaceholder: "Search products..." },
  },
  {
    match: (pathname) => pathname === "/admin/settings/modules",
    meta: { title: "Modules", searchPlaceholder: "Search settings..." },
  },
];

function routeMetaFor(pathname: string): AdminRouteMeta {
  return (
    ADMIN_ROUTE_META.find((entry) => entry.match(pathname))?.meta ?? {
      title: "Admin",
      searchPlaceholder: "Search...",
    }
  );
}

export function AdminLayout(): JSX.Element {
  const location = useLocation();
  const meta = routeMetaFor(location.pathname);

  return (
    <AdminShell searchPlaceholder={meta.searchPlaceholder} title={meta.title}>
      <Outlet />
    </AdminShell>
  );
}
