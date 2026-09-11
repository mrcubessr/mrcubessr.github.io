#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate the ACTUAL generated group-*.html files: parse the embedded
data-formula and confirm apply(F) then AXX algorithms returns to solved."""
import re, glob, os, json
import pycuber

lib = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/edgeAlgToInfo.json", encoding="utf-8"))

def parse_moves(alg):
    return alg.split()

base = "D:/魔方站点备份/fto-site/tools/scramble-uf"
files = sorted(glob.glob(os.path.join(base, "group-*.html")))
total = 0
fail = []
for fp in files:
    html = open(fp, encoding="utf-8").read()
    m = re.search(r'data-formula="([^"]*)"', html)
    if not m:
        fail.append((os.path.basename(fp), "no data-formula"))
        continue
    formula = m.group(1)
    # letter from filename
    letter = re.search(r"group-([A-Z])\.html", fp).group(1)
    # codes: read the ordered practice sequence from the page
    # (tolerant of extra attributes an editor may inject between class and >)
    codes = re.findall(r'class="order-tag[^"]*"[^>]*>([A-Z]{2})<', html)
    cube = pycuber.Cube()
    for mv in parse_moves(formula):
        cube(mv)
    for code in codes:
        alg = lib["A" + code][0]
        for mv in parse_moves(alg):
            cube(mv)
    ok = str(cube) == str(pycuber.Cube())
    total += 1
    if not ok:
        fail.append((os.path.basename(fp), formula))

print(f"Validated {total} generated HTML files")
if fail:
    print("FAILURES:")
    for f, info in fail:
        print("  ", f, info)
else:
    print("ALL GENERATED HTML PAGES VALID: data-formula (F) + AXX -> solved")
