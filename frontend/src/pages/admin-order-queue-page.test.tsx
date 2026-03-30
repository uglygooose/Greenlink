import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  cancelOrder,
  markOrderCollected,
  markOrderPreparing,
  markOrderReady,
  postOrderCharge,
} from "../api/operations";
import { AdminOrderQueuePage } from "./admin-order-queue-page";
import type { OrderDetail, OrderSummary } from "../types/orders";

const mockUseSession = vi.fn();
const mockUseOrdersQuery = vi.fn();
const mockUseOrderDetailQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/orders/hooks", () => ({
  useOrdersQuery: () => mockUseOrdersQuery(),
  useOrderDetailQuery: () => mockUseOrderDetailQuery(),
}));

vi.mock("../api/operations", () => ({
  cancelOrder: vi.fn(),
  markOrderCollected: vi.fn(),
  markOrderPreparing: vi.fn(),
  markOrderReady: vi.fn(),
  postOrderCharge: vi.fn(),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(queryClient = buildQueryClient()): QueryClient {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/admin/orders"]}
    >
      <QueryClientProvider client={queryClient}>
        <AdminOrderQueuePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

function buildOrderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: "order-1",
    club_id: "club-1",
    person_id: "person-1",
    person: { id: "person-1", full_name: "Member One" },
    booking_id: "booking-1",
    finance_charge_transaction_id: null,
    finance_charge_posted: false,
    source: "staff",
    status: "placed",
    created_at: "2026-03-30T10:00:00Z",
    item_count: 2,
    item_summary: "Chicken Wrap +1 more",
    ...overrides,
  };
}

function buildOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    ...buildOrderSummary(),
    items: [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: null,
        item_name_snapshot: "Chicken Wrap",
        unit_price_snapshot: "42.00",
        quantity: 1,
        created_at: "2026-03-30T10:00:00Z",
      },
      {
        id: "item-2",
        order_id: "order-1",
        product_id: null,
        item_name_snapshot: "Water",
        unit_price_snapshot: "12.00",
        quantity: 1,
        created_at: "2026-03-30T10:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("AdminOrderQueuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Club Admin" },
      },
    });

    mockUseOrdersQuery.mockReturnValue({
      data: [
        buildOrderSummary(),
        buildOrderSummary({
          id: "order-2",
          status: "preparing",
          item_summary: "Coffee",
          item_count: 1,
          booking_id: null,
        }),
        buildOrderSummary({
          id: "order-3",
          status: "collected",
          item_summary: "Burger",
          item_count: 1,
        }),
      ],
      isLoading: false,
      error: null,
    });

    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail(),
      isLoading: false,
      error: null,
    });
  });

  test("defaults to open orders and hides collected orders from the queue list", async () => {
    renderPage();

    expect(await screen.findByText("Order Queue")).toBeInTheDocument();
    expect(screen.getByText("Order order-1")).toBeInTheDocument();
    expect(screen.getByText("Order order-2")).toBeInTheDocument();
    expect(screen.queryByText("Order order-3")).not.toBeInTheDocument();
  });

  test("switches to collected orders and shows charge posting status", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /collected orders/i }));

    expect(await screen.findByText("Order order-3")).toBeInTheDocument();
    expect(screen.queryByText("Order order-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Order order-2")).not.toBeInTheDocument();
    expect(screen.getByText("Not Posted")).toBeInTheDocument();
  });

  test("opens the drawer and marks a placed order as preparing through the backend endpoint", async () => {
    const queryClient = buildQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(markOrderPreparing).mockResolvedValue({
      order_id: "order-1",
      decision: "allowed",
      transition_applied: true,
      order: buildOrderDetail({ status: "preparing" }),
      failures: [],
    });

    renderPage(queryClient);

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));

    expect(await screen.findByText("Staff Order Queue")).toBeInTheDocument();
    expect(screen.getByText("Chicken Wrap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^mark preparing$/i }));

    await waitFor(() => {
      expect(markOrderPreparing).toHaveBeenCalledWith("order-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    expect(
      await screen.findByText("Order moved to preparing. Queue refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("keeps the drawer open when the backend blocks cancellation", async () => {
    vi.mocked(cancelOrder).mockResolvedValue({
      order_id: "order-1",
      decision: "blocked",
      transition_applied: false,
      order: buildOrderDetail(),
      failures: [
        {
          code: "order_status_not_cancellable",
          message: "Only placed orders may transition to cancelled in this phase",
          current_status: "preparing",
        },
      ],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^cancel order$/i }));

    expect(
      await screen.findByText("Only placed orders may transition to cancelled in this phase"),
    ).toBeInTheDocument();
    expect(screen.getByText("Staff Order Queue")).toBeInTheDocument();
  });

  test("shows only the valid next action for a preparing order", async () => {
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({ id: "order-2", status: "preparing", booking_id: null }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));

    expect(await screen.findByRole("button", { name: /^mark ready$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^mark preparing$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^cancel order$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^mark collected$/i })).not.toBeInTheDocument();
  });

  test("marks a ready order as collected through the backend endpoint", async () => {
    vi.mocked(markOrderCollected).mockResolvedValue({
      order_id: "order-1",
      decision: "allowed",
      transition_applied: true,
      order: buildOrderDetail({ status: "collected" }),
      failures: [],
    });
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({ status: "ready" }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^mark collected$/i }));

    await waitFor(() => {
      expect(markOrderCollected).toHaveBeenCalledWith("order-1", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });

    expect(
      await screen.findByText("Order marked collected. Queue refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("shows post charge only for a collected order without a posted charge", async () => {
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: false,
        finance_charge_transaction_id: null,
      }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));

    expect(await screen.findByRole("button", { name: /^post charge$/i })).toBeInTheDocument();
    expect(screen.getByText("Charge not posted")).toBeInTheDocument();
  });

  test("hides post charge when a collected order already has a posted charge", async () => {
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: true,
        finance_charge_transaction_id: "txn-1",
      }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));

    expect(screen.queryByRole("button", { name: /^post charge$/i })).not.toBeInTheDocument();
    expect(screen.getByText("Charge posted")).toBeInTheDocument();
    expect(screen.getByText("txn-1")).toBeInTheDocument();
  });

  test("posts a charge for an eligible collected order and refreshes safely", async () => {
    const queryClient = buildQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(postOrderCharge).mockResolvedValue({
      order_id: "order-3",
      decision: "allowed",
      posting_applied: true,
      order: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: true,
        finance_charge_transaction_id: "txn-1",
      }),
      transaction: {
        id: "txn-1",
        club_id: "club-1",
        account_id: "account-1",
        amount: "-68.00",
        type: "charge",
        source: "order",
        reference_id: "order-3",
        description: "Order charge order-3",
        created_at: "2026-03-30T10:00:00Z",
      },
      balance: "-68.00",
      failures: [],
    });
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: false,
        finance_charge_transaction_id: null,
      }),
      isLoading: false,
      error: null,
    });

    renderPage(queryClient);

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^post charge$/i }));

    await waitFor(() => {
      expect(postOrderCharge).toHaveBeenCalledWith("order-3", {
        accessToken: "token",
        selectedClubId: "club-1",
      });
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalled();
    });

    expect(
      await screen.findByText("Finance charge posted. Queue refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("shows an info notice when a collected order was already posted", async () => {
    vi.mocked(postOrderCharge).mockResolvedValue({
      order_id: "order-3",
      decision: "allowed",
      posting_applied: false,
      order: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: true,
        finance_charge_transaction_id: "txn-1",
      }),
      transaction: {
        id: "txn-1",
        club_id: "club-1",
        account_id: "account-1",
        amount: "-68.00",
        type: "charge",
        source: "order",
        reference_id: "order-3",
        description: "Order charge order-3",
        created_at: "2026-03-30T10:00:00Z",
      },
      balance: "-68.00",
      failures: [],
    });
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: false,
        finance_charge_transaction_id: null,
      }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^post charge$/i }));

    expect(
      await screen.findByText("Finance charge was already posted. Queue refreshed from backend state."),
    ).toBeInTheDocument();
  });

  test("keeps the drawer open when backend blocks charge posting", async () => {
    vi.mocked(postOrderCharge).mockResolvedValue({
      order_id: "order-3",
      decision: "blocked",
      posting_applied: false,
      order: buildOrderDetail({
        id: "order-3",
        status: "ready",
        finance_charge_posted: false,
        finance_charge_transaction_id: null,
      }),
      transaction: null,
      balance: null,
      failures: [
        {
          code: "order_status_not_charge_postable",
          message: "Only collected orders may post a finance charge in this phase",
          current_status: "ready",
        },
      ],
    });
    mockUseOrderDetailQuery.mockReturnValue({
      data: buildOrderDetail({
        id: "order-3",
        status: "collected",
        finance_charge_posted: false,
        finance_charge_transaction_id: null,
      }),
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /open order order-1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^post charge$/i }));

    expect(
      await screen.findByText("Only collected orders may post a finance charge in this phase"),
    ).toBeInTheDocument();
    expect(screen.getByText("Staff Order Queue")).toBeInTheDocument();
  });
});
