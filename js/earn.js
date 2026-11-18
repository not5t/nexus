// NEXUS v0.7.1 - Trang Kiếm Token Cá (vượt link). Dùng loadUser/getToken/login (auth.js), getApiUrl (dashboard.js), formatWait (wallet.js)
const earnUi = {
  box: document.getElementById("earn-content"),
  tag: document.getElementById("earn-tag"),
};

const EARN_ERRORS = {
  already_claimed_today: "Bạn đã nhận thưởng hôm nay rồi. Quay lại sau 00:00 nhé!",
  provider_unavailable: "Phương thức này chưa sẵn sàng, hãy chọn phương thức khác.",
  too_many_starts: "Bạn tạo link quá nhiều lần hôm nay. Thử lại vào ngày mai.",
  shorten_failed: "Không tạo được link lúc này, thử lại sau hoặc chọn phương thức khác.",
};

function earnMessage(icon, title, text, tag, label, onClick) {
  const box = document.createElement("div");
  box.className = "empty-state";
  for (const [el, value] of [["span", icon], ["h3", title], ["p", text]]) {
    const node = document.createElement(el);
    node.textContent = value;
    box.appendChild(node);
  }
  if (label) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    box.appendChild(btn);
  }
  earnUi.tag.textContent = tag;
  earnUi.box.replaceChildren(box);
}

async function earnCall(path, body) {
  const res = await fetch(getApiUrl() + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + getToken(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function renderEarn(status) {
  if (status.claimedToday) {
    return earnMessage(
      "✅", "Bạn đã nhận thưởng hôm nay",
      "Phần thưởng mới mở lại sau 00:00 giờ Việt Nam (" + formatWait(status.resetInMs).toLowerCase() + ").",
      "ĐÃ NHẬN"
    );
  }

  const wrap = document.createElement("div");

  const hero = document.createElement("div");
  hero.className = "wallet-hero";
  const label = document.createElement("p");
  label.className = "wallet-label";
  label.textContent = "PHẦN THƯỞNG HÔM NAY";
  const amount = document.createElement("h2");
  amount.className = "wallet-balance";
  amount.textContent = "+" + fmt(status.amount) + " Token Cá 🪙";
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = "Chọn một cách vượt link bên dưới. Mỗi ngày nhận 1 lần, làm mới lúc 00:00 giờ Việt Nam.";
  hero.append(label, amount, hint);
  wrap.appendChild(hero);

  const note = document.createElement("p");
  note.className = "notice";
  const actions = document.createElement("div");
  actions.className = "earn-actions";

  for (const [key, name] of [["linkvertise", "Linkvertise"], ["link4m", "Link4m"]]) {
    const btn = document.createElement("button");
    btn.className = "btn btn-big";
    const ready = status.providers && status.providers[key];
    btn.textContent = ready ? "Vượt link bằng " + name : name + " (chưa sẵn sàng)";
    btn.disabled = !ready;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      note.textContent = "Đang tạo link...";
      try {
        const { status: code, data } = await earnCall("/api/earn/start", { provider: key });
        if (code === 200 && data.url) return location.assign(data.url);
        note.textContent = EARN_ERRORS[data.error] || "Có lỗi xảy ra, thử lại sau.";
      } catch {
        note.textContent = "Không kết nối được bot, thử lại sau.";
      }
      btn.disabled = false;
    });
    actions.appendChild(btn);
  }
  wrap.appendChild(actions);
  wrap.appendChild(note);

  const info = document.createElement("p");
  info.className = "muted earn-info";
  info.textContent =
    "Link rút gọn có quảng cáo của bên thứ ba, doanh thu giúp duy trì NEXUS. Hãy cẩn thận với quảng cáo lạ và không tải hay cài gì ngoài ý muốn. Sau khi vượt link xong, bạn sẽ được đưa tới trang nhận thưởng.";
  wrap.appendChild(info);

  earnUi.tag.textContent = "SẴN SÀNG";
  earnUi.box.replaceChildren(wrap);
}

let earnBusy = false;

async function refreshEarn() {
  if (!loadUser()) return earnMessage("🔐", "Đăng nhập để kiếm Token Cá", "Đăng nhập bằng Discord để nhận thưởng vượt link.", "ĐĂNG NHẬP", "Đăng nhập Discord", () => login());
  if (!getToken()) return earnMessage("🔄", "Cần đăng nhập lại", "Phiên đăng nhập đã hết hạn. Đăng nhập lại chỉ mất vài giây.", "ĐĂNG NHẬP", "Đăng nhập lại", () => login());
  if (!getApiUrl()) return earnMessage("🔌", "Chưa kết nối bot", "Vào trang Tổng quan và bấm nút 🔌 Kết nối API.", "MẤT KẾT NỐI");
  if (earnBusy) return;

  earnBusy = true;
  try {
    const { status, data } = await earnCall("/api/earn/status");
    if (status === 401 || status === 403) {
      clearToken();
      return earnMessage("🔄", "Cần đăng nhập lại", "Phiên đăng nhập đã hết hạn. Đăng nhập lại chỉ mất vài giây.", "ĐĂNG NHẬP", "Đăng nhập lại", () => login());
    }
    if (status !== 200) throw new Error("HTTP " + status);
    renderEarn(data);
  } catch (err) {
    console.warn("Không tải được trạng thái kiếm Token:", err);
    earnMessage("🔌", "Không kết nối được bot", "Thử lại sau ít phút.", "MẤT KẾT NỐI");
  } finally {
    earnBusy = false;
  }
}

document.addEventListener("nexus:auth", refreshEarn);
document.addEventListener("nexus:api", refreshEarn);
refreshEarn();
