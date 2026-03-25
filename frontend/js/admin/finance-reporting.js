(function (global) {
    "use strict";

    function recentLedgerWindow() {
        const end = new Date();
        const start = new Date(end.getTime() - (14 * 24 * 60 * 60 * 1000));
        return {
            start: start.toISOString(),
            end: end.toISOString(),
        };
    }

    function renderLedgerWorkspace(bundle, deps = {}) {
        const payload = bundle.ledger || {};
        const rows = Array.isArray(payload.ledger_entries) ? payload.ledger_entries : [];
        const bookingRows = Array.isArray(bundle.ledgerBookings?.bookings) ? bundle.ledgerBookings.bookings : [];
        const exportedCount = rows.filter(row => Boolean(row.pastel_synced)).length;
        const pendingCount = rows.filter(row => !row.pastel_synced).length;
        const paidBookings = bookingRows.filter(row => ["checked_in", "completed"].includes(String(row.status || "").trim().toLowerCase()));
        const unresolved = paidBookings.filter(row => Number(row.ledger_entry_count || 0) <= 0);
        return `
            ${deps.renderPageHero({
                title: "Ledger & Reconciliation",
                copy: "Clear finance exceptions before export so paid booking states and ledger rows stay aligned.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: deps.renderInsightMeta("Ledger integrity and export guidance live"),
                metrics: [
                    { label: "Paid Bookings", value: deps.formatInteger(paidBookings.length), meta: `Paid-state golf bookings for ${deps.escapeHtml(deps.formatDate(bundle.date))}` },
                    { label: "Missing Paid Ledger", value: deps.formatInteger(unresolved.length), meta: unresolved.length ? "Paid-status bookings still need a ledger row" : "No paid booking blockers found" },
                    { label: "Pending Export", value: deps.formatInteger(pendingCount), meta: "Rows not yet marked exported" },
                    { label: "Ready for Export", value: unresolved.length ? "Blocked" : "Ready", meta: unresolved.length ? "Resolve exceptions before cashbook export" : "Ledger is clear for export" },
                ],
                body: payload._error ? `<div class="empty-state">${deps.escapeHtml(payload._error)}</div>` : "",
            })}
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Exceptions to resolve</h4>
                        <p>Resolve paid bookings missing ledger support before moving to Cashbook &amp; Day Close.</p>
                    </div>
                </div>
                ${deps.renderGuidanceStack(deps.revenueIntegrityGuidanceRows(bundle, { limit: 2 }))}
                <div class="stack">
                    ${unresolved.length ? unresolved.slice(0, 12).map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${deps.escapeHtml(row.player_name || "Booking")}</span>
                                ${deps.renderStatusPill("", "missing")}
                            </div>
                            <div class="list-meta">${deps.escapeHtml(`${deps.formatTime(row.tee_time || "")} | ${row.status || "paid"} | ${deps.formatCurrency(row.price || 0)} | ${row.club_card || "No account code"}`)}</div>
                            <div class="inline-actions">
                                <button type="button" class="button secondary" data-ledger-repair="${deps.escapeHtml(String(row.id || 0))}" data-ledger-status="${deps.escapeHtml(String(row.status || "checked_in"))}">Repair ledger</button>
                                <button type="button" class="button ghost" data-ledger-payment="${deps.escapeHtml(String(row.id || 0))}">Payment</button>
                                <button type="button" class="button ghost" data-ledger-account="${deps.escapeHtml(String(row.id || 0))}">Account</button>
                            </div>
                        </div>
                    `).join("") : `<div class="empty-state">No ledger exceptions need attention for this date.</div>`}
                </div>
            </section>
            <section class="dashboard-grid">
                ${deps.renderAccountingHandoffCard(bundle)}
                ${deps.renderAccountingWorkflowCard({ ...bundle, importSettings: [] })}
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Recent ledger entries</h4>
                        <p>The payment audit sits between tee-sheet operations and CSV export, exactly where club finance needs it.</p>
                    </div>
                </div>
                ${deps.renderTable(
                    ["Created", "Booking", "Description", "Amount", "Exported"],
                    rows.length ? rows.map(row => `
                        <tr>
                            <td>${deps.escapeHtml(deps.formatDateTime(row.created_at || ""))}</td>
                            <td>${deps.escapeHtml(row.booking_id || "-")}</td>
                            <td>${deps.escapeHtml(row.description || "-")}</td>
                            <td>${deps.escapeHtml(deps.formatCurrency(row.amount || 0))}</td>
                            <td>${deps.renderStatusPill("", row.pastel_synced ? "exported" : "pending")}</td>
                        </tr>
                    `) : [`<tr><td colspan="5"><div class="empty-state">No ledger entries found in the current audit window.</div></td></tr>`]
                )}
            </section>
        `;
    }

    function renderCashbookWorkspace(bundle, deps = {}) {
        const date = bundle.date || deps.todayYmd();
        const preview = bundle.preview || {};
        const summary = bundle.summary || {};
        const proShop = bundle.proShop || {};
        const ledgerRows = Array.isArray(bundle.cashbookLedger?.ledger_entries) ? bundle.cashbookLedger.ledger_entries : [];
        const closeStatus = bundle.closeStatus || {};
        const settings = bundle.settings || {};
        const previewLines = Array.isArray(preview.journal_lines) ? preview.journal_lines : [];
        const previewError = String(preview._error || "");
        const unexportedCount = ledgerRows.filter(row => !row.pastel_synced).length;
        const exportedCount = ledgerRows.filter(row => Boolean(row.pastel_synced)).length;
        const exportState = closeStatus.is_closed
            ? "Closed"
            : previewError
                ? "Blocked"
                : unexportedCount > 0
                    ? "Needs export"
                    : exportedCount > 0
                        ? "Exported"
                        : "No payments";
        const closeReady = !previewError && unexportedCount === 0;
        return `
            ${deps.renderPageHero({
                title: "Cashbook & Day Close",
                copy: "Preview, export, close, and reopen the selected day without leaving the club finance chain.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: `${deps.renderInsightMeta("Close readiness and integrity guidance live")}${deps.renderStatusPill("Day", closeStatus.is_closed ? "closed" : "open")}<span class="metric-pill">${deps.escapeHtml(deps.formatDate(date))}</span>`,
                metrics: [
                    { label: "Export State", value: exportState, meta: closeReady ? "Daily journal can be closed after export review" : "Resolve export blockers before close" },
                    { label: "Journal Preview", value: deps.formatInteger(previewLines.length), meta: previewError ? "Preview currently unavailable" : "Rows ready in preview" },
                    { label: "Unexported Rows", value: deps.formatInteger(unexportedCount), meta: exportedCount ? `${deps.formatInteger(exportedCount)} already exported` : "Current daily ledger rows" },
                    { label: "Pro Shop Payments", value: deps.formatInteger(proShop.transaction_count || 0), meta: "Sales ready for separate export" },
                ],
                body: !closeReady ? `
                    <div class="inline-alert bad">
                        <strong>Close blocked.</strong>
                        <span>${deps.escapeHtml(previewError || (unexportedCount > 0 ? "Export the daily CSV before closing the day." : "Resolve cashbook blockers before close."))}</span>
                    </div>
                ` : "",
                actions: [
                    { label: "Export daily CSV" },
                    { label: "Export pro shop CSV", tone: "secondary", attrs: `data-export-pro-shop="${deps.escapeHtml(date)}"` },
                    closeStatus.is_closed
                        ? { label: "Reopen day", tone: "ghost", attrs: `data-reopen-day="${deps.escapeHtml(date)}"` }
                        : { label: "Close day", tone: "ghost", attrs: `data-close-day="${deps.escapeHtml(date)}"` },
                ].map(action => action.label === "Export daily CSV"
                    ? { ...action, attrs: `data-export-cashbook="${deps.escapeHtml(date)}"` }
                    : action),
            })}
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Export readiness</h4>
                            <p>Accounting settings, export state, and close state need to be readable before the day is handed over.</p>
                        </div>
                    </div>
                    ${deps.metricCards([
                        { label: "Daily Payments", value: deps.formatCurrency(summary.total_payments || 0), meta: `${deps.formatInteger(summary.records?.length || 0)} payment records` },
                        { label: "Tax", value: deps.formatCurrency(summary.total_tax || 0), meta: "Daily tax total" },
                        { label: "Close State", value: closeStatus.is_closed ? "Closed" : "Open", meta: closeStatus.closed_at ? deps.formatDateTime(closeStatus.closed_at) : "No close recorded" },
                        { label: "VAT Rate", value: settings.vat_rate != null ? `${Math.round(Number(settings.vat_rate || 0) * 100)}%` : "-", meta: "Accounting settings currently applied" },
                    ])}
                    ${deps.renderGuidanceStack(deps.revenueIntegrityGuidanceRows(bundle, { limit: 1 }))}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Close controls</h4>
                            <p>Close should only follow a clean preview and a completed daily export.</p>
                        </div>
                    </div>
                    <div class="stack">
                        <div class="detail-row"><span class="row-key">Green Fees GL</span><span class="row-value">${deps.escapeHtml(settings.green_fees_gl || "-")}</span></div>
                        <div class="detail-row"><span class="row-key">Cashbook</span><span class="row-value">${deps.escapeHtml(settings.cashbook_name || "-")}</span></div>
                        <div class="detail-row"><span class="row-key">Close Batch</span><span class="row-value">${deps.escapeHtml(closeStatus.export_batch_id || "-")}</span></div>
                        <div class="detail-row"><span class="row-key">Export File</span><span class="row-value">${deps.escapeHtml(closeStatus.export_filename || "-")}</span></div>
                        <div class="detail-row"><span class="row-key">Preview State</span><span class="row-value">${deps.escapeHtml(previewError || (closeReady ? "Ready for review" : "Needs action"))}</span></div>
                    </div>
                </article>
            </section>
            <section class="dashboard-grid">
                ${deps.renderAccountingWorkflowCard({ ...bundle, importSettings: [] })}
                ${deps.renderReportingRhythmCard(bundle)}
                ${deps.renderAccountingHandoffCard(bundle)}
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Journal preview</h4>
                        <p>Preview what will import before downloading the CSV for the club's accounting package.</p>
                    </div>
                </div>
                ${deps.renderTable(
                    ["Date", "Reference", "Description", "Account", "Amount"],
                    previewLines.length ? previewLines.slice(0, 10).map(row => `
                        <tr>
                            <td>${deps.escapeHtml(row.transaction_date || row.date || "-")}</td>
                            <td>${deps.escapeHtml(row.reference || row.ref || "-")}</td>
                            <td>${deps.escapeHtml(row.description || "-")}</td>
                            <td>${deps.escapeHtml(row.account || row.gl_account || "-")}</td>
                            <td>${deps.escapeHtml(String(row.amount || row.debit || row.credit || "-"))}</td>
                        </tr>
                    `) : [`<tr><td colspan="5"><div class="empty-state">${deps.escapeHtml(previewError || "No journal preview is available for this date yet.")}</div></td></tr>`]
                )}
            </section>
        `;
    }

    async function repairLedgerBooking(bookingId, status, deps = {}) {
        const normalizedStatus = String(status || "").trim().toLowerCase();
        const allowedStatus = ["checked_in", "completed"].includes(normalizedStatus) ? normalizedStatus : "checked_in";
        await deps.postJson("/api/admin/bookings/batch-update", {
            booking_ids: [Number(bookingId)],
            status: allowedStatus,
        }, { invalidateCache: false });
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeDashboard: true, includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Ledger row repaired.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function exportCashbookCsv(date, deps = {}) {
        await deps.downloadWithAuth(
            `/cashbook/export-csv?export_date=${encodeURIComponent(date)}`,
            `Cashbook_Payments_${String(date || deps.todayYmd()).replaceAll("-", "")}.csv`
        );
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Daily journal exported.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function exportProShopCsv(date, deps = {}) {
        await deps.downloadWithAuth(
            `/cashbook/export-csv-pro-shop?export_date=${encodeURIComponent(date)}`,
            `PASTEL_JOURNAL_PROSHOP_GREENLINK_${String(date || deps.todayYmd()).replaceAll("-", "")}.csv`
        );
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Pro shop journal exported.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function closeCashbookDay(date, deps = {}) {
        const safeDate = String(date || deps.todayYmd()).trim() || deps.todayYmd();
        const currentCashbookDate = deps.clampYmd(deps.state.workspaceData?.date || safeDate);
        const currentPanel = String(deps.state.route?.panel || "").trim().toLowerCase();
        if (deps.state.route?.workspace === "reports" && currentPanel === "cashbook" && currentCashbookDate === safeDate) {
            const previewError = String(deps.state.workspaceData?.preview?._error || "").trim();
            const ledgerRows = Array.isArray(deps.state.workspaceData?.cashbookLedger?.ledger_entries) ? deps.state.workspaceData.cashbookLedger.ledger_entries : [];
            const unexportedCount = ledgerRows.filter(row => !row.pastel_synced).length;
            if (previewError) {
                deps.showToast("Resolve the journal preview error before closing the day.", "bad");
                return;
            }
            if (unexportedCount > 0) {
                deps.showToast("Export the daily CSV before closing the day.", "bad");
                return;
            }
        }
        if (!global.confirm(`Close ${safeDate} for day-end handover?`)) return;
        await deps.fetchJson(`/cashbook/close-day?close_date=${encodeURIComponent(safeDate)}`, { method: "POST" });
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Day closed.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function reopenCashbookDay(date, deps = {}) {
        const safeDate = String(date || deps.todayYmd()).trim() || deps.todayYmd();
        if (!global.confirm(`Reopen ${safeDate} for corrections?`)) return;
        await deps.fetchJson(`/cashbook/reopen-day?reopen_date=${encodeURIComponent(safeDate)}`, { method: "POST" });
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Day reopened.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    global.GreenLinkAdminFinanceReporting = {
        closeCashbookDay,
        exportCashbookCsv,
        exportProShopCsv,
        recentLedgerWindow,
        renderCashbookWorkspace,
        renderLedgerWorkspace,
        repairLedgerBooking,
        reopenCashbookDay,
    };
})(window);
