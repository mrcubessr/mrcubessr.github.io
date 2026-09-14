/* =========================================================
   cross-trainer.js — 十字训练器页面控制器
   ---------------------------------------------------------
   功能：选择「十字颜色」+「目标步数」→ 生成十字最优解恰为该步数的打乱
        （打乱 ≤ 10 步）；配平面六面展开图、计时器、解法对照、批量 10 个。
   依赖：rubik-core.js（贴纸模型）、cross-solver.js（求解 / 打乱生成）、
        cube-art.js（flatNet 平面展开图）。
   ========================================================= */
(function () {
  "use strict";

  var LS_KEY = "cfop-cross-trainer-v1";
  var MAX_LEN = 10;
  var BATCH = 10;

  var state = { color: "w", steps: 4 };
  var current = null;         /* 当前打乱结果 */
  var els = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function copy(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
  }
  function flash(node, txt, back) {
    if (node.__flashing) return;
    node.__flashing = true;
    var old = node.textContent;
    node.textContent = txt;
    setTimeout(function () { node.textContent = back != null ? back : old; node.__flashing = false; }, 900);
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ color: state.color, steps: state.steps })); } catch (e) {}
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (window.CrossSolver && CrossSolver.COLORS_BY_KEY[o.color]) state.color = o.color;
      if (o.steps >= 1 && o.steps <= 8) state.steps = o.steps;
    } catch (e) {}
  }

  /* ---------- 计时器 ---------- */
  var timer = (function () {
    var start = 0, running = false, raf = 0;
    function tick() {
      if (!running) return;
      els.timer.textContent = ((performance.now() - start) / 1000).toFixed(2);
      raf = requestAnimationFrame(tick);
    }
    function reset() {
      running = false; cancelAnimationFrame(raf);
      if (els.timer) els.timer.textContent = "0.00";
    }
    return {
      toggle: function () {
        if (running) { running = false; cancelAnimationFrame(raf); return; }
        running = true; start = performance.now(); tick();
      },
      reset: reset
    };
  })();

  /* ---------- 平面六面展开图（白顶绿前朝向） ---------- */
  function renderNet() {
    if (!els.net || !window.CubeArt) return;
    var cube = RubikCore.applyAlg(RubikCore.newCube(), (current ? current.moves : []).join(" "));
    els.net.innerHTML = "";
    els.net.appendChild(CubeArt.flatNet(cube));
  }

  /* ---------- 生成 ---------- */
  function gen() {
    if (!window.CrossSolver) return;
    var r = CrossSolver.generate(state.color, state.steps, MAX_LEN);
    if (!r) { els.scramble.textContent = "生成失败，请重试"; return; }
    current = r;

    els.scramble.textContent = r.moves.join(" ");
    els.scramble.classList.remove("is-pop");
    void els.scramble.offsetWidth;
    els.scramble.classList.add("is-pop");

    if (els.solText) {
      els.solText.textContent = r.solution.join(" ");
      els.solText.dataset.alg = r.solution.join(" ");
    }
    /* 解法面板的显示/隐藏状态跨打乱沿用：正在「看解法」时不因换打乱被打断，
       按钮文案与选中态始终与面板可见性保持一致。 */
    var show = !!(els.solution && !els.solution.hidden);
    if (els.solBtn) {
      markSeg(els.solBtn, show);
      els.solBtn.textContent = show ? "隐藏十字解法" : "显示十字解法";
    }

    renderNet();
    timer.reset();
  }

  /* ---------- 批量 10 个打乱 ---------- */
  function generateBatch() {
    if (!window.CrossSolver) return;
    var c = CrossSolver.COLORS_BY_KEY[state.color];
    var items = [];
    for (var i = 0; i < BATCH; i++) {
      var r = CrossSolver.generate(state.color, state.steps, MAX_LEN);
      if (r) items.push(r.moves.join(" "));
    }
    if (!items.length) { if (els.batchPanel) els.batchPanel.hidden = true; return; }

    els.batchList.innerHTML = "";
    items.forEach(function (moves, idx) {
      var li = el("li", "ct__batch-item");
      var no = el("span", "ct__batch-no", String(idx + 1));
      var f = el("span", "ct__batch-formula", moves);
      f.title = "点击复制";
      var btn = el("button", "btn btn--xs btn--ghost ct__batch-copy", "复制");
      btn.type = "button";
      li.appendChild(no);
      li.appendChild(f);
      li.appendChild(btn);
      f.addEventListener("click", function () { copy(moves); flash(f, "已复制 ✓"); });
      btn.addEventListener("click", function () { copy(moves); flash(btn, "已复制 ✓", "复制"); });
      els.batchList.appendChild(li);
    });

    els.batchTitle.textContent = "已生成 " + items.length + " 个「" + c.label + "色 · 最优 " + state.steps + " 步」打乱";
    els.batchPanel.hidden = false;
    if (els.batchBtn) markSeg(els.batchBtn, true);
  }
  function toggleBatch() {
    if (!els.batchPanel) return;
    if (els.batchPanel.hidden) { generateBatch(); }
    else { els.batchPanel.hidden = true; if (els.batchBtn) markSeg(els.batchBtn, false); }
  }

  /* ---------- 分段控件 ----------
     选中态用站内约定的 .is-active 类表达；aria-pressed 由 site-nav.js 的
     MutationObserver 跟随类名自动同步，这里同时显式设置一份，
     保证单独打开本页（无 site-nav.js）时依然正确。 */
  function markSeg(btn, on) {
    if (!btn) return;
    btn.classList.toggle("is-active", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function buildColors() {
    var box = els.colors;
    CrossSolver.COLORS.forEach(function (c) {
      var b = el("button", "seg__btn ct__color");
      b.type = "button";
      b.dataset.color = c.key;
      markSeg(b, c.key === state.color);
      b.appendChild(el("i", "ct__dot ct__dot--" + c.key));
      b.appendChild(el("span", null, c.label));
      b.addEventListener("click", function () { selectColor(c.key); });
      box.appendChild(b);
    });
  }
  function buildSteps() {
    var box = els.moves;
    for (var n = 1; n <= CrossSolver.MAX_STEPS; n++) {
      (function (n) {
        var b = el("button", "seg__btn ct__step", String(n));
        b.type = "button";
        b.dataset.step = String(n);
        markSeg(b, n === state.steps);
        b.addEventListener("click", function () { selectSteps(n); });
        box.appendChild(b);
      })(n);
    }
  }
  function paintSegs() {
    if (els.colors) {
      Array.prototype.forEach.call(els.colors.children, function (b) {
        markSeg(b, b.dataset.color === state.color);
      });
    }
    if (els.moves) {
      Array.prototype.forEach.call(els.moves.children, function (b) {
        markSeg(b, +b.dataset.step === state.steps);
      });
    }
  }
  function selectColor(k) { state.color = k; save(); paintSegs(); gen(); }
  function selectSteps(n) { state.steps = n; save(); paintSegs(); gen(); }

  /* ---------- 初始化 ---------- */
  function init() {
    els.scramble = $("ct-scramble");
    els.net = $("ct-net");
    els.timer = $("ct-timer");
    els.colors = $("ct-colors");
    els.moves = $("ct-moves");
    els.solution = $("ct-solution");
    els.solText = $("ct-sol-text");
    els.solBtn = $("ct-sol");
    els.batchBtn = $("ct-batch");
    els.batchPanel = $("ct-batch-panel");
    els.batchList = $("ct-batch-list");
    els.batchTitle = $("ct-batch-title");
    if (!els.scramble) return;
    if (!window.CrossSolver || !window.RubikCore || !window.CubeArt) {
      els.scramble.textContent = "求解器加载失败";
      return;
    }

    load();
    buildColors();
    buildSteps();
    paintSegs();

    $("ct-new").addEventListener("click", gen);

    els.solBtn.addEventListener("click", function () {
      var show = els.solution.hidden;
      els.solution.hidden = !show;
      markSeg(els.solBtn, show);
      els.solBtn.textContent = show ? "隐藏十字解法" : "显示十字解法";
    });

    els.solText.addEventListener("click", function () {
      copy(els.solText.dataset.alg || "");
      flash(els.solText, "已复制 ✓");
    });

    $("ct-copy").addEventListener("click", function () {
      var txt = current ? current.moves.join(" ") : "";
      copy(txt);
      flash(this, "已复制 ✓", "复制");
    });

    if (els.batchBtn) els.batchBtn.addEventListener("click", toggleBatch);
    var batchRefresh = $("ct-batch-refresh");
    if (batchRefresh) batchRefresh.addEventListener("click", generateBatch);

    document.addEventListener("keydown", function (e) {
      if (e.code !== "Space" && e.key !== " ") return;
      var t = e.target, tag = (t && t.tagName ? t.tagName : "").toLowerCase();
      if (tag === "button" || tag === "input" || tag === "a" ||
          tag === "select" || tag === "textarea" || tag === "summary") return;
      e.preventDefault();
      timer.toggle();
    });

    gen();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* 供冒烟测试使用 */
  window.__ct = {
    newCube: function () { return RubikCore.newCube(); },
    apply: function (c, m) { return RubikCore.apply(c, m); },
    scramble: function (n) { return RubikCore.scramble(n); },
    get current() { return current; },
    get state() { return state; },
    selectColor: function (k) { selectColor(k); },
    selectSteps: function (n) { selectSteps(n); },
    gen: function () { gen(); },
    generateBatch: function () { generateBatch(); }
  };
})();
