// Admin Dashboard JavaScript

const API_BASE = window.location.origin;
let currentUserRole = null;
let currentUserProfile = null;
let currentPage = 1;
let currentPlayersPage = 1;
let currentLedgerPage = 1;
let peopleView = "members"; // members | guests | staff
let guestTypeFilter = "all"; // all | affiliated | non_affiliated
let selectedTee = "all";
let selectedHolesView = "18";
let selectedTeeSheetDate = "";
let bookingPeriod = "day";
let bookingDateBasis = "tee_time";
let bookingSort = "tee_asc";
let bookingIntegrityFilter = "all";
let ledgerPeriod = "day";
let ledgerExportFilter = "all";
let revenuePeriod = "day"; // day | wtd | mtd | ytd
let revenueStreamFocus = "all";
let golfFeesCache = [];
let cashbookHasRecords = false;
let proShopCashbookHasRecords = false;
let proShopCashbookAlreadyExported = false;
let currentBookingDetail = null;
let cachedPastelLayout = null;
let cachedPastelMappings = null;
let cachedGlAccountReference = null;
let accountingSetupListenersInitialized = false;
const MEMBER_PRICING_LABELS = {
    membership_default: "Default by membership type",
    visitor_override: "Visitor rate override",
    non_affiliated_override: "Non-affiliated visitor override",
    reciprocity_override: "Reciprocity override",
};
let teeBookingState = {
    teeTimeId: null,
    teeTimeIso: null,
    tee: "1",
    capacity: 4,
    existing: 0,
    prepaid: false
};
let teeBookingSubmitting = false;
let currentActivePage = "dashboard";
let superAdminClubsCache = [];
let platformStateCache = null;
let authFetchInstalled = false;
let currentMemberDetail = null;
let dashboardStreamView = "all";
let dashboardDataCache = null;
let dashboardStreamPreset = "all";
let dashboardMenuContext = "main";
let dashboardPeriodView = "day";
let dashboardAutoRefreshTimer = null;
let dashboardSideLoadTimer = null;
let dashboardLoadController = null;
let dashboardLoadPromise = null;
let operationalAlertsLoadController = null;
let operationalAlertsLoadPromise = null;
let revenueLoadController = null;
let revenueLoadPromise = null;
let revenueLoadRequestKey = "";
let ledgerLoadController = null;
let ledgerLoadPromise = null;
let ledgerLoadRequestKey = "";
let revenueImportSettingsCache = {};
let pricingMatrixRows = [];
let proShopProductsCache = [];
let proShopCart = [];
let peopleSort = "recent_activity";
let peopleAreaFilter = "all";
let peopleStatusFilter = "active";
let peopleQuickFilter = "all";
let peopleContextMode = "general";
let proShopStockFilter = "all";
let proShopCategoryFilter = "all";
let proShopSalesWindowDays = 30;
let accountCustomersCache = [];
let accountCustomersPageRows = [];
let golfDayBookingsPageRows = [];
let peopleLoadController = null;
let peopleLoadRequestKey = "";
let peopleLoadPromise = null;
let teeSheetLoadController = null;
let teeSheetLoadRequestKey = "";
let teeSheetLoadPromise = null;
const IMPORT_OPERATIONS = Object.freeze([
    { key: "golf", label: "Golf" },
    { key: "pro_shop", label: "Pro Shop" },
    { key: "pub", label: "Pub" },
    { key: "bowls", label: "Bowls" },
    { key: "other", label: "Other" },
]);
const IMPORT_OPERATION_KEYS = Object.freeze(IMPORT_OPERATIONS.map(op => op.key));
const PRIMARY_OPERATIONS = Object.freeze([
    { key: "golf", label: "Golf" },
    { key: "pro_shop", label: "Pro Shop" },
]);
const PRIMARY_OPERATION_KEYS = Object.freeze(PRIMARY_OPERATIONS.map(op => op.key));
const DASHBOARD_STREAM_KEYS = Object.freeze(["all", ...PRIMARY_OPERATION_KEYS]);
const REVENUE_FOCUS_KEYS = Object.freeze(["all", "golf_paid", "other_imported", "pro_shop"]);
const BOOKING_PERIOD_KEYS = Object.freeze(["day", "week", "month", "ytd"]);
const BOOKING_INTEGRITY_KEYS = Object.freeze(["all", "missing_paid_ledger"]);
const DEFAULT_IMPORT_STREAM = "golf";
const ROLE_PAGE_SCOPE = Object.freeze({
    super_admin: ["super-admin"],
    admin: [
        "dashboard",
        "bookings",
        "players",
        "account-customers-page",
        "golf-days-page",
        "pro-shop",
        "revenue",
        "tee-times",
        "ledger",
        "cashbook",
        "operations-config",
    ],
    club_staff: [
        "bookings",
        "players",
        "account-customers-page",
        "golf-days-page",
        "pro-shop",
        "revenue",
        "tee-times",
        "ledger",
        "cashbook",
    ],
});
const PLACEHOLDER_OPERATION_PAGES = Object.freeze(["operation-center", "pub-ops", "bowls-ops", "other-ops"]);
const PEOPLE_ROUTE_VIEWS = Object.freeze(["members", "staff", "guests", "account_contacts"]);
const ADMIN_ROUTE_OPERATION_KEYS = Object.freeze(["all", "general", "golf", "tennis", "bowls", "squash", "pro_shop"]);
let teeSheetProfile = null;
let teeSheetTeeTimeMap = new Map();
let teeSheetBulkSelectedBookingIds = new Set();
let teeSheetBulkSelectionScopeKey = "";
let teeSlotManageState = {
    mode: "slot",
    teeTimeId: null,
    teeTimeIso: null,
    teeLabel: "1",
    bookings: [],
    heading: "Manage Tee Slot",
    intro: "Process multiple players in one step (status, payment method, and debtor account).",
    refreshLabel: "Refresh Slot",
};
let weatherReconfirmRows = [];
let teeWeatherRiskMap = new Map();
let teeWeatherRequestSeq = 0;
let weatherPreviewDebounceTimer = null;
let operationalAlertsCache = null;
let superAdminView = "overview";
let superAdminCommandCenterCache = null;
let superAdminWorkspaceCache = null;
let superAdminCatalogCache = null;
let superAdminSelectedClubId = null;
let superAdminOnboardingStep = 1;
const SUPER_ONBOARDING_STEPS = Object.freeze({
    1: {
        label: "Step 1",
        title: "Club Basics",
        copy: "Capture the club identity, contacts, and address before you enable modules or assign launch responsibilities.",
    },
    2: {
        label: "Step 2",
        title: "Branding",
        copy: "Set the logo, hero asset, palette, and display identity so the club-facing experience feels client-ready from day one.",
    },
    3: {
        label: "Step 3",
        title: "Operations",
        copy: "Enable only the operating modules this club should launch with. Keep the first release focused and easy to run.",
    },
    4: {
        label: "Step 4",
        title: "Pricing & Targets",
        copy: "Apply a pricing baseline and set revenue, rounds, and member targets so management can measure launch performance immediately.",
    },
    5: {
        label: "Step 5",
        title: "Access & Roles",
        copy: "Assign the first club admin who will own this environment after launch. Additional staff can be added once the club is live.",
    },
    6: {
        label: "Step 6",
        title: "Communications Setup",
        copy: "Seed the member-facing experience with an announcement, news item, or welcome message so the app feels live on first login.",
    },
    7: {
        label: "Step 7",
        title: "Review & Launch",
        copy: "Review readiness, confirm status, and launch only when the club is commercially and operationally ready.",
    },
});

const AUTH_FETCH_TIMEOUT_MS = 15000;
const AUTH_FETCH_RETRY_ATTEMPTS = 2;
const AUTH_FETCH_RETRY_BASE_MS = 320;
const DASHBOARD_CACHE_KEY = "greenlink_admin_dashboard_cache_v1";
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const ADMIN_API = (() => {
    try {
        if (window.GreenLinkApiClient && typeof window.GreenLinkApiClient.create === "function") {
            return window.GreenLinkApiClient.create({ baseUrl: API_BASE });
        }
    } catch {
        // Fallback to legacy fetchJson usage.
    }
    return null;
})();

function markAdminShellReady() {
    document.body.classList.remove("admin-loading");
}

function apiGetJson(path, options) {
    const safePath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
    if (ADMIN_API && typeof ADMIN_API.getJson === "function") {
        return ADMIN_API.getJson(safePath, options);
    }
    return fetchJson(`${API_BASE}${safePath}`, options);
}

function delayMs(ms) {
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.delayMs === "function") {
        return requestUtils.delayMs(ms);
    }
    const wait = Math.max(0, Number(ms || 0));
    return new Promise(resolve => window.setTimeout(resolve, wait));
}

function parseRetryAfterMs(response) {
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.parseRetryAfterMs === "function") {
        return requestUtils.parseRetryAfterMs(response);
    }
    const raw = String(response?.headers?.get?.("Retry-After") || "").trim();
    if (!raw) return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    const at = Date.parse(raw);
    if (!Number.isFinite(at)) return 0;
    return Math.max(0, at - Date.now());
}

function isRetryableMethod(method) {
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.isRetryableMethod === "function") {
        return requestUtils.isRetryableMethod(method);
    }
    const m = String(method || "").toUpperCase();
    return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isRetryableStatus(status) {
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.isRetryableStatus === "function") {
        return requestUtils.isRetryableStatus(status);
    }
    const code = Number(status || 0);
    return code === 408 || code === 429 || code >= 500;
}

function installAuthFetch() {
    if (authFetchInstalled) return;
    authFetchInstalled = true;
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.installAuthFetch === "function") {
        requestUtils.installAuthFetch({
            timeoutMs: AUTH_FETCH_TIMEOUT_MS,
            retryAttempts: AUTH_FETCH_RETRY_ATTEMPTS,
            retryBaseMs: AUTH_FETCH_RETRY_BASE_MS,
            getCurrentUserRole: () => currentUserRole,
        });
        return;
    }
}

function showToast(message, type = "info", title = null, timeoutMs = 3200) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const safeType = ["success", "info", "error"].includes(type) ? type : "info";
    const heading = title || (safeType === "success" ? "Done" : safeType === "error" ? "Problem" : "Info");

    const toast = document.createElement("div");
    toast.className = `toast ${safeType}`;

    const dot = document.createElement("div");
    dot.className = "dot";

    const body = document.createElement("div");

    const t = document.createElement("div");
    t.className = "title";
    t.textContent = String(heading);

    const msg = document.createElement("div");
    msg.className = "msg";
    msg.textContent = String(message || "");

    const actions = document.createElement("div");
    actions.className = "actions";

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "btn-dismiss";
    dismissBtn.textContent = "Dismiss";

    const dismiss = () => {
        if (!toast.isConnected) return;
        toast.remove();
    };
    dismissBtn.addEventListener("click", dismiss);

    actions.appendChild(dismissBtn);
    body.appendChild(t);
    body.appendChild(msg);
    body.appendChild(actions);

    toast.appendChild(dot);
    toast.appendChild(body);
    container.appendChild(toast);

    if (timeoutMs && timeoutMs > 0) {
        setTimeout(dismiss, timeoutMs);
    }
}

function toastSuccess(msg, title = null) { showToast(msg, "success", title, 2600); }
function toastInfo(msg, title = null) { showToast(msg, "info", title, 3200); }
function toastError(msg, title = null) { showToast(msg, "error", title, 5600); }

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    installAuthFetch();
    const role = await checkAuth();
    if (!role) return;

    syncAdminNavHrefs();
    setupNavigation();
    setupSuperAdminControls();
    setupDashboardStreamFilters();
    setupDashboardPeriodFilters();
    setupAiAssistantActions();
    setupCloseModals();
    document.getElementById("dashboard-alerts-refresh-btn")?.addEventListener("click", () => {
        loadOperationalAlerts({ silent: false, useCache: false });
    });
    updateTime();
    setInterval(updateTime, 1000);
    applyRoleScope(role);
    refreshNavGroupVisibility();

    // Operational pages (admin + club_staff)
    setupBookingFilters();
    setupTeeSheetFilters();
    setupTeeManageMenu();
    setupTeeBookingModal();
    setupTeeSlotManageModal();
    setupTeeSheetBulkActions();
    setupPeopleFilters();
    setupManagementPageControls();
    setupPageShortcuts();
    setupUmhlaliOperationalSync();
    setupTargetModelSettings();
    setupPricingMatrixSettings();
    await loadTeeProfileSettings({ silent: true });
    await loadAccountCustomersCache({ silent: true });

    window.addEventListener("hashchange", () => {
        applyAdminRouteFromLocation();
    });

    if (role === "super_admin") {
        setupRevenueImport();
        await superRefreshPlatformReadiness();
    } else if (role === "admin") {
        setupLedgerFilters();
        setupRevenueFilters();
        setupRevenueImport();
        startDashboardAutoRefresh();
    } else {
        await applyStaffMode(role);
        return;
    }

    applyAdminRouteFromLocation({ replaceHistory: true });
});

// Date formatting (DD/MM/YY across admin UI)
const DMY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
});

function formatDateDMY(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return DMY_FORMATTER.format(d);
}

function formatDateTimeDMY(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${formatDateDMY(d)} ${time}`;
}

function formatTimeDateDMY(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${time} ${formatDateDMY(d)}`;
}

function formatYMDToDMY(value) {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return value || "-";
    return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

async function fetchJson(url, options) {
    const requestUtils = window.GreenLinkRequest || {};
    if (typeof requestUtils.fetchJson === "function") {
        return requestUtils.fetchJson(url, options);
    }
    const res = await fetch(url, options);
    const raw = await res.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }
    if (!res.ok) {
        const msg = (data && (data.detail || data.message)) ? (data.detail || data.message) : (raw || res.statusText || "Request failed");
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function readDashboardCache() {
    const stateUtils = window.GreenLinkState || {};
    if (typeof stateUtils.readTtlCache === "function") {
        return stateUtils.readTtlCache(DASHBOARD_CACHE_KEY, DASHBOARD_CACHE_TTL_MS);
    }
    try {
        const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        const cachedAt = Number(parsed.cached_at || 0);
        if (!Number.isFinite(cachedAt) || cachedAt <= 0) return null;
        if ((Date.now() - cachedAt) > DASHBOARD_CACHE_TTL_MS) return null;
        if (!parsed.data || typeof parsed.data !== "object") return null;
        return { cachedAt, data: parsed.data };
    } catch {
        return null;
    }
}

function writeDashboardCache(data) {
    const stateUtils = window.GreenLinkState || {};
    if (typeof stateUtils.writeTtlCache === "function") {
        stateUtils.writeTtlCache(DASHBOARD_CACHE_KEY, data);
        return;
    }
    try {
        localStorage.setItem(
            DASHBOARD_CACHE_KEY,
            JSON.stringify({
                cached_at: Date.now(),
                data: data || {},
            })
        );
    } catch {
        // Ignore storage failures.
    }
}

function startDashboardAutoRefresh() {
    if (dashboardAutoRefreshTimer) {
        window.clearInterval(dashboardAutoRefreshTimer);
    }
    dashboardAutoRefreshTimer = window.setInterval(() => {
        if (currentActivePage !== "dashboard") return;
        loadDashboard({ silent: true, useCache: false });
    }, 60000);
}

function statusToClass(status) {
    const dashboardUtils = window.GreenLinkAdminDashboard || {};
    if (typeof dashboardUtils.statusToClass === "function") {
        return dashboardUtils.statusToClass(status);
    }
    switch (status) {
        case "checked_in":
            return "checked-in";
        case "no_show":
            return "no-show";
        default:
            return status || "";
    }
}

function statusToLabel(status) {
    const dashboardUtils = window.GreenLinkAdminDashboard || {};
    if (typeof dashboardUtils.statusToLabel === "function") {
        return dashboardUtils.statusToLabel(status);
    }
    return String(status || "").replaceAll("_", " ");
}

function isPrimaryOperationStream(stream) {
    return PRIMARY_OPERATION_KEYS.includes(String(stream || "").toLowerCase());
}

function isImportOperationStream(stream) {
    return IMPORT_OPERATION_KEYS.includes(String(stream || "").toLowerCase());
}

function normalizeDashboardStreamKey(raw, fallback = "all") {
    const key = String(raw || "").toLowerCase();
    if (DASHBOARD_STREAM_KEYS.includes(key)) return key;
    return DASHBOARD_STREAM_KEYS.includes(String(fallback || "").toLowerCase()) ? String(fallback || "").toLowerCase() : "all";
}

function normalizeImportStreamKey(raw, fallback = DEFAULT_IMPORT_STREAM) {
    const key = String(raw || "").toLowerCase();
    if (isImportOperationStream(key)) return key;
    return isImportOperationStream(fallback) ? String(fallback).toLowerCase() : DEFAULT_IMPORT_STREAM;
}

function primaryOperationRows() {
    return PRIMARY_OPERATIONS.map(op => ({ ...op }));
}

function formatNumber(value, minFractionDigits = 0, maxFractionDigits = minFractionDigits) {
    const num = Number(value);
    if (!Number.isFinite(num)) return minFractionDigits > 0 ? `0.${"0".repeat(minFractionDigits)}` : "0";
    return num.toLocaleString("en-US", {
        minimumFractionDigits: Math.max(0, Number(minFractionDigits) || 0),
        maximumFractionDigits: Math.max(0, Number(maxFractionDigits) || 0),
    });
}

function formatInteger(value) {
    return formatNumber(value, 0, 0);
}

function formatCurrencyZAR(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "R0.00";
    return `R${formatNumber(num, 2, 2)}`;
}

function formatCompactBookingPrice(booking) {
    if (booking && booking.price_unresolved) return "—";
    const num = Number(booking?.price || 0);
    if (!Number.isFinite(num)) return "—";
    return `R${num.toFixed(0)}`;
}

function safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function formatPct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "-";
    return `${formatNumber(num * 100, 0, 0)}%`;
}

function pctPillClass(pct) {
    const v = Number(pct);
    if (!Number.isFinite(v)) return "warn";
    if (v >= 1.0) return "good";
    if (v >= 0.75) return "warn";
    return "bad";
}

// Authentication
async function checkAuth() {
    const token = localStorage.getItem("token");
    if (!token) {
        console.error("No token found");
        window.location.href = "index.html";
        return null;
    }

    // Get user info
    try {
        const response = await fetch(`${API_BASE}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            console.error("User fetch failed:", response.status);
            localStorage.removeItem("token");
            window.location.href = "index.html";
            return null;
        }

        const user = await response.json();
        console.log("User:", user);
        currentUserProfile = user;
        currentUserRole = user.role || null;
        
        // Check if admin, super admin, or pro shop staff
        if (user.role !== "admin" && user.role !== "club_staff" && user.role !== "super_admin") {
            console.error("Not admin/staff user");
            alert("Admin/staff access required. Your role is: " + user.role);
            window.location.href = "index.html";
            return null;
        }
        
        document.getElementById("admin-name").textContent = user.name;

        if (user.role === "super_admin") {
            await initSuperAdminContext();
        }
        await loadPlatformStatus();
        console.log("Admin/staff access granted");
        return user.role;
    } catch (error) {
        console.error("Auth check failed:", error);
        return null;
    }
}

function refreshNavGroupVisibility() {
    document.querySelectorAll(".nav-group").forEach(group => {
        const visibleItems = Array.from(group.querySelectorAll(".nav-item[data-page]"))
            .filter(item => item instanceof HTMLElement && item.style.display !== "none");
        group.style.display = visibleItems.length ? "" : "none";
    });
}

function allowedPagesForRole(role) {
    const key = String(role || "").trim().toLowerCase();
    return new Set(ROLE_PAGE_SCOPE[key] || []);
}

function isPageAllowedForRole(page, role = currentUserRole) {
    const target = String(page || "").trim();
    if (!target) return false;
    return allowedPagesForRole(role).has(target);
}

function normalizePeopleRouteView(view) {
    const value = String(view || "").trim().toLowerCase();
    return PEOPLE_ROUTE_VIEWS.includes(value) ? value : "members";
}

function normalizeAdminRouteOperation(operation) {
    const value = String(operation || "").trim().toLowerCase();
    return ADMIN_ROUTE_OPERATION_KEYS.includes(value) ? value : "all";
}

function normalizeBookingRoutePeriod(period) {
    const value = String(period || "").trim().toLowerCase();
    return BOOKING_PERIOD_KEYS.includes(value) ? value : "day";
}

function normalizeBookingIntegrityFilter(value) {
    const key = String(value || "").trim().toLowerCase();
    return BOOKING_INTEGRITY_KEYS.includes(key) ? key : "all";
}

function normalizeSuperAdminView(value, fallback = "overview") {
    const key = String(value || "").trim().toLowerCase();
    const allowed = ["overview", "clubs", "onboarding", "demo", "users", "catalog", "templates", "health", "settings"];
    if (allowed.includes(key)) return key;
    return allowed.includes(String(fallback || "").toLowerCase()) ? String(fallback || "").toLowerCase() : "overview";
}

function normalizeAdminRoute(pageName, routeOptions = {}) {
    const page = String(pageName || "").trim();
    const route = { page };
    if (page === "dashboard") {
        route.stream = normalizeDashboardStreamKey(routeOptions.stream || dashboardStreamPreset || dashboardStreamView || "all", "all");
    } else if (page === "bookings") {
        route.period = normalizeBookingRoutePeriod(routeOptions.period || bookingPeriod || "day");
        route.integrity = normalizeBookingIntegrityFilter(routeOptions.integrity || bookingIntegrityFilter || "all");
    } else if (page === "players") {
        route.view = normalizePeopleRouteView(routeOptions.view || peopleView || "members");
        if (route.view === "account_contacts") {
            return { page: "account-customers-page" };
        }
        route.operation = normalizeAdminRouteOperation(routeOptions.operation || peopleAreaFilter || "all");
    } else if (page === "super-admin") {
        route.view = normalizeSuperAdminView(routeOptions.view || superAdminView || "overview", "overview");
    }
    return route;
}

function buildAdminRouteHash(pageName, routeOptions = {}) {
    const route = normalizeAdminRoute(pageName, routeOptions);
    if (!route.page) return "";
    const params = new URLSearchParams();
    if (route.page === "dashboard") {
        params.set("stream", route.stream || "all");
    } else if (route.page === "bookings") {
        params.set("period", route.period || "day");
        if (route.integrity && route.integrity !== "all") {
            params.set("integrity", route.integrity);
        }
    } else if (route.page === "players") {
        params.set("view", route.view || "members");
        params.set("operation", route.operation || "all");
    } else if (route.page === "super-admin") {
        params.set("view", route.view || "overview");
    }
    const query = params.toString();
    return `#${route.page}${query ? `?${query}` : ""}`;
}

function parseAdminRouteHash(rawHash = window.location.hash) {
    const hash = String(rawHash || "").trim();
    if (!hash.startsWith("#") || hash.length <= 1) return null;
    const payload = hash.slice(1);
    const [rawPage, rawQuery = ""] = payload.split("?");
    const page = decodeURIComponent(String(rawPage || "").trim());
    if (!page) return null;
    const params = new URLSearchParams(rawQuery);
    return normalizeAdminRoute(page, {
        stream: params.get("stream"),
        period: params.get("period"),
        integrity: params.get("integrity"),
        view: params.get("view"),
        operation: params.get("operation"),
        context: params.get("context"),
        focus: params.get("focus"),
    });
}

function syncAdminNavHrefs() {
    document.querySelectorAll(".nav-item[data-page]").forEach(item => {
        const page = String(item.getAttribute("data-page") || "").trim();
        if (!page) return;
        item.setAttribute("href", buildAdminRouteHash(page, {
            stream: item.dataset.dashboardStream,
            operation: item.dataset.peopleOperation,
            view: page === "super-admin" ? item.dataset.superView : item.dataset.peopleView,
            context: item.dataset.operationContext,
            focus: item.dataset.operationFocus,
        }));
    });
}

function findNavItemForRoute(pageName, routeOptions = {}) {
    const route = normalizeAdminRoute(pageName, routeOptions);
    const candidates = Array.from(document.querySelectorAll(`.nav-item[data-page="${route.page}"]`));
    if (!candidates.length) return null;
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    candidates.forEach(item => {
        if (!(item instanceof HTMLElement) || item.style.display === "none") return;
        let score = 0;
        if (route.page === "dashboard") {
            const stream = normalizeDashboardStreamKey(item.dataset.dashboardStream || "all", "all");
            score = stream === route.stream ? 20 : 0;
        } else if (route.page === "players") {
            const view = normalizePeopleRouteView(item.dataset.peopleView || "members");
            const operation = normalizeAdminRouteOperation(item.dataset.peopleOperation || "all");
            if (view === route.view) score += 20;
            if (operation === route.operation) score += 10;
        } else if (route.page === "super-admin") {
            const view = normalizeSuperAdminView(item.dataset.superView || "overview", "overview");
            score = view === normalizeSuperAdminView(route.view || "overview", "overview") ? 20 : 0;
        } else {
            score = 10;
        }
        if (score > bestScore) {
            best = item;
            bestScore = score;
        }
    });
    return best;
}

function setActiveNavItemForRoute(pageName, routeOptions = {}) {
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    const navItem = findNavItemForRoute(pageName, routeOptions);
    if (navItem instanceof HTMLElement) {
        navItem.classList.add("active");
    }
}

function fallbackPageForRole(role = currentUserRole) {
    const normalizedRole = String(role || "").trim().toLowerCase();
    if (normalizedRole === "super_admin") return "super-admin";
    if (normalizedRole === "club_staff") return "tee-times";
    return "dashboard";
}

function abortPendingRequest(controller) {
    if (!controller) return;
    try {
        controller.abort();
    } catch {
        // Ignore abort races on completed requests.
    }
}

function cancelHeavyAdminRequests(activePage = currentActivePage) {
    const page = String(activePage || "").trim().toLowerCase();
    if (page !== "dashboard") {
        abortPendingRequest(dashboardLoadController);
        abortPendingRequest(operationalAlertsLoadController);
        if (dashboardSideLoadTimer) {
            window.clearTimeout(dashboardSideLoadTimer);
            dashboardSideLoadTimer = null;
        }
    }
    if (page !== "revenue") {
        abortPendingRequest(revenueLoadController);
    }
    if (page !== "ledger") {
        abortPendingRequest(ledgerLoadController);
    }
}

function refreshDashboardIfVisible(options = {}) {
    if (currentActivePage !== "dashboard") return Promise.resolve(null);
    return loadDashboard(options);
}

function refreshRevenueIfVisible(options = {}) {
    if (currentActivePage !== "revenue") return Promise.resolve(null);
    return loadRevenue(options);
}

function scheduleDashboardOperationalAlerts() {
    if (dashboardSideLoadTimer) {
        window.clearTimeout(dashboardSideLoadTimer);
    }
    if (currentActivePage !== "dashboard") return;
    dashboardSideLoadTimer = window.setTimeout(() => {
        dashboardSideLoadTimer = null;
        if (currentActivePage === "dashboard") {
            loadOperationalAlerts({ silent: true, useCache: true });
        }
    }, 250);
}

function applyRoleScope(role) {
    const normalizedRole = String(role || "").trim().toLowerCase();
    const allowedPages = allowedPagesForRole(normalizedRole);
    const platformGroup = document.getElementById("nav-platform-group");
    const roleScopeChip = document.getElementById("role-scope-chip");
    const peopleBtnStaff = document.querySelector('#players .people-btn[data-view="staff"]');
    const peopleBtnGuests = document.querySelector('#players .people-btn[data-view="guests"]');

    if (platformGroup) {
        platformGroup.style.display = normalizedRole === "super_admin" ? "" : "none";
    }
    document.querySelectorAll('[id^="nav-super-admin-"]').forEach(item => {
        item.style.display = normalizedRole === "super_admin" ? "" : "none";
    });
    if (roleScopeChip) {
        roleScopeChip.textContent = normalizedRole === "super_admin" ? "Platform mode" : normalizedRole === "club_staff" ? "Operator mode" : "Club admin";
    }

    document.querySelectorAll(".nav-item[data-page]").forEach(item => {
        const page = String(item.getAttribute("data-page") || "").trim();
        item.style.display = allowedPages.has(page) ? "" : "none";
    });

    document.querySelectorAll(".page").forEach(pageEl => {
        const pageId = String(pageEl.id || "").trim();
        pageEl.style.display = allowedPages.has(pageId) ? "" : "none";
    });
    PLACEHOLDER_OPERATION_PAGES.forEach(pageId => {
        const pageEl = document.getElementById(pageId);
        if (pageEl) pageEl.style.display = "none";
    });

    const opsOpenRevenueBtn = document.getElementById("ops-open-revenue-btn");
    const opsOpenPeopleBtn = document.getElementById("ops-open-people-btn");
    if (opsOpenRevenueBtn) {
        opsOpenRevenueBtn.style.display = normalizedRole === "super_admin" ? "none" : "";
    }
    if (opsOpenPeopleBtn) {
        opsOpenPeopleBtn.style.display = normalizedRole === "super_admin" ? "none" : "";
    }

    if (peopleBtnStaff) {
        peopleBtnStaff.style.display = normalizedRole === "club_staff" ? "none" : "";
    }
    if (peopleBtnGuests) {
        peopleBtnGuests.style.display = normalizedRole === "super_admin" ? "none" : "";
    }

    refreshNavGroupVisibility();
    updateTeeSheetBulkSelectionSummary();
}

function resolveClubName(clubId) {
    const targetId = String(clubId ?? "").trim();
    if (!targetId) return "";
    const platformClubs = Array.isArray(platformStateCache?.active_clubs) ? platformStateCache.active_clubs : [];
    const row = superAdminClubsCache.find(club => String(club?.id) === targetId)
        || platformClubs.find(club => String(club?.id) === targetId);
    return String(row?.name || "").trim();
}

function readinessStatusLabel(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "ready") return "Ready";
    if (value === "needs_attention") return "Needs attention";
    return "Setup required";
}

function readinessCheckCell(ready) {
    return ready ? "Yes" : "No";
}

function renderSuperAdminReadiness(platform = platformStateCache) {
    const totalEl = document.getElementById("super-readiness-clubs");
    const readyEl = document.getElementById("super-readiness-ready");
    const attentionEl = document.getElementById("super-readiness-attention");
    const setupEl = document.getElementById("super-readiness-setup");
    const noteEl = document.getElementById("super-readiness-note");
    const tableEl = document.getElementById("super-readiness-table");
    if (!tableEl) return;

    const rows = Array.isArray(platform?.setup_readiness) ? platform.setup_readiness : [];
    const total = rows.length;
    const ready = rows.filter(row => String(row?.status || "") === "ready").length;
    const attention = rows.filter(row => String(row?.status || "") === "needs_attention").length;
    const setupRequired = rows.filter(row => String(row?.status || "") === "setup_required").length;

    if (totalEl) totalEl.textContent = String(total);
    if (readyEl) readyEl.textContent = String(ready);
    if (attentionEl) attentionEl.textContent = String(attention);
    if (setupEl) setupEl.textContent = String(setupRequired);

    if (!rows.length) {
        if (noteEl) noteEl.textContent = "No active clubs found yet. Create a club to start onboarding.";
        tableEl.innerHTML = `<tr><td colspan="9">No club setup readiness data yet.</td></tr>`;
        return;
    }

    const nextAttention = rows.find(row => String(row?.status || "") !== "ready");
    if (noteEl) {
        noteEl.textContent = nextAttention
            ? `${resolveClubName(nextAttention.club_id) || nextAttention.club_slug || `Club ${nextAttention.club_id}`}: ${Array.isArray(nextAttention.missing) && nextAttention.missing.length ? nextAttention.missing.join(", ") : "review setup"}`
            : "All active clubs meet the current setup baseline.";
    }

    tableEl.innerHTML = rows.map(row => {
        const clubLabel = resolveClubName(row?.club_id) || String(row?.club_slug || `Club ${row?.club_id || ""}`).trim();
        const missing = Array.isArray(row?.missing) && row.missing.length ? row.missing.join(", ") : "-";
        return `<tr>
            <td>${escapeHtml(clubLabel)}</td>
            <td>${readinessStatusLabel(row?.status)}</td>
            <td>${Math.max(0, Math.min(100, Number(row?.score || 0)))}%</td>
            <td>${readinessCheckCell(Boolean(row?.checks?.access))}</td>
            <td>${readinessCheckCell(Boolean(row?.checks?.members))}</td>
            <td>${readinessCheckCell(Boolean(row?.checks?.pricing))}</td>
            <td>${readinessCheckCell(Boolean(row?.checks?.operations))}</td>
            <td>${readinessCheckCell(Boolean(row?.checks?.finance))}</td>
            <td>${escapeHtml(missing)}</td>
        </tr>`;
    }).join("");
}

async function superRefreshPlatformReadiness() {
    await loadPlatformStatus();
    renderSuperAdminReadiness(platformStateCache);
}

async function applyStaffMode(role) {
    if (role !== "club_staff") return;

    // Limit sidebar to operational pages for pro shop staff.
    const allowed = new Set([
        "bookings",
        "tee-times",
        "players",
        "pro-shop",
        "account-customers-page",
        "golf-days-page",
        "cashbook",
        "ledger",
        "revenue",
    ]);
    document.querySelectorAll(".nav-item[data-page]").forEach(item => {
        const page = item.getAttribute("data-page");
        if (!allowed.has(page)) {
            item.style.display = "none";
        }
    });

    // Hide staff management view for club_staff.
    document.querySelectorAll("#players .people-btn[data-view=\"staff\"]").forEach(el => {
        el.style.display = "none";
    });

    const goToInitialPage = (pageName) => {
        const route = parseAdminRouteHash(window.location.hash);
        if (route && allowed.has(route.page) && !PLACEHOLDER_OPERATION_PAGES.includes(route.page)) {
            navigateToAdminPage(route.page, route, { updateHistory: false });
            return;
        }
        const fallback = allowed.has(pageName) ? pageName : "tee-times";
        navigateToAdminPage(fallback, {}, { updateHistory: true, replaceHistory: true });
    };

    // Hide admin-only import actions for staff (admin can still use them).
    document.querySelectorAll("#people-import-btn, #people-import-log-btn, button[onclick=\"openImportLog()\"]").forEach(el => {
        el.style.display = "none";
    });

    const token = localStorage.getItem("token");
    try {
        const ctx = await fetchJson(`${API_BASE}/api/admin/staff-role-context`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const roleLabel = String(ctx?.role_label || "").trim();
        if (roleLabel) {
            setClubContextChip(`${roleLabel} workflow`);
        }
        goToInitialPage(String(ctx?.default_page || "tee-times"));
    } catch {
        goToInitialPage("tee-times");
    }

    refreshNavGroupVisibility();
    updateTeeSheetBulkSelectionSummary();
}

function setClubContextChip(text) {
    const chip = document.getElementById("club-context-chip");
    if (!chip) return;
    const label = String(text || "").trim();
    if (!label) {
        chip.style.display = "none";
        chip.textContent = "";
        return;
    }
    chip.textContent = label;
    chip.style.display = "inline-flex";
}

function setPlatformBanner(status, title, message) {
    const banner = document.getElementById("platform-status-banner");
    const titleEl = document.getElementById("platform-status-title");
    const textEl = document.getElementById("platform-status-text");
    if (!banner || !titleEl || !textEl) return;

    const safeStatus = ["ready", "needs_attention", "failed"].includes(String(status || ""))
        ? String(status)
        : "ready";
    const safeMessage = String(message || "").trim();

    if (!safeMessage) {
        banner.style.display = "none";
        banner.removeAttribute("data-status");
        titleEl.textContent = "Platform status";
        textEl.textContent = "";
        return;
    }

    banner.dataset.status = safeStatus;
    banner.style.display = "flex";
    titleEl.textContent = String(title || "Platform status");
    textEl.textContent = safeMessage;
}

function resolveActiveClubFromPlatform(platform) {
    const clubs = Array.isArray(platform?.active_clubs) ? platform.active_clubs : [];
    if (!clubs.length) return null;
    const activeClubId = localStorage.getItem("active_club_id");
    return clubs.find(club => String(club?.id) === String(activeClubId || "")) || clubs[0] || null;
}

async function loadPlatformStatus() {
    try {
        platformStateCache = await apiGetJson("/api/public/platform-state");
    } catch (error) {
        console.error("Failed to load platform status:", error);
        setClubContextChip("");
        setPlatformBanner("failed", "Platform status unavailable", "GreenLink could not confirm tenancy bootstrap state.");
        return;
    }

    const warnings = Array.isArray(platformStateCache?.warnings) ? platformStateCache.warnings : [];
    const errors = Array.isArray(platformStateCache?.errors) ? platformStateCache.errors : [];
    const status = String(platformStateCache?.status || "ready");
    const activeCount = Number(platformStateCache?.active_club_count || 0);

    let clubName = "";
    if (currentUserRole === "super_admin") {
        const activeClub = resolveActiveClubFromPlatform(platformStateCache);
        clubName = String(activeClub?.name || "").trim();
        setClubContextChip(clubName ? `Platform: ${clubName}` : "Platform");
    } else {
        try {
            const clubCfg = await apiGetJson("/api/public/club/me");
            clubName = String(clubCfg?.club_name || "").trim();
        } catch (error) {
            console.error("Failed to load club context:", error);
        }
        setClubContextChip(clubName || "Club scope");
    }

    let title = "Club context confirmed";
    let message = "";
    if (currentUserRole === "super_admin") {
        message = clubName
            ? `Platform management scope is active. Current club context: ${clubName}. ${activeCount} active club${activeCount === 1 ? "" : "s"} on the platform.`
            : `Platform management scope is active. ${activeCount} active club${activeCount === 1 ? "" : "s"} on the platform.`;
        if (activeCount > 1) {
            message += " Use the club selector to review onboarding and setup readiness by club.";
        }
    } else if (clubName) {
        message = `Operating inside ${clubName}. Bookings, tee sheet, people, and finance stay scoped to this club.`;
    } else {
        message = "Club scope could not be confirmed for this session.";
    }

    if (status === "needs_attention" && warnings.length) {
        title = "Tenancy needs review";
        message += ` ${warnings[0]}`;
    }
    if (status === "failed") {
        title = "Bootstrap failed";
        message = errors[0] || warnings[0] || "GreenLink could not finish tenancy bootstrap.";
    }

    setPlatformBanner(status, title, message);
    if (currentUserRole === "super_admin") {
        renderSuperAdminReadiness(platformStateCache);
    }
}

async function initSuperAdminContext() {
    const nav = document.getElementById("nav-super-admin");
    if (nav) nav.style.display = "";
    applyRoleScope(currentUserRole || "super_admin");

    const staffClub = document.getElementById("super-staff-club");

    try {
        const clubs = await fetchJson(`${API_BASE}/api/super/clubs`);
        superAdminClubsCache = Array.isArray(clubs) ? clubs : [];
    } catch (e) {
        console.error("Failed to load clubs:", e);
        alert("Super admin: failed to load clubs");
        return;
    }

    const activeClubs = superAdminClubsCache.filter(c => (c && (c.active === 1 || c.active === true)));
    if (!activeClubs.length) {
        if (staffClub) {
            staffClub.innerHTML = '<option value="">Create a club first</option>';
            staffClub.value = "";
        }
        setClubContextChip("Platform");
        renderSuperAdminReadiness(platformStateCache);
        return;
    }

    let activeClubId = localStorage.getItem("active_club_id");
    const isValid = (id) => activeClubs.some(c => String(c.id) === String(id));
    if (!activeClubId || !isValid(activeClubId)) {
        activeClubId = String(activeClubs[0].id);
        localStorage.setItem("active_club_id", activeClubId);
    }

    const optionHtml = activeClubs
        .map(c => `<option value="${c.id}">${c.name} (#${c.id})</option>`)
        .join("");

    if (staffClub) {
        staffClub.innerHTML = optionHtml;
        staffClub.value = String(activeClubId);
    }
    renderSuperAdminReadiness(platformStateCache);
}

async function superCreateClub() {
    const name = (document.getElementById("super-club-name")?.value || "").trim();
    const slug = (document.getElementById("super-club-slug")?.value || "").trim();
    const status = document.getElementById("super-club-status");
    if (status) status.textContent = "";

    if (!name) {
        if (status) status.textContent = "Club name is required";
        return;
    }

    try {
        await fetchJson(`${API_BASE}/api/super/clubs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, slug: slug || null, active: true })
        });
        if (status) status.textContent = "Club created";
        await initSuperAdminContext();
        await superRefreshStaff();
        await superRefreshPlatformReadiness();
    } catch (e) {
        console.error("Create club failed:", e);
        if (status) status.textContent = e?.message || "Create club failed";
    }
}

async function superCreateStaff() {
    const name = (document.getElementById("super-staff-name")?.value || "").trim();
    const email = (document.getElementById("super-staff-email")?.value || "").trim();
    const password = (document.getElementById("super-staff-password")?.value || "").trim();
    const role = (document.getElementById("super-staff-role")?.value || "").trim();
    const clubId = (document.getElementById("super-staff-club")?.value || "").trim();
    const status = document.getElementById("super-staff-status");
    if (status) status.textContent = "";

    if (!name || !email || !password || !role || !clubId) {
        if (status) status.textContent = "Name, email, password, role and club are required";
        return;
    }

    try {
        await fetchJson(`${API_BASE}/api/super/staff`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                email,
                password,
                role,
                club_id: Number(clubId),
                force_reset: true
            })
        });
        if (status) status.textContent = "User created/updated";
        await superRefreshStaff();
        await superRefreshPlatformReadiness();
    } catch (e) {
        console.error("Create staff failed:", e);
        if (status) status.textContent = e?.message || "Create user failed";
    }
}

async function superRefreshStaff() {
    const body = document.getElementById("super-staff-table");
    if (!body) return;
    body.innerHTML = "";

    try {
        const rows = await fetchJson(`${API_BASE}/api/super/staff`);
        const list = Array.isArray(rows) ? rows : [];
        body.innerHTML = list.map(u => (
            `<tr>
                <td>${u.id}</td>
                <td>${(u.name || "").replaceAll("<", "&lt;")}</td>
                <td>${(u.email || "").replaceAll("<", "&lt;")}</td>
                <td>${u.role}</td>
                <td>${escapeHtml(resolveClubName(u.club_id) || (u.club_id ?? ""))}</td>
            </tr>`
        )).join("");
    } catch (e) {
        console.error("Failed to load staff:", e);
        body.innerHTML = `<tr><td colspan="5">Failed to load staff</td></tr>`;
    }
}

function superSectionIdForView(view) {
    const key = normalizeSuperAdminView(view, "overview");
    const mapping = {
        overview: "super-section-overview",
        clubs: "super-section-clubs",
        onboarding: "super-section-onboarding",
        demo: "super-section-demo",
        users: "super-section-users",
        catalog: "super-section-catalog",
        templates: "super-section-templates",
        health: "super-section-health",
        settings: "super-section-settings",
    };
    return mapping[key] || "super-section-overview";
}

function setSuperAdminSectionButtons() {
    document.querySelectorAll(".super-subnav-btn").forEach(btn => {
        btn.classList.toggle("active", String(btn.dataset.superTarget || "") === normalizeSuperAdminView(superAdminView, "overview"));
    });
}

function setSuperAdminSectionVisibility(view = superAdminView) {
    const selected = normalizeSuperAdminView(view, "overview");
    document.querySelectorAll("#super-admin [data-super-view]").forEach(section => {
        const tokens = String(section.getAttribute("data-super-view") || "")
            .split(/\s+/)
            .map(value => value.trim().toLowerCase())
            .filter(Boolean);
        section.style.display = tokens.includes(selected) ? "" : "none";
    });
    setSuperAdminSectionButtons();
}

function renderSuperAdminReadiness(platform = superAdminCommandCenterCache) {
    const totalEl = document.getElementById("super-readiness-clubs");
    const liveEl = document.getElementById("super-summary-live");
    const onboardingEl = document.getElementById("super-summary-onboarding");
    const attentionEl = document.getElementById("super-readiness-attention");
    const demoEl = document.getElementById("super-summary-demo");
    const noteEl = document.getElementById("super-readiness-note");
    const tableEl = document.getElementById("super-readiness-table");
    if (!tableEl) return;

    let summary = platform?.summary || {};
    let rows = Array.isArray(platform?.clubs) ? platform.clubs : [];
    let issueRows = Array.isArray(platform?.needs_action) ? platform.needs_action : [];
    if (!rows.length && Array.isArray(platform?.setup_readiness)) {
        rows = platform.setup_readiness.map(row => ({
            id: row.club_id,
            name: resolveClubName(row.club_id) || row.club_name || row.club_slug || `Club ${row.club_id}`,
            status: row.status,
            score: row.score,
            next_step: Array.isArray(row.missing) && row.missing.length ? row.missing[0] : "Review setup",
            modules: [],
            counts: {
                admins: Number(row?.checks?.access ? 1 : 0),
                fees: Number(row?.checks?.pricing ? 1 : 0),
                annual_targets: 0,
                operational_targets: Number(row?.checks?.operations ? 1 : 0),
                communications: 0,
            },
        }));
        summary = {
            active_clubs: rows.length,
            live_clubs: rows.filter(row => String(row.status || "") === "ready").length,
            onboarding_clubs: rows.filter(row => String(row.status || "") !== "ready").length,
            needs_action: rows.filter(row => Number(row.score || 0) < 100).length,
        };
        issueRows = rows.filter(row => Number(row.score || 0) < 100).map(row => ({
            club_name: row.name,
            issue: row.next_step,
        }));
    }
    if (totalEl) totalEl.textContent = String(summary.active_clubs || 0);
    if (liveEl) liveEl.textContent = String(summary.live_clubs || 0);
    if (onboardingEl) onboardingEl.textContent = String(summary.onboarding_clubs || 0);
    if (attentionEl) attentionEl.textContent = String(summary.needs_action || 0);
    if (demoEl) demoEl.textContent = platform?.demo_environment?.available ? "1" : "0";

    const nextIssue = issueRows[0];
    if (noteEl) {
        noteEl.textContent = nextIssue
            ? `${nextIssue.club_name}: ${nextIssue.issue}`
            : "All clubs currently meet the baseline launch readiness checks.";
    }

    if (!rows.length) {
        tableEl.innerHTML = `<tr><td colspan="9">No clubs found yet.</td></tr>`;
        return;
    }

    tableEl.innerHTML = rows.map(row => {
        const modules = Array.isArray(row.modules) && row.modules.length ? row.modules.join(", ") : "-";
        const access = Number(row?.counts?.admins || 0) > 0 ? "Ready" : "Missing";
        const pricing = Number(row?.counts?.fees || 0) > 0 ? "Ready" : "Missing";
        const targets = Number(row?.counts?.annual_targets || 0) > 0 || Number(row?.counts?.operational_targets || 0) > 0 ? "Ready" : "Missing";
        const comms = Number(row?.counts?.communications || 0) > 0 ? "Ready" : "Missing";
        return `<tr>
            <td>${escapeHtml(row.name || "")}</td>
            <td>${escapeHtml(readinessStatusLabel(row.status || row.readiness_status || ""))}</td>
            <td>${Math.max(0, Math.min(100, Number(row.score || 0)))}%</td>
            <td>${access}</td>
            <td>${pricing}</td>
            <td>${targets}</td>
            <td>${comms}</td>
            <td>${escapeHtml(modules)}</td>
            <td>${escapeHtml(row.next_step || "-")}</td>
        </tr>`;
    }).join("");
}

function renderSuperNeedsAction(platform = superAdminCommandCenterCache) {
    const listEl = document.getElementById("super-needs-action-list");
    const actionEl = document.getElementById("super-next-action");
    if (!(listEl instanceof HTMLElement)) return;
    const rows = Array.isArray(platform?.needs_action) ? platform.needs_action : [];
    if (!rows.length) {
        if (actionEl) actionEl.textContent = "No clubs are currently blocked. Use Create New Club to start the next rollout.";
        listEl.innerHTML = `<div>All active clubs are on track.</div>`;
        return;
    }
    if (actionEl) {
        actionEl.textContent = `${rows[0].club_name}: ${rows[0].issue}`;
    }
    listEl.innerHTML = rows.map(row => `<div><strong>${escapeHtml(row.club_name || "")}</strong><br>${escapeHtml(row.issue || row.next_step || "")}</div>`).join("");
}

function renderSuperDemoArea(platform = superAdminCommandCenterCache) {
    const noteEl = document.getElementById("super-demo-note");
    const personasEl = document.getElementById("super-demo-personas");
    const summaryEl = document.getElementById("super-demo-club-summary");
    const credsEl = document.getElementById("super-demo-credentials");
    const demo = platform?.demo_environment || {};
    const personas = Array.isArray(demo.personas) ? demo.personas : [];
    const summaryText = demo.available
        ? `${demo.club_name || "Demo club"} is available and ready for admin and member walkthroughs.`
        : "No demo club is ready yet. Prepare the demo environment to seed personas and believable operating data.";
    if (noteEl) noteEl.textContent = summaryText;
    if (summaryEl) summaryEl.textContent = summaryText;
    const markup = personas.map(persona => `<div><strong>${escapeHtml(persona.label || persona.role_type || "")}</strong><br>${escapeHtml(persona.email || "")}<br><span>Password: ${escapeHtml(persona.password || "")}</span></div>`).join("");
    if (personasEl) personasEl.innerHTML = markup || `<div>No demo personas configured yet.</div>`;
    if (credsEl) credsEl.innerHTML = markup || `<div>No demo credentials available yet.</div>`;
}

function renderSuperCatalog(platform = superAdminCommandCenterCache) {
    const modulesEl = document.getElementById("super-catalog-modules");
    const targetsEl = document.getElementById("super-template-list");
    const settingsEl = document.getElementById("super-settings-list");
    const templatesWrapEl = document.getElementById("super-template-list");
    const moduleGrid = document.getElementById("super-module-grid");
    const catalog = platform?.catalog || {};
    const modules = Array.isArray(catalog.modules) ? catalog.modules : [];
    const targets = Array.isArray(catalog.targets) ? catalog.targets : [];
    const templates = Array.isArray(catalog.pricing_templates) ? catalog.pricing_templates : [];
    if (modulesEl) {
        modulesEl.innerHTML = modules.map(row => `<div><strong>${escapeHtml(row.label || row.key || "")}</strong><br>${escapeHtml(row.description || "")}</div>`).join("");
    }
    if (templatesWrapEl) {
        templatesWrapEl.innerHTML = templates.map(row => `<div><strong>${escapeHtml(row.label || row.key || "")}</strong><br>${escapeHtml(row.description || "")}</div>`).join("");
    }
    if (settingsEl) {
        settingsEl.innerHTML = [
            `<div><strong>Platform templates</strong><br>${templates.length} launch template(s) available.</div>`,
            `<div><strong>Operations catalog</strong><br>${modules.length} modules and ${targets.length} target metrics currently defined.</div>`,
            `<div><strong>Role model</strong><br>Super Admin, Club Admin, Club Staff / Operator, and Member / Player are now treated as explicit product roles.</div>`,
        ].join("");
    }
    if (moduleGrid) {
        moduleGrid.innerHTML = modules.map(row => `<div class="super-module-card"><label><input type="checkbox" data-module-key="${escapeHtml(row.key || "")}" ${row.default_enabled ? "checked" : ""}><span>${escapeHtml(row.label || row.key || "")}</span></label><p>${escapeHtml(row.description || "")}</p></div>`).join("");
    }
    const templateSelect = document.getElementById("super-pricing-template");
    if (templateSelect instanceof HTMLSelectElement && !templateSelect.options.length) {
        templateSelect.innerHTML = templates.map(row => `<option value="${escapeHtml(row.key || "")}">${escapeHtml(row.label || row.key || "")}</option>`).join("");
    }
}

function populateSuperClubOptions(rows) {
    const staffClub = document.getElementById("super-staff-club");
    if (!(staffClub instanceof HTMLSelectElement)) return;
    staffClub.innerHTML = rows.map(row => `<option value="${row.id}">${escapeHtml(row.name || "")}</option>`).join("");
    if (superAdminSelectedClubId) {
        staffClub.value = String(superAdminSelectedClubId);
    }
}

function renderSuperClubsTable(platform = superAdminCommandCenterCache) {
    const body = document.getElementById("super-clubs-table");
    if (!(body instanceof HTMLElement)) return;
    const search = String(document.getElementById("super-club-search")?.value || "").trim().toLowerCase();
    const filter = String(document.getElementById("super-club-status-filter")?.value || "all").trim().toLowerCase();
    const rows = (Array.isArray(platform?.clubs) ? platform.clubs : []).filter(row => {
        const matchesSearch = !search || String(row.name || "").toLowerCase().includes(search) || String(row.slug || "").toLowerCase().includes(search);
        const matchesFilter = filter === "all" || String(row.status || "").toLowerCase() === filter;
        return matchesSearch && matchesFilter;
    });
    populateSuperClubOptions(Array.isArray(platform?.clubs) ? platform.clubs : []);
    body.innerHTML = rows.map(row => {
        const modules = Array.isArray(row.modules) && row.modules.length ? row.modules.join(", ") : "-";
        const adminState = Number(row?.counts?.admins || 0) > 0 ? "Ready" : "Missing";
        return `<tr>
            <td>${escapeHtml(row.name || "")}</td>
            <td>${escapeHtml(readinessStatusLabel(row.status || ""))}</td>
            <td>${Math.max(0, Math.min(100, Number(row.score || 0)))}%</td>
            <td>${escapeHtml(modules)}</td>
            <td>${adminState}</td>
            <td>${Number(row?.counts?.members || 0)}</td>
            <td>${escapeHtml(row.next_step || "-")}</td>
            <td><button class="super-action-link" type="button" data-super-select-club="${row.id}">Open</button></td>
        </tr>`;
    }).join("");
}

function applySuperOnboardingStep(step = superAdminOnboardingStep) {
    const boundedStep = Math.max(1, Math.min(7, Number(step || 1) || 1));
    superAdminOnboardingStep = boundedStep;
    const meta = SUPER_ONBOARDING_STEPS[boundedStep] || SUPER_ONBOARDING_STEPS[1];
    const select = document.getElementById("super-onboarding-step");
    if (select instanceof HTMLSelectElement) {
        select.value = String(boundedStep);
    }
    const labelEl = document.getElementById("super-onboarding-step-label");
    const titleEl = document.getElementById("super-onboarding-step-title");
    const copyEl = document.getElementById("super-onboarding-step-copy");
    if (labelEl) labelEl.textContent = meta.label;
    if (titleEl) titleEl.textContent = meta.title;
    if (copyEl) copyEl.textContent = meta.copy;
    document.querySelectorAll(".super-onboarding-panel").forEach(panel => {
        const panelStep = Number(panel.getAttribute("data-onboarding-step") || 0);
        panel.classList.toggle("is-active", panelStep === boundedStep);
    });
}

function resetSuperOnboardingDraft() {
    superAdminSelectedClubId = null;
    const ids = [
        "super-club-id",
        "super-club-name",
        "super-club-slug",
        "super-club-display-name",
        "super-club-email",
        "super-club-phone",
        "super-club-website",
        "super-club-location",
        "super-club-address-1",
        "super-club-address-2",
        "super-club-city",
        "super-club-region",
        "super-club-postal-code",
        "super-club-country",
        "super-logo-url",
        "super-hero-image-url",
        "super-brand-primary",
        "super-brand-secondary",
        "super-brand-accent",
        "super-brand-tagline",
        "super-annual-rounds",
        "super-annual-revenue",
        "super-target-golf-revenue",
        "super-target-members",
        "super-comm-announcement",
        "super-comm-news",
        "super-comm-message",
        "super-onboarding-admin-name",
        "super-onboarding-admin-email",
        "super-onboarding-admin-password",
        "super-club-status-text",
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value = "";
        }
    });
    const yearInput = document.getElementById("super-target-year");
    if (yearInput instanceof HTMLInputElement) {
        yearInput.value = String(new Date().getFullYear());
    }
    const pricingTemplate = document.getElementById("super-pricing-template");
    if (pricingTemplate instanceof HTMLSelectElement) {
        pricingTemplate.value = "country_club_standard";
    }
    const statusSelect = document.getElementById("super-club-status");
    if (statusSelect instanceof HTMLSelectElement) {
        statusSelect.value = "draft";
    }
    const demoSelect = document.getElementById("super-club-is-demo");
    if (demoSelect instanceof HTMLSelectElement) {
        demoSelect.value = "false";
    }
    document.querySelectorAll("#super-module-grid input[data-module-key]").forEach(el => {
        if (el instanceof HTMLInputElement) el.checked = false;
    });
    const checklist = document.getElementById("super-launch-checklist");
    if (checklist) checklist.innerHTML = "";
}

function populateSuperOnboarding(workspace = null) {
    const club = workspace?.club || {};
    const profile = workspace?.profile || {};
    const details = profile.details || {};
    const branding = profile.branding || {};
    const address = profile.address || {};
    const annualTargets = Array.isArray(workspace?.annual_targets) ? workspace.annual_targets : [];
    const operationalTargets = Array.isArray(workspace?.operational_targets) ? workspace.operational_targets : [];
    const staffRows = Array.isArray(workspace?.staff) ? workspace.staff : [];
    const adminUser = staffRows.find(row => String(row?.role || "").toLowerCase() === "admin") || {};
    const targetYear = Number(annualTargets[0]?.year || new Date().getFullYear());
    const annualRounds = annualTargets.find(row => String(row?.metric || "") === "rounds");
    const annualRevenue = annualTargets.find(row => String(row?.metric || "") === "revenue");
    const golfRevenueTarget = operationalTargets.find(row => String(row?.operation_key || "") === "golf" && String(row?.metric_key || "") === "revenue");
    const memberTarget = operationalTargets.find(row => String(row?.operation_key || "") === "members" && String(row?.metric_key || "") === "active_members");
    const readinessStepMap = {
        "club basics": 1,
        "branding": 2,
        "operations": 3,
        "pricing & targets": 4,
        "access & roles": 5,
        "communications": 6,
        "launch checklist": 7,
        "review & launch": 7,
    };
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value == null ? "" : String(value);
    };
    setValue("super-club-id", club.id || "");
    setValue("super-club-name", club.name || "");
    setValue("super-club-slug", club.slug || "");
    setValue("super-club-display-name", profile.display_name || "");
    setValue("super-club-email", details.contact_email || "");
    setValue("super-club-phone", details.contact_phone || "");
    setValue("super-club-website", details.website || "");
    setValue("super-club-location", details.location || "");
    setValue("super-club-address-1", address.line_1 || "");
    setValue("super-club-address-2", address.line_2 || "");
    setValue("super-club-city", address.city || "");
    setValue("super-club-region", address.region || "");
    setValue("super-club-postal-code", address.postal_code || "");
    setValue("super-club-country", address.country || "");
    setValue("super-logo-url", profile.logo_url || "");
    setValue("super-hero-image-url", profile.hero_image_url || "");
    setValue("super-brand-primary", branding.primary || "");
    setValue("super-brand-secondary", branding.secondary || "");
    setValue("super-brand-accent", branding.accent || "");
    setValue("super-brand-tagline", details.tagline || "");
    setValue("super-target-year", targetYear);
    setValue("super-annual-rounds", annualRounds?.annual_target || "");
    setValue("super-annual-revenue", annualRevenue?.annual_target || "");
    setValue("super-target-golf-revenue", golfRevenueTarget?.target_value || "");
    setValue("super-target-members", memberTarget?.target_value || workspace?.metrics?.members || "");
    setValue("super-club-status", club.status || "onboarding");
    setValue("super-club-is-demo", club.is_demo ? "true" : "false");
    setValue("super-onboarding-admin-name", adminUser.name || "");
    setValue("super-onboarding-admin-email", adminUser.email || "");
    const checklist = document.getElementById("super-launch-checklist");
    if (checklist) {
        const items = Array.isArray(workspace?.readiness?.checklist) ? workspace.readiness.checklist : [];
        checklist.innerHTML = items.map(item => `<div><strong>${escapeHtml(item.label || "")}</strong><br>${item.ready ? "Ready" : escapeHtml(item.hint || "")}</div>`).join("");
    }
    const suggestedStep = readinessStepMap[String(workspace?.readiness?.next_step || "").trim().toLowerCase()] || superAdminOnboardingStep;
    applySuperOnboardingStep(suggestedStep);
}

function renderSuperWorkspace(workspace = null) {
    superAdminWorkspaceCache = workspace;
    const summaryEl = document.getElementById("super-workspace-summary");
    const highlightsEl = document.getElementById("super-workspace-highlights");
    const checklistEl = document.getElementById("super-workspace-checklist");
    const staffEl = document.getElementById("super-workspace-staff");
    const commsEl = document.getElementById("super-workspace-comms");
    if (!workspace) {
        if (summaryEl) summaryEl.textContent = "Select a club to inspect its platform setup.";
        if (highlightsEl) highlightsEl.innerHTML = "";
        if (checklistEl) checklistEl.innerHTML = "";
        if (staffEl) staffEl.innerHTML = "";
        if (commsEl) commsEl.innerHTML = "";
        resetSuperOnboardingDraft();
        applySuperOnboardingStep(superAdminOnboardingStep);
        return;
    }
    const club = workspace.club || {};
    const readiness = workspace.readiness || {};
    if (summaryEl) {
        summaryEl.textContent = `${club.name || "Club"} is ${readinessStatusLabel(club.status || readiness.readiness_status || "")}. Next step: ${readiness.next_step || "review setup"}.`;
    }
    if (highlightsEl) {
        highlightsEl.innerHTML = [
            `<div><strong>Modules</strong><br>${(workspace.profile?.enabled_modules || []).join(", ") || "None configured"}</div>`,
            `<div><strong>Member experience</strong><br>${Number(workspace.metrics?.members || 0)} members, ${Number(workspace.metrics?.bookings_upcoming || 0)} upcoming bookings.</div>`,
            `<div><strong>Published communications</strong><br>${Number(workspace.metrics?.communications_published || 0)} items available in the member experience.</div>`,
        ].join("");
    }
    if (checklistEl) {
        const items = Array.isArray(readiness.checklist) ? readiness.checklist : [];
        checklistEl.innerHTML = items.map(item => `<div><strong>${escapeHtml(item.label || "")}</strong><br>${item.ready ? "Ready" : escapeHtml(item.hint || "")}</div>`).join("");
    }
    if (staffEl) {
        const rows = Array.isArray(workspace.staff) ? workspace.staff : [];
        staffEl.innerHTML = rows.map(row => `<div><strong>${escapeHtml(row.name || "")}</strong><br>${escapeHtml(row.role || "")} | ${escapeHtml(row.email || "")}</div>`).join("") || "<div>No staff configured yet.</div>";
    }
    if (commsEl) {
        const rows = Array.isArray(workspace.communications) ? workspace.communications : [];
        commsEl.innerHTML = rows.map(row => `<div><strong>${escapeHtml(row.title || "")}</strong><br>${escapeHtml(row.kind || "")} | ${escapeHtml(row.summary || "")}</div>`).join("") || "<div>No member-facing communications published yet.</div>";
    }
    populateSuperOnboarding(workspace);
}

async function loadSuperAdminCommandCenter({ silent = false } = {}) {
    try {
        superAdminCommandCenterCache = await apiGetJson("/api/super/command-center");
        superAdminCatalogCache = superAdminCommandCenterCache?.catalog || {};
        renderSuperAdminReadiness(superAdminCommandCenterCache);
        renderSuperNeedsAction(superAdminCommandCenterCache);
        renderSuperDemoArea(superAdminCommandCenterCache);
        renderSuperCatalog(superAdminCommandCenterCache);
        renderSuperClubsTable(superAdminCommandCenterCache);
        const summary = superAdminCommandCenterCache?.summary || {};
        const summaryEl = document.getElementById("super-command-summary");
        if (summaryEl) {
            summaryEl.textContent = `${Number(summary.live_clubs || 0)} live club(s), ${Number(summary.onboarding_clubs || 0)} in onboarding, and ${Number(summary.needs_action || 0)} requiring action.`;
        }
        return superAdminCommandCenterCache;
    } catch (error) {
        if (!silent) {
            toastError(`Failed to load command center: ${error.message || error}`);
        }
        return null;
    }
}

async function loadSuperClubWorkspace(clubId) {
    const resolvedId = Number(clubId || 0);
    if (!Number.isFinite(resolvedId) || resolvedId <= 0) {
        renderSuperWorkspace(null);
        return null;
    }
    try {
        superAdminSelectedClubId = resolvedId;
        localStorage.setItem("active_club_id", String(resolvedId));
        const workspace = await apiGetJson(`/api/super/clubs/${resolvedId}/workspace`);
        renderSuperWorkspace(workspace);
        return workspace;
    } catch (error) {
        toastError(`Failed to load club workspace: ${error.message || error}`);
        return null;
    }
}

function collectSuperClubSetupPayload(launch = false) {
    const checkedModules = Array.from(document.querySelectorAll("#super-module-grid input[data-module-key]:checked")).map(el => String(el.getAttribute("data-module-key") || "").trim()).filter(Boolean);
    const targetYear = Number(document.getElementById("super-target-year")?.value || new Date().getFullYear());
    const adminName = String(document.getElementById("super-onboarding-admin-name")?.value || "").trim();
    const adminEmail = String(document.getElementById("super-onboarding-admin-email")?.value || "").trim();
    const adminPassword = String(document.getElementById("super-onboarding-admin-password")?.value || "").trim();
    const payload = {
        club_id: Number(document.getElementById("super-club-id")?.value || superAdminSelectedClubId || 0) || null,
        club_name: String(document.getElementById("super-club-name")?.value || "").trim(),
        club_slug: String(document.getElementById("super-club-slug")?.value || "").trim(),
        display_name: String(document.getElementById("super-club-display-name")?.value || "").trim() || null,
        contact_email: String(document.getElementById("super-club-email")?.value || "").trim() || null,
        contact_phone: String(document.getElementById("super-club-phone")?.value || "").trim() || null,
        website: String(document.getElementById("super-club-website")?.value || "").trim() || null,
        location: String(document.getElementById("super-club-location")?.value || "").trim() || null,
        address_line_1: String(document.getElementById("super-club-address-1")?.value || "").trim() || null,
        address_line_2: String(document.getElementById("super-club-address-2")?.value || "").trim() || null,
        city: String(document.getElementById("super-club-city")?.value || "").trim() || null,
        region: String(document.getElementById("super-club-region")?.value || "").trim() || null,
        postal_code: String(document.getElementById("super-club-postal-code")?.value || "").trim() || null,
        country: String(document.getElementById("super-club-country")?.value || "").trim() || null,
        logo_url: String(document.getElementById("super-logo-url")?.value || "").trim() || null,
        hero_image_url: String(document.getElementById("super-hero-image-url")?.value || "").trim() || null,
        brand_primary: String(document.getElementById("super-brand-primary")?.value || "").trim() || null,
        brand_secondary: String(document.getElementById("super-brand-secondary")?.value || "").trim() || null,
        brand_accent: String(document.getElementById("super-brand-accent")?.value || "").trim() || null,
        tagline: String(document.getElementById("super-brand-tagline")?.value || "").trim() || null,
        enabled_modules: checkedModules,
        pricing_template: String(document.getElementById("super-pricing-template")?.value || "country_club_standard").trim(),
        status: launch ? "live" : String(document.getElementById("super-club-status")?.value || "onboarding").trim(),
        is_demo: String(document.getElementById("super-club-is-demo")?.value || "false").trim() === "true",
        annual_targets: {
            year: targetYear,
            rounds: Number(document.getElementById("super-annual-rounds")?.value || 0) || 0,
            revenue: Number(document.getElementById("super-annual-revenue")?.value || 0) || 0,
        },
        operational_targets: [
            {
                operation_key: "golf",
                metric_key: "revenue",
                target_value: Number(document.getElementById("super-target-golf-revenue")?.value || 0) || 0,
                unit: "currency",
            },
            {
                operation_key: "members",
                metric_key: "active_members",
                target_value: Number(document.getElementById("super-target-members")?.value || 0) || 0,
                unit: "members",
            },
        ],
        admin_user: adminEmail && adminPassword ? {
            name: adminName || "Club Admin",
            email: adminEmail,
            password: adminPassword,
            force_reset: true,
        } : null,
    };
    return payload;
}

function validateSuperClubSetupPayload(payload, { launch = false } = {}) {
    const issues = [];
    if (!payload.club_name || !payload.club_slug) {
        issues.push({ step: 1, message: "Club name and slug are required." });
    }
    if (launch && (!payload.display_name || !payload.contact_email || !payload.country)) {
        issues.push({ step: 1, message: "Display name, contact email, and country are required before launch." });
    }
    if (launch && (!payload.logo_url || !payload.brand_primary || !payload.brand_secondary)) {
        issues.push({ step: 2, message: "Launch-ready branding needs a logo and core brand colours." });
    }
    if (!Array.isArray(payload.enabled_modules) || !payload.enabled_modules.length) {
        issues.push({ step: 3, message: "Enable at least one operational module." });
    }
    if (launch && Number(payload.annual_targets?.rounds || 0) <= 0 && Number(payload.annual_targets?.revenue || 0) <= 0) {
        issues.push({ step: 4, message: "Set at least one annual target before launch." });
    }
    if (launch && (!payload.admin_user?.email || !payload.admin_user?.password)) {
        issues.push({ step: 5, message: "Create the first club admin before launch." });
    }
    if (launch) {
        const hasComms = [
            document.getElementById("super-comm-announcement")?.value,
            document.getElementById("super-comm-news")?.value,
            document.getElementById("super-comm-message")?.value,
        ].some(value => String(value || "").trim());
        if (!hasComms) {
            issues.push({ step: 6, message: "Add at least one member-facing communication before launch." });
        }
    }
    return issues;
}

async function saveSuperClubSetup({ launch = false } = {}) {
    const statusEl = document.getElementById("super-club-status-text");
    if (statusEl) statusEl.textContent = "";
    const payload = collectSuperClubSetupPayload(launch);
    const issues = validateSuperClubSetupPayload(payload, { launch });
    if (issues.length) {
        const firstIssue = issues[0];
        applySuperOnboardingStep(firstIssue.step);
        if (statusEl) statusEl.textContent = firstIssue.message;
        return;
    }
    try {
        const result = await apiGetJson("/api/super/clubs/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const clubId = Number(result?.club?.id || 0);
        if (clubId > 0) {
            superAdminSelectedClubId = clubId;
            localStorage.setItem("active_club_id", String(clubId));
            const clubIdField = document.getElementById("super-club-id");
            if (clubIdField) clubIdField.value = String(clubId);
            await ensureSuperClubCommunications();
            await loadSuperClubWorkspace(clubId);
        }
        if (statusEl) statusEl.textContent = launch ? "Club saved and marked live." : "Club setup saved.";
        await loadSuperAdminCommandCenter({ silent: true });
    } catch (error) {
        if (statusEl) statusEl.textContent = error?.message || "Failed to save club setup";
    }
}

async function ensureSuperClubCommunications() {
    const announcementTitle = String(document.getElementById("super-comm-announcement")?.value || "").trim();
    const newsTitle = String(document.getElementById("super-comm-news")?.value || "").trim();
    const memberMessage = String(document.getElementById("super-comm-message")?.value || "").trim();
    const clubId = Number(document.getElementById("super-club-id")?.value || superAdminSelectedClubId || 0);
    if ((!announcementTitle && !newsTitle && !memberMessage) || clubId <= 0) return;
    const existing = await apiGetJson(`/api/admin/communications?status=all&limit=50&club_id=${clubId}`);
    const rows = Array.isArray(existing?.communications) ? existing.communications : [];
    const titles = new Set(rows.map(row => String(row?.title || "").trim().toLowerCase()).filter(Boolean));
    const createIfMissing = async (title, kind, body, summary = "") => {
        if (!title || titles.has(title.toLowerCase())) return;
        await apiGetJson(`/api/admin/communications?club_id=${clubId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                kind,
                audience: "members",
                status: "published",
                title,
                summary: summary || title,
                body: body || title,
                pinned: kind === "announcement",
            }),
        });
    };
    await createIfMissing(announcementTitle, "announcement", `${announcementTitle} is now live in the member app.`, announcementTitle);
    await createIfMissing(newsTitle, "news", `${newsTitle} has been added to the club news feed.`, newsTitle);
    await createIfMissing(memberMessage ? "Member app welcome" : "", "message", memberMessage, "Welcome message");
}

async function initSuperAdminContext() {
    superAdminView = normalizeSuperAdminView(superAdminView || "overview", "overview");
    setSuperAdminSectionVisibility(superAdminView);
    await loadSuperAdminCommandCenter({ silent: true });
    const rememberedClub = Number(localStorage.getItem("active_club_id") || 0);
    const demoClubId = Number(superAdminCommandCenterCache?.demo_environment?.club_id || 0);
    const defaultClubId = rememberedClub || demoClubId || Number(superAdminCommandCenterCache?.clubs?.[0]?.id || 0);
    if (defaultClubId > 0) {
        await loadSuperClubWorkspace(defaultClubId);
    } else {
        renderSuperWorkspace(null);
    }
    setSuperAdminSectionVisibility(superAdminView);
}

function setupSuperAdminControls() {
    document.querySelectorAll(".super-subnav-btn").forEach(btn => {
        btn.addEventListener("click", () => navigateToAdminPage("super-admin", { view: btn.dataset.superTarget || "overview" }));
    });
    document.getElementById("super-refresh-command-center")?.addEventListener("click", () => loadSuperAdminCommandCenter());
    document.getElementById("super-club-search")?.addEventListener("input", () => renderSuperClubsTable(superAdminCommandCenterCache));
    document.getElementById("super-club-status-filter")?.addEventListener("change", () => renderSuperClubsTable(superAdminCommandCenterCache));
    document.getElementById("super-cta-create-club")?.addEventListener("click", () => {
        resetSuperOnboardingDraft();
        applySuperOnboardingStep(1);
        navigateToAdminPage("super-admin", { view: "onboarding" });
    });
    document.getElementById("super-cta-open-demo")?.addEventListener("click", async () => {
        navigateToAdminPage("super-admin", { view: "demo" });
        const demoId = Number(superAdminCommandCenterCache?.demo_environment?.club_id || 0);
        if (demoId > 0) await loadSuperClubWorkspace(demoId);
    });
    document.getElementById("super-cta-resume-onboarding")?.addEventListener("click", () => navigateToAdminPage("super-admin", { view: "onboarding" }));
    document.getElementById("super-cta-manage-clubs")?.addEventListener("click", () => navigateToAdminPage("super-admin", { view: "clubs" }));
    document.getElementById("super-cta-review-issues")?.addEventListener("click", () => navigateToAdminPage("super-admin", { view: "health" }));
    document.getElementById("super-save-draft-btn")?.addEventListener("click", () => saveSuperClubSetup({ launch: false }));
    document.getElementById("super-launch-club-btn")?.addEventListener("click", () => saveSuperClubSetup({ launch: true }));
    document.getElementById("super-create-staff-btn")?.addEventListener("click", () => superCreateStaff());
    document.getElementById("super-refresh-staff-btn")?.addEventListener("click", () => superRefreshStaff());
    document.getElementById("super-ensure-demo-btn")?.addEventListener("click", async () => {
        await apiGetJson("/api/super/demo/ensure", { method: "POST" });
        await loadSuperAdminCommandCenter({ silent: true });
        const demoId = Number(superAdminCommandCenterCache?.demo_environment?.club_id || 0);
        if (demoId > 0) await loadSuperClubWorkspace(demoId);
    });
    document.getElementById("super-open-demo-workspace-btn")?.addEventListener("click", async () => {
        const demoId = Number(superAdminCommandCenterCache?.demo_environment?.club_id || 0);
        if (demoId > 0) {
            navigateToAdminPage("super-admin", { view: "clubs" });
            await loadSuperClubWorkspace(demoId);
        }
    });
    document.getElementById("super-onboarding-prev")?.addEventListener("click", () => {
        const select = document.getElementById("super-onboarding-step");
        if (!(select instanceof HTMLSelectElement)) return;
        applySuperOnboardingStep(Math.max(1, Number(select.value || 1) - 1));
    });
    document.getElementById("super-onboarding-next")?.addEventListener("click", () => {
        const select = document.getElementById("super-onboarding-step");
        if (!(select instanceof HTMLSelectElement)) return;
        applySuperOnboardingStep(Math.min(7, Number(select.value || 1) + 1));
    });
    document.getElementById("super-onboarding-step")?.addEventListener("change", (event) => {
        applySuperOnboardingStep(Number(event.target?.value || 1) || 1);
    });
    document.addEventListener("click", async (event) => {
        const trigger = event.target instanceof HTMLElement ? event.target.closest("[data-super-select-club]") : null;
        if (!(trigger instanceof HTMLElement)) return;
        const clubId = Number(trigger.getAttribute("data-super-select-club") || 0);
        if (clubId > 0) {
            await loadSuperClubWorkspace(clubId);
            navigateToAdminPage("super-admin", { view: "clubs" }, { updateHistory: true });
        }
    });
    applySuperOnboardingStep(superAdminOnboardingStep);
}

async function superRefreshPlatformReadiness() {
    await loadPlatformStatus();
    await loadSuperAdminCommandCenter({ silent: true });
}

// Navigation
function operationLabel(key) {
    const value = String(key || "").trim().toLowerCase();
    if (value === "pro_shop") return "Pro Shop";
    if (value === "golf") return "Golf";
    if (value === "tennis") return "Tennis";
    if (value === "bowls") return "Bowls";
    if (value === "squash") return "Squash";
    return "General";
}

function isOperationalPeopleContext() {
    return peopleContextMode === "operation" && peopleView === "members" && ["golf", "tennis", "bowls", "squash", "pro_shop"].includes(peopleAreaFilter);
}

function toggleFilterControl(control, visible) {
    if (!(control instanceof HTMLElement)) return;
    control.style.display = visible ? "" : "none";
    const label = control.previousElementSibling;
    if (label instanceof HTMLLabelElement) {
        label.style.display = visible ? "" : "none";
    }
}

function currentPeoplePageTitle() {
    if (peopleView === "guests") return "Guests";
    if (peopleView === "staff") return "Staff";
    if (isOperationalPeopleContext()) return `${operationLabel(peopleAreaFilter)} Members`;
    return "People";
}

function currentPeoplePageSubtitle() {
    if (isOperationalPeopleContext()) {
        return `${operationLabel(peopleAreaFilter)} members only.`;
    }
    if (peopleView === "staff") return "Shared staff directory.";
    if (peopleView === "guests") return "Guest activity and contact history.";
    return "Members, staff, and guests. Billing and debtor contacts live under Account Customers.";
}

function syncPeoplePageChrome() {
    const titleEl = document.getElementById("page-title");
    if (titleEl && currentActivePage === "players") {
        titleEl.textContent = currentPeoplePageTitle();
    }
    const subtitle = document.getElementById("people-subtitle");
    if (subtitle) {
        subtitle.textContent = currentPeoplePageSubtitle();
    }
}

function applyPeoplePreset({ view = null, operation = null, quickFilter = null, status = null, contextMode = null } = {}) {
    if (view) {
        peopleView = String(view).toLowerCase();
    }
    if (operation) {
        peopleAreaFilter = String(operation).toLowerCase();
    }
    if (quickFilter) {
        peopleQuickFilter = String(quickFilter).toLowerCase();
    }
    if (status) {
        peopleStatusFilter = String(status).toLowerCase();
    }
    if (contextMode) {
        peopleContextMode = String(contextMode).toLowerCase() === "operation" ? "operation" : "general";
    } else if (peopleView !== "members") {
        peopleContextMode = "general";
    }

    document.querySelectorAll("#players .people-btn").forEach((btn) => {
        btn.classList.toggle("active", String(btn.dataset.view || "").toLowerCase() === peopleView);
    });
    const areaFilter = document.getElementById("people-area-filter");
    if (areaFilter instanceof HTMLSelectElement) {
        areaFilter.value = peopleAreaFilter;
    }
    const statusFilter = document.getElementById("people-status-filter");
    if (statusFilter instanceof HTMLSelectElement) {
        statusFilter.value = peopleStatusFilter;
    }
    const quickFilterSelect = document.getElementById("people-quick-filter");
    if (quickFilterSelect instanceof HTMLSelectElement) {
        quickFilterSelect.value = peopleQuickFilter;
    }
    const guestFilter = document.getElementById("guest-type-filter");
    if (guestFilter) guestFilter.style.display = peopleView === "guests" ? "" : "none";
    const operationalContext = isOperationalPeopleContext();
    const toggleButtons = document.querySelector("#players .people-toggle");
    if (toggleButtons instanceof HTMLElement) {
        toggleButtons.style.display = operationalContext ? "none" : "";
    }
    if (areaFilter instanceof HTMLSelectElement) {
        areaFilter.value = peopleAreaFilter;
        toggleFilterControl(areaFilter, peopleView !== "guests" && !operationalContext);
    }
    if (statusFilter instanceof HTMLSelectElement) {
        statusFilter.value = peopleStatusFilter;
        toggleFilterControl(statusFilter, peopleView !== "guests");
    }
    if (quickFilterSelect instanceof HTMLSelectElement) {
        toggleFilterControl(quickFilterSelect, !operationalContext && peopleView !== "guests" && peopleView !== "staff");
    }
    const sortSelect = document.getElementById("people-sort");
    if (sortSelect instanceof HTMLSelectElement) {
        toggleFilterControl(sortSelect, true);
    }
    const searchInput = document.getElementById("people-search");
    if (searchInput instanceof HTMLInputElement) {
        searchInput.placeholder = operationalContext
            ? `Search ${operationLabel(peopleAreaFilter).toLowerCase()} members...`
            : "Search name / email / phone / category...";
    }
    const canEdit = currentUserRole === "admin" || currentUserRole === "super_admin";
    const addBtn = document.getElementById("people-add-btn");
    if (addBtn) {
        if (!canEdit || operationalContext) {
            addBtn.style.display = "none";
        } else if (peopleView === "members") {
            addBtn.textContent = "Add Member";
            addBtn.style.display = "";
        } else if (peopleView === "staff") {
            addBtn.textContent = "Add Staff";
            addBtn.style.display = "";
        } else {
            addBtn.style.display = "none";
        }
    }
    syncPeoplePageChrome();
}

function applyRoutePresets(pageName, routeOptions = {}) {
    const route = normalizeAdminRoute(pageName, routeOptions);
    if (route.page === "dashboard") {
        const nextStream = normalizeDashboardStreamKey(route.stream || "all", "all");
        dashboardMenuContext = nextStream === "all" ? "main" : "operation";
        setDashboardStreamViewState(nextStream, { persist: true, source: "sidebar" });
    } else if (route.page === "bookings") {
        bookingPeriod = normalizeBookingRoutePeriod(route.period || bookingPeriod || "day");
        bookingIntegrityFilter = normalizeBookingIntegrityFilter(route.integrity || bookingIntegrityFilter || "all");
        applyBookingFilterUiState();
    } else if (route.page === "players") {
        applyPeoplePreset({
            view: route.view || peopleView,
            operation: route.operation || peopleAreaFilter,
            contextMode: (route.view || "members") === "members" && ["golf", "tennis", "bowls", "squash", "pro_shop"].includes(String(route.operation || "all").toLowerCase())
                ? "operation"
                : "general",
        });
    } else if (route.page === "super-admin") {
        superAdminView = normalizeSuperAdminView(route.view || superAdminView || "overview", "overview");
    }
    return route;
}

function loadAdminPageData(pageName) {
    switch (pageName) {
        case "dashboard":
            loadDashboard();
            break;
        case "bookings":
            loadBookings();
            break;
        case "players":
            loadPlayers();
            break;
        case "account-customers-page":
            loadAccountCustomersPage();
            break;
        case "golf-days-page":
            loadGolfDayBookingsPage();
            break;
        case "revenue":
            loadRevenue();
            break;
        case "operations-config":
            loadOpsImportSettings();
            loadTargetModelSettings({ silent: true });
            loadPricingMatrix({ silent: true });
            break;
        case "pro-shop":
            initProShopPage();
            break;
        case "tee-times":
            loadTeeTimes();
            break;
        case "ledger":
            loadLedger();
            break;
        case "cashbook":
            initCashbook();
            break;
        case "super-admin":
            initSuperAdminContext();
            superRefreshStaff();
            superRefreshPlatformReadiness();
            break;
        default:
            break;
    }
}

function syncAdminRouteLocation(pageName, routeOptions = {}, { replace = false } = {}) {
    const hash = buildAdminRouteHash(pageName, routeOptions);
    if (!hash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl === currentUrl) return;
    if (replace) {
        window.history.replaceState(null, "", nextUrl);
    } else {
        window.history.pushState(null, "", nextUrl);
    }
}

function applyAdminRouteFromLocation({ replaceHistory = false } = {}) {
    const route = parseAdminRouteHash(window.location.hash);
    if (!route || !route.page) {
        navigateToAdminPage(fallbackPageForRole(), {}, { updateHistory: true, replaceHistory: true });
        return;
    }
    if (!isPageAllowedForRole(route.page) || PLACEHOLDER_OPERATION_PAGES.includes(route.page)) {
        navigateToAdminPage(fallbackPageForRole(), {}, { updateHistory: true, replaceHistory: true });
        return;
    }
    navigateToAdminPage(route.page, route, { updateHistory: false, replaceHistory });
}

function setupNavigation() {
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            if (item.classList.contains("logout")) {
                logout();
                return;
            }

            e.preventDefault();
            const page = item.dataset.page;
            const streamPreset = String(item.dataset.dashboardStream || "").toLowerCase();
            const peoplePresetView = String(item.dataset.peopleView || "").toLowerCase();
            const peoplePresetOperation = String(item.dataset.peopleOperation || "").toLowerCase();
            const superPresetView = String(item.dataset.superView || "").toLowerCase();
            if (!page) return;
            if (!isPageAllowedForRole(page) || PLACEHOLDER_OPERATION_PAGES.includes(page)) return;
            navigateToAdminPage(page, {
                stream: streamPreset || "all",
                view: page === "super-admin" ? (superPresetView || superAdminView) : (peoplePresetView || peopleView),
                operation: peoplePresetOperation || peopleAreaFilter,
            });
        });
    });
}

async function loadAccountCustomersCache({ silent = false } = {}) {
    try {
        const token = localStorage.getItem("token");
        if (!token) return [];
        const data = await apiGetJson("/api/admin/account-customers?active_only=true", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(data?.account_customers) ? data.account_customers : [];
        accountCustomersCache = rows;
        const datalist = document.getElementById("account-customer-codes");
        if (datalist) {
            datalist.innerHTML = rows
                .map(row => {
                    const code = String(row?.account_code || "").trim();
                    if (!code) return "";
                    const label = String(row?.name || "").trim();
                    const value = label ? `${code} - ${label}` : code;
                    return `<option value="${escapeHtml(code)}">${escapeHtml(value)}</option>`;
                })
                .join("");
        }
        return rows;
    } catch (error) {
        if (!silent) {
            console.error("Failed to load account customers:", error);
            toastError(`Failed to load account customers: ${error.message || error}`);
        }
        accountCustomersCache = [];
        return [];
    }
}

function normalizeAccountCodeInput(raw) {
    const bookingUtils = window.GreenLinkAdminBookings || {};
    if (typeof bookingUtils.normalizeAccountCode === "function") {
        return bookingUtils.normalizeAccountCode(raw);
    }
    const value = String(raw || "").trim();
    if (!value) return "";
    if (value.includes(" - ")) {
        return value.split(" - ")[0].trim();
    }
    return value;
}

function findAccountCustomerByCode(accountCode) {
    const accountUtils = window.GreenLinkAdminAccountCustomers || {};
    if (typeof accountUtils.findByCode === "function") {
        return accountUtils.findByCode(accountCustomersCache, accountCode);
    }
    const code = normalizeAccountCodeInput(accountCode).toLowerCase();
    if (!code) return null;
    return accountCustomersCache.find((row) => String(row?.account_code || "").trim().toLowerCase() === code) || null;
}

function setupUmhlaliOperationalSync() {
    const card = document.getElementById("ops-launch-sync-card");
    const runBtn = document.getElementById("ops-umhlali-sync-btn");
    const forceEl = document.getElementById("ops-umhlali-sync-force");
    const statusEl = document.getElementById("ops-umhlali-sync-status");
    if (!(runBtn instanceof HTMLButtonElement)) return;
    apiGetJson("/api/admin/club-profile")
        .then(profile => {
            const slug = String(profile?.club_slug || "").trim().toLowerCase();
            const name = String(profile?.club_name || "").trim().toLowerCase();
            const isLegacyLaunchClub = slug.includes("umhlali") || name.includes("umhlali");
            if (card) card.style.display = isLegacyLaunchClub ? "" : "none";
        })
        .catch(() => {
            if (card) card.style.display = "none";
        });
    runBtn.addEventListener("click", async () => {
        const force = Boolean(forceEl?.checked);
        runBtn.disabled = true;
        if (statusEl) statusEl.textContent = "Running legacy launch sync...";
        try {
            const token = localStorage.getItem("token");
            const data = await fetchJson(
                `${API_BASE}/api/admin/imports/umhlali-operational-sync?force=${force ? "true" : "false"}`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            const status = String(data?.status || "ok");
            const members = Number(data?.members?.inserted || 0) + Number(data?.members?.updated || 0);
            const accounts = Number(data?.accounts?.inserted || 0) + Number(data?.accounts?.updated || 0);
            const golfDay = Number(data?.golf_day?.inserted || 0) + Number(data?.golf_day?.updated || 0);
            if (statusEl) {
                statusEl.textContent = `Sync status: ${status}. Members ${members}, Accounts ${accounts}, Golf Days ${golfDay}.`;
            }
            toastSuccess("Legacy launch sync completed.");
            await loadAccountCustomersCache({ silent: true });
            if (currentActivePage === "players") loadPlayers();
        } catch (error) {
            console.error("Legacy launch sync failed:", error);
            if (statusEl) statusEl.textContent = `Sync failed: ${error.message || error}`;
            toastError(`Legacy launch sync failed: ${error.message || error}`);
        } finally {
            runBtn.disabled = false;
        }
    });
}

function setupPageShortcuts() {
    const bookingsOpenTeeSheetBtn = document.getElementById("bookings-open-tee-sheet-btn");
    bookingsOpenTeeSheetBtn?.addEventListener("click", () => navigateToAdminPage("tee-times"));

    const revenueOpenImportsBtn = document.getElementById("revenue-open-imports-btn");
    revenueOpenImportsBtn?.addEventListener("click", () => navigateToAdminPage("operations-config"));

    const opsOpenRevenueBtn = document.getElementById("ops-open-revenue-btn");
    opsOpenRevenueBtn?.addEventListener("click", () => navigateToAdminPage("revenue"));

    const opsOpenPeopleBtn = document.getElementById("ops-open-people-btn");
    opsOpenPeopleBtn?.addEventListener("click", () => {
        applyPeoplePreset({ view: "members", operation: "all", contextMode: "general" });
        navigateToAdminPage("players");
    });
}

function showPage(pageName) {
    const requestedPage = String(pageName || "").trim();
    const nextPage = isPageAllowedForRole(requestedPage) && !PLACEHOLDER_OPERATION_PAGES.includes(requestedPage)
        ? requestedPage
        : fallbackPageForRole();
    const pageEl = document.getElementById(nextPage);
    if (!pageEl) return;

    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    pageEl.classList.add("active");
    currentActivePage = nextPage;

    // Update title
    const titles = {
        dashboard: "Club Overview",
        "operations-config": currentUserRole === "super_admin" ? "Onboarding & Imports" : "Imports & Setup",
        bookings: "Bookings",
        players: currentPeoplePageTitle(),
        "account-customers-page": "Account Customers",
        "golf-days-page": "Golf Day Bookings",
        "pro-shop": "Pro Shop Sales",
        revenue: "Revenue & Reconciliation",
        "tee-times": "Tee Sheet",
        ledger: "Payment Audit",
        cashbook: "Export & Day Close",
        "super-admin": {
            overview: "Platform Overview",
            clubs: "Club Portfolio",
            onboarding: "Club Onboarding",
            demo: "Demo Environment",
            users: "Users & Roles",
            catalog: "Operations Catalog",
            templates: "Templates & Defaults",
            health: "Platform Health",
            settings: "Platform Settings",
        }[normalizeSuperAdminView(superAdminView || "overview", "overview")] || "Platform Overview",
    };
    document.getElementById("page-title").textContent = titles[nextPage] || nextPage;
    if (nextPage === "super-admin") {
        setSuperAdminSectionVisibility(superAdminView);
    }

    if (nextPage === "dashboard" && dashboardDataCache) {
        applyDashboardEntryVisibility();
        applyDashboardStreamButtonState();
        applyDashboardPeriodButtonState();
        applyDashboardStreamView(dashboardDataCache);
        if (operationalAlertsCache) {
            renderOperationalAlerts(operationalAlertsCache, { cached: true });
        }
    }

}

function setupManagementPageControls() {
    document.getElementById("account-customers-refresh-btn")?.addEventListener("click", () => loadAccountCustomersPage());
    document.getElementById("account-customers-search")?.addEventListener("input", () => loadAccountCustomersPage());
    document.getElementById("account-customers-operation")?.addEventListener("change", () => loadAccountCustomersPage());
    document.getElementById("account-customers-status")?.addEventListener("change", () => loadAccountCustomersPage());
    document.getElementById("golf-days-refresh-btn")?.addEventListener("click", () => loadGolfDayBookingsPage());
    document.getElementById("golf-days-search")?.addEventListener("input", () => loadGolfDayBookingsPage());
    document.getElementById("golf-days-status")?.addEventListener("change", () => loadGolfDayBookingsPage());
}

function navigateToAdminPage(pageName, routeOptions = {}, navigationOptions = {}) {
    const requested = String(pageName || "").trim();
    const target = isPageAllowedForRole(requested) && !PLACEHOLDER_OPERATION_PAGES.includes(requested)
        ? requested
        : fallbackPageForRole();
    if (!target) return;
    cancelHeavyAdminRequests(target);
    const route = applyRoutePresets(target, routeOptions);
    setActiveNavItemForRoute(target, route);
    showPage(target);
    markAdminShellReady();
    loadAdminPageData(target);
    if (navigationOptions.updateHistory !== false) {
        syncAdminRouteLocation(target, route, { replace: navigationOptions.replaceHistory === true });
    }
}

function setupAiAssistantActions() {
    const root = document.getElementById("ai-assistant-card");
    if (!(root instanceof HTMLElement)) return;
    root.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest("button[data-ai-nav]");
        if (!(button instanceof HTMLButtonElement)) return;
        const page = String(button.dataset.aiNav || "").trim();
        if (!page) return;
        const routeOptions = {};
        const period = String(button.dataset.aiPeriod || "").trim();
        const integrity = String(button.dataset.aiIntegrity || "").trim();
        if (period) routeOptions.period = period;
        if (integrity) routeOptions.integrity = integrity;
        navigateToAdminPage(page, routeOptions);
    });
}

function setupDashboardStreamFilters() {
    const buttons = document.querySelectorAll(".dashboard-stream-btn");
    if (!buttons.length) return;
    const stored = String(localStorage.getItem("dashboard_stream_view") || "").toLowerCase();
    setDashboardStreamViewState(normalizeDashboardStreamKey(stored, "all"), { persist: false, source: "stored" });

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const nextStream = String(btn.dataset.stream || "all").toLowerCase();
            setDashboardStreamViewState(nextStream, { persist: true, source: "toggle" });
        });
    });
}

function setupDashboardPeriodFilters() {
    const buttons = document.querySelectorAll(".dashboard-period-btn");
    if (!buttons.length) return;
    const valid = new Set(["day", "week", "month", "ytd"]);
    const stored = String(localStorage.getItem("dashboard_period_view") || "").toLowerCase();
    setDashboardPeriodViewState(valid.has(stored) ? stored : "day", { persist: false });

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const next = String(btn.dataset.period || "day").toLowerCase();
            setDashboardPeriodViewState(next, { persist: true });
        });
    });
}

function setDashboardPeriodViewState(period, options = {}) {
    const valid = new Set(["day", "week", "month", "ytd"]);
    dashboardPeriodView = valid.has(String(period || "").toLowerCase()) ? String(period || "").toLowerCase() : "day";
    if (options.persist !== false) {
        localStorage.setItem("dashboard_period_view", dashboardPeriodView);
    }
    applyDashboardPeriodButtonState();
    if (dashboardDataCache) {
        applyDashboardStreamView(dashboardDataCache);
    }
}

function applyDashboardPeriodButtonState() {
    document.querySelectorAll(".dashboard-period-btn").forEach(btn => {
        btn.classList.toggle("active", String(btn.dataset.period || "day") === dashboardPeriodView);
    });
}

function applyDashboardEntryVisibility() {
    const card = document.querySelector(".dashboard-stream-card");
    if (!(card instanceof HTMLElement)) return;
    card.style.display = dashboardMenuContext === "main" ? "" : "none";
}

function setDashboardStreamViewState(stream, options = {}) {
    const next = normalizeDashboardStreamKey(stream, "all");
    const persist = options.persist !== false;
    const source = String(options.source || "").toLowerCase();

    dashboardStreamView = next;
    if (source === "sidebar") {
        dashboardStreamPreset = next;
    } else if (source === "toggle") {
        dashboardStreamPreset = "custom";
    } else if (source === "stored") {
        dashboardStreamPreset = next === "all" ? "all" : "custom";
    }
    if (persist) {
        localStorage.setItem("dashboard_stream_view", dashboardStreamView);
    }
    applyDashboardEntryVisibility();
    applyDashboardStreamButtonState();
    if (dashboardDataCache) {
        applyDashboardStreamView(dashboardDataCache);
    }
}

function applyDashboardStreamButtonState() {
    const card = document.querySelector(".dashboard-stream-card");
    const buttons = document.querySelectorAll(".dashboard-stream-btn");
    if (card) {
        card.classList.remove("locked");
    }
    buttons.forEach(btn => {
        btn.disabled = false;
        btn.classList.toggle("active", String(btn.dataset.stream || "all") === dashboardStreamView);
    });
}

function resolveDashboardStreamMetrics(data, streamKey) {
    const streams = (data && typeof data === "object" && data.revenue_streams && typeof data.revenue_streams === "object")
        ? data.revenue_streams
        : {};

    const fallback = {
        all: {
            label: "All Operations",
            total_revenue: safeNumber(data?.total_revenue),
            today_revenue: safeNumber(data?.today_revenue),
            week_revenue: safeNumber(data?.week_revenue),
            today_transactions: 0,
            week_transactions: 0,
            avg_ticket_week: 0,
            week_vs_prior_week: null,
        },
        golf: {
            label: "Golf",
            total_revenue: safeNumber(data?.golf_revenue_total),
            today_revenue: safeNumber(data?.golf_revenue_today),
            week_revenue: safeNumber(data?.golf_revenue_week),
            today_transactions: 0,
            week_transactions: 0,
            avg_ticket_week: 0,
            week_vs_prior_week: null,
        },
        pro_shop: {
            label: "Pro Shop",
            total_revenue: safeNumber(data?.pro_shop_revenue_total),
            today_revenue: safeNumber(data?.pro_shop_revenue_today),
            week_revenue: safeNumber(data?.pro_shop_revenue_week),
            today_transactions: 0,
            week_transactions: 0,
            avg_ticket_week: 0,
            week_vs_prior_week: null,
        },
        other: {
            label: "Other Operations",
            total_revenue: safeNumber(data?.other_revenue_total),
            today_revenue: safeNumber(data?.other_revenue_today),
            week_revenue: safeNumber(data?.other_revenue_week),
            today_transactions: 0,
            week_transactions: 0,
            avg_ticket_week: 0,
            week_vs_prior_week: null,
        },
        pub: { label: "Pub", total_revenue: 0, today_revenue: 0, week_revenue: 0, today_transactions: 0, week_transactions: 0, avg_ticket_week: 0, week_vs_prior_week: null },
        bowls: { label: "Bowls", total_revenue: 0, today_revenue: 0, week_revenue: 0, today_transactions: 0, week_transactions: 0, avg_ticket_week: 0, week_vs_prior_week: null },
    };

    const key = normalizeDashboardStreamKey(streamKey, "all");
    let selected = streams[key] || fallback[key] || fallback.all;

    if (key === "all") {
        const periodKeys = ["day", "week", "month", "ytd"];
        const aggregatePeriods = Object.fromEntries(periodKeys.map(periodKey => [periodKey, {
            revenue: 0,
            transactions: 0,
            avg_ticket: 0,
            prior_revenue: 0,
            vs_prior: null,
        }]));

        const aggregateSource = primaryOperationRows().map(entry => streams[entry.key] || fallback[entry.key] || {});
        let totalRevenue = 0;

        aggregateSource.forEach(source => {
            totalRevenue += safeNumber(source.total_revenue);
            periodKeys.forEach(periodKey => {
                const sourcePeriods = (source && typeof source.periods === "object" && source.periods) ? source.periods : {};
                const sourcePeriod = (sourcePeriods && typeof sourcePeriods[periodKey] === "object") ? sourcePeriods[periodKey] : {};
                const revenueFallback = periodKey === "day"
                    ? safeNumber(source.today_revenue)
                    : periodKey === "week"
                        ? safeNumber(source.week_revenue)
                        : periodKey === "month"
                            ? safeNumber(source.month_revenue ?? source.week_revenue)
                            : safeNumber(source.ytd_revenue ?? source.month_revenue ?? source.week_revenue);
                const txFallback = periodKey === "day"
                    ? safeNumber(source.today_transactions)
                    : periodKey === "week"
                        ? safeNumber(source.week_transactions)
                        : periodKey === "month"
                            ? safeNumber(source.month_transactions ?? source.week_transactions)
                            : safeNumber(source.ytd_transactions ?? source.month_transactions ?? source.week_transactions);
                aggregatePeriods[periodKey].revenue += safeNumber(sourcePeriod.revenue ?? revenueFallback);
                aggregatePeriods[periodKey].transactions += safeNumber(sourcePeriod.transactions ?? txFallback);
                aggregatePeriods[periodKey].prior_revenue += safeNumber(sourcePeriod.prior_revenue);
            });
        });

        periodKeys.forEach(periodKey => {
            const row = aggregatePeriods[periodKey];
            row.avg_ticket = row.transactions > 0 ? (row.revenue / row.transactions) : 0;
            row.vs_prior = row.prior_revenue > 0 ? ((row.revenue - row.prior_revenue) / row.prior_revenue) : null;
        });

        selected = {
            label: "All Operations",
            total_revenue: totalRevenue,
            today_revenue: aggregatePeriods.day.revenue,
            week_revenue: aggregatePeriods.week.revenue,
            today_transactions: aggregatePeriods.day.transactions,
            week_transactions: aggregatePeriods.week.transactions,
            avg_ticket_week: aggregatePeriods.week.avg_ticket,
            week_vs_prior_week: aggregatePeriods.week.vs_prior,
            periods: aggregatePeriods,
        };
    }
    const rawPeriods = (selected && typeof selected.periods === "object" && selected.periods)
        ? selected.periods
        : {};
    const fallbackPeriods = {
        day: {
            revenue: safeNumber(selected.today_revenue),
            transactions: safeNumber(selected.today_transactions),
            avg_ticket: 0,
            vs_prior: Number.isFinite(Number(selected.day_vs_prior_day)) ? Number(selected.day_vs_prior_day) : null,
            prior_revenue: 0,
        },
        week: {
            revenue: safeNumber(selected.week_revenue),
            transactions: safeNumber(selected.week_transactions),
            avg_ticket: safeNumber(selected.avg_ticket_week),
            vs_prior: Number.isFinite(Number(selected.week_vs_prior_week)) ? Number(selected.week_vs_prior_week) : null,
            prior_revenue: 0,
        },
        month: {
            revenue: safeNumber(selected.month_revenue ?? selected.week_revenue),
            transactions: safeNumber(selected.month_transactions ?? selected.week_transactions),
            avg_ticket: safeNumber(selected.avg_ticket_month),
            vs_prior: Number.isFinite(Number(selected.month_vs_prior_month)) ? Number(selected.month_vs_prior_month) : null,
            prior_revenue: 0,
        },
        ytd: {
            revenue: safeNumber(selected.ytd_revenue ?? selected.month_revenue ?? selected.week_revenue),
            transactions: safeNumber(selected.ytd_transactions ?? selected.month_transactions ?? selected.week_transactions),
            avg_ticket: safeNumber(selected.avg_ticket_ytd ?? selected.avg_ticket_month),
            vs_prior: Number.isFinite(Number(selected.ytd_vs_prior_ytd)) ? Number(selected.ytd_vs_prior_ytd) : null,
            prior_revenue: 0,
        }
    };
    const periods = {};
    ["day", "week", "month", "ytd"].forEach(periodKey => {
        const raw = (rawPeriods && typeof rawPeriods[periodKey] === "object") ? rawPeriods[periodKey] : {};
        const fallbackPeriod = fallbackPeriods[periodKey];
        periods[periodKey] = {
            revenue: safeNumber(raw?.revenue ?? fallbackPeriod.revenue),
            transactions: safeNumber(raw?.transactions ?? fallbackPeriod.transactions),
            avg_ticket: safeNumber(raw?.avg_ticket ?? fallbackPeriod.avg_ticket),
            vs_prior: Number.isFinite(Number(raw?.vs_prior)) ? Number(raw.vs_prior) : fallbackPeriod.vs_prior,
            prior_revenue: safeNumber(raw?.prior_revenue ?? fallbackPeriod.prior_revenue),
        };
    });

    return {
        label: String(selected.label || fallback[key]?.label || "Operations"),
        total_revenue: safeNumber(selected.total_revenue),
        today_revenue: safeNumber(selected.today_revenue),
        week_revenue: safeNumber(selected.week_revenue),
        today_transactions: safeNumber(selected.today_transactions),
        week_transactions: safeNumber(selected.week_transactions),
        avg_ticket_week: safeNumber(selected.avg_ticket_week),
        week_vs_prior_week: Number.isFinite(Number(selected.week_vs_prior_week)) ? Number(selected.week_vs_prior_week) : null,
        periods,
        key,
    };
}

function formatDashboardMetric(metric) {
    const format = String(metric?.format || "number").toLowerCase();
    const raw = metric?.value;
    if (raw == null || raw === "") return "-";
    const value = Number(raw);
    if (!Number.isFinite(value)) return "-";
    if (format === "currency") return formatCurrencyZAR(value);
    if (format === "percent") return formatPct(value);
    if (format === "ratio") return `${formatNumber(value, 2, 2)}x`;
    return Number.isInteger(value) ? formatInteger(value) : formatNumber(value, 2, 2);
}

function formatTrendDelta(value, periodSingular = "Week") {
    const periodWord = String(periodSingular || "Week").toLowerCase();
    const num = Number(value);
    if (!Number.isFinite(num)) return `No prior-${periodWord} baseline`;
    const pct = formatNumber(num * 100, 0, 0);
    const sign = num > 0 ? "+" : "";
    return `${sign}${pct}% vs prior ${periodWord}`;
}

function dashboardPeriodMeta(periodKey) {
    const key = String(periodKey || "").toLowerCase();
    if (key === "week") return { key: "week", label: "Weekly", singular: "Week" };
    if (key === "month") return { key: "month", label: "Monthly", singular: "Month" };
    if (key === "ytd") return { key: "ytd", label: "YTD", singular: "YTD" };
    return { key: "day", label: "Daily", singular: "Day" };
}

function resolveDashboardSelectedPeriod(selected, periodKey) {
    const meta = dashboardPeriodMeta(periodKey);
    const periods = (selected && selected.periods && typeof selected.periods === "object")
        ? selected.periods
        : {};
    const row = periods[meta.key] || periods.day || { revenue: selected.today_revenue, transactions: selected.today_transactions, avg_ticket: 0, vs_prior: null, prior_revenue: 0 };
    return {
        ...meta,
        revenue: safeNumber(row.revenue),
        transactions: safeNumber(row.transactions),
        avg_ticket: safeNumber(row.avg_ticket),
        vs_prior: Number.isFinite(Number(row.vs_prior)) ? Number(row.vs_prior) : null,
        prior_revenue: safeNumber(row.prior_revenue),
    };
}

function dashboardTargetPeriodKey(periodKey) {
    const key = String(periodKey || "day").toLowerCase();
    if (key === "week") return "wtd";
    if (key === "month") return "mtd";
    if (key === "ytd") return "ytd";
    return "day";
}

function resolveDashboardTargetBenchmark(data, periodKey) {
    const targetKey = dashboardTargetPeriodKey(periodKey);
    const periods = (data && data.targets && data.targets.periods && typeof data.targets.periods === "object")
        ? data.targets.periods
        : {};
    const row = (periods && typeof periods[targetKey] === "object") ? periods[targetKey] : {};
    const revenueActual = safeNumber(row?.revenue_actual);
    const revenueTarget = safeNumber(row?.revenue_target);
    const roundsActual = safeNumber(row?.rounds_actual);
    const roundsTarget = safeNumber(row?.rounds_target);
    const revenueAttainment = revenueTarget > 0 ? (revenueActual / revenueTarget) : null;
    const roundsAttainment = roundsTarget > 0 ? (roundsActual / roundsTarget) : null;
    return {
        key: targetKey,
        revenue_actual: revenueActual,
        revenue_target: revenueTarget,
        rounds_actual: roundsActual,
        rounds_target: roundsTarget,
        revenue_attainment: revenueAttainment,
        rounds_attainment: roundsAttainment,
    };
}

function resolveRevenueIntegrityMetrics(data) {
    const revenue = (data && typeof data === "object" && data.ai_assistant && typeof data.ai_assistant.revenue_integrity === "object")
        ? data.ai_assistant.revenue_integrity
        : {};
    const metrics = (revenue && typeof revenue.metrics === "object") ? revenue.metrics : {};
    return {
        healthScore: safeNumber(revenue?.health_score),
        unpaidAttendedCount: safeNumber(metrics?.unpaid_attended_count),
        paidWithoutAttendanceCount: safeNumber(metrics?.paid_without_attendance_count),
        unresolvedPricingCount: safeNumber(metrics?.unresolved_pricing_count),
    };
}

function buildClubOverviewHighlights(data, periodMeta) {
    const golfPeriod = resolveDashboardSelectedPeriod(resolveDashboardStreamMetrics(data, "golf"), periodMeta.key);
    const proShopPeriod = resolveDashboardSelectedPeriod(resolveDashboardStreamMetrics(data, "pro_shop"), periodMeta.key);
    const bookingCounts = resolveBookingStatusCounts(data, periodMeta.key);
    const paidStatusBookings = safeNumber(bookingCounts.checked_in) + safeNumber(bookingCounts.completed);
    const golfOccupancy = insightCardValue(data, "golf", "occupancy");
    const integrity = resolveRevenueIntegrityMetrics(data);
    const financeIssues = integrity.unpaidAttendedCount + integrity.paidWithoutAttendanceCount + integrity.unresolvedPricingCount;
    const memberFreshness = Number(data?.ai_assistant?.import_copilot?.freshness?.members?.days_since);
    const proShopInventory = data?.operation_insights?.pro_shop?.inventory || {};
    const rows = [
        {
            name: "Golf",
            current: safeNumber(golfPeriod.revenue),
            format: "currency",
            context: `${periodMeta.label} cash ${formatCurrencyZAR(golfPeriod.revenue)} | ${formatInteger(paidStatusBookings)} paid-status bookings | ${golfOccupancy == null ? "occupancy baseline unavailable" : `today occupancy ${formatPct(golfOccupancy)}`}`,
        },
        {
            name: "Members",
            current: safeNumber(data?.total_members ?? data?.total_players),
            format: "number",
            context: Number.isFinite(memberFreshness)
                ? `Member directory live | last member import ${formatInteger(memberFreshness)} day(s) ago`
                : "Member directory live | import freshness not captured yet",
        },
        {
            name: "Finance / Reconciliation",
            current: financeIssues,
            format: "number",
            context: `Health ${formatInteger(integrity.healthScore)}/100 | ${formatInteger(integrity.unpaidAttendedCount)} unpaid attended | ${formatInteger(safeNumber(data?.account_customers_active))} active account customers`,
        },
    ];

    if (
        safeNumber(proShopInventory?.active_products) > 0
        || safeNumber(proShopPeriod.revenue) > 0
        || safeNumber(proShopPeriod.transactions) > 0
    ) {
        rows.push({
            name: "Pro Shop",
            current: safeNumber(proShopPeriod.revenue),
            format: "currency",
            context: `${periodMeta.label} sales ${formatCurrencyZAR(proShopPeriod.revenue)} | ${formatInteger(proShopInventory?.low_stock_items)} low-stock | stock value ${formatCurrencyZAR(proShopInventory?.stock_value)}`,
        });
    }

    if (
        safeNumber(data?.golf_day_open_count) > 0
        || safeNumber(data?.golf_day_outstanding_balance) > 0
        || safeNumber(data?.golf_day_pipeline_total) > 0
    ) {
        rows.push({
            name: "Golf Days / Events",
            current: safeNumber(data?.golf_day_open_count),
            format: "number",
            context: `${formatInteger(data?.golf_day_open_count)} open | ${formatCurrencyZAR(data?.golf_day_outstanding_balance)} outstanding | pipeline ${formatCurrencyZAR(data?.golf_day_pipeline_total)}`,
        });
    }

    return rows;
}

function renderDashboardHighlights(data, streamKey, selectedPeriod) {
    const body = document.getElementById("dashboard-highlights-body");
    const titleEl = document.getElementById("dashboard-highlights-title");
    const noteEl = document.getElementById("dashboard-highlights-note");
    const metricColEl = document.getElementById("dashboard-highlights-col-metric");
    const currentColEl = document.getElementById("dashboard-highlights-col-current");
    const contextColEl = document.getElementById("dashboard-highlights-col-context");
    if (!body || !titleEl || !noteEl) return;

    const insights = (data && data.operation_insights && typeof data.operation_insights === "object")
        ? data.operation_insights
        : {};
    const row = insights[streamKey] || insights.all || null;
    const label = resolveDashboardStreamMetrics(data, streamKey).label;
    const periodMeta = dashboardPeriodMeta(selectedPeriod?.key || dashboardPeriodView);
    const stream = String(streamKey || "all").toLowerCase();
    const isAllStream = stream === "all";

    titleEl.textContent = isAllStream ? "Operational Breakdown by Area" : `${label} Highlights (${periodMeta.label})`;
    noteEl.textContent = isAllStream
        ? `Club-admin view across live golf, members, finance, pro shop, and golf-day signals for the selected ${periodMeta.label.toLowerCase()} window.`
        : (row?.note ? String(row.note) : "No additional highlights available yet.");
    if (metricColEl) metricColEl.textContent = isAllStream ? "Area" : "Metric";
    if (currentColEl) currentColEl.textContent = isAllStream ? "Current State" : "Current";
    if (contextColEl) contextColEl.textContent = isAllStream ? "Action / Context" : "Context";

    const highlights = isAllStream
        ? buildClubOverviewHighlights(data, periodMeta)
        : (Array.isArray(row?.highlights) ? row.highlights : []);
    if (!highlights.length) {
        body.innerHTML = `
            <tr class="empty-row">
                <td colspan="3"><div class="empty-state">No highlight rows available for this stream yet.</div></td>
            </tr>
        `;
        return;
    }

    body.innerHTML = highlights.map(item => `
        <tr>
            <td>${escapeHtml(String(item?.name || item?.label || "Item"))}</td>
            <td>${escapeHtml((() => {
                const modernCurrent = (item && Object.prototype.hasOwnProperty.call(item, "current"))
                    ? formatDashboardMetric({ value: item.current, format: item?.format || "number" })
                    : null;
                if (modernCurrent != null) return modernCurrent;
                if (item && Object.prototype.hasOwnProperty.call(item, "value")) {
                    return formatDashboardMetric({ value: item.value, format: item?.format || "number" });
                }
                const legacyCurrent = item?.revenue ?? item?.amount ?? item?.transactions ?? item?.units;
                const legacyFormat = (item?.revenue != null || item?.amount != null) ? "currency" : "number";
                return legacyCurrent == null
                    ? "-"
                    : formatDashboardMetric({ value: legacyCurrent, format: legacyFormat });
            })())}</td>
            <td>${escapeHtml((() => {
                if (item?.context != null && String(item.context).trim()) return String(item.context);
                if (item?.units != null && item?.transactions != null) return `${item.units} units | ${item.transactions} txns`;
                if (item?.units != null) return `${item.units} units`;
                if (item?.transactions != null) return `${item.transactions} txns`;
                return "-";
            })())}</td>
        </tr>
    `).join("");
}

function buildDashboardOperationCards(data, streamKey, selectedPeriod) {
    const stream = String(streamKey || "all").toLowerCase();
    const periodMeta = dashboardPeriodMeta(selectedPeriod?.key || dashboardPeriodView);
    const periodLabel = periodMeta.label;
    const revenue = safeNumber(selectedPeriod?.revenue);
    const transactions = safeNumber(selectedPeriod?.transactions);
    const avgTicket = safeNumber(selectedPeriod?.avg_ticket);
    const benchmark = resolveDashboardTargetBenchmark(data, periodMeta.key);
    const targetRevenueAttainment = benchmark.revenue_attainment;
    const targetRoundsAttainment = benchmark.rounds_attainment;
    const targetContribution = benchmark.revenue_target > 0 ? (revenue / benchmark.revenue_target) : null;
    const integrity = resolveRevenueIntegrityMetrics(data);
    const financeIssues = integrity.unpaidAttendedCount + integrity.paidWithoutAttendanceCount + integrity.unresolvedPricingCount;

    if (stream === "golf") {
        return [
            { label: `${periodLabel} Golf Revenue (Cash)`, value: revenue, format: "currency" },
            { label: `${periodLabel} Paid Rounds (Ledger)`, value: benchmark.rounds_actual, format: "number" },
            { label: `${periodLabel} Revenue Target`, value: targetRevenueAttainment, format: "percent" },
            { label: `${periodLabel} Rounds Target`, value: targetRoundsAttainment, format: "percent" },
        ];
    }

    if (stream === "pro_shop") {
        return [
            { label: `${periodLabel} Sales`, value: revenue, format: "currency" },
            { label: `${periodLabel} Transactions`, value: transactions, format: "number" },
            { label: `Avg Basket (${periodLabel})`, value: avgTicket, format: "currency" },
            { label: `${periodLabel} Target Contribution`, value: targetContribution, format: "percent" },
        ];
    }

    if (stream === "pub") {
        return [
            { label: `${periodLabel} Pub Revenue`, value: revenue, format: "currency" },
            { label: `${periodLabel} Transactions`, value: transactions, format: "number" },
            { label: `Avg Ticket (${periodLabel})`, value: avgTicket, format: "currency" },
            { label: `${periodLabel} Target Contribution`, value: targetContribution, format: "percent" },
        ];
    }

    if (stream === "bowls") {
        return [
            { label: `${periodLabel} Bowls Revenue`, value: revenue, format: "currency" },
            { label: `${periodLabel} Transactions`, value: transactions, format: "number" },
            { label: `Avg Ticket (${periodLabel})`, value: avgTicket, format: "currency" },
            { label: `${periodLabel} Target Contribution`, value: targetContribution, format: "percent" },
        ];
    }

    if (stream === "other") {
        return [
            { label: `${periodLabel} Other Revenue`, value: revenue, format: "currency" },
            { label: `${periodLabel} Transactions`, value: transactions, format: "number" },
            { label: `Avg Ticket (${periodLabel})`, value: avgTicket, format: "currency" },
            { label: `${periodLabel} Target Contribution`, value: targetContribution, format: "percent" },
        ];
    }

    return [
        { label: "Today's Bookings", value: safeNumber(data?.today_bookings), format: "number" },
        { label: "Total Members", value: safeNumber(data?.total_members ?? data?.total_players), format: "number" },
        { label: `${periodLabel} Cash Activity`, value: revenue, format: "currency" },
        { label: "Finance Exceptions", value: financeIssues, format: "number" },
    ];
}

function applyDashboardOperationLayout(data, streamKey, selectedPeriod) {
    const cards = buildDashboardOperationCards(data, streamKey, selectedPeriod);

    const statLabels = [
        document.getElementById("stat-label-1"),
        document.getElementById("stat-label-2"),
        document.getElementById("total-revenue-label"),
        document.getElementById("stat-label-4"),
    ];
    const statValues = [
        document.getElementById("total-bookings"),
        document.getElementById("total-members"),
        document.getElementById("total-revenue"),
        document.getElementById("completed-rounds"),
    ];

    for (let idx = 0; idx < 4; idx += 1) {
        const metric = cards[idx] || null;
        const labelEl = statLabels[idx];
        const valueEl = statValues[idx];
        if (!labelEl || !valueEl || !metric) continue;
        labelEl.textContent = String(metric.label || "");
        valueEl.textContent = formatDashboardMetric(metric);
    }

    const showGolfSections = streamKey === "golf";
    document.querySelectorAll(".dashboard-golf-only").forEach(el => {
        if (el instanceof HTMLElement) el.style.display = showGolfSections ? "" : "none";
    });
}

function resolveBookingStatusCounts(data, periodKey) {
    const key = String(periodKey || "day").toLowerCase();
    const periods = (data && data.bookings_by_status_periods && typeof data.bookings_by_status_periods === "object")
        ? data.bookings_by_status_periods
        : {};
    const fallback = (data && data.bookings_by_status && typeof data.bookings_by_status === "object")
        ? data.bookings_by_status
        : {};
    const row = (periods && typeof periods[key] === "object") ? periods[key] : fallback;
    return {
        booked: safeNumber(row?.booked ?? fallback?.booked),
        checked_in: safeNumber(row?.checked_in ?? fallback?.checked_in),
        completed: safeNumber(row?.completed ?? fallback?.completed),
        no_show: safeNumber(row?.no_show ?? fallback?.no_show),
        cancelled: safeNumber(row?.cancelled ?? fallback?.cancelled),
    };
}

function renderBookingStatusCounts(data, periodKey) {
    const counts = resolveBookingStatusCounts(data, periodKey);
    const total = Object.values(counts).reduce((sum, value) => sum + safeNumber(value), 0) || 1;
    const statuses = [
        { key: "booked", elId: "status-booked", countId: "status-booked-count" },
        { key: "checked_in", elId: "status-checked-in", countId: "status-checked-in-count" },
        { key: "completed", elId: "status-completed", countId: "status-completed-count" },
        { key: "no_show", elId: "status-no-show", countId: "status-no-show-count" },
        { key: "cancelled", elId: "status-cancelled", countId: "status-cancelled-count" }
    ];
    statuses.forEach(({ key, elId, countId }) => {
        const count = safeNumber(counts[key]);
        const width = (count / total) * 100;
        const el = document.getElementById(elId);
        if (el) el.style.width = `${width}%`;
        const countEl = document.getElementById(countId);
        if (countEl) countEl.textContent = formatInteger(count);
    });
}

function renderDashboardSecondaryCard(data, streamKey, selectedPeriod) {
    const titleEl = document.getElementById("dashboard-secondary-title");
    const bookingStatusEl = document.getElementById("dashboard-booking-status-breakdown");
    const focusEl = document.getElementById("dashboard-operation-focus");
    const noteEl = document.getElementById("dashboard-operation-focus-note");
    if (!titleEl || !bookingStatusEl || !focusEl || !noteEl) return;

    const stream = String(streamKey || "all").toLowerCase();
    const periodMeta = dashboardPeriodMeta(selectedPeriod?.key || dashboardPeriodView);
    const periodLabel = periodMeta.label;
    const benchmark = resolveDashboardTargetBenchmark(data, periodMeta.key);
    const insights = (data && data.operation_insights && typeof data.operation_insights === "object")
        ? data.operation_insights
        : {};
    const streamInsight = (insights && typeof insights[stream] === "object") ? insights[stream] : {};
    const integrity = resolveRevenueIntegrityMetrics(data);

    if (stream === "golf") {
        const counts = resolveBookingStatusCounts(data, periodMeta.key);
        const paidRoundsFromStatus = safeNumber(counts.checked_in) + safeNumber(counts.completed);
        const paidRoundsFromLedger = safeNumber(benchmark.rounds_actual);
        titleEl.textContent = `${periodLabel} Booking Status`;
        bookingStatusEl.style.display = "";
        focusEl.style.display = "none";
        noteEl.style.display = "";
        noteEl.textContent = `${periodLabel} operational paid-status bookings = Checked In + Completed (${formatInteger(paidRoundsFromStatus)}). KPI cards and targets use cash-basis paid ledger entries (${formatInteger(paidRoundsFromLedger)}).`;
        return;
    }

    bookingStatusEl.style.display = "none";
    focusEl.style.display = "";
    noteEl.style.display = "";

    const rows = [];
    let title = "Operational Focus";
    let note = `${periodLabel} operational metrics for this stream.`;

    if (stream === "all") {
        const noShow = data?.ai_assistant?.no_show || {};
        const importSummary = data?.ai_assistant?.import_copilot?.summary || {};
        const financeIssues = integrity.unpaidAttendedCount + integrity.paidWithoutAttendanceCount + integrity.unresolvedPricingCount;
        title = "Action Snapshot";
        note = "Club-admin focus across finance integrity, no-show risk, golf-day exposure, and import readiness.";
        rows.push(
            { label: "Finance Gaps", value: formatInteger(financeIssues) },
            { label: "Revenue Integrity", value: `${formatInteger(integrity.healthScore)}/100` },
            { label: "No-show Risk (72h)", value: formatInteger(noShow?.high_risk_next_72h) },
            { label: "Open Golf Days", value: `${formatInteger(data?.golf_day_open_count)} open | ${formatCurrencyZAR(data?.golf_day_outstanding_balance)} outstanding` },
            {
                label: "Import Readiness",
                value: `${formatInteger(importSummary?.configured_streams)}/${formatInteger(importSummary?.total_streams)} streams configured`,
            },
        );
    } else if (stream === "pro_shop") {
        title = "Inventory & POS Health";
        note = "Pro shop operations should balance sales throughput with stock risk.";
        const inventory = (streamInsight && typeof streamInsight.inventory === "object") ? streamInsight.inventory : {};
        rows.push(
            { label: `${periodLabel} Sales`, value: formatCurrencyZAR(selectedPeriod.revenue) },
            { label: `${periodLabel} Transactions`, value: formatInteger(selectedPeriod.transactions) },
            { label: "Low-stock Items", value: `${formatInteger(inventory?.low_stock_items)} / ${formatInteger(inventory?.active_products)} active` },
            { label: "Stock Value", value: formatCurrencyZAR(inventory?.stock_value) },
            {
                label: `${periodLabel} Target Contribution`,
                value: benchmark.revenue_target > 0 ? formatPct(safeNumber(selectedPeriod.revenue) / benchmark.revenue_target) : "-",
            },
        );
    } else {
        const streamLabel = revenueImportStreamLabel(stream);
        title = `${streamLabel} Revenue Focus`;
        note = `${streamLabel} stream view prioritizes pace, ticket quality, and category performance.`;
        const highlights = Array.isArray(streamInsight?.highlights) ? streamInsight.highlights : [];
        const topCategory = highlights.length ? highlights[0] : null;
        const topCategoryLabel = topCategory?.name ? String(topCategory.name) : "Top Category (30d)";
        const topCategoryValue = topCategory
            ? formatDashboardMetric({
                value: topCategory?.current ?? topCategory?.value,
                format: topCategory?.format || "currency",
            })
            : "-";

        rows.push(
            { label: `${periodLabel} Revenue`, value: formatCurrencyZAR(selectedPeriod.revenue) },
            { label: `${periodLabel} Transactions`, value: formatInteger(selectedPeriod.transactions) },
            { label: `Avg Ticket (${periodLabel})`, value: formatCurrencyZAR(selectedPeriod.avg_ticket) },
            {
                label: `${periodLabel} Target Contribution`,
                value: benchmark.revenue_target > 0 ? formatPct(safeNumber(selectedPeriod.revenue) / benchmark.revenue_target) : "-",
            },
            { label: topCategoryLabel, value: topCategoryValue },
        );
    }

    titleEl.textContent = title;
    focusEl.innerHTML = rows.map(row => `
        <div class="today-stat">
            <span>${escapeHtml(String(row.label || ""))}</span>
            <span class="stat-number">${escapeHtml(String(row.value || "-"))}</span>
        </div>
    `).join("");
    noteEl.textContent = note;
}

function applyDashboardStreamView(data) {
    const selected = resolveDashboardStreamMetrics(data, dashboardStreamView);
    const label = selected.label;
    const selectedPeriod = resolveDashboardSelectedPeriod(selected, dashboardPeriodView);
    renderBookingStatusCounts(data, selectedPeriod.key);
    applyDashboardStreamButtonState();
    applyDashboardPeriodButtonState();
    applyDashboardEntryVisibility();

    const totalRevenueEl = document.getElementById("total-revenue");
    const todayRevenueEl = document.getElementById("today-revenue");
    const weekRevenueEl = document.getElementById("week-revenue");
    const todayPrimaryLabelEl = document.getElementById("today-primary-label");
    const todayPrimaryValueEl = document.getElementById("today-bookings");
    const totalRevenueLabelEl = document.getElementById("total-revenue-label");
    const todayRevenueLabelEl = document.getElementById("today-revenue-label");
    const weekRevenueLabelEl = document.getElementById("week-revenue-label");
    const noteEl = document.getElementById("dashboard-stream-note");

    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrencyZAR(selected.total_revenue);
    if (todayPrimaryValueEl) todayPrimaryValueEl.textContent = formatInteger(Math.round(selectedPeriod.transactions));
    if (todayRevenueEl) todayRevenueEl.textContent = formatNumber(selectedPeriod.revenue, 2, 2);
    if (weekRevenueEl) weekRevenueEl.textContent = formatNumber(selectedPeriod.prior_revenue, 2, 2);

    if (totalRevenueLabelEl) totalRevenueLabelEl.textContent = `${label} Revenue`;
    if (todayPrimaryLabelEl) todayPrimaryLabelEl.textContent = `${selectedPeriod.label} Transactions (${label})`;
    if (todayRevenueLabelEl) todayRevenueLabelEl.textContent = `${selectedPeriod.label} Revenue (${label})`;
    if (weekRevenueLabelEl) weekRevenueLabelEl.textContent = `Prior ${selectedPeriod.singular} Revenue (${label})`;

    if (noteEl) {
        const fromSidebarPreset = dashboardStreamPreset !== "custom" && dashboardStreamPreset !== "all" && dashboardStreamPreset === selected.key;
        const trendText = formatTrendDelta(selectedPeriod.vs_prior, selectedPeriod.singular);
        if (selected.key === "all") {
            noteEl.textContent = `Club Overview combines golf, members, finance, pro shop, and golf-day signals on the ${selectedPeriod.label.toLowerCase()} window. ${trendText}.`;
        } else if (fromSidebarPreset) {
            noteEl.textContent = `Loaded ${label} dashboard preset on ${selectedPeriod.label.toLowerCase()} window. ${trendText}.`;
        } else if (selected.key === "golf") {
            noteEl.textContent = `Golf view uses cash-basis paid revenue and ledger-paid rounds for KPI actuals, while booking-status panels show operational tee-sheet states. ${trendText}.`;
        } else if (selected.key === "pro_shop") {
            noteEl.textContent = `Pro shop view uses POS sales, basket value, and stock-risk metrics. ${trendText}.`;
        } else {
            noteEl.textContent = `${label} view uses imported non-golf revenue transactions. ${trendText}.`;
        }
    }

    applyDashboardOperationLayout(data, selected.key, selectedPeriod);
    renderDashboardSecondaryCard(data, selected.key, selectedPeriod);
    renderAiAssistant(data, selected.key, selectedPeriod);
    renderDashboardHighlights(data, selected.key, selectedPeriod);

    if (currentActivePage === "dashboard") {
        const titleEl = document.getElementById("page-title");
        if (titleEl) {
            titleEl.textContent = selected.key === "all" ? "Club Overview" : `${label} Dashboard`;
        }
    }
}

function aiSeverityClass(value) {
    const severity = String(value || "").toLowerCase();
    if (severity === "healthy" || severity === "good" || severity === "ok" || severity === "low") return "good";
    if (severity === "critical" || severity === "high" || severity === "bad") return "bad";
    return "warn";
}

function renderAiAssistantPanel(slot, panel) {
    const panelEl = document.getElementById(`ai-panel-${slot}`);
    const titleEl = document.getElementById(`ai-panel-${slot}-title`);
    const statusEl = document.getElementById(`ai-panel-${slot}-status`);
    const listEl = document.getElementById(`ai-panel-${slot}-list`);
    const actionBtn = document.getElementById(`ai-panel-${slot}-action`);
    if (!panelEl || !titleEl || !statusEl || !listEl || !actionBtn) return false;

    if (!panel) {
        panelEl.style.display = "none";
        return false;
    }

    panelEl.style.display = "";
    titleEl.textContent = String(panel.title || "Assistant");
    statusEl.innerHTML = String(panel.status || "");

    const items = Array.isArray(panel.items) ? panel.items : [];
    if (!items.length) {
        listEl.innerHTML = `
            <div class="ai-assistant-item">
                <div class="title">No actions right now</div>
                <div class="detail">This stream has no immediate AI recommendations.</div>
            </div>
        `;
    } else {
        listEl.innerHTML = items.slice(0, 3).map(item => `
            <div class="ai-assistant-item">
                <div class="title">${item?.severity ? `<span class="ai-pill ${aiSeverityClass(item.severity)}">${escapeHtml(String(item.severity))}</span>` : ""}${escapeHtml(String(item?.title || "Insight"))}</div>
                <div class="detail">${escapeHtml(String(item?.detail || ""))}</div>
            </div>
        `).join("");
    }

    const actionPage = String(panel.actionPage || "").trim();
    const actionLabel = String(panel.actionLabel || "Open").trim();
    if (actionPage) {
        actionBtn.style.display = "";
        actionBtn.dataset.aiNav = actionPage;
        actionBtn.dataset.aiPeriod = String(panel.actionPeriod || "").trim();
        actionBtn.dataset.aiIntegrity = String(panel.actionIntegrity || "").trim();
        actionBtn.textContent = actionLabel;
    } else {
        actionBtn.style.display = "none";
        actionBtn.dataset.aiNav = "";
        actionBtn.dataset.aiPeriod = "";
        actionBtn.dataset.aiIntegrity = "";
    }
    return true;
}

function insightCardValue(data, streamKey, labelToken) {
    const cards = data?.operation_insights?.[streamKey]?.cards;
    if (!Array.isArray(cards)) return null;
    const token = String(labelToken || "").trim().toLowerCase();
    if (!token) return null;
    const row = cards.find(c => String(c?.label || "").toLowerCase().includes(token));
    if (!row) return null;
    const value = Number(row?.value);
    return Number.isFinite(value) ? value : null;
}

function renderAiAssistant(data, streamKey = "all", selectedPeriod = null) {
    const cardEl = document.getElementById("ai-assistant-card");
    const summaryEl = document.getElementById("ai-assistant-summary");
    if (!cardEl || !summaryEl) return;

    const stream = String(streamKey || "all").toLowerCase();
    const period = selectedPeriod || {
        key: "day",
        label: "Daily",
        singular: "Day",
        revenue: 0,
        transactions: 0,
        avg_ticket: 0,
        vs_prior: null,
        prior_revenue: 0,
    };
    const label = resolveDashboardStreamMetrics(data, stream).label;
    const ai = (data && typeof data === "object" && data.ai_assistant && typeof data.ai_assistant === "object")
        ? data.ai_assistant
        : {};
    const revenue = (ai && typeof ai.revenue_integrity === "object") ? ai.revenue_integrity : {};
    const noShow = (ai && typeof ai.no_show === "object") ? ai.no_show : {};
    const importCopilot = (ai && typeof ai.import_copilot === "object") ? ai.import_copilot : {};
    const importRows = Array.isArray(importCopilot?.streams) ? importCopilot.streams : [];

    const panelRevenueIntegrity = () => {
        const status = String(revenue?.status || "warning").toLowerCase();
        const score = safeNumber(revenue?.health_score);
        const alerts = Array.isArray(revenue?.alerts) ? revenue.alerts : [];
        const metrics = (revenue && typeof revenue.metrics === "object") ? revenue.metrics : {};
        const unpaidAttendedCount = safeNumber(metrics?.unpaid_attended_count);
        const periodRows = Array.isArray(revenue?.period_alignment) ? revenue.period_alignment : [];
        const periodRow = periodRows.find(r => String(r?.period_key || "").toLowerCase() === String(period.key || "").toLowerCase()) || null;
        const items = alerts.slice(0, 2).map(a => ({
            title: String(a?.title || "Integrity alert"),
            detail: String(a?.detail || ""),
            severity: String(a?.severity || "warning"),
        }));
        if (!items.length && periodRow) {
            items.push({
                title: `${period.label} paid-round alignment`,
                detail: `Ledger ${formatInteger(periodRow.ledger_paid_rounds)} vs status ${formatInteger(periodRow.status_paid_rounds)} (${formatInteger(periodRow.delta_rounds)} delta).`,
                severity: String(periodRow.severity || "good"),
            });
        }
        return {
            title: "Revenue Integrity",
            status: `<span class="ai-pill ${aiSeverityClass(status)}">${escapeHtml(status)}</span>Health score ${formatInteger(score)}/100`,
            items,
            actionPage: unpaidAttendedCount > 0 ? "bookings" : "ledger",
            actionPeriod: unpaidAttendedCount > 0 ? "ytd" : "",
            actionIntegrity: unpaidAttendedCount > 0 ? "missing_paid_ledger" : "",
            actionLabel: unpaidAttendedCount > 0 ? "Review Gaps" : "Open Ledger",
        };
    };

    const panelNoShow = () => {
        const upcoming = safeNumber(noShow?.upcoming_bookings);
        const high72 = safeNumber(noShow?.high_risk_next_72h);
        const medium72 = safeNumber(noShow?.medium_risk_next_72h);
        const predictions = Array.isArray(noShow?.predictions) ? noShow.predictions : [];
        const items = predictions.slice(0, 3).map(p => ({
            title: `${String(p?.player_name || "Player")} (${formatInteger(Math.round(safeNumber(p?.risk_score) * 100))}%)`,
            detail: `${p?.tee_time ? formatDateTimeDMY(p.tee_time) : "-"} | Tee ${String(p?.tee || "1")} | ${Array.isArray(p?.reasons) ? p.reasons.slice(0, 2).join(" | ") : ""}`,
            severity: String(p?.risk_level || "low"),
        }));
        if (!items.length) {
            const rec = Array.isArray(noShow?.recommendations) ? noShow.recommendations : [];
            items.push({
                title: "No immediate no-show actions",
                detail: String(rec[0] || "No upcoming booking risk data available."),
                severity: "good",
            });
        }
        const status = high72 > 0 ? "high" : (medium72 > 0 ? "warning" : "healthy");
        return {
            title: "No-show Risk",
            status: `<span class="ai-pill ${aiSeverityClass(status)}">${escapeHtml(high72 > 0 ? "high" : medium72 > 0 ? "watch" : "clear")}</span>${formatInteger(upcoming)} upcoming booking(s) over ${formatInteger(noShow?.window_days || 7)} days`,
            items,
            actionPage: "tee-times",
            actionLabel: "Open Tee Sheet",
        };
    };

    const panelImport = (targetStream) => {
        const scopedRows = importRows.filter(row => isPrimaryOperationStream(row?.stream));
        if (targetStream === "all") {
            const configured = scopedRows.filter(row => Boolean(row?.configured)).length;
            const totalStreams = PRIMARY_OPERATION_KEYS.length;
            const staleStreams = scopedRows.filter(row => {
                const daysSince = Number(row?.days_since_import);
                return !Number.isFinite(daysSince) || daysSince > 14;
            }).length;
            const highFailStreams = scopedRows.filter(row => {
                const rows30d = safeNumber(row?.rows_total_30d);
                const failureRate = safeNumber(row?.failure_rate_30d);
                return rows30d >= 20 && failureRate >= 0.08;
            }).length;
            const status = highFailStreams > 0 ? "critical" : (staleStreams > 0 ? "warning" : "healthy");
            const orderedRows = [...scopedRows].sort((a, b) => {
                const rank = (v) => {
                    const s = String(v || "").toLowerCase();
                    if (s === "critical") return 0;
                    if (s === "warning") return 1;
                    return 2;
                };
                return rank(a?.health) - rank(b?.health);
            });
            const items = orderedRows.slice(0, 3).map(row => ({
                title: `${String(row?.label || row?.stream || "Stream")}`,
                detail: `${String(row?.recommendation || "No recommendation")} | 30d fail-rate ${formatPct(safeNumber(row?.failure_rate_30d))}`,
                severity: String(row?.health || "warning"),
            }));
            return {
                title: "Import Copilot",
                status: `<span class="ai-pill ${aiSeverityClass(status)}">${escapeHtml(status)}</span>${formatInteger(configured)}/${formatInteger(totalStreams)} streams configured | ${formatInteger(staleStreams)} stale | ${formatInteger(highFailStreams)} high-fail`,
                items,
                actionPage: "operations-config",
                actionLabel: "Open Imports & Audit",
            };
        }

        const row = scopedRows.find(r => String(r?.stream || "").toLowerCase() === targetStream) || null;
        if (!row) return null;
        const include = String(row?.health || "").toLowerCase() !== "healthy"
            || safeNumber(row?.rows_total_30d) > 0;
        if (!include) return null;

        const items = [
            {
                title: `${String(row?.label || revenueImportStreamLabel(targetStream))} import quality`,
                detail: `${String(row?.recommendation || "No recommendation")} | 30d fail-rate ${formatPct(safeNumber(row?.failure_rate_30d))}`,
                severity: String(row?.health || "warning"),
            },
            {
                title: "Last import",
                detail: row?.last_import_at ? formatDateTimeDMY(row.last_import_at) : "No imports captured yet",
                severity: row?.last_import_at ? "good" : "warning",
            },
        ];
        return {
            title: `${revenueImportStreamLabel(targetStream)} Import Copilot`,
            status: `<span class="ai-pill ${aiSeverityClass(row?.health)}">${escapeHtml(String(row?.health || "warning"))}</span>${formatInteger(row?.rows_total_30d)} rows in last 30 days`,
            items,
            actionPage: "operations-config",
            actionLabel: "Configure Imports",
        };
    };

    const panelStreamPace = (streamLabel, actionPage) => {
        const trendClass = safeNumber(period?.vs_prior) >= 0 ? "good" : "warning";
        return {
            title: `${streamLabel} Pace`,
            status: `<span class="ai-pill ${aiSeverityClass(trendClass)}">${escapeHtml(trendClass)}</span>${period.label} revenue ${formatCurrencyZAR(period.revenue)} | ${formatTrendDelta(period.vs_prior, period.singular)}`,
            items: [
                { title: `${period.label} Transactions`, detail: formatInteger(period.transactions), severity: "good" },
                { title: `${period.label} Avg Ticket`, detail: formatCurrencyZAR(period.avg_ticket), severity: "good" },
                { title: `Prior ${period.singular} Revenue`, detail: formatCurrencyZAR(period.prior_revenue), severity: "warning" },
            ],
            actionPage,
            actionLabel: actionPage === "pro-shop" ? "Open Pro Shop" : "Open Revenue",
        };
    };

    const panelGolfUtilization = () => {
        const counts = resolveBookingStatusCounts(data, period.key);
        const paid = safeNumber(counts.checked_in) + safeNumber(counts.completed);
        const noShowCount = safeNumber(counts.no_show);
        const noShowRate = (paid + noShowCount) > 0 ? (noShowCount / (paid + noShowCount)) : 0;
        const occupancy = insightCardValue(data, "golf", "occupancy");
        const revPerRound = paid > 0 ? (safeNumber(period.revenue) / paid) : (insightCardValue(data, "golf", "revenue / paid round") || 0);
        const occupancyClass = occupancy == null ? "warning" : occupancy >= 0.75 ? "good" : (occupancy >= 0.55 ? "warning" : "high");
        return {
            title: "Tee Utilization",
            status: `<span class="ai-pill ${aiSeverityClass(occupancyClass)}">${escapeHtml(occupancy == null ? "watch" : occupancy >= 0.75 ? "healthy" : "optimize")}</span>${occupancy == null ? "Occupancy baseline unavailable" : `Today occupancy ${formatPct(occupancy)}`}`,
            items: [
                { title: `${period.label} Paid Rounds`, detail: formatInteger(paid), severity: "good" },
                { title: `${period.label} No-show Rate`, detail: formatPct(noShowRate), severity: noShowRate >= 0.12 ? "high" : (noShowRate >= 0.06 ? "warning" : "good") },
                { title: "Revenue / Paid Round", detail: formatCurrencyZAR(revPerRound), severity: "good" },
            ],
            actionPage: "tee-times",
            actionLabel: "Manage Tee Sheet",
        };
    };

    const panelProShopInventory = () => {
        const inventory = data?.operation_insights?.pro_shop?.inventory || {};
        const lowStockRate = safeNumber(inventory?.low_stock_rate);
        const daysCover = Number(inventory?.days_of_cover);
        const daysCoverValue = Number.isFinite(daysCover) ? daysCover : null;
        const inventoryStatus = lowStockRate >= 0.25 || (daysCoverValue != null && daysCoverValue < 14)
            ? "high"
            : (lowStockRate >= 0.12 || (daysCoverValue != null && daysCoverValue < 28) ? "warning" : "healthy");
        const highlights = Array.isArray(data?.operation_insights?.pro_shop?.highlights)
            ? data.operation_insights.pro_shop.highlights
            : [];
        const topSeller = highlights.find(h => String(h?.name || "").toLowerCase().includes("top seller"));
        return {
            title: "Inventory Risk",
            status: `<span class="ai-pill ${aiSeverityClass(inventoryStatus)}">${escapeHtml(inventoryStatus)}</span>${formatInteger(inventory?.low_stock_items)} low-stock item(s) of ${formatInteger(inventory?.active_products)} active`,
            items: [
                { title: "Stock Value", detail: formatCurrencyZAR(inventory?.stock_value), severity: "good" },
                { title: "Days of Cover", detail: daysCoverValue == null ? "Insufficient sales history" : `${formatNumber(daysCoverValue, 1, 1)} days`, severity: daysCoverValue != null && daysCoverValue < 14 ? "high" : "good" },
                {
                    title: topSeller ? String(topSeller?.name || "Top seller") : "Top seller signal",
                    detail: topSeller ? formatDashboardMetric({ value: topSeller?.current, format: topSeller?.format || "currency" }) : "No top-seller signal yet",
                    severity: "good",
                },
            ],
            actionPage: "pro-shop",
            actionLabel: "Open Pro Shop",
        };
    };

    const panelCategoryOpportunity = () => {
        const highlights = Array.isArray(data?.operation_insights?.[stream]?.highlights)
            ? data.operation_insights[stream].highlights
            : [];
        const categories = highlights.filter(h => String(h?.name || "").toLowerCase().includes("top category"));
        if (!categories.length) return null;
        return {
            title: "Category Opportunities",
            status: `<span class="ai-pill ${aiSeverityClass("warning")}">focus</span>Use top categories to drive bundles and promotions.`,
            items: categories.slice(0, 3).map(h => ({
                title: String(h?.name || "Category"),
                detail: `${formatDashboardMetric({ value: h?.current, format: h?.format || "currency" })} | ${String(h?.context || "")}`,
                severity: "warning",
            })),
            actionPage: "revenue",
            actionLabel: "Open Revenue",
        };
    };

    let panels = [];
    if (stream === "all") {
        panels = [panelRevenueIntegrity(), panelNoShow(), panelImport("all")];
        const revScore = safeNumber(revenue?.health_score);
        const highRisk72 = safeNumber(noShow?.high_risk_next_72h);
        const scopedRows = importRows.filter(row => isPrimaryOperationStream(row?.stream));
        const configured = scopedRows.filter(row => Boolean(row?.configured)).length;
        const totalStreams = PRIMARY_OPERATION_KEYS.length;
        summaryEl.textContent = `${label} AI summary (${period.label}) | Revenue health ${formatInteger(revScore)}/100 | ${formatInteger(highRisk72)} high-risk no-shows (72h) | Imports ${formatInteger(configured)}/${formatInteger(totalStreams)} configured`;
    } else if (stream === "golf") {
        panels = [panelNoShow(), panelGolfUtilization(), panelRevenueIntegrity()];
        summaryEl.textContent = `${label} AI summary (${period.label}) | Focus: no-show control, tee utilization, and payment-status alignment.`;
    } else if (stream === "pro_shop") {
        panels = [panelProShopInventory(), panelStreamPace("Pro Shop", "pro-shop"), panelImport("pro_shop")];
        summaryEl.textContent = `${label} AI summary (${period.label}) | Focus: stock health, basket quality, and sales velocity.`;
    } else if (stream === "pub" || stream === "bowls" || stream === "other") {
        panels = [
            panelStreamPace(revenueImportStreamLabel(stream), "revenue"),
            panelCategoryOpportunity(),
            panelImport(stream),
        ];
        summaryEl.textContent = `${label} AI summary (${period.label}) | Focus: import quality, category mix, and revenue pace.`;
    } else {
        panels = [panelRevenueIntegrity(), panelImport("all"), null];
        summaryEl.textContent = `${label} AI summary`;
    }

    const visibleCount = [
        renderAiAssistantPanel(1, panels[0] || null),
        renderAiAssistantPanel(2, panels[1] || null),
        renderAiAssistantPanel(3, panels[2] || null),
    ].filter(Boolean).length;

    cardEl.style.display = visibleCount > 0 ? "" : "none";
}

// Dashboard
function renderOperationalAlerts(payload, options = {}) {
    const alertsCard = document.getElementById("dashboard-alerts-card");
    const listEl = document.getElementById("dashboard-alerts-list");
    const noteEl = document.getElementById("dashboard-alerts-note");
    if (!alertsCard || !listEl) return;

    const summary = payload?.summary || {};
    const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
    const generatedAt = payload?.generated_at ? formatDateTimeDMY(payload.generated_at) : null;
    const sourceLabel = options?.cached ? "cache" : "live";

    if (!alerts.length) {
        listEl.innerHTML = `<div class="action-note">No active alerts. Operations are within expected ranges.</div>`;
    } else {
        listEl.innerHTML = alerts.slice(0, 8).map(item => {
            const severity = String(item?.severity || "low").toLowerCase();
            const pillClass = severity === "high" ? "bad" : severity === "medium" ? "warn" : "good";
            const metricValue = item?.metric_value == null ? "-" : String(item.metric_value);
            return `
                <div class="ai-assistant-item">
                    <span class="ai-pill ${pillClass}">${escapeHtml(severity.toUpperCase())}</span>
                    <div class="title">${escapeHtml(item?.title || "Operational alert")}</div>
                    <div class="detail">${escapeHtml(item?.message || "")}</div>
                    <div class="detail">${escapeHtml(String(item?.metric_key || "metric"))}: ${escapeHtml(metricValue)}</div>
                </div>
            `;
        }).join("");
    }

    if (noteEl) {
        noteEl.textContent = `${formatInteger(summary.high || 0)} high, ${formatInteger(summary.medium || 0)} medium, ${formatInteger(summary.low || 0)} low alerts (${sourceLabel}${generatedAt ? ` at ${generatedAt}` : ""}).`;
    }
}

async function loadOperationalAlerts(options = {}) {
    if (currentActivePage !== "dashboard" && options?.force !== true) {
        return null;
    }
    const token = localStorage.getItem("token");
    const silent = Boolean(options?.silent);
    const useCache = options?.useCache !== false;
    const refreshBtn = document.getElementById("dashboard-alerts-refresh-btn");
    if (operationalAlertsLoadPromise) {
        return operationalAlertsLoadPromise;
    }
    const controller = new AbortController();
    operationalAlertsLoadController = controller;
    if (refreshBtn) refreshBtn.disabled = true;

    const requestPromise = (async () => {
    try {
        if (useCache && operationalAlertsCache) {
            renderOperationalAlerts(operationalAlertsCache, { cached: true });
        }

        const data = await fetchJson(`${API_BASE}/api/admin/operational-alerts?lookahead_days=7`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        operationalAlertsCache = data || { alerts: [], summary: { total: 0, high: 0, medium: 0, low: 0 } };
        if (!controller.signal.aborted && currentActivePage === "dashboard") {
            renderOperationalAlerts(operationalAlertsCache, { cached: false });
        }
    } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return null;
        console.error("Failed to load operational alerts:", error);
        if (operationalAlertsCache) {
            renderOperationalAlerts(operationalAlertsCache, { cached: true });
            if (!silent) toastInfo("Operational alerts are showing cached data.");
        } else if (!silent) {
            toastError(error?.message || "Operational alerts failed to load");
        }
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
    }
    })();
    operationalAlertsLoadPromise = requestPromise.finally(() => {
        if (operationalAlertsLoadPromise === requestPromise) {
            operationalAlertsLoadPromise = null;
        }
        if (operationalAlertsLoadController === controller) {
            operationalAlertsLoadController = null;
        }
    });
    return operationalAlertsLoadPromise;
}

function applyDashboardPayload(data, options = {}) {
    document.getElementById("total-bookings").textContent = formatInteger(data.total_bookings);
    document.getElementById("total-members").textContent = formatInteger(data.total_members ?? data.total_players);
    document.getElementById("completed-rounds").textContent = formatInteger(data.completed_rounds);
    document.getElementById("today-bookings").textContent = formatInteger(data.today_bookings);
    dashboardDataCache = data;
    applyDashboardStreamView(data);

    renderTargetsTable(data.targets);
    renderDashboardTargetContext(data.targets);
}

async function loadDashboard(options = {}) {
    if (currentActivePage !== "dashboard" && options?.force !== true) {
        return null;
    }
    const token = localStorage.getItem("token");
    const silent = Boolean(options?.silent);
    const useCache = options?.useCache !== false;
    let renderedFromCache = false;
    if (dashboardLoadPromise) {
        return dashboardLoadPromise;
    }
    const controller = new AbortController();
    dashboardLoadController = controller;

    if (useCache && !dashboardDataCache) {
        const cached = readDashboardCache();
        if (cached?.data) {
            renderedFromCache = true;
            applyDashboardPayload(cached.data, { cached: true, cachedAt: cached.cachedAt });
        }
    }

    const requestPromise = (async () => {
    try {
        const data = await fetchJson(`${API_BASE}/api/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        writeDashboardCache(data);
        if (!controller.signal.aborted && currentActivePage === "dashboard") {
            applyDashboardPayload(data, { cached: false });
            scheduleDashboardOperationalAlerts();
        }
    } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return null;
        console.error("Failed to load dashboard:", error);
        if (dashboardDataCache || renderedFromCache) {
            if (!silent) toastInfo("Live dashboard refresh failed. Showing cached data.");
        } else if (!silent) {
            toastError(error?.message || "Dashboard failed to load");
        }
    }
    })();
    dashboardLoadPromise = requestPromise.finally(() => {
        if (dashboardLoadPromise === requestPromise) {
            dashboardLoadPromise = null;
        }
        if (dashboardLoadController === controller) {
            dashboardLoadController = null;
        }
    });
    return dashboardLoadPromise;
}

function renderTargetsTable(targets) {
    const body = document.getElementById("kpi-targets-body");
    if (!body) return;

    const periods = targets?.periods || {};
    const order = [
        { key: "day", label: "Today" },
        { key: "wtd", label: "Week-to-date" },
        { key: "mtd", label: "Month-to-date" },
        { key: "ytd", label: "Year-to-date" }
    ];

    body.innerHTML = order.map(({ key, label }) => {
        const p = periods[key] || {};
        const roundsActual = safeNumber(p.rounds_actual);
        const roundsTarget = p.rounds_target;
        const revenueActual = safeNumber(p.revenue_actual);
        const revenueTarget = p.revenue_target;
        const pct = revenueTarget ? (revenueActual / safeNumber(revenueTarget)) : null;

        return `
            <tr>
                <td><strong>${label}</strong></td>
                <td>${formatInteger(roundsActual)}</td>
                <td>${roundsTarget == null ? "—" : formatInteger(safeNumber(roundsTarget))}</td>
                <td>${formatCurrencyZAR(revenueActual)}</td>
                <td>${revenueTarget == null ? "—" : formatCurrencyZAR(revenueTarget)}</td>
                <td>${pct == null ? "—" : `<span class="kpi-pill ${pctPillClass(pct)}">${formatPct(pct)}</span>`}</td>
            </tr>
        `;
    }).join("");
}

function renderDashboardTargetContext(targets) {
    const noteEl = document.getElementById("dashboard-target-model-note");
    if (!noteEl) return;
    const annual = targets?.annual || {};
    const assumptions = annual?.assumptions || {};
    const roundsTarget = annual?.rounds;
    const revenueTarget = annual?.revenue;
    const memberRoundShare = Number(assumptions?.member_round_share);
    const memberRevenueShare = Number(assumptions?.member_revenue_share);
    const memberFee = Number(assumptions?.member_fee_18);
    const sourceLabel = formatTargetSourceLabel(annual?.revenue_source);
    if (roundsTarget == null && revenueTarget == null) {
        noteEl.textContent = "Target model is not configured yet.";
        return;
    }
    noteEl.textContent =
        `Annual rounds target ${roundsTarget == null ? "—" : formatInteger(roundsTarget)}. ` +
        `Annual revenue target ${revenueTarget == null ? "—" : formatCurrencyZAR(revenueTarget)} (${sourceLabel}). ` +
        `Mix: ${Number.isFinite(memberRoundShare) ? formatNumber(memberRoundShare * 100, 0, 2) : "—"}% member rounds, ` +
        `${Number.isFinite(memberRevenueShare) ? formatNumber(memberRevenueShare * 100, 0, 2) : "—"}% member revenue, ` +
        `member 18-hole fee ${Number.isFinite(memberFee) ? formatCurrencyZAR(memberFee) : "—"}.`;
}

// Bookings
function dateToYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function localTodayYMD() {
    return dateToYMD(new Date());
}

function normalizeTeeSheetDateValue(raw) {
    const value = String(raw || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function setSelectedTeeSheetDate(raw, { updateInput = false } = {}) {
    const normalized = normalizeTeeSheetDateValue(raw) || localTodayYMD();
    selectedTeeSheetDate = normalized;
    if (updateInput) {
        const input = document.getElementById("tee-sheet-date");
        if (input && input.value !== normalized) {
            input.value = normalized;
        }
    }
    return normalized;
}

function currentTeeSheetDate() {
    const input = document.getElementById("tee-sheet-date");
    const normalizedInput = normalizeTeeSheetDateValue(input?.value || "");
    if (normalizedInput) {
        selectedTeeSheetDate = normalizedInput;
        return normalizedInput;
    }
    if (normalizeTeeSheetDateValue(selectedTeeSheetDate)) {
        return selectedTeeSheetDate;
    }
    return setSelectedTeeSheetDate(localTodayYMD(), { updateInput: true });
}

function ymdToDate(dateStr) {
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
}

function mergeRevenueSeries(bookedSeries, paidSeries, otherSeries) {
    const map = new Map();
    (bookedSeries || []).forEach(item => {
        if (!item?.date) return;
        map.set(item.date, { booked: Number(item.amount || 0), paid: 0, other: 0 });
    });
    (paidSeries || []).forEach(item => {
        if (!item?.date) return;
        const existing = map.get(item.date) || { booked: 0, paid: 0, other: 0 };
        existing.paid = Number(item.amount || 0);
        map.set(item.date, existing);
    });
    (otherSeries || []).forEach(item => {
        if (!item?.date) return;
        const existing = map.get(item.date) || { booked: 0, paid: 0, other: 0 };
        existing.other = Number(item.amount || 0);
        map.set(item.date, existing);
    });
    const labels = Array.from(map.keys()).sort((a, b) => new Date(a) - new Date(b));
    return {
        labels,
        booked: labels.map(d => map.get(d)?.booked ?? 0),
        paid: labels.map(d => map.get(d)?.paid ?? 0),
        other: labels.map(d => map.get(d)?.other ?? 0),
    };
}

function buildBookingRange(dateStr, period) {
    const anchor = ymdToDate(dateStr);
    if (!anchor) return null;

    const p = String(period || "").toLowerCase();
    let rangeStart;
    let rangeEnd;

    if (p === "day") {
        rangeStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        rangeEnd = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1);
    } else if (p === "week") {
        // Monday-start week
        const mondayOffset = (anchor.getDay() + 6) % 7;
        rangeStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - mondayOffset);
        rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + 7);
    } else if (p === "month") {
        rangeStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        rangeEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    } else if (p === "ytd") {
        rangeStart = new Date(anchor.getFullYear(), 0, 1);
        rangeEnd = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1);
    } else {
        return null;
    }

    return {
        start: `${dateToYMD(rangeStart)}T00:00:00`,
        end: `${dateToYMD(rangeEnd)}T00:00:00`
    };
}

function setupBookingFilters() {
    const statusSelect = document.getElementById("filter-status");
    const integritySelect = document.getElementById("bookings-integrity-filter");
    const dateInput = document.getElementById("bookings-date");
    const dateBasisSelect = document.getElementById("bookings-date-basis");
    const sortSelect = document.getElementById("bookings-sort");
    const periodButtons = document.querySelectorAll(".booking-period-btn");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    if (dateBasisSelect instanceof HTMLSelectElement) {
        bookingDateBasis = String(dateBasisSelect.value || "tee_time").toLowerCase();
    }
    if (sortSelect instanceof HTMLSelectElement) {
        bookingSort = String(sortSelect.value || "tee_asc").toLowerCase();
    }
    if (integritySelect instanceof HTMLSelectElement) {
        bookingIntegrityFilter = normalizeBookingIntegrityFilter(integritySelect.value || bookingIntegrityFilter || "all");
    }

    applyBookingFilterUiState();

    statusSelect?.addEventListener("change", () => {
        currentPage = 1;
        if (bookingIntegrityFilter !== "all") {
            bookingIntegrityFilter = "all";
            applyBookingFilterUiState();
            syncAdminRouteLocation("bookings", normalizeAdminRoute("bookings"), { replace: true });
        }
        loadBookings();
    });

    integritySelect?.addEventListener("change", () => {
        bookingIntegrityFilter = normalizeBookingIntegrityFilter(integritySelect.value || "all");
        currentPage = 1;
        applyBookingFilterUiState();
        syncAdminRouteLocation("bookings", normalizeAdminRoute("bookings"), { replace: true });
        loadBookings();
    });

    dateInput?.addEventListener("change", () => {
        currentPage = 1;
        loadBookings();
    });

    dateBasisSelect?.addEventListener("change", () => {
        bookingDateBasis = String(dateBasisSelect.value || "tee_time").toLowerCase();
        currentPage = 1;
        loadBookings();
    });

    sortSelect?.addEventListener("change", () => {
        bookingSort = String(sortSelect.value || "tee_asc").toLowerCase();
        currentPage = 1;
        loadBookings();
    });

    periodButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            periodButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            bookingPeriod = normalizeBookingRoutePeriod(btn.dataset.period || "day");
            currentPage = 1;
            syncAdminRouteLocation("bookings", normalizeAdminRoute("bookings"), { replace: true });
            loadBookings();
        });
    });
}

function applyBookingFilterUiState() {
    const integrity = normalizeBookingIntegrityFilter(bookingIntegrityFilter);
    const integritySelect = document.getElementById("bookings-integrity-filter");
    const statusSelect = document.getElementById("filter-status");
    const noteEl = document.getElementById("bookings-integrity-note");

    if (integritySelect instanceof HTMLSelectElement) {
        integritySelect.value = integrity;
    }
    if (statusSelect instanceof HTMLSelectElement) {
        statusSelect.disabled = integrity !== "all";
        if (integrity !== "all") {
            statusSelect.value = "";
        }
    }
    document.querySelectorAll(".booking-period-btn").forEach(btn => {
        btn.classList.toggle("active", String(btn.dataset.period || "day") === normalizeBookingRoutePeriod(bookingPeriod));
    });
    if (noteEl) {
        if (integrity === "missing_paid_ledger") {
            noteEl.style.display = "";
            noteEl.textContent = "Showing checked-in/completed bookings with no linked ledger payment. Open a booking and save the payment method to repair the missing payment entry.";
        } else {
            noteEl.style.display = "none";
            noteEl.textContent = "";
        }
    }
}

function setupLedgerFilters() {
    const dateInput = document.getElementById("ledger-date");
    const periodButtons = document.querySelectorAll(".ledger-period-btn");
    const searchInput = document.getElementById("ledger-search");
    const exportedFilter = document.getElementById("ledger-exported-filter");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    if (exportedFilter instanceof HTMLSelectElement) {
        ledgerExportFilter = String(exportedFilter.value || "all").toLowerCase();
    }

    dateInput?.addEventListener("change", () => {
        currentLedgerPage = 1;
        loadLedger();
    });

    periodButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            periodButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            ledgerPeriod = btn.dataset.period || "day";
            currentLedgerPage = 1;
            loadLedger();
        });
    });

    let searchTimer = null;
    searchInput?.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentLedgerPage = 1;
            loadLedger();
        }, 250);
    });

    exportedFilter?.addEventListener("change", () => {
        ledgerExportFilter = String(exportedFilter.value || "all").toLowerCase();
        currentLedgerPage = 1;
        loadLedger();
    });
}

function renderReqPills(booking) {
    const pills = [];
    if (booking?.cart) pills.push("Cart");
    if (booking?.push_cart) pills.push("Push");
    if (booking?.caddy) pills.push("Caddy");
    return pills.length ? pills.join(", ") : "—";
}

async function loadBookings() {
    const token = localStorage.getItem("token");
    const status = document.getElementById("filter-status")?.value;
    const dateStr = document.getElementById("bookings-date")?.value;
    const integrity = normalizeBookingIntegrityFilter(bookingIntegrityFilter);

    try {
        let url = `${API_BASE}/api/admin/bookings?skip=${(currentPage - 1) * 10}&limit=10`;
        url += `&date_basis=${encodeURIComponent(bookingDateBasis || "tee_time")}`;
        url += `&sort=${encodeURIComponent(bookingSort || "tee_asc")}`;
        if (integrity !== "all") {
            url += `&integrity=${encodeURIComponent(integrity)}`;
        } else if (status) {
            url += `&status=${status}`;
        }

        const range = buildBookingRange(dateStr, bookingPeriod);
        if (range) {
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }

        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const table = document.getElementById("bookings-table");
        const rows = Array.isArray(data?.bookings) ? data.bookings : [];
        if (!rows.length) {
            const emptyReason = integrity === "missing_paid_ledger"
                ? "No checked-in/completed bookings are currently missing ledger payments for this date window."
                : "No bookings found for the selected filters.";
            table.innerHTML = `<tr><td colspan="16" style="text-align:center; color:#7f8c8d; padding: 18px;">${escapeHtml(emptyReason)}</td></tr>`;
        } else {
            table.innerHTML = rows.map(b => `
            <tr>
                <td>#${b.id}</td>
                <td>${escapeHtml(b.player_name)}</td>
                <td>${b.player_email ? escapeHtml(b.player_email) : "-"}</td>
                <td>${b.handicap_sa_id ? escapeHtml(b.handicap_sa_id) : "<span class=\"muted\">Unregistered</span>"}</td>
                <td>${b.home_club ? escapeHtml(b.home_club) : "-"}</td>
                <td>${b.handicap_index_at_booking == null ? "-" : Number(b.handicap_index_at_booking).toFixed(1)}</td>
                <td>${b.player_category ? escapeHtml(b.player_category) : "-"}</td>
                <td>${b.holes ? escapeHtml(String(b.holes)) : "-"}</td>
                <td>${b.prepaid === true ? "Yes" : (b.prepaid === false ? "No" : "-")}</td>
                <td>${renderReqPills(b)}</td>
                <td>${formatCurrencyZAR(b.price)}</td>
                <td><span class="status-badge ${statusToClass(b.status)}">${statusToLabel(b.status)}</span>${Number(b.ledger_entry_count || 0) === 0 && (b.status === "checked_in" || b.status === "completed") ? '<div class="muted" style="margin-top:4px; color:#b04a00;">Missing ledger</div>' : ""}</td>
                <td>${b.tee_time ? formatTimeDateDMY(b.tee_time) : "-"}</td>
                <td>${b.has_round ? (b.round_completed ? "Closed" : "Open") : "Not started"}</td>
                <td>${formatDateDMY(b.created_at)}</td>
                <td><button class="btn-view" onclick="viewBookingDetail(${b.id})">View</button></td>
            </tr>
        `).join("");
        }

        // Pagination
        const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / 10));
        if (currentPage > totalPages) {
            currentPage = totalPages;
            return loadBookings();
        }
        renderPagination("bookings-pagination", currentPage, totalPages, (page) => {
            currentPage = page;
            loadBookings();
        });
    } catch (error) {
        console.error("Failed to load bookings:", error);
    }
}

async function viewBookingDetail(bookingId) {
    const token = localStorage.getItem("token");

    try {
        if (!accountCustomersCache.length) {
            await loadAccountCustomersCache({ silent: true });
        }
        const booking = await fetchJson(`${API_BASE}/api/admin/bookings/${bookingId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        currentBookingDetail = booking;

        const status = String(booking.status || "");
        const statusClass = statusToClass(status);
        const statusLabel = statusToLabel(status) || "-";
        const isPaid = status === "checked_in" || status === "completed";

        const ledgerEntries = Array.isArray(booking.ledger_entries) ? booking.ledger_entries : [];
        const exportedEntry = ledgerEntries.find(le => Boolean(le.pastel_synced));
        const exportBatch = exportedEntry?.pastel_transaction_id || "";
        const existingPaymentMethod = String(ledgerEntries[0]?.payment_method || "").trim().toUpperCase();
        const paymentMethod = existingPaymentMethod || String(localStorage.getItem("last_payment_method") || "CARD").trim().toUpperCase() || "CARD";
        const paymentMethodOptions = ["CARD", "CASH", "EFT", "ONLINE", "ACCOUNT"]
            .map(m => `<option value="${m}" ${paymentMethod === m ? "selected" : ""}>${m}</option>`)
            .join("");

        const checkinLabel = status === "checked_in" ? "Open Round" : "Check In (Paid)";
        const disableCheckin = status === "cancelled" || status === "no_show";

        const disableComplete = status === "cancelled" || status === "no_show";
        const disableNoShow = status === "cancelled" || status === "completed";
        const disableCancel = status === "cancelled";
        const disableReopen = status === "booked";

        const allowAdminOnly = currentUserRole === "admin";

        const feeLabel = booking.fee_category
            ? booking.fee_category.description
            : (booking.fee_category_id ? `Fee #${booking.fee_category_id}` : "Auto / Custom");

        const html = `
            <div class="booking-detail-header">
                <div>
                    <div class="booking-detail-title">${displayValue(booking.player_name, "Booking")}</div>
                    <div class="booking-detail-sub">
                        Booking #${booking.id} - ${booking.tee_time ? formatTimeDateDMY(booking.tee_time) : "No tee time"}
                    </div>
                </div>
                <div class="booking-detail-badges">
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                    <span class="pill ${isPaid ? "paid" : "unpaid"}">${isPaid ? "Paid" : "Unpaid"}</span>
                    ${ledgerEntries.length ? `
                        <span class="pill ${exportedEntry ? "exported" : "not-exported"}" ${exportedEntry && exportBatch ? `title="Batch ${escapeHtml(exportBatch)}"` : ""}>
                            ${exportedEntry ? "Exported" : "Not exported"}
                        </span>
                    ` : ""}
                </div>
            </div>

            <div class="booking-detail-grid">
                <div class="booking-detail-card">
                    <h3>Player</h3>
                    <div class="detail-row">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${displayValue(booking.player_email, "N/A")}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Handicap</span>
                        <span class="detail-value">${displayValue(booking.handicap_number, "N/A")}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Member ID</span>
                        <span class="detail-value">${booking.member_id ? escapeHtml(String(booking.member_id)) : "—"}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Holes</span>
                        <span class="detail-value">${booking.holes ? escapeHtml(String(booking.holes)) : "—"}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Requirements</span>
                        <span class="detail-value">${renderReqPills({ cart: booking?.requirements?.cart, push_cart: booking?.requirements?.push_cart, caddy: booking?.requirements?.caddy })}</span>
                    </div>
                    <details class="booking-detail-advanced">
                        <summary>More player details</summary>
                        <div class="detail-row">
                            <span class="detail-label">Club card</span>
                            <span class="detail-value">${displayValue(booking.club_card, "N/A")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">HNA SA ID</span>
                            <span class="detail-value">${displayValue(booking.handicap_sa_id, "Unregistered")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Home Club</span>
                            <span class="detail-value">${displayValue(booking.home_club, "—")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">HI (Booking)</span>
                            <span class="detail-value">${booking.handicap_index_at_booking == null ? "—" : escapeHtml(Number(booking.handicap_index_at_booking).toFixed(1))}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Category</span>
                            <span class="detail-value">${displayValue(booking.player_category, "—")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Gender</span>
                            <span class="detail-value">${displayValue(booking.gender, "—")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Prepaid</span>
                            <span class="detail-value">${booking.prepaid === true ? "Yes" : (booking.prepaid === false ? "No" : "—")}</span>
                        </div>
                    </details>
                </div>

                <div class="booking-detail-card">
                    <h3>Pricing</h3>
                    <div class="detail-row">
                        <span class="detail-label">Fee</span>
                        <span class="detail-value">${displayValue(feeLabel, "Auto / Custom")}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Price</span>
                        <span class="detail-value">R${Number(booking.price || 0).toFixed(2)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Notes</span>
                        <span class="detail-value" style="white-space: pre-line;">${displayValue(booking.notes, "—")}</span>
                    </div>
	                    ${allowAdminOnly ? `
	                    <div style="margin-top: 10px;">
	                        <button class="btn-edit" onclick="openEditBookingPriceModal(${bookingId})">Override Price</button>
	                    </div>
	                    ` : ""}
                    <div class="detail-row" style="margin-top: 12px;">
                        <span class="detail-label">Created</span>
                        <span class="detail-value">${booking.created_at ? formatDateTimeDMY(booking.created_at) : "—"}</span>
                    </div>
                </div>

                <div class="booking-detail-card">
                    <h3>Payment & Ledger</h3>
                    <div class="detail-row">
                        <span class="detail-label">Entries</span>
                        <span class="detail-value">${ledgerEntries.length ? String(ledgerEntries.length) : "0"}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Payment method</span>
                        <span class="detail-value">
                            <select id="booking-payment-method" style="min-width: 120px;">
                                ${paymentMethodOptions}
                            </select>
                            ${isPaid ? `<button class="btn-secondary btn-small" type="button" onclick="saveBookingPaymentMethod(${bookingId})">${ledgerEntries.length ? "Save" : "Repair Entry"}</button>` : ""}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Debtor account</span>
                        <span class="detail-value">
                            <input id="booking-account-code" type="text" list="account-customer-codes" value="${escapeHtml(String(booking.club_card || ""))}" placeholder="e.g. 1100/015" style="min-width: 120px;" />
                            <button class="btn-secondary btn-small" type="button" onclick="saveBookingAccountCode(${bookingId})">Save</button>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Account customer</span>
                        <span class="detail-value">${escapeHtml(String(booking?.account_customer?.name || "—"))}</span>
                    </div>
                    ${ledgerEntries.length ? `
                        <div class="detail-row">
                            <span class="detail-label">Amount</span>
                            <span class="detail-value">R${Number(ledgerEntries[0].amount || 0).toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Export batch</span>
                            <span class="detail-value">${exportBatch ? escapeHtml(exportBatch) : "—"}</span>
                        </div>
                    ` : `
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${isPaid ? "Missing entry - save payment method to repair" : "Unpaid"}</span>
                        </div>
                    `}
                </div>

                <div class="booking-detail-card">
                    <h3>Round Sync</h3>
                    ${booking.round ? `
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${booking.round.closed ? "Closed ✓" : "Open"}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Hcp SA Round ID</span>
                            <span class="detail-value">${displayValue(booking.round.handicap_sa_round_id, "—")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Synced</span>
                            <span class="detail-value">${booking.round.handicap_synced ? "✓" : "—"}</span>
                        </div>
                        <details class="booking-detail-advanced">
                            <summary>Round scores</summary>
                            <pre style="white-space:pre-wrap; margin-top:10px;">${booking.round.scores ? escapeHtml(String(booking.round.scores)) : "No score payload yet."}</pre>
                        </details>
                    ` : `
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">Not started</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Tip</span>
                            <span class="detail-value">Use "${checkinLabel}"</span>
                        </div>
                    `}
                </div>
            </div>

            <div class="booking-detail-actions">
                <button class="btn-success" onclick="adminCheckIn(${bookingId})" ${disableCheckin ? "disabled" : ""}>${checkinLabel}</button>
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'completed')" ${disableComplete ? "disabled" : ""}>Mark Completed</button>
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'no_show')" ${disableNoShow ? "disabled" : ""}>No-show</button>
                <button class="btn-cancel" onclick="adminSetStatus(${bookingId}, 'cancelled')" ${disableCancel ? "disabled" : ""}>Cancel</button>
                ${allowAdminOnly ? `
                    <details class="booking-detail-advanced booking-detail-advanced-inline">
                        <summary>More actions</summary>
                        <div class="action-row">
                            <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'booked')" ${disableReopen ? "disabled" : ""}>Reopen</button>
                            <button class="btn-cancel" onclick="adminDeleteBooking(${bookingId})">Remove</button>
                        </div>
                    </details>
                ` : ""}
            </div>
        `;

        document.getElementById("modal-body").innerHTML = html;
        document.getElementById("booking-modal").classList.add("show");

        const pm = document.getElementById("booking-payment-method");
        if (pm) {
            pm.addEventListener("change", () => {
                localStorage.setItem("last_payment_method", String(pm.value || "").trim().toUpperCase());
            });
        }
    } catch (error) {
        console.error("Failed to load booking detail:", error);
    }
}

// Players
function setupPeopleFilters() {
    const buttons = document.querySelectorAll("#players .people-btn");
    const searchInput = document.getElementById("people-search");
    const guestFilter = document.getElementById("guest-type-filter");
    const areaFilter = document.getElementById("people-area-filter");
    const statusFilter = document.getElementById("people-status-filter");
    const sortSelect = document.getElementById("people-sort");
    const quickFilter = document.getElementById("people-quick-filter");
    const addBtn = document.getElementById("people-add-btn");
    if (!buttons.length) return;
    if (sortSelect instanceof HTMLSelectElement) {
        peopleSort = String(sortSelect.value || "recent_activity").toLowerCase();
    }
    if (areaFilter instanceof HTMLSelectElement) {
        peopleAreaFilter = String(areaFilter.value || "all").toLowerCase();
    }
    if (statusFilter instanceof HTMLSelectElement) {
        peopleStatusFilter = String(statusFilter.value || "active").toLowerCase();
    }
    if (quickFilter instanceof HTMLSelectElement) {
        peopleQuickFilter = String(quickFilter.value || "all").toLowerCase();
    }

    const applyPeopleSortOptions = () => {
        if (!(sortSelect instanceof HTMLSelectElement)) return;
        const optionsForView = (peopleView === "staff")
            ? [
                { value: "name_asc", label: "Name A-Z" },
                { value: "name_desc", label: "Name Z-A" },
                { value: "code_asc", label: "Code A-Z" },
            ]
            : [
                { value: "recent_activity", label: "Recent Activity" },
                { value: "bookings_desc", label: "Most Bookings" },
                { value: "spend_desc", label: "Highest Spend" },
                { value: "name_asc", label: "Name A-Z" },
                { value: "name_desc", label: "Name Z-A" },
            ];
        const current = String(peopleSort || "").toLowerCase();
        sortSelect.innerHTML = optionsForView
            .map(opt => `<option value="${opt.value}">${opt.label}</option>`)
            .join("");
        const valid = optionsForView.some(opt => opt.value === current);
        peopleSort = valid ? current : optionsForView[0].value;
        sortSelect.value = peopleSort;
    };

    const applyQuickFilterPreset = () => {
        switch (peopleQuickFilter) {
            case "golf_members":
                peopleView = "members";
                peopleAreaFilter = "golf";
                peopleStatusFilter = "active";
                break;
            case "tennis_members":
                peopleView = "members";
                peopleAreaFilter = "tennis";
                peopleStatusFilter = "active";
                break;
            case "bowls_members":
                peopleView = "members";
                peopleAreaFilter = "bowls";
                peopleStatusFilter = "active";
                break;
            case "non_golf_members":
                peopleView = "members";
                peopleAreaFilter = "general";
                peopleStatusFilter = "active";
                break;
            case "staff":
                peopleView = "staff";
                peopleAreaFilter = "general";
                peopleStatusFilter = "active";
                break;
            default:
                break;
        }
        applyPeoplePreset({ view: peopleView, operation: peopleAreaFilter, quickFilter: peopleQuickFilter, status: peopleStatusFilter });
    };

    const syncPeopleViewState = () => {
        applyPeoplePreset({ view: peopleView, operation: peopleAreaFilter, quickFilter: peopleQuickFilter, status: peopleStatusFilter });
        applyPeopleSortOptions();
    };

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            peopleView = btn.dataset.view || "members";
            peopleQuickFilter = "all";
            peopleContextMode = "general";
            currentPlayersPage = 1;

            // Reset horizontal scroll when switching between wide tables (members) and narrow ones (staff).
            const tableWrap = document.querySelector("#players .table-container");
            if (tableWrap) tableWrap.scrollLeft = 0;

            syncPeopleViewState();
            loadPlayers();
        });
    });

    let searchTimer = null;
    searchInput?.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentPlayersPage = 1;
            loadPlayers();
        }, 250);
    });

    guestFilter?.addEventListener("change", () => {
        guestTypeFilter = String(guestFilter.value || "all");
        currentPlayersPage = 1;
        loadPlayers();
    });
    areaFilter?.addEventListener("change", () => {
        peopleAreaFilter = String(areaFilter.value || "golf").toLowerCase();
        currentPlayersPage = 1;
        loadPlayers();
    });
    statusFilter?.addEventListener("change", () => {
        peopleStatusFilter = String(statusFilter.value || "active").toLowerCase();
        currentPlayersPage = 1;
        loadPlayers();
    });
    quickFilter?.addEventListener("change", () => {
        peopleQuickFilter = String(quickFilter.value || "all").toLowerCase();
        currentPlayersPage = 1;
        applyQuickFilterPreset();
        syncPeopleViewState();
        loadPlayers();
    });

    sortSelect?.addEventListener("change", () => {
        peopleSort = String(sortSelect.value || "recent_activity").toLowerCase();
        currentPlayersPage = 1;
        loadPlayers();
    });

    addBtn?.addEventListener("click", () => {
        if (peopleView === "members") {
            openMemberEditModal(null);
        } else if (peopleView === "staff") {
            openStaffEditModal(null);
        }
    });

    syncPeopleViewState();
}

function renderPeopleSummary({ total = 0, active = 0, inactive = 0, flagged = 0 } = {}) {
    const totalEl = document.getElementById("people-summary-total");
    const activeEl = document.getElementById("people-summary-active");
    const inactiveEl = document.getElementById("people-summary-inactive");
    const flaggedEl = document.getElementById("people-summary-flagged");
    if (totalEl) totalEl.textContent = formatInteger(total);
    if (activeEl) activeEl.textContent = formatInteger(active);
    if (inactiveEl) inactiveEl.textContent = formatInteger(inactive);
    if (flaggedEl) flaggedEl.textContent = formatInteger(flagged);
}

function isAbortLikeError(error) {
    const name = String(error?.name || "").trim();
    const causeName = String(error?.cause?.name || "").trim();
    const message = String(error?.message || "").toLowerCase();
    return (
        name === "AbortError"
        || name === "CanceledError"
        || (name === "TimeoutError" && causeName === "AbortError")
        || message.includes("signal is aborted")
    );
}

function memberAppliedPricingLabel(member) {
    const applied = String(member?.applied_pricing_label || "").trim();
    if (applied) return applied;
    const mode = String(member?.pricing_mode || "membership_default").trim().toLowerCase();
    return {
        membership_default: "Membership Default",
        visitor_override: "Visitor Override",
        non_affiliated_override: "Non-affiliated Override",
        reciprocity_override: "Reciprocity Override",
    }[mode] || "Membership Default";
}

async function loadPlayers() {
    const token = localStorage.getItem("token");
    const search = document.getElementById("people-search")?.value?.trim();
    const tableHead = document.getElementById("people-table-head");
    const tableBody = document.getElementById("players-table");
    if (!tableHead || !tableBody) return;
    const requestKey = JSON.stringify({
        page: currentPlayersPage,
        view: peopleView,
        guestType: guestTypeFilter,
        area: peopleAreaFilter,
        status: peopleStatusFilter,
        sort: peopleSort,
        quick: peopleQuickFilter,
        search: search || "",
    });
    if (peopleLoadPromise && peopleLoadRequestKey === requestKey) {
        return peopleLoadPromise;
    }
    if (peopleLoadController) {
        peopleLoadController.abort();
    }
    const controller = new AbortController();
    peopleLoadController = controller;
    peopleLoadRequestKey = requestKey;

    const requestPromise = (async () => {
    try {
        let url = `${API_BASE}/api/admin/members?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        if (peopleView === "members") {
            url = `${API_BASE}/api/admin/members?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
            if (peopleAreaFilter && peopleAreaFilter !== "all") {
                url += `&area=${encodeURIComponent(peopleAreaFilter)}`;
            }
            if (peopleStatusFilter && peopleStatusFilter !== "all") {
                url += `&membership_status=${encodeURIComponent(peopleStatusFilter)}`;
            }
        } else if (peopleView === "guests") {
            url = `${API_BASE}/api/admin/guests?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
            if (guestTypeFilter && guestTypeFilter !== "all") {
                url += `&guest_type=${encodeURIComponent(guestTypeFilter)}`;
            }
        } else if (peopleView === "staff") {
            url = `${API_BASE}/api/admin/staff?skip=0&limit=250`;
        }
        const joiner = url.includes("?") ? "&" : "?";
        if (search) url += `${joiner}q=${encodeURIComponent(search)}`;
        if (peopleSort) url += `${url.includes("?") ? "&" : "?"}sort=${encodeURIComponent(peopleSort)}`;

        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            timeoutMs: 20000,
        });
        const operationalContext = isOperationalPeopleContext();

        if (peopleView === "members") {
            const members = Array.isArray(data.members) ? data.members : [];
            const activeCount = members.filter((m) => String(m.member_lifecycle_status || m.membership_status || "").toLowerCase() === "active").length;
            const inactiveCount = members.filter((m) => ["hold", "inactive", "resigned", "deceased"].includes(String(m.member_lifecycle_status || m.membership_status || "").toLowerCase())).length;
            const flaggedCount = members.filter((m) => Boolean(m.financial_flag) || String(m.member_lifecycle_status || "").toLowerCase() === "defaulter").length;
            renderPeopleSummary({
                total: Number(data.total || members.length),
                active: activeCount,
                inactive: inactiveCount,
                flagged: flaggedCount,
            });
            tableHead.innerHTML = operationalContext
                ? `
                    <th>Full Name</th>
                    <th>Membership Category</th>
                    <th>Status</th>
                    <th>Pricing</th>
                    <th>Contact</th>
                    <th>Last Activity</th>
                    <th>Financial Flag</th>
                    <th>Action</th>
                `
                : `
                    <th>Full Name</th>
                    <th>Person Type</th>
                    <th>Primary Operation</th>
                    <th>Membership Category</th>
                    <th>Pricing</th>
                    <th>Status</th>
                    <th>Contact</th>
                    <th>Financial Flag</th>
                    <th>Action</th>
                `;
            tableBody.innerHTML = members.map(m => `
                <tr>
                    <td>${escapeHtml(m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim())}</td>
                    ${operationalContext ? `
                        <td>${escapeHtml(String(m.membership_category_raw || m.membership_category || m.membership_group || "-"))}</td>
                        <td>${escapeHtml(String(m.member_lifecycle_status || m.membership_status || (m.active ? "active" : "inactive")))}</td>
                        <td><span class="acct-pill" title="${escapeHtml(String(m.pricing_label || memberAppliedPricingLabel(m)))}">${escapeHtml(memberAppliedPricingLabel(m))}</span></td>
                        <td>${m.email ? `<a href="mailto:${encodeURIComponent(String(m.email))}">${escapeHtml(m.email)}</a>` : "-"}${m.phone ? `<div><a href="tel:${escapeHtml(String(m.phone))}">${escapeHtml(m.phone)}</a></div>` : ""}</td>
                        <td>${m.last_seen ? formatDateTimeDMY(m.last_seen) : "<span class=\"muted\">No activity</span>"}</td>
                        <td>${m.financial_flag ? `<span class="acct-pill bad">${escapeHtml(String(m.financial_flag))}</span>` : (Number(m.total_spent || 0) > 0 ? `<span class="acct-pill">${formatCurrencyZAR(m.total_spent || 0)} collected</span>` : "-")}</td>
                        <td class="row-actions"><button class="btn-view" onclick="viewMemberDetail(${m.id})">Profile</button></td>
                    ` : `
                        <td>${escapeHtml(String(m.person_type || "Member"))}</td>
                        <td>${escapeHtml(String(m.primary_operation || "-"))}</td>
                        <td>${escapeHtml(String(m.membership_category_raw || m.membership_category || m.membership_group || "-"))}</td>
                        <td><span class="acct-pill" title="${escapeHtml(String(m.pricing_label || memberAppliedPricingLabel(m)))}">${escapeHtml(memberAppliedPricingLabel(m))}</span></td>
                        <td>${escapeHtml(String(m.member_lifecycle_status || m.membership_status || (m.active ? "active" : "inactive")))}</td>
                        <td>${m.email ? `<a href="mailto:${encodeURIComponent(String(m.email))}">${escapeHtml(m.email)}</a>` : "-"}${m.phone ? `<div><a href="tel:${escapeHtml(String(m.phone))}">${escapeHtml(m.phone)}</a></div>` : ""}</td>
                        <td>${m.financial_flag ? `<span class="acct-pill bad">${escapeHtml(String(m.financial_flag))}</span>` : (Number(m.total_spent || 0) > 0 ? `<span class="acct-pill">${formatCurrencyZAR(m.total_spent || 0)} collected</span>` : "-")}</td>
                        <td class="row-actions"><button class="btn-view" onclick="viewMemberDetail(${m.id})">Profile</button></td>
                    `}
                </tr>
            `).join("");

            if (!members.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${operationalContext ? 8 : 9}" style="text-align:center; color:#7f8c8d; padding: 18px;">No members found.</td>
                    </tr>
                `;
            }
        } else if (peopleView === "guests") {
            const guests = Array.isArray(data.guests) ? data.guests : [];
            renderPeopleSummary({
                total: guests.length,
                active: guests.length,
                inactive: 0,
                flagged: guests.filter((g) => Number(g.total_spent || 0) > 0).length,
            });
            tableHead.innerHTML = `
                <th>Full Name</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Last Activity</th>
                <th>Spend</th>
            `;
            tableBody.innerHTML = guests.map(g => `
                <tr>
                    <td>${escapeHtml(g.name || "-")}</td>
                    <td>${guestTypeFilter === "affiliated" ? "Affiliated Guest" : guestTypeFilter === "non_affiliated" ? "Non-affiliated Guest" : "Guest"}</td>
                    <td>${g.email ? escapeHtml(g.email) : "-"}${g.handicap_number ? `<div>${escapeHtml(g.handicap_number)}</div>` : ""}</td>
                    <td>${g.last_seen ? formatDateTimeDMY(g.last_seen) : "-"}</td>
                    <td>${formatCurrencyZAR(g.total_spent || 0)}</td>
                </tr>
            `).join("");

            if (!guests.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; color:#7f8c8d; padding: 18px;">No guests found.</td>
                    </tr>
                `;
            }
        } else if (peopleView === "staff") {
            let staff = Array.isArray(data.staff) ? data.staff : [];
            if (peopleAreaFilter && peopleAreaFilter !== "all") {
                staff = staff.filter(s => {
                    const op = String(s.operation_area || "").toLowerCase();
                    return peopleAreaFilter === "general" ? !op || op.includes("general") || op.includes("finance") : op.includes(peopleAreaFilter.replace("_", " "));
                });
            }
            renderPeopleSummary({
                total: staff.length,
                active: staff.length,
                inactive: 0,
                flagged: staff.filter((s) => String(s.role || "").toLowerCase() !== "club_staff").length,
            });
            tableHead.innerHTML = `
                <th>Full Name</th>
                <th>Role</th>
                <th>Operation</th>
                <th>Contact</th>
                <th>Action</th>
            `;

            const start = (currentPlayersPage - 1) * 10;
            const pageRows = staff.slice(start, start + 10);
            tableBody.innerHTML = pageRows.map(s => `
                <tr>
                    <td>${escapeHtml(s.name || "-")}</td>
                    <td>${escapeHtml(String(s.operational_role || s.role || "-"))}</td>
                    <td>${escapeHtml(String(s.operation_area || "General / Operations"))}</td>
                    <td>${s.email ? `<a href="mailto:${encodeURIComponent(String(s.email))}">${escapeHtml(s.email)}</a>` : "-"}</td>
                    <td>${
                        (currentUserRole === "admin" || currentUserRole === "super_admin")
                            ? (String(s.role || "").toLowerCase() === "club_staff"
                                ? `<button class="btn-view" onclick="openStaffEditModal(${s.id})">Open</button>`
                                : `<span class="muted">Super Admin only</span>`)
                            : ""
                    }</td>
                </tr>
            `).join("");

            if (!pageRows.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align:center; color:#7f8c8d; padding: 18px;">No staff found.</td>
                    </tr>
                `;
            }
            renderPagination("players-pagination", currentPlayersPage, Math.ceil(staff.length / 10) || 1, (page) => {
                currentPlayersPage = page;
                loadPlayers();
            });
            return;
        } else {
            renderPeopleSummary();
            tableHead.innerHTML = `
                <th>Name</th>
                <th>Email</th>
                <th>Handicap</th>
                <th>HNA SA ID</th>
                <th>Home Club</th>
                <th>HI</th>
                <th>Gender</th>
                <th>Cat</th>
                <th>Bookings</th>
                <th>Total Spent</th>
                <th>Action</th>
            `;

            const players = Array.isArray(data.players) ? data.players : [];
            tableBody.innerHTML = players.map(p => `
                <tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.email)}</td>
                    <td>${p.handicap_number ? escapeHtml(p.handicap_number) : "-"}</td>
                    <td>${p.handicap_sa_id ? escapeHtml(p.handicap_sa_id) : "<span class=\"muted\">Unregistered</span>"}</td>
                    <td>${p.home_course ? escapeHtml(p.home_course) : "-"}</td>
                    <td>${p.handicap_index == null ? "-" : Number(p.handicap_index).toFixed(1)}</td>
                    <td>${p.gender ? escapeHtml(p.gender) : "-"}</td>
                    <td>${p.player_category ? escapeHtml(p.player_category) : "-"}</td>
                    <td>${formatInteger(p.bookings_count || 0)}</td>
                    <td>${formatCurrencyZAR(p.total_spent || 0)}</td>
                    <td><button class="btn-view" onclick="viewPlayerDetail(${p.id})">View</button></td>
                </tr>
            `).join("");

            if (!players.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align:center; color:#7f8c8d; padding: 18px;">No accounts found.</td>
                    </tr>
                `;
            }
        }

        const totalPages = Math.ceil(Number(data.total || 0) / 10) || 1;
        if (currentPlayersPage > totalPages) {
            currentPlayersPage = totalPages;
            return loadPlayers();
        }
        renderPagination("players-pagination", currentPlayersPage, totalPages, (page) => {
            currentPlayersPage = page;
            loadPlayers();
        });
    } catch (error) {
        if (isAbortLikeError(error)) {
            return;
        }
        console.error("Failed to load players:", error);
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:#7f8c8d; padding: 18px;">Failed to load people.</td></tr>`;
    } finally {
        if (peopleLoadController === controller) {
            peopleLoadController = null;
        }
        if (peopleLoadPromise === requestPromise) {
            peopleLoadPromise = null;
        }
        if (peopleLoadRequestKey === requestKey && peopleLoadController == null) {
            peopleLoadRequestKey = "";
        }
    }
    })();
    peopleLoadPromise = requestPromise;
    return requestPromise;
}

async function loadAccountCustomersPage() {
    const token = localStorage.getItem("token");
    const search = String(document.getElementById("account-customers-search")?.value || "").trim();
    const operation = String(document.getElementById("account-customers-operation")?.value || "all").toLowerCase();
    const status = String(document.getElementById("account-customers-status")?.value || "all").toLowerCase();
    const body = document.getElementById("account-customers-body");
    if (!body) return;
    try {
        const data = await fetchJson(`${API_BASE}/api/admin/account-customers${search ? `?q=${encodeURIComponent(search)}` : ""}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        let rows = Array.isArray(data?.account_customers) ? data.account_customers : [];
        if (operation !== "all") {
            rows = rows.filter((row) => {
                const area = String(row.operation_area || "").toLowerCase();
                if (operation === "general") return !area || area.includes("general") || area.includes("debtor");
                return area.includes(operation.replace("_", " "));
            });
        }
        if (status !== "all") {
            rows = rows.filter((row) => status === "active" ? Boolean(row.active) : !row.active);
        }
        accountCustomersPageRows = rows;
        document.getElementById("account-customers-total").textContent = formatInteger(rows.length);
        document.getElementById("account-customers-active").textContent = formatInteger(rows.filter((row) => row.active).length);
        document.getElementById("account-customers-golf").textContent = formatInteger(rows.filter((row) => String(row.operation_area || "").toLowerCase().includes("golf")).length);
        document.getElementById("account-customers-contacts").textContent = formatInteger(rows.filter((row) => String(row.billing_contact || "").trim()).length);
        body.innerHTML = rows.map((row) => `
            <tr>
                <td>${escapeHtml(String(row.name || "-"))}</td>
                <td>${row.account_code ? escapeHtml(String(row.account_code)) : "-"}</td>
                <td>${escapeHtml(String(row.billing_contact || "-"))}</td>
                <td>${escapeHtml(String(row.customer_type || "Account Customer"))}</td>
                <td>${escapeHtml(String(row.terms || "-"))}</td>
                <td>${row.active ? '<span class="acct-pill good">Active</span>' : '<span class="acct-pill">Inactive</span>'}</td>
                <td class="row-actions"><button class="btn-view" onclick="openAccountCustomerDetail(${Number(row.id)})">View</button></td>
            </tr>
        `).join("") || `<tr><td colspan="7" style="text-align:center; color:#7f8c8d; padding: 18px;">No account customers found.</td></tr>`;
    } catch (error) {
        console.error("Failed to load account customers page:", error);
        body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#7f8c8d; padding: 18px;">Failed to load account customers.</td></tr>`;
    }
}

async function loadGolfDayBookingsPage() {
    const token = localStorage.getItem("token");
    const search = String(document.getElementById("golf-days-search")?.value || "").trim();
    const status = String(document.getElementById("golf-days-status")?.value || "all").toLowerCase();
    const body = document.getElementById("golf-days-body");
    if (!body) return;
    try {
        let url = `${API_BASE}/api/admin/golf-day-bookings`;
        const params = [];
        if (search) params.push(`q=${encodeURIComponent(search)}`);
        if (status && status !== "all") params.push(`status=${encodeURIComponent(status)}`);
        if (params.length) url += `?${params.join("&")}`;
        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const rows = Array.isArray(data?.bookings) ? data.bookings : [];
        golfDayBookingsPageRows = rows;
        document.getElementById("golf-days-total").textContent = formatInteger(rows.length);
        document.getElementById("golf-days-gross").textContent = formatCurrencyZAR(data?.total_amount || 0);
        document.getElementById("golf-days-outstanding").textContent = formatCurrencyZAR(data?.outstanding_balance || 0);
        document.getElementById("golf-days-paid").textContent = formatInteger(rows.filter((row) => String(row.payment_status || "").toLowerCase() === "paid").length);
        body.innerHTML = rows.map((row) => `
            <tr>
                <td>${escapeHtml(String(row.event_name || "-"))}</td>
                <td>${row.event_date ? formatYMDToDMY(row.event_date) : escapeHtml(String(row.event_date_raw || "-"))}</td>
                <td>${escapeHtml(String(row.account_customer_name || row.contact_name || "-"))}</td>
                <td>${escapeHtml(String(row.invoice_reference || "-"))}</td>
                <td>${formatCurrencyZAR(row.amount || 0)}</td>
                <td>${row.balance_due == null ? "-" : formatCurrencyZAR(row.balance_due)}</td>
                <td>${escapeHtml(String(row.payment_status || "-"))}</td>
                <td class="row-actions"><button class="btn-view" onclick="openGolfDayBookingDetail(${Number(row.id)})">View</button></td>
            </tr>
        `).join("") || `<tr><td colspan="8" style="text-align:center; color:#7f8c8d; padding: 18px;">No golf day bookings found.</td></tr>`;
    } catch (error) {
        console.error("Failed to load golf day bookings page:", error);
        body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#7f8c8d; padding: 18px;">Failed to load golf day bookings.</td></tr>`;
    }
}

function openAccountCustomerDetail(accountCustomerId) {
    const row = accountCustomersPageRows.find((item) => Number(item.id) === Number(accountCustomerId))
        || accountCustomersCache.find((item) => Number(item.id) === Number(accountCustomerId));
    if (!row) {
        toastError("Account customer not loaded");
        return;
    }
    document.getElementById("player-modal-body").innerHTML = `
        <div class="modal-section"><h2>${escapeHtml(String(row.name || "Account Customer"))}</h2></div>
        <div class="modal-section"><div class="modal-label">Account Code</div><div class="modal-value">${escapeHtml(String(row.account_code || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Billing Contact</div><div class="modal-value">${escapeHtml(String(row.billing_contact || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Operation</div><div class="modal-value">${escapeHtml(String(row.operation_area || "General / Debtors"))}</div></div>
        <div class="modal-section"><div class="modal-label">Terms</div><div class="modal-value">${escapeHtml(String(row.terms || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Source File</div><div class="modal-value">${escapeHtml(String(row.source_file || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Notes</div><div class="modal-value">${escapeHtml(String(row.notes || "No notes recorded."))}</div></div>
    `;
    document.getElementById("player-modal").classList.add("show");
}

function openGolfDayBookingDetail(golfDayBookingId) {
    const row = golfDayBookingsPageRows.find((item) => Number(item.id) === Number(golfDayBookingId));
    if (!row) {
        toastError("Golf day booking not loaded");
        return;
    }
    document.getElementById("player-modal-body").innerHTML = `
        <div class="modal-section"><h2>${escapeHtml(String(row.event_name || "Golf Day Booking"))}</h2></div>
        <div class="modal-section"><div class="modal-label">Event Date</div><div class="modal-value">${row.event_date ? formatYMDToDMY(row.event_date) : escapeHtml(String(row.event_date_raw || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Customer</div><div class="modal-value">${escapeHtml(String(row.account_customer_name || row.contact_name || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Invoice</div><div class="modal-value">${escapeHtml(String(row.invoice_reference || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Gross Amount</div><div class="modal-value">${formatCurrencyZAR(row.amount || 0)}</div></div>
        <div class="modal-section"><div class="modal-label">Balance Due</div><div class="modal-value">${row.balance_due == null ? "-" : formatCurrencyZAR(row.balance_due)}</div></div>
        <div class="modal-section"><div class="modal-label">Payment Status</div><div class="modal-value">${escapeHtml(String(row.payment_status || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Source File</div><div class="modal-value">${escapeHtml(String(row.source_file || "-"))}</div></div>
        <div class="modal-section"><div class="modal-label">Notes</div><div class="modal-value">${escapeHtml(String(row.notes || "No notes recorded."))}</div></div>
    `;
    document.getElementById("player-modal").classList.add("show");
}

async function viewPlayerDetail(playerId) {
    const token = localStorage.getItem("token");

    try {
        const player = await fetchJson(`${API_BASE}/api/admin/players/${playerId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const html = `
            <div class="modal-section">
                <div class="modal-label">Name</div>
                <div class="modal-value">${player.name}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Email</div>
                <div class="modal-value">${player.email}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Handicap</div>
                <div class="modal-value">${player.handicap_number || "Not provided"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">HNA SA ID</div>
                <div class="modal-value">${player.handicap_sa_id || "Unregistered"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Home Club</div>
                <div class="modal-value">${player.home_course || "Not set"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Handicap Index</div>
                <div class="modal-value">${player.handicap_index == null ? "Not set" : Number(player.handicap_index).toFixed(1)}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Gender / Category</div>
                <div class="modal-value">${(player.gender || "—") + " / " + (player.player_category || "—")}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Pricing Source</div>
                <div class="modal-value">Bookings derive price from the club pricing matrix and booking context.</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Total Spent</div>
                <div class="modal-value">R${player.total_spent.toFixed(2)}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Total Bookings</div>
                <div class="modal-value">${player.bookings_count}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Completed Rounds</div>
                <div class="modal-value">${player.completed_rounds}</div>
            </div>
            <div class="modal-section">
                <h3>Recent Bookings</h3>
                <table class="data-table" style="font-size: 12px;">
                    <thead>
                        <tr>
                            <th>Price</th>
                            <th>Status</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${player.recent_bookings.map(b => `
                        <tr>
                            <td>R${b.price.toFixed(2)}</td>
                            <td><span class="status-badge ${b.status}" style="font-size: 10px;">${b.status}</span></td>
                            <td>${formatDateDMY(b.created_at)}</td>
                        </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById("player-modal-body").innerHTML = html;
        document.getElementById("player-modal").classList.add("show");
    } catch (error) {
        console.error("Failed to load player detail:", error);
    }
}

function closePriceModal() {
    document.getElementById("player-modal").classList.remove("show");
}

// ========================
// Booking Price Editing
// ========================

async function openEditBookingPriceModal(bookingId) {
    const token = localStorage.getItem("token");

    try {
        await loadGolfFees();
        const booking = currentBookingDetail;
        const defaultPlayerType = booking?.member_id ? "member" : "visitor";

        const html = `
            <div class="modal-section">
                <button class="btn-secondary btn-small" type="button" onclick="viewBookingDetail(${bookingId})">Back</button>
                <h2 style="margin-top: 12px;">Override Booking Price</h2>
            </div>
            <div class="modal-section">
                <label>Apply Canonical Pricing</label>
                <div class="action-row">
                    <select id="booking-auto-player-type" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #d0d7de;">
                        <option value="member" ${defaultPlayerType === "member" ? "selected" : ""}>Member</option>
                        <option value="visitor" ${defaultPlayerType === "visitor" ? "selected" : ""}>Visitor</option>
                    </select>
                    <select id="booking-auto-player-category" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #d0d7de;">
                        <option value="">Standard</option>
                        <option value="student">Student</option>
                        <option value="scholar">Scholar</option>
                        <option value="pensioner">Pensioner</option>
                    </select>
                    <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:#2c3e50;">
                        <input type="checkbox" id="booking-auto-senior" />
                        Senior (60+)
                    </label>
                    <button class="btn-primary" type="button" onclick="applyAutoBookingPrice(${bookingId})">Apply Auto Price</button>
                </div>
            </div>
            <div class="modal-section">
                <label>Or select a fee manually</label>
                <select id="booking-fee-category-select" style="width: 100%; padding: 8px; margin: 10px 0;">
                    <option value="">-- Use Custom Price --</option>
                    ${golfFeesCache.map(cat => `
                        <option value="${cat.id}">${cat.description} (R${Number(cat.price).toFixed(0)})</option>
                    `).join("")}
                </select>
            </div>
            <div class="modal-section">
                <label>Or enter a one-off manual price (R)</label>
                <input type="number" id="booking-custom-price-input" placeholder="Enter custom price" step="0.01" min="0" style="width: 100%; padding: 8px; margin: 10px 0;">
            </div>
            <div class="modal-section" style="display: flex; gap: 10px;">
                <button class="btn-save" onclick="saveBookingPrice(${bookingId})">Save Price</button>
                <button class="btn-cancel" onclick="closeBookingPriceModal()">Cancel</button>
            </div>
        `;

        document.getElementById("modal-body").innerHTML = html;
    } catch (error) {
        console.error("Failed to load fee categories:", error);
        alert("Failed to load fee categories");
    }
}

async function applyAutoBookingPrice(bookingId) {
    const playerType = document.getElementById("booking-auto-player-type")?.value || "visitor";
    const senior = Boolean(document.getElementById("booking-auto-senior")?.checked);
    const playerCategory = String(document.getElementById("booking-auto-player-category")?.value || "").trim().toLowerCase();
    const teeTimeId = currentBookingDetail?.tee_time_id;

    if (!teeTimeId) {
        alert("Missing tee time for this booking.");
        return;
    }

    try {
        const suggested = await suggestAdminFee("golf", {
            tee_time_id: teeTimeId,
            player_type: playerType,
            holes: 18,
            player_category: playerCategory || (senior ? "pensioner" : null),
            age: senior || playerCategory === "pensioner" ? 60 : null
        });

        if (!suggested) {
            alert("No matching fee found. Pick a fee manually.");
            return;
        }
        await saveBookingPrice(bookingId, { fee_category_id: suggested.id });
    } catch (e) {
        console.error("Auto price failed:", e);
        alert("Auto price failed.");
    }
}

async function saveBookingPrice(bookingId, overridePayload = null) {
    const token = localStorage.getItem("token");
    const feeSelect = document.getElementById("booking-fee-category-select");
    const customPrice = document.getElementById("booking-custom-price-input");

    let payload = overridePayload || {};

    if (!overridePayload) {
        if (feeSelect.value) {
            payload.fee_category_id = parseInt(feeSelect.value);
        } else if (customPrice.value) {
            payload.custom_price = parseFloat(customPrice.value);
        } else {
            alert("Please select a fee type or enter a custom price");
            return;
        }
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/price`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            alert("Error: " + result.detail);
            return;
        }

        toastSuccess(result.message || "Saved price");
        document.getElementById("booking-modal").classList.remove("show");
        loadBookings();
        loadTeeTimes({ preserveScroll: true });
        refreshDashboardIfVisible({ silent: true, useCache: false });
    } catch (error) {
        console.error("Failed to save booking price:", error);
        toastError("Failed to save booking price");
    }
}

function closeBookingPriceModal() {
    document.getElementById("booking-modal").classList.remove("show");
}

// Revenue
async function loadRevenue(options = {}) {
    if (currentActivePage !== "revenue" && options?.force !== true) {
        return null;
    }
    const token = localStorage.getItem("token");
    const anchorDate = document.getElementById("revenue-anchor-date")?.value || new Date().toISOString().split("T")[0];
    const period = String(revenuePeriod || "day");
    const requestKey = JSON.stringify({
        anchorDate,
        period,
        focus: revenueStreamFocus || "all",
    });
    if (revenueLoadPromise && revenueLoadRequestKey === requestKey) {
        return revenueLoadPromise;
    }
    if (revenueLoadController) {
        revenueLoadController.abort();
    }
    const controller = new AbortController();
    revenueLoadController = controller;
    revenueLoadRequestKey = requestKey;

    const requestPromise = (async () => {
    try {
        const url = `${API_BASE}/api/admin/revenue?period=${encodeURIComponent(period)}&anchor_date=${encodeURIComponent(anchorDate)}`;

        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        if (controller.signal.aborted || currentActivePage !== "revenue") {
            return null;
        }
        const series = mergeRevenueSeries(data.daily_revenue, data.daily_paid_revenue, data.daily_other_revenue);
        const otherRowsRaw = Array.isArray(data.other_revenue_by_stream) ? data.other_revenue_by_stream : [];
        const scopedOtherRows = otherRowsRaw.filter(row => isPrimaryOperationStream(row?.stream));
        const importedByStream = Object.fromEntries(
            scopedOtherRows.map(row => [
                String(row?.stream || "").toLowerCase(),
                { amount: safeNumber(row?.amount), transactions: safeNumber(row?.transactions) },
            ])
        );

        const bookedTotal = series.booked.reduce((sum, v) => sum + safeNumber(v), 0);
        const actualPaid = series.paid.reduce((sum, v) => sum + safeNumber(v), 0);
        const actualOther = scopedOtherRows.reduce((sum, row) => sum + safeNumber(row?.amount), 0);
        const combinedActual = actualPaid + actualOther;
        const focusSet = new Set(REVENUE_FOCUS_KEYS);
        const focus = focusSet.has(String(revenueStreamFocus || "").toLowerCase())
            ? String(revenueStreamFocus || "").toLowerCase()
            : "all";
        revenueStreamFocus = focus;

        const focusImportedLabel = focus === "pro_shop"
            ? "Imported Pro Shop (Non-POS)"
            : "Imported Non-Booking (Non-POS)";
        const selectedImported = importedByStream[focus] || { amount: 0, transactions: 0 };
        const focusedActual = focus === "golf_paid"
            ? actualPaid
            : focus === "other_imported"
                ? actualOther
                : ["pro_shop"].includes(focus)
                    ? safeNumber(selectedImported.amount)
                    : combinedActual;
        const focusedCollectionRate = (focus === "all" || focus === "golf_paid")
            ? (bookedTotal > 0 ? (actualPaid / bookedTotal) : null)
            : null;
        const focusedOtherMix = focus === "all"
            ? (combinedActual > 0 ? (actualOther / combinedActual) : null)
            : (["other_imported", "pro_shop"].includes(focus)
                ? (actualOther > 0
                    ? (focus === "other_imported" ? 1 : safeNumber(selectedImported.amount) / actualOther)
                    : null)
                : null);
        const targetRevenue = data.target_revenue;
        const targetContext = data?.target_context || {};
        const targetSourceLabel = formatTargetSourceLabel(targetContext?.revenue_source);
        const pct = targetRevenue ? (focusedActual / safeNumber(targetRevenue)) : null;
        const gapToTarget = targetRevenue == null ? null : (focusedActual - safeNumber(targetRevenue));

        const actualEl = document.getElementById("revenue-actual");
        const golfEl = document.getElementById("revenue-golf-paid");
        const otherEl = document.getElementById("revenue-other");
        const targetEl = document.getElementById("revenue-target");
        const pctEl = document.getElementById("revenue-pct");
        const collectionEl = document.getElementById("revenue-collection-rate");
        const otherMixEl = document.getElementById("revenue-other-mix");
        const gapEl = document.getElementById("revenue-gap");
        const flowEl = document.getElementById("revenue-flow-text");
        const golfLabelEl = document.getElementById("revenue-golf-paid-label");
        const otherLabelEl = document.getElementById("revenue-other-label");
        const actualLabelEl = document.getElementById("revenue-actual-label");

        if (golfLabelEl) golfLabelEl.textContent = focus === "golf_paid" ? "Golf (Paid Focus)" : "Golf (Paid)";
        if (otherLabelEl) otherLabelEl.textContent = focus === "all" ? "Non-Booking (Imported, Non-POS)" : focusImportedLabel;
        if (actualLabelEl) {
            actualLabelEl.textContent = focus === "all"
                ? "Combined"
                : (focus === "golf_paid"
                    ? "Focus Total (Golf Paid)"
                    : (focus === "other_imported" ? "Focus Total (Imported)" : `Focus Total (${focusImportedLabel})`));
        }

        if (collectionEl) collectionEl.textContent = focusedCollectionRate == null ? "-" : formatPct(focusedCollectionRate);
        if (otherMixEl) otherMixEl.textContent = focusedOtherMix == null ? "-" : formatPct(focusedOtherMix);
        if (gapEl) gapEl.textContent = gapToTarget == null ? "-" : formatCurrencyZAR(gapToTarget);
        if (flowEl) {
            const targetSummary = targetRevenue == null
                ? "No target has been configured for this period."
                : (gapToTarget >= 0
                    ? `You are ahead of target by ${formatCurrencyZAR(Math.abs(gapToTarget))} against the ${targetSourceLabel} target.`
                    : `You are below target by ${formatCurrencyZAR(Math.abs(gapToTarget))} against the ${targetSourceLabel} target.`);
            if (focus === "all") {
                flowEl.textContent =
                    `Booked: ${formatCurrencyZAR(bookedTotal)}. ` +
                    `Paid golf collected: ${formatCurrencyZAR(actualPaid)} (${focusedCollectionRate == null ? "-" : formatPct(focusedCollectionRate)}). ` +
                    `Imported non-POS adjustments: ${formatCurrencyZAR(actualOther)}. ${targetSummary}`;
            } else if (focus === "golf_paid") {
                flowEl.textContent = `Golf-paid focus: ${formatCurrencyZAR(actualPaid)} collected from booked demand ${formatCurrencyZAR(bookedTotal)}. ${targetSummary}`;
            } else if (focus === "other_imported") {
                flowEl.textContent = `Imported non-booking focus: ${formatCurrencyZAR(actualOther)} across imported non-POS streams. ${targetSummary}`;
            } else {
                flowEl.textContent = `${focusImportedLabel} focus: ${formatCurrencyZAR(selectedImported.amount)} across ${formatInteger(selectedImported.transactions)} transaction(s). ${targetSummary}`;
            }
        }
        if (golfEl) golfEl.textContent = formatCurrencyZAR(actualPaid);
        if (otherEl) {
            otherEl.textContent = formatCurrencyZAR(
                ["pro_shop"].includes(focus) ? selectedImported.amount : actualOther
            );
        }
        if (actualEl) actualEl.textContent = formatCurrencyZAR(focusedActual);
        if (targetEl) targetEl.textContent = targetRevenue == null ? "—" : formatCurrencyZAR(targetRevenue);
        if (pctEl) pctEl.textContent = pct == null ? "—" : formatPct(pct);

        const dailyCtx = document.getElementById("dailyRevenueChart");
        if (window.dailyChart) window.dailyChart.destroy();
        const dailyRequired = data?.daily_revenue_required;
        const dailyRequiredValue = dailyRequired == null ? null : safeNumber(dailyRequired);
        const combinedSeries = series.labels.map((_, idx) => safeNumber(series.paid[idx]) + safeNumber(series.other[idx]));
        const showPaidDataset = focus !== "other_imported" && !["pro_shop"].includes(focus);
        const showOtherDataset = focus !== "golf_paid";
        const showCombinedDataset = focus === "all" || focus === "other_imported" || ["pro_shop"].includes(focus);
        const showBookedDataset = focus === "all" || focus === "golf_paid";

        window.dailyChart = new Chart(dailyCtx, {
            type: "bar",
            data: {
                labels: series.labels.map(d => formatYMDToDMY(d)),
                datasets: [
                    {
                        label: "Paid Golf (R)",
                        data: series.paid,
                        backgroundColor: "rgba(30, 136, 229, 0.72)",
                        stack: "actual",
                        hidden: !showPaidDataset,
                    },
                    {
                        label: "Other Imported (R)",
                        data: series.other,
                        backgroundColor: "rgba(242, 140, 44, 0.72)",
                        stack: "actual",
                        hidden: !showOtherDataset,
                    },
                    {
                        type: "line",
                        label: "Combined Actual (R)",
                        data: combinedSeries,
                        borderColor: "#064f32",
                        backgroundColor: "rgba(6, 79, 50, 0.08)",
                        pointRadius: 2,
                        borderWidth: 2,
                        tension: 0.25,
                        yAxisID: "y",
                        hidden: !showCombinedDataset,
                    },
                    {
                        type: "line",
                        label: "Booked Value (R)",
                        data: series.booked,
                        borderColor: "#6d4c41",
                        backgroundColor: "rgba(109, 76, 65, 0.05)",
                        borderDash: [5, 4],
                        pointRadius: 1.5,
                        borderWidth: 1.8,
                        tension: 0.2,
                        yAxisID: "y",
                        hidden: !showBookedDataset,
                    },
                    ...(dailyRequiredValue == null ? [] : [{
                        type: "line",
                        label: "Target (Required / Day)",
                        data: series.labels.map(() => dailyRequiredValue),
                        borderColor: "#e53935",
                        backgroundColor: "rgba(229, 57, 53, 0.08)",
                        borderDash: [6, 6],
                        pointRadius: 0,
                        tension: 0,
                        yAxisID: "y",
                    }])
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    x: { stacked: true },
                    y: { beginAtZero: true, stacked: true }
                }
            }
        });

        const statusCtx = document.getElementById("statusRevenueChart");
        if (window.statusChart) window.statusChart.destroy();

        window.statusChart = new Chart(statusCtx, {
            type: "pie",
            data: {
                labels: data.revenue_by_status.map(s => statusToLabel(s.status || "unknown")),
                datasets: [{
                    data: data.revenue_by_status.map(s => s.amount),
                    backgroundColor: ["#3498db", "#f39c12", "#27ae60", "#e74c3c"]
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });

        const otherBody = document.getElementById("other-revenue-streams-body");
        if (otherBody) {
            let rows = [...scopedOtherRows];
            if (focus === "golf_paid") rows = [];
            if (["pro_shop"].includes(focus)) {
                rows = rows.filter(r => String(r?.stream || "").toLowerCase() === focus);
            }
            const otherTotal = rows.reduce((sum, r) => sum + safeNumber(r?.amount), 0);
            if (!rows.length) {
                otherBody.innerHTML = `
                    <tr class="empty-row">
                        <td colspan="6">
                            <div class="empty-state">${focus === "golf_paid" ? "Golf-paid focus selected: no imported stream rows in this view." : "No imported revenue yet. Use \"Import Revenue CSV\" above."}</div>
                        </td>
                    </tr>
                `;
            } else {
                otherBody.innerHTML = rows.map(r => `
                    <tr>
                        <td>${escapeHtml(String(r.stream || "").replaceAll("_", " "))}</td>
                        <td>${escapeHtml(formatCurrencyZAR(r.amount || 0))}</td>
                        <td>${escapeHtml(String(r.transactions ?? 0))}</td>
                        <td>${otherTotal > 0 ? escapeHtml(formatPct(safeNumber(r.amount) / otherTotal)) : "-"}</td>
                        <td>${combinedActual > 0 ? escapeHtml(formatPct(safeNumber(r.amount) / combinedActual)) : "-"}</td>
                        <td>${Number(r.transactions || 0) > 0 ? escapeHtml(formatCurrencyZAR(safeNumber(r.amount) / safeNumber(r.transactions))) : "-"}</td>
                    </tr>
                `).join("");
            }
        }
    } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return null;
        console.error("Failed to load revenue:", error);
    }
    })();
    revenueLoadPromise = requestPromise.finally(() => {
        if (revenueLoadPromise === requestPromise) {
            revenueLoadPromise = null;
        }
        if (revenueLoadController === controller) {
            revenueLoadController = null;
        }
        if (revenueLoadRequestKey === requestKey) {
            revenueLoadRequestKey = "";
        }
    });
    return revenueLoadPromise;
}

function setupRevenueFilters() {
    const dateInput = document.getElementById("revenue-anchor-date");
    const buttons = document.querySelectorAll(".revenue-period-btn");
    const streamFocusSelect = document.getElementById("revenue-stream-focus");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    if (streamFocusSelect instanceof HTMLSelectElement) {
        const selected = String(streamFocusSelect.value || "all").toLowerCase();
        revenueStreamFocus = REVENUE_FOCUS_KEYS.includes(selected) ? selected : "all";
        if (streamFocusSelect.value !== revenueStreamFocus) {
            streamFocusSelect.value = revenueStreamFocus;
        }
    }

    dateInput?.addEventListener("change", () => {
        loadRevenue();
    });

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            revenuePeriod = btn.dataset.period || "day";
            loadRevenue();
        });
    });

    streamFocusSelect?.addEventListener("change", () => {
        const selected = String(streamFocusSelect.value || "all").toLowerCase();
        revenueStreamFocus = REVENUE_FOCUS_KEYS.includes(selected) ? selected : "all";
        if (streamFocusSelect.value !== revenueStreamFocus) {
            streamFocusSelect.value = revenueStreamFocus;
        }
        loadRevenue();
    });
}

function updateRevenueUploadFlowHint() {
    const opsStreamSelect = document.getElementById("ops-import-stream");
    const legacyStreamSelect = document.getElementById("revenue-import-stream");
    const streamSelect = opsStreamSelect || legacyStreamSelect;
    const note = document.getElementById("ops-revenue-upload-flow-note") || document.getElementById("revenue-upload-flow-note");
    const streamLabel = document.getElementById("ops-import-stream-label");
    if (!streamSelect) return;

    const stream = normalizeImportStreamKey(streamSelect.value || DEFAULT_IMPORT_STREAM, DEFAULT_IMPORT_STREAM);
    if (String(streamSelect.value || "").toLowerCase() !== stream) {
        streamSelect.value = stream;
    }
    const label = revenueImportStreamLabel(stream);
    if (streamLabel) {
        streamLabel.textContent = `Selected operation: ${label}`;
    }

    if (!note) return;

    if (stream === "golf") {
        note.textContent = "Selected operation: Golf. Import only non-booking golf adjustments here (not tee-sheet bookings).";
        return;
    }
    if (stream === "pro_shop") {
        note.textContent = "Selected operation: Pro Shop. Use this for external POS files when sales were not captured in GreenLink checkout.";
        return;
    }
    if (stream === "pub") {
        note.textContent = "Selected operation: Pub. Import till/POS exports for bar and food revenue reconciliation.";
        return;
    }
    if (stream === "bowls") {
        note.textContent = "Selected operation: Bowls. Import bowls operations revenue files for day-end balancing.";
        return;
    }
    note.textContent = "Selected operation: Other. Import any remaining operation revenue files and map fields per stream.";
}

function revenueImportStreamLabel(stream) {
    const key = normalizeImportStreamKey(stream, DEFAULT_IMPORT_STREAM);
    const match = IMPORT_OPERATIONS.find(op => op.key === key);
    return match ? match.label : "Operation";
}

function normalizeRevenueImportSettings(stream, raw = {}) {
    const normalizedStream = normalizeImportStreamKey(stream, DEFAULT_IMPORT_STREAM);
    const fallback = {
        stream: normalizedStream,
        date_field: "",
        amount_field: "",
        description_field: "",
        category_field: "",
        external_id_field: "",
        stream_field: "",
        tax_field: "",
        amount_sign: "as_is",
        amount_basis: "gross",
        tax_adjustment: "ignore",
        tax_rate: 0.15,
        allow_stream_override: false,
        dedupe_without_external_id: true,
    };
    const out = { ...fallback, ...(raw || {}) };
    out.stream = fallback.stream;
    out.date_field = String(out.date_field || "");
    out.amount_field = String(out.amount_field || "");
    out.description_field = String(out.description_field || "");
    out.category_field = String(out.category_field || "");
    out.external_id_field = String(out.external_id_field || "");
    out.stream_field = String(out.stream_field || "");
    out.tax_field = String(out.tax_field || "");
    out.amount_sign = out.amount_sign === "invert" ? "invert" : "as_is";
    out.amount_basis = out.amount_basis === "net" ? "net" : "gross";
    out.tax_adjustment = ["ignore", "add", "subtract"].includes(String(out.tax_adjustment || "").toLowerCase())
        ? String(out.tax_adjustment).toLowerCase()
        : "ignore";
    out.tax_rate = Math.max(0, Math.min(1, Number(out.tax_rate || 0)));
    out.allow_stream_override = Boolean(out.allow_stream_override);
    out.dedupe_without_external_id = Boolean(out.dedupe_without_external_id);
    return out;
}

function getOpsSettingsStream() {
    const streamSelect = document.getElementById("ops-import-stream") || document.getElementById("revenue-import-stream");
    return normalizeImportStreamKey(streamSelect?.value || DEFAULT_IMPORT_STREAM, DEFAULT_IMPORT_STREAM);
}

function populateOpsImportSettingsForm(settings) {
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    setVal("ops-date-field", settings.date_field || "");
    setVal("ops-amount-field", settings.amount_field || "");
    setVal("ops-description-field", settings.description_field || "");
    setVal("ops-category-field", settings.category_field || "");
    setVal("ops-external-id-field", settings.external_id_field || "");
    setVal("ops-stream-field", settings.stream_field || "");
    setVal("ops-tax-field", settings.tax_field || "");
    setVal("ops-amount-sign", settings.amount_sign || "as_is");
    setVal("ops-amount-basis", settings.amount_basis || "gross");
    setVal("ops-tax-adjustment", settings.tax_adjustment || "ignore");
    setVal("ops-tax-rate", (Number(settings.tax_rate || 0) * 100).toFixed(2));
    setVal("ops-allow-stream-override", settings.allow_stream_override ? "true" : "false");
    setVal("ops-dedupe", settings.dedupe_without_external_id ? "true" : "false");
}

function collectOpsImportSettingsForm(stream) {
    const getVal = (id) => String(document.getElementById(id)?.value || "").trim();
    const taxRatePct = Math.max(0, Number(getVal("ops-tax-rate") || 0));
    return normalizeRevenueImportSettings(stream, {
        date_field: getVal("ops-date-field"),
        amount_field: getVal("ops-amount-field"),
        description_field: getVal("ops-description-field"),
        category_field: getVal("ops-category-field"),
        external_id_field: getVal("ops-external-id-field"),
        stream_field: getVal("ops-stream-field"),
        tax_field: getVal("ops-tax-field"),
        amount_sign: getVal("ops-amount-sign") || "as_is",
        amount_basis: getVal("ops-amount-basis") || "gross",
        tax_adjustment: getVal("ops-tax-adjustment") || "ignore",
        tax_rate: taxRatePct / 100,
        allow_stream_override: getVal("ops-allow-stream-override") !== "false",
        dedupe_without_external_id: getVal("ops-dedupe") !== "false",
    });
}

function renderOpsImportSettingsHint(stream, settings, configured) {
    const hintEl = document.getElementById("ops-settings-hint");
    if (!hintEl) return;
    const requiredMissing = [];
    if (!String(settings?.date_field || "").trim()) requiredMissing.push("date field");
    if (!String(settings?.amount_field || "").trim()) requiredMissing.push("amount field");
    const label = revenueImportStreamLabel(stream);
    const overrideNote = settings?.allow_stream_override
        ? " Stream override is ON, so CSV stream values can reroute rows between configured operations."
        : "";
    if (!configured) {
        hintEl.textContent = `${label}: profile not saved yet. Import once with "Save detected columns on import" enabled, then review and save.${overrideNote}`;
        return;
    }
    if (requiredMissing.length) {
        hintEl.textContent = `${label}: profile saved but missing ${requiredMissing.join(" and ")}. Imports will fall back to default field guesses.${overrideNote}`;
        return;
    }
    hintEl.textContent = `${label}: profile saved. Future daily/weekly imports will apply this mapping automatically.${overrideNote}`;
}

function formatTargetSourceLabel(source) {
    const value = String(source || "").trim().toLowerCase();
    if (value === "manual_override") return "manual override";
    if (value === "derived_from_mix") return "derived from rounds + pricing mix";
    return "not configured";
}

function getTargetSettingsYear() {
    const yearInput = document.getElementById("target-settings-year");
    const currentYear = new Date().getFullYear();
    const raw = Number.parseInt(String(yearInput?.value || currentYear), 10);
    return Number.isFinite(raw) && raw >= 2000 && raw <= 2100 ? raw : currentYear;
}

function toggleTargetRevenueOverrideInput() {
    const modeSelect = document.getElementById("target-revenue-mode");
    const revenueInput = document.getElementById("target-revenue-annual");
    if (!(revenueInput instanceof HTMLInputElement)) return;
    const manual = String(modeSelect?.value || "derived").toLowerCase() === "manual";
    revenueInput.disabled = !manual;
    revenueInput.style.opacity = manual ? "1" : "0.65";
}

function renderTargetSettingsHint(data) {
    const hintEl = document.getElementById("target-settings-hint");
    if (!hintEl) return;
    const roundsTarget = Number(data?.rounds_target);
    const revenueTarget = data?.revenue_target;
    const derivedRevenue = data?.revenue_derived;
    const overrideRevenue = data?.revenue_override;
    const sourceLabel = formatTargetSourceLabel(data?.revenue_source);
    const assumptions = data?.assumptions || {};
    const memberRoundSharePct = Number(assumptions.member_round_share) * 100;
    const memberRevenueSharePct = Number(assumptions.member_revenue_share) * 100;
    const memberFee = Number(assumptions.member_fee_18);
    const parts = [
        `${data?.year || getTargetSettingsYear()}: rounds target ${Number.isFinite(roundsTarget) ? formatInteger(roundsTarget) : "—"}.`,
        `Active annual revenue target ${revenueTarget == null ? "—" : formatCurrencyZAR(revenueTarget)} (${sourceLabel}).`,
        `Mix assumes ${Number.isFinite(memberRoundSharePct) ? formatNumber(memberRoundSharePct, 0, 2) : "—"}% member rounds, ${Number.isFinite(memberRevenueSharePct) ? formatNumber(memberRevenueSharePct, 0, 2) : "—"}% member revenue, member 18-hole fee ${Number.isFinite(memberFee) ? formatCurrencyZAR(memberFee) : "—"}.`,
    ];
    if (overrideRevenue != null && derivedRevenue != null && Math.abs(Number(overrideRevenue) - Number(derivedRevenue)) > 0.01) {
        parts.push(`Derived revenue preview is ${formatCurrencyZAR(derivedRevenue)} while the stored override is ${formatCurrencyZAR(overrideRevenue)}.`);
    }
    hintEl.textContent = parts.join(" ");
}

function populateTargetModelForm(data) {
    const yearInput = document.getElementById("target-settings-year");
    const roundsInput = document.getElementById("target-rounds-annual");
    const modeSelect = document.getElementById("target-revenue-mode");
    const revenueInput = document.getElementById("target-revenue-annual");
    const memberRoundShareInput = document.getElementById("target-member-round-share");
    const memberRevenueShareInput = document.getElementById("target-member-revenue-share");
    const memberFeeInput = document.getElementById("target-member-fee-18");
    const derivedRevenueInput = document.getElementById("target-revenue-derived");
    const assumptions = data?.assumptions || {};

    if (yearInput) yearInput.value = String(data?.year || getTargetSettingsYear());
    if (roundsInput) roundsInput.value = data?.rounds_target == null ? "" : String(Math.round(Number(data.rounds_target)));
    if (modeSelect) modeSelect.value = String(data?.revenue_mode || "derived").toLowerCase() === "manual" ? "manual" : "derived";
    if (revenueInput) revenueInput.value = data?.revenue_override == null ? "" : String(Number(data.revenue_override).toFixed(2));
    if (memberRoundShareInput) memberRoundShareInput.value = assumptions.member_round_share == null ? "50.00" : formatNumber(Number(assumptions.member_round_share) * 100, 0, 2);
    if (memberRevenueShareInput) memberRevenueShareInput.value = assumptions.member_revenue_share == null ? "33.00" : formatNumber(Number(assumptions.member_revenue_share) * 100, 0, 2);
    if (memberFeeInput) memberFeeInput.value = assumptions.member_fee_18 == null ? "—" : formatCurrencyZAR(Number(assumptions.member_fee_18));
    if (derivedRevenueInput) derivedRevenueInput.value = data?.revenue_derived == null ? "—" : formatCurrencyZAR(Number(data.revenue_derived));

    toggleTargetRevenueOverrideInput();
    renderTargetSettingsHint(data);
}

async function loadTargetModelSettings(options = {}) {
    const statusEl = document.getElementById("target-settings-status");
    const year = options?.year || getTargetSettingsYear();
    try {
        if (statusEl && !options?.silent) statusEl.textContent = "Loading target model...";
        const data = await fetchJson(`${API_BASE}/api/admin/targets?year=${encodeURIComponent(year)}`);
        populateTargetModelForm(data);
        if (statusEl && !options?.silent) statusEl.textContent = "Target model loaded";
    } catch (error) {
        console.error("Failed to load target settings:", error);
        if (statusEl) statusEl.textContent = error?.message || "";
    }
}

async function saveTargetModelSettings() {
    const statusEl = document.getElementById("target-settings-status");
    const year = getTargetSettingsYear();
    const roundsTarget = Number.parseFloat(String(document.getElementById("target-rounds-annual")?.value || ""));
    const revenueMode = String(document.getElementById("target-revenue-mode")?.value || "derived").toLowerCase();
    const revenueOverride = Number.parseFloat(String(document.getElementById("target-revenue-annual")?.value || ""));
    const memberRoundSharePct = Number.parseFloat(String(document.getElementById("target-member-round-share")?.value || ""));
    const memberRevenueSharePct = Number.parseFloat(String(document.getElementById("target-member-revenue-share")?.value || ""));

    if (!Number.isFinite(roundsTarget) || roundsTarget < 0) {
        if (statusEl) statusEl.textContent = "Annual rounds target must be 0 or more";
        return;
    }
    if (!Number.isFinite(memberRoundSharePct) || memberRoundSharePct <= 0 || memberRoundSharePct >= 100) {
        if (statusEl) statusEl.textContent = "Member rounds share must be between 0 and 100";
        return;
    }
    if (!Number.isFinite(memberRevenueSharePct) || memberRevenueSharePct <= 0 || memberRevenueSharePct >= 100) {
        if (statusEl) statusEl.textContent = "Member revenue share must be between 0 and 100";
        return;
    }
    if (revenueMode === "manual" && (!Number.isFinite(revenueOverride) || revenueOverride < 0)) {
        if (statusEl) statusEl.textContent = "Manual revenue override must be 0 or more";
        return;
    }

    try {
        if (statusEl) statusEl.textContent = "Saving target model...";
        await fetchJson(`${API_BASE}/api/admin/targets/assumptions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                year,
                member_round_share: memberRoundSharePct / 100,
                member_revenue_share: memberRevenueSharePct / 100,
                revenue_mode: revenueMode,
            }),
        });
        await fetchJson(`${API_BASE}/api/admin/targets`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                year,
                metric: "rounds",
                annual_target: roundsTarget,
            }),
        });
        if (revenueMode === "manual") {
            await fetchJson(`${API_BASE}/api/admin/targets`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    year,
                    metric: "revenue",
                    annual_target: revenueOverride,
                }),
            });
        }
        await loadTargetModelSettings({ year, silent: true });
        if (statusEl) statusEl.textContent = "Target model saved";
        if (currentUserRole !== "super_admin") {
            refreshDashboardIfVisible({ silent: true, useCache: false });
            refreshRevenueIfVisible();
        }
        toastSuccess("Target model saved");
    } catch (error) {
        console.error("Failed to save target settings:", error);
        if (statusEl) statusEl.textContent = error?.message || "Save failed";
        toastError(error?.message || "Failed to save target model");
    }
}

function setupTargetModelSettings() {
    if (!["admin", "super_admin"].includes(String(currentUserRole || "").toLowerCase())) return;
    const yearInput = document.getElementById("target-settings-year");
    const modeSelect = document.getElementById("target-revenue-mode");
    const saveBtn = document.getElementById("target-settings-save-btn");
    if (!(saveBtn instanceof HTMLButtonElement)) return;

    yearInput?.addEventListener("change", () => {
        loadTargetModelSettings({ year: getTargetSettingsYear() });
    });
    modeSelect?.addEventListener("change", () => {
        toggleTargetRevenueOverrideInput();
        renderTargetSettingsHint({
            year: getTargetSettingsYear(),
            revenue_mode: modeSelect.value,
            revenue_source: modeSelect.value === "manual" ? "manual_override" : "derived_from_mix",
            rounds_target: Number.parseFloat(String(document.getElementById("target-rounds-annual")?.value || "")),
            revenue_override: Number.parseFloat(String(document.getElementById("target-revenue-annual")?.value || "")),
            revenue_derived: null,
            assumptions: {
                member_round_share: Number.parseFloat(String(document.getElementById("target-member-round-share")?.value || "")) / 100,
                member_revenue_share: Number.parseFloat(String(document.getElementById("target-member-revenue-share")?.value || "")) / 100,
                member_fee_18: null,
            },
        });
    });
    saveBtn.addEventListener("click", () => saveTargetModelSettings());
    const currentYear = new Date().getFullYear();
    if (yearInput && !yearInput.value) yearInput.value = String(currentYear);
}

function emptyPricingMatrixRow() {
    return {
        id: null,
        code: "",
        description: "",
        price: "",
        fee_type: "golf",
        active: true,
        audience: "",
        gender: "",
        day_kind: "",
        weekday: "",
        holes: "",
        min_age: "",
        max_age: "",
        start_date: "",
        end_date: "",
        start_time: "",
        end_time: "",
        priority: "0",
    };
}

function normalizePricingMatrixRow(raw) {
    const row = { ...emptyPricingMatrixRow(), ...(raw || {}) };
    row.id = row.id == null ? null : Number(row.id);
    row.code = row.code == null ? "" : String(row.code);
    row.description = String(row.description || "");
    row.price = row.price == null ? "" : String(row.price);
    row.fee_type = String(row.fee_type || "golf").toLowerCase();
    row.active = row.active !== false;
    row.audience = String(row.audience || "");
    row.gender = String(row.gender || "");
    row.day_kind = String(row.day_kind || "");
    row.weekday = row.weekday == null ? "" : String(row.weekday);
    row.holes = row.holes == null ? "" : String(row.holes);
    row.min_age = row.min_age == null ? "" : String(row.min_age);
    row.max_age = row.max_age == null ? "" : String(row.max_age);
    row.start_date = String(row.start_date || "");
    row.end_date = String(row.end_date || "");
    row.start_time = String(row.start_time || "");
    row.end_time = String(row.end_time || "");
    row.priority = row.priority == null ? "0" : String(row.priority);
    return row;
}

function pricingMatrixSelectOptions(options, currentValue, emptyLabel = "Any") {
    const selected = String(currentValue == null ? "" : currentValue);
    const parts = [`<option value="">${escapeHtml(emptyLabel)}</option>`];
    options.forEach((option) => {
        const value = String(option.value);
        parts.push(`<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`);
    });
    return parts.join("");
}

function renderPricingMatrixHint(rows) {
    const hintEl = document.getElementById("pricing-matrix-hint");
    if (!hintEl) return;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        hintEl.textContent = "No club pricing rows saved yet. Super Admin can apply a reference set during onboarding, then save edits for this club.";
        return;
    }
    const activeRows = list.filter(row => row.active !== false);
    const golfRows = activeRows.filter(row => String(row.fee_type || "").toLowerCase() === "golf").length;
    const addOnRows = activeRows.filter(row => ["cart", "push_cart", "caddy"].includes(String(row.fee_type || "").toLowerCase())).length;
    hintEl.textContent = `${formatInteger(activeRows.length)} active pricing rules loaded: ${formatInteger(golfRows)} golf and ${formatInteger(addOnRows)} rental/caddy rules. These rules drive booking value, tee sheet pricing, reconciliation, and targets.`;
}

function renderPricingMatrix(rows = pricingMatrixRows) {
    const tbody = document.getElementById("pricing-matrix-body");
    if (!tbody) return;
    const list = Array.isArray(rows) ? rows.map(normalizePricingMatrixRow) : [];
    pricingMatrixRows = list;
    if (!list.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="action-note">No pricing rows saved for this club yet.</td>
            </tr>
        `;
        renderPricingMatrixHint([]);
        return;
    }

    const feeTypeOptions = [
        { value: "golf", label: "Golf" },
        { value: "cart", label: "Cart" },
        { value: "push_cart", label: "Push Cart" },
        { value: "caddy", label: "Caddy" },
        { value: "competition", label: "Competition" },
        { value: "other", label: "Other" },
    ];
    const audienceOptions = [
        { value: "member", label: "Member" },
        { value: "visitor", label: "Affiliated Visitor" },
        { value: "non_affiliated", label: "Non-affiliated" },
        { value: "reciprocity", label: "Reciprocity" },
    ];
    const genderOptions = [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
    ];
    const dayKindOptions = [
        { value: "weekday", label: "Weekday" },
        { value: "weekend", label: "Weekend" },
    ];
    const weekdayOptions = [
        { value: "0", label: "Mon" },
        { value: "1", label: "Tue" },
        { value: "2", label: "Wed" },
        { value: "3", label: "Thu" },
        { value: "4", label: "Fri" },
        { value: "5", label: "Sat" },
        { value: "6", label: "Sun" },
    ];
    const holesOptions = [
        { value: "9", label: "9" },
        { value: "18", label: "18" },
    ];

    tbody.innerHTML = list.map((row, index) => `
        <tr data-pricing-row="${index}" data-fee-id="${row.id ?? ""}">
            <td><input type="number" data-field="code" value="${escapeHtml(row.code)}" style="width: 86px;" min="1" step="1" placeholder="Auto" /></td>
            <td><input type="text" data-field="description" value="${escapeHtml(row.description)}" style="min-width: 220px;" /></td>
            <td><select data-field="fee_type">${pricingMatrixSelectOptions(feeTypeOptions, row.fee_type, "Type")}</select></td>
            <td>
                <select data-field="audience">${pricingMatrixSelectOptions(audienceOptions, row.audience, "Any")}</select>
                <select data-field="gender" style="margin-top:6px;">${pricingMatrixSelectOptions(genderOptions, row.gender, "Any")}</select>
            </td>
            <td><select data-field="holes">${pricingMatrixSelectOptions(holesOptions, row.holes, "Any")}</select></td>
            <td><select data-field="day_kind">${pricingMatrixSelectOptions(dayKindOptions, row.day_kind, "Any")}</select></td>
            <td><select data-field="weekday">${pricingMatrixSelectOptions(weekdayOptions, row.weekday, "Any")}</select></td>
            <td>
                <input type="number" data-field="min_age" value="${escapeHtml(row.min_age)}" min="0" step="1" placeholder="Min" style="width:70px;" />
                <input type="number" data-field="max_age" value="${escapeHtml(row.max_age)}" min="0" step="1" placeholder="Max" style="width:70px; margin-top:6px;" />
            </td>
            <td>
                <input type="date" data-field="start_date" value="${escapeHtml(row.start_date)}" />
                <input type="date" data-field="end_date" value="${escapeHtml(row.end_date)}" style="margin-top:6px;" />
            </td>
            <td>
                <input type="time" data-field="start_time" value="${escapeHtml(row.start_time)}" />
                <input type="time" data-field="end_time" value="${escapeHtml(row.end_time)}" style="margin-top:6px;" />
            </td>
            <td><input type="number" data-field="price" value="${escapeHtml(row.price)}" min="0" step="0.01" style="width:96px;" /></td>
            <td><input type="number" data-field="priority" value="${escapeHtml(row.priority)}" step="1" style="width:74px;" /></td>
            <td style="text-align:center;"><input type="checkbox" data-field="active" ${row.active ? "checked" : ""} /></td>
            <td><button class="btn-cancel btn-small" type="button" data-action="delete-pricing-row">Remove</button></td>
        </tr>
    `).join("");
    renderPricingMatrixHint(list);
}

function collectPricingMatrixRowsFromDom() {
    const tbody = document.getElementById("pricing-matrix-body");
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr[data-pricing-row]")).map((row) => {
        const getValue = (field) => String(row.querySelector(`[data-field="${field}"]`)?.value || "").trim();
        const getInt = (field) => {
            const raw = getValue(field);
            if (!raw) return null;
            const parsed = Number.parseInt(raw, 10);
            return Number.isFinite(parsed) ? parsed : null;
        };
        const getFloat = (field) => {
            const raw = getValue(field);
            if (!raw) return null;
            const parsed = Number.parseFloat(raw);
            return Number.isFinite(parsed) ? parsed : null;
        };
        return {
            id: row.dataset.feeId ? Number(row.dataset.feeId) : null,
            code: getInt("code"),
            description: getValue("description"),
            price: getFloat("price"),
            fee_type: getValue("fee_type") || "golf",
            active: Boolean(row.querySelector('[data-field="active"]')?.checked),
            audience: getValue("audience") || null,
            gender: getValue("gender") || null,
            day_kind: getValue("day_kind") || null,
            weekday: getInt("weekday"),
            holes: getInt("holes"),
            min_age: getInt("min_age"),
            max_age: getInt("max_age"),
            start_date: getValue("start_date") || null,
            end_date: getValue("end_date") || null,
            start_time: getValue("start_time") || null,
            end_time: getValue("end_time") || null,
            priority: getInt("priority") ?? 0,
        };
    });
}

async function loadPricingMatrix(options = {}) {
    const statusEl = document.getElementById("pricing-matrix-status");
    try {
        if (statusEl && !options?.silent) statusEl.textContent = "Loading pricing...";
        const data = await fetchJson(`${API_BASE}/api/admin/pricing-matrix`);
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        renderPricingMatrix(rows);
        if (statusEl && !options?.silent) statusEl.textContent = rows.length ? "Pricing loaded" : "No club pricing saved";
    } catch (error) {
        console.error("Failed to load pricing matrix:", error);
        if (statusEl) statusEl.textContent = error?.message || "Load failed";
        renderPricingMatrix([]);
    }
}

async function persistPricingMatrixRow(row) {
    const payload = {
        code: row.code,
        description: row.description,
        price: row.price,
        fee_type: row.fee_type,
        active: row.active,
        audience: row.audience,
        gender: row.gender,
        day_kind: row.day_kind,
        weekday: row.weekday,
        holes: row.holes,
        min_age: row.min_age,
        max_age: row.max_age,
        start_date: row.start_date,
        end_date: row.end_date,
        start_time: row.start_time,
        end_time: row.end_time,
        priority: row.priority,
    };
    const path = row.id ? `${API_BASE}/api/admin/pricing-matrix/${encodeURIComponent(row.id)}` : `${API_BASE}/api/admin/pricing-matrix`;
    const method = row.id ? "PUT" : "POST";
    return fetchJson(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

async function savePricingMatrix() {
    const statusEl = document.getElementById("pricing-matrix-status");
    const rows = collectPricingMatrixRowsFromDom();
    if (!rows.length) {
        if (statusEl) statusEl.textContent = "Add at least one pricing row";
        return;
    }
    for (const row of rows) {
        if (!String(row.description || "").trim()) {
            if (statusEl) statusEl.textContent = "Every pricing row needs a description";
            return;
        }
        if (!Number.isFinite(Number(row.price)) || Number(row.price) < 0) {
            if (statusEl) statusEl.textContent = "Every pricing row needs a valid price";
            return;
        }
    }

    try {
        if (statusEl) statusEl.textContent = "Saving pricing...";
        for (const row of rows) {
            await persistPricingMatrixRow(row);
        }
        golfFeesCache = [];
        await loadPricingMatrix({ silent: true });
        await loadTargetModelSettings({ year: getTargetSettingsYear(), silent: true });
        if (currentUserRole !== "super_admin") {
            refreshDashboardIfVisible({ silent: true, useCache: false });
            refreshRevenueIfVisible();
        }
        if (statusEl) statusEl.textContent = "Pricing saved";
        toastSuccess("Pricing matrix saved");
    } catch (error) {
        console.error("Failed to save pricing matrix:", error);
        if (statusEl) statusEl.textContent = error?.message || "Save failed";
        toastError(error?.message || "Failed to save pricing matrix");
    }
}

function addPricingMatrixRow() {
    pricingMatrixRows = [...collectPricingMatrixRowsFromDom(), emptyPricingMatrixRow()];
    renderPricingMatrix(pricingMatrixRows);
    document.querySelector('#pricing-matrix-body tr:last-child input[data-field="description"]')?.focus();
}

async function deletePricingMatrixRow(buttonEl) {
    const rowEl = buttonEl?.closest?.("tr[data-pricing-row]");
    if (!(rowEl instanceof HTMLTableRowElement)) return;
    const feeId = Number(rowEl.dataset.feeId || 0);
    const statusEl = document.getElementById("pricing-matrix-status");

    if (!(feeId > 0)) {
        rowEl.remove();
        pricingMatrixRows = collectPricingMatrixRowsFromDom();
        renderPricingMatrix(pricingMatrixRows);
        return;
    }

    try {
        if (statusEl) statusEl.textContent = "Removing pricing row...";
        await fetchJson(`${API_BASE}/api/admin/pricing-matrix/${encodeURIComponent(feeId)}`, { method: "DELETE" });
        golfFeesCache = [];
        await loadPricingMatrix({ silent: true });
        await loadTargetModelSettings({ year: getTargetSettingsYear(), silent: true });
        if (currentUserRole !== "super_admin") {
            refreshDashboardIfVisible({ silent: true, useCache: false });
            refreshRevenueIfVisible();
        }
        if (statusEl) statusEl.textContent = "Pricing row removed";
        toastSuccess("Pricing row removed");
    } catch (error) {
        console.error("Failed to remove pricing row:", error);
        if (statusEl) statusEl.textContent = error?.message || "Remove failed";
        toastError(error?.message || "Failed to remove pricing row");
    }
}

async function applyReferencePricingTemplate() {
    const statusEl = document.getElementById("pricing-matrix-status");
    if (!confirm("Apply the country-club reference pricing to the active club? Existing matching rule codes will be updated.")) {
        return;
    }
    try {
        if (statusEl) statusEl.textContent = "Applying reference pricing...";
        await fetchJson(`${API_BASE}/api/admin/pricing-matrix/apply-reference`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template: "country_club_standard" }),
        });
        golfFeesCache = [];
        await loadPricingMatrix({ silent: true });
        await loadTargetModelSettings({ year: getTargetSettingsYear(), silent: true });
        if (currentUserRole !== "super_admin") {
            refreshDashboardIfVisible({ silent: true, useCache: false });
            refreshRevenueIfVisible();
        }
        if (statusEl) statusEl.textContent = "Reference pricing applied";
        toastSuccess("Country-club reference pricing applied");
    } catch (error) {
        console.error("Failed to apply reference pricing:", error);
        if (statusEl) statusEl.textContent = error?.message || "Apply failed";
        toastError(error?.message || "Failed to apply country-club reference pricing");
    }
}

function setupPricingMatrixSettings() {
    if (!["admin", "super_admin"].includes(String(currentUserRole || "").toLowerCase())) return;
    const reloadBtn = document.getElementById("pricing-matrix-reload-btn");
    const applyBtn = document.getElementById("pricing-matrix-apply-reference-btn");
    const addBtn = document.getElementById("pricing-matrix-add-row-btn");
    const saveBtn = document.getElementById("pricing-matrix-save-btn");
    const tbody = document.getElementById("pricing-matrix-body");
    if (!(reloadBtn instanceof HTMLButtonElement) || !(saveBtn instanceof HTMLButtonElement) || !(tbody instanceof HTMLElement)) return;

    reloadBtn.addEventListener("click", () => loadPricingMatrix());
    applyBtn?.addEventListener("click", () => applyReferencePricingTemplate());
    addBtn?.addEventListener("click", () => addPricingMatrixRow());
    saveBtn.addEventListener("click", () => savePricingMatrix());
    tbody.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.action === "delete-pricing-row") {
            deletePricingMatrixRow(target);
        }
    });
}

async function loadOpsImportSettings(options = {}) {
    const stream = normalizeImportStreamKey(options?.stream || getOpsSettingsStream(), DEFAULT_IMPORT_STREAM);
    const statusEl = document.getElementById("ops-settings-status");
    try {
        if (statusEl && !options?.silent) statusEl.textContent = "Loading settings...";
        const data = await fetchJson(`${API_BASE}/api/admin/imports/revenue-settings?stream=${encodeURIComponent(stream)}`);
        const normalized = normalizeRevenueImportSettings(stream, data?.settings || {});
        revenueImportSettingsCache[stream] = { configured: Boolean(data?.configured), settings: normalized };
        populateOpsImportSettingsForm(normalized);
        renderOpsImportSettingsHint(stream, normalized, Boolean(data?.configured));
        if (statusEl && !options?.silent) {
            statusEl.textContent = data?.configured ? "Settings loaded" : "No saved settings yet";
        }
    } catch (error) {
        console.error("Failed to load import settings:", error);
        if (statusEl) statusEl.textContent = "";
        renderOpsImportSettingsHint(stream, normalizeRevenueImportSettings(stream, {}), false);
    }
}

async function saveOpsImportSettings() {
    const stream = getOpsSettingsStream();
    const statusEl = document.getElementById("ops-settings-status");
    const payload = collectOpsImportSettingsForm(stream);
    if (statusEl) statusEl.textContent = "Saving settings...";
    try {
        const data = await fetchJson(`${API_BASE}/api/admin/imports/revenue-settings?stream=${encodeURIComponent(stream)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const normalized = normalizeRevenueImportSettings(stream, data?.settings || payload);
        revenueImportSettingsCache[stream] = { configured: true, settings: normalized };
        populateOpsImportSettingsForm(normalized);
        renderOpsImportSettingsHint(stream, normalized, true);
        if (statusEl) statusEl.textContent = "Settings saved";
        toastSuccess(`${revenueImportStreamLabel(stream)} import settings saved`);
    } catch (error) {
        console.error("Failed to save import settings:", error);
        if (statusEl) statusEl.textContent = error?.message || "Save failed";
        toastError(error?.message || "Failed to save import settings");
    }
}

function setupRevenueImport() {
    const btn = document.getElementById("ops-revenue-import-btn") || document.getElementById("revenue-import-btn");
    const streamSelect = document.getElementById("ops-import-stream") || document.getElementById("revenue-import-stream");
    const legacyStreamSelect = document.getElementById("revenue-import-stream");
    const opsStreamSelect = document.getElementById("ops-import-stream");
    const opsReloadBtn = document.getElementById("ops-load-settings-btn");
    const opsSaveBtn = document.getElementById("ops-save-settings-btn");
    const fileInput = document.getElementById("ops-revenue-import-file") || document.getElementById("revenue-import-file");
    const statusEl = document.getElementById("ops-revenue-import-status") || document.getElementById("revenue-import-status");

    streamSelect?.addEventListener("change", () => {
        const selected = normalizeImportStreamKey(streamSelect.value || DEFAULT_IMPORT_STREAM, DEFAULT_IMPORT_STREAM);
        if (streamSelect.value !== selected) streamSelect.value = selected;
        updateRevenueUploadFlowHint();
        if (opsStreamSelect && opsStreamSelect.value !== selected) {
            opsStreamSelect.value = selected;
            loadOpsImportSettings({ stream: selected, silent: true });
        }
    });
    opsStreamSelect?.addEventListener("change", (event) => {
        const selected = normalizeImportStreamKey(event?.target?.value || opsStreamSelect.value || DEFAULT_IMPORT_STREAM, DEFAULT_IMPORT_STREAM);
        if (opsStreamSelect.value !== selected) opsStreamSelect.value = selected;
        if (legacyStreamSelect && legacyStreamSelect.value !== selected) {
            legacyStreamSelect.value = selected;
            updateRevenueUploadFlowHint();
        }
        loadOpsImportSettings({ stream: selected });
    });
    opsReloadBtn?.addEventListener("click", () => loadOpsImportSettings({ stream: getOpsSettingsStream() }));
    opsSaveBtn?.addEventListener("click", () => saveOpsImportSettings());

    updateRevenueUploadFlowHint();

    if (!btn) return;

    btn.addEventListener("click", async () => {
        const token = localStorage.getItem("token");
        const stream = normalizeImportStreamKey(streamSelect?.value || DEFAULT_IMPORT_STREAM, DEFAULT_IMPORT_STREAM);
        const saveOnImport = Boolean(document.getElementById("revenue-import-save-on-import")?.checked);

        const file = fileInput?.files?.[0];
        if (!file) {
            alert("Please choose a CSV file to import.");
            return;
        }

        btn.disabled = true;
        if (statusEl) statusEl.textContent = "Importing...";

        try {
            const form = new FormData();
            form.append("file", file);

            const query = new URLSearchParams({
                stream: String(stream || DEFAULT_IMPORT_STREAM),
                use_saved_settings: "true",
                save_settings: saveOnImport ? "true" : "false",
            });
            const res = await fetch(`${API_BASE}/api/admin/imports/revenue-csv?${query.toString()}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: form
            });

            const raw = await res.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = null;
            }

            if (!res.ok) {
                const msg = data?.detail || raw || "Import failed";
                throw new Error(msg);
            }

            if (statusEl) {
                const suffix = data?.settings_source ? ` (${data.settings_source} settings)` : "";
                statusEl.textContent = `Imported to ${stream}: ${data.rows_inserted ?? 0} new, ${data.rows_updated ?? 0} updated, ${data.rows_failed ?? 0} failed${suffix}`;
            }

            if (data?.settings_applied && opsStreamSelect) {
                const normalized = normalizeRevenueImportSettings(stream, data.settings_applied);
                revenueImportSettingsCache[String(stream)] = { configured: Boolean(data?.settings_saved), settings: normalized };
                if (String(opsStreamSelect.value || "").toLowerCase() === String(stream || "").toLowerCase()) {
                    populateOpsImportSettingsForm(normalized);
                    renderOpsImportSettingsHint(stream, normalized, true);
                }
            } else {
                loadOpsImportSettings({ stream, silent: true });
            }

            refreshRevenueIfVisible();
            refreshDashboardIfVisible({ silent: true, useCache: false });
        } catch (e) {
            console.error("Revenue import failed:", e);
            if (statusEl) statusEl.textContent = "";
            alert(`Revenue import failed: ${e?.message || e}`);
        } finally {
            btn.disabled = false;
            if (fileInput) fileInput.value = "";
        }
    });
}

// Pro Shop
function parseCurrencyInput(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function proShopFindProduct(productId) {
    const id = Number(productId);
    return proShopProductsCache.find(p => Number(p?.id) === id) || null;
}

function reconcileProShopCartWithStock() {
    proShopCart = proShopCart
        .map(item => {
            const product = proShopFindProduct(item.product_id);
            if (!product || !product.active) return null;
            const maxQty = Math.max(0, Number(product.stock_qty || 0));
            const qty = Math.min(Math.max(1, Number(item.quantity || 1)), maxQty);
            if (qty <= 0) return null;
            return {
                ...item,
                sku: product.sku,
                name: product.name,
                category: product.category || null,
                unit_price: Number(product.unit_price || 0),
                quantity: qty,
                max_qty: maxQty,
            };
        })
        .filter(Boolean);
}

function resetProShopProductForm() {
    const fields = {
        "pro-shop-product-id": "",
        "pro-shop-sku": "",
        "pro-shop-name": "",
        "pro-shop-category": "",
        "pro-shop-unit-price": "",
        "pro-shop-cost-price": "",
        "pro-shop-stock-qty": "0",
        "pro-shop-reorder-level": "0",
        "pro-shop-active": "1",
    };
    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
    const statusEl = document.getElementById("pro-shop-product-status");
    if (statusEl) statusEl.textContent = "";
}

function editProShopProduct(productId) {
    const product = proShopFindProduct(productId);
    if (!product) return;
    const idEl = document.getElementById("pro-shop-product-id");
    const skuEl = document.getElementById("pro-shop-sku");
    const nameEl = document.getElementById("pro-shop-name");
    const categoryEl = document.getElementById("pro-shop-category");
    const priceEl = document.getElementById("pro-shop-unit-price");
    const costEl = document.getElementById("pro-shop-cost-price");
    const stockEl = document.getElementById("pro-shop-stock-qty");
    const reorderEl = document.getElementById("pro-shop-reorder-level");
    const activeEl = document.getElementById("pro-shop-active");
    const statusEl = document.getElementById("pro-shop-product-status");

    if (idEl) idEl.value = String(product.id);
    if (skuEl) skuEl.value = String(product.sku || "");
    if (nameEl) nameEl.value = String(product.name || "");
    if (categoryEl) categoryEl.value = String(product.category || "");
    if (priceEl) priceEl.value = Number(product.unit_price || 0).toFixed(2);
    if (costEl) costEl.value = product.cost_price == null ? "" : Number(product.cost_price).toFixed(2);
    if (stockEl) stockEl.value = String(product.stock_qty ?? 0);
    if (reorderEl) reorderEl.value = String(product.reorder_level ?? 0);
    if (activeEl) activeEl.value = product.active ? "1" : "0";
    if (statusEl) statusEl.textContent = `Editing ${product.sku} - ${product.name}`;
}

function refreshProShopCategoryOptions(rows = []) {
    const select = document.getElementById("pro-shop-category-filter");
    if (!(select instanceof HTMLSelectElement)) return;
    const current = String(proShopCategoryFilter || select.value || "all").trim().toLowerCase();
    const categories = [...new Set(
        (Array.isArray(rows) ? rows : [])
            .map(row => String(row?.category || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="all">All Categories</option>${categories.map(cat => `<option value="${escapeHtml(cat.toLowerCase())}">${escapeHtml(cat)}</option>`).join("")}`;
    select.value = categories.some(cat => cat.toLowerCase() === current) ? current : "all";
    proShopCategoryFilter = String(select.value || "all").toLowerCase();
}

function filterProShopProducts(rows = []) {
    const stockFilter = String(proShopStockFilter || "all").toLowerCase();
    const categoryFilter = String(proShopCategoryFilter || "all").toLowerCase();
    return rows.filter(row => {
        const stockQty = Number(row?.stock_qty || 0);
        const reorder = Number(row?.reorder_level || 0);
        const isLow = Boolean(row?.active) && stockQty <= reorder;
        const isOut = stockQty <= 0;
        const categoryMatch = categoryFilter === "all"
            || String(row?.category || "").trim().toLowerCase() === categoryFilter;
        if (!categoryMatch) return false;
        if (stockFilter === "low") return isLow;
        if (stockFilter === "out") return isOut;
        if (stockFilter === "healthy") return Boolean(row?.active) && !isLow && !isOut;
        if (stockFilter === "inactive") return !Boolean(row?.active);
        return true;
    });
}

function renderProShopProducts() {
    const body = document.getElementById("pro-shop-products-body");
    const lowStockEl = document.getElementById("pro-shop-low-stock");
    if (!body) return;

    const allRows = Array.isArray(proShopProductsCache) ? proShopProductsCache : [];
    const rows = filterProShopProducts(allRows);
    const lowStockCount = allRows.filter(row => row.active && Number(row.stock_qty || 0) <= Number(row.reorder_level || 0)).length;
    if (lowStockEl) lowStockEl.textContent = String(lowStockCount);

    if (!rows.length) {
        body.innerHTML = `
            <tr class="empty-row">
                <td colspan="6"><div class="empty-state">No products match the selected filters.</div></td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map(row => {
        const stockQty = Number(row.stock_qty || 0);
        const reorder = Number(row.reorder_level || 0);
        const low = row.active && stockQty <= reorder;
        const addDisabled = !row.active || stockQty <= 0;
        const activeTag = row.active ? "" : " <span class=\"muted\">(Inactive)</span>";
        return `
            <tr>
                <td>${escapeHtml(String(row.sku || ""))}</td>
                <td>${escapeHtml(String(row.name || ""))}${activeTag}</td>
                <td>${row.category ? escapeHtml(String(row.category)) : "-"}</td>
                <td>${escapeHtml(formatCurrencyZAR(row.unit_price || 0))}</td>
                <td class="${low ? "pro-shop-stock-low" : ""}">${escapeHtml(String(stockQty))}</td>
                <td>
                    <button class="btn-secondary btn-small" type="button" onclick="addProShopCartItem(${Number(row.id)})" ${addDisabled ? "disabled" : ""}>Add</button>
                    <button class="btn-secondary btn-small" type="button" onclick="editProShopProduct(${Number(row.id)})">Edit</button>
                </td>
            </tr>
        `;
    }).join("");
}

function renderProShopCart() {
    const body = document.getElementById("pro-shop-cart-body");
    const totalEl = document.getElementById("pro-shop-cart-total");
    if (!body || !totalEl) return;

    if (!proShopCart.length) {
        body.innerHTML = `
            <tr class="empty-row">
                <td colspan="5"><div class="empty-state">Cart is empty. Add products from inventory.</div></td>
            </tr>
        `;
        totalEl.textContent = "R0.00";
        return;
    }

    body.innerHTML = proShopCart.map(item => {
        const line = Number(item.quantity || 0) * Number(item.unit_price || 0);
        return `
            <tr>
                <td>${escapeHtml(String(item.name || ""))}</td>
                <td>
                    <div class="pro-shop-qty">
                        <button class="btn-secondary btn-small" type="button" onclick="changeProShopCartQty(${Number(item.product_id)}, -1)">-</button>
                        <span>${escapeHtml(String(item.quantity || 0))}</span>
                        <button class="btn-secondary btn-small" type="button" onclick="changeProShopCartQty(${Number(item.product_id)}, 1)">+</button>
                    </div>
                </td>
                <td>${escapeHtml(formatCurrencyZAR(item.unit_price || 0))}</td>
                <td>${escapeHtml(formatCurrencyZAR(line))}</td>
                <td><button class="btn-secondary btn-small" type="button" onclick="removeProShopCartItem(${Number(item.product_id)})">Remove</button></td>
            </tr>
        `;
    }).join("");

    const total = proShopCart.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
    totalEl.textContent = formatCurrencyZAR(total);
}

function addProShopCartItem(productId) {
    const product = proShopFindProduct(productId);
    if (!product) {
        toastError("Product not found");
        return;
    }
    if (!product.active) {
        toastError("Product is inactive");
        return;
    }
    const stockQty = Number(product.stock_qty || 0);
    if (stockQty <= 0) {
        toastError("Out of stock");
        return;
    }

    const existing = proShopCart.find(item => Number(item.product_id) === Number(product.id));
    if (existing) {
        if (Number(existing.quantity || 0) >= stockQty) {
            toastError("No more stock available");
            return;
        }
        existing.quantity = Number(existing.quantity || 0) + 1;
    } else {
        proShopCart.push({
            product_id: Number(product.id),
            sku: String(product.sku || ""),
            name: String(product.name || ""),
            category: product.category || null,
            unit_price: Number(product.unit_price || 0),
            quantity: 1,
            max_qty: stockQty,
        });
    }
    renderProShopCart();
}

function changeProShopCartQty(productId, delta) {
    const item = proShopCart.find(row => Number(row.product_id) === Number(productId));
    if (!item) return;
    const product = proShopFindProduct(productId);
    const maxQty = Number(product?.stock_qty || item.max_qty || 0);
    const nextQty = Number(item.quantity || 0) + Number(delta || 0);
    if (nextQty <= 0) {
        proShopCart = proShopCart.filter(row => Number(row.product_id) !== Number(productId));
    } else {
        item.quantity = Math.min(nextQty, maxQty);
    }
    renderProShopCart();
}

function removeProShopCartItem(productId) {
    proShopCart = proShopCart.filter(row => Number(row.product_id) !== Number(productId));
    renderProShopCart();
}

function clearProShopCart() {
    proShopCart = [];
    renderProShopCart();
}

async function loadProShopProducts() {
    const searchEl = document.getElementById("pro-shop-search");
    const q = (searchEl?.value || "").trim();
    const params = new URLSearchParams({ active_only: "false", limit: "500" });
    if (q) params.set("q", q);

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/pro-shop/products?${params.toString()}`);
        proShopProductsCache = Array.isArray(data?.products) ? data.products : [];
        refreshProShopCategoryOptions(proShopProductsCache);
        reconcileProShopCartWithStock();
        renderProShopProducts();
        renderProShopCart();
    } catch (error) {
        console.error("Failed to load pro shop products:", error);
        toastError(error?.message || "Failed to load pro shop products");
    }
}

async function saveProShopProduct() {
    const idEl = document.getElementById("pro-shop-product-id");
    const skuEl = document.getElementById("pro-shop-sku");
    const nameEl = document.getElementById("pro-shop-name");
    const categoryEl = document.getElementById("pro-shop-category");
    const priceEl = document.getElementById("pro-shop-unit-price");
    const costEl = document.getElementById("pro-shop-cost-price");
    const stockEl = document.getElementById("pro-shop-stock-qty");
    const reorderEl = document.getElementById("pro-shop-reorder-level");
    const activeEl = document.getElementById("pro-shop-active");
    const statusEl = document.getElementById("pro-shop-product-status");

    const payload = {
        sku: String(skuEl?.value || "").trim(),
        name: String(nameEl?.value || "").trim(),
        category: String(categoryEl?.value || "").trim() || null,
        unit_price: parseCurrencyInput(priceEl?.value),
        cost_price: String(costEl?.value || "").trim() === "" ? null : parseCurrencyInput(costEl?.value),
        stock_qty: Number(stockEl?.value || 0),
        reorder_level: Number(reorderEl?.value || 0),
        active: String(activeEl?.value || "1") === "1",
    };

    if (!payload.sku) {
        toastError("SKU is required");
        return;
    }
    if (!payload.name) {
        toastError("Name is required");
        return;
    }
    if (payload.unit_price < 0 || payload.stock_qty < 0 || payload.reorder_level < 0 || (payload.cost_price != null && payload.cost_price < 0)) {
        toastError("Price and stock values must be >= 0");
        return;
    }

    if (statusEl) statusEl.textContent = "Saving...";
    try {
        const productId = Number(idEl?.value || 0);
        const isEdit = productId > 0;
        const method = isEdit ? "PUT" : "POST";
        const url = isEdit
            ? `${API_BASE}/api/admin/pro-shop/products/${productId}`
            : `${API_BASE}/api/admin/pro-shop/products`;

        await fetchJson(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (statusEl) statusEl.textContent = isEdit ? "Product updated" : "Product created";
        toastSuccess(isEdit ? "Product updated" : "Product created");
        if (!isEdit) resetProShopProductForm();
        await loadProShopProducts();
    } catch (error) {
        console.error("Failed to save pro shop product:", error);
        if (statusEl) statusEl.textContent = error?.message || "Save failed";
        toastError(error?.message || "Failed to save product");
    }
}

async function loadProShopSales() {
    const daysSelect = document.getElementById("pro-shop-sales-window");
    const parsedDays = Number(daysSelect?.value || proShopSalesWindowDays || 30);
    const windowDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(365, Math.round(parsedDays)) : 30;
    proShopSalesWindowDays = windowDays;

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/pro-shop/sales?limit=20&days=${windowDays}`);
        const sales = Array.isArray(data?.sales) ? data.sales : [];
        const summary = data?.summary || {};
        const salesBody = document.getElementById("pro-shop-sales-body");
        const todayTotalEl = document.getElementById("pro-shop-today-total");
        const todayTxEl = document.getElementById("pro-shop-today-transactions");
        const periodTotalEl = document.getElementById("pro-shop-period-total");
        const periodLabelEl = document.getElementById("pro-shop-period-label");

        if (todayTotalEl) todayTotalEl.textContent = formatCurrencyZAR(summary.today_total || 0);
        if (todayTxEl) todayTxEl.textContent = String(summary.today_transactions || 0);
        if (periodTotalEl) periodTotalEl.textContent = formatCurrencyZAR(summary.period_total || 0);
        if (periodLabelEl) {
            periodLabelEl.textContent = windowDays >= 365 ? "YTD / 365 Days" : `Last ${formatInteger(windowDays)} Days`;
        }

        if (salesBody) {
            if (!sales.length) {
                salesBody.innerHTML = `
                    <tr class="empty-row">
                        <td colspan="5"><div class="empty-state">No sales recorded yet.</div></td>
                    </tr>
                `;
            } else {
                salesBody.innerHTML = sales.map(row => {
                    const items = Array.isArray(row.items)
                        ? row.items.map(item => `${item.name} x${item.quantity}`).join(", ")
                        : "-";
                    return `
                        <tr>
                            <td>${escapeHtml(formatDateTimeDMY(row.sold_at))}</td>
                            <td>${row.customer_name ? escapeHtml(String(row.customer_name)) : "-"}</td>
                            <td>${escapeHtml(items)}</td>
                            <td>${escapeHtml(String(row.payment_method || "-").toUpperCase())}</td>
                            <td>${escapeHtml(formatCurrencyZAR(row.total || 0))}</td>
                        </tr>
                    `;
                }).join("");
            }
        }
    } catch (error) {
        console.error("Failed to load pro shop sales:", error);
        toastError(error?.message || "Failed to load pro shop sales");
    }
}

async function checkoutProShopSale() {
    const statusEl = document.getElementById("pro-shop-checkout-status");
    if (!proShopCart.length) {
        toastError("Cart is empty");
        return;
    }

    const payload = {
        customer_name: String(document.getElementById("pro-shop-customer")?.value || "").trim() || null,
        payment_method: String(document.getElementById("pro-shop-payment-method")?.value || "card").trim().toLowerCase(),
        notes: null,
        discount: 0,
        tax: 0,
        items: proShopCart.map(item => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
        })),
    };

    if (statusEl) statusEl.textContent = "Completing sale...";
    try {
        await fetchJson(`${API_BASE}/api/admin/pro-shop/sales`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        clearProShopCart();
        const customerEl = document.getElementById("pro-shop-customer");
        if (customerEl) customerEl.value = "";
        if (statusEl) statusEl.textContent = "Sale completed";
        toastSuccess("Pro shop sale captured");
        await Promise.allSettled([loadProShopProducts(), loadProShopSales(), refreshDashboardIfVisible({ silent: true, useCache: false })]);
    } catch (error) {
        console.error("Pro shop checkout failed:", error);
        if (statusEl) statusEl.textContent = error?.message || "Checkout failed";
        toastError(error?.message || "Checkout failed");
    }
}

async function initProShopPage() {
    const searchEl = document.getElementById("pro-shop-search");
    const stockFilterEl = document.getElementById("pro-shop-stock-filter");
    const categoryFilterEl = document.getElementById("pro-shop-category-filter");
    const salesWindowEl = document.getElementById("pro-shop-sales-window");
    if (searchEl && !searchEl.dataset.bound) {
        let timer = null;
        searchEl.addEventListener("input", () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                loadProShopProducts();
            }, 180);
        });
        searchEl.dataset.bound = "1";
    }
    if (stockFilterEl instanceof HTMLSelectElement && !stockFilterEl.dataset.bound) {
        proShopStockFilter = String(stockFilterEl.value || "all").toLowerCase();
        stockFilterEl.addEventListener("change", () => {
            proShopStockFilter = String(stockFilterEl.value || "all").toLowerCase();
            renderProShopProducts();
        });
        stockFilterEl.dataset.bound = "1";
    }
    if (categoryFilterEl instanceof HTMLSelectElement && !categoryFilterEl.dataset.bound) {
        proShopCategoryFilter = String(categoryFilterEl.value || "all").toLowerCase();
        categoryFilterEl.addEventListener("change", () => {
            proShopCategoryFilter = String(categoryFilterEl.value || "all").toLowerCase();
            renderProShopProducts();
        });
        categoryFilterEl.dataset.bound = "1";
    }
    if (salesWindowEl instanceof HTMLSelectElement && !salesWindowEl.dataset.bound) {
        proShopSalesWindowDays = Number(salesWindowEl.value || "30") || 30;
        salesWindowEl.addEventListener("change", () => {
            proShopSalesWindowDays = Number(salesWindowEl.value || "30") || 30;
            loadProShopSales();
        });
        salesWindowEl.dataset.bound = "1";
    }

    renderProShopCart();
    await Promise.allSettled([loadProShopProducts(), loadProShopSales()]);
}

// Tee Sheet
let TEE_DEFAULT_START = "06:30";
let TEE_DEFAULT_END = "16:30";
let TEE_DEFAULT_INTERVAL_MIN = 8;
let TEE_NINE_HOLE_START = "15:40";
let TEE_NINE_HOLE_END = "17:30";
let lastNineAutoGenKey = null;
let lastBulkBookGroupId = null;

function defaultTeeProfile() {
    return {
        version: 1,
        interval_min: 8,
        winter_months: [5, 6, 7, 8],
        two_tee_days: [1, 2, 3, 5],
        two_tee_tees: ["1", "10"],
        one_tee_tees: ["1"],
        summer: {
            two_tee_windows: [{ start: "06:30", end: "08:30" }, { start: "11:30", end: "13:30" }],
            one_tee_windows: [{ start: "06:30", end: "13:30" }],
            nine_hole_start: "15:40",
            nine_hole_end: "17:30",
        },
        winter: {
            two_tee_windows: [{ start: "06:45", end: "08:00" }, { start: "11:00", end: "13:00" }],
            one_tee_windows: [{ start: "06:45", end: "13:00" }],
            nine_hole_start: "15:15",
            nine_hole_end: "16:45",
        }
    };
}

function normalizeClockValue(value, fallback) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return fallback;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return fallback;
    }
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function addMinutesClock(value, minutes, fallback) {
    const base = normalizeClockValue(value, "");
    if (!base) return fallback;
    const [hh, mm] = base.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
    const total = Math.min((23 * 60) + 59, Math.max(0, (hh * 60) + mm + Number(minutes || 0)));
    const outH = Math.floor(total / 60);
    const outM = total % 60;
    return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
}

function normalizeWindowList(value, fallback) {
    const rows = Array.isArray(value) ? value : [];
    const out = rows
        .map((row) => {
            const start = normalizeClockValue(row?.start, "");
            const end = normalizeClockValue(row?.end, "");
            if (!start || !end || start > end) return null;
            return { start, end };
        })
        .filter(Boolean);
    return out.length ? out : fallback.map((w) => ({ start: w.start, end: w.end }));
}

function normalizeTeeProfile(rawProfile) {
    const fallback = defaultTeeProfile();
    const raw = (rawProfile && typeof rawProfile === "object") ? rawProfile : {};

    const intervalRaw = parseInt(String(raw.interval_min ?? fallback.interval_min), 10);
    const interval = Number.isFinite(intervalRaw) ? Math.min(30, Math.max(1, intervalRaw)) : fallback.interval_min;

    const normalizeNums = (rows, min, max, fallbackValues) => {
        const list = Array.isArray(rows) ? rows : [];
        const uniq = [];
        for (const item of list) {
            const n = parseInt(String(item), 10);
            if (!Number.isFinite(n) || n < min || n > max) continue;
            if (!uniq.includes(n)) uniq.push(n);
        }
        return uniq.length ? uniq : [...fallbackValues];
    };

    const normalizeTees = (rows, fallbackValues) => {
        const list = Array.isArray(rows) ? rows : [];
        const uniq = [];
        for (const item of list) {
            const tee = String(item || "").trim();
            if (!tee) continue;
            if (!uniq.includes(tee)) uniq.push(tee);
        }
        return uniq.length ? uniq : [...fallbackValues];
    };

    const normalizeSeason = (seasonRaw, seasonFallback) => {
        const season = (seasonRaw && typeof seasonRaw === "object") ? seasonRaw : {};
        return {
            two_tee_windows: normalizeWindowList(season.two_tee_windows, seasonFallback.two_tee_windows),
            one_tee_windows: normalizeWindowList(season.one_tee_windows, seasonFallback.one_tee_windows),
            nine_hole_start: normalizeClockValue(season.nine_hole_start, seasonFallback.nine_hole_start),
            nine_hole_end: normalizeClockValue(season.nine_hole_end, seasonFallback.nine_hole_end),
        };
    };

    return {
        version: 1,
        interval_min: interval,
        winter_months: normalizeNums(raw.winter_months, 1, 12, fallback.winter_months),
        two_tee_days: normalizeNums(raw.two_tee_days, 0, 6, fallback.two_tee_days),
        two_tee_tees: normalizeTees(raw.two_tee_tees, fallback.two_tee_tees),
        one_tee_tees: normalizeTees(raw.one_tee_tees, fallback.one_tee_tees),
        summer: normalizeSeason(raw.summer, fallback.summer),
        winter: normalizeSeason(raw.winter, fallback.winter),
    };
}

function pyWeekdayFromDateStr(dateStr) {
    const [year, month, day] = String(dateStr || "").split("-").map(Number);
    if (!year || !month || !day) {
        const jsDay = new Date().getDay();
        return (jsDay + 6) % 7;
    }
    const jsDay = new Date(year, month - 1, day).getDay();
    return (jsDay + 6) % 7;
}

function monthFromDateStr(dateStr) {
    const [year, month, day] = String(dateStr || "").split("-").map(Number);
    if (!year || !month || !day) return (new Date().getMonth() + 1);
    return month;
}

function teePlanForDate(dateStr, holes = 18) {
    const profile = normalizeTeeProfile(teeSheetProfile);
    const month = monthFromDateStr(dateStr);
    const seasonKey = profile.winter_months.includes(month) ? "winter" : "summer";
    const season = profile[seasonKey] || profile.summer;
    const weekdayPy = pyWeekdayFromDateStr(dateStr);
    const twoTee = profile.two_tee_days.includes(weekdayPy);
    const tees = twoTee ? profile.two_tee_tees : profile.one_tee_tees;
    const oneTeeWindows = normalizeWindowList(season.one_tee_windows, [{ start: "06:30", end: "13:30" }]);
    const oneTeeLastEnd = oneTeeWindows[oneTeeWindows.length - 1]?.end || "13:30";
    const nineStart = twoTee
        ? normalizeClockValue(season.nine_hole_start, "15:30")
        : addMinutesClock(oneTeeLastEnd, 15, normalizeClockValue(season.nine_hole_start, "13:45"));
    const nineEnd = normalizeClockValue(season.nine_hole_end, "17:00");
    const windows = holes === 9
        ? [{ start: nineStart, end: nineEnd }]
        : (twoTee ? season.two_tee_windows : season.one_tee_windows);

    const safeWindows = normalizeWindowList(windows, [{ start: "06:30", end: "13:30" }]);

    return {
        season: seasonKey,
        mode: twoTee ? "two_tee" : "one_tee",
        interval_min: profile.interval_min,
        tees: Array.isArray(tees) && tees.length ? tees : ["1"],
        windows: safeWindows,
        nine_hole_start: season.nine_hole_start,
        nine_hole_end: season.nine_hole_end,
    };
}

function applyTeePlanGlobals(dateStr) {
    const plan18 = teePlanForDate(dateStr, 18);
    const plan9 = teePlanForDate(dateStr, 9);
    TEE_DEFAULT_START = plan18.windows[0]?.start || TEE_DEFAULT_START;
    TEE_DEFAULT_END = plan18.windows[plan18.windows.length - 1]?.end || TEE_DEFAULT_END;
    TEE_DEFAULT_INTERVAL_MIN = Number(plan18.interval_min || TEE_DEFAULT_INTERVAL_MIN);
    TEE_NINE_HOLE_START = plan9.windows[0]?.start || TEE_NINE_HOLE_START;
    TEE_NINE_HOLE_END = plan9.windows[0]?.end || TEE_NINE_HOLE_END;
}

function floorToInterval(dateObj, intervalMin) {
    const d = new Date(dateObj);
    const mins = d.getMinutes();
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(mins / intervalMin) * intervalMin);
    return d;
}

function isTeeTimeClosed(dateStr, teeTimeIso, teeStatus = "open") {
    if (String(teeStatus || "").toLowerCase() === "blocked") return true;
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    if (!y || !m || !d) return false;

    const selected0 = new Date(y, m - 1, d);
    selected0.setHours(0, 0, 0, 0);

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);

    // Past days are fully closed; future days are open.
    if (selected0.getTime() < today0.getTime()) return true;
    if (selected0.getTime() > today0.getTime()) return false;

    // Today: closed if tee time is earlier than the current interval floor (e.g. 11:05 => 11:00).
    const threshold = floorToInterval(new Date(), TEE_DEFAULT_INTERVAL_MIN);
    return new Date(teeTimeIso) < threshold;
}

function scrollTeeSheetToNow(dateStr) {
    const [y, m, d] = String(dateStr || "").split("-").map(Number);
    if (!y || !m || !d) return;

    const selected0 = new Date(y, m - 1, d);
    selected0.setHours(0, 0, 0, 0);

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    if (selected0.getTime() !== today0.getTime()) return;

    const threshold = floorToInterval(new Date(), TEE_DEFAULT_INTERVAL_MIN);
    const rows = Array.from(document.querySelectorAll("#admin-tee-sheet-body tr[data-tee-time-iso]"));
    const target = rows.find(r => {
        const iso = r.getAttribute("data-tee-time-iso");
        const dt = iso ? new Date(iso) : null;
        return dt && !Number.isNaN(dt.getTime()) && dt >= threshold;
    });

    if (target) {
        setTimeout(() => {
            const wrap = document.querySelector(".tee-sheet-table-wrap");
            if (!wrap) {
                target.scrollIntoView({ block: "start" });
                return;
            }

            const head = wrap.querySelector(".tee-sheet-head");
            const headH = head ? head.getBoundingClientRect().height : 0;
            const wrapRect = wrap.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const delta = (targetRect.top - wrapRect.top) - headH;
            wrap.scrollTop = Math.max(0, wrap.scrollTop + delta);
        }, 0);
    }
}

function setupTeeSheetFilters() {
    const dateInput = document.getElementById("tee-sheet-date");
    const holesButtons = document.querySelectorAll("#tee-times .holes-btn");
    const searchInput = document.getElementById("tee-sheet-search");
    const todayBtn = document.getElementById("tee-sheet-today-btn");
    const clearBtn = document.getElementById("tee-sheet-clear-search-btn");
    if (!dateInput) return;

    if (!dateInput.value) {
        setSelectedTeeSheetDate(localTodayYMD(), { updateInput: true });
    } else {
        setSelectedTeeSheetDate(dateInput.value);
    }

    dateInput.addEventListener("input", () => {
        setSelectedTeeSheetDate(dateInput.value);
    });

    dateInput.addEventListener("change", () => {
        setSelectedTeeSheetDate(dateInput.value);
        clearTeeSheetBulkSelection({ resetScope: true });
        loadTeeTimes();
    });

    holesButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            holesButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedHolesView = btn.dataset.holes || "18";
            clearTeeSheetBulkSelection({ resetScope: true });
            loadTeeTimes();
        });
    });

    let searchTimer = null;
    searchInput?.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => applyTeeSheetSearchFilter(), 150);
    });

    searchInput?.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            searchInput.value = "";
            applyTeeSheetSearchFilter();
        }
    });

    todayBtn?.addEventListener("click", () => {
        setSelectedTeeSheetDate(localTodayYMD(), { updateInput: true });
        clearTeeSheetBulkSelection({ resetScope: true });
        loadTeeTimes();
    });

    clearBtn?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        applyTeeSheetSearchFilter();
    });

    setupTeeSheetDragDrop();
}

async function runTeeManageAction(action, triggerButton = null) {
    const item = triggerButton instanceof HTMLButtonElement ? triggerButton : null;
    if (action === "booking-window") {
        document.getElementById("booking-window-modal")?.classList.add("show");
        loadBookingWindowSettings();
        return;
    }

    if (action === "tee-profile") {
        document.getElementById("tee-profile-modal")?.classList.add("show");
        loadTeeProfileSettings();
        return;
    }

    if (action === "bulk-book") {
        openBulkBookModal();
        return;
    }

    if (action === "import-bookings") {
        openBookingsImportModal();
        return;
    }

    if (action === "generate") {
        if (item?.disabled) return;
        const dateStr = currentTeeSheetDate();
        try {
            if (item) item.disabled = true;
            const created = await generateDaySheet(dateStr, new Set());
            toastSuccess(`Generated ${created.toLocaleString()} tee times`);
            loadTeeTimes();
        } catch (err) {
            toastError(err?.message || "Failed to generate tee times");
        } finally {
            if (item) item.disabled = false;
        }
    }
}

function setupTeeManageMenu() {
    const root = document.querySelector("[data-tee-action-root]");
    const legacyMenu = document.getElementById("tee-manage-menu");
    const legacyBtn = document.getElementById("tee-manage-btn");
    if (!root && !legacyMenu) return;

    const closeLegacyMenu = () => {
        if (!(legacyMenu instanceof HTMLElement)) return;
        legacyMenu.classList.remove("open");
        if (legacyBtn instanceof HTMLElement) legacyBtn.setAttribute("aria-expanded", "false");
    };

    if (legacyBtn instanceof HTMLElement && legacyMenu instanceof HTMLElement) {
        legacyBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nextOpen = !legacyMenu.classList.contains("open");
            legacyMenu.classList.toggle("open", nextOpen);
            legacyBtn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        });

        document.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (legacyBtn.contains(target) || legacyMenu.contains(target)) return;
            closeLegacyMenu();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeLegacyMenu();
        });
    }

    const clickRoots = [root, legacyMenu].filter((el) => el instanceof HTMLElement);
    clickRoots.forEach((container) => {
        container.addEventListener("click", async (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const item = target.closest("button[data-action]");
            if (!(item instanceof HTMLButtonElement) || !container.contains(item)) return;
            if (legacyMenu instanceof HTMLElement && legacyMenu.contains(item)) closeLegacyMenu();
            const action = item.getAttribute("data-action") || "";
            await runTeeManageAction(action, item);
        });
    });
}

function setTeeWeatherStatus(message = "") {
    return String(message || "");
}

function clearTeeWeatherFlagsInDom() {
    teeWeatherRiskMap = new Map();
}

async function autoFlagTeeSheetWeather(dateStr, options = {}) {
    teeWeatherRequestSeq += 1;
    teeWeatherRiskMap = new Map();
    return { date: String(dateStr || ""), disabled: true, silent: Boolean(options?.silent) };
}

function teeSlotStatusNeedsPayment(status) {
    const value = String(status || "").trim().toLowerCase();
    return value === "checked_in" || value === "completed";
}

function canUseTeeSheetBulkActions() {
    return String(currentUserRole || "").trim().toLowerCase() === "admin";
}

function currentTeeSheetSelectionScopeKey() {
    return `${currentTeeSheetDate()}|${String(selectedTee || "all")}|${String(selectedHolesView || "18")}`;
}

function currentTeeSheetBookingLookup() {
    const lookup = new Map();
    teeSheetTeeTimeMap.forEach((slot) => {
        const bookings = Array.isArray(slot?.bookings) ? slot.bookings : [];
        bookings.forEach((booking) => {
            const bookingId = Number.parseInt(String(booking?.id || ""), 10);
            if (Number.isFinite(bookingId) && bookingId > 0) {
                lookup.set(String(bookingId), booking);
            }
        });
    });
    return lookup;
}

function visibleTeeSheetBookingIds() {
    return Array.from(document.querySelectorAll("#admin-tee-sheet-body tr[data-tee-time-iso]"))
        .filter((row) => row instanceof HTMLElement && row.style.display !== "none")
        .flatMap((row) => Array.from(row.querySelectorAll(".slot-card[data-booking-id]")))
        .map((card) => Number.parseInt(String(card.getAttribute("data-booking-id") || ""), 10))
        .filter((bookingId) => Number.isFinite(bookingId) && bookingId > 0);
}

function clearTeeSheetBulkSelection(options = {}) {
    teeSheetBulkSelectedBookingIds = new Set();
    if (options.resetScope === true) {
        teeSheetBulkSelectionScopeKey = "";
    }
    syncTeeSheetBulkCheckboxes();
    updateTeeSheetBulkSelectionSummary();
}

function syncTeeSheetBulkCheckboxes() {
    document.querySelectorAll("#admin-tee-sheet-body input[data-tee-bulk-booking-id]").forEach((input) => {
        if (!(input instanceof HTMLInputElement)) return;
        const bookingId = Number.parseInt(String(input.getAttribute("data-tee-bulk-booking-id") || ""), 10);
        input.checked = Number.isFinite(bookingId) && teeSheetBulkSelectedBookingIds.has(String(bookingId));
    });
}

function pruneTeeSheetBulkSelectionToVisible() {
    if (!canUseTeeSheetBulkActions()) {
        clearTeeSheetBulkSelection({ resetScope: true });
        return;
    }
    const visibleIds = new Set(visibleTeeSheetBookingIds().map((bookingId) => String(bookingId)));
    let changed = false;
    Array.from(teeSheetBulkSelectedBookingIds).forEach((bookingId) => {
        if (!visibleIds.has(String(bookingId))) {
            teeSheetBulkSelectedBookingIds.delete(String(bookingId));
            changed = true;
        }
    });
    if (changed) {
        syncTeeSheetBulkCheckboxes();
    }
}

function toggleTeeSheetBulkBooking(bookingId, checked) {
    if (!canUseTeeSheetBulkActions()) return;
    const normalizedId = Number.parseInt(String(bookingId || ""), 10);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return;
    if (checked) {
        teeSheetBulkSelectedBookingIds.add(String(normalizedId));
    } else {
        teeSheetBulkSelectedBookingIds.delete(String(normalizedId));
    }
    updateTeeSheetBulkSelectionSummary();
}

function selectAllVisibleTeeSheetBookings() {
    if (!canUseTeeSheetBulkActions()) return;
    visibleTeeSheetBookingIds().forEach((bookingId) => {
        teeSheetBulkSelectedBookingIds.add(String(bookingId));
    });
    syncTeeSheetBulkCheckboxes();
    updateTeeSheetBulkSelectionSummary();
}

function selectedTeeSheetBookings() {
    const lookup = currentTeeSheetBookingLookup();
    return Array.from(teeSheetBulkSelectedBookingIds)
        .map((bookingId) => lookup.get(String(bookingId)))
        .filter(Boolean);
}

function updateTeeSheetBulkSelectionSummary() {
    const bar = document.getElementById("tee-sheet-bulk-bar");
    const countEl = document.getElementById("tee-sheet-bulk-count");
    const totalEl = document.getElementById("tee-sheet-bulk-total");
    const noteEl = document.getElementById("tee-sheet-bulk-note");
    const selectAllBtn = document.getElementById("tee-sheet-bulk-select-all");
    const clearBtn = document.getElementById("tee-sheet-bulk-clear");
    const manageBtn = document.getElementById("tee-sheet-bulk-manage");

    if (!(bar instanceof HTMLElement)) return;

    if (!canUseTeeSheetBulkActions()) {
        bar.style.display = "none";
        return;
    }

    pruneTeeSheetBulkSelectionToVisible();
    const visibleIds = visibleTeeSheetBookingIds();
    const selectedBookings = selectedTeeSheetBookings();
    const selectedCount = selectedBookings.length;
    const selectedTotal = selectedBookings.reduce((sum, booking) => sum + safeNumber(booking?.price), 0);

    bar.style.display = visibleIds.length ? "" : "none";
    if (countEl) countEl.textContent = formatInteger(selectedCount);
    if (totalEl) totalEl.textContent = formatCurrencyZAR(selectedTotal);
    if (noteEl) {
        noteEl.textContent = selectedCount
            ? `${formatInteger(selectedCount)} selected from the visible tee sheet.`
            : "Select bookings from the current tee sheet to apply a bulk action.";
    }
    if (selectAllBtn instanceof HTMLButtonElement) selectAllBtn.disabled = visibleIds.length === 0;
    if (clearBtn instanceof HTMLButtonElement) clearBtn.disabled = selectedCount === 0;
    if (manageBtn instanceof HTMLButtonElement) manageBtn.disabled = selectedCount === 0;
}

function closeTeeSlotManageModal() {
    document.getElementById("tee-slot-modal")?.classList.remove("show");
}

function getSelectedTeeSlotBookingIds() {
    return Array.from(document.querySelectorAll("#tee-slot-player-list input[data-booking-id]:checked"))
        .map((input) => Number.parseInt(String(input.getAttribute("data-booking-id") || ""), 10))
        .filter((id) => Number.isFinite(id) && id > 0);
}

function updateTeeSlotSelectionSummary() {
    const selectedIds = new Set(getSelectedTeeSlotBookingIds().map((id) => String(id)));
    const selectedCountEl = document.getElementById("tee-slot-selected-count");
    const selectedTotalEl = document.getElementById("tee-slot-selected-total");

    const selectedBookings = (teeSlotManageState.bookings || []).filter((booking) => selectedIds.has(String(booking?.id || "")));
    const selectedCount = selectedBookings.length;
    const selectedTotal = selectedBookings.reduce((sum, booking) => sum + safeNumber(booking?.price), 0);

    if (selectedCountEl) selectedCountEl.textContent = formatInteger(selectedCount);
    if (selectedTotalEl) selectedTotalEl.textContent = formatCurrencyZAR(selectedTotal);
}

function updateTeeSlotActionHelp() {
    const status = String(document.getElementById("tee-slot-action-status")?.value || "").trim().toLowerCase();
    const helpEl = document.getElementById("tee-slot-action-help");
    const paymentSelect = document.getElementById("tee-slot-payment-method");
    const paymentEnabled = !status || teeSlotStatusNeedsPayment(status);
    if (paymentSelect instanceof HTMLSelectElement) {
        paymentSelect.disabled = !paymentEnabled;
    }
    if (!helpEl) return;

    if (!status) {
        helpEl.textContent = "No status change: use this to update payment method and/or debtor account for selected players.";
        return;
    }
    if (teeSlotStatusNeedsPayment(status)) {
        helpEl.textContent = "Selected players will be marked paid. Green fee ledger entries will be created or updated.";
        return;
    }
    helpEl.textContent = "Selected players will move to this status. Existing payment entries for those bookings will be removed.";
}

function renderTeeSlotPlayerList(bookings = []) {
    const root = document.getElementById("tee-slot-player-list");
    if (!(root instanceof HTMLElement)) return;
    const rows = Array.isArray(bookings) ? bookings : [];

    if (!rows.length) {
        root.innerHTML = `<div class="empty-state" style="padding:16px;">No bookings found in this slot.</div>`;
        updateTeeSlotSelectionSummary();
        return;
    }

    root.innerHTML = rows.map((booking) => {
        const bookingId = Number.parseInt(String(booking?.id || ""), 10);
        const safeBookingId = Number.isFinite(bookingId) ? bookingId : 0;
        const name = escapeHtml(String(booking?.player_name || "Player"));
        const email = booking?.player_email ? escapeHtml(String(booking.player_email)) : "No email";
        const status = String(booking?.status || "booked");
        const statusClass = statusToClass(status);
        const statusLabel = statusToLabel(status);
        const price = booking?.price_unresolved ? "Pricing unresolved" : formatCurrencyZAR(booking?.price || 0);

        return `
            <div class="tee-slot-player-row">
                <label class="tee-slot-player-main">
                    <input type="checkbox" data-booking-id="${safeBookingId}" checked>
                    <span>
                        <span class="tee-slot-player-name">${name}</span>
                        <span class="tee-slot-player-meta">${email} • ${price}</span>
                    </span>
                </label>
                <span class="status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
                <button type="button" class="btn-secondary btn-small tee-slot-player-open" data-open-booking-id="${safeBookingId}">Open</button>
            </div>
        `;
    }).join("");

    updateTeeSlotSelectionSummary();
}

function openTeeSlotManageModalForState(state) {
    const modal = document.getElementById("tee-slot-modal");
    if (!(modal instanceof HTMLElement)) return;
    const nextState = state && typeof state === "object" ? state : null;
    const bookings = Array.isArray(nextState?.bookings) ? nextState.bookings.filter(Boolean) : [];
    if (!bookings.length) {
        toastInfo("No bookings selected for bulk action.");
        return;
    }

    teeSlotManageState = {
        mode: String(nextState?.mode || "slot"),
        teeTimeId: Number.parseInt(String(nextState?.teeTimeId || ""), 10) || null,
        teeTimeIso: String(nextState?.teeTimeIso || ""),
        teeLabel: String(nextState?.teeLabel || "1"),
        bookings: bookings.map((booking) => ({ ...booking })),
        heading: String(nextState?.heading || "Manage Tee Slot"),
        intro: String(nextState?.intro || "Process multiple players in one step (status, payment method, and debtor account)."),
        refreshLabel: String(nextState?.refreshLabel || "Refresh Slot"),
    };

    const headingEl = document.getElementById("tee-slot-modal-title");
    const introEl = document.getElementById("tee-slot-modal-intro");
    const timeEl = document.getElementById("tee-slot-time");
    const teeEl = document.getElementById("tee-slot-tee");
    const bookedEl = document.getElementById("tee-slot-booked-count");
    const statusEl = document.getElementById("tee-slot-action-status");
    const paymentEl = document.getElementById("tee-slot-payment-method");
    const accountEl = document.getElementById("tee-slot-account-code");
    const textEl = document.getElementById("tee-slot-status-text");
    const refreshBtn = document.getElementById("tee-slot-refresh-detail");

    if (headingEl) headingEl.textContent = teeSlotManageState.heading;
    if (introEl) introEl.textContent = teeSlotManageState.intro;
    if (timeEl) {
        timeEl.textContent = teeSlotManageState.teeTimeIso
            ? (teeSlotManageState.mode === "selection"
                ? formatDateDMY(teeSlotManageState.teeTimeIso)
                : formatDateTimeDMY(teeSlotManageState.teeTimeIso))
            : "-";
    }
    if (teeEl) teeEl.textContent = teeSlotManageState.teeLabel || "1";
    if (bookedEl) bookedEl.textContent = formatInteger(bookings.length);
    if (textEl) textEl.textContent = "";
    if (refreshBtn instanceof HTMLButtonElement) {
        refreshBtn.textContent = teeSlotManageState.refreshLabel || "Refresh Slot";
    }

    const allAlreadyChecked = bookings.every((booking) => {
        const status = String(booking?.status || "").toLowerCase();
        return status === "checked_in" || status === "completed";
    });
    if (statusEl instanceof HTMLSelectElement) {
        statusEl.value = allAlreadyChecked ? "completed" : "checked_in";
    }

    const rememberedMethod = String(localStorage.getItem("last_payment_method") || "CARD").trim().toUpperCase();
    if (paymentEl instanceof HTMLSelectElement) {
        paymentEl.value = rememberedMethod && Array.from(paymentEl.options).some((opt) => opt.value === rememberedMethod)
            ? rememberedMethod
            : "CARD";
    }

    if (accountEl instanceof HTMLInputElement) {
        const firstAccount = bookings
            .map((booking) => String(booking?.club_card || "").trim())
            .find((value) => Boolean(value));
        accountEl.value = firstAccount || "";
        accountEl.setAttribute("list", "account-customer-codes");
    }

    renderTeeSlotPlayerList(teeSlotManageState.bookings);
    updateTeeSlotActionHelp();
    if (!accountCustomersCache.length) {
        loadAccountCustomersCache({ silent: true });
    }
    modal.classList.add("show");
}

function openTeeSlotManageModal(teeTimeId) {
    if (!canUseTeeSheetBulkActions()) return;
    const slot = teeSheetTeeTimeMap.get(String(teeTimeId));
    if (!slot) {
        toastError("Slot data is stale. Refresh the tee sheet and try again.");
        return;
    }

    const bookings = Array.isArray(slot.bookings) ? slot.bookings.filter(Boolean) : [];
    if (!bookings.length) {
        toastInfo("No players booked in this slot yet.");
        return;
    }

    openTeeSlotManageModalForState({
        mode: "slot",
        teeTimeId: Number.parseInt(String(slot.id || teeTimeId || ""), 10) || null,
        teeTimeIso: String(slot.tee_time || ""),
        teeLabel: String(slot.hole || "1"),
        bookings,
        heading: "Manage Tee Slot",
        intro: "Process multiple players in one step (status, payment method, and debtor account).",
        refreshLabel: "Refresh Slot",
    });
}

function openSelectedTeeSheetBulkManageModal() {
    if (!canUseTeeSheetBulkActions()) return;
    const bookings = selectedTeeSheetBookings();
    if (!bookings.length) {
        toastInfo("Select at least one booking from the tee sheet.");
        return;
    }
    const teeLabel = String(selectedTee || "all") === "all"
        ? "All visible tees"
        : `Tee ${normalizeTeeLabel(selectedTee || "1") || "1"}`;
    openTeeSlotManageModalForState({
        mode: "selection",
        teeTimeId: null,
        teeTimeIso: `${currentTeeSheetDate()}T00:00:00`,
        teeLabel,
        bookings,
        heading: "Bulk Tee-Sheet Action",
        intro: "Apply one explicit action to the selected bookings on the current tee sheet.",
        refreshLabel: "Refresh Selection",
    });
}

async function applyTeeSlotBatchUpdate() {
    const applyBtn = document.getElementById("tee-slot-apply");
    const statusText = document.getElementById("tee-slot-status-text");
    const selectedIds = getSelectedTeeSlotBookingIds();
    if (!selectedIds.length) {
        toastInfo("Select at least one player in this slot.");
        return;
    }

    const status = String(document.getElementById("tee-slot-action-status")?.value || "").trim().toLowerCase();
    const paymentMethod = String(document.getElementById("tee-slot-payment-method")?.value || "").trim().toUpperCase();
    const accountCodeRaw = String(document.getElementById("tee-slot-account-code")?.value || "").trim();
    const accountCode = normalizeAccountCodeInput(accountCodeRaw);
    const matchedAccount = findAccountCustomerByCode(accountCode);

    const payload = { booking_ids: selectedIds };
    if (status) payload.status = status;
    if (paymentMethod && (!status || teeSlotStatusNeedsPayment(status))) payload.payment_method = paymentMethod;
    if (accountCode) payload.account_code = accountCode;
    if (matchedAccount?.id) payload.account_customer_id = Number(matchedAccount.id);

    if (!payload.status && !payload.payment_method && !payload.account_code && !payload.account_customer_id) {
        toastInfo("Pick a status action, payment method, or debtor account before applying.");
        return;
    }

    if (paymentMethod) {
        localStorage.setItem("last_payment_method", paymentMethod);
    }

    if (applyBtn instanceof HTMLButtonElement) {
        applyBtn.disabled = true;
        applyBtn.textContent = "Applying...";
    }
    if (statusText) statusText.textContent = "Updating bookings...";

    try {
        const token = localStorage.getItem("token");
        const result = await fetchJson(`${API_BASE}/api/admin/bookings/batch-update`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        closeTeeSlotManageModal();
        clearTeeSheetBulkSelection();
        await loadTeeTimes({ preserveScroll: true });
        if (currentActivePage === "bookings") {
            loadBookings();
        }
        refreshDashboardIfVisible({ silent: true, useCache: false });

        const updated = Number(result?.updated || selectedIds.length);
        const actionLabel = payload.status ? ` (${statusToLabel(String(payload.status))})` : "";
        toastSuccess(`Updated ${formatInteger(updated)} booking${updated === 1 ? "" : "s"}${actionLabel}.`);
    } catch (error) {
        const message = String(error?.message || "Unable to update selected bookings.");
        if (statusText) statusText.textContent = message;
        toastError(message);
    } finally {
        if (applyBtn instanceof HTMLButtonElement) {
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply to Selected";
        }
    }
}

function setupTeeSlotManageModal() {
    const modal = document.getElementById("tee-slot-modal");
    if (!(modal instanceof HTMLElement)) return;

    const selectAllBtn = document.getElementById("tee-slot-select-all");
    const selectNoneBtn = document.getElementById("tee-slot-select-none");
    const refreshBtn = document.getElementById("tee-slot-refresh-detail");
    const applyBtn = document.getElementById("tee-slot-apply");
    const statusSelect = document.getElementById("tee-slot-action-status");
    const paymentSelect = document.getElementById("tee-slot-payment-method");

    selectAllBtn?.addEventListener("click", () => {
        document.querySelectorAll("#tee-slot-player-list input[data-booking-id]").forEach((input) => {
            input.checked = true;
        });
        updateTeeSlotSelectionSummary();
    });

    selectNoneBtn?.addEventListener("click", () => {
        document.querySelectorAll("#tee-slot-player-list input[data-booking-id]").forEach((input) => {
            input.checked = false;
        });
        updateTeeSlotSelectionSummary();
    });

    refreshBtn?.addEventListener("click", async () => {
        if (refreshBtn instanceof HTMLButtonElement) refreshBtn.disabled = true;
        try {
            await loadTeeTimes({ preserveScroll: true });
            if (teeSlotManageState.mode === "selection") {
                openSelectedTeeSheetBulkManageModal();
            } else if (teeSlotManageState.teeTimeId) {
                openTeeSlotManageModal(teeSlotManageState.teeTimeId);
            }
        } finally {
            if (refreshBtn instanceof HTMLButtonElement) refreshBtn.disabled = false;
        }
    });

    applyBtn?.addEventListener("click", () => {
        applyTeeSlotBatchUpdate();
    });

    statusSelect?.addEventListener("change", () => {
        updateTeeSlotActionHelp();
    });

    paymentSelect?.addEventListener("change", () => {
        const method = String(paymentSelect.value || "").trim().toUpperCase();
        if (method) localStorage.setItem("last_payment_method", method);
    });

    modal.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.matches("#tee-slot-player-list input[data-booking-id]")) return;
        updateTeeSlotSelectionSummary();
    });

    modal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const openBtn = target.closest("[data-open-booking-id]");
        if (!(openBtn instanceof HTMLElement)) return;
        const bookingId = Number.parseInt(String(openBtn.getAttribute("data-open-booking-id") || ""), 10);
        if (!Number.isFinite(bookingId) || bookingId <= 0) return;
        closeTeeSlotManageModal();
        viewBookingDetail(bookingId);
    });
}

function setupTeeSheetBulkActions() {
    const selectAllBtn = document.getElementById("tee-sheet-bulk-select-all");
    const clearBtn = document.getElementById("tee-sheet-bulk-clear");
    const manageBtn = document.getElementById("tee-sheet-bulk-manage");
    selectAllBtn?.addEventListener("click", () => {
        selectAllVisibleTeeSheetBookings();
    });
    clearBtn?.addEventListener("click", () => {
        clearTeeSheetBulkSelection();
    });
    manageBtn?.addEventListener("click", () => {
        openSelectedTeeSheetBulkManageModal();
    });
    updateTeeSheetBulkSelectionSummary();
}

function openBulkBookModal() {
    const modal = document.getElementById("bulk-book-modal");
    if (!modal) return;

    const dateStr = currentTeeSheetDate();
    const holes = String(selectedHolesView) === "9" ? "9" : "18";
    applyTeePlanGlobals(dateStr);
    const plan = teePlanForDate(dateStr, holes === "9" ? 9 : 18);
    const startDefault = plan.windows[0]?.start || (holes === "9" ? TEE_NINE_HOLE_START : TEE_DEFAULT_START);
    const endDefault = plan.windows[plan.windows.length - 1]?.end || (holes === "9" ? TEE_NINE_HOLE_END : TEE_DEFAULT_END);
    const teeDefault = plan.mode === "one_tee" ? "1" : "all";

    const dateInput = document.getElementById("bulk-book-date");
    const holesSelect = document.getElementById("bulk-book-holes");
    const eventTypeSelect = document.getElementById("bulk-book-event-type");
    const teeSelect = document.getElementById("bulk-book-tee");
    const accountInput = document.getElementById("bulk-book-account-code");
    const startInput = document.getElementById("bulk-book-start");
    const endInput = document.getElementById("bulk-book-end");
    const slotsInput = document.getElementById("bulk-book-slots");
    const priceInput = document.getElementById("bulk-book-price");
    const statusEl = document.getElementById("bulk-book-status");
    const undoBtn = document.getElementById("bulk-book-undo");

    if (dateInput) dateInput.value = dateStr;
    if (holesSelect) holesSelect.value = holes;
    if (eventTypeSelect) eventTypeSelect.value = "group";
    if (teeSelect && teeDefault) teeSelect.value = teeDefault;
    if (accountInput) {
        accountInput.value = "";
        accountInput.setAttribute("list", "account-customer-codes");
    }
    if (startInput) startInput.value = startDefault;
    if (endInput) endInput.value = endDefault;
    if (slotsInput) slotsInput.value = String(Math.min(4, Math.max(1, parseInt(String(slotsInput.value || "4"), 10) || 4)));
    if (priceInput && !priceInput.value) priceInput.value = "0";

    if (statusEl) statusEl.textContent = "";
    lastBulkBookGroupId = null;
    if (undoBtn) undoBtn.disabled = true;
    if (!accountCustomersCache.length) {
        loadAccountCustomersCache({ silent: true });
    }

    modal.classList.add("show");
}

function openBookingsImportModal() {
    const modal = document.getElementById("import-bookings-modal");
    if (!modal) return;

    const fileInput = document.getElementById("import-bookings-file");
    const statusEl = document.getElementById("import-bookings-status");
    const runBtn = document.getElementById("import-bookings-run");

    if (fileInput) fileInput.value = "";
    if (statusEl) statusEl.textContent = "";
    if (runBtn) runBtn.disabled = false;

    modal.classList.add("show");
}

async function submitBookingsImport() {
    const token = localStorage.getItem("token");
    const provider = (document.getElementById("import-bookings-provider")?.value || "").trim();
    const fileInput = document.getElementById("import-bookings-file");
    const statusEl = document.getElementById("import-bookings-status");
    const runBtn = document.getElementById("import-bookings-run");

    const file = fileInput?.files?.[0];
    if (!provider) {
        alert("Please select a provider.");
        return;
    }
    if (!file) {
        alert("Please choose a CSV file to import.");
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Importing...";

    try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_BASE}/api/admin/imports/bookings-csv?provider=${encodeURIComponent(provider)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        const raw = await res.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

        if (!res.ok) {
            const msg = data?.detail || raw || "Import failed";
            throw new Error(msg);
        }

        if (statusEl) {
            statusEl.textContent = `Imported: ${data.rows_inserted ?? 0} new, ${data.rows_updated ?? 0} updated, ${data.rows_failed ?? 0} failed`;
        }

        toastSuccess(statusEl?.textContent || "Bookings imported");
        loadTeeTimes({ preserveScroll: true });
        if (currentActivePage === "bookings") loadBookings();
        if (currentActivePage === "dashboard") loadDashboard();
    } catch (e) {
        console.error("Bookings import failed:", e);
        if (statusEl) statusEl.textContent = "";
        toastError(`Bookings import failed: ${e?.message || e}`);
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

function openMembersImportModal() {
    const modal = document.getElementById("import-members-modal");
    if (!modal) return;

    const fileInput = document.getElementById("import-members-file");
    const statusEl = document.getElementById("import-members-status");
    const runBtn = document.getElementById("import-members-run");

    if (fileInput) fileInput.value = "";
    if (statusEl) statusEl.textContent = "";
    if (runBtn) runBtn.disabled = false;

    modal.classList.add("show");
}

async function submitMembersImport() {
    const token = localStorage.getItem("token");
    const fileInput = document.getElementById("import-members-file");
    const statusEl = document.getElementById("import-members-status");
    const runBtn = document.getElementById("import-members-run");

    const file = fileInput?.files?.[0];
    if (!file) {
        alert("Please choose a CSV file to import.");
        return;
    }

    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Importing...";

    try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${API_BASE}/api/admin/imports/members-csv`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        const raw = await res.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

        if (!res.ok) {
            const msg = data?.detail || raw || "Import failed";
            throw new Error(msg);
        }

        if (statusEl) {
            statusEl.textContent = `Imported: ${data.rows_inserted ?? 0} new, ${data.rows_updated ?? 0} updated, ${data.rows_failed ?? 0} failed`;
        }
    } catch (e) {
        console.error("Members import failed:", e);
        if (statusEl) statusEl.textContent = "";
        alert(`Members import failed: ${e?.message || e}`);
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

async function openImportLog() {
    const token = localStorage.getItem("token");
    const modal = document.getElementById("import-log-modal");
    const tbody = document.getElementById("import-log-body");
    if (!modal || !tbody) return;

    modal.classList.add("show");
    tbody.innerHTML = `
        <tr class="empty-row">
            <td colspan="8">
                <div class="empty-state">Loading imports...</div>
            </td>
        </tr>
    `;

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/imports?limit=25`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const imports = Array.isArray(data?.imports) ? data.imports : [];
        if (!imports.length) {
            tbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="8">
                        <div class="empty-state">No imports yet.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = imports.map(row => `
            <tr>
                <td>${escapeHtml(formatDateTimeDMY(row.imported_at))}</td>
                <td>${escapeHtml(String(row.kind || ""))}</td>
                <td>${escapeHtml(String(row.source || ""))}</td>
                <td>${escapeHtml(String(row.file_name || ""))}</td>
                <td>${escapeHtml(String(row.rows_total ?? 0))}</td>
                <td>${escapeHtml(String(row.rows_inserted ?? 0))}</td>
                <td>${escapeHtml(String(row.rows_updated ?? 0))}</td>
                <td>${escapeHtml(String(row.rows_failed ?? 0))}</td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Failed to load import log:", e);
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">Failed to load import log.</div>
                </td>
            </tr>
        `;
    }
}

async function submitBulkBook() {
    const token = localStorage.getItem("token");
    const name = document.getElementById("bulk-book-name")?.value?.trim() || "";
    const dateStr = document.getElementById("bulk-book-date")?.value || "";
    const teeVal = document.getElementById("bulk-book-tee")?.value || "all";
    const eventType = document.getElementById("bulk-book-event-type")?.value || "group";
    const accountCode = normalizeAccountCodeInput(document.getElementById("bulk-book-account-code")?.value || "");
    const matchedAccount = findAccountCustomerByCode(accountCode);
    const holes = parseInt(document.getElementById("bulk-book-holes")?.value || "18", 10);
    const startTime = document.getElementById("bulk-book-start")?.value || "";
    const endTime = document.getElementById("bulk-book-end")?.value || "";
    const slotsPerTime = parseInt(document.getElementById("bulk-book-slots")?.value || "4", 10);
    const price = Number(document.getElementById("bulk-book-price")?.value || "0");

    const statusEl = document.getElementById("bulk-book-status");
    const undoBtn = document.getElementById("bulk-book-undo");
    const runBtn = document.getElementById("bulk-book-run");

    if (!name) {
        if (statusEl) statusEl.textContent = "Event / group name is required.";
        return;
    }
    if (!dateStr) {
        if (statusEl) statusEl.textContent = "Date is required.";
        return;
    }
    if (!startTime || !endTime) {
        if (statusEl) statusEl.textContent = "Start and end times are required.";
        return;
    }

    const tees = teeVal === "all" ? ["1", "10"] : [String(teeVal)];

    try {
        if (statusEl) statusEl.textContent = "Working...";
        if (runBtn) runBtn.disabled = true;

        const data = await fetchJson(`${API_BASE}/api/admin/tee-sheet/bulk-book`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                date: dateStr,
                tees,
                start_time: startTime,
                end_time: endTime,
                holes: holes === 9 ? 9 : 18,
                slots_per_time: Number.isFinite(slotsPerTime) ? slotsPerTime : 4,
                group_name: name,
                event_type: String(eventType || "group"),
                account_code: accountCode || null,
                account_customer_id: matchedAccount?.id ? Number(matchedAccount.id) : null,
                price: Number.isFinite(price) ? price : 0
            })
        });

        const created = Number(data.created || 0) || 0;
        lastBulkBookGroupId = created > 0 ? (data.group_id || null) : null;
        if (statusEl) {
            statusEl.textContent = `Created ${created} bookings${data.group_id ? ` (group ${data.group_id})` : ""}.`;
        }
        if (undoBtn) undoBtn.disabled = !lastBulkBookGroupId;
        toastSuccess(`Created ${created} booking${created === 1 ? "" : "s"}.`);
        loadTeeTimes({ preserveScroll: true });
    } catch (err) {
        if (statusEl) statusEl.textContent = err?.message || "Bulk booking failed.";
        toastError(err?.message || "Bulk booking failed.");
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

async function undoBulkBook() {
    const token = localStorage.getItem("token");
    const statusEl = document.getElementById("bulk-book-status");
    const undoBtn = document.getElementById("bulk-book-undo");
    const runBtn = document.getElementById("bulk-book-run");

    const gid = String(lastBulkBookGroupId || "").trim();
    if (!gid) return;

    try {
        if (statusEl) statusEl.textContent = "Undoing...";
        if (undoBtn) undoBtn.disabled = true;
        if (runBtn) runBtn.disabled = true;

        const data = await fetchJson(`${API_BASE}/api/admin/tee-sheet/bulk-book/${encodeURIComponent(gid)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });

        lastBulkBookGroupId = null;
        if (statusEl) statusEl.textContent = `Deleted ${Number(data.deleted || 0)} bookings.`;
        toastInfo(`Deleted ${Number(data.deleted || 0)} bookings.`);
        loadTeeTimes({ preserveScroll: true });
    } catch (err) {
        if (statusEl) statusEl.textContent = err?.message || "Undo failed.";
        if (undoBtn) undoBtn.disabled = false;
        toastError(err?.message || "Undo failed.");
    } finally {
        if (runBtn) runBtn.disabled = false;
    }
}

function applyTeeSheetSearchFilter() {
    const searchInput = document.getElementById("tee-sheet-search");
    const statusEl = document.getElementById("tee-sheet-search-status");
    const q = (searchInput?.value || "").trim().toLowerCase();

    const rows = Array.from(document.querySelectorAll("#admin-tee-sheet-body tr[data-tee-time-iso]"));
    let matchCount = 0;

    rows.forEach(row => {
        const cards = Array.from(row.querySelectorAll(".slot-card"));
        const searchable = Array.from(row.querySelectorAll(".slot-card.booked, .slot-card.checked-in, .slot-card.no-show, .slot-card.cancelled"));

        if (!q) {
            row.style.display = "";
            cards.forEach(c => c.classList.remove("match", "dim"));
            return;
        }

        cards.forEach(c => c.classList.add("dim"));

        let rowHasMatch = false;
        searchable.forEach(card => {
            const hay = String(card.textContent || "").toLowerCase();
            const match = hay.includes(q);
            card.classList.toggle("match", match);
            card.classList.toggle("dim", !match);
            if (match) {
                rowHasMatch = true;
                matchCount += 1;
            }
        });

        row.style.display = rowHasMatch ? "" : "none";
    });

    if (statusEl) {
        if (!q) {
            statusEl.textContent = "";
        } else if (matchCount === 0) {
            statusEl.textContent = `No matches for "${searchInput?.value || ""}"`;
        } else {
            statusEl.textContent = `${matchCount} match${matchCount === 1 ? "" : "es"} for "${searchInput?.value || ""}"`;
        }
    }

    updateTeeSheetBulkSelectionSummary();
}

function filterTeeTimesByHoles(dayTeeTimes, dateStr) {
    if (String(selectedHolesView) !== "9") return dayTeeTimes;
    const plan9 = teePlanForDate(dateStr, 9);
    const cutoffStart = plan9?.windows?.[0]?.start || TEE_NINE_HOLE_START;
    const cutoffEnd = plan9?.windows?.[0]?.end || TEE_NINE_HOLE_END;
    const [cutoffHour, cutoffMinute] = cutoffStart.split(":").map(Number);
    const cutoffTotal = (cutoffHour || 0) * 60 + (cutoffMinute || 0);
    const [endHour, endMinute] = cutoffEnd.split(":").map(Number);
    const endTotal = (endHour || 0) * 60 + (endMinute || 0);

    const toMinutes = (teeTimeIso) => {
        const raw = String(teeTimeIso || "");
        const hasTz = /Z$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
        if (hasTz) {
            const dt = new Date(raw);
            if (!Number.isNaN(dt.getTime())) {
                return dt.getHours() * 60 + dt.getMinutes();
            }
        }

        const timePart = raw.includes("T") ? raw.split("T")[1] : raw;
        if (timePart) {
            const clean = timePart.replace("Z", "").split("+")[0].split("-")[0];
            const match = clean.match(/(\d{2}):(\d{2})/);
            if (match) {
                const hh = parseInt(match[1], 10);
                const mm = parseInt(match[2], 10);
                if (Number.isFinite(hh) && Number.isFinite(mm)) {
                    return hh * 60 + mm;
                }
            }
        }

        const dt = new Date(raw);
        if (!Number.isNaN(dt.getTime())) {
            return dt.getHours() * 60 + dt.getMinutes();
        }
        return null;
    };

    return dayTeeTimes.filter(tt => {
        const minutes = toMinutes(tt.tee_time);
        if (minutes === null) return false;
        return minutes >= cutoffTotal && minutes <= endTotal;
    });
}

function buildDateTime(dateStr, timeStr) {
    return new Date(`${dateStr}T${timeStr}:00`);
}

async function createTeeTimeAt(dateStr, timeStr, tee) {
    const token = localStorage.getItem("token");
    const teeDateTime = buildDateTime(dateStr, timeStr);
    if (Number.isNaN(teeDateTime.getTime())) return false;
    const localIso = `${dateStr}T${timeStr}:00`;
    const response = await fetch("/tsheet/create", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tee_time: localIso, hole: String(tee) })
    });
    return response.ok;
}

function teeKey(dateStr, tee, dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, "0");
    const mm = String(dateObj.getMinutes()).padStart(2, "0");
    return `${dateStr}|${tee}|${hh}:${mm}`;
}

function normalizeTeeLabel(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const compact = raw.toLowerCase().replace(/[^0-9a-z]+/g, "");
    if (compact.startsWith("10")) return "10";
    if (compact.startsWith("1")) return "1";
    const match = compact.match(/^(\d+)/);
    return match ? String(parseInt(match[1], 10)) : raw;
}

async function generateDaySheet(dateStr, existingKeys, tees = ["1", "10"]) {
    return generateTeeSheetFromPlan(dateStr, 18, tees);
}

async function generateDaySheetWindow(dateStr, existingKeys, tees, startTime, endTime) {
    return generateTeeSheetFromPlan(dateStr, 9, tees, startTime, endTime);
}

async function generateTeeSheetFromPlan(dateStr, holesMode = 18, tees = null, overrideStart = null, overrideEnd = null) {
    const normalizedHoles = Number(holesMode) === 9 ? 9 : 18;
    const plan = teePlanForDate(dateStr, normalizedHoles);
    const defaultTees = Array.isArray(plan.tees) && plan.tees.length ? plan.tees : ["1", "10"];
    const requestedTees = Array.isArray(tees) && tees.length ? tees.map((v) => String(v)) : defaultTees;
    const allowedRequested = requestedTees.filter((tee) => defaultTees.includes(tee));
    const targetTees = allowedRequested.length ? allowedRequested : defaultTees;
    const windows = (overrideStart && overrideEnd)
        ? [{ start: String(overrideStart), end: String(overrideEnd) }]
        : (Array.isArray(plan.windows) ? plan.windows : []);

    let createdTotal = 0;
    for (const window of windows) {
        const startTime = normalizeClockValue(window?.start, "");
        const endTime = normalizeClockValue(window?.end, "");
        if (!startTime || !endTime || startTime > endTime) continue;
        const created = await generateTeeSheetRange(dateStr, targetTees, startTime, endTime, Number(plan.interval_min || TEE_DEFAULT_INTERVAL_MIN));
        createdTotal += Number(created || 0);
    }
    return createdTotal;
}

async function generateTeeSheetRange(dateStr, tees, startTime, endTime, intervalMin = TEE_DEFAULT_INTERVAL_MIN) {
    const token = localStorage.getItem("token");
    const response = await fetch("/tsheet/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            date: dateStr,
            tees: Array.isArray(tees) ? tees : ["1", "10"],
            start_time: startTime,
            end_time: endTime,
            interval_min: Number(intervalMin || TEE_DEFAULT_INTERVAL_MIN) || 8,
            capacity: 4,
            status: "open"
        })
    });

    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }
    if (!response.ok) {
        throw new Error((data && data.detail) ? data.detail : (raw || "Unable to generate tee times"));
    }
    return Number(data?.created || 0);
}

function renderTeeSheetRows(dayTeeTimes, dateStr, emptyMessage) {
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!tbody) return;
    teeSheetTeeTimeMap = new Map();

    if (dayTeeTimes.length === 0) {
        clearTeeSheetBulkSelection();
        const message = emptyMessage || "No tee times available for this day.";
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">${message}</div>
                </td>
            </tr>
        `;
        return;
    }

    const groupByTime = String(selectedTee) === "all";
    let prevTimeKey = null;
    const allowDetails = currentUserRole === "admin" || currentUserRole === "club_staff" || currentUserRole === "super_admin";
    const allowBulkActions = canUseTeeSheetBulkActions();

    const html = [];
    for (const tt of dayTeeTimes) {
        const dt = new Date(tt.tee_time);
        const timeKey = dt.toISOString().slice(0, 16); // UTC minute precision for stable grouping
        const timeLabel = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const teeLabel = normalizeTeeLabel(tt.hole || "1") || "1";
        const syntheticSlot = Number(tt?.id || 0) <= 0;
        const allBookings = Array.isArray(tt.bookings) ? [...tt.bookings] : [];
        const bookings = allBookings.slice(0, 4);
        const capacity = tt.capacity || 4;
        const bookedCount = Math.min(allBookings.length, capacity);
        const closed = isTeeTimeClosed(dateStr, tt.tee_time, tt.status);
        const blockedByGolfDay = String(tt.status || "").toLowerCase() === "blocked";
        teeSheetTeeTimeMap.set(String(tt.id), {
            ...tt,
            hole: teeLabel,
            capacity,
            bookings: allBookings,
        });

        const repeatedTime = groupByTime && prevTimeKey === timeKey;
        const timeCell = repeatedTime ? "" : escapeHtml(timeLabel);
        const rowClass = repeatedTime ? "tee-row-sub" : "";
        prevTimeKey = timeKey;

        const manageSlotHtml = `
            <button
                type="button"
                class="tee-row-manage-btn"
                onclick="openTeeSlotManageModal(${Number(tt.id)})"
                title="Manage this booking slot"
                ${(allowBulkActions && bookedCount > 0 && !syntheticSlot) ? "" : "style=\"display:none;\""}
            >
                Manage Slot
                <span>${formatInteger(bookedCount)} player${bookedCount === 1 ? "" : "s"}</span>
            </button>
            <span class="tee-row-manage-muted" ${(allowBulkActions && bookedCount > 0 && !syntheticSlot) ? "style=\"display:none;\"" : ""}>${syntheticSlot ? "Preview" : (blockedByGolfDay ? "Booked Out" : (bookedCount > 0 ? `${formatInteger(bookedCount)} booked` : "Open"))}</span>
        `;

        const cells = [];
        for (let i = 0; i < 4; i++) {
            if (i >= capacity) {
                cells.push(`
                    <td>
                        <div class="slot-card closed">
                            <div class="slot-top"><span class="slot-status">Closed</span></div>
                            <div class="slot-name">Not available</div>
                        </div>
                    </td>
                `);
                continue;
            }

            const booking = bookings[i];
            if (booking) {
                const bookingId = Number.parseInt(String(booking?.id || ""), 10);
                const safeBookingId = Number.isFinite(bookingId) ? bookingId : 0;
                const status = booking.status || "booked";
                const statusClass =
                    status === "checked_in" ? "checked-in" :
                    status === "no_show" ? "no-show" :
                    status === "cancelled" ? "cancelled" :
                    status === "completed" ? "completed" :
                    "booked";
                const statusLabel = statusToLabel(status);
                const search = `${booking.player_name || ""} ${booking.player_email || ""}`.trim();
                const isSelected = teeSheetBulkSelectedBookingIds.has(String(booking.id));
                const bulkToggle = allowBulkActions ? `
                    <label style="display:inline-flex; align-items:center; gap:4px; font-size:11px;" onclick="event.stopPropagation();" title="Select for bulk action">
                        <input
                            type="checkbox"
                            data-tee-bulk-booking-id="${safeBookingId}"
                            ${isSelected ? "checked" : ""}
                            onchange="toggleTeeSheetBulkBooking(${safeBookingId}, this.checked)"
                        >
                        <span>Bulk</span>
                    </label>
                ` : "";
                cells.push(`
                    <td>
                        <div class="slot-card ${statusClass}"
                             data-search="${escapeHtml(search)}"
                             data-booking-id="${escapeHtml(String(booking.id))}"
                             data-tee-time-id="${escapeHtml(String(tt.id))}"
                             draggable="true"
                             ${allowDetails ? `onclick="openBookingDetails(${tt.id}, ${booking.id})"` : ""}>
                            <div class="slot-top">
                                <span class="slot-status">${escapeHtml(statusLabel)}</span>
                                <span class="slot-price">${formatCompactBookingPrice(booking)}</span>
                                ${bulkToggle}
                            </div>
                            <div class="slot-name">${escapeHtml(booking.player_name)}</div>
                            <div class="slot-meta">${booking.player_email ? escapeHtml(booking.player_email) : ""}</div>
                        </div>
                    </td>
                `);
            } else {
                const slotNumber = i + 1;
                const toAdd = Math.max(1, slotNumber - bookedCount);
                if (closed) {
                    cells.push(`
                        <td>
                            <div class="slot-card closed">
                                <div class="slot-name">${blockedByGolfDay ? "Booked Out" : "Closed"}</div>
                                <div class="slot-meta">${blockedByGolfDay ? "Golf day" : "Past time"}</div>
                            </div>
                        </td>
                    `);
                } else if (syntheticSlot) {
                    cells.push(`
                        <td>
                            <div class="slot-card open" title="View-only tee-sheet preview for this date">
                                <div class="slot-name">Open Slot</div>
                                <div class="slot-action">Schedule Preview</div>
                            </div>
                        </td>
                    `);
                } else {
                    cells.push(`
                        <td>
                            <div class="slot-card open"
                                 data-tee-time-id="${escapeHtml(String(tt.id))}"
                                 onclick="openBookingFormAdmin(${tt.id}, '${tt.tee_time}', '${teeLabel}', ${capacity}, ${bookings.length}, ${slotNumber})">
                                <div class="slot-name">Open Slot</div>
                                <div class="slot-action">Book ${toAdd} player${toAdd === 1 ? "" : "s"}</div>
                            </div>
                        </td>
                    `);
                }
            }
        }

        html.push(`
            <tr class="${rowClass}" data-tee-time-iso="${tt.tee_time}">
                <td class="time-col">${timeCell}</td>
                <td class="tee-col">
                    <div class="tee-cell-stack">
                        <span class="tee-cell-tee">${escapeHtml(teeLabel)}</span>
                        ${manageSlotHtml}
                    </div>
                </td>
                ${cells.join("")}
            </tr>
        `);
    }

    tbody.innerHTML = html.join("");
    updateTeeSheetBulkSelectionSummary();
}

let teeDragBookingId = null;
let teeDragFromTeeTimeId = null;
let teeDragInit = false;
let teeSuppressClicksUntil = 0;

function _teeSlotNumberFromTd(td) {
    if (!(td instanceof HTMLTableCellElement)) return null;
    const idx = Number(td.cellIndex);
    if (!Number.isFinite(idx)) return null;
    // Row structure: [time, tee, slot1, slot2, slot3, slot4]
    const slot = idx - 1; // because cellIndex is 0-based; slot starts at 2 => slotNumber 1
    if (slot < 1 || slot > 4) return null;
    return slot;
}

function _inferCapacityFromRow(row) {
    if (!(row instanceof HTMLTableRowElement)) return 4;
    try {
        const cells = Array.from(row.cells).slice(2, 6);
        if (!cells.length) return 4;
        let notAvailable = 0;
        for (const td of cells) {
            const name = td.querySelector(".slot-card .slot-name")?.textContent?.trim();
            if (name === "Not available") notAvailable += 1;
        }
        const cap = 4 - notAvailable;
        return cap >= 1 && cap <= 4 ? cap : 4;
    } catch {
        return 4;
    }
}

function _updateOpenSlotsForRow(row) {
    if (!(row instanceof HTMLTableRowElement)) return;
    const dateStr = lastTeeSheetDateStr;
    const teeTimeIso = row.getAttribute("data-tee-time-iso") || "";
    const teeLabel = row.querySelector(".tee-col")?.textContent?.trim() || "1";
    const capacity = _inferCapacityFromRow(row);

    const bookedCount = row.querySelectorAll('.slot-card[data-booking-id]').length;
    const isClosed = dateStr ? isTeeTimeClosed(dateStr, teeTimeIso, tt?.status) : false;
    const manageBtn = row.querySelector(".tee-row-manage-btn");
    const manageMeta = manageBtn?.querySelector("span");
    const manageMuted = row.querySelector(".tee-row-manage-muted");
    if (manageBtn instanceof HTMLElement) {
        manageBtn.style.display = bookedCount > 0 ? "" : "none";
        if (manageMeta instanceof HTMLElement) {
            manageMeta.textContent = `${formatInteger(bookedCount)} player${bookedCount === 1 ? "" : "s"}`;
        }
    }
    if (manageMuted instanceof HTMLElement) {
        manageMuted.style.display = bookedCount > 0 ? "none" : "";
    }

    const cells = Array.from(row.cells).slice(2, 6);
    for (let i = 0; i < cells.length; i++) {
        const td = cells[i];
        const slotNumber = i + 1;
        if (slotNumber > capacity) continue;

        const open = td.querySelector(".slot-card.open[data-tee-time-id]");
        if (!open) continue;
        if (isClosed) continue;

        const toAdd = Math.max(1, slotNumber - bookedCount);
        const action = open.querySelector(".slot-action");
        if (action) action.textContent = `Book ${toAdd} player${toAdd === 1 ? "" : "s"}`;

        const teeTimeId = open.getAttribute("data-tee-time-id");
        if (!teeTimeId) continue;
        open.onclick = () => openBookingFormAdmin(
            Number(teeTimeId),
            teeTimeIso,
            teeLabel,
            capacity,
            bookedCount,
            slotNumber
        );
    }
}

function _buildSlotPlaceholderForRow(row, teeTimeId, slotNumber) {
    const dateStr = lastTeeSheetDateStr;
    const teeTimeIso = row?.getAttribute?.("data-tee-time-iso") || "";
    const closed = dateStr ? isTeeTimeClosed(dateStr, teeTimeIso, tt?.status) : false;

    const el = document.createElement("div");
    if (closed) {
        el.className = "slot-card closed";
        el.innerHTML = `
            <div class="slot-name">Closed</div>
            <div class="slot-meta">Past time</div>
        `;
        return el;
    }

    el.className = "slot-card open";
    el.setAttribute("data-tee-time-id", String(teeTimeId));
    el.innerHTML = `
        <div class="slot-name">Open Slot</div>
        <div class="slot-action">Book player</div>
    `;
    return el;
}

function syncTeeSheetMapAfterMove(bookingId, fromTeeTimeId, toTeeTimeId) {
    const fromKey = String(fromTeeTimeId || "");
    const toKey = String(toTeeTimeId || "");
    if (!fromKey || !toKey || fromKey === toKey) return;

    const fromSlot = teeSheetTeeTimeMap.get(fromKey);
    const toSlot = teeSheetTeeTimeMap.get(toKey);
    if (!fromSlot || !toSlot) return;

    const fromBookings = Array.isArray(fromSlot.bookings) ? [...fromSlot.bookings] : [];
    const moveId = Number.parseInt(String(bookingId || ""), 10);
    if (!Number.isFinite(moveId) || moveId <= 0) return;

    const index = fromBookings.findIndex((booking) => Number.parseInt(String(booking?.id || ""), 10) === moveId);
    if (index < 0) return;

    const [movedBooking] = fromBookings.splice(index, 1);
    const toBookings = Array.isArray(toSlot.bookings) ? [...toSlot.bookings] : [];
    if (movedBooking) {
        movedBooking.tee_time_id = Number.parseInt(toKey, 10) || movedBooking.tee_time_id;
        toBookings.push(movedBooking);
    }

    teeSheetTeeTimeMap.set(fromKey, { ...fromSlot, bookings: fromBookings });
    teeSheetTeeTimeMap.set(toKey, { ...toSlot, bookings: toBookings });
}

function setupTeeSheetDragDrop() {
    if (teeDragInit) return;
    teeDragInit = true;

    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!tbody) return;

    const wrap = document.querySelector(".tee-sheet-table-wrap");
    let dragScrollRaf = null;

    const autoScrollWrap = (clientY) => {
        if (!(wrap instanceof HTMLElement)) return;
        const rect = wrap.getBoundingClientRect();
        const edge = 56;
        const speed = 18;
        const distTop = clientY - rect.top;
        const distBottom = rect.bottom - clientY;
        let delta = 0;
        if (distTop >= 0 && distTop < edge) delta = -speed;
        else if (distBottom >= 0 && distBottom < edge) delta = speed;
        if (!delta) return;
        if (dragScrollRaf) cancelAnimationFrame(dragScrollRaf);
        dragScrollRaf = requestAnimationFrame(() => {
            wrap.scrollTop = Math.max(0, wrap.scrollTop + delta);
        });
    };

    tbody.addEventListener("dragstart", (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const card = target.closest(".slot-card[data-booking-id]");
        if (!card) return;

        const bookingId = card.getAttribute("data-booking-id");
        const fromTeeTimeId = card.getAttribute("data-tee-time-id");
        if (!bookingId || !fromTeeTimeId) return;

        teeDragBookingId = bookingId;
        teeDragFromTeeTimeId = fromTeeTimeId;

        try {
            e.dataTransfer?.setData("text/plain", `booking:${bookingId}`);
            e.dataTransfer.effectAllowed = "move";
        } catch {}

        card.classList.add("dragging");
        document.body.classList.add("drag-active");
    });

    tbody.addEventListener("dragend", (e) => {
        const target = e.target;
        if (target instanceof HTMLElement) {
            target.closest(".slot-card")?.classList.remove("dragging");
        }
        document.querySelectorAll(".slot-card.drop-hover").forEach(el => el.classList.remove("drop-hover"));
        document.body.classList.remove("drag-active");
        teeDragBookingId = null;
        teeDragFromTeeTimeId = null;
    });

    tbody.addEventListener("dragover", (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const drop = target.closest(".slot-card.open[data-tee-time-id]");
        if (!drop) {
            autoScrollWrap(e.clientY);
            return;
        }

        e.preventDefault();
        autoScrollWrap(e.clientY);
        document.querySelectorAll(".slot-card.drop-hover").forEach(el => el.classList.remove("drop-hover"));
        drop.classList.add("drop-hover");
    });

    tbody.addEventListener("dragleave", (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const drop = target.closest(".slot-card.open[data-tee-time-id]");
        if (!drop) return;
        drop.classList.remove("drop-hover");
    });

    tbody.addEventListener("drop", async (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const drop = target.closest(".slot-card.open[data-tee-time-id]");
        if (!drop) return;

        e.preventDefault();
        e.stopPropagation();

        drop.classList.remove("drop-hover");

        const toTeeTimeId = drop.getAttribute("data-tee-time-id");
        if (!toTeeTimeId) return;

        let bookingId = teeDragBookingId;
        try {
            const payload = e.dataTransfer?.getData("text/plain") || "";
            if (payload.startsWith("booking:")) bookingId = payload.slice("booking:".length);
        } catch {}

        if (!bookingId) return;
        if (teeDragFromTeeTimeId && String(teeDragFromTeeTimeId) === String(toTeeTimeId)) return;

        // Prevent the drop from also triggering the open-slot click (set early, before awaits).
        teeSuppressClicksUntil = Date.now() + 900;

        let revert = null;
        try {
            // Optimistic UI: update the DOM immediately (no full tee sheet refresh).
            const fromCard = tbody.querySelector(`.slot-card[data-booking-id="${CSS.escape(String(bookingId))}"]`);
            const fromTd = fromCard?.closest?.("td");
            const fromRow = fromCard?.closest?.("tr");
            const toRow = drop.closest("tr");

            // Prefer the first open slot in the destination row to keep slots compact,
            // regardless of which open cell the user hovered.
            const preferredDrop = toRow?.querySelector?.(`.slot-card.open[data-tee-time-id="${CSS.escape(String(toTeeTimeId))}"]`) || drop;
            const toTd = preferredDrop?.closest?.("td");

            if (fromCard instanceof HTMLElement && fromTd instanceof HTMLTableCellElement && fromRow instanceof HTMLTableRowElement
                && toRow instanceof HTMLTableRowElement && toTd instanceof HTMLTableCellElement) {
                const fromBackup = fromTd.innerHTML;
                const toBackup = toTd.innerHTML;

                const moved = fromCard.cloneNode(true);
                if (moved instanceof HTMLElement) {
                    moved.classList.remove("dragging");
                    moved.classList.add("just-moved");
                    moved.setAttribute("data-tee-time-id", String(toTeeTimeId));
                }

                const slotNumber = _teeSlotNumberFromTd(fromTd) || 1;
                const fromTeeTimeId = fromCard.getAttribute("data-tee-time-id") || teeDragFromTeeTimeId || "";
                const placeholder = _buildSlotPlaceholderForRow(fromRow, fromTeeTimeId, slotNumber);

                fromTd.replaceChildren(placeholder);
                toTd.replaceChildren(moved);

                _updateOpenSlotsForRow(fromRow);
                _updateOpenSlotsForRow(toRow);

                setTimeout(() => {
                    try {
                        const el = toTd.querySelector(".slot-card.just-moved");
                        el?.classList.remove("just-moved");
                    } catch {}
                }, 320);

                revert = () => {
                    fromTd.innerHTML = fromBackup;
                    toTd.innerHTML = toBackup;
                    _updateOpenSlotsForRow(fromRow);
                    _updateOpenSlotsForRow(toRow);
                };
            }

            await moveBookingToTeeTime(bookingId, toTeeTimeId);
            syncTeeSheetMapAfterMove(bookingId, teeDragFromTeeTimeId, toTeeTimeId);
            toastSuccess("Booking moved");
            if (currentActivePage === "bookings") loadBookings();
            if (currentActivePage === "dashboard") loadDashboard();
        } catch (err) {
            try { if (typeof revert === "function") revert(); } catch {}
            toastError(err?.message || "Move failed");
        }
    });

    // Prevent the drop from also triggering the open-slot click.
    tbody.addEventListener("click", (e) => {
        if (Date.now() < teeSuppressClicksUntil) {
            const target = e.target;
            if (target instanceof HTMLElement && target.closest(".slot-card")) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);
}

async function moveBookingToTeeTime(bookingId, toTeeTimeId) {
    const token = localStorage.getItem("token");
    const res = await fetch(`/tsheet/bookings/${encodeURIComponent(String(bookingId))}/move`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ to_tee_time_id: Number(toTeeTimeId) })
    });

    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!res.ok) {
        const msg = data?.detail || raw || "Move failed";
        throw new Error(msg);
    }
    return data;
}

let lastTeeSheetDateStr = null;

function captureWrapAnchor(wrap) {
    if (!(wrap instanceof HTMLElement)) return null;
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!(tbody instanceof HTMLElement)) return { scrollTop: wrap.scrollTop };

    const rows = Array.from(tbody.querySelectorAll("tr[data-tee-time-iso]"));
    if (!rows.length) return { scrollTop: wrap.scrollTop };

    const wrapRect = wrap.getBoundingClientRect();
    for (const row of rows) {
        const rect = row.getBoundingClientRect();
        // First row whose top is at/after the wrap top (with small tolerance)
        if (rect.bottom >= wrapRect.top + 8) {
            const iso = row.getAttribute("data-tee-time-iso");
            return {
                scrollTop: wrap.scrollTop,
                anchorIso: iso,
                anchorOffsetPx: rect.top - wrapRect.top
            };
        }
    }
    return { scrollTop: wrap.scrollTop };
}

function restoreWrapAnchor(wrap, anchor) {
    if (!(wrap instanceof HTMLElement) || !anchor) return;
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!(tbody instanceof HTMLElement)) {
        if (Number.isFinite(anchor.scrollTop)) wrap.scrollTop = anchor.scrollTop;
        return;
    }

    if (anchor.anchorIso) {
        const row = tbody.querySelector(`tr[data-tee-time-iso="${CSS.escape(String(anchor.anchorIso))}"]`);
        if (row instanceof HTMLElement) {
            const wrapRect = wrap.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            const delta = rowRect.top - wrapRect.top - (Number(anchor.anchorOffsetPx) || 0);
            wrap.scrollTop = Math.max(0, wrap.scrollTop + delta);
            return;
        }
    }

    if (Number.isFinite(anchor.scrollTop)) {
        wrap.scrollTop = anchor.scrollTop;
    }
}

function updateTeeSheetSummary(teeTimes = [], dateStr = "") {
    const slotsEl = document.getElementById("tee-summary-slots");
    const openSeatsEl = document.getElementById("tee-summary-open-seats");
    const bookedEl = document.getElementById("tee-summary-booked");
    const checkedInEl = document.getElementById("tee-summary-checked-in");
    const noShowEl = document.getElementById("tee-summary-no-show");
    const nextEl = document.getElementById("tee-summary-next");

    const rows = Array.isArray(teeTimes) ? teeTimes : [];
    let totalSlots = 0;
    let bookedPlayers = 0;
    let checkedIn = 0;
    let noShow = 0;
    let nextTee = null;
    const now = new Date();

    rows.forEach(tt => {
        const capacity = Math.max(0, Number(tt?.capacity || 4));
        const bookings = Array.isArray(tt?.bookings) ? tt.bookings : [];
        totalSlots += capacity;
        bookedPlayers += bookings.length;

        bookings.forEach(booking => {
            const status = String(booking?.status || "").toLowerCase();
            if (status === "checked_in") checkedIn += 1;
            if (status === "no_show") noShow += 1;
        });

        const teeDate = new Date(tt?.tee_time);
        if (!Number.isNaN(teeDate.getTime()) && teeDate >= now) {
            if (!nextTee || teeDate < nextTee) nextTee = teeDate;
        }
    });

    const openSeats = Math.max(0, totalSlots - bookedPlayers);
    const todayStr = localTodayYMD();
    const nextLabel = nextTee
        ? nextTee.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : (dateStr && dateStr < todayStr ? "Past day" : "No upcoming");

    if (slotsEl) slotsEl.textContent = formatInteger(totalSlots);
    if (openSeatsEl) openSeatsEl.textContent = formatInteger(openSeats);
    if (bookedEl) bookedEl.textContent = formatInteger(bookedPlayers);
    if (checkedInEl) checkedInEl.textContent = formatInteger(checkedIn);
    if (noShowEl) noShowEl.textContent = formatInteger(noShow);
    if (nextEl) nextEl.textContent = nextLabel;
}

async function loadTeeTimes(options = {}) {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("tee-sheet-date");
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!dateInput || !tbody) return;

    const dateStr = currentTeeSheetDate();
    applyTeePlanGlobals(dateStr);
    const dayPlan18 = teePlanForDate(dateStr, 18);
    const dayPlan9 = teePlanForDate(dateStr, 9);
    const preserveScroll = Boolean(options.preserveScroll);
    const wrap = document.querySelector(".tee-sheet-table-wrap");
    const anchor = preserveScroll ? captureWrapAnchor(wrap) : null;
    const requestKey = JSON.stringify({
        date: dateStr,
        tee: selectedTee,
        holes: selectedHolesView,
        preserveScroll,
    });
    const selectionScopeKey = currentTeeSheetSelectionScopeKey();
    if (teeSheetBulkSelectionScopeKey !== selectionScopeKey) {
        clearTeeSheetBulkSelection();
        teeSheetBulkSelectionScopeKey = selectionScopeKey;
    }
    if (teeSheetLoadPromise && teeSheetLoadRequestKey === requestKey) {
        return teeSheetLoadPromise;
    }
    if (teeSheetLoadController) {
        teeSheetLoadController.abort();
    }
    const controller = new AbortController();
    teeSheetLoadController = controller;
    teeSheetLoadRequestKey = requestKey;
    teeWeatherRiskMap = new Map();

    tbody.innerHTML = `
        <tr class="empty-row">
            <td colspan="6">
                <div class="empty-state">Loading tee sheet...</div>
            </td>
        </tr>
    `;

    const dateChanged = lastTeeSheetDateStr !== dateStr;
    lastTeeSheetDateStr = dateStr;
    if (wrap && dateChanged && !preserveScroll) {
        // Avoid "starting mid-day" when switching dates after scrolling today's sheet.
        wrap.scrollTop = 0;
    }

    const requestPromise = (async () => {
    try {
        const start = `${dateStr}T00:00:00`;
        const [y, m, d] = dateStr.split("-").map(Number);
        const nextDay = new Date(y, (m || 1) - 1, (d || 1) + 1);
        const endDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
        const end = `${endDateStr}T00:00:00`;
        const response = await fetch(`/tsheet/staff-range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            timeoutMs: 30000,
        });

        const raw = await response.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            data = null;
        }
        if (!response.ok) {
            throw new Error((data && data.detail) ? data.detail : (raw || "Unable to load tee sheet"));
        }
        const dayAll = (Array.isArray(data) ? data : [])
            .map((tt) => ({ ...tt, hole: normalizeTeeLabel(tt?.hole || "1") || "1" }))
            .sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time));

        const existingKeys = new Set();
        dayAll.forEach(tt => {
            const tee = normalizeTeeLabel(tt.hole || "1") || "1";
            existingKeys.add(teeKey(dateStr, tee, new Date(tt.tee_time)));
        });

        const scheduleTees = (Array.isArray(dayPlan18?.tees) && dayPlan18.tees.length)
            ? dayPlan18.tees.map((tee) => normalizeTeeLabel(tee)).filter(Boolean)
            : ["1", "10"];
        const holesPresent = Array.from(new Set(dayAll.map((tt) => normalizeTeeLabel(tt?.hole || "1")).filter(Boolean)));
        const teeListForView = String(selectedTee) === "all"
            ? (holesPresent.length ? holesPresent : scheduleTees)
            : [normalizeTeeLabel(selectedTee || "1") || "1"];
        const dayTeeRaw = dayAll.filter(tt => teeListForView.includes(normalizeTeeLabel(tt.hole || "1")));

        // Group duplicates by tee_time (minute precision) + tee
        const grouped = new Map();
        dayTeeRaw.forEach(tt => {
            const d = new Date(tt.tee_time);
            const timeKey = d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
            const teeKeyVal = normalizeTeeLabel(tt.hole || "1") || "1";
            const key = `${timeKey}|${teeKeyVal}`;
            const existing = grouped.get(key);
            if (!existing) {
                grouped.set(key, {
                    ...tt,
                    hole: teeKeyVal,
                    bookings: Array.isArray(tt.bookings) ? [...tt.bookings] : []
                });
            } else {
                const extra = Array.isArray(tt.bookings) ? tt.bookings : [];
                existing.bookings = existing.bookings.concat(extra);
            }
        });

        const dayTeeTimes = Array.from(grouped.values()).sort((a, b) => {
            const d = new Date(a.tee_time) - new Date(b.tee_time);
            if (d !== 0) return d;
            const ta = parseInt(String(a.hole || "1"), 10) || 0;
            const tb = parseInt(String(b.hole || "1"), 10) || 0;
            return ta - tb; // Tee 1 above Tee 10 when times match
        });
        const filteredTeeTimes = filterTeeTimesByHoles(dayTeeTimes, dateStr);
        const isNineView = String(selectedHolesView) === "9";

        if (dayAll.length === 0) {
            if (isNineView) {
                const created = await generateDaySheetWindow(dateStr, existingKeys, dayPlan9.tees || teeListForView);
                if (created && created > 0) {
                    lastNineAutoGenKey = `${dateStr}|all|9`;
                    return loadTeeTimes(options);
                }
                renderTeeSheetRows([], dateStr, `No 9-hole tee times scheduled (${TEE_NINE_HOLE_START}-${TEE_NINE_HOLE_END}).`);
                updateTeeSheetSummary([], dateStr);
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                autoFlagTeeSheetWeather(dateStr, { silent: true });
                return;
            }
            const created = await generateDaySheet(dateStr, existingKeys, dayPlan18.tees || ["1", "10"]);
            if (created && created > 0) {
                return loadTeeTimes(options);
            }
            renderTeeSheetRows([], dateStr, "No tee times scheduled for this date.");
            updateTeeSheetSummary([], dateStr);
            autoFlagTeeSheetWeather(dateStr, { silent: true });
            return;
        }

        if (dayTeeTimes.length === 0) {
            if (isNineView) {
                const nineKey = `${dateStr}|${String(selectedTee)}|9`;
                if (lastNineAutoGenKey !== nineKey) {
                    const created = await generateDaySheetWindow(dateStr, existingKeys, teeListForView);
                    if (created && created > 0) {
                        lastNineAutoGenKey = nineKey;
                        return loadTeeTimes(options);
                    }
                }
                renderTeeSheetRows([], dateStr, `No 9-hole tee times scheduled (${TEE_NINE_HOLE_START}-${TEE_NINE_HOLE_END}).`);
                updateTeeSheetSummary([], dateStr);
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                autoFlagTeeSheetWeather(dateStr, { silent: true });
                return;
            }
            const created = await generateDaySheet(dateStr, existingKeys, teeListForView);
            if (created && created > 0) {
                return loadTeeTimes(options);
            }
            renderTeeSheetRows([], dateStr, "No tee times for this tee on the selected date.");
            updateTeeSheetSummary([], dateStr);
            applyTeeSheetSearchFilter();
            autoFlagTeeSheetWeather(dateStr, { silent: true });
            return;
        }

        if (filteredTeeTimes.length === 0 && isNineView) {
            const nineKey = `${dateStr}|${String(selectedTee)}|9`;
            if (lastNineAutoGenKey !== nineKey) {
                const created = await generateDaySheetWindow(dateStr, existingKeys, teeListForView);
                if (created && created > 0) {
                    lastNineAutoGenKey = nineKey;
                    return loadTeeTimes(options);
                }
            }
            renderTeeSheetRows([], dateStr, `No 9-hole tee times scheduled (${TEE_NINE_HOLE_START}-${TEE_NINE_HOLE_END}).`);
            updateTeeSheetSummary([], dateStr);
        } else {
            renderTeeSheetRows(filteredTeeTimes, dateStr);
            updateTeeSheetSummary(filteredTeeTimes, dateStr);
        }
        const todayStr = localTodayYMD();
        const shouldAutoScrollNow = !preserveScroll && dateStr === todayStr;
        if (shouldAutoScrollNow) {
            scrollTeeSheetToNow(dateStr);
        } else if (wrap && preserveScroll) {
            restoreWrapAnchor(wrap, anchor);
        }
        applyTeeSheetSearchFilter();
        autoFlagTeeSheetWeather(dateStr, { silent: true });
    } catch (error) {
        if (isAbortLikeError(error)) {
            return;
        }
        console.error("Failed to load tee sheet:", error);
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">Unable to load tee sheet.</div>
                </td>
            </tr>
        `;
        updateTeeSheetSummary([], dateStr);
        setTeeWeatherStatus("");
        updateTeeSheetBulkSelectionSummary();
    } finally {
        if (teeSheetLoadController === controller) {
            teeSheetLoadController = null;
        }
        if (teeSheetLoadPromise === requestPromise) {
            teeSheetLoadPromise = null;
        }
        if (teeSheetLoadRequestKey === requestKey && teeSheetLoadController == null) {
            teeSheetLoadRequestKey = "";
        }
    }
    })();
    teeSheetLoadPromise = requestPromise;
    return requestPromise;
}

function openBookingFormAdmin(teeTimeId, teeTimeIso, teeLabel, capacity, existingCount, slotNumber) {
    openTeeBookingModal(teeTimeId, teeTimeIso, teeLabel, capacity, existingCount, slotNumber);
}

function openBookingDetails(teeTimeId, bookingId) {
    viewBookingDetail(bookingId);
}

function getSelectedPaymentMethod() {
    const el = document.getElementById("booking-payment-method");
    const allowed = new Set(["CARD", "CASH", "EFT", "ONLINE", "ACCOUNT"]);
    const raw = String(el?.value || "").trim().toUpperCase();
    if (allowed.has(raw)) return raw;
    const saved = String(localStorage.getItem("last_payment_method") || "CARD").trim().toUpperCase();
    return allowed.has(saved) ? saved : "CARD";
}

async function adminCheckIn(bookingId) {
    const token = localStorage.getItem("token");
    try {
        const paymentMethod = getSelectedPaymentMethod();
        localStorage.setItem("last_payment_method", paymentMethod);

        const res = await fetch(`${API_BASE}/checkin/${bookingId}?payment_method=${encodeURIComponent(paymentMethod)}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await res.text();
            toastError(msg || "Check-in failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes({ preserveScroll: true });
        loadBookings();
        refreshDashboardIfVisible({ silent: true, useCache: false });
        toastSuccess("Checked in");
    } catch (e) {
        toastError("Check-in failed");
    }
}

async function adminSetStatus(bookingId, status) {
    const token = localStorage.getItem("token");
    try {
        const body = { status };
        if (status === "completed") {
            const paymentMethod = getSelectedPaymentMethod();
            localStorage.setItem("last_payment_method", paymentMethod);
            body.payment_method = paymentMethod;
        }
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            toastError("Status update failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes({ preserveScroll: true });
        loadBookings();
        refreshDashboardIfVisible({ silent: true, useCache: false });
        toastSuccess(`Status: ${statusToLabel(status)}`);
    } catch (e) {
        toastError("Status update failed");
    }
}

async function saveBookingPaymentMethod(bookingId) {
    const token = localStorage.getItem("token");
    const paymentMethod = getSelectedPaymentMethod();
    localStorage.setItem("last_payment_method", paymentMethod);

    try {
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/payment-method`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ payment_method: paymentMethod })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            alert(err?.detail || "Failed to save payment method");
            return;
        }
        alert("Payment method saved");
        viewBookingDetail(bookingId);
    } catch (e) {
        alert("Failed to save payment method");
    }
}

async function saveBookingAccountCode(bookingId) {
    const token = localStorage.getItem("token");
    const accountCode = normalizeAccountCodeInput(document.getElementById("booking-account-code")?.value || "");
    const matched = findAccountCustomerByCode(accountCode);
    try {
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/account-code`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                account_code: accountCode || null,
                account_customer_id: matched?.id ? Number(matched.id) : null,
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            alert(err?.detail || "Failed to save account code");
            return;
        }
        toastSuccess("Debtor account saved");
        viewBookingDetail(bookingId);
    } catch (e) {
        alert("Failed to save account code");
    }
}

async function adminDeleteBooking(bookingId) {
    if (!confirm("Remove this booking? This cannot be undone.")) return;
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            toastError("Delete failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes({ preserveScroll: true });
        loadBookings();
        refreshDashboardIfVisible({ silent: true, useCache: false });
        toastInfo("Booking removed");
    } catch (e) {
        toastError("Delete failed");
    }
}

async function loadGolfFees() {
    if (golfFeesCache.length) return golfFeesCache;
    const token = localStorage.getItem("token");
    try {
        const all = await fetchJson(`${API_BASE}/api/admin/fee-categories`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const list = Array.isArray(all) ? all : [];
        golfFeesCache = list.filter(f => String(f.fee_type || "").toLowerCase() === "golf");
    } catch {
        golfFeesCache = [];
    }
    return golfFeesCache;
}

async function suggestAdminFee(feeType, payload) {
    const token = localStorage.getItem("token");
    const normalizedType = String(feeType || "").trim().toLowerCase();
    const allowedTypes = new Set(["golf", "cart", "push-cart", "caddy"]);
    if (!allowedTypes.has(normalizedType)) {
        throw new Error(`Unsupported fee type: ${feeType}`);
    }

    const response = await fetch(`/fees/suggest/${normalizedType}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload || {}),
    });
    if (!response.ok) return null;
    return response.json();
}

async function viewMemberDetail(memberId) {
    const token = localStorage.getItem("token");

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/members/${memberId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        currentMemberDetail = data || null;
        const m = data?.member || {};
        const stats = data?.stats || {};
        const acct = data?.linked_account || null;
        const bookings = Array.isArray(data?.recent_bookings) ? data.recent_bookings : [];

        const sportAccess = [
            m.golf_access ? "Golf" : "",
            m.tennis_access ? "Tennis" : "",
            m.bowls_access ? "Bowls" : "",
            m.squash_access ? "Squash" : "",
        ].filter(Boolean);

        const sections = [
            `
                <div class="modal-section">
                    <div class="modal-label">Identity</div>
                    <div class="modal-value">
                        <strong>${escapeHtml(m.name || "-")}</strong>
                        ${(currentUserRole === "admin" || currentUserRole === "super_admin") ? `<button class="btn-edit" style="margin-left:10px" onclick="openMemberEditModal(${memberId})">Edit</button>` : ""}
                        ${m.member_number ? `<div>Member # ${escapeHtml(String(m.member_number))}</div>` : ""}
                        ${m.person_type ? `<div>${escapeHtml(String(m.person_type))}</div>` : ""}
                    </div>
                </div>
            `,
            `
                <div class="modal-section">
                    <div class="modal-label">Membership / Club Category</div>
                    <div class="modal-value">
                        <div>${escapeHtml(String(m.membership_category_raw || m.membership_category || "-"))}</div>
                        <div>${escapeHtml(String(m.primary_operation || "General"))} | ${escapeHtml(String(m.member_lifecycle_status || m.membership_status || (m.active ? "active" : "inactive")))}</div>
                        ${m.home_club ? `<div>${escapeHtml(String(m.home_club))}</div>` : ""}
                    </div>
                </div>
            `,
            `
                <div class="modal-section">
                    <div class="modal-label">Pricing Rule</div>
                    <div class="modal-value">
                        <div>${escapeHtml(String(m.applied_pricing_label || memberAppliedPricingLabel(m)))}</div>
                        <div class="muted-text">Rule: ${escapeHtml(String(m.pricing_label || MEMBER_PRICING_LABELS[String(m.pricing_mode || "membership_default")] || MEMBER_PRICING_LABELS.membership_default))}</div>
                        ${m.pricing_note ? `<div>${escapeHtml(String(m.pricing_note))}</div>` : ""}
                        ${m.pricing_override_updated_at ? `<div>Updated ${formatDateTimeDMY(m.pricing_override_updated_at)}${m.pricing_override_updated_by_name ? ` by ${escapeHtml(String(m.pricing_override_updated_by_name))}` : ""}</div>` : ""}
                    </div>
                </div>
            `,
            sportAccess.length ? `
                <div class="modal-section">
                    <div class="modal-label">Sport Access</div>
                    <div class="modal-value">${sportAccess.map(label => `<span class="acct-pill good">${escapeHtml(label)}</span>`).join(" ")}</div>
                </div>
            ` : "",
            (m.email || m.phone || m.country_of_residence) ? `
                <div class="modal-section">
                    <div class="modal-label">Contact Details</div>
                    <div class="modal-value">
                        ${m.email ? `<div><a href="mailto:${encodeURIComponent(String(m.email))}">${escapeHtml(String(m.email))}</a></div>` : ""}
                        ${m.phone ? `<div><a href="tel:${escapeHtml(String(m.phone))}">${escapeHtml(String(m.phone))}</a></div>` : ""}
                        ${m.country_of_residence ? `<div>${escapeHtml(String(m.country_of_residence))}</div>` : ""}
                    </div>
                </div>
            ` : "",
            (acct || Number(stats.total_spent || 0) > 0 || String(m.member_lifecycle_status || "").toLowerCase() === "defaulter") ? `
                <div class="modal-section">
                    <div class="modal-label">Financial / Debtor Linkage</div>
                    <div class="modal-value">
                        ${acct ? `${escapeHtml(acct.name || "")} (${escapeHtml(acct.email || "")}) <button class="btn-view" style="margin-left:10px" onclick="viewPlayerDetail(${acct.id})">View Account</button>` : "No linked app account."}
                        <div>Total collected: ${formatCurrencyZAR(stats.total_spent || 0)}</div>
                        ${String(m.member_lifecycle_status || "").toLowerCase() === "defaulter" ? `<div><span class="acct-pill bad">Defaulter</span></div>` : ""}
                    </div>
                </div>
            ` : "",
            `
                <div class="modal-section">
                    <div class="modal-label">Activity</div>
                    <div class="modal-value">
                        <div>Bookings: ${formatInteger(stats.bookings_count || 0)}</div>
                        <div>Last seen: ${stats.last_seen ? formatDateTimeDMY(stats.last_seen) : "No activity recorded"}</div>
                        ${m.source_file ? `<div>Source: ${escapeHtml(String(m.source_file))}${m.source_row_number != null ? ` row ${escapeHtml(String(m.source_row_number))}` : ""}</div>` : ""}
                    </div>
                </div>
            `,
            `
                <div class="modal-section">
                    <h3>Recent Bookings</h3>
                    <table class="data-table" style="font-size: 12px;">
                        <thead>
                            <tr>
                                <th>Tee Time</th>
                                <th>Status</th>
                                <th>Holes</th>
                                <th>Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bookings.length ? bookings.map(b => `
                            <tr>
                                <td>${b.tee_time ? formatDateTimeDMY(b.tee_time) : "-"}</td>
                                <td><span class="status-badge ${b.status}" style="font-size: 10px;">${escapeHtml(String(b.status || "-"))}</span></td>
                                <td>${b.holes == null ? "-" : Number(b.holes)}</td>
                                <td>${formatCurrencyZAR(b.price || 0)}</td>
                            </tr>
                            `).join("") : `<tr><td colspan="4" style="text-align:center; color:#7f8c8d; padding: 12px;">No bookings yet.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `,
        ].filter(Boolean);

        const html = sections.join("");

        document.getElementById("player-modal-body").innerHTML = html;
        document.getElementById("player-modal").classList.add("show");
    } catch (error) {
        console.error("Failed to load member detail:", error);
        toastError(error?.message || "Failed to load member");
    }
}

async function openMemberEditModal(memberId) {
    const token = localStorage.getItem("token");

    let m = {
        member_number: "",
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        handicap_number: "",
        home_club: "",
        country_of_residence: "",
        membership_category: "",
        membership_status: "active",
        pricing_mode: "membership_default",
        pricing_note: "",
        active: true
    };

    if (memberId) {
        try {
            const data = await fetchJson(`${API_BASE}/api/admin/members/${memberId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            m = { ...m, ...(data?.member || {}) };
        } catch (e) {
            toastError(e?.message || "Failed to load member");
            return;
        }
    }

    const title = memberId ? "Edit Member" : "Add Member";

    const html = `
        <div class="modal-section">
            <h2>${title}</h2>
        </div>
        <div class="modal-section">
            <label>First name</label>
            <input type="text" id="member-first-name" value="${escapeHtml(m.first_name || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Last name</label>
            <input type="text" id="member-last-name" value="${escapeHtml(m.last_name || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Member #</label>
            <input type="text" id="member-number" value="${escapeHtml(m.member_number || "")}" placeholder="Leave blank when there is no real club member number" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Email</label>
            <input type="email" id="member-email" value="${escapeHtml(m.email || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Phone</label>
            <input type="tel" id="member-phone" value="${escapeHtml(m.phone || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Handicap</label>
            <input type="text" id="member-handicap" value="${escapeHtml(m.handicap_number || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Home club</label>
            <input type="text" id="member-home-club" value="${escapeHtml(m.home_club || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Country of residence</label>
            <input type="text" id="member-country" value="${escapeHtml(m.country_of_residence || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Membership category</label>
            <input type="text" id="member-membership-category" value="${escapeHtml(m.membership_category || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Membership status</label>
            <select id="member-membership-status" style="width: 100%; padding: 8px; margin-top: 8px;">
                <option value="active" ${String(m.membership_status || "").toLowerCase() === "active" ? "selected" : ""}>Active</option>
                <option value="hold" ${String(m.membership_status || "").toLowerCase() === "hold" ? "selected" : ""}>Hold</option>
                <option value="inactive" ${String(m.membership_status || "").toLowerCase() === "inactive" ? "selected" : ""}>Inactive</option>
                <option value="resigned" ${String(m.membership_status || "").toLowerCase() === "resigned" ? "selected" : ""}>Resigned</option>
                <option value="deceased" ${String(m.membership_status || "").toLowerCase() === "deceased" ? "selected" : ""}>Deceased</option>
                <option value="defaulter" ${String(m.membership_status || "").toLowerCase() === "defaulter" ? "selected" : ""}>Defaulter</option>
            </select>
        </div>
        <div class="modal-section">
            <label>Pricing rule</label>
            <select id="member-pricing-mode" style="width: 100%; padding: 8px; margin-top: 8px;">
                <option value="membership_default" ${String(m.pricing_mode || "membership_default").toLowerCase() === "membership_default" ? "selected" : ""}>Default by membership type</option>
                <option value="visitor_override" ${String(m.pricing_mode || "").toLowerCase() === "visitor_override" ? "selected" : ""}>Visitor rate override</option>
                <option value="non_affiliated_override" ${String(m.pricing_mode || "").toLowerCase() === "non_affiliated_override" ? "selected" : ""}>Non-affiliated visitor override</option>
                <option value="reciprocity_override" ${String(m.pricing_mode || "").toLowerCase() === "reciprocity_override" ? "selected" : ""}>Reciprocity override</option>
            </select>
        </div>
        <div class="modal-section">
            <label>Pricing note</label>
            <textarea id="member-pricing-note" rows="3" style="width: 100%; padding: 8px; margin-top: 8px;" placeholder="Optional staff note, e.g. Membership arrears - charge visitor rate">${escapeHtml(m.pricing_note || "")}</textarea>
        </div>
        <div class="modal-section">
            <label style="display:flex; gap:10px; align-items:center;">
                <input type="checkbox" id="member-active" ${m.active ? "checked" : ""}>
                Active
            </label>
        </div>
        <div class="modal-section" style="display: flex; gap: 10px;">
            <button class="btn-save" onclick="saveMember(${memberId ? Number(memberId) : "null"})">Save</button>
            <button class="btn-cancel" onclick="closePriceModal()">Cancel</button>
        </div>
    `;

    document.getElementById("player-modal-body").innerHTML = html;
    document.getElementById("player-modal").classList.add("show");
}

async function saveMember(memberId) {
    const token = localStorage.getItem("token");

    const firstName = (document.getElementById("member-first-name")?.value || "").trim();
    const lastName = (document.getElementById("member-last-name")?.value || "").trim();
    const memberNumber = (document.getElementById("member-number")?.value || "").trim();
    const email = (document.getElementById("member-email")?.value || "").trim();
    const phone = (document.getElementById("member-phone")?.value || "").trim();
    const handicap = (document.getElementById("member-handicap")?.value || "").trim();
    const homeClub = (document.getElementById("member-home-club")?.value || "").trim();
    const country = (document.getElementById("member-country")?.value || "").trim();
    const membershipCategory = (document.getElementById("member-membership-category")?.value || "").trim();
    const membershipStatus = (document.getElementById("member-membership-status")?.value || "active").trim();
    const pricingMode = (document.getElementById("member-pricing-mode")?.value || "membership_default").trim();
    const pricingNote = (document.getElementById("member-pricing-note")?.value || "").trim();
    const active = Boolean(document.getElementById("member-active")?.checked);

    if (!firstName || !lastName) {
        toastError("First name and last name are required");
        return;
    }

    const payload = {
        first_name: firstName,
        last_name: lastName,
        member_number: memberNumber || null,
        email: email || null,
        phone: phone || null,
        handicap_number: handicap || null,
        home_club: homeClub || null,
        country_of_residence: country || null,
        membership_category: membershipCategory || null,
        membership_status: membershipStatus || null,
        pricing_mode: pricingMode || "membership_default",
        pricing_note: pricingNote || null,
        active
    };

    try {
        if (memberId) {
            await fetchJson(`${API_BASE}/api/admin/members/${memberId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            toastSuccess("Member updated");
        } else {
            await fetchJson(`${API_BASE}/api/admin/members`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            toastSuccess("Member created");
        }

        document.getElementById("player-modal").classList.remove("show");
        loadPlayers();
    } catch (e) {
        toastError(e?.message || "Save failed");
    }
}

async function openStaffEditModal(userId) {
    const token = localStorage.getItem("token");
    const isEdit = Boolean(userId);

    let name = "";
    let email = "";

    if (isEdit) {
        // Pull from the current table row if available (lightweight, avoids adding a new endpoint).
        try {
            const row = Array.from(document.querySelectorAll("#players-table tr")).find(tr => tr.querySelector("button")?.getAttribute("onclick")?.includes(`(${userId}`));
            const cells = row ? row.querySelectorAll("td") : null;
            if (cells && cells.length >= 2) {
                name = (cells[0].textContent || "").trim();
                email = (cells[1].textContent || "").trim();
            }
        } catch {
            // ignore
        }
    }

    const title = isEdit ? "Edit Staff" : "Add Staff";

    const html = `
        <div class="modal-section">
            <h2>${title}</h2>
        </div>
        <div class="modal-section">
            <label>Name</label>
            <input type="text" id="staff-name" value="${escapeHtml(name)}" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>Email</label>
            <input type="email" id="staff-email" value="${escapeHtml(email)}" ${isEdit ? "disabled" : ""} style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section">
            <label>${isEdit ? "New password (optional)" : "Password"}</label>
            <input type="password" id="staff-password" value="" style="width: 100%; padding: 8px; margin-top: 8px;">
        </div>
        <div class="modal-section" style="display: flex; gap: 10px;">
            <button class="btn-save" onclick="saveStaff(${isEdit ? Number(userId) : "null"})">Save</button>
            <button class="btn-cancel" onclick="closePriceModal()">Cancel</button>
        </div>
        <div class="modal-section">
            <div class="muted-text">Staff created here are limited to the <b>club_staff</b> role. Admin roles are managed by Super Admin.</div>
        </div>
    `;

    document.getElementById("player-modal-body").innerHTML = html;
    document.getElementById("player-modal").classList.add("show");
}

async function saveStaff(userId) {
    const token = localStorage.getItem("token");

    const name = (document.getElementById("staff-name")?.value || "").trim();
    const email = (document.getElementById("staff-email")?.value || "").trim();
    const password = (document.getElementById("staff-password")?.value || "").trim();

    if (!name) {
        toastError("Name is required");
        return;
    }
    if (!userId && !email) {
        toastError("Email is required");
        return;
    }
    if (!userId && !password) {
        toastError("Password is required for new staff");
        return;
    }

    const payload = {
        name,
        email: email || "",
        role: "club_staff",
        password: password || null,
        force_reset: true
    };

    try {
        if (userId) {
            await fetchJson(`${API_BASE}/api/admin/staff/${userId}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            toastSuccess("Staff updated");
        } else {
            await fetchJson(`${API_BASE}/api/admin/staff`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            toastSuccess("Staff created");
        }

        document.getElementById("player-modal").classList.remove("show");
        loadPlayers();
    } catch (e) {
        toastError(e?.message || "Save failed");
    }
}

function feeOptionsHtml() {
    return golfFeesCache.map(f => `<option value="${f.id}" data-price="${f.price}">${f.description} - R${f.price}</option>`).join("");
}

async function suggestFeeForRow(row) {
    const feeSelect = row.querySelector('select[data-field="fee"]');
    const typeSelect = row.querySelector('select[data-field="player_type"]');
    const seniorCheckbox = row.querySelector('input[data-field="senior"]');
    const categorySelect = row.querySelector('select[data-field="player_category"]');

    if (!feeSelect || !typeSelect) return;

    const playerType = typeSelect.value || "visitor";
    const senior = Boolean(seniorCheckbox?.checked);
    const playerCategory = String(categorySelect?.value || "").trim().toLowerCase();

    try {
        const suggested = await suggestAdminFee("golf", {
            tee_time_id: teeBookingState.teeTimeId,
            player_type: playerType,
            holes: teeBookingState.holes || 18,
            player_category: playerCategory || (senior ? "pensioner" : null),
            age: senior || playerCategory === "pensioner" ? 60 : null
        });

        if (!suggested) {
            row.dataset.autoFeeId = "";
            row.dataset.autoPrice = "0";
            const label = row.querySelector("[data-row-fee-label]");
            if (label) label.textContent = "Auto pricing unavailable";
            updateBookingTotals();
            return;
        }
        row.dataset.autoFeeId = String(suggested.id);
        row.dataset.autoPrice = String(suggested.price);
        const label = row.querySelector("[data-row-fee-label]");
        if (label) label.textContent = suggested.description || "Auto";
        updateBookingTotals();
    } catch (e) {
        console.error("Fee suggestion failed:", e);
        row.dataset.autoFeeId = "";
        row.dataset.autoPrice = "0";
        const label = row.querySelector("[data-row-fee-label]");
        if (label) label.textContent = "Auto pricing failed";
        updateBookingTotals();
    }
}

async function suggestCartForRow(row) {
    const cartChecked = Boolean(row.querySelector('input[data-field="cart"]')?.checked);
    const label = row.querySelector("[data-row-cart-label]");

    if (!cartChecked) {
        row.dataset.cartPrice = "0";
        row.dataset.cartLabel = "Cart";
        if (label) label.textContent = "—";
        updateBookingTotals();
        return;
    }

    const typeSelect = row.querySelector('select[data-field="player_type"]');
    const categorySelect = row.querySelector('select[data-field="player_category"]');
    const seniorCheckbox = row.querySelector('input[data-field="senior"]');
    const playerType = typeSelect?.value || "visitor";
    const playerCategory = String(categorySelect?.value || "").trim().toLowerCase();
    const senior = Boolean(seniorCheckbox?.checked);

    try {
        const suggested = await suggestAdminFee("cart", {
            tee_time_id: teeBookingState.teeTimeId,
            player_type: playerType,
            player_category: playerCategory || (senior ? "pensioner" : null),
            age: senior || playerCategory === "pensioner" ? 60 : null,
            holes: teeBookingState.holes || 18
        });

        if (!suggested) {
            row.dataset.cartPrice = "0";
            row.dataset.cartLabel = "Cart pricing unavailable";
            if (label) label.textContent = "Cart pricing unavailable";
            updateBookingTotals();
            return;
        }
        row.dataset.cartPrice = String(suggested.price || 0);
        row.dataset.cartLabel = suggested.description || "Cart";
        if (label) label.textContent = `${row.dataset.cartLabel} (R${Number(suggested.price || 0).toFixed(0)})`;
        updateBookingTotals();
    } catch (e) {
        console.error("Cart suggestion failed:", e);
        row.dataset.cartPrice = "0";
        row.dataset.cartLabel = "Cart pricing failed";
        if (label) label.textContent = "Cart pricing failed";
        updateBookingTotals();
    }
}

async function suggestPushCartForRow(row) {
    const checked = Boolean(row.querySelector('input[data-field="push_cart"]')?.checked);
    const label = row.querySelector("[data-row-push-cart-label]");

    if (!checked) {
        row.dataset.pushCartPrice = "0";
        row.dataset.pushCartLabel = "Push Cart";
        if (label) label.textContent = "—";
        updateBookingTotals();
        return;
    }

    const typeSelect = row.querySelector('select[data-field="player_type"]');
    const categorySelect = row.querySelector('select[data-field="player_category"]');
    const seniorCheckbox = row.querySelector('input[data-field="senior"]');
    const playerType = typeSelect?.value || "visitor";
    const playerCategory = String(categorySelect?.value || "").trim().toLowerCase();
    const senior = Boolean(seniorCheckbox?.checked);

    try {
        const suggested = await suggestAdminFee("push-cart", {
            tee_time_id: teeBookingState.teeTimeId,
            player_type: playerType,
            player_category: playerCategory || (senior ? "pensioner" : null),
            age: senior || playerCategory === "pensioner" ? 60 : null,
            holes: teeBookingState.holes || 18
        });

        if (!suggested) {
            row.dataset.pushCartPrice = "0";
            row.dataset.pushCartLabel = "Push cart pricing unavailable";
            if (label) label.textContent = "Push cart pricing unavailable";
            updateBookingTotals();
            return;
        }
        row.dataset.pushCartPrice = String(suggested.price || 0);
        row.dataset.pushCartLabel = suggested.description || "Push Cart";
        if (label) label.textContent = `${row.dataset.pushCartLabel} (R${Number(suggested.price || 0).toFixed(0)})`;
        updateBookingTotals();
    } catch (e) {
        console.error("Push cart suggestion failed:", e);
        row.dataset.pushCartPrice = "0";
        row.dataset.pushCartLabel = "Push cart pricing failed";
        if (label) label.textContent = "Push cart pricing failed";
        updateBookingTotals();
    }
}

async function suggestCaddyForRow(row) {
    const checked = Boolean(row.querySelector('input[data-field="caddy"]')?.checked);
    const label = row.querySelector("[data-row-caddy-label]");

    if (!checked) {
        row.dataset.caddyPrice = "0";
        row.dataset.caddyLabel = "Caddy";
        if (label) label.textContent = "—";
        updateBookingTotals();
        return;
    }

    const typeSelect = row.querySelector('select[data-field="player_type"]');
    const categorySelect = row.querySelector('select[data-field="player_category"]');
    const seniorCheckbox = row.querySelector('input[data-field="senior"]');
    const playerType = typeSelect?.value || "visitor";
    const playerCategory = String(categorySelect?.value || "").trim().toLowerCase();
    const senior = Boolean(seniorCheckbox?.checked);

    try {
        const suggested = await suggestAdminFee("caddy", {
            tee_time_id: teeBookingState.teeTimeId,
            player_type: playerType,
            player_category: playerCategory || (senior ? "pensioner" : null),
            age: senior || playerCategory === "pensioner" ? 60 : null,
            holes: teeBookingState.holes || 18
        });

        if (!suggested) {
            row.dataset.caddyPrice = "0";
            row.dataset.caddyLabel = "Caddy pricing unavailable";
            if (label) label.textContent = "Caddy pricing unavailable";
            updateBookingTotals();
            return;
        }
        row.dataset.caddyPrice = String(suggested.price || 0);
        row.dataset.caddyLabel = suggested.description || "Caddy";
        if (label) label.textContent = `${row.dataset.caddyLabel} (R${Number(suggested.price || 0).toFixed(0)})`;
        updateBookingTotals();
    } catch (e) {
        console.error("Caddy suggestion failed:", e);
        row.dataset.caddyPrice = "0";
        row.dataset.caddyLabel = "Caddy pricing failed";
        if (label) label.textContent = "Caddy pricing failed";
        updateBookingTotals();
    }
}

async function openTeeBookingModal(teeTimeId, teeTimeIso, teeLabel, capacity, existingCount, desiredTotal) {
    teeBookingState = {
        teeTimeId,
        teeTimeIso,
        tee: teeLabel,
        capacity: capacity || 4,
        existing: existingCount || 0,
        prepaid: false,
        holes: String(selectedHolesView) === "9" ? 9 : 18
    };

    await loadGolfFees();
    document.getElementById("tee-booking-time").textContent = formatDateTimeDMY(teeTimeIso);
    document.getElementById("tee-booking-tee").textContent = teeLabel || "1";

    const paidToggle = document.getElementById("tee-booking-paid");
    if (paidToggle) paidToggle.checked = false;

    const saveBtn = document.getElementById("tee-booking-save");
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Booking";
    }
    teeBookingSubmitting = false;

    const available = Math.max(0, teeBookingState.capacity - teeBookingState.existing);
    document.getElementById("tee-booking-available").textContent = available;
    const bookedEl = document.getElementById("tee-booking-booked");
    if (bookedEl) bookedEl.textContent = String(teeBookingState.existing || 0);

    const rowsContainer = document.getElementById("tee-booking-rows");
    rowsContainer.innerHTML = "";

    if (available <= 0) {
        rowsContainer.innerHTML = `<div class="empty-state">No available slots for this tee time.</div>`;
    } else {
        renderTeeBookingQuickCountButtons();
        let desired = parseInt(String(desiredTotal ?? ""), 10);
        if (!Number.isFinite(desired) || desired <= 0) desired = Math.min(teeBookingState.capacity, (teeBookingState.existing || 0) + 1);
        desired = Math.max(1, Math.min(teeBookingState.capacity, desired));

        // Clicking slot N should default to "book up to N players total" at this tee time.
        let toAdd = Math.max(1, desired - (teeBookingState.existing || 0));
        toAdd = Math.min(available, toAdd);

        setTeeBookingRowCount(toAdd);
    }
    if (available <= 0) renderTeeBookingQuickCountButtons();
    updateTeeBookingAddingCount();

    document.getElementById("tee-booking-total").textContent = "0";
    document.getElementById("tee-booking-modal").classList.add("show");
}

function closeTeeBookingModal() {
    document.getElementById("tee-booking-modal").classList.remove("show");
}

function setupTeeBookingModal() {
    const paidToggle = document.getElementById("tee-booking-paid");
    if (paidToggle) {
        paidToggle.addEventListener("change", () => {
            teeBookingState.prepaid = Boolean(paidToggle.checked);
        });
    }

    const countRoot = document.getElementById("tee-booking-quickcount");
    if (countRoot instanceof HTMLElement) {
        countRoot.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            const button = target.closest(".tee-booking-count-btn");
            if (!(button instanceof HTMLButtonElement)) return;
            const requested = Number.parseInt(String(button.dataset.count || ""), 10);
            if (!Number.isFinite(requested) || requested < 1) return;
            setTeeBookingRowCount(requested);
        });
    }
}

function renderTeeBookingQuickCountButtons() {
    const quickRoot = document.getElementById("tee-booking-quickcount");
    if (!(quickRoot instanceof HTMLElement)) return;

    const available = Math.max(0, teeBookingState.capacity - teeBookingState.existing);
    quickRoot.querySelectorAll(".tee-booking-count-btn").forEach(btn => {
        const requested = Number.parseInt(String(btn.dataset.count || ""), 10);
        const enabled = Number.isFinite(requested) && requested >= 1 && requested <= available;
        btn.disabled = !enabled;
        btn.classList.toggle("active", false);
    });
}

function setTeeBookingRowCount(requestedCount) {
    const rowsContainer = document.getElementById("tee-booking-rows");
    if (!(rowsContainer instanceof HTMLElement)) return;
    const available = Math.max(0, teeBookingState.capacity - teeBookingState.existing);
    const targetCount = Math.max(1, Math.min(available, Number.parseInt(String(requestedCount || "1"), 10) || 1));

    while (rowsContainer.querySelectorAll(".tee-booking-row").length > targetCount) {
        const last = rowsContainer.querySelector(".tee-booking-row:last-child");
        if (!(last instanceof HTMLElement)) break;
        last.remove();
    }
    while (rowsContainer.querySelectorAll(".tee-booking-row").length < targetCount) {
        addBookingRow();
    }

    const quickRoot = document.getElementById("tee-booking-quickcount");
    quickRoot?.querySelectorAll(".tee-booking-count-btn").forEach(btn => {
        const count = Number.parseInt(String(btn.dataset.count || ""), 10);
        btn.classList.toggle("active", count === targetCount);
    });
    updateTeeBookingAddingCount();
    updateBookingTotals();
}

function updateTeeBookingAddingCount() {
    const rowsContainer = document.getElementById("tee-booking-rows");
    const addingEl = document.getElementById("tee-booking-adding");
    if (!rowsContainer || !addingEl) return;
    addingEl.textContent = String(rowsContainer.querySelectorAll(".tee-booking-row").length);
}

function addBookingRow() {
    const rowsContainer = document.getElementById("tee-booking-rows");
    const currentRows = rowsContainer.querySelectorAll(".tee-booking-row").length;
    const available = Math.max(0, teeBookingState.capacity - teeBookingState.existing);
    if (currentRows >= available) return;

    const rowIndex = currentRows + 1;
    const row = document.createElement("div");
    row.className = "tee-booking-row";
    row.dataset.index = String(rowIndex);
    row.innerHTML = `
        <div class="row-header">
            <div class="row-title">Player ${rowIndex}</div>
            <div class="row-price" data-row-price>R0</div>
            <div class="row-fee-label" data-row-fee-label>Auto</div>
            ${rowIndex > 1 ? `<button class="btn-cancel btn-small" type="button" onclick="removeBookingRow(${rowIndex})">Remove</button>` : ""}
        </div>
        <div class="booking-grid">
            <div>
                <label>Type</label>
                <select data-field="player_type">
                    <option value="visitor">Visitor</option>
                    <option value="member">Member</option>
                </select>
            </div>
            <div class="typeahead">
                <label>Player Name *</label>
                <input type="text" data-field="name" placeholder="Search member or type name" autocomplete="off">
                <div class="member-chip" data-field="member_chip"></div>
                <div class="member-results" data-field="member_results"></div>
            </div>
            <div>
                <label>Email</label>
                <input type="email" data-field="email" placeholder="Email">
            </div>
            <div>
                <label>Fee</label>
                <select data-field="fee">
                    <option value="">Auto (Recommended)</option>
                    ${feeOptionsHtml()}
                </select>
            </div>
        </div>
        <details class="booking-row-optional">
            <summary>More options</summary>
            <div class="booking-grid booking-grid-optional">
                <div>
                    <label>Senior</label>
                    <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:#2c3e50;">
                        <input type="checkbox" data-field="senior">
                        60+
                    </label>
                </div>
                <div>
                    <label>Category</label>
                    <select data-field="player_category">
                        <option value="">Standard</option>
                        <option value="student">Student</option>
                        <option value="scholar">Scholar</option>
                        <option value="pensioner">Pensioner</option>
                    </select>
                </div>
                <div>
                    <label>Handicap</label>
                    <input type="text" data-field="handicap" placeholder="Handicap">
                </div>
                <div class="requirements">
                    <label>Requirements</label>
                    <div class="req-toggles">
                        <label class="req-toggle"><input type="checkbox" data-field="cart">Cart</label>
                        <label class="req-toggle"><input type="checkbox" data-field="push_cart">Push Cart</label>
                        <label class="req-toggle"><input type="checkbox" data-field="caddy">Caddy</label>
                    </div>
                    <div class="cart-fee-label" data-row-cart-label>—</div>
                    <div class="cart-fee-label" data-row-push-cart-label>—</div>
                    <div class="cart-fee-label" data-row-caddy-label>—</div>
                </div>
            </div>
        </details>
    `;
    rowsContainer.appendChild(row);
    updateTeeBookingAddingCount();
    row.dataset.cartPrice = "0";
    row.dataset.cartLabel = "Cart";
    row.dataset.pushCartPrice = "0";
    row.dataset.pushCartLabel = "Push Cart";
    row.dataset.caddyPrice = "0";
    row.dataset.caddyLabel = "Caddy";
    suggestFeeForRow(row);
    updateBookingTotals();

    const currentCount = rowsContainer.querySelectorAll(".tee-booking-row").length;
    const quickRoot = document.getElementById("tee-booking-quickcount");
    quickRoot?.querySelectorAll(".tee-booking-count-btn").forEach(btn => {
        const count = Number.parseInt(String(btn.dataset.count || ""), 10);
        btn.classList.toggle("active", count === currentCount);
    });

    if (rowIndex === 1) {
        row.querySelector("input[data-field='name']")?.focus();
    }
}

function removeBookingRow(index) {
    const rowsContainer = document.getElementById("tee-booking-rows");
    const row = rowsContainer.querySelector(`.tee-booking-row[data-index="${index}"]`);
    if (row) {
        row.remove();
        updateTeeBookingAddingCount();
        updateBookingTotals();
        const rows = rowsContainer.querySelectorAll(".tee-booking-row").length;
        const quickRoot = document.getElementById("tee-booking-quickcount");
        quickRoot?.querySelectorAll(".tee-booking-count-btn").forEach(btn => {
            const count = Number.parseInt(String(btn.dataset.count || ""), 10);
            btn.classList.toggle("active", count === rows);
        });
    }
}

function computeCartSplits(rows) {
    const cartRows = rows.filter(row => Boolean(row.querySelector('input[data-field="cart"]')?.checked));
    const splitMap = new Map();

    for (let i = 0; i < cartRows.length; i += 2) {
        const first = cartRows[i];
        const second = cartRows[i + 1];

        const firstType = first.querySelector("select[data-field='player_type']")?.value;
        const secondType = second?.querySelector("select[data-field='player_type']")?.value;

        const firstCart = parseFloat(first.dataset.cartPrice || "0") || 0;
        const secondCart = parseFloat(second?.dataset.cartPrice || "0") || 0;

        if (second) {
            const useMemberRate = firstType === "member" || secondType === "member";
            let pairRate = 0;
            if (useMemberRate) {
                const memberCart = firstType === "member" ? firstCart : (secondType === "member" ? secondCart : 0);
                pairRate = memberCart || Math.max(firstCart, secondCart);
            } else {
                pairRate = Math.max(firstCart, secondCart) || firstCart || secondCart;
            }
            splitMap.set(first, { charge: pairRate / 2, memberRate: useMemberRate });
            splitMap.set(second, { charge: pairRate / 2, memberRate: useMemberRate });
        } else {
            splitMap.set(first, { charge: firstCart, memberRate: false });
        }
    }

    return splitMap;
}

function updateBookingTotals() {
    const rows = Array.from(document.querySelectorAll(".tee-booking-row"));
    const cartSplitMap = computeCartSplits(rows);
    let total = 0;
    rows.forEach(row => {
        const select = row.querySelector('select[data-field="fee"]');
        const cartChecked = Boolean(row.querySelector('input[data-field="cart"]')?.checked);
        const pushCartChecked = Boolean(row.querySelector('input[data-field="push_cart"]')?.checked);
        const caddyChecked = Boolean(row.querySelector('input[data-field="caddy"]')?.checked);
        const priceTag = row.querySelector('[data-row-price]');
        const cartLabel = row.querySelector('[data-row-cart-label]');
        const pushCartLabel = row.querySelector('[data-row-push-cart-label]');
        const caddyLabel = row.querySelector('[data-row-caddy-label]');
        let price = 0;
        if (select && select.value) {
            const option = select.options[select.selectedIndex];
            price = parseFloat(option.getAttribute("data-price") || "0");
        } else {
            price = parseFloat(row.dataset.autoPrice || "0");
        }
        const cartInfo = cartSplitMap.get(row);
        const cartPrice = cartChecked ? (cartInfo?.charge ?? parseFloat(row.dataset.cartPrice || "0")) : 0;
        const pushCartPrice = pushCartChecked ? (parseFloat(row.dataset.pushCartPrice || "0") || 0) : 0;
        const caddyPrice = caddyChecked ? (parseFloat(row.dataset.caddyPrice || "0") || 0) : 0;
        const rowTotal = price + cartPrice + pushCartPrice + caddyPrice;
        if (priceTag) priceTag.textContent = `R${rowTotal.toFixed(0)}`;
        total += rowTotal;

        if (cartLabel) {
            if (!cartChecked) {
                cartLabel.textContent = "—";
            } else if (String(row.dataset.cartLabel || "").toLowerCase().includes("unavailable")) {
                cartLabel.textContent = row.dataset.cartLabel || "Cart pricing unavailable";
            } else {
                const baseLabel = row.dataset.cartLabel || "Cart";
                const originalCart = parseFloat(row.dataset.cartPrice || "0") || 0;
                const isSplit = originalCart > 0 && cartPrice < originalCart;
                const memberRate = cartInfo?.memberRate ? " member rate" : "";
                cartLabel.textContent = `${baseLabel} (R${Number(cartPrice || 0).toFixed(0)})${isSplit ? " split" : ""}${memberRate}`;
            }
        }

        if (pushCartLabel) {
            if (!pushCartChecked) {
                pushCartLabel.textContent = "—";
            } else if (String(row.dataset.pushCartLabel || "").toLowerCase().includes("unavailable")) {
                pushCartLabel.textContent = row.dataset.pushCartLabel || "Push cart pricing unavailable";
            } else {
                const baseLabel = row.dataset.pushCartLabel || "Push Cart";
                pushCartLabel.textContent = `${baseLabel} (R${Number(pushCartPrice || 0).toFixed(0)})`;
            }
        }

        if (caddyLabel) {
            if (!caddyChecked) {
                caddyLabel.textContent = "—";
            } else if (String(row.dataset.caddyLabel || "").toLowerCase().includes("unavailable")) {
                caddyLabel.textContent = row.dataset.caddyLabel || "Caddy pricing unavailable";
            } else {
                const baseLabel = row.dataset.caddyLabel || "Caddy";
                caddyLabel.textContent = `${baseLabel} (R${Number(caddyPrice || 0).toFixed(0)})`;
            }
        }
    });
    document.getElementById("tee-booking-total").textContent = total.toFixed(0);
}

document.addEventListener("change", (e) => {
    if (!e.target) return;
    const row = e.target.closest(".tee-booking-row");
    if (!row) return;

    if (e.target.matches("select[data-field='player_type']")) {
        if (e.target.value !== "member") {
            clearMemberFromRow(row);
        }
        if (row.querySelector("input[data-field='cart']")?.checked) {
            suggestCartForRow(row);
        }
        if (row.querySelector("input[data-field='push_cart']")?.checked) {
            suggestPushCartForRow(row);
        }
        if (row.querySelector("input[data-field='caddy']")?.checked) {
            suggestCaddyForRow(row);
        }
    }

    if (
        e.target.matches("select[data-field='player_type']")
        || e.target.matches("input[data-field='senior']")
        || e.target.matches("select[data-field='player_category']")
    ) {
        const feeSelect = row.querySelector("select[data-field='fee']");
        if (feeSelect && !feeSelect.value) {
            suggestFeeForRow(row);
        }
        if (row.querySelector("input[data-field='cart']")?.checked) {
            suggestCartForRow(row);
        }
        if (row.querySelector("input[data-field='push_cart']")?.checked) {
            suggestPushCartForRow(row);
        }
        if (row.querySelector("input[data-field='caddy']")?.checked) {
            suggestCaddyForRow(row);
        }
        return;
    }

    if (e.target.matches("select[data-field='fee']")) {
        if (!e.target.value) {
            suggestFeeForRow(row);
        }
        updateBookingTotals();
    }

    if (e.target.matches("input[data-field='cart']")) {
        suggestCartForRow(row);
    }

    if (e.target.matches("input[data-field='push_cart']")) {
        suggestPushCartForRow(row);
    }

    if (e.target.matches("input[data-field='caddy']")) {
        suggestCaddyForRow(row);
    }
});

const memberSearchTimers = new WeakMap();
const memberSearchResults = new WeakMap();

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function normalizeEmail(value) {
    const email = String(value || "").trim();
    if (!email) return null;
    return email.includes("@") ? email : null;
}

function displayValue(value, fallback = "N/A") {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === "null") return fallback;
    return escapeHtml(text);
}

function clearMemberFromRow(row) {
    delete row.dataset.memberId;
    delete row.dataset.memberName;
    const chip = row.querySelector("[data-field='member_chip']");
    if (chip) {
        chip.textContent = "";
        chip.style.display = "none";
    }
    hideMemberResults(row);
}

function hideMemberResults(row) {
    const results = row.querySelector("[data-field='member_results']");
    if (results) {
        results.innerHTML = "";
        results.style.display = "none";
    }
}

async function fetchMemberResults(query) {
    const token = localStorage.getItem("token");
    const url = `${API_BASE}/api/admin/members/search?q=${encodeURIComponent(query)}&limit=10`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.members) ? data.members : [];
}

function renderMemberResults(row, members) {
    const results = row.querySelector("[data-field='member_results']");
    if (!results) return;

    memberSearchResults.set(row, members);
    if (!members.length) {
        results.innerHTML = `<div class="member-result-meta" style="padding:10px 12px;">No members found</div>`;
        results.style.display = "block";
        return;
    }

    results.innerHTML = members
        .map((m, idx) => {
            const name = escapeHtml(m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim());
            const memberNo = escapeHtml(m.member_number || "");
            const hcp = escapeHtml(m.handicap_number || "-");
            const email = escapeHtml(m.email || "");
            const metaParts = [
                memberNo ? `#${memberNo}` : null,
                `Hcp ${hcp}`,
                email || null
            ].filter(Boolean);

            return `
                <button type="button" class="member-result" data-member-index="${idx}">
                    <div class="member-result-name">${name}</div>
                    <div class="member-result-meta">${metaParts.join(" • ")}</div>
                </button>
            `;
        })
        .join("");

    results.style.display = "block";
}

function applyMemberToRow(row, member) {
    if (!member) return;

    row.dataset.memberId = String(member.id);
    row.dataset.memberName = String(member.name || `${member.first_name || ""} ${member.last_name || ""}`.trim());

    const typeSelect = row.querySelector("select[data-field='player_type']");
    if (typeSelect) typeSelect.value = "member";

    const nameInput = row.querySelector("input[data-field='name']");
    if (nameInput) nameInput.value = row.dataset.memberName;

    const emailInput = row.querySelector("input[data-field='email']");
    if (emailInput) emailInput.value = member.email || "";

    const handicapInput = row.querySelector("input[data-field='handicap']");
    if (handicapInput) handicapInput.value = member.handicap_number || "";

    const chip = row.querySelector("[data-field='member_chip']");
    if (chip) {
        const label = member.member_number ? `Member #${member.member_number}` : "Member selected";
        chip.textContent = label;
        chip.style.display = "inline-flex";
    }

    hideMemberResults(row);

    const feeSelect = row.querySelector("select[data-field='fee']");
    if (feeSelect && !feeSelect.value) {
        suggestFeeForRow(row);
    }
}

document.addEventListener("input", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.matches("input[data-field='name']")) return;

    const row = input.closest(".tee-booking-row");
    if (!row) return;

    const value = input.value.trim();

    // If a member is selected and the name is being edited, clear the member link.
    if (row.dataset.memberId && (row.dataset.memberName || "") !== value) {
        clearMemberFromRow(row);
    }

    if (value.length < 2) {
        hideMemberResults(row);
        return;
    }

    const existingTimer = memberSearchTimers.get(row);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
        try {
            const members = await fetchMemberResults(value);
            renderMemberResults(row, members);
        } catch (err) {
            console.error("Member search failed:", err);
            hideMemberResults(row);
        }
    }, 250);

    memberSearchTimers.set(row, timer);
});

document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const memberBtn = target.closest(".member-result");
    if (memberBtn) {
        const row = memberBtn.closest(".tee-booking-row");
        if (!row) return;
        const members = memberSearchResults.get(row) || [];
        const idx = parseInt(memberBtn.getAttribute("data-member-index") || "-1", 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= members.length) return;
        applyMemberToRow(row, members[idx]);
        return;
    }

    // Click outside: close any open member search dropdowns.
    if (!target.closest(".member-results") && !target.closest("input[data-field='name']")) {
        document.querySelectorAll(".member-results").forEach(el => {
            el.innerHTML = "";
            el.style.display = "none";
        });
    }
});

document.addEventListener("focusout", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.matches("input[data-field='name']")) return;

    const row = input.closest(".tee-booking-row");
    if (!row) return;

    // Delay so a click on a result can still register.
    setTimeout(() => hideMemberResults(row), 200);
});

async function submitTeeBooking() {
    if (teeBookingSubmitting) return;
    teeBookingSubmitting = true;
    const saveBtn = document.getElementById("tee-booking-save");
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
    }

    const rows = document.querySelectorAll(".tee-booking-row");
    const token = localStorage.getItem("token");
    let created = 0;
    const errors = [];
    const prepaid = Boolean(document.getElementById("tee-booking-paid")?.checked);

    try {
        for (const row of rows) {
            const name = row.querySelector('input[data-field=\"name\"]').value.trim();
            const email = normalizeEmail(row.querySelector('input[data-field=\"email\"]').value);
            const handicap = row.querySelector('input[data-field=\"handicap\"]').value.trim();
            const playerType = row.querySelector('select[data-field=\"player_type\"]').value;
            const senior = Boolean(row.querySelector('input[data-field=\"senior\"]')?.checked);
            const playerCategory = String(row.querySelector('select[data-field=\"player_category\"]')?.value || "").trim().toLowerCase();
            const feeSelect = row.querySelector('select[data-field=\"fee\"]');
            const feeId = feeSelect.value;
            const cart = Boolean(row.querySelector('input[data-field=\"cart\"]')?.checked);
            const pushCart = Boolean(row.querySelector('input[data-field=\"push_cart\"]')?.checked);
            const caddy = Boolean(row.querySelector('input[data-field=\"caddy\"]')?.checked);

            if (!name) {
                errors.push({ name: "(missing name)", body: "Player name is required." });
                continue;
            }

            const autoFeeId = row.dataset.autoFeeId ? parseInt(row.dataset.autoFeeId, 10) : null;
            const resolvedFeeId = feeId ? parseInt(feeId, 10) : (Number.isFinite(autoFeeId) ? autoFeeId : null);

            const payload = {
                tee_time_id: teeBookingState.teeTimeId,
                player_name: name,
                player_email: email,
                handicap_number: handicap || null,
                player_type: playerType || "visitor",
                player_category: playerCategory || (senior ? "pensioner" : null),
                holes: teeBookingState.holes || 18,
                prepaid,
                cart,
                push_cart: pushCart,
                caddy
            };

            if (row.dataset.memberId) {
                const memberId = parseInt(row.dataset.memberId, 10);
                if (Number.isFinite(memberId)) {
                    payload.member_id = memberId;
                }
            }

            if (resolvedFeeId) {
                payload.fee_category_id = resolvedFeeId;
            } else {
                payload.age = senior || playerCategory === "pensioner" ? 60 : null;
            }

            const res = await fetch("/tsheet/booking", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                created += 1;
            } else {
                const body = await res.text();
                errors.push({ name, body });
            }
        }

        closeTeeBookingModal();
        if (created > 0) {
            loadTeeTimes({ preserveScroll: true });
            loadBookings();
            refreshDashboardIfVisible({ silent: true, useCache: false });
        }

        if (errors.length) {
            const summary = errors.slice(0, 3).map(e => `• ${e.name}: ${e.body || "Unknown error"}`).join("\n");
            alert(`Created ${created} booking(s). ${errors.length} failed.\n\n${summary}`);
            return;
        }

        if (created === 0) {
            alert("Please fill in at least one player name.");
        }
    } finally {
        teeBookingSubmitting = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Booking";
        }
    }
}

// Ledger
async function loadLedger() {
    if (currentActivePage !== "ledger") {
        return null;
    }
    const token = localStorage.getItem("token");
    const dateStr = document.getElementById("ledger-date")?.value;
    const q = document.getElementById("ledger-search")?.value?.trim();
    const requestKey = JSON.stringify({
        page: currentLedgerPage,
        dateStr: dateStr || "",
        period: ledgerPeriod || "day",
        q: q || "",
        exported: ledgerExportFilter || "all",
    });
    if (ledgerLoadPromise && ledgerLoadRequestKey === requestKey) {
        return ledgerLoadPromise;
    }
    if (ledgerLoadController) {
        ledgerLoadController.abort();
    }
    const controller = new AbortController();
    ledgerLoadController = controller;
    ledgerLoadRequestKey = requestKey;

    const requestPromise = (async () => {
    try {
        let url = `${API_BASE}/api/admin/ledger?skip=${(currentLedgerPage - 1) * 10}&limit=10`;
        const range = buildBookingRange(dateStr, ledgerPeriod);
        if (range) {
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }
        if (q) url += `&q=${encodeURIComponent(q)}`;
        if (ledgerExportFilter === "yes") url += "&exported=true";
        if (ledgerExportFilter === "no") url += "&exported=false";

        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (controller.signal.aborted || currentActivePage !== "ledger") {
            return null;
        }

        const totalAmountEl = document.getElementById("ledger-total-amount");
        const totalCountEl = document.getElementById("ledger-total-count");
        if (totalAmountEl) totalAmountEl.textContent = formatCurrencyZAR(data.total_amount || 0);
        if (totalCountEl) totalCountEl.textContent = formatInteger(data.total || 0);

        const table = document.getElementById("ledger-table");
        table.innerHTML = data.ledger_entries.map(le => `
            <tr>
                <td>#${le.id}</td>
                <td>${le.booking_id ? `<button class="link-btn" onclick="viewBookingDetail(${le.booking_id})">#${le.booking_id}</button>` : "-"}</td>
                <td>${le.description}</td>
                <td class="amount-cell">${formatCurrencyZAR(le.amount)}</td>
                <td>${le.pastel_synced ? `<span title="${le.pastel_transaction_id ? escapeHtml(le.pastel_transaction_id) : ""}">✓</span>` : "—"}</td>
                <td>${formatDateTimeDMY(le.created_at)}</td>
            </tr>
        `).join("");

        if (!data.ledger_entries || data.ledger_entries.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:#7f8c8d; padding: 18px;">
                        No transactions for this period.
                    </td>
                </tr>
            `;
        }

        const totalPages = Math.max(1, Math.ceil(Number(data.total || 0) / 10));
        if (currentLedgerPage > totalPages) {
            currentLedgerPage = totalPages;
            return loadLedger();
        }
        renderPagination("ledger-pagination", currentLedgerPage, totalPages, (page) => {
            currentLedgerPage = page;
            loadLedger();
        });
    } catch (error) {
        if (controller.signal.aborted || error?.name === "AbortError") return null;
        console.error("Failed to load ledger:", error);
        const table = document.getElementById("ledger-table");
        if (table) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:#b84c4c; padding: 18px;">
                        Unable to load ledger. Check server logs / database connection.
                    </td>
                </tr>
            `;
        }
    }
    })();
    ledgerLoadPromise = requestPromise.finally(() => {
        if (ledgerLoadPromise === requestPromise) {
            ledgerLoadPromise = null;
        }
        if (ledgerLoadController === controller) {
            ledgerLoadController = null;
        }
        if (ledgerLoadRequestKey === requestKey) {
            ledgerLoadRequestKey = "";
        }
    });
    return ledgerLoadPromise;
}

// Utilities
function buildPaginationItems(currentPage, totalPages) {
    if (totalPages <= 9) {
        return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    if (currentPage <= 4) {
        return [1, 2, 3, 4, 5, "...", totalPages];
    }

    if (currentPage >= totalPages - 3) {
        return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

function renderPagination(elementId, currentPage, totalPages, callback) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = "";

    const safeTotal = Math.max(1, Number(totalPages || 1));
    const safeCurrent = Math.min(Math.max(1, Number(currentPage || 1)), safeTotal);
    if (safeTotal <= 1) return;

    const makeNavButton = (label, page, disabled) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "page-nav";
        btn.textContent = label;
        btn.disabled = disabled;
        if (!disabled) {
            btn.onclick = () => callback(page);
        }
        return btn;
    };

    container.appendChild(makeNavButton("Prev", safeCurrent - 1, safeCurrent <= 1));

    const items = buildPaginationItems(safeCurrent, safeTotal);
    for (const item of items) {
        if (item === "...") {
            const ellipsis = document.createElement("span");
            ellipsis.className = "page-ellipsis";
            ellipsis.textContent = "...";
            container.appendChild(ellipsis);
            continue;
        }

        const page = Number(item);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = String(page);
        btn.classList.toggle("active", page === safeCurrent);
        btn.onclick = () => callback(page);
        container.appendChild(btn);
    }

    container.appendChild(makeNavButton("Next", safeCurrent + 1, safeCurrent >= safeTotal));
}

function updateTime() {
    const now = new Date();
    document.getElementById("current-time").textContent = `${formatDateDMY(now)} ${now.toLocaleTimeString("en-GB")}`;
}

function setupCloseModals() {
    document.querySelectorAll(".modal .close").forEach(btn => {
        btn.onclick = (e) => {
            e.target.closest(".modal").classList.remove("show");
        };
    });

    window.onclick = (e) => {
        if (e.target.classList.contains("modal")) {
            e.target.classList.remove("show");
        }
    };

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const open = Array.from(document.querySelectorAll(".modal.show"));
        if (!open.length) return;
        const top = open[open.length - 1];
        top.classList.remove("show");
        e.preventDefault();
        e.stopPropagation();
    }, true);
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("active_club_id");
    window.location.href = "index.html";
}

// Filter listener
document.addEventListener("change", (e) => {
    if (e.target.id === "filter-status") {
        currentPage = 1;
        loadBookings();
    }
});

// ========================
// Cashbook Functions
// ========================

function updateProShopExportButtonState() {
    const btn = document.getElementById("export-pro-shop-btn");
    if (!btn || btn.dataset.loading === "1") return;
    const cashbookUtils = window.GreenLinkAdminCashbook || {};
    if (typeof cashbookUtils.resolveProShopExportButton === "function") {
        const state = cashbookUtils.resolveProShopExportButton(
            Boolean(proShopCashbookHasRecords),
            Boolean(proShopCashbookAlreadyExported),
        );
        btn.disabled = Boolean(state?.disabled);
        btn.textContent = String(state?.label || "Export Pro Shop (CSV)");
        return;
    }
    if (!proShopCashbookHasRecords) {
        btn.disabled = true;
        btn.textContent = "Export Pro Shop (CSV)";
        return;
    }
    btn.disabled = false;
    btn.textContent = proShopCashbookAlreadyExported ? "Re-export Pro Shop (CSV)" : "Export Pro Shop (CSV)";
}

function setAccountingSettingsCollapsed(collapsed) {
    const body = document.getElementById("accounting-settings-body");
    const btn = document.getElementById("accounting-settings-toggle");
    if (!body || !btn) return;

    body.style.display = collapsed ? "none" : "";
    btn.textContent = collapsed ? "Edit Settings" : "Hide Settings";
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    localStorage.setItem("accounting_settings_collapsed", collapsed ? "1" : "0");
}

function toggleAccountingSettings() {
    const body = document.getElementById("accounting-settings-body");
    if (!body) return;
    const isCollapsed = body.style.display === "none";
    setAccountingSettingsCollapsed(!isCollapsed);
}

function initAccountingSettingsCollapse() {
    const stored = localStorage.getItem("accounting_settings_collapsed");
    if (stored === "1") setAccountingSettingsCollapsed(true);
}

function initCashbook() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("cashbook-date").value = today;
    loadCashbookSummary();
    loadAccountingSettings();
    loadPastelLayoutDetails();
    loadPastelMappings();
    initAccountingSetupListeners();
    initAccountingSettingsCollapse();
}

function initAccountingSetupListeners() {
    if (accountingSetupListenersInitialized) return;
    accountingSetupListenersInitialized = true;

    const ids = new Set([
        "acct-vat-output-gl",
        "acct-debit-card-gl",
        "acct-debit-cash-gl",
        "acct-debit-eft-gl",
        "acct-debit-online-gl",
        "acct-debit-account-gl",
        "acct-pastel-tax-type",
        "acct-pastel-amount-sign"
    ]);

    document.addEventListener("input", (e) => {
        const id = e?.target?.id;
        if (!id || !ids.has(id)) return;
        updateAccountingSetupStatus();
    });

    document.addEventListener("change", (e) => {
        const id = e?.target?.id;
        if (!id || !ids.has(id)) return;
        updateAccountingSetupStatus();
    });
}

function updateAccountingSetupStatus() {
    const pillLayout = document.getElementById("acct-pill-layout");
    const pillMappings = document.getElementById("acct-pill-mappings");
    const pillReady = document.getElementById("acct-pill-ready");

    const layoutOk = !!(cachedPastelLayout && cachedPastelLayout.configured && cachedPastelLayout.layout);
    const vatOutput = (document.getElementById("acct-vat-output-gl")?.value || "").trim();
    const debitAny = ["acct-debit-card-gl", "acct-debit-cash-gl", "acct-debit-eft-gl", "acct-debit-online-gl", "acct-debit-account-gl"]
        .some((id) => (document.getElementById(id)?.value || "").trim());
    const mappingsOk = !!vatOutput && debitAny;
    const readyOk = layoutOk && !!vatOutput;

    if (pillLayout) {
        pillLayout.textContent = layoutOk ? "Layout: uploaded" : "Layout: missing";
        pillLayout.className = `acct-pill ${layoutOk ? "good" : "bad"}`;
    }
    if (pillMappings) {
        pillMappings.textContent = mappingsOk ? "Mappings: saved" : "Mappings: incomplete";
        pillMappings.className = `acct-pill ${mappingsOk ? "good" : "warn"}`;
    }
    if (pillReady) {
        pillReady.textContent = readyOk ? "Export: ready" : "Export: not ready";
        pillReady.className = `acct-pill ${readyOk ? "good" : "warn"}`;
    }
}

function renderPastelLayoutDetails(layout) {
    const el = document.getElementById("pastel-layout-details");
    if (!el) return;

    if (!layout) {
        el.textContent = "No layout uploaded yet.";
        return;
    }

    const inferred = layout.inferred || {};
    const uploadedAt = layout.uploaded_at ? new Date(layout.uploaded_at).toLocaleString() : "—";
    const fileName = layout.filename || "—";
    const columns = Array.isArray(layout.columns) ? layout.columns : [];
    const columnMap = layout.column_map || {};

    const mapRows = Object.entries(columnMap)
        .filter(([, v]) => !!v)
        .map(([k, v]) => `<div><strong>${escapeHtml(k)}</strong>: <code>${escapeHtml(String(v))}</code></div>`)
        .join("");

    const mirrors = Array.isArray(inferred.amount_mirrors) ? inferred.amount_mirrors : [];
    const mirrorText = mirrors.length ? mirrors.map((m) => `<code>${escapeHtml(String(m))}</code>`).join(" ") : "—";

    const observedTax = Array.isArray(inferred.observed_tax_types) ? inferred.observed_tax_types : [];
    const observedTaxText = observedTax.length ? observedTax.map((t) => `<code>${escapeHtml(String(t))}</code>`).join(" ") : "—";

    const accountFmt = inferred.account_digits_only ? "Digits only (e.g. 9500000)" : "As entered (e.g. 9500/000)";
    const signHint = inferred.inferred_amount_sign
        ? (inferred.inferred_amount_sign === "debit_positive" ? "Debit is +" : "Debit is -")
        : "—";

    el.innerHTML = `
        <div><strong>Template:</strong> ${escapeHtml(fileName)} • <strong>Uploaded:</strong> ${escapeHtml(uploadedAt)}</div>
        <div><strong>Delimiter:</strong> <code>${escapeHtml(String(layout.delimiter || ","))}</code> • <strong>Header row:</strong> ${layout.has_header ? "Yes" : "No"} • <strong>Date format:</strong> <code>${escapeHtml(String(layout.date_format || "auto"))}</code></div>
        <div><strong>Columns:</strong> ${columns.length} • <strong>Account format:</strong> ${escapeHtml(accountFmt)}</div>
        <div style="margin-top:8px;"><strong>Detected mapping</strong></div>
        <div>${mapRows || "<div>—</div>"}</div>
        <div style="margin-top:8px;"><strong>Tax fields:</strong> flag=${inferred.has_tax_flag ? "yes" : "no"}, amount=${inferred.has_tax_amount ? "yes" : "no"} • <strong>Observed tax types:</strong> ${observedTaxText}</div>
        <div><strong>Amount mirror columns:</strong> ${mirrorText} • <strong>Inferred sign:</strong> ${escapeHtml(String(signHint))}</div>
    `;
}

function formatGlFromTemplate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.includes("/") || raw.includes("-")) return raw;
    if (/^\d{7}$/.test(raw)) return `${raw.slice(0, 4)}/${raw.slice(4)}`;
    return raw;
}

function applyPastelMappingSuggestionsFromLayout(layout) {
    if (!layout) return;

    const columns = Array.isArray(layout.columns) ? layout.columns : [];
    const columnMap = layout.column_map || {};
    const sampleRows = Array.isArray(layout.sample_rows) ? layout.sample_rows : [];

    const accountHeader = columnMap.account;
    const refHeader = columnMap.reference;
    const descHeader = columnMap.description;

    const accountIdx = accountHeader ? columns.indexOf(accountHeader) : -1;
    const refIdx = refHeader ? columns.indexOf(refHeader) : -1;
    const descIdx = descHeader ? columns.indexOf(descHeader) : -1;

    if (accountIdx < 0 || sampleRows.length === 0) return;

    const getCell = (row, idx) => (idx >= 0 && idx < row.length ? String(row[idx] || "").trim() : "");
    const toText = (row) => `${getCell(row, refIdx)} ${getCell(row, descIdx)}`.trim().toUpperCase();

    let suggestedVat = "";
    const suggestedDebit = {};

    const wantMethods = ["CARD", "CASH", "EFT", "ONLINE", "ACCOUNT"];

    for (const row of sampleRows) {
        if (!Array.isArray(row)) continue;
        const acct = formatGlFromTemplate(getCell(row, accountIdx));
        if (!acct) continue;
        const text = toText(row);

        if (!suggestedVat) {
            if (/\bVAT\s*CONT\b/.test(text) || /\bVAT\b/.test(text) && /\bCONT\b/.test(text)) {
                suggestedVat = acct;
            }
        }

        for (const method of wantMethods) {
            if (suggestedDebit[method]) continue;
            const re = new RegExp(`\\b${method}\\b`, "i");
            if (re.test(text)) {
                suggestedDebit[method] = acct;
            }
        }

        if (suggestedVat && wantMethods.every((m) => !!suggestedDebit[m] || m === "ONLINE" || m === "ACCOUNT")) {
            // Stop early once we have the key suggestions; ONLINE/ACCOUNT may not exist in the template.
            break;
        }
    }

    const vatEl = document.getElementById("acct-vat-output-gl");
    const cardEl = document.getElementById("acct-debit-card-gl");
    const cashEl = document.getElementById("acct-debit-cash-gl");
    const eftEl = document.getElementById("acct-debit-eft-gl");
    const onlineEl = document.getElementById("acct-debit-online-gl");
    const accountEl = document.getElementById("acct-debit-account-gl");

    let filledAny = false;

    if (vatEl && !vatEl.value.trim() && suggestedVat) {
        vatEl.value = suggestedVat;
        filledAny = true;
    }
    if (cardEl && !cardEl.value.trim() && suggestedDebit.CARD) {
        cardEl.value = suggestedDebit.CARD;
        filledAny = true;
    }
    if (cashEl && !cashEl.value.trim() && suggestedDebit.CASH) {
        cashEl.value = suggestedDebit.CASH;
        filledAny = true;
    }
    if (eftEl && !eftEl.value.trim() && suggestedDebit.EFT) {
        eftEl.value = suggestedDebit.EFT;
        filledAny = true;
    }
    if (onlineEl && !onlineEl.value.trim() && suggestedDebit.ONLINE) {
        onlineEl.value = suggestedDebit.ONLINE;
        filledAny = true;
    }
    if (accountEl && !accountEl.value.trim() && suggestedDebit.ACCOUNT) {
        accountEl.value = suggestedDebit.ACCOUNT;
        filledAny = true;
    }

    if (filledAny) {
        const statusEl = document.getElementById("pastel-mappings-status");
        if (statusEl && !statusEl.textContent) {
            statusEl.textContent = "Auto-filled mappings from the uploaded Pastel template — review and click Save Settings.";
            setTimeout(() => {
                if (statusEl.textContent?.startsWith("Auto-filled mappings")) statusEl.textContent = "";
            }, 6000);
        }
    }
}

async function loadPastelLayoutDetails() {
    const token = localStorage.getItem("token");
    const detailsEl = document.getElementById("pastel-layout-details");

    try {
        const res = await fetch(`${API_BASE}/cashbook/pastel-layout`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            cachedPastelLayout = null;
            if (detailsEl) detailsEl.textContent = "Failed to load layout.";
            updateAccountingSetupStatus();
            return;
        }
        const data = await res.json();
        cachedPastelLayout = data || null;

        if (!data || !data.configured || !data.layout) {
            renderPastelLayoutDetails(null);
            updateAccountingSetupStatus();
            return;
        }

        renderPastelLayoutDetails(data.layout);

        const inferred = data.layout.inferred || {};
        const amountSignEl = document.getElementById("acct-pastel-amount-sign");
        if (amountSignEl && !amountSignEl.value && inferred.inferred_amount_sign) {
            amountSignEl.value = inferred.inferred_amount_sign;
        }

        const taxTypeEl = document.getElementById("acct-pastel-tax-type");
        if (taxTypeEl && !taxTypeEl.value) {
            const observed = Array.isArray(inferred.observed_tax_types) ? inferred.observed_tax_types : [];
            // Prefer a numeric tax type if present (e.g. "01"), otherwise fall back to the first observed non-empty code (e.g. "GOV01").
            const numeric = observed.find((t) => /^[0-9]{1,3}$/.test(String(t || "").trim()));
            const firstNonEmpty = observed.find((t) => String(t || "").trim().length > 0);
            const best = numeric || firstNonEmpty;
            if (best) taxTypeEl.value = String(best).trim();
        }

        applyPastelMappingSuggestionsFromLayout(data.layout);
        updateAccountingSetupStatus();
    } catch (e) {
        console.error("Failed to load Pastel layout details:", e);
        cachedPastelLayout = null;
        if (detailsEl) detailsEl.textContent = "Failed to load layout.";
        updateAccountingSetupStatus();
    }
}

async function loadCashbookSummary() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date").value;
    
    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cashbook/daily-summary?summary_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error: " + error.detail);
            return;
        }

        const data = await response.json();

        // Update summary stats
        document.getElementById("summary-date").textContent = formatYMDToDMY(data.date);
        document.getElementById("summary-count").textContent = data.transaction_count;
        document.getElementById("summary-amount").textContent = `R${data.total_payments.toFixed(2)}`;
        document.getElementById("summary-tax").textContent = `R${data.total_tax.toFixed(2)}`;

        loadCashbookJournalPreview();
        loadProShopCashbookSummary();

        // Populate payment records
        const table = document.getElementById("cashbook-records");
        if (data.records.length === 0) {
            table.innerHTML = `<tr><td colspan="8" style="text-align: center;">No payment records found for this date</td></tr>`;
            document.getElementById("export-btn").disabled = true;
            cashbookHasRecords = false;
            loadCloseStatus();
            return;
        }

        table.innerHTML = data.records.map(record => `
            <tr>
                <td>${record.period}</td>
                <td>${formatYMDToDMY(record.date)}</td>
                <td>${record.gdc}</td>
                <td>${record.reference}</td>
                <td>${record.description}</td>
                <td>R${record.amount.toFixed(2)}</td>
                <td>${record.tax_type}</td>
                <td>R${record.tax_amount.toFixed(2)}</td>
            </tr>
        `).join("");

        // Enable export button
        document.getElementById("export-btn").disabled = false;
        cashbookHasRecords = true;
        loadCloseStatus();
    } catch (error) {
        console.error("Failed to load cashbook summary:", error);
        alert("Failed to load cashbook summary");
    }
}

async function exportCashbookToCSV() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date").value;
    const exportBtn = document.getElementById("export-btn");
    const originalLabel = exportBtn ? exportBtn.textContent : "";
    
    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    try {
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = "Building journal...";
        }

        const response = await fetch(`${API_BASE}/cashbook/export-csv?export_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error: " + error.detail);
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalLabel || "Export Journal (CSV)";
            }
            return;
        }

        const batchRef = response.headers.get("x-greenlink-batchref") || "";

        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        
        // Get filename from content-disposition header or create one
        const disposition = response.headers.get("content-disposition");
        let filename = `Cashbook_Payments_${dateInput.replace(/-/g, '')}.csv`;
        
        if (disposition && disposition.includes("filename")) {
            filename = disposition.split("filename=")[1].replace(/"/g, "");
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        alert(`Journal exported${batchRef ? ` (${batchRef})` : ""}. Upload this CSV into Sage manually.`);
    } catch (error) {
        console.error("Failed to export cashbook:", error);
        alert("Failed to export cashbook");
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = originalLabel || "Export Journal (CSV)";
        }
    }
}

async function loadProShopCashbookSummary() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date")?.value;
    const dateEl = document.getElementById("pro-shop-summary-date");
    const countEl = document.getElementById("pro-shop-summary-count");
    const amountEl = document.getElementById("pro-shop-summary-amount");
    const taxEl = document.getElementById("pro-shop-summary-tax");
    const noteEl = document.getElementById("pro-shop-cashbook-note");

    if (!dateInput) {
        if (dateEl) dateEl.textContent = "-";
        if (countEl) countEl.textContent = "0";
        if (amountEl) amountEl.textContent = "R0.00";
        if (taxEl) taxEl.textContent = "R0.00";
        if (noteEl) noteEl.textContent = "Load a date to view pro shop totals and export the POS journal.";
        proShopCashbookHasRecords = false;
        proShopCashbookAlreadyExported = false;
        updateProShopExportButtonState();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cashbook/pro-shop-summary?summary_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            if (noteEl) noteEl.textContent = error?.detail || "Failed to load pro shop summary";
            proShopCashbookHasRecords = false;
            proShopCashbookAlreadyExported = false;
            updateProShopExportButtonState();
            return;
        }

        const data = await response.json();
        const txCount = Number(data?.transaction_count || 0);
        const totalAmount = Number(data?.total_payments || 0);
        const totalTax = Number(data?.total_tax || 0);

        if (dateEl) dateEl.textContent = data?.date ? formatYMDToDMY(data.date) : "-";
        if (countEl) countEl.textContent = String(txCount);
        if (amountEl) amountEl.textContent = `R${totalAmount.toFixed(2)}`;
        if (taxEl) taxEl.textContent = `R${totalTax.toFixed(2)}`;

        proShopCashbookHasRecords = txCount > 0;
        proShopCashbookAlreadyExported = Boolean(data?.already_exported);
        updateProShopExportButtonState();

        const methodRows = Array.isArray(data?.payment_methods) ? data.payment_methods : [];
        const methodSummary = methodRows
            .filter((row) => Number(row?.total || 0) > 0)
            .map((row) => `${String(row?.method || "").toUpperCase()}: R${Number(row?.total || 0).toFixed(2)}`)
            .slice(0, 3)
            .join(" | ");

        if (noteEl) {
            if (!proShopCashbookHasRecords) {
                noteEl.textContent = "No pro shop sales found for this date.";
            } else if (proShopCashbookAlreadyExported) {
                const batchRef = String(data?.export_batch_ref || "").trim();
                const exportedAt = data?.exported_at ? formatDateTimeDMY(data.exported_at) : "";
                if (batchRef && exportedAt) {
                    noteEl.textContent = `Already exported in batch ${batchRef} at ${exportedAt}. Use re-export only if required.`;
                } else if (batchRef) {
                    noteEl.textContent = `Already exported in batch ${batchRef}. Use re-export only if required.`;
                } else {
                    noteEl.textContent = "Already exported for this date. Use re-export only if required.";
                }
            } else if (methodSummary) {
                noteEl.textContent = `Ready to export ${txCount} sale(s). ${methodSummary}`;
            } else {
                noteEl.textContent = `Ready to export ${txCount} pro shop sale(s).`;
            }
        }
    } catch (error) {
        console.error("Failed to load pro shop cashbook summary:", error);
        if (noteEl) noteEl.textContent = "Failed to load pro shop summary";
        proShopCashbookHasRecords = false;
        proShopCashbookAlreadyExported = false;
        updateProShopExportButtonState();
    }
}

async function exportProShopCashbookToCSV(force = false) {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date")?.value;
    const exportBtn = document.getElementById("export-pro-shop-btn");
    const originalLabel = exportBtn ? exportBtn.textContent : "";

    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    try {
        if (exportBtn) {
            exportBtn.dataset.loading = "1";
            exportBtn.disabled = true;
            exportBtn.textContent = force ? "Re-exporting..." : "Building journal...";
        }

        const response = await fetch(
            `${API_BASE}/cashbook/export-csv-pro-shop?export_date=${dateInput}${force ? "&force=1" : ""}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const msg = error?.detail || "Failed to export pro shop cashbook";
            if (response.status === 409 && !force) {
                const retry = confirm(`${msg}\n\nDo you want to re-export this date?`);
                if (retry) {
                    if (exportBtn) exportBtn.dataset.loading = "0";
                    await exportProShopCashbookToCSV(true);
                    return;
                }
            }
            alert("Error: " + msg);
            return;
        }

        const batchRef = response.headers.get("x-greenlink-batchref") || "";
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const disposition = response.headers.get("content-disposition");
        let filename = `ProShop_Payments_${dateInput.replace(/-/g, "")}.csv`;
        if (disposition && disposition.includes("filename")) {
            filename = disposition.split("filename=")[1].replace(/"/g, "");
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        alert(`Pro shop journal exported${batchRef ? ` (${batchRef})` : ""}. Upload this CSV into Sage manually.`);
    } catch (error) {
        console.error("Failed to export pro shop cashbook:", error);
        alert("Failed to export pro shop cashbook");
    } finally {
        if (exportBtn) {
            exportBtn.dataset.loading = "0";
            exportBtn.textContent = originalLabel || "Export Pro Shop (CSV)";
        }
        await loadProShopCashbookSummary();
        updateProShopExportButtonState();
    }
}

async function loadCashbookJournalPreview() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date")?.value;
    const statusEl = document.getElementById("cashbook-journal-preview-status");
    const tbody = document.getElementById("cashbook-journal-preview-body");

    if (!tbody) return;

    if (!dateInput) {
        if (statusEl) statusEl.textContent = "";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Select a date to preview the journal</td></tr>`;
        return;
    }

    if (statusEl) statusEl.textContent = "Building preview...";
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Loading…</td></tr>`;

    try {
        const res = await fetch(`${API_BASE}/cashbook/export-preview?export_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const raw = await res.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            data = null;
        }

        if (!res.ok) {
            const msg = data?.detail || "Preview failed";
            if (statusEl) statusEl.textContent = msg;
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${escapeHtml(msg)}</td></tr>`;
            return;
        }

        const lines = Array.isArray(data?.journal_lines) ? data.journal_lines : [];
        if (!lines.length) {
            if (statusEl) statusEl.textContent = "No lines to preview";
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No lines to preview</td></tr>`;
            return;
        }

        const totals = data?.totals || {};
        if (statusEl) {
            const gross = Number(totals.gross ?? 0).toFixed(2);
            const vat = Number(totals.vat ?? 0).toFixed(2);
            const net = Number(totals.net ?? 0).toFixed(2);
            statusEl.textContent = `Batch ${data.batchRef || ""} • Gross R${gross} • VAT R${vat} • Net R${net}`;
        }

        const fmtMoney = (v) => {
            const s = String(v ?? "").trim();
            if (!s) return "";
            return `R${s}`;
        };

        tbody.innerHTML = lines.map((l) => `
            <tr>
                <td>${escapeHtml(l.account || "")}</td>
                <td>${escapeHtml(l.reference || "")}</td>
                <td>${escapeHtml(l.description || "")}</td>
                <td>${escapeHtml(fmtMoney(l.amount || l.debit || l.credit || ""))}</td>
                <td>${escapeHtml(l.tax_type || "")}</td>
                <td>${escapeHtml(fmtMoney(l.tax_amount || ""))}</td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Failed to load journal preview:", e);
        if (statusEl) statusEl.textContent = "Preview failed";
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Preview failed</td></tr>`;
    }
}

function applyGlAccountReference(reference) {
    cachedGlAccountReference = reference && typeof reference === "object" ? reference : null;
    const datalist = document.getElementById("gl-account-options");
    const noteEl = document.getElementById("acct-gl-reference-note");
    const accounts = Array.isArray(cachedGlAccountReference?.accounts) ? cachedGlAccountReference.accounts : [];

    if (datalist) {
        if (!accounts.length) {
            datalist.innerHTML = "";
        } else {
            datalist.innerHTML = accounts
                .map((row) => {
                    const account = String(row?.account || "").trim();
                    const description = String(row?.description || "").trim();
                    if (!account || !description) return "";
                    return `<option value="${escapeHtml(account)}">${escapeHtml(`${account} - ${description}`)}</option>`;
                })
                .join("");
        }
    }

    if (!noteEl) return;
    if (!accounts.length) {
        noteEl.textContent = "No GL account reference loaded for this club yet. Save export mappings using the client account codes already known.";
        return;
    }
    const sourceFile = String(cachedGlAccountReference?.source_file || "").trim();
    const count = Number(cachedGlAccountReference?.count || accounts.length || 0);
    noteEl.textContent = `${formatInteger(count)} GL accounts loaded${sourceFile ? ` from ${sourceFile}` : ""}. Finance mapping fields now suggest codes from this club reference list.`;
}

async function loadAccountingSettings() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/cashbook/settings`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const greenFees = document.getElementById("acct-green-fees");
        const contraGl = document.getElementById("acct-contra-gl");
        const vatRate = document.getElementById("acct-vat-rate");
        const taxType = document.getElementById("acct-tax-type");
        const cashbook = document.getElementById("acct-cashbook");
        applyGlAccountReference(data?.gl_reference);
        if (greenFees) greenFees.value = data.green_fees_gl || "";
        if (contraGl) contraGl.value = data.cashbook_contra_gl || "";
        if (vatRate) vatRate.value = (data.vat_rate * 100).toFixed(2);
        if (taxType) taxType.value = String(data.tax_type ?? 0);
        if (cashbook) cashbook.value = data.cashbook_name || "";
        updateAccountingSetupStatus();
    } catch (error) {
        console.error("Failed to load accounting settings:", error);
    }
}

async function saveAccountingSettings() {
    const token = localStorage.getItem("token");
    const greenFees = document.getElementById("acct-green-fees")?.value || "";
    const contraGl = document.getElementById("acct-contra-gl")?.value || "";
    const vatRateRaw = document.getElementById("acct-vat-rate")?.value || "0";
    const taxType = parseInt(document.getElementById("acct-tax-type")?.value || "0", 10);
    const cashbook = document.getElementById("acct-cashbook")?.value || "";

    const vatRate = Math.max(0, parseFloat(vatRateRaw) || 0) / 100;

    try {
        const res = await fetch(`${API_BASE}/cashbook/settings`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                green_fees_gl: greenFees,
                cashbook_contra_gl: contraGl,
                vat_rate: vatRate,
                tax_type: taxType,
                cashbook_name: cashbook
            })
        });

        if (!res.ok) {
            const err = await res.json();
            return { ok: false, message: err.detail || "Save failed" };
        }

        loadCashbookSummary();
        updateAccountingSetupStatus();
        return { ok: true };
    } catch (error) {
        console.error("Failed to save accounting settings:", error);
        return { ok: false, message: "Save failed" };
    }
}

async function uploadPastelLayout() {
    const token = localStorage.getItem("token");
    const fileInput = document.getElementById("pastel-layout-file");
    const statusEl = document.getElementById("pastel-layout-status");

    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        if (statusEl) statusEl.textContent = "Pick a CSV file first";
        return;
    }

    const file = fileInput.files[0];
    if (!file) {
        if (statusEl) statusEl.textContent = "Pick a CSV file first";
        return;
    }

    const form = new FormData();
    form.append("file", file);

    if (statusEl) statusEl.textContent = "Uploading layout...";

    try {
        const res = await fetch(`${API_BASE}/cashbook/pastel-layout`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });

        const raw = await res.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            data = null;
        }

        if (!res.ok) {
            const msg = data?.detail || "Upload failed";
            if (statusEl) statusEl.textContent = msg;
            return;
        }

        if (statusEl) {
            statusEl.textContent = "Layout uploaded";
            setTimeout(() => { statusEl.textContent = ""; }, 2500);
        }
        await loadPastelLayoutDetails();
    } catch (e) {
        console.error("Pastel layout upload failed:", e);
        if (statusEl) statusEl.textContent = "Upload failed";
    }
}

async function loadPastelMappings() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/cashbook/pastel-mappings`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        cachedPastelMappings = data || null;
        if (!data || !data.configured || !data.mappings) {
            updateAccountingSetupStatus();
            return;
        }

        const vatOutput = document.getElementById("acct-vat-output-gl");
        const card = document.getElementById("acct-debit-card-gl");
        const cash = document.getElementById("acct-debit-cash-gl");
        const eft = document.getElementById("acct-debit-eft-gl");
        const online = document.getElementById("acct-debit-online-gl");
        const account = document.getElementById("acct-debit-account-gl");
        const taxType = document.getElementById("acct-pastel-tax-type");
        const amountSign = document.getElementById("acct-pastel-amount-sign");

        const mappings = data.mappings || {};
        const debit = mappings.debit_gl || {};

        if (vatOutput) vatOutput.value = mappings.vat_output_gl || "";
        if (taxType) taxType.value = mappings.tax_type || "";
        if (amountSign) amountSign.value = mappings.amount_sign || "";
        if (card) card.value = debit.CARD || "";
        if (cash) cash.value = debit.CASH || "";
        if (eft) eft.value = debit.EFT || "";
        if (online) online.value = debit.ONLINE || "";
        if (account) account.value = debit.ACCOUNT || "";
        updateAccountingSetupStatus();
    } catch (e) {
        console.error("Failed to load Pastel mappings:", e);
    }
}

async function savePastelMappings() {
    const token = localStorage.getItem("token");
    const statusEl = document.getElementById("pastel-mappings-status");

    const vatOutput = document.getElementById("acct-vat-output-gl")?.value || "";
    const card = document.getElementById("acct-debit-card-gl")?.value || "";
    const cash = document.getElementById("acct-debit-cash-gl")?.value || "";
    const eft = document.getElementById("acct-debit-eft-gl")?.value || "";
    const online = document.getElementById("acct-debit-online-gl")?.value || "";
    const account = document.getElementById("acct-debit-account-gl")?.value || "";
    const taxType = document.getElementById("acct-pastel-tax-type")?.value || "";
    const amountSign = document.getElementById("acct-pastel-amount-sign")?.value || "";

    if (!vatOutput.trim()) {
        if (statusEl) statusEl.textContent = "Enter Output VAT GL account";
        document.getElementById("acct-vat-output-gl")?.focus();
        updateAccountingSetupStatus();
        return { ok: false, message: "Enter Output VAT GL account" };
    }

    const debit_gl = {
        CARD: card,
        CASH: cash,
        EFT: eft,
        ONLINE: online,
        ACCOUNT: account
    };

    if (statusEl) statusEl.textContent = "Saving...";

    try {
        const res = await fetch(`${API_BASE}/cashbook/pastel-mappings`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                vat_output_gl: vatOutput,
                tax_type: taxType,
                amount_sign: amountSign,
                debit_gl
            })
        });

        const raw = await res.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            data = null;
        }

        if (!res.ok) {
            const msg = data?.detail || "Save failed";
            if (statusEl) statusEl.textContent = msg;
            return { ok: false, message: msg };
        }

        if (statusEl) {
            statusEl.textContent = "Saved";
            setTimeout(() => { statusEl.textContent = ""; }, 2500);
        }
        await loadPastelMappings();
        updateAccountingSetupStatus();
        return { ok: true };
    } catch (e) {
        console.error("Failed to save Pastel mappings:", e);
        if (statusEl) statusEl.textContent = "Save failed";
        return { ok: false, message: "Save failed" };
    }
}

async function saveCashbookAccountingSetup() {
    const statusEl = document.getElementById("acct-save-status");
    const mappingsStatusEl = document.getElementById("pastel-mappings-status");

    if (mappingsStatusEl) mappingsStatusEl.textContent = "";
    if (statusEl) statusEl.textContent = "Saving...";

    const settingsRes = await saveAccountingSettings();
    if (!settingsRes?.ok) {
        if (statusEl) statusEl.textContent = settingsRes?.message || "Save failed";
        return;
    }

    const mappingsRes = await savePastelMappings();
    if (!mappingsRes?.ok) {
        if (statusEl) statusEl.textContent = mappingsRes?.message || "Save failed";
        return;
    }

    await Promise.allSettled([loadAccountingSettings(), loadPastelMappings(), loadPastelLayoutDetails()]);
    updateAccountingSetupStatus();

    if (statusEl) {
        statusEl.textContent = "Saved";
        setTimeout(() => { statusEl.textContent = ""; }, 2000);
    }

    setAccountingSettingsCollapsed(true);
}

async function loadBookingWindowSettings() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/api/admin/booking-window`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const memberInput = document.getElementById("booking-window-member");
        const affInput = document.getElementById("booking-window-affiliated");
        const nonAffInput = document.getElementById("booking-window-nonaff");
        const groupCancelInput = document.getElementById("booking-window-group-cancel");
        if (memberInput) memberInput.value = data.member_days ?? 28;
        if (affInput) affInput.value = data.affiliated_days ?? 28;
        if (nonAffInput) nonAffInput.value = data.non_affiliated_days ?? 28;
        if (groupCancelInput) groupCancelInput.value = data.group_cancel_days ?? 10;
    } catch (error) {
        console.error("Failed to load booking window settings:", error);
    }
}

async function saveBookingWindowSettings() {
    const token = localStorage.getItem("token");
    const memberDays = parseInt(document.getElementById("booking-window-member")?.value || "28", 10);
    const affiliatedDays = parseInt(document.getElementById("booking-window-affiliated")?.value || "28", 10);
    const nonAffDays = parseInt(document.getElementById("booking-window-nonaff")?.value || "28", 10);
    const groupCancelDays = parseInt(document.getElementById("booking-window-group-cancel")?.value || "10", 10);
    const statusEl = document.getElementById("booking-window-status");

    try {
        const res = await fetch(`${API_BASE}/api/admin/booking-window`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                member_days: Number.isFinite(memberDays) ? memberDays : 28,
                affiliated_days: Number.isFinite(affiliatedDays) ? affiliatedDays : 28,
                non_affiliated_days: Number.isFinite(nonAffDays) ? nonAffDays : 28,
                group_cancel_days: Number.isFinite(groupCancelDays) ? groupCancelDays : 10
            })
        });

        if (!res.ok) {
            const err = await res.json();
            if (statusEl) statusEl.textContent = err.detail || "Save failed";
            return;
        }

        if (statusEl) {
            statusEl.textContent = "Saved";
            setTimeout(() => { statusEl.textContent = ""; }, 2000);
        }
    } catch (error) {
        console.error("Failed to save booking window settings:", error);
        if (statusEl) statusEl.textContent = "Save failed";
    }
}

function writeTeeProfileToForm(profile) {
    const p = normalizeTeeProfile(profile);
    teeSheetProfile = p;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || "";
    };

    setValue("tee-profile-interval", String(p.interval_min || 8));

    setValue("tee-profile-summer-two-start-1", p.summer?.two_tee_windows?.[0]?.start || "06:30");
    setValue("tee-profile-summer-two-end-1", p.summer?.two_tee_windows?.[0]?.end || "08:30");
    setValue("tee-profile-summer-two-start-2", p.summer?.two_tee_windows?.[1]?.start || "11:30");
    setValue("tee-profile-summer-two-end-2", p.summer?.two_tee_windows?.[1]?.end || "13:30");
    setValue("tee-profile-summer-one-start", p.summer?.one_tee_windows?.[0]?.start || "06:30");
    setValue("tee-profile-summer-one-end", p.summer?.one_tee_windows?.[0]?.end || "13:30");
    setValue("tee-profile-summer-nine-start", p.summer?.nine_hole_start || "15:40");
    setValue("tee-profile-summer-nine-end", p.summer?.nine_hole_end || "17:30");

    setValue("tee-profile-winter-two-start-1", p.winter?.two_tee_windows?.[0]?.start || "06:45");
    setValue("tee-profile-winter-two-end-1", p.winter?.two_tee_windows?.[0]?.end || "08:00");
    setValue("tee-profile-winter-two-start-2", p.winter?.two_tee_windows?.[1]?.start || "11:00");
    setValue("tee-profile-winter-two-end-2", p.winter?.two_tee_windows?.[1]?.end || "13:00");
    setValue("tee-profile-winter-one-start", p.winter?.one_tee_windows?.[0]?.start || "06:45");
    setValue("tee-profile-winter-one-end", p.winter?.one_tee_windows?.[0]?.end || "13:00");
    setValue("tee-profile-winter-nine-start", p.winter?.nine_hole_start || "15:15");
    setValue("tee-profile-winter-nine-end", p.winter?.nine_hole_end || "16:45");
}

function readTeeProfileFromForm() {
    const readTime = (id, fallback) => normalizeClockValue(document.getElementById(id)?.value, fallback);
    const readNum = (id, fallback) => {
        const n = parseInt(String(document.getElementById(id)?.value || fallback), 10);
        return Number.isFinite(n) ? n : fallback;
    };

    const draft = {
        interval_min: readNum("tee-profile-interval", 8),
        winter_months: [5, 6, 7, 8],
        two_tee_days: [1, 2, 3, 5],
        two_tee_tees: ["1", "10"],
        one_tee_tees: ["1"],
        summer: {
            two_tee_windows: [
                {
                    start: readTime("tee-profile-summer-two-start-1", "06:30"),
                    end: readTime("tee-profile-summer-two-end-1", "08:30"),
                },
                {
                    start: readTime("tee-profile-summer-two-start-2", "11:30"),
                    end: readTime("tee-profile-summer-two-end-2", "13:30"),
                },
            ],
            one_tee_windows: [
                {
                    start: readTime("tee-profile-summer-one-start", "06:30"),
                    end: readTime("tee-profile-summer-one-end", "13:30"),
                }
            ],
            nine_hole_start: readTime("tee-profile-summer-nine-start", "15:40"),
            nine_hole_end: readTime("tee-profile-summer-nine-end", "17:30"),
        },
        winter: {
            two_tee_windows: [
                {
                    start: readTime("tee-profile-winter-two-start-1", "06:45"),
                    end: readTime("tee-profile-winter-two-end-1", "08:00"),
                },
                {
                    start: readTime("tee-profile-winter-two-start-2", "11:00"),
                    end: readTime("tee-profile-winter-two-end-2", "13:00"),
                },
            ],
            one_tee_windows: [
                {
                    start: readTime("tee-profile-winter-one-start", "06:45"),
                    end: readTime("tee-profile-winter-one-end", "13:00"),
                }
            ],
            nine_hole_start: readTime("tee-profile-winter-nine-start", "15:15"),
            nine_hole_end: readTime("tee-profile-winter-nine-end", "16:45"),
        }
    };
    return normalizeTeeProfile(draft);
}

async function loadTeeProfileSettings(options = {}) {
    const silent = Boolean(options?.silent);
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/api/admin/tee-sheet-profile`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            teeSheetProfile = normalizeTeeProfile(defaultTeeProfile());
            applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || localTodayYMD());
            if (!silent) {
                const statusEl = document.getElementById("tee-profile-status");
                if (statusEl) statusEl.textContent = "Using default profile";
            }
            return;
        }
        const data = await res.json();
        writeTeeProfileToForm(data?.profile || defaultTeeProfile());
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || localTodayYMD());
    } catch (error) {
        teeSheetProfile = normalizeTeeProfile(defaultTeeProfile());
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || localTodayYMD());
        if (!silent) {
            console.error("Failed to load tee profile settings:", error);
            const statusEl = document.getElementById("tee-profile-status");
            if (statusEl) statusEl.textContent = "Load failed, using defaults";
        }
    }
}

async function saveTeeProfileSettings() {
    const token = localStorage.getItem("token");
    const statusEl = document.getElementById("tee-profile-status");
    const profile = readTeeProfileFromForm();

    try {
        if (statusEl) statusEl.textContent = "Saving...";
        const res = await fetch(`${API_BASE}/api/admin/tee-sheet-profile`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ profile })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            if (statusEl) statusEl.textContent = err?.detail || "Save failed";
            return;
        }
        const data = await res.json();
        writeTeeProfileToForm(data?.profile || profile);
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || localTodayYMD());
        if (statusEl) {
            statusEl.textContent = "Saved";
            setTimeout(() => { statusEl.textContent = ""; }, 2000);
        }
        toastSuccess("Tee schedule updated");
    } catch (error) {
        console.error("Failed to save tee profile settings:", error);
        if (statusEl) statusEl.textContent = "Save failed";
    }
}

async function loadCloseStatus() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date").value;
    if (!dateInput) return;

    try {
        const res = await fetch(`${API_BASE}/cashbook/close-status?summary_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        updateCloseoutUI(data);
    } catch (error) {
        console.error("Failed to load close status:", error);
    }
}

function updateCloseoutUI(data) {
    const pill = document.getElementById("day-close-pill");
    const meta = document.getElementById("day-close-meta");
    const closeBtn = document.getElementById("close-day-btn");
    const reopenBtn = document.getElementById("reopen-day-btn");
    if (!pill || !meta || !closeBtn || !reopenBtn) return;

    if (data && data.is_closed) {
        pill.textContent = "Closed";
        pill.className = "status-pill closed";
        meta.textContent = data.closed_at ? `Closed at ${formatDateTimeDMY(data.closed_at)}` : "Closed";
        closeBtn.disabled = true;
        reopenBtn.disabled = false;
    } else if (data && data.status === "reopened") {
        pill.textContent = "Reopened";
        pill.className = "status-pill reopened";
        meta.textContent = "Reopened for edits";
        closeBtn.disabled = false;
        reopenBtn.disabled = true;
    } else {
        pill.textContent = "Open";
        pill.className = "status-pill open";
        meta.textContent = "Not closed yet";
        closeBtn.disabled = false;
        reopenBtn.disabled = true;
    }

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) {
        exportBtn.disabled = !cashbookHasRecords;
    }
    updateProShopExportButtonState();
}

async function closeDayCashbook() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date").value;
    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    if (!confirm(`Close the day for ${dateInput}? This will lock bookings for that date.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cashbook/close-day?close_date=${dateInput}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error: " + (error.detail || "Failed to close day"));
            return;
        }

        await response.json();
        loadCloseStatus();

        let exportedAny = false;
        if (cashbookHasRecords) {
            exportedAny = true;
            await exportCashbookToCSV();
        }
        if (proShopCashbookHasRecords) {
            exportedAny = true;
            await exportProShopCashbookToCSV();
        }
        if (!exportedAny) {
            alert("Day closed. No payments to export.");
        }
    } catch (error) {
        console.error("Failed to close day:", error);
        alert("Failed to close day");
    }
}

async function reopenDayCashbook() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("cashbook-date").value;
    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    if (!confirm(`Reopen ${dateInput}? This will unlock edits for that day.`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cashbook/reopen-day?reopen_date=${dateInput}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error: " + (error.detail || "Failed to reopen day"));
            return;
        }

        await response.json();
        loadCloseStatus();
    } catch (error) {
        console.error("Failed to reopen day:", error);
        alert("Failed to reopen day");
    }
}
