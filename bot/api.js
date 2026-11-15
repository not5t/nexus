// API công khai (chỉ đọc) cho dashboard. Chỉ trả số liệu tổng hợp, không lộ thông tin cá nhân.
const http = require("node:http");
const config = require("./config");
const { getStats, getRecentTransactions } = require("./db");

// Chỉ trang dashboard của bạn mới được đọc API từ trình duyệt
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://not5t.github.io";
const CACHE_MS = 10_000;

let cache = { at: 0, body: null };

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

function startApi(client) {
  const port = Number(process.env.PORT) || 3000;

  const server = http.createServer((req, res) => {
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };

    if (req.headers.origin === ALLOWED_ORIGIN) {
      headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
      headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, headers);
      return res.end();
    }

    const { pathname } = new URL(req.url, "http://localhost");

    try {
      if (req.method === "GET" && pathname === "/api/stats") {
        res.writeHead(200, headers);
        return res.end(JSON.stringify(buildStats(client)));
      }

      if (req.method === "GET" && pathname === "/api/health") {
        res.writeHead(200, headers);
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      console.error("Lỗi API:", err);
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: "Server error" }));
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
