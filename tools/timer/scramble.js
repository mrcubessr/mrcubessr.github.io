/* =========================================================
   tools/timer/scramble.js — WCA 风格打乱生成器
   暴露：window.TimerScramble = { gen(event, n?), gen222(n?), gen333(n?), gen444(n?), gen555(n?) }

   规则（与 WCA / csTimer 的显示习惯一致）：
   · 三阶 3x3：默认 20 步随机转动，相邻两步不在同一轴上
     （即 R L / U D / F B 不会相邻，同面也不会相邻）
   · 二阶 2x2：默认 11 步，只使用 R / U / F 三个面
     (2x2 无固定中心块，只用 R U F 即可覆盖全部状态，是 WCA 惯例)
   · 四阶 4x4：默认 40 步，外层 U D R L F B + 宽层 Rw Lw Uw Dw Fw Bw
   · 五阶 5x5：默认 60 步，招式集合同四阶（WCA 五阶官方同样只到 Rw 这一级宽层）
   · 大魔方沿用本站三阶的约定：相邻两步不同轴（R/L/Rw/Lw 算同一根 x 轴…），
     相邻不重复让打乱更"散"，也不会出现 Rw R 这类粘连手感
   · 每个面随机取 「无后缀 / ' / 2」三种转动
   ========================================================= */
(function (root) {
  "use strict";

  var SUF = ["", "'", "2"];
  var AXIS_333 = { U: "y", D: "y", R: "x", L: "x", F: "z", B: "z" };
  /* 大魔方（四阶 / 五阶）：招式 + 所属轴。宽层与外层共用同一根轴 */
  var BIG_MOVES = [
    { m: "U",  a: "y" }, { m: "D",  a: "y" }, { m: "R",  a: "x" }, { m: "L",  a: "x" },
    { m: "F",  a: "z" }, { m: "B",  a: "z" },
    { m: "Rw", a: "x" }, { m: "Lw", a: "x" }, { m: "Uw", a: "y" }, { m: "Dw", a: "y" },
    { m: "Fw", a: "z" }, { m: "Bw", a: "z" }
  ];

  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* ---------- 三阶：20 步，禁止同轴相邻 ---------- */
  function gen333(n) {
    n = n > 0 ? n : 20;
    var FACES = ["U", "D", "R", "L", "F", "B"];
    var out = [], prevAxis = "";
    for (var i = 0; i < n; i++) {
      var f;
      do { f = pick(FACES); } while (AXIS_333[f] === prevAxis);
      out.push(f + pick(SUF));
      prevAxis = AXIS_333[f];
    }
    return out;
  }

  /* ---------- 二阶：11 步，只用 R / U / F ---------- */
  function gen222(n) {
    n = n > 0 ? n : 11;
    var FACES = ["R", "U", "F"];
    var out = [], prev = "";
    for (var i = 0; i < n; i++) {
      var f;
      do { f = pick(FACES); } while (f === prev);
      out.push(f + pick(SUF));
      prev = f;
    }
    return out;
  }

  /* ---------- 四阶 / 五阶：随机步数（40 / 60），外层 + 宽层，禁止同轴相邻 ---------- */
  function genBig(n) {
    n = n > 0 ? n : 40;
    var out = [], prevAxis = "";
    for (var i = 0; i < n; i++) {
      var mv;
      do { mv = pick(BIG_MOVES); } while (mv.a === prevAxis);
      out.push(mv.m + pick(SUF));
      prevAxis = mv.a;
    }
    return out;
  }
  function gen444(n) { return genBig(n > 0 ? n : 40); }
  function gen555(n) { return genBig(n > 0 ? n : 60); }

  function gen(event, n) {
    if (event === "2x2") return gen222(n || 11);
    if (event === "4x4") return gen444(n || 40);
    if (event === "5x5") return gen555(n || 60);
    return gen333(n || 20);
  }

  root.TimerScramble = { gen: gen, gen222: gen222, gen333: gen333, gen444: gen444, gen555: gen555 };
})(typeof window !== "undefined" ? window : globalThis);
