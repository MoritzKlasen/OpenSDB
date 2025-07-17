let allUsers = [];

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function fetchUsers() {
  const res = await fetch("/api/verified-users");
  if (!res.ok) {
    window.location.href = "/login.html";
    return;
  }
  allUsers = await res.json();
  renderUsers(allUsers);
}

function renderUsers(users) {
  const container = document.getElementById("userContainer");
  container.innerHTML = "";

  if (users.length === 0) {
    container.innerHTML = '<p>❗ No users found.</p>';
    return;
  }

  users.forEach((user) => {
    const commentSection = user.comment && user.comment.trim() !== ""
      ? `<p style="margin-bottom:4px;">
           <strong>Comment:</strong>
           <span 
             class="comment-text" 
             data-discord-id="${user.discordId}" 
             onclick="enableEdit(this)" 
             style="cursor:text; text-decoration:underline;"
           >${user.comment}</span>
         </p>`
      : `<p style="margin-bottom:4px; color:#666;">
           <strong>Comment:</strong>
           <span
             class="comment-text"
             data-discord-id="${user.discordId}"
             onclick="enableEdit(this)"
             style="cursor:text; margin-left:8px; font-size:0.9em; text-decoration:underline;"
           >Add comment</span>
         </p>`;

    let warnsHtml = "";
    (user.warnings || []).forEach((w, i) => {
      warnsHtml += `
        <li>
          <strong>${i + 1}.</strong> ${w.reason || "No reason provided"}
          <br><em>by:</em> ${w.issuedBy || "Unknown"}
          <br><em>on:</em> ${formatDate(w.date)}
          <br><button onclick="deleteWarning('${user.discordId}', ${i})">🗑️ Delete warning</button>
        </li>`;
    });
    if (!warnsHtml) warnsHtml = "<li>No warnings</li>";

    const html = `
      <strong>👤 ${user.firstName} ${user.lastName}</strong><br>
      <strong>📛 Discord:</strong> ${user.discordTag} (${user.discordId})<br>
      ${commentSection}
      <strong>⚠️ Warnings:</strong>
      <ul>${warnsHtml}</ul>`
      //  <button onclick="deleteUser('${user.discordId}')">❌ Remove verification</button>
    ;

    const userBox = document.createElement("div");
    userBox.classList.add("user-box");
    userBox.innerHTML = html;
    container.appendChild(userBox);
  });
}

async function deleteWarning(discordId, index) {
  if (!confirm("Are you sure you want to delete this warning?")) return;
  const res = await fetch(`/api/remove-warning/${discordId}/${index}`, {
    method: "DELETE",
  });
  if (res.ok) fetchUsers();
  else alert("Error deleting the warning.");
}

// async function deleteUser(discordId) {
//   if (!confirm("Are you sure you want to delete this user?")) return;
//   const res = await fetch(`/api/delete-user/${discordId}`, {
//     method: "DELETE",
//   });
//   if (res.ok) fetchUsers();
//   else alert("Error deleting the user.");
// }

function setupFilter() {
  document
    .getElementById("searchInput")
    .addEventListener("input", (e) => {
      const value = e.target.value.toLowerCase();
      const filtered = allUsers.filter(
        (u) =>
          u.discordTag?.toLowerCase().includes(value) ||
          u.firstName?.toLowerCase().includes(value) ||
          u.lastName?.toLowerCase().includes(value)
      );
      renderUsers(filtered);
    });
}

function setupDarkmode() {
  const html = document.documentElement;
  const button = document.getElementById("toggleDarkmode");
  const current = localStorage.getItem("darkmode");

  if (current === "true") html.classList.add("dark");
  button.textContent = html.classList.contains("dark") ? "☀️" : "🌙";

  button.addEventListener("click", () => {
    const enabled = html.classList.toggle("dark");
    localStorage.setItem("darkmode", enabled);
    button.textContent = enabled ? "☀️" : "🌙";
  });
}

function setupLogout() {
  document
    .getElementById("logoutButton")
    .addEventListener("click", () => {
      window.location.href = "/logout";
    });
}

function enableEdit(span) {
  const discordId = span.dataset.discordId;
  const original = span.textContent;
  const input = document.createElement("input");
  input.type = "text";
  input.value = original;
  input.style.width = "100%";
  input.style.margin = "4px 0";
  input.addEventListener("blur", () => saveComment(discordId, input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.replaceWith(span);
      span.textContent = original;
    }
  });
  span.replaceWith(input);
  input.focus();
}

async function saveComment(discordId, newComment) {
  try {
    const res = await fetch(`/api/update-comment/${discordId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: newComment }),
    });
    if (!res.ok) throw new Error();
    fetchUsers();
  } catch {
    alert("Error saving the comment!");
    fetchUsers();
  }
}

window.onload = () => {
  fetchUsers();
  setupFilter();
  setupDarkmode();
  setupLogout();
};