/**
 * AI绘画平台 - 用户管理
 */

// 确保API_BASE_URL变量存在，防止admin_common.js未加载
if (typeof API_BASE_URL === 'undefined') {
    // 定义备用的API基础URL
    const API_BASE_URL = (() => {
        // 尝试从localStorage获取配置的API地址
        const savedApiUrl = localStorage.getItem('api_base_url');
        if (savedApiUrl) return savedApiUrl;
        
        // 动态获取当前域名，自动配置API地址
        const currentHost = window.location.hostname;
        
        // 如果是在本地调试（localhost或127.0.0.1）
        if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
            return 'http://172.16.201.200:8080'; // 本地开发环境使用硬编码地址
        }
        
        // 生产环境：使用当前域名，API端口为8080
        return `http://${currentHost}:8080`;
    })();
    
    console.log('使用admin_users.js中定义的备用API地址:', API_BASE_URL);
}

// 页面状态变量
let currentPage = 1;
let totalPages = 1;
let perPage = 100;
let currentQuery = '';
let currentStatusFilter = 'all';
let selectedUsers = new Set();
let isLoading = false;

/**
 * 格式化时间戳为可读的日期时间字符串
 * @param {number} timestamp - Unix时间戳（秒）
 * @returns {string} 格式化后的日期时间字符串
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000); // 转换为毫秒
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

/**
 * 检查管理员登录状态
 * @returns {Promise} 返回Promise对象
 */
function checkAdminLogin() {
    return new Promise((resolve, reject) => {
        // 获取存储的管理员令牌
        const token = localStorage.getItem('adminToken');
        if (!token) {
            reject(new Error('未找到管理员令牌'));
            return;
        }

        // 验证令牌
        $.ajax({
            url: `${API_BASE_URL}/api/admin/verify_token`,
            type: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            },
            success: function(response) {
                if (response.status === 'success') {
                    resolve();
                } else {
                    reject(new Error(response.message || '令牌验证失败'));
                }
            },
            error: function(xhr) {
                let errorMsg = '令牌验证失败';
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    errorMsg = xhr.responseJSON.message;
                }
                reject(new Error(errorMsg));
            }
        });
    });
}

// DOM元素加载完成后执行
$(document).ready(function() {
    // 初始化页面
    init();
    
    // 绑定事件处理器
    bindEvents();
    
    // 添加隐藏的测试功能按钮（仅用于开发调试）
    $('#suspendedUsers').parent().append('<button id="testSuspendedBtn" class="btn btn-sm btn-info mt-2" style="display: none;">测试筛选</button>');
    
    $('#testSuspendedBtn').on('click', function() {
        console.log("执行暂停用户测试");
        // 直接获取所有用户并筛选出暂停用户
        getAndShowSuspendedUsers();
    });
});

/**
 * 初始化页面
 */
function init() {
    // 检查管理员登录状态
    checkAdminLogin()
        .then(() => {
            console.log('管理员令牌有效');
            // 加载用户数据
            loadUsers();
            
            // 加载用户统计数据
            loadUserStats();
            
            // 初始化筛选链接活动状态
            updateFilterLinkActive();
        })
        .catch((error) => {
            console.error('管理员验证失败:', error);
            // 重定向到登录页面
            localStorage.setItem('adminRedirectTarget', 'admin_users.html');
            window.location.href = 'admin_login.html';
        });
}

/**
 * 绑定页面事件处理器
 */
function bindEvents() {
    // 搜索按钮点击事件
    $('#searchBtn').on('click', function() {
        currentQuery = $('#searchInput').val().trim();
        currentPage = 1; // 重置到第一页
        loadUsers();
        updateFilterLinkActive();
    });
    
    // 搜索框回车事件
    $('#searchInput').on('keypress', function(e) {
        if (e.which === 13) {
            $('#searchBtn').click();
        }
    });
    
    // 状态筛选器变更事件
    $('#statusFilter').on('change', function() {
        currentStatusFilter = $(this).val();
        currentPage = 1; // 重置到第一页
        
        if (currentStatusFilter === 'suspended') {
            // 暂停用户使用特殊处理函数
            getAndShowSuspendedUsers();
        } else if (currentStatusFilter === 'inactive') {
            // 禁用用户使用特殊处理函数
            getAndShowInactiveUsers();
        } else {
            // 其他状态使用通用加载函数
            loadUsers();
        }
        
        updateFilterLinkActive();
    });
    
    // 统计卡片筛选链接点击事件
    $('.filter-link').on('click', function(e) {
        e.preventDefault();
        const filter = $(this).data('filter');
        $('#statusFilter').val(filter);
        currentStatusFilter = filter;
        currentPage = 1; // 重置到第一页
        
        if (filter === 'suspended') {
            // 暂停用户使用特殊处理函数
            getAndShowSuspendedUsers();
        } else if (filter === 'inactive') {
            // 禁用用户使用特殊处理函数
            getAndShowInactiveUsers();
        } else {
            // 其他状态使用通用加载函数
            loadUsers();
        }
        
        updateFilterLinkActive();
    });
    
    // 添加用户按钮
    $('#addUserBtn').on('click', function() {
        showUserModal();
    });
    
    // 用户状态下拉框变更事件
    $('#status').on('change', function() {
        toggleBanReasonField();
    });
    
    // 保存用户按钮
    $('#saveUserBtn').on('click', function() {
        saveUser();
    });
    
    // 导出用户按钮
    $('#exportUserBtn').on('click', function() {
        exportUsers();
    });
    
    // 文本导入按钮
    $('#importTextBtn').on('click', function() {
        $('#importTextModal').modal('show');
    });
    
    // CSV导入按钮
    $('#importCsvBtn').on('click', function() {
        $('#importCsvModal').modal('show');
    });
    
    // 确认文本导入按钮
    $('#confirmTextImportBtn').on('click', function() {
        importUsersFromText();
    });
    
    // 确认CSV导入按钮
    $('#confirmCsvImportBtn').on('click', function() {
        importUsersFromCsv();
    });
    
    // 选择全部用户复选框
    $('#selectAllUsers').on('change', function() {
        const isChecked = $(this).prop('checked');
        $('.user-checkbox').prop('checked', isChecked);
        
        if (isChecked) {
            // 添加所有可见用户到选中集合
            $('.user-checkbox').each(function() {
                selectedUsers.add($(this).val());
            });
        } else {
            // 清空选中集合
            selectedUsers.clear();
        }
        
        updateBatchActionsVisibility();
    });
    
    // 清除选择按钮
    $('#clearSelectionBtn').on('click', function() {
        selectedUsers.clear();
        $('.user-checkbox').prop('checked', false);
        $('#selectAllUsers').prop('checked', false);
        updateBatchActionsVisibility();
    });
    
    // 批量暂停按钮
    $('#batchSuspendBtn').on('click', function() {
        showBatchActionModal('suspend', '确定要暂停选中的用户吗？这将使他们在24小时内无法生成图片。');
    });
    
    // 批量解除暂停按钮
    $('#batchReactivateBtn').on('click', function() {
        showBatchActionModal('reactivate', '确定要解除选中用户的暂停状态吗？');
    });
    
    // 批量禁用按钮
    $('#batchDisableBtn').on('click', function() {
        showBatchActionModal('disable', '确定要禁用选中的用户吗？这将使他们无法继续使用系统。', true);
    });
    
    // 确认批量操作按钮
    $('#confirmBatchActionBtn').on('click', function() {
        const action = $(this).data('action');
        executeBatchAction(action);
    });
}

/**
 * 更新筛选链接的活动状态
 */
function updateFilterLinkActive() {
    // 移除所有链接的活动状态
    $('.filter-link').removeClass('active');
    
    // 为当前筛选状态的链接添加活动状态
    $(`.filter-link[data-filter="${currentStatusFilter}"]`).addClass('active');
}

/**
 * 加载用户列表
 */
function loadUsers() {
    if (isLoading) return;
    isLoading = true;
    
    // 显示加载中状态
    $('#loadingMessage').show();
    $('#noUsersMessage').hide();
    $('#userTableBody').empty();
    
    // 准备查询参数
    let apiUrl = `${API_BASE_URL}/api/admin/users?page=${currentPage}&per_page=${perPage}`;
    
    if (currentQuery) {
        apiUrl += `&query=${encodeURIComponent(currentQuery)}`;
    }
    
    console.log(`请求API: ${apiUrl}, 当前筛选条件: ${currentStatusFilter}`);
    
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 发送API请求
    $.ajax({
        url: apiUrl,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                console.log(`总共获取了 ${response.users.length} 个用户`);
                
                // 隐藏加载状态
                $('#loadingMessage').hide();
                
                let filteredUsers = response.users;
                
                // 根据当前筛选条件过滤用户
                if (currentStatusFilter !== 'all') {
                    if (currentStatusFilter === 'suspended') {
                        // 特别处理暂停用户 - 使用严格比较确保布尔值
                        filteredUsers = response.users.filter(user => {
                            // 详细记录每个用户的暂停状态
                            console.log(`筛选暂停用户: ${user.student_id}, is_suspended=`, user.is_suspended, typeof user.is_suspended);
                            // 明确比较布尔值true和字符串"true"
                            return user.is_suspended === true || user.is_suspended === "true";
                        });
                        
                        console.log(`筛选出 ${filteredUsers.length} 个暂停用户`);
                        if (filteredUsers.length > 0) {
                            console.log("第一个暂停用户示例:", filteredUsers[0]);
                        }
                    } else if (currentStatusFilter === 'active') {
                        // 筛选激活用户
                        filteredUsers = response.users.filter(user => 
                            user.status === 'active' && 
                            user.is_suspended !== true && 
                            user.is_suspended !== "true"
                        );
                        console.log(`筛选出 ${filteredUsers.length} 个激活用户`);
                    } else if (currentStatusFilter === 'inactive') {
                        // 筛选禁用用户
                        filteredUsers = response.users.filter(user => user.status === 'inactive');
                        console.log(`筛选出 ${filteredUsers.length} 个禁用用户`);
                    }
                }
                
                // 显示筛选后的用户数据
                displayUsers(filteredUsers);
                
                // 更新分页
                updatePagination(response.page, Math.ceil(response.total / perPage));
                
                // 更新筛选链接的活动状态
                updateFilterLinkActive();
                
                // 检查是否有数据
                if ($('#userTableBody tr:visible').length === 0) {
                    $('#noUsersMessage').show();
                } else {
                    $('#noUsersMessage').hide();
                }
            } else {
                $('#loadingMessage').hide();
                $('#noUsersMessage').show();
                showError(response.message || '加载用户数据失败');
            }
        },
        error: function(xhr) {
            $('#loadingMessage').hide();
            $('#noUsersMessage').show();
            
            let errorMsg = '加载用户数据失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            
            showError(errorMsg);
        },
        complete: function() {
            isLoading = false;
        }
    });
}

/**
 * 加载用户统计数据
 */
function loadUserStats() {
    const token = localStorage.getItem('adminToken');
    
    $.ajax({
        url: `${API_BASE_URL}/api/admin/user_stats`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                // 更新统计数据
                $('#totalUsers').text(response.stats.user_counts.total_users || 0);
                $('#activeUsers').text(response.stats.user_counts.active_users || 0);
                $('#suspendedUsers').text(response.stats.user_counts.suspended_users || 0);
                $('#inactiveUsers').text(response.stats.user_counts.inactive_users || 0);
            }
        },
        error: function() {
            console.error('加载用户统计数据失败');
        }
    });
}

/**
 * 显示用户列表
 * @param {Array} users - 用户数据数组
 */
function displayUsers(users) {
    const tableBody = $('#userTableBody');
    tableBody.empty();
    
    if (!users || users.length === 0) {
        $('#noUsersMessage').show();
        return;
    }
    
    users.forEach(user => {
        // 创建行元素
        const row = $('<tr></tr>');
        
        // 添加选择复选框
        row.append(`
            <td>
                <input type="checkbox" class="user-checkbox" value="${user._id}"
                    ${selectedUsers.has(user._id) ? 'checked' : ''}>
            </td>
        `);
        
        // 检查是否是暂停用户
        const isSuspended = user.is_suspended === true || 
                            user.is_suspended === "true" || 
                            user.is_suspended === 1 || 
                            user.is_suspended === "1";
        
        // 添加用户信息
        row.append(`
            <td>${user.student_id}</td>
            <td>${user.username || '-'}</td>
            <td>${getUserStatusBadge(user)}</td>
            <td>${user.temp_sensitive_count || 0}/5</td>
            <td>${user.sensitive_word_count || 0}</td>
            <td>${user.likes_count || 0}</td>
            <td>${user.last_login ? formatTimestamp(user.last_login) : '从未登录'}</td>
            <td>
                <button class="btn btn-sm btn-primary btn-action edit-user" data-id="${user._id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger btn-action delete-user" data-id="${user._id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `);
        
        // 根据状态添加行样式
        if (user.status === 'inactive') {
            row.addClass('user-banned');
        } else if (isSuspended) {
            row.addClass('user-suspended');
        }
        
        // 添加到表格
        tableBody.append(row);
    });
    
    // 绑定用户行事件
    bindUserRowEvents();
    
    // 隐藏无数据提示
    $('#noUsersMessage').hide();
}

/**
 * 获取用户状态的徽章HTML
 * @param {Object} user - 用户数据
 * @returns {string} 状态徽章HTML
 */
function getUserStatusBadge(user) {
    // 检查是否是暂停用户
    const isSuspended = user.is_suspended === true || 
                        user.is_suspended === "true" || 
                        user.is_suspended === 1 || 
                        user.is_suspended === "1";
                        
    if (user.status === 'inactive') {
        return `<span class="badge badge-danger">禁用</span>`;
    } else if (isSuspended) {
        // 首先尝试使用suspension_time作为暂停时间的来源
        let suspendDate = '未知时间';
        if (user.suspension_time) {
            suspendDate = formatTimestamp(user.suspension_time);
        } else if (user.last_sensitive_word_time) {
            suspendDate = formatTimestamp(user.last_sensitive_word_time);
        } else if (user.suspend_date) {
            suspendDate = formatTimestamp(user.suspend_date);
        }
        
        // 计算剩余解除时间
        let remainingTime = '';
        if (user.suspension_time) {
            const suspensionTime = user.suspension_time * 1000; // 转换为毫秒
            const currentTime = new Date().getTime();
            const endTime = suspensionTime + (24 * 60 * 60 * 1000); // 24小时后
            
            if (currentTime < endTime) {
                // 计算剩余时间
                const remainingMs = endTime - currentTime;
                const remainingHours = Math.floor(remainingMs / (60 * 60 * 1000));
                const remainingMinutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
                
                remainingTime = `，剩余解除时间: ${remainingHours}小时${remainingMinutes}分钟`;
            } else {
                remainingTime = '，已超过24小时，即将自动解除';
            }
        }
        
        return `
            <span class="badge badge-warning">暂停</span>
            <span class="suspension-info">从: ${suspendDate}${remainingTime}</span>
        `;
    } else {
        return `<span class="badge badge-success">激活</span>`;
    }
}

/**
 * 绑定用户行事件
 */
function bindUserRowEvents() {
    // 绑定复选框事件
    $('.user-checkbox').on('change', function() {
        const userId = $(this).val();
        
        if ($(this).prop('checked')) {
            selectedUsers.add(userId);
        } else {
            selectedUsers.delete(userId);
        }
        
        updateBatchActionsVisibility();
    });
    
    // 绑定编辑用户按钮事件
    $('.edit-user').on('click', function() {
        const userId = $(this).data('id');
        editUser(userId);
    });
    
    // 绑定删除用户按钮事件
    $('.delete-user').on('click', function() {
        const userId = $(this).data('id');
        deleteUser(userId);
    });
}

/**
 * 更新批量操作栏的可见性
 */
function updateBatchActionsVisibility() {
    if (selectedUsers.size > 0) {
        $('#batchActionsCard').show();
        $('#selectedCount').text(`已选择 ${selectedUsers.size} 项`);
    } else {
        $('#batchActionsCard').hide();
    }
}

/**
 * 更新分页控件
 * @param {number} currentPage - 当前页码
 * @param {number} totalPages - 总页数
 */
function updatePagination(currentPage, totalPages) {
    const pagination = $('#pagination');
    pagination.empty();
    
    if (totalPages <= 1) {
        return;
    }
    
    // 添加上一页按钮
    pagination.append(`
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage - 1}">上一页</a>
        </li>
    `);
    
    // 添加页码按钮
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);
    
    if (endPage - startPage + 1 < maxPages) {
        startPage = Math.max(1, endPage - maxPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagination.append(`
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}">${i}</a>
            </li>
        `);
    }
    
    // 添加下一页按钮
    pagination.append(`
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" data-page="${currentPage + 1}">下一页</a>
        </li>
    `);
    
    // 绑定分页事件
    $('.page-link').on('click', function(e) {
        e.preventDefault();
        
        if ($(this).parent().hasClass('disabled')) {
            return;
        }
        
        currentPage = parseInt($(this).data('page'));
        loadUsers();
    });
}

/**
 * 显示用户添加/编辑模态框
 * @param {Object} user - 用户数据对象（编辑时提供）
 */
function showUserModal(user = null) {
    // 重置表单
    $('#userForm')[0].reset();
    $('#userId').val('');
    
    if (user) {
        // 编辑模式
        $('#userModalLabel').text('编辑用户');
        
        // 调试信息
        console.log('编辑用户数据:', user);
        
        // 填充表单
        $('#userId').val(user._id);
        $('#studentId').val(user.student_id);
        $('#username').val(user.username || '');
        $('#status').val(user.status || 'active');
        $('#isSuspended').val(user.is_suspended ? '是' : '否');  // 使用中文值
        $('#sensitiveWordCount').val(user.sensitive_word_count || 0);
        $('#tempSensitiveCount').val(user.temp_sensitive_count || 0);
        $('#likesCount').val(user.likes_count || 0);
        
        if (user.ban_reason) {
            $('#banReason').val(user.ban_reason);
        }
        
        // 禁用学号字段
        $('#studentId').prop('disabled', true);
        
        // 调试信息
        console.log('表单填充后的值:', {
            id: $('#userId').val(),
            studentId: $('#studentId').val(),
            username: $('#username').val(),
            status: $('#status').val(),
            isSuspended: $('#isSuspended').val(),
            sensitiveWordCount: $('#sensitiveWordCount').val(),
            tempSensitiveCount: $('#tempSensitiveCount').val(),
            likesCount: $('#likesCount').val(),
            banReason: $('#banReason').val()
        });
    } else {
        // 添加模式
        $('#userModalLabel').text('添加用户');
        $('#studentId').prop('disabled', false);
        
        // 设置默认值
        $('#status').val('active');
        $('#isSuspended').val('否');
        $('#sensitiveWordCount').val('0');
        $('#tempSensitiveCount').val('0');
        $('#likesCount').val('0');
    }
    
    // 控制禁用原因字段的显示
    toggleBanReasonField();
    
    // 显示模态框
    $('#userModal').modal('show');
}

/**
 * 控制禁用原因字段的显示
 */
function toggleBanReasonField() {
    const status = $('#status').val();
    if (status === 'inactive') {
        $('#banReasonGroup').show();
    } else {
        $('#banReasonGroup').hide();
    }
}

/**
 * 保存用户数据
 */
function saveUser() {
    // 获取表单数据
    const userId = $('#userId').val();
    const studentId = $('#studentId').val();
    const username = $('#username').val();
    const status = $('#status').val();
    const isSuspended = $('#isSuspended').val() === '是';  // 使用中文值判断
    const sensitiveWordCount = parseInt($('#sensitiveWordCount').val()) || 0;
    const tempSensitiveCount = parseInt($('#tempSensitiveCount').val()) || 0;
    const likesCount = parseInt($('#likesCount').val()) || 0;
    const banReason = $('#banReason').val();
    
    // 调试信息
    console.log('保存用户数据:', {
        userId,
        studentId,
        username,
        status,
        isSuspended,
        'isSuspended原始值': $('#isSuspended').val(),
        sensitiveWordCount,
        tempSensitiveCount,
        likesCount,
        banReason
    });
    
    // 验证必填字段
    if (!studentId) {
        alert('请填写学号');
        return;
    }
    
    // 准备请求数据
    const userData = {
        student_id: studentId,
        username: username,
        status: status,
        is_suspended: isSuspended,
        sensitive_word_count: sensitiveWordCount,
        temp_sensitive_count: tempSensitiveCount,
        likes_count: likesCount
    };
    
    // 如果用户被暂停，添加暂停时间
    if (isSuspended) {
        // 使用suspension_time作为暂停时间字段，而不是last_sensitive_word_time
        userData.suspension_time = Math.floor(Date.now() / 1000);
    } else {
        // 如果取消暂停，清除暂停相关字段
        userData.suspension_time = null;
        userData.temp_sensitive_count = 0;
    }
    
    // 如果状态是禁用，添加禁用原因
    if (status === 'inactive' && banReason) {
        userData.ban_reason = banReason;
    }
    
    // 调试信息
    console.log('发送到服务器的数据:', userData);
    
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 设置API URL和方法
    let apiUrl = `${API_BASE_URL}/api/admin/users`;
    let method = 'POST';
    
    if (userId) {
        // 编辑现有用户
        apiUrl = `${API_BASE_URL}/api/admin/users/${userId}`;
        method = 'PUT';
    }
    
    // 发送API请求
    $.ajax({
        url: apiUrl,
        type: method,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(userData),
        success: function(response) {
            console.log('服务器响应:', response);  // 添加调试信息
            if (response.status === 'success') {
                // 关闭模态框
                $('#userModal').modal('hide');
                
                // 重新加载用户数据
                loadUsers();
                loadUserStats();
                
                // 显示成功消息
                alert(userId ? '用户更新成功' : '用户创建成功');
            } else {
                alert(response.message || '操作失败');
            }
        },
        error: function(xhr) {
            console.log('请求错误:', xhr);  // 添加调试信息
            let errorMsg = '操作失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 编辑用户
 * @param {string} userId - 用户ID
 */
function editUser(userId) {
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 发送API请求获取用户详情
    $.ajax({
        url: `${API_BASE_URL}/api/admin/users?page=1&per_page=1000`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                // 查找目标用户
                const user = response.users.find(u => u._id === userId);
                
                if (user) {
                    showUserModal(user);
                } else {
                    alert('未找到用户数据');
                }
            } else {
                alert(response.message || '获取用户数据失败');
            }
        },
        error: function(xhr) {
            let errorMsg = '获取用户数据失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 删除用户
 * @param {string} userId - 用户ID
 */
function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？此操作不可撤销。')) {
        return;
    }
    
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 发送API请求
    $.ajax({
        url: `${API_BASE_URL}/api/admin/users/${userId}`,
        type: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                // 重新加载用户数据
                loadUsers();
                loadUserStats();
                
                // 显示成功消息
                alert('用户删除成功');
            } else {
                alert(response.message || '删除用户失败');
            }
        },
        error: function(xhr) {
            let errorMsg = '删除用户失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 显示批量操作确认模态框
 * @param {string} action - 操作类型
 * @param {string} message - 确认消息
 * @param {boolean} showBanReason - 是否显示禁用原因输入框
 */
function showBatchActionModal(action, message, showBanReason = false) {
    $('#batchActionMessage').text(message);
    $('#confirmBatchActionBtn').data('action', action);
    
    // 控制禁用原因输入框的显示
    if (showBanReason) {
        $('#batchBanReasonGroup').show();
    } else {
        $('#batchBanReasonGroup').hide();
    }
    
    // 显示模态框
    $('#batchActionModal').modal('show');
}

/**
 * 执行批量操作
 * @param {string} action - 操作类型
 */
function executeBatchAction(action) {
    if (selectedUsers.size === 0) {
        alert('请先选择要操作的用户');
        return;
    }
    
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 将Set转换为数组
    const userIds = Array.from(selectedUsers);
    
    let apiUrl;
    let requestData = { user_ids: userIds };
    
    switch (action) {
        case 'suspend':
            // 批量暂停用户
            apiUrl = `${API_BASE_URL}/api/admin/users/batch_update`;
            requestData.update = {
                is_suspended: true,
                suspension_time: Math.floor(Date.now() / 1000)  // 使用suspension_time字段
            };
            break;
            
        case 'reactivate':
            // 批量解除暂停
            apiUrl = `${API_BASE_URL}/api/admin/reset_temp_violations`;
            requestData.student_ids = userIds;
            break;
            
        case 'disable':
            // 批量禁用用户
            apiUrl = `${API_BASE_URL}/api/admin/users/batch_update`;
            const banReason = $('#batchBanReason').val() || '管理员批量禁用';
            requestData.update = {
                status: 'inactive',
                ban_reason: banReason,
                ban_date: Math.floor(Date.now() / 1000)
            };
            break;
            
        default:
            alert('未知操作');
            return;
    }
    
    // 发送API请求
    $.ajax({
        url: apiUrl,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify(requestData),
        success: function(response) {
            if (response.status === 'success') {
                // 关闭模态框
                $('#batchActionModal').modal('hide');
                
                // 清除选择
                selectedUsers.clear();
                
                // 重新加载用户数据
                loadUsers();
                loadUserStats();
                
                // 如果当前筛选条件是暂停，并且操作是暂停或解除暂停，则使用专门的函数
                if ((currentStatusFilter === 'suspended') && 
                    (action === 'suspend' || action === 'reactivate')) {
                    getAndShowSuspendedUsers();
                }
                
                // 如果当前筛选条件是禁用，并且操作是禁用，则使用专门的函数
                if ((currentStatusFilter === 'inactive') && action === 'disable') {
                    getAndShowInactiveUsers();
                }
                
                // 显示成功消息
                alert('批量操作成功，已处理 ' + userIds.length + ' 个用户');
            } else {
                alert(response.message || '批量操作失败');
            }
        },
        error: function(xhr) {
            let errorMsg = '批量操作失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 导出用户数据
 */
function exportUsers() {
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 添加查询参数，支持筛选
    let apiUrl = `${API_BASE_URL}/api/admin/users/export`;
    
    if (currentQuery) {
        apiUrl += `?query=${encodeURIComponent(currentQuery)}`;
    }
    
    // 发送API请求
    $.ajax({
        url: apiUrl,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                // 创建CSV内容
                const csvContent = createCsvContent(response.users);
                
                // 下载CSV文件
                downloadCsv(csvContent, 'users_export.csv');
            } else {
                alert(response.message || '导出用户数据失败');
            }
        },
        error: function(xhr) {
            let errorMsg = '导出用户数据失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 从文本导入用户
 */
function importUsersFromText() {
    const textData = $('#importTextData').val().trim();
    
    if (!textData) {
        alert('请输入用户数据');
        return;
    }
    
    // 解析文本数据
    const lines = textData.split(/\r?\n/);
    const users = [];
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        // 支持多种分隔符
        const parts = line.split(/[,\t ]+/);
        
        if (parts.length >= 1) {
            const student_id = parts[0].trim();
            const username = parts.length > 1 ? parts[1].trim() : '';
            
            if (student_id) {
                users.push({ student_id, username });
            }
        }
    }
    
    if (users.length === 0) {
        alert('未找到有效的用户数据');
        return;
    }
    
    // 执行批量导入
    importUsers(users);
}

/**
 * 从CSV文件导入用户
 */
function importUsersFromCsv() {
    const fileInput = $('#csvFileInput')[0];
    
    if (!fileInput.files || fileInput.files.length === 0) {
        alert('请选择CSV文件');
        return;
    }
    
    const file = fileInput.files[0];
    
    // 检查文件类型
    if (file.type && !file.type.match('text/csv') && !file.type.match('application/vnd.ms-excel')) {
        alert('请选择CSV格式的文件');
        return;
    }
    
    // 读取文件内容
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split(/\r?\n/);
        
        if (lines.length < 2) {
            alert('CSV文件格式不正确或没有数据行');
            return;
        }
        
        // 解析标题行
        const headers = lines[0].split(',').map(h => h.trim());
        
        // 检查必须的列
        if (!headers.includes('student_id')) {
            alert('CSV文件必须包含student_id列');
            return;
        }
        
        // 解析数据行
        const users = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = line.split(',').map(v => v.trim());
            const user = {};
            
            // 映射列到用户对象
            for (let j = 0; j < headers.length; j++) {
                if (j < values.length) {
                    user[headers[j]] = values[j];
                }
            }
            
            if (user.student_id) {
                // 转换布尔值和数字
                if ('is_suspended' in user) {
                    user.is_suspended = user.is_suspended.toLowerCase() === 'true';
                }
                
                if ('sensitive_word_count' in user) {
                    user.sensitive_word_count = parseInt(user.sensitive_word_count) || 0;
                }
                
                if ('temp_sensitive_count' in user) {
                    user.temp_sensitive_count = parseInt(user.temp_sensitive_count) || 0;
                }
                
                if ('likes_count' in user) {
                    user.likes_count = parseInt(user.likes_count) || 0;
                }
                
                users.push(user);
            }
        }
        
        if (users.length === 0) {
            alert('未找到有效的用户数据');
            return;
        }
        
        // 执行批量导入
        importUsers(users);
    };
    
    reader.onerror = function() {
        alert('读取文件失败');
    };
    
    reader.readAsText(file);
}

/**
 * 批量导入用户
 * @param {Array} users - 用户数据数组
 */
function importUsers(users) {
    if (!users || users.length === 0) {
        alert('没有要导入的用户数据');
        return;
    }
    
    // 确认导入
    if (!confirm(`确定要导入 ${users.length} 个用户吗？`)) {
        return;
    }
    
    // 获取认证令牌
    const token = localStorage.getItem('adminToken');
    
    // 发送API请求
    $.ajax({
        url: `${API_BASE_URL}/api/admin/users/import`,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ users }),
        success: function(response) {
            if (response.status === 'success') {
                // 关闭模态框
                $('#importTextModal').modal('hide');
                $('#importCsvModal').modal('hide');
                
                // 重置表单
                $('#importTextData').val('');
                $('#csvFileInput').val('');
                
                // 重新加载用户数据
                loadUsers();
                loadUserStats();
                
                // 显示成功消息
                alert(`导入成功: 新增 ${response.imported || 0} 个用户，更新 ${response.updated || 0} 个用户，失败 ${response.failed || 0} 个用户`);
            } else {
                alert(response.message || '导入用户失败');
            }
        },
        error: function(xhr) {
            let errorMsg = '导入用户失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 创建CSV内容
 * @param {Array} users - 用户数据数组
 * @returns {string} CSV内容
 */
function createCsvContent(users) {
    if (!users || users.length === 0) {
        return '';
    }
    
    // CSV标题行
    const headers = [
        'student_id',
        'username',
        'status',
        'sensitive_word_count',
        'temp_sensitive_count',
        'is_suspended',
        'suspend_date',
        'likes_count',
        'last_login',
        'created_at'
    ];
    
    // 构建CSV内容
    let csvContent = headers.join(',') + '\n';
    
    // 添加数据行
    for (const user of users) {
        const row = [
            user.student_id || '',
            (user.username || '').replace(/,/g, ' '),  // 替换逗号以避免CSV格式问题
            user.status || 'active',
            user.sensitive_word_count || 0,
            user.temp_sensitive_count || 0,
            user.is_suspended || false,
            user.suspend_date ? formatTimestamp(user.suspend_date) : '',
            user.likes_count || 0,
            user.last_login ? formatTimestamp(user.last_login) : '',
            user.created_at ? formatTimestamp(user.created_at) : ''
        ];
        
        csvContent += row.join(',') + '\n';
    }
    
    return csvContent;
}

/**
 * 下载CSV文件
 * @param {string} content - CSV内容
 * @param {string} filename - 文件名
 */
function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    // 创建下载链接
    if (navigator.msSaveBlob) {
        // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        // 其他浏览器
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

/**
 * 直接获取和显示暂停用户的测试函数
 */
function getAndShowSuspendedUsers() {
    const token = localStorage.getItem('adminToken');
    
    // 显示加载中状态
    $('#loadingMessage').show();
    $('#noUsersMessage').hide();
    $('#userTableBody').empty();
    
    // 发送API请求获取所有用户
    $.ajax({
        url: `${API_BASE_URL}/api/admin/users?page=1&per_page=1000`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                console.log(`总共获取了 ${response.users.length} 个用户`);
                
                // 隐藏加载状态
                $('#loadingMessage').hide();
                
                // 手动筛选暂停用户
                const suspendedUsers = response.users.filter(user => {
                    // 打印所有用户属性，查看暂停状态的存储方式
                    console.log(`用户属性 ${user.student_id}:`, user);
                    
                    // 尝试各种可能的暂停状态格式
                    const isSuspended = user.is_suspended === true || 
                                        user.is_suspended === "true" || 
                                        user.is_suspended === 1 || 
                                        user.is_suspended === "1";
                                        
                    if (isSuspended) {
                        console.log(`找到暂停用户: ${user.student_id}`);
                    }
                    
                    return isSuspended;
                });
                
                console.log(`找到 ${suspendedUsers.length} 个暂停用户`);
                if (suspendedUsers.length > 0) {
                    console.log("暂停用户列表:", suspendedUsers);
                }
                
                if (suspendedUsers.length > 0) {
                    // 显示找到的暂停用户
                    displayUsers(suspendedUsers);
                    $('#noUsersMessage').hide();
                } else {
                    $('#userTableBody').empty();
                    $('#noUsersMessage').show();
                }
                
                // 更新筛选链接状态
                $('.filter-link').removeClass('active');
                $('.filter-link[data-filter="suspended"]').addClass('active');
                
                // 更新当前筛选状态
                currentStatusFilter = 'suspended';
                $('#statusFilter').val('suspended');
            } else {
                $('#loadingMessage').hide();
                $('#noUsersMessage').show();
                alert('获取用户数据失败');
            }
        },
        error: function(xhr) {
            $('#loadingMessage').hide();
            $('#noUsersMessage').show();
            let errorMsg = '获取用户数据失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
}

/**
 * 直接获取和显示禁用用户的函数
 */
function getAndShowInactiveUsers() {
    const token = localStorage.getItem('adminToken');
    
    // 显示加载中状态
    $('#loadingMessage').show();
    $('#noUsersMessage').hide();
    $('#userTableBody').empty();
    
    // 发送API请求获取所有用户
    $.ajax({
        url: `${API_BASE_URL}/api/admin/users?page=1&per_page=1000`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function(response) {
            if (response.status === 'success') {
                console.log(`总共获取了 ${response.users.length} 个用户`);
                
                // 隐藏加载状态
                $('#loadingMessage').hide();
                
                // 手动筛选禁用用户
                const inactiveUsers = response.users.filter(user => {
                    // 打印用户状态
                    console.log(`筛选禁用用户: ${user.student_id}, status=`, user.status);
                    
                    // 检查用户状态是否为inactive
                    return user.status === 'inactive';
                });
                
                console.log(`找到 ${inactiveUsers.length} 个禁用用户`);
                if (inactiveUsers.length > 0) {
                    console.log("禁用用户列表:", inactiveUsers);
                }
                
                if (inactiveUsers.length > 0) {
                    // 显示找到的禁用用户
                    displayUsers(inactiveUsers);
                    $('#noUsersMessage').hide();
                } else {
                    $('#userTableBody').empty();
                    $('#noUsersMessage').show();
                }
                
                // 更新筛选链接状态
                $('.filter-link').removeClass('active');
                $('.filter-link[data-filter="inactive"]').addClass('active');
                
                // 更新当前筛选状态
                currentStatusFilter = 'inactive';
                $('#statusFilter').val('inactive');
            } else {
                $('#loadingMessage').hide();
                $('#noUsersMessage').show();
                alert('获取用户数据失败');
            }
        },
        error: function(xhr) {
            $('#loadingMessage').hide();
            $('#noUsersMessage').show();
            let errorMsg = '获取用户数据失败';
            if (xhr.responseJSON && xhr.responseJSON.message) {
                errorMsg = xhr.responseJSON.message;
            }
            alert(errorMsg);
        }
    });
} 