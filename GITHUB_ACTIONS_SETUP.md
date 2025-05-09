# GitHub Actions 自动构建Docker镜像指南

本项目使用GitHub Actions自动构建Docker镜像并推送到GitHub Container Registry (GHCR)。

## 设置步骤

### 1. 在GitHub上创建仓库

1. 登录GitHub，创建一个新仓库 `xszhu002/AI_paintting`
2. 将本地代码推送到该仓库

### 2. 使用GitHub Token访问GitHub Container Registry

GitHub Actions已经预配置为使用GitHub自动生成的`GITHUB_TOKEN`访问GitHub Container Registry，无需额外设置任何密钥。GitHub自动为每个Actions工作流程创建这个临时令牌。

### 3. 确保镜像仓库可见性设置

1. 完成首次推送镜像后，前往GitHub Container Registry
2. 找到 `ghcr.io/xszhu002/ai_paintting` 包
3. 如需要，点击 "Package Settings" 并调整可见性设置 (默认与仓库相同)

### 4. 推送代码触发构建

现在，每当你推送代码到main或master分支时，GitHub Actions会自动构建Docker镜像并推送到GitHub Container Registry。

```bash
# 初始化Git仓库（如果尚未初始化）
git init

# 添加远程仓库
git remote add origin https://github.com/xszhu002/AI_paintting.git

# 添加所有文件
git add .

# 提交更改
git commit -m "初始提交"

# 推送到GitHub
git push -u origin master
```

### 5. 手动触发构建

你也可以手动触发构建流程：

1. 在GitHub上打开你的仓库
2. 点击 "Actions" 选项卡
3. 在左侧选择 "Build and Push Docker Image" 工作流
4. 点击 "Run workflow" 按钮
5. 选择分支，然后点击 "Run workflow"

## 验证构建结果

构建完成后，你可以在GitHub Container Registry上查看新推送的镜像：

1. 前往你的GitHub仓库
2. 点击"Packages"选项卡
3. 查看 `ai_paintting` 包

或直接访问：
```
https://github.com/xszhu002/AI_paintting/pkgs/container/ai_paintting
```

## 使用Docker镜像

要从GitHub Container Registry拉取镜像：

```bash
docker pull ghcr.io/xszhu002/ai_paintting:latest
```

如果是私有镜像，需要先登录：

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker pull ghcr.io/xszhu002/ai_paintting:latest
```
