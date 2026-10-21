# -*- coding: utf-8 -*-
"""从 cubersden.com 抓下来的五魔方 4LLL 详情页里，抽出 37 个 case 的
   名称 / 英文描述 / 主公式 / setup / 俯视图 SVG，整理成 mega.json 需要的结构。

   图只保留三层可用的东西：外轮廓 + 中央五边形 + 五个邻面（去掉投影用的浅色 polygon），
   两种原色换成 class（mg-top = 顶色、mg-gray = 灰），配色交给站点 tokens。
   建库流程（一次性）：把详情页抓到 .cache/cd_mega_pages 下，再解析写 mega.json。
   缓存目录不入库，没网也能重跑 —— 只要 .cache 里的 html 还在。
"""
import re, json, html as H, os, glob, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'mega.json')
PAGES = os.path.join(HERE, '.cache', 'cd_mega_pages')
URL = 'https://cubersden.com/megaminx-ll/mega-{g}-{n}'

# 各组条数（站点现状：2026-10 抓取。若对方新增 case，改这里即可）
MAX = {'eo': 3, 'co': 16, 'cp': 3, 'ep': 15}
FETCH_ON = os.path.isdir(PAGES) is False or '--fetch' in sys.argv

GROUP = {'eo': 'Edge Orientation', 'co': 'Corner Orientation',
         'cp': 'Corner Permutation', 'ep': 'Edge Permutation'}
ORDER = ['eo', 'co', 'cp', 'ep']

LIGHT = '#e8e6dc'   # 原图的「顶色」贴纸
DARK = '#2b2f3d'    # 原图的「灰」贴纸


def plain(h):
    hd = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)
    t = H.unescape(re.sub(r'<[^>]+>', ' ', hd))
    return re.sub(r'\s+', ' ', t)


def pick_svg(h):
    """页面里第一张 100x100 的 svg 就是该 case 的俯视图"""
    m = re.search(r'<svg[^>]*viewBox="0 0 100 100".*?</svg>', h, re.S)
    return m.group(0) if m else None


def clean_svg(svg):
    if not svg:
        return None
    s = svg
    # 去掉外层属性，只留 viewBox
    s = re.sub(r'^<svg[^>]*>', '<svg class="cfop-net cfop-net--mega" viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">', s)
    # 去掉投影 polygon（fill 是 rgba 那个）
    s = re.sub(r'<polygon[^>]*fill="rgba\([^"]*\)"[^>]*/?>(</polygon>)?', '', s)
    # 两种主色 → class
    s = re.sub(r'fill="#%s"' % LIGHT.lstrip('#'), 'class="mg-top"', s, flags=re.I)
    s = re.sub(r'fill="#%s"' % DARK.lstrip('#'), 'class="mg-gray"', s, flags=re.I)
    # 分组描边统一成 class
    s = s.replace('<g stroke="#0b0d13" stroke-width="1" stroke-linejoin="round">',
                  '<g class="mg-line">')
    # 兜底：还有硬编码描边的
    s = re.sub(r'stroke="#0b0d13"', '', s)
    s = re.sub(r'\s{2,}', ' ', s)
    return s


def fetch(g, n, retry=2):
    """抓详情页到本地缓存（SSR 页面，直接 GET 即可）"""
    f = os.path.join(PAGES, 'mega-%s-%d.html' % (g, n))
    if os.path.isfile(f) and os.path.getsize(f) > 1024:
        return f
    url = URL.format(g=g, n=n)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36'})
    for i in range(retry + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                h = r.read().decode('utf-8', 'replace')
            if 'Algorithm' not in h:
                raise ValueError('页面里没找到 Algorithm 字段，可能被反爬或改版')
            os.makedirs(PAGES, exist_ok=True)
            with open(f, 'w', encoding='utf-8') as fp:
                fp.write(h)
            time.sleep(0.3)
            return f
        except Exception as e:
            if i == retry:
                print('  !! 抓取失败 %s-%d: %s' % (g, n, e))
                return None
            time.sleep(1.5)


rows = []
for g in ORDER:
    if FETCH_ON:
        files = [p for p in (fetch(g, n) for n in range(1, MAX[g] + 1)) if p]
    else:
        files = glob.glob(os.path.join(PAGES, 'mega-%s-*.html' % g))
    files.sort(key=lambda p: int(re.search(r'-(\d+)\.html$', p).group(1)))
    for f in files:
        h = open(f, encoding='utf-8').read()
        t = plain(h)
        n = int(re.search(r'-(\d+)\.html$', f).group(1))
        name = ('EO' if g == 'eo' else g.upper()) + ' ' + str(n)
        # 描述：'Megaminx EO 1 — two neighbours flipped'
        dm = re.search(r'Megaminx %s \d+ — ([^|]{0,90}?)\s+(?:Drill|Train|The |Recognition)' % name.split()[0], t)
        desc = dm.group(1).strip() if dm else ''
        # 主公式
        am = re.search(r'Algorithm\s+([UDLRFBMESudlrfbxyz][^.]{1,90}?)\s+\d+ moves', t)
        alg = re.sub(r'\s+', ' ', am.group(1)).strip() if am else ''
        # setup
        sm = re.search(r'reach the Megaminx %s case so you can practise it on demand:\s+([^C]{2,90}?)\s+Copy' % re.escape(name), t)
        setup = re.sub(r'\s+', ' ', sm.group(1)).strip() if sm else ''
        svg = clean_svg(pick_svg(h))
        if not alg or not svg:
            print('  !! 缺内容', name, 'alg=', bool(alg), 'svg=', bool(svg))
        rows.append({
            'id': name,
            'subgroup': GROUP[g],
            'desc': desc,
            'setup': setup,
            'facelets': None,
            'art': svg,
            'orientations': [{'name': '', 'algs': [alg] if alg else []}]
        })

data = {'set': 'mega', 'count': len(rows), 'cases': rows}
if not rows:
    print('!! 一条都没解析出来，拒绝覆盖 %s（检查网络或 %s 下是否有 html）'
          % (os.path.basename(OUT), PAGES))
    sys.exit(1)
if len(rows) != sum(MAX.values()):
    print('!! 只解析出 %d 条，预期 %d 条 —— 拒绝写入，请先看上面缺了哪些' % (len(rows), sum(MAX.values())))
    sys.exit(1)
with open(OUT, 'w', encoding='utf-8') as fp:
    json.dump(data, fp, ensure_ascii=False)

print('写入', len(rows), '条 →', os.path.basename(OUT), '%.1f KB' % (os.path.getsize(OUT) / 1024))
for r in rows[:3] + rows[19:22] + rows[22:24]:
    print(' ', r['id'], '|', r['desc'][:40], '| alg:', r['orientations'][0]['algs'][0][:44], '| svg', len(r['art'] or ''))
