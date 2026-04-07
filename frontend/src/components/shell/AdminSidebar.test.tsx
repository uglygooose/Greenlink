import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";

import { SessionContext, type SessionContextValue } from "../../session/session-context";
import type { SessionBootstrap } from "../../types/session";
import AdminSidebar from "./AdminSidebar";

const baseBootstrap: SessionBootstrap = {
  user: {
    id: "user-1",
    email: "admin@example.com",
    display_name: "Admin User",
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
  module_flags: { golf: true, finance: true, pos: true, communications: true },
  permissions: [],
  feature_flags: {},
};

function renderSidebar(bootstrap: SessionBootstrap): void {
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
      <MemoryRouter>
        <AdminSidebar />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe("AdminSidebar", () => {
  test("falls back to the static admin menu when backend menu items are absent", () => {
    renderSidebar(baseBootstrap);

    // Unlabeled items (Overview, Communications, Club Settings) always visible
    expect(screen.getByRole("link", { name: /Overview$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /club settings/i })).toBeInTheDocument();

    // Labeled groups start collapsed — expand Golf to find its links
    expect(screen.queryByRole("link", { name: /tee sheet/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Golf$/i }));
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();

    // Expand Finance to find Close Day
    expect(screen.queryByRole("link", { name: /close day/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Finance$/i }));
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();
  });

  test("uses backend menu items to hide disabled admin domains during rollout", () => {
    renderSidebar({
      ...baseBootstrap,
      menu_items: [
        {
          key: "dashboard",
          label: "Overview",
          path: "/admin/dashboard",
          shell: "admin",
          domain: "overview",
          module_key: null,
        },
        {
          key: "people_dashboard",
          label: "Dashboard",
          path: "/admin/people/dashboard",
          shell: "admin",
          domain: "people",
          module_key: null,
        },
        {
          key: "members",
          label: "Members",
          path: "/admin/members",
          shell: "admin",
          domain: "members",
          module_key: null,
        },
      ],
    });

    expect(screen.getByRole("link", { name: /Overview$/i })).toBeInTheDocument();

    // People group exists — expand it to see its links
    fireEvent.click(screen.getByRole("button", { name: /^People$/i }));
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Dashboard$/i })).toHaveLength(1);

    // Golf and Finance groups should not appear at all
    expect(screen.queryByRole("button", { name: /^Golf$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tee sheet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /close day/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /club settings/i })).not.toBeInTheDocument();
  });

  test("renders backend-defined admin domains that were not present in the old static menu", () => {
    renderSidebar({
      ...baseBootstrap,
      menu_items: [
        {
          key: "dashboard",
          label: "Overview",
          path: "/admin/dashboard",
          shell: "admin",
          domain: "overview",
          module_key: null,
        },
        {
          key: "orders",
          label: "Order Queue",
          path: "/admin/orders",
          shell: "admin",
          domain: "operations",
          module_key: "pos",
        },
        {
          key: "pos_terminal",
          label: "POS Terminal",
          path: "/admin/pos-terminal",
          shell: "admin",
          domain: "operations",
          module_key: "pos",
        },
      ],
    });

    // Operations group contains these items — expand it
    fireEvent.click(screen.getByRole("button", { name: /^Operations$/i }));
    expect(screen.getByRole("link", { name: /order queue/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pos terminal/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pro shop/i })).not.toBeInTheDocument();
  });
});
