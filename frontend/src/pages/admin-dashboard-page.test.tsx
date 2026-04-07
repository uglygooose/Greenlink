import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminDashboardPage } from "./admin-dashboard-page";

const mockUseSession = vi.fn();
const mockUseAdminDashboardSummaryQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseHalfwaySummaryQuery = vi.fn();
const mockUseReportsSummaryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/admin-dashboard/hooks", () => ({
  useAdminDashboardSummaryQuery: () => mockUseAdminDashboardSummaryQuery(),
}));

vi.mock("../features/admin-dashboard/halfway-hooks", () => ({
  useHalfwaySummaryQuery: () => mockUseHalfwaySummaryQuery(),
}));

vi.mock("../features/admin-dashboard/reports-hooks", () => ({
  useReportsSummaryQuery: () => mockUseReportsSummaryQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/dashboard"]}>
      <QueryClientProvider client={queryClient}>
        <AdminDashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
        module_flags: { communications: true },
        selected_club: {
          id: "club-1",
          name: "Club One",
          slug: "club-one",
          location: "Durban",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: "Club One" },
        },
      },
    });

    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        member_count: 42,
        tee_occupancy: {
          booked_slots: 8,
          total_slots: 72,
          occupancy_pct: 11,
        },
        tee_warnings: [],
        recent_activity: [
          {
            id: "txn-1",
            source: "pos",
            type: "charge",
            amount: "25.00",
            description: "POS charge",
            created_at: "2026-04-01T09:00:00Z",
          },
        ],
        active_targets: [],
      },
      isLoading: false,
    });

    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 9,
        accounts_in_arrears: 4,
        accounts_in_credit: 3,
        accounts_settled: 2,
        total_outstanding_amount: "999.00",
        unpaid_order_postings_count: 2,
        unpaid_order_postings_amount: "120.00",
        pending_items_count: 5,
      },
      isLoading: false,
    });

    mockUseFinanceRevenueSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-02T10:00:00Z",
        day: {
          period: "day",
          date_from: "2026-04-02",
          date_to: "2026-04-02",
          total_revenue: "500.00",
          operational_revenue: "321.00",
          charge_count: 6,
          by_source: [],
        },
        week: {
          period: "week",
          date_from: "2026-03-31",
          date_to: "2026-04-06",
          total_revenue: "800.00",
          operational_revenue: "400.00",
          charge_count: 9,
          by_source: [],
        },
        month: {
          period: "month",
          date_from: "2026-04-01",
          date_to: "2026-04-30",
          total_revenue: "900.00",
          operational_revenue: "500.00",
          charge_count: 10,
          by_source: [],
        },
      },
      isLoading: false,
    });

    mockUseHalfwaySummaryQuery.mockReturnValue({
      data: {
        orders_today_count: 5,
        active_queue_count: 2,
        queue_orders: [],
        recent_transactions: [],
      },
      isLoading: false,
    });

    mockUseReportsSummaryQuery.mockReturnValue({
      data: {
        member_breakdown: {
          total: 42,
          admin_count: 2,
          staff_count: 4,
          member_count: 36,
          admin_pct: 5,
          staff_pct: 10,
          member_pct: 85,
          no_account_count: 3,
          new_member_count: 2,
        },
        order_status_breakdown: { total: 0, collected_count: 0, by_status: [] },
        course_count: 2,
      },
      isLoading: false,
    });
  });

  test("renders finance KPI values from summary payloads instead of raw account or journal aggregation", () => {
    renderPage();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");

    expect(normalizedText).toContain("R99900");
    expect(screen.getByText("4 accounts")).toBeInTheDocument();
    expect(normalizedText).toContain("R32100");
    expect(screen.getByText(/postings are awaiting settlement/i)).toBeInTheDocument();
    expect(screen.queryByText("GL-001")).not.toBeInTheDocument();
  });

  test("turns live issues into action cards", () => {
    renderPage();
    expect(screen.getByText("Accounts in arrears")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review members/i })).toBeInTheDocument();
    expect(screen.getByText("Commerce queue pressure")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open order queue/i }).length).toBeGreaterThan(0);
  });

  test("renders member count and tee occupancy from backend summary", () => {
    renderPage();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText("8/72 slots")).toBeInTheDocument();
  });

  test("renders recent activity from backend summary", () => {
    renderPage();
    expect(screen.getByText("POS charge")).toBeInTheDocument();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");
    expect(normalizedText).toContain("R2500");
  });

  test("shows loading state while summary is loading", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseHalfwaySummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseReportsSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    // At least one loading skeleton should be present
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
