#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
修复js文件中的硬编码URL
"""

import os
import re

def fix_file(filepath):
    """修复单个文件中的硬编码URL"""
    print(f"正在处理文件: {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 替换硬编码URL
    pattern = r'http://172\.16\.201\.200:8080'
    dynamic_url = '${serverUrl}'
    
    # 计算匹配的数量
    matches = re.findall(pattern, content)
    if not matches:
        print(f"  文件中未找到硬编码URL，跳过")
        return 0
    
    # 替换所有直接URL引用
    old_content = content
    new_content = re.sub(pattern, dynamic_url, content)
    
    # 在文件顶部添加serverUrl声明（如果不存在）
    server_url_var = "const serverUrl = window.artClient ? window.artClient.serverUrl : "
    server_url_var += "`http://${window.location.hostname}:8080`;"
    
    if "const serverUrl" not in new_content and "${serverUrl}" in new_content:
        # 在第一个非注释、非空行后插入变量声明
        lines = new_content.split('\n')
        insert_index = 0
        for i, line in enumerate(lines):
            if line.strip() and not line.strip().startswith('/*') and not line.strip().startswith('*') \
               and not line.strip().startswith('//'):
                insert_index = i + 1
                break
                
        lines.insert(insert_index, server_url_var)
        new_content = '\n'.join(lines)
    
    # 写入文件
    if old_content != new_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"  已修复 {len(matches)} 个硬编码URL")
        return len(matches)
    else:
        print(f"  文件内容未更改")
        return 0

def main():
    """主函数"""
    # 要处理的js文件列表
    js_files = [
        'js/client.js',
        'js/queue.js',
        'js/gallery.js',
        'js/main-queue.js',
        'js/sensitive-words.js',
    ]
    
    total_fixed = 0
    for js_file in js_files:
        if os.path.exists(js_file):
            fixed = fix_file(js_file)
            total_fixed += fixed
        else:
            print(f"文件不存在: {js_file}")
    
    print(f"\n总共修复了 {total_fixed} 个硬编码URL")

if __name__ == "__main__":
    main() 