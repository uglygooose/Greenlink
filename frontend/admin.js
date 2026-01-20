// Admin Dashboard JavaScript

const API_BASE = "https://greenlink-31286426692.us-central1.run.app";
let currentPage = 1;
let currentPlayersPage = 1;
let currentLedgerPage = 1;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    setupNavigation();
    loadDashboard();
    setupCloseModals();
    updateTime();
    setInterval(updateTime, 1000);
});

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
        "tee-times": "Tee Times",
        ledger: "Ledger"
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

        // Status bars
        const total = Object.values(data.bookings_by_status).reduce((a, b) => a + b, 0) || 1;
        const statuses = ["booked", "checked_in", "completed", "cancelled"];
        statuses.forEach(status => {
            const count = data.bookings_by_status[status] || 0;
            const width = (count / total) * 100;
            document.getElementById(`status-${status}`).style.width = width + "%";
        });

        // Revenue chart
        loadRevenueChart();
    } catch (error) {
        console.error("Failed to load dashboard:", error);
    }
}

async function loadRevenueChart() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(`${API_BASE}/api/admin/revenue?days=30`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        const ctx = document.getElementById("revenueChart");
        if (window.revenueChart) window.revenueChart.destroy();

        window.revenueChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: data.daily_revenue.map(d => d.date),
                datasets: [
                    {
                        label: "Revenue (R)",
                        data: data.daily_revenue.map(d => d.amount),
                        borderColor: "#064f32",
                        backgroundColor: "rgba(6, 79, 50, 0.1)",
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
async function loadBookings() {
    const token = localStorage.getItem("token");
    const status = document.getElementById("filter-status")?.value;

    try {
        let url = `${API_BASE}/api/admin/bookings?skip=${(currentPage - 1) * 10}&limit=10`;
        if (status) url += `&status=${status}`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        const table = document.getElementById("bookings-table");
        table.innerHTML = data.bookings.map(b => `
            <tr>
                <td>#${b.id}</td>
                <td>${b.player_name}</td>
                <td>${b.player_email}</td>
                <td>R${b.price.toFixed(2)}</td>
                <td><span class="status-badge ${b.status}">${b.status.replace("_", " ")}</span></td>
                <td>${b.tee_time ? new Date(b.tee_time).toLocaleString() : "-"}</td>
                <td>${b.has_round ? (b.round_completed ? "✓ Done" : "In Progress") : "-"}</td>
                <td>${new Date(b.created_at).toLocaleDateString()}</td>
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

        const html = `
            <div class="modal-section">
                <div class="modal-label">Player Name</div>
                <div class="modal-value">${booking.player_name}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Email</div>
                <div class="modal-value">${booking.player_email}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Club Card</div>
                <div class="modal-value">${booking.club_card || "N/A"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Handicap</div>
                <div class="modal-value">${booking.handicap_number || "N/A"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Price</div>
                <div class="modal-value">R${booking.price.toFixed(2)}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Status</div>
                <div class="modal-value"><span class="status-badge ${booking.status}">${booking.status}</span></div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Tee Time</div>
                <div class="modal-value">${booking.tee_time ? new Date(booking.tee_time).toLocaleString() : "N/A"}</div>
            </div>
            <div class="modal-section">
                <div class="modal-label">Created</div>
                <div class="modal-value">${new Date(booking.created_at).toLocaleString()}</div>
            </div>
            ${booking.round ? `
            <div class="modal-section">
                <h3>Round Info</h3>
                <div class="modal-label">Status</div>
                <div class="modal-value">${booking.round.closed ? "Closed ✓" : "In Progress"}</div>
                ${booking.round.scores ? `
                <div class="modal-label" style="margin-top: 10px;">Scores</div>
                <div class="modal-value"><pre>${booking.round.scores}</pre></div>
                ` : ""}
            </div>
            ` : ""}
        `;

        document.getElementById("modal-body").innerHTML = html;
        document.getElementById("booking-modal").classList.add("show");
    } catch (error) {
        console.error("Failed to load booking detail:", error);
    }
}

// Players
async function loadPlayers() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(
            `${API_BASE}/api/admin/players?skip=${(currentPlayersPage - 1) * 10}&limit=10`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await response.json();

        const table = document.getElementById("players-table");
        table.innerHTML = data.players.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.email}</td>
                <td>${p.handicap_number || "-"}</td>
                <td>${p.bookings_count}</td>
                <td>R${(p.bookings_count * 350).toFixed(2)}</td>
                <td><button class="btn-view" onclick="viewPlayerDetail(${p.id})">View</button></td>
            </tr>
        `).join("");

        const totalPages = Math.ceil(data.total / 10);
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
                            <td>${new Date(b.created_at).toLocaleDateString()}</td>
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

// Revenue
async function loadRevenue() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(`${API_BASE}/api/admin/revenue?days=30`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        // Daily revenue chart
        const dailyCtx = document.getElementById("dailyRevenueChart");
        if (window.dailyChart) window.dailyChart.destroy();

        window.dailyChart = new Chart(dailyCtx, {
            type: "bar",
            data: {
                labels: data.daily_revenue.map(d => d.date),
                datasets: [{
                    label: "Daily Revenue (R)",
                    data: data.daily_revenue.map(d => d.amount),
                    backgroundColor: "#064f32"
                }]
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

// Tee Times
async function loadTeeTimes() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(`${API_BASE}/api/admin/tee-times?limit=50`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await response.json();

        const table = document.getElementById("tee-times-table");
        table.innerHTML = data.tee_times.map(tt => `
            <tr>
                <td>${new Date(tt.tee_time).toLocaleString()}</td>
                <td>${tt.hole || "-"}</td>
                <td>${tt.total_bookings}</td>
                <td>R${tt.total_revenue.toFixed(2)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Failed to load tee times:", error);
    }
}

// Ledger
async function loadLedger() {
    const token = localStorage.getItem("token");

    try {
        const response = await fetch(
            `${API_BASE}/api/admin/ledger?skip=${(currentLedgerPage - 1) * 10}&limit=10`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await response.json();

        const table = document.getElementById("ledger-table");
        table.innerHTML = data.ledger_entries.map(le => `
            <tr>
                <td>#${le.id}</td>
                <td>${le.booking_id || "-"}</td>
                <td>${le.description}</td>
                <td>R${le.amount.toFixed(2)}</td>
                <td>${le.pastel_synced ? "✓" : "✗"}</td>
                <td>${new Date(le.created_at).toLocaleDateString()}</td>
            </tr>
        `).join("");

        const totalPages = Math.ceil(data.total / 10);
        renderPagination("ledger-pagination", currentLedgerPage, totalPages, (page) => {
            currentLedgerPage = page;
            loadLedger();
        });
    } catch (error) {
        console.error("Failed to load ledger:", error);
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
    document.getElementById("current-time").textContent = now.toLocaleTimeString();
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
