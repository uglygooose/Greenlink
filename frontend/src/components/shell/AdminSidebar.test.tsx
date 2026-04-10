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
  feature_flags: { ux_rebuild_v1: true },
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

    // Core items are always visible (unlabeled group)
    expect(screen.getByRole("link", { name: /Today$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();

    // Finance group starts collapsed — expand to find Close Day
    expect(screen.queryByRole("link", { name: /close day/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Finance$/i }));
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();

    // Settings hub is visible directly (unlabeled settings group)
    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/admin/settings");
  });

  test("uses backend menu items to hide disabled admin domains during rollout", () => {
    renderSidebar({
      ...baseBootstrap,
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
          key: "people_dashboard",
          label: "People Summary",
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

    // dashboard and members land in the core group — visible directly
    expect(screen.getByRole("link", { name: /Today$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();

    // people_dashboard has no primary group — falls to ungrouped, visible directly
    expect(screen.queryByRole("link", { name: /^Dashboard$/i })).not.toBeInTheDocument();

    // No People group button in the new lifecycle-weighted nav
    expect(screen.queryByRole("button", { name: /^People$/i })).not.toBeInTheDocument();

    // Golf and Finance groups should not appear at all
    expect(screen.queryByRole("button", { name: /^Golf$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tee sheet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /close day/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  test("renders backend-defined admin domains that were not present in the old static menu", () => {
    renderSidebar({
      ...baseBootstrap,
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

  test("fallback nav covers all known backend MENU_ITEMS admin keys — none silently omitted", () => {
    // Renders without menu_items to exercise FALLBACK_NAV_ITEMS.
    // Only labeled groups need expanding; ungrouped and unlabeled groups render directly.
    renderSidebar(baseBootstrap);

    // Expand all labeled groups
    for (const label of ["Finance", "Operations"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }));
    }

    // Core — always visible (unlabeled group)
    expect(screen.getByRole("link", { name: /today$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();

    // Finance
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();

    // Performance — visible directly (unlabeled group)
    expect(screen.getByRole("link", { name: /performance/i })).toBeInTheDocument();

    // Operations
    expect(screen.getByRole("link", { name: /halfway/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pro shop/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pos terminal/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /order queue/i })).toBeInTheDocument();

    // Settings hub — visible directly (unlabeled settings group)
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    // Targets nav item filtered — accessible via Settings hub, not surfaced in sidebar
    expect(screen.queryByRole("link", { name: /^targets$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^dashboard$/i })).not.toBeInTheDocument();
  });

  test("keeps access-only admin routes out of the sidebar even when backend menu truth includes them", () => {
    renderSidebar({
      ...baseBootstrap,
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
        {
          key: "finance",
          label: "Close Day",
          path: "/admin/finance",
          shell: "admin",
          domain: "finance",
          module_key: "finance",
        },
        {
          key: "targets",
          label: "Targets",
          path: "/admin/targets",
          shell: "admin",
          domain: "performance",
          module_key: null,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /^Finance$/i }));

    expect(screen.getByRole("link", { name: /today/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /finance summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^targets$/i })).not.toBeInTheDocument();
  });
});
