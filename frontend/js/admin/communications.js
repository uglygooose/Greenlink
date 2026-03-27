(function (global) {
    "use strict";

    function currentCommunicationRows(state) {
        return Array.isArray(state?.workspaceData?.communications?.communications)
            ? state.workspaceData.communications.communications
            : [];
    }

    function findCommunicationRecord(state, communicationId) {
        return currentCommunicationRows(state).find(row => Number(row.id) === Number(communicationId)) || null;
    }

    async function bundle(options = {}, deps = {}) {
        const signal = options.signal;
        const shell = deps.roleShell();
        const date = deps.todayYmd();
        const [alerts, financeBase, communications, members] = await Promise.all([
            deps.loadOperationalAlertsShared({ signal }),
            shell === "club_admin"
                ? deps.loadSharedFinanceBase({ signal })
                : Promise.resolve(deps.emptyFinanceBasePayload(date)),
            deps.loadSharedCommunicationsWorkspaceList({ signal, publishedOnly: shell === "staff" }),
            deps.loadSharedRecentMembersPreview({ signal }),
        ]);
        return {
            alerts,
            closeStatus: financeBase.closeStatus,
            communications,
            members,
            date,
        };
    }

    function renderCommunicationsCadenceCard(payload, deps = {}) {
        const rows = Array.isArray(payload.communications?.communications) ? payload.communications.communications : [];
        const alerts = payload.alerts || {};
        const closeMeta = deps.closeStatusMeta(payload);
        const highAlerts = Number(alerts?.summary?.high || 0);
        const alertsMeta = alerts?._error
            ? "Operational alerts are temporarily unavailable."
            : "Operational blockers that may require a notice";
        const publishedToday = rows.filter(row => {
            const stamp = deps.toDate(row.published_at || row.updated_at);
            if (!stamp) return false;
            return stamp.toDateString() === new Date().toDateString();
        }).length;
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Message summary</h4>
                        <p>Club communications should support the day's run-sheet: live notices, operational blockers, and clean handover when finance closes.</p>
                    </div>
                </div>
                ${deps.metricCards([
                    { label: "Published Today", value: deps.formatInteger(publishedToday), meta: "Messages pushed during the current day" },
                    { label: "Pinned Notices", value: deps.formatInteger(rows.filter(row => Boolean(row.pinned)).length), meta: "Priority notices still surfaced" },
                    { label: "High Alerts", value: deps.formatInteger(highAlerts), meta: alertsMeta },
                    { label: "Day Close", value: closeMeta.label, meta: closeMeta.detail },
                ])}
            </article>
        `;
    }

    function renderAudienceFollowupCard(payload, deps = {}) {
        const rows = Array.isArray(payload.members?.members) ? payload.members.members : [];
        const flagged = rows.filter(row => ["hold", "inactive", "defaulter"].includes(String(row.membership_status || "").toLowerCase()));
        const golfDemand = rows.filter(row => String(row.primary_operation || "").toLowerCase() === "golf" && Number(row.bookings_count || 0) >= 2);
        const highValue = rows
            .slice()
            .sort((left, right) => Number(right.total_spent || 0) - Number(left.total_spent || 0))
            .slice(0, 4);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Audience follow-up</h4>
                        <p>Messages should reflect real club demand: flagged members, active golf traffic, and high-value guests who need clean communication.</p>
                    </div>
                </div>
                ${deps.metricCards([
                    { label: "Flagged Members", value: deps.formatInteger(flagged.length), meta: "Hold, inactive, or defaulter states" },
                    { label: "Golf Demand", value: deps.formatInteger(golfDemand.length), meta: "Golf-linked members with current booking activity" },
                    { label: "Recent Members", value: deps.formatInteger(rows.length), meta: "Latest member records in service scope" },
                    { label: "Top Spenders", value: deps.formatInteger(highValue.length), meta: "Recent high-value member records" },
                ])}
                <div class="stack">
                    ${highValue.length ? highValue.map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${deps.escapeHtml(row.name || "Member")}</span>
                                ${deps.renderStatusPill("", row.membership_status || "active")}
                            </div>
                            <div class="list-meta">${deps.escapeHtml([
                                row.member_number || row.email || "",
                                deps.MODULE_LABELS[row.primary_operation] || row.primary_operation || "",
                                `${deps.formatInteger(row.bookings_count || 0)} booking(s)`,
                                deps.formatCurrency(row.total_spent || 0),
                            ].filter(Boolean).join(" | "))}</div>
                        </div>
                    `).join("") : `<div class="empty-state">No member follow-up records are available yet.</div>`}
                </div>
            </article>
        `;
    }

    function renderWorkspace(payload, deps = {}) {
        const rows = Array.isArray(payload.communications?.communications) ? payload.communications.communications : [];
        const canEdit = deps.roleShell() === "club_admin";
        const published = rows.filter(row => String(row.status || "").toLowerCase() === "published").length;
        const drafts = rows.filter(row => String(row.status || "").toLowerCase() === "draft").length;
        const pinned = rows.filter(row => Boolean(row.pinned)).length;
        const memberNews = rows.filter(row => String(row.kind || "").toLowerCase() === "news" || ["members", "all"].includes(String(row.audience || "").toLowerCase()));
        const operationalRows = rows.filter(row => String(row.kind || "").toLowerCase() !== "news");
        const healthPercent = rows.length ? Math.round((published / rows.length) * 100) : 0;
        return `
            ${deps.renderPageHero({
                title: "Communications",
                copy: "Manage current club notices and message status from one operating page.",
                metrics: [
                    { label: "Messages", value: deps.formatInteger(rows.length), meta: "Total club communications" },
                    { label: "Published", value: deps.formatInteger(published), meta: "Visible to members or staff" },
                    { label: "Drafts", value: deps.formatInteger(drafts), meta: "Still being prepared" },
                    { label: "Pinned", value: deps.formatInteger(pinned), meta: "Priority notices pinned to the top" },
                ],
            })}
            <section class="communications-shell">
                <nav class="communications-tabs" aria-label="Communications sections">
                    <span class="communications-tab active">All Messages</span>
                    <span class="communications-tab">Member News</span>
                    <span class="communications-tab">Operational Notices</span>
                </nav>
                <section class="communications-summary-row">
                    <article class="communications-summary-card">
                        <div class="communications-summary-head">
                            <div class="communications-summary-label">Communication health</div>
                            <span class="communications-summary-kicker">CM</span>
                        </div>
                        <div class="communications-summary-value">${deps.escapeHtml(`${deps.formatInteger(healthPercent)}% live`)}</div>
                        <div class="communications-summary-meta">${deps.escapeHtml(rows.length ? `${deps.formatInteger(published)} of ${deps.formatInteger(rows.length)} message(s) are currently published.` : "No messages have been created for this club yet.")}</div>
                        <div class="communications-summary-progress"><span style="width:${Math.max(10, healthPercent)}%"></span></div>
                    </article>
                    <article class="communications-summary-card">
                        <div class="communications-summary-head">
                            <div class="communications-summary-label">Published</div>
                            <span class="communications-summary-kicker">PB</span>
                        </div>
                        <div class="communications-summary-value">${deps.escapeHtml(deps.formatInteger(published))}</div>
                        <div class="communications-summary-meta">Visible to members or staff right now.</div>
                    </article>
                    <article class="communications-summary-card">
                        <div class="communications-summary-head">
                            <div class="communications-summary-label">Drafts / pinned</div>
                            <span class="communications-summary-kicker">DR</span>
                        </div>
                        <div class="communications-summary-value">${deps.escapeHtml(`${deps.formatInteger(drafts)} / ${deps.formatInteger(pinned)}`)}</div>
                        <div class="communications-summary-meta">Drafts still being prepared and priority messages pinned.</div>
                    </article>
                </section>
                <section class="communications-main-grid">
                    <div class="communications-main-stack">
                        <section class="communications-table-card">
                            <div class="panel-head">
                                <div>
                                    <h4>Recent communications</h4>
                                    <p>Current club messages stay visible as an operational list, not just an editor.</p>
                                </div>
                            </div>
                            ${rows.length ? `
                                <div class="table-scroll">
                                    <table class="communications-table">
                                        <thead>
                                            <tr>
                                                <th>Status</th>
                                                <th>Title</th>
                                                <th>Audience</th>
                                                <th>Date</th>
                                                <th>Type</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${rows.slice(0, 8).map(row => `
                                                <tr>
                                                    <td>${deps.renderStatusPill("", row.status || "draft")}</td>
                                                    <td>
                                                        <button type="button" class="communications-table-link" ${canEdit ? `data-edit-communication="${deps.escapeHtml(String(row.id))}"` : "disabled aria-disabled=\"true\""}>${deps.escapeHtml(row.title || "Communication")}</button>
                                                        <div class="list-meta">${deps.escapeHtml(row.summary || row.body || "")}</div>
                                                    </td>
                                                    <td>${deps.escapeHtml(row.audience || "members")}</td>
                                                    <td>${deps.escapeHtml(deps.formatDate(row.published_at || row.updated_at || payload.date))}</td>
                                                    <td>${deps.escapeHtml(row.kind || "announcement")}${row.pinned ? " / pinned" : ""}</td>
                                                </tr>
                                            `).join("")}
                                        </tbody>
                                    </table>
                                </div>
                            ` : `<div class="empty-state">No communications found for this club.</div>`}
                        </section>
                        <section class="communications-feed-grid">
                            <article class="communications-feed-card">
                                <div class="panel-head">
                                    <div>
                                        <h4>Member news</h4>
                                        <p>Member-facing stories use the same calm card language as the benchmark feed.</p>
                                    </div>
                                </div>
                                <div class="communications-list-stack">
                                    ${memberNews.length ? memberNews.slice(0, 3).map((row, index) => `
                                        <article class="communications-story-card ${index === 0 ? "featured" : ""}">
                                            <div class="communications-story-top">
                                                <span class="communications-story-meta">${deps.escapeHtml(`${row.kind || "message"} / ${deps.formatDateTime(row.published_at || row.updated_at)}`)}</span>
                                                ${deps.renderStatusPill("", row.status || "draft")}
                                            </div>
                                            <div class="list-title">${deps.escapeHtml(row.title || "Member update")}</div>
                                            <div class="list-meta">${deps.escapeHtml(row.summary || row.body || "")}</div>
                                            ${canEdit ? `<div class="inline-actions"><button type="button" class="button ghost" data-edit-communication="${deps.escapeHtml(String(row.id))}">Edit post</button></div>` : ""}
                                        </article>
                                    `).join("") : `<div class="empty-state">No member news is ready yet.</div>`}
                                </div>
                            </article>
                            <article class="communications-feed-card">
                                <div class="panel-head">
                                    <div>
                                        <h4>Operational notices</h4>
                                        <p>GreenLink-specific publishing work stays in the same benchmark family instead of a second admin style.</p>
                                    </div>
                                </div>
                                <div class="communications-dropzone">
                                    <div>
                                        <strong>${deps.escapeHtml(operationalRows.length ? `${deps.formatInteger(operationalRows.length)} notice(s) in play` : "No active operational notices")}</strong>
                                        <div class="list-meta">${deps.escapeHtml(canEdit ? "Use the editor or state controls to publish, archive, or pin the next notice." : "Staff can read current published notices from this surface.")}</div>
                                    </div>
                                </div>
                                <div class="communications-list-stack">
                                    ${operationalRows.slice(0, 3).map(row => `
                                        <div class="list-row">
                                            <div class="list-row-top">
                                                <span class="list-title">${deps.escapeHtml(row.title || "Operational notice")}</span>
                                                ${deps.renderStatusPill("", row.status || "draft")}
                                            </div>
                                            <div class="list-meta">${deps.escapeHtml(`${row.audience || "members"} / ${row.pinned ? "Pinned" : "Standard"} / ${deps.formatDateTime(row.published_at || row.updated_at)}`)}</div>
                                        </div>
                                    `).join("") || `<div class="empty-state">No operational notices are visible yet.</div>`}
                                </div>
                            </article>
                        </section>
                    </div>
                    <div class="communications-rail-stack">
                        ${canEdit ? `
                            <form class="communications-editor-card" id="communication-form">
                                <input type="hidden" name="communication_id" value="">
                                <div class="panel-head">
                                    <div>
                                        <h3>Create or update communication</h3>
                                        <p>Draft, publish, pin, and archive control stays intact inside the benchmark shell.</p>
                                    </div>
                                </div>
                                <div class="field-grid">
                                    <div class="field">
                                        <label>Kind</label>
                                        <select name="kind">
                                            <option value="announcement">Announcement</option>
                                            <option value="news">News</option>
                                            <option value="message">Message</option>
                                        </select>
                                    </div>
                                    <div class="field">
                                        <label>Audience</label>
                                        <select name="audience">
                                            <option value="members">Members</option>
                                            <option value="staff">Staff</option>
                                            <option value="all">All</option>
                                        </select>
                                    </div>
                                    <div class="field">
                                        <label>Status</label>
                                        <select name="status">
                                            <option value="draft">Draft</option>
                                            <option value="published">Published</option>
                                            <option value="archived">Archived</option>
                                        </select>
                                    </div>
                                    <div class="checkbox-card">
                                        <label><input type="checkbox" name="pinned" value="1"> Pin message</label>
                                        <p>Pinned items stay at the top of member or staff feeds.</p>
                                    </div>
                                    <div class="field"><label>Title</label><input name="title" required></div>
                                    <div class="field"><label>Summary</label><input name="summary"></div>
                                    <div class="field"><label>CTA Label</label><input name="cta_label"></div>
                                    <div class="field"><label>CTA URL</label><input name="cta_url"></div>
                                    <div class="field"><label>Expires At</label><input name="expires_at" type="datetime-local"></div>
                                    <div class="field" style="grid-column: 1 / -1;">
                                        <label>Body</label>
                                        <textarea name="body" required></textarea>
                                    </div>
                                </div>
                                <div class="button-row">
                                    <button type="submit" class="button">Save communication</button>
                                    <button type="button" class="button secondary" data-clear-communication-form="1">Clear</button>
                                </div>
                            </form>
                        ` : `
                            <section class="communications-management-card">
                                <div class="panel-head">
                                    <div>
                                        <h3>Staff view</h3>
                                        <p>Staff can read published club notices without receiving admin-only messaging controls.</p>
                                    </div>
                                </div>
                                <div class="detail-row"><span class="row-key">Scope</span><span class="row-value">Published communications only</span></div>
                            </section>
                        `}
                        <section class="communications-management-card">
                            <div class="panel-head">
                                <div>
                                    <h3>Manage message state</h3>
                                    <p>Edit the current record, publish it, archive it, or change pin state without leaving the page.</p>
                                </div>
                            </div>
                            <div class="communications-list-stack">
                                ${rows.length ? rows.map(row => `
                                    <div class="list-row">
                                        <div class="list-row-top">
                                            <span class="list-title">${deps.escapeHtml(`${row.title || "Communication"} #${row.id || "-"}`)}</span>
                                            ${deps.renderStatusPill("", row.status || "draft")}
                                        </div>
                                        <div class="list-meta">${deps.escapeHtml(`${row.kind || ""} / ${row.audience || ""} / ${row.pinned ? "Pinned" : "Not pinned"}`)}</div>
                                        ${canEdit ? `
                                            <div class="inline-actions">
                                                <button type="button" class="button secondary" data-edit-communication="${deps.escapeHtml(String(row.id))}">Edit</button>
                                                <button type="button" class="button ghost" data-communication-status="${deps.escapeHtml(String(row.id))}" data-status-value="published">Publish</button>
                                                <button type="button" class="button ghost" data-communication-status="${deps.escapeHtml(String(row.id))}" data-status-value="archived">Archive</button>
                                                <button type="button" class="button ghost" data-communication-pin="${deps.escapeHtml(String(row.id))}" data-pin-value="${row.pinned ? "0" : "1"}">${row.pinned ? "Unpin" : "Pin"}</button>
                                            </div>
                                        ` : ""}
                                    </div>
                                `).join("") : `<div class="empty-state">No communication records available to manage.</div>`}
                            </div>
                        </section>
                        ${renderCommunicationsCadenceCard(payload, deps)}
                        ${renderAudienceFollowupCard(payload, deps)}
                    </div>
                </section>
            </section>
        `;
    }

    function resetForm(form = global.document.getElementById("communication-form")) {
        if (!(form instanceof global.HTMLFormElement)) return;
        form.reset();
        if (form.communication_id) form.communication_id.value = "";
        if (form.status) form.status.value = "draft";
        if (form.audience) form.audience.value = "members";
        if (form.kind) form.kind.value = "announcement";
        if (form.expires_at) form.expires_at.value = "";
    }

    function editRecord(communicationId, deps = {}) {
        const row = findCommunicationRecord(deps.state, communicationId);
        const doc = deps.document || global.document;
        const form = doc.getElementById("communication-form");
        if (!row || !(form instanceof global.HTMLFormElement)) return;
        form.communication_id.value = String(row.id || "");
        form.kind.value = String(row.kind || "announcement");
        form.audience.value = String(row.audience || "members");
        form.status.value = String(row.status || "draft");
        form.title.value = String(row.title || "");
        form.summary.value = String(row.summary || "");
        form.body.value = String(row.body || "");
        form.cta_label.value = String(row.cta_label || "");
        form.cta_url.value = String(row.cta_url || "");
        form.expires_at.value = deps.toDateTimeLocalValue(row.expires_at);
        form.pinned.checked = Boolean(row.pinned);
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function updateState(communicationId, patch = {}, deps = {}) {
        const row = findCommunicationRecord(deps.state, communicationId);
        if (!row) throw new Error("Communication not found.");
        const payload = {
            kind: String(row.kind || "announcement"),
            audience: String(row.audience || "members"),
            status: String(patch.status || row.status || "draft"),
            title: String(row.title || ""),
            summary: String(row.summary || "").trim() || null,
            body: String(row.body || ""),
            cta_label: String(row.cta_label || "").trim() || null,
            cta_url: String(row.cta_url || "").trim() || null,
            pinned: Object.prototype.hasOwnProperty.call(patch, "pinned") ? Boolean(patch.pinned) : Boolean(row.pinned),
            published_at: row.published_at || null,
            expires_at: row.expires_at || null,
        };
        await deps.postJson(`/api/admin/communications/${Number(communicationId)}`, payload, { method: "PUT" });
        deps.showToast("Communication updated.", "ok");
        deps.invalidateCommunicationsWorkspaceList();
        await deps.refreshActiveCommunicationsWorkspace();
    }

    async function submitForm(form, deps = {}) {
        const communicationId = deps.positiveInt(form.communication_id?.value);
        const payload = {
            kind: String(form.kind.value || "announcement").trim(),
            audience: String(form.audience.value || "members").trim(),
            status: String(form.status.value || "draft").trim(),
            title: String(form.title.value || "").trim(),
            summary: String(form.summary.value || "").trim() || null,
            body: String(form.body.value || "").trim(),
            cta_label: String(form.cta_label?.value || "").trim() || null,
            cta_url: String(form.cta_url?.value || "").trim() || null,
            pinned: Boolean(form.pinned.checked),
            expires_at: form.expires_at?.value ? new Date(form.expires_at.value).toISOString() : null,
        };
        if (communicationId) {
            await deps.postJson(`/api/admin/communications/${communicationId}`, payload, { method: "PUT" });
            deps.showToast("Communication updated.", "ok");
        } else {
            await deps.postJson("/api/admin/communications", payload);
            deps.showToast("Communication saved.", "ok");
        }
        resetForm(form);
        deps.invalidateCommunicationsWorkspaceList();
        await deps.refreshActiveCommunicationsWorkspace();
    }

    global.GreenLinkAdminCommunications = {
        bundle,
        renderWorkspace,
        resetForm,
        editRecord,
        updateState,
        submitForm,
    };
})(window);
