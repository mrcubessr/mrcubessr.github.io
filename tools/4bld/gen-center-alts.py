# -*- coding: utf-8 -*-
"""gen-center-alts.py — 给四阶中心块页 center-data.js 补「参考公式」与空格补齐（可复现补丁）

输入：
  1) tools/4bld/center-data.js  —— 用户 Excel 公式表（435 条，**真值源，一条不改**）
  2) tools/4bld/xcenter-algs.tsv —— blddb.net/bigbld/xcenter.html 角心公式（460 个有向情况）

输出：重写 center-data.js
  - buffer / order / groups / intentional 四行**原样保留**；
  - `algs` 原有 435 条**逐字节不变**，另按字典序插入 blddb 补上的格子；
  - 新增 `filled`：由 blddb 角心库补上的格子（用户拍板「补上这 25 格」→ 实际 20 格，
    因 5 个 `intentional` 刻意留空格在库里也有公式、必须继续留空）；
  - 新增 `alts`：每格有序参考公式 `[[公式, 来源数], ...]`，**index 0 = 默认**。
    * Excel 格：默认 = Excel 公式（来源数记 0，页面显示「公式表」），其后接 blddb 备选；
    * filled 格：默认 = blddb 排名第一，其后接其余备选。
  - blddb 备选与默认公式重复的自动去重。

用法：python gen-center-alts.py [--check]   # --check 只比对不写入（防手改漂移）

⚠️ 口径红线：Excel 公式是用户拍板的真值（「按图片改」），本脚本**只新增、不改写**那 435 条。
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "center-data.js")
TSV = os.path.join(HERE, "xcenter-algs.tsv")

INTENTIONAL = [("J", "S"), ("B", "F"), ("Y", "J"), ("C", "G"), ("P", "J")]

HEADER = """/** center-data.js — 四阶盲拧 · 中心块公式表（缓冲 Ubl）
 *  来源：用户提供的 Excel 公式表（435 条，真值源，逐条未改）；
 *        参考公式与补格由 gen-center-alts.py 从 blddb.net/bigbld/xcenter.html 角心库并入
 *        （字母表与本页完全一致：缓冲 D=Ubl、六面分组相同，矩阵行列顺序也相同，可逐格对照）。
 *  key = 首字母 + 次字母（如 "GB" 表示 Ubl -> G -> B）
 *  order = 原表行列顺序，勿改；groups = 同面 4 中心块位置组
 *  intentional = 原表刻意留空的单向格（反向公式已覆盖，并非缺失，共 5 处）
 *  filled = 由 blddb 角心库补上的格子（原表缺、且非刻意留空）
 *  algs = 默认公式（Excel 格即 Excel 公式）；alts = 每格有序参考公式 [[公式, 来源数], ...]，
 *         index 0 = 默认，可手动切换；来源数 0 表示来自用户公式表
 */"""


def js_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def parse_xc(path):
    xc = {}
    with open(path, encoding="utf-8") as f:
        f.readline()
        for line in f:
            line = line.rstrip("\n")
            if not line:
                continue
            code, p1, p2, p3, nsrc, algx, comm, alts, altnsrc = line.split("\t")
            alist = alts.split("|") if alts else []
            nlist = [int(x) for x in altnsrc.split("|")] if altnsrc else []
            assert len(alist) == len(nlist), code
            assert int(nsrc) >= 1, code          # blddb 条目必有不少于 1 个来源
            xc[code] = {"alg": algx, "nsrc": int(nsrc), "alts": list(zip(alist, nlist))}
    return xc


def split_center(text):
    """切成 (头部注释, buffer/order/groups/intentional 原文, algs dict, filled list)"""
    m = re.search(r'^window\.CENTER4 = \{\n', text, re.M)
    assert m, "找不到 window.CENTER4"
    head = text[:m.start()].rstrip("\n")
    rest = text[m.end():]
    keep, algs, filled = [], {}, []
    in_alts = False
    for ln in rest.split("\n"):
        if ln.startswith("  alts: {"):
            in_alts = True
            continue
        if ln.startswith("  algs: {") or ln.startswith("  filled: ["):
            if ln.startswith("  filled: ["):
                filled = [x.strip().strip('"') for x in
                          ln[len("  filled: ["):ln.rindex("]")].split(",") if x.strip()]
            continue
        if in_alts:
            continue
        if re.match(r'    "[A-Z]{2}": "(.*)",?$', ln):
            k, v = re.match(r'    "([A-Z]{2})": "(.*)",?$', ln).groups()
            algs[k] = v
            continue
        if ln.strip() in ("},", "};", "}", ""):
            continue
        keep.append(ln)
    return head, keep, algs, filled


def main():
    check = "--check" in sys.argv
    orig = open(DATA, encoding="utf-8").read()
    head, keep, algs, filled = split_center(orig)
    xc = parse_xc(TSV)

    order = [x.strip().strip('"') for x in re.search(r'order: \[(.*?)\]', "\n".join(keep)).group(1).split(",")]
    intentional = [tuple(m) for m in
                   re.findall(r'\["([A-Z])", *"([A-Z])"\]', "\n".join(keep))]
    assert intentional == INTENTIONAL, intentional

    cells = [a + b for a in order for b in order if a != b]
    excel = set(algs) - set(filled)          # Excel 真值格（重跑时靠 filled 区分）
    assert len(excel) == 435, len(excel)
    assert all(k in cells for k in algs), "algs 出现了矩阵外的键"

    # 1) 要补的空格：Excel 没有、blddb 有、且不是刻意留空
    new_filled = [c for c in cells
                  if c not in excel and c not in filled
                  and (c[0], c[1]) not in intentional and ("D" + c) in xc]
    all_filled = sorted(set(filled) | set(new_filled))     # 累计（重跑时 new_filled 为 0）
    assert len(all_filled) == 20, (len(all_filled), all_filled)

    # 2) 组装 alts（index 0 = 默认）
    alts_out = {}
    for c in cells:
        key = "D" + c
        if c in excel:
            base = algs[c]
            lst = [[base, 0]]                       # 0 = 页面显示「公式表」
            if key in xc:
                for a, n in [[xc[key]["alg"], xc[key]["nsrc"]]] + xc[key]["alts"]:
                    if a != base and [a, n] not in lst:
                        lst.append([a, n])
        elif c in all_filled:
            if key not in xc:
                continue
            head_pair = [xc[key]["alg"], xc[key]["nsrc"]]
            lst = [head_pair] + [[a, n] for a, n in xc[key]["alts"] if [a, n] != head_pair]
        else:
            continue
        alts_out[c] = lst

    # 3) 重建文件
    final_algs = dict(algs)
    for c in all_filled:
        final_algs[c] = xc["D" + c]["alg"]
    keys = sorted(final_algs)
    alg_lines = ['    %s: %s%s' % (js_str(k), js_str(final_algs[k]),
                                   "" if i == len(keys) - 1 else ",")
                 for i, k in enumerate(keys)]
    alt_lines = ['    %s: [%s],' % (js_str(k), ", ".join("[%s, %d]" % (js_str(a), n)
                                                        for a, n in alts_out[k]))
                 for k in sorted(alts_out)]
    content = (HEADER + "\nwindow.CENTER4 = {\n" + "\n".join(keep) + "\n"
               + "  filled: [%s],\n" % ", ".join(js_str(c) for c in all_filled)
               + "  algs: {\n" + "\n".join(alg_lines) + "\n  },\n"
               + "  alts: {\n" + "\n".join(alt_lines) + "\n  }\n};\n")

    if check:
        old = open(DATA, encoding="utf-8").read() if os.path.exists(DATA) else ""
        print("CHECK:", "OK (identical)" if old == content else "DIFFERS")
        sys.exit(0 if old == content else 1)

    # 安全闸一：原有 435 条公式一条不变
    for k, v in algs.items():
        assert final_algs[k] == v, ("Excel 公式被改写了！", k, v, final_algs[k])
    # 安全闸二：algs 文本区域（去掉新增 20 行后）与原文件逐字节一致
    def algs_region(txt):
        m = re.search(r'  algs: \{\n(.*?)\n  \}', txt, re.S)
        return [l for l in m.group(1).split("\n") if l.strip()]
    old_lines = algs_region(orig)
    new_lines = algs_region(content)
    old_keys = [re.match(r'    "([A-Z]{2})"', l).group(1) for l in old_lines]
    new_keys = [re.match(r'    "([A-Z]{2})"', l).group(1) for l in new_lines]
    assert set(old_keys) <= set(new_keys), "原有键丢了"
    for k in old_keys:
        o = [l for l in old_lines if l.startswith('    "%s":' % k)][0]
        n = [l for l in new_lines if l.startswith('    "%s":' % k)][0]
        assert o.rstrip(",") == n.rstrip(","), ("该行字节变了", k, o, n)

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print("center-data.js written: algs %d (Excel %d + filled %d), alts %d 格"
          % (len(final_algs), len(excel), len(all_filled), len(alts_out)))


if __name__ == "__main__":
    main()
