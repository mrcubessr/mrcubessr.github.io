/* ft-page.js — 公式训练器页面引擎（tools/ft，六个体系页共用）
 *
 * 页面只提供：<head> 样式、c4-head（标题/副标题/返回链接）、一行挂载配置；
 * 其余骨架（工具条 / 仪表盘 / 看板 / 矩阵 / 练习浮层 / 全屏计时 / 详情浮层 / toast）
 * 全部由本文件注入，六页零重复 —— 改一处六页生效，杜绝「同源克隆漏同步」。
 *
 * 与 tools/4bld/wing.html 的关系：逻辑同源（计时状态机 / 连练 / 参考公式 / CSV /
 * LSProvider 同步全部照搬该页的坑位写法），差异是：
 *   ① 数据异步加载 + 24 缓冲切换（FT.load / adoptData）；
 *   ② 三字母码全体系统一（BUF+row+col），codeOf 固定；
 *   ③ 空格分三类：self（同格）/ intent（原表留空，可手动补全）/ none（非法组合，置灰）；
 *   ④ 无「交换子」字段（ft 数据 v1 是来源数不是 comm），详情浮层改显「来源」。
 *
 * 用法（页面内联）：
 *   FTPage.mount({ sys: 'corner' });
 */
window.FTPage = (function () {
  'use strict';

  /* ================= 共用骨架（四页一致，JS 注入） ================= */
  function chromeHTML() {
    return ''
    /* ---------- 工具条：缓冲选择 + 视图切换 + 指标/搜索/筛选/排序 ---------- */
    + '<div class="c4-bar">'
    + '  <div class="ft-buf" id="ft-buf">'
    + '    <span class="ft-buf__label">缓冲块</span>'
    + '    <span class="ft-buf__list" id="ft-buf-list"><span style="font-size:12px;color:var(--fg-3)">加载中…</span></span>'
    + '    <span class="ft-buf__cur" id="ft-buf-cur"></span>'
    + '  </div>'
    + '  <span class="c4-spacer"></span>'
    + '  <div class="c4-seg" id="c4-view" role="tablist">'
    + '    <button type="button" data-view="matrix" class="is-active" role="tab">矩阵总览</button>'
    + '    <button type="button" data-view="board" role="tab">练习总览</button>'
    + '  </div>'
    + '  <label for="c4-metric">指标</label>'
    + '  <select id="c4-metric">'
    + '    <option value="session">最近一次</option>'
    + '    <option value="allavg">全部平均</option>'
    + '    <option value="best">最快单次</option>'
    + '  </select>'
    + '  <label for="c4-q">搜索</label>'
    + '  <input type="search" id="c4-q" placeholder="如 ADM" autocomplete="off">'
    + '  <label for="c4-filter">筛选</label>'
    + '  <select id="c4-filter">'
    + '    <option value="all">全部公式</option>'
    + '    <option value="todo">只看未练</option>'
    + '    <option value="weak">只看需关注+不合格</option>'
    + '    <option value="starred">★ 只看已标记</option>'
    + '    <option value="mother">只看母公式</option>'
    + '    <option value="done">只看已练</option>'
    + '  </select>'
    + '  <span class="c4-bo">'
    + '    <label for="c4-sort">排序</label>'
    + '    <select id="c4-sort">'
    + '      <option value="group">按组顺序</option>'
    + '      <option value="slow">最慢优先</option>'
    + '      <option value="practice">按练习次数</option>'
    + '      <option value="star">★ 标记优先</option>'
    + '    </select>'
    + '  </span>'
    + '  <label for="c4-algview">显示</label>'
    + '  <select id="c4-algview" title="公式用哪种写法显示">'
    + '    <option value="comm">括号格式</option>'
    + '    <option value="expand">展开式</option>'
    + '    <option value="both">两者都显示</option>'
    + '  </select>'
    + '  <label for="c4-repmode">练习</label>'
    + '  <select id="c4-repmode" title="每条公式练一次记一次，还是连做三次取平均">'
    + '    <option value="single">单次计时</option>'
    + '    <option value="avg3">连做三次取平均</option>'
    + '  </select>'
    + '  <button type="button" id="c4-clear" class="c4-navbtn"'
    + '          title="清空筛选：矩阵行列锁定 / 搜索 / 下拉筛选，全部复位">清空筛选</button>'
    + '  <span class="c4-filter-hint" id="c4-filter-hint"></span>'
    + '  <button type="button" id="c4-comm" class="c4-navbtn" aria-pressed="false"'
    + '          title="快捷切换：公式显示为括号格式。[A,B] 交换子 = A B A⁻¹ B⁻¹；'
    + 'A:[B,C] 共轭 = A [B,C] A⁻¹。该条无括号数据（或你手动输入过公式）时仍显示展开式">括号格式</button>'
    + '</div>'
    /* ---------- 练习总览仪表盘 ---------- */
    + '<section id="c4-dash" class="c4-dash">'
    + '  <span class="c4-dash__title">训练总览</span>'
    + '  <span class="c4-dash__std">基准 <b id="c4-bench">--</b><i id="c4-bench-metric">最近一次</i></span>'
    + '  <div class="c4-kpis" id="c4-kpis"></div>'
    + '  <span class="c4-gradbox">'
    + '    <span class="c4-grad" aria-hidden="true"></span>'
    + '    <span class="c4-grad-ticks" id="c4-ticks"></span>'
    + '  </span>'
    + '  <details class="c4-top" id="c4-top">'
    + '    <summary>🎯 最慢 TOP 10</summary>'
    + '    <div class="c4-top__list" id="c4-top-list"></div>'
    + '  </details>'
    + '</section>'
    + '<div id="c4-board" class="c4-board-wrap"><div class="c4-board"></div></div>'
    /* ---------- 矩阵总览仪表盘 + 矩阵 ---------- */
    + '<div class="c4-mx-dash" id="c4-mx-dash" hidden>'
    + '  <span class="c4-dash__title">训练总览</span>'
    + '  <span class="c4-dash__std">基准 <b id="c4-mx-bench">--</b><i id="c4-mx-bench-metric">最近一次</i></span>'
    + '  <div class="c4-kpis" id="c4-mx-kpis"></div>'
    + '  <span class="c4-gradbox">'
    + '    <span class="c4-grad" aria-hidden="true"></span>'
    + '    <span class="c4-grad-ticks" id="c4-mx-ticks"></span>'
    + '  </span>'
    + '  <details class="c4-top" id="c4-mx-top">'
    + '    <summary>🎯 最慢 TOP 10</summary>'
    + '    <div class="c4-top__list" id="c4-mx-top-list"></div>'
    + '  </details>'
    + '</div>'
    + '<div class="c4-matrix" id="c4-matrix" hidden></div>'
    /* ---------- 练习浮层 ---------- */
    + '<div class="c4-pmodal" id="c4-pmodal" role="dialog" aria-modal="true" aria-label="单式练习">'
    + '  <div class="c4-pmodal__box">'
    + '    <div class="c4-pmodal__bar">'
    + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-prev" title="上一式">←</button>'
    + '      <select id="c4-p-select" class="c4-pmodal__select" aria-label="选择公式"></select>'
    + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-next" title="下一式">→</button>'
    + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-chain" aria-pressed="false" title="连练：停表后自动进入下一条">连练</button>'
    + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-detail" title="查看本条公式详情（含反向公式）">详情</button>'
    + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-refs" aria-pressed="false" title="查看 / 切换本条的参考公式（默认使用人数最多的一条）">📖 参考公式</button>'
    + '      <span class="c4-spacer"></span>'
    + '      <span class="c4-pmodal__hint">按住空格 0.5s 后松开开始</span>'
    + '      <button type="button" class="c4-pmodal__close" id="c4-p-close" aria-label="关闭">×</button>'
    + '    </div>'
    + '    <div class="c4-pmodal__body">'
    + '      <div class="c4-chain" id="c4-chain-row" hidden>'
    + '        <label for="c4-chain-scope">范围</label>'
    + '        <select id="c4-chain-scope">'
    + '          <option value="all">全部公式</option>'
    + '          <option value="group">当前组</option>'
    + '          <option value="todo">只看未练</option>'
    + '          <option value="weak">需关注+不合格</option>'
    + '        </select>'
    + '        <label for="c4-chain-order">顺序</label>'
    + '        <select id="c4-chain-order">'
    + '          <option value="seq">按组顺序</option>'
    + '          <option value="rand">随机</option>'
    + '        </select>'
    + '        <span class="c4-chain__prog" id="c4-chain-prog"></span>'
    + '      </div>'
      + '      <div class="c4-pmodal__headrow">'
      + '        <div class="c4-pmodal__code" id="c4-p-code">--</div>'
      + '        <button type="button" class="c4-pmodal__star" id="c4-p-star" title="标记这条公式（母公式 / 重点练 / 易错…）">☆</button>'
      + '        <span class="c4-spacer"></span>'
      + '        <label for="c4-p-repmode" class="c4-pmodal__replab">练习</label>'
      + '        <select id="c4-p-repmode" class="c4-pmodal__repselect" title="单次计时，还是连做三次取平均">'
      + '          <option value="single">单次</option>'
      + '          <option value="avg3">三次平均</option>'
      + '        </select>'
      + '      </div>'
      + '      <div class="c4-pmodal__alg" id="c4-p-alg">加载中…</div>'
      + '      <div class="c4-pmodal__alg c4-pmodal__alg--sub" id="c4-p-alg2" hidden></div>'
      /* v2.0.29：标记行搬进练习浮层——公式正下方常驻五档颜色 + 备注，
         点开就能直接选，不必再进详情浮层。 */
      + '      <div class="c4-pmodal__starrow">'
      + '        <span class="k">标记</span>'
      + '        <span class="ft-starc" id="c4-p-starc"></span>'
      + '        <input class="input c4-pmodal__note" id="c4-p-note" type="text" maxlength="60"'
      + '               placeholder="备注：如「母公式，C 组都从它变」">'
      + '      </div>'
      + '      <div class="c4-pmodal__rep" id="c4-p-rep" hidden></div>'
    + '      <div class="c4-pmodal__refs" id="c4-p-refsbox" hidden>'
    + '        <div class="c4-modal__refsbar">'
    + '          <span class="k">参考公式</span>'
    + '          <span class="c4-spacer"></span>'
    + '          <button type="button" class="c4-modal__refsman" id="c4-p-refsmanual">✎ 手动输入</button>'
    + '          <button type="button" class="c4-modal__refsreset" id="c4-p-refsreset">恢复默认</button>'
    + '        </div>'
    + '        <div class="c4-modal__refslist" id="c4-p-refslist"></div>'
    + '      </div>'
    + '      <div class="c4-pmodal__timer" id="c4-p-timer" data-state="idle">0.000</div>'
    + '      <div class="c4-pmodal__summary" id="c4-p-summary" hidden></div>'
    + '      <div class="c4-pmodal__acts">'
    + '        <button type="button" id="c4-p-copy">复制公式</button>'
    + '        <button type="button" id="c4-p-fs">全屏计时</button>'
    + '        <button type="button" id="c4-p-export">导出成绩</button>'
    + '        <button type="button" id="c4-p-del">删除最近一次</button>'
    + '        <button type="button" id="c4-p-clear">清空该式</button>'
    + '      </div>'
    + '      <div class="c4-pmodal__history" id="c4-p-history"></div>'
    + '    </div>'
    + '  </div>'
    + '</div>'
    /* ---------- 全屏沉浸计时 ---------- */
    + '<div class="c4-fs" id="c4-fs" hidden>'
    + '  <div class="c4-fs__bar">'
    + '    <span class="c4-fs__code" id="c4-fs-code">--</span>'
    + '    <span class="c4-fs__prog" id="c4-fs-prog"></span>'
    + '    <span class="c4-spacer"></span>'
    + '    <span class="c4-fs__hint">按住空格 0.5s 松开起表 · 再按停表</span>'
    + '    <button type="button" class="c4-fs__close" id="c4-fs-close" aria-label="退出全屏">×</button>'
    + '  </div>'
    + '  <div class="c4-fs__timer" id="c4-fs-timer" data-state="idle">0.000</div>'
    + '  <div class="c4-fs__alg" id="c4-fs-alg"></div>'
    + '</div>'
    /* ---------- 详情浮层（v2.0.26 重做：更大更宽松，公式显示方式可三选，
           参考公式默认 5 条 + 折叠，带星标标记与备注） ---------- */
    + '<div class="c4-modal" id="c4-modal" role="dialog" aria-modal="true" aria-label="公式详情">'
    + '  <div class="c4-modal__box">'
    + '    <div class="c4-modal__bar">'
    + '      <span class="c4-modal__title" id="c4-m-title">--</span>'
    + '      <button type="button" class="c4-modal__star" id="c4-m-star" title="标记这条公式（母公式 / 重点练 / 易错…）">☆</button>'
    + '      <span class="c4-spacer"></span>'
    + '      <div class="c4-modal__nav">'
    + '        <button type="button" id="c4-m-prev">← 上一式</button>'
    + '        <button type="button" id="c4-m-next">下一式 →</button>'
    + '      </div>'
    + '      <button type="button" class="c4-modal__close" id="c4-m-close" aria-label="关闭">×</button>'
    + '    </div>'
    + '    <div class="c4-modal__body">'
    + '      <div class="c4-modal__algwrap">'
    + '        <div class="c4-modal__algbar">'
    + '          <span class="k">公式</span>'
    + '          <div class="c4-seg c4-seg--sm" id="c4-m-algview" role="group" aria-label="公式显示方式">'
    + '            <button type="button" data-av="expand">展开式</button>'
    + '            <button type="button" data-av="comm">括号格式</button>'
    + '            <button type="button" data-av="both">都显示</button>'
    + '          </div>'
    + '          <span class="c4-spacer"></span>'
    + '          <button type="button" class="c4-modal__mini" id="c4-m-copy">复制公式</button>'
    + '        </div>'
    + '        <div class="c4-modal__alg" id="c4-m-alg">--</div>'
    + '        <div class="c4-modal__alg c4-modal__alg--sub" id="c4-m-alg2" hidden></div>'
    + '      </div>'
    + '      <div class="c4-modal__meta" id="c4-m-meta"></div>'
    + '      <div class="c4-modal__row"><span class="k">反向</span><span class="v" id="c4-m-rev">--</span></div>'
    + '      <div class="c4-modal__starbox">'
    + '        <span class="k">标记</span>'
    + '        <span class="ft-starc" id="c4-m-starc"></span>'
    + '        <input class="input c4-modal__note" id="c4-m-note" type="text" maxlength="60"'
    + '               placeholder="备注：如「母公式，C 组都从它变」">'
    + '      </div>'
    + '      <div class="c4-modal__refs" id="c4-m-refs">'
    + '        <div class="c4-modal__refsbar">'
    + '          <span class="k">参考公式</span>'
    + '          <span class="c4-modal__refsnote" id="c4-m-refsnote">默认取排名第一；点下面任意一条即可切换</span>'
    + '          <span class="c4-spacer"></span>'
    + '          <button type="button" id="c4-m-refsmanual" class="c4-modal__refsman">✎ 手动输入</button>'
    + '          <button type="button" id="c4-m-refsreset" hidden>恢复默认</button>'
    + '        </div>'
    + '        <div class="c4-modal__refslist" id="c4-m-refslist"></div>'
    + '        <details class="c4-modal__refsmore" id="c4-m-refsmore" hidden>'
    + '          <summary id="c4-m-refsmore-sum"></summary>'
    + '          <div class="c4-modal__refslist" id="c4-m-refslist2"></div>'
    + '        </details>'
    + '      </div>'
    + '    </div>'
    + '    <div class="c4-modal__acts">'
    + '      <button type="button" id="c4-m-locate">去练习</button>'
    + '      <button type="button" id="c4-m-close2">关闭</button>'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<div class="c4-toast" id="c4-toast"></div>';
  }

  /* ================= 挂载 ================= */
  function mount(cfg) {
    var sys = cfg.sys;
    var SYS = FT.sysOf(sys);
    if (!SYS) { return; }

    /* ---------- 骨架注入（必须在任何 DOM 查询之前） ---------- */
    var wrap = document.querySelector('.c4-wrap');
    if (wrap && !document.getElementById('c4-pmodal')) {
      wrap.insertAdjacentHTML('beforeend', chromeHTML());
    }

    /* ---------- 页面状态（缓冲切换时整体换数据，数组必须原地换内容：
       TrainMatrix 持有 rowOrder/colOrder/codes 的引用） ---------- */
    var ORDER = [];        // 23 个次位置字母（不含当前缓冲）
    var ALL = [];          // 全部有效三字母码（cells ∪ 手动补全）
    var state = {
      D: null, BUF: FT.getBuf(sys),
      GROUPS: [], POS: {}, GIDX: {},
      illegal: null, cells0: null,
      swaps: FT.getSwaps(sys)
    };

    var TIMES_KEY = 'ft_times_' + sys;
    var SESSIONS_KEY = 'ft_sessions_' + sys;
    var SYNC_ID = 'ft-' + sys;

    var GIDX_REF = state.GIDX;
    function rebuildGIDX() {
      for (var k in GIDX_REF) { if (GIDX_REF.hasOwnProperty(k)) { delete GIDX_REF[k]; } }
      state.GROUPS.forEach(function (g, i) { g.forEach(function (c) { GIDX_REF[c] = i; }); });
    }
    function gclass(c) { return 'g' + (GIDX_REF[c] >= 0 ? GIDX_REF[c] : 0); }
    /* 组名：角块用中文色组名；棱/翼棱「UF 棱」；中心块「U 面」 */
    function groupName(gi) { return FT.groupLabel(sys, state.D, gi); }

    /* ---------- 公式读取（含路线 C 手动补全 / 参考公式切换） ---------- */
    function baseAlg(code) { return FT.baseAlgOf(state.D, code); }
    function algOf(code) { return state.swaps[code] || baseAlg(code); }

    /* ---------- 公式显示方式（v2.0.26）----------
       'expand' 展开式 | 'comm' 括号/转换机格式 | 'both' 两者都显示。
       手动输入 / Excel 公式 / 无 comm 数据的格子会自动回退为展开式。 */
    var algView = FT.algView();
    function commText(code) { return FT.commOfAlg(state.D, code, algOf(code)) || ''; }
    function displayAlg(code) {
      var a = algOf(code);
      if (algView === 'expand') { return a; }
      var c = commText(code);
      if (algView === 'comm') { return c || a; }
      return c ? (a + '   ║   ' + c) : a;   /* both：单串场景用分隔符并列 */
    }
    function setAlgView(v) {
      algView = v;
      FT.setAlgView(v);
      /* 同步工具条与详情浮窗里的三选状态 */
      var sel = document.getElementById('c4-algview');
      if (sel) { sel.value = v; }
      var btn = document.getElementById('c4-comm');
      if (btn) { btn.setAttribute('aria-pressed', v === 'expand' ? 'false' : 'true'); }
      syncModalAlgViewSeg();
    }

    /* ---------- 星标标记（v2.0.26）----------
       state.stars 是页面内缓存：矩阵一次要画 506 格，逐格读 localStorage 会卡。 */
    var stars = FT.getStars(sys);
    function starOf(code) { return stars[code] || null; }
    function saveStars() { FT.saveStars(sys, stars); }
    function toggleStar(code) {
      if (stars[code]) {
        delete stars[code];
      } else {
        stars[code] = { c: 'gold', n: '' };   /* 默认「母公式」金色：最常见的标记诉求 */
      }
      saveStars();
      renderCurrent();
      toast(stars[code] ? '已标记为「母公式」（浮层标记行里可改颜色和备注）' : '已取消标记');
    }
    function setStarColor(code, k) {
      if (!stars[code]) { stars[code] = { c: k, n: '' }; }
      else { stars[code].c = k; }
      saveStars();
      renderCurrent();
      if (modalCode === code) { fillModal(code); }
    }
    function setStarNote(code, n) {
      if (!stars[code]) { stars[code] = { c: 'gold', n: n }; }
      else { stars[code].n = n; }
      saveStars();
      renderCurrent();
    }
    function isSwapped(code) { return !!state.swaps[code]; }
    function refList(code) { return FT.refListOf(state.D, code); }
    function originOf(code) { return FT.originOf(state.D, code); }
    function curRefIdx(code) {
      var cur = algOf(code), list = refList(code);
      for (var i = 0; i < list.length; i++) { if (list[i][0] === cur) { return i; } }
      return -1;
    }
    function setSwap(code, alg) {
      state.swaps = FT.setSwap(sys, code, alg, baseAlg(code));
      refreshCode(code);
    }
    function posStr(code) { return FT.posStr(state.D, code); }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* 公式语法着色（与 4bld 页一致：U:[...] 前缀走 a-pre） */
    function fmtAlg(alg) {
      if (!alg) { return ''; }
      var pre = '', body = alg;
      var m = /^([^:]*?)\s*:\s*(\[.*)$/.exec(alg);
      if (m) { pre = m[1] + ':'; body = m[2]; }
      var out = '';
      if (pre) { out += '<span class="a-pre">' + esc(pre) + '</span>'; }
      body.split(/([\[\],])/).forEach(function (t) {
        if (t === '[' || t === ']' || t === ',') {
          out += '<span class="a-punct">' + esc(t) + '</span>';
        } else if (t) {
          out += '<span class="a-core">' + esc(t) + '</span>';
        }
      });
      return out;
    }

    /* ---------- 本地存储 ---------- */
    function load(key, fb) {
      try { return JSON.parse(localStorage.getItem(key)) || fb; } catch (e) { return fb; }
    }
    function save(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
    var times = load(TIMES_KEY, {});
    var sessions = load(SESSIONS_KEY, {});
    var metricMode = 'session';
    var sortMode = 'group';
    var filterMode = 'all';

    function fmtTime(ms) {
      if (!isFinite(ms) || ms < 0) return '--:--.---';
      var total = Math.round(ms);
      var min = Math.floor(total / 60000);
      var sec = Math.floor((total % 60000) / 1000);
      var mill = total % 1000;
      return (min > 0 ? min + ':' : '') + (min > 0 ? String(sec).padStart(2, '0') : String(sec)) + '.' + String(mill).padStart(3, '0');
    }
    function avg(a) {
      if (!a || !a.length) return NaN;
      return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    }
    function median(a) {
      if (!a.length) return NaN;
      var s = a.slice().sort(function (x, y) { return x - y; });
      var m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    /* ---------- 统计（与 4bld 页同一套口径） ---------- */
    function statsOf(code) {
      var t = times[code] || [];
      var s = sessions[code] || [];
      var st = {
        n: t.length,
        best: t.length ? Math.min.apply(null, t) : NaN,
        allavg: avg(t),
        session: s.length ? s[s.length - 1] : NaN
      };
      st.metric = function () {
        if (metricMode === 'allavg') return st.allavg;
        if (metricMode === 'best') return st.best;
        return st.session;
      };
      return st;
    }
    function tierOf(metric, bench) {
      if (!isFinite(metric)) return 't-none';
      if (!isFinite(bench) || bench <= 0) return 't-good';
      var r = metric / bench;
      if (r <= 0.85) return 't-great';
      if (r <= 1.00) return 't-good';
      if (r <= 1.15) return 't-warn';
      return 't-bad';
    }
    /* 快慢字色 7 阶（--spd-t0..6，深浅主题各自一套）；bg 连续插值只给仪表盘图例 */
    function colorByRatio(r, range) {
      if (!isFinite(r)) { return { bg: 'transparent', fg: 'var(--fg-3, #7C8798)', text: 'var(--fg-3, #7C8798)', tier: 't-none' }; }
      var lo = (range && isFinite(range.lo)) ? range.lo : 0.55;
      var hi = (range && isFinite(range.hi)) ? range.hi : 1.45;
      var t = Math.max(0, Math.min(1, (r - lo) / (hi - lo)));
      var SPD_LEVELS = 7;
      var spdIdx = Math.max(0, Math.min(SPD_LEVELS - 1, Math.round(t * (SPD_LEVELS - 1))));
      var text = 'var(--spd-t' + spdIdx + ')';
      var bgStops = [
        { at: 0.00, c: [22, 163, 74] },
        { at: 0.25, c: [74, 222, 128] },
        { at: 0.40, c: [132, 204, 22] },
        { at: 0.55, c: [250, 204, 21] },
        { at: 0.70, c: [251, 146, 60] },
        { at: 0.85, c: [220, 38, 38] },
        { at: 1.00, c: [127, 29, 29] }
      ];
      var i = 0;
      while (i < bgStops.length - 1 && t > bgStops[i + 1].at) i++;
      var s0 = bgStops[i], s1 = bgStops[Math.min(i + 1, bgStops.length - 1)];
      var local = s1.at === s0.at ? 0 : (t - s0.at) / (s1.at - s0.at);
      var rgbv = [0, 1, 2].map(function (k) {
        return Math.round(s0.c[k] + (s1.c[k] - s0.c[k]) * local);
      });
      var bg = 'rgb(' + rgbv.join(',') + ')';
      var tier;
      if (r <= 0.85) tier = 't-great';
      else if (r <= 1.00) tier = 't-good';
      else if (r <= 1.15) tier = 't-warn';
      else tier = 't-bad';
      return { bg: bg, fg: text, text: text, tier: tier, r: r };
    }
    function colorRange(practicedStats, benchRef) {
      var benchLocal = benchRef;
      var rs = practicedStats
        .map(function (c) { var m = c.metric(); return (isFinite(m) && isFinite(benchLocal) && benchLocal > 0) ? m / benchLocal : NaN; })
        .filter(isFinite)
        .sort(function (a, b) { return a - b; });
      if (rs.length < 3) return { lo: 0.55, hi: 1.45 };
      var lo = rs[Math.floor(rs.length * 0.05)];
      var hi = rs[Math.floor(rs.length * 0.95)];
      var span = Math.max(0.4, hi - lo);
      var mid = (lo + hi) / 2;
      return { lo: Math.max(0.3, mid - span / 2), hi: Math.min(2.0, mid + span / 2) };
    }
    function computeAll() {
      var stats = {};
      ALL.forEach(function (c) { stats[c] = statsOf(c); });
      var practiced = ALL.filter(function (c) { return stats[c].n > 0 && isFinite(stats[c].metric()); });
      var bench = median(practiced.map(function (c) { return stats[c].metric(); }));
      var practicedStats = ALL.filter(function (c) { return stats[c].n > 0; }).map(function (c) { return stats[c]; });
      var range = colorRange(practicedStats, bench);
      return { stats: stats, practiced: practiced, bench: bench, range: range };
    }

    /* ---------- 搜索 + 筛选 ---------- */
    /* ---------- 筛选（v2.0.26 扩展，v2.0.28 收简）----------
       ① 下拉：全部 / 未练 / 需关注 / 已标记 / 母公式 / 已练
       ② 矩阵行列坐标点击：点左侧行标 / 顶部列标做整行整列锁定，
          命中 = 选中行 ∪ 选中列（任一命中即保留），两集合皆空 = 全选
          （v2.0.28 起字母筛选行删除，坐标点击是唯一的行列筛选入口）
       ③ 搜索框：码 / 公式（展开式与括号式都匹配）/ 位置，另带三循环旋转容错
       矩阵与看板共用同一份判定，保证两处结果一致。 */
    var axisRows = {};                 /* { 'B': true, ... } 选中的行 */
    var axisCols = {};                 /* 选中的列 */
    function rowColOf(code) {          /* code = BUF + row + col → 去缓冲前缀取行/列字母 */
      var buf = state.BUF || '';
      return [code.charAt(buf.length), code.charAt(buf.length + 1)];
    }
    function hasAxisFilter() {
      for (var k in axisRows) { if (axisRows[k]) { return true; } }
      for (var k in axisCols) { if (axisCols[k]) { return true; } }
      return false;
    }
    function passAxis(c) {
      if (!hasAxisFilter()) { return true; }
      var rc = rowColOf(c);
      return !!(axisRows[rc[0]] || axisCols[rc[1]]);
    }
    function passFilter(c, stats, bench) {
      if (!passAxis(c)) { return false; }
      var st = stats[c];
      if (filterMode === 'todo') { return st.n === 0; }
      if (filterMode === 'done') { return st.n > 0; }
      if (filterMode === 'weak') {
        var t = tierOf(st.metric(), bench);
        return st.n > 0 && (t === 't-bad' || t === 't-warn');
      }
      if (filterMode === 'starred') { return !!stars[c]; }
      if (filterMode === 'mother') { return !!stars[c] && (stars[c].c || 'gold') === 'gold'; }
      return true;
    }
    function passQuery(c, q, qrot) {
      if (!q) { return true; }
      if (c.indexOf(q) >= 0 ||
          algOf(c).toUpperCase().indexOf(q) >= 0 ||
          displayAlg(c).toUpperCase().indexOf(q) >= 0 ||
          posStr(c).toUpperCase().indexOf(q) >= 0) { return true; }
      /* 旋转容错：ADM / DMA / MAD 是同一三循环，互相可命中（与 blddb 一致） */
      return !!(qrot && qrot.indexOf(c) >= 0);
    }
    function queryState() {
      var q = (document.getElementById('c4-q').value || '').trim().toUpperCase();
      return { q: q, qrot: q.length === 3 ? [q, q[1] + q[2] + q[0], q[2] + q[0] + q[1]] : null };
    }
    function hasAnyFilter() {
      return filterMode !== 'all' || hasAxisFilter() ||
             !!(document.getElementById('c4-q').value || '').trim();
    }

    function matchSet(stats, bench) {
      var qs = queryState();
      var set = {};
      ALL.forEach(function (c) {
        if (passFilter(c, stats, bench) && passQuery(c, qs.q, qs.qrot)) { set[c] = true; }
      });
      return set;
    }

    /* ---------- 仪表盘 ---------- */
    function renderDash(A, prefix) {
      var $ = function (n) { return document.getElementById(prefix + n); };
      var stats = A.stats, bench = A.bench, range = A.range;
      $('bench').textContent = fmtTime(bench);
      $('bench-metric').textContent = metricMode === 'session' ? '最近一次' : (metricMode === 'best' ? '最快' : '全部均');
      var totalN = 0;
      ALL.forEach(function (c) { totalN += stats[c].n; });
      var weak = 0, warn = 0;
      ALL.forEach(function (c) {
        if (stats[c].n === 0) { return; }
        var t = tierOf(stats[c].metric(), bench);
        if (t === 't-bad') { weak++; } else if (t === 't-warn') { warn++; }
      });
      var swappedN = ALL.filter(isSwapped).length;
      $('kpis').innerHTML =
        '<div class="c4-kpi"><div class="k-label">已练公式</div><div class="k-value">' + A.practiced.length + ' / ' + ALL.length + '</div></div>' +
        '<div class="c4-kpi"><div class="k-label">总单次次数</div><div class="k-value">' + totalN + '</div></div>' +
        '<div class="c4-kpi"><div class="k-label">不合格（慢）</div><div class="k-value" style="color:#ef4444">' + weak + '</div></div>' +
        '<div class="c4-kpi"><div class="k-label">需关注</div><div class="k-value" style="color:#f59e0b">' + warn + '</div></div>' +
        (swappedN ? '<div class="c4-kpi"><div class="k-label">换过公式</div><div class="k-value" style="color:#f5c518">' + swappedN + '</div></div>' : '');
      $('ticks').innerHTML =
        '<span style="left:0%">' + range.lo.toFixed(2) + '×</span>' +
        '<span style="left:50%">' + ((range.lo + range.hi) / 2).toFixed(2) + '× 基准</span>' +
        '<span style="left:100%">' + range.hi.toFixed(2) + '×</span>';

      var topBox = $('top');
      var ranked = A.practiced.slice().sort(function (a, b) { return stats[b].metric() - stats[a].metric(); });
      var top = ranked.slice(0, 10);
      if (top.length) {
        topBox.classList.remove('is-empty');
        $('top-list').innerHTML = top.map(function (c, i) {
          return '<button type="button" class="c4-top__item" data-code="' + c + '">' +
            '<span class="c4-top__rank">#' + (i + 1) + '</span><b>' + c + '</b>' +
            '<span class="c4-top__ms">' + fmtTime(stats[c].metric()) + '</span></button>';
        }).join('');
      } else {
        topBox.classList.add('is-empty');
        $('top-list').innerHTML = '';
      }
    }

    /* ---------- 练习总览（只产 HTML，布局交 TrainMatrix） ---------- */
    function boardHTML() {
      var A = computeAll();
      var stats = A.stats, bench = A.bench, range = A.range;
      renderDash(A, 'c4-');

      var qs = queryState();
      var list = ALL.filter(function (c) {
        return passFilter(c, stats, bench) && passQuery(c, qs.q, qs.qrot);
      });
      if (sortMode === 'slow') {
        list.sort(function (a, b) {
          var x = stats[b].metric(), y = stats[a].metric();
          return (isFinite(x) ? x : -1) - (isFinite(y) ? y : -1);
        });
      } else if (sortMode === 'practice') {
        list.sort(function (a, b) {
          var na = stats[a].n, nb = stats[b].n;
          if (na !== nb) { return nb - na; }
          var ma = stats[a].metric(), mb = stats[b].metric();
          if (isFinite(ma) && isFinite(mb)) { return mb - ma; }
          return isFinite(ma) ? -1 : 1;
        });
      } else if (sortMode === 'star') {
        /* 已标记排前（母公式最前），其余保持组顺序 */
        var rank = function (c) {
          var s = stars[c];
          if (!s) { return 9; }
          return (s.c === 'gold') ? 0 : 1;
        };
        list.sort(function (a, b) { return rank(a) - rank(b); });
      }

      var cellsHtml = list.map(function (c) {
        var st = stats[c];
        var m = st.metric();
        var r = isFinite(m) && isFinite(bench) && bench > 0 ? m / bench : NaN;
        var col = colorByRatio(r, range);
        var alg = displayAlg(c);
        var sk = starOf(c);
        var title = (st.n
          ? (c + ' · ' + alg + ' · ' + fmtTime(m) + ' · ' + st.n + ' 次')
          : (c + ' · ' + alg + ' · 未练习'));
        var klass = (col.tier === 't-none' ? 't-none' : 'has-data ' + col.tier) + (isSwapped(c) ? ' is-swapped' : '');
        /* 卡片不显示公式，只显示位置码（去缓冲前缀）；title 带完整码与公式 */
        var label = c.length > 2 ? c.slice(1) : c;
        var gc = gclass(c.charAt(c.length - 1));
        return '<a class="c4-bcell ' + gc + ' ' + klass + '" data-code="' + c + '" ' +
          'style="color:' + col.text + '" title="' + esc(title) + '">' +
          '<span class="c-code">' + label + '</span>' +
          (isSwapped(c) ? '<span class="c-swap" title="已切换为参考公式：' + esc(algOf(c)) + '">换</span>' : '') +
          '<span class="c-ms">' + (st.n ? fmtTime(m) : '--') + '</span>' +
          '<span class="c-n">' + (st.n ? st.n : '') + '</span>' +
          (sk ? '<span class="c-star s-' + esc(sk.c || 'gold') + '" title="' +
                 esc(FT.starColorName(sk.c) + (sk.n ? ' · ' + sk.n : '')) + '">★</span>' : '') +
          '</a>';
      }).join('');

      return cellsHtml || '<div class="c4-empty">没有符合筛选条件的公式。</div>';
    }

    /* ---------- 矩阵单格 ----------
       v2.0.26：格子里不再塞公式（一屏几百条公式反而看不清），改成与「练习总览」
       同一套卡片语言：大字字母组合 + 时间 + 右上角星标。公式进详情/练习浮层看。 */
    function cellInfo(code, row, col) {
      var alg = algOf(code);
      if (alg) {
        var A = computeAll();
        var st = A.stats[code], bench = A.bench, range = A.range;
        var m = st.metric();
        var r = (st.n && isFinite(m) && isFinite(bench) && bench > 0) ? m / bench : NaN;
        var shown = displayAlg(code);
        var label = code.length > 2 ? code.slice(1) : code;
        var sk = starOf(code);
        var starHtml = '<span class="mx-star' + (sk ? ' is-on s-' + esc(sk.c || 'gold') : '') + '"' +
          ' data-star="' + code + '"' +
          ' title="' + esc(sk ? (FT.starColorName(sk.c) + (sk.n ? ' · ' + sk.n : '')) : '标记这条公式') + '">' +
          (sk ? '★' : '☆') + '</span>';
        var html = '<span class="mx-code">' + label + '</span>' +
                   '<span class="mx-ms">' + (st.n ? fmtTime(m) : '—') + '</span>' + starHtml;
        if (isFinite(r)) {
          var col2 = colorByRatio(r, range);
          return { kind: 'alg', alg: alg, cls: 'spd ' + col2.tier, html: html,
                   style: 'color:' + col2.text,
                   tip: code + '　' + posStr(code) + '　' + shown + '　' +
                        fmtTime(m) + ' · ' + st.n + ' 次' };
        }
        return { kind: 'alg', alg: alg, cls: 'on', html: html,
                 tip: code + '　' + posStr(code) + '　' + shown + '　未练习' };
      }
      if (row === col) { return { kind: 'self', tip: code + '　同一位置，无此情况' }; }
      if (state.illegal && state.illegal(code)) {
        return { kind: 'none', tip: code + '　' + (SYS.kind === 'same-piece' ? '三个字母不属三块，无此情况' : '无此情况') };
      }
      /* 原表留空 / 旋转派生未覆盖：允许点格子手动补全（路线 C） */
      if (FT.isBlank(state.D, code)) {
        return { kind: 'intent', manual: true, tip: code + '　原表留空 · 点此手动补全你的公式' };
      }
      return { kind: 'none', manual: true, tip: code + '　未收录 · 点此手动补全你的公式' };
    }

    /* ---------- TrainMatrix 挂载 ---------- */
    var TM = TrainMatrix.mount({
      rowOrder: ORDER,
      colOrder: ORDER,
      codes: ALL,
      algOf: algOf,
      isSwapped: isSwapped,
      gclass: gclass,
      fmtAlg: fmtAlg,
      defaultView: 'matrix',
      computeAll: computeAll,
      dash: renderDash,
      matchSet: function (A) {
        if (!hasAnyFilter()) { return null; }
        return matchSet(A.stats, A.bench);
      },
      cellInfo: cellInfo,
      boardHTML: boardHTML,
      onCellClick: function (code) {
        /* 空格（原表留空/未收录）：先手动补全再进练习；有公式直接进计时 */
        if (!algOf(code)) { manualFill(code); return; }
        pOpenFor(code);
      },
      codeOf: function (row, col) { return state.BUF + row + col; },
      /* 数据异步加载：字号基准每次布局现算（≤506 code，开销可忽略） */
      halfLenFn: function () { return TrainMatrix.halfLenOf(ALL, algOf); },
      /* 506 卡与 4bld 翼棱页同规模，沿用其调参（28 列兜底） */
      minCell: 28
    });

    function renderBoard() { TM.renderBoard(); }
    function renderMatrix() { TM.renderMatrix(); }
    function setView(v) { TM.setView(v); }
    function renderCurrent() {
      if (!state.D) { return; }
      if (document.getElementById('c4-board').hidden) { renderMatrix(); }
      else { renderBoard(); }
    }

    /* ---------- 详情浮层 ---------- */
    var listCache = null, curIdx = -1;
    function allCodes() {
      if (listCache) { return listCache; }
      listCache = [];
      ORDER.forEach(function (r) {
        ORDER.forEach(function (c) { var code = state.BUF + r + c; if (algOf(code)) { listCache.push(code); } });
      });
      return listCache;
    }
    function invalidateList() { listCache = null; }
    var modalCode = '';
    var REFS_SHOWN = 5;             /* 参考公式默认显示条数，其余折叠（详情浮层） */

    /* 公式显示：三选一（展开式 / 括号格式 / 都显示）。
       「都显示」时主行展开式、副行括号格式，副行没有数据就只留主行。 */
    function renderModalAlg(code) {
      var a = algOf(code), c = commText(code);
      var e1 = document.getElementById('c4-m-alg');
      var e2 = document.getElementById('c4-m-alg2');
      if (!e1) { return; }
      if (algView === 'both') {
        e1.innerHTML = fmtAlg(a);
        e1.className = 'c4-modal__alg';
        if (c && e2) {
          e2.innerHTML = fmtAlg(c);
          e2.className = 'c4-modal__alg c4-modal__alg--sub';
          e2.hidden = false;
        } else if (e2) { e2.hidden = true; e2.innerHTML = ''; }
      } else {
        var shown = (algView === 'comm') ? (c || a) : a;
        e1.innerHTML = fmtAlg(shown);
        e1.className = 'c4-modal__alg' + (algView === 'comm' && c ? ' is-comm' : '');
        if (e2) { e2.hidden = true; e2.innerHTML = ''; }
      }
      syncModalAlgViewSeg();
    }
    function syncModalAlgViewSeg() {
      var box = document.getElementById('c4-m-algview');
      if (!box) { return; }
      Array.prototype.forEach.call(box.querySelectorAll('button[data-av]'), function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-av') === algView);
        b.setAttribute('aria-pressed', b.getAttribute('data-av') === algView ? 'true' : 'false');
      });
    }

    /* 详情浮层的元信息块：位置 / 分组 / 来源 / 练习统计，一格一项，一眼扫完 */
    function modalMetaHTML(code, st) {
      var gi = GIDX_REF[code.charAt(1)];
      var org = originOf(code);
      var list = refList(code), cur = curRefIdx(code);
      var ns = cur >= 0 && list[cur] ? list[cur][1] : 0;
      var items = [
        ['位置', posStr(code)],
        ['分组', gi >= 0 ? groupName(gi) : '—'],
        ['来源', FT.originLabel(org) + (ns > 0 ? ' · ' + ns + ' 家' : '')],
        ['练习', st.n + ' 次'],
        ['最快', st.n ? fmtTime(st.best) : '—'],
        ['平均', st.n ? fmtTime(st.allavg) : '—'],
        ['最近', isFinite(st.session) ? fmtTime(st.session) : '—']
      ];
      return items.map(function (it) {
        return '<div class="c4-meta"><span class="c4-meta__k">' + esc(it[0]) + '</span>' +
               '<span class="c4-meta__v">' + esc(it[1]) + '</span></div>';
      }).join('');
    }

    /* 五档颜色按钮（详情浮层与练习浮层共用同一套 DOM 结构） */
    function renderStarColors(box, sk) {
      if (!box) { return; }
      box.innerHTML = FT.STAR_COLORS.map(function (o) {
        var on = sk && (sk.c || 'gold') === o.k;
        return '<button type="button" class="ft-starc__b s-' + o.k + (on ? ' is-on' : '') + '"' +
          ' data-sc="' + o.k + '" title="' + esc(o.tip) + '">' +
          '<span class="ft-starc__dot"></span>' + esc(o.name) + '</button>';
      }).join('');
    }

    /* 星标区：5 档颜色单选 + 备注输入。点已选中的档位 = 取消标记。 */
    function renderModalStar(code) {
      var sk = starOf(code);
      var starBtn = document.getElementById('c4-m-star');
      if (starBtn) {
        starBtn.className = 'c4-modal__star' + (sk ? ' is-on s-' + esc(sk.c || 'gold') : '');
        starBtn.textContent = sk ? '★' : '☆';
        starBtn.title = sk ? '已标记：' + FT.starColorName(sk.c) + '（再点取消）' : '标记这条公式';
      }
      renderStarColors(document.getElementById('c4-m-starc'), sk);
      var note = document.getElementById('c4-m-note');
      if (note) { note.value = sk ? (sk.n || '') : ''; }
    }

    /* 练习浮层的标记行（v2.0.29）：星标按钮 + 五档颜色 + 备注，全部就地刷新 */
    function pRenderStar(code) {
      var sk = starOf(code);
      var sb = document.getElementById('c4-p-star');
      if (sb) {
        sb.className = 'c4-pmodal__star' + (sk ? ' is-on s-' + esc(sk.c || 'gold') : '');
        sb.textContent = sk ? '★' : '☆';
        sb.title = sk ? ('已标记：' + FT.starColorName(sk.c) + (sk.n ? ' · ' + sk.n : '') + '（再点取消）')
                      : '标记这条公式（母公式 / 重点练 / 易错…）';
      }
      renderStarColors(document.getElementById('c4-p-starc'), sk);
      var note = document.getElementById('c4-p-note');
      if (note && document.activeElement !== note) { note.value = sk ? (sk.n || '') : ''; }
    }

    function fillModal(code) {
      var alg = algOf(code);
      if (!alg) { return; }
      modalCode = code;
      var b = code.charAt(1), c3 = code.charAt(2);
      var t = document.getElementById('c4-m-title');
      t.className = 'c4-modal__title ' + gclass(b);
      t.textContent = code + '　（' + posStr(code) + '）';
      renderModalAlg(code);
      var st = statsOf(code);
      var meta = document.getElementById('c4-m-meta');
      if (meta) { meta.innerHTML = modalMetaHTML(code, st); }
      var rev = algOf(state.BUF + c3 + b) || '';
      document.getElementById('c4-m-rev').innerHTML = rev
        ? '<b>' + (state.BUF + c3 + b) + '</b>　' + fmtAlg(displayAlg(state.BUF + c3 + b))
        : '<span style="color:var(--fg-3,#7C8798)">无（该方向未收录）</span>';
      renderModalStar(code);
      renderRefs(code);
    }

    /* 参考公式：前 REFS_SHOWN 条直接列出，其余进 <details> 折叠。
       括号格式在按钮 title 里始终可见（不影响 data-alg 的切换语义）。 */
    function refsHTML(code, from, to) {
      var list = refList(code);
      var cur = algOf(code);
      if (!list.length) {
        return '<div class="c4-modal__refsnote">该情况没有可切换的参考公式（可用「✎ 手动输入」补上你的公式）。</div>';
      }
      return list.slice(from, to).map(function (p, j) {
        var i = from + j;
        var shown = (algView !== 'expand' && p[2]) ? p[2] : p[0];
        return '<button type="button" class="c4-ref' + (p[0] === cur ? ' is-on' : '') + '"' +
          ' data-alg="' + esc(p[0]) + '"' +
          (p[2] ? ' title="括号格式：' + esc(p[2]) + '"' : '') + '>' +
          '<span class="c4-ref__no">' + (i + 1) + '</span>' +
          '<span class="c4-ref__alg">' + esc(shown) + '</span>' +
          (i === 0 ? '<span class="c4-ref__def">默认</span>' : '') +
          '<span class="c4-ref__n">' + (p[1] > 0 ? p[1] + ' 家' : '公式库') + '</span>' +
          '</button>';
      }).join('');
    }
    function renderRefs(code) {
      var list = refList(code);
      var l1 = document.getElementById('c4-m-refslist');
      var l2 = document.getElementById('c4-m-refslist2');
      var more = document.getElementById('c4-m-refsmore');
      var sum = document.getElementById('c4-m-refsmore-sum');
      if (l1) { l1.innerHTML = refsHTML(code, 0, REFS_SHOWN); }
      var rest = list.length - REFS_SHOWN;
      if (l2 && more) {
        if (rest > 0) {
          l2.innerHTML = refsHTML(code, REFS_SHOWN, list.length);
          more.hidden = false;
          if (sum) { sum.textContent = '展开其余 ' + rest + ' 条参考公式'; }
        } else {
          l2.innerHTML = '';
          more.hidden = true;
          more.removeAttribute('open');
        }
      }
      document.getElementById('c4-m-refsreset').hidden =
        (!list.length || !isSwapped(code));
      var note = document.getElementById('c4-m-refsnote');
      if (note) {
        note.textContent = list.length
          ? ('共 ' + list.length + ' 条 · 默认取排名第一；点任意一条即可切换')
          : '';
      }
    }
    function renderPRefs(code) {
      var box = document.getElementById('c4-p-refslist');
      if (!box) { return; }
      box.innerHTML = refsHTML(code);
      document.getElementById('c4-p-refsreset').hidden =
        (!refList(code).length || !isSwapped(code));
    }
    /* 切换后：同步详情浮层 / 练习浮层 / 看板 / 矩阵 */
    function refreshCode(code) {
      if (modalCode === code && document.getElementById('c4-modal').classList.contains('is-open')) {
        fillModal(code);
      }
      if (pCurrent === code && pmodal.classList.contains('is-open')) {
        pRenderAlg(code);
        renderPRefs(code);
      }
      renderCurrent();
    }
    function openModal(code) {
      if (!algOf(code)) { return; }
      curIdx = allCodes().indexOf(code);
      fillModal(code);
      document.getElementById('c4-modal').classList.add('is-open');
    }
    function closeModal() { document.getElementById('c4-modal').classList.remove('is-open'); }
    function stepModal(delta) {
      var list = allCodes();
      if (!list.length) { return; }
      curIdx = (curIdx + delta + list.length) % list.length;
      fillModal(list[curIdx]);
    }
    function currentModalCode() {
      var list = allCodes();
      return list[curIdx] || '';
    }

    /* ---------- 路线 C：手动补全空格 ---------- */
    function manualFill(code) {
      var v = prompt('「' + code + '」暂无公式（' + posStr(code) + '）。\n手动输入你的公式（留空或取消则不改动）：', '');
      if (v === null) { return; }
      v = v.replace(/\s+/g, ' ').trim();
      if (!v) { return; }
      state.swaps = FT.setSwap(sys, code, v, baseAlg(code));
      rebuildAll();
      invalidateList();
      fillPSelect();
      toast('已补全 ' + code + '，去练吧');
      renderCurrent();
      pOpenFor(code);
    }

    /* ---------- toast ---------- */
    var toastTimer = null;
    function toast(msg) {
      var el = document.getElementById('c4-toast');
      el.textContent = msg;
      el.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1500);
    }

    /* ---------- 练习浮层（计时状态机，坑位写法照搬 4bld/wing.html） ---------- */
    var pmodal = document.getElementById('c4-pmodal');
    var pSelect = document.getElementById('c4-p-select');
    var pCodeEl = document.getElementById('c4-p-code');
    var pAlgEl = document.getElementById('c4-p-alg');
    var pTimerEl = document.getElementById('c4-p-timer');
    var pSummaryEl = document.getElementById('c4-p-summary');
    var pHistoryEl = document.getElementById('c4-p-history');
    var pCurrent = '';
    var pState = 'idle';
    var pStart = 0, pTick = 0, pPrep = 0;

    /* ---------- 练习模式（v2.0.26）----------
       'single' 单次计时（一条公式做一次记一次）
       'avg3'   连做三次取平均（三阶角/棱常用：同一公式连拧三次看稳定性）
       两种并存，工具条与练习浮层里都能切，记在全局键 ft_repmode。 */
    var repMode = FT.repMode();
    var repIdx = 0;          /* avg3：已完成的次数 0~3 */
    var repList = [];        /* avg3：本轮三次的原始用时 */
    function setRepMode(v) {
      repMode = v;
      FT.setRepMode(v);
      repIdx = 0; repList = [];
      var a = document.getElementById('c4-repmode');
      var b = document.getElementById('c4-p-repmode');
      if (a) { a.value = v; }
      if (b) { b.value = v; }
      renderRepProgress();
    }
    /* 三次平均的进度条：未开始时提示模式，进行中显示 第 n/3 次与已记成绩 */
    function renderRepProgress() {
      var box = document.getElementById('c4-p-rep');
      if (!box) { return; }
      if (repMode !== 'avg3') {
        box.hidden = true; box.innerHTML = '';
        return;
      }
      box.hidden = false;
      if (!repList.length) {
        box.innerHTML = '<span class="c4-rep__lab">三次平均</span>' +
          '<span class="c4-rep__tip">连做 3 次后取平均记一次成绩</span>';
        return;
      }
      var parts = repList.map(function (ms, i) {
        return '<span class="c4-rep__i' + (i === repList.length - 1 ? ' is-cur' : '') + '">' +
               (i + 1) + ' · ' + pFmt(ms) + '</span>';
      }).join('');
      box.innerHTML = '<span class="c4-rep__lab">三次平均 ' + repList.length + '/3</span>' + parts;
    }
    function repFinish() {
      var a = avg(repList);
      pushTimes(a);
      var txt = repList.map(function (ms) { return pFmt(ms); }).join(' / ');
      pSummaryEl.hidden = false;
      pSummaryEl.innerHTML = '三次 <b>' + txt + '</b> → 平均 <b>' + fmtTime(a) + '</b>（记为 1 次成绩）';
      repList = []; repIdx = 0;
      pRefreshHistory();
      try { times = load(TIMES_KEY, {}); sessions = load(SESSIONS_KEY, {}); } catch (e) {}
      renderCurrent();
    }

    function pFmt(ms) {
      if (!isFinite(ms) || ms < 0) return '--.--';
      var total = Math.round(ms);
      var sec = Math.floor(total / 1000);
      var mill = total % 1000;
      return sec + '.' + String(mill).padStart(3, '0');
    }
    function fillPSelect() {
      var html = '';
      state.GROUPS.forEach(function (g, gi) {
        html += '<optgroup label="' + esc(groupName(gi)) + '">';
        g.forEach(function (letter) {
          ORDER.forEach(function (col) {
            var code = state.BUF + letter + col;
            if (algOf(code)) { html += '<option value="' + code + '">' + code + ' · ' + esc(posStr(code)) + '</option>'; }
          });
        });
        html += '</optgroup>';
      });
      pSelect.innerHTML = html;
    }
    function pushTimes(ms) {
      var t = load(TIMES_KEY, {});
      if (!t[pCurrent]) { t[pCurrent] = []; }
      t[pCurrent].push(ms);
      save(TIMES_KEY, t);
      var s = load(SESSIONS_KEY, {});
      if (!s[pCurrent]) { s[pCurrent] = []; }
      s[pCurrent].push(ms);
      save(SESSIONS_KEY, s);
    }
    function pRenderTimer() {
      if (pState === 'running') { pTimerEl.textContent = pFmt(performance.now() - pStart); }
      pSyncTimerEls();
    }
    function pSyncTimerEls() {
      var fs = document.getElementById('c4-fs-timer');
      if (fs) { fs.textContent = pTimerEl.textContent; fs.dataset.state = pTimerEl.dataset.state; }
    }
    function pStartTimer() {
      if (pState === 'running') return;
      pState = 'running';
      pStart = performance.now();
      pTimerEl.dataset.state = 'running';
      pSummaryEl.hidden = true;
      pTick = setInterval(pRenderTimer, 50);
      pSyncTimerEls();
    }
    function pStopTimer() {
      if (pState !== 'running') return;
      clearInterval(pTick);
      var total = performance.now() - pStart;
      pState = 'done';
      pTimerEl.dataset.state = 'done';
      pTimerEl.textContent = pFmt(total);
      pSyncTimerEls();

      /* 三次平均模式：前两次只记进 repList 并提示继续，第三次才结算平均值 */
      if (repMode === 'avg3') {
        repList.push(total);
        repIdx = repList.length;
        renderRepProgress();
        if (repIdx >= 3) {
          repFinish();
          clearTimeout(chainAdvTimer);
          if (chainOn && chainList.length) { chainAdvTimer = setTimeout(chainNext, 800); }
        } else {
          pSummaryEl.hidden = false;
          pSummaryEl.innerHTML = '第 ' + repIdx + '/3 次 <b>' + fmtTime(total) + '</b> · 再按住空格做第 ' +
                                 (repIdx + 1) + ' 次';
        }
        return;
      }

      pushTimes(total);
      pSummaryEl.hidden = false;
      pSummaryEl.innerHTML = '本次用时 <b>' + fmtTime(total) + '</b>';
      pRefreshHistory();
      try { times = load(TIMES_KEY, {}); sessions = load(SESSIONS_KEY, {}); } catch (e) {}
      /* 必须重绘当前视图：只 renderBoard() 会在矩阵视图下成绩不刷新（旧坑） */
      renderCurrent();
      clearTimeout(chainAdvTimer);
      if (chainOn && chainList.length) { chainAdvTimer = setTimeout(chainNext, 800); }
    }
    function pResetTimer() {
      clearInterval(pTick); clearTimeout(pPrep);
      pState = 'idle';
      pTimerEl.dataset.state = 'idle';
      pTimerEl.textContent = '0.000';
      pSummaryEl.hidden = true;
      pSyncTimerEls();
    }
    function pKeydownHold() {
      if (pState === 'running') { pStopTimer(); return; }
      /* ⚠️ 长按 autorepeat 会重复触发 keydown：此处必须「什么都不做」。
         旧写法 clearTimeout(pPrep) 不重建 ⟹ 按住再久到不了 green（旧坑）。 */
      if (pState === 'prep' || pState === 'green') { return; }
      clearTimeout(pPrep);
      pState = 'prep';
      pTimerEl.dataset.state = 'prep';
      pTimerEl.textContent = '按住';
      pPrep = setTimeout(function () {
        if (pState === 'prep') { pState = 'green'; pTimerEl.dataset.state = 'green'; pTimerEl.textContent = '松开'; }
      }, 300);
      pSyncTimerEls();
    }
    function pKeyupHold() {
      clearTimeout(pPrep);
      if (pState === 'green') { pStartTimer(); return; }
      if (pState === 'prep') { pResetTimer(); return; }
    }
    function pRefreshHistory() {
      var s = sessions[pCurrent] || [];
      if (!s.length) { pHistoryEl.innerHTML = '<span style="color:var(--fg-3)">尚无成绩</span>'; return; }
      var parts = [];
      var start = Math.max(0, s.length - 20);
      for (var i = start; i < s.length; i++) { parts.push('<span class="sh-item">' + fmtTime(s[i]) + '</span>'); }
      pHistoryEl.innerHTML = parts.join('');
    }
    /* 练习浮层的公式区 + 星标 + 练习模式：三处一起刷新，切公式/换显示方式都走这里 */
    function pRenderAlg(code) {
      var a = algOf(code), c = commText(code);
      var e2 = document.getElementById('c4-p-alg2');
      if (algView === 'both') {
        pAlgEl.innerHTML = fmtAlg(a);
        if (c && e2) { e2.innerHTML = fmtAlg(c); e2.hidden = false; }
        else if (e2) { e2.hidden = true; e2.innerHTML = ''; }
      } else {
        pAlgEl.innerHTML = fmtAlg((algView === 'comm') ? (c || a) : a);
        if (e2) { e2.hidden = true; e2.innerHTML = ''; }
      }
      pRenderStar(code);
      var rs = document.getElementById('c4-p-repmode');
      if (rs) { rs.value = repMode; }
      /* 换公式 = 新一轮：三次平均的半途成绩作废，避免把別条的两次算进来 */
      if (repList.length) { repList = []; repIdx = 0; }
      renderRepProgress();
    }
    function pLoadCode(code) {
      if (ALL.indexOf(code) < 0) { code = ALL[0]; }
      pCurrent = code;
      pSelect.value = code;
      pCodeEl.textContent = code + '　' + posStr(code);
      pRenderAlg(code);
      renderPRefs(code);
      pResetTimer();
      if (chainOn) {
        var ci = chainList.indexOf(code);
        if (ci >= 0) { chainIdx = ci; }
        chainRenderProg();
      }
      if (!fsEl.hidden) { fsSyncAll(); }
      pRefreshHistory();
    }
    function pOpenFor(code) {
      pmodal.classList.add('is-open');
      pLoadCode(code);
    }
    function pClose() {
      clearTimeout(pPrep);
      clearTimeout(chainAdvTimer);
      if (pState === 'running') { pStopTimer(); }
      fsClose();
      pmodal.classList.remove('is-open');
    }
    function pStep(delta) {
      if (!pCurrent) { return; }
      var list = (chainOn && chainList.length) ? chainList : ALL;
      var i = list.indexOf(pCurrent);
      if (i < 0) { i = 0; }
      var j = Math.max(0, Math.min(list.length - 1, i + delta));
      pLoadCode(list[j]);
    }

    /* ---------- 连练模式 ---------- */
    var chainOn = false;
    var chainScope = 'all';
    var chainOrder = 'seq';
    var chainList = [];
    var chainIdx = -1;
    var chainAdvTimer = 0;

    function chainBench() {
      var ms = ALL.filter(function (c) { var st = statsOf(c); return st.n > 0 && isFinite(st.metric()); })
        .map(function (c) { return statsOf(c).metric(); });
      return median(ms);
    }
    function buildChainList() {
      var list;
      if (chainScope === 'group') {
        var gi = GIDX_REF[pCurrent ? pCurrent.charAt(1) : ORDER[0]];
        list = ALL.filter(function (c) { return GIDX_REF[c.charAt(1)] === gi; });
      } else if (chainScope === 'todo') {
        list = ALL.filter(function (c) { return statsOf(c).n === 0; });
      } else if (chainScope === 'weak') {
        var b = chainBench();
        list = ALL.filter(function (c) {
          var st = statsOf(c);
          if (st.n === 0) { return false; }
          var t = tierOf(st.metric(), b);
          return t === 't-warn' || t === 't-bad';
        });
      } else {
        list = ALL.slice();
      }
      if (chainOrder === 'rand') {
        for (var i = list.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = list[i]; list[i] = list[j]; list[j] = t;
        }
      }
      chainList = list;
      chainIdx = list.indexOf(pCurrent);
      chainRenderProg();
      return list;
    }
    function chainRenderProg() {
      var el = document.getElementById('c4-chain-prog');
      if (!el) { return; }
      if (!chainOn || !chainList.length) { el.textContent = ''; return; }
      el.textContent = '第 ' + (chainIdx >= 0 ? chainIdx + 1 : '-') + ' / ' + chainList.length + ' 条';
      if (!fsEl.hidden) { fsSyncAll(); }
    }
    function chainNext() {
      if (!chainList.length) { return; }
      chainIdx = (chainIdx + 1) % chainList.length;
      pLoadCode(chainList[chainIdx]);
    }
    function chainSetOn(on) {
      chainOn = !!on;
      var btn = document.getElementById('c4-p-chain');
      var row = document.getElementById('c4-chain-row');
      var body = document.querySelector('.c4-pmodal__body');
      if (btn) { btn.setAttribute('aria-pressed', chainOn ? 'true' : 'false'); }
      if (row) { row.hidden = !chainOn; }
      if (body) { body.classList.toggle('is-chain', chainOn); }
      clearTimeout(chainAdvTimer);
      if (chainOn) { buildChainList(); } else { chainList = []; chainIdx = -1; chainRenderProg(); }
    }

    /* ---------- 全屏沉浸计时 ---------- */
    var fsEl = document.getElementById('c4-fs');
    function fsSyncAll() {
      var codeEl = document.getElementById('c4-fs-code');
      var algEl = document.getElementById('c4-fs-alg');
      var progEl = document.getElementById('c4-fs-prog');
      if (codeEl) { codeEl.textContent = pCurrent || '--'; }
      if (algEl) {
        var c2 = commText(pCurrent);
        algEl.innerHTML = fmtAlg((algView === 'comm' && c2) ? c2 : algOf(pCurrent));
      }
      if (progEl) {
        progEl.textContent = (chainOn && chainList.length)
          ? ('第 ' + (chainIdx >= 0 ? chainIdx + 1 : '-') + ' / ' + chainList.length) : '';
      }
      pSyncTimerEls();
    }
    function fsOpen() {
      fsSyncAll();
      fsEl.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function fsClose() {
      fsEl.hidden = true;
      document.body.style.overflow = '';
    }
    function fsToggle() { if (fsEl.hidden) { fsOpen(); } else { fsClose(); } }

    /* ---------- 成绩导出 CSV ---------- */
    function csvCell(v) {
      var s = String(v == null ? '' : v);
      if (/[",\r\n]/.test(s)) { return '"' + s.replace(/"/g, '""') + '"'; }
      return s;
    }
    function exportCSV() {
      var rows = [['代码', '位置', '分组', '练习次数', '最快(秒)', '全部平均(秒)', '最近一次(秒)', '最近10次(秒)', '当前公式', '括号格式', '换过公式']];
      var exported = 0;
      ALL.forEach(function (c) {
        var st = statsOf(c);
        if (st.n === 0) { return; }
        exported++;
        var last10 = (times[c] || []).slice(-10).map(function (ms) { return (ms / 1000).toFixed(3); });
        var gi = GIDX_REF[c.charAt(1)];
        rows.push([
          c,
          posStr(c),
          gi >= 0 ? groupName(gi) : '—',
          st.n,
          (st.best / 1000).toFixed(3),
          (st.allavg / 1000).toFixed(3),
          isFinite(st.session) ? (st.session / 1000).toFixed(3) : '',
          last10.join('; '),
          algOf(c),
          displayAlg(c) !== algOf(c) ? displayAlg(c) : '',
          isSwapped(c) ? '是' : ''
        ]);
      });
      if (!exported) { toast('还没有已练公式的成绩'); return; }
      var csv = '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      var d = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      a.href = URL.createObjectURL(blob);
      a.download = 'ft-' + sys + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); if (a.remove) { a.remove(); } }, 1000);
      toast('已导出 ' + exported + ' 条公式成绩');
    }

    /* ---------- 事件绑定 ---------- */
    function bind() {
      document.getElementById('c4-q').addEventListener('input', function () { renderFilterHint(); renderCurrent(); });
      document.getElementById('c4-metric').addEventListener('change', function () { metricMode = this.value; renderCurrent(); });
      document.getElementById('c4-sort').addEventListener('change', function () { sortMode = this.value; renderBoard(); });
      document.getElementById('c4-filter').addEventListener('change', function () { filterMode = this.value; renderFilterHint(); renderCurrent(); });

      // 详情浮层
      document.getElementById('c4-m-close').addEventListener('click', closeModal);
      var mclose2 = document.getElementById('c4-m-close2');
      if (mclose2) { mclose2.addEventListener('click', closeModal); }
      document.getElementById('c4-m-prev').addEventListener('click', function () { stepModal(-1); });
      document.getElementById('c4-m-next').addEventListener('click', function () { stepModal(1); });
      document.getElementById('c4-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
      document.getElementById('c4-m-copy').addEventListener('click', function () {
        copyText(currentModalCode() + '  ' + (displayAlg(currentModalCode()) || ''));
      });
      document.getElementById('c4-m-locate').addEventListener('click', function () {
        var code = currentModalCode();
        closeModal();
        setTimeout(function () { pOpenFor(code); }, 60);
      });
      /* 参考公式：前 5 条与折叠区各绑一份（同一套切换逻辑） */
      function bindRefList(id) {
        var box = document.getElementById(id);
        if (!box) { return; }
        box.addEventListener('click', function (e) {
          var btn = (e.target && e.target.closest) ? e.target.closest('.c4-ref') : null;
          if (!btn) { return; }
          var alg = btn.getAttribute('data-alg');
          if (!alg) { return; }
          setSwap(modalCode, alg);
          var i = curRefIdx(modalCode);
          toast('已切换为第 ' + (i + 1) + ' 条参考公式' + (i === 0 ? '（默认）' : ''));
        });
      }
      bindRefList('c4-m-refslist');
      bindRefList('c4-m-refslist2');
      document.getElementById('c4-m-refsreset').addEventListener('click', function () {
        setSwap(modalCode, '');
        toast('已恢复默认公式');
      });
      document.getElementById('c4-m-refsmanual').addEventListener('click', function () {
        var code = currentModalCode();
        if (!code) { return; }
        var v = prompt('手动输入「' + code + '」的公式（留空或取消则不改动）：', algOf(code) || '');
        if (v === null) { return; }
        v = v.replace(/\s+/g, ' ').trim();
        if (!v) { return; }
        setSwap(code, v);
        toast(v === baseAlg(code) ? '已恢复默认公式' : '已设为自定义公式');
      });

      // 练习浮层
      document.getElementById('c4-p-close').addEventListener('click', pClose);
      document.getElementById('c4-p-prev').addEventListener('click', function () { pStep(-1); });
      document.getElementById('c4-p-next').addEventListener('click', function () { pStep(1); });
      document.getElementById('c4-p-detail').addEventListener('click', function () {
        if (pCurrent) { openModal(pCurrent); }
      });
      var pRefsBox = document.getElementById('c4-p-refsbox');
      var pRefsBtn = document.getElementById('c4-p-refs');
      pRefsBtn.addEventListener('click', function () {
        var show = pRefsBox.hidden;
        pRefsBox.hidden = !show;
        pRefsBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        if (show && pCurrent) { renderPRefs(pCurrent); }
      });
      document.getElementById('c4-p-refslist').addEventListener('click', function (e) {
        var btn = (e.target && e.target.closest) ? e.target.closest('.c4-ref') : null;
        if (!btn || !pCurrent) { return; }
        var alg = btn.getAttribute('data-alg');
        if (!alg) { return; }
        setSwap(pCurrent, alg);
        var i = curRefIdx(pCurrent);
        toast('已切换为第 ' + (i + 1) + ' 条参考公式' + (i === 0 ? '（默认）' : ''));
      });
      document.getElementById('c4-p-refsreset').addEventListener('click', function () {
        if (!pCurrent) { return; }
        setSwap(pCurrent, '');
        toast('已恢复默认公式');
      });
      document.getElementById('c4-p-refsmanual').addEventListener('click', function () {
        if (!pCurrent) { return; }
        var v = prompt('手动输入「' + pCurrent + '」的公式（留空或取消则不改动）：', algOf(pCurrent) || '');
        if (v === null) { return; }
        v = v.replace(/\s+/g, ' ').trim();
        if (!v) { return; }
        setSwap(pCurrent, v);
        toast(v === baseAlg(pCurrent) ? '已恢复默认公式' : '已设为自定义公式');
      });
      pSelect.addEventListener('change', function () { pLoadCode(pSelect.value); });
      document.getElementById('c4-p-chain').addEventListener('click', function () {
        chainSetOn(!chainOn);
        if (chainOn && !chainList.length) { toast('当前范围没有可练的公式'); }
      });
      document.getElementById('c4-chain-scope').addEventListener('change', function () {
        chainScope = this.value;
        if (chainOn) {
          buildChainList();
          if (!chainList.length) { toast('当前范围没有可练的公式'); }
        }
      });
      document.getElementById('c4-chain-order').addEventListener('change', function () {
        chainOrder = this.value;
        if (chainOn) { buildChainList(); }
      });
      document.getElementById('c4-p-copy').addEventListener('click', function () {
        copyText(pCurrent + '  ' + (displayAlg(pCurrent) || ''));
      });
      document.getElementById('c4-p-fs').addEventListener('click', fsToggle);
      document.getElementById('c4-p-export').addEventListener('click', exportCSV);
      document.getElementById('c4-fs-close').addEventListener('click', fsClose);
      document.getElementById('c4-fs-timer').addEventListener('click', function () {
        if (pState === 'running') { pStopTimer(); }
        else if (pState === 'done' || pState === 'idle') { pStartTimer(); }
      });
      document.getElementById('c4-p-del').addEventListener('click', function () {
        var s = (sessions[pCurrent] || []).slice();
        if (!s.length) { return; }
        s.pop();
        var allS = load(SESSIONS_KEY, {}); allS[pCurrent] = s; save(SESSIONS_KEY, allS);
        var allT = load(TIMES_KEY, {}); allT[pCurrent] = (times[pCurrent] || []).slice(0, s.length); save(TIMES_KEY, allT);
        try { sessions = load(SESSIONS_KEY, {}); times = load(TIMES_KEY, {}); } catch (e) {}
        pRefreshHistory(); renderCurrent();
      });
      document.getElementById('c4-p-clear').addEventListener('click', function () {
        if (!confirm('确认清空「' + pCurrent + '」的全部成绩？')) { return; }
        var allS = load(SESSIONS_KEY, {}), allT = load(TIMES_KEY, {});
        delete allS[pCurrent]; delete allT[pCurrent];
        save(SESSIONS_KEY, allS); save(TIMES_KEY, allT);
        try { sessions = load(SESSIONS_KEY, {}); times = load(TIMES_KEY, {}); } catch (e) {}
        pRefreshHistory(); renderCurrent();
      });
      pmodal.addEventListener('click', function (e) { if (e.target === pmodal) pClose(); });
      /* ⚠️ #c4-p-timer 只能绑一次：重复绑 = 一次点击先起后停（旧坑，勿动） */
      pTimerEl.addEventListener('click', function () {
        if (pState === 'running') { pStopTimer(); }
        else if (pState === 'done' || pState === 'idle') { pStartTimer(); }
      });

      // 键盘：从最上层开始逐层退（详情浮层 → 全屏计时 → 练习浮层）
      document.addEventListener('keydown', function (e) {
        var mOpen = document.getElementById('c4-modal').classList.contains('is-open');
        var pOpen = pmodal.classList.contains('is-open');
        if (mOpen) {
          if (e.key === 'Escape') { closeModal(); e.preventDefault(); }
          else if (e.key === 'ArrowLeft') { stepModal(-1); e.preventDefault(); }
          else if (e.key === 'ArrowRight') { stepModal(1); e.preventDefault(); }
          return;
        }
        if (!pOpen) { return; }
        if (e.key === 'Escape') {
          if (!fsEl.hidden) { fsClose(); } else { pClose(); }
          e.preventDefault(); return;
        }
        var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
        if (isSpace && !e.repeat) { pKeydownHold(); e.preventDefault(); return; }
        if (isFormFocus(e.target)) { return; }
        if (pState === 'running' || pState === 'prep' || pState === 'green') { return; }
        if (e.key === 'ArrowLeft') { pStep(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { pStep(1); e.preventDefault(); }
      });
      document.addEventListener('keyup', function (e) {
        if (!pmodal.classList.contains('is-open')) { return; }
        var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
        if (isSpace) { pKeyupHold(); e.preventDefault(); }
      });
    }
    function isFormFocus(t) {
      if (!t) { return false; }
      var tag = t.tagName;
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
    }
    function copyText(txt) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast('已复制：' + txt); },
          function () { toast('复制失败，请手动选择'); });
      } else { toast('浏览器不支持自动复制'); }
    }

    /* ================= 缓冲切换 ================= */
    /* 数组必须原地换内容：TrainMatrix 持有 rowOrder/colOrder/codes 引用 */
    function replaceArr(target, src) {
      target.length = 0;
      Array.prototype.push.apply(target, src);
      return target;
    }
    function rebuildAll() {
      var list = [];
      ORDER.forEach(function (r) {
        ORDER.forEach(function (c) {
          var code = state.BUF + r + c;
          if (FT.cellOf(state.D, code) || state.swaps[code]) { list.push(code); }
        });
      });
      replaceArr(ALL, list);
    }
    function renderBufBar() {
      var box = document.getElementById('ft-buf-list');
      var cur = document.getElementById('ft-buf-cur');
      if (!box) { return; }
      var html = '';
      FT.LETTERS.forEach(function (L) {
        var pos = state.POS[L] || '';
        html += '<button type="button" class="ft-bufbtn' + (L === state.BUF ? ' is-on' : '') + '"' +
          ' data-buf="' + L + '" aria-pressed="' + (L === state.BUF ? 'true' : 'false') + '"' +
          ' title="' + L + ' · ' + esc(pos) + '">' + L + '</button>';
      });
      box.innerHTML = html;
      if (cur) {
        cur.innerHTML = '当前 <b>' + esc(state.POS[state.BUF] || '') + '</b>（' + state.BUF + '）';
      }
      /* 页头副标题里的缓冲名同步（六个训练页都有这个元素） */
      var nm = document.getElementById('ft-buf-name');
      if (nm) { nm.textContent = (state.POS[state.BUF] || '') + '（' + state.BUF + '）'; }
    }
    function updateHead() {
      var meta = state.D.meta || {};
      var oc = { blddb: 0, rot: 0, excel: 0 };
      Object.keys(state.D.cells || {}).forEach(function (k) {
        var o = state.D.cells[k][3];
        if (oc[o] !== undefined) { oc[o]++; }
      });
      var cnt = document.getElementById('c4-count');
      if (cnt) { cnt.textContent = ALL.length; }
      var src = document.getElementById('ft-src');
      if (src) {
        var parts = [];
        if (oc.blddb) { parts.push('库直接 ' + oc.blddb); }
        if (oc.rot) { parts.push('旋转派生 ' + oc.rot); }
        if (oc.excel) { parts.push('你的公式表 ' + oc.excel); }
        src.textContent = parts.length ? parts.join(' · ') : '—';
        if (meta.blank) { src.textContent += ' · 刻意留空 ' + meta.blank + ' 格（可手动补全）'; }
      }
    }
    function adoptData(d) {
      state.D = d;
      state.BUF = d.buf;
      state.GROUPS = d.groups || [];
      state.POS = d.pos || {};
      state.illegal = FT.illegalFn(sys, d);
      state.cells0 = d.cells || {};
      /* 清理迁移来的脏 swaps（等于默认主公式 / 新数据无此码的条目） */
      state.swaps = FT.normalizeSwaps(sys, d);
      rebuildGIDX();
      replaceArr(ORDER, d.order || []);
      rebuildAll();
      invalidateList();
      renderBufBar();
      updateHead();
      /* 切缓冲后字母集合变了，旧的行/列锁定已无意义 → 复位（v2.0.28） */
      axisRows = {};
      axisCols = {};
      fillPSelect();
      renderBoard();
      renderMatrix();
      applyAxisClasses();
      /* 练习浮层里若是旧缓冲的 code，直接关掉，避免串味 */
      if (pmodal.classList.contains('is-open')) { pClose(); }
    }
    function switchBuf(buf) {
      if (!state.D || buf === state.BUF) { return; }
      FT.setBuf(sys, buf);
      state.BUF = buf;
      renderBufBar();
      var box = document.getElementById('ft-buf-list');
      if (box) { box.style.opacity = '.5'; }
      FT.load(sys, buf).then(function (d) {
        if (box) { box.style.opacity = ''; }
        adoptData(d);
      }).catch(function (e) {
        if (box) { box.style.opacity = ''; }
        toast('加载 ' + buf + ' 缓冲数据失败：' + (e && e.message ? e.message : '网络错误'));
      });
    }
    function bindBufBar() {
      var box = document.getElementById('ft-buf-list');
      if (!box) { return; }
      box.addEventListener('click', function (e) {
        var btn = (e.target && e.target.closest) ? e.target.closest('.ft-bufbtn') : null;
        if (btn) { switchBuf(btn.getAttribute('data-buf')); }
      });
    }

    /* ---------- 公式显示方式（展开式 / 括号格式 / 都显示） ----------
       三处入口共用同一个 algView：工具条按钮（快捷两态）、工具条下拉（三选）、
       详情浮层里的分段按钮（三选）。切完全量重渲染，保证矩阵 tip / 详情 /
       练习浮层 / 全屏 / CSV 列口径一致。 */
    function renderAlgViewAll() {
      renderCurrent();
      if (modalCode && document.getElementById('c4-modal').classList.contains('is-open')) {
        fillModal(modalCode);
      }
      if (pCurrent && pmodal.classList.contains('is-open')) {
        pRenderAlg(pCurrent);
        renderPRefs(pCurrent);
      }
      if (!fsEl.hidden) { fsSyncAll(); }
    }
    function initAlgView() {
      var btn = document.getElementById('c4-comm');
      var sel = document.getElementById('c4-algview');
      /* 三阶角/棱是噩梦风格源，没有括号数据：把括号相关入口一并收掉，
         免得用户切过去发现「怎么还是展开式」。 */
      if (!SYS.hasComm) {
        if (btn) { btn.hidden = true; }
        if (sel) {
          Array.prototype.forEach.call(sel.querySelectorAll('option'), function (o) {
            if (o.value === 'comm' || o.value === 'both') { o.disabled = true; }
          });
        }
        if (algView !== 'expand') { setAlgView('expand'); }
        return;
      }
      if (sel) { sel.value = algView; }
      if (btn) {
        btn.setAttribute('aria-pressed', algView === 'expand' ? 'false' : 'true');
        btn.classList.toggle('is-on', algView !== 'expand');
        btn.addEventListener('click', function () {
          setAlgView(algView === 'expand' ? 'comm' : 'expand');
          renderAlgViewAll();
          toast(algView === 'comm' ? '已切换为括号格式（[A,B] 交换子 · A:[B,C] 共轭）' : '已切换为展开式');
        });
      }
      if (sel) {
        sel.addEventListener('change', function () {
          setAlgView(this.value);
          renderAlgViewAll();
          toast(this.value === 'both' ? '同时显示展开式与括号格式'
              : (this.value === 'comm' ? '已切换为括号格式' : '已切换为展开式'));
        });
      }
      var seg = document.getElementById('c4-m-algview');
      if (seg) {
        seg.addEventListener('click', function (e) {
          var b = (e.target && e.target.closest) ? e.target.closest('button[data-av]') : null;
          if (!b) { return; }
          setAlgView(b.getAttribute('data-av'));
          renderAlgViewAll();
        });
      }
      syncModalAlgViewSeg();
    }

    /* ---------- 练习模式（单次 / 三次平均） ---------- */
    function initRepMode() {
      var a = document.getElementById('c4-repmode');
      var b = document.getElementById('c4-p-repmode');
      if (a) {
        a.value = repMode;
        a.addEventListener('change', function () {
          setRepMode(this.value);
          if (pCurrent && pmodal.classList.contains('is-open')) { pRenderAlg(pCurrent); }
          toast(this.value === 'avg3' ? '连做三次取平均（做满 3 次才记一次成绩）' : '单次计时');
        });
      }
      if (b) {
        b.value = repMode;
        b.addEventListener('change', function () {
          setRepMode(this.value);
          if (pCurrent && pmodal.classList.contains('is-open')) { pRenderAlg(pCurrent); }
          toast(this.value === 'avg3' ? '连做三次取平均（做满 3 次才记一次成绩）' : '单次计时');
        });
      }
    }

    /* ---------- 筛选状态提示 + 清空（v2.0.28）----------
       原「字母筛选行」删除后，由它接替两件事：
       ① 在工具条显示当前锁定状态（行/列/搜索/下拉），避免锁了看不出锁了啥；
       ② 「清空筛选」一键复位行列锁定 + 搜索 + 下拉。 */
    function renderFilterHint() {
      var hint = document.getElementById('c4-filter-hint');
      if (!hint) { return; }
      if (hasAxisFilter()) {
        var rs = Object.keys(axisRows).filter(function (k) { return axisRows[k]; });
        var cs = Object.keys(axisCols).filter(function (k) { return axisCols[k]; });
        hint.textContent = '已锁定 行 ' + (rs.join('') || '—') + ' · 列 ' + (cs.join('') || '—')
          + '（点矩阵行/列标增减）';
      } else if (hasAnyFilter()) {
        hint.textContent = '筛选生效中（搜索 / 下拉），点「清空筛选」复位';
      } else {
        hint.textContent = '';
      }
    }
    function clearAllFilters() {
      axisRows = {};
      axisCols = {};
      filterMode = 'all';
      var q = document.getElementById('c4-q');
      if (q) { q.value = ''; }
      var f = document.getElementById('c4-filter');
      if (f) { f.value = 'all'; }
      applyAxisClasses();
      renderFilterHint();
      renderCurrent();
    }
    function initClear() {
      var btn = document.getElementById('c4-clear');
      if (btn) { btn.addEventListener('click', clearAllFilters); }
      renderFilterHint();
    }

    /* ---------- 矩阵行列坐标点击筛选（v2.0.27 起为唯一行列筛选入口） ---------- */
    /* 高亮当前锁定行/列；每次矩阵重渲染后由 MutationObserver 自动重画 */
    function applyAxisClasses() {
      var mx = document.getElementById('c4-matrix');
      if (!mx) { return; }
      mx.classList.toggle('is-axis', hasAxisFilter());
      var heads = mx.querySelectorAll('.mx-rh, .mx-ch');
      for (var i = 0; i < heads.length; i++) {
        var h = heads[i], txt = (h.textContent || '').trim();
        if (h.classList.contains('mx-rh')) {
          h.classList.toggle('is-axis-on', !!axisRows[txt]);
        } else {
          h.classList.toggle('is-axis-on', !!axisCols[txt]);
        }
      }
      renderFilterHint();
    }
    function initAxis() {
      var mx = document.getElementById('c4-matrix');
      if (!mx) { return; }
      mx.addEventListener('click', function (e) {
        var t = e.target;
        var rh = (t && t.closest) ? t.closest('.mx-rh') : null;
        var ch = (t && t.closest) ? t.closest('.mx-ch') : null;
        var h = rh || ch;
        if (!h) { return; }
        e.preventDefault();
        var txt = (h.textContent || '').trim();
        var set = rh ? axisRows : axisCols;
        if (set[txt]) { delete set[txt]; } else { set[txt] = true; }
        renderCurrent();
        applyAxisClasses();
      });
      /* 矩阵每次重渲染（切视图 / 改筛选）都重画轴高亮与 is-axis 类 */
      if (typeof MutationObserver !== 'undefined') {
        var mo = new MutationObserver(function () { applyAxisClasses(); });
        mo.observe(mx, { childList: true, subtree: false });
      }
      applyAxisClasses();
    }

    /* ---------- 星标交互（矩阵格 / 看板 / 详情 / 练习浮层） ---------- */
    function initStars() {
      /* 矩阵格里的星标：捕获阶段拦截，避免冒泡到格子触发「打开练习」 */
      var mx = document.getElementById('c4-matrix');
      if (mx) {
        mx.addEventListener('click', function (e) {
          var s = (e.target && e.target.closest) ? e.target.closest('[data-star]') : null;
          if (!s) { return; }
          e.preventDefault();
          e.stopPropagation();
          toggleStar(s.getAttribute('data-star'));
        }, true);
      }
      var mstar = document.getElementById('c4-m-star');
      if (mstar) {
        mstar.addEventListener('click', function () {
          if (modalCode) { toggleStar(modalCode); fillModal(modalCode); }
        });
      }
      var starc = document.getElementById('c4-m-starc');
      if (starc) {
        starc.addEventListener('click', function (e) {
          var b = (e.target && e.target.closest) ? e.target.closest('[data-sc]') : null;
          if (!b || !modalCode) { return; }
          var k = b.getAttribute('data-sc');
          var cur = starOf(modalCode);
          if (cur && (cur.c || 'gold') === k) { toggleStar(modalCode); }   /* 再点同档 = 取消 */
          else { setStarColor(modalCode, k); }
          fillModal(modalCode);
          renderCurrent();   /* 同步矩阵 / 看板里的星标 */
        });
      }
      var note = document.getElementById('c4-m-note');
      if (note) {
        note.addEventListener('change', function () {
          if (modalCode) { setStarNote(modalCode, this.value.trim()); fillModal(modalCode); renderCurrent(); }
        });
      }
      var pstar = document.getElementById('c4-p-star');
      if (pstar) {
        pstar.addEventListener('click', function () {
          if (pCurrent) { toggleStar(pCurrent); pRenderAlg(pCurrent); renderCurrent(); }
        });
      }
      /* 练习浮层标记行（v2.0.29）：五档颜色直接选，备注直接写 */
      var pstarc = document.getElementById('c4-p-starc');
      if (pstarc) {
        pstarc.addEventListener('click', function (e) {
          var b = (e.target && e.target.closest) ? e.target.closest('[data-sc]') : null;
          if (!b || !pCurrent) { return; }
          var k = b.getAttribute('data-sc');
          var cur = starOf(pCurrent);
          if (cur && (cur.c || 'gold') === k) { toggleStar(pCurrent); }   /* 再点同档 = 取消 */
          else { setStarColor(pCurrent, k); }
          pRenderAlg(pCurrent);
          renderCurrent();
        });
      }
      var pnote = document.getElementById('c4-p-note');
      if (pnote) {
        pnote.addEventListener('change', function () {
          if (pCurrent) { setStarNote(pCurrent, this.value.trim()); pRenderAlg(pCurrent); renderCurrent(); }
        });
      }
    }

    /* ================= 启动 ================= */
    bindBufBar();
    bind();
    initAlgView();
    initRepMode();
    initClear();
    initAxis();
    initStars();
    setView('matrix');
    TM.watch();

    FT.load(sys, state.BUF).then(function (d) {
      adoptData(d);
    }).catch(function (e) {
      var mx = document.getElementById('c4-matrix');
      if (mx) {
        mx.innerHTML = '<div class="c4-empty" style="padding:40px 20px">'
          + '数据加载失败：' + esc(e && e.message ? e.message : '网络错误')
          + '<br>请检查网络后刷新页面；公式数据在 <b>data/</b> 目录下（共 96 个按缓冲切片文件）。</div>';
      }
    });

    /* ================= 账号同步（LSProvider） ================= */
    window.addEventListener('sync:status', function (e) {
      var st = e && e.detail && e.detail[SYNC_ID];
      if (!st || !st.result || st.result.kind !== 'downloaded') { return; }
      try { times = load(TIMES_KEY, {}); sessions = load(SESSIONS_KEY, {}); } catch (err) { return; }
      renderCurrent();
      if (pmodal.classList.contains('is-open')) { pRefreshHistory(); }
    });
    if (window.SyncBoot) {
      SyncBoot.ready(function () {
        if (!window.LSProvider) { return; }
        LSProvider.register({
          id: SYNC_ID,
          label: '公式训练器 · ' + SYS.name,
          path: SYNC_ID + '.json',
          keys: [TIMES_KEY, SESSIONS_KEY],
          isEmptySnap: function (snap) {
            if (!snap) { return true; }
            var n = 0;
            [TIMES_KEY, SESSIONS_KEY].forEach(function (k) {
              var raw = snap[k];
              if (raw == null || raw === '') { return; }
              try {
                var o = JSON.parse(raw) || {};
                Object.keys(o).forEach(function (c) { n += (o[c] || []).length; });
              } catch (err) {}
            });
            return n === 0;
          }
        });
      });
    }
  }

  return { mount: mount };
})();
