/* =========================================================
   cfop-ui.js — CFOP 公式库共享渲染器（标准组件版）
   依赖：assets/css/components.css 的标准组件类
        （.card / .badge / .btn / .tabs / .tab / .progress / .seg / .input / .formula-block）
   数据：/tools/cfop/data/{set}.json
   功能：搜索、分类筛选、朝向切换(F2L)、点击复制、掌握进度(localStorage)、深浅主题。
   ========================================================= */
(function () {
  "use strict";
  var DATA_ROOT = "/tools/cfop/data/";
  var _cache = {};

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function loadSet(set) {
    if (_cache[set]) return Promise.resolve(_cache[set]);
    return fetch(DATA_ROOT + set + ".json").then(function (r) {
      if (!r.ok) throw new Error("数据加载失败: " + set);
      return r.json();
    }).then(function (d) { _cache[set] = d; return d; });
  }

  /* ---------- 案例配图（复刻原站样式） ----------
     OLL/PLL        → 顶面平面示意图（CubeArt.flatCase，数据 facelets）
     F2L/AdvancedF2L→ 等轴立体魔方（CubeArt.isoCube，数据 fl）
     见 js/cube-art.js。 */
  function caseArt(c) {
    if (!window.CubeArt) return null;
    if (c.facelets && window.CubeArt.flatCase) return window.CubeArt.flatCase(c.facelets);
    if (c.fl && window.CubeArt.isoCube) return window.CubeArt.isoCube(c.fl);
    return null;
  }

  /* ---------- 掌握进度（localStorage） ---------- */
  function progKey(set) { return "cfop-learned-" + set; }
  function getLearned(set) { try { return JSON.parse(localStorage.getItem(progKey(set)) || "{}"); } catch (e) { return {}; } }
  function setLearned(set, id, on) {
    var o = getLearned(set); o[id] = on ? 1 : 0;
    localStorage.setItem(progKey(set), JSON.stringify(o)); return o;
  }

  /* ---------- 复制 ---------- */
  function copy(t) { if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {}); }
  function flash(node, txt) {
    var old = node.textContent; node.textContent = txt;
    setTimeout(function () { node.textContent = old; }, 900);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  /* ---------- 单条算法：标准 .formula-block + .btn 复制 ---------- */
  function algRow(moves) {
    var row = el("div", "cfop-alg");
    var block = el("div", "formula-block", escapeHtml(moves));
    block.title = "点击复制";
    block.addEventListener("click", function () { copy(moves); flash(block, "已复制 ✓"); });
    var c = el("button", "btn btn--sm cfop-alg__copy", "复制");
    c.type = "button";
    c.addEventListener("click", function (e) { e.stopPropagation(); copy(moves); flash(c, "✓"); });
    row.appendChild(block); row.appendChild(c);
    return row;
  }

  /* ---------- 单个 case 卡片：标准 .card ---------- */
  function caseCard(set, c) {
    var card = el("article", "card cfop-card");
    card.dataset.id = c.id;
    card.dataset.sub = (c.subgroup || "").toLowerCase();
    card.dataset.text = (c.id + " " + (c.subgroup || "") + " " + (c.setup || "")).toLowerCase();

    /* 头部：编号 + 分类 + 掌握 */
    var head = el("div", "card__head cfop-card__head");
    head.appendChild(el("span", "card__index", escapeHtml(c.id.replace(/^([A-Za-z0-9]+)\s+/, ""))));
    var title = el("span", "card__title cfop-card__name", escapeHtml(c.id));
    head.appendChild(title);
    if (c.subgroup) head.appendChild(el("span", "badge badge--mono", escapeHtml(c.subgroup)));

    var learned = el("button", "btn btn--sm btn--ghost cfop-learned");
    learned.type = "button";
    var lp = getLearned(set)[c.id];
    learned.classList.toggle("is-on", !!lp);
    learned.innerHTML = (lp ? "★ 已掌握" : "☆ 标记掌握");
    learned.addEventListener("click", function () {
      var o = setLearned(set, c.id, !learned.classList.contains("is-on"));
      learned.classList.toggle("is-on");
      learned.innerHTML = (learned.classList.contains("is-on") ? "★ 已掌握" : "☆ 标记掌握");
      updateProgress(set);
    });
    head.appendChild(learned);
    card.appendChild(head);

    /* 主体 */
    var body = el("div", "card__body cfop-card__body");

    var art = caseArt(c);
    if (art) body.appendChild(art);

    if (c.setup) {
      var sp = el("div", "cfop-setup");
      sp.appendChild(el("span", "cfop-setup__label", "setup"));
      sp.appendChild(el("span", "formula", escapeHtml(c.setup)));
      var cp = el("button", "btn btn--sm btn--ghost cfop-setup__copy", "复制");
      cp.type = "button";
      cp.addEventListener("click", function () { copy(c.setup); flash(cp, "✓"); });
      sp.appendChild(cp);
      body.appendChild(sp);
    }

    var ori = c.orientations || [];
    if (ori.length > 1) {
      var tabs = el("div", "tabs cfop-tabs");
      tabs.setAttribute("role", "tablist");
      var wrap = el("div", "cfop-ori-wrap");
      ori.forEach(function (o, i) {
        var tab = el("button", "tab cfop-tab" + (i === 0 ? " is-active" : ""), escapeHtml(o.name || ("朝向" + (i + 1))));
        tab.type = "button";
        var pane = el("div", "cfop-ori" + (i === 0 ? " is-active" : ""));
        (o.algs || []).forEach(function (a) { pane.appendChild(algRow(a)); });
        tab.addEventListener("click", function () {
          $$(".cfop-tab", tabs).forEach(function (t) { t.classList.remove("is-active"); });
          $$(".cfop-ori", wrap).forEach(function (p) { p.classList.remove("is-active"); });
          tab.classList.add("is-active"); pane.classList.add("is-active");
        });
        tabs.appendChild(tab); wrap.appendChild(pane);
      });
      body.appendChild(tabs); body.appendChild(wrap);
    } else {
      (ori[0] ? ori[0].algs : []).forEach(function (a) { body.appendChild(algRow(a)); });
    }

    card.appendChild(body);
    return card;
  }

  function updateProgress(set) {
    var data = _cache[set]; if (!data) return;
    var learned = getLearned(set);
    var done = data.cases.filter(function (c) { return learned[c.id]; }).length;
    var pct = data.cases.length ? Math.round(done / data.cases.length * 100) : 0;
    var bar = $("#cfop-progress-bar"); if (bar) bar.style.width = pct + "%";
    var txt = $("#cfop-progress-text");
    if (txt) txt.textContent = "已掌握 " + done + " / " + data.cases.length + "（" + pct + "%）";
  }

  /* ---------- 主渲染 ---------- */
  function render(set, rootId) {
    var root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = '<div class="empty">加载中…</div>';
    loadSet(set).then(function (data) {
      root.innerHTML = "";

      /* 进度条（标准 .progress） */
      var pbox = el("div", "cfop-progress");
      var pbar = el("div", "progress"); 
      var inner = el("div", "progress__bar cfop-progress__bar"); inner.id = "cfop-progress-bar";
      pbar.appendChild(inner);
      var ptxt = el("div", "progress__text cfop-progress__text", "已掌握 0 / " + data.cases.length + "（0%）");
      ptxt.id = "cfop-progress-text";
      pbox.appendChild(pbar); pbox.appendChild(ptxt);
      root.appendChild(pbox);

      /* 工具条（标准 .toolbar / .input / .seg） */
      var toolbar = el("div", "toolbar cfop-toolbar");
      var search = el("input", "input cfop-search");
      search.type = "search";
      search.placeholder = "搜索编号 / 分类 / setup…";
      search.setAttribute("aria-label", "搜索公式");
      toolbar.appendChild(search);

      var subgroups = {};
      data.cases.forEach(function (c) { if (c.subgroup) subgroups[c.subgroup] = 1; });
      var seg = el("div", "seg cfop-chips");
      var allBtn = el("button", "seg__btn cfop-chip is-active", "全部");
      allBtn.type = "button";
      seg.appendChild(allBtn);
      Object.keys(subgroups).forEach(function (s) {
        var b = el("button", "seg__btn cfop-chip", escapeHtml(s));
        b.type = "button";
        seg.appendChild(b);
      });
      toolbar.appendChild(seg);
      root.appendChild(toolbar);

      /* 网格 */
      var grid = el("div", "cfop-grid");
      data.cases.forEach(function (c) { grid.appendChild(caseCard(set, c)); });
      root.appendChild(grid);

      var empty = el("div", "empty", '没有匹配的公式<span class="empty__tip">试试更换关键词或分类</span>');
      empty.style.display = "none"; root.appendChild(empty);

      function applyFilter() {
        var q = search.value.trim().toLowerCase();
        var active = $(".cfop-chip.is-active");
        var sub = active && active.textContent !== "全部" ? active.textContent.toLowerCase() : null;
        var vis = 0;
        $$(".cfop-card", grid).forEach(function (card) {
          var ok = (!sub || card.dataset.sub === sub) && (!q || card.dataset.text.indexOf(q) >= 0);
          card.classList.toggle("is-hidden", !ok); if (ok) vis++;
        });
        empty.style.display = vis ? "none" : "block";
      }
      search.addEventListener("input", applyFilter);
      $$(".cfop-chip", seg).forEach(function (chip) {
        chip.addEventListener("click", function () {
          $$(".cfop-chip", seg).forEach(function (c) { c.classList.remove("is-active"); });
          chip.classList.add("is-active"); applyFilter();
        });
      });
      updateProgress(set);
    }).catch(function (e) {
      root.innerHTML = '<div class="empty">' + escapeHtml(e.message) +
        '<span class="empty__tip">请通过本地 HTTP 服务器访问（python -m http.server），不要直接双击打开。</span></div>';
    });
  }

  /* ---------- 主题切换（与全站 data-theme 保持一致） ---------- */
  function bindTheme(btnId) {
    var btn = document.getElementById(btnId); if (!btn) return;
    function paint() { btn.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "🌙 深色" : "☀ 浅色"; }
    paint();
    btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      paint();
    });
  }

  window.CFOP = { render: render, bindTheme: bindTheme };
})();
