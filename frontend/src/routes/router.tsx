import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { ProtectedRoute } from "../components/protected-route";
import { AdminLayout } from "./admin-layout";
import { AdminCommunicationsPage } from "../pages/admin-communications-page";
import { AdminDashboardPage } from "../pages/admin-dashboard-page";
import { AdminFinanceDashboardPage } from "../pages/admin-finance-dashboard-page";
import { AdminHalfwayPage } from "../pages/admin-halfway-page";
import { AdminGolfDashboardPage } from "../pages/admin-golf-dashboard-page";
import { AdminSettingsHubPage } from "../pages/admin-settings-hub-page";
import { AdminSettingsModulesPage } from "../pages/admin-settings-modules-page";
import { AdminProShopPage } from "../pages/admin-pro-shop-page";
import { AdminPeopleDashboardPage } from "../pages/admin-people-dashboard-page";
import { AdminReportsPage } from "../pages/admin-reports-page";
import { AdminTargetsPage } from "../pages/admin-targets-page";
import { AdminFinancePage } from "../pages/admin-finance-page";
import { AdminGolfSettingsPage } from "../pages/admin-golf-settings-page";
import { AdminMembersPage } from "../pages/admin-members-page";
import { AdminGolfTeeSheetPage } from "../pages/admin-golf-tee-sheet-page";
import { AdminTeeSheetPage } from "../pages/admin-tee-sheet-page";
import { AdminOrderQueuePage } from "../pages/admin-order-queue-page";
import { AdminPosTerminalPage } from "../pages/admin-pos-terminal-page";
import { InvitationAcceptPage } from "../pages/invitation-accept-page";
import { LoginPage } from "../pages/login-page";
import { OnboardingCompletionPage } from "../pages/onboarding-completion-page";
import { OnboardingPopiaPage } from "../pages/onboarding-popia-page";
import { OnboardingWelcomePage } from "../pages/onboarding-welcome-page";
import { PlayerBookPage } from "../pages/player-book-page";
import { PlayerOrderPage } from "../pages/player-order-page";
import { PlayerProfilePage } from "../pages/player-profile-page";
import { PlayerShellPage } from "../pages/player-shell-page";
import { SelectClubPage } from "../pages/select-club-page";
import { SuperadminAccountingProfilesPage } from "../pages/superadmin-accounting-profiles-page";
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
  { path: "/accept-invitation", element: <InvitationAcceptPage /> },
  { path: "/admin/select-club", element: <Navigate to="/select-club" replace /> },
  {
    path: "/select-club",
    element: <ProtectedRoute />,
    children: [{ index: true, element: <SelectClubPage /> }],
  },
  {
    path: "/onboarding",
    element: <ProtectedRoute />,
    children: [
      { path: "welcome", element: <OnboardingWelcomePage /> },
      { path: "popia", element: <OnboardingPopiaPage /> },
      { path: "complete", element: <OnboardingCompletionPage /> },
      { path: "*", element: <Navigate to="/onboarding/welcome" replace /> },
    ],
  },
  {
    path: "/admin",
    element: <ProtectedRoute shell="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: "dashboard", element: <AdminDashboardPage /> },
          { path: "golf/dashboard", element: <AdminGolfDashboardPage /> },
          { path: "golf/tee-sheet", element: <AdminGolfTeeSheetPage /> },
          { path: "tee-sheet", element: <AdminTeeSheetPage /> },
          { path: "golf/settings", element: <AdminGolfSettingsPage /> },
          { path: "orders", element: <AdminOrderQueuePage /> },
          { path: "people/dashboard", element: <AdminPeopleDashboardPage /> },
          { path: "members", element: <AdminMembersPage /> },
          { path: "targets", element: <AdminTargetsPage /> },
          { path: "finance/dashboard", element: <AdminFinanceDashboardPage /> },
          { path: "finance", element: <AdminFinancePage /> },
          { path: "communications", element: <AdminCommunicationsPage /> },
          { path: "halfway", element: <AdminHalfwayPage /> },
          { path: "pro-shop", element: <AdminProShopPage /> },
          { path: "reports", element: <AdminReportsPage /> },
          { path: "pos-terminal", element: <AdminPosTerminalPage /> },
          { path: "settings", element: <AdminSettingsHubPage /> },
          { path: "settings/club", element: <Navigate to="/admin/settings" replace /> },
          { path: "settings/profile", element: <Navigate to="/admin/settings" replace /> },
          { path: "settings/modules", element: <AdminSettingsModulesPage /> },
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
          { path: "accounting-profiles", element: <SuperadminAccountingProfilesPage /> },
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
      { path: "profile", element: <PlayerProfilePage /> },
      { path: "*", element: <Navigate to="/player/home" replace /> },
    ],
  },
]);

export function AppRouter(): JSX.Element {
  return <RouterProvider future={{ v7_startTransition: true }} router={router} />;
}
