import { MasoiRoom } from "./game/gameManager.js";
import { masoiCommandJson } from "./game/masoiCommand.js";
import { ITEMS, ITEM_BY_ID, TYPE_NAME, findItem, normalize, currentShop, itemEmbed } from "./game/items.js";
export { MasoiRoom };

// NEXUS v0.7 (thêm /pay có thuế) - bản gốc v0.6a - Cloudflare Worker: lệnh Discord + API + dữ liệu D1 (không cần bot chạy 24/7)
const CFG = {
  currency: "Token Cá 🪙",
  color: 0x35c4dc,
  daily: { amount: 500, cooldownMs: 24 * 3600e3 },
  work: { min: 50, max: 150, cooldownMs: 30 * 60e3 },
  // Vượt link: 1 lần/ngày, reset 00:00 giờ Việt Nam (UTC+7)
  pay: { min: 10, max: 1_000_000, taxPercent: 10 }, // thuế bị hủy khỏi nền kinh tế, người nhận chỉ được phần còn lại
  earn: { amount: 2000, minSeconds: 20, maxAgeMs: 30 * 60e3, maxStartsPerDay: 10 },
};

const WORK_STORIES = [
  "Bạn ngồi câu ở bến cảng và kéo lên một con cá thu to",
  "Bạn giúp ngư dân kéo lưới buổi sáng",
  "Bạn bán cá tươi ở chợ nổi",
  "Bạn lặn nhặt san hô và ốc biển ngoài khơi",
  "Bạn sửa thuyền cho một lão ngư",
  "Bạn thả lưới đêm và bắt được cả mẻ cá cơm",
];

const money = n => `${Number(n).toLocaleString("vi-VN")} ${CFG.currency}`;
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const waitText = ts => `<t:${Math.ceil(ts / 1000)}:R>`;
const cleanName = s => String(s || "Người chơi").replace(/[\\*_~`|>@]/g, "").slice(0, 40);

// ---------- Dữ liệu (D1) ----------

let schemaReady;
function ensureSchema(db) {
  schemaReady ??= db
    .batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, avatar TEXT,
        balance INTEGER NOT NULL DEFAULT 0,
        last_daily INTEGER NOT NULL DEFAULT 0,
        last_work INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
        amount INTEGER NOT NULL, type TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions (user_id, created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used INTEGER NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS interaction_receipts (
        interaction_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_interaction_receipts_created ON interaction_receipts (created_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS claims (
        token TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
        created_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS earn_log (
        user_id TEXT NOT NULL, day INTEGER NOT NULL, provider TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE (user_id, day))`),
      db.prepare(`CREATE TABLE IF NOT EXISTS masoi_payouts (
        game_id TEXT NOT NULL, user_id TEXT NOT NULL, amount INTEGER NOT NULL,
        PRIMARY KEY (game_id, user_id))`),
      db.prepare(`CREATE TABLE IF NOT EXISTS inventory (
        user_id TEXT NOT NULL, item_id TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0, durability INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, item_id))`),
    ])
    .catch(err => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

const upsertUser = (db, u) =>
  db
    .prepare(
      `INSERT INTO users (id, name, avatar, balance, created_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar`
    )
    .bind(u.id, u.name, u.avatar, Date.now())
    .run();

async function getBalance(db, id) {
  const row = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(id).first();
  return row ? row.balance : 0;
}

// Nhận thưởng: UPDATE có điều kiện cooldown nên không thể nhận 2 lần dù bấm cùng lúc
async function claim(db, userId, kind, amount, note) {
  const col = kind === "daily" ? "last_daily" : "last_work";
  const cd = kind === "daily" ? CFG.daily.cooldownMs : CFG.work.cooldownMs;
  const now = Date.now();

  const [upd, , bal] = await db.batch([
    db
      .prepare(`UPDATE users SET balance = balance + ?, ${col} = ? WHERE id = ? AND ${col} + ? <= ?`)
      .bind(amount, now, userId, cd, now),
    db
      .prepare(
        "INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() > 0"
      )
      .bind(userId, amount, kind, note, now),
    db.prepare(`SELECT balance, ${col} AS last FROM users WHERE id = ?`).bind(userId),
  ]);

  const row = bal.results[0];
  if (upd.meta.changes === 0) return { ok: false, availableAt: row.last + cd };
  return { ok: true, amount, balance: row.balance };
}

// Chuyển tiền: tất cả trong 1 giao dịch D1, trừ tiền có điều kiện (đủ số dư) nên không thể âm hoặc trùng lặp
async function transfer(db, from, toUser, amount, received) {
  const fromId = from.id;
  const now = Date.now();
  // Đảm bảo người nhận có ví (không ghi đè tên/ảnh nếu đã tồn tại)
  await db
    .prepare("INSERT OR IGNORE INTO users (id, name, avatar, balance, created_at) VALUES (?, ?, ?, 0, ?)")
    .bind(toUser.id, toUser.name, toUser.avatar, now)
    .run();

  const [debit, , , , bal] = await db.batch([
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?").bind(amount, fromId, amount),
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ? AND changes() > 0").bind(received, toUser.id),
    db
      .prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'pay_out', ?, ? WHERE changes() > 0")
      .bind(fromId, -amount, `Chuyển cho ${toUser.name}`, now),
    db
      .prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'pay_in', ?, ? WHERE changes() > 0")
      .bind(toUser.id, received, `Nhận từ ${from.name}`, now),
    db.prepare("SELECT balance FROM users WHERE id = ?").bind(fromId),
  ]);

  const balance = bal.results[0] ? bal.results[0].balance : 0;
  if (debit.meta.changes === 0) return { ok: false, balance };
  return { ok: true, balance };
}

async function topPlayers(db, limit = 10) {
  const { results } = await db
    .prepare(
      "SELECT name, avatar, balance FROM users WHERE balance > 0 ORDER BY balance DESC, created_at ASC LIMIT ?"
    )
    .bind(limit)
    .all();
  return results.map((r, i) => ({ rank: i + 1, name: cleanName(r.name), avatar: r.avatar, balance: r.balance }));
}

async function topLinkers(db, limit = 10) {
  const { results } = await db
    .prepare(
      `SELECT u.name AS name, u.avatar AS avatar, COUNT(*) AS n
       FROM earn_log e JOIN users u ON u.id = e.user_id
       GROUP BY e.user_id ORDER BY n DESC, MAX(e.created_at) ASC LIMIT ?`
    )
    .bind(limit)
    .all();
  return results.map((r, i) => ({ rank: i + 1, name: cleanName(r.name), avatar: r.avatar, count: r.n }));
}

async function getStats(db) {
  const now = Date.now();
  const u = await db.prepare("SELECT COUNT(*) AS players, COALESCE(SUM(balance),0) AS supply FROM users").first();
  const t = await db
    .prepare(
      "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END),0) AS last24h FROM transactions"
    )
    .bind(now - 24 * 3600e3)
    .first();
  const { results } = await db
    .prepare(
      `SELECT t.user_id AS user_id, u.name AS name, t.amount AS amount, t.type AS type, t.created_at AS created_at
       FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 10`
    )
    .all();
  return {
    api: { online: true, tag: "NEXUS Worker" },
    economy: {
      currency: CFG.currency,
      players: u.players,
      supply: u.supply,
      transactions: t.total,
      transactions24h: t.last24h,
    },
    recent: results.map(r => ({ type: r.type, amount: r.amount, user: r.name ? cleanName(r.name) : "…" + r.user_id.slice(-4), at: r.created_at })),
    generatedAt: now,
  };
}

async function getWallet(db, id) {
  const now = Date.now();
  const user = await db.prepare("SELECT balance, last_daily, last_work FROM users WHERE id = ?").bind(id).first();
  const players = (await db.prepare("SELECT COUNT(*) AS n FROM users").first()).n;
  const { results: history } = await db
    .prepare("SELECT type, amount, note, created_at AS at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20")
    .bind(id)
    .all();
  if (!user) return { currency: CFG.currency, balance: 0, rank: null, players, dailyReadyInMs: 0, workReadyInMs: 0, history };
  const pos = (await db.prepare("SELECT COUNT(*) + 1 AS pos FROM users WHERE balance > ?").bind(user.balance).first()).pos;
  return {
    currency: CFG.currency,
    balance: user.balance,
    rank: pos,
    players,
    dailyReadyInMs: Math.max(0, user.last_daily + CFG.daily.cooldownMs - now),
    workReadyInMs: Math.max(0, user.last_work + CFG.work.cooldownMs - now),
    history,
  };
}

// ---------- Cửa hàng & kho đồ ----------

const fmtN = n => Number(n).toLocaleString("vi-VN");
const ITEM_ORDER = Object.fromEntries(ITEMS.map((i, k) => [i.id, k]));

async function getInventory(db, id) {
  const { results } = await db.prepare("SELECT item_id, qty, durability FROM inventory WHERE user_id = ? AND qty > 0").bind(id).all();
  return results
    .map(r => ({ item: ITEM_BY_ID[r.item_id], qty: r.qty, durability: r.durability }))
    .filter(r => r.item)
    .sort((a, b) => ITEM_ORDER[a.item.id] - ITEM_ORDER[b.item.id]);
}

async function shopView(db, userId) {
  const shop = currentShop();
  const ownedRods = new Set((await getInventory(db, userId)).filter(r => r.item.type === "rod").map(r => r.item.id));
  const lines = shop.slots
    .map(({ slot, item }) => `**${slot}.** ${item.icon} ${item.name}: **${fmtN(item.price)}** token${ownedRods.has(item.id) ? "  ✅ *đã có*" : ""}`)
    .join("\n");
  return {
    embeds: [
      {
        title: "🛒 Cửa hàng NEXUS",
        description: lines,
        color: 0xf59e0b,
        fields: [
          { name: "🔄 Làm mới", value: `<t:${shop.refreshAt / 1000}:R>`, inline: true },
          { name: "🛍️ Cách mua", value: "`/shop buy` chọn **slot** (1-4) và **số lượng**", inline: true },
        ],
        footer: { text: "Cửa hàng đổi 4 món ngẫu nhiên mỗi giờ • Xem thông tin đồ bạn có bằng /item view" },
      },
    ],
  };
}

async function shopBuy(db, me, slotNo, qty) {
  const shop = currentShop();
  const slot = shop.slots.find(s => s.slot === slotNo);
  if (!slot) return secret("❌ Hãy chọn số thứ tự từ 1 đến 4 theo `/shop view`.");
  if (!Number.isInteger(qty) || qty < 1 || qty > 10000) return secret("❌ Số lượng phải từ 1 đến 10.000.");
  const item = slot.item;
  const now = Date.now();

  if (item.type === "rod") {
    if (qty !== 1) return secret(`❌ ${item.name} là cần câu nên chỉ mua được **1** cái.`);
    const cost = item.price;
    const res = await db.batch([
      // Chỉ thêm khi đủ tiền và chưa có cần câu này; mọi bước sau chạy tiếp nhờ changes()
      db
        .prepare(
          "INSERT INTO inventory (user_id, item_id, qty, durability) SELECT ?, ?, 1, ? WHERE (SELECT balance FROM users WHERE id = ?) >= ? AND NOT EXISTS (SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ? AND qty > 0)"
        )
        .bind(me.id, item.id, item.durability, me.id, cost, me.id, item.id),
      db.prepare("UPDATE users SET balance = balance - ? WHERE id = ? AND changes() > 0").bind(cost, me.id),
      db
        .prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'shop', ?, ? WHERE changes() > 0")
        .bind(me.id, -cost, `Mua ${item.name}`, now),
    ]);
    if (res[0].meta.changes === 0) {
      const owned = await db.prepare("SELECT 1 AS x FROM inventory WHERE user_id = ? AND item_id = ? AND qty > 0").bind(me.id, item.id).first();
      if (owned) return secret(`❌ Bạn đã có **${item.name}** rồi, không thể mua trùng cần câu.`);
      return secret(`💸 Không đủ Token Cá. **${item.name}** giá **${money(cost)}**, bạn đang có **${money(await getBalance(db, me.id))}**.`);
    }
    return buyDone(db, me, item, 1, cost);
  }

  const cost = item.price * qty;
  const res = await db.batch([
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?").bind(cost, me.id, cost),
    db
      .prepare(
        "INSERT INTO inventory (user_id, item_id, qty, durability) SELECT ?, ?, ?, 0 WHERE changes() > 0 ON CONFLICT (user_id, item_id) DO UPDATE SET qty = qty + excluded.qty"
      )
      .bind(me.id, item.id, qty),
    db
      .prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'shop', ?, ? WHERE changes() > 0")
      .bind(me.id, -cost, `Mua ${qty} ${item.name}`, now),
  ]);
  if (res[0].meta.changes === 0)
    return secret(`💸 Không đủ Token Cá. ${qty} ${item.name} giá **${money(cost)}**, bạn đang có **${money(await getBalance(db, me.id))}**.`);
  return buyDone(db, me, item, qty, cost);
}

async function buyDone(db, me, item, qty, cost) {
  const balance = await getBalance(db, me.id);
  return {
    embeds: [
      {
        title: "✅ Mua thành công",
        description: `**${me.name}** đã mua ${item.icon} **${item.name}**${qty > 1 ? ` ×**${fmtN(qty)}**` : ""}.`,
        color: 0x22c55e,
        fields: [
          { name: "💸 Đã trả", value: money(cost), inline: true },
          { name: "👛 Số dư còn lại", value: money(balance), inline: true },
        ],
        footer: { text: "Xem thông tin vật phẩm bằng /item view" },
      },
    ],
  };
}

async function itemView(db, userId, input) {
  const item = findItem(input);
  if (!item) return secret("❌ Không tìm thấy vật phẩm này. Hãy chọn từ danh sách gợi ý khi gõ `/item view`.");
  const own = (await getInventory(db, userId)).find(r => r.item.id === item.id);
  if (!own) return secret(`❌ Bạn không có **${item.name}**. Chỉ xem được thông tin vật phẩm bạn đang sở hữu.`);
  return { embeds: [itemEmbed(item, own)], flags: 64 };
}

async function itemAutocomplete(db, userId, query) {
  const q = normalize(query);
  const inv = await getInventory(db, userId);
  return inv
    .filter(r => !q || normalize(r.item.name).includes(q))
    .slice(0, 25)
    .map(r => ({ name: `${r.item.icon} ${r.item.name}${r.item.type === "bait" ? ` (x${fmtN(r.qty)})` : ""}`.slice(0, 100), value: r.item.id }));
}

// ---------- Lệnh Discord ----------

const embed = (title, description) => ({ embeds: [{ title, description, color: CFG.color }] });
const secret = content => ({ content, flags: 64 }); // 64 = chỉ người gõ lệnh thấy

async function runCommand(name, body, env) {
  const raw = body.member ? body.member.user : body.user;
  const me = {
    id: raw.id,
    name: cleanName(raw.global_name || raw.username),
    avatar: raw.avatar
      ? `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.${raw.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
      : null,
  };
  const db = env.DB;
  await upsertUser(db, me);

  if (name === "balance") {
    const opt = (body.data.options || []).find(o => o.name === "user");
    const target = opt ? body.data.resolved.users[opt.value] : null;
    const id = target ? target.id : me.id;
    const label = target ? cleanName(target.global_name || target.username) : me.name;
    const inv = await getInventory(db, id);
    const rods = inv.filter(r => r.item.type === "rod");
    const baits = inv.filter(r => r.item.type === "bait");
    return {
      embeds: [
        {
          title: `👛 Ví của ${label}`,
          description: `**${money(await getBalance(db, id))}**`,
          color: CFG.color,
          fields: [
            { name: "🎣 Số cần câu", value: rods.length ? rods.map(r => `• ${r.item.name}`).join("\n") : "Chưa có" },
            { name: "🪱 Số mồi câu", value: baits.length ? baits.map(r => `• ${r.item.name}: **${fmtN(r.qty)}**`).join("\n") : "Chưa có" },
          ],
        },
      ],
    };
  }

  if (name === "daily") {
    const r = await claim(db, me.id, "daily", CFG.daily.amount, "Điểm danh hằng ngày");
    if (!r.ok) return secret(`⏳ Bạn đã điểm danh rồi. Quay lại ${waitText(r.availableAt)} nhé!`);
    return embed("🎁 Điểm danh hằng ngày", `Bạn nhận được **${money(r.amount)}**\nSố dư: **${money(r.balance)}**`);
  }

  if (name === "work") {
    const story = WORK_STORIES[randInt(0, WORK_STORIES.length - 1)];
    const r = await claim(db, me.id, "work", randInt(CFG.work.min, CFG.work.max), story);
    if (!r.ok) return secret(`😮‍💨 Bạn đang nghỉ ngơi. Có thể làm việc lại ${waitText(r.availableAt)}.`);
    return embed("🎣 Làm việc ngoài biển", `${story} và kiếm được **${money(r.amount)}**\nSố dư: **${money(r.balance)}**`);
  }

  if (name === "pay") {
    const opts = body.data.options || [];
    const targetId = (opts.find(o => o.name === "user") || {}).value;
    const amount = Number((opts.find(o => o.name === "amount") || {}).value);
    const raw2 = targetId ? body.data.resolved.users[targetId] : null;

    if (!raw2) return secret("❌ Bạn cần chọn người nhận.");
    if (raw2.bot) return secret("🤖 Bạn không thể chuyển Token Cá cho bot.");
    if (raw2.id === me.id) return secret("🙃 Bạn không thể tự chuyển cho chính mình.");
    if (!Number.isInteger(amount) || amount < CFG.pay.min || amount > CFG.pay.max)
      return secret(`❌ Số tiền phải từ ${money(CFG.pay.min)} đến ${money(CFG.pay.max)}.`);

    const to = {
      id: raw2.id,
      name: cleanName(raw2.global_name || raw2.username),
      avatar: raw2.avatar
        ? `https://cdn.discordapp.com/avatars/${raw2.id}/${raw2.avatar}.${raw2.avatar.startsWith("a_") ? "gif" : "png"}?size=64`
        : null,
    };
    // Thuế làm tròn lên (tối thiểu 1) để không thể chia nhỏ số tiền nhằm né thuế
    const tax = Math.ceil((amount * CFG.pay.taxPercent) / 100);
    const received = amount - tax;
    const r = await transfer(db, me, to, amount, received);
    if (!r.ok) return secret(`💸 Không đủ Token Cá. Số dư của bạn: **${money(r.balance)}**.`);
    return embed(
      "💸 Chuyển Token Cá",
      `**${me.name}** đã chuyển **${money(amount)}** cho **${to.name}**.\n` +
        `Thuế ${CFG.pay.taxPercent}%: **${money(tax)}** — ${to.name} nhận được **${money(received)}**.\n` +
        `Số dư của bạn: **${money(r.balance)}**`
    );
  }

  if (name === "leaderboard") {
    const opt = (body.data.options || []).find(o => o.name === "loai");
    const medal = ["🥇", "🥈", "🥉"];
    const rankLabel = p => medal[p.rank - 1] || "`#" + p.rank + "`";

    if (opt && opt.value === "links") {
      const top = await topLinkers(db, 10);
      if (!top.length) return embed("🏆 Bảng xếp hạng vượt link", "Chưa có ai vượt link. Hãy vào web, mục Kiếm Token Cá để bắt đầu!");
      return embed("🏆 Bảng xếp hạng vượt link", top.map(p => `${rankLabel(p)} **${p.name}** — ${p.count} lần vượt link`).join("\n"));
    }

    const top = await topPlayers(db, 10);
    if (!top.length) return embed("🏆 Bảng xếp hạng Token Cá", "Chưa có ai trên bảng. Hãy gõ `/daily` để bắt đầu!");
    return embed("🏆 Bảng xếp hạng Token Cá", top.map(p => `${rankLabel(p)} **${p.name}** — ${money(p.balance)}`).join("\n"));
  }

  if (name === "shop") {
    const sub = (body.data.options || [])[0];
    if (!sub || sub.name === "view") return await shopView(db, me.id);
    if (sub.name === "buy") {
      const o = sub.options || [];
      const slot = Number((o.find(x => x.name === "slot") || {}).value);
      const qty = Number((o.find(x => x.name === "quantity") || {}).value || 1);
      return await shopBuy(db, me, slot, qty);
    }
  }

  if (name === "item") {
    const sub = (body.data.options || [])[0];
    if (sub && sub.name === "view") {
      const o = (sub.options || []).find(x => x.name === "item");
      return await itemView(db, me.id, o ? o.value : "");
    }
  }

  return secret("Lệnh này chưa được hỗ trợ.");
}

async function handleInteraction(body, env) {
  if (body.type === 1) return { type: 1 }; // PING
  if (body.type === 4) {
    // Gợi ý tự động: chỉ liệt kê vật phẩm người chơi đang có
    try {
      const raw = body.member ? body.member.user : body.user;
      const sub = (body.data.options || [])[0];
      const focused = ((sub && sub.options) || []).find(o => o.focused);
      if (body.data.name === "item" && focused) return { type: 8, data: { choices: await itemAutocomplete(env.DB, raw.id, focused.value) } };
    } catch (err) {
      console.error("Lỗi gợi ý:", err);
    }
    return { type: 8, data: { choices: [] } };
  }
  if (body.type === 2) {
    try {
      if (body.data?.name === masoiCommandJson.name) {
        if (!env.MASOI_ROOMS || !env.DISCORD_BOT_TOKEN) return { type: 4, data: secret("Ma Sói chưa được cấu hình Durable Object hoặc DISCORD_BOT_TOKEN.") };
        const guildId = body.guild_id;
        if (!guildId) return { type: 4, data: secret("Lệnh /masoi chỉ dùng được trong server, không dùng trong DM.") };
        const stub = env.MASOI_ROOMS.get(env.MASOI_ROOMS.idFromName(guildId));
        const response = await stub.fetch("https://masoi.internal/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guildId, channelId: body.channel_id, hostId: body.member?.user?.id || body.user?.id,
            hostName: body.member?.user?.global_name || body.member?.user?.username || body.user?.username,
            applicationId: body.application_id, interactionToken: body.token }),
        });
        const result = await response.json();
        if (!result.ok) return { type: 4, data: secret(result.error === "already_exists" ? "❌ Server này đã có một phòng Ma Sói đang chờ hoặc đang chơi." : "❌ Không thể tạo phòng Ma Sói lúc này.") };
        return { type: 4, data: result.response };
      }
      return { type: 4, data: await runCommand(body.data.name, body, env) };
    } catch (err) {
      console.error("Lỗi lệnh:", err);
      return { type: 4, data: secret("Có lỗi xảy ra, bạn thử lại sau nhé.") };
    }
  }
  if (body.type === 3) {
    const customId = String(body.data?.custom_id || "");
    const guildId = body.guild_id || customId.split(":")[1];
    if (!guildId || !env.MASOI_ROOMS) return { type: 4, data: secret("Phòng Ma Sói không còn khả dụng.") };
    return { type: 6 }; // DEFERRED_UPDATE_MESSAGE; xử lý trạng thái trong DO sau ACK
  }
  return { type: 4, data: secret("Không hỗ trợ loại tương tác này.") };
}

// Discord ký mọi yêu cầu bằng Ed25519. Kiểm tra cả chữ ký lẫn timestamp để chặn replay cũ.
const hex = h => Uint8Array.from(h.match(/../g) || [], b => parseInt(b, 16));

async function verifySignature(request, rawBody, publicKey) {
  const sig = request.headers.get("x-signature-ed25519") || "";
  const ts = request.headers.get("x-signature-timestamp") || "";
  if (!/^[0-9a-f]{128}$/i.test(sig) || !/^[0-9a-f]{64}$/i.test(publicKey || "") || !/^\d{10,13}$/.test(ts)) return false;
  const timestampMs = Number(ts) * (ts.length <= 10 ? 1000 : 1);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
    const data = new TextEncoder().encode(ts + rawBody);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hex(sig), data);
  } catch {
    return false;
  }
}

// ---------- Đăng nhập Discord bằng Authorization Code + PKCE ----------

const SESSION_TTL_MS = 7 * 24 * 3600e3;
const DEFAULT_SITE_URL = "https://not5t.github.io/nexus/";
const redirectUri = env => env.OAUTH_REDIRECT_URI || DEFAULT_SITE_URL;
const sha256Hex = async value => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
};

async function exchangeOAuthCode(env, body) {
  const code = String(body.code || "");
  const verifier = String(body.codeVerifier || "");
  const requestedRedirect = String(body.redirectUri || "");
  if (!code || code.length > 2048 || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    return { status: 400, error: "invalid_oauth_request" };
  if (!env.CLIENT_ID || !env.DISCORD_CLIENT_SECRET)
    return { status: 503, error: "oauth_not_configured" };
  const expectedRedirect = redirectUri(env);
  if (requestedRedirect !== expectedRedirect) return { status: 400, error: "redirect_uri_mismatch" };

  try {
    const form = new URLSearchParams({
      client_id: env.CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: expectedRedirect,
      code_verifier: verifier,
    });
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) return { status: 401, error: "oauth_code_invalid" };
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return { status: 502, error: "oauth_exchange_failed" };

    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!userRes.ok) return { status: 502, error: "discord_profile_failed" };
    const user = await userRes.json();
    if (!user.id) return { status: 401, error: "discord_identity_missing" };

    const name = cleanName(user.global_name || user.username);
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;
    const sessionToken = randomHex(32);
    const tokenHash = await sha256Hex(sessionToken);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
      env.DB.prepare("INSERT INTO sessions (token_hash, user_id, name, avatar, created_at, expires_at, last_used) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(tokenHash, user.id, name, avatar, now, expiresAt, now),
    ]);
    return { status: 200, sessionToken, expiresAt, user: { id: user.id, name, avatar } };
  } catch (err) {
    console.error("OAuth exchange error:", err.message);
    return { status: 502, error: "oauth_exchange_failed" };
  }
}

async function authenticate(request, env) {
  const m = /^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get("authorization") || "");
  if (!m) return { status: 401, error: "missing_session" };
  const tokenHash = await sha256Hex(m[1]);
  const now = Date.now();
  const session = await env.DB.prepare(
    "SELECT user_id, name, avatar, expires_at FROM sessions WHERE token_hash = ?"
  ).bind(tokenHash).first();
  if (!session) return { status: 401, error: "invalid_session" };
  if (session.expires_at <= now) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return { status: 401, error: "expired_session" };
  }
  await env.DB.prepare("UPDATE sessions SET last_used = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return { status: 200, userId: session.user_id, name: session.name, avatar: session.avatar, tokenHash };
}

// ---------- Kiếm Token Cá bằng vượt link ----------

const VN_OFFSET = 7 * 3600e3;
const DAY = 86400e3;
const dayKey = (t = Date.now()) => Math.floor((t + VN_OFFSET) / DAY);
const resetInMs = (t = Date.now()) => (dayKey(t) + 1) * DAY - VN_OFFSET - t;
const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
const siteUrl = env => (env.SITE_URL || "https://not5t.github.io/nexus").replace(/\/+$/, "");

const claimedToday = async (db, id) =>
  !!(await db.prepare("SELECT 1 AS x FROM earn_log WHERE user_id = ? AND day = ?").bind(id, dayKey()).first());

const PROVIDERS = {
  linkvertise: {
    ready: env => !!env.LINKVERTISE_USER_ID && !!env.LINKVERTISE_ANTIBYPASS_TOKEN,
    async shorten(env, dest) {
      const r = encodeURIComponent(btoa(dest));
      return `https://link-to.net/${env.LINKVERTISE_USER_ID}/${Math.floor(Math.random() * 1000)}/dynamic?r=${r}`;
    },
    // Bắt buộc xác minh anti-bypass trước khi cấp Token Cá.
    async verify(env, hash) {
      if (!env.LINKVERTISE_ANTIBYPASS_TOKEN || !hash) return false;
      const base = env.LINKVERTISE_VERIFY_URL || "https://publisher.linkvertise.com/api/v1/anti_bypassing";
      const res = await fetch(
        `${base}?token=${encodeURIComponent(env.LINKVERTISE_ANTIBYPASS_TOKEN)}&hash=${encodeURIComponent(hash)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      return res.ok && /true/i.test((await res.text()).trim());
    },
  },
  link4m: {
    // Khôi phục cơ chế Link4m cũ: yêu cầu URL API có placeholder {url}.
    // LƯU Ý: Link4m cũ không xác minh callback hoàn thành từ nhà cung cấp.
    // Nó chỉ dựa vào token một lần, thời gian chờ tối thiểu và giới hạn 1 lượt/ngày.
    ready: env => !!env.LINK4M_API_URL && env.LINK4M_API_URL.includes("{url}"),
    async shorten(env, dest) {
      const res = await fetch(env.LINK4M_API_URL.replace("{url}", encodeURIComponent(dest)), {
        signal: AbortSignal.timeout(8000),
      });
      const text = (await res.text()).trim();
      let found = /^https?:\/\//.test(text) ? text : null;
      if (!found) {
        try {
          const j = JSON.parse(text);
          for (const k of ["shortenedUrl", "shortened_url", "short_url", "shortUrl", "url", "link"]) {
            if (typeof j[k] === "string" && /^https?:\/\//.test(j[k])) { found = j[k]; break; }
          }
        } catch {}
      }
      if (!found) throw new Error("Link4m trả về định dạng lạ: " + text.slice(0, 120));
      return found;
    },
    async verify() { return true; }, // tương thích cơ chế Link4m cũ; không phải xác minh nhà cung cấp
  },
};

async function earnStatus(env, auth) {
  return {
    amount: CFG.earn.amount,
    claimedToday: await claimedToday(env.DB, auth.userId),
    resetInMs: resetInMs(),
    providers: { linkvertise: PROVIDERS.linkvertise.ready(env), link4m: PROVIDERS.link4m.ready(env) },
  };
}

async function earnStart(env, auth, provider) {
  const p = PROVIDERS[provider];
  if (!p || !p.ready(env)) return { status: 400, error: "provider_unavailable" };
  const db = env.DB, now = Date.now();

  if (await claimedToday(db, auth.userId)) return { status: 409, error: "already_claimed_today", resetInMs: resetInMs() };
  const starts = await db.prepare("SELECT COUNT(*) AS n FROM claims WHERE user_id = ? AND created_at >= ?").bind(auth.userId, now - DAY).first();
  if (starts.n >= CFG.earn.maxStartsPerDay) return { status: 429, error: "too_many_starts" };

  await db.prepare("DELETE FROM claims WHERE created_at < ?").bind(now - 2 * DAY).run();
  const token = randomHex(24); // mã dùng 1 lần, gắn với đúng tài khoản Discord này
  await db.prepare("INSERT INTO claims (token, user_id, provider, created_at) VALUES (?, ?, ?, ?)").bind(token, auth.userId, provider, now).run();

  try {
    return { status: 200, url: await p.shorten(env, `${siteUrl(env)}/nhan.html?t=${token}`) };
  } catch (err) {
    console.error("Không tạo được link:", err.message);
    return { status: 502, error: "shorten_failed" };
  }
}

async function sendDm(env, userId, embed) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
  try {
    const ch = await fetch("https://discord.com/api/v10/users/@me/channels", { method: "POST", headers, body: JSON.stringify({ recipient_id: userId }) });
    if (!ch.ok) return; // người dùng chặn tin nhắn riêng thì bỏ qua
    const { id } = await ch.json();
    await fetch(`https://discord.com/api/v10/channels/${id}/messages`, { method: "POST", headers, body: JSON.stringify({ embeds: [embed] }) });
  } catch (err) {
    console.error("Không gửi được DM:", err.message);
  }
}

async function earnClaim(env, ctx, auth, token, hash) {
  const db = env.DB, now = Date.now();
  if (!/^[0-9a-f]{48}$/.test(token || "")) return { status: 400, error: "bad_token" };

  const c = await db.prepare("SELECT user_id, provider, created_at, used FROM claims WHERE token = ?").bind(token).first();
  if (!c) return { status: 404, error: "not_found" };
  if (c.user_id !== auth.userId) return { status: 403, error: "not_yours" };
  if (c.used) return { status: 409, error: "used" };

  const age = now - c.created_at;
  if (age > CFG.earn.maxAgeMs) return { status: 410, error: "expired" };
  if (age < CFG.earn.minSeconds * 1000) return { status: 425, error: "too_fast" };
  const provider = PROVIDERS[c.provider];
  if (!provider || !(await provider.verify(env, hash))) return { status: 403, error: "verify_failed" };

  await upsertUser(db, { id: auth.userId, name: auth.name, avatar: auth.avatar });
  const amount = CFG.earn.amount;
  // Tất cả trong 1 giao dịch: đánh dấu dùng mã -> ghi nhật ký (1 lần/ngày) -> cộng tiền -> ghi lịch sử
  const [used, logged, , , bal] = await db.batch([
    db.prepare("UPDATE claims SET used = 1 WHERE token = ? AND used = 0").bind(token),
    db.prepare("INSERT OR IGNORE INTO earn_log (user_id, day, provider, created_at) SELECT ?, ?, ?, ? WHERE changes() > 0").bind(auth.userId, dayKey(), c.provider, now),
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ? AND changes() > 0").bind(amount, auth.userId),
    db.prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'link', ?, ? WHERE changes() > 0").bind(auth.userId, amount, "Vượt link nhận thưởng", now),
    db.prepare("SELECT balance FROM users WHERE id = ?").bind(auth.userId),
  ]);

  if (used.meta.changes === 0) return { status: 409, error: "used" };
  if (logged.meta.changes === 0) return { status: 409, error: "already_claimed_today", resetInMs: resetInMs() };

  const balance = bal.results[0].balance;
  ctx.waitUntil(
    sendDm(env, auth.userId, {
      title: "💌 Cảm ơn bạn đã vượt link!",
      description: `Bạn vừa nhận **${money(amount)}**.\nSố dư hiện tại: **${money(balance)}**.\n\nCảm ơn bạn đã dành thời gian ủng hộ NEXUS ❤️ Hẹn gặp lại bạn vào ngày mai (sau 00:00)!`,
      color: CFG.color,
    })
  );
  return { status: 200, ok: true, amount, balance };
}

// ---------- Router ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGIN || "https://not5t.github.io";
    const cors =
      request.headers.get("origin") === allowed
        ? {
            "Access-Control-Allow-Origin": allowed,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "600",
          }
        : {};
    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin", ...cors },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === "POST" && url.pathname === "/interactions") {
        const raw = await request.text();
        if (!(await verifySignature(request, raw, env.DISCORD_PUBLIC_KEY))) {
          return new Response("invalid request signature", { status: 401 });
        }
        const body = JSON.parse(raw);
        if (body.type !== 1) {
          await ensureSchema(env.DB);
          if (body.id) {
            const now = Date.now();
            const receipt = await env.DB.prepare(
              "INSERT OR IGNORE INTO interaction_receipts (interaction_id, created_at) VALUES (?, ?)"
            ).bind(String(body.id), now).run();
            if (receipt.meta.changes === 0) {
              return reply(200, { type: 4, data: secret("Yêu cầu này đã được xử lý rồi.") });
            }
            await env.DB.prepare("DELETE FROM interaction_receipts WHERE created_at < ?").bind(now - DAY).run();
          }
        }
        const callback = await handleInteraction(body, env);
        if (body.type === 2 && body.data?.name === masoiCommandJson.name && callback.type === 4 && callback.data?.components) {
          const guildId = body.guild_id;
          const stub = env.MASOI_ROOMS.get(env.MASOI_ROOMS.idFromName(guildId));
          ctx.waitUntil((async () => {
            try {
              const msg = await fetch(`https://discord.com/api/v10/webhooks/${body.application_id}/${body.token}/messages/@original`);
              if (msg.ok) { const data = await msg.json(); await stub.fetch("https://masoi.internal/bind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: data.id }) }); }
            } catch (e) { console.error("Không bind được tin nhắn lobby:", e); }
          })());
        }
        if (body.type === 3) {
          const customId = String(body.data?.custom_id || "");
          const guildId = body.guild_id || customId.split(":")[1];
          if (guildId && env.MASOI_ROOMS) {
            const stub = env.MASOI_ROOMS.get(env.MASOI_ROOMS.idFromName(guildId));
            ctx.waitUntil((async () => {
              try {
                const r = await stub.fetch("https://masoi.internal/interaction", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
                const out = await r.json();
                if (out.message) await fetch(`https://discord.com/api/v10/webhooks/${body.application_id}/${body.token}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: out.message, flags: 64 }) });
              } catch (e) { console.error("Lỗi component Ma Sói:", e); }
            })());
          }
        }
        return reply(200, callback);
      }

      if (request.method === "POST" && url.pathname === "/api/auth/exchange") {
        await ensureSchema(env.DB);
        let body = {};
        try { body = await request.json(); } catch {}
        const out = await exchangeOAuthCode(env, body);
        const { status, ...rest } = out;
        return reply(status, rest);
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        await ensureSchema(env.DB);
        const auth = await authenticate(request, env);
        if (auth.status !== 200) return reply(auth.status, { error: auth.error });
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(auth.tokenHash).run();
        return reply(200, { ok: true });
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/earn/")) {
        await ensureSchema(env.DB);
        const auth = await authenticate(request, env);
        if (auth.status !== 200) return reply(auth.status, { error: auth.error });
        let body = {};
        try { body = await request.json(); } catch {}
        const out =
          url.pathname === "/api/earn/start" ? await earnStart(env, auth, String(body.provider || "")) :
          url.pathname === "/api/earn/claim" ? await earnClaim(env, ctx, auth, String(body.token || ""), body.hash ? String(body.hash) : "") :
          { status: 404, error: "Not found" };
        const { status, ...rest } = out;
        return reply(status, rest);
      }

      if (request.method === "GET") {
        if (url.pathname === "/api/health") return reply(200, { ok: true });
        await ensureSchema(env.DB);

        if (url.pathname === "/api/stats") return reply(200, await getStats(env.DB));

        if (url.pathname === "/api/shop") {
          const shop = currentShop();
          return reply(200, {
            now: Date.now(),
            refreshAt: shop.refreshAt,
            items: shop.slots.map(({ slot, item }) => ({ slot, id: item.id, type: item.type, typeName: TYPE_NAME[item.type], icon: item.icon, name: item.name, price: item.price })),
          });
        }

        if (url.pathname === "/api/leaderboard") {
          if (url.searchParams.get("type") === "links") {
            return reply(200, { type: "links", top: await topLinkers(env.DB, 10) });
          }
          return reply(200, { type: "tokens", currency: CFG.currency, top: await topPlayers(env.DB, 10) });
        }

        if (url.pathname === "/api/earn/status") {
          const auth = await authenticate(request, env);
          if (auth.status !== 200) return reply(auth.status, { error: auth.error });
          return reply(200, await earnStatus(env, auth));
        }

        if (url.pathname === "/api/me") {
          const auth = await authenticate(request, env);
          if (auth.status !== 200) return reply(auth.status, { error: auth.error });
          return reply(200, await getWallet(env.DB, auth.userId));
        }
      }

      return reply(404, { error: "Not found" });
    } catch (err) {
      console.error("Lỗi:", err);
      return reply(500, { error: "Server error" });
    }
  },
};
