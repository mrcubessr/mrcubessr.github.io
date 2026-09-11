#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Stage C: validate the 22 regenerated formulas and write them into build-uf.ps1."""
import json, re
import pycuber

SITE_PS1 = "D:/魔方站点备份/fto-site/tools/scramble-uf/build-uf.ps1"
LIB440 = "D:/魔方站点备份/fto-site/tools/scramble-uf/_edgeAlgToInfo440.json"
GROUPS = "D:/魔方站点备份/fto-site/tools/scramble-uf/_groups22.json"
SOLS = "D:/魔方站点备份/fto-site/tools/scramble-uf/_solutions22.json"
OUT_JSON = "D:/魔方站点备份/fto-site/tools/scramble-uf/_uf_new_formulas.json"

lib = json.load(open(LIB440, encoding='utf-8'))
groups = json.load(open(GROUPS, encoding='utf-8'))
sols = json.load(open(SOLS, encoding='utf-8'))

# ---- validate: apply(F) then each AXX (first alg) -> solved ----
ok = 0
bad = []
for g in groups:
    F = sols[g['name']]
    if F.startswith('__ERROR__'):
        bad.append((g['name'], F)); continue
    cube = pycuber.Cube()
    for mv in F.split():
        cube(mv)
    for code in g['codes']:
        for mv in lib['A' + code][0].split():
            cube(mv)
    if str(cube) == str(pycuber.Cube()):
        ok += 1
    else:
        bad.append((g['name'], 'NOT-SOLVED'))
print(f'VALIDATION: {ok}/{len(groups)} pass')
for b in bad:
    print('  FAIL', b)
if bad:
    raise SystemExit('validation failed; not writing')

# ---- write $groups block into build-uf.ps1 ----
txt = open(SITE_PS1, encoding='utf-8-sig').read()


def esc(s):
    return s.replace("'", "''")


lines = ["$groups = @("]
for g in groups:
    codes = ','.join("'" + c + "'" for c in g['codes'])
    lines.append(
        "    @{ index='%s'; name='%s'; formula='%s'; codes=@(%s) }"
        % (g['index'], g['name'], esc(sols[g['name']]), codes)
    )
lines.append(")")
new_block = "\n".join(lines)

pat = re.compile(r"\$groups = @\(.*?\n\)", re.DOTALL)
if not pat.search(txt):
    raise SystemExit('could not find $groups block')
txt = pat.sub(lambda m: new_block, txt, count=1)
open(SITE_PS1, 'w', encoding='utf-8').write(txt)

json.dump({g['name']: sols[g['name']] for g in groups},
          open(OUT_JSON, 'w'), ensure_ascii=False, indent=1)
print('wrote build-uf.ps1 with', len(groups), 'groups and', OUT_JSON)
