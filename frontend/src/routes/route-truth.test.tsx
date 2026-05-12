import type React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import { AdminLayout } from "./admin-layout";

// Phase 7: AdminLayout wraps the new admin-shell AdminShell (named export at
// ../components/admin-shell/AdminShell). Mock renders a probe testid carrying
// the resolved title + comma-joined breadcrumbs so the contract assertions can
// pin every admin route's chrome metadata.
vi.mock("../components/admin-shell/AdminShell", () => ({
  AdminShell: ({
    children,
    title,
    breadcrumbs,
  }: {
    children: React.ReactNode;
    title: React.ReactNode;
    breadcrumbs?: string[];
  }) => (
    <div>
      <div data-testid="admin-shell-title">{title as string}</div>
      <div data-testid="admin-shell-breadcrumbs">{(breadcrumbs ?? []).join(",")}</div>
      {children}
    </div>
  ),
}));

function renderAdminRoute(initialEntry: string): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<Outlet />}>
          <Route element={<AdminLayout />}>
            <Route path="dashboard" element={<div>Today page</div>} />
            <Route path="golf/dashboard" element={<div>Golf summary page</div>} />
            <Route path="golf/tee-sheet" element={<div>Tee sheet page</div>} />
            <Route path="golf/settings" element={<div>Golf settings page</div>} />
            <Route path="orders" element={<div>Orders page</div>} />
            <Route path="people/dashboard" element={<div>People summary page</div>} />
            <Route path="members" element={<div>Members page</div>} />
            <Route path="targets" element={<div>Targets page</div>} />
            <Route path="finance/dashboard" element={<div>Finance summary page</div>} />
            <Route path="finance" element={<div>Close day page</div>} />
            <Route path="communications" element={<div>Communications page</div>} />
            <Route path="halfway" element={<div>Halfway page</div>} />
            <Route path="pro-shop" element={<div>Pro shop page</div>} />
            <Route path="reports" element={<div>Performance page</div>} />
            <Route path="pos-terminal" element={<div>POS terminal page</div>} />
            <Route path="settings" element={<div>Settings hub page</div>} />
            <Route path="settings/club" element={<Navigate replace to="/admin/settings" />} />
            <Route path="settings/profile" element={<Navigate replace to="/admin/settings" />} />
            <Route path="settings/modules" element={<div>Settings modules page</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("admin route contract", () => {
  test.each([
    ["/admin/dashboard", "Dashboard", "", "Today page"],
    ["/admin/golf/dashboard", "Golf summary", "", "Golf summary page"],
    ["/admin/golf/tee-sheet", "Tee sheet", "", "Tee sheet page"],
    ["/admin/golf/settings", "Golf settings", "", "Golf settings page"],
    ["/admin/orders", "Order queue", "", "Orders page"],
    ["/admin/people/dashboard", "People summary", "", "People summary page"],
    ["/admin/members", "Members", "", "Members page"],
    ["/admin/targets", "Targets", "", "Targets page"],
    ["/admin/finance/dashboard", "Finance summary", "", "Finance summary page"],
    ["/admin/finance", "Daily close", "", "Close day page"],
    ["/admin/communications", "Communications", "", "Communications page"],
    ["/admin/halfway", "Halfway house", "", "Halfway page"],
    ["/admin/pro-shop", "Pro shop", "", "Pro shop page"],
    ["/admin/reports", "Reports", "", "Performance page"],
    ["/admin/pos-terminal", "POS terminal", "", "POS terminal page"],
    ["/admin/settings", "Club", "Settings", "Settings hub page"],
    ["/admin/settings/modules", "Modules", "Settings", "Settings modules page"],
  ])("admin layout metadata stays aligned for %s", async (path, title, breadcrumbs, pageCopy) => {
    renderAdminRoute(path);

    expect(await screen.findByTestId("admin-shell-title")).toHaveTextContent(title);
    expect(screen.getByTestId("admin-shell-breadcrumbs")).toHaveTextContent(breadcrumbs);
    expect(screen.getByText(pageCopy)).toBeInTheDocument();
  });

  test("/admin/settings/profile redirects to the settings hub", async () => {
    renderAdminRoute("/admin/settings/profile");

    expect(await screen.findByTestId("admin-shell-title")).toHaveTextContent("Club");
    expect(await screen.findByText("Settings hub page")).toBeInTheDocument();
  });

  test("/admin/settings/club redirects to the settings hub", async () => {
    renderAdminRoute("/admin/settings/club");

    expect(await screen.findByTestId("admin-shell-title")).toHaveTextContent("Club");
    expect(await screen.findByText("Settings hub page")).toBeInTheDocument();
  });
});
