#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
enrich_cubedata.py — 为 F2L / Advanced F2L 补充 icube 的 data-fl（立体魔方贴纸串）。

背景
----
原站 speedcubedb 的案例配图由前端渲染：
  · OLL / PLL        → jcube，属性 data-us/ub/uf/ul/ur（5 面，各 9 贴）→ 顶面平面示意图
  · F2L / AdvancedF2L→ icube，属性 data-fl（45 字符 = 5 面 × 9）      → 等轴立体魔方
本仓库的 fetch_cfop.py / fetch_f2l.py 只抓了 OLL/PLL 的 facelets，F2L 系缺 data-fl，
故用本脚本从「原始 HTML 缓存」中补齐，写入 data/{f2l,advanced_f2l}.json 的 `fl` 字段。

data-fl 的面序（经与原站渲染结果逐格比对确认）：
    第 1 组 9 字 = 顶面 U（行主序）
    第 2 组 9 字 = 立面 1（等轴图的左侧可见面）
    第 3 组 9 字 = 立面 2（等轴图的右侧可见面）
    第 4/5 组    = 背面（等轴图不可见，不参与渲染）

用法
----
    python tools/cfop/scripts/enrich_cubedata.py
需要缓存： data/_raw/F2L_all.html、data/_raw/advf2l_raw.html
（F2L_all.html 由 fetch_f2l.py 生成；advf2l_raw.html 可由浏览器打开
 https://www.speedcubedb.com/a/3x3/AdvancedF2L 后另存原始响应获得。）
"""
import os, re, json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
RAW = os.path.join(DATA, "_raw")

JOBS = [
    ("f2l", "F2L_all.html"),
    ("advanced_f2l", "advf2l_raw.html"),
]


def extract_fl_map(raw_html):
    """从原始 HTML 中取 {case_id: data-fl}（按 singlealgorithm 块切分）。"""
    out = {}
    for blk in re.split(r'(?=<div class="row singlealgorithm)', raw_html):
        m = re.search(r'data-alg="([^"]+)"', blk)
        if not m:
            continue
        cid = m.group(1).strip()
        if cid.endswith("_"):
            cid = cid.rstrip("_")
        fm = re.search(r'class="icube"[^>]*data-fl="([^"]+)"', blk)
        if fm and cid not in out:
            out[cid] = fm.group(1)
    return out


def main():
    for key, rawfile in JOBS:
        raw_path = os.path.join(RAW, rawfile)
        json_path = os.path.join(DATA, key + ".json")
        if not os.path.exists(raw_path):
            print(f"[跳过] 缺少缓存 {raw_path}")
            continue
        if not os.path.exists(json_path):
            print(f"[跳过] 缺少数据 {json_path}")
            continue

        fl = extract_fl_map(open(raw_path, encoding="utf-8").read())
        data = json.load(open(json_path, encoding="utf-8"))
        hit = 0
        miss = []
        for c in data["cases"]:
            v = fl.get(c["id"])
            if v:
                c["fl"] = v
                hit += 1
            else:
                miss.append(c["id"])
        json.dump(data, open(json_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"[{key}] fl 写入 {hit}/{len(data['cases'])}" + (f" | 缺失 {miss}" if miss else ""))


if __name__ == "__main__":
    main()
