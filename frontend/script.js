console.log("GreenLink front-end loaded.");
const API_BASE = window.location.origin;

// TOGGLE BETWEEN LOGIN & SIGNUP
document.getElementById("showSignup").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("signupCard").style.display = "block";
});

document.getElementById("showLogin").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("signupCard").style.display = "none";
    document.getElementById("loginCard").style.display = "block";
});

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

    const accountType = (document.getElementById("newAccountType")?.value || "visitor").trim();
    const createMemberProfile = accountType === "member";
    const memberNumber = document.getElementById("newMemberNumber")?.value?.trim() || "";
    const phone = document.getElementById("newPhone")?.value?.trim() || "";
    const gender = document.getElementById("newGender")?.value?.trim() || "";
    const playerCategory = document.getElementById("newCategory")?.value?.trim() || "";
    const handicapSaId = document.getElementById("newHandicapSaId")?.value?.trim() || "";
    const handicapNumber = document.getElementById("newHandicapNumber")?.value?.trim() || "";
    const handicapIndexRaw = document.getElementById("newHandicapIndex")?.value;
    const homeClub = document.getElementById("newHomeClub")?.value?.trim() || "";
    const birthDate = document.getElementById("newBirthDate")?.value || "";

    const handicapIndex = handicapIndexRaw === "" || handicapIndexRaw == null ? null : Number(handicapIndexRaw);

    const res = await fetch(`${API_BASE}/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            email,
            password,
            create_member_profile: createMemberProfile,
            member_number: memberNumber || null,
            phone: phone || null,
            gender: gender || null,
            player_category: playerCategory || null,
            student: playerCategory === "student" ? true : null,
            handicap_sa_id: handicapSaId || null,
            handicap_number: handicapNumber || null,
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
        alert("User created! You can now login.");
        document.getElementById("signupCard").style.display = "none";
        document.getElementById("loginCard").style.display = "block";
        document.getElementById("createUserForm").reset();
    } else {
        alert("Error: " + (data?.detail || raw || "Could not create user"));
    }
    console.log("Create user response:", data || raw);
});

// Signup UX: show member fields only when needed.
const accountTypeSelect = document.getElementById("newAccountType");
function syncSignupVisibility() {
    const isMember = (accountTypeSelect?.value || "visitor") === "member";
    const memberOnly = ["newMemberNumber", "newPhone"];
    memberOnly.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isMember ? "block" : "none";
    });
}
if (accountTypeSelect) {
    accountTypeSelect.addEventListener("change", syncSignupVisibility);
    syncSignupVisibility();
}
