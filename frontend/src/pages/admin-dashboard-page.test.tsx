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

const baseSummaryData = {
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
  unpaid_bookings_today: 0,
  no_show_risk_count: 0,
  close_day_ready: true,
};

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

// ---------------------------------------------------------------------------
// Legacy layout tests (no feature flag)
// ---------------------------------------------------------------------------

describe("AdminDashboardPage — legacy layout (ux_rebuild_v1 absent)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
        module_flags: { communications: true },
        feature_flags: {},
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
      data: baseSummaryData,
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
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Today layout tests (ux_rebuild_v1 = true)
// ---------------------------------------------------------------------------

describe("AdminDashboardPage — Today layout (ux_rebuild_v1 = true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
        module_flags: { communications: false },
        feature_flags: { ux_rebuild_v1: true },
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
      data: baseSummaryData,
      isLoading: false,
    });

    // These queries are not used by TodayLayout but must be mocked to avoid errors
    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseFinanceRevenueSummaryQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseHalfwaySummaryQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseReportsSummaryQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  test("renders Today layout with Work Queue section instead of legacy Decision Engine", () => {
    renderPage();
    expect(screen.getByText("What needs action")).toBeInTheDocument();
    expect(screen.queryByText("Problems and next steps")).not.toBeInTheDocument();
  });

  test("shows all-clear when no unpaid bookings and no no-show risk", () => {
    renderPage();
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    expect(screen.queryByText(/unpaid today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no-show risk/i)).not.toBeInTheDocument();
  });

  test("shows unpaid alert chip and work card when unpaid_bookings_today > 0", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: { ...baseSummaryData, unpaid_bookings_today: 3, close_day_ready: false },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText(/unpaid today/i)).toBeInTheDocument();
    expect(screen.getByText("Unpaid bookings")).toBeInTheDocument();
    expect(screen.getByText(/3 bookings today have outstanding payment/i)).toBeInTheDocument();
    // Alert chip links to tee sheet with filter
    const unpaidLinks = screen.getAllByRole("link", { name: /unpaid today/i });
    expect(unpaidLinks[0]).toHaveAttribute("href", "/admin/golf/tee-sheet?filter=unpaid");
  });

  test("shows no-show risk alert chip and work card when no_show_risk_count > 0", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: { ...baseSummaryData, no_show_risk_count: 2, close_day_ready: false },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByRole("link", { name: /no-show risk/i })).toBeInTheDocument();
    expect(screen.getByText("No-show risk")).toBeInTheDocument();
    expect(screen.getByText(/2 reserved bookings have passed their start time/i)).toBeInTheDocument();
    const noShowLinks = screen.getAllByRole("link", { name: /no-show risk/i });
    expect(noShowLinks[0]).toHaveAttribute("href", "/admin/golf/tee-sheet?filter=no-shows");
  });

  test("shows Close Day blocked chip when close_day_ready is false", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: { ...baseSummaryData, close_day_ready: false, unpaid_bookings_today: 1 },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText(/close day blocked/i)).toBeInTheDocument();
  });

  test("renders active targets section", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        ...baseSummaryData,
        active_targets: [
          {
            domain_key: "golf",
            domain_label: "Golf",
            metric_key: "rounds_booked",
            metric_label: "Rounds Booked",
            period_key: "month",
            period_start: "2026-04-01",
            period_end: "2026-04-30",
            target_value: 200,
            unit: "count",
          },
        ],
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Active targets")).toBeInTheDocument();
    expect(screen.getByText("Rounds Booked")).toBeInTheDocument();
  });

  test("renders tee occupancy in the sidebar panel", () => {
    renderPage();
    expect(screen.getByText("Today's occupancy")).toBeInTheDocument();
    expect(screen.getByText("11%")).toBeInTheDocument();
    expect(screen.getByText("8/72 slots")).toBeInTheDocument();
  });

  test("renders recent activity feed", () => {
    renderPage();
    expect(screen.getByText("Activity feed")).toBeInTheDocument();
    expect(screen.getByText("POS charge")).toBeInTheDocument();
  });

  test("shows loading skeletons when summary is loading", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
