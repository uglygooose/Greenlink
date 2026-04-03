import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminHalfwayPage } from "./admin-halfway-page";

const mockUseSession = vi.fn();
const mockUseFinanceJournalQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseFinanceTransactionVolumeSummaryQuery = vi.fn();
const mockUseOrdersQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceJournalQuery: () => mockUseFinanceJournalQuery(),
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
  useFinanceTransactionVolumeSummaryQuery: () => mockUseFinanceTransactionVolumeSummaryQuery(),
}));

vi.mock("../features/orders/hooks", () => ({
  useOrdersQuery: (args: { status: string | null }) => mockUseOrdersQuery(args),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/halfway"]}>
      <QueryClientProvider client={queryClient}>
        <AdminHalfwayPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminHalfwayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
      },
    });

    mockUseFinanceJournalQuery.mockReturnValue({
      data: {
        entries: [
          {
            id: "txn-1",
            club_id: "club-1",
            account_id: "account-1",
            amount: "-20.00",
            type: "charge",
            source: "pos",
            reference_id: null,
            description: "Coffee",
            created_at: new Date().toISOString(),
            account_customer_code: null,
          },
        ],
      },
      isLoading: false,
    });

    mockUseFinanceRevenueSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-02T10:00:00Z",
        day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_revenue: "100.00", operational_revenue: "321.00", charge_count: 6, by_source: [] },
        week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_revenue: "900.00", operational_revenue: "600.00", charge_count: 8, by_source: [] },
        month: { period: "month", date_from: "2026-04-01", date_to: "2026-04-30", total_revenue: "2500.00", operational_revenue: "1900.00", charge_count: 12, by_source: [] },
      },
      isLoading: false,
    });

    mockUseFinanceTransactionVolumeSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-02T10:00:00Z",
        day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_transaction_count: 14, by_type: [] },
        week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_transaction_count: 30, by_type: [] },
        month: { period: "month", date_from: "2026-04-01", date_to: "2026-04-30", total_transaction_count: 80, by_type: [] },
      },
      isLoading: false,
    });

    mockUseOrdersQuery.mockImplementation(({ status }: { status: string | null }) => {
      if (status === null) {
        return {
          data: [
            {
              id: "order-1",
              created_at: new Date().toISOString(),
              status: "placed",
              person: { full_name: "Avery Green" },
              item_summary: "2x Coffee",
            },
          ],
          isLoading: false,
        };
      }

      if (status === "placed") {
        return {
          data: [
            {
              id: "order-1",
              created_at: new Date().toISOString(),
              status: "placed",
              person: { full_name: "Avery Green" },
              item_summary: "2x Coffee",
            },
          ],
          isLoading: false,
        };
      }

      return {
        data: [],
        isLoading: false,
      };
    });
  });

  test("renders finance KPIs from summary endpoints and removes unsupported local finance visuals", () => {
    renderPage();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");

    expect(normalizedText).toContain("R32100backendsummary");
    expect(normalizedText).toContain("14backendsummary");
    expect(screen.queryByText("Avg Spend")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment Split")).not.toBeInTheDocument();
    expect(screen.queryByText(/Revenue .* Last 8 Hours/i)).not.toBeInTheDocument();
  });
});
