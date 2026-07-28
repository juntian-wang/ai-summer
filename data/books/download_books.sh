#!/bin/bash
# 书籍下载脚本 - 手动运行以下命令

BOOK_DIR="/Users/Andy/Desktop/AI的夏天/data/books"
mkdir -p "$BOOK_DIR"

# 1. 熊浩的冲突解决课 - Internet Archive
echo "=== 下载: 熊浩的冲突解决课 ==="
curl -sL -o "$BOOK_DIR/熊浩的冲突解决课.pdf" \
  "https://archive.org/download/xionghaodechongt0000xion/xionghaodechongt0000xion.pdf" \
  --max-time 120 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
file "$BOOK_DIR/熊浩的冲突解决课.pdf"

# 2. 思辨力35讲 - Z-Library (IPFS方式可能需要手动)
# 百度网盘链接: https://pan.baidu.com/s/1e7Igx8_Auh0MV2D52Udg0Q?pwd=7va2
# 另一种方式: 通过jczhijia.com

# 3. 无效焦虑诊断指南
# 百度网盘: https://pan.baidu.com/s/1AHx260mRte430AmwjmQxlg?pwd=d509
# 或掌阅阅读: https://m.zhangyue.com/readbook/12810961/1.html

# 4. 权力之路 - kb199.com (需要浏览器手动下载)
echo "=== 下载: 权力之路 ==="
# kb199.com需要手动点开下载链接

echo "=== 完成 ==="
ls -la "$BOOK_DIR"
