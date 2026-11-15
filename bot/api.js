// API của NEXUS:
//   GET /api/stats  - số liệu tổng hợp, công khai
//   GET /api/me     - ví cá nhân, cần đăng nhập Discord (Authorization: Bearer <token>)
const http = require("node:http");
const config = require("./config");
const { getStats, getRecentTransactions, getWallet } = require("./db");

// Chỉ trang dashboard của bạn mới được đọc API từ trình duyệt
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://not5t.github.io";
const CACHE_MS = 10_000;

const AUTH_OK_MS = 5 * 60 * 1000;
const AUTH_FAIL_MS = 60 * 1000;
const AUTH_CACHE_MAX = 500;

let cache = { at: 0, body: null };
const authCache = new Map(); // token -> { until, result }

function buildStats(client) {
  const now = Date.now();
  if (cache.body && now - cache.at < CACHE_MS) return cache.body;

  const stats = getStats();
  const body = {
    bot: {
      online: client.isReady(),
      tag: client.user ? client.user.tag : null,
      pingMs: client.ws.ping,
      guilds: client.guilds.cache.size,
      uptimeSec: Math.floor(process.uptime()),
    },
    economy: {
      currency: `${config.currency.name} ${config.currency.emoji}`,
      ...stats,
    },
    // Ẩn danh: chỉ hiện 4 số cuối của ID
    recent: getRecentTransactions(10).map(tx => ({
      type: tx.type,
      amount: tx.amount,
      user: "…" + tx.user_id.slice(-4),
      at: tx.created_at,
    })),
    generatedAt: now,
  };

  cache = { at: now, body };
  return body;
}

function remember(token, result, ttlMs) {
  const now = Date.now();
  if (authCache.size >= AUTH_CACHE_MAX) {
    for (const [key, entry] of authCache) if (entry.until <= now) authCache.delete(key);
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
  }
  authCache.set(token, { until: now + ttlMs, result });
  return result;
}

// Hỏi Discord xem token này của ai, và có đúng là token cấp cho ứng dụng NEXUS không
async function authenticate(req) {
  const match = /^Bearer (\S{10,300})$/.exec(req.headers.authorization || "");
  if (!match) return { status: 401, error: "missing_token" };
  const token = match[1];

  const hit = authCache.get(token);
  if (hit && hit.until > Date.now()) return hit.result;

  const clientId = process.env.CLIENT_ID;
  if (!clientId) return { status: 500, error: "server_not_configured" };

  try {
    const res = await fetch("https://discord.com/api/v10/oauth2/@me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401) {
      return remember(token, { status: 401, error: "invalid_token" }, AUTH_FAIL_MS);
    }
    if (!res.ok) return { status: 502, error: "discord_unavailable" };

    const info = await res.json();

    if (!info.application || info.application.id !== clientId) {
      return remember(token, { status: 403, error: "wrong_application" }, AUTH_FAIL_MS);
    }
    if (!info.user || !info.user.id) {
      return remember(token, { status: 401, error: "no_identity" }, AUTH_FAIL_MS);
    }

    const expires = Date.parse(info.expires);
    const ttl = Math.min(AUTH_OK_MS, Number.isFinite(expires) ? expires - Date.now() : AUTH_OK_MS);
    return remember(token, { status: 200, userId: info.user.id }, Math.max(ttl, 0));
  } catch {
    return { status: 502, error: "discord_unavailable" };
  }
}

function startApi(client) {
  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer(async (req, res) => {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };

    if (req.headers.origin === ALLOWED_ORIGIN) {
      headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
      headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Authorization";
      headers["Access-Control-Max-Age"] = "600";
    }

    const send = (status, body) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      return res.end();
    }

    const { pathname } = new URL(req.url, "http://localhost");

    try {
      if (req.method === "GET" && pathname === "/api/stats") {
        return send(200, buildStats(client));
      }

      if (req.method === "GET" && pathname === "/api/health") {
        return send(200, { ok: true });
      }

      if (req.method === "GET" && pathname === "/api/me") {
        const auth = await authenticate(req);
        if (auth.status !== 200) return send(auth.status, { error: auth.error });

        return send(200, {
          currency: `${config.currency.name} ${config.currency.emoji}`,
          ...getWallet(auth.userId),
        });
      }

      send(404, { error: "Not found" });
    } catch (err) {
      console.error("Lỗi API:", err);
      send(500, { error: "Server error" });
    }
  });

  server.on("error", err => {
    // Lỗi API (ví dụ cổng bị chiếm) không được làm bot sập
    console.error(`❌ Không mở được API ở cổng ${port}:`, err.message);
  });

  server.listen(port, () => console.log(`🌐 API đang chạy ở cổng ${port}`));
  return server;
}

module.exports = { startApi };
