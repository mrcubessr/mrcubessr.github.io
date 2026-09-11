# _design 目录

存放站点设计令牌与样式的验证页面。

## 本地预览

由于页面使用了根绝对路径（`/assets/...`），必须通过 HTTP 服务器访问，不能直接双击文件。

```bash
# 在站点根目录（仓库根，与 index.html 同级）执行
python -m http.server 8080

# 浏览器打开
# http://localhost:8080/_design/tokens-preview.html
```
