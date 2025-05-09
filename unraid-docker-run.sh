#!/bin/bash

# AI绘画乐园 - Unraid Docker运行脚本

# 设置系统资源限制
ulimit -n 65535
ulimit -u 65535
ulimit -s 8192

# 设置MongoDB连接信息
MONGO_HOST=${MONGO_HOST:-"localhost"}
MONGO_PORT=${MONGO_PORT:-"27017"}
MONGO_URI="mongodb://${MONGO_HOST}:${MONGO_PORT}/"

# 设置服务器信息
HOST="0.0.0.0"
PORT=${PORT:-"8080"}
HOST_URL=${HOST_URL:-"localhost"}
HTTP_PORT=${HTTP_PORT:-"8000"}

echo "设置系统资源限制..."
echo "最大打开文件数: $(ulimit -n)"
echo "最大用户进程数: $(ulimit -u)"
echo "堆栈大小: $(ulimit -s) KB"

echo "启动AI绘画乐园服务..."
echo "MongoDB连接: $MONGO_URI"
echo "API服务器: http://$HOST:$PORT"
echo "HTTP服务器: http://$HOST_URL:$HTTP_PORT"

# 启动API服务器（增加MongoDB连接重试逻辑）
python -c "
import time, socket, pymongo
mongo_host = '${MONGO_HOST}'
mongo_port = ${MONGO_PORT}
retry_count = 0
max_retries = 10

print(f'等待MongoDB服务器 {mongo_host}:{mongo_port} 就绪...')
while retry_count < max_retries:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect((mongo_host, mongo_port))
        s.close()
        print('MongoDB服务器已就绪！')
        break
    except:
        retry_count += 1
        print(f'MongoDB连接尝试 {retry_count}/{max_retries} 失败，等待重试...')
        time.sleep(3)
    
if retry_count >= max_retries:
    print('无法连接到MongoDB服务器，退出')
    exit(1)
" || exit $?

# 启动API服务器
python server.py &
API_PID=$!

# 启动HTTP服务器
python -m http.server $HTTP_PORT &
HTTP_PID=$!

# 等待两个进程
wait $API_PID $HTTP_PID 