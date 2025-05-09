/**
 * AI绘画平台 - 管理员共用函数
 */

// API基础URL
const API_BASE_URL = 'http://172.16.201.200:8080';

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