/* =========================================================
   rubik-core.js — 3x3 魔方贴纸模型（54 贴纸 · 六面 3x3）
   ---------------------------------------------------------
   6 个转动全部按「环序法」重新推导，并用 pycuber 严格校验：
     · 单式定式校验（23 条）全通过
     · 随机序列校验（300 组 / 1~25 步）全通过
   校验脚本：tools/cfop/scripts/verify_cube_model.py

   注：旧版 cross-trainer.js 内嵌的模型 U / R / L 三个转动方向
   与条带内部顺序有误（会产出现实中不存在的魔方状态），此文件为修正版。

   对外接口（挂到 window.RubikCore / globalThis.RubikCore）：
     COLOR_ORDER  ["U","D","L","R","F","B"]
     newCube()                     → 6 面 9 格 facelet 对象，每面为长度 9 的数组
     clone(cube)
     apply(cube, move)             → 就地执行 "R" / "R'" / "R2"
     applyAlg(cube, "R U R'")      → 就地执行空格分隔的公式（原地返回同一对象）
     isSolved(cube)
     scramble(n)                   → 长度 n 的合法打乱数组（同面 / 对面不相邻）
     invertMoves(moves)
     MOVES18                       → 18 个基本转动的数组
   ========================================================= */
(function (root) {
  "use strict";

  var COLOR_ORDER = ["U", "D", "L", "R", "F", "B"];
  var SOLVED = { U: "w", R: "r", F: "g", D: "y", L: "o", B: "b" };
  var OPP = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };
  var SUF = ["", "'", "2"];
  var MOVES18 = (function () {
    var a = [];
    ["U", "R", "F", "D", "L", "B"].forEach(function (f) {
      SUF.forEach(function (s) { a.push(f + s); });
    });
    return a;
  })();

  function rep(ch, n) {
    var s = [];
    for (var i = 0; i < n; i++) s.push(ch);
    return s;
  }

  function newCube() {
    var c = {};
    COLOR_ORDER.forEach(function (f) { c[f] = rep(SOLVED[f], 9); });
    return c;
  }

  function clone(cube) {
    var c = {};
    COLOR_ORDER.forEach(function (f) { c[f] = cube[f].slice(); });
    return c;
  }

  /* 单面顺时针旋转（按该面自身 net 视图：行主序 0..8） */
  function rot(f) {
    return [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
  }
  /* 取该面某条边带：t 上边 / b 下边 / l 左边 / r 右边 */
  function row(c, f, k) {
    if (k === "t") return [c[f][0], c[f][1], c[f][2]];
    if (k === "b") return [c[f][6], c[f][7], c[f][8]];
    if (k === "l") return [c[f][0], c[f][3], c[f][6]];
    return [c[f][2], c[f][5], c[f][8]];
  }
  function setRow(c, f, k, a) {
    if (k === "t") { c[f][0] = a[0]; c[f][1] = a[1]; c[f][2] = a[2]; }
    else if (k === "b") { c[f][6] = a[0]; c[f][7] = a[1]; c[f][8] = a[2]; }
    else if (k === "l") { c[f][0] = a[0]; c[f][3] = a[1]; c[f][6] = a[2]; }
    else { c[f][2] = a[0]; c[f][5] = a[1]; c[f][8] = a[2]; }
  }
  function rev(a) { return [a[2], a[1], a[0]]; }

  /* 6 个基本顺时针转动：旋转本面 + 相邻 4 条贴纸带按环序循环
     环序法：以「环序 + 四分之一圈」统一定向，避免条带内部顺序写反。 */
  var MOVES = {
    /* 上视：B→R→F→L→B */
    U: function (c) {
      c.U = rot(c.U);
      var f = row(c, "F", "t"), r = row(c, "R", "t"), b = row(c, "B", "t"), l = row(c, "L", "t");
      setRow(c, "F", "t", r); setRow(c, "R", "t", b); setRow(c, "B", "t", l); setRow(c, "L", "t", f);
    },
    /* 下视：F→R→B→L→F */
    D: function (c) {
      c.D = rot(c.D);
      var f = row(c, "F", "b"), r = row(c, "R", "b"), b = row(c, "B", "b"), l = row(c, "L", "b");
      setRow(c, "R", "b", f); setRow(c, "B", "b", r); setRow(c, "L", "b", b); setRow(c, "F", "b", l);
    },
    /* 右视：U→B→D→F→U */
    R: function (c) {
      c.R = rot(c.R);
      var u = row(c, "U", "r"), b = row(c, "B", "l"), d = row(c, "D", "r"), f = row(c, "F", "r");
      setRow(c, "U", "r", f); setRow(c, "B", "l", rev(u));
      setRow(c, "D", "r", rev(b)); setRow(c, "F", "r", d);
    },
    /* 左视：U→F→D→B→U */
    L: function (c) {
      c.L = rot(c.L);
      var u = row(c, "U", "l"), b = row(c, "B", "r"), d = row(c, "D", "l"), f = row(c, "F", "l");
      setRow(c, "F", "l", u); setRow(c, "D", "l", f);
      setRow(c, "B", "r", rev(d)); setRow(c, "U", "l", rev(b));
    },
    /* 前视：U→R→D→L→U */
    F: function (c) {
      c.F = rot(c.F);
      var u = row(c, "U", "b"), r = row(c, "R", "l"), d = row(c, "D", "t"), l = row(c, "L", "r");
      setRow(c, "R", "l", u); setRow(c, "D", "t", rev(r));
      setRow(c, "L", "r", d); setRow(c, "U", "b", rev(l));
    },
    /* 后视：U→L→D→R→U */
    B: function (c) {
      c.B = rot(c.B);
      var u = row(c, "U", "t"), l = row(c, "L", "l"), d = row(c, "D", "b"), r = row(c, "R", "r");
      setRow(c, "U", "t", r); setRow(c, "L", "l", rev(u));
      setRow(c, "D", "b", l); setRow(c, "R", "r", rev(d));
    }
  };

  function apply(cube, move) {
    var m = /^([UDLRFB])(['2]?)$/.exec(move);
    if (!m) return cube;
    var base = MOVES[m[1]];
    var n = m[2] === "'" ? 3 : (m[2] === "2" ? 2 : 1);
    for (var i = 0; i < n; i++) base(cube);
    return cube;
  }

  function applyAlg(cube, alg) {
    String(alg).split(/\s+/).forEach(function (mv) { if (mv) apply(cube, mv); });
    return cube;
  }

  function isSolved(cube) {
    return COLOR_ORDER.every(function (f) {
      return cube[f].every(function (x) { return x === cube[f][0]; });
    });
  }

  /* 合法打乱：相邻两步不同面、不为对面 */
  function scramble(n) {
    var out = [], last = "", lastOpp = "";
    for (var i = 0; i < n; i++) {
      var f;
      do { f = COLOR_ORDER[Math.floor(Math.random() * COLOR_ORDER.length)]; }
      while (f === last || f === lastOpp);
      out.push(f + SUF[Math.floor(Math.random() * 3)]);
      lastOpp = OPP[f]; last = f;
    }
    return out;
  }

  function invertMoves(moves) {
    return moves.slice().reverse().map(function (m) {
      if (m.charAt(1) === "2") return m;
      return m.charAt(1) === "'" ? m.charAt(0) : m + "'";
    });
  }

  root.RubikCore = {
    COLOR_ORDER: COLOR_ORDER,
    SOLVED: SOLVED,
    OPP: OPP,
    MOVES18: MOVES18,
    newCube: newCube,
    clone: clone,
    apply: apply,
    applyAlg: applyAlg,
    isSolved: isSolved,
    scramble: scramble,
    invertMoves: invertMoves
  };
})(typeof window !== "undefined" ? window : globalThis);
