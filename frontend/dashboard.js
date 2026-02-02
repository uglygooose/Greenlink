function logout(){
  localStorage.removeItem("token");
  window.location.href = "/frontend/index.html";
}

async function loadDashboard(){
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/frontend/index.html";
    return;
  }

  const res = await fetch("http://localhost:8000/users/", {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!res.ok) {
    alert("Session invalid — please login again");
    logout();
    return;
  }

  const users = await res.json();
  document.getElementById("stat_total_users").textContent = users.length;

  const tbody = document.getElementById("dashboard_user_table");
  tbody.innerHTML = "";
  users.forEach(u => {
    const row = `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td></tr>`;
    tbody.innerHTML += row;
  });
}

document.addEventListener("DOMContentLoaded", loadDashboard);
