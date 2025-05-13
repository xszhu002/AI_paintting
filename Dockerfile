FROM python:3.9-slim

WORKDIR /app

# 安装系统依赖和网络调试工具
RUN apt-get update && apt-get install -y \
    procps \
    iputils-ping \
    curl \
    dnsutils \
    net-tools \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY . .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 确保启动脚本有执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口
EXPOSE 8000 8080

# 设置环境变量
ENV MONGO_HOST=localhost
ENV MONGO_PORT=27017
ENV MONGO_URI=mongodb://localhost:27017/
ENV PORT=8080
ENV DEBUG=False

# 配置线程限制
ENV PYTHONUNBUFFERED=1

# 启动脚本
ENTRYPOINT ["/app/docker-entrypoint.sh"] 