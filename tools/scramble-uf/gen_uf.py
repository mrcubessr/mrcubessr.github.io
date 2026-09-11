import json, re
import pycuber

COLOUR_MAP = {'yellow':'U','red':'R','green':'F','white':'D','blue':'L','orange':'B'}
FACES = ['U','R','F','D','L','B']

def facelet_of(cube, rots=None):
    s = []
    for face in FACES:
        g = cube.get_face(face)
        for r in range(3):
            for c in range(3):
                s.append(COLOUR_MAP.get(g[r][c].colour, '?'))
    return ''.join(s)

def parse_moves(alg):
    # split into tokens: a face letter optionally followed by ' or 2, also wide r/u etc.
    return alg.split()

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

def apply_algo_inverse(cube, alg):
    for mv in invert_moves(parse_moves(alg)):
        cube(mv)
    return cube

def build_T(cube, codes, lib, prefix):
    # T = inverse of applying all algorithms in forward order (CE,CF,...,CZ).
    # i.e. invert the whole concatenated move sequence and apply it to solved.
    whole = []
    for code in codes:
        whole += parse_moves(lib[prefix + code][0])
    inv = invert_moves(whole)
    for mv in inv:
        cube(mv)
    return cube

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

def build_facelets(groups, lib_prefix, lib):
    out = {}
    meta = {}
    for g in groups:
        cube = pycuber.Cube()
        build_T(cube, g['codes'], lib, lib_prefix)
        fl = facelet_of(cube)
        out[g['name']] = fl
        meta[g['name']] = {'codes': g['codes'], 'formula_existing': g['formula'], 'name': g['name']}
    return out, meta

lib = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/edgeAlgToInfo.json", encoding='utf-8'))

uf_groups = parse_groups(r"D:/魔方站点备份/fto-site/tools/scramble-uf/build-uf.ps1")
ur_groups = parse_groups(r"D:/魔方站点备份/fto-site/tools/scramble-ur/build-groups.ps1")

print("UF groups:", len(uf_groups), "codes eg C:", uf_groups[0]['codes'][:3], "...", len(uf_groups[0]['codes']))
print("UR groups:", len(ur_groups))

uf_fl, uf_meta = build_facelets(uf_groups, 'A', lib)
ur_fl, ur_meta = build_facelets(ur_groups, 'G', lib)

json.dump(uf_fl, open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/_facelets_uf.json",'w'))
json.dump(uf_meta, open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/_meta_uf.json",'w'))
json.dump(ur_fl, open(r"D:/魔方站点备份/fto-site/tools/scramble-ur/_facelets_ur.json",'w'))
json.dump(ur_meta, open(r"D:/魔方站点备份/fto-site/tools/scramble-ur/_meta_ur.json",'w'))
print("wrote facelets: UF", len(uf_fl), "UR", len(ur_fl))
