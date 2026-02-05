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

    const email = loginEmail.value;
    const password = loginPassword.value;

    const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user_role', data.role || 'player');
        
        // Redirect based on role
        if (data.role === 'admin') {
            window.location.href = '/frontend/admin.html';
        } else {
            window.location.href = '/frontend/dashboard.html';
        }
    } else {
        alert("Login failed: " + (data.detail || "Invalid credentials"));
    }
    console.log("Login response:", data);
});

// CREATE USER
document.getElementById("createUserForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = newName.value;
    const email = newEmail.value;
    const password = newPassword.value;

    const res = await fetch(`${API_BASE}/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (res.ok) {
        alert("✓ User created! You can now login.");
        document.getElementById("signupCard").style.display = "none";
        document.getElementById("loginCard").style.display = "block";
        document.getElementById("createUserForm").reset();
    } else {
        alert("Error: " + (data.detail || "Could not create user"));
    }
    console.log("Create user response:", data);
});
