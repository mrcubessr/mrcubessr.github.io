# -*- coding: utf-8 -*-
"""verify_cube_model.py — 用 pycuber 校验 JS 版魔方模型（tools/cfop/js/rubik-core.js）

为什么需要它：旧版 cross-trainer.js 内嵌的贴纸模型里 U / R / L 三个转动的
方向是反的，D / F / B 的相邻条带内部顺序也有反转（还原态下同色，肉眼与
「四次复原」类测试都发现不了），会生成现实中不存在的魔方状态。
本脚本把 JS 模型跑在 Node 里，与 pycuber 逐贴纸比对，作为回归防线。

用法：
  python tools/cfop/scripts/verify_cube_model.py

退出码 0 表示全部通过。
"""
import json
import random
import subprocess
import sys
from pathlib import Path

import pycuber

ROOT = Path(__file__).resolve().parents[3]
JS_DIR = ROOT / "tools" / "cfop" / "js"
NODE = Path(r"C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-2/node.exe")
if not NODE.exists():
    NODE = Path("node")

# 颜色字母映射：JS 模型 w/y/r/o ↔ pycuber 的 U/D 面配色（U=y D=w R=o L=r）
CMAP = {"w": "y", "y": "w", "g": "g", "b": "b", "r": "o", "o": "r"}

ALGS = [
    "U", "U'", "U2", "D", "D'", "D2", "F", "F'", "F2", "R", "R'", "R2",
    "L", "L'", "L2", "B", "B'", "B2",
    "R U R' U'", "F R U R' U' F'", "R U2 R' D' R U R'", "U F R2 B' L D",
    "R U R' U R U2 R'", "F R U' R' U' R U R' F'",
    "R U R' U' R' F R2 U' R' U' R U R' F'", "B2 D2 L2 R2 U2 F2",
    "L' U' L U' L' U2 L", "D R' D' R D R' D' R", "R2 L2 U2 D2 F2 B2",
]

FACES, SUF = "UDLRFB", ["", "'", "2"]
OPP = {"U": "D", "D": "U", "L": "R", "R": "L", "F": "B", "B": "F"}


def random_scramble(n):
    out, last, lo = [], "", ""
    for _ in range(n):
        f = random.choice(FACES)
        while f == last or f == lo:
            f = random.choice(FACES)
        out.append(f + random.choice(SUF))
        lo, last = OPP[f], f
    return out


random.seed(20260914)
SEQS = list(ALGS)
for _ in range(300):
    SEQS.append(" ".join(random_scramble(random.randint(1, 25))))

# ---------- 1) Node 侧：用 JS 模型算出每个序列的 54 贴纸 ----------
JS_RUNNER = r"""
const fs = require("fs"), path = require("path");
globalThis.window = globalThis;
eval(fs.readFileSync(path.join(process.argv[2], "rubik-core.js"), "utf8"));
const seqs = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const out = seqs.map(function (s) {
  const c = RubikCore.applyAlg(RubikCore.newCube(), s);
  const o = {};
  RubikCore.COLOR_ORDER.forEach(function (f) { o[f] = c[f].join(""); });
  return o;
});
process.stdout.write(JSON.stringify(out));
"""

tmp_runner = ROOT / "tools" / "cfop" / "scripts" / "_js_runner.js"
tmp_seqs = ROOT / "tools" / "cfop" / "scripts" / "_seqs.json"
tmp_runner.write_text(JS_RUNNER, encoding="utf-8")
tmp_seqs.write_text(json.dumps(SEQS), encoding="utf-8")
try:
    proc = subprocess.run(
        [str(NODE), str(tmp_runner), str(JS_DIR), str(tmp_seqs)],
        capture_output=True, text=True, encoding="utf-8",
    )
finally:
    tmp_runner.unlink(missing_ok=True)
    tmp_seqs.unlink(missing_ok=True)

if proc.returncode != 0:
    print("[JS 运行失败]\n" + proc.stderr)
    sys.exit(2)
js_results = json.loads(proc.stdout)

# ---------- 2) Python 侧：pycuber 基准 ----------
def pc_net(cube):
    return {
        f: "".join(CMAP[c] for c in
                   "".join(str(getattr(cube, f)[r][col]).strip("[]") for r in range(3) for col in range(3)))
        for f in "URFDLB"
    }


bad = []
for seq, js in zip(SEQS, js_results):
    cube = pycuber.Cube()
    for mv in seq.split():
        cube(mv)
    pc = pc_net(cube)
    diff = [f for f in "URFDLB" if js[f] != pc[f]]
    if diff:
        bad.append((seq, diff))

print("[1] JS 模型 vs pycuber：%d 组序列（含 %d 条定式 + 300 组随机 1~25 步）" % (len(SEQS), len(ALGS)))
if bad:
    print("    失败 %d 组，前 3 组：" % len(bad))
    for seq, diff in bad[:3]:
        print("      ", seq, diff)
    sys.exit(1)
print("    全部一致 ✔")

# ---------- 3) 边槽定义与转动置换的自洽性（在 Python 侧独立复算一遍） ----------
SOLVED = {"U": "w", "R": "r", "F": "g", "D": "y", "L": "o", "B": "b"}
EDGE_PAIRS = [(("U", 5), ("R", 1)), (("U", 7), ("F", 1)), (("U", 3), ("L", 1)), (("U", 1), ("B", 1)),
              (("D", 5), ("R", 7)), (("D", 1), ("F", 7)), (("D", 3), ("L", 7)), (("D", 7), ("B", 7)),
              (("F", 5), ("R", 3)), (("F", 3), ("L", 5)), (("B", 5), ("L", 3)), (("B", 3), ("R", 5))]
CANON = [[SOLVED[a[0]], SOLVED[b[0]]] for a, b in EDGE_PAIRS]
assert len({tuple(sorted(c)) for c in CANON}) == 12, "12 个棱块色对必须互不相同"

flip_stats = {}
for face in "URFDLB":
    perm, flips = {}, {}
    for mv in (face, face + "'", face + "2"):
        cube = pycuber.Cube()
        cube(mv)
        net = pc_net(cube)
        p, fl = [0] * 12, [0] * 12
        for j, (fa, fb) in enumerate(EDGE_PAIRS):
            a, b = net[fa[0]][fa[1]], net[fb[0]][fb[1]]
            k = [i for i in range(12) if sorted(CANON[i]) == sorted((a, b))]
            assert len(k) == 1, (mv, j, a, b)
            p[k[0]] = j
            fl[k[0]] = 0 if a == CANON[k[0]][0] else 1
        assert sorted(p) == list(range(12)), "边置换必须是双射：" + mv
        perm[mv], flips[mv] = p, fl
    flip_stats[face] = sum(flips[face])

# 单面转动的翻转数只可能是 0 或 4：U/D/L/R 层内棱块不翻转，F/B 会把 4 个棱块翻出层
assert set(flip_stats.values()) <= {0, 4}, flip_stats
print("[2] 边槽定义自洽：18 个转动边置换均为双射；单面转翻转数", flip_stats, "✔")

if not flip_stats or flip_stats.get("F") != 4 or flip_stats.get("U") != 0:
    print("    翻转分布异常（期望 F/B = 4，其余 = 0）")
    sys.exit(1)

print("\n全部校验通过。")
