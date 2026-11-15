const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require("discord.js");
const commands = require("./commands");
const { startApi } = require("./api");

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Thiếu DISCORD_TOKEN. Hãy tạo file .env từ env.example.");
  process.exit(1);
}

// Slash command không cần intent đặc biệt nào ngoài Guilds
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`✅ NEXUS đã online: ${readyClient.user.tag}`);
  startApi(readyClient);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Lỗi ở lệnh /${interaction.commandName}:`, err);
    const msg = { content: "Có lỗi xảy ra, bạn thử lại sau nhé.", flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

process.on("unhandledRejection", err => console.error("Unhandled rejection:", err));

client.login(process.env.DISCORD_TOKEN);
