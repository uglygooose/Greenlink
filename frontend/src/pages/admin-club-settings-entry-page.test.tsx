import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminClubSettingsEntryPage } from "./admin-club-settings-entry-page";

const mockUseSession = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("./admin-club-settings-page", () => ({
  AdminClubSettingsPage: () => <div>Club Settings Legacy Page</div>,
}));

function renderRoute(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/settings/club"]}>
      <Routes>
        <Route path="/admin/settings/club" element={<AdminClubSettingsEntryPage />} />
        <Route path="/admin/settings" element={<div>Settings Hub</div>} />
        <Route path="/admin/settings/profile" element={<div>Club Profile Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminClubSettingsEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects the old settings entry path to the hub when the rebuild flag is enabled", async () => {
    mockUseSession.mockReturnValue({
      bootstrap: {
        feature_flags: { ux_rebuild_v1: true },
      },
    });

    renderRoute();

    expect(await screen.findByText("Settings Hub")).toBeInTheDocument();
  });

  test("keeps the legacy club settings surface available when the rebuild flag is disabled", async () => {
    mockUseSession.mockReturnValue({
      bootstrap: {
        feature_flags: {},
      },
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/settings/club"]}>
        <AdminClubSettingsEntryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Club Settings Legacy Page")).toBeInTheDocument();
  });
});
