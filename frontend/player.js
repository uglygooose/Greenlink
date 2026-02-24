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
  teeTimes: [],
  selectedTeeTime: null,
  bookingDraft: [],
  bookingContextByRoundId: {},
  pendingAdjustedRoundId: null,
  pendingRouteTeeTimeId: null,
  pendingRouteTab: "home",
  typeLabels: { ...typeLabelsFallback },
  currencySymbol: "R",
  clubConfig: null
};

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

async function api(path, options = {}) {
  const opts = { ...options };
  const headers = new Headers(opts.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (opts.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  opts.headers = headers;
  const response = await fetch(`${API_BASE}${path}`, opts);
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    let detail = data?.detail;
    if (detail && typeof detail === "object") detail = detail.message || JSON.stringify(detail);
    throw new Error(String(detail || raw || `Request failed (${response.status})`));
  }
  return data;
}

function buildRangeForDate(dateYmd) {
  const d = ymdToDate(dateYmd);
  if (!d) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
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
}

function renderHome() {
  const profile = state.profile || {};
  const greeting = document.getElementById("home-greeting");
  const subtitle = document.getElementById("home-subtitle");
  const upcomingList = document.getElementById("upcoming-list");
  if (greeting) greeting.textContent = `Welcome, ${profile?.name || "Player"}`;

  const missing = profileCompleteness(profile);
  if (subtitle) {
    subtitle.textContent = missing.length
      ? `Complete ${missing.join(", ")} to keep booking and HNA actions reliable.`
      : "Everything for bookings, rounds, and profile in one mobile flow.";
  }

  const now = new Date();
  const upcoming = (state.bookings || [])
    .filter(row => {
      const t = new Date(row?.tee_time || "");
      return !Number.isNaN(t.getTime()) && t >= now;
    })
    .sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time))
    .slice(0, 5);

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
        <div class="row-meta">
          ${escapeHtml(status)} · ${escapeHtml(item?.player_name || profile?.name || "Booking")}
        </div>
      </div>
    `;
  }).join("");
}

function renderTeeTimes() {
  const listEl = document.getElementById("tee-list");
  const countEl = document.getElementById("tee-count-label");
  if (!listEl) return;

  const rows = [...(state.teeTimes || [])].sort((a, b) => new Date(a.tee_time) - new Date(b.tee_time));
  if (countEl) countEl.textContent = `${formatInteger(rows.length)} tee times`;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-state">No tee times available for this day.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(tt => {
    const capacity = Math.max(1, Number(tt?.capacity || 4));
    const booked = Array.isArray(tt?.bookings) ? tt.bookings.length : 0;
    const openSpots = Math.max(0, capacity - booked);
    const status = String(tt?.status || "open").toLowerCase();
    const canBook = openSpots > 0 && status !== "blocked";
    const teeLabel = String(tt?.hole || "1");
    return `
      <div class="tee-item">
        <div class="tee-main">
          <div>
            <div class="tee-time">${escapeHtml(formatTime(tt?.tee_time))}</div>
            <div class="tee-meta">Tee ${escapeHtml(teeLabel)} · ${escapeHtml(formatDate(tt?.tee_time))}</div>
          </div>
          <span class="pill ${canBook ? "ok" : "warn"}">${canBook ? `${formatInteger(openSpots)} Open` : "Full / Closed"}</span>
        </div>
        <div class="tee-foot">
          <span class="muted">${formatInteger(booked)} / ${formatInteger(capacity)} booked</span>
          <button class="btn ${canBook ? "primary" : "outline"} small" type="button" data-action="book-tee" data-tee-id="${Number(tt?.id || 0)}" ${canBook ? "" : "disabled"}>
            ${canBook ? "Book Slot" : "Unavailable"}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderRounds() {
  const listEl = document.getElementById("rounds-list");
  if (!listEl) return;
  if (!Array.isArray(state.bookings) || state.bookings.length === 0) {
    listEl.innerHTML = `<div class="empty-state">No rounds yet. Book a tee time and open a round when ready.</div>`;
    return;
  }

  state.bookingContextByRoundId = {};
  listEl.innerHTML = state.bookings.map(item => {
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

function renderAll() {
  renderSummaryChips();
  renderHome();
  renderTeeTimes();
  renderRounds();
  populateProfileForm();

  const missing = profileCompleteness(state.profile || {});
  if (missing.length) {
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

async function loadTeeTimes() {
  const range = buildRangeForDate(state.teeDate);
  if (!range) {
    state.teeTimes = [];
    renderTeeTimes();
    return;
  }
  try {
    const response = await api(`/tsheet/range?start=${encodeURIComponent(range.startIso)}&end=${encodeURIComponent(range.endIso)}`);
    state.teeTimes = Array.isArray(response) ? response : [];
  } catch (err) {
    state.teeTimes = [];
    showToast(err?.message || "Failed to load tee sheet", "error");
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

function renderBookingDraftRows() {
  const rowsEl = document.getElementById("booking-rows");
  if (!rowsEl) return;
  rowsEl.innerHTML = state.bookingDraft.map((row, index) => `
    <div class="booking-row">
      <div class="booking-row-head">
        <div class="booking-row-title">${row.is_self ? "You" : `Guest ${index}`}</div>
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
  `).join("");
}

function openBookingSheet(teeTimeId) {
  const tee = (state.teeTimes || []).find(tt => Number(tt?.id || 0) === Number(teeTimeId));
  if (!tee) return;
  state.selectedTeeTime = tee;
  state.bookingDraft = [buildSelfDraftRow()];
  const summary = document.getElementById("sheet-tee-summary");
  if (summary) {
    const cap = Number(tee?.capacity || 4);
    const booked = Array.isArray(tee?.bookings) ? tee.bookings.length : 0;
    summary.textContent = `${formatDateTime(tee?.tee_time)} · Tee ${tee?.hole || "1"} · ${formatInteger(booked)}/${formatInteger(cap)} booked · ${state.holes} holes`;
  }
  renderBookingDraftRows();
  openSheet("booking");
}

function updateDraftField(target) {
  const index = Number(target?.dataset?.index || -1);
  const field = String(target?.dataset?.field || "");
  if (!Number.isInteger(index) || index < 0) return;
  if (!field) return;
  const row = state.bookingDraft[index];
  if (!row) return;
  const nextValue = target.type === "checkbox" ? Boolean(target.checked) : String(target.value || "");
  row[field] = nextValue;
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
    await loadMyBookings();
    renderAll();
  });

  document.getElementById("refresh-rounds-btn")?.addEventListener("click", async () => {
    await loadMyBookings();
    renderAll();
  });

  document.getElementById("refresh-profile-btn")?.addEventListener("click", async () => {
    await loadProfile();
    renderAll();
  });

  document.getElementById("book-date")?.addEventListener("change", async (event) => {
    state.teeDate = String(event?.target?.value || todayYmd());
    await loadTeeTimes();
  });

  document.querySelectorAll(".seg-btn[data-holes]").forEach(btn => {
    btn.addEventListener("click", () => {
      const holes = Number(btn.dataset.holes || 18) === 9 ? 9 : 18;
      state.holes = holes;
      document.querySelectorAll(".seg-btn[data-holes]").forEach(b => {
        b.classList.toggle("active", Number(b.dataset.holes || 18) === holes);
      });
    });
  });

  document.getElementById("refresh-tee-btn")?.addEventListener("click", async () => {
    await loadTeeTimes();
  });

  document.getElementById("tee-list")?.addEventListener("click", (event) => {
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
    state.bookingDraft.push(buildGuestDraftRow());
    renderBookingDraftRows();
  });

  document.getElementById("booking-rows")?.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-action='remove-draft-row']") : null;
    if (!target) return;
    const index = Number(target.getAttribute("data-index") || -1);
    if (Number.isInteger(index) && index >= 0 && state.bookingDraft[index] && !state.bookingDraft[index].is_self) {
      state.bookingDraft.splice(index, 1);
      renderBookingDraftRows();
    }
  });

  document.getElementById("booking-rows")?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-field")) return;
    updateDraftField(target);
  });

  document.getElementById("booking-rows")?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-field")) return;
    updateDraftField(target);
  });

  document.getElementById("submit-booking-btn")?.addEventListener("click", submitBookingDraft);
  document.getElementById("submit-adjusted-score-btn")?.addEventListener("click", submitAdjustedScore);

  document.getElementById("rounds-list")?.addEventListener("click", (event) => {
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

  const dateInput = document.getElementById("book-date");
  if (dateInput) {
    dateInput.value = state.teeDate;
    dateInput.min = todayYmd();
  }

  setActiveView(state.pendingRouteTab, { syncUrl: false });

  await Promise.all([loadProfile(), loadBookingWindow(), loadMyBookings()]);
  await loadTeeTimes();
  renderAll();

  if (state.pendingRouteTab) {
    setActiveView(state.pendingRouteTab, { syncUrl: true });
  }
}

initialize().catch(err => {
  showToast(err?.message || "Failed to load player dashboard.", "error");
});
