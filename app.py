import jwt
import datetime
import os

# JWT密钥，实际应用中应该使用环境变量
JWT_SECRET = os.environ.get('JWT_SECRET', 'ai_art_gallery_secret_key')

@app.route('/api/submit_to_gallery', methods=['POST'])
def submit_to_gallery():
    try:
        # 获取数据
        data = request.get_json()
        # 验证必要字段
        if not all(field in data for field in ['image_url', 'prompt']):
            return jsonify({'status': 'error', 'message': '缺少必要字段'})
        
        # 获取数据
        image_url = data['image_url']
        prompt = data['prompt']
        chinese_prompt = data.get('chinese_prompt', prompt)  # 如果没有提供中文提示词，使用英文提示词
        style = data.get('style', 'oil')  # 默认为油画风格
        timestamp = data.get('timestamp', time.time())  # 默认为当前时间
        seed = data.get('seed', None)  # 获取随机种子

        # 检查是否已经存在相同的作品（不包括seed参数）
        # 将URL中的seed参数移除用于检查是否是重复提交
        base_url = image_url.split('?')[0] if '?' in image_url else image_url
        existing_item = db.gallery.find_one({
            "image_url": {"$regex": f"^{re.escape(base_url)}" }
        })
        
        if existing_item:
            # 如果已存在，则更新
            db.gallery.update_one(
                {"_id": existing_item["_id"]},
                {"$set": {
                    "image_url": image_url,
                    "prompt": prompt,
                    "chinese_prompt": chinese_prompt,
                    "style": style,
                    "timestamp": timestamp,
                    "seed": seed,
                    "approved": False  # 重新提交需要重新审核
                }}
            )
            return jsonify({'status': 'success', 'message': '更新成功'})
        else:
            # 否则创建新记录
            db.gallery.insert_one({
                "image_url": image_url,
                "prompt": prompt,
                "chinese_prompt": chinese_prompt,
                "style": style,
                "timestamp": timestamp,
                "in_school_gallery": 1,
                "likes": 0,
                "approved": False,
                "seed": seed
            })
            return jsonify({'status': 'success', 'message': '提交成功'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

# 作品审核相关API

@app.route('/api/admin/pending_artworks', methods=['GET'])
def api_admin_pending_artworks():
    """获取待审核的作品列表"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取分页参数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 构建查询条件：未审核的作品
        query = {'in_school_gallery': 1, 'approved': False}
        
        # 获取总记录数
        total_count = school_gallery.count_documents(query)
        
        # 查询记录
        cursor = school_gallery.find(query).sort('submission_timestamp', -1).skip(skip).limit(per_page)
        
        # 将结果转换为列表
        artwork_items = []
        for item in cursor:
            # 将ObjectId转换为字符串
            item['_id'] = str(item['_id'])
            # 添加学生姓名（如果有）
            if 'student_id' in item and item['student_id']:
                student = users.find_one({'student_id': item['student_id']})
                if student:
                    item['student_name'] = student.get('username', '')
            artwork_items.append(item)
        
        return jsonify({
            'status': 'success',
            'total': total_count,
            'page': page,
            'per_page': per_page,
            'items': artwork_items
        })
        
    except Exception as e:
        print(f"获取待审核作品列表出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/approve_artwork', methods=['POST'])
def api_admin_approve_artwork():
    """审核通过作品"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取请求数据
        data = request.json
        artwork_id = data.get('artwork_id')
        approval_status = data.get('approved', True)  # 默认为通过
        reject_reason = data.get('reject_reason', '')  # 拒绝原因（如果拒绝）
        
        if not artwork_id:
            return jsonify({'status': 'error', 'message': '缺少作品ID'}), 400
        
        # 查找作品
        artwork = school_gallery.find_one({'_id': ObjectId(artwork_id)})
        if not artwork:
            return jsonify({'status': 'error', 'message': '作品不存在'}), 404
        
        # 更新审核状态
        update_data = {
            'approved': approval_status,
            'review_timestamp': time.time(),
            'reviewer': data.get('reviewer', 'admin')  # 审核人（默认为admin）
        }
        
        # 如果拒绝，添加拒绝原因
        if not approval_status and reject_reason:
            update_data['reject_reason'] = reject_reason
            # 如果拒绝，将作品设置为不在学校画廊显示
            update_data['in_school_gallery'] = 0
        
        # 更新作品
        result = school_gallery.update_one(
            {'_id': ObjectId(artwork_id)},
            {'$set': update_data}
        )
        
        if result.modified_count > 0:
            # 如果审核通过且有学生ID，记录审核通过的作品数量
            if approval_status and 'student_id' in artwork and artwork['student_id']:
                # 查找学生记录
                student = users.find_one({'student_id': artwork['student_id']})
                if student:
                    # 更新学生的审核通过作品计数
                    approved_count = student.get('approved_artworks_count', 0) + 1
                    users.update_one(
                        {'_id': student['_id']},
                        {'$set': {'approved_artworks_count': approved_count}}
                    )
            
            return jsonify({
                'status': 'success',
                'message': '作品审核状态更新成功',
                'approved': approval_status
            })
        else:
            return jsonify({'status': 'error', 'message': '更新作品状态失败'}), 500
        
    except Exception as e:
        print(f"审核作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/admin/batch_approve', methods=['POST'])
def api_admin_batch_approve():
    """批量审核作品"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 获取请求数据
        data = request.json
        artwork_ids = data.get('artwork_ids', [])
        approval_status = data.get('approved', True)  # 默认为通过
        
        if not artwork_ids or not isinstance(artwork_ids, list):
            return jsonify({'status': 'error', 'message': '缺少有效的作品ID列表'}), 400
        
        # 转换字符串ID为ObjectId
        object_ids = [ObjectId(id) for id in artwork_ids if ObjectId.is_valid(id)]
        
        if not object_ids:
            return jsonify({'status': 'error', 'message': '没有有效的作品ID'}), 400
        
        # 更新审核状态
        update_data = {
            'approved': approval_status,
            'review_timestamp': time.time(),
            'reviewer': data.get('reviewer', 'admin')  # 审核人（默认为admin）
        }
        
        # 如果拒绝，添加拒绝原因和更新画廊显示状态
        if not approval_status:
            update_data['reject_reason'] = data.get('reject_reason', '批量拒绝')
            update_data['in_school_gallery'] = 0
        
        # 批量更新作品
        result = school_gallery.update_many(
            {'_id': {'$in': object_ids}},
            {'$set': update_data}
        )
        
        # 如果审核通过，更新相关学生的审核通过作品计数
        if approval_status:
            # 获取所有相关作品
            approved_artworks = school_gallery.find({'_id': {'$in': object_ids}})
            student_counts = {}
            
            # 统计每个学生的审核通过作品数
            for artwork in approved_artworks:
                if 'student_id' in artwork and artwork['student_id']:
                    student_id = artwork['student_id']
                    student_counts[student_id] = student_counts.get(student_id, 0) + 1
            
            # 更新每个学生的审核通过作品计数
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
            'message': f'成功审核 {result.modified_count} 个作品',
            'approved': approval_status,
            'modified_count': result.modified_count
        })
        
    except Exception as e:
        print(f"批量审核作品时出错: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# 修改现有的gallery API，仅返回已审核通过的作品
@app.route('/api/gallery', methods=['GET'])
def api_gallery():
    """
    API端点：获取画廊作品
    支持通过student_id参数筛选特定用户的作品
    默认只返回已审核通过的作品
    """
    try:
        if mongo_client is None or school_gallery is None:
            return jsonify({'status': 'error', 'message': 'MongoDB未连接'}), 500
        
        # 获取页码和每页记录数
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        student_id = request.args.get('student_id')
        show_all = request.args.get('show_all', 'false').lower() == 'true'
        
        # 计算跳过的记录数
        skip = (page - 1) * per_page
        
        # 构建查询条件
        query = {'in_school_gallery': 1}
        
        # 只有管理员可以看到所有作品，否则只显示已审核通过的
        if not show_all:
            query['approved'] = True
        
        # 如果提供了student_id，添加到查询条件
        if student_id:
            query['student_id'] = student_id
        
        # 获取总记录数
        total_count = school_gallery.count_documents(query)
        
        # 查询记录
        cursor = school_gallery.find(query).sort('timestamp', -1).skip(skip).limit(per_page)
        
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

@app.route('/api/admin/artwork_stats', methods=['GET'])
def api_admin_artwork_stats():
    """获取作品审核统计数据"""
    try:
        # 验证管理员身份
        if not verify_admin_token():
            return jsonify({'status': 'error', 'message': '未授权访问'}), 401
        
        # 查询各类作品数量
        pending_count = school_gallery.count_documents({'in_school_gallery': 1, 'approved': {'$exists': False}})
        approved_count = school_gallery.count_documents({'in_school_gallery': 1, 'approved': True})
        rejected_count = school_gallery.count_documents({'approved': False})
        total_count = school_gallery.count_documents({'in_school_gallery': 1})
        
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

def generate_admin_token(admin_id):
    """生成管理员认证令牌"""
    expiration = datetime.datetime.utcnow() + datetime.timedelta(days=1)  # 令牌有效期1天
    
    payload = {
        'admin_id': admin_id,
        'exp': expiration
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    return token

def verify_admin_token():
    """验证管理员令牌"""
    # 从请求头中获取令牌
    auth_header = request.headers.get('Authorization')
    
    if not auth_header or not auth_header.startswith('Bearer '):
        return False
    
    token = auth_header.split(' ')[1]
    
    try:
        # 解码JWT令牌
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        admin_id = payload.get('admin_id')
        
        # 验证管理员账户是否存在且状态正常
        admin = users.find_one({
            'student_id': admin_id,
            'role': 'admin',
            'status': 'active'
        })
        
        return admin is not None
    
    except jwt.ExpiredSignatureError:
        # 令牌已过期
        return False
    except jwt.InvalidTokenError:
        # 无效令牌
        return False
    except Exception:
        # 其他错误
        return False 