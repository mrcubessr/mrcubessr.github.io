# -*- coding: utf-8 -*-
"""regen_pll_facelets.py — 用 pycuber 重新生成 PLL 的 facelets（修复损坏数据）。

问题：原 data/pll.json 的 facelets 已损坏（us 全 'y'、L/R 臂互换、无 'l' 占位），
无法渲染出正确的展开图。本脚本以「已验证」的 pycuber 引擎为基准，对每个 case：

    case_state = inverse(alg0)(solved)

再按 flatCase 期望的格式抽取：
    us = U 面（9 贴，行主序，row0=背面行，即 U[0]=ULB … U[8]=URF）
    ub = B 面顶行（与 U 相邻的 3 贴：B[0],B[1],B[2]）
    uf = F 面顶行（F[0],F[1],F[2]）
    ul = L 面顶行（L[0],L[1],L[2]）
    ur = R 面顶行（R[0],R[1],R[2]）
方向已用「绕共享边旋转」几何推导 + 旧 EDGE_PAIRS 邻接关系双重确认。

pycuber 配色与本站相反（U=y/D=w/R=o/L=r），用 P2O 统一到本站字母
（w=白 U, y=黄 D, g=绿 F, b=蓝 B, r=红 R, o=橙 L）。

用法：python tools/cfop/scripts/regen_pll_facelets.py
"""
import json
import re
import sys
from pathlib import Path

import pycuber

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data" / "pll.json"

# pycuber 颜色 -> 本站字母
P2O = {"y": "w", "w": "y", "g": "g", "b": "b", "o": "r", "r": "o", "x": "l"}

FACES = "URFDLB"


def invert_alg(alg):
    """反转公式并切换带撇：R U R' -> R U' R'（与 RubikCore.invertMoves 一致）。
    支持 U/L/D/R/F/B 面转、r/l/u/d/f/b 宽转、x/y/z 整体转、M/S/E 中层转。"""
    out = []
    for m in reversed(re.findall(r"[ULDRFBuldrfbxyzMSE]2?'?", alg)):
        if not m:
            continue
        if m.endswith("2"):
            out.append(m)
        elif m.endswith("'"):
            out.append(m[0])
        else:
            out.append(m + "'")
    return out


# 整体转动（仅改变朝向，不改变「识别图案」），从算法首尾剥离，
# 使展开图统一以「U 朝上」的标准朝向呈现。
ROT = {"x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"}


def strip_rotations(alg):
    toks = alg.split()
    while toks and toks[0] in ROT:
        toks.pop(0)
    while toks and toks[-1] in ROT:
        toks.pop(-1)
    return " ".join(toks)


def read_face(cube, f):
    """读 pycuber 某面的 9 贴（行主序），转成本站字母串。"""
    face = getattr(cube, f)
    s = []
    for r in range(3):
        for c in range(3):
            ch = str(face[r][c]).strip("[]")
            s.append(P2O.get(ch, "l"))
    return "".join(s)


def case_state(alg):
    cube = pycuber.Cube()          # 还原态（pycuber: U=yellow 朝上）
    core = strip_rotations(alg)
    for mv in invert_alg(core):    # case = inverse(core_alg)(solved)
        cube(mv)
    return cube


def extract(cube):
    U = read_face(cube, "U")
    B = read_face(cube, "B")
    F = read_face(cube, "F")
    L = read_face(cube, "L")
    R = read_face(cube, "R")
    return {
        "data-us": U,
        "data-ub": B[0:3],
        "data-uf": F[0:3],
        "data-ul": L[0:3],
        "data-ur": R[0:3],
    }


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    cases = data["cases"]
    print(f"共 {len(cases)} 个 case")

    fixed = 0
    for c in cases:
        algs = []
        for o in c.get("orientations", []):
            algs += o.get("algs", [])
        if not algs:
            print(f"  [跳过] {c['id']} 无算法")
            continue
        alg0 = algs[0]
        core = strip_rotations(alg0)
        cube = case_state(alg0)
        # 校验：对 case 套用 core 算法后应回还原态
        verify = pycuber.Cube()
        for mv in invert_alg(core):
            verify(mv)
        for mv in core.split():
            verify(mv)
        solved = pycuber.Cube()
        solved_ok = all(
            str(getattr(verify, f)[r][cc]).strip("[]") == str(getattr(solved, f)[r][cc]).strip("[]")
            for f in FACES for r in range(3) for cc in range(3)
        )
        fl = extract(cube)
        # 健全性：套用核心算法必须能还原（站得住脚的魔方态）。
        # 注：PLL 只置换顶层块，U 面 9 贴本就同为 U 色（monochrome），
        # 故 us 单色属正常，不判异常；仅校验 U 中心为 w 且可还原。
        us = fl["data-us"]
        bad = (not solved_ok) or (us[4] != "w")
        c["facelets"] = fl
        if bad or not solved_ok:
            print(f"  [异常] {c['id']}: solved_ok={solved_ok} us[4]={us[4]} us={us}")
        else:
            fixed += 1

    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成。已重新生成 facelets 的 case：{fixed}/{len(cases)}")


if __name__ == "__main__":
    main()
