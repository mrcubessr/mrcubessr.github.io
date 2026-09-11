#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Final independent validation of the regenerated build-uf.ps1.

For each UF group: apply scramble F to a solved cube, then apply the AXX
algorithms (prefix 'A') in forward order. The cube must return to solved.
"""
import json, re
import pycuber

COLOUR_MAP = {'yellow':'U','red':'R','green':'F','white':'D','blue':'L','orange':'B'}
FACES = ['U','R','F','D','L','B']

def parse_moves(alg):
    return alg.split()

def parse_groups(ps1_path):
    txt = open(ps1_path, encoding='utf-8').read()
    groups = []
    pat = re.compile(r"name='([^']*)';\s*formula='((?:[^']|'')*)';\s*codes=@\(([^)]*)\)")
    for m in pat.finditer(txt):
        name = m.group(1)
        formula = m.group(2).replace("''", "'")
        codes = re.findall(r"'([A-Z]{2})'", m.group(3))
        groups.append({'name': name, 'formula': formula, 'codes': codes})
    return groups

lib = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/edgeAlgToInfo.json", encoding='utf-8'))
groups = parse_groups(r"D:/魔方站点备份/fto-site/tools/scramble-uf/build-uf.ps1")

print(f"Parsed {len(groups)} UF groups from build-uf.ps1")

pass_n = 0
fails = []
for g in groups:
    cube = pycuber.Cube()  # solved
    # apply scramble F
    for mv in parse_moves(g['formula']):
        cube(mv)
    # apply AXX algorithms in forward order
    for code in g['codes']:
        alg = lib['A' + code][0]
        for mv in parse_moves(alg):
            cube(mv)
    solved = cube.is_solved() if hasattr(cube, 'is_solved') else (str(cube) == str(pycuber.Cube()))
    if solved:
        pass_n += 1
    else:
        fails.append(g['name'])

print(f"UF validation: {pass_n}/{len(groups)} pass, fail={len(fails)}")
if fails:
    print("FAILED:", fails)
else:
    print("ALL UF GROUPS VALID: apply(F) then AXX -> solved")
