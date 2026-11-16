// NEXUS v0.5 - Ví cá nhân (cần đăng nhập Discord + địa chỉ API của bot)
// Dùng lại các hàm từ auth.js (loadUser, getToken, clearToken, login) và dashboard.js (getApiUrl, fmt, timeAgo, TYPE_INFO)
const walletUi = {
  box: document.getElementById("wallet-content"),
  tag: document.getElementById("wallet-tag"),
};

function walletMessage(icon, title, text, tag, actionLabel, onAction) {
  const box = document.createElement("div");
  box.className = "empty-state";

  const i = document.createElement("span");
  i.textContent = icon;
  const h = document.createElement("h3");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  box.appendChild(i);
  box.appendChild(h);
  box.appendChild(p);

  if (actionLabel) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = actionLabel;
    btn.addEventListener("click", onAction);
    box.appendChild(btn);
  }

  walletUi.tag.textContent = tag;
  walletUi.box.replaceChildren(box);
}

function formatWait(ms) {
  if (!(ms > 0)) return "Sẵn sàng ✅";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return "Còn " + (h > 0 ? h + " giờ " : "") + m + " phút";
}

function cooldownCard(title, ms) {
  const card = document.createElement("div");
  card.className = "wallet-cd";
  const t = document.createElement("small");
  t.textContent = title;
  const v = document.createElement("strong");
  v.textContent = formatWait(ms);
  card.appendChild(t);
  card.appendChild(v);
  return card;
}

function renderWallet(data) {
  const wrap = document.createElement("div");

  const hero = document.createElement("div");
  hero.className = "wallet-hero";
  const label = document.createElement("p");
  label.className = "wallet-label";
  label.textContent = "SỐ DƯ";
  const balance = document.createElement("h2");
  balance.className = "wallet-balance";
  balance.textContent = fmt(data.balance) + " " + String(data.currency || "Token Cá 🪙");
  const rank = document.createElement("p");
  rank.className = "muted";
  rank.textContent = data.rank
    ? "Hạng #" + data.rank + " / " + data.players + " người chơi"
    : "Bạn chưa có ví. Gõ /daily trong server để bắt đầu!";
  hero.appendChild(label);
  hero.appendChild(balance);
  hero.appendChild(rank);
  wrap.appendChild(hero);

  const cds = document.createElement("div");
  cds.className = "wallet-cooldowns";
  cds.appendChild(cooldownCard("🎁 /daily", data.dailyReadyInMs));
  cds.appendChild(cooldownCard("🎣 /work", data.workReadyInMs));
  wrap.appendChild(cds);

  const sub = document.createElement("h4");
  sub.className = "wallet-subtitle";
  sub.textContent = "Lịch sử của bạn";
  wrap.appendChild(sub);

  const history = Array.isArray(data.history) ? data.history : [];
  if (history.length === 0) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "Chưa có giao dịch nào.";
    wrap.appendChild(none);
  } else {
    const ul = document.createElement("ul");
    ul.className = "tx-list";
    for (const tx of history) {
      const info = TYPE_INFO[tx.type] || { icon: "⇄", label: String(tx.type) };

      const li = document.createElement("li");
      li.className = "tx-item";
      const icon = document.createElement("span");
      icon.className = "tx-icon";
      icon.textContent = info.icon;

      const main = document.createElement("div");
      main.className = "tx-main";
      const title = document.createElement("span");
      title.textContent = tx.note || info.label;
      const when = document.createElement("small");
      when.textContent = info.label + " · " + timeAgo(tx.at);
      main.appendChild(title);
      main.appendChild(when);

      const amount = document.createElement("span");
      amount.className = "tx-amount";
      amount.textContent = (tx.amount >= 0 ? "+" : "") + fmt(tx.amount) + " 🪙";

      li.appendChild(icon);
      li.appendChild(main);
      li.appendChild(amount);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  walletUi.tag.textContent = "TRỰC TIẾP";
  walletUi.box.replaceChildren(wrap);
}

async function fetchWallet(apiUrl, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(apiUrl + "/api/me", {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error("auth " + res.status);
      err.code = "auth";
      throw err;
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const showLoginNeeded = () =>
  walletMessage("🔐", "Đăng nhập để xem ví", "Đăng nhập bằng Discord để xem số dư và lịch sử giao dịch của bạn.", "ĐĂNG NHẬP", "Đăng nhập Discord", () => login());

const showReloginNeeded = () =>
  walletMessage("🔄", "Cần đăng nhập lại", "Phiên đăng nhập đã hết hạn hoặc chưa được lưu. Đăng nhập lại chỉ mất vài giây.", "ĐĂNG NHẬP", "Đăng nhập lại", () => login());

const showNoApi = () =>
  walletMessage("🔌", "Chưa kết nối bot", "Vào trang Tổng quan và bấm nút 🔌 Kết nối API để nhập địa chỉ API.", "MẤT KẾT NỐI");

const showWalletOffline = () =>
  walletMessage("🔌", "Không kết nối được bot", "Kiểm tra lại địa chỉ API, rồi thử lại sau ít phút.", "MẤT KẾT NỐI");

let walletBusy = false;

async function refreshWallet() {
  if (!loadUser()) return showLoginNeeded();

  const token = getToken();
  if (!token) return showReloginNeeded();

  const apiUrl = getApiUrl();
  if (!apiUrl) return showNoApi();

  if (walletBusy) return;
  walletBusy = true;
  try {
    renderWallet(await fetchWallet(apiUrl, token));
  } catch (err) {
    if (err.code === "auth") {
      clearToken();
      showReloginNeeded();
    } else {
      console.warn("Không tải được ví:", err);
      showWalletOffline();
    }
  } finally {
    walletBusy = false;
  }
}

document.addEventListener("nexus:auth", refreshWallet);
document.addEventListener("nexus:api", refreshWallet);
setInterval(() => {
  if (!document.hidden) refreshWallet();
}, 30000);

refreshWallet();
