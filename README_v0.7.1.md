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

Tùy chọn Linkvertise (bản xác minh mới):
- `LINKVERTISE_USER_ID`
- `LINKVERTISE_ANTIBYPASS_TOKEN`
- Có đủ cả hai thì nút Linkvertise mới bật. Worker bắt buộc xác minh anti-bypass thành công trước khi cấp thưởng.

Tùy chọn Link4m (khôi phục cơ chế cũ):
- `LINK4M_API_URL`: URL API rút gọn do Link4m cung cấp, trong đó vị trí URL đích phải được thay bằng `{url}`.
- Có `LINK4M_API_URL` hợp lệ thì nút Link4m bật.
- **Cảnh báo:** cơ chế cũ không nhận callback/chứng thực hoàn thành từ Link4m. Nó chỉ kiểm tra token một lần, thời gian chờ tối thiểu 20 giây, giới hạn 10 lần tạo lượt/ngày và 1 lần nhận thưởng/ngày. Vì vậy Link4m cũ có thể bị lách bằng cách chờ đủ thời gian; không có mức bảo đảm chống bypass như Linkvertise bản mới.

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
7. Kiểm tra Linkvertise bằng anti-bypass token thật. Với Link4m, chỉ bật khi chấp nhận cơ chế cũ có thể bị lách; nên thử bằng tài khoản test và theo dõi `earn_log`/`transactions`.

**Không xóa D1 hiện tại khi nâng cấp.** Các bảng mới sẽ được tạo tự động; dữ liệu số dư hiện có được giữ nguyên.


## Cập nhật giao diện trạng thái bot

- Đổi nhãn "Trạng thái API" thành "Trạng thái bot".
- Đổi nút kết nối và thông báo lỗi sang ngôn ngữ hướng tới người quản trị bot.
- Giữ nguyên endpoint `/api/stats`, cấu hình `NEXUS_API_URL` và cấu trúc dữ liệu backend để không ảnh hưởng tích hợp hiện tại.
- Trạng thái hiển thị phản ánh backend NEXUS/Worker có phản hồi; không đại diện cho trạng thái Presence của bot trong Discord.

## Minigame `/masoi` — Durable Objects

### Module mới
- `game/roles.js`: danh sách vai trò, mô tả và chia vai ngẫu nhiên.
- `game/gameManager.js`: Durable Object `MasoiRoom`, một đối tượng/phòng cho mỗi Guild; lưu trạng thái và dùng Alarm để chuyển pha.
- `game/masoiCommand.js`: định danh lệnh Ma Sói.
- `worker.js`: nhận slash command/component interaction, chuyển thao tác tới Durable Object; kết quả Token Cá ghi vào D1 hiện tại.
- `bot/register.js`: thêm lệnh `/masoi` vào danh sách đăng ký slash command.

### Cấu hình Cloudflare bắt buộc
1. Deploy Worker dạng **multi-file/module**, giữ nguyên `worker.js`, thư mục `game/` và tất cả file NEXUS hiện có. Không chỉ dán riêng nội dung `worker.js`, vì file này import các module trong `game/`. Nếu dùng Wrangler, cấu hình class SQLite bằng `exports` như mẫu; Cloudflare hiện khuyến nghị `exports` cho class mới và tự provision namespace ở lần deploy đầu. [Tài liệu Cloudflare](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).
2. Tạo Durable Object class và binding (namespace mới phải dùng SQLite):
   - Hợp nhất `[[durable_objects.bindings]]` và `[exports.MasoiRoom]` trong `wrangler.masoi.example.toml` vào cấu hình Wrangler hiện tại.
   - Binding variable: `MASOI_ROOMS`; class: `MasoiRoom`; storage: `sqlite`.
   - Deploy Worker. Khai báo `exports` sẽ provision namespace khi deploy lần đầu; sau đó kiểm tra Worker Settings → Bindings để xác nhận `MASOI_ROOMS` đã xuất hiện.
   - Giữ nguyên D1 binding `DB` và database ID đang chạy. Không dùng `migrations` song song với `exports`.
3. Trong Worker Settings → Variables and Secrets, thêm secret `DISCORD_BOT_TOKEN` (token bot Discord, không phải Client Secret OAuth2).
4. Bot cần quyền xem kênh, gửi tin nhắn, nhúng liên kết và gửi DM. Người chơi phải cho phép nhận DM từ thành viên server; nếu một người không nhận được DM, phòng sẽ không bắt đầu để tránh phân vai dở dang.
5. Đăng ký lại slash commands bằng `node --env-file=.env register.js` trong thư mục `bot/`. `.env` cần `DISCORD_TOKEN`, `CLIENT_ID`; thêm `GUILD_ID` nếu muốn đăng ký nhanh cho một server thử nghiệm. Script PUT thay thế danh sách slash command cùng phạm vi, vì vậy danh sách NEXUS hiện có đã được giữ trong `register.js`.
6. Giữ nguyên Discord Interactions Endpoint URL đang trỏ tới Worker. Không chạy `bot/index.js` Node + SQLite song song với Worker + D1.

### Luồng và thời gian
- Lobby: tối đa 25, tối thiểu 6; tự hủy sau 5 phút; chỉ 1 phòng/Guild.
- Có ít nhất 6 người sẵn sàng (hoặc toàn bộ người trong phòng sẵn sàng) thì bắt đầu sớm.
- Ban đêm: 25 giây cho Cupid/Bảo Vệ/Sói/Tiên Tri; sau đó Phù Thủy có 15 giây.
- Thảo luận: 60 giây. Bỏ phiếu: 30 giây. Người sống được đổi phiếu; Skip là nút riêng cạnh menu để tuân thủ giới hạn tối đa 25 lựa chọn của Discord Select Menu.
- DM đóng được kiểm tra trước khi chia vai. Lựa chọn cũ sau khi hết pha bị từ chối; interaction ID được chống xử lý lặp ở Worker.
- Phòng và timer được lưu trong Durable Object Alarm, không dùng `setTimeout` trong Worker request.
- Thưởng thắng +200 Token Cá/người thắng, gồm cả người thắng đã chết; người thua còn sống +10. Bảng `masoi_payouts` có khóa duy nhất theo ván/người để tránh cộng thưởng trùng nếu Alarm chạy lại.

### Lưu ý luật chơi trong bản đầu
- Với 6–7 người: đúng 1 Ma Sói; có Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Già Làng; 7 người thêm Dân Thường.
- Với 8–25 người: số Sói nằm trong khoảng 1/4–1/3; Cupid xuất hiện, các vai Kẻ Chán Đời/Kẻ Bị Nguyền/Sói Con/Sói Cô Độc được thêm khi đủ số người.
- Phù Thủy có một lần Cứu và một lần Độc; bình Cứu cứu mục tiêu Sói đầu tiên nếu đêm có hai mục tiêu.
- Sói Con chết thì đêm kế tiếp bầy Sói có thể chọn hai mục tiêu.
- Thợ Săn có 15 giây chọn mục tiêu khi chết. Già Làng bị treo cổ hoặc đầu độc sẽ vô hiệu kỹ năng đặc biệt phe Dân.
- Ma Sói dùng phiếu chọn mục tiêu theo đa số; nếu hòa ở mục tiêu cao nhất thì không có mục tiêu bị cắn. Đây là quy tắc kỹ thuật mặc định của bản đầu.
- Cặp Đôi chỉ kích hoạt điều kiện thắng riêng khi ghép một người phe Dân với một người phe Sói và họ là hai người cuối cùng còn sống.

**Quan trọng:** đây là bản triển khai mã nguồn, chưa được deploy vào Cloudflare hoặc kiểm thử bằng một ván Discord thật. Sau khi thêm Durable Object binding, secret và đăng ký `/masoi`, hãy thử một ván riêng với 6 tài khoản test trước khi mở cho toàn server. Không xóa D1 hiện tại.
