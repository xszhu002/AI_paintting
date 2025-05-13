FROM python:3.9-slim

WORKDIR /app

# 安装MongoDB
RUN apt-get update && apt-get install -y \
    gnupg wget \
    && wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | apt-key add - \
    && echo "deb http://repo.mongodb.org/apt/debian buster/mongodb-org/4.4 main" | tee /etc/apt/sources.list.d/mongodb-org-4.4.list \
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