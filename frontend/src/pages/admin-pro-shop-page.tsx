import { useState } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCreateProductMutation, usePosProductsQuery, useUpdateProductMutation } from "../features/pos/hooks";
import { useSession } from "../session/session-context";
import type { PosProduct } from "../types/pos";

type NoticeTone = "error" | "success";

function asMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Request failed.";
}

interface ProductEditorModalProps {
  editing: PosProduct | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function ProductEditorModal({ editing, onClose, onSaved }: ProductEditorModalProps): JSX.Element {
  const [name, setName] = useState(editing?.name ?? "");
  const [price, setPrice] = useState(editing?.price ?? "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createProduct = useCreateProductMutation();
  const updateProduct = useUpdateProductMutation();
  const busy = createProduct.isPending || updateProduct.isPending;

  async function handleSave(): Promise<void> {
    if (!name.trim() || !price.trim()) return;
    setSubmitError(null);
    try {
      if (editing) {
        await updateProduct.mutateAsync({
          productId: editing.id,
          payload: {
            name: name.trim(),
            price: price.trim(),
            category: category.trim() || null,
            description: description.trim() || null,
          },
        });
        onSaved(`${name.trim()} updated.`);
      } else {
        await createProduct.mutateAsync({
          name: name.trim(),
          price: price.trim(),
          category: category.trim() || null,
          description: description.trim() || null,
        });
        onSaved(`${name.trim()} added to catalogue.`);
      }
      onClose();
    } catch (error) {
      setSubmitError(asMessage(error));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-headline text-base font-extrabold text-slate-900">
            {editing ? "Edit Product" : "New Product"}
          </h3>
          <button className="rounded-full p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} type="button">
            <MaterialSymbol icon="close" />
          </button>
        </div>
        <div className="space-y-3 p-6">
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name *"
            type="text"
            value={name}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price (e.g. 45.00) *"
            type="number"
            min="0"
            step="0.01"
            value={price}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            type="text"
            value={category}
          />
          <input
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            type="text"
            value={description}
          />
        </div>
        {submitError ? (
          <div className="px-6 pb-2">
            <div className="rounded-2xl bg-error-container/40 px-4 py-3 text-sm font-medium text-on-error-container">
              {submitError}
            </div>
          </div>
        ) : null}
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary-dim disabled:opacity-50"
            disabled={busy || !name.trim() || !price.trim()}
            onClick={() => void handleSave()}
            type="button"
          >
            {busy ? "Saving..." : editing ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminProShopPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<PosProduct | null>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const canManage = bootstrap?.user.user_type === "superadmin" ||
    bootstrap?.available_clubs.find((c) => c.club_id === selectedClubId)?.membership_role === "club_admin";
  const updateProduct = useUpdateProductMutation();

  const productsQuery = usePosProductsQuery({
    accessToken,
    selectedClubId,
    includeInactive: true,
  });
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

  async function handleToggleActive(product: PosProduct): Promise<void> {
    setNotice(null);
    try {
      await updateProduct.mutateAsync({
        productId: product.id,
        payload: { active: !product.active },
      });
      setNotice({ tone: "success", message: `${product.name} ${product.active ? "deactivated" : "activated"}.` });
    } catch (error) {
      setNotice({ tone: "error", message: asMessage(error) });
    }
  }

  return (
    <>
      {(composing || editing !== null) ? (
        <ProductEditorModal
          editing={editing}
          onClose={() => { setComposing(false); setEditing(null); }}
          onSaved={(msg) => setNotice({ tone: "success", message: msg })}
        />
      ) : null}
    <AdminWorkspace
        description="Product catalogue visibility, category coverage, and sellable stock state."
        kpis={
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Products</span>
              <MaterialSymbol className="text-primary" icon="store" />
            </div>
            <div className="flex items-baseline gap-2">
              {productsQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{products.length}</span>
                  <span className="text-xs font-medium text-primary">{categories.length} categories</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-emerald-500">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active</span>
              <MaterialSymbol className="text-emerald-500" icon="check_circle" />
            </div>
            <div className="flex items-baseline gap-2">
              {productsQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{activeCount}</span>
                  <span className="text-xs font-medium text-emerald-600">for sale</span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-slate-300">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inactive</span>
              <MaterialSymbol className="text-slate-400" icon="hide_source" />
            </div>
            <div className="flex items-baseline gap-2">
              {productsQuery.isLoading ? (
                <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
              ) : (
                <>
                  <span className="font-headline text-3xl font-extrabold text-on-surface">{inactiveCount}</span>
                  <span className="text-xs font-medium text-slate-400">hidden</span>
                </>
              )}
            </div>
          </div>
          </div>
        }
        title="Pro Shop"
      >
        {notice ? (
          <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${notice.tone === "error" ? "bg-error-container/40 text-on-error-container" : "bg-primary-container/50 text-on-primary-container"}`}>
            {notice.message}
          </div>
        ) : null}

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
          {canManage ? (
            <button
              className="ml-auto flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
              onClick={() => setComposing(true)}
              type="button"
            >
              <MaterialSymbol icon="add" />
              New Product
            </button>
          ) : null}
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/pos-terminal"
          >
            <MaterialSymbol filled icon="point_of_sale" />
            Open POS
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/orders"
          >
            <MaterialSymbol icon="pending_actions" />
            Order Queue
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
                  <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-headline text-sm font-extrabold text-primary">
                      R{parseFloat(product.price).toFixed(2)}
                    </span>
                    {canManage ? (
                      <div className="flex gap-1">
                        <button
                          className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                          disabled={updateProduct.isPending}
                          onClick={() => setEditing(product)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold disabled:opacity-50 ${product.active ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}
                          disabled={updateProduct.isPending}
                          onClick={() => void handleToggleActive(product)}
                          type="button"
                        >
                          {product.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </AdminWorkspace>
    </>
  );
}
