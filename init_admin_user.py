#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
初始化数据库并创建管理员账号
"""

import sys
import time
import hashlib
import os
import pymongo
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

def create_admin_user(mongo_uri=None, database_name='ai_art_gallery'):
    """创建管理员用户并初始化用户表"""
    try:
        # 如果未提供mongo_uri，从环境变量获取或使用默认值
        if not mongo_uri:
            mongo_host = os.environ.get('MONGO_HOST', 'localhost')
            mongo_port = os.environ.get('MONGO_PORT', '27017')
            mongo_uri = f'mongodb://{mongo_host}:{mongo_port}/'
            
        # 连接到MongoDB
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        
        # 测试连接
        client.admin.command('ping')
        print(f"MongoDB连接成功 ({mongo_uri})")
        
        # 选择数据库
        db = client[database_name]
        
        # 检查users集合是否存在
        if 'users' not in db.list_collection_names():
            print("创建users集合...")
            db.create_collection('users')
        
        users = db['users']
        
        # 检查管理员用户是否已存在
        admin_user = users.find_one({"student_id": "admin"})
        
        if admin_user:
            print("管理员用户已存在，ID:", admin_user.get('_id'))
            confirm = input("是否重置管理员密码？(y/n): ")
            if confirm.lower() != 'y':
                print("操作已取消")
                return
            
            # 更新管理员密码
            password = "admin123"  # 默认密码
            new_password = input("请输入新密码（留空则使用默认密码'admin123'）: ")
            if new_password:
                password = new_password
                
            # 更新管理员账户
            users.update_one(
                {"student_id": "admin"},
                {"$set": {
                    "password": password,
                    "last_login": time.time()
                }}
            )
            print("管理员密码已更新")
        else:
            # 创建管理员用户
            password = "admin123"  # 默认密码
            new_password = input("请输入管理员密码（留空则使用默认密码'admin123'）: ")
            if new_password:
                password = new_password
                
            admin_user = {
                "student_id": "admin",
                "username": "系统管理员",
                "password": password,
                "role": "admin",
                "status": "active",
                "created_at": time.time(),
                "last_login": time.time(),
                "sensitive_word_count": 0
            }
            
            result = users.insert_one(admin_user)
            print("管理员用户创建成功，ID:", result.inserted_id)
            
        # 创建索引
        users.create_index([("student_id", pymongo.ASCENDING)], unique=True)
        print("已创建student_id唯一索引")
        
        # 显示管理员账号信息
        print("\n管理员账号信息:")
        print("--------------------")
        print("账号ID: admin")
        print("密码: " + password)
        print("状态: 活跃")
        print("角色: 管理员")
        print("--------------------")
        print("\n请使用此账号密码登录管理系统。首次登录后建议修改默认密码。")
        
    except (ConnectionFailure, ServerSelectionTimeoutError) as e:
        print("MongoDB连接失败:", e)
        return False
    except Exception as e:
        print("创建管理员用户时出错:", e)
        return False
    finally:
        if 'client' in locals():
            client.close()
    
    return True

def main():
    print("=" * 50)
    print("AI绘画乐园 - 管理员账号初始化工具")
    print("=" * 50)
    
    # 检查命令行参数
    if len(sys.argv) > 1:
        mongo_uri = sys.argv[1]
        create_admin_user(mongo_uri=mongo_uri)
    else:
        create_admin_user()

if __name__ == "__main__":
    main() 