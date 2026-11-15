// NEXUS - Đăng nhập Discord (OAuth2 implicit, scope "identify")
const CONFIG = {
  clientId: "1571569716126814399",
  redirectUri: "https://not5t.github.io/nexus/",
};

const USER_KEY = "nexus_user";
const TOKEN_KEY = "nexus_token";
const STATE_KEY = "nexus_oauth_state";

const els = {
  avatar: document.getElementById("user-avatar"),
  name: document.getElementById("user-name"),
  id: document.getElementById("user-id"),
  login: document.getElementById("login-btn"),
  logout: document.getElementById("logout-btn"),
  eyebrow: document.querySelector(".eyebrow"),
};

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function login() {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    response_type: "token",
    scope: "identify",
    state: state,
    prompt: "none",
  });

  location.href = "https://discord.com/oauth2/authorize?" + params.toString();
}

function avatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  const index = Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// Discord quay lại trang với #access_token=... trên URL
async function handleCallback() {
  const hash = location.hash;
  if (!hash.includes("access_token") && !hash.includes("error=")) return;

  const params = new URLSearchParams(hash.slice(1));
  // Xóa token khỏi thanh địa chỉ ngay lập tức
  history.replaceState(null, "", location.pathname + location.search);

  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  const token = params.get("access_token");
  if (!token || !expected || params.get("state") !== expected) return;

  try {
    const res = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const u = await res.json();

    localStorage.setItem(USER_KEY, JSON.stringify({
      id: u.id,
      name: u.global_name || u.username,
      avatar: avatarUrl(u),
    }));

    // Token chỉ có quyền "identify" (đọc tên/avatar/id), dùng để bot xác minh bạn là ai.
    // Token tự hết hạn (~7 ngày) và bị xóa khi đăng xuất.
    const expiresIn = Number(params.get("expires_in")) || 0;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token: token,
      expiresAt: Date.now() + expiresIn * 1000,
    }));
  } catch (err) {
    console.error("Đăng nhập Discord thất bại:", err);
  }
}

function getToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY));
    if (saved && saved.token && saved.expiresAt > Date.now() + 60000) return saved.token;
  } catch {}
  return null;
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function loadUser() {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY));
    return user && user.id && user.name ? user : null;
  } catch {
    return null;
  }
}

function render(user) {
  els.avatar.textContent = "";

  if (user) {
    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = "";
    els.avatar.appendChild(img);
    els.avatar.classList.add("has-img");
    els.name.textContent = user.name;
    els.id.textContent = "ID: " + user.id;
    els.id.hidden = false;
    els.eyebrow.textContent = "WELCOME BACK, " + user.name.toUpperCase();
  } else {
    els.avatar.textContent = "🐟";
    els.avatar.classList.remove("has-img");
    els.name.textContent = "Guest";
    els.id.hidden = true;
    els.eyebrow.textContent = "WELCOME TO NEXUS";
  }

  els.login.hidden = !!user;
  els.logout.hidden = !user;
}

els.login.addEventListener("click", login);
els.logout.addEventListener("click", () => {
  localStorage.removeItem(USER_KEY);
  clearToken();
  render(null);
  document.dispatchEvent(new Event("nexus:auth"));
});

(async () => {
  await handleCallback();
  render(loadUser());
  document.dispatchEvent(new Event("nexus:auth"));
})();
