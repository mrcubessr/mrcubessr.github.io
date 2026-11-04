/* =========================================================
   cfop-print.js — 公式打印页生成器（A4 自定义打印）

   用途：线下老师按需挑公式、挑公式版本、排成 A4 打印（或导出 PDF）。

   能力：
     · 勾选要打印的案例（可按分类批量勾选 / 反选 / 清空）
     · 每个案例单独选「用哪条公式」，或选「留空（手写）」——留空格会画一条
       书写横线，适合课堂默写、让学生自己填
     · 列数 × 行数（1–8 列 / 1–12 行）+ 竖版 / 横版 A4，单元格字号与配图尺寸
       由行列自动换算（--pp-k），不会溢出也不会挤成一团
     · 标题、页眉（姓名/日期）、配图 / 编号 / 分类 / 公式 显示开关
     · 拖拽调整打印顺序，一键 window.print()

   依赖：js/cube-art.js（案例配图）、css/cfop-print.css、components.css 标准组件
   入口：window.CFOPPrint.open({ set, name, title, groupLabel, cases })
         cases: [{ id, sub, facelets, fl, art, algs:[string], cur:number }]
         配图优先级：facelets（顶面平面图）> fl（等轴立体图）> art（整段 SVG）

   选择结果按 set 分别持久化：localStorage['cfop-print-v1:<set>']
   ========================================================= */
window.CFOPPrint = (function () {
  "use strict";

  /* 预设版式：cols × rows = 每页格数 */
  var PRESETS = [
    { id: 'xl',    label: '大图 · 2×3 = 6/页',    cols: 2, rows: 3 },
    { id: 'lg',    label: '宽松 · 3×4 = 12/页',   cols: 3, rows: 4 },
    { id: 'std',   label: '标准 · 4×6 = 24/页',   cols: 4, rows: 6 },
    { id: 'sm',    label: '密集 · 5×8 = 40/页',   cols: 5, rows: 8 },
    { id: 'xs',    label: '超密 · 6×9 = 54/页',   cols: 6, rows: 9 },
    { id: 'w4',    label: '横版 · 4×4 = 16/页',   cols: 4, rows: 4, landscape: true },
    { id: 'w6',    label: '横版 · 6×4 = 24/页',   cols: 6, rows: 4, landscape: true }
  ];

  var DEFAULTS = {
    title: '',
    preset: 'std',
    cols: 4, rows: 6, landscape: false,
    showArt: true, showName: true, showSub: true, showAlg: true, showHead: true,
    zoom: 'fit',
    sel: {},        // { id: { on:bool, alg:int } }  alg = -1 表示留空
    order: []
  };

  var ctx = null;             // { set, name, groupLabel, cases }
  var cfg = null;
  var cases = [];             // 当前排序后的案例副本
  var modal = null, printStyle = null, ui = null;
  var listEl, pagesEl, stageEl, countEl;

  /* ---------- 小工具 ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function key() { return 'cfop-print-v1:' + (ctx ? ctx.set : 'x'); }
  function pick(id) {
    if (!cfg.sel[id]) { cfg.sel[id] = { on: true, alg: 0 }; }
    return cfg.sel[id];
  }
  function algsOf(c) { return c.algs || []; }
  /* 该案例打印用的公式序号：-1 = 留空 */
  function algIdx(c) {
    var i = pick(c.id).alg;
    var n = algsOf(c).length;
    if (i === -1) { return -1; }
    return Math.max(0, Math.min(i, Math.max(0, n - 1)));
  }
  function subs() {
    var seen = {}, out = [];
    cases.forEach(function (c) {
      if (c.sub && !seen[c.sub]) { seen[c.sub] = 1; out.push(c.sub); }
    });
    return out;
  }
  function chosen() { return cases.filter(function (c) { return pick(c.id).on; }); }

  /* 配图：顶面平面图 → 等轴立体图 → 预渲染 SVG */
  function artNode(c) {
    if (!window.CubeArt) { return null; }
    if (c.facelets && window.CubeArt.flatCase) {
      var a = window.CubeArt.flatCase(c.facelets);
      if (a) { return a; }
    }
    if (c.fl && window.CubeArt.isoCube) {
      var b = window.CubeArt.isoCube(c.fl);
      if (b) { return b; }
    }
    if (c.art && window.CubeArt.rawArt) {
      return window.CubeArt.rawArt(c.art);
    }
    return null;
  }

  /* ---------- 持久化 ---------- */
  function save() {
    try { localStorage.setItem(key(), JSON.stringify(cfg)); } catch (e) {}
  }
  function load() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (e) { c = null; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (c && c[k] !== undefined) ? c[k] : DEFAULTS[k];
    });
    if (!out.title) { out.title = (ctx ? ctx.name : '') + ' 公式表'; }
    if (!out.sel || typeof out.sel !== 'object') { out.sel = {}; }
    if (!Array.isArray(out.order)) { out.order = []; }
    /* 用当前数据补齐默认选中（新案例默认选中，取数据里的默认公式） */
    cases.forEach(function (cs) {
      var s = out.sel[cs.id];
      if (!s || typeof s !== 'object') {
        out.sel[cs.id] = { on: true, alg: (cs.cur || 0) };
      } else {
        s.on = s.on !== false;
        var v = parseInt(s.alg, 10);
        if (isNaN(v)) { v = (cs.cur || 0); }
        s.alg = Math.max(-1, Math.min(v, Math.max(0, algsOf(cs).length - 1)));
      }
    });
    return out;
  }

  /* ---------- 弹窗骨架 ---------- */
  function buildModal() {
    modal = el('div', 'pp-modal pp-root');
    modal.hidden = true;
    modal.innerHTML =
      '<div class="pp-panel" role="dialog" aria-modal="true" aria-label="公式打印页生成器">' +
        '<div class="pp-head">' +
          '<span class="pp-head__title" id="pp-title">公式打印页生成器</span>' +
          '<span class="pp-head__hint">勾选要打印的公式 · 每条可选公式或留空手写 · 自动排版 A4</span>' +
          '<span class="pp-head__actions">' +
            '<button type="button" class="btn btn--sm" data-act="reset">恢复默认</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="close">关闭</button>' +
          '</span>' +
        '</div>' +
        '<div class="pp-body">' +
          '<aside class="pp-side">' +
            '<div class="pp-side__bar" id="pp-quick"></div>' +
            '<div class="pp-list" id="pp-list"></div>' +
          '</aside>' +
          '<section class="pp-main">' +
            '<div class="pp-opts" id="pp-opts"></div>' +
            '<div class="pp-stage" id="pp-stage"><div class="pp-pages" id="pp-pages"></div></div>' +
          '</section>' +
        '</div>' +
        '<div class="pp-foot">' +
          '<span class="pp-foot__count" id="pp-count"></span>' +
          '<span class="pp-foot__actions">' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="close">取消</button>' +
            '<button type="button" class="btn btn--sm btn--primary" data-act="print">🖨 打印 / 导出 PDF</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    listEl = modal.querySelector('#pp-list');
    pagesEl = modal.querySelector('#pp-pages');
    stageEl = modal.querySelector('#pp-stage');
    countEl = modal.querySelector('#pp-count');

    modal.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'close') { close(); }
        else if (a === 'print') { doPrint(); }
        else if (a === 'reset') { reset(); }
        return;
      }
      if (e.target === modal) { close(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && !modal.hidden) { close(); }
    });
    window.addEventListener('resize', function () {
      if (modal && !modal.hidden) { applyZoom(); }
    });
  }

  /* ---------- 快捷选择条 ---------- */
  function buildQuick() {
    var box = modal.querySelector('#pp-quick');
    box.innerHTML = '';
    function add(label, title, fn) {
      var b = el('button', 'seg__btn', esc(label));
      b.type = 'button';
      if (title) { b.title = title; }
      b.addEventListener('click', function () { fn(); refresh(); });
      box.appendChild(b);
    }
    add('全选', '勾选全部公式', function () {
      cases.forEach(function (c) { pick(c.id).on = true; });
    });
    add('清空', '全部不勾选', function () {
      cases.forEach(function (c) { pick(c.id).on = false; });
    });
    add('反选', '已勾选 ↔ 未勾选', function () {
      cases.forEach(function (c) { var s = pick(c.id); s.on = !s.on; });
    });
    add('全留空', '所有公式位留空，供学生手写', function () {
      cases.forEach(function (c) { pick(c.id).alg = -1; });
    });
    add('全填公式', '所有公式位恢复成公式', function () {
      cases.forEach(function (c) { var s = pick(c.id); if (s.alg === -1) { s.alg = (c.cur || 0); } });
    });
    subs().forEach(function (s) {
      var n = cases.filter(function (c) { return c.sub === s; }).length;
      add(s + ' ' + n, '整组勾选 / 取消', function () {
        var group = cases.filter(function (c) { return c.sub === s; });
        var allOn = group.every(function (c) { return pick(c.id).on; });
        group.forEach(function (c) { pick(c.id).on = !allOn; });
      });
    });
  }

  /* ---------- 左栏：案例列表（勾选 + 公式下拉 + 拖拽排序） ---------- */
  function applyOrder() {
    cfg.order = cases.map(function (c) { return c.id; });
    save();
  }

  function moveCase(fromId, toId, after) {
    if (fromId === toId) { return; }
    var f = -1, t = -1;
    cases.forEach(function (c, i) { if (c.id === fromId) { f = i; } if (c.id === toId) { t = i; } });
    if (f < 0 || t < 0) { return; }
    var item = cases.splice(f, 1)[0];
    var to = t;
    if (f < to) { to--; }
    if (after) { to++; }
    cases.splice(Math.min(to, cases.length), 0, item);
    applyOrder();
    buildList();
    refresh();
  }

  function buildList() {
    listEl.innerHTML = '';
    var draggingId = null;
    cases.forEach(function (c) {
      var s = pick(c.id);
      var item = el('div', 'pp-item');
      item.draggable = true;
      item.dataset.id = c.id;
      item.title = '按住拖拽可调整打印顺序';

      item.addEventListener('dragstart', function (e) {
        draggingId = c.id;
        item.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', c.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('is-dragging');
        Array.prototype.forEach.call(listEl.children, function (child) {
          child.classList.remove('is-over');
        });
        draggingId = null;
      });
      item.addEventListener('dragover', function (e) {
        if (!draggingId || draggingId === c.id) { return; }
        e.preventDefault();
        item.classList.add('is-over');
      });
      item.addEventListener('dragleave', function () { item.classList.remove('is-over'); });
      item.addEventListener('drop', function (e) {
        if (!draggingId || draggingId === c.id) { return; }
        e.preventDefault();
        moveCase(draggingId, c.id, true);
      });

      var chk = el('label', 'pp-item__check');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = s.on;
      box.setAttribute('aria-label', '打印 ' + c.id);
      box.setAttribute('draggable', 'false');
      box.addEventListener('change', function () { s.on = box.checked; refresh(); });
      chk.appendChild(box);
      item.appendChild(chk);

      var artBox = el('div', 'pp-item__art');
      var svg = artNode(c);
      if (svg) { artBox.appendChild(svg); }
      item.appendChild(artBox);

      var main = el('div', 'pp-item__main');
      var row = el('div', 'pp-item__row');
      row.appendChild(el('span', 'pp-item__name', esc(c.id)));
      if (c.sub) { row.appendChild(el('span', 'badge badge--mono', esc(c.sub))); }
      main.appendChild(row);

      var list = algsOf(c);
      var sel = el('select', 'select pp-item__sel');
      sel.setAttribute('aria-label', c.id + ' 选用公式');
      sel.setAttribute('draggable', 'false');
      var oBlank = document.createElement('option');
      oBlank.value = '-1';
      oBlank.textContent = '— 留空（手写）—';
      sel.appendChild(oBlank);
      list.forEach(function (a, i) {
        var o = document.createElement('option');
        o.value = String(i);
        o.textContent = (i + 1) + '. ' + a;
        sel.appendChild(o);
      });
      sel.value = String(algIdx(c));
      sel.title = list.join('\n');
      sel.addEventListener('change', function () {
        s.alg = parseInt(sel.value, 10);
        if (isNaN(s.alg)) { s.alg = 0; }
        refresh();
      });
      main.appendChild(sel);

      item.appendChild(main);
      if (!s.on || s.alg === -1) { item.classList.add('is-off'); }
      listEl.appendChild(item);
    });
  }

  /* ---------- 排版选项 ---------- */
  function numSelect(min, max) {
    var s = el('select', 'select');
    for (var i = min; i <= max; i++) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = String(i);
      s.appendChild(o);
    }
    return s;
  }
  function optWrap(label) {
    var w = el('div', 'pp-opt');
    if (label) { w.appendChild(el('span', 'pp-opt__label', esc(label))); }
    return w;
  }
  function check(label, k) {
    var l = el('label', 'pp-check');
    var i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = !!cfg[k];
    i.addEventListener('change', function () { cfg[k] = i.checked; save(); renderPreview(); });
    l.appendChild(i);
    l.appendChild(document.createTextNode(label));
    return { node: l, input: i };
  }

  function buildOpts() {
    var box = modal.querySelector('#pp-opts');
    box.innerHTML = '';
    ui = {};

    var o1 = optWrap('版式');
    ui.preset = el('select', 'select');
    PRESETS.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id; o.textContent = p.label;
      ui.preset.appendChild(o);
    });
    var oCustom = document.createElement('option');
    oCustom.value = 'custom'; oCustom.textContent = '自定义';
    ui.preset.appendChild(oCustom);
    ui.preset.addEventListener('change', applyPreset);
    o1.appendChild(ui.preset);
    box.appendChild(o1);

    var o2 = optWrap('列 × 行');
    o2.classList.add('pp-opt--num');
    ui.cols = numSelect(1, 8);
    ui.rows = numSelect(1, 12);
    ui.cols.addEventListener('change', custom);
    ui.rows.addEventListener('change', custom);
    o2.appendChild(ui.cols);
    o2.appendChild(el('span', 'pp-opt__label', '×'));
    o2.appendChild(ui.rows);
    box.appendChild(o2);

    var o3 = optWrap('方向');
    ui.dir = el('select', 'select');
    [['portrait', '竖版 A4'], ['landscape', '横版 A4']].forEach(function (p) {
      var o = document.createElement('option');
      o.value = p[0]; o.textContent = p[1];
      ui.dir.appendChild(o);
    });
    ui.dir.addEventListener('change', custom);
    o3.appendChild(ui.dir);
    box.appendChild(o3);

    var o4 = optWrap('缩放');
    ui.zoom = el('select', 'select');
    [['fit', '整页适应'], ['1', '100%'], ['0.75', '75%'], ['0.5', '50%']].forEach(function (p) {
      var o = document.createElement('option');
      o.value = p[0]; o.textContent = p[1];
      ui.zoom.appendChild(o);
    });
    ui.zoom.addEventListener('change', function () {
      cfg.zoom = ui.zoom.value; save(); applyZoom();
    });
    o4.appendChild(ui.zoom);
    box.appendChild(o4);

    var o5 = optWrap('标题');
    o5.classList.add('pp-opt--title');
    ui.title = el('input', 'input');
    ui.title.type = 'text';
    ui.title.setAttribute('aria-label', '纸张标题');
    ui.title.addEventListener('input', function () {
      cfg.title = ui.title.value; save(); renderPreview();
    });
    o5.appendChild(ui.title);
    box.appendChild(o5);

    var o6 = el('div', 'pp-checks');
    var cArt = check('配图', 'showArt');
    var cName = check('编号', 'showName');
    var cSub = check('分类', 'showSub');
    var cAlg = check('公式', 'showAlg');
    var cHead = check('页眉', 'showHead');
    ui.checkArt = cArt.input; ui.checkName = cName.input;
    ui.checkSub = cSub.input; ui.checkAlg = cAlg.input; ui.checkHead = cHead.input;
    [cArt.node, cName.node, cSub.node, cAlg.node, cHead.node].forEach(function (n) {
      o6.appendChild(n);
    });
    box.appendChild(o6);
  }

  function applyPreset() {
    if (ui.preset.value === 'custom') { return; }
    var p = null;
    PRESETS.forEach(function (x) { if (x.id === ui.preset.value) { p = x; } });
    if (!p) { return; }
    cfg.preset = p.id;
    cfg.cols = p.cols; cfg.rows = p.rows;
    cfg.landscape = !!p.landscape;
    syncOpts(); save(); renderPreview();
  }
  function custom() {
    cfg.cols = parseInt(ui.cols.value, 10) || 1;
    cfg.rows = parseInt(ui.rows.value, 10) || 1;
    cfg.landscape = ui.dir.value === 'landscape';
    cfg.preset = 'custom';
    ui.preset.value = 'custom';
    save(); renderPreview();
  }
  function syncOpts() {
    if (!ui) { return; }
    ui.cols.value = String(cfg.cols);
    ui.rows.value = String(cfg.rows);
    ui.dir.value = cfg.landscape ? 'landscape' : 'portrait';
    ui.zoom.value = cfg.zoom;
    ui.title.value = cfg.title || '';
    ui.checkArt.checked = !!cfg.showArt;
    ui.checkName.checked = !!cfg.showName;
    ui.checkSub.checked = !!cfg.showSub;
    ui.checkAlg.checked = !!cfg.showAlg;
    ui.checkHead.checked = !!cfg.showHead;
    ui.preset.value = cfg.preset;
  }

  /* ---------- 刷新 ---------- */
  function refresh() {
    Array.prototype.forEach.call(listEl.children, function (item, i) {
      var c = cases[i];
      if (!c) { return; }
      var s = pick(c.id);
      item.classList.toggle('is-off', !s.on || s.alg === -1);
    });
    save();
    renderPreview();
  }

  /* ---------- 单元格缩放系数 ----------
     基准：一个 44mm 见方、3×7 版式下的单元格 = 1.0。
     行列变多 → k 变小（字和配图一起缩）；行列变少 → k 变大（放大占满纸面）。
     上下限 0.36 / 2.0 防止极端行列下字看不清或大到溢出。 */
  function pageScale() {
    var isLand = !!cfg.landscape;
    var pw = isLand ? 297 : 210, ph = isLand ? 210 : 297;
    var padX = 22;                                  /* 左右各 11mm */
    var padY = isLand ? (9 + 8) : (12 + 9);         /* 上下内边距 */
    var headH = cfg.showHead ? 16 : 0;              /* 页眉占高（mm） */
    var gap = 2.5;
    var cw = (pw - padX) / cfg.cols - gap;
    var ch = (ph - padY - headH) / cfg.rows - gap;
    var unit = Math.min(cw, ch * 1.12);
    return Math.max(0.36, Math.min(2, unit / 44));
  }

  /* ---------- A4 排版 ---------- */
  function buildPage(chunk, idx, total, n, k) {
    var page = el('div', 'pp-page');
    page.style.setProperty('--pp-k', String(Math.round(k * 1000) / 1000));

    if (cfg.showHead) {
      var head = el('div', 'pp-page__head');
      head.appendChild(el('div', 'pp-page__title', esc(cfg.title || '公式表')));
      head.appendChild(el('div', 'pp-page__meta',
        '共 <b>' + n + '</b> 例 · 第 <b>' + idx + ' / ' + total + '</b> 页' +
        '<br>姓名 ____________　日期 ____________'));
      page.appendChild(head);
    }

    var grid = el('div', 'pp-grid');
    grid.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', minmax(0,1fr))';
    grid.style.gridTemplateRows = 'repeat(' + cfg.rows + ', minmax(0,1fr))';

    chunk.forEach(function (c) {
      var cell = el('div', 'pp-cell');
      if (!cfg.showArt) { cell.classList.add('pp-cell--noart'); }
      if (!cfg.showName) { cell.classList.add('pp-cell--noname'); }
      if (!cfg.showSub) { cell.classList.add('pp-cell--nosub'); }
      if (!cfg.showAlg) { cell.classList.add('pp-cell--noalg'); }

      if (cfg.showArt) {
        var a = el('div', 'pp-cell__art');
        var svg = artNode(c);
        if (svg) { a.appendChild(svg); }
        cell.appendChild(a);
      }
      if (cfg.showName) { cell.appendChild(el('div', 'pp-cell__name', esc(c.id))); }
      if (cfg.showSub && c.sub) { cell.appendChild(el('div', 'pp-cell__sub', esc(c.sub))); }
      if (cfg.showAlg) {
        var i = algIdx(c);
        if (i < 0) {
          cell.appendChild(el('div', 'pp-cell__alg pp-cell__alg--blank'));
        } else {
          cell.appendChild(el('div', 'pp-cell__alg', esc(algsOf(c)[i] || '')));
        }
      }
      grid.appendChild(cell);
    });

    page.appendChild(grid);
    return page;
  }

  function renderPreview() {
    var list = chosen();
    var per = Math.max(1, cfg.cols * cfg.rows);
    var pages = [];
    for (var i = 0; i < list.length; i += per) { pages.push(list.slice(i, i + per)); }
    if (!pages.length) { pages.push([]); }

    var k = pageScale();
    pagesEl.className = 'pp-pages' + (cfg.landscape ? ' pp-land' : '');
    pagesEl.innerHTML = '';
    var total = pages.length, n = list.length;
    pages.forEach(function (chunk, pi) {
      pagesEl.appendChild(buildPage(chunk, pi + 1, total, n, k));
    });
    if (countEl) {
      var blank = list.filter(function (c) { return algIdx(c) < 0; }).length;
      countEl.textContent = '已选 ' + n + ' / ' + cases.length + ' 例' +
        (blank ? '（留空 ' + blank + ' 条）' : '') +
        ' · 每页 ' + per + ' 格 · 共 ' + total + ' 页';
    }
    applyZoom();
  }

  function applyZoom() {
    if (!pagesEl || !stageEl || !cfg) { return; }
    var z;
    if (cfg.zoom === 'fit') {
      var pageW = cfg.landscape ? 1123 : 794;   /* A4 @96dpi */
      var pageH = cfg.landscape ? 794 : 1123;
      var zw = (stageEl.clientWidth - 34) / pageW;
      var zh = (stageEl.clientHeight - 34) / pageH;
      z = Math.max(0.2, Math.min(1, Math.min(zw, zh)));
    } else {
      z = parseFloat(cfg.zoom) || 1;
    }
    pagesEl.style.zoom = z;
  }

  /* ---------- 打印 ---------- */
  function doPrint() {
    save();
    if (!printStyle) {
      printStyle = document.createElement('style');
      printStyle.id = 'pp-print-style';
      document.head.appendChild(printStyle);
    }
    printStyle.textContent = '@page{ size: A4 ' +
      (cfg.landscape ? 'landscape' : 'portrait') + '; margin: 0; }';
    window.print();
  }

  /* ---------- 开关 / 重置 ---------- */
  function reset() {
    var keepTitle = cfg.title;
    cfg = JSON.parse(JSON.stringify(DEFAULTS));
    cfg.title = keepTitle;
    cases.forEach(function (c) { cfg.sel[c.id] = { on: true, alg: (c.cur || 0) }; });
    buildList(); buildQuick(); syncOpts(); refresh();
  }
  function sortCasesByOrder() {
    if (!cfg.order || !cfg.order.length) { return; }
    var idx = {};
    cfg.order.forEach(function (id, i) { idx[id] = i; });
    cases.sort(function (a, b) {
      var ai = idx[a.id], bi = idx[b.id];
      if (ai === undefined) { ai = 9999; }
      if (bi === undefined) { bi = 9999; }
      return ai - bi;
    });
  }

  function open(opt) {
    ctx = opt || {};
    /* 深拷贝一份，排序不影响训练器里的原始数组 */
    cases = (ctx.cases || []).map(function (c) {
      return {
        id: c.id, sub: c.sub || '', facelets: c.facelets, fl: c.fl, art: c.art,
        algs: (c.algs || []).slice(), cur: c.cur || 0
      };
    });
    if (!cases.length) { return; }
    cfg = load();
    sortCasesByOrder();
    if (!modal) { buildModal(); }
    if (!ui) { buildOpts(); }
    var t = modal.querySelector('#pp-title');
    if (t) { t.textContent = (ctx.name || '公式') + ' 打印页生成器'; }
    buildList();
    buildQuick();
    syncOpts();
    refresh();
    modal.hidden = false;
    document.body.classList.add('pp-open');
    applyZoom();
  }
  function close() {
    if (modal) { modal.hidden = true; }
    document.body.classList.remove('pp-open');
    save();
  }

  return { open: open, close: close };
})();
