/**
 * 画廊功能JS
 * 负责显示个人画廊和全校画廊
 */

// 初始化API客户端，检查是否已存在全局artClient实例，避免重复声明
let galleryClient;
const serverUrl = window.artClient ? window.artClient.serverUrl : `http://${window.location.hostname}:8080`;
if (window.artClient) {
    // 如果已经存在全局artClient，使用它
    galleryClient = window.artClient;
    console.log('使用现有的artClient实例');
} else {
    // 如果不存在，创建一个新的实例
    galleryClient = new ArtServerClient();
    console.log('创建新的客户端实例用于画廊');
}

// 当前页面模式（个人画廊或全校画廊）
const IS_SCHOOL_GALLERY = window.location.pathname.includes('gallery.html');

// 画廊页码控制
let currentPage = 1;
const itemsPerPage = 12;
let totalItems = 0;
let isLoading = false;
let hasMoreItems = true;

// 当前视图模式（瀑布流或网格）
let currentView = 'masonry';

// 瀑布流布局对象
let masonryLayout = null;

    // DOM元素
    const galleryGrid = document.getElementById('galleryGrid');
    const emptyGallery = document.getElementById('emptyGallery');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// 图片模态框元素
    const imageModal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalPrompt = document.getElementById('modalPrompt');
    const modalChinesePrompt = document.getElementById('modalChinesePrompt'); // 中文提示词元素
    const modalDate = document.getElementById('modalDate');
    const modalAuthor = document.getElementById('modalAuthor'); // 作者信息元素
    const modalIP = document.getElementById('modalIP'); // IP地址元素
    const closeButton = document.querySelector('.close-button');
    const downloadBtn = document.getElementById('downloadBtn');
    const favoriteBtn = document.getElementById('favoriteBtn');
    const copyChinesePromptBtn = document.getElementById('copyChinesePrompt'); // 复制中文提示词按钮
    
/**
 * 动态加载Masonry库
 */
function loadMasonryLibrary() {
    return new Promise((resolve, reject) => {
        if (window.Masonry) {
            resolve(window.Masonry);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js';
        script.onload = () => resolve(window.Masonry);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * 初始化瀑布流
 */
let masonryInstance = null;

function initMasonry() {
    if (currentView !== 'masonry') return;
    
    const galleryGrid = document.querySelector('.gallery-grid');
    
    if (masonryInstance) {
        masonryInstance.destroy();
        masonryInstance = null;
    }
    
    // 清空现有内容
    if (galleryGrid) {
        galleryGrid.innerHTML = '';
    }
    
    // 如果是全校画廊模式，不使用Masonry库，而是使用自定义横向布局
    if (IS_SCHOOL_GALLERY) {
        console.log('使用自定义横向瀑布流布局');
        // 不再使用Masonry库
    } else {
        // 个人画廊可以保留原有逻辑
        console.log('个人画廊使用常规布局');
    }
    }
    
    /**
 * 页面加载时初始化画廊
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 先加载Masonry库
    try {
        await loadMasonryLibrary();
    } catch (error) {
        console.error('Masonry加载错误:', error);
        // 即使没有Masonry也继续，会使用普通网格布局
    }
    
    // 添加修复localStorage中画廊作品的函数调用
    fixGalleryWorks();
    
    initializeGallery();
    setupEventListeners();
    injectMainPageModalStyle();
    
    // 添加滚动监听，实现自动加载更多
    setupScrollListener();
    
    // 添加窗口大小变化监听，重新计算行高
    window.addEventListener('resize', debounce(function() {
        if (IS_SCHOOL_GALLERY && currentView === 'masonry') {
            console.log('窗口大小变化，重新计算行高');
            normalizeAllRowHeights();
        }
    }, 300)); // 300ms防抖
});

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间
 * @returns {Function} - 防抖处理后的函数
 */
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

/**
 * 标准化所有行的高度
 */
function normalizeAllRowHeights() {
    if (!galleryGrid) return;
    
    const rows = galleryGrid.querySelectorAll('.masonry-row');
    rows.forEach(row => {
        row.removeAttribute('data-normalized'); // 移除已处理标记
        normalizeRowHeights(row);
    });
}

/**
 * 修复localStorage中的画廊作品数据，确保所有作品都有chinese_prompt字段
 */
function fixGalleryWorks() {
    // 从localStorage获取画廊作品
    const savedGallery = localStorage.getItem('galleryWorks');
    if (!savedGallery) return;
    
    try {
        // 解析画廊作品数据
        let galleryWorks = JSON.parse(savedGallery);
        let needsUpdate = false;
        
        // 遍历所有作品，检查并修复
        galleryWorks.forEach(work => {
            // 如果没有chinese_prompt字段，或者字段为空，使用prompt字段的值
            if (!work.chinese_prompt || work.chinese_prompt.trim() === '') {
                work.chinese_prompt = work.prompt || '无描述';
                needsUpdate = true;
                console.log('修复画廊作品的中文提示词:', work);
            }
        });
        
        // 如果有修改，保存回localStorage
        if (needsUpdate) {
            localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
            console.log('已修复画廊作品数据，更新了中文提示词字段');
        }
    } catch (error) {
        console.error('修复画廊作品时出错:', error);
    }
}

/**
 * 设置滚动监听，实现滚动到底部自动加载更多
 */
function setupScrollListener() {
    // 创建一个交叉观察器来检测滚动到底部
    const observer = new IntersectionObserver((entries) => {
        // 如果底部元素进入视图，且不在加载中，且还有更多项目可加载
        if (entries[0].isIntersecting && !isLoading && hasMoreItems) {
            if (IS_SCHOOL_GALLERY) {
                // 根据当前视图模式选择加载函数
                if (currentView === 'masonry') {
                loadSchoolGalleryItems();
                } else if (currentView === 'grid') {
                    loadGridGalleryItems();
                }
                } else {
                loadMorePersonalItems();
            }
        }
    }, {
        // 当目标元素与视口底部相交100px时触发
        rootMargin: '0px 0px 100px 0px'
    });
    
    // 创建一个底部检测元素
    let bottomDetector = document.getElementById('bottomDetector');
    
    // 如果不存在，创建一个
    if (!bottomDetector) {
        bottomDetector = document.createElement('div');
        bottomDetector.id = 'bottomDetector';
        bottomDetector.style.height = '10px';
        bottomDetector.style.width = '100%';
        bottomDetector.style.margin = '0';
        bottomDetector.style.padding = '0';
        
        // 添加到gallery-container的末尾
        const galleryContainer = document.querySelector('.gallery-container');
        if (galleryContainer) {
            galleryContainer.appendChild(bottomDetector);
        } else {
            // 如果找不到gallery-container，添加到body末尾
            document.body.appendChild(bottomDetector);
        }
    }
    
    // 开始观察底部检测元素
    observer.observe(bottomDetector);
}

/**
 * 初始化画廊
 */
function initializeGallery() {
    // 设置默认视图
    currentView = localStorage.getItem('galleryView') || 'masonry';
    updateViewButtons();
    
    // 设置默认视图类
    const galleryGrid = document.querySelector('.gallery-grid');
    if (galleryGrid) {
        // 完全重置类名
        galleryGrid.className = '';
        // 添加基本类和视图类
        galleryGrid.classList.add('gallery-grid');
        galleryGrid.classList.add(`${currentView}-view`);
    
        // 如果是学校画廊并且是瀑布流视图，清空现有内容，准备使用行布局
    if (IS_SCHOOL_GALLERY) {
            galleryGrid.innerHTML = '';
            
            // 根据当前视图加载内容
            if (currentView === 'masonry') {
        loadSchoolGalleryItems();
            } else if (currentView === 'grid') {
                loadGridGalleryItems();
            }
    } else {
        updateGalleryDisplay();
        }
    }
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
    // 画廊筛选按钮
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // 当用户点击筛选按钮时，清除学生ID筛选
                if (IS_SCHOOL_GALLERY) {
                    // 检查是否正在筛选学生作品
                    const clearFilterBtn = document.getElementById('clearFilterBtn');
                    if (clearFilterBtn) {
                        // 点击筛选按钮时执行清除筛选操作
                        clearFilterBtn.click();
                    }
                }
                
                // 继续执行普通筛选，指定为来自筛选按钮的点击
                filterGallery(filter, true);
            });
        });
    }

    // 画廊视图切换按钮
    const viewButtons = document.querySelectorAll('.view-btn');
    if (viewButtons) {
        viewButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.getAttribute('data-view');
                viewButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                changeGalleryView(view);
            });
        });
    }

    // 清空画廊按钮
    const clearGalleryBtn = document.getElementById('clearGallery');
    if (clearGalleryBtn) {
        clearGalleryBtn.addEventListener('click', () => {
            if (confirm('确定要清空你的画廊吗？这个操作不能撤销！')) {
                clearGallery();
            }
        });
    }
    
    // 模态框关闭按钮
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            imageModal.style.display = 'none';
        });
    }

    // 点击模态框外部关闭
    window.addEventListener('click', (event) => {
        if (event.target === imageModal) {
            imageModal.style.display = 'none';
        }
    });

    // 下载按钮
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadModalImage);
    }

    // 收藏按钮
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', toggleFavorite);
    }

    // 复制中文提示词按钮
    if (copyChinesePromptBtn) {
        copyChinesePromptBtn.addEventListener('click', copyChinesePrompt);
    }
}

/**
 * 更新个人画廊显示
 * 在主页和画廊页面都可以调用此函数
 */
function updateGalleryDisplay() {
    console.log('更新画廊显示');
    
    // 从本地存储获取画廊作品
    const savedGallery = localStorage.getItem('galleryWorks');
    let galleryWorks = savedGallery ? JSON.parse(savedGallery) : [];
    
    // 找到当前页面上的画廊相关元素
    // 首先检查是否在主页上
    const isMainPage = !IS_SCHOOL_GALLERY && !window.location.pathname.includes('gallery.html');
    
    // 根据当前页面类型获取正确的DOM元素
    const currentEmptyGallery = isMainPage 
        ? document.getElementById('emptyGallery') 
        : emptyGallery;
    
    const currentGalleryGrid = isMainPage 
        ? document.getElementById('galleryItems') 
        : galleryGrid;
    
    // 显示空画廊提示或作品
    if (galleryWorks.length === 0) {
        if (currentEmptyGallery) currentEmptyGallery.classList.remove('hidden');
        if (currentGalleryGrid) currentGalleryGrid.classList.add('hidden');
    } else {
        if (currentEmptyGallery) currentEmptyGallery.classList.add('hidden');
        if (currentGalleryGrid) currentGalleryGrid.classList.remove('hidden');
        
        // 清空现有内容
        if (currentGalleryGrid) currentGalleryGrid.innerHTML = '';
        
        // 显示所有画廊作品，不再限制数量
        const pageItems = galleryWorks;
        
        // 添加作品到网格
        pageItems.forEach(item => {
            addItemToGallery(item, currentGalleryGrid, isMainPage);
        });
    }
}

/**
 * 加载全校画廊作品
 */
async function loadSchoolGalleryItems(studentId) {
    try {
        if (isLoading || !hasMoreItems) return;
        
        isLoading = true;
        
        // 显示加载状态（可以添加一个加载指示器）
        showLoading(true);
        
        // 从服务器获取画廊作品
        const response = await galleryClient.getGalleryItems(currentPage, itemsPerPage, studentId);
        
        // 处理响应
        if (response && response.status === 'success' && response.items) {
            const items = response.items;
            totalItems = response.total || 0;
            
            console.log(`获取到 ${items.length} 个画廊项目`);
            
            // 显示空画廊提示或作品
            if (items.length === 0 && currentPage === 1) {
                if (emptyGallery) emptyGallery.classList.remove('hidden');
                if (galleryGrid) galleryGrid.classList.add('hidden');
            } else {
                if (emptyGallery) emptyGallery.classList.add('hidden');
                if (galleryGrid) galleryGrid.classList.remove('hidden');
                
                // 对items按时间戳从新到旧排序
                items.sort((a, b) => b.timestamp - a.timestamp);
                
                // 如果是第一次加载，清空画廊网格
                if (currentPage === 1) {
                    galleryGrid.innerHTML = '';
                }
                
                // 计算应该放入哪一行
                let currentRowNum = Math.floor((galleryGrid.children.length || 0) / 4);
                let itemsInCurrentRow = galleryGrid.children.length % 4;
                
                // 如果不是整行，获取最后一行
                let currentRow;
                if (itemsInCurrentRow > 0) {
                    currentRow = galleryGrid.lastElementChild;
                } else if (items.length > 0) {
                    // 创建新行
                    currentRow = document.createElement('div');
                    currentRow.className = 'masonry-row';
                    currentRow.setAttribute('data-row-index', currentRowNum);
                    galleryGrid.appendChild(currentRow);
                }
                
                // 添加作品到网格
                items.forEach((item, index) => {
                    // 格式化服务器返回的数据
                    console.log(`处理第 ${index+1} 项: ID=${item._id}, URL=${item.image_url}`);

                    // 检查关键字段是否存在
                    if (!item.student_name && !item.student_id) {
                        console.warn('警告: 作品缺少作者信息:', item._id);
                    }
                    if (!item.ip_address) {
                        console.warn('警告: 作品缺少IP地址:', item._id);
                    }

                    const galleryItem = {
                        id: item._id,
                        imageUrl: item.image_url,
                        prompt: item.prompt,
                        chinese_prompt: item.chinese_prompt || '', // 添加中文提示词
                        timestamp: item.timestamp * 1000, // 转换为毫秒
                        style: item.style,
                        likes: item.likes || 0,
                        // 添加学生信息和IP地址，尝试多种可能的字段名
                        student_name: item.student_name || item.username || '',
                        student_id: item.student_id || '',
                        ip_address: item.ip_address || '',
                        // 根据本地存储判断用户是否已点赞
                        liked: isLikedByUser(item._id)
                    };
                    
                    // 检查当前行是否已有4张图片
                    if (itemsInCurrentRow === 4) {
                        // 处理前一行的高度统一
                        setTimeout(() => normalizeRowHeights(currentRow), 100);
                        
                        // 创建新行
                        currentRow = document.createElement('div');
                        currentRow.className = 'masonry-row';
                        currentRow.setAttribute('data-row-index', ++currentRowNum);
                        galleryGrid.appendChild(currentRow);
                        itemsInCurrentRow = 0;
                    }
                    
                    // 添加到当前行
                    addItemToGallery(galleryItem, currentRow);
                    itemsInCurrentRow++;
                    
                    // 当添加完最后一个项目或者当前行满了时进行行高标准化
                    if (index === items.length - 1 || itemsInCurrentRow === 4) {
                        setTimeout(() => {
                            console.log(`标准化行 ${currentRowNum} 的高度`);
                            normalizeRowHeights(currentRow);
                        }, 200);
                    }
                });
                
                // 更新是否有更多项目
                hasMoreItems = items.length === itemsPerPage && (currentPage * itemsPerPage) < totalItems;
            }
            
            // 更新页码
            currentPage++;
        } else {
            console.error('获取画廊作品失败:', response);
            showToast('获取画廊作品失败，请刷新页面重试', 3000);
        }
    } catch (error) {
        console.error('加载全校画廊失败:', error);
        showToast('加载全校画廊失败，请检查网络连接', 3000);
    } finally {
        // 隐藏加载状态
        showLoading(false);
        
        isLoading = false;
    }
}

/**
 * 标准化行高度，确保同一行内的所有图片容器高度一致
 * @param {HTMLElement} row - 行容器元素
 */
function normalizeRowHeights(row) {
    if (!row || !row.classList.contains('masonry-row')) return;
    
    const galleryItems = row.querySelectorAll('.gallery-item');
    if (galleryItems.length === 0) return;
    
    // 收集每个图片的宽高比
    const itemRatios = [];
    let totalRatio = 0;
    let allImagesLoaded = true;
    
    galleryItems.forEach(item => {
        const img = item.querySelector('img');
        if (img && img.complete && img.naturalWidth > 0) {
            const ratio = img.naturalWidth / img.naturalHeight;
            itemRatios.push(ratio);
            totalRatio += ratio;
        } else {
            // 如果图片未加载完成，使用默认比例
            const defaultRatio = 4/3; // 默认宽高比
            itemRatios.push(defaultRatio);
            totalRatio += defaultRatio;
            allImagesLoaded = false;
        }
    });
    
    // 如果不是所有图片都加载完成，使用默认高度
    if (!allImagesLoaded) {
        console.log('部分图片未加载完成，使用默认高度');
        const defaultHeight = 220; // 默认高度
        
        galleryItems.forEach((item, index) => {
            const imgContainer = item.querySelector('.gallery-img-container');
            const ratio = itemRatios[index];
            
            if (imgContainer) {
                imgContainer.style.height = `${defaultHeight}px`;
                
                // 根据比例分配宽度
                item.style.flexGrow = ratio;
                
                // 最小宽度和最大宽度
                item.style.minWidth = '15%';
                item.style.maxWidth = '40%';
            }
        });
        
        // 标记行已处理
        row.setAttribute('data-normalized', 'true');
        row.style.minHeight = `${defaultHeight + 40}px`; // 行高等于图片高度加上信息区域高度，从60px改为40px
        return;
    }
    
    // 计算适合的行高，使每个图片按宽高比分配宽度
    // 假设行总宽度为100%，减去间隙
    const gapWidth = 20; // 每个间隙的宽度(px)
    const totalGapWidth = gapWidth * (galleryItems.length - 1);
    const rowWidth = row.offsetWidth - totalGapWidth;
    
    // 计算合适的行高
    let rowHeight = Math.min(rowWidth / totalRatio, 350); // 限制最大高度为350px，略微减小
    
    // 确保行高不会太小
    rowHeight = Math.max(rowHeight, 180); // 最小高度为180px，略微减小
    
    console.log('行标准化: 行宽度=', rowWidth, 'px, 总比例=', totalRatio, '计算行高=', rowHeight, 'px');
    
    // 设置每个图片容器的高度和flex-grow
    galleryItems.forEach((item, index) => {
        const imgContainer = item.querySelector('.gallery-img-container');
        const ratio = itemRatios[index];
        
        if (imgContainer) {
            // 设置固定高度
            imgContainer.style.height = `${rowHeight}px`;
            
            // 根据比例分配宽度
            item.style.flexGrow = ratio;
            
            // 确保最小和最大宽度限制
            item.style.minWidth = '15%';
            item.style.maxWidth = '40%';
        }
    });
    
    // 标记行已处理
    row.setAttribute('data-normalized', 'true');
    row.style.minHeight = `${rowHeight + 40}px`; // 行高等于图片高度加上信息区域高度，从60px改为40px
}

/**
 * 显示或隐藏加载指示器
 * @param {boolean} isShow - 是否显示加载指示器
 */
function showLoading(isShow) {
    let loadingIndicator = document.getElementById('loadingIndicator');
    
    if (!loadingIndicator && isShow) {
        // 创建加载指示器
        loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loadingIndicator';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '10px';
        loadingIndicator.style.color = '#888';
        loadingIndicator.textContent = '加载中...';
        
        // 添加到底部检测元素之前
        const bottomDetector = document.getElementById('bottomDetector');
        if (bottomDetector && bottomDetector.parentNode) {
            bottomDetector.parentNode.insertBefore(loadingIndicator, bottomDetector);
        }
    } else if (loadingIndicator) {
        if (isShow) {
            loadingIndicator.style.display = 'block';
        } else {
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * 检查作品是否被当前用户点赞
 * @param {string} itemId - 作品ID
 * @returns {boolean} - 是否已点赞
 */
function isLikedByUser(itemId) {
    const likedItems = localStorage.getItem('likedItems');
    if (!likedItems) return false;
    return JSON.parse(likedItems).includes(itemId);
}

/**
 * 切换作品点赞状态
 * @param {Object} item - 作品对象
 * @param {HTMLElement} button - 点赞按钮
 */
async function toggleItemLike(item, button) {
    try {
        // 获取当前已点赞的作品ID列表
        let likedItems = localStorage.getItem('likedItems');
        likedItems = likedItems ? JSON.parse(likedItems) : [];
        
        // 获取作品ID
        const itemId = item.id;
        
        // 检查是否已点赞
        const isLiked = likedItems.includes(itemId);
        
        // 如果已点赞，取消点赞；否则添加点赞
        if (isLiked) {
            // 从点赞列表中移除
            likedItems = likedItems.filter(id => id !== itemId);
            // 更新按钮状态
            button.innerHTML = '🤍';
            button.title = '点赞';
            // 减少点赞数（仅UI显示）
            item.likes = Math.max(0, (item.likes || 0) - 1);
        } else {
            // 添加到点赞列表
            likedItems.push(itemId);
            // 更新按钮状态
            button.innerHTML = '❤️';
            button.title = '取消点赞';
            // 增加点赞数（仅UI显示）
            item.likes = (item.likes || 0) + 1;
        }
        
        // 更新本地存储
        localStorage.setItem('likedItems', JSON.stringify(likedItems));
        
        // 更新作品对象状态
        item.liked = !isLiked;
        
        // 重要：首先立即更新UI显示的点赞数，给用户即时反馈
        // 获取或创建点赞计数元素
        let countElem = button.querySelector('.like-count');
        if (!countElem) {
            countElem = document.createElement('span');
            countElem.className = 'like-count';
            countElem.style.marginLeft = '3px';
            countElem.style.fontSize = '0.8rem';
            button.appendChild(countElem);
        }
        // 立即更新UI显示的点赞数
        countElem.textContent = item.likes;
        
        // 向服务器发送点赞/取消点赞请求
        try {
            const response = await galleryClient.toggleLike(itemId, isLiked);
            if (response && response.status === 'success') {
                console.log(`服务器端${isLiked ? '取消点赞' : '点赞'}成功，当前点赞数: ${response.likes}`);
                
                // 更新显示的点赞数为服务器返回的最新数据
                if (response.likes !== undefined) {
                    item.likes = response.likes;
                    
                    // 确保计数元素存在且更新它
                    if (countElem) {
                        countElem.textContent = response.likes;
                    }
                }
            } else {
                console.error('服务器端点赞操作失败:', response);
            }
        } catch (serverError) {
            console.error('向服务器发送点赞请求失败:', serverError);
            // 注意：即使服务器请求失败，本地UI状态已更新，保持良好的用户体验
        }
        
        // 显示UI反馈
        const message = isLiked ? '已取消点赞' : '已点赞';
        showToast(message);
        
    } catch (error) {
        console.error('处理点赞操作失败:', error);
        showToast('点赞操作失败，请重试');
    }
}

/**
 * 显示临时提示消息
 * @param {string} message - 提示消息
 * @param {number} duration - 显示时长，默认2秒
 */
function showToast(message, duration = 2000) {
    // 查找已有的toast元素
    let toast = document.getElementById('galleryToast');
    
    // 如果不存在，创建一个新的
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'galleryToast';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        toast.style.color = 'white';
        toast.style.padding = '8px 16px';
        toast.style.borderRadius = '4px';
        toast.style.zIndex = '9999';
        toast.style.transition = 'opacity 0.3s ease-in-out';
        document.body.appendChild(toast);
    }
    
    // 更新消息
    toast.textContent = message;
    toast.style.opacity = '1';
    
    // 设置定时器，隐藏toast
    setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

/**
 * 加载更多全校画廊作品
 */
function loadMoreSchoolItems() {
    currentPage++;
    loadSchoolGalleryItems();
}

/**
 * 加载更多个人画廊作品
 */
function loadMorePersonalItems() {
    // 暂时不需要实现
}

/**
 * 添加作品到画廊
 * @param {Object} item - 作品项
 * @param {HTMLElement} targetGrid - 目标画廊网格元素
 * @param {boolean} isSimpleView - 是否使用简化视图（主页上使用）
 */
function addItemToGallery(item, targetGrid = galleryGrid, isSimpleView = false) {
    if (!targetGrid) return;
    
    // 如果targetGrid不是masonry-row，可能是整个画廊容器
    let targetRow = targetGrid;
    
    // 检查是否需要创建行容器
    if (!targetGrid.classList.contains('masonry-row') && !isSimpleView) {
        // 在全校画廊模式下，使用行容器
        if (IS_SCHOOL_GALLERY) {
            // 创建新行或使用已有的最后一行（如果不足4项）
            if (!targetGrid.lastElementChild || 
                !targetGrid.lastElementChild.classList.contains('masonry-row') ||
                targetGrid.lastElementChild.children.length >= 4) {
                
                targetRow = document.createElement('div');
                targetRow.className = 'masonry-row';
                
                // 设置行索引
                const rowIndex = targetGrid.querySelectorAll('.masonry-row').length;
                targetRow.setAttribute('data-row-index', rowIndex);
                
                targetGrid.appendChild(targetRow);
            } else {
                targetRow = targetGrid.lastElementChild;
            }
        }
    }
    
    // 创建画廊项容器
    const galleryItem = document.createElement('div');
    galleryItem.className = 'gallery-item';
    galleryItem.setAttribute('data-timestamp', item.timestamp);
    if (item.favorite) {
        galleryItem.setAttribute('data-favorite', 'true');
    }
    
    // 创建图片容器
    const imgContainer = document.createElement('div');
    imgContainer.className = 'gallery-img-container';
    
    // 创建图片元素
        const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.prompt || '绘画作品';
        img.loading = 'lazy';
    img.onerror = function() {
        console.error('图片加载失败:', item.imageUrl);
        this.src = 'images/image-error.png';
        this.alt = '图片加载失败';
    };
    
    // 图片加载时处理
    img.addEventListener('load', function() {
        // 获取图片自然宽高比
        if (this.naturalWidth > 0) {
            const imgWidth = this.naturalWidth;
            const imgHeight = this.naturalHeight;
            const ratio = imgWidth / imgHeight;
            
            console.log('图片加载完成:', {
                url: item.imageUrl,
                width: imgWidth,
                height: imgHeight,
                ratio: ratio
            });
            
            // 保存图片宽高比作为数据属性
            galleryItem.setAttribute('data-ratio', ratio);
            
            // 如果行已经有图片，等待所有图片加载完成后统一处理行高度
            if (targetRow.children.length >= 4 || targetRow.getAttribute('data-normalized') !== 'true') {
                normalizeRowHeights(targetRow);
            }
        }
    });
    
    imgContainer.appendChild(img);
    
    // 如果是简化视图（主页），显示缩略图布局，带预览和删除图标
    if (isSimpleView) {
        // 创建操作按钮覆盖层
        const overlayActions = document.createElement('div');
        overlayActions.className = 'gallery-item-overlay';
        
        // 添加预览按钮（眼睛图标）
        const viewBtn = document.createElement('button');
        viewBtn.className = 'gallery-action-btn view-btn';
        viewBtn.innerHTML = '👁️';
        viewBtn.title = '查看大图';
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止点击事件冒泡
            openImageModal(item);
        });
        
        // 添加删除按钮（垃圾桶图标）
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gallery-action-btn delete-btn';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止点击事件冒泡
            deleteItem(item, galleryItem);
        });
        
        // 将按钮添加到覆盖层
        overlayActions.appendChild(viewBtn);
        overlayActions.appendChild(deleteBtn);
        
        // 添加到图片容器上
        imgContainer.appendChild(overlayActions);
        
        // 添加点击查看功能（点击图片区域）
        imgContainer.addEventListener('click', () => {
            openImageModal(item);
        });
        
        galleryItem.appendChild(imgContainer);
        targetRow.appendChild(galleryItem);
        
        return;
    }
    
    // 以下是完整视图的代码（画廊页面）
    // 添加点击事件打开模态框
    imgContainer.addEventListener('click', () => {
        openImageModal(item);
    });
    
    // 创建作品信息
    const itemInfo = document.createElement('div');
    itemInfo.className = 'gallery-item-info';
    
    // 添加作品时间
    const date = new Date(item.timestamp);
    const timeElem = document.createElement('div');
    timeElem.className = 'gallery-item-time';
    timeElem.textContent = formatDate(date);
    itemInfo.appendChild(timeElem);
    
    // 添加操作按钮
    const actions = document.createElement('div');
    actions.className = 'gallery-item-actions';
    
    // 在全校画廊中显示点赞按钮，在个人画廊中显示收藏按钮
    if (IS_SCHOOL_GALLERY) {
        const likeBtn = document.createElement('button');
        likeBtn.className = 'gallery-action-btn like-btn';
        likeBtn.innerHTML = item.liked ? '❤️' : '🤍';
        likeBtn.title = item.liked ? '取消点赞' : '点赞';
        
        // 添加点赞计数显示
        const likesCount = document.createElement('span');
        likesCount.className = 'like-count';
        likesCount.textContent = item.likes || 0;
        likesCount.style.marginLeft = '3px';
        likesCount.style.fontSize = '0.8rem';
        likeBtn.appendChild(likesCount);
        
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItemLike(item, likeBtn);
        });
        actions.appendChild(likeBtn);
    } else {
        // 添加收藏按钮
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'gallery-action-btn favorite-btn';
        favoriteBtn.innerHTML = item.favorite ? '★' : '☆';
        favoriteBtn.title = item.favorite ? '取消收藏' : '收藏';
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItemFavorite(item, favoriteBtn, galleryItem);
        });
        actions.appendChild(favoriteBtn);
    }
    
    // 添加下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'gallery-action-btn download-btn';
    downloadBtn.innerHTML = '↓';
    downloadBtn.title = '下载';
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadImage(item.imageUrl, `画作_${date.getTime()}`);
    });
    actions.appendChild(downloadBtn);
    
    // 添加删除按钮（仅在个人画廊中显示）
    if (!IS_SCHOOL_GALLERY) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gallery-action-btn delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteItem(item, galleryItem);
        });
        actions.appendChild(deleteBtn);
    }
    
    itemInfo.appendChild(actions);
    
    // 组装画廊项
    galleryItem.appendChild(imgContainer);
    galleryItem.appendChild(itemInfo);
    
    // 添加到目标容器
    targetRow.appendChild(galleryItem);
}

/**
 * 打开图片模态框
 * @param {Object} item - 作品项
 */
function openImageModal(item) {
    // 检查是否在主页上
    const isMainPage = !IS_SCHOOL_GALLERY && !window.location.pathname.includes('gallery.html');
    
    // 确保item对象具有chinese_prompt字段
    if (!item.chinese_prompt || item.chinese_prompt.trim() === '') {
        item.chinese_prompt = item.prompt || '无描述';
        console.log('在打开模态框时修复了缺失的中文提示词字段:', item);
    }
    
    // 测试输出：打印所有属性和值
    console.log('模态框打开时的完整item对象:');
    for (const key in item) {
        console.log(`${key}: ${item[key]}`);
    }
    
    // 获取当前页面上的模态框元素
    let currentModal, currentModalImage, currentModalPrompt, currentModalDate, currentModalChinesePrompt, currentModalAuthor, currentModalIP;
    
    if (isMainPage) {
        // 如果在主页上，可能需要创建一个新的模态框
        let mainPageModal = document.getElementById('mainImageModal');
        
        if (!mainPageModal) {
            // 如果模态框不存在，创建一个
            mainPageModal = document.createElement('div');
            mainPageModal.id = 'mainImageModal';
            mainPageModal.className = 'modal';
            
            // 创建模态框内容 - 使用与学校画廊完全一致的结构
            mainPageModal.innerHTML = `
                <div class="modal-content large-modal">
                    <span class="close-button">&times;</span>
                    <div class="modal-flex-container">
                        <div class="modal-image-container">
                            <img id="mainModalImage" src="" alt="画作详情">
                        </div>
                        <div class="modal-side-panel">
                            <h3>作品信息</h3>
                            <div id="mainModalChinesePrompt" class="modal-chinese-prompt"></div>
                            <div class="modal-prompt-label">英文提示词:</div>
                            <p id="mainModalPrompt" class="modal-prompt"></p>
                            <p id="mainModalDate"></p>
                            <div class="info-section mb-3" style="display: none;">
                                <h6>作者:</h6>
                                <p id="mainModalAuthor" class="text-muted"></p>
                            </div>
                            <div class="info-section mb-3" style="display: none;">
                                <h6>IP地址:</h6>
                                <p id="mainModalIP" class="text-muted" style="font-family: monospace;"></p>
                            </div>
                            <button class="btn btn-sm btn-outline-secondary" id="mainCopyChinesePrompt">复制中文提示词</button>
                            <div class="modal-actions">
                                <button id="mainDownloadBtn" class="btn btn-primary">下载图片</button>
                                <button id="mainSubmitToGalleryBtn" class="btn btn-info">提交到学校画廊</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 添加到页面
            document.body.appendChild(mainPageModal);
            
            // 绑定关闭事件
            const closeBtn = mainPageModal.querySelector('.close-button');
            closeBtn.addEventListener('click', () => {
                mainPageModal.style.display = 'none';
            });
            
            // 绑定点击外部关闭
            window.addEventListener('click', (event) => {
                if (event.target === mainPageModal) {
                    mainPageModal.style.display = 'none';
                }
            });
            
            // 绑定下载按钮事件
            const mainDownloadBtn = document.getElementById('mainDownloadBtn');
            mainDownloadBtn.addEventListener('click', () => {
                const modalImage = document.getElementById('mainModalImage');
                if (modalImage && modalImage.src) {
                    downloadImage(modalImage.src, `画作_${Date.now()}`);
                }
            });
            
            // 绑定提交到学校画廊按钮事件
            const mainSubmitToGalleryBtn = document.getElementById('mainSubmitToGalleryBtn');
            // 不在创建时绑定事件，而是在打开模态框时绑定
            // 移除这个事件绑定，防止重复触发
            /*
            mainSubmitToGalleryBtn.addEventListener('click', (event) => {
                submitToSchoolGallery(event, {
                    imageUrl: document.getElementById('mainModalImage').src,
                    prompt: document.getElementById('mainModalPrompt').textContent,
                    chinese_prompt: document.getElementById('mainModalChinesePrompt').textContent
                });
            });
            */
            
            // 绑定复制中文提示词按钮事件
            const mainCopyChinesePromptBtn = document.getElementById('mainCopyChinesePrompt');
            if (mainCopyChinesePromptBtn) {
                mainCopyChinesePromptBtn.addEventListener('click', () => {
                    const chinesePrompt = document.getElementById('mainModalChinesePrompt').textContent;
                    // 创建一个临时输入框来复制文本
                    const tempInput = document.createElement('input');
                    tempInput.value = chinesePrompt;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                    showToast('中文提示词已复制到剪贴板');
                });
            }
        }
        
        // 设置当前模态框元素
        currentModal = mainPageModal;
        currentModalImage = document.getElementById('mainModalImage');
        currentModalChinesePrompt = document.getElementById('mainModalChinesePrompt');
        currentModalPrompt = document.getElementById('mainModalPrompt');
        currentModalDate = document.getElementById('mainModalDate');
        currentModalAuthor = document.getElementById('mainModalAuthor');
        currentModalIP = document.getElementById('mainModalIP');
    } else {
        // 在画廊页面使用已存在的模态框
        currentModal = imageModal;
        currentModalImage = modalImage;
        currentModalChinesePrompt = modalChinesePrompt;
        currentModalPrompt = modalPrompt;
        currentModalDate = modalDate;
        currentModalAuthor = modalAuthor;
        currentModalIP = modalIP;
    }
    
    // 如果找不到必要的元素，退出
    if (!currentModal || !currentModalImage || !currentModalPrompt || !currentModalDate) {
        console.error('无法找到模态框元素');
        return;
    }
    
    // 设置模态框内容
    currentModalImage.src = item.imageUrl;
    
    // 调试输出，检查item对象中的中文提示词
    console.log('打开模态框，项目数据:', item);
    console.log('中文提示词:', item.chinese_prompt);
    console.log('英文提示词:', item.prompt);
    
    // 优先处理中文提示词
    if (currentModalChinesePrompt) {
        // 确保item.chinese_prompt存在且不为空
        const hasChinesePrompt = item.chinese_prompt && item.chinese_prompt.trim() !== '';
        const hasPrompt = item.prompt && item.prompt.trim() !== '';
        
        if (hasChinesePrompt) {
            // 有中文提示词，使用中文提示词
            currentModalChinesePrompt.textContent = item.chinese_prompt;
        } else if (hasPrompt) {
            // 没有中文但有英文，使用英文提示词作为中文提示词区域的内容
            currentModalChinesePrompt.textContent = item.prompt;
        } else {
            // 两者都没有，显示提示
            currentModalChinesePrompt.textContent = '无提示词';
        }
        
        // 确保中文提示词区域始终显示
        currentModalChinesePrompt.style.display = 'block';
        
        // 显示或隐藏复制按钮
        const copyBtn = isMainPage ? 
            document.getElementById('mainCopyChinesePrompt') : 
            copyChinesePromptBtn;
            
        if (copyBtn) {
            copyBtn.style.display = (hasChinesePrompt || hasPrompt) ? 'inline-block' : 'none';
        }
    }
    
    // 决定是否显示英文提示词区域
    const hasChinesePrompt = item.chinese_prompt && item.chinese_prompt.trim() !== '';
    const hasPrompt = item.prompt && item.prompt.trim() !== '';
    
    // 只有当英文提示词与中文提示词不同且两者都存在时才显示英文提示词
    const shouldShowEnglishPrompt = hasChinesePrompt && hasPrompt && 
                               (item.prompt !== item.chinese_prompt);
    
    // 设置英文提示词
    currentModalPrompt.textContent = item.prompt || '';
    currentModalPrompt.style.display = shouldShowEnglishPrompt ? 'block' : 'none';
    
    // 显示或隐藏英文提示词标签
    const promptLabel = isMainPage ? 
        document.querySelector('#mainImageModal .modal-prompt-label') : 
        document.querySelector('#imageModal .modal-prompt-label');
    
    if (promptLabel) {
        promptLabel.style.display = shouldShowEnglishPrompt ? 'block' : 'none';
    }
    
    // 设置创建时间
    currentModalDate.textContent = `创建时间: ${formatDate(new Date(item.timestamp))}`;
    
    // 设置作者信息和IP地址（仅在学校画廊显示）
    if (IS_SCHOOL_GALLERY) {
        console.log('显示作者和IP信息，item数据:', item);
        
        // 尝试多种可能的字段名获取作者信息
        const authorName = item.student_name || item.username || '';
        const authorId = item.student_id || '';
        const ipAddress = item.ip_address || '未知';
        
        console.log('提取的作者信息:', {authorName, authorId, ipAddress});
        
        if (currentModalAuthor) {
            if (authorName && authorId) {
                // 创建可点击链接，点击后筛选该学生的作品
                currentModalAuthor.innerHTML = `<a href="javascript:void(0);" class="author-link" data-student-id="${authorId}">${authorName} (${authorId})</a>`;
                
                // 为新创建的链接添加点击事件
                const authorLink = currentModalAuthor.querySelector('.author-link');
                if (authorLink) {
                    authorLink.addEventListener('click', function() {
                        const studentId = this.getAttribute('data-student-id');
                        if (studentId) {
                            // 关闭当前模态框
                            currentModal.style.display = 'none';
                            
                            // 通过学号筛选作品
                            filterGalleryByStudentId(studentId);
                        }
                    });
                }
            } else if (authorId) {
                // 只有学号，也创建链接
                currentModalAuthor.innerHTML = `<a href="javascript:void(0);" class="author-link" data-student-id="${authorId}">${authorId}</a>`;
                
                // 为新创建的链接添加点击事件
                const authorLink = currentModalAuthor.querySelector('.author-link');
                if (authorLink) {
                    authorLink.addEventListener('click', function() {
                        const studentId = this.getAttribute('data-student-id');
                        if (studentId) {
                            // 关闭当前模态框
                            currentModal.style.display = 'none';
                            
                            // 通过学号筛选作品
                            filterGalleryByStudentId(studentId);
                        }
                    });
                }
            } else if (authorName) {
                currentModalAuthor.textContent = authorName;
            } else {
                currentModalAuthor.textContent = '匿名用户';
            }
            
            // 显示作者信息区域
            const authorSection = currentModalAuthor.closest('.info-section');
            if (authorSection) {
                authorSection.style.display = 'block';
                console.log('显示作者信息区域');
            }
        } else {
            console.warn('找不到作者信息元素');
        }
        
        if (currentModalIP) {
            currentModalIP.textContent = ipAddress;
            
            // 显示IP地址区域
            const ipSection = currentModalIP.closest('.info-section');
            if (ipSection) {
                ipSection.style.display = 'block';
                console.log('显示IP地址区域');
            }
        } else {
            console.warn('找不到IP地址元素');
        }
    } else {
        // 在个人画廊中隐藏作者和IP信息
        const authorSection = currentModalAuthor ? currentModalAuthor.closest('.info-section') : null;
        const ipSection = currentModalIP ? currentModalIP.closest('.info-section') : null;
        
        if (authorSection) authorSection.style.display = 'none';
        if (ipSection) ipSection.style.display = 'none';
    }
    
    // 检查此作品是否已提交到学校画廊
    const isSubmitted = isSubmittedToSchoolGallery(item.imageUrl);
    
    // 如果在画廊页面上有额外的按钮
    if (!isMainPage) {
        // 设置下载按钮
        if (downloadBtn) {
            downloadBtn.onclick = () => downloadImage(item.imageUrl, `画作_${item.timestamp}`);
        }
        
        // 处理点赞按钮
        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn && IS_SCHOOL_GALLERY) {
            // 设置点赞按钮状态
            if (item.liked) {
                likeBtn.innerHTML = '❤️ <span class="like-count">' + (item.likes || 0) + '</span>';
                likeBtn.title = '取消点赞';
                likeBtn.className = 'btn btn-danger';
            } else {
                likeBtn.innerHTML = '🤍 <span class="like-count">' + (item.likes || 0) + '</span>';
                likeBtn.title = '点赞';
                likeBtn.className = 'btn btn-success';
            }
            
            // 绑定点赞事件
            likeBtn.onclick = () => toggleItemLike(item, likeBtn);
        }
        
        // 设置收藏按钮
        if (favoriteBtn) {
            favoriteBtn.textContent = item.favorite ? '取消收藏' : '收藏作品';
            favoriteBtn.dataset.itemTimestamp = item.timestamp;
        }
        
        // 设置提交到学校画廊按钮
        const submitToGalleryBtn = document.getElementById('submitToGalleryBtn');
        if (submitToGalleryBtn && !IS_SCHOOL_GALLERY) {  // 只在个人画廊显示提交按钮
            submitToGalleryBtn.dataset.imageUrl = item.imageUrl;
            submitToGalleryBtn.dataset.prompt = item.prompt || '无描述';
            
            if (isSubmitted) {
                submitToGalleryBtn.textContent = '取消提交';
                submitToGalleryBtn.disabled = false;
                submitToGalleryBtn.className = 'btn btn-warning';
            } else {
                submitToGalleryBtn.textContent = '提交到学校画廊';
                submitToGalleryBtn.disabled = false;
                submitToGalleryBtn.className = 'btn btn-info';
            }
            
            // 先移除可能的旧事件绑定
            submitToGalleryBtn.onclick = null;
            
            // 使用一次性事件监听绑定
            const submitHandler = function(event) {
                // 阻止事件冒泡和默认行为
                event.stopPropagation();
                event.preventDefault();
                // 移除事件监听器，防止重复触发
                submitToGalleryBtn.removeEventListener('click', submitHandler);
                // 调用提交函数
                submitToSchoolGallery(event, item);
            };
            
            // 添加新的事件处理函数
            submitToGalleryBtn.addEventListener('click', submitHandler);
        } else if (submitToGalleryBtn && IS_SCHOOL_GALLERY) {
            // 在学校画廊页面隐藏提交按钮
            submitToGalleryBtn.style.display = 'none';
        }
    } else {
        // 如果在主页上，也更新提交到学校画廊按钮
        const mainSubmitToGalleryBtn = document.getElementById('mainSubmitToGalleryBtn');
        if (mainSubmitToGalleryBtn && !IS_SCHOOL_GALLERY) {  // 只在个人画廊显示提交按钮
            if (isSubmitted) {
                mainSubmitToGalleryBtn.textContent = '取消提交';
                mainSubmitToGalleryBtn.disabled = false;
                mainSubmitToGalleryBtn.className = 'btn btn-warning';
            } else {
                mainSubmitToGalleryBtn.textContent = '提交到学校画廊';
                mainSubmitToGalleryBtn.disabled = false;
                mainSubmitToGalleryBtn.className = 'btn btn-info';
            }
            
            // 先移除可能的旧事件绑定
            mainSubmitToGalleryBtn.onclick = null;
            
            // 使用一次性事件监听绑定
            const mainSubmitHandler = function(event) {
                // 阻止事件冒泡和默认行为
                event.stopPropagation();
                event.preventDefault();
                // 移除事件监听器，防止重复触发
                mainSubmitToGalleryBtn.removeEventListener('click', mainSubmitHandler);
                // 调用提交函数
                submitToSchoolGallery(event, {
                    imageUrl: document.getElementById('mainModalImage').src,
                    prompt: document.getElementById('mainModalPrompt').textContent,
                    chinese_prompt: document.getElementById('mainModalChinesePrompt').textContent
                });
            };
            
            // 添加新的事件处理函数
            mainSubmitToGalleryBtn.addEventListener('click', mainSubmitHandler);
        } else if (mainSubmitToGalleryBtn && IS_SCHOOL_GALLERY) {
            // 在学校画廊页面隐藏提交按钮
            mainSubmitToGalleryBtn.style.display = 'none';
        }
    }
    
    // 显示模态框
    currentModal.style.display = 'block';
}

/**
 * 下载模态框中的图片
 */
function downloadModalImage() {
    if (modalImage && modalImage.src) {
        downloadImage(modalImage.src, `画作_${Date.now()}`);
    }
    }
    
    /**
     * 下载图片
 * @param {string} url - 图片URL
 * @param {string} filename - 文件名
 */
function downloadImage(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    }
    
    /**
     * 切换收藏状态
     */
    function toggleFavorite() {
    if (!favoriteBtn) return;
    
    const timestamp = parseInt(favoriteBtn.dataset.itemTimestamp);
    if (!timestamp) return;
    
    // 从本地存储获取画廊作品
    const savedGallery = localStorage.getItem('galleryWorks');
    let galleryWorks = savedGallery ? JSON.parse(savedGallery) : [];
    
    // 查找作品并更新收藏状态
    const index = galleryWorks.findIndex(item => item.timestamp === timestamp);
    if (index !== -1) {
        galleryWorks[index].favorite = !galleryWorks[index].favorite;
            
            // 更新本地存储
            localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
            
        // 更新按钮文本
        favoriteBtn.textContent = galleryWorks[index].favorite ? '取消收藏' : '收藏作品';
        
        // 更新画廊项
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            if (parseInt(item.getAttribute('data-timestamp')) === timestamp) {
                if (galleryWorks[index].favorite) {
                    item.setAttribute('data-favorite', 'true');
                    item.querySelector('.favorite-btn').innerHTML = '★';
                    item.querySelector('.favorite-btn').title = '取消收藏';
            } else {
                    item.removeAttribute('data-favorite');
                    item.querySelector('.favorite-btn').innerHTML = '☆';
                    item.querySelector('.favorite-btn').title = '收藏';
                }
            }
        });
    }
}

/**
 * 切换画廊项的收藏状态
 * @param {Object} item - 作品项
 * @param {HTMLElement} button - 收藏按钮
 * @param {HTMLElement} galleryItem - 画廊项元素
 */
function toggleItemFavorite(item, button, galleryItem) {
    // 只有个人画廊才能收藏
    if (IS_SCHOOL_GALLERY) return;
    
    // 从本地存储获取画廊作品
    const savedGallery = localStorage.getItem('galleryWorks');
    let galleryWorks = savedGallery ? JSON.parse(savedGallery) : [];
    
    // 查找作品并更新收藏状态
    const index = galleryWorks.findIndex(work => work.timestamp === item.timestamp);
    if (index !== -1) {
        galleryWorks[index].favorite = !galleryWorks[index].favorite;
            
            // 更新本地存储
            localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
            
        // 更新按钮和画廊项
        if (galleryWorks[index].favorite) {
            button.innerHTML = '★';
            button.title = '取消收藏';
            galleryItem.setAttribute('data-favorite', 'true');
            } else {
            button.innerHTML = '☆';
            button.title = '收藏';
            galleryItem.removeAttribute('data-favorite');
            }
        }
    }
    
    /**
 * 删除画廊项
 * @param {Object} item - 作品项
 * @param {HTMLElement} galleryItem - 画廊项元素
 */
function deleteItem(item, galleryItem) {
    if (confirm('确定要删除这个作品吗？')) {
        // 从本地存储获取画廊作品
        const savedGallery = localStorage.getItem('galleryWorks');
        let galleryWorks = savedGallery ? JSON.parse(savedGallery) : [];
        
        // 过滤掉要删除的作品
        galleryWorks = galleryWorks.filter(work => work.timestamp !== item.timestamp);
        
        // 更新本地存储
        localStorage.setItem('galleryWorks', JSON.stringify(galleryWorks));
        
        // 从DOM中移除画廊项
        galleryItem.remove();
        
        // 检查是否在主页上
        const isMainPage = !IS_SCHOOL_GALLERY && !window.location.pathname.includes('gallery.html');
        const currentEmptyGallery = isMainPage 
            ? document.getElementById('emptyGallery') 
            : emptyGallery;
        const currentGalleryGrid = isMainPage 
            ? document.getElementById('galleryItems') 
            : galleryGrid;
        
        // 如果没有作品了，显示空画廊提示
        if (galleryWorks.length === 0) {
            if (currentEmptyGallery) currentEmptyGallery.classList.remove('hidden');
            if (currentGalleryGrid) currentGalleryGrid.classList.add('hidden');
        }
    }
}

/**
 * 清空画廊
 */
function clearGallery() {
    // 清空本地存储
    localStorage.removeItem('galleryWorks');
    
    // 清空画廊网格
    if (galleryGrid) galleryGrid.innerHTML = '';
    
    // 显示空画廊提示
    if (emptyGallery) emptyGallery.classList.remove('hidden');
    if (galleryGrid) galleryGrid.classList.add('hidden');
}

/**
 * 按类型筛选画廊
 * @param {string} filter - 筛选类型
 * @param {boolean} fromFilterButton - 是否来自筛选按钮的点击
 */
function filterGallery(filter, fromFilterButton = true) {
    if (!galleryGrid) return;
    
    // 当点击筛选按钮时，清除学生ID筛选
    // 来自筛选按钮的点击已经通过清除筛选按钮处理过，不需要再次处理
    if (IS_SCHOOL_GALLERY && !fromFilterButton) {
        // 重置页码和内容
        clearGallery();
        currentPage = 1;
        hasMoreItems = true;
        
        // 恢复默认标题
        const galleryHeader = document.querySelector('.gallery-header .subtitle');
        if (galleryHeader) {
            galleryHeader.textContent = '这里展示了同学们的优秀AI绘画作品';
            
            // 移除清除筛选按钮
            const clearFilterBtn = document.getElementById('clearFilterBtn');
            if (clearFilterBtn && clearFilterBtn.parentNode) {
                clearFilterBtn.parentNode.removeChild(clearFilterBtn);
            }
        }
        
        // 重新加载相应的筛选作品
        if (currentView === 'masonry') {
            loadSchoolGalleryItems();
        } else {
            loadGridGalleryItems();
        }
    } else if (IS_SCHOOL_GALLERY) {
        // 在学校画廊中，来自筛选按钮的点击，直接加载相应内容
        // 此处不清除画廊，因为已经通过clearFilterBtn.click()清除过了
        if (currentView === 'masonry') {
            loadSchoolGalleryItems();
        } else {
            loadGridGalleryItems();
        }
    }
    
    // 原有的筛选功能保留，但目前在学校画廊中不会被调用
    // 因为我们现在直接通过API重新加载内容
    if (!IS_SCHOOL_GALLERY) {
    const items = galleryGrid.querySelectorAll('.gallery-item');
    
    // 应用筛选
    items.forEach(item => {
        if (filter === 'all') {
            item.style.display = 'block';
        } else if (filter === 'favorite') {
            item.style.display = item.hasAttribute('data-favorite') ? 'block' : 'none';
        } else if (filter === 'recent') {
            // 获取时间戳
            const timestamp = parseInt(item.getAttribute('data-timestamp'));
            const now = Date.now();
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
            
            item.style.display = timestamp >= oneWeekAgo ? 'block' : 'none';
        }
    });
    }
}

/**
 * 更改画廊视图
 * @param {string} view - 视图类型
 */
function changeGalleryView(view) {
    // 如果视图没有变化，不做任何操作
    if (currentView === view) return;
    
    currentView = view;
    localStorage.setItem('galleryView', view);
    
    const galleryGrid = document.querySelector('.gallery-grid');
    if (galleryGrid) {
        // 完全重置类名
        galleryGrid.className = '';
        // 添加基本类和视图类
        galleryGrid.classList.add('gallery-grid');
        galleryGrid.classList.add(`${view}-view`);
        
        // 如果是学校画廊，需要重新加载内容
        if (IS_SCHOOL_GALLERY) {
            // 清空现有内容
            galleryGrid.innerHTML = '';
            
            // 重置页码和状态
            currentPage = 1;
            hasMoreItems = true;
            isLoading = false;
            
            // 等待DOM更新后再加载内容
            setTimeout(() => {
                // 检查是否正在筛选学生作品
                const galleryHeader = document.querySelector('.gallery-header .subtitle');
                const clearFilterBtn = document.getElementById('clearFilterBtn');
                
                // 如果存在清除筛选按钮，说明正在筛选学生作品
                if (clearFilterBtn && galleryHeader) {
                    // 提取当前筛选的学生ID
                    const headerText = galleryHeader.textContent;
                    const match = headerText.match(/学号为\s*(\d+)/);
                    if (match && match[1]) {
                        const studentId = match[1];
                        
                        // 重新加载画廊内容，保持学生ID筛选
                        if (view === 'masonry') {
                            loadSchoolGalleryItems(studentId);
                        } else if (view === 'grid') {
                            loadGridGalleryItems(studentId);
                        }
                        return; // 已经重新加载，不需要执行后面的代码
                    }
                }
                
                // 如果没有筛选，或者无法获取学生ID，正常重新加载内容
                if (view === 'masonry') {
                    loadSchoolGalleryItems();
                } else if (view === 'grid') {
                    loadGridGalleryItems();
                }
            }, 50); // 短暂延迟确保DOM已更新
        } else if (view === 'masonry') {
            // 切换到瀑布流视图后，重新计算行高
            setTimeout(normalizeAllRowHeights, 500);
        }
    }
    
    updateViewButtons();
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @returns {string} - 格式化后的日期字符串
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 为主页模态框注入CSS样式
 */
function injectMainPageModalStyle() {
    // 检查是否需要注入样式（只在主页注入）
    const isMainPage = !IS_SCHOOL_GALLERY && !window.location.pathname.includes('gallery.html');
    if (!isMainPage) return;
    
    // 检查是否已经存在样式
    if (document.getElementById('mainModalStyle')) return;
    
    // 创建样式元素
    const style = document.createElement('style');
    style.id = 'mainModalStyle';
    style.innerHTML = `
        /* 主页模态框样式 */
        #mainImageModal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            z-index: 9999;
            overflow: auto;
        }
        
        #mainImageModal .modal-content {
            position: relative;
            background-color: var(--card-background, #f8f9fa);
            margin: 5% auto;
            padding: 1.5rem;
            width: 90%;
            max-width: 1200px;
            border-radius: 1rem;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            animation: fadeIn 0.3s;
            color: #333333;
        }
        
        #mainImageModal .close-button {
            position: absolute;
            top: 1rem;
            right: 1.5rem;
            font-size: 2rem;
            font-weight: bold;
            color: #333333;
            cursor: pointer;
            transition: color 0.2s;
            z-index: 10;
        }
        
        #mainImageModal .close-button:hover {
            color: #000000;
        }
        
        #mainImageModal .modal-flex-container {
            display: flex;
            flex-direction: row;
            gap: 2rem;
            width: 100%;
        }
        
        #mainImageModal .modal-image-container {
            flex: 1;
            max-width: 65%;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        
        #mainImageModal .modal-side-panel {
            flex: 1;
            max-width: 35%;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        
        #mainImageModal #mainModalImage {
            max-width: 100%;
            max-height: 70vh;
            border-radius: 0.5rem;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
            object-fit: contain;
        }
        
        #mainImageModal .modal-side-panel h3 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #333333;
        }
        
        #mainImageModal .modal-chinese-prompt {
            font-size: 1.2rem;
            margin-bottom: 1rem;
            color: #333333;
            background-color: rgba(0, 0, 0, 0.05);
            padding: 0.75rem;
            border-radius: 0.5rem;
            line-height: 1.5;
        }
        
        #mainImageModal .info-section {
            margin-bottom: 0.75rem;
        }
        
        #mainImageModal .info-section h6 {
            font-size: 0.9rem;
            font-weight: 600;
            color: #555555;
            margin-bottom: 0.25rem;
        }
        
        #mainImageModal .info-section p {
            font-size: 0.95rem;
            color: #333333;
            word-break: break-word;
        }
        
        #mainImageModal .modal-prompt-label {
            font-size: 0.9rem;
            font-weight: 600;
            color: #555555;
            margin-bottom: 0.25rem;
        }
        
        #mainImageModal .modal-prompt {
            font-size: 1rem;
            margin-bottom: 1rem;
            color: #333333;
            background-color: rgba(0, 0, 0, 0.05);
            padding: 0.75rem;
            border-radius: 0.5rem;
            line-height: 1.5;
        }
        
        #mainImageModal #mainModalDate {
            font-size: 0.9rem;
            color: #666666;
            margin-bottom: 1rem;
        }
        
        /* 复制中文提示词按钮样式 */
        #mainImageModal #mainCopyChinesePrompt {
            background-color: #4caf50;
            color: #ffffff;
            border: 1px solid #43a047;
            border-radius: 4px;
            padding: 5px 10px;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-bottom: 1rem;
            display: inline-block;
        }
        
        #mainImageModal #mainCopyChinesePrompt:hover {
            background-color: #43a047;
            border-color: #388e3c;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        
        #mainImageModal .modal-actions {
            display: flex;
            gap: 1rem;
            margin-top: 1.5rem;
        }
        
        /* 主页画廊项的简化操作样式 */
        .gallery-item-simple-actions {
            position: absolute;
            top: 5px;
            right: 5px;
            z-index: 5;
            display: flex;
            gap: 5px;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        
        .gallery-img-container:hover .gallery-item-simple-actions {
            opacity: 1;
        }
        
        /* 确保主页上的删除按钮正确显示 */
        .gallery-item-simple-actions .delete-btn {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background-color: rgba(255, 0, 0, 0.7);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            line-height: 1;
        }
        
        .gallery-item-simple-actions .delete-btn:hover {
            background-color: rgba(255, 0, 0, 0.9);
            transform: scale(1.1);
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @media (max-width: 900px) {
            #mainImageModal .modal-flex-container {
                flex-direction: column;
                gap: 1rem;
            }
            
            #mainImageModal .modal-image-container,
            #mainImageModal .modal-side-panel {
                max-width: 100%;
                width: 100%;
            }
            
            #mainImageModal #mainModalImage {
                max-height: 60vh;
            }
            
            #mainImageModal .modal-content {
                width: 95%;
                margin: 3% auto;
                padding: 1rem;
            }
            
            .gallery-item-simple-actions {
                opacity: 1; /* 在移动设备上始终显示操作按钮 */
            }
        }
    `;
    
    // 添加到页面头部
    document.head.appendChild(style);
}

/**
 * 提交作品到全校画廊
 * @param {Event} event - 点击事件对象
 * @param {Object} item - 作品项数据，包含imageUrl和prompt
 */
function submitToSchoolGallery(event, item) {
    if (!item || !item.imageUrl || !item.prompt) {
        showToast('缺少必要的作品信息，无法提交', 3000);
        return;
    }
    
    // 阻止事件冒泡，避免重复触发
    event.stopPropagation();
    
    // 获取按钮元素
    const button = event.target;
    button.disabled = true;
    
    // 检查是否已经提交过
    const isSubmitted = isSubmittedToSchoolGallery(item.imageUrl);
    
    if (isSubmitted) {
        // 已提交，调用取消提交功能
        cancelSchoolGallerySubmission(event, item);
        return;
    }
    
    // 未提交，继续提交流程
    button.textContent = '提交中...';
    
    // 确认提交
    if (confirm('确定要将此作品提交到学校画廊吗？提交后将在学校画廊中显示给所有人。')) {
        // 尝试从本地存储中获取完整的图像信息
        let completeImageInfo = null;
        try {
            // 从localStorage中获取图像历史记录
            const imageHistory = JSON.parse(localStorage.getItem('imageHistory') || '[]');
            
            // 通过图像URL查找完整信息
            completeImageInfo = imageHistory.find(img => img.image_url === item.imageUrl);
            
            if (completeImageInfo) {
                console.log('找到本地存储的完整图像信息:', completeImageInfo);
            } else {
                console.warn('未在本地存储中找到完整图像信息，将使用可用信息');
            }
        } catch (error) {
            console.error('从本地存储获取图像信息时出错:', error);
        }
        
        // 合并完整信息和当前项目信息
        const submissionData = {
            image_url: item.imageUrl,
            prompt: item.prompt,
            chinese_prompt: item.chinese_prompt || item.prompt, // 使用中文提示词，如果没有则使用英文提示词
            timestamp: Date.now() / 1000, // 以秒为单位的时间戳
            student_id: localStorage.getItem('studentId') || '',
            student_name: localStorage.getItem('username') || ''
        };
        
        // 如果有完整信息，添加额外字段
        if (completeImageInfo) {
            // 添加额外的字段
            submissionData.width = completeImageInfo.width || 1024;
            submissionData.height = completeImageInfo.height || 1024;
            submissionData.seed = completeImageInfo.seed || null;
            submissionData.format = completeImageInfo.format || 'png';
            submissionData.style = completeImageInfo.style || '';
            submissionData.translated_prompt = completeImageInfo.translated_prompt || '';
            
            console.log('提交到数据库的完整信息:', submissionData);
        }
        
        // 发送到服务器API
        fetch('${serverUrl}/api/submit_to_gallery', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(submissionData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 更新本地提交状态
                updateSchoolGalleryStatus(item.imageUrl, true);
                
                // 更新按钮状态
                button.textContent = '取消提交';
                button.disabled = false;
                button.className = 'btn btn-warning';
                
                showToast('作品已成功提交到学校画廊！现在数据已保存到数据库中。请访问全校画廊查看。', 3000);
                } else {
                throw new Error(data.message || '提交失败');
            }
        })
        .catch(error => {
            console.error('提交失败:', error);
            showToast(`提交失败: ${error.message || '服务器错误'}`, 3000);
            
            // 恢复按钮状态
            button.disabled = false;
            button.textContent = '提交到学校画廊';
        });
    } else {
        // 用户取消了提交，恢复按钮状态
        button.disabled = false;
        button.textContent = '提交到学校画廊';
    }
}

/**
 * 取消提交作品到学校画廊
 * @param {Event} event - 点击事件对象
 * @param {Object} item - 作品项数据，包含imageUrl
 */
function cancelSchoolGallerySubmission(event, item) {
    if (!item || !item.imageUrl) {
        showToast('缺少必要的作品信息，无法取消提交', 3000);
        return;
    }
    
    // 阻止事件冒泡，避免重复触发
    event.stopPropagation();
    
    // 获取按钮元素
    const button = event.target;
    button.disabled = true;
    button.textContent = '取消提交中...';
    
    // 确认取消提交
    if (confirm('确定要将此作品从学校画廊移除吗？移除后其他人将无法看到这个作品。')) {
        // 准备要发送的数据
        const submissionData = {
            image_url: item.imageUrl
        };
        
        // 发送到服务器API
        fetch('${serverUrl}/api/remove_from_gallery', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(submissionData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // 更新本地提交状态
                updateSchoolGalleryStatus(item.imageUrl, false);
                
                // 更新按钮状态
                button.textContent = '提交到学校画廊';
                button.disabled = false;
                button.className = 'btn btn-info';
                
                showToast('作品已从学校画廊移除！', 3000);
            } else {
                throw new Error(data.message || '取消提交失败');
            }
        })
        .catch(error => {
            console.error('取消提交失败:', error);
            showToast(`取消提交失败: ${error.message || '服务器错误'}`, 3000);
            
            // 恢复按钮状态
            button.disabled = false;
            button.textContent = '取消提交';
        });
    } else {
        // 用户取消了操作，恢复按钮状态
        button.disabled = false;
        button.textContent = '取消提交';
    }
}

/**
 * 更新视图切换按钮状态
 */
function updateViewButtons() {
    const viewButtons = document.querySelectorAll('.view-btn');
    if (!viewButtons || viewButtons.length === 0) return;
    
    viewButtons.forEach(btn => {
        const viewType = btn.getAttribute('data-view');
        if (viewType === currentView) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * 更新作品的学校画廊提交状态
 * @param {string} imageUrl - 图片URL，用作唯一标识
 * @param {boolean} isSubmitted - 是否已提交到学校画廊
 */
function updateSchoolGalleryStatus(imageUrl, isSubmitted) {
    if (!imageUrl) return;
    
    // 从本地存储获取已提交状态
    let submittedItems = localStorage.getItem('submittedToSchoolGallery');
    submittedItems = submittedItems ? JSON.parse(submittedItems) : {};
    
    // 更新状态
    if (isSubmitted) {
        // 添加到已提交列表
        submittedItems[imageUrl] = true;
    } else {
        // 从已提交列表中移除
        delete submittedItems[imageUrl];
    }
    
    // 保存回本地存储
    localStorage.setItem('submittedToSchoolGallery', JSON.stringify(submittedItems));
}

/**
 * 检查作品是否已提交到学校画廊
 * @param {string} imageUrl - 图片URL，用作唯一标识
 * @returns {boolean} - 是否已提交到学校画廊
 */
function isSubmittedToSchoolGallery(imageUrl) {
    if (!imageUrl) return false;
    
    // 从本地存储获取已提交状态
    let submittedItems = localStorage.getItem('submittedToSchoolGallery');
    submittedItems = submittedItems ? JSON.parse(submittedItems) : {};
    
    // 检查是否已提交
    return !!submittedItems[imageUrl];
}

/**
 * 复制中文提示词
 */
function copyChinesePrompt() {
    if (!modalChinesePrompt || !modalPrompt) return;
    
    const chinesePrompt = modalChinesePrompt.textContent;
    const prompt = modalPrompt.textContent;
    
    // 创建一个临时输入框来复制文本
    const tempInput = document.createElement('input');
    tempInput.value = chinesePrompt;
    document.body.appendChild(tempInput);
    
    // 选择文本
    tempInput.select();
    tempInput.setSelectionRange(0, 99999); // 对于移动设备
    
    // 执行复制命令
    document.execCommand('copy');
    
    // 移除临时输入框
    document.body.removeChild(tempInput);
    
    showToast('中文提示词已复制到剪贴板');
} 

/**
 * 加载网格布局的全校画廊作品
 */
async function loadGridGalleryItems(studentId) {
    try {
        if (isLoading || !hasMoreItems) return;
        
        isLoading = true;
        
        // 显示加载状态
        showLoading(true);
        
        // 从服务器获取画廊作品
        const response = await galleryClient.getGalleryItems(currentPage, itemsPerPage, studentId);
        
        // 处理响应
        if (response && response.status === 'success' && response.items) {
            const items = response.items;
            totalItems = response.total || 0;
            
            console.log(`获取到 ${items.length} 个画廊项目（网格视图）`);
            
            // 显示空画廊提示或作品
            if (items.length === 0 && currentPage === 1) {
                if (emptyGallery) emptyGallery.classList.remove('hidden');
                if (galleryGrid) galleryGrid.classList.add('hidden');
            } else {
                if (emptyGallery) emptyGallery.classList.add('hidden');
                if (galleryGrid) galleryGrid.classList.remove('hidden');
                
                // 对items按时间戳从新到旧排序
                items.sort((a, b) => b.timestamp - a.timestamp);
                
                // 如果是第一次加载，清空画廊网格
                if (currentPage === 1) {
                    galleryGrid.innerHTML = '';
                }
                
                // 添加作品到网格
                items.forEach((item, index) => {
                    // 格式化服务器返回的数据
                    console.log(`处理第 ${index+1} 项: ID=${item._id}, URL=${item.image_url}`);

                    const galleryItem = {
                        id: item._id,
                        imageUrl: item.image_url,
                        prompt: item.prompt,
                        chinese_prompt: item.chinese_prompt || '',
                        timestamp: item.timestamp * 1000, // 转换为毫秒
                        style: item.style,
                        likes: item.likes || 0,
                        student_name: item.student_name || item.username || '',
                        student_id: item.student_id || '',
                        ip_address: item.ip_address || '',
                        liked: isLikedByUser(item._id)
                    };
                    
                    // 添加到网格
                    addGridItemToGallery(galleryItem, galleryGrid);
                });
                
                // 更新是否有更多项目
                hasMoreItems = items.length === itemsPerPage && (currentPage * itemsPerPage) < totalItems;
            }
            
            // 更新页码
            currentPage++;
        } else {
            console.error('获取画廊作品失败:', response);
            showToast('获取画廊作品失败，请刷新页面重试', 3000);
        }
    } catch (error) {
        console.error('加载全校画廊失败:', error);
        showToast('加载全校画廊失败，请检查网络连接', 3000);
    } finally {
        // 隐藏加载状态
        showLoading(false);
        
        isLoading = false;
    }
}

/**
 * 添加作品到网格画廊
 * @param {Object} item - 作品项
 * @param {HTMLElement} targetGrid - 目标画廊网格元素
 */
function addGridItemToGallery(item, targetGrid) {
    if (!targetGrid) return;
    
    // 创建画廊项容器
    const galleryItem = document.createElement('div');
    galleryItem.className = 'gallery-item';
    galleryItem.setAttribute('data-timestamp', item.timestamp);
    if (item.favorite) {
        galleryItem.setAttribute('data-favorite', 'true');
    }
    
    // 创建图片容器
    const imgContainer = document.createElement('div');
    imgContainer.className = 'gallery-img-container';
    
    // 创建图片元素
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.prompt || '绘画作品';
    img.loading = 'lazy';
    img.onerror = function() {
        console.error('图片加载失败:', item.imageUrl);
        this.src = 'images/image-error.png';
        this.alt = '图片加载失败';
    };
    
    // 确保图片已加载
    img.onload = function() {
        console.log('图片加载成功:', item.imageUrl);
    };
    
    // 添加点击事件打开模态框
    imgContainer.appendChild(img);
    imgContainer.addEventListener('click', () => {
        openImageModal(item);
    });
    
    // 创建作品信息
    const itemInfo = document.createElement('div');
    itemInfo.className = 'gallery-item-info';
    
    // 添加作品时间
    const date = new Date(item.timestamp);
    const timeElem = document.createElement('div');
    timeElem.className = 'gallery-item-time';
    timeElem.textContent = formatDate(date);
    itemInfo.appendChild(timeElem);
    
    // 添加操作按钮
    const actions = document.createElement('div');
    actions.className = 'gallery-item-actions';
    
    // 在全校画廊中显示点赞按钮
    if (IS_SCHOOL_GALLERY) {
        const likeBtn = document.createElement('button');
        likeBtn.className = 'gallery-action-btn like-btn';
        likeBtn.innerHTML = item.liked ? '❤️' : '🤍';
        likeBtn.title = item.liked ? '取消点赞' : '点赞';
        
        // 添加点赞计数显示
        const likesCount = document.createElement('span');
        likesCount.className = 'like-count';
        likesCount.textContent = item.likes || 0;
        likesCount.style.marginLeft = '3px';
        likesCount.style.fontSize = '0.8rem';
        likeBtn.appendChild(likesCount);
        
        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleItemLike(item, likeBtn);
        });
        actions.appendChild(likeBtn);
    }
    
    // 添加下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'gallery-action-btn download-btn';
    downloadBtn.innerHTML = '↓';
    downloadBtn.title = '下载';
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadImage(item.imageUrl, `画作_${date.getTime()}`);
    });
    actions.appendChild(downloadBtn);
    
    itemInfo.appendChild(actions);
    
    // 组装画廊项
    galleryItem.appendChild(imgContainer);
    galleryItem.appendChild(itemInfo);
    
    // 添加到目标容器
    targetGrid.appendChild(galleryItem);
}

/**
 * 按学生ID筛选画廊作品
 * @param {string} studentId - 学生ID
 */
function filterGalleryByStudentId(studentId) {
    if (!studentId) return;
    
    // 清空画廊并重置页码
    clearGallery();
    currentPage = 1;
    hasMoreItems = true;
    
    // 更新筛选按钮状态，取消所有活跃状态
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => btn.classList.remove('active'));
    
    // 显示加载指示器
    showLoading(true);
    
    // 显示筛选提示
    const galleryHeader = document.querySelector('.gallery-header .subtitle');
    if (galleryHeader) {
        galleryHeader.textContent = `正在查看学号为 ${studentId} 的同学作品`;
        
        // 添加"清除筛选"按钮
        let clearFilterBtn = document.getElementById('clearFilterBtn');
        if (!clearFilterBtn) {
            clearFilterBtn = document.createElement('button');
            clearFilterBtn.id = 'clearFilterBtn';
            clearFilterBtn.className = 'btn btn-sm btn-outline-secondary mt-2';
            clearFilterBtn.textContent = '清除筛选';
            clearFilterBtn.style.marginLeft = '10px';
            
            clearFilterBtn.addEventListener('click', () => {
                // 恢复默认标题
                galleryHeader.textContent = '这里展示了同学们的优秀AI绘画作品';
                
                // 移除按钮
                if (clearFilterBtn.parentNode) {
                    clearFilterBtn.parentNode.removeChild(clearFilterBtn);
                }
                
                // 重置页码和内容
                clearGallery();
                currentPage = 1;
                hasMoreItems = true;
                
                // 激活"全部作品"筛选按钮
                const allFilterBtn = document.querySelector('.filter-btn[data-filter="all"]');
                if (allFilterBtn) {
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    allFilterBtn.classList.add('active');
                    
                    // 调用筛选函数，但指定不是来自筛选按钮的点击
                    filterGallery('all', false);
                } else {
                    // 如果找不到筛选按钮，直接重新加载
                    if (currentView === 'masonry') {
                        loadSchoolGalleryItems();
                    } else {
                        loadGridGalleryItems();
                    }
                }
            });
            
            // 添加到标题旁边
            galleryHeader.appendChild(clearFilterBtn);
        }
    }
    
    // 根据当前视图模式加载筛选后的内容
    if (currentView === 'masonry') {
        loadSchoolGalleryItems(studentId);
    } else {
        loadGridGalleryItems(studentId);
    }
}