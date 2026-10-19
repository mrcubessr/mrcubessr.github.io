/* =========================================================
   cfop-trainer.js — 三阶 OLL / PLL 公式训练引擎（tools/cfop）
 *
 * 覆盖页面：oll-trainer.html（57 条 OLL）、pll-trainer.html（21 条 PLL）。
 * 两页都是薄壳：<head> 样式 + 一行 CFOP.mount({ set: 'oll' | 'pll' })，
 * 骨架（工具条 / 仪表盘 / 看板 / 练习浮层 / 全屏计时 / 公式库 / toast）
 * 全部由本文件注入 —— 与 tools/ft/ft-page.js 同一思路，改一处两页生效。
 *
 * 与盲拧公式训练器（tools/ft）的关系：交互全面对齐 ——
 *   ① 看板卡片：大字名称 + 时间 + 五档星标 + 换过公式金边（外加案例预览图）；
 *   ② 练习浮层：按住空格起表、单次 / 连做三次取平均、星标五档 + 备注、
 *      成绩历史、删除最近一次、清空该式、导出 CSV、全屏计时、连练；
 *   ③ 统计口径：最近一次 / 最快单次 / 全部平均，快慢七阶字色 + 中位数基准；
 *   ④ 星标 / 练习模式复用 ft-core（键 ft_stars_<set> / ft_repmode），两边一致。
 * 差异：CFOP 没有字母编码矩阵，筛选走「排序 / 指标 / 下拉筛选 / 搜索」；
 *      公式不堆在卡片和浮窗里，用「公式下拉 + 公式库面板」选择；
 *      独有 AUF（y 转体）编辑：去掉转体后按角度旋转平面图使其对应。
 *
 * 数据：fetch /tools/cfop/data/{set}.json（speedcubedb 本地化，唯一来源；
 *       与旧页内联数据已逐条比对 0 差异）。结构：
 *   { set, count, cases: [ { id, subgroup, setup, facelets, orientations: [ { name, algs[] } ] } ] }
 *
 * 用法（页面内联）：
 *   CFOP.mount({ set: 'oll' });
 * ========================================================= */
window.CFOP = (function () {
  'use strict';

  /* ================= 体系配置 ================= */
  var SETS = {
    oll: {
      id: 'oll', name: 'OLL', title: 'OLL 公式训练',
      sub: '57 条顶层朝向公式 · 点卡片进练习 · 卡片颜色越绿越快、越红越慢',
      data: '/tools/cfop/data/oll.json',
      back: '/tools/3x3/', backLabel: '← 返回三阶',
      groupLabel: '形状类型',
      minCell: 132, minFloor: 88,   // 理想卡宽 / 硬下限（57 卡一屏只有 ~97px 可用）
      maxChars: 6                    // 最长名称字符数（"OLL 57"）
    },
    pll: {
      id: 'pll', name: 'PLL', title: 'PLL 公式训练',
      sub: '21 条顶层置换公式 · 点卡片进练习 · 卡片颜色越绿越快、越红越慢',
      data: '/tools/cfop/data/pll.json',
      back: '/tools/3x3/', backLabel: '← 返回三阶',
      groupLabel: '置换类型',
      minCell: 105, minFloor: 96,
      maxChars: 2                    // 最长名称（"Gb"）
    }
  };

  function mount(opt) {
    var S = SETS[opt && opt.set] || SETS.oll;
    var SET = S.id;
    /* 看板视图：复用 ft 的 body.is-board 口径（train-matrix.css 隐藏页脚 +
       收 body 下内边距），把高度让给卡片。 */
    document.body.classList.add('is-board');

    /* ================= 1) 数据 ================= */
    /* cases: [{ id, num, sub, facelets, algs:[{alg,label}] }]
       orientations 全部摊平：一个 case 的所有候选公式按顺序排列，
       多方向的用方向名做标签（当前 OLL/PLL 数据都是单方向 4 条）。 */
    var CASES = [], byId = {};
    var SUBGROUPS = [];              // 保持数据顺序的类型列表

    function flatten(d) {
      (d.cases || []).forEach(function (c) {
        var algs = [];
        (c.orientations || []).forEach(function (o) {
          (o.algs || []).forEach(function (a, i) {
            if (!a) { return; }
            var lab = (o.name ? o.name + ' · ' : '') + '公式 ' + (i + 1);
            algs.push({ alg: a, label: lab });
          });
        });
        if (!algs.length) { return; }
        var cs = {
          id: c.id, sub: c.subgroup || '其他', facelets: c.facelets, algs: algs,
          num: parseFloat(String(c.id).replace(/[^\d.]/g, '')) || 0
        };
        CASES.push(cs);
        byId[cs.id] = cs;
        if (SUBGROUPS.indexOf(cs.sub) < 0) { SUBGROUPS.push(cs.sub); }
      });
    }

    /* ================= 2) 本地存储 ================= */
    var K = function (n) { return 'cfop_' + SET + '_' + n; };
    function load(k, fb) {
      try { return JSON.parse(localStorage.getItem(k)) || fb; } catch (e) { return fb; }
    }
    function save(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    }
    var times = load(K('times'), {});       // { id: [ms,...] } 全部历史单次
    var sessions = load(K('sessions'), {}); // { id: [ms,...] } 本次会话（浮层历史显示）
    /* swaps[id] = { i: 候选公式序号|null, alg: 自定义公式|null, k: 公式有效角度(0..3) }
       —— i 非空 = 选了非默认的候选公式；alg 非空 = 手动输入；k = 该公式对应的
       平面图旋转量（去掉 y 转体后按角度旋转预览图，见 AUF 一节）。 */
    var swaps = load(K('swaps'), {});
    /* 星标走 ft-core（与盲拧公式训练器同一套五档颜色） */
    var stars = window.FT ? FT.getStars(SET) : {};

    function saveSwaps() { save(K('swaps'), swaps); }
    function saveStars() { if (window.FT) { FT.saveStars(SET, stars); } }
    function starOf(id) { return stars[id] || null; }

    /* ============ 旧页数据一次性迁移（v2.0.31）============
       旧 oll-trainer / pll-trainer 是自包含页，成绩存在
       oll_times / oll_swaps、pll_times / pll_swaps（时间单位同为毫秒）。
       重建后换成 cfop_<set>_* 键；首次打开任意一页时把旧数据搬过来，
       旧键一律保留不动（不删不改），cfop_migrated_v1 防重入。
       旧 swaps 只有 { alg }，补成新结构 { i:null, alg, k:0 }（k=0 标准角度）。 */
    var MIGRATE_KEY = 'cfop_migrated_v1';
    (function migrateLegacy() {
      try {
        if (localStorage.getItem(MIGRATE_KEY)) { return; }
        var jobs = [
          { set: 'oll', from: 'oll_times', to: 'cfop_oll_times', kind: 'list' },
          { set: 'oll', from: 'oll_swaps', to: 'cfop_oll_swaps', kind: 'alg' },
          { set: 'pll', from: 'pll_times', to: 'cfop_pll_times', kind: 'list' },
          { set: 'pll', from: 'pll_swaps', to: 'cfop_pll_swaps', kind: 'alg' }
        ];
        jobs.forEach(function (j) {
          var old;
          try { old = JSON.parse(localStorage.getItem(j.from)); } catch (e) { return; }
          if (!old || typeof old !== 'object') { return; }
          var dst;
          try { dst = JSON.parse(localStorage.getItem(j.to)) || {}; } catch (e) { dst = {}; }
          var moved = 0;
          Object.keys(old).forEach(function (id) {
            if (dst[id] !== undefined) { return; }
            var v = old[id];
            if (j.kind === 'list') {
              if (!Array.isArray(v) || !v.length) { return; }
              for (var i = 0; i < v.length; i++) {
                if (typeof v[i] !== 'number' || !isFinite(v[i]) || v[i] < 0) { return; }
              }
              dst[id] = v;
            } else {
              var alg = (v && typeof v === 'object') ? v.alg : v;
              if (typeof alg !== 'string' || !alg.trim()) { return; }
              dst[id] = { i: null, alg: alg.trim(), k: 0 };
            }
            moved++;
          });
          if (moved) {
            try { localStorage.setItem(j.to, JSON.stringify(dst)); } catch (e) {}
          }
        });
        try { localStorage.setItem(MIGRATE_KEY, '1'); } catch (e) {}
      } catch (e) {}
    })();
    /* 迁移发生在读取之后，这里按新键重新读一遍，保证本次会话就能看到迁过来的数据 */
    times = load(K('times'), {});
    sessions = load(K('sessions'), {});
    swaps = load(K('swaps'), {});

    /* 当前公式：{ text, k, label, isCustom, vi }
       text = 基准公式（不含预览 AUF 前缀）；k = 该公式有效的图案角度；
       vi = 候选序号（自定义时为 -1）。 */
    function curAlg(c) {
      var sw = swaps[c.id];
      if (sw && sw.alg) {
        return { text: sw.alg, k: (sw.k || 0) % 4, label: '自定义公式', isCustom: true, vi: -1 };
      }
      var i = (sw && sw.i != null) ? sw.i : 0;
      var v = c.algs[i] || c.algs[0];
      return { text: v.alg, k: 0, label: v.label, isCustom: false, vi: c.algs.indexOf(v) };
    }
    function isSwapped(id) {
      var sw = swaps[id];
      return !!sw && (!!sw.alg || (sw.i != null && sw.i !== 0));
    }

    /* ================= 3) 统计 / 配色（与 ft 同一套口径） ================= */
    var metricMode = 'best';    // session | best | allavg
    var sortMode = 'num';       // num | fast | slow | practice | group | star
    var filterMode = 'all';

    function fmtTime(ms) {
      if (!isFinite(ms) || ms < 0) { return '--.--'; }
      var total = Math.round(ms);
      var sec = Math.floor(total / 1000), mill = total % 1000;
      return sec + '.' + String(mill).padStart(3, '0');
    }
    function avg(a) {
      if (!a || !a.length) { return NaN; }
      return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    }
    function median(a) {
      if (!a.length) { return NaN; }
      var s = a.slice().sort(function (x, y) { return x - y; });
      var m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    function statsOf(id) {
      var t = times[id] || [], s = sessions[id] || [];
      var st = {
        n: t.length,
        best: t.length ? Math.min.apply(null, t) : NaN,
        allavg: avg(t),
        session: s.length ? s[s.length - 1] : NaN
      };
      st.metric = function () {
        if (metricMode === 'allavg') { return st.allavg; }
        if (metricMode === 'best') { return st.best; }
        return st.session;
      };
      return st;
    }
    function tierOf(m, bench) {
      if (!isFinite(m)) { return 't-none'; }
      if (!isFinite(bench) || bench <= 0) { return 't-good'; }
      var r = m / bench;
      if (r <= 0.85) { return 't-great'; }
      if (r <= 1.00) { return 't-good'; }
      if (r <= 1.15) { return 't-warn'; }
      return 't-bad';
    }
    /* 快慢字色 7 阶（--spd-t0..6，亮/暗双套由 train-matrix.css 提供）；
       bg 连续插值只给仪表盘图例。与 ft-page.js colorByRatio 同参数同返回。 */
    function colorByRatio(r, range) {
      if (!isFinite(r)) {
        return { bg: 'transparent', fg: 'var(--fg-3, #7C8798)', text: 'var(--fg-3, #7C8798)', tier: 't-none' };
      }
      var lo = (range && isFinite(range.lo)) ? range.lo : 0.55;
      var hi = (range && isFinite(range.hi)) ? range.hi : 1.45;
      var t = Math.max(0, Math.min(1, (r - lo) / (hi - lo)));
      var spdIdx = Math.max(0, Math.min(6, Math.round(t * 6)));
      var text = 'var(--spd-t' + spdIdx + ')';
      var stops = [
        { at: 0.00, c: [22, 163, 74] }, { at: 0.25, c: [74, 222, 128] },
        { at: 0.40, c: [132, 204, 22] }, { at: 0.55, c: [250, 204, 21] },
        { at: 0.70, c: [251, 146, 60] }, { at: 0.85, c: [220, 38, 38] },
        { at: 1.00, c: [127, 29, 29] }
      ];
      var i = 0;
      while (i < stops.length - 1 && t > stops[i + 1].at) { i++; }
      var s0 = stops[i], s1 = stops[Math.min(i + 1, stops.length - 1)];
      var local = s1.at === s0.at ? 0 : (t - s0.at) / (s1.at - s0.at);
      var rgbv = [0, 1, 2].map(function (k) { return Math.round(s0.c[k] + (s1.c[k] - s0.c[k]) * local); });
      var tier;
      if (r <= 0.85) { tier = 't-great'; }
      else if (r <= 1.00) { tier = 't-good'; }
      else if (r <= 1.15) { tier = 't-warn'; }
      else { tier = 't-bad'; }
      return { bg: 'rgb(' + rgbv.join(',') + ')', fg: text, text: text, tier: tier, r: r };
    }
    function colorRange(list, benchRef) {
      var rs = list
        .map(function (c) { var m = statsOf(c).metric(); return (isFinite(m) && isFinite(benchRef) && benchRef > 0) ? m / benchRef : NaN; })
        .filter(isFinite).sort(function (a, b) { return a - b; });
      if (rs.length < 3) { return { lo: 0.55, hi: 1.45 }; }
      var lo = rs[Math.floor(rs.length * 0.05)];
      var hi = rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.95))];
      var span = Math.max(0.4, hi - lo), mid = (lo + hi) / 2;
      return { lo: Math.max(0.3, mid - span / 2), hi: Math.min(2.0, mid + span / 2) };
    }
    function computeAll() {
      var stats = {};
      CASES.forEach(function (c) { stats[c.id] = statsOf(c.id); });
      var practiced = CASES.filter(function (c) { return stats[c.id].n > 0 && isFinite(stats[c.id].metric()); });
      var bench = median(practiced.map(function (c) { return stats[c.id].metric(); }));
      var range = colorRange(practiced, bench);
      return { stats: stats, practiced: practiced, bench: bench, range: range };
    }

    /* ================= 4) 工具函数 ================= */
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* 公式语法着色（与 ft 一致：U:[...] 前缀走 a-pre，括号标点走 a-punct） */
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
    var toastTimer = 0;
    function toast(msg) {
      var el = document.getElementById('c4-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'c4-toast'; el.className = 'c4-toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 1600);
    }
    function copyText(t) {
      try { navigator.clipboard.writeText(t); } catch (e) {
        var ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) {}
        document.body.removeChild(ta);
      }
    }

    /* ================= 5) 平面图（顶面示意图 + 旋转） =================
       移植自旧 oll-trainer.html（推导已验证）：
       - U 面 3×3 网格顺时针转；四条侧面顶行绕中心轮转 F→L→B→R→F；
       - 预览顺时针 90° = 实例比标准态多转了一次 U（先 U' 归位再执行公式）。 */
    function rotGridCW(s) {
      var o = [];
      for (var r = 0; r < 3; r++) { for (var c = 0; c < 3; c++) { o[r * 3 + c] = s[(2 - c) * 3 + r]; } }
      return o.join('');
    }
    function rotateFacelets(fl, k) {
      k = ((k % 4) + 4) % 4;
      if (k === 0 || !fl) { return fl; }
      var us = fl['data-us'];
      var top = {
        f: fl['data-uf'].slice(0, 3), l: fl['data-ul'].slice(0, 3),
        b: fl['data-ub'].slice(0, 3), r: fl['data-ur'].slice(0, 3)
      };
      for (var i = 0; i < k; i++) {
        us = rotGridCW(us);
        var nf = top.r, nl = top.f, nb = top.l, nr = top.b;
        top = { f: nf, l: nl, b: nb, r: nr };
      }
      return {
        'data-us': us,
        'data-ub': top.b + fl['data-ub'].slice(3),
        'data-uf': top.f + fl['data-uf'].slice(3),
        'data-ul': top.l + fl['data-ul'].slice(3),
        'data-ur': top.r + fl['data-ur'].slice(3)
      };
    }
    function netSvg(c, k) {
      try { return window.CubeArt.flatCase(rotateFacelets(c.facelets, k || 0)); } catch (e) { return null; }
    }

    /* ================= 6) AUF（y 转体）解析与显示 =================
       数据约定：一个 case 列出的所有公式（无论带不带 y 前缀）都按「标准角度」
       的图案成立。把公式最前面的 y 转体剥掉后，公式对「顺时针转过相应角度」
       的图案成立 —— 所以去掉转体时要同步把平面图转过去，两边才对应。 */
    function splitAuf(alg) {
      var m = /^((?:y2|y'|y)(?:\s+(?:y2|y'|y))*)\s+(.+)$/.exec(alg || '');
      if (!m) { return { k: 0, prefix: '', rest: alg || '' }; }
      var k = 0;
      m[1].split(/\s+/).forEach(function (t) {
        k += (t === 'y') ? 1 : (t === 'y2') ? 2 : 3;
      });
      return { k: ((k % 4) + 4) % 4, prefix: m[1] + ' ', rest: m[2] };
    }
    /* aufPrefix(m) = U^(-m)：实例比公式角度多转了 m 次 U，先拧回来 */
    function aufPrefix(m) {
      m = ((m % 4) + 4) % 4;
      return m === 1 ? "U' " : m === 2 ? 'U2 ' : m === 3 ? 'U ' : '';
    }
    /* 显示用公式 = 基准公式 + AUF 前缀。rot = 当前平面图旋转量(0..3)，
       k = 公式有效角度。要先把图案从 rot 拧到 k：U^(k-rot) = aufPrefix(rot-k)。 */
    function displayedAlg(c, rot) {
      var cur = curAlg(c);
      var need = ((rot - cur.k) % 4 + 4) % 4;
      return aufPrefix(need) + cur.text;
    }

    /* ================= 7) 骨架注入 ================= */
    function chromeHTML() {
      var h = '';
      /* ---------- 工具条 ---------- */
      h += '<div class="c4-bar">'
        + '  <label for="c4-sort">排序</label>'
        + '  <select id="c4-sort" title="卡片排列顺序">'
        + '    <option value="num">按编号</option>'
        + '    <option value="fast">最快优先</option>'
        + '    <option value="slow">最慢优先</option>'
        + '    <option value="practice">按练习次数</option>'
        + '    <option value="group">按' + S.groupLabel + '分组</option>'
        + '    <option value="star">★ 标记优先</option>'
        + '  </select>'
        + '  <label for="c4-metric">指标</label>'
        + '  <select id="c4-metric" title="卡片上显示的时间按哪种口径算，配色与排序都以它为准">'
        + '    <option value="best">最快单次</option>'
        + '    <option value="session">最近一次</option>'
        + '    <option value="allavg">全部平均</option>'
        + '  </select>'
        + '  <label for="c4-filter">筛选</label>'
        + '  <select id="c4-filter" title="只保留符合条件的公式">'
        + '    <option value="all">全部 ' + CASES.length + ' 条</option>'
        + '    <option value="todo">只看未练</option>'
        + '    <option value="done">只看已练</option>'
        + '    <option value="weak">需关注 + 不合格</option>'
        + '    <option value="starred">★ 只看已标记</option>'
        + '    <option value="mother">只看母公式</option>'
        + '    <option value="swapped">只看换过公式</option>'
        + '  </select>'
        + '  <label for="c4-repmode">练习</label>'
        + '  <select id="c4-repmode" title="每条公式练一次记一次，还是连做三次取平均">'
        + '    <option value="single">单次计时</option>'
        + '    <option value="avg3">连做三次取平均</option>'
        + '  </select>'
        + '  <label for="c4-q">搜索</label>'
        + '  <input type="search" id="c4-q" placeholder="编号 / 公式" autocomplete="off">'
        + '  <button type="button" id="c4-clear" class="c4-navbtn"'
        + '          title="清空筛选：下拉筛选 + 搜索，全部复位">清空筛选</button>'
        + '  <span class="c4-filter-hint" id="c4-filter-hint"></span>'
        + '</div>';
      /* ---------- 仪表盘 ---------- */
      h += '<section id="c4-dash" class="c4-dash">'
        + '  <span class="c4-dash__title">训练总览</span>'
        + '  <span class="c4-dash__std">基准 <b id="c4-bench">--</b><i id="c4-bench-metric">最快单次</i></span>'
        + '  <div class="c4-kpis" id="c4-kpis"></div>'
        + '  <span class="c4-gradbox">'
        + '    <span class="c4-grad" aria-hidden="true"></span>'
        + '    <span class="c4-grad-ticks" id="c4-ticks"></span>'
        + '  </span>'
        + '  <details class="c4-top" id="c4-top">'
        + '    <summary>🎯 最慢 TOP 10</summary>'
        + '    <div class="c4-top__list" id="c4-top-list"></div>'
        + '  </details>'
        + '</section>';
      /* ---------- 看板 ---------- */
      h += '<div id="c4-board" class="c4-board-wrap"><div class="c4-board"></div></div>';
      /* ---------- 练习浮层 ---------- */
      h += '<div class="c4-pmodal" id="c4-pmodal" role="dialog" aria-modal="true" aria-label="公式练习">'
        + '  <div class="c4-pmodal__box">'
        + '    <div class="c4-pmodal__bar">'
        + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-prev" title="上一条（←）">←</button>'
        + '      <select id="c4-p-select" class="c4-pmodal__select" aria-label="选择公式案例"></select>'
        + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-next" title="下一条（→）">→</button>'
        + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-chain" aria-pressed="false" title="连练：停表后自动进入下一条">连练</button>'
        + '      <button type="button" class="c4-pmodal__navbtn" id="c4-p-refs" aria-pressed="false" title="公式库：查看 / 切换本条的全部候选公式">公式库</button>'
        + '      <span class="c4-spacer"></span>'
        + '      <span class="c4-pmodal__hint">按住空格 0.3s 变绿后松开开始</span>'
        + '      <button type="button" class="c4-pmodal__close" id="c4-p-close" aria-label="关闭">×</button>'
        + '    </div>'
        + '    <div class="c4-pmodal__body">'
        /* 连练控制行 */
        + '      <div class="c4-chain" id="c4-chain" hidden>'
        + '        <label for="c4-chain-scope">范围</label>'
        + '        <select id="c4-chain-scope">'
        + '          <option value="all">全部公式</option>'
        + '          <option value="group">当前' + S.groupLabel + '</option>'
        + '          <option value="todo">只看未练</option>'
        + '        </select>'
        + '        <label for="c4-chain-order">顺序</label>'
        + '        <select id="c4-chain-order">'
        + '          <option value="seq">按编号</option>'
        + '          <option value="rand">随机</option>'
        + '        </select>'
        + '        <span class="c4-chain__prog" id="c4-chain-prog"></span>'
        + '      </div>'
        /* 标题行：案例名 + 星标 + 练习模式 */
        + '      <div class="c4-pmodal__headrow">'
        + '        <div class="c4-pmodal__code" id="c4-p-code">--</div>'
        + '        <span class="cf-auf-badge" id="c4-auf-badge" hidden></span>'
        + '        <button type="button" class="c4-pmodal__star" id="c4-p-star" title="标记这条公式（母公式 / 重点练 / 易错…）">☆</button>'
        + '        <span class="c4-spacer"></span>'
        + '        <label for="c4-p-repmode" class="c4-pmodal__replab">练习</label>'
        + '        <select id="c4-p-repmode" class="c4-pmodal__repselect" title="单次计时，还是连做三次取平均">'
        + '          <option value="single">单次</option>'
        + '          <option value="avg3">三次平均</option>'
        + '        </select>'
        + '      </div>'
        /* 案例预览图（顶面示意图，随 AUF 旋转） */
        + '      <div class="cf-mnet" id="c4-m-net"></div>'
        /* 公式选择 + 方向控制 */
        + '      <div class="cf-algrow">'
        + '        <label for="c4-p-var">公式</label>'
        + '        <select id="c4-p-var" class="c4-pmodal__select" title="公式库：切换本条公式的候选算法"></select>'
        + '        <span class="cf-algrow__gap"></span>'
        + '        <div class="cf-rot" role="group" aria-label="旋转预览方向">'
        + '          <button type="button" class="c4-pmodal__navbtn" id="c4-rot-ccw" title="预览左转 90°（公式自动加对应 AUF）">↺</button>'
        + '          <span class="cf-rot__label" id="c4-rot-label">0°</span>'
        + '          <button type="button" class="c4-pmodal__navbtn" id="c4-rot-cw" title="预览右转 90°（公式自动加对应 AUF）">↻</button>'
        + '        </div>'
        + '        <button type="button" class="c4-pmodal__navbtn" id="c4-strip" title="去掉公式最前面的 y 转体，并把预览图转成对应角度">去掉转体</button>'
        + '        <button type="button" class="c4-pmodal__navbtn" id="c4-edit" title="手动修改这条公式（按当前预览角度保存）">✎</button>'
        + '        <button type="button" class="c4-pmodal__navbtn" id="c4-alg-reset" title="恢复数据里的默认公式">恢复默认</button>'
        + '      </div>'
        /* 手动编辑输入框（默认隐藏） */
        + '      <div class="cf-editrow" id="c4-editrow" hidden>'
        + '        <input class="input" id="c4-alg-input" type="text" autocomplete="off" spellcheck="false"'
        + '               placeholder="输入公式，回车保存，Esc 取消">'
        + '        <button type="button" class="c4-pmodal__navbtn" id="c4-alg-save">保存</button>'
        + '      </div>'
        /* 公式主体 */
        + '      <div class="c4-pmodal__alg" id="c4-p-alg">加载中…</div>'
        /* 标记行（v2.0.29 同款：五档颜色 + 备注，点开就能直接选） */
        + '      <div class="c4-pmodal__starrow">'
        + '        <span class="k">标记</span>'
        + '        <span class="ft-starc" id="c4-p-starc"></span>'
        + '        <input class="input c4-pmodal__note" id="c4-p-note" type="text" maxlength="60"'
        + '               placeholder="备注：如「母公式，同类型都从它变」">'
        + '      </div>'
        + '      <div class="c4-pmodal__rep" id="c4-p-rep" hidden></div>'
        /* 公式库面板 */
        + '      <div class="c4-pmodal__refs" id="c4-refs" hidden>'
        + '        <div class="c4-modal__refsbar">'
        + '          <span class="k">公式库</span>'
        + '          <span class="c4-modal__refsnote">点一条即切换；金边 = 当前使用的公式</span>'
        + '          <button type="button" class="c4-modal__refsman" id="c4-refs-manual">✎ 手动输入</button>'
        + '          <button type="button" class="c4-modal__refsreset" id="c4-refs-reset">恢复默认</button>'
        + '        </div>'
        + '        <div class="c4-modal__refslist" id="c4-refs-list"></div>'
        + '      </div>'
        /* 计时器 */
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
        + '</div>';
      /* ---------- 全屏沉浸计时 ---------- */
      h += '<div class="c4-fs" id="c4-fs" hidden>'
        + '  <div class="c4-fs__bar">'
        + '    <span class="c4-fs__code" id="c4-fs-code">--</span>'
        + '    <span class="c4-fs__prog" id="c4-fs-prog"></span>'
        + '    <span class="c4-spacer"></span>'
        + '    <span class="c4-fs__hint">按住空格 0.3s 松开起表 · 再按停表</span>'
        + '    <button type="button" class="c4-fs__close" id="c4-fs-close" aria-label="退出全屏">×</button>'
        + '  </div>'
        + '  <div class="c4-fs__timer" id="c4-fs-timer" data-state="idle">0.000</div>'
        + '  <div class="c4-fs__alg" id="c4-fs-alg"></div>'
        + '</div>';
      return h;
    }

    /* ================= 8) 页面装配 ================= */
    /* 页面结构（与 tools/ft 各页一致）：<main class="c4-wrap"> 内
       <div class="c4-head">…</div> + <div id="cfop-mount"></div></main> ——
       骨架全部注入 #cfop-mount，标题区由页面自己写（不被引擎覆盖）。
       页面 head 需引：site-nav/components/site-layout.css + ft.css
       （内含 train-matrix.css 全套框架样式）+ css/cfop-trainer.css。 */
    var mountBox = document.getElementById('cfop-mount');
    var board = null, boardEl = null, pmodal = null, fsEl = null;
    var $ = function (id) { return document.getElementById(id); };

    /* ================= 9) 看板渲染 ================= */
    function currentList() {
      var q = ($('c4-q').value || '').trim().toUpperCase();
      var list = CASES.filter(function (c) {
        /* 下拉筛选 */
        var st = statsOf(c.id);
        if (filterMode === 'todo' && st.n > 0) { return false; }
        if (filterMode === 'done' && st.n === 0) { return false; }
        if (filterMode.indexOf('sub:') === 0 && c.sub !== filterMode.slice(4)) { return false; }
        if (filterMode === 'weak') {
          var A = computeAll();
          var t = tierOf(st.metric(), A.bench);
          if (!(st.n > 0 && (t === 't-bad' || t === 't-warn'))) { return false; }
        }
        if (filterMode === 'starred' && !starOf(c.id)) { return false; }
        if (filterMode === 'mother' && !(starOf(c.id) && (starOf(c.id).c || 'gold') === 'gold')) { return false; }
        if (filterMode === 'swapped' && !isSwapped(c.id)) { return false; }
        /* 搜索：编号 / 类型 / 公式（候选与自定义都匹配） */
        if (q) {
          var hay = (c.id + ' ' + c.sub + ' ' + c.algs.map(function (a) { return a.alg; }).join(' ')).toUpperCase();
          var cur = curAlg(c).text.toUpperCase();
          if (hay.indexOf(q) < 0 && cur.indexOf(q) < 0) { return false; }
        }
        return true;
      });
      var A = computeAll();
      var stats = A.stats;
      if (sortMode === 'fast' || sortMode === 'slow') {
        var dir = sortMode === 'fast' ? 1 : -1;
        list.sort(function (a, b) {
          var x = stats[a.id].metric(), y = stats[b.id].metric();
          var fx = isFinite(x), fy = isFinite(y);
          if (fx && fy) { return (x - y) * dir; }
          if (fx !== fy) { return fx ? -1 : 1; }
          return a.id.localeCompare(b.id, undefined, { numeric: true });
        });
      } else if (sortMode === 'practice') {
        list.sort(function (a, b) {
          var na = stats[a.id].n, nb = stats[b.id].n;
          if (na !== nb) { return nb - na; }
          return a.id.localeCompare(b.id, undefined, { numeric: true });
        });
      } else if (sortMode === 'group') {
        var ord = {};
        SUBGROUPS.forEach(function (s, i) { ord[s] = i; });
        list.sort(function (a, b) {
          return (ord[a.sub] - ord[b.sub]) || a.id.localeCompare(b.id, undefined, { numeric: true });
        });
      } else if (sortMode === 'star') {
        var rank = function (c) {
          var s = starOf(c.id);
          if (!s) { return 9; }
          return (s.c === 'gold') ? 0 : 1;
        };
        list.sort(function (a, b) {
          return (rank(a) - rank(b)) || a.id.localeCompare(b.id, undefined, { numeric: true });
        });
      } else {
        list.sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); });
      }
      return list;
    }

    function gclass(sub) { return 'g' + Math.max(0, SUBGROUPS.indexOf(sub)); }

    function renderDash(A) {
      var stats = A.stats, bench = A.bench;
      $('c4-bench').textContent = fmtTime(bench);
      $('c4-bench-metric').textContent =
        metricMode === 'session' ? '最近一次' : (metricMode === 'best' ? '最快单次' : '全部平均');
      var totalN = 0, weak = 0, warn = 0, swappedN = 0;
      CASES.forEach(function (c) {
        totalN += stats[c.id].n;
        if (isSwapped(c.id)) { swappedN++; }
        if (stats[c.id].n === 0) { return; }
        var t = tierOf(stats[c.id].metric(), bench);
        if (t === 't-bad') { weak++; } else if (t === 't-warn') { warn++; }
      });
      $('c4-kpis').innerHTML =
        '<div class="c4-kpi"><div class="k-label">公式总数</div><div class="k-value">' + CASES.length + '</div></div>'
        + '<div class="c4-kpi"><div class="k-label">已练习</div><div class="k-value">' + A.practiced.length + ' / ' + CASES.length + '</div></div>'
        + '<div class="c4-kpi"><div class="k-label">累计次数</div><div class="k-value">' + totalN + '</div></div>'
        + (swappedN ? '<div class="c4-kpi"><div class="k-label">换过公式</div><div class="k-value" style="color:#f5c518">' + swappedN + '</div></div>' : '')
        + '<div class="c4-kpi"><div class="k-label">不合格（慢）</div><div class="k-value" style="color:#ef4444">' + weak + '</div></div>'
        + '<div class="c4-kpi"><div class="k-label">需关注</div><div class="k-value" style="color:#f59e0b">' + warn + '</div></div>';
      $('c4-ticks').innerHTML =
        '<span style="left:0%">' + A.range.lo.toFixed(2) + '×</span>'
        + '<span style="left:50%">' + ((A.range.lo + A.range.hi) / 2).toFixed(2) + '× 基准</span>'
        + '<span style="left:100%">' + A.range.hi.toFixed(2) + '×</span>';
      var topBox = $('c4-top');
      var ranked = A.practiced.slice().sort(function (a, b) { return stats[b.id].metric() - stats[a.id].metric(); });
      var top = ranked.slice(0, 10);
      if (top.length) {
        topBox.classList.remove('is-empty');
        $('c4-top-list').innerHTML = top.map(function (c, i) {
          return '<button type="button" class="c4-top__item" data-code="' + esc(c.id) + '">'
            + '<span class="c4-top__rank">#' + (i + 1) + '</span><b>' + esc(c.id) + '</b>'
            + '<span class="c4-top__ms">' + fmtTime(stats[c.id].metric()) + '</span></button>';
        }).join('');
      } else {
        topBox.classList.add('is-empty');
        $('c4-top-list').innerHTML = '';
      }
      /* 筛选提示 */
      var hint = [];
      if (filterMode !== 'all') { hint.push('筛选：' + $('c4-filter').selectedOptions[0].textContent); }
      var qv = ($('c4-q').value || '').trim();
      if (qv) { hint.push('搜索：' + qv); }
      $('c4-filter-hint').textContent = hint.join(' · ');
    }

    function renderBoard() {
      if (!boardEl) { return; }
      var A = computeAll();
      renderDash(A);
      var list = currentList();
      if (!list.length) {
        boardEl.innerHTML = '<div class="c4-empty">没有符合筛选条件的公式。</div>';
        fitBoard();
        return;
      }
      boardEl.innerHTML = list.map(function (c) {
        var st = A.stats[c.id];
        var m = st.metric();
        var r = (st.n && isFinite(m) && isFinite(A.bench) && A.bench > 0) ? m / A.bench : NaN;
        var col = colorByRatio(r, A.range);
        var cur = curAlg(c);
        var sk = starOf(c.id);
        var svg = netSvg(c, 0);
        var title = c.id + ' · ' + c.sub + ' · ' + cur.label + '：' + cur.text
          + (st.n ? ('　最好 ' + fmtTime(st.best) + ' · 均 ' + fmtTime(st.allavg) + ' · ' + st.n + ' 次') : '　未练习');
        if (isSwapped(c.id)) { title += '　（已换公式）'; }
        var klass = (col.tier === 't-none' ? 't-none' : 'has-data ' + col.tier)
          + (isSwapped(c.id) ? ' is-swapped' : '');
        return '<a class="c4-bcell ' + gclass(c.sub) + ' ' + klass + '" data-code="' + esc(c.id) + '" '
          + 'style="color:' + col.text + '" title="' + esc(title) + '">'
          + '<span class="cf-net">' + (svg ? svg.outerHTML : '') + '</span>'
          + '<span class="c-code">' + esc(c.id) + '</span>'
          + '<span class="c-ms">' + (st.n ? fmtTime(m) : '--') + '</span>'
          + (st.n ? '<span class="c-n">' + st.n + '</span>' : '')
          + (sk ? '<span class="c-star s-' + esc(sk.c || 'gold') + '" data-star="' + esc(c.id) + '" title="'
                 + esc((window.FT ? FT.starColorName(sk.c) : (sk.c || 'gold')) + (sk.n ? ' · ' + sk.n : '')) + '">★</span>' : '')
          + (isSwapped(c.id) ? '<span class="c-swap" title="已切换公式：' + esc(cur.text) + '">换</span>' : '')
          + '</a>';
      }).join('');
      fitBoard();
    }

    /* ================= 10) 看板铺满（两轮：理想卡宽 → 硬下限） ================= */
    var fitRaf = 0;
    function fitBoard() {
      if (!boardEl || !window.TrainMatrix) { return; }
      var n = boardEl.children.length;
      if (!n) { return; }
      /* 页脚交给框架：body.is-board 让 train-matrix.css 隐藏 footer 并把 body
         下内边距从 64px 收到 14px（与 ft 看板视图同口径）——页脚 109px 会让
         21 张 PLL 卡在 768 高度死活差一屏。这里不再用 JS 动 footer。 */
      var tailEls = ['.cfop-foot'];
      var opts = {
        gap: 8, minCell: S.minCell, minCellNarrow: 96, maxCell: 180, maxAspect: 1.75,
        includeFooter: false, tailEls: tailEls, halfLen: S.maxChars
      };
      var r = TrainMatrix.fitBoard(boardEl, opts);
      if (!r || !r.fitsH) {
        /* 第一轮排不出一屏 → 降到硬下限重搜（OLL 57 卡在桌面只有 ~97px 可用，
           拿 132 当硬下限必然全军覆没；与旧页 minCellFloorFor 同思路） */
        r = TrainMatrix.fitBoard(boardEl, Object.assign({}, opts, { minCell: S.minFloor, minCellNarrow: 88 }));
      }
      /* 名称 / 时间字号按实际卡宽与最长名称反推 */
      var cellW = parseFloat(boardEl.style.getPropertyValue('--c4-cell-w')) || 82;
      var cellH = parseFloat(boardEl.style.getPropertyValue('--c4-cell-h')) || 82;
      var nameFs = Math.max(9, Math.min(cellW * 0.92 / (S.maxChars * 0.62), cellH * 0.20));
      boardEl.style.setProperty('--cf-name-fs', nameFs.toFixed(2) + 'px');
      boardEl.style.setProperty('--cf-ms-fs', Math.max(8, cellH * 0.13).toFixed(2) + 'px');
      if (window.TrainMatrix.lockScroll) { TrainMatrix.lockScroll(!!(r && r.fitsH)); }
    }
    function scheduleFit() {
      if (fitRaf) { cancelAnimationFrame(fitRaf); }
      fitRaf = requestAnimationFrame(function () { fitRaf = 0; fitBoard(); });
    }

    /* ================= 11) 练习浮层 ================= */
    var pCurrent = null;     // 当前案例 id
    var rot = 0;             // 预览图顺时针旋转量 0..3
    var repMode = window.FT ? FT.repMode() : 'single';
    var repList = [], repIdx = 0;

    /* ---- 计时器状态机（hold-to-start，与 ft 同款；repeat 分支必须幂等） ---- */
    var pState = 'idle', pStart = 0, pTick = 0, pPrep = 0;
    function pFmt(ms) {
      if (!isFinite(ms) || ms < 0) { return '0.000'; }
      var total = Math.round(ms);
      var sec = Math.floor(total / 1000), mill = total % 1000;
      return sec + '.' + String(mill).padStart(3, '0');
    }
    function pSyncTimerEls() {
      var fs = $('c4-fs-timer');
      if (fs) { fs.textContent = $('c4-p-timer').textContent; fs.dataset.state = $('c4-p-timer').dataset.state; }
    }
    function pSetState(s) { $('c4-p-timer').dataset.state = s; pState = s; pSyncTimerEls(); }
    function pRenderTimer() {
      if (pState === 'running') { $('c4-p-timer').textContent = pFmt(performance.now() - pStart); }
      pSyncTimerEls();
    }
    function pStartTimer() {
      if (pState === 'running') { return; }
      pSetState('running');
      pStart = performance.now();
      $('c4-p-summary').hidden = true;
      pTick = setInterval(pRenderTimer, 50);
    }
    function pStopTimer() {
      if (pState !== 'running') { return; }
      clearInterval(pTick);
      var total = performance.now() - pStart;
      pSetState('done');
      $('c4-p-timer').textContent = pFmt(total);
      if (repMode === 'avg3') {
        repList.push(total);
        repIdx = repList.length;
        renderRepProgress();
        if (repIdx >= 3) {
          repFinish();
          clearTimeout(chainAdvTimer);
          if (chainOn && chainList.length) { chainAdvTimer = setTimeout(chainNext, 800); }
        } else {
          $('c4-p-summary').hidden = false;
          $('c4-p-summary').innerHTML = '第 ' + repIdx + '/3 次 <b>' + fmtTime(total) + '</b> · 再按住空格做第 ' + (repIdx + 1) + ' 次';
        }
        return;
      }
      pushTimes(total);
      $('c4-p-summary').hidden = false;
      $('c4-p-summary').innerHTML = '本次用时 <b>' + fmtTime(total) + '</b>';
      pRefreshHistory();
      renderCurrent();
      clearTimeout(chainAdvTimer);
      if (chainOn && chainList.length) { chainAdvTimer = setTimeout(chainNext, 800); }
    }
    function pResetTimer() {
      clearInterval(pTick); clearTimeout(pPrep);
      pSetState('idle');
      $('c4-p-timer').textContent = '0.000';
      $('c4-p-summary').hidden = true;
    }
    function pKeydownHold() {
      if (pState === 'running') { pStopTimer(); return; }
      /* ⚠️ 长按 autorepeat 会重复触发 keydown：此处必须「什么都不做」。
         旧写法 clearTimeout(pPrep) 不重建 ⟹ 按住再久到不了 green（ft 旧坑）。 */
      if (pState === 'prep' || pState === 'green') { return; }
      clearTimeout(pPrep);
      pSetState('prep');
      $('c4-p-timer').textContent = '按住';
      pPrep = setTimeout(function () {
        if (pState === 'prep') { pSetState('green'); $('c4-p-timer').textContent = '松开'; }
      }, 300);
    }
    function pKeyupHold() {
      clearTimeout(pPrep);
      if (pState === 'green') { pStartTimer(); return; }
      if (pState === 'prep') { pResetTimer(); return; }
    }
    function toggleTimerMouse() {
      if (pState === 'running') { pStopTimer(); }
      else if (pState === 'done' || pState === 'idle') { pStartTimer(); }
    }

    /* ---- 成绩 ---- */
    function pushTimes(ms) {
      if (!pCurrent) { return; }
      (times[pCurrent] = times[pCurrent] || []).push(ms);
      (sessions[pCurrent] = sessions[pCurrent] || []).push(ms);
      save(K('times'), times);
      save(K('sessions'), sessions);
    }
    function pRefreshHistory() {
      var s = (pCurrent && sessions[pCurrent]) || [];
      var box = $('c4-p-history');
      if (!s.length) { box.innerHTML = '<span style="color:var(--fg-3)">尚无成绩</span>'; return; }
      var parts = [];
      var start = Math.max(0, s.length - 20);
      for (var i = start; i < s.length; i++) { parts.push('<span class="sh-item">' + fmtTime(s[i]) + '</span>'); }
      box.innerHTML = parts.join('');
    }
    function renderRepProgress() {
      var box = $('c4-p-rep');
      if (repMode !== 'avg3') { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      if (!repList.length) {
        box.innerHTML = '<span class="c4-rep__lab">三次平均</span>'
          + '<span class="c4-rep__tip">连做 3 次后取平均记一次成绩</span>';
        return;
      }
      var parts = repList.map(function (ms, i) {
        return '<span class="c4-rep__i' + (i === repList.length - 1 ? ' is-cur' : '') + '">'
          + (i + 1) + ' · ' + fmtTime(ms) + '</span>';
      }).join('');
      box.innerHTML = '<span class="c4-rep__lab">三次平均 ' + repList.length + '/3</span>' + parts;
    }
    function repFinish() {
      var a = avg(repList);
      pushTimes(a);
      $('c4-p-summary').innerHTML = '三次 <b>' + repList.map(fmtTime).join(' / ') + '</b> → 平均 <b>'
        + fmtTime(a) + '</b>（记为 1 次成绩）';
      repList = []; repIdx = 0;
      pRefreshHistory();
      renderCurrent();
    }
    /* 练习模式：工具条与练习浮层两个下拉都能切，记全局键 ft_repmode（与 ft 一致） */
    function setRepMode(v) {
      repMode = v;
      if (window.FT) { FT.setRepMode(v); }
      repList = []; repIdx = 0;
      var a = $('c4-repmode'), b = $('c4-p-repmode');
      if (a) { a.value = v; }
      if (b) { b.value = v; }
      renderRepProgress();
    }

    /* ---- 星标 ---- */
    function renderStarColors(box, id) {
      var sk = starOf(id);
      box.innerHTML = (window.FT ? FT.STAR_COLORS : []).map(function (o) {
        var on = sk && (sk.c || 'gold') === o.k;
        return '<button type="button" class="ft-starc__b s-' + o.k + (on ? ' is-on' : '') + '"'
          + ' data-sc="' + o.k + '" title="' + esc(o.tip) + '">'
          + '<span class="ft-starc__dot"></span>' + esc(o.name) + '</button>';
      }).join('');
    }
    function toggleStar(id) {
      if (stars[id]) { delete stars[id]; }
      else { stars[id] = { c: 'gold', n: '' }; }
      saveStars();
    }
    function setStarColor(id, k) {
      if (!stars[id]) { stars[id] = { c: k, n: '' }; }
      else { stars[id].c = k; }
      saveStars();
    }
    function setStarNote(id, n) {
      if (!stars[id]) { stars[id] = { c: 'gold', n: n }; }
      else { stars[id].n = n; }
      saveStars();
    }
    function pRenderStar(id) {
      var sk = starOf(id);
      var sb = $('c4-p-star');
      sb.className = 'c4-pmodal__star' + (sk ? ' is-on s-' + esc(sk.c || 'gold') : '');
      sb.textContent = sk ? '★' : '☆';
      sb.title = sk ? ('已标记：' + (window.FT ? FT.starColorName(sk.c) : '') + (sk.n ? ' · ' + sk.n : '') + '（再点取消）')
                    : '标记这条公式（母公式 / 重点练 / 易错…）';
      renderStarColors($('c4-p-starc'), id);
      var note = $('c4-p-note');
      if (note && document.activeElement !== note) { note.value = sk ? (sk.n || '') : ''; }
    }

    /* ---- 公式库面板 ---- */
    function renderRefs() {
      var c = byId[pCurrent];
      if (!c) { return; }
      var cur = curAlg(c);
      var html = c.algs.map(function (v, i) {
        var on = (!cur.isCustom && cur.vi === i);
        return '<button type="button" class="c4-ref' + (on ? ' is-on' : '') + '" data-i="' + i + '">'
          + '<b>' + esc(v.label) + '</b>'
          + '<code>' + fmtAlg(v.alg) + '</code>'
          + '</button>';
      }).join('');
      if (cur.isCustom) {
        html += '<button type="button" class="c4-ref is-on" data-i="-1">'
          + '<b>自定义公式</b><code>' + fmtAlg(cur.text) + '</code></button>';
      }
      $('c4-refs-list').innerHTML = html;
    }

    /* ---- 浮层主渲染 ---- */
    function applyView() {
      var c = byId[pCurrent];
      if (!c) { return; }
      var cur = curAlg(c);
      var need = ((rot - cur.k) % 4 + 4) % 4;
      var pre = aufPrefix(need);
      /* 标题 + AUF 徽标 */
      $('c4-p-code').textContent = c.id + '　' + c.sub;
      var badge = $('c4-auf-badge');
      if (pre) { badge.hidden = false; badge.textContent = 'AUF ' + pre.trim(); }
      else { badge.hidden = true; badge.textContent = ''; }
      /* 预览图（按 rot 旋转） */
      var svg = netSvg(c, rot);
      $('c4-m-net').innerHTML = svg ? svg.outerHTML : '';
      /* 公式（含 AUF 前缀） */
      $('c4-p-alg').innerHTML = fmtAlg(pre + cur.text);
      $('c4-fs-alg').innerHTML = fmtAlg(pre + cur.text);
      /* 公式下拉 */
      var sel = $('c4-p-var');
      sel.innerHTML = c.algs.map(function (v, i) {
        return '<option value="' + i + '"' + ((!cur.isCustom && cur.vi === i) ? ' selected' : '')
          + '>' + esc(v.label) + '</option>';
      }).join('') + (cur.isCustom ? '<option value="-1" selected>自定义公式</option>' : '');
      /* 方向控制 */
      $('c4-rot-label').textContent = (rot * 90) + '°';
      /* 去掉转体：仅当基准公式最前面有 y 转体时可点 */
      var s = splitAuf(cur.text);
      var strip = $('c4-strip');
      if (s.k) {
        strip.disabled = false;
        strip.title = '去掉公式最前面的 ' + s.prefix.trim() + ' 转体，并把预览图转成对应角度（' + (s.k * 90) + '°）';
      } else {
        strip.disabled = true;
        strip.title = cur.isCustom ? '这条公式最前面没有 y 转体' : '这条公式没有 y 转体（数据里的公式已按标准角度给出）';
      }
      pRenderStar(pCurrent);
      var rs = $('c4-p-repmode');
      if (rs) { rs.value = repMode; }
      if (repList.length) { repList = []; repIdx = 0; }
      renderRepProgress();
      renderRefs();
      pRefreshHistory();
    }
    function pLoadCode(id) {
      if (!byId[id]) { return; }
      pCurrent = id;
      rot = 0;
      $('c4-p-select').value = id;
      applyView();
      pResetTimer();
      if (chainOn) {
        var ci = chainList.indexOf(id);
        if (ci >= 0) { chainIdx = ci; }
        chainRenderProg();
      }
      if (!fsEl.hidden) { fsSyncAll(); }
    }
    function pStep(delta) {
      if (!pCurrent) { return; }
      var list = (chainOn && chainList.length) ? chainList : CASES.map(function (c) { return c.id; });
      var i = list.indexOf(pCurrent);
      if (i < 0) { i = 0; }
      var j = Math.max(0, Math.min(list.length - 1, i + delta));
      pLoadCode(list[j]);
    }
    /* —— 蓝牙接线：把练习计时起停暴露给 cfop-bt.js ——
       只暴露「起 / 停 / 状态」，不参与键盘长按（pKeydownHold）流程，
       避免破坏既有的 hold-to-start 语义。 */
    window.CFOP._bt = {
      start: function () { if (pState === 'running') { return 'running'; } pStartTimer(); return pState; },
      stop: function () { if (pState === 'running') { pStopTimer(); } return pState; },
      state: function () { return pState; },
      open: function () { return !!(pmodal && pmodal.classList.contains('is-open')); },
      code: function () { return pCurrent || ''; }
    };

    function pOpenFor(id) {
      pmodal.classList.add('is-open');
      pLoadCode(id);
    }
    function pClose() {
      clearTimeout(pPrep); clearTimeout(chainAdvTimer);
      if (pState === 'running') { pStopTimer(); }
      fsClose();
      $('c4-editrow').hidden = true;
      $('c4-refs').hidden = true;
      $('c4-p-refs').setAttribute('aria-pressed', 'false');
      pmodal.classList.remove('is-open');
      pCurrent = null;
      /* 全屏计时锁过页面滚动；关浮层后按看板能否一屏恢复锁态
         （OLL 一屏装不下必须放滚，否则关掉浮层后页面卡住滚不动） */
      fitBoard();
    }

    /* ---- 公式切换 / AUF 操作 ---- */
    function selectVariant(i) {
      var c = byId[pCurrent];
      if (!c) { return; }
      i = parseInt(i, 10);
      if (i < 0) { return; }               /* -1 = 自定义（已在用，无需切换） */
      var sw = swaps[c.id] || {};
      sw.i = i; sw.alg = null; sw.k = 0;
      if (i === 0 && !sw.alg) { delete swaps[c.id]; }
      else { swaps[c.id] = sw; }
      saveSwaps();
      rot = 0;
      applyView();
      renderCurrent();
    }
    /* 去掉转体：剥掉公式最前面的 y 转体，平面图同步转过去使其对应 */
    function stripAuf() {
      var c = byId[pCurrent];
      if (!c) { return; }
      var cur = curAlg(c);
      var s = splitAuf(cur.text);
      if (!s.k) { toast('这条公式没有 y 转体'); return; }
      var nk = (cur.k + s.k) % 4;
      swaps[c.id] = { i: null, alg: s.rest, k: nk };
      saveSwaps();
      rot = nk;
      applyView();
      renderCurrent();
      toast('已去掉 ' + s.prefix.trim() + ' 转体 · 预览图同步转 ' + (nk * 90) + '°');
    }
    /* 手动编辑：按当前预览角度保存（k := rot），公式与所见图案直接对应 */
    function editOpen() {
      var c = byId[pCurrent];
      if (!c) { return; }
      var cur = curAlg(c);
      var row = $('c4-editrow'), inp = $('c4-alg-input');
      row.hidden = false;
      inp.value = cur.text;
      inp.focus();
      inp.select();
    }
    function editSave() {
      var c = byId[pCurrent];
      if (!c) { return; }
      var v = ($('c4-alg-input').value || '').trim();
      if (!v) { toast('公式不能为空'); return; }
      swaps[c.id] = { i: null, alg: v, k: rot };
      saveSwaps();
      $('c4-editrow').hidden = true;
      applyView();
      renderCurrent();
      toast('已保存自定义公式（按当前 ' + (rot * 90) + '° 角度）');
    }
    function editCancel() { $('c4-editrow').hidden = true; }
    function algReset() {
      var c = byId[pCurrent];
      if (!c) { return; }
      delete swaps[c.id];
      saveSwaps();
      rot = 0;
      applyView();
      renderCurrent();
      toast('已恢复默认公式');
    }

    /* ---- 连练 ---- */
    var chainOn = false, chainScope = 'all', chainOrder = 'seq';
    var chainList = [], chainIdx = -1, chainAdvTimer = 0;
    function buildChainList() {
      var list;
      if (chainScope === 'group') {
        var c0 = byId[pCurrent];
        list = CASES.filter(function (c) { return c.sub === (c0 && c0.sub); });
      } else if (chainScope === 'todo') {
        list = CASES.filter(function (c) { return statsOf(c.id).n === 0; });
      } else {
        list = CASES.slice();
      }
      if (chainOrder === 'rand') {
        for (var i = list.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = list[i]; list[i] = list[j]; list[j] = t;
        }
      }
      chainList = list.map(function (c) { return c.id; });
      chainIdx = pCurrent ? chainList.indexOf(pCurrent) : -1;
    }
    function chainRenderProg() {
      var el = $('c4-chain-prog');
      if (!chainOn || chainIdx < 0) { el.textContent = ''; return; }
      el.textContent = (chainIdx + 1) + ' / ' + chainList.length;
    }
    function chainNext() {
      if (!chainList.length) { return; }
      chainIdx = (chainIdx + 1) % chainList.length;
      pLoadCode(chainList[chainIdx]);
    }
    function chainToggle() {
      chainOn = !chainOn;
      $('c4-p-chain').setAttribute('aria-pressed', chainOn ? 'true' : 'false');
      $('c4-chain').hidden = !chainOn;
      document.querySelector('.c4-pmodal__body').classList.toggle('is-chain', chainOn);
      if (chainOn) {
        buildChainList();
        if (pCurrent && chainList.indexOf(pCurrent) < 0) { pLoadCode(chainList[0]); }
        else { chainRenderProg(); }
        if (!chainList.length) { toast('当前范围没有公式'); chainOn = false; $('c4-chain').hidden = true; $('c4-p-chain').setAttribute('aria-pressed', 'false'); }
      } else {
        clearTimeout(chainAdvTimer);
      }
    }

    /* ---- 全屏计时 ---- */
    function fsSyncAll() {
      $('c4-fs-code').textContent = pCurrent || '--';
      var c = byId[pCurrent];
      if (c) { $('c4-fs-alg').innerHTML = fmtAlg(displayedAlg(c, rot)); }
      if (chainOn && chainIdx >= 0) {
        $('c4-fs-prog').textContent = (chainIdx + 1) + ' / ' + chainList.length;
      } else { $('c4-fs-prog').textContent = ''; }
    }
    function fsOpen() {
      if (!pCurrent) { return; }
      fsEl.hidden = false;
      fsSyncAll();
      if (window.TrainMatrix) { TrainMatrix.lockScroll(true); }
    }
    function fsClose() {
      fsEl.hidden = true;
      if (window.TrainMatrix && !pmodal.classList.contains('is-open')) { TrainMatrix.lockScroll(false); }
    }

    /* ---- 导出 CSV ---- */
    function exportCsv() {
      var rows = [['id', 'subgroup', 'count', 'best_s', 'allavg_s', 'last_s', 'times_s'].join(',')];
      CASES.forEach(function (c) {
        var st = statsOf(c.id);
        var t = times[c.id] || [];
        rows.push([
          '"' + c.id + '"', '"' + c.sub + '"', st.n,
          isFinite(st.best) ? (st.best / 1000).toFixed(3) : '',
          isFinite(st.allavg) ? (st.allavg / 1000).toFixed(3) : '',
          isFinite(st.session) ? (st.session / 1000).toFixed(3) : '',
          '"' + t.map(function (x) { return (x / 1000).toFixed(3); }).join(' ') + '"'
        ].join(','));
      });
      var blob = new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = S.name.toLowerCase() + '-times.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('已导出 ' + S.name + ' 成绩 CSV');
    }

    /* ================= 12) 事件绑定 ================= */
    function renderCurrent() { renderBoard(); }

    function bind() {
      /* 工具条 */
      $('c4-sort').addEventListener('change', function () { sortMode = this.value; renderBoard(); });
      $('c4-metric').addEventListener('change', function () { metricMode = this.value; renderBoard(); });
      $('c4-filter').addEventListener('change', function () { filterMode = this.value; renderBoard(); });
      $('c4-q').addEventListener('input', renderBoard);
      $('c4-clear').addEventListener('click', function () {
        filterMode = 'all'; $('c4-filter').value = 'all';
        $('c4-q').value = '';
        renderBoard();
      });
      /* 看板点击：星标优先（点在星上只切星标，不打开练习），否则打开练习浮层 */
      if (boardEl) {
        boardEl.addEventListener('click', function (e) {
          var star = e.target.closest && e.target.closest('.c-star');
          if (star) {
            e.preventDefault();
            var id = star.getAttribute('data-star');
            if (stars[id]) { delete stars[id]; }
            else { stars[id] = { c: 'gold', n: '' }; }
            saveStars();
            renderBoard();
            return;
          }
          var cell = e.target.closest && e.target.closest('.c4-bcell');
          if (cell) { pOpenFor(cell.getAttribute('data-code')); }
        });
      }
      /* 浮层：关闭 / 导航 / 下拉 */
      pmodal.addEventListener('click', function (e) {
        if (e.target.hasAttribute('data-close')) { pClose(); }
      });
      $('c4-p-close').addEventListener('click', pClose);
      $('c4-p-prev').addEventListener('click', function () { pStep(-1); });
      $('c4-p-next').addEventListener('click', function () { pStep(1); });
      $('c4-p-select').addEventListener('change', function () { pLoadCode(this.value); });
      $('c4-p-var').addEventListener('change', function () { selectVariant(this.value); });
      /* 方向旋转：只转预览图，公式自动补 AUF 前缀 */
      $('c4-rot-cw').addEventListener('click', function () { rot = (rot + 1) % 4; applyView(); });
      $('c4-rot-ccw').addEventListener('click', function () { rot = (rot + 3) % 4; applyView(); });
      /* AUF 编辑 */
      $('c4-strip').addEventListener('click', stripAuf);
      $('c4-edit').addEventListener('click', editOpen);
      $('c4-alg-save').addEventListener('click', editSave);
      $('c4-alg-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); editSave(); }
        else if (e.key === 'Escape') { e.preventDefault(); editCancel(); }
        e.stopPropagation();
      });
      $('c4-alg-reset').addEventListener('click', algReset);
      /* 公式库面板 */
      $('c4-p-refs').addEventListener('click', function () {
        var box = $('c4-refs');
        var on = box.hidden;
        box.hidden = !on;
        this.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) { renderRefs(); }
      });
      $('c4-refs-list').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('.c4-ref');
        if (!b) { return; }
        var i = b.getAttribute('data-i');
        if (i === '-1') { editOpen(); return; }
        selectVariant(i);
        toast('已切换：' + byId[pCurrent].algs[parseInt(i, 10)].label);
      });
      $('c4-refs-manual').addEventListener('click', editOpen);
      $('c4-refs-reset').addEventListener('click', algReset);
      /* 连练 */
      $('c4-p-chain').addEventListener('click', chainToggle);
      $('c4-chain-scope').addEventListener('change', function () {
        chainScope = this.value; buildChainList(); chainRenderProg();
        if (chainOn && chainList.length && chainList.indexOf(pCurrent) < 0) { pLoadCode(chainList[0]); }
      });
      $('c4-chain-order').addEventListener('change', function () {
        chainOrder = this.value; buildChainList(); chainRenderProg();
      });
      /* 计时器 */
      $('c4-p-timer').addEventListener('click', toggleTimerMouse);
      /* 练习模式：工具条 + 浮层两个入口都走 setRepMode（两边同步） */
      $('c4-repmode').addEventListener('change', function () {
        setRepMode(this.value);
        toast(this.value === 'avg3' ? '连做三次取平均（做满 3 次才记一次成绩）' : '单次计时');
      });
      $('c4-p-repmode').addEventListener('change', function () {
        setRepMode(this.value);
        toast(this.value === 'avg3' ? '连做三次取平均（做满 3 次才记一次成绩）' : '单次计时');
      });
      /* 动作按钮 */
      $('c4-p-copy').addEventListener('click', function () {
        var c = byId[pCurrent];
        if (!c) { return; }
        copyText(displayedAlg(c, rot));
        toast('已复制公式');
      });
      $('c4-p-fs').addEventListener('click', fsOpen);
      $('c4-fs-close').addEventListener('click', fsClose);
      $('c4-p-export').addEventListener('click', exportCsv);
      $('c4-p-del').addEventListener('click', function () {
        if (!pCurrent) { return; }
        var t = times[pCurrent] || [], s = sessions[pCurrent] || [];
        if (!t.length) { toast('还没有成绩'); return; }
        t.pop(); s.pop();
        if (!t.length) { delete times[pCurrent]; }
        if (!s.length) { delete sessions[pCurrent]; }
        save(K('times'), times); save(K('sessions'), sessions);
        pRefreshHistory();
        renderCurrent();
        toast('已删除最近一次成绩');
      });
      $('c4-p-clear').addEventListener('click', function () {
        if (!pCurrent) { return; }
        if (!(times[pCurrent] || []).length && !(sessions[pCurrent] || []).length) { toast('还没有成绩'); return; }
        if (!window.confirm('清空 ' + pCurrent + ' 的全部练习成绩？此操作不可恢复。')) { return; }
        delete times[pCurrent]; delete sessions[pCurrent];
        save(K('times'), times); save(K('sessions'), sessions);
        pRefreshHistory();
        renderCurrent();
        toast('已清空 ' + pCurrent + ' 的成绩');
      });
      /* 星标 */
      $('c4-p-star').addEventListener('click', function () {
        if (!pCurrent) { return; }
        toggleStar(pCurrent);
        pRenderStar(pCurrent);
        renderCurrent();
      });
      $('c4-p-starc').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-sc]');
        if (!b || !pCurrent) { return; }
        var k = b.getAttribute('data-sc');
        var cur = starOf(pCurrent);
        if (cur && (cur.c || 'gold') === k) { toggleStar(pCurrent); }
        else { setStarColor(pCurrent, k); }
        pRenderStar(pCurrent);
        renderCurrent();
      });
      $('c4-p-note').addEventListener('change', function () {
        if (!pCurrent) { return; }
        setStarNote(pCurrent, this.value.trim());
        pRenderStar(pCurrent);
        renderCurrent();
      });
      /* 键盘：空格起表 / ←→ 切换 / Esc 关闭 */
      document.addEventListener('keydown', function (e) {
        if (!pmodal.classList.contains('is-open')) { return; }
        if (e.key === 'Escape') {
          if (!$('c4-editrow').hidden) { editCancel(); e.preventDefault(); return; }
          if (!fsEl.hidden) { fsClose(); e.preventDefault(); return; }
          pClose(); e.preventDefault(); return;
        }
        var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
        var t = e.target;
        var inForm = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                           t.tagName === 'SELECT' || t.isContentEditable);
        /* 表单里（备注输入 / 下拉展开）不抢按键：空格要能打字、上下要能选选项 */
        if (inForm) { return; }
        /* 空格始终归计时器（keydown 里 preventDefault 会抑制聚焦按钮的空格激活，
           避免双触发；repeat 分支在 pKeydownHold 内部幂等 return） */
        if (isSpace && !e.repeat) { pKeydownHold(); e.preventDefault(); return; }
        if (pState === 'running' || pState === 'prep' || pState === 'green') { return; }
        if (e.key === 'ArrowLeft') { pStep(-1); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { pStep(1); e.preventDefault(); }
      });
      document.addEventListener('keyup', function (e) {
        if (!pmodal.classList.contains('is-open')) { return; }
        var isSpace = (e.code === 'Space') || (e.key === ' ') || (e.key === 'Spacebar');
        if (isSpace) { pKeyupHold(); e.preventDefault(); }
      });
      /* 布局自适应 */
      window.addEventListener('resize', scheduleFit);
      window.addEventListener('orientationchange', scheduleFit);
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitBoard); }
      if (typeof ResizeObserver !== 'undefined') {
        var t = 0;
        var ro = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(fitBoard, 60); });
        ro.observe(document.documentElement);
        if (board) { ro.observe(board); }
      }
    }

    /* ================= 13) 案例下拉（按类型分组） ================= */
    function fillCaseSelect() {
      var html = '';
      SUBGROUPS.forEach(function (s) {
        html += '<optgroup label="' + esc(s) + '">';
        CASES.forEach(function (c) {
          if (c.sub === s) { html += '<option value="' + esc(c.id) + '">' + esc(c.id) + '</option>'; }
        });
        html += '</optgroup>';
      });
      $('c4-p-select').innerHTML = html;
    }
    /* 筛选下拉补「形状类型 / 置换类型」分组（必须在 chromeHTML 注入后调用，
       否则 #c4-filter 还不存在，分组会被静默丢掉） */
    function fillFilterGroups() {
      var sel = $('c4-filter');
      if (!sel) { return; }
      var og = document.createElement('optgroup');
      og.label = S.groupLabel;
      SUBGROUPS.forEach(function (s) {
        var o = document.createElement('option');
        o.value = 'sub:' + s;
        o.textContent = s + '（' + CASES.filter(function (c) { return c.sub === s; }).length + '）';
        og.appendChild(o);
      });
      sel.appendChild(og);
    }

    /* ================= 14) 启动 ================= */
    function boot() {
      if (!mountBox) { return; }
      mountBox.innerHTML = chromeHTML();
      /* 重新拿注入后的节点 */
      board = $('c4-board');
      boardEl = board ? board.querySelector('.c4-board') : null;
      pmodal = $('c4-pmodal');
      fsEl = $('c4-fs');
      fillCaseSelect();
      fillFilterGroups();
      bind();
      renderBoard();
      /* 指标/练习模式下拉回显（localStorage 里可能存过） */
      $('c4-metric').value = metricMode;
      $('c4-repmode').value = repMode;
      setTimeout(fitBoard, 0);
    }

    /* 数据加载 */
    if (mountBox) {
      mountBox.innerHTML = '<div class="c4-empty" style="padding:60px 0">正在加载 ' + S.name + ' 数据…</div>';
      fetch(S.data, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) { throw new Error('HTTP ' + r.status); }
          return r.json();
        })
        .then(function (d) {
          flatten(d);
          if (!CASES.length) { throw new Error('数据为空'); }
          /* 筛选下拉的类型分组在 boot() 里补（chromeHTML 注入后才能找到 #c4-filter） */
          boot();
        })
        .catch(function (e) {
          mountBox.innerHTML = '<div class="c4-empty" style="padding:60px 0">' + S.name
            + ' 数据加载失败：' + esc(e.message || e) + '。<a href="' + S.back + '">返回</a></div>';
        });
    }
  }

  return { mount: mount, SETS: SETS };
})();
