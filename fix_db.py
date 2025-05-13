import os
from pymongo import MongoClient

# 使用环境变量或默认值配置MongoDB连接
mongo_host = os.environ.get('MONGO_HOST', 'localhost')
mongo_port = os.environ.get('MONGO_PORT', '27017')
mongo_uri = f'mongodb://{mongo_host}:{mongo_port}/'

# 连接MongoDB
client = MongoClient(mongo_uri)
db = client['ai_art_gallery']
school_gallery = db['school_gallery']

print(f"连接到MongoDB: {mongo_uri}")

# 打印修复前的统计
total_records = school_gallery.count_documents({})
missing_field = school_gallery.count_documents({'in_school_gallery': {'$exists': False}})
print(f"修复前记录总数: {total_records}")
print(f"缺少in_school_gallery字段的记录数: {missing_field}")

# 查找所有缺少in_school_gallery字段的记录并添加
if missing_field > 0:
    # 更新所有缺失字段的记录，设置为0（默认不显示）
    result = school_gallery.update_many(
        {'in_school_gallery': {'$exists': False}},
        {'$set': {'in_school_gallery': 0}}
    )
    print(f"已更新 {result.modified_count} 条记录")

    # 检查是否有重复记录（同一个image_url有多条记录）
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
            
        print(f"处理重复URL: {url}")
        print(f"  重复记录数: {len(records)}")
        
        # 保留第一条记录，确保设置为in_school_gallery=1
        kept_record = records[0]
        school_gallery.update_one(
            {'_id': kept_record['_id']},
            {'$set': {'in_school_gallery': 1}}
        )
        print(f"  保留记录ID: {kept_record['_id']}")
        
        # 删除其余重复记录
        for i in range(1, len(records)):
            school_gallery.delete_one({'_id': records[i]['_id']})
            duplicate_fixed += 1
            print(f"  删除记录ID: {records[i]['_id']}")
    
    print(f"已删除 {duplicate_fixed} 条重复记录")

# 打印修复后的统计
total_records = school_gallery.count_documents({})
missing_field = school_gallery.count_documents({'in_school_gallery': {'$exists': False}})
print(f"修复后记录总数: {total_records}")
print(f"缺少in_school_gallery字段的记录数: {missing_field}")
print(f"显示在画廊中的记录数: {school_gallery.count_documents({'in_school_gallery': 1})}")
print(f"不显示在画廊中的记录数: {school_gallery.count_documents({'in_school_gallery': 0})}")

print("\n修复完成！") 