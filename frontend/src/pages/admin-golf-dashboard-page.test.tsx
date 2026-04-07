import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminGolfDashboardPage } from "./admin-golf-dashboard-page";

const mockUseSession = vi.fn();
const mockUseAdminDashboardSummaryQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/admin-dashboard/hooks", () => ({
  useAdminDashboardSummaryQuery: () => mockUseAdminDashboardSummaryQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
  useTeesQuery: () => mockUseTeesQuery(),
  useRuleSetsQuery: () => mockUseRuleSetsQuery(),
  usePricingMatricesQuery: () => mockUsePricingMatricesQuery(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/golf/dashboard"]}>
      <AdminGolfDashboardPage />
    </MemoryRouter>,
  );
}

describe("AdminGolfDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        module_flags: { golf: true },
      },
    });

    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        member_count: 40,
        tee_occupancy: { booked_slots: 12, total_slots: 72, occupancy_pct: 17 },
        tee_warnings: [],
        recent_activity: [],
        active_targets: [],
      },
      isLoading: false,
    });

    mockUseFinanceRevenueSummaryQuery.mockReturnValue({
      data: {
        timezone: "Africa/Johannesburg",
        reference_datetime: "2026-04-07T10:00:00Z",
        day: { period: "day", date_from: "2026-04-07", date_to: "2026-04-07", total_revenue: "1200.00", operational_revenue: "850.00", charge_count: 9, by_source: [] },
        week: { period: "week", date_from: "2026-04-01", date_to: "2026-04-07", total_revenue: "5000.00", operational_revenue: "4000.00", charge_count: 40, by_source: [] },
        month: { period: "month", date_from: "2026-04-01", date_to: "2026-04-30", total_revenue: "20000.00", operational_revenue: "18000.00", charge_count: 120, by_source: [] },
      },
      isLoading: false,
    });

    mockUseCoursesQuery.mockReturnValue({ data: [{ id: "c1", name: "Main", holes: 18, active: true, club_id: "club-1", created_at: "", updated_at: "" }, { id: "c2", name: "Short", holes: 9, active: true, club_id: "club-1", created_at: "", updated_at: "" }], isLoading: false });
    mockUseTeesQuery.mockReturnValue({ data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }], isLoading: false });
    mockUseRuleSetsQuery.mockReturnValue({ data: [{ id: "r1" }], isLoading: false });
    mockUsePricingMatricesQuery.mockReturnValue({ data: [{ id: "p1" }, { id: "p2" }], isLoading: false });
  });

  test("renders utilization KPI from backend summary", () => {
    renderPage();
    expect(screen.getByText("17%")).toBeInTheDocument();
    expect(screen.getByText("12/72 slots")).toBeInTheDocument();
  });

  test("renders course and tee counts from golf-settings queries", () => {
    renderPage();
    // "3 tees" is the sub-label on the courses KPI card — unique on this page
    expect(screen.getByText("3 tees")).toBeInTheDocument();
    // at least one instance of "2" is present (courses count)
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });

  test("renders zero warnings and clean state when tee_warnings is empty", () => {
    renderPage();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/no live tee sheet issues are active/i)).toBeInTheDocument();
  });

  test("renders warning cards when tee_warnings are present", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: {
        member_count: 40,
        tee_occupancy: { booked_slots: 0, total_slots: 0, occupancy_pct: null },
        tee_warnings: [
          { code: "no_courses_configured", message: "No courses have been configured for this club." },
        ],
        recent_activity: [],
        active_targets: [],
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("No courses have been configured for this club.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /resolve on tee sheet/i })).toBeInTheDocument();
  });

  test("shows loading placeholders while queries are pending", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseFinanceRevenueSummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseCoursesQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    const placeholders = screen.getAllByText("--");
    expect(placeholders.length).toBeGreaterThan(0);
  });

  test("renders primary action links", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /open tee sheet/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /golf settings/i }).length).toBeGreaterThan(0);
  });
});
