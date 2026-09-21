/* =========================================================
   tools/timer/timer.js — 计时器主逻辑（csTimer 风格 · 分组版）
   依赖：scramble.js（打乱）、stats.js（统计与图表）、cfop-ui.js（主题切换）

   状态机：idle → inspect → ready → running → confirm → idle
     idle    按空格：有观察→进入观察；无观察→进入预备（长按）
     inspect 15 秒倒计时（8s 黄 / 12s 红 / 超 15s +2 / 超 17s DNF）
             长按空格 ≥300ms → ready（变绿）
     ready   松开空格 → running
     running 按空格 → confirm（停止并等待确认）
     confirm 空格/回车 = 记录并下一把；Esc = 作废

   分组 = csTimer 的「会话 / Session」：
     data[项目] = { groups: [{ id, name, solves }], cur: 分组 id }
     统计（次数 / 最好 / ao5 / ao12 / ao100）与成绩列表都只针对「当前分组」。
     csTimer 导出文件里的每个会话 → 导入时各成一个分组，分组名取会话名。

   csTimer 数据格式（读其源码 src/js/stats/stats.js 确认）：
     顶层  { "session1": [条目…], "session2": …, "properties": {…} }
     条目  [ [penalty, timeMs], 打乱, 备注, 时间戳(秒) ]
           penalty：0 = OK，2000 = +2，-1 = DNF
     会话打乱类型**不在** properties.scrType 里，而在
           properties.sessionData（JSON 字符串）的 [i].opt.scrType，默认 '333' 时被省略。
           即：某一会话没有 scrType ⇒ 它就是三阶（csTimer 默认值被省略）。
     sessionData[i] = { name, opt: { scrType, … }, rank, stat: [总数, DNF数, 均值], date: [首, 末] }
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
    { key: "2x2", label: "二阶", len: 11 },
    { key: "bld", label: "三盲", len: 20 }
  ];
  /* 各项目在 csTimer 中的打乱类型标识（TXT 导入导出映射用）；三盲无对应类型，不进 csTimer TXT */
  var SCR_TYPE = { "3x3": "333", "2x2": "222" };
  var LS_DATA = "timer_data_v2";      /* 分组模型 */
  var LS_DATA_V1 = "timer_data_v1";   /* 旧版扁平模型（只读，用于迁移） */
  var LS_OPT = "timer_options_v1";

  var els = {};
  var state = "idle";
  var holding = false, holdTimer = 0, raf = 0;
  var ARM_MS = 350;               /* 长按启动阈值：低于此时间的点按/误触不触发计时 */
  var pressX = 0, pressY = 0;     /* 记录按下坐标，滑动（滚动）则取消，避免误触 */
  var viewingSolve = false, viewingSolveNum = 0;  /* 正在查看某把历史解法 */
  var viewingScramble = "";           /* 回放中：该把成绩的打乱公式 */
  var liveScramble = "";              /* 当前（非回放）这一把的打乱，退出回放时还原用 */
  var inspectStart = 0, runStart = 0;
  var pendingPenalty = "";
  var memoMs = 0, memoMarked = false;     /* 三盲分段计时：记忆用时 / 是否已标记 */
  var pendingDnfReason = "";              /* DNF 归因：memo 记忆错 / exec 执行错 / other 其他 */
  var rawMs = 0;                      /* 未加罚时的原始用时 */
  var curScramble = "";
  var curBld = null;                  /* 当前打乱对应的三盲解法（readCodes 结果） */

  var opt = { event: "3x3", manual: false, inspect: 15, manualText: "", bld: null, bldCollapsed: true };
  /* 速拧的「观察」偏好：三盲会临时把 opt.inspect 压成 0，切回速拧时用它还原 */
  var speedInspect = 15;

  /* ---------- 三盲默认参数（与 bld-engine 默认值一致） ---------- */
  function defaultBld() {
    var d = (window.BLDEngine && window.BLDEngine.DEFAULTS) || {
      orientation: 0, edgeBuffer: "A", edgeOrder: "GECIKMOQSWY",
      edgeOrientFlag: false, edgeSkip: false,
      cornerBuffer: "J", cornerOrder: "GADXWRO",
      cornerOrientFlag: false, cornerSkip: false
    };
    var o = {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) o[k] = d[k];
    o.len = 20;
    o.split = true;                    /* 记忆 / 执行 分段计时（可关） */
    o.steps = normSteps(null);         /* 各类公式平均步数（TPS 估算用） */
    o.showAfter = true;                /* 三盲解法默认“计时后才显示”，便于复盘（可改为立即显示） */
    return o;
  }

  /* 步数配置归一化：缺失或非法的项回落到引擎默认值 */
  function normSteps(s) {
    var d = (window.BLDEngine && window.BLDEngine.STEP_DEFAULTS) ||
            { edge: 9, corner: 10, flip: 8, twist: 11, parity: 15 };
    var out = {}, k;
    for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
    if (s && typeof s === "object") {
      for (k in out) if (Object.prototype.hasOwnProperty.call(out, k)) {
        var v = Number(s[k]);
        if (isFinite(v) && v > 0) out[k] = v;
      }
    }
    return out;
  }

  /* ---------- 数据模型 ---------- */
  var data = { "3x3": null, "2x2": null, "bld": null };

  function uid(p) {
    return (p || "g") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function mkGroup(name, id) {
    return {
      id: (typeof id === "string" && id) ? id : uid("g"),
      name: (name != null && String(name)) || "分组",
      solves: []
    };
  }
  function emptyBox() { var g = mkGroup("默认分组"); return { groups: [g], cur: g.id }; }
  function newestFirst(a, b) { return b.date - a.date; }

  function eventBox(k) { var b = data[k]; if (!b) { b = data[k] = emptyBox(); } return b; }
  function groupsOf(k) { return eventBox(k).groups; }
  function curGroup(k) {
    var box = eventBox(k || opt.event);
    for (var i = 0; i < box.groups.length; i++) if (box.groups[i].id === box.cur) return box.groups[i];
    box.cur = box.groups[0].id;
    return box.groups[0];
  }
  function solves() { return curGroup(opt.event).solves; }
  function allSolves(k) {
    var out = [];
    groupsOf(k).forEach(function (g) { out = out.concat(g.solves); });
    return out;
  }
  function findGroup(k, name) {
    var t = String(name || "").trim().toLowerCase();
    if (!t) return null;
    var gs = groupsOf(k);
    for (var i = 0; i < gs.length; i++) if (gs[i].name.trim().toLowerCase() === t) return gs[i];
    return null;
  }

  /* ---------- 工具 ---------- */
  function eventDef(key) {
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].key === key) return EVENTS[i];
    return EVENTS[0];
  }
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
    /* 三盲成绩携带解法（解法由 BLDEngine 计算，结构固定，原样保留） */
    if (s.bld && typeof s.bld === "object") {
      o.bld = {
        scramble: typeof s.bld.scramble === "string" ? s.bld.scramble : "",
        orientation: typeof s.bld.orientation === "number" ? s.bld.orientation : 0,
        orientationLabel: typeof s.bld.orientationLabel === "string" ? s.bld.orientationLabel : "",
        edgeBuffer: s.bld.edgeBuffer, edgeOrder: s.bld.edgeOrder,
        edgeOrientFlag: !!s.bld.edgeOrientFlag, edgeSkip: !!s.bld.edgeSkip,
        cornerBuffer: s.bld.cornerBuffer, cornerOrder: s.bld.cornerOrder,
        cornerOrientFlag: !!s.bld.cornerOrientFlag, cornerSkip: !!s.bld.cornerSkip,
        edge: s.bld.edge, flip: s.bld.flip, corner: s.bld.corner, twist: s.bld.twist,
        parity: typeof s.bld.parity === "number" ? s.bld.parity : 0,
        complexity: typeof s.bld.complexity === "number" ? s.bld.complexity : 0,
        difficulty: normDiff(s.bld.difficulty),
        /* 指标与 DNF 归因也要留存，否则刷新后回看历史会丢 TPS / DNF 标记 */
        metrics: (s.bld.metrics && typeof s.bld.metrics === "object") ? s.bld.metrics : undefined,
        dnfReason: typeof s.bld.dnfReason === "string" ? s.bld.dnfReason : ""
      };
    }
    return o;
  }
  /* 合并去重指纹：有 src 用 src；否则用「成绩 + 罚时 + 时间」 */
  function solveSig(s) {
    return s.src ? "src|" + s.src : s.ms + "|" + s.pen + "|" + s.date;
  }

  /* ---------- 持久化 ---------- */
  function normBox(raw) {
    var groups = [];
    if (raw && Array.isArray(raw.groups)) {
      raw.groups.forEach(function (g) {
        if (!g || typeof g !== "object") return;
        var o = mkGroup(g.name, g.id);
        o.solves = (Array.isArray(g.solves) ? g.solves : []).map(normSolve).filter(Boolean).sort(newestFirst);
        groups.push(o);
      });
    }
    if (!groups.length) groups = [mkGroup("默认分组")];
    var cur = (raw && groups.some(function (g) { return g.id === raw.cur; })) ? raw.cur : groups[0].id;
    return { groups: groups, cur: cur };
  }
  function migrateV1(old) {
    var out = {};
    ["3x3", "2x2"].forEach(function (k) {
      var box = emptyBox();
      box.groups[0].solves = (Array.isArray(old[k]) ? old[k] : [])
        .map(normSolve).filter(Boolean).sort(newestFirst);
      out[k] = box;
    });
    return out;
  }
  function loadData() {
    var done = false;
    try {
      var raw = JSON.parse(localStorage.getItem(LS_DATA) || "null");
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        data = { "3x3": normBox(raw["3x3"]), "2x2": normBox(raw["2x2"]), "bld": normBox(raw["bld"]) };
        done = true;
      }
    } catch (e) { /* 忽略损坏数据 */ }
    if (done) return;
    var old = null;
    try { old = JSON.parse(localStorage.getItem(LS_DATA_V1) || "null"); } catch (e) {}
    if (old && typeof old === "object" && !Array.isArray(old)) {
      data = migrateV1(old);
      data["bld"] = emptyBox();
      saveData();                     /* 迁移结果写入 v2；v1 原样保留作兜底 */
    } else {
      data = { "3x3": emptyBox(), "2x2": emptyBox(), "bld": emptyBox() };
    }
  }
  function saveData() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(data)); } catch (e) {}
  }
  function loadOpt() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_OPT) || "{}");
      if (eventDef(o.event).key === o.event) opt.event = o.event;
      if (o.inspect === 0 || o.inspect === 15) { opt.inspect = o.inspect; speedInspect = o.inspect; }
      if (typeof o.manualText === "string") opt.manualText = o.manualText;
      if (o.bld && typeof o.bld === "object") {
        var merged = defaultBld();
        for (var k in o.bld) if (Object.prototype.hasOwnProperty.call(o.bld, k)) merged[k] = o.bld[k];
        merged.orientation = parseInt(merged.orientation, 10) || 0;
        merged.len = clamp(parseInt(merged.len, 10) || 20, 12, 30);
        merged.split = o.bld.split !== false;
        merged.steps = normSteps(o.bld.steps);
        merged.showAfter = o.bld.showAfter !== false;
        opt.bld = merged;
      } else {
        opt.bld = defaultBld();
      }
      /* 参数面板默认收起（设定一次即可，不必一直显示） */
      opt.bldCollapsed = (typeof o.bldCollapsed === "boolean") ? o.bldCollapsed : true;
    } catch (e) {
      opt.bld = defaultBld();
    }
    if (!opt.bld) opt.bld = defaultBld();
  }
  function saveOpt() {
    try { localStorage.setItem(LS_OPT, JSON.stringify(opt)); } catch (e) {}
  }

  /* ---------- 打乱 ---------- */
  function newScramble() {
    if (opt.manual && opt.event !== "bld") { liveScramble = curScramble; renderScramble(); return; }
    if (opt.event === "bld") {
      if (!opt.bld) opt.bld = defaultBld();
      var len = clamp(parseInt(opt.bld.len, 10) || 20, 12, 30);
      /* 三盲用三阶 WCA 风格打乱；解法按用户坐标系算出（不进 csTimer TXT 导出） */
      curScramble = window.TimerScramble
        ? window.TimerScramble.gen("3x3", len).join(" ")
        : ["R", "U", "R'", "U'", "F2", "L", "D'"].join(" ");
      liveScramble = curScramble;   /* 记下“当前这一把”，回放退出时用它还原 */
      computeBld();
      renderScramble();
      return;
    }
    var def = eventDef(opt.event);
    var moves = window.TimerScramble ? window.TimerScramble.gen(opt.event, def.len)
                                     : ["R", "U", "R'", "U'"];
    curScramble = moves.join(" ");
    liveScramble = curScramble;
    renderScramble();
  }
  function renderScramble() {
    if (!els.scramble) return;
    /* 每个转法作为独立 token，配合 CSS flex-wrap 实现整齐换行 */
    var moves = (curScramble || "").split(/\s+/).filter(Boolean);
    els.scramble.innerHTML = moves.length
      ? moves.map(function (m) { return '<span class="tm-mv">' + m + "</span>"; }).join("")
      : "—";
    els.scramble.classList.remove("is-pop");
    void els.scramble.offsetWidth;
    els.scramble.classList.add("is-pop");
  }

  /* ---------- 三盲：解法计算与展示 ---------- */
  function computeBld() {
    /* 回放历史中：curScramble 是那一把的历史打乱，不能拿来重算/覆盖当前解法 */
    if (viewingSolve) return;
    curBld = null;
    if (opt.event !== "bld" || !window.BLDEngine || !curScramble) { renderBld(); return; }
    try { curBld = window.BLDEngine.readCodes(curScramble, opt.bld); }
    catch (e) { curBld = null; }
    renderBld();
  }

  /* 难度字段归一化（导入旧数据/外部数据时容错） */
  function normDiff(d) {
    if (!d || typeof d !== "object") return null;
    return {
      edgeLetters: +d.edgeLetters || 0, flipLetters: +d.flipLetters || 0,
      cornerLetters: +d.cornerLetters || 0, twistLetters: +d.twistLetters || 0,
      edgeF: +d.edgeF || 0, flipF: +d.flipF || 0,
      cornerF: +d.cornerF || 0, twistF: +d.twistF || 0,
      parityF: +d.parityF || 0, borrow: +d.borrow || 0,
      borrowEdge: +d.borrowEdge || 0, borrowCorner: +d.borrowCorner || 0,
      edgeCycles: +d.edgeCycles || 0, cornerCycles: +d.cornerCycles || 0,
      total: +d.total || 0, score: +d.score || 0,
      level: typeof d.level === "string" ? d.level : "",
      notation: typeof d.notation === "string" ? d.notation : ""
    };
  }

  /* 展开图：用 cube-net.js 绘制。坐标朝向只影响展开图，不影响编码（编码已与朝向解耦） */
  function renderBldNet() {
    if (!els.bldNet) return;
    var cap = els.bldNetCap;
    if (opt.event !== "bld" || !curBld) { if (cap) cap.textContent = "展开图"; return; }
    if (typeof window.drawScrambleNet !== "function") {
      if (cap) cap.textContent = "展开图（渲染库未加载）";
      return;
    }
    try {
      window.drawScrambleNet(curBld.orientedScramble, els.bldNet, "white-green");
      if (cap) cap.textContent = curBld.orientationLabel + " 展开图";
    } catch (e) {
      if (cap) cap.textContent = "展开图渲染失败";
    }
  }

  /* 难度指标：主记法（棱X+角Y[+1]）+ 总公式数 + 等级 + 明细 chip
     d = difficulty 对象；complexity 由调用方传入（当前打乱或历史成绩各自的编码数） */
  function renderBldDiff(d, complexity) {
    if (!els.bldDiff) return;
    if (!d) { els.bldDiff.innerHTML = ""; return; }
    var chips = [];
    chips.push('<span class="tm-chip tm-chip--brand">棱 ' + d.edgeF + " 条</span>");
    chips.push('<span class="tm-chip">角 ' + d.cornerF + " 条</span>");
    if (d.flipF) chips.push('<span class="tm-chip">翻色 ' + d.flipF + " 条</span>");
    if (d.twistF) chips.push('<span class="tm-chip">角翻 ' + d.twistF + " 条</span>");
    if (d.parityF) chips.push('<span class="tm-chip tm-chip--warn">奇偶 +1</span>');
    /* 借位次数拆分为「棱借位 / 角借位」，便于看清记忆负担来自哪一类 */
    if (d.borrowEdge) chips.push('<span class="tm-chip tm-chip--warn">棱借位 ' + d.borrowEdge + " 次</span>");
    if (d.borrowCorner) chips.push('<span class="tm-chip tm-chip--warn">角借位 ' + d.borrowCorner + " 次</span>");
    if (!d.borrowEdge && !d.borrowCorner) chips.push('<span class="tm-chip">无借位</span>');
    els.bldDiff.innerHTML =
      '<div class="tm-bld__diff-top">' +
        '<span class="tm-bld__diff-notation">' + (d.notation || "") + "</span>" +
        '<span class="tm-bld__diff-lv" data-lv="' + d.level + '">' + d.level + "</span>" +
      "</div>" +
      '<div class="tm-bld__diff-sub">共 <b>' + d.total + "</b> 条公式 · 记忆分 <b>" + d.score +
        "</b>" + (complexity != null ? " · 编码 " + complexity + " 码" : "") + "</div>" +
      '<div class="tm-bld__chips">' + chips.join("") + "</div>";
  }

  function renderBld() {
    if (viewingSolve) return;   /* 回放中：解法面板由回放数据驱动，别被当前打乱覆盖 */
    if (opt.event !== "bld" || !els.bldRows) return;
    if (!curBld) {
      els.bldRows.innerHTML = '<div class="tm-bld__empty">无法计算解法（请检查参数或刷新页面）</div>';
      if (els.bldMeta) els.bldMeta.textContent = "";
      if (els.bldDiff) els.bldDiff.innerHTML = "";
      renderBldNet();
      updateBldReveal();
      return;
    }
    renderBldFrom(curBld);
    updateBldReveal();
  }

  /* 渲染任意一份解法数据（当前打乱的 curBld，或历史成绩里存下来的 rec.bld）。
     历史查看时只改这里的数据源，不影响当前打乱与计时。 */
  function renderBldFrom(b) {
    if (!els.bldRows) return;
    var _pf = (opt.bld && opt.bld.parityFlip) || "none";
    var _parityTxt = "偶";
    if (b.parity === 1) {
      _parityTxt = _pf === "edge" ? "奇偶带翻棱" : _pf === "corner" ? "奇偶带翻角" : "奇";
    }
    var rows = [
      ["棱读码", b.edge || "—"],
      ["棱翻色", b.flip || "—"],
      ["角读码", b.corner || "—"],
      ["角翻色", b.twist || "—"],
      ["奇偶", _parityTxt]
    ];
    var html = "";
    rows.forEach(function (r) {
      html += '<div class="tm-bld__row"><span class="tm-bld__k">' + r[0] + "</span>" +
              '<span class="tm-bld__v tm-bld__v--mono">' + (typeof r[1] === "string" ? r[1] : String(r[1])) + "</span></div>";
    });
    els.bldRows.innerHTML = html;
    if (els.bldMeta) {
      els.bldMeta.textContent = (b.orientationLabel || "") + " · " +
        (b.difficulty ? b.difficulty.total + " 条 / " + b.difficulty.level : "");
    }
    renderBldNetFrom(b);
    renderBldDiff(b.difficulty, b.complexity);
  }

  /* 历史成绩的展开图：用存下来的 orientation + scramble 还原朝向后的打乱再绘制 */
  function renderBldNetFrom(b) {
    if (!els.bldNet) return;
    var cap = els.bldNetCap;
    if (!b || !b.orientedScramble) { if (cap) cap.textContent = "展开图"; return; }
    if (typeof window.drawScrambleNet !== "function") {
      if (cap) cap.textContent = "展开图（渲染库未加载）";
      return;
    }
    try {
      window.drawScrambleNet(b.orientedScramble, els.bldNet, "white-green");
      if (cap) cap.textContent = (b.orientationLabel || "") + " 展开图";
    } catch (e) {
      if (cap) cap.textContent = "展开图渲染失败";
    }
  }

  /* 三盲解法面板的显隐：默认“计时后才显示”（复盘用），也可在参数里设为“立即显示”。
     showAfter=true 时：仅在计时完成（state=confirm）后显示；立即显示时随时可见。 */
  function updateBldReveal() {
    if (opt.event !== "bld" || !els.bld) { if (els.bld) els.bld.hidden = true; return; }
    var showAfter = !opt.bld || opt.bld.showAfter !== false;
    var show = !showAfter || state === "confirm";
    if (!viewingSolve) els.bld.hidden = !show;   /* 查看历史时强制显示，不受显示时机限制 */
  }

  /* 点击历史成绩 → 整块打乱区（公式 + 展开图）切换为该把的打乱，解法面板同步显示那一把的解法。
     顶部出现「正在回放 #N · 返回当前」条；退出后打乱区还原为当前打乱。 */
  function viewSolveBld(rec, num) {
    if (!rec || !rec.bld) return;
    var b = rec.bld;
    var oriented = "";
    if (window.BLDEngine && window.BLDEngine.CUBE_ORIENTATIONS) {
      var idx = b.orientation | 0;
      var pre = (window.BLDEngine.CUBE_ORIENTATIONS[idx] || {}).prefix || "";
      oriented = (pre + " " + (b.scramble || "")).trim().replace(/\s+/g, " ");
    }
    var viewObj = {
      edge: b.edge, flip: b.flip, corner: b.corner, twist: b.twist, parity: b.parity,
      orientationLabel: b.orientationLabel, complexity: b.complexity,
      difficulty: b.difficulty, orientedScramble: oriented
    };
    viewingSolve = true; viewingSolveNum = num;
    viewingScramble = b.scramble || "";
    /* ① 顶部打乱公式整块换成那一把（走同一套 render，换行/配色一致） */
    curScramble = viewingScramble;
    renderScramble();
    /* ② 解法面板显示那一把的解法（内部会一并重绘展开图），并强制展开 */
    renderBldFrom(viewObj);
    if (els.bld) els.bld.hidden = false;
    /* ③ 打乱区置为回放态：出返回条、把「换打乱」换成「换这一把」 */
    setReplayUI(true, num, b.dnfReason);
  }
  /* 打乱区的回放态 / 当前态切换 */
  function setReplayUI(on, num, dnfReason) {
    var blk = els.scrambleBlock || els.scramble;
    if (els.replayBar) els.replayBar.hidden = !on;
    if (on && els.replayTxt) {
      els.replayTxt.innerHTML = "正在回放 <b>#" + num + "</b> 的打乱与解法" +
        (dnfReason ? '<span class="tm-replay-bar__dnf">DNF</span>' : "");
    }
    if (blk && blk.classList) blk.classList.toggle("is-replaying", !!on);
    if (els.newBtn) els.newBtn.textContent = on ? "换这一把" : "换打乱";
    if (els.copyBtn) {
      els.copyBtn.textContent = on ? "复制这一把" : "复制";
      els.copyBtn.title = on ? "复制该把成绩的打乱公式" : "复制当前打乱公式";
    }
  }
  /* 仅复位回放状态（不还原打乱），用于「接下来马上就要换新打乱」的场景 */
  function clearSolveView() {
    if (!viewingSolve) return;
    viewingSolve = false; viewingSolveNum = 0;
    viewingScramble = "";
    setReplayUI(false);
  }
  /* 退出回放并把打乱区还原为「当前这一把」（不重新生成打乱，避免看一眼历史就丢掉当前打乱） */
  function exitSolveView() {
    if (!viewingSolve) return;
    clearSolveView();
    curScramble = liveScramble;
    renderScramble();
    if (opt.event === "bld") computeBld(); else renderBld();
  }
  /* 转法串 → 便于换行的 token 片段 */
  function fmtMoves(str) {
    var moves = String(str || "").split(/\s+/).filter(Boolean);
    if (!moves.length) return "—";
    return moves.map(function (m) { return '<span class="tm-mv">' + m + "</span>"; }).join("");
  }

  /* 事件切换时显隐三盲专属 UI（参数面板 / 解法面板 / 统计弹窗分析段 / 隐藏「手动输入」） */
  function applyEventUI() {
    var isBld = opt.event === "bld";
    exitSolveView();   /* 切换项目时退出“查看历史解法”状态 */
    if (els.bldParams) els.bldParams.hidden = !isBld;
    if (els.bldAnalysis) els.bldAnalysis.hidden = !isBld;
    manualSegs().forEach(function (seg) { seg.hidden = isBld; });
    if (els.bldNetSide) els.bldNetSide.hidden = !isBld;   /* 展开图与打乱公式同处显示 */
    if (isBld && els.manualBox) els.manualBox.hidden = true;
    /* 三盲不需要 15 秒观察（盲拧靠记忆，观察无意义）→ 隐藏该选项并强制关闭；
       切回速拧时还原用户原本的观察偏好 */
    if (els.inspectLabel) els.inspectLabel.hidden = isBld;
    if (els.inspectSeg) els.inspectSeg.hidden = isBld;
    if (els.settingsInspectWrap) els.settingsInspectWrap.hidden = isBld;
    if (els.settingsManualWrap) els.settingsManualWrap.hidden = isBld;
    setInspect(isBld ? 0 : speedInspect, true);
    if (isBld) applyBldCollapse();                        /* 恢复上次收起/展开状态 */
    updateBldReveal();                                    /* 解法面板按显示时机显隐 */
  }

  /* 三盲参数面板：收起后只留一行摘要，点标题展开 */
  function applyBldCollapse() {
    var collapsed = opt.bldCollapsed !== false;
    if (!els.bldParams) return;
    els.bldParams.classList.toggle("is-collapsed", collapsed);
    if (els.bldBody) els.bldBody.hidden = collapsed;
    if (els.bldParamsToggle) els.bldParamsToggle.setAttribute("aria-expanded", String(!collapsed));
    renderBldSummary();
  }
  function toggleBldCollapse() {
    opt.bldCollapsed = !(opt.bldCollapsed !== false);
    saveOpt();
    applyBldCollapse();
  }
  /* 收起时显示当前坐标系与编码习惯摘要 */
  function renderBldSummary() {
    if (!els.bldSummary || !opt.bld) return;
    var b = opt.bld;
    var orient = (window.BLDEngine && window.BLDEngine.CUBE_ORIENTATIONS[b.orientation])
      ? window.BLDEngine.CUBE_ORIENTATIONS[b.orientation].label : ("#" + b.orientation);
    els.bldSummary.textContent = orient + " · 棱 " + b.edgeBuffer + "/" + b.edgeOrder +
      " · 角 " + b.cornerBuffer + "/" + b.cornerOrder;
  }

  function populateOrientation() {
    if (!els.orientSel || !window.BLDEngine) return;
    els.orientSel.innerHTML = "";
    window.BLDEngine.CUBE_ORIENTATIONS.forEach(function (o, i) {
      var op = document.createElement("option");
      op.value = String(i);
      op.textContent = o.label;
      els.orientSel.appendChild(op);
    });
  }

  function syncBldParamsUI() {
    if (!opt.bld) return;
    if (els.orientSel) els.orientSel.value = String(opt.bld.orientation);
    if (els.lenInput) els.lenInput.value = opt.bld.len;
    if (els.ebuf) els.ebuf.value = opt.bld.edgeBuffer;
    if (els.eorder) els.eorder.value = opt.bld.edgeOrder;
    if (els.eorient) els.eorient.checked = !!opt.bld.edgeOrientFlag;
    if (els.eskip) els.eskip.checked = !!opt.bld.edgeSkip;
    if (els.cbuf) els.cbuf.value = opt.bld.cornerBuffer;
    if (els.corder) els.corder.value = opt.bld.cornerOrder;
    if (els.cororient) els.cororient.checked = !!opt.bld.cornerOrientFlag;
    if (els.corskip) els.corskip.checked = !!opt.bld.cornerSkip;
    if (els.bldSplit) els.bldSplit.checked = opt.bld.split !== false;
    if (els.revealSeg) {
      var after = opt.bld.showAfter !== false;
      els.revealSeg.querySelectorAll("[data-reveal]").forEach(function (b) {
        b.classList.toggle("is-active", (b.dataset.reveal === "after") === after);
      });
    }
    if (els.stepEdge) els.stepEdge.value = opt.bld.steps.edge;
    if (els.stepCorner) els.stepCorner.value = opt.bld.steps.corner;
    if (els.stepFlip) els.stepFlip.value = opt.bld.steps.flip;
    if (els.stepTwist) els.stepTwist.value = opt.bld.steps.twist;
    if (els.stepParity) els.stepParity.value = opt.bld.steps.parity;
    renderBldSummary();
  }

  function readBldParams() {
    if (!opt.bld) opt.bld = defaultBld();
    var b = opt.bld;
    if (els.orientSel) b.orientation = parseInt(els.orientSel.value, 10) || 0;
    if (els.lenInput) b.len = clamp(parseInt(els.lenInput.value, 10) || 20, 12, 30);
    if (els.ebuf) b.edgeBuffer = (els.ebuf.value || "A").toUpperCase().slice(0, 1);
    if (els.eorder) b.edgeOrder = (els.eorder.value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (els.eorient) b.edgeOrientFlag = els.eorient.checked;
    if (els.eskip) b.edgeSkip = els.eskip.checked;
    if (els.cbuf) b.cornerBuffer = (els.cbuf.value || "J").toUpperCase().slice(0, 1);
    if (els.corder) b.cornerOrder = (els.corder.value || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (els.cororient) b.cornerOrientFlag = els.cororient.checked;
    if (els.corskip) b.cornerSkip = els.corskip.checked;
    if (els.bldSplit) b.split = els.bldSplit.checked;
    if (els.stepEdge || els.stepCorner || els.stepFlip || els.stepTwist || els.stepParity) {
      b.steps = normSteps({
        edge: els.stepEdge && els.stepEdge.value,
        corner: els.stepCorner && els.stepCorner.value,
        flip: els.stepFlip && els.stepFlip.value,
        twist: els.stepTwist && els.stepTwist.value,
        parity: els.stepParity && els.stepParity.value
      });
    }
    var warn = "";
    if (window.BLDEngine) {
      var v = window.BLDEngine.validate(b);
      if (!v.edge) warn = "棱顺序 + 缓冲块需覆盖 12 个不重复的棱位";
      else if (!v.corner) warn = "角顺序 + 缓冲块需覆盖 8 个不重复的角位";
    }
    if (els.bldWarn) {
      els.bldWarn.hidden = !warn;
      if (warn) els.bldWarn.textContent = warn;
    }
    saveOpt();
  }

  function onBldParamChange() {
    readBldParams();
    renderBldSummary();
    if (opt.event === "bld") computeBld();   /* 参数变了，按当前打乱重算解法 */
  }

  function copyBld() {
    if (!curBld) return;
    var txt = "坐标 " + curBld.orientationLabel +
      "\n棱 " + (curBld.edge || "") +
      "\n翻 " + (curBld.flip || "") +
      "\n角 " + (curBld.corner || "") +
      "\n扭 " + (curBld.twist || "") +
      "\n奇偶 " + curBld.parity +
      "\n复杂度 " + curBld.complexity;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    flashBtn(els.bldCopy, "已复制 ✓", "复制解法");
  }

  function resetBld() {
    opt.bld = defaultBld();
    syncBldParamsUI();
    readBldParams();
    if (opt.event === "bld") computeBld();
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
    memoMs = 0; memoMarked = false; pendingDnfReason = "";
    if (els.memo) { els.memo.classList.remove("is-done"); els.memo.textContent = ""; }
    runTick();
    paint();
  }

  /* 三盲：是否启用「记忆 / 执行」分段计时 */
  function bldSplitOn() {
    return opt.event === "bld" && !!opt.bld && opt.bld.split !== false;
  }

  /* 三盲：标记「记忆结束」，之后的时间计入执行段。M 键或屏幕按钮触发 */
  function markMemo() {
    if (state !== "running" || !bldSplitOn() || memoMarked) return;
    memoMs = performance.now() - runStart;
    memoMarked = true;
    if (els.memo) {
      els.memo.textContent = "记忆 " + S.fmt(memoMs) + " · 执行中";
      els.memo.classList.add("is-done");
    }
    paint();
  }

  function runTick() {
    if (state !== "running") return;
    var elapsed = performance.now() - runStart;
    els.time.textContent = S.fmt(elapsed);
    if (bldSplitOn() && els.memo) {
      els.memo.textContent = memoMarked
        ? "记忆 " + S.fmt(memoMs) + " · 执行 " + S.fmt(elapsed - memoMs)
        : "记忆 " + S.fmt(elapsed) + " · 按 M 标记记忆结束";
    }
    raf = requestAnimationFrame(runTick);
  }

  function stop() {
    if (state !== "running") return;
    stopRaf();
    rawMs = performance.now() - runStart;
    state = "confirm";
    showConfirm();
    updateBldReveal();   /* 计时完成：按“显示时机”设置，此时解法面板出现 */
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
    /* 三盲：把当前打乱对应的解法 + 指标一并存入成绩（分析用） */
    if (opt.event === "bld" && curBld && opt.bld) {
      var b = opt.bld;
      entry.bld = {
        scramble: curScramble,
        orientation: b.orientation,
        orientationLabel: curBld.orientationLabel,
        edgeBuffer: b.edgeBuffer, edgeOrder: b.edgeOrder,
        edgeOrientFlag: !!b.edgeOrientFlag, edgeSkip: !!b.edgeSkip,
        cornerBuffer: b.cornerBuffer, cornerOrder: b.cornerOrder,
        cornerOrientFlag: !!b.cornerOrientFlag, cornerSkip: !!b.cornerSkip,
        edge: curBld.edge, flip: curBld.flip, corner: curBld.corner, twist: curBld.twist,
        parity: curBld.parity, complexity: curBld.complexity,
        difficulty: curBld.difficulty,
        dnfReason: pendingPenalty === "DNF" ? pendingDnfReason || "other" : ""
      };
      if (window.BLDEngine && window.BLDEngine.bldMetrics && curBld.difficulty) {
        var m = window.BLDEngine.bldMetrics(curBld.difficulty, memoMs, rawMs, b.steps);
        entry.bld.metrics = m;
      }
    }
    solves().unshift(entry);
    saveData();
    rawMs = 0;
    pendingPenalty = "";
    pendingDnfReason = "";
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
    renderConfirmMetrics();
  }

  /* 确认区：展示本次盲拧指标（记忆/执行/占比/TPS/每公式秒数）；DNF 时给出归因选择 */
  function renderConfirmMetrics() {
    if (!els.confirmMetrics) return;
    if (opt.event !== "bld" || !curBld || !curBld.difficulty) { els.confirmMetrics.innerHTML = ""; }
    else {
      var m = window.BLDEngine && window.BLDEngine.bldMetrics
        ? window.BLDEngine.bldMetrics(curBld.difficulty, memoMs, rawMs, opt.bld.steps)
        : null;
      if (!m) { els.confirmMetrics.innerHTML = ""; }
      else {
        var parts = [];
        parts.push(metric("估算步数", m.steps + " 步"));
        if (m.split) {
          parts.push(metric("记忆", S.fmt(m.memoMs)));
          parts.push(metric("执行", S.fmt(m.execMs)));
          parts.push(metric("记忆占比", Math.round(m.memoRatio * 100) + "%"));
          parts.push(metric("记忆速度", m.lettersPerMin.toFixed(1) + " 字母/分"));
          parts.push(metric("执行 TPS", m.tpsExec.toFixed(2)));
        } else {
          parts.push(metric("TPS", m.tpsAll.toFixed(2), "未分段"));
        }
        parts.push(metric("每公式秒数", m.secPerAlg.toFixed(2) + "s"));
        els.confirmMetrics.innerHTML = '<div class="tm-confirm__metrics">' + parts.join("") + "</div>";
      }
    }
    if (els.dnfReason) {
      els.dnfReason.hidden = pendingPenalty !== "DNF";
      if (pendingPenalty === "DNF") {
        var cur = pendingDnfReason || "other";
        [["memo", els.dnfMemo], ["exec", els.dnfExec], ["other", els.dnfOther]].forEach(function (p) {
          if (p[1]) p[1].classList.toggle("is-on", p[0] === cur);
        });
      }
    }
  }
  function metric(label, val, note) {
    return '<div class="tm-metric"><span class="tm-metric__k">' + label + "</span>" +
           '<span class="tm-metric__v">' + val + (note ? ' <i class="tm-metric__note">' + note + "</i>" : "") + "</span></div>";
  }

  function next(keepState) {
    stopRaf();
    clearSolveView();  /* 记录/换打乱后退出“查看历史解法”状态（随后会生成新打乱，无需还原） */
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
      /* 长按才触发，避免手机上点按 / 误触直接开始计时 */
      if (els.stage) els.stage.classList.add("is-holding");
      paint();   /* 显示“保持按住…”提示 */
      holdTimer = setTimeout(function () {
        if (state !== "idle" || !holding) return;
        if (els.stage) els.stage.classList.remove("is-holding");
        if (opt.inspect > 0) startInspect(); else toReady();
        paint();
      }, ARM_MS);
      return;
    }
    if (state === "inspect") { holdTimer = setTimeout(toReady, HOLD_MS); return; }
    if (state === "running") { stop(); return; }
    if (state === "confirm") { confirmOk(); return; }
  }
  function release(cancel) {
    holding = false;
    clearTimeout(holdTimer);
    if (els.stage) els.stage.classList.remove("is-holding");
    if (cancel) return;       /* 滑动取消：不进入计时 */
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
      exitSolveView();   /* 中途取消：退出“查看历史解法”状态 */
      updateBldReveal();   /* 中途取消：若设为“计时后显示”，则解法重新收起 */
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
      if ((k === "m" || k === "M") && state === "running") { e.preventDefault(); markMemo(); return; }
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
      pressX = e.clientX; pressY = e.clientY;
      press();
    });
    /* 按下后若发生明显滑动（滚动页面），取消本次长按，避免误触计时 */
    els.stage.addEventListener("pointermove", function (e) {
      if (!holding) return;
      var dx = e.clientX - pressX, dy = e.clientY - pressY;
      if (dx * dx + dy * dy > 144) release(true);   /* 移动 >12px 视为滚动，取消 */
    });
    window.addEventListener("pointerup", function () { release(); });
    window.addEventListener("pointercancel", function () { release(true); });

    /* 视口变化（横竖屏切换 / 缩放）时刷新提示文案与观察按钮标签，
       让「空格 / 计时区」「15 秒观察 / 15s」随移动端断点正确切换。 */
    var lastTouchUI = isTouchUI();
    window.addEventListener("resize", function () {
      if (els.state) els.state.innerHTML = stateText();
      if (isTouchUI() !== lastTouchUI) {
        lastTouchUI = isTouchUI();
        if (els.inspectSeg) buildInspect();
      }
    });
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

  /* 是否手机端：决定提示文案说「空格」还是「计时区」。
     必须与 timer.css 的移动端断点（max-width: 600px）保持一致，
     否则会出现「桌面布局却提示长按计时区」的错配。
     注意：不能靠 navigator.maxTouchPoints / 'ontouchstart' —— 桌面 Chromium 也会返回真值。 */
  function isTouchUI() {
    try {
      return !!(window.matchMedia && window.matchMedia("(max-width: 600px)").matches);
    } catch (e) { return false; }
  }

  /* 状态提示文案：idle 分支随「是否启用观察」变化；手机端不提空格键 */
  function stateText() {
    var touch = isTouchUI();
    if (state === "idle") {
      if (holding) return "保持按住…";
      if (opt.inspect > 0) {
        return touch
          ? "长按计时区开始（进入 " + opt.inspect + " 秒观察）"
          : '长按此处或长按 <b>空格</b> 开始（进入 ' + opt.inspect + " 秒观察）";
      }
      return touch ? "长按计时区预备 · 松开开始" : "长按 <b>空格</b> 预备 · 松开开始";
    }
    if (state === "inspect") return touch ? "观察中 · 继续按住计时区预备" : "观察中 · 继续按住 <b>空格</b> 预备";
    if (state === "ready") return touch ? "松开计时区开始计时" : "松开 <b>空格</b> 开始计时";
    if (state === "running") return touch ? "计时中 · 点按计时区停止" : "计时中 · 按 <b>空格</b> 停止";
    return touch ? "待确认 · 点记录 / 点作废" : "待确认 · 空格记录 / Esc 作废";
  }

  function renderStrip() {
    var arr = solves(), s = S.sessionStats(arr);
    var isBld = opt.event === "bld";

    if (isBld) {
      /* 盲拧：大量 DNF 会让 aoN 整片作废 → 改用「成功率 / 平均 / mea」口径。
         5 格 = 次数 · 成功率 · 单次最好 · 平均 · 最佳 mea12 */
      if (els.kBestK) els.kBestK.textContent = "成功率";
      if (els.kAo5K) els.kAo5K.textContent = "单次最好";
      if (els.kAo12K) els.kAo12K.textContent = "平均";
      if (els.kAo100K) els.kAo100K.textContent = "最佳 mea12";

      els.kCount.textContent = s.count;
      if (els.kBest) {
        els.kBest.textContent = s.successRate == null ? "--" : Math.round(s.successRate * 100) + "%";
        els.kBest.classList.remove("is-dnf");
        els.kBest.classList.toggle("is-best", s.successRate != null && s.successRate >= 0.5);
      }
      els.kAo5.textContent = s.best == null ? "--" : S.fmt(s.best);
      els.kAo5.classList.toggle("is-dnf", false);
      els.kAo5.classList.toggle("is-best", s.best != null);
      setAvgEl(els.kAo12, s.mean);          /* 平均：有效成绩平均（DNF 不计入、不作废） */
      setAvgEl(els.kAo100, s.bestMea12);    /* 最佳 mea12：稳定水准 */
    } else {
      if (els.kBestK) els.kBestK.textContent = "单次最好";
      if (els.kAo5K) els.kAo5K.textContent = "当前 ao5";
      if (els.kAo12K) els.kAo12K.textContent = "当前 ao12";
      if (els.kAo100K) els.kAo100K.textContent = "当前 ao100";

      els.kCount.textContent = s.count;
      els.kBest.textContent = s.best == null ? "--" : S.fmt(s.best);
      els.kBest.classList.toggle("is-best", s.best != null);
      els.kBest.classList.remove("is-dnf");
      els.kAo5.classList.remove("is-best");
      setAvgEl(els.kAo5, s.ao5);
      setAvgEl(els.kAo12, s.ao12);
      setAvgEl(els.kAo100, s.ao100);
    }
  }
  function setAvgEl(el, v) {
    if (!el) return;
    if (v == null) { el.textContent = "--"; el.classList.remove("is-dnf"); return; }
    if (v === Infinity) { el.textContent = "DNF"; el.classList.add("is-dnf"); return; }
    el.textContent = S.fmt(v); el.classList.remove("is-dnf");
  }

  /* ---------- 计时数字下方：对比 / ao5 / ao12（csTimer 手机版那一行小字） ----------
     仅在手机端显示（CSS 控制），桌面端仍用统计条。
     速拧：最近一次与「本组有效平均」的差 + ao5 + ao12
     三盲：滚动成功率 + mea5 + mea12（aoN 会被 DNF 整片作废，改用 mea 口径） */
  function refreshAo() {
    if (!els.ao) return;
    var arr = solves();
    if (!arr.length) { els.ao.hidden = true; return; }
    els.ao.hidden = false;
    var s = S.sessionStats(arr), isBld = opt.event === "bld";

    if (isBld) {
      if (els.aoCmp) {
        els.aoCmp.textContent = "成功率 " +
          (s.successRate == null ? "--" : Math.round(s.successRate * 100) + "%");
        els.aoCmp.classList.remove("is-better", "is-worse");
      }
      if (els.ao5) els.ao5.textContent = "mea5 " + fmtOrDash(S.meaN(arr, 5, 0));
      if (els.ao12) els.ao12.textContent = "mea12 " + fmtOrDash(S.meaN(arr, 12, 0));
      return;
    }
    /* 对比：最近一次（有效）与本组平均的差，快=绿 慢=红，中文习惯涨红跌绿 → 这里用「更快=绿」 */
    if (els.aoCmp) {
      var last = arr[0], v = S.val(last);
      var txt = "", cls = "";
      if (v !== Infinity && s.mean != null && isFinite(v)) {
        var d = (v - s.mean) / 1000;
        txt = "(" + (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(2) + ")";
        cls = d < 0 ? "is-better" : (d > 0 ? "is-worse" : "");
      }
      els.aoCmp.textContent = txt;
      els.aoCmp.classList.remove("is-better", "is-worse");
      if (cls) els.aoCmp.classList.add(cls);
    }
    if (els.ao5) els.ao5.textContent = "ao5 " + fmtOrDash(s.ao5);
    if (els.ao12) els.ao12.textContent = "ao12 " + fmtOrDash(s.ao12);
  }
  function fmtOrDash(v) {
    if (v == null) return "--";
    if (v === Infinity) return "DNF";
    return S.fmt(v);
  }

  /* ---------- 分组控件 ---------- */
  function renderGroups() {
    if (!els.groupSel) return;
    var gs = groupsOf(opt.event), cur = curGroup(opt.event);
    els.groupSel.innerHTML = "";
    gs.forEach(function (g) {
      var o = document.createElement("option");
      o.value = g.id;
      o.textContent = g.name + "（" + g.solves.length + " 次）";
      els.groupSel.appendChild(o);
    });
    els.groupSel.value = cur.id;
    if (els.groupMeta) {
      els.groupMeta.textContent = "当前 " + cur.name + " · " + cur.solves.length + " 次 · 共 " +
        gs.length + " 个分组（项目：" + eventDef(opt.event).label + "）";
    }
    var only = gs.length <= 1;
    if (els.groupDel) els.groupDel.disabled = only;
    els.groupDel.title = only ? "至少保留一个分组" : "删除当前分组";
  }

  function selectGroup(id) {
    var box = eventBox(opt.event);
    var hit = box.groups.some(function (g) { return g.id === id; });
    if (!hit) return;
    box.cur = id;
    saveData();
    renderGroups(); renderStrip(); renderList();
  }

  function createGroup(name) {
    var box = eventBox(opt.event);
    var g = mkGroup(name || ("分组 " + (box.groups.length + 1)));
    box.groups.push(g);
    box.cur = g.id;
    saveData();
    renderGroups(); renderStrip(); renderList();
    return g;
  }

  function renameGroup() {
    var g = curGroup(opt.event);
    var nv = window.prompt("重命名分组（当前：" + g.name + "）", g.name);
    if (nv == null) return;
    nv = nv.trim();
    if (!nv || nv === g.name) return;
    g.name = nv;
    saveData(); renderGroups(); renderList();
  }

  function deleteGroup() {
    var box = eventBox(opt.event);
    if (box.groups.length <= 1) { window.alert("至少要保留一个分组。"); return; }
    var g = curGroup(opt.event);
    if (!window.confirm("删除分组「" + g.name + "」及其 " + g.solves.length +
                        " 条成绩？此操作不可撤销。")) return;
    box.groups = box.groups.filter(function (x) { return x.id !== g.id; });
    box.cur = box.groups[0].id;
    saveData(); renderGroups(); renderStrip(); renderList();
  }

  function clearGroup(btn) {
    var g = curGroup(opt.event);
    if (!g.solves.length) return;
    if (!window.confirm("确定清空分组「" + g.name + "」的 " + g.solves.length +
                        " 条成绩吗？此操作不可撤销。")) return;
    g.solves = [];
    saveData(); renderGroups(); renderStrip(); renderList();
    /* flashBtn 的回调只认「按钮元素」；事件对象 / 无参调用时回落到工具栏按钮 */
    var target = (btn && btn.tagName) ? btn : els.clearBtn;
    flashBtn(target, "已清空 ✓", target === els.clearBtn ? "清空本组" : "清空当前分组");
  }

  /* ---------- 成绩列表 ---------- */
  function renderList() {
    var arr = solves(), list = els.list;
    list.innerHTML = "";
    var has = arr.length > 0;
    els.empty.hidden = has;
    els.listHead.hidden = !has;

    /* 三盲：DNF 占比高，aoN 会整列变成 DNF，故换成「滚动成功率 / mea」三列；
       速拧仍保留 csTimer 口径的 ao5 / ao12 / ao100。
       注意：列标题要在「无成绩提前返回」之前同步，否则切项目时标题会停在上一档。 */
    var isBld = opt.event === "bld";
    if (els.lh1) els.lh1.textContent = isBld ? "成功率" : "ao5";
    if (els.lh2) els.lh2.textContent = isBld ? "mea5" : "ao12";
    if (els.lh3) els.lh3.textContent = isBld ? "mea12" : "ao100";
    if (els.listHead) els.listHead.title = isBld
      ? "成功率 = 最近 5 次里成功的比例；mea5 / mea12 = 最近 5 / 12 次剔除 DNF 后的平均（不会整列变 DNF）"
      : "ao5 / ao12 / ao100 = csTimer 口径的滚动去尾平均（窗口内 DNF 过多时该格为 DNF）";

    refreshAo();

    if (!has) return;

    var show = Math.min(arr.length, MAX_ROWS);
    var s = S.sessionStats(arr);
    var frag = document.createDocumentFragment();
    for (let i = 0; i < show; i++) {
      let rec = arr[i], v = S.val(rec);
      let num = arr.length - i;
      var li = document.createElement("li");
      li.className = "tm-list__item";
      if (viewingSolve && num === viewingSolveNum) li.classList.add("is-viewing");

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
      /* 三盲：在时间下方显示复杂度 + 执行 TPS，并把解法写进 tooltip */
      if (rec.bld && rec.bld.complexity != null) {
        var cm = document.createElement("span");
        cm.className = "tm-list__cmplx";
        cm.textContent = "C" + rec.bld.complexity;
        t.appendChild(cm);
      }
      if (rec.bld && rec.bld.metrics && rec.bld.metrics.tpsAll != null) {
        var tp = document.createElement("span");
        tp.className = "tm-list__tps";
        tp.textContent = "TPS " + rec.bld.metrics.tpsAll.toFixed(2);
        t.appendChild(tp);
      }
      if (rec.bld) {
        li.title = "坐标 " + (rec.bld.orientationLabel || "") +
          " · 棱 " + (rec.bld.edge || "") + " · 翻 " + (rec.bld.flip || "") +
          " · 角 " + (rec.bld.corner || "") + " · 扭 " + (rec.bld.twist || "") +
          " · 复杂度 " + rec.bld.complexity;
      }

      li.appendChild(idx);
      li.appendChild(t);
      if (isBld) {
        /* 成功率（近 5）· mea5 · mea12 —— 都不受 DNF 作废影响 */
        li.appendChild(rateCell(S.succN(arr, 5, i)));
        li.appendChild(meaCell(S.meaN(arr, 5, i), 5));
        li.appendChild(meaCell(S.meaN(arr, 12, i), 12));
      } else {
        li.appendChild(avgCell(S.avgN(arr, 5, i)));
        li.appendChild(avgCell(S.avgN(arr, 12, i)));
        li.appendChild(avgCell(S.avgN(arr, 100, i)));
      }

      var del = document.createElement("button");
      del.type = "button"; del.className = "tm-list__del"; del.textContent = "✕";
      del.title = "删除该次成绩";
      del.setAttribute("aria-label", "删除该次成绩");
      del.addEventListener("click", function (e) {
        e.stopPropagation();   /* 点删除不触发“查看解法” */
        var a = solves(); a.splice(i, 1);
        saveData(); renderGroups(); renderStrip(); renderList();
      });
      li.appendChild(del);

      /* 点成绩行 → 回看这一把的解法（三盲带解法时）；无解法不响应 */
      li.style.cursor = rec.bld ? "pointer" : "";
      li.addEventListener("click", function (e) {
        if (e.target.closest(".tm-list__del")) return;
        if (!rec.bld) return;
        Array.prototype.forEach.call(list.children, function (c) { c.classList.remove("is-viewing"); });
        li.classList.add("is-viewing");
        viewSolveBld(rec, num);
      });

      frag.appendChild(li);
    }
    if (arr.length > MAX_ROWS) {
      var more = document.createElement("li");
      more.className = "tm-list__more";
      more.textContent = "仅显示最近 " + MAX_ROWS + " 条，本分组共 " + arr.length + " 条";
      frag.appendChild(more);
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
  /* 三盲列①：滚动成功率（近 5 次）——成功率是盲拧最核心的稳定性指标 */
  function rateCell(v) {
    var sp = document.createElement("span");
    sp.className = "tm-list__a tm-list__rate";
    if (v == null) { sp.textContent = "—"; return sp; }
    sp.textContent = Math.round(v * 100) + "%";
    if (v >= 0.8) sp.classList.add("is-best");
    else if (v < 0.5) sp.classList.add("is-worst");
    sp.title = "最近 5 次成功率 " + Math.round(v * 100) + "%（DNF 不计入完成）";
    return sp;
  }
  /* 三盲列②③：mea（窗口内剔除 DNF 后取平均；窗口内无有效成绩记 —） */
  function meaCell(v, n) {
    var sp = document.createElement("span");
    sp.className = "tm-list__a";
    if (v == null) { sp.textContent = "—"; return sp; }
    sp.textContent = S.fmt(v);
    sp.title = "最近 " + (n || 5) + " 次剔除 DNF 后的平均（不作废、不显示 DNF）";
    return sp;
  }

  /* ---------- 事件切换 / 打乱来源 ---------- */
  function selectEvent(key) {
    if (opt.event === key) return;
    opt.event = key; saveOpt();
    refreshEventActive();
    applyEventUI();
    applyBldCollapse();
    if (opt.event === "bld") syncBldParamsUI();
    next(false);
    renderGroups();
  }
  function refreshEventActive() {
    [els.events, els.settingsEvents].forEach(function (c) {
      if (!c) return;
      Array.prototype.forEach.call(c.children, function (ch) {
        ch.classList.toggle("is-active", ch.dataset.event === opt.event);
      });
    });
  }
  function buildEventsInto(container, onPick) {
    container.innerHTML = "";
    EVENTS.forEach(function (ev) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg__btn" + (ev.key === opt.event ? " is-active" : "");
      b.textContent = ev.label;
      b.dataset.event = ev.key;
      b.addEventListener("click", function () { onPick(ev.key); b.blur(); });
      container.appendChild(b);
    });
  }
  function buildEvents() { buildEventsInto(els.events, selectEvent); }

  /* ---------- 设置弹窗（手机端：主题 + 项目 + 打乱 + 数据） ---------- */
  function refreshThemeActive() {
    if (els.settingsTheme) {
      Array.prototype.forEach.call(els.settingsTheme.children, function (ch) {
        ch.classList.toggle("is-active", ch.dataset.themePref === Theme.get());
      });
    }
    /* 工具栏里的主题按钮：文案写「点一下会切到哪个模式」 */
    var light = Theme.mode() === "light";
    if (els.themeToggle) {
      els.themeToggle.textContent = light ? "🌙 深色" : "☀ 浅色";
      els.themeToggle.setAttribute("aria-label", light ? "切换到深色主题" : "切换到浅色主题");
    }
    /* 底部图标栏的主题按钮：图标 + 文案都跟着当前模式走 */
    if (els.barTheme) {
      var ico = els.barTheme.querySelector(".tm-bottom-bar__ico");
      var lbl = els.barTheme.querySelector(".tm-bottom-bar__lbl");
      if (ico) ico.textContent = light ? "🌙" : "☀";
      if (lbl) lbl.textContent = light ? "深色" : "浅色";
      els.barTheme.setAttribute("aria-label", light ? "切换到深色主题" : "切换到浅色主题");
    }
  }
  function openSettings() {
    if (els.settingsEvents) buildEventsInto(els.settingsEvents, selectEvent);
    refreshThemeActive();
    els.settingsModal.hidden = false;
    if (els.settingsBtn) els.settingsBtn.blur();
  }
  function closeSettings() { els.settingsModal.hidden = true; }

  /* 「观察」开关：15 秒 WCA 观察 ↔ 不用观察（空格直接起停）。
     三盲时由 applyEventUI 强制设为 0，silent=true 跳过持久化以免覆盖用户的速拧偏好。 */
  /* 「观察」开关可能同时存在于工具栏（桌面）与设置弹窗（手机）两处，
     用 data-inspect-seg 统一收集，保证两处渲染与选中态始终一致。 */
  function inspectSegs() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-inspect-seg]"), function (el) {
      out.push(el);
    });
    if (!out.length && els.inspectSeg) out.push(els.inspectSeg);
    return out;
  }
  function syncInspectActive() {
    inspectSegs().forEach(function (seg) {
      Array.prototype.forEach.call(seg.children, function (c) {
        c.classList.toggle("is-active", c.dataset.inspect === String(opt.inspect));
      });
    });
  }
  function setInspect(v, silent) {
    v = (parseInt(v, 10) === 0) ? 0 : 15;
    if (!silent) speedInspect = v;    /* 用户手动选的是速拧偏好，三盲强制 0 不影响它 */
    if (opt.inspect === v) { syncInspectActive(); return; }
    opt.inspect = v;
    if (!silent) saveOpt();
    if (state === "inspect" || state === "ready") abortKey();   /* 中途切换不留脏状态 */
    syncInspectActive();
    paint();
  }
  function buildInspect() {
    var segs = inspectSegs();
    if (!segs.length) return;
    /* 手机端空间紧张用短标签，桌面端保留完整说明 */
    var labels = isTouchUI()
      ? [["15", "15s"], ["0", "无"]]
      : [["15", "15 秒观察"], ["0", "不用观察"]];
    segs.forEach(function (seg) {
      seg.innerHTML = "";
      labels.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "seg__btn" + (String(opt.inspect) === o[0] ? " is-active" : "");
        b.textContent = o[1];
        b.dataset.inspect = o[0];
        b.addEventListener("click", function () { setInspect(o[0]); b.blur(); });
        seg.appendChild(b);
      });
    });
  }

  /* 「打乱来源」开关同样可能在打乱区（桌面）与设置弹窗（手机）两处，
     用 data-manual-seg 收集，保持两处选中态一致。 */
  function manualSegs() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-manual-seg]"), function (el) {
      out.push(el);
    });
    if (!out.length && els.manualSeg) out.push(els.manualSeg);
    return out;
  }
  function setManual(on, silent) {
    opt.manual = !!on; saveOpt();
    manualSegs().forEach(function (seg) {
      Array.prototype.forEach.call(seg.children, function (c) {
        c.classList.toggle("is-active", c.dataset.manual === (on ? "1" : "0"));
      });
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
    var arr = solves(), s = S.sessionStats(arr), g = curGroup(opt.event);
    els.modalEvent.textContent = eventDef(opt.event).label + " · " + g.name;
    var cells;
    if (opt.event === "bld") {
      /* 盲拧：aoN 会被 DNF 整片作废 → 换成成功率 / mea 口径 */
      cells = [
        ["次数", String(s.count)],
        ["有效次数", String(s.valid)],
        ["DNF 次数", String(s.dnf)],
        ["成功率", s.successRate == null ? "--" : Math.round(s.successRate * 100) + "%",
          s.successRate != null && s.successRate >= 0.5],
        ["单次最好", s.best == null ? "--" : S.fmt(s.best), s.best != null],
        ["平均", s.mean == null ? "--" : S.fmt(s.mean)],
        ["当前 mea3", s.mea3 == null ? "--" : S.fmt(s.mea3)],
        ["当前 mea12", s.mea12 == null ? "--" : S.fmt(s.mea12)],
        ["最佳 mea3", s.bestMea3 == null ? "--" : S.fmt(s.bestMea3), s.bestMea3 != null],
        ["最佳 mea12", s.bestMea12 == null ? "--" : S.fmt(s.bestMea12), s.bestMea12 != null],
        ["单次最差", s.worst == null ? "--" : (s.worst === Infinity ? "DNF" : S.fmt(s.worst))]
      ];
    } else {
      cells = [
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
    }
    var html = "";
    cells.forEach(function (c) {
      html += '<div class="tm-cell"><span class="tm-cell__k">' + c[0] + '</span>' +
              '<span class="tm-cell__v' + (c[2] ? " is-best" : "") + '">' + c[1] + "</span></div>";
    });
    els.statGrid.innerHTML = html;

    els.chartDaily.innerHTML = S.dailyChart(arr);
    els.chartTrend.innerHTML = S.trendChart(arr);
    els.chartDist.innerHTML = S.distChart(arr);
    if (opt.event === "bld" && els.bldAnalysis && window.TimerBldStats) {
      els.bldAnalysis.hidden = false;
      els.bldAnalysis.innerHTML = window.TimerBldStats.renderReport(arr);
    } else if (els.bldAnalysis) {
      els.bldAnalysis.hidden = true;
      els.bldAnalysis.innerHTML = "";
    }
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

  /* ① JSON：本站完整备份（含分组，可原样导回） */
  function exportJson() {
    var payload = {
      app: "mrcube-timer",
      version: 2,
      exportedAt: new Date().toISOString(),
      events: data
    };
    download("timer-" + stamp() + ".json", JSON.stringify(payload, null, 2), "application/json");
    flashBtn(els.exportBtn, "已导出 ✓", EXPORT_LABEL);
  }

  /* ② csTimer 导出格式（cstimer.net「导出」产生的就是这个 txt，可双向互导）
     每个「分组」导成一个 csTimer 会话（名字沿用分组名，打乱类型写进会话选项），
     这样在 csTimer 里能直接看到分组名与正确的打乱类型。
     单条：[ [penalty, timeMs], 打乱, 备注, 时间戳(秒) ]，csTimer 内部按「旧 → 新」排列。 */
  function csTimerSolve(rec) {
    var pen = rec.pen === "DNF" ? -1 : (rec.pen === "+2" ? 2000 : 0);
    return [[pen, Math.round(rec.ms)], "", "", Math.round((rec.date || Date.now()) / 1000)];
  }
  function csTimerStat(list) {
    var total = list.length, dnf = 0, sum = 0, n = 0;
    list.forEach(function (r) {
      /* list 为「新 → 旧」，取到的是第一项＝最新 */
      if (r.pen === "DNF") { dnf++; return; }
      sum += r.ms + (r.pen === "+2" ? 2000 : 0); n++;
    });
    return [total, dnf, n ? Math.round(sum / n) : 0];
  }
  function csTimerPayload() {
    var sessions = [];
    ["3x3", "2x2"].forEach(function (k) {
      groupsOf(k).forEach(function (g) {
        if (!g.solves.length) return;
        sessions.push({ event: k, name: g.name, solves: g.solves.slice().sort(newestFirst) });
      });
    });
    var obj = {}, sd = {};
    sessions.forEach(function (s, i) {
      obj["session" + (i + 1)] = s.solves.slice().reverse().map(csTimerSolve);
      var newest = s.solves[0], oldest = s.solves[s.solves.length - 1];
      sd[String(i + 1)] = {
        name: s.name,
        opt: { scrType: SCR_TYPE[s.event] },
        rank: i + 1,
        stat: csTimerStat(s.solves),
        date: [oldest ? Math.round(oldest.date / 1000) : null,
               newest ? Math.round(newest.date / 1000) : null]
      };
    });
    obj.properties = { sessionN: sessions.length, sessionData: JSON.stringify(sd) };
    return obj;
  }
  function exportCsTimerTxt() {
    download("cstimer_" + stamp() + ".txt", JSON.stringify(csTimerPayload()));
    flashBtn(els.exportBtn, "已导出 ✓", EXPORT_LABEL);
  }

  /* ③ 纯时间列表（当前分组 · 每行一条 · 旧 → 新），可直接用本站导入回灌 */
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

  /* 会话元信息：csTimer 把打乱类型放在 sessionData[i].opt.scrType（默认 333 时省略） */
  function sessionMeta(props, i) {
    var sd = props ? props.sessionData : null;
    if (typeof sd === "string") { try { sd = JSON.parse(sd); } catch (e) { sd = null; } }
    if (!sd || typeof sd !== "object") sd = {};
    var e = sd[String(i)] || sd[i] || {};
    var o = (e.opt && typeof e.opt === "object") ? e.opt : {};
    var t = o.scrType || e.scrType || "";
    if (typeof t !== "string") t = "";
    var nm = e.name;
    var name = (typeof nm === "string") ? nm.trim() : "";
    /* 兜底：本站旧版导出把类型写成 properties.scrType 数组/字符串 */
    if (!t && props) {
      var arr = props.scrType;
      if (Array.isArray(arr)) {
        var v = arr[i - 1];
        if (Array.isArray(v)) v = v[0];
        if (v != null && typeof v !== "object") t = String(v);
      } else if (typeof arr === "string" && i === 1) {
        t = arr;
      }
    }
    return { name: name, scrType: t };
  }

  /* 按会话拆分 csTimer 导出文件；非该格式返回 null */
  function parseCsTimerExport(obj) {
    var keys = Object.keys(obj).filter(function (k) { return /^session\d+$/.test(k); });
    if (!keys.length) return null;
    var props = obj.properties;
    if (typeof props === "string") { try { props = JSON.parse(props); } catch (e) { props = null; } }
    if (!props || typeof props !== "object") props = {};
    var maxIdx = 0;
    keys.forEach(function (k) { maxIdx = Math.max(maxIdx, parseInt(k.slice(7), 10) || 0); });
    var n = parseInt(props.sessionN, 10);
    if (!isFinite(n) || n < maxIdx) n = maxIdx;
    var sessions = [], total = 0;
    for (var i = 1; i <= n; i++) {
      var list = parseCsTimerSolves(obj["session" + i]);
      if (!list.length) continue;
      total += list.length;
      var meta = sessionMeta(props, i);
      var hasType = !!meta.scrType;
      var guess = guessEvent(meta.scrType, meta.name);
      var assumed = false, unknown = false;
      if (!hasType && !guess) { guess = "3x3"; assumed = true; }  /* csTimer 默认类型 333 会被省略 */
      else if (hasType && !guess) { unknown = true; }
      sessions.push({
        idx: i, scrType: meta.scrType, name: meta.name, solves: list,
        guess: guess, assumed: assumed, unknown: unknown,
        label: meta.name || ("会话 " + i)
      });
    }
    return { sessions: sessions, total: total, n: n };
  }

  /* 会话 → 项目：先看 csTimer 打乱类型，再看会话名 */
  function guessEvent(scrType, name) {
    var s = String(scrType || "").toLowerCase(), n = String(name || "");
    if (!s) {
      if (/2x2|二阶/.test(n)) return "2x2";
      if (/3x3|三阶/.test(n)) return "3x3";
      return "";
    }
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

  /* 本站 JSON 备份：v2 还原分组、v1 并入当前分组 */
  function parseOwnJson(obj) {
    var ev = obj.events, v2 = null, v1 = { "3x3": [], "2x2": [], "bld": [] }, hasV1 = false;
    ["3x3", "2x2", "bld"].forEach(function (k) {
      var e = ev[k];
      if (!e) return;
      if (Array.isArray(e)) {
        v1[k] = e.map(normSolve).filter(Boolean);
        if (v1[k].length) hasV1 = true;
      } else if (e && typeof e === "object" && Array.isArray(e.groups)) {
        v2 = v2 || { "3x3": [], "2x2": [] };
        e.groups.forEach(function (g) {
          if (!g || typeof g !== "object") return;
          var o = mkGroup(g.name, g.id);
          o.solves = (Array.isArray(g.solves) ? g.solves : []).map(normSolve).filter(Boolean);
          if (o.solves.length) v2[k].push(o);
        });
      }
    });
    if (v2) {
      var any = v2["3x3"].length + v2["2x2"].length;
      return any ? { groups: v2 } : { empty: "json" };
    }
    return hasV1 ? { events: v1 } : { empty: "json" };
  }

  /* 纯文本：每行一条，支持 12.34 / 12.34+ / 1:23.45 / DNF，可带行首序号（1. 1) #1 -） */
  function parsePlainText(txt) {
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
    }
    return arr;
  }

  /* 解析入口：返回
       { csTimer: sessions } | { groups: {...} } | { events: {...} } | { empty: ... } | null */
  function parseImport(txt) {
    var obj = null, isJson = true;
    try { obj = JSON.parse(txt); } catch (e) { isJson = false; }

    if (isJson && obj && typeof obj === "object" && !Array.isArray(obj)) {
      /* ① csTimer 导出文件 → 交给映射弹窗确认分组归属 */
      var cs = parseCsTimerExport(obj);
      if (cs) return cs.sessions.length ? { csTimer: cs.sessions } : { empty: "csTimer" };
      /* ② 本站 JSON 备份 */
      if (obj.events && typeof obj.events === "object") return parseOwnJson(obj);
      if (Array.isArray(obj.solves)) {
        var one = { "3x3": [], "2x2": [] };
        one[opt.event] = obj.solves.map(normSolve).filter(Boolean);
        return one[opt.event].length ? { events: one } : { empty: "json" };
      }
      return null;   /* 合法 JSON 但不是已知结构：明确报错，避免把 JSON 文本当成绩解析 */
    }
    if (isJson && Array.isArray(obj)) {
      var e2 = { "3x3": [], "2x2": [] };
      e2[opt.event] = parseCsTimerSolves(obj);      /* 裸数组：可能是直接粘贴的会话数组 */
      return e2[opt.event].length ? { events: e2 } : null;
    }
    var plain = parsePlainText(txt);
    if (!plain.length) return null;
    var out = { "3x3": [], "2x2": [] };
    out[opt.event] = plain;
    return { events: out };
  }

  /* ---------- 导入：合并（多重集合去重，同秒/同名成绩不会被误删） ---------- */
  function addSolve(g, s, rem, i) {
    s = normSolve(s);
    if (!s) return false;
    if (s.src) s.date = Date.now() + i;            /* 无真实时间戳 → 用当前时间并保持行序 */
    var sig = solveSig(s);
    if (rem[sig] > 0) { rem[sig]--; return false; }
    g.solves.push(s);
    return true;
  }
  function sigIndex(k) {
    var rem = {};
    allSolves(k).forEach(function (s) {
      var sig = solveSig(s);
      rem[sig] = (rem[sig] || 0) + 1;
    });
    return rem;
  }
  /* 收尾：组内排序；多分组时清掉空分组（保留至少一个）；修正当前分组指向 */
  function tidyBox(k, prefer) {
    var box = eventBox(k);
    box.groups.forEach(function (g) { g.solves.sort(newestFirst); });
    if (box.groups.length > 1) {
      var kept = box.groups.filter(function (g) { return g.solves.length > 0; });
      if (kept.length) box.groups = kept;
    }
    if (!box.groups.length) box.groups = [mkGroup("默认分组")];
    var preferHit = prefer && box.groups.some(function (g) { return g.id === prefer; });
    if (preferHit) box.cur = prefer;
    else if (!box.groups.some(function (g) { return g.id === box.cur; })) box.cur = box.groups[0].id;
  }
  /* csTimer 会话 → 各成一个分组（同名则并入既有分组，保证重复导入幂等） */
  function importSessions(picks) {
    var added = 0, created = 0, per = {};
    var byEvent = {};
    picks.forEach(function (p) { (byEvent[p.event] = byEvent[p.event] || []).push(p); });
    Object.keys(byEvent).forEach(function (k) {
      var box = eventBox(k), rem = sigIndex(k), first = null, evAdded = 0;
      byEvent[k].forEach(function (p) {
        var g = findGroup(k, p.name);
        if (!g) {
          g = mkGroup(p.name || ("导入 " + stamp()));
          box.groups.push(g);
          created++;
        }
        if (!first) first = g.id;
        p.solves.forEach(function (s, i) { if (addSolve(g, s, rem, i)) evAdded++; });
      });
      added += evAdded;
      if (evAdded) per[k] = evAdded;
      tidyBox(k, evAdded ? first : null);   /* 有新增才跳转；计数必须按项目各自统计 */
    });
    return { added: added, created: created, perEvent: per };
  }
  /* 扁平成绩 → 并入目标项目的「当前分组」 */
  function mergeEvents(incoming) {
    var added = 0, per = {};
    ["3x3", "2x2"].forEach(function (k) {
      var inc = incoming[k];
      if (!inc || !inc.length) return;
      var g = curGroup(k), rem = sigIndex(k), evAdded = 0;
      inc.forEach(function (s, i) { if (addSolve(g, s, rem, i)) evAdded++; });
      added += evAdded;
      if (evAdded) per[k] = evAdded;
      tidyBox(k, g.id);
    });
    return { added: added, created: 0, perEvent: per };
  }

  function finishImport(res) {
    saveData();
    renderGroups(); renderStrip(); renderList();
    if (!res.added) {
      window.alert("没有新增成绩。\n可能原因：① 文件里的成绩都已存在（重复导入不会重复添加）；" +
                   "② 分组映射里所有会话都被设成了「忽略」。");
      return;
    }
    var parts = [];
    ["3x3", "2x2"].forEach(function (k) {
      if (res.perEvent && res.perEvent[k]) parts.push(eventDef(k).label + " " + res.perEvent[k] + " 条");
    });
    window.alert("导入完成：新增 " + res.added + " 条成绩" +
      (res.created ? "，新建 " + res.created + " 个分组" : "") +
      (parts.length > 1 ? "\n（" + parts.join(" / ") + "，另一项目的数据在「项目」里切换查看）" : "") +
      "。\n（按成绩与时间合并去重，重复导入不会重复添加。）");
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = parseImport(String(reader.result || "")); } catch (e) { parsed = null; }
      if (!parsed) {
        window.alert("导入失败：无法解析文件内容。\n支持 csTimer 导出的 .txt、本站导出的 .json，" +
                     "以及每行一个时间的纯文本。");
        return;
      }
      if (parsed.empty) {
        window.alert(parsed.empty === "csTimer"
          ? "这个 csTimer 文件里没有任何成绩（都是空会话）。"
          : "这个备份文件里没有任何成绩。");
        return;
      }
      if (parsed.csTimer) { openMapDialog(parsed.csTimer); return; }
      if (parsed.groups) {
        var picks = [];
        ["3x3", "2x2"].forEach(function (k) {
          (parsed.groups[k] || []).forEach(function (g) {
            picks.push({ event: k, name: g.name, solves: g.solves });
          });
        });
        finishImport(importSessions(picks));
        return;
      }
      finishImport(mergeEvents(parsed.events));
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
      name.textContent = s.label + (s.scrType ? "（" + s.scrType + "）" : "");
      name.title = name.textContent;

      var tag = document.createElement("span");
      tag.className = "tm-map__tag";
      if (s.unknown) { tag.textContent = "类型 " + s.scrType + " 本站不支持"; tag.classList.add("is-bad"); }
      else if (s.assumed) { tag.textContent = "无类型信息 · 默认三阶"; tag.classList.add("is-assume"); }
      else { tag.textContent = "自动识别"; tag.classList.add("is-ok"); }

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
      row.appendChild(tag);
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
      if (s) out.push({ event: sel.value, name: s.label, solves: s.solves });
    });
    return out;
  }

  function updateMapSum() {
    var picks = pickedSessions(), n = 0, labels = [], groups = 0;
    picks.forEach(function (p) {
      n += p.solves.length;
      groups++;
      var lab = eventDef(p.event).label;
      if (labels.indexOf(lab) < 0) labels.push(lab);
    });
    els.mapSum.textContent = n
      ? "将向 " + labels.join(" / ") + " 导入 " + n + " 条成绩，建成 " + groups + " 个分组"
      : "未选择任何分组（点了确认也不会导入）";
    els.mapSum.classList.toggle("is-warn", !n);
  }

  function closeMapDialog() {
    els.mapModal.hidden = true;
    pendingSessions = null;
  }

  function confirmMapImport() {
    var picks = pickedSessions();
    closeMapDialog();
    if (!picks.length) {
      window.alert("没有选择任何要导入的分组（全部为「忽略」），已取消。");
      return;
    }
    finishImport(importSessions(picks));
  }

  /* ---------- 导出菜单 ---------- */
  function toggleExportMenu(on) {
    if (!els.exportMenu) return;
    var open = (on == null) ? els.exportMenu.hidden : !!on;
    els.exportMenu.hidden = !open;
    els.exportBtn.setAttribute("aria-expanded", open ? "true" : "false");
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
      scrambleBlock: $("tm-scramble-block"),
      replayBar: $("tm-replay-bar"), replayTxt: $("tm-replay-txt"), replayReturn: $("tm-replay-return"),
      events: $("tm-events"), manualSeg: $("tm-manual-seg"), manualBox: $("tm-manual-box"),
      manualInput: $("tm-manual-input"), manualApply: $("tm-manual-apply"),
      confirm: $("tm-confirm"), confirmTime: $("tm-confirm-time"),
      btnOk: $("tm-confirm-ok"), btnPlus2: $("tm-confirm-plus2"),
      btnDnf: $("tm-confirm-dnf"), btnDrop: $("tm-confirm-drop"),
      strip: $("tm-strip"), kCount: $("k-count"), kBest: $("k-best"),
      kAo5: $("k-ao5"), kAo12: $("k-ao12"), kAo100: $("k-ao100"),
      ao: $("tm-ao"), aoCmp: $("tm-ao-cmp"), ao5: $("tm-ao-5"), ao12: $("tm-ao-12"),
      barStats: $("tm-bar-stats"), barSettings: $("tm-bar-settings"),
      barNext: $("tm-bar-next"), barTheme: $("tm-bar-theme"),
      kCountK: $("k-count-k"), kBestK: $("k-best-k"),
      kAo5K: $("k-ao5-k"), kAo12K: $("k-ao12-k"), kAo100K: $("k-ao100-k"),
      list: $("tm-list"), listWrap: $("tm-list-wrap"), empty: $("tm-empty"),
      listHead: document.querySelector(".tm-list-head"),
      lh1: $("tm-lh-1"), lh2: $("tm-lh-2"), lh3: $("tm-lh-3"),
      groupSel: $("tm-group-sel"), groupNew: $("tm-group-new"),
      groupRen: $("tm-group-ren"), groupDel: $("tm-group-del"), groupMeta: $("tm-group-meta"),
      statsBtn: $("tm-stats"), exportBtn: $("tm-export"), exportMenu: $("tm-export-menu"),
      importBtn: $("tm-import"),
      importFile: $("tm-import-file"), clearBtn: $("tm-clear"),
      settingsBtn: $("tm-settings"), settingsModal: $("tm-settings-modal"),
      settingsClose: $("tm-settings-close"),
      settingsEvents: $("tm-settings-events"), settingsTheme: $("tm-settings-theme"),
      settingsNext: $("tm-settings-next"),
      settingsImport: $("tm-settings-import"), settingsClear: $("tm-settings-clear"),
      settingsExport: $("tm-settings-export"), settingsExportMenu: $("tm-settings-export-menu"),
      themeToggle: $("tm-theme-toggle"),
      modal: $("tm-modal"), modalClose: $("tm-modal-close"), modalEvent: $("tm-modal-event"),
      statGrid: $("tm-stat-grid"), chartDaily: $("tm-chart-daily"),
      chartTrend: $("tm-chart-trend"), chartDist: $("tm-chart-dist"),
      inspectSeg: $("tm-inspect-seg"), inspectLabel: $("tm-inspect-label"),
      settingsInspectWrap: $("tm-settings-inspect-wrap"),
      settingsManualWrap: $("tm-settings-manual-wrap"),
      mapModal: $("tm-map"), mapRows: $("tm-map-rows"), mapSum: $("tm-map-sum"),
      mapOk: $("tm-map-ok"), mapCancel: $("tm-map-cancel"),
      bldParams: $("tm-bld-params"), bld: $("tm-bld"), bldMeta: $("tm-bld-meta"),
      bldParamsToggle: $("tm-bld-collapse"), bldBody: $("tm-bld-body"), bldSummary: $("tm-bld-summary"),
      bldNetSide: $("tm-bld-net-side"),
      bldRows: $("tm-bld-rows"), bldCopy: $("tm-bld-copy"),
      bldNet: $("tm-bld-net"), bldNetCap: $("tm-bld-net-cap"), bldDiff: $("tm-bld-diff"),
      orientSel: $("tm-bld-orient"), lenInput: $("tm-bld-len"),
      ebuf: $("tm-bld-ebuf"), eorder: $("tm-bld-eorder"),
      eorient: $("tm-bld-eorient"), eskip: $("tm-bld-eskip"),
      cbuf: $("tm-bld-cbuf"), corder: $("tm-bld-corder"),
      cororient: $("tm-bld-cororient"), corskip: $("tm-bld-corskip"),
      bldReset: $("tm-bld-reset"), bldWarn: $("tm-bld-warn"),
      bldAnalysis: $("tm-bld-analysis"),
      /* 分段计时与步数配置 */
      bldSplit: $("tm-bld-split"), bldStepsBtn: $("tm-bld-steps-toggle"),
      revealSeg: $("tm-bld-reveal-seg"),
      stepEdge: $("tm-step-edge"), stepCorner: $("tm-step-corner"),
      stepFlip: $("tm-step-flip"), stepTwist: $("tm-step-twist"), stepParity: $("tm-step-parity"),
      bldStepsWrap: $("tm-bld-steps"),
      /* 计时中：记忆/执行分段提示 */
      memo: $("tm-memo"),
      /* 确认区：本次指标 + DNF 归因 */
      confirmMetrics: $("tm-confirm-metrics"),
      dnfReason: $("tm-dnf-reason"),
      dnfMemo: $("tm-dnf-memo"), dnfExec: $("tm-dnf-exec"), dnfOther: $("tm-dnf-other")
    };
    if (!els.stage) return;

    loadData(); loadOpt();

    buildInspect();
    buildEvents();
    if (els.settingsEvents) buildEventsInto(els.settingsEvents, selectEvent);
    setManual(false, true);
    manualSegs().forEach(function (seg) {
      seg.addEventListener("click", function (e) {
        var b = e.target.closest("[data-manual]");
        if (!b) return;
        if (b.dataset.manual === "1") { setManual(true); els.manualInput.focus(); }
        else { setManual(false); }
        b.blur();
      });
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

    els.newBtn.addEventListener("click", function () {
      /* 回放中点「换这一把」= 离开回放，换一把新打乱 */
      if (viewingSolve) { clearSolveView(); renderList(); }
      newScramble();
      els.newBtn.blur();
    });
    els.copyBtn.addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(curScramble).catch(function () {});
      flashBtn(els.copyBtn, "已复制 ✓", viewingSolve ? "复制这一把" : "复制");
      els.copyBtn.blur();
    });

    els.btnOk.addEventListener("click", function () { confirmOk(); this.blur(); });
    els.btnPlus2.addEventListener("click", function () { togglePenalty("+2"); this.blur(); });
    els.btnDnf.addEventListener("click", function () { togglePenalty("DNF"); this.blur(); });
    els.btnDrop.addEventListener("click", function () { discard(); this.blur(); });

    /* 分组控件 */
    els.groupSel.addEventListener("change", function () { selectGroup(els.groupSel.value); });
    els.groupNew.addEventListener("click", function () {
      var nv = window.prompt("新建分组名称", opt.event === "3x3" ? "三阶分组" : "二阶分组");
      if (nv == null) return;
      createGroup(nv.trim() || undefined);
      els.groupNew.blur();
    });
    els.groupRen.addEventListener("click", function () { renameGroup(); els.groupRen.blur(); });
    els.groupDel.addEventListener("click", function () { deleteGroup(); els.groupDel.blur(); });

    els.statsBtn.addEventListener("click", function () { openStats(); els.statsBtn.blur(); });
    els.modalClose.addEventListener("click", closeStats);
    els.modal.addEventListener("click", function (e) {
      if (e.target.dataset && e.target.dataset.close) closeStats();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" && e.code !== "Escape") return;
      if (!els.settingsModal.hidden) { e.stopPropagation(); closeSettings(); return; }
      if (!els.modal.hidden) { e.stopPropagation(); closeStats(); return; }
      if (!els.mapModal.hidden) { e.stopPropagation(); closeMapDialog(); }
    }, true);

    /* 导出菜单项：主工具栏菜单与「设置 → 数据」里的菜单共用同一套动作 */
    function runExp(kind) {
      if (kind === "cstimer") exportCsTimerTxt();
      else if (kind === "txt") exportPlainTxt();
      else exportJson();
    }
    function bindExportMenu(menu) {
      if (!menu) return;
      menu.addEventListener("click", function (e) {
        var b = e.target.closest("[data-exp]");
        if (!b) return;
        if (menu === els.exportMenu) toggleExportMenu(false);
        else menu.hidden = true;
        runExp(b.dataset.exp);
        b.blur();
      });
    }
    els.exportBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleExportMenu();
      els.exportBtn.blur();
    });
    bindExportMenu(els.exportMenu);
    bindExportMenu(els.settingsExportMenu);
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
    els.clearBtn.addEventListener("click", function () { clearGroup(els.clearBtn); });

    /* 设置弹窗：手机端把「主题」「项目」「打乱」「数据」收进这里
       （主界面只留最常用的几个按钮） */
    if (els.settingsBtn) {
      els.settingsBtn.addEventListener("click", openSettings);
      els.settingsClose.addEventListener("click", closeSettings);
      els.settingsModal.addEventListener("click", function (e) {
        if (e.target.dataset && e.target.dataset.close) closeSettings();
      });
      if (els.settingsTheme) {
        els.settingsTheme.addEventListener("click", function (e) {
          var b = e.target.closest("[data-theme-pref]");
          if (!b) return;
          Theme.set(b.dataset.themePref);
          refreshThemeActive();
          b.blur();
        });
      }
      if (els.settingsNext) {
        els.settingsNext.addEventListener("click", function () {
          next(false);
          closeSettings();
        });
      }
      if (els.settingsImport) {
        els.settingsImport.addEventListener("click", function () {
          closeSettings();
          els.importFile.click();
        });
      }
      if (els.settingsClear) {
        els.settingsClear.addEventListener("click", function () { clearGroup(els.settingsClear); });
      }
      /* 「设置 → 数据 → 导出 ▾」：展开/收起内联菜单 */
      if (els.settingsExport && els.settingsExportMenu) {
        els.settingsExport.addEventListener("click", function (e) {
          e.stopPropagation();
          els.settingsExportMenu.hidden = !els.settingsExportMenu.hidden;
          els.settingsExport.setAttribute("aria-expanded", String(!els.settingsExportMenu.hidden));
          this.blur();
        });
      }
    }
    /* 主题变化：同步设置弹窗的选中态 + 工具栏按钮文案，
       并重绘三盲展开图（它的底板取的是当前主题的卡片底色，不重绘会留着旧底色） */
    Theme.onChange(function () {
      refreshThemeActive();
      renderBldNet();
    });
    refreshThemeActive();
    /* 手机端工具栏的主题开关：一键浅色 ↔ 深色（导航被收起时也能切） */
    if (els.themeToggle) {
      els.themeToggle.addEventListener("click", function () {
        Theme.toggle();
        refreshThemeActive();
        this.blur();
      });
    }

    /* 手机端底部图标栏（csTimer 式）：统计 / 设置 / 换打乱 / 主题 */
    if (els.barStats) els.barStats.addEventListener("click", function () { openStats(); this.blur(); });
    if (els.barSettings) els.barSettings.addEventListener("click", function () { openSettings(); this.blur(); });
    if (els.barNext) els.barNext.addEventListener("click", function () { next(false); this.blur(); });
    if (els.barTheme) els.barTheme.addEventListener("click", function () {
      Theme.toggle(); refreshThemeActive(); this.blur();
    });

    /* 防误操作：手机下拉刷新 / 误点返回会导致整页重载。
       若此时正停在「待确认」状态（成绩已测出但还没点记录），
       就在页面离开前先把它记下来，别让刚做完的一把白做。 */
    function rescuePendingSolve() {
      if (state !== "confirm") return;
      try { confirmOk(); } catch (e) { /* 尽力而为，失败不影响卸载 */ }
    }
    window.addEventListener("pagehide", rescuePendingSolve);

    /* 三盲：参数面板 + 解法面板 */
    populateOrientation();
    syncBldParamsUI();
    if (els.bldParamsToggle) els.bldParamsToggle.addEventListener("click", toggleBldCollapse);
    if (els.bldParams) els.bldParams.addEventListener("click", function (e) {
      /* 点击摘要行（非交互控件）也能展开，方便快速查看 */
      if (els.bldBody && els.bldBody.hidden && (e.target === els.bldSummary || e.target.classList.contains("tm-bld-params__head"))) {
        toggleBldCollapse();
      }
    });
    [els.orientSel, els.lenInput, els.ebuf, els.eorder, els.eorient, els.eskip,
     els.cbuf, els.corder, els.cororient, els.corskip].forEach(function (el) {
      if (!el) return;
      el.addEventListener("change", onBldParamChange);
      if (el.tagName === "INPUT" && el.type === "text") el.addEventListener("input", onBldParamChange);
    });
    if (els.bldReset) els.bldReset.addEventListener("click", function () { resetBld(); els.bldReset.blur(); });
    if (els.bldCopy) els.bldCopy.addEventListener("click", function () { copyBld(); });
    if (els.replayReturn) els.replayReturn.addEventListener("click", function () { exitSolveView(); renderList(); els.replayReturn.blur(); });
    /* 分段计时开关 + 步数估算配置 */
    [els.bldSplit, els.stepEdge, els.stepCorner, els.stepFlip, els.stepTwist, els.stepParity].forEach(function (el) {
      if (!el) return;
      el.addEventListener("change", function () { readBldParams(); });
    });
    if (els.bldStepsBtn && els.bldStepsWrap) {
      els.bldStepsBtn.addEventListener("click", function () {
        els.bldStepsWrap.hidden = !els.bldStepsWrap.hidden;
        els.bldStepsBtn.setAttribute("aria-expanded", String(!els.bldStepsWrap.hidden));
      });
    }
    /* 解法显示时机：计时后显示 / 立即显示 */
    if (els.revealSeg) {
      els.revealSeg.addEventListener("click", function (e) {
        var b = e.target.closest("[data-reveal]");
        if (!b || !opt.bld) return;
        opt.bld.showAfter = (b.dataset.reveal === "after");
        saveOpt();
        syncBldParamsUI();
        updateBldReveal();
        b.blur();
      });
    }
    /* 确认区：DNF 归因（记忆错 / 执行错 / 其他） */
    if (els.dnfMemo) els.dnfMemo.addEventListener("click", function () { pendingDnfReason = "memo"; renderConfirmMetrics(); });
    if (els.dnfExec) els.dnfExec.addEventListener("click", function () { pendingDnfReason = "exec"; renderConfirmMetrics(); });
    if (els.dnfOther) els.dnfOther.addEventListener("click", function () { pendingDnfReason = "other"; renderConfirmMetrics(); });
    applyEventUI();
    applyBldCollapse();
    renderBldSummary();

    /* 手机端：顶部导航隐藏，点顶部把手显示/隐藏 */
    var navHandle = document.getElementById("tm-nav-handle");
    if (navHandle) {
      navHandle.addEventListener("click", function () {
        document.body.classList.toggle("tm-nav-visible");
      });
    }

    bindInput();

    curScramble = opt.manual ? opt.manualText : "";
    if (opt.manual) els.manualInput.value = opt.manualText;
    next(true);
    renderGroups();
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
    openSettings: openSettings, closeSettings: closeSettings,
    setEvent: function (k) {
      opt.event = k; buildEvents(); applyEventUI();
      if (k === "bld") syncBldParamsUI();
      next(true); renderGroups();
    },
    get bld() { return curBld ? JSON.parse(JSON.stringify(curBld)) : null; },
    get bldParams() { return opt.bld ? JSON.parse(JSON.stringify(opt.bld)) : null; },
    get showAfter() { return !!(opt.bld && opt.bld.showAfter !== false); },
    get bldHidden() { return !!(els.bld && els.bld.hidden); },
    setBldParams: function (partial) {
      if (!opt.bld) opt.bld = defaultBld();
      for (var k in partial) if (Object.prototype.hasOwnProperty.call(partial, k)) opt.bld[k] = partial[k];
      syncBldParamsUI(); readBldParams();
      if (opt.event === "bld") computeBld();
      updateBldReveal();
      return curBld ? JSON.parse(JSON.stringify(curBld)) : null;
    },
    setInspect: setInspect,
    addSolve: function (ms, pen) {
      solves().unshift({ ms: ms, pen: pen || "", date: Date.now() });
      saveData(); renderGroups(); renderStrip(); renderList();
    },
    clear: function () {
      data["3x3"] = emptyBox(); data["2x2"] = emptyBox();
      saveData(); renderGroups(); renderStrip(); renderList();
    },
    stats: function () { return S.sessionStats(solves()); },
    openStats: openStats, closeStats: closeStats,
    exportPayload: function () { return { app: "mrcube-timer", version: 2, events: data }; },
    csTimerPayload: csTimerPayload,     /* csTimer TXT 导出的对象结构（测试用） */
    plainText: plainText,               /* 纯时间列表 TXT 内容（测试用） */
    parseImport: parseImport,
    mergeEvents: mergeEvents,
    /* 分组相关 */
    groups: function (k) {
      k = k || opt.event;
      var box = eventBox(k);
      return box.groups.map(function (g) {
        return { id: g.id, name: g.name, n: g.solves.length, cur: g.id === box.cur };
      });
    },
    solvesOf: function (k) { return allSolves(k).slice(); },
    curGroup: function (k) { var g = curGroup(k); return { id: g.id, name: g.name, n: g.solves.length }; },
    allSolves: function () { return allSolves(opt.event).slice(); },
    selectGroup: selectGroup, createGroup: createGroup, deleteGroup: deleteGroup,
    clearGroup: clearGroup,
    mergeTxt: function (txt) {          /* 解析并直接合并（csTimer 文件按猜测自动映射；测试用） */
      var p = parseImport(txt);
      if (!p) return -1;
      if (p.empty) return 0;
      if (p.groups) {
        var picks = [];
        ["3x3", "2x2"].forEach(function (k) {
          (p.groups[k] || []).forEach(function (g) { picks.push({ event: k, name: g.name, solves: g.solves }); });
        });
        return importSessions(picks).added;
      }
      if (!p.csTimer) return mergeEvents(p.events).added;
      var picks2 = [];
      p.csTimer.forEach(function (s) {
        if (s.guess) picks2.push({ event: s.guess, name: s.label, solves: s.solves });
      });
      return importSessions(picks2).added;
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
          tag: row.querySelector(".tm-map__tag").textContent,
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
