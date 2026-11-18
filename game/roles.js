export const ROLE = {
  VILLAGER: "Dân Thường", SEER: "Tiên Tri", GUARD: "Bảo Vệ", WITCH: "Phù Thủy",
  HUNTER: "Thợ Săn", ELDER: "Già Làng", WOLF: "Ma Sói", LONE_WOLF: "Sói Cô Độc",
  CUB: "Sói Con", CUPID: "Thần Cupid", JESTER: "Kẻ Chán Đời", CURSED: "Kẻ Bị Nguyền",
};

const shuffle = a => {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export function assignRoles(count) {
  const roles = [];
  if (count <= 7) {
    roles.push(ROLE.WOLF, ROLE.SEER, ROLE.GUARD, ROLE.WITCH, ROLE.HUNTER);
    while (roles.length < count) roles.push(roles.length === 5 ? ROLE.ELDER : ROLE.VILLAGER);
  } else {
    const wolves = Math.max(2, Math.min(Math.floor(count / 3), Math.ceil(count / 4)));
    for (let i = 0; i < wolves; i++) {
      if (i === 1 && count >= 14) roles.push(ROLE.LONE_WOLF);
      else if (i === wolves - 1 && count >= 12 && wolves >= 3) roles.push(ROLE.CUB);
      else roles.push(ROLE.WOLF);
    }
    roles.push(ROLE.CUPID);
    if (count >= 9) roles.push(ROLE.JESTER);
    if (count >= 10) roles.push(ROLE.CURSED);
    for (const r of [ROLE.SEER, ROLE.GUARD, ROLE.WITCH, ROLE.HUNTER, ROLE.ELDER]) {
      if (roles.length < count) roles.push(r);
    }
    while (roles.length < count) roles.push(ROLE.VILLAGER);
  }
  return shuffle(roles.slice(0, count));
}

export const teamOf = role => {
  if ([ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(role)) return role === ROLE.LONE_WOLF ? "solo_wolf" : "wolves";
  if (role === ROLE.CURSED) return "village";
  if (role === ROLE.CUPID || role === ROLE.JESTER) return "third";
  return "village";
};

export const roleDescription = role => ({
  [ROLE.VILLAGER]: "Bạn không có kỹ năng ban đêm. Hãy thảo luận và tìm Ma Sói.",
  [ROLE.SEER]: "Mỗi đêm, chọn một người để soi phe của họ.",
  [ROLE.GUARD]: "Mỗi đêm, bảo vệ một người khỏi Sói cắn. Không được bảo vệ cùng một người hai đêm liên tiếp.",
  [ROLE.WITCH]: "Bạn có một bình Cứu và một bình Độc cho cả ván. Sau khi biết nạn nhân bị cắn, bạn quyết định.",
  [ROLE.HUNTER]: "Khi chết, bạn có 15 giây để chọn một người kéo theo.",
  [ROLE.ELDER]: "Chịu được hai lần Sói cắn. Nếu bị dân treo cổ hoặc Phù Thủy đầu độc, kỹ năng đặc biệt của Dân Làng bị vô hiệu.",
  [ROLE.WOLF]: "Bạn thuộc phe Sói. Chọn mục tiêu cùng đồng đội mỗi đêm.",
  [ROLE.LONE_WOLF]: "Bạn thuộc phe Sói nhưng chỉ thắng nếu là người sống sót cuối cùng.",
  [ROLE.CUB]: "Khi Sói Con chết, đêm kế tiếp bầy Sói được cắn hai người.",
  [ROLE.CUPID]: "Đêm đầu tiên, chọn hai người làm Cặp Đôi. Nếu khác phe, họ thắng khi chỉ còn hai người sống.",
  [ROLE.JESTER]: "Bạn thắng ngay nếu bị Dân Làng treo cổ ban ngày.",
  [ROLE.CURSED]: "Ban đầu thuộc Dân Làng. Nếu bị Sói cắn, bạn sống sót và chuyển thành Ma Sói vào đêm kế tiếp.",
}[role] || "Hãy chơi theo vai trò của bạn.");
