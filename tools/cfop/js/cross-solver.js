/* =========================================================
   cross-solver.js — 十字（Cross）最优解求解与打乱生成
   ---------------------------------------------------------
   依赖 rubik-core.js。核心思路：
     1. 从贴纸模型推导 18 个转动对「12 个棱块槽位」的置换 PERM 与翻转 FLIP；
     2. 只跟踪十字色的 4 个棱块，状态编码 = 4 个 base24 位（槽位×2+朝向），
        规模 24^4 = 331776，可达状态 190080；
     3. 从还原态做 BFS 得到「到还原态的十字最优步数」表（半步制，R2 记 1 步）。
        分布（任一颜色）：0:1 1:15 2:158 3:1394 4:9809 5:46381 6:97254 7:34966 8:102
        与公开理论值一致，最大 8 步（God's number for the cross）。
     4. 打乱生成：拒绝采样 —— 随机生成 ≤maxLen 步合法打乱，取十字最优步数恰为 N 的。
        实测命中率（10 步打乱）：N=1 0.78% N=2 5.7% N=3 17.9% N=4 28.9%
        N=5 29.4% N=6 16.0% N=7 1.33%；N=8 在 ≤10 步打乱下概率 < 2.5e-6，
        故 N=8 改用构造法：造一个最优 8 步的状态，取其解的逆作为打乱基底，
        再插入「十字恒等步」（对面层转动不改变十字状态）凑到目标长度。

   对外接口（window.CrossSolver）：
     COLORS                      → [{ key, face, label }]（6 色）
     COLORS_BY_KEY
     distance(color, moves)      → 十字最优步数（number，或 255 表示不可达/非法）
     solve(color, moves)         → 最优解法数组（长度 = distance）
     analyze(color, moves)       → { steps, solution }
     generate(color, steps, maxLen) → { moves, solution, steps, color, length }
     MAX_STEPS                   → 8
     DEFAULT_MAX_LEN             → 10
   ========================================================= */
(function (root) {
  "use strict";

  var R = root.RubikCore;
  if (!R) throw new Error("cross-solver.js 需要先加载 rubik-core.js");

  var COLORS = [
    { key: "w", face: "U", label: "白" },
    { key: "y", face: "D", label: "黄" },
    { key: "g", face: "F", label: "绿" },
    { key: "b", face: "B", label: "蓝" },
    { key: "r", face: "R", label: "红" },
    { key: "o", face: "L", label: "橙" }
  ];
  var COLORS_BY_KEY = {};
  COLORS.forEach(function (c) { COLORS_BY_KEY[c.key] = c; });

  var MAX_STEPS = 8;
  var DEFAULT_MAX_LEN = 10;
  var UNREACHABLE = 255;

  /* ---------- 12 个棱块槽位（按标准 facelet 约定） ---------- */
  var EDGE_PAIRS = [
    [["U", 5], ["R", 1]], [["U", 7], ["F", 1]], [["U", 3], ["L", 1]], [["U", 1], ["B", 1]],
    [["D", 5], ["R", 7]], [["D", 1], ["F", 7]], [["D", 3], ["L", 7]], [["D", 7], ["B", 7]],
    [["F", 5], ["R", 3]], [["F", 3], ["L", 5]], [["B", 5], ["L", 3]], [["B", 3], ["R", 5]]
  ];
  var SOLVED = R.SOLVED;
  /* 第 i 号小方块的「本色对」（顺序即朝向基准） */
  var CANON = EDGE_PAIRS.map(function (p) { return [SOLVED[p[0][0]], SOLVED[p[1][0]]]; });

  var PIECE_OF_PAIR = {};
  CANON.forEach(function (pair, i) { PIECE_OF_PAIR[pair.slice().sort().join("")] = i; });

  /* ---------- 由贴纸模型推导 18 个转动的棱块置换 / 翻转（索引均为「当前槽位」） ---------- */
  var PERM = {}, FLIP = {};
  R.MOVES18.forEach(function (mv) {
    var c = R.applyAlg(R.newCube(), mv);
    var perm = new Array(12), flip = new Array(12);
    for (var j = 0; j < 12; j++) {
      var a = c[EDGE_PAIRS[j][0][0]][EDGE_PAIRS[j][0][1]];
      var b = c[EDGE_PAIRS[j][1][0]][EDGE_PAIRS[j][1][1]];
      var k = PIECE_OF_PAIR[[a, b].sort().join("")];
      perm[k] = j;                                   /* 小方块 k（原位槽 k）移动后的槽位 */
      flip[k] = a === CANON[k][0] ? 0 : 1;           /* 该槽位是否被翻转 */
    }
    PERM[mv] = perm;
    FLIP[mv] = flip;
  });

  /* ---------- 编码 / 转移（base24：4 位 × (槽位×2+朝向)） ---------- */
  var POW = [1, 24, 576, 13824];
  var SIZE = 24 * 24 * 24 * 24;
  var LO = {}, HI = {};
  R.MOVES18.forEach(function (mv) {
    var perm = PERM[mv], flip = FLIP[mv];
    var lo = new Uint16Array(576), hi = new Uint16Array(576);
    function one(v) { return perm[v >> 1] * 2 + ((v & 1) ^ flip[v >> 1]); }
    for (var v = 0; v < 576; v++) {
      var a0 = v % 24, a1 = (v / 24) | 0;
      var b0 = v % 24, b1 = (v / 24) | 0;
      lo[v] = one(a0) + one(a1) * 24;
      hi[v] = one(b0) + one(b1) * 24;
    }
    LO[mv] = lo; HI[mv] = hi;
  });

  function step(enc, mv) {
    return LO[mv][enc % 576] + HI[mv][(enc / 576) | 0] * 576;
  }

  var COLOR_EDGES = {};
  COLORS.forEach(function (c) {
    COLOR_EDGES[c.key] = [];
    for (var k = 0; k < 12; k++) {
      if (CANON[k][0] === c.key || CANON[k][1] === c.key) COLOR_EDGES[c.key].push(k);
    }
  });

  function startEnc(color) {
    var es = COLOR_EDGES[color], e = 0;
    for (var i = 0; i < 4; i++) e += es[i] * 2 * POW[i];
    return e;
  }
  function encAfter(moves, color) {
    var e = startEnc(color);
    for (var i = 0; i < moves.length; i++) e = step(e, moves[i]);
    return e;
  }

  /* ---------- 距离表（按颜色惰性构建 + 缓存） ---------- */
  var TABLES = {}, STATE_LISTS = {};
  function table(color) {
    if (TABLES[color]) return TABLES[color];
    var dist = new Uint8Array(SIZE);
    dist.fill(UNREACHABLE);
    var goal = startEnc(color);
    dist[goal] = 0;
    var q = new Int32Array(200000);
    var head = 0, tail = 0;
    q[tail++] = goal;
    var moves = R.MOVES18;
    while (head < tail) {
      var e = q[head++];
      var nd = dist[e] + 1;
      var lo = e % 576, hi = (e / 576) | 0;
      for (var i = 0; i < 18; i++) {
        var m = moves[i];
        var nx = LO[m][lo] + HI[m][hi] * 576;
        if (dist[nx] === UNREACHABLE) { dist[nx] = nd; q[tail++] = nx; }
      }
    }
    TABLES[color] = dist;
    return dist;
  }

  /* 收集某一最优步数下的全部状态（用于构造法随机取靶） */
  function statesAt(color, depth) {
    var key = color + depth;
    if (STATE_LISTS[key]) return STATE_LISTS[key];
    var d = table(color), list = [];
    for (var e = 0; e < SIZE; e++) if (d[e] === depth) list.push(e);
    STATE_LISTS[key] = list;
    return list;
  }

  function distance(color, moves) {
    var d = table(color)[encAfter(moves, color)];
    return d === UNREACHABLE ? UNREACHABLE : d;
  }

  /* 贪心下降求最优解（BFS 距离保证每步都能找到 -1 的邻居）。
     在等优的候选步里优先挑「不与上一步构成对面相邻」的那一步，
     这样解法与由其反推的打乱都保持 WCA 风格（同面/对面不相邻）。 */
  function solveEnc(color, enc) {
    var d = table(color), cur = enc, curD = d[cur], out = [];
    if (curD === UNREACHABLE) return out;
    var guard = 0, prev = "";
    while (curD > 0 && guard++ < 32) {
      var good = [], ok = [];
      for (var i = 0; i < 18; i++) {
        var m = R.MOVES18[i], nx = step(cur, m);
        if (d[nx] !== curD - 1) continue;
        ok.push(i);
        if (!prev || (m.charAt(0) !== R.OPP[prev] && m.charAt(0) !== prev)) good.push(i);
      }
      if (!ok.length) break;
      var pool = good.length ? good : ok;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      out.push(R.MOVES18[pick]);
      cur = step(cur, R.MOVES18[pick]);
      curD--; prev = R.MOVES18[pick].charAt(0);
    }
    return out;
  }

  /* 相邻两步是否为「同面或对面」——合法打乱不应出现 */
  function hasBadAdjacent(moves) {
    for (var i = 1; i < moves.length; i++) {
      var a = moves[i - 1].charAt(0), b = moves[i].charAt(0);
      if (a === b || a === R.OPP[b]) return true;
    }
    return false;
  }

  function solve(color, moves) { return solveEnc(color, encAfter(moves, color)); }

  function analyze(color, moves) {
    var enc = encAfter(moves, color);
    var d = table(color)[enc];
    return { steps: d === UNREACHABLE ? -1 : d, solution: d === UNREACHABLE ? [] : solveEnc(color, enc) };
  }

  /* ---------- 构造法：用于 ≤10 步打乱下极小概率命中的高步数（N=8） ---------- */
  function idxOf(mv) { return R.MOVES18.indexOf(mv); }

  /* 在序列中插入一个「十字恒等步」：十字棱块所在的层之外只有对面层，
     对面层转动不影响十字的槽位与朝向，故可任意插入而不改变十字最优步数。 */
  function tryInsert(arr, face, tries) {
    var banned = {}; banned[face] = 1; banned[R.OPP[face]] = 1;
    for (var t = 0; t < (tries || 40); t++) {
      var p = Math.floor(Math.random() * (arr.length + 1));
      var mv = face + ["", "'", "2"][Math.floor(Math.random() * 3)];
      var prev = p > 0 ? arr[p - 1].charAt(0) : "";
      var next = p < arr.length ? arr[p].charAt(0) : "";
      if (prev && (banned[prev] || prev === mv.charAt(0))) continue;
      if (next && banned[next]) continue;
      if (prev === next && prev === R.OPP[face]) continue;
      arr.splice(p, 0, mv);
      return true;
    }
    return false;
  }

  function construct(color, steps, maxLen) {
    var tbl = table(color);
    var list = statesAt(color, steps);
    if (!list.length) return null;
    var total = Math.min(maxLen, DEFAULT_MAX_LEN);
    for (var attempt = 0; attempt < 60; attempt++) {
      var target = list[Math.floor(Math.random() * list.length)];
      var sol = solveEnc(color, target);           /* 该状态的 steps 步最优解 */
      if (sol.length !== steps) continue;
      var out = R.invertMoves(sol);                /* 反序+逆转动：把还原态变成 target */
      var idFace = R.OPP[COLORS_BY_KEY[color].face];
      var need = total - out.length;
      var ok = true;
      for (var i = 0; i < need; i++) {
        if (!tryInsert(out, idFace, 60)) { ok = false; break; }
      }
      if (!ok) continue;
      if (out.length > total) continue;
      if (hasBadAdjacent(out)) continue;
      if (tbl[encAfter(out, color)] !== steps) continue;
      return out;
    }
    return null;
  }

  /* ---------- 打乱生成 ---------- */
  function generate(color, steps, maxLen) {
    color = COLORS_BY_KEY[color] ? color : "w";
    steps = Math.max(1, Math.min(MAX_STEPS, steps | 0 || 1));
    maxLen = Math.max(4, Math.min(DEFAULT_MAX_LEN, maxLen || DEFAULT_MAX_LEN));
    var tbl = table(color);

    /* N ≤ 7：拒绝采样几乎必然秒中（最差 N=7 约 1.3% 命中率）。 */
    if (steps <= 7) {
      var lo = Math.max(steps + 2, 5);
      if (lo > maxLen) lo = maxLen;
      for (var att = 0; att < 40000; att++) {
        var L = lo + Math.floor(Math.random() * (maxLen - lo + 1));
        var s = R.scramble(L);
        if (tbl[encAfter(s, color)] === steps) return pack(s, color, steps);
      }
    }
    /* N=8（或兜底）：构造法。 */
    var built = construct(color, steps, maxLen);
    if (built) return pack(built, color, steps);
    /* 最后兜底：放宽到更长打乱再拒绝采样。 */
    for (var k = 0; k < 200000; k++) {
      var s2 = R.scramble(Math.min(12, 10 + (k % 3)));
      if (tbl[encAfter(s2, color)] === steps) return pack(s2, color, steps);
    }
    return null;
  }

  function pack(moves, color, steps) {
    var a = analyze(color, moves);
    return {
      moves: moves.slice(),
      solution: a.solution,
      steps: a.steps,
      color: color,
      length: moves.length
    };
  }

  root.CrossSolver = {
    COLORS: COLORS,
    COLORS_BY_KEY: COLORS_BY_KEY,
    COLOR_EDGES: COLOR_EDGES,
    MAX_STEPS: MAX_STEPS,
    DEFAULT_MAX_LEN: DEFAULT_MAX_LEN,
    UNREACHABLE: UNREACHABLE,
    EDGE_PAIRS: EDGE_PAIRS,
    table: table,
    distance: distance,
    solve: solve,
    analyze: analyze,
    generate: generate
  };
})(typeof window !== "undefined" ? window : globalThis);
