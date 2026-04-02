import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminReportsPage } from "./admin-reports-page";

const mockUseSession = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceTransactionVolumeSummaryQuery = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockUseOrdersQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceTransactionVolumeSummaryQuery: () => mockUseFinanceTransactionVolumeSummaryQuery(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
}));

vi.mock("../features/orders/hooks", () => ({
  useOrdersQuery: () => mockUseOrdersQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/reports"]}>
      <QueryClientProvider client={queryClient}>
        <AdminReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
      },
    });

    mockUseFinanceRevenueSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-02T10:00:00Z",
        day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_revenue: "100.00", operational_revenue: "80.00", charge_count: 1, by_source: [] },
        week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_revenue: "900.00", operational_revenue: "600.00", charge_count: 8, by_source: [] },
        month: {
          period: "month",
          date_from: "2026-04-01",
          date_to: "2026-04-30",
          total_revenue: "2500.00",
          operational_revenue: "1900.00",
          charge_count: 12,
          by_source: [
            { source: "pos", total_revenue: "1700.00", charge_count: 7 },
            { source: "order", total_revenue: "800.00", charge_count: 5 },
          ],
        },
      },
      isLoading: false,
    });

    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 8,
        accounts_in_arrears: 2,
        accounts_in_credit: 3,
        accounts_settled: 3,
        total_outstanding_amount: "410.00",
        unpaid_order_postings_count: 2,
        unpaid_order_postings_amount: "150.00",
        pending_items_count: 4,
      },
      isLoading: false,
    });

    mockUseFinanceTransactionVolumeSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-02T10:00:00Z",
        day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_transaction_count: 2, by_type: [] },
        week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_transaction_count: 6, by_type: [] },
        month: {
          period: "month",
          date_from: "2026-04-01",
          date_to: "2026-04-30",
          total_transaction_count: 15,
          by_type: [
            { type: "charge", transaction_count: 12, total_absolute_amount: "2500.00" },
            { type: "payment", transaction_count: 3, total_absolute_amount: "900.00" },
          ],
        },
      },
      isLoading: false,
    });

    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "North" }],
      isLoading: false,
    });
    mockUseClubDirectoryQuery.mockReturnValue({
      data: [
        { membership: { role: "MEMBER" } },
        { membership: { role: "CLUB_STAFF" } },
        { membership: { role: "CLUB_ADMIN" } },
      ],
      isLoading: false,
    });
    mockUseOrdersQuery.mockReturnValue({
      data: [
        { status: "placed" },
        { status: "collected" },
      ],
      isLoading: false,
    });
  });

  test("renders report finance sections from summary payloads instead of raw journal or account math", () => {
    renderPage();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");

    expect(normalizedText).toContain("R250000");
    expect(screen.getByText("12 charges")).toBeInTheDocument();
    expect(screen.getByText("POS")).toBeInTheDocument();
    expect(normalizedText).toContain("R170000");
    expect(screen.getByText("Finance Accounts")).toBeInTheDocument();
    expect(screen.getByText("2 in arrears")).toBeInTheDocument();
  });
});
