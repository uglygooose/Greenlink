import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { createOrder } from "../api/operations";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useOrderMenuQuery } from "../features/orders/hooks";
import { useSession } from "../session/session-context";
import type { OrderCreateResult, OrderMenuItem } from "../types/orders";

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GL"
  );
}

function firstName(name: string | undefined): string {
  return name?.split(" ").filter(Boolean)[0] ?? "Member";
}

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Order request failed";
}

function formatPrice(value: string): string {
  return value;
}

function formatOrderLabel(orderId: string): string {
  return `Order ${orderId.slice(0, 8)}`;
}

function quantityFor(productId: string, quantities: Record<string, number>): number {
  return quantities[productId] ?? 0;
}

export function PlayerOrderPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const queryClient = useQueryClient();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const displayName = bootstrap?.user.display_name ?? "Member";
  const selectedClubName = bootstrap?.selected_club?.name ?? "GreenLink";
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderCreateResult | null>(null);

  const menuQuery = useOrderMenuQuery({
    accessToken,
    selectedClubId,
  });

  const menuItems = menuQuery.data ?? [];
  const selectedItems = menuItems.filter((item) => quantityFor(item.product_id, quantities) > 0);
  const totalQuantity = selectedItems.reduce(
    (count, item) => count + quantityFor(item.product_id, quantities),
    0,
  );

  const createOrderMutation = useMutation({
    mutationFn: (items: OrderMenuItem[]) =>
      createOrder(
        {
          source: "player_app",
          items: items.map((item) => ({
            product_id: item.product_id,
            item_name: item.item_name,
            unit_price: item.unit_price,
            quantity: quantityFor(item.product_id, quantities),
          })),
        },
        {
          accessToken: accessToken as string,
          selectedClubId: selectedClubId as string,
        },
      ),
    onSuccess: async (result) => {
      setFeedbackMessage(
        result.created ? "Order placed. Status will update from backend state." : "Order already recorded.",
      );
      setConfirmation(result);
      setQuantities({});
      await queryClient.invalidateQueries({
        queryKey: ["orders", selectedClubId ?? "none"],
      });
    },
    onError: (error) => {
      setFeedbackMessage(asMessage(error));
    },
  });

  function adjustQuantity(productId: string, nextQuantity: number): void {
    setConfirmation(null);
    setFeedbackMessage(null);
    setQuantities((current) => {
      if (nextQuantity <= 0) {
        const updated = { ...current };
        delete updated[productId];
        return updated;
      }
      return {
        ...current,
        [productId]: nextQuantity,
      };
    });
  }

  function handlePlaceOrder(): void {
    if (selectedItems.length === 0 || createOrderMutation.isPending) {
      return;
    }
    setFeedbackMessage(null);
    createOrderMutation.mutate(selectedItems);
  }

  return (
    <div className="min-h-screen bg-background pb-28 text-on-surface">
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Back to player home"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50"
            to="/player/home"
          >
            <MaterialSymbol icon="arrow_back" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Halfway House</p>
            <h1 className="font-headline text-lg font-bold text-on-surface">Order food & drink</h1>
          </div>
        </div>
        <UserAvatar
          alt={`${displayName} profile`}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container text-slate-700"
          initials={initials(displayName)}
        />
      </header>

      <main className="mx-auto max-w-md space-y-6 px-6 pt-20">
        <section className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-on-surface-variant">{selectedClubName}</p>
          <h2 className="mt-1 font-headline text-2xl font-extrabold tracking-tight text-on-surface">
            Quick order for {firstName(displayName)}
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Tap what you want, place the order, and collect when you get to the counter.
          </p>
        </section>

        {feedbackMessage ? (
          <section
            className={
              confirmation
                ? "rounded-2xl bg-primary-container/60 px-5 py-4 text-sm font-medium text-on-primary-container"
                : "rounded-2xl bg-error-container/60 px-5 py-4 text-sm font-medium text-on-error-container"
            }
          >
            {feedbackMessage}
          </section>
        ) : null}

        {confirmation ? (
          <section className="space-y-4 rounded-2xl bg-surface-container-lowest px-5 py-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Order placed</p>
                <h2 className="mt-1 font-headline text-xl font-bold text-on-surface">
                  {formatOrderLabel(confirmation.order.id)}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Status: <span className="font-semibold capitalize text-on-surface">{confirmation.order.status}</span>
                </p>
              </div>
              <button
                className="rounded-full bg-surface-container px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-on-surface transition-colors hover:bg-surface-container-high"
                onClick={() => {
                  setConfirmation(null);
                  setFeedbackMessage(null);
                }}
                type="button"
              >
                New Order
              </button>
            </div>
            <div className="space-y-3">
              {confirmation.order.items.map((item) => (
                <div
                  className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3"
                  key={item.id}
                >
                  <div>
                    <p className="font-medium text-on-surface">{item.item_name_snapshot}</p>
                    <p className="text-sm text-on-surface-variant">{item.unit_price_snapshot}</p>
                  </div>
                  <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-bold uppercase tracking-wide text-on-surface">
                    x{item.quantity}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {menuQuery.isLoading ? (
              <div className="rounded-2xl bg-surface-container-lowest px-5 py-6 text-sm text-on-surface-variant shadow-sm">
                Loading menu...
              </div>
            ) : null}
            {menuQuery.error ? (
              <div className="rounded-2xl bg-error-container/60 px-5 py-6 text-sm font-medium text-on-error-container shadow-sm">
                {menuQuery.error.message}
              </div>
            ) : null}
            {menuItems.map((item) => {
              const quantity = quantityFor(item.product_id, quantities);
              return (
                <article className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-sm" key={item.product_id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-headline text-lg font-bold text-on-surface">{item.item_name}</h3>
                      <p className="mt-1 text-sm text-on-surface-variant">{item.description}</p>
                    </div>
                    <div className="text-sm font-semibold text-on-surface">{formatPrice(item.unit_price)}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                      Quick add
                    </span>
                    {quantity === 0 ? (
                      <button
                        aria-label={`Add ${item.item_name}`}
                        className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-dim"
                        onClick={() => adjustQuantity(item.product_id, 1)}
                        type="button"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 rounded-full bg-surface-container px-2 py-2">
                        <button
                          aria-label={`Decrease ${item.item_name}`}
                          className="rounded-full bg-surface-container-high p-2 text-on-surface transition-colors hover:bg-surface-container-highest"
                          onClick={() => adjustQuantity(item.product_id, quantity - 1)}
                          type="button"
                        >
                          <MaterialSymbol icon="remove" />
                        </button>
                        <span className="min-w-6 text-center font-headline text-lg font-bold text-on-surface">
                          {quantity}
                        </span>
                        <button
                          aria-label={`Increase ${item.item_name}`}
                          className="rounded-full bg-primary p-2 text-on-primary transition-colors hover:bg-primary-dim"
                          onClick={() => adjustQuantity(item.product_id, quantity + 1)}
                          type="button"
                        >
                          <MaterialSymbol filled icon="add" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {!confirmation ? (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-6">
          <div className="rounded-2xl bg-surface-container-lowest px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Selected</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {totalQuantity > 0 ? `${totalQuantity} item${totalQuantity === 1 ? "" : "s"} ready to place` : "Choose items to place an order"}
                </p>
              </div>
              <MaterialSymbol className="text-primary" filled icon="receipt_long" />
            </div>
            <button
              className="w-full rounded-xl bg-primary py-4 text-center font-headline text-lg font-bold text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant"
              disabled={totalQuantity === 0 || createOrderMutation.isPending || menuQuery.isLoading}
              onClick={handlePlaceOrder}
              type="button"
            >
              {createOrderMutation.isPending ? "Placing Order..." : "Place Order"}
            </button>
          </div>
        </div>
      ) : null}

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500 active:bg-slate-100 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/player/home" },
          { label: "Order", icon: "local_cafe", to: "/player/order", isActive: true },
          { label: "Club/News", icon: "article" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
