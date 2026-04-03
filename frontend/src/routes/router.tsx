import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "../components/protected-route";
import { AdminLayout } from "./admin-layout";
import { AdminCommunicationsPage } from "../pages/admin-communications-page";
import { AdminDashboardPage } from "../pages/admin-dashboard-page";
import { AdminHalfwayPage } from "../pages/admin-halfway-page";
import { AdminProShopPage } from "../pages/admin-pro-shop-page";
import { AdminReportsPage } from "../pages/admin-reports-page";
import { AdminFinancePage } from "../pages/admin-finance-page";
import { AdminGolfSettingsPage } from "../pages/admin-golf-settings-page";
import { AdminMembersPage } from "../pages/admin-members-page";
import { AdminGolfTeeSheetPage } from "../pages/admin-golf-tee-sheet-page";
import { AdminOrderQueuePage } from "../pages/admin-order-queue-page";
import { AdminPosTerminalPage } from "../pages/admin-pos-terminal-page";
import { LoginPage } from "../pages/login-page";
import { PlayerBookPage } from "../pages/player-book-page";
import { PlayerOrderPage } from "../pages/player-order-page";
import { PlayerShellPage } from "../pages/player-shell-page";
import { SelectClubPage } from "../pages/select-club-page";
import { SuperadminClubsPage } from "../pages/superadmin-clubs-page";
import { SuperadminOverviewPage } from "../pages/superadmin-overview-page";
import { SuperadminLayout } from "./superadmin-layout";
import { useSession } from "../session/session-context";

function RootRedirect(): JSX.Element {
  const { accessToken, bootstrap } = useSession();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (!bootstrap) {
    return <div className="centered-panel">Loading session...</div>;
  }
  return <Navigate to={bootstrap.landing_path} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/select-club",
    element: <ProtectedRoute />,
    children: [{ index: true, element: <SelectClubPage /> }],
  },
  {
    path: "/admin",
    element: <ProtectedRoute shell="admin" />,
    children: [
      { path: "select-club", element: <SelectClubPage /> },
      {
        element: <AdminLayout />,
        children: [
          { path: "dashboard", element: <AdminDashboardPage /> },
          { path: "golf/tee-sheet", element: <AdminGolfTeeSheetPage /> },
          { path: "golf/settings", element: <AdminGolfSettingsPage /> },
          { path: "orders", element: <AdminOrderQueuePage /> },
          { path: "members", element: <AdminMembersPage /> },
          { path: "finance", element: <AdminFinancePage /> },
          { path: "communications", element: <AdminCommunicationsPage /> },
          { path: "halfway", element: <AdminHalfwayPage /> },
          { path: "pro-shop", element: <AdminProShopPage /> },
          { path: "reports", element: <AdminReportsPage /> },
          { path: "pos-terminal", element: <AdminPosTerminalPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/admin/dashboard" replace /> },
    ],
  },
  {
    path: "/superadmin",
    element: <ProtectedRoute shell="superadmin" />,
    children: [
      {
        element: <SuperadminLayout />,
        children: [
          { path: "overview", element: <SuperadminOverviewPage /> },
          { path: "clubs", element: <SuperadminClubsPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/superadmin/overview" replace /> },
    ],
  },
  {
    path: "/player",
    element: <ProtectedRoute shell="player" />,
    children: [
      { path: "home", element: <PlayerShellPage /> },
      { path: "book", element: <PlayerBookPage /> },
      { path: "order", element: <PlayerOrderPage /> },
      { path: "*", element: <Navigate to="/player/home" replace /> },
    ],
  },
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider future={{ v7_startTransition: true }} router={router} />;
}
