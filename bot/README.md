# NEXUS Bot Node.js (Legacy / không dùng cùng Worker)

Thư mục này là bản thử nghiệm Node.js + SQLite cũ, được giữ lại để tham khảo.

**Bản v0.7.1 chọn Cloudflare Worker + D1 làm backend chính.** Website và Discord Interactions đều dùng `worker.js` và cùng một database D1.

Không chạy `bot/index.js` cùng lúc như một backend kinh tế độc lập: thư mục này dùng SQLite riêng (`bot/data/nexus.db`), không đồng bộ với D1, nên số dư và lịch sử sẽ tách rời.

Các lệnh trong bot Node.js cũng không đầy đủ bằng Worker (ví dụ chưa có `/pay`, `/leaderboard` và luồng vượt link). Chỉ sử dụng thư mục này nếu sau này bạn chủ động chuyển kiến trúc và viết adapter đồng bộ database.

