import { useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";

import { prefetchOperationalSettings } from "../features/golf-settings/hooks";
import { prefetchOpenOrders } from "../features/orders/hooks";
import { prefetchTeeSheetDay } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";

export function AdminShellPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club ?? null;
  const membership = bootstrap?.available_clubs.find((club) => club.club_id === selectedClubId);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-block">
          <p className="eyebrow">GreenLink Admin</p>
          <h1>{selectedClub?.name ?? "Club workspace"}</h1>
          <p className="muted">
            {membership?.membership_role ?? "superadmin"} {selectedClub ? `| ${selectedClub.timezone}` : ""}
          </p>
        </div>
        <nav className="admin-nav" aria-label="Admin navigation">
          <NavLink className="admin-nav-link" to="/admin/dashboard">
            Dashboard
          </NavLink>
          <NavLink
            className="admin-nav-link"
            to="/admin/golf/tee-sheet"
            onMouseEnter={() => {
              void prefetchTeeSheetDay(queryClient, accessToken, selectedClubId);
            }}
          >
            Tee Sheet
          </NavLink>
          <NavLink
            className="admin-nav-link"
            to="/admin/golf/settings"
            onMouseEnter={() => {
              void prefetchOperationalSettings(queryClient, accessToken, selectedClubId);
            }}
          >
            Golf Settings
          </NavLink>
          <NavLink
            className="admin-nav-link"
            to="/admin/orders"
            onMouseEnter={() => {
              void prefetchOpenOrders(queryClient, accessToken, selectedClubId);
            }}
          >
            Orders
          </NavLink>
          <NavLink className="admin-nav-link" to="/admin/pos-terminal">
            POS
          </NavLink>
          <NavLink className="admin-nav-link" to="/select-club">
            Change Club
          </NavLink>
        </nav>
      </aside>
      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Selected Club</p>
            <strong>{selectedClub?.name ?? "No active club"}</strong>
          </div>
          <div className="admin-topbar-meta">
            <span>{bootstrap?.user.display_name ?? "Admin"}</span>
            <span>{selectedClub?.timezone ?? "Club context required"}</span>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}
