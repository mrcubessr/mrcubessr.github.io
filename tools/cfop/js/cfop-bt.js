/**
 * cfop-bt.js —— CFOP 公式训练器接智能魔方
 *
 * 作用：连接智能魔方后，在「练习浮层」里
 *   ① 第一次转动自动起表（不用先去按空格）；
 *   ② 抓取本次实际转动序列；
 *   ③ 停表后把「实际转动」与「目标公式」做归一化比对，给出一致/不一致提示。
 *
 * 边界：不改动 cfop-trainer.js 的键盘长按逻辑，只通过 window.CFOP._bt 起停。
 * 比对带容差：忽略 AUF（首尾 U 转）、忽略整体转体 y，并尝试 4 个朝向。
 * 结果仅供参考（智能魔方上报的转动以魔方自身坐标系为准），UI 上会明确标注。
 */
(function () {
  "use strict";

  /* ============ 纯函数区：公式归一化与比对（可单测） ============ */

  /* ⚠️ 设计口径：比对【不做整体转体 y 的容差】。
     曾尝试「尝试 4 个朝向」——会把 F U F' U' 误判成与 R U R' U' 一致，
     但两者在不同朝向下执行是不同公式、结果也不同，属误判。
     OLL/PLL 的 case 是按魔方自身朝向定义的，严格比对才是对的；
     唯一放宽的是 AUF（首尾 U 转），因为 AUF 本就随意。 */

  /* 解析公式串 → [{f, n}]，n∈{1,2,3}（' = 3）。丢弃 x/y/z 整体转体。 */
  function parseAlg(s) {
    var out = [];
    var str = String(s || "").replace(/[()\[\],]/g, " ");
    var re = /([UDLRFBMESXYZ])(['’`]?)(2?)/gi, m;
    while ((m = re.exec(str))) {
      var f = m[1].toUpperCase();
      if (f === "X" || f === "Y" || f === "Z") continue;      /* 整体转体不参与比对 */
      var prime = !!m[2], two = !!m[3];
      var base = two ? 2 : 1;
      var n = prime ? (4 - base) % 4 : base;
      if (n === 0) continue;
      out.push({ f: f, n: n });
    }
    return out;
  }

  /* 相邻同面合并取模 4，消去 0 */
  function cancel(seq) {
    var out = [];
    for (var i = 0; i < seq.length; i++) {
      var last = out[out.length - 1];
      if (last && last.f === seq[i].f) {
        var n = (last.n + seq[i].n) % 4;
        if (n === 0) out.pop(); else last.n = n;
      } else out.push({ f: seq[i].f, n: seq[i].n });
    }
    return out;
  }

  /* 去掉首尾的 U 转（AUF 容差） */
  function stripAUF(seq) {
    var a = seq.slice();
    while (a.length && a[0].f === "U") a.shift();
    while (a.length && a[a.length - 1].f === "U") a.pop();
    return a;
  }

  function key(seq) { return seq.map(function (m) { return m.f + m.n; }).join(" "); }

  function normAlg(s) {
    return stripAUF(cancel(parseAlg(s)));
  }

  /* 实际转动 vs 目标公式：两侧都去首尾 AUF 后严格比对。
     已知取舍：末尾少一个 U' 无法与「AUF」区分（如 R U R' vs R U R' U'），
     这是 AUF 容差的固有代价，UI 上会同时显示实际转动供人工确认。 */
  function algMatch(captured, target) {
    var t = normAlg(target);
    if (!t.length) return false;
    return key(normAlg(captured)) === key(t);
  }

  /* 把 [{f,n}] 渲染回可读公式串（展示「实际转动」用） */
  function fmtSeq(seq) {
    return seq.map(function (m) {
      return m.f + (m.n === 2 ? "2" : (m.n === 3 ? "'" : ""));
    }).join(" ");
  }

  /* 暴露纯函数便于单测 */
  window.CFOPBT = { parseAlg: parseAlg, cancel: cancel, stripAUF: stripAUF, normAlg: normAlg, algMatch: algMatch, fmtSeq: fmtSeq };

  /* ============ 页面接线 ============ */

  var conn = null;
  var buf = [];            /* 本次练习捕获的转动 */
  var capturing = false;
  var btn = null, hintEl = null;

  function whenReady(fn) {
    if (window.BTCube) { fn(); return; }
    document.addEventListener("btcube:ready", fn, { once: true });
  }
  function hasBt() { return window.CFOP && window.CFOP._bt; }

  function targetAlgText() {
    var el = document.getElementById("c4-p-alg");
    return el ? (el.textContent || "").trim() : "";
  }

  /* 停表后把比对结果追加到 summary（pStopTimer 会重写 summary，故在其之后写） */
  function finishCheck() {
    if (!capturing) return;
    capturing = false;
    var target = targetAlgText();
    var actual = buf.slice();
    buf = [];
    if (!actual.length) return;
    var shown = fmtSeq(cancel(actual));
    var ok = algMatch(actual, target);
    var box = document.getElementById("c4-p-summary");
    if (!box) return;
    var line = document.createElement("div");
    line.className = "c4-btline";
    line.innerHTML =
      '<span class="c4-btline__tag ' + (ok ? "is-ok" : "is-bad") + '">' +
      (ok ? "✓ 与公式一致" : "≠ 与公式不一致") + '</span>' +
      '<span class="c4-btline__actual">实际转动：' + (shown || "—") + "</span>";
    box.appendChild(line);
  }

  /* 监听练习计时状态：进入 done 即视为本次结束 */
  function watchTimer() {
    var el = document.getElementById("c4-p-timer");
    if (!el) return;
    new MutationObserver(function () {
      if (el.dataset.state === "done") finishCheck();
    }).observe(el, { attributes: true, attributeFilter: ["data-state"] });
  }

  function connect() {
    hint("正在搜索智能魔方…");
    window.BTCube.connectCube({
      onMove: function (ev) {
        if (!hasBt()) return;
        var mv = ev && (ev.move || (ev.face ? ev.face + (ev.direction === -1 ? "'" : "") : ""));
        if (!mv) return;
        if (!capturing) {
          /* 练习浮层打开且处于待计时状态 → 第一次转动自动起表 */
          if (window.CFOP._bt.open() && window.CFOP._bt.state() !== "running") {
            window.CFOP._bt.start();
          }
          capturing = true;
          buf = [];
        }
        buf.push(String(mv));
      },
      onDisconnect: function () { reset(); hint("智能魔方已断开"); },
      onError: function (e) { reset(); hint("连接失败：" + ((e && e.message) || e)); }
    }).then(function () {
      conn = true;
      btn.textContent = "断开魔方";
      hint("已连接：打乱后在练习浮层里直接转公式，第一次转动自动起表");
      watchTimer();
    }).catch(function (e) { reset(); hint("连接失败：" + ((e && e.message) || e)); });
  }

  function reset() {
    try { window.BTCube.disconnect(); } catch (e) {}
    conn = null; capturing = false; buf = [];
    if (btn) btn.textContent = "智能魔方";
  }

  function hint(t) { if (hintEl) { hintEl.textContent = t || ""; hintEl.hidden = !t; } }

  function boot() {
    whenReady(function () {
      /* ⚠️ 工具条 .c4-bar 是 CFOP.mount() 之后才注入的，且 mount 可能晚于
         DOMContentLoaded（数据到位后才建骨架）。一次性查找会落空，故轮询等待。 */
      var tries = 0;
      var iv = setInterval(function () {
        var bar = document.querySelector(".c4-bar");
        if (bar) { clearInterval(iv); inject(bar); return; }
        if (++tries > 60) clearInterval(iv);          /* 最多等 ~12s，失败就静默放弃 */
      }, 200);
    });
  }

  function inject(bar) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "c4-bt-cube";
    btn.className = "c4-navbtn";
    btn.textContent = "智能魔方";
    hintEl = document.createElement("span");
    hintEl.className = "c4-bt-hint";
    hintEl.hidden = true;
    bar.appendChild(btn);
    bar.appendChild(hintEl);

    if (!window.BTCube.supported()) {
      btn.hidden = true;
      hint(window.BTCube.isIOS()
        ? "iOS 的 Safari 不支持网页蓝牙 —— 请改用 Bluefy 浏览器"
        : "当前浏览器不支持 Web 蓝牙 —— 请用 Chrome / Edge");
      return;
    }
    btn.addEventListener("click", function () {
      if (conn) { reset(); hint("已断开"); return; }
      connect();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
