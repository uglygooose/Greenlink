import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSession } from "../session/session-context";

interface Props {
  shell?: "admin" | "player" | "superadmin";
}

export function ProtectedRoute({ shell }: Props): JSX.Element {
  const location = useLocation();
  const { accessToken, bootstrap, initialized, loading } = useSession();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!initialized || loading || !bootstrap) {
    return <div className="centered-panel">Loading session…</div>;
  }

  if (bootstrap.club_selection_required && location.pathname !== "/select-club") {
    return <Navigate to="/select-club" replace />;
  }

  if (bootstrap.role_shell === null && !bootstrap.club_selection_required) {
    return <div className="centered-panel">No active club access is available for this account.</div>;
  }

  if (shell && bootstrap.role_shell && shell !== bootstrap.role_shell) {
    return <Navigate to={bootstrap.landing_path} replace />;
  }

  return <Outlet />;
}
