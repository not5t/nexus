// NEXUS - Dữ liệu sinh vật, luật cần câu/mồi, hồ cá và mô phỏng một lượt câu.
// File này chỉ chứa dữ liệu và hàm thuần (không đụng tới database) nên rất dễ chỉnh số liệu và kiểm thử.

import { RARITY } from "./items.js";

// ---------- Hằng số cân bằng (chỉnh ở đây) ----------
export const FISH_CFG = {
  bagMax: 10, // sức chứa túi cá
  cooldownMs: 30e3, // hồi chiêu /cauca
  pondMs: 20 * 60e3, // hồ cá đổi mỗi 20 phút
  baseMiss: 0.2, // tỉ lệ câu hụt cơ bản
  secretChance: 0.01, // tỉ lệ ra cá Secret mỗi lượt (bất kể cần/mồi)
  trashBase: 0.15, // tỉ lệ gặp rác của Cần Cành Cây Khô (chưa tính buff +15%)
  tentacleChance: 0.3, // Kraken: tỉ lệ ra xúc tu thay vì nguyên con
  tentaclePrice: 30,
};

export const RANK = { trash: 0, common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6 };
export const SHOW_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "secret", "trash"];

// Trọng số khi chọn sinh vật trong hồ: cấp càng cao càng hiếm
const RARITY_WEIGHT = { common: 100, uncommon: 60, rare: 25, epic: 6, legendary: 2, mythic: 0.5 };

// Xác suất mỗi loài xuất hiện trong hồ ở mỗi lần làm mới
const POND_CHANCE = { common: 0.75, uncommon: 0.6, rare: 0.3, epic: 0.08, legendary: 0.04, mythic: 0.015 };

// ---------- Danh sách sinh vật ----------
// price: Token mỗi `unit` kg (mặc định 1 kg). fixedPrice: giá cố định mỗi cái.
const sp = (id, name, icon, rarity, price, maxKg, extra = {}) => ({ id, name, icon, rarity, price, unit: 1, maxKg, ...extra });

export const SPECIES = [
  // Common
  sp("snail", "Ốc", "🐚", "common", 2, 0.15, { unit: 0.1 }),
  sp("small_fish", "Cá con", "🐟", "common", 3, 0.1, { unit: 0.1 }),
  sp("clownfish", "Cá hề", "🐠", "common", 3, 0.5, { unit: 0.1 }),
  sp("carp", "Cá chép", "🐟", "common", 5, 15),
  sp("pufferfish", "Cá nóc", "🐡", "common", 6, 1.5),
  // Uncommon
  sp("snakehead", "Cá lóc", "🐟", "uncommon", 8, 8),
  sp("catfish", "Cá trê", "🐟", "uncommon", 10, 30),
  sp("shrimp", "Tôm", "🦐", "uncommon", 10, 0.1, { unit: 0.1 }),
  sp("octopus", "Bạch tuộc", "🐙", "uncommon", 20, 50),
  sp("lobster", "Tôm hùm", "🦐", "uncommon", 23, 20),
  sp("king_crab", "Cua hoàng đế", "🦀", "uncommon", 25, 15),
  // Rare
  sp("dolphin", "Dolphin", "🐬", "rare", 30, 300),
  sp("crocodile", "Crocodile", "🐊", "rare", 35, 1000),
  sp("shark", "Shark", "🦈", "rare", 40, 1000),
  sp("swordfish", "Cá Kiếm", "⚔️", "rare", 42, 650),
  sp("whale", "Whale", "🐳", "rare", 50, 30000),
  sp("big_white_shark", "Big White Shark", "🦈", "rare", 43, 2000),
  sp("killer_whale", "Killer Whale", "🐳", "rare", 33, 8000),
  sp("sperm_whale", "Sperm Whale", "🐳", "rare", 10, 57000),
  sp("loch_ness", "Loch Ness", "🦕", "rare", 20, 20000),
  // Epic
  sp("mosasaurus", "Mosasaurus", "🦖", "epic", 22, 15000, { trait: { id: "bite", name: "Cắn I", amount: 20, desc: "Trừ 20 độ bền cần câu khi chạm trán, kể cả câu hụt." } }),
  sp("megalodon", "Megalodon", "🦈", "epic", 10, 60000, { trait: { id: "bite", name: "Cắn II", amount: 30, desc: "Trừ 30 độ bền cần câu khi chạm trán." } }),
  sp("ice_worm", "Ice Worm", "❄️", "epic", 10, 80000, { trait: { id: "freeze", name: "Đóng Băng", desc: "Có 40% cơ hội mất thêm 1 mồi khi chạm trán." } }),
  sp("dunkleosteus", "Dunkleosteus", "🦴", "epic", 80, 4000, { trait: { id: "bite", name: "Cắn III", amount: 40, desc: "Trừ 40 độ bền cần câu khi chạm trán, kể cả câu hụt." } }),
  sp("kraken", "Kraken", "🐙", "epic", 4, 300000, { trait: { id: "tentacle", name: "Xúc Tu", desc: "Có 30% cơ hội câu được xúc tu thay vì nguyên con; mỗi xúc tu trị giá 30 Token/cái." } }),
  // Legendary
  sp("hydra", "Hydra", "🐉", "legendary", 18, 100000, { trait: { id: "nine_heads", name: "9 Đầu", desc: "Tiêu hao 9 mồi thay vì 1. Nếu người chơi không đủ 9 mồi sẽ hụt Hydra ngay lập tức." } }),
  sp("sea_emperor", "Sea Emperor", "👑", "legendary", 3.5, 500000, { trait: { id: "empathy", name: "Giao Cảm", desc: "30% cơ hội hoàn lại 1 mồi và phục hồi 5 độ bền cần câu." } }),
  sp("the_bloop", "The Bloop", "🕳️", "legendary", 1.8, 1000000, { trait: { id: "swallow", name: "Miệng To", desc: "Nuốt toàn bộ mồi người chơi đang sử dụng." } }),
  // Mythic
  sp("leviathan", "Leviathan", "🌊", "mythic", 0.36, 5000000, { trait: { id: "crush", name: "Áp Suất Vực Sâu", desc: "Cần câu gãy ngay lập tức nếu câu được hoặc hụt." } }),
  sp("el_gran_maja", "El Gran Maja", "🔱", "mythic", 0.72, 2500000, { trait: { id: "predator", name: "Kẻ Săn Mồi", desc: "Mất 5 mồi nếu câu hụt; nếu bắt thành công, cân nặng tăng ×1,2." } }),
  sp("julia_beast", "Julia Beast", "🌌", "mythic", 1.8, 1000000, { trait: { id: "evade", name: "Né I", desc: "Tăng 25% cơ hội câu hụt khi chạm trán." } }),
  // Secret (không xuất hiện trong /hoca, tỉ lệ 1% ở mọi cần câu và mồi)
  sp("starfish", "Sao Biển", "✨", "secret", 100, 5),
  sp("sea_turtle", "Rùa Biển", "🐢", "secret", 50, 900),
  sp("silver_card", "Cá Bạc", "🃏", "secret", 300, 0.5, { unit: 0.1 }),
  // Trash (giá cố định mỗi cái, chỉ Cần Cành Cây Khô câu được)
  sp("boot", "Chiếc ủng rách", "👢", "trash", 0, 1.5, { fixedPrice: 1 }),
  sp("plastic_bag", "Túi nilon", "🛍️", "trash", 0, 0.1, { fixedPrice: 0 }),
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map(s => [s.id, s]));
export const TENTACLE = { name: "Xúc tu Kraken", icon: "🦑" };
const SECRETS = SPECIES.filter(s => s.rarity === "secret");
const TRASHES = SPECIES.filter(s => s.rarity === "trash");

// ---------- Luật cần câu và mồi ----------
// maxRank: nhóm cao nhất câu được; gặp nhóm cao hơn thì đứt dây
export const ROD_RULES = {
  rod_dry_branch: { maxRank: 1, trash: true, trashBonus: 0.15 },
  rod_bamboo: { maxRank: 1 },
  rod_fiberglass: { maxRank: 2, missReduce: 0.1 },
  rod_iron: { maxRank: 3, weightMult: 1.1 },
  rod_gold: { maxRank: 3, doubleBonus: 0.1 },
  rod_coral: { maxRank: 4, rarityBoost: { epic: 0.2 } },
  rod_crystal: { maxRank: 5, rarityBoost: { mythic: 0.05 } },
  rod_magma: { maxRank: 6, saveDurability: 0.2 },
};
export const BAIT_RULES = {
  bait_ice: { missReduce: 0.2 },
  bait_stardust: { doubleBonus: 0.2 },
  bait_dragon: { valueMult: 1.25, weightMult: 1.15 },
};

const RANK_NAME = ["Trash", "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"];
// Mô tả khả năng của cần câu để hiện trong /item view
export function rodCapability(rodId) {
  const r = ROD_RULES[rodId];
  if (!r) return null;
  const can = [];
  if (r.trash) can.push("Trash");
  for (let k = 1; k <= r.maxRank; k++) can.push(RANK_NAME[k]);
  const breaks = r.maxRank < 6 ? `${RANK_NAME[r.maxRank + 1]} trở lên` : null;
  return { can: can.join(", "), breaks };
}

// ---------- Tiền và cân nặng ----------
export const speciesName = (id, part) => (part === "tentacle" ? TENTACLE.name : SPECIES_BY_ID[id].name);
export const speciesIcon = (id, part) => (part === "tentacle" ? TENTACLE.icon : SPECIES_BY_ID[id].icon);

// Tiền nhận = cân nặng × giá/kg (× hệ số giá trị), làm tròn về số nguyên, tối thiểu 1 Token
export function fishValue(speciesId, weightG, mult = 1, part = "") {
  if (part === "tentacle") return FISH_CFG.tentaclePrice;
  const s = SPECIES_BY_ID[speciesId];
  if (s.fixedPrice !== undefined) return s.fixedPrice;
  return Math.max(1, Math.round(((weightG * s.price) / (s.unit * 1000)) * mult));
}

// Giữ đúng đơn vị bạn đặt: ví dụ Cá con là "3 Token/0,1 kg" chứ không đổi thành 30 Token/kg
export function priceLabel(s) {
  if (s.fixedPrice !== undefined) return `${fmtNum(s.fixedPrice)} Token/cái`;
  return `${fmtNum(s.price)} Token/${s.unit === 1 ? "" : fmtNum(s.unit) + " "}kg`;
}

export const fmtNum = (n, max = 2) => Number(n).toLocaleString("vi-VN", { maximumFractionDigits: max });
export function fmtKg(g) {
  const kg = g / 1000;
  return `${fmtNum(kg, kg < 1 ? 3 : kg < 100 ? 2 : 1)} kg`;
}

// ---------- Cân bằng kinh tế qua phân bố cân nặng ----------
// Giá/kg, cân nặng tối đa và công thức "cân nặng × giá/kg" đều giữ nguyên. Thứ được cân bằng là
// phân bố cân nặng khi câu: cá hiếm hầu hết nhẹ hơn nhiều so với mức tối đa, còn cân nặng tiệm cận mức tối đa
// (kỷ lục, "jackpot") thì rất hiếm. Nhờ đó giá trị trung bình của mỗi nhóm hiếm nằm ở mức dưới đây
// dù giá/kg của từng loài chênh lệch rất nhiều.
export const TARGET_EV = { rare: 350, epic: 1500, legendary: 6000, mythic: 20000, secret: 600 };

function weightModel(s) {
  const naturalSkew = s.maxKg <= 2 ? 1.5 : 3; // loài nhỏ ít lệch hơn nên cân nặng đa dạng hơn
  const naturalMean = 0.03 + 0.97 / (naturalSkew + 1);
  const maxValue = (s.price * s.maxKg) / s.unit; // giá trị khi bắt đúng cân nặng tối đa
  const target = TARGET_EV[s.rarity];
  const want = target && maxValue > 0 ? target / maxValue : naturalMean;
  if (want >= naturalMean) return { floor: 0.03, skew: naturalSkew }; // tự nhiên đã đủ thấp
  const floor = want / 4;
  return { floor, skew: (1 - floor) / (0.75 * want) - 1 };
}
const WEIGHT_MODEL = Object.fromEntries(SPECIES.map(s => [s.id, weightModel(s)]));

function rollWeightG(s, rng) {
  const { floor, skew } = WEIGHT_MODEL[s.id];
  const maxG = Math.round(s.maxKg * 1000);
  return Math.max(1, Math.round(maxG * (floor + (1 - floor) * Math.pow(rng(), skew))));
}

// ---------- Hồ cá (đổi mỗi 20 phút, mỗi server một hồ) ----------
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pondForWindow(guildKey, win) {
  const rng = mulberry32(hashStr(`${guildKey}:${win}`) ^ 0x46495348); // "FISH"
  for (let i = 0; i < 4; i++) rng();
  const chosen = SPECIES.filter(s => POND_CHANCE[s.rarity] && rng() < POND_CHANCE[s.rarity]);
  // Luôn có tối thiểu vài loài phổ biến để hồ không bao giờ trống
  const filler = SPECIES.filter(s => (s.rarity === "common" || s.rarity === "uncommon") && !chosen.includes(s));
  while (chosen.length < 5 && filler.length) chosen.push(filler.splice(Math.floor(rng() * filler.length), 1)[0]);
  return SPECIES.filter(s => chosen.includes(s)); // giữ đúng thứ tự danh sách gốc
}

export function currentPond(guildKey, now = Date.now()) {
  const win = Math.floor(now / FISH_CFG.pondMs);
  return { window: win, refreshAt: (win + 1) * FISH_CFG.pondMs, species: pondForWindow(guildKey || "dm", win) };
}

// Mồi có thu hút được sinh vật nào đang trong hồ không?
export const baitCandidates = (bait, pond) => pond.filter(s => bait.attracts.includes(s.rarity));

// ---------- Một lượt câu ----------
function pickSpecies(cands, boost, rng) {
  const groups = {};
  for (const s of cands) (groups[s.rarity] ||= []).push(s);
  const present = Object.keys(groups);
  const total = present.reduce((a, r) => a + RARITY_WEIGHT[r], 0);
  const P = Object.fromEntries(present.map(r => [r, RARITY_WEIGHT[r] / total]));
  // Buff của cần câu cộng thêm xác suất cho nhóm được tăng, các nhóm còn lại co lại tương ứng
  const boosted = present.filter(r => boost && boost[r]);
  if (boosted.length) {
    for (const r of boosted) P[r] = Math.min(1, P[r] + boost[r]);
    const sumB = boosted.reduce((a, r) => a + P[r], 0);
    const others = present.filter(r => !boosted.includes(r));
    const sumO = others.reduce((a, r) => a + P[r], 0);
    const scaleB = sumB > 1 ? 1 / sumB : 1;
    const scaleO = sumO > 0 ? Math.max(0, 1 - sumB * scaleB) / sumO : 0;
    for (const r of boosted) P[r] *= scaleB;
    for (const r of others) P[r] *= scaleO;
  }
  let x = rng();
  let pick = present[present.length - 1];
  for (const r of present) {
    if (x < P[r]) {
      pick = r;
      break;
    }
    x -= P[r];
  }
  const list = groups[pick];
  return list[Math.floor(rng() * list.length)];
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/**
 * Mô phỏng 1 lượt câu (chưa ghi gì vào database).
 * Trả về: { kind: "catch"|"miss"|"snap", species, fishes[], baitUse, baitRefund, durLoss, durGain, rodBreak, notes[] }
 */
export function rollCast({ rod, bait, pond, baitQty, rng = Math.random }) {
  const R = ROD_RULES[rod.id] || { maxRank: 0 };
  const B = BAIT_RULES[bait.id] || {};
  const notes = [];
  let baitUse = 1;
  let durLoss = 1;
  let durGain = 0;
  let refund = 0;
  let rodBreak = false;
  let forcedMiss = false;

  if (R.saveDurability && rng() < R.saveDurability) {
    durLoss = 0;
    notes.push("🌋 Tinh thạch giúp cần câu **không mất độ bền** lượt này.");
  }

  // 1) Cá Secret: 1% ở mọi cần câu và mọi mồi, luôn bắt được
  let species = null;
  let secret = false;
  if (rng() < FISH_CFG.secretChance) {
    species = SECRETS[Math.floor(rng() * SECRETS.length)];
    secret = true;
  } else if (R.trash && rng() < FISH_CFG.trashBase + (R.trashBonus || 0)) {
    // 2) Rác (chỉ Cần Cành Cây Khô)
    species = TRASHES[Math.floor(rng() * TRASHES.length)];
  } else {
    // 3) Sinh vật trong hồ mà mồi thu hút được
    const cands = baitCandidates(bait, pond);
    if (!cands.length) return { kind: "nobite" };
    species = pickSpecies(cands, R.rarityBoost, rng);
  }

  // 4) Đặc tính khi chạm trán
  const t = species.trait;
  let evade = 0;
  if (t) {
    if (t.id === "bite") {
      durLoss += t.amount;
      notes.push(`🦷 **${t.name}**: cần câu bị trừ thêm ${t.amount} độ bền.`);
    } else if (t.id === "freeze" && rng() < 0.4) {
      baitUse += 1;
      notes.push(`🧊 **${t.name}**: mất thêm 1 mồi.`);
    } else if (t.id === "nine_heads") {
      baitUse = 9;
      if (baitQty < 9) {
        baitUse = 1;
        forcedMiss = true;
        notes.push(`🐉 **${t.name}**: bạn không đủ 9 mồi nên hụt Hydra ngay lập tức.`);
      } else notes.push(`🐉 **${t.name}**: tiêu hao 9 mồi.`);
    } else if (t.id === "swallow") {
      baitUse = baitQty;
      notes.push(`🕳️ **${t.name}**: nuốt toàn bộ mồi của bạn.`);
    } else if (t.id === "empathy" && rng() < 0.3) {
      refund = 1;
      durGain = 5;
      notes.push(`👑 **${t.name}**: hoàn lại 1 mồi và phục hồi 5 độ bền.`);
    } else if (t.id === "crush") {
      rodBreak = true;
      notes.push(`🌊 **${t.name}**: cần câu gãy ngay lập tức.`);
    } else if (t.id === "evade") evade = 0.25;
  }

  // 5) Kết quả: đứt dây / hụt / bắt được
  const rank = RANK[species.rarity];
  let kind;
  if (!secret && rank !== undefined && rank > R.maxRank) {
    kind = "snap";
  } else if (forcedMiss) {
    kind = "miss";
  } else if (secret) {
    kind = "catch";
  } else {
    const missP = clamp(FISH_CFG.baseMiss - (R.missReduce || 0) - (B.missReduce || 0) + evade, 0, 0.95);
    kind = rng() < missP ? "miss" : "catch";
  }
  if (kind === "miss" && t && t.id === "predator") {
    baitUse = 5;
    notes.push(`🔱 **${t.name}**: mất 5 mồi vì câu hụt.`);
  }

  const fishes = [];
  if (kind === "catch") {
    const crystalCombo = rod.id === "rod_crystal" && bait.id === "bait_crystal";
    const wMult = (R.weightMult || 1) * (B.weightMult || 1) * (crystalCombo ? 1.1 : 1) * (t && t.id === "predator" ? 1.2 : 1);
    const doubleP = species.rarity === "trash" ? 0 : (R.doubleBonus || 0) + (B.doubleBonus || 0);
    const count = rng() < doubleP ? 2 : 1;
    if (count === 2) notes.push("✌️ **Câu đôi!** Bạn câu được 2 con cùng lúc.");
    for (let i = 0; i < count; i++) {
      if (species.id === "kraken" && rng() < FISH_CFG.tentacleChance) {
        fishes.push({ species: species.id, part: "tentacle", weightG: 0, mult: 1 });
        continue;
      }
      const maxG = Math.round(species.maxKg * 1000);
      const weightG = clamp(Math.round(rollWeightG(species, rng) * wMult), 1, maxG);
      fishes.push({ species: species.id, part: "", weightG, mult: B.valueMult || 1 });
    }
    if (crystalCombo) notes.push("💎 Cần Pha Lê + Mồi Pha Lê: cá nặng thêm 10%.");
    if (B.valueMult) notes.push("🐉 Mồi Long Huyết: giá trị cá ×1,25 và nặng thêm 15%.");
  }

  return { kind, species, secret, fishes, baitUse, baitRefund: refund, durLoss, durGain, rodBreak, notes };
}
