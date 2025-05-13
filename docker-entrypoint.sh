#!/bin/bash
set -e

echo "启动AI绘画乐园服务..."

# 启动MongoDB
echo "正在启动MongoDB..."
mkdir -p /data/db
mongod --fork --logpath /var/log/mongodb.log
echo "MongoDB启动成功"

# 等待MongoDB准备好
sleep 2

# 初始化管理员用户
echo "检查并初始化管理员用户..."
python init_admin_user.py

# 修复数据库记录
echo "检查并修复数据库记录..."
python fix_db.py

# 启动API服务器
echo "启动API服务器..."
python server.py &
API_PID=$!

# 等待API服务器启动
echo "等待API服务器启动..."
sleep 5

# 启动HTTP服务器
echo "启动HTTP服务器..."
python -m http.server 8000 &
HTTP_PID=$!

echo "所有服务已启动"

# 设置正确的信号处理
trap 'kill $API_PID $HTTP_PID; mongod --shutdown; exit 0' SIGTERM SIGINT

# 保持脚本运行
echo "服务运行中，Press Ctrl+C to stop..."
wait $API_PID $HTTP_PID 