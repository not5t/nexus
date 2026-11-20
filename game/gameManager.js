import { DurableObject } from "cloudflare:workers";
import { assignRoles, ROLE, roleDescription, teamOf } from "./roles.js";

const API = "https://discord.com/api/v10";
const MAX = 25, MIN = 6;
const ms = n => n * 1000;
const safe = s => String(s || "Người chơi").replace(/[\\*_~`|>@]/g, "").slice(0, 50);
const mention = id => `<@${id}>`;
const isWolfRole = r => r === ROLE.WOLF || r === ROLE.CUB || r === ROLE.LONE_WOLF;
const MAX_REWARD_GAMES_PER_DAY = 10; // chống lập tài khoản phụ để cày thưởng
const VN_OFFSET = 7 * 3600e3, DAY_MS = 86400e3;
// ================= GIAO DIỆN EMBED =================
const TW = cp => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`; // biểu tượng lớn cạnh tiêu đề
const STYLE = {
  "1f43a": { c: 0x5865f2, t: "1f43a" }, "1f319": { c: 0x312e81, t: "1f319" }, "2600": { c: 0xfbbf24, t: "1f305" },
  "1f5e3": { c: 0x38bdf8, t: "1f4ac" }, "1f5f3": { c: 0xef4444, t: "1f5f3" }, "2696": { c: 0xef4444, t: "2696" },
  "1f3f9": { c: 0xf97316, t: "1f3f9" }, "1f4ca": { c: 0x38bdf8, t: "1f4ca" }, "1f3c6": { c: 0x22c55e, t: "1f3c6" },
  "1f52e": { c: 0xa855f7, t: "1f52e" }, "1f49e": { c: 0xec4899, t: "1f498" }, "1f9ea": { c: 0x10b981, t: "1f9ea" },
  "26a0": { c: 0xf59e0b, t: "26a0" }, "231b": { c: 0x64748b, t: "231b" }, "274c": { c: 0x64748b, t: "274c" },
  "1f3ad": { c: 0x5865f2, t: "1f3ad" }, "1f311": { c: 0x7f1d1d, t: "1f9df" },
};
const VILLAGE_GOAL = "Tìm ra và treo cổ toàn bộ Ma Sói.";
const WOLF_GOAL = "Cắn dần Dân Làng cho tới khi số Sói không ít hơn số người còn lại.";
const ROLE_STYLE = {
  [ROLE.VILLAGER]: { e: "🧑‍🌾", cp: "1f9d1-200d-1f33e", c: 0x57f287, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.SEER]: { e: "🔮", cp: "1f52e", c: 0xa855f7, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.GUARD]: { e: "🛡️", cp: "1f6e1", c: 0x3b82f6, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.WITCH]: { e: "🧪", cp: "1f9ea", c: 0x10b981, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.HUNTER]: { e: "🏹", cp: "1f3f9", c: 0xf97316, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.ELDER]: { e: "👴", cp: "1f474", c: 0xd4a373, team: "🏘️ Phe Dân Làng", goal: VILLAGE_GOAL },
  [ROLE.CURSED]: { e: "🧟", cp: "1f9df", c: 0x84cc16, team: "🏘️ Phe Dân Làng (có thể hóa Sói)", goal: VILLAGE_GOAL },
  [ROLE.WOLF]: { e: "🐺", cp: "1f43a", c: 0xed4245, team: "🐺 Phe Ma Sói", goal: WOLF_GOAL },
  [ROLE.CUB]: { e: "🐾", cp: "1f43e", c: 0xf87171, team: "🐺 Phe Ma Sói", goal: WOLF_GOAL },
  [ROLE.LONE_WOLF]: { e: "🌑", cp: "1f311", c: 0x7f1d1d, team: "🐺 Sói đơn độc", goal: "Là người sống sót cuối cùng." },
  [ROLE.CUPID]: { e: "💘", cp: "1f498", c: 0xec4899, team: "✨ Phe thứ 3", goal: "Ghép đôi. Nếu cặp đôi khác phe, họ thắng khi chỉ còn hai người sống." },
  [ROLE.JESTER]: { e: "🤪", cp: "1f92a", c: 0xf59e0b, team: "✨ Phe thứ 3", goal: "Bị Dân Làng treo cổ vào ban ngày." },
};
const eta = sec => `<t:${Math.floor(Date.now() / 1000) + sec}:R>`; // đồng hồ đếm ngược của Discord
const bar = (n, max, len = 10) => { const f = Math.max(0, Math.min(len, Math.round((n / (max || 1)) * len))); return "▰".repeat(f) + "▱".repeat(len - f); };
const foot = (s, extra = "") => ({ text: `Ma Sói • Đêm ${s.night || 0} • ${s.players.filter(p => p.alive).length}/${s.players.length} người còn sống${extra}` });
const rosterFields = s => {
  const alive = s.players.filter(p => p.alive).map(p => `🟢 ${mention(p.id)}`).join("\n") || "—";
  const dead = s.players.filter(p => !p.alive).map(p => `💀 ${mention(p.id)}`).join("\n");
  return [{ name: `🟢 Còn sống (${s.players.filter(p => p.alive).length})`, value: alive.slice(0, 1024), inline: true }, ...(dead ? [{ name: `💀 Đã ngã xuống (${s.players.filter(p => !p.alive).length})`, value: dead.slice(0, 1024), inline: true }] : [])];
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export class MasoiRoom extends DurableObject {
  constructor(state, env) { super(state, env); this.state = state; this.env = env; this.queue = Promise.resolve(); }
  fetch(request) {
    const task = this.queue.then(() => this.route(request));
    this.queue = task.catch(() => {});
    return task;
  }
  async route(request) {
    const path = new URL(request.url).pathname;
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    try {
      if (path === "/create") return json(await this.create(body));
      if (path === "/bind") { const s = await this.get(); if (s && body.messageId) { s.messageId = body.messageId; await this.save(s); } return json({ ok: true }); }
      if (path === "/interaction") return json(await this.interaction(body));
      if (path === "/status") return json({ room: await this.get() });
      return json({ error: "not_found" }, 404);
    } catch (e) { console.error("MaSoi DO:", e); return json({ error: "internal_error" }, 500); }
  }
  async get() { return this.state.storage.get("room"); }
  async save(s) { await this.state.storage.put("room", s); }
  async api(path, method = "GET", data, attempt = 0) {
    const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`, ...(data ? { "Content-Type": "application/json" } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const txt = await r.text();
    let parsed = {}; try { parsed = txt ? JSON.parse(txt) : {}; } catch {}
    if (r.status === 429 && attempt < 3) {
      const wait = Math.max(250, Math.min(10000, Number(parsed.retry_after || 1) * 1000));
      await new Promise(resolve => setTimeout(resolve, wait));
      return this.api(path, method, data, attempt + 1);
    }
    if (!r.ok) console.error("Discord API", r.status, txt.slice(0, 300));
    return { ok: r.ok, data: parsed };
  }
  async webhook(s, method, suffix, data) {
    const r = await fetch(`${API}/webhooks/${s.applicationId}/${s.interactionToken}${suffix}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const txt = await r.text(); return { ok: r.ok, data: txt ? JSON.parse(txt) : {} };
  }
  async sendChannel(s, data) { return this.api(`/channels/${s.channelId}/messages`, "POST", data); }
  async editLobby(s, data) {
    if (s.messageId) return this.api(`/channels/${s.channelId}/messages/${s.messageId}`, "PATCH", data);
    return this.webhook(s, "PATCH", "/messages/@original", data);
  }
  async openDM(userId) {
    const ch = await this.api("/users/@me/channels", "POST", { recipient_id: userId });
    return ch.ok && ch.data.id ? ch.data.id : null;
  }
  async dm(userId, data) {
    if (!this.env.DISCORD_BOT_TOKEN) return false;
    const s = await this.get();
    const player = s?.players?.find(p => p.id === userId);
    const channelId = player?.dmChannelId || await this.openDM(userId);
    if (!channelId) return false;
    return (await this.api(`/channels/${channelId}/messages`, "POST", data)).ok;
  }
  embed(title, description, extra = {}) {
    const cp = [...String(title).trim()][0]?.codePointAt(0)?.toString(16);
    const st = STYLE[cp] || { c: 0x35c4dc };
    return { embeds: [{ author: { name: "NEXUS • Ma Sói" }, title, description, color: st.c, ...(st.t ? { thumbnail: { url: TW(st.t) } } : {}), footer: { text: "Ma Sói • NEXUS" }, timestamp: new Date().toISOString(), ...extra }] };
  }
  roleCard(p, wolves = []) {
    const st = ROLE_STYLE[p.role] || {};
    const fields = [
      { name: "🏷️ Phe", value: st.team || "—", inline: true },
      { name: "🎯 Mục tiêu", value: st.goal || "—", inline: true },
      { name: "✨ Kỹ năng", value: roleDescription(p.role) },
    ];
    if (isWolfRole(p.role)) fields.push({ name: "🐺 Đồng đội", value: wolves.join(", ") || "Bạn hành động một mình." });
    return this.embed(`🎭 Vai trò của bạn: ${p.role}`, `${st.e || "🎭"} Bạn là **${p.role}**.\n🤫 Hãy giữ bí mật vai trò của mình!`, { color: st.c || 0x5865f2, thumbnail: { url: TW(st.cp || "1f3ad") }, fields });
  }
  lobbyEmbed(s) {
    const n = s.players.length, ready = s.players.filter(p => p.ready).length;
    const host = s.players.find(p => p.id === s.hostId)?.name || "Người chơi";
    const list = s.players.map(p => `${p.id === s.hostId ? "👑" : "▫️"} ${mention(p.id)} ${p.ready ? "✅" : "⏳"}`).join("\n");
    return { author: { name: "NEXUS • Ma Sói" }, title: "🐺 Đang tạo phòng Ma Sói", color: 0x5865f2, thumbnail: { url: TW("1f43a") },
      description: `Dân làng đang tụ họp quanh đống lửa...\nBấm **Tham gia** để vào phòng và **Sẵn sàng** khi bạn đã chuẩn bị.\n\n${list}`,
      fields: [
        { name: "👥 Thành viên", value: `${bar(n, MAX)}\n**${n}/${MAX}**`, inline: true },
        { name: "✅ Sẵn sàng", value: `${bar(ready, n)}\n**${ready}/${n}**`, inline: true },
        { name: "⏳ Tự hủy", value: `<t:${Math.floor((s.createdAt + 5 * 60 * 1000) / 1000)}:R>`, inline: true },
        { name: "📜 Điều kiện bắt đầu", value: `Có từ **${MIN}** người trở lên và ít nhất **${MIN}** người bấm Sẵn sàng.` },
      ],
      footer: { text: `Chủ phòng: ${host} • Tối đa ${MAX} người` }, timestamp: new Date().toISOString() };
  }
  startEmbed(s) {
    const list = s.players.map((p, i) => `\`${String(i + 1).padStart(2, "0")}\` ${mention(p.id)}`).join("\n");
    return { author: { name: "NEXUS • Ma Sói" }, title: "🐺 Trò chơi bắt đầu!", color: 0xed4245, thumbnail: { url: TW("1f43a") },
      description: "Đêm đầu tiên sắp buông xuống...\nHãy kiểm tra **tin nhắn riêng** từ bot để biết vai trò của bạn.",
      fields: [
        { name: `👥 Người chơi (${s.players.length})`, value: list.slice(0, 1024) },
        { name: "⏱️ Nhịp ván", value: "🌙 Đêm **30s** • 🗣️ Thảo luận **60s** • 🗳️ Bỏ phiếu **30s**" },
        { name: "🪙 Phần thưởng", value: "Phe thắng **+200** • Phe thua **+10** Token Cá 🪙" },
      ],
      footer: { text: "Chúc mọi người chơi vui vẻ!" }, timestamp: new Date().toISOString() };
  }
  buttons(rows) { return rows; }
  button(label, custom_id, style = 1, disabled = false) { return { type: 2, style, label, custom_id, disabled }; }
  select(custom_id, placeholder, options, min_values = 1, max_values = 1) { return { type: 3, custom_id, placeholder, min_values, max_values, options: options.slice(0, 25) }; }
  targetOptions(s, actorId, allowSelf = false) {
    return s.players.filter(p => p.alive && (allowSelf || p.id !== actorId)).map(p => ({ label: safe(p.name).slice(0, 95), value: p.id, description: "Người chơi còn sống" }));
  }
  async create(b) {
    const current = await this.get();
    if (current && current.status !== "ended") return { ok: false, error: "already_exists" };
    if (!b.guildId || !b.hostId || !b.channelId || !b.applicationId || !b.interactionToken) return { ok: false, error: "bad_request" };
    const now = Date.now();
    const s = { guildId: b.guildId, channelId: b.channelId, applicationId: b.applicationId, interactionToken: b.interactionToken, messageId: null, hostId: b.hostId, players: [{ id: b.hostId, name: safe(b.hostName), ready: false, alive: true }], status: "lobby", phase: "lobby", createdAt: now, night: 0, day: 0, actions: {}, votes: {}, lastGuard: null, witch: { save: true, poison: true }, elderDisabled: false, cubDied: false, lovers: [], loversCrossTeam: false, pendingDeaths: [], pendingConversion: [], timers: {} };
    await this.save(s); await this.state.storage.setAlarm(now + 5 * 60 * 1000);
    return { ok: true, response: this.lobbyPayload(s) };
  }
  lobbyPayload(s) {
    const ready = s.players.filter(p => p.ready).length;
    const desc = `👥 Thành viên: **${s.players.length}/${MAX}**\n✅ Sẵn sàng: **${ready}/${s.players.length}**\n\nCần ít nhất **${MIN} người**. Phòng tự hủy sau **5 phút** nếu chưa bắt đầu.`;
    const prefix = `ms:${s.guildId}:`;
    return { embeds: [this.lobbyEmbed(s)], components: [{ type: 1, components: [this.button("Tham gia", prefix + "join", 3), this.button("Rời khỏi", prefix + "leave", 2), this.button("Sẵn sàng", prefix + "ready", 1), this.button("Hủy phòng", prefix + "cancel", 4)] }] };
  }
  async interaction(b) {
    const d = b.data || {}, id = b.member?.user?.id || b.user?.id;
    const s = await this.get();
    if (!s || s.status === "ended") return { ok: false, message: "Phòng này không còn hoạt động." };
    if (b.message?.id && !s.messageId) s.messageId = b.message.id;
    const custom = d.custom_id || "";
    const parts = custom.split(":");
    const action = parts.slice(2).join(":");
    const vals = d.values || [];
    const player = s.players.find(p => p.id === id);
    if (s.status === "lobby") {
      if (action === "join") {
        if (s.players.some(p => p.id === id)) return { ok: false, message: "Bạn đã ở trong phòng rồi." };
        if (s.players.length >= MAX) return { ok: false, message: "Phòng đã đủ 25 người." };
        const u = b.member?.user || b.user || {};
        s.players.push({ id, name: safe(u.global_name || u.username), ready: false, alive: true });
      } else if (action === "leave") {
        const i = s.players.findIndex(p => p.id === id); if (i < 0) return { ok: false, message: "Bạn chưa ở trong phòng." };
        s.players.splice(i, 1);
        if (!s.players.length) {
          await this.editLobby(s, { ...this.embed("⌛ Phòng Ma Sói đã đóng", "Không còn người chơi trong phòng."), components: [] });
          await this.endRoom(s); return { ok: true, message: "Phòng đã tự hủy vì không còn người chơi." };
        }
        if (s.hostId === id) s.hostId = s.players[0].id;
      } else if (action === "ready") {
        const p = s.players.find(p => p.id === id); if (!p) return { ok: false, message: "Bạn chưa tham gia phòng." };
        p.ready = true;
      } else if (action === "cancel") {
        let admin = false;
        try { admin = (BigInt(b.member?.permissions || "0") & 8n) === 8n; } catch {}
        if (id !== s.hostId && !admin) return { ok: false, message: "Chỉ chủ phòng hoặc Admin/Owner mới được hủy." };
        await this.editLobby(s, { ...this.embed("❌ Phòng Ma Sói đã bị hủy", "Chủ phòng hoặc quản trị viên đã hủy phòng."), components: [] });
        await this.endRoom(s); return { ok: true, message: "Đã hủy phòng." };
      }
      if (s.players.length >= MIN && (s.players.filter(p => p.ready).length >= MIN || s.players.every(p => p.ready))) {
        await this.save(s); await this.startGame(s); return { ok: true, message: "Đã đủ người sẵn sàng. Trò chơi bắt đầu!" };
      }
      await this.save(s); await this.editLobby(s, this.lobbyPayload(s)); return { ok: true, message: "Đã cập nhật phòng." };
    }
    if (action === "vote_skip" && s.phase === "vote" && player?.alive) { s.votes[id] = "skip"; await this.save(s); return { ok: true, message: "Đã bỏ phiếu trống." }; }
    if (action === "vote" && s.phase === "vote" && player?.alive && vals.length) { s.votes[id] = vals[0]; await this.save(s); return { ok: true, message: "Đã ghi nhận phiếu." }; }
    if (action.startsWith("role:")) {
      const roleAction = action.split(":")[1];
      if (!player || (!player.alive && !(roleAction === "hunter" && s.phase === "hunter" && s.pendingHunter === id))) return { ok: false, message: "Bạn không còn quyền thực hiện hành động này." };
      if (roleAction === "cupid" && s.phase === "night_actions" && player.role === ROLE.CUPID && vals.length === 2 && s.night === 1 && !s.lovers.length) {
        s.lovers = vals; const a = s.players.find(p => p.id === vals[0]), c = s.players.find(p => p.id === vals[1]);
        const aWolf = a && [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(a.role);
        const cWolf = c && [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(c.role);
        const aVillage = a && teamOf(a.role) === "village";
        const cVillage = c && teamOf(c.role) === "village";
        s.loversCrossTeam = !!((aWolf && cVillage) || (cWolf && aVillage));
        await this.save(s); await this.dm(a.id, this.embed("💞 Bạn đã trở thành Cặp Đôi", `Người còn lại: ${mention(c.id)}. Nếu một người chết, người kia cũng sẽ chết.`));
        await this.dm(c.id, this.embed("💞 Bạn đã trở thành Cặp Đôi", `Người còn lại: ${mention(a.id)}. Nếu một người chết, người kia cũng sẽ chết.`));
        return { ok: true, message: "Đã ghép đôi." };
      }
      if (roleAction === "guard" && s.phase === "night_actions" && !s.elderDisabled && player.role === ROLE.GUARD && vals[0]) {
        if (vals[0] === s.lastGuard) return { ok: false, message: "Bạn không thể bảo vệ cùng một người hai đêm liên tiếp." };
        s.actions.guard = vals[0];
      } else if (roleAction === "seer" && s.phase === "night_actions" && !s.elderDisabled && player.role === ROLE.SEER && vals[0]) {
        if (s.actions.seer) return { ok: false, message: "Đêm nay bạn đã soi rồi." };
        s.actions.seer = vals[0];
        const target = s.players.find(p => p.id === vals[0]);
        const team = target ? (teamOf(target.role) === "wolves" || teamOf(target.role) === "solo_wolf" ? "Phe Sói" : teamOf(target.role) === "third" ? "Phe Thứ 3" : "Phe Dân") : "không rõ";
        await this.dm(id, this.embed("🔮 Kết quả Tiên Tri", `${mention(vals[0])} thuộc **${team}**.`));
      } else if (roleAction === "wolf" && s.phase === "night_actions" && [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(player.role) && vals[0]) {
        if (!vals.every(v => { const t = s.players.find(x => x.id === v); return t && t.alive && !isWolfRole(t.role); })) return { ok: false, message: "Sói không được cắn đồng đội hoặc người đã chết." };
        s.actions.wolf ||= {}; s.actions.wolf[id] = vals.slice(0, s.doubleBite ? 2 : 1);
      } else if (roleAction === "witch_poison" && s.phase === "witch" && !s.elderDisabled && player.role === ROLE.WITCH && s.witch.poison && vals[0]) {
        s.actions.poison = vals[0]; s.witch.poison = false;
      } else if (roleAction === "vote" && s.phase === "vote" && vals.length) {
        s.votes[id] = vals[0];
      } else if (roleAction === "hunter" && s.phase === "hunter" && s.pendingHunter === id && vals[0]) {
        s.pendingShot = vals[0];
      } else return { ok: false, message: "Hành động không hợp lệ hoặc đã hết thời gian." };
      await this.save(s); return { ok: true, message: "Đã ghi nhận lựa chọn của bạn." };
    }
    if (action === "witch_save" && s.phase === "witch" && !s.elderDisabled && player?.alive && player.role === ROLE.WITCH && s.witch.save) {
      s.actions.save = true; s.witch.save = false; await this.save(s); return { ok: true, message: "Bạn đã dùng bình Cứu." };
    }
    if (action === "witch_skip" && s.phase === "witch" && player?.alive && player.role === ROLE.WITCH) { s.actions.witchSkip = true; await this.save(s); return { ok: true, message: "Đã bỏ qua." }; }
    return { ok: false, message: "Lựa chọn không hợp lệ." };
  }
  async startGame(s) {
    s.status = "starting"; s.phase = "starting"; s.startStep = "open";
    await this.save(s); await this.state.storage.setAlarm(Date.now() + 200);
  }
  async abortStart(s, text) {
    s.status = "ended"; s.phase = "ended";
    await this.state.storage.deleteAlarm();
    await this.editLobby(s, { ...this.embed("⚠️ Không thể bắt đầu Ma Sói", `${text}\n\nPhòng đã được đóng. Hãy bật *Cho phép tin nhắn riêng từ thành viên server* rồi gõ /masoi để tạo phòng mới.`), components: [] });
    await this.state.storage.put("room", s);
  }
  async startStep(s) {
    // Bước 1: mở kênh tin nhắn riêng cho tất cả người chơi
    if (s.startStep === "open") {
      for (const p of s.players) {
        p.dmChannelId = await this.openDM(p.id);
        if (!p.dmChannelId) return this.abortStart(s, `Bot không mở được tin nhắn riêng với ${mention(p.id)}.`);
      }
      s.startStep = "roles"; await this.save(s); await this.state.storage.setAlarm(Date.now() + 200); return;
    }
    // Bước 2: chia vai và gửi vai trò. Nếu có người không nhận được thì hủy cả ván (không ai bị thiếu vai)
    const roles = assignRoles(s.players.length);
    s.players.forEach((p, i) => { p.role = roles[i]; p.team = teamOf(p.role); p.alive = true; p.ready = false; p.elderLives = p.role === ROLE.ELDER ? 2 : 1; });
    for (const p of s.players) {
      const wolves = s.players.filter(x => isWolfRole(x.role) && x.id !== p.id).map(x => mention(x.id));
      const ok = await this.dm(p.id, this.roleCard(p, wolves));
      if (!ok) return this.abortStart(s, `Bot không gửi được vai trò cho ${mention(p.id)} (đã tắt tin nhắn riêng).`);
    }
    s.status = "playing"; s.phase = "starting"; s.startStep = null;
    await this.save(s);
    const list = s.players.map((p, i) => `${i + 1}. ${mention(p.id)}`).join("\n");
    await this.editLobby(s, { embeds: [this.startEmbed(s)], components: [] });
    await this.startNight(s);
  }
  async startNight(s) {
    if (s.status !== "playing") return;
    s.night++; s.phase = "night_actions"; s.actions = {}; s.votes = {}; s.pendingDeaths = []; s.pendingHunter = null;
    const converted = [];
    for (const p of s.players) if (p.pendingConvert) { p.role = ROLE.WOLF; p.team = "wolves"; p.pendingConvert = false; converted.push(p); }
    if (s.lovers.length === 2) {
      const [aId, bId] = s.lovers, a = s.players.find(p => p.id === aId), b = s.players.find(p => p.id === bId);
      const aWolf = a && [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(a.role);
      const bWolf = b && [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(b.role);
      const aVillage = a && teamOf(a.role) === "village", bVillage = b && teamOf(b.role) === "village";
      s.loversCrossTeam = !!((aWolf && bVillage) || (bWolf && aVillage));
    }
    await this.save(s);
    for (const p of converted) {
      const pack = s.players.filter(x => [ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(x.role) && x.id !== p.id).map(x => mention(x.id));
      await this.dm(p.id, this.embed("🌑 Lời nguyền đã thức tỉnh", `Bạn đã chuyển thành **Ma Sói**. Đồng đội: ${pack.join(", ") || "Không có"}.`));
    }
    await this.sendChannel(s, this.embed(`🌙 Ban đêm đã buông xuống (Đêm ${s.night})`, "Cả làng chìm vào giấc ngủ... 🌌\nCác vai trò có kỹ năng hãy kiểm tra **tin nhắn riêng** và chọn hành động.", { fields: [{ name: "⏳ Hết đêm", value: eta(30), inline: true }, { name: "👥 Còn sống", value: `**${s.players.filter(p => p.alive).length}**/${s.players.length}`, inline: true }], footer: foot(s) }));
    const living = s.players.filter(p => p.alive);
    for (const p of living) {
      let action = null, opts = this.targetOptions(s, p.id);
      if (p.role === ROLE.CUPID && s.night === 1) action = this.select(`ms:${s.guildId}:role:cupid`, "Chọn 2 người làm Cặp Đôi", opts, 2, 2);
      else if (!s.elderDisabled && p.role === ROLE.GUARD) action = this.select(`ms:${s.guildId}:role:guard`, "Chọn người cần bảo vệ", opts.filter(o => o.value !== s.lastGuard));
      else if ([ROLE.WOLF, ROLE.CUB, ROLE.LONE_WOLF].includes(p.role)) action = this.select(`ms:${s.guildId}:role:wolf`, "Bầy Sói chọn người cắn", opts.filter(o => !isWolfRole(s.players.find(x => x.id === o.value)?.role)), 1, s.doubleBite ? 2 : 1);
      else if (!s.elderDisabled && p.role === ROLE.SEER) action = this.select(`ms:${s.guildId}:role:seer`, "Chọn người muốn soi", opts);
      const tip = { [ROLE.CUPID]: "Chọn **2 người** để ghép thành Cặp Đôi.", [ROLE.GUARD]: "Chọn người bạn muốn bảo vệ đêm nay (không được chọn lại người đã bảo vệ đêm trước).", [ROLE.SEER]: "Chọn người bạn muốn soi (mỗi đêm chỉ soi **1 lần**)." }[p.role] || `Chọn người bầy Sói sẽ cắn đêm nay.${s.doubleBite ? "\n⚠️ Sói Con đã chết: đêm nay được cắn **2 người**." : ""}`;
const rs = ROLE_STYLE[p.role] || {};
if (action) await this.dm(p.id, { ...this.embed(`🌙 Đêm ${s.night} — Lượt của ${p.role}`, tip, { color: rs.c || 0x312e81, thumbnail: { url: TW(rs.cp || "1f319") }, fields: [{ name: "⏳ Hết giờ", value: eta(30), inline: true }], footer: foot(s) }), components: [{ type: 1, components: [action] }] });
    }
    await this.state.storage.setAlarm(Date.now() + ms(30));
  }
  async beginWitch(s) {
    s.phase = "witch";
    const wolfVotes = Object.values(s.actions.wolf || {}); const counts = {};
    wolfVotes.flat().forEach(id => counts[id] = (counts[id] || 0) + 1);
    const ranked = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const victims = [];
    for (let i = 0; i < (s.doubleBite ? 2 : 1) && ranked[i]; i++) {
      if (ranked[i + 1] && ranked[i][1] === ranked[i + 1][1]) break;
      victims.push(ranked[i][0]);
    }
    s.wolfVictims = victims.filter(id => id !== s.actions.guard);
    s.doubleBite = false;
    const victim = s.wolfVictims[0] || null;
    s.lastGuard = s.actions.guard || null;
    const witch = s.players.find(p => p.alive && p.role === ROLE.WITCH && !s.elderDisabled);
    s.wolfVictim = victim;
    if (witch) {
      const desc = s.wolfVictims.length ? `Bầy Sói đã chọn cắn: ${s.wolfVictims.map(mention).join(", ")}. Bạn có thể dùng bình Cứu cho mục tiêu đầu tiên hoặc bình Độc.` : "Đêm nay không có mục tiêu Sói cắn rõ ràng. Bạn vẫn có thể dùng bình Độc.";
      const comps = [];
      if (victim && s.witch.save) comps.push(this.button("Dùng bình Cứu", `ms:${s.guildId}:witch_save`, 3));
      if (s.witch.poison) comps.push(this.button("Bỏ qua bình Độc", `ms:${s.guildId}:witch_skip`, 2));
      const rows = [];
      if (comps.length) rows.push({ type: 1, components: comps });
      const poisonTargets = this.targetOptions(s, witch.id);
      if (s.witch.poison && poisonTargets.length) rows.push({ type: 1, components: [this.select(`ms:${s.guildId}:role:witch_poison`, "Chọn người muốn đầu độc", poisonTargets)] });
      await this.dm(witch.id, { ...this.embed("🧪 Lượt của Phù Thủy", desc, { fields: [{ name: "💊 Bình Cứu", value: s.witch.save ? "Còn" : "Đã dùng", inline: true }, { name: "☠️ Bình Độc", value: s.witch.poison ? "Còn" : "Đã dùng", inline: true }, { name: "⏳ Hết giờ", value: eta(15), inline: true }] }), components: rows });
    }
    await this.save(s); await this.state.storage.setAlarm(Date.now() + ms(15));
  }
  async resolveNight(s) {
    const dead = [];
    const victims = [...(s.wolfVictims || (s.wolfVictim ? [s.wolfVictim] : []))];
    if (s.actions.save && victims.length) victims.shift();
    for (const targetId of victims) {
      const p = s.players.find(x => x.id === targetId && x.alive);
      if (p?.role === ROLE.ELDER && p.elderLives > 1) p.elderLives--;
      else if (p?.role === ROLE.CURSED) p.pendingConvert = true;
      else if (p) dead.push({ id: p.id, cause: "wolf" });
    }
    if (s.actions.poison) dead.push({ id: s.actions.poison, cause: "poison" });
    for (const d of dead) await this.kill(s, d.id, d.cause);
    await this.resolveDeaths(s);
    if (s.status !== "playing" || s.phase === "hunter") { await this.save(s); return; }
    await this.completeNight(s);
  }
  async completeNight(s) {
    if (s.status !== "playing") return;
    const seer = s.players.find(p => p.alive && p.role === ROLE.SEER);
    if (seer && s.actions.seer) { /* result was sent when chosen */ }
    const msg = s.players.filter(p => !p.alive && p.diedThisNight).map(p => `${mention(p.id)} đã không thể thức dậy nữa.`);
    await this.sendChannel(s, this.embed("☀️ Trời sáng rồi, mọi người thức dậy đi!", msg.length ? `💀 Có người đã không thể thức dậy được nữa:\n${msg.join("\n")}` : "🌅 Trời sáng nhưng không ai phải ra đi.", { footer: foot(s) }));
    s.players.forEach(p => { p.diedThisNight = false; });
    if (await this.checkWin(s)) return;
    s.day++; s.phase = "discussion"; await this.save(s);
    await this.sendChannel(s, this.embed(`🗣️ Thảo luận ngày ${s.day}`, "Mọi người có **60 giây** để thảo luận và tìm ra Ma Sói. 🔎", { fields: [{ name: "⏳ Hết giờ thảo luận", value: eta(60) }, ...rosterFields(s)], footer: foot(s) }));
    await this.state.storage.setAlarm(Date.now() + ms(60));
  }
  async kill(s, id, cause) {
    const p = s.players.find(x => x.id === id && x.alive); if (!p) return;
    p.alive = false; p.deathCause = cause; p.diedThisNight = cause === "wolf" || cause === "poison" || cause === "hunter_night";
    if (p.role === ROLE.CUB) s.cubDied = true;
    if (p.role === ROLE.ELDER && (cause === "lynch" || cause === "poison")) {
      s.elderDisabled = true;
      for (const special of s.players.filter(x => x.alive && [ROLE.SEER, ROLE.GUARD, ROLE.WITCH, ROLE.HUNTER].includes(x.role))) {
        await this.dm(special.id, this.embed("⚠️ Năng lực Dân Làng bị vô hiệu", "Già Làng đã bị treo cổ hoặc đầu độc. Kỹ năng đặc biệt của phe Dân không thể sử dụng từ thời điểm này."));
      }
    }
    if (s.lovers.includes(id)) { const partner = s.lovers.find(x => x !== id); if (partner) { const lp = s.players.find(x => x.id === partner && x.alive); if (lp) { lp.alive = false; lp.deathCause = "lover"; lp.diedThisNight = p.diedThisNight; if (lp.role === ROLE.CUB) s.cubDied = true; } } }
  }
  async resolveDeaths(s) {
    const hunter = !s.elderDisabled ? s.players.find(p => !p.alive && p.role === ROLE.HUNTER && !p.hunterUsed) : null;
    if (hunter && s.status === "playing") {
      hunter.hunterUsed = true; s.phase = "hunter"; s.pendingHunter = hunter.id; s.pendingShot = null;
      const targets = this.targetOptions(s, hunter.id);
      await this.dm(hunter.id, targets.length
        ? { content: "🏹 Bạn đã bị loại! Hãy chọn một người chơi để kéo theo trong 15 giây.", components: [{ type: 1, components: [this.select(`ms:${s.guildId}:role:hunter`, "Chọn người kéo theo", targets)] }] }
        : { content: "🏹 Bạn đã bị loại, nhưng không còn người chơi sống để lựa chọn." });
      await this.save(s); await this.state.storage.setAlarm(Date.now() + ms(15)); return;
    }
  }
  async finishHunter(s) {
    if (s.pendingShot) {
      const cause = s.resumeAfterHunter === "vote" ? "hunter_day" : "hunter_night";
      await this.kill(s, s.pendingShot, cause);
      await this.sendChannel(s, this.embed("🏹 Lựa chọn cuối cùng của Thợ Săn", `Thợ Săn đã kéo theo ${mention(s.pendingShot)}.`));
    }
    s.pendingHunter = null; s.pendingShot = null; s.phase = "resolving";
    await this.resolveDeaths(s);
    if (s.status !== "playing" || s.phase === "hunter") return;
    const resume = s.resumeAfterHunter || "night"; s.resumeAfterHunter = null;
    if (resume === "vote") {
      await this.sendChannel(s, this.embed("⚖️ Kết quả bỏ phiếu", s.lastLynchedId ? `${mention(s.lastLynchedId)} đã nhận nhiều phiếu nhất nên đã bị treo cổ.` : "Người chơi đã bị treo cổ."));
      await this.summary(s);
      if (await this.checkWin(s)) return;
      if (s.cubDied) { s.doubleBite = true; s.cubDied = false; }
      await this.startNight(s);
    } else await this.completeNight(s);
  }
  async beginVote(s) {
    s.phase = "vote"; s.votes = {};
    const alive = s.players.filter(p => p.alive);
    const options = alive.map(p => ({ label: safe(p.name).slice(0, 95), value: p.id, description: "Người chơi còn sống" }));
    await this.sendChannel(s, { ...this.embed("🗳️ Bỏ phiếu treo cổ", "Chọn người bạn nghi là Ma Sói. Phiếu là **ẩn danh** và bạn có thể **đổi phiếu** trước khi hết giờ. Nút Skip dùng để bỏ phiếu trống.", { fields: [{ name: "⏳ Hết giờ bỏ phiếu", value: eta(30), inline: true }, { name: "🟢 Được bỏ phiếu", value: `**${alive.length}** người`, inline: true }], footer: foot(s) }), components: [
      { type: 1, components: [this.select(`ms:${s.guildId}:vote`, "[ Chọn người để treo cổ ]", options)] },
      { type: 1, components: [this.button("Bỏ phiếu trống (Skip)", `ms:${s.guildId}:vote_skip`, 2)] },
    ] });
    await this.save(s); await this.state.storage.setAlarm(Date.now() + ms(30));
  }
  async finishVote(s) {
    const counts = {}; Object.entries(s.votes).forEach(([voter, target]) => { if (s.players.some(p => p.id === voter && p.alive)) counts[target] = (counts[target] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
    const tally = sorted.map(([id, c]) => `${id === "skip" ? "⏭️ Bỏ phiếu trống" : mention(id)} — **${c}** phiếu`).join("\n") || "Chưa có ai bỏ phiếu.";
    if (sorted.length && sorted[0][0] !== "skip" && (!sorted[1] || sorted[0][1] > sorted[1][1])) {
      const target = s.players.find(p => p.id === sorted[0][0] && p.alive);
      if (target?.role === ROLE.JESTER) return this.finishGame(s, "Kẻ Chán Đời", [target.id]);
      if (target) {
        await this.kill(s, target.id, "lynch");
        s.lastLynchedId = target.id;
        await this.resolveDeaths(s);
        if (s.phase === "hunter") { s.resumeAfterHunter = "vote"; await this.save(s); return; }
      }
      await this.sendChannel(s, this.embed("⚖️ Kết quả bỏ phiếu", `${mention(sorted[0][0])} đã nhận nhiều phiếu nhất nên đã bị treo cổ. 🪢`, { fields: [{ name: "📊 Số phiếu", value: tally.slice(0, 1024) }] }));
    } else await this.sendChannel(s, this.embed("⚖️ Kết quả bỏ phiếu", "Không ai bị treo cổ (Skip hoặc hòa phiếu). 🕊️", { fields: [{ name: "📊 Số phiếu", value: tally.slice(0, 1024) }] }));
    if (s.status !== "playing") return;
    await this.summary(s);
    if (await this.checkWin(s)) return;
    if (s.cubDied) { s.doubleBite = true; s.cubDied = false; }
    await this.startNight(s);
  }
  async summary(s) {
    const living = s.players.filter(p => p.alive).map(p => mention(p.id)).join(", ") || "Không còn ai";
    const dead = s.players.filter(p => !p.alive).map(p => mention(p.id)).join(", ") || "Chưa có";
    await this.sendChannel(s, this.embed(`📊 TỔNG KẾT NGÀY ${s.day}:`, `🟢 Người sống: ${living}\n🔴 Người chết: ${dead}`, { fields: [{ name: "👥 Tình hình làng", value: `${bar(s.players.filter(p => p.alive).length, s.players.length)}  **${s.players.filter(p => p.alive).length}/${s.players.length}** còn sống` }], footer: foot(s) }));
  }
  async checkWin(s) {
    const alive = s.players.filter(p => p.alive);
    const solo = alive.find(p => p.role === ROLE.LONE_WOLF);
    if (solo && alive.length === 1) { await this.finishGame(s, "Sói Cô Độc", [solo.id]); return true; }
    if (s.loversCrossTeam && s.lovers.length === 2 && s.lovers.every(id => alive.some(p => p.id === id)) && alive.length === 2) { await this.finishGame(s, "Cặp Đôi", s.lovers); return true; }
    const wolves = alive.filter(p => [ROLE.WOLF, ROLE.CUB].includes(p.role));
    const loneWolves = alive.filter(p => p.role === ROLE.LONE_WOLF);
    const nonwolves = alive.filter(p => ![ROLE.WOLF, ROLE.CUB].includes(p.role));
    const pendingCursed = alive.some(p => p.pendingConvert);
    if (!wolves.length && !loneWolves.length && !pendingCursed) { await this.finishGame(s, "Dân Làng", s.players.filter(p => p.team === "village").map(p => p.id)); return true; }
    if (wolves.length && wolves.length >= nonwolves.length) { await this.finishGame(s, "Ma Sói", s.players.filter(p => [ROLE.WOLF, ROLE.CUB].includes(p.role)).map(p => p.id)); return true; }
    return false;
  }
  async finishGame(s, teamName, winners) {
    if (s.status === "ended") return;
    if (s.status !== "settling") {
      s.status = "settling"; s.phase = "settling"; s.endTeam = teamName; s.winnerIds = winners; s.settleStartedAt = Date.now();
      await this.state.storage.setAlarm(Date.now() + 5000); await this.save(s);
    }
    teamName = s.endTeam || teamName; winners = s.winnerIds || winners;
    const winnerSet = new Set(winners);
    const gameId = `${s.guildId}:${s.createdAt}`;
    const linesWin = [], linesLoss = [];
    const dayStart = Math.floor((Date.now() + VN_OFFSET) / DAY_MS) * DAY_MS - VN_OFFSET;
    const ids = s.players.map(p => p.id);
    const capRows = await this.env.DB.prepare(`SELECT user_id, COUNT(*) AS n FROM transactions WHERE type = 'masoi' AND created_at >= ? AND created_at < ? AND user_id IN (${ids.map(() => "?").join(",")}) GROUP BY user_id`).bind(dayStart, s.settleStartedAt || Date.now(), ...ids).all();
    const played = Object.fromEntries((capRows.results || []).map(r => [r.user_id, r.n]));
    for (const p of s.players) {
      let amount = 0, win = winnerSet.has(p.id);
      const capped = (played[p.id] || 0) >= MAX_REWARD_GAMES_PER_DAY;
      amount = win ? 200 : 10;
      if (capped) {
        (win ? linesWin : linesLoss).push(`${mention(p.id)}: ${p.role} (+0 Token Cá 🪙 — đã đạt giới hạn ${MAX_REWARD_GAMES_PER_DAY} ván thưởng hôm nay)`);
      } else if (amount) {
        await this.env.DB.prepare("INSERT OR IGNORE INTO users (id, name, avatar, balance, created_at) VALUES (?, ?, NULL, 0, ?)").bind(p.id, p.name, Date.now()).run();
        await this.env.DB.batch([
          this.env.DB.prepare("INSERT OR IGNORE INTO masoi_payouts (game_id, user_id, amount) VALUES (?, ?, ?)").bind(gameId, p.id, amount),
          this.env.DB.prepare("UPDATE users SET balance = balance + ? WHERE id = ? AND changes() > 0").bind(amount, p.id),
          this.env.DB.prepare("INSERT INTO transactions (user_id, amount, type, note, created_at) SELECT ?, ?, 'masoi', ?, ? WHERE changes() > 0").bind(p.id, amount, win ? "Thưởng thắng Ma Sói" : "Thưởng cống hiến Ma Sói", Date.now()),
        ]);
        (win ? linesWin : linesLoss).push(`${mention(p.id)}: ${p.role} (+${amount} Token Cá 🪙)`);
      }
    }
    const desc = `🏆 CHIẾN THẮNG THUỘC VỀ ${teamName.toUpperCase()}!\n\n🎉 Người thắng (+200 Token Cá 🪙):\n${linesWin.join("\n") || "Không có"}\n\n🎖️ Thưởng cống hiến (+10 Token Cá 🪙):\n${linesLoss.join("\n") || "Không có"}`;
    if (!s.resultMessageSent) {
      await this.sendChannel(s, this.embed("🏆 Ma Sói — Kết thúc ván", desc, { footer: { text: `Ván kéo dài ${s.night} đêm • ${s.players.length} người chơi • Cảm ơn mọi người đã chơi!` } }));
      s.resultMessageSent = true; await this.save(s);
    }
    await this.state.storage.deleteAlarm();
    await this.state.storage.put("room", { ...s, status: "ended", phase: "ended", finishedAt: Date.now() });
  }
  async endRoom(s) { await this.state.storage.deleteAlarm(); await this.state.storage.delete("room"); }
  alarm() {
    const task = this.queue.then(() => this.onAlarm());
    this.queue = task.catch(() => {});
    return task;
  }
  async onAlarm() {
    const s = await this.get(); if (!s || s.status === "ended") return;
    if (s.status === "settling") return this.finishGame(s, s.endTeam, s.winnerIds || []);
    if (s.status === "starting") return this.startStep(s);
    if (s.phase === "lobby") {
      const deadline = s.createdAt + 5 * 60 * 1000;
      if (Date.now() < deadline) { await this.state.storage.setAlarm(deadline); return; }
      await this.editLobby(s, { ...this.embed("⌛ Phòng Ma Sói đã tự hủy", "Không đủ người hoặc chưa bắt đầu trong 5 phút."), components: [] }); await this.endRoom(s); return;
    }
    if (s.phase === "night_actions") return this.beginWitch(s);
    if (s.phase === "witch") return this.resolveNight(s);
    if (s.phase === "hunter") return this.finishHunter(s);
    if (s.phase === "discussion") return this.beginVote(s);
    if (s.phase === "vote") return this.finishVote(s);
  }
}
