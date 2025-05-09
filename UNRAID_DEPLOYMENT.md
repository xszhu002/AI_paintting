# AI绘画乐园 - Unraid部署指南

本指南将帮助你在Unraid上部署AI绘画乐园应用，并连接到已有的MongoDB服务。

## 前提条件

1. Unraid服务器已安装并正常运行
2. Docker已在Unraid上启用
3. MongoDB已在Unraid上部署并运行

## 构建Docker镜像

有两种方式可以获取Docker镜像：

### 方法1：使用GitHub Actions自动构建（推荐）

本项目已配置GitHub Actions自动构建流程，每当代码推送到GitHub仓库时，会自动构建Docker镜像并推送到GitHub Container Registry (GHCR)。

详细设置步骤请参考 [GitHub Actions 自动构建Docker镜像指南](GITHUB_ACTIONS_SETUP.md)。

### 方法2：手动构建

如果你想手动构建Docker镜像，可以按照以下步骤操作：

```bash
# 克隆仓库
git clone https://github.com/xszhu002/AI_paintting.git
cd AI_paintting

# 构建Docker镜像
docker build -t ghcr.io/xszhu002/ai_paintting:latest .

# 推送到GitHub Container Registry（需要先登录）
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker push ghcr.io/xszhu002/ai_paintting:latest
```

## 部署步骤

### 1. 准备环境变量

在部署AI绘画乐园Docker容器时，需要设置以下环境变量：

- `MONGO_HOST`: MongoDB服务器主机名或IP地址
- `MONGO_PORT`: MongoDB服务器端口，默认为`27017`
- `HOST`: API服务器绑定地址，设置为`0.0.0.0`
- `PORT`: API服务器端口，默认为`8080`
- `HOST_URL`: 访问地址，设置为Unraid服务器的IP或域名
- `HTTP_PORT`: HTTP服务器端口，默认为`8000`

### 2. 在Unraid上部署Docker容器

#### 方法1：使用GitHub Container Registry镜像

1. 在Unraid管理界面中，点击"Docker"选项卡
2. 点击"Add Container"按钮
3. 填写以下信息：
   - Name: `ai_painting`
   - Repository: `ghcr.io/xszhu002/ai_paintting:latest`
   - Network Type: `Bridge`
   - 端口映射:
     - 容器端口: `8080` -> 主机端口: `8080`
     - 容器端口: `8000` -> 主机端口: `8000`
   - 环境变量:
     - `MONGO_HOST`: `[你的MongoDB容器名称或IP]`
     - `MONGO_PORT`: `27017`
     - `HOST`: `0.0.0.0`
     - `PORT`: `8080`
     - `HOST_URL`: `[你的Unraid服务器IP或域名]`
     - `HTTP_PORT`: `8000`
4. 点击"Apply"按钮创建容器

#### 方法2：使用Docker Compose模板

如果你在Unraid上使用Docker Compose插件，可以使用以下模板：

```yaml
version: '3'

services:
  ai_painting:
    image: ghcr.io/xszhu002/ai_paintting:latest
    ports:
      - "8080:8080"
      - "8000:8000"
    environment:
      - MONGO_HOST=[你的MongoDB容器名称或IP]
      - MONGO_PORT=27017
      - HOST=0.0.0.0
      - PORT=8080
      - HOST_URL=[你的Unraid服务器IP或域名]
      - HTTP_PORT=8000
    restart: always
```

### 3. 验证部署

1. 容器启动后，在浏览器中访问 `http://[你的Unraid服务器IP]:8000`
2. 如果一切正常，你应该能看到AI绘画乐园的界面

## 故障排除

### MongoDB连接问题

如果应用无法连接到MongoDB，请检查：

1. MongoDB容器是否正常运行
2. MONGO_HOST环境变量是否正确设置
3. MongoDB是否允许外部连接
4. 网络设置是否正确

可以通过查看AI绘画容器的日志来诊断问题：

```bash
docker logs ai_painting
```

### 镜像拉取问题

如果无法拉取GitHub Container Registry的镜像，可能需要先登录：

```bash
# 在Unraid终端中执行
docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_GITHUB_TOKEN
```

### 端口冲突

如果8080或8000端口已被其他服务占用，请修改端口映射：

1. 停止AI绘画容器
2. 修改端口映射，例如 8081:8080 和 8001:8000
3. 更新环境变量 API_PORT=8081 和 HTTP_PORT=8001
4. 重启容器

## 更新应用

当有新版本发布时，可以按以下步骤更新：

1. 在Unraid管理界面中，停止AI绘画容器
2. 点击"Remove"按钮删除容器（不会删除数据）
3. 点击"Add Container"按钮，使用相同的设置重新创建容器
4. 新容器将自动拉取最新的镜像并启动 