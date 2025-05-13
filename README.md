# 小朋友的AI绘画乐园 - 服务器队列版

这个项目是"小朋友的AI绘画乐园"的增强版，添加了服务器端队列系统，以便在多用户同时访问时管理图像生成请求。

## 功能特点

- 通过Python Flask服务器管理图像生成请求队列
- 每5秒处理一个请求，避免API过载
- 用户可以看到自己在队列中的位置和前面有多少人
- 完全兼容原始的UI界面和功能
- 支持所有原始项目中的提示词、风格选择和比例调整功能

## 系统要求

- Python 3.7+
- 现代网页浏览器（Chrome, Firefox, Edge等）

## 安装步骤

### 快速开始

1. 克隆本仓库
2. 安装Python 3.8+
3. 运行 `python run_server.py` 或者双击 `start.bat`
4. 在浏览器中访问 `http://172.16.201.200:8000`

### 使用方法（Windows）

1. 确保已安装最新版本的Python
2. 下载并解压项目文件
3. 双击 `start.bat` 启动服务
4. 等待依赖安装完成和服务启动
5. 在浏览器中访问 `http://172.16.201.200:8000`

### 手动安装与启动

1. 克隆或下载本项目代码

2. 安装Python依赖:
```bash
pip install -r requirements.txt
```

3. 启动API服务器:
```bash
python server.py
```

4. 在另一个命令行窗口中，启动HTTP服务器:
```bash
python -m http.server 8000
```

5. 在浏览器中访问 `http://localhost:8000`

## 故障排除

如果遇到问题，请尝试以下步骤：

1. **确认Python版本**：本项目需要Python 3.7或更高版本
   ```bash
   python --version
   ```

2. **检查依赖安装**：确保所有依赖已正确安装
   ```bash
   pip install -r requirements.txt
   ```

3. **端口冲突**：如果8080或8000端口被占用，请修改对应端口
   - 在`server.py`中修改`app.run(host='0.0.0.0', port=8080, debug=False)`
   - 在`js/client.js`和`js/queue.js`中修改服务器URL
   - 使用不同端口启动HTTP服务器`python -m http.server <端口号>`

4. **检查日志**：查看命令行输出，寻找可能的错误信息

5. **重启服务**：有时候简单地重启服务器可以解决问题

## 使用说明

1. 在"画什么呢"框中输入想要生成的画作描述
2. 选择画作比例和绘画风格
3. 点击"开始画画!"按钮
4. 系统会将请求加入队列，并显示你在队列中的位置
5. 当轮到你的请求时，系统会自动生成图像并显示
6. 生成的图像会自动保存到"我的画廊"中

## 技术架构

### 服务器端 (Python)
- Flask 框架提供RESTful API
- 使用线程安全队列管理请求
- 每5秒处理一个请求
- 通过轮询API提供实时队列状态更新

### 客户端 (JavaScript)
- 使用ArtServerClient类封装与服务器的通信
- queue.js 管理队列状态显示和请求处理
- main-queue.js 覆盖原有的图像生成函数，改为使用队列系统

## 项目文件结构

```
├── server.py          # 服务器端代码，处理请求队列
├── requirements.txt   # Python依赖文件
├── start.bat          # Windows一键启动脚本
├── index.html         # 主页面HTML
├── css/
│   ├── style.css      # 主样式表
│   └── queue.css      # 队列显示样式
├── js/
│   ├── client.js      # 服务器通信客户端
│   ├── queue.js       # 队列管理和显示
│   ├── main.js        # 原始主要功能
│   ├── main-queue.js  # 队列版功能覆盖
│   ├── gallery.js     # 画廊功能
│   └── stickers.js    # 贴纸功能
└── README.md          # 项目说明文档
```

## 注意事项

- 本系统仍然使用Pollinations.ai的图像生成API
- 确保网络连接稳定，以便服务器可以访问Pollinations.ai
- 学校或教育环境中使用前，建议进行负载测试

## 许可协议

MIT License 




现在，我已经成功地实现了第五阶段中的作品审核流程，包括：
修改了后端API，添加了用于作品审核的几个端点，包括：
/api/admin/pending_artworks：获取待审核作品列表
/api/admin/approve_artwork：审核单个作品
/api/admin/batch_approve：批量审核作品
/api/admin/artwork_stats：获取审核统计数据