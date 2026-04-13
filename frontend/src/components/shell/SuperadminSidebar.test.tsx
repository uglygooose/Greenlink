import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";

import { SessionContext, type SessionContextValue } from "../../session/session-context";
import type { SessionBootstrap } from "../../types/session";
import SuperadminSidebar from "./SuperadminSidebar";

const baseBootstrap: SessionBootstrap = {
  user: {
    id: "user-1",
    email: "root@example.com",
    display_name: "Root Admin",
    user_type: "superadmin",
  },
  available_clubs: [],
  selected_club_id: null,
  selected_club: null,
  club_selection_required: false,
  role_shell: "superadmin",
  default_workspace: "clubs",
  landing_path: "/superadmin/clubs",
  module_flags: {},
  permissions: [],
  feature_flags: {},
};

function renderSidebar(bootstrap: SessionBootstrap): void {
  renderSidebarApp(bootstrap);
}

function renderSidebarApp(bootstrap: SessionBootstrap, initialEntries: string[] = ["/superadmin/clubs"]): void {
  const sessionValue: SessionContextValue = {
    accessToken: "token",
    bootstrap,
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
    reloadBootstrap: async () => bootstrap,
    setSelectedClub: async () => undefined,
  };

  render(
    <SessionContext.Provider value={sessionValue}>
      <MemoryRouter initialEntries={initialEntries}>
        <SuperadminSidebar />
        <Routes>
          <Route path="/superadmin/overview" element={<div>Overview Page</div>} />
          <Route path="/superadmin/clubs" element={<div>Clubs Page</div>} />
          <Route path="/superadmin/accounting-profiles" element={<div>Accounting Profiles Page</div>} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe("SuperadminSidebar", () => {
  test("renders all live superadmin routes from backend menu truth", () => {
    renderSidebar({
      ...baseBootstrap,
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
    });

    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("href", "/superadmin/overview");
    expect(screen.getByRole("link", { name: /clubs/i })).toHaveAttribute("href", "/superadmin/clubs");
    expect(screen.getByRole("link", { name: /accounting profiles/i })).toHaveAttribute(
      "href",
      "/superadmin/accounting-profiles",
    );
  });

  test("filters superadmin navigation from backend menu items when present", () => {
    renderSidebar({
      ...baseBootstrap,
      menu_items: [
        {
          key: "clubs",
          label: "Clubs",
          path: "/superadmin/clubs",
          shell: "superadmin",
          domain: "clubs",
          module_key: null,
        },
      ],
    });

    expect(screen.getByRole("link", { name: /clubs/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /overview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /accounting profiles/i })).not.toBeInTheDocument();
  });

  test("navigates to accounting profiles from the sidebar", async () => {
    renderSidebarApp(
      {
        ...baseBootstrap,
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
      ["/superadmin/clubs"],
    );

    expect(screen.getByText("Clubs Page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /accounting profiles/i }));

    expect(await screen.findByText("Accounting Profiles Page")).toBeInTheDocument();
  });
});
