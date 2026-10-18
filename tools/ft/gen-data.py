# -*- coding: utf-8 -*-
"""gen-data.py — 生成「公式训练器」(tools/ft) 全部训练数据（按缓冲切片的 JSON）

产物：tools/ft/data/{corner,edge,center,wing}-<缓冲字母>.json（24 缓冲 × 4 体系 = 96 个）
      + tools/ft/data/manifest.json（入口页元数据）

数据来源（三处；字母表经程序化比对完全一致，逐字母对齐、无需转换）：
  1) 三盲角块 / 棱块：tools/3bld/blddb/assets/json/
       cornerAlgToInfo + cornerAlgToStandard + cornerAlgToNightmare + cornerCodeToPos
       edgeAlgToInfo  + edgeAlgToStandard  + edgeAlgToNightmare  + edgeCodeToPos
     键 = 位置三元组（首字母即缓冲位），经 AlgToStandard 归一化后查公式数组。
     本站色组字母与 blddb 逐字母同一体系（黄=U/白=D/红=F/橘=B/绿=R/蓝=L，6 组全验无冲突）。
  2) 高阶翼棱：.workbuddy/outputs/blddb-src/bigbldWingAlgToInfoManmade.json
       （blddb.net/bigbld/wing.html，人造风格；--fetch 可重新抓取）
  3) 四阶角心（中心块）：.workbuddy/outputs/xcenter-src/bigbldXcenterAlgToInfoManmade.json
       （blddb.net/bigbld/xcenter.html，人造风格；--fetch 可重新抓取）
       + tools/4bld/center-data.js 的 algs（用户 Excel 公式表 = 真值源，仅缓冲 D 优先）

取数口径（三层，与 blddb 官网 algSearch 一致）：
  L1 直接：三循环轮换解析 —— 同一 3-循环可写作 3 种轮换，(B X Y)/(X Y B)/(Y B X) 命中即用；
  L2 旋转派生：整魔方旋转（24 个保对面置换）共轭 —— 把目标码按旋转 g 变换成 g(B)g(X)g(Y)
     再走 L1，命中则公式按 g 做面置换。只处理「干净」公式（不含 x/y/z 整魔方旋转步；
     含旋转步的公式共轭后无法写成单 token，故跳过该条、取同格其他备选）。
  L3 路线 C：仍缺的格不写进数据，页面渲染为「待补」，由老师在浮层手动输入公式
     （localStorage，与既有「参考公式 / 手动输入」同一套机制）。

覆盖率（本脚本实测并打印）：角块 24×378=9072、棱块 24×440=10560、角心/翼棱 24×506=12144，
L1+L2 后四体系均 0 缺失（角/棱全靠 L1；角心 5592 直接+6552 派生；翼棱 3462+8682）。

中心块缓冲 D 特例（尊重用户既有决策）：
  - Excel 公式表（435 条）作为该格默认公式，blddb 公式作备选（来源数显示「公式表」）；
  - 5 个 intentional 刻意留空格保持留空（反向格公式已覆盖，与四阶中心块页一致）；
  - 其余格（含旧页 46 个「库未收录」空格）用 L1/L2 补上 —— 新训练器比旧页更完整。

用法：
  python gen-data.py            # 生成
  python gen-data.py --check    # 只比对不写入（防手改漂移）
  python gen-data.py --fetch    # 先从 blddb.net 重新抓取翼棱/角心源 JSON 再生成
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
_TOK = re.compile(r'(3?)([UDLFRBudlfrb])(w?)(2|\'?)')
_ROTMOVE = re.compile(r'(?<![A-Za-z])[xyz][2\']?(?![A-Za-z])')
def is_clean(alg):
    """干净 = 不含 x/y/z 整魔方旋转步（共轭后仍可写为单 token 面转动）"""
    return not _ROTMOVE.search(alg)

def rotate_alg(alg, g):
    """整魔方旋转共轭：面字母按 g 置换；宽/内层标记、修饰符、未匹配文本原样保留"""
    out, i = [], 0
    for m in _TOK.finditer(alg):
        out.append(alg[i:m.start()])
        pre, face, wide, mod = m.groups()
        nf = g[face.upper()]
        out.append(pre + (nf if face.isupper() else nf.lower()) + wide + mod)
        i = m.end()
    out.append(alg[i:])
    return ''.join(out)

def _rots3(code):
    return [code, code[1:] + code[0], code[2:] + code[0:2]]

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

# ---------------------------------------------------------------- 取数
def resolve_3x3(std, info, night, code):
    """三盲角/棱 L1：三循环轮换 + AlgToStandard 归一化 → 有序参考公式 [[alg,0]...]"""
    for r in _rots3(code):
        canon = std.get(r)
        if canon and canon in info:
            dflt = night.get(canon)
            ordered = ([dflt] if dflt else []) + [a for a in info[canon] if a != dflt]
            seen, out = set(), []
            for a in ordered:
                if a and a not in seen:
                    seen.add(a)
                    out.append([a, 0])
            return out
    return None

def resolve_big(alg, rotperms, code):
    """四阶翼棱/角心：L1 直接优先，否则 L2 旋转派生（只共轭干净公式）。
    返回 (refs, origin)；refs = [[alg, 来源数]...]，origin = 'blddb' | 'rot'"""
    for r in _rots3(code):
        if r in alg:
            entries = sorted(alg[r], key=lambda e: len(e[1]), reverse=True)
            refs, seen = [], set()
            for e in entries:
                a = e[0]
                if a and a not in seen:
                    seen.add(a)
                    refs.append([a, len(e[1])])
                if len(refs) >= NALT + 1:
                    break
            return refs, 'blddb'
    best = None
    for g, m in rotperms:
        if all(m[c] == c for c in LETTERS):
            continue
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
                    refs.append([rotate_alg(a, g), len(e[1])])
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
                    else:
                        refs, origin = resolve_big(S['alg'], S['rotperms'], code)
                    if sid == 'center' and buf == 'D':
                        key = r + c
                        if key in S['intentional']:
                            blank.append(code)
                            continue
                        if key in S['excel']:
                            x = S['excel'][key]
                            refs = ([[x, 0]] + [p for p in (refs or []) if p[0] != x])[:NALT + 1]
                            origin = 'excel'
                    if not refs:
                        continue          # L3 待补：不写数据，页面渲染为「待补」
                    cells[code] = [refs[0][0], refs[0][1],
                                   [[a, n] for a, n in refs[1:NALT + 1]], origin]
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
            name={'corner': '三盲 · 角块', 'edge': '三盲 · 棱块',
                  'center': '四阶 · 中心块', 'wing': '高阶 · 翼棱'}[sid],
            buffers=len(LETTERS), cellsPerBuffer=valid_per_buf['A'],
            groups=len(S['groups']), lettersPerGroup=len(S['groups'][0]),
            direct=n_direct, rot=n_rot, excel=n_excel, miss=total_miss,
            desc={'corner': '24 字母色组体系 · 每角 3 个字母 · blddb 噩梦风格',
                  'edge': '24 字母标准配对 · 每棱 2 个字母 · blddb 噩梦风格',
                  'center': '24 个中心块 · blddb 人造风格 + 你的 Excel 公式表',
                  'wing': '24 个翼块 · blddb 人造风格（旋转派生补全非 A 缓冲）'}[sid])
        S['docs'] = docs
    return systems, manifest, stats_total


def _serialize(systems, manifest):
    files = []
    for sid, S in systems.items():
        for buf, doc in S['docs'].items():
            files.append(('%s-%s.json' % (sid, buf),
                          json.dumps(doc, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n'))
    files.append(('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1) + '\n'))
    return files


def main():
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
]

if __name__ == '__main__':
    main()
