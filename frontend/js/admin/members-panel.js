(function (global) {
    "use strict";

    function defaultMembersUi(source = null) {
        return {
            query: String(source?.query || "").trim(),
            status: ["all", "active", "hold", "inactive", "resigned", "defaulter"].includes(String(source?.status || "").trim().toLowerCase())
                ? String(source.status).trim().toLowerCase()
                : "all",
        };
    }

    function renderMembersSearchForm(bundle, deps = {}, options = {}) {
        const membersUi = defaultMembersUi(bundle.membersUi);
        const rows = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
        const total = Number(bundle.members?.total || rows.length || 0);
        const embedded = Boolean(options.embedded);
        return `
            <form class="${embedded ? "workblock-form" : "form-card"}" id="members-search-form">
                ${embedded ? "" : `
                    <div class="panel-head">
                        <div>
                            <h3>People search</h3>
                            <p>Open this workspace ready to search first, then narrow by status without loading a giant raw member dump.</p>
                        </div>
                    </div>
                `}
                <div class="field-grid">
                    <div class="field">
                        <label>Search people</label>
                        <input name="q" value="${deps.escapeHtml(membersUi.query)}" placeholder="Name, member number, email, phone">
                    </div>
                    <div class="field">
                        <label>Status</label>
                        <select name="membership_status">
                            ${[
                                ["all", "All statuses"],
                                ["active", "Active"],
                                ["hold", "Hold"],
                                ["inactive", "Inactive"],
                                ["defaulter", "Defaulter"],
                                ["resigned", "Resigned"],
                            ].map(([value, label]) => `<option value="${deps.escapeHtml(value)}" ${membersUi.status === value ? "selected" : ""}>${deps.escapeHtml(label)}</option>`).join("")}
                        </select>
                    </div>
                </div>
                <div class="button-row">
                    <button type="submit" class="button">Search people</button>
                    <button type="button" class="button secondary" data-clear-members-search="1">Clear search</button>
                    <span class="panel-note">${deps.escapeHtml(membersUi.query ? `Showing ${deps.formatInteger(rows.length)} of ${deps.formatInteger(total)} matching people.` : `Showing ${deps.formatInteger(rows.length)} recent people in club scope.`)}</span>
                </div>
            </form>
        `;
    }

    function renderMemberRowsTable(rows, deps = {}, options = {}) {
        const items = Array.isArray(rows) ? rows : [];
        const limit = Number(options.limit || 0);
        const visible = limit > 0 ? items.slice(0, limit) : items;
        const emptyText = String(options.emptyText || "No members found.").trim();
        return deps.renderTable(
            ["Member", "Operation", "Status", "Bookings", "Spend"],
            visible.length ? visible.map(row => `
                <tr>
                    <td><strong>${deps.escapeHtml(row.name || "")}</strong><div class="table-meta">${deps.escapeHtml(row.member_number || row.email || "")}</div></td>
                    <td>${deps.escapeHtml(deps.MODULE_LABELS[row.primary_operation] || row.primary_operation || "-")}</td>
                    <td>${deps.escapeHtml(row.membership_status || "-")}</td>
                    <td>${deps.escapeHtml(deps.formatInteger(row.bookings_count || 0))}</td>
                    <td>${deps.escapeHtml(deps.formatCurrency(row.total_spent || 0))}</td>
                </tr>
            `) : [`<tr><td colspan="5"><div class="empty-state">${deps.escapeHtml(emptyText)}</div></td></tr>`]
        );
    }

    function renderMemberCreateForm(deps = {}, options = {}) {
        const embedded = Boolean(options.embedded);
        const formClass = embedded ? "workblock-form" : "form-card";
        const inner = `
            <div class="field-grid">
                <div class="field"><label>First Name</label><input name="first_name" required></div>
                <div class="field"><label>Last Name</label><input name="last_name" required></div>
                <div class="field"><label>Email</label><input name="email" type="email"></div>
                <div class="field"><label>Member Number</label><input name="member_number"></div>
                <div class="field">
                    <label>Primary Operation</label>
                    <select name="primary_operation">
                        <option value="golf">Golf</option>
                        ${deps.operationModules().map(key => `<option value="${deps.escapeHtml(key)}">${deps.escapeHtml(deps.MODULE_LABELS[key] || key)}</option>`).join("")}
                    </select>
                </div>
                <div class="field"><label>Home Club</label><input name="home_club" value="${deps.escapeHtml(deps.activeClub()?.display_name || deps.activeClub()?.name || "")}"></div>
            </div>
            <div class="button-row">
                <button type="submit" class="button">Create member</button>
            </div>
        `;
        if (embedded) {
            return `<form class="${formClass}" id="member-form">${inner}</form>`;
        }
        return `
            <form class="${formClass}" id="member-form">
                <div class="panel-head">
                    <div>
                        <h3>Add member</h3>
                        <p>Fast club-side member creation with the fields staff actually use first.</p>
                    </div>
                </div>
                ${inner}
            </form>
        `;
    }

    function renderLegacyPanel(bundle, deps = {}) {
        const rows = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
        const accountCustomers = Array.isArray(bundle.accountCustomers?.account_customers) ? bundle.accountCustomers.account_customers : [];
        const activeCount = rows.filter(row => String(row.membership_status || "").toLowerCase() === "active").length;
        const flaggedCount = rows.filter(row => ["hold", "inactive", "defaulter", "resigned"].includes(String(row.membership_status || "").toLowerCase())).length;
        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>People</h3>
                        <p>Search first, then act. Member context, debtor readiness, and service pressure should sit together without opening a giant raw list by default.</p>
                    </div>
                </div>
                ${deps.metricCards([
                    { label: bundle.membersUi?.query ? "Matches" : "People", value: deps.formatInteger(bundle.membersUi?.query ? (bundle.members?.total || rows.length) : rows.length), meta: bundle.membersUi?.query ? "Matching people in current club scope" : "Recent member rows in club scope" },
                    { label: "Active", value: deps.formatInteger(activeCount), meta: "Active memberships" },
                    { label: "Flagged", value: deps.formatInteger(flaggedCount), meta: "Hold, inactive, or defaulter states" },
                    { label: "Debtor Accounts", value: deps.formatInteger(accountCustomers.length), meta: "Active account-customer records" },
                ])}
                ${deps.renderPeopleControlCards()}
            </section>
            ${renderMembersSearchForm(bundle, deps)}
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>${bundle.membersUi?.query ? "People search results" : "Recent member service board"}</h4>
                            <p>${bundle.membersUi?.query ? "Search results stay operational: member context, booking demand, and service risk in one table." : "Recent activity, spend, and operation context stay visible before you drop into full records."}</p>
                        </div>
                    </div>
                    ${renderMemberRowsTable(rows, deps, { limit: 10 })}
                </article>
                ${deps.renderMemberServiceQueue(rows)}
            </section>
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Summary</h4>
                            <p>Member demand, flagged statuses, and debtor readiness should be visible before staff jump into golf, communications, or finance.</p>
                        </div>
                    </div>
                    ${deps.metricCards([
                        { label: "Golf Members", value: deps.formatInteger(rows.filter(row => String(row.primary_operation || "").toLowerCase() === "golf").length), meta: "Golf-linked members in current scope" },
                        { label: "High Activity", value: deps.formatInteger(rows.filter(row => Number(row.bookings_count || 0) >= 4).length), meta: "Members with strong recent booking demand" },
                        { label: "Configured Debtors", value: deps.formatInteger(accountCustomers.filter(row => String(row.account_code || "").trim() && String(row.billing_contact || "").trim()).length), meta: "Account customers ready for export" },
                        { label: "Comms Follow-up", value: deps.formatInteger(rows.filter(row => ["hold", "inactive", "defaulter"].includes(String(row.membership_status || "").toLowerCase())).length), meta: "Members likely to need direct follow-up" },
                    ])}
                </article>
            </section>
            <section class="dashboard-grid">
                ${deps.renderServiceDeskBriefCard(rows, accountCustomers)}
                ${deps.renderDebtorWatchCard(accountCustomers)}
            </section>
            <section class="split-grid">
                ${deps.roleShell() === "club_admin" ? renderMemberCreateForm(deps) : ""}
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Members</h3>
                            <p>Sorted by operational recency to keep service work practical.</p>
                        </div>
                    </div>
                    ${renderMemberRowsTable(rows, deps, { emptyText: "No members found." })}
                </section>
            </section>
        `;
    }

    function renderPanel(bundle, deps = {}) {
        const rows = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
        const accountCustomers = Array.isArray(bundle.accountCustomers?.account_customers) ? bundle.accountCustomers.account_customers : [];
        const activeCount = rows.filter(row => String(row.membership_status || "").toLowerCase() === "active").length;
        const flaggedCount = rows.filter(row => ["hold", "inactive", "defaulter", "resigned"].includes(String(row.membership_status || "").toLowerCase())).length;
        const hasQuery = Boolean(String(bundle.membersUi?.query || "").trim());
        const configuredDebtors = accountCustomers.filter(row => String(row.account_code || "").trim() && String(row.billing_contact || "").trim()).length;
        return `
            <section class="hero-card page-system-hero">
                <div class="panel-head">
                    <div>
                        <h3>People</h3>
                        <p>Search first, then act. Related people pages, service state, and the main club actions now sit above the longer member and debtor detail.</p>
                    </div>
                </div>
                ${deps.renderFamilySubnav("members", { label: "People pages" })}
                ${deps.metricCards([
                    { label: hasQuery ? "Matches" : "People", value: deps.formatInteger(hasQuery ? (bundle.members?.total || rows.length) : rows.length), meta: hasQuery ? "Matching people in current club scope" : "Recent member rows in club scope" },
                    { label: "Active", value: deps.formatInteger(activeCount), meta: "Active memberships" },
                    { label: "Flagged", value: deps.formatInteger(flaggedCount), meta: "Hold, inactive, or defaulter states" },
                    { label: "Debtor Accounts", value: deps.formatInteger(accountCustomers.length), meta: "Active account-customer records" },
                ])}
                ${deps.renderPageActionRow([
                    { label: "Search people", tone: "secondary", workblock: "people-search-workblock" },
                    deps.roleShell() === "club_admin" ? { label: "Add member", tone: "ghost", workblock: "people-add-workblock" } : null,
                ])}
            </section>
            <section class="workblock-stack">
                ${deps.renderWorkblock({
                    id: "people-search-workblock",
                    title: "Search",
                    copy: "Start with search and status filters before opening long member lists.",
                    badge: "Open",
                    open: true,
                    body: renderMembersSearchForm(bundle, deps, { embedded: true }),
                })}
                ${deps.renderWorkblock({
                    id: "people-results-workblock",
                    title: hasQuery ? "Search results" : "Recent member service board",
                    copy: hasQuery
                        ? "Search results stay operational: member context, booking demand, and service risk in one table."
                        : "Recent activity, spend, and operation context stay available without taking over the opening screen.",
                    badge: hasQuery ? "Open" : "Collapsed",
                    open: hasQuery,
                    body: renderMemberRowsTable(rows, deps, { limit: 10 }),
                })}
                ${deps.renderWorkblock({
                    id: "people-queue-workblock",
                    title: "Priority service queue",
                    copy: "Keep likely member follow-up visible before you drill into lower-priority detail.",
                    badge: !hasQuery ? "Open" : "Collapsed",
                    open: !hasQuery,
                    body: deps.renderMemberServiceQueueEmbedded(rows),
                })}
                ${deps.renderWorkblock({
                    id: "people-accounts-workblock",
                    title: "Account customers",
                    copy: "Debtor and account-customer context stays available, but off the opening view.",
                    badge: "Collapsed",
                    body: deps.renderAccountCustomerStack(accountCustomers, { limit: 8 }),
                })}
                ${deps.renderWorkblock({
                    id: "people-posture-workblock",
                    title: "Summary",
                    copy: "Use this block when member demand, follow-up pressure, and debtor readiness need a quick read.",
                    badge: "Collapsed",
                    body: deps.metricCards([
                        { label: "Golf Members", value: deps.formatInteger(rows.filter(row => String(row.primary_operation || "").toLowerCase() === "golf").length), meta: "Golf-linked members in current scope" },
                        { label: "High Activity", value: deps.formatInteger(rows.filter(row => Number(row.bookings_count || 0) >= 4).length), meta: "Members with strong recent booking demand" },
                        { label: "Configured Debtors", value: deps.formatInteger(configuredDebtors), meta: "Account customers ready for export" },
                        { label: "Comms Follow-up", value: deps.formatInteger(rows.filter(row => ["hold", "inactive", "defaulter"].includes(String(row.membership_status || "").toLowerCase())).length), meta: "Members likely to need direct follow-up" },
                    ]),
                })}
                ${deps.renderWorkblock({
                    id: "people-brief-workblock",
                    title: "Desk summary",
                    copy: "Front desk golf demand and debtor readiness stay one click away instead of sitting in the opening stack.",
                    badge: "Collapsed",
                    body: deps.renderServiceDeskBriefEmbedded(rows, accountCustomers),
                })}
                ${deps.renderWorkblock({
                    id: "people-watch-workblock",
                    title: "Debtor watch",
                    copy: "Open this when codes, contacts, or account terms need follow-up.",
                    badge: "Collapsed",
                    body: deps.renderDebtorWatchEmbedded(accountCustomers),
                })}
                ${deps.roleShell() === "club_admin" ? deps.renderWorkblock({
                    id: "people-add-workblock",
                    title: "Add member",
                    copy: "Member creation is still available, but it no longer crowds the primary service screen.",
                    badge: "Collapsed",
                    body: renderMemberCreateForm(deps, { embedded: true }),
                }) : ""}
                ${deps.renderWorkblock({
                    id: "people-members-workblock",
                    title: "Members",
                    copy: "Full member table remains available for deeper review after the service-first blocks.",
                    badge: "Collapsed",
                    body: renderMemberRowsTable(rows, deps, { emptyText: "No members found." }),
                })}
            </section>
        `;
    }

    async function submitMemberForm(form, deps = {}) {
        const payload = {
            first_name: String(form.first_name.value || "").trim(),
            last_name: String(form.last_name.value || "").trim(),
            email: String(form.email.value || "").trim() || null,
            member_number: String(form.member_number.value || "").trim() || null,
            primary_operation: String(form.primary_operation.value || "golf").trim(),
            home_club: String(form.home_club.value || "").trim() || null,
            active: true,
        };
        await deps.postJson("/api/admin/members", payload);
        deps.showToast("Member created.", "ok");
        form.reset();
        deps.clearWorkspaceCache();
        deps.invalidateMemberAreaPreview(payload.primary_operation);
        deps.invalidateRecentMembersPreview();
        await deps.refreshActiveMembersWorkspace();
    }

    async function submitSearchForm(form, deps = {}) {
        const membersUi = defaultMembersUi({
            query: form.q.value,
            status: form.membership_status.value,
        });
        deps.clearWorkspaceCache();
        await deps.refreshActiveMembersWorkspace({ membersUi });
    }

    async function clearSearch(deps = {}) {
        deps.clearWorkspaceCache();
        await deps.refreshActiveMembersWorkspace({ membersUi: { query: "", status: "all" } });
    }

    global.GreenLinkAdminMembersPanel = {
        clearSearch,
        defaultMembersUi,
        renderMemberRowsTable,
        renderMembersSearchForm,
        renderLegacyPanel,
        renderPanel,
        submitMemberForm,
        submitSearchForm,
    };
})(window);
