@echo off
chcp 65001 > nul
echo 正在初始化Git仓库并推送到GitHub...
echo.

REM 检查Git是否已初始化
if exist .git\ (
    echo Git仓库已初始化
) else (
    echo 初始化Git仓库
    git init
)

REM 添加所有文件
echo 添加所有文件到Git
git add .

REM 提交更改
echo 提交更改
git commit -m "初始提交：配置Docker和GitHub Actions"

REM 检查远程仓库是否已配置
git remote | findstr "origin" > nul
if %errorlevel% equ 0 (
    echo 远程仓库已配置
) else (
    echo 添加远程仓库
    git remote add origin https://github.com/xszhu002/AI_paintting.git
)

REM 推送到GitHub
echo 推送到GitHub (master分支)
git push -u origin master

echo.
echo 完成！
echo 代码已推送到GitHub，GitHub Actions将自动构建Docker镜像并推送到GitHub Container Registry
echo 完成后，你可以在GitHub仓库的Packages选项卡查看Docker镜像
echo 详情请参考 GITHUB_ACTIONS_SETUP.md
echo.

pause 