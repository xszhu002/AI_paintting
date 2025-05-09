# GitHub Actions 自动构建Docker镜像指南

本项目使用GitHub Actions自动构建Docker镜像并推送到Docker Hub。

## 设置步骤

### 1. 在GitHub上创建仓库

1. 登录GitHub，创建一个新仓库 `xszhu002/AI_paintting`
2. 将本地代码推送到该仓库

### 2. 设置Docker Hub访问令牌

1. 登录Docker Hub
2. 点击右上角的用户名，选择 "Account Settings"
3. 在左侧菜单中选择 "Security"
4. 点击 "New Access Token"
5. 输入一个描述性名称，如 "GitHub Actions"
6. 选择适当的权限（至少需要 "Read & Write" 权限）
7. 点击 "Generate"，并保存生成的令牌（这是唯一一次能看到完整令牌的机会）

### 3. 在GitHub仓库中设置Secrets

1. 在GitHub上打开你的仓库
2. 点击 "Settings" 选项卡
3. 在左侧菜单中选择 "Secrets and variables" -> "Actions"
4. 点击 "New repository secret"
5. 添加以下两个secrets:
   - 名称: `DOCKERHUB_USERNAME`，值: 你的Docker Hub用户名
   - 名称: `DOCKERHUB_TOKEN`，值: 在步骤2中生成的访问令牌

### 4. 推送代码触发构建

现在，每当你推送代码到main或master分支时，GitHub Actions会自动构建Docker镜像并推送到Docker Hub。

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

构建完成后，你可以在Docker Hub上查看新推送的镜像：

```
https://hub.docker.com/r/xszhu002/ai_paintting/tags
``` 