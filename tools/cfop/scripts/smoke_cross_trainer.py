# -*- coding: utf-8 -*-
"""smoke_cross_trainer.py — Cross Trainer 浏览器冒烟测试（Playwright）

覆盖：
  [1] 页面结构（6 色 / 8 档步数 / 立体视图 / 无控制台错误）
  [2] 分段控件选中态（.is-active 类 + 由 site-nav.js 同步的 aria-pressed）
  [3] 6 色 × 目标步数 1~8：打乱 ≤ 10 步，且「打乱 + 页面给出的解法」在贴纸模型上
      确实让十字复原，同时十字最优步数 == 目标步数
  [3b] 6 色渲染保真：正对十字色时，渲染出的面与贴纸模型逐贴纸一致
  [4] 解法面板显示 / 跨打乱保持 / 复制 / 3D 外链
  [5] 立体视图拖拽旋转、「对准十字色」视角切换
  [6] 浅色主题下无横向滚动

用法：
  python -m http.server 8099          # 于站点根目录
  python tools/cfop/scripts/smoke_cross_trainer.py
  python tools/cfop/scripts/smoke_cross_trainer.py https://mrcubessr.github.io   # 线上回归
"""
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

# 可传第一个参数指定站点根（默认本地），线上回归与本地跑的是同一套断言。
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099").rstrip("/")
LIVE = "localhost" not in BASE and "127.0.0.1" not in BASE
TAG = "_live" if LIVE else ""
PAGE = BASE + "/tools/cfop/cross-trainer.html"
OUT = Path(__file__).resolve().parents[3] / ".workbuddy" / "outputs"
OUT.mkdir(parents=True, exist_ok=True)

# 读取页面状态的探针。
#   · 当前颜色 / 步数以 window.__ct.state 为准（权威内部状态），
#     同时回读控件上的 .is-active 与 aria-pressed，验证 UI 与状态一致。
#   · 十字最优步数由 CrossSolver 现算，独立于页面文字。
#   · 端到端：把「打乱 + 页面给出的解法」套到贴纸模型上，检查十字是否真的复原。
#   · 渲染保真：正对某面时，渲染出的 9 张贴纸应与模型的该面逐贴纸一致。
READ = r"""
() => {
  const txt = id => { const e = document.getElementById(id); return e ? e.textContent : ""; };
  const list = sel => [...document.querySelectorAll(sel)];
  const RC = window.RubikCore, CS = window.CrossSolver;

  const btns = sel => list(sel);
  const colorBtns = btns('#ct-colors .seg__btn');
  const stepBtns = btns('#ct-moves .seg__btn');
  const litColor = colorBtns.filter(b => b.classList.contains('is-active')).map(b => b.dataset.color);
  const litStep = stepBtns.filter(b => b.classList.contains('is-active')).map(b => +b.dataset.step);
  const pressedColor = colorBtns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.color);
  const pressedStep = stepBtns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.step);

  const st = (window.__ct && window.__ct.state) || {};
  const cur = (window.__ct && window.__ct.current) || {};
  const curMoves = cur.moves || [];
  const curSol = cur.solution || [];
  const shown = txt('ct-scramble').trim().split(/\s+/).filter(Boolean);
  const hasSolver = !!CS && !!RC;
  const sol = document.getElementById('ct-solution');
  const align = document.getElementById('ct-align');

  /* 颜色字符 → 面记号（与 cube3d.js 的 --face-* 约定一致：白=u 黄=d 绿=f 蓝=b 红=r 橙=l） */
  const TOK = {};
  if (RC) Object.keys(RC.SOLVED).forEach(f => { TOK[RC.SOLVED[f]] = f.toLowerCase(); });

  /* 立体视图做了背面剔除：等轴视角看到 3 个面（3 底 + 27 贴纸），
     正对一个面时只看到 1 个面（1 底 + 9 贴纸）。
     该面 9 张贴纸的 DOM 顺序 == facelet 索引顺序（row*3+col）。 */
  const groups = list('.c3-view g.c3-face');
  const faceStickers = (groups.length === 1)
    ? [...groups[0].querySelectorAll('polygon')].slice(1).map(p => {
        const m = (p.getAttribute('style') || '').match(/var\(--face-([a-z])/);
        return m ? m[1] : '?';
      })
    : [];
  const nFaceGroups = groups.length;

  /* 正对某面时，若贴纸之间没有缝隙（露出 .c3-body 深色底）就会糊成一整块色板。
     getBBox 在正投影的轴对齐情形下是精确的：面部宽度 - 3×贴纸宽度 = 缝隙总宽。 */
  let stickerGap = null;
  if (nFaceGroups === 1) {
    const polys = [...groups[0].querySelectorAll('polygon')];
    const body = polys[0], st = polys[1];
    if (body && st && body.getBBox && st.getBBox) {
      stickerGap = Math.round((body.getBBox().width - 3 * st.getBBox().width) * 1000) / 1000;
    }
  }

  let e2e = null, modelFace = '', renderMatches = null, crossColor = '';
  if (hasSolver && st.color && curMoves.length) {
    const C = CS.COLORS_BY_KEY[st.color];
    crossColor = RC.SOLVED[C.face];                       // 该面的本色字符，如 U → 'w'
    /* 立体视图渲染的是「打乱后」的状态 → 渲染保真对比用只套打乱的 cube */
    const scram = RC.newCube();
    RC.applyAlg(scram, curMoves.join(' '));
    modelFace = [...scram[C.face]].map(ch => TOK[ch]).join('');
    if (nFaceGroups === 1) renderMatches = (faceStickers.join('') === modelFace);
    /* 端到端：打乱 → 页面给出的解法 之后，十字应复原。
       棱位 = facelet 索引 1/3/5/7，中心 = 4 ⇒ 十字复原时这 5 格都是本色。 */
    const cube = RC.newCube();
    RC.applyAlg(cube, curMoves.join(' '));
    RC.applyAlg(cube, curSol.join(' '));
    const arr = cube[C.face];
    e2e = [1, 3, 4, 5, 7].every(i => arr[i] === crossColor);
  }

  /* 计时器是页面视觉焦点，必须在深浅两种主题下都达到 WCAG AA 正文对比度。
     沿祖先链找第一个不透明背景作为比较基准。 */
  function lum(c) {
    const m = (c.match(/[0-9.]+/g) || []).slice(0, 3).map(Number).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  }
  let timerContrast = null, timerColor = '', timerBg = '';
  const tm = document.getElementById('ct-timer');
  if (tm) {
    timerColor = getComputedStyle(tm).color;
    let el = tm; timerBg = 'rgba(0, 0, 0, 0)';
    while (el && (timerBg === 'rgba(0, 0, 0, 0)' || timerBg === 'transparent')) {
      timerBg = getComputedStyle(el).backgroundColor;
      el = el.parentElement;
    }
    const a = lum(timerColor), b = lum(timerBg);
    timerContrast = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  }

  return {
    hasSolver: hasSolver,
    timerContrast: timerContrast,
    timerColor: timerColor,
    timerBg: timerBg,
    nColors: colorBtns.length,
    nSteps: stepBtns.length,
    colors: colorBtns.map(b => b.dataset.color),
    stateColor: st.color,
    stateStep: st.steps,
    litColor: litColor,
    litStep: litStep,
    pressedColor: pressedColor,
    pressedStep: pressedStep,
    moves: shown,
    curMoves: curMoves,
    length: shown.length,
    dist: (hasSolver && st.color && shown.length) ? CS.distance(st.color, shown) : -1,
    e2e: e2e,
    crossColor: crossColor,
    info: txt('ct-info'),
    len: txt('ct-len'),
    solHidden: sol ? sol.hidden : null,
    solDisplay: sol ? getComputedStyle(sol).display : "",
    solText: sol ? txt('ct-sol-text').trim() : "",
    solLen: txt('ct-sol-text').trim().split(/\s+/).filter(Boolean).length,
    curSolLen: curSol.length,
    solBtnPressed: (document.getElementById('ct-sol') || {}).getAttribute
                   ? document.getElementById('ct-sol').getAttribute('aria-pressed') : '',
    viz: (document.getElementById('ct-viz') || {}).getAttribute
         ? document.getElementById('ct-viz').getAttribute('href') : '',
    alignPressed: align ? align.getAttribute('aria-pressed') : '',
    alignLit: align ? align.classList.contains('is-active') : null,
    polys: document.querySelectorAll('.c3-view polygon').length,
    nFaceGroups: nFaceGroups,
    faceStickers: faceStickers.join(''),
    modelFace: modelFace,
    renderMatches: renderMatches,
    stickerGap: stickerGap,
    viewHTML: (document.querySelector('.c3-view') || {}).outerHTML || ''
  };
}
"""

fails = []


def check(name, cond, extra=""):
    print(("  OK   " if cond else "  FAIL ") + name + (("  → " + str(extra)) if (extra and not cond) else ""))
    if not cond:
        fails.append(name)


print("被测站点：" + PAGE + ("  [线上回归]" if LIVE else "  [本地]") + "\n")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 960}, device_scale_factor=2)
    errs = []
    page.on("console", lambda m: errs.append("[console] " + m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("[pageerror] " + str(e)))

    page.goto(PAGE, wait_until="networkidle")
    page.wait_for_selector(".c3-view", timeout=20000)
    page.wait_for_timeout(300)

    print("[1] 页面结构")
    r = page.evaluate(READ)
    check("求解器与模型已加载", r["hasSolver"] and r["stateColor"], r)
    check("无控制台错误", not errs, errs)
    check("十字颜色 6 个", r["nColors"] == 6, r["nColors"])
    check("目标步数 1~8", r["nSteps"] == 8, r["nSteps"])
    check("立体视图已渲染（等轴视角 3 面 = 3 底 + 27 贴纸）", r["polys"] == 30, r["polys"])
    check("默认打乱非空", r["length"] > 0, r["length"])
    check("深色下计时器对比度 ≥ 4.5:1", r["timerContrast"] >= 4.5,
          (r["timerColor"], r["timerBg"], r["timerContrast"]))

    print("[2] 分段控件选中态（.is-active 与 aria-pressed 一致，且唯一）")
    check("颜色按钮恰有 1 个选中", len(r["litColor"]) == 1, r["litColor"])
    check("颜色选中项 == 内部状态", r["litColor"] == [r["stateColor"]], (r["litColor"], r["stateColor"]))
    check("颜色 aria-pressed 与 .is-active 同步", r["pressedColor"] == r["litColor"],
          (r["pressedColor"], r["litColor"]))
    check("步数按钮恰有 1 个选中", len(r["litStep"]) == 1, r["litStep"])
    check("步数选中项 == 内部状态", r["litStep"] == [r["stateStep"]], (r["litStep"], r["stateStep"]))
    check("步数 aria-pressed 与 .is-active 同步", r["pressedStep"] == r["litStep"],
          (r["pressedStep"], r["litStep"]))

    print("[3] 6 色 × 步数 1~8：打乱 ≤10 步、十字最优步数 == 目标、解法真的能复原十字")
    for color in r["colors"]:
        page.click('#ct-colors .seg__btn[data-color="%s"]' % color)
        for step in (1, 2, 3, 4, 5, 6, 7, 8):
            page.click('#ct-moves .seg__btn[data-step="%d"]' % step)
            page.wait_for_timeout(90)
            d = page.evaluate(READ)
            ok = (d["stateColor"] == color and d["stateStep"] == step
                  and d["litColor"] == [color] and d["litStep"] == [step]
                  and d["length"] <= 10 and d["length"] > 0
                  and d["dist"] == step
                  and d["e2e"] is True and d["curSolLen"] == step
                  and ("10" in d["len"]))
            check("%s色 / %d 步：打乱 %d 步、最优 %d 步、解法 %d 步且复原十字"
                  % (color, step, d["length"], d["dist"], d["curSolLen"]), ok, d)

    print("[3b] 6 色渲染保真：正对十字色时渲染面与贴纸模型逐贴纸一致")
    for color in r["colors"]:
        page.click('#ct-colors .seg__btn[data-color="%s"]' % color)
        page.wait_for_timeout(80)
        page.click('#ct-align')
        page.wait_for_timeout(150)
        d = page.evaluate(READ)
        check("%s色：可见面 %s == 模型 %s" % (color, d["faceStickers"], d["modelFace"]),
              d["nFaceGroups"] == 1 and d["renderMatches"] is True,
              (d["nFaceGroups"], d["faceStickers"], d["modelFace"]))
        page.click('#ct-align')
        page.wait_for_timeout(80)
    page.click('#ct-colors .seg__btn[data-color="%s"]' % r["stateColor"])
    page.wait_for_timeout(80)

    print("[4] 解法面板 / 复制 / 3D 外链")
    d = page.evaluate(READ)
    check("默认隐藏解法（hidden 属性 + 计算样式均为隐藏）",
          d["solHidden"] is True and d["solDisplay"] == "none", (d["solHidden"], d["solDisplay"]))
    page.click('#ct-sol')
    page.wait_for_timeout(120)
    d = page.evaluate(READ)
    check("点击后显示解法", d["solHidden"] is False and d["solDisplay"] != "none", d["solDisplay"])
    check("解法按钮转为选中态且文字与内部解法一致",
          d["solBtnPressed"] == "true" and d["solLen"] == d["curSolLen"] == d["stateStep"], d)

    prev_sol = d["solText"]
    page.click('#ct-new')
    page.wait_for_timeout(150)
    d = page.evaluate(READ)
    check("换打乱后解法面板保持显示", d["solHidden"] is False and d["solDisplay"] != "none")
    check("换打乱后解法已更新且步数正确",
          d["solLen"] == d["stateStep"] == d["curSolLen"] and d["solText"] != prev_sol,
          (d["solLen"], d["stateStep"]))
    check("换打乱后按钮文案一致",
          page.eval_on_selector('#ct-sol', 'e => e.textContent').strip() == "隐藏十字解法",
          page.eval_on_selector('#ct-sol', 'e => e.textContent'))

    page.click('#ct-sol')
    page.wait_for_timeout(100)
    d = page.evaluate(READ)
    check("再次点击隐藏解法（按钮与面板同时收起）",
          d["solHidden"] is True and d["solBtnPressed"] == "false" and d["solDisplay"] == "none", d)

    page.click('#ct-new')
    page.wait_for_timeout(150)
    d = page.evaluate(READ)
    sc = parse_qs(urlparse(d["viz"]).query).get("scramble", [""])[0]
    check("3D 外链带当前打乱", sc == "_".join(d["moves"]), (sc, d["moves"]))
    check("外链指向 cubedb.net", urlparse(d["viz"]).netloc == "www.cubedb.net", d["viz"])

    page.click('#ct-copy')
    page.wait_for_timeout(120)
    check("复制按钮有反馈",
          "已复制" in page.eval_on_selector('#ct-copy', 'e => e.textContent'))

    print("[5] 立体视图拖拽 / 对准十字色")
    before = page.evaluate(READ)["viewHTML"]
    box = page.eval_on_selector(
        "#ct-net", "e => { const r = e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; }")
    page.mouse.move(box["x"], box["y"])
    page.mouse.down()
    page.mouse.move(box["x"] + 90, box["y"] - 40, steps=8)
    page.mouse.up()
    page.wait_for_timeout(200)
    check("拖拽旋转改变视图", before != page.evaluate(READ)["viewHTML"])

    page.click('#ct-align')
    page.wait_for_timeout(200)
    d = page.evaluate(READ)
    check("对准十字色：按钮进入选中态", d["alignPressed"] == "true" and d["alignLit"] is True, d["alignPressed"])
    check("对准十字色：只看到十字色所在的一个面（1 底 + 9 贴纸）", d["polys"] == 10, d["polys"])
    check("对准十字色：渲染面与模型一致", d["renderMatches"] is True,
          (d["faceStickers"], d["modelFace"]))
    check("对准十字色：贴纸之间留有缝隙（未糊成整块色板）",
          d["stickerGap"] is not None and d["stickerGap"] > 0, d["stickerGap"])
    page.screenshot(path=str(OUT / ("cross-trainer-face%s.png" % TAG)))

    page.click('#ct-align')
    page.wait_for_timeout(200)
    d = page.evaluate(READ)
    check("再点击退出对准", d["alignPressed"] == "false" and d["alignLit"] is False, d["alignPressed"])
    check("退出后回到 3 面等轴视角", d["nFaceGroups"] == 3, d["nFaceGroups"])

    print("[6] 浅色主题")
    page.click('#themeBtn')
    page.wait_for_timeout(250)
    d = page.evaluate(READ)
    check("浅色下无横向滚动",
          page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1"))
    check("浅色下选中态仍在", d["litColor"] != [])
    check("浅色下计时器对比度 ≥ 4.5:1", d["timerContrast"] >= 4.5,
          (d["timerColor"], d["timerBg"], d["timerContrast"]))
    page.screenshot(path=str(OUT / ("cross-trainer-light%s.png" % TAG)))
    page.click('#themeBtn')
    page.wait_for_timeout(150)

    page.screenshot(path=str(OUT / ("cross-trainer%s.png" % TAG)))
    check("截图前解法面板确已收起（避免留下看起来像答案外泄的截图）",
          page.evaluate(READ)["solDisplay"] == "none")
    check("全过程无控制台错误", not errs, errs)

    browser.close()

print()
if fails:
    print("FAILED %d 项：%s" % (len(fails), fails))
    sys.exit(1)
print("全部通过 ✔")
