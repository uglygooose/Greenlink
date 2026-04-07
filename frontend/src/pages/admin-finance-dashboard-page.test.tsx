import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminFinanceDashboardPage } from "./admin-finance-dashboard-page";

const mockUseSession = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceTransactionVolumeSummaryQuery = vi.fn();
const mockUseFinanceExportBatchesQuery = vi.fn();
const mockUseAdminDashboardSummaryQuery = vi.fn();
const mockUseHalfwaySummaryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceTransactionVolumeSummaryQuery: () => mockUseFinanceTransactionVolumeSummaryQuery(),
  useFinanceExportBatchesQuery: () => mockUseFinanceExportBatchesQuery(),
}));

vi.mock("../features/admin-dashboard/hooks", () => ({
  useAdminDashboardSummaryQuery: () => mockUseAdminDashboardSummaryQuery(),
}));

vi.mock("../features/admin-dashboard/halfway-hooks", () => ({
  useHalfwaySummaryQuery: () => mockUseHalfwaySummaryQuery(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/finance/dashboard"]}>
      <AdminFinanceDashboardPage />
    </MemoryRouter>,
  );
}

describe("AdminFinanceDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        module_flags: { finance: true },
      },
    });

    mockUseFinanceRevenueSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-07T10:00:00Z",
        day: { period: "day", date_from: "2026-04-07", date_to: "2026-04-07", total_revenue: "500.00", operational_revenue: "321.00", charge_count: 6, by_source: [] },
        week: { period: "week", date_from: "2026-04-01", date_to: "2026-04-07", total_revenue: "2000.00", operational_revenue: "1800.00", charge_count: 25, by_source: [] },
        month: { period: "month", date_from: "2026-04-01", date_to: "2026-04-30", total_revenue: "8000.00", operational_revenue: "7200.00", charge_count: 90, by_source: [] },
      },
      isLoading: false,
    });

    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 10,
        accounts_in_arrears: 3,
        accounts_in_credit: 4,
        accounts_settled: 3,
        total_outstanding_amount: "1250.00",
        accounts_in_arrears_pct: 30,
        accounts_in_credit_pct: 40,
        accounts_settled_pct: 30,
        unpaid_order_postings_count: 0,
        unpaid_order_postings_amount: "0.00",
        pending_items_count: 2,
      },
      isLoading: false,
    });

    mockUseFinanceTransactionVolumeSummaryQuery.mockReturnValue({
      data: {
        day: { period: "day", total_transaction_count: 14, by_source: [] },
        month: { period: "month", total_transaction_count: 210, by_source: [] },
      },
      isLoading: false,
    });

    mockUseFinanceExportBatchesQuery.mockReturnValue({
      data: {
        batches: [
          {
            id: "batch-1",
            club_id: "club-1",
            date_from: "2026-04-01",
            date_to: "2026-04-07",
            status: "generated",
            transaction_count: 45,
            created_at: "2026-04-07T08:00:00Z",
            updated_at: "2026-04-07T08:00:00Z",
          },
        ],
        total_count: 1,
      },
      isLoading: false,
    });

    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        member_count: 40,
        tee_occupancy: { booked_slots: 5, total_slots: 72, occupancy_pct: 7 },
        tee_warnings: [],
        recent_activity: [],
        active_targets: [],
      },
      isLoading: false,
    });

    mockUseHalfwaySummaryQuery.mockReturnValue({
      data: { orders_today_count: 3, active_queue_count: 0, queue_orders: [], recent_transactions: [] },
      isLoading: false,
    });
  });

  test("renders revenue KPIs from backend summary without client-side math", () => {
    renderPage();
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("R321,00");
    expect(bodyText).toContain("R8");
    expect(screen.getByText("6 charges")).toBeInTheDocument();
  });

  test("renders outstanding and batch KPIs", () => {
    renderPage();
    // "3 accounts" sub-label on the outstanding KPI card
    expect(screen.getByText("3 accounts")).toBeInTheDocument();
    // batch status appears in KPI card and close-day step card
    expect(screen.getAllByText("generated").length).toBeGreaterThan(0);
    // outstanding amount present somewhere in the page
    expect((document.body.textContent ?? "")).toContain("R1");
  });

  test("shows clear status on golf closure step when no tee warnings", () => {
    renderPage();
    const badges = screen.getAllByText("clear");
    expect(badges.length).toBeGreaterThan(0);
  });

  test("shows attention status on golf closure step when tee warnings are present", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        member_count: 40,
        tee_occupancy: { booked_slots: 0, total_slots: 0, occupancy_pct: null },
        tee_warnings: [{ code: "tee_sheet_closed_today", message: "Tee sheet is closed today." }],
        recent_activity: [],
        active_targets: [],
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("attention")).toBeInTheDocument();
  });

  test("renders close-day workflow steps", () => {
    renderPage();
    expect(screen.getByText(/1\. Golf closure/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Commerce settlement check/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Finance posting and export/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Final summary snapshot/i)).toBeInTheDocument();
  });

  test("shows loading placeholders while queries are pending", () => {
    mockUseFinanceRevenueSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseFinanceExportBatchesQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    const placeholders = screen.getAllByText("--");
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
