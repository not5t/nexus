// NEXUS - Trang nhận thưởng sau khi vượt link (nhan.html)
const params = new URLSearchParams(location.search);
const claimToken = params.get("t") || "";
const linkHash = params.get("hash") || "";
const claimBox = document.getElementById("claim-box");

const CLAIM_ERRORS = {
  too_fast: "Bạn hoàn thành quá nhanh. Hãy đi hết các bước của link rồi bấm nhận lại (mã vẫn còn hiệu lực).",
  verify_failed: "Không xác minh được lượt vượt link. Hãy vượt link đầy đủ, không dùng công cụ bỏ qua.",
  not_yours: "Link này thuộc về một tài khoản khác. Hãy tự vượt link của bạn ở trang Kiếm Token Cá.",
  used: "Mã này đã được sử dụng rồi.",
  expired: "Mã đã hết hạn (quá 30 phút). Hãy tạo link mới ở trang Kiếm Token Cá.",
  already_claimed_today: "Bạn đã nhận thưởng hôm nay rồi. Quay lại sau 00:00 nhé!",
  not_found: "Link không hợp lệ.",
  bad_token: "Link không hợp lệ.",
};

function readToken() {
  try {
    const saved = JSON.parse(localStorage.getItem("nexus_token"));
    if (saved && saved.token && saved.expiresAt > Date.now()) return saved.token;
  } catch {}
  return null;
}

function readApi() {
  try {
    const url = new URL(localStorage.getItem("nexus_api_url") || "");
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function showClaim(icon, title, text, button) {
  const box = document.createElement("div");
  box.className = "empty-state";
  for (const [el, value] of [["span", icon], ["h3", title], ["p", text]]) {
    const node = document.createElement(el);
    node.textContent = value;
    box.appendChild(node);
  }
  if (button) {
    const btn = document.createElement(button.href ? "a" : "button");
    btn.className = "btn btn-big";
    btn.textContent = button.label;
    if (button.href) btn.href = button.href;
    else btn.addEventListener("click", button.onClick);
    box.appendChild(btn);
  }
  claimBox.replaceChildren(box);
}

const HOME = { label: "Về trang chính NEXUS", href: "./" };

async function doClaim() {
  showClaim("⏳", "Đang xử lý...", "Vui lòng đợi trong giây lát.");
  try {
    const res = await fetch(readApi() + "/api/earn/claim", {
      method: "POST",
      headers: { Authorization: "Bearer " + readToken(), "Content-Type": "application/json" },
      body: JSON.stringify({ token: claimToken, hash: linkHash || undefined }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      return showClaim(
        "🎉", "Nhận thành công!",
        "Bạn nhận được " + Number(data.amount).toLocaleString("vi-VN") + " Token Cá 🪙. Số dư hiện tại: " +
          Number(data.balance).toLocaleString("vi-VN") + ". Cảm ơn bạn đã dành thời gian ủng hộ NEXUS ❤️ (Bot sẽ nhắn riêng cho bạn nếu bạn cho phép nhận tin nhắn riêng.)",
        HOME
      );
    }
    if (res.status === 401) return showClaim("🔄", "Cần đăng nhập lại", "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại ở trang chính rồi mở lại link này.", HOME);

    const retry = data.error === "too_fast" ? { label: "Thử lại", onClick: doClaim } : HOME;
    showClaim("⚠️", "Chưa nhận được", CLAIM_ERRORS[data.error] || "Có lỗi xảy ra, thử lại sau.", retry);
  } catch {
    showClaim("🔌", "Không kết nối được bot", "Thử lại sau ít phút.", { label: "Thử lại", onClick: doClaim });
  }
}

if (!/^[0-9a-f]{48}$/.test(claimToken)) {
  showClaim("⚠️", "Link không hợp lệ", "Hãy vào trang Kiếm Token Cá để tạo link mới.", HOME);
} else if (!readToken()) {
  showClaim("🔐", "Bạn chưa đăng nhập", "Hãy đăng nhập Discord ở trang chính (cùng trình duyệt này), rồi mở lại link vừa vượt.", HOME);
} else if (!readApi()) {
  showClaim("🔌", "Chưa kết nối bot", "Mở trang chính NEXUS và kết nối API trước, rồi mở lại link này.", HOME);
} else {
  showClaim("🪙", "Nhận Token Cá", "Bạn đã vượt link xong? Bấm nút bên dưới để nhận phần thưởng hôm nay.", { label: "Nhận Token Cá 🪙", onClick: doClaim });
}
