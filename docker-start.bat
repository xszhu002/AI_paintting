@echo off
chcp 65001 > nul
echo 正在启动AI绘画乐园Docker服务...
echo.

REM 检查Docker是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Docker安装，请安装Docker后再试。
    goto :end
)

REM 检查Docker Compose是否安装
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Docker Compose安装，请安装Docker Compose后再试。
    goto :end
)

echo 正在启动服务...
docker-compose up -d
if %errorlevel% neq 0 (
    echo [错误] 启动服务失败。
    goto :end
)

echo.
echo 服务已成功启动！
echo 请在浏览器中访问: http://localhost:8000
echo.
echo 要查看日志，请运行: docker-compose logs -f
echo 要停止服务，请运行: docker-compose down
echo.

start http://localhost:8000

:end
pause 