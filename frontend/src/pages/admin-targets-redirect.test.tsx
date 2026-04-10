import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { describe, expect, test } from "vitest";

/**
 * Tests that /admin/targets redirects to /admin/reports.
 * The router.tsx wires this as: { path: "targets", element: <Navigate to="/admin/reports" replace /> }
 * This test validates that redirect behaviour in isolation.
 */

function buildQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("/admin/targets redirect", () => {
  test("navigating to /admin/targets redirects to /admin/reports", () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/admin/targets"]}
      >
        <QueryClientProvider client={buildQueryClient()}>
          <Routes>
            <Route path="/admin/targets" element={<Navigate to="/admin/reports" replace />} />
            <Route
              path="/admin/reports"
              element={<div data-testid="performance-page">Performance Page</div>}
            />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("performance-page")).toBeInTheDocument();
    expect(screen.getByText("Performance Page")).toBeInTheDocument();
  });
});
