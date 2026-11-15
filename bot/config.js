// Mọi con số cân bằng kinh tế nằm ở đây, muốn chỉnh chỉ cần sửa file này.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = {
  currency: { name: "Token Cá", emoji: "🪙" },
  color: 0x35c4dc,

  daily: { amount: 500, cooldownMs: 24 * HOUR },
  work: { min: 50, max: 150, cooldownMs: 30 * MINUTE },
};
