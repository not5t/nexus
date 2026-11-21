// NEXUS - Cửa hàng (chỉ để xem, muốn mua thì gõ /shop buy trên Discord). Dùng getApiUrl, fmt từ dashboard.js
const shopUi = {
  box: document.getElementById("shop-content"),
  tag: document.getElementById("shop-tag"),
};

let shopData = null;
let shopOffset = 0; // chênh lệch giờ giữa máy chủ và máy bạn, để đếm ngược luôn đúng
let shopBusy = false;
let shopLastFetch = 0;

function shopEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shopMessage(icon, title, text, tag) {
  const box = shopEl("div", "empty-state");
  box.append(shopEl("span", "", icon), shopEl("h3", "", title), shopEl("p", "", text));
  shopUi.tag.textContent = tag;
  shopUi.box.replaceChildren(box);
  shopData = null;
}

function renderShop(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) return shopMessage("🛒", "Cửa hàng đang trống", "Quay lại sau ít phút nhé.", "TRỐNG");

  shopData = { refreshAt: Number(data.refreshAt) || 0 };
  shopOffset = (Number(data.now) || Date.now()) - Date.now();

  const timer = shopEl("p", "shop-timer");
  timer.id = "shop-timer";

  const grid = shopEl("ul", "shop-grid");
  for (const it of items) {
    const card = shopEl("li", "shop-card");
    card.append(
      shopEl("span", "shop-slot", "#" + it.slot),
      shopEl("span", "shop-icon", String(it.icon || "🎁")),
      shopEl("span", "shop-name", String(it.name)),
      shopEl("span", "shop-kind", String(it.typeName || "")),
      shopEl("span", "shop-price", fmt(it.price) + " 🪙")
    );
    grid.appendChild(card);
  }

  const hint = shopEl("div", "shop-hint");
  const line1 = shopEl("div");
  line1.append("Muốn mua? Vào Discord và gõ ", shopEl("code", "", "/shop buy"), ", chọn ", shopEl("b", "", "slot"), " (1-4) và ", shopEl("b", "", "số lượng"), ".");
  const line2 = shopEl("div", "", "Cần câu chỉ mua được 1 cái mỗi loại. Thông tin chi tiết chỉ xem được sau khi bạn sở hữu vật phẩm.");
  const line3 = shopEl("div");
  line3.append("Xem đồ bạn đang có: ", shopEl("code", "", "/item view"), " hoặc ", shopEl("code", "", "/balance"), ".");
  hint.append(line1, line2, line3);

  shopUi.tag.textContent = "ĐANG BÁN";
  shopUi.box.replaceChildren(timer, grid, hint);
  tickShop();
}

function tickShop() {
  if (!shopData) return;
  const left = shopData.refreshAt - (Date.now() + shopOffset);
  const timer = document.getElementById("shop-timer");
  if (timer) {
    const s = Math.max(0, Math.ceil(left / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    timer.textContent = "🔄 Làm mới sau " + mm + ":" + ss;
  }
  // Hết giờ thì tải hàng mới (không gọi dồn dập nếu máy chủ chưa kịp đổi)
  if (left <= 0 && Date.now() - shopLastFetch > 3000) refreshShop();
}

async function refreshShop() {
  const apiUrl = getApiUrl();
  if (!apiUrl) return shopMessage("🔌", "Chưa kết nối bot", "Chưa có địa chỉ API. Chủ web cần điền vào file js/config.js.", "MẤT KẾT NỐI");
  if (shopBusy) return;

  shopBusy = true;
  shopLastFetch = Date.now();
  try {
    const res = await fetch(apiUrl + "/api/shop", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    renderShop(await res.json());
  } catch (err) {
    console.warn("Không tải được cửa hàng:", err);
    shopMessage("🔌", "Không kết nối được bot", "Thử lại sau ít phút.", "MẤT KẾT NỐI");
  } finally {
    shopBusy = false;
  }
}

document.addEventListener("nexus:api", refreshShop);
setInterval(tickShop, 1000);
setInterval(() => {
  if (!document.hidden) refreshShop();
}, 60000);

refreshShop();
