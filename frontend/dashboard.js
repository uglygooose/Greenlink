const API_BASE = window.location.origin;
const DASHBOARD_FETCH_TIMEOUT_MS = 12000;
const DASHBOARD_FETCH_RETRIES = 2;
const DASHBOARD_CACHE_KEY = "greenlink_basic_dashboard_users_v1";
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_role");
  window.location.href = "/frontend/index.html";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function apiRequest(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = String(options.method || "GET").toUpperCase();
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const canRetry = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const attempts = canRetry ? (DASHBOARD_FETCH_RETRIES + 1) : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DASHBOARD_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, { ...options, headers, method, signal: controller.signal });
      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const detail = data?.detail || raw || `Request failed (${response.status})`;
        const retryable = response.status === 429 || response.status >= 500 || response.status === 408;
        if (canRetry && retryable && attempt < (attempts - 1)) {
          await new Promise(resolve => window.setTimeout(resolve, 300 * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(String(detail));
      }
      return data;
    } catch (error) {
      const transient = error?.name === "AbortError" || error instanceof TypeError;
      if (!canRetry || !transient || attempt >= (attempts - 1)) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 300 * Math.pow(2, attempt)));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw new Error("Request failed");
}

function readUsersCache() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cached_at || 0);
    if (!Number.isFinite(cachedAt) || cachedAt <= 0) return null;
    if ((Date.now() - cachedAt) > DASHBOARD_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed?.users)) return null;
    return parsed.users;
  } catch {
    return null;
  }
}

function writeUsersCache(users) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ cached_at: Date.now(), users: users || [] }));
  } catch {
    // Ignore localStorage failures
  }
}

function renderUsers(users) {
  const total = Array.isArray(users) ? users.length : 0;
  const totalEl = document.getElementById("stat_total_users");
  if (totalEl) totalEl.textContent = String(total);

  const tbody = document.getElementById("dashboard_user_table");
  if (!tbody) return;
  tbody.textContent = "";

  for (const user of users || []) {
    const row = document.createElement("tr");

    const idCell = document.createElement("td");
    idCell.textContent = String(user?.id ?? "");
    row.appendChild(idCell);

    const nameCell = document.createElement("td");
    nameCell.innerHTML = escapeHtml(user?.name ?? "");
    row.appendChild(nameCell);

    const emailCell = document.createElement("td");
    emailCell.innerHTML = escapeHtml(user?.email ?? "");
    row.appendChild(emailCell);

    tbody.appendChild(row);
  }
}

async function loadDashboard() {
  const token = localStorage.getItem("token");
  const role = String(localStorage.getItem("user_role") || "").toLowerCase();

  if (!token) {
    window.location.href = "/frontend/index.html";
    return;
  }

  if (!["admin", "club_staff", "super_admin"].includes(role)) {
    window.location.href = "/frontend/index.html";
    return;
  }

  const cachedUsers = readUsersCache();
  if (cachedUsers) {
    renderUsers(cachedUsers);
  }

  try {
    const users = await apiRequest("/users/", token);
    writeUsersCache(users);
    renderUsers(users);
  } catch (error) {
    if (!cachedUsers) {
      alert(`Session invalid: ${error?.message || "please login again"}`);
      logout();
    }
  }
}

document.addEventListener("DOMContentLoaded", loadDashboard);
