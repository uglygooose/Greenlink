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
        padel: "Padel",
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
                title: "Club Overview",
                copy: "Run the club from one operating shell with dashboards, alerts, commercial signal, and fast links into the active work.",
                navCopy: "Dashboards, alerts, and club posture.",
            },
            golf: {
                kicker: "Golf Operations",
                title: "Golf",
                copy: "Keep golf central with the tee sheet, bookings, member context, and golf-day execution in one dense workspace.",
                navCopy: "Tee sheet, golf days, and day control.",
            },
            operations: {
                kicker: "Department Operations",
                title: "Operations",
                copy: "Run pro shop and other enabled operations without losing the wider club context or daily commercial signal.",
                navCopy: "Pro shop and enabled club operations.",
            },
            members: {
                kicker: "People",
                title: "People",
                copy: "Work across members, staff, and linked debtor context using the current club scope only.",
                navCopy: "Members, staff, and linked accounts.",
            },
            communications: {
                kicker: "Club Communications",
                title: "Communications",
                copy: "Manage member and staff messaging from a single club-safe workspace with clear publishing status.",
                navCopy: "News, notices, and club messaging.",
            },
            reports: {
                kicker: "Finance & Admin",
                title: "Finance & Admin",
                copy: "Keep revenue, targets, imports, and finance posture close to daily operations instead of burying them in passive reporting.",
                navCopy: "Revenue, imports, and finance posture.",
            },
            settings: {
                kicker: "Club Setup",
                title: "Club Setup",
                copy: "Control branding and booking rules without breaking the daily operating shell.",
                navCopy: "Branding and booking rules.",
            },
        },
        staff: {
            today: {
                kicker: "Daily Operations",
                title: "Today",
                copy: "A fast operational landing page for the current club, today's blockers, and the work that needs doing now.",
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
    const WORKSPACE_REQUEST_TIMEOUT_MS = 12000;
    const BOOTSTRAP_REFRESH_TTL_MS = 300000;
    const WORKSPACE_CACHE_DEFAULT_TTL_MS = 45000;
    const WORKSPACE_CACHE_TTL_BY_WORKSPACE = {
        overview: 30000,
        today: 20000,
        golf: 15000,
        operations: 30000,
        members: 45000,
        communications: 30000,
        reports: 60000,
        settings: 60000,
    };

    const state = {
        bootstrap: null,
        bootstrapFetchedAt: 0,
        route: null,
        routeRequestController: null,
        renderToken: 0,
        workspaceData: {},
        modalData: null,
        navOpenGroups: new Set(),
        workspaceCache: new Map(),
        sharedCache: new Map(),
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
            const route = normalizeRouteObject(extra.route || state.route || null);
            const name = String(error?.name || "Error");
            const message = String(error?.message || "Unknown error");
            const code = String(error?.code || extra.code || "");
            const status = Number(error?.status || extra.status || 0) || null;
            const path = String(error?.path || extra.path || "");
            const detailMessage = String(error?.data?.detail || extra.detail || "");
            const dataMessage = String(error?.data?.message || "");
            const loader = String(extra.loader || "");
            const summaryParts = [
                `[GreenLink admin] ${String(stage || "runtime")}: ${name}: ${message}`,
                code ? `code=${code}` : "",
                status ? `status=${status}` : "",
                path ? `path=${path}` : "",
                loader ? `loader=${loader}` : "",
                route.workspace ? `workspace=${route.workspace}` : "",
                route.panel ? `panel=${route.panel}` : "",
                route.date ? `date=${route.date}` : "",
            ].filter(Boolean);
            const summary = summaryParts.join(" | ");
            const cause = error?.cause instanceof Error
                ? {
                    name: String(error.cause.name || "Error"),
                    message: String(error.cause.message || ""),
                    stack: String(error.cause.stack || ""),
                }
                : (error?.cause ?? null);
            const details = {
                stage,
                name,
                message,
                code: code || null,
                status,
                path: path || null,
                stack: String(error?.stack || ""),
                cause,
                data_detail: detailMessage || null,
                data_message: dataMessage || null,
                role_shell: String(state.bootstrap?.role_shell || ""),
                workspace: String(route.workspace || ""),
                panel: String(route.panel || ""),
                date: String(route.date || ""),
                club_id: positiveInt(route.clubId),
                loader: loader || null,
                raw_error: error,
                ...extra,
            };
            console.error(summary);
            console.error("[GreenLink admin] detail", details);
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

    function toDateTimeLocalValue(value) {
        const date = toDate(value);
        if (!date) return "";
        const pad = part => String(part).padStart(2, "0");
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate()),
        ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

    function formatByUnit(value, unit) {
        const normalized = String(unit || "").trim().toLowerCase();
        if (normalized === "currency") return formatCurrency(value);
        return formatInteger(value);
    }

    function sportsSetupConfig(profile = activeClub()?.profile || {}) {
        const sports = profile?.sports_setup || {};
        return {
            tennisCourtCount: Math.max(0, Number(profile?.tennis_court_count ?? sports?.tennis_court_count ?? 0) || 0),
            tennisSessionMinutes: Math.max(15, Number(profile?.tennis_session_minutes ?? sports?.tennis_session_minutes ?? 60) || 60),
            tennisCourtNames: Array.isArray(profile?.tennis_court_names ?? sports?.tennis_court_names) ? (profile?.tennis_court_names ?? sports?.tennis_court_names).map(item => String(item || "").trim()).filter(Boolean) : [],
            tennisOpenTime: String(profile?.tennis_open_time ?? sports?.tennis_open_time ?? "06:00"),
            tennisCloseTime: String(profile?.tennis_close_time ?? sports?.tennis_close_time ?? "18:00"),
            padelCourtCount: Math.max(0, Number(profile?.padel_court_count ?? sports?.padel_court_count ?? 0) || 0),
            padelSessionMinutes: Math.max(15, Number(profile?.padel_session_minutes ?? sports?.padel_session_minutes ?? 60) || 60),
            padelCourtNames: Array.isArray(profile?.padel_court_names ?? sports?.padel_court_names) ? (profile?.padel_court_names ?? sports?.padel_court_names).map(item => String(item || "").trim()).filter(Boolean) : [],
            padelOpenTime: String(profile?.padel_open_time ?? sports?.padel_open_time ?? "06:00"),
            padelCloseTime: String(profile?.padel_close_time ?? sports?.padel_close_time ?? "22:00"),
            bowlsRinkCount: Math.max(0, Number(profile?.bowls_rink_count ?? sports?.bowls_rink_count ?? 0) || 0),
            bowlsSessionMinutes: Math.max(30, Number(profile?.bowls_session_minutes ?? sports?.bowls_session_minutes ?? 120) || 120),
            bowlsRinkNames: Array.isArray(profile?.bowls_rink_names ?? sports?.bowls_rink_names) ? (profile?.bowls_rink_names ?? sports?.bowls_rink_names).map(item => String(item || "").trim()).filter(Boolean) : [],
            bowlsOpenTime: String(profile?.bowls_open_time ?? sports?.bowls_open_time ?? "08:00"),
            bowlsCloseTime: String(profile?.bowls_close_time ?? sports?.bowls_close_time ?? "18:00"),
        };
    }

    function namedResourcesMeta(names = [], singular = "resource") {
        const rows = Array.isArray(names) ? names.filter(Boolean) : [];
        if (!rows.length) return `No named ${singular}s set yet`;
        return rows.slice(0, 3).join(", ") + (rows.length > 3 ? ` +${rows.length - 3} more` : "");
    }

    function moduleCapacityMeta(panel, profile = activeClub()?.profile || {}) {
        const sports = sportsSetupConfig(profile);
        if (panel === "tennis") {
            const count = sports.tennisCourtCount;
            return count > 0
                ? `${formatInteger(count)} court${count === 1 ? "" : "s"} configured ? ${formatInteger(sports.tennisSessionMinutes)} min default session`
                : "No tennis courts configured yet";
        }
        if (panel === "padel") {
            const count = sports.padelCourtCount;
            return count > 0
                ? `${formatInteger(count)} court${count === 1 ? "" : "s"} configured ? ${formatInteger(sports.padelSessionMinutes)} min default session`
                : "No padel courts configured yet";
        }
        if (panel === "bowls") {
            const count = sports.bowlsRinkCount;
            return count > 0
                ? `${formatInteger(count)} rink${count === 1 ? "" : "s"} configured ? ${formatInteger(sports.bowlsSessionMinutes)} min default session`
                : "No bowls rinks configured yet";
        }
        return "";
    }

    function moduleResourceMeta(panel, profile = activeClub()?.profile || {}) {
        const sports = sportsSetupConfig(profile);
        if (panel === "tennis" && sports.tennisCourtCount > 0) {
            return `${formatInteger(sports.tennisCourtCount)} court${sports.tennisCourtCount === 1 ? "" : "s"} ? ${sports.tennisOpenTime}-${sports.tennisCloseTime} ? ${formatInteger(sports.tennisSessionMinutes)} min ? ${namedResourcesMeta(sports.tennisCourtNames, "court")}`;
        }
        if (panel === "padel" && sports.padelCourtCount > 0) {
            return `${formatInteger(sports.padelCourtCount)} court${sports.padelCourtCount === 1 ? "" : "s"} ? ${sports.padelOpenTime}-${sports.padelCloseTime} ? ${formatInteger(sports.padelSessionMinutes)} min ? ${namedResourcesMeta(sports.padelCourtNames, "court")}`;
        }
        if (panel === "bowls" && sports.bowlsRinkCount > 0) {
            return `${formatInteger(sports.bowlsRinkCount)} rink${sports.bowlsRinkCount === 1 ? "" : "s"} ? ${sports.bowlsOpenTime}-${sports.bowlsCloseTime} ? ${formatInteger(sports.bowlsSessionMinutes)} min ? ${namedResourcesMeta(sports.bowlsRinkNames, "rink")}`;
        }
        return moduleCapacityMeta(panel, profile);
    }

    function clubModules() {
        const modules = activeClub()?.enabled_modules;
        return Array.isArray(modules) ? modules.map(item => String(item || "").trim().toLowerCase()).filter(Boolean) : [];
    }

    function operationModules() {
        return clubModules().filter(key => !["golf", "golf_days", "members", "communications"].includes(key));
    }

    function visibleOperationModules() {
        const modules = operationModules();
        if (roleShell() === "club_admin") {
            return modules.filter(key => key !== "pub");
        }
        return modules;
    }

    function navDisplayLabel(workspace, fallback) {
        const shell = roleShell();
        const key = String(workspace || "").trim().toLowerCase();
        if (shell === "club_admin") {
            if (key === "overview") return "Club Overview";
            if (key === "members") return "People";
            if (key === "reports") return "Finance & Admin";
            if (key === "settings") return "Club Setup";
        }
        return String(fallback || workspace || "Workspace");
    }

    function navGroups(nav) {
        const shell = roleShell();
        const items = Array.isArray(nav) ? nav : [];
        if (shell === "club_admin") {
            return [
                { id: "overview", label: "Overview", items: items.filter(item => ["overview"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "golf", label: "Golf", items: items.filter(item => ["golf"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "members", label: "People", items: items.filter(item => ["members"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "operations", label: "Operations", items: items.filter(item => ["operations"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "communications", label: "Communications", items: items.filter(item => ["communications"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "reports", label: "Finance & Admin", items: items.filter(item => ["reports"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "settings", label: "Club Setup", items: items.filter(item => ["settings"].includes(String(item.workspace || "").toLowerCase())) },
            ].filter(group => group.items.length);
        }
        if (shell === "staff") {
            return [
                { id: "daily-ops", label: "Daily Operations", items: items.filter(item => ["today", "golf", "operations"].includes(String(item.workspace || "").toLowerCase())) },
                { id: "people-notices", label: "People & Notices", items: items.filter(item => ["members", "communications"].includes(String(item.workspace || "").toLowerCase())) },
            ].filter(group => group.items.length);
        }
        if (shell === "super_admin") {
            return [
                { id: "platform-control", label: "Platform Control", items },
            ];
        }
        return [{ id: "navigation", label: "Navigation", items }].filter(group => group.items.length);
    }

    function navGroupIsActive(group) {
        const items = Array.isArray(group?.items) ? group.items : [];
        return items.some(item => String(item.workspace || "").trim().toLowerCase() === String(state.route?.workspace || "").trim().toLowerCase());
    }

    function toggleNavGroup(groupId) {
        const key = String(groupId || "").trim().toLowerCase();
        if (!key) return;
        if (state.navOpenGroups.has(key)) state.navOpenGroups.delete(key);
        else state.navOpenGroups.add(key);
        renderNav();
    }

    function ensureNavGroupOpenForWorkspace(workspace) {
        const key = String(workspace || "").trim().toLowerCase();
        if (key) state.navOpenGroups.add(key);
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
            if (shell === "club_admin") {
                return [
                    { id: "overview", label: "Golf Dashboard" },
                    { id: "tee-sheet", label: "Tee Sheet" },
                    { id: "bookings", label: "Bookings" },
                    { id: "golf-days", label: "Golf Day Operations" },
                ];
            }
            return [
                { id: "tee-sheet", label: "Tee Sheet" },
                { id: "golf-days", label: "Golf Day Operations" },
            ];
        }
        if (workspace === "operations") {
            const tabs = [{ id: "overview", label: "Operations Board" }];
            operationModules().forEach(key => {
                tabs.push({ id: key, label: MODULE_LABELS[key] || key });
            });
            return tabs;
        }
        if (workspace === "members" && shell === "club_admin") {
            return [
                { id: "members", label: "People" },
                { id: "staff", label: "Staff" },
            ];
        }
        if (workspace === "members" && shell === "staff") {
            return [{ id: "members", label: "People" }];
        }
        if (workspace === "reports") {
            return [
                { id: "performance", label: "Finance Dashboard" },
                { id: "ledger", label: "Ledger & Reconciliation" },
                { id: "cashbook", label: "Cashbook & Day Close" },
                { id: "imports", label: "Imports & Data Health" },
                { id: "targets", label: "Targets" },
            ];
        }
        if (workspace === "settings" && shell !== "super_admin") {
            return [
                { id: "profile", label: "Club Profile" },
                { id: "booking-window", label: "Booking Rules" },
            ];
        }
        return [];
    }

    function navTabsForWorkspace(workspace) {
        const shell = roleShell();
        const tabs = tabsForWorkspace(workspace);
        if (shell === "club_admin" && workspace === "operations") {
            return tabs.filter(tab => String(tab.id || "").trim().toLowerCase() !== "pub");
        }
        if (shell === "club_admin" && workspace === "settings") {
            return tabs.filter(tab => ["profile", "booking-window"].includes(String(tab.id || "").trim().toLowerCase()));
        }
        return tabs;
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
        const rawWorkspace = String(params.get("workspace") || "").trim().toLowerCase();
        const rawPanel = String(params.get("panel") || "").trim().toLowerCase();
        const remappedWorkspace = roleShell() === "club_admin" && rawWorkspace === "settings" && ["imports", "targets"].includes(rawPanel)
            ? "reports"
            : rawWorkspace;
        const workspace = normalizeWorkspace(remappedWorkspace);
        const route = {
            workspace,
            panel: normalizePanel(workspace, rawPanel),
            date: clampYmd(params.get("date") || todayYmd()),
            clubId: positiveInt(params.get("club_id")),
        };
        if (state.bootstrap?.club_context_locked) route.clubId = null;
        return route;
    }

    function normalizeRouteObject(route = null) {
        const source = route && typeof route === "object" ? route : {};
        const workspace = normalizeWorkspace(source.workspace);
        const normalized = {
            workspace,
            panel: normalizePanel(workspace, source.panel),
            date: workspace === "golf" ? clampYmd(source.date) : todayYmd(),
            clubId: positiveInt(source.clubId),
        };
        if (state.bootstrap?.club_context_locked) normalized.clubId = null;
        return normalized;
    }

    function routesEqualNormalized(left, right) {
        const a = normalizeRouteObject(left);
        const b = normalizeRouteObject(right);
        return (
            String(a.workspace || "") === String(b.workspace || "")
            && String(a.panel || "") === String(b.panel || "")
            && String(a.date || "") === String(b.date || "")
            && String(a.clubId || "") === String(b.clubId || "")
        );
    }

    function currentLocationUrl() {
        return `${window.location.pathname}${window.location.search}`;
    }

    function transitionKindForRoutes(fromRoute, toRoute, options = {}) {
        if (options.forceRefresh) return "forced_refresh";
        if (options.recovery) return "recovery";
        const nextRoute = normalizeRouteObject(toRoute);
        const previousRoute = fromRoute ? normalizeRouteObject(fromRoute) : null;
        if (!previousRoute || options.initialLoad) return "initial_load";
        if (routesEqualNormalized(previousRoute, nextRoute)) return "identical_route";
        if (String(previousRoute.workspace || "") !== String(nextRoute.workspace || "")) return "workspace_change";
        if (String(previousRoute.date || "") !== String(nextRoute.date || "")) return "same_workspace_date_change";
        if (String(previousRoute.panel || "") !== String(nextRoute.panel || "")) return "same_workspace_panel_switch";
        return "same_workspace_refresh";
    }

    function shouldRefreshBootstrapForRouteTransition({ fromRoute = null, toRoute = null, transitionKind = "", forceRefresh = false, recovery = false } = {}) {
        if (forceRefresh || recovery) return true;
        if (!state.bootstrap) return true;
        if (transitionKind === "initial_load") return true;
        if (!["club_admin", "staff"].includes(roleShell())) return true;
        if (!state.bootstrap?.club_context_locked) return true;
        if (!cachedBootstrapMatchesRoute(state.bootstrap, toRoute || fromRoute || state.route)) return true;
        if ((Date.now() - Number(state.bootstrapFetchedAt || 0)) >= BOOTSTRAP_REFRESH_TTL_MS) return true;
        return false;
    }

    function serializeRoute(route) {
        const params = new URLSearchParams();
        const normalized = normalizeRouteObject(route);
        const workspace = normalized.workspace;
        const panel = normalized.panel;
        params.set("workspace", workspace);
        if (panel) params.set("panel", panel);
        if (workspace === "golf") params.set("date", normalized.date);
        if (!state.bootstrap?.club_context_locked && roleShell() === "super_admin" && positiveInt(normalized.clubId)) {
            if (["clubs", "onboarding", "demo", "users"].includes(workspace)) {
                params.set("club_id", String(normalized.clubId));
            }
        }
        return `${window.location.pathname}?${params.toString()}`;
    }

    function syncNavActiveState(route = state.route) {
        const normalized = normalizeRouteObject(route);
        ensureNavGroupOpenForWorkspace(normalized.workspace);
        els.nav.querySelectorAll(".nav-item").forEach(node => {
            if (!(node instanceof HTMLElement)) return;
            const workspace = String(node.getAttribute("data-nav-workspace") || "").trim().toLowerCase();
            const panel = String(node.getAttribute("data-nav-panel") || "").trim().toLowerCase();
            const active = workspace === String(normalized.workspace || "").trim().toLowerCase()
                && (panel ? panel === String(normalized.panel || "").trim().toLowerCase() : true);
            node.classList.toggle("active", active);
        });
        els.nav.querySelectorAll(".nav-group").forEach(section => {
            if (!(section instanceof HTMLElement)) return;
            const toggle = section.querySelector(".nav-group-toggle");
            const items = section.querySelector(".nav-group-items");
            const hasActive = Boolean(section.querySelector(".nav-item.active"));
            section.classList.toggle("active", hasActive);
            const groupId = String(toggle?.getAttribute("data-nav-group") || "").trim().toLowerCase();
            const isOpen = state.navOpenGroups.has(groupId);
            section.classList.toggle("open", isOpen);
            if (toggle instanceof HTMLElement) {
                toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
                const caret = toggle.querySelector(".nav-group-caret");
                if (caret) caret.textContent = isOpen ? "-" : "+";
            }
            if (items instanceof HTMLElement) {
                items.hidden = !isOpen;
            }
        });
    }

    function applyRouteTransition(nextRouteInput, options = {}) {
        const previousRoute = state.route ? normalizeRouteObject(state.route) : null;
        const nextRoute = normalizeRouteObject(nextRouteInput);
        const transitionKind = transitionKindForRoutes(previousRoute, nextRoute, options);
        const nextUrl = serializeRoute(nextRoute);
        const currentUrl = currentLocationUrl();

        if (transitionKind === "identical_route" && !options.forceRefresh && !options.recovery) {
            return false;
        }

        if (options.historyMode === "replace") {
            if (nextUrl !== currentUrl) window.history.replaceState({}, "", nextUrl);
        } else if (options.historyMode === "push") {
            if (nextUrl !== currentUrl) window.history.pushState({}, "", nextUrl);
        }

        state.route = nextRoute;
        ensureNavGroupOpenForWorkspace(state.route.workspace);
        if (typeof options.afterNavigate === "function") {
            options.afterNavigate();
        }
        void renderCurrentWorkspace({
            route: nextRoute,
            previousRoute,
            transitionKind,
            forceRefresh: Boolean(options.forceRefresh),
            recovery: Boolean(options.recovery),
            initialLoad: Boolean(options.initialLoad),
        });
        return true;
    }

    function navigate(partial, options = {}) {
        const nextRoute = normalizeRouteObject({
            ...(state.route || {}),
            ...(partial || {}),
        });
        return applyRouteTransition(nextRoute, {
            historyMode: options.replace ? "replace" : "push",
            afterNavigate: options.afterNavigate,
            forceRefresh: Boolean(options.forceRefresh),
            recovery: Boolean(options.recovery),
            initialLoad: Boolean(options.initialLoad),
        });
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
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Club operations</h4>
                            <p>Loading operational dashboard, alerts, and finance posture.</p>
                        </div>
                    </div>
                    <div class="empty-state">Preparing current club context.</div>
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Role-safe shell</h4>
                            <p>Verifying route, workspace, and club-locked data.</p>
                        </div>
                    </div>
                    <div class="empty-state">Loading role-specific workspace controls.</div>
                </article>
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

    async function fetchJsonSafe(path, fallback = null, options = {}) {
        try {
            return await fetchJson(path, options);
        } catch (error) {
            return {
                ...(fallback && typeof fallback === "object" ? fallback : {}),
                _error: String(error?.message || "Request failed"),
                _status: Number(error?.status || 0) || 0,
            };
        }
    }

    async function postJson(path, payload, options = {}) {
        const response = await fetchJson(path, {
            ...options,
            method: options.method || "POST",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            body: JSON.stringify(payload || {}),
        });
        if (options.invalidateCache !== false) {
            invalidateWorkspaceCache();
        }
        return response;
    }

    async function postFormData(path, formData, options = {}) {
        const response = await fetchJson(path, {
            ...options,
            method: options.method || "POST",
            body: formData,
        });
        if (options.invalidateCache !== false) {
            invalidateWorkspaceCache();
        }
        return response;
    }

    async function downloadWithAuth(path, fallbackName) {
        const headers = window.GreenLinkSession.authHeaders();
        const response = await window.fetch(path, {
            method: "GET",
            headers,
            cache: "no-store",
        });
        if (!response.ok) {
            const raw = await response.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = null;
            }
            throw new Error(String(data?.detail || raw || `Request failed (${response.status})`));
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const disposition = response.headers.get("content-disposition") || "";
        let fileName = String(fallbackName || "greenlink-export.csv");
        const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
        if (match?.[1]) fileName = match[1];
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
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

    function safeNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function closeStatusFinanceSummary(bundle) {
        return bundle?.closeStatus?.finance_state_summary || {};
    }

    function exportBacklogMeta(bundle) {
        const summary = closeStatusFinanceSummary(bundle);
        const blocked = Number(summary.blocked_rows || 0);
        const pending = Number(summary.pending_export_rows || 0);
        const missingPaymentMethod = Number(summary.missing_payment_method_rows || 0);
        const missingMapping = Number(summary.missing_mapping_rows || 0);
        if (blocked > 0) {
            if (missingPaymentMethod > 0 && missingMapping > 0) {
                return `${formatInteger(blocked)} blocked: payment method and mapping gaps still need attention`;
            }
            if (missingPaymentMethod > 0) {
                return `${formatInteger(blocked)} blocked: payment methods still need capture`;
            }
            if (missingMapping > 0) {
                return `${formatInteger(blocked)} blocked: Pastel layout or mappings still need setup`;
            }
            return `${formatInteger(blocked)} blocked for export`;
        }
        if (pending > 0) {
            return `${formatInteger(pending)} paid ledger row(s) still need export`;
        }
        return "No paid ledger backlog flagged";
    }

    function financeReadyBlockedMeta(bundle) {
        const summary = closeStatusFinanceSummary(bundle);
        const ready = Number(summary.export_ready_rows || 0);
        const blocked = Number(summary.blocked_rows || 0);
        if (ready > 0 || blocked > 0) {
            return `${formatInteger(ready)} ready · ${formatInteger(blocked)} blocked`;
        }
        return "No pending export rows";
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

    function renderDashboardStatCards(bundle) {
        const dashboard = bundle?.dashboard || {};
        const alerts = bundle?.alerts || {};
        const financeSummary = closeStatusFinanceSummary(bundle);
        const closeMeta = closeStatusMeta(bundle);
        const mtd = dashboardTargetPeriod(dashboard, "mtd");
        const mtdPace = paceVarianceMeta(mtd?.revenue_actual, mtd?.revenue_target);
        const pendingExportRows = Number(financeSummary.pending_export_rows || 0);
        const blockedRows = Number(financeSummary.blocked_rows || 0);
        const closeDiagnostics = pendingExportRows > 0 || blockedRows > 0
            ? `${closeMeta.detail} | ${formatInteger(pendingExportRows)} pending, ${formatInteger(blockedRows)} blocked`
            : closeMeta.detail;
        return `
            <section class="stats-grid">
                <article class="stat-card">
                    <div class="stat-icon">OV</div>
                    <div class="stat-content">
                        <div class="stat-label">Today's Bookings</div>
                        <div class="stat-value">${escapeHtml(formatInteger(dashboard.today_bookings || 0))}</div>
                        <div class="stat-meta">Live golf bookings on today's sheet</div>
                    </div>
                </article>
                <article class="stat-card">
                    <div class="stat-icon">MB</div>
                    <div class="stat-content">
                        <div class="stat-label">Close Posture</div>
                        <div class="stat-value">${escapeHtml(closeMeta.label)}</div>
                        <div class="stat-meta">${escapeHtml(closeDiagnostics)}</div>
                    </div>
                </article>
                <article class="stat-card">
                    <div class="stat-icon">RV</div>
                    <div class="stat-content">
                        <div class="stat-label">Revenue Today</div>
                        <div class="stat-value">${escapeHtml(formatCurrency(dashboard.today_revenue || 0))}</div>
                        <div class="stat-meta">${escapeHtml(mtd?.revenue_target != null ? mtdPace.detail : `${formatCurrency(dashboard.week_revenue || 0)} this week`)}</div>
                    </div>
                </article>
                <article class="stat-card">
                    <div class="stat-icon">AL</div>
                    <div class="stat-content">
                        <div class="stat-label">Open Alerts</div>
                        <div class="stat-value">${escapeHtml(formatInteger(alerts.summary?.total || 0))}</div>
                        <div class="stat-meta">${escapeHtml(formatInteger(alerts.summary?.high || 0))} high priority blockers</div>
                    </div>
                </article>
            </section>
        `;
    }

    function renderRevenueTrendChart(dashboard) {
        const paidSeries = Array.isArray(dashboard.daily_paid_revenue) ? dashboard.daily_paid_revenue.slice(-7) : [];
        const otherSeries = Array.isArray(dashboard.daily_other_revenue) ? dashboard.daily_other_revenue.slice(-7) : [];
        const labels = new Map();
        paidSeries.forEach(row => labels.set(String(row.date || ""), true));
        otherSeries.forEach(row => labels.set(String(row.date || ""), true));
        const ordered = Array.from(labels.keys()).sort().slice(-7);
        const bars = ordered.map(label => {
            const paid = safeNumber(paidSeries.find(row => String(row.date || "") === label)?.amount);
            const other = safeNumber(otherSeries.find(row => String(row.date || "") === label)?.amount);
            const total = paid + other;
            return { label, paid, other, total };
        });
        const maxValue = Math.max(1, ...bars.map(item => item.total));
        if (!bars.length) {
            return `<div class="empty-state">No recent revenue trend is available for this club yet.</div>`;
        }
        return `
            <div class="chart-bars">
                ${bars.map(item => `
                    <div class="chart-bar">
                        <div class="chart-bar-stack">
                            <div class="chart-bar-fill paid" style="height:${Math.max(10, Math.round((item.paid / maxValue) * 140))}px"></div>
                            <div class="chart-bar-fill other" style="height:${item.other > 0 ? Math.max(8, Math.round((item.other / maxValue) * 60)) : 0}px"></div>
                        </div>
                        <div class="chart-bar-value">${escapeHtml(formatCurrency(item.total))}</div>
                        <div class="chart-bar-label">${escapeHtml(formatDate(item.label))}</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderFinanceTrendChart(revenue) {
        const paidSeries = Array.isArray(revenue.daily_paid_revenue) ? revenue.daily_paid_revenue.slice(-7) : [];
        const otherSeries = Array.isArray(revenue.daily_other_revenue) ? revenue.daily_other_revenue.slice(-7) : [];
        const labels = new Map();
        paidSeries.forEach(row => labels.set(String(row.date || ""), true));
        otherSeries.forEach(row => labels.set(String(row.date || ""), true));
        const ordered = Array.from(labels.keys()).sort().slice(-7);
        const bars = ordered.map(label => {
            const paid = safeNumber(paidSeries.find(row => String(row.date || "") === label)?.amount);
            const other = safeNumber(otherSeries.find(row => String(row.date || "") === label)?.amount);
            const total = paid + other;
            return { label, paid, other, total };
        });
        const maxValue = Math.max(1, ...bars.map(item => item.total));
        if (!bars.length) {
            return `<div class="empty-state">No recent finance trend is available yet.</div>`;
        }
        return `
            <div class="chart-bars">
                ${bars.map(item => `
                    <div class="chart-bar">
                        <div class="chart-bar-stack">
                            <div class="chart-bar-fill paid" style="height:${Math.max(10, Math.round((item.paid / maxValue) * 140))}px"></div>
                            <div class="chart-bar-fill other" style="height:${item.other > 0 ? Math.max(8, Math.round((item.other / maxValue) * 60)) : 0}px"></div>
                        </div>
                        <div class="chart-bar-value">${escapeHtml(formatCurrency(item.total))}</div>
                        <div class="chart-bar-label">${escapeHtml(formatDate(item.label))}</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function formatRelativeAge(value) {
        const date = toDate(value);
        if (!date) return "No recent sync";
        const diffMs = Math.max(0, Date.now() - date.getTime());
        const hours = Math.round(diffMs / 3600000);
        if (hours < 1) return "Within the last hour";
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.round(hours / 24);
        return `${days} day${days === 1 ? "" : "s"} ago`;
    }

    function renderImportFreshness(dashboard) {
        const imports = dashboard.imports || {};
        const importCopilot = dashboard.ai_assistant?.import_copilot || {};
        const summary = importCopilot.summary || {};
        const recommendations = Array.isArray(importCopilot.recommendations) ? importCopilot.recommendations : [];
        return `
            <section class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Import freshness</h4>
                        <p>Revenue and bookings sync state should be visible in the finance board, not hidden in setup.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Configured Streams", value: formatInteger(summary.configured_streams || 0), meta: `${formatInteger(summary.total_streams || 0)} tracked streams` },
                    { label: "Stale Streams", value: formatInteger(summary.stale_streams || 0), meta: "Streams needing attention" },
                    { label: "Revenue Sync", value: formatRelativeAge(imports.revenue), meta: imports.revenue ? formatDateTime(imports.revenue) : "No revenue import recorded" },
                    { label: "Booking Sync", value: formatRelativeAge(imports.bookings), meta: imports.bookings ? formatDateTime(imports.bookings) : "No bookings import recorded" },
                ])}
                <div class="stack">
                    ${recommendations.length ? recommendations.slice(0, 4).map(item => `
                        <div class="list-row">
                            <div class="list-meta">${escapeHtml(item)}</div>
                        </div>
                    `).join("") : `<div class="empty-state">Import freshness is stable.</div>`}
                </div>
            </section>
        `;
    }

    function renderFinanceControlCards() {
        const cards = [
            { title: "Finance Dashboard", copy: "Keep finance signal, stream mix, and target pace visible.", workspace: "reports", panel: "performance" },
            { title: "Ledger & Reconciliation", copy: "Review ledger-backed payment history before export and close-out.", workspace: "reports", panel: "ledger" },
            { title: "Cashbook & Day Close", copy: "Preview and export club-specific CSV journals for accounting.", workspace: "reports", panel: "cashbook" },
            { title: "Imports & Data Health", copy: "Keep stream mappings and import posture tied to finance.", workspace: "reports", panel: "imports" },
        ];
        return `
            <div class="launchpad-grid">
                ${cards.map(card => `
                    <button type="button" class="launchpad-card" data-nav-workspace="${escapeHtml(card.workspace)}" data-nav-panel="${escapeHtml(card.panel)}">
                        <strong>${escapeHtml(card.title)}</strong>
                        <span>${escapeHtml(card.copy)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderSetupControlCards() {
        const cards = [
            { title: "Club Profile", copy: "Branding and member-facing club identity.", workspace: "settings", panel: "profile" },
            { title: "Booking Rules", copy: "Advance-booking rules and cancellation guardrails.", workspace: "settings", panel: "booking-window" },
        ];
        return `
            <div class="launchpad-grid">
                ${cards.map(card => `
                    <button type="button" class="launchpad-card" data-nav-workspace="${escapeHtml(card.workspace)}" data-nav-panel="${escapeHtml(card.panel)}">
                        <strong>${escapeHtml(card.title)}</strong>
                        <span>${escapeHtml(card.copy)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function moduleValueCopy(key) {
        const values = {
            golf: "Hero workspace for tee-sheet control, golf-day management, member-linked bookings, and export-aware golf operations.",
            members: "Front-desk service layer for members, debtor context, follow-up pressure, and cross-workspace club visibility.",
            communications: "Club-wide notices, audience follow-up, and member/staff messaging from the same operating shell.",
            pro_shop: "Sales, stock pressure, walk-in trade, and day-close readiness for the shop desk.",
            tennis: "Tennis activity, member relevance, and operational visibility without adding bloated tooling.",
            padel: "Padel demand, court visibility, and racket-sport commercial growth without pretending booking is deeper than it is.",
            bowls: "Bowls activity, member service continuity, and club-day operational context.",
            pub: "Hospitality revenue visibility and clean export handoff without pretending GreenLink is the accounting package.",
        };
        return values[key] || "Operational value that improves day-to-day service when enabled for the club.";
    }

    function moduleCommercialLabel(key) {
        const labels = {
            golf: "Core differentiator",
            members: "Service continuity",
            communications: "Member experience",
            pro_shop: "Retail control",
            tennis: "Sports desk value",
            padel: "Growth-sport value",
            bowls: "Club operations value",
            pub: "Hospitality handoff",
        };
        return labels[key] || "Operational value";
    }

    function renderModuleValueGrid(modules, options = {}) {
        const rows = (Array.isArray(modules) ? modules : [])
            .filter(Boolean)
            .map(key => String(key).trim().toLowerCase())
            .filter((key, index, all) => all.indexOf(key) === index);
        if (!rows.length) {
            return `<div class="empty-state">No enabled modules are currently selected for this club.</div>`;
        }
        const intro = options.mode === "setup"
            ? "Each enabled module should justify itself as real client value, not as checkbox volume."
            : "Enabled modules should read like deliberate service advantages for this club.";
        return `
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Enabled module value</h4>
                        <p>${intro}</p>
                    </div>
                </div>
                <div class="module-grid">
                    ${rows.map(key => `
                        <article class="module-card module-value-card">
                            <h4>${escapeHtml(MODULE_LABELS[key] || key)}</h4>
                            <p>${escapeHtml(moduleValueCopy(key))}</p>
                            <span class="metric-pill">${escapeHtml(moduleCommercialLabel(key))}</span>
                        </article>
                    `).join("")}
                </div>
            </section>
        `;
    }

    function renderPeopleControlCards() {
        const cards = [
            { title: "People", copy: "Members, categories, and current service activity.", workspace: "members", panel: "members" },
            { title: "Staff", copy: "Club-side staff access and operator records.", workspace: "members", panel: "staff" },
            { title: "Golf", copy: "Jump from people context into live golf operations.", workspace: "golf", panel: "tee-sheet" },
            { title: "Communications", copy: "Member and staff messaging from the same shell.", workspace: "communications", panel: null },
        ];
        return `
            <div class="launchpad-grid">
                ${cards.map(card => `
                    <button type="button" class="launchpad-card" data-nav-workspace="${escapeHtml(card.workspace)}" ${card.panel ? `data-nav-panel="${escapeHtml(card.panel)}"` : ""}>
                        <strong>${escapeHtml(card.title)}</strong>
                        <span>${escapeHtml(card.copy)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderPageActionRow(actions) {
        const items = (Array.isArray(actions) ? actions : []).filter(Boolean);
        if (!items.length) return "";
        return `
            <div class="page-action-row">
                ${items.map(action => renderPageActionButton(action)).join("")}
            </div>
        `;
    }

    function renderPageActionButton(action) {
        const label = String(action?.label || "").trim() || "Action";
        const tones = new Set(["secondary", "ghost", "warn"]);
        const tone = tones.has(String(action?.tone || "").trim().toLowerCase())
            ? String(action.tone).trim().toLowerCase()
            : "";
        const className = ["button", tone].filter(Boolean).join(" ");
        const attrs = [
            action?.workspace ? `data-nav-workspace="${escapeHtml(action.workspace)}"` : "",
            action?.panel ? `data-nav-panel="${escapeHtml(action.panel)}"` : "",
            action?.workblock ? `data-workblock-toggle="${escapeHtml(action.workblock)}"` : "",
            action?.attrs || "",
        ].filter(Boolean).join(" ");
        return `<button type="button" class="${className}" ${attrs}>${escapeHtml(label)}</button>`;
    }

    function renderPageHero(options = {}) {
        const title = String(options.title || "").trim() || "Workspace";
        const copy = String(options.copy || "").trim();
        const workspace = String(options.workspace || "").trim();
        const subnavLabel = String(options.subnavLabel || `${workspace} pages`).trim();
        const metrics = Array.isArray(options.metrics) ? options.metrics.filter(Boolean) : [];
        const actions = Array.isArray(options.actions) ? options.actions.filter(Boolean) : [];
        const body = String(options.body || "");
        const extraClass = String(options.extraClass || "").trim();
        const meta = String(options.meta || "");
        return `
            <section class="hero-card page-system-hero ${escapeHtml(extraClass)}">
                <div class="panel-head">
                    <div>
                        <h3>${escapeHtml(title)}</h3>
                        ${copy ? `<p>${escapeHtml(copy)}</p>` : ""}
                    </div>
                    ${meta ? `<div class="inline-actions">${meta}</div>` : ""}
                </div>
                ${workspace ? renderFamilySubnav(workspace, { label: subnavLabel }) : ""}
                ${metrics.length ? metricCards(metrics) : ""}
                ${renderPageActionRow(actions)}
                ${body}
            </section>
        `;
    }

    function renderFamilySubnav(workspace, options = {}) {
        const tabs = navTabsForWorkspace(workspace);
        if (!tabs.length) return "";
        const label = String(options.label || `${workspace} pages`).trim();
        return `
            <nav class="family-subnav" aria-label="${escapeHtml(label)}">
                ${tabs.map(tab => `
                    <button
                        type="button"
                        class="family-subnav-item ${state.route.workspace === workspace && state.route.panel === tab.id ? "active" : ""}"
                        data-nav-workspace="${escapeHtml(workspace)}"
                        data-nav-panel="${escapeHtml(tab.id)}"
                        ${state.route.workspace === workspace && state.route.panel === tab.id ? 'aria-current="page"' : ""}
                    >
                        ${escapeHtml(tab.label)}
                    </button>
                `).join("")}
            </nav>
        `;
    }

    function renderWorkblock(options = {}) {
        const id = String(options.id || "").trim();
        const title = String(options.title || "").trim() || "Workblock";
        const copy = String(options.copy || "").trim();
        const badge = String(options.badge || "").trim();
        const body = String(options.body || "");
        return `
            <details class="workblock" ${id ? `id="${escapeHtml(id)}"` : ""} ${options.open ? "open" : ""}>
                <summary class="workblock-summary">
                    <div class="workblock-heading">
                        <h4>${escapeHtml(title)}</h4>
                        ${copy ? `<p>${escapeHtml(copy)}</p>` : ""}
                    </div>
                    <div class="workblock-meta">
                        ${badge ? `<span class="metric-pill">${escapeHtml(badge)}</span>` : ""}
                        <span class="workblock-caret" aria-hidden="true"></span>
                    </div>
                </summary>
                <div class="workblock-body">
                    ${body}
                </div>
            </details>
        `;
    }

    function focusWorkblock(workblockId) {
        const id = String(workblockId || "").trim();
        if (!id) return;
        const node = document.getElementById(id);
        if (!(node instanceof HTMLDetailsElement)) return;
        node.open = true;
        node.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    function renderCommunicationsControlCards() {
        const cards = [
            { title: "Communications", copy: "Current club notices and messaging control.", workspace: "communications", panel: null },
            { title: "People", copy: "Jump to member and staff context behind the message flows.", workspace: "members", panel: "members" },
            { title: "Overview", copy: "Return to the club operating board.", workspace: "overview", panel: null },
            { title: "Golf", copy: "Open the tee sheet if the communication affects the day sheet.", workspace: "golf", panel: "tee-sheet" },
        ];
        return `
            <div class="launchpad-grid">
                ${cards.map(card => `
                    <button type="button" class="launchpad-card" data-nav-workspace="${escapeHtml(card.workspace)}" ${card.panel ? `data-nav-panel="${escapeHtml(card.panel)}"` : ""}>
                        <strong>${escapeHtml(card.title)}</strong>
                        <span>${escapeHtml(card.copy)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function renderStatusBreakdown(dashboard) {
        const rows = Array.isArray(dashboard.revenue_by_status) ? dashboard.revenue_by_status : [];
        const maxValue = Math.max(1, ...rows.map(row => safeNumber(row.amount)));
        if (!rows.length) {
            return `<div class="empty-state">No booking status revenue data is available yet.</div>`;
        }
        return `
            <div class="status-breakdown">
                ${rows.map(row => `
                    <div class="status-item">
                        <div class="status-item-top">
                            <span class="status-label">${escapeHtml(String(row.status || "unknown").replaceAll("_", " "))}</span>
                            <span class="status-count">${escapeHtml(formatCurrency(row.amount || 0))}</span>
                        </div>
                        <div class="status-bar">
                            <div class="status-fill ${escapeHtml(statusTone(row.status || ""))}" style="width:${Math.max(6, Math.round((safeNumber(row.amount) / maxValue) * 100))}%"></div>
                        </div>
                        <div class="status-meta">${escapeHtml(formatInteger(row.count || 0))} booking(s)</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderRevenueStreamRows(dashboard) {
        const streams = dashboard.revenue_streams || {};
        const ordered = ["golf", "pro_shop", "pub", "bowls", "other"]
            .map(key => ({ key, row: streams[key] }))
            .filter(item => item.row);
        if (!ordered.length) return `<div class="empty-state">No revenue streams are available.</div>`;
        return `
            <div class="stream-list">
                ${ordered.map(item => `
                    <div class="stream-row">
                        <div>
                            <div class="list-title">${escapeHtml(item.row.label || MODULE_LABELS[item.key] || item.key)}</div>
                            <div class="list-meta">${escapeHtml(formatInteger(item.row.today_transactions || 0))} transactions today</div>
                        </div>
                        <div class="stream-values">
                            <span class="metric-pill">${escapeHtml(formatCurrency(item.row.today_revenue || 0))}</span>
                            <span class="list-meta">7d ${escapeHtml(item.row.week_vs_prior_week == null ? "no baseline" : formatPercent(item.row.week_vs_prior_week || 0))}</span>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderOperationsLaunchpad() {
        const shell = roleShell();
        const cards = shell === "club_admin" ? [
            { title: "Golf", copy: "Run the tee sheet, golf days, and live golf control from the product's hero workspace.", workspace: "golf", panel: "tee-sheet" },
            { title: "Operations", copy: "Open the service lanes clients switch on for shop, sport, and hospitality value.", workspace: "operations", panel: "overview" },
            { title: "Ledger & Reconciliation", copy: "Check paid bookings, ledger integrity, and accounting handoff before close-out.", workspace: "reports", panel: "ledger" },
            { title: "Cashbook & Day Close", copy: "Deliver clean club-specific CSV handoff without pretending to replace accounting software.", workspace: "reports", panel: "cashbook" },
        ] : [
            { title: "Golf", copy: "Open the live tee sheet and golf-day work without leaving the club shell.", workspace: "golf", panel: "tee-sheet" },
            { title: "Operations", copy: "See the enabled service modules that matter for today's club floor.", workspace: "operations", panel: "overview" },
            { title: "Members", copy: "Handle member and service pressure quickly in current club scope.", workspace: "members", panel: "members" },
            { title: "Communications", copy: "Stay aligned on live notices and service messaging for the day.", workspace: "communications", panel: null },
        ];
        return `
            <div class="launchpad-grid">
                ${cards.map(card => `
                    <button type="button" class="launchpad-card" data-nav-workspace="${escapeHtml(card.workspace)}" data-nav-panel="${escapeHtml(card.panel)}">
                        <strong>${escapeHtml(card.title)}</strong>
                        <span>${escapeHtml(card.copy)}</span>
                    </button>
                `).join("")}
            </div>
        `;
    }

    function alertMetric(alerts, key) {
        const rows = Array.isArray(alerts?.alerts) ? alerts.alerts : [];
        const match = rows.find(row => String(row.metric_key || "").trim().toLowerCase() === String(key || "").trim().toLowerCase());
        return match || null;
    }

    function renderClubManagerBriefCard(bundle) {
        const shell = roleShell();
        const dashboard = bundle?.dashboard || {};
        const alerts = bundle?.alerts || {};
        const communications = Array.isArray(bundle?.communications?.communications) ? bundle.communications.communications : [];
        const roleContext = bundle?.staffContext || {};
        const closeMeta = closeStatusMeta(bundle);
        const highAlerts = Number(alerts?.summary?.high || 0);
        const financeSummary = closeStatusFinanceSummary(bundle);
        const stockRisk = alertMetric(alerts, "low_stock_products");
        const published = communications.filter(row => String(row.status || "").toLowerCase() === "published");
        const pinned = published.filter(row => Boolean(row.pinned)).length;
        const pendingExportRows = Number(financeSummary.pending_export_rows || 0);
        const blockedRows = Number(financeSummary.blocked_rows || 0);
        const financeDiagnostics = pendingExportRows > 0 || blockedRows > 0
            ? `${formatInteger(pendingExportRows)} pending · ${formatInteger(blockedRows)} blocked.`
            : "";
        const financeDetail = financeDiagnostics
            ? `${closeMeta.detail} ${financeDiagnostics}`
            : closeMeta.detail;
        const golfDetail = Number(dashboard.today_bookings || 0) > 0
            ? `${formatInteger(dashboard.today_bookings || 0)} booking(s) are already live on today's sheet.`
            : "The day is quiet so far; keep the first starts and walk-ins visible.";
        const peopleDetail = shell === "staff"
            ? (roleContext.role_label ? `${roleContext.role_label}. Keep member demand and the live sheet aligned.` : "Keep member demand and the live sheet aligned.")
            : `${formatInteger(dashboard.active_members || 0)} active members and ${formatInteger(dashboard.today_bookings || 0)} booking(s) are in current club scope.`;
        const items = [
            {
                title: "Golf desk first",
                state: `${formatInteger(dashboard.today_bookings || 0)} booking(s) today`,
                detail: golfDetail,
                workspace: "golf",
                panel: "tee-sheet",
                label: "Open tee sheet",
            },
            {
                title: "Blockers and floor pressure",
                state: highAlerts ? `${formatInteger(highAlerts)} high alert(s)` : "Operationally stable",
                detail: highAlerts
                    ? "Open alerts before the rush and clear anything affecting service, stock, or booking flow."
                    : "No high-severity blockers are currently flagged.",
                workspace: "operations",
                panel: "overview",
                label: "Open operations",
            },
            {
                title: "Members and notices",
                state: `${formatInteger(pinned)} pinned notice(s)`,
                detail: published.length
                    ? `${formatInteger(published.length)} published communication(s). ${peopleDetail}`
                    : `No published notices yet. ${peopleDetail}`,
                workspace: "communications",
                panel: null,
                label: "Open communications",
            },
        ];
        items.push(shell === "club_admin"
            ? {
                title: "Finance status",
                state: closeMeta.label,
                detail: financeDetail,
                workspace: "reports",
                panel: "cashbook",
                label: "Open cashbook & day close",
            }
            : {
                title: "Pro shop watch",
                state: stockRisk ? `${formatInteger(stockRisk.metric_value || 0)} stock-risk item(s)` : "Stock stable",
                detail: stockRisk?.message || "Use operations to keep non-golf service visible during the day.",
                workspace: "operations",
                panel: "pro_shop",
                label: "Open pro shop",
            });
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>What needs attention now</h4>
                        <p>GreenLink should tell the desk what to do next, not ask them to interpret a wall of cards.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${items.map((item, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(item.title)}</div>
                                <div class="ops-step-state">${escapeHtml(item.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(item.detail)}</div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderHandoverReadinessCard(bundle) {
        const dashboard = bundle?.dashboard || {};
        const alerts = bundle?.alerts || {};
        const bookingImport = dashboard?.imports?.bookings;
        const revenueImport = dashboard?.imports?.revenue;
        const alertSummary = alerts?.summary || {};
        const financeSummary = closeStatusFinanceSummary(bundle);
        const closeMeta = closeStatusMeta(bundle);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Ready to close?</h4>
                        <p>Lead with finance truth first, then use import freshness and alerts as supporting diagnostics.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Close State", value: closeMeta.label, meta: closeMeta.detail },
                    { label: "Pending Export Rows", value: formatInteger(closeStatusFinanceSummary(bundle).pending_export_rows || 0), meta: exportBacklogMeta(bundle) },
                    { label: "Export-ready Rows", value: formatInteger(financeSummary.export_ready_rows || 0), meta: "Rows ready for export from current finance truth" },
                    { label: "Blocked Rows", value: formatInteger(financeSummary.blocked_rows || 0), meta: "Rows blocked by payment-method or mapping gaps" },
                ])}
                <div class="stack compact-stack">
                    <div class="detail-row"><span class="row-key">Booking Sync</span><span class="row-value">${escapeHtml(formatRelativeAge(bookingImport))} <span class="list-meta">${escapeHtml(bookingImport ? formatDateTime(bookingImport) : "No bookings import recorded")}</span></span></div>
                    <div class="detail-row"><span class="row-key">Revenue Sync</span><span class="row-value">${escapeHtml(formatRelativeAge(revenueImport))} <span class="list-meta">${escapeHtml(revenueImport ? formatDateTime(revenueImport) : "No revenue import recorded")}</span></span></div>
                    <div class="detail-row"><span class="row-key">High Alerts</span><span class="row-value">${escapeHtml(formatInteger(alertSummary.high || 0))} <span class="list-meta">${escapeHtml(`${formatInteger(alertSummary.total || 0)} active operational alerts`)}</span></span></div>
                </div>
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="ledger">Open ledger & reconciliation</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="imports">Open imports & data health</button>
                </div>
            </article>
        `;
    }

    function renderProShopCashupCard(bundle) {
        const dashboard = bundle?.dashboard || {};
        const alerts = bundle?.alerts || {};
        const proShop = dashboard?.revenue_streams?.pro_shop || {};
        const stockRisk = alertMetric(alerts, "low_stock_products");
        const closeMeta = closeStatusMeta(bundle);
        const financeSummary = closeStatusFinanceSummary(bundle);
        const pendingExportRows = Number(financeSummary.pending_export_rows || 0);
        const blockedRows = Number(financeSummary.blocked_rows || 0);
        const closeDiagnostics = pendingExportRows > 0 || blockedRows > 0
            ? `${closeMeta.detail} | ${formatInteger(pendingExportRows)} pending, ${formatInteger(blockedRows)} blocked`
            : closeMeta.detail;
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Pro shop close status</h4>
                        <p>Show stock pressure, sales, and export readiness in one place.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Sales Today", value: formatCurrency(proShop.today_revenue || 0), meta: `${formatInteger(proShop.today_transactions || 0)} transactions` },
                    { label: "Week Revenue", value: formatCurrency(proShop.week_revenue || 0), meta: `${formatInteger(proShop.week_transactions || 0)} transactions this week` },
                    { label: "Stock Risk", value: formatInteger(stockRisk?.metric_value || 0), meta: stockRisk?.message || "No stock-risk alert active" },
                    { label: "Close Posture", value: closeMeta.label, meta: closeDiagnostics },
                ])}
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="operations" data-nav-panel="pro_shop">Open pro shop</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>
                </div>
            </article>
        `;
    }

    function closeStatusMeta(bundle) {
        const closeStatus = bundle?.closeStatus || {};
        const financeSummary = closeStatusFinanceSummary(bundle);
        const exportMapping = closeStatus?.finance_semantics?.export_mapping || {};
        if (closeStatus.is_closed) {
            return {
                label: "Closed",
                detail: closeStatus.closed_at ? `Closed ${formatDateTime(closeStatus.closed_at)}` : "Day close is already recorded.",
            };
        }
        if (!Boolean(exportMapping.configured)) {
            return {
                label: "Setup missing",
                detail: "Pastel layout or mappings still need setup before clean export handoff.",
            };
        }
        if (Number(financeSummary.blocked_rows || 0) > 0) {
            return {
                label: "Blocked",
                detail: exportBacklogMeta(bundle),
            };
        }
        if (Number(financeSummary.pending_export_rows || 0) > 0) {
            return {
                label: "Needs export",
                detail: exportBacklogMeta(bundle),
            };
        }
        return {
            label: "Open",
            detail: "No close batch recorded yet.",
        };
    }

    function renderOperationsCadenceCard(bundle, options = {}) {
        const dashboard = bundle?.dashboard || {};
        const alerts = bundle?.alerts || {};
        const summary = bundle?.summary || {};
        const closeMeta = closeStatusMeta(bundle);
        const context = String(options.context || "club").trim().toLowerCase();
        const alertCount = Number(alerts?.summary?.high || 0);
        const paymentCount = Number(summary.transaction_count || summary.records?.length || 0);
        const teeCopy = context === "golf"
            ? "Return to the live sheet for move, check-in, and slot control."
            : "Start in golf before dropping into detail work.";
        const steps = [
            {
                title: "Open tee sheet",
                state: `${formatInteger(dashboard.today_bookings || 0)} booking(s) today`,
                copy: teeCopy,
                workspace: "golf",
                panel: "tee-sheet",
                label: "Open tee sheet",
            },
            {
                title: "Watch blockers",
                state: alertCount > 0 ? `${formatInteger(alertCount)} high alert(s)` : "Operationally stable",
                copy: "Keep no-shows, stock risk, and sync gaps visible while the day is running.",
                workspace: "operations",
                panel: "overview",
                label: "Open operations",
            },
            {
                title: "Cash-up and audit",
                state: `${formatInteger(paymentCount)} payment row(s)`,
                copy: "Review paid bookings, debtor context, and ledger integrity before handover.",
                workspace: "reports",
                panel: "ledger",
                label: "Open ledger & reconciliation",
            },
            {
                title: "Export and close",
                state: closeMeta.label,
                copy: closeMeta.detail,
                workspace: "reports",
                panel: "cashbook",
                label: "Open cashbook & day close",
            },
        ];
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Run the day</h4>
                        <p>Show the next operational steps in order: run service, cash up, export, then close.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${steps.map((step, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(step.title)}</div>
                                <div class="ops-step-state">${escapeHtml(step.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(step.copy)}</div>
                            </div>
                            <button
                                type="button"
                                class="button ghost ops-step-action"
                                data-nav-workspace="${escapeHtml(step.workspace)}"
                                data-nav-panel="${escapeHtml(step.panel)}"
                            >${escapeHtml(step.label)}</button>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderAccountingHandoffCard(bundle) {
        const settings = bundle?.settings || {};
        const summary = bundle?.summary || {};
        const closeMeta = closeStatusMeta(bundle);
        const exportMapping = bundle?.closeStatus?.finance_semantics?.export_mapping || {};
        const mappingMeta = Boolean(exportMapping.configured)
            ? "Pastel layout and mappings are configured"
            : "Pastel layout or mappings still need setup";
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Export setup</h4>
                        <p>Show the export destination, payment totals, and close state together.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Cashbook", value: settings.cashbook_name || "Not configured", meta: "Export destination for this club" },
                    { label: "Contra GL", value: settings.cashbook_contra_gl || "-", meta: mappingMeta },
                    { label: "Daily Payments", value: formatCurrency(summary.total_payments || 0), meta: `${formatInteger(summary.transaction_count || summary.records?.length || 0)} payment row(s) · ${financeReadyBlockedMeta(bundle)}` },
                    { label: "Close State", value: closeMeta.label, meta: closeMeta.detail },
                ])}
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="ledger">Open ledger & reconciliation</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="imports">Open imports & data health</button>
                </div>
            </article>
        `;
    }

    function renderReportingRhythmCard(bundle) {
        const dashboard = bundle?.dashboard || {};
        const revenue = bundle?.revenue || {};
        const summary = bundle?.summary || {};
        const closeMeta = closeStatusMeta(bundle);
        const weekRevenue = revenue?.period === "wtd" && revenue?.actual_revenue != null
            ? revenue.actual_revenue
            : (dashboard.week_revenue || 0);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Period summary</h4>
                        <p>Keep day, week, and current-period performance readable in one quick scan.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Daily Close", value: closeMeta.label, meta: closeMeta.detail },
                    { label: "Week Revenue", value: formatCurrency(weekRevenue), meta: "Rolling 7-day club revenue" },
                    { label: "Period Actual", value: formatCurrency(revenue.actual_revenue || summary.total_payments || 0), meta: revenue.actual_revenue != null ? "Current reporting period actuals" : `Today's payment-backed actuals · ${financeReadyBlockedMeta(bundle)}` },
                    { label: "Target Pace", value: revenue.target_revenue != null ? formatCurrency(revenue.target_revenue) : "-", meta: revenue.target_revenue != null ? "Expected position for this period" : "Use the finance dashboard for period pacing" },
                ])}
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="performance">Open finance dashboard</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="imports">Open imports & data health</button>
                </div>
            </article>
        `;
    }

    function renderPlatformCadenceCard(payload) {
        const summary = payload?.summary || {};
        const demo = payload?.demo_environment || {};
        const steps = [
            {
                title: "Qualify launch queue",
                state: `${formatInteger(summary.needs_action || 0)} club(s) need action`,
                detail: "Start with clubs that still have readiness blockers or unclear next steps.",
                attrs: `data-nav-workspace="clubs"`,
                label: "Open clubs",
            },
            {
                title: "Complete setup",
                state: `${formatInteger(summary.onboarding_clubs || 0)} onboarding`,
                detail: "Finish setup, modules, targets, and admin access in one pass.",
                attrs: `data-nav-workspace="onboarding"`,
                label: "Resume onboarding",
            },
            {
                title: "Validate demo path",
                state: escapeHtml(demo.status || "missing"),
                detail: "Keep the demo environment deliberate so launch walkthroughs stay clean.",
                attrs: `data-nav-workspace="demo"`,
                label: "Open demo",
            },
            {
                title: "Promote live clubs",
                state: `${formatInteger(summary.live_clubs || 0)} live`,
                detail: "Only move clubs live when setup, staff access, and readiness are clear.",
                attrs: `data-nav-workspace="clubs"`,
                label: "Review live clubs",
            },
        ];
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Platform launch flow</h4>
                        <p>Super admin should see the sequence clearly: review queue, finish setup, validate demo, then move clubs live.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${steps.map((step, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(step.title)}</div>
                                <div class="ops-step-state">${escapeHtml(step.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(step.detail)}</div>
                            </div>
                            <button type="button" class="button ghost ops-step-action" ${step.attrs}>${escapeHtml(step.label)}</button>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function onboardingReadiness(workspace, defaults) {
        const readiness = workspace?.readiness || {};
        const missing = Array.isArray(readiness.missing) ? readiness.missing : [];
        const enabledModules = Array.isArray(defaults?.enabled_modules) ? defaults.enabled_modules : [];
        const adminReady = Boolean(String(defaults?.admin_email || "").trim());
        const targetsReady = Boolean(String(defaults?.annual_rounds || "").trim() || String(defaults?.annual_revenue || "").trim());
        return {
            missing,
            enabledModules,
            adminReady,
            targetsReady,
            score: Number(readiness.score || 0),
            nextStep: String(readiness.next_step || "").trim() || "Complete the next missing setup item.",
            status: String(readiness.readiness_status || workspace?.club?.status || "onboarding").trim(),
        };
    }

    function renderOnboardingSequenceCard(workspace, defaults) {
        const readiness = onboardingReadiness(workspace, defaults);
        const steps = [
            {
                title: "Club identity",
                state: defaults?.club_name ? "Ready" : "Needs setup",
                detail: "Set club name, display name, location, and launch-facing basics first.",
            },
            {
                title: "Module scope",
                state: `${formatInteger(readiness.enabledModules.length)} enabled`,
                detail: "Only enable the operations this club will actually use at launch.",
            },
            {
                title: "Targets and pricing",
                state: readiness.targetsReady ? "Ready" : "Needs setup",
                detail: "Give the club a realistic target and starting commercial structure.",
            },
            {
                title: "Admin access",
                state: readiness.adminReady ? "Ready" : "Needs setup",
                detail: "Assign the right club admin before handing over the workspace.",
            },
        ];
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Setup sequence</h4>
                        <p>New club setup should read like a short launch checklist, not an intimidating form dump.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${steps.map((step, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(step.title)}</div>
                                <div class="ops-step-state">${escapeHtml(step.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(step.detail)}</div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderOnboardingReadinessCard(workspace, defaults) {
        const readiness = onboardingReadiness(workspace, defaults);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Launch readiness</h4>
                        <p>Keep the selected club's next step visible so super admin can move through setup in a deliberate order.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Readiness Score", value: formatInteger(readiness.score), meta: "Current setup posture" },
                    { label: "Missing Items", value: formatInteger(readiness.missing.length), meta: readiness.missing.length ? "Still blocking clean launch" : "No major missing items" },
                    { label: "Admin Access", value: readiness.adminReady ? "Ready" : "Missing", meta: readiness.adminReady ? "Club admin has been specified" : "Club admin still needs to be assigned" },
                    { label: "Targets", value: readiness.targetsReady ? "Ready" : "Missing", meta: readiness.targetsReady ? "Commercial targets set" : "Launch targets still need input" },
                ])}
                <div class="stack">
                    <div class="detail-row"><span class="row-key">Next step</span><span class="row-value">${escapeHtml(readiness.nextStep)}</span></div>
                    <div class="detail-row"><span class="row-key">Current status</span><span class="row-value">${escapeHtml(readiness.status || "onboarding")}</span></div>
                    <div class="detail-row"><span class="row-key">Missing</span><span class="row-value">${escapeHtml(readiness.missing.join(", ") || "None")}</span></div>
                </div>
            </article>
        `;
    }

    function renderOnboardingHandoverCard(workspace, defaults) {
        const readiness = onboardingReadiness(workspace, defaults);
        const clubIdAttr = defaults?.club_id ? `data-club-id="${escapeHtml(defaults.club_id)}"` : "";
        const steps = [
            {
                title: "Complete setup inputs",
                state: readiness.missing.length ? `${formatInteger(readiness.missing.length)} missing item(s)` : "Inputs complete",
                detail: readiness.missing.length ? readiness.missing.join(", ") : "Identity, modules, and targets are in place.",
                workspace: "onboarding",
                label: "Stay in setup",
            },
            {
                title: "Confirm club access",
                state: readiness.adminReady ? "Club admin ready" : "Club admin missing",
                detail: readiness.adminReady ? "The club has an admin account ready for handover." : "Assign the launch club admin before you move this club live.",
                workspace: "users",
                label: "Open access",
            },
            {
                title: "Open the club workspace",
                state: workspace?.club?.name || "Pick a club",
                detail: "Review the shell, club context, and launch-facing posture before handover.",
                workspace: "clubs",
                label: "Open workspace",
            },
        ];
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Handover lane</h4>
                        <p>Setup is only done when the club can be handed over cleanly: configured, accessible, and understandable.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${steps.map((step, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(step.title)}</div>
                                <div class="ops-step-state">${escapeHtml(step.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(step.detail)}</div>
                            </div>
                            <button type="button" class="button ghost ops-step-action" data-nav-workspace="${escapeHtml(step.workspace)}" ${clubIdAttr}>${escapeHtml(step.label)}</button>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderClubWorkspaceActionCard(workspace) {
        const club = workspace?.club || {};
        const readiness = workspace?.readiness || {};
        const metrics = workspace?.metrics || {};
        const missing = Array.isArray(readiness.missing) ? readiness.missing : [];
        const staff = Array.isArray(workspace?.staff) ? workspace.staff : [];
        const communications = Array.isArray(workspace?.communications) ? workspace.communications : [];
        const adminCount = staff.filter(row => String(row.role || "").toLowerCase() === "admin").length;
        const steps = [
            {
                title: "Resolve readiness blockers",
                state: missing.length ? `${formatInteger(missing.length)} missing` : "Stable",
                detail: missing.length ? missing.join(", ") : "No blocking setup gaps are currently flagged.",
                workspace: "onboarding",
                label: "Open setup",
            },
            {
                title: "Confirm club access",
                state: adminCount ? `${formatInteger(adminCount)} admin account(s)` : "Needs admin",
                detail: adminCount ? "Club admin access is present for handover." : "Assign or reset a club admin before launch.",
                workspace: "users",
                label: "Open users",
            },
            {
                title: "Validate member and booking base",
                state: `${formatInteger(metrics.members || 0)} members ? ${formatInteger(metrics.bookings_upcoming || 0)} upcoming`,
                detail: "Imported members and upcoming golf activity should make sense before the club goes live.",
                workspace: "clubs",
                label: "Open workspace",
            },
            {
                title: "Check communications",
                state: `${formatInteger(metrics.communications_published || communications.filter(row => String(row.status || "").toLowerCase() === "published").length)} published`,
                detail: "Make sure launch-facing notices and club messaging are ready.",
                workspace: "clubs",
                label: "Review club",
            },
        ];
        const clubIdAttr = positiveInt(club.id) ? `data-club-id="${escapeHtml(club.id)}"` : "";
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Immediate next actions</h4>
                        <p>Selected club review should tell super admin what to do next, not force them to interpret scattered status fields.</p>
                    </div>
                </div>
                <div class="ops-cadence">
                    ${steps.map((step, index) => `
                        <div class="ops-step">
                            <div class="ops-step-index">${index + 1}</div>
                            <div class="ops-step-copy">
                                <div class="ops-step-title">${escapeHtml(step.title)}</div>
                                <div class="ops-step-state">${escapeHtml(step.state)}</div>
                                <div class="ops-step-detail">${escapeHtml(step.detail)}</div>
                            </div>
                            <button type="button" class="button ghost ops-step-action" data-nav-workspace="${escapeHtml(step.workspace)}" ${clubIdAttr}>${escapeHtml(step.label)}</button>
                        </div>
                    `).join("")}
                </div>
            </article>
        `;
    }

    function renderSuperAccessSummary(clubs, staff, selectedClubId) {
        const clubRows = Array.isArray(clubs) ? clubs : [];
        const userRows = Array.isArray(staff) ? staff : [];
        const visibleClubIds = selectedClubId ? [selectedClubId] : clubRows.map(row => positiveInt(row.id)).filter(Boolean);
        const scopedUsers = selectedClubId
            ? userRows.filter(row => Number(row.club_id) === Number(selectedClubId))
            : userRows;
        const adminCount = scopedUsers.filter(row => String(row.role || "").toLowerCase() === "admin").length;
        const staffCount = scopedUsers.filter(row => String(row.role || "").toLowerCase() === "club_staff").length;
        const clubsWithAdmin = new Set(
            userRows
                .filter(row => String(row.role || "").toLowerCase() === "admin")
                .map(row => positiveInt(row.club_id))
                .filter(Boolean)
        );
        const missingAdmin = visibleClubIds.filter(clubId => !clubsWithAdmin.has(clubId));
        const selectedClub = clubRows.find(row => Number(row.id) === Number(selectedClubId)) || null;
        return `
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>Access governance</h3>
                        <p>Super admin should see whether every club has the right admin and staff coverage before handover, not just a user table.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Club Admins", value: formatInteger(adminCount), meta: selectedClub ? `Visible in ${selectedClub.name}` : "Visible in current scope" },
                    { label: "Staff Accounts", value: formatInteger(staffCount), meta: "Club-side operator accounts" },
                    { label: "Missing Admin", value: formatInteger(missingAdmin.length), meta: missingAdmin.length ? "Clubs still need a club admin" : "Every visible club has an admin" },
                    { label: "Club Scope", value: escapeHtml(selectedClub?.name || "All clubs"), meta: selectedClub ? "Filtered view" : "Platform-wide access view" },
                ])}
            </section>
        `;
    }

    function renderSuperAccessCoverageCard(clubs, staff, selectedClubId) {
        const clubRows = Array.isArray(clubs) ? clubs : [];
        const userRows = Array.isArray(staff) ? staff : [];
        const filteredClubs = selectedClubId
            ? clubRows.filter(row => Number(row.id) === Number(selectedClubId))
            : clubRows.slice(0, 8);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Club access coverage</h4>
                        <p>Each launch club should clearly show whether admin and staff access is in place before you hand over the workspace.</p>
                    </div>
                </div>
                <div class="stack">
                    ${filteredClubs.length ? filteredClubs.map(row => {
                        const admins = userRows.filter(user => Number(user.club_id) === Number(row.id) && String(user.role || "").toLowerCase() === "admin").length;
                        const operators = userRows.filter(user => Number(user.club_id) === Number(row.id) && String(user.role || "").toLowerCase() === "club_staff").length;
                        return `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.name || "Club")}</span>
                                    ${renderStatusPill("", admins ? "configured" : "missing")}
                                </div>
                                <div class="list-meta">${escapeHtml(`${formatInteger(admins)} admin ? ${formatInteger(operators)} staff ? ${row.slug || ""}`)}</div>
                                <div class="inline-actions">
                                    <button type="button" class="button ghost" data-nav-workspace="users" data-club-id="${escapeHtml(row.id)}">Open access</button>
                                </div>
                            </div>
                        `;
                    }).join("") : `<div class="empty-state">No clubs available in the current scope.</div>`}
                </div>
            </article>
        `;
    }

    function mappingReadinessSummary(settingsRows, cashbookSettings = {}, financeSemantics = {}) {
        const rows = Array.isArray(settingsRows) ? settingsRows : [];
        const configured = rows.filter(row => Boolean(row?.configured)).length;
        const total = rows.length;
        const missing = Math.max(0, total - configured);
        const cashbookReady = Boolean(String(cashbookSettings?.cashbook_name || "").trim() && String(cashbookSettings?.cashbook_contra_gl || "").trim());
        const exportMapping = financeSemantics?.export_mapping || {};
        return {
            configured,
            total,
            missing,
            cashbookReady,
            exportMappingConfigured: Boolean(exportMapping.configured),
            layoutConfigured: Boolean(exportMapping.layout_configured),
            mappingsConfigured: Boolean(exportMapping.mappings_configured),
            exportSetupReady: Boolean(cashbookReady && exportMapping.configured),
        };
    }

    function renderAccountingWorkflowCard(bundle) {
        const settingsRows = Array.isArray(bundle?.importSettings) ? bundle.importSettings : [];
        const summary = mappingReadinessSummary(settingsRows, bundle?.settings || {}, bundle?.closeStatus?.finance_semantics || {});
        const closeMeta = closeStatusMeta(bundle);
        const mappingValue = settingsRows.length
            ? `${formatInteger(summary.configured)}/${formatInteger(summary.total)}`
            : (summary.exportMappingConfigured ? "Aligned" : "Needs setup");
        const mappingMeta = settingsRows.length
            ? "Revenue mappings aligned to the club ledger shape"
            : (summary.exportMappingConfigured ? "Pastel layout and mappings are configured" : "Pastel layout or mappings still need setup");
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Export steps</h4>
                        <p>GreenLink is not replacing the club's accounting package. It should simply make capture, mapping, and CSV export cleaner for staff.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: settingsRows.length ? "Mapped Streams" : "Export Fit", value: mappingValue, meta: mappingMeta },
                    { label: "Missing Mappings", value: settingsRows.length ? formatInteger(summary.missing) : (summary.exportMappingConfigured ? "0" : "1"), meta: settingsRows.length ? (summary.missing ? "Mappings still need attention" : "Mappings are in place") : (summary.exportMappingConfigured ? "Pastel mapping posture is in place" : "Open Imports & Data Health for Pastel layout and mapping setup") },
                    { label: "Cashbook Setup", value: summary.exportSetupReady ? "Ready" : "Needs setup", meta: summary.exportSetupReady ? "Cashbook target and export mapping posture are configured" : (summary.cashbookReady ? "Cashbook target is configured but export mapping still needs setup" : "Cashbook export target still needs setup") },
                    { label: "Day Close", value: closeMeta.label, meta: closeMeta.detail },
                ])}
                <div class="stack">
                    <div class="detail-row"><span class="row-key">1. Capture</span><span class="row-value">Bookings, pro-shop sales, and club revenue are captured in GreenLink.</span></div>
                    <div class="detail-row"><span class="row-key">2. Map</span><span class="row-value">Revenue streams are matched to the club's current ledger and cashbook layout.</span></div>
                    <div class="detail-row"><span class="row-key">3. Export</span><span class="row-value">Staff review the preview, export CSV, and import it into the club's existing accounting software.</span></div>
                </div>
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="reports" data-nav-panel="imports">Open imports & data health</button>
                    <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>
                </div>
            </article>
        `;
    }

    function availableDashboardStreams(dashboard) {
        const streams = dashboard?.revenue_streams || {};
        const rows = [{ key: "all", label: "All" }, { key: "golf", label: "Golf" }];
        if (streams.pro_shop) rows.push({ key: "pro_shop", label: "Pro Shop" });
        return rows;
    }

    function dashboardStreamPreference(dashboard, options = {}) {
        const fallback = options.mode === "today" ? "golf" : "all";
        const allowed = availableDashboardStreams(dashboard).map(item => item.key);
        const stored = String(window.localStorage.getItem("greenlink_admin_dashboard_stream") || "").trim().toLowerCase();
        return allowed.includes(stored) ? stored : fallback;
    }

    function selectedOverviewInsight(dashboard, options = {}) {
        const stream = dashboardStreamPreference(dashboard, options);
        const insights = dashboard.operation_insights || {};
        return {
            stream,
            insight: insights[stream] || insights.all || {},
        };
    }

    function dashboardTargetPeriod(dashboard, period = "mtd") {
        const periods = dashboard?.targets?.periods || {};
        return periods[String(period || "").trim().toLowerCase()] || null;
    }

    function paceVarianceMeta(actual, target, options = {}) {
        if (target == null) {
            return {
                value: null,
                label: String(options.emptyLabel || "Target not set"),
                detail: String(options.emptyDetail || "Save targets to unlock pace guidance."),
            };
        }
        const variance = safeNumber(actual) - safeNumber(target);
        const absVariance = Math.abs(variance);
        const unit = String(options.unit || "currency").trim().toLowerCase();
        const formattedVariance = unit === "number"
            ? formatInteger(absVariance)
            : formatCurrency(absVariance);
        return {
            value: variance,
            label: variance >= 0 ? "Ahead" : "Behind",
            detail: `${variance >= 0 ? "Ahead of" : "Behind"} pace by ${formattedVariance}`,
        };
    }

    function annualTargetRow(bundle, operationKey, metricKey) {
        const targets = Array.isArray(bundle?.operationalTargets?.targets) ? bundle.operationalTargets.targets : [];
        const operationNorm = String(operationKey || "").trim().toLowerCase();
        const metricNorm = String(metricKey || "").trim().toLowerCase();
        return targets.find(row => (
            String(row.operation_key || "").trim().toLowerCase() === operationNorm
            && String(row.metric_key || "").trim().toLowerCase() === metricNorm
        )) || null;
    }

    function currentYearDayProgress() {
        const now = new Date();
        const year = now.getFullYear();
        const start = new Date(year, 0, 1);
        const next = new Date(year + 1, 0, 1);
        const elapsed = Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400000) + 1);
        const total = Math.max(365, Math.round((next.getTime() - start.getTime()) / 86400000));
        return { elapsed, total };
    }

    function yearToDateTarget(annualValue) {
        const annual = Number(annualValue);
        if (!Number.isFinite(annual) || annual <= 0) return null;
        const progress = currentYearDayProgress();
        return annual * (progress.elapsed / progress.total);
    }

    function operationalTrackingCard(panel, bundle) {
        const revenueTarget = annualTargetRow(bundle, panel, "revenue");
        const usageTarget = annualTargetRow(bundle, panel, "usage");
        if (panel === "bowls") {
            const ytdRevenue = safeNumber(bundle?.dashboard?.revenue_streams?.bowls?.ytd_revenue);
            const ytdTarget = yearToDateTarget(revenueTarget?.target_value);
            const pace = paceVarianceMeta(ytdRevenue, ytdTarget, {
                unit: "currency",
                emptyDetail: "Save an annual bowls revenue target to unlock YTD pace guidance.",
            });
            return {
                label: "YTD Revenue",
                value: formatCurrency(ytdRevenue),
                meta: revenueTarget
                    ? `${pace.detail}. Annual target ${formatByUnit(revenueTarget.target_value || 0, revenueTarget.unit)}.`
                    : "Imported bowls revenue is visible, but no annual target is configured yet.",
            };
        }
        if (revenueTarget && safeNumber(revenueTarget.target_value || 0) > 0) {
            return {
                label: "Annual Revenue Target",
                value: formatByUnit(revenueTarget.target_value || 0, revenueTarget.unit),
                meta: "Use target, member activity, and configured capacity until dedicated payment tracking is split out here.",
            };
        }
        if (usageTarget && safeNumber(usageTarget.target_value || 0) > 0) {
            return {
                label: "Annual Usage Target",
                value: formatByUnit(usageTarget.target_value || 0, usageTarget.unit),
                meta: "Operational usage target for this sport.",
            };
        }
        return {
            label: "Tracking",
            value: "Set targets",
            meta: "Save annual revenue or usage targets so this page can track pace properly.",
        };
    }

    function operationalTargetFocusRows(bundle, options = {}) {
        const selectedStream = String(options.stream || "all").trim().toLowerCase() || "all";
        const targets = Array.isArray(bundle?.operationalTargets?.targets) ? bundle.operationalTargets.targets : [];
        if (!targets.length) return [];

        const preferredKeys = selectedStream === "golf"
            ? ["golf:revenue", "golf:rounds", "golf_days:pipeline"]
            : selectedStream === "pro_shop"
                ? ["pro_shop:revenue", "pro_shop:transactions", "members:active_members"]
                : selectedStream === "bowls"
                    ? ["bowls:revenue", "bowls:usage", "members:active_members"]
                    : selectedStream === "tennis"
                        ? ["tennis:revenue", "tennis:usage", "members:active_members"]
                        : selectedStream === "padel"
                            ? ["padel:revenue", "padel:usage", "members:active_members"]
                : ["golf:revenue", "golf_days:pipeline", "members:active_members", "pro_shop:revenue"];

        const byKey = new Map(targets.map(row => [`${String(row.operation_key || "").trim().toLowerCase()}:${String(row.metric_key || "").trim().toLowerCase()}`, row]));
        const ordered = preferredKeys
            .map(key => byKey.get(key))
            .filter(row => row && safeNumber(row.target_value || 0) > 0);

        return ordered.slice(0, 3).map(row => ({
            label: row.label || `${row.operation_key} ${row.metric_key}`,
            value: formatByUnit(row.target_value || 0, row.unit),
            meta: `Annual target ? ${String(row.unit || "target").replaceAll("_", " ")}`,
        }));
    }

    function renderOperationalTargetFocus(bundle, options = {}) {
        const rows = operationalTargetFocusRows(bundle, options);
        if (!rows.length) return "";
        return `
            <div class="stack compact-stack">
                ${rows.map(row => `
                    <div class="detail-row">
                        <span class="row-key">${escapeHtml(row.label)}</span>
                        <span class="row-value">${escapeHtml(row.value)} <span class="list-meta">${escapeHtml(row.meta)}</span></span>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function aiTargetSummary(bundle) {
        const dashboard = bundle?.dashboard || {};
        const mtd = dashboardTargetPeriod(dashboard, "mtd");
        const ytd = dashboardTargetPeriod(dashboard, "ytd");
        const mtdPace = paceVarianceMeta(mtd?.revenue_actual, mtd?.revenue_target);
        const roundsPace = paceVarianceMeta(ytd?.rounds_actual, ytd?.rounds_target, {
            unit: "number",
            emptyDetail: "Save targets to unlock rounds pacing.",
        });
        const focusRows = operationalTargetFocusRows(bundle, { stream: "all" });
        const focusText = focusRows.length
            ? `${focusRows[0].label} target ${focusRows[0].value}.`
            : "No operational target focus is configured yet.";
        if (mtd?.revenue_target == null) {
            return `No revenue pace target is configured yet. ${focusText}`;
        }
        const roundsSentence = ytd?.rounds_target == null
            ? "Rounds pace is not configured yet."
            : `YTD rounds are ${roundsPace.label.toLowerCase()} pace by ${formatInteger(Math.abs(roundsPace.value || 0))}.`;
        return `MTD revenue is ${mtdPace.label.toLowerCase()} pace by ${formatCurrency(Math.abs(mtdPace.value || 0))}. ${roundsSentence} ${focusText}`;
    }

    function renderInsightMeta(copy) {
        const detail = String(copy || "").trim() || "Target-aware guidance is active.";
        return `<span class="metric-pill">${escapeHtml(detail)}</span>`;
    }

    function noShowGuidanceRows(bundle, options = {}) {
        const noShow = bundle?.dashboard?.ai_assistant?.no_show || {};
        const rows = Array.isArray(noShow.recommendations) ? noShow.recommendations.slice(0, Number(options.limit || 2)) : [];
        return rows.length
            ? rows.map(text => ({ title: "No-show watch", detail: text }))
            : [{ title: "No-show watch", detail: "No urgent no-show actions are flagged right now." }];
    }

    function revenueIntegrityGuidanceRows(bundle, options = {}) {
        const integrity = bundle?.dashboard?.ai_assistant?.revenue_integrity || {};
        const rows = Array.isArray(integrity.alerts) ? integrity.alerts.slice(0, Number(options.limit || 2)) : [];
        const financeSummary = closeStatusFinanceSummary(bundle);
        const blockedRows = Number(financeSummary.blocked_rows || 0);
        const pendingRows = Number(financeSummary.pending_export_rows || 0);
        const missingPaymentMethodRows = Number(financeSummary.missing_payment_method_rows || 0);
        const missingMappingRows = Number(financeSummary.missing_mapping_rows || 0);
        return rows.length
            ? rows.map(item => ({ title: item.title || "Revenue integrity", detail: item.detail || item.context || "" }))
            : blockedRows > 0
                ? [{
                    title: "Revenue integrity",
                    detail: missingPaymentMethodRows > 0 && missingMappingRows > 0
                        ? `${formatInteger(blockedRows)} export blocker(s) still need payment methods and Pastel mapping setup.`
                        : missingPaymentMethodRows > 0
                            ? `${formatInteger(blockedRows)} export blocker(s) still need payment methods before clean export handoff.`
                            : `${formatInteger(blockedRows)} export blocker(s) still need Pastel layout or mapping setup.`,
                }]
                : pendingRows > 0
                    ? [{ title: "Revenue integrity", detail: `${formatInteger(pendingRows)} paid ledger row(s) still need export before day close.` }]
                    : [{ title: "Revenue integrity", detail: "No payment or ledger integrity blockers are active right now." }];
    }

    function importCopilotGuidanceRows(bundle, options = {}) {
        const importCopilot = bundle?.dashboard?.ai_assistant?.import_copilot || {};
        const rows = Array.isArray(importCopilot.recommendations) ? importCopilot.recommendations.slice(0, Number(options.limit || 2)) : [];
        return rows.length
            ? rows.map(text => ({ title: "Import guidance", detail: text }))
            : [{ title: "Import guidance", detail: "Import mapping and freshness guidance is stable." }];
    }

    function renderGuidanceStack(rows, options = {}) {
        const items = (Array.isArray(rows) ? rows : []).filter(Boolean);
        if (!items.length) return "";
        const extraClass = String(options.extraClass || "").trim();
        return `
            <div class="stack compact-stack ${escapeHtml(extraClass)}">
                ${items.map(item => `
                    <div class="list-row">
                        <div class="list-row-top">
                            <span class="list-title">${escapeHtml(item.title || "Guidance")}</span>
                        </div>
                        <div class="list-meta">${escapeHtml(item.detail || "")}</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function setDashboardStreamPreference(stream) {
        const next = String(stream || "").trim().toLowerCase();
        window.localStorage.setItem("greenlink_admin_dashboard_stream", next || "all");
    }

    function renderOverviewStreamCard(dashboard, options = {}) {
        const selected = dashboardStreamPreference(dashboard, options);
        const rows = availableDashboardStreams(dashboard);
        const noteByStream = {
            all: "Combined leadership view across golf and enabled commercial operations.",
            golf: "Golf-focused board with tee-sheet utilization, paid rounds, and golf-day posture.",
            pro_shop: "Pro shop commercial view with sales pace and stock-risk context.",
        };
        return `
            <section class="dashboard-card dashboard-stream-card">
                <div class="panel-head">
                    <div>
                        <h4>Operations View</h4>
                        <p>${escapeHtml(noteByStream[selected] || noteByStream.all)}</p>
                    </div>
                </div>
                <div class="tee-toggle dashboard-stream-toggle" role="group" aria-label="Dashboard stream view">
                    ${rows.map(row => `
                        <button type="button" class="tee-btn dashboard-stream-btn ${selected === row.key ? "active" : ""}" data-dashboard-stream="${escapeHtml(row.key)}">
                            ${escapeHtml(row.label)}
                        </button>
                    `).join("")}
                </div>
            </section>
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
        if (["live", "active", "checked_in", "completed", "published", "paid", "healthy", "closed", "configured"].includes(value)) return "ok";
        if (["draft", "onboarding", "partial", "booked", "medium", "open", "stale"].includes(value)) return "warn";
        if (["inactive", "cancelled", "no_show", "high", "archived", "missing"].includes(value)) return "bad";
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
        if (!tabs.length || roleShell() === "club_admin" || roleShell() === "staff") {
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

    function teeSheetSlotState(value) {
        const status = String(value || "").trim().toLowerCase();
        if (["checked_in", "checked-in"].includes(status)) return "checked-in";
        if (status === "no_show") return "no-show";
        if (status === "cancelled") return "cancelled";
        if (status === "completed") return "completed";
        if (status === "blocked") return "blocked";
        if (status === "closed") return "closed";
        return status === "booked" ? "booked" : "open";
    }

    function teeSheetSlotLabel(value) {
        const status = String(value || "").trim().toLowerCase();
        if (!status || status === "open") return "Open";
        return status.replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
    }

    function isPersistedTeeTimeId(value) {
        return Number(value || 0) > 0;
    }

    function orderedGolfTeeRows(rows) {
        return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
            const byTime = String(left.tee_time || "").localeCompare(String(right.tee_time || ""));
            if (byTime) return byTime;
            return safeNumber(left.hole || 0) - safeNumber(right.hole || 0);
        });
    }

    function renderNativeTeeSlot(row, booking, slotNumber) {
        if (booking) {
            const bookingId = Number(booking.id || 0);
            const paymentState = booking.prepaid ? "Prepaid" : "Pay on day";
            const playerMeta = [
                booking.member_id ? "Member linked" : "",
                booking.holes ? `${formatInteger(booking.holes)} holes` : "",
                paymentState,
                booking.cart ? "Cart" : "",
            ].filter(Boolean).join(" ? ");
            return `
                <article
                    class="tee-sheet-slot-card ${escapeHtml(teeSheetSlotState(booking.status || "booked"))}"
                    draggable="true"
                    data-booking-id="${escapeHtml(String(bookingId))}"
                    data-tee-time-id="${escapeHtml(String(row.id))}"
                    data-slot-number="${escapeHtml(String(slotNumber))}"
                >
                    <div class="tee-sheet-slot-top">
                        <span class="tee-sheet-slot-status">${escapeHtml(teeSheetSlotLabel(booking.status || "booked"))}</span>
                        <span class="tee-sheet-slot-price">${escapeHtml(formatCurrency(booking.price || 0))}</span>
                    </div>
                    <div class="tee-sheet-slot-name">${escapeHtml(booking.player_name || "Booking")}</div>
                    <div class="tee-sheet-slot-meta">${escapeHtml(playerMeta || (booking.player_email || "Player details pending"))}</div>
                    <div class="tee-sheet-slot-actions">
                        ${(booking.status || "") === "booked" ? `<button type="button" class="button secondary" data-check-in="${escapeHtml(String(booking.id))}">Check in</button>` : ""}
                        ${(booking.status || "") === "booked" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(String(booking.id))}" data-status-value="no_show">No-show</button>` : ""}
                        ${(booking.status || "") === "booked" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(String(booking.id))}" data-status-value="cancelled">Cancel</button>` : ""}
                    </div>
                </article>
            `;
        }

        const slotState = String(row.status || "").trim().toLowerCase() === "blocked" ? "blocked" : "open";
        const canCreateBooking = isPersistedTeeTimeId(row.id);
        const isPlaceholderRow = slotState !== "blocked" && !canCreateBooking;
        const slotCopy = slotState === "blocked"
            ? "Blocked for this tee start"
            : isPlaceholderRow
                ? "Placeholder tee start"
                : "Open for a new booking";
        const slotMeta = slotState === "blocked"
            ? "Golf-day or closure rule applied."
            : canCreateBooking
                ? "Add booking, then drag between starts without leaving the shell."
                : "Generate the tee sheet for this day before adding bookings.";
        return `
            <article
                class="${escapeHtml(`tee-sheet-slot-card ${slotState}${isPlaceholderRow ? " placeholder" : ""}`)}"
                ${canCreateBooking ? `data-tee-time-id="${escapeHtml(String(row.id))}"` : ""}
                data-slot-number="${escapeHtml(String(slotNumber))}"
            >
                <div class="tee-sheet-slot-top">
                    <span class="tee-sheet-slot-status">${escapeHtml(slotState === "blocked" ? "Blocked" : isPlaceholderRow ? "Placeholder" : `Slot ${slotNumber}`)}</span>
                </div>
                <div class="tee-sheet-slot-name">${escapeHtml(slotCopy)}</div>
                <div class="tee-sheet-slot-meta">${escapeHtml(slotMeta)}</div>
                ${slotState === "blocked" ? "" : `
                    <div class="tee-sheet-slot-actions">
                        ${canCreateBooking
                            ? `<button type="button" class="button secondary" data-open-booking="${escapeHtml(String(row.id))}" data-open-booking-party="${escapeHtml(String(Math.max(1, Math.min(slotNumber, Number(row.available || 4) || 1))))}">Add booking</button>`
                            : `<button type="button" class="button secondary" disabled title="Generate the tee sheet for this day first.">Add booking</button>`}
                    </div>
                `}
            </article>
        `;
    }

    function renderNativeTeeSheetRows(rows) {
        const ordered = orderedGolfTeeRows(rows);
        if (!ordered.length) {
            return `
                <tr class="empty-row">
                    <td colspan="6">
                        <div class="empty-state">No tee times are loaded for this day yet.</div>
                    </td>
                </tr>
            `;
        }
        return ordered.map(row => {
            const bookings = Array.isArray(row.bookings) ? row.bookings.slice(0, 4) : [];
            const capacity = Math.max(1, Number(row.capacity || 4));
            const teeLabel = row.hole || "1";
            const status = String(row.status || "open").trim().toLowerCase();
            return `
                <tr data-tee-time-id="${escapeHtml(String(row.id))}" data-tee-time-iso="${escapeHtml(String(row.tee_time || ""))}">
                    <td class="time-col">
                        <div class="tee-sheet-time">${escapeHtml(formatTime(row.tee_time))}</div>
                        <div class="tee-sheet-time-meta">${escapeHtml(formatDate(row.tee_time))}</div>
                    </td>
                    <td class="tee-col">
                        <div class="tee-sheet-tee-label">Tee ${escapeHtml(String(teeLabel))}</div>
                        <div class="tee-sheet-tee-meta">${escapeHtml(status === "blocked" ? "Blocked" : `${formatInteger(row.occupied || 0)}/${formatInteger(capacity)} used`)}</div>
                    </td>
                    ${Array.from({ length: 4 }, (_, index) => `
                        <td class="slot-col">
                            ${index < capacity
                                ? renderNativeTeeSlot(row, bookings[index] || null, index + 1)
                                : `<article class="tee-sheet-slot-card closed"><div class="tee-sheet-slot-top"><span class="tee-sheet-slot-status">Closed</span></div><div class="tee-sheet-slot-name">Not in play</div><div class="tee-sheet-slot-meta">This start is configured below four active player places.</div></article>`}
                        </td>
                    `).join("")}
                </tr>
            `;
        }).join("");
    }

    function renderGolfTeeSheetPanel(bundle) {
        const rows = Array.isArray(bundle.teeRows) ? bundle.teeRows : [];
        const ordered = orderedGolfTeeRows(rows);
        const occupied = ordered.reduce((sum, row) => sum + Number(row.occupied || 0), 0);
        const capacity = ordered.reduce((sum, row) => sum + Number(row.capacity || 4), 0);
        const bookedStarts = ordered.filter(row => Number(row.occupied || 0) > 0).length;
        const blockedStarts = ordered.filter(row => String(row.status || "").trim().toLowerCase() === "blocked").length;
        const teeLabels = Array.from(new Set(ordered.map(row => String(row.hole || "").trim()).filter(Boolean)));
        const opsPlan = teeLabels.length
            ? `Live across Tee ${teeLabels.join(" and Tee ")} ? ${formatInteger(ordered.length)} starts ? Four-slot operating grid`
            : "The live day sheet stays in the shell with direct booking, movement, and check-in control.";
        return `
            ${renderPageHero({
                title: "Tee Sheet",
                copy: "Run the live golf day here: tee grid, booking cards, fast movement, and check-in.",
                workspace: "golf",
                subnavLabel: "Golf pages",
                extraClass: "golf-hero-card native-tee-sheet-hero",
                metrics: [
                    { label: "Starts", value: formatInteger(ordered.length), meta: "Active tee-time rows on this day" },
                    { label: "Booked Starts", value: formatInteger(bookedStarts), meta: "Rows carrying at least one booking" },
                    { label: "Occupancy", value: capacity ? formatPercent(occupied / capacity) : "0%", meta: `${formatInteger(occupied)}/${formatInteger(capacity)} places used` },
                    { label: "Blocked", value: formatInteger(blockedStarts), meta: "Starts blocked by rules or closure" },
                ],
                body: `
                    <div class="tee-sheet-toolbar">
                        <div class="tee-sheet-date-controls">
                            <button type="button" class="button secondary" data-date-shift="-1">Previous day</button>
                            <input type="date" class="tee-sheet-date-input" data-tee-sheet-date value="${escapeHtml(bundle.date)}">
                            <button type="button" class="button secondary" data-date-shift="1">Next day</button>
                        </div>
                    </div>
                    <div class="tee-sheet-ops-plan">${escapeHtml(opsPlan)}</div>
                `,
            })}
            <section class="card native-tee-sheet-card">
                <div class="panel-head">
                    <div>
                        <h4>Live tee grid</h4>
                        <p>Use the booking cards directly in this grid. Drag booked cards onto open starts to move them without leaving the shell.</p>
                    </div>
                </div>
                <div class="tee-sheet-table-wrap" data-native-tee-sheet>
                    <table class="tee-sheet-table">
                        <thead class="tee-sheet-head">
                            <tr>
                                <th class="time-col">Time</th>
                                <th class="tee-col">Tee</th>
                                <th class="slot-col">Slot 1</th>
                                <th class="slot-col">Slot 2</th>
                                <th class="slot-col">Slot 3</th>
                                <th class="slot-col">Slot 4</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderNativeTeeSheetRows(ordered)}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderNav() {
        const nav = Array.isArray(state.bootstrap?.nav) ? state.bootstrap.nav : [];
        els.nav.innerHTML = navGroups(nav).map(group => `
            <section class="nav-group ${state.navOpenGroups.has(String(group.id || "").toLowerCase()) ? "open" : ""} ${navGroupIsActive(group) ? "active" : ""}">
                <button type="button" class="nav-group-toggle" data-nav-group="${escapeHtml(group.id || group.label)}" aria-expanded="${state.navOpenGroups.has(String(group.id || "").toLowerCase()) ? "true" : "false"}">
                    <span class="nav-group-label">${escapeHtml(group.label)}</span>
                    <span class="nav-group-caret">${state.navOpenGroups.has(String(group.id || "").toLowerCase()) ? "-" : "+"}</span>
                </button>
                <div class="nav-group-items" ${state.navOpenGroups.has(String(group.id || "").toLowerCase()) ? "" : "hidden"}>
                    ${group.items.flatMap(item => {
                        const workspace = String(item.workspace || "");
                        const tabs = roleShell() === "club_admin" || roleShell() === "staff"
                            ? navTabsForWorkspace(workspace)
                            : [];
                        const entries = tabs.length
                            ? tabs.map(tab => ({
                                workspace,
                                panel: tab.id,
                                label: tab.label,
                                active: state.route.workspace === workspace && state.route.panel === tab.id,
                            }))
                            : [{
                                workspace,
                                panel: null,
                                label: navDisplayLabel(workspace, item.label || workspace),
                                active: state.route.workspace === workspace,
                            }];
                        return entries.map(entry => `
                            <button
                                type="button"
                                class="nav-item ${entry.active ? "active" : ""}"
                                data-nav-workspace="${escapeHtml(entry.workspace)}"
                                ${entry.panel ? `data-nav-panel="${escapeHtml(entry.panel)}"` : ""}
                            >
                                <span class="nav-item-text">${escapeHtml(entry.label)}</span>
                            </button>
                        `);
                    }).join("")}
                </div>
            </section>
        `).join("");
    }

    function renderChrome() {
        const shell = roleShell();
        const user = currentUser();
        const club = activeClub();
        const meta = workspaceMeta(state.route.workspace);
        const roleLabel = ROLE_LABELS[String(user.role || "").toLowerCase()] || "User";
        const clubName = club?.display_name || club?.name || "GreenLink";

        els.body.dataset.shell = shell || "";

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
            els.brandKicker.textContent = shell === "staff" ? "GreenLink Staff" : "GreenLink Operations";
            els.brandTitle.textContent = clubName;
            els.brandCopy.textContent = shell === "staff"
                ? "Fast club-side operating shell for today's work."
                : "Run the whole club from one shell. Golf, operations, finance, and setup stay connected.";
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
        state.bootstrapFetchedAt = Date.now();
        return cached;
    }

    function cloneWorkspacePayload(value) {
        return value;
    }

    function workspaceRouteKey(route = state.route) {
        const shell = roleShell();
        return [
            shell,
            String(route?.workspace || ""),
            String(route?.panel || ""),
            String(route?.date || ""),
            String(route?.clubId || ""),
        ].join("|");
    }

    function workspaceCacheTtl(route = state.route) {
        return Number(WORKSPACE_CACHE_TTL_BY_WORKSPACE[String(route?.workspace || "").trim().toLowerCase()])
            || WORKSPACE_CACHE_DEFAULT_TTL_MS;
    }

    function readWorkspaceCache(route = state.route) {
        const key = workspaceRouteKey(route);
        const cached = state.workspaceCache.get(key);
        if (!cached) return null;
        if ((Date.now() - Number(cached.createdAt || 0)) > workspaceCacheTtl(route)) {
            state.workspaceCache.delete(key);
            return null;
        }
        return cloneWorkspacePayload(cached.payload);
    }

    function writeWorkspaceCache(route, payload) {
        const key = workspaceRouteKey(route);
        state.workspaceCache.set(key, {
            createdAt: Date.now(),
            payload: cloneWorkspacePayload(payload),
        });
    }

    function deleteWorkspaceCacheKey(route = state.route) {
        const key = workspaceRouteKey(route);
        state.workspaceCache.delete(key);
    }

    function invalidateWorkspaceCache() {
        state.workspaceCache.clear();
        state.sharedCache.clear();
    }

    function invalidateWorkspaceScope(workspace, options = {}) {
        const targetWorkspace = String(workspace || "").trim().toLowerCase();
        if (!targetWorkspace) return;
        const targetPanel = options.panel == null ? null : String(options.panel || "").trim().toLowerCase();
        const targetDate = options.date == null ? null : String(options.date || "").trim();
        const targetClubId = options.clubId === undefined ? String(state.route?.clubId || "") : String(options.clubId || "");
        deleteWorkspaceCacheWhere(key => {
            const [shell, cachedWorkspace, cachedPanel, cachedDate, cachedClubId] = String(key || "").split("|");
            if (shell !== roleShell()) return false;
            if (String(cachedWorkspace || "").trim().toLowerCase() !== targetWorkspace) return false;
            if (targetPanel !== null && String(cachedPanel || "").trim().toLowerCase() !== targetPanel) return false;
            if (targetDate !== null && String(cachedDate || "").trim() !== targetDate) return false;
            if (targetClubId && String(cachedClubId || "") !== targetClubId) return false;
            return true;
        });
    }

    function readSharedCache(key, ttlMs = WORKSPACE_CACHE_DEFAULT_TTL_MS) {
        const cacheKey = String(key || "").trim();
        if (!cacheKey) return null;
        const cached = state.sharedCache.get(cacheKey);
        if (!cached) return null;
        if ((Date.now() - Number(cached.createdAt || 0)) > ttlMs) {
            state.sharedCache.delete(cacheKey);
            return null;
        }
        return cloneWorkspacePayload(cached.payload);
    }

    function writeSharedCache(key, payload) {
        const cacheKey = String(key || "").trim();
        if (!cacheKey) return;
        state.sharedCache.set(cacheKey, {
            createdAt: Date.now(),
            payload: cloneWorkspacePayload(payload),
        });
    }

    async function loadSharedResource(key, loader, ttlMs = WORKSPACE_CACHE_DEFAULT_TTL_MS) {
        const cached = readSharedCache(key, ttlMs);
        if (cached) return cached;
        const fresh = await loader();
        writeSharedCache(key, fresh);
        return cloneWorkspacePayload(fresh);
    }

    async function loadWorkspaceBundle(route, loader) {
        const cached = readWorkspaceCache(route);
        if (cached) return cached;
        const fresh = await loader();
        writeWorkspaceCache(route, fresh);
        return cloneWorkspacePayload(fresh);
    }

    async function refreshBootstrap(force) {
        const now = Date.now();
        const previewClubId = !state.bootstrap?.club_context_locked && roleShell() === "super_admin"
            ? positiveInt(state.route?.clubId)
            : positiveInt(parseRoute().clubId);
        const currentPreview = positiveInt(state.bootstrap?.preview_club?.id);
        if (!force && state.bootstrap && currentPreview === previewClubId && (now - state.bootstrapFetchedAt) < BOOTSTRAP_REFRESH_TTL_MS) {
            return state.bootstrap;
        }

        const query = previewClubId ? `?preview_club_id=${previewClubId}` : "";
        const bootstrap = await window.GreenLinkSession.fetchBootstrap(query);
        window.GreenLinkSession.writeBootstrap(bootstrap);
        state.bootstrap = bootstrap;
        state.bootstrapFetchedAt = Date.now();
        if (force) invalidateWorkspaceCache();
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
            <section class="dashboard-grid">
                <article class="dashboard-card">
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
            ${renderModuleValueGrid(workspace.profile?.enabled_modules || [], { mode: "club" })}
            <section class="dashboard-grid">
                ${renderClubWorkspaceActionCard(workspace)}
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Launch posture</h4>
                            <p>Use this club view to decide whether the workspace is ready for handover, not only to browse details.</p>
                        </div>
                    </div>
                    ${metricCards([
                        { label: "Readiness Score", value: formatInteger(readiness.score || 0), meta: readiness.readiness_status || "Current setup posture" },
                        { label: "Staff Records", value: formatInteger(staff.length), meta: "Club-side access currently visible" },
                        { label: "Published Notices", value: formatInteger(communications.filter(row => String(row.status || "").toLowerCase() === "published").length), meta: "Current club communications ready to show" },
                        { label: "Annual Targets", value: formatInteger(annualTargets.length), meta: "Configured target rows" },
                    ])}
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
                ${renderPlatformCadenceCard(payload)}
            </section>
            <section class="split-grid">
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
            <section class="hero-card">
                <div class="panel-head">
                    <div>
                        <h3>${defaults.club_id ? "Club setup flow" : "New club setup"}</h3>
                        <p>Super admin should be able to read the sequence quickly: identity, modules, targets, admin access, then hand over the workspace.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Selected Club", value: escapeHtml(defaults.display_name || defaults.club_name || "New club"), meta: defaults.club_id ? "Resuming an existing setup" : "Creating a new club workspace" },
                    { label: "Modules", value: formatInteger((defaults.enabled_modules || []).length), meta: "Operational scope selected for launch" },
                    { label: "Admin Access", value: defaults.admin_email ? "Ready" : "Missing", meta: defaults.admin_email ? "Club admin account is specified" : "Club admin still needs input" },
                    { label: "Readiness", value: escapeHtml(onboardingReadiness(workspace, defaults).status || "onboarding"), meta: onboardingReadiness(workspace, defaults).nextStep },
                ])}
            </section>
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
                            <p>Keep golf central and only enable operations that clearly improve daily service, handoff quality, or client value for this club.</p>
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
                    ${renderModuleValueGrid(defaults.enabled_modules, { mode: "setup" })}
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
            <section class="dashboard-grid">
                ${renderOnboardingSequenceCard(workspace, defaults)}
                ${renderOnboardingReadinessCard(workspace, defaults)}
            </section>
            <section class="dashboard-grid">
                ${renderOnboardingHandoverCard(workspace, defaults)}
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Launch portfolio</h4>
                            <p>Keep the next clubs visible so super admin can move through setup in a readable sequence.</p>
                        </div>
                    </div>
                    <div class="stack">
                        ${(clubs || []).slice(0, 6).map(row => `
                            <div class="list-row">
                                <div class="list-row-top">
                                    <span class="list-title">${escapeHtml(row.name || "Club")}</span>
                                    ${renderStatusPill("", row.status || "unknown")}
                                </div>
                                <div class="list-meta">${escapeHtml(row.next_step || row.readiness_status || "No next step recorded")}</div>
                                <div class="inline-actions">
                                    <button type="button" class="button ghost" data-nav-workspace="onboarding" data-club-id="${escapeHtml(row.id)}">Load setup</button>
                                </div>
                            </div>
                        `).join("") || `<div class="empty-state">No clubs available yet.</div>`}
                    </div>
                </article>
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
            ${renderSuperAccessSummary(clubs, staff, selectedClubId)}
            <section class="dashboard-grid">
                ${renderSuperAccessCoverageCard(clubs, staff, selectedClubId)}
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Access reset guidance</h4>
                            <p>Use this screen to assign or refresh club access deliberately. It is platform governance, not a club-side utility screen.</p>
                        </div>
                    </div>
                    <div class="stack">
                        <div class="detail-row"><span class="row-key">1. Select club</span><span class="row-value">Filter to the club you want to hand over.</span></div>
                        <div class="detail-row"><span class="row-key">2. Set role</span><span class="row-value">Use Club Admin for handover control, Staff for day execution.</span></div>
                        <div class="detail-row"><span class="row-key">3. Force reset if needed</span><span class="row-value">Use only when an existing account must be refreshed safely.</span></div>
                    </div>
                </article>
            </section>
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
            ${renderModuleValueGrid(modules.map(row => row.key), { mode: "setup" })}
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

    function activeClubCacheKeyPart() {
        return String(activeClub()?.id || state.route?.clubId || state.bootstrap?.club?.id || "club");
    }

    function dashboardCacheKey(view = "legacy_full", clubKey = activeClubCacheKeyPart()) {
        return `dashboard:${clubKey}:${String(view || "legacy_full").trim().toLowerCase() || "legacy_full"}`;
    }

    function invalidateSharedDashboardViews(views, clubKey = activeClubCacheKeyPart()) {
        const uniqueViews = Array.from(new Set((Array.isArray(views) ? views : [])
            .map(view => String(view || "").trim().toLowerCase())
            .filter(Boolean)));
        uniqueViews.forEach(view => deleteSharedCacheKey(dashboardCacheKey(view, clubKey)));
    }

    function alertsCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `alerts:${clubKey}`;
    }

    function financeBaseCacheKey(date = todayYmd(), clubKey = activeClubCacheKeyPart()) {
        return `finance-base:${clubKey}:${clampYmd(date)}`;
    }

    function operationalTargetsCacheKey(year = new Date().getFullYear(), clubKey = activeClubCacheKeyPart()) {
        return `operational-targets:${clubKey}:${Number(year || new Date().getFullYear())}`;
    }

    function importsBundleCacheKey({
        clubKey = activeClubCacheKeyPart(),
        date = todayYmd(),
        moduleKeys = clubModules(),
    } = {}) {
        const moduleSignature = Array.isArray(moduleKeys)
            ? moduleKeys.map(value => String(value || "").trim().toLowerCase()).filter(Boolean).sort().join(",")
            : "";
        return `imports-bundle:${clubKey}:${clampYmd(date)}:${moduleSignature}`;
    }

    function golfDayBookingsCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `golf-days:${clubKey}`;
    }

    function golfTeeRowsCacheKey(date = state.route?.date, clubKey = activeClubCacheKeyPart()) {
        return `golf-tee-rows:${clubKey}:${clampYmd(date)}`;
    }

    function membersAreaPreviewCacheKey(area, clubKey = activeClubCacheKeyPart()) {
        const safeArea = String(area || "golf").trim().toLowerCase() || "golf";
        return `members-area-preview:${clubKey}:${safeArea}`;
    }

    function activeAccountCustomersCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `account-customers-active:${clubKey}`;
    }

    function recentMembersPreviewCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `members-recent-preview:${clubKey}`;
    }

    function staffListCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `staff-list:${clubKey}`;
    }

    function reportsRevenueCacheKey(period, clubKey = activeClubCacheKeyPart()) {
        const safePeriod = String(period || "mtd").trim().toLowerCase() || "mtd";
        return `reports-revenue:${clubKey}:${safePeriod}`;
    }

    function cashbookPreviewCacheKey(date = todayYmd(), clubKey = activeClubCacheKeyPart()) {
        return `cashbook-preview:${clubKey}:${clampYmd(date)}`;
    }

    function proShopProductsCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `pro-shop-products:${clubKey}`;
    }

    function proShopSalesCacheKey(clubKey = activeClubCacheKeyPart()) {
        return `pro-shop-sales:${clubKey}`;
    }

    function teeRowsNeedMaterialization(rows) {
        const items = Array.isArray(rows) ? rows : [];
        return Boolean(items.length) && items.every(row => !isPersistedTeeTimeId(row?.id));
    }

    function deriveTeeSheetGenerationWindows(rows) {
        const orderedTimes = [...new Set((Array.isArray(rows) ? rows : [])
            .map(row => {
                const stamp = toDate(row?.tee_time);
                return stamp ? stamp.getTime() : null;
            })
            .filter(value => Number.isFinite(value)))]
            .sort((left, right) => left - right);
        if (!orderedTimes.length) return [];

        let intervalMinutes = 8;
        for (let index = 1; index < orderedTimes.length; index += 1) {
            const diffMinutes = Math.round((orderedTimes[index] - orderedTimes[index - 1]) / 60000);
            if (diffMinutes > 0) {
                intervalMinutes = diffMinutes;
                break;
            }
        }

        const windows = [];
        let start = orderedTimes[0];
        let end = orderedTimes[0];
        for (let index = 1; index < orderedTimes.length; index += 1) {
            const current = orderedTimes[index];
            const diffMinutes = Math.round((current - end) / 60000);
            if (diffMinutes > intervalMinutes) {
                windows.push({ start, end, intervalMinutes });
                start = current;
            }
            end = current;
        }
        windows.push({ start, end, intervalMinutes });
        return windows;
    }

    async function materializeGolfTeeRows(date, rows, { signal } = {}) {
        const safeDate = clampYmd(date);
        const teeRows = Array.isArray(rows) ? rows : [];
        if (!teeRowsNeedMaterialization(teeRows)) return false;
        const teeLabels = Array.from(new Set(teeRows.map(row => String(row?.hole || "").trim()).filter(Boolean)));
        const windows = deriveTeeSheetGenerationWindows(teeRows);
        if (!teeLabels.length || !windows.length) return false;
        for (const windowRange of windows) {
            if (signal?.aborted) return false;
            const startDate = new Date(windowRange.start);
            const endDate = new Date(windowRange.end);
            await postJson("/tsheet/generate", {
                date: safeDate,
                tees: teeLabels,
                start_time: `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`,
                end_time: `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`,
                interval_min: Math.max(1, Number(windowRange.intervalMinutes || 8)),
                capacity: Math.max(1, Number(teeRows[0]?.capacity || 4)),
                status: String(teeRows[0]?.status || "open").trim() || "open",
            }, { invalidateCache: false, signal });
        }
        deleteSharedCacheKey(golfTeeRowsCacheKey(safeDate));
        return true;
    }

    function isAbortError(error) {
        return Boolean(error?.name === "AbortError" || error?.code === "ABORT_ERR");
    }

    function beginRouteRequest() {
        if (state.routeRequestController) {
            state.routeRequestController.abort();
        }
        const controller = new AbortController();
        state.routeRequestController = controller;
        return controller;
    }

    function routeRequestSignal() {
        return state.routeRequestController?.signal || null;
    }

    function deleteSharedCacheKey(key) {
        const cacheKey = String(key || "").trim();
        if (!cacheKey) return;
        state.sharedCache.delete(cacheKey);
    }

    function deleteWorkspaceCacheWhere(predicate) {
        if (typeof predicate !== "function") return;
        for (const key of Array.from(state.workspaceCache.keys())) {
            let keep = true;
            try {
                keep = !predicate(key);
            } catch {
                keep = true;
            }
            if (!keep) {
                state.workspaceCache.delete(key);
            }
        }
    }

    function invalidateGolfWorkspaceCaches(date = state.route?.date, panels = null) {
        const targetDate = clampYmd(date);
        const allowedPanels = panels instanceof Set ? panels : null;
        deleteWorkspaceCacheWhere(key => {
            const [shell, workspace, panel, cachedDate] = String(key || "").split("|");
            if (shell !== roleShell()) return false;
            if (workspace !== "golf") return false;
            if (cachedDate !== targetDate) return false;
            if (allowedPanels && !allowedPanels.has(panel || "")) return false;
            return true;
        });
    }

    function invalidateGolfSharedData({
        date = state.route?.date,
        includeTeeRows = false,
        includeDashboard = false,
        includeAlerts = false,
        includeFinanceBase = false,
        financeDate = todayYmd(),
    } = {}) {
        const clubKey = activeClubCacheKeyPart();
        if (includeTeeRows) {
            deleteSharedCacheKey(golfTeeRowsCacheKey(date, clubKey));
        }
        if (includeDashboard) {
            invalidateSharedDashboardViews([
                "overview",
                "today",
                "golf_overview",
                "golf_days",
                "operations_overview",
                "operations_module",
                "reports_performance",
            ], clubKey);
        }
        if (includeAlerts) {
            deleteSharedCacheKey(alertsCacheKey(clubKey));
        }
        if (includeFinanceBase) {
            deleteSharedCacheKey(financeBaseCacheKey(financeDate, clubKey));
        }
    }

    function invalidateClubSummaryCaches({
        includeDashboard = false,
        includeAlerts = false,
        includeFinanceBase = false,
        includeOperationalTargets = false,
        financeDate = todayYmd(),
    } = {}) {
        const clubKey = activeClubCacheKeyPart();
        if (includeDashboard) {
            invalidateSharedDashboardViews([
                "overview",
                "today",
                "golf_overview",
                "golf_days",
                "operations_overview",
                "operations_module",
                "reports_performance",
            ], clubKey);
        }
        if (includeAlerts) deleteSharedCacheKey(alertsCacheKey(clubKey));
        if (includeFinanceBase) {
            deleteSharedCacheKey(financeBaseCacheKey(financeDate, clubKey));
            deleteSharedCacheKey(importsBundleCacheKey({ clubKey, date: financeDate }));
            deleteSharedCacheKey(reportsRevenueCacheKey("mtd", clubKey));
            deleteSharedCacheKey(reportsRevenueCacheKey("wtd", clubKey));
        }
        if (includeOperationalTargets) deleteSharedCacheKey(operationalTargetsCacheKey(new Date().getFullYear(), clubKey));
    }

    function invalidateSummaryDrivenWorkspaceCaches() {
        ["overview", "today", "golf", "operations", "reports"].forEach(workspace => {
            invalidateWorkspaceScope(workspace);
        });
    }

    async function loadSharedFinanceBase({ signal } = {}) {
        const date = todayYmd();
        const clubKey = activeClubCacheKeyPart();
        return loadSharedResource(financeBaseCacheKey(date, clubKey), async () => {
            const [closeStatus, summary, settings] = await Promise.all([
                fetchJsonSafe(`/cashbook/close-status?summary_date=${encodeURIComponent(date)}`, { date, is_closed: false }, { signal }),
                fetchJsonSafe(`/cashbook/daily-summary?summary_date=${encodeURIComponent(date)}`, { date, records: [], total_payments: 0, total_tax: 0, transaction_count: 0 }, { signal }),
                fetchJsonSafe("/cashbook/settings", {}, { signal }),
            ]);
            return { closeStatus, summary, settings };
        }, 10000);
    }

    async function loadSharedDashboardPayload({ signal, view = "legacy_full" } = {}) {
        const clubKey = activeClubCacheKeyPart();
        const safeView = String(view || "legacy_full").trim().toLowerCase() || "legacy_full";
        return loadSharedResource(
            dashboardCacheKey(safeView, clubKey),
            () => fetchJson(`/api/admin/dashboard?view=${encodeURIComponent(safeView)}`, { signal, timeoutMs: 25000 }),
            12000
        );
    }

    async function loadSharedOperationalTargets({ signal, year } = {}) {
        const targetYear = Number(year || new Date().getFullYear());
        const clubKey = activeClubCacheKeyPart();
        return loadSharedResource(
            operationalTargetsCacheKey(targetYear, clubKey),
            () => fetchJsonSafe(`/api/admin/operation-targets?year=${encodeURIComponent(targetYear)}`, { year: targetYear, targets: [] }, { signal, timeoutMs: 12000 }),
            15000
        );
    }

    async function loadSharedMembersAreaPreview({ area, signal } = {}) {
        const safeArea = String(area || "golf").trim().toLowerCase() || "golf";
        return loadSharedResource(
            membersAreaPreviewCacheKey(safeArea, activeClubCacheKeyPart()),
            () => fetchJson(`/api/admin/members?area=${encodeURIComponent(safeArea)}&limit=12&sort=recent_activity`, { signal }),
            8000
        );
    }

    async function loadSharedActiveAccountCustomers({ signal } = {}) {
        return loadSharedResource(
            activeAccountCustomersCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/account-customers?active_only=true&sort=name_asc", { signal }),
            8000
        );
    }

    async function loadSharedRecentMembersPreview({ signal } = {}) {
        return loadSharedResource(
            recentMembersPreviewCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/members?limit=20&sort=recent_activity", { signal }),
            8000
        );
    }

    async function loadSharedStaffList({ signal } = {}) {
        return loadSharedResource(
            staffListCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/staff?limit=50", { signal }),
            8000
        );
    }

    async function loadSharedGolfDayBookings({ signal } = {}) {
        return loadSharedResource(
            golfDayBookingsCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/golf-day-bookings", { signal }),
            8000
        );
    }

    async function loadSharedReportsRevenue({ signal, period = "mtd" } = {}) {
        const safePeriod = ["mtd", "wtd"].includes(String(period || "").trim().toLowerCase())
            ? String(period || "").trim().toLowerCase()
            : "mtd";
        return loadSharedResource(
            reportsRevenueCacheKey(safePeriod, activeClubCacheKeyPart()),
            () => fetchJson(`/api/admin/revenue?period=${encodeURIComponent(safePeriod)}`, { signal }),
            8000
        );
    }

    function loadCachedCashbookPreview({ date = todayYmd() } = {}) {
        return readSharedCache(cashbookPreviewCacheKey(date), 120000);
    }

    async function loadSharedCashbookPreview({ signal, date = todayYmd() } = {}) {
        const safeDate = clampYmd(date);
        return loadSharedResource(
            cashbookPreviewCacheKey(safeDate, activeClubCacheKeyPart()),
            () => fetchJsonSafe(`/cashbook/export-preview?export_date=${encodeURIComponent(safeDate)}`, { journal_lines: [] }, { signal }),
            120000
        );
    }

    function invalidateCashbookPreview(date = todayYmd()) {
        deleteSharedCacheKey(cashbookPreviewCacheKey(date, activeClubCacheKeyPart()));
    }

    async function loadSharedProShopProducts({ signal } = {}) {
        return loadSharedResource(
            proShopProductsCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/pro-shop/products?limit=100", { signal }),
            8000
        );
    }

    async function loadSharedProShopSales({ signal } = {}) {
        return loadSharedResource(
            proShopSalesCacheKey(activeClubCacheKeyPart()),
            () => fetchJson("/api/admin/pro-shop/sales?limit=12&days=30", { signal }),
            8000
        );
    }

    function invalidateProShopPanelSharedData({ includeFinanceBase = false } = {}) {
        const clubKey = activeClubCacheKeyPart();
        deleteSharedCacheKey(proShopProductsCacheKey(clubKey));
        deleteSharedCacheKey(proShopSalesCacheKey(clubKey));
        invalidateClubSummaryCaches({
            includeDashboard: true,
            includeAlerts: true,
            includeFinanceBase,
        });
    }

    async function loadGolfTeeRows(date, { signal, ensureMaterialized = false } = {}) {
        const safeDate = clampYmd(date);
        const start = `${safeDate}T00:00:00`;
        const end = `${addDaysYmd(safeDate, 1)}T00:00:00`;
        let rows = await loadSharedResource(
            golfTeeRowsCacheKey(safeDate),
            () => fetchJson(`/tsheet/staff-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal, timeoutMs: 20000 }),
            WORKSPACE_CACHE_TTL_BY_WORKSPACE.golf
        );
        if (ensureMaterialized && teeRowsNeedMaterialization(rows)) {
            try {
                const created = await materializeGolfTeeRows(safeDate, rows, { signal });
                if (created && !signal?.aborted) {
                    rows = await fetchJson(`/tsheet/staff-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { signal, timeoutMs: 20000 });
                    writeSharedCache(golfTeeRowsCacheKey(safeDate), rows);
                }
            } catch (error) {
                if (!isAbortError(error)) {
                    logClientError("materializeGolfTeeRows", error, { date: safeDate });
                } else {
                    throw error;
                }
            }
        }
        return groupTeeRows(rows);
    }

    function emptyAlertsPayload() {
        return { alerts: [], summary: { total: 0, high: 0, medium: 0, low: 0 } };
    }

    function emptyFinanceBasePayload(date = todayYmd()) {
        return {
            closeStatus: { date, is_closed: false },
            summary: { date, records: [], total_payments: 0, total_tax: 0, transaction_count: 0 },
            settings: {},
        };
    }

    async function loadOperationalAlertsShared({ signal } = {}) {
        return loadSharedResource(
            alertsCacheKey(activeClubCacheKeyPart()),
            () => fetchJsonSafe(
                "/api/admin/operational-alerts",
                emptyAlertsPayload(),
                { signal, timeoutMs: 12000 }
            ),
            8000
        );
    }

    async function loadCommunicationsPreviewShared({ signal, publishedOnly = false } = {}) {
        return loadSharedResource(
            `communications:${activeClubCacheKeyPart()}:${publishedOnly ? "published" : "all"}`,
            () => fetchJson(
                publishedOnly ? "/api/admin/communications?status=published&limit=6" : "/api/admin/communications?limit=6",
                { signal, timeoutMs: 12000 }
            ),
            10000
        );
    }

    async function loadSharedCommunicationsWorkspaceList({ signal, publishedOnly = false } = {}) {
        return loadSharedResource(
            `communications-workspace:${activeClubCacheKeyPart()}:${publishedOnly ? "published" : "all"}`,
            () => fetchJson(
                publishedOnly ? "/api/admin/communications?status=published&limit=50" : "/api/admin/communications?limit=50",
                { signal, timeoutMs: 12000 }
            ),
            10000
        );
    }

    function invalidateCommunicationsWorkspaceList() {
        const clubKey = activeClubCacheKeyPart();
        deleteSharedCacheKey(`communications-workspace:${clubKey}:all`);
        deleteSharedCacheKey(`communications-workspace:${clubKey}:published`);
        deleteSharedCacheKey(`communications:${clubKey}:all`);
        deleteSharedCacheKey(`communications:${clubKey}:published`);
    }

    async function loadStaffRoleContextShared({ signal } = {}) {
        return loadSharedResource(
            `staff-context:${activeClubCacheKeyPart()}`,
            () => fetchJson("/api/admin/staff-role-context", { signal, timeoutMs: 15000 }),
            12000
        );
    }

    async function loadSharedDashboardData({ dashboardView = "legacy_full", includeCommunications = false, communicationsPublishedOnly = false, includeStaffContext = false, signal } = {}) {
        const shell = roleShell();
        const date = todayYmd();
        const dashboardPromise = loadSharedDashboardPayload({ signal, view: dashboardView });
        const alertsPromise = loadOperationalAlertsShared({ signal });
        const financeBasePromise = shell === "club_admin"
            ? loadSharedFinanceBase({ signal })
            : Promise.resolve(emptyFinanceBasePayload(date));
        const communicationsPromise = includeCommunications
            ? loadCommunicationsPreviewShared({ signal, publishedOnly: communicationsPublishedOnly })
            : Promise.resolve(null);
        const staffContextPromise = includeStaffContext
            ? loadStaffRoleContextShared({ signal })
            : Promise.resolve(null);
        const operationalTargetsPromise = shell === "club_admin"
            ? loadSharedOperationalTargets({ signal, year: new Date().getFullYear() })
            : Promise.resolve(null);

        const [dashboard, alerts, financeBase, communications, staffContext, operationalTargets] = await Promise.all([
            dashboardPromise,
            alertsPromise,
            financeBasePromise,
            communicationsPromise,
            staffContextPromise,
            operationalTargetsPromise,
        ]);

        return {
            dashboard,
            alerts,
            closeStatus: financeBase.closeStatus,
            summary: financeBase.summary,
            settings: financeBase.settings,
            communications,
            staffContext,
            operationalTargets,
            date,
        };
    }

    async function loadOverviewWorkspaceData({ signal } = {}) {
        const shell = roleShell();
        const date = todayYmd();
        const includeClubAdminFinance = shell === "club_admin";
        const [dashboard, alerts, communications, financeBase, staffContext, operationalTargets] = await Promise.all([
            loadSharedDashboardPayload({ signal, view: shell === "staff" ? "today" : "overview" }),
            loadOperationalAlertsShared({ signal }),
            loadCommunicationsPreviewShared({ signal, publishedOnly: shell === "staff" }),
            includeClubAdminFinance ? loadSharedFinanceBase({ signal }) : Promise.resolve(emptyFinanceBasePayload(date)),
            shell === "staff" ? loadStaffRoleContextShared({ signal }) : Promise.resolve(null),
            includeClubAdminFinance ? loadSharedOperationalTargets({ signal, year: new Date().getFullYear() }) : Promise.resolve(null),
        ]);
        return {
            dashboard,
            alerts,
            closeStatus: financeBase.closeStatus,
            summary: financeBase.summary,
            settings: financeBase.settings,
            communications,
            staffContext,
            operationalTargets,
            date,
        };
    }

    async function loadOperationsWorkspaceData({ panel = "overview", signal } = {}) {
        const shell = roleShell();
        const date = todayYmd();
        const safePanel = String(panel || "overview").trim().toLowerCase() || "overview";
        const needsAlerts = ["overview", "pro_shop", "pub"].includes(safePanel);
        const needsFinanceBase = shell === "club_admin" && ["overview", "pro_shop", "pub"].includes(safePanel);
        const needsOperationalTargets = shell === "club_admin" && ["tennis", "padel", "bowls"].includes(safePanel);
        const [dashboard, alerts, financeBase, operationalTargets] = await Promise.all([
            loadSharedDashboardPayload({ signal, view: safePanel === "overview" ? "operations_overview" : "operations_module" }),
            needsAlerts ? loadOperationalAlertsShared({ signal }) : Promise.resolve(emptyAlertsPayload()),
            needsFinanceBase ? loadSharedFinanceBase({ signal }) : Promise.resolve(emptyFinanceBasePayload(date)),
            needsOperationalTargets ? loadSharedOperationalTargets({ signal, year: new Date().getFullYear() }) : Promise.resolve(null),
        ]);
        return {
            panel: safePanel,
            dashboard,
            alerts,
            closeStatus: financeBase.closeStatus,
            summary: financeBase.summary,
            settings: financeBase.settings,
            operationalTargets,
            date,
        };
    }

    async function dashboardBundle(options = {}) {
        return loadOverviewWorkspaceData({ signal: options.signal });
    }

    function renderDashboardWorkspace(bundle, options = {}) {
        const shell = roleShell();
        const dashboard = bundle.dashboard || {};
        const alerts = bundle.alerts || {};
        const communications = bundle.communications || {};
        const communicationRows = Array.isArray(communications.communications) ? communications.communications : [];
        const roleContext = bundle.staffContext || {};
        const { stream: selectedStream, insight } = selectedOverviewInsight(dashboard, options);
        const streamLabel = selectedStream === "pro_shop" ? "Pro Shop" : selectedStream === "golf" ? "Golf" : "Club";

        return `
            ${renderPageHero({
                title: options.mode === "today" ? "Today's operating board" : "Club Overview",
                copy: options.mode === "today"
                    ? (roleContext.role_label ? `${roleContext.role_label}. Start with alerts, member demand, and the live golf day.` : "Start with alerts, member demand, and the live golf day.")
                    : "Start the club day here: blockers, revenue, current notices, and close state in one operating view.",
                extraClass: "overview-hero",
                meta: renderInsightMeta("Target pace and risk guidance live"),
            })}
            ${renderOverviewStreamCard(dashboard, options)}
            ${renderDashboardStatCards(bundle)}
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Revenue trend</h4>
                            <p>Paid golf plus imported non-booking revenue, using the existing club dashboard payload.</p>
                        </div>
                    </div>
                    ${renderRevenueTrendChart(dashboard)}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>${escapeHtml(streamLabel)} performance board</h4>
                            <p>${escapeHtml(insight.note || "See the current commercial and operational state for this stream.")}</p>
                        </div>
                    </div>
                    ${metricCards((insight.cards || []).map(row => ({
                        label: row.label,
                        value: formatMaybe(row.value, row.format),
                        meta: selectedStream === "all" ? "Current club signal" : `${streamLabel} current signal`,
                    })))}
                    ${shell === "club_admin" ? renderOperationalTargetFocus(bundle, { stream: selectedStream }) : ""}
                    ${renderOperationalHighlights(insight.highlights)}
                </article>
            </section>
            <section class="dashboard-grid">
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Operational alerts</h4>
                            <p>Current blockers stay visible on the landing board.</p>
                        </div>
                    </div>
                    ${renderAlerts(alerts.alerts)}
                    ${renderGuidanceStack([
                        { title: "Target pace", detail: aiTargetSummary(bundle) },
                        ...noShowGuidanceRows(bundle, { limit: 1 }),
                        ...revenueIntegrityGuidanceRows(bundle, { limit: 1 }),
                    ])}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>${selectedStream === "all" ? (shell === "club_admin" ? "Revenue streams" : "Operational mix") : `${streamLabel} booking status revenue`}</h4>
                            <p>${selectedStream === "all" ? (shell === "club_admin" ? "Golf, pro shop, and imported operational revenue in one commercial view." : "Golf and enabled operational signal in one board.") : `See where booked, checked-in, completed, and cancelled value is sitting for ${streamLabel.toLowerCase()}.`}</p>
                        </div>
                    </div>
                    ${selectedStream === "all" ? renderRevenueStreamRows(dashboard) : renderStatusBreakdown(dashboard)}
                </article>
            </section>
            <section class="dashboard-grid">
                ${renderHandoverReadinessCard(bundle)}
                ${renderProShopCashupCard(bundle)}
            </section>
            ${shell === "club_admin" ? `
                <section class="dashboard-grid">
                    ${renderOperationsCadenceCard(bundle, { context: options.mode === "today" ? "today" : "club" })}
                    ${renderAccountingHandoffCard(bundle)}
                </section>
            ` : ""}
            <section class="dashboard-grid">
                ${renderClubManagerBriefCard(bundle)}
                <article class="dashboard-card">
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
                </article>
            </section>
            <section class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Golf day pipeline</h4>
                        <p>Commercial golf-day work remains part of the club overview, not hidden behind the tee sheet.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Pipeline Value", value: formatCurrency(dashboard.golf_day_pipeline_total || 0), meta: "Open and active golf-day booking pipeline" },
                    { label: "Outstanding", value: formatCurrency(dashboard.golf_day_outstanding_balance || 0), meta: "Balance still due" },
                    { label: "Open Golf Days", value: formatInteger(dashboard.golf_day_open_count || 0), meta: "Pending or partial events" },
                    { label: "Total Club Revenue", value: formatCurrency(dashboard.total_revenue || 0), meta: "Combined current club revenue" },
                ])}
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

    async function golfBundle(options = {}) {
        const route = options.route || state.route;
        const signal = options.signal;
        const date = clampYmd(route?.date);
        const panel = route?.panel || (tabsForWorkspace("golf")[0]?.id || "tee-sheet");
        if (panel === "overview") {
            const [shared, teeRows] = await Promise.all([
                loadSharedDashboardData({ signal, dashboardView: "golf_overview" }),
                loadGolfTeeRows(date, { signal }),
            ]);
            return {
                panel,
                ...shared,
                teeRows,
                date,
            };
        }
        if (panel === "bookings") {
            const query = new URLSearchParams({
                period: "day",
                anchor_date: date,
                date_basis: "tee_time",
                sort: "tee_asc",
                limit: "100",
            });
            const bookings = await fetchJson(`/api/admin/bookings?${query.toString()}`, { signal });
            return {
                panel,
                bookings,
                bookingsUi: {
                    ...defaultGolfBookingsUi(state.workspaceData?.bookingsUi),
                    selectedIds: [],
                },
                date,
            };
        }
        if (panel === "golf-days") {
            const [sharedDashboard, bookings, accountCustomers] = await Promise.all([
                loadSharedDashboardData({ signal, dashboardView: "golf_days" }),
                loadSharedGolfDayBookings({ signal }),
                fetchJson("/api/admin/account-customers?active_only=true&sort=name_asc", { signal }),
            ]);
            return { panel, ...sharedDashboard, golfDays: bookings, accountCustomers, date };
        }
        const teeRows = await loadGolfTeeRows(date, { signal, ensureMaterialized: true });
        return {
            panel,
            teeRows,
            date,
        };
    }

    function renderBookingRows(rows) {
        return rows.map(slot => `
            <article class="slot-card">
                <div class="slot-head">
                    <div>
                        <div class="slot-time">${escapeHtml(formatTime(slot.tee_time))}</div>
                        <div class="slot-meta">Tee ${escapeHtml(slot.hole || "1")} ? ${escapeHtml(formatInteger(slot.occupied))}/${escapeHtml(formatInteger(slot.capacity))} occupied</div>
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
                                ].filter(Boolean).join(" ? "))}
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

    function setupNativeTeeSheetInteractions() {
        const root = els.root.querySelector("[data-native-tee-sheet]");
        const dateInput = els.root.querySelector("[data-tee-sheet-date]");
        if (dateInput instanceof HTMLInputElement) {
            dateInput.addEventListener("change", () => {
                const nextDate = clampYmd(dateInput.value);
                if (nextDate !== state.route.date) {
                    navigate({ date: nextDate });
                }
            });
        }
        if (!(root instanceof HTMLElement)) return;
        scrollNativeTeeSheetToNextRelevantStart(root);

        let activeDrag = null;
        const clearDropHover = () => {
            root.querySelectorAll(".tee-sheet-slot-card.drop-hover").forEach(el => el.classList.remove("drop-hover"));
        };

        root.addEventListener("dragstart", event => {
            const card = event.target instanceof HTMLElement ? event.target.closest(".tee-sheet-slot-card[data-booking-id]") : null;
            if (!(card instanceof HTMLElement)) return;
            const bookingId = positiveInt(card.getAttribute("data-booking-id"));
            const teeTimeId = positiveInt(card.getAttribute("data-tee-time-id"));
            if (!bookingId || !teeTimeId) return;
            activeDrag = { bookingId, fromTeeTimeId: teeTimeId };
            try {
                event.dataTransfer?.setData("text/plain", `booking:${bookingId}`);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            } catch {}
            card.classList.add("dragging");
            document.body.classList.add("drag-active");
        });

        root.addEventListener("dragend", event => {
            const card = event.target instanceof HTMLElement ? event.target.closest(".tee-sheet-slot-card[data-booking-id]") : null;
            if (card instanceof HTMLElement) card.classList.remove("dragging");
            clearDropHover();
            document.body.classList.remove("drag-active");
            activeDrag = null;
        });

        root.addEventListener("dragover", event => {
            const drop = event.target instanceof HTMLElement ? event.target.closest(".tee-sheet-slot-card.open[data-tee-time-id]") : null;
            if (!(drop instanceof HTMLElement)) return;
            if (!activeDrag) return;
            event.preventDefault();
            try {
                if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            } catch {}
            clearDropHover();
            drop.classList.add("drop-hover");
        });

        root.addEventListener("dragleave", event => {
            const drop = event.target instanceof HTMLElement ? event.target.closest(".tee-sheet-slot-card.open[data-tee-time-id]") : null;
            if (!(drop instanceof HTMLElement)) return;
            drop.classList.remove("drop-hover");
        });

        root.addEventListener("drop", async event => {
            const drop = event.target instanceof HTMLElement ? event.target.closest(".tee-sheet-slot-card.open[data-tee-time-id]") : null;
            if (!(drop instanceof HTMLElement) || !activeDrag) return;
            event.preventDefault();
            event.stopPropagation();
            clearDropHover();
            const toTeeTimeId = positiveInt(drop.getAttribute("data-tee-time-id"));
            if (!toTeeTimeId || toTeeTimeId === activeDrag.fromTeeTimeId) return;
            drop.classList.add("pending");
            try {
                await moveBookingToTeeTime(activeDrag.bookingId, toTeeTimeId);
                showToast("Booking moved.", "ok");
            } catch (error) {
                showToast(error?.message || "Unable to move booking.", "bad");
            } finally {
                drop.classList.remove("pending");
                document.body.classList.remove("drag-active");
                activeDrag = null;
            }
        });
    }

    function scrollNativeTeeSheetToNextRelevantStart(root) {
        if (!(root instanceof HTMLElement)) return;
        const rows = Array.from(root.querySelectorAll("tbody tr[data-tee-time-iso]"));
        if (!rows.length) return;
        const selectedDate = clampYmd(state.route?.date);
        const isToday = selectedDate === todayYmd();
        const now = Date.now();
        let target = null;

        for (const row of rows) {
            const stamp = toDate(row.getAttribute("data-tee-time-iso") || "");
            if (!stamp) continue;
            const hasOpenStart = row.querySelector(".tee-sheet-slot-card.open[data-tee-time-id]") instanceof HTMLElement;
            if (!hasOpenStart) continue;
            if (!isToday || stamp.getTime() >= now) {
                target = row;
                break;
            }
        }

        if (!(target instanceof HTMLElement)) {
            target = rows.find(row => row.querySelector(".tee-sheet-slot-card.open[data-tee-time-id]") instanceof HTMLElement) || rows[0];
        }
        if (!(target instanceof HTMLElement)) return;

        const top = Math.max(0, target.offsetTop - 28);
        root.scrollTo({ top, behavior: "auto" });
    }

    function teePriorityRows(rows) {
        return [...(Array.isArray(rows) ? rows : [])]
            .sort((left, right) => String(left.tee_time || "").localeCompare(String(right.tee_time || "")))
            .filter(row => Number(row.occupied || 0) > 0 || String(row.status || "") === "blocked");
    }

    function renderGolfPriorityBoard(rows) {
        const priorities = teePriorityRows(rows).slice(0, 5);
        if (!priorities.length) {
            return `<div class="empty-state">No tee-sheet pressure points are flagged for this day yet.</div>`;
        }
        return `
            <div class="tee-priority-list">
                ${priorities.map(row => {
                    const leadBooking = Array.isArray(row.bookings) ? row.bookings[0] : null;
                    const tone = String(row.status || "") === "blocked"
                        ? "bad"
                        : Number(row.available || 0) === 0
                            ? "warn"
                            : "ok";
                    const stateText = String(row.status || "") === "blocked"
                        ? "Blocked start"
                        : Number(row.available || 0) === 0
                            ? "At capacity"
                            : `${formatInteger(row.available || 0)} place${Number(row.available || 0) === 1 ? "" : "s"} open`;
                    return `
                        <article class="tee-priority-row">
                            <div class="tee-priority-time">
                                <strong>${escapeHtml(formatTime(row.tee_time))}</strong>
                                <span>Tee ${escapeHtml(row.hole || "1")}</span>
                            </div>
                            <div class="tee-priority-copy">
                                <div class="tee-priority-top">
                                    <span class="tee-priority-title">${escapeHtml(leadBooking?.player_name || (String(row.status || "") === "blocked" ? "Blocked tee time" : "Live tee slot"))}</span>
                                    ${renderStatusPill("", row.status || "open")}
                                </div>
                                <div class="tee-priority-meta">${escapeHtml([
                                    `${formatInteger(row.occupied || 0)}/${formatInteger(row.capacity || 4)} occupied`,
                                    stateText,
                                    leadBooking?.status ? `Lead ${String(leadBooking.status).replaceAll("_", " ")}` : "",
                                ].filter(Boolean).join(" ? "))}</div>
                            </div>
                            <div class="tee-priority-signal">
                                <span class="metric-pill ${tone}">${escapeHtml(stateText)}</span>
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        `;
    }

    function renderGolfCommandStrip(bundle, rows) {
        const ordered = [...(Array.isArray(rows) ? rows : [])]
            .sort((left, right) => String(left.tee_time || "").localeCompare(String(right.tee_time || "")));
        const activeRows = ordered.filter(row => String(row.status || "") !== "blocked");
        const nextLoadedRow = activeRows.find(row => Number(row.occupied || 0) > 0) || null;
        const soldOut = activeRows.filter(row => Number(row.available || 0) <= 0 && Number(row.occupied || 0) > 0).length;
        const openPlaces = activeRows.reduce((sum, row) => sum + Math.max(0, Number(row.available || 0)), 0);
        const closeState = closeStatusMeta(bundle);
        const financeSummary = closeStatusFinanceSummary(bundle);
        const pendingExportRows = Number(financeSummary.pending_export_rows || 0);
        const blockedRows = Number(financeSummary.blocked_rows || 0);
        const closeDiagnostics = pendingExportRows > 0 || blockedRows > 0
            ? `${closeState.detail} | ${formatInteger(pendingExportRows)} pending, ${formatInteger(blockedRows)} blocked`
            : closeState.detail;
        const leadBooking = nextLoadedRow?.bookings?.[0] || null;
        return `
            <div class="golf-command-strip">
                <div class="golf-command-metrics">
                    ${metricCards([
                        {
                            label: "Next live tee time",
                            value: nextLoadedRow ? formatTime(nextLoadedRow.tee_time) : "No live load",
                            meta: nextLoadedRow ? `${formatInteger(nextLoadedRow.occupied || 0)}/${formatInteger(nextLoadedRow.capacity || 4)} occupied${leadBooking?.player_name ? ` ? ${leadBooking.player_name}` : ""}` : "No loaded starts on this day yet",
                        },
                        {
                            label: "Sold-out starts",
                            value: formatInteger(soldOut),
                            meta: "Tee starts already at capacity",
                        },
                        {
                            label: "Open player places",
                            value: formatInteger(openPlaces),
                            meta: "Immediate sellable golf capacity",
                        },
                        {
                            label: "Day close posture",
                            value: closeState.label,
                            meta: closeDiagnostics,
                        },
                    ])}
                </div>
                <div class="golf-command-actions">
                    <button type="button" class="button secondary" data-date-shift="-1">Previous day</button>
                    <span class="metric-pill">${escapeHtml(formatDate(bundle.date))}</span>
                    <button type="button" class="button secondary" data-date-shift="1">Next day</button>
                </div>
            </div>
        `;
    }

    function defaultGolfBookingsUi(raw = {}) {
        const status = String(raw.status || "all").trim().toLowerCase();
        const integrity = String(raw.integrity || "all").trim().toLowerCase();
        const selectedIds = Array.isArray(raw.selectedIds)
            ? raw.selectedIds.map(value => positiveInt(value)).filter(Boolean)
            : [];
        return {
            q: String(raw.q || "").trim(),
            status: ["all", "booked", "checked_in", "completed", "cancelled", "no_show"].includes(status) ? status : "all",
            integrity: ["all", "missing_paid_ledger"].includes(integrity) ? integrity : "all",
            selectedIds: Array.from(new Set(selectedIds)),
        };
    }

    function golfBookingsPaymentState(row) {
        if (row?.finance_state?.payment_status_label) return String(row.finance_state.payment_status_label);
        if (row?.finance_state?.is_paid) return "Paid";
        if (Boolean(row.prepaid)) return "Prepaid";
        return "Pay on day";
    }

    function golfBookingsPaymentMeta(row) {
        const financeState = row?.finance_state || {};
        const parts = [];
        if (financeState.export_status_label) {
            parts.push(String(financeState.export_status_label));
        }
        if (financeState.payment_method) {
            parts.push(String(financeState.payment_method));
        }
        parts.push(`${formatInteger(row.ledger_entry_count || 0)} ledger row(s)`);
        return parts.filter(Boolean).join(" · ");
    }

    function bookingMatchesQuery(row, query) {
        const needle = String(query || "").trim().toLowerCase();
        if (!needle) return true;
        return [
            row.id,
            row.player_name,
            row.player_email,
            row.club_card,
            row.player_type,
        ].some(value => String(value || "").toLowerCase().includes(needle));
    }

    function filterGolfBookings(rows, ui) {
        const filters = defaultGolfBookingsUi(ui);
        return (Array.isArray(rows) ? rows : []).filter(row => {
            const status = String(row.status || "").trim().toLowerCase();
            const paidWithoutLedger = Boolean(row?.finance_state?.paid_status_without_ledger);
            if (filters.status !== "all" && status !== filters.status) return false;
            if (filters.integrity === "missing_paid_ledger" && !paidWithoutLedger) return false;
            if (!bookingMatchesQuery(row, filters.q)) return false;
            return true;
        });
    }

    function visibleGolfBookingRows(bundle) {
        const rows = Array.isArray(bundle?.bookings?.bookings) ? bundle.bookings.bookings : [];
        return filterGolfBookings(rows, bundle?.bookingsUi);
    }

    function renderGolfBookingsBulkBar(bundle) {
        const ui = defaultGolfBookingsUi(bundle.bookingsUi);
        const rows = visibleGolfBookingRows(bundle);
        const selectedIds = new Set(ui.selectedIds.map(value => Number(value)));
        const selectedCount = rows.filter(row => selectedIds.has(Number(row.id))).length;
        return `
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Bulk actions</h4>
                        <p>Select visible bookings, then apply safe first-pass updates without leaving Golf.</p>
                    </div>
                    <span class="metric-pill">${escapeHtml(formatInteger(selectedCount))} selected</span>
                </div>
                <div class="button-row">
                    <button type="button" class="button secondary" data-booking-select-visible="1">Select visible</button>
                    <button type="button" class="button ghost" data-booking-select-clear="1">Clear selection</button>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <label>Bulk status</label>
                        <select id="golf-bookings-bulk-status">
                            <option value="">Choose status</option>
                            <option value="checked_in">Check in</option>
                            <option value="completed">Complete</option>
                            <option value="no_show">No-show</option>
                            <option value="cancelled">Cancel</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Apply</label>
                        <div class="button-row">
                            <button type="button" class="button" data-booking-bulk-status="1">Apply status</button>
                            <button type="button" class="button ghost" data-booking-bulk-payment="1">Set payment</button>
                            <button type="button" class="button ghost" data-booking-bulk-account="1">Set account</button>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    function renderGolfBookingsTable(rows, ui) {
        const selectedIds = new Set(defaultGolfBookingsUi(ui).selectedIds.map(value => Number(value)));
        return renderTable(
            ["Select", "Tee Time", "Player", "Status", "Type", "Price", "Payment", "Account", "Actions"],
            rows.length ? rows.map(row => {
                const status = String(row.status || "").trim().toLowerCase();
                const canSetPayment = ["checked_in", "completed"].includes(status) || Number(row.ledger_entry_count || 0) > 0;
                return `
                    <tr>
                        <td><input type="checkbox" data-booking-select="${escapeHtml(String(row.id))}" ${selectedIds.has(Number(row.id)) ? "checked" : ""}></td>
                        <td>
                            <strong>${escapeHtml(formatTime(row.tee_time || ""))}</strong>
                            <div class="table-meta">${escapeHtml(formatDate(row.tee_time || ""))}</div>
                        </td>
                        <td>
                            <strong>${escapeHtml(row.player_name || "Booking")}</strong>
                            <div class="table-meta">${escapeHtml(row.player_email || row.id || "")}</div>
                        </td>
                        <td>${renderStatusPill("", row.status || "booked")}</td>
                        <td>${escapeHtml(String(row.player_type || "-").replaceAll("_", " "))}</td>
                        <td>${escapeHtml(formatCurrency(row.price || 0))}</td>
                        <td>
                            <span class="metric-pill">${escapeHtml(golfBookingsPaymentState(row))}</span>
                            <div class="table-meta">${escapeHtml(golfBookingsPaymentMeta(row))}</div>
                        </td>
                        <td>
                            <span class="metric-pill">${escapeHtml(row.club_card || "No code")}</span>
                        </td>
                        <td>
                            <div class="inline-actions">
                                ${status === "booked" ? `<button type="button" class="button secondary" data-booking-status="${escapeHtml(String(row.id))}" data-status-value="checked_in">Check in</button>` : ""}
                                ${status === "checked_in" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(String(row.id))}" data-status-value="completed">Complete</button>` : ""}
                                ${status === "booked" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(String(row.id))}" data-status-value="no_show">No-show</button>` : ""}
                                ${status === "booked" || status === "checked_in" ? `<button type="button" class="button ghost" data-booking-status="${escapeHtml(String(row.id))}" data-status-value="cancelled">Cancel</button>` : ""}
                                ${canSetPayment ? `<button type="button" class="button ghost" data-booking-payment="${escapeHtml(String(row.id))}">Set payment</button>` : ""}
                                <button type="button" class="button ghost" data-booking-account="${escapeHtml(String(row.id))}">Set account</button>
                            </div>
                        </td>
                    </tr>
                `;
            }) : [`<tr><td colspan="9"><div class="empty-state">No bookings match the current golf-day filters.</div></td></tr>`]
        );
    }

    function renderGolfBookingsPanel(bundle) {
        const payload = bundle.bookings || {};
        const rows = Array.isArray(payload.bookings) ? payload.bookings : [];
        const ui = defaultGolfBookingsUi(bundle.bookingsUi);
        const filtered = filterGolfBookings(rows, ui);
        const ledgerBackedBookings = rows.filter(row => Boolean(row?.finance_state?.is_paid));
        const missingPaidLedger = rows.filter(row => Boolean(row?.finance_state?.paid_status_without_ledger));
        const arrivingWork = rows.filter(row => ["booked", "checked_in"].includes(String(row.status || "").trim().toLowerCase()));
        return `
            ${renderPageHero({
                title: "Bookings",
                copy: "Use bookings for search, status cleanup, payment method, and account coding without disturbing the live tee grid.",
                workspace: "golf",
                subnavLabel: "Golf pages",
                extraClass: "golf-hero-card",
                metrics: [
                    { label: "Loaded Bookings", value: formatInteger(rows.length), meta: `Selected golf date ${escapeHtml(formatDate(bundle.date))}` },
                    { label: "Booked / Arriving", value: formatInteger(arrivingWork.length), meta: "Booked or checked-in work still active" },
                    { label: "Ledger-backed Bookings", value: formatInteger(ledgerBackedBookings.length), meta: "Bookings considered paid by ledger truth" },
                    { label: "Paid Status Missing Ledger", value: formatInteger(missingPaidLedger.length), meta: "Checked-in or completed bookings still missing a ledger row" },
                ],
            })}
            <form class="form-card" id="golf-bookings-filter-form">
                <div class="panel-head">
                    <div>
                        <h4>Booking filters</h4>
                        <p>Keep this first pass practical: search, status, and revenue-integrity exceptions for the selected golf date.</p>
                    </div>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <label>Search</label>
                        <input name="q" value="${escapeHtml(ui.q)}" placeholder="Player, email, account code, or booking id">
                    </div>
                    <div class="field">
                        <label>Status</label>
                        <select name="status">
                            <option value="all" ${ui.status === "all" ? "selected" : ""}>All statuses</option>
                            <option value="booked" ${ui.status === "booked" ? "selected" : ""}>Booked</option>
                            <option value="checked_in" ${ui.status === "checked_in" ? "selected" : ""}>Checked in</option>
                            <option value="completed" ${ui.status === "completed" ? "selected" : ""}>Completed</option>
                            <option value="cancelled" ${ui.status === "cancelled" ? "selected" : ""}>Cancelled</option>
                            <option value="no_show" ${ui.status === "no_show" ? "selected" : ""}>No-show</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Integrity</label>
                        <select name="integrity">
                            <option value="all" ${ui.integrity === "all" ? "selected" : ""}>All bookings</option>
                            <option value="missing_paid_ledger" ${ui.integrity === "missing_paid_ledger" ? "selected" : ""}>Missing paid ledger</option>
                        </select>
                    </div>
                </div>
                <div class="button-row">
                    <button type="submit" class="button" value="apply">Apply filters</button>
                    <button type="submit" class="button secondary" name="action" value="reset">Reset</button>
                </div>
            </form>
            ${renderGolfBookingsBulkBar({ ...bundle, bookingsUi: ui })}
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Bookings for ${escapeHtml(formatDate(bundle.date))}</h4>
                        <p>${escapeHtml(formatInteger(filtered.length))} booking(s) visible after client-side filtering.</p>
                    </div>
                </div>
                ${renderGolfBookingsTable(filtered, ui)}
            </section>
        `;
    }

    function renderGolfWorkspace(bundle) {
        const shell = roleShell();
        const panel = bundle.panel || (tabsForWorkspace("golf")[0]?.id || "tee-sheet");
        if (panel === "overview") {
            const rows = Array.isArray(bundle.teeRows) ? bundle.teeRows : [];
            const occupied = rows.reduce((sum, row) => sum + Number(row.occupied || 0), 0);
            const capacity = rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0);
            const bookedSlots = rows.filter(row => Number(row.occupied || 0) > 0).length;
            const blockedSlots = rows.filter(row => String(row.status || "") === "blocked").length;
            const golfInsight = bundle.dashboard?.operation_insights?.golf || {};
            const golfPipeline = {
                total: bundle.dashboard?.golf_day_pipeline_total || 0,
                outstanding: bundle.dashboard?.golf_day_outstanding_balance || 0,
                open: bundle.dashboard?.golf_day_open_count || 0,
                revenue: bundle.dashboard?.golf_revenue_today || 0,
            };

            return `
                ${renderPageHero({
                    title: "Golf Dashboard",
                    copy: "Read golf load, current capacity pressure, and golf-day commercial state before moving into live work.",
                    workspace: "golf",
                    subnavLabel: "Golf pages",
                    extraClass: "golf-hero-card",
                    meta: renderInsightMeta("No-show and finance guidance live"),
                    metrics: [
                        { label: "Slots", value: formatInteger(rows.length), meta: "Rendered for the selected day" },
                        { label: "Booked Slots", value: formatInteger(bookedSlots), meta: "Slots carrying at least one booking" },
                        { label: "Occupancy", value: capacity ? formatPercent(occupied / capacity) : "0%", meta: `${formatInteger(occupied)}/${formatInteger(capacity)} player places used` },
                        { label: "Blocked Slots", value: formatInteger(blockedSlots), meta: "Blocked by closure or golf-day rules" },
                    ],
                    body: renderGolfCommandStrip(bundle, rows),
                })}
                <section class="dashboard-grid">
                    <article class="dashboard-card">
                        <div class="panel-head">
                            <div>
                                <h4>Tee-day priorities</h4>
                                <p>The first read should show where the sheet is loaded, sold out, or blocked so the golf desk knows what matters next.</p>
                            </div>
                        </div>
                        ${renderGolfPriorityBoard(rows)}
                    </article>
                    <article class="dashboard-card">
                        <div class="panel-head">
                            <div>
                                <h4>Golf dashboard</h4>
                                <p>${escapeHtml(golfInsight.note || "Golf should show live operational signal alongside the day sheet.")}</p>
                            </div>
                        </div>
                    ${metricCards((golfInsight.cards || []).map(row => ({
                        label: row.label,
                        value: formatMaybe(row.value, row.format),
                        meta: "Current golf signal",
                    })))}
                    ${renderOperationalHighlights(golfInsight.highlights)}
                    ${renderGuidanceStack(noShowGuidanceRows(bundle, { limit: 2 }))}
                </article>
                <article class="dashboard-card">
                    <div class="panel-head">
                        <div>
                            <h4>Golf-day pipeline</h4>
                                <p>Golf-day commercial context stays inside golf operations, not in a detached report view.</p>
                            </div>
                        </div>
                        ${metricCards([
                            { label: "Pipeline Value", value: formatCurrency(golfPipeline.total), meta: "Open golf-day pipeline" },
                            { label: "Outstanding", value: formatCurrency(golfPipeline.outstanding), meta: "Balance still due" },
                            { label: "Open Events", value: formatInteger(golfPipeline.open), meta: "Pending or partial events" },
                            { label: "Golf Revenue Today", value: formatCurrency(golfPipeline.revenue), meta: "Current golf revenue snapshot" },
                        ])}
                    </article>
                </section>
                <section class="dashboard-grid">
                    ${renderHandoverReadinessCard(bundle)}
                    <article class="dashboard-card">
                        <div class="panel-head">
                            <div>
                                <h4>Golf and finance</h4>
                                <p>Keep golf activity, paid status, and day-end finance readiness connected.</p>
                            </div>
                        </div>
                        ${metricCards([
                            { label: "Golf Revenue Today", value: formatCurrency(bundle.dashboard?.golf_revenue_today || 0), meta: "Current golf cash-basis revenue" },
                            { label: "Completed Rounds", value: formatInteger(bundle.dashboard?.completed_rounds || 0), meta: "Rounds completed in current dashboard window" },
                            { label: "Today Bookings", value: formatInteger(bundle.dashboard?.today_bookings || 0), meta: "Current golf booking load" },
                            { label: "Revenue Integrity", value: escapeHtml(String(bundle.dashboard?.ai_assistant?.revenue_integrity?.status || "healthy").replaceAll("_", " ")), meta: `Score ${formatInteger(bundle.dashboard?.ai_assistant?.revenue_integrity?.health_score || 0)}` },
                        ])}
                        ${renderGuidanceStack(revenueIntegrityGuidanceRows(bundle, { limit: 2 }))}
                    </article>
                </section>
                ${shell === "club_admin" ? `
                    <section class="dashboard-grid">
                        ${renderOperationsCadenceCard(bundle, { context: "golf" })}
                        ${renderAccountingHandoffCard(bundle)}
                    </section>
                ` : ""}
            `;
        }
        if (panel === "tee-sheet") {
            return renderGolfTeeSheetPanel(bundle);
        }
        if (panel === "bookings") {
            return renderGolfBookingsPanel(bundle);
        }
        if (panel === "golf-days") {
            return window.GreenLinkAdminGolfDayOps.renderPanel(bundle, golfDayOpsModuleDeps());
        }

        return `<section class="card"><div class="empty-state">This golf panel is not available in the current club context.</div></section>`;
    }

    async function operationsBundle(options = {}) {
        const signal = options.signal;
        const panel = state.route.panel || "overview";
        const shared = await loadOperationsWorkspaceData({ signal, panel });
        if (panel === "pro_shop") {
            const [products, sales] = await Promise.all([
                loadSharedProShopProducts({ signal }),
                loadSharedProShopSales({ signal }),
            ]);
            return { panel, ...shared, products, sales };
        }
        if (["tennis", "padel", "bowls"].includes(panel)) {
            const members = await loadSharedMembersAreaPreview({ area: panel, signal });
            return { panel, ...shared, members };
        }
        return { panel, ...shared };
    }

    function renderOperationsOverview(bundle) {
        const insightMap = bundle.dashboard?.operation_insights || {};
        const modules = visibleOperationModules();
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
                                meta: operationServiceCopy(key),
                            })))}
                        </article>
                    `;
                }).join("")}
            </section>
        `;
    }

    function operationServiceCopy(key) {
        const copyMap = {
            pro_shop: "Sales, stock, and close-readiness for the shop desk.",
            tennis: "Member demand and session activity for the tennis desk.",
            padel: "Padel demand and court-side service visibility.",
            bowls: "Bowls activity, member service, and club-day visibility.",
            pub: "Imported hospitality revenue with clear export and close-readiness.",
        };
        return copyMap[key] || "Operational summary for this module.";
    }

    function renderOperationsServiceBoard(bundle) {
        const modules = visibleOperationModules();
        const insightMap = bundle.dashboard?.operation_insights || {};
        return `
            <section class="dashboard-grid">
                ${modules.map(key => {
                    const insight = insightMap[key] || {};
                    const primaryCard = Array.isArray(insight.cards) ? insight.cards[0] : null;
                    return `
                        <article class="dashboard-card">
                            <div class="panel-head">
                                <div>
                                    <h4>${escapeHtml(MODULE_LABELS[key] || key)} summary</h4>
                                    <p>${escapeHtml(operationServiceCopy(key))}</p>
                                </div>
                            </div>
                            ${metricCards([
                                {
                                    label: primaryCard?.label || "Current activity",
                                    value: formatMaybe(primaryCard?.value || 0, primaryCard?.format),
                                    meta: primaryCard ? "Primary live measure from this module" : "Activity will appear as the club uses this module",
                                },
                                {
                                    label: "Why it matters",
                                    value: key === "pub" ? "Handover" : key === "pro_shop" ? "Sales + stock" : "Member service",
                                    meta: operationServiceCopy(key),
                                },
                            ])}
                            <div class="button-row">
                                <button type="button" class="button secondary" data-nav-panel="${escapeHtml(key)}">Open ${escapeHtml(MODULE_LABELS[key] || key)}</button>
                                <button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="cashbook">Export &amp; close</button>
                            </div>
                        </article>
                    `;
                }).join("")}
            </section>
        `;
    }

    function renderModuleServiceBrief(panel, bundle, members = []) {
        const insight = (bundle.dashboard?.operation_insights || {})[panel] || {};
        const activeMembers = Array.isArray(members) ? members.filter(row => String(row.membership_status || "").toLowerCase() === "active").length : 0;
        const highActivity = Array.isArray(members) ? members.filter(row => Number(row.bookings_count || 0) >= 2).length : 0;
        const pubRevenue = bundle.dashboard?.revenue_streams?.pub || {};
        const profile = activeClub()?.profile || {};
        const capacityMeta = moduleResourceMeta(panel, profile);
        const sports = sportsSetupConfig(profile);
        const trackingCard = operationalTrackingCard(panel, bundle);
        const summaryCards = panel === "pub"
            ? [
                { label: "Revenue Today", value: formatCurrency(pubRevenue.today_revenue || 0), meta: "Imported hospitality revenue for the day" },
                { label: "Week Revenue", value: formatCurrency(pubRevenue.week_revenue || 0), meta: "Current hospitality pace this week" },
                { label: "Transactions", value: formatInteger(pubRevenue.week_transactions || 0), meta: "Tracked hospitality transactions this week" },
                { label: "Export Path", value: "CSV handoff", meta: "Revenue still lands in the club's existing accounting flow" },
            ]
            : [
                { label: "Active Members", value: formatInteger(activeMembers), meta: `${escapeHtml(MODULE_LABELS[panel] || panel)}-relevant active members in current scope` },
                { label: "High Activity", value: formatInteger(highActivity), meta: "Members likely to need faster service or follow-up" },
                { label: panel === "tennis" || panel === "padel" ? "Courts" : panel === "bowls" ? "Rinks" : "Current Activity", value: panel === "tennis" ? formatInteger(sports.tennisCourtCount) : panel === "padel" ? formatInteger(sports.padelCourtCount) : panel === "bowls" ? formatInteger(sports.bowlsRinkCount) : formatMaybe((insight.cards || [])[0]?.value || 0, (insight.cards || [])[0]?.format), meta: capacityMeta || (insight.cards || [])[0]?.label || "Primary live module measure" },
                trackingCard,
            ];
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>${escapeHtml(MODULE_LABELS[panel] || panel)} summary</h4>
                        <p>${escapeHtml(capacityMeta || operationServiceCopy(panel))}</p>
                    </div>
                </div>
                ${metricCards(summaryCards)}
            </article>
        `;
    }

    function moduleHeroMetrics(panel, bundle, members = []) {
        if (panel === "pub") {
            const insight = (bundle.dashboard?.operation_insights || {})[panel] || {};
            return (insight.cards || []).map(row => ({
                label: row.label,
                value: formatMaybe(row.value, row.format),
                meta: "Current club signal",
            }));
        }
        const profile = activeClub()?.profile || {};
        const sports = sportsSetupConfig(profile);
        const activeMembers = Array.isArray(members) ? members.filter(row => String(row.membership_status || "").toLowerCase() === "active").length : 0;
        const highActivity = Array.isArray(members) ? members.filter(row => Number(row.bookings_count || 0) >= 2).length : 0;
        return [
            { label: "Active Members", value: formatInteger(activeMembers), meta: `${MODULE_LABELS[panel] || panel} members in current club scope` },
            { label: "High Activity", value: formatInteger(highActivity), meta: "Members likely to need follow-up or faster service" },
            {
                label: panel === "bowls" ? "Rinks" : "Courts",
                value: panel === "bowls" ? formatInteger(sports.bowlsRinkCount) : panel === "padel" ? formatInteger(sports.padelCourtCount) : formatInteger(sports.tennisCourtCount),
                meta: moduleResourceMeta(panel, profile) || "Configured physical capacity",
            },
            operationalTrackingCard(panel, bundle),
        ];
    }

    function renderOperationsWorkspace(bundle) {
        const shell = roleShell();
        const panel = bundle.panel || "overview";
        const insightMap = bundle.dashboard?.operation_insights || {};
        const alerts = bundle.alerts || {};
        if (panel === "overview") {
            const modules = visibleOperationModules();
            return `
                ${renderPageHero({
                    title: "Operations Board",
                    copy: "See the non-golf areas that need attention today without leaving the main operating shell.",
                    workspace: "operations",
                    subnavLabel: "Operations pages",
                    metrics: [
                        { label: "Enabled Modules", value: formatInteger(modules.length), meta: "Operational modules active for this club" },
                        { label: "Pro Shop Today", value: formatCurrency(bundle.dashboard?.pro_shop_revenue_today || 0), meta: "Native pro shop sales today" },
                        { label: "Other Revenue Today", value: formatCurrency(bundle.dashboard?.other_revenue_today || 0), meta: "Imported non-golf operational revenue" },
                        { label: "Week Transactions", value: formatInteger((bundle.dashboard?.revenue_streams?.pro_shop || {}).week_transactions || 0), meta: "Pro shop throughput this week" },
                    ],
                })}
                <section class="dashboard-grid">
                    ${renderProShopCashupCard(bundle)}
                    ${renderHandoverReadinessCard(bundle)}
                </section>
                ${shell === "club_admin" ? `
                    <section class="dashboard-grid">
                        ${renderOperationsCadenceCard(bundle, { context: "operations" })}
                        ${renderAccountingHandoffCard(bundle)}
                    </section>
                ` : ""}
                ${renderOperationsServiceBoard(bundle)}
                ${renderOperationsOverview(bundle)}
            `;
        }
        if (panel === "pro_shop") {

            return window.GreenLinkAdminProShop.renderPanel({ ...bundle, insightMap }, proShopModuleDeps());

        }

        if (["tennis", "padel", "bowls", "pub"].includes(panel)) {
            const insight = insightMap[panel] || {};
            const members = Array.isArray(bundle.members?.members) ? bundle.members.members : [];
            return `
                ${renderPageHero({
                    title: MODULE_LABELS[panel] || panel,
                    copy: insight.note || "Operational detail for the selected module.",
                    workspace: "operations",
                    subnavLabel: "Operations pages",
                    metrics: panel === "pub" ? (insight.cards || []).map(row => ({
                        label: row.label,
                        value: formatMaybe(row.value, row.format),
                        meta: "Current club signal",
                    })) : moduleHeroMetrics(panel, bundle, members),
                })}
                <section class="dashboard-grid">
                    ${renderModuleServiceBrief(panel, bundle, members)}
                    ${panel === "pub"
                        ? renderAccountingWorkflowCard({ ...bundle, importSettings: [] })
                        : renderWorkblock({
                            title: "Tracking and revenue",
                            copy: panel === "bowls"
                                ? "Use this page to watch member activity, imported bowls revenue, and annual targets in one place."
                                : "Use this page to watch member activity, configured capacity, and annual targets until direct booking and payment tracking is live.",
                            open: true,
                            body: renderOperationalTargetFocus(bundle, { stream: panel }) || `<div class="empty-state">No annual targets are configured for ${escapeHtml(MODULE_LABELS[panel] || panel)} yet.</div>`,
                        })}
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
                                <h4>${panel === "pub" ? "Imported revenue summary" : "Relevant members"}</h4>
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
                                        <div class="list-meta">${escapeHtml(`${row.primary_operation || ""} ? ${formatInteger(row.bookings_count || 0)} booking(s) ? ${formatCurrency(row.total_spent || 0)}`)}</div>
                                    </div>
                                `).join("") : `<div class="empty-state">No relevant member records found.</div>`}
                        </div>
                    </article>
                </section>
            `;
        }

        return `<section class="card"><div class="empty-state">This operation is not yet enabled for the current club.</div></section>`;
    }

    async function membersBundle(options = {}) {
        const signal = options.signal;
        const panel = state.route.panel || "members";
        const membersUi = defaultMembersUi(options.membersUi || state.workspaceData?.membersUi);
        if (panel === "staff" && roleShell() === "club_admin") {
            const [staff, membersPreview, accountCustomers] = await Promise.all([
                loadSharedStaffList({ signal }),
                loadSharedRecentMembersPreview({ signal }),
                loadSharedActiveAccountCustomers({ signal }),
            ]);
            const members = {
                ...membersPreview,
                members: Array.isArray(membersPreview?.members) ? membersPreview.members.slice(0, 6) : [],
            };
            return { panel, staff, members, accountCustomers, membersUi };
        }
        const useSharedRecentMembers = !membersUi.query && membersUi.status === "all";
        const membersQuery = new URLSearchParams({
            limit: membersUi.query ? "24" : "16",
            sort: membersUi.query ? "name_asc" : "recent_activity",
        });
        if (membersUi.query) membersQuery.set("q", membersUi.query);
        if (membersUi.status !== "all") membersQuery.set("membership_status", membersUi.status);
        const accountCustomerQuery = new URLSearchParams({
            active_only: "true",
            sort: "name_asc",
        });
        if (membersUi.query) accountCustomerQuery.set("q", membersUi.query);
        const [membersSource, accountCustomers] = await Promise.all([
            useSharedRecentMembers
                ? loadSharedRecentMembersPreview({ signal })
                : fetchJson(`/api/admin/members?${membersQuery.toString()}`, { signal }),
            membersUi.query
                ? fetchJson(`/api/admin/account-customers?${accountCustomerQuery.toString()}`, { signal })
                : loadSharedActiveAccountCustomers({ signal }),
        ]);
        const members = useSharedRecentMembers
            ? {
                ...membersSource,
                members: Array.isArray(membersSource?.members) ? membersSource.members.slice(0, 16) : [],
            }
            : membersSource;
        return { panel: "members", members, accountCustomers, membersUi };
    }

    function defaultMembersUi(source = null) {
        return window.GreenLinkAdminMembersPanel.defaultMembersUi(source);
    }

    function renderMembersSearchForm(bundle, options = {}) {
        return window.GreenLinkAdminMembersPanel.renderMembersSearchForm(bundle, membersPanelModuleDeps(), options);
    }

    function importActivityStamp(row) {
        if (!row || typeof row !== "object") return null;
        return row.imported_at || row.created_at || row.updated_at || row.completed_at || null;
    }

    function importActivityText(row) {
        if (!row || typeof row !== "object") return "";
        return [
            row.kind,
            row.source,
            row.file_name,
            row.notes,
            row.stream,
            row.stream_key,
        ].map(value => String(value || "").trim().toLowerCase()).filter(Boolean).join(" ");
    }

    function summarizeImportsHealth(importRows, settingsRows = []) {
        const rows = Array.isArray(importRows) ? importRows : [];
        const mappings = Array.isArray(settingsRows) ? settingsRows : [];
        const configuredStreams = mappings.filter(row => Boolean(row?.configured)).length;
        const totalStreams = mappings.length;
        const mappingGaps = Math.max(0, totalStreams - configuredStreams);
        const bookingRows = rows.filter(row => importActivityText(row).includes("booking"));
        const revenueRows = rows.filter(row => !importActivityText(row).includes("booking"));
        const latestStamp = items => items
            .map(importActivityStamp)
            .map(value => toDate(value))
            .filter(Boolean)
            .sort((left, right) => right.getTime() - left.getTime())[0] || null;
        const latestBooking = latestStamp(bookingRows);
        const latestRevenue = latestStamp(revenueRows);
        return {
            configured_streams: configuredStreams,
            total_streams: totalStreams,
            stale_streams: mappingGaps,
            booking_sync_at: latestBooking ? latestBooking.toISOString() : null,
            revenue_sync_at: latestRevenue ? latestRevenue.toISOString() : null,
        };
    }

    function renderImportsHealthCard(bundle) {
        const summary = bundle.importsHealth || summarizeImportsHealth(bundle.imports?.imports, bundle.importSettings);
        const recommendations = [];
        if (Number(summary.stale_streams || 0) > 0) {
            recommendations.push(`${formatInteger(summary.stale_streams || 0)} revenue stream mapping(s) still need configuration.`);
        }
        if (!summary.revenue_sync_at) {
            recommendations.push("No recent revenue import was found in the visible import history.");
        }
        if (!summary.booking_sync_at) {
            recommendations.push("No recent booking import was found in the visible import history.");
        }
        return `
            <section class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Import freshness</h4>
                        <p>Import trust should be readable here without forcing the whole finance dashboard to load first.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Configured Streams", value: formatInteger(summary.configured_streams || 0), meta: `${formatInteger(summary.total_streams || 0)} tracked streams` },
                    { label: "Mapping Gaps", value: formatInteger(summary.stale_streams || 0), meta: Number(summary.stale_streams || 0) > 0 ? "Streams still need setup" : "Mappings currently aligned" },
                    { label: "Revenue Sync", value: formatRelativeAge(summary.revenue_sync_at), meta: summary.revenue_sync_at ? formatDateTime(summary.revenue_sync_at) : "No recent revenue import" },
                    { label: "Booking Sync", value: formatRelativeAge(summary.booking_sync_at), meta: summary.booking_sync_at ? formatDateTime(summary.booking_sync_at) : "No recent booking import" },
                ])}
                ${renderGuidanceStack(importCopilotGuidanceRows(bundle, { limit: 2 }))}
                <div class="stack">
                    ${recommendations.length ? recommendations.map(item => `
                        <div class="list-row">
                            <div class="list-meta">${escapeHtml(item)}</div>
                        </div>
                    `).join("") : `<div class="empty-state">Import freshness and mappings look stable.</div>`}
                </div>
            </section>
        `;
    }

    function buildMemberServiceQueue(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map(row => {
                const status = String(row.membership_status || "").trim().toLowerCase();
                const bookings = Number(row.bookings_count || 0);
                const spend = Number(row.total_spent || 0);
                return {
                    ...row,
                    _priority: (
                        (["hold", "inactive", "defaulter", "resigned"].includes(status) ? 1000 : 0)
                        + (String(row.primary_operation || "").trim().toLowerCase() === "golf" ? 120 : 0)
                        + (bookings * 10)
                        + Math.min(Math.round(spend / 100), 120)
                    ),
                };
            })
            .sort((left, right) => Number(right._priority || 0) - Number(left._priority || 0))
            .slice(0, 6);
    }

    function memberServicePosture(row) {
        const status = String(row.membership_status || "").trim().toLowerCase();
        if (["hold", "inactive", "defaulter", "resigned"].includes(status)) {
            return "Membership state needs attention before service continues.";
        }
        if (Number(row.bookings_count || 0) >= 4) {
            return `${formatInteger(row.bookings_count || 0)} recent booking(s) in current club scope.`;
        }
        if (String(row.primary_operation || "").trim().toLowerCase() === "golf") {
            return "Likely to need tee-sheet, check-in, or golf-day attention.";
        }
        return "General member service context is stable.";
    }

    function renderMemberServiceQueue(rows) {
        const queue = buildMemberServiceQueue(rows);
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Priority service queue</h4>
                        <p>Front-desk and pro-shop staff should see who is likely to need attention before drilling into records.</p>
                    </div>
                </div>
                <div class="stack">
                    ${queue.length ? queue.map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${escapeHtml(row.name || "Member")}</span>
                                ${renderStatusPill("", row.membership_status || "active")}
                            </div>
                            <div class="list-meta">${escapeHtml([
                                row.member_number || row.email || "",
                                MODULE_LABELS[row.primary_operation] || row.primary_operation || "",
                                `${formatInteger(row.bookings_count || 0)} booking(s)`,
                                formatCurrency(row.total_spent || 0),
                            ].filter(Boolean).join(" ? "))}</div>
                            <div class="list-meta">${escapeHtml(memberServicePosture(row))}</div>
                        </div>
                    `).join("") : `<div class="empty-state">No member service queue is available yet.</div>`}
                </div>
            </article>
        `;
    }

    function renderDebtorWatchCard(accountCustomers) {
        return window.GreenLinkAdminAccountCustomers.renderDebtorWatchCard(accountCustomers, accountCustomersModuleDeps());
    }

    function renderServiceDeskBriefCard(memberRows, accountCustomers) {
        const members = Array.isArray(memberRows) ? memberRows : [];
        const debtors = Array.isArray(accountCustomers) ? accountCustomers : [];
        const flaggedMembers = members.filter(row => ["hold", "inactive", "defaulter", "resigned"].includes(String(row.membership_status || "").toLowerCase())).length;
        const golfFacing = members.filter(row => String(row.primary_operation || "").toLowerCase() === "golf").length;
        const highActivity = members.filter(row => Number(row.bookings_count || 0) >= 4).length;
        const configuredDebtors = debtors.filter(row => String(row.account_code || "").trim() && String(row.billing_contact || "").trim()).length;
        return `
            <article class="dashboard-card">
                <div class="panel-head">
                    <div>
                        <h4>Desk summary</h4>
                        <p>Front desk should see service pressure, golf demand, and debtor readiness together before moving into the live club day.</p>
                    </div>
                </div>
                ${metricCards([
                    { label: "Golf Members", value: formatInteger(golfFacing), meta: "Members likely to touch the tee sheet or golf-day flow" },
                    { label: "High Activity", value: formatInteger(highActivity), meta: "Members with heavy recent booking demand" },
                    { label: "Flagged Members", value: formatInteger(flaggedMembers), meta: "Statuses likely to need manual follow-up" },
                    { label: "Configured Debtors", value: formatInteger(configuredDebtors), meta: "Account customers ready for clean export" },
                ])}
                <div class="button-row">
                    <button type="button" class="button secondary" data-nav-workspace="golf" data-nav-panel="tee-sheet">Open tee sheet</button>
                    <button type="button" class="button ghost" data-nav-workspace="communications">Open communications</button>
                    ${roleShell() === "club_admin" ? `<button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>` : ""}
                </div>
            </article>
        `;
    }

    function renderMemberRowsTable(rows, options = {}) {
        return window.GreenLinkAdminMembersPanel.renderMemberRowsTable(rows, membersPanelModuleDeps(), options);
    }

    function renderAccountCustomerStack(rows, options = {}) {
        return window.GreenLinkAdminAccountCustomers.renderAccountCustomerStack(rows, accountCustomersModuleDeps(), options);
    }

    function renderMemberServiceQueueEmbedded(rows) {
        const queue = buildMemberServiceQueue(rows);
        return `
            <div class="stack">
                ${queue.length ? queue.map(row => `
                    <div class="list-row">
                        <div class="list-row-top">
                            <span class="list-title">${escapeHtml(row.name || "Member")}</span>
                            ${renderStatusPill("", row.membership_status || "active")}
                        </div>
                        <div class="list-meta">${escapeHtml([
                            row.member_number || row.email || "",
                            MODULE_LABELS[row.primary_operation] || row.primary_operation || "",
                            `${formatInteger(row.bookings_count || 0)} booking(s)`,
                            formatCurrency(row.total_spent || 0),
                        ].filter(Boolean).join(" Ãƒâ€š? "))}</div>
                        <div class="list-meta">${escapeHtml(memberServicePosture(row))}</div>
                    </div>
                `).join("") : `<div class="empty-state">No member service queue is available yet.</div>`}
            </div>
        `;
    }

    function renderDebtorWatchEmbedded(accountCustomers) {
        return window.GreenLinkAdminAccountCustomers.renderDebtorWatchEmbedded(accountCustomers, accountCustomersModuleDeps());
    }

    function renderServiceDeskBriefEmbedded(memberRows, accountCustomers) {
        const members = Array.isArray(memberRows) ? memberRows : [];
        const debtors = Array.isArray(accountCustomers) ? accountCustomers : [];
        const flaggedMembers = members.filter(row => ["hold", "inactive", "defaulter", "resigned"].includes(String(row.membership_status || "").toLowerCase())).length;
        const golfFacing = members.filter(row => String(row.primary_operation || "").toLowerCase() === "golf").length;
        const highActivity = members.filter(row => Number(row.bookings_count || 0) >= 4).length;
        const configuredDebtors = debtors.filter(row => String(row.account_code || "").trim() && String(row.billing_contact || "").trim()).length;
        return `
            ${metricCards([
                { label: "Golf Members", value: formatInteger(golfFacing), meta: "Members likely to touch the tee sheet or golf-day flow" },
                { label: "High Activity", value: formatInteger(highActivity), meta: "Members with heavy recent booking demand" },
                { label: "Flagged Members", value: formatInteger(flaggedMembers), meta: "Statuses likely to need manual follow-up" },
                { label: "Configured Debtors", value: formatInteger(configuredDebtors), meta: "Account customers ready for clean export" },
            ])}
            <div class="button-row">
                <button type="button" class="button secondary" data-nav-workspace="golf" data-nav-panel="tee-sheet">Open tee sheet</button>
                <button type="button" class="button ghost" data-nav-workspace="communications">Open communications</button>
                ${roleShell() === "club_admin" ? `<button type="button" class="button ghost" data-nav-workspace="reports" data-nav-panel="cashbook">Open cashbook & day close</button>` : ""}
            </div>
        `;
    }

    function renderMembersWorkspace(bundle) {
        const panel = bundle.panel || "members";
        if (panel === "staff" && roleShell() === "club_admin") {
            return window.GreenLinkAdminStaffPanel.renderPanel(bundle, staffPanelModuleDeps());
        }
        return window.GreenLinkAdminMembersPanel.renderLegacyPanel(bundle, membersPanelModuleDeps());
    }

    function renderStandardizedMembersWorkspace(bundle) {
        const panel = bundle.panel || "members";
        if (panel === "staff" && roleShell() === "club_admin") {
            return window.GreenLinkAdminStaffPanel.renderPanel(bundle, staffPanelModuleDeps());
        }
        return window.GreenLinkAdminMembersPanel.renderPanel(bundle, membersPanelModuleDeps());
    }

    function communicationModuleDeps() {
        return {
            MODULE_LABELS,
            closeStatusMeta,
            document: window.document,
            emptyFinanceBasePayload,
            escapeHtml,
            fetchJson,
            formatCurrency,
            formatDateTime,
            formatInteger,
            invalidateCommunicationsWorkspaceList,
            loadSharedRecentMembersPreview,
            loadSharedCommunicationsWorkspaceList,
            loadOperationalAlertsShared,
            loadSharedFinanceBase,
            metricCards,
            positiveInt,
            postJson,
            refreshActiveCommunicationsWorkspace,
            renderPageHero,
            renderStatusPill,
            roleShell,
            showToast,
            state,
            todayYmd,
            toDate,
            toDateTimeLocalValue,
        };
    }

    async function communicationsBundle(options = {}) {
        return window.GreenLinkAdminCommunications.bundle(options, communicationModuleDeps());
    }

    function renderImportsWorkspace(bundle) {

        return window.GreenLinkAdminImportsWorkspace.renderWorkspace(bundle, importsWorkspaceModuleDeps());

    }



    async function loadImportsWorkspaceBundle(options = {}) {
        const date = todayYmd();
        const clubKey = activeClubCacheKeyPart();
        return loadSharedResource(
            importsBundleCacheKey({ clubKey, date }),
            () => window.GreenLinkAdminImportsWorkspace.bundle(options, importsWorkspaceModuleDeps()),
            8000
        );

    }

    function financeReportingModuleDeps() {
        return {
            clampYmd,
            downloadWithAuth,
            escapeHtml,
            fetchJson,
            formatCurrency,
            formatDate,
            formatDateTime,
            formatInteger,
            formatTime,
            invalidateClubSummaryCaches,
            invalidateSummaryDrivenWorkspaceCaches,
            metricCards,
            postJson,
            refreshActiveReportsWorkspace,
            renderAccountingHandoffCard,
            renderAccountingWorkflowCard,
            renderGuidanceStack,
            renderInsightMeta,
            renderPageHero,
            renderReportingRhythmCard,
            renderStatusPill,
            renderTable,
            revenueIntegrityGuidanceRows,
            showToast,
            state,
            todayYmd,
        };
    }

    function reportsWorkspaceModuleDeps() {
        return {
            MODULE_LABELS,
            addDaysYmd,
            escapeHtml,
            fetchJson,
            fetchJsonSafe,
            formatByUnit,
            formatCurrency,
            formatInteger,
            loadImportsWorkspaceBundle,
            loadSharedDashboardPayload,
            loadSharedFinanceBase,
            loadSharedOperationalTargets,
            loadCachedCashbookPreview,
            loadSharedCashbookPreview,
            loadSharedReportsRevenue,
            logClientError,
            metricCards,
            recentLedgerWindow: (...args) => window.GreenLinkAdminFinanceReporting.recentLedgerWindow(...args),
            renderCashbookWorkspace: (bundle) => window.GreenLinkAdminFinanceReporting.renderCashbookWorkspace(bundle, financeReportingModuleDeps()),
            renderFinanceTrendChart,
            renderGuidanceStack,
            renderImportFreshness,
            renderImportsWorkspace,
            renderLedgerWorkspace: (bundle) => window.GreenLinkAdminFinanceReporting.renderLedgerWorkspace(bundle, financeReportingModuleDeps()),
            renderPageHero,
            renderStatusPill,
            renderStatusBreakdown,
            renderInsightMeta,
            renderTable,
            revenueIntegrityGuidanceRows,
            safeNumber,
            invalidateCashbookPreview,
            state,
            todayYmd,
        };
    }



    async function reportsBundle(options = {}) {
        return window.GreenLinkAdminReportsWorkspace.bundle(options, reportsWorkspaceModuleDeps());
    }

    function renderReportsWorkspace(bundle) {
        return window.GreenLinkAdminReportsWorkspace.renderWorkspace(bundle, reportsWorkspaceModuleDeps());
    }

    function clubSettingsModuleDeps() {
        return {
            escapeHtml,
            fetchJson,
            formatInteger,
            postJson,
            refreshActiveSettingsWorkspace,
            refreshBootstrap,
            renderModuleValueGrid,
            renderPageHero,
            showToast,
            sportsSetupConfig,
        };
    }

    function accountCustomersModuleDeps() {
        return {
            escapeHtml,
            renderStatusPill,
        };
    }

    function membersPanelModuleDeps() {
        return {
            MODULE_LABELS,
            activeClub,
            clearWorkspaceCache: () => {
                deleteWorkspaceCacheWhere(key => {
                    const [shell, workspace, panel] = String(key || "").split("|");
                    return shell === roleShell() && workspace === "members" && panel === "members";
                });
            },
            invalidateMemberAreaPreview: (area = null) => {
                const clubKey = activeClubCacheKeyPart();
                const targets = area
                    ? [String(area || "").trim().toLowerCase()]
                    : ["tennis", "padel", "bowls"];
                targets.filter(Boolean).forEach(key => deleteSharedCacheKey(membersAreaPreviewCacheKey(key, clubKey)));
            },
            invalidateRecentMembersPreview: () => deleteSharedCacheKey(recentMembersPreviewCacheKey(activeClubCacheKeyPart())),
            escapeHtml,
            formatCurrency,
            formatInteger,
            metricCards,
            operationModules,
            postJson,
            refreshActiveMembersWorkspace,
            renderAccountCustomerStack,
            renderDebtorWatchCard,
            renderDebtorWatchEmbedded,
            renderFamilySubnav,
            renderMemberServiceQueue,
            renderMemberServiceQueueEmbedded,
            renderPageActionRow,
            renderPeopleControlCards,
            renderServiceDeskBriefCard,
            renderServiceDeskBriefEmbedded,
            renderTable,
            renderWorkblock,
            roleShell,
            showToast,
        };
    }

    function staffPanelModuleDeps() {
        return {
            HTMLFormElement,
            activeClub,
            deleteWorkspaceCacheWhere,
            document,
            escapeHtml,
            focusWorkblock,
            formatInteger,
            metricCards,
            positiveInt,
            postJson,
            refreshActiveMembersWorkspace,
            invalidateStaffListPreview: () => deleteSharedCacheKey(staffListCacheKey(activeClubCacheKeyPart())),
            renderAccountCustomerStack,
            renderDebtorWatchEmbedded,
            renderFamilySubnav,
            renderMemberServiceQueueEmbedded,
            renderPageActionRow,
            renderServiceDeskBriefEmbedded,
            renderTable,
            renderWorkblock,
            roleShell,
            showToast,
            state,
        };
    }

    function golfDayOpsModuleDeps() {
        return {
            HTMLFormElement,
            activeClubCacheKeyPart,
            clampYmd,
            deleteSharedCacheKey,
            document,
            escapeHtml,
            formatCurrency,
            formatDate,
            formatInteger,
            golfDayBookingsCacheKey,
            invalidateGolfSharedData,
            invalidateGolfWorkspaceCaches,
            metricCards,
            positiveInt,
            postJson,
            refreshActiveGolfWorkspace,
            renderPageHero,
            renderStatusPill,
            safeNumber,
            showToast,
            state,
            todayYmd,
        };
    }

    function proShopModuleDeps() {
        return {
            HTMLFormElement,
            document,
            escapeHtml,
            formatCurrency,
            formatDateTime,
            formatInteger,
            invalidateProShopPanelSharedData,
            metricCards,
            positiveInt,
            postJson,
            renderAccountingHandoffCard,
            renderAccountingWorkflowCard,
            refreshActiveOperationsWorkspace,
            renderHandoverReadinessCard,
            renderOperationsCadenceCard,
            renderPageHero,
            renderProShopCashupCard,
            renderStatusPill,
            roleShell,
            showToast,
            state,
            window,
        };
    }

    function importsWorkspaceModuleDeps() {
        return {
            HTMLFormElement,
            HTMLInputElement,
            MODULE_LABELS,
            clubModules,
            deleteWorkspaceCacheWhere,
            document,
            escapeHtml,
            fetchJsonSafe,
            formatDateTime,
            formatInteger,
            formatRelativeAge,
            invalidateClubSummaryCaches,
            invalidateMemberAreaPreview: (area = null) => {
                const clubKey = activeClubCacheKeyPart();
                const targets = area
                    ? [String(area || "").trim().toLowerCase()]
                    : ["tennis", "padel", "bowls"];
                targets.filter(Boolean).forEach(key => deleteSharedCacheKey(membersAreaPreviewCacheKey(key, clubKey)));
            },
            invalidateRecentMembersPreview: () => deleteSharedCacheKey(recentMembersPreviewCacheKey(activeClubCacheKeyPart())),
            invalidateImportsWorkspaceSharedBundle: () => deleteSharedCacheKey(importsBundleCacheKey()),
            invalidateSummaryDrivenWorkspaceCaches,
            invalidateWorkspaceScope,
            loadSharedFinanceBase,
            postFormData,
            postJson,
            refreshActiveReportsWorkspace,
            refreshActiveSettingsWorkspace,
            renderAccountingHandoffCard,
            renderAccountingWorkflowCard,
            renderImportsHealthCard,
            renderInsightMeta,
            renderPageHero,
            renderStatusPill,
            renderTable,
            roleShell,
            showToast,
            state,
            summarizeImportsHealth,
            todayYmd,
        };
    }

    function operationalTargetsModuleDeps() {
        return {
            HTMLFormElement,
            invalidateClubSummaryCaches,
            invalidateSummaryDrivenWorkspaceCaches,
            invalidateWorkspaceScope,
            postJson,
            refreshActiveReportsWorkspace,
            refreshActiveSettingsWorkspace,
            showToast,
            state,
        };
    }

    async function settingsBundle(options = {}) {
        const signal = options.signal;
        const panel = state.route.panel || "profile";
        if (panel === "imports") {
            const importsBundle = await loadImportsWorkspaceBundle({ signal });
            return { panel, ...importsBundle };
        }
        if (panel === "targets") {
            const targets = await loadSharedOperationalTargets({ signal, year: new Date().getFullYear() });
            return { panel, targets };
        }
        return window.GreenLinkAdminClubSettings.bundle({ panel, signal }, clubSettingsModuleDeps());
    }

    function renderSettingsWorkspace(bundle) {
        const panel = state.route.panel || "profile";
        if (panel === "imports") {
            return renderImportsWorkspace(bundle);
        }
        if (panel === "targets") {
            const targets = Array.isArray(bundle.targets?.targets) ? bundle.targets.targets : [];
            return `
                ${renderPageHero({
                    title: "Targets",
                    copy: "Keep operational targets editable without dragging the rest of setup into this page.",
                    workspace: "reports",
                    subnavLabel: "Finance pages",
                    metrics: [
                        { label: "Target Rows", value: formatInteger(targets.length), meta: "Configured operational targets" },
                        { label: "Target Year", value: escapeHtml(bundle.targets?.year || new Date().getFullYear()), meta: "Current operational target set" },
                        { label: "Edit Scope", value: "Targets only", meta: "Keep this page intentionally narrow" },
                    ],
                })}
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
        return window.GreenLinkAdminClubSettings.renderWorkspace(bundle, clubSettingsModuleDeps());
    }

    async function renderCurrentWorkspace(options = {}) {
        const token = ++state.renderToken;
        const requestController = beginRouteRequest();
        const signal = requestController.signal;
        const optimisticRoute = normalizeRouteObject(options.route || state.route || parseRoute());
        const previousRoute = options.previousRoute ? normalizeRouteObject(options.previousRoute) : null;
        const transitionKind = options.transitionKind || transitionKindForRoutes(previousRoute, optimisticRoute, {
            initialLoad: Boolean(options.initialLoad),
            forceRefresh: Boolean(options.forceRefresh),
            recovery: Boolean(options.recovery),
        });
        const bootstrapRefreshRequired = shouldRefreshBootstrapForRouteTransition({
            fromRoute: previousRoute,
            toRoute: optimisticRoute,
            transitionKind,
            forceRefresh: Boolean(options.forceRefresh),
            recovery: Boolean(options.recovery),
        });
        const hasExistingWorkspace = Boolean(els.root.children.length || String(els.root.innerHTML || "").trim());
        if (!readWorkspaceCache(optimisticRoute) && !hasExistingWorkspace) {
            renderWorkspaceLoading("Loading role-specific workspace.");
        }
        try {
            if (bootstrapRefreshRequired) {
                await refreshBootstrap(Boolean(options.forceRefresh || options.initialLoad || options.recovery));
            }
            if (roleShell() === "member") {
                window.location.href = state.bootstrap.landing_path || "/frontend/dashboard.html?view=home";
                return;
            }
            state.route = normalizeRouteObject(optimisticRoute);
            const canReuseChrome = ["club_admin", "staff"].includes(roleShell())
                && ["same_workspace_panel_switch", "same_workspace_date_change", "same_workspace_refresh"].includes(transitionKind)
                && Boolean(els.nav.children.length);
            if (!canReuseChrome) {
                renderChrome();
            } else {
                syncNavActiveState(state.route);
            }

            let html = "";
            if (roleShell() === "super_admin") {
                if (state.route.workspace === "overview") await renderSuperOverview(token);
                else if (state.route.workspace === "clubs") await renderSuperClubs(token);
                else if (state.route.workspace === "onboarding") await renderSuperOnboarding(token);
                else if (state.route.workspace === "demo") await renderSuperDemo(token);
                else if (state.route.workspace === "users") await renderSuperUsers(token);
                else if (state.route.workspace === "settings") await renderSuperSettings(token);
            } else if (roleShell() === "club_admin" || roleShell() === "staff") {
                const route = state.route;
                let bundle = null;
                if (route.workspace === "overview" || route.workspace === "today") {
                    bundle = await loadWorkspaceBundle(route, () => dashboardBundle({ signal }));
                    html = renderDashboardWorkspace(bundle, { mode: route.workspace === "today" ? "today" : "overview" });
                } else if (route.workspace === "golf") {
                    bundle = await loadWorkspaceBundle(route, () => golfBundle({ route, signal }));
                    html = renderGolfWorkspace(bundle);
                } else if (route.workspace === "operations") {
                    bundle = await loadWorkspaceBundle(route, () => operationsBundle({ signal }));
                    html = renderOperationsWorkspace(bundle);
                } else if (route.workspace === "members") {
                    bundle = await loadWorkspaceBundle(route, () => membersBundle({ signal }));
                    html = renderStandardizedMembersWorkspace(bundle);
                } else if (route.workspace === "communications") {
                    bundle = await loadWorkspaceBundle(route, () => communicationsBundle({ signal }));
                    html = renderCommunicationsWorkspace(bundle);
                } else if (route.workspace === "reports" && roleShell() === "club_admin") {
                    bundle = await loadWorkspaceBundle(route, () => reportsBundle({ signal }));
                    html = renderReportsWorkspace(bundle);
                } else if (route.workspace === "settings" && roleShell() === "club_admin") {
                    bundle = await loadWorkspaceBundle(route, () => settingsBundle({ signal }));
                    html = renderSettingsWorkspace(bundle);
                }
                if (token !== state.renderToken) return;
                if (bundle) state.workspaceData = bundle;
            }

            if (token !== state.renderToken) return;
            if (html) {
                els.root.innerHTML = html;
                setupNativeTeeSheetInteractions();
            }
            setOverlay(false);
        } catch (error) {
            if (isAbortError(error) || signal.aborted) return;
            if (token !== state.renderToken) return;
            logClientError("renderCurrentWorkspace", error, {
                loader: state.route?.workspace === "reports" ? "reportsBundle" : `${String(state.route?.workspace || "workspace")}Bundle`,
                panel: state.route?.panel,
                date: state.route?.date,
                route: state.route,
            });
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
        return window.GreenLinkAdminStaffPanel.submitForm(form, staffPanelModuleDeps());
    }

    async function submitMemberForm(form) {
        return window.GreenLinkAdminMembersPanel.submitMemberForm(form, membersPanelModuleDeps());
    }

    function resetClubStaffForm(form = document.getElementById("club-staff-form")) {
        return window.GreenLinkAdminStaffPanel.resetForm(form);
    }

    function editStaffUser(userId) {
        return window.GreenLinkAdminStaffPanel.editUser(userId, staffPanelModuleDeps());
    }

    async function submitMembersSearchForm(form) {
        return window.GreenLinkAdminMembersPanel.submitSearchForm(form, membersPanelModuleDeps());
    }

    // Compatibility shim: communications ownership now lives in frontend/js/admin/communications.js.
    function renderCommunicationsWorkspace(payload) {
        return window.GreenLinkAdminCommunications.renderWorkspace(payload, communicationModuleDeps());
    }

    function resetCommunicationForm(form = document.getElementById("communication-form")) {
        return window.GreenLinkAdminCommunications.resetForm(form);
    }

    function editCommunicationRecord(communicationId) {
        return window.GreenLinkAdminCommunications.editRecord(communicationId, communicationModuleDeps());
    }

    async function updateCommunicationState(communicationId, patch = {}) {
        return window.GreenLinkAdminCommunications.updateState(communicationId, patch, communicationModuleDeps());
    }

    async function submitCommunicationForm(form) {
        return window.GreenLinkAdminCommunications.submitForm(form, communicationModuleDeps());
    }

    function editProShopProduct(productId) {

        return window.GreenLinkAdminProShop.editProduct(productId, proShopModuleDeps());

    }



    async function adjustProShopStockPrompt(productId) {

        return window.GreenLinkAdminProShop.adjustStockPrompt(productId, proShopModuleDeps());

    }



    async function submitProShopProductForm(form) {

        return window.GreenLinkAdminProShop.submitProductForm(form, proShopModuleDeps());

    }



    async function submitProShopSaleForm(form) {

        return window.GreenLinkAdminProShop.submitSaleForm(form, proShopModuleDeps());

    }



    function resetGolfDayForm(form = document.getElementById("golf-day-form")) {
        return window.GreenLinkAdminGolfDayOps.resetForm(form);
    }

    function loadGolfDayIntoForms(golfDayBookingId) {
        return window.GreenLinkAdminGolfDayOps.loadIntoForms(golfDayBookingId, golfDayOpsModuleDeps());
    }

    function resetGolfDayAllocationForm(form = document.getElementById("golf-day-allocation-form")) {
        return window.GreenLinkAdminGolfDayOps.resetAllocationForm(form, golfDayOpsModuleDeps());
    }

    async function submitGolfDayForm(form) {
        return window.GreenLinkAdminGolfDayOps.submitForm(form, golfDayOpsModuleDeps());
    }

    async function markGolfDayPaid(golfDayBookingId) {
        return window.GreenLinkAdminGolfDayOps.markPaid(golfDayBookingId, golfDayOpsModuleDeps());
    }

    async function markGolfDayCompleted(golfDayBookingId) {
        return window.GreenLinkAdminGolfDayOps.markCompleted(golfDayBookingId, golfDayOpsModuleDeps());
    }

    async function submitGolfDayAllocationForm(form) {
        return window.GreenLinkAdminGolfDayOps.submitAllocationForm(form, golfDayOpsModuleDeps());
    }

    function resetImportSettingsForm(form = document.getElementById("import-settings-form")) {

        return window.GreenLinkAdminImportsWorkspace.resetSettingsForm(form, importsWorkspaceModuleDeps());

    }



    function loadImportSettingsIntoForm(stream) {

        return window.GreenLinkAdminImportsWorkspace.loadSettingsIntoForm(stream, importsWorkspaceModuleDeps());

    }



    async function submitImportSettingsForm(form) {

        return window.GreenLinkAdminImportsWorkspace.submitSettingsForm(form, importsWorkspaceModuleDeps());

    }



    async function submitImportRevenueForm(form) {

        return window.GreenLinkAdminImportsWorkspace.submitRevenueForm(form, importsWorkspaceModuleDeps());

    }



    async function submitImportMembersForm(form) {
        return window.GreenLinkAdminImportsWorkspace.submitMembersForm(form, importsWorkspaceModuleDeps());
    }

    async function submitBookingWindowForm(form) {
        return window.GreenLinkAdminClubSettings.submitBookingWindowForm(form, clubSettingsModuleDeps());
    }

    async function submitClubProfileForm(form) {
        return window.GreenLinkAdminClubSettings.submitClubProfileForm(form, clubSettingsModuleDeps());
    }

    async function submitOperationalTargetsForm(form) {
        return window.GreenLinkAdminOperationalTargets.submitForm(form, operationalTargetsModuleDeps());
    }

    function findTeeRow(teeTimeId) {
        const rows = Array.isArray(state.workspaceData.teeRows) ? state.workspaceData.teeRows : [];
        return rows.find(row => Number(row.id) === Number(teeTimeId)) || null;
    }

    async function fetchSuggestedFee(path, payload) {
        try {
            return await fetchJson(path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                timeoutMs: 12000,
            });
        } catch (error) {
            if (Number(error?.status || 0) === 404) return null;
            throw error;
        }
    }

    async function updateBookingPricingPreview(form) {
        if (!(form instanceof HTMLFormElement)) return;
        const preview = form.querySelector("[data-booking-price-preview]");
        if (!(preview instanceof HTMLElement)) return;
        const teeTimeId = Number(form.tee_time_id.value || 0);
        if (!isPersistedTeeTimeId(teeTimeId)) {
            preview.innerHTML = `<div class="detail-row"><span class="row-key">Pricing</span><span class="row-value">Unavailable until the tee sheet is generated</span></div>`;
            return;
        }
        const requestId = String(Number(form.dataset.pricingRequestId || 0) + 1);
        form.dataset.pricingRequestId = requestId;
        preview.innerHTML = `<div class="detail-row"><span class="row-key">Pricing</span><span class="row-value">Estimating...</span></div>`;

        const playerType = String(form.player_type.value || "visitor").trim();
        const holes = Number(form.holes.value || 18) === 9 ? 9 : 18;
        const golfPayload = { tee_time_id: teeTimeId, player_type: playerType, holes };

        try {
            const [greenFee, cartFee, pushCartFee, caddyFee] = await Promise.all([
                fetchSuggestedFee("/fees/suggest/golf", golfPayload),
                form.cart.checked ? fetchSuggestedFee("/fees/suggest/cart", golfPayload) : Promise.resolve(null),
                form.push_cart.checked ? fetchSuggestedFee("/fees/suggest/push-cart", golfPayload) : Promise.resolve(null),
                form.caddy.checked ? fetchSuggestedFee("/fees/suggest/caddy", golfPayload) : Promise.resolve(null),
            ]);
            if (form.dataset.pricingRequestId !== requestId) return;
            const lines = [
                greenFee ? { label: greenFee.description || "Green fee", amount: Number(greenFee.price || 0) } : null,
                cartFee ? { label: cartFee.description || "Cart", amount: Number(cartFee.price || 0) } : null,
                pushCartFee ? { label: pushCartFee.description || "Push cart", amount: Number(pushCartFee.price || 0) } : null,
                caddyFee ? { label: caddyFee.description || "Caddy", amount: Number(caddyFee.price || 0) } : null,
            ].filter(Boolean);
            const partySize = Math.max(1, Number(form.party_size.value || 1));
            const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0) * partySize;
            preview.innerHTML = lines.length
                ? `
                    <div class="stack">
                        ${lines.map(line => `<div class="detail-row"><span class="row-key">${escapeHtml(line.label)}</span><span class="row-value">${escapeHtml(formatCurrency(line.amount || 0))}</span></div>`).join("")}
                        <div class="detail-row"><span class="row-key">Estimated total</span><span class="row-value">${escapeHtml(formatCurrency(total))}</span></div>
                    </div>
                `
                : `<div class="detail-row"><span class="row-key">Pricing</span><span class="row-value">Price will resolve on booking</span></div>`;
        } catch (error) {
            if (form.dataset.pricingRequestId !== requestId) return;
            preview.innerHTML = `<div class="detail-row"><span class="row-key">Pricing</span><span class="row-value">${escapeHtml(error?.message || "Unable to estimate price")}</span></div>`;
        }
    }

    function bindBookingModalPricing() {
        const form = document.getElementById("booking-modal-form");
        if (!(form instanceof HTMLFormElement)) return;
        ["player_type", "holes", "party_size", "cart", "push_cart", "caddy"].forEach(name => {
            ["change", "input"].forEach(eventName => {
                form.elements[name]?.addEventListener?.(eventName, () => {
                    void updateBookingPricingPreview(form);
                });
            });
        });
        void updateBookingPricingPreview(form);
    }

    function openBookingModal(teeTimeId, options = {}) {
        const row = findTeeRow(teeTimeId);
        if (!row) return;
        if (!isPersistedTeeTimeId(row.id)) {
            showToast("Generate the tee sheet for this day before adding bookings.", "bad");
            return;
        }
        const requestedPartySize = Math.max(1, Math.min(Number(options.defaultPartySize || 1), Number(row.available || 4) || 4));
        state.modalData = { teeTimeId: Number(teeTimeId), defaultPartySize: requestedPartySize };
        openModal(
            "Create booking",
            `${formatDateTime(row.tee_time)} ? Tee ${row.hole || "1"} ? ${row.available} spot(s) available`,
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
                        <div class="field"><label>Party Size</label><input name="party_size" type="number" min="1" max="${escapeHtml(row.available || 4)}" value="${escapeHtml(requestedPartySize)}"></div>
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
                    <section class="card" data-booking-price-preview>
                        <div class="detail-row"><span class="row-key">Pricing</span><span class="row-value">Estimating...</span></div>
                    </section>
                    <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
                    <div class="button-row">
                        <button type="submit" class="button">Create booking</button>
                        <button type="button" class="button secondary" data-close-modal="1">Cancel</button>
                    </div>
                </form>
            `
        );
        bindBookingModalPricing();
    }

    async function submitBookingModal(form) {
        const teeTimeId = Number(form.tee_time_id.value || 0);
        if (!isPersistedTeeTimeId(teeTimeId)) {
            throw new Error("Generate the tee sheet for this day before adding bookings.");
        }
        const payload = {
            tee_time_id: teeTimeId,
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
        await postJson("/tsheet/booking", payload, { invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date);
        invalidateGolfSharedData({
            date: state.route?.date,
            includeTeeRows: true,
            includeDashboard: true,
        });
        showToast("Booking created.", "ok");
        closeModal();
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function moveBookingToTeeTime(bookingId, toTeeTimeId) {
        await postJson(`/tsheet/bookings/${Number(bookingId)}/move`, { to_tee_time_id: Number(toTeeTimeId) }, { method: "PUT", invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date);
        invalidateGolfSharedData({
            date: state.route?.date,
            includeTeeRows: true,
            includeDashboard: true,
        });
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
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
        await postJson(`/checkin/${Number(bookingId)}${query}`, {}, { invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date);
        invalidateGolfSharedData({
            date: state.route?.date,
            includeTeeRows: true,
            includeDashboard: true,
            includeFinanceBase: true,
        });
        showToast("Booking checked in.", "ok");
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function updateBookingStatus(bookingId, nextStatus) {
        await postJson(`/api/admin/bookings/${Number(bookingId)}/status`, { status: String(nextStatus || "").trim() }, { method: "PUT", invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date);
        invalidateGolfSharedData({
            date: state.route?.date,
            includeTeeRows: true,
            includeDashboard: true,
            includeFinanceBase: true,
        });
        showToast("Booking status updated.", "ok");
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function refreshActiveGolfWorkspace(options = {}) {
        if (state.route?.workspace !== "golf") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await golfBundle({ route, signal });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        if (route.panel === "bookings") {
            const currentUi = defaultGolfBookingsUi(state.workspaceData?.bookingsUi);
            bundle.bookingsUi = {
                ...defaultGolfBookingsUi({
                    ...currentUi,
                    ...(options.bookingsUi || {}),
                }),
            };
        }
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderGolfWorkspace(bundle);
        if (route.panel === "tee-sheet") {
            setupNativeTeeSheetInteractions();
        }
    }

    async function refreshActiveOverviewWorkspace() {
        if (!["overview", "today"].includes(state.route?.workspace || "")) {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await dashboardBundle({ signal });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderDashboardWorkspace(
            bundle,
            { mode: route.workspace === "today" ? "today" : "overview" }
        );
    }

    async function refreshActiveMembersWorkspace(options = {}) {
        if (state.route?.workspace !== "members") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await membersBundle({
            signal,
            membersUi: defaultMembersUi({
                ...state.workspaceData?.membersUi,
                ...(options.membersUi || {}),
            }),
        });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderStandardizedMembersWorkspace(bundle);
    }

    async function refreshActiveReportsWorkspace() {
        if (state.route?.workspace !== "reports") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await reportsBundle({ signal });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderReportsWorkspace(bundle);
    }

    async function refreshActiveSettingsWorkspace() {
        if (state.route?.workspace !== "settings") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await settingsBundle({ signal });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderSettingsWorkspace(bundle);
    }

    async function refreshActiveCommunicationsWorkspace() {
        if (state.route?.workspace !== "communications") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await loadWorkspaceBundle(route, () => communicationsBundle({ signal }));
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderCommunicationsWorkspace(bundle);
    }

    async function refreshActiveOperationsWorkspace() {
        if (state.route?.workspace !== "operations") {
            await renderCurrentWorkspace();
            return;
        }
        const route = { ...state.route };
        const routeKey = workspaceRouteKey(route);
        const signal = routeRequestSignal();
        const bundle = await operationsBundle({ signal });
        if (signal?.aborted) return;
        if (routeKey !== workspaceRouteKey(state.route)) return;
        state.workspaceData = bundle;
        writeWorkspaceCache(route, bundle);
        els.root.innerHTML = renderOperationsWorkspace(bundle);
    }

    async function refreshCurrentWorkspaceFromScope() {
        const workspace = state.route?.workspace || "";
        if (["overview", "today"].includes(workspace)) return refreshActiveOverviewWorkspace();
        if (workspace === "members") return refreshActiveMembersWorkspace();
        if (workspace === "reports") return refreshActiveReportsWorkspace();
        if (workspace === "settings") return refreshActiveSettingsWorkspace();
        if (workspace === "communications") return refreshActiveCommunicationsWorkspace();
        if (workspace === "operations") return refreshActiveOperationsWorkspace();
        return renderCurrentWorkspace();
    }

    function activeGolfBookingsUi() {
        return defaultGolfBookingsUi(state.workspaceData?.bookingsUi);
    }

    function selectedGolfBookingIds() {
        return activeGolfBookingsUi().selectedIds;
    }

    function rerenderActiveWorkspaceFromState() {
        if (state.route?.workspace !== "golf" || state.route?.panel !== "bookings") return;
        els.root.innerHTML = renderGolfWorkspace(state.workspaceData || {});
    }

    function rerenderActiveOverviewWorkspaceFromState() {
        if (!state.workspaceData) return false;
        if (!["overview", "today"].includes(state.route?.workspace || "")) return false;
        els.root.innerHTML = renderDashboardWorkspace(
            state.workspaceData || {},
            { mode: state.route.workspace === "today" ? "today" : "overview" }
        );
        return true;
    }

    function updateGolfBookingsUi(patch) {
        if (!state.workspaceData || state.route?.workspace !== "golf" || state.route?.panel !== "bookings") return;
        state.workspaceData.bookingsUi = defaultGolfBookingsUi({
            ...activeGolfBookingsUi(),
            ...(patch || {}),
        });
        rerenderActiveWorkspaceFromState();
    }

    async function submitGolfBookingsFilterForm(form, submitter) {
        const action = String(submitter?.value || submitter?.getAttribute?.("value") || "").trim().toLowerCase();
        if (action === "reset") {
            updateGolfBookingsUi({
                q: "",
                status: "all",
                integrity: "all",
                selectedIds: [],
            });
            return;
        }
        updateGolfBookingsUi({
            q: String(form.q.value || "").trim(),
            status: String(form.status.value || "all").trim().toLowerCase(),
            integrity: String(form.integrity.value || "all").trim().toLowerCase(),
            selectedIds: [],
        });
    }

    function toggleGolfBookingSelection(bookingId, checked) {
        const current = new Set(selectedGolfBookingIds().map(value => Number(value)));
        const id = Number(bookingId || 0);
        if (id <= 0) return;
        if (checked) current.add(id);
        else current.delete(id);
        updateGolfBookingsUi({ selectedIds: Array.from(current) });
    }

    function selectVisibleGolfBookings() {
        const ids = visibleGolfBookingRows(state.workspaceData || {}).map(row => Number(row.id)).filter(Boolean);
        updateGolfBookingsUi({ selectedIds: ids });
    }

    function clearVisibleGolfBookings() {
        updateGolfBookingsUi({ selectedIds: [] });
    }

    async function updateBookingPaymentMethodPrompt(bookingId) {
        const paymentMethod = String(window.prompt("Payment method (CARD/CASH/EFT/ONLINE/ACCOUNT)", "CARD") || "").trim();
        if (!paymentMethod) return;
        await postJson(`/api/admin/bookings/${Number(bookingId)}/payment-method`, { payment_method: paymentMethod }, { method: "PUT", invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date, new Set(["bookings"]));
        showToast("Booking payment method updated.", "ok");
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function updateBookingAccountCodePrompt(bookingId) {
        const accountCode = window.prompt("Account code (leave blank to clear)", "") ?? null;
        if (accountCode === null) return;
        await postJson(`/api/admin/bookings/${Number(bookingId)}/account-code`, { account_code: String(accountCode || "").trim() || null }, { method: "PUT", invalidateCache: false });
        invalidateGolfWorkspaceCaches(state.route?.date, new Set(["bookings"]));
        showToast("Booking account code updated.", "ok");
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function batchUpdateGolfBookings(payload, successMessage) {
        const bookingIds = selectedGolfBookingIds();
        if (!bookingIds.length) {
            showToast("Select at least one booking.", "bad");
            return;
        }
        await postJson("/api/admin/bookings/batch-update", {
            booking_ids: bookingIds,
            ...(payload || {}),
        }, { method: "PUT", invalidateCache: false });
        if (payload?.status) {
            invalidateGolfWorkspaceCaches(state.route?.date);
            invalidateGolfSharedData({
                date: state.route?.date,
                includeTeeRows: true,
                includeDashboard: true,
                includeFinanceBase: true,
            });
        } else {
            invalidateGolfWorkspaceCaches(state.route?.date, new Set(["bookings"]));
        }
        showToast(successMessage || "Bookings updated.", "ok");
        await refreshActiveGolfWorkspace({ bookingsUi: { selectedIds: [] } });
    }

    async function batchUpdateGolfBookingStatusFromUi() {
        const select = els.root.querySelector("#golf-bookings-bulk-status");
        const status = select instanceof HTMLSelectElement ? String(select.value || "").trim().toLowerCase() : "";
        if (!status) {
            showToast("Choose a bulk status first.", "bad");
            return;
        }
        await batchUpdateGolfBookings({ status }, "Booking statuses updated.");
    }

    async function batchUpdateGolfBookingPaymentPrompt() {
        const paymentMethod = String(window.prompt("Bulk payment method (CARD/CASH/EFT/ONLINE/ACCOUNT)", "CARD") || "").trim();
        if (!paymentMethod) return;
        await batchUpdateGolfBookings({ payment_method: paymentMethod }, "Booking payment methods updated.");
    }

    async function batchUpdateGolfBookingAccountPrompt() {
        const accountCode = String(window.prompt("Bulk account code", "") || "").trim();
        if (!accountCode) return;
        await batchUpdateGolfBookings({ account_code: accountCode }, "Booking account codes updated.");
    }

    async function handleClick(event) {
        const target = event.target instanceof HTMLElement ? event.target.closest("[data-nav-group],[data-nav-workspace],[data-nav-panel],[data-demo-ensure],[data-refresh],[data-close-modal],[data-open-booking],[data-check-in],[data-booking-status],[data-booking-payment],[data-booking-account],[data-booking-select],[data-booking-select-visible],[data-booking-select-clear],[data-booking-bulk-status],[data-booking-bulk-payment],[data-booking-bulk-account],[data-date-shift],[data-dashboard-stream],[data-export-cashbook],[data-export-pro-shop],[data-close-day],[data-reopen-day],[data-load-cashbook-preview],[data-clear-members-search],[data-workblock-toggle],[data-edit-communication],[data-communication-status],[data-communication-pin],[data-clear-communication-form],[data-edit-pro-shop-product],[data-adjust-pro-shop-stock],[data-clear-golf-day-form],[data-clear-golf-day-allocation-form],[data-edit-golf-day],[data-load-golf-day-allocation],[data-golf-day-mark-paid],[data-golf-day-complete],[data-edit-import-settings],[data-clear-import-settings-form],[data-ledger-repair],[data-ledger-payment],[data-ledger-account],[data-edit-staff],[data-clear-staff-form]") : null;
        if (!target) return;
        if (target.hasAttribute("data-nav-group")) return toggleNavGroup(target.getAttribute("data-nav-group") || "");
        if (target.hasAttribute("data-close-modal")) return closeModal();
        if (target.hasAttribute("data-refresh")) return refreshCurrentWorkspaceFromScope();
        if (target.hasAttribute("data-demo-ensure")) return ensureDemoEnvironment();
        if (target.hasAttribute("data-dashboard-stream")) {
            setDashboardStreamPreference(target.getAttribute("data-dashboard-stream") || "all");
            if (rerenderActiveOverviewWorkspaceFromState()) return;
            return renderCurrentWorkspace();
        }
        if (target.hasAttribute("data-export-cashbook")) return window.GreenLinkAdminFinanceReporting.exportCashbookCsv(target.getAttribute("data-export-cashbook") || todayYmd(), financeReportingModuleDeps());
        if (target.hasAttribute("data-export-pro-shop")) return window.GreenLinkAdminFinanceReporting.exportProShopCsv(target.getAttribute("data-export-pro-shop") || todayYmd(), financeReportingModuleDeps());
        if (target.hasAttribute("data-close-day")) return window.GreenLinkAdminFinanceReporting.closeCashbookDay(target.getAttribute("data-close-day") || todayYmd(), financeReportingModuleDeps());
        if (target.hasAttribute("data-reopen-day")) return window.GreenLinkAdminFinanceReporting.reopenCashbookDay(target.getAttribute("data-reopen-day") || todayYmd(), financeReportingModuleDeps());
        if (target.hasAttribute("data-load-cashbook-preview")) return window.GreenLinkAdminFinanceReporting.loadCashbookPreview(target.getAttribute("data-load-cashbook-preview") || todayYmd(), financeReportingModuleDeps());
        if (target.hasAttribute("data-clear-members-search")) return window.GreenLinkAdminMembersPanel.clearSearch(membersPanelModuleDeps());
        if (target.hasAttribute("data-workblock-toggle")) return focusWorkblock(target.getAttribute("data-workblock-toggle") || "");
        if (target.hasAttribute("data-date-shift")) return navigate({ date: addDaysYmd(state.route.date, Number(target.getAttribute("data-date-shift") || 0)) });
        if (target.hasAttribute("data-edit-communication")) return editCommunicationRecord(Number(target.getAttribute("data-edit-communication") || 0));
        if (target.hasAttribute("data-communication-status")) {
            return updateCommunicationState(Number(target.getAttribute("data-communication-status") || 0), {
                status: target.getAttribute("data-status-value") || "draft",
            });
        }
        if (target.hasAttribute("data-communication-pin")) {
            return updateCommunicationState(Number(target.getAttribute("data-communication-pin") || 0), {
                pinned: target.getAttribute("data-pin-value") === "1",
            });
        }
        if (target.hasAttribute("data-clear-communication-form")) return resetCommunicationForm();
        if (target.hasAttribute("data-edit-pro-shop-product")) return editProShopProduct(Number(target.getAttribute("data-edit-pro-shop-product") || 0));
        if (target.hasAttribute("data-adjust-pro-shop-stock")) return adjustProShopStockPrompt(Number(target.getAttribute("data-adjust-pro-shop-stock") || 0));
        if (target.hasAttribute("data-clear-golf-day-form")) return resetGolfDayForm();
        if (target.hasAttribute("data-clear-golf-day-allocation-form")) return resetGolfDayAllocationForm();
        if (target.hasAttribute("data-edit-golf-day")) return loadGolfDayIntoForms(Number(target.getAttribute("data-edit-golf-day") || 0));
        if (target.hasAttribute("data-load-golf-day-allocation")) return loadGolfDayIntoForms(Number(target.getAttribute("data-load-golf-day-allocation") || 0));
        if (target.hasAttribute("data-golf-day-mark-paid")) return markGolfDayPaid(Number(target.getAttribute("data-golf-day-mark-paid") || 0));
        if (target.hasAttribute("data-golf-day-complete")) return markGolfDayCompleted(Number(target.getAttribute("data-golf-day-complete") || 0));
        if (target.hasAttribute("data-edit-import-settings")) return loadImportSettingsIntoForm(target.getAttribute("data-edit-import-settings") || "other");
        if (target.hasAttribute("data-clear-import-settings-form")) return resetImportSettingsForm();
        if (target.hasAttribute("data-ledger-repair")) {
            return window.GreenLinkAdminFinanceReporting.repairLedgerBooking(
                Number(target.getAttribute("data-ledger-repair") || 0),
                target.getAttribute("data-ledger-status") || "checked_in",
                financeReportingModuleDeps()
            );
        }
        if (target.hasAttribute("data-ledger-payment")) return updateBookingPaymentMethodPrompt(Number(target.getAttribute("data-ledger-payment") || 0));
        if (target.hasAttribute("data-ledger-account")) return updateBookingAccountCodePrompt(Number(target.getAttribute("data-ledger-account") || 0));
        if (target.hasAttribute("data-edit-staff")) return editStaffUser(Number(target.getAttribute("data-edit-staff") || 0));
        if (target.hasAttribute("data-clear-staff-form")) return resetClubStaffForm();
        if (target.hasAttribute("data-open-booking")) {
            return openBookingModal(
                Number(target.getAttribute("data-open-booking") || 0),
                { defaultPartySize: Number(target.getAttribute("data-open-booking-party") || 1) }
            );
        }
        if (target.hasAttribute("data-check-in")) return checkInBooking(Number(target.getAttribute("data-check-in") || 0));
        if (target.hasAttribute("data-booking-status")) {
            return updateBookingStatus(Number(target.getAttribute("data-booking-status") || 0), target.getAttribute("data-status-value") || "");
        }
        if (target.hasAttribute("data-booking-payment")) {
            return updateBookingPaymentMethodPrompt(Number(target.getAttribute("data-booking-payment") || 0));
        }
        if (target.hasAttribute("data-booking-account")) {
            return updateBookingAccountCodePrompt(Number(target.getAttribute("data-booking-account") || 0));
        }
        if (target.hasAttribute("data-booking-select")) {
            return toggleGolfBookingSelection(target.getAttribute("data-booking-select") || 0, target instanceof HTMLInputElement ? target.checked : true);
        }
        if (target.hasAttribute("data-booking-select-visible")) return selectVisibleGolfBookings();
        if (target.hasAttribute("data-booking-select-clear")) return clearVisibleGolfBookings();
        if (target.hasAttribute("data-booking-bulk-status")) return batchUpdateGolfBookingStatusFromUi();
        if (target.hasAttribute("data-booking-bulk-payment")) return batchUpdateGolfBookingPaymentPrompt();
        if (target.hasAttribute("data-booking-bulk-account")) return batchUpdateGolfBookingAccountPrompt();
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
            "pro-shop-sale-form": submitProShopSaleForm,
            "pro-shop-product-form": submitProShopProductForm,
            "golf-day-form": submitGolfDayForm,
            "golf-day-allocation-form": submitGolfDayAllocationForm,
            "import-settings-form": submitImportSettingsForm,
            "import-revenue-form": submitImportRevenueForm,
            "import-members-form": submitImportMembersForm,
            "booking-window-form": submitBookingWindowForm,
            "club-profile-form": submitClubProfileForm,
            "operational-targets-form": submitOperationalTargetsForm,
            "booking-modal-form": submitBookingModal,
            "golf-bookings-filter-form": submitGolfBookingsFilterForm,
            "members-search-form": submitMembersSearchForm,
        };
        const handler = handlers[form.id];
        if (!handler) return;
        event.preventDefault();
        const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
        if (submitter) submitter.disabled = true;
        try {
            await handler(form, submitter);
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
        logClientError("initialize", error, {
            loader: "initialize",
            route: state.route,
        });
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
            applyRouteTransition(parseRoute(), { historyMode: "none" });
        });

        applyRouteTransition(state.route, { historyMode: "none", initialLoad: true });
    }

    void initialize().catch(handleInitializationFailure);
})();
