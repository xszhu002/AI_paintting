/**
 * AI绘画平台用户名连接器
 * 此脚本用于将从学习平台获取的用户名发送到AI绘画平台
 */

// 配置AI绘画平台的URL（请替换为您的实际URL）
const AI_PLATFORM_URL = "http://your-ai-drawing-platform.com/api/set-username";

/**
 * 发送用户名到AI绘画平台
 * @param {string} username - 要发送的用户名
 * @returns {Promise} - 返回Promise对象，成功时包含响应数据
 */
async function sendUsernameToAIPlatform(username) {
    try {
        if (!username) {
            throw new Error("用户名不能为空");
        }

        const response = await fetch(AI_PLATFORM_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username }),
            credentials: 'include', // 如果需要跨域发送cookies
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("发送用户名时出错:", error);
        throw error;
    }
}

/**
 * 从本地存储保存用户信息
 * @param {string} username - 用户名
 * @param {Object} additionalInfo - 额外的用户信息
 */
function saveUserLocally(username, additionalInfo = {}) {
    const userInfo = {
        username,
        timestamp: new Date().toISOString(),
        ...additionalInfo
    };
    
    localStorage.setItem('aiPlatformUserInfo', JSON.stringify(userInfo));
    console.log("用户信息已本地保存:", userInfo);
}

/**
 * 获取本地保存的用户信息
 * @returns {Object|null} - 返回用户信息对象，如果不存在则返回null
 */
function getLocalUserInfo() {
    const userInfoStr = localStorage.getItem('aiPlatformUserInfo');
    return userInfoStr ? JSON.parse(userInfoStr) : null;
}

// 导出函数以便在其他脚本中使用
window.AIPlatformConnector = {
    sendUsername: sendUsernameToAIPlatform,
    saveUserLocally,
    getLocalUserInfo
}; 