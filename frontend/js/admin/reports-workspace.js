(function (global) {
    "use strict";

    async function bundle(options = {}, deps = {}) {
        const signal = options.signal;
        const panel = String(options.panel || deps.state?.route?.panel || "performance").trim().toLowerCase() || "performance";
        try {
            if (panel === "ledger") {
                const windowRange = deps.recentLedgerWindow();
                const financeBase = await deps.loadSharedFinanceBase({ signal });
                const financeDate = financeBase.closeStatus?.date || deps.todayYmd();
                const [ledger, ledgerBookings] = await Promise.all([
                    deps.fetchJsonSafe(
                        `/api/admin/ledger?limit=30&start=${encodeURIComponent(windowRange.start)}&end=${encodeURIComponent(windowRange.end)}`,
                        { ledger_entries: [], total: 0, total_amount: 0 },
                        { signal }
                    ),
                    deps.fetchJsonSafe(
                        `/api/admin/bookings?period=day&anchor_date=${encodeURIComponent(financeDate)}&date_basis=tee_time&sort=tee_asc&limit=100`,
                        { bookings: [], total: 0 },
                        { signal }
                    ),
                ]);
                return { panel, ...financeBase, ledger, ledgerBookings, date: financeDate };
            }
            if (panel === "cashbook") {
                const financeBase = await deps.loadSharedFinanceBase({ signal });
                const financeDate = financeBase.closeStatus?.date || deps.todayYmd();
                const dayStart = `${financeDate}T00:00:00.000Z`;
                const dayEnd = `${deps.addDaysYmd(financeDate, 1)}T00:00:00.000Z`;
                const [revenue, preview, proShop, cashbookLedger] = await Promise.all([
                    deps.loadSharedReportsRevenue({ signal, period: "wtd" }),
                    deps.fetchJsonSafe(`/cashbook/export-preview?export_date=${encodeURIComponent(financeDate)}`, { journal_lines: [] }, { signal }),
                    deps.fetchJsonSafe(`/cashbook/pro-shop-summary?summary_date=${encodeURIComponent(financeDate)}`, { transaction_count: 0, total_payments: 0 }, { signal }),
                    deps.fetchJsonSafe(`/api/admin/ledger?limit=300&start=${encodeURIComponent(dayStart)}&end=${encodeURIComponent(dayEnd)}`, { ledger_entries: [], total: 0, total_amount: 0 }, { signal }),
                ]);
                return { panel, ...financeBase, revenue, preview, proShop, cashbookLedger, date: financeDate };
            }
            if (panel === "imports") {
                const importsBundle = await deps.loadImportsWorkspaceBundle({ signal });
                return { panel, ...importsBundle };
            }
            if (panel === "targets") {
                const targets = await deps.loadSharedOperationalTargets({ signal, year: new Date().getFullYear() });
                return { panel, targets };
            }
            const [dashboard, revenue] = await Promise.all([
                deps.loadSharedDashboardPayload({ signal, view: "reports_performance" }),
                deps.loadSharedReportsRevenue({ signal, period: "mtd" }),
            ]);
            return { panel, dashboard, revenue };
        } catch (error) {
            deps.logClientError("reportsBundle", error, { loader: "reportsBundle", panel, route: deps.state?.route });
            throw error;
        }
    }

    function renderTargetsWorkspace(bundle, deps = {}) {
        const targets = Array.isArray(bundle.targets?.targets) ? bundle.targets.targets : [];
        return `
            ${deps.renderPageHero({
                title: "Targets",
                copy: "Keep operational targets available without forcing the rest of Finance & Admin to carry their load.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                metrics: [
                    { label: "Target Rows", value: deps.formatInteger(targets.length), meta: "Configured operational targets" },
                    { label: "Target Year", value: deps.escapeHtml(bundle.targets?.year || new Date().getFullYear()), meta: "Current operational target set" },
                    { label: "Finance Link", value: "Live", meta: "Finance and overview pacing read from current targets" },
                    { label: "Edit Surface", value: "Targets only", meta: "Changes here feed KPI cards and AI guidance" },
                ],
            })}
            ${bundle.targets?._error ? `<section class="card"><div class="empty-state">${deps.escapeHtml(bundle.targets._error)}</div></section>` : ""}
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h3>Operational target table</h3>
                        <p>Targets stay close to operations. Changes here should immediately influence the overview, finance pace, and AI guidance.</p>
                    </div>
                </div>
                ${deps.renderTable(
                    ["Operation", "Metric", "Target", "Unit"],
                    targets.map(row => `
                        <tr>
                            <td>${deps.escapeHtml(deps.MODULE_LABELS[row.operation_key] || row.operation_key)}</td>
                            <td>${deps.escapeHtml(row.label || row.metric_key || "")}</td>
                            <td>${deps.escapeHtml(deps.formatByUnit(row.target_value || 0, row.unit))}</td>
                            <td>${deps.escapeHtml(row.unit || "")}</td>
                        </tr>
                    `)
                )}
            </section>
        `;
    }

    function renderPerformanceWorkspace(bundle, deps = {}) {
        const revenue = bundle.revenue || {};
        const streamRows = Array.isArray(revenue.other_revenue_by_stream) ? revenue.other_revenue_by_stream : [];
        const paceVariance = deps.safeNumber(revenue.actual_revenue) - deps.safeNumber(revenue.target_revenue);
        return `
            ${deps.renderPageHero({
                title: "Finance Dashboard",
                copy: "Read finance signal, import freshness, and target pace without mixing in export actions.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: deps.renderInsightMeta("Pacing and integrity guidance live"),
                metrics: [
                    { label: "Period Days", value: deps.formatInteger(revenue.period_days || 0), meta: "Current revenue reporting window" },
                    { label: "Annual Target", value: deps.formatCurrency(revenue.annual_revenue_target || 0), meta: "Configured revenue target" },
                    { label: "Current Target Pace", value: revenue.target_revenue != null ? deps.formatCurrency(revenue.target_revenue) : "-", meta: "Expected position by this point in the year" },
                    { label: "Target Context", value: String(revenue.period || "mtd").toUpperCase(), meta: `Anchor ${deps.escapeHtml(revenue.anchor_date || "-")}` },
                ],
            })}
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Finance trend</h4>
                            <p>Paid golf plus imported non-booking revenue over the current reporting window.</p>
                        </div>
                    </div>
                    ${deps.renderFinanceTrendChart(revenue)}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Status revenue</h4>
                            <p>See where booking value is sitting by status across the current reporting window.</p>
                        </div>
                    </div>
                    ${deps.renderStatusBreakdown(bundle.dashboard || {})}
                </article>
            </section>
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Imported stream mix</h4>
                            <p>Imported non-golf revenue should stay visible next to golf and booking-driven revenue.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${streamRows.length ? streamRows.map(row => `
                            <div class="detail-row">
                                <span class="row-key">${deps.escapeHtml(deps.MODULE_LABELS[row.stream] || row.stream)}</span>
                                <span class="row-value">${deps.escapeHtml(deps.formatCurrency(row.amount || 0))} | ${deps.escapeHtml(deps.formatInteger(row.transactions || 0))} txns</span>
                            </div>
                        `).join("") : `<div class="empty-state">No imported non-golf revenue streams available.</div>`}
                    </div>
                </article>
                ${deps.renderImportFreshness(bundle.dashboard || {})}
            </section>
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Current revenue snapshot</h4>
                            <p>Keep today, week, golf, and pro shop revenue visible without leaving finance.</p>
                        </div>
                    </div>
                    ${deps.metricCards([
                        { label: "Today Revenue", value: deps.formatCurrency(bundle.dashboard?.today_revenue || 0), meta: "Current club snapshot" },
                        { label: "Week Revenue", value: deps.formatCurrency(bundle.dashboard?.week_revenue || 0), meta: "Rolling 7-day performance" },
                        { label: "Golf Revenue", value: deps.formatCurrency(bundle.dashboard?.golf_revenue_total || 0), meta: "Golf revenue total" },
                        { label: "Pro Shop Revenue", value: deps.formatCurrency(bundle.dashboard?.pro_shop_revenue_total || 0), meta: "Pro shop revenue total" },
                    ])}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Target pace</h4>
                            <p>Keep actuals, pace, and variance readable enough to guide action rather than add reporting noise.</p>
                        </div>
                    </div>
                    ${deps.metricCards([
                        { label: "Actual Revenue", value: deps.formatCurrency(revenue.actual_revenue || 0), meta: "Recorded actuals for this period" },
                        { label: "Target Pace", value: deps.formatCurrency(revenue.target_revenue || 0), meta: "Expected position at this point" },
                        { label: "Variance", value: deps.formatCurrency(paceVariance), meta: paceVariance >= 0 ? "Ahead of target pace" : "Behind target pace" },
                        { label: "Period Days", value: deps.formatInteger(revenue.period_days || 0), meta: "Days in current reporting window" },
                    ])}
                    ${deps.renderGuidanceStack(deps.revenueIntegrityGuidanceRows(bundle, { limit: 2 }))}
                </article>
            </section>
        `;
    }

    function renderWorkspace(bundle, deps = {}) {
        const panel = String(deps.state?.route?.panel || bundle.panel || "performance").trim().toLowerCase() || "performance";
        if (panel === "ledger") return deps.renderLedgerWorkspace(bundle);
        if (panel === "cashbook") return deps.renderCashbookWorkspace(bundle);
        if (panel === "imports") return deps.renderImportsWorkspace(bundle);
        if (panel === "targets") return renderTargetsWorkspace(bundle, deps);
        return renderPerformanceWorkspace(bundle, deps);
    }

    global.GreenLinkAdminReportsWorkspace = {
        bundle,
        renderWorkspace,
    };
})(window);
