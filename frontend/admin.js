// Admin Dashboard JavaScript

const API_BASE = window.location.origin;
let currentPage = 1;
let currentPlayersPage = 1;
let currentLedgerPage = 1;
let peopleView = "players"; // players | members | guests
let selectedTee = "all";
let selectedHolesView = "18";
let bookingPeriod = "day";
let ledgerPeriod = "day";
let revenuePeriod = "day"; // day | wtd | mtd | ytd
let golfFeesCache = [];
let cashbookHasRecords = false;
let currentBookingDetail = null;
let teeBookingState = {
    teeTimeId: null,
    teeTimeIso: null,
    tee: "1",
    capacity: 4,
    existing: 0,
    prepaid: false
};
let teeBookingSubmitting = false;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    setupNavigation();
    loadDashboard();
    setupCloseModals();
    updateTime();
    setInterval(updateTime, 1000);
    setupBookingFilters();
    setupLedgerFilters();
    setupRevenueFilters();
    setupTeeSheetFilters();
    setupTeeBookingModal();
    setupPeopleFilters();
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

function formatCurrencyZAR(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "R0.00";
    return `R${num.toFixed(2)}`;
}

function safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function formatPct(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return `${(num * 100).toFixed(0)}%`;
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
        return;
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
            return;
        }

        const user = await response.json();
        console.log("User:", user);
        
        // Check if admin
        if (user.role !== "admin") {
            console.error("Not admin user");
            alert("Admin access required. Your role is: " + user.role);
            window.location.href = "index.html";
            return;
        }
        
        document.getElementById("admin-name").textContent = user.name;
        console.log("Admin access granted");
    } catch (error) {
        console.error("Auth check failed:", error);
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
                case "tee-times":
                    loadTeeTimes();
                    break;
                case "ledger":
                    loadLedger();
                    break;
                case "cashbook":
                    initCashbook();
                    break;
            }
        });
    });
}

function showPage(pageName) {
    document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
    document.getElementById(pageName).classList.add("active");

    // Update title
    const titles = {
        dashboard: "Dashboard",
        bookings: "Bookings",
        players: "Players",
        revenue: "Revenue Analytics",
        "tee-times": "Tee Sheet",
        ledger: "Ledger",
        cashbook: "Cashbook Export"
    };
    document.getElementById("page-title").textContent = titles[pageName] || pageName;
}

// Dashboard
async function loadDashboard() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(`${API_BASE}/api/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        document.getElementById("total-bookings").textContent = data.total_bookings;
        document.getElementById("total-players").textContent = data.total_players;
        document.getElementById("total-revenue").textContent = data.total_revenue.toFixed(2);
        document.getElementById("completed-rounds").textContent = data.completed_rounds;
        document.getElementById("today-bookings").textContent = data.today_bookings;
        document.getElementById("today-revenue").textContent = data.today_revenue.toFixed(2);
        document.getElementById("week-revenue").textContent = data.week_revenue.toFixed(2);

        renderTargetsTable(data.targets);

        // Status bars
        const total = Object.values(data.bookings_by_status).reduce((a, b) => a + b, 0) || 1;
        const statuses = [
            { key: "booked", elId: "status-booked", countId: "status-booked-count" },
            { key: "checked_in", elId: "status-checked-in", countId: "status-checked-in-count" },
            { key: "completed", elId: "status-completed", countId: "status-completed-count" },
            { key: "no_show", elId: "status-no-show", countId: "status-no-show-count" },
            { key: "cancelled", elId: "status-cancelled", countId: "status-cancelled-count" }
        ];
        statuses.forEach(({ key, elId, countId }) => {
            const count = data.bookings_by_status[key] || 0;
            const width = (count / total) * 100;
            const el = document.getElementById(elId);
            if (el) el.style.width = width + "%";
            const countEl = document.getElementById(countId);
            if (countEl) countEl.textContent = String(count);
        });

        // Revenue chart
        loadRevenueChart();
    } catch (error) {
        console.error("Failed to load dashboard:", error);
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
                <td>${String(Math.round(roundsActual))}</td>
                <td>${roundsTarget == null ? "—" : String(Math.round(safeNumber(roundsTarget)))}</td>
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
        const response = await fetch(`${API_BASE}/api/admin/revenue?days=30`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();
        const series = mergeRevenueSeries(data.daily_revenue, data.daily_paid_revenue);

        const ctx = document.getElementById("revenueChart");
        if (window.revenueChartInstance && typeof window.revenueChartInstance.destroy === "function") {
            window.revenueChartInstance.destroy();
        }

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
                    }
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
                        ticks: { callback: val => "R" + val.toFixed(0) }
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

function mergeRevenueSeries(bookedSeries, paidSeries) {
    const map = new Map();
    (bookedSeries || []).forEach(item => {
        if (!item?.date) return;
        map.set(item.date, { booked: Number(item.amount || 0), paid: 0 });
    });
    (paidSeries || []).forEach(item => {
        if (!item?.date) return;
        const existing = map.get(item.date) || { booked: 0, paid: 0 };
        existing.paid = Number(item.amount || 0);
        map.set(item.date, existing);
    });
    const labels = Array.from(map.keys()).sort((a, b) => new Date(a) - new Date(b));
    return {
        labels,
        booked: labels.map(d => map.get(d)?.booked ?? 0),
        paid: labels.map(d => map.get(d)?.paid ?? 0)
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
    const periodButtons = document.querySelectorAll(".booking-period-btn");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
    }

    statusSelect?.addEventListener("change", () => {
        currentPage = 1;
        loadBookings();
    });

    dateInput?.addEventListener("change", () => {
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

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
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
        if (status) url += `&status=${status}`;

        const range = buildBookingRange(dateStr, bookingPeriod);
        if (range) {
            url += `&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`;
        }

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

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
                <td>R${b.price.toFixed(2)}</td>
                <td><span class="status-badge ${statusToClass(b.status)}">${statusToLabel(b.status)}</span></td>
                <td>${b.tee_time ? formatTimeDateDMY(b.tee_time) : "-"}</td>
                <td>${b.has_round ? (b.round_completed ? "Closed ✓" : "Open") : "Not started"}</td>
                <td>${formatDateDMY(b.created_at)}</td>
                <td><button class="btn-view" onclick="viewBookingDetail(${b.id})">View</button></td>
            </tr>
        `).join("");

        // Pagination
        const totalPages = Math.ceil(data.total / 10);
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
        const response = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const booking = await response.json();
        currentBookingDetail = booking;

        const status = String(booking.status || "");
        const statusClass = statusToClass(status);
        const statusLabel = statusToLabel(status) || "-";
        const isPaid = status === "checked_in" || status === "completed";

        const ledgerEntries = Array.isArray(booking.ledger_entries) ? booking.ledger_entries : [];
        const exportedEntry = ledgerEntries.find(le => Boolean(le.pastel_synced));
        const exportBatch = exportedEntry?.pastel_transaction_id || "";

        const checkinLabel = status === "checked_in" ? "Open Round" : "Check In (Paid)";
        const disableCheckin = status === "cancelled" || status === "no_show";

        const disableComplete = status === "cancelled" || status === "no_show";
        const disableNoShow = status === "cancelled" || status === "completed";
        const disableCancel = status === "cancelled";
        const disableReopen = status === "booked";

        const feeLabel = booking.fee_category
            ? booking.fee_category.description
            : (booking.fee_category_id ? `Fee #${booking.fee_category_id}` : "Auto / Custom");

        const html = `
            <div class="booking-detail-header">
                <div>
                    <div class="booking-detail-title">${displayValue(booking.player_name, "Booking")}</div>
                    <div class="booking-detail-sub">
                        Booking #${booking.id} • ${booking.tee_time ? formatTimeDateDMY(booking.tee_time) : "No tee time"}
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
                    <span class="detail-value">${displayValue(booking.home_club, "???")}</span>
                    </div>
                    <div class="detail-row">
                    <span class="detail-label">HI (Booking)</span>
                    <span class="detail-value">${booking.handicap_index_at_booking == null ? "???" : escapeHtml(Number(booking.handicap_index_at_booking).toFixed(1))}</span>
                    </div>
                    <div class="detail-row">
                    <span class="detail-label">Category</span>
                    <span class="detail-value">${displayValue(booking.player_category, "???")}</span>
                    </div>
                    <div class="detail-row">
                    <span class="detail-label">Gender</span>
                    <span class="detail-value">${displayValue(booking.gender, "???")}</span>
                    </div>
                    <div class="detail-row">
                    <span class="detail-label">Holes</span>
                    <span class="detail-value">${booking.holes ? escapeHtml(String(booking.holes)) : "???"}</span>
                    </div>
                    <div class="detail-row">
                    <span class="detail-label">Prepaid</span>
                    <span class="detail-value">${booking.prepaid === true ? "Yes" : (booking.prepaid === false ? "No" : "???")}</span>
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
                    <div style="margin-top: 10px;">
                        <button class="btn-edit" onclick="openEditBookingPriceModal(${bookingId})">Edit Price</button>
                    </div>
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
                            <span class="detail-value">Use “${checkinLabel}”</span>
                        </div>
                    `}
                </div>

                <div class="booking-detail-card">
                    <h3>Ledger</h3>
                    <div class="detail-row">
                        <span class="detail-label">Entries</span>
                        <span class="detail-value">${ledgerEntries.length ? String(ledgerEntries.length) : "0"}</span>
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
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'booked')" ${disableReopen ? "disabled" : ""}>Reopen</button>
                <button class="btn-secondary" onclick="adminSetStatus(${bookingId}, 'no_show')" ${disableNoShow ? "disabled" : ""}>No-show</button>
                <button class="btn-cancel" onclick="adminSetStatus(${bookingId}, 'cancelled')" ${disableCancel ? "disabled" : ""}>Cancel</button>
                <button class="btn-cancel" onclick="adminDeleteBooking(${bookingId})">Remove</button>
            </div>
        `;

        document.getElementById("modal-body").innerHTML = html;
        document.getElementById("booking-modal").classList.add("show");
    } catch (error) {
        console.error("Failed to load booking detail:", error);
    }
}

// Players
function setupPeopleFilters() {
    const buttons = document.querySelectorAll("#players .people-btn");
    const title = document.getElementById("people-title");
    const searchInput = document.getElementById("people-search");
    if (!buttons.length) return;

    const updateTitle = () => {
        if (!title) return;
        title.textContent = peopleView === "members" ? "Members" : peopleView === "guests" ? "Guest Players" : "Registered Players";
    };

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            peopleView = btn.dataset.view || "players";
            currentPlayersPage = 1;
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

    updateTitle();
}

async function loadPlayers() {
    const token = localStorage.getItem("token");
    const search = document.getElementById("people-search")?.value?.trim();
    const tableHead = document.getElementById("people-table-head");
    const tableBody = document.getElementById("players-table");
    if (!tableHead || !tableBody) return;

    try {
        let url = `${API_BASE}/api/admin/players?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        if (peopleView === "members") {
            url = `${API_BASE}/api/admin/members?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        } else if (peopleView === "guests") {
            url = `${API_BASE}/api/admin/guests?skip=${(currentPlayersPage - 1) * 10}&limit=10`;
        }
        if (search) url += `&q=${encodeURIComponent(search)}`;

        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

        const data = await response.json();

        if (peopleView === "members") {
            tableHead.innerHTML = `
                <th>Name</th>
                <th>Member #</th>
                <th>Email</th>
                <th>Handicap</th>
                <th>Bookings</th>
                <th>Total Spent</th>
                <th>Active</th>
            `;

            const members = Array.isArray(data.members) ? data.members : [];
            tableBody.innerHTML = members.map(m => `
                <tr>
                    <td>${escapeHtml(m.name || `${m.first_name || ""} ${m.last_name || ""}`.trim())}</td>
                    <td>${m.member_number ? escapeHtml(m.member_number) : "-"}</td>
                    <td>${m.email ? escapeHtml(m.email) : "-"}</td>
                    <td>${m.handicap_number ? escapeHtml(m.handicap_number) : "-"}</td>
                    <td>${Number(m.bookings_count || 0)}</td>
                    <td>R${Number(m.total_spent || 0).toFixed(2)}</td>
                    <td>${m.active ? "✓" : "—"}</td>
                </tr>
            `).join("");

            if (!members.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; color:#7f8c8d; padding: 18px;">No members found.</td>
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
                    <td>${Number(g.bookings_count || 0)}</td>
                    <td>R${Number(g.total_spent || 0).toFixed(2)}</td>
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
                    <td>${Number(p.bookings_count || 0)}</td>
                    <td>R${Number(p.total_spent || 0).toFixed(2)}</td>
                    <td><button class="btn-view" onclick="viewPlayerDetail(${p.id})">View</button></td>
                </tr>
            `).join("");

            if (!players.length) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align:center; color:#7f8c8d; padding: 18px;">No players found.</td>
                    </tr>
                `;
            }
        }

        const totalPages = Math.ceil(Number(data.total || 0) / 10) || 1;
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
        const response = await fetch(`${API_BASE}/api/admin/players/${playerId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const player = await response.json();
        
        // Get price info
        const priceResponse = await fetch(`${API_BASE}/api/admin/players/${playerId}/price-info`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        const priceInfo = await priceResponse.json();

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
                <button class="btn-edit" onclick="openEditPriceModal(${playerId}, '${player.name}')">Edit Price</button>
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
                <button class="btn-secondary btn-small" type="button" onclick="viewBookingDetail(${bookingId})">← Back</button>
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

        alert(result.message);
        document.getElementById("booking-modal").classList.remove("show");
        loadBookings();
        loadTeeTimes();
        loadDashboard();
    } catch (error) {
        console.error("Failed to save booking price:", error);
        alert("Failed to save booking price");
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

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();
        const series = mergeRevenueSeries(data.daily_revenue, data.daily_paid_revenue);

        // Summary (paid revenue vs target)
        const actualPaid = series.paid.reduce((sum, v) => sum + safeNumber(v), 0);
        const targetRevenue = data.target_revenue;
        const pct = targetRevenue ? (actualPaid / safeNumber(targetRevenue)) : null;

        const actualEl = document.getElementById("revenue-actual");
        const targetEl = document.getElementById("revenue-target");
        const pctEl = document.getElementById("revenue-pct");
        if (actualEl) actualEl.textContent = formatCurrencyZAR(actualPaid);
        if (targetEl) targetEl.textContent = targetRevenue == null ? "—" : formatCurrencyZAR(targetRevenue);
        if (pctEl) pctEl.textContent = pct == null ? "—" : formatPct(pct);

        // Daily revenue chart
        const dailyCtx = document.getElementById("dailyRevenueChart");
        if (window.dailyChart) window.dailyChart.destroy();

        window.dailyChart = new Chart(dailyCtx, {
            type: "bar",
            data: {
                labels: series.labels.map(d => formatYMDToDMY(d)),
                datasets: [
                    {
                        label: "Booked Revenue (R)",
                        data: series.booked,
                        backgroundColor: "rgba(6, 79, 50, 0.65)"
                    },
                    {
                        label: "Paid Revenue (R)",
                        data: series.paid,
                        backgroundColor: "rgba(30, 136, 229, 0.65)"
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });

        // Status revenue chart
        const statusCtx = document.getElementById("statusRevenueChart");
        if (window.statusChart) window.statusChart.destroy();

        window.statusChart = new Chart(statusCtx, {
            type: "pie",
            data: {
                labels: data.revenue_by_status.map(s => s.status),
                datasets: [{
                    data: data.revenue_by_status.map(s => s.amount),
                    backgroundColor: ["#3498db", "#f39c12", "#27ae60", "#e74c3c"]
                }]
            },
            options: { responsive: true, maintainAspectRatio: true }
        });
    } catch (error) {
        console.error("Failed to load revenue:", error);
    }
}

function setupRevenueFilters() {
    const dateInput = document.getElementById("revenue-anchor-date");
    const buttons = document.querySelectorAll(".revenue-period-btn");

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split("T")[0];
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
}

// Tee Sheet
const TEE_DEFAULT_START = "06:30";
const TEE_DEFAULT_END = "16:30";
const TEE_DEFAULT_INTERVAL_MIN = 10;
const TEE_NINE_HOLE_START = "15:00"; // 9-hole view starts later than 18-hole view
let lastNineAutoGenKey = null;

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
        setTimeout(() => target.scrollIntoView({ block: "start" }), 0);
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
    const [cutoffHour, cutoffMinute] = TEE_NINE_HOLE_START.split(":").map(Number);
    const cutoffTotal = (cutoffHour || 0) * 60 + (cutoffMinute || 0);
    const [endHour, endMinute] = TEE_DEFAULT_END.split(":").map(Number);
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
    return generateTeeSheetRange(dateStr, tees, TEE_DEFAULT_START, TEE_DEFAULT_END);
}

async function generateDaySheetWindow(dateStr, existingKeys, tees, startTime, endTime) {
    return generateTeeSheetRange(dateStr, tees, startTime, endTime);
}

async function generateTeeSheetRange(dateStr, tees, startTime, endTime) {
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
            interval_min: TEE_DEFAULT_INTERVAL_MIN,
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
                const statusClass = status === "checked_in" ? "checked-in" : status === "no_show" ? "no-show" : status === "cancelled" ? "cancelled" : status === "completed" ? "checked-in" : "booked";
                const statusLabel = statusToLabel(status);
                const search = `${booking.player_name || ""} ${booking.player_email || ""}`.trim();
                cells.push(`
                    <td>
                        <div class="slot-card ${statusClass}" data-search="${escapeHtml(search)}" onclick="openBookingDetails(${tt.id}, ${booking.id})">
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
                            <div class="slot-card open" onclick="openBookingFormAdmin(${tt.id}, '${tt.tee_time}', '${teeLabel}', ${capacity}, ${bookings.length}, ${slotNumber})">
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

async function loadTeeTimes() {
    const token = localStorage.getItem("token");
    const dateInput = document.getElementById("tee-sheet-date");
    const tbody = document.getElementById("admin-tee-sheet-body");
    if (!dateInput || !tbody) return;

    const dateStr = dateInput.value || new Date().toISOString().split("T")[0];
    tbody.innerHTML = `
        <tr class="empty-row">
            <td colspan="6">
                <div class="empty-state">Loading tee sheet...</div>
            </td>
        </tr>
    `;

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

        const teeListForView = String(selectedTee) === "all" ? ["1", "10"] : [String(selectedTee || "1")];
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

        if (dayAll.length === 0) {
            if (isNineView) {
                const created = await generateDaySheetWindow(dateStr, existingKeys, ["1", "10"], TEE_NINE_HOLE_START, TEE_DEFAULT_END);
                if (created && created > 0) {
                    lastNineAutoGenKey = `${dateStr}|all|9`;
                    return loadTeeTimes();
                }
                renderTeeSheetRows([], dateStr, "No 9-hole tee times scheduled (3:00-4:30 PM).");
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                return;
            }
            await generateDaySheet(dateStr, existingKeys, ["1", "10"]);
            return loadTeeTimes();
        }

        if (dayTeeTimes.length === 0) {
            if (isNineView) {
                const nineKey = `${dateStr}|${String(selectedTee)}|9`;
                if (lastNineAutoGenKey !== nineKey) {
                    const created = await generateDaySheetWindow(dateStr, existingKeys, teeListForView, TEE_NINE_HOLE_START, TEE_DEFAULT_END);
                    if (created && created > 0) {
                        lastNineAutoGenKey = nineKey;
                        return loadTeeTimes();
                    }
                }
                renderTeeSheetRows([], dateStr, "No 9-hole tee times scheduled (3:00-4:30 PM).");
                scrollTeeSheetToNow(dateStr);
                applyTeeSheetSearchFilter();
                return;
            }
            await generateDaySheet(dateStr, existingKeys, teeListForView);
            return loadTeeTimes();
        }

        if (filteredTeeTimes.length === 0 && isNineView) {
            const nineKey = `${dateStr}|${String(selectedTee)}|9`;
            if (lastNineAutoGenKey !== nineKey) {
                const created = await generateDaySheetWindow(dateStr, existingKeys, teeListForView, TEE_NINE_HOLE_START, TEE_DEFAULT_END);
                if (created && created > 0) {
                    lastNineAutoGenKey = nineKey;
                    return loadTeeTimes();
                }
            }
            renderTeeSheetRows([], dateStr, "No 9-hole tee times scheduled (3:00-4:30 PM).");
        } else {
            renderTeeSheetRows(filteredTeeTimes, dateStr);
        }
        scrollTeeSheetToNow(dateStr);
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

async function adminCheckIn(bookingId) {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/checkin/${bookingId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            const msg = await res.text();
            alert(msg || "Check-in failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes();
        loadBookings();
        loadDashboard();
    } catch (e) {
        alert("Check-in failed");
    }
}

async function adminSetStatus(bookingId, status) {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API_BASE}/api/admin/bookings/${bookingId}/status`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        if (!res.ok) {
            alert("Status update failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes();
        loadBookings();
        loadDashboard();
    } catch (e) {
        alert("Status update failed");
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
            alert("Delete failed");
            return;
        }
        document.getElementById("booking-modal").classList.remove("show");
        loadTeeTimes();
        loadBookings();
        loadDashboard();
    } catch (e) {
        alert("Delete failed");
    }
}

async function loadGolfFees() {
    if (golfFeesCache.length) return golfFeesCache;
    const token = localStorage.getItem("token");
    const res = await fetch("/fees/golf", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
        golfFeesCache = await res.json();
    }
    return golfFeesCache;
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
            </div>
        </div>
    `;
    rowsContainer.appendChild(row);
    updateTeeBookingAddingCount();
    row.dataset.cartPrice = "0";
    row.dataset.cartLabel = "Cart";
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
        const priceTag = row.querySelector('[data-row-price]');
        const cartLabel = row.querySelector('[data-row-cart-label]');
        let price = 0;
        if (select && select.value) {
            const option = select.options[select.selectedIndex];
            price = parseFloat(option.getAttribute("data-price") || "0");
        } else {
            price = parseFloat(row.dataset.autoPrice || "0");
        }
        const cartInfo = cartSplitMap.get(row);
        const cartPrice = cartChecked ? (cartInfo?.charge ?? parseFloat(row.dataset.cartPrice || "0")) : 0;
        const rowTotal = price + cartPrice;
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
            loadTeeTimes();
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

        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
            const msg = await response.text();
            throw new Error(msg || `HTTP ${response.status}`);
        }

        const data = await response.json();

        const totalAmountEl = document.getElementById("ledger-total-amount");
        const totalCountEl = document.getElementById("ledger-total-count");
        if (totalAmountEl) totalAmountEl.textContent = `R${Number(data.total_amount || 0).toFixed(2)}`;
        if (totalCountEl) totalCountEl.textContent = String(data.total || 0);

        const table = document.getElementById("ledger-table");
        table.innerHTML = data.ledger_entries.map(le => `
            <tr>
                <td>#${le.id}</td>
                <td>${le.booking_id ? `<button class="link-btn" onclick="viewBookingDetail(${le.booking_id})">#${le.booking_id}</button>` : "-"}</td>
                <td>${le.description}</td>
                <td class="amount-cell">R${le.amount.toFixed(2)}</td>
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

        const totalPages = Math.ceil(data.total / 10);
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
function renderPagination(elementId, currentPage, totalPages, callback) {
    const container = document.getElementById(elementId);
    container.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.classList.toggle("active", i === currentPage);
        btn.onclick = () => callback(i);
        container.appendChild(btn);
    }
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
}

function logout() {
    localStorage.removeItem("token");
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

function initCashbook() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("cashbook-date").value = today;
    loadCashbookSummary();
    loadCloseStatus();
    loadAccountingSettings();
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
    
    if (!dateInput) {
        alert("Please select a date");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/cashbook/export-csv?export_date=${dateInput}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const error = await response.json();
            alert("Error: " + error.detail);
            return;
        }

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

        alert("Cashbook exported successfully!");
    } catch (error) {
        console.error("Failed to export cashbook:", error);
        alert("Failed to export cashbook");
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
    const statusEl = document.getElementById("acct-save-status");

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
            if (statusEl) statusEl.textContent = err.detail || "Save failed";
            return;
        }

        if (statusEl) {
            statusEl.textContent = "Saved";
            setTimeout(() => { statusEl.textContent = ""; }, 2000);
        }
        loadCashbookSummary();
    } catch (error) {
        console.error("Failed to save accounting settings:", error);
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
