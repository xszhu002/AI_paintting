/**
 * 覆盖原有的generateImage函数，使用队列系统
 */

// 保存对原始generateImage函数的引用（如果已存在）
const originalGenerateImage = window.generateImage;

/**
 * 检查用户敏感词配额
 * @returns {Promise<boolean>} 是否允许用户提交请求
 */
async function checkSensitiveWordQuota() {
    try {
        const studentId = localStorage.getItem('studentId');
        if (!studentId) {
            console.error('未找到学生ID，无法检查敏感词配额');
            return true; // 无法检查时默认允许
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
                console.error('ArtServerClient类不存在，无法检查敏感词配额');
                return false; // 找不到类时拒绝请求，确保安全
            }
            artClient = new ArtServerClient();
            // 临时保存到全局，以便后续使用
            window.artClient = artClient;
        }

        // 直接使用fetch进行API调用，避免依赖artClient的方法
        console.log('正在检查用户敏感词配额...');
        const serverUrl = artClient.serverUrl || `http://${window.location.hostname}:8080`;
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
            console.error('检查敏感词配额失败:', response.statusText);
            return false; // 请求失败时默认拒绝，确保安全
        }

        const quotaData = await response.json();
        console.log('敏感词配额信息:', quotaData);

        if (quotaData.status === 'error') {
            console.error('获取敏感词配额出错:', quotaData.message);
            return false; // 出错时默认拒绝，确保安全
        }

        // 检查敏感词配额是否耗尽
        if (quotaData.sensitive_word_count === 0 || quotaData.temp_sensitive_count === 0) {
            const message = `您的敏感词配额已用完，无法继续使用。请联系管理员。\n(敏感词次数: ${quotaData.sensitive_word_count}, 临时配额: ${quotaData.temp_sensitive_count})`;
            
            if (typeof showFriendlyAlert === 'function') {
                showFriendlyAlert(message);
            } else {
                alert(message);
            }
            
            console.error(`用户 ${studentId} 的敏感词配额已用完:`, quotaData);
            return false; // 不允许提交请求
        }

        console.log(`用户 ${studentId} 的敏感词配额状态正常，允许请求`);
        return true; // 允许提交请求
    } catch (error) {
        console.error('检查敏感词配额时出错:', error);
        return false; // 出错时默认拒绝，确保安全
    }
}

/**
 * 新的generateImage函数，使用队列系统
 */
async function generateImage() {
    try {
        console.log("使用队列版本的generateImage函数");
        
        // 获取输入值
        const prompt = document.getElementById('prompt').value;
        
        // 如果用户没有输入描述，提示并返回
        if (!prompt.trim()) {
            if (typeof showFriendlyAlert === 'function') {
                showFriendlyAlert('请告诉AI你想画什么吧！');
            } else {
                alert('请告诉AI你想画什么吧！');
            }
            return;
        }
        
        // 检查用户状态
        if (typeof window.checkSensitiveWordQuota === 'function') {
            console.log('正在检查用户状态...');
            const userAllowed = await window.checkSensitiveWordQuota();
            if (!userAllowed) {
                console.log('用户状态检查未通过，已阻止请求');
                return;
            }
            console.log('用户状态检查通过，继续处理请求');
        } else {
            console.warn('找不到用户状态检查函数，跳过检查');
        }
        
        // 敏感词检查 - 使用API版本进行检测和记录
        if (window.sensitiveWordsFilter && typeof window.sensitiveWordsFilter.check === 'function') {
            console.log('正在进行敏感词检测...');
            const checkResult = await window.sensitiveWordsFilter.check(prompt, false); // 设置skipLogging=false确保记录敏感词
            
            if (!checkResult.safe) {
                // 高亮显示文本框提示有问题
                const promptInput = document.getElementById('prompt');
                if (promptInput) {
                    promptInput.classList.add('error-input');
                    setTimeout(() => {
                        promptInput.classList.remove('error-input');
                    }, 3000);
                }
                
                // 如果shouldBlock为true或状态是error，阻止生成
                if (checkResult.shouldBlock || checkResult.status === 'error') {
                    console.log('检测到敏感词，阻止生成请求:', checkResult);
                    return; // 直接返回，不继续生成图片
                }
                
                console.log('检测到敏感词，但未阻止生成:', checkResult);
            }
        }
        
        // 保存原始提示词输入，确保在整个流程中都能访问到中文提示词
        window.lastPromptInput = prompt;
        console.log('保存原始提示词输入:', window.lastPromptInput);
        
        // 获取其他参数值
        const width = document.getElementById('width').value || 1440;
        const height = document.getElementById('height').value || 1440;
        
        // 生成1到9999之间的随机整数作为神奇数字
        const randomSeed = Math.floor(Math.random() * 9999) + 1;
        
        // 更新隐藏的seed输入框的值
        const seedInput = document.getElementById('seed');
        if (seedInput) {
            seedInput.value = randomSeed;
        }
        
        // 确保始终使用PNG格式
        const format = "png";
        
        // 获取当前选中的风格
        const selectedStyle = document.querySelector('input[name="style"]:checked');
        const styleValue = selectedStyle ? selectedStyle.value : 'ghibli';
        
        // 处理翻译
        let translatedPrompt = prompt;
        
        // 检查是否包含中文字符
        if (/[\u4e00-\u9fa5]/.test(prompt)) {
            try {
                // 获取翻译显示区域中可能已存在的翻译结果
                const translationDisplay = document.getElementById('translationDisplay');
                const existingTranslation = translationDisplay ? translationDisplay.textContent.trim() : '';
                
                // 如果翻译显示区域有有效的翻译结果，直接使用它
                if (existingTranslation && 
                    !existingTranslation.includes('正在翻译') && 
                    !existingTranslation.includes('无法完成翻译') &&
                    !existingTranslation.includes('翻译服务暂时不可用')) {
                    translatedPrompt = existingTranslation;
                    console.log('使用已有翻译结果:', translatedPrompt);
                }
                // 如果translateToEnglish函数存在，则调用它
                else if (typeof window.translateToEnglish === 'function') {
                    translatedPrompt = await window.translateToEnglish(prompt);
                    console.log('翻译后的提示词:', translatedPrompt);
                } else {
                    console.warn('translateToEnglish函数不可用，使用原始提示词');
                    // 尝试使用字典翻译
                    if (window.baiduTranslateHelpers && window.baiduTranslateHelpers.dictionary) {
                        const dictionary = window.baiduTranslateHelpers.dictionary;
                        // 简单的词替换翻译
                        let parts = prompt.split(/([，。！？\s]+)/);
                        for (let i = 0; i < parts.length; i++) {
                            if (dictionary[parts[i]]) {
                                parts[i] = dictionary[parts[i]];
                            }
                        }
                        translatedPrompt = parts.join(' ').replace(/\s+/g, ' ').trim();
                        console.log('使用字典简单翻译:', translatedPrompt);
                    }
                }
            } catch (e) {
                console.error('翻译失败，使用原始提示词:', e);
            }
        }
        
        // 构建请求数据
        const requestData = {
            prompt: translatedPrompt,
            width: parseInt(width),
            height: parseInt(height),
            seed: randomSeed,
            style: styleValue,
            chinese_prompt: prompt  // 使用原始中文提示词
        };
        
        console.log('发送请求数据:', requestData);
        
        // 确保保存的画廊项包含正确的中文提示词
        window.lastChinesePrompt = prompt;
        console.log('已设置全局中文提示词:', window.lastChinesePrompt);
        
        // 检查队列管理器是否存在
        if (!window.queueManager || !window.queueManager.sendGenerationRequest) {
            console.error('队列管理器不可用，尝试使用原始函数');
            
            // 如果原始函数存在则调用它
            if (typeof originalGenerateImage === 'function') {
                return originalGenerateImage();
            } else {
                throw new Error('既没有队列管理器也没有原始函数可用');
            }
        }
        
        // 使用队列管理器发送请求
        return window.queueManager.sendGenerationRequest(requestData);
    } catch (error) {
        console.error('生成图片失败:', error);
        
        if (typeof showFriendlyAlert === 'function') {
            showFriendlyAlert('生成图片失败，请重试');
        } else {
            alert('生成图片失败，请重试');
        }
    }
}

// 在窗口加载完成后替换原始函数
window.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('正在替换为队列版本的generateImage函数');
        
        // 保存原始函数的引用（如果存在）
        if (typeof window.generateImage === 'function') {
            window.originalGenerateImage = window.generateImage;
            console.log('已保存原始generateImage函数的引用');
        }
        
        // 替换为使用队列的函数
        window.generateImage = generateImage;
        
        // 确保生成按钮仍然使用新函数
        const generateBtn = document.getElementById('generate');
        if (generateBtn) {
            console.log('正在更新生成按钮的事件监听器');
            
            // 移除原有的事件监听器
            const newBtn = generateBtn.cloneNode(true);
            generateBtn.replaceWith(newBtn);
            
            // 重新获取按钮并添加新的事件监听器
            const newGenerateBtn = document.getElementById('generate');
            newGenerateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                generateImage();
            });
        }
        
        console.log('成功替换为队列版本的generateImage函数');
    } catch (error) {
        console.error('替换generateImage函数时出错:', error);
    }
}); 