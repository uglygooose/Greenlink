(function (global) {
    "use strict";

    function currentStaffRows(state) {
        return Array.isArray(state?.workspaceData?.staff?.staff) ? state.workspaceData.staff.staff : [];
    }

    function findStaffRow(state, userId) {
        return currentStaffRows(state).find(row => Number(row.id) === Number(userId)) || null;
    }

    function renderStaffRowsTable(rows, deps = {}, options = {}) {
        const items = Array.isArray(rows) ? rows : [];
        const limit = Number(options.limit || 0);
        const visible = limit > 0 ? items.slice(0, limit) : items;
        const emptyText = String(options.emptyText || "No staff users found.").trim();
        const includeActions = typeof options.actions === "function";
        return deps.renderTable(
            includeActions ? ["Name", "Role", "Operational Role", "Email", "Actions"] : ["Name", "Role", "Operational Role", "Email"],
            visible.length ? visible.map(row => `
                <tr>
                    <td><strong>${deps.escapeHtml(row.name || "")}</strong></td>
                    <td>${deps.escapeHtml(row.role || "")}</td>
                    <td>${deps.escapeHtml(row.operational_role || row.operation_area || "-")}</td>
                    <td>${deps.escapeHtml(row.email || "")}</td>
                    ${includeActions ? `<td>${options.actions(row) || ""}</td>` : ""}
                </tr>
            `) : [`<tr><td colspan="${includeActions ? "5" : "4"}"><div class="empty-state">${deps.escapeHtml(emptyText)}</div></td></tr>`]
        );
    }

    function renderPanel(bundle, deps = {}) {
        const rows = Array.isArray(bundle.staff?.staff) ? bundle.staff.staff : [];
        const accountCustomers = Array.isArray(bundle.accountCustomers?.account_customers) ? bundle.accountCustomers.account_customers : [];
        const memberRows = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
        const activeOperators = rows.filter(row => ["club_staff", "staff"].includes(String(row.role || "").toLowerCase())).length;
        const golfFacingMembers = memberRows.filter(row => String(row.primary_operation || "").toLowerCase() === "golf").length;
        const configuredDebtors = accountCustomers.filter(row => String(row.account_code || "").trim() && String(row.billing_contact || "").trim()).length;
        return `
            <section class="hero-card page-system-hero">
                <div class="panel-head">
                    <div>
                        <h3>Staff</h3>
                        <p>Manage club-side operators from one structured page: identity first, related people pages second, then the service and access blocks that matter.</p>
                    </div>
                </div>
                ${deps.renderFamilySubnav("members", { label: "People pages" })}
                ${deps.metricCards([
                    { label: "Staff", value: deps.formatInteger(rows.length), meta: "Staff records in this club" },
                    { label: "Active Debtors", value: deps.formatInteger(accountCustomers.length), meta: "Active account-customer records" },
                    { label: "Members", value: deps.formatInteger((bundle.members?.total || 0)), meta: "Current member records" },
                    { label: "Club Scope", value: deps.escapeHtml(deps.activeClub()?.display_name || deps.activeClub()?.name || "Club"), meta: "Current locked club context" },
                ])}
                ${deps.renderPageActionRow([
                    { label: "Add staff", tone: "secondary", workblock: "staff-add-workblock" },
                ])}
            </section>
            <section class="workblock-stack">
                ${deps.renderWorkblock({
                    id: "staff-board-workblock",
                    title: "Staff service board",
                    copy: "Keep operator visibility high before club admins open lower-priority detail.",
                    badge: "Open",
                    open: true,
                    body: renderStaffRowsTable(rows, deps, {
                        limit: 8,
                        actions: row => `
                            <div class="inline-actions">
                                <button type="button" class="button secondary" data-edit-staff="${deps.escapeHtml(String(row.id || 0))}">Edit</button>
                            </div>
                        `,
                    }),
                })}
                ${deps.renderWorkblock({
                    id: "staff-current-workblock",
                    title: "Current staff",
                    copy: "Full club staff listing in the current locked club scope.",
                    badge: "Open",
                    open: true,
                    body: renderStaffRowsTable(rows, deps, {
                        actions: row => `
                            <div class="inline-actions">
                                <button type="button" class="button secondary" data-edit-staff="${deps.escapeHtml(String(row.id || 0))}">Edit</button>
                            </div>
                        `,
                    }),
                })}
                ${deps.renderWorkblock({
                    id: "staff-add-workblock",
                    title: "Add or update staff",
                    copy: "Create new operators or update an existing club staff user without leaving the page.",
                    badge: "Collapsed",
                    body: `
                        <form class="workblock-form" id="club-staff-form">
                            <input type="hidden" name="user_id" value="">
                            <div class="field-grid">
                                <div class="field"><label>Name</label><input name="name" required></div>
                                <div class="field"><label>Email</label><input name="email" type="email" required></div>
                                <div class="field"><label>Password</label><input name="password" type="password"></div>
                                <div class="checkbox-card">
                                    <label><input type="checkbox" name="force_reset" value="1"> Force reset if user exists in this club</label>
                                    <p>Only applies when reusing an existing user in this club. Email stays locked on updates.</p>
                                </div>
                            </div>
                            <div class="button-row">
                                <button type="submit" class="button">Save staff user</button>
                                <button type="button" class="button secondary" data-clear-staff-form="1">Clear</button>
                            </div>
                        </form>
                    `,
                })}
                ${deps.renderWorkblock({
                    id: "staff-debtors-workblock",
                    title: "Debtor accounts",
                    copy: "Billing and debtor context used in bookings stays nearby, but off the first screen.",
                    badge: "Collapsed",
                    body: deps.renderAccountCustomerStack(accountCustomers, { limit: 8, emptyText: "No active debtor accounts found." }),
                })}
                ${deps.renderWorkblock({
                    id: "staff-queue-workblock",
                    title: "Member service queue",
                    copy: "Cross-check staff capacity against the current people follow-up load.",
                    badge: "Collapsed",
                    body: deps.renderMemberServiceQueueEmbedded(memberRows),
                })}
                ${deps.renderWorkblock({
                    id: "staff-posture-workblock",
                    title: "Team summary",
                    copy: "Staff records, debtor readiness, and member demand should read together without dominating the opening view.",
                    badge: "Collapsed",
                    body: deps.metricCards([
                        { label: "Operators", value: deps.formatInteger(activeOperators), meta: "Staff-side operators in this club" },
                        { label: "Golf-facing Members", value: deps.formatInteger(golfFacingMembers), meta: "Likely to touch tee-sheet or golf-day flow" },
                        { label: "Configured Debtors", value: deps.formatInteger(configuredDebtors), meta: "Account customers ready for export" },
                        { label: "Current Scope", value: deps.escapeHtml(deps.activeClub()?.display_name || deps.activeClub()?.name || "Club"), meta: "Locked club context" },
                    ]),
                })}
                ${deps.renderWorkblock({
                    id: "staff-brief-workblock",
                    title: "Desk summary",
                    copy: "Golf demand and debtor readiness can stay available without occupying the initial screen.",
                    badge: "Collapsed",
                    body: deps.renderServiceDeskBriefEmbedded(memberRows, accountCustomers),
                })}
                ${deps.renderWorkblock({
                    id: "staff-watch-workblock",
                    title: "Debtor watch",
                    copy: "Use this when billing readiness, codes, or contacts need attention.",
                    badge: "Collapsed",
                    body: deps.renderDebtorWatchEmbedded(accountCustomers),
                })}
            </section>
        `;
    }

    function resetForm(form = global.document.getElementById("club-staff-form")) {
        if (!(form instanceof global.HTMLFormElement)) return;
        form.reset();
        if (form.user_id) form.user_id.value = "";
        if (form.email) form.email.readOnly = false;
        if (form.password) form.password.required = false;
        if (form.force_reset) form.force_reset.checked = false;
    }

    function editUser(userId, deps = {}) {
        const row = findStaffRow(deps.state, userId);
        const doc = deps.document || global.document;
        const form = doc.getElementById("club-staff-form");
        if (!row || !(form instanceof global.HTMLFormElement)) return;
        form.user_id.value = String(row.id || "");
        form.name.value = String(row.name || "");
        form.email.value = String(row.email || "");
        form.email.readOnly = true;
        form.password.value = "";
        form.password.required = false;
        form.force_reset.checked = false;
        deps.focusWorkblock("staff-add-workblock");
        form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function submitForm(form, deps = {}) {
        const userId = deps.positiveInt(form.user_id?.value);
        const password = String(form.password.value || "").trim();
        if (!userId && !password) {
            throw new Error("Password is required for a new staff user.");
        }
        const payload = {
            name: String(form.name.value || "").trim(),
            email: String(form.email.value || "").trim(),
            password: password || null,
            role: "club_staff",
            force_reset: Boolean(form.force_reset.checked),
        };
        if (userId) {
            await deps.postJson(`/api/admin/staff/${userId}`, payload, { method: "PUT" });
            deps.showToast("Staff user updated.", "ok");
        } else {
            await deps.postJson("/api/admin/staff", payload);
            deps.showToast("Staff user created.", "ok");
        }
        resetForm(form);
        deps.invalidateStaffListPreview();
        deps.deleteWorkspaceCacheWhere(key => {
            const [shell, workspace] = String(key || "").split("|");
            return shell === deps.roleShell() && workspace === "members";
        });
        await deps.refreshActiveMembersWorkspace();
    }

    global.GreenLinkAdminStaffPanel = {
        renderPanel,
        resetForm,
        editUser,
        submitForm,
    };
})(window);
