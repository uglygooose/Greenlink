import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
        <SuperadminSidebar />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe("SuperadminSidebar", () => {
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
  });
});
