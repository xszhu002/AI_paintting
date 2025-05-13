/**
 * 管理员作品审核界面的JavaScript
 */

// 全局变量
let currentPage = 1;
const perPage = 12;
let currentFilter = 'pending'; // 默认筛选：待审核
let isLoading = false;
let hasMoreItems = true;
let selectedArtworks = []; // 存储已选择的作品ID
let currentArtwork = null; // 当前查看的作品
let artworksData = null; // 存储作品数据
let scrollThreshold = 200; // 滚动阈值，距离底部多少像素时触发加载

// 统计数据
let statsData = {
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0
};

// DOM元素常量
const loadMoreBtn = document.getElementById('loadMoreBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const reviewGrid = document.getElementById('reviewGrid');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const filterDropdown = document.getElementById('filterDropdown');
const batchActionsContainer = document.getElementById('batchActionsContainer');
const selectedCountLabel = document.getElementById('selectedCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const batchApproveBtn = document.getElementById('batchApproveBtn');
const batchRejectBtn = document.getElementById('batchRejectBtn');
const logoutBtn = document.getElementById('logoutBtn');

// 模态框元素
const artworkModal = $('#artworkModal');
const modalImage = document.getElementById('modalImage');
const modalPrompt = document.getElementById('modalPrompt');
const modalChinesePrompt = document.getElementById('modalChinesePrompt');
const modalStudent = document.getElementById('modalStudent');
const modalIPAddress = document.getElementById('modalIPAddress');
const modalTimestamp = document.getElementById('modalTimestamp');
const modalStyle = document.getElementById('modalStyle');
const modalId = document.getElementById('modalId');
const rejectReasonContainer = document.getElementById('rejectReasonContainer');
const rejectReason = document.getElementById('rejectReason');
const showRejectReasonBtn = document.getElementById('showRejectReasonBtn');
const confirmRejectBtn = document.getElementById('confirmRejectBtn');
const approveBtn = document.getElementById('approveBtn');

// 批量拒绝模态框
const batchRejectModal = $('#batchRejectModal');
const batchRejectReason = document.getElementById('batchRejectReason');
const confirmBatchRejectBtn = document.getElementById('confirmBatchRejectBtn');

// 初始化函数
function init() {
    // 检查管理员登录状态
    checkAdminLogin();
    
    // 加载初始作品
    loadArtworks();
    
    // 加载统计数据
    loadStats();
    
    // 添加滚动事件监听
    window.addEventListener('scroll', handleScroll);
    
    // 事件监听
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    // 搜索类型更改事件
    const searchTypeSelect = document.getElementById('searchType');
    if (searchTypeSelect) {
        searchTypeSelect.addEventListener('change', function() {
            const searchType = this.value;
            let placeholder = "请输入关键词...";
            
            switch(searchType) {
                case 'chinese_prompt':
                    placeholder = "请输入中文提示词关键词...";
                    break;
                case 'prompt':
                    placeholder = "请输入英文提示词关键词...";
                    break;
                case 'student':
                    placeholder = "请输入作者姓名或ID...";
                    break;
                default:
                    placeholder = "请输入关键词...";
            }
            
            searchInput.placeholder = placeholder;
            
            // 如果已有输入内容，直接触发搜索
            if (searchInput.value.trim()) {
                handleSearch();
            }
        });
    }
    
    // 统计卡片点击筛选
    document.querySelectorAll('.card-link[data-filter]').forEach(cardLink => {
        cardLink.addEventListener('click', function(e) {
            e.preventDefault();
            const filter = this.getAttribute('data-filter');
            if (filter !== currentFilter) {
                currentFilter = filter;
                updateFilterDisplay(filter);
                resetArtworksGrid();
                loadArtworks();
            }
        });
    });
    
    // 筛选菜单点击
    document.querySelectorAll('.dropdown-item[data-filter]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const filter = this.getAttribute('data-filter');
            if (filter !== currentFilter) {
                currentFilter = filter;
                updateFilterDisplay(filter);
                // 更新激活的菜单项
                document.querySelectorAll('.dropdown-item[data-filter]').forEach(el => {
                    el.classList.remove('active');
                });
                this.classList.add('active');
                
                resetArtworksGrid();
                loadArtworks();
            }
        });
    });
    
    // 批量操作事件
    clearSelectionBtn.addEventListener('click', clearSelection);
    batchApproveBtn.addEventListener('click', batchApprove);
    batchRejectBtn.addEventListener('click', function() {
        // 直接批量拒绝，不显示模态框
        batchReject("管理员批量拒绝");
    });
    
    // 模态框按钮事件
    showRejectReasonBtn.addEventListener('click', function() {
        // 直接拒绝当前作品，不显示拒绝原因输入框
        rejectArtwork(currentArtwork._id);
    });
    
    approveBtn.addEventListener('click', function() {
        approveArtwork(currentArtwork._id);
    });
    
    // 批量拒绝确认按钮（保留但不会被调用）
    confirmBatchRejectBtn.addEventListener('click', function() {
        batchReject(batchRejectReason.value || "管理员批量拒绝");
    });
    
    // 登出按钮
    logoutBtn.addEventListener('click', logout);
}

// 检查管理员登录状态并处理认证
function checkAdminLogin() {
    const adminToken = localStorage.getItem('adminToken');
    
    if (!adminToken) {
        console.warn('管理员未登录，跳转到登录页面');
        window.location.href = 'admin_login.html';
        return false;
    }
    
    // 验证令牌有效性
    fetch('http://172.16.201.200:8080/api/admin/verify_token', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status !== 'success') {
            console.warn('管理员令牌无效，跳转到登录页面');
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
        } else {
            console.log('管理员令牌有效');
        }
    })
    .catch(error => {
        console.error('验证令牌失败:', error);
        // 但不立即跳转，允许页面继续加载
    });
    
    return true;
}

// 加载作品列表
function loadArtworks(page = 1, perPage = 12, searchParams = {}) {
    // 如果正在加载，则不执行
    if (isLoading) return;
    isLoading = true;
    
    // 如果是第一页，清空现有内容
    if (page === 1) {
        reviewGrid.innerHTML = '';
    }
    
    // 更新当前页码
    currentPage = page;
    
    // 显示加载中状态
    loadingIndicator.style.display = 'block';
    
    // 获取搜索条件
    let searchQuery = '';
    let searchType = 'all';
    
    if (searchParams.query) {
        searchQuery = searchParams.query;
    } else if (searchInput.value.trim()) {
        searchQuery = searchInput.value.trim();
    }
    
    if (searchParams.type) {
        searchType = searchParams.type;
    } else if (document.getElementById('searchType')) {
        searchType = document.getElementById('searchType').value;
    }
    
    // 构建API URL
    let apiUrl;
    
    if (currentFilter === 'pending') {
        // 待审核使用gallery API，筛选没有approved字段的记录
        apiUrl = `http://172.16.201.200:8080/api/gallery?page=${page}&per_page=${perPage}&show_all=true&pending=true`;
        
        // 添加搜索参数
        if (searchQuery) {
            apiUrl += `&query=${encodeURIComponent(searchQuery)}`;
            // 如果指定了搜索类型，添加搜索类型参数
            if (searchType !== 'all') {
                apiUrl += `&search_type=${encodeURIComponent(searchType)}`;
            }
        }
    } else {
        // 其他筛选条件使用gallery API
        apiUrl = `http://172.16.201.200:8080/api/gallery?page=${page}&per_page=${perPage}&show_all=true`;
        
        // 添加筛选条件
        if (currentFilter === 'approved') {
            apiUrl += '&approved=true';
        } else if (currentFilter === 'rejected') {
            apiUrl += '&approved=false';
        }
        // 全部(all)不添加筛选参数
        
        // 添加搜索参数
        if (searchQuery) {
            apiUrl += `&query=${encodeURIComponent(searchQuery)}`;
            // 如果指定了搜索类型，添加搜索类型参数
            if (searchType !== 'all') {
                apiUrl += `&search_type=${encodeURIComponent(searchType)}`;
            }
        }
    }
    
    console.log('Loading artworks from:', apiUrl, 'Current filter:', currentFilter, 'Search type:', searchType);
    
    // 发送API请求
    fetch(apiUrl, {
        method: 'GET', // 先尝试使用GET方法
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            // 如果GET请求失败，尝试使用POST方法
            if (response.status === 405) { // Method Not Allowed
                console.log('GET方法不允许，尝试POST方法');
                return fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getAuthToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: searchQuery,
                        search_type: searchType
                    }) // POST搜索参数
                });
            }
            throw new Error('获取作品列表失败');
        }
        return response.json();
    })
    .then(response => {
        if (response.ok === false) {
            throw new Error(response.message || '获取作品列表失败');
        }
        return response;
    })
    .then(data => {
        console.log('API返回数据:', data);
        
        if (data.status === 'success') {
            // 更新作品列表
            artworksData = data;
            
            // 记录分页信息
            console.log(`总记录数: ${data.total}, 当前页: ${data.page}, 每页显示: ${data.per_page}, 总页数: ${data.pages || Math.ceil(data.total / data.per_page)}`);
            
            // 如果第一页且没有作品，显示提示
            if (page === 1 && (!data.items || data.items.length === 0)) {
                reviewGrid.innerHTML = '<div class="alert alert-info text-center w-100">没有找到符合条件的作品</div>';
                hasMoreItems = false;
            } else if (data.items && data.items.length > 0) {
                // 显示返回的项目数
                console.log(`本次返回项目数: ${data.items.length}`);
                
                // 渲染作品
                renderArtworks(data.items);
                
                // 计算总页数（如果API没有返回）
                const totalPages = data.pages || Math.ceil(data.total / data.per_page);
                
                // 判断是否还有更多作品
                hasMoreItems = data.page < totalPages && data.items.length === data.per_page;
                if (!hasMoreItems) {
                    console.log('没有更多作品了');
                }
            }
        } else {
            // 如果没有获取到数据，使用演示数据
            console.warn('使用演示数据');
            useDemoData();
        }
    })
    .catch(error => {
        console.error('获取作品列表失败:', error);
        // 使用演示数据
        useDemoData();
    })
    .finally(() => {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    });
}

// 加载更多作品
function loadMoreArtworks() {
    // 如果正在加载或没有更多项，则不执行操作
    if (isLoading || !hasMoreItems) return;
    
    // 设置正在加载状态
    isLoading = true;
    
    // 显示加载中指示器
    loadingIndicator.style.display = 'block';
    
    // 递增页码并加载下一页数据
    currentPage++;
    
    // 获取搜索条件
    const searchQuery = searchInput.value.trim();
    const searchType = document.getElementById('searchType') ? document.getElementById('searchType').value : 'all';
    
    const searchParams = {
        query: searchQuery,
        type: searchType
    };
    
    // 构建API URL - 必须使用与loadArtworks相同的URL构建逻辑
    let apiUrl;
    
    if (currentFilter === 'pending') {
        // 待审核使用gallery API，筛选没有approved字段的记录
        apiUrl = `http://172.16.201.200:8080/api/gallery?page=${currentPage}&per_page=${perPage}&show_all=true&pending=true`;
        
        // 添加搜索参数
        if (searchQuery) {
            apiUrl += `&query=${encodeURIComponent(searchQuery)}`;
            // 如果指定了搜索类型，添加搜索类型参数
            if (searchType !== 'all') {
                apiUrl += `&search_type=${encodeURIComponent(searchType)}`;
            }
        }
    } else {
        // 其他筛选条件使用gallery API
        apiUrl = `http://172.16.201.200:8080/api/gallery?page=${currentPage}&per_page=${perPage}&show_all=true`;
        
        // 添加筛选条件
        if (currentFilter === 'approved') {
            apiUrl += '&approved=true';
        } else if (currentFilter === 'rejected') {
            apiUrl += '&approved=false';
        }
        // 全部(all)不添加筛选参数
        
        // 添加搜索参数
        if (searchQuery) {
            apiUrl += `&query=${encodeURIComponent(searchQuery)}`;
            // 如果指定了搜索类型，添加搜索类型参数
            if (searchType !== 'all') {
                apiUrl += `&search_type=${encodeURIComponent(searchType)}`;
            }
        }
    }
    
    console.log('Loading more artworks from:', apiUrl, 'Current filter:', currentFilter, 'Search type:', searchType);
    
    // 发送API请求
    fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            // 如果GET请求失败，尝试使用POST方法
            if (response.status === 405) { // Method Not Allowed
                return fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getAuthToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: searchQuery,
                        search_type: searchType
                    }) // POST搜索参数
                });
            }
            throw new Error('获取作品列表失败');
        }
        return response.json();
    })
    .then(response => {
        if (response.ok === false) {
            throw new Error(response.message || '获取作品列表失败');
        }
        return response;
    })
    .then(data => {
        if (data.status === 'success' && data.items && data.items.length > 0) {
            // 渲染作品
            renderArtworks(data.items);
            
            // 计算总页数（如果API没有返回）
            const totalPages = data.pages || Math.ceil(data.total / data.per_page);
            console.log(`加载更多: 总记录数: ${data.total}, 当前页: ${data.page}, 每页显示: ${data.per_page}, 总页数: ${totalPages}`);
            
            // 判断是否还有更多
            hasMoreItems = data.page < totalPages && data.items.length === data.per_page;
            if (!hasMoreItems) {
                // 没有更多项了
                console.log('没有更多作品了');
            }
        } else {
            // 没有更多项
            hasMoreItems = false;
            console.log('没有更多作品了');
        }
    })
    .catch(error => {
        console.error('加载更多作品失败:', error);
        showError('加载更多作品失败: ' + error.message);
    })
    .finally(() => {
        isLoading = false;
        loadingIndicator.style.display = 'none';
    });
}

// 加载统计数据
function loadStats() {
    // 构建API URL
    let apiUrl = 'http://172.16.201.200:8080/api/admin/artwork_stats';
    
    // 从作品列表API获取统计数据的备用方法
    function getStatsFromGalleryAPI() {
        console.log('从作品列表API获取统计数据');
        
        // 使用三个请求获取不同状态的作品数量
        const pendingUrl = 'http://172.16.201.200:8080/api/gallery?page=1&per_page=1&show_all=true&pending=true';
        const approvedUrl = 'http://172.16.201.200:8080/api/gallery?page=1&per_page=1&show_all=true&approved=true';
        const rejectedUrl = 'http://172.16.201.200:8080/api/gallery?page=1&per_page=1&show_all=true&approved=false';
        
        Promise.all([
            fetch(pendingUrl, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            }).then(res => res.json()),
            
            fetch(approvedUrl, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            }).then(res => res.json()),
            
            fetch(rejectedUrl, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            }).then(res => res.json())
        ])
        .then(([pendingData, approvedData, rejectedData]) => {
            // 提取各状态的数量
            const pending = pendingData.status === 'success' ? pendingData.total : 0;
            const approved = approvedData.status === 'success' ? approvedData.total : 0;
            const rejected = rejectedData.status === 'success' ? rejectedData.total : 0;
            
            // 计算总数
            const total = pending + approved + rejected;
            
            // 更新统计数据
            statsData = {
                pending,
                approved,
                rejected,
                total
            };
            
            console.log('成功从作品列表API获取统计数据', statsData);
            updateStatsDisplay();
        })
        .catch(error => {
            console.error('从作品列表API获取统计数据失败:', error);
            // 使用默认统计数据
            useDefaultStats();
        });
    }
    
    // 使用默认统计数据
    function useDefaultStats() {
        // 尝试从页面已加载的数据中获取更准确的pending数量
        let pendingCount = 0;
        if (artworksData && artworksData.total) {
            pendingCount = artworksData.total;
        }
        
        statsData = {
            pending: pendingCount || 42,
            approved: 156,
            rejected: 23,
            total: (pendingCount || 42) + 156 + 23
        };
        console.warn('使用默认统计数据', statsData);
        updateStatsDisplay();
    }
    
    // 发送API请求
    fetch(apiUrl, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            // 检查是否是权限问题
            if (response.status === 401 || response.status === 403) {
                console.warn(`统计API返回${response.status}，尝试使用备用方法`);
                // 使用备用方法从gallery API获取统计
                getStatsFromGalleryAPI();
                return Promise.reject(new Error('权限不足，使用备用方法'));
            }
            
            // 如果GET请求失败，尝试使用POST方法
            if (response.status === 405) { // Method Not Allowed
                return fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getAuthToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({}) // 空的请求体
                });
            }
            throw new Error('获取统计数据失败');
        }
        return response.json();
    })
    .then(response => {
        if (response.ok === false) {
            throw new Error(response.message || '获取统计数据失败');
        }
        return response;
    })
    .then(data => {
        if (data.status === 'success') {
            // 更新统计数据
            statsData = data.stats;
            updateStatsDisplay();
        } else {
            // 如果没有获取到数据，使用备用方法
            getStatsFromGalleryAPI();
        }
    })
    .catch(error => {
        // 如果是权限错误，已经在上面处理了
        if (error.message === '权限不足，使用备用方法') {
            return;
        }
        
        console.error('获取统计数据失败:', error);
        // 尝试使用备用方法
        getStatsFromGalleryAPI();
    });
}

// 更新统计数据显示
function updateStatsDisplay() {
    document.getElementById('pendingCount').textContent = statsData.pending;
    document.getElementById('approvedCount').textContent = statsData.approved;
    document.getElementById('rejectedCount').textContent = statsData.rejected;
    document.getElementById('totalCount').textContent = statsData.total;
}

// 渲染作品到网格
function renderArtworks(artworks) {
    if (artworks.length === 0) {
        if (reviewGrid.children.length === 0) {
            reviewGrid.innerHTML = '<div class="alert alert-info text-center w-100">没有找到符合条件的作品</div>';
        }
        return;
    }
    
    // 在前端进行数据过滤
    let filteredArtworks = artworks;
    
    // 判断筛选条件
    if (currentFilter !== 'all') {
        filteredArtworks = artworks.filter(artwork => {
            if (currentFilter === 'approved') {
                return artwork.approved === true;
            } else if (currentFilter === 'rejected') {
                return artwork.approved === false;
            } else if (currentFilter === 'pending') {
                // 如果approved字段不存在，也视为待审核
                return artwork.approved === undefined;
            }
            // 全部不过滤
            return true;
        });
        
        // 如果过滤后没有数据，显示提示信息
        if (filteredArtworks.length === 0) {
            reviewGrid.innerHTML = '<div class="alert alert-info text-center w-100">没有找到符合条件的作品</div>';
            return;
        }
    }
    
    // 渲染过滤后的作品
    filteredArtworks.forEach(artwork => {
        const itemElement = createArtworkItem(artwork);
        reviewGrid.appendChild(itemElement);
    });
    
    // 如果筛选结果和原始数据不同，添加指示信息
    if (filteredArtworks.length !== artworks.length) {
        const filterInfo = document.createElement('div');
        filterInfo.className = 'alert alert-info text-center w-100 mt-3';
        filterInfo.textContent = `显示 ${filteredArtworks.length} 个${getFilterName(currentFilter)}作品，共 ${artworks.length} 个作品`;
        if (reviewGrid.children.length > 0) {
            reviewGrid.insertBefore(filterInfo, reviewGrid.firstChild);
        } else {
            reviewGrid.appendChild(filterInfo);
        }
    }
}

// 获取筛选条件名称
function getFilterName(filter) {
    switch (filter) {
        case 'pending':
            return '待审核';
        case 'approved':
            return '已通过';
        case 'rejected':
            return '已拒绝';
        case 'all':
            return '全部';
        default:
            return '';
    }
}

// 创建单个作品项
function createArtworkItem(artwork) {
    const item = document.createElement('div');
    item.className = 'review-item';
    item.dataset.id = artwork._id;
    
    // 将完整的作品数据保存在DOM元素的dataset中，用JSON字符串存储
    item.dataset.artwork = JSON.stringify(artwork);
    
    // 获取提交时间
    let submissionTime = '未知时间';
    if (artwork.submission_timestamp) {
        submissionTime = formatDate(artwork.submission_timestamp * 1000);
    } else if (artwork.timestamp) {
        submissionTime = formatDate(artwork.timestamp * 1000);
    }
    
    // 获取学生信息
    let studentInfo = '匿名用户';
    let studentName = artwork.student_name || '匿名用户';
    let studentId = artwork.student_id || '无学号';
    let ipAddress = artwork.ip_address || '未知IP';
    
    if (artwork.student_id) {
        studentInfo = artwork.student_name ? 
            `${artwork.student_name} (${artwork.student_id})` : 
            artwork.student_id;
    }
    
    // 获取审核状态
    let statusClass = '';
    let statusText = '';
    if (artwork.approved === true) {
        statusClass = 'badge-success';
        statusText = '已通过';
    } else if (artwork.approved === false) {
        statusClass = 'badge-danger';
        statusText = '已拒绝';
    } else {
        statusClass = 'badge-warning';
        statusText = '待审核';
    }
    
    // 准备中文提示词，用于图片下方显示
    const chinesePrompt = artwork.chinese_prompt || artwork.prompt || '无提示词';
    
    // 创建DOM结构
    const imgContainer = document.createElement('div');
    imgContainer.className = 'review-img-container';
    imgContainer.setAttribute('data-prompt', chinesePrompt);
    
    const img = document.createElement('img');
    img.src = artwork.image_url;
    img.alt = '作品图片';
    img.className = 'artwork-thumbnail';
    img.loading = 'lazy';
    
    // 添加选择框
    const checkmark = document.createElement('div');
    checkmark.className = 'checkmark';
    checkmark.dataset.id = artwork._id;
    const checkIcon = document.createElement('i');
    checkIcon.className = 'fas fa-check';
    checkmark.appendChild(checkIcon);
    
    // 构建图片容器
    imgContainer.appendChild(img);
    imgContainer.appendChild(checkmark);
    
    // 添加作者信息区域 - 新增
    const authorInfo = document.createElement('div');
    authorInfo.className = 'author-info';
    authorInfo.style.padding = '10px 12px';
    authorInfo.style.backgroundColor = '#f8f9fa';
    authorInfo.style.fontSize = '14px';  // 加大字号
    authorInfo.style.borderTop = '1px solid #eee';
    authorInfo.style.color = '#555';
    authorInfo.style.lineHeight = '1.4';
    authorInfo.style.display = 'flex';   // 使用flex布局
    authorInfo.style.justifyContent = 'space-between'; // 两端对齐
    authorInfo.style.alignItems = 'center'; // 垂直居中
    
    // 作者信息和IP放在同一行
    const authorText = document.createElement('span');
    authorText.innerHTML = `<strong>作者：</strong>${studentName} <span style="color: #888">(${studentId})</span>`;
    
    // IP地址
    const ipText = document.createElement('span');
    ipText.innerHTML = `<strong>IP：</strong><span style="font-family: monospace">${ipAddress}</span>`;
    
    authorInfo.appendChild(authorText);
    authorInfo.appendChild(ipText);
    
    // 创建底部区域 - 审核按钮区域
    const actionContainer = document.createElement('div');
    actionContainer.className = 'approve-reject-buttons';
    
    // 定义变量以便后面的事件处理可以访问
    let rejectBtn = null;
    let approveBtn = null;
    
    // 对所有作品都显示审核按钮，不论状态
    rejectBtn = document.createElement('button');
    rejectBtn.className = 'btn reject-btn';
    rejectBtn.dataset.id = artwork._id;
    rejectBtn.textContent = '拒绝';
    
    approveBtn = document.createElement('button');
    approveBtn.className = 'btn approve-btn';
    approveBtn.dataset.id = artwork._id;
    approveBtn.textContent = '通过';
    
    // 如果作品已经通过，为通过按钮添加"已选中"样式
    if (artwork.approved === true) {
        approveBtn.classList.add('selected');
    }
    
    // 如果作品已经拒绝，为拒绝按钮添加"已选中"样式
    if (artwork.approved === false) {
        rejectBtn.classList.add('selected');
    }
    
    actionContainer.appendChild(rejectBtn);
    actionContainer.appendChild(approveBtn);
    
    // 创建底部信息栏
    const footerContainer = document.createElement('div');
    footerContainer.className = 'card-footer';
    
    const statusSpan = document.createElement('span');
    statusSpan.className = `badge ${statusClass}`;
    statusSpan.textContent = statusText;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'text-muted';
    timeSpan.textContent = submissionTime;
    
    const studentSpan = document.createElement('span');
    studentSpan.textContent = studentInfo;
    
    footerContainer.appendChild(statusSpan);
    footerContainer.appendChild(timeSpan);
    
    // 组装DOM - 更改作者信息与审核按钮的顺序
    item.appendChild(imgContainer);
    item.appendChild(actionContainer); // 先添加审核按钮
    item.appendChild(authorInfo);      // 再添加作者信息
    item.appendChild(footerContainer);
    
    // 添加事件监听器
    // 为整个卡片添加点击事件，打开模态框
    item.addEventListener('click', function(e) {
        // 防止点击按钮或选择框时触发
        if (e.target === rejectBtn || e.target === approveBtn || e.target === checkmark || checkmark.contains(e.target)) {
            return;
        }
        openArtworkDetails(artwork._id);
    });
    
    // 添加选择事件
    checkmark.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSelection(artwork._id, checkmark);
    });
    
    // 审核按钮事件
        approveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            approveArtwork(artwork._id);
        });
    
        rejectBtn.addEventListener('click', function(e) {
            e.stopPropagation();
        rejectArtwork(artwork._id);
        });
    
    return item;
}

// 打开作品详情
function openArtworkDetails(artworkId, showRejectForm = false) {
    // 从页面上的作品项中查找对应的数据
    let cachedArtwork = null;
    const artworkItem = document.querySelector(`.review-item[data-id="${artworkId}"]`);
    
    if (artworkItem) {
        // 优先尝试从dataset中获取完整作品数据
        if (artworkItem.dataset.artwork) {
            try {
                // 解析JSON字符串得到完整的作品数据
                cachedArtwork = JSON.parse(artworkItem.dataset.artwork);
                console.log('从DOM元素中获取完整作品数据:', cachedArtwork);
                
                // 使用完整数据直接填充模态框
                fillArtworkModal(cachedArtwork);
                // 无需继续从API获取数据
                return;
            } catch (error) {
                console.error('解析作品数据失败:', error);
                // 继续使用备选方案
            }
        }
        
        // 如果解析dataset失败，从DOM元素中提取信息
        const imageUrl = artworkItem.querySelector('img').src;
        if (imageUrl) {
            const prompt = artworkItem.querySelector('.review-prompt').textContent.trim();
            const studentInfo = artworkItem.querySelector('.review-meta span:first-child').textContent.trim();
            const style = artworkItem.querySelector('.review-meta span:last-child').textContent.trim();
            const timestamp = artworkItem.querySelector('small.text-muted').textContent.trim();
            
            cachedArtwork = {
                _id: artworkId,
                image_url: imageUrl,
                prompt: prompt,
                chinese_prompt: prompt,
                student_id: studentInfo,
                style: style,
                timestamp: new Date(timestamp).getTime() / 1000
            };
            
            // 填充模态框数据
            fillArtworkModal(cachedArtwork);
        }
    }
    
    // 如果没有找到缓存数据，从API获取
    if (!cachedArtwork) {
        // 从API获取完整的作品数据
    fetch(`http://172.16.201.200:8080/api/gallery?artwork_id=${artworkId}&show_all=true`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success' && data.items && data.items.length > 0) {
            const artwork = data.items[0];
                fillArtworkModal(artwork);
            } else {
                showError('获取作品详情失败');
            }
        })
        .catch(error => {
            showError('获取作品详情失败: ' + error.message);
        });
    }
}

// 填充作品模态框 - 辅助函数
function fillArtworkModal(artwork) {
    // 保存当前作品对象
            currentArtwork = artwork;
            
    // 填充图片
            modalImage.src = artwork.image_url;
    
    // 填充提示词
            modalPrompt.textContent = artwork.prompt || '无英文提示词';
            modalChinesePrompt.textContent = artwork.chinese_prompt || '无中文提示词';
            
            // 学生信息
            let studentInfo = '匿名用户';
            if (artwork.student_id) {
                studentInfo = artwork.student_name ? 
                    `${artwork.student_name} (${artwork.student_id})` : 
                    artwork.student_id;
            }
            modalStudent.textContent = studentInfo;
            
            // IP地址信息
            modalIPAddress.textContent = artwork.ip_address || '未知IP';
            
            // 时间信息
            let submissionTime = '未知时间';
            if (artwork.submission_timestamp) {
                submissionTime = formatDate(artwork.submission_timestamp * 1000);
            } else if (artwork.timestamp) {
                submissionTime = formatDate(artwork.timestamp * 1000);
            }
            modalTimestamp.textContent = submissionTime;
            
    // 其他信息
            modalStyle.textContent = artwork.style || '未指定风格';
            modalId.textContent = artwork._id;
            
            // 重置拒绝原因区域
            rejectReasonContainer.style.display = 'none';
            
            // 根据审核状态调整按钮可见性
            if (artwork.approved !== undefined) {
                showRejectReasonBtn.style.display = 'none';
                approveBtn.style.display = 'none';
            } else {
                showRejectReasonBtn.style.display = 'inline-block';
                approveBtn.style.display = 'inline-block';
            }
            
            // 显示模态框
            artworkModal.modal('show');
}

// 审核通过作品
function approveArtwork(artworkId) {
    const token = getAuthToken();
    
    // 如果没有有效的token，提示用户
    if (!token) {
        showError('您的登录已过期，请重新登录');
        setTimeout(() => {
            logout();
        }, 1500);
        return;
    }
    
    // 显示加载状态
    showLoading('正在审核...');
    
    fetch('http://172.16.201.200:8080/api/admin/approve_artwork', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            artwork_id: artworkId,
            approved: true,
            in_school_gallery: 1
        })
    })
    .then(response => {
        if (!response.ok) {
            // 如果返回401或403，提示认证问题
            if (response.status === 401 || response.status === 403) {
                throw new Error('认证失败，请重新登录');
            }
            throw new Error(`服务器返回错误: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showSuccess('作品审核通过成功');
            
            // 关闭模态框
            artworkModal.modal('hide');
            
            // 更新作品展示
            updateArtworkDisplay(artworkId, true);
            
            // 更新统计数据
            loadStats();
        } else {
            showError('审核失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('审核失败:', error);
        
        if (error.message.includes('认证失败')) {
            // 如果是认证问题，提示重新登录
            showError('认证失败，请重新登录');
            setTimeout(() => {
                logout();
            }, 1500);
        } else {
            showError('审核失败: ' + error.message);
        }
    })
    .finally(() => {
        hideLoading();
    });
}

// 拒绝作品
function rejectArtwork(artworkId, reason) {
    const token = getAuthToken();
    
    // 如果没有有效的token，提示用户
    if (!token) {
        showError('您的登录已过期，请重新登录');
        setTimeout(() => {
            logout();
        }, 1500);
        return;
    }
    
    // 显示加载状态
    showLoading('正在处理...');
    
    fetch('http://172.16.201.200:8080/api/admin/approve_artwork', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            artwork_id: artworkId,
            approved: false,
            in_school_gallery: 0,
            rejection_reason: reason
        })
    })
    .then(response => {
        if (!response.ok) {
            // 如果返回401或403，提示认证问题
            if (response.status === 401 || response.status === 403) {
                throw new Error('认证失败，请重新登录');
            }
            throw new Error(`服务器返回错误: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            showSuccess('作品拒绝成功');
            
            // 关闭模态框
            artworkModal.modal('hide');
            
            // 更新作品展示
            updateArtworkDisplay(artworkId, false);
            
            // 更新统计数据
            loadStats();
        } else {
            showError('拒绝失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(error => {
        console.error('拒绝失败:', error);
        
        if (error.message.includes('认证失败')) {
            // 如果是认证问题，提示重新登录
            showError('认证失败，请重新登录');
            setTimeout(() => {
                logout();
            }, 1500);
        } else {
            showError('拒绝失败: ' + error.message);
        }
    })
    .finally(() => {
        hideLoading();
    });
}

// 显示和隐藏加载状态的辅助函数
function showLoading(message = '加载中...') {
    // 如果页面上没有加载提示，就添加一个
    if (!document.getElementById('globalLoadingIndicator')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'globalLoadingIndicator';
        loadingDiv.style.position = 'fixed';
        loadingDiv.style.top = '50%';
        loadingDiv.style.left = '50%';
        loadingDiv.style.transform = 'translate(-50%, -50%)';
        loadingDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        loadingDiv.style.color = 'white';
        loadingDiv.style.padding = '20px';
        loadingDiv.style.borderRadius = '5px';
        loadingDiv.style.zIndex = '9999';
        loadingDiv.innerHTML = `<span id="loadingMessage">${message}</span>`;
        document.body.appendChild(loadingDiv);
    } else {
        // 更新现有加载消息
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('globalLoadingIndicator').style.display = 'block';
    }
}

function hideLoading() {
    const loadingDiv = document.getElementById('globalLoadingIndicator');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// 批量通过作品
function batchApprove() {
    if (selectedArtworks.length === 0) {
        showError('请先选择作品');
        return;
    }
    
    fetch('http://172.16.201.200:8080/api/admin/batch_approve', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            artwork_ids: selectedArtworks,
            approved: true,
            in_school_gallery: 1
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSuccess(`成功通过 ${data.modified_count} 个作品`);
            
            // 更新作品展示
            selectedArtworks.forEach(id => {
                updateArtworkDisplay(id, true);
            });
            
            // 清除选择
            clearSelection();
            
            // 更新统计数据
            loadStats();
        } else {
            showError('批量审核失败: ' + data.message);
        }
    })
    .catch(error => {
        showError('批量审核失败: ' + error.message);
    });
}

// 批量拒绝作品
function batchReject(reason = "管理员批量拒绝") {
    if (selectedArtworks.length === 0) {
        showError('请先选择作品');
        return;
    }
    
    fetch('http://172.16.201.200:8080/api/admin/batch_approve', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            artwork_ids: selectedArtworks,
            approved: false,
            rejection_reason: reason
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            showSuccess(`成功拒绝 ${data.modified_count} 个作品`);
            
            // 确保模态框已关闭
            if (batchRejectModal) {
            batchRejectModal.modal('hide');
                // 移除模态框背景
                $('.modal-backdrop').remove();
                // 恢复body的滚动
                $('body').removeClass('modal-open').css('padding-right', '');
            }
            
            // 更新作品展示
            selectedArtworks.forEach(id => {
                updateArtworkDisplay(id, false);
            });
            
            // 清除选择
            clearSelection();
            
            // 更新统计数据
            loadStats();
        } else {
            showError('批量拒绝失败: ' + data.message);
        }
    })
    .catch(error => {
        showError('批量拒绝失败: ' + error.message);
    });
}

// 更新作品展示状态
function updateArtworkDisplay(artworkId, approved) {
    const item = document.querySelector(`.review-item[data-id="${artworkId}"]`);
    if (!item) return;
    
    // 判断是否需要从当前视图中移除作品
    const shouldRemove = 
        (currentFilter === 'pending') || // 在待审核视图中总是移除
        (currentFilter === 'approved' && !approved) || // 在已通过视图中且被拒绝
        (currentFilter === 'rejected' && approved); // 在已拒绝视图中且被通过
    
    if (shouldRemove) {
        // 从当前视图中移除该项
        item.remove();
        
        // 如果没有更多项，显示提示
        if (reviewGrid.children.length === 0) {
            const message = currentFilter === 'pending' ? '没有待审核的作品' : 
                          currentFilter === 'approved' ? '没有已通过的作品' : 
                          '没有已拒绝的作品';
            reviewGrid.innerHTML = `<div class="alert alert-info text-center w-100">${message}</div>`;
        }
    } else {
        // 更新状态标签
        const statusLabel = item.querySelector('.badge');
        if (statusLabel) {
            statusLabel.className = approved ? 'badge badge-success' : 'badge badge-danger';
            statusLabel.textContent = approved ? '已通过' : '已拒绝';
        }
        
        // 更新按钮选中状态
        const approveBtn = item.querySelector('.approve-btn');
        const rejectBtn = item.querySelector('.reject-btn');
        
        if (approveBtn && rejectBtn) {
            if (approved) {
                approveBtn.classList.add('selected');
                rejectBtn.classList.remove('selected');
            } else {
                approveBtn.classList.remove('selected');
                rejectBtn.classList.add('selected');
            }
        }
        
        // 更新作品dataset中的数据
        if (item.dataset.artwork) {
            try {
                const artworkData = JSON.parse(item.dataset.artwork);
                artworkData.approved = approved;
                item.dataset.artwork = JSON.stringify(artworkData);
            } catch (error) {
                console.error('更新dataset数据失败:', error);
            }
        }
    }
}

// 切换选择状态
function toggleSelection(artworkId, checkmarkElement) {
    const index = selectedArtworks.indexOf(artworkId);
    
    if (index === -1) {
        // 添加到选择列表
        selectedArtworks.push(artworkId);
        checkmarkElement.classList.add('selected');
    } else {
        // 从选择列表移除
        selectedArtworks.splice(index, 1);
        checkmarkElement.classList.remove('selected');
    }
    
    // 更新已选择计数
    selectedCountLabel.textContent = `已选择 ${selectedArtworks.length} 项`;
    
    // 显示/隐藏批量操作栏
    batchActionsContainer.style.display = selectedArtworks.length > 0 ? 'flex' : 'none';
}

// 清除所有选择
function clearSelection() {
    selectedArtworks = [];
    
    // 重置所有选择标记
    document.querySelectorAll('.checkmark.selected').forEach(element => {
        element.classList.remove('selected');
    });
    
    // 更新已选择计数和隐藏批量操作栏
    selectedCountLabel.textContent = '已选择 0 项';
    batchActionsContainer.style.display = 'none';
}

// 重置作品网格
function resetArtworksGrid() {
    reviewGrid.innerHTML = '';
    currentPage = 1;
    hasMoreItems = true;
    isLoading = false;
    loadingIndicator.style.display = 'none';
    clearSelection();
}

// 处理搜索
function handleSearch() {
    const searchQuery = searchInput.value.trim();
    const searchType = document.getElementById('searchType').value;
    
    if (searchQuery === '' && currentPage === 1) return;
    
    resetArtworksGrid();
    
    // 更新URL及搜索参数
    const searchParams = {
        query: searchQuery,
        type: searchType
    };
    
    loadArtworks(1, perPage, searchParams);
}

// 获取认证令牌
function getAuthToken() {
    return localStorage.getItem('adminToken') || '';
}

// 注销
function logout() {
        localStorage.removeItem('adminToken');
        window.location.href = 'admin_login.html';
}

// 格式化日期
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 显示成功消息
function showSuccess(message) {
    // 不显示任何提示框，直接继续执行
    console.log('成功: ' + message);
}

// 显示错误消息
function showError(message) {
    // 使用控制台打印错误，不弹出对话框
    console.error('错误: ' + message);
}

// 使用演示数据
function useDemoData() {
    // 清空当前内容
    reviewGrid.innerHTML = '';
    
    // 创建演示数据
    const demoArtworks = [
        {
            _id: 'demo1',
            image_url: 'https://image.pollinations.ai/prompt/a%20beautiful%20landscape',
            chinese_prompt: '美丽的风景画',
            prompt: 'a beautiful landscape',
            student_id: '2023001',
            student_name: '演示学生1',
            submission_timestamp: Math.floor(Date.now() / 1000) - 3600,
            style: '风景'
        },
        {
            _id: 'demo2',
            image_url: 'https://image.pollinations.ai/prompt/a%20colorful%20portrait',
            chinese_prompt: '多彩的肖像画',
            prompt: 'a colorful portrait',
            student_id: '2023002',
            student_name: '演示学生2',
            submission_timestamp: Math.floor(Date.now() / 1000) - 7200,
            style: '肖像'
        },
        {
            _id: 'demo3',
            image_url: 'https://image.pollinations.ai/prompt/a%20fantasy%20world',
            chinese_prompt: '奇幻世界',
            prompt: 'a fantasy world',
            student_id: '2023003',
            student_name: '演示学生3',
            submission_timestamp: Math.floor(Date.now() / 1000) - 10800,
            style: '奇幻'
        }
    ];
    
    // 渲染演示数据
    renderArtworks(demoArtworks);
    
    // 显示提示信息
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-warning text-center w-100 mt-3';
    alertDiv.textContent = '当前显示的是演示数据，API请求失败';
    reviewGrid.prepend(alertDiv);
}

// 确保页面加载完成后初始化搜索和筛选功能
document.addEventListener('DOMContentLoaded', function() {
    // 检查管理员登录状态
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        // 未登录，跳转到登录页
        window.location.href = 'admin_login.html';
        return;
    }
    
    // 初始化页面
    init();
    
    // 确保搜索按钮事件绑定
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
    
    // 确保搜索输入框回车事件绑定
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
    }
    
    // 绑定退出登录按钮事件
    document.getElementById('logoutBtn').addEventListener('click', logout);
});

// 更新筛选显示
function updateFilterDisplay(filter) {
    // 高亮显示当前选中的卡片
    document.querySelectorAll('.card-link').forEach(link => {
        const card = link.querySelector('.card');
        if (link.getAttribute('data-filter') === filter) {
            card.style.opacity = '1';
            card.style.transform = 'scale(1.05)';
            card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
        } else {
            card.style.opacity = '0.8';
            card.style.transform = 'scale(1)';
            card.style.boxShadow = 'none';
        }
    });
    
    // 显示当前筛选状态的通知
    const filterName = getFilterName(filter);
    const notification = document.createElement('div');
    notification.className = 'alert alert-info alert-dismissible fade show mt-3';
    notification.innerHTML = `
        <strong>筛选:</strong> 当前显示${filterName}作品
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
            <span aria-hidden="true">&times;</span>
        </button>
    `;
    
    // 添加到页面上，放在统计卡片下方
    const existingAlert = document.querySelector('.alert-info.mt-3');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    const statsRow = document.querySelector('.review-stats');
    statsRow.parentNode.insertBefore(notification, statsRow.nextSibling);
    
    // 3秒后自动消失
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// 添加滚动事件监听
function handleScroll() {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - scrollThreshold) {
        loadMoreArtworks();
    }
} 