/**
 * AI绘画平台 - 控制面板
 */

// 存储已加载的敏感词分类数据
let sensitiveCategories = [];

/**
 * 初始化页面
 */
function init() {
    // 检查管理员登录状态
    checkAdminLogin()
        .then(() => {
            console.log('管理员令牌有效');
            
            // 加载系统概况数据
            loadSystemStats();
            
            // 加载敏感词分类数据
            loadSensitiveCategories();
            
            // 绑定事件处理器
            bindEventHandlers();
        })
        .catch((error) => {
            console.error('管理员验证失败:', error);
            // 重定向到登录页面
            localStorage.setItem('adminRedirectTarget', 'admin_dashboard.html');
            window.location.href = 'admin_login.html';
        });
}

/**
 * 加载系统概况数据
 */
function loadSystemStats() {
    // 获取用户统计
    $.ajax({
        url: `${API_BASE_URL}/api/admin/user_stats`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success' && response.stats && response.stats.user_counts) {
                // 用户数据在stats.user_counts对象中
                const userCounts = response.stats.user_counts;
                $('#totalUsers').text(userCounts.total_users || 0);
                // 也可以添加其他用户相关统计
            } else {
                console.error('用户统计数据格式不符合预期:', response);
            }
        },
        error: function(xhr) {
            console.error('获取用户统计失败:', xhr.responseText);
        }
    });
    
    // 获取作品统计
    $.ajax({
        url: `${API_BASE_URL}/api/admin/artwork_stats`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success' && response.stats) {
                // 作品统计数据在stats对象中
                const artworkStats = response.stats;
                $('#totalArtworks').text(artworkStats.total || 0);
                
                // 设置待审核作品数
                const pendingCount = artworkStats.pending || 0;
                $('#pendingArtworks').text(pendingCount);
                
                // 设置今日生成数（需要计算）
                // 从daily_stats中获取今天的统计
                let todayGenerations = 0;
                if (response.daily_stats && response.daily_stats.length > 0) {
                    // 第一个元素是今天的数据
                    const today = response.daily_stats[0];
                    todayGenerations = today.total || 0;
                }
                $('#todayGenerations').text(todayGenerations);
            } else {
                console.error('作品统计数据格式不符合预期:', response);
            }
        },
        error: function(xhr) {
            console.error('获取作品统计失败:', xhr.responseText);
        }
    });
}

/**
 * 加载敏感词分类数据
 */
function loadSensitiveCategories() {
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words`,
        type: 'GET',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success') {
                sensitiveCategories = response.data || [];
                
                // 清空现有内容
                $('#sensitiveCategories').empty();
                
                if (sensitiveCategories.length === 0) {
                    $('#sensitiveCategories').html('<div class="alert alert-info">暂无敏感词分类，请点击"添加分类"按钮创建</div>');
                    return;
                }
                
                // 生成分类卡片
                sensitiveCategories.forEach(function(category) {
                    const categoryCard = createCategoryCard(category);
                    $('#sensitiveCategories').append(categoryCard);
                });
                
                // 为新添加的元素绑定事件
                bindCategoryEvents();
            } else {
                $('#sensitiveCategories').html(`<div class="alert alert-danger">加载失败: ${response.message || '未知错误'}</div>`);
            }
        },
        error: function(xhr) {
            console.error('获取敏感词分类失败:', xhr.responseText);
            $('#sensitiveCategories').html('<div class="alert alert-danger">加载敏感词分类失败，请检查网络连接</div>');
        }
    });
}

/**
 * 创建分类卡片HTML
 * @param {Object} category - 分类数据
 * @returns {string} - 卡片HTML
 */
function createCategoryCard(category) {
    const words = category.words || [];
    const isActive = category.is_active !== false; // 默认为true
    
    // 构建敏感词标签
    let wordsHtml = '';
    if (words.length > 0) {
        words.forEach(function(word) {
            wordsHtml += `
                <span class="sensitive-word-tag" data-word="${word}">
                    ${word}
                    <button type="button" class="close remove-word" aria-label="删除">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </span>
            `;
        });
    } else {
        wordsHtml = '<div class="text-muted">暂无敏感词，请在下方添加</div>';
    }
    
    // 创建卡片
    return `
        <div class="card category-card mb-4" data-id="${category._id}">
            <div class="card-header bg-light">
                <div>
                    <strong>${category.category}</strong>
                    <span class="badge ${isActive ? 'badge-success' : 'badge-secondary'} ml-2 active-status">
                        ${isActive ? '已启用' : '已禁用'}
                    </span>
                </div>
                <div>
                    <div class="custom-control custom-switch d-inline-block mr-2">
                        <input type="checkbox" class="custom-control-input toggle-active" 
                            id="active-${category._id}" ${isActive ? 'checked' : ''}>
                        <label class="custom-control-label" for="active-${category._id}">启用</label>
                    </div>
                    <button class="btn btn-sm btn-danger delete-category">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body">
                <h6>敏感词列表:</h6>
                <div class="sensitive-words-container mb-3">
                    ${wordsHtml}
                </div>
                <div class="form-group">
                    <textarea class="form-control new-word-input" rows="3" placeholder="输入敏感词，每行一个词或用逗号分隔"></textarea>
                    <small class="form-text text-muted mb-2">可一次添加多个敏感词</small>
                    <button class="btn btn-primary btn-block add-word-btn">添加敏感词</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 为分类卡片绑定事件
 */
function bindCategoryEvents() {
    // 切换分类激活状态
    $('.toggle-active').off('change').on('change', function() {
        const categoryId = $(this).closest('.category-card').data('id');
        const isActive = $(this).prop('checked');
        
        updateCategoryStatus(categoryId, isActive);
    });
    
    // 删除分类
    $('.delete-category').off('click').on('click', function() {
        const categoryCard = $(this).closest('.category-card');
        const categoryId = categoryCard.data('id');
        const categoryName = categoryCard.find('.card-header strong').text();
        
        if (confirm(`确定要删除分类 "${categoryName}" 吗？此操作不可恢复，所有相关敏感词将被一并删除。`)) {
            deleteCategory(categoryId, categoryCard);
        }
    });
    
    // 添加敏感词
    $('.add-word-btn').off('click').on('click', function() {
        const categoryCard = $(this).closest('.category-card');
        const categoryId = categoryCard.data('id');
        const inputField = categoryCard.find('.new-word-input');
        const wordText = inputField.val().trim();
        
        if (wordText) {
            addWordToCategory(categoryId, wordText, categoryCard);
        } else {
            alert('请输入敏感词');
        }
    });
    
    // 敏感词输入框按Ctrl+回车添加（考虑到是多行文本框）
    $('.new-word-input').off('keydown').on('keydown', function(e) {
        // Ctrl+Enter 触发添加
        if (e.ctrlKey && e.which === 13) {
            $(this).closest('.card-body').find('.add-word-btn').click();
        }
    });
    
    // 删除敏感词
    $('.remove-word').off('click').on('click', function() {
        const wordTag = $(this).closest('.sensitive-word-tag');
        const categoryCard = $(this).closest('.category-card');
        const categoryId = categoryCard.data('id');
        const word = wordTag.data('word');
        
        removeWordFromCategory(categoryId, word, wordTag);
    });
}

/**
 * 绑定全局事件处理器
 */
function bindEventHandlers() {
    // 添加分类按钮
    $('#addCategoryBtn').off('click').on('click', function() {
        $('#categoryName').val('');
        $('#categoryDesc').val('');
        $('#categoryActive').prop('checked', true);
        $('#addCategoryModal').modal('show');
    });
    
    // 保存分类按钮
    $('#saveCategoryBtn').off('click').on('click', function() {
        saveNewCategory();
    });
    
    // 批量导入表单提交
    $('#batchImportForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        batchImportWords();
    });
    
    // 批量导出表单提交
    $('#batchExportForm').off('submit').on('submit', function(e) {
        e.preventDefault();
        batchExportWords();
    });
}

/**
 * 更新分类激活状态
 * @param {string} categoryId - 分类ID
 * @param {boolean} isActive - 是否激活
 */
function updateCategoryStatus(categoryId, isActive) {
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words/${categoryId}`,
        type: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            is_active: isActive
        }),
        success: function(response) {
            if (response.status === 'success') {
                // 更新UI
                const categoryCard = $(`.category-card[data-id="${categoryId}"]`);
                const statusBadge = categoryCard.find('.active-status');
                
                statusBadge.removeClass('badge-success badge-secondary')
                    .addClass(isActive ? 'badge-success' : 'badge-secondary')
                    .text(isActive ? '已启用' : '已禁用');
                
                // 更新本地数据
                for (let i = 0; i < sensitiveCategories.length; i++) {
                    if (sensitiveCategories[i]._id === categoryId) {
                        sensitiveCategories[i].is_active = isActive;
                        break;
                    }
                }
            } else {
                alert(`更新失败: ${response.message || '未知错误'}`);
                // 回滚UI状态
                $(`.category-card[data-id="${categoryId}"] .toggle-active`).prop('checked', !isActive);
            }
        },
        error: function(xhr) {
            console.error('更新分类状态失败:', xhr.responseText);
            alert('更新分类状态失败，请检查网络连接');
            // 回滚UI状态
            $(`.category-card[data-id="${categoryId}"] .toggle-active`).prop('checked', !isActive);
        }
    });
}

/**
 * 删除分类
 * @param {string} categoryId - 分类ID
 * @param {jQuery} categoryCard - 分类卡片jQuery对象
 */
function deleteCategory(categoryId, categoryCard) {
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words/${categoryId}`,
        type: 'DELETE',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        success: function(response) {
            if (response.status === 'success') {
                // 从UI中移除
                categoryCard.fadeOut(300, function() {
                    $(this).remove();
                    
                    // 检查是否还有分类卡片
                    if ($('.category-card').length === 0) {
                        $('#sensitiveCategories').html('<div class="alert alert-info">暂无敏感词分类，请点击"添加分类"按钮创建</div>');
                    }
                });
                
                // 从本地数据中移除
                sensitiveCategories = sensitiveCategories.filter(c => c._id !== categoryId);
            } else {
                alert(`删除失败: ${response.message || '未知错误'}`);
            }
        },
        error: function(xhr) {
            console.error('删除分类失败:', xhr.responseText);
            alert('删除分类失败，请检查网络连接');
        }
    });
}

/**
 * 添加敏感词到分类
 * @param {string} categoryId - 分类ID
 * @param {string} wordText - 敏感词文本，可能包含多个敏感词
 * @param {jQuery} categoryCard - 分类卡片jQuery对象
 */
function addWordToCategory(categoryId, wordText, categoryCard) {
    // 查找当前分类
    const category = sensitiveCategories.find(c => c._id === categoryId);
    if (!category) {
        alert('分类不存在');
        return;
    }
    
    // 初始化words数组（如果不存在）
    if (!category.words) {
        category.words = [];
    }
    
    // 处理敏感词文本，支持批量添加
    let newWords = [];
    // 先按换行符分割
    const lines = wordText.split(/\n/);
    
    // 对每一行，再按逗号分割
    for (const line of lines) {
        if (line.trim()) {
            // 如果行包含逗号，按逗号分割
            if (line.includes(',')) {
                const commaWords = line.split(',').map(w => w.trim()).filter(w => w);
                newWords = newWords.concat(commaWords);
            } else {
                // 否则整行作为一个词
                newWords.push(line.trim());
            }
        }
    }
    
    if (newWords.length === 0) {
        alert('请输入有效的敏感词');
        return;
    }
    
    // 过滤掉已存在的敏感词
    const uniqueNewWords = newWords.filter(word => !category.words.includes(word));
    
    if (uniqueNewWords.length === 0) {
        alert('所有敏感词已存在于此分类中');
        return;
    }
    
    // 合并敏感词列表
    const updatedWords = [...category.words, ...uniqueNewWords];
    
    // 更新到服务器
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words/${categoryId}`,
        type: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            words: updatedWords
        }),
        success: function(response) {
            if (response.status === 'success') {
                // 更新UI
                const wordsContainer = categoryCard.find('.sensitive-words-container');
                
                // 如果是第一个词，清除占位文本
                if (wordsContainer.find('.text-muted').length > 0) {
                    wordsContainer.empty();
                }
                
                // 添加新的词标签
                uniqueNewWords.forEach(word => {
                    const wordTag = $(`
                        <span class="sensitive-word-tag" data-word="${word}">
                            ${word}
                            <button type="button" class="close remove-word" aria-label="删除">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </span>
                    `);
                    wordsContainer.append(wordTag);
                    
                    // 为新添加的标签绑定删除事件
                    wordTag.find('.remove-word').on('click', function() {
                        removeWordFromCategory(categoryId, word, wordTag);
                    });
                });
                
                // 清空输入框
                categoryCard.find('.new-word-input').val('');
                
                // 显示成功消息
                alert(`成功添加 ${uniqueNewWords.length} 个敏感词`);
                
                // 更新本地数据
                category.words = updatedWords;
            } else {
                alert(`添加失败: ${response.message || '未知错误'}`);
            }
        },
        error: function(xhr) {
            console.error('添加敏感词失败:', xhr.responseText);
            alert('添加敏感词失败，请检查网络连接');
        }
    });
}

/**
 * 从分类中移除敏感词
 * @param {string} categoryId - 分类ID
 * @param {string} word - 敏感词
 * @param {jQuery} wordTag - 敏感词标签jQuery对象
 */
function removeWordFromCategory(categoryId, word, wordTag) {
    // 查找当前分类
    const category = sensitiveCategories.find(c => c._id === categoryId);
    if (!category || !category.words) {
        alert('分类不存在或没有敏感词');
        return;
    }
    
    // 从本地数组中移除
    const newWords = category.words.filter(w => w !== word);
    
    // 更新到服务器
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words/${categoryId}`,
        type: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            words: newWords
        }),
        success: function(response) {
            if (response.status === 'success') {
                // 更新UI
                wordTag.fadeOut(200, function() {
                    $(this).remove();
                    
                    // 如果没有词了，显示占位文本
                    const wordsContainer = $(`.category-card[data-id="${categoryId}"] .sensitive-words-container`);
                    if (wordsContainer.children().length === 0) {
                        wordsContainer.html('<div class="text-muted">暂无敏感词，请在下方添加</div>');
                    }
                });
                
                // 更新本地数据
                category.words = newWords;
            } else {
                alert(`删除失败: ${response.message || '未知错误'}`);
                // 回滚本地数据
                category.words.push(word);
            }
        },
        error: function(xhr) {
            console.error('删除敏感词失败:', xhr.responseText);
            alert('删除敏感词失败，请检查网络连接');
            // 回滚本地数据
            category.words.push(word);
        }
    });
}

/**
 * 保存新分类
 */
function saveNewCategory() {
    const categoryName = $('#categoryName').val().trim();
    const categoryDesc = $('#categoryDesc').val().trim();
    const categoryWordsText = $('#categoryWords').val().trim();
    const isActive = $('#categoryActive').prop('checked');
    
    if (!categoryName) {
        alert('请输入分类名称');
        return;
    }
    
    // 名称格式验证 - 允许中文、字母、数字和下划线
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(categoryName)) {
        alert('分类名称只能包含中文、字母、数字和下划线');
        return;
    }
    
    // 检查是否重复
    if (sensitiveCategories.some(c => c.category.toLowerCase() === categoryName.toLowerCase())) {
        alert(`分类名称 "${categoryName}" 已存在，请使用其他名称`);
        return;
    }
    
    // 处理敏感词列表
    let words = [];
    if (categoryWordsText) {
        // 先按换行符分割
        const lines = categoryWordsText.split(/\n/);
        
        // 对每一行，再按逗号分割
        for (const line of lines) {
            if (line.trim()) {
                // 如果行包含逗号，按逗号分割
                if (line.includes(',')) {
                    const commaWords = line.split(',').map(w => w.trim()).filter(w => w);
                    words = words.concat(commaWords);
                } else {
                    // 否则整行作为一个词
                    words.push(line.trim());
                }
            }
        }
        
        // 去重
        words = [...new Set(words)];
    }
    
    // 提交到服务器
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words`,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            category: categoryName,
            description: categoryDesc,
            is_active: isActive,
            words: words
        }),
        success: function(response) {
            if (response.status === 'success') {
                // 如果有敏感词，显示成功消息
                if (words.length > 0) {
                    alert(`分类创建成功，已添加 ${words.length} 个敏感词`);
                }
                
                // 关闭模态框
                $('#addCategoryModal').modal('hide');
                
                // 清空表单
                $('#categoryName').val('');
                $('#categoryDesc').val('');
                $('#categoryWords').val('');
                $('#categoryActive').prop('checked', true);
                
                // 重新加载分类数据
                loadSensitiveCategories();
            } else {
                alert(`添加分类失败: ${response.message || '未知错误'}`);
            }
        },
        error: function(xhr) {
            console.error('添加分类失败:', xhr.responseText);
            alert('添加分类失败，请检查网络连接');
        }
    });
}

/**
 * 批量导入敏感词
 */
function batchImportWords() {
    const categoryId = $('#importCategory').val();
    const wordsText = $('#importWords').val().trim();
    
    if (!categoryId) {
        alert('请选择要导入的分类');
        return;
    }
    
    if (!wordsText) {
        alert('请输入敏感词');
        return;
    }
    
    // 分割文本为数组
    const wordsList = wordsText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (wordsList.length === 0) {
        alert('没有有效的敏感词');
        return;
    }
    
    // 查找当前分类
    const category = sensitiveCategories.find(c => c._id === categoryId);
    if (!category) {
        alert('分类不存在');
        return;
    }
    
    // 初始化words数组（如果不存在）
    if (!category.words) {
        category.words = [];
    }
    
    // 合并词汇并去重
    const allWords = [...new Set([...category.words, ...wordsList])];
    
    // 更新到服务器
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words/${categoryId}`,
        type: 'PUT',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken'),
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            words: allWords
        }),
        success: function(response) {
            if (response.status === 'success') {
                alert(`成功导入 ${allWords.length - category.words.length} 个新敏感词`);
                
                // 清空输入框
                $('#importWords').val('');
                
                // 重新加载分类数据
                loadSensitiveCategories();
            } else {
                alert(`导入失败: ${response.message || '未知错误'}`);
            }
        },
        error: function(xhr) {
            console.error('批量导入敏感词失败:', xhr.responseText);
            alert('批量导入敏感词失败，请检查网络连接');
        }
    });
}

/**
 * 批量导出敏感词
 */
function batchExportWords() {
    const categoryId = $('#exportCategory').val();
    const format = $('#exportFormat').val();
    
    // 准备导出数据
    let exportData;
    let fileName;
    
    if (categoryId === 'all') {
        // 导出所有分类
        if (format === 'json') {
            // JSON格式
            exportData = JSON.stringify(sensitiveCategories, null, 2);
            fileName = 'all_sensitive_words.json';
        } else {
            // 纯文本格式
            const allWords = [];
            sensitiveCategories.forEach(category => {
                if (category.words && category.words.length > 0) {
                    allWords.push(`=== ${category.category} ===`);
                    allWords.push(...category.words);
                    allWords.push(''); // 空行分隔
                }
            });
            exportData = allWords.join('\n');
            fileName = 'all_sensitive_words.txt';
        }
    } else {
        // 导出指定分类
        const category = sensitiveCategories.find(c => c._id === categoryId);
        if (!category) {
            alert('分类不存在');
            return;
        }
        
        if (format === 'json') {
            // JSON格式
            exportData = JSON.stringify(category, null, 2);
            fileName = `${category.category}_sensitive_words.json`;
        } else {
            // 纯文本格式
            exportData = (category.words || []).join('\n');
            fileName = `${category.category}_sensitive_words.txt`;
        }
    }
    
    // 创建下载链接
    const blob = new Blob([exportData], {type: format === 'json' ? 'application/json' : 'text/plain'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    // 清理
    URL.revokeObjectURL(url);
}

/**
 * 添加敏感词分类
 */
function addSensitiveCategory(category, words = []) {
    $.ajax({
        url: `${API_BASE_URL}/api/admin/sensitive_words`,
        type: 'POST',
        headers: {
            'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
        },
        contentType: 'application/json',
        data: JSON.stringify({
            category: category,
            words: words,
            is_active: true
        }),
        success: function(response) {
            if (response.status === 'success') {
                toastr.success('添加分类成功');
                $('#addCategoryModal').modal('hide');
                $('#categoryName').val('');
                $('#categoryWords').val('');
                
                // 重新加载敏感词分类
                loadSensitiveCategories();
            } else {
                toastr.error(response.message || '添加分类失败');
            }
        },
        error: function(xhr) {
            toastr.error('请求失败: ' + xhr.responseText);
        }
    });
}

/**
 * 测试自定义敏感词API
 */
function testCustomSensitiveWords() {
    console.log('正在测试自定义敏感词API...');
    $.ajax({
        url: `${API_BASE_URL}/api/custom_sensitive_words`,
        type: 'GET',
        success: function(response) {
            console.log('自定义敏感词API响应:', response);
            if (response.status === 'success') {
                toastr.success('自定义敏感词API测试成功');
                console.table(response.data);
            } else {
                toastr.error(response.message || '自定义敏感词API测试失败');
            }
        },
        error: function(xhr) {
            console.error('自定义敏感词API请求失败:', xhr.responseText);
            toastr.error('自定义敏感词API请求失败: ' + xhr.statusText);
        }
    });
}

// 页面加载完成后初始化
$(document).ready(function() {
    init();
}); 