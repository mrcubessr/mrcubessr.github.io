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

## 玻璃拟态主题

玻璃主题已经接入全站。**普通使用不需要来这个目录**：直接在站点任意页面点侧栏底部的「玻璃外观」即可（背景图 / 模糊 / 透明度 / 圆角 / UI 配色）。

这个目录只放开发期的验证页面：

- `glass-preview.html` — 纯材质调参台，不含面板逻辑。六个滑块实时写入 `--g-*`，可切明度与 6 套配色；用来单独试材质，不受用户设置影响。
- `glass-shots/` — 深色、浅色、侧栏、面板、计时器、弹窗、投屏关闭 对照图，供 `docs/glass-theme-design.md` 引用。

实现文件：

| 文件 | 说明 |
|---|---|
| `assets/css/glass.css` | 材质层 + 入口按钮样式（每页 `<head>` 引入） |
| `assets/css/glass-ui.css` | 设置面板外观（第一次打开面板时按需加载） |
| `assets/js/glass-theme.js` | 引擎：状态 / 应用 / 面板 / 图片压缩 / 亮度适配 |
| `docs/glass-theme-design.md` | 设计方案与使用说明（含调参表、降级策略） |

调试入口：`?glass=off` 临时关掉玻璃，`?glassui=1` 直接打开面板。

