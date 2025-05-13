/**
 * 队列管理和UI处理
 */

// 创建ArtServerClient实例，使用动态地址
const artClient = new ArtServerClient();

// 获取UI元素
const queueStatusElement = document.getElementById('queueStatus');
const positionNumberElement = document.getElementById('positionNumber');
const totalQueueElement = document.getElementById('totalQueue');
const queueProgressBarElement = document.getElementById('queueProgressBar');
const generateBtn = document.getElementById('generate');
const loadingElement = document.getElementById('loading');
const previewImage = document.getElementById('previewImage');

// 当前请求ID
let currentRequestId = null;

// 添加一个标志，表示是否正在进行请求
let isRequesting = false;

let queuePosition = 0;
let queueTotal = 0;
let isInQueue = false;
let queueId = null;
let queueCheckInterval = null;
let estimatedTimeRemaining = 0;

/**
 * 显示队列状态UI
 */
function showQueueStatus() {
    console.log('显示队列状态UI');
    
    // 获取图片容器，用于显示队列信息
    const imageContainer = document.querySelector('.image-container');
    
    // 检查是否已有队列容器
    let queueContainer = document.querySelector('.queue-container');
    let queueStatus = document.querySelector('.queue-status');
    
    // 如果没有队列容器，在图片容器中创建一个
    if (!queueContainer) {
        console.log('创建队列容器');
        queueContainer = document.createElement('div');
        queueContainer.className = 'queue-container';
        // 确保队列容器不影响图片容器的布局
        queueContainer.style.position = 'absolute';
        queueContainer.style.top = '0';
        queueContainer.style.left = '0';
        queueContainer.style.width = '100%';
        queueContainer.style.height = '100%';
        queueContainer.style.display = 'flex';
        queueContainer.style.justifyContent = 'center';
        queueContainer.style.alignItems = 'center';
        queueContainer.style.zIndex = '10';
        imageContainer.appendChild(queueContainer);
    }
    
    // 如果没有队列状态元素，创建一个
    if (!queueStatus) {
        console.log('创建队列状态元素');
        queueStatus = document.createElement('div');
        queueStatus.className = 'queue-status';
        queueContainer.appendChild(queueStatus);
    }
    
    // 显示队列状态
    queueStatus.classList.remove('hidden');
    
    // 检查是否有之前的图片
    if (previewImage && previewImage.src && !previewImage.src.includes('data:image/svg+xml')) {
        console.log('已有预览图片，设置为半透明背景');
        // 保存当前图片作为背景，确保透明度为50%
        previewImage.style.opacity = '0.5';
        // 移除任何模糊效果，保持图片清晰可见
        previewImage.style.filter = 'none';
        // 确保图片居中对齐
        previewImage.style.margin = '0 auto';
        previewImage.style.display = 'block';
        
        // 添加自定义类
        imageContainer.classList.add('with-prev-image-no-blur');
        // 移除可能存在的with-prev-image类（避免应用模糊效果）
        imageContainer.classList.remove('with-prev-image');
        
        // 调整队列状态的背景透明度，使其不会完全遮挡图片
        if (queueStatus) {
            queueStatus.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
            // 如果是深色模式，使用深色背景
            if (document.body.classList.contains('dark-mode')) {
                queueStatus.style.backgroundColor = 'rgba(40, 44, 52, 0.85)';
            }
            // 增加阴影效果，使其更清晰
            queueStatus.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.2)';
            // 增加圆角
            queueStatus.style.borderRadius = '8px';
            // 确保足够大
            queueStatus.style.minWidth = '300px';
            queueStatus.style.padding = '20px';
            queueStatus.style.textAlign = 'center';
        }
    } else {
        console.log('无预览图片，使用默认队列样式');
        // 没有有效图片，确保移除样式
        imageContainer.classList.remove('with-prev-image');
        imageContainer.classList.remove('with-prev-image-no-blur');
        
        // 恢复队列状态的默认背景
        if (queueStatus) {
            queueStatus.style.backgroundColor = '';
            queueStatus.style.boxShadow = '';
            queueStatus.style.borderRadius = '';
            queueStatus.style.minWidth = '';
            queueStatus.style.padding = '';
            queueStatus.style.textAlign = '';
        }
    }
    
    // 显示加载元素
    if (loadingElement) {
        loadingElement.classList.add('hidden');
    }
    
    // 更新队列信息
    updateQueueDisplay();
}

/**
 * 更新队列状态显示
 * @param {Object} status - 队列状态对象
 */
function updateQueueDisplay(status) {
    // 如果提供了状态，更新队列位置和总数
    if (status) {
        console.log('收到队列状态更新:', status);
        
        // 防止无效值或0值
        if (status.queue_position !== undefined && status.queue_position !== null) {
            queuePosition = Math.max(1, status.queue_position);
        }
        
        if (status.total_queue !== undefined && status.total_queue !== null) {
            queueTotal = Math.max(queuePosition, status.total_queue);
        }
        
        // 更新估计时间
        if (status.estimated_time !== undefined) {
            estimatedTimeRemaining = status.estimated_time;
        }
        
        console.log(`队列位置更新为: ${queuePosition}/${queueTotal}, 预计等待: ${estimatedTimeRemaining} 秒`);
    }
    
    const queueStatus = document.querySelector('.queue-status');
    if (!queueStatus) return;
    
    // 清除之前的内容
    queueStatus.innerHTML = '';
    
    // 创建并添加队列图标
    const queueIcon = document.createElement('div');
    queueIcon.className = 'queue-icon';
    queueIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>`;
    queueStatus.appendChild(queueIcon);
    
    // 创建并添加位置文本
    const positionText = document.createElement('div');
    positionText.className = 'queue-position';
    positionText.textContent = `排队中: 第 ${queuePosition} 位`;
    queueStatus.appendChild(positionText);
    
    // 创建并添加总数文本
    const totalText = document.createElement('div');
    totalText.className = 'queue-total';
    totalText.textContent = `总共有 ${queueTotal} 位小朋友在排队`;
    queueStatus.appendChild(totalText);
    
    // 如果有估计时间，添加
    if (estimatedTimeRemaining > 0) {
        const timeMessage = document.createElement('div');
        timeMessage.className = 'queue-time';
        const minutes = Math.ceil(estimatedTimeRemaining / 60);
        timeMessage.textContent = `预计等待: ${minutes} 分钟`;
        queueStatus.appendChild(timeMessage);
    }
    
    // 创建并添加进度条
    const progressContainer = document.createElement('div');
    progressContainer.className = 'queue-progress';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'queue-progress-bar';
    // 计算进度百分比（确保至少有5%可见）
    const progressPercent = queueTotal > 0 ? Math.max(5, 100 - (queuePosition / queueTotal * 100)) : 5;
    progressBar.style.width = `${progressPercent}%`;
    
    progressContainer.appendChild(progressBar);
    queueStatus.appendChild(progressContainer);
    
    // 添加等待消息
    const waitMessage = document.createElement('div');
    waitMessage.className = 'queue-message';
    
    // 根据队列位置更新提示信息
    if (queuePosition === 1) {
        waitMessage.textContent = '马上就轮到你了！AI正在认真画你的画～';
    } else if (queuePosition <= 3) {
        waitMessage.textContent = '快到你了，再等一小会儿～';
    } else {
        waitMessage.textContent = 'AI老师正在一个一个画画，请稍等一下哦～';
    }
    
    waitMessage.innerHTML += '<span class="queue-pulse"></span>';
    queueStatus.appendChild(waitMessage);
    
    // 添加取消按钮 (确保ID是唯一的)
    const cancelButton = document.createElement('button');
    cancelButton.className = 'queue-cancel';
    cancelButton.id = 'cancelQueueBtn';
    cancelButton.textContent = '取消请求';
    queueStatus.appendChild(cancelButton);
    
    // 确保绑定事件处理函数
    setTimeout(() => {
        const cancelBtn = document.getElementById('cancelQueueBtn');
        if (cancelBtn) {
            // 移除旧的事件监听器，防止重复绑定
            cancelBtn.removeEventListener('click', cancelQueueRequest);
            // 添加新的事件监听器
            cancelBtn.addEventListener('click', cancelQueueRequest);
        }
    }, 0);
}

/**
 * 取消当前队列请求
 */
function cancelQueueRequest() {
    if (!currentRequestId) return;
    
    try {
        console.log('取消请求：', currentRequestId);
        
        // 如果API客户端提供了取消方法，则调用
        if (artClient && typeof artClient.cancelRequest === 'function') {
            artClient.cancelRequest(currentRequestId);
        }
        
        // 隐藏队列状态
        hideQueueStatus();
        
        // 恢复生成按钮状态
        generateBtn.disabled = false;
        generateBtn.textContent = '开始画画!';
        generateBtn.classList.remove('loading-state');
        
        // 重置请求状态标志
        isRequesting = false;
        currentRequestId = null;
        
        console.log('请求已取消');
    } catch (error) {
        console.error('取消请求失败:', error);
    }
}

/**
 * 发送图片生成请求到服务器
 * @param {Object} requestData - 请求数据
 * @returns {Promise} - Promise对象
 */
async function sendGenerationRequest(requestData) {
    // 检查是否已经在请求中
    if (isRequesting) {
        alert('已有一个绘画任务正在进行中，请等待当前任务完成');
        return null;
    }
    
    try {
        // 设置请求状态标志
        isRequesting = true;
        
        // 显示队列状态
        showQueueStatus();
        
        // 禁用生成按钮
        generateBtn.disabled = true;
        generateBtn.textContent = '排队中...';
        generateBtn.classList.add('loading-state');
        
        console.log('准备发送AI绘画请求:', requestData);
        
        // 获取当前队列状态
        try {
            const queueStatusResponse = await artClient.getQueueStatus();
            console.log('当前队列状态:', queueStatusResponse);
            
            if (queueStatusResponse && queueStatusResponse.status === 'success') {
                // 更新队列总数预估值
                queueTotal = queueStatusResponse.total || 0;
                console.log(`队列中已有 ${queueTotal} 人`);
            }
        } catch (err) {
            console.warn('获取队列状态失败:', err);
        }
        
        // 发送请求到服务器
        console.log('发送生成请求...');
        const response = await artClient.generateImage(requestData);
        console.log('服务器响应:', response);
        
        currentRequestId = response.request_id;
        console.log(`请求ID: ${currentRequestId}`);
        
        // 更新队列位置和总数
        if (response.queue_position !== undefined && response.total_queue !== undefined) {
            queuePosition = Math.max(1, response.queue_position);
            queueTotal = Math.max(queuePosition, response.total_queue);
            console.log(`初始队列位置: ${queuePosition}/${queueTotal}`);
        } else {
            // 如果服务器没有返回队列信息，设置默认值
            queuePosition = 1;
            queueTotal = Math.max(1, queueTotal);
            console.warn('服务器未返回队列位置信息，使用默认值');
        }
        
        // 显示初始队列位置
        updateQueueDisplay({
            queue_position: queuePosition,
            total_queue: queueTotal,
            estimated_time: response.estimated_time || 0
        });
        
        // 开始轮询状态
        console.log('开始轮询请求状态...');
        artClient.startStatusPolling(
            currentRequestId,
            updateQueueDisplay,
            handleImageComplete,
            handleRequestError
        );
        
        return response;
    } catch (error) {
        console.error('发送请求失败:', error);
        handleRequestError(error);
        throw error;
    }
}

/**
 * 处理图片生成完成
 * @param {Object} result - 结果对象
 */
function handleImageComplete(result) {
    // 创建新图片对象来预加载图片
    const newImage = new Image();
    
    // 更新队列状态显示，显示正在加载新图片
    const queueStatus = document.querySelector('.queue-status');
    if (queueStatus) {
        queueStatus.innerHTML = '';
        
        // 创建并添加队列图标
        const loadingIcon = document.createElement('div');
        loadingIcon.className = 'queue-icon';
        loadingIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
        </svg>`;
        queueStatus.appendChild(loadingIcon);
        
        // 创建并添加加载消息
        const loadingMessage = document.createElement('div');
        loadingMessage.className = 'queue-position';
        loadingMessage.textContent = '画作已完成，正在加载...';
        queueStatus.appendChild(loadingMessage);
        
        // 添加进度动画
        const waitMessage = document.createElement('div');
        waitMessage.className = 'queue-message';
        waitMessage.textContent = '马上就好了';
        waitMessage.innerHTML += '<span class="queue-pulse"></span>';
        queueStatus.appendChild(waitMessage);
    }
    
    // 当新图片加载完成后执行
    newImage.onload = function() {
        // 获取中文提示词（优先使用窗口全局变量、结果中的中文提示词、或原始提示词）
        let chinesePrompt = window.lastChinesePrompt || result.chinese_prompt || result.prompt;
        
        console.log('画作生成完成，获取中文提示词:');
        console.log('- 全局中文提示词:', window.lastChinesePrompt);
        console.log('- 结果中的中文提示词:', result.chinese_prompt);
        console.log('- 结果中的英文提示词:', result.prompt);
        console.log('- 最终使用的中文提示词:', chinesePrompt);
        
        // 确保中文提示词不为空
        if (!chinesePrompt || chinesePrompt.trim() === '') {
            chinesePrompt = window.lastPromptInput || result.prompt || '无描述';
            console.log('中文提示词为空，使用备用值:', chinesePrompt);
        }
        
        // 保存到画廊
        const workItem = {
            imageUrl: result.image_url,
            prompt: result.prompt,
            chinese_prompt: chinesePrompt,
            timestamp: Date.now(),
            favorite: false
        };
        
        console.log('保存到画廊的作品:', workItem);
        
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
        
        // 新图片已经加载完成，直接设置图片并隐藏队列状态
        // 添加无过渡类
        previewImage.classList.add('no-transition');
        
        // 先设置预览图片源
        previewImage.src = result.image_url;
        
        // 在同一个事件循环中隐藏队列状态，确保无缝切换
        // 隐藏队列状态
        hideQueueStatus();
        
        // 恢复生成按钮状态
        generateBtn.disabled = false;
        generateBtn.textContent = '开始画画!';
        generateBtn.classList.remove('loading-state');
        
        // 显示成功消息，避免递归调用
        console.log('画作生成成功！');
        
        // 稍后移除无过渡类
        setTimeout(() => {
            previewImage.classList.remove('no-transition');
        }, 500);
        
        // 重置请求状态标志
        isRequesting = false;
        currentRequestId = null;
    };
    
    // 设置加载错误处理
    newImage.onerror = function() {
        // 隐藏队列状态
        hideQueueStatus();
        
        // 恢复生成按钮状态
        generateBtn.disabled = false;
        generateBtn.textContent = '开始画画!';
        generateBtn.classList.remove('loading-state');
        
        // 显示错误消息
        console.error('图片加载失败');
        alert('图片加载失败，请重试');
        
        // 重置请求状态标志
        isRequesting = false;
        currentRequestId = null;
    };
    
    // 开始加载图片
    newImage.src = result.image_url;
}

/**
 * 处理请求错误
 * @param {Error} error - 错误对象
 */
function handleRequestError(error) {
    // 隐藏队列状态
    hideQueueStatus();
    
    // 恢复生成按钮状态
    generateBtn.disabled = false;
    generateBtn.textContent = '开始画画!';
    generateBtn.classList.remove('loading-state');
    
    // 显示错误消息
    console.error('生成图片失败:', error);
    alert('生成图片失败，请重试');
    
    // 重置请求状态标志
    isRequesting = false;
    currentRequestId = null;
}

/**
 * 显示友好提示
 * @param {string} message - 提示消息
 */
function showFriendlyAlert(message) {
    // 直接使用alert避免递归调用
    alert(message);
}

/**
 * 显示成功消息
 * @param {string} message - 成功消息
 */
function showSuccess(message) {
    // 直接使用console.log避免递归调用
    console.log(message);
}

/**
 * 隐藏队列状态UI
 */
function hideQueueStatus() {
    // 获取队列状态元素和图片容器
    const queueStatus = document.querySelector('.queue-status');
    const imageContainer = document.querySelector('.image-container');
    
    // 如果有队列状态元素，隐藏它
    if (queueStatus) {
        queueStatus.classList.add('hidden');
        // 恢复队列状态的默认背景
        queueStatus.style.backgroundColor = '';
    }
    
    // 立即恢复图片的正常显示状态，不要有任何过渡效果
    if (previewImage) {
        // 立即恢复完全不透明，没有过渡效果
        previewImage.style.opacity = '1';
        previewImage.style.filter = 'none';
        
        // 使用no-transition类确保没有过渡效果
        if (!previewImage.classList.contains('no-transition')) {
            previewImage.classList.add('no-transition');
            
            // 500毫秒后恢复过渡效果
            setTimeout(() => {
                previewImage.classList.remove('no-transition');
            }, 500);
        }
    }
    
    // 移除有背景图的标记
    if (imageContainer) {
        imageContainer.classList.remove('with-prev-image');
        imageContainer.classList.remove('with-prev-image-no-blur');
    }
    
    // 重置队列变量
    isInQueue = false;
    queueId = null;
    clearInterval(queueCheckInterval);
}

// 导出函数供其他模块使用
window.queueManager = {
    sendGenerationRequest,
    showQueueStatus,
    updateQueueDisplay,
    handleImageComplete,
    handleRequestError,
    cancelQueueRequest
}; 