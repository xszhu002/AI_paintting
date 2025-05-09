@echo off
chcp 65001 > nul
echo 正在准备AI绘画乐园项目部署...
echo.

REM 检查Git是否安装
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Git安装，请安装Git后再试。
    goto :end
)

REM 检查Docker是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Docker安装，请安装Docker后再试。
    goto :end
)

echo 1. 初始化Git仓库
git init
if %errorlevel% neq 0 (
    echo [错误] Git初始化失败。
    goto :end
)

echo 2. 添加所有文件到Git
git add .
if %errorlevel% neq 0 (
    echo [错误] 添加文件失败。
    goto :end
)

echo 3. 创建初始提交
git commit -m "初始提交"
if %errorlevel% neq 0 (
    echo [错误] 创建提交失败。
    goto :end
)

echo 4. 添加远程仓库
git remote add origin https://github.com/xszhu002/AI_paintting.git
if %errorlevel% neq 0 (
    echo [警告] 添加远程仓库失败，可能已存在。
)

echo 5. 构建Docker镜像
docker build -t xszhu002/ai_paintting:latest .
if %errorlevel% neq 0 (
    echo [错误] 构建Docker镜像失败。
    goto :end
)

echo 6. 推送到Docker Hub
echo 请先登录Docker Hub:
docker login
if %errorlevel% neq 0 (
    echo [错误] Docker Hub登录失败。
    goto :end
)

docker push xszhu002/ai_paintting:latest
if %errorlevel% neq 0 (
    echo [错误] 推送Docker镜像失败。
    goto :end
)

echo 7. 推送到GitHub
git push -u origin master
if %errorlevel% neq 0 (
    echo [警告] 推送到GitHub失败，请检查权限和网络连接。
)

echo.
echo 部署准备完成！
echo 您可以使用以下命令启动服务:
echo docker-compose up -d
echo.

:end
pause 