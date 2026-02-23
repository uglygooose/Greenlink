console.log("GreenLink front-end loaded.");
const API_BASE = window.location.origin;
let clubConfig = null;

async function ensureClubConfig() {
    if (clubConfig) return clubConfig;
    try {
        clubConfig = await window.Greenlink?.loadClubConfig?.();
    } catch {
        clubConfig = null;
    }
    return clubConfig;
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
            window.location.href = '/frontend/admin.html';
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
                window.location.href = "/frontend/admin.html";
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
