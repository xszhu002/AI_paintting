@echo off
chcp 65001 > nul
echo 正在启动小朋友的AI绘画乐园服务...
echo.

REM 检查Python是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到Python安装，请安装Python 3.7或更高版本。
    goto :end
)

REM 安装必要的依赖
echo 正在安装必要的依赖...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [警告] 依赖安装过程中遇到问题，但将继续尝试启动服务。
)

REM 创建两个命令窗口，分别启动API服务器和HTTP服务器
echo 正在启动API服务器...
start "AI绘画乐园API服务器" cmd /k "python server.py"

REM 等待几秒钟，确保API服务器有时间启动
echo 等待API服务器启动...
timeout /t 5 >nul

REM 启动HTTP服务器
echo 正在启动HTTP服务器...
start "AI绘画乐园HTTP服务器" cmd /k "python -m http.server 8000"

echo.
echo 服务器启动中...
echo 1. API服务器正在运行于: http://172.16.201.200:8080
echo 2. 网页服务器正在运行于: http://172.16.201.200:8000
echo.
echo 请在浏览器中打开: http://172.16.201.200:8000
echo.
echo 若要停止服务器，请关闭已打开的命令窗口。
echo.

:end
pause 