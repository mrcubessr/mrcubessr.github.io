# -*- coding: utf-8 -*-
"""gen-wing-data.py — 由 wing-algs.tsv 生成 wing-data.js（高阶盲拧 · 翼棱公式数据）

源：wing-algs.tsv（由 .workbuddy/outputs/extract_blddb_wing.py 从 blddb.net/bigbld/wing.html
    的 bigbldWingAlgToInfoManmade.json 抽取，缓冲 A = UFr，506 个有向情况，主公式 = 来源数最多）
用法：python gen-wing-data.py [--check]   # --check 只比对不写入（防手改漂移）

数据口径（2026-10-16 修正）：
- 24 翼块贴纸位 ↔ 24 字母（A–Z 去 U,V），缓冲固定 A（UFr），小写 r = 缓冲贴纸方向
- blddb 的 3 字母码 = 三循环，首字母即「缓冲位」；同一三循环可写作 3 种循环旋转，且 G/H
  情况被 blddb 存成了以 G/H 为首字母的码（如 {A,B,G} 存为 GAB/GBA）。因此不能只取 A 首字母。
- 正确口径（与 blddb 官网 wing.js 的 algSearch 一致）：对每个缓冲-A 有向情况 (A X Y)，依次尝试
  (A X Y)/(X Y A)/(Y A X) 三次旋转去库里查，命中即用。缓冲固定 A 时全部 23×22 = 506 个
  有向情况都能命中（含 G 或 H 的 86 个——44 含 G、44 含 H，AGH/AHG 两者兼有；之前被误剔）。
- 每情况 value = [主公式, 交换子, 来源数, 备选公式数组]（blddb「人造」风格，按使用人数排序）；
  备选为 [公式, 来源数] 二元组，供页面「参考公式」列表显示各条的使用人数。
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# 24 翼块贴纸位 ↔ 字母（blddb 标准编码，bidbldWingPosToCode.json）
POS = {
    "A": "UFr", "B": "FUl", "C": "ULf", "D": "LUb", "E": "UBl", "F": "BUr",
    "G": "URb", "H": "RUf", "I": "DFl", "J": "FDr", "K": "DLb", "L": "LDf",
    "M": "DBr", "N": "BDl", "O": "DRf", "P": "RDb", "Q": "FRu", "R": "RFd",
    "S": "FLd", "T": "LFu", "W": "BLu", "X": "LBd", "Y": "BRd", "Z": "RBu",
}
# 12 条棱 × 每棱 2 翼块（组色 g0–g11 按此顺序）
EDGES = [
    ["A", "B"], ["C", "D"], ["E", "F"], ["G", "H"],
    ["I", "J"], ["K", "L"], ["M", "N"], ["O", "P"],
    ["Q", "R"], ["S", "T"], ["W", "X"], ["Y", "Z"],
]
# 矩阵行/列字母序（缓冲 A 除外，其余 23 个翼块位；B 领头与其余按字母序）
ORDER = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
         "Q", "R", "S", "T", "W", "X", "Y", "Z"]


def js_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    check = "--check" in sys.argv
    tsv = os.path.join(HERE, "wing-algs.tsv")
    out = os.path.join(HERE, "wing-data.js")
    rows = {}
    order_seen = []
    with open(tsv, encoding="utf-8") as f:
        header = f.readline().rstrip("\n").split("\t")
        assert header == ["code", "pos1", "pos2", "pos3", "nsrc", "alg", "comm",
                          "alts", "altnsrc"], header
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            code, pos1, pos2, pos3, nsrc, algx, comm, alts, altnsrc = line.split("\t")
            assert POS[code[0]] == pos1 and POS[code[1]] == pos2 and POS[code[2]] == pos3, code
            alist = alts.split("|") if alts else []
            nlist = [int(x) for x in altnsrc.split("|")] if altnsrc else []
            assert len(alist) == len(nlist), code
            rows[code] = [algx, comm, int(nsrc), list(zip(alist, nlist))]
            order_seen.append(code)

    # 校验：506 = 23×22 去对角，缓冲 A 固定时全部有向情况全覆盖
    expect = ["A" + r + c for r in ORDER for c in ORDER if r != c]
    missing = [c for c in expect if c not in rows]
    extra = [c for c in rows if c not in expect]
    assert not missing and not extra, (len(missing), len(extra), missing[:3], extra[:3])
    assert order_seen == sorted(order_seen), "TSV 行序须按 code 字典序，便于 diff"

    lines = []
    lines.append("/** wing-data.js — 高阶盲拧 · 翼棱公式表（缓冲 UFr）")
    lines.append(" *  本文件由 gen-wing-data.py 生成，勿手改；改数据请改 wing-algs.tsv 后重新生成。")
    lines.append(" *  来源：blddb.net/bigbld/wing.html「翼棱公式库」（人造风格，2026-10-15 抓取）")
    lines.append(" *  key = 三字母码（缓冲固定 A=UFr，如 \"ACB\" = UFr -> ULf -> FUl）")
    lines.append(" *  value = [主公式, 交换子, 来源数, 备选公式数组]；备选为 [公式, 来源数] 二元组")
    lines.append(" *  行/列 = 23 个次位置字母（G/H 已含，经旋转解析补全）")
    lines.append(" */")
    lines.append("window.WING4 = {")
    lines.append("  buffer: 'A',")
    lines.append("  bufferPos: 'UFr',")
    lines.append("  source: 'blddb.net/bigbld/wing.html',")
    lines.append("  pos: {")
    for k in sorted(POS):
        lines.append("    %s: %s," % (js_str(k), js_str(POS[k])))
    lines.append("  },")
    lines.append("  edges: [")
    for e in EDGES:
        lines.append("    [%s, %s]," % (js_str(e[0]), js_str(e[1])))
    lines.append("  ],")
    lines.append("  order: [" + ",".join(js_str(c) for c in ORDER) + "],")
    lines.append("  algs: {")
    for code in sorted(rows):
        a, comm, n, alts = rows[code]
        val = "[%s, %s, %d, [%s]]" % (
            js_str(a), js_str(comm), n,
            ",".join("[%s, %d]" % (js_str(x), k) for x, k in alts))
        lines.append("    %s: %s," % (js_str(code), val))
    lines.append("  },")
    lines.append("};")
    content = "\n".join(lines) + "\n"

    if check:
        old = open(out, encoding="utf-8").read() if os.path.exists(out) else ""
        print("CHECK:", "OK (identical)" if old == content else "DIFFERS")
        sys.exit(0 if old == content else 1)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("wing-data.js written:", len(rows), "cases,", sum(len(r[3]) + 1 for r in rows.values()), "algs")


if __name__ == "__main__":
    main()
