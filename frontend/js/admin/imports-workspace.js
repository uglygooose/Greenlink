(function (global) {
    "use strict";

    function currentSettingsRows(state) {
        return Array.isArray(state?.workspaceData?.importSettings) ? state.workspaceData.importSettings : [];
    }

    function findSettingsRecord(state, stream) {
        const target = String(stream || "").trim().toLowerCase();
        return currentSettingsRows(state).find(row => String(row.stream || "").trim().toLowerCase() === target) || null;
    }

    function importSettingStreams(deps = {}) {
        const enabled = new Set(deps.clubModules());
        return ["golf", "pro_shop", "bowls", "pub", "other"].filter(stream => {
            if (["golf", "other"].includes(stream)) return true;
            return enabled.has(stream);
        });
    }

    async function bundle(options = {}, deps = {}) {
        const signal = options.signal;
        const financeBase = options.financeBase || await deps.loadSharedFinanceBase({ signal });
        const streamKeys = importSettingStreams(deps);
        const [imports, ...settingsRows] = await Promise.all([
            deps.fetchJsonSafe("/api/admin/imports?limit=12", { imports: [] }, { signal }),
            ...streamKeys.map(stream => deps.fetchJsonSafe(
                `/api/admin/imports/revenue-settings?stream=${encodeURIComponent(stream)}`,
                { stream, configured: false, settings: {} },
                { signal },
            )),
        ]);
        const importSettings = settingsRows;
        return {
            imports,
            importSettings,
            importsHealth: deps.summarizeImportsHealth(imports.imports, importSettings),
            settings: financeBase.settings,
            closeStatus: financeBase.closeStatus,
            summary: financeBase.summary,
            date: financeBase.closeStatus?.date || deps.todayYmd(),
        };
    }

    function renderWorkspace(bundle, deps = {}) {
        const rows = Array.isArray(bundle.imports?.imports) ? bundle.imports.imports : [];
        const settingsRows = Array.isArray(bundle.importSettings) ? bundle.importSettings : [];
        const summary = bundle.importsHealth || deps.summarizeImportsHealth(rows, settingsRows);
        const firstSettings = settingsRows[0] || { stream: "other", settings: {} };
        const initialSettings = firstSettings.settings || {};
        return `
            ${deps.renderPageHero({
                title: "Imports & Data Health",
                copy: "Keep stream mappings and import history clean enough that finance output can be trusted.",
                workspace: "reports",
                subnavLabel: "Finance pages",
                meta: deps.renderInsightMeta("Import freshness and mapping guidance live"),
                metrics: [
                    { label: "Recent Imports", value: deps.formatInteger(rows.length), meta: "Latest import batches in club scope" },
                    { label: "Configured Streams", value: deps.formatInteger(summary.configured_streams || 0), meta: `${deps.formatInteger(summary.total_streams || 0)} tracked streams` },
                    { label: "Mapping Gaps", value: deps.formatInteger(summary.stale_streams || 0), meta: "Streams needing attention" },
                    { label: "Booking Sync", value: deps.formatRelativeAge(summary.booking_sync_at), meta: summary.booking_sync_at ? deps.formatDateTime(summary.booking_sync_at) : "No recent booking import" },
                ],
                body: bundle.imports?._error ? `<div class="empty-state">${deps.escapeHtml(bundle.imports._error)}</div>` : "",
            })}
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Revenue stream mappings</h4>
                            <p>Mappings drive the export shape and keep club-specific reporting practical.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${settingsRows.length ? settingsRows.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${deps.escapeHtml(deps.MODULE_LABELS[row.stream] || row.stream || "Stream")}</span>
                                    ${deps.renderStatusPill("", row.configured ? "configured" : "missing")}
                                </div>
                                <div class="list-meta">${deps.escapeHtml(row.settings?.date_field || "No date field")} | ${deps.escapeHtml(row.settings?.amount_field || "No amount field")} | ${deps.escapeHtml(row.settings?.external_id_field || "No external ID field")}</div>
                                <div class="inline-actions">
                                    <button type="button" class="button secondary" data-edit-import-settings="${deps.escapeHtml(String(row.stream || "other"))}">Edit mapping</button>
                                </div>
                            </div>
                        `).join("") : `<div class="empty-state">No revenue stream mappings found.</div>`}
                    </div>
                </article>
                ${deps.renderImportsHealthCard(bundle)}
            </section>
            <section class="split-grid">
                <form class="form-card" id="import-settings-form">
                    <div class="panel-head">
                        <div>
                            <h3>Revenue mapping</h3>
                            <p>Save the fields GreenLink should use before the next revenue import for this stream.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field">
                            <label>Stream</label>
                            <select name="stream">
                                ${settingsRows.map(row => `<option value="${deps.escapeHtml(String(row.stream || "other"))}" ${row.stream === firstSettings.stream ? "selected" : ""}>${deps.escapeHtml(deps.MODULE_LABELS[row.stream] || row.stream || "Stream")}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field"><label>Date Field</label><input name="date_field" value="${deps.escapeHtml(initialSettings.date_field || "")}" required></div>
                        <div class="field"><label>Amount Field</label><input name="amount_field" value="${deps.escapeHtml(initialSettings.amount_field || "")}" required></div>
                        <div class="field"><label>Description Field</label><input name="description_field" value="${deps.escapeHtml(initialSettings.description_field || "")}"></div>
                        <div class="field"><label>Category Field</label><input name="category_field" value="${deps.escapeHtml(initialSettings.category_field || "")}"></div>
                        <div class="field"><label>External ID Field</label><input name="external_id_field" value="${deps.escapeHtml(initialSettings.external_id_field || "")}"></div>
                        <div class="field"><label>Stream Field</label><input name="stream_field" value="${deps.escapeHtml(initialSettings.stream_field || "")}"></div>
                        <div class="field"><label>Tax Field</label><input name="tax_field" value="${deps.escapeHtml(initialSettings.tax_field || "")}"></div>
                        <div class="field">
                            <label>Amount Sign</label>
                            <select name="amount_sign">
                                ${["as_is", "invert"].map(value => `<option value="${value}" ${String(initialSettings.amount_sign || "as_is") === value ? "selected" : ""}>${deps.escapeHtml(value)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Amount Basis</label>
                            <select name="amount_basis">
                                ${["gross", "net"].map(value => `<option value="${value}" ${String(initialSettings.amount_basis || "gross") === value ? "selected" : ""}>${deps.escapeHtml(value)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field">
                            <label>Tax Adjustment</label>
                            <select name="tax_adjustment">
                                ${["ignore", "add", "subtract"].map(value => `<option value="${value}" ${String(initialSettings.tax_adjustment || "ignore") === value ? "selected" : ""}>${deps.escapeHtml(value)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field"><label>Tax Rate</label><input name="tax_rate" type="number" min="0" step="0.01" value="${deps.escapeHtml(initialSettings.tax_rate ?? 0.15)}"></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="allow_stream_override" value="1" ${initialSettings.allow_stream_override ? "checked" : ""}> Allow stream override</label><p>Use a source field in the file when multiple streams are present.</p></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="dedupe_without_external_id" value="1" ${initialSettings.dedupe_without_external_id !== false ? "checked" : ""}> Dedupe without external ID</label><p>Create a best-effort fingerprint when the file has no unique transaction ID.</p></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save mapping</button>
                        <button type="button" class="button secondary" data-clear-import-settings-form="1">Reset</button>
                    </div>
                </form>
                <div class="stack">
                    <form class="form-card" id="import-revenue-form">
                        <div class="panel-head">
                            <div>
                                <h3>Import revenue CSV</h3>
                                <p>Run a club-scoped revenue import with current or saved mapping rules.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field">
                                <label>Stream</label>
                                <select name="stream">
                                    ${settingsRows.map(row => `<option value="${deps.escapeHtml(String(row.stream || "other"))}">${deps.escapeHtml(deps.MODULE_LABELS[row.stream] || row.stream || "Stream")}</option>`).join("")}
                                </select>
                            </div>
                            <div class="field" style="grid-column: 1 / -1;"><label>CSV File</label><input name="file" type="file" accept=".csv,text/csv" required></div>
                            <div class="checkbox-card"><label><input type="checkbox" name="use_saved_settings" value="1" checked> Use saved settings</label><p>Apply saved mapping rules for this stream where available.</p></div>
                            <div class="checkbox-card"><label><input type="checkbox" name="save_settings" value="1"> Save settings after import</label><p>Persist the detected or edited field mapping after this import.</p></div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Import revenue CSV</button>
                        </div>
                    </form>
                    <form class="form-card" id="import-members-form">
                        <div class="panel-head">
                            <div>
                                <h3>Import members CSV</h3>
                                <p>Refresh People data from a member export without leaving the finance data-health chain.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field" style="grid-column: 1 / -1;"><label>CSV File</label><input name="file" type="file" accept=".csv,text/csv" required></div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Import members CSV</button>
                        </div>
                    </form>
                </div>
            </section>
            <section class="dashboard-grid">
                ${deps.renderAccountingWorkflowCard(bundle)}
                ${deps.renderAccountingHandoffCard(bundle)}
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Recent import batches</h4>
                        <p>Import history should stay visible so operations and finance can trust the reporting chain.</p>
                    </div>
                </div>
                ${deps.renderTable(
                    ["Imported", "Kind", "Source", "Rows", "Notes"],
                    rows.length ? rows.map(row => `
                        <tr>
                            <td>${deps.escapeHtml(deps.formatDateTime(row.imported_at || ""))}</td>
                            <td>${deps.escapeHtml(row.kind || "-")}</td>
                            <td>${deps.escapeHtml(row.source || row.file_name || "-")}</td>
                            <td>${deps.escapeHtml(`${deps.formatInteger(row.rows_inserted || 0)} / ${deps.formatInteger(row.rows_total || 0)}`)}</td>
                            <td>${deps.escapeHtml(row.notes || "-")}</td>
                        </tr>
                    `) : [`<tr><td colspan="5"><div class="empty-state">No import batches found for this club.</div></td></tr>`]
                )}
            </section>
        `;
    }

    function resetSettingsForm(form = global.document.getElementById("import-settings-form"), deps = {}) {
        if (!(form instanceof global.HTMLFormElement)) return;
        const row = currentSettingsRows(deps.state)[0] || { stream: "other", settings: {} };
        const settings = row.settings || {};
        form.reset();
        if (form.stream) form.stream.value = String(row.stream || "other");
        if (form.date_field) form.date_field.value = String(settings.date_field || "");
        if (form.amount_field) form.amount_field.value = String(settings.amount_field || "");
        if (form.description_field) form.description_field.value = String(settings.description_field || "");
        if (form.category_field) form.category_field.value = String(settings.category_field || "");
        if (form.external_id_field) form.external_id_field.value = String(settings.external_id_field || "");
        if (form.stream_field) form.stream_field.value = String(settings.stream_field || "");
        if (form.tax_field) form.tax_field.value = String(settings.tax_field || "");
        if (form.amount_sign) form.amount_sign.value = String(settings.amount_sign || "as_is");
        if (form.amount_basis) form.amount_basis.value = String(settings.amount_basis || "gross");
        if (form.tax_adjustment) form.tax_adjustment.value = String(settings.tax_adjustment || "ignore");
        if (form.tax_rate) form.tax_rate.value = String(settings.tax_rate ?? 0.15);
        if (form.allow_stream_override) form.allow_stream_override.checked = Boolean(settings.allow_stream_override);
        if (form.dedupe_without_external_id) form.dedupe_without_external_id.checked = settings.dedupe_without_external_id !== false;
    }

    function loadSettingsIntoForm(stream, deps = {}) {
        const row = findSettingsRecord(deps.state, stream);
        const form = deps.document.getElementById("import-settings-form");
        if (!row || !(form instanceof global.HTMLFormElement)) return;
        const settings = row.settings || {};
        form.stream.value = String(row.stream || "other");
        form.date_field.value = String(settings.date_field || "");
        form.amount_field.value = String(settings.amount_field || "");
        form.description_field.value = String(settings.description_field || "");
        form.category_field.value = String(settings.category_field || "");
        form.external_id_field.value = String(settings.external_id_field || "");
        form.stream_field.value = String(settings.stream_field || "");
        form.tax_field.value = String(settings.tax_field || "");
        form.amount_sign.value = String(settings.amount_sign || "as_is");
        form.amount_basis.value = String(settings.amount_basis || "gross");
        form.tax_adjustment.value = String(settings.tax_adjustment || "ignore");
        form.tax_rate.value = String(settings.tax_rate ?? 0.15);
        form.allow_stream_override.checked = Boolean(settings.allow_stream_override);
        form.dedupe_without_external_id.checked = settings.dedupe_without_external_id !== false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function submitSettingsForm(form, deps = {}) {
        const stream = String(form.stream.value || "other").trim().toLowerCase();
        const payload = {
            date_field: String(form.date_field.value || "").trim() || null,
            amount_field: String(form.amount_field.value || "").trim() || null,
            description_field: String(form.description_field.value || "").trim() || null,
            category_field: String(form.category_field.value || "").trim() || null,
            external_id_field: String(form.external_id_field.value || "").trim() || null,
            stream_field: String(form.stream_field.value || "").trim() || null,
            tax_field: String(form.tax_field.value || "").trim() || null,
            amount_sign: String(form.amount_sign.value || "as_is").trim() || "as_is",
            amount_basis: String(form.amount_basis.value || "gross").trim() || "gross",
            tax_adjustment: String(form.tax_adjustment.value || "ignore").trim() || "ignore",
            tax_rate: Number(form.tax_rate.value || 0.15),
            allow_stream_override: Boolean(form.allow_stream_override.checked),
            dedupe_without_external_id: Boolean(form.dedupe_without_external_id.checked),
        };
        await deps.postJson(`/api/admin/imports/revenue-settings?stream=${encodeURIComponent(stream)}`, payload, { method: "PUT", invalidateCache: false });
        deps.invalidateImportsWorkspaceSharedBundle();
        deps.invalidateWorkspaceScope("reports", { panel: "imports" });
        deps.invalidateWorkspaceScope("settings", { panel: "imports" });
        deps.showToast(`${deps.MODULE_LABELS[stream] || stream} mapping saved.`, "ok");
        await (deps.state.route?.workspace === "reports"
            ? deps.refreshActiveReportsWorkspace()
            : deps.refreshActiveSettingsWorkspace());
    }

    async function submitRevenueForm(form, deps = {}) {
        const file = form.file instanceof global.HTMLInputElement ? form.file.files?.[0] : null;
        if (!file) throw new Error("Choose a revenue CSV file first.");
        const stream = String(form.stream.value || "other").trim().toLowerCase();
        const query = new URLSearchParams({
            stream,
            use_saved_settings: form.use_saved_settings?.checked ? "true" : "false",
            save_settings: form.save_settings?.checked ? "true" : "false",
        });
        const body = new FormData();
        body.append("file", file);
        const result = await deps.postFormData(`/api/admin/imports/revenue-csv?${query.toString()}`, body, { invalidateCache: false });
        deps.invalidateImportsWorkspaceSharedBundle();
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateWorkspaceScope("settings", { panel: "imports" });
        deps.invalidateClubSummaryCaches({ includeDashboard: true, includeAlerts: true });
        deps.showToast(`Revenue import saved: ${deps.formatInteger(result?.rows_inserted || 0)} inserted, ${deps.formatInteger(result?.rows_updated || 0)} updated.`, "ok");
        form.reset();
        if (form.use_saved_settings) form.use_saved_settings.checked = true;
        await (deps.state.route?.workspace === "reports"
            ? deps.refreshActiveReportsWorkspace()
            : deps.refreshActiveSettingsWorkspace());
    }

    async function submitMembersForm(form, deps = {}) {
        const file = form.file instanceof global.HTMLInputElement ? form.file.files?.[0] : null;
        if (!file) throw new Error("Choose a members CSV file first.");
        const body = new FormData();
        body.append("file", file);
        const result = await deps.postFormData("/api/admin/imports/members-csv", body, { invalidateCache: false });
        deps.invalidateImportsWorkspaceSharedBundle();
        deps.invalidateMemberAreaPreview();
        deps.invalidateRecentMembersPreview();
        deps.invalidateWorkspaceScope("reports", { panel: "imports" });
        deps.invalidateWorkspaceScope("settings", { panel: "imports" });
        deps.showToast(`Members import saved: ${deps.formatInteger(result?.rows_inserted || 0)} inserted, ${deps.formatInteger(result?.rows_updated || 0)} updated.`, "ok");
        form.reset();
        deps.deleteWorkspaceCacheWhere(key => {
            const [shell, workspace] = String(key || "").split("|");
            return shell === deps.roleShell() && workspace === "members";
        });
        await (deps.state.route?.workspace === "reports"
            ? deps.refreshActiveReportsWorkspace()
            : deps.refreshActiveSettingsWorkspace());
    }

    global.GreenLinkAdminImportsWorkspace = {
        bundle,
        loadSettingsIntoForm,
        renderWorkspace,
        resetSettingsForm,
        submitMembersForm,
        submitRevenueForm,
        submitSettingsForm,
    };
})(window);
