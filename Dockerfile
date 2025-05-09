FROM python:3.9-slim

# 设置工作目录
WORKDIR /app

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制所有文件
COPY . .

# 确保启动脚本是可执行的
RUN chmod +x /app/unraid-docker-run.sh

# 暴露端口
EXPOSE 8080
EXPOSE 8000

# 设置环境变量（默认值，可通过-e参数覆盖）
ENV HOST=0.0.0.0
ENV PORT=8080
ENV MONGO_URI=mongodb://localhost:27017/
ENV HOST_URL=localhost
ENV API_PORT=8080
ENV HTTP_PORT=8000
ENV JWT_SECRET=ai_drawing_gallery_secret_key

# 启动命令
CMD ["bash", "/app/unraid-docker-run.sh"] 