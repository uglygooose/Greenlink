console.log("GreenLink front-end loaded.");
const API_BASE = window.location.origin;

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
        if (data?.role === 'admin') {
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

    const name = document.getElementById("newName").value.trim();
    const email = document.getElementById("newEmail").value.trim();
    const password = document.getElementById("newPassword").value;
    const passwordConfirm = document.getElementById("newPasswordConfirm")?.value || "";

    const accountType = (document.getElementById("newAccountType")?.value || "visitor").trim();
    const createMemberProfile = accountType === "member";
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
    if (createMemberProfile && !homeClub) {
        alert("Please select your home club or choose Visitor.");
        return;
    }

    const res = await fetch(`${API_BASE}/users/`, {
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

            if (loginData?.role === "admin") {
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
