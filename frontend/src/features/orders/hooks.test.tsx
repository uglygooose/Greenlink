import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { useCreateOrderMutation, useRecordPaymentMutation } from "./hooks";

const mockUseSession = vi.fn();
const mockCreateOrder = vi.fn();
const mockApiRequest = vi.fn();

vi.mock("../../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../api/client", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

vi.mock("../../api/operations", () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  cancelOrder: vi.fn(),
  fetchOrder: vi.fn(),
  fetchOrderMenu: vi.fn(),
  fetchOrders: vi.fn(),
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

function buildOrderDetail() {
  return {
    id: "order-1",
    club_id: "club-1",
    person_id: "person-1",
    person: { id: "person-1", full_name: "Jordan Member" },
    booking_id: null,
    finance_charge_transaction_id: null,
    finance_charge_posted: false,
    finance_payment_transaction_id: null,
    finance_payment_posted: false,
    finance_tender_record_id: null,
    tender_recorded: false,
    payment_tender_type: null,
    source: "player_app" as const,
    status: "placed" as const,
    created_at: "2026-03-30T10:00:00Z",
    item_count: 1,
    item_summary: "Chicken Wrap",
    items: [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: "product-1",
        item_name_snapshot: "Chicken Wrap",
        unit_price_snapshot: "42.00",
        quantity: 1,
        created_at: "2026-03-30T10:00:00Z",
      },
    ],
  };
}

function CreateOrderHarness(): JSX.Element {
  const mutation = useCreateOrderMutation();

  return (
    <button
      onClick={() => {
        mutation.mutate({
          source: "player_app",
          items: [
            {
              product_id: "product-1",
              item_name: "Chicken Wrap",
              unit_price: "42.00",
              quantity: 1,
            },
          ],
        });
      }}
      type="button"
    >
      Create
    </button>
  );
}

function RecordPaymentHarness(): JSX.Element {
  const mutation = useRecordPaymentMutation();

  return (
    <button
      onClick={() => {
        mutation.mutate({
          orderId: "order-1",
          tenderType: "card",
        });
      }}
      type="button"
    >
      Record
    </button>
  );
}

describe("order mutation invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
      },
    });
  });

  test("create order invalidates tee sheet, order, halfway, finance, dashboard, and reports reads", async () => {
    const queryClient = buildQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");
    mockCreateOrder.mockResolvedValue({
      created: true,
      order: buildOrderDetail(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateOrderHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tee-sheet", "club-1"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["orders", "club-1"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["halfway", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "accounts"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "journal"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "revenue"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "outstanding"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "transaction-volume"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "exceptions"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-dashboard", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-reports", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["orders", "club-1", "detail", "order-1"] });
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(["orders", "club-1", "detail", "order-1"], buildOrderDetail());
  });

  test("record payment reuses the same invalidation policy and refreshes order detail", async () => {
    const queryClient = buildQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");
    mockApiRequest.mockResolvedValue({
      decision: "allowed",
      settlement_applied: true,
      order: {
        ...buildOrderDetail(),
        finance_payment_transaction_id: "txn-1",
        finance_payment_posted: true,
        finance_tender_record_id: "tender-1",
        tender_recorded: true,
        payment_tender_type: "card",
      },
      tender: {
        id: "tender-1",
        club_id: "club-1",
        account_id: "account-1",
        source: "order",
        reference_id: "order-1",
        tender_type: "card",
        amount: "42.00",
        charge_transaction_id: "charge-1",
        settlement_transaction_id: "txn-1",
        description: "Card payment",
        created_at: "2026-03-30T10:00:00Z",
        settlement_applied: true,
      },
      transaction: {
        id: "txn-1",
        club_id: "club-1",
        account_id: "account-1",
        amount: "42.00",
        type: "payment",
        source: "order",
        reference_id: "order-1",
        description: "Card payment",
        created_at: "2026-03-30T10:00:00Z",
        tender_type: "card",
      },
      balance: "0.00",
      failures: [],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RecordPaymentHarness />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/orders/order-1/record-payment",
        expect.objectContaining({
          method: "POST",
          accessToken: "token",
          selectedClubId: "club-1",
          body: JSON.stringify({ tender_type: "card" }),
        }),
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tee-sheet", "club-1"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["orders", "club-1"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["halfway", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "accounts"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "journal"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "revenue"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "outstanding"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "summary", "transaction-volume"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance", "club-1", "exceptions"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-dashboard", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-reports", "club-1", "summary"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["orders", "club-1", "detail", "order-1"] });
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ["orders", "club-1", "detail", "order-1"],
      expect.objectContaining({
        id: "order-1",
        finance_payment_transaction_id: "txn-1",
        finance_payment_posted: true,
      }),
    );
  });
});
