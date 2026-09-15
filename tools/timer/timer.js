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
  /* 各项目在 csTimer 中的打乱类型标识（TXT 导入导出映射用） */
  var SCR_TYPE = { "3x3": "333", "2x2": "222" };
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

  /* 状态提示文案：idle 分支随「是否启用观察」变化 */
  function stateText() {
    if (state === "idle") {
      return opt.inspect > 0
        ? '按 <b>空格</b> 或点按此处开始（进入 ' + opt.inspect + " 秒观察）"
        : "长按 <b>空格</b> 预备 · 松开开始";
    }
    if (state === "inspect") return "观察中 · 长按 <b>空格</b> 预备";
    if (state === "ready") return "松开 <b>空格</b> 开始计时";
    if (state === "running") return "计时中 · 按 <b>空格</b> 停止";
    return "待确认 · 空格记录 / Esc 作废";
  }

  /* ---------- 工具 ---------- */
  function eventDef(key) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].key === key) return EVENTS[i];
    return EVENTS[0];
  }
  function solves() { return data[opt.event] || (data[opt.event] = []); }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  /* 统一成绩记录结构：{ ms, pen, date, src? }。
     src = 「无时间戳来源」的稳定标识（文件指纹 + 行号），让同一文件重复导入保持幂等。 */
  function normSolve(s) {
    if (!s || typeof s.ms !== "number" || !isFinite(s.ms)) return null;
    var o = {
      ms: Math.max(0, Math.round(s.ms)),
      pen: (s.pen === "+2" || s.pen === "DNF") ? s.pen : "",
      date: (typeof s.date === "number" && isFinite(s.date) && s.date > 0) ? s.date : Date.now()
    };
    if (typeof s.src === "string" && s.src) o.src = s.src;
    return o;
  }
  /* 合并去重指纹：有 src 用 src；否则用「成绩 + 罚时 + 时间」 */
  function solveSig(s) {
    return s.src ? "src|" + s.src : s.ms + "|" + s.pen + "|" + s.date;
  }

  /* ---------- 持久化 ---------- */
  function loadData() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_DATA) || "{}");
      ["3x3", "2x2"].forEach(function (k) {
        var arr = o[k];
        if (Array.isArray(arr)) {
          data[k] = arr.map(normSolve).filter(Boolean)
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

  /* 统计弹窗 / 导入映射弹窗打开时，主键盘逻辑让位给弹窗 */
  function strictModalOpen() {
    return (els.modal && !els.modal.hidden) || (els.mapModal && !els.mapModal.hidden);
  }

  function bindInput() {
    document.addEventListener("keydown", function (e) {
      var k = e.key || "", code = e.code || "";
      if (strictModalOpen()) return;
      if (els.exportMenu && !els.exportMenu.hidden) {          /* 导出菜单：只处理 Esc */
        if (code === "Escape" || k === "Escape") { e.preventDefault(); toggleExportMenu(false); }
        return;
      }
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
      if (strictModalOpen()) return;
      if (els.exportMenu && !els.exportMenu.hidden) return;
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
    els.state.innerHTML = stateText();
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

  /* 「观察」开关：15 秒 WCA 观察 ↔ 不用观察（空格直接起停） */
  function setInspect(v) {
    v = (parseInt(v, 10) === 0) ? 0 : 15;
    if (opt.inspect === v) return;
    opt.inspect = v;
    saveOpt();
    if (state === "inspect" || state === "ready") abortKey();   /* 中途切换不留脏状态 */
    Array.prototype.forEach.call(els.inspectSeg.children, function (c) {
      c.classList.toggle("is-active", c.dataset.inspect === String(opt.inspect));
    });
    paint();
  }
  function buildInspect() {
    els.inspectSeg.innerHTML = "";
    [["15", "15 秒观察"], ["0", "不用观察"]].forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg__btn" + (String(opt.inspect) === o[0] ? " is-active" : "");
      b.textContent = o[1];
      b.dataset.inspect = o[0];
      b.addEventListener("click", function () { setInspect(o[0]); b.blur(); });
      els.inspectSeg.appendChild(b);
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

  /* ---------- 下载 ---------- */
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2) +
      "_" + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ("0" + d.getSeconds()).slice(-2);
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- 导出 ---------- */
  var EXPORT_LABEL = "导出 ▾";

  /* ① JSON：本站完整备份（二阶 + 三阶，可原样导回） */
  function exportJson() {
    var payload = {
      app: "mrcube-timer",
      version: 1,
      exportedAt: new Date().toISOString(),
      events: data
    };
    download("timer-" + stamp() + ".json", JSON.stringify(payload, null, 2), "application/json");
    flashBtn(els.exportBtn, "已导出 ✓", EXPORT_LABEL);
  }

  /* ② csTimer 导出格式（cstimer.net「导出」产生的就是这个 txt，可双向互导）
     顶层：{ "session1": [...], "session2": [...], "properties": { sessionN, scrType } }
     单条：[ [penalty, timeMs], 打乱, 备注, 时间戳(秒) ]
     penalty：0 = OK，2000 = +2（毫秒），-1 = DNF。csTimer 内部按「旧 → 新」排列。 */
  function csTimerSolve(rec, scrType) {
    var pen = rec.pen === "DNF" ? -1 : (rec.pen === "+2" ? 2000 : 0);
    return [[pen, Math.round(rec.ms)], [scrType, "", 0], "", Math.round((rec.date || Date.now()) / 1000)];
  }
  function csTimerPayload() {
    var order = ["3x3", "2x2"];                       /* session1 = 三阶，session2 = 二阶 */
    var obj = {}, types = [];
    order.forEach(function (k, i) {
      obj["session" + (i + 1)] = (data[k] || []).slice().reverse().map(function (r) {
        return csTimerSolve(r, SCR_TYPE[k]);
      });
      types.push(SCR_TYPE[k]);
    });
    obj.properties = { sessionN: order.length, scrType: types };
    return obj;
  }
  function exportCsTimerTxt() {
    download("cstimer_" + stamp() + ".txt", JSON.stringify(csTimerPayload()));
    flashBtn(els.exportBtn, "已导出 ✓", EXPORT_LABEL);
  }

  /* ③ 纯时间列表（当前项目 · 每行一条 · 旧 → 新），可直接用本站导入回灌 */
  function plainText() {
    return solves().slice().reverse().map(function (r) {
      if (r.pen === "DNF") return "DNF";
      var s = (r.ms / 1000).toFixed(2);
      return r.pen === "+2" ? s + "+" : s;
    }).join("\r\n");
  }
  function exportPlainTxt() {
    download("times-" + opt.event + "-" + stamp() + ".txt", plainText());
    flashBtn(els.exportBtn, "已导出 ✓", EXPORT_LABEL);
  }

  /* ---------- 导入：解码 ---------- */
  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try { var a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; }
    }
    return null;
  }
  function isPenCode(v) { return v === 0 || v === -1 || v === 1 || v === 2 || v === 2000; }
  function isPlausibleMs(v) { return typeof v === "number" && isFinite(v) && v >= 500 && v < 36e5; }
  function penOf(p) {
    if (p === -1 || p === 2) return "DNF";      /* csTimer 用 -1；早期编码用 2 */
    if (p > 0) return "+2";                     /* csTimer 用 2000；早期编码用 1 */
    return "";
  }
  function tsToMs(ts) {
    if (typeof ts !== "number" || !isFinite(ts) || ts <= 0) return 0;
    if (ts > 1e11) return Math.round(ts);        /* 已是毫秒 */
    if (ts > 1e8) return Math.round(ts * 1000);  /* 秒（1973 年之后） */
    return 0;
  }
  /* 兼容三种单条成绩形态：
       [ [penalty, timeMs], 打乱, 备注, 时间戳 ]  ← csTimer 会话条目
       [penalty, timeMs]                          ← 扁平条目 / 直接粘贴的会话数组
       { ms, pen, date }                          ← 本站 JSON 导出                     */
  function parseCsTimerSolves(raw) {
    var arr = toArray(raw);
    if (!arr || !arr.length) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i], inner = null, ts = null;
      if (typeof e === "number") inner = [0, e];
      else if (Array.isArray(e)) {
        if (Array.isArray(e[0])) { inner = e[0]; ts = e[3]; }
        else if (typeof e[0] === "number") { inner = e; ts = (typeof e[2] === "number" ? e[2] : null); }
        else continue;
      } else if (e && typeof e === "object" && typeof e.ms === "number") {
        var o0 = normSolve(e);
        if (o0) out.push(o0);
        continue;
      } else continue;

      if (!inner || typeof inner[1] !== "number" || !isFinite(inner[1])) continue;
      var p = inner[0], t = inner[1];
      if (isPenCode(t) && isPlausibleMs(p)) { var tmp = p; p = t; t = tmp; }   /* 防御：两字段颠倒 */
      var s = normSolve({ ms: t, pen: penOf(p), date: tsToMs(ts) });
      if (s) out.push(s);
    }
    return out;
  }
  /* 按会话拆分 csTimer 导出文件；非该格式返回 null */
  function parseCsTimerExport(obj) {
    var keys = Object.keys(obj).filter(function (k) { return /^session\d+$/.test(k); });
    if (!keys.length) return null;
    var props = (obj.properties && typeof obj.properties === "object") ? obj.properties : {};
    var maxIdx = 0;
    keys.forEach(function (k) { maxIdx = Math.max(maxIdx, parseInt(k.slice(7), 10) || 0); });
    var n = parseInt(props.sessionN, 10);
    if (!isFinite(n) || n < maxIdx) n = maxIdx;
    var scrTypes = Array.isArray(props.scrType) ? props.scrType : [];
    var names = Array.isArray(props.sessionName) ? props.sessionName : [];
    var sessions = [];
    for (var i = 1; i <= n; i++) {
      var list = parseCsTimerSolves(obj["session" + i]);
      if (!list.length) continue;
      var st = scrTypes[i - 1], nm = names[i - 1];
      if (Array.isArray(st)) st = st[0];
      sessions.push({
        idx: i,
        scrType: (st == null ? "" : String(st)),
        name: (typeof nm === "string" ? nm : ""),
        solves: list,
        guess: guessEvent(st, nm)
      });
    }
    return sessions.length ? sessions : null;
  }
  /* 会话 → 项目：先看 csTimer 打乱类型，再看会话名 */
  function guessEvent(scrType, name) {
    var s = String(scrType || "").toLowerCase(), n = String(name || "");
    if (/^222/.test(s) || /2x2|二阶/.test(n)) return "2x2";
    if (/^333/.test(s) || /3x3|三阶/.test(n)) return "3x3";
    if (/^(ll|oll|pll|zbl?|cmll|coll|lse|2gen|3gen|f2l|lsll|ls|roux|eoline|eocross|sbrx|mt|cross|edges|corners|half|easy|rru|ni|oh|fm|zb|wv|eo|dr)/.test(s)) return "3x3";
    return "";
  }
  /* 纯文本文件指纹（保证同一文件重复导入幂等） */
  function hash32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  /* 解析入口：返回 { csTimer: sessions } 或 { events: {...} } 或 null */
  function parseImport(txt) {
    var obj = null;
    try { obj = JSON.parse(txt); } catch (e) { obj = null; }

    /* ① csTimer 导出文件 → 交给映射弹窗确认分组归属 */
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      var cs = parseCsTimerExport(obj);
      if (cs) return { csTimer: cs };
    }

    var out = { "3x3": [], "2x2": [] }, hasEvent = false;

    if (obj && obj.events && typeof obj.events === "object") {
      ["3x3", "2x2"].forEach(function (k) {
        if (Array.isArray(obj.events[k])) {
          out[k] = obj.events[k].map(normSolve).filter(Boolean);
          if (out[k].length) hasEvent = true;
        }
      });
    } else if (obj && Array.isArray(obj.solves)) {
      out[opt.event] = obj.solves.map(normSolve).filter(Boolean);
      hasEvent = out[opt.event].length > 0;
    } else if (Array.isArray(obj)) {
      out[opt.event] = parseCsTimerSolves(obj);      /* 裸数组：可能是直接粘贴的会话数组 */
      hasEvent = out[opt.event].length > 0;
    } else {
      /* 纯文本：每行一条，支持 12.34 / 12.34+ / 1:23.45 / DNF，可带行首序号（1. 1) #1 -） */
      var arr = [];
      txt.split(/\r?\n/).forEach(function (raw) {
        var line = raw.replace(/,/g, ".").trim();
        if (!line) return;
        if (/^dnf$/i.test(line) || /\bdnf\b/i.test(line)) { arr.push({ ms: 0, pen: "DNF", date: 0 }); return; }
        /* 序号后必须跟空白，否则 "12.34" 会被当成「12. 34」截断 */
        var body = line.replace(/^\s*#?\d+\s*(?:[)\]\-–—]|\.)\s+/, "").replace(/^\s*#\d+\s+/, "");
        var plus = /\+/.test(body);
        body = body.replace(/\+/g, " ");
        var m = body.match(/(\d+):(\d{1,3}(?:\.\d+)?)/);          /* 分:秒 */
        var sec = m ? parseInt(m[1], 10) * 60 + parseFloat(m[2])
                    : parseFloat((body.match(/\d+(?:\.\d+)?/) || [])[0]);
        if (!isFinite(sec) || sec <= 0) return;
        arr.push({ ms: Math.round(sec * 1000), pen: plus ? "+2" : "", date: 0 });
      });
      if (arr.length) {
        var h = hash32(txt);
        arr.forEach(function (s, i) { s.src = h + ":" + i; });   /* 无时间戳 → 用文件指纹做身份 */
        out[opt.event] = arr;
        hasEvent = true;
      }
    }
    return hasEvent ? { events: out } : null;
  }

  /* ---------- 导入：合并（多重集合去重，同秒/同名成绩不会被误删） ---------- */
  function mergeEvents(incoming) {
    var total = 0, now = Date.now();
    ["3x3", "2x2"].forEach(function (k) {
      var inc = incoming[k];
      if (!inc || !inc.length) return;
      var remaining = {};
      data[k].forEach(function (s) {
        var sig = solveSig(s);
        remaining[sig] = (remaining[sig] || 0) + 1;
      });
      inc.forEach(function (s, i) {
        s = normSolve(s);
        if (!s) return;
        if (s.src) s.date = now + i;               /* 无真实时间戳 → 用当前时间并保持行序 */
        var sig = solveSig(s);
        if (remaining[sig] > 0) { remaining[sig]--; return; }
        data[k].push(s);
        total++;
      });
      data[k].sort(function (a, b) { return b.date - a.date; });
    });
    if (total) { saveData(); renderStrip(); renderList(); }
    return total;
  }

  function notifyImport(added) {
    if (!added) window.alert("没有新增成绩（文件中的成绩已全部存在）。");
    else window.alert("导入完成：新增 " + added + " 条成绩（按成绩与时间合并去重）。");
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = parseImport(String(reader.result || "")); } catch (e) { parsed = null; }
      if (!parsed) {
        window.alert("导入失败：无法解析文件内容。\n支持 csTimer 导出的 .txt、本站导出的 .json，以及每行一个时间的纯文本。");
        return;
      }
      if (parsed.csTimer) { openMapDialog(parsed.csTimer); return; }
      notifyImport(mergeEvents(parsed.events));
    };
    reader.readAsText(file);
  }

  /* ---------- 导入：分组映射弹窗 ---------- */
  var pendingSessions = null;

  function openMapDialog(sessions) {
    pendingSessions = sessions;
    els.mapRows.innerHTML = "";
    sessions.forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "tm-map__row";

      var name = document.createElement("span");
      name.className = "tm-map__name";
      name.textContent = "会话 " + s.idx + (s.name ? " · " + s.name : "") +
                         (s.scrType ? "（" + s.scrType + "）" : "");

      var cnt = document.createElement("span");
      cnt.className = "tm-map__n";
      cnt.textContent = s.solves.length + " 次";

      var sel = document.createElement("select");
      sel.className = "input tm-map__sel";
      sel.dataset.i = String(i);
      sel.setAttribute("aria-label", "会话 " + s.idx + " 导入到哪个项目");
      [["", "忽略"], ["3x3", "三阶"], ["2x2", "二阶"]].forEach(function (o) {
        var op = document.createElement("option");
        op.value = o[0];
        op.textContent = o[1];
        sel.appendChild(op);
      });
      sel.value = s.guess || "";
      sel.addEventListener("change", updateMapSum);

      row.appendChild(name);
      row.appendChild(cnt);
      row.appendChild(sel);
      els.mapRows.appendChild(row);
    });
    updateMapSum();
    els.mapModal.hidden = false;
    if (els.mapOk && els.mapOk.focus) els.mapOk.focus();
  }

  function pickedSessions() {
    var out = [];
    if (!pendingSessions) return out;
    var sels = els.mapRows.querySelectorAll(".tm-map__sel");
    Array.prototype.forEach.call(sels, function (sel) {
      if (!sel.value) return;
      var s = pendingSessions[parseInt(sel.dataset.i, 10)];
      if (s) out.push({ event: sel.value, solves: s.solves });
    });
    return out;
  }

  function updateMapSum() {
    var picks = pickedSessions(), n = 0, labels = [];
    picks.forEach(function (p) {
      n += p.solves.length;
      var lab = eventDef(p.event).label;
      if (labels.indexOf(lab) < 0) labels.push(lab);
    });
    els.mapSum.textContent = n
      ? "将向 " + labels.join(" / ") + " 导入 " + n + " 条成绩"
      : "未选择任何分组";
  }

  function closeMapDialog() {
    els.mapModal.hidden = true;
    pendingSessions = null;
  }

  function confirmMapImport() {
    var picks = pickedSessions();
    var events = { "3x3": [], "2x2": [] };
    picks.forEach(function (p) { events[p.event] = events[p.event].concat(p.solves); });
    closeMapDialog();
    if (!picks.length) return;
    notifyImport(mergeEvents(events));
  }

  /* ---------- 导出菜单 ---------- */
  function toggleExportMenu(on) {
    if (!els.exportMenu) return;
    var open = (on == null) ? els.exportMenu.hidden : !!on;
    els.exportMenu.hidden = !open;
    els.exportBtn.setAttribute("aria-expanded", open ? "true" : "false");
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
      statsBtn: $("tm-stats"), exportBtn: $("tm-export"), exportMenu: $("tm-export-menu"),
      importBtn: $("tm-import"),
      importFile: $("tm-import-file"), clearBtn: $("tm-clear"),
      modal: $("tm-modal"), modalClose: $("tm-modal-close"), modalEvent: $("tm-modal-event"),
      statGrid: $("tm-stat-grid"), chartDaily: $("tm-chart-daily"),
      chartTrend: $("tm-chart-trend"), chartDist: $("tm-chart-dist"),
      inspectSeg: $("tm-inspect-seg"),
      mapModal: $("tm-map"), mapRows: $("tm-map-rows"), mapSum: $("tm-map-sum"),
      mapOk: $("tm-map-ok"), mapCancel: $("tm-map-cancel")
    };
    if (!els.stage) return;

    loadData(); loadOpt();

    buildInspect();
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
      if (e.key !== "Escape" && e.code !== "Escape") return;
      if (!els.modal.hidden) { e.stopPropagation(); closeStats(); return; }
      if (!els.mapModal.hidden) { e.stopPropagation(); closeMapDialog(); }
    }, true);

    els.exportBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleExportMenu();
      els.exportBtn.blur();
    });
    els.exportMenu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-exp]");
      if (!b) return;
      toggleExportMenu(false);
      if (b.dataset.exp === "cstimer") exportCsTimerTxt();
      else if (b.dataset.exp === "txt") exportPlainTxt();
      else exportJson();
      b.blur();
    });
    document.addEventListener("click", function (e) {
      if (els.exportMenu.hidden) return;
      if (e.target === els.exportBtn || els.exportMenu.contains(e.target)) return;
      toggleExportMenu(false);
    });

    els.importBtn.addEventListener("click", function () { els.importFile.click(); });
    els.importFile.addEventListener("change", function () {
      importFile(els.importFile.files && els.importFile.files[0]);
      els.importFile.value = "";
    });
    els.mapCancel.addEventListener("click", closeMapDialog);
    els.mapOk.addEventListener("click", confirmMapImport);
    els.mapModal.addEventListener("click", function (e) {
      if (e.target.dataset && e.target.dataset.close) closeMapDialog();
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
    get inspect() { return opt.inspect; },
    get mapOpen() { return !!(els.mapModal && !els.mapModal.hidden); },
    get exportMenuOpen() { return !!(els.exportMenu && !els.exportMenu.hidden); },
    press: press, release: release,
    setEvent: function (k) { opt.event = k; buildEvents(); next(true); },
    setInspect: setInspect,
    addSolve: function (ms, pen) {
      solves().unshift({ ms: ms, pen: pen || "", date: Date.now() });
      saveData(); renderStrip(); renderList();
    },
    clear: function () { data["3x3"] = []; data["2x2"] = []; saveData(); renderStrip(); renderList(); },
    stats: function () { return S.sessionStats(solves()); },
    openStats: openStats, closeStats: closeStats,
    exportPayload: function () { return { app: "mrcube-timer", version: 1, events: data }; },
    csTimerPayload: csTimerPayload,     /* csTimer TXT 导出的对象结构（测试用） */
    plainText: plainText,               /* 纯时间列表 TXT 内容（测试用） */
    parseImport: parseImport,
    mergeEvents: mergeEvents,
    mergeTxt: function (txt) {          /* 解析并直接合并（csTimer 文件按猜测自动映射；测试用） */
      var p = parseImport(txt);
      if (!p) return -1;
      if (!p.csTimer) return mergeEvents(p.events);
      var ev = { "3x3": [], "2x2": [] };
      p.csTimer.forEach(function (s) { if (s.guess) ev[s.guess] = ev[s.guess].concat(s.solves); });
      return mergeEvents(ev);
    },
    openMap: function (txt) {           /* 打开导入映射弹窗（测试用） */
      var p = parseImport(txt);
      if (!p || !p.csTimer) return false;
      openMapDialog(p.csTimer);
      return true;
    },
    mapRows: function () {
      var out = [];
      Array.prototype.forEach.call(els.mapRows.querySelectorAll(".tm-map__row"), function (row) {
        out.push({
          name: row.querySelector(".tm-map__name").textContent,
          n: row.querySelector(".tm-map__n").textContent,
          value: row.querySelector(".tm-map__sel").value
        });
      });
      return out;
    },
    setMapChoice: function (i, ev) {
      var sel = els.mapRows.querySelectorAll(".tm-map__sel")[i];
      if (sel) { sel.value = ev; updateMapSum(); }
    },
    mapSum: function () { return els.mapSum.textContent; },
    confirmMap: confirmMapImport,
    toggleExportMenu: toggleExportMenu
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
