# RAZ AA 卡组配图管线（更新计划方案）

> 目标：把 `E:\01.RAZ绘本PDF点读版\AA.PDF` 下全部 RAZ AA 点读 PDF 的实拍配图，
> **一条命令全自动**提取并回填进网站 SRS 卡组（`tools/srs/`），可复现、可持续更新。

## 核心技术决策：为什么用 OCR 而不是人工识词
- 这些 PDF 是**扫描图**（已验证：0/11 页有文字层），"哪一页是哪个词"无法直接读取。
- 早期方案靠人工看拼图逐本标注，49 本耗时巨大且不可复现。
- 最终采用 **RapidOCR**（纯 pip 的 ONNX OCR，无需系统依赖/联网），对每页渲染图做文字识别：
  - 每页都印着该页英文句子（如 `The dog.` / `Four buses.`）；
  - OCR 取出句子 → 剔除页脚噪声 → 取**核心名词**（跳过冠词与句首数词）；
  - 命中卡组词表即配图。
- 验证：`Farm Animals` / `It is Fall` / `Four` / `My Family` 4 本人工逐页对照，识别全对。

## 目录结构（已归档进本仓库，可随站持续更新）
```
tools/srs/
├─ data/
│  ├─ raz-aa.js              # 卡组数据（en/zh/theme/emoji/img），脚本回填
│  └─ img/                   # 提取的配图（600px JPEG）
└─ scripts/raz-pipeline/
   ├─ ocr_build_catalog.py   # ① 全量 OCR 全部 PDF -> 书目->每页词 catalog（自动识词）
   ├─ build_raz_deck.py      # ② 读 catalog + 抽页图 + 压缩 + 回填 raz-aa.js
   ├─ render_book.py         # 辅助：把某本 PDF 渲染成拼图，人工核对/修正用
   ├─ raz_book_catalog.json  # ③ 对照表（可手工修正，OCR 产物）
   ├─ verify_review.mjs      # ④ 真实浏览器端到端回归验证（无头 Chrome）
   └─ README.md              # 本文件
```

## 标准更新流程（一条命令）
```bash
cd tools/srs/scripts/raz-pipeline

# 全量：OCR 全部 PDF -> catalog -> 抽图 -> 回填（幂等，已配图的词会跳过）
python ocr_build_catalog.py
python build_raz_deck.py

# 只处理新加的书（--merge 保留 catalog 里已有的书）
python ocr_build_catalog.py --books "Water" "Winter" --merge
python build_raz_deck.py
```
- `build_raz_deck.py --dry-run` 只打印计划、不写文件。
- **幂等**：词已有 `img` 就跳过，重跑安全，不破坏用户浏览器里的学习进度。
- 运行环境（默认 venv，已装 pymupdf / pillow / rapidocr-onnxruntime）：
  `C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe`

## 人工修正入口（OCR 偶尔会错）
- 拼图核对：`python render_book.py "书名"` 生成拼图，肉眼看每页词。
- 直接改 `raz_book_catalog.json` 里对应 `{"w":"词","p":页码}`，再重跑 `build_raz_deck.py`。
- 若某词被 OCR 认错导致配了错图：先从 `raz-aa.js` 里删掉该词的 `img:`，再修正 catalog 重跑。

## 上线（提交 + GitHub Pages）
```bash
cd 仓库根
git add tools/srs/data tools/srs/scripts/raz-pipeline/raz_book_catalog.json
git commit -m "chore(raz): 配图更新 +N 本"
HTTP_PROXY= HTTPS_PROXY= git push origin main   # 清代理直连
```
GitHub Pages 约 1 分钟重建即生效。

## 上线后自检（强烈建议）
数据对 ≠ 界面对。**配图/交互类的问题只看数据或 curl 抓不到**，必须真跑浏览器：

```bash
cd tools/srs/scripts/raz-pipeline
node verify_review.mjs            # 需要 Node >= 22，用系统 Chrome（可用 CHROME_PATH 指定）
```

它用无头 Chrome 真走一遍：建卡 → 进 RAZ 复习页 → 断言**配图高度 > 0 且图片真的加载成功**
→ 空格翻面（断言答案区有英文、不重复图）→ 空格评分走完一轮
→ 断言完成页把旧卡片/评分条都藏干净 → 点「全部重新学一遍」→ 断言回到题面。
截图默认落在临时目录（`--out` 可指定）。

> 已踩过的坑（都在这里被拦住）：
> 1. `review.html` 漏引 `data/raz-aa.js` → 复习页所有卡都没有图；
> 2. `el.style.display = ''` 会**清掉行内样式**、回落到 `srs.css` 的 `.srs-quiz__pic{display:none}` →
>    图片和 emoji 全部不可见（换电脑/清缓存一样）；
> 3. `.srs-quiz{display:flex}` 这类作者样式**会覆盖 `hidden` 属性** → 完成页旧卡片藏不掉。
>    已在 srs.css 用全局 `[hidden]{display:none!important}` 兜底。

## 注意事项
- RAZ 原图版权归 Learning A-Z，**仅供自家娃个人学习**；商用/教具产品须换自有或授权素材。
- 首图优先（first-wins）：同一词在多本出现时，取 catalog 中先出现的那本。
- `montages/` 目录是人工核对用的中间产物，不必提交（可加 .gitignore）。
