import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminDashboardPage } from "./admin-dashboard-page";

const mockUseSession = vi.fn();
const mockUseFinanceAccountsQuery = vi.fn();
const mockUseFinanceJournalQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceAccountsQuery: () => mockUseFinanceAccountsQuery(),
  useFinanceJournalQuery: () => mockUseFinanceJournalQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
}));

vi.mock("../features/tee-sheet/hooks", () => ({
  useTeeSheetDayQuery: () => mockUseTeeSheetDayQuery(),
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

    mockUseFinanceAccountsQuery.mockReturnValue({
      data: [
        {
          id: "account-1",
          balance: "-25.00",
          account_customer: { account_code: "GL-001" },
        },
      ],
      isLoading: false,
    });
    mockUseFinanceJournalQuery.mockReturnValue({
      data: {
        entries: [
          {
            id: "txn-1",
            source: "manual",
            type: "charge",
            amount: "-25.00",
            description: "Manual charge",
            created_at: "2026-04-01T09:00:00Z",
          },
        ],
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
    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "North" }],
      isLoading: false,
    });
    mockUseClubDirectoryQuery.mockReturnValue({
      data: [{ id: "member-1" }, { id: "member-2" }],
      isLoading: false,
    });
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: {
        warnings: [],
        rows: [
          {
            slots: [
              { bookings: [{ status: "reserved" }], local_time: "08:00:00" },
              { bookings: [], local_time: "08:10:00" },
            ],
          },
        ],
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
  });
});
