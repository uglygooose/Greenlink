(function (global) {
    "use strict";

    function buildDebtorWatchRows(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map(row => {
                const missingCode = !String(row.account_code || "").trim();
                const missingContact = !String(row.billing_contact || "").trim();
                const terms = !String(row.terms || "").trim();
                return {
                    ...row,
                    _missingCode: missingCode,
                    _missingContact: missingContact,
                    _priority: (missingCode ? 100 : 0) + (missingContact ? 80 : 0) + (terms ? 40 : 0),
                };
            })
            .sort((left, right) => Number(right._priority || 0) - Number(left._priority || 0))
            .slice(0, 8);
    }

    function findByCode(rows, accountCode) {
        const bookingModule = global.GreenLinkAdminBookings || {};
        const normalize = typeof bookingModule.normalizeAccountCode === "function"
            ? bookingModule.normalizeAccountCode
            : (value) => String(value || "").trim();
        const code = normalize(accountCode).toLowerCase();
        if (!code) return null;
        const list = Array.isArray(rows) ? rows : [];
        return list.find((row) => String(row?.account_code || "").trim().toLowerCase() === code) || null;
    }

    function renderAccountCustomerStack(rows, deps = {}, options = {}) {
        const items = Array.isArray(rows) ? rows : [];
        const limit = Number(options.limit || 0);
        const visible = limit > 0 ? items.slice(0, limit) : items;
        const emptyText = String(options.emptyText || "No active account customers found.").trim();
        return `
            <div class="stack">
                ${visible.length ? visible.map(row => `
                    <div class="list-row">
                        <div class="list-row-top">
                            <span class="list-title">${deps.escapeHtml(row.name || "Account")}</span>
                            <span class="metric-pill">${deps.escapeHtml(row.account_code || "No code")}</span>
                        </div>
                        <div class="list-meta">${deps.escapeHtml([row.billing_contact || "", row.customer_type || "", row.terms || ""].filter(Boolean).join(" · ")) || "No billing contact set."}</div>
                    </div>
                `).join("") : `<div class="empty-state">${deps.escapeHtml(emptyText)}</div>`}
            </div>
        `;
    }

    function renderDebtorWatchCard(accountCustomers, deps = {}) {
        const rows = buildDebtorWatchRows(accountCustomers);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Debtor watch</h4>
                        <p>Booking-to-account workflows only stay clean when debtor records have code, contact, and terms ready before export.</p>
                    </div>
                </div>
                <div class="stack">
                    ${rows.length ? rows.map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${deps.escapeHtml(row.name || "Account customer")}</span>
                                <span class="metric-pill">${deps.escapeHtml(row.account_code || "Code missing")}</span>
                            </div>
                            <div class="list-meta">${deps.escapeHtml([
                                row.billing_contact || "Billing contact missing",
                                row.customer_type || "",
                                row.terms || "Terms missing",
                            ].filter(Boolean).join(" · "))}</div>
                            <div class="inline-actions">
                                ${deps.renderStatusPill("", row._missingCode || row._missingContact ? "missing" : "configured")}
                            </div>
                        </div>
                    `).join("") : `<div class="empty-state">No active debtor accounts found.</div>`}
                </div>
            </article>
        `;
    }

    function renderDebtorWatchEmbedded(accountCustomers, deps = {}) {
        const rows = buildDebtorWatchRows(accountCustomers);
        return `
            <div class="stack">
                ${rows.length ? rows.map(row => `
                    <div class="list-row">
                        <div class="list-row-top">
                            <span class="list-title">${deps.escapeHtml(row.name || "Account customer")}</span>
                            <span class="metric-pill">${deps.escapeHtml(row.account_code || "Code missing")}</span>
                        </div>
                        <div class="list-meta">${deps.escapeHtml([
                            row.billing_contact || "Billing contact missing",
                            row.customer_type || "",
                            row.terms || "Terms missing",
                        ].filter(Boolean).join(" · "))}</div>
                        <div class="inline-actions">
                            ${deps.renderStatusPill("", row._missingCode || row._missingContact ? "missing" : "configured")}
                        </div>
                    </div>
                `).join("") : `<div class="empty-state">No active debtor accounts found.</div>`}
            </div>
        `;
    }

    global.GreenLinkAdminAccountCustomers = {
        renderAccountCustomerStack,
        renderDebtorWatchCard,
        renderDebtorWatchEmbedded,
        findByCode,
    };
})(window);
