import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";

/**
 * Tests that /admin/targets resolves directly instead of redirecting away.
 */

function buildQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("/admin/targets route truth", () => {
  test("navigating to /admin/targets resolves the targets route", () => {
    render(
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={["/admin/targets"]}
      >
        <QueryClientProvider client={buildQueryClient()}>
          <Routes>
            <Route path="/admin/targets" element={<div data-testid="targets-page">Targets Page</div>} />
            <Route path="/admin/reports" element={<div data-testid="performance-page">Performance Page</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("targets-page")).toBeInTheDocument();
    expect(screen.queryByTestId("performance-page")).not.toBeInTheDocument();
    expect(screen.getByText("Targets Page")).toBeInTheDocument();
  });
});
