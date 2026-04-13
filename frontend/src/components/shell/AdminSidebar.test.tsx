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

function renderSidebar(bootstrap: SessionBootstrap, initialEntry = "/admin/dashboard"): void {
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
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminSidebar />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe("AdminSidebar", () => {
  test("falls back to the static admin menu when backend menu items are absent", () => {
    renderSidebar(baseBootstrap);

    expect(screen.getByRole("link", { name: /today$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /people summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^People$/i }));
    expect(screen.getByRole("link", { name: /people summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /golf summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /tee sheet/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Golf$/i }));
    expect(screen.getByRole("link", { name: /golf summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /finance summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /close day/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Finance$/i }));
    expect(screen.getByRole("link", { name: /finance summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /performance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /communications/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^My Club$/i }));
    expect(screen.getByRole("link", { name: /performance/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /communications/i })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/admin/settings");
  });

  test("uses backend menu items to hide absent grouped sections during rollout", () => {
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

    expect(screen.getByRole("link", { name: /today$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^People$/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /people summary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /members/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^People$/i }));
    expect(screen.getByRole("link", { name: /people summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Golf$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Finance$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^My Club$/i })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /^Operations$/i }));
    expect(screen.getByRole("link", { name: /order queue/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pos terminal/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pro shop/i })).not.toBeInTheDocument();
  });

  test("fallback nav covers the visible admin IA", () => {
    renderSidebar(baseBootstrap);

    for (const label of ["Golf", "People", "Finance", "My Club", "Operations"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }));
    }

    expect(screen.getByRole("link", { name: /today$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /people summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /golf summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /finance summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /performance/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /communications/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /halfway/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pro shop/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pos terminal/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /order queue/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^targets$/i })).not.toBeInTheDocument();
  });

  test("keeps access-only routes out of the sidebar while surfacing golf and club views", () => {
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
          domain: "people",
          module_key: null,
        },
        {
          key: "golf_dashboard",
          label: "Golf Summary",
          path: "/admin/golf/dashboard",
          shell: "admin",
          domain: "golf",
          module_key: "golf",
        },
        {
          key: "golf_tee_sheet",
          label: "Tee Sheet",
          path: "/admin/golf/tee-sheet",
          shell: "admin",
          domain: "golf",
          module_key: "golf",
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
          key: "reports",
          label: "Performance",
          path: "/admin/reports",
          shell: "admin",
          domain: "performance",
          module_key: null,
        },
        {
          key: "communications",
          label: "Communications",
          path: "/admin/communications",
          shell: "admin",
          domain: "operations",
          module_key: "communications",
        },
        {
          key: "targets",
          label: "Targets",
          path: "/admin/targets",
          shell: "admin",
          domain: "performance",
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
    });

    fireEvent.click(screen.getByRole("button", { name: /^People$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Golf$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Finance$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^My Club$/i }));

    expect(screen.getByRole("link", { name: /people summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /golf summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /finance summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /close day/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /performance/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /communications/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^targets$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /golf settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^modules$/i })).not.toBeInTheDocument();
  });

  test("auto-expands the active grouped route", () => {
    renderSidebar(
      {
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
            key: "golf_dashboard",
            label: "Golf Summary",
            path: "/admin/golf/dashboard",
            shell: "admin",
            domain: "golf",
            module_key: "golf",
          },
          {
            key: "golf_tee_sheet",
            label: "Tee Sheet",
            path: "/admin/golf/tee-sheet",
            shell: "admin",
            domain: "golf",
            module_key: "golf",
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
            key: "reports",
            label: "Performance",
            path: "/admin/reports",
            shell: "admin",
            domain: "performance",
            module_key: null,
          },
          {
            key: "communications",
            label: "Communications",
            path: "/admin/communications",
            shell: "admin",
            domain: "operations",
            module_key: "communications",
          },
        ],
      },
      "/admin/golf/dashboard",
    );

    expect(screen.getByRole("button", { name: /^Golf$/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /golf summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tee sheet/i })).toBeInTheDocument();

    renderSidebar(
      {
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
            key: "reports",
            label: "Performance",
            path: "/admin/reports",
            shell: "admin",
            domain: "performance",
            module_key: null,
          },
          {
            key: "communications",
            label: "Communications",
            path: "/admin/communications",
            shell: "admin",
            domain: "operations",
            module_key: "communications",
          },
        ],
      },
      "/admin/communications",
    );

    const myClubButtons = screen.getAllByRole("button", { name: /^My Club$/i });
    expect(myClubButtons[myClubButtons.length - 1]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /communications/i })).toBeInTheDocument();
  });

  test("auto-expands the people group for direct people routes", () => {
    renderSidebar(
      {
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
            domain: "people",
            module_key: null,
          },
        ],
      },
      "/admin/people/dashboard",
    );

    expect(screen.getByRole("button", { name: /^People$/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /people summary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
  });
});
