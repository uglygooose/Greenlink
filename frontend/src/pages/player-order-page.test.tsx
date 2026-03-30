import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createOrder } from "../api/operations";
import { PlayerShellPage } from "./player-shell-page";
import { PlayerOrderPage } from "./player-order-page";
import type { OrderCreateResult, OrderMenuItem } from "../types/orders";

const mockUseSession = vi.fn();
const mockUseOrderMenuQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/orders/hooks", () => ({
  useOrderMenuQuery: () => mockUseOrderMenuQuery(),
}));

vi.mock("../api/operations", () => ({
  createOrder: vi.fn(),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPlayerOrderPage(queryClient = buildQueryClient()): QueryClient {
  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/player/order"]}
    >
      <QueryClientProvider client={queryClient}>
        <PlayerOrderPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return queryClient;
}

function buildMenuItem(overrides: Partial<OrderMenuItem> = {}): OrderMenuItem {
  return {
    product_id: "11111111-1111-1111-1111-111111111111",
    item_name: "Chicken Wrap",
    description: "Fast halfway-house favorite with salad greens.",
    unit_price: "42.00",
    ...overrides,
  };
}

function buildCreateResult(): OrderCreateResult {
  return {
    created: true,
    order: {
      id: "order-1",
      club_id: "club-1",
      person_id: "person-1",
      person: { id: "person-1", full_name: "Jordan Member" },
      booking_id: null,
      finance_charge_transaction_id: null,
      finance_charge_posted: false,
      source: "player_app",
      status: "placed",
      created_at: "2026-03-30T10:00:00Z",
      item_count: 2,
      item_summary: "Chicken Wrap +1 more",
      items: [
        {
          id: "item-1",
          order_id: "order-1",
          product_id: "11111111-1111-1111-1111-111111111111",
          item_name_snapshot: "Chicken Wrap",
          unit_price_snapshot: "42.00",
          quantity: 2,
          created_at: "2026-03-30T10:00:00Z",
        },
      ],
    },
  };
}

describe("Player ordering flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        user: {
          id: "user-1",
          email: "member@example.com",
          display_name: "Jordan Member",
          user_type: "user",
        },
        available_clubs: [],
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "GreenLink Club",
          slug: "greenlink-club",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: null },
        },
        club_selection_required: false,
        role_shell: "player",
        default_workspace: "player",
        landing_path: "/player/home",
        module_flags: {},
        permissions: [],
        feature_flags: {},
      },
    });

    mockUseOrderMenuQuery.mockReturnValue({
      data: [
        buildMenuItem(),
        buildMenuItem({
          product_id: "22222222-2222-2222-2222-222222222222",
          item_name: "Coffee",
          description: "Fresh coffee from the halfway counter.",
          unit_price: "18.00",
        }),
      ],
      isLoading: false,
      error: null,
    });
  });

  test("adds a clear player-home entry point into the order flow", () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <PlayerShellPage />
      </MemoryRouter>,
    );

    const orderLink = screen.getByRole("link", { name: /order food & drink/i });
    expect(orderLink).toHaveAttribute("href", "/player/order");
  });

  test("places a player order with selected quantities and shows minimal confirmation", async () => {
    vi.mocked(createOrder).mockResolvedValue(buildCreateResult());

    renderPlayerOrderPage();

    expect(await screen.findByText("Chicken Wrap")).toBeInTheDocument();
    expect(screen.queryByText(/Payment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Account/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add chicken wrap/i }));
    fireEvent.click(screen.getByRole("button", { name: /increase chicken wrap/i }));
    fireEvent.click(screen.getByRole("button", { name: /^place order$/i }));

    await waitFor(() => {
      expect(createOrder).toHaveBeenCalledWith(
        {
          source: "player_app",
          items: [
            {
              product_id: "11111111-1111-1111-1111-111111111111",
              item_name: "Chicken Wrap",
              unit_price: "42.00",
              quantity: 2,
            },
          ],
        },
        {
          accessToken: "token",
          selectedClubId: "club-1",
        },
      );
    });

    expect(await screen.findByText("Order placed. Status will update from backend state.")).toBeInTheDocument();
    expect(screen.getByText("Order order-1")).toBeInTheDocument();
    expect(screen.getByText(/Status:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new order$/i })).toBeInTheDocument();
  });
});
