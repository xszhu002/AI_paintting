/**
 * AI绘画平台 - 数据备份与还原功能
 */

// 存储备份列表数据
let backupsList = [];
let selectedBackupId = null;

/**
 * 初始化页面
 */
function init() {
    // 检查管理员登录状态
    checkAdminLogin()
        .then(() => {
            console.log('管理员令牌有效');
            
            // 记录日志
            logOperation('info', '页面初始化成功，正在加载备份数据...');
            
            // 加载备份列表
            loadBackupsList();
            
            // 绑定事件处理器
            bindEventHandlers();
        })
        .catch((error) => {
            console.error('管理员验证失败:', error);
            // 重定向到登录页面
            localStorage.setItem('adminRedirectTarget', 'admin_backup.html');
            window.location.href = 'admin_login.html';
        });
}

/**
 * 加载备份列表
 */
function loadBackupsList() {
    // 显示加载中
    $('#backupList').html(`
        <div class="text-center py-3">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">加载中...</span>
            </div>
            <p class="mt-2">正在加载备份列表...</p>
        </div>
    `);
    
    // 禁用相关按钮
    $('#restoreSelectedBtn, #deleteSelectedBtn, #downloadSelectedBtn').prop('disabled', true);
    
    $.ajax({
        url: `${API_BASE_URL}/api/admin/backups`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success') {
                if (response.data && response.data.length > 0) {
                    // 保存备份列表
                    backupsList = response.data;
                    
                    // 渲染列表
                    renderBackupsList();
                    
                    logOperation('info', `加载了 ${backupsList.length} 个备份文件`);
                } else {
                    // 没有备份
                    $('#backupList').html(`
                        <div class="text-center py-3">
                            <i class="fas fa-info-circle text-info fa-2x mb-2"></i>
                            <p>暂无备份记录</p>
                        </div>
                    `);
                    logOperation('info', '暂无备份记录');
                }
            } else {
                // 加载失败
                $('#backupList').html(`
                    <div class="text-center py-3">
                        <i class="fas fa-exclamation-circle text-danger fa-2x mb-2"></i>
                        <p>加载失败: ${response.message || '未知错误'}</p>
                        <button class="btn btn-outline-primary btn-sm" id="retryLoadBtn">
                            <i class="fas fa-sync-alt"></i> 重试
                        </button>
                    </div>
                `);
                
                // 绑定重试按钮
                $('#retryLoadBtn').on('click', loadBackupsList);
                
                logOperation('error', `加载备份列表失败: ${response.message || '未知错误'}`);
            }
        },
        error: function(xhr) {
            console.error('加载备份列表失败:', xhr.responseText);
            
            // 显示错误
            $('#backupList').html(`
                <div class="text-center py-3">
                    <i class="fas fa-exclamation-circle text-danger fa-2x mb-2"></i>
                    <p>加载失败: 网络错误</p>
                    <button class="btn btn-outline-primary btn-sm" id="retryLoadBtn">
                        <i class="fas fa-sync-alt"></i> 重试
                    </button>
                </div>
            `);
            
            // 绑定重试按钮
            $('#retryLoadBtn').on('click', loadBackupsList);
            
            logOperation('error', '加载备份列表失败，请检查网络连接');
        }
    });
}

/**
 * 渲染备份列表
 */
function renderBackupsList() {
    // 清空列表
    $('#backupList').empty();
    
    // 对备份按创建时间排序（最新的在前面）
    backupsList.sort((a, b) => b.created_at - a.created_at);
    
    // 遍历渲染每个备份项
    for (const backup of backupsList) {
        const backupTime = new Date(backup.created_at * 1000).toLocaleString();
        const backupSize = formatFileSize(backup.size);
        
        // 渲染备份项
        const backupItem = $(`
            <div class="backup-item" data-id="${backup.id}">
                <div class="backup-meta">
                    <span class="backup-time">${backupTime}</span>
                    <span class="backup-size">${backupSize}</span>
                </div>
                <div class="backup-info">
                    <div><i class="fas fa-file-archive"></i> ${backup.filename}</div>
                    <div><small>包含: ${(backup.collections || []).join(', ')}</small></div>
                </div>
            </div>
        `);
        
        $('#backupList').append(backupItem);
    }
    
    // 更新日志
    logOperation('info', '备份列表已更新');
}

/**
 * 创建新备份
 */
function createBackup() {
    logOperation('info', '正在创建备份...');
    
    // 禁用按钮，防止重复点击
    $('#createBackupBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 备份中...');
    
    $.ajax({
        url: `${API_BASE_URL}/api/admin/backups`,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({}),  // 添加空对象作为请求体数据
        success: function(response) {
            if (response.status === 'success') {
                logOperation('success', `备份创建成功: ${response.filename}`);
                
                // 重新加载备份列表
                loadBackupsList();
            } else {
                logOperation('error', `创建备份失败: ${response.message || '未知错误'}`);
            }
            
            // 恢复按钮状态
            $('#createBackupBtn').prop('disabled', false).html('<i class="fas fa-save"></i> 立即备份');
        },
        error: function(xhr) {
            console.error('创建备份失败:', xhr.responseText);
            logOperation('error', '创建备份失败，请检查网络连接');
            
            // 恢复按钮状态
            $('#createBackupBtn').prop('disabled', false).html('<i class="fas fa-save"></i> 立即备份');
        }
    });
}

/**
 * 从选中的备份还原
 */
function restoreFromBackup() {
    if (!selectedBackupId) {
        logOperation('error', '请先选择要还原的备份');
        return;
    }
    
    const selectedBackup = backupsList.find(backup => backup.id === selectedBackupId);
    if (!selectedBackup) {
        logOperation('error', '找不到选中的备份');
        return;
    }
    
    logOperation('info', `准备从备份 "${selectedBackup.filename}" 还原数据库...`);
    
    // 显示确认对话框
    $('#confirmRestoreModal').modal('show');
}

/**
 * 删除选中的备份
 */
function deleteBackup() {
    if (!selectedBackupId) {
        logOperation('error', '请先选择要删除的备份');
        return;
    }
    
    const selectedBackup = backupsList.find(backup => backup.id === selectedBackupId);
    if (!selectedBackup) {
        logOperation('error', '找不到选中的备份');
        return;
    }
    
    // 确认删除
    if (!confirm(`确定要删除备份 "${selectedBackup.filename}" 吗？此操作不可恢复！`)) {
        logOperation('info', '取消删除备份');
        return;
    }
    
    logOperation('info', `正在删除备份 "${selectedBackup.filename}"...`);
    
    // 禁用按钮
    $('#deleteSelectedBtn').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 删除中...');
    
    $.ajax({
        url: `${API_BASE_URL}/api/admin/backups/${selectedBackupId}`,
        type: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success') {
                logOperation('success', `备份 "${selectedBackup.filename}" 删除成功`);
                
                // 从列表中移除
                backupsList = backupsList.filter(backup => backup.id !== selectedBackupId);
                selectedBackupId = null;
                
                // 重新渲染列表
                renderBackupsList();
                
                // 禁用操作按钮
                $('#restoreSelectedBtn, #deleteSelectedBtn, #downloadSelectedBtn').prop('disabled', true);
            } else {
                logOperation('error', `删除备份失败: ${response.message || '未知错误'}`);
                // 恢复按钮状态
                $('#deleteSelectedBtn').prop('disabled', false).html('<i class="fas fa-trash"></i> 删除选中的备份');
            }
        },
        error: function(xhr) {
            console.error('删除备份失败:', xhr.responseText);
            logOperation('error', '删除备份失败，请检查网络连接');
            
            // 恢复按钮状态
            $('#deleteSelectedBtn').prop('disabled', false).html('<i class="fas fa-trash"></i> 删除选中的备份');
        }
    });
}

/**
 * 下载选中的备份
 */
function downloadBackup() {
    if (!selectedBackupId) {
        logOperation('error', '请先选择要下载的备份');
        return;
    }
    
    const selectedBackup = backupsList.find(backup => backup.id === selectedBackupId);
    if (!selectedBackup) {
        logOperation('error', '找不到选中的备份');
        return;
    }
    
    logOperation('info', `正在下载备份: ${selectedBackup.filename}`);
    
    // 直接使用Fetch API下载文件
    fetch(`${API_BASE_URL}/api/admin/backups/${selectedBackup.id}/download`, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('下载失败');
        }
        return response.blob();
    })
    .then(blob => {
        // 创建一个临时下载链接
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = selectedBackup.filename;
        document.body.appendChild(a);
        a.click();
        
        // 清理
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        logOperation('success', `成功下载备份: ${selectedBackup.filename}`);
    })
    .catch(error => {
        console.error('下载失败:', error);
        logOperation('error', '下载备份失败，请检查网络连接');
    });
}

/**
 * 从上传的文件还原
 */
function restoreFromFile() {
    // 检查是否选择了文件
    const fileInput = $('#backupFile')[0];
    if (!fileInput.files || fileInput.files.length === 0) {
        logOperation('error', '请先选择备份文件');
        return;
    }
    
    const file = fileInput.files[0];
    
    // 检查文件类型
    if (!file.name.endsWith('.json')) {
        logOperation('error', '请选择JSON格式的备份文件');
        return;
    }
    
    // 确认警告
    if (!confirm(`确定要从文件 "${file.name}" 还原数据库吗？此操作将覆盖当前所有数据，且不可撤销！`)) {
        logOperation('info', '取消从文件还原');
        return;
    }
    
    logOperation('info', `正在从文件 "${file.name}" 还原数据库...`);
    
    // 禁用按钮，防止重复提交
    const submitBtn = $('#uploadBackupForm button[type="submit"]');
    submitBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> 还原中...');
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('backup_file', file);
    
    $.ajax({
        url: `${API_BASE_URL}/api/admin/backups/restore_from_file`,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        data: formData,
        processData: false,  // 不处理数据
        contentType: false,  // 不设置内容类型
        success: function(response) {
            if (response.status === 'success') {
                logOperation('success', `从文件成功还原数据库，以下集合已更新: ${Object.keys(response.restore_results).join(', ')}`);
                
                // 清空文件输入框，重置表单
                fileInput.value = '';
                $('.custom-file-label').html('选择备份文件');
                
                // 重新加载备份列表
                loadBackupsList();
            } else {
                logOperation('error', `从文件还原失败: ${response.message || '未知错误'}`);
            }
            
            // 恢复按钮状态
            submitBtn.prop('disabled', false).html('<i class="fas fa-upload"></i> 上传并还原');
        },
        error: function(xhr) {
            console.error('从文件还原失败:', xhr.responseText);
            logOperation('error', '从文件还原失败，请检查网络连接');
            
            // 恢复按钮状态
            submitBtn.prop('disabled', false).html('<i class="fas fa-upload"></i> 上传并还原');
        }
    });
}

/**
 * 记录操作日志
 * @param {string} type - 日志类型: info, success, error
 * @param {string} message - 日志消息
 */
function logOperation(type, message) {
    const log = $('#operationLog');
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN');
    
    const logEntry = $(`
        <div class="log-entry">
            <span class="log-time">[${timeString}]</span>
            <span class="log-${type}">${message}</span>
        </div>
    `);
    
    log.prepend(logEntry);
    
    // 限制日志条目数量
    if (log.children().length > 100) {
        log.children().last().remove();
    }
}

/**
 * 清空操作日志
 */
function clearLog() {
    if (confirm('确定要清空操作日志吗？')) {
        $('#operationLog').html(`
            <div class="log-entry">
                <span class="log-time">[系统]</span>
                <span class="log-info">日志已清空</span>
            </div>
        `);
    }
}

/**
 * 绑定事件处理器
 */
function bindEventHandlers() {
    // 点击创建备份按钮
    $('#createBackupBtn').on('click', function() {
        createBackup();
    });
    
    // 点击刷新备份列表按钮
    $('#refreshBackupsBtn').on('click', function() {
        loadBackupsList();
    });
    
    // 点击从选中的备份还原按钮
    $('#restoreSelectedBtn').on('click', function() {
        restoreFromBackup();
    });
    
    // 点击删除选中的备份按钮
    $('#deleteSelectedBtn').on('click', function() {
        deleteBackup();
    });
    
    // 点击下载选中的备份按钮
    $('#downloadSelectedBtn').on('click', function() {
        downloadBackup();
    });
    
    // 确认还原对话框中的确认按钮
    $('#confirmRestoreBtn').on('click', function() {
        // 隐藏对话框
        $('#confirmRestoreModal').modal('hide');
        
        // 执行实际的还原操作
        const backupId = selectedBackupId;
        if (backupId) {
            // 发送还原请求
            $.ajax({
                url: `${API_BASE_URL}/api/admin/backups/${backupId}/restore`,
                type: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({}),
                success: function(response) {
                    if (response.status === 'success') {
                        logOperation('success', `成功从备份 ${backupId} 还原数据库: ${JSON.stringify(response.restore_results)}`);
                    } else {
                        logOperation('error', `从备份还原失败: ${response.message || '未知错误'}`);
                    }
                },
                error: function(xhr) {
                    console.error('从备份还原失败:', xhr.responseText);
                    logOperation('error', '从备份还原失败，请检查网络连接');
                }
            });
        }
    });
    
    // 清空日志按钮
    $('#clearLogBtn').on('click', function() {
        clearLog();
    });
    
    // 上传备份文件表单提交
    $('#uploadBackupForm').on('submit', function(e) {
        e.preventDefault();
        restoreFromFile();
    });
    
    // 当选择文件时更新文件输入框标签
    $('#backupFile').on('change', function() {
        const fileName = $(this).val().split('\\').pop();
        $(this).next('.custom-file-label').html(fileName || '选择备份文件');
    });
    
    // 备份项点击事件（委托到父元素）
    $('#backupList').on('click', '.backup-item', function() {
        // 移除其他项目的选中状态
        $('.backup-item').removeClass('active');
        
        // 添加当前项的选中状态
        $(this).addClass('active');
        
        // 保存选中的备份ID
        selectedBackupId = $(this).data('id');
        
        // 启用操作按钮
        $('#restoreSelectedBtn, #deleteSelectedBtn, #downloadSelectedBtn').prop('disabled', false);
        
        // 更新确认还原对话框中的备份信息
        const selectedBackup = backupsList.find(backup => backup.id === selectedBackupId);
        if (selectedBackup) {
            const backupInfo = `
                <p><strong>文件名:</strong> ${selectedBackup.filename}</p>
                <p><strong>创建时间:</strong> ${new Date(selectedBackup.created_at * 1000).toLocaleString()}</p>
                <p><strong>包含集合:</strong> ${selectedBackup.collections.join(', ')}</p>
                <p><strong>文件大小:</strong> ${formatFileSize(selectedBackup.size)}</p>
            `;
            $('#restoreBackupInfo').html(backupInfo);
        }
    });
}

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 页面加载完成后初始化
$(document).ready(function() {
    init();
}); 