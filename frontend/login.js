document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = window.location.origin;

    const loginCard = document.getElementById("loginCard");
    const signupCard = document.getElementById("signupCard");

    const showSignup = document.getElementById("showSignup");
    const showLogin = document.getElementById("showLogin");

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("createUserForm");

    /* ---------------------------
       CARD TOGGLING
    ---------------------------- */
    showSignup.addEventListener("click", (e) => {
        e.preventDefault();
        loginCard.style.display = "none";
        signupCard.style.display = "block";
    });

    showLogin.addEventListener("click", (e) => {
        e.preventDefault();
        signupCard.style.display = "none";
        loginCard.style.display = "block";
    });

    /* ---------------------------
       LOGIN SUBMIT
    ---------------------------- */
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.querySelector("#loginEmail").value.trim();
        const password = document.querySelector("#loginPassword").value;

        document.querySelector(".loading").style.display = "block";

        const payload = { email, password };

        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        document.querySelector(".loading").style.display = "none";

        if (!res.ok) {
            alert("Invalid login");
            return;
        }

        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user_role", data.role || "player");
        
        console.log("Login successful, email:", email, "role:", data.role);
        
        // Redirect based on user role
        if (data.role === "admin") {
            console.log("Admin detected, redirecting to admin.html");
            setTimeout(() => {
                window.location.href = "/frontend/admin.html";
            }, 500);
        } else {
            console.log("Regular user, redirecting to dashboard.html");
            setTimeout(() => {
                window.location.href = "/frontend/dashboard.html";
            }, 500);
        }
    });

    /* ---------------------------
       SIGNUP
    ---------------------------- */
    signupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("User created (demo only).");
        showLogin.click();
    });

});
