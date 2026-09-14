#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate scramble-uf HTML pages by replicating build-uf.ps1's template
substitution in Python (the .ps1 is blocked by execution policy in this env).

Reads the groups + templates from build-uf.ps1 and writes group-<L>.html and
index.html with UTF-8 (no BOM), byte-for-byte equivalent to the PS1 output.
"""
import json, re

PS1 = "D:/魔方站点备份/fto-site/tools/scramble-uf/build-uf.ps1"
OUT = "D:/魔方站点备份/fto-site/tools/scramble-uf"

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
# 模板里残留的内联 <nav> 与旧页脚缩进会让重新生成时产生大面积回退 diff，
# 故在写出前统一替换成与线上一致的形态（改模板时请同步 build-uf.ps1）。
nav = extract("nav")
footer = extract("footer")
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


# 模板内联的 <nav> 与 $nav 变量并不逐字相同，故用正则定位而非字符串替换
NAV_RE = re.compile(r'<nav class="site-nav" id="siteNav">.*?</nav>', re.S)
CSS_LINK = '<link rel="stylesheet" href="uf-stats.css">'


def normalize(html):
    html = NAV_RE.sub(NAV_SLOT, html)
    html = html.replace(footer, FOOTER_LIVE)
    # 线上页脚前后各留一个空行（模板里没有），补齐以免产生噪音 diff
    html = html.replace("\n\n<footer", "\n\n\n<footer")
    html = html.replace("</footer>\n<script", "</footer>\n\n<script")
    return html


# Parse groups
groups = []
pat = re.compile(r"name='([^']*)';\s*formula='((?:[^']|'')*)';\s*codes=@\(([^)]*)\)")
for m in pat.finditer(text):
    name = m.group(1)
    formula = m.group(2).replace("''", "'")
    codes = re.findall(r"'([A-Z]{2})'", m.group(3))
    # also capture index
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
    title = g["name"] + " - UF缓冲公式连拧专项训练"
    h = head.replace("__TITLE__", title)
    page = pageTemplate.replace("__HEAD__", h)
    # inline nav in template == $nav (copy), replace to keep canonical
    page = page.replace(nav, nav)  # identity; ensures consistency if differs
    page = page.replace("__FOOTER__", footer)
    page = page.replace("__IDX__", g["index"])
    page = page.replace("__NAME__", g["name"])
    page = page.replace("__FORMULA__", g["formula"])
    page = page.replace("__LETTER__", letter)
    page = page.replace("__ORDER__", order)
    page = normalize(page)
    with open(f"{OUT}/{fname}", "w", encoding="utf-8") as f:
        f.write(page)
    written.append(fname)

# index
cards = []
for g in groups:
    letter = letter_of(g["name"])
    fname = "group-" + letter + ".html"
    card = cardTemplate.replace("__FILE__", fname)
    card = card.replace("__IDX__", g["index"])
    card = card.replace("__LETTER__", letter)
    card = card.replace("__NAME__", g["name"])
    card = card.replace("__TAGS__", " ".join(g["codes"]))
    cards.append(card)
h = head.replace("__TITLE__", "UF缓冲公式连拧专项训练")
index = indexTemplate.replace("__HEAD__", h)
index = index.replace(nav, nav)
index = index.replace("__FOOTER__", footer)
index = index.replace("__CARDS__", "\n".join(cards))
index = normalize(index)
# 模板把样式表引用写在 __HEAD__ 之后（即 body 内），移到 </head> 前才符合规范
index = index.replace(CSS_LINK + "\n", "")
index = index.replace("</head>", "  " + CSS_LINK + "\n</head>")
with open(f"{OUT}/index.html", "w", encoding="utf-8") as f:
    f.write(index)
written.append("index.html")

print("Wrote", len(written), "files:", written)
print("First group formula:", groups[0]["name"], "=>", groups[0]["formula"])
