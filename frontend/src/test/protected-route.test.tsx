import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "../components/protected-route";
import { SessionContext, type SessionContextValue } from "../session/session-context";
import type { SessionBootstrap } from "../types/session";

function renderWithSession(value: SessionContextValue, initialEntries: string[]): void {
  render(
    <SessionContext.Provider value={value}>
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={initialEntries}
      >
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/admin/select-club" element={<Navigate replace to="/select-club" />} />
          <Route path="/select-club" element={<ProtectedRoute />}>
            <Route index element={<div>Select Club</div>} />
          </Route>
          <Route path="/admin" element={<ProtectedRoute shell="admin" />}>
            <Route index element={<div>Admin Shell</div>} />
            <Route path="dashboard" element={<div>Admin Dashboard</div>} />
            <Route path="golf/settings" element={<div>Admin Golf Settings</div>} />
            <Route path="finance/dashboard" element={<div>Admin Finance Summary</div>} />
            <Route path="finance" element={<div>Admin Finance</div>} />
            <Route path="settings/modules" element={<div>Admin Settings Modules</div>} />
          </Route>
          <Route path="/superadmin" element={<ProtectedRoute shell="superadmin" />}>
            <Route index element={<div>Superadmin Shell</div>} />
            <Route path="accounting-profiles" element={<div>Accounting Profiles</div>} />
          </Route>
          <Route path="/player" element={<ProtectedRoute shell="player" />}>
            <Route index element={<div>Player Shell</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

const baseBootstrap: SessionBootstrap = {
  user: {
    id: "user-1",
    email: "test@example.com",
    display_name: "Test User",
    user_type: "user"
  },
  available_clubs: [],
  selected_club_id: "club-1",
  selected_club: {
    id: "club-1",
    name: "Club One",
    slug: "club-one",
    location: "Durban",
    timezone: "Africa/Johannesburg",
    branding: { logo_object_key: null, name: "Club One" }
  },
  club_selection_required: false,
  role_shell: "admin",
  default_workspace: "dashboard",
  landing_path: "/admin/dashboard",
  module_flags: {},
  permissions: ["club:read"],
  feature_flags: {}
};

const sessionValue: SessionContextValue = {
  accessToken: "token",
  bootstrap: baseBootstrap,
  loading: false,
  initialized: true,
  login: async () => {
    throw new Error("not implemented");
  },
  acceptInvitation: async () => {
    throw new Error("not implemented");
  },
  activateInvitation: async () => undefined,
  logout: async () => undefined,
  refresh: async () => {
    throw new Error("not implemented");
  },
  reloadBootstrap: async () => baseBootstrap,
  setSelectedClub: async () => undefined
};

test("redirects anonymous users to login", async () => {
  renderWithSession({ ...sessionValue, accessToken: null, bootstrap: null }, ["/admin"]);
  expect(await screen.findByText("Login")).toBeInTheDocument();
});

test("redirects to select-club when bootstrap requires club selection", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: { ...baseBootstrap, club_selection_required: true, role_shell: null, selected_club_id: null }
    },
    ["/admin"],
  );
  expect(await screen.findByText("Select Club")).toBeInTheDocument();
});

test("redirects legacy /admin/select-club to the canonical select-club route", async () => {
  renderWithSession(sessionValue, ["/admin/select-club"]);
  expect(await screen.findByText("Select Club")).toBeInTheDocument();
});

test("renders shell when session is aligned with the route", async () => {
  renderWithSession(sessionValue, ["/admin"]);
  expect(await screen.findByText("Admin Shell")).toBeInTheDocument();
});

test("renders superadmin shell when session is aligned with the superadmin route", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        user: { ...baseBootstrap.user, user_type: "superadmin" },
        role_shell: "superadmin",
        landing_path: "/superadmin/clubs",
        default_workspace: "clubs",
      },
    },
    ["/superadmin"],
  );
  expect(await screen.findByText("Superadmin Shell")).toBeInTheDocument();
});

test("allows superadmin routes that are present in backend menu truth", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        user: { ...baseBootstrap.user, user_type: "superadmin" },
        role_shell: "superadmin",
        landing_path: "/superadmin/clubs",
        default_workspace: "clubs",
        menu_items: [
          {
            key: "overview",
            label: "Overview",
            path: "/superadmin/overview",
            shell: "superadmin",
            domain: "overview",
            module_key: null,
          },
          {
            key: "clubs",
            label: "Clubs",
            path: "/superadmin/clubs",
            shell: "superadmin",
            domain: "clubs",
            module_key: null,
          },
          {
            key: "accounting_profiles",
            label: "Accounting Profiles",
            path: "/superadmin/accounting-profiles",
            shell: "superadmin",
            domain: "finance",
            module_key: null,
          },
        ],
      },
    },
    ["/superadmin/accounting-profiles"],
  );

  expect(await screen.findByText("Accounting Profiles")).toBeInTheDocument();
});

test("allows a superadmin with a selected club into admin routes", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        user: { ...baseBootstrap.user, user_type: "superadmin" },
        role_shell: "superadmin",
        landing_path: "/superadmin/clubs",
        default_workspace: "clubs",
      },
    },
    ["/admin"],
  );
  expect(await screen.findByText("Admin Shell")).toBeInTheDocument();
});

test("redirects blocked admin routes to the backend landing path when menu items exclude the domain", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        landing_path: "/admin/dashboard",
        menu_items: [
          {
            key: "dashboard",
            label: "Today",
            path: "/admin/dashboard",
            shell: "admin",
            domain: "dashboard",
            module_key: null,
          },
        ],
      },
    },
    ["/admin/finance"],
  );

  expect(await screen.findByText("Admin Dashboard")).toBeInTheDocument();
});

test("allows demoted admin routes when backend menu truth still carries them for access control", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        landing_path: "/admin/dashboard",
        menu_items: [
          {
            key: "dashboard",
            label: "Today",
            path: "/admin/dashboard",
            shell: "admin",
            domain: "overview",
            module_key: null,
          },
          {
            key: "finance_dashboard",
            label: "Finance Summary",
            path: "/admin/finance/dashboard",
            shell: "admin",
            domain: "finance",
            module_key: "finance",
          },
        ],
      },
    },
    ["/admin/finance/dashboard"],
  );

  expect(await screen.findByText("Admin Finance Summary")).toBeInTheDocument();
});

test("allows admin settings routes that are only reachable through the settings hub", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        menu_items: [
          {
            key: "settings_hub",
            label: "Settings",
            path: "/admin/settings",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
          {
            key: "golf_settings",
            label: "Golf Settings",
            path: "/admin/golf/settings",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
          {
            key: "settings_modules",
            label: "Modules",
            path: "/admin/settings/modules",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
        ],
      },
    },
    ["/admin/golf/settings"],
  );

  expect(await screen.findByText("Admin Golf Settings")).toBeInTheDocument();
});

test("allows the settings modules route when backend menu truth carries the access path", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        menu_items: [
          {
            key: "settings_hub",
            label: "Settings",
            path: "/admin/settings",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
          {
            key: "settings_modules",
            label: "Modules",
            path: "/admin/settings/modules",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
        ],
      },
    },
    ["/admin/settings/modules"],
  );

  expect(await screen.findByText("Admin Settings Modules")).toBeInTheDocument();
});

test("allows golf settings when settings hub is present but the secondary golf route is missing from loaded bootstrap", async () => {
  renderWithSession(
    {
      ...sessionValue,
      bootstrap: {
        ...baseBootstrap,
        menu_items: [
          {
            key: "settings_hub",
            label: "Settings",
            path: "/admin/settings",
            shell: "admin",
            domain: "settings",
            module_key: null,
          },
        ],
      },
    },
    ["/admin/golf/settings"],
  );

  expect(await screen.findByText("Admin Golf Settings")).toBeInTheDocument();
});
