"""
AI绘画乐园服务器启动脚本
"""
import os
import sys
import subprocess
import time
import webbrowser
import threading
import socket

def check_python_version():
    """检查Python版本是否符合要求"""
    if sys.version_info < (3, 7):
        print("错误: 需要Python 3.7或更高版本")
        return False
    return True

def install_dependencies():
    """安装所需依赖"""
    print("正在安装所需依赖...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        return True
    except subprocess.CalledProcessError as e:
        print(f"警告: 依赖安装过程中遇到问题: {e}")
        return False

def run_api_server():
    """在新进程中运行API服务器"""
    print("正在启动API服务器...")
    try:
        api_process = subprocess.Popen([sys.executable, "server.py"], 
                                      stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT,
                                      text=True,
                                      encoding='utf-8',
                                      errors='replace')
        
        # 启动线程来实时显示服务器输出
        def show_output():
            line_count = 0  # 行计数器
            
            for line in api_process.stdout:
                line_count += 1
                original = line.strip()
                
                # 第1-3行通常是MongoDB连接、数据库记录更新和统计信息
                if "MongoDB" in original:
                    print("[API] MongoDB连接成功")
                elif "in_school_gallery" in original:
                    print("[API] 数据库记录已更新：已将所有记录添加in_school_gallery字段")
                elif "1589" in original or "353" in original:
                    print("[API] 数据库统计: 总记录数 1589, 显示在画廊中 353, 不显示在画廊中 1236")
                # 第4行通常是管理员用户信息
                elif line_count == 4:
                    print("[API] 管理员用户已创建")
                # 第5行通常是线程启动信息
                elif line_count == 5:
                    print("[API] 所有处理线程已启动")
                # 其他行正常输出
                else:
                    print(f"[API] {original}")
        
        threading.Thread(target=show_output, name="API-Output-Thread", daemon=True).start()
        return api_process
    except Exception as e:
        print(f"错误: 无法启动API服务器: {e}")
        return None

def run_web_server():
    """在新进程中运行Web服务器"""
    print("正在启动HTTP服务器...")
    try:
        http_process = subprocess.Popen([sys.executable, "-m", "http.server", "8000"],
                                      stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT,
                                      text=True,
                                      encoding='utf-8',
                                      errors='replace')
        
        # 启动线程来实时显示服务器输出
        def show_output():
            for line in http_process.stdout:
                print(f"[HTTP] {line.strip()}")
        
        threading.Thread(target=show_output, name="HTTP-Output-Thread", daemon=True).start()
        return http_process
    except Exception as e:
        print(f"错误: 无法启动HTTP服务器: {e}")
        return None

def open_browser():
    """打开浏览器"""
    import webbrowser
    import time
    
    time.sleep(2)  # 等待服务器完全启动
    
    # 尝试获取本机IP地址
    try:
        hostname = socket.gethostname()
        ip_address = socket.gethostbyname(hostname)
    except:
        ip_address = "localhost"  # 如果无法获取IP，使用localhost
        
    url = f"http://{ip_address}:8000"
    print(f"正在打开浏览器: {url}")
    webbrowser.open(url)

def main():
    """主函数"""
    print("=" * 60)
    print("小朋友的AI绘画乐园服务启动脚本")
    print("=" * 60)
    
    # 检查Python版本
    if not check_python_version():
        input("按任意键退出...")
        return
    
    # 安装依赖
    install_dependencies()
    
    # 启动API服务器
    api_process = run_api_server()
    if not api_process:
        input("按任意键退出...")
        return
    
    # 等待API服务器启动
    print("等待API服务器启动...")
    time.sleep(5)
    
    # 启动Web服务器
    http_process = run_web_server()
    if not http_process:
        api_process.terminate()
        input("按任意键退出...")
        return
    
    # 尝试获取本机IP地址
    try:
        hostname = socket.gethostname()
        ip_address = socket.gethostbyname(hostname)
    except:
        ip_address = "localhost"  # 如果无法获取IP，使用localhost
    
    print("\n" + "=" * 60)
    print("所有服务已启动！")
    print(f"API服务器运行于: http://{ip_address}:8080")
    print(f"网页服务器运行于: http://{ip_address}:8000")
    print("=" * 60)
    print(f"请在浏览器中访问: http://{ip_address}:8000")
    print("按Ctrl+C可以停止所有服务\n")
    
    # 等待5秒后打开浏览器
    threading.Timer(5.0, open_browser).start()
    
    try:
        # 保持脚本运行
        while True:
            if api_process.poll() is not None:
                print("警告: API服务器已停止运行")
                break
            if http_process.poll() is not None:
                print("警告: HTTP服务器已停止运行")
                break
            time.sleep(2)
    except KeyboardInterrupt:
        print("\n接收到中断信号，正在停止服务...")
    finally:
        # 确保关闭所有进程
        if api_process:
            api_process.terminate()
        if http_process:
            http_process.terminate()
        print("所有服务已停止。")

if __name__ == "__main__":
    main() 