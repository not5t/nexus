// Thêm vào file bot/db.js hiện tại của bạn
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Kết nối database (giữ nguyên cấu trúc hiện tại của bạn)
const dbPath = path.resolve(__dirname, 'data/nexus.db'); // Hoặc đường dẫn DB hiện tại của bạn
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Lỗi kết nối SQLite:', err.message);
    else console.log('Đã kết nối cơ sở dữ liệu NEXUS.');
});

// Khởi tạo các bảng
db.serialize(() => {
    // Bảng users (nếu chưa có cột link_count và tokens, ta thêm vào)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        tokens INTEGER DEFAULT 0,
        link_count INTEGER DEFAULT 0
    )`);

    // Bảng lưu phiên vượt link tạm thời (Chống share link nhận thưởng bừa bãi)
    db.run(`CREATE TABLE IF NOT EXISTS link_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        session_token TEXT UNIQUE,
        provider TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

module.exports = db;
