# NEXUS v0.7.1 — Security & Stability

## Kiến trúc được chọn
- Backend chính: Cloudflare Worker (`worker.js`).
- Database: Cloudflare D1 (`env.DB`).
- Discord slash commands: Discord Interactions gọi Worker `/interactions`.
- Frontend: GitHub Pages.
- Tiền tệ: Token Cá 🪙, dùng chung một số dư toàn cục cho cùng Discord ID ở mọi server Discord (không tách ví theo guild).
- `bot/` là mã Node.js + SQLite cũ, chỉ để tham khảo; không chạy đồng thời với Worker.

## Biến môi trường / secrets của Worker
Bắt buộc:
- `CLIENT_ID`: Discord Application ID.
- `DISCORD_CLIENT_SECRET`: đặt bằng Worker secret, tuyệt đối không đưa vào frontend hoặc Git.
- `DISCORD_PUBLIC_KEY`: Discord Application Public Key.
- `OAUTH_REDIRECT_URI`: `https://not5t.github.io/nexus/` (phải trùng chính xác với Redirects trong Discord Developer Portal và `js/auth.js`).
- `ALLOWED_ORIGIN`: `https://not5t.github.io`.
- `SITE_URL`: `https://not5t.github.io/nexus`.
- D1 binding tên `DB`.

Tùy chọn Linkvertise:
- `LINKVERTISE_USER_ID`
- `LINKVERTISE_ANTIBYPASS_TOKEN`
- Có đủ cả hai thì nút Linkvertise mới bật. Không có token xác minh thì hệ thống từ chối cấp thưởng.

Link4m tạm bị khóa phần nhận thưởng trong v0.7.1 cho đến khi có tài liệu/API xác minh hoàn thành chính thức. Không được coi thời gian chờ là bằng chứng đã vượt link.

## OAuth2
1. Trong Discord Developer Portal, thêm redirect URI chính xác: `https://not5t.github.io/nexus/`.
2. Scope dùng: `identify`.
3. Worker cần secret `DISCORD_CLIENT_SECRET`.
4. Đăng nhập dùng Authorization Code + PKCE S256. Discord access token chỉ được Worker sử dụng để lấy hồ sơ; trình duyệt chỉ lưu opaque NEXUS session token có hạn 7 ngày.
5. Sau khi cập nhật Worker, đăng nhập lại để tạo phiên mới.

## Cập nhật
- Thêm bảng `sessions` và `interaction_receipts` tự động bằng `ensureSchema()`; không cần xóa dữ liệu `users`, `transactions`, `claims` hay `earn_log`.
- Kiểm tra chữ ký Discord Ed25519 và timestamp không quá 5 phút.
- ID interaction được ghi nhận để chặn xử lý trùng.
- Đăng xuất thu hồi session ở D1.
- `nhan.html` nạp `js/config.js`, vì vậy dùng được API URL đã cấu hình sẵn.

## Triển khai an toàn
1. Sao lưu D1 trước khi cập nhật Worker.
2. Cập nhật `worker.js` lên Cloudflare Worker.
3. Thêm secret/vars còn thiếu trong Worker Settings.
4. Giữ `js/config.js` với URL Worker đúng.
5. Deploy lại GitHub Pages.
6. Đăng nhập lại, thử `/balance`, `/daily`, `/work`, `/pay`, bảng xếp hạng và nhận thưởng.
7. Chỉ bật Linkvertise sau khi xác nhận anti-bypass token hoạt động. Link4m chưa cấp thưởng ở bản này.

**Không xóa D1 hiện tại khi nâng cấp.** Các bảng mới sẽ được tạo tự động; dữ liệu số dư hiện có được giữ nguyên.
