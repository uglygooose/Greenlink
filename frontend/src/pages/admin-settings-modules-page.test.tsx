import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminSettingsModulesPage } from "./admin-settings-modules-page";

const mockUseSession = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/settings/modules"]}>
      <AdminSettingsModulesPage />
    </MemoryRouter>,
  );
}

describe("AdminSettingsModulesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      bootstrap: {
        module_flags: { golf: true, finance: true, communications: false, pos: false },
      },
    });
  });

  test("renders module enablement as read-only with related workspace links", () => {
    renderPage();

    expect(screen.getByRole("link", { name: /back to settings/i })).toHaveAttribute("href", "/admin/settings");
    expect(screen.getByText("Golf")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("Communications")).toBeInTheDocument();
    expect(screen.getByText("Commerce")).toBeInTheDocument();
    expect(screen.getAllByText(/read-only for club admin/i)).toHaveLength(4);
    expect(screen.getAllByText(/enabled/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/disabled/i).length).toBeGreaterThan(0);
  });
});
