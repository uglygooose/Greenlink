console.log("GreenLink front-end loaded.");
const API_BASE = window.location.origin;
let clubConfig = null;
let platformState = null;

async function ensureClubConfig() {
    if (clubConfig) return clubConfig;
    try {
        clubConfig = await window.Greenlink?.loadClubConfig?.();
    } catch {
        clubConfig = null;
    }
    return clubConfig;
}

async function ensurePlatformState() {
    if (platformState) return platformState;
    try {
        const res = await fetch(`${API_BASE}/api/public/platform-state`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Platform state failed: ${res.status}`);
        platformState = await res.json();
    } catch (error) {
        console.error("Failed to load platform state:", error);
        platformState = {
            status: "failed",
            warnings: [],
            errors: ["Unable to load platform state."],
            active_clubs: [],
            active_club_count: 0,
            requires_club_selection: false,
        };
    }
    return platformState;
}

function requestedClubTarget() {
    const params = new URLSearchParams(window.location.search || "");
    const rawClubId = params.get("club_id") || params.get("clubId");
    const rawSlug = params.get("club_slug") || params.get("clubSlug");
    const rawClub = params.get("club");
    const clubId = String(rawClubId || "").trim() || (/^\d+$/.test(String(rawClub || "").trim()) ? String(rawClub).trim() : "");
    const clubSlug = String(rawSlug || "").trim() || (!/^\d+$/.test(String(rawClub || "").trim()) ? String(rawClub || "").trim() : "");
    return {
        club_id: clubId || "",
        club_slug: clubSlug || "",
    };
}

function setPlatformBanner(state) {
    const banner = document.getElementById("platformBanner");
    if (!banner) return;

    const warnings = Array.isArray(state?.warnings) ? state.warnings : [];
    const errors = Array.isArray(state?.errors) ? state.errors : [];
    const activeClubs = Array.isArray(state?.active_clubs) ? state.active_clubs : [];
    const status = String(state?.status || "ready");

    let message = "";
    if (status === "failed") {
        message = errors[0] || warnings[0] || "GreenLink could not confirm platform bootstrap state.";
    } else if (status === "needs_attention") {
        message = warnings[0] || "Platform boot completed with warnings.";
    } else if (activeClubs.length > 1) {
        message = "Choose a club to continue. Account login remains platform-wide.";
    }

    if (!message) {
        banner.style.display = "none";
        banner.removeAttribute("data-status");
        banner.textContent = "";
        return;
    }

    banner.dataset.status = status;
    banner.style.display = "block";
    banner.textContent = message;
}

function adminDestinationForRole(role) {
    const normalizedRole = String(role || "").trim().toLowerCase();
    if (normalizedRole === "super_admin") {
        return "/frontend/admin.html#super-admin?view=overview";
    }
    if (normalizedRole === "club_staff") {
        return "/frontend/admin.html#tee-times";
    }
    return "/frontend/admin.html#dashboard?stream=all";
}

function syncClubTargetToUrl(club) {
    const url = new URL(window.location.href);
    ["club", "club_id", "clubId", "club_slug", "clubSlug"].forEach(key => url.searchParams.delete(key));
    if (club?.club_id) {
        url.searchParams.set("club_id", String(club.club_id));
    } else if (club?.club_slug) {
        url.searchParams.set("club_slug", String(club.club_slug));
    }
    window.history.replaceState({}, "", url.toString());
}

async function refreshClubBranding() {
    clubConfig = null;
    window.Greenlink?.invalidateClubConfigCache?.();
    const cfg = await ensureClubConfig();
    if (cfg) window.Greenlink?.applyClubBranding?.(cfg);
}

async function handleClubSelectorChange(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) {
        syncClubTargetToUrl({});
        await refreshClubBranding();
        return;
    }

    if (value.startsWith("slug:")) {
        syncClubTargetToUrl({ club_slug: value.slice(5) });
    } else if (value.startsWith("id:")) {
        syncClubTargetToUrl({ club_id: value.slice(3) });
    }
    await refreshClubBranding();
}

async function initPlatformStateUi() {
    const state = await ensurePlatformState();
    setPlatformBanner(state);

    const field = document.getElementById("clubSelectorField");
    const selector = document.getElementById("loginClubSelector");
    if (!field || !selector) return;

    const activeClubs = Array.isArray(state?.active_clubs) ? state.active_clubs : [];
    if (activeClubs.length <= 1) {
        field.style.display = "none";
        selector.innerHTML = "";
        return;
    }

    const requested = requestedClubTarget();
    const selectedValue = requested.club_slug
        ? `slug:${requested.club_slug}`
        : requested.club_id
            ? `id:${requested.club_id}`
            : "";

    selector.innerHTML = [
        '<option value="">Select a club</option>',
        ...activeClubs.map(club => {
            const label = String(club?.name || club?.slug || `Club ${club?.id || ""}`);
            const value = club?.slug ? `slug:${club.slug}` : `id:${club.id}`;
            return `<option value="${value}">${label}</option>`;
        }),
    ].join("");
    selector.value = selectedValue;
    selector.onchange = async () => {
        await handleClubSelectorChange(selector.value);
    };
    field.style.display = "block";
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

function setAccountType(type) {
    const hidden = document.getElementById("newAccountType");
    if (hidden) hidden.value = type;

    const isMember = type === "member";
    const homeClub = document.getElementById("newHomeClub");
    if (homeClub) {
        homeClub.required = isMember;
        homeClub.placeholder = isMember ? "Home club (required)" : "Home club (optional)";
    }
}

// UI events
document.getElementById("openSignup")?.addEventListener("click", () => {
    openModal("signupModal");
});

document.querySelectorAll("[data-close-modal]")?.forEach(el => {
    el.addEventListener("click", () => {
        const id = el.getAttribute("data-close-modal");
        if (id) closeModal(id);
    });
});

document.querySelectorAll(".seg-btn")?.forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        setAccountType(btn.getAttribute("data-account-type") || "visitor");
    });
});

setAccountType("visitor");

// Apply club branding + datalist options.
(async () => {
    await initPlatformStateUi();
    const cfg = await ensureClubConfig();
    if (cfg) window.Greenlink?.applyClubBranding?.(cfg);
})();

// LOGIN
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const raw = await res.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }

    if (res.ok) {
        localStorage.setItem('token', data?.access_token || "");
        localStorage.setItem('user_role', data?.role || 'player');
        
        // Redirect based on role
        const role = data?.role || 'player';
        if (role === 'admin' || role === 'club_staff' || role === 'super_admin') {
            window.location.href = adminDestinationForRole(role);
        } else {
            window.location.href = '/frontend/dashboard.html';
        }
    } else {
        const msg = data?.detail || raw || "Login failed";
        alert("Login failed: " + msg);
    }
    console.log("Login response:", data || raw);
});

// CREATE USER
document.getElementById("createUserForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const cfg = await ensureClubConfig();
    const labels = cfg?.labels || {};
    const urlParams = new URLSearchParams(window.location.search || "");
    const rawClub = (urlParams.get("club") || "").trim();
    const qsClubId = (urlParams.get("club_id") || urlParams.get("clubId") || "").trim() || (/^\d+$/.test(rawClub) ? rawClub : "");
    const qsClubSlug = (urlParams.get("club_slug") || urlParams.get("clubSlug") || "").trim() || (!/^\d+$/.test(rawClub) ? rawClub : "");
    const cfgSlug = (cfg?.club_slug || "").trim();

    const name = document.getElementById("newName").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const password = document.getElementById("newPassword").value;
    const passwordConfirm = document.getElementById("newPasswordConfirm")?.value || "";

    const accountTypeUi = (document.getElementById("newAccountType")?.value || "visitor").trim();
    const memberNumber = document.getElementById("newMemberNumber")?.value?.trim() || "";
    const phone = document.getElementById("newPhone")?.value?.trim() || "";
    const gender = document.getElementById("newGender")?.value?.trim() || "";
    const playerCategory = document.getElementById("newCategory")?.value?.trim() || "";
    const handicapSaId = document.getElementById("newHandicapSaId")?.value?.trim() || "";
    const handicapIndexRaw = document.getElementById("newHandicapIndex")?.value;
    const homeClub = document.getElementById("newHomeClub")?.value?.trim() || "";
    const birthDate = document.getElementById("newBirthDate")?.value || "";

    const handicapIndex = handicapIndexRaw === "" || handicapIndexRaw == null ? null : Number(handicapIndexRaw);

    if (!name || !email || !password) {
        alert("Please complete name, email, and password.");
        return;
    }
    if (!phone) {
        alert("Please enter a phone number.");
        return;
    }
    if (!birthDate) {
        alert("Please enter your date of birth.");
        return;
    }
    if (password !== passwordConfirm) {
        alert("Passwords do not match.");
        return;
    }

    if (accountTypeUi === "member" && !homeClub) {
        alert("Please select your home club or choose Visitor.");
        return;
    }

    const qp = new URLSearchParams();
    if (qsClubId) qp.set("club_id", qsClubId);
    else if (qsClubSlug) qp.set("club_slug", qsClubSlug);
    else if (cfgSlug) qp.set("club_slug", cfgSlug);

    if ((platformState?.requires_club_selection || false) && !qp.toString()) {
        alert("Please choose a club before creating an account.");
        return;
    }

    // Map signup choices to pricing audiences:
    // - "member" => host-club member green fee (only if home club matches configured keywords)
    // - "visitor" => affiliated visitor green fee
    // - "non_affiliated" => non-affiliated visitor green fee
    let accountType = "non_affiliated";
    let createMemberProfile = false;

    if (accountTypeUi === "member") {
        const isHomeMember = window.Greenlink?.homeClubIsMember?.(homeClub, cfg) || false;
        accountType = isHomeMember ? "member" : "visitor";
        createMemberProfile = isHomeMember;

        if (!isHomeMember) {
            alert(`Your home club does not match ${cfg?.club_name || "this club"}. We'll create your profile as ${labels?.visitor || "Affiliated Visitor"} instead.`);
        }
    }

    const createUrl = qp.toString() ? `${API_BASE}/users/?${qp.toString()}` : `${API_BASE}/users/`;
    const res = await fetch(createUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            email,
            password,
            account_type: accountType || null,
            create_member_profile: createMemberProfile,
            member_number: memberNumber || null,
            phone: phone || null,
            gender: gender || null,
            player_category: playerCategory || null,
            student: playerCategory === "student" ? true : null,
            handicap_sa_id: handicapSaId || null,
            handicap_index: Number.isFinite(handicapIndex) ? handicapIndex : null,
            home_club: homeClub || null,
            birth_date: birthDate || null
        })
    });

    const raw = await res.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }

    if (res.ok) {
        // Auto-login for smoother UX.
        const loginRes = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const loginRaw = await loginRes.text();
        let loginData = null;
        try {
            loginData = loginRaw ? JSON.parse(loginRaw) : null;
        } catch {
            loginData = null;
        }

        if (loginRes.ok) {
            localStorage.setItem("token", loginData?.access_token || "");
            localStorage.setItem("user_role", loginData?.role || "player");
            closeModal("signupModal");
            document.getElementById("createUserForm")?.reset();

            if (loginData?.role === "admin" || loginData?.role === "club_staff" || loginData?.role === "super_admin") {
                window.location.href = adminDestinationForRole(loginData?.role);
            } else {
                window.location.href = "/frontend/dashboard.html";
            }
            return;
        }

        alert("Account created. Please login.");
        closeModal("signupModal");
        document.getElementById("createUserForm")?.reset();
    } else {
        alert("Error: " + (data?.detail || raw || "Could not create user"));
    }
    console.log("Create user response:", data || raw);
});
