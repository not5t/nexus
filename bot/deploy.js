// Đăng ký slash command lên Discord. Chạy lại mỗi khi thêm/sửa lệnh.
const { REST, Routes } = require("discord.js");
const commands = require("./commands");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error("❌ Thiếu DISCORD_TOKEN hoặc CLIENT_ID trong file .env");
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

// Có GUILD_ID: lệnh cập nhật ngay lập tức trong server đó (hợp để test).
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

(async () => {
  try {
    const body = commands.map(c => c.data.toJSON());
    await rest.put(route, { body });
    console.log(`✅ Đã đăng ký ${body.length} lệnh ${GUILD_ID ? "cho server test" : "toàn cục"}.`);
  } catch (err) {
    console.error("❌ Đăng ký lệnh thất bại:", err);
    process.exit(1);
  }
})();
