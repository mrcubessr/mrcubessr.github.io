# -*- coding: utf-8 -*-
"""verify_facelets.py — OLL / PLL facelets 数据校验（无第三方依赖）

背景（2026-09 定案的约定，勿改）：
  · speedcubedb 的 jcube 数据是「黄顶」约定：U=黄 y，F=绿 g，R=橙 o，L=红 r，B=蓝 b
    （PLL / OLL 都在顶面已翻黄之后进行，所以 data-us 全为 y / y+l）。
  · data-ub / data-ur 存的是「站在该面外侧正对看」的自然序：
        ub = UBR,UB,UBL      ur = UFR,UR,UBR
    而 flatCase 展开图是「四臂绕各自与 U 的公共棱向外翻 90°」：
        上臂左→右 = UBL,UB,UBR      右臂上→下 = UBR,UR,UFR
    ⇒ 渲染时 ub / ur 必须反序（cube-art.js 已实现），uf / ul 自然序即展开序。
  · 本脚本用 ①公式重算（OLL 57/57 全中已验证） ②PLL 结构约束（顶角颜色对 +
    顶棱多重集）双通道守护这两条约定，改数据 / 改渲染前先跑它。

用法：python verify_facelets.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# ---------------- 坐标魔方模型（pycuber 交叉校验过，含 M/E/S/x/y/z/宽转） ----------------
COL = {(0, 1): "o", (0, -1): "r", (1, 1): "y", (1, -1): "w", (2, 1): "g", (2, -1): "b"}
FACES = {"R": (0, 1), "L": (0, -1), "U": (1, 1), "D": (1, -1), "F": (2, 1), "B": (2, -1)}
SPECIAL = {
    "M": (0, (0,), +1), "E": (1, (0,), +1), "S": (2, (0,), -1),
    "x": (0, (-1, 0, 1), -1), "y": (1, (-1, 0, 1), -1), "z": (2, (-1, 0, 1), -1),
    "r": (0, (1, 0), -1), "l": (0, (-1, 0), +1),
    "u": (1, (1, 0), -1), "d": (1, (-1, 0), +1),
    "f": (2, (1, 0), -1), "b": (2, (-1, 0), +1),
}
TOKEN = re.compile(r"[ULDRFBuldrfbxyzMSEmse]w?2?'?")


def rotv(v, a, k):
    x, y, z = v
    for _ in range(k % 4):
        if a == 0:
            x, y, z = x, -z, y
        elif a == 1:
            x, y, z = z, y, -x
        else:
            x, y, z = -y, x, z
    return (x, y, z)


def newcube():
    cube = {}
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                st = {(a, s): c for (a, s), c in COL.items() if (x, y, z)[a] == s}
                if st:
                    cube[(x, y, z)] = st
    return cube


def turn(cube, a, layers, k):
    new = {}
    for pos, st in cube.items():
        if pos[a] in layers:
            nst = {}
            for (sa, ss), c in st.items():
                nv = [0, 0, 0]
                nv[sa] = ss
                nv = rotv(tuple(nv), a, k)
                na = next(i for i in range(3) if nv[i] != 0)
                nst[(na, nv[na])] = c
            new[rotv(pos, a, k)] = nst
        else:
            new[pos] = dict(st)
    return new


def do_move(cube, mv):
    q = 1
    if mv.endswith("2"):
        q, mv = 2, mv[:-1]
    elif mv.endswith("'"):
        q, mv = 3, mv[:-1]
    if mv.endswith("w"):
        mv = mv[:-1]
    if mv in FACES:
        a, s = FACES[mv]
        return turn(cube, a, (s,), -s * q)
    a, layers, sign = SPECIAL[mv]
    return turn(cube, a, layers, sign * q)


def apply_alg(cube, alg):
    for mv in TOKEN.findall(alg):
        cube = do_move(cube, mv)
    return cube




def load(name):
    return json.loads((ROOT / "data" / name).read_text(encoding="utf-8"))


CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append((name, bool(ok), detail))


def rebuild_pll(f):
    """从 5 面数据重建完整魔方态：PLL 时 D 层与侧面非顶行必然是还原面色。"""
    cube = newcube()
    for r in range(3):
        for c in range(3):
            cube[(c - 1, 1, r - 1)][(1, 1)] = f["data-us"][r * 3 + c]
    ub, uf = f["data-ub"][:3], f["data-uf"][:3]
    ul, ur = f["data-ul"][:3], f["data-ur"][:3]
    for k in range(3):
        cube[(k - 1, 1, -1)][(2, -1)] = ub[2 - k]   # 展开序 = data 反序
        cube[(k - 1, 1, 1)][(2, 1)] = uf[k]
        cube[(-1, 1, k - 1)][(0, -1)] = ul[k]
        cube[(1, 1, k - 1)][(0, 1)] = ur[::-1][k]
    for y in (0, -1):
        for c in range(3):
            cube[(c - 1, y, 1)][(2, 1)] = "g"
            cube[(c - 1, y, -1)][(2, -1)] = "b"
            cube[(-1, y, c - 1)][(0, -1)] = "r"
            cube[(1, y, c - 1)][(0, 1)] = "o"
    for r in range(3):
        for c in range(3):
            cube[(c - 1, -1, r - 1)][(1, -1)] = "w"
    return cube


def is_uniform(cube):
    return all(
        len(set(st[(a, s)] for pos, st in cube.items() if pos[a] == s)) == 1
        for (a, s) in COL)


def marked_cube():
    """54 贴纸唯一标记：用于跟踪「数据中的黄贴纸」在公式作用下去向。"""
    cube, n = {}, 0
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                st = {(a, s): (n := n + 1) for (a, s) in COL if (x, y, z)[a] == s}
                if st:
                    cube[(x, y, z)] = st
    return cube


def yellow_positions(f):
    """数据中黄贴纸的位置（展开序 → 模型坐标），ub/ur 反序。"""
    ys = set()
    for r in range(3):
        for c in range(3):
            if f["data-us"][r * 3 + c] == "y":
                ys.add(((c - 1, 1, r - 1), (1, 1)))
    for s, posf, norm in (
            (f["data-ub"][:3][::-1], lambda k: (k - 1, 1, -1), (2, -1)),
            (f["data-uf"][:3], lambda k: (k - 1, 1, 1), (2, 1)),
            (f["data-ul"][:3], lambda k: (-1, 1, k - 1), (0, -1)),
            (f["data-ur"][:3][::-1], lambda k: (1, 1, k - 1), (0, 1))):
        for k in range(3):
            if s[k] == "y":
                ys.add((posf(k), norm))
    return ys


def verify_oll():
    """OLL 57：黄贴纸跟踪 —— 数据标出的 9 枚黄贴纸套公式后必须全部朝上。"""
    d = load("oll.json")
    for c in d["cases"]:
        alg = c["orientations"][0]["algs"][0]
        m0 = marked_cube()
        m1 = apply_alg(m0, alg)
        where = {mark: (pos, nrm) for pos, st in m1.items() for nrm, mark in st.items()}
        ys = yellow_positions(c["facelets"])
        final = [where[m0[p][nrm]] for (p, nrm) in ys]
        up = all(pos[1] == 1 and nrm == (1, 1) for pos, nrm in final)
        check("OLL %s 黄贴纸×%d 套公式后全部朝上" % (c["id"], len(ys)),
              up and len(ys) == 9, "" if up else "黄贴纸数=%d" % len(ys))


def verify_pll():
    """PLL 21：数据自洽（黄顶+角/棱多重集）+ 重建态套公式（允许 U^k AUF）回单色。"""
    d = load("pll.json")
    CORNER_OK = [frozenset("br"), frozenset("bo"), frozenset("gr"), frozenset("go")]
    for c in d["cases"]:
        f = c["facelets"]
        ub = f["data-ub"][:3][::-1]
        uf = f["data-uf"][:3]
        ul = f["data-ul"][:3]
        ur = f["data-ur"][:3][::-1]
        corners = [ub[0] + ul[0], ub[2] + ur[0], uf[0] + ul[2], uf[2] + ur[2]]
        edges = [ub[1], uf[1], ul[1], ur[1]]
        check("PLL %s 顶面全黄" % c["id"], f["data-us"] == "y" * 9, f["data-us"])
        check("PLL %s 顶角颜色对合法互异" % c["id"],
              len(set(corners)) == 4 and all(frozenset(s) in CORNER_OK for s in corners),
              str(corners))
        check("PLL %s 顶棱四色各一" % c["id"], sorted(edges) == sorted("gbro"), str(edges))
        # 重建完整态，套公式后允许 U^k AUF（原站部分公式自带 AUF / y2-x' 包裹）
        cube = rebuild_pll(f)
        after = apply_alg(cube, c["orientations"][0]["algs"][0])
        solved = False
        for _ in range(4):
            if is_uniform(after):
                solved = True
                break
            after = do_move(after, "U")
        check("PLL %s 重建态套公式(+AUF)回到单色" % c["id"], solved)
    # 原站视觉锚点：Aa 五臂逐贴比对（2026-09 与 speedcubedb 截图逐贴核对过）
    aa = next(c for c in d["cases"] if c["id"] == "Aa")["facelets"]
    check("PLL Aa 与原站渲染逐贴一致",
          (aa["data-ub"][:3], aa["data-uf"][:3], aa["data-ul"][:3], aa["data-ur"][:3])
          == ("obo", "ggb", "brr", "rog"))


def main():
    verify_oll()
    verify_pll()
    bad = [(n, d) for n, ok, d in CHECKS if not ok]
    print("校验 %d 项" % len(CHECKS))
    for n, d in bad:
        print("  FAIL %s %s" % (n, d))
    print("ALL PASS" if not bad else "FAILED: %d" % len(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
