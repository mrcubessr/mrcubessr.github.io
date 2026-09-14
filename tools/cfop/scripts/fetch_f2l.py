#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F2L 抓取（修正版）。

发现：speedcubedb 的 /a/3x3/F2L/F2L_1 子页实际包含全部 41 个 F2L case，
每个 case 是一个 <div class="row singlealgorithm" data-alg="F2L N" data-subgroup="...">
块，内含 4 个朝向 <ul class="list-group" data-t="F2L N,0..3">，每个朝向若干算法。

因此只需抓取 1 个页面即可拿到全部 41 case × 4 朝向。
抓取策略：优先用 /a/3x3/F2L/F2L_1（全量），若不足 41 再用列表页 /a/3x3/F2L 补充。
原始 HTML 缓存到 data/_raw/，重跑离线且快速。
输出 tools/cfop/data/f2l.json。
"""
import re, json, os, time, urllib.request, sys

BASE = "https://www.speedcubedb.com"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "f2l.json")
RAW = os.path.join(HERE, "..", "data", "_raw")
os.makedirs(RAW, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (compatible; CFOP-mirror/1.0)"}

NAME_MAP = {0: "Front Right", 1: "Front Left", 2: "Back Left", 3: "Back Right"}

def fetch(url, tries=6):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 8000:          # 疑似被限流（空 200）
                last = "too small (%d)" % len(data); time.sleep(5); continue
            return data.decode("utf-8", "replace")
        except Exception as e:
            last = str(e); time.sleep(5)
    print("  ✗ 失败 %s: %s" % (url, last), file=sys.stderr)
    return None

def get_html(name, url):
    fn = os.path.join(RAW, name)
    if os.path.exists(fn):
        return open(fn, encoding="utf-8", errors="replace").read()
    h = fetch(url)
    if h:
        open(fn, "w", encoding="utf-8").write(h)
    return h

def clean(s):
    s = re.sub(r"<[^>]+>", "", s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()

def algs(block):
    return [clean(m) for m in re.findall(r'class="formatted-alg"[^>]*>(.*?)</div>', block, re.S)]

def setup(block):
    m = re.search(r'class="setup-case[^"]*">(.*?)</div>', block, re.S)
    return clean(m.group(1)).replace("setup:", "") if m else ""

def case(block):
    m = re.search(r'data-alg="([^"]+)"', block)
    if not m: return None
    cid = m.group(1).strip().rstrip("_")
    sub = re.search(r'data-subgroup="([^"]*)"', block)
    subgroup = sub.group(1).strip() if sub else ""
    ori = []
    for o in range(4):
        pat = r'data-t="%s,%d"[^>]*>(.*?)</ul>' % (re.escape(cid), o)
        um = re.search(pat, block, re.S)
        if um:
            a = algs(um.group(1))
            if a:
                ori.append({"name": NAME_MAP.get(o, "Ori%d" % o), "algs": a})
    if not ori:
        a = algs(block)
        if a: ori.append({"name": "", "algs": a})
    if not ori: return None
    return {"id": cid, "subgroup": subgroup, "setup": setup(block), "facelets": None, "orientations": ori}

def blocks(html):
    return re.split(r'(?=<div class="row singlealgorithm)', html)

def _num(idstr):
    # 注意：'F2L' 本身含数字 2，必须锚定到 F2L 之后的数字
    m = re.search(r"F2L\s*(\d+)", idstr or "")
    return int(m.group(1)) if m else 1e9

def save(cases):
    cases.sort(key=lambda c: (_num(c["id"]), c["subgroup"]))
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"set": "f2l", "count": len(cases), "cases": cases}, f, ensure_ascii=False, indent=1)

def main():
    cases, seen = [], set()
    def add(c):
        if c and c["id"] not in seen:
            seen.add(c["id"]); cases.append(c); return True
        return False

    # 1) 全量子页（含全部 41 case）
    h = get_html("F2L_all.html", BASE + "/a/3x3/F2L/F2L_1")
    if h:
        for b in blocks(h):
            add(case(b))
    print("F2L_1 全量页已得 %d cases" % len(cases))

    # 2) 列表页补充（若全量页不足）
    if len(cases) < 41:
        hl = get_html("list.html", BASE + "/a/3x3/F2L")
        if hl:
            for b in blocks(hl):
                add(case(b))
        print("列表页补充后 %d cases" % len(cases))

    save(cases)
    print("完成: %d cases -> %s" % (len(cases), OUT))

if __name__ == "__main__":
    main()
