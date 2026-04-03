import { useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { useCreatePosTransactionMutation, usePosProductsQuery } from "../features/pos/hooks";
import { useSession } from "../session/session-context";
import type { CartItem, TenderType } from "../types/pos";

function formatPrice(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function AdminPosTerminalPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const { data: products = [], isLoading } = usePosProductsQuery({
    accessToken,
    selectedClubId,
  });

  const createTransaction = useCreatePosTransactionMutation();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedTender, setSelectedTender] = useState<TenderType>("card");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category ?? "Other")))];

  const filteredProducts =
    activeCategory === "all"
      ? products
      : products.filter((p) => (p.category ?? "Other") === activeCategory);
  const tenderOptions: Array<{
    value: TenderType;
    icon: string;
    label: string;
    disabled?: boolean;
  }> = [
    { value: "cash", icon: "payments", label: "Cash" },
    { value: "card", icon: "credit_card", label: "Card" },
    { value: "member_account", icon: "account_balance", label: "Account", disabled: true },
  ];

  function addToCart(productId: string | null, itemName: string, unitPrice: string): void {
    setCart((prev) => {
      const key = productId ?? itemName;
      const existing = prev.find((c) => (c.product_id ?? c.item_name) === key);
      if (existing) {
        return prev.map((c) =>
          (c.product_id ?? c.item_name) === key
            ? {
                ...c,
                quantity: c.quantity + 1,
                line_total: (Number(unitPrice) * (c.quantity + 1)).toFixed(2),
              }
            : c,
        );
      }
      return [
        ...prev,
        {
          product_id: productId,
          item_name: itemName,
          unit_price: unitPrice,
          quantity: 1,
          line_total: Number(unitPrice).toFixed(2),
        },
      ];
    });
  }

  function changeQty(index: number, delta: number): void {
    setCart((prev) => {
      const updated = prev.map((c, i) => {
        if (i !== index) return c;
        const qty = c.quantity + delta;
        return { ...c, quantity: qty, line_total: (Number(c.unit_price) * qty).toFixed(2) };
      });
      return updated.filter((c) => c.quantity > 0);
    });
  }

  function removeFromCart(index: number): void {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function clearCart(): void {
    setCart([]);
    setCheckoutStatus("idle");
    setErrorMsg(null);
  }

  const subtotal = cart.reduce((sum, c) => sum + Number(c.line_total), 0);

  async function handleCheckout(): Promise<void> {
    if (cart.length === 0) return;
    setCheckoutStatus("loading");
    setErrorMsg(null);
    try {
      const result = await createTransaction.mutateAsync({
        items: cart.map((c) => ({
          product_id: c.product_id,
          item_name: c.item_name,
          unit_price: c.unit_price,
          quantity: c.quantity,
        })),
        tender_type: selectedTender,
      });

      if (result.decision === "allowed" && result.transaction_applied) {
        setCheckoutStatus("success");
        setCart([]);
        return;
      }

      setCheckoutStatus("error");
      setErrorMsg(result.failures.join(", ") || "Transaction failed");
    } catch (error) {
      setCheckoutStatus("error");
      setErrorMsg(error instanceof Error ? error.message : "Transaction failed");
    }
  }

  return (
    <div className="flex h-full overflow-hidden text-on-surface">
      <div className="flex-1 overflow-y-auto bg-background p-8">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="font-headline text-2xl font-bold text-on-surface">Quick Sale</h1>
                <div className="flex gap-2">
                  {categories.map((cat) => (
                    <button
                      className={
                        cat === activeCategory
                          ? "rounded-lg bg-surface-container-high px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"
                          : "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-high"
                      }
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      type="button"
                    >
                      {cat === "all" ? "All Items" : cat}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-24 text-on-surface-variant">
                  Loading products...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center py-24 text-on-surface-variant">
                  No products available.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <div
                      className="group cursor-pointer rounded-xl border border-transparent bg-surface-container-lowest p-5 transition-all hover:border-primary/10 hover:bg-primary/5 active:scale-95"
                      key={product.id}
                      onClick={() => addToCart(product.id, product.name, product.price)}
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-container/30 text-primary">
                          <MaterialSymbol icon="inventory_2" />
                        </div>
                        <span className="text-lg font-bold text-on-surface">{formatPrice(product.price)}</span>
                      </div>
                      <h3 className="mb-1 font-headline font-bold text-on-surface">{product.name}</h3>
                      {product.description && (
                        <p className="text-xs text-on-surface-variant">{product.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="flex w-96 flex-col border-l border-slate-200 bg-surface-container-low">
              <div className="flex items-center justify-between border-b border-slate-200 bg-surface-container-lowest p-6">
                <h2 className="font-headline text-lg font-bold text-on-surface">Current Cart</h2>
                <button className="text-xs font-bold uppercase tracking-wider text-error" onClick={clearCart} type="button">
                  Clear All
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {cart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-on-surface-variant">Cart is empty</p>
                ) : (
                  cart.map((item, index) => (
                    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm" key={`${item.product_id ?? item.item_name}-${index}`}>
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold leading-snug text-on-surface">{item.item_name}</h4>
                          <p className="text-xs text-on-surface-variant">{formatPrice(item.unit_price)} each</p>
                        </div>
                        <span className="font-bold text-on-surface">{formatPrice(item.line_total)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 rounded-lg bg-surface-container p-1">
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white"
                            onClick={() => changeQty(index, -1)}
                            type="button"
                          >
                            <MaterialSymbol className="text-sm" icon="remove" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white"
                            onClick={() => changeQty(index, 1)}
                            type="button"
                          >
                            <MaterialSymbol className="text-sm" icon="add" />
                          </button>
                        </div>
                        <button
                          className="text-outline-variant transition-colors hover:text-error"
                          onClick={() => removeFromCart(index)}
                          type="button"
                        >
                          <MaterialSymbol className="text-lg" icon="delete" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-t-3xl bg-surface-container-lowest p-6 shadow-[0_-8px_24px_rgba(0,0,0,0.03)]">
                {checkoutStatus === "success" && (
                  <div className="mb-4 rounded-xl bg-primary/10 p-3 text-center text-sm font-semibold text-primary">
                    Transaction complete
                  </div>
                )}
                {checkoutStatus === "error" && errorMsg && (
                  <div className="mb-4 rounded-xl bg-error/10 p-3 text-center text-sm font-semibold text-error">
                    {errorMsg}
                  </div>
                )}

                <div className="mb-6 space-y-2">
                  <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
                    <span className="font-headline text-lg font-bold text-on-surface">Total</span>
                    <span className="font-headline text-2xl font-extrabold text-primary">
                      {formatPrice(subtotal.toFixed(2))}
                    </span>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2">
                  {tenderOptions.map((tender) => {
                    const isSelected = selectedTender === tender.value;
                    return (
                      <button
                        className={
                          tender.disabled
                            ? "flex cursor-not-allowed flex-col items-center justify-center rounded-xl bg-surface-container-low py-3 text-outline-variant opacity-50"
                            : isSelected
                            ? "flex flex-col items-center justify-center rounded-xl border-2 border-primary/20 bg-surface-container-low py-3 transition-colors active:scale-95 hover:bg-surface-container"
                            : "flex flex-col items-center justify-center rounded-xl bg-surface-container-low py-3 transition-colors active:scale-95 hover:bg-surface-container"
                        }
                        disabled={tender.disabled}
                        key={tender.value}
                        onClick={() => setSelectedTender(tender.value)}
                        type="button"
                      >
                        <MaterialSymbol
                          className={`mb-1 ${tender.disabled ? "text-outline-variant" : isSelected ? "text-primary" : "text-on-surface"}`}
                          icon={tender.icon}
                        />
                        <span
                          className={`text-[10px] font-bold uppercase tracking-tight ${
                            tender.disabled ? "text-outline-variant" : isSelected ? "text-primary" : ""
                          }`}
                        >
                          {tender.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mb-4 text-center text-xs text-on-surface-variant">
                  Member account checkout stays disabled until member lookup is wired into this terminal.
                </p>

                <button
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-dim py-5 text-lg font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50"
                  disabled={cart.length === 0 || checkoutStatus === "loading"}
                  onClick={handleCheckout}
                  type="button"
                >
                  {checkoutStatus === "loading" ? "Processing..." : "Checkout"}
                  <MaterialSymbol icon="arrow_forward" />
                </button>
              </div>
            </aside>
    </div>
  );
}
