/**
 * 敏感词过滤模块
 * 用于检测和过滤不适合青少年的内容
 */

// 敏感词库 - 按类别分组
const sensitiveWords = {
    // 低俗词汇
    obscene: [
        "色情", "黄色", "裸体", "情色", "露骨", "成人", "性感",
        "诱惑", "调戏", "勾引", "少妇", "激情", "情欲", "荷尔蒙",
        // 英文低俗词汇
        "porn", "pornography", "nude", "naked", "sexual", "sexy", 
        "adult content", "erotic", "seductive", "horny", "kinky",
        "xxx", "explicit", "lewd", "indecent"
    ],
    
    // 暴力词汇
    violence: [
        "血腥", "暴力", "杀戮", "残忍", "屠杀", "鲜血", "伤亡",
        "虐待", "殴打", "恐怖", "尸体", "血液", "自杀", "枪支", "武器", "刀具",
        // 英文暴力词汇
        "violence", "kill", "murder", "bloody", "cruel", "brutal", 
        "slaughter", "torture", "abuse", "suicide", "weapon", "gun", 
        "knife", "pistol", "sword", "blood", "corpse", "gore"
    ],
    
    // 不良思想
    badIdeas: [
        "毒品", "吸毒", "抽烟", "酗酒", "赌博", "作弊", "偷窃", "欺骗",
        "谎言", "反动", "歧视", "侮辱", "仇恨", "背叛", "霸凌",
        // 英文不良思想
        "drugs", "weed", "cocaine", "heroin", "meth", "ecstasy", "lsd",
        "smoking", "gambling", "cheating", "stealing", "theft", "racism",
        "discrimination", "hate", "betrayal", "bullying"
    ],
    
    // 脏话和辱骂
    profanity: [
        // 中文脏话和辱骂
        "他妈的", "妈的", "操", "日", "草", "艹", "狗屎", "滚蛋",
        "傻逼", "傻b", "煞笔", "二逼", "二b", "神经病", "脑残",
        "白痴", "蠢货", "畜生", "贱", "贱人", "混蛋", "王八蛋", 
        "狗娘养的", "废物", "蠢材", "笨蛋", "猪脑子", "猪头", "蠢猪",
        // 常见变形和谐音
        "我靠", "我艹", "卧槽", "woc", "tmd", "尼玛", "泥马", "你妈",
        "cnm", "爆菊", "JB", "鸡鸡", "丁丁", "小鸡鸡",
        // 英文脏话
        "fuck", "shit", "damn", "bitch", "asshole", "cunt", "dick",
        "bastard", "pussy", "whore", "slut", "piss", "bullshit", "wtf",
        "stfu", "fk", "fck", "f*ck", "s*it", "a**hole", "b*tch",
        "jerk", "idiot", "stupid", "dumb", "moron", "retard", "crap"
    ],
    
    // 歧视词汇
    discrimination: [
        // 中文歧视词汇
        "黑鬼", "死基佬", "娘炮", "娘娘腔", "土鳖", "乡巴佬",
        "屌丝", "穷鬼", "外地人", "民工", "死胖子", "智障",
        // 英文歧视词汇
        "nigger", "chink", "spic", "wetback", "fag", "faggot",
        "tranny", "retard", "cripple", "midget", "gypsy"
    ],
    
    // 其他不适内容
    other: [
        "恐怖", "胆小", "噩梦", "鬼怪", "阴森", "惊吓",
        "不健康", "消极", "负面", "丑陋", "猥琐", "打死", "亲嘴", "枪", "AK47", "比基尼", "帅哥", "美女",
        "刀", "杀", "血", "隐私", "胸罩", "内裤", "幼女", "屎", "尿", "屁", "死", "死人", "尸体", "尸体",
        "暗区突围", "初音", "墓", "变态", "恐怖", "绝地求生", "原神", "崩坏", "崩坏3", "崩坏2", "崩坏4", "崩坏5", "崩坏6", "崩坏7", "崩坏8", "崩坏9", "崩坏10",
        // 英文不适内容
        "terror", "nightmare", "ghost", "ugly", "creepy", "SB",
        "negative", "scary", "spooky", "unhealthy", "disgusting"
    ]
};

// 自定义敏感词（将由后端加载）
let customSensitiveWords = {};

// 合并所有敏感词为一个数组
const allSensitiveWords = Object.values(sensitiveWords).flat();

/**
 * 获取敏感词分组信息
 * @returns {Object} - 敏感词分组
 */
function getSensitiveWordsGroups() {
    // 保留内置敏感词的优先级，防止被自定义敏感词覆盖
    console.log('获取敏感词分组，内置词库分类数量:', Object.keys(sensitiveWords).length);
    console.log('获取敏感词分组，自定义词库分类数量:', Object.keys(customSensitiveWords).length);
    
    // 创建一个新对象，先复制内置敏感词，确保内置敏感词的优先级
    const combined = { ...sensitiveWords };
    
    // 添加自定义敏感词，如果分类已存在则合并词汇列表，而不是直接覆盖
    for (const category in customSensitiveWords) {
        if (combined[category]) {
            // 如果分类已存在，合并词汇并确保唯一性
            const allWords = [...combined[category], ...customSensitiveWords[category]];
            combined[category] = [...new Set(allWords)]; // 去重
            console.log(`合并敏感词分类 ${category}，词汇总数: ${combined[category].length}`);
        } else {
            // 如果分类不存在，直接添加
            combined[category] = customSensitiveWords[category];
            console.log(`添加新敏感词分类 ${category}，词汇数: ${combined[category].length}`);
        }
    }
    
    return combined;
}

/**
 * 加载自定义敏感词
 * @returns {Promise} - 加载完成的Promise
 */
async function loadCustomSensitiveWords() {
    try {
        // 获取ArtServerClient实例
        let artClient;
        if (window.queueManager && window.queueManager.artClient) {
            artClient = window.queueManager.artClient;
        } else if (window.artClient) {
            artClient = window.artClient;
        } else {
            if (typeof ArtServerClient !== 'function') {
                console.log('ArtServerClient类不存在，仅使用内置敏感词');
                return Promise.resolve();
            }
            artClient = new ArtServerClient();
            window.artClient = artClient;
        }

        // 构建API URL - 使用公共API
        const serverUrl = artClient.serverUrl || '${serverUrl}';
        const apiUrl = `${serverUrl}/api/custom_sensitive_words`;

        console.log(`正在加载自定义敏感词: ${apiUrl}`);
        
        // 发送请求获取自定义敏感词
        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                credentials: 'same-origin'
            });

            if (!response.ok) {
                console.warn(`加载自定义敏感词失败: ${response.status} ${response.statusText}`);
                // 尝试读取错误详情
                try {
                    const errorText = await response.text();
                    console.warn('错误详情:', errorText);
                } catch (e) {
                    console.warn('无法读取错误详情');
                }
                return Promise.resolve();
            }

            // 解析响应
            const result = await response.json();
            console.log('自定义敏感词API响应:', result);
            
            if (result.status === 'success' && result.data) {
                customSensitiveWords = {};
                
                // 处理所有敏感词分类（公共API已经只返回激活的分类）
                result.data.forEach(category => {
                    if (category.words && category.words.length > 0) {
                        customSensitiveWords[category.category] = category.words;
                    }
                });
                
                console.log('成功加载自定义敏感词:', customSensitiveWords);
            } else {
                console.warn('获取自定义敏感词数据格式有误:', result);
            }
        } catch (fetchError) {
            console.warn('加载自定义敏感词时网络错误:', fetchError);
        }
    } catch (error) {
        console.warn('加载自定义敏感词时出错:', error);
    }
    
    // 不管成功与否，都标记为已完成
    console.log('自定义敏感词加载完成');
    return Promise.resolve();
}

/**
 * 检测文本中是否含有敏感词
 * @param {string} text - 要检测的文本
 * @returns {Object} - 检测结果，包含是否含有敏感词和找到的敏感词列表
 */
function checkSensitiveWords(text) {
    console.log('开始检测敏感词，文本长度:', text ? text.length : 0);
    
    // 如果文本为空，直接返回安全
    if (!text || text.trim() === '') {
        console.log('文本为空，跳过检测');
        return { 
            safe: true, 
            words: [],
            categories: []
        };
    }
    
    // 转换为小写以忽略大小写
    const lowerText = text.toLowerCase();
    
    // 存储找到的敏感词
    const foundWords = [];
    // 存储敏感词所属的类别
    const categories = [];
    
    // 获取合并后的敏感词分组
    const allGroups = getSensitiveWordsGroups();
    console.log('获取敏感词分组完成，分类数量:', Object.keys(allGroups).length);
    
    // 检测每个分类的敏感词
    for (const category in allGroups) {
        const wordsInCategory = allGroups[category];
        if (!wordsInCategory || wordsInCategory.length === 0) {
            console.warn(`分类 ${category} 没有词汇，跳过检测`);
            continue;
        }
        
        console.log(`检测分类 ${category}，词汇数: ${wordsInCategory.length}`);
        
        // 先检测内置敏感词库
        if (sensitiveWords[category]) {
            for (const word of sensitiveWords[category]) {
                if (lowerText.includes(word.toLowerCase()) && !foundWords.includes(word)) {
                    console.log(`从内置词库检测到敏感词: ${word} (分类: ${category})`);
                    foundWords.push(word);
                    if (!categories.includes(category)) {
                        categories.push(category);
                    }
                }
            }
        }
        
        // 再检测自定义敏感词库（如果没有与内置重复）
        if (customSensitiveWords[category]) {
            for (const word of customSensitiveWords[category]) {
                if (lowerText.includes(word.toLowerCase()) && !foundWords.includes(word)) {
                    console.log(`从自定义词库检测到敏感词: ${word} (分类: ${category})`);
                    foundWords.push(word);
                    if (!categories.includes(category)) {
                        categories.push(category);
                    }
                }
            }
        }
    }
    
    console.log('敏感词检测完成，找到敏感词数量:', foundWords.length);
    
    return {
        safe: foundWords.length === 0,
        words: foundWords,
        categories: categories
    };
}

/**
 * 获取敏感词警告消息
 * @param {Array} categories - 触发的敏感词类别
 * @returns {string} - 警告消息
 */
function getSensitiveWordWarning(categories) {
    if (!categories || categories.length === 0) return "请文明用语，否则将被禁用！";
    
    const categoryMessages = {
        obscene: "低俗内容",
        violence: "暴力相关内容",
        badIdeas: "不良思想",
        profanity: "脏话或不文明用语",
        discrimination: "歧视性言论",
        other: "不适当内容"
    };
    
    // 返回统一的警告，不再展示具体敏感词类别
    return "请文明用语，否则将被禁用！";
}

/**
 * 调用后端API检查敏感词并记录
 * @param {string} text - 要检测的文本
 * @param {string} studentId - 学生ID
 * @param {boolean} skipLogging - 是否跳过记录（默认为false，确保记录敏感词）
 * @returns {Promise<Object>} - 敏感词检测结果
 */
async function checkSensitiveWordsAPI(text, studentId, skipLogging = false) {
    try {
        if (!text) {
            return { 
                safe: true, 
                words: [],
                status: 'success',
                message: '无文本内容',
                shouldBlock: false
            };
        }

        // 获取ArtServerClient实例
        let artClient;
        if (window.queueManager && window.queueManager.artClient) {
            artClient = window.queueManager.artClient;
        } else if (window.artClient) {
            artClient = window.artClient;
        } else {
            if (typeof ArtServerClient !== 'function') {
                console.error('ArtServerClient类不存在，无法调用敏感词检测API');
                return { 
                    safe: false, 
                    words: [],
                    status: 'error',
                    message: 'ArtServerClient不可用',
                    shouldBlock: true
                };
            }
            artClient = new ArtServerClient();
            window.artClient = artClient;
        }

        // 先进行本地检测
        const localResult = checkSensitiveWords(text);

        // 构建API URL
        const serverUrl = artClient.serverUrl || '${serverUrl}';
        const apiUrl = `${serverUrl}/api/check_sensitive_words`;

        console.log(`正在调用敏感词检测API: ${apiUrl}，本地检测结果:`, localResult);
        
        // 发送请求，包含前端检测到的敏感词和类别
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                student_id: studentId,
                skip_logging: skipLogging,
                words: localResult.words,
                categories: localResult.categories
            })
        });

        if (!response.ok) {
            console.error('敏感词检测API调用失败:', response.statusText);
            return { 
                safe: localResult.safe, // 使用本地检测结果
                words: localResult.words,
                categories: localResult.categories,
                status: 'error',
                message: `API调用失败: ${response.statusText}`,
                shouldBlock: !localResult.safe // 如果本地检测不安全，仍然阻止
            };
        }

        // 解析响应
        const result = await response.json();
        console.log('敏感词检测API结果:', result);

        // 转换API返回结果为统一格式
        return {
            safe: result.safe === true,
            words: result.words || [],
            categories: result.categories || [],
            status: result.status || 'unknown',
            message: result.message || '敏感词检测完成',
            temp_count: result.temp_count,
            total_count: result.total_count,
            shouldBlock: result.should_block || !result.safe // 如果服务器未返回should_block但不安全，也应该阻止
        };
    } catch (error) {
        console.error('调用敏感词检测API时出错:', error);
        
        // 如果API调用失败，回退到本地检测结果
        const localResult = checkSensitiveWords(text);
        return { 
            safe: localResult.safe,
            words: localResult.words, 
            categories: localResult.categories,
            status: 'error',
            message: `调用API出错: ${error.message}`,
            shouldBlock: !localResult.safe // 如果本地检测不安全，应该阻止
        };
    }
}

// 创建敏感词过滤器对象
window.sensitiveWordsFilter = {
    // 检查文本是否包含敏感词 - 本地检测版本
    checkLocal: function(text) {
        return checkSensitiveWords(text);
    },
    
    // 检查文本是否包含敏感词 - 调用后端API版本
    check: async function(text, skipLogging = false) {
        try {
            // 先进行本地检测
            const localResult = checkSensitiveWords(text);
            
            // 如果本地检测是安全的，直接返回
            if (localResult.safe) {
                return {
                    safe: true, 
                    words: [],
                    status: 'success',
                    message: '无敏感词',
                    shouldBlock: false
                };
            }
            
            // 如果不安全，调用API进行检测和记录
            const studentId = localStorage.getItem('studentId');
            if (!studentId) {
                console.warn('未找到学生ID，无法记录敏感词使用');
                // 即使没有学生ID，也应该阻止生成
                if (typeof showFriendlyAlert === 'function') {
                    showFriendlyAlert(`检测到敏感词 "${localResult.words.join('、')}"，请修改后再试！`);
                } else {
                    alert(`检测到敏感词 "${localResult.words.join('、')}"，请修改后再试！`);
                }
                return {
                    ...localResult,
                    status: 'error',
                    message: '检测到敏感词，请修改后再试',
                    shouldBlock: true  // 设置阻止标志
                };
            }
            
            // 调用API检测
            const result = await checkSensitiveWordsAPI(text, studentId, skipLogging);
            
            // 检测到敏感词，显示警告并阻止生成
            if (!result.safe) {
                const warningMessage = `检测到敏感词 "${result.words.join('、')}"，请修改后再试！`;
                console.warn(warningMessage);
                
                if (typeof showFriendlyAlert === 'function') {
                    showFriendlyAlert(warningMessage);
                } else {
                    alert(warningMessage);
                }
                
                // 添加阻止标志
                return {
                    ...result,
                    shouldBlock: true
                };
            }
            
            return {
                ...result,
                shouldBlock: false
            };
        } catch (error) {
            console.error('敏感词检测失败:', error);
            return { 
                safe: false, 
                words: [], 
                message: error.message,
                status: 'error',
                shouldBlock: true  // 出错时也阻止生成
            };
        }
    },
    
    // 加载自定义敏感词
    loadCustomWords: loadCustomSensitiveWords,
    
    // 获取敏感词分组
    getGroups: getSensitiveWordsGroups,
    
    // 获取警告信息
    getWarning: getSensitiveWordWarning,
    
    // 所有敏感词数组
    allWords: allSensitiveWords
};

/**
 * 检查用户敏感词配额
 * @returns {Promise<boolean>} 是否允许用户提交请求
 */
async function checkSensitiveWordQuota() {
    try {
        const studentId = localStorage.getItem('studentId');
        if (!studentId) {
            console.error('未找到学生ID，无法检查用户状态');
            return false; // 无法检查时默认拒绝请求
        }

        // 获取ArtServerClient实例
        let artClient;
        if (window.queueManager && window.queueManager.artClient) {
            console.log('使用queueManager中的artClient实例');
            artClient = window.queueManager.artClient;
        } else if (window.artClient) {
            console.log('使用全局artClient实例');
            artClient = window.artClient;
        } else {
            console.log('创建新的ArtServerClient实例');
            // 确保ArtServerClient类存在
            if (typeof ArtServerClient !== 'function') {
                console.error('ArtServerClient类不存在，无法检查用户状态');
                return false; // 找不到类时拒绝请求，确保安全
            }
            artClient = new ArtServerClient();
            // 临时保存到全局，以便后续使用
            window.artClient = artClient;
        }

        // 直接使用fetch进行API调用
        console.log('正在检查用户状态...');
        const serverUrl = artClient.serverUrl || '${serverUrl}';
        const response = await fetch(`${serverUrl}/api/check_sensitive_quota`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                student_id: studentId
            })
        });

        if (!response.ok) {
            console.error('检查用户状态失败:', response.statusText);
            return false; // 请求失败时默认拒绝，确保安全
        }

        const userData = await response.json();
        console.log('用户状态信息:', userData);

        // 先检查响应状态是否出错
        if (userData.status === 'error') {
            console.error('获取用户状态出错:', userData.message);
            return false; // 出错时默认拒绝，确保安全
        }

        // 检查用户是否被允许使用
        if (!userData.allowed) {
            const message = `您暂时无法使用此功能。${userData.reason ? `原因: ${userData.reason}` : ''}`;
            
            if (typeof showFriendlyAlert === 'function') {
                showFriendlyAlert(message);
            } else {
                alert(message);
            }
            
            console.error(`用户 ${studentId} 不允许使用:`, userData);
            return false;
        }

        // 额外检查 - 用户是否被暂停或处于非活动状态
        if (userData.is_suspended || userData.user_status === 'inactive' || userData.user_status === 'banned') {
            const reason = userData.reason || '您的账户已被暂停或停用';
            if (typeof showFriendlyAlert === 'function') {
                showFriendlyAlert(reason);
            } else {
                alert(reason);
            }
            console.error(`用户 ${studentId} 状态异常:`, userData);
            return false;
        }

        console.log(`用户 ${studentId} 状态正常，允许请求`);
        return true; // 允许提交请求
    } catch (error) {
        console.error('检查用户状态时出错:', error);
        return false; // 出错时默认拒绝，确保安全
    }
}

// 确保window.checkSensitiveWordQuota全局可用
window.checkSensitiveWordQuota = checkSensitiveWordQuota;

// 在页面加载完成后执行初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('敏感词检查模块已加载，初始化分类数量:', Object.keys(sensitiveWords).length);
    console.log('敏感词库内置词汇数量:', allSensitiveWords.length);
    
    // 确保内置敏感词库正确初始化
    const internalSensitiveWords = Object.values(sensitiveWords).flat();
    console.log('验证内置敏感词库是否可用:', internalSensitiveWords.length > 0 ? '可用' : '不可用');
    
    // 尝试加载自定义敏感词
    window.sensitiveWordsFilter.loadCustomWords()
        .then(() => {
            console.log('自定义敏感词加载完成，自定义分类数量:', Object.keys(customSensitiveWords).length);
            
            // 手动触发一次检测以验证敏感词功能是否正常工作
            const testResult = checkSensitiveWords('黄色 暴力 测试');
            console.log('敏感词测试结果:', testResult);
        })
        .catch(error => {
            console.warn('加载自定义敏感词出错:', error);
            
            // 即使自定义敏感词加载失败，也应该能正常使用内置敏感词
            const testResult = checkSensitiveWords('黄色 暴力 测试');
            console.log('使用内置敏感词测试结果:', testResult);
        });
});

// 修改生成图片函数，添加检测到的敏感词信息
// 这是一个修改的建议函数，需要根据实际情况集成到生成图片的函数中
async function checkPromptAndGenerate(prompt, chinesePrompt, options = {}) {
    try {
        // 确保窗口对象存在
        if (typeof window === 'undefined') return false;
        
        console.log('检查提示词是否包含敏感词...');
        
        // 本地检测敏感词
        const result = await window.sensitiveWordsFilter.check(prompt || chinesePrompt, true);
        console.log('敏感词检测结果:', result);
        
        // 如果检测到敏感词，但仍然允许提交（在特定情况下）
        if (!result.safe) {
            // 获取检测到的敏感词信息，将在请求中传递
            const sensitiveWords = result.words || [];
            const sensitiveCategories = result.categories || [];
            
            // 设置敏感词信息到请求选项中
            options.sensitive_words = sensitiveWords;
            options.sensitive_categories = sensitiveCategories;
            
            // 向用户显示警告消息
            const warningMessage = `警告：检测到敏感词 (${sensitiveWords.join(', ')})。`;
            console.warn(warningMessage);
            
            // 如果有用户友好的警告函数，调用它
            if (typeof showFriendlyAlert === 'function') {
                showFriendlyAlert(warningMessage);
            }
        }
        
        // 返回请求选项，包含敏感词信息
        return options;
    } catch (error) {
        console.error('检查提示词出错:', error);
        return options; // 出错时也返回原始选项
    }
}

// 导出该函数，使其在全局可用
window.checkPromptAndGenerate = checkPromptAndGenerate; 