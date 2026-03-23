const API_BASE = window.location.origin;
const token = localStorage.getItem("token");
if (!token) window.location.href = "/frontend/index.html";

const userRole = String(localStorage.getItem("user_role") || "player").toLowerCase();
if (userRole !== "player") window.location.href = "/frontend/admin.html";

const typeLabelsFallback = {
  member: "Member",
  visitor: "Affiliated Visitor",
  non_affiliated: "Visitor (No HNA)"
};

const state = {
  activeView: "home",
  profile: null,
  bookingWindow: null,
  bookings: [],
  teeDate: todayYmd(),
  holes: 18,
  teeFilter: "open",
  roundsFilter: "action",
  teeTimes: [],
  notifications: [],
  selectedTeeTime: null,
  bookingDraft: [],
  bookingContextByRoundId: {},
  pendingAdjustedRoundId: null,
  pendingRouteTeeTimeId: null,
  pendingRouteTab: "home",
  typeLabels: { ...typeLabelsFallback },
  currencySymbol: "R",
  clubConfig: null,
  clubFeed: [],
  clubMessages: []
};

const API_TIMEOUT_MS = 15000;
const API_RETRY_ATTEMPTS = 2;
const API_RETRY_BASE_MS = 320;
const TEE_RANGE_CACHE_TTL_MS = 30000;
const TEE_RANGE_CACHE_MAX_ENTRIES = 24;
const teeRangeCache = new Map();

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdToDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToYmd(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(dateYmd, days) {
  const base = ymdToDate(dateYmd) || ymdToDate(todayYmd());
  if (!base) return todayYmd();
  base.setDate(base.getDate() + Number(days || 0));
  return dateToYmd(base);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-ZA");
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function bookingStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  const labels = {
    booked: "Booked",
    checked_in: "Checked In",
    completed: "Completed",
    no_show: "No-show",
    cancelled: "Cancelled"
  };
  return labels[key] || "Booked";
}

function roundPillClass(item) {
  const round = item?.round || null;
  if (!round) return "";
  if (round.no_return) return "bad";
  if (round.closed) return "ok";
  return "";
}

function roundStateLabel(item) {
  const round = item?.round || null;
  if (!round) return "Not Open";
  if (round.no_return) return "No Return";
  if (round.closed) return "Closed";
  return "Open";
}

function weatherResponseLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "confirm_playing") return "Confirmed";
  if (key === "request_cancel") return "Cancel Req";
  if (key === "request_callback") return "Call Back";
  return "Pending";
}

function weatherResponsePillClass(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "confirm_playing") return "ok";
  if (key === "request_cancel" || key === "request_callback") return "warn";
  return "";
}

function inferPlayerType(profile) {
  const accountType = String(profile?.account_type || "").trim().toLowerCase();
  if (state.typeLabels[accountType]) return accountType;
  const home = String(profile?.home_course || "").trim().toLowerCase();
  const hasHna = Boolean(String(profile?.handicap_sa_id || "").trim());
  if (window.Greenlink?.homeClubIsMember?.(home, state.clubConfig)) return "member";
  if (home || hasHna) return "visitor";
  return "non_affiliated";
}

function profileCompleteness(profile) {
  const missing = [];
  if (!String(profile?.phone || "").trim()) missing.push("phone");
  if (!String(profile?.birth_date || "").trim()) missing.push("birth date");
  if (!String(profile?.home_course || "").trim()) missing.push("home club");
  return missing;
}

function setStatusBanner(message = "", show = false) {
  const el = document.getElementById("status-banner");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("show", Boolean(show && message));
}

function showToast(message, type = "") {
  const wrap = document.getElementById("toast");
  if (!wrap) return;
  wrap.innerHTML = `<div class="toast-msg ${type === "error" ? "error" : type === "ok" ? "ok" : ""}">${escapeHtml(message)}</div>`;
  wrap.classList.add("show");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => wrap.classList.remove("show"), 2800);
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user_role");
  window.location.href = "/frontend/index.html";
}

function delayMs(ms) {
  const wait = Math.max(0, Number(ms || 0));
  return new Promise(resolve => window.setTimeout(resolve, wait));
}

function isReadMethod(method) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function retryAfterDelayMs(response) {
  const raw = String(response?.headers?.get?.("Retry-After") || "").trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - Date.now());
}

function shouldRetryStatus(status) {
  const code = Number(status || 0);
  return code === 408 || code === 429 || code >= 500;
}

async function api(path, options = {}) {
  const opts = { ...options };
  const method = String(opts.method || "GET").trim().toUpperCase() || "GET";
  const headers = new Headers(opts.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  opts.headers = headers;
  opts.method = method;

  const canRetry = isReadMethod(method);
  const maxAttempts = canRetry ? (API_RETRY_ATTEMPTS + 1) : 1;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}${path}`, { ...opts, signal: controller.signal });
      const raw = await response.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (response.ok) return data;

      let detail = data?.detail;
      if (detail && typeof detail === "object") detail = detail.message || JSON.stringify(detail);
      const error = new Error(String(detail || raw || `Request failed (${response.status})`));
      lastError = error;

      if (!canRetry || !shouldRetryStatus(response.status) || attempt >= (maxAttempts - 1)) {
        throw error;
      }

      const retryDelay = Math.max(
        retryAfterDelayMs(response),
        Math.round(API_RETRY_BASE_MS * Math.pow(2, attempt))
      );
      await delayMs(retryDelay);
    } catch (err) {
      lastError = err;
      const transientNetworkError = err?.name === "AbortError" || err instanceof TypeError;
      if (!canRetry || !transientNetworkError || attempt >= (maxAttempts - 1)) {
        throw err;
      }
      await delayMs(Math.round(API_RETRY_BASE_MS * Math.pow(2, attempt)));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Request failed");
}

function buildRangeForDate(dateYmd) {
  const d = ymdToDate(dateYmd);
  if (!d) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return {
    startIso: `${dateToYmd(start)}T00:00:00`,
    endIso: `${dateToYmd(end)}T00:00:00`
  };
}

function teeRangeCacheKey(range) {
  return `${String(range?.startIso || "")}|${String(range?.endIso || "")}`;
}

function getCachedTeeRange(range) {
  const key = teeRangeCacheKey(range);
  const entry = teeRangeCache.get(key);
  if (!entry || !Array.isArray(entry.rows)) return null;
  const age = Date.now() - Number(entry.cachedAt || 0);
  if (age > TEE_RANGE_CACHE_TTL_MS) {
    teeRangeCache.delete(key);
    return null;
  }
  return entry.rows.map(row => ({ ...row }));
}

function setCachedTeeRange(range, rows) {
  const key = teeRangeCacheKey(range);
  teeRangeCache.set(key, {
    cachedAt: Date.now(),
    rows: Array.isArray(rows) ? rows.map(row => ({ ...row })) : []
  });

  if (teeRangeCache.size <= TEE_RANGE_CACHE_MAX_ENTRIES) return;
  let oldestKey = null;
  let oldestTs = Number.MAX_SAFE_INTEGER;
  for (const [k, value] of teeRangeCache.entries()) {
    const ts = Number(value?.cachedAt || 0);
    if (ts < oldestTs) {
      oldestTs = ts;
      oldestKey = k;
    }
  }
  if (oldestKey) teeRangeCache.delete(oldestKey);
}

function invalidateTeeCache() {
  teeRangeCache.clear();
}

function applyRouteState() {
  const params = new URLSearchParams(window.location.search || "");
  const tab = String(params.get("tab") || "").trim().toLowerCase();
  const teeTimeId = Number(params.get("tee_time_id") || 0);
  const allowed = new Set(["home", "book", "rounds", "profile"]);
  state.pendingRouteTab = allowed.has(tab) ? tab : "home";
  state.pendingRouteTeeTimeId = Number.isFinite(teeTimeId) && teeTimeId > 0 ? teeTimeId : null;
}

function pushViewToUrl(view) {
  const params = new URLSearchParams(window.location.search || "");
  params.set("tab", view);
  if (view !== "book") params.delete("tee_time_id");
  const next = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", next);
}

function setActiveView(view, { syncUrl = true } = {}) {
  const allowed = new Set(["home", "book", "rounds", "profile"]);
  const next = allowed.has(view) ? view : "home";
  state.activeView = next;

  document.querySelectorAll(".view").forEach(el => {
    el.classList.toggle("active", String(el.dataset.view) === next);
  });
  document.querySelectorAll(".tab-btn").forEach(el => {
    el.classList.toggle("active", String(el.dataset.view) === next);
  });

  if (syncUrl) pushViewToUrl(next);
}

function bookingWindowMaxYmd() {
  const maxRaw = String(state.bookingWindow?.max_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(maxRaw)) return maxRaw;
  return "";
}

function clampBookDate(dateYmd) {
  const today = todayYmd();
  let next = /^\d{4}-\d{2}-\d{2}$/.test(String(dateYmd || "")) ? String(dateYmd) : today;
  if (next < today) next = today;
  const maxYmd = bookingWindowMaxYmd();
  if (maxYmd && next > maxYmd) next = maxYmd;
  return next;
}

function syncBookDateConstraints() {
  const input = document.getElementById("book-date");
  const maxYmd = bookingWindowMaxYmd();
  const today = todayYmd();
  state.teeDate = clampBookDate(state.teeDate);
  if (!input) return;

  input.min = today;
  input.max = maxYmd || "";
  input.value = state.teeDate;

  const prevBtn = document.getElementById("book-prev-day");
  const nextBtn = document.getElementById("book-next-day");
  if (prevBtn) prevBtn.disabled = state.teeDate <= today;
  if (nextBtn) nextBtn.disabled = Boolean(maxYmd) && state.teeDate >= maxYmd;
}

function stepBookDate(days) {
  const next = clampBookDate(addDaysYmd(state.teeDate, days));
  if (next === state.teeDate) return false;
  state.teeDate = next;
  syncBookDateConstraints();
  return true;
}

function upcomingBookings(limit = 0) {
  const now = new Date();
  const rows = (state.bookings || [])
    .filter(row => {
      const tee = new Date(row?.tee_time || "");
      const status = String(row?.status || "").toLowerCase();
      return !Number.isNaN(tee.getTime()) && tee >= now && !["cancelled", "no_show"].includes(status);
    })
    .sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function bookingNeedsRoundAction(item) {
  return Boolean(item?.can_open_round || item?.can_submit_round);
}

function roundIsOpen(item) {
  return Boolean(item?.round && !item?.round?.closed);
}

function roundIsClosed(item) {
  return Boolean(item?.round?.closed);
}

function profileReadinessItems(profile = state.profile || {}) {
  const inferredType = inferPlayerType(profile);
  const isMember = inferredType === "member";
  const requiresHna = inferredType !== "non_affiliated";
  return [
    { label: "Phone number", ok: Boolean(String(profile?.phone || "").trim()) },
    { label: "Birth date", ok: Boolean(String(profile?.birth_date || "").trim()) },
    { label: "Home club", ok: Boolean(String(profile?.home_course || "").trim()) },
    { label: "Member number", ok: isMember ? Boolean(String(profile?.member_number || "").trim() || profile?.linked_member) : true },
    { label: "HNA SA ID", ok: requiresHna ? Boolean(String(profile?.handicap_sa_id || "").trim()) : true }
  ];
}

function teeSlotSummary(tt) {
  const capacity = Math.max(1, Number(tt?.capacity || 4));
  const booked = Array.isArray(tt?.bookings) ? tt.bookings.length : 0;
  const openSpots = Math.max(0, capacity - booked);
  const status = String(tt?.status || "open").toLowerCase();
  const canBook = openSpots > 0 && status !== "blocked";
  return { capacity, booked, openSpots, status, canBook };
}

function renderSummaryChips() {
  const profile = state.profile || {};
  const bookingWindow = state.bookingWindow || {};
  const playerType = inferPlayerType(profile);
  const memberLabel = state.typeLabels[playerType] || "Visitor";
  const hnaLabel = profile?.handicap_sa_id ? `HNA ${profile.handicap_sa_id}` : "HNA not linked";
  const windowText = Number.isFinite(Number(bookingWindow?.window_days))
    ? `${bookingWindow.window_days} days`
    : "--";

  const chipMembership = document.getElementById("chip-membership");
  const chipWindow = document.getElementById("chip-window");
  const chipHna = document.getElementById("chip-hna");
  const chipBookWindow = document.getElementById("booking-window-chip");
  const roundsMemberChip = document.getElementById("round-member-chip");
  const roundsIndexChip = document.getElementById("round-index-chip");

  if (chipMembership) chipMembership.textContent = `Membership: ${memberLabel}`;
  if (chipWindow) chipWindow.textContent = `Booking window: ${windowText}`;
  if (chipHna) chipHna.textContent = hnaLabel;
  if (chipBookWindow) chipBookWindow.textContent = `Window: ${windowText}`;
  if (roundsMemberChip) {
    roundsMemberChip.textContent = profile?.linked_member
      ? `Member link: #${profile?.linked_member_id || "linked"}`
      : "Member link: not linked";
  }
  if (roundsIndexChip) {
    const indexBits = [];
    if (profile?.handicap_sa_id) indexBits.push(`HNA ${profile.handicap_sa_id}`);
    if (profile?.handicap_index != null) indexBits.push(`Idx ${profile.handicap_index}`);
    roundsIndexChip.textContent = indexBits.length ? `HNA/Index: ${indexBits.join(" | ")}` : "HNA/Index: not set";
  }

  const note = document.getElementById("book-window-note");
  if (note) {
    const maxDate = bookingWindow?.max_date ? formatDate(bookingWindow.max_date) : "-";
    note.textContent = `Your booking access: ${memberLabel}, max booking date ${maxDate}.`;
  }

  syncBookDateConstraints();
}

function renderHome() {
  const profile = state.profile || {};
  const greeting = document.getElementById("home-greeting");
  const subtitle = document.getElementById("home-subtitle");
  const upcomingList = document.getElementById("upcoming-list");
  const nextCard = document.getElementById("next-booking-card");
  if (greeting) greeting.textContent = `Welcome, ${profile?.name || "Player"}`;

  const missing = profileCompleteness(profile);
  if (subtitle) {
    subtitle.textContent = missing.length
      ? `Complete ${missing.join(", ")} to keep booking and HNA actions reliable.`
      : `${state.clubConfig?.display_name || state.clubConfig?.club_name || "Your club"} bookings, rounds, news, and messages in one branded member flow.`;
  }

  const upcoming = upcomingBookings(6);
  const next = upcoming[0] || null;
  const weatherActionCount = (state.notifications || []).filter(item => !String(item?.response || "").trim()).length;
  const actionCount = (state.bookings || []).filter(bookingNeedsRoundAction).length + weatherActionCount;
  const checklist = profileReadinessItems(profile);
  const ready = checklist.filter(item => item.ok).length;
  const readinessPct = checklist.length ? Math.round((ready / checklist.length) * 100) : 0;

  const statUpcoming = document.getElementById("home-metric-upcoming");
  const statActions = document.getElementById("home-metric-actions");
  const statProfile = document.getElementById("home-metric-profile");
  if (statUpcoming) statUpcoming.textContent = formatInteger(upcoming.length);
  if (statActions) statActions.textContent = formatInteger(actionCount);
  if (statProfile) statProfile.textContent = `${readinessPct}%`;

  if (nextCard) {
    if (!next) {
      nextCard.innerHTML = `<div class="empty-state">No upcoming tee times. Open Book to reserve your next round.</div>`;
    } else {
      const status = bookingStatusLabel(next?.status);
      nextCard.innerHTML = `
        <div class="callout-title">${escapeHtml(formatDateTime(next?.tee_time))}</div>
        <div class="callout-meta">${escapeHtml(next?.player_name || profile?.name || "Booking")} · ${escapeHtml(status)} · ${escapeHtml(roundStateLabel(next))}</div>
      `;
    }
  }

  if (!upcomingList) return;
  if (!upcoming.length) {
    upcomingList.innerHTML = `<div class="empty-state">No upcoming bookings yet. Use the Book tab to reserve a tee time.</div>`;
    return;
  }

  upcomingList.innerHTML = upcoming.map(item => {
    const roundLabel = roundStateLabel(item);
    const roundClass = roundPillClass(item);
    const status = bookingStatusLabel(item?.status);
    return `
      <div class="list-row">
        <div class="list-row-header">
          <div class="list-row-title">${escapeHtml(formatDateTime(item?.tee_time))}</div>
          <span class="pill ${roundClass}">${escapeHtml(roundLabel)}</span>
        </div>
        <div class="row-meta">${escapeHtml(status)} · ${escapeHtml(item?.player_name || profile?.name || "Booking")}</div>
      </div>
    `;
  }).join("");
}

function renderWeatherAlerts() {
  const listEl = document.getElementById("weather-alert-list");
  if (!listEl) return;

  const rows = (Array.isArray(state.notifications) ? state.notifications : [])
    .filter(item => String(item?.kind || "").trim().toLowerCase() === "weather_reconfirm")
    .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">No weather prompts right now.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(item => {
    const payload = (item?.payload && typeof item.payload === "object") ? item.payload : {};
    const teeTime = payload?.tee_time || null;
    const teeLabel = String(payload?.tee_label || "1");
    const riskLevel = String(payload?.risk_level || "medium").toLowerCase();
    const riskClass = riskLevel === "high" ? "bad" : riskLevel === "medium" ? "warn" : "";
    const riskLabel = riskLevel === "high" ? "High Risk" : riskLevel === "medium" ? "Weather Risk" : "Review";
    const response = String(item?.response || "").trim().toLowerCase();
    const responseClass = weatherResponsePillClass(response);
    const responseLabel = weatherResponseLabel(response);
    const reasons = Array.isArray(payload?.risk_reasons) ? payload.risk_reasons : [];
    const reasonText = reasons.length ? reasons.join(", ") : "Weather advisory.";
    const notificationId = Number(item?.id || 0);
    const canRespond = !response && notificationId > 0;

    return `
      <div class="list-row">
        <div class="list-row-header">
          <div class="list-row-title">${escapeHtml(teeTime ? formatDateTime(teeTime) : "Upcoming booking")}</div>
          <span class="pill ${riskClass}">${escapeHtml(riskLabel)}</span>
        </div>
        <div class="row-meta">Tee ${escapeHtml(teeLabel)} · ${escapeHtml(reasonText)}</div>
        <div class="row-meta">${escapeHtml(item?.body || "")}</div>
        <div class="list-row-header">
          <span class="pill ${responseClass}">${escapeHtml(responseLabel)}</span>
          ${canRespond ? `
            <div class="round-actions">
              <button class="btn primary small" type="button" data-action="weather-response" data-notification-id="${notificationId}" data-weather-response="confirm_playing">Still Playing</button>
              <button class="btn outline small" type="button" data-action="weather-response" data-notification-id="${notificationId}" data-weather-response="request_cancel">Need to Cancel</button>
              <button class="btn ghost small" type="button" data-action="weather-response" data-notification-id="${notificationId}" data-weather-response="request_callback">Call Me</button>
            </div>
          ` : ``}
        </div>
      </div>
    `;
  }).join("");
}

function renderClubFeed() {
  const feedEl = document.getElementById("club-feed-list");
  const messageEl = document.getElementById("club-message-list");
  if (feedEl) {
    if (!state.clubFeed.length) {
      feedEl.innerHTML = `<div class="empty-state">No club announcements or news published yet.</div>`;
    } else {
      feedEl.innerHTML = state.clubFeed.map(item => `
        <div class="list-row">
          <div class="list-row-header">
            <div class="list-row-title">${escapeHtml(item?.title || "Club update")}</div>
            <span class="pill">${escapeHtml(String(item?.kind || "update").replaceAll("_", " "))}</span>
          </div>
          <div class="row-meta">${escapeHtml(item?.summary || item?.body || "")}</div>
        </div>
      `).join("");
    }
  }
  if (messageEl) {
    if (!state.clubMessages.length) {
      messageEl.innerHTML = `<div class="empty-state">No direct club messages right now.</div>`;
    } else {
      messageEl.innerHTML = state.clubMessages.map(item => `
        <div class="list-row">
          <div class="list-row-header">
            <div class="list-row-title">${escapeHtml(item?.title || "Club message")}</div>
            <span class="pill ${item?.requires_action ? "warn" : ""}">${item?.requires_action ? "Action" : "Message"}</span>
          </div>
          <div class="row-meta">${escapeHtml(item?.body || "")}</div>
        </div>
      `).join("");
    }
  }
}

function renderTeeTimes() {
  const listEl = document.getElementById("tee-list");
  const countEl = document.getElementById("tee-count-label");
  if (!listEl) return;

  const rows = [...(state.teeTimes || [])].sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time));
  let openCount = 0;
  let fullCount = 0;
  let blockedCount = 0;
  rows.forEach(tt => {
    const summary = teeSlotSummary(tt);
    if (summary.status === "blocked") blockedCount += 1;
    else if (summary.canBook) openCount += 1;
    else fullCount += 1;
  });

  const statOpen = document.getElementById("tee-stat-open");
  const statFull = document.getElementById("tee-stat-full");
  const statBlocked = document.getElementById("tee-stat-blocked");
  if (statOpen) statOpen.textContent = formatInteger(openCount);
  if (statFull) statFull.textContent = formatInteger(fullCount);
  if (statBlocked) statBlocked.textContent = formatInteger(blockedCount);

  document.querySelectorAll(".tee-filter-btn").forEach(btn => {
    btn.classList.toggle("active", String(btn.dataset.teeFilter || "open") === state.teeFilter);
  });

  const filtered = rows.filter(tt => {
    const summary = teeSlotSummary(tt);
    if (state.teeFilter === "all") return true;
    if (state.teeFilter === "blocked") return summary.status === "blocked";
    return summary.canBook;
  });

  if (countEl) countEl.textContent = `${formatInteger(filtered.length)} shown (${formatInteger(rows.length)} total)`;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">No tee times available for this day.</div>`;
    return;
  }
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">No tee times match this filter. Try “All” or another date.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(tt => {
    const summary = teeSlotSummary(tt);
    const teeLabel = String(tt?.hole || "1");
    const statusText = summary.status === "blocked"
      ? "Blocked"
      : summary.canBook
        ? `${formatInteger(summary.openSpots)} Open`
        : "Full";
    const pillClass = summary.status === "blocked" ? "bad" : summary.canBook ? "ok" : "warn";
    return `
      <div class="tee-item">
        <div class="tee-main">
          <div>
            <div class="tee-time">${escapeHtml(formatTime(tt?.tee_time))}</div>
            <div class="tee-meta">Tee ${escapeHtml(teeLabel)} · ${escapeHtml(formatDate(tt?.tee_time))} · ${state.holes} holes</div>
          </div>
          <span class="pill ${pillClass}">${escapeHtml(statusText)}</span>
        </div>
        <div class="tee-foot">
          <span class="muted">${formatInteger(summary.booked)} / ${formatInteger(summary.capacity)} booked</span>
          <button class="btn ${summary.canBook ? "primary" : "outline"} small" type="button" data-action="book-tee" data-tee-id="${Number(tt?.id || 0)}" ${summary.canBook ? "" : "disabled"}>
            ${summary.canBook ? "Book Slot" : "Unavailable"}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderRounds() {
  const listEl = document.getElementById("rounds-list");
  if (!listEl) return;
  const rows = Array.isArray(state.bookings) ? [...state.bookings] : [];

  const actionCount = rows.filter(bookingNeedsRoundAction).length;
  const openCount = rows.filter(roundIsOpen).length;
  const closedCount = rows.filter(roundIsClosed).length;
  const statAction = document.getElementById("rounds-stat-action");
  const statOpen = document.getElementById("rounds-stat-open");
  const statClosed = document.getElementById("rounds-stat-closed");
  if (statAction) statAction.textContent = formatInteger(actionCount);
  if (statOpen) statOpen.textContent = formatInteger(openCount);
  if (statClosed) statClosed.textContent = formatInteger(closedCount);

  document.querySelectorAll(".round-filter-btn").forEach(btn => {
    btn.classList.toggle("active", String(btn.dataset.roundFilter || "action") === state.roundsFilter);
  });

  const filtered = rows.filter(item => {
    if (state.roundsFilter === "all") return true;
    if (state.roundsFilter === "open") return roundIsOpen(item) || item?.can_open_round;
    if (state.roundsFilter === "closed") return roundIsClosed(item);
    return bookingNeedsRoundAction(item);
  });

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">No rounds yet. Book a tee time and open a round when ready.</div>`;
    return;
  }
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">No rounds match this view.</div>`;
    return;
  }

  state.bookingContextByRoundId = {};
  listEl.innerHTML = filtered.map(item => {
    const round = item?.round || null;
    const roundLabel = roundStateLabel(item);
    const roundClass = roundPillClass(item);
    const bookingId = Number(item?.booking_id || 0);
    const roundId = Number(round?.id || 0);
    if (roundId > 0) state.bookingContextByRoundId[roundId] = item;
    const modeLabel = round?.mode === "adjusted_gross" ? "Adjusted Gross" : "Hole by Hole";
    const submitted = round?.submitted_at ? formatDateTime(round.submitted_at) : "-";

    const actionButtons = [];
    if (item?.can_open_round) {
      actionButtons.push(`<button class="btn ghost small" type="button" data-action="open-round" data-mode="hole_by_hole" data-booking-id="${bookingId}">Open Hole-by-Hole</button>`);
      actionButtons.push(`<button class="btn ghost small" type="button" data-action="open-round" data-mode="adjusted_gross" data-booking-id="${bookingId}">Open Adjusted</button>`);
    }
    if (item?.can_submit_round && roundId > 0) {
      actionButtons.push(`<button class="btn primary small" type="button" data-action="submit-adjusted" data-round-id="${roundId}">Submit Adjusted</button>`);
      actionButtons.push(`<button class="btn outline small" type="button" data-action="mark-nr" data-round-id="${roundId}">Mark N/R</button>`);
    }

    return `
      <div class="list-row">
        <div class="list-row-header">
          <div class="list-row-title">${escapeHtml(item?.player_name || "Booking")} · ${escapeHtml(formatDateTime(item?.tee_time))}</div>
          <span class="pill ${roundClass}">${escapeHtml(roundLabel)}</span>
        </div>
        <div class="row-meta">${escapeHtml(bookingStatusLabel(item?.status))} · Mode: ${escapeHtml(modeLabel)} · Submitted: ${escapeHtml(submitted)}</div>
        <div class="round-actions">${actionButtons.join("") || `<span class="muted">No actions available.</span>`}</div>
      </div>
    `;
  }).join("");
}

function populateProfileForm() {
  const profile = state.profile || {};
  const field = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value == null ? "" : String(value);
  };
  field("profile-name", profile?.name || "");
  field("profile-phone", profile?.phone || "");
  field("profile-birth-date", profile?.birth_date || "");
  field("profile-account-type", profile?.account_type || "");
  field("profile-member-number", profile?.member_number || "");
  field("profile-handicap-number", profile?.handicap_number || "");
  field("profile-handicap-sa", profile?.handicap_sa_id || "");
  field("profile-home-course", profile?.home_course || "");
  field("profile-index", profile?.handicap_index ?? "");
  field("profile-gender", profile?.gender || "");
  field("profile-category", profile?.player_category || "");

  const status = document.getElementById("profile-link-status");
  if (status) {
    status.textContent = profile?.linked_member
      ? `Linked member ID: ${profile?.linked_member_id || ""}`
      : "No linked member profile";
  }
}

function renderProfileChecklist() {
  const wrap = document.getElementById("profile-checklist");
  const label = document.getElementById("profile-readiness");
  if (!wrap) return;
  const items = profileReadinessItems(state.profile || {});
  const ready = items.filter(item => item.ok).length;
  const pct = items.length ? Math.round((ready / items.length) * 100) : 0;
  if (label) label.textContent = `${formatInteger(ready)} / ${formatInteger(items.length)} complete (${pct}%)`;
  wrap.innerHTML = items.map(item => `
    <div class="check-item ${item.ok ? "ok" : "warn"}">
      <span class="check-label">${escapeHtml(item.label)}</span>
      <span class="check-state">${item.ok ? "Ready" : "Missing"}</span>
    </div>
  `).join("");
}

function renderAll() {
  renderSummaryChips();
  renderHome();
  renderWeatherAlerts();
  renderClubFeed();
  renderTeeTimes();
  renderRounds();
  renderProfileChecklist();
  populateProfileForm();

  const missing = profileCompleteness(state.profile || {});
  const pendingWeather = (state.notifications || []).filter(item => !String(item?.response || "").trim()).length;
  if (pendingWeather > 0) {
    setStatusBanner(`You have ${formatInteger(pendingWeather)} weather prompt${pendingWeather === 1 ? "" : "s"} requiring response.`, true);
  } else if (missing.length) {
    setStatusBanner(`Complete ${missing.join(", ")} to avoid booking and scoring issues.`, true);
  } else {
    setStatusBanner("", false);
  }
}

async function loadProfile() {
  const profile = await api("/profile/me");
  state.profile = profile || {};
  return profile;
}

async function loadBookingWindow() {
  try {
    const response = await api("/settings/booking-window");
    state.bookingWindow = response || null;
  } catch {
    state.bookingWindow = null;
  }
}

async function loadMyBookings() {
  try {
    const response = await api("/scoring/my-bookings?days=90&include_past=true");
    state.bookings = Array.isArray(response?.bookings) ? response.bookings : [];
  } catch (err) {
    state.bookings = [];
    showToast(err?.message || "Failed to load bookings", "error");
  }
}

async function loadNotifications() {
  try {
    const response = await api("/profile/notifications?state=all&kind=weather_reconfirm&limit=30");
    state.notifications = Array.isArray(response?.items) ? response.items : [];
  } catch (err) {
    state.notifications = [];
    showToast(err?.message || "Failed to load weather prompts", "error");
  }
}

async function loadClubFeed() {
  try {
    const response = await api("/profile/club-feed?limit=8");
    state.clubFeed = Array.isArray(response?.communications) ? response.communications : [];
    state.clubMessages = Array.isArray(response?.messages) ? response.messages : [];
  } catch (err) {
    state.clubFeed = [];
    state.clubMessages = [];
    showToast(err?.message || "Failed to load club updates", "error");
  }
}

async function respondToWeatherNotification(notificationId, action) {
  const id = Number(notificationId || 0);
  const actionValue = String(action || "").trim().toLowerCase();
  if (!(id > 0) || !["confirm_playing", "request_cancel", "request_callback"].includes(actionValue)) return;

  try {
    await api(`/profile/notifications/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action: actionValue })
    });
    showToast("Response saved.", "ok");
    await Promise.all([loadNotifications(), loadMyBookings()]);
    renderAll();
  } catch (err) {
    showToast(err?.message || "Failed to save response.", "error");
  }
}

async function loadTeeTimes(forceRefresh = false) {
  state.teeDate = clampBookDate(state.teeDate);
  syncBookDateConstraints();
  const range = buildRangeForDate(state.teeDate);
  if (!range) {
    state.teeTimes = [];
    renderTeeTimes();
    return;
  }
  let hadCachedRows = false;
  if (!forceRefresh) {
    const cachedRows = getCachedTeeRange(range);
    if (cachedRows) {
      hadCachedRows = true;
      state.teeTimes = cachedRows;
      renderTeeTimes();
    }
  }

  try {
    const response = await api(`/tsheet/range?start=${encodeURIComponent(range.startIso)}&end=${encodeURIComponent(range.endIso)}`);
    state.teeTimes = Array.isArray(response) ? response : [];
    setCachedTeeRange(range, state.teeTimes);
  } catch (err) {
    if (!hadCachedRows) {
      state.teeTimes = [];
      showToast(err?.message || "Failed to load tee sheet", "error");
    }
  }
  renderTeeTimes();
  if (state.pendingRouteTeeTimeId) {
    const exists = state.teeTimes.find(tt => Number(tt?.id || 0) === Number(state.pendingRouteTeeTimeId));
    if (exists) {
      openBookingSheet(Number(state.pendingRouteTeeTimeId));
    }
    state.pendingRouteTeeTimeId = null;
  }
}

function buildSelfDraftRow() {
  const profile = state.profile || {};
  return {
    is_self: true,
    name: String(profile?.name || "").trim(),
    email: String(profile?.email || "").trim(),
    player_type: inferPlayerType(profile),
    prepaid: false,
    cart: false,
    push_cart: false,
    caddy: false
  };
}

function buildGuestDraftRow() {
  return {
    is_self: false,
    name: "",
    email: "",
    player_type: "visitor",
    prepaid: false,
    cart: false,
    push_cart: false,
    caddy: false
  };
}

function openSheet(name) {
  const el = document.getElementById(name === "booking" ? "booking-sheet" : "score-sheet");
  if (!el) return;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}

function closeSheet(name) {
  const el = document.getElementById(name === "booking" ? "booking-sheet" : "score-sheet");
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  if (name === "score") {
    state.pendingAdjustedRoundId = null;
    const input = document.getElementById("adjusted-score-input");
    if (input) input.value = "";
  }
}

function selectedTeeOpenSpots() {
  if (!state.selectedTeeTime) return 0;
  return teeSlotSummary(state.selectedTeeTime).openSpots;
}

function refreshBookingSheetMeta() {
  const summary = document.getElementById("sheet-tee-summary");
  const capNote = document.getElementById("booking-capacity-note");
  const addBtn = document.getElementById("add-guest-btn");
  if (!state.selectedTeeTime) {
    if (summary) summary.textContent = "";
    if (capNote) capNote.textContent = "";
    if (addBtn) addBtn.disabled = true;
    return;
  }

  const tee = state.selectedTeeTime;
  const slot = teeSlotSummary(tee);
  const remaining = Math.max(0, slot.openSpots - state.bookingDraft.length);

  if (summary) {
    summary.textContent = `${formatDateTime(tee?.tee_time)} · Tee ${tee?.hole || "1"} · ${state.holes} holes`;
  }
  if (capNote) {
    capNote.textContent = `${formatInteger(slot.booked)} of ${formatInteger(slot.capacity)} booked · You can add ${formatInteger(remaining)} more player${remaining === 1 ? "" : "s"}.`;
  }
  if (addBtn) addBtn.disabled = remaining <= 0;
}

function renderBookingDraftRows() {
  const rowsEl = document.getElementById("booking-rows");
  if (!rowsEl) return;
  let guestOrdinal = 0;
  rowsEl.innerHTML = state.bookingDraft.map((row, index) => {
    if (!row.is_self) guestOrdinal += 1;
    const title = row.is_self ? "You" : `Guest ${guestOrdinal}`;
    return `
      <div class="booking-row">
        <div class="booking-row-head">
          <div class="booking-row-title">${title}</div>
          ${row.is_self ? `<span class="pill ok">Primary</span>` : `<button class="btn outline small" type="button" data-action="remove-draft-row" data-index="${index}">Remove</button>`}
        </div>
        <div class="booking-row-grid">
          <div class="field">
            <label>Name</label>
            <input type="text" data-index="${index}" data-field="name" value="${escapeHtml(row.name)}" ${row.is_self ? "readonly" : ""} required>
          </div>
          <div class="field">
            <label>Email</label>
            <input type="email" data-index="${index}" data-field="email" value="${escapeHtml(row.email)}" ${row.is_self ? "readonly" : ""}>
          </div>
          <div class="field">
            <label>Type</label>
            <select data-index="${index}" data-field="player_type" ${row.is_self ? "disabled" : ""}>
              <option value="member" ${row.player_type === "member" ? "selected" : ""}>Member</option>
              <option value="visitor" ${row.player_type === "visitor" ? "selected" : ""}>Affiliated Visitor</option>
              <option value="non_affiliated" ${row.player_type === "non_affiliated" ? "selected" : ""}>Visitor (No HNA)</option>
            </select>
          </div>
        </div>
        <div class="booking-row-toggles">
          <label class="toggle-pill"><input type="checkbox" data-index="${index}" data-field="prepaid" ${row.prepaid ? "checked" : ""}> Prepaid</label>
          <label class="toggle-pill"><input type="checkbox" data-index="${index}" data-field="cart" ${row.cart ? "checked" : ""}> Cart</label>
          <label class="toggle-pill"><input type="checkbox" data-index="${index}" data-field="push_cart" ${row.push_cart ? "checked" : ""}> Push Cart</label>
          <label class="toggle-pill"><input type="checkbox" data-index="${index}" data-field="caddy" ${row.caddy ? "checked" : ""}> Caddy</label>
        </div>
      </div>
    `;
  }).join("");
  refreshBookingSheetMeta();
}

function openBookingSheet(teeTimeId) {
  const tee = (state.teeTimes || []).find(tt => Number(tt?.id || 0) === Number(teeTimeId));
  if (!tee) return;
  state.selectedTeeTime = tee;
  state.bookingDraft = [buildSelfDraftRow()];
  renderBookingDraftRows();
  openSheet("booking");
}

function updateDraftField(target) {
  const index = Number(target?.dataset?.index || -1);
  const field = String(target?.dataset?.field || "");
  if (!Number.isInteger(index) || index < 0 || !field) return;
  const row = state.bookingDraft[index];
  if (!row) return;
  const nextValue = target.type === "checkbox" ? Boolean(target.checked) : String(target.value || "");
  row[field] = nextValue;
  if (field === "player_type" && !["member", "visitor", "non_affiliated"].includes(String(nextValue))) {
    row[field] = "visitor";
  }
  refreshBookingSheetMeta();
}

async function submitBookingDraft() {
  if (!state.selectedTeeTime) {
    showToast("Select a tee time first.", "error");
    return;
  }
  const submitBtn = document.getElementById("submit-booking-btn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const teeTimeId = Number(state.selectedTeeTime.id || 0);
    if (teeTimeId <= 0) throw new Error("Invalid tee time.");

    const profile = state.profile || {};
    const rows = state.bookingDraft || [];
    if (!rows.length) throw new Error("Add at least one player.");

    const openSpots = selectedTeeOpenSpots();
    if (rows.length > openSpots) {
      throw new Error(`Only ${formatInteger(openSpots)} open spot${openSpots === 1 ? "" : "s"} left for this tee time.`);
    }

    const errors = [];
    let created = 0;
    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      const name = String(row?.name || "").trim();
      if (!name) {
        errors.push(`Row ${idx + 1}: name is required.`);
        continue;
      }
      const email = String(row?.email || "").trim();
      const payload = {
        tee_time_id: teeTimeId,
        player_name: name,
        player_email: email || null,
        member_id: row.is_self ? (profile?.linked_member_id || null) : null,
        player_type: String(row?.player_type || "visitor").trim().toLowerCase() || "visitor",
        source: "member",
        holes: Number(state.holes) === 9 ? 9 : 18,
        prepaid: Boolean(row?.prepaid),
        cart: Boolean(row?.cart),
        push_cart: Boolean(row?.push_cart),
        caddy: Boolean(row?.caddy),
        handicap_sa_id: row.is_self ? (profile?.handicap_sa_id || null) : null,
        home_club: row.is_self ? (profile?.home_course || null) : null,
        handicap_index: row.is_self && profile?.handicap_index != null ? Number(profile.handicap_index) : null,
        auto_price: true
      };
      try {
        await api("/tsheet/booking", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        created += 1;
      } catch (err) {
        errors.push(`Row ${idx + 1}: ${err?.message || "booking failed"}`);
      }
    }

    if (created > 0) {
      showToast(`Created ${formatInteger(created)} booking${created === 1 ? "" : "s"}.`, "ok");
      closeSheet("booking");
      invalidateTeeCache();
      await Promise.all([loadTeeTimes(), loadMyBookings()]);
      renderAll();
    }
    if (errors.length) {
      showToast(errors.slice(0, 2).join(" "), "error");
    }
  } catch (err) {
    showToast(err?.message || "Failed to create booking.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function openRound(bookingId, mode) {
  try {
    await api("/scoring/my-rounds/open", {
      method: "POST",
      body: JSON.stringify({ booking_id: Number(bookingId), scoring_mode: mode || "hole_by_hole" })
    });
    showToast("Round opened.", "ok");
    await loadMyBookings();
    renderAll();
  } catch (err) {
    showToast(err?.message || "Failed to open round.", "error");
  }
}

function promptAdjustedScore(roundId) {
  const context = state.bookingContextByRoundId[Number(roundId)] || null;
  const meta = document.getElementById("score-sheet-meta");
  if (meta) {
    const text = context
      ? `${context.player_name || "Booking"} · ${formatDateTime(context.tee_time)}`
      : "Enter adjusted gross score";
    meta.textContent = text;
  }
  state.pendingAdjustedRoundId = Number(roundId);
  openSheet("score");
  const input = document.getElementById("adjusted-score-input");
  if (input) input.focus();
}

async function submitAdjustedScore() {
  const roundId = Number(state.pendingAdjustedRoundId || 0);
  const input = document.getElementById("adjusted-score-input");
  const score = Number(input?.value || 0);
  if (!(roundId > 0)) {
    showToast("Round not selected.", "error");
    return;
  }
  if (!Number.isFinite(score) || score <= 0) {
    showToast("Enter a valid adjusted gross score.", "error");
    return;
  }
  const submitBtn = document.getElementById("submit-adjusted-score-btn");
  if (submitBtn) submitBtn.disabled = true;
  try {
    await api(`/scoring/my-rounds/${roundId}/submit`, {
      method: "PUT",
      body: JSON.stringify({
        scoring_mode: "adjusted_gross",
        adjusted_gross: Math.round(score),
        holes_played: 18
      })
    });
    showToast("Score submitted.", "ok");
    closeSheet("score");
    await loadMyBookings();
    renderAll();
  } catch (err) {
    showToast(err?.message || "Failed to submit score.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function markNoReturn(roundId) {
  if (!window.confirm("Mark this round as No Return? This requires committee review.")) return;
  try {
    await api(`/scoring/my-rounds/${Number(roundId)}/no-return`, { method: "POST" });
    showToast("Round marked as No Return.", "ok");
    await loadMyBookings();
    renderAll();
  } catch (err) {
    showToast(err?.message || "Failed to mark N/R.", "error");
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const payload = {
    name: String(document.getElementById("profile-name")?.value || "").trim(),
    phone: String(document.getElementById("profile-phone")?.value || "").trim() || null,
    birth_date: String(document.getElementById("profile-birth-date")?.value || "").trim() || null,
    member_number: String(document.getElementById("profile-member-number")?.value || "").trim() || null,
    handicap_number: String(document.getElementById("profile-handicap-number")?.value || "").trim() || null,
    handicap_sa_id: String(document.getElementById("profile-handicap-sa")?.value || "").trim() || null,
    home_course: String(document.getElementById("profile-home-course")?.value || "").trim() || null,
    account_type: String(document.getElementById("profile-account-type")?.value || "").trim() || null,
    gender: String(document.getElementById("profile-gender")?.value || "").trim() || null,
    player_category: String(document.getElementById("profile-category")?.value || "").trim() || null,
    handicap_index: (() => {
      const raw = String(document.getElementById("profile-index")?.value || "").trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })()
  };

  if (!payload.name) {
    showToast("Name is required.", "error");
    return;
  }

  const saveBtn = event?.submitter;
  if (saveBtn) saveBtn.disabled = true;
  try {
    await api("/profile/me", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    showToast("Profile saved.", "ok");
    await Promise.all([loadProfile(), loadBookingWindow(), loadMyBookings()]);
    renderAll();
  } catch (err) {
    showToast(err?.message || "Failed to save profile.", "error");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function bindEvents() {
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => setActiveView(String(btn.dataset.view || "home")));
  });
  document.querySelectorAll("[data-go-view]").forEach(btn => {
    btn.addEventListener("click", () => setActiveView(String(btn.dataset.goView || "home")));
  });

  document.getElementById("refresh-home-btn")?.addEventListener("click", async () => {
    await Promise.all([loadMyBookings(), loadNotifications(), loadClubFeed()]);
    renderAll();
  });
  document.getElementById("refresh-rounds-btn")?.addEventListener("click", async () => {
    await loadMyBookings();
    renderAll();
  });
  document.getElementById("refresh-weather-btn")?.addEventListener("click", async () => {
    await loadNotifications();
    renderAll();
  });
  document.getElementById("refresh-club-feed-btn")?.addEventListener("click", async () => {
    await loadClubFeed();
    renderAll();
  });
  document.getElementById("refresh-profile-btn")?.addEventListener("click", async () => {
    await loadProfile();
    renderAll();
  });

  document.getElementById("book-date")?.addEventListener("change", async event => {
    state.teeDate = clampBookDate(String(event?.target?.value || todayYmd()));
    await loadTeeTimes();
  });
  document.getElementById("book-today-btn")?.addEventListener("click", async () => {
    state.teeDate = clampBookDate(todayYmd());
    await loadTeeTimes();
  });
  document.querySelectorAll("[data-step-date]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const step = Number(btn.dataset.stepDate || 0);
      if (!Number.isFinite(step) || !step) return;
      if (!stepBookDate(step)) return;
      await loadTeeTimes();
    });
  });

  document.querySelectorAll(".seg-btn[data-holes]").forEach(btn => {
    btn.addEventListener("click", () => {
      const holes = Number(btn.dataset.holes || 18) === 9 ? 9 : 18;
      state.holes = holes;
      document.querySelectorAll(".seg-btn[data-holes]").forEach(b => {
        b.classList.toggle("active", Number(b.dataset.holes || 18) === holes);
      });
      renderTeeTimes();
      refreshBookingSheetMeta();
    });
  });

  document.querySelectorAll(".tee-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = String(btn.dataset.teeFilter || "open");
      if (!["open", "all", "blocked"].includes(next)) return;
      state.teeFilter = next;
      renderTeeTimes();
    });
  });

  document.querySelectorAll(".round-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = String(btn.dataset.roundFilter || "action");
      if (!["action", "open", "closed", "all"].includes(next)) return;
      state.roundsFilter = next;
      renderRounds();
    });
  });

  document.getElementById("refresh-tee-btn")?.addEventListener("click", async () => {
    await loadTeeTimes(true);
  });

  document.getElementById("tee-list")?.addEventListener("click", event => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action='book-tee']") : null;
    if (!target) return;
    const teeId = Number(target.getAttribute("data-tee-id") || 0);
    if (teeId > 0) openBookingSheet(teeId);
  });

  document.querySelectorAll("[data-close-sheet]").forEach(el => {
    el.addEventListener("click", () => {
      const which = String(el.getAttribute("data-close-sheet") || "");
      if (which === "booking" || which === "score") closeSheet(which);
    });
  });

  document.getElementById("add-guest-btn")?.addEventListener("click", () => {
    const remaining = Math.max(0, selectedTeeOpenSpots() - state.bookingDraft.length);
    if (remaining <= 0) {
      showToast("No remaining spots in this tee time.", "error");
      return;
    }
    state.bookingDraft.push(buildGuestDraftRow());
    renderBookingDraftRows();
  });

  document.getElementById("booking-rows")?.addEventListener("click", event => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action='remove-draft-row']") : null;
    if (!target) return;
    const index = Number(target.getAttribute("data-index") || -1);
    if (Number.isInteger(index) && index >= 0 && state.bookingDraft[index] && !state.bookingDraft[index].is_self) {
      state.bookingDraft.splice(index, 1);
      renderBookingDraftRows();
    }
  });
  document.getElementById("booking-rows")?.addEventListener("input", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-field")) return;
    updateDraftField(target);
  });
  document.getElementById("booking-rows")?.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-field")) return;
    updateDraftField(target);
  });

  document.getElementById("submit-booking-btn")?.addEventListener("click", submitBookingDraft);
  document.getElementById("submit-adjusted-score-btn")?.addEventListener("click", submitAdjustedScore);

  document.getElementById("rounds-list")?.addEventListener("click", event => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
    if (!target) return;
    const action = String(target.getAttribute("data-action") || "");
    if (action === "open-round") {
      const bookingId = Number(target.getAttribute("data-booking-id") || 0);
      const mode = String(target.getAttribute("data-mode") || "hole_by_hole");
      if (bookingId > 0) openRound(bookingId, mode);
      return;
    }
    if (action === "submit-adjusted") {
      const roundId = Number(target.getAttribute("data-round-id") || 0);
      if (roundId > 0) promptAdjustedScore(roundId);
      return;
    }
    if (action === "mark-nr") {
      const roundId = Number(target.getAttribute("data-round-id") || 0);
      if (roundId > 0) markNoReturn(roundId);
    }
  });

  document.getElementById("weather-alert-list")?.addEventListener("click", event => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action='weather-response']") : null;
    if (!target) return;
    const notificationId = Number(target.getAttribute("data-notification-id") || 0);
    const response = String(target.getAttribute("data-weather-response") || "").trim();
    if (notificationId > 0 && response) {
      respondToWeatherNotification(notificationId, response);
    }
  });

  document.getElementById("profile-form")?.addEventListener("submit", saveProfile);
}

async function loadClubConfig() {
  try {
    const cfg = await window.Greenlink?.loadClubConfig?.();
    state.clubConfig = cfg || null;
    if (cfg?.labels) state.typeLabels = { ...state.typeLabels, ...cfg.labels };
    if (cfg?.currency_symbol) state.currencySymbol = String(cfg.currency_symbol);
    if (cfg) window.Greenlink?.applyClubBranding?.(cfg);
  } catch {
    state.clubConfig = null;
  }
}

async function initialize() {
  applyRouteState();
  bindEvents();
  await loadClubConfig();
  setActiveView(state.pendingRouteTab, { syncUrl: false });

  await Promise.all([loadProfile(), loadBookingWindow(), loadMyBookings(), loadNotifications(), loadClubFeed()]);
  syncBookDateConstraints();
  await loadTeeTimes();
  renderAll();

  if (state.pendingRouteTab) {
    setActiveView(state.pendingRouteTab, { syncUrl: true });
  }
}

initialize().catch(err => {
  showToast(err?.message || "Failed to load player dashboard.", "error");
});
