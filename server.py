"""
AI绘画服务器 - 队列版
支持并发请求管理，每5秒处理一个请求
"""
import os
import time
import uuid
import threading
import queue
import json
import requests
import random
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from pymongo import MongoClient
import hashlib
import jwt
from datetime import datetime, timedelta
from bson.objectid import ObjectId
from bson import json_util

def check_and_fix_database(db_client, gallery_collection):
    """检查并修复数据库结构"""
    try:
        db = db_client['ai_art_gallery']
        
        # 初始化用户集合
        if 'users' not in db.list_collection_names():
            users = db.create_collection('users')
            # 创建索引
            users.create_index('student_id', unique=True)
            print("用户集合创建成功")
        else:
            users = db['users']
            # 确保索引存在
            users.create_index('student_id', unique=True)
            print("用户集合已存在")
            
            # 更新现有用户文档，添加新字段
            users.update_many(
                {'temp_sensitive_count': {'$exists': False}},
                {'$set': {'temp_sensitive_count': 0}}
            )
            users.update_many(
                {'is_suspended': {'$exists': False}},
                {'$set': {'is_suspended': False}}
            )
            users.update_many(
                {'suspend_date': {'$exists': False}},
                {'$set': {'suspend_date': None}}
            )
            users.update_many(
                {'sensitive_word_count': {'$exists': False}},
                {'$set': {'sensitive_word_count': 0}}
            )
            users.update_many(
                {'likes_count': {'$exists': False}},
                {'$set': {'likes_count': 0}}
            )
            users.update_many(
                {'status': {'$exists': False}},
                {'$set': {'status': 'active'}}
            )
        
        # 检查是否有记录缺少in_school_gallery字段
        missing_field_count = gallery_collection.count_documents({"in_school_gallery": {"$exists": False}})
        
        if missing_field_count > 0:
            print(f"发现 {missing_field_count} 条记录缺少in_school_gallery字段，开始修复...")
            
            # 更新所有缺失字段的记录，设置为0（默认不显示）
            result = gallery_collection.update_many(
                {'in_school_gallery': {'$exists': False}},
                {'$set': {'in_school_gallery': 0}}
            )
            print(f"已修复 {result.modified_count} 条记录")
        else:
            print("数据库记录完好，所有记录都有in_school_gallery字段")
        
        # 打印统计信息
        total_count = gallery_collection.count_documents({})
        display_count = gallery_collection.count_documents({'in_school_gallery': 1})
        hidden_count = gallery_collection.count_documents({'in_school_gallery': 0})
        
        print(f"数据库统计: 总记录数 {total_count}, 显示在画廊中 {display_count}, 不显示在画廊中 {hidden_count}")
        
    except Exception as e:
        print(f"检查和修复数据库时出错: {e}")

def handle_preflight_request():
    """
    处理CORS预检请求
    """
    response = jsonify({'status': 'success'})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Max-Age', '3600')
    # 显式设置成功状态码
    return response, 200

app = Flask(__name__)
# 更详细地配置CORS，确保OPTIONS请求正确处理
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True, allow_headers=["Content-Type", "Authorization"], 
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])  # 允许跨域请求

# 添加全局的OPTIONS请求处理
@app.route('/<path:path>', methods=['OPTIONS'])
def global_options_handler(path):
    return handle_preflight_request()

# 添加根路径的OPTIONS请求处理
@app.route('/', methods=['OPTIONS'])
def root_options_handler():
    return handle_preflight_request()

# MongoDB连接设置
try:
    # 使用环境变量或默认值配置MongoDB连接
    mongo_host = os.environ.get('MONGO_HOST', 'localhost')
    mongo_port = os.environ.get('MONGO_PORT', '27017')
    mongo_uri = os.environ.get('MONGO_URI', f'mongodb://{mongo_host}:{mongo_port}/')
    
    # 添加连接参数以提高容错性
    mongo_client = MongoClient(
        mongo_uri,
        serverSelectionTimeoutMS=5000,  # 服务器选择超时
        connectTimeoutMS=5000,          # 连接超时
        socketTimeoutMS=10000,          # 套接字超时
        maxPoolSize=50,                 # 连接池大小
        retryWrites=True                # 重试写入
    )
    
    # 测试连接
    mongo_client.admin.command('ping')
    
    db = mongo_client['ai_art_gallery']
    school_gallery = db['school_gallery']
    users = db['users']  # 新增用户集合
    sensitive_word_logs = db['sensitive_word_logs']  # 新增敏感词记录集合
    custom_sensitive_words = db['custom_sensitive_words']  # 新增自定义敏感词集合
    print(f"MongoDB连接成功 ({mongo_uri})")
    
    # 启动时检查并修复数据库
    check_and_fix_database(mongo_client, school_gallery)
    
    # 检查并创建管理员用户
    admin_exists = users.find_one({"role": "admin"})
    if not admin_exists:
        admin_user = {
            "student_id": "admin",
            "username": "系统管理员",
            "password": "admin123",  # 实际应用中应该使用加密密码
            "role": "admin",
            "status": "active",
            "created_at": time.time(),
            "last_login": time.time(),
            "sensitive_word_count": 0
        }
        users.insert_one(admin_user)
        print("创建管理员用户成功")
    else:
        print("管理员用户已存在")
except Exception as e:
    print(f"MongoDB连接失败: {e}")
    mongo_client = None
    db = None
    school_gallery = None
    users = None
    sensitive_word_logs = None
    custom_sensitive_words = None

# 请求队列和锁
request_queue = queue.Queue()
queue_lock = threading.Lock()
pending_requests = {}  # 存储待处理请求的状态 {request_id: {status, result, ...}}

# 队列状态和统计信息
queue_stats = {
    'total_processed': 0,
    'total_errors': 0,
    'processing_time': 0,
}

# Pollinations API地址
POLLINATIONS_API = "https://image.pollinations.ai/prompt/"

# JWT密钥
JWT_SECRET = os.environ.get("JWT_SECRET", "ai_drawing_gallery_secret_key")  # 使用环境变量或默认值

# 生成JWT令牌
def generate_admin_token(admin_id):
    """生成管理员JWT令牌"""
    expiration = datetime.utcnow() + timedelta(hours=24)
    payload = {
        "admin_id": admin_id,
        "exp": expiration
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token

# 验证JWT令牌
def verify_admin_token(token=None):
    """验证管理员JWT令牌"""
    # 如果未传入token，从请求头获取
    if token is None:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return False
        
        token = auth_header.split(' ')[1]
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        # 验证通过，返回True
        return True
    except jwt.ExpiredSignatureError:
        # 令牌已过期
        return False
    except jwt.InvalidTokenError:
        # 无效令牌
        return False

# 验证学生身份
def verify_student(student_id):
    """验证学生身份"""
    if not mongo_client or not users:
        return {"status": "error", "message": "数据库未连接"}
    
    # 查询学生是否在数据库中
    user = users.find_one({"student_id": student_id})
    
    if user:
        # 检查是否被封禁
        if user["status"] == "banned":
            return {
                "status": "error",
                "message": f"账户已被禁用。原因: {user.get('ban_reason', '未知原因')}"
            }
        
        # 更新最后登录时间
        users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login": time.time()}}
        )
        return {"status": "success", "user": user}
    else:
        # 学生不在系统中，拒绝访问
        return {
            "status": "error",
            "message": "学号未在系统中注册，无法使用绘画功能"
        }

def check_sensitive_words(text, provided_words=None, provided_categories=None):
    """
    检查文本中是否包含敏感词
    
    Args:
        text (str): 要检查的文本
        provided_words (list, optional): 前端提供的敏感词列表
        provided_categories (list, optional): 前端提供的敏感词类别
    
    Returns:
        dict: 包含检查结果的字典，格式为：
            {
                "safe": bool,      # 是否安全（没有敏感词）
                "words": list,     # 找到的敏感词列表
                "categories": list # 敏感词所属类别
            }
    """
    try:
        if not text:
            return {
                "safe": True,
                "words": [],
                "categories": []
            }
        
        # 如果前端已提供敏感词检测结果，直接使用
        if provided_words is not None:
            # 使用前端提供的敏感词和类别
            return {
                "safe": len(provided_words) == 0,
                "words": provided_words,
                "categories": provided_categories or []
            }
            
        # 获取数据库中的自定义敏感词
        custom_words = {}
        if mongo_client and custom_sensitive_words:
            # 查询激活的自定义敏感词
            cursor = custom_sensitive_words.find({"is_active": True})
            for doc in cursor:
                category = doc.get("category")
                words = doc.get("words", [])
                if category and words:
                    custom_words[category] = words
        
        # 备用的简化敏感词检测逻辑（只在前端未提供结果时使用）
        if not custom_words:
            sensitive_words = [
                "色情", "黄色", "暴力", "血腥", "毒品", "赌博", "政治",
                "辱骂", "脏话", "反动", "战争", "恐怖", "血液", "死亡",
                "porn", "sex", "violence", "blood", "drug", "gambling",
                "fuck", "shit", "damn", "hell", "死", "杀", "打死", "枪"
            ]
        else:
            # 使用自定义敏感词
            sensitive_words = []
            for words_list in custom_words.values():
                sensitive_words.extend(words_list)
        
        # 存储找到的敏感词
        found_words = []
        # 敏感词类别（简化版）
        categories = []
        
        # 转换为小写进行检查
        text_lower = text.lower()
        
        # 检查每个敏感词
        for word in sensitive_words:
            if word.lower() in text_lower:
                found_words.append(word)
                
                # 确定类别
                if custom_words:
                    # 确定敏感词属于哪个类别
                    for category, words in custom_words.items():
                        if word in words and category not in categories:
                            categories.append(category)
                else:
                    # 简单分类：中文或英文
                    category = "chinese" if any('\u4e00' <= c <= '\u9fff' for c in word) else "english"
                    if category not in categories:
                        categories.append(category)
        
        return {
            "safe": len(found_words) == 0,
            "words": found_words,
            "categories": categories
        }
    except Exception as e:
        print(f"敏感词检查出错: {e}")
        # 出错时返回安全结果，避免阻止正常请求
        return {
            "safe": True,
            "words": [],
            "categories": [],
            "error": str(e)
        }

def check_and_log_sensitive_words(prompt, student_id, provided_words=None, provided_categories=None):
    """
    检查文本中是否包含敏感词，并记录到数据库
    如果触发敏感词，会增加用户的temp_sensitive_count和sensitive_word_count计数
    当temp_sensitive_count>=5时，设置is_suspended=true
    当sensitive_word_count>=30时，设置status=inactive
    
    Args:
        prompt (str): 要检查的文本
        student_id (str): 学生ID
        provided_words (list, optional): 前端提供的敏感词列表
        provided_categories (list, optional): 前端提供的敏感词类别
    """
    try:
        if not student_id:
            return {
                "status": "error",
                "message": "未提供学生ID"
            }

        # 使用check_sensitive_words函数检查敏感词，包括前端提供的敏感词
        result = check_sensitive_words(prompt, provided_words, provided_categories)
        
        # 如果没有敏感词，直接返回安全
        if result["safe"]:
            return {
                "status": "safe",
                "message": "文本安全，无敏感词"
            }
            
        # 检查MongoDB连接
        if mongo_client is None or users is None:
            print("MongoDB未连接，无法记录敏感词使用")
            return {
                "status": "warning", 
                "message": "检测到敏感词，但无法记录到数据库",
                "words": result["words"],
                "categories": result.get("categories", [])
            }
        
        print(f"用户 {student_id} 触发敏感词: {result['words']}")
        
        # 查询用户记录
        user = users.find_one({"student_id": student_id})
        
        # 如果用户不存在，创建新用户记录
        if not user:
            print(f"用户 {student_id} 不存在，创建新用户记录")
            user = {
                "student_id": student_id,
                "username": "",
                "sensitive_word_count": 0,
                "temp_sensitive_count": 0,
                "status": "active",
                "is_suspended": False,
                "created_at": time.time(),
                "last_login": time.time()
            }
            users.insert_one(user)
        
        # 记录敏感词使用日志
        sensitive_log = {
            "student_id": student_id,
            "words": result["words"],
            "categories": result.get("categories", []),
            "prompt": prompt,
            "timestamp": time.time()
        }
        
        # 如果敏感词日志集合存在，则添加记录
        if 'sensitive_word_logs' in mongo_client['ai_art_gallery'].list_collection_names():
            mongo_client['ai_art_gallery']['sensitive_word_logs'].insert_one(sensitive_log)
        
        # 更新用户的敏感词计数
        current_temp_count = user.get("temp_sensitive_count", 0) + 1
        current_total_count = user.get("sensitive_word_count", 0) + 1
        
        # 确定用户状态更新
        update_data = {
            "temp_sensitive_count": current_temp_count,
            "sensitive_word_count": current_total_count,
            "last_sensitive_word_time": time.time()
        }
        
        suspension_message = ""
        
        # 当temp_sensitive_count>=5时，设置is_suspended=true
        if current_temp_count >= 5 and not user.get("is_suspended", False):
            update_data["is_suspended"] = True
            update_data["suspension_time"] = time.time()  # 记录暂停时间
            suspension_message = "触发临时敏感词次数达到5次，账户已被暂停24小时"
            print(f"用户 {student_id} 临时敏感词次数达到 {current_temp_count}，设置暂停状态")
        
        # 当sensitive_word_count>=30时，设置status=inactive
        if current_total_count >= 30 and user.get("status", "active") == "active":
            update_data["status"] = "inactive"
            update_data["inactive_reason"] = "敏感词使用次数达到30次，账户已被停用"
            update_data["inactive_time"] = time.time()  # 记录停用时间
            suspension_message = "敏感词使用总次数达到30次，账户已被永久停用"
            print(f"用户 {student_id} 敏感词总次数达到 {current_total_count}，设置非活跃状态")
        
        # 更新用户记录
        users.update_one(
            {"student_id": student_id},
            {"$set": update_data}
        )
        
        # 返回警告结果
        warning_result = {
            "status": "warning",
            "message": f"检测到敏感词，已记录 (临时计数: {current_temp_count}/5, 总计数: {current_total_count}/30)",
            "words": result["words"],
            "categories": result.get("categories", []),
            "temp_count": current_temp_count,
            "total_count": current_total_count
        }
        
        # 如果有暂停消息，添加到结果中
        if suspension_message:
            warning_result["suspension_message"] = suspension_message
        
        return warning_result
        
    except Exception as e:
        print(f"检查敏感词时出错: {e}")
        return {
            "status": "error",
            "message": f"检查敏感词时出错: {str(e)}"
        }

def process_queue():
    """
    处理队列中的请求，每5秒处理一个
    """
    print("队列处理线程已启动")
    
    while True:
        try:
            # 尝试从队列获取一个请求
            if not request_queue.empty():
                with queue_lock:
                    request_id = request_queue.get()
                    request_data = pending_requests[request_id]
                    request_data['status'] = 'processing'
                
                print(f"正在处理请求 {request_id}, 队列中还有 {request_queue.qsize()} 个请求")
                
                # 处理请求
                try:
                    start_time = time.time()
                    result = generate_image(request_data['prompt'], request_data.get('width', 1024), 
                                           request_data.get('height', 1024), request_data.get('style', ''))
                    processing_time = time.time() - start_time
                    
                    # 请求成功，更新请求状态
                    with queue_lock:
                        pending_requests[request_id]['status'] = 'completed'
                        pending_requests[request_id]['result'] = result
                        pending_requests[request_id]['processing_time'] = processing_time
                        queue_stats['total_processed'] += 1
                        queue_stats['processing_time'] += processing_time
                    
                    # 移除将作品保存到MongoDB部分
                    # 不再自动保存到数据库，只在学生提交到学校画廊时才保存
                    print(f"请求 {request_id} 处理完成（仅本地保存，未存入数据库）")
                    
                except Exception as e:
                    # 请求失败，更新请求状态
                    with queue_lock:
                        pending_requests[request_id]['status'] = 'error'
                        pending_requests[request_id]['error'] = str(e)
                        queue_stats['total_errors'] += 1
                    
                    print(f"处理请求 {request_id} 时出错: {e}")
            
            # 不管队列是否为空，都等待5秒再继续处理
            time.sleep(5)
            
        except Exception as e:
            print(f"队列处理线程出错: {e}")
            time.sleep(5)

def generate_image(prompt, width=1024, height=1024, style=""):
    """
    生成图像
    """
    try:
        # 更清晰地在提示词中加入风格描述
        if style:
            # 针对不同风格增强提示词
            style_prompts = {
                "photorealistic": "photorealistic, highly detailed photograph, sharp focus, 4k, ",
                "hyperrealistic": "hyperrealistic, extremely detailed, ultra-sharp, 8k resolution, ",
                "portrait": "realistic portrait photography, professional lighting, detailed facial features, ",
                "macro": "macro photography, extreme close-up, shallow depth of field, fine details, high resolution, natural lighting, ",
                "ghibli": "Studio Ghibli style, Miyazaki inspired, fantasy, detailed, soft lighting, ",
                "oil": "oil painting, textured brushstrokes, canvas texture, rich colors, artistic, ",
                "watercolor": "watercolor painting, flowing colors, wet on wet, soft edges, artistic, ",
                "ink": "traditional Chinese ink painting, brush and ink, minimal, elegant, ",
                "anime": "anime style, vibrant colors, clean lines, Japanese animation, ",
                "cartoon": "cartoon style, flat colors, simple shapes, clean outlines, ",
                "pixel": "pixel art, 8-bit style, retro game aesthetics, blocky, "
            }
            
            # 获取增强的风格提示词，或使用原始风格
            enhanced_style = style_prompts.get(style, f"{style}, ")
            full_prompt = f"{enhanced_style}{prompt}"
        else:
            full_prompt = prompt
        
        print(f"最终提示词: {full_prompt}")
        
        # 对提示词进行URL编码
        encoded_prompt = requests.utils.quote(full_prompt)
        
        # 生成随机种子 (1-99999)
        random_seed = random.randint(1, 99999)
        print(f"生成的随机种子: {random_seed}")
        
        # 构建请求URL，包含随机种子
        image_url = f"{POLLINATIONS_API}{encoded_prompt}?width={width}&height={height}&seed={random_seed}&nologo=true&safe=true"
        
        return {
            'image_url': image_url,
            'prompt': prompt,
            'full_prompt': full_prompt,
            'width': width,
            'height': height,
            'seed': random_seed  # 返回结果中包含种子值
        }
    except Exception as e:
        print(f"生成图像时出错: {e}")
        raise e

@app.route('/api/generate', methods=['POST'])
def api_generate():
    """处理图片生成请求"""
    try:
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "无效的请求数据"}), 400
        
        prompt = data.get('prompt', '')
        chinese_prompt = data.get('chinese_prompt', '')  # 获取原始中文提示词
        width = int(data.get('width', 1024))
        height = int(data.get('height', 1024))
        seed = data.get('seed', None)
        style = data.get('style', '')
        # 获取前端提供的敏感词信息
        sensitive_words = data.get('sensitive_words', [])
        sensitive_categories = data.get('sensitive_categories', [])
        
        # 获取用户信息
        student_id = None
        username = None
        try:
            # 从请求数据中获取学生ID
            student_id = data.get('student_id')
            # 从请求数据中获取用户名
            username = data.get('username')
            
            # 如果请求数据中没有，尝试从请求中获取
            if not student_id or not username:
                student_info = get_student_info_from_request()
                if student_info and 'student_id' in student_info:
                    student_id = student_info['student_id']
                    
                    # 如果还是没有用户名，尝试从localStorage中读取
                    if not username:
                        username = request.cookies.get('username')
            
            # 如果仍然没有用户名但有学生ID，从数据库查询
            if student_id and not username and users is not None:
                user = users.find_one({"student_id": student_id})
                if user:
                    username = user.get("username", "")
            
            print(f"获取到用户信息：学号={student_id}, 用户名={username}")
        except Exception as e:
            print(f"获取学生信息失败: {str(e)}")
            return jsonify({"status": "error", "message": "获取用户信息失败"}), 401
        
        if not student_id:
            return jsonify({"status": "error", "message": "未提供学号"}), 401
        
        # 获取IP地址
        ip_address = request.remote_addr
        print(f"请求IP地址: {ip_address}")
        
        # 检查用户状态
        if users is not None:
            user = users.find_one({"student_id": student_id})
            if user:
                # 如果用户被暂停或状态为inactive，则不允许提交
                if user.get("is_suspended", False) or user.get("status") == "inactive":
                    reason = "账户已被暂停使用" if user.get("is_suspended", False) else "账户处于非活跃状态"
                    return jsonify({
                        "status": "error", 
                        "message": f"您暂时无法使用此功能。原因: {reason}"
                    }), 403
        
        # 检查敏感词 - 这里必须记录敏感词使用，所以不设置skip_logging参数
        check_result = check_and_log_sensitive_words(chinese_prompt or prompt, student_id, sensitive_words, sensitive_categories)
        
        # 检查敏感词结果
        if check_result.get("status") == "error" or check_result.get("status") == "warning":
            message = check_result.get("suspension_message", check_result.get("message", "检测到敏感词，请修改后再试"))
            return jsonify({
                "status": "error", 
                "message": message,
                "words": check_result.get("words", []),
                "temp_count": check_result.get("temp_count", 0),
                "total_count": check_result.get("total_count", 0),
                "should_block": True
            }), 403
        
        # 如果敏感词检测没有出现问题，继续生成
        # 生成请求ID
        request_id = str(uuid.uuid4())
        
        # 创建生成任务
        task = {
            'request_id': request_id,
            'prompt': prompt,
            'chinese_prompt': chinese_prompt,
            'width': width,
            'height': height,
            'seed': seed,
            'style': style,
            'student_id': student_id,
            'student_name': username,  # 添加用户名
            'ip_address': ip_address,  # 添加IP地址
            'status': 'queued',  # 初始状态为queued
            'created_at': time.time()
        }
        
        # 将任务信息保存到pending_requests字典
        with queue_lock:
            pending_requests[request_id] = task
            # 将请求ID添加到队列
            request_queue.put(request_id)
        
        # 返回请求ID
        return jsonify({
            "status": "success",
            "request_id": request_id,
            "message": "图片生成请求已加入队列"
        })
        
    except Exception as e:
        print(f"处理生成请求时出错: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"处理请求时出错: {str(e)}"
        }), 500

@app.route('/api/status/<request_id>', methods=['GET'])
def api_status(request_id):
    """
    API端点：检查请求状态
    """
    try:
        # 查找请求
        with queue_lock:
            if request_id not in pending_requests:
                return jsonify({'status': 'error', 'message': '请求不存在'}), 404
            
            request_data = pending_requests[request_id].copy()
            
            # 计算当前队列位置
            position = 1
            for qid in list(request_queue.queue):
                if qid == request_id:
                    break
                position += 1
            
            if request_data['status'] == 'queued':
                request_data['queue_position'] = position
                request_data['total_queue'] = request_queue.qsize()
        
        # 返回状态信息
        response = {
            'status': request_data['status'],
            'request_id': request_id,
        }
        
        # 根据状态添加额外信息
        if request_data['status'] == 'completed':
            response['result'] = request_data['result']
        elif request_data['status'] == 'error':
            response['error'] = request_data.get('error', '未知错误')
        elif request_data['status'] == 'queued':
            response['queue_position'] = request_data['queue_position']
            response['total_queue'] = request_data['total_queue']
        
        return jsonify(response)
        
    except Exception as e:
        print(f"检查请求状态时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/queue_status', methods=['GET'])
def api_queue_status():
    """
    API端点：获取队列状态
    """
    try:
        with queue_lock:
            status = {
                'queue_size': request_queue.qsize(),
                'total_processed': queue_stats['total_processed'],
                'total_errors': queue_stats['total_errors'],
                'avg_processing_time': queue_stats['processing_time'] / max(1, queue_stats['total_processed'])
            }
        
        return jsonify(status)
        
    except Exception as e:
        print(f"获取队列状态时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/cancel/<request_id>', methods=['POST'])
def api_cancel(request_id):
    """
    API端点：取消请求
    """
    try:
        with queue_lock:
            if request_id not in pending_requests:
                return jsonify({'status': 'error', 'message': '请求不存在'}), 404
            
            # 如果请求正在队列中，尝试从队列中移除
            new_queue = queue.Queue()
            removed = False
            
            while not request_queue.empty():
                qid = request_queue.get()
                if qid != request_id:
                    new_queue.put(qid)
                else:
                    removed = True
            
            # 恢复队列
            while not new_queue.empty():
                request_queue.put(new_queue.get())
            
            # 更新请求状态为取消
            if removed or pending_requests[request_id]['status'] == 'queued':
                pending_requests[request_id]['status'] = 'cancelled'
                message = '请求已成功取消'
            else:
                message = '请求已在处理中，无法取消'
        
        return jsonify({'status': 'success', 'message': message})
        
    except Exception as e:
        print(f"取消请求时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/gallery', methods=['GET'])
def api_gallery():
    """
    API端点：获取学校画廊作品
    支持通过student_id参数筛选特定用户的作品
    支持通过approved=true/false参数筛选已通过/已拒绝的作品
    支持通过pending=true参数筛选待审核的作品（不含approved字段的记录）
    支持通过show_all=true参数查看所有作品（包括未显示在画廊中的）
    """
    try:
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取页码和每页记录数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        student_id = request.args.get('student_id')  # 获取学生ID
        
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 构建查询条件
        query = {}
        
        # 默认只显示在画廊中的作品，除非指定show_all=true
        if request.args.get('show_all') != 'true':
            query['in_school_gallery'] = 1
        
        # 如果提供了student_id，添加到查询条件
        if student_id:
            query['student_id'] = student_id
            
        # 处理审核状态筛选
        if request.args.get('approved') == 'true':
            query['approved'] = True
        elif request.args.get('approved') == 'false':
            query['approved'] = False
        elif request.args.get('pending') == 'true':
            # 查询没有approved字段的记录（待审核状态）
            query['approved'] = {'$exists': False}
            
        # 处理搜索查询
        search_query = request.args.get('query')
        if search_query:
            # 在提示词和学生ID中搜索
            query['$or'] = [
                {'prompt': {'$regex': search_query, '$options': 'i'}},
                {'chinese_prompt': {'$regex': search_query, '$options': 'i'}},
                {'student_id': {'$regex': search_query, '$options': 'i'}}
            ]
        
        # 获取总记录数
        total_count = school_gallery.count_documents(query)
        
        # 查询记录，使用更灵活的排序逻辑
        # 使用MongoDB聚合管道来处理排序，优先使用submission_timestamp，没有则使用timestamp
        pipeline = [
            {'$match': query},
            {'$addFields': {
                'sort_field': {'$ifNull': ['$submission_timestamp', '$timestamp']}
            }},
            {'$sort': {'sort_field': -1}},
            {'$skip': skip},
            {'$limit': per_page}
        ]
        cursor = school_gallery.aggregate(pipeline)
        
        # 将结果转换为列表
        gallery_items = []
        for item in cursor:
            # 将ObjectId转换为字符串
            item['_id'] = str(item['_id'])
            gallery_items.append(item)
        
        return jsonify({
            'status': 'success',
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'items': gallery_items
        })
        
    except Exception as e:
        print(f"获取画廊作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/submit_to_gallery', methods=['POST', 'OPTIONS'])
def api_submit_to_gallery():
    """将图片提交到学校画廊
    
    注意：此端点是将用户生成的图像信息存入数据库的主要入口点。
    学生生成图像时仅在本地保存信息，只有通过该端点提交到画廊时才保存到数据库。
    """
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 获取请求数据
        req_data = request.get_json()
        
        # 检查必要参数
        if not req_data or 'image_url' not in req_data or 'prompt' not in req_data:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        image_url = req_data.get('image_url')
        prompt = req_data.get('prompt')
        chinese_prompt = req_data.get('chinese_prompt', prompt)
        style = req_data.get('style', '')
        student_id = req_data.get('student_id', '')
        student_name = req_data.get('student_name', '')
        seed = req_data.get('seed', -1)
        
        # 记录提交详情
        print(f"收到画廊提交请求: URL={image_url}, 学生={student_name}({student_id})")
        
        # 检查图片是否已存在（通过URL判断）
        existing_artwork = school_gallery.find_one({'image_url': image_url})
        
        if existing_artwork is not None:
            # 更新现有记录
            print(f"找到现有记录ID: {existing_artwork.get('_id')}")
            print(f"现有记录数据: {existing_artwork}")
            
            update_data = {
                'in_school_gallery': 1,  # 更新为显示在学校画廊
                'submission_timestamp': time.time(),  # 记录提交时间
            }
            
            # 如果提供了种子参数，也保存它
            if 'seed' in req_data:
                update_data['seed'] = seed
                
            # 如果现有记录没有submission_type字段，添加它
            if 'submission_type' not in existing_artwork:
                update_data['submission_type'] = 'user'
            
            # 提交到学校画廊时移除approved字段，使其回到待审核状态
            # 注意：这里使用$unset操作符来移除字段
            school_gallery.update_one(
                {'_id': existing_artwork['_id']},
                {
                    '$set': update_data,
                    '$unset': {'approved': ""}
                }
            )
            
            artwork_id = str(existing_artwork['_id'])
            print(f"成功更新作品到学校画廊: {artwork_id}")
            
            return jsonify({
                'status': 'success',
                'message': '成功提交到学校画廊',
                'artwork_id': artwork_id
            })
        else:
            # 如果找不到现有记录，创建新记录
            print("未找到现有记录，将创建新记录")
            
            # 确保提交的数据尽可能完整
            width = req_data.get('width', 1024)
            height = req_data.get('height', 1024)
            
            # 获取额外可能有用的信息
            format = req_data.get('format', 'png')
            translated_prompt = req_data.get('translated_prompt', '')
            
            artwork_data = {
                'image_url': image_url,
                'prompt': prompt,
                'chinese_prompt': chinese_prompt,
                'style': style,
                'submission_type': req_data.get('submission_type', 'user'),
                'timestamp': req_data.get('timestamp', time.time()),
                'submission_timestamp': time.time(),
                'likes': 0,
                'in_school_gallery': 1,  # 1表示显示在学校画廊
                'width': width,
                'height': height,
                'format': format,
                'ip_address': request.remote_addr,
            }
            
            # 如果提供了种子参数，保存它
            if 'seed' in req_data:
                artwork_data['seed'] = seed
                
            # 如果提供了学生信息，保存它
            if student_id:
                artwork_data['student_id'] = student_id
                if student_name:
                    artwork_data['student_name'] = student_name
            
            # 记录完整信息
            print(f"创建新画廊记录: URL={image_url}, 提示词={prompt}, 学生={student_name}({student_id})")
            
            # 注意: 不设置approved字段，表示待审核状态
            
            # 插入到MongoDB
            result = school_gallery.insert_one(artwork_data)
            artwork_id = str(result.inserted_id)
            
            print(f"创建新记录并提交到学校画廊: {artwork_id}")
            
            return jsonify({
                'status': 'success',
                'message': '成功提交到学校画廊',
                'artwork_id': artwork_id
            })
        
    except Exception as e:
        print(f"提交到学校画廊时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/gallery/<artwork_id>/like', methods=['POST', 'OPTIONS'])
def api_like_artwork(artwork_id):
    """
    给作品点赞（增加likes计数）
    """
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        return handle_preflight_request()
    
    try:
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': '数据库未连接'}), 500
        
        # 查找并更新作品
        try:
            # 转换ID为ObjectId
            object_id = ObjectId(artwork_id)
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'无效的作品ID: {str(e)}'}), 400
        
        # 检查作品是否存在
        artwork = school_gallery.find_one({'_id': object_id})
        if not artwork:
            return jsonify({'status': 'error', 'message': '找不到指定的作品'}), 404
        
        # 增加likes计数
        current_likes = artwork.get('likes', 0)
        result = school_gallery.update_one(
            {'_id': object_id},
            {'$set': {'likes': current_likes + 1}}
        )
        
        if result.modified_count > 0:
            return jsonify({
                'status': 'success',
                'message': '点赞成功',
                'likes': current_likes + 1
            })
        else:
            return jsonify({'status': 'error', 'message': '点赞失败'}), 500
        
    except Exception as e:
        print(f"点赞作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/gallery/<artwork_id>/unlike', methods=['POST', 'OPTIONS'])
def api_unlike_artwork(artwork_id):
    """
    取消作品点赞（减少likes计数）
    """
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        return handle_preflight_request()
    
    try:
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': '数据库未连接'}), 500
        
        from bson.objectid import ObjectId
        
        # 查找并更新作品
        try:
            # 转换ID为ObjectId
            object_id = ObjectId(artwork_id)
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'无效的作品ID: {str(e)}'}), 400
        
        # 检查作品是否存在
        artwork = school_gallery.find_one({'_id': object_id})
        if not artwork:
            return jsonify({'status': 'error', 'message': '找不到指定的作品'}), 404
        
        # 减少likes计数，但不低于0
        current_likes = artwork.get('likes', 0)
        new_likes = max(0, current_likes - 1)
        result = school_gallery.update_one(
            {'_id': object_id},
            {'$set': {'likes': new_likes}}
        )
        
        if result.modified_count > 0:
            return jsonify({
                'status': 'success',
                'message': '取消点赞成功',
                'likes': new_likes
            })
        else:
            return jsonify({'status': 'error', 'message': '取消点赞失败'}), 500
        
    except Exception as e:
        print(f"取消点赞作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/remove_from_gallery', methods=['POST', 'OPTIONS'])
def api_remove_from_gallery():
    """
    将作品从学校画廊中移除（更新in_school_gallery字段为0）
    """
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        return handle_preflight_request()
    
    try:
        # 获取请求数据
        data = request.json
        
        if not data or 'image_url' not in data:
            return jsonify({'status': 'error', 'message': '请求数据不完整'}), 400
        
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': '数据库未连接'}), 500
        
        # 从URL中提取特征部分用于查找
        image_url = data['image_url']
        prompt_part = None
        
        # 从URL中提取唯一标识部分
        # 假设image_url结构是：https://xxx/yyy/prompt/分割线/提示词
        if '/' in image_url:
            parts = image_url.split('/')
            if len(parts) > 4:  # 至少有5部分
                # 取最后两部分作为唯一标识
                prompt_part = '/'.join(parts[-2:])
        
        # 首先尝试完全匹配image_url
        query = {'image_url': image_url}
        existing_artwork = school_gallery.find_one(query)
        print(f"通过完全匹配查找结果: {existing_artwork is not None}")
        
        if existing_artwork is None and prompt_part:
            # 如果完全匹配失败，尝试部分匹配
            query = {'image_url': {'$regex': prompt_part, '$options': 'i'}}
            existing_artwork = school_gallery.find_one(query)
            print(f"通过部分匹配查找结果: {existing_artwork is not None}")
            
            if existing_artwork is not None:
                print(f"通过部分匹配找到记录: {existing_artwork.get('image_url')}")
        
        if existing_artwork is not None:
            # 更新现有记录
            print(f"找到现有记录ID: {existing_artwork.get('_id')}")
            print(f"现有记录数据: {existing_artwork}")
            
            update_data = {
                'in_school_gallery': 0,  # 更新为不显示在学校画廊
                'removal_timestamp': time.time(),  # 记录移除时间
            }
            
            # 如果提供了种子参数，也保存它
            if 'seed' in data:
                update_data['seed'] = data['seed']
            
            result = school_gallery.update_one(
                {'_id': existing_artwork['_id']},
                {'$set': update_data}
            )
            
            print(f"更新结果: modified_count={result.modified_count}, matched_count={result.matched_count}")
            
            if result.modified_count > 0 or result.matched_count > 0:
                artwork_id = str(existing_artwork['_id'])
                print(f"成功从学校画廊移除作品: {artwork_id}")
                
                return jsonify({
                    'status': 'success',
                    'message': '已从学校画廊移除',
                    'artwork_id': artwork_id
                })
            else:
                return jsonify({'status': 'error', 'message': '更新记录失败'}), 500
        else:
            return jsonify({'status': 'error', 'message': '找不到指定的作品'}), 404
        
    except Exception as e:
        print(f"从学校画廊移除作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/fix_gallery_records', methods=['GET'])
def api_fix_gallery_records():
    """
    API端点：修复学校画廊记录
    添加缺失的in_school_gallery字段
    """
    try:
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 查找所有缺少in_school_gallery字段的记录
        missing_field_records = school_gallery.find({"in_school_gallery": {"$exists": False}})
        
        count = 0
        for record in missing_field_records:
            # 检查是否为通过"提交到学校画廊"功能创建的记录
            if 'submission_type' in record and record['submission_type'] == 'user':
                # 这是通过提交功能创建的记录，应该设置为1
                school_gallery.update_one(
                    {'_id': record['_id']},
                    {'$set': {'in_school_gallery': 1}}
                )
                count += 1
            else:
                # 这是通过生成图片时自动创建的记录，应该设置为0
                school_gallery.update_one(
                    {'_id': record['_id']},
                    {'$set': {'in_school_gallery': 0}}
                )
                count += 1
        
        # 查找重复的图片记录（相同图片URL但不同ID的记录）
        print("检查重复记录...")
        all_records = list(school_gallery.find({}, {'image_url': 1}))
        url_counts = {}
        
        # 计算每个URL出现的次数
        for record in all_records:
            url = record.get('image_url', '')
            if url:
                if url in url_counts:
                    url_counts[url] += 1
                else:
                    url_counts[url] = 1
        
        # 找出重复的URL
        duplicate_urls = [url for url, count in url_counts.items() if count > 1]
        print(f"找到 {len(duplicate_urls)} 个重复的图片URL")
        
        # 处理重复记录
        duplicate_fixed = 0
        for url in duplicate_urls:
            # 获取具有相同URL的所有记录
            records = list(school_gallery.find({'image_url': url}).sort('timestamp', 1))
            
            if len(records) <= 1:
                continue
                
            # 保留第一条记录（生成时创建的），删除其他记录（提交时创建的）
            kept_record = records[0]
            
            # 检查保留的记录是否有in_school_gallery字段
            if 'in_school_gallery' not in kept_record:
                school_gallery.update_one(
                    {'_id': kept_record['_id']},
                    {'$set': {'in_school_gallery': 1}}  # 设置为显示在学校画廊
                )
            else:
                # 确保设置为1（显示在学校画廊）
                school_gallery.update_one(
                    {'_id': kept_record['_id']},
                    {'$set': {'in_school_gallery': 1}}
                )
            
            # 删除其余重复记录
            for i in range(1, len(records)):
                school_gallery.delete_one({'_id': records[i]['_id']})
                duplicate_fixed += 1
        
        return jsonify({
            'status': 'success',
            'message': f'已修复 {count} 条缺少in_school_gallery字段的记录，删除 {duplicate_fixed} 条重复记录'
        })
        
    except Exception as e:
        print(f"修复画廊记录时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 管理员API接口
@app.route('/api/admin/login', methods=['POST'])
def api_admin_login():
    """管理员登录接口"""
    try:
        data = request.json
        admin_id = data.get('admin_id')
        password = data.get('password')
        
        if not admin_id or not password:
            return jsonify({'status': 'error', 'message': '请提供管理员ID和密码'}), 400
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 查询管理员账户
        admin = users.find_one({'student_id': admin_id, 'role': 'admin'})
        
        if not admin:
            return jsonify({'status': 'error', 'message': '管理员账户不存在'}), 401
        
        # 检查密码（实际应用中应该使用加密密码）
        if admin.get('password') != password:
            return jsonify({'status': 'error', 'message': '密码错误'}), 401
        
        # 生成认证令牌
        token = generate_admin_token(admin_id)
        
        # 更新最后登录时间
        users.update_one(
            {'_id': admin['_id']},
            {'$set': {'last_login': time.time()}}
        )
        
        return jsonify({
            'status': 'success',
            'message': '登录成功',
            'token': token
        })
        
    except Exception as e:
        print(f"管理员登录失败: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/verify_token', methods=['GET'])
def api_admin_verify_token():
    """验证管理员令牌"""
    if verify_admin_token():
        return jsonify({'status': 'success', 'message': '令牌有效'})
    else:
        return jsonify({'status': 'error', 'message': '令牌无效或已过期'}), 401

@app.route('/api/admin/users', methods=['GET'])
def api_admin_get_users():
    """获取用户列表"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取分页参数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        query = request.args.get('query', '')
        
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 构建查询条件
        search_query = {}
        if query:
            search_query = {
                '$or': [
                    {'student_id': {'$regex': query, '$options': 'i'}},
                    {'username': {'$regex': query, '$options': 'i'}}
                ]
            }
        
        # 获取总记录数
        total_count = users.count_documents(search_query)
        
        # 查询记录
        cursor = users.find(search_query).sort('created_at', -1).skip(skip).limit(per_page)
        
        # 将结果转换为列表
        user_items = []
        for item in cursor:
            # 将ObjectId转换为字符串
            item['_id'] = str(item['_id'])
            # 不返回密码字段
            if 'password' in item:
                del item['password']
            user_items.append(item)
        
        return jsonify({
            'status': 'success',
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'users': user_items
        })
        
    except Exception as e:
        print(f"获取用户列表出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
def api_admin_create_user():
    """创建用户"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取请求数据
        data = request.json
        student_id = data.get('student_id')
        
        if not student_id:
            return jsonify({'status': 'error', 'message': '请提供学生ID'}), 400
        
        # 检查用户是否已存在
        existing_user = users.find_one({'student_id': student_id})
        if existing_user:
            return jsonify({'status': 'error', 'message': '该学生ID已存在'}), 400
        
        # 创建新用户
        new_user = {
            'student_id': student_id,
            'username': data.get('username', ''),
            'status': data.get('status', 'active'),
            'created_at': time.time(),
            'last_login': None,
            'sensitive_word_count': 0,
            'role': 'user'
        }
        
        # 如果状态为banned，添加ban_reason
        if new_user['status'] == 'banned':
            new_user['ban_reason'] = data.get('ban_reason', '')
            new_user['ban_date'] = time.time()
        
        # 插入到数据库
        result = users.insert_one(new_user)
        
        return jsonify({
            'status': 'success',
            'message': '用户创建成功',
            'user_id': str(result.inserted_id)
        })
        
    except Exception as e:
        print(f"创建用户出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/users/<user_id>', methods=['PUT'])
def api_admin_update_user(user_id):
    """更新用户信息"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
            
        # 获取请求数据
        data = request.json
        print("收到的更新数据:", data)  # 添加调试日志
        
        # 验证用户是否存在
        user = users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({'status': 'error', 'message': '用户不存在'}), 404
            
        # 准备更新数据
        update_data = {}
        
        # 更新基本字段
        if 'username' in data:
            update_data['username'] = data['username']
        if 'status' in data:
            update_data['status'] = data['status']
        if 'sensitive_word_count' in data:
            update_data['sensitive_word_count'] = data['sensitive_word_count']
        if 'temp_sensitive_count' in data:
            update_data['temp_sensitive_count'] = data['temp_sensitive_count']
        if 'likes_count' in data:
            update_data['likes_count'] = data['likes_count']
            
        # 处理暂停状态
        if 'is_suspended' in data:
            update_data['is_suspended'] = data['is_suspended']
            if data['is_suspended']:
                update_data['suspension_time'] = data.get('suspension_time', time.time())
                update_data['temp_sensitive_count'] = data.get('temp_sensitive_count', 0)
            else:
                update_data['suspension_time'] = None
                update_data['temp_sensitive_count'] = 0
                
        # 处理禁用状态
        if data.get('status') == 'inactive' and 'ban_reason' in data:
            update_data['ban_reason'] = data['ban_reason']
            update_data['ban_date'] = time.time()
            
        print("更新数据:", update_data)  # 添加调试日志
        
        # 执行更新
        result = users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_data}
        )
        
        if result.modified_count > 0:
            return jsonify({
                'status': 'success',
                'message': '用户更新成功'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': '用户更新失败'
            }), 400
            
    except Exception as e:
        print(f"更新用户时出错: {e}")  # 添加错误日志
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
def api_admin_delete_user(user_id):
    """删除用户"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        from bson.objectid import ObjectId
        
        # 删除用户
        result = users.delete_one({'_id': ObjectId(user_id)})
        
        if result.deleted_count == 0:
            return jsonify({'status': 'error', 'message': '用户不存在'}), 404
        
        return jsonify({
            'status': 'success',
            'message': '用户删除成功'
        })
        
    except Exception as e:
        print(f"删除用户出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/users/import', methods=['POST'])
def api_admin_import_users():
    """批量导入用户"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取请求数据
        data = request.json
        user_data = data.get('users', [])
        
        if not user_data:
            return jsonify({'status': 'error', 'message': '没有提供用户数据'}), 400
        
        # 导入结果统计
        imported = 0
        failed = 0
        
        for user in user_data:
            # 验证必要字段
            if 'student_id' not in user:
                failed += 1
                continue
            
            # 检查用户是否已存在
            existing_user = users.find_one({'student_id': user['student_id']})
            
            if existing_user:
                # 更新现有用户
                update_data = {
                    'username': user.get('username', existing_user.get('username', '')),
                    'status': user.get('status', existing_user.get('status', 'active'))
                }
                
                users.update_one(
                    {'_id': existing_user['_id']},
                    {'$set': update_data}
                )
            else:
                # 创建新用户
                new_user = {
                    'student_id': user['student_id'],
                    'username': user.get('username', ''),
                    'status': user.get('status', 'active'),
                    'created_at': time.time(),
                    'last_login': None,
                    'sensitive_word_count': 0,
                    'role': 'user'
                }
                
                users.insert_one(new_user)
            
            imported += 1
            
        return jsonify({
            'status': 'success',
            'message': f'成功导入 {imported} 个用户，{failed} 个失败',
            'imported': imported,
            'failed': failed
        })
        
    except Exception as e:
        print(f"批量导入用户出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/users/export', methods=['GET'])
def api_admin_export_users():
    """导出用户列表"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取查询条件
        query = request.args.get('query', '')
        
        # 构建查询条件
        search_query = {}
        if query:
            search_query = {
                '$or': [
                    {'student_id': {'$regex': query, '$options': 'i'}},
                    {'username': {'$regex': query, '$options': 'i'}}
                ]
            }
        
        # 查询所有符合条件的用户
        cursor = users.find(search_query).sort('created_at', -1)
        
        # 将结果转换为列表
        user_items = []
        for item in cursor:
            # 将ObjectId转换为字符串
            item['_id'] = str(item['_id'])
            # 不返回密码字段
            if 'password' in item:
                del item['password']
            user_items.append(item)
        
        return jsonify({
            'status': 'success',
            'users': user_items
        })
        
    except Exception as e:
        print(f"导出用户列表出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/verify_student', methods=['POST'])
def api_verify_student():
    """验证学生身份"""
    try:
        data = request.json
        student_id = data.get('student_id')
        
        if not student_id:
            return jsonify({'status': 'error', 'message': '请提供学生ID'}), 400
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 验证学生身份
        result = verify_student(student_id)
        
        if result['status'] == 'success':
            # 不返回用户对象中的password字段
            if 'user' in result and 'password' in result['user']:
                del result['user']['password']
            
            # 将ObjectId转换为字符串
            if 'user' in result and '_id' in result['user']:
                result['user']['_id'] = str(result['user']['_id'])
                
            return jsonify(result)
        else:
            return jsonify(result), 401
        
    except Exception as e:
        print(f"验证学生身份出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 添加作品统计API
@app.route('/api/admin/artwork_stats', methods=['GET', 'POST', 'OPTIONS'])
def api_admin_artwork_stats():
    """获取作品审核统计数据"""
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 查询各类作品数量
        pending_count = school_gallery.count_documents({'approved': {'$exists': False}})
        approved_count = school_gallery.count_documents({'approved': True})
        rejected_count = school_gallery.count_documents({'approved': False})
        total_count = school_gallery.count_documents({})  # 总记录数
        
        # 按日期统计最近30天的审核情况
        # 30天前的时间戳
        thirty_days_ago = time.time() - (30 * 24 * 60 * 60)
        
        # 查询最近30天的审核数据
        daily_stats = []
        
        for i in range(30):
            # 计算当天的起始和结束时间戳
            day_start = time.time() - ((i + 1) * 24 * 60 * 60)
            day_end = time.time() - (i * 24 * 60 * 60)
            
            # 查询当天审核通过的数量
            day_approved = school_gallery.count_documents({
                'review_timestamp': {'$gte': day_start, '$lt': day_end},
                'approved': True
            })
            
            # 查询当天审核拒绝的数量
            day_rejected = school_gallery.count_documents({
                'review_timestamp': {'$gte': day_start, '$lt': day_end},
                'approved': False
            })
            
            # 获取日期字符串
            day_date = time.strftime('%Y-%m-%d', time.localtime(day_start))
            
            daily_stats.append({
                'date': day_date,
                'approved': day_approved,
                'rejected': day_rejected,
                'total': day_approved + day_rejected
            })
        
        # 统计每个学生的作品数量（Top 10）
        student_stats = []
        
        # 按student_id分组并计数
        pipeline = [
            {'$match': {'student_id': {'$exists': True, '$ne': None}}},
            {'$group': {'_id': '$student_id', 'count': {'$sum': 1}}},
            {'$sort': {'count': -1}},
            {'$limit': 10}
        ]
        
        student_counts = list(school_gallery.aggregate(pipeline))
        
        for item in student_counts:
            student_id = item['_id']
            count = item['count']
            
            # 获取学生名字
            student = users.find_one({'student_id': student_id})
            student_name = student.get('username', '') if student else ''
            
            student_stats.append({
                'student_id': student_id,
                'student_name': student_name,
                'artwork_count': count
            })
        
        return jsonify({
            'status': 'success',
            'stats': {
                'pending': pending_count,
                'approved': approved_count,
                'rejected': rejected_count,
                'total': total_count
            },
            'daily_stats': daily_stats,
            'student_stats': student_stats
        })
        
    except Exception as e:
        print(f"获取作品统计数据出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 添加待审核作品API端点
@app.route('/api/admin/pending_artworks', methods=['GET', 'POST', 'OPTIONS'])
def api_admin_pending_artworks():
    """获取待审核的作品列表"""
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取分页参数
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 12, type=int)
        
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 构建查询条件
        query = {'approved': {'$exists': False}}
        
        # 添加搜索查询
        search_query = request.args.get('query') or request.args.get('search')
        if search_query:
            # 在提示词和学生ID中搜索
            query['$or'] = [
                {'prompt': {'$regex': search_query, '$options': 'i'}},
                {'chinese_prompt': {'$regex': search_query, '$options': 'i'}},
                {'student_id': {'$regex': search_query, '$options': 'i'}}
            ]
        
        # 打印调试信息
        print(f"API请求参数: page={page}, per_page={per_page}, search={search_query}")
        print(f"MongoDB查询: {query}, skip={skip}, limit={per_page}")
        
        # 查询总数
        total_count = school_gallery.count_documents(query)
        print(f"符合条件的总记录数: {total_count}")
        
        # 查询作品列表，使用更灵活的排序逻辑
        # 使用MongoDB聚合管道来处理排序，优先使用submission_timestamp，没有则使用timestamp
        pipeline = [
            {'$match': query},
            {'$addFields': {
                'sort_field': {'$ifNull': ['$submission_timestamp', '$timestamp']}
            }},
            {'$sort': {'sort_field': -1}},
            {'$skip': skip},
            {'$limit': per_page}
        ]
        items = list(school_gallery.aggregate(pipeline))
        print(f"本次返回记录数: {len(items)}")
        
        # 处理学生信息
        for item in items:
            item['_id'] = str(item['_id'])  # 转换ObjectId为字符串
            
            # 获取学生名字
            if 'student_id' in item:
                student = users.find_one({'student_id': item['student_id']})
                if student:
                    item['student_name'] = student.get('username', '')
        
        return jsonify({
            'status': 'success',
            'items': items,
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'pages': (total_count + per_page - 1) // per_page
        })
        
    except Exception as e:
        print(f"获取待审核作品列表出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 添加审批作品API
@app.route('/api/admin/approve_artwork', methods=['POST', 'OPTIONS'])
def api_admin_approve_artwork():
    """管理员审核作品"""
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取请求数据
        req_data = request.get_json()
        artwork_id = req_data.get('artwork_id')
        approved = req_data.get('approved')
        reject_reason = req_data.get('reject_reason', '')
        
        if not artwork_id:
            return jsonify({'status': 'error', 'message': '缺少作品ID'}), 400
        
        if approved is None:
            return jsonify({'status': 'error', 'message': '缺少审核状态'}), 400
        
        # 查找作品
        artwork = school_gallery.find_one({'_id': ObjectId(artwork_id)})
        if not artwork:
            return jsonify({'status': 'error', 'message': '作品不存在'}), 404
        
        # 更新审核状态
        update_data = {
            'approved': approved,  # 显式设置approved字段为True或False
            'review_timestamp': time.time(),
            'review_by': get_admin_id()
        }
        
        # 如果是拒绝，添加拒绝原因
        if not approved and reject_reason:
            update_data['reject_reason'] = reject_reason
        
        # 如果是拒绝，可以选择更新in_school_gallery字段为0（从画廊中隐藏）
        if not approved:
            update_data['in_school_gallery'] = 0
        else:
            # 如果是通过，设置in_school_gallery字段为1（在画廊中显示）
            update_data['in_school_gallery'] = 1
            
        school_gallery.update_one(
            {'_id': ObjectId(artwork_id)},
            {'$set': update_data}
        )
        
        # 如果审核通过且作品关联了学生ID，可以更新学生的审核通过作品计数
        if approved and artwork.get('student_id'):
            student_id = artwork.get('student_id')
            student = users.find_one({'student_id': student_id})
            if student:
                # 更新学生的审核通过作品计数
                approved_count = student.get('approved_artworks_count', 0) + 1
                users.update_one(
                    {'_id': student['_id']},
                    {'$set': {'approved_artworks_count': approved_count}}
                )
        
        return jsonify({
            'status': 'success',
            'message': '审核成功',
            'approved': approved
        })
        
    except Exception as e:
        print(f"审核作品出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 添加批量审批API
@app.route('/api/admin/batch_approve', methods=['POST', 'OPTIONS'])
def api_admin_batch_approve():
    """管理员批量审核作品"""
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取请求数据
        req_data = request.get_json()
        artwork_ids = req_data.get('artwork_ids', [])
        approved = req_data.get('approved')
        reject_reason = req_data.get('reject_reason', '')
        
        if not artwork_ids:
            return jsonify({'status': 'error', 'message': '缺少作品ID列表'}), 400
        
        if approved is None:
            return jsonify({'status': 'error', 'message': '缺少审核状态'}), 400
        
        # 将字符串ID转换为ObjectId
        object_ids = []
        for id_str in artwork_ids:
            try:
                object_ids.append(ObjectId(id_str))
            except:
                pass
        
        if not object_ids:
            return jsonify({'status': 'error', 'message': '无有效作品ID'}), 400
        
        # 更新审核状态
        update_data = {
            'approved': approved,  # 显式设置approved字段为True或False
            'review_timestamp': time.time(),
            'review_by': get_admin_id()
        }
        
        # 如果是拒绝，添加拒绝原因
        if not approved and reject_reason:
            update_data['reject_reason'] = reject_reason
            
        # 如果是拒绝，可以选择更新in_school_gallery字段为0（从画廊中隐藏）
        if not approved:
            update_data['in_school_gallery'] = 0
        else:
            # 如果是通过，设置in_school_gallery字段为1（在画廊中显示）
            update_data['in_school_gallery'] = 1
        
        result = school_gallery.update_many(
            {'_id': {'$in': object_ids}},
            {'$set': update_data}
        )
        
        # 如果是审核通过，对每个作品更新相关学生的审核通过作品计数
        if approved:
            artworks = school_gallery.find({'_id': {'$in': object_ids}})
            student_counts = {}  # 用于统计每个学生的审核通过数量
            
            for artwork in artworks:
                student_id = artwork.get('student_id')
                if student_id:
                    student_counts[student_id] = student_counts.get(student_id, 0) + 1
            
            # 批量更新学生的审核通过作品计数
            for student_id, count in student_counts.items():
                student = users.find_one({'student_id': student_id})
                if student:
                    current_count = student.get('approved_artworks_count', 0)
                    users.update_one(
                        {'_id': student['_id']},
                        {'$set': {'approved_artworks_count': current_count + count}}
                    )
        
        return jsonify({
            'status': 'success',
            'message': '批量审核成功',
            'modified_count': result.modified_count
        })
        
    except Exception as e:
        print(f"批量审核作品出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 获取当前管理员ID
def get_admin_id():
    """获取当前管理员ID"""
    try:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            return payload.get('admin_id', 'unknown')
    except:
        pass
    return 'unknown'

@app.route('/api/record_generation', methods=['POST', 'OPTIONS'])
def api_record_generation():
    """
    API端点: 记录用户生成的图像信息
    
    注意：该端点不再自动记录每次生成的图像，
    而仅在用户显式提交到学校画廊时使用。
    图像生成时仅在本地保存信息，只有提交到画廊时才保存到数据库。
    """
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 解析请求数据
        data = request.json
        print(f"收到图像生成记录请求: {data}")
        
        # 验证必要参数
        if not data:
            return jsonify({'status': 'error', 'message': '缺少请求数据'}), 400
            
        username = data.get('username')
        student_id = data.get('student_id')
        prompt = data.get('prompt')
        translated_prompt = data.get('translated_prompt', prompt)
        image_url = data.get('image_url')
        
        if not username or not student_id or not image_url:
            print(f"记录图像生成：缺少必要信息 - 用户名: {username}, 学号: {student_id}, 图像URL: {'有' if image_url else '无'}")
            return jsonify({
                'status': 'error', 
                'message': '缺少必要信息',
                'missing_fields': {
                    'username': not username,
                    'student_id': not student_id,
                    'image_url': not image_url
                }
            }), 400
        
        # 如果MongoDB已连接，保存记录
        if mongo_client is not None and school_gallery is not None:
            try:
                # 检查是否已存在相同image_url的记录，避免创建重复记录
                existing_record = school_gallery.find_one({'image_url': image_url})
                
                if existing_record:
                    print(f"已存在相同image_url的记录，ID: {existing_record['_id']}")
                    # 更新现有记录
                    update_data = {
                        'prompt': prompt,
                        'chinese_prompt': translated_prompt,
                        'username': username,
                        'student_id': student_id,
                        'timestamp': time.time(),
                        'width': data.get('width', 1024),
                        'height': data.get('height', 1024),
                        'seed': data.get('seed'),
                        'format': data.get('format', 'png'),
                        'ip_address': request.remote_addr,
                        'direct_submission': True  # 标记为直接提交，而非队列处理
                    }
                    
                    school_gallery.update_one(
                        {'_id': existing_record['_id']},
                        {'$set': update_data}
                    )
                    
                    print(f"已更新记录: {existing_record['_id']}")
                    return jsonify({
                        'status': 'success',
                        'message': '已更新现有记录',
                        'artwork_id': str(existing_record['_id']),
                        'action': 'updated'
                    })
                else:
                    # 创建新记录
                    artwork_data = {
                        'image_url': image_url,
                        'prompt': prompt,
                        'chinese_prompt': translated_prompt,
                        'username': username,
                        'student_name': username,  # 同时设置student_name字段
                        'student_id': student_id,
                        'timestamp': time.time(),
                        'width': data.get('width', 1024),
                        'height': data.get('height', 1024),
                        'seed': data.get('seed'),
                        'format': data.get('format', 'png'),
                        'ip_address': request.remote_addr,
                        'submission_type': 'user',
                        'in_school_gallery': 0,  # 默认不显示在画廊中
                        'likes': 0,
                        'direct_submission': True  # 标记为直接提交，而非队列处理
                    }
                    
                    result = school_gallery.insert_one(artwork_data)
                    artwork_id = str(result.inserted_id)
                    
                    print(f"已创建新记录: {artwork_id}")
                    return jsonify({
                        'status': 'success',
                        'message': '已创建新记录',
                        'artwork_id': artwork_id,
                        'action': 'created'
                    })
                    
            except Exception as e:
                print(f"保存到MongoDB失败: {e}")
                return jsonify({'status': 'error', 'message': f'保存记录失败: {str(e)}'}), 500
        else:
            print("MongoDB未连接，无法保存记录")
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 503
            
    except Exception as e:
        print(f"记录图像生成出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 启动队列处理线程
queue_thread = threading.Thread(target=process_queue, daemon=True)
queue_thread.start()

@app.route('/api/admin/user_stats', methods=['GET'])
def api_admin_user_stats():
    """获取用户统计数据"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
            
        # 获取用户统计数据
        total_users = users.count_documents({})
        active_users = users.count_documents({'status': 'active', 'is_suspended': False})
        suspended_users = users.count_documents({'is_suspended': True})
        inactive_users = users.count_documents({'status': 'inactive'})
        
        return jsonify({
            'status': 'success',
            'stats': {
                'user_counts': {
                    'total_users': total_users,
                    'active_users': active_users,
                    'suspended_users': suspended_users,
                    'inactive_users': inactive_users
                }
            }
        })
        
    except Exception as e:
        print(f"获取用户统计数据时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

def get_student_info_from_request():
    """从请求中获取学生信息
    
    Returns:
        dict: 包含学生信息的字典，如果未找到则返回None
    """
    try:
        # 从请求数据中获取
        data = request.get_json()
        if data and 'student_id' in data:
            return {'student_id': data['student_id']}
            
        # 从请求头中获取
        student_id = request.headers.get('X-Student-ID')
        if student_id:
            return {'student_id': student_id}
            
        # 从localStorage中获取
        student_id = request.cookies.get('studentId')
        if student_id:
            return {'student_id': student_id}
            
        return None
    except:
        return None

@app.route('/api/check_sensitive_quota', methods=['POST', 'OPTIONS'])
def api_check_sensitive_quota():
    """
    API端点: 检查用户状态
    检查用户是否被暂停(is_suspended=true)或状态非活跃(status=inactive)
    """
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 解析请求数据
        data = request.json
        if not data:
            return jsonify({'status': 'error', 'message': '缺少请求数据'}), 400
            
        student_id = data.get('student_id')
        if not student_id:
            return jsonify({'status': 'error', 'message': '缺少学生ID'}), 400
        
        # 检查MongoDB连接
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        print(f"检查用户 {student_id} 的状态")
        
        # 查询用户信息
        user = users.find_one({'student_id': student_id})
        if not user:
            print(f"用户 {student_id} 不存在，允许使用")
            # 用户不存在，返回默认值允许使用
            return jsonify({
                'status': 'success',
                'message': '用户不存在，使用默认值',
                'allowed': True,
                'user_exists': False
            })
        
        # 检查用户是否被禁用(banned)、暂停(suspended)或非活跃(inactive)
        is_suspended = user.get('is_suspended', False)
        status = user.get('status', 'active')
        
        # 如果用户被暂停或状态为inactive，则不允许使用
        if is_suspended or status == 'inactive' or status == 'banned':
            reason = '账户已被暂停使用'
            if status == 'inactive':
                reason = '账户处于非活跃状态'
            elif status == 'banned':
                reason = user.get('ban_reason', '账户已被禁用')
                
            print(f"用户 {student_id} 不允许使用: is_suspended={is_suspended}, status={status}")
            return jsonify({
                'status': 'success',
                'allowed': False,
                'reason': reason,
                'user_exists': True,
                'user_status': status,
                'is_suspended': is_suspended
            })
        
        print(f"用户 {student_id} 状态正常，允许使用: is_suspended={is_suspended}, status={status}")
        
        return jsonify({
            'status': 'success',
            'allowed': True,
            'user_exists': True,
            'user_status': status,
            'is_suspended': is_suspended
        })
            
    except Exception as e:
        print(f"检查用户状态时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 添加一个新的定时任务，用于恢复暂停用户
def check_suspended_users():
    """
    定时检查暂停用户，如果暂停时间超过24小时，则恢复用户状态
    """
    try:
        if mongo_client is None or users is None:
            print("MongoDB未连接，无法检查暂停用户")
            return
            
        # 当前时间
        current_time = time.time()
        # 24小时的秒数
        suspension_duration = 24 * 60 * 60
        
        # 查找所有暂停状态的用户
        suspended_users = users.find({"is_suspended": True})
        
        for user in suspended_users:
            suspension_time = user.get("suspension_time")
            if not suspension_time:
                continue
                
            # 计算暂停时间
            elapsed_time = current_time - suspension_time
            
            # 如果暂停超过24小时，恢复用户状态
            if elapsed_time >= suspension_duration:
                student_id = user.get("student_id")
                print(f"用户 {student_id} 暂停时间已超过24小时，恢复状态")
                
                # 恢复用户状态
                users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "is_suspended": False,
                        "temp_sensitive_count": 0,  # 重置临时敏感词计数
                        "suspension_end_time": current_time
                    }}
                )
    except Exception as e:
        print(f"检查暂停用户时出错: {e}")

# 启动定时任务线程
def start_background_tasks():
    """
    启动所有后台任务
    """
    # 启动队列处理线程
    queue_thread = threading.Thread(target=process_queue)
    queue_thread.daemon = True
    queue_thread.start()
    
    # 启动定时检查暂停用户的线程
    def run_suspended_users_check():
        while True:
            try:
                check_suspended_users()
            except Exception as e:
                print(f"运行暂停用户检查时出错: {e}")
            # 每小时检查一次
            time.sleep(60 * 60)
    
    suspended_check_thread = threading.Thread(target=run_suspended_users_check)
    suspended_check_thread.daemon = True
    suspended_check_thread.start()
    
    print("所有后台任务已启动")

# 在应用启动时启动后台任务
@app.before_first_request
def before_first_request():
    start_background_tasks()

@app.route('/api/check_sensitive_words', methods=['POST', 'OPTIONS'])
def api_check_sensitive_words():
    """
    API端点: 检查文本中是否包含敏感词
    如果包含敏感词，会记录到数据库并更新用户状态
    """
    if request.method == 'OPTIONS':
        return handle_preflight_request()
        
    try:
        # 解析请求数据
        data = request.json
        if not data:
            print("敏感词检测API错误: 缺少请求数据")
            return jsonify({'status': 'error', 'message': '缺少请求数据'}), 400
            
        text = data.get('text')
        student_id = data.get('student_id')
        # 获取是否跳过记录的标志，前端调用时设为true，避免重复计数
        skip_logging = data.get('skip_logging', False)
        # 获取前端提供的敏感词列表和类别
        provided_words = data.get('words')
        provided_categories = data.get('categories')
        
        if not text:
            print("敏感词检测API错误: 缺少文本内容")
            return jsonify({'status': 'error', 'message': '缺少文本内容'}), 400
            
        print(f"敏感词检测API: 检查文本 '{text[:20]}...' (学生ID: {student_id}, skip_logging: {skip_logging})")
        
        # 检查文本是否包含敏感词
        try:
            result = check_sensitive_words(text, provided_words, provided_categories)
            print(f"敏感词检测结果: {result}")
        except Exception as e:
            print(f"敏感词检测API错误: 检测函数调用失败: {e}")
            return jsonify({
                'status': 'error',
                'safe': True,  # 出错时默认为安全
                'message': f'敏感词检测出错: {str(e)}'
            }), 500
        
        # 如果文本安全，直接返回结果
        if result.get("safe", True):
            return jsonify({
                'status': 'success',
                'safe': True,
                'message': '文本安全，无敏感词'
            })
            
        # 如果提供了学生ID，且不跳过记录，则记录敏感词使用
        # 注意：当skip_logging=False时（即前端要求记录时），一定要记录敏感词使用
        if student_id and not skip_logging:
            try:
                log_result = check_and_log_sensitive_words(text, student_id, provided_words, provided_categories)
                print(f"敏感词记录结果: {log_result}")
                
                # 检查是否有暂停或状态更改消息
                suspension_message = log_result.get("suspension_message", "")
                if suspension_message:
                    return jsonify({
                        'status': 'error',
                        'safe': False,
                        'words': result.get("words", []),
                        'categories': result.get("categories", []),
                        'message': suspension_message,
                        'temp_count': log_result.get("temp_count", 0),
                        'total_count': log_result.get("total_count", 0),
                        'should_block': True  # 添加阻止标志
                    })
                
                # 返回带有计数信息的结果
                return jsonify({
                    'status': 'warning',
                    'safe': False,
                    'words': result.get("words", []),
                    'categories': result.get("categories", []),
                    'message': log_result.get("message", "检测到敏感词"),
                    'temp_count': log_result.get("temp_count", 0),
                    'total_count': log_result.get("total_count", 0),
                    'should_block': True  # 添加阻止标志
                })
            except Exception as e:
                print(f"敏感词检测API错误: 记录敏感词使用失败: {e}")
                # 即使记录失败，仍然返回敏感词检测结果
                return jsonify({
                    'status': 'warning',
                    'safe': False,
                    'words': result.get("words", []),
                    'categories': result.get("categories", []),
                    'message': f"检测到敏感词，但记录失败: {str(e)}",
                    'should_block': True  # 添加阻止标志
                })
        
        # 如果设置了跳过记录，或没有提供学生ID，只返回检测结果
        # 查询用户的当前计数，便于前端正确显示
        current_temp_count = 0
        current_total_count = 0
        
        if student_id and users is not None:
            user = users.find_one({"student_id": student_id})
            if user:
                current_temp_count = user.get("temp_sensitive_count", 0)
                current_total_count = user.get("sensitive_word_count", 0)
        
        return jsonify({
            'status': 'warning',
            'safe': False,
            'words': result.get("words", []),
            'categories': result.get("categories", []),
            'message': "检测到敏感词",
            'temp_count': current_temp_count,
            'total_count': current_total_count,
            'should_block': True  # 即使不记录敏感词，也应该阻止生成
        })
            
    except Exception as e:
        error_msg = f"敏感词检测API出错: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()  # 打印详细堆栈跟踪
        return jsonify({'status': 'error', 'message': error_msg}), 500

@app.route('/api/admin/users/batch_update', methods=['POST'])
def api_admin_batch_update_users():
    """批量更新用户"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        if mongo_client is None or users is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取请求数据
        data = request.json
        user_ids = data.get('user_ids', [])
        update_data = data.get('update', {})
        
        if not user_ids or not update_data:
            return jsonify({'status': 'error', 'message': '缺少必要参数'}), 400
        
        print(f"批量更新用户: {len(user_ids)}个用户, 更新数据: {update_data}")
        
        # 转换用户ID为ObjectId
        from bson.objectid import ObjectId
        object_ids = [ObjectId(uid) for uid in user_ids if uid]
        
        # 特殊处理suspension_time字段
        if 'is_suspended' in update_data:
            if update_data['is_suspended']:
                # 如果暂停用户，确保设置suspension_time
                if 'suspension_time' not in update_data:
                    update_data['suspension_time'] = time.time()
            else:
                # 如果解除暂停，清除暂停时间
                update_data['suspension_time'] = None
                update_data['temp_sensitive_count'] = 0
        
        # 执行批量更新
        result = users.update_many(
            {'_id': {'$in': object_ids}},
            {'$set': update_data}
        )
        
        return jsonify({
            'status': 'success',
            'message': f'批量更新成功，影响了{result.modified_count}个用户',
            'modified_count': result.modified_count
        })
        
    except Exception as e:
        print(f"批量更新用户出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/sensitive_words', methods=['GET'])
def api_admin_get_sensitive_words():
    """获取自定义敏感词列表"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401

        if mongo_client is None or custom_sensitive_words is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500

        # 获取所有自定义敏感词类别
        result = list(custom_sensitive_words.find({}, {'_id': 1, 'category': 1, 'words': 1, 'is_active': 1}))
        
        # 将ObjectId转换为字符串
        for item in result:
            item['_id'] = str(item['_id'])
        
        return jsonify({
            'status': 'success',
            'data': result
        })
    
    except Exception as e:
        print(f"获取敏感词时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/sensitive_words/<category_id>', methods=['PUT'])
def api_admin_update_sensitive_words(category_id):
    """更新敏感词类别"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401

        if mongo_client is None or custom_sensitive_words is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500

        # 获取请求数据
        data = request.json
        
        # 验证数据
        if not data:
            return jsonify({'status': 'error', 'message': '请求数据为空'}), 400
        
        # 准备更新数据
        update_data = {
            'updated_at': time.time()
        }
        
        if 'words' in data:
            # 确保words是列表且去重
            if isinstance(data['words'], list):
                # 过滤空字符串并去重
                words = list(set([w.strip() for w in data['words'] if w.strip()]))
                update_data['words'] = words
            else:
                return jsonify({'status': 'error', 'message': 'words字段必须是数组'}), 400
        
        if 'is_active' in data:
            update_data['is_active'] = bool(data['is_active'])
        
        # 执行更新
        result = custom_sensitive_words.update_one(
            {'_id': ObjectId(category_id)},
            {'$set': update_data}
        )
        
        if result.matched_count == 0:
            return jsonify({'status': 'error', 'message': '找不到指定的敏感词类别'}), 404
        
        return jsonify({
            'status': 'success',
            'message': '敏感词类别更新成功',
            'modified_count': result.modified_count
        })
    
    except Exception as e:
        print(f"更新敏感词时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/sensitive_words', methods=['POST'])
def api_admin_add_sensitive_category():
    """添加新的敏感词类别"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401

        if mongo_client is None or custom_sensitive_words is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500

        # 获取请求数据
        data = request.json
        
        # 验证数据
        if not data or 'category' not in data:
            return jsonify({'status': 'error', 'message': '缺少必要参数category'}), 400
        
        category = data['category'].strip()
        if not category:
            return jsonify({'status': 'error', 'message': '类别名称不能为空'}), 400
        
        # 检查类别是否已存在
        if custom_sensitive_words.find_one({'category': category}):
            return jsonify({'status': 'error', 'message': f'类别"{category}"已存在'}), 400
        
        # 准备新类别数据
        new_category = {
            'category': category,
            'words': data.get('words', []),
            'is_active': data.get('is_active', True),
            'created_at': time.time(),
            'updated_at': time.time()
        }
        
        # 插入新类别
        result = custom_sensitive_words.insert_one(new_category)
        
        return jsonify({
            'status': 'success',
            'message': '敏感词类别添加成功',
            'category_id': str(result.inserted_id)
        })
    
    except Exception as e:
        print(f"添加敏感词类别时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/sensitive_words/<category_id>', methods=['DELETE'])
def api_admin_delete_sensitive_category(category_id):
    """删除敏感词类别"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401

        if mongo_client is None or custom_sensitive_words is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500

        # 执行删除操作
        result = custom_sensitive_words.delete_one({'_id': ObjectId(category_id)})
        
        if result.deleted_count == 0:
            return jsonify({'status': 'error', 'message': '找不到指定的敏感词类别'}), 404
        
        return jsonify({
            'status': 'success',
            'message': '敏感词类别删除成功'
        })
    
    except Exception as e:
        print(f"删除敏感词类别时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/custom_sensitive_words', methods=['GET', 'OPTIONS'])
def api_get_custom_sensitive_words():
    """获取自定义敏感词列表（公共API，所有用户可访问）"""
    print(f"收到自定义敏感词请求: {request.method}, 路径: {request.path}, IP: {request.remote_addr}")
    
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        print("处理OPTIONS请求 - 返回CORS headers")
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    # 处理GET请求
    if request.method == 'GET':
        print("处理GET请求 - 获取自定义敏感词")
        try:
            if mongo_client is None or custom_sensitive_words is None:
                print("MongoDB未连接")
                return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500

            # 只获取已激活的自定义敏感词类别
            print("查询自定义敏感词")
            result = list(custom_sensitive_words.find({"is_active": True}, {'_id': 1, 'category': 1, 'words': 1}))
            print(f"查询结果: {len(result)}个分类")
            
            # 将ObjectId转换为字符串
            for item in result:
                item['_id'] = str(item['_id'])
            
            print("返回自定义敏感词数据")
            response = jsonify({
                'status': 'success',
                'data': result
            })
            # 添加CORS头，确保GET请求也返回正确的CORS头
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response
        
        except Exception as e:
            print(f"获取公共敏感词时出错: {e}")
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # 如果不是OPTIONS或GET请求，返回405错误
    print(f"不支持的请求方法: {request.method}")
    return jsonify({'status': 'error', 'message': '不支持的请求方法'}), 405

# 数据库备份与还原API
@app.route('/api/admin/backups', methods=['GET', 'POST', 'OPTIONS'])
def api_admin_get_backups():
    """获取备份列表和创建备份"""
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response
    
    # 验证管理员身份
    if not verify_admin_token():
        return jsonify({'status': 'error', 'message': '未授权访问'}), 401
    
    # 处理POST请求 - 创建新备份
    if request.method == 'POST':
        try:
            # 确保MongoDB已连接
            if mongo_client is None:
                return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
            
            # 确保备份目录存在
            backup_dir = os.path.join(app.root_path, 'backups')
            if not os.path.exists(backup_dir):
                os.makedirs(backup_dir)
            
            # 创建备份文件名
            timestamp = time.strftime('%Y%m%d_%H%M%S', time.localtime())
            filename = f"backup_{timestamp}.json"
            backup_path = os.path.join(backup_dir, filename)
            
            # 准备备份数据
            backup_data = {}
            
            # 备份用户集合
            if users is not None:
                backup_data['users'] = list(users.find())
            
            # 备份作品集合
            if school_gallery is not None:
                backup_data['school_gallery'] = list(school_gallery.find())
            
            # 备份敏感词集合
            if custom_sensitive_words is not None:
                backup_data['custom_sensitive_words'] = list(custom_sensitive_words.find())
            
            # 备份敏感词日志
            if sensitive_word_logs is not None:
                backup_data['sensitive_word_logs'] = list(sensitive_word_logs.find())
            
            # 将ObjectId转换为字符串
            backup_data = json.loads(json_util.dumps(backup_data))
            
            # 写入备份文件
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
            # 获取文件大小
            file_size = os.path.getsize(backup_path)
            
            return jsonify({
                'status': 'success',
                'message': '备份创建成功',
                'filename': filename,
                'size': file_size,
                'created_at': time.time()
            })
        
        except Exception as e:
            print(f"创建备份出错: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': str(e)}), 500
    
    # 处理GET请求 - 获取备份列表
    try:
        # 确保备份目录存在
        backup_dir = os.path.join(app.root_path, 'backups')
        if not os.path.exists(backup_dir):
            os.makedirs(backup_dir)
        
        # 获取所有备份文件
        backups = []
        for filename in os.listdir(backup_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(backup_dir, filename)
                file_stat = os.stat(file_path)
                
                # 解析文件名获取创建时间
                # 文件名格式: backup_YYYYMMDD_HHMMSS.json
                try:
                    timestamp_str = filename.replace('backup_', '').replace('.json', '')
                    timestamp = time.mktime(time.strptime(timestamp_str, '%Y%m%d_%H%M%S'))
                except:
                    # 如果解析失败，使用文件修改时间
                    timestamp = file_stat.st_mtime
                
                # 读取文件元数据
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        collections = list(data.keys()) if isinstance(data, dict) else []
                except:
                    collections = []
                
                backups.append({
                    'id': filename,
                    'filename': filename,
                    'size': file_stat.st_size,
                    'created_at': timestamp,
                    'collections': collections
                })
        
        return jsonify({
            'status': 'success',
            'data': backups
        })
    
    except Exception as e:
        print(f"获取备份列表出错: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/backups/<backup_id>', methods=['DELETE', 'OPTIONS'])
def api_admin_delete_backup(backup_id):
    """删除指定备份"""
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'DELETE,OPTIONS')
        return response
    
    # 验证管理员身份
    if not verify_admin_token():
        return jsonify({'status': 'error', 'message': '未授权访问'}), 401
    
    try:
        # 确保备份目录存在
        backup_dir = os.path.join(app.root_path, 'backups')
        if not os.path.exists(backup_dir):
            return jsonify({'status': 'error', 'message': '备份目录不存在'}), 404
        
        # 构建备份文件路径
        backup_path = os.path.join(backup_dir, backup_id)
        
        # 检查文件是否存在
        if not os.path.exists(backup_path):
            return jsonify({'status': 'error', 'message': '备份文件不存在'}), 404
        
        # 删除备份文件
        os.remove(backup_path)
        
        return jsonify({
            'status': 'success',
            'message': '备份删除成功'
        })
    
    except Exception as e:
        print(f"删除备份出错: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/backups/<backup_id>/restore', methods=['POST', 'OPTIONS'])
def api_admin_restore_backup(backup_id):
    """从指定备份还原数据库"""
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response
    
    # 验证管理员身份
    if not verify_admin_token():
        return jsonify({'status': 'error', 'message': '未授权访问'}), 401
    
    try:
        # 确保MongoDB已连接
        if mongo_client is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 构建备份文件路径
        backup_dir = os.path.join(app.root_path, 'backups')
        backup_path = os.path.join(backup_dir, backup_id)
        
        # 检查文件是否存在
        if not os.path.exists(backup_path):
            return jsonify({'status': 'error', 'message': '备份文件不存在'}), 404
        
        # 读取备份文件
        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        # 还原数据
        restore_results = {}
        
        # 还原用户集合
        if 'users' in backup_data and users is not None:
            # 先清空现有数据
            users.delete_many({})
            # 插入备份数据
            if backup_data['users']:
                users.insert_many(json_util.loads(json.dumps(backup_data['users'])))
            restore_results['users'] = len(backup_data['users'])
        
        # 还原作品集合
        if 'school_gallery' in backup_data and school_gallery is not None:
            # 先清空现有数据
            school_gallery.delete_many({})
            # 插入备份数据
            if backup_data['school_gallery']:
                school_gallery.insert_many(json_util.loads(json.dumps(backup_data['school_gallery'])))
            restore_results['school_gallery'] = len(backup_data['school_gallery'])
        
        # 还原敏感词集合
        if 'custom_sensitive_words' in backup_data and custom_sensitive_words is not None:
            # 先清空现有数据
            custom_sensitive_words.delete_many({})
            # 插入备份数据
            if backup_data['custom_sensitive_words']:
                custom_sensitive_words.insert_many(json_util.loads(json.dumps(backup_data['custom_sensitive_words'])))
            restore_results['custom_sensitive_words'] = len(backup_data['custom_sensitive_words'])
        
        # 还原敏感词日志
        if 'sensitive_word_logs' in backup_data and sensitive_word_logs is not None:
            # 先清空现有数据
            sensitive_word_logs.delete_many({})
            # 插入备份数据
            if backup_data['sensitive_word_logs']:
                sensitive_word_logs.insert_many(json_util.loads(json.dumps(backup_data['sensitive_word_logs'])))
            restore_results['sensitive_word_logs'] = len(backup_data['sensitive_word_logs'])
        
        return jsonify({
            'status': 'success',
            'message': '数据库还原成功',
            'restore_results': restore_results
        })
    
    except Exception as e:
        print(f"还原数据库出错: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/backups/<backup_id>/download', methods=['GET', 'OPTIONS'])
def api_admin_download_backup(backup_id):
    """下载指定备份"""
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
    
    # 验证管理员身份（从请求头获取令牌）
    if not verify_admin_token():
        return jsonify({'status': 'error', 'message': '未授权访问'}), 401
    
    try:
        # 构建备份文件路径
        backup_dir = os.path.join(app.root_path, 'backups')
        backup_path = os.path.join(backup_dir, backup_id)
        
        # 检查文件是否存在
        if not os.path.exists(backup_path):
            return jsonify({'status': 'error', 'message': '备份文件不存在'}), 404
        
        # 发送文件
        return send_file(
            backup_path,
            as_attachment=True,
            download_name=backup_id,
            mimetype='application/json'
        )
    
    except Exception as e:
        print(f"下载备份出错: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/backups/restore_from_file', methods=['POST', 'OPTIONS'])
def api_admin_restore_from_file():
    """从上传的文件还原数据库"""
    # 处理OPTIONS请求（预检请求）
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        return response
    
    # 验证管理员身份
    if not verify_admin_token():
        return jsonify({'status': 'error', 'message': '未授权访问'}), 401
    
    try:
        # 确保MongoDB已连接
        if mongo_client is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 检查是否有文件上传
        if 'backup_file' not in request.files:
            return jsonify({'status': 'error', 'message': '未上传备份文件'}), 400
        
        backup_file = request.files['backup_file']
        
        # 确保文件名不为空
        if backup_file.filename == '':
            return jsonify({'status': 'error', 'message': '未选择备份文件'}), 400
        
        # 确保文件是JSON格式
        if not backup_file.filename.endswith('.json'):
            return jsonify({'status': 'error', 'message': '备份文件必须是JSON格式'}), 400
        
        # 读取上传的文件内容
        backup_data = json.loads(backup_file.read().decode('utf-8'))
        
        # 还原数据
        restore_results = {}
        
        # 还原用户集合
        if 'users' in backup_data and users is not None:
            # 先清空现有数据
            users.delete_many({})
            # 插入备份数据
            if backup_data['users']:
                users.insert_many(json_util.loads(json.dumps(backup_data['users'])))
            restore_results['users'] = len(backup_data['users'])
        
        # 还原作品集合
        if 'school_gallery' in backup_data and school_gallery is not None:
            # 先清空现有数据
            school_gallery.delete_many({})
            # 插入备份数据
            if backup_data['school_gallery']:
                school_gallery.insert_many(json_util.loads(json.dumps(backup_data['school_gallery'])))
            restore_results['school_gallery'] = len(backup_data['school_gallery'])
        
        # 还原敏感词集合
        if 'custom_sensitive_words' in backup_data and custom_sensitive_words is not None:
            # 先清空现有数据
            custom_sensitive_words.delete_many({})
            # 插入备份数据
            if backup_data['custom_sensitive_words']:
                custom_sensitive_words.insert_many(json_util.loads(json.dumps(backup_data['custom_sensitive_words'])))
            restore_results['custom_sensitive_words'] = len(backup_data['custom_sensitive_words'])
        
        # 还原敏感词日志
        if 'sensitive_word_logs' in backup_data and sensitive_word_logs is not None:
            # 先清空现有数据
            sensitive_word_logs.delete_many({})
            # 插入备份数据
            if backup_data['sensitive_word_logs']:
                sensitive_word_logs.insert_many(json_util.loads(json.dumps(backup_data['sensitive_word_logs'])))
            restore_results['sensitive_word_logs'] = len(backup_data['sensitive_word_logs'])
        
        # 保存上传的备份文件
        backup_dir = os.path.join(app.root_path, 'backups')
        if not os.path.exists(backup_dir):
            os.makedirs(backup_dir)
        
        # 创建备份文件名（使用当前时间+上传的文件名）
        timestamp = time.strftime('%Y%m%d_%H%M%S', time.localtime())
        filename = f"backup_{timestamp}_uploaded.json"
        backup_path = os.path.join(backup_dir, filename)
        
        # 将上传的文件保存到备份目录
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': '从文件还原成功',
            'restore_results': restore_results,
            'saved_as': filename
        })
    
    except Exception as e:
        print(f"从文件还原数据库出错: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    # 使用环境变量或默认值配置服务器端口
    port = int(os.environ.get('PORT', 8080))
    debug_mode = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print(f"Starting AI Art Server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=debug_mode) 