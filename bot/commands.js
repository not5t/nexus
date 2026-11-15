const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("./config");
const { getBalance, claimReward } = require("./db");

const money = n =>
  `${n.toLocaleString("vi-VN")} ${config.currency.name} ${config.currency.emoji}`;

const embed = () => new EmbedBuilder().setColor(config.color);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const waitText = ts => `<t:${Math.ceil(ts / 1000)}:R>`;

const WORK_STORIES = [
  "Bạn ngồi câu ở bến cảng và kéo lên một con cá thu to",
  "Bạn giúp ngư dân kéo lưới buổi sáng",
  "Bạn bán cá tươi ở chợ nổi",
  "Bạn lặn nhặt san hô và ốc biển ngoài khơi",
  "Bạn sửa thuyền cho một lão ngư",
  "Bạn thả lưới đêm và bắt được cả mẻ cá cơm",
];

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("balance")
      .setDescription(`Xem số dư ${config.currency.name}`)
      .addUserOption(option =>
        option
          .setName("user")
          .setDescription("Người bạn muốn xem (mặc định là bạn)")
      ),

    async execute(interaction) {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const balance = getBalance(target.id);

      await interaction.reply({
        embeds: [
          embed()
            .setTitle(`👛 Ví của ${target.displayName}`)
            .setDescription(`**${money(balance)}**`),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("daily")
      .setDescription("Điểm danh nhận thưởng mỗi ngày"),

    async execute(interaction) {
      const result = claimReward(
        interaction.user.id,
        "daily",
        config.daily.amount,
        "Điểm danh hằng ngày"
      );

      if (!result.ok) {
        return interaction.reply({
          content: `⏳ Bạn đã điểm danh rồi. Quay lại ${waitText(result.availableAt)} nhé!`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        embeds: [
          embed()
            .setTitle("🎁 Điểm danh hằng ngày")
            .setDescription(
              `Bạn nhận được **${money(result.amount)}**\nSố dư: **${money(result.balance)}**`
            ),
        ],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName("work")
      .setDescription("Đi làm việc ngoài biển để kiếm tiền"),

    async execute(interaction) {
      const amount = randInt(config.work.min, config.work.max);
      const story = WORK_STORIES[randInt(0, WORK_STORIES.length - 1)];

      const result = claimReward(interaction.user.id, "work", amount, story);

      if (!result.ok) {
        return interaction.reply({
          content: `😮‍💨 Bạn đang nghỉ ngơi. Có thể làm việc lại ${waitText(result.availableAt)}.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.reply({
        embeds: [
          embed()
            .setTitle("🎣 Làm việc ngoài biển")
            .setDescription(
              `${story} và kiếm được **${money(result.amount)}**\nSố dư: **${money(result.balance)}**`
            ),
        ],
      });
    },
  },
];
