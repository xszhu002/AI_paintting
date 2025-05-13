FROM python:3.9-slim

WORKDIR /app

# 安装MongoDB
RUN apt-get update && apt-get install -y \
    gnupg wget curl \
    && curl -fsSL https://pgp.mongodb.com/server-6.0.asc | \
       gpg -o /usr/share/keyrings/mongodb-server-6.0.gpg \
       --dearmor \
    && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg] http://repo.mongodb.org/apt/debian bullseye/mongodb-org/6.0 main" | \
       tee /etc/apt/sources.list.d/mongodb-org-6.0.list \
    && apt-get update \
    && apt-get install -y mongodb-org \
    && mkdir -p /data/db \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 复制项目文件
COPY . .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 确保启动脚本有执行权限
RUN chmod +x /app/docker-entrypoint.sh

# 暴露端口
EXPOSE 8000 8080 27017

# 设置环境变量
ENV MONGO_HOST=localhost
ENV MONGO_PORT=27017
ENV PORT=8080
ENV DEBUG=False

# 启动脚本
ENTRYPOINT ["/app/docker-entrypoint.sh"] 