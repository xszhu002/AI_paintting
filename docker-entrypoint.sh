#!/bin/bash
set -e

echo "启动AI绘画乐园服务..."

# 创建数据目录
echo "准备数据目录..."
mkdir -p /data

# 修改服务器配置，使用外部MongoDB或内存数据库
echo "配置MongoDB连接..."
export MONGO_HOST=${MONGO_HOST:-"localhost"}
export MONGO_PORT=${MONGO_PORT:-"27017"}
export MONGO_URI=${MONGO_URI:-"mongodb://${MONGO_HOST}:${MONGO_PORT}/"}

echo "MongoDB连接配置: ${MONGO_URI}"

# 初始化管理员用户（如果能连接到MongoDB）
echo "检查并初始化管理员用户..."
python init_admin_user.py || echo "警告：无法初始化管理员用户，请确保MongoDB可访问"

# 修复数据库记录
echo "检查并修复数据库记录..."
python fix_db.py || echo "警告：无法修复数据库记录，请确保MongoDB可访问"

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
trap 'kill $API_PID $HTTP_PID; exit 0' SIGTERM SIGINT

# 保持脚本运行
echo "服务运行中，Press Ctrl+C to stop..."
wait $API_PID $HTTP_PID 