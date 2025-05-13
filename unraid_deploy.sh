#!/bin/bash
# Unraid部署脚本 - AI绘画乐园

# 创建应用数据目录
mkdir -p /mnt/user/appdata/ai-painting/data

# 拉取最新的Docker镜像
echo "拉取最新的AI绘画乐园Docker镜像..."
docker pull ghcr.io/xszhu002/ai_paintting:latest

# 停止并移除旧容器（如果存在）
echo "停止并移除旧容器（如果存在）..."
docker stop ai-painting 2>/dev/null
docker rm ai-painting 2>/dev/null

# 运行新容器
echo "启动AI绘画乐园容器..."
docker run -d \
  --name ai-painting \
  -p 8000:8000 \
  -p 8080:8080 \
  -v /mnt/user/appdata/ai-painting/data:/data \
  -e MONGO_HOST=172.16.201.200 \
  -e MONGO_PORT=27017 \
  -e MONGO_URI=mongodb://172.16.201.200:27017/ \
  -e PORT=8080 \
  -e DEBUG=False \
  -e JWT_SECRET=your_secure_jwt_secret \
  --restart unless-stopped \
  --network host \
  --privileged \
  --cap-add SYS_ADMIN \
  --security-opt seccomp=unconfined \
  --ulimit nproc=65535 \
  --ulimit nofile=65535 \
  --memory=4g \
  --memory-swap=8g \
  ghcr.io/xszhu002/ai_paintting:latest

# 打印容器状态
echo "等待容器启动..."
sleep 5
docker ps | grep ai-painting

# 显示容器日志
echo "容器日志:"
docker logs ai-painting

echo "部署完成！"
echo "Web界面: http://172.16.201.81:8000"
echo "API服务: http://172.16.201.81:8080"
echo ""
echo "请确保MongoDB已在新地址(172.16.201.200:27017)上运行，并且可以从Docker容器访问。"
echo "如需查看日志，请运行: docker logs ai-painting"

# 添加测试MongoDB连接的命令
echo ""
echo "测试MongoDB连接:"
docker exec ai-painting python -c "
from pymongo import MongoClient
try:
    client = MongoClient('mongodb://172.16.201.200:27017/', serverSelectionTimeoutMS=5000)
    info = client.server_info()
    print('MongoDB连接成功!')
    print(f'MongoDB版本: {info.get(\"version\")}')
    dbs = client.list_database_names()
    print(f'可用数据库: {dbs}')
except Exception as e:
    print(f'MongoDB连接失败: {e}')
" 