import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "../components/protected-route";
import { AdminCommunicationsPage } from "../pages/admin-communications-page";
import { AdminDashboardPage } from "../pages/admin-dashboard-page";
import { AdminHalfwayPage } from "../pages/admin-halfway-page";
import { AdminFinancePage } from "../pages/admin-finance-page";
import { AdminGolfSettingsPage } from "../pages/admin-golf-settings-page";
import { AdminMembersPage } from "../pages/admin-members-page";
import { AdminGolfTeeSheetPage } from "../pages/admin-golf-tee-sheet-page";
import { AdminOrderQueuePage } from "../pages/admin-order-queue-page";
import { AdminPosTerminalPage } from "../pages/admin-pos-terminal-page";
import { LoginPage } from "../pages/login-page";
import { PlayerOrderPage } from "../pages/player-order-page";
import { PlayerShellPage } from "../pages/player-shell-page";
import { SelectClubPage } from "../pages/select-club-page";
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
      { path: "dashboard", element: <AdminDashboardPage /> },
      { path: "golf/tee-sheet", element: <AdminGolfTeeSheetPage /> },
      { path: "golf/settings", element: <AdminGolfSettingsPage /> },
      { path: "orders", element: <AdminOrderQueuePage /> },
      { path: "members", element: <AdminMembersPage /> },
      { path: "finance", element: <AdminFinancePage /> },
      { path: "communications", element: <AdminCommunicationsPage /> },
      { path: "halfway", element: <AdminHalfwayPage /> },
      { path: "pos-terminal", element: <AdminPosTerminalPage /> },
      { path: "*", element: <Navigate to="/admin/dashboard" replace /> },
    ],
  },
  {
    path: "/player",
    element: <ProtectedRoute shell="player" />,
    children: [
      { path: "home", element: <PlayerShellPage /> },
      { path: "order", element: <PlayerOrderPage /> },
      { path: "*", element: <Navigate to="/player/home" replace /> },
    ],
  },
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider future={{ v7_startTransition: true }} router={router} />;
}
