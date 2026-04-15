import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminDashboardPage } from "./admin-dashboard-page";

const mockUseSession = vi.fn();
const mockUseAdminDashboardSummaryQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/admin-dashboard/hooks", () => ({
  useAdminDashboardSummaryQuery: () => mockUseAdminDashboardSummaryQuery(),
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
  arrivals_due_count: 0,
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

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
        module_flags: { communications: false },
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
  });

  test("renders the Work Queue section", () => {
    renderPage();
    expect(screen.getByText("What needs action")).toBeInTheDocument();
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

  test("shows arrivals due alert chip and work card when arrivals_due_count > 0", () => {
    mockUseAdminDashboardSummaryQuery.mockReturnValue({
      data: { ...baseSummaryData, arrivals_due_count: 5 },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByRole("link", { name: /arrivals due/i })).toBeInTheDocument();
    expect(screen.getByText("Arrivals due soon")).toBeInTheDocument();
    expect(screen.getByText(/5 reserved bookings are due to arrive in the next 90 minutes/i)).toBeInTheDocument();
    const chip = screen.getByRole("link", { name: /arrivals due/i });
    expect(chip).toHaveAttribute("href", "/admin/golf/tee-sheet?filter=arrivals-due");
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
