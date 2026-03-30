import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";

type ProductCard = {
  title: string;
  subtitle: string;
  price: string;
  icon?: string;
  imageLabel?: string;
  accentClassName: string;
};

type CartItem = {
  title: string;
  subtitle: string;
  price: string;
  highlighted?: boolean;
};

const PRODUCTS: ProductCard[] = [
  {
    title: "18 Holes",
    subtitle: "Peak Time Weekday",
    price: "$75.00",
    icon: "golf_course",
    accentClassName: "bg-primary-container/30 text-primary",
  },
  {
    title: "Power Cart",
    subtitle: "18 Hole Rental",
    price: "$35.00",
    icon: "shopping_cart",
    accentClassName: "bg-primary-container/30 text-primary",
  },
  {
    title: "Large Bucket",
    subtitle: "75 Range Balls",
    price: "$12.00",
    icon: "sports_baseball",
    accentClassName: "bg-tertiary-container/30 text-tertiary",
  },
  {
    title: "Water 500ml",
    subtitle: "Bottled Spring",
    price: "$4.50",
    icon: "inventory_2",
    accentClassName: "bg-surface-container text-on-surface-variant",
  },
  {
    title: "Titleist Pro V1 (Dozen)",
    subtitle: "Premium golf balls",
    price: "$54.99",
    imageLabel: "PV1",
    accentClassName: "bg-surface-container-low text-primary",
  },
  {
    title: "Elite Leather Glove",
    subtitle: "Premium leather",
    price: "$22.00",
    imageLabel: "GLV",
    accentClassName: "bg-surface-container-low text-primary",
  },
  {
    title: "Performance Club Cap",
    subtitle: "Club apparel",
    price: "$28.00",
    imageLabel: "CAP",
    accentClassName: "bg-surface-container-low text-primary",
  },
  {
    title: "Switchblade Divot Tool",
    subtitle: "Repair set",
    price: "$15.00",
    imageLabel: "TOOL",
    accentClassName: "bg-surface-container-low text-primary",
  },
];

const CART_ITEMS: CartItem[] = [
  { title: "18 Holes Green Fee", subtitle: "Standard Adult", price: "$75.00" },
  { title: "Power Cart", subtitle: "Shared Usage", price: "$35.00", highlighted: true },
  { title: "Titleist Pro V1", subtitle: "1 Dozen (White)", price: "$54.99" },
];

function sidebarLinkClass(isActive: boolean): string {
  return isActive
    ? "flex items-center gap-3 rounded-l-xl bg-white px-4 py-3 font-semibold text-[#2B6954] shadow-sm transition-all dark:bg-slate-900 dark:text-[#3da082]"
    : "flex items-center gap-3 px-4 py-3 font-semibold text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";
}

export function AdminPosTerminalPage(): JSX.Element {
  return (
    <div className="overflow-hidden text-on-surface">
      <div className="flex h-screen w-full">
        <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-200 ease-in-out dark:border-slate-800 dark:bg-slate-950">
          <div className="p-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
                <MaterialSymbol icon="sports_golf" />
              </div>
              <div>
                <h2 className="font-headline font-bold leading-tight text-on-surface">Pro Shop</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Active Session: John D.</p>
              </div>
            </div>
            <button className="mb-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-dim px-4 py-3 font-semibold text-white shadow-md shadow-primary/10 transition-all active:scale-95" type="button">
              <MaterialSymbol icon="add" />
              New Sale
            </button>
            <nav className="space-y-1">
              <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/pos-terminal">
                <MaterialSymbol icon="point_of_sale" />
                POS
              </NavLink>
              <button className={sidebarLinkClass(false)} type="button">
                <MaterialSymbol icon="person_search" />
                Customers
              </button>
              <button className={sidebarLinkClass(false)} type="button">
                <MaterialSymbol icon="receipt_long" />
                Receipts
              </button>
              <button className={sidebarLinkClass(false)} type="button">
                <MaterialSymbol icon="history" />
                History
              </button>
              <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/finance">
                <MaterialSymbol icon="account_balance_wallet" />
                Finance
              </NavLink>
            </nav>
          </div>
          <div className="mt-auto space-y-1 p-6">
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol icon="lock" />
              Lock
            </button>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol icon="help_center" />
              Help
            </button>
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="z-10 flex h-20 items-center justify-between bg-surface-container-lowest px-8">
            <div className="relative max-w-2xl flex-1">
              <MaterialSymbol className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" icon="search" />
              <input
                className="w-full rounded-xl border-none bg-surface-container-low py-3 pl-12 pr-4 text-sm transition-all placeholder:text-outline-variant focus:ring-2 focus:ring-primary/20"
                placeholder="Search products, members, or scan SKU..."
                type="text"
              />
            </div>
            <div className="ml-8 flex items-center gap-4">
              <div className="flex items-center gap-3 rounded-xl border border-transparent bg-surface-container-low px-4 py-2 transition-all hover:border-outline-variant/20">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-dim">
                  <MaterialSymbol className="text-sm text-on-surface-variant" icon="person" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-tighter text-outline-variant">Active Customer</p>
                  <p className="text-sm font-semibold text-on-surface">Walk-in Guest</p>
                </div>
                <button className="ml-2 text-primary" type="button">
                  <MaterialSymbol className="text-lg" icon="edit" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto bg-background p-8">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="font-headline text-2xl font-bold text-on-surface">Quick Sale</h1>
                <div className="flex gap-2">
                  <button className="rounded-lg bg-surface-container-high px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant" type="button">
                    All Items
                  </button>
                  <button className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-high" type="button">
                    Services
                  </button>
                  <button className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-high" type="button">
                    Equipment
                  </button>
                  <button className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-high" type="button">
                    Apparel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {PRODUCTS.map((product) => (
                  <div
                    className="group cursor-pointer rounded-xl border border-transparent bg-surface-container-lowest p-5 transition-all hover:border-primary/10 hover:bg-primary/5 active:scale-95"
                    key={product.title}
                  >
                    {product.icon ? (
                      <>
                        <div className="mb-4 flex items-start justify-between">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${product.accentClassName}`}>
                            <MaterialSymbol icon={product.icon} />
                          </div>
                          <span className="text-lg font-bold text-on-surface">{product.price}</span>
                        </div>
                        <h3 className="mb-1 font-headline font-bold text-on-surface">{product.title}</h3>
                        <p className="text-xs text-on-surface-variant">{product.subtitle}</p>
                      </>
                    ) : (
                      <div className="flex h-full flex-col justify-between">
                        <div className={`mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-lg ${product.accentClassName}`}>
                          <span className="font-headline text-xl font-bold">{product.imageLabel}</span>
                        </div>
                        <div>
                          <h3 className="mb-1 text-sm font-headline font-bold leading-tight text-on-surface">{product.title}</h3>
                          <p className="text-lg font-bold text-primary">{product.price}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">{product.subtitle}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <aside className="flex w-96 flex-col border-l border-slate-200 bg-surface-container-low">
              <div className="flex items-center justify-between border-b border-slate-200 bg-surface-container-lowest p-6">
                <h2 className="font-headline text-lg font-bold text-on-surface">Current Cart</h2>
                <button className="text-xs font-bold uppercase tracking-wider text-error" type="button">
                  Clear All
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {CART_ITEMS.map((item) => (
                  <div
                    className={item.highlighted ? "rounded-xl border-l-4 border-primary bg-surface-container-lowest p-4 shadow-sm" : "rounded-xl bg-surface-container-lowest p-4 shadow-sm"}
                    key={item.title}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold leading-snug text-on-surface">{item.title}</h4>
                        <p className="text-xs text-on-surface-variant">{item.subtitle}</p>
                      </div>
                      <span className="font-bold text-on-surface">{item.price}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-lg bg-surface-container p-1">
                        <button className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white" type="button">
                          <MaterialSymbol className="text-sm" icon="remove" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">1</span>
                        <button className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white" type="button">
                          <MaterialSymbol className="text-sm" icon="add" />
                        </button>
                      </div>
                      <button className="text-outline-variant transition-colors hover:text-error" type="button">
                        <MaterialSymbol className="text-lg" icon="delete" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-t-3xl bg-surface-container-lowest p-6 shadow-[0_-8px_24px_rgba(0,0,0,0.03)]">
                <div className="mb-6 space-y-2">
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>Subtotal</span>
                    <span>$164.99</span>
                  </div>
                  <div className="flex justify-between text-sm text-on-surface-variant">
                    <span>VAT</span>
                    <span>$13.20</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
                    <span className="font-headline text-lg font-bold text-on-surface">Total</span>
                    <span className="font-headline text-2xl font-extrabold text-primary">$178.19</span>
                  </div>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <button className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low py-3 transition-colors active:scale-95 hover:bg-surface-container" type="button">
                    <MaterialSymbol className="mb-1 text-on-surface" icon="payments" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Cash</span>
                  </button>
                  <button className="flex flex-col items-center justify-center rounded-xl border-2 border-primary/20 bg-surface-container-low py-3 transition-colors active:scale-95 hover:bg-surface-container" type="button">
                    <MaterialSymbol className="mb-1 text-primary" icon="credit_card" />
                    <span className="text-[10px] font-bold uppercase tracking-tight text-primary">Card</span>
                  </button>
                  <button className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low py-3 transition-colors active:scale-95 hover:bg-surface-container" type="button">
                    <MaterialSymbol className="mb-1 text-on-surface" icon="account_balance" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Account</span>
                  </button>
                </div>
                <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-dim py-5 text-lg font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" type="button">
                  Checkout
                  <MaterialSymbol icon="arrow_forward" />
                </button>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
