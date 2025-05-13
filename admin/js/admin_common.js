/**
 * AI绘画平台 - 管理员共用函数
 */

// API基础URL - 动态获取API地址
const API_BASE_URL = (() => {
    // 尝试从localStorage获取配置的API地址
    const savedApiUrl = localStorage.getItem('api_base_url');
    if (savedApiUrl) return savedApiUrl;
    
    // 动态获取当前域名，自动配置API地址
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // 如果是在本地调试（localhost或127.0.0.1）
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return 'http://172.16.201.200:8080'; // 本地开发环境使用硬编码地址
    }
    
    // 生产环境：使用当前域名，API端口为8080
    return `http://${currentHost}:8080`;
})();

// 在控制台输出当前API基础地址，方便调试
console.log('当前API地址:', API_BASE_URL);

/**
 * 设置API基础URL
 * @param {string} url - 新的API地址
 */
function setApiBaseUrl(url) {
    if (url && url.trim() !== '') {
        localStorage.setItem('api_base_url', url);
        return true;
    }
    return false;
}

/**
 * 检查管理员登录状态
 * @returns {Promise} 返回Promise对象
 */
function checkAdminLogin() {
    return new Promise((resolve, reject) => {
        const token = localStorage.getItem('adminToken');
        
        if (!token) {
            reject('未登录');
            return;
        }
        
        $.ajax({
            url: `${API_BASE_URL}/api/admin/verify_token`,
            type: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                if (response.status === 'success') {
                    // 设置管理员名称
                    $('#adminName').text(localStorage.getItem('adminName') || '管理员');
                    resolve();
                } else {
                    localStorage.removeItem('adminToken');
                    reject('登录已过期');
                }
            },
            error: function() {
                localStorage.removeItem('adminToken');
                reject('验证失败');
            }
        });
    });
}

/**
 * 管理员登出
 */
function adminLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'admin_login.html';
}

/**
 * 显示登录错误消息
 * @param {string} message - 错误消息
 */
function showLoginError(message) {
    $('#loginAlert').text(message).fadeIn();
    setTimeout(function() {
        $('#loginAlert').fadeOut();
    }, 3000);
}

/**
 * 格式化时间戳为可读日期
 * @param {number} timestamp - 时间戳（秒）
 * @returns {string} 格式化后的日期字符串
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '未知时间';
    
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

/**
 * 显示成功消息
 * @param {string} message - 消息内容
 */
function showSuccess(message) {
    alert(message);
}

/**
 * 显示错误消息
 * @param {string} message - 错误消息
 */
function showError(message) {
    alert('错误: ' + message);
}

// 页面加载完成后执行
$(document).ready(function() {
    // 绑定退出按钮事件
    $('#logoutBtn').on('click', function() {
        adminLogout();
    });
}); 