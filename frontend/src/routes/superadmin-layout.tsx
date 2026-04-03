import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import SuperadminShell from "../components/shell/SuperadminShell";

export type SuperadminLayoutContext = {
  search: string;
  setSearch: (value: string) => void;
};

type RouteMeta = { title: string; searchPlaceholder: string };

const ROUTE_META: Array<{ match: (p: string) => boolean; meta: RouteMeta }> = [
  {
    match: (p) => p === "/superadmin/overview",
    meta: { title: "Overview", searchPlaceholder: "Search..." },
  },
  {
    match: (p) => p === "/superadmin/clubs",
    meta: { title: "Club Onboarding", searchPlaceholder: "Search clubs..." },
  },
];

function routeMetaFor(pathname: string): RouteMeta {
  return (
    ROUTE_META.find((entry) => entry.match(pathname))?.meta ?? {
      title: "Superadmin",
      searchPlaceholder: "Search...",
    }
  );
}

export function SuperadminLayout(): JSX.Element {
  const [search, setSearch] = useState("");
  const location = useLocation();
  const meta = routeMetaFor(location.pathname);

  return (
    <SuperadminShell
      onSearchChange={setSearch}
      searchPlaceholder={meta.searchPlaceholder}
      searchValue={search}
      title={meta.title}
    >
      <Outlet context={{ search, setSearch } satisfies SuperadminLayoutContext} />
    </SuperadminShell>
  );
}
