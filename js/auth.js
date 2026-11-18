// NEXUS v0.7.1 - Discord OAuth2 Authorization Code + PKCE.
// Discord access token stays on the Worker; browser stores only an opaque NEXUS session token.
const CONFIG = {
  clientId: "1571569716126814399",
  redirectUri: "https://not5t.github.io/nexus/",
};

const USER_KEY = "nexus_user";
const TOKEN_KEY = "nexus_token";
const STATE_KEY = "nexus_oauth_state";
const VERIFIER_KEY = "nexus_pkce_verifier";

const els = {
  avatar: document.getElementById("user-avatar"),
  name: document.getElementById("user-name"),
  id: document.getElementById("user-id"),
  login: document.getElementById("login-btn"),
  logout: document.getElementById("logout-btn"),
  eyebrow: document.querySelector(".eyebrow"),
};

function authApiUrl() {
  try {
    const configured = typeof NEXUS_API_URL === "string" ? NEXUS_API_URL : "";
    const saved = localStorage.getItem("nexus_api_url") || "";
    const url = new URL(configured || saved);
    return url.protocol === "https:" ? url.origin : "";
  } catch { return ""; }
}

function randomHex(bytes = 16) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, b => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function login() {
  const api = authApiUrl();
  if (!api) {
    alert("Chưa cấu hình API NEXUS. Hãy kiểm tra js/config.js.");
    return;
  }
  const state = randomHex(16);
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = await createChallenge(verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    response_type: "code",
    scope: "identify",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  location.href = "https://discord.com/oauth2/authorize?" + params.toString();
}

function render(user) {
  els.avatar.textContent = "";
  if (user) {
    const img = document.createElement("img");
    img.src = user.avatar || "";
    img.alt = "";
    els.avatar.appendChild(img);
    els.avatar.classList.add("has-img");
    els.name.textContent = user.name;
    els.id.textContent = "ID: " + user.id;
    els.id.hidden = false;
    els.eyebrow.textContent = "CHÀO MỪNG TRỞ LẠI, " + user.name.toUpperCase();
  } else {
    els.avatar.textContent = "🐟";
    els.avatar.classList.remove("has-img");
    els.name.textContent = "Khách";
    els.id.hidden = true;
    els.eyebrow.textContent = "CHÀO MỪNG ĐẾN NEXUS";
  }
  els.login.hidden = !!user;
  els.logout.hidden = !user;
}

async function handleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const returnedState = params.get("state");
  if (!code && !params.has("error")) return;
  history.replaceState(null, "", location.pathname + location.hash);

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (params.has("error")) throw new Error("Discord OAuth: " + params.get("error"));
  if (!code || !expectedState || returnedState !== expectedState || !verifier) throw new Error("OAuth state không hợp lệ.");

  const api = authApiUrl();
  if (!api) throw new Error("Chưa cấu hình API NEXUS.");
  const res = await fetch(api + "/api/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: CONFIG.redirectUri }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.sessionToken || !data.user) throw new Error(data.error || "Không thể hoàn tất đăng nhập.");

  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: data.sessionToken, expiresAt: data.expiresAt }));
}

function getToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY));
    if (saved && /^[0-9a-f]{64}$/i.test(saved.token || "") && saved.expiresAt > Date.now() + 30000) return saved.token;
  } catch {}
  return null;
}

function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function loadUser() {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY));
    return user && user.id && user.name ? user : null;
  } catch { return null; }
}

els.login.addEventListener("click", login);
els.logout.addEventListener("click", async () => {
  const token = getToken();
  const api = authApiUrl();
  if (token && api) {
    try {
      await fetch(api + "/api/auth/logout", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
    } catch (err) { console.warn("Không thu hồi được phiên trên server:", err); }
  }
  localStorage.removeItem(USER_KEY);
  clearToken();
  render(null);
  document.dispatchEvent(new Event("nexus:auth"));
});

(async () => {
  try {
    await handleCallback();
  } catch (err) {
    console.error("Đăng nhập Discord thất bại:", err);
  }
  if (!getToken()) localStorage.removeItem(USER_KEY); // loại phiên OAuth cũ của bản trước
  render(loadUser());
  document.dispatchEvent(new Event("nexus:auth"));
})();
