# -*- coding: utf-8 -*-
"""smoke_cross_trainer.py — Cross Trainer 浏览器冒烟测试（Playwright）

覆盖：
  [1] 页面结构（6 色 / 8 档步数 / 平面展开图 6 面 54 贴纸 / 无控制台错误）
  [2] 分段控件选中态（.is-active 类 + 由 site-nav.js 同步的 aria-pressed）
  [3] 6 色 × 目标步数 1~8：打乱 ≤ 10 步，且「打乱 + 页面给出的解法」在贴纸模型上
      确实让十字复原，同时十字最优步数 == 目标步数
  [3b] 平面展开图渲染保真：54 张贴纸与「打乱后」贴纸模型逐面一致
  [4] 解法面板显示 / 跨打乱保持 / 复制
  [5] 醒目「白顶绿前」朝向提示 + 已移除的 3D / 步数徽章元素不复存在
  [6] 批量 10 个打乱：面板显示 10 条、每条均为合法打乱（最优步数 == 目标、≤10 步）
  [7] 浅色主题下无横向滚动

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
#   · 渲染保真：平面展开图的 54 张贴纸与「打乱后」贴纸模型逐面一致。
READ = r"""
() => {
  const txt = id => { const e = document.getElementById(id); return e ? e.textContent : ""; };
  const list = sel => [...document.querySelectorAll(sel)];
  const RC = window.RubikCore, CS = window.CrossSolver, CA = window.CubeArt;

  const colorBtns = list('#ct-colors .seg__btn');
  const stepBtns = list('#ct-moves .seg__btn');
  const litColor = colorBtns.filter(b => b.classList.contains('is-active')).map(b => b.dataset.color);
  const litStep = stepBtns.filter(b => b.classList.contains('is-active')).map(b => +b.dataset.step);
  const pressedColor = colorBtns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.color);
  const pressedStep = stepBtns.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => +b.dataset.step);

  const st = (window.__ct && window.__ct.state) || {};
  const cur = (window.__ct && window.__ct.current) || {};
  const curMoves = cur.moves || [];
  const curSol = cur.solution || [];
  const shown = txt('ct-scramble').trim().split(/\s+/).filter(Boolean);
  const hasSolver = !!CS && !!RC && !!CA;

  const sol = document.getElementById('ct-solution');
  const batchPanel = document.getElementById('ct-batch-panel');

  /* 平面展开图：6 面 × 9 = 54 个 rect；每格 fill = var(--face-X, 回退色)。
     X 与模型字符映射：u→w d→y f→g b→b r→r l→o */
  const MAP = { u:'w', d:'y', f:'g', b:'b', r:'r', l:'o' };
  const netRects = list('.ct__net .cfop-net--cross rect');
  const netStickers = netRects.map(r => {
    const m = (r.getAttribute('style') || '').match(/var\(--face-([a-z])/);
    return m ? (MAP[m[1]] || '?') : '?';
  });

  /* 颜色字符 → 面记号 */
  const TOK = {};
  if (RC) Object.keys(RC.SOLVED).forEach(f => { TOK[RC.SOLVED[f]] = f; });

  let e2e = null, modelStickers = '', crossColor = '';
  if (hasSolver && st.color && curMoves.length) {
    const C = CS.COLORS_BY_KEY[st.color];
    crossColor = RC.SOLVED[C.face];                       // 该面的本色字符，如 U → 'w'
    /* 端到端：打乱 → 页面给出的解法 之后，十字应复原。
       棱位 = facelet 索引 1/3/5/7，中心 = 4 ⇒ 十字复原时这 5 格都是本色。 */
    const cube = RC.newCube();
    RC.applyAlg(cube, curMoves.join(' '));
    RC.applyAlg(cube, curSol.join(' '));
    const arr = cube[C.face];
    e2e = [1, 3, 4, 5, 7].every(i => arr[i] === crossColor);
    /* 渲染保真：打乱后贴纸模型的 6 面（U,L,F,R,B,D 顺序）逐面拼接 */
    const scram = RC.newCube();
    RC.applyAlg(scram, curMoves.join(' '));
    modelStickers = ['U','L','F','R','B','D'].map(f => [...scram[f]].join('')).join('');
  }
  const renderMatches = (netStickers.join('') === modelStickers) && modelStickers.length === 54;

  const orient = document.getElementById('ct-orient');
  const orientText = orient ? orient.textContent.replace(/\s+/g,' ').trim() : '';

  /* 已移除的旧元素不应存在 */
  const hasAlign = !!document.getElementById('ct-align');
  const hasViz = !!document.getElementById('ct-viz');
  const hasInfo = !!document.getElementById('ct-info');
  const hasLen = !!document.getElementById('ct-len');
  const hasSub = !!document.querySelector('.ct__sub');

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
    solHidden: sol ? sol.hidden : null,
    solDisplay: sol ? getComputedStyle(sol).display : "",
    solText: sol ? txt('ct-sol-text').trim() : "",
    solLen: txt('ct-sol-text').trim().split(/\s+/).filter(Boolean).length,
    curSolLen: curSol.length,
    solBtnPressed: (document.getElementById('ct-sol') || {}).getAttribute
                   ? document.getElementById('ct-sol').getAttribute('aria-pressed') : '',
    netRects: netRects.length,
    renderMatches: renderMatches,
    orientText: orientText,
    hasAlign: hasAlign,
    hasViz: hasViz,
    hasInfo: hasInfo,
    hasLen: hasLen,
    hasSub: hasSub,
    batchHidden: batchPanel ? batchPanel.hidden : null,
    batchItems: list('.ct__batch-item').length
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
    page.wait_for_selector(".cfop-net--cross", timeout=20000)
    page.wait_for_timeout(300)

    print("[1] 页面结构")
    r = page.evaluate(READ)
    check("求解器与模型已加载", r["hasSolver"] and r["stateColor"], r)
    check("无控制台错误", not errs, errs)
    check("十字颜色 6 个", r["nColors"] == 6, r["nColors"])
    check("目标步数 1~8", r["nSteps"] == 8, r["nSteps"])
    check("平面展开图已渲染（6 面 = 54 贴纸）", r["netRects"] == 54, r["netRects"])
    check("默认打乱非空", r["length"] > 0, r["length"])
    check("深色下计时器对比度 ≥ 4.5:1", r["timerContrast"] >= 4.5,
          (r["timerColor"], r["timerBg"], r["timerContrast"]))
    check("醒目「白顶绿前」朝向提示存在", "白顶" in r["orientText"] and "绿前" in r["orientText"], r["orientText"])
    check("3D 视图 / 对准按钮已移除", not r["hasAlign"] and not r["hasViz"], (r["hasAlign"], r["hasViz"]))
    check("步数徽章与副标题已移除", not r["hasInfo"] and not r["hasLen"] and not r["hasSub"],
          (r["hasInfo"], r["hasLen"], r["hasSub"]))

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
                  and d["e2e"] is True and d["curSolLen"] == step)
            check("%s色 / %d 步：打乱 %d 步、最优 %d 步、解法 %d 步且复原十字"
                  % (color, step, d["length"], d["dist"], d["curSolLen"]), ok, d)

    print("[3b] 平面展开图渲染保真：54 贴纸与「打乱后」贴纸模型逐面一致")
    for color in r["colors"]:
        page.click('#ct-colors .seg__btn[data-color="%s"]' % color)
        page.wait_for_timeout(80)
        d = page.evaluate(READ)
        check("%s色：展开图（%d 贴纸）与模型一致" % (color, d["netRects"]),
              d["netRects"] == 54 and d["renderMatches"] is True,
              (d["netRects"], d["renderMatches"]))
    page.click('#ct-colors .seg__btn[data-color="%s"]' % r["stateColor"])
    page.wait_for_timeout(80)

    print("[4] 解法面板 / 复制")
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

    page.click('#ct-copy')
    page.wait_for_timeout(120)
    check("复制按钮有反馈",
          "已复制" in page.eval_on_selector('#ct-copy', 'e => e.textContent'))

    print("[5] 批量 10 个打乱")
    page.click('#ct-batch')
    page.wait_for_timeout(250)
    d = page.evaluate(READ)
    check("批量面板展开", d["batchHidden"] is False, d["batchHidden"])
    check("批量列表含 10 条", d["batchItems"] == 10, d["batchItems"])
    formulas = page.eval_on_selector_all(
        '.ct__batch-item .ct__batch-formula', 'els => els.map(e => e.textContent.trim())')
    bColor = d["stateColor"]
    bStep = d["stateStep"]
    all_ok = True
    detail = []
    for i, f in enumerate(formulas):
        mv = f.split()
        dist = page.evaluate(
            "(a) => window.CrossSolver.distance(a.color, a.moves)",
            {"color": bColor, "moves": mv})
        ok = (len(mv) > 0 and len(mv) <= 10 and dist == bStep)
        if not ok:
            all_ok = False
            detail.append((i, mv, dist))
    check("10 条均为合法打乱（最优步数 == 目标、≤10 步）", all_ok, detail)
    page.screenshot(path=str(OUT / ("cross-trainer-batch%s.png" % TAG)))

    # 重新生成
    page.click('#ct-batch-refresh')
    page.wait_for_timeout(250)
    d = page.evaluate(READ)
    check("重新生成后仍为 10 条且面板可见",
          d["batchItems"] == 10 and d["batchHidden"] is False, (d["batchItems"], d["batchHidden"]))

    # 收起
    page.click('#ct-batch')
    page.wait_for_timeout(150)
    d = page.evaluate(READ)
    check("再次点击收起批量面板", d["batchHidden"] is True, d["batchHidden"])

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
    check("全过程无控制台错误", not errs, errs)

    browser.close()

print()
if fails:
    print("FAILED %d 项：%s" % (len(fails), fails))
    sys.exit(1)
print("全部通过 ✔")
