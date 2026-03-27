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

    function cashbookExportPosture({ closeStatus = {}, previewLoaded = false, previewError = "", blockedRows = 0, unexportedCount = 0, exportedCount = 0 } = {}) {
        const exportMapping = closeStatus?.finance_semantics?.export_mapping || {};
        if (Boolean(closeStatus.is_closed)) {
            return { code: "closed", label: "Closed" };
        }
        if (!Boolean(exportMapping.configured)) {
            return { code: "missing_mapping", label: "Setup missing" };
        }
        if (!previewLoaded) {
            return { code: "pending", label: "Preview pending" };
        }
        if (String(previewError || "").trim() || Number(blockedRows || 0) > 0) {
            return { code: "missing", label: "Blocked" };
        }
        if (Number(unexportedCount || 0) > 0) {
            return { code: "pending", label: "Needs export" };
        }
        if (Number(exportedCount || 0) > 0) {
            return { code: "exported", label: "Exported" };
        }
        return { code: "ok", label: "No payments" };
    }

    function renderLedgerWorkspace(bundle, deps = {}) {
        const payload = bundle.ledger || {};
        const rows = Array.isArray(payload.ledger_entries) ? payload.ledger_entries : [];
        const bookingRows = Array.isArray(bundle.ledgerBookings?.bookings) ? bundle.ledgerBookings.bookings : [];
        const exportedCount = rows.filter(row => Boolean(row?.finance_state?.exported)).length;
        const exportReadyCount = rows.filter(row => Boolean(row?.finance_state?.export_ready) && !Boolean(row?.finance_state?.exported)).length;
        const ledgerBackedBookings = bookingRows.filter(row => Boolean(row?.finance_state?.is_paid) || Number(row.ledger_entry_count || 0) > 0);
        const unresolved = bookingRows.filter(row => Boolean(row?.finance_state?.paid_status_without_ledger));
        return `
            ${deps.renderPageHero({
                title: "Ledger & Reconciliation",
                copy: "Clear finance exceptions before export so paid booking states and ledger rows stay aligned.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: deps.renderInsightMeta("Ledger integrity and export guidance live"),
                metrics: [
                    { label: "Ledger-backed Bookings", value: deps.formatInteger(ledgerBackedBookings.length), meta: `Bookings considered paid for ${deps.escapeHtml(deps.formatDate(bundle.date))}` },
                    { label: "Paid Status Missing Ledger", value: deps.formatInteger(unresolved.length), meta: unresolved.length ? "Checked-in or completed bookings still need a ledger row" : "No paid-status ledger blockers found" },
                    { label: "Export-ready Entries", value: deps.formatInteger(exportReadyCount), meta: "Ledger rows that meet current export prerequisites" },
                    { label: "Exported Entries", value: deps.formatInteger(exportedCount), meta: "Ledger rows already marked exported" },
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
                            <div class="list-meta">${deps.escapeHtml(`${deps.formatTime(row.tee_time || "")} | ${row.status || "booked"} | ${deps.formatCurrency(row.price || 0)} | ${row.club_card || "No account code"}`)}</div>
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
                    ["Created", "Booking", "Description", "Amount", "Export State"],
                    rows.length ? rows.map(row => `
                        <tr>
                            <td>${deps.escapeHtml(deps.formatDateTime(row.created_at || ""))}</td>
                            <td>${deps.escapeHtml(row.booking_id || "-")}</td>
                            <td>
                                <div>${deps.escapeHtml(row.description || "-")}</div>
                                <div class="table-meta">${deps.escapeHtml(row.payment_method || "No payment method")}</div>
                            </td>
                            <td>${deps.escapeHtml(deps.formatCurrency(row.amount || 0))}</td>
                            <td>${deps.renderStatusPill("", row?.finance_state?.export_status_code || "not_exportable")}<div class="table-meta">${deps.escapeHtml(row?.finance_state?.export_status_label || "Not exportable")}</div></td>
                        </tr>
                    `) : [`<tr><td colspan="5"><div class="empty-state">No ledger entries found in the current audit window.</div></td></tr>`]
                )}
            </section>
        `;
    }

    function renderCashbookWorkspace(bundle, deps = {}) {
        const date = bundle.date || deps.todayYmd();
        const preview = bundle.preview || {};
        const previewLoaded = Boolean(bundle.previewLoaded);
        const summary = bundle.summary || {};
        const proShop = bundle.proShop || {};
        const ledgerRows = Array.isArray(bundle.cashbookLedger?.ledger_entries) ? bundle.cashbookLedger.ledger_entries : [];
        const closeStatus = bundle.closeStatus || {};
        const settings = bundle.settings || {};
        const previewLines = Array.isArray(preview.journal_lines) ? preview.journal_lines : [];
        const previewError = String(preview._error || "");
        const previewStateSummary = preview.finance_state_summary || {};
        const hasLedgerRows = ledgerRows.length > 0;
        const exportedCount = ledgerRows.filter(row => Boolean(row?.finance_state?.exported)).length;
        const unexportedCount = ledgerRows.filter(row => !Boolean(row?.finance_state?.exported)).length;
        const exportReadyCount = ledgerRows.filter(row => Boolean(row?.finance_state?.export_ready) && !Boolean(row?.finance_state?.exported)).length;
        const exportBlockedCount = ledgerRows.filter(row => !Boolean(row?.finance_state?.exported) && !Boolean(row?.finance_state?.export_ready)).length;
        const missingPaymentMethodCount = ledgerRows.filter(row => row?.finance_state?.export_status_code === "missing_payment_method").length;
        const missingMappingCount = ledgerRows.filter(row => row?.finance_state?.export_status_code === "missing_mapping").length;
        const exportReadyRows = hasLedgerRows ? exportReadyCount : Number(previewStateSummary.export_ready_rows || 0);
        const blockedRows = hasLedgerRows ? exportBlockedCount : Number(previewStateSummary.blocked_rows || 0);
        const exportPosture = cashbookExportPosture({
            closeStatus,
            previewLoaded,
            previewError,
            blockedRows,
            unexportedCount,
            exportedCount,
        });
        const exportState = exportPosture.label;
        const closeReady = previewLoaded && !previewError && blockedRows === 0 && unexportedCount === 0;
        const previewStateLabel = !previewLoaded
            ? "Not loaded"
            : previewError
                ? "Preview blocked"
                : closeReady
                    ? "Ready for review"
                    : exportPosture.label;
        const exportAction = Boolean(closeStatus.is_closed)
            ? { label: "Export locked", tone: "ghost", attrs: `data-export-cashbook="${deps.escapeHtml(date)}" disabled aria-disabled="true"` }
            : ["missing_mapping", "missing"].includes(String(exportPosture.code || ""))
                ? { label: "Export blocked", tone: "ghost", attrs: `data-export-cashbook="${deps.escapeHtml(date)}" disabled aria-disabled="true"` }
                : { label: "Export daily CSV", attrs: `data-export-cashbook="${deps.escapeHtml(date)}"` };
        const closeAction = closeStatus.is_closed
            ? { label: "Reopen day", tone: "ghost", attrs: `data-reopen-day="${deps.escapeHtml(date)}"` }
            : closeReady
                ? { label: "Close day", tone: "ghost", attrs: `data-close-day="${deps.escapeHtml(date)}"` }
                : { label: "Close blocked", tone: "ghost", attrs: `data-close-day="${deps.escapeHtml(date)}" disabled aria-disabled="true"` };
        const previewMessage = !previewLoaded
            ? "Load the journal preview before closing or exporting the day."
            : previewError
                ? previewError
                : blockedRows > 0
                    ? `Resolve ${deps.formatInteger(blockedRows)} blocked row(s) before close.`
                    : unexportedCount > 0
                        ? `Export ${deps.formatInteger(unexportedCount)} unexported row(s) before close.`
                        : "Preview is clear and ready for export review.";
        const previewAmount = previewLines.reduce((total, row) => total + Number(row?.amount || row?.debit || row?.credit || 0), 0);
        const totalExportValue = previewAmount || Number(bundle.cashbookLedger?.total_amount || 0) || Number(summary.total_payments || 0);
        const drawerRows = (previewLoaded ? previewLines : ledgerRows).slice(0, 4);
        const financeTone = blockedRows > 0 || previewError ? "bad" : closeReady ? "ok" : "warn";
        const journalRows = ledgerRows.slice(0, 8);
        const renderActionButton = action => `
            <button type="button" class="button ${action.tone === "secondary" ? "secondary" : action.tone === "ghost" ? "ghost" : ""}" ${action.attrs}>${deps.escapeHtml(action.label)}</button>
        `;
        return `
            ${deps.renderPageHero({
                title: "Cashbook & Day Close",
                copy: "Preview, export, close, and reopen the selected day without leaving the club finance chain.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: `${deps.renderInsightMeta("Close readiness and integrity guidance live")}${deps.renderStatusPill("Day", closeStatus.is_closed ? "closed" : "open")}${deps.renderStatusPill("Export", exportPosture.code)}<span class="metric-pill">${deps.escapeHtml(deps.formatDate(date))}</span>`,
                metrics: [
                    { label: "Export State", value: exportState, meta: closeReady ? "Daily journal can be closed after export review" : "Resolve export blockers before close" },
                    { label: "Journal Preview", value: previewLoaded ? deps.formatInteger(previewLines.length) : "On demand", meta: !previewLoaded ? "Load only when needed" : (previewError ? "Preview currently unavailable" : "Rows ready in preview") },
                    { label: "Unexported Rows", value: deps.formatInteger(unexportedCount), meta: blockedRows ? `${deps.formatInteger(exportReadyRows)} ready | ${deps.formatInteger(blockedRows)} blocked` : (exportedCount ? `${deps.formatInteger(exportedCount)} already exported` : "Current daily ledger rows") },
                    { label: "Pro Shop Payments", value: deps.formatInteger(proShop.transaction_count || 0), meta: "Sales ready for separate export" },
                ],
                body: !closeReady ? `
                    <div class="inline-alert bad">
                        <strong>Close blocked.</strong>
                        <span>${deps.escapeHtml(!previewLoaded ? "Load the journal preview before closing the day." : (previewError || (blockedRows > 0 ? "Resolve export blockers before close." : (unexportedCount > 0 ? "Export the daily CSV before closing the day." : "Resolve cashbook blockers before close."))))}</span>
                    </div>
                ` : "",
                actions: [
                    { label: previewLoaded ? "Refresh preview" : "Load preview", tone: "ghost", attrs: `data-load-cashbook-preview="${deps.escapeHtml(date)}"` },
                    exportAction,
                    { label: "Export pro shop CSV", tone: "secondary", attrs: `data-export-pro-shop="${deps.escapeHtml(date)}"` },
                    closeAction,
                ],
            })}
            <section class="finance-flow-layout">
                <div class="finance-main-stack">
                    <section class="finance-summary-row">
                        <article class="finance-summary-card ${financeTone === "bad" ? "bad" : "ok"}">
                            <div class="finance-summary-head">
                                <div class="finance-summary-label">Unexported posture</div>
                                <span class="finance-summary-kicker">GL</span>
                            </div>
                            <div class="finance-summary-value">${deps.escapeHtml(deps.formatInteger(unexportedCount))}</div>
                            <div class="finance-summary-meta">${deps.escapeHtml(blockedRows > 0 ? `${deps.formatInteger(blockedRows)} blocked row(s) still need attention.` : `${deps.formatInteger(exportReadyRows)} row(s) are ready for export review.`)}</div>
                            <div class="finance-summary-progress"><span style="width:${Math.max(12, Math.min(100, unexportedCount > 0 ? (exportReadyRows / Math.max(1, unexportedCount + blockedRows)) * 100 : 100))}%"></span></div>
                        </article>
                        <article class="finance-summary-card ${closeReady ? "ok" : "bad"}">
                            <div class="finance-summary-head">
                                <div class="finance-summary-label">Pending exports</div>
                                <span class="finance-summary-kicker">EX</span>
                            </div>
                            <div class="finance-summary-value">${deps.escapeHtml(deps.formatInteger(exportReadyRows))}</div>
                            <div class="finance-summary-meta">${deps.escapeHtml(closeReady ? "Ready for sync after review." : previewStateLabel)}</div>
                            <div class="finance-summary-progress"><span style="width:${Math.max(12, Math.min(100, (exportReadyRows / Math.max(1, exportReadyRows + blockedRows)) * 100))}%"></span></div>
                        </article>
                    </section>
                    <section class="finance-journal-card">
                        <div class="panel-head">
                            <div>
                                <h4>Cashbook journal</h4>
                                <p>Daily ledger activity stays explicit on the main surface while export review remains in the right-side drawer pattern.</p>
                            </div>
                            <span class="metric-pill">${deps.escapeHtml(deps.formatDate(date))}</span>
                        </div>
                        ${deps.renderTable(
                            ["Date", "Item / Transaction", "Category", "Finance State", "Amount"],
                            journalRows.length ? journalRows.map(row => `
                                <tr>
                                    <td>${deps.escapeHtml(deps.formatDate(row.created_at || row.timestamp || row.recorded_at || date))}</td>
                                    <td>
                                        <strong>${deps.escapeHtml(row.description || row.reference || row.source_label || "Ledger entry")}</strong>
                                        <div class="list-meta">${deps.escapeHtml((row.reference || row.external_reference || row.booking_reference || "-"))}</div>
                                    </td>
                                    <td>${deps.escapeHtml(row.category || row.account_name || row.stream || "-")}</td>
                                    <td>${deps.renderStatusPill("", row?.finance_state?.export_status_code || row?.finance_state?.status || "pending")}</td>
                                    <td>${deps.escapeHtml(deps.formatCurrency(row.amount || row.total || 0))}</td>
                                </tr>
                            `) : [`<tr><td colspan="5"><div class="empty-state">No ledger entries found in the current audit window.</div></td></tr>`]
                        )}
                    </section>
                    <section class="dashboard-grid">
                        <article class="finance-support-card">
                            <div class="panel-head">
                                <div>
                                    <h4>Export readiness</h4>
                                    <p>Accounting settings, export state, and close state need to stay readable before the day is handed over.</p>
                                </div>
                            </div>
                            ${deps.metricCards([
                                { label: "Daily Payments", value: deps.formatCurrency(summary.total_payments || 0), meta: `${deps.formatInteger(summary.records?.length || 0)} payment records` },
                                { label: "Tax", value: deps.formatCurrency(summary.total_tax || 0), meta: "Daily tax total" },
                                { label: "Close State", value: exportPosture.label, meta: Boolean(closeStatus.is_closed) && closeStatus.closed_at ? deps.formatDateTime(closeStatus.closed_at) : (closeReady ? "Daily journal can be closed after export review" : "Current close posture from surfaced finance truth") },
                                { label: "VAT Rate", value: settings.vat_rate != null ? `${Math.round(Number(settings.vat_rate || 0) * 100)}%` : "-", meta: "Accounting settings currently applied" },
                            ])}
                            ${deps.renderGuidanceStack(deps.revenueIntegrityGuidanceRows(bundle, { limit: 1 }))}
                        </article>
                        <article class="finance-support-card">
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
                                <div class="detail-row"><span class="row-key">Preview State</span><span class="row-value">${deps.escapeHtml(previewStateLabel)}</span></div>
                                <div class="detail-row"><span class="row-key">Export-ready rows</span><span class="row-value">${deps.escapeHtml(deps.formatInteger(exportReadyRows))}</span></div>
                                <div class="detail-row"><span class="row-key">Blocked rows</span><span class="row-value">${deps.escapeHtml(deps.formatInteger(blockedRows))}${missingPaymentMethodCount || missingMappingCount ? ` (${deps.escapeHtml(`${deps.formatInteger(missingPaymentMethodCount)} payment method, ${deps.formatInteger(missingMappingCount)} mapping`)})` : ""}</span></div>
                            </div>
                        </article>
                    </section>
                    <section class="dashboard-grid">
                        ${deps.renderAccountingWorkflowCard({ ...bundle, importSettings: [] })}
                        ${deps.renderReportingRhythmCard(bundle)}
                        ${deps.renderAccountingHandoffCard(bundle)}
                    </section>
                </div>
                <aside class="finance-drawer-stack">
                    <section class="finance-drawer">
                        <div class="finance-drawer-head">
                            <div class="panel-head">
                                <div>
                                    <h4>Export Preview</h4>
                                    <p>${deps.escapeHtml(previewLoaded ? `Reviewing ${deps.formatInteger(previewLines.length)} record(s) for journal sync.` : "Preview stays on demand until the user loads it.")}</p>
                                </div>
                                <span class="status-pill ${financeTone}">${deps.escapeHtml(closeReady ? "Validated" : exportPosture.label)}</span>
                            </div>
                        </div>
                        <div class="finance-drawer-body">
                            <div class="finance-inline-callout ${financeTone === "bad" ? "bad" : ""}">
                                <strong>${deps.escapeHtml(closeReady ? "Ready to trigger export" : "Review required")}</strong>
                                <span>${deps.escapeHtml(previewMessage)}</span>
                            </div>
                            <div class="finance-handoff-list">
                                ${drawerRows.length ? drawerRows.map(row => `
                                    <div class="finance-handoff-row">
                                        <div class="finance-handoff-copy">
                                            <div class="finance-handoff-title">${deps.escapeHtml(row.reference || row.ref || row.description || "Journal row")}</div>
                                            <div class="finance-handoff-meta">${deps.escapeHtml((row.description || row.account || row.gl_account || row.category || "Current export item"))}</div>
                                        </div>
                                        <strong>${deps.escapeHtml(deps.formatCurrency(row.amount || row.debit || row.credit || row.total || 0))}</strong>
                                    </div>
                                `).join("") : `<div class="empty-state">${deps.escapeHtml(previewLoaded ? (previewError || "No journal preview is available for this date yet.") : "Load the journal preview when you need to inspect the export.")}</div>`}
                            </div>
                            <div class="finance-total-card">
                                <div class="finance-summary-label">Total export value</div>
                                <div class="finance-summary-value">${deps.escapeHtml(deps.formatCurrency(totalExportValue || 0))}</div>
                                <div class="finance-summary-meta">${deps.escapeHtml(Boolean(closeStatus.is_closed) ? "Day already closed." : closeReady ? "Validated and ready for export." : "Still waiting on explicit review and export completion.")}</div>
                            </div>
                            <div class="finance-drawer-actions">
                                ${renderActionButton({ label: previewLoaded ? "Refresh preview" : "Load preview", tone: "secondary", attrs: `data-load-cashbook-preview="${deps.escapeHtml(date)}"` })}
                                ${renderActionButton(exportAction)}
                                ${renderActionButton({ label: "Export pro shop CSV", tone: "secondary", attrs: `data-export-pro-shop="${deps.escapeHtml(date)}"` })}
                                ${renderActionButton(closeAction)}
                            </div>
                        </div>
                    </section>
                </aside>
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
        deps.invalidateCashbookPreview(deps.state.workspaceData?.date || deps.todayYmd());
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
        deps.invalidateCashbookPreview(date);
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
            const previewLoaded = Boolean(deps.state.workspaceData?.previewLoaded);
            const previewError = String(deps.state.workspaceData?.preview?._error || "").trim();
            const ledgerRows = Array.isArray(deps.state.workspaceData?.cashbookLedger?.ledger_entries) ? deps.state.workspaceData.cashbookLedger.ledger_entries : [];
            const unexportedCount = ledgerRows.filter(row => !Boolean(row?.finance_state?.exported)).length;
            const blockedCount = ledgerRows.filter(row => !Boolean(row?.finance_state?.exported) && !Boolean(row?.finance_state?.export_ready)).length;
            if (!previewLoaded) {
                deps.showToast("Load the journal preview before closing the day.", "bad");
                return;
            }
            if (previewError) {
                deps.showToast("Resolve the journal preview error before closing the day.", "bad");
                return;
            }
            if (blockedCount > 0) {
                deps.showToast("Resolve export blockers before closing the day.", "bad");
                return;
            }
            if (unexportedCount > 0) {
                deps.showToast("Export the daily CSV before closing the day.", "bad");
                return;
            }
        }
        if (!global.confirm(`Close ${safeDate} for day-end handover?`)) return;
        await deps.fetchJson(`/cashbook/close-day?close_date=${encodeURIComponent(safeDate)}`, { method: "POST" });
        deps.invalidateCashbookPreview(safeDate);
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Day closed.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function reopenCashbookDay(date, deps = {}) {
        const safeDate = String(date || deps.todayYmd()).trim() || deps.todayYmd();
        if (!global.confirm(`Reopen ${safeDate} for corrections?`)) return;
        await deps.fetchJson(`/cashbook/reopen-day?reopen_date=${encodeURIComponent(safeDate)}`, { method: "POST" });
        deps.invalidateCashbookPreview(safeDate);
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateClubSummaryCaches({ includeAlerts: true, includeFinanceBase: true });
        deps.showToast("Day reopened.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    async function loadCashbookPreview(date, deps = {}) {
        const safeDate = String(date || deps.todayYmd()).trim() || deps.todayYmd();
        deps.invalidateCashbookPreview(safeDate);
        await deps.loadSharedCashbookPreview({ date: safeDate });
        deps.showToast("Journal preview loaded.", "ok");
        await deps.refreshActiveReportsWorkspace();
    }

    global.GreenLinkAdminFinanceReporting = {
        closeCashbookDay,
        exportCashbookCsv,
        exportProShopCsv,
        loadCashbookPreview,
        recentLedgerWindow,
        renderCashbookWorkspace,
        renderLedgerWorkspace,
        repairLedgerBooking,
        reopenCashbookDay,
    };
})(window);
