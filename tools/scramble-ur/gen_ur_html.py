#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate scramble-ur HTML pages (UR 组练习页 + 总览页).

Mirrors tools/scramble-uf/gen_html_py.py: the .ps1 generator is blocked by
execution policy in this env, so templates are extracted from build-groups.ps1
and re-applied in Python. Writes UTF-8 (no BOM).

组页与线上一致地剥离 ur-stats.css（看板样式仅 index 需要，$head 模板里带的
ur-stats.css 引用会在组页产生与线上不同的多余 <link>）。
"""
import json, re

PS1 = "D:/魔方站点备份/fto-site/tools/scramble-ur/build-groups.ps1"
OUT = "D:/魔方站点备份/fto-site/tools/scramble-ur"

text = open(PS1, encoding="utf-8-sig").read()

def extract(var):
    m = re.search(r"\$" + var + r"\s*=\s*@'(.*?)'@", text, re.DOTALL)
    if not m:
        raise SystemExit(f"template {var} not found")
    return m.group(1)

head = extract("head")
nav = extract("nav")
footer = extract("footer")
pageTemplate = extract("pageTemplate")
indexTemplate = extract("indexTemplate")
cardTemplate = extract("cardTemplate")

# 规范化：线上页面已改为 site-nav.js 动态注入导航，页脚也统一为缩进版。
# （与 gen_html_py.py 相同的归一化规则，改模板时请同步 build-groups.ps1）
NAV_SLOT = (
    '<div data-site-nav></div>\n'
    '<noscript><a href="/" style="display:block;padding:12px 20px">← 返回首页</a></noscript>'
)
FOOTER_LIVE = (
    '<footer class="site-footer">\n'
    '      <p class="site-footer__title">魔方先生SSR魔方训练中心</p>\n'
    '      <p class="site-footer__meta">制作人：B站博主：魔方先生SSR　WCAID : 2009ZHAN24　抖音ID : 魔方总动员</p>\n'
    '    </footer>'
)

NAV_RE = re.compile(r'<nav class="site-nav" id="siteNav">.*?</nav>', re.S)
UR_STATS_LINK = '<link rel="stylesheet" href="ur-stats.css">'


def normalize(html):
    html = NAV_RE.sub(NAV_SLOT, html)
    html = html.replace(footer, FOOTER_LIVE)
    # 线上页脚前后各留一个空行（模板里没有），补齐以免产生噪音 diff
    html = html.replace("\n\n<footer", "\n\n\n<footer")
    html = html.replace("</footer>\n<script", "</footer>\n\n<script")
    return html


# Parse groups（与 build-uf.ps1 同一数据格式）
groups = []
pat = re.compile(r"name='([^']*)';\s*formula='((?:[^']|'')*)';\s*codes=@\(([^)]*)\)")
for m in pat.finditer(text):
    name = m.group(1)
    formula = m.group(2).replace("''", "'")
    codes = re.findall(r"'([A-Z]{2})'", m.group(3))
    idxm = re.search(r"index='(\d+)';\s*name='" + re.escape(name) + r"'", text)
    index = idxm.group(1) if idxm else str(len(groups) + 1)
    groups.append({"index": index, "name": name, "formula": formula, "codes": codes})

def letter_of(name):
    return re.sub(r"^([A-Z]+)组.*$", r"\1", name)

def new_group_order(codes):
    parts = []
    for i, c in enumerate(codes):
        if i > 0:
            parts.append('<span class="arrow">→</span>')
        cls = "order-tag current" if i == 0 else "order-tag"
        parts.append('<span class="' + cls + '">' + c + "</span>")
    return ("\n          ").join(parts)

written = []
for g in groups:
    letter = letter_of(g["name"])
    fname = "group-" + letter + ".html"
    order = new_group_order(g["codes"])
    title = g["name"] + " - UR缓冲公式连拧专项训练"
    h = head.replace("__TITLE__", title)
    page = pageTemplate.replace("__HEAD__", h)
    page = page.replace("__FOOTER__", footer)
    page = page.replace("__IDX__", g["index"])
    page = page.replace("__NAME__", g["name"])
    page = page.replace("__FORMULA__", g["formula"])
    page = page.replace("__LETTER__", letter)
    page = page.replace("__ORDER__", order)
    page = normalize(page)
    # 组页剥离 ur-stats.css（看板样式，仅 index 需要；与线上组页保持一致）
    page = page.replace(UR_STATS_LINK + "\n", "")
    with open(f"{OUT}/{fname}", "w", encoding="utf-8") as f:
        f.write(page)
    written.append(fname)

# index（注意：UR 总览页 index.html 按线上文件手工维护——线上版含 BOM 与手工排版
# （卡片间无空行），重生成只会产生纯空白噪音 diff（内容一致），故本生成器不写 index。
# 若确需重建 index，请临时恢复下面的写入逻辑并人工核对空白差异。）
# cards = []
# for g in groups:
#     ...（原 index 写入逻辑已移除，模板 $indexTemplate 仍保留在 build-groups.ps1 中）
print("Skipped index.html (maintained manually; template kept in build-groups.ps1)")

print("Wrote", len(written), "files:", written)
print("First group formula:", groups[0]["name"], "=>", groups[0]["formula"])
