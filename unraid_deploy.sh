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
  -e MONGO_HOST=172.16.201.81 \
  -e MONGO_PORT=27017 \
  -e MONGO_URI=mongodb://172.16.201.81:27017/ \
  -e PORT=8080 \
  -e DEBUG=False \
  -e JWT_SECRET=your_secure_jwt_secret \
  --restart unless-stopped \
  ghcr.io/xszhu002/ai_paintting:latest

echo "部署完成！"
echo "Web界面: http://172.16.201.81:8000"
echo "API服务: http://172.16.201.81:8080"
echo ""
echo "请确保MongoDB已在Unraid上运行，并且可以从Docker容器访问。"
echo "如需查看日志，请运行: docker logs ai-painting" 