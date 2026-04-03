import { useState } from "react";
import { Outlet } from "react-router-dom";

import SuperadminShell from "../components/shell/SuperadminShell";

export type SuperadminLayoutContext = {
  search: string;
  setSearch: (value: string) => void;
};

export function SuperadminLayout(): JSX.Element {
  const [search, setSearch] = useState("");

  return (
    <SuperadminShell
      onSearchChange={setSearch}
      searchPlaceholder="Search clubs..."
      searchValue={search}
      title="Club Onboarding"
    >
      <Outlet context={{ search, setSearch } satisfies SuperadminLayoutContext} />
    </SuperadminShell>
  );
}
