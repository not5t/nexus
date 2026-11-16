// Lưu dữ liệu bằng SQLite có sẵn trong Node.js (node:sqlite), không cần cài thêm gì.
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "nexus.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    balance     INTEGER NOT NULL DEFAULT 0,
    last_daily  INTEGER NOT NULL DEFAULT 0,
    last_work   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    type        TEXT NOT NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user
    ON transactions (user_id, created_at);
`);

const KINDS = {
  daily: { column: "last_daily", cooldownMs: config.daily.cooldownMs },
  work: { column: "last_work", cooldownMs: config.work.cooldownMs },
};

function inTransaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function ensureUser(userId) {
  db.prepare(
    "INSERT OR IGNORE INTO users (id, balance, created_at) VALUES (?, 0, ?)"
  ).run(userId, Date.now());
}

function getBalance(userId) {
  const row = db.prepare("SELECT balance FROM users WHERE id = ?").get(userId);
  return row ? row.balance : 0;
}

// Nhận thưởng (daily/work): kiểm tra cooldown, cộng tiền, ghi lịch sử, tất cả trong 1 giao dịch.
function claimReward(userId, kind, amount, note) {
  const k = KINDS[kind];
  if (!k) throw new Error("Loại phần thưởng không hợp lệ: " + kind);

  return inTransaction(() => {
    ensureUser(userId);

    const row = db
      .prepare(`SELECT balance, ${k.column} AS last FROM users WHERE id = ?`)
      .get(userId);

    const now = Date.now();
    const availableAt = row.last + k.cooldownMs;
    if (availableAt > now) return { ok: false, availableAt };

    db.prepare(
      `UPDATE users SET balance = balance + ?, ${k.column} = ? WHERE id = ?`
    ).run(amount, now, userId);

    db.prepare(
      "INSERT INTO transactions (user_id, amount, type, note, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, amount, kind, note ?? null, now);

    return { ok: true, amount, balance: row.balance + amount };
  });
}

// Số liệu tổng hợp cho dashboard (không chứa thông tin cá nhân)
function getStats() {
  const users = db
    .prepare("SELECT COUNT(*) AS players, COALESCE(SUM(balance), 0) AS supply FROM users")
    .get();

  const since = Date.now() - 24 * 60 * 60 * 1000;
  const tx = db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS last24h
       FROM transactions`
    )
    .get(since);

  return {
    players: users.players,
    supply: users.supply,
    transactions: tx.total,
    transactions24h: tx.last24h,
  };
}

function getRecentTransactions(limit = 10) {
  return db
    .prepare(
      "SELECT user_id, amount, type, created_at FROM transactions ORDER BY id DESC LIMIT ?"
    )
    .all(limit);
}

// Ví cá nhân: chỉ dữ liệu của chính người đó
function getWallet(userId, limit = 20) {
  const now = Date.now();
  const user = db
    .prepare("SELECT balance, last_daily, last_work FROM users WHERE id = ?")
    .get(userId);
  const players = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const history = db
    .prepare(
      "SELECT type, amount, note, created_at AS at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(userId, limit);

  if (!user) {
    return { balance: 0, rank: null, players, dailyReadyInMs: 0, workReadyInMs: 0, history };
  }

  const pos = db
    .prepare("SELECT COUNT(*) + 1 AS pos FROM users WHERE balance > ?")
    .get(user.balance).pos;

  return {
    balance: user.balance,
    rank: pos,
    players,
    dailyReadyInMs: Math.max(0, user.last_daily + config.daily.cooldownMs - now),
    workReadyInMs: Math.max(0, user.last_work + config.work.cooldownMs - now),
    history,
  };
}

module.exports = { db, getBalance, claimReward, getStats, getRecentTransactions, getWallet };
