(function (global) {
    "use strict";

    function currentProducts(state) {
        return Array.isArray(state?.workspaceData?.products?.products) ? state.workspaceData.products.products : [];
    }

    function findProduct(state, productId) {
        return currentProducts(state).find(row => Number(row.id) === Number(productId)) || null;
    }

    function renderDeskBrief(products, sales, deps = {}) {
        const lowStock = Array.isArray(products) ? products.filter(row => Number(row.stock_qty || 0) <= Number(row.reorder_level || 0)).length : 0;
        const cardSales = Array.isArray(sales) ? sales.filter(row => String(row.payment_method || "").toLowerCase().includes("card")).length : 0;
        const walkIns = Array.isArray(sales) ? sales.filter(row => !String(row.customer_name || "").trim()).length : 0;
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Shop summary</h4>
                        <p>The pro shop should open with a clear trade summary: stock pressure, walk-in mix, card volume, and next close steps.</p>
                    </div>
                </div>
                ${deps.metricCards([
                    { label: "Low Stock", value: deps.formatInteger(lowStock), meta: "Products already at or below reorder level" },
                    { label: "Walk-in Sales", value: deps.formatInteger(walkIns), meta: "Sales without a named customer in the current window" },
                    { label: "Card Sales", value: deps.formatInteger(cardSales), meta: "Recent card-payment transactions" },
                    { label: "Recent Sales", value: deps.formatInteger(sales.length), meta: "Visible native pro-shop sales rows" },
                ])}
            </article>
        `;
    }

    function renderPanel(bundle, deps = {}) {
        const products = Array.isArray(bundle.products?.products) ? bundle.products.products : [];
        const sales = Array.isArray(bundle.sales?.sales) ? bundle.sales.sales : [];
        const inventory = bundle.insightMap?.pro_shop?.inventory || {};
        const alerts = bundle.alerts || {};
        const shell = deps.roleShell();
        return `
            ${deps.renderPageHero({
                title: "Pro Shop",
                copy: "Run shop trade, stock pressure, and same-day readiness from one operational page.",
                workspace: "operations",
                subnavLabel: "Operations pages",
                metrics: [
                    { label: "Products", value: deps.formatInteger(inventory.active_products || products.length), meta: "Active products in inventory" },
                    { label: "Stock Units", value: deps.formatInteger(inventory.stock_units || 0), meta: "Units currently on hand" },
                    { label: "Stock Value", value: deps.formatCurrency(inventory.stock_value || 0), meta: "Estimated inventory carrying value" },
                    { label: "Low Stock", value: deps.formatInteger(bundle.products?.low_stock_count || 0), meta: "Products at or below reorder level" },
                ],
            })}
            <section class="dashboard-grid">
                ${deps.renderProShopCashupCard(bundle.dashboard || {}, alerts)}
                ${deps.renderHandoverReadinessCard(bundle.dashboard || {}, alerts)}
            </section>
            ${shell === "club_admin" ? `
                <section class="dashboard-grid">
                    ${deps.renderOperationsCadenceCard(bundle, { context: "pro_shop" })}
                    ${deps.renderAccountingHandoffCard(bundle)}
                </section>
            ` : ""}
            <section class="dashboard-grid">
                ${renderDeskBrief(products, sales, deps)}
                ${deps.renderAccountingWorkflowCard({ ...bundle, importSettings: [] })}
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Inventory watch</h4>
                            <p>Quick visibility into products needing attention.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${products.slice(0, 14).map(row => `
                            <div class="product-row">
                                <div>
                                    <div class="list-title">${deps.escapeHtml(`${row.name || row.sku || "Product"} #${row.id || "-"}`)}</div>
                                    <div class="list-meta">${deps.escapeHtml(row.category || "Uncategorised")} · ${deps.escapeHtml(row.sku || "")}</div>
                                </div>
                                <div class="inline-actions">
                                    <span class="metric-pill">${deps.escapeHtml(deps.formatCurrency(row.unit_price || 0))}</span>
                                    ${deps.renderStatusPill("", Number(row.stock_qty || 0) <= Number(row.reorder_level || 0) ? "high" : "active")}
                                    <span class="metric-pill">${deps.escapeHtml(deps.formatInteger(row.stock_qty || 0))} in stock</span>
                                </div>
                            </div>
                        `).join("") || `<div class="empty-state">No products found.</div>`}
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Recent sales</h4>
                            <p>Native pro-shop throughput over the current period.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${sales.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${deps.escapeHtml(`${row.customer_name || "Walk-in sale"} #${row.id || "-"}`)}</span>
                                    <span class="metric-pill">${deps.escapeHtml(deps.formatCurrency(row.total || 0))}</span>
                                </div>
                                <div class="list-meta">${deps.escapeHtml(`${deps.formatDateTime(row.sold_at)} · ${(row.items || []).length} line item(s) · ${row.payment_method || ""}`)}</div>
                            </div>
                        `).join("") || `<div class="empty-state">No recent pro-shop sales.</div>`}
                    </div>
                </article>
            </section>
            <section class="split-grid">
                <form class="form-card" id="pro-shop-sale-form">
                    <div class="panel-head">
                        <div>
                            <h3>Record sale</h3>
                            <p>Post a new pro-shop sale directly from this page using the current native product list.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field">
                            <label>Product</label>
                            <select name="product_id">
                                ${products.map(row => `<option value="${deps.escapeHtml(String(row.id))}">${deps.escapeHtml(`${row.name || row.sku || "Product"} (${deps.formatCurrency(row.unit_price || 0)})`)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field"><label>Quantity</label><input name="quantity" type="number" min="1" value="1"></div>
                        <div class="field"><label>Customer</label><input name="customer_name" placeholder="Optional customer name"></div>
                        <div class="field">
                            <label>Payment</label>
                            <select name="payment_method">
                                <option value="card">Card</option>
                                <option value="cash">Cash</option>
                                <option value="eft">EFT</option>
                                <option value="account">Account</option>
                                <option value="online">Online</option>
                            </select>
                        </div>
                        <div class="field"><label>Discount</label><input name="discount" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Tax</label><input name="tax" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field" style="grid-column: 1 / -1;"><label>Notes</label><textarea name="notes"></textarea></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Record sale</button>
                    </div>
                </form>
                <form class="form-card" id="pro-shop-product-form">
                    <div class="panel-head">
                        <div>
                            <h3>Add or update product</h3>
                            <p>Create products here, or enter an existing product ID to update stock and pricing fields.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Existing Product ID</label><input name="product_id" type="number" min="1" placeholder="Leave blank to create"></div>
                        <div class="field"><label>SKU</label><input name="sku" required></div>
                        <div class="field"><label>Name</label><input name="name" required></div>
                        <div class="field"><label>Category</label><input name="category"></div>
                        <div class="field"><label>Unit Price</label><input name="unit_price" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Cost Price</label><input name="cost_price" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Stock Qty</label><input name="stock_qty" type="number" min="0" value="0"></div>
                        <div class="field"><label>Reorder Level</label><input name="reorder_level" type="number" min="0" value="0"></div>
                        <div class="checkbox-card">
                            <label><input type="checkbox" name="active" value="1" checked> Active product</label>
                            <p>Inactive products stay out of current sales but remain in the catalog.</p>
                        </div>
                        <div class="field"><label>Stock Adjust Delta</label><input name="stock_delta" type="number" step="1" value="0"></div>
                        <div class="field"><label>Stock Adjust Reason</label><input name="stock_reason" placeholder="Optional reason"></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save product</button>
                    </div>
                </form>
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h3>Product actions</h3>
                        <p>Use current product IDs to update records, or apply quick stock adjustments from this action list.</p>
                    </div>
                </div>
                <div class="stack">
                    ${products.length ? products.slice(0, 20).map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${deps.escapeHtml(`${row.name || row.sku || "Product"} #${row.id || "-"}`)}</span>
                                ${deps.renderStatusPill("", Number(row.stock_qty || 0) <= Number(row.reorder_level || 0) ? "high" : "active")}
                            </div>
                            <div class="list-meta">${deps.escapeHtml(`${row.sku || ""} · ${deps.formatCurrency(row.unit_price || 0)} · ${deps.formatInteger(row.stock_qty || 0)} in stock`)}</div>
                            <div class="inline-actions">
                                <button type="button" class="button secondary" data-edit-pro-shop-product="${deps.escapeHtml(String(row.id))}">Edit product</button>
                                <button type="button" class="button ghost" data-adjust-pro-shop-stock="${deps.escapeHtml(String(row.id))}">Adjust stock</button>
                            </div>
                        </div>
                    `).join("") : `<div class="empty-state">No products available for action.</div>`}
                </div>
            </section>
        `;
    }

    function editProduct(productId, deps = {}) {
        const row = findProduct(deps.state, productId);
        const form = deps.document.getElementById("pro-shop-product-form");
        if (!row || !(form instanceof global.HTMLFormElement)) return;
        form.product_id.value = String(row.id || "");
        form.sku.value = String(row.sku || "");
        form.name.value = String(row.name || "");
        form.category.value = String(row.category || "");
        form.unit_price.value = String(row.unit_price ?? 0);
        form.cost_price.value = String(row.cost_price ?? 0);
        form.stock_qty.value = String(row.stock_qty ?? 0);
        form.reorder_level.value = String(row.reorder_level ?? 0);
        form.stock_delta.value = "0";
        form.stock_reason.value = "";
        form.active.checked = Boolean(row.active);
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function adjustStockPrompt(productId, deps = {}) {
        const row = findProduct(deps.state, productId);
        if (!row) throw new Error("Product not found.");
        const delta = Number(deps.window.prompt(`Stock adjustment for ${row.name || row.sku} (use negative to reduce).`, "1") || 0);
        if (!Number.isFinite(delta) || delta === 0) return;
        const reason = String(deps.window.prompt("Reason for stock adjustment", "") || "").trim() || null;
        await deps.postJson(`/api/admin/pro-shop/products/${Number(productId)}/adjust-stock`, { delta, reason });
        deps.invalidateProShopPanelSharedData();
        deps.showToast("Stock adjusted.", "ok");
        await deps.refreshActiveOperationsWorkspace();
    }

    async function submitProductForm(form, deps = {}) {
        const productId = deps.positiveInt(form.product_id?.value);
        const payload = {
            sku: String(form.sku.value || "").trim(),
            name: String(form.name.value || "").trim(),
            category: String(form.category.value || "").trim() || null,
            unit_price: Number(form.unit_price.value || 0),
            cost_price: form.cost_price.value === "" ? null : Number(form.cost_price.value || 0),
            stock_qty: Number(form.stock_qty.value || 0),
            reorder_level: Number(form.reorder_level.value || 0),
            active: Boolean(form.active.checked),
        };
        let savedProductId = productId;
        if (productId) {
            const response = await deps.postJson(`/api/admin/pro-shop/products/${productId}`, payload, { method: "PUT" });
            savedProductId = deps.positiveInt(response?.product?.id) || productId;
            deps.showToast("Product updated.", "ok");
        } else {
            const response = await deps.postJson("/api/admin/pro-shop/products", payload);
            savedProductId = deps.positiveInt(response?.product?.id) || null;
            deps.showToast("Product created.", "ok");
        }
        const stockDelta = Number(form.stock_delta?.value || 0);
        const stockReason = String(form.stock_reason?.value || "").trim() || null;
        if (savedProductId && Number.isFinite(stockDelta) && stockDelta !== 0) {
            await deps.postJson(`/api/admin/pro-shop/products/${savedProductId}/adjust-stock`, { delta: stockDelta, reason: stockReason });
            deps.showToast("Product saved and stock adjusted.", "ok");
        }
        form.reset();
        if (form.active) form.active.checked = true;
        deps.invalidateProShopPanelSharedData();
        await deps.refreshActiveOperationsWorkspace();
    }

    async function submitSaleForm(form, deps = {}) {
        const payload = {
            customer_name: String(form.customer_name.value || "").trim() || null,
            payment_method: String(form.payment_method.value || "card").trim(),
            notes: String(form.notes.value || "").trim() || null,
            discount: Number(form.discount.value || 0),
            tax: Number(form.tax.value || 0),
            items: [{
                product_id: Number(form.product_id.value || 0),
                quantity: Number(form.quantity.value || 1),
            }],
        };
        await deps.postJson("/api/admin/pro-shop/sales", payload);
        deps.invalidateProShopPanelSharedData({ includeFinanceBase: true });
        deps.showToast("Sale recorded.", "ok");
        form.reset();
        if (form.quantity) form.quantity.value = "1";
        if (form.discount) form.discount.value = "0";
        if (form.tax) form.tax.value = "0";
        await deps.refreshActiveOperationsWorkspace();
    }

    global.GreenLinkAdminProShop = {
        adjustStockPrompt,
        editProduct,
        renderPanel,
        submitProductForm,
        submitSaleForm,
    };
})(window);
