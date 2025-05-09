# AI绘画乐园 - Unraid故障排除指南

本文档提供了在Unraid上运行AI绘画乐园容器时可能遇到的常见问题及其解决方案。

## 常见问题

### 1. "can't start new thread" 错误

#### 问题描述

当容器内的Python应用试图创建新线程时，可能会收到以下错误：

```
can't start new thread
```

这通常是由于系统对用户进程可创建的线程数量有限制造成的。

#### 解决方案

我们已经对Docker容器配置进行了以下优化：

1. **增加ulimits配置**：在docker-compose.yml中添加了ulimits配置，提高了线程和文件打开限制：

```yaml
ulimits:
  nproc: 65535
  nofile:
    soft: 65535
    hard: 65535
```

2. **优化启动脚本**：修改了unraid-docker-run.sh脚本，在容器启动时设置更高的资源限制：

```bash
ulimit -n 65535  # 最大文件打开数
ulimit -u 65535  # 最大用户进程数
ulimit -s 8192   # 线程栈大小
```

3. **优化MongoDB连接**：添加了MongoDB连接池配置和重试机制，减少线程资源消耗：

```python
client = MongoClient(
    mongo_uri,
    connectTimeoutMS=5000,
    socketTimeoutMS=10000,
    serverSelectionTimeoutMS=10000,
    maxPoolSize=MAX_WORKER_THREADS,
    waitQueueTimeoutMS=5000,
    connect=True
)
```

### 2. MongoDB连接失败

#### 问题描述

有时容器可能无法连接到MongoDB服务器，特别是当MongoDB容器和应用容器同时启动时。

#### 解决方案

1. **添加连接重试机制**：在unraid-docker-run.sh中添加了MongoDB连接检测和重试机制：

```bash
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
"
```

2. **优化server.py中的MongoDB连接**：添加了连接重试和错误处理机制。

### 3. 内存占用过高

#### 问题描述

AI绘画应用可能会占用大量内存，导致容器被OOM killer终止。

#### 解决方案

1. **设置内存限制**：在docker-compose.yml中添加了内存和CPU限制：

```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2'
```

2. **优化MongoDB内存使用**：添加了wiredTigerCacheSizeGB参数限制MongoDB的缓存大小：

```yaml
command: mongod --wiredTigerCacheSizeGB 1
```

3. **定期触发垃圾回收**：在server.py中添加了定期GC回收机制，减少内存占用：

```python
# 强制GC以回收资源
if queue_stats['total_processed'] % 10 == 0:
    gc.collect()
```

## 如何应用这些更改

### 如果你使用Docker Compose

1. 使用已优化的docker-compose.yml文件
2. 运行 `docker-compose down` 停止现有容器
3. 运行 `docker-compose up -d` 启动优化后的容器

### 如果你直接使用Docker命令

在Unraid Docker管理界面中，修改AI绘画容器的高级配置，添加以下配置：

1. **添加环境变量**：
   - `MAX_WORKER_THREADS=10`
   - `REQUEST_QUEUE_SIZE=100`

2. **增加Extra Parameters**：
   - `--ulimit nofile=65535:65535 --ulimit nproc=65535:65535`

3. **设置资源限制**：
   - 内存限制: 4G
   - CPU份额: 2

## 监控和诊断

你可以通过以下命令查看容器日志，监控应用状态：

```bash
docker logs ai_painting
```

如果你看到"队列处理线程启动"和"MongoDB连接成功"等消息，表明应用已经成功启动。

## 联系支持

如果你在应用这些解决方案后仍然遇到问题，请联系支持团队获取进一步帮助。 