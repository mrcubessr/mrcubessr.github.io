import json
import pycuber

def parse_moves(alg): return alg.split()
def apply(cube, alg):
    for mv in parse_moves(alg):
        cube(mv)
    return cube

def state_equal(a, b):
    return a == b

lib = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/edgeAlgToInfo.json", encoding='utf-8'))

# ---- UF validation ----
uf_meta = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/_meta_uf.json"))
uf_sol = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/_solutions_uf.json"))

print("===== UF validation (apply F then AXX algos -> solved) =====")
uf_pass = 0; uf_fail = 0; uf_err = 0
uf_results = {}
for name, meta in uf_meta.items():
    F = uf_sol.get(name, '')
    if str(F).startswith('__ERROR__'):
        print("  ERROR solving", name, F); uf_err += 1; continue
    cube = pycuber.Cube()
    try:
        apply(cube, F)
        for code in meta['codes']:
            apply(cube, lib['A'+code][0])
    except Exception as e:
        print("  APPLY FAIL", name, e); uf_fail += 1; continue
    if cube == pycuber.Cube():
        uf_pass += 1
        uf_results[name] = F
    else:
        uf_fail += 1
        print(f"  FAIL {name}  (len F={len(F.split())})")
print(f"UF: {uf_pass}/{len(uf_meta)} pass, fail={uf_fail}, err={uf_err}")

# ---- UR convention check (against known-good existing formulas) ----
ur_meta = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-ur/_meta_ur.json"))
ur_sol = json.load(open(r"D:/魔方站点备份/fto-site/tools/scramble-ur/_solutions_ur.json"))

print("\n===== UR convention check (vs existing known-good formulas) =====")
ur_pass = 0; ur_fail = 0
for name, meta in ur_meta.items():
    Fcalc = ur_sol.get(name, '')
    if str(Fcalc).startswith('__ERROR__'):
        print("  ERROR solving UR", name, Fcalc); ur_fail += 1; continue
    # state from my generated F
    c1 = pycuber.Cube(); apply(c1, Fcalc)
    # state from existing known-good formula
    c2 = pycuber.Cube(); apply(c2, meta['formula_existing'])
    same_state = (c1 == c2)
    # and does my F + GXX algos -> solved?
    c3 = pycuber.Cube(); apply(c3, Fcalc)
    for code in meta['codes']:
        apply(c3, lib['G'+code][0])
    solves = (c3 == pycuber.Cube())
    if same_state and solves:
        ur_pass += 1
    else:
        ur_fail += 1
        print(f"  FAIL {name}: same_state={same_state} solves={solves}")
print(f"UR: {ur_pass}/{len(ur_meta)} pass (generated F matches existing formula state AND solves)")

json.dump(uf_results, open(r"D:/魔方站点备份/fto-site/tools/scramble-uf/_uf_new_formulas.json",'w'), ensure_ascii=False, indent=1)
print("\nWrote _uf_new_formulas.json with", len(uf_results), "groups")
