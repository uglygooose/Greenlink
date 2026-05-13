// Phase 7 — Admin layout. Replaces the pre-rebuild AdminShell wrapper with
// the new admin-shell components in frontend/src/components/admin-shell/.
// Route metadata still controls title + search placeholder per path.
import { Outlet, useLocation } from "react-router-dom";

import { AdminShell } from "../components/admin-shell/AdminShell";

interface AdminRouteMeta {
  title: string;
  breadcrumbs?: string[];
  searchPlaceholder?: string;
}

const ADMIN_ROUTE_META: Array<{ match: (pathname: string) => boolean; meta: AdminRouteMeta }> = [
  { match: (p) => p === "/admin/dashboard", meta: { title: "Dashboard" } },
  { match: (p) => p === "/admin/golf/dashboard", meta: { title: "Golf summary" } },
  { match: (p) => p === "/admin/golf/tee-sheet", meta: { title: "Tee sheet", searchPlaceholder: "Search tee times…" } },
  { match: (p) => p === "/admin/tee-sheet", meta: { title: "Tee sheet", breadcrumbs: ["Operate"], searchPlaceholder: "Search tee times…" } },
  { match: (p) => p === "/admin/golf/settings", meta: { title: "Golf settings" } },
  { match: (p) => p === "/admin/settings", meta: { title: "Club", breadcrumbs: ["Settings"] } },
  { match: (p) => p === "/admin/settings/modules", meta: { title: "Modules", breadcrumbs: ["Settings"] } },
  { match: (p) => p === "/admin/orders", meta: { title: "Order queue", searchPlaceholder: "Search orders…" } },
  { match: (p) => p === "/admin/people/dashboard", meta: { title: "People summary" } },
  { match: (p) => p === "/admin/members", meta: { title: "Members", searchPlaceholder: "Search members…" } },
  { match: (p) => p === "/admin/finance/dashboard", meta: { title: "Finance summary" } },
  { match: (p) => p === "/admin/finance", meta: { title: "Daily close" } },
  { match: (p) => p === "/admin/communications", meta: { title: "Communications", searchPlaceholder: "Search posts…" } },
  { match: (p) => p === "/admin/halfway", meta: { title: "Halfway house", searchPlaceholder: "Search orders…" } },
  { match: (p) => p === "/admin/pro-shop", meta: { title: "Pro shop", searchPlaceholder: "Search products…" } },
  { match: (p) => p === "/admin/reports", meta: { title: "Reports" } },
  { match: (p) => p === "/admin/targets", meta: { title: "Targets" } },
  { match: (p) => p === "/admin/pos-terminal", meta: { title: "POS terminal", searchPlaceholder: "Search products…" } },
];

function routeMetaFor(pathname: string): AdminRouteMeta {
  return (
    ADMIN_ROUTE_META.find((entry) => entry.match(pathname))?.meta ?? {
      title: "Admin",
    }
  );
}

export function AdminLayout(): JSX.Element {
  const location = useLocation();
  const meta = routeMetaFor(location.pathname);

  return (
    <AdminShell title={meta.title} breadcrumbs={meta.breadcrumbs} searchPlaceholder={meta.searchPlaceholder}>
      <Outlet />
    </AdminShell>
  );
}
