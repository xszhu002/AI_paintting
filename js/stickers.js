/**
 * 小朋友的AI绘画乐园 - 贴纸功能
 * 实现在画作上添加可拖拽的贴纸功能
 */

// 当DOM完全加载后执行
document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const stickerCanvas = document.getElementById('stickerCanvas');
    const stickers = document.querySelectorAll('.sticker');
    const clearStickersBtn = document.getElementById('clearStickers');
    const previewImage = document.getElementById('previewImage');
    
    // 当前用于追踪的变量
    let activeSticker = null;
    let initialX = 0;
    let initialY = 0;
    let currentX = 0;
    let currentY = 0;
    let xOffset = 0;
    let yOffset = 0;
    let stickersAdded = [];
    
    // 事件监听
    stickers.forEach(sticker => {
        sticker.addEventListener('click', addSticker);
    });
    
    clearStickersBtn.addEventListener('click', clearStickers);
    
    // 将触摸事件转换为鼠标事件（移动设备支持）
    document.addEventListener('touchstart', dragStart, false);
    document.addEventListener('touchend', dragEnd, false);
    document.addEventListener('touchmove', drag, false);
    
    // 鼠标事件处理
    document.addEventListener('mousedown', dragStart, false);
    document.addEventListener('mouseup', dragEnd, false);
    document.addEventListener('mousemove', drag, false);
    
    /**
     * 添加新贴纸到画布
     * @param {Event} e - 点击事件
     */
    function addSticker(e) {
        // 获取贴纸内容
        const stickerContent = e.currentTarget.getAttribute('data-sticker');
        
        // 创建新贴纸元素
        const newSticker = document.createElement('div');
        newSticker.className = 'draggable-sticker';
        newSticker.textContent = stickerContent;
        newSticker.setAttribute('data-sticker-id', Date.now()); // 唯一ID
        
        // 随机定位贴纸到画布上的合理位置
        const canvasRect = stickerCanvas.getBoundingClientRect();
        const maxX = canvasRect.width - 40;
        const maxY = canvasRect.height - 40;
        
        // 随机位置并确保在可见区域内
        const randomX = Math.max(20, Math.floor(Math.random() * maxX));
        const randomY = Math.max(20, Math.floor(Math.random() * maxY));
        
        // 设置贴纸位置
        newSticker.style.left = `${randomX}px`;
        newSticker.style.top = `${randomY}px`;
        
        // 随机旋转角度，让布局更生动
        const randomRotate = Math.floor(Math.random() * 40 - 20);
        newSticker.style.transform = `rotate(${randomRotate}deg)`;
        
        // 添加到画布
        stickerCanvas.appendChild(newSticker);
        
        // 添加到贴纸列表中
        stickersAdded.push(newSticker);
        
        // 显示成功消息
        showFriendlyPopup(`添加了${stickerContent}贴纸！拖动它到你喜欢的位置吧！`);
    }
    
    /**
     * 开始拖动贴纸
     * @param {Event} e - 鼠标/触摸事件
     */
    function dragStart(e) {
        // 确保我们点击的是贴纸
        if (e.target.classList.contains('draggable-sticker')) {
            // 设置当前活动贴纸
            activeSticker = e.target;
            
            // 计算起始位置
            if (e.type === 'touchstart') {
                initialX = e.touches[0].clientX - xOffset;
                initialY = e.touches[0].clientY - yOffset;
            } else {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            }
            
            // 提高当前贴纸的层级，让它在最上面
            activeSticker.style.zIndex = '20';
            
            // 增加一点缩放效果，表示贴纸被选中
            activeSticker.style.transform = 'scale(1.1)';
        }
    }
    
    /**
     * 结束拖动贴纸
     */
    function dragEnd() {
        if (activeSticker) {
            // 重置当前位置为新的偏移量
            initialX = currentX;
            initialY = currentY;
            
            // 恢复贴纸的层级和缩放
            activeSticker.style.zIndex = '15';
            
            // 随机微旋转，让布局更生动
            const randomRotate = Math.floor(Math.random() * 10 - 5);
            activeSticker.style.transform = `rotate(${randomRotate}deg)`;
            
            // 清除活动贴纸
            activeSticker = null;
        }
    }
    
    /**
     * 拖动贴纸
     * @param {Event} e - 鼠标/触摸事件
     */
    function drag(e) {
        if (activeSticker) {
            // 防止默认行为（如滚动）
            e.preventDefault();
            
            // 计算当前位置
            if (e.type === 'touchmove') {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }
            
            // 更新位置偏移量
            xOffset = currentX;
            yOffset = currentY;
            
            // 应用新位置
            setTranslate(currentX, currentY, activeSticker);
        }
    }
    
    /**
     * 设置元素的平移位置
     * @param {number} xPos - X坐标位置
     * @param {number} yPos - Y坐标位置
     * @param {HTMLElement} el - 要移动的元素
     */
    function setTranslate(xPos, yPos, el) {
        // 使用CSS transform来移动元素
        el.style.left = `${xPos}px`;
        el.style.top = `${yPos}px`;
    }
    
    /**
     * 清除所有贴纸
     */
    function clearStickers() {
        if (stickersAdded.length === 0) {
            showFriendlyPopup('还没有添加贴纸哦！');
            return;
        }
        
        // 清除所有贴纸
        while (stickerCanvas.firstChild) {
            stickerCanvas.removeChild(stickerCanvas.firstChild);
        }
        
        // 清空贴纸数组
        stickersAdded = [];
        
        // 显示提示
        showFriendlyPopup('所有贴纸都被清除啦！');
    }
    
    /**
     * 显示友好的提示弹窗
     * @param {string} message - 要显示的消息
     */
    function showFriendlyPopup(message) {
        // 检查main.js中是否有这个函数
        if (typeof window.showFriendlyAlert === 'function') {
            window.showFriendlyAlert(message);
        } else {
            // 如果没有，创建简单的提示
            const popup = document.createElement('div');
            popup.textContent = message;
            popup.style.position = 'fixed';
            popup.style.bottom = '20px';
            popup.style.left = '50%';
            popup.style.transform = 'translateX(-50%)';
            popup.style.backgroundColor = 'rgba(74, 171, 247, 0.9)';
            popup.style.color = 'white';
            popup.style.padding = '10px 20px';
            popup.style.borderRadius = '30px';
            popup.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            popup.style.zIndex = '1000';
            
            // 添加到body
            document.body.appendChild(popup);
            
            // 2秒后移除
            setTimeout(() => {
                document.body.removeChild(popup);
            }, 2000);
        }
    }
}); 