
const menuButton = document.getElementById("menu-toggle");
const sidebar = document.querySelector(".sidebar");

menuButton.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item")
      .forEach(link => link.classList.remove("active"));

    item.classList.add("active");

    if (window.innerWidth <= 850) {
      sidebar.classList.remove("open");
    }
  });
});

console.log("NEXUS Dashboard initialized!");
  
