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
  var XS_BTN = "计算 XCROSS";  /* 按钮常驻文案：选中态只换 .is-active，不换字，
                                  避免出现「文案与面板可见性」两种状态源打架 */
  var XS_TIME = 1500;          /* XCROSS 求解时间预算（ms），超时则回退常规十字解 */

  /* orient = 拿法朝向：top/front 为颜色 key，默认白顶绿前（标准朝向，恒等变换） */
  var state = { color: "w", steps: 4, pair: "FR", orient: { top: "w", front: "g" } };
  var current = null;         /* 当前打乱结果（solution 为标准朝向解法） */
  var xcross = null;          /* 当前 XCROSS 结果；打乱一换即作废 */
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
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        color: state.color, steps: state.steps, pair: state.pair, orient: state.orient
      }));
    } catch (e) {}
  }
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      if (window.CrossSolver && CrossSolver.COLORS_BY_KEY[o.color]) state.color = o.color;
      if (o.steps >= 1 && o.steps <= 8) state.steps = o.steps;
      if (window.XCross && XCross.PAIR_BY_KEY[o.pair]) state.pair = o.pair;
      if (o.orient && window.Orient) {
        var t = o.orient.top, f = o.orient.front;
        if (Orient.COLOR_FACE[t] && Orient.COLOR_FACE[f] &&
            Orient.validFronts(t).indexOf(f) >= 0) {
          state.orient = { top: t, front: f };
        }
      }
    } catch (e) {}
  }

  /* ---------- 拿法朝向 ---------- */
  function cname(k) {
    var c = window.CrossSolver && CrossSolver.COLORS_BY_KEY[k];
    return c ? c.label : k;
  }

  function isStdOrient() {
    return state.orient.top === "w" && state.orient.front === "g";
  }
  /** 标准朝向解法 → 当前拿法解法（共轭变换 R·alg·R⁻¹）；恒等朝向直接返回。
      ⚠ 恒定返回数组（含空解 → []）：调用方统一 .join(" ")，
      否则「空解」会走成字符串分支，随后 .join 抛 TypeError。 */
  function orientedAlg(alg) {
    var arr = Array.isArray(alg) ? alg.slice()
      : String(alg == null ? "" : alg).trim().split(/\s+/).filter(Boolean);
    if (!arr.length) return [];
    if (!window.Orient || isStdOrient()) return arr;
    var map = Orient.mapFor(state.orient.top, state.orient.front);
    return map ? Orient.transform(arr, map) : arr;
  }
  /** 当前拿法下的解法（标准解法做共轭变换 R·alg·R⁻¹） */
  function orientedSolution() {
    if (!current || !current.solution) return [];
    return orientedAlg(current.solution);
  }
  /** 当前拿法下，目标十字所在的面（位置名） */
  function crossFaceAt() {
    if (!window.Orient) return "U";
    var map = Orient.mapFor(state.orient.top, state.orient.front);
    var stdFace = Orient.COLOR_FACE[state.color] || "U";
    return (map && map[stdFace]) || stdFace;
  }
  function orientText() {
    return cname(state.orient.top) + "顶 · " + cname(state.orient.front) + "前";
  }

  function buildOrient() {
    var top = $("ct-top"), front = $("ct-front");
    if (!top || !front || !window.Orient) return;
    window.CrossSolver.COLORS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.key; o.textContent = c.label + "顶";
      top.appendChild(o);
    });
    top.value = state.orient.top;
    fillFronts();
    top.addEventListener("change", function () {
      var k = top.value;
      if (Orient.validFronts(k).indexOf(state.orient.front) < 0) {
        state.orient.front = Orient.validFronts(k)[0];
      }
      state.orient.top = k;
      fillFronts(); save(); paintOrient(); renderSolution(); renderXCross();
    });
    front.addEventListener("change", function () {
      state.orient.front = front.value;
      save(); paintOrient(); renderSolution(); renderXCross();
    });
  }
  function fillFronts() {
    var front = $("ct-front");
    if (!front) return;
    var valid = Orient.validFronts(state.orient.top);
    front.innerHTML = "";
    valid.forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = cname(k) + "前";
      front.appendChild(o);
    });
    front.value = state.orient.front;
  }

  /** 刷新解法区（含变换后的解法、原解法对照、十字所在面提示） */
  function renderSolution() {
    if (!els.solText || !current) return;
    var alg = orientedSolution().join(" ");
    els.solText.textContent = alg;
    els.solText.dataset.alg = alg;

    if (els.solOri) els.solOri.textContent = isStdOrient() ? "" : "（" + orientText() + "）";
    if (els.solAlt) {
      if (isStdOrient()) els.solAlt.hidden = true;
      else {
        els.solAlt.hidden = false;
        els.solAlt.innerHTML = "";
        var b1 = el("b", null, "标准朝向（白顶 · 绿前）：");
        els.solAlt.appendChild(b1);
        els.solAlt.appendChild(document.createTextNode(current.solution.join(" ")));
      }
    }
    if (els.orientNote) {
      var face = crossFaceAt();
      var c = window.CrossSolver.COLORS_BY_KEY[state.color];
      els.orientNote.textContent = isStdOrient()
        ? "标准朝向：按下方打乱执行即可，解法为常规写法。"
        : "按标准朝向（白顶绿前）打乱后，转到「" + orientText() + "」再做十字；"
          + "此时" + (c ? c.label : "") + "十字做在 " + face + " 面（"
          + (window.Orient.POS_NAME[face] || face) + "）。";
    }
    if (els.orientPill) els.orientPill.textContent = orientText();
  }

  function paintOrient() {
    if ($("ct-top")) $("ct-top").value = state.orient.top;
    fillFronts();
  }

  /* ---------- XCROSS：十字 + 首对同时解掉 ---------- */
  function buildPairs() {
    if (!window.XCross || !els.pairs) return;
    window.XCross.PAIRS.forEach(function (p) {
      var b = el("button", "seg__btn ct__pair", p.key);
      b.type = "button";
      b.dataset.pair = p.key;
      b.title = p.label;               /* 短标签 FL/FR… 完整含义挂 title */
      markSeg(b, p.key === state.pair);
      b.addEventListener("click", function () { selectPair(p.key); });
      els.pairs.appendChild(b);
    });
  }

  /** 换了首对 ⇒ 旧结果立刻作废（结果只对「当前打乱 + 当前首对」成立） */
  function resetXCross(alsoMarkBtn) {
    xcross = null;
    if (els.xsSolution) els.xsSolution.hidden = true;
    if (els.xsText) { els.xsText.textContent = ""; delete els.xsText.dataset.alg; }
    if (els.xsAlt) els.xsAlt.hidden = true;
    if (els.xsOri) els.xsOri.textContent = "";
    if (els.xsBtn) {
      if (alsoMarkBtn !== false) markSeg(els.xsBtn, false);
      els.xsBtn.disabled = false;
      els.xsBtn.textContent = XS_BTN;
    }
  }
  function selectPair(k) {
    if (!window.XCross || !XCross.PAIR_BY_KEY[k]) return;
    state.pair = k;
    save();
    paintSegs();
    resetXCross();
  }

  /* IDA* 是同步阻塞的（最坏约 1.5s），先让浏览器把「计算中」画出来再开算。 */
  function requestXCross() {
    if (!els.xsBtn || !window.XCross || !current) return;
    if (!els.xsSolution || !els.xsSolution.hidden) { resetXCross(); return; }
    els.xsBtn.disabled = true;
    els.xsBtn.textContent = "计算中…";
    setTimeout(runXCross, 20);
  }

  function runXCross() {
    try { calcXCross(); }
    /* 求解一旦抛错，按钮会永久卡在「计算中…」—— 兜底必须把 UI 状态还原。 */
    catch (e) {
      if (els.xsBtn) { els.xsBtn.disabled = false; els.xsBtn.textContent = XS_BTN; }
      if (els.xsSolution) els.xsSolution.hidden = true;
      xcross = null;
      if (window.console) console.error("[cross-trainer] XCROSS 计算失败", e);
    }
  }

  function calcXCross() {
    if (!window.XCross || !current) { resetXCross(); return; }
    var moves = current.moves;
    if (!window.RubikCore) { resetXCross(); return; }
    var cube = RubikCore.applyAlg(RubikCore.newCube(), moves.join(" "));
    /* ⚠ 必须把打乱 original moves 一起交给求解器：十字起始编码由 moves
       正向步进推出，只给 cube 会被当成「十字已还原」，末态十字根本没还原。 */
    xcross = window.XCross.solveFromCube(cube, state.pair, {
      color: state.color,
      moves: moves,
      plainCross: (window.CrossSolver && CrossSolver.solve(state.color, moves)) || [],
      timeBudget: XS_TIME
    });
    renderXCross();
    if (els.xsBtn) {
      els.xsBtn.disabled = false;
      els.xsBtn.textContent = XS_BTN;
    }
  }

  function renderXCross() {
    if (!els.xsSolution || !els.xsText) return;
    if (!xcross) { els.xsSolution.hidden = true; return; }
    var stdAlg = (xcross.moves || []).join(" ");
    /* ⚠ 必须显式 join：非标准朝向下 orientedAlg 返回的是数组（Orient.transform
       的输出），直接赋给 textContent / dataset.alg 会被 Array.prototype.toString
       变成逗号分隔（"R,L',F"），页面上和复制出来的解法全带逗号。 */
    var alg = orientedAlg(stdAlg).join(" ");
    var note = xcross.note || "";

    els.xsText.textContent = (xcross.ok && !alg.length) ? "（已完成，无需再动）" : alg;
    els.xsText.dataset.alg = alg;
    els.xsSolution.hidden = false;
    markSeg(els.xsBtn, true);

    if (els.xsOri) els.xsOri.textContent = isStdOrient() ? "" : "（" + orientText() + "）";
    if (els.xsAlt) {
      if (!isStdOrient() && xcross.ok && alg.length) {
        /* 非标准拿法：给一句标准朝向原文，照抄时不用自己转 */
        els.xsAlt.hidden = false;
        els.xsAlt.innerHTML = "";
        els.xsAlt.appendChild(el("b", null, "标准朝向（白顶 · 绿前）："));
        els.xsAlt.appendChild(document.createTextNode(stdAlg));
      } else {
        els.xsAlt.hidden = false;
        els.xsAlt.innerHTML = "";
        els.xsAlt.appendChild(document.createTextNode(note));
      }
    }
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

    resetXCross();      /* 新打乱 ⇒ 旧 XCROSS 结果不再对应当前局面 */
    renderSolution();
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
    if (els.pairs) {
      Array.prototype.forEach.call(els.pairs.children, function (b) {
        markSeg(b, b.dataset.pair === state.pair);
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
    els.solOri = $("ct-sol-ori");
    els.solAlt = $("ct-sol-alt");
    els.pairs = $("ct-pairs");
    els.xsBtn = $("ct-xs");
    els.xsSolution = $("ct-xsolution");
    els.xsText = $("ct-xsol-text");
    els.xsOri = $("ct-xsol-ori");
    els.xsAlt = $("ct-xsol-alt");
    els.orientNote = $("ct-orient-note");
    els.orientPill = $("ct-orient-pill");
    if (!els.scramble) return;
    if (!window.CrossSolver || !window.RubikCore || !window.CubeArt) {
      els.scramble.textContent = "求解器加载失败";
      return;
    }

    load();
    buildColors();
    buildSteps();
    buildPairs();      /* XCROSS 首对（依赖 xcross-solver.js，缺失则整块功能缺席） */
    buildOrient();     /* 拿法朝向（依赖 orient.js，缺失则跳过，不影响原功能） */
    paintSegs();

    $("ct-new").addEventListener("click", gen);

    if (els.xsBtn) els.xsBtn.addEventListener("click", requestXCross);
    if (els.xsText) els.xsText.addEventListener("click", function () {
      copy(els.xsText.dataset.alg || "");
      flash(els.xsText, "已复制 ✓");
    });

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
    get xcross() { return xcross; },
    selectPair: function (k) { selectPair(k); },
    requestXCross: requestXCross,
    selectColor: function (k) { selectColor(k); },
    selectSteps: function (n) { selectSteps(n); },
    gen: function () { gen(); },
    generateBatch: function () { generateBatch(); },
    setOrient: function (t, f) {
      state.orient = { top: t, front: f };
      paintOrient(); save(); renderSolution(); renderXCross();
    },
    orient: function () { return state.orient; },
    orientedSolution: function () { return orientedSolution(); }
  };
})();
