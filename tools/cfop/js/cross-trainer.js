/* =========================================================
   cross-trainer.js — 十字训练器（自包含，无外部依赖）
   功能：随机打乱生成、3D 立体视图、计时器、3D 可视化链接。
   立方体模型为 6 面 3x3 标准 facelet，所有转动互为逆元、四次幂还原。
   ========================================================= */
(function () {
  "use strict";

  // 颜色：白 w / 黄 y / 绿 g / 蓝 b / 红 r / 橙 o
  var SOLVED = { U: "w", R: "r", F: "g", D: "y", L: "o", B: "b" };

  function newCube() {
    var c = {};
    Object.keys(SOLVED).forEach(function (f) { c[f] = rep(SOLVED[f], 9); });
    return c;
  }
  function rep(ch, n) { var s = ""; for (var i = 0; i < n; i++) s += ch; return s.split(""); }

  function rot(face) {
    return [face[6], face[3], face[0], face[7], face[4], face[1], face[8], face[5], face[2]];
  }
  function row(c, f, k) {
    if (k === "t") return [c[f][0], c[f][1], c[f][2]];
    if (k === "b") return [c[f][6], c[f][7], c[f][8]];
    if (k === "l") return [c[f][0], c[f][3], c[f][6]];
    return [c[f][2], c[f][5], c[f][8]]; // r
  }
  function setRow(c, f, k, a) {
    if (k === "t") { c[f][0] = a[0]; c[f][1] = a[1]; c[f][2] = a[2]; }
    else if (k === "b") { c[f][6] = a[0]; c[f][7] = a[1]; c[f][8] = a[2]; }
    else if (k === "l") { c[f][0] = a[0]; c[f][3] = a[1]; c[f][6] = a[2]; }
    else { c[f][2] = a[0]; c[f][5] = a[1]; c[f][8] = a[2]; }
  }

  // 每个面的基础顺时针转动：旋转本面 + 相邻 4 条贴纸带循环（new[i]=old[i-1]）
  var MOVES = {
    U: function (c) {
      c.U = rot(c.U);
      var a = row(c, "F", "t"), b = row(c, "R", "t"), d = row(c, "B", "t"), e = row(c, "L", "t");
      setRow(c, "F", "t", e); setRow(c, "R", "t", a); setRow(c, "B", "t", b); setRow(c, "L", "t", d);
    },
    D: function (c) {
      c.D = rot(c.D);
      var a = row(c, "F", "b"), b = row(c, "R", "b"), d = row(c, "B", "b"), e = row(c, "L", "b");
      setRow(c, "F", "b", e); setRow(c, "R", "b", a); setRow(c, "B", "b", b); setRow(c, "L", "b", d);
    },
    F: function (c) {
      c.F = rot(c.F);
      var a = row(c, "U", "b"), b = row(c, "R", "l"), d = row(c, "D", "t"), e = row(c, "L", "r");
      setRow(c, "U", "b", e); setRow(c, "R", "l", a); setRow(c, "D", "t", b); setRow(c, "L", "r", d);
    },
    R: function (c) {
      c.R = rot(c.R);
      var a = row(c, "U", "r"), b = row(c, "F", "r"), d = row(c, "D", "r"), e = row(c, "B", "l");
      setRow(c, "U", "r", e); setRow(c, "F", "r", a); setRow(c, "D", "r", b); setRow(c, "B", "l", d);
    },
    L: function (c) {
      c.L = rot(c.L);
      var a = row(c, "U", "l"), b = row(c, "B", "r"), d = row(c, "D", "l"), e = row(c, "F", "l");
      setRow(c, "U", "l", e); setRow(c, "B", "r", a); setRow(c, "D", "l", b); setRow(c, "F", "l", d);
    },
    B: function (c) {
      c.B = rot(c.B);
      var a = row(c, "U", "t"), b = row(c, "L", "l"), d = row(c, "D", "b"), e = row(c, "R", "r");
      setRow(c, "U", "t", e); setRow(c, "L", "l", a); setRow(c, "D", "b", b); setRow(c, "R", "r", d);
    }
  };

  function apply(c, move) {
    var m = move.match(/^([UDLRFB])(['2]?)$/);
    if (!m) return;
    var base = MOVES[m[1]], n = m[2] === "'" ? 3 : (m[2] === "2" ? 2 : 1);
    for (var i = 0; i < n; i++) base(c);
  }

  // ---------- 打乱生成 ----------
  var FACES = ["U", "D", "L", "R", "F", "B"];
  var SUF = ["", "'", "2"];
  function scramble(n) {
    var out = [], last = "", lastOpp = "";
    var opp = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };
    for (var i = 0; i < n; i++) {
      var f;
      do { f = FACES[Math.floor(Math.random() * 6)]; } while (f === last || f === lastOpp);
      var s = SUF[Math.floor(Math.random() * 3)];
      out.push(f + s);
      lastOpp = opp[f]; last = f;
    }
    return out;
  }

  // ---------- 立体视图（3D，替代六面展开图） ----------
  // 默认视角：从「下方偏前右」看 —— 底面朝向观察者，十字清晰可见；可拖拽旋转看全部 6 面。
  var VIEW = { yaw: -45, pitch: -40 };
  function draw(el, cube) {
    el.innerHTML = "";
    el.appendChild(Cube3D.render(cube, { yaw: VIEW.yaw, pitch: VIEW.pitch, size: 220 }));
  }

  // ---------- 计时器 ----------
  function Timer(elTimer) {
    var start = 0, running = false, raf = 0;
    function tick() {
      if (!running) return;
      var ms = performance.now() - start;
      elTimer.textContent = fmt(ms);
      raf = requestAnimationFrame(tick);
    }
    return {
      toggle: function () {
        if (running) { running = false; cancelAnimationFrame(raf); return fmt(performance.now() - start); }
        running = true; start = performance.now(); tick(); return null;
      },
      reset: function () { running = false; cancelAnimationFrame(raf); elTimer.textContent = "0.00"; }
    };
  }
  function fmt(ms) { return (ms / 1000).toFixed(2); }

  // ---------- 初始化页面 ----------
  function init() {
    var scrambleEl = document.getElementById("ct-scramble");
    var netEl = document.getElementById("ct-net");
    var timerEl = document.getElementById("ct-timer");
    var newBtn = document.getElementById("ct-new");
    var vizBtn = document.getElementById("ct-viz");
    if (!scrambleEl) return;
    var timer = Timer(timerEl);
    var current = null;

    function gen() {
      var moves = scramble(22);
      var cube = newCube();
      moves.forEach(function (m) { apply(cube, m); });
      current = cube;
      scrambleEl.textContent = moves.join(" ");
      draw(netEl, cube);
      vizBtn.href = "https://www.cubedb.net/?puzzle=3&scramble=" + moves.join("_");
      timer.reset();
    }
    newBtn.addEventListener("click", gen);

    // 拖拽旋转视角（鼠标 / 触摸），放开后可看全部 6 面
    (function drag() {
      var down = false, x0 = 0, y0 = 0, yaw0 = 0, pitch0 = 0;
      function start(e) {
        down = true; var p = pt(e); x0 = p.x; y0 = p.y; yaw0 = VIEW.yaw; pitch0 = VIEW.pitch;
        netEl.classList.add("is-drag");
      }
      function move(e) {
        if (!down) return;
        var p = pt(e);
        VIEW.yaw = yaw0 + (p.x - x0) * 0.6;
        VIEW.pitch = clamp(pitch0 + (p.y - y0) * 0.5, -89, 89);
        if (current) draw(netEl, current);
        if (e.cancelable) e.preventDefault();
      }
      function end() { down = false; netEl.classList.remove("is-drag"); }
      function pt(e) {
        var t = e.touches && e.touches[0];
        return { x: t ? t.clientX : e.clientX, y: t ? t.clientY : e.clientY };
      }
      netEl.addEventListener("mousedown", start);
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", end);
      netEl.addEventListener("touchstart", start, { passive: true });
      netEl.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", end);
    })();

    document.addEventListener("keydown", function (e) {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); timer.toggle(); }
    });
    gen();
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 导出供测试
  window.__ct = { newCube: newCube, apply: apply, scramble: scramble };
})();
