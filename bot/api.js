const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

// Lấy các cấu hình từ .env hoặc config.js của bạn
const LINK4M_API_TOKEN = process.env.LINK4M_API_TOKEN || '';
const LINKVERTISE_ID = process.env.LINKVERTISE_ID || '';
const BASE_URL = process.env.BASE_URL || 'https://nexus-dashboard.pages.dev'; // Domain web/cloudflare của bạn

module.exports = function(app, db, client) {
    
    // 1. API Tạo Link Rút Gọn (Link4m / Linkvertise)
    app.post('/api/link/generate', async (req, res) => {
        try {
            const { userId, provider } = req.body;
            if (!userId || !provider) {
                return res.status(400).json({ success: false, error: 'Thiếu thông tin userId hoặc provider!' });
            }

            // Tạo session token ngẫu nhiên độc nhất
            const sessionToken = crypto.randomBytes(32).toString('hex');

            // Lưu phiên vào Database với trạng thái 'pending'
            db.run(
                `INSERT INTO link_sessions (user_id, session_token, provider) VALUES (?, ?, ?)`,
                [userId, sessionToken, provider],
                async (err) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'Lỗi cơ sở dữ liệu khi tạo phiên.' });
                    }

                    // Đường dẫn callback trả về khi user vượt link xong
                    const callbackUrl = `${BASE_URL}/api/link/verify?token=${sessionToken}`;
                    let shortUrl = '';

                    try {
                        if (provider === 'link4m') {
                            if (!LINK4M_API_TOKEN) return res.status(500).json({ success: false, error: 'Chưa cấu hình API Token Link4m!' });
                            
                            const response = await axios.get(`https://link4m.co/api?api=${LINK4M_API_TOKEN}&url=${encodeURIComponent(callbackUrl)}`);
                            if (response.data && response.data.status === 'success') {
                                shortUrl = response.data.shortenedUrl;
                            } else {
                                return res.status(500).json({ success: false, error: 'Không thể rút gọn link từ Link4m.' });
                            }
                        } else if (provider === 'linkvertise') {
                            if (!LINKVERTISE_ID) return res.status(500).json({ success: false, error: 'Chưa cấu hình Linkvertise ID!' });
                            
                            // Cấu trúc Linkvertise Direct Link
                            shortUrl = `https://linkvertise.com/${LINKVERTISE_ID}/nexus-reward?r=${encodeURIComponent(callbackUrl)}`;
                        } else {
                            return res.status(400).json({ success: false, error: 'Nhà cung cấp link không hợp lệ.' });
                        }

                        res.json({ success: true, shortUrl });
                    } catch (apiErr) {
                        console.error('Lỗi gọi API bên thứ ba:', apiErr.message);
                        res.status(500).json({ success: false, error: 'Lỗi kết nối tới dịch vụ rút gọn link.' });
                    }
                }
            );
        } catch (error) {
            console.error('Lỗi /api/link/generate:', error);
            res.status(500).json({ success: false, error: 'Lỗi Server.' });
        }
    });

    // 2. API Xác thực Callback sau khi vượt link xong
    app.get('/api/link/verify', (req, res) => {
        const { token } = req.query;
        if (!token) {
            return res.status(400).send('<h3>Lỗi: Thiếu mã xác thực phiên!</h3>');
        }

        // Kiểm tra token có tồn tại và đang ở trạng thái pending không
        db.get(`SELECT * FROM link_sessions WHERE session_token = ? AND status = 'pending'`, [token], (err, session) => {
            if (err || !session) {
                return res.send(`
                    <script>
                        alert('⚠️ Liên kết này không hợp lệ, đã hết hạn hoặc đã được sử dụng trước đó!');
                        window.location.href = '/wallet.html';
                    </script>
                `);
            }

            // Đánh dấu session đã hoàn thành (Chống spam / chia sẻ lại link)
            db.run(`UPDATE link_sessions SET status = 'completed' WHERE session_token = ?`, [token]);

            // Đảm bảo user tồn tại trong bảng users, sau đó cộng 2000 Token Cá và +1 link_count
            db.run(
                `INSERT INTO users (user_id, tokens, link_count) VALUES (?, 2000, 1) 
                 ON CONFLICT(user_id) DO UPDATE SET tokens = tokens + 2000, link_count = link_count + 1`,
                [session.user_id],
                (err) => {
                    if (err) console.error('Lỗi cộng thưởng user:', err);

                    // Lấy số dư mới để gửi thông báo DM qua Discord Bot
                    db.get(`SELECT tokens FROM users WHERE user_id = ?`, [session.user_id], async (row) => {
                        const newBalance = row ? row.tokens : 2000;

                        try {
                            const discordUser = await client.users.fetch(session.user_id);
                            if (discordUser) {
                                await discordUser.send(
                                    `🎉 **Chúc mừng bạn đã vượt link thành công!**\n` +
                                    `🪙 Bạn đã nhận được **2,000 Token Cá** vào tài khoản.\n` +
                                    `💰 Số dư hiện tại của bạn là: **${newBalance.toLocaleString()} Token Cá**.\n` +
                                    `_Cảm ơn bạn đã đồng hành và ủng hộ dự án NEXUS! ❤️_`
                                );
                            }
                        } catch (dmErr) {
                            console.log(`Không thể gửi DM cho user ${session.user_id} (Có thể họ tắt DM):`, dmErr.message);
                        }
                    });
                }
            );

            // Phản hồi giao diện web thành công và chuyển hướng về trang ví
            res.send(`
                <html>
                    <head><title>Nhận Token Thành Công</title></head>
                    <body style="background: #0f172a; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h2>🎉 Vượt link thành công!</h2>
                        <p>Bạn đã nhận được <b>2,000 Token Cá 🪙</b>. Bot Discord đã gửi tin nhắn xác nhận cho bạn.</p>
                        <p>Đang chuyển hướng về trang ví...</p>
                        <script>
                            setTimeout(() => { window.location.href = '/wallet.html'; }, 3000);
                        </script>
                    </body>
                </html>
            `);
        });
    });
};
