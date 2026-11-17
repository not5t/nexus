// NEXUS - Bảng xếp hạng (2 loại: Token Cá và Vượt link). Dùng getApiUrl, fmt từ dashboard.js
const lbUi = {
  box: document.getElementById("leaderboard-content"),
  tag: document.getElementById("leaderboard-tag"),
  tabs: document.querySelectorAll("[data-lb]"),
};

const LB_TYPES = {
  tokens: { tag: "TOKEN CÁ", empty: "Gõ /daily trong server để là người đầu tiên!", value: p => fmt(p.balance) + " 🪙" },
  links: { tag: "VƯỢT LINK", empty: "Vào trang Kiếm Token Cá để vượt link đầu tiên!", value: p => fmt(p.count) + " lần" },
};

let lbType = "tokens";

function lbMessage(icon, title, text, tag) {
  const box = document.createElement("div");
  box.className = "empty-state";
  for (const [el, value] of [["span", icon], ["h3", title], ["p", text]]) {
    const node = document.createElement(el);
    node.textContent = value;
    box.appendChild(node);
  }
  lbUi.tag.textContent = tag;
  lbUi.box.replaceChildren(box);
}

function renderLeaderboard(data, type) {
  const cfg = LB_TYPES[type];
  const top = Array.isArray(data.top) ? data.top : [];
  if (top.length === 0) return lbMessage("🌊", "Chưa có ai trên bảng", cfg.empty, cfg.tag);

  const medals = ["🥇", "🥈", "🥉"];
  const ul = document.createElement("ul");
  ul.className = "tx-list";

  for (const p of top) {
    const li = document.createElement("li");
    li.className = "tx-item";

    const rank = document.createElement("span");
    rank.className = "tx-icon";
    rank.textContent = medals[p.rank - 1] || "#" + p.rank;

    const avatar = document.createElement("span");
    avatar.className = "avatar has-img";
    if (typeof p.avatar === "string" && p.avatar.startsWith("https://cdn.discordapp.com/")) {
      const img = document.createElement("img");
      img.src = p.avatar;
      img.alt = "";
      avatar.appendChild(img);
    } else {
      avatar.textContent = "🐟";
    }

    const main = document.createElement("div");
    main.className = "tx-main";
    const name = document.createElement("span");
    name.textContent = p.name;
    main.appendChild(name);

    const amount = document.createElement("span");
    amount.className = "tx-amount";
    amount.textContent = cfg.value(p);

    li.append(rank, avatar, main, amount);
    ul.appendChild(li);
  }

  lbUi.tag.textContent = cfg.tag;
  lbUi.box.replaceChildren(ul);
}

let lbBusy = false;

async function refreshLeaderboard() {
  const apiUrl = getApiUrl();
  if (!apiUrl) return lbMessage("🔌", "Chưa kết nối bot", "Chưa có địa chỉ API. Chủ web cần điền vào file js/config.js.", "MẤT KẾT NỐI");
  if (lbBusy) return;

  lbBusy = true;
  const type = lbType;
  try {
    const res = await fetch(apiUrl + "/api/leaderboard?type=" + type, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (type === lbType) renderLeaderboard(data, type); // bỏ qua nếu người dùng đã đổi tab
  } catch (err) {
    console.warn("Không tải được bảng xếp hạng:", err);
    lbMessage("🔌", "Không kết nối được bot", "Thử lại sau ít phút.", "MẤT KẾT NỐI");
  } finally {
    lbBusy = false;
  }
}

for (const tab of lbUi.tabs) {
  tab.addEventListener("click", () => {
    lbType = tab.dataset.lb;
    lbUi.tabs.forEach(t => t.classList.toggle("active", t === tab));
    lbBusy = false;
    refreshLeaderboard();
  });
}

document.addEventListener("nexus:api", refreshLeaderboard);
setInterval(() => {
  if (!document.hidden) refreshLeaderboard();
}, 30000);

refreshLeaderboard();
