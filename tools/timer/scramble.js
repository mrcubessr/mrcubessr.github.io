/* =========================================================
   tools/timer/scramble.js — WCA 风格打乱生成器
   暴露：window.TimerScramble = { gen(event, n?), gen222(n?), gen333(n?) }

   规则（与 WCA / csTimer 的显示习惯一致）：
   · 三阶 3x3：默认 20 步随机转动，相邻两步不在同一轴上
     （即 R L / U D / F B 不会相邻，同面也不会相邻）
   · 二阶 2x2：默认 11 步，只使用 R / U / F 三个面
     （2x2 无固定中心块，只用 R U F 即可覆盖全部状态，是 WCA 惯例）
   · 每个面随机取 「无后缀 / ' / 2」三种转动
   ========================================================= */
(function (root) {
  "use strict";

  var SUF = ["", "'", "2"];
  var AXIS_333 = { U: "y", D: "y", R: "x", L: "x", F: "z", B: "z" };

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

  function gen(event, n) {
    if (event === "2x2") return gen222(n || 11);
    return gen333(n || 20);
  }

  root.TimerScramble = { gen: gen, gen222: gen222, gen333: gen333 };
})(typeof window !== "undefined" ? window : globalThis);
