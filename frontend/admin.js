// Admin Dashboard JavaScript

const API_BASE = window.location.origin;
let currentUserRole = null;
let currentPage = 1;
let currentPlayersPage = 1;
let currentLedgerPage = 1;
let peopleView = "members"; // members | guests | staff
let guestTypeFilter = "all"; // all | affiliated | non_affiliated
let selectedTee = "all";
let selectedHolesView = "18";
let bookingPeriod = "day";
let bookingDateBasis = "created";
let bookingSort = "created_desc";
let ledgerPeriod = "day";
let ledgerExportFilter = "all";
let revenuePeriod = "day"; // day | wtd | mtd | ytd
let revenueStreamFocus = "all";
let golfFeesCache = [];
let cashbookHasRecords = false;
let currentBookingDetail = null;
let cachedPastelLayout = null;
let cachedPastelMappings = null;
let accountingSetupListenersInitialized = false;
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
let authFetchInstalled = false;
let currentMemberDetail = null;
let dashboardStreamView = "all";
let dashboardDataCache = null;
let dashboardStreamPreset = "all";
let dashboardMenuContext = "main";
let dashboardPeriodView = "day";
let revenueImportSettingsCache = {};
let proShopProductsCache = [];
let proShopCart = [];
let peopleSort = "recent_activity";
let proShopStockFilter = "all";
let proShopCategoryFilter = "all";
let proShopSalesWindowDays = 30;
const operationPageState = {
    pub: "week",
    bowls: "week",
    other: "week",
};
let teeSheetProfile = null;

function installAuthFetch() {
    if (authFetchInstalled) return;
    authFetchInstalled = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init) => {
        const token = localStorage.getItem("token");
        if (!token) return originalFetch(input, init);

        let url = "";
        if (typeof input === "string") url = input;
        else if (input && typeof input.url === "string") url = input.url;

        try {
            const resolved = new URL(url, window.location.origin);
            if (resolved.origin !== window.location.origin) {
                return originalFetch(input, init);
            }
        } catch {
            // If URL parsing fails, fall back to raw fetch.
            return originalFetch(input, init);
        }

        const nextInit = init ? { ...init } : {};
        const headers = new Headers(nextInit.headers || {});
        if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        const activeClubId = localStorage.getItem("active_club_id");
        if (currentUserRole === "super_admin" && activeClubId && !headers.has("X-Club-Id")) {
            headers.set("X-Club-Id", String(activeClubId));
        }

        nextInit.headers = headers;
        return originalFetch(input, nextInit);
    };
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

    setupNavigation();
    setupGlobalQuickControls();
    setupDashboardStreamFilters();
    setupDashboardPeriodFilters();
    setupAiAssistantActions();
    setupCloseModals();
    updateTime();
    setInterval(updateTime, 1000);
    refreshNavGroupVisibility();

    // Operational pages (admin + club_staff)
    setupBookingFilters();
    setupTeeSheetFilters();
    setupTeeManageMenu();
    setupTeeBookingModal();
    setupPeopleFilters();
    setupOperationWorkbenchControls();
    await loadTeeProfileSettings({ silent: true });

    if (role === "admin" || role === "super_admin") {
        setupLedgerFilters();
        setupRevenueFilters();
        setupRevenueImport();
        loadBookingWindowSettings();
        loadDashboard();
    } else {
        applyStaffMode(role);
    }
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

function statusToClass(status) {
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
    return String(status || "").replaceAll("_", " ");
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

function applyStaffMode(role) {
    if (role !== "club_staff") return;

    // Limit sidebar to operational pages for pro shop staff.
    const allowed = new Set(["bookings", "tee-times", "players", "pro-shop"]);
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

    // Default to the tee sheet for staff.
    const teeNav = document.querySelector('.nav-item[data-page="tee-times"]');
    if (teeNav) {
        document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
        teeNav.classList.add("active");
        showPage("tee-times");
        loadTeeTimes();
    }

    // Hide admin-only import actions for staff (admin can still use them).
    document.querySelectorAll('[data-tee-action-root] [data-action="import-members"], #tee-manage-menu [data-action="import-members"]').forEach(el => {
        el.style.display = "none";
    });
    document.querySelectorAll('button[onclick="openImportLog()"]').forEach(el => {
        el.style.display = "none";
    });

    const quickNav = document.getElementById("quick-nav");
    if (quickNav instanceof HTMLSelectElement) {
        Array.from(quickNav.querySelectorAll("option")).forEach(option => {
            const raw = String(option.value || "");
            if (!raw) return;
            const page = raw.split("|")[0];
            if (!allowed.has(page)) {
                option.remove();
            }
        });
    }

    refreshNavGroupVisibility();
}

async function initSuperAdminContext() {
    const nav = document.getElementById("nav-super-admin");
    if (nav) nav.style.display = "";
    refreshNavGroupVisibility();

    const clubSwitcher = document.getElementById("club-switcher");
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
        alert("No active clubs found. Create a club first.");
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

    if (clubSwitcher) {
        clubSwitcher.innerHTML = optionHtml;
        clubSwitcher.value = String(activeClubId);
        clubSwitcher.style.display = "inline-block";
        clubSwitcher.onchange = () => {
            localStorage.setItem("active_club_id", String(clubSwitcher.value));
            window.location.reload();
        };
    }

    if (staffClub) {
        staffClub.innerHTML = optionHtml;
        staffClub.value = String(activeClubId);
    }
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
                <td>${u.club_id ?? ""}</td>
            </tr>`
        )).join("");
    } catch (e) {
        console.error("Failed to load staff:", e);
        body.innerHTML = `<tr><td colspan="5">Failed to load staff</td></tr>`;
    }
}

// Navigation
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
            if (!page) return;

            if (page === "dashboard") {
                const nextStream = streamPreset || "all";
                dashboardMenuContext = nextStream === "all" ? "main" : "operation";
                setDashboardStreamViewState(nextStream, { persist: true, source: "sidebar" });
            }

            // Update active nav
            document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
            item.classList.add("active");

            // Show page
            showPage(page);

            // Load page data
            switch (page) {
                case "dashboard":
                    loadDashboard();
                    break;
                case "bookings":
                    loadBookings();
                    break;
                case "players":
                    loadPlayers();
                    break;
                case "revenue":
                    loadRevenue();
                    break;
                case "operations-config":
                    loadOpsImportSettings();
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
                    break;
                case "pub-ops":
                    loadOperationWorkbench("pub");
                    break;
                case "bowls-ops":
                    loadOperationWorkbench("bowls");
                    break;
                case "other-ops":
                    loadOperationWorkbench("other");
                    break;
            }
        });
    });
}

function applyAdminDensity(value) {
    const mode = String(value || "comfortable").toLowerCase() === "compact" ? "compact" : "comfortable";
    document.body.classList.toggle("compact-density", mode === "compact");
    localStorage.setItem("admin_density", mode);
}

function applyQuickNavigationValue(raw) {
    const value = String(raw || "").trim();
    if (!value) return false;
    const [pageName, stream] = value.split("|");
    if (pageName === "dashboard") {
        const nextStream = String(stream || "all").toLowerCase();
        dashboardMenuContext = nextStream === "all" ? "main" : "operation";
        setDashboardStreamViewState(nextStream, { persist: true, source: "sidebar" });
        const nav = document.querySelector(`.nav-item[data-page="dashboard"][data-dashboard-stream="${nextStream}"]`) || document.querySelector('.nav-item[data-page="dashboard"]');
        if (nav instanceof HTMLElement) {
            nav.click();
            return true;
        }
        showPage("dashboard");
        loadDashboard();
        return true;
    }
    navigateToAdminPage(pageName);
    return true;
}

function setupGlobalQuickControls() {
    const densitySelect = document.getElementById("density-switcher");
    const quickNavSelect = document.getElementById("quick-nav");

    if (densitySelect instanceof HTMLSelectElement) {
        const storedDensity = String(localStorage.getItem("admin_density") || "comfortable").toLowerCase();
        densitySelect.value = storedDensity === "compact" ? "compact" : "comfortable";
        applyAdminDensity(densitySelect.value);
        densitySelect.addEventListener("change", () => {
            applyAdminDensity(densitySelect.value);
        });
    } else {
        applyAdminDensity(localStorage.getItem("admin_density") || "comfortable");
    }

    if (!(quickNavSelect instanceof HTMLSelectElement)) return;
    quickNavSelect.addEventListener("change", () => {
        const raw = String(quickNavSelect.value || "").trim();
        if (!raw) return;
        applyQuickNavigationValue(raw);
        quickNavSelect.value = "";
    });
}

function showPage(pageName) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.getElementById(pageName).classList.add("active");
    currentActivePage = pageName;

    // Update title
    const titles = {
        dashboard: "Dashboard",
        "operations-config": "Operations Config",
        bookings: "Bookings",
        players: "People",
        "pro-shop": "Pro Shop Sales",
        revenue: "Revenue Analytics",
        "tee-times": "Tee Sheet",
        ledger: "Ledger",
        cashbook: "Cashbook Export",
        "super-admin": "Super Admin",
        "pub-ops": "Pub Operations",
        "bowls-ops": "Bowls Operations",
        "other-ops": "Other Operations",
    };
    document.getElementById("page-title").textContent = titles[pageName] || pageName;

    if (pageName === "dashboard" && dashboardDataCache) {
        applyDashboardEntryVisibility();
        applyDashboardStreamButtonState();
        applyDashboardPeriodButtonState();
        applyDashboardStreamView(dashboardDataCache);
    }

    if (pageName === "pub-ops") loadOperationWorkbench("pub");
    if (pageName === "bowls-ops") loadOperationWorkbench("bowls");
    if (pageName === "other-ops") loadOperationWorkbench("other");
}

function navigateToAdminPage(pageName) {
    const target = String(pageName || "").trim();
    if (!target) return;
    const navItem = document.querySelector(`.nav-item[data-page="${target}"]`);
    if (navItem instanceof HTMLElement) {
        navItem.click();
        return;
    }

    showPage(target);
    switch (target) {
        case "dashboard":
            loadDashboard();
            break;
        case "bookings":
            loadBookings();
            break;
        case "players":
            loadPlayers();
            break;
        case "revenue":
            loadRevenue();
            break;
        case "operations-config":
            loadOpsImportSettings();
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
        case "pub-ops":
            loadOperationWorkbench("pub");
            break;
        case "bowls-ops":
            loadOperationWorkbench("bowls");
            break;
        case "other-ops":
            loadOperationWorkbench("other");
            break;
        default:
            break;
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
        navigateToAdminPage(page);
    });
}

function setupDashboardStreamFilters() {
    const buttons = document.querySelectorAll(".dashboard-stream-btn");
    if (!buttons.length) return;
    const valid = new Set(["all", "golf", "pro_shop", "pub", "bowls", "other"]);
    const stored = String(localStorage.getItem("dashboard_stream_view") || "").toLowerCase();
    setDashboardStreamViewState(valid.has(stored) ? stored : "all", { persist: false, source: "stored" });

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
    const valid = new Set(["all", "golf", "pro_shop", "pub", "bowls", "other"]);
    const next = valid.has(String(stream || "").toLowerCase()) ? String(stream || "").toLowerCase() : "all";
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

    const key = String(streamKey || "all").toLowerCase();
    const selected = streams[key] || fallback[key] || fallback.all;
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

function buildAllOperationsMixHighlights(data, periodKey, periodLabel) {
    const streamKeys = [
        { key: "golf", label: "Golf" },
        { key: "pro_shop", label: "Pro Shop" },
        { key: "pub", label: "Pub" },
        { key: "bowls", label: "Bowls" },
        { key: "other", label: "Other" },
    ];
    const rows = streamKeys.map(entry => {
        const period = data?.revenue_streams?.[entry.key]?.periods?.[periodKey];
        const revenue = safeNumber(period?.revenue);
        const transactions = safeNumber(period?.transactions);
        return {
            ...entry,
            revenue,
            transactions,
        };
    });
    const totalRevenue = rows.reduce((sum, row) => sum + safeNumber(row.revenue), 0);
    return rows.map(row => ({
        name: `${row.label} Revenue Mix (${periodLabel})`,
        current: totalRevenue > 0 ? (safeNumber(row.revenue) / totalRevenue) : 0,
        format: "percent",
        context: `${formatInteger(row.transactions)} transactions | ${formatCurrencyZAR(row.revenue)}`,
    }));
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

    titleEl.textContent = `${label} Highlights (${periodMeta.label})`;
    noteEl.textContent = isAllStream
        ? `Revenue mix by operation for the selected ${periodMeta.label.toLowerCase()} window.`
        : (row?.note ? String(row.note) : "No additional highlights available yet.");
    if (metricColEl) metricColEl.textContent = "Metric";
    if (currentColEl) currentColEl.textContent = isAllStream ? `${periodMeta.label} Current` : "Current";
    if (contextColEl) contextColEl.textContent = "Context";

    const highlights = isAllStream
        ? buildAllOperationsMixHighlights(data, periodMeta.key, periodMeta.label)
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

    if (stream === "golf") {
        return [
            { label: `${periodLabel} Golf Revenue`, value: revenue, format: "currency" },
            { label: `${periodLabel} Paid Rounds`, value: benchmark.rounds_actual, format: "number" },
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
        { label: `${periodLabel} Revenue`, value: revenue, format: "currency" },
        { label: `${periodLabel} Transactions`, value: transactions, format: "number" },
        { label: `${periodLabel} Revenue Target`, value: targetRevenueAttainment, format: "percent" },
        { label: `${periodLabel} Rounds Target`, value: targetRoundsAttainment, format: "percent" },
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

    if (stream === "golf") {
        const counts = resolveBookingStatusCounts(data, periodMeta.key);
        const paidRoundsFromStatus = safeNumber(counts.checked_in) + safeNumber(counts.completed);
        titleEl.textContent = `${periodLabel} Booking Status`;
        bookingStatusEl.style.display = "";
        focusEl.style.display = "none";
        noteEl.style.display = "";
        noteEl.textContent = `${periodLabel} paid rounds = Checked In + Completed (${formatInteger(paidRoundsFromStatus)}).`;
        return;
    }

    bookingStatusEl.style.display = "none";
    focusEl.style.display = "";
    noteEl.style.display = "";

    const rows = [];
    let title = "Operational Focus";
    let note = `${periodLabel} operational metrics for this stream.`;

    if (stream === "all") {
        title = `${periodLabel} Operations Mix`;
        note = "Revenue mix by operation for the selected performance window.";
        const streamKeys = [
            { key: "golf", label: "Golf" },
            { key: "pro_shop", label: "Pro Shop" },
            { key: "pub", label: "Pub" },
            { key: "bowls", label: "Bowls" },
            { key: "other", label: "Other" },
        ];
        const amounts = streamKeys.map(entry => ({
            ...entry,
            amount: safeNumber(data?.revenue_streams?.[entry.key]?.periods?.[periodMeta.key]?.revenue),
        }));
        const total = amounts.reduce((sum, entry) => sum + safeNumber(entry.amount), 0);
        for (const entry of amounts) {
            const share = total > 0 ? (safeNumber(entry.amount) / total) : 0;
            rows.push({
                label: entry.label,
                value: `${formatCurrencyZAR(entry.amount)} (${formatPct(share)})`,
            });
        }
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
            noteEl.textContent = `Showing combined operations view on ${selectedPeriod.label.toLowerCase()} window. ${trendText}.`;
        } else if (fromSidebarPreset) {
            noteEl.textContent = `Loaded ${label} dashboard preset on ${selectedPeriod.label.toLowerCase()} window. ${trendText}.`;
        } else if (selected.key === "golf") {
            noteEl.textContent = `Golf view uses occupancy, paid rounds, and no-show control. ${trendText}.`;
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

    const freshnessCard = document.getElementById("dashboard-freshness-card");
    if (freshnessCard) {
        freshnessCard.style.display = selected.key === "all" ? "" : "none";
    }

    if (currentActivePage === "dashboard") {
        const titleEl = document.getElementById("page-title");
        if (titleEl) {
            titleEl.textContent = selected.key === "all" ? "Dashboard" : `${label} Dashboard`;
        }
    }
}

function setupOperationWorkbenchControls() {
    const configs = [
        { stream: "pub", periodId: "pub-ops-period", actionId: "pub-ops-action" },
        { stream: "bowls", periodId: "bowls-ops-period", actionId: "bowls-ops-action" },
        { stream: "other", periodId: "other-ops-period", actionId: "other-ops-action" },
    ];

    configs.forEach(({ stream, periodId, actionId }) => {
        const periodSelect = document.getElementById(periodId);
        const actionSelect = document.getElementById(actionId);

        if (periodSelect instanceof HTMLSelectElement) {
            const current = operationPageState[stream] || "week";
            periodSelect.value = current;
            periodSelect.addEventListener("change", () => {
                operationPageState[stream] = String(periodSelect.value || "week").toLowerCase();
                loadOperationWorkbench(stream);
            });
        }

        if (actionSelect instanceof HTMLSelectElement) {
            actionSelect.addEventListener("change", () => {
                const value = String(actionSelect.value || "").trim();
                if (!value) return;
                applyQuickNavigationValue(value);
                actionSelect.value = "";
            });
        }
    });
}

function formatWorkbenchHighlight(item) {
    const current = (item && Object.prototype.hasOwnProperty.call(item, "current"))
        ? formatDashboardMetric({ value: item.current, format: item?.format || "number" })
        : (item && Object.prototype.hasOwnProperty.call(item, "value"))
            ? formatDashboardMetric({ value: item.value, format: item?.format || "number" })
            : "-";
    const context = item?.context ? ` | ${String(item.context)}` : "";
    return `${current}${context}`;
}

function renderOperationWorkbenchRows(elementId, rows = []) {
    const root = document.getElementById(elementId);
    if (!(root instanceof HTMLElement)) return;
    if (!rows.length) {
        root.innerHTML = `
            <div class="today-stat">
                <span>No data available</span>
                <span class="stat-number">-</span>
            </div>
        `;
        return;
    }
    root.innerHTML = rows.map((row) => `
        <div class="today-stat">
            <span>${escapeHtml(String(row.label || "Item"))}</span>
            <span class="stat-number">${escapeHtml(String(row.value || "-"))}</span>
        </div>
    `).join("");
}

async function loadOperationWorkbench(streamKey) {
    const stream = String(streamKey || "").toLowerCase();
    if (!["pub", "bowls", "other"].includes(stream)) return;

    if (!dashboardDataCache) {
        try {
            const data = await fetchJson(`${API_BASE}/api/admin/dashboard`);
            dashboardDataCache = data;
        } catch (error) {
            console.error(`Failed to load ${stream} workbench:`, error);
            return;
        }
    }

    const data = dashboardDataCache || {};
    const periodKey = operationPageState[stream] || "week";
    const selected = resolveDashboardStreamMetrics(data, stream);
    const selectedPeriod = resolveDashboardSelectedPeriod(selected, periodKey);
    const benchmark = resolveDashboardTargetBenchmark(data, selectedPeriod.key);
    const targetContribution = benchmark.revenue_target > 0 ? (safeNumber(selectedPeriod.revenue) / benchmark.revenue_target) : null;
    const prefix = `${stream}-ops`;

    const revenueEl = document.getElementById(`${prefix}-revenue`);
    const txEl = document.getElementById(`${prefix}-transactions`);
    const avgTicketEl = document.getElementById(`${prefix}-avg-ticket`);
    const targetEl = document.getElementById(`${prefix}-target`);
    const noteEl = document.getElementById(`${prefix}-note`);

    if (revenueEl) revenueEl.textContent = formatCurrencyZAR(selectedPeriod.revenue);
    if (txEl) txEl.textContent = formatInteger(selectedPeriod.transactions);
    if (avgTicketEl) avgTicketEl.textContent = formatCurrencyZAR(selectedPeriod.avg_ticket);
    if (targetEl) targetEl.textContent = targetContribution == null ? "-" : formatPct(targetContribution);
    if (noteEl) {
        noteEl.textContent = `${selectedPeriod.label} operational snapshot for ${selected.label}. Use this page for stream-level execution and run imports from Operations Config.`;
    }

    const streamInsight = data?.operation_insights?.[stream] || {};
    const highlights = Array.isArray(streamInsight?.highlights) ? streamInsight.highlights : [];
    const focusRows = [
        { label: `${selectedPeriod.label} Revenue`, value: formatCurrencyZAR(selectedPeriod.revenue) },
        { label: `${selectedPeriod.label} Transactions`, value: formatInteger(selectedPeriod.transactions) },
        { label: `Avg Ticket (${selectedPeriod.label})`, value: formatCurrencyZAR(selectedPeriod.avg_ticket) },
        ...highlights.slice(0, 2).map(item => ({ label: String(item?.name || "Highlight"), value: formatWorkbenchHighlight(item) })),
    ];
    renderOperationWorkbenchRows(`${prefix}-focus`, focusRows);

    const streamRows = Array.isArray(data?.ai_assistant?.import_copilot?.streams) ? data.ai_assistant.import_copilot.streams : [];
    const importRow = streamRows.find(row => String(row?.stream || "").toLowerCase() === stream) || null;
    const importRows = importRow
        ? [
            { label: "Import Health", value: String(importRow.health || "warning").toUpperCase() },
            { label: "Rows (30d)", value: formatInteger(importRow.rows_total_30d) },
            { label: "Fail Rate (30d)", value: formatPct(safeNumber(importRow.failure_rate_30d)) },
            { label: "Last Import", value: importRow.last_import_at ? formatDateTimeDMY(importRow.last_import_at) : "No import yet" },
            { label: "Next Action", value: String(importRow.recommendation || "Review operation mapping in Operations Config") },
        ]
        : [
            { label: "Import Health", value: "NO PROFILE" },
            { label: "Next Action", value: "Open Operations Config and save import profile for this stream." },
        ];
    renderOperationWorkbenchRows(`${prefix}-import`, importRows);
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
        actionBtn.textContent = actionLabel;
    } else {
        actionBtn.style.display = "none";
        actionBtn.dataset.aiNav = "";
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
            actionPage: "ledger",
            actionLabel: "Open Ledger",
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
        const summary = (importCopilot && typeof importCopilot.summary === "object") ? importCopilot.summary : {};
        if (targetStream === "all") {
            const configured = safeNumber(summary?.configured_streams);
            const totalStreams = safeNumber(summary?.total_streams || 5);
            const staleStreams = safeNumber(summary?.stale_streams);
            const highFailStreams = safeNumber(summary?.high_failure_streams);
            const status = highFailStreams > 0 ? "critical" : (staleStreams > 0 ? "warning" : "healthy");
            const orderedRows = [...importRows].sort((a, b) => {
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
                actionLabel: "Open Operations Config",
            };
        }

        const row = importRows.find(r => String(r?.stream || "").toLowerCase() === targetStream) || null;
        if (!row) return null;
        const include = ["pub", "bowls", "other"].includes(targetStream)
            || String(row?.health || "").toLowerCase() !== "healthy"
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
        const configured = safeNumber(importCopilot?.summary?.configured_streams);
        const totalStreams = safeNumber(importCopilot?.summary?.total_streams || 5);
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
async function loadDashboard() {
    const token = localStorage.getItem("token");

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        document.getElementById("total-bookings").textContent = formatInteger(data.total_bookings);
        document.getElementById("total-members").textContent = formatInteger(data.total_members ?? data.total_players);
        document.getElementById("completed-rounds").textContent = formatInteger(data.completed_rounds);
        document.getElementById("today-bookings").textContent = formatInteger(data.today_bookings);
        dashboardDataCache = data;
        applyDashboardStreamView(data);
        if (currentActivePage === "pub-ops") loadOperationWorkbench("pub");
        if (currentActivePage === "bowls-ops") loadOperationWorkbench("bowls");
        if (currentActivePage === "other-ops") loadOperationWorkbench("other");

        // Import freshness (parallel mirror run)
        const lastBookingsEl = document.getElementById("last-bookings-import");
        const lastRevenueEl = document.getElementById("last-revenue-import");
        const hintEl = document.getElementById("import-log-hint");
        const lastBookings = data?.imports?.bookings || null;
        const lastRevenue = data?.imports?.revenue || null;
        if (lastBookingsEl) lastBookingsEl.textContent = lastBookings ? formatDateTimeDMY(lastBookings) : "—";
        if (lastRevenueEl) lastRevenueEl.textContent = lastRevenue ? formatDateTimeDMY(lastRevenue) : "—";
        if (hintEl) hintEl.textContent = "Use Tee Sheet > Manage Tee Sheet for bookings imports, General > Operations Config for non-booking revenue imports, and Pro Shop Sales for direct checkout.";

        renderTargetsTable(data.targets);

        // Revenue chart
        loadRevenueChart();
    } catch (error) {
        console.error("Failed to load dashboard:", error);
        toastError(error?.message || "Dashboard failed to load");
    }
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

async function loadRevenueChart() {
    const token = localStorage.getItem("token");

    try {
        const data = await fetchJson(`${API_BASE}/api/admin/revenue?days=30`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const series = mergeRevenueSeries(data.daily_revenue, data.daily_paid_revenue, data.daily_other_revenue);
        const dailyRequired = data?.daily_revenue_required;
        const dailyRequiredValue = dailyRequired == null ? null : safeNumber(dailyRequired);

        const ctx = document.getElementById("revenueChart");
        if (window.revenueChartInstance && typeof window.revenueChartInstance.destroy === "function") {
            window.revenueChartInstance.destroy();
        }

        const targetDataset = dailyRequiredValue == null ? null : {
            label: "Target (Required / Day)",
            data: series.labels.map(() => dailyRequiredValue),
            borderColor: "#e53935",
            backgroundColor: "rgba(229, 57, 53, 0.08)",
            borderDash: [6, 6],
            pointRadius: 0,
            tension: 0
        };

        window.revenueChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: series.labels.map(d => formatYMDToDMY(d)),
                datasets: [
                    {
                        label: "Booked Revenue (R)",
                        data: series.booked,
                        borderColor: "#064f32",
                        backgroundColor: "rgba(6, 79, 50, 0.1)",
                        tension: 0.4
                    },
                    {
                        label: "Paid Revenue (R)",
                        data: series.paid,
                        borderColor: "#1e88e5",
                        backgroundColor: "rgba(30, 136, 229, 0.1)",
                        tension: 0.4
                    },
                    ...(targetDataset ? [targetDataset] : [])
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: val => "R" + formatNumber(val, 0, 0) }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Failed to load revenue chart:", error);
    }
}

// Bookings
function dateToYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
    const dateInput = document.getElementById("bookings-date");
    const dateBasisSelect = document.getElementById("bookings-date-basis");
    const sortSelect = document.getElementById("bookings-sort");
    const periodButtons = document.querySelectorAll(".booking-period-btn");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    if (dateBasisSelect instanceof HTMLSelectElement) {
        bookingDateBasis = String(dateBasisSelect.value || "created").toLowerCase();
    }
    if (sortSelect instanceof HTMLSelectElement) {
        bookingSort = String(sortSelect.value || "created_desc").toLowerCase();
    }

    statusSelect?.addEventListener("change", () => {
        currentPage = 1;
        loadBookings();
    });

    dateInput?.addEventListener("change", () => {
        currentPage = 1;
        loadBookings();
    });

    dateBasisSelect?.addEventListener("change", () => {
        bookingDateBasis = String(dateBasisSelect.value || "created").toLowerCase();
        currentPage = 1;
        loadBookings();
    });

    sortSelect?.addEventListener("change", () => {
        bookingSort = String(sortSelect.value || "created_desc").toLowerCase();
        currentPage = 1;
        loadBookings();
    });

    periodButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            periodButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            bookingPeriod = btn.dataset.period || "day";
            currentPage = 1;
            loadBookings();
        });
    });
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

    try {
        let url = `${API_BASE}/api/admin/bookings?skip=${(currentPage - 1) * 10}&limit=10`;
        url += `&date_basis=${encodeURIComponent(bookingDateBasis || "created")}`;
        url += `&sort=${encodeURIComponent(bookingSort || "created_desc")}`;
        if (status) url += `&status=${status}`;

        const range = buildBookingRange(dateStr, bookingPeriod);
        if (range) {
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }

        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const table = document.getElementById("bookings-table");
        table.innerHTML = data.bookings.map(b => `
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
                <td><span class="status-badge ${statusToClass(b.status)}">${statusToLabel(b.status)}</span></td>
                <td>${b.tee_time ? formatTimeDateDMY(b.tee_time) : "-"}</td>
                <td>${b.has_round ? (b.round_completed ? "Closed" : "Open") : "Not started"}</td>
                <td>${formatDateDMY(b.created_at)}</td>
                <td><button class="btn-view" onclick="viewBookingDetail(${b.id})">View</button></td>
            </tr>
        `).join("");

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
                        <span class="detail-label">Club card</span>
                        <span class="detail-value">${displayValue(booking.club_card, "N/A")}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Member ID</span>
                        <span class="detail-value">${booking.member_id ? escapeHtml(String(booking.member_id)) : "—"}</span>
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
	                    <span class="detail-label">Holes</span>
	                    <span class="detail-value">${booking.holes ? escapeHtml(String(booking.holes)) : "—"}</span>
	                    </div>
	                    <div class="detail-row">
	                    <span class="detail-label">Prepaid</span>
	                    <span class="detail-value">${booking.prepaid === true ? "Yes" : (booking.prepaid === false ? "No" : "—")}</span>
	                    </div>
                    <div class="detail-row">
                    <span class="detail-label">Requirements</span>
                    <span class="detail-value">${renderReqPills({ cart: booking?.requirements?.cart, push_cart: booking?.requirements?.push_cart, caddy: booking?.requirements?.caddy })}</span>
                    </div>
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
	                        <button class="btn-edit" onclick="openEditBookingPriceModal(${bookingId})">Edit Price</button>
	                    </div>
	                    ` : ""}
                    <div class="detail-row" style="margin-top: 12px;">
                        <span class="detail-label">Created</span>
                        <span class="detail-value">${booking.created_at ? formatDateTimeDMY(booking.created_at) : "—"}</span>
                    </div>
                </div>

                <div class="booking-detail-card">
                    <h3>Round</h3>
                    ${booking.round ? `
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">${booking.round.closed ? "Closed ✓" : "Open"}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Hcp SA ID</span>
                            <span class="detail-value">${displayValue(booking.round.handicap_sa_round_id, "—")}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Synced</span>
                            <span class="detail-value">${booking.round.handicap_synced ? "✓" : "—"}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Scores</span>
                            <span class="detail-value">${booking.round.scores ? "✓" : "—"}</span>
                        </div>
                        ${booking.round.scores ? `
                            <details style="margin-top: 10px;">
                                <summary style="cursor:pointer; font-weight:700; color:#0a6b47;">View scores</summary>
                                <pre style="white-space:pre-wrap; margin-top:10px;">${escapeHtml(String(booking.round.scores))}</pre>
                            </details>
                        ` : ""}
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

                <div class="booking-detail-card">
                    <h3>Ledger</h3>
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
                            ${ledgerEntries.length ? `<button class="btn-secondary btn-small" type="button" onclick="saveBookingPaymentMethod(${bookingId})">Save</button>` : ""}
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Debtor account</span>
                        <span class="detail-value">
                            <input id="booking-account-code" type="text" value="${escapeHtml(String(booking.club_card || ""))}" placeholder="e.g. 1100/015" style="min-width: 120px;" />
                            <button class="btn-secondary btn-small" type="button" onclick="saveBookingAccountCode(${bookingId})">Save</button>
                        </span>
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
                            <span class="detail-value">${isPaid ? "Missing entry" : "Unpaid"}</span>
                        </div>
                    `}
                </div>
            </div>

            <div class="booking-detail-actions">
                <button class="btn-success" onclick="adminCheckIn(${bookingId})" ${disableCheckin ? "disabled" : ""}>${checkinLabel}</button>
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'completed')" ${disableComplete ? "disabled" : ""}>Mark Completed</button>
                ${allowAdminOnly ? `<button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'booked')" ${disableReopen ? "disabled" : ""}>Reopen</button>` : ""}
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'no_show')" ${disableNoShow ? "disabled" : ""}>No-show</button>
                <button class="btn-cancel" onclick="adminSetStatus(${bookingId}, 'cancelled')" ${disableCancel ? "disabled" : ""}>Cancel</button>
                ${allowAdminOnly ? `<button class="btn-cancel" onclick="adminDeleteBooking(${bookingId})">Remove</button>` : ""}
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
    const title = document.getElementById("people-title");
    const searchInput = document.getElementById("people-search");
    const guestFilter = document.getElementById("guest-type-filter");
    const sortSelect = document.getElementById("people-sort");
    const addBtn = document.getElementById("people-add-btn");
    if (!buttons.length) return;
    if (sortSelect instanceof HTMLSelectElement) {
        peopleSort = String(sortSelect.value || "recent_activity").toLowerCase();
    }

    const applyPeopleSortOptions = () => {
        if (!(sortSelect instanceof HTMLSelectElement)) return;
        const optionsForView = peopleView === "staff"
            ? [
                { value: "name_asc", label: "Name A-Z" },
                { value: "name_desc", label: "Name Z-A" },
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

    const updateTitle = () => {
        if (!title) return;
        title.textContent = peopleView === "members" ? "Members" : peopleView === "guests" ? "Guests" : "Staff";
        if (guestFilter) {
            guestFilter.style.display = peopleView === "guests" ? "" : "none";
        }
        if (addBtn) {
            const canEdit = currentUserRole === "admin" || currentUserRole === "super_admin";
            if (!canEdit) {
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
        if (sortSelect) {
            sortSelect.style.display = "";
        }
        applyPeopleSortOptions();
    };

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            peopleView = btn.dataset.view || "members";
            currentPlayersPage = 1;

            // Reset horizontal scroll when switching between wide tables (members) and narrow ones (staff).
            const tableWrap = document.querySelector("#players .table-container");
            if (tableWrap) tableWrap.scrollLeft = 0;

            updateTitle();
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

    updateTitle();
}

async function loadPlayers() {
    const token = localStorage.getItem("token");
    const search = document.getElementById("people-search")?.value?.trim();
    const tableHead = document.getElementById("people-table-head");
    const tableBody = document.getElementById("players-table");
    if (!tableHead || !tableBody) return;

    try {
        let url = `${API_BASE}/api/admin/members?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        if (peopleView === "members") {
            url = `${API_BASE}/api/admin/members?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        } else if (peopleView === "guests") {
            url = `${API_BASE}/api/admin/guests?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
            if (guestTypeFilter && guestTypeFilter !== "all") {
                url += `&guest_type=${encodeURIComponent(guestTypeFilter)}`;
            }
        } else if (peopleView === "staff") {
            url = `${API_BASE}/api/admin/staff?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        }
        if (search) url += `&q=${encodeURIComponent(search)}`;
        if (peopleSort) url += `&sort=${encodeURIComponent(peopleSort)}`;

        const data = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });

        if (peopleView === "members") {
            tableHead.innerHTML = `
                <th>Name</th>
                <th>Member #</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Handicap</th>
                <th>Bookings</th>
                <th>Total Spent</th>
                <th>Active</th>
                <th>Last Seen</th>
                <th>Action</th>
            `;

            const members = Array.isArray(data.members) ? data.members : [];
            tableBody.innerHTML = members.map(m => `
                <tr>
                    <td>${escapeHtml(m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim())}</td>
                    <td>${m.member_number ? escapeHtml(m.member_number) : "-"}</td>
                    <td>${m.email ? `<a href="mailto:${encodeURIComponent(String(m.email))}">${escapeHtml(m.email)}</a>` : "-"}</td>
                    <td>${m.phone ? `<a href="tel:${escapeHtml(String(m.phone))}">${escapeHtml(m.phone)}</a>` : "-"}</td>
                    <td>${m.handicap_number ? escapeHtml(m.handicap_number) : "-"}</td>
                    <td>${formatInteger(m.bookings_count || 0)}</td>
                    <td>${formatCurrencyZAR(m.total_spent || 0)}</td>
                    <td>${m.active ? '<span class="pill active">Active</span>' : '<span class="pill inactive">Inactive</span>'}</td>
                    <td>${m.last_seen ? formatDateTimeDMY(m.last_seen) : "-"}</td>
                    <td><button class="btn-view" onclick="viewMemberDetail(${m.id})">View</button></td>
                </tr>
            `).join("");

            if (!members.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align:center; color:#7f8c8d; padding: 18px;">No members found.</td>
                    </tr>
                `;
            }
        } else if (peopleView === "guests") {
            tableHead.innerHTML = `
                <th>Name</th>
                <th>Email</th>
                <th>Handicap</th>
                <th>Bookings</th>
                <th>Total Spent</th>
                <th>Last Seen</th>
            `;

            const guests = Array.isArray(data.guests) ? data.guests : [];
            tableBody.innerHTML = guests.map(g => `
                <tr>
                    <td>${escapeHtml(g.name || "-")}</td>
                    <td>${g.email ? escapeHtml(g.email) : "-"}</td>
                    <td>${g.handicap_number ? escapeHtml(g.handicap_number) : "-"}</td>
                    <td>${formatInteger(g.bookings_count || 0)}</td>
                    <td>${formatCurrencyZAR(g.total_spent || 0)}</td>
                    <td>${g.last_seen ? formatDateTimeDMY(g.last_seen) : "-"}</td>
                </tr>
            `).join("");

            if (!guests.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; color:#7f8c8d; padding: 18px;">No guests found.</td>
                    </tr>
                `;
            }
        } else if (peopleView === "staff") {
            tableHead.innerHTML = `
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Action</th>
            `;

            const staff = Array.isArray(data.staff) ? data.staff : [];
            tableBody.innerHTML = staff.map(s => `
                <tr>
                    <td>${escapeHtml(s.name || "-")}</td>
                    <td>${s.email ? `<a href="mailto:${encodeURIComponent(String(s.email))}">${escapeHtml(s.email)}</a>` : "-"}</td>
                    <td>${escapeHtml(String(s.role || "-"))}</td>
                    <td>${
                        (currentUserRole === "admin" || currentUserRole === "super_admin")
                            ? (String(s.role || "").toLowerCase() === "club_staff"
                                ? `<button class="btn-view" onclick="openStaffEditModal(${s.id})">Edit</button>`
                                : `<span class="muted">Super Admin only</span>`)
                            : ""
                    }</td>
                </tr>
            `).join("");

            if (!staff.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center; color:#7f8c8d; padding: 18px;">No staff found.</td>
                    </tr>
                `;
            }
        } else {
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
        console.error("Failed to load players:", error);
    }
}

async function viewPlayerDetail(playerId) {
    const token = localStorage.getItem("token");

    try {
        const player = await fetchJson(`${API_BASE}/api/admin/players/${playerId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        // Get price info
        const priceInfo = await fetchJson(`${API_BASE}/api/admin/players/${playerId}/price-info`, {
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
                <div class="modal-label">Current Price</div>
                <div class="modal-value">R${priceInfo.current_price ? priceInfo.current_price.toFixed(2) : "N/A"}</div>
                ${currentUserRole === "admin" ? `<button class="btn-edit" onclick="openEditPriceModal(${playerId}, '${player.name}')">Edit Price</button>` : ""}
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

// Edit Player Price Modal
async function openEditPriceModal(playerId, playerName) {
    const token = localStorage.getItem("token");

    try {
        // Get available fee categories
        const response = await fetch(`${API_BASE}/api/admin/fee-categories`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const categories = await response.json();

        const html = `
            <div class="modal-section">
                <h2>Edit Price for ${playerName}</h2>
            </div>
            <div class="modal-section">
                <label>Select Fee Type:</label>
                <select id="fee-category-select" style="width: 100%; padding: 8px; margin: 10px 0;">
                    <option value="">-- Custom Price --</option>
                    ${categories.map(cat => `
                        <option value="${cat.id}">
                            ${cat.description} (R${cat.price.toFixed(2)})
                        </option>
                    `).join("")}
                </select>
            </div>
            <div class="modal-section">
                <label>Or Enter Custom Price (R):</label>
                <input type="number" id="custom-price-input" placeholder="Enter custom price" step="0.01" min="0" style="width: 100%; padding: 8px; margin: 10px 0;">
            </div>
            <div class="modal-section" style="display: flex; gap: 10px;">
                <button class="btn-save" onclick="savePlayerPrice(${playerId})">Save Price</button>
                <button class="btn-cancel" onclick="closePriceModal()">Cancel</button>
            </div>
        `;

        document.getElementById("player-modal-body").innerHTML = html;
    } catch (error) {
        console.error("Failed to load fee categories:", error);
        alert("Failed to load fee categories");
    }
}

async function savePlayerPrice(playerId) {
    const token = localStorage.getItem("token");
    const feeSelect = document.getElementById("fee-category-select");
    const customPrice = document.getElementById("custom-price-input");

    let payload = {};

    if (feeSelect.value) {
        payload.fee_category_id = parseInt(feeSelect.value);
    } else if (customPrice.value) {
        payload.custom_price = parseFloat(customPrice.value);
    } else {
        alert("Please select a fee type or enter a custom price");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/admin/players/${playerId}/price`, {
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

        alert(result.message);
        document.getElementById("player-modal").classList.remove("show");
        loadPlayers(); // Refresh players list
    } catch (error) {
        console.error("Failed to save price:", error);
        alert("Failed to save price");
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
                <h2 style="margin-top: 12px;">Edit Booking Price</h2>
            </div>
            <div class="modal-section">
                <label>Auto Pricing (fewest clicks)</label>
                <div class="action-row">
                    <select id="booking-auto-player-type" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #d0d7de;">
                        <option value="member" ${defaultPlayerType === "member" ? "selected" : ""}>Member</option>
                        <option value="visitor" ${defaultPlayerType === "visitor" ? "selected" : ""}>Visitor</option>
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
                <label>Or Enter Custom Price (R):</label>
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
    const token = localStorage.getItem("token");
    const playerType = document.getElementById("booking-auto-player-type")?.value || "visitor";
    const senior = Boolean(document.getElementById("booking-auto-senior")?.checked);
    const teeTimeId = currentBookingDetail?.tee_time_id;

    if (!teeTimeId) {
        alert("Missing tee time for this booking.");
        return;
    }

    try {
        const res = await fetch("/fees/suggest/golf", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                tee_time_id: teeTimeId,
                player_type: playerType,
                holes: 18,
                age: senior ? 60 : null
            })
        });

        if (!res.ok) {
            alert("No matching fee found. Pick a fee manually.");
            return;
        }

        const suggested = await res.json();
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
        loadDashboard();
    } catch (error) {
        console.error("Failed to save booking price:", error);
        toastError("Failed to save booking price");
    }
}

function closeBookingPriceModal() {
    document.getElementById("booking-modal").classList.remove("show");
}

// Revenue
async function loadRevenue() {
    const token = localStorage.getItem("token");

    try {
        const anchorDate = document.getElementById("revenue-anchor-date")?.value || new Date().toISOString().split("T")[0];
        const period = String(revenuePeriod || "day");
        const url = `${API_BASE}/api/admin/revenue?period=${encodeURIComponent(period)}&anchor_date=${encodeURIComponent(anchorDate)}`;

        const data = await fetchJson(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const series = mergeRevenueSeries(data.daily_revenue, data.daily_paid_revenue, data.daily_other_revenue);
        const otherRowsRaw = Array.isArray(data.other_revenue_by_stream) ? data.other_revenue_by_stream : [];
        const importedByStream = Object.fromEntries(
            otherRowsRaw.map(row => [
                String(row?.stream || "").toLowerCase(),
                { amount: safeNumber(row?.amount), transactions: safeNumber(row?.transactions) },
            ])
        );

        const bookedTotal = series.booked.reduce((sum, v) => sum + safeNumber(v), 0);
        const actualPaid = series.paid.reduce((sum, v) => sum + safeNumber(v), 0);
        const actualOther = (series.other || []).reduce((sum, v) => sum + safeNumber(v), 0);
        const combinedActual = actualPaid + actualOther;
        const focusSet = new Set(["all", "golf_paid", "other_imported", "pro_shop", "pub", "bowls", "other"]);
        const focus = focusSet.has(String(revenueStreamFocus || "").toLowerCase())
            ? String(revenueStreamFocus || "").toLowerCase()
            : "all";
        revenueStreamFocus = focus;

        const focusImportedLabel = focus === "pro_shop"
            ? "Pro Shop Imported"
            : focus === "pub"
                ? "Pub Imported"
                : focus === "bowls"
                    ? "Bowls Imported"
                    : focus === "other"
                        ? "Other Imported"
                        : "Imported Non-Booking";
        const selectedImported = importedByStream[focus] || { amount: 0, transactions: 0 };
        const focusedActual = focus === "golf_paid"
            ? actualPaid
            : focus === "other_imported"
                ? actualOther
                : ["pro_shop", "pub", "bowls", "other"].includes(focus)
                    ? safeNumber(selectedImported.amount)
                    : combinedActual;
        const focusedCollectionRate = (focus === "all" || focus === "golf_paid")
            ? (bookedTotal > 0 ? (actualPaid / bookedTotal) : null)
            : null;
        const focusedOtherMix = focus === "all"
            ? (combinedActual > 0 ? (actualOther / combinedActual) : null)
            : (["other_imported", "pro_shop", "pub", "bowls", "other"].includes(focus)
                ? (actualOther > 0
                    ? (focus === "other_imported" ? 1 : safeNumber(selectedImported.amount) / actualOther)
                    : null)
                : null);
        const targetRevenue = data.target_revenue;
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
        if (otherLabelEl) otherLabelEl.textContent = focus === "all" ? "Non-Booking (Imported)" : focusImportedLabel;
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
                    ? `You are ahead of target by ${formatCurrencyZAR(Math.abs(gapToTarget))}.`
                    : `You are below target by ${formatCurrencyZAR(Math.abs(gapToTarget))}.`);
            if (focus === "all") {
                flowEl.textContent =
                    `Booked: ${formatCurrencyZAR(bookedTotal)}. ` +
                    `Paid golf collected: ${formatCurrencyZAR(actualPaid)} (${focusedCollectionRate == null ? "-" : formatPct(focusedCollectionRate)}). ` +
                    `Pro shop + imported non-booking streams: ${formatCurrencyZAR(actualOther)}. ${targetSummary}`;
            } else if (focus === "golf_paid") {
                flowEl.textContent = `Golf-paid focus: ${formatCurrencyZAR(actualPaid)} collected from booked demand ${formatCurrencyZAR(bookedTotal)}. ${targetSummary}`;
            } else if (focus === "other_imported") {
                flowEl.textContent = `Imported non-booking focus: ${formatCurrencyZAR(actualOther)} across all imported streams. ${targetSummary}`;
            } else {
                flowEl.textContent = `${focusImportedLabel} focus: ${formatCurrencyZAR(selectedImported.amount)} across ${formatInteger(selectedImported.transactions)} transaction(s). ${targetSummary}`;
            }
        }
        if (golfEl) golfEl.textContent = formatCurrencyZAR(actualPaid);
        if (otherEl) {
            otherEl.textContent = formatCurrencyZAR(
                ["pro_shop", "pub", "bowls", "other"].includes(focus) ? selectedImported.amount : actualOther
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
        const showPaidDataset = focus !== "other_imported" && !["pro_shop", "pub", "bowls", "other"].includes(focus);
        const showOtherDataset = focus !== "golf_paid";
        const showCombinedDataset = focus === "all" || focus === "other_imported" || ["pro_shop", "pub", "bowls", "other"].includes(focus);
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
            let rows = [...otherRowsRaw];
            if (focus === "golf_paid") rows = [];
            if (["pro_shop", "pub", "bowls", "other"].includes(focus)) {
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
        console.error("Failed to load revenue:", error);
    }
}

function setupRevenueFilters() {
    const dateInput = document.getElementById("revenue-anchor-date");
    const buttons = document.querySelectorAll(".revenue-period-btn");
    const streamFocusSelect = document.getElementById("revenue-stream-focus");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }
    if (streamFocusSelect instanceof HTMLSelectElement) {
        revenueStreamFocus = String(streamFocusSelect.value || "all").toLowerCase();
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
        revenueStreamFocus = String(streamFocusSelect.value || "all").toLowerCase();
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

    const stream = String(streamSelect.value || "other").trim().toLowerCase();
    const label = revenueImportStreamLabel(stream);
    if (streamLabel) {
        streamLabel.textContent = `Selected operation: ${label}`;
    }

    if (!note) return;

    if (stream === "golf") {
        note.textContent = "Selected operation: Golf. Import only true non-booking golf adjustments here (not tee-sheet bookings).";
    } else if (stream === "pro_shop") {
        note.textContent = "Selected operation: Pro Shop. Use this for external POS files when sales were not captured in GreenLink checkout.";
    } else if (stream === "pub" || stream === "bowls" || stream === "other") {
        note.textContent = `Selected operation: ${label}. Import one CSV per operation for cleaner reconciliation and audit trails.`;
    } else {
        note.textContent = "Select an operation, then import one CSV at a time for cleaner reconciliation.";
    }
}

function revenueImportStreamLabel(stream) {
    const key = String(stream || "other").trim().toLowerCase();
    if (key === "golf") return "Golf";
    if (key === "pro_shop") return "Pro Shop";
    if (key === "pub") return "Pub";
    if (key === "bowls") return "Bowls";
    return "Other";
}

function normalizeRevenueImportSettings(stream, raw = {}) {
    const fallback = {
        stream: String(stream || "other").trim().toLowerCase() || "other",
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
    return String(streamSelect?.value || "other").trim().toLowerCase() || "other";
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
        ? " Stream override is ON, so CSV rows can route into other operations."
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

async function loadOpsImportSettings(options = {}) {
    const stream = String(options?.stream || getOpsSettingsStream()).trim().toLowerCase() || "other";
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
        updateRevenueUploadFlowHint();
        if (opsStreamSelect && opsStreamSelect.value !== streamSelect.value) {
            opsStreamSelect.value = streamSelect.value;
            loadOpsImportSettings({ stream: streamSelect.value, silent: true });
        }
    });
    opsStreamSelect?.addEventListener("change", (event) => {
        const selected = String(event?.target?.value || opsStreamSelect.value || "other");
        if (legacyStreamSelect && legacyStreamSelect.value !== selected) {
            legacyStreamSelect.value = selected;
            updateRevenueUploadFlowHint();
        }
        loadOpsImportSettings({ stream: selected });
    });
    opsReloadBtn?.addEventListener("click", () => loadOpsImportSettings({ stream: getOpsSettingsStream() }));
    opsSaveBtn?.addEventListener("click", () => saveOpsImportSettings());

    updateRevenueUploadFlowHint();
    loadOpsImportSettings({ stream: getOpsSettingsStream(), silent: true });

    if (!btn) return;

    btn.addEventListener("click", async () => {
        const token = localStorage.getItem("token");
        const stream = (streamSelect?.value || "other").trim();
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
                stream: String(stream || "other"),
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

            loadRevenue();
            loadDashboard();
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
        await Promise.allSettled([loadProShopProducts(), loadProShopSales(), loadDashboard()]);
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
let lastFullAutoGenKey = null;
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

function isTeeTimeClosed(dateStr, teeTimeIso) {
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
    if (!dateInput) return;

    if (!dateInput.value) {
        const today = new Date();
        dateInput.value = today.toISOString().split("T")[0];
    }

    dateInput.addEventListener("change", () => {
        loadTeeTimes();
    });

    holesButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            holesButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedHolesView = btn.dataset.holes || "18";
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

    setupTeeSheetDragDrop();
}

function setupTeeManageMenu() {
    const root = document.querySelector("[data-tee-action-root]");
    if (!root) return;

    root.addEventListener("click", async (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const item = target.closest("button[data-action]");
        if (!(item instanceof HTMLButtonElement) || !root.contains(item)) return;

        const action = item.getAttribute("data-action") || "";

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

        if (action === "import-members") {
            openMembersImportModal();
            return;
        }

        if (action === "generate") {
            if (item.disabled) return;
            const dateStr = document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0];
            try {
                item.disabled = true;
                const created = await generateDaySheet(dateStr, new Set());
                toastSuccess(`Generated ${created.toLocaleString()} tee times`);
                loadTeeTimes();
            } catch (err) {
                toastError(err?.message || "Failed to generate tee times");
            } finally {
                item.disabled = false;
            }
        }
    });
}

function openBulkBookModal() {
    const modal = document.getElementById("bulk-book-modal");
    if (!modal) return;

    const dateStr = document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0];
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
    if (accountInput) accountInput.value = "";
    if (startInput) startInput.value = startDefault;
    if (endInput) endInput.value = endDefault;
    if (slotsInput) slotsInput.value = String(Math.min(4, Math.max(1, parseInt(String(slotsInput.value || "4"), 10) || 4)));
    if (priceInput && !priceInput.value) priceInput.value = "0";

    if (statusEl) statusEl.textContent = "";
    lastBulkBookGroupId = null;
    if (undoBtn) undoBtn.disabled = true;

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
    const accountCode = document.getElementById("bulk-book-account-code")?.value?.trim() || "";
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

    if (dayTeeTimes.length === 0) {
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

    const html = [];
    for (const tt of dayTeeTimes) {
        const dt = new Date(tt.tee_time);
        const timeKey = dt.toISOString().slice(0, 16); // UTC minute precision for stable grouping
        const timeLabel = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const teeLabel = tt.hole || "1";
        const bookings = (tt.bookings || []).slice(0, 4);
        const capacity = tt.capacity || 4;
        const closed = isTeeTimeClosed(dateStr, tt.tee_time);

        const repeatedTime = groupByTime && prevTimeKey === timeKey;
        const timeCell = repeatedTime ? "" : escapeHtml(timeLabel);
        const rowClass = repeatedTime ? "tee-row-sub" : "";
        prevTimeKey = timeKey;

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
                const status = booking.status || "booked";
                const statusClass =
                    status === "checked_in" ? "checked-in" :
                    status === "no_show" ? "no-show" :
                    status === "cancelled" ? "cancelled" :
                    status === "completed" ? "completed" :
                    "booked";
                const statusLabel = statusToLabel(status);
                const search = `${booking.player_name || ""} ${booking.player_email || ""}`.trim();
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
                                <span class="slot-price">R${Number(booking.price || 0).toFixed(0)}</span>
                            </div>
                            <div class="slot-name">${escapeHtml(booking.player_name)}</div>
                            <div class="slot-meta">${booking.player_email ? escapeHtml(booking.player_email) : ""}</div>
                        </div>
                    </td>
                `);
            } else {
                const slotNumber = i + 1;
                const toAdd = Math.max(1, slotNumber - bookings.length);
                if (closed) {
                    cells.push(`
                        <td>
                            <div class="slot-card closed">
                                <div class="slot-name">Closed</div>
                                <div class="slot-meta">Past time</div>
                            </div>
                        </td>
                    `);
                } else {
                    cells.push(`
                        <td>
                            <div class="slot-card open"
                                 data-tee-time-id="${escapeHtml(String(tt.id))}"
                                 onclick="openBookingFormAdmin(${tt.id}, '${tt.tee_time}', '${teeLabel}', ${capacity}, ${bookings.length}, ${slotNumber})">
                                <div class="slot-name">Available</div>
                                <div class="slot-action">Add ${toAdd} player${toAdd === 1 ? "" : "s"}</div>
                            </div>
                        </td>
                    `);
                }
            }
        }

        html.push(`
            <tr class="${rowClass}" data-tee-time-iso="${tt.tee_time}">
                <td class="time-col">${timeCell}</td>
                <td class="tee-col">${escapeHtml(teeLabel)}</td>
                ${cells.join("")}
            </tr>
        `);
    }

    tbody.innerHTML = html.join("");
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
    const isClosed = dateStr ? isTeeTimeClosed(dateStr, teeTimeIso) : false;

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
        if (action) action.textContent = `Add ${toAdd} player${toAdd === 1 ? "" : "s"}`;

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
    const closed = dateStr ? isTeeTimeClosed(dateStr, teeTimeIso) : false;

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
        <div class="slot-name">Available</div>
        <div class="slot-action">Add player</div>
    `;
    return el;
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

async function loadTeeTimes(options = {}) {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("tee-sheet-date");
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!dateInput || !tbody) return;

    const dateStr = dateInput.value || new Date().toISOString().split("T")[0];
    applyTeePlanGlobals(dateStr);
    const dayPlan18 = teePlanForDate(dateStr, 18);
    const dayPlan9 = teePlanForDate(dateStr, 9);
    const preserveScroll = Boolean(options.preserveScroll);
    const wrap = document.querySelector(".tee-sheet-table-wrap");
    const anchor = preserveScroll ? captureWrapAnchor(wrap) : null;

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

    try {
        const start = `${dateStr}T00:00:00`;
        const [y, m, d] = dateStr.split("-").map(Number);
        const nextDay = new Date(y, (m || 1) - 1, (d || 1) + 1);
        const endDateStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`;
        const end = `${endDateStr}T00:00:00`;
        const response = await fetch(`/tsheet/range?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
            headers: { Authorization: `Bearer ${token}` }
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
        const dayAll = (Array.isArray(data) ? data : []).sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time));

        const existingKeys = new Set();
        dayAll.forEach(tt => {
            const tee = tt.hole || "1";
            existingKeys.add(teeKey(dateStr, tee, new Date(tt.tee_time)));
        });

        const scheduleTees = (Array.isArray(dayPlan18?.tees) && dayPlan18.tees.length) ? dayPlan18.tees.map(String) : ["1", "10"];
        const teeListForView = String(selectedTee) === "all" ? scheduleTees : [String(selectedTee || "1")];
        const dayTeeRaw = dayAll.filter(tt => teeListForView.includes(String(tt.hole || "1")));

        // Group duplicates by tee_time (minute precision) + tee
        const grouped = new Map();
        dayTeeRaw.forEach(tt => {
            const d = new Date(tt.tee_time);
            const timeKey = d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
            const teeKeyVal = String(tt.hole || "1");
            const key = `${timeKey}|${teeKeyVal}`;
            const existing = grouped.get(key);
            if (!existing) {
                grouped.set(key, {
                    ...tt,
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

        if (!isNineView) {
            const hasEdgeSlot = (timeValue, teeValue) =>
                dayAll.some(tt => {
                    const t = String(tt.tee_time || "");
                    const hhmm = t.length >= 16 ? t.slice(11, 16) : "";
                    return hhmm === timeValue && String(tt.hole || "1") === String(teeValue);
                });
            const missingEdge = (dayPlan18.windows || []).some((window) =>
                (dayPlan18.tees || []).some((tee) =>
                    !hasEdgeSlot(window.start, tee) || !hasEdgeSlot(window.end, tee)
                )
            );

            const fullKey = `${dateStr}|full`;
            if (missingEdge && lastFullAutoGenKey !== fullKey) {
                lastFullAutoGenKey = fullKey;
                const created = await generateDaySheet(dateStr, existingKeys, dayPlan18.tees || ["1", "10"]);
                if (created && created > 0) {
                    return loadTeeTimes(options);
                }
            }
        }

        if (dayAll.length === 0) {
            if (isNineView) {
                const created = await generateDaySheetWindow(dateStr, existingKeys, dayPlan9.tees || teeListForView);
                if (created && created > 0) {
                    lastNineAutoGenKey = `${dateStr}|all|9`;
                    return loadTeeTimes(options);
                }
                renderTeeSheetRows([], dateStr, `No 9-hole tee times scheduled (${TEE_NINE_HOLE_START}-${TEE_NINE_HOLE_END}).`);
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                return;
            }
            const created = await generateDaySheet(dateStr, existingKeys, dayPlan18.tees || ["1", "10"]);
            if (created && created > 0) {
                return loadTeeTimes(options);
            }
            renderTeeSheetRows([], dateStr, "No tee times scheduled for this date.");
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
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                return;
            }
            const created = await generateDaySheet(dateStr, existingKeys, teeListForView);
            if (created && created > 0) {
                return loadTeeTimes(options);
            }
            renderTeeSheetRows([], dateStr, "No tee times for this tee on the selected date.");
            applyTeeSheetSearchFilter();
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
        } else {
            renderTeeSheetRows(filteredTeeTimes, dateStr);
        }
        const todayStr = new Date().toISOString().split("T")[0];
        const shouldAutoScrollNow = !preserveScroll && dateStr === todayStr;
        if (shouldAutoScrollNow) {
            scrollTeeSheetToNow(dateStr);
        } else if (wrap && preserveScroll) {
            restoreWrapAnchor(wrap, anchor);
        }
        applyTeeSheetSearchFilter();
    } catch (error) {
        console.error("Failed to load tee sheet:", error);
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="empty-state">Unable to load tee sheet.</div>
                </td>
            </tr>
        `;
    }
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
        loadDashboard();
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
        loadDashboard();
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
    const accountCode = String(document.getElementById("booking-account-code")?.value || "").trim();
    try {
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/account-code`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ account_code: accountCode || null })
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
        loadDashboard();
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

        const accountHtml = acct ? `
            <div class="modal-section">
                <div class="modal-label">Linked Account</div>
                <div class="modal-value">
                    ${escapeHtml(acct.name || "")} (${escapeHtml(acct.email || "")})
                    <button class="btn-view" style="margin-left:10px" onclick="viewPlayerDetail(${acct.id})">View Account</button>
                </div>
            </div>
        ` : `
            <div class="modal-section">
                <div class="modal-label">Linked Account</div>
                <div class="modal-value"><span class="muted">No app account found for this member email.</span></div>
            </div>
        `;

        const html = `
            <div class="modal-section">
                <div class="modal-label">Member</div>
                <div class="modal-value">
                    ${escapeHtml(m.name || "-")}
                    ${(currentUserRole === "admin" || currentUserRole === "super_admin") ? `<button class="btn-edit" style="margin-left:10px" onclick="openMemberEditModal(${memberId})">Edit</button>` : ""}
                </div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Member #</div>
                <div class="modal-value">${m.member_number ? escapeHtml(m.member_number) : "-"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Email</div>
                <div class="modal-value">${m.email ? `<a href="mailto:${encodeURIComponent(String(m.email))}">${escapeHtml(m.email)}</a>` : "-"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Phone</div>
                <div class="modal-value">${m.phone ? `<a href="tel:${escapeHtml(String(m.phone))}">${escapeHtml(m.phone)}</a>` : "-"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Handicap</div>
                <div class="modal-value">${m.handicap_number ? escapeHtml(m.handicap_number) : "-"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Home Club</div>
                <div class="modal-value">${m.home_club ? escapeHtml(m.home_club) : "-"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Active</div>
                <div class="modal-value">${m.active ? '<span class="pill active">Active</span>' : '<span class="pill inactive">Inactive</span>'}</div>
            </div>
            ${accountHtml}
            <div class="modal-section">
                <div class="modal-label">Bookings</div>
                <div class="modal-value">${Number(stats.bookings_count || 0)}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Total Spent</div>
                <div class="modal-value">R${Number(stats.total_spent || 0).toFixed(2)}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Last Seen</div>
                <div class="modal-value">${stats.last_seen ? formatDateTimeDMY(stats.last_seen) : "-"}</div>
            </div>
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
                            <td>R${Number(b.price || 0).toFixed(2)}</td>
                        </tr>
                        `).join("") : `<tr><td colspan="4" style="text-align:center; color:#7f8c8d; padding: 12px;">No bookings yet.</td></tr>`}
                    </tbody>
                </table>
            </div>
        `;

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
            <input type="text" id="member-number" value="${escapeHtml(m.member_number || "")}" style="width: 100%; padding: 8px; margin-top: 8px;">
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
    const token = localStorage.getItem("token");
    const feeSelect = row.querySelector('select[data-field="fee"]');
    const typeSelect = row.querySelector('select[data-field="player_type"]');
    const seniorCheckbox = row.querySelector('input[data-field="senior"]');

    if (!feeSelect || !typeSelect) return;

    const playerType = typeSelect.value || "visitor";
    const senior = Boolean(seniorCheckbox?.checked);

    try {
        const res = await fetch("/fees/suggest/golf", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                tee_time_id: teeBookingState.teeTimeId,
                player_type: playerType,
                holes: teeBookingState.holes || 18,
                age: senior ? 60 : null
            })
        });

        if (!res.ok) {
            row.dataset.autoFeeId = "";
            row.dataset.autoPrice = "0";
            const label = row.querySelector("[data-row-fee-label]");
            if (label) label.textContent = "Auto pricing unavailable";
            updateBookingTotals();
            return;
        }

        const suggested = await res.json();
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
    const token = localStorage.getItem("token");
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
    const playerType = typeSelect?.value || "visitor";

    try {
        const res = await fetch("/fees/suggest/cart", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                tee_time_id: teeBookingState.teeTimeId,
                player_type: playerType,
                holes: teeBookingState.holes || 18
            })
        });

        if (!res.ok) {
            row.dataset.cartPrice = "0";
            row.dataset.cartLabel = "Cart pricing unavailable";
            if (label) label.textContent = "Cart pricing unavailable";
            updateBookingTotals();
            return;
        }

        const suggested = await res.json();
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
    const token = localStorage.getItem("token");
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
    const playerType = typeSelect?.value || "visitor";

    try {
        const res = await fetch("/fees/suggest/push-cart", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                tee_time_id: teeBookingState.teeTimeId,
                player_type: playerType,
                holes: teeBookingState.holes || 18
            })
        });

        if (!res.ok) {
            row.dataset.pushCartPrice = "0";
            row.dataset.pushCartLabel = "Push cart pricing unavailable";
            if (label) label.textContent = "Push cart pricing unavailable";
            updateBookingTotals();
            return;
        }

        const suggested = await res.json();
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
    const token = localStorage.getItem("token");
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
    const playerType = typeSelect?.value || "visitor";

    try {
        const res = await fetch("/fees/suggest/caddy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                tee_time_id: teeBookingState.teeTimeId,
                player_type: playerType,
                holes: teeBookingState.holes || 18
            })
        });

        if (!res.ok) {
            row.dataset.caddyPrice = "0";
            row.dataset.caddyLabel = "Caddy pricing unavailable";
            if (label) label.textContent = "Caddy pricing unavailable";
            updateBookingTotals();
            return;
        }

        const suggested = await res.json();
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
        let desired = parseInt(String(desiredTotal ?? ""), 10);
        if (!Number.isFinite(desired) || desired <= 0) desired = Math.min(teeBookingState.capacity, (teeBookingState.existing || 0) + 1);
        desired = Math.max(1, Math.min(teeBookingState.capacity, desired));

        // Clicking slot N should default to "book up to N players total" at this tee time.
        let toAdd = Math.max(1, desired - (teeBookingState.existing || 0));
        toAdd = Math.min(available, toAdd);

        for (let i = 0; i < toAdd; i++) addBookingRow();
    }

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
            <div>
                <label>Senior</label>
                <label style="display:flex; align-items:center; gap:8px; font-weight:600; color:#2c3e50;">
                    <input type="checkbox" data-field="senior">
                    60+
                </label>
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
                <label>Handicap</label>
                <input type="text" data-field="handicap" placeholder="Handicap">
            </div>
            <div>
                <label>Fee</label>
                <select data-field="fee">
                    <option value="">Auto (Recommended)</option>
                    ${feeOptionsHtml()}
                </select>
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
}

function removeBookingRow(index) {
    const rowsContainer = document.getElementById("tee-booking-rows");
    const row = rowsContainer.querySelector(`.tee-booking-row[data-index="${index}"]`);
    if (row) {
        row.remove();
        updateTeeBookingAddingCount();
        updateBookingTotals();
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

    if (e.target.matches("select[data-field='player_type']") || e.target.matches("input[data-field='senior']")) {
        const feeSelect = row.querySelector("select[data-field='fee']");
        if (feeSelect && !feeSelect.value) {
            suggestFeeForRow(row);
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
                payload.age = senior ? 60 : null;
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
            loadDashboard();
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
    const token = localStorage.getItem("token");
    const dateStr = document.getElementById("ledger-date")?.value;
    const q = document.getElementById("ledger-search")?.value?.trim();

    try {
        let url = `${API_BASE}/api/admin/ledger?skip=${(currentLedgerPage - 1) * 10}&limit=10`;
        const range = buildBookingRange(dateStr, ledgerPeriod);
        if (range) {
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }
        if (q) url += `&q=${encodeURIComponent(q)}`;
        if (ledgerExportFilter === "yes") url += "&exported=true";
        if (ledgerExportFilter === "no") url += "&exported=false";

        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || `HTTP ${response.status}`);
        }

        const data = await response.json();

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
    loadCloseStatus();
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
                exportBtn.textContent = originalLabel || "Export to Sage (CSV)";
            }
            return;
        }

        const runId = response.headers.get("x-greenlink-runid") || "";
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

        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        if (exportBtn) exportBtn.textContent = "Waiting for Pastel import...";

        // Poll for desktop-bot result (if configured). If no bot, this will time out quietly.
        if (runId) {
            const started = Date.now();
            const timeoutMs = 120000;
            while ((Date.now() - started) < timeoutMs) {
                try {
                    const statusRes = await fetch(`${API_BASE}/cashbook/export-job-status?export_date=${dateInput}&run_id=${encodeURIComponent(runId)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (statusRes.ok) {
                        const status = await statusRes.json();
                        const s = String(status?.status || "").toLowerCase();
                        if (s === "imported") {
                            alert(`Imported into Pastel${batchRef ? ` (${batchRef})` : ""}`);
                            break;
                        }
                        if (s === "failed") {
                            alert(status?.message || "Pastel import failed");
                            break;
                        }
                    }
                } catch {
                    // ignore poll errors
                }
                await sleep(3000);
            }
        } else {
            alert("Journal exported successfully!");
        }
    } catch (error) {
        console.error("Failed to export cashbook:", error);
        alert("Failed to export cashbook");
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = originalLabel || "Export to Sage (CSV)";
        }
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
            applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0]);
            if (!silent) {
                const statusEl = document.getElementById("tee-profile-status");
                if (statusEl) statusEl.textContent = "Using default profile";
            }
            return;
        }
        const data = await res.json();
        writeTeeProfileToForm(data?.profile || defaultTeeProfile());
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0]);
    } catch (error) {
        teeSheetProfile = normalizeTeeProfile(defaultTeeProfile());
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0]);
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
        applyTeePlanGlobals(document.getElementById("tee-sheet-date")?.value || new Date().toISOString().split("T")[0]);
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
        const response = await fetch(`${API_BASE}/cashbook/close-day?close_date=${dateInput}&auto_push=0`, {
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

        if (cashbookHasRecords) {
            exportCashbookToCSV();
        } else {
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