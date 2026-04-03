import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { ProtectedRoute } from "../components/protected-route";
import { AdminLayout } from "../routes/admin-layout";
import { SuperadminLayout } from "../routes/superadmin-layout";
import { SessionContext, type SessionContextValue } from "../session/session-context";
import type { SessionBootstrap } from "../types/session";

let adminShellMounts = 0;
let adminShellUnmounts = 0;
let superadminShellMounts = 0;
let superadminShellUnmounts = 0;

vi.mock("../components/shell/AdminShell", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: React.ReactNode }) => {
    React.useEffect(() => {
      adminShellMounts += 1;
      return () => {
        adminShellUnmounts += 1;
      };
    }, []);

    return (
      <div data-testid="admin-shell">
        <div>{title}</div>
        {children}
      </div>
    );
  },
}));

vi.mock("../components/shell/SuperadminShell", () => ({
  default: ({ children, title }: { children: React.ReactNode; title: React.ReactNode }) => {
    React.useEffect(() => {
      superadminShellMounts += 1;
      return () => {
        superadminShellUnmounts += 1;
      };
    }, []);

    return (
      <div data-testid="superadmin-shell">
        <div>{title}</div>
        {children}
      </div>
    );
  },
}));

function AdminDashboardStub(): JSX.Element {
  return (
    <div>
      <div>Dashboard Content</div>
      <Link to="/admin/members">Go Members</Link>
    </div>
  );
}

function AdminMembersStub(): JSX.Element {
  return (
    <div>
      <div>Members Content</div>
      <Link to="/admin/dashboard">Go Dashboard</Link>
    </div>
  );
}

function SuperadminClubsStub(): JSX.Element {
  return (
    <div>
      <div>Clubs Content</div>
      <Link to="/superadmin/review">Go Review</Link>
    </div>
  );
}

function SuperadminReviewStub(): JSX.Element {
  return (
    <div>
      <div>Review Content</div>
      <Link to="/superadmin/clubs">Go Clubs</Link>
    </div>
  );
}

const baseBootstrap: SessionBootstrap = {
  user: {
    id: "user-1",
    email: "test@example.com",
    display_name: "Test User",
    user_type: "user",
  },
  available_clubs: [],
  selected_club_id: "club-1",
  selected_club: {
    id: "club-1",
    name: "Club One",
    slug: "club-one",
    location: "Durban",
    timezone: "Africa/Johannesburg",
    branding: { logo_object_key: null, name: "Club One" },
  },
  club_selection_required: false,
  role_shell: "admin",
  default_workspace: "dashboard",
  landing_path: "/admin/dashboard",
  module_flags: {},
  permissions: ["club:read"],
  feature_flags: {},
};

function renderWithSession(value: SessionContextValue, initialEntries: string[]): void {
  render(
    <SessionContext.Provider value={value}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<div>Login</div>} />
          <Route path="/select-club" element={<div>Select Club</div>} />
          <Route path="/admin" element={<ProtectedRoute shell="admin" />}>
            <Route element={<AdminLayout />}>
              <Route path="dashboard" element={<AdminDashboardStub />} />
              <Route path="members" element={<AdminMembersStub />} />
            </Route>
          </Route>
          <Route path="/superadmin" element={<ProtectedRoute shell="superadmin" />}>
            <Route element={<SuperadminLayout />}>
              <Route path="clubs" element={<SuperadminClubsStub />} />
              <Route path="review" element={<SuperadminReviewStub />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  adminShellMounts = 0;
  adminShellUnmounts = 0;
  superadminShellMounts = 0;
  superadminShellUnmounts = 0;
});

test("keeps the admin shell mounted while navigating between admin routes", async () => {
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
    setSelectedClub: async () => undefined,
  };

  renderWithSession(sessionValue, ["/admin/dashboard"]);

  expect(await screen.findByText("Dashboard Content")).toBeInTheDocument();
  expect(adminShellMounts).toBe(1);
  expect(adminShellUnmounts).toBe(0);

  fireEvent.click(screen.getByRole("link", { name: "Go Members" }));

  expect(await screen.findByText("Members Content")).toBeInTheDocument();
  expect(adminShellMounts).toBe(1);
  expect(adminShellUnmounts).toBe(0);
  expect(screen.getByTestId("admin-shell")).toBeInTheDocument();
});

test("keeps the superadmin shell mounted while navigating between superadmin routes", async () => {
  const superadminBootstrap: SessionBootstrap = {
    ...baseBootstrap,
    user: { ...baseBootstrap.user, user_type: "superadmin" },
    role_shell: "superadmin",
    landing_path: "/superadmin/clubs",
    default_workspace: "clubs",
  };

  const sessionValue: SessionContextValue = {
    accessToken: "token",
    bootstrap: superadminBootstrap,
    loading: false,
    initialized: true,
    login: async () => {
      throw new Error("not implemented");
    },
    logout: async () => undefined,
    refresh: async () => {
      throw new Error("not implemented");
    },
    reloadBootstrap: async () => superadminBootstrap,
    setSelectedClub: async () => undefined,
  };

  renderWithSession(sessionValue, ["/superadmin/clubs"]);

  expect(await screen.findByText("Clubs Content")).toBeInTheDocument();
  expect(superadminShellMounts).toBe(1);
  expect(superadminShellUnmounts).toBe(0);

  fireEvent.click(screen.getByRole("link", { name: "Go Review" }));

  expect(await screen.findByText("Review Content")).toBeInTheDocument();
  expect(superadminShellMounts).toBe(1);
  expect(superadminShellUnmounts).toBe(0);
  expect(screen.getByTestId("superadmin-shell")).toBeInTheDocument();
});
