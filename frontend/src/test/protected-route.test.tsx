import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
          <Route path="/select-club" element={<div>Select Club</div>} />
          <Route path="/admin" element={<ProtectedRoute shell="admin" />}>
            <Route index element={<div>Admin Shell</div>} />
          </Route>
          <Route path="/superadmin" element={<ProtectedRoute shell="superadmin" />}>
            <Route index element={<div>Superadmin Shell</div>} />
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
