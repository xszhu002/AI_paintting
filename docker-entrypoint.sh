#!/bin/bash
set -e

echo "启动AI绘画乐园服务..."

# 创建数据目录
echo "准备数据目录..."
mkdir -p /data

# 修改服务器配置，使用外部MongoDB
echo "配置MongoDB连接..."
export MONGO_HOST=${MONGO_HOST:-"localhost"}
export MONGO_PORT=${MONGO_PORT:-"27017"}
export MONGO_URI=${MONGO_URI:-"mongodb://${MONGO_HOST}:${MONGO_PORT}/"}

# 设置Python线程限制
echo "配置Python线程设置..."
export PYTHONTHREADDEBUG=1
export PYTHONTRACEMALLOC=1
# 限制Python进程的线程数
export OPENBLAS_NUM_THREADS=1
export MKL_NUM_THREADS=1
export NUMEXPR_NUM_THREADS=1
export OMP_NUM_THREADS=1
export PYTHONWARNINGS=always

echo "MongoDB连接配置: ${MONGO_URI}"

# 测试MongoDB连接
echo "测试MongoDB连接..."
MONGO_OK=false
for i in {1..5}; do
    echo "尝试连接MongoDB (${i}/5)..."
    if python -c "
from pymongo import MongoClient
import sys
try:
    # 使用非线程阻塞模式连接
    client = MongoClient('${MONGO_URI}', 
                         serverSelectionTimeoutMS=3000,
                         connect=False,
                         maxPoolSize=1,
                         minPoolSize=0)
    # 执行ping命令检查连接
    client.admin.command('ping')
    print('MongoDB连接成功!')
    sys.exit(0)
except Exception as e:
    print(f'MongoDB连接失败: {e}')
    sys.exit(1)
"; then
        MONGO_OK=true
        break
    fi
    echo "等待2秒后重试..."
    sleep 2
done

if [ "$MONGO_OK" = false ]; then
    echo "警告: 无法连接到MongoDB，应用可能无法正常工作"
    echo "将继续启动服务，但请确保MongoDB可访问"
fi

# 打印系统资源信息
echo "系统资源信息:"
ulimit -a
free -m
nproc

# 预先加载pymongo库以避免线程问题
echo "预加载pymongo库..."
python -c "
from pymongo import MongoClient
print('pymongo库已预加载')
"

# 创建临时启动脚本
cat > /tmp/start_server.py << EOF
import os
import sys
import time

# 尝试导入所需模块，以便提前发现错误
print("导入所需模块...")
try:
    import threading
    import queue
    import json
    import requests
    import random
    import flask
    import pymongo
    import jwt
    import datetime
    from bson.objectid import ObjectId
    print("所有模块导入成功")
except Exception as e:
    print(f"导入模块失败: {e}")
    sys.exit(1)

# 先运行初始化脚本
print("运行初始化脚本...")
try:
    # 初始化管理员用户
    os.system("python init_admin_user.py || echo '警告：无法初始化管理员用户'")
    # 修复数据库记录
    os.system("python fix_db.py || echo '警告：无法修复数据库记录'")
except Exception as e:
    print(f"初始化脚本运行失败: {e}")

# 等待一会，让系统稳定
time.sleep(1)

# 启动API服务器
print("启动API服务器...")
try:
    # 使用exec替代fork模式，避免线程问题
    os.system("python server.py &")
except Exception as e:
    print(f"启动API服务器失败: {e}")

# 等待API服务器启动
print("等待API服务器启动...")
time.sleep(5)

# 启动HTTP服务器
print("启动HTTP服务器...")
try:
    os.system("python -m http.server 8000 &")
except Exception as e:
    print(f"启动HTTP服务器失败: {e}")

print("所有服务已启动")
print("服务运行中，按Ctrl+C停止...")

# 保持脚本运行
while True:
    try:
        time.sleep(60)
    except KeyboardInterrupt:
        print("收到停止信号，退出...")
        break
    except Exception as e:
        print(f"出现错误: {e}")
        time.sleep(10)
EOF

# 运行启动脚本
echo "使用优化后的启动脚本..."
exec python /tmp/start_server.py 