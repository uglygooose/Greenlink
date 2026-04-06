import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { InvitationAcceptPage } from "./invitation-accept-page";

const mockUseSession = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

function renderPage(initialEntry = "/accept-invitation?token=invite-token"): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/accept-invitation" element={<InvitationAcceptPage />} />
        <Route path="/" element={<div>Landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InvitationAcceptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      acceptInvitation: vi.fn().mockResolvedValue({ access_token: "token" }),
      activateInvitation: vi.fn().mockResolvedValue(undefined),
      accessToken: null,
      bootstrap: null,
    });
  });

  test("prefills the invitation token from the query string", () => {
    renderPage("/accept-invitation?token=query-token");

    expect(screen.getByDisplayValue("query-token")).toBeInTheDocument();
  });

  test("submits the backend invitation acceptance contract and redirects", async () => {
    const acceptInvitation = vi.fn().mockResolvedValue({ access_token: "token" });
    mockUseSession.mockReturnValue({
      acceptInvitation,
      activateInvitation: vi.fn().mockResolvedValue(undefined),
      accessToken: null,
      bootstrap: null,
    });

    renderPage();
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Jamie Staff" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith("invite-token", "password123", "Jamie Staff");
      expect(screen.getByText("Landing")).toBeInTheDocument();
    });
  });

  test("activates access for an authenticated user without requiring account creation fields", async () => {
    const activateInvitation = vi.fn().mockResolvedValue(undefined);
    mockUseSession.mockReturnValue({
      acceptInvitation: vi.fn().mockResolvedValue({ access_token: "token" }),
      activateInvitation,
      accessToken: "token",
      bootstrap: {
        landing_path: "/player/home",
      },
    });

    renderPage();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /activate access/i }));

    await waitFor(() => {
      expect(activateInvitation).toHaveBeenCalledWith("invite-token");
      expect(screen.getByText("Landing")).toBeInTheDocument();
    });
  });
});
