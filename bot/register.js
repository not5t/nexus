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
    name: "shop",
    description: "Cửa hàng NEXUS (làm mới mỗi giờ)",
    options: [
      { type: 1, name: "view", description: "Xem 6 vật phẩm đang bán trong giờ này" },
      {
        type: 1,
        name: "buy",
        description: "Mua vật phẩm đang bán",
        options: [
          { type: 4, name: "slot", description: "Số thứ tự vật phẩm muốn mua (1-6)", required: true, min_value: 1, max_value: 6 },
          { type: 4, name: "quantity", description: "Số lượng muốn mua (cần câu chỉ mua được 1)", required: false, min_value: 1, max_value: 10000 },
        ],
      },
    ],
  },
  {
    name: "item",
    description: "Vật phẩm của bạn",
    options: [
      {
        type: 1,
        name: "view",
        description: "Xem thông tin chi tiết vật phẩm bạn đang có",
        options: [{ type: 3, name: "item", description: "Chọn vật phẩm bạn đang có", required: true, autocomplete: true }],
      },
    ],
  },
  { name: "hoca", description: "Xem hồ cá: các sinh vật đang xuất hiện (làm mới mỗi 20 phút)" },
  { name: "tuica", description: "Xem túi cá của bạn (tối đa 10 con)" },
  {
    name: "bosuutap",
    description: "Xem bộ sưu tập sinh vật bạn đã khám phá",
    options: [
      { type: 3, name: "loai", description: "Chọn một loài đã bắt được để xem chi tiết (bỏ trống để xem tổng quan)", required: false, autocomplete: true },
      {
        type: 3,
        name: "do_hiem",
        description: "Lọc theo độ hiếm",
        required: false,
        choices: [
          { name: "Common", value: "common" },
          { name: "Uncommon", value: "uncommon" },
          { name: "Rare", value: "rare" },
          { name: "Epic", value: "epic" },
          { name: "Legendary", value: "legendary" },
          { name: "Mythic", value: "mythic" },
          { name: "Secret", value: "secret" },
          { name: "Trash", value: "trash" },
        ],
      },
    ],
  },
  { name: "banca", description: "Bán cá trong túi (một con hoặc toàn bộ)" },
  {
    name: "cauca",
    description: "Câu cá (hồi chiêu 30 giây, tốn 1 mồi và 1 độ bền)",
    options: [
      { type: 3, name: "can", description: "Chọn cần câu (phải còn độ bền)", required: true, autocomplete: true },
      { type: 3, name: "moi", description: "Chọn mồi câu (phải có ít nhất 1)", required: true, autocomplete: true },
    ],
  },
  { name: "masoi", description: "Tạo phòng chơi Ma Sói trong server" },
  {
    name: "pay",
    description: "Chuyển Token Cá cho người khác (thuế 10%)",
    options: [
      { type: 6, name: "user", description: "Người nhận", required: true },
      { type: 4, name: "amount", description: "Số Token Cá muốn chuyển", required: true, min_value: 10, max_value: 1000000 },
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
