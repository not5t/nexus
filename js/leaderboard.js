// NEXUS v0.6a - Bảng xếp hạng Token Cá (dùng getApiUrl, fmt từ dashboard.js)
const lbUi = {
  box: document.getElementById("leaderboard-content"),
  tag: document.getElementById("leaderboard-tag"),
};

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

function renderLeaderboard(data) {
  const top = Array.isArray(data.top) ? data.top : [];
  if (top.length === 0) {
    return lbMessage("🌊", "Chưa có ai trên bảng", "Gõ /daily trong server để là người đầu tiên!", "TOKEN CÁ");
  }

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
    amount.textContent = fmt(p.balance) + " 🪙";

    li.appendChild(rank);
    li.appendChild(avatar);
    li.appendChild(main);
    li.appendChild(amount);
    ul.appendChild(li);
  }

  lbUi.tag.textContent = "TOKEN CÁ";
  lbUi.box.replaceChildren(ul);
}

let lbBusy = false;

async function refreshLeaderboard() {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    return lbMessage("🔌", "Chưa kết nối bot", "Vào trang Tổng quan và bấm nút 🔌 Kết nối API.", "MẤT KẾT NỐI");
  }
  if (lbBusy) return;

  lbBusy = true;
  try {
    const res = await fetch(apiUrl + "/api/leaderboard", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderLeaderboard(await res.json());
  } catch (err) {
    console.warn("Không tải được bảng xếp hạng:", err);
    lbMessage("🔌", "Không kết nối được bot", "Thử lại sau ít phút.", "MẤT KẾT NỐI");
  } finally {
    lbBusy = false;
  }
}

document.addEventListener("nexus:api", refreshLeaderboard);
setInterval(() => {
  if (!document.hidden) refreshLeaderboard();
}, 30000);

refreshLeaderboard();
