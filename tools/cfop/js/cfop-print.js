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
    sel: {},        // { id: { on:bool, alg:int, rot:0..3 } }  alg = -1 表示留空
    order: []
  };

  var ctx = null;             // { set, name, groupLabel, cases, helpers }
  var cfg = null;
  var cases = [];             // 当前排序后的案例副本
  var helpers = null;         // { rotateFacelets, algForRot } —— 由训练器注入，避免重复实现
  var modal = null, printStyle = null, ui = null;
  var listEl, pagesEl, stageEl, countEl;
  var MM = 96 / 25.4;         // 1mm = 3.7795 CSS px

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
    if (!cfg.sel[id]) { cfg.sel[id] = { on: true, alg: 0, rot: 0, text: '' }; }
    var s = cfg.sel[id];
    if (s.rot == null) { s.rot = 0; }
    if (typeof s.text !== 'string') { s.text = ''; }
    return s;
  }
  function algsOf(c) { return c.algs || []; }
  /* 该案例打印用的公式序号：-1 = 留空 */
  function algIdx(c) {
    var i = pick(c.id).alg;
    var n = algsOf(c).length;
    if (i === -1) { return -1; }
    return Math.max(0, Math.min(i, Math.max(0, n - 1)));
  }
  function rotOf(c) { return ((pick(c.id).rot || 0) % 4 + 4) % 4; }
  function textOf(c) { return pick(c.id).text || ''; }
  function subs() {
    var seen = {}, out = [];
    cases.forEach(function (c) {
      if (c.sub && !seen[c.sub]) { seen[c.sub] = 1; out.push(c.sub); }
    });
    return out;
  }
  function chosen() { return cases.filter(function (c) { return pick(c.id).on; }); }

  /* 配图：顶面平面图 → 等轴立体图 → 预渲染 SVG。
     rot = 图案顺时针旋转量 0..3，走训练器注入的 rotateFacelets，
     保证与练习浮层里「转了 90°」看到的是同一张图。 */
  function artNode(c, rot) {
    if (!window.CubeArt) { return null; }
    var k = ((rot || 0) % 4 + 4) % 4;
    if (c.facelets && window.CubeArt.flatCase) {
      var fl = c.facelets;
      if (k && helpers && helpers.rotateFacelets) {
        fl = helpers.rotateFacelets(fl, k);
      }
      var a = window.CubeArt.flatCase(fl);
      if (a) { return a; }
    }
    /* 立体图（F2L 系）与预渲染 SVG（SQ1 / 五魔方）没有旋转概念，忽略 k */
    if (c.fl && window.CubeArt.isoCube) {
      var b = window.CubeArt.isoCube(c.fl);
      if (b) { return b; }
    }
    if (c.art && window.CubeArt.rawArt) {
      return window.CubeArt.rawArt(c.art);
    }
    return null;
  }

  /* 该格的文字内容。三种形态：
       alg  — 库里的公式（含旋转后的 AUF 前缀）
       text — 留空但老师自己填了文字（v2.0.71）
       line — 留空且没填文字 → 画一条手写书写线
     ⚠️ 图转了公式必须跟着转，否则学生照着纸做会做错 —— 公式分支复用训练器的
     algForRot，与练习浮层的 AUF 规则同源。 */
  function algTextFor(c) {
    var i = algIdx(c);
    if (i < 0) { return null; }
    var txt = algsOf(c)[i] || '';
    var k = rotOf(c);
    if (!k) { return txt; }
    if (helpers && helpers.algForRot) {
      var baseK = (c.algK && c.algK[i]) || 0;
      var isCustom = !!(c.algCustom && c.algCustom[i]);
      var p = helpers.algForRot(txt, baseK, k, isCustom);
      return (p.pre || '') + p.text;
    }
    return txt;
  }
  function cellContentFor(c) {
    var t = algTextFor(c);
    if (t != null) { return { kind: 'alg', text: t }; }
    var own = textOf(c);
    if (own.trim()) { return { kind: 'text', text: own }; }
    return { kind: 'line', text: '' };
  }
  /* 统计有多少格用了自定义文字（决定要不要为文字缩小字号） */
  function customTextCount() {
    return cases.filter(function (c) {
      return pick(c.id).on && algIdx(c) < 0 && textOf(c).trim();
    }).length;
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
        out.sel[cs.id] = { on: true, alg: (cs.cur || 0), rot: 0, text: '' };
      } else {
        s.on = s.on !== false;
        var v = parseInt(s.alg, 10);
        if (isNaN(v)) { v = (cs.cur || 0); }
        s.alg = Math.max(-1, Math.min(v, Math.max(0, algsOf(cs).length - 1)));
        /* rot / text 是后续版本新增字段，旧配置没有 → 补默认值 */
        var r = parseInt(s.rot, 10);
        s.rot = isNaN(r) ? 0 : (((r % 4) + 4) % 4);
        if (typeof s.text !== 'string') { s.text = ''; }
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
          '<span class="pp-head__hint">勾选要打印的公式 · 下拉选「留空」就能填文字 · 自动排版 A4</span>' +
          '<span class="pp-head__actions">' +
            '<button type="button" class="btn btn--sm" data-act="reset">恢复默认</button>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-act="close">关闭</button>' +
          '</span>' +
        '</div>' +
        '<div class="pp-body">' +
          '<aside class="pp-side">' +
            '<div class="pp-side__bar" id="pp-quick"></div>' +
            '<div class="pp-side__groups" id="pp-groups"></div>' +
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
    /* Esc 关闭。⚠️ 但输入框里按 Esc 不能直接关整个面板：
       中文输入法取消候选词、用户想退出输入，都会顺手按 Esc —— 一按就把
       面板关了，体验上等同于「字打不进去、白写了」。所以：
       ① 正在输入法组合（isComposing）→ 完全忽略，交给输入法；
       ② 焦点在输入框 / 下拉里 → 只退出焦点（blur），不关面板；
       ③ 再按一次（焦点已不在表单里）才真正关闭。 */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !modal || modal.hidden) { return; }
      if (e.isComposing) { return; }
      var t = e.target;
      var inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                          t.tagName === 'SELECT' || t.isContentEditable);
      if (inField) {
        e.stopPropagation();
        t.blur();
        return;
      }
      close();
    });
    window.addEventListener('resize', function () {
      if (modal && !modal.hidden) { applyZoom(); }
    });
  }

  /* ---------- 快捷选择条 ---------- */
  function buildQuick() {
    var box = modal.querySelector('#pp-quick');
    var groups = modal.querySelector('#pp-groups');
    box.innerHTML = '';
    if (groups) { groups.innerHTML = ''; }
    /* 操作按钮与「分类」按钮分成两栏：手机上分类按钮有十几个，全挤在一个
       换行容器里会把下面的列表压到只剩 36px（实测 390×844 快捷条占 301px，
       列表仅 36px），用户根本看不到条目和文字框。分开后分类栏在窄屏横向
       滚动、只占一行。 */
    function make(label, title, fn, into) {
      var b = el('button', 'seg__btn', esc(label));
      b.type = 'button';
      if (title) { b.title = title; }
      b.addEventListener('click', function () { fn(); refresh(); });
      into.appendChild(b);
    }
    function add(label, title, fn) { make(label, title, fn, box); }
    function addGroup(label, title, fn) { make(label, title, fn, groups || box); }
    add('全选', '勾选全部公式', function () {
      cases.forEach(function (c) { pick(c.id).on = true; });
    });
    add('清空', '全部不勾选', function () {
      cases.forEach(function (c) { pick(c.id).on = false; });
    });
    add('反选', '已勾选 ↔ 未勾选', function () {
      cases.forEach(function (c) { var s = pick(c.id); s.on = !s.on; });
    });
    add('全留空', '所有公式位留空，供学生手写；已填的文字会保留', function () {
      cases.forEach(function (c) { pick(c.id).alg = -1; });
      buildList();          /* 文字输入框要跟着露出来 */
    });
    add('全填公式', '所有公式位恢复成公式（已填的文字保留，切回留空时还在）', function () {
      cases.forEach(function (c) { var s = pick(c.id); if (s.alg === -1) { s.alg = (c.cur || 0); } });
      buildList();          /* 文字输入框要跟着收起 */
    });
    /* 批量旋转：只作用于「能旋转的图案」，立体图 / 预渲染图不受影响 */
    var canRotAny = cases.some(function (c) { return c.facelets && helpers && helpers.rotateFacelets; });
    if (canRotAny) {
      add('全部转90°', '把所有图案统一顺时针转 90°（公式同步补 AUF）', function () {
        cases.forEach(function (c) {
          if (c.facelets && helpers && helpers.rotateFacelets) {
            var s = pick(c.id); s.rot = ((s.rot || 0) + 1) % 4;
          }
        });
        buildList();          /* 重建列表：按钮角度与缩略图一起刷新 */
      });
      add('全部归零', '把所有图案朝向恢复成 0°', function () {
        cases.forEach(function (c) { pick(c.id).rot = 0; });
        buildList();
      });
    }
    subs().forEach(function (s) {
      var n = cases.filter(function (c) { return c.sub === s; }).length;
      addGroup(s + ' ' + n, '整组勾选 / 取消', function () {
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
      var svg = artNode(c, rotOf(c));
      if (svg) { artBox.appendChild(svg); }
      item.appendChild(artBox);

      var main = el('div', 'pp-item__main');
      var row = el('div', 'pp-item__row');
      row.appendChild(el('span', 'pp-item__name', esc(c.id)));
      if (c.sub) { row.appendChild(el('span', 'badge badge--mono', esc(c.sub))); }

      /* 旋转按钮：图与公式一起转，点击顺时针 +90°、Shift + 点击逆时针。
         只有能旋转的图案（有 facelets 且训练器注入了 rotateFacelets）才出这个按钮。 */
      var canRot = !!(c.facelets && helpers && helpers.rotateFacelets);
      var rotBtn = null;
      if (canRot) {
        rotBtn = el('button', 'pp-rot');
        rotBtn.type = 'button';
        rotBtn.setAttribute('draggable', 'false');
        rotBtn.setAttribute('aria-label', c.id + ' 图案朝向');
        rotBtn.title = '图案朝向：点击顺时针转 90°（Shift 点击逆时针）\n公式会同步补 AUF 前缀，保证图与公式对应';
        rotBtn.textContent = (rotOf(c) * 90) + '°';
        if (rotOf(c)) { rotBtn.classList.add('is-on'); }
        rotBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var step = e.shiftKey ? 3 : 1;
          s.rot = ((rotOf(c) + step) % 4 + 4) % 4;
          rotBtn.textContent = (s.rot * 90) + '°';
          rotBtn.classList.toggle('is-on', !!s.rot);
          /* 左侧缩略图也跟着转，避免「按钮显示 90° 但小图没动」 */
          var thumb = item.querySelector('.pp-item__art');
          if (thumb) {
            thumb.innerHTML = '';
            var ns = artNode(c, s.rot);
            if (ns) { thumb.appendChild(ns); }
          }
          save(); renderPreview();
        });
        row.appendChild(rotBtn);
      }
      main.appendChild(row);

      var list = algsOf(c);
      var sel = el('select', 'select pp-item__sel');
      sel.setAttribute('aria-label', c.id + ' 选用公式');
      sel.setAttribute('draggable', 'false');
      var oBlank = document.createElement('option');
      oBlank.value = '-1';
      oBlank.textContent = '— 留空（手写 / 填文字）—';
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
        /* 切到「留空」时把文字框露出来，切回公式就收起（保留已输入的文字） */
        if (ta) { ta.hidden = s.alg !== -1; }
        refresh();
        /* 刚切到「留空」→ 直接把光标放进输入框并滚到可见。
           不加这一步，用户切了留空也常以为「没有地方能写字」（框在可视区外）。 */
        if (s.alg === -1 && ta) {
          requestAnimationFrame(function () {
            try {
              ta.focus();
              revealInList(ta);
            } catch (e) {}
          });
        }
      });
      main.appendChild(sel);

      /* 留空可写文字（v2.0.71）：只在选「留空」时出现。
         不填 → 打印成手写横线；填了 → 打印这段文字。
         输入时只刷对应格子（不重建列表），否则输入框会失焦。 */
      var ta = el('textarea', 'pp-item__text');
      ta.rows = 2;
      ta.spellcheck = false;
      ta.setAttribute('aria-label', c.id + ' 留空文字');
      ta.setAttribute('draggable', 'false');
      ta.placeholder = '留空可写文字，不填就画手写线';
      ta.value = textOf(c);
      ta.hidden = s.alg !== -1;
      /* 父行是 draggable 的：不关掉的话在输入框里拖选文字会拖走整行 */
      ta.addEventListener('mousedown', function () { item.draggable = false; });
      ta.addEventListener('focus', function () { item.draggable = false; });
      ta.addEventListener('blur', function () {
        item.draggable = true;
        save();
      });
      ta.addEventListener('dragstart', function (e) { e.preventDefault(); });
      ta.addEventListener('input', function () {
        s.text = ta.value;
        updateCellContent(c.id);
        save();
        refreshCount();
      });
      main.appendChild(ta);

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
     基准：一个 44mm 见方的格子 = 1.0（4×6 标准版式）。
     行列变多 → k 变小（字和配图一起缩）；行列变少 → k 变大（放大占满纸面）。
     上限收到 1.5：k=2 时编号字号到 21pt，文字会吃掉一半格高、把图挤小，
     与「大图版式」的目的相反。下限 0.36 防止超密版式下字看不清。 */
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
    return Math.max(0.36, Math.min(1.5, unit / 44));
  }

  /* ---------- 版面几何（mm → px） ----------
     一页的可用绘图区：页高减去上下内边距与页眉。
     这里的数字必须与 cfop-print.css 的 .pp-page padding / .pp-page__head 保持一致，
     否则算出来的基准行高与实际渲染不符。 */
  function pageBox() {
    var isLand = !!cfg.landscape;
    var pwMm = isLand ? 297 : 210;
    /* ⚠️ 页高必须用「打印时的实际高度」而不是 297/210：
       print 媒体下 .pp-page 被收紧到 295mm / 208mm（各留 2mm，否则满页时
       最后一行边框落在页底、被判溢出、多出一张空白纸）。
       行高现在是由 JS 写死的 px，不会像 1fr 那样自动收缩，
       所以分页必须按 295mm 来算，否则满页会挤到第二页去。 */
    var phMm = isLand ? 208 : 295;
    var padXMm = 22;                                   /* 左右各 11mm */
    var padYMm = isLand ? (9 + 8) : (12 + 9);          /* 上下内边距 */
    var headMm = cfg.showHead ? 16 : 0;                /* 页眉 + 分隔线占高 */
    var gapMm = 2.5;
    var w = (pwMm - padXMm) * MM;                      /* 内容区宽（px） */
    var h = (phMm - padYMm - headMm) * MM;             /* 内容区高（px） */
    var gap = gapMm * MM;
    return {
      w: w, h: h, gap: gap,
      colW: (w - gap * (cfg.cols - 1)) / cfg.cols,     /* 单列宽 */
      baseRow: (h - gap * Math.max(0, cfg.rows - 1)) / Math.max(1, cfg.rows)
    };
  }

  /* ---------- 统一测量：单格自然高度 ----------
     ⚠️ 为什么不用 grid 的 `grid-auto-rows: minmax(x, auto)` 让浏览器自己撑：
     实测该写法在这个结构下不会撑（std 4×6 内容需要 190px，行高却停在 160px，
     文字溢出到相邻行）。所以改成 JS 显式测量 + 渲染时写死 grid-template-rows，
     行高完全可控。
     测量方式：探针容器宽度 = 单列宽，每格独占一行（不排网格），
     这样每格的 offsetHeight 就是它的真实内容高度。
     singleText=true 时把自定义文字按单字占位，用于「图尺寸不该被文字影响」的测量。 */
  function measureHeights(list, artPx, k, singleText) {
    var box = pageBox();
    var host = el('div', 'pp-probe');
    host.style.setProperty('--pp-k', String(Math.round(k * 1000) / 1000));
    host.style.setProperty('--pp-art', artPx + 'px');
    host.style.setProperty('--pp-row', '0px');
    host.style.width = box.colW + 'px';
    list.forEach(function (c) {
      var cell = buildCell(c);
      if (singleText) {
        var t = cell.querySelector('.pp-cell__alg--text');
        if (t) { t.textContent = '测'; }
      }
      host.appendChild(cell);
    });
    document.body.appendChild(host);
    var hs = [];
    Array.prototype.forEach.call(host.children, function (n) { hs.push(n.offsetHeight); });
    document.body.removeChild(host);
    return hs;
  }

  /* 文字区高度：art 传 0，量出来的就是「除图以外」的高度。
     自定义文字按单行计 —— 图的大小只由公式长度决定，用户填多少字都不缩图。
     ⚠️ 必须全量测量：早先只取前 24 条，漏掉了「公式占 2 行」的格子，
     导致基准行高容不下它、无文字时那一行也被撑高，横版 4×4 因此从 4 页变 5 页。 */
  var _tbCache = {};
  function textBlockH(k) {
    var key = [k, cfg.cols, cfg.rows, cfg.showArt ? 1 : 0, cfg.showName ? 1 : 0,
               cfg.showSub ? 1 : 0, cfg.showAlg ? 1 : 0].join('|');
    if (_tbCache[key] != null) { return _tbCache[key]; }

    var hs = measureHeights(cases, 0, k, true);
    var max = 0;
    hs.forEach(function (h) { if (h > max) { max = h; } });
    _tbCache[key] = max;
    return max;
  }

  /* ---------- 配图边长：只由版式与公式长度决定，与用户填多少字无关 ----------
     v2.0.73 的核心改动。旧版「溢出就缩字、缩字就挤图」，用户明确要求
     图不缩、改为撑高行。现在：
       边长 = min(列内宽, 基准行高 − 文字区高 − 2)
     文字再多也不改变这个值；多出来的文字高度由 .pp-grid 的
     grid-auto-rows: minmax(--pp-row, auto) 撑开，再靠分页顺延到下一页。 */
  function artSize() {
    if (!cfg.showArt) { return 0; }
    var k = pageScale();
    var box = pageBox();
    var colInner = box.colW - (1.2 * 2 * k) * MM / 2.834645;   /* 扣左右内边距 */
    var vAvail = box.baseRow - textBlockH(k) - 2;
    return Math.max(6, Math.floor(Math.min(colInner, vAvail)));
  }

  /* 基准行高写进 --pp-row：这是「没有额外文字时」每行应有的高度，
     相当于把内容区按用户设定的行数均分。文字撑高时实际行高会大于它。 */
  function applyGeometry() {
    if (!pagesEl) { return; }
    var box = pageBox();
    pagesEl.style.setProperty('--pp-art', artSize() + 'px');
    pagesEl.style.setProperty('--pp-row', Math.floor(box.baseRow) + 'px');
  }

  /* ---------- 版面几何重算 ----------
     v2.0.73 起图边长只依赖版式与字号，不再有「测量—缩放」循环，
     所以这里就是把 --pp-art / --pp-row 重新写一遍。保留这个函数名，
     避免调用点散落。 */
  function relayoutArt() {
    applyGeometry();
  }

  /* ---------- 按实际行高分页 ----------
     文字撑高行之后，一页能放几行不再是固定的（用户设定的 rows 只是上限）。
     做法：先在离屏容器里按真实列宽把所有格子排一遍，量出每行实际高度，
     再按「累加不超内容区高」贪心装页。
     离屏容器的宽度/字号必须与真实页一致，否则文字换行数不同、行高测不准。 */
  /* ---------- 按实际内容高分页 ----------
     文字撑高行之后，一页能放几行不再是固定的（用户设定的 rows 只是「基准行高」
     的来源，也就是上限）。这里用 measureHeights 拿到每格真实高度 →
     每 cols 个归一行取最大值 → 贪心装页。
     返回 [{ ids: [...], heights: [行高...] }]；heights 会在渲染时直接写成
     grid-template-rows，保证屏幕上/打印出来的行高与分页时算的一致。 */
  function packRows(list, k, artPx) {
    var box = pageBox();
    var hs = measureHeights(list, artPx, k, false);

    /* 按列分组取行高；下限取基准行高 —— 这样「没有额外文字」时行高一律等于
       按「列×行」均分出来的高度（版面整齐、铺满一页），只有内容真的更高时
       才把那一行撑起来。 */
    var rows = [];
    for (var i = 0; i < list.length; i += cfg.cols) {
      var ids = [], h = 0;
      for (var j = i; j < Math.min(i + cfg.cols, list.length); j++) {
        ids.push(list[j].id);
        if (hs[j] > h) { h = hs[j]; }
      }
      rows.push({ ids: ids, h: Math.max(h, Math.floor(box.baseRow)) });
    }
    if (!rows.length) { return [{ ids: [], heights: [] }]; }

    /* 贪心装页：累计「行高 + 行间距」不超过内容区高 */
    var pages = [], cur = [], used = 0;
    rows.forEach(function (row) {
      var need = row.h + (cur.length ? box.gap : 0);
      /* 单行比整页还高（极端长文本）：独占一页，否则永远装不下会死循环 */
      if (row.h > box.h && !cur.length) {
        pages.push([row]);
        return;
      }
      if (used + need > box.h + 0.5 && cur.length) {
        pages.push(cur); cur = []; used = 0;
        need = row.h;
      }
      cur.push(row);
      used += need;
    });
    if (cur.length) { pages.push(cur); }

    return pages.map(function (p) {
      return {
        ids: [].concat.apply([], p.map(function (r) { return r.ids; })),
        heights: p.map(function (r) { return r.h; })
      };
    });
  }

  /* 把某个节点完整滚进 .pp-list 的可视区。
     不用 scrollIntoView({block:'nearest'})：它认为「部分可见」就够了，
     实测手机上输入框底部仍被裁掉 11px（框在列表区外看不见）。
     这里按 rect 精确补差，并留 8px 余量。 */
  function revealInList(node) {
    if (!node || !node.closest) { return; }
    var list = node.closest('.pp-list');
    if (!list) { return; }
    var lr = list.getBoundingClientRect();
    var nr = node.getBoundingClientRect();
    if (nr.bottom > lr.bottom - 8) {
      list.scrollTop += Math.ceil(nr.bottom - (lr.bottom - 8));
    } else if (nr.top < lr.top + 8) {
      list.scrollTop -= Math.ceil((lr.top + 8) - nr.top);
    }
  }

  /* 改文字时的即时反馈：只替换那一格的文字节点。
     行高由 CSS 的 grid-auto-rows: minmax(--pp-row, auto) 自动撑开，所以
     这里不用重排就能立刻看到「行变高、图不变小」。
     但文字多到把这一页顶出去时，需要重新分页 —— 那会重建 pagesEl，
     打字过程中频繁重建会闪，故用防抖（停顿 360ms 后重排）。
     注意：左侧输入框不在 pagesEl 里，重建不会让它失焦。 */
  var repagTimer = 0;
  function updateCellContent(id) {
    if (!pagesEl) { return; }
    var c = null;
    cases.forEach(function (x) { if (x.id === id) { c = x; } });
    if (!c) { return; }
    var cell = null;
    Array.prototype.forEach.call(pagesEl.querySelectorAll('.pp-cell'), function (n) {
      if (n.getAttribute('data-id') === id) { cell = n; }
    });
    if (cell && cfg.showAlg) {
      var cc = cellContentFor(c);
      var cls = 'pp-cell__alg';
      if (cc.kind === 'line') { cls += ' pp-cell__alg--blank'; }
      else if (cc.kind === 'text') { cls += ' pp-cell__alg--text'; }
      var node = el('div', cls);
      if (cc.kind !== 'line') { node.textContent = cc.text; }
      var old = cell.querySelector('.pp-cell__alg');
      if (old && old.parentNode) { old.parentNode.replaceChild(node, old); }
      else { cell.appendChild(node); }
    }
    clearTimeout(repagTimer);
    repagTimer = setTimeout(function () { renderPreview(); }, 360);
  }

  /* 单个格子。抽出来是为了「离屏测量」和「正式渲染」共用同一份 DOM 结构，
     否则两边结构一旦有差，测出来的行高就不等于真实行高。 */
  function buildCell(c) {
    var cell = el('div', 'pp-cell');
    cell.setAttribute('data-id', c.id);   /* 供「改文字」时局部刷新，不重建整页 */
    if (!cfg.showArt) { cell.classList.add('pp-cell--noart'); }
    if (!cfg.showName) { cell.classList.add('pp-cell--noname'); }
    if (!cfg.showSub) { cell.classList.add('pp-cell--nosub'); }
    if (!cfg.showAlg) { cell.classList.add('pp-cell--noalg'); }

    if (cfg.showArt) {
      var a = el('div', 'pp-cell__art');
      var svg = artNode(c, rotOf(c));
      if (svg) { a.appendChild(svg); }
      cell.appendChild(a);
    }
    if (cfg.showName) { cell.appendChild(el('div', 'pp-cell__name', esc(c.id))); }
    if (cfg.showSub && c.sub) { cell.appendChild(el('div', 'pp-cell__sub', esc(c.sub))); }
    if (cfg.showAlg) {
      var cc = cellContentFor(c);
      if (cc.kind === 'line') {
        cell.appendChild(el('div', 'pp-cell__alg pp-cell__alg--blank'));
      } else if (cc.kind === 'text') {
        cell.appendChild(el('div', 'pp-cell__alg pp-cell__alg--text', esc(cc.text)));
      } else {
        cell.appendChild(el('div', 'pp-cell__alg', esc(cc.text)));
      }
    }
    return cell;
  }

  function buildPage(chunk, idx, total, n, k, heights) {
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
    /* 行高由测量结果写死：文字多的行今天要更高，就真的更高，不依赖 CSS auto */
    if (heights && heights.length) {
      grid.style.gridTemplateRows = heights.map(function (h) {
        return Math.max(1, Math.round(h)) + 'px';
      }).join(' ');
    }

    chunk.forEach(function (c) { grid.appendChild(buildCell(c)); });

    page.appendChild(grid);
    return page;
  }

  function renderPreview() {
    var list = chosen();
    var k = pageScale();
    var artPx = artSize();
    pagesEl.className = 'pp-pages' + (cfg.landscape ? ' pp-land' : '');
    /* 先写几何变量，离屏测量与正式渲染都依赖它 */
    applyGeometry();

    /* 按实际内容高分页：文字撑高的行会让这一页少放几行，多出来的顺延到下一页 */
    var groups = list.length ? packRows(list, k, artPx) : [{ ids: [], heights: [] }];
    if (!groups.length) { groups = [{ ids: [], heights: [] }]; }

    var byId = {};
    list.forEach(function (c) { byId[c.id] = c; });

    pagesEl.innerHTML = '';
    var total = groups.length, n = list.length;
    groups.forEach(function (g, pi) {
      var chunk = [];
      g.ids.forEach(function (id) { if (byId[id]) { chunk.push(byId[id]); } });
      pagesEl.appendChild(buildPage(chunk, pi + 1, total, n, k, g.heights));
    });

    refreshCount(total);
    applyZoom();
  }

  /* 底部统计：单独抽出来，改文字时可以只刷这一行（不必整页重绘） */
  function refreshCount(totalPages) {
    if (!countEl) { return; }
    var list = chosen();
    var per = Math.max(1, cfg.cols * cfg.rows);
    var total = totalPages || Math.max(1, Math.ceil(list.length / per));
    var blank = list.filter(function (c) { return algIdx(c) < 0; }).length;
    var rotated = list.filter(function (c) { return rotOf(c) > 0; }).length;
    var own = customTextCount();
    countEl.textContent = '已选 ' + list.length + ' / ' + cases.length + ' 例' +
      (blank ? '（留空 ' + blank + ' 条' + (own ? '，其中 ' + own + ' 条有文字' : '') + '）' : '') +
      (rotated ? '（旋转 ' + rotated + ' 条）' : '') +
      ' · 每页最多 ' + per + ' 格 · 共 ' + total + ' 页';
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
    cases.forEach(function (c) { cfg.sel[c.id] = { on: true, alg: (c.cur || 0), rot: 0, text: '' }; });
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
    helpers = ctx.helpers || null;
    /* 深拷贝一份，排序不影响训练器里的原始数组 */
    cases = (ctx.cases || []).map(function (c) {
      return {
        id: c.id, sub: c.sub || '', facelets: c.facelets, fl: c.fl, art: c.art,
        algs: (c.algs || []).slice(),
        algK: (c.algK || []).slice(), algCustom: (c.algCustom || []).slice(),
        cur: c.cur || 0
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
    /* 字体还没就绪时文字高度会变，配图边长是按文字高度算的 →
       就绪后重算一次，避免首次打开时图偏小。只挂一次。 */
    if (!open.fontsBound && document.fonts && document.fonts.ready) {
      open.fontsBound = true;
      document.fonts.ready.then(function () {
        if (modal && !modal.hidden) { renderPreview(); }
      });
    }
  }
  function close() {
    if (modal) { modal.hidden = true; }
    document.body.classList.remove('pp-open');
    save();
  }

  return { open: open, close: close };
})();
