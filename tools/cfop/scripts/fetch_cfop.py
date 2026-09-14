#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_cfop.py — 从 speedcubedb.com 抽取 CFOP 公式数据到本地结构化 JSON。

抽取范围（用户指定保留的项）:
  - F2L            (/a/3x3/F2L, 需逐个 case 子页 F2L_1..F2L_41)
  - Advanced F2L   (/a/3x3/AdvancedF2L)
  - OLL            (/a/3x3/OLL)
  - PLL            (/a/3x3/PLL)
  - Cross Trainer  (/cross, 为生成器, 不抽取静态数据)

输出: ../data/{f2l,advanced_f2l,oll,pll}.json
每条记录: { id, subgroup, setup, facelets, orientations:[{name, algs:[...]}] }

说明:
  - 算法文本取自页面内的 .formatted-alg (含标准 + 备选, 已带括号分组)。
  - 朝向(F2L)取自 .subcatname (Front Right/Left/Back Left/Right)。
  - 仅 OLL/PLL 的 jcube 提供干净的 5 面 facelet, 用于 2D 展开图; 其余留空。
本脚本只做"下载到本地", 不生成任何页面。
"""
import re, json, os, urllib.request, sys, time

BASE = "https://www.speedcubedb.com"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
os.makedirs(OUT_DIR, exist_ok=True)

UA = {"User-Agent": "Mozilla/5.0 (compatible; CFOP-mirror/1.0)"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")

def get_case_blocks(html):
    """返回所有 singlealgorithm 块的 HTML 片段列表。"""
    return re.split(r'(?=<div class="row singlealgorithm)', html)

def clean_alg(s):
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()

def extract_algs(block):
    return [clean_alg(m) for m in re.findall(r'class="formatted-alg"[^>]*>(.*?)</div>', block, re.S)]

def extract_setup(block):
    m = re.search(r'class="setup-case[^"]*">(.*?)</div>', block, re.S)
    if not m:
        return ""
    t = re.sub(r"<[^>]+>", "", m.group(1))
    return re.sub(r"\s+", " ", t).replace("setup:", "").strip()

def extract_facelets(block):
    """OLL/PLL 的 jcube: data-us/ub/uf/ul/ur (5 面)。"""
    m = re.search(r'class="jcube"([^>]*)>', block)
    if not m:
        return None
    attrs = dict(re.findall(r'(data-(?:us|ub|uf|ul|ur|df|dl|dr|db))="([a-z]+)"', m.group(1)))
    return attrs if attrs else None

def parse_case(block):
    m = re.search(r'data-alg="([^"]+)"', block)
    if not m:
        return None
    cid = m.group(1).strip()
    if cid.endswith("_"):  # 跳过 _1 / _2 这种链接副本的 data-alg
        cid = cid.rstrip("_")
    sub = re.search(r'data-subgroup="([^"]*)"', block)
    subgroup = sub.group(1).strip() if sub else ""
    setup = extract_setup(block)
    facelets = extract_facelets(block)
    # 朝向块
    labels = [(mm.group(1).strip(), mm.start()) for mm in
              re.finditer(r"class='subcatname'>([^<]+)</div>", block)]
    orientations = []
    if labels:
        for i, (name, pos) in enumerate(labels):
            end = labels[i + 1][1] if i + 1 < len(labels) else len(block)
            seg = block[pos:end]
            algs = extract_algs(seg)
            if algs:
                orientations.append({"name": name, "algs": algs})
    if not orientations:
        algs = extract_algs(block)
        if algs:
            orientations.append({"name": "", "algs": algs})
    if not orientations:
        return None
    return {"id": cid, "subgroup": subgroup, "setup": setup,
            "facelets": facelets, "orientations": orientations}

def parse_set(html):
    cases = []
    seen = set()
    for b in get_case_blocks(html):
        c = parse_case(b)
        if not c:
            continue
        if c["id"] in seen:   # 同 case 去重 (列表页 + 子页可能重复)
            continue
        seen.add(c["id"])
        cases.append(c)
    return cases

def fetch_f2l():
    """F2L 列表页仅内置前 6 个, 需逐个抓子页。"""
    cases = []
    seen = set()
    # 列表页前 6 个
    html = fetch(BASE + "/a/3x3/F2L")
    for c in parse_set(html):
        if c["id"] not in seen:
            seen.add(c["id"]); cases.append(c)
    # 逐个子页 1..41
    for n in range(1, 42):
        try:
            html = fetch(f"{BASE}/a/3x3/F2L/F2L_{n}")
        except Exception as e:
            print(f"  F2L_{n} 失败: {e}", file=sys.stderr)
            continue
        for c in parse_set(html):
            if c["id"] not in seen:
                seen.add(c["id"]); cases.append(c)
        time.sleep(0.15)
    return cases

def main():
    jobs = {
        "oll": ("/a/3x3/OLL", lambda: parse_set(fetch(BASE + "/a/3x3/OLL"))),
        "pll": ("/a/3x3/PLL", lambda: parse_set(fetch(BASE + "/a/3x3/PLL"))),
        "advanced_f2l": ("/a/3x3/AdvancedF2L", lambda: parse_set(fetch(BASE + "/a/3x3/AdvancedF2L"))),
        "f2l": ("/a/3x3/F2L (per-case)", fetch_f2l),
    }
    for key, (label, fn) in jobs.items():
        print(f"[抓取] {label} ...")
        try:
            cases = fn()
        except Exception as e:
            print(f"  ERROR {key}: {e}", file=sys.stderr)
            cases = []
        out = os.path.join(OUT_DIR, f"{key}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"set": key, "count": len(cases), "cases": cases},
                      f, ensure_ascii=False, indent=1)
        print(f"  -> {out}  ({len(cases)} cases)")
    print("完成。")

if __name__ == "__main__":
    main()
