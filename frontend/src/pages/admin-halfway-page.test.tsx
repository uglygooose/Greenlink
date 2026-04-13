import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminHalfwayPage } from "./admin-halfway-page";

const mockUseSession = vi.fn();
const mockUseHalfwaySummaryQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseFinanceTransactionVolumeSummaryQuery = vi.fn();
const mockUseMarkOrderPreparingMutation = vi.fn();
const mockUseMarkOrderReadyMutation = vi.fn();
const mockUseMarkOrderCollectedMutation = vi.fn();
const mockUseCancelOrderMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/admin-dashboard/halfway-hooks", () => ({
  useHalfwaySummaryQuery: () => mockUseHalfwaySummaryQuery(),
}));

vi.mock("../features/orders/hooks", () => ({
  useMarkOrderPreparingMutation: () => mockUseMarkOrderPreparingMutation(),
  useMarkOrderReadyMutation: () => mockUseMarkOrderReadyMutation(),
  useMarkOrderCollectedMutation: () => mockUseMarkOrderCollectedMutation(),
  useCancelOrderMutation: () => mockUseCancelOrderMutation(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
  useFinanceTransactionVolumeSummaryQuery: () => mockUseFinanceTransactionVolumeSummaryQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
      bootstrap: { selected_club_id: "club-1", user: { display_name: "Club Admin" } },
    });

    mockUseHalfwaySummaryQuery.mockReturnValue({
      data: {
        orders_today_count: 5,
        active_queue_count: 2,
        queue_orders: [
          {
            id: "order-1",
            club_id: "club-1",
            person_id: "person-1",
            person: { id: "person-1", full_name: "Avery Green" },
            booking_id: null,
            finance_charge_transaction_id: null,
            finance_charge_posted: false,
            finance_payment_transaction_id: null,
            finance_payment_posted: false,
            finance_tender_record_id: null,
            tender_recorded: false,
            payment_tender_type: null,
            source: "admin",
            status: "placed",
            created_at: new Date().toISOString(),
            item_count: 2,
            item_summary: "2x Coffee",
          },
        ],
        recent_transactions: [
          {
            id: "txn-1",
            source: "pos",
            type: "charge",
            amount: "20.00",
            description: "Coffee",
            created_at: new Date().toISOString(),
          },
        ],
      },
      isLoading: false,
    });

    mockUseMarkOrderPreparingMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    mockUseMarkOrderReadyMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    mockUseMarkOrderCollectedMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    });
    mockUseCancelOrderMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
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
  });

  test("renders KPI values from backend summary", () => {
    renderPage();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
  });

  test("renders queue orders from backend summary", () => {
    renderPage();
    expect(screen.getByText("Avery Green")).toBeInTheDocument();
    expect(screen.getByText("2x Coffee")).toBeInTheDocument();
    expect(screen.getAllByText("placed").length).toBeGreaterThan(0);
  });

  test("renders recent transactions from backend summary", () => {
    renderPage();
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");
    expect(normalizedText).toContain("R2000");
  });

  test("shows loading state while summary is loading", () => {
    mockUseHalfwaySummaryQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getAllByText(/Loading/i).length).toBeGreaterThan(0);
  });

  test("relies on shared mutation invalidation instead of manually refetching the summary", async () => {
    const refetch = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseHalfwaySummaryQuery.mockReturnValue({
      data: {
        orders_today_count: 5,
        active_queue_count: 2,
        queue_orders: [
          {
            id: "order-1",
            club_id: "club-1",
            person_id: "person-1",
            person: { id: "person-1", full_name: "Avery Green" },
            booking_id: null,
            finance_charge_transaction_id: null,
            finance_charge_posted: false,
            finance_payment_transaction_id: null,
            finance_payment_posted: false,
            finance_tender_record_id: null,
            tender_recorded: false,
            payment_tender_type: null,
            source: "admin",
            status: "placed",
            created_at: new Date().toISOString(),
            item_count: 2,
            item_summary: "2x Coffee",
          },
        ],
        recent_transactions: [],
      },
      isLoading: false,
      refetch,
    });
    mockUseMarkOrderPreparingMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /start prep/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith("order-1");
    });
    expect(refetch).not.toHaveBeenCalled();
  });
});
