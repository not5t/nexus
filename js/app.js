// NEXUS - Điều hướng giữa các trang (mỗi lần chỉ hiện một trang)
const ROUTES = {
  "tong-quan": { title: "Tổng quan", eyebrow: "BẢNG ĐIỀU KHIỂN" },
  "vi": { title: "Ví của tôi", eyebrow: "TÀI KHOẢN" },
  "kiem-token": { title: "Kiếm Token Cá", eyebrow: "PHẦN THƯỞNG" },
  "xep-hang": { title: "Bảng xếp hạng", eyebrow: "CỘNG ĐỒNG" },
  "kinh-te": { title: "Kinh tế", eyebrow: "HỆ THỐNG" },
};
const DEFAULT_ROUTE = "tong-quan";

function currentRoute() {
  const name = location.hash.slice(1);
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

function showRoute() {
  const name = currentRoute();

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== "page-" + name;
  });

  document.querySelectorAll("[data-route]").forEach(link => {
    const active = link.dataset.route === name;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  document.getElementById("page-title").textContent = ROUTES[name].title;
  document.getElementById("page-eyebrow").textContent = ROUTES[name].eyebrow;
  document.title = ROUTES[name].title + " · NEXUS";
  window.scrollTo(0, 0);
}

// Lưu ý: không ghi đè location.hash ở đây, vì Discord trả token về qua hash khi đăng nhập
window.addEventListener("hashchange", showRoute);
showRoute();
