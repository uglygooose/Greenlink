import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "../components/protected-route";
import { AdminShellPage } from "../pages/admin-shell-page";
import { LoginPage } from "../pages/login-page";
import { PlayerShellPage } from "../pages/player-shell-page";
import { SelectClubPage } from "../pages/select-club-page";
import { useSession } from "../session/session-context";

function RootRedirect(): JSX.Element {
  const { accessToken, bootstrap } = useSession();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (!bootstrap) {
    return <div className="centered-panel">Loading session…</div>;
  }
  return <Navigate to={bootstrap.landing_path} replace />;
}

const router = createBrowserRouter([
  { path: "/", element: <RootRedirect /> },
  { path: "/login", element: <LoginPage /> },
  {
    path: "/select-club",
    element: <ProtectedRoute />,
    children: [{ index: true, element: <SelectClubPage /> }]
  },
  {
    path: "/admin",
    element: <ProtectedRoute shell="admin" />,
    children: [
      { path: "select-club", element: <SelectClubPage /> },
      { path: "dashboard", element: <AdminShellPage /> },
      { path: "*", element: <Navigate to="/admin/dashboard" replace /> }
    ]
  },
  {
    path: "/player",
    element: <ProtectedRoute shell="player" />,
    children: [
      { path: "home", element: <PlayerShellPage /> },
      { path: "*", element: <Navigate to="/player/home" replace /> }
    ]
  }
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider router={router} />;
}
