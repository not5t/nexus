// NEXUS - Dữ liệu vật phẩm (cần câu, mồi câu) và cơ chế cửa hàng đổi hàng mỗi giờ.
// File này chỉ chứa dữ liệu và hàm thuần, không phụ thuộc vào Worker, để sau này cơ chế câu cá dùng lại.

// Icon tùy chỉnh chỉ hiện trong tin nhắn/embed trên Discord. Secret và Trash chưa có icon riêng nên dùng emoji thường.
export const RARITY = {
  common: { e: "<:common:1566144745128853624>", n: "Common" },
  uncommon: { e: "<:uncommon:1566145261687017543>", n: "Uncommon" },
  rare: { e: "<:rare:1566145420030378064>", n: "Rare" },
  epic: { e: "<:epic:1566145643154645013>", n: "Epic" },
  legendary: { e: "<:legendary:1566145716060164196>", n: "Legendary" },
  mythic: { e: "<:mythic:1566145790861123674>", n: "Mythic" },
  secret: { e: "❔", n: "Secret" },
  trash: { e: "🗑️", n: "Trash" },
};

export const ITEMS = [
  // ---------- Cần câu ----------
  {
    id: "rod_dry_branch", type: "rod", icon: "🎣", name: "Cần Cành Cây Khô", price: 30, durability: 5,
    desc: "Một cành cây nhặt vội ven đường buộc thêm sợi chỉ may. Chỉ câu được cá con và rác.",
    buff: "+15% cơ hội câu được rác",
  },
  {
    id: "rod_bamboo", type: "rod", icon: "🎣", name: "Cần Tre", price: 50, durability: 15,
    desc: "Dẻo dai và quen thuộc ở mọi ao làng. Đủ sức kéo vài con cá nhỏ.",
    buff: "Không có",
  },
  {
    id: "rod_fiberglass", type: "rod", icon: "🎣", name: "Cần Sợi Thủy Tinh", price: 100, durability: 20,
    desc: "Bước đầu làm quen với đồ chuyên dụng. Bền hơn tre nhưng vẫn dễ cong khi gặp cá lớn.",
    buff: "Giảm 10% tỉ lệ câu hụt",
  },
  {
    id: "rod_iron", type: "rod", icon: "🎣", name: "Cần Câu Sắt", price: 500, durability: 50,
    desc: "Cứng cáp, nhẹ tay và vung cần cực mạnh.",
    buff: "Tăng 10% trọng lượng (kg) của cá câu được",
  },
  {
    id: "rod_gold", type: "rod", icon: "🎣", name: "Cần Câu Vàng", price: 2000, durability: 15,
    desc: "Lấp lánh ánh hoàng kim.",
    buff: "Tăng 10% tỉ lệ câu được 2 con cùng lúc (double catch)",
  },
  {
    id: "rod_coral", type: "rod", icon: "🎣", name: "Cần Lõi San Hô", price: 5000, durability: 30,
    desc: "Chế tác từ san hô cổ đại dưới đáy biển, tự động thu hút các loài sinh vật quý hiếm.",
    buff: "Tăng 20% câu được cá Epic",
  },
  {
    id: "rod_crystal", type: "rod", icon: "🎣", name: "Cần Câu Pha Lê", price: 10000, durability: 60,
    desc: "Được gọt giũa từ khối pha lê vĩnh cửu ngàn năm. Thân cần trong suốt phát ra luồng ma lực thuần khiết, dẫn dụ những sinh vật huyền bí từ sâu thẳm đại dương.",
    buff: "Tăng 5% câu được cá Mythic",
    special: "Sử dụng Mồi Pha Lê giúp tăng 10% trọng lượng của cá câu được",
  },
  {
    id: "rod_magma", type: "rod", icon: "🎣", name: "Cần Tinh Thạch Mắc Ma", price: 25000, durability: 100,
    desc: "Rèn từ lõi núi lửa và chịu được sức kéo của thủy quái.",
    buff: "20% không mất độ bền khi câu cá",
  },

  // ---------- Mồi câu ----------
  {
    id: "bait_bread", type: "bait", icon: "🍞", name: "Vụn Bánh Mì", price: 2,
    desc: "Vài mẩu bánh mì khô vụn, món ăn chống đói cho lũ cá nhỏ ven bờ.",
    attracts: ["common"],
  },
  {
    id: "bait_worm", type: "bait", icon: "🪱", name: "Giun Đất", price: 5,
    desc: "Món mồi kinh điển đầy sức sống, loài cá nào nhìn thấy cũng muốn đớp.",
    attracts: ["common", "uncommon"],
  },
  {
    id: "bait_shrimp", type: "bait", icon: "🦐", name: "Mồi Tôm", price: 10,
    desc: "Tôm tươi búng tanh tách dưới nước, kích thích bản năng săn mồi của cá lớn.",
    attracts: ["uncommon"],
  },
  {
    id: "bait_glow", type: "bait", icon: "💡", name: "Mồi Phát Sáng", price: 30,
    desc: "Tỏa ánh sáng xanh huyền ảo xua tan bóng tối, dẫn dụ sinh vật ẩn nấp nơi vực sâu.",
    attracts: ["uncommon", "rare"],
  },
  {
    id: "bait_kraken", type: "bait", icon: "🦑", name: "Thịt Thủy Quái", price: 100,
    desc: "Miếng thịt đậm mùi tanh nồng từ quái vật biển, chỉ những loài săn mồi hung dữ mới dám tới gần.",
    attracts: ["rare", "epic"],
  },
  {
    id: "bait_crystal", type: "bait", icon: "💎", name: "Mồi Pha Lê", price: 300,
    desc: "Khối pha lê ma thuật khúc xạ ánh sáng dưới đáy nước, khiến lũ cá bị mê hoặc hoàn toàn.",
    attracts: ["rare", "epic"],
    special: "Sử dụng Cần Câu Pha Lê giúp tăng 10% trọng lượng của cá câu được",
  },
  {
    id: "bait_ice", type: "bait", icon: "🧊", name: "Mồi Tinh Thể Băng", price: 400,
    desc: "Lạnh buốt thấu xương, tỏa hàn khí làm tê liệt con mồi ngay khoảnh khắc vừa chạm vào.",
    attracts: ["epic"],
    special: "Đóng băng: giảm 20% câu hụt",
  },
  {
    id: "bait_stardust", type: "bait", icon: "🌟", name: "Mồi Bụi Sao", price: 800,
    desc: "Những hạt bụi lấp lánh rơi xuống từ ngân hà, mang theo nguồn năng lượng phép thuật cổ xưa.",
    attracts: ["epic", "legendary"],
    special: "Tăng 20% tỉ lệ câu được 2 con cùng lúc (double catch)",
  },
  {
    id: "bait_dragon", type: "bait", icon: "🐉", name: "Mồi Long Huyết", price: 2000,
    desc: "Kết tinh từ máu rồng cổ đại sôi sục, tỏa ra uy áp khiến mọi thủy thần và sinh vật thần thoại phải quy phục.",
    attracts: ["epic", "legendary", "mythic"],
    special: "Tăng x1,25 giá trị cá câu được, tăng 15% trọng lượng của cá câu được",
  },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const TYPE_NAME = { rod: "Cần câu", bait: "Mồi câu" };

// Bỏ dấu + chữ thường để so khớp tên người chơi gõ tay
export const normalize = s =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function findItem(input) {
  const q = String(input || "").trim();
  if (ITEM_BY_ID[q]) return ITEM_BY_ID[q];
  const n = normalize(q);
  return ITEMS.find(i => normalize(i.name) === n) || null;
}

// ---------- Cửa hàng đổi hàng mỗi giờ ----------
// Hàng của mỗi giờ được chọn bằng bộ số ngẫu nhiên cố định theo số giờ,
// nên Discord và web luôn thấy đúng 4 món giống nhau mà không cần lưu vào database.

const HOUR = 3600e3;
const SHOP_SIZE = 4; // số món ngẫu nhiên mỗi giờ
// 2 món rẻ nhất luôn có mặt ở ô 1 và 2 để người chơi luôn có đồ để bắt đầu câu cá
const FIXED_IDS = ["rod_dry_branch", "bait_bread"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shopForHour(hour) {
  const rng = mulberry32(Math.imul(hour, 2654435761) ^ 0x4e455855); // "NEXU"
  for (let i = 0; i < 4; i++) rng(); // bỏ vài số đầu cho các giờ liền kề khác nhau rõ rệt
  // Có thể trùng lặp vì mỗi ô được chọn độc lập
  return Array.from({ length: SHOP_SIZE }, (_, i) => ({ slot: FIXED_IDS.length + i + 1, item: ITEMS[Math.floor(rng() * ITEMS.length)], fixed: false }));
}

export function currentShop(now = Date.now()) {
  const hour = Math.floor(now / HOUR);
  const fixed = FIXED_IDS.map((id, i) => ({ slot: i + 1, item: ITEM_BY_ID[id], fixed: true }));
  return { hour, refreshAt: (hour + 1) * HOUR, slots: [...fixed, ...shopForHour(hour)] };
}

// ---------- Hiển thị ----------

export const rarityText = list => list.map(r => `${RARITY[r].e} ${RARITY[r].n}`).join(", ");

// own = { qty, durability } nếu người chơi đang có vật phẩm
export function itemEmbed(item, own) {
  const fields = [];
  if (item.type === "rod") {
    fields.push({ name: "✨ Buff", value: item.buff, inline: true });
    fields.push({ name: "🛡️ Độ bền", value: own ? `${own.durability}/${item.durability}` : String(item.durability), inline: true });
  } else {
    fields.push({ name: "🎯 Thu hút", value: rarityText(item.attracts) });
    fields.push({ name: "🎒 Số lượng", value: String(own ? own.qty : 0), inline: true });
  }
  if (item.special) fields.push({ name: "💫 Đặc biệt", value: item.special });
  return {
    title: `${item.icon} ${item.name}`,
    description: `*“${item.desc}”*`,
    color: item.type === "rod" ? 0x3b82f6 : 0x84cc16,
    fields,
    footer: { text: `${TYPE_NAME[item.type]} • Giá gốc ${item.price.toLocaleString("vi-VN")} Token Cá` },
  };
}
