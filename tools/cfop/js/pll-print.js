/* =========================================================
   pll-print.js — PLL 打印页生成器
   功能：自选「情况 + 每条公式（4 选 1）」→ 自动排版成 A4 打印页。
   依赖：js/cube-art.js（案例配图）、css/pll-print.css、components.css 标准组件
   入口：window.PLLPrint.open(data)   data 为 data/pll.json 解析结果
   选择结果持久化在 localStorage（cfop-pll-print-v1）。
   ========================================================= */
(function () {
  "use strict";

  var KEY = "cfop-pll-print-v1";

  var PRESETS = [
    { id: "one",   label: "一页速查 · 21 例",    cols: 3, rows: 7, landscape: false },
    { id: "two",   label: "标准 · 每页 12",      cols: 3, rows: 4, landscape: false },
    { id: "big",   label: "大图 · 每页 8",       cols: 2, rows: 4, landscape: false },
    { id: "wide3", label: "横版 3 列 · 每页 9",  cols: 3, rows: 3, landscape: true },
    { id: "wide4", label: "横版 4 列 · 每页 12", cols: 4, rows: 3, landscape: true },
    { id: "wide5", label: "横版 5 列 · 每页 20", cols: 5, rows: 4, landscape: true }
  ];

  var DEFAULTS = {
    title: "PLL 公式表",
    preset: "one",
    cols: 3, rows: 7, landscape: false,
    showArt: true, showName: true, showSub: true, showAlg: true, showHead: true,
    zoom: "fit",
    sel: {},
    order: []
  };

  var cfg = null, cases = [], modal = null, printStyle = null;
  var listEl, pagesEl, stageEl, countEl;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  }); }
  function pick(id) {
    if (!cfg.sel[id]) cfg.sel[id] = { on: true, alg: 0 };
    return cfg.sel[id];
  }
  function algsOf(c) {
    var out = [];
    (c.orientations || []).forEach(function (o) { (o.algs || []).forEach(function (a) { out.push(a); }); });
    return out;
  }
  function subs() {
    var seen = {}, out = [];
    cases.forEach(function (c) { if (c.subgroup && !seen[c.subgroup]) { seen[c.subgroup] = 1; out.push(c.subgroup); } });
    return out;
  }
  function chosen() {
    return cases.filter(function (c) { return pick(c.id).on; });
  }
  function art(c) {
    if (!window.CubeArt || !window.CubeArt.flatCase || !c.facelets) return null;
    return window.CubeArt.flatCase(c.facelets);
  }

  /* ---------- 持久化 ---------- */
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function load() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { c = null; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      out[k] = (c && c[k] !== undefined) ? c[k] : DEFAULTS[k];
    });
    if (!out.sel || typeof out.sel !== "object") out.sel = {};
    if (!Array.isArray(out.order)) out.order = [];
    // 用当前数据补齐默认选中（新 case 默认选中第一条公式）
    cases.forEach(function (cs) {
      var s = out.sel[cs.id];
      if (!s || typeof s !== "object") out.sel[cs.id] = { on: true, alg: 0 };
      else {
        s.on = s.on !== false;
        s.alg = Math.max(0, parseInt(s.alg, 10) || 0);
      }
    });
    return out;
  }

  /* ---------- 弹窗骨架 ---------- */
  function buildModal() {
    modal = el("div", "pp-modal pp-root");
    modal.hidden = true;
    modal.innerHTML =
      '<div class="pp-panel" role="dialog" aria-modal="true" aria-label="PLL 打印页生成器">' +
        '<div class="pp-head">' +
          '<span class="pp-head__title">PLL 打印页生成器</span>' +
          '<span class="pp-head__hint">勾选要打印的情况 · 为每个情况挑一条公式 · 自动排版 A4</span>' +
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

    listEl = modal.querySelector("#pp-list");
    pagesEl = modal.querySelector("#pp-pages");
    stageEl = modal.querySelector("#pp-stage");
    countEl = modal.querySelector("#pp-count");

    modal.addEventListener("click", function (e) {
      var act = e.target.closest("[data-act]");
      if (act) {
        var a = act.getAttribute("data-act");
        if (a === "close") close();
        else if (a === "print") doPrint();
        else if (a === "reset") reset();
        return;
      }
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !modal.hidden) close();
    });
    window.addEventListener("resize", function () {
      if (modal && !modal.hidden) applyZoom();
    });
  }

  /* ---------- 快捷选择条 ---------- */
  function buildQuick() {
    var box = modal.querySelector("#pp-quick");
    box.innerHTML = "";
    function add(label, fn) {
      var b = el("button", "seg__btn", esc(label));
      b.type = "button";
      b.addEventListener("click", function () { fn(); refresh(); });
      box.appendChild(b);
    }
    add("全选", function () { cases.forEach(function (c) { pick(c.id).on = true; }); });
    add("清空", function () { cases.forEach(function (c) { pick(c.id).on = false; }); });
    add("反选", function () { cases.forEach(function (c) { var s = pick(c.id); s.on = !s.on; }); });
    subs().forEach(function (s) {
      var n = cases.filter(function (c) { return c.subgroup === s; }).length;
      add(s + " " + n, function () {
        var group = cases.filter(function (c) { return c.subgroup === s; });
        var allOn = group.every(function (c) { return pick(c.id).on; });
        group.forEach(function (c) { pick(c.id).on = !allOn; });
      });
    });
  }

  /* ---------- 左栏：情况列表（勾选 + 公式 4 选 1 + 拖拽排序） ---------- */
  function applyOrder() {
    cfg.order = cases.map(function (c) { return c.id; });
    save();
  }

  function moveCase(fromId, toId, after) {
    if (fromId === toId) return;
    var f = -1, t = -1;
    cases.forEach(function (c, i) { if (c.id === fromId) f = i; if (c.id === toId) t = i; });
    if (f < 0 || t < 0) return;
    var item = cases.splice(f, 1)[0];
    var to = t;
    if (f < to) to--;
    if (after) to++;
    cases.splice(Math.min(to, cases.length), 0, item);
    applyOrder();
    buildList();
    refresh();
  }

  function buildList() {
    listEl.innerHTML = "";
    var draggingId = null;
    cases.forEach(function (c) {
      var s = pick(c.id);
      var item = el("div", "pp-item");
      item.draggable = true;
      item.dataset.id = c.id;
      item.title = "按住拖拽可调整打印顺序";

      item.addEventListener("dragstart", function (e) {
        draggingId = c.id;
        item.classList.add("is-dragging");
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", function () {
        item.classList.remove("is-dragging");
        Array.prototype.forEach.call(listEl.children, function (child) {
          child.classList.remove("is-over");
        });
        draggingId = null;
      });
      item.addEventListener("dragover", function (e) {
        if (!draggingId || draggingId === c.id) return;
        e.preventDefault();
        item.classList.add("is-over");
      });
      item.addEventListener("dragleave", function () {
        item.classList.remove("is-over");
      });
      item.addEventListener("drop", function (e) {
        if (!draggingId || draggingId === c.id) return;
        e.preventDefault();
        moveCase(draggingId, c.id, true);
      });

      var chk = el("label", "pp-item__check");
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = s.on;
      box.setAttribute("aria-label", "打印 " + c.id);
      box.setAttribute("draggable", "false");
      box.addEventListener("change", function () { s.on = box.checked; refresh(); });
      chk.appendChild(box);
      item.appendChild(chk);

      var artBox = el("div", "pp-item__art");
      var svg = art(c);
      if (svg) artBox.appendChild(svg);
      item.appendChild(artBox);

      var main = el("div", "pp-item__main");
      var row = el("div", "pp-item__row");
      row.appendChild(el("span", "pp-item__name", esc(c.id)));
      if (c.subgroup) row.appendChild(el("span", "badge badge--mono", esc(c.subgroup)));
      main.appendChild(row);

      var list = algsOf(c);
      var sel = el("select", "select pp-item__sel");
      sel.setAttribute("aria-label", c.id + " 选用公式");
      sel.setAttribute("draggable", "false");
      list.forEach(function (a, i) {
        var o = document.createElement("option");
        o.value = String(i);
        o.textContent = (i + 1) + ". " + a;
        sel.appendChild(o);
      });
      sel.value = String(Math.min(s.alg, Math.max(0, list.length - 1)));
      sel.title = list.join("\n");
      sel.addEventListener("change", function () {
        s.alg = parseInt(sel.value, 10) || 0;
        refresh();
      });
      main.appendChild(sel);

      item.appendChild(main);
      listEl.appendChild(item);
    });
  }

  /* ---------- 排版选项 ---------- */
  var ui = null;
  function numSelect(min, max) {
    var s = el("select", "select");
    for (var i = min; i <= max; i++) {
      var o = document.createElement("option");
      o.value = String(i); o.textContent = String(i);
      s.appendChild(o);
    }
    return s;
  }
  function optWrap(label) {
    var w = el("div", "pp-opt");
    if (label) w.appendChild(el("span", "pp-opt__label", esc(label)));
    return w;
  }
  function check(label, key) {
    var l = el("label", "pp-check");
    var i = document.createElement("input");
    i.type = "checkbox";
    i.checked = !!cfg[key];
    i.addEventListener("change", function () { cfg[key] = i.checked; save(); renderPreview(); });
    l.appendChild(i);
    l.appendChild(document.createTextNode(label));
    return { node: l, input: i };
  }

  function buildOpts() {
    var box = modal.querySelector("#pp-opts");
    box.innerHTML = "";
    ui = {};

    var o1 = optWrap("预设");
    ui.preset = el("select", "select");
    PRESETS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id; o.textContent = p.label;
      ui.preset.appendChild(o);
    });
    ui.preset.addEventListener("change", applyPreset);
    var oCustom = document.createElement("option");
    oCustom.value = "custom"; oCustom.textContent = "自定义";
    ui.preset.appendChild(oCustom);
    o1.appendChild(ui.preset);
    box.appendChild(o1);

    var o2 = optWrap("列 × 行");
    o2.classList.add("pp-opt--num");
    ui.cols = numSelect(1, 6);
    ui.rows = numSelect(1, 10);
    ui.cols.addEventListener("change", custom);
    ui.rows.addEventListener("change", custom);
    o2.appendChild(ui.cols);
    o2.appendChild(el("span", "pp-opt__label", "×"));
    o2.appendChild(ui.rows);
    box.appendChild(o2);

    var o3 = optWrap("方向");
    ui.dir = el("select", "select");
    [["portrait", "竖版 A4"], ["landscape", "横版 A4"]].forEach(function (p) {
      var o = document.createElement("option");
      o.value = p[0]; o.textContent = p[1];
      ui.dir.appendChild(o);
    });
    ui.dir.addEventListener("change", custom);
    o3.appendChild(ui.dir);
    box.appendChild(o3);

    var o4 = optWrap("缩放");
    ui.zoom = el("select", "select");
    [["fit", "适应宽度"], ["1", "100%"], ["0.75", "75%"], ["0.5", "50%"]].forEach(function (p) {
      var o = document.createElement("option");
      o.value = p[0]; o.textContent = p[1];
      ui.zoom.appendChild(o);
    });
    ui.zoom.addEventListener("change", function () {
      cfg.zoom = ui.zoom.value; save(); applyZoom();
    });
    o4.appendChild(ui.zoom);
    box.appendChild(o4);

    var o5 = optWrap("标题");
    o5.classList.add("pp-opt--title");
    ui.title = el("input", "input");
    ui.title.type = "text";
    ui.title.setAttribute("aria-label", "纸张标题");
    ui.title.addEventListener("input", function () {
      cfg.title = ui.title.value; save(); renderPreview();
    });
    o5.appendChild(ui.title);
    box.appendChild(o5);

    var o6 = el("div", "pp-checks");
    var cArt = check("配图", "showArt");
    var cName = check("编号", "showName");
    var cSub = check("分类", "showSub");
    var cAlg = check("公式", "showAlg");
    var cHead = check("页眉", "showHead");
    ui.checkArt = cArt.input; ui.checkName = cName.input;
    ui.checkSub = cSub.input; ui.checkAlg = cAlg.input; ui.checkHead = cHead.input;
    [cArt.node, cName.node, cSub.node, cAlg.node, cHead.node].forEach(function (n) { o6.appendChild(n); });
    box.appendChild(o6);
  }

  function applyPreset() {
    if (ui.preset.value === "custom") return;
    var p = null;
    PRESETS.forEach(function (x) { if (x.id === ui.preset.value) p = x; });
    if (!p) return;
    cfg.preset = p.id;
    cfg.cols = p.cols; cfg.rows = p.rows; cfg.landscape = p.landscape;
    syncOpts(); save(); renderPreview();
  }
  function custom() {
    cfg.cols = parseInt(ui.cols.value, 10) || 1;
    cfg.rows = parseInt(ui.rows.value, 10) || 1;
    cfg.landscape = ui.dir.value === "landscape";
    cfg.preset = "custom";
    ui.preset.value = "custom";
    save(); renderPreview();
  }
  function syncOpts() {
    if (!ui) return;
    ui.cols.value = String(cfg.cols);
    ui.rows.value = String(cfg.rows);
    ui.dir.value = cfg.landscape ? "landscape" : "portrait";
    ui.zoom.value = cfg.zoom;
    ui.title.value = cfg.title || "";
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
      if (c) item.classList.toggle("is-off", !pick(c.id).on);
    });
    save();
    renderPreview();
  }

  /* ---------- A4 排版 ---------- */
  function buildPage(chunk, idx, total, n) {
    var page = el("div", "pp-page");

    if (cfg.showHead) {
      var head = el("div", "pp-page__head");
      head.appendChild(el("div", "pp-page__title", esc(cfg.title || "PLL 公式表")));
      head.appendChild(el("div", "pp-page__meta",
        "共 <b>" + n + "</b> 例 · 第 <b>" + idx + " / " + total + "</b> 页" +
        "<br>姓名 ____________　日期 ____________"));
      page.appendChild(head);
    }

    var grid = el("div", "pp-grid");
    grid.style.gridTemplateColumns = "repeat(" + cfg.cols + ", minmax(0,1fr))";
    grid.style.gridTemplateRows = "repeat(" + cfg.rows + ", minmax(0,1fr))";

    chunk.forEach(function (c) {
      var cell = el("div", "pp-cell");
      if (!cfg.showArt) cell.classList.add("pp-cell--noart");
      if (!cfg.showName) cell.classList.add("pp-cell--noname");
      if (!cfg.showSub) cell.classList.add("pp-cell--nosub");
      if (!cfg.showAlg) cell.classList.add("pp-cell--noalg");

      if (cfg.showArt) {
        var a = el("div", "pp-cell__art");
        var svg = art(c);
        if (svg) a.appendChild(svg);
        cell.appendChild(a);
      }
      if (cfg.showName) cell.appendChild(el("div", "pp-cell__name", esc(c.id)));
      if (cfg.showSub && c.subgroup) cell.appendChild(el("div", "pp-cell__sub", esc(c.subgroup)));
      if (cfg.showAlg) {
        var list = algsOf(c);
        var i = Math.min(pick(c.id).alg, Math.max(0, list.length - 1));
        cell.appendChild(el("div", "pp-cell__alg", esc(list[i] || "")));
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
    for (var i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
    if (!pages.length) pages.push([]);

    pagesEl.className = "pp-pages" + (cfg.landscape ? " pp-land" : "");
    pagesEl.innerHTML = "";
    var total = pages.length, n = list.length;
    pages.forEach(function (chunk, pi) {
      pagesEl.appendChild(buildPage(chunk, pi + 1, total, n));
    });
    if (countEl) {
      countEl.textContent = "已选 " + n + " / " + cases.length + " 例 · 共 " + total + " 页";
    }
    applyZoom();
  }

  function applyZoom() {
    if (!pagesEl || !stageEl || !cfg) return;
    var z;
    if (cfg.zoom === "fit") {
      var avail = stageEl.clientWidth - 34;
      var pageW = cfg.landscape ? 1123 : 794;   /* A4 @96dpi */
      z = Math.max(0.25, Math.min(1, avail / pageW));
    } else {
      z = parseFloat(cfg.zoom) || 1;
    }
    pagesEl.style.zoom = z;
  }

  /* ---------- 打印 ---------- */
  function doPrint() {
    save();
    if (!printStyle) {
      printStyle = document.createElement("style");
      printStyle.id = "pp-print-style";
      document.head.appendChild(printStyle);
    }
    printStyle.textContent = "@page{ size: A4 " +
      (cfg.landscape ? "landscape" : "portrait") + "; margin: 0; }";
    window.print();
  }

  /* ---------- 开关 / 重置 ---------- */
  function reset() {
    var keepTitle = cfg.title || DEFAULTS.title;
    cfg = JSON.parse(JSON.stringify(DEFAULTS));
    cfg.title = keepTitle;
    cases.forEach(function (c) { cfg.sel[c.id] = { on: true, alg: 0 }; });
    buildList(); buildQuick(); syncOpts(); refresh();
  }
  function sortCasesByOrder() {
    if (!cfg.order || !cfg.order.length) return;
    var idx = {};
    cfg.order.forEach(function (id, i) { idx[id] = i; });
    cases.sort(function (a, b) {
      var ai = idx[a.id], bi = idx[b.id];
      if (ai === undefined) ai = 9999;
      if (bi === undefined) bi = 9999;
      return ai - bi;
    });
  }
  function open(data) {
    cases = (data && data.cases) || [];
    cfg = load();
    sortCasesByOrder();
    if (!modal) buildModal();
    if (!ui) buildOpts();
    buildList();
    buildQuick();
    syncOpts();
    refresh();
    modal.hidden = false;
    document.body.classList.add("pp-open");
    applyZoom();
  }
  function close() {
    if (modal) modal.hidden = true;
    document.body.classList.remove("pp-open");
    save();
  }

  window.PLLPrint = { open: open, close: close };
})();
