#!/bin/bash

# AI绘画乐园 - Unraid Docker运行脚本

# 设置MongoDB连接信息
MONGO_HOST=${MONGO_HOST:-"localhost"}
MONGO_PORT=${MONGO_PORT:-"27017"}
MONGO_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/"

# 设置服务器信息
HOST="0.0.0.0"
PORT=${PORT:-"8080"}
HOST_URL=${HOST_URL:-"localhost"}
HTTP_PORT=${HTTP_PORT:-"8000"}

echo "启动AI绘画乐园服务..."
echo "MongoDB连接: $MONGO_URI"
echo "API服务器: http://$HOST:$PORT"
echo "HTTP服务器: http://$HOST_URL:$HTTP_PORT"

# 启动API服务器
python server.py &
API_PID=$!

# 启动HTTP服务器
python -m http.server $HTTP_PORT &
HTTP_PID=$!

# 等待两个进程
wait $API_PID $HTTP_PID 