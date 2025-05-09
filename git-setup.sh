#!/bin/bash

# AI绘画乐园 - Git初始化和推送脚本

echo "正在初始化Git仓库并推送到GitHub..."

# 检查Git是否已初始化
if [ -d .git ]; then
  echo "Git仓库已初始化"
else
  echo "初始化Git仓库"
  git init
fi

# 添加所有文件
echo "添加所有文件到Git"
git add .

# 提交更改
echo "提交更改"
git commit -m "初始提交：配置Docker和GitHub Actions"

# 检查远程仓库是否已配置
if git remote | grep -q "origin"; then
  echo "远程仓库已配置"
else
  echo "添加远程仓库"
  git remote add origin https://github.com/xszhu002/AI_paintting.git
fi

# 推送到GitHub
echo "推送到GitHub (master分支)"
git push -u origin master

echo "完成！"
echo "请确保在GitHub仓库中设置DOCKERHUB_USERNAME和DOCKERHUB_TOKEN密钥"
echo "详情请参考 GITHUB_ACTIONS_SETUP.md" 