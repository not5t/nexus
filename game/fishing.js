// NEXUS - Hệ thống câu cá: /hoca /tuica /bosuutap /banca /cauca
// Mọi hàm nhận `db` (D1) và trả về dữ liệu phản hồi cho Discord. Không phụ thuộc vào worker.js.

import { ITEM_BY_ID, RARITY, findItem, normalize } from "./items.js";
import {
  FISH_CFG, SHOW_ORDER, SPECIES, SPECIES_BY_ID, TENTACLE,
  baitCandidates, currentPond, fishValue, fmtKg, fmtNum, priceLabel, rollCast, speciesIcon, speciesName,
} from "./fish.js";

// ---------- Bảng dữ liệu (nối vào ensureSchema) ----------
export const FISH_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fish_bag (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, species TEXT NOT NULL,
    part TEXT NOT NULL DEFAULT '', weight_g INTEGER NOT NULL DEFAULT 0,
    mult REAL NOT NULL DEFAULT 1, caught_at INTEGER NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS idx_fish_bag_user ON fish_bag (user_id, id)",
  // Bộ sưu tập tách riêng khỏi túi cá: bán cá chỉ xóa khỏi fish_bag, không bao giờ đụng vào bảng này
  `CREATE TABLE IF NOT EXISTS collection (
    user_id TEXT NOT NULL, species TEXT NOT NULL,
    catches INTEGER NOT NULL DEFAULT 0, record_g INTEGER NOT NULL DEFAULT 0, first_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, species))`,
  "CREATE TABLE IF NOT EXISTS fish_state (user_id TEXT PRIMARY KEY, last_cast INTEGER NOT NULL DEFAULT 0)",
];

// ---------- Giao diện ----------
const TOKEN = "Token Cá 🪙";
const tok = n => `${fmtNum(n, 0)} ${TOKEN}`;
const secret = content => ({ content, flags: 64 });
const TW = cp => ({ url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png` });
const RARITY_COLOR = { common: 0x9ca3af, uncommon: 0x22c55e, rare: 0x3b82f6, epic: 0xa855f7, legendary: 0xf59e0b, mythic: 0xef4444, secret: 0x14b8a6, trash: 0x6b7280 };
const bar = (n, max, len = 10) => {
  const f = Math.max(0, Math.min(len, Math.round((n / (max || 1)) * len)));
  return "▰".repeat(f) + "▱".repeat(len - f);
};
const eta = ms => `<t:${Math.ceil(ms / 1000)}:R>`;

function card(title, description, { color = 0x35c4dc, fields, footer, thumb, flags } = {}) {
  const embed = {
    author: { name: "NEXUS • Câu cá" },
    title,
    description,
    color,
    footer: { text: footer || "NEXUS • Câu cá" },
    timestamp: new Date().toISOString(),
  };
  if (fields) embed.fields = fields;
  if (thumb) embed.thumbnail = TW(thumb);
  return flags ? { embeds: [embed], flags } : { embeds: [embed] };
}

const rarityLine = r => `${RARITY[r].e} ${RARITY[r].n}`;

// ---------- Truy vấn dùng chung ----------
const bagOf = async (db, uid) =>
  (await db.prepare("SELECT id, species, part, weight_g, mult, caught_at FROM fish_bag WHERE user_id = ? ORDER BY id").bind(uid).all()).results;
const valueOf = f => fishValue(f.species, f.weight_g, f.mult, f.part);
const fishLabel = f => `${speciesIcon(f.species, f.part)} ${speciesName(f.species, f.part)}`;
const fishWeight = f => (f.part === "tentacle" ? "—" : fmtKg(f.weight_g));

// ---------- /hoca ----------
export function hoca(guildId) {
  const pond = currentPond(guildId);
  const fields = [];
  for (const r of SHOW_ORDER) {
    const list = pond.species.filter(s => s.rarity === r);
    if (list.length) fields.push({ name: rarityLine(r), value: list.map(s => `${s.icon} ${s.name}`).join("  •  ") });
  }
  fields.push({ name: "⏳ Làm mới", value: eta(pond.refreshAt), inline: true }, { name: "🐟 Số loài", value: `**${pond.species.length}**`, inline: true });
  return card("🌊 Hồ Cá", "Các sinh vật đang xuất hiện trong hồ. Danh sách **dùng chung cho cả server** và giữ nguyên trong 20 phút.", {
    color: 0x0ea5e9,
    thumb: "1f30a",
    fields,
    footer: "Cá Secret không hiện ở đây nhưng vẫn có thể bắt được • Mồi quyết định bạn chạm trán nhóm nào",
  });
}

// ---------- /tuica ----------
export async function tuica(db, me) {
  const bag = await bagOf(db, me.id);
  const total = bag.reduce((a, f) => a + f.weight_g, 0);
  const lines = bag.length
    ? bag.map((f, i) => `\`${String(i + 1).padStart(2, "0")}\` ${RARITY[SPECIES_BY_ID[f.species].rarity].e} ${fishLabel(f)} — **${fishWeight(f)}**`).join("\n")
    : "*Túi cá đang trống. Hãy dùng `/cauca` để bắt đầu!*";
  return card(`🎒 Túi Cá – ${me.name}`, `${bar(bag.length, FISH_CFG.bagMax)}  **${bag.length}/${FISH_CFG.bagMax}**\nTổng trọng lượng **${fmtKg(total)}**`, {
    color: bag.length >= FISH_CFG.bagMax ? 0xef4444 : 0x22c55e,
    thumb: "1f392",
    fields: [{ name: "Số cá đang giữ", value: lines }],
    footer: bag.length >= FISH_CFG.bagMax ? "Túi đã đầy! Dùng /banca để bán bớt cá" : "Bán cá bằng /banca • Túi tối đa 10 ô",
  });
}

// ---------- /bosuutap ----------
async function collectionOf(db, uid) {
  const { results } = await db.prepare("SELECT species, catches, record_g, first_at FROM collection WHERE user_id = ?").bind(uid).all();
  return Object.fromEntries(results.map(r => [r.species, r]));
}

export async function bosuutap(db, me, loai, doHiem) {
  const col = await collectionOf(db, me.id);
  if (loai) {
    const s = findSpecies(loai);
    if (!s) return secret("❌ Không tìm thấy sinh vật này.");
    const c = col[s.id];
    if (!c) {
      return card("❓ ???", "Bạn chưa khám phá sinh vật này.\n\n⬛ **???**", {
        color: 0x374151,
        thumb: "2753",
        fields: [{ name: "Thông tin", value: "Hãy câu được nó để mở khóa." }],
        footer: "Bộ sưu tập chỉ ghi nhận sinh vật bạn đã bắt được",
        flags: 64,
      });
    }
    const fields = [
      { name: "🏷️ Độ hiếm", value: rarityLine(s.rarity), inline: true },
      { name: "🎣 Số lần bắt", value: `**${fmtNum(c.catches, 0)}**`, inline: true },
      { name: "💰 Giá cơ bản", value: priceLabel(s), inline: true },
    ];
    fields.push(
      { name: "🏆 Cân nặng kỷ lục", value: c.record_g ? fmtKg(c.record_g) : "—", inline: true },
      { name: "⚖️ Cân nặng tối đa", value: fmtKg(Math.round(s.maxKg * 1000)), inline: true },
      { name: "✨ Biến thể đặc biệt", value: "Chưa có", inline: true }
    );
    if (s.trait) fields.push({ name: `🧬 Đặc tính – ${s.trait.name}`, value: s.trait.desc });
    return card(`${s.name} ${s.icon}`, "✅ **Đã khám phá**", { color: RARITY_COLOR[s.rarity], fields, footer: `Bộ sưu tập — ${me.name}`, flags: 64 });
  }

  if (doHiem) {
    const list = SPECIES.filter(s => s.rarity === doHiem);
    const found = list.filter(s => col[s.id]).length;
    const lines = list
      .map(s => {
        const c = col[s.id];
        return c ? `${s.icon} **${s.name}** — bắt ${fmtNum(c.catches, 0)} lần${c.record_g ? ` • kỷ lục ${fmtKg(c.record_g)}` : ""}` : "⬛ **???**";
      })
      .join("\n");
    return card(`📖 ${RARITY[doHiem].n} — ${found}/${list.length}`, `${bar(found, list.length)}  **${found}/${list.length}**\n\n${lines}`, {
      color: RARITY_COLOR[doHiem],
      thumb: "1f4d6",
      footer: `Bộ sưu tập — ${me.name}`,
    });
  }

  const total = SPECIES.length;
  const found = SPECIES.filter(s => col[s.id]).length;
  const pct = Math.floor((found / total) * 100);
  const rows = SHOW_ORDER.map(r => {
    const list = SPECIES.filter(s => s.rarity === r);
    const n = list.filter(s => col[s.id]).length;
    return `${RARITY[r].e} **${RARITY[r].n}** — ${n}/${list.length}${n === list.length ? " ✅" : ""}`;
  }).join("\n");
  return card(`📖 Bộ Sưu Tập — ${me.name}`, `**${found} / ${total}** Hoàn thành **${pct}%**\n${bar(found, total, 12)}\nĐã khám phá **${found}** trên tổng số **${total}** sinh vật`, {
    color: 0x6366f1,
    thumb: "1f4d6",
    fields: [{ name: "Các cấp độ khám phá", value: rows }],
    footer: "Chọn một loài trong /bosuutap để xem chi tiết • Bán cá không làm mất thành tích",
  });
}

function findSpecies(input) {
  const q = String(input || "").trim();
  if (SPECIES_BY_ID[q]) return SPECIES_BY_ID[q];
  const n = normalize(q);
  return SPECIES.find(s => normalize(s.name) === n) || null;
}

// ---------- /banca ----------
export async function banca(db, me) {
  const bag = await bagOf(db, me.id);
  if (!bag.length) return secret("🎒 Túi cá của bạn đang trống, chưa có gì để bán.");
  const total = bag.reduce((a, f) => a + valueOf(f), 0);
  const lines = bag.map((f, i) => `\`${String(i + 1).padStart(2, "0")}\` ${fishLabel(f)} — ${fishWeight(f)} • **${fmtNum(valueOf(f), 0)}** 🪙`).join("\n");
  const options = bag.map(f => ({ label: `${fishLabel(f)} — ${fishWeight(f)}`.slice(0, 100), description: `≈ ${fmtNum(valueOf(f), 0)} Token`, value: String(f.id) }));
  return {
    ...card("💰 Bán Cá", `Chọn **một con** để bán, hoặc bán **toàn bộ** túi.\n\n${lines}`, {
      color: 0xf59e0b,
      thumb: "1f4b0",
      fields: [{ name: "Tổng giá trị cả túi", value: tok(total), inline: true }, { name: "🎒 Túi cá", value: `**${bag.length}/${FISH_CFG.bagMax}**`, inline: true }],
      footer: "Mỗi con được tính tiền riêng theo cân nặng • Cần xác nhận trước khi bán",
    }),
    flags: 64,
    components: [
      { type: 1, components: [{ type: 3, custom_id: `fs:pick:${me.id}`, placeholder: "Chọn con cá muốn bán", options }] },
      { type: 1, components: [{ type: 2, style: 4, label: "Bán toàn bộ", emoji: { name: "💰" }, custom_id: `fs:all:${me.id}` }] },
    ],
  };
}

const confirmButtons = (okId, uid) => [
  { type: 1, components: [{ type: 2, style: 3, label: "Xác nhận bán", emoji: { name: "✅" }, custom_id: okId }, { type: 2, style: 2, label: "Hủy", custom_id: `fs:no:${uid}` }] },
];

function sellOne(f, bagCount) {
  const s = SPECIES_BY_ID[f.species];
  const value = valueOf(f);
  const fields =
    f.part === "tentacle"
      ? [{ name: "Chi tiết", value: `Giá cố định ${fmtNum(30, 0)} Token/cái`, inline: true }]
      : [
          { name: "Giá cơ bản", value: priceLabel(s) + (f.mult !== 1 ? ` (×${fmtNum(f.mult)})` : ""), inline: true },
          { name: "Cân nặng", value: fmtKg(f.weight_g), inline: true },
        ];
  fields.push({ name: "Tổng tiền nhận", value: `**${tok(value)}**` }, { name: "Sau giao dịch", value: `Túi cá: **${bagCount - 1}/${FISH_CFG.bagMax}**` });
  return card("⚠️ XÁC NHẬN BÁN CÁ", `**${speciesName(f.species, f.part)} ${speciesIcon(f.species, f.part)}**\n${fishWeight(f)}`, {
    color: RARITY_COLOR[s.rarity],
    thumb: "26a0",
    fields,
    footer: "Cá sẽ bị xóa khỏi túi, thành tích trong /bosuutap vẫn được giữ",
  });
}

// Bán một hoặc nhiều con: xóa cá, cộng tiền, ghi lịch sử trong cùng một giao dịch. Mỗi con chỉ bán được đúng 1 lần.
async function settleSale(db, uid, fishList) {
  const now = Date.now();
  const stmts = [];
  for (const f of fishList) {
    const v = valueOf(f);
    stmts.push(
      db.prepare("DELETE FROM fish_bag WHERE id = ? AND user_id = ?").bind(f.id, uid),
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ? AND changes() > 0").bind(v, uid),
      db
        .prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'fish_sell', ?, ? WHERE changes() > 0")
        .bind(uid, v, `Bán ${speciesName(f.species, f.part)}${f.part === "tentacle" ? "" : ` ${fmtKg(f.weight_g)}`}`, now)
    );
  }
  const res = await db.batch(stmts);
  const sold = [];
  fishList.forEach((f, i) => {
    if (res[i * 3].meta.changes === 1) sold.push(f);
  });
  return { sold, total: sold.reduce((a, f) => a + valueOf(f), 0) };
}

export async function fishComponent(db, body, me) {
  const [, act, uid, a, b] = String(body.data.custom_id).split(":");
  const upd = data => ({ type: 7, data });
  if (uid !== me.id) return { type: 4, data: secret("❌ Đây không phải bảng bán cá của bạn.") };

  if (act === "no") return upd({ ...card("❎ Đã hủy", "Chưa có con cá nào bị bán. Gõ `/banca` để mở lại.", { color: 0x64748b }), components: [] });

  const bag = await bagOf(db, me.id);

  if (act === "pick") {
    const f = bag.find(x => String(x.id) === String(body.data.values && body.data.values[0]));
    if (!f) return upd({ ...card("❌ Không còn trong túi", "Con cá này đã không còn trong túi (có thể đã bán rồi). Gõ `/banca` để mở lại.", { color: 0xef4444 }), components: [] });
    return upd({ ...sellOne(f, bag.length), components: confirmButtons(`fs:one:${me.id}:${f.id}`, me.id) });
  }

  if (act === "all") {
    if (!bag.length) return upd({ ...card("🎒 Túi trống", "Không còn gì để bán.", { color: 0x64748b }), components: [] });
    const total = bag.reduce((x, f) => x + valueOf(f), 0);
    const counts = {};
    for (const f of bag) counts[SPECIES_BY_ID[f.species].rarity] = (counts[SPECIES_BY_ID[f.species].rarity] || 0) + 1;
    const rar = SHOW_ORDER.filter(r => counts[r]).map(r => `${rarityLine(r)}: **${counts[r]}**`).join("\n");
    return upd({
      ...card("⚠️ XÁC NHẬN BÁN TOÀN BỘ", `Bạn sắp bán **${bag.length} con** trong túi.`, {
        color: 0xef4444,
        thumb: "26a0",
        fields: [
          { name: "Theo độ hiếm", value: rar },
          { name: "Tổng tiền nhận", value: `**${tok(total)}**`, inline: true },
          { name: "Sau giao dịch", value: `Túi cá: **0/${FISH_CFG.bagMax}**`, inline: true },
        ],
        footer: "Hành động này không thể hoàn tác • Thành tích /bosuutap vẫn được giữ",
      }),
      components: confirmButtons(`fs:allok:${me.id}:${bag.length}:${total}`, me.id),
    });
  }

  if (act === "one") {
    const f = bag.find(x => String(x.id) === String(a));
    if (!f) return upd({ ...card("❌ Không bán được", "Con cá này không còn trong túi (có thể đã bán rồi), bạn không bị trừ hay cộng gì.", { color: 0xef4444 }), components: [] });
    const r = await settleSale(db, me.id, [f]);
    if (!r.sold.length) return upd({ ...card("❌ Không bán được", "Con cá này đã được bán trước đó.", { color: 0xef4444 }), components: [] });
    const bal = (await db.prepare("SELECT balance FROM users WHERE id = ?").bind(me.id).first()).balance;
    return upd({
      ...card("✅ Bán thành công", `Đã bán **${speciesName(f.species, f.part)} ${speciesIcon(f.species, f.part)}** (${fishWeight(f)}).`, {
        color: 0x22c55e,
        thumb: "1f4b0",
        fields: [
          { name: "💰 Nhận được", value: tok(r.total), inline: true },
          { name: "👛 Số dư", value: tok(bal), inline: true },
          { name: "🎒 Túi cá", value: `**${bag.length - 1}/${FISH_CFG.bagMax}**`, inline: true },
        ],
      }),
      components: [],
    });
  }

  if (act === "allok") {
    const total = bag.reduce((x, f) => x + valueOf(f), 0);
    // Túi đã thay đổi so với lúc xem xác nhận (vừa câu thêm / bán bớt): không bán để tránh bán nhầm
    if (bag.length !== Number(a) || total !== Number(b)) {
      return upd({ ...card("⚠️ Túi cá đã thay đổi", "Nội dung túi khác với lúc bạn xác nhận. Gõ `/banca` để xem lại trước khi bán.", { color: 0xf59e0b }), components: [] });
    }
    const r = await settleSale(db, me.id, bag);
    const bal = (await db.prepare("SELECT balance FROM users WHERE id = ?").bind(me.id).first()).balance;
    return upd({
      ...card("✅ Đã bán toàn bộ", `Đã bán **${r.sold.length}** con cá.`, {
        color: 0x22c55e,
        thumb: "1f4b0",
        fields: [
          { name: "💰 Nhận được", value: tok(r.total), inline: true },
          { name: "👛 Số dư", value: tok(bal), inline: true },
          { name: "🎒 Túi cá", value: `**${bag.length - r.sold.length}/${FISH_CFG.bagMax}**`, inline: true },
        ],
      }),
      components: [],
    });
  }
  return { type: 4, data: secret("Hành động không hợp lệ.") };
}

// ---------- /cauca ----------
async function invRow(db, uid, itemId) {
  return db.prepare("SELECT qty, durability FROM inventory WHERE user_id = ? AND item_id = ?").bind(uid, itemId).first();
}

export async function cauca(db, me, rodIn, baitIn, guildId) {
  const rod = findItem(rodIn);
  const bait = findItem(baitIn);
  if (!rod || rod.type !== "rod") return secret("❌ Hãy chọn một **cần câu** từ danh sách gợi ý.");
  if (!bait || bait.type !== "bait") return secret("❌ Hãy chọn một **loại mồi** từ danh sách gợi ý.");

  const rodRow = await invRow(db, me.id, rod.id);
  if (!rodRow || rodRow.qty < 1) return secret(`❌ Bạn không có **${rod.name}**.`);
  if (rodRow.durability < 1) return secret(`❌ **${rod.name}** đã hỏng, hãy mua cần mới.`);
  const baitRow = await invRow(db, me.id, bait.id);
  if (!baitRow || baitRow.qty < 1) return secret(`❌ Bạn đã hết **${bait.name}**.`);

  const bagCount = (await db.prepare("SELECT COUNT(*) AS n FROM fish_bag WHERE user_id = ?").bind(me.id).first()).n;
  if (bagCount >= FISH_CFG.bagMax) return secret(`🎒 Túi cá đã đầy (${bagCount}/${FISH_CFG.bagMax}). Hãy dùng \`/banca\` để bán bớt rồi câu tiếp.`);

  const pond = currentPond(guildId);
  if (!baitCandidates(bait, pond.species).length)
    return secret(`🌊 Hồ cá lúc này không có sinh vật nào bị **${bait.name}** thu hút, bạn chưa bị mất gì. Xem \`/hoca\` hoặc đổi mồi nhé (hồ làm mới ${eta(pond.refreshAt)}).`);

  // Hồi chiêu 30 giây: chiếm lượt nguyên tử để bấm nhanh liên tiếp không qua mặt được
  const now = Date.now();
  const cd = await db
    .prepare("INSERT INTO fish_state (user_id, last_cast) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET last_cast = excluded.last_cast WHERE fish_state.last_cast <= ?")
    .bind(me.id, now, now - FISH_CFG.cooldownMs)
    .run();
  if (cd.meta.changes === 0) {
    const last = (await db.prepare("SELECT last_cast FROM fish_state WHERE user_id = ?").bind(me.id).first()).last_cast;
    return secret(`⏳ Cần câu đang hồi sức, thử lại ${eta(last + FISH_CFG.cooldownMs)}.`);
  }

  const out = rollCast({ rod, bait, pond: pond.species, baitQty: baitRow.qty });
  const maxDur = rod.durability;
  const newDur = out.rodBreak ? 0 : Math.min(maxDur, Math.max(0, rodRow.durability - out.durLoss + out.durGain));
  const consume = Math.max(0, Math.min(out.baitUse, baitRow.qty) - out.baitRefund);
  const newQty = baitRow.qty - consume;

  const prev = await collectionOf(db, me.id);
  const stmts = [
    db.prepare("UPDATE inventory SET durability = ? WHERE user_id = ? AND item_id = ? AND qty > 0 AND durability = ?").bind(newDur, me.id, rod.id, rodRow.durability),
    db.prepare("UPDATE inventory SET qty = ? WHERE user_id = ? AND item_id = ? AND qty = ? AND changes() > 0").bind(newQty, me.id, bait.id, baitRow.qty),
  ];
  for (const f of out.fishes) {
    stmts.push(
      // Chỉ thêm khi túi còn chỗ. Túi đầy giữa chừng thì con cá đó bị bỏ lỡ.
      db
        .prepare("INSERT INTO fish_bag (user_id, species, part, weight_g, mult, caught_at) SELECT ?, ?, ?, ?, ?, ? WHERE changes() > 0 AND (SELECT COUNT(*) FROM fish_bag WHERE user_id = ?) < ?")
        .bind(me.id, f.species, f.part, f.weightG, f.mult, now, me.id, FISH_CFG.bagMax),
      db
        .prepare(
          "INSERT INTO collection (user_id, species, catches, record_g, first_at) SELECT ?, ?, 1, ?, ? WHERE changes() > 0 ON CONFLICT (user_id, species) DO UPDATE SET catches = catches + 1, record_g = MAX(record_g, excluded.record_g)"
        )
        .bind(me.id, f.species, f.weightG, now)
    );
  }
  stmts.push(db.prepare("DELETE FROM inventory WHERE user_id = ? AND item_id = ? AND durability <= 0").bind(me.id, rod.id));
  const res = await db.batch(stmts);

  if (res[0].meta.changes !== 1 || res[1].meta.changes !== 1)
    return secret("⚠️ Kho đồ của bạn vừa thay đổi trong lúc câu nên lượt này không được tính. Bạn thử lại nhé.");

  const saved = [];
  out.fishes.forEach((f, i) => {
    if (res[2 + i * 2].meta.changes === 1) saved.push(f);
  });
  const lost = out.fishes.length - saved.length;
  const bagNow = bagCount + saved.length;

  const sp = out.species;
  const color = RARITY_COLOR[sp.rarity];
  const gear = [
    { name: "🎣 Độ bền cần câu", value: newDur > 0 ? `**${newDur}/${maxDur}**` : "**Đã hỏng**", inline: true },
    { name: "🪱 Mồi còn lại", value: `${bait.icon} **${fmtNum(newQty, 0)}**`, inline: true },
  ];
  const notes = out.notes.length ? out.notes.join("\n") : "";
  const broke = newDur <= 0 ? `\n\n🪦 **${rod.name}** đã hỏng và biến mất khỏi kho đồ, bạn cần mua cần mới.` : "";
  const foot = "Hồi chiêu 30 giây • /tuica để xem túi cá";

  if (out.kind === "catch") {
    const first = out.fishes[0];
    const worth = out.fishes.reduce((a, f) => a + fishValue(f.species, f.weightG, f.mult, f.part), 0);
    const fields = [];
    if (out.fishes.length === 1 && first.part !== "tentacle") {
      fields.push(
        { name: "Cân nặng", value: fmtKg(first.weightG), inline: true },
        { name: "Giá cơ bản", value: priceLabel(sp), inline: true },
        { name: "Giá trị ước tính", value: tok(worth), inline: true }
      );
    } else if (first.part === "tentacle") {
      fields.push({ name: "Xúc tu", value: `${out.fishes.length} cái`, inline: true }, { name: "Giá trị ước tính", value: tok(worth), inline: true });
    } else {
      fields.push({ name: "Cân nặng", value: out.fishes.map(f => fmtKg(f.weightG)).join(" + "), inline: true }, { name: "Giá trị ước tính", value: tok(worth), inline: true });
    }
    fields.push({ name: "🎒 Túi cá", value: `**${bagNow}/${FISH_CFG.bagMax}**`, inline: true }, ...gear);
    const extra = [];
    if (!prev[sp.id]) extra.push("✨ **Loài mới được khám phá!** Đã thêm vào /bosuutap.");
    const rec = Math.max(...out.fishes.map(f => f.weightG));
    if (prev[sp.id] && first.part !== "tentacle" && rec > prev[sp.id].record_g) extra.push("🏆 **Kỷ lục cân nặng mới** cho loài này!");
    if (lost) extra.push(`🎒 Túi cá đầy nên bạn đã để lỡ ${lost} con!`);
    const nameLine = first.part === "tentacle" ? `**${TENTACLE.name} ${TENTACLE.icon}** (từ ${sp.name})` : `**${sp.name} ${sp.icon}**`;
    return card("🎣 KẾT QUẢ CÂU CÁ", `${nameLine}\n${rarityLine(sp.rarity)}${[notes, ...extra].filter(Boolean).length ? "\n\n" + [notes, ...extra].filter(Boolean).join("\n") : ""}${broke}`, {
      color,
      thumb: "1f3a3",
      fields,
      footer: foot,
    });
  }

  const title = out.kind === "snap" ? "💥 ĐỨT DÂY!" : "🌫️ CÂU HỤT";
  const text =
    out.kind === "snap"
      ? `**${sp.name} ${sp.icon}** (${rarityLine(sp.rarity)}) quá sức với **${rod.name}**. Dây câu đứt và con mồi đã thoát.`
      : `**${sp.name} ${sp.icon}** (${rarityLine(sp.rarity)}) đã thoát khỏi lưỡi câu.`;
  return card(title, `${text}${notes ? "\n\n" + notes : ""}${broke}`, {
    color: out.kind === "snap" ? 0xef4444 : 0x64748b,
    thumb: out.kind === "snap" ? "1f4a5" : "1f3a3",
    fields: gear,
    footer: foot,
  });
}

// ---------- Gợi ý tự động ----------
export async function fishAutocomplete(db, uid, command, focused) {
  const q = normalize(focused.value || "");
  if (command === "cauca") {
    const { results } = await db.prepare("SELECT item_id, qty, durability FROM inventory WHERE user_id = ? AND qty > 0").bind(uid).all();
    const rods = focused.name === "can";
    return results
      .map(r => ({ item: ITEM_BY_ID[r.item_id], ...r }))
      .filter(r => r.item && (rods ? r.item.type === "rod" && r.durability > 0 : r.item.type === "bait") && (!q || normalize(r.item.name).includes(q)))
      .slice(0, 25)
      .map(r => ({ name: (rods ? `🎣 ${r.item.name} (độ bền ${r.durability}/${r.item.durability})` : `${r.item.icon} ${r.item.name} (x${fmtNum(r.qty, 0)})`).slice(0, 100), value: r.item.id }));
  }
  if (command === "bosuutap" && focused.name === "loai") {
    const col = await collectionOf(db, uid);
    return SPECIES.filter(s => col[s.id] && (!q || normalize(s.name).includes(q)))
      .slice(0, 25)
      .map(s => ({ name: `${s.icon} ${s.name}`.slice(0, 100), value: s.id }));
  }
  return null;
}
