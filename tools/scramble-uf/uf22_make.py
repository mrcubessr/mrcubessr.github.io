#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stage A: build facelets for the corrected 22-group UF structure.

Codes come from the authoritative backup build-uf.ps1 (22 groups, edge-paired
seconds). Algorithms come from the user's complete 440 table (includes G/H).
T = apply the inverse of the whole concatenated AXX sequence to a solved cube.
"""
import json, re
import pycuber

BACKUP = "D:/Marvis_产物/conv_19f35708a9b_67fa9c38a1aa/fto-site/tools/scramble-uf/build-uf.ps1"
LIB440 = "D:/Marvis_产物/conv_9956c19378d34472a05a093e4eb63a3a/UF棱_AXX_全量表440_正确版.json"
OUT_FACELETS = "D:/魔方站点备份/fto-site/tools/scramble-uf/_facelets22.json"
OUT_META = "D:/魔方站点备份/fto-site/tools/scramble-uf/_groups22.json"
OUT_LIB440 = "D:/魔方站点备份/fto-site/tools/scramble-uf/_edgeAlgToInfo440.json"

COLOUR_MAP = {'yellow': 'U', 'red': 'R', 'green': 'F', 'white': 'D', 'blue': 'L', 'orange': 'B'}
FACES = ['U', 'R', 'F', 'D', 'L', 'B']


def facelet_of(cube):
    s = []
    for face in FACES:
        g = cube.get_face(face)
        for r in range(3):
            for c in range(3):
                s.append(COLOUR_MAP.get(g[r][c].colour, '?'))
    return ''.join(s)


def invert_moves(moves):
    out = []
    for mv in reversed(moves):
        if mv.endswith("'"):
            out.append(mv[:-1])
        elif mv.endswith('2'):
            out.append(mv)
        else:
            out.append(mv + "'")
    return out


# Load user's complete table -> flat {key: firstAlg}
raw = json.load(open(LIB440, encoding='utf-8'))
lib440 = {}
for key, val in raw.items():
    algs = val.get('公式') if isinstance(val, dict) else val
    lib440[key] = algs

# Parse backup groups
txt = open(BACKUP, encoding='utf-8-sig').read()
pat = re.compile(r"index='(\d+)';\s*name='([^']*)';\s*formula='((?:[^']|'')*)';\s*codes=@\(([^)]*)\)")
groups = []
for m in pat.finditer(txt):
    groups.append({
        'index': m.group(1),
        'name': m.group(2),
        'formula': m.group(3).replace("''", "'"),
        'codes': re.findall(r"'([A-Z]{2})'", m.group(4)),
    })
print('backup groups:', len(groups))
for g in groups:
    print('  ', g['index'], g['name'], len(g['codes']), g['codes'])

# Build facelets
facelets = {}
for g in groups:
    cube = pycuber.Cube()
    whole = []
    for code in g['codes']:
        whole += lib440['A' + code][0].split()
    for mv in invert_moves(whole):
        cube(mv)
    facelets[g['name']] = facelet_of(cube)

json.dump(facelets, open(OUT_FACELETS, 'w'), ensure_ascii=False)
json.dump(groups, open(OUT_META, 'w'), ensure_ascii=False, indent=1)
# also write a merged library file to be used by the site (info-style A keys, 440)
json.dump(lib440, open(OUT_LIB440, 'w'), ensure_ascii=False)

print('wrote', OUT_FACELETS, len(facelets), 'facelets;', OUT_META, ';', OUT_LIB440)
