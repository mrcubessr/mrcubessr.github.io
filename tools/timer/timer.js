/* =========================================================
   tools/timer/timer.js — 计时器主逻辑（csTimer 风格）
   依赖：scramble.js（打乱）、stats.js（统计与图表）、cfop-ui.js（主题切换）

   状态机：idle → inspect → ready → running → confirm → idle
     idle    按空格：有观察→进入观察；无观察→进入预备（长按）
     inspect 15 秒倒计时（8s 黄 / 12s 红 / 超 15s +2 / 超 17s DNF）
             长按空格 ≥300ms → ready（变绿）
     ready   松开空格 → running
     running 按空格 → confirm（停止并等待确认）
     confirm 空格/回车 = 记录并下一把；Esc = 作废
   ========================================================= */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var S = window.TimerStats;
  if (!S) { return; }

  var HOLD_MS = 300;
  var MAX_ROWS = 500;                 /* 列表最多渲染行数（性能保护） */
  var EVENTS = [
    { key: "3x3", label: "三阶", len: 20 },
    { key: "2x2", label: "二阶", len: 11 }
  ];
  var LS_DATA = "timer_data_v1";
  var LS_OPT = "timer_options_v1";

  var els = {};
  var state = "idle";
  var holding = false, holdTimer = 0, raf = 0;
  var inspectStart = 0, runStart = 0;
  var pendingPenalty = "";
  var rawMs = 0;                      /* 未加罚时的原始用时 */
  var curScramble = "";

  var opt = { event: "3x3", manual: false, inspect: 15, manualText: "" };
  var data = { "3x3": [], "2x2": [] };

  var STATE_TEXT = {
    idle: '按 <b>空格</b> 或点按此处开始',
    inspect: "观察中 · 长按 <b>空格</b> 预备",
    ready: "松开 <b>空格</b> 开始计时",
    running: "计时中 · 按 <b>空格</b> 停止",
    confirm: "待确认 · 空格记录 / Esc 作废"
  };

  /* ---------- 工具 ---------- */
  function eventDef(key) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].key === key) return EVENTS[i];
    return EVENTS[0];
  }
  function solves() { return data[opt.event] || (data[opt.event] = []); }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  /* ---------- 持久化 ---------- */
  function loadData() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_DATA) || "{}");
      ["3x3", "2x2"].forEach(function (k) {
        var arr = o[k];
        if (Array.isArray(arr)) {
          data[k] = arr.filter(function (s) { return s && typeof s.ms === "number" && isFinite(s.ms); })
            .map(function (s) {
              return {
                ms: Math.max(0, Math.round(s.ms)),
                pen: (s.pen === "+2" || s.pen === "DNF") ? s.pen : "",
                date: typeof s.date === "number" ? s.date : Date.now()
              };
            })
            .sort(function (a, b) { return b.date - a.date; });   /* 保证「最新在前」 */
        }
      });
    } catch (e) { /* 忽略损坏数据 */ }
  }
  function saveData() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(data)); } catch (e) {}
  }
  function loadOpt() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_OPT) || "{}");
      if (eventDef(o.event).key === o.event) opt.event = o.event;
      if (o.inspect === 0 || o.inspect === 15) opt.inspect = o.inspect;
      if (typeof o.manualText === "string") opt.manualText = o.manualText;
    } catch (e) {}
  }
  function saveOpt() {
    try { localStorage.setItem(LS_OPT, JSON.stringify(opt)); } catch (e) {}
  }

  /* ---------- 打乱 ---------- */
  function newScramble() {
    if (opt.manual) { renderScramble(); return; }
    var def = eventDef(opt.event);
    var moves = window.TimerScramble ? window.TimerScramble.gen(opt.event, def.len)
                                     : ["R", "U", "R'", "U'"];
    curScramble = moves.join(" ");
    renderScramble();
  }
  function renderScramble() {
    if (!els.scramble) return;
    els.scramble.textContent = curScramble || "—";
    els.scramble.classList.remove("is-pop");
    void els.scramble.offsetWidth;
    els.scramble.classList.add("is-pop");
  }

  /* ---------- 计时状态机 ---------- */
  function stopRaf() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function startInspect() {
    state = "inspect";
    inspectStart = performance.now();
    pendingPenalty = "";
    els.time.textContent = String(opt.inspect);
    inspectTick();
    paint();
  }

  function inspectTick() {
    if (state !== "inspect") return;
    var left = opt.inspect - (performance.now() - inspectStart) / 1000;
    var warn = false, danger = false;
    if (left > 0) {
      els.time.textContent = String(Math.ceil(left));
      warn = left <= 8; danger = left <= 3;
    } else if (left > -2) {
      els.time.textContent = "+2";
      pendingPenalty = "+2"; danger = true;
    } else {
      els.time.textContent = "DNF";
      pendingPenalty = "DNF"; danger = true;
    }
    els.stage.classList.toggle("is-warn", warn);
    els.stage.classList.toggle("is-danger", danger);
    els.pen.hidden = !pendingPenalty;
    if (pendingPenalty) els.pen.textContent = pendingPenalty;
    raf = requestAnimationFrame(inspectTick);
  }

  function toReady() {
    if (state !== "inspect" && state !== "idle") return;
    clearTimeout(holdTimer);
    stopRaf();
    state = "ready";
    els.time.textContent = "0.00";
    paint();
  }

  function startRun() {
    if (state !== "ready") return;
    /* 观察超时罚时（以真正开始计时的时刻为准） */
    if (inspectStart) {
      var over = (performance.now() - inspectStart) / 1000 - opt.inspect;
      if (over > 2) pendingPenalty = "DNF";
      else if (over > 0) pendingPenalty = "+2";
      else pendingPenalty = "";
    } else {
      pendingPenalty = "";
    }
    state = "running";
    runStart = performance.now();
    els.pen.hidden = !pendingPenalty;
    if (pendingPenalty) els.pen.textContent = pendingPenalty;
    runTick();
    paint();
  }

  function runTick() {
    if (state !== "running") return;
    els.time.textContent = S.fmt(performance.now() - runStart);
    raf = requestAnimationFrame(runTick);
  }

  function stop() {
    if (state !== "running") return;
    stopRaf();
    rawMs = performance.now() - runStart;
    state = "confirm";
    showConfirm();
    paint();
  }

  function discard() {
    stopRaf();
    rawMs = 0;
    pendingPenalty = "";
    state = "idle";
    if (els.confirm) els.confirm.hidden = true;
    next(true);
  }

  function confirmOk() {
    if (state !== "confirm") return;
    var entry = { ms: Math.round(rawMs), pen: pendingPenalty || "", date: Date.now() };
    solves().unshift(entry);
    saveData();
    rawMs = 0;
    pendingPenalty = "";
    if (els.confirm) els.confirm.hidden = true;
    next(false);
  }

  function togglePenalty(p) {
    if (state !== "confirm") return;
    pendingPenalty = pendingPenalty === p ? "" : p;
    showConfirm();
  }

  function showConfirm() {
    var eff = pendingPenalty === "DNF" ? Infinity
            : rawMs + (pendingPenalty === "+2" ? 2000 : 0);
    els.time.textContent = pendingPenalty === "DNF" ? "DNF" : S.fmt(eff);
    els.confirm.hidden = false;
    els.confirmTime.textContent = pendingPenalty === "DNF" ? "DNF"
      : S.fmt(eff) + (pendingPenalty === "+2" ? "（含 +2）" : "");
    els.btnPlus2.classList.toggle("is-on", pendingPenalty === "+2");
    els.btnDnf.classList.toggle("is-on", pendingPenalty === "DNF");
  }

  function next(keepState) {
    stopRaf();
    inspectStart = 0;
    pendingPenalty = "";
    state = "idle";
    els.time.textContent = "0.00";
    if (!opt.manual) newScramble();
    paint();
    renderStrip();
    renderList();
  }

  /* ---------- 按键 / 指针 ---------- */
  function press() {
    if (holding) return;
    holding = true;
    if (state === "idle") {
      if (opt.inspect > 0) startInspect(); else toReady();
      return;
    }
    if (state === "inspect") { holdTimer = setTimeout(toReady, HOLD_MS); return; }
    if (state === "running") { stop(); return; }
    if (state === "confirm") { confirmOk(); return; }
  }
  function release() {
    holding = false;
    clearTimeout(holdTimer);
    if (state === "ready") startRun();
  }
  function abortKey() {
    if (state === "confirm") { discard(); return; }
    if (state === "running" || state === "inspect" || state === "ready") {
      stopRaf();
      state = "idle";
      pendingPenalty = "";
      inspectStart = 0;
      els.time.textContent = "0.00";
      if (els.confirm) els.confirm.hidden = true;
      paint();
    }
  }

  function isFormTarget(t) {
    var tag = t && t.tagName ? t.tagName.toLowerCase() : "";
    return tag === "input" || tag === "select" || tag === "textarea";
  }

  function bindInput() {
    document.addEventListener("keydown", function (e) {
      var k = e.key || "", code = e.code || "";
      if (els.modal && !els.modal.hidden) return;     /* 统计弹窗打开时不接管按键 */
      if (isFormTarget(e.target)) {
        if (code === "Escape" || k === "Escape") e.target.blur();
        return;
      }
      if (code === "Space" || code === "Spacebar" || k === " " || k === "Spacebar" ||
          code === "Enter" || k === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        press();
        return;
      }
      if (code === "Escape" || k === "Escape" || k === "Esc") { e.preventDefault(); abortKey(); return; }
      if ((k === "n" || k === "N") && (state === "idle" || state === "confirm")) {
        e.preventDefault();
        if (state === "confirm") discard(); else next(false);
      }
    });
    document.addEventListener("keyup", function (e) {
      var k = e.key || "", code = e.code || "";
      if (els.modal && !els.modal.hidden) return;
      if (isFormTarget(e.target)) return;
      if (code === "Space" || code === "Spacebar" || k === " " || k === "Spacebar" ||
          code === "Enter" || k === "Enter") {
        e.preventDefault();
        release();
      }
    });

    els.stage.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      press();
    });
    window.addEventListener("pointerup", function () { release(); });
    window.addEventListener("pointercancel", function () { release(); });
  }

  /* ---------- 渲染 ---------- */
  function paint() {
    var st = els.stage.classList;
    st.remove("is-inspect", "is-ready", "is-running", "is-stopped", "is-warn", "is-danger");
    if (state === "inspect") st.add("is-inspect");
    else if (state === "ready") st.add("is-ready");
    else if (state === "running") st.add("is-running");
    else if (state === "confirm") st.add("is-stopped");
    els.state.innerHTML = STATE_TEXT[state] || "";
    if (state !== "inspect" && state !== "confirm") {
      els.pen.hidden = !pendingPenalty;
      if (pendingPenalty) els.pen.textContent = pendingPenalty;
    }
  }

  function renderStrip() {
    var arr = solves(), s = S.sessionStats(arr);
    els.kCount.textContent = s.count;
    els.kBest.textContent = s.best == null ? "--" : S.fmt(s.best);
    els.kBest.classList.toggle("is-best", s.best != null);
    setAvgEl(els.kAo5, s.ao5);
    setAvgEl(els.kAo12, s.ao12);
    setAvgEl(els.kAo100, s.ao100);
  }
  function setAvgEl(el, v) {
    if (v == null) { el.textContent = "--"; el.classList.remove("is-dnf"); return; }
    if (v === Infinity) { el.textContent = "DNF"; el.classList.add("is-dnf"); return; }
    el.textContent = S.fmt(v); el.classList.remove("is-dnf");
  }

  function renderList() {
    var arr = solves(), list = els.list;
    list.innerHTML = "";
    var has = arr.length > 0;
    els.empty.hidden = has;
    els.listHead.hidden = !has;
    if (!has) return;

    var show = Math.min(arr.length, MAX_ROWS);
    var s = S.sessionStats(arr);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < show; i++) {
      var rec = arr[i], v = S.val(rec);
      var li = document.createElement("li");
      li.className = "tm-list__item";

      var idx = document.createElement("span");
      idx.className = "tm-list__idx";
      idx.textContent = "#" + (arr.length - i);

      var t = document.createElement("span");
      t.className = "tm-list__t";
      if (rec.pen === "DNF") { t.textContent = "DNF"; t.classList.add("is-dnf"); }
      else {
        t.textContent = S.fmt(v) + (rec.pen === "+2" ? "+" : "");
        if (rec.pen === "+2") t.classList.add("is-plus");
        else if (v === s.best) t.classList.add("is-best");
        else if (v === s.worst) t.classList.add("is-worst");
      }

      li.appendChild(idx);
      li.appendChild(t);
      li.appendChild(avgCell(S.avgN(arr, 5, i)));
      li.appendChild(avgCell(S.avgN(arr, 12, i)));
      li.appendChild(avgCell(S.avgN(arr, 100, i)));

      var del = document.createElement("button");
      del.type = "button"; del.className = "tm-list__del"; del.textContent = "✕";
      del.title = "删除该次成绩";
      del.setAttribute("aria-label", "删除该次成绩");
      (function (index) {
        del.addEventListener("click", function () {
          var a = solves(); a.splice(index, 1);
          saveData(); renderStrip(); renderList();
        });
      })(i);
      li.appendChild(del);

      frag.appendChild(li);
    }
    list.appendChild(frag);
  }
  function avgCell(v) {
    var sp = document.createElement("span");
    sp.className = "tm-list__a";
    if (v == null) { sp.textContent = "—"; return sp; }
    if (v === Infinity) { sp.textContent = "DNF"; sp.classList.add("is-dnf"); return sp; }
    sp.textContent = S.fmt(v);
    return sp;
  }

  /* ---------- 事件切换 / 打乱来源 ---------- */
  function buildEvents() {
    els.events.innerHTML = "";
    EVENTS.forEach(function (ev) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg__btn" + (ev.key === opt.event ? " is-active" : "");
      b.textContent = ev.label;
      b.dataset.event = ev.key;
      b.addEventListener("click", function () {
        if (opt.event === ev.key) return;
        opt.event = ev.key; saveOpt();
        Array.prototype.forEach.call(els.events.children, function (c) {
          c.classList.toggle("is-active", c.dataset.event === opt.event);
        });
        next(false);
      });
      els.events.appendChild(b);
    });
  }

  function setManual(on, silent) {
    opt.manual = !!on; saveOpt();
    Array.prototype.forEach.call(els.manualSeg.children, function (c) {
      c.classList.toggle("is-active", c.dataset.manual === (on ? "1" : "0"));
    });
    els.manualBox.hidden = !on;
    els.newBtn.hidden = !!on;
    if (on) {
      els.manualInput.value = curScramble || "";
    } else if (!silent) {
      newScramble();
    }
  }

  /* ---------- 统计弹窗 ---------- */
  function openStats() {
    var arr = solves(), s = S.sessionStats(arr);
    els.modalEvent.textContent = eventDef(opt.event).label;
    var cells = [
      ["次数", String(s.count)],
      ["有效次数", String(s.valid)],
      ["单次最好", s.best == null ? "--" : S.fmt(s.best), s.best != null],
      ["单次最差", s.worst == null ? "--" : (s.worst === Infinity ? "DNF" : S.fmt(s.worst))],
      ["平均", s.mean == null ? "--" : S.fmt(s.mean)],
      ["当前 ao5", avgText(s.ao5)],
      ["当前 ao12", avgText(s.ao12)],
      ["当前 ao100", avgText(s.ao100)],
      ["最好 ao5", s.bestAo5 == null ? "--" : S.fmt(s.bestAo5), s.bestAo5 != null],
      ["最好 ao12", s.bestAo12 == null ? "--" : S.fmt(s.bestAo12), s.bestAo12 != null],
      ["最好 ao100", s.bestAo100 == null ? "--" : S.fmt(s.bestAo100), s.bestAo100 != null]
    ];
    var html = "";
    cells.forEach(function (c) {
      html += '<div class="tm-cell"><span class="tm-cell__k">' + c[0] + '</span>' +
              '<span class="tm-cell__v' + (c[2] ? " is-best" : "") + '">' + c[1] + "</span></div>";
    });
    els.statGrid.innerHTML = html;

    els.chartDaily.innerHTML = S.dailyChart(arr);
    els.chartTrend.innerHTML = S.trendChart(arr);
    els.chartDist.innerHTML = S.distChart(arr);
    els.modal.hidden = false;
    if (els.modalClose && els.modalClose.focus) els.modalClose.focus();
  }
  function avgText(v) {
    if (v == null) return "--";
    return v === Infinity ? "DNF" : S.fmt(v);
  }
  function closeStats() { els.modal.hidden = true; }

  /* ---------- 导入 / 导出 ---------- */
  function exportData() {
    var payload = {
      app: "mrcube-timer",
      version: 1,
      exportedAt: new Date().toISOString(),
      events: data
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var d = new Date();
    var stamp = d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) +
                "-" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2);
    a.href = url;
    a.download = "timer-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    flashBtn(els.exportBtn, "已导出 ✓", "导出");
  }

  function parseImport(txt) {
    var obj = null;
    try { obj = JSON.parse(txt); } catch (e) { obj = null; }
    var out = { "3x3": [], "2x2": [] }, hasEvent = false;

    function norm(s) {
      if (!s || typeof s.ms !== "number" || !isFinite(s.ms)) return null;
      return {
        ms: Math.max(0, Math.round(s.ms)),
        pen: (s.pen === "+2" || s.pen === "DNF") ? s.pen : "",
        date: typeof s.date === "number" ? s.date : Date.now()
      };
    }

    if (obj && obj.events && typeof obj.events === "object") {
      ["3x3", "2x2"].forEach(function (k) {
        if (Array.isArray(obj.events[k])) {
          out[k] = obj.events[k].map(norm).filter(Boolean);
          if (out[k].length) hasEvent = true;
        }
      });
    } else if (obj && Array.isArray(obj.solves)) {
      out[opt.event] = obj.solves.map(norm).filter(Boolean);
      hasEvent = out[opt.event].length > 0;
    } else if (Array.isArray(obj)) {
      out[opt.event] = obj.map(norm).filter(Boolean);
      hasEvent = out[opt.event].length > 0;
    } else {
      /* 纯文本：每行一个时间（秒）→ 导入当前项目 */
      var arr = [];
      txt.split(/\r?\n/).forEach(function (line) {
        line = line.replace(/,/g, ".").trim();
        if (!line) return;
        var dnf = /dnf/i.test(line);
        var v = parseFloat(line.replace(/[^\d.]/g, ""));
        if (dnf) { arr.push({ ms: 0, pen: "DNF", date: Date.now() }); return; }
        if (isFinite(v) && v > 0) arr.push({ ms: Math.round(v * 1000), pen: "", date: Date.now() });
      });
      if (arr.length) { out[opt.event] = arr; hasEvent = true; }
    }
    return hasEvent ? out : null;
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = parseImport(String(reader.result || "")); } catch (e) { parsed = null; }
      if (!parsed) { window.alert("导入失败：无法解析文件内容。"); return; }
      var totalNew = 0;
      ["3x3", "2x2"].forEach(function (k) {
        var incoming = parsed[k];
        if (!incoming || !incoming.length) return;
        var seen = {};
        data[k].forEach(function (s) { seen[s.ms + "|" + s.pen + "|" + s.date] = 1; });
        incoming.forEach(function (s) {
          var sig = s.ms + "|" + s.pen + "|" + s.date;
          if (seen[sig]) return;
          seen[sig] = 1;
          data[k].push(s);
          totalNew++;
        });
        data[k].sort(function (a, b) { return b.date - a.date; });
      });
      saveData(); renderStrip(); renderList();
      window.alert("导入完成：新增 " + totalNew + " 条成绩（已按时间合并去重）。");
    };
    reader.readAsText(file);
  }

  function clearEvent() {
    var arr = solves();
    if (!arr.length) return;
    if (!window.confirm("确定清空「" + eventDef(opt.event).label + "」的 " + arr.length + " 条成绩吗？此操作不可撤销。")) return;
    data[opt.event] = [];
    saveData(); renderStrip(); renderList();
    flashBtn(els.clearBtn, "已清空 ✓", "清空本组");
  }

  function flashBtn(btn, txt, back) {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = txt;
    setTimeout(function () { btn.textContent = old || back; }, 1000);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    els = {
      stage: $("tm-stage"), time: $("tm-time"), state: $("tm-state"), pen: $("tm-pen"),
      scramble: $("tm-scramble"), newBtn: $("tm-new"), copyBtn: $("tm-copy"),
      events: $("tm-events"), manualSeg: $("tm-manual-seg"), manualBox: $("tm-manual-box"),
      manualInput: $("tm-manual-input"), manualApply: $("tm-manual-apply"),
      confirm: $("tm-confirm"), confirmTime: $("tm-confirm-time"),
      btnOk: $("tm-confirm-ok"), btnPlus2: $("tm-confirm-plus2"),
      btnDnf: $("tm-confirm-dnf"), btnDrop: $("tm-confirm-drop"),
      strip: $("tm-strip"), kCount: $("k-count"), kBest: $("k-best"),
      kAo5: $("k-ao5"), kAo12: $("k-ao12"), kAo100: $("k-ao100"),
      list: $("tm-list"), listWrap: $("tm-list-wrap"), empty: $("tm-empty"),
      listHead: document.querySelector(".tm-list-head"),
      statsBtn: $("tm-stats"), exportBtn: $("tm-export"), importBtn: $("tm-import"),
      importFile: $("tm-import-file"), clearBtn: $("tm-clear"),
      modal: $("tm-modal"), modalClose: $("tm-modal-close"), modalEvent: $("tm-modal-event"),
      statGrid: $("tm-stat-grid"), chartDaily: $("tm-chart-daily"),
      chartTrend: $("tm-chart-trend"), chartDist: $("tm-chart-dist"),
      inspectSel: $("tm-inspect")
    };
    if (!els.stage) return;

    loadData(); loadOpt();

    els.inspectSel.value = String(opt.inspect);
    els.inspectSel.addEventListener("change", function () {
      opt.inspect = parseInt(els.inspectSel.value, 10) === 0 ? 0 : 15;
      saveOpt();
    });

    buildEvents();
    setManual(false, true);
    els.manualSeg.addEventListener("click", function (e) {
      var b = e.target.closest("[data-manual]");
      if (!b) return;
      if (b.dataset.manual === "1") { setManual(true); els.manualInput.focus(); }
      else { setManual(false); }
      b.blur();
    });
    els.manualApply.addEventListener("click", function () {
      curScramble = els.manualInput.value.trim();
      opt.manualText = curScramble; saveOpt();
      renderScramble();
      els.manualApply.blur();
    });
    els.manualInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); els.manualApply.click(); }
    });
    els.manualInput.addEventListener("input", function () {
      opt.manualText = els.manualInput.value; saveOpt();
    });

    els.newBtn.addEventListener("click", function () { newScramble(); els.newBtn.blur(); });
    els.copyBtn.addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(curScramble).catch(function () {});
      flashBtn(els.copyBtn, "已复制 ✓", "复制");
      els.copyBtn.blur();
    });

    els.btnOk.addEventListener("click", function () { confirmOk(); this.blur(); });
    els.btnPlus2.addEventListener("click", function () { togglePenalty("+2"); this.blur(); });
    els.btnDnf.addEventListener("click", function () { togglePenalty("DNF"); this.blur(); });
    els.btnDrop.addEventListener("click", function () { discard(); this.blur(); });

    els.statsBtn.addEventListener("click", function () { openStats(); els.statsBtn.blur(); });
    els.modalClose.addEventListener("click", closeStats);
    els.modal.addEventListener("click", function (e) {
      if (e.target.dataset && e.target.dataset.close) closeStats();
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.code === "Escape") && !els.modal.hidden) {
        e.stopPropagation();
        closeStats();
      }
    }, true);

    els.exportBtn.addEventListener("click", exportData);
    els.importBtn.addEventListener("click", function () { els.importFile.click(); });
    els.importFile.addEventListener("change", function () {
      importFile(els.importFile.files && els.importFile.files[0]);
      els.importFile.value = "";
    });
    els.clearBtn.addEventListener("click", clearEvent);

    bindInput();

    curScramble = opt.manual ? opt.manualText : "";
    if (opt.manual) els.manualInput.value = opt.manualText;
    next(true);
  }

  /* 供冒烟测试使用 */
  window.__tm = {
    get state() { return state; },
    get event() { return opt.event; },
    get solves() { return solves().slice(); },
    get scramble() { return curScramble; },
    press: press, release: release,
    setEvent: function (k) { opt.event = k; buildEvents(); next(true); },
    addSolve: function (ms, pen) {
      solves().unshift({ ms: ms, pen: pen || "", date: Date.now() });
      saveData(); renderStrip(); renderList();
    },
    clear: function () { data["3x3"] = []; data["2x2"] = []; saveData(); renderStrip(); renderList(); },
    stats: function () { return S.sessionStats(solves()); },
    openStats: openStats, closeStats: closeStats,
    exportPayload: function () { return { app: "mrcube-timer", version: 1, events: data }; },
    parseImport: parseImport
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
