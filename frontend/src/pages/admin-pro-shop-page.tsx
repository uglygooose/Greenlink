import { useState } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { usePosProductsQuery } from "../features/pos/hooks";
import { useSession } from "../session/session-context";

export function AdminProShopPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const productsQuery = usePosProductsQuery({ accessToken, selectedClubId });
  const products = productsQuery.data ?? [];

  const categories = Array.from(
    new Set(products.map((p) => p.category ?? "Uncategorised")),
  ).sort();

  const activeCount   = products.filter((p) => p.active).length;
  const inactiveCount = products.length - activeCount;

  const filtered = products.filter((p) => {
    const cat = p.category ?? "Uncategorised";
    const matchCat = activeCategory === null || cat === activeCategory;
    const matchSearch =
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped = categories.reduce<Record<string, typeof products>>((acc, cat) => {
    const items = filtered.filter((p) => (p.category ?? "Uncategorised") === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <AdminShell title="Pro Shop" searchPlaceholder="Search products...">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">

        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-primary p-6 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Products</span>
              <MaterialSymbol filled icon="store" className="opacity-60" />
            </div>
            <p className="mt-3 font-headline text-3xl font-extrabold">
              {productsQuery.isLoading ? "—" : products.length}
            </p>
            <p className="mt-1 text-xs opacity-70">{categories.length} categories</p>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active</span>
              <MaterialSymbol icon="check_circle" className="text-emerald-500" />
            </div>
            <p className="mt-3 font-headline text-3xl font-extrabold text-on-surface">
              {productsQuery.isLoading ? "—" : activeCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">available for sale</p>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inactive</span>
              <MaterialSymbol icon="hide_source" className="text-slate-300" />
            </div>
            <p className="mt-3 font-headline text-3xl font-extrabold text-on-surface">
              {productsQuery.isLoading ? "—" : inactiveCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">hidden from POS</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <MaterialSymbol className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" icon="search" />
            <input
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Search products…"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeCategory === null ? "bg-primary text-white" : "bg-surface-container-low text-slate-600 hover:bg-slate-200"}`}
              type="button"
              onClick={() => setActiveCategory(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeCategory === cat ? "bg-primary text-white" : "bg-surface-container-low text-slate-600 hover:bg-slate-200"}`}
                key={cat}
                type="button"
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <NavLink
            className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/pos-terminal"
          >
            <MaterialSymbol filled icon="point_of_sale" />
            Open POS
          </NavLink>
        </div>

        {/* Product catalog */}
        {productsQuery.isLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div className="h-24 animate-pulse rounded-xl bg-slate-100" key={i} />
            ))}
          </div>
        )}

        {!productsQuery.isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <MaterialSymbol className="text-4xl text-slate-200" icon="store" />
            <p className="text-sm font-medium text-slate-400">
              {search ? "No products match your search." : "No products added yet."}
            </p>
          </div>
        )}

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
              <MaterialSymbol className="text-[16px]" icon="label" />
              {category}
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((product) => (
                <div
                  className={`flex items-start justify-between rounded-xl border p-4 transition-colors ${
                    product.active
                      ? "border-slate-100 bg-surface-container-lowest hover:border-primary/20 hover:bg-slate-50"
                      : "border-dashed border-slate-200 bg-slate-50 opacity-60"
                  }`}
                  key={product.id}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-on-surface">{product.name}</p>
                      {!product.active && (
                        <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">
                          Inactive
                        </span>
                      )}
                    </div>
                    {product.description && (
                      <p className="mt-0.5 truncate text-xs text-slate-400">{product.description}</p>
                    )}
                  </div>
                  <span className="ml-3 shrink-0 font-headline text-sm font-extrabold text-primary">
                    R{parseFloat(product.price).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
