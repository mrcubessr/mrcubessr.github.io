# -*- coding: utf-8 -*-
"""gen-xcenter-data.py — 由 xcenter-algs.tsv 生成 xcenter-data.js（角心 X-Center 公式数据）

源：xcenter-algs.tsv（由 .workbuddy/outputs/extract_blddb_xcenter.py 从 blddb.net/bigbld/xcenter.html
    的 bigbldXcenterAlgToInfoManmade.json 抽取，缓冲 D = Ubl，460 个有向情况，主公式 = 来源数最多）
用法：python gen-xcenter-data.py [--check]   # --check 只比对不写入（防手改漂移）

数据口径（2026-10-16 定）：
- 24 个中心块贴纸位 ↔ 24 字母（A–Z 去 U,V），**与四阶中心块页（tools/4bld）同一套字母表**：
  缓冲固定 D（= Ubl），面分组逐一吻合。矩阵行/列沿用四阶中心块页的「按面分组」顺序，
  以便两页矩阵逐格对照。
- blddb 的 3 字母码 = 三循环，同一循环可写作 3 种旋转，库中大量情况存成了非 D 首字母的码
  （294/460 需旋转解析）。做法同 blddb 官网 xcenter.js 的 algSearch：三次旋转去库里查，命中即用。
- 缓冲固定 D 时 23×22 = 506 个有向情况中 460 个有公式；**46 个全库都没有**（blddb 无、
  用户 Excel 中心块表也无），不写入本文件，由页面渲染成「库未收录」空格，矩阵仍 23×23 完整。
- 每情况 value = [主公式, 交换子, 来源数, 备选公式数组]，备选为 [公式, 来源数] 二元组。
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# 24 个中心块贴纸位 ↔ 字母（blddb cornerPosToCode.json，与四阶中心块页同表）
POS = {
    "A": "Ufl", "B": "Ful", "C": "Luf", "D": "Ubl", "E": "Lub", "F": "Bul",
    "G": "Ubr", "H": "Bur", "I": "Rub", "J": "Ufr", "K": "Ruf", "L": "Fur",
    "M": "Ldf", "N": "Fdl", "O": "Dbl", "P": "Bdl", "Q": "Ldb", "R": "Dbr",
    "S": "Rdb", "T": "Bdr", "W": "Dfl", "X": "Dfr", "Y": "Fdr", "Z": "Rdf",
}
# 六个面分组（缓冲 D 属 U 面、不入组）；组色 g0–g5 按此顺序
GROUPS = [
    ["G", "J", "A"],          # U 面（另有缓冲 D=Ubl）
    ["B", "L", "Y", "N"],     # F 面
    ["E", "C", "M", "Q"],     # L 面
    ["H", "F", "P", "T"],     # B 面
    ["K", "I", "S", "Z"],     # R 面
    ["W", "X", "R", "O"],     # D 面
]
GNAMES = ["U 面", "F 面", "L 面", "B 面", "R 面", "D 面"]
# 矩阵行/列字母序：沿用四阶中心块页的按面分组顺序，便于两页逐格对照
ORDER = ["G", "J", "A", "B", "L", "Y", "N", "E", "C", "M", "Q", "H", "F", "P",
         "T", "K", "I", "S", "Z", "W", "X", "R", "O"]


def js_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    check = "--check" in sys.argv
    tsv = os.path.join(HERE, "xcenter-algs.tsv")
    out = os.path.join(HERE, "xcenter-data.js")
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
            assert code[0] == 'D', code
            alist = alts.split("|") if alts else []
            nlist = [int(x) for x in altnsrc.split("|")] if altnsrc else []
            assert len(alist) == len(nlist), code
            rows[code] = [algx, comm, int(nsrc), list(zip(alist, nlist))]
            order_seen.append(code)

    # 校验：506 = 23×22 去对角；缓冲 D 固定时 460 个有公式、46 个全库缺失（不写入）
    expect = ["D" + r + c for r in ORDER for c in ORDER if r != c]
    missing = [c for c in expect if c not in rows]
    extra = [c for c in rows if c not in expect]
    assert not extra, (len(extra), extra[:3])
    assert len(missing) == 46, (len(missing), missing[:3])
    assert order_seen == sorted(order_seen), "TSV 行序须按 code 字典序，便于 diff"
    assert set(POS) == set("".join(ORDER)) | {"D"}

    lines = []
    lines.append("/** xcenter-data.js — 四阶盲拧 · 角心（X-Center）公式表（缓冲 Ubl）")
    lines.append(" *  本文件由 gen-xcenter-data.py 生成，勿手改；改数据请改 xcenter-algs.tsv 后重新生成。")
    lines.append(" *  来源：blddb.net/bigbld/xcenter.html「X-Center 公式库」（人造风格，2026-10-16 抓取）")
    lines.append(" *  key = 三字母码（缓冲固定 D=Ubl，如 \"DAB\" = Ubl -> Ufl -> Ful）")
    lines.append(" *  value = [主公式, 交换子, 来源数, 备选公式数组]；备选为 [公式, 来源数] 二元组。")
    lines.append(" *  字母表与 tools/4bld（四阶中心块）完全一致，矩阵行/列顺序也相同，可逐格对照。")
    lines.append(" *  23×22 = 506 个有向情况中 460 个有公式；46 个全库未收录（不写入，页面显示空格）。")
    lines.append(" */")
    lines.append("window.XCENTER4 = {")
    lines.append("  buffer: 'D',")
    lines.append("  bufferPos: 'Ubl',")
    lines.append("  source: 'blddb.net/bigbld/xcenter.html',")
    lines.append("  pos: {")
    for k in sorted(POS):
        lines.append("    %s: %s," % (js_str(k), js_str(POS[k])))
    lines.append("  },")
    lines.append("  groups: [")
    for g in GROUPS:
        lines.append("    [%s]," % ", ".join(js_str(x) for x in g))
    lines.append("  ],")
    lines.append("  gnames: [" + ", ".join(js_str(x) for x in GNAMES) + "],")
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
    print("xcenter-data.js written:", len(rows), "cases,",
          sum(len(r[3]) + 1 for r in rows.values()), "algs")


if __name__ == "__main__":
    main()
