(function () {
    "use strict";

    const ROLE_LABELS = {
        super_admin: "Super Admin",
        admin: "Club Admin",
        club_staff: "Staff",
        player: "Member",
    };

    const MODULE_LABELS = {
        golf: "Golf",
        tennis: "Tennis",
        bowls: "Bowls",
        pro_shop: "Pro Shop",
        pub: "Pub",
        golf_days: "Golf Days",
        members: "Members",
        communications: "Communications",
    };

    const WORKSPACE_META = {
        super_admin: {
            overview: {
                kicker: "Platform Overview",
                title: "Command Centre",
                copy: "See readiness, activation risk, and demo posture without dropping into a one-page admin sprawl.",
                navCopy: "Readiness, live clubs, and platform posture.",
            },
            clubs: {
                kicker: "Club Portfolio",
                title: "Clubs",
                copy: "Review every club as a real workspace with status, readiness, staff, communications, and next-step visibility.",
                navCopy: "Club workspaces and readiness detail.",
            },
            onboarding: {
                kicker: "Activation Workflow",
                title: "Onboarding",
                copy: "Create or resume club setup with the fields that matter for launch readiness, modules, targets, and admin access.",
                navCopy: "Create clubs and resume onboarding.",
            },
            demo: {
                kicker: "Demo Control",
                title: "Demo Environment",
                copy: "Manage the live demo workspace deliberately, including persona access and preview routing.",
                navCopy: "Demo environment, personas, and preview.",
            },
            users: {
                kicker: "Access Governance",
                title: "Users & Roles",
                copy: "Assign admins and staff to the right club context without leaking platform controls into club roles.",
                navCopy: "Platform role management and access.",
            },
            settings: {
                kicker: "Platform Rules",
                title: "Platform Settings",
                copy: "Keep platform-wide module, target, and pricing structures readable for governance and onboarding consistency.",
                navCopy: "Platform catalogs and guardrails.",
            },
        },
        club_admin: {
            overview: {
                kicker: "Club Overview",
                title: "Overview",
                copy: "A club manager landing page focused on today, active blockers, and the next operational action.",
                navCopy: "Club posture and operational priorities.",
            },
            golf: {
                kicker: "Golf Operations",
                title: "Golf",
                copy: "Keep golf central with the tee sheet as the operating hub and golf-day pipeline close at hand.",
                navCopy: "Tee sheet and golf-day workflow.",
            },
            operations: {
                kicker: "Department Operations",
                title: "Operations",
                copy: "Group enabled non-golf operations into clean module workspaces instead of dumping them into one dense page.",
                navCopy: "Tennis, bowls, pro shop, and more.",
            },
            members: {
                kicker: "People",
                title: "Members",
                copy: "Work with members and staff using club-only data, operational recency, and fast lookup tables.",
                navCopy: "Members, staff, and linked accounts.",
            },
            communications: {
                kicker: "Club Communications",
                title: "Communications",
                copy: "Manage member and staff messaging from a single club-safe workspace with clear publishing status.",
                navCopy: "News, notices, and club messaging.",
            },
            reports: {
                kicker: "Operational Insight",
                title: "Reports",
                copy: "Keep reporting action-led, with current pace, target posture, and stream-level performance.",
                navCopy: "Revenue, targets, and operational insight.",
            },
            settings: {
                kicker: "Club Setup",
                title: "Club Settings",
                copy: "Limit club-side configuration to branding, booking rules, and operating targets that support real operations.",
                navCopy: "Branding, booking rules, and targets.",
            },
        },
        staff: {
            today: {
                kicker: "Daily Operations",
                title: "Today",
                copy: "A fast operational landing page for the current club, today’s blockers, and the work that needs doing now.",
                navCopy: "Today's work and operational alerts.",
            },
            golf: {
                kicker: "Golf Hub",
                title: "Golf",
                copy: "Run the tee sheet, check-in flow, and golf-day pipeline from a single operational workspace.",
                navCopy: "Tee sheet and golf-day actions.",
            },
            operations: {
                kicker: "Department Work",
                title: "Operations",
                copy: "Access enabled operations cleanly without burying staff in setup-heavy admin terminology.",
                navCopy: "Enabled operational modules.",
            },
            members: {
                kicker: "Member Service",
                title: "Members",
                copy: "Search, assist, and understand members using current club-only context and recent activity.",
                navCopy: "Member service and lookup.",
            },
            communications: {
                kicker: "Club Notices",
                title: "Communications",
                copy: "Stay aligned on published club communications without exposing club-setup controls.",
                navCopy: "Published notices and communications.",
            },
        },
    };
    const WORKSPACE_REQUEST_TIMEOUT_MS = 15000;

    const state = {
        bootstrap: null,
        route: null,
        renderToken: 0,
        workspaceData: {},
        modalData: null,
    };

    const els = {
        body: document.body,
        overlay: document.getElementById("loading-overlay"),
        nav: document.getElementById("shell-nav"),
        brandKicker: document.getElementById("shell-brand-kicker"),
        brandTitle: document.getElementById("shell-brand-title"),
        brandCopy: document.getElementById("shell-brand-copy"),
        scopeTitle: document.getElementById("scope-title"),
        scopeCopy: document.getElementById("scope-copy"),
        pageKicker: document.getElementById("page-kicker"),
        pageTitle: document.getElementById("page-title"),
        pageCopy: document.getElementById("page-copy"),
        contextChip: document.getElementById("context-chip"),
        headerClub: document.getElementById("header-club"),
        tabs: document.getElementById("workspace-tabs"),
        root: document.getElementById("workspace-root"),
        modal: document.getElementById("modal-layer"),
        toasts: document.getElementById("toast-stack"),
        logout: document.getElementById("logout-btn"),
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;");
    }

    function positiveInt(value) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : null;
    }

    function logClientError(stage, error, extra = {}) {
        try {
            console.error("[GreenLink admin]", {
                stage,
                message: String(error?.message || "Unknown error"),
                code: String(error?.code || ""),
                status: Number(error?.status || 0) || null,
                role_shell: String(state.bootstrap?.role_shell || ""),
                workspace: String(state.route?.workspace || ""),
                club_id: positiveInt(state.route?.clubId),
                ...extra,
            });
        } catch {
            // Console logging should never block the shell.
        }
    }

    function todayYmd() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function clampYmd(raw) {
        const value = String(raw || "").trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayYmd();
    }

    function addDaysYmd(ymd, delta) {
        const match = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return todayYmd();
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        date.setDate(date.getDate() + Number(delta || 0));
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function toDate(value) {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value) {
        const date = toDate(value);
        if (!date) return "-";
        return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }

    function formatDateTime(value) {
        const date = toDate(value);
        if (!date) return "-";
        return date.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    function formatTime(value) {
        const date = toDate(value);
        if (!date) return "-";
        return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }

    function formatInteger(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "0";
        return Math.round(number).toLocaleString("en-ZA");
    }

    function roleShell() {
        return String(state.bootstrap?.role_shell || "").trim().toLowerCase();
    }

    function currentUser() {
        return state.bootstrap?.user || {};
    }

    function activeClub() {
        return state.bootstrap?.preview_club || state.bootstrap?.effective_club || null;
    }

    function currencySymbol() {
        return String(activeClub()?.profile?.currency_symbol || "R");
    }

    function formatCurrency(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return `${currencySymbol()}0`;
        return `${currencySymbol()}${number.toLocaleString("en-ZA", {
            minimumFractionDigits: number % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2,
        })}`;
    }

    function formatPercent(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "-";
        return `${Math.round(number * 100)}%`;
    }

    function formatMaybe(value, format) {
        if (format === "currency") return formatCurrency(value);
        if (format === "percent") return formatPercent(value);
        return formatInteger(value);
    }

    function clubModules() {
        const modules = activeClub()?.enabled_modules;
        return Array.isArray(modules) ? modules.map(item => String(item || "").trim().toLowerCase()).filter(Boolean) : [];
    }

    function operationModules() {
        return clubModules().filter(key => !["golf", "golf_days", "members", "communications"].includes(key));
    }

    function workspaceMeta(workspace) {
        const shell = roleShell();
        const metaByShell = WORKSPACE_META[shell] || {};
        return metaByShell[String(workspace || "").trim().toLowerCase()] || {
            kicker: "Workspace",
            title: "Workspace",
            copy: "GreenLink operational workspace.",
            navCopy: "Workspace",
        };
    }

    function tabsForWorkspace(workspace) {
        const shell = roleShell();
        if (workspace === "golf") {
            return [
                { id: "tee-sheet", label: "Tee Sheet" },
                { id: "golf-days", label: "Golf Days" },
            ];
        }
        if (workspace === "operations") {
            const tabs = [{ id: "overview", label: "Overview" }];
            operationModules().forEach(key => {
                tabs.push({ id: key, label: MODULE_LABELS[key] || key });
            });
            return tabs;
        }
        if (workspace === "members" && shell === "club_admin") {
            return [
                { id: "members", label: "Members" },
                { id: "staff", label: "Staff" },
            ];
        }
        if (workspace === "members" && shell === "staff") {
            return [{ id: "members", label: "Members" }];
        }
        if (workspace === "reports") {
            return [
                { id: "performance", label: "Performance" },
                { id: "targets", label: "Targets" },
            ];
        }
        if (workspace === "settings" && shell !== "super_admin") {
            return [
                { id: "profile", label: "Profile" },
                { id: "booking-window", label: "Booking Window" },
                { id: "targets", label: "Targets" },
            ];
        }
        return [];
    }

    function normalizeWorkspace(raw) {
        const value = String(raw || "").trim().toLowerCase();
        const allowed = Array.isArray(state.bootstrap?.allowed_workspaces) ? state.bootstrap.allowed_workspaces : [];
        if (allowed.includes(value)) return value;
        return String(state.bootstrap?.default_workspace || allowed[0] || "overview");
    }

    function normalizePanel(workspace, raw) {
        const tabs = tabsForWorkspace(workspace);
        if (!tabs.length) return null;
        const value = String(raw || "").trim().toLowerCase();
        return tabs.some(tab => tab.id === value) ? value : tabs[0].id;
    }

    function parseRoute() {
        const params = new URLSearchParams(window.location.search || "");
        const workspace = normalizeWorkspace(params.get("workspace"));
        const route = {
            workspace,
            panel: normalizePanel(workspace, params.get("panel")),
            date: clampYmd(params.get("date") || todayYmd()),
            clubId: positiveInt(params.get("club_id")),
        };
        if (state.bootstrap?.club_context_locked) route.clubId = null;
        return route;
    }

    function serializeRoute(route) {
        const params = new URLSearchParams();
        const workspace = normalizeWorkspace(route?.workspace);
        const panel = normalizePanel(workspace, route?.panel);
        params.set("workspace", workspace);
        if (panel) params.set("panel", panel);
        if (workspace === "golf") params.set("date", clampYmd(route?.date));
        if (!state.bootstrap?.club_context_locked && roleShell() === "super_admin" && positiveInt(route?.clubId)) {
            if (["clubs", "onboarding", "demo", "users"].includes(workspace)) {
                params.set("club_id", String(route.clubId));
            }
        }
        return `${window.location.pathname}?${params.toString()}`;
    }

    function navigate(partial, options = {}) {
        const nextRoute = {
            ...state.route,
            ...partial,
        };
        nextRoute.workspace = normalizeWorkspace(nextRoute.workspace);
        nextRoute.panel = normalizePanel(nextRoute.workspace, nextRoute.panel);
        if (nextRoute.workspace !== "golf") nextRoute.date = todayYmd();
        if (state.bootstrap?.club_context_locked) nextRoute.clubId = null;
        const nextUrl = serializeRoute(nextRoute);
        if (options.replace) window.history.replaceState({}, "", nextUrl);
        else window.history.pushState({}, "", nextUrl);
        state.route = parseRoute();
        void renderCurrentWorkspace();
    }

    function setOverlay(visible) {
        els.overlay.hidden = !visible;
        els.body.classList.toggle("shell-loading", Boolean(visible));
    }

    function runtimeFailureMessage(error, fallback) {
        if (error?.code === "BOOTSTRAP_TIMEOUT") {
            return "Session bootstrap timed out while opening this workspace. Retry or sign in again.";
        }
        if (error?.code === "INVALID_BOOTSTRAP") {
            return "Session bootstrap returned invalid data. Your stored session state has been cleared.";
        }
        if (error?.code === "REQUEST_TIMEOUT") {
            return "A workspace request timed out while loading this view. Retry to continue.";
        }
        return String(error?.message || fallback || "Unable to open the workspace.");
    }

    function renderFatalShellError(title, message) {
        if (state.bootstrap) {
            renderChrome();
        } else {
            els.brandKicker.textContent = "GreenLink";
            els.brandTitle.textContent = "Operations";
            els.brandCopy.textContent = "Role-safe workspace bootstrap failed.";
            els.scopeTitle.textContent = "Session unavailable";
            els.scopeCopy.textContent = "Bootstrap could not resolve role or club context.";
            els.pageKicker.textContent = "Session";
            els.pageTitle.textContent = title;
            els.pageCopy.textContent = "Retry the shell bootstrap or return to sign in.";
            els.contextChip.textContent = "Session error";
            els.headerClub.textContent = "GreenLink";
            els.nav.innerHTML = "";
            els.tabs.hidden = true;
            els.tabs.innerHTML = "";
        }

        els.root.innerHTML = `
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h3>${escapeHtml(title || "Workspace error")}</h3>
                        <p>${escapeHtml(message || "Unable to open the requested workspace.")}</p>
                    </div>
                </div>
                <div class="button-row">
                    <button type="button" class="button" id="fatal-retry-btn">Retry</button>
                    <button type="button" class="button secondary" id="fatal-logout-btn">Sign in again</button>
                </div>
            </section>
        `;
        setOverlay(false);

        document.getElementById("fatal-retry-btn")?.addEventListener("click", () => {
            window.location.reload();
        });
        document.getElementById("fatal-logout-btn")?.addEventListener("click", logout);
    }

    function renderWorkspaceLoading(message) {
        els.root.innerHTML = `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Loading workspace</h3>
                        <p>${escapeHtml(message || "Resolving data and role-safe context.")}</p>
                    </div>
                </div>
            </section>
        `;
    }

    function showToast(message, tone = "") {
        const toast = document.createElement("div");
        toast.className = `toast ${tone}`.trim();
        toast.textContent = String(message || "");
        els.toasts.appendChild(toast);
        window.setTimeout(() => toast.remove(), 3200);
    }

    function openModal(title, subtitle, bodyHtml) {
        els.modal.hidden = false;
        els.modal.innerHTML = `
            <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="modal-head">
                    <div>
                        <h3>${escapeHtml(title)}</h3>
                        <p class="panel-note">${escapeHtml(subtitle || "")}</p>
                    </div>
                    <button type="button" class="button secondary" data-close-modal="1">Close</button>
                </div>
                ${bodyHtml}
            </div>
        `;
    }

    function closeModal() {
        state.modalData = null;
        els.modal.hidden = true;
        els.modal.innerHTML = "";
    }

    async function fetchJson(path, options = {}) {
        const headers = window.GreenLinkSession.authHeaders(options.headers || {});
        const previewClubId = positiveInt(options.clubId) || positiveInt(state.route?.clubId);
        if (roleShell() === "super_admin" && previewClubId && !headers.has("X-Club-Id")) {
            headers.set("X-Club-Id", String(previewClubId));
        }
        const requestedTimeoutMs = Number(options.timeoutMs);
        const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
            ? requestedTimeoutMs
            : WORKSPACE_REQUEST_TIMEOUT_MS;
        const controller = new AbortController();
        let timedOut = false;
        let abortedByExternal = false;
        const timeoutId = timeoutMs > 0
            ? window.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs)
            : null;

        const externalSignal = options.signal;
        let onAbort = null;
        if (externalSignal) {
            if (externalSignal.aborted) {
                abortedByExternal = true;
                controller.abort();
            } else {
                onAbort = () => {
                    abortedByExternal = true;
                    controller.abort();
                };
                externalSignal.addEventListener("abort", onAbort, { once: true });
            }
        }

        try {
            const response = await window.fetch(path, {
                method: options.method || "GET",
                headers,
                body: options.body,
                cache: "no-store",
                signal: controller.signal,
            });
            const raw = await response.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = null;
            }
            if (!response.ok) {
                const detail = data?.detail || data?.message || raw || `Request failed (${response.status})`;
                const error = new Error(String(detail));
                error.status = response.status;
                error.data = data;
                error.path = path;
                throw error;
            }
            return data;
        } catch (error) {
            if (error?.name === "AbortError") {
                if (abortedByExternal) throw error;
                if (timedOut) {
                    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
                    timeoutError.code = "REQUEST_TIMEOUT";
                    timeoutError.path = path;
                    throw timeoutError;
                }
            }
            throw error;
        } finally {
            if (timeoutId != null) {
                window.clearTimeout(timeoutId);
            }
            if (externalSignal && onAbort) {
                externalSignal.removeEventListener("abort", onAbort);
            }
        }
    }

    async function postJson(path, payload, options = {}) {
        return fetchJson(path, {
            ...options,
            method: options.method || "POST",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            body: JSON.stringify(payload || {}),
        });
    }

    function metricCards(rows) {
        return `
            <div class="metric-grid">
                ${(rows || []).map(row => `
                    <article class="metric-card">
                        <span class="metric-label">${escapeHtml(row.label)}</span>
                        <strong class="metric-value">${escapeHtml(row.value)}</strong>
                        <span class="metric-meta">${escapeHtml(row.meta || "")}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderTable(headers, rows) {
        return `
            <div class="table-scroll">
                <table>
                    <thead>
                        <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
                    </thead>
                    <tbody>
                        ${rows.join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderOperationalHighlights(rows) {
        const items = Array.isArray(rows) ? rows : [];
        if (!items.length) return `<div class="empty-state">No highlights available for this workspace yet.</div>`;
        return `
            <div class="stack">
                ${items.map(item => `
                    <article class="list-row">
                        <div class="list-row-top">
                            <span class="list-title">${escapeHtml(item.name || item.label || "Insight")}</span>
                            <span class="metric-pill">${escapeHtml(formatMaybe(item.current, item.format))}</span>
                        </div>
                        <div class="list-meta">${escapeHtml(item.context || item.note || "")}</div>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function renderAlerts(rows) {
        const alerts = Array.isArray(rows) ? rows : [];
        if (!alerts.length) return `<div class="empty-state">No active operational alerts.</div>`;
        return `
            <div class="alert-list">
                ${alerts.map(alert => `
                    <article class="alert-card ${escapeHtml(alert.severity || "low")}">
                        <strong>${escapeHtml(alert.title || "Alert")}</strong>
                        <span>${escapeHtml(alert.message || "")}</span>
                    </article>
                `).join("")}
            </div>
        `;
    }

    function statusTone(status) {
        const value = String(status || "").trim().toLowerCase();
        if (["live", "active", "checked_in", "completed", "published", "paid", "healthy"].includes(value)) return "ok";
        if (["draft", "onboarding", "partial", "booked", "medium"].includes(value)) return "warn";
        if (["inactive", "cancelled", "no_show", "high", "archived"].includes(value)) return "bad";
        return "";
    }

    function renderStatusPill(label, value) {
        const text = String(value || label || "-");
        return `<span class="status-pill ${statusTone(value)}">${escapeHtml(label ? `${label}: ${text}` : text)}</span>`;
    }

    function renderActionButtons(buttons) {
        const rows = Array.isArray(buttons) ? buttons : [];
        if (!rows.length) return "";
        return `
            <div class="button-row">
                ${rows.map(button => `
                    <button
                        type="button"
                        class="button ${escapeHtml(button.kind || "secondary")}"
                        ${button.attrs || ""}
                    >
                        ${escapeHtml(button.label || "Action")}
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderTabs() {
        const tabs = tabsForWorkspace(state.route.workspace);
        if (!tabs.length) {
            els.tabs.hidden = true;
            els.tabs.innerHTML = "";
            return;
        }
        els.tabs.hidden = false;
        els.tabs.innerHTML = tabs.map(tab => `
            <button
                type="button"
                class="tab-chip ${state.route.panel === tab.id ? "active" : ""}"
                data-nav-panel="${escapeHtml(tab.id)}"
            >
                ${escapeHtml(tab.label)}
            </button>
        `).join("");
    }

    function renderNav() {
        const nav = Array.isArray(state.bootstrap?.nav) ? state.bootstrap.nav : [];
        els.nav.innerHTML = nav.map(item => {
            const workspace = String(item.workspace || "");
            const meta = workspaceMeta(workspace);
            return `
                <button
                    type="button"
                    class="nav-item ${state.route.workspace === workspace ? "active" : ""}"
                    data-nav-workspace="${escapeHtml(workspace)}"
                >
                    <strong>${escapeHtml(item.label || workspace)}</strong>
                    <span>${escapeHtml(meta.navCopy || meta.copy || "")}</span>
                </button>
            `;
        }).join("");
    }

    function renderChrome() {
        const shell = roleShell();
        const user = currentUser();
        const club = activeClub();
        const meta = workspaceMeta(state.route.workspace);
        const roleLabel = ROLE_LABELS[String(user.role || "").toLowerCase()] || "User";
        const clubName = club?.display_name || club?.name || "GreenLink";

        if (shell === "super_admin") {
            els.brandKicker.textContent = "GreenLink";
            els.brandTitle.textContent = "Platform";
            els.brandCopy.textContent = club ? `Previewing ${clubName} within the platform shell.` : "Platform governance, onboarding, and demo control.";
            els.scopeTitle.textContent = club ? clubName : "All clubs";
            els.scopeCopy.textContent = club
                ? `${roleLabel} preview mode. Club operations stay scoped until you intentionally switch context.`
                : `${user.name || "Super admin"} in platform mode. No club data is shown without deliberate selection.`;
            els.contextChip.textContent = club ? "Preview mode" : "Platform mode";
            els.headerClub.textContent = club ? clubName : "GreenLink Platform";
        } else {
            els.brandKicker.textContent = roleLabel;
            els.brandTitle.textContent = clubName;
            els.brandCopy.textContent = shell === "staff"
                ? "Daily operational shell for the current club."
                : "Club operations shell with golf central and modules grouped cleanly.";
            els.scopeTitle.textContent = clubName;
            els.scopeCopy.textContent = `${roleLabel}. Club context is locked before this shell renders.`;
            els.contextChip.textContent = shell === "staff" ? "Staff locked" : "Club locked";
            els.headerClub.textContent = clubName;
        }

        els.pageKicker.textContent = meta.kicker;
        els.pageTitle.textContent = meta.title;
        els.pageCopy.textContent = meta.copy;
        renderNav();
        renderTabs();
    }

    function cachedBootstrapMatchesRoute(bootstrap, route = state.route) {
        if (!bootstrap || typeof bootstrap !== "object") return false;
        if (String(bootstrap.role_shell || "").trim().toLowerCase() !== "super_admin") {
            return true;
        }
        const requestedClubId = positiveInt(route?.clubId);
        const cachedPreviewClubId = positiveInt(bootstrap.preview_club?.id);
        return requestedClubId === cachedPreviewClubId;
    }

    function hydrateBootstrapFromCache() {
        const cached = window.GreenLinkSession?.readBootstrap?.();
        if (!cachedBootstrapMatchesRoute(cached, state.route)) return null;
        state.bootstrap = cached;
        return cached;
    }

    async function refreshBootstrap(force) {
        const previewClubId = !state.bootstrap?.club_context_locked && roleShell() === "super_admin"
            ? positiveInt(state.route?.clubId)
            : positiveInt(parseRoute().clubId);
        const currentPreview = positiveInt(state.bootstrap?.preview_club?.id);
        if (!force && state.bootstrap && currentPreview === previewClubId) {
            return state.bootstrap;
        }

        const query = previewClubId ? `?preview_club_id=${previewClubId}` : "";
        const bootstrap = await window.GreenLinkSession.fetchBootstrap(query);
        window.GreenLinkSession.writeBootstrap(bootstrap);
        state.bootstrap = bootstrap;
        state.route = parseRoute();
        return bootstrap;
    }

    function renderSelectedClubCards(workspace) {
        if (!workspace) {
            return `<div class="empty-state">Select a club to load its workspace detail.</div>`;
        }

        const club = workspace.club || {};
        const readiness = workspace.readiness || {};
        const staff = Array.isArray(workspace.staff) ? workspace.staff.slice(0, 6) : [];
        const communications = Array.isArray(workspace.communications) ? workspace.communications.slice(0, 5) : [];
        const activity = Array.isArray(workspace.activity) ? workspace.activity.slice(0, 6) : [];
        const annualTargets = Array.isArray(workspace.annual_targets) ? workspace.annual_targets.slice(0, 6) : [];

        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>${escapeHtml(club.name || "Selected club")}</h3>
                        <p>${escapeHtml(readiness.next_step || "Review readiness, modules, and activation detail.")}</p>
                    </div>
                    <div class="inline-actions">
                        ${renderStatusPill("Status", club.status || readiness.status || "unknown")}
                        <span class="metric-pill">Score ${escapeHtml(formatInteger(readiness.score || 0))}</span>
                    </div>
                </div>
                ${metricCards([
                    { label: "Members", value: formatInteger(workspace.metrics?.members || 0), meta: "Imported and linked member records" },
                    { label: "Upcoming Bookings", value: formatInteger(workspace.metrics?.bookings_upcoming || 0), meta: "Future golf activity in the club workspace" },
                    { label: "Communications", value: formatInteger(workspace.metrics?.communications_published || 0), meta: "Published club notices" },
                    { label: "Modules", value: formatInteger(workspace.metrics?.enabled_modules || 0), meta: "Enabled operational modules" },
                ])}
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Readiness</h4>
                            <p>${escapeHtml(readiness.readiness_status || "Current setup posture")}</p>
                        </div>
                    </div>
                    <div class="stack">
                        <div class="detail-row"><span class="row-key">Missing items</span><span class="row-value">${escapeHtml((readiness.missing || []).join(", ") || "None")}</span></div>
                        <div class="detail-row"><span class="row-key">Enabled modules</span><span class="row-value">${escapeHtml((workspace.profile?.enabled_modules || []).join(", ") || "Golf only")}</span></div>
                        <div class="detail-row"><span class="row-key">Club slug</span><span class="row-value">${escapeHtml(club.slug || "-")}</span></div>
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Current Staff</h4>
                            <p>Latest staff records for this club.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${staff.length ? staff.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.name || row.email || "Staff")}</span>
                                    ${renderStatusPill("", row.role || "staff")}
                                </div>
                                <div class="list-meta">${escapeHtml(row.email || "")}</div>
                            </div>
                        `).join("") : `<div class="empty-state">No staff records yet.</div>`}
                    </div>
                </article>
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Communications</h4>
                            <p>Latest published or draft club messaging.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${communications.length ? communications.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.title || "Communication")}</span>
                                    ${renderStatusPill("", row.status || "draft")}
                                </div>
                                <div class="list-meta">${escapeHtml(row.summary || row.body || "")}</div>
                            </div>
                        `).join("") : `<div class="empty-state">No communications yet.</div>`}
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Activity & Targets</h4>
                            <p>Recent system activity and configured annual targets.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${activity.length ? activity.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.action || "Activity")}</span>
                                    <span class="list-meta">${escapeHtml(formatDateTime(row.created_at))}</span>
                                </div>
                                <div class="list-meta">${escapeHtml(row.entity_type || "")}</div>
                            </div>
                        `).join("") : ""}
                        ${annualTargets.length ? annualTargets.map(row => `
                            <div class="detail-row">
                                <span class="row-key">${escapeHtml(`${row.year} ${row.metric}`)}</span>
                                <span class="row-value">${escapeHtml(formatInteger(row.annual_target))}</span>
                            </div>
                        `).join("") : `<div class="empty-state">No annual targets configured yet.</div>`}
                    </div>
                </article>
            </section>
        `;
    }

    async function renderSuperOverview(token) {
        const payload = await fetchJson("/api/super/command-center");
        if (token !== state.renderToken) return;
        state.workspaceData = { commandCenter: payload };

        const summary = payload.summary || {};
        const needsAction = Array.isArray(payload.needs_action) ? payload.needs_action : [];
        const liveClubs = (payload.clubs || []).filter(row => row.status === "live").slice(0, 6);
        const demo = payload.demo_environment || {};

        els.root.innerHTML = `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Platform overview</h3>
                        <p>Super admin lands in a true command centre now, not a club-ops scroller.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Active Clubs", value: formatInteger(summary.active_clubs || 0), meta: "Currently enabled in platform scope" },
                    { label: "Live Clubs", value: formatInteger(summary.live_clubs || 0), meta: "Operational clubs ready for real use" },
                    { label: "Onboarding", value: formatInteger(summary.onboarding_clubs || 0), meta: "Clubs still moving toward activation" },
                    { label: "Needs Action", value: formatInteger(summary.needs_action || 0), meta: "Clubs with immediate readiness blockers" },
                ])}
                ${renderActionButtons([
                    { label: "Open Clubs", attrs: `data-nav-workspace="clubs"` },
                    { label: "Resume Onboarding", attrs: `data-nav-workspace="onboarding"` },
                    { label: "Demo Environment", attrs: `data-nav-workspace="demo"`, kind: "ghost" },
                ])}
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Readiness queue</h4>
                            <p>Focus only on the clubs that need work next.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${needsAction.length ? needsAction.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.club_name || "Club")}</span>
                                    ${renderStatusPill("", row.status || "onboarding")}
                                </div>
                                <div class="list-meta">${escapeHtml(row.issue || row.next_step || "")}</div>
                                <div class="inline-actions">
                                    <button type="button" class="button secondary" data-nav-workspace="clubs" data-club-id="${escapeHtml(row.club_id)}">Open club</button>
                                    <button type="button" class="button ghost" data-nav-workspace="onboarding" data-club-id="${escapeHtml(row.club_id)}">Resume setup</button>
                                </div>
                            </div>
                        `).join("") : `<div class="empty-state">No clubs currently need action.</div>`}
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Demo environment</h4>
                            <p>Keep the Harbour Point walkthrough deliberate and easy to access.</p>
                        </div>
                    </div>
                    <div class="stack">
                        <div class="detail-row"><span class="row-key">Status</span><span class="row-value">${escapeHtml(demo.status || "missing")}</span></div>
                        <div class="detail-row"><span class="row-key">Club</span><span class="row-value">${escapeHtml(demo.club_name || "No demo club")}</span></div>
                        <div class="detail-row"><span class="row-key">Personas</span><span class="row-value">${escapeHtml(formatInteger((demo.personas || []).length))}</span></div>
                        <div class="button-row">
                            <button type="button" class="button" data-demo-ensure="1">Refresh demo environment</button>
                            ${demo.club_id ? `<button type="button" class="button secondary" data-nav-workspace="demo" data-club-id="${escapeHtml(demo.club_id)}">Open demo</button>` : ""}
                        </div>
                    </div>
                </article>
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Live clubs</h4>
                        <p>Fast access to current live workspaces.</p>
                    </div>
                </div>
                <div class="module-grid">
                    ${liveClubs.length ? liveClubs.map(row => `
                        <article class="module-card">
                            <header>
                                <div>
                                    <h4>${escapeHtml(row.name || "Club")}</h4>
                                    <p>${escapeHtml(row.next_step || "Open club workspace")}</p>
                                </div>
                                <span class="metric-pill">${escapeHtml(formatInteger(row.score || 0))}</span>
                            </header>
                            <div class="inline-actions">
                                ${renderStatusPill("", row.status || "live")}
                                <span class="metric-pill">${escapeHtml((row.modules || []).join(", ") || "No modules")}</span>
                            </div>
                            <div class="button-row">
                                <button type="button" class="button secondary" data-nav-workspace="clubs" data-club-id="${escapeHtml(row.id)}">Open workspace</button>
                                <button type="button" class="button ghost" data-nav-workspace="onboarding" data-club-id="${escapeHtml(row.id)}">Edit setup</button>
                            </div>
                        </article>
                    `).join("") : `<div class="empty-state">No live clubs yet.</div>`}
                </div>
            </section>
        `;
    }

    async function renderSuperClubs(token) {
        const commandCenter = await fetchJson("/api/super/command-center");
        if (token !== state.renderToken) return;
        const clubs = Array.isArray(commandCenter.clubs) ? commandCenter.clubs : [];
        const selectedClubId = positiveInt(state.route.clubId) || positiveInt(clubs[0]?.id);
        if (selectedClubId && selectedClubId !== state.route.clubId) {
            navigate({ clubId: selectedClubId }, { replace: true });
            return;
        }
        const workspace = selectedClubId ? await fetchJson(`/api/super/clubs/${selectedClubId}/workspace`) : null;
        if (token !== state.renderToken) return;
        state.workspaceData = { commandCenter, selectedClubId, selectedClubWorkspace: workspace };

        const rows = clubs.map(row => `
            <tr>
                <td><strong>${escapeHtml(row.name || "Club")}</strong><div class="table-meta">${escapeHtml(row.slug || "")}</div></td>
                <td>${renderStatusPill("", row.status || "unknown")}</td>
                <td>${escapeHtml(row.readiness_status || "-")}</td>
                <td>${escapeHtml(formatInteger(row.score || 0))}</td>
                <td>${escapeHtml((row.modules || []).join(", ") || "No modules")}</td>
                <td>
                    <div class="inline-actions">
                        <button type="button" class="button secondary" data-nav-workspace="clubs" data-club-id="${escapeHtml(row.id)}">Open</button>
                        <button type="button" class="button ghost" data-nav-workspace="onboarding" data-club-id="${escapeHtml(row.id)}">Setup</button>
                    </div>
                </td>
            </tr>
        `);

        els.root.innerHTML = `
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h3>Clubs</h3>
                        <p>Each club now opens as a real workspace with detail and next-step visibility.</p>
                    </div>
                </div>
                ${renderTable(["Club", "Status", "Readiness", "Score", "Modules", "Open"], rows)}
            </section>
            ${renderSelectedClubCards(workspace)}
        `;
    }

    function onboardingDefaults(commandCenter, workspace) {
        const currentYear = new Date().getFullYear();
        const club = workspace?.club || {};
        const profile = workspace?.profile || {};
        const enabledModules = Array.isArray(profile.enabled_modules) ? profile.enabled_modules : ["golf", "members", "communications"];
        const adminCandidate = (workspace?.staff || []).find(row => String(row.role || "").toLowerCase() === "admin");
        const annualTargets = Array.isArray(workspace?.annual_targets) ? workspace.annual_targets : [];
        const roundsTarget = annualTargets.find(row => row.metric === "rounds");
        const revenueTarget = annualTargets.find(row => row.metric === "revenue");
        return {
            club_id: positiveInt(club.id),
            club_name: club.name || "",
            club_slug: club.slug || "",
            display_name: profile.display_name || club.name || "",
            status: club.status || "onboarding",
            active: Boolean(club.active !== false),
            is_demo: Boolean(club.is_demo),
            location: profile.location || "",
            website: profile.website || "",
            contact_email: profile.contact_email || "",
            contact_phone: profile.contact_phone || "",
            tagline: profile.tagline || "",
            currency_symbol: profile.currency_symbol || "R",
            pricing_template: (commandCenter?.catalog?.pricing_templates || [])[0]?.key || "country_club_standard",
            enabled_modules: enabledModules,
            annual_year: currentYear,
            annual_rounds: roundsTarget?.annual_target || "",
            annual_revenue: revenueTarget?.annual_target || "",
            admin_name: adminCandidate?.name || "",
            admin_email: adminCandidate?.email || "",
            admin_password: "",
        };
    }

    async function renderSuperOnboarding(token) {
        const commandCenter = await fetchJson("/api/super/command-center");
        if (token !== state.renderToken) return;
        const clubs = Array.isArray(commandCenter.clubs) ? commandCenter.clubs : [];
        const preferredClub = positiveInt(state.route.clubId)
            || positiveInt((commandCenter.needs_action || [])[0]?.club_id)
            || positiveInt(clubs[0]?.id);
        const workspace = preferredClub ? await fetchJson(`/api/super/clubs/${preferredClub}/workspace`) : null;
        if (token !== state.renderToken) return;

        const defaults = onboardingDefaults(commandCenter, workspace);
        state.workspaceData = { commandCenter, onboardingWorkspace: workspace, onboardingDefaults: defaults };

        const moduleCatalog = Array.isArray(commandCenter.catalog?.modules) ? commandCenter.catalog.modules : [];
        const pricingTemplates = Array.isArray(commandCenter.catalog?.pricing_templates) ? commandCenter.catalog.pricing_templates : [];

        els.root.innerHTML = `
            <section class="split-grid">
                <form class="form-card" id="onboarding-form">
                    <div class="panel-head">
                        <div>
                            <h3>${defaults.club_id ? "Resume club setup" : "Create club"}</h3>
                            <p>Club creation, modules, targets, and admin access are now one intentional workflow.</p>
                        </div>
                    </div>
                    <input type="hidden" name="club_id" value="${escapeHtml(defaults.club_id || "")}">
                    <div class="field-grid">
                        <div class="field"><label>Club Name</label><input name="club_name" value="${escapeHtml(defaults.club_name)}" required></div>
                        <div class="field"><label>Club Slug</label><input name="club_slug" value="${escapeHtml(defaults.club_slug)}"></div>
                        <div class="field"><label>Display Name</label><input name="display_name" value="${escapeHtml(defaults.display_name)}"></div>
                        <div class="field">
                            <label>Status</label>
                            <select name="status">
                                ${["draft", "onboarding", "live", "inactive", "demo"].map(value => `
                                    <option value="${value}" ${defaults.status === value ? "selected" : ""}>${escapeHtml(value)}</option>
                                `).join("")}
                            </select>
                        </div>
                        <div class="field"><label>Location</label><input name="location" value="${escapeHtml(defaults.location)}"></div>
                        <div class="field"><label>Currency Symbol</label><input name="currency_symbol" value="${escapeHtml(defaults.currency_symbol)}" maxlength="4"></div>
                        <div class="field"><label>Contact Email</label><input name="contact_email" type="email" value="${escapeHtml(defaults.contact_email)}"></div>
                        <div class="field"><label>Contact Phone</label><input name="contact_phone" value="${escapeHtml(defaults.contact_phone)}"></div>
                        <div class="field"><label>Website</label><input name="website" value="${escapeHtml(defaults.website)}"></div>
                        <div class="field"><label>Tagline</label><input name="tagline" value="${escapeHtml(defaults.tagline)}"></div>
                        <div class="field">
                            <label>Pricing Template</label>
                            <select name="pricing_template">
                                ${pricingTemplates.map(row => `
                                    <option value="${escapeHtml(row.key)}" ${defaults.pricing_template === row.key ? "selected" : ""}>${escapeHtml(row.label)}</option>
                                `).join("")}
                            </select>
                        </div>
                        <div class="checkbox-card"><label><input type="checkbox" name="active" value="1" ${defaults.active ? "checked" : ""}> Active club</label><p>Inactive clubs stay off the live path.</p></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="is_demo" value="1" ${defaults.is_demo ? "checked" : ""}> Demo environment</label><p>Marks this club as intentional demo context.</p></div>
                    </div>
                    <div class="panel-head">
                        <div>
                            <h4>Enabled modules</h4>
                            <p>Keep golf central and only enable the operations that matter for this club.</p>
                        </div>
                    </div>
                    <div class="checkbox-grid">
                        ${moduleCatalog.map(row => `
                            <div class="checkbox-card">
                                <label><input type="checkbox" name="enabled_modules" value="${escapeHtml(row.key)}" ${defaults.enabled_modules.includes(row.key) ? "checked" : ""}> ${escapeHtml(row.label)}</label>
                                <p>${escapeHtml(row.description || "")}</p>
                            </div>
                        `).join("")}
                    </div>
                    <div class="panel-head">
                        <div>
                            <h4>Targets & admin access</h4>
                            <p>Keep launch readiness connected to goals and the right club admin account.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Target Year</label><input name="annual_year" type="number" min="2024" max="2100" value="${escapeHtml(defaults.annual_year)}"></div>
                        <div class="field"><label>Annual Rounds</label><input name="annual_rounds" type="number" min="0" step="1" value="${escapeHtml(defaults.annual_rounds)}"></div>
                        <div class="field"><label>Annual Revenue</label><input name="annual_revenue" type="number" min="0" step="0.01" value="${escapeHtml(defaults.annual_revenue)}"></div>
                        <div class="field"><label>Club Admin Name</label><input name="admin_name" value="${escapeHtml(defaults.admin_name)}"></div>
                        <div class="field"><label>Club Admin Email</label><input name="admin_email" type="email" value="${escapeHtml(defaults.admin_email)}"></div>
                        <div class="field"><label>Club Admin Password</label><input name="admin_password" type="password" value="${escapeHtml(defaults.admin_password)}"></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save club setup</button>
                        <button type="button" class="button secondary" data-nav-workspace="clubs" ${defaults.club_id ? `data-club-id="${escapeHtml(defaults.club_id)}"` : ""}>Open club workspace</button>
                    </div>
                </form>
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>${workspace?.club?.name ? escapeHtml(workspace.club.name) : "Selected club"}</h3>
                            <p>${escapeHtml(workspace?.readiness?.next_step || "Pick a club from the portfolio to resume setup.")}</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${(clubs || []).slice(0, 8).map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.name || "Club")}</span>
                                    ${renderStatusPill("", row.status || "unknown")}
                                </div>
                                <div class="list-meta">${escapeHtml(row.next_step || row.readiness_status || "")}</div>
                                <div class="inline-actions">
                                    <button type="button" class="button secondary" data-nav-workspace="onboarding" data-club-id="${escapeHtml(row.id)}">Load</button>
                                    <button type="button" class="button ghost" data-nav-workspace="clubs" data-club-id="${escapeHtml(row.id)}">Workspace</button>
                                </div>
                            </div>
                        `).join("") || `<div class="empty-state">No clubs available yet.</div>`}
                    </div>
                </section>
            </section>
        `;
    }

    async function renderSuperDemo(token) {
        const payload = await fetchJson("/api/super/command-center");
        if (token !== state.renderToken) return;
        state.workspaceData = { demo: payload.demo_environment, commandCenter: payload };
        const demo = payload.demo_environment || {};
        const personas = Array.isArray(demo.personas) ? demo.personas : [];
        const demoClubId = positiveInt(state.route.clubId) || positiveInt(demo.club_id);

        els.root.innerHTML = `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Demo environment</h3>
                        <p>Harbour Point demo access is now intentional, explicit, and separated from normal club admin context.</p>
                    </div>
                    <div class="inline-actions">
                        ${renderStatusPill("Status", demo.status || "missing")}
                        ${demo.club_name ? `<span class="metric-pill">${escapeHtml(demo.club_name)}</span>` : ""}
                    </div>
                </div>
                ${metricCards([
                    { label: "Demo Club", value: escapeHtml(demo.club_name || "Not ready"), meta: "Current demo workspace" },
                    { label: "Personas", value: formatInteger(personas.length), meta: "Seeded demo accounts" },
                    { label: "Club Slug", value: escapeHtml(demo.club_slug || "-"), meta: "Used for preview routing" },
                    { label: "Preview", value: demoClubId ? "Available" : "Not ready", meta: "Super admin intentional club preview" },
                ])}
                <div class="button-row">
                    <button type="button" class="button" data-demo-ensure="1">Ensure demo environment</button>
                    ${demoClubId ? `<button type="button" class="button secondary" data-nav-workspace="clubs" data-club-id="${escapeHtml(demoClubId)}">Open club workspace</button>` : ""}
                </div>
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Demo personas</h4>
                        <p>Credential sets remain visible here for walkthroughs, not mixed into club admin shells.</p>
                    </div>
                </div>
                <div class="module-grid">
                    ${personas.length ? personas.map(row => `
                        <article class="module-card">
                            <header>
                                <div>
                                    <h4>${escapeHtml(row.label || row.role_type || "Persona")}</h4>
                                    <p>${escapeHtml(row.email || "")}</p>
                                </div>
                                <span class="metric-pill">${escapeHtml(row.role_type || "")}</span>
                            </header>
                            <div class="stack">
                                <div class="detail-row"><span class="row-key">Password</span><span class="row-value">${escapeHtml(row.password || "")}</span></div>
                            </div>
                        </article>
                    `).join("") : `<div class="empty-state">No demo personas are currently available.</div>`}
                </div>
            </section>
        `;
    }

    async function renderSuperUsers(token) {
        const clubs = await fetchJson("/api/super/clubs");
        if (token !== state.renderToken) return;
        const selectedClubId = positiveInt(state.route.clubId);
        const query = selectedClubId ? `?club_id=${selectedClubId}` : "";
        const staff = await fetchJson(`/api/super/staff${query}`);
        if (token !== state.renderToken) return;
        state.workspaceData = { clubs, staff, selectedClubId };

        const rows = (staff || []).map(row => {
            const club = (clubs || []).find(item => Number(item.id) === Number(row.club_id));
            return `
                <tr>
                    <td><strong>${escapeHtml(row.name || "")}</strong><div class="table-meta">${escapeHtml(row.email || "")}</div></td>
                    <td>${renderStatusPill("", row.role || "staff")}</td>
                    <td>${escapeHtml(club?.name || "-")}</td>
                    <td>${escapeHtml(club?.slug || "-")}</td>
                </tr>
            `;
        });

        els.root.innerHTML = `
            <section class="split-grid">
                <form class="form-card" id="super-user-form">
                    <div class="panel-head">
                        <div>
                            <h3>Create or reset staff access</h3>
                            <p>Super admin owns platform role assignment; club admins do not see this workflow.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Name</label><input name="name" required></div>
                        <div class="field"><label>Email</label><input name="email" type="email" required></div>
                        <div class="field"><label>Password</label><input name="password" type="password" required></div>
                        <div class="field">
                            <label>Role</label>
                            <select name="role">
                                <option value="admin">Club Admin</option>
                                <option value="club_staff">Staff</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Club</label>
                            <select name="club_id">
                                ${(clubs || []).map(row => `
                                    <option value="${escapeHtml(row.id)}" ${selectedClubId === row.id ? "selected" : ""}>${escapeHtml(row.name)}</option>
                                `).join("")}
                            </select>
                        </div>
                        <div class="checkbox-card">
                            <label><input type="checkbox" name="force_reset" value="1" checked> Force reset existing user</label>
                            <p>Use when an email already exists and needs the same club role refreshed.</p>
                        </div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save user</button>
                    </div>
                </form>
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Current staff access</h3>
                            <p>${selectedClubId ? "Filtered to the selected club." : "Platform-wide staff and admin accounts."}</p>
                        </div>
                    </div>
                    ${renderTable(["User", "Role", "Club", "Slug"], rows.length ? rows : [`<tr><td colspan="4"><div class="empty-state">No staff records found.</div></td></tr>`])}
                </section>
            </section>
        `;
    }

    async function renderSuperSettings(token) {
        const payload = await fetchJson("/api/super/command-center");
        if (token !== state.renderToken) return;
        state.workspaceData = { commandCenter: payload };
        const modules = Array.isArray(payload.catalog?.modules) ? payload.catalog.modules : [];
        const targets = Array.isArray(payload.catalog?.targets) ? payload.catalog.targets : [];
        const templates = Array.isArray(payload.catalog?.pricing_templates) ? payload.catalog.pricing_templates : [];

        els.root.innerHTML = `
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Module catalog</h3>
                            <p>Platform-wide module definitions used to keep onboarding and club shells consistent.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${modules.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.label || row.key)}</span>
                                    <span class="metric-pill">${row.default_enabled ? "Default on" : "Optional"}</span>
                                </div>
                                <div class="list-meta">${escapeHtml(row.description || "")}</div>
                            </div>
                        `).join("")}
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Pricing templates</h3>
                            <p>Controlled platform defaults for new club launches.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${templates.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.label || row.key)}</span>
                                    <span class="metric-pill">${escapeHtml(row.key || "")}</span>
                                </div>
                                <div class="list-meta">${escapeHtml(row.description || "")}</div>
                            </div>
                        `).join("")}
                    </div>
                </article>
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h3>Operational target catalog</h3>
                        <p>These target definitions drive club reporting and onboarding configuration.</p>
                    </div>
                </div>
                ${renderTable(
                    ["Operation", "Metric", "Label", "Unit"],
                    targets.map(row => `
                        <tr>
                            <td>${escapeHtml(MODULE_LABELS[row.operation_key] || row.operation_key)}</td>
                            <td>${escapeHtml(row.metric_key || "")}</td>
                            <td>${escapeHtml(row.label || "")}</td>
                            <td>${escapeHtml(row.unit || "")}</td>
                        </tr>
                    `)
                )}
            </section>
        `;
    }

    async function dashboardBundle() {
        const shell = roleShell();
        const requests = [
            fetchJson("/api/admin/dashboard"),
            fetchJson("/api/admin/operational-alerts"),
        ];
        if (shell === "staff") {
            requests.push(fetchJson("/api/admin/staff-role-context"));
            requests.push(fetchJson("/api/admin/communications?status=published&limit=6"));
        } else {
            requests.push(Promise.resolve(null));
            requests.push(fetchJson("/api/admin/communications?limit=6"));
        }
        const [dashboard, alerts, staffContext, communications] = await Promise.all(requests);
        return { dashboard, alerts, staffContext, communications };
    }

    function renderDashboardWorkspace(bundle, options = {}) {
        const dashboard = bundle.dashboard || {};
        const alerts = bundle.alerts || {};
        const communications = bundle.communications || {};
        const operationInsights = dashboard.operation_insights || {};
        const overviewKey = options.mode === "today" ? "golf" : "all";
        const insight = operationInsights[overviewKey] || operationInsights.all || {};
        const communicationRows = Array.isArray(communications.communications) ? communications.communications : [];
        const roleContext = bundle.staffContext || {};

        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>${options.mode === "today" ? "Today's operating board" : "Club overview"}</h3>
                        <p>${options.mode === "today"
                            ? escapeHtml(roleContext.role_label ? `${roleContext.role_label}. Start with the tee sheet, open alerts, and current member demand.` : "Start with the tee sheet, open alerts, and current member demand.")
                            : "A lighter landing view with current pace, active blockers, and the next action for club leadership."}</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Today's Bookings", value: formatInteger(dashboard.today_bookings || 0), meta: "Golf bookings scheduled today" },
                    { label: "Today's Revenue", value: formatCurrency(dashboard.today_revenue || 0), meta: "Across golf and enabled imported streams" },
                    { label: "Golf Day Pipeline", value: formatCurrency(dashboard.golf_day_pipeline_total || 0), meta: `${formatInteger(dashboard.golf_day_open_count || 0)} active golf-day booking(s)` },
                    { label: "Open Alerts", value: formatInteger(alerts.summary?.total || 0), meta: `${formatInteger(alerts.summary?.high || 0)} high-priority` },
                ])}
                <div class="button-row">
                    <button type="button" class="button" data-nav-workspace="golf" data-nav-panel="tee-sheet">Open tee sheet</button>
                    <button type="button" class="button secondary" data-nav-workspace="operations">Open operations</button>
                    <button type="button" class="button ghost" data-nav-workspace="communications">Open communications</button>
                </div>
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Operational alerts</h4>
                            <p>Only the current club's blockers appear here.</p>
                        </div>
                    </div>
                    ${renderAlerts(alerts.alerts)}
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Operational insight</h4>
                            <p>${escapeHtml(insight.note || "Current club performance highlights.")}</p>
                        </div>
                    </div>
                    ${metricCards((insight.cards || []).map(row => ({
                        label: row.label,
                        value: formatMaybe(row.value, row.format),
                        meta: row.format === "percent" ? "Current period signal" : "Current period view",
                    })))}
                    ${renderOperationalHighlights(insight.highlights)}
                </article>
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Current club communications</h4>
                        <p>${options.mode === "today" ? "Published notices stay visible for staff without exposing club setup tools." : "Recent club notices and communication status."}</p>
                    </div>
                </div>
                <div class="stack">
                    ${communicationRows.length ? communicationRows.map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${escapeHtml(row.title || "Notice")}</span>
                                ${renderStatusPill("", row.status || "draft")}
                            </div>
                            <div class="list-meta">${escapeHtml(row.summary || row.body || "")}</div>
                        </div>
                    `).join("") : `<div class="empty-state">No communications published for this club yet.</div>`}
                </div>
            </section>
        `;
    }

    function groupTeeRows(rows) {
        return (Array.isArray(rows) ? rows : []).map(row => {
            const bookings = Array.isArray(row.bookings) ? row.bookings : [];
            const occupied = bookings.reduce((sum, booking) => sum + Math.max(1, Number(booking.party_size || 1)), 0);
            const capacity = Math.max(1, Number(row.capacity || 4));
            return {
                ...row,
                bookings,
                occupied,
                available: Math.max(0, capacity - occupied),
            };
        });
    }

    async function golfBundle() {
        const date = clampYmd(state.route.date);
        const start = `${date}T00:00:00`;
        const end = `${addDaysYmd(date, 1)}T00:00:00`;
        const panel = state.route.panel || "tee-sheet";
        if (panel === "golf-days") {
            const [dashboard, bookings] = await Promise.all([
                fetchJson("/api/admin/dashboard"),
                fetchJson("/api/admin/golf-day-bookings"),
            ]);
            return { panel, dashboard, golfDays: bookings };
        }
        const [dashboard, rows] = await Promise.all([
            fetchJson("/api/admin/dashboard"),
            fetchJson(`/tsheet/staff-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
        ]);
        return {
            panel,
            dashboard,
            teeRows: groupTeeRows(rows),
            date,
        };
    }

    function renderBookingRows(rows) {
        return rows.map(slot => `
            <article class="slot-card">
                <div class="slot-head">
                    <div>
                        <div class="slot-time">${escapeHtml(formatTime(slot.tee_time))}</div>
                        <div class="slot-meta">Tee ${escapeHtml(slot.hole || "1")} · ${escapeHtml(formatInteger(slot.occupied))}/${escapeHtml(formatInteger(slot.capacity))} occupied</div>
                    </div>
                    <div class="inline-actions">
                        ${renderStatusPill("", slot.status || "open")}
                        ${slot.status !== "blocked" ? `<button type="button" class="button secondary" data-open-booking="${escapeHtml(slot.id)}">New booking</button>` : ""}
                    </div>
                </div>
                <div class="slot-bookings">
                    ${slot.bookings.length ? slot.bookings.map(booking => `
                        <div class="booking-row">
                            <div class="booking-row-top">
                                <strong>${escapeHtml(booking.player_name || "Booking")}</strong>
                                ${renderStatusPill("", booking.status || "booked")}
                            </div>
                            <div class="booking-row-meta">
                                ${escapeHtml([
                                    booking.player_email || "",
                                    booking.holes ? `${booking.holes} holes` : "",
                                    booking.prepaid ? "Prepaid" : "Pay on day",
                                    booking.cart ? "Cart" : "",
                                ].filter(Boolean).join(" · "))}
                            </div>
                            <div class="inline-actions">
                                <span class="metric-pill">${escapeHtml(formatCurrency(booking.price || 0))}</span>
                                ${(booking.status || "") === "booked" ? `<button type="button" class="button secondary" data-check-in="${escapeHtml(booking.id)}">Check in</button>` : ""}
                                ${(booking.status || "") === "booked" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(booking.id)}" data-status-value="no_show">No-show</button>` : ""}
                                ${(booking.status || "") === "booked" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(booking.id)}" data-status-value="cancelled">Cancel</button>` : ""}
                            </div>
                        </div>
                    `).join("") : `<div class="empty-state">No bookings on this slot yet.</div>`}
                </div>
            </article>
        `).join("");
    }

    function renderGolfWorkspace(bundle) {
        const panel = bundle.panel || "tee-sheet";
        if (panel === "golf-days") {
            const golfDays = bundle.golfDays || {};
            const rows = Array.isArray(golfDays.bookings) ? golfDays.bookings : [];
            return `
                <section class="hero-card">
                    <div class="panel-head">
                        <div>
                            <h3>Golf day pipeline</h3>
                            <p>Golf days now sit in a dedicated sub-workspace instead of being buried inside a generic dashboard.</p>
                        </div>
                    </div>
                    ${metricCards([
                        { label: "Open Events", value: formatInteger(golfDays.total || 0), meta: "Current golf-day bookings" },
                        { label: "Pipeline Value", value: formatCurrency(golfDays.total_amount || 0), meta: "Gross booked value" },
                        { label: "Outstanding", value: formatCurrency(golfDays.outstanding_balance || 0), meta: "Remaining balance due" },
                        { label: "Golf Revenue Today", value: formatCurrency(bundle.dashboard?.golf_revenue_today || 0), meta: "Today's golf revenue snapshot" },
                    ])}
                </section>
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Current golf-day bookings</h4>
                            <p>Event pipeline is visible in one place and no longer mixed into long-form sections.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${rows.length ? rows.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.event_name || "Golf day")}</span>
                                    ${renderStatusPill("", row.payment_status || "pending")}
                                </div>
                                <div class="list-meta">${escapeHtml(`${formatDate(row.event_date)} · ${formatCurrency(row.amount || 0)} · ${row.contact_name || "No contact set"}`)}</div>
                            </div>
                        `).join("") : `<div class="empty-state">No golf-day bookings yet.</div>`}
                    </div>
                </section>
            `;
        }

        const rows = Array.isArray(bundle.teeRows) ? bundle.teeRows : [];
        const occupied = rows.reduce((sum, row) => sum + Number(row.occupied || 0), 0);
        const capacity = rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0);
        const bookedSlots = rows.filter(row => Number(row.occupied || 0) > 0).length;
        const blockedSlots = rows.filter(row => String(row.status || "") === "blocked").length;

        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Tee sheet</h3>
                        <p>Golf stays central and opens as a real workspace with only the actions staff need.</p>
                    </div>
                    <div class="inline-actions">
                        <button type="button" class="button secondary" data-date-shift="-1">Previous day</button>
                        <span class="metric-pill">${escapeHtml(formatDate(bundle.date))}</span>
                        <button type="button" class="button secondary" data-date-shift="1">Next day</button>
                    </div>
                </div>
                ${metricCards([
                    { label: "Slots", value: formatInteger(rows.length), meta: "Rendered for the selected day" },
                    { label: "Booked Slots", value: formatInteger(bookedSlots), meta: "Slots carrying at least one booking" },
                    { label: "Occupancy", value: capacity ? formatPercent(occupied / capacity) : "0%", meta: `${formatInteger(occupied)}/${formatInteger(capacity)} player places used` },
                    { label: "Blocked Slots", value: formatInteger(blockedSlots), meta: "Blocked by closure or golf-day rules" },
                ])}
            </section>
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Day slots</h4>
                        <p>Bookings, check-in, and status actions are attached directly to the tee sheet.</p>
                    </div>
                </div>
                <div class="slot-grid">
                    ${rows.length ? renderBookingRows(rows) : `<div class="empty-state">No tee sheet rows exist for this date.</div>`}
                </div>
            </section>
        `;
    }

    async function operationsBundle() {
        const panel = state.route.panel || "overview";
        const dashboard = await fetchJson("/api/admin/dashboard");
        if (panel === "pro_shop") {
            const [products, sales] = await Promise.all([
                fetchJson("/api/admin/pro-shop/products?limit=100"),
                fetchJson("/api/admin/pro-shop/sales?limit=12&days=30"),
            ]);
            return { panel, dashboard, products, sales };
        }
        if (["tennis", "bowls"].includes(panel)) {
            const members = await fetchJson(`/api/admin/members?area=${encodeURIComponent(panel)}&limit=12&sort=recent_activity`);
            return { panel, dashboard, members };
        }
        return { panel, dashboard };
    }

    function renderOperationsOverview(bundle) {
        const insightMap = bundle.dashboard?.operation_insights || {};
        const modules = operationModules();
        if (!modules.length) {
            return `<section class="card"><div class="empty-state">No non-golf operations are enabled for this club.</div></section>`;
        }
        return `
            <section class="module-grid">
                ${modules.map(key => {
                    const insight = insightMap[key] || {};
                    return `
                        <article class="module-card">
                            <header>
                                <div>
                                    <h4>${escapeHtml(MODULE_LABELS[key] || key)}</h4>
                                    <p>${escapeHtml(insight.note || "Open this module for current operational detail.")}</p>
                                </div>
                                <span class="metric-pill">${escapeHtml(formatInteger((insight.cards || [])[0]?.value || 0))}</span>
                            </header>
                            ${metricCards((insight.cards || []).slice(0, 4).map(row => ({
                                label: row.label,
                                value: formatMaybe(row.value, row.format),
                                meta: "Current club signal",
                            })))}
                            <div class="button-row">
                                <button type="button" class="button secondary" data-nav-panel="${escapeHtml(key)}">Open ${escapeHtml(MODULE_LABELS[key] || key)}</button>
                            </div>
                        </article>
                    `;
                }).join("")}
            </section>
        `;
    }

    function renderOperationsWorkspace(bundle) {
        const panel = bundle.panel || "overview";
        const insightMap = bundle.dashboard?.operation_insights || {};
        if (panel === "overview") {
            return `
                <section class="hero-card">
                    <div class="panel-head">
                        <div>
                            <h3>Operations</h3>
                            <p>Enabled non-golf modules are grouped here instead of competing with golf in the main nav.</p>
                        </div>
                    </div>
                    ${renderOperationsOverview(bundle)}
                </section>
            `;
        }
        if (panel === "pro_shop") {
            const products = Array.isArray(bundle.products?.products) ? bundle.products.products : [];
            const sales = Array.isArray(bundle.sales?.sales) ? bundle.sales.sales : [];
            const inventory = insightMap.pro_shop?.inventory || {};
            return `
                <section class="hero-card">
                    <div class="panel-head">
                        <div>
                            <h3>Pro Shop</h3>
                            <p>Low stock, recent sales, and inventory value are grouped into one operational workspace.</p>
                        </div>
                    </div>
                    ${metricCards([
                        { label: "Products", value: formatInteger(inventory.active_products || products.length), meta: "Active products in inventory" },
                        { label: "Stock Units", value: formatInteger(inventory.stock_units || 0), meta: "Units currently on hand" },
                        { label: "Stock Value", value: formatCurrency(inventory.stock_value || 0), meta: "Estimated inventory carrying value" },
                        { label: "Low Stock", value: formatInteger(bundle.products?.low_stock_count || 0), meta: "Products at or below reorder level" },
                    ])}
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
                                        <div class="list-title">${escapeHtml(row.name || row.sku || "Product")}</div>
                                        <div class="list-meta">${escapeHtml(row.category || "Uncategorised")} · ${escapeHtml(row.sku || "")}</div>
                                    </div>
                                    <div class="inline-actions">
                                        <span class="metric-pill">${escapeHtml(formatCurrency(row.unit_price || 0))}</span>
                                        ${renderStatusPill("", Number(row.stock_qty || 0) <= Number(row.reorder_level || 0) ? "high" : "active")}
                                        <span class="metric-pill">${escapeHtml(formatInteger(row.stock_qty || 0))} in stock</span>
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
                                        <span class="list-title">${escapeHtml(row.customer_name || "Walk-in sale")}</span>
                                        <span class="metric-pill">${escapeHtml(formatCurrency(row.total || 0))}</span>
                                    </div>
                                    <div class="list-meta">${escapeHtml(`${formatDateTime(row.sold_at)} · ${(row.items || []).length} line item(s) · ${row.payment_method || ""}`)}</div>
                                </div>
                            `).join("") || `<div class="empty-state">No recent pro-shop sales.</div>`}
                        </div>
                    </article>
                </section>
            `;
        }

        if (["tennis", "bowls", "pub"].includes(panel)) {
            const insight = insightMap[panel] || {};
            const members = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
            return `
                <section class="hero-card">
                    <div class="panel-head">
                        <div>
                            <h3>${escapeHtml(MODULE_LABELS[panel] || panel)}</h3>
                            <p>${escapeHtml(insight.note || "Operational detail for the selected module.")}</p>
                        </div>
                    </div>
                    ${metricCards((insight.cards || []).map(row => ({
                        label: row.label,
                        value: formatMaybe(row.value, row.format),
                        meta: "Current club signal",
                    })))}
                </section>
                <section class="split-grid">
                    <article class="card">
                        <div class="panel-head">
                            <div>
                                <h4>Highlights</h4>
                                <p>Current pace and signal summaries for this operation.</p>
                            </div>
                        </div>
                        ${renderOperationalHighlights(insight.highlights)}
                    </article>
                    <article class="card">
                        <div class="panel-head">
                            <div>
                                <h4>${panel === "pub" ? "Imported revenue posture" : "Relevant members"}</h4>
                                <p>${panel === "pub"
                                    ? "Pub operations currently use imported revenue visibility rather than direct inventory actions."
                                    : `Recent member activity for ${MODULE_LABELS[panel] || panel}.`}</p>
                            </div>
                        </div>
                        <div class="stack">
                            ${panel === "pub"
                                ? `<div class="detail-row"><span class="row-key">Revenue today</span><span class="row-value">${escapeHtml(formatCurrency((bundle.dashboard?.revenue_streams?.pub || {}).today_revenue || 0))}</span></div>
                                   <div class="detail-row"><span class="row-key">Revenue this week</span><span class="row-value">${escapeHtml(formatCurrency((bundle.dashboard?.revenue_streams?.pub || {}).week_revenue || 0))}</span></div>
                                   <div class="detail-row"><span class="row-key">Transactions this week</span><span class="row-value">${escapeHtml(formatInteger((bundle.dashboard?.revenue_streams?.pub || {}).week_transactions || 0))}</span></div>`
                                : members.length ? members.map(row => `
                                    <div class="list-row">
                                        <div class="list-row-top">
                                            <span class="list-title">${escapeHtml(row.name || "Member")}</span>
                                            ${renderStatusPill("", row.membership_status || "active")}
                                        </div>
                                        <div class="list-meta">${escapeHtml(`${row.primary_operation || ""} · ${formatInteger(row.bookings_count || 0)} booking(s) · ${formatCurrency(row.total_spent || 0)}`)}</div>
                                    </div>
                                `).join("") : `<div class="empty-state">No relevant member records found.</div>`}
                        </div>
                    </article>
                </section>
            `;
        }

        return `<section class="card"><div class="empty-state">This operation is not yet enabled for the current club.</div></section>`;
    }

    async function membersBundle() {
        const panel = state.route.panel || "members";
        if (panel === "staff" && roleShell() === "club_admin") {
            const [staff, members] = await Promise.all([
                fetchJson("/api/admin/staff?limit=50"),
                fetchJson("/api/admin/members?limit=8&sort=recent_activity"),
            ]);
            return { panel, staff, members };
        }
        const members = await fetchJson("/api/admin/members?limit=50&sort=recent_activity");
        return { panel: "members", members };
    }

    function renderMembersWorkspace(bundle) {
        const panel = bundle.panel || "members";
        if (panel === "staff" && roleShell() === "club_admin") {
            const rows = Array.isArray(bundle.staff?.staff) ? bundle.staff.staff : [];
            return `
                <section class="split-grid">
                    <form class="form-card" id="club-staff-form">
                        <div class="panel-head">
                            <div>
                                <h3>Add staff</h3>
                                <p>Club admin can add staff for the current club only.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field"><label>Name</label><input name="name" required></div>
                            <div class="field"><label>Email</label><input name="email" type="email" required></div>
                            <div class="field"><label>Password</label><input name="password" type="password" required></div>
                            <div class="checkbox-card">
                                <label><input type="checkbox" name="force_reset" value="1"> Force reset if user exists in this club</label>
                                <p>Users cannot be moved across clubs from this shell.</p>
                            </div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Create staff user</button>
                        </div>
                    </form>
                    <section class="card">
                        <div class="panel-head">
                            <div>
                                <h3>Current staff</h3>
                                <p>Only this club's staff records are shown.</p>
                            </div>
                        </div>
                        ${renderTable(
                            ["Name", "Role", "Operational Role", "Email"],
                            rows.length ? rows.map(row => `
                                <tr>
                                    <td><strong>${escapeHtml(row.name || "")}</strong></td>
                                    <td>${escapeHtml(row.role || "")}</td>
                                    <td>${escapeHtml(row.operational_role || row.operation_area || "-")}</td>
                                    <td>${escapeHtml(row.email || "")}</td>
                                </tr>
                            `) : [`<tr><td colspan="4"><div class="empty-state">No staff users found.</div></td></tr>`]
                        )}
                    </section>
                </section>
            `;
        }

        const rows = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
        return `
            <section class="split-grid">
                ${roleShell() === "club_admin" ? `
                    <form class="form-card" id="member-form">
                        <div class="panel-head">
                            <div>
                                <h3>Add member</h3>
                                <p>Fast club-side member creation with the fields staff actually use first.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field"><label>First Name</label><input name="first_name" required></div>
                            <div class="field"><label>Last Name</label><input name="last_name" required></div>
                            <div class="field"><label>Email</label><input name="email" type="email"></div>
                            <div class="field"><label>Member Number</label><input name="member_number"></div>
                            <div class="field">
                                <label>Primary Operation</label>
                                <select name="primary_operation">
                                    <option value="golf">Golf</option>
                                    ${operationModules().map(key => `<option value="${escapeHtml(key)}">${escapeHtml(MODULE_LABELS[key] || key)}</option>`).join("")}
                                </select>
                            </div>
                            <div class="field"><label>Home Club</label><input name="home_club" value="${escapeHtml(activeClub()?.display_name || activeClub()?.name || "")}"></div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Create member</button>
                        </div>
                    </form>
                ` : ""}
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Members</h3>
                            <p>Sorted by operational recency to keep service work practical.</p>
                        </div>
                    </div>
                    ${renderTable(
                        ["Member", "Operation", "Status", "Bookings", "Spend"],
                        rows.length ? rows.map(row => `
                            <tr>
                                <td><strong>${escapeHtml(row.name || "")}</strong><div class="table-meta">${escapeHtml(row.member_number || row.email || "")}</div></td>
                                <td>${escapeHtml(MODULE_LABELS[row.primary_operation] || row.primary_operation || "-")}</td>
                                <td>${escapeHtml(row.membership_status || "-")}</td>
                                <td>${escapeHtml(formatInteger(row.bookings_count || 0))}</td>
                                <td>${escapeHtml(formatCurrency(row.total_spent || 0))}</td>
                            </tr>
                        `) : [`<tr><td colspan="5"><div class="empty-state">No members found.</div></td></tr>`]
                    )}
                </section>
            </section>
        `;
    }

    async function communicationsBundle() {
        const shell = roleShell();
        const query = shell === "staff" ? "/api/admin/communications?status=published&limit=50" : "/api/admin/communications?limit=50";
        return fetchJson(query);
    }

    function renderCommunicationsWorkspace(payload) {
        const rows = Array.isArray(payload.communications) ? payload.communications : [];
        const canEdit = roleShell() === "club_admin";
        return `
            <section class="split-grid">
                ${canEdit ? `
                    <form class="form-card" id="communication-form">
                        <div class="panel-head">
                            <div>
                                <h3>Create communication</h3>
                                <p>Club communications are now grouped into one workspace instead of scattered across generic dashboard blocks.</p>
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
                            <div class="field" style="grid-column: 1 / -1;">
                                <label>Body</label>
                                <textarea name="body" required></textarea>
                            </div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Save communication</button>
                        </div>
                    </form>
                ` : `
                    <section class="card">
                        <div class="panel-head">
                            <div>
                                <h3>Staff view</h3>
                                <p>Staff can read published club notices without receiving admin-only messaging controls.</p>
                            </div>
                        </div>
                        <div class="detail-row"><span class="row-key">Scope</span><span class="row-value">Published communications only</span></div>
                    </section>
                `}
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Current communications</h3>
                            <p>Only this club's communications are shown here.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${rows.length ? rows.map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.title || "Communication")}</span>
                                    ${renderStatusPill("", row.status || "draft")}
                                </div>
                                <div class="list-meta">${escapeHtml(`${row.kind || ""} · ${row.audience || ""} · ${formatDateTime(row.published_at || row.updated_at)}`)}</div>
                                <div class="list-meta">${escapeHtml(row.summary || row.body || "")}</div>
                            </div>
                        `).join("") : `<div class="empty-state">No communications found for this club.</div>`}
                    </div>
                </section>
            </section>
        `;
    }

    async function reportsBundle() {
        const [dashboard, revenue, targets] = await Promise.all([
            fetchJson("/api/admin/dashboard"),
            fetchJson("/api/admin/revenue?period=mtd"),
            fetchJson("/api/admin/operation-targets"),
        ]);
        return { dashboard, revenue, targets };
    }

    function renderReportsWorkspace(bundle) {
        const panel = state.route.panel || "performance";
        const revenue = bundle.revenue || {};
        const targets = Array.isArray(bundle.targets?.targets) ? bundle.targets.targets : [];
        if (panel === "targets") {
            return `
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Operational targets</h3>
                            <p>Targets stay close to operations rather than hiding in generic configuration pages.</p>
                        </div>
                    </div>
                    ${renderTable(
                        ["Operation", "Metric", "Target", "Unit"],
                        targets.map(row => `
                            <tr>
                                <td>${escapeHtml(MODULE_LABELS[row.operation_key] || row.operation_key)}</td>
                                <td>${escapeHtml(row.label || row.metric_key || "")}</td>
                                <td>${escapeHtml(formatInteger(row.target_value || 0))}</td>
                                <td>${escapeHtml(row.unit || "")}</td>
                            </tr>
                        `)
                    )}
                </section>
            `;
        }

        const streamRows = Array.isArray(revenue.other_by_stream) ? revenue.other_by_stream : [];
        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Performance</h3>
                        <p>Reports are now role-useful and current-club specific, not passive vanity dashboards.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Period Days", value: formatInteger(revenue.period_days || 0), meta: "Current revenue reporting window" },
                    { label: "Annual Target", value: formatCurrency(revenue.annual_revenue_target || 0), meta: "Configured revenue target" },
                    { label: "Current Target Pace", value: revenue.target_revenue != null ? formatCurrency(revenue.target_revenue) : "-", meta: "Expected position by this point in the year" },
                    { label: "Target Context", value: String(revenue.period || "mtd").toUpperCase(), meta: `Anchor ${escapeHtml(revenue.anchor_date || "-")}` },
                ])}
            </section>
            <section class="split-grid">
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Revenue streams</h4>
                            <p>Imported and native revenue is separated clearly.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${streamRows.length ? streamRows.map(row => `
                            <div class="detail-row">
                                <span class="row-key">${escapeHtml(MODULE_LABELS[row.stream] || row.stream)}</span>
                                <span class="row-value">${escapeHtml(formatCurrency(row.amount || 0))} · ${escapeHtml(formatInteger(row.transactions || 0))} txns</span>
                            </div>
                        `).join("") : `<div class="empty-state">No imported non-golf revenue streams available.</div>`}
                    </div>
                </article>
                <article class="card">
                    <div class="panel-head">
                        <div>
                            <h4>Dashboard posture</h4>
                            <p>Role-useful commercial signals from the active club dashboard.</p>
                        </div>
                    </div>
                    ${metricCards([
                        { label: "Today Revenue", value: formatCurrency(bundle.dashboard?.today_revenue || 0), meta: "Current club snapshot" },
                        { label: "Week Revenue", value: formatCurrency(bundle.dashboard?.week_revenue || 0), meta: "Rolling 7-day performance" },
                        { label: "Golf Revenue", value: formatCurrency(bundle.dashboard?.golf_revenue_total || 0), meta: "Golf revenue total" },
                        { label: "Pro Shop Revenue", value: formatCurrency(bundle.dashboard?.pro_shop_revenue_total || 0), meta: "Pro shop revenue total" },
                    ])}
                </article>
            </section>
        `;
    }

    async function settingsBundle() {
        const [profile, bookingWindow, targets] = await Promise.all([
            fetchJson("/api/admin/club-profile"),
            fetchJson("/api/admin/booking-window"),
            fetchJson("/api/admin/operation-targets"),
        ]);
        return { profile, bookingWindow, targets };
    }

    function renderSettingsWorkspace(bundle) {
        const panel = state.route.panel || "profile";
        if (panel === "booking-window") {
            return `
                <form class="form-card" id="booking-window-form">
                    <div class="panel-head">
                        <div>
                            <h3>Booking window</h3>
                            <p>Club-side booking rules stay in a dedicated settings area, not mixed into daily operations.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Member Days</label><input name="member_days" type="number" min="0" max="365" value="${escapeHtml(bundle.bookingWindow?.member_days || 0)}"></div>
                        <div class="field"><label>Affiliated Visitor Days</label><input name="affiliated_days" type="number" min="0" max="365" value="${escapeHtml(bundle.bookingWindow?.affiliated_days || 0)}"></div>
                        <div class="field"><label>Non-affiliated Visitor Days</label><input name="non_affiliated_days" type="number" min="0" max="365" value="${escapeHtml(bundle.bookingWindow?.non_affiliated_days || 0)}"></div>
                        <div class="field"><label>Group Cancel Days</label><input name="group_cancel_days" type="number" min="0" max="365" value="${escapeHtml(bundle.bookingWindow?.group_cancel_days || 0)}"></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save booking window</button>
                    </div>
                </form>
            `;
        }

        if (panel === "targets") {
            const targets = Array.isArray(bundle.targets?.targets) ? bundle.targets.targets : [];
            return `
                <form class="form-card" id="operational-targets-form">
                    <div class="panel-head">
                        <div>
                            <h3>Operational targets</h3>
                            <p>Club admins can manage the targets that directly support operations and reporting.</p>
                        </div>
                    </div>
                    <input type="hidden" name="year" value="${escapeHtml(bundle.targets?.year || new Date().getFullYear())}">
                    <div class="stack">
                        ${targets.map(row => `
                            <div class="detail-row">
                                <span class="row-key">${escapeHtml(row.label || `${row.operation_key} ${row.metric_key}`)}</span>
                                <input type="number" step="0.01" min="0" name="target__${escapeHtml(row.operation_key)}__${escapeHtml(row.metric_key)}" value="${escapeHtml(row.target_value || 0)}" style="max-width:180px;">
                            </div>
                        `).join("")}
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save targets</button>
                    </div>
                </form>
            `;
        }

        return `
            <form class="form-card" id="club-profile-form">
                <div class="panel-head">
                    <div>
                        <h3>Club profile</h3>
                        <p>Club-side settings are limited to practical branding and member-facing identity.</p>
                    </div>
                </div>
                <div class="field-grid">
                    <div class="field"><label>Club Name</label><input name="club_name" value="${escapeHtml(bundle.profile?.club_name || "")}"></div>
                    <div class="field"><label>Display Name</label><input name="display_name" value="${escapeHtml(bundle.profile?.display_name || "")}"></div>
                    <div class="field"><label>Tagline</label><input name="tagline" value="${escapeHtml(bundle.profile?.tagline || "")}"></div>
                    <div class="field"><label>Location</label><input name="location" value="${escapeHtml(bundle.profile?.location || "")}"></div>
                    <div class="field"><label>Website</label><input name="website" value="${escapeHtml(bundle.profile?.website || "")}"></div>
                    <div class="field"><label>Contact Email</label><input name="contact_email" type="email" value="${escapeHtml(bundle.profile?.contact_email || "")}"></div>
                    <div class="field"><label>Contact Phone</label><input name="contact_phone" value="${escapeHtml(bundle.profile?.contact_phone || "")}"></div>
                    <div class="field"><label>Currency Symbol</label><input name="currency_symbol" value="${escapeHtml(bundle.profile?.currency_symbol || "R")}" maxlength="4"></div>
                </div>
                <div class="button-row">
                    <button type="submit" class="button">Save club profile</button>
                </div>
            </form>
        `;
    }

    async function renderCurrentWorkspace() {
        const token = ++state.renderToken;
        renderWorkspaceLoading("Loading role-specific workspace.");
        try {
            await refreshBootstrap(false);
            if (roleShell() === "member") {
                window.location.href = state.bootstrap.landing_path || "/frontend/dashboard.html?view=home";
                return;
            }
            state.route = parseRoute();
            renderChrome();

            let html = "";
            if (roleShell() === "super_admin") {
                if (state.route.workspace === "overview") await renderSuperOverview(token);
                else if (state.route.workspace === "clubs") await renderSuperClubs(token);
                else if (state.route.workspace === "onboarding") await renderSuperOnboarding(token);
                else if (state.route.workspace === "demo") await renderSuperDemo(token);
                else if (state.route.workspace === "users") await renderSuperUsers(token);
                else if (state.route.workspace === "settings") await renderSuperSettings(token);
            } else if (roleShell() === "club_admin" || roleShell() === "staff") {
                if (state.route.workspace === "overview" || state.route.workspace === "today") {
                    const bundle = await dashboardBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderDashboardWorkspace(bundle, { mode: state.route.workspace === "today" ? "today" : "overview" });
                } else if (state.route.workspace === "golf") {
                    const bundle = await golfBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderGolfWorkspace(bundle);
                } else if (state.route.workspace === "operations") {
                    const bundle = await operationsBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderOperationsWorkspace(bundle);
                } else if (state.route.workspace === "members") {
                    const bundle = await membersBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderMembersWorkspace(bundle);
                } else if (state.route.workspace === "communications") {
                    const bundle = await communicationsBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderCommunicationsWorkspace(bundle);
                } else if (state.route.workspace === "reports" && roleShell() === "club_admin") {
                    const bundle = await reportsBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderReportsWorkspace(bundle);
                } else if (state.route.workspace === "settings" && roleShell() === "club_admin") {
                    const bundle = await settingsBundle();
                    if (token !== state.renderToken) return;
                    state.workspaceData = bundle;
                    html = renderSettingsWorkspace(bundle);
                }
            }

            if (token !== state.renderToken) return;
            if (html) els.root.innerHTML = html;
            setOverlay(false);
        } catch (error) {
            if (token !== state.renderToken) return;
            logClientError("renderCurrentWorkspace", error);
            if (Number(error?.status || 0) === 401) {
                window.GreenLinkSession.clearSessionState();
                window.location.href = "/frontend/index.html";
                return;
            }
            if (error?.code === "INVALID_BOOTSTRAP") {
                window.GreenLinkSession.clearSessionState();
                renderFatalShellError("Session reset required", runtimeFailureMessage(error, "Session bootstrap returned invalid data."));
                return;
            }
            els.root.innerHTML = `
                <section class="card">
                    <div class="panel-head">
                        <div>
                            <h3>Workspace error</h3>
                            <p>${escapeHtml(runtimeFailureMessage(error, "Failed to load workspace."))}</p>
                        </div>
                    </div>
                    <div class="button-row">
                        <button type="button" class="button" data-refresh="1">Try again</button>
                    </div>
                </section>
            `;
            setOverlay(false);
        }
    }

    function collectCheckedValues(form, fieldName) {
        return Array.from(form.querySelectorAll(`input[name="${fieldName}"]:checked`)).map(input => String(input.value || ""));
    }

    async function submitOnboardingForm(form) {
        const payload = {
            club_name: String(form.club_name.value || "").trim(),
            club_slug: String(form.club_slug.value || "").trim() || null,
            display_name: String(form.display_name.value || "").trim() || null,
            status: String(form.status.value || "onboarding").trim(),
            active: Boolean(form.active.checked),
            is_demo: Boolean(form.is_demo.checked),
            location: String(form.location.value || "").trim() || null,
            website: String(form.website.value || "").trim() || null,
            contact_email: String(form.contact_email.value || "").trim() || null,
            contact_phone: String(form.contact_phone.value || "").trim() || null,
            tagline: String(form.tagline.value || "").trim() || null,
            currency_symbol: String(form.currency_symbol.value || "").trim() || null,
            pricing_template: String(form.pricing_template.value || "").trim() || "country_club_standard",
            enabled_modules: collectCheckedValues(form, "enabled_modules"),
            annual_targets: {
                year: Number(form.annual_year.value || new Date().getFullYear()),
                rounds: form.annual_rounds.value ? Number(form.annual_rounds.value) : null,
                revenue: form.annual_revenue.value ? Number(form.annual_revenue.value) : null,
            },
        };
        const clubId = positiveInt(form.club_id.value);
        if (clubId) payload.club_id = clubId;
        const adminEmail = String(form.admin_email.value || "").trim();
        const adminPassword = String(form.admin_password.value || "").trim();
        const adminName = String(form.admin_name.value || "").trim();
        if (adminEmail || adminPassword || adminName) {
            payload.admin_user = {
                name: adminName || adminEmail,
                email: adminEmail,
                password: adminPassword,
                force_reset: true,
            };
        }
        const result = await postJson("/api/super/clubs/setup", payload);
        showToast("Club setup saved.", "ok");
        navigate({ workspace: "clubs", clubId: positiveInt(result?.club?.id) || clubId || null });
    }

    async function submitSuperUserForm(form) {
        const payload = {
            name: String(form.name.value || "").trim(),
            email: String(form.email.value || "").trim(),
            password: String(form.password.value || "").trim(),
            role: String(form.role.value || "club_staff").trim(),
            club_id: Number(form.club_id.value || 0),
            force_reset: Boolean(form.force_reset.checked),
        };
        await postJson("/api/super/staff", payload);
        showToast("User access saved.", "ok");
        form.reset();
        navigate({ workspace: "users", clubId: payload.club_id }, { replace: true });
    }

    async function submitClubStaffForm(form) {
        const payload = {
            name: String(form.name.value || "").trim(),
            email: String(form.email.value || "").trim(),
            password: String(form.password.value || "").trim(),
            role: "club_staff",
            force_reset: Boolean(form.force_reset.checked),
        };
        await postJson("/api/admin/staff", payload);
        showToast("Staff user created.", "ok");
        form.reset();
        await renderCurrentWorkspace();
    }

    async function submitMemberForm(form) {
        const payload = {
            first_name: String(form.first_name.value || "").trim(),
            last_name: String(form.last_name.value || "").trim(),
            email: String(form.email.value || "").trim() || null,
            member_number: String(form.member_number.value || "").trim() || null,
            primary_operation: String(form.primary_operation.value || "golf").trim(),
            home_club: String(form.home_club.value || "").trim() || null,
            active: true,
        };
        await postJson("/api/admin/members", payload);
        showToast("Member created.", "ok");
        form.reset();
        await renderCurrentWorkspace();
    }

    async function submitCommunicationForm(form) {
        const payload = {
            kind: String(form.kind.value || "announcement").trim(),
            audience: String(form.audience.value || "members").trim(),
            status: String(form.status.value || "draft").trim(),
            title: String(form.title.value || "").trim(),
            summary: String(form.summary.value || "").trim() || null,
            body: String(form.body.value || "").trim(),
            pinned: Boolean(form.pinned.checked),
        };
        await postJson("/api/admin/communications", payload);
        showToast("Communication saved.", "ok");
        form.reset();
        await renderCurrentWorkspace();
    }

    async function submitBookingWindowForm(form) {
        const payload = {
            member_days: Number(form.member_days.value || 0),
            affiliated_days: Number(form.affiliated_days.value || 0),
            non_affiliated_days: Number(form.non_affiliated_days.value || 0),
            group_cancel_days: Number(form.group_cancel_days.value || 0),
        };
        await postJson("/api/admin/booking-window", payload, { method: "PUT" });
        showToast("Booking window saved.", "ok");
        await renderCurrentWorkspace();
    }

    async function submitClubProfileForm(form) {
        const payload = {
            club_name: String(form.club_name.value || "").trim(),
            display_name: String(form.display_name.value || "").trim() || null,
            tagline: String(form.tagline.value || "").trim() || null,
            location: String(form.location.value || "").trim() || null,
            website: String(form.website.value || "").trim() || null,
            contact_email: String(form.contact_email.value || "").trim() || null,
            contact_phone: String(form.contact_phone.value || "").trim() || null,
            currency_symbol: String(form.currency_symbol.value || "").trim() || null,
        };
        await postJson("/api/admin/club-profile", payload, { method: "PUT" });
        showToast("Club profile saved.", "ok");
        await refreshBootstrap(true);
        await renderCurrentWorkspace();
    }

    async function submitOperationalTargetsForm(form) {
        const current = Array.isArray(state.workspaceData.targets?.targets) ? state.workspaceData.targets.targets : [];
        const payload = {
            year: Number(form.year.value || new Date().getFullYear()),
            targets: current.map(row => ({
                operation_key: row.operation_key,
                metric_key: row.metric_key,
                target_value: Number(form[`target__${row.operation_key}__${row.metric_key}`].value || 0),
                unit: row.unit,
                notes: row.notes || null,
            })),
        };
        await postJson("/api/admin/operation-targets", payload, { method: "PUT" });
        showToast("Operational targets saved.", "ok");
        await renderCurrentWorkspace();
    }

    function findTeeRow(teeTimeId) {
        const rows = Array.isArray(state.workspaceData.teeRows) ? state.workspaceData.teeRows : [];
        return rows.find(row => Number(row.id) === Number(teeTimeId)) || null;
    }

    function openBookingModal(teeTimeId) {
        const row = findTeeRow(teeTimeId);
        if (!row) return;
        state.modalData = { teeTimeId: Number(teeTimeId) };
        openModal(
            "Create booking",
            `${formatDateTime(row.tee_time)} · Tee ${row.hole || "1"} · ${row.available} spot(s) available`,
            `
                <form id="booking-modal-form" class="stack">
                    <input type="hidden" name="tee_time_id" value="${escapeHtml(row.id)}">
                    <div class="field-grid">
                        <div class="field"><label>Player Name</label><input name="player_name" required></div>
                        <div class="field"><label>Player Email</label><input name="player_email" type="email"></div>
                        <div class="field"><label>Member ID</label><input name="member_id" type="number" min="1" placeholder="Optional linked member id"></div>
                        <div class="field">
                            <label>Player Type</label>
                            <select name="player_type">
                                <option value="member">Member</option>
                                <option value="visitor">Affiliated Visitor</option>
                                <option value="non_affiliated">Non-affiliated</option>
                            </select>
                        </div>
                        <div class="field"><label>Party Size</label><input name="party_size" type="number" min="1" max="${escapeHtml(row.available || 4)}" value="1"></div>
                        <div class="field">
                            <label>Holes</label>
                            <select name="holes">
                                <option value="18">18</option>
                                <option value="9">9</option>
                            </select>
                        </div>
                    </div>
                    <div class="checkbox-grid">
                        <div class="checkbox-card"><label><input type="checkbox" name="prepaid" value="1"> Prepaid</label><p>Mark if paid before arrival.</p></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="cart" value="1"> Cart</label><p>Attach cart usage to the booking.</p></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="push_cart" value="1"> Push Cart</label><p>Track push-cart allocation.</p></div>
                        <div class="checkbox-card"><label><input type="checkbox" name="caddy" value="1"> Caddy</label><p>Track caddy allocation.</p></div>
                    </div>
                    <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
                    <div class="button-row">
                        <button type="submit" class="button">Create booking</button>
                        <button type="button" class="button secondary" data-close-modal="1">Cancel</button>
                    </div>
                </form>
            `
        );
    }

    async function submitBookingModal(form) {
        const payload = {
            tee_time_id: Number(form.tee_time_id.value || 0),
            party_size: Number(form.party_size.value || 1),
            member_id: positiveInt(form.member_id.value),
            player_name: String(form.player_name.value || "").trim(),
            player_email: String(form.player_email.value || "").trim() || null,
            player_type: String(form.player_type.value || "visitor").trim(),
            source: "proshop",
            holes: Number(form.holes.value || 18),
            prepaid: Boolean(form.prepaid.checked),
            cart: Boolean(form.cart.checked),
            push_cart: Boolean(form.push_cart.checked),
            caddy: Boolean(form.caddy.checked),
            auto_price: true,
            notes: String(form.notes.value || "").trim() || null,
        };
        await postJson("/tsheet/booking", payload);
        showToast("Booking created.", "ok");
        closeModal();
        await renderCurrentWorkspace();
    }

    async function ensureDemoEnvironment() {
        await postJson("/api/super/demo/ensure", {});
        showToast("Demo environment refreshed.", "ok");
        await refreshBootstrap(true);
        await renderCurrentWorkspace();
    }

    async function checkInBooking(bookingId) {
        const paymentMethod = String(window.prompt("Payment method (CARD/CASH/EFT/ONLINE/ACCOUNT)", "CARD") || "").trim();
        const query = paymentMethod ? `?payment_method=${encodeURIComponent(paymentMethod)}` : "";
        await postJson(`/checkin/${Number(bookingId)}${query}`, {});
        showToast("Booking checked in.", "ok");
        await renderCurrentWorkspace();
    }

    async function updateBookingStatus(bookingId, nextStatus) {
        await postJson(`/api/admin/bookings/${Number(bookingId)}/status`, { status: String(nextStatus || "").trim() }, { method: "PUT" });
        showToast("Booking status updated.", "ok");
        await renderCurrentWorkspace();
    }

    async function handleClick(event) {
        const target = event.target instanceof HTMLElement ? event.target.closest("[data-nav-workspace],[data-nav-panel],[data-demo-ensure],[data-refresh],[data-close-modal],[data-open-booking],[data-check-in],[data-booking-status],[data-date-shift]") : null;
        if (!target) return;
        if (target.hasAttribute("data-close-modal")) return closeModal();
        if (target.hasAttribute("data-refresh")) return renderCurrentWorkspace();
        if (target.hasAttribute("data-demo-ensure")) return ensureDemoEnvironment();
        if (target.hasAttribute("data-date-shift")) return navigate({ date: addDaysYmd(state.route.date, Number(target.getAttribute("data-date-shift") || 0)) });
        if (target.hasAttribute("data-open-booking")) return openBookingModal(Number(target.getAttribute("data-open-booking") || 0));
        if (target.hasAttribute("data-check-in")) return checkInBooking(Number(target.getAttribute("data-check-in") || 0));
        if (target.hasAttribute("data-booking-status")) {
            return updateBookingStatus(Number(target.getAttribute("data-booking-status") || 0), target.getAttribute("data-status-value") || "");
        }
        if (target.hasAttribute("data-nav-workspace") || target.hasAttribute("data-nav-panel")) {
            const partial = {};
            if (target.hasAttribute("data-nav-workspace")) {
                partial.workspace = target.getAttribute("data-nav-workspace");
                partial.panel = normalizePanel(String(partial.workspace || ""), target.getAttribute("data-nav-panel"));
            } else {
                partial.panel = target.getAttribute("data-nav-panel");
            }
            if (target.hasAttribute("data-club-id")) partial.clubId = positiveInt(target.getAttribute("data-club-id"));
            navigate(partial);
        }
    }

    async function handleSubmit(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const handlers = {
            "onboarding-form": submitOnboardingForm,
            "super-user-form": submitSuperUserForm,
            "club-staff-form": submitClubStaffForm,
            "member-form": submitMemberForm,
            "communication-form": submitCommunicationForm,
            "booking-window-form": submitBookingWindowForm,
            "club-profile-form": submitClubProfileForm,
            "operational-targets-form": submitOperationalTargetsForm,
            "booking-modal-form": submitBookingModal,
        };
        const handler = handlers[form.id];
        if (!handler) return;
        event.preventDefault();
        const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
        if (submitter) submitter.disabled = true;
        try {
            await handler(form);
        } catch (error) {
            showToast(error?.message || "Action failed.", "bad");
        } finally {
            if (submitter) submitter.disabled = false;
        }
    }

    function logout() {
        window.GreenLinkSession.clearSessionState();
        window.location.href = "/frontend/index.html";
    }

    function handleInitializationFailure(error) {
        logClientError("initialize", error);
        if (Number(error?.status || 0) === 401) {
            window.GreenLinkSession.clearSessionState();
            window.location.href = "/frontend/index.html";
            return;
        }
        if (error?.code === "INVALID_BOOTSTRAP") {
            window.GreenLinkSession.clearSessionState();
        }
        renderFatalShellError("Unable to open workspace", runtimeFailureMessage(error, "The workspace could not be initialized."));
    }

    async function initialize() {
        const token = window.localStorage.getItem("token");
        if (!token) {
            window.location.href = "/frontend/index.html";
            return;
        }

        state.route = { workspace: "overview", panel: null, date: todayYmd(), clubId: positiveInt(new URLSearchParams(window.location.search || "").get("club_id")) };
        hydrateBootstrapFromCache();
        if (!state.bootstrap) {
            await refreshBootstrap(true);
        }
        if (roleShell() === "member") {
            window.location.href = state.bootstrap.landing_path || "/frontend/dashboard.html?view=home";
            return;
        }

        state.route = parseRoute();
        const cleanUrl = serializeRoute(state.route);
        if (`${window.location.pathname}${window.location.search}` !== cleanUrl) {
            window.history.replaceState({}, "", cleanUrl);
        }

        els.logout.addEventListener("click", logout);
        document.addEventListener("click", event => { void handleClick(event); });
        document.addEventListener("submit", event => { void handleSubmit(event); });
        window.addEventListener("popstate", () => {
            state.route = parseRoute();
            void renderCurrentWorkspace();
        });

        await renderCurrentWorkspace();
    }

    void initialize().catch(handleInitializationFailure);
})();
