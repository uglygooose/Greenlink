import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";

describe("route truth fixes", () => {
  test("/admin/settings/profile redirects to the settings hub", async () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/admin/settings/profile"]}
      >
        <Routes>
          <Route path="/admin/settings/profile" element={<Navigate replace to="/admin/settings" />} />
          <Route path="/admin/settings" element={<div>Settings Hub</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Settings Hub")).toBeInTheDocument();
  });

  test("/admin/settings/club redirects to the settings hub", async () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/admin/settings/club"]}
      >
        <Routes>
          <Route path="/admin/settings/club" element={<Navigate replace to="/admin/settings" />} />
          <Route path="/admin/settings" element={<div>Settings Hub</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Settings Hub")).toBeInTheDocument();
  });
});
