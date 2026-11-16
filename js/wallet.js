/**
 * NEXUS - Wallet Frontend Script (js/wallet.js)
 * Quản lý hiển thị số dư, thông tin ví và cơ chế vượt link nhận Token Cá miễn phí.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Tải thông tin ví của người dùng khi load trang
    await loadWalletInfo();
    
    // 2. Gắn sự kiện cho các nút bấm kiếm token
    setupWalletEvents();
});

/**
 * Lấy thông tin tài khoản và số dư từ Backend
 */
async function loadWalletInfo() {
    try {
        const response = await fetch('/api/user/me', {
            method: 'GET',
            credentials: 'include' // Đảm bảo gửi kèm cookie session/Discord Auth
        });
        
        const data = await response.json();

        if (data.success && data.user) {
            // Lưu lại Discord ID để dùng khi tạo link vượt
            window.nexusUserId = data.user.user_id;

            // Cập nhật giao diện HTML (đảm bảo các element này có id tương ứng trong wallet.html)
            const tokenBalanceEl = document.getElementById('token-balance');
            const linkCountEl = document.getElementById('link-count');
            const usernameEl = document.getElementById('username');
            const avatarEl = document.getElementById('user-avatar');

            if (tokenBalanceEl) tokenBalanceEl.textContent = (data.user.tokens || 0).toLocaleString();
            if (linkCountEl) linkCountEl.textContent = (data.user.link_count || 0).toLocaleString();
            if (usernameEl) usernameEl.textContent = data.user.username || 'Thành viên NEXUS';
            if (avatarEl && data.user.avatar) {
                avatarEl.src = `https://cdn.discordapp.com/avatars/${data.user.user_id}/${data.user.avatar}.png`;
            }
        } else {
            console.warn('Người dùng chưa đăng nhập hoặc phiên đăng nhập hết hạn.');
            // Nếu chưa đăng nhập, hiển thị giá trị mặc định hoặc gợi ý đăng nhập
            const tokenBalanceEl = document.getElementById('token-balance');
            if (tokenBalanceEl) tokenBalanceEl.textContent = '0';
        }
    } catch (error) {
        console.error('Lỗi khi tải thông tin ví:', error);
    }
}

/**
 * Gắn sự kiện click cho các nút "Kiếm Token Cá"
 */
function setupWalletEvents() {
    const btnLink4m = document.getElementById('btn-link4m');
    const btnLinkvertise = document.getElementById('btn-linkvertise');

    if (btnLink4m) {
        btnLink4m.addEventListener('click', () => requestTokenLink('link4m'));
    }

    if (btnLinkvertise) {
        btnLinkvertise.addEventListener('click', () => requestTokenLink('linkvertise'));
    }
}

/**
 * Gửi yêu cầu tạo phiên link rút gọn tới Server
 * @param {string} provider - 'link4m' hoặc 'linkvertise'
 */
async function requestTokenLink(provider) {
    const userId = window.nexusUserId;

    // Kiểm tra xem user đã đăng nhập web chưa
    if (!userId) {
        alert('⚠️ Vui lòng đăng nhập bằng tài khoản Discord trên trang web trước khi nhận Token Cá miễn phí!');
        window.location.href = '/auth/discord'; // Đường dẫn đăng nhập Discord OAuth2 của bạn
        return;
    }

    // Lấy nút bấm tương ứng để hiệu ứng loading
    const buttonId = provider === 'link4m' ? 'btn-link4m' : 'btn-linkvertise';
    const btnElement = document.getElementById(buttonId);
    let originalText = '';

    if (btnElement) {
        originalText = btnElement.innerHTML;
        btnElement.disabled = true;
        btnElement.innerHTML = `⏳ Đang tạo liên kết ${provider.toUpperCase()}...`;
    }

    try {
        // Gọi API backend đã tích hợp
        const response = await fetch('/api/link/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId, provider })
        });

        const data = await response.json();

        if (data.success && data.shortUrl) {
            // Chuyển hướng người dùng sang trang vượt link
            window.location.href = data.shortUrl;
        } else {
            alert('❌ Không thể tạo liên kết: ' + (data.error || 'Lỗi hệ thống.'));
            resetButton(btnElement, originalText);
        }
    } catch (error) {
        console.error('Lỗi kết nối:', error);
        alert('❌ Lỗi kết nối tới máy chủ NEXUS. Vui lòng thử lại sau.');
        resetButton(btnElement, originalText);
    }
}

/**
 * Khôi phục trạng thái nút bấm nếu có lỗi
 */
function resetButton(btnElement, originalText) {
    if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = originalText;
    }
}
