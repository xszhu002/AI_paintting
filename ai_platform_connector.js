/**
 * AI绘画平台用户信息连接器
 * 此脚本用于从学习平台获取用户信息并提供给AI绘画平台
 */

// 配置目标页面URL列表
const USER_INFO_URLS = [
    "http://172.16.201.191/student/myinfo.aspx",
    "http://xxpt.bsd.cn/student/myinfo.aspx"
];
const AI_DRAWING_PLATFORM_URL = "http://172.16.201.200:8080";

// 添加一个标识符用于区分不同的登录用户
let currentUserToken = '';

/**
 * 获取学生信息
 * @param {boolean} forceRefresh - 是否强制刷新，忽略本地缓存
 * @returns {Promise} - 返回Promise对象，成功时包含用户信息对象{studentName, studentId}
 */
async function getStudentInfo(forceRefresh = false) {
    try {
        // 1. 尝试从页面获取最新信息
        console.log('尝试从页面获取学生信息...');
        
        // 先尝试直接获取
        const directInfo = await fetchStudentInfoDirectly();
        if (directInfo.studentName && directInfo.studentId) {
            return directInfo;
        }
        
        // 如果直接获取失败，尝试通过iframe获取
        try {
            const pageInfo = await fetchStudentInfoFromPage();
            if (pageInfo.studentName && pageInfo.studentId) {
                return pageInfo;
            }
        } catch (iframeError) {
            console.warn('从iframe获取信息失败:', iframeError);
        }
        
        // 2. 如果从页面获取失败且未强制刷新，尝试从localStorage获取
        if (!forceRefresh) {
            const savedStudentName = localStorage.getItem('studentName');
            const savedStudentId = localStorage.getItem('studentId');
            const savedUserToken = localStorage.getItem('userToken');
            
            if (savedStudentName && savedStudentId) {
                // 如果没有保存的token，或者token匹配，使用缓存信息
                if (!savedUserToken || !currentUserToken || savedUserToken === currentUserToken) {
                    console.log('从localStorage读取学生信息:', savedStudentName, savedStudentId);
                    return { 
                        studentName: savedStudentName, 
                        studentId: savedStudentId,
                        source: 'localStorage'
                    };
                } else {
                    console.log('localStorage中的用户信息与当前用户不匹配，不使用缓存');
                }
            }
        }
        
        // 如果都失败了，返回错误
        return { 
            studentName: null, 
            studentId: null, 
            error: '无法获取学生信息，请确保已登录学习平台' 
        };
    } catch (error) {
        console.error('获取学生信息失败:', error);
        return { studentName: null, studentId: null, error: error.message };
    }
}

/**
 * 从学生信息页面获取信息
 * @returns {Promise} - 返回Promise对象，包含学生信息
 */
function fetchStudentInfoFromPage() {
    return new Promise(async (resolve, reject) => {
        let lastError = null;
        
        // 依次尝试所有URL
        for (const url of USER_INFO_URLS) {
            try {
                console.log(`尝试通过iframe从 ${url} 获取信息...`);
                const result = await fetchFromSinglePage(url);
                if (result.studentName && result.studentId) {
                    // 成功获取信息，保存并返回
                    saveStudentInfo(result.studentName, result.studentId);
                    resolve(result);
                    return;
                }
            } catch (error) {
                console.warn(`通过iframe从 ${url} 获取信息失败:`, error);
                lastError = error;
                // 继续尝试下一个URL
            }
        }
        
        // 所有URL都尝试失败
        reject(lastError || new Error('所有页面均无法获取学生信息'));
    });
}

/**
 * 从单个URL获取学生信息
 * @param {string} url - 目标URL
 * @returns {Promise} - 包含学生信息的Promise
 */
function fetchFromSinglePage(url) {
    return new Promise((resolve, reject) => {
        try {
            // 创建一个隐藏的iframe
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = url;
            document.body.appendChild(iframe);
            
            // 设置超时 (8秒，给足够的加载时间)
            const timeoutId = setTimeout(() => {
                try {
                    document.body.removeChild(iframe);
                } catch (e) {}
                reject(new Error(`获取学生信息超时 (${url})`));
            }, 8000);
            
            // 等待iframe加载完成
            iframe.onload = function() {
                try {
                    clearTimeout(timeoutId);
                    
                    try {
                        // 尝试访问iframe内容，这可能会因为跨域限制而失败
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        
                        // 尝试从lblXm元素获取学生姓名
                        const nameElement = iframeDoc.getElementById('lblXm');
                        let studentName = nameElement ? nameElement.textContent.trim() : null;
                        
                        // 尝试从lblXh元素获取学号
                        const idElement = iframeDoc.getElementById('lblXh');
                        let studentId = idElement ? idElement.textContent.trim() : null;
                        
                        // 如果没有找到特定元素，尝试分析页面内容
                        if (!studentName || !studentId) {
                            // 查找可能包含学生信息的元素
                            const infoElements = iframeDoc.querySelectorAll('span, div, label, td');
                            
                            for (const el of infoElements) {
                                const text = el.textContent.trim();
                                
                                // 查找包含"姓名"的元素
                                if (!studentName && (text.includes('姓名') || el.id.toLowerCase().includes('xm'))) {
                                    // 尝试提取姓名
                                    const nameMatch = text.match(/姓名[：:]\s*([^\s,，。]+)/);
                                    if (nameMatch && nameMatch[1]) {
                                        studentName = nameMatch[1];
                                    } else if (text.length < 20 && !text.includes('：') && !text.includes(':')) {
                                        // 如果文本很短且不包含冒号，可能就是姓名本身
                                        studentName = text;
                                    }
                                }
                                
                                // 查找包含"学号"的元素
                                if (!studentId && (text.includes('学号') || el.id.toLowerCase().includes('xh'))) {
                                    // 尝试提取学号
                                    const idMatch = text.match(/学号[：:]\s*([0-9]+)/);
                                    if (idMatch && idMatch[1]) {
                                        studentId = idMatch[1];
                                    } else {
                                        // 尝试直接提取数字
                                        const numberMatch = text.match(/([0-9]{5,12})/);
                                        if (numberMatch && numberMatch[1]) {
                                            studentId = numberMatch[1];
                                        }
                                    }
                                }
                                
                                // 如果都找到了，就可以退出循环
                                if (studentName && studentId) break;
                            }
                        }
                        
                        if (studentName && studentId) {
                            console.log(`成功从 ${url} 获取学生信息:`, studentName, studentId);
                            
                            // 尝试移除iframe（放在try中防止出错）
                            try {
                                document.body.removeChild(iframe);
                            } catch (e) {}
                            
                            resolve({ 
                                studentName, 
                                studentId,
                                source: 'page'
                            });
                            return;
                        }
                    } catch (accessError) {
                        console.warn(`访问iframe内容时出错 (可能是跨域限制) (${url}):`, accessError);
                        // 跨域错误时不立即失败，继续后续尝试
                    }
                    
                    // 尝试移除iframe
                    try {
                        document.body.removeChild(iframe);
                    } catch (e) {}
                    
                    // 如果到这里还没有返回，说明没有获取到信息
                    console.warn(`无法从 ${url} 获取完整的学生信息`);
                    reject(new Error(`无法从 ${url} 获取完整的学生信息`));
                } catch (error) {
                    // 尝试移除iframe
                    try {
                        document.body.removeChild(iframe);
                    } catch (e) {}
                    
                    console.error(`分析iframe内容时出错 (${url}):`, error);
                    reject(error);
                }
            };
            
            // 处理iframe加载失败
            iframe.onerror = function() {
                clearTimeout(timeoutId);
                try {
                    document.body.removeChild(iframe);
                } catch (e) {}
                reject(new Error(`加载学生信息页面失败 (${url})`));
            };
        } catch (error) {
            console.error(`创建iframe时出错 (${url}):`, error);
            reject(error);
        }
    });
}

/**
 * 直接从远程页面获取学生信息
 * 通过向远程页面发送请求获取
 */
async function fetchStudentInfoDirectly() {
    let lastError = null;
    
    // 依次尝试所有URL
    for (const url of USER_INFO_URLS) {
        try {
            console.log(`尝试直接从 ${url} 获取学生信息...`);
            
            // 设置fetch超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            try {
                const response = await fetch(url, {
                    credentials: 'include', // 包含cookies
                    signal: controller.signal,
                    mode: 'cors' // 尝试跨域请求
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    console.warn(`HTTP错误: ${response.status} (${url})`);
                    continue; // 尝试下一个URL
                }
                
                const html = await response.text();
                
                // 解析HTML
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // 查找学生信息
                const lblXm = doc.getElementById('lblXm');
                const lblXh = doc.getElementById('lblXh');
                
                const studentName = lblXm ? lblXm.textContent.trim() : null;
                const studentId = lblXh ? lblXh.textContent.trim() : null;
                
                if (studentName && studentId) {
                    console.log(`直接从 ${url} 获取成功:`, studentName, studentId);
                    saveStudentInfo(studentName, studentId);
                    return { studentName, studentId, source: 'direct' };
                } else {
                    console.warn(`直接从 ${url} 获取学生信息失败，未找到ID元素`);
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    console.warn(`从 ${url} 获取信息超时`);
                } else {
                    console.warn(`从 ${url} 获取信息出错:`, fetchError);
                }
                lastError = fetchError;
            }
        } catch (error) {
            console.error(`直接从 ${url} 获取学生信息时出错:`, error);
            lastError = error;
        }
    }
    
    // 所有URL都尝试失败
    return { 
        studentName: null, 
        studentId: null, 
        error: lastError ? lastError.message : '无法从任何页面获取学生信息' 
    };
}

/**
 * 保存学生信息到本地存储
 * @param {string} studentName - 学生姓名
 * @param {string} studentId - 学生学号
 */
function saveStudentInfo(studentName, studentId) {
    if (studentName && studentId) {
        // 生成用户令牌（简单地使用姓名+学号的组合）
        currentUserToken = `${studentName}_${studentId}`;
        
        // 保存到localStorage
        localStorage.setItem('studentName', studentName);
        localStorage.setItem('studentId', studentId);
        localStorage.setItem('userToken', currentUserToken);
        localStorage.setItem('lastUpdated', new Date().toISOString());
        
        console.log('学生信息已保存至本地存储');
    }
}

/**
 * 从本地存储获取用户信息
 * @returns {Object|null} - 返回用户信息对象，如果不存在则返回null
 */
function getLocalStudentInfo() {
    const studentName = localStorage.getItem('studentName');
    const studentId = localStorage.getItem('studentId');
    const savedUserToken = localStorage.getItem('userToken');
    
    // 只检查是否有数据，不严格检查token匹配
    // 因为我们已经在getStudentInfo中进行了token检查
    if (studentName && studentId) {
        return { 
            studentName, 
            studentId, 
            source: 'localStorage',
            lastUpdated: localStorage.getItem('lastUpdated')
        };
    }
    
    return null;
}

/**
 * 清除存储的学生信息
 */
function clearStudentInfo() {
    localStorage.removeItem('studentName');
    localStorage.removeItem('studentId');
    localStorage.removeItem('userToken');
    localStorage.removeItem('lastUpdated');
    currentUserToken = '';
    console.log('学生信息已清除');
}

// 导出函数以便在其他脚本中使用
window.StudentInfoConnector = {
    getStudentInfo,
    fetchStudentInfoFromPage,
    fetchStudentInfoDirectly,
    getLocalStudentInfo,
    clearStudentInfo
}; 