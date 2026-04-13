import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminPeopleDashboardPage } from "./admin-people-dashboard-page";

const mockUseSession = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseReportsSummaryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
}));

vi.mock("../features/admin-dashboard/reports-hooks", () => ({
  useReportsSummaryQuery: () => mockUseReportsSummaryQuery(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/people/dashboard"]}>
      <AdminPeopleDashboardPage />
    </MemoryRouter>,
  );
}

describe("AdminPeopleDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        module_flags: { communications: true },
      },
    });

    mockUseClubDirectoryQuery.mockReturnValue({
      data: [
        { id: "m1", display_name: "Alice" },
        { id: "m2", display_name: "Bob" },
        { id: "m3", display_name: "Carol" },
      ],
      isLoading: false,
    });

    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 8,
        accounts_in_arrears: 2,
        accounts_in_credit: 3,
        accounts_settled: 3,
        total_outstanding_amount: "420.00",
        accounts_in_arrears_pct: 25,
        accounts_in_credit_pct: 38,
        accounts_settled_pct: 38,
        unpaid_order_postings_count: 1,
        unpaid_order_postings_amount: "50.00",
        pending_items_count: 3,
      },
      isLoading: false,
    });

    mockUseReportsSummaryQuery.mockReturnValue({
      data: {
        member_breakdown: {
          total: 3,
          admin_count: 1,
          staff_count: 1,
          member_count: 1,
          admin_pct: 33,
          staff_pct: 33,
          member_pct: 34,
          no_account_count: 2,
          new_member_count: 1,
        },
        order_status_breakdown: { total: 0, collected_count: 0, by_status: [] },
        course_count: 1,
      },
      isLoading: false,
    });
  });

  test("renders directory count from backend directory query", () => {
    renderPage();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("people on record")).toBeInTheDocument();
  });

  test("renders finance account KPIs from backend outstanding summary", () => {
    renderPage();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("linked accounts")).toBeInTheDocument();
    expect(screen.getByText("2 accounts")).toBeInTheDocument();
  });

  test("renders no-account count from reports summary", () => {
    renderPage();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1 new members")).toBeInTheDocument();
  });

  test("renders member mix breakdown from reports summary", () => {
    renderPage();
    expect(screen.getByText(/Admin 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Staff 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Members 1/i)).toBeInTheDocument();
  });

  test("shows Communications action link when communications module is enabled", () => {
    renderPage();
    // Both the header action and the next-actions panel render a communications link
    expect(screen.getAllByRole("link", { name: /communications/i }).length).toBeGreaterThan(0);
  });

  test("hides Communications action link when communications module is disabled", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        module_flags: { communications: false },
      },
    });
    renderPage();
    expect(screen.queryByRole("link", { name: /communications/i })).not.toBeInTheDocument();
  });

  test("surfaces account gap message when members lack finance accounts", () => {
    renderPage();
    expect(screen.getByText(/2 people still need finance account coverage/i)).toBeInTheDocument();
  });

  test("shows clean coverage message when all members have finance accounts", () => {
    mockUseReportsSummaryQuery.mockReturnValue({
      data: {
        member_breakdown: {
          total: 3, admin_count: 1, staff_count: 1, member_count: 1,
          admin_pct: 33, staff_pct: 33, member_pct: 34,
          no_account_count: 0, new_member_count: 0,
        },
        order_status_breakdown: { total: 0, collected_count: 0, by_status: [] },
        course_count: 1,
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText(/all visible people are covered/i)).toBeInTheDocument();
  });

  test("shows loading placeholders while queries are pending", () => {
    mockUseClubDirectoryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseReportsSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    const placeholders = screen.getAllByText("--");
    expect(placeholders.length).toBeGreaterThan(0);
  });
});
