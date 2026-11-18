// Đăng ký lệnh / lên Discord cho bản chạy trên Cloudflare (không cần discord.js).
// Chạy trong thư mục bot:  node --env-file=.env register.js
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong file .env");
  process.exit(1);
}

const commands = [
  {
    name: "balance",
    description: "Xem số dư Token Cá",
    options: [{ type: 6, name: "user", description: "Người bạn muốn xem (mặc định là bạn)", required: false }],
  },
  { name: "daily", description: "Điểm danh nhận Token Cá mỗi ngày" },
  { name: "work", description: "Đi làm việc ngoài biển để kiếm Token Cá" },
  {
    name: "pay",
    description: "Chuyển Token Cá cho người khác",
    options: [
      { type: 6, name: "user", description: "Người nhận", required: true },
      { type: 4, name: "amount", description: "Số Token Cá muốn chuyển", required: true, min_value: 1, max_value: 1000000 },
    ],
  },
  {
    name: "leaderboard",
    description: "Xem bảng xếp hạng",
    options: [
      {
        type: 3,
        name: "loai",
        description: "Chọn loại bảng xếp hạng (mặc định là Token Cá)",
        required: false,
        choices: [
          { name: "Token Cá", value: "tokens" },
          { name: "Vượt link", value: "links" },
        ],
      },
    ],
  },
];

// Có GUILD_ID: cập nhật ngay trong server đó. PUT sẽ thay thế toàn bộ lệnh cũ cùng phạm vi.
const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${DISCORD_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error("❌ Đăng ký thất bại:", res.status, await res.text());
  process.exit(1);
}
console.log(`✅ Đã đăng ký ${commands.length} lệnh ${GUILD_ID ? "cho server test" : "toàn cục"}.`);
