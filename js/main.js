/**
 * 小朋友的AI绘画乐园 - 主要JavaScript文件
 * 实现画作生成、保存和主题切换功能
 */

/**
 * 将中文提示词转换为英文
 * 使用translate.js库进行翻译
 * @param {string} chinesePrompt - 中文提示词
 * @returns {Promise<string>} - 转换后的英文提示词的Promise
 */
window.translateToEnglish = async function(chinesePrompt) {
    if (!chinesePrompt) return '';
    
    // 如果输入已经是英文，则直接返回
    if (/^[a-zA-Z0-9\s.,!?;:()"'-]+$/.test(chinesePrompt)) {
        // 清空翻译显示区域
        const translationDisplay = document.getElementById('translationDisplay');
        if (translationDisplay) {
            translationDisplay.textContent = '';
        }
        return chinesePrompt;
    }
    
    // 检查translate.js是否可用
    if (typeof translate === 'undefined') {
        console.error('translate.js未加载，无法翻译');
        return chinesePrompt; // 如果translate.js不可用，返回原文
    }

    // 最大重试次数
    const maxRetries = 3;
    let retryCount = 0;
    let translatedText = '';
    
    // 创建一个重试函数
    const attemptTranslation = () => {
        return new Promise((resolve, reject) => {
            try {
                // 创建一个临时div元素来进行翻译
                const tempDiv = document.createElement('div');
                tempDiv.textContent = chinesePrompt;
                tempDiv.style.display = 'none';
                document.body.appendChild(tempDiv);
                
                // 使用translate.js进行翻译
                if (typeof translate.execute === 'function') {
                    console.log(`尝试翻译 (第${retryCount + 1}次): "${chinesePrompt}"`);
                    translate.execute([tempDiv]);
                    
                    // 由于translate.js是异步执行的，设置一个短暂延迟获取结果
                    setTimeout(() => {
                        const result = tempDiv.textContent;
                        if (document.body.contains(tempDiv)) {
                            document.body.removeChild(tempDiv);
                        }
                        
                        // 检查翻译是否成功（检查结果是否与原文不同）
                        if (result && result !== chinesePrompt && !/[\u4e00-\u9fa5]/.test(result)) {
                            console.log(`翻译成功: "${result}"`);
                            resolve(result);
                        } else {
                            console.log(`翻译结果不完整: "${result}"`);
                            reject(new Error('翻译结果不完整或未改变'));
                        }
                    }, 1500); // 增加延迟时间，给translate.js更多处理时间
                } else {
                    // translate.execute不可用
                    if (document.body.contains(tempDiv)) {
                        document.body.removeChild(tempDiv);
                    }
                    reject(new Error('translate.js不支持execute方法'));
                }
            } catch (error) {
                console.error("translate.js翻译处理错误:", error);
                // 清理可能残留的临时元素
                const tempDivs = document.querySelectorAll('div[style="display: none;"]');
                tempDivs.forEach(div => {
                    if (document.body.contains(div)) {
                        try {
                            document.body.removeChild(div);
                        } catch (e) {
                            console.error("移除临时元素失败:", e);
                        }
                    }
                });
                reject(error);
            }
            
            // 设置超时，防止无限等待
            setTimeout(() => {
                // 清理可能残留的临时元素
                const tempDivs = document.querySelectorAll('div[style="display: none;"]');
                tempDivs.forEach(div => {
                    if (document.body.contains(div)) {
                        try {
                            document.body.removeChild(div);
                        } catch (e) {
                            console.error("超时清理临时元素失败:", e);
                        }
                    }
                });
                reject(new Error('翻译超时'));
            }, 5000);
        });
    };
    
    // 使用重试机制
    while (retryCount < maxRetries) {
        try {
            translatedText = await attemptTranslation();
            if (translatedText && translatedText !== chinesePrompt) {
                console.log(`成功翻译 (第${retryCount + 1}次尝试): "${chinesePrompt}" -> "${translatedText}"`);
                return translatedText;
            }
        } catch (error) {
            console.log(`第${retryCount + 1}次翻译失败:`, error.message);
            retryCount++;
            
            // 最后一次尝试失败
            if (retryCount >= maxRetries) {
                console.error(`翻译失败 (已尝试${maxRetries}次): "${chinesePrompt}"`);
                return chinesePrompt; // 返回原文
            }
            
            // 重试前稍等一会
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`准备第${retryCount + 1}次翻译尝试...`);
        }
    }
    
    // 如果所有重试都失败，返回原文
    return chinesePrompt;
};

// 确保translate.js不会影响页面交互
function ensureTranslateJsDoesNotAffectInteractions() {
    // 如果translate.js已加载，添加必要的忽略
    if (typeof translate !== 'undefined') {
        try {
            // 保存所有需要保护的元素类名
            const protectedClasses = [
                'btn', 'style-tag', 'prompt-tag', 'sticker',
                'gallery-control-btn', 'view-btn', 'delete-btn', 
                'btn-primary', 'btn-success', 'btn-warning', 'btn-info', 
                'close-button', 'style-options', 'prompt-tags-container'
            ];
            
            // 保存所有需要保护的元素标签
            const protectedTags = [
                'button', 'input', 'select', 'a', 'textarea', 'label'
            ];
            
            // 重写可能导致问题的方法
            if (typeof translate.execute === 'function') {
                const originalTranslateExecute = translate.execute;
                translate.execute = function(docs) {
                    // 确保不影响按钮和其他交互元素
                    if (translate.ignore && translate.ignore.tag) {
                        protectedTags.forEach(tag => {
                            if (!translate.ignore.tag.includes(tag)) {
                                translate.ignore.tag.push(tag);
                            }
                        });
                    }
                    
                    if (translate.ignore && translate.ignore.class) {
                        protectedClasses.forEach(cls => {
                            if (!translate.ignore.class.includes(cls)) {
                                translate.ignore.class.push(cls);
                            }
                        });
                    }
                    
                    // 调用原始方法
                    return originalTranslateExecute.call(translate, docs);
                };
            }
            
            // 禁用自动监听功能（如果存在）
            if (translate.listener) {
                translate.listener.isStart = false;
            }
            
            // 将translate限制在翻译显示区域
            if (typeof translate.setDocuments === 'function') {
                const translationDisplay = document.getElementById('translationDisplay');
                if (translationDisplay) {
                    translate.setDocuments([translationDisplay]);
                }
            }
            
            console.log('已增强translate.js的忽略规则，确保不影响页面交互');
        } catch (error) {
            console.error('配置translate.js忽略规则时出错:', error);
        }
    }
}

// 当DOM完全加载后执行
document.addEventListener('DOMContentLoaded', () => {
    // 确保translate.js不会影响页面交互
    ensureTranslateJsDoesNotAffectInteractions();
    
    // 额外处理：直接移除语言选择器
    removeTranslateLanguageSelector();
    
    // 获取DOM元素
    const promptInput = document.getElementById('prompt');
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const seedInput = document.getElementById('seed');
    const formatSelect = document.getElementById('format');
    const generateBtn = document.getElementById('generate');
    const downloadBtn = document.getElementById('download');
    const toggleThemeBtn = document.getElementById('toggleTheme');
    const previewImage = document.getElementById('previewImage');
    const loadingElement = document.getElementById('loading');
    const body = document.body;
    const showHelpBtn = document.getElementById('showHelp');
    const helpGuide = document.getElementById('helpGuide');
    const closeHelpBtn = document.getElementById('closeHelp');
    const closeButton = document.querySelector('.close-button');
    const emptyGallery = document.getElementById('emptyGallery');
    const galleryItems = document.getElementById('galleryItems');
    const clearGalleryBtn = document.getElementById('clearGallery');

    // 画廊相关变量
    let galleryWorks = [];
    const maxGalleryItems = 12; // 最多保存12个作品

    // 初始化 - 检查是否有保存的主题和画廊作品
    initTheme();
    initGallery();
    initTranslateJS(); // 初始化translate.js

    // 添加一个额外的定时器以确保语言选择器被移除
    setTimeout(removeTranslateLanguageSelector, 500);
    setTimeout(removeTranslateLanguageSelector, 1000);
    setTimeout(removeTranslateLanguageSelector, 2000);

    // 设置按钮事件监听器
    generateBtn.addEventListener('click', generateImage);
    downloadBtn.addEventListener('click', downloadImage);
    toggleThemeBtn.addEventListener('click', toggleTheme);
    showHelpBtn.addEventListener('click', showHelp);
    closeHelpBtn.addEventListener('click', hideHelp);
    closeButton.addEventListener('click', hideHelp);
    clearGalleryBtn.addEventListener('click', clearGallery);
    
    // 添加提示词点击事件
    initPromptTags();
    
    // 初始化风格选择器
    initStyleSelector();
    
    // 添加提示词输入监听，实时显示翻译
    initTranslationDisplay();
    
    // 增加有趣的动画效果
    addButtonEffects();

    // 处理图片尺寸的比例选择器
    initAspectRatioSelector();

    /**
     * 初始化比例选择器功能
     */
    function initAspectRatioSelector() {
        // 获取比例选择器的所有单选按钮
        const aspectRatioInputs = document.querySelectorAll('input[name="aspectRatio"]');
        const actualSizeDisplay = document.getElementById('actualSize');
        const widthInput = document.getElementById('width');
        const heightInput = document.getElementById('height');
        
        // 最大尺寸限制
        const MAX_DIMENSION = 1440;
        
        // 计算并更新尺寸
        function updateDimensions() {
            // 获取选中的比例值
            const selectedRatio = document.querySelector('input[name="aspectRatio"]:checked').value;
            const [width, height] = selectedRatio.split(':').map(Number);
            
            let actualWidth, actualHeight;
            
            // 根据比例计算实际宽高，确保长边不超过MAX_DIMENSION
            if (width >= height) {
                // 横向图片或正方形
                actualWidth = MAX_DIMENSION;
                actualHeight = Math.round(MAX_DIMENSION * (height / width));
            } else {
                // 纵向图片
                actualHeight = MAX_DIMENSION;
                actualWidth = Math.round(MAX_DIMENSION * (width / height));
            }
            
            // 确保尺寸是偶数（有些AI模型要求）
            actualWidth = Math.floor(actualWidth / 2) * 2;
            actualHeight = Math.floor(actualHeight / 2) * 2;
            
            // 更新显示和隐藏输入字段
            actualSizeDisplay.textContent = `${actualWidth} × ${actualHeight} 像素`;
            widthInput.value = actualWidth;
            heightInput.value = actualHeight;
            
            console.log(`比例选择更新: ${selectedRatio} => ${actualWidth} × ${actualHeight} 像素`);
        }
        
        // 为每个比例选项添加事件监听器
        aspectRatioInputs.forEach(input => {
            input.addEventListener('change', updateDimensions);
        });
        
        // 初始化尺寸显示
        updateDimensions();
    }

    /**
     * 初始化translate.js库
     */
    function initTranslateJS() {
        try {
            // 检查translate对象是否存在
            if (typeof translate === 'undefined') {
                console.error('translate.js未加载');
            return;
        }

            // 禁用语言选择器
            if (typeof translate.selectLanguageTag === 'function') {
                translate.selectLanguageTag.show = false; // 禁止显示语言选择器
            }
            
            // 配置translate.js - 忽略特定元素
            if (translate.ignore && translate.ignore.tag) {
                translate.ignore.tag.push('button', 'input', 'select', 'a', 'textarea'); // 忽略按钮和输入元素
            }
            
            if (translate.ignore && translate.ignore.class) {
                // 添加要忽略的类
                const ignoreClasses = [
                    'btn', 'style-tag', 'prompt-tag', 'style-options', 'prompt-tags-container',
                    'gallery-control-btn', 'view-btn', 'delete-btn', 'btn-primary', 
                    'btn-success', 'btn-warning', 'btn-info', 'close-button'
                ];
                
                ignoreClasses.forEach(cls => {
                    if (!translate.ignore.class.includes(cls)) {
                        translate.ignore.class.push(cls);
                    }
                });
            }
            
            // 完全禁用translate.js的DOM监听功能，避免干扰事件冒泡
            if (translate.listener) {
                translate.listener.isStart = false;
            }
            
            // 设置目标语言为英语 - 只使用基本API
            translate.to = 'english';
            
            // 限制只翻译特定区域，只翻译提示词输入框附近的元素
            if (typeof translate.setDocuments === 'function') {
                const translationDisplay = document.getElementById('translationDisplay');
                if (translationDisplay) {
                    translate.setDocuments([translationDisplay]);
                }
            }
            
            // 如果有词典，添加到translate.js的自定义术语中
            const dictionary = window.baiduTranslateHelpers && window.baiduTranslateHelpers.dictionary;
            if (dictionary && translate.nomenclature && typeof translate.nomenclature.append === 'function') {
                let nomenclatureStr = '';
                for (const key in dictionary) {
                    nomenclatureStr += `${key}=${dictionary[key]}\n`;
                }
                
                // 添加自定义术语
                translate.nomenclature.append('chinese_simplified', 'english', nomenclatureStr);
            }
            
            // 移除已经添加的语言选择器元素
            setTimeout(() => {
                const languageSelectors = document.querySelectorAll('select[onchange*="translate.changeLanguage"], .translateSelectLanguage, #translate-element, .translate-element-language-dropdown');
                languageSelectors.forEach(selector => {
                    if (selector && selector.parentNode) {
                        selector.parentNode.removeChild(selector);
                    }
                });
            }, 100);
            
            console.log('translate.js初始化完成 - 已禁用自动DOM监听和语言选择器');
                    } catch (error) {
            console.error('初始化translate.js时出错:', error);
        }
    }

    /**
     * 生成图片
     */
    async function generateImage() {
        // 获取输入值
        const prompt = document.getElementById('prompt').value;
        
        // 如果用户没有输入描述，提示并返回
        if (!prompt.trim()) {
            showFriendlyAlert('请告诉AI你想画什么吧！');
            return;
        }
        
        const width = document.getElementById('width').value;
        const height = document.getElementById('height').value;
        
        // 生成1到9999之间的随机整数作为神奇数字
        const randomSeed = Math.floor(Math.random() * 9999) + 1;
        
        // 更新隐藏的seed输入框的值
        document.getElementById('seed').value = randomSeed;
        
        // 使用随机生成的seed值替代固定值
        const seed = randomSeed;
        
        // 确保始终使用PNG格式，不管下拉框选择的是什么
        const format = "png";
        
        // 获取生成按钮元素
        const generateBtn = document.getElementById('generate');
        // 禁用生成按钮，防止用户重复点击
        generateBtn.disabled = true;
        // 修改按钮文本，提供视觉反馈
        generateBtn.textContent = '正在画画中...';
        // 添加加载状态类
        generateBtn.classList.add('loading-state');
        
        // 显示加载状态
        const loading = document.getElementById('loading');
        loading.classList.remove('hidden');
        
        try {
            // 构建图片URL
            const imageUrl = await buildImageUrl(prompt, width, height, seed, format);
            
            // 更新预览图片
            const previewImage = document.getElementById('previewImage');
            
            // 监听图片加载完成事件
            const imageLoaded = new Promise((resolve, reject) => {
                previewImage.onload = resolve;
                previewImage.onerror = reject;
                
                // 设置超时保护，防止图片加载过久
                setTimeout(resolve, 30000); // 30秒超时
            });
            
            // 设置图片源
            previewImage.src = imageUrl;
            
            // 等待图片加载完成
            await imageLoaded;
            
            // 保存到画廊
            const workItem = {
                imageUrl: imageUrl,
                prompt: prompt,
                chinese_prompt: prompt,
                timestamp: Date.now(),
                favorite: false
            };
            
            // 获取翻译区域的内容作为中文提示词（如果存在）
            const translationDisplay = document.getElementById('translationDisplay');
            if (translationDisplay && translationDisplay.textContent.trim() !== '') {
                workItem.chinese_prompt = translationDisplay.textContent.trim();
            }
            
            // 获取现有画廊数据
            const savedGallery = localStorage.getItem('galleryWorks');
            let galleryWorks = savedGallery ? JSON.parse(savedGallery) : [];
            
            // 添加到画廊开头
            galleryWorks.unshift(workItem);
            
            // 保存到本地存储
            localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
            
            // 更新画廊显示
            if (typeof updateGalleryDisplay === 'function') {
                updateGalleryDisplay();
            }
            
            // 显示成功消息
            showSuccess('画作生成成功！');
            
        } catch (error) {
            console.error('生成图片失败:', error);
            showError('生成图片失败，请重试');
        } finally {
            // 隐藏加载状态
            loading.classList.add('hidden');
            
            // 恢复生成按钮状态
            generateBtn.disabled = false;
            generateBtn.textContent = '开始画画!';
            generateBtn.classList.remove('loading-state');
        }
    }

    /**
     * 下载当前生成的图片
     */
    function downloadImage() {
        if (!previewImage.src || previewImage.src.includes('data:image/svg+xml;base64')) {
            showFriendlyAlert('请先画一幅画吧！');
            return;
        }

        try {
            // 使用Canvas将图片转换为本地数据，避免直接链接到外部URL
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 设置Canvas尺寸与图片一致
            canvas.width = previewImage.naturalWidth;
            canvas.height = previewImage.naturalHeight;
            
            // 在Canvas上绘制图像
            ctx.drawImage(previewImage, 0, 0, canvas.width, canvas.height);
            
            // 将Canvas转换为Blob对象
            canvas.toBlob((blob) => {
                if (!blob) {
                    // 如果无法创建Blob，回退到直接下载
                    fallbackDownload();
                    return;
                }
                
                try {
                    // 创建一个本地URL引用这个Blob
                    const blobUrl = URL.createObjectURL(blob);
                    
                    // 创建一个临时链接元素
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = `我的画作_${new Date().toLocaleDateString()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // 释放Blob URL
                    setTimeout(() => {
                        URL.revokeObjectURL(blobUrl);
                    }, 100);
                    
                    // 显示下载成功消息，并添加桌面保存指引
                    // showDesktopSaveTip(); // 取消弹窗提示
                    // 改为简洁的成功提示
                    showSuccess('保存成功！');
                    
                    // 同时将图片添加到画廊（如果画廊功能已加载）
                    if (typeof window.addToGallery === 'function') {
                        window.addToGallery({
                            imageUrl: previewImage.src,
                            prompt: promptInput.value,
                            date: new Date().toLocaleString()
                        });
                    }
                } catch (error) {
                    console.error('Blob URL处理错误:', error);
                    fallbackDownload();
                }
            }, `image/${formatSelect.value}`, 0.95); // 使用用户选择的格式和高质量
        } catch (error) {
            console.error('Canvas处理图像错误:', error);
            // 出错时回退到传统下载方式，但可能会导致跳转
            fallbackDownload();
        }
    }
    
    /**
     * 回退到传统下载方式（可能导致URL弹出）
     * 仅在Canvas方法失败时使用
     */
    function fallbackDownload() {
        // 为图像添加crossOrigin属性尝试解决CORS问题
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            try {
                // 再次尝试使用Canvas方法
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                
                // 尝试使用toDataURL方法
                const dataURL = canvas.toDataURL('image/png');
                
                const link = document.createElement('a');
                link.href = dataURL;
                link.download = `我的画作_${new Date().toLocaleDateString()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // showDesktopSaveTip(); // 取消弹窗提示
                // 改为简洁的成功提示
                showSuccess('保存成功！');
                
                // 同时将图片添加到画廊（如果画廊功能已加载）
                if (typeof window.addToGallery === 'function') {
                    window.addToGallery({
                        imageUrl: previewImage.src,
                        prompt: promptInput.value,
                        date: new Date().toLocaleString()
                    });
                }
            } catch (error) {
                console.error('回退下载方法也失败:', error);
                
                // 最后的回退方案：直接使用原始URL（可能导致URL弹出）
                const link = document.createElement('a');
                link.href = previewImage.src;
                link.download = `我的画作_${new Date().toLocaleDateString()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                showFriendlyAlert('保存可能跳转到原图网站，请手动右键保存图片。');
            }
        };
        img.onerror = function() {
            // 图像加载失败时使用原始方法
            const link = document.createElement('a');
            link.href = previewImage.src;
            link.download = `我的画作_${new Date().toLocaleDateString()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showFriendlyAlert('保存可能跳转到原图网站，请手动右键保存图片。');
        };
        img.src = previewImage.src;
    }

    /**
     * 切换明暗主题
     */
    function toggleTheme() {
        // 切换深色模式类
        body.classList.toggle('dark-mode');
        
        // 保存主题偏好到本地存储
        const isDarkMode = body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false');
        
        // 更新按钮文本
        toggleThemeBtn.textContent = isDarkMode ? '切换日间模式' : '切换夜间模式';
    }

    /**
     * 初始化主题
     */
    function initTheme() {
        // 检查本地存储中的主题偏好
        const darkMode = localStorage.getItem('darkMode') === 'true';
        if (darkMode) {
            body.classList.add('dark-mode');
            toggleThemeBtn.textContent = '切换日间模式';
        }
    }

    /**
     * 构建图片URL
     * @param {string} prompt - 提示词
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {number} seed - 随机种子
     * @param {string} format - 图片格式，如jpeg,png
     * @returns {Promise<string>} - 构建好的图片URL
     */
    async function buildImageUrl(prompt, width, height, seed, format) {
        // 检查是否包含中文
        let translatedPrompt = prompt;
        
        // 从翻译显示区域获取已有的翻译结果
        const translationDisplay = document.getElementById('translationDisplay');
        const existingTranslation = translationDisplay ? translationDisplay.textContent.trim() : '';
        
        // 如果已有翻译结果且不为空（不是错误信息），则使用它
        if (existingTranslation && 
            !existingTranslation.includes('正在翻译') && 
            !existingTranslation.includes('无法完成翻译') &&
            !existingTranslation.includes('翻译服务暂时不可用')) {
            translatedPrompt = existingTranslation;
            console.log('使用已有翻译结果:', translatedPrompt);
        }
        // 如果包含中文但没有现成的翻译结果，尝试进行翻译
        else if (/[\u4e00-\u9fa5]/.test(prompt)) {
            try {
                // 显示正在处理翻译的提示
                if (translationDisplay) {
                    translationDisplay.textContent = "正在为绘画翻译提示词...";
                }
                
                const translated = await translateToEnglish(prompt);
                // 确保翻译成功（不含中文字符）
                if (translated && !/[\u4e00-\u9fa5]/.test(translated)) {
                    translatedPrompt = translated;
                    console.log('成功翻译提示词:', translatedPrompt);
                    
                    // 更新翻译显示区域
                    if (translationDisplay) {
                        translationDisplay.textContent = translatedPrompt;
                    }
                } else {
                    console.warn('翻译不完整，继续使用部分翻译结果');
                }
            } catch (error) {
                console.error('翻译过程中出错，使用原始提示词:', error);
            }
        }
        
        // 编码处理后的提示词
        const encodedPrompt = encodeURIComponent(translatedPrompt);
        
        // 获取当前选中的风格
        const selectedStyle = document.querySelector('input[name="style"]:checked');
        let stylePrompt;
        
        if (selectedStyle) {
            // 如果选择了风格，使用对应的提示词
            stylePrompt = selectedStyle.getAttribute('data-prompt');
            stylePrompt = encodeURIComponent(stylePrompt + ', ' + translatedPrompt);
        } else {
            // 默认使用吉卜力风格
            stylePrompt = encodeURIComponent('Studio Ghibli style, Miyazaki inspired, fantasy, detailed, soft lighting, ' + translatedPrompt);
        }
        
        // 构建URL，确保包含nologo=true参数
        const imageUrl = `https://image.pollinations.ai/prompt/${stylePrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
        
        // 获取本地存储的学生信息
        const username = localStorage.getItem('username');
        const studentId = localStorage.getItem('studentId');
        
        // 日志显示当前存储的学生信息
        console.log('获取到本地存储的学生信息:');
        console.log('- 用户名:', username || '未设置');
        console.log('- 学号:', studentId || '未设置');
        
        // 获取页面上的学生信息横幅元素
        const banner = document.getElementById('studentInfoBanner');
        if (banner) {
            if (username && studentId) {
                banner.innerHTML = `当前用户: <strong>${username}</strong> (学号: <strong>${studentId}</strong>) - 图片正在生成中...`;
            } else {
                banner.innerHTML = `未获取到用户信息 - 图片正在生成中...`;
            }
        }
        
        // 保存生成信息到本地，而不立即发送到服务器
        try {
            // 构建完整的图像信息对象
            const imageInfo = {
                username: username,
                student_id: studentId,
                prompt: prompt,
                translated_prompt: translatedPrompt,
                image_url: imageUrl,
                width: width,
                height: height,
                seed: seed,
                format: format,
                timestamp: Date.now(),
                style: selectedStyle ? selectedStyle.value : 'ghibli'
            };
            
            // 将图像信息保存到本地存储
            // 获取现有的图像历史记录
            let imageHistory = JSON.parse(localStorage.getItem('imageHistory') || '[]');
            
            // 添加新的图像信息到历史记录开头
            imageHistory.unshift(imageInfo);
            
            // 限制历史记录数量，最多保存20条
            if (imageHistory.length > 20) {
                imageHistory = imageHistory.slice(0, 20);
            }
            
            // 更新本地存储
            localStorage.setItem('imageHistory', JSON.stringify(imageHistory));
            
            console.log('图像信息已保存到本地存储，包含提示词、翻译和图像URL等信息');
            
            if (banner) {
                banner.innerHTML += ' <span style="color:#28a745;">✓ 本地保存成功</span>';
                banner.innerHTML += ' <small style="display:block; font-size:12px; color:#6c757d; margin-top:4px;">提交到学校画廊时才会存入数据库</small>';
            }
            
        } catch (error) {
            console.error('保存图像信息到本地存储时出错:', error);
            if (banner) {
                banner.innerHTML += ' <span style="color:#dc3545;">✗ 本地保存失败</span>';
            }
        }
        
        return imageUrl;
    }

    /**
     * 模拟API延迟 - 仅用于演示
     */
    function simulateApiDelay() {
        return new Promise(resolve => {
            const delay = Math.random() * 1000 + 1500; // 1.5-2.5秒延迟
            setTimeout(resolve, delay);
        });
    }

    /**
     * 验证图片尺寸
     */
    function isValidDimension(value) {
        const dimension = parseInt(value, 10);
        return !isNaN(dimension) && dimension > 0 && dimension <= 2048;
    }
    
    /**
     * 显示友好的提示框
     */
    function showFriendlyAlert(message) {
        console.log("提示消息:", message);
        
        // 移除之前的提示（如果有）
        const existingAlert = document.querySelector('.friendly-alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        // 创建友好提示元素
        const alertDiv = document.createElement('div');
        alertDiv.className = 'friendly-alert';
        
        // 检查是否是敏感词警告
        if (message.includes('不适合的内容') || message.includes('请文明用语')) {
            alertDiv.className += ' sensitive-word-alert';
            
            // 检查是否包含具体敏感词
            const sensitiveWordsMatch = message.match(/不适合的内容：(.+?)(?:\n|$)/);
            if (sensitiveWordsMatch) {
                const sensitiveWords = sensitiveWordsMatch[1];
                // 替换原始消息中的敏感词部分，添加高亮样式
                const formattedMessage = message.replace(
                    sensitiveWords,
                    `<span class="sensitive-word-highlight">${sensitiveWords}</span>`
                );
                alertDiv.innerHTML = formattedMessage.replace(/\n/g, '<br>');
            } else {
                // 处理新的警告格式
                alertDiv.innerHTML = `<span class="sensitive-word-highlight">${message}</span>`;
            }
        } else {
            // 普通提示
            alertDiv.textContent = message;
        }
        
        // 添加关闭按钮
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '&times;';
        closeBtn.className = 'friendly-alert-close';
        closeBtn.onclick = function() {
            alertDiv.remove();
        };
        alertDiv.appendChild(closeBtn);
        
        // 添加到页面
        const container = document.querySelector('.card') || document.body;
        container.insertBefore(alertDiv, container.firstChild);
        
        // 自动关闭（5秒后）
        setTimeout(() => {
            if (document.body.contains(alertDiv)) {
                alertDiv.style.opacity = '0';
                setTimeout(() => alertDiv.remove(), 500);
            }
        }, 5000);
    }
    
    /**
     * 显示成功消息
     */
    function showSuccess(message) {
        // 已禁用所有成功提示弹窗，保持无干扰的用户体验
        console.log("成功消息（已禁用弹窗显示）:", message);
        // 不再创建和显示任何弹窗元素
    }
    
    /**
     * 为按钮添加有趣的动画效果
     */
    function addButtonEffects() {
        // 为所有按钮添加点击动画
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(btn => {
            btn.addEventListener('mouseover', () => {
                btn.style.transform = 'translateY(-3px) rotate(1deg)';
            });
            
            btn.addEventListener('mouseout', () => {
                btn.style.transform = '';
            });
            
            btn.addEventListener('click', () => {
                // 添加按下的动画
                btn.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    btn.style.transform = '';
                }, 200);
            });
        });
    }

    /**
     * 显示帮助指南
     */
    function showHelp() {
        helpGuide.classList.remove('hidden');
    }
    
    /**
     * 隐藏帮助指南
     */
    function hideHelp() {
        helpGuide.classList.add('hidden');
    }

    /**
     * 初始化画廊
     */
    function initGallery() {
        // 从本地存储中加载画廊作品
        const savedGallery = localStorage.getItem('galleryWorks');
        if (savedGallery) {
            galleryWorks = JSON.parse(savedGallery);
            updateGalleryDisplay();
        }
    }
    
    /**
     * 添加作品到画廊
     */
    function addToGallery(workItem) {
        // 检查是否已经有相同的图像
        const existingIndex = galleryWorks.findIndex(item => item.imageUrl === workItem.imageUrl);
        
        if (existingIndex !== -1) {
            // 如果已存在，更新到最前面
            galleryWorks.splice(existingIndex, 1);
        }
        
        // 添加到数组开头
        galleryWorks.unshift(workItem);
        
        // 限制最大数量
        if (galleryWorks.length > maxGalleryItems) {
            galleryWorks = galleryWorks.slice(0, maxGalleryItems);
        }
        
        // 保存到本地存储
        localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
        
        // 更新显示
        updateGalleryDisplay();
    }
    
    /**
     * 更新画廊显示
     */
    function updateGalleryDisplay() {
        // 清空画廊容器
        galleryItems.innerHTML = '';
        
        // 显示或隐藏空画廊提示
        if (galleryWorks.length === 0) {
            emptyGallery.classList.remove('hidden');
            galleryItems.classList.add('hidden');
        } else {
            emptyGallery.classList.add('hidden');
            galleryItems.classList.remove('hidden');
            
            // 创建每个画廊项
            galleryWorks.forEach((work, index) => {
                const galleryItem = document.createElement('div');
                galleryItem.className = 'gallery-item';
                
                // 图片
                const img = document.createElement('img');
                img.src = work.imageUrl;
                img.alt = work.prompt;
                img.loading = 'lazy'; // 懒加载
                img.title = work.prompt;
                
                // 控制按钮
                const controls = document.createElement('div');
                controls.className = 'gallery-item-controls';
                
                // 查看按钮
                const viewBtn = document.createElement('button');
                viewBtn.className = 'gallery-control-btn view-btn';
                viewBtn.innerHTML = '👁️';
                viewBtn.title = '查看大图';
                viewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    viewGalleryItem(work);
                });
                
                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'gallery-control-btn delete-btn';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = '删除';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeGalleryItem(index);
                });
                
                // 添加控制按钮
                controls.appendChild(viewBtn);
                controls.appendChild(deleteBtn);
                
                // 组装画廊项
                galleryItem.appendChild(img);
                galleryItem.appendChild(controls);
                
                // 添加点击事件
                galleryItem.addEventListener('click', () => {
                    viewGalleryItem(work);
                });
                
                // 添加到画廊
                galleryItems.appendChild(galleryItem);
            });
        }
    }
    
    /**
     * 查看画廊项
     */
    function viewGalleryItem(work) {
        // 如果openImageModal函数可用，使用它打开模态框
        if (typeof openImageModal === 'function') {
            openImageModal(work);
            return;
        }
        
        // 备用方案：如果openImageModal不可用，更新预览图像
        previewImage.src = work.imageUrl;
        previewImage.alt = work.chinese_prompt || work.prompt; // 优先使用中文提示词
        
        // 设置输入字段，优先使用中文提示词
        promptInput.value = work.chinese_prompt || work.prompt;
        
        // 滚动到顶部
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        // 显示提示
        showSuccess('已加载到预览区域，可以重新生成或保存哦！');
    }
    
    /**
     * 删除画廊项
     */
    function removeGalleryItem(index) {
        // 从数组中移除
        galleryWorks.splice(index, 1);
        
        // 保存到本地存储
        localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
        
        // 更新显示
        updateGalleryDisplay();
        
        // 显示提示
        showSuccess('已从画廊中删除！');
    }
    
    /**
     * 清空画廊
     */
    function clearGallery() {
        if (galleryWorks.length === 0) {
            // 不显示弹窗提示
            console.log("提示消息（已禁用弹窗显示）: 画廊已经是空的啦！");
            return;
        }
        
        // 直接执行清空操作，不再显示确认对话框
        // 清空数组
        galleryWorks = [];
        
        // 清除本地存储
        localStorage.removeItem('galleryWorks');
        
        // 更新显示
        updateGalleryDisplay();
        
        // 记录操作但不显示提示
        console.log("成功消息（已禁用弹窗显示）: 画廊已清空！");
    }

    /**
     * 初始化提示词标签
     */
    function initPromptTags() {
        // 获取提示词容器
        const promptTagsContainer = document.querySelector('.prompt-tags-container');
        if (!promptTagsContainer) {
            console.error('找不到提示词容器元素');
            return;
        }
        
        // 克隆并替换容器以移除之前的事件监听器
        const newContainer = promptTagsContainer.cloneNode(true);
        promptTagsContainer.parentNode.replaceChild(newContainer, promptTagsContainer);
        
        // 获取所有提示词标签
        const promptTags = newContainer.querySelectorAll('.prompt-tag');
        
        // 为每个提示词标签添加点击事件
        promptTags.forEach(tag => {
            tag.addEventListener('click', function(event) {
                // 阻止事件冒泡
                event.stopPropagation();
                
                // 获取提示词内容
                const promptText = this.getAttribute('data-prompt');
                if (!promptText) return;
                
                // 获取提示词输入框
                const promptInput = document.getElementById('prompt');
                if (!promptInput) return;
                
                // 填充到输入框
                promptInput.value = promptText;
                
                // 获取翻译区域并确保其显示（因为是中文提示词）
                const translationWrapper = document.querySelector('.translation-wrapper');
                if (translationWrapper) {
                    translationWrapper.style.display = 'flex';
                }
                
                // 让输入框获得焦点
                promptInput.focus();
                
                // 添加简单的动画效果
                this.style.transform = 'scale(0.9)';
                setTimeout(() => {
                    this.style.transform = '';
                }, 200);
                
                // 平滑滚动到顶部表单区域
                window.scrollTo({
                    top: promptInput.offsetTop - 100,
                    behavior: 'smooth'
                });
                
                console.log(`已选择小帮手提示词: ${promptText}`);
            });
        });
        
        console.log('小帮手提示词已重新初始化');
    }

    /**
     * 初始化风格选择器
     */
    function initStyleSelector() {
        // 获取所有风格标签及其父元素
        const styleLabels = document.querySelectorAll('.style-tag');
        
        // 找到默认选中的风格并添加active类
        const defaultStyle = document.querySelector('.style-tag input:checked');
        if (defaultStyle) {
            defaultStyle.parentElement.classList.add('active');
        }
        
        // 清除并重新添加点击事件
        styleLabels.forEach(label => {
            // 清除可能存在的原有事件监听
            const newLabel = label.cloneNode(true);
            label.parentNode.replaceChild(newLabel, label);
            
            // 获取标签中的radio input元素
            const radioInput = newLabel.querySelector('input[type="radio"]');
            
            // 为标签添加点击事件（不是为radio添加change事件）
            newLabel.addEventListener('click', (e) => {
                // 阻止事件冒泡
                e.stopPropagation();
                
                // 确保radio被选中
                if (radioInput) {
                    radioInput.checked = true;
                    
                    // 触发一个人工的change事件
                    const changeEvent = new Event('change', { bubbles: true });
                    radioInput.dispatchEvent(changeEvent);
                    
                    // 高亮显示选中的标签
                    document.querySelectorAll('.style-tag').forEach(el => {
                        el.classList.remove('active');
                    });
                    newLabel.classList.add('active');
                    
                    // 显示提示
                    const styleName = newLabel.querySelector('span').textContent.trim();
                    console.log(`已选择${styleName}风格`);
                    
                    // 如果用户正在输入提示词，可以提示风格已改变
                    const promptInput = document.getElementById('prompt');
                    if (promptInput && promptInput.value.trim() !== '') {
                        // 已禁用弹窗提示
                        console.log(`已切换到${styleName}风格，点击"开始画画"应用新风格`);
                    }
                }
            });
        });
        
        console.log('风格选择器已重新初始化');
    }

    /**
     * 初始化实时翻译显示
     */
    function initTranslationDisplay() {
        const promptInput = document.getElementById('prompt');
        const translationDisplay = document.getElementById('translationDisplay');
        const translateBtn = document.getElementById('translateBtn');
        const translationWrapper = document.querySelector('.translation-wrapper');
        
        // 初始状态隐藏整个翻译区域
        if (translationWrapper && !promptInput.value.trim()) {
            translationWrapper.style.display = 'none';
        }
        
        // 移除输入事件的自动翻译，改为按钮触发翻译
        translateBtn.addEventListener('click', async function() {
            const inputText = promptInput.value.trim();
            
            // 如果为空，隐藏整个翻译区域并返回
            if (!inputText) {
                if (translationWrapper) {
                    translationWrapper.style.display = 'none';
                }
                return;
            }
            
            // 确保翻译区域显示
            if (translationWrapper) {
                translationWrapper.style.display = 'flex';
            }
            
            // 判断是否包含中文
            if (/[\u4e00-\u9fa5]/.test(inputText)) {
                // 在翻译过程中显示加载提示并禁用按钮
                translationDisplay.textContent = "正在翻译...";
                translateBtn.disabled = true;
                translateBtn.textContent = "翻译中...";
                
                try {
                    // 使用translate.js进行翻译
                    const translatedText = await translateToEnglish(inputText);
                    
                    // 检查结果是否与输入相同（如果相同则说明翻译未成功）
                    if (translatedText && translatedText !== inputText && !/[\u4e00-\u9fa5]/.test(translatedText)) {
                        translationDisplay.textContent = translatedText;
                    } else {
                        translationDisplay.textContent = "无法完成翻译，AI将处理中文输入";
                    }
                } catch (error) {
                    console.error("翻译出错:", error);
                    translationDisplay.textContent = "翻译服务暂时不可用";
                } finally {
                    // 恢复按钮状态
                    translateBtn.disabled = false;
                    translateBtn.textContent = "翻译";
                }
            } else {
                // 如果不包含中文，显示无需翻译提示，两秒后隐藏
                translationDisplay.textContent = '不包含中文，无需翻译';
                setTimeout(() => {
                    translationDisplay.textContent = '';
                    if (translationWrapper && !promptInput.value.trim()) {
                        translationWrapper.style.display = 'none';
                    }
                }, 2000);
            }
        });
        
        // 当输入框内容变化时，处理翻译区域显示逻辑
        promptInput.addEventListener('input', function() {
            const hasContent = this.value.trim() !== '';
            
            // 如果有内容，显示翻译区域，否则隐藏
            if (translationWrapper) {
                translationWrapper.style.display = hasContent ? 'flex' : 'none';
            }
            
            // 清空翻译显示，等待用户点击翻译按钮
            translationDisplay.textContent = '';
        });
    }

    /**
     * 移除translate.js添加的语言选择器
     */
    function removeTranslateLanguageSelector() {
        const selectors = [
            'select[onchange*="translate.changeLanguage"]',
            '.translateSelectLanguage',
            '#translate-element',
            '.translate-element-language-dropdown',
            'select[name="translateSelectLanguage"]'
        ];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                    console.log('已移除translate.js语言选择器元素');
                }
            });
        });
        
        // 如果translate对象存在，尝试禁用语言选择器功能
        if (typeof translate !== 'undefined') {
            if (typeof translate.selectLanguageTag === 'function') {
                translate.selectLanguageTag.show = false;
            }
            
            // 尝试覆盖selectLanguageTag方法
            if (translate.selectLanguageTag) {
                const originalMethod = translate.selectLanguageTag;
                translate.selectLanguageTag = function() {
                    // 不执行任何操作，完全禁用该功能
                    console.log('已拦截translate.js语言选择器生成尝试');
                    return null;
                };
                
                // 保留原始方法的任何属性
                for (let prop in originalMethod) {
                    if (originalMethod.hasOwnProperty(prop)) {
                        translate.selectLanguageTag[prop] = originalMethod[prop];
                    }
                }
                translate.selectLanguageTag.show = false;
            }
        }
    }
}); 