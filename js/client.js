/**
 * Client API for communicating with the AI Art server
 */

class ArtServerClient {
    constructor(serverUrl = null) {
        // 动态确定服务器URL
        if (!serverUrl) {
            const host = window.location.hostname;
            const port = '8080'; // API服务器端口
            serverUrl = `http://${host}:${port}`;
        }
        this.serverUrl = serverUrl;
        this.requestId = null;
        this.statusCheckInterval = null;
        console.log('ArtServerClient initialized with server URL:', this.serverUrl);
    }

    /**
     * Send an image generation request to the server
     * @param {Object} requestData - The request data
     * @returns {Promise<Object>} - Promise resolving to the request status
     */
    async generateImage(requestData) {
        try {
            // 从localStorage获取学生信息
            const username = localStorage.getItem('username');
            const studentId = localStorage.getItem('studentId');
            
            const data = {
                prompt: requestData.prompt,
                width: requestData.width || 1440,
                height: requestData.height || 1440,
                seed: requestData.seed || Math.floor(Math.random() * 9999) + 1,
                style: requestData.style || 'ghibli',
                chinese_prompt: requestData.chinese_prompt || requestData.prompt,
                username: username,
                student_id: studentId
            };
            
            console.log('Sending generation request to:', this.serverUrl);
            if (username && studentId) {
                console.log(`使用学生信息: ${username} (${studentId})`);
            } else {
                console.log('未找到学生信息，请求将使用服务器自动识别');
            }
            
            // 使用XMLHttpRequest代替fetch
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${this.serverUrl}/api/generate`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const responseData = JSON.parse(xhr.responseText);
                            // 设置请求ID
                            this.requestId = responseData.request_id;
                            resolve(responseData);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                }.bind(this);
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send(JSON.stringify(data));
            });
        } catch (error) {
            console.error('Error sending generation request:', error);
            throw error;
        }
    }

    /**
     * Check the status of a pending request
     * @param {string} requestId - The request ID to check
     * @returns {Promise<Object>} - Promise resolving to the request status
     */
    async checkStatus(requestId = null) {
        const id = requestId || this.requestId;
        if (!id) {
            throw new Error('No request ID provided');
        }

        try {
            // 使用XMLHttpRequest代替fetch
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `${this.serverUrl}/api/status/${id}`, true);
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                };
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send();
            });
        } catch (error) {
            console.error('Error checking request status:', error);
            throw error;
        }
    }

    /**
     * Get the current queue status
     * @returns {Promise<Object>} - Promise resolving to the queue status
     */
    async getQueueStatus() {
        try {
            // 使用XMLHttpRequest代替fetch
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', `${this.serverUrl}/api/queue_status`, true);
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                };
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send();
            });
        } catch (error) {
            console.error('Error getting queue status:', error);
            throw error;
        }
    }

    /**
     * Cancel a pending request
     * @param {string} requestId - The request ID to cancel
     * @returns {Promise<Object>} - Promise resolving to the cancellation status
     */
    async cancelRequest(requestId = null) {
        const id = requestId || this.requestId;
        if (!id) {
            throw new Error('No request ID provided');
        }

        try {
            console.log(`Cancelling request: ${id}`);
            // 使用XMLHttpRequest代替fetch
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${this.serverUrl}/api/cancel/${id}`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            this.stopStatusPolling();
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                }.bind(this);
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send();
            });
        } catch (error) {
            console.error('Error cancelling request:', error);
            throw error;
        }
    }

    /**
     * Get gallery items from the server
     * @param {number} page - Page number
     * @param {number} perPage - Number of items per page
     * @param {string|Object} searchParamsOrStudentId - Search parameters or studentId
     * @returns {Promise<Object>} - Promise resolving to the gallery items
     */
    async getGalleryItems(page = 1, perPage = 12, searchParamsOrStudentId = null) {
        try {
            let url = `${this.serverUrl}/api/gallery?page=${page}&per_page=${perPage}`;
            
            // 处理参数，支持直接传入学号或搜索参数对象
            if (searchParamsOrStudentId) {
                if (typeof searchParamsOrStudentId === 'string') {
                    // 如果是字符串，当作学号处理
                    url += `&student_id=${encodeURIComponent(searchParamsOrStudentId)}`;
                    console.log(`按学号筛选: ${searchParamsOrStudentId}`);
                } else {
                    // 处理完整的搜索参数对象
                    const searchParams = searchParamsOrStudentId;
            if (searchParams.query) {
                url += `&query=${encodeURIComponent(searchParams.query)}`;
            }
            if (searchParams.type && searchParams.type !== 'all') {
                url += `&search_type=${encodeURIComponent(searchParams.type)}`;
                    }
                    if (searchParams.student_id) {
                        url += `&student_id=${encodeURIComponent(searchParams.student_id)}`;
                    }
                }
            }
            
            console.log('正在请求画廊数据，URL:', url);
            
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('画廊API返回数据:', data);
            
            // 检查返回的数据中是否包含作者和IP信息
            if (data && data.items && data.items.length > 0) {
                const firstItem = data.items[0];
                console.log('检查画廊API返回的第一个作品数据:',
                    '作者:', firstItem.student_name || '无',
                    '学号:', firstItem.student_id || '无',
                    'IP:', firstItem.ip_address || '无'
                );
            }
            
            return data;
        } catch (error) {
            console.error('获取画廊作品失败:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * Toggle like status for an artwork
     * @param {string} artworkId - The artwork ID to like/unlike
     * @param {boolean} isLiked - Whether the artwork is currently liked
     * @returns {Promise<Object>} - Promise resolving to the like status
     */
    async toggleLike(artworkId, isLiked) {
        try {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                // 根据当前状态选择添加还是删除点赞
                const action = isLiked ? 'unlike' : 'like';
                xhr.open('POST', `${this.serverUrl}/api/gallery/${artworkId}/${action}`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                };
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send();
            });
        } catch (error) {
            console.error('Error toggling like status:', error);
            throw error;
        }
    }

    /**
     * Start polling for status updates
     * @param {string} requestId - The request ID to poll for
     * @param {Function} onStatusUpdate - Callback for status updates
     * @param {Function} onComplete - Callback for when the request is complete
     * @param {Function} onError - Callback for errors
     * @param {number} interval - Polling interval in milliseconds
     */
    startStatusPolling(requestId, onStatusUpdate, onComplete, onError, interval = 2000) {
        // 清除之前的轮询
        this.stopStatusPolling();

        console.log(`Starting status polling for request: ${requestId}`);
        this.statusCheckInterval = setInterval(async () => {
            try {
                const status = await this.checkStatus(requestId);
                
                console.log('Status check result:', status);
                
                if (status.status === 'completed') {
                    console.log('Request completed:', status);
                    clearInterval(this.statusCheckInterval);
                    this.statusCheckInterval = null;
                    onComplete(status.result);
                } else if (status.status === 'queued') {
                    // 详细记录队列状态
                    console.log('Request queued:', status);
                    console.log(`队列位置: ${status.queue_position || '未知'}, 总队列: ${status.total_queue || '未知'}`);
                    
                    // 确保队列更新数据有效，防止显示排队人数为1的问题
                    if (status.queue_position !== undefined && status.total_queue !== undefined) {
                        // 这里传递完整的状态对象到回调函数
                        onStatusUpdate({
                            queue_position: status.queue_position,
                            total_queue: status.total_queue,
                            estimated_time: status.estimated_time || 0
                        });
                    } else {
                        console.warn('服务器返回的队列信息不完整:', status);
                        // 如果服务器未返回队列信息，尝试获取最新的队列状态
                        try {
                            const queueStatus = await this.getQueueStatus();
                            if (queueStatus && queueStatus.status === 'success') {
                                console.log('获取到最新队列状态:', queueStatus);
                                onStatusUpdate({
                                    queue_position: queueStatus.position || 1,
                                    total_queue: queueStatus.total || 1,
                                    estimated_time: queueStatus.estimated_time || 0
                                });
                            }
                        } catch (err) {
                            console.error('获取队列状态失败:', err);
                        }
                    }
                } else if (status.status === 'error') {
                    console.error('Request error:', status);
                    clearInterval(this.statusCheckInterval);
                    this.statusCheckInterval = null;
                    onError(status);
                } else if (status.status === 'cancelled') {
                    console.log('Request cancelled:', status);
                    clearInterval(this.statusCheckInterval);
                    this.statusCheckInterval = null;
                    onError(new Error('Request was cancelled'));
                }
            } catch (error) {
                console.error('Error polling status:', error);
                onError(error);
            }
        }, interval);
    }

    /**
     * Stop polling for status updates
     */
    stopStatusPolling() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
            console.log('Status polling stopped');
        }
    }

    /**
     * Check the user's sensitive word quota
     * @param {string} studentId - The student ID to check
     * @returns {Promise<Object>} - Promise resolving to the quota status
     */
    async checkSensitiveQuota(studentId) {
        try {
            if (!studentId) {
                throw new Error('No student ID provided');
            }

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${this.serverUrl}/api/check_sensitive_quota`, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                
                xhr.onload = function() {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    } else {
                        reject(new Error(`Server responded with status: ${xhr.status}, message: ${xhr.responseText}`));
                    }
                };
                
                xhr.onerror = function() {
                    reject(new Error('Network error occurred'));
                };
                
                xhr.send(JSON.stringify({ student_id: studentId }));
            });
        } catch (error) {
            console.error('Error checking sensitive word quota:', error);
            throw error;
        }
    }
} 