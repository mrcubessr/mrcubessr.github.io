# -*- coding: utf-8 -*-
"""gen-data.py — 生成「公式训练器」(tools/ft) 全部训练数据（按缓冲切片的 JSON）

产物：tools/ft/data/{corner,edge,center,wing,tcenter,midge}-<缓冲字母>.json（24 缓冲 × 6 体系 = 144 个）
      + tools/ft/data/manifest.json（入口页元数据）

数据来源（字母表经程序化比对完全一致，逐字母对齐、无需转换）：
  1) 三盲角块 / 棱块：tools/3bld/blddb/assets/json/
       cornerAlgToInfo + cornerAlgToStandard + cornerAlgToNightmare + cornerCodeToPos
       edgeAlgToInfo  + edgeAlgToStandard  + edgeAlgToNightmare  + edgeCodeToPos
     键 = 位置三元组（首字母即缓冲位），经 AlgToStandard 归一化后查公式数组。
     本站色组字母与 blddb 逐字母同一体系（黄=U/白=D/红=F/橘=B/绿=R/蓝=L，6 组全验无冲突）。
  2) 高阶翼棱：.workbuddy/outputs/blddb-src/bigbldWingAlgToInfoManmade.json
  3) 高阶角心（中心块）：.workbuddy/outputs/xcenter-src/bigbldXcenterAlgToInfoManmade.json
       （blddb.net/bigbld/xcenter.html，人造风格）
       + tools/4bld/center-data.js 的 algs（用户 Excel 公式表 = 真值源，仅缓冲 D 优先）
  4) 高阶棱心（T-Center）：.workbuddy/outputs/blddb-src/bigbldTcenterAlgToInfoManmade.json
  5) 高阶中棱（Midge）：.workbuddy/outputs/blddb-src/bigbldMidgeAlgToInfoManmade.json
       （4/5 来源均为 blddb.net/bigbld/ 人造风格；--fetch 可重新抓取）

字母表口径（棱心/中棱）：
  - 两者字母表都与「三盲棱块」同一套（blddb 的 edgePosToCode）：A=UF、B=FU、C=UL…
  - 棱心位置 = (名字首字面, 次字侧)：字母 A（名字 UF）= U 面上贴 F 侧的那片 T 中心
    （用 setcode.js 的 144 槽默认字母串逐点验证：U 面 4 片 = A/C/E/G，F 面 = B/J/Q/S，与棱字母全吻合）；
  - 中棱位置 = 棱槽 + 取向（与棱块同构：UF/FU 同槽不同向），故同块非法 → 440 有效格/缓冲；
  - 棱心每字母自成一块 → 506 有效格/缓冲（与角心/翼棱同构）。
  - 中棱查表走 edgeAlgToStandard 归一化（与 blddb midge 页一致）；棱心不走（与 wing/xcenter 页一致）。

取数口径（三层，与 blddb 官网 algSearch 一致）：
  L1 直接：三循环轮换解析 —— 同一 3-循环可写作 3 种轮换，(B X Y)/(X Y B)/(Y B X) 命中即用
      （中棱额外经 edgeAlgToStandard 归一化）；
  L2 旋转派生：整魔方旋转（24 个保对面置换）共轭 —— 把目标码按旋转 g 变换成 g(B)g(X)g(Y)
      再走 L1，命中则公式按 g 做面置换（含中层 M/E/S 的切片置换）。只处理「干净」公式
      （不含 x/y/z 整魔方旋转步；含旋转步的公式共轭后无法写成单 token，故跳过该条、取同格其他备选）。
  L3 路线 C：仍缺的格不写进数据，页面渲染为「待补」，由用户在浮层手动输入公式
      （localStorage，与既有「参考公式 / 手动输入」同一套机制）。

覆盖率（本脚本实测并打印）：角块 24×378=9072、棱块 24×440=10560、角心/翼棱/棱心 24×506=12144、
中棱 24×440=10560；L1+L2 后六体系均 0 缺失。

中心块缓冲 D 特例（尊重用户既有决策）：
  - Excel 公式表（455 条）作为该格默认公式，blddb 公式作备选（来源数显示「公式表」）；
  - 5 个 intentional 刻意留空格保持留空（反向格公式已覆盖，与四阶中心块页一致）；
  - 其余格（含旧页 46 个「库未收录」空格）用 L1/L2 补上 —— 新训练器比旧页更完整。

用法：
  python gen-data.py            # 生成
  python gen-data.py --check    # 只比对不写入（防手改漂移）
  python gen-data.py --fetch    # 先从 blddb.net 重新抓取源 JSON 再生成
"""
import json, os, re, sys, string, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, 'data')
BLDDB = os.path.join(REPO, 'tools', '3bld', 'blddb', 'assets', 'json')
WING_SRC = os.path.join(REPO, '.workbuddy', 'outputs', 'blddb-src')
XC_SRC = os.path.join(REPO, '.workbuddy', 'outputs', 'xcenter-src')

LETTERS = [c for c in string.ascii_uppercase if c not in ('U', 'V')]   # 24 字母（去 U,V）
NALT = 3          # 每格除主公式外最多带几条备选（主 + 3 = 4 条）

# ---------------------------------------------------------------- 旋转群：24 个保对面面置换
def _comp(g, h): return {k: g[h[k]] for k in g}
_IDEN = {f: f for f in 'UDLFRB'}
_GEN = (
    {'U': 'F', 'F': 'D', 'D': 'B', 'B': 'U', 'L': 'L', 'R': 'R'},   # x
    {'U': 'U', 'D': 'D', 'F': 'L', 'L': 'B', 'B': 'R', 'R': 'F'},   # y
    {'U': 'R', 'R': 'D', 'D': 'L', 'L': 'U', 'F': 'F', 'B': 'B'},   # z
)
def _rot_group():
    seen = {tuple(sorted(_IDEN.items())): _IDEN}
    frontier = [_IDEN]
    while frontier:
        nxt = []
        for g in frontier:
            for gen in _GEN:
                h = _comp(g, gen)
                k = tuple(sorted(h.items()))
                if k not in seen:
                    seen[k] = h
                    nxt.append(h)
        frontier = nxt
    return list(seen.values())
ROTS = _rot_group()
assert len(ROTS) == 24, len(ROTS)

# ---------------------------------------------------------------- 公式工具
# token = 可选层数前缀（如 3Lw / 4Rw）+ 面/中层字母（含小写内层）+ 可选宽层标记 + 可选修饰符
_TOK = re.compile(r"(\d?)([UDLFRBMESudlfrbmes])(w?)(2|'?)")
_ROTMOVE = re.compile(r'(?<![A-Za-z])[xyz][2\']?(?![A-Za-z])')
_SLICE_PAIRS = (('M', 'LR'), ('E', 'UD'), ('S', 'FB'))   # 中层 = 哪两条对面之间

def is_clean(alg):
    """干净 = 不含 x/y/z 整魔方旋转步（共轭后仍可写为单 token 面转动）"""
    return not _ROTMOVE.search(alg)

def _slice_map(g):
    """面置换 g -> 中层置换 {'M': X, 'E': Y, 'S': Z}。g 保对面，故每个中层仍映射到中层
    （如 x 旋转：L/R 不动 → M→M，U/D↔F/B → E↔S）。"""
    def sl(a, b):
        pair = frozenset((a, b))
        for s, faces in _SLICE_PAIRS:
            if pair == frozenset(faces):
                return s
        raise ValueError('bad slice pair %s%s' % (a, b))
    return {'M': sl(g['L'], g['R']), 'E': sl(g['U'], g['D']), 'S': sl(g['F'], g['B'])}

def rotate_alg(alg, g, smap=None):
    """整魔方旋转共轭：面字母按 g 置换，中层字母按切片置换；
    3 层前缀 / 宽层标记 / 修饰符 / 未匹配文本（如 x/y/z）原样保留"""
    if smap is None:
        smap = _slice_map(g)
    out, i = [], 0
    for m in _TOK.finditer(alg):
        out.append(alg[i:m.start()])
        pre, face, wide, mod = m.groups()
        F = face.upper()
        nf = smap[F] if F in 'MES' else g[F]
        out.append(pre + (nf if face.isupper() else nf.lower()) + wide + mod)
        i = m.end()
    out.append(alg[i:])
    return ''.join(out)

def _selftest():
    """令牌覆盖 + 旋转往返：防「公式里有没被映射的记号」这类静默错误"""
    import glob
    srcs = []
    for pat in ('blddb-src/bigbld*AlgToInfoManmade.json', 'xcenter-src/bigbld*AlgToInfoManmade.json'):
        srcs += glob.glob(os.path.join(REPO, '.workbuddy', 'outputs', pat))
    for p in srcs:
        for k, v in json.load(open(p, encoding='utf-8')).items():
            for e in v:
                a = e[0]
                # x/y/z 整魔方旋转步合法地不被映射（L1 直接条目允许含；L2 只取干净公式）
                leftover = _ROTMOVE.sub('', _TOK.sub('', a)).strip()
                assert not leftover, '未映射记号 %r in %s (%s)' % (leftover, k, os.path.basename(p))
    sample = ["U 3Lw' U' l U m U' l' U Lw U'", "S u l' U2 l u' l' U2 l S'",
              "U' m2 U' m U2 m' U' m2 U", "R B' R' S R B R2 F R S' R' F'"]
    for g in ROTS:
        gi = {v: k2 for k2, v in g.items()}
        sm = _slice_map(g)
        for a in sample:
            assert rotate_alg(rotate_alg(a, g, sm), gi, _slice_map(gi)) == a, (a, g)
    print('[selftest] 令牌覆盖 + 旋转往返 OK（%d 个源文件）' % len(srcs))

# ---------------------------------------------------------------- 括号格式（comm）
# blddb 记法：`A:[B,C]` = [A: [B,C]] = A·B·C·B⁻¹·C⁻¹·A⁻¹（共轭套交换子）；`[A,B]` = 交换子。
def _inv_tok(t):
    if t.endswith('2'): return t
    if t.endswith("'"): return t[:-1]
    return t + "'"

def _inv_seq(seq):
    """公式序列（空格分隔字符串）整体求逆：倒序 + 每步求逆"""
    return ' '.join(_inv_tok(t) for t in reversed(seq.split()))

_TOK_FULL = re.compile(r"(\d?)([UDLFRBMESudlfrbmes])(w?)(2|')?$")

def norm_seq(seq):
    """归一化公式序列：合并相邻同面同层步（R R=R2、R2 R=R'、R R'=抵消）。
    blddb 的 comm 记法常把共轭尾步与交换子步合并书写（U' U'→U2），必须归一化后才可比。"""
    out = []   # [[key, 角度1/2/3]...]，key = 层数前缀+面+宽层
    for t in seq.split():
        m = _TOK_FULL.match(t)
        if not m:
            return None                      # 含 x/y/z 等不可合并步 → 放弃归一化
        pre, face, wide, mod = m.groups()
        ang = {'': 1, '2': 2, "'": 3}[mod or '']
        key = (pre or '') + face + (wide or '')
        if out and out[-1][0] == key:
            ang = (out[-1][1] + ang) % 4
            if ang == 0:
                out.pop()
            else:
                out[-1][1] = ang
        else:
            out.append([key, ang])
    return ' '.join(k + {1: '', 2: '2', 3: "'"}[a] for k, a in out)

def expand_comm(comm):
    """把括号格式展开为逐步公式串（自洽验证用：expand(comm) 必须等于源 alg）"""
    c = comm.strip()
    # 顶层 ':'：A:[B,C] → expand(A) + expand(rest) + inv(expand(A))
    depth = 0
    for i, ch in enumerate(c):
        if ch == '[': depth += 1
        elif ch == ']': depth -= 1
        elif ch == ':' and depth == 0:
            ea = expand_comm(c[:i])
            return (ea + ' ' + expand_comm(c[i + 1:]) + ' ' + _inv_seq(ea)).strip()
    # 顶层 '[A,B]'：交换子 → A + B + A⁻¹ + B⁻¹
    if c.startswith('[') and c.endswith(']'):
        inner = c[1:-1]
        depth = 0
        for i, ch in enumerate(inner):
            if ch == '[': depth += 1
            elif ch == ']': depth -= 1
            elif ch == ',' and depth == 0:
                ea = expand_comm(inner[:i])
                eb = expand_comm(inner[i + 1:])
                return (ea + ' ' + eb + ' ' + _inv_seq(ea) + ' ' + _inv_seq(eb)).strip()
    return ' '.join(c.split())      # 纯公式段

def comm_ok(comm, alg):
    """comm 是否与逐步公式语义一致（归一化后逐 token 相等）"""
    if not comm or not alg:
        return False
    a = norm_seq(expand_comm(comm))
    b = norm_seq(alg)
    return a is not None and b is not None and a == b

_COMM_STRUCT = re.compile(r'([\[\],:])')

def rotate_comm(comm, g, smap=None):
    """括号格式随整魔方旋转共轭：结构符 [ ] , : 保留，公式段逐 token 旋转。
    段内含 x/y/z（无法按面置换映射）→ 返回 None（该条放弃括号格式，仍显示展开式）。"""
    if not comm:
        return None
    if smap is None:
        smap = _slice_map(g)
    parts = []
    for seg in _COMM_STRUCT.split(comm):
        if seg in ('[', ']', ',', ':', ''):
            parts.append(seg)
            continue
        for t in seg.split():
            if _ROTMOVE.search(t):
                return None
        parts.append(' '.join(rotate_alg(t, g, smap) for t in seg.split()))
    return ''.join(parts)

def _selftest_comm():
    """comm 自洽抽查：① 源数据一致率（blddb 人为维护的 comm 有瑕疵，只报告不拦截）；
    ② 旋转往返 rotate(rotate(c))==c（rotate_comm 正确性硬断言）"""
    import glob
    n_src = n_ok = n_rot = 0
    for pat in ('blddb-src/bigbld*AlgToInfoManmade.json', 'xcenter-src/bigbld*AlgToInfoManmade.json'):
        for p in glob.glob(os.path.join(REPO, '.workbuddy', 'outputs', pat)):
            for k, v in json.load(open(p, encoding='utf-8')).items():
                for e in v:
                    if len(e) < 3 or not isinstance(e[2], str) or not e[2].strip():
                        continue
                    n_src += 1
                    if comm_ok(e[2].strip(), e[0]):
                        n_ok += 1
    for g in ROTS:
        gi = {v: k2 for k2, v in g.items()}
        sm, smi = _slice_map(g), _slice_map(gi)
        for comm in ("Lw':[r' D2 r,U2]", "Rw B:[R' U' R,u]", "U Lw':[m',U' l U]"):
            r1 = rotate_comm(comm, g, sm)
            if r1 is None:
                continue
            r2 = rotate_comm(r1, gi, smi)
            assert r2 == comm, (comm, r1, r2)
            n_rot += 1
    print('[selftest] comm：源数据 %d 条中 %d 条与公式语义一致（%.0f%%），旋转往返 %d 次 OK'
          % (n_src, n_ok, 100.0 * n_ok / max(n_src, 1), n_rot))

def _rots3(code):
    return [code, code[1:] + code[0], code[2:] + code[0:2]]

def _comm_of(e):
    """源条目 e = [alg, authors, comm] → 与 alg 语义一致的 comm，否则 None。
    blddb 人为维护的 comm 约四成与公式不符（缺步合并/记录偏差），一律先验证后采用——
    宁可没有括号格式，也不能显示一个展开后不等于公式的错误结构。"""
    if len(e) < 3 or not isinstance(e[2], str) or not e[2].strip():
        return None
    c = e[2].strip()
    return c if comm_ok(c, e[0]) else None

# ---------------------------------------------------------------- 源数据加载
def _load(name, base):
    with open(os.path.join(base, name), encoding='utf-8-sig') as f:
        return json.load(f)

# 分组（矩阵左缘色条 / 看板卡组色 / 练习浮层 optgroup）
CORNER_GROUPS = [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I'], ['J', 'K', 'L'],
                 ['W', 'M', 'N'], ['O', 'P', 'Q'], ['R', 'S', 'T'], ['X', 'Y', 'Z']]
CORNER_NAMES = ['黄红蓝', '黄蓝橘', '黄橘绿', '黄红绿', '白蓝红', '白橘蓝', '白绿橘', '白红绿']
EDGE_GROUPS = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J'], ['K', 'L'],
               ['M', 'N'], ['O', 'P'], ['Q', 'R'], ['S', 'T'], ['W', 'X'], ['Y', 'Z']]
CENTER_GROUPS = [['G', 'J', 'A'], ['B', 'L', 'Y', 'N'], ['E', 'C', 'M', 'Q'],
                 ['H', 'F', 'P', 'T'], ['K', 'I', 'S', 'Z'], ['W', 'X', 'R', 'O']]
# 棱心（T-Center）按面分组：字母 = 棱字母，位置 = (首字面, 次字侧)
#   U 面 {UF,UL,UB,UR}={A,C,E,G}；F 面 {FU,FL,FR,FD}={B,S,Q,J}；D 面 {DF,DL,DB,DR}={I,K,M,O}
#   B 面 {BU,BR,BD,BL}={F,Y,N,W}；R 面 {RU,RF,RB,RD}={H,P,Z,R}；L 面 {LU,LF,LB,LD}={D,T,X,L}
TCENTER_GROUPS = [['A', 'C', 'E', 'G'], ['B', 'J', 'Q', 'S'], ['I', 'K', 'M', 'O'],
                  ['F', 'N', 'Y', 'W'], ['H', 'P', 'R', 'Z'], ['D', 'L', 'T', 'X']]

def _piece_map(p2c):
    """字母 -> 所属 piece（角/棱：同 piece 多个字母，按位置面集合归并）"""
    return {letter: frozenset(name) for name, letter in p2c.items()}

def _wing_rot_perms(p2c):
    """翼棱：位置 = (槽位两面集合, 侧面)；返回 [(面置换 g, 字母置换 m), ...] × 24"""
    def canon(n): return (frozenset(n[0:2]), n[2].upper())
    c2l = {canon(n): l for n, l in p2c.items()}
    assert len(c2l) == 24, len(c2l)
    out = []
    for g in ROTS:
        m = {}
        for (slot, side), l in c2l.items():
            m[l] = c2l[(frozenset(g[f] for f in slot), g[side])]
        assert sorted(m.values()) == LETTERS
        out.append((g, m))
    return out

def _center_rot_perms(c2p):
    """角心：位置 = (所在面, 所属角两面集合)，如 Ubl = (U, {B,L})；返回 [(g, m), ...]"""
    k2l = {}
    for l, name in c2p.items():
        k2l[(name[0], frozenset(name[1:]))] = l
    assert len(k2l) == 24, len(k2l)
    out = []
    for g in ROTS:
        m = {}
        for (face, corner), l in k2l.items():
            m[l] = k2l[(g[face], frozenset(g[f] for f in corner))]
        assert sorted(m.values()) == LETTERS
        out.append((g, m))
    return out

def _edge_rot_perms(p2c):
    """棱心 / 中棱：位置名就是棱名（"UF" 两字符）→ 字母置换 = 面置换作用到名字两字符。
    棱心位置 (首字面, 次字侧) 与中棱位置 (棱槽+取向) 在同一名空间，故共用这一套置换。"""
    out = []
    for g in ROTS:
        m = {}
        for name, l in p2c.items():
            m[l] = p2c[g[name[0]] + g[name[1]]]
        assert sorted(m.values()) == LETTERS
        out.append((g, m))
    return out

# ---------------------------------------------------------------- 取数
def resolve_3x3(std, info, night, code):
    """三盲角/棱 L1：三循环轮换 + AlgToStandard 归一化 → 有序参考公式 [[alg,0,None]...]
    （三阶噩梦风格源无括号格式数据，comm 位恒 None）"""
    for r in _rots3(code):
        canon = std.get(r)
        if canon and canon in info:
            dflt = night.get(canon)
            ordered = ([dflt] if dflt else []) + [a for a in info[canon] if a != dflt]
            seen, out = set(), []
            for a in ordered:
                if a and a not in seen:
                    seen.add(a)
                    out.append([a, 0, None])
            return out
    return None

def resolve_big(alg, rotperms, code):
    """四阶翼棱/角心/棱心：L1 直接优先，否则 L2 旋转派生（只共轭干净公式）。
    返回 (refs, origin)；refs = [[alg, 来源数, comm]...]，origin = 'blddb' | 'rot'"""
    for r in _rots3(code):
        if r in alg:
            entries = sorted(alg[r], key=lambda e: len(e[1]), reverse=True)
            refs, seen = [], set()
            for e in entries:
                a = e[0]
                if a and a not in seen:
                    seen.add(a)
                    refs.append([a, len(e[1]), _comm_of(e)])
                if len(refs) >= NALT + 1:
                    break
            return refs, 'blddb'
    best = None
    for g, m in rotperms:
        if all(m[c] == c for c in LETTERS):
            continue
        smap = _slice_map(g)
        t = ''.join(m[c] for c in code)
        for r in _rots3(t):
            if r not in alg:
                continue
            entries = sorted(alg[r], key=lambda e: len(e[1]), reverse=True)
            refs, seen = [], set()
            for e in entries:
                a = e[0]
                if a and is_clean(a) and a not in seen:
                    seen.add(a)
                    refs.append([rotate_alg(a, g, smap), len(e[1]), rotate_comm(_comm_of(e), g, smap)])
                if len(refs) >= NALT + 1:
                    break
            if not refs:
                continue
            score = sum(len(e[1]) for e in entries)
            if best is None or score > best[0]:
                best = (score, refs)
    return (best[1], 'rot') if best else (None, None)

def resolve_midge(std, alg, rotperms, code):
    """中棱：L1 = 三循环轮换 + edgeAlgToStandard 归一化（与 blddb midge 页一致）；
    否则 L2 旋转派生（旋转后的码也过 std 归一化，只共轭干净公式）。
    refs = [[alg, 来源数, comm]...]"""
    for r in _rots3(code):
        canon = std.get(r)
        if canon and canon in alg:
            entries = sorted(alg[canon], key=lambda e: len(e[1]), reverse=True)
            refs, seen = [], set()
            for e in entries:
                a = e[0]
                if a and a not in seen:
                    seen.add(a)
                    refs.append([a, len(e[1]), _comm_of(e)])
                if len(refs) >= NALT + 1:
                    break
            return refs, 'blddb'
    best = None
    for g, m in rotperms:
        if all(m[c] == c for c in LETTERS):
            continue
        smap = _slice_map(g)
        t = ''.join(m[c] for c in code)
        for r in _rots3(t):
            canon = std.get(r)
            if not canon or canon not in alg:
                continue
            entries = sorted(alg[canon], key=lambda e: len(e[1]), reverse=True)
            refs, seen = [], set()
            for e in entries:
                a = e[0]
                if a and is_clean(a) and a not in seen:
                    seen.add(a)
                    refs.append([rotate_alg(a, g, smap), len(e[1]), rotate_comm(_comm_of(e), g, smap)])
                if len(refs) >= NALT + 1:
                    break
            if not refs:
                continue
            score = sum(len(e[1]) for e in entries)
            if best is None or score > best[0]:
                best = (score, refs)
    return (best[1], 'rot') if best else (None, None)

# ---------------------------------------------------------------- Excel 中心块公式（真值源）
def load_excel_center():
    """从 tools/4bld/center-data.js 抽 algs（键 = 两字母 row+col，缓冲 D）与 intentional"""
    with open(os.path.join(HERE, '..', '4bld', 'center-data.js'), encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'algs:\s*\{(.*?)\n  \},', text, re.S)
    assert m, '找不到 center-data.js 的 algs'
    algs = dict(re.findall(r'"([A-Z]{2})":\s*"((?:[^"\\]|\\.)*)"', m.group(1)))
    ml = re.search(r'^\s*intentional:\s*(\[.*\])\s*,', text, re.M)
    intentional = set(a + b for a, b in re.findall(r'"([A-Z])","([A-Z])"', ml.group(1))) if ml else set()
    return algs, intentional

# ---------------------------------------------------------------- 主流程
def build():
    systems = {}

    # ============ 三盲角块 ============
    info = _load('cornerAlgToInfo.json', BLDDB)
    std = _load('cornerAlgToStandard.json', BLDDB)
    night = _load('cornerAlgToNightmare.json', BLDDB)
    c2p = _load('cornerCodeToPos.json', BLDDB)
    systems['corner'] = dict(
        kind='3x3', info=info, std=std, night=night, c2p=c2p,
        piece=_piece_map(_load('cornerPosToCode.json', BLDDB)),
        groups=CORNER_GROUPS, names=CORNER_NAMES,
        group_of=lambda L: next(i for i, g in enumerate(CORNER_GROUPS) if L in g),
        pos_fmt=lambda s: s)

    # ============ 三盲棱块 ============
    info = _load('edgeAlgToInfo.json', BLDDB)
    std = _load('edgeAlgToStandard.json', BLDDB)
    night = _load('edgeAlgToNightmare.json', BLDDB)
    c2p = _load('edgeCodeToPos.json', BLDDB)
    systems['edge'] = dict(
        kind='3x3', info=info, std=std, night=night, c2p=c2p,
        piece=_piece_map(_load('edgePosToCode.json', BLDDB)),
        groups=EDGE_GROUPS, names=None,
        group_of=lambda L: next(i for i, g in enumerate(EDGE_GROUPS) if L in g),
        pos_fmt=lambda s: s)

    # ============ 高阶翼棱 ============
    alg = _load('bigbldWingAlgToInfoManmade.json', WING_SRC)
    p2c = _load('bidbldWingPosToCode.json', WING_SRC)
    c2p = {v: k for k, v in p2c.items()}
    systems['wing'] = dict(
        kind='big', alg=alg, rotperms=_wing_rot_perms(p2c), c2p=c2p,
        groups=EDGE_GROUPS, names=None,
        group_of=lambda L: next(i for i, g in enumerate(EDGE_GROUPS) if L in g),
        pos_fmt=lambda s: s)

    # ============ 四阶角心（中心块） ============
    alg = _load('bigbldXcenterAlgToInfoManmade.json', XC_SRC)
    c2p = _load('cornerCodeToPos.json', XC_SRC)
    excel, intentional = load_excel_center()
    systems['center'] = dict(
        kind='big', alg=alg, rotperms=_center_rot_perms(c2p), c2p=c2p,
        groups=CENTER_GROUPS, names=None,
        group_of=lambda L: next(i for i, g in enumerate(CENTER_GROUPS) if L in g),
        pos_fmt=lambda s: s[0] + s[1:].lower(),     # UBL -> Ubl（与四阶中心块页一致）
        excel=excel, intentional=intentional)

    # ============ 高阶棱心（T-Center，五阶+） ============
    # 字母表 = 棱块字母表（edgePosToCode）：字母 A（名字 UF）= U 面上贴 F 侧的棱心
    alg = _load('bigbldTcenterAlgToInfoManmade.json', WING_SRC)
    e2p = _load('edgePosToCode.json', BLDDB)
    systems['tcenter'] = dict(
        kind='big', alg=alg, rotperms=_edge_rot_perms(e2p), c2p={v: k for k, v in e2p.items()},
        groups=TCENTER_GROUPS, names=None,
        group_of=lambda L: next(i for i, g in enumerate(TCENTER_GROUPS) if L in g),
        pos_fmt=lambda s: s)

    # ============ 高阶中棱（Midge，五阶+） ============
    # 字母表 = 棱块字母表；UF/FU 同槽不同取向 → 同块非法 → 440 有效格/缓冲（与棱块同构）
    alg = _load('bigbldMidgeAlgToInfoManmade.json', WING_SRC)
    systems['midge'] = dict(
        kind='midge', alg=alg, std=_load('edgeAlgToStandard.json', BLDDB),
        rotperms=_edge_rot_perms(e2p), piece=_piece_map(e2p),
        c2p={v: k for k, v in e2p.items()},
        groups=EDGE_GROUPS, names=None,
        group_of=lambda L: next(i for i, g in enumerate(EDGE_GROUPS) if L in g),
        pos_fmt=lambda s: s)

    manifest = {'systems': {}}
    stats_total = {}

    for sid, S in systems.items():
        piece = S.get('piece')
        pos = {L: S['pos_fmt'](S['c2p'][L]) for L in LETTERS}
        n_direct = n_rot = n_excel = 0
        valid_per_buf, docs = {}, {}
        for buf in LETTERS:
            others = [c for c in LETTERS if c != buf]
            cells, blank, valid = {}, [], 0
            for r in others:
                for c in others:
                    if r == c:
                        continue
                    if piece is not None and (piece[r] == piece[c]
                                              or piece[r] == piece[buf] or piece[c] == piece[buf]):
                        continue          # 两个次字母同属一块 / 属缓冲块 → 非有效 3-循环
                    valid += 1
                    code = buf + r + c
                    if S['kind'] == '3x3':
                        refs = resolve_3x3(S['std'], S['info'], S['night'], code)
                        origin = 'blddb' if refs else None
                    elif S['kind'] == 'midge':
                        refs, origin = resolve_midge(S['std'], S['alg'], S['rotperms'], code)
                    else:
                        refs, origin = resolve_big(S['alg'], S['rotperms'], code)
                    if sid == 'center' and buf == 'D':
                        key = r + c
                        if key in S['intentional']:
                            blank.append(code)
                            continue
                        if key in S['excel']:
                            x = S['excel'][key]
                            refs = ([[x, 0, None]] + [p for p in (refs or []) if p[0] != x])[:NALT + 1]
                            origin = 'excel'
                    if not refs:
                        continue          # L3 待补：不写数据，页面渲染为「待补」
                    # cell = [主公式, 来源数, [[备选,来源数,comm]...], origin, 主公式括号格式]
                    cells[code] = [refs[0][0], refs[0][1],
                                   [[a, n, c] for a, n, c in refs[1:NALT + 1]], origin,
                                   refs[0][2]]
                    if origin == 'excel':
                        n_excel += 1
                    elif origin == 'rot':
                        n_rot += 1
                    else:
                        n_direct += 1
            valid_per_buf[buf] = valid
            doc = {'sys': sid, 'buf': buf, 'bufPos': pos[buf], 'order': others, 'pos': pos,
                   'groups': S['groups'], 'cells': cells, 'blank': blank,
                   'meta': {'valid': valid, 'filled': len(cells), 'blank': len(blank)}}
            if S['names']:
                doc['names'] = S['names']
            docs[buf] = doc
        miss = {b: valid_per_buf[b] - len(docs[b]['cells']) - len(docs[b]['blank']) for b in LETTERS}
        total_miss = sum(miss.values())
        print('[%s] 有效格/缓冲 %d · 直接 %d · 旋转派生 %d · Excel %d · 待补 %d'
              % (sid, valid_per_buf['A'], n_direct, n_rot, n_excel, total_miss))
        if total_miss:
            print('    待补分布:', {b: n for b, n in miss.items() if n})
        stats_total[sid] = dict(direct=n_direct, rot=n_rot, excel=n_excel, miss=total_miss)
        manifest['systems'][sid] = dict(
            name={'corner': '三阶 · 角块', 'edge': '三阶 · 棱块',
                  'center': '高阶 · 角心', 'wing': '高阶 · 翼棱',
                  'tcenter': '高阶 · 棱心', 'midge': '高阶 · 中棱'}[sid],
            buffers=len(LETTERS), cellsPerBuffer=valid_per_buf['A'],
            groups=len(S['groups']), lettersPerGroup=len(S['groups'][0]),
            direct=n_direct, rot=n_rot, excel=n_excel, miss=total_miss,
            # 括号格式（comm）可用性：blddb 人造风格四大体系有，三阶噩梦风格无
            comm=(sid in ('center', 'wing', 'tcenter', 'midge')),
            desc={'corner': '24 字母色组体系 · 每角 3 个字母 · blddb 噩梦风格',
                  'edge': '24 字母标准配对 · 每棱 2 个字母 · blddb 噩梦风格',
                  'center': '24 个角心块 · blddb 人造风格 + 你的 Excel 公式表',
                  'wing': '24 个翼块 · blddb 人造风格（旋转派生补全非 A 缓冲）',
                  'tcenter': '24 个棱心 · 字母同棱块 · blddb 人造风格（旋转派生补全）',
                  'midge': '12 个中棱 × 2 取向 · 字母同棱块 · blddb 人造风格'}[sid])
        S['docs'] = docs
    return systems, manifest, stats_total


def _serialize(systems, manifest):
    files = []
    n_comm = 0
    for sid, S in systems.items():
        for buf, doc in S['docs'].items():
            for code, cell in doc['cells'].items():
                # 硬验证：括号格式展开后必须与逐步公式语义一致（防旋转派生错位 / 脏 comm 漏网）
                for a, c in [(cell[0], cell[4])] + [(x[0], x[2]) for x in (cell[2] or [])]:
                    if not c:
                        continue
                    assert comm_ok(c, a), \
                        'comm 展开不等于公式: %s %s-%s %r vs %r' % (sid, code, buf, c, a)
                    n_comm += 1
            files.append(('%s-%s.json' % (sid, buf),
                          json.dumps(doc, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'))
    print('[comm] %d 条括号格式（含备选）展开验证全部与逐步公式一致' % n_comm)
    files.append(('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1) + '\n'))
    return files


def main():
    _selftest()
    _selftest_comm()
    if '--fetch' in sys.argv:
        import socket
        socket.setdefaulttimeout(300)
        for name, url, base in FETCH:
            print('fetch', url)
            with urllib.request.urlopen(url) as r, open(os.path.join(base, name), 'wb') as f:
                f.write(r.read())
            print('  ->', name, os.path.getsize(os.path.join(base, name)), 'bytes')
    systems, manifest, stats = build()
    files = _serialize(systems, manifest)
    if '--check' in sys.argv:
        drift = [n for n, t in files
                 if not os.path.exists(os.path.join(OUT, n)) or open(os.path.join(OUT, n), encoding='utf-8').read() != t]
        print('CHECK:', 'OK (identical)' if not drift else 'DIFFERS: %s' % drift[:6])
        sys.exit(0 if not drift else 1)
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    changed = []
    for n, t in files:
        p = os.path.join(OUT, n)
        old = open(p, encoding='utf-8').read() if os.path.exists(p) else None
        if old != t:
            with open(p, 'w', encoding='utf-8', newline='\n') as f:
                f.write(t)
            changed.append(n)
    print('written:', len(files), 'files', ('(changed: %s)' % changed[:6]) if changed else '(no change)')
    bad = [s for s, v in stats.items() if v['miss']]
    if bad:
        print('⚠️ 有体系存在 L3 待补格（页面按「待补」渲染，可在浮层手动输入公式补）：', bad)


FETCH = [
    ('bigbldWingAlgToInfoManmade.json',
     'https://blddb.net/assets/json/bigbld/bigbldWingAlgToInfoManmade.json', WING_SRC),
    ('bidbldWingPosToCode.json',
     'https://blddb.net/assets/json/bigbld/bidbldWingPosToCode.json', WING_SRC),
    ('bigbldXcenterAlgToInfoManmade.json',
     'https://blddb.net/assets/json/bigbld/bigbldXcenterAlgToInfoManmade.json', XC_SRC),
    ('cornerCodeToPos.json',
     'https://blddb.net/assets/json/cornerCodeToPos.json', XC_SRC),
    ('bigbldTcenterAlgToInfoManmade.json',
     'https://blddb.net/assets/json/bigbld/bigbldTcenterAlgToInfoManmade.json', WING_SRC),
    ('bigbldMidgeAlgToInfoManmade.json',
     'https://blddb.net/assets/json/bigbld/bigbldMidgeAlgToInfoManmade.json', WING_SRC),
]

if __name__ == '__main__':
    main()
