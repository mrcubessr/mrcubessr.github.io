/* =========================================================
   xcross-solver.js — X-Cross（十字 + 首对插入）求解
   ---------------------------------------------------------
   依赖 rubik-core.js（54 贴纸模型）、cross-solver.js（十字编码 / 距离表）。

   思路：把「十字 + 某一个 F2L 对一起解掉」建模为一个状态空间，
        用 IDA*（迭代加深 A*）求最优解。

   状态 = (crossEnc, pairEnc)
     · crossEnc：复用 cross-solver 的 4 棱编码（base24：槽位×2+朝向），
                 规模 24^4，可达 190080；距离表查 CrossSolver.table(color)。
     · pairEnc：所选 F2L 对的「角块位置/朝向 × 棱块位置/朝向」，
                 规模 8×3 × 12×2 = 576，自建 BFS 距离表。

   启发式 h = max( crossDist(crossEnc), pairDist(pairEnc) )，两个分量都是
   各自子问题到还原态的真实步数（可采纳 / admissible），故 h 可采纳，
   IDA* 找到的解是在搜索深度上限内的最优（合并）解。

   角块朝向：UD 色（w/y）在槽位三面帧里的下标（0 = 朝 U/D，即还原朝向）。
   棱块朝向：各棱块自带「基准色」（含 g/b 用之，否则用 w/y），
            取该基准色在槽位两面帧里的下标（0 = 在槽位首面，即还原朝向）。
            该约定对全部 12 条棱都良定义，且在编码/转移/目标三处自洽。

   公开接口（window.XCross）：
     PAIRS                 → [{ key, label, cornerSlot, edgeSlot }]
     solve(scramble, pairKey, opts)
                          → { ok, moves, length, crossLength, note } | fallback
     solveFromCube(cube, pairKey, opts)
   ========================================================= */
(function (root) {
  "use strict";

  var R = root.RubikCore;
  var CS = root.CrossSolver;
  if (!R) throw new Error("xcross-solver.js 需要先加载 rubik-core.js");
  if (!CS) throw new Error("xcross-solver.js 需要先加载 cross-solver.js");

  var MOVES18 = R.MOVES18;
  var SOLVED = R.SOLVED;
  var OPP = R.OPP;

  /* ---------- 12 个棱块槽位（直接复用 cross-solver 的，已校验正确） ---------- */
  var EDGE_PAIRS = CS.EDGE_PAIRS;

  /* ---------- 8 个角块槽位（UD 面放第一位，用于定义角块朝向） ----------
     顺序：URF, UFL, ULB, UBR（顶），DFR, DLF, DBL, DRB（底）。
     下标按 rubik-core 的 net 序号推导（已用 18 个转动逐槽校验为合法角）。 */
  var CORNER_SLOTS = [
    [["U", 8], ["R", 0], ["F", 2]],   /* URF */
    [["U", 6], ["F", 0], ["L", 2]],   /* UFL */
    [["U", 0], ["L", 0], ["B", 2]],   /* ULB */
    [["U", 2], ["B", 0], ["R", 2]],   /* UBR */
    [["D", 2], ["F", 8], ["R", 6]],   /* DFR */
    [["D", 0], ["L", 8], ["F", 6]],   /* DLF */
    [["D", 6], ["L", 6], ["B", 8]],   /* DBL */
    [["D", 8], ["R", 8], ["B", 6]]    /* DRB */
  ];

  /* 四对 F2L（白顶基准）：角块槽位 + 棱块槽位。
     cornerSlot/edgeSlot 即上面 CORNER_SLOTS / EDGE_PAIRS 的下标。 */
  var PAIRS = [
    { key: "FL", label: "FL（前左）", cornerSlot: 5, edgeSlot: 9 }, /* DLF + FL */
    { key: "FR", label: "FR（前右）", cornerSlot: 4, edgeSlot: 8 }, /* DFR + FR */
    { key: "BL", label: "BL（后左）", cornerSlot: 6, edgeSlot: 10 }, /* DBL + BL */
    { key: "BR", label: "BR（后右）", cornerSlot: 7, edgeSlot: 11 }  /* DRB + BR */
  ];
  var PAIR_BY_KEY = {};
  PAIRS.forEach(function (p) { PAIR_BY_KEY[p.key] = p; });

  /* ---------- 工具：从立方读出某槽位颜色（按槽位顺序） ---------- */
  function cornerColorsAt(cube, slot) {
    return [cube[slot[0][0]][slot[0][1]], cube[slot[1][0]][slot[1][1]], cube[slot[2][0]][slot[2][1]]];
  }
  function edgeColorsAt(cube, pair) {
    var f = pair[0][0], i = pair[0][1], g = pair[1][0], j = pair[1][1];
    return [cube[f][i], cube[g][j]];
  }
  function sig3(arr) { return arr.slice().sort().join(""); }
  function sig2(arr) { return arr.slice().sort().join(""); }

  /* 每个角块 / 棱块的「基准色」（用于良定义朝向）。
     角块：UD 色（w/y）恒在基准色；棱块：含 g/b 则用之，否则用 w/y。 */
  var CORNER_REF = CORNER_SLOTS.map(function (slot) {
    var sc = SOLVED[slot[0][0]]; return (sc === "w" || sc === "y") ? sc : "w";
  });
  var EDGE_REF = EDGE_PAIRS.map(function (pair) {
    var a = SOLVED[pair[0][0]], b = SOLVED[pair[1][0]];
    if (a === "g" || a === "b") return a;
    if (b === "g" || b === "b") return b;
    return (a === "w" || a === "y") ? a : b;
  });

  /* ---------- 角块 / 棱块转移表（与具体对无关，只与「位置」有关） ----------
     对每步 mv 与每个源槽位 s，记录：
       · pos[s]：槽位 s 的块经 mv 后去哪个槽位；
       · perm[s]：3（角）/2（棱）个面的置换 —— 源槽位第 o 面的贴纸，到目标槽位后
         落在第 perm[s][o] 面。由此可对任意「源朝向 o」正确推出「目标朝向 perm[s][o]」，
         与具体是哪一块无关（转向只取决于几何位置）。
     朝向约定（pairEncOf / 目标判定共用）：角块 = w/y 色在当前槽位三面帧里的下标；
     棱块 = 该棱块基准色（含 g/b 用之，否则 w/y）在当前槽位两面帧里的下标。 */
  var CORNER_T = {}, EDGE_T = {};
  (function buildTransitions() {
    var solved = R.newCube();
    MOVES18.forEach(function (mv) {
      var cube = R.clone(solved);
      R.applyAlg(cube, mv);
      /* 角块 */
      var cpos = new Array(8), cperm = [];
      for (var s = 0; s < 8; s++) {
        var c0 = SOLVED[CORNER_SLOTS[s][0][0]], c1 = SOLVED[CORNER_SLOTS[s][1][0]], c2 = SOLVED[CORNER_SLOTS[s][2][0]];
        var found = -1;
        for (var t = 0; t < 8; t++) {
          var cs = cornerColorsAt(cube, CORNER_SLOTS[t]);
          if (cs.indexOf(c0) >= 0 && cs.indexOf(c1) >= 0 && cs.indexOf(c2) >= 0) { found = t; break; }
        }
        var dc = cornerColorsAt(cube, CORNER_SLOTS[found]);
        cpos[s] = found;
        cperm[s] = [dc.indexOf(c0), dc.indexOf(c1), dc.indexOf(c2)];
      }
      CORNER_T[mv] = { pos: cpos, perm: cperm };
      /* 棱块 */
      var epos = new Array(12), eperm = [];
      for (var j = 0; j < 12; j++) {
        var e0 = SOLVED[EDGE_PAIRS[j][0][0]], e1 = SOLVED[EDGE_PAIRS[j][1][0]];
        var found2 = -1;
        for (var t2 = 0; t2 < 12; t2++) {
          var ec = edgeColorsAt(cube, EDGE_PAIRS[t2]);
          if (ec.indexOf(e0) >= 0 && ec.indexOf(e1) >= 0) { found2 = t2; break; }
        }
        var dec = edgeColorsAt(cube, EDGE_PAIRS[found2]);
        epos[j] = found2;
        eperm[j] = [dec.indexOf(e0), dec.indexOf(e1)];
      }
      EDGE_T[mv] = { pos: epos, perm: eperm };
    });
  })();

  /* ---------- 十字编码（复用 cross-solver 的结构，自建 LO/HI 以便增量转移） ---------- */
  var CANON = EDGE_PAIRS.map(function (p) { return [SOLVED[p[0][0]], SOLVED[p[1][0]]]; });
  var PIECE_OF_PAIR = {};
  CANON.forEach(function (pair, i) { PIECE_OF_PAIR[pair.slice().sort().join("")] = i; });
  var PERM = {}, FLIP = {};
  MOVES18.forEach(function (mv) {
    var c = R.applyAlg(R.newCube(), mv);
    var perm = new Array(12), flip = new Array(12);
    for (var j = 0; j < 12; j++) {
      var a = c[EDGE_PAIRS[j][0][0]][EDGE_PAIRS[j][0][1]];
      var b = c[EDGE_PAIRS[j][1][0]][EDGE_PAIRS[j][1][1]];
      var k = PIECE_OF_PAIR[[a, b].sort().join("")];
      perm[k] = j;
      flip[k] = a === CANON[k][0] ? 0 : 1;
    }
    PERM[mv] = perm; FLIP[mv] = flip;
  });
  var POW = [1, 24, 576, 13824];
  var LO = {}, HI = {};
  MOVES18.forEach(function (mv) {
    var perm = PERM[mv], flip = FLIP[mv];
    var lo = new Uint16Array(576), hi = new Uint16Array(576);
    function one(v) { return perm[v >> 1] * 2 + ((v & 1) ^ flip[v >> 1]); }
    for (var v = 0; v < 576; v++) {
      lo[v] = one(v % 24) + one((v / 24) | 0) * 24;
      hi[v] = one(v % 24) + one((v / 24) | 0) * 24;
    }
    LO[mv] = lo; HI[mv] = hi;
  });
  function crossStep(enc, mv) {
    return LO[mv][enc % 576] + HI[mv][(enc / 576) | 0] * 576;
  }
  function crossStartEnc(color) {
    var es = CS.COLOR_EDGES[color], e = 0;
    for (var i = 0; i < 4; i++) e += es[i] * 2 * POW[i];
    return e;
  }
  /* 由打乱 moves 正向步进求十字编码（与 cross-solver 的输入编码完全一致）。
     注意：绝不能直接从 cube 读十字编码来喂 IDA*——cross-solver 的距离表与
     crossStep 走的是「正向步进」约定，直接读 cube 会得到其逆排列，导致不一致。 */
  function crossEncFromMoves(moves, color) {
    var e = crossStartEnc(color);
    for (var i = 0; i < moves.length; i++) e = crossStep(e, moves[i]);
    return e;
  }
  /* 仅在「调试 / 无打乱序列」时由 cube 直接读十字编码（其为 crossStep 的逆约定，
     不可用于 IDA* 的起始态，仅作展示用途）。 */
  function crossEncFromCube(cube, color) {
    var es = CS.COLOR_EDGES[color], e = 0;
    for (var i = 0; i < 4; i++) {
      var idx = es[i];
      var pair = EDGE_PAIRS[idx];
      var a = cube[pair[0][0]][pair[0][1]];
      var b = cube[pair[1][0]][pair[1][1]];
      var k = PIECE_OF_PAIR[[a, b].sort().join("")];
      var flipv = (a === CANON[k][0]) ? 0 : 1;
      e += (k * 2 + flipv) * POW[i];
    }
    return e;
  }

  /* ---------- 对的编码 / 距离表 ----------
     编码 = 本对「角块当前所在槽位 × 朝向 × 棱块当前所在槽位 × 朝向」。
     关键：必须按「本对专属角/棱块当前位于哪个槽位」编码（追踪固定块），
           而不是「目标槽位里现在是谁」。因为转移表 CORNER_T/EDGE_T 是按
           「当前槽位」索引的（槽位 s 的块经 mv 后去哪），这样才能在状态空间内闭合。 */
  function pieceCornerSig(slot) {
    return sig3([SOLVED[slot[0][0]], SOLVED[slot[1][0]], SOLVED[slot[2][0]]]);
  }
  function pieceEdgeSig(pair) {
    return sig2([SOLVED[pair[0][0]], SOLVED[pair[1][0]]]);
  }
  function slotOfCorner(cube, sig) {
    for (var k = 0; k < 8; k++) if (sig3(cornerColorsAt(cube, CORNER_SLOTS[k])) === sig) return k;
    return -1;
  }
  function slotOfEdge(cube, sig) {
    for (var j = 0; j < 12; j++) if (sig2(edgeColorsAt(cube, EDGE_PAIRS[j])) === sig) return j;
    return -1;
  }
  function pairEncOf(cube, pair) {
    var homeCornerSig = pieceCornerSig(CORNER_SLOTS[pair.cornerSlot]);
    var homeEdgeSig = pieceEdgeSig(EDGE_PAIRS[pair.edgeSlot]);
    var cs = slotOfCorner(cube, homeCornerSig);   /* 本对角块当前所在槽位 */
    var es = slotOfEdge(cube, homeEdgeSig);        /* 本对棱块当前所在槽位 */
    var cOri = cornerColorsAt(cube, CORNER_SLOTS[cs]).indexOf(CORNER_REF[pair.cornerSlot]);
    if (cOri < 0) cOri = 0;
    var eOri = edgeColorsAt(cube, EDGE_PAIRS[es]).indexOf(EDGE_REF[pair.edgeSlot]);
    if (eOri < 0) eOri = 0;
    return (cs * 3 + cOri) * 24 + (es * 2 + eOri);
  }

  /* 对的 BFS 距离表 + 转移表（真实立方模拟构建）
     ------------------------------------------------------------
     旧实现手推面置换 CORNER_T/EDGE_T 再算转移，容易与 pairEncOf 的朝向约定
     不一致（这正是之前 224/300 失败的根因来源）。这里改为：
     从「该对还原态」的真实立方出发做 BFS，每步都对**克隆出的真实立方**施加转动，
     再用同一个 pairEncOf 读编码。编码与转移天然自洽，该类 bug 从根上消失。
     因编码只跟踪本对两块的位置/朝向，状态空间 ≤ 576，构建成本可忽略。 */
  var PAIR_TABLES = {};
  function pairTable(pair) {
    if (PAIR_TABLES[pair.key]) return PAIR_TABLES[pair.key];
    var dist = new Int16Array(576);
    dist.fill(-1);
    var trans = [];
    for (var t = 0; t < 18; t++) trans.push(new Uint16Array(576));

    var solved = R.newCube();
    var goal = pairEncOf(solved, pair);
    dist[goal] = 0;
    var seenCube = {}; seenCube[goal] = solved;
    var q = [goal], head = 0;
    while (head < q.length) {
      var enc = q[head++];
      var cube = seenCube[enc], nd = dist[enc] + 1;
      for (var i = 0; i < 18; i++) {
        var nc = R.clone(cube);
        R.apply(nc, MOVES18[i]);
        var nEnc = pairEncOf(nc, pair);
        trans[i][enc] = nEnc;
        if (dist[nEnc] === -1) { dist[nEnc] = nd; seenCube[nEnc] = nc; q.push(nEnc); }
      }
    }
    PAIR_TABLES[pair.key] = { dist: dist, trans: trans, goal: goal };
    return PAIR_TABLES[pair.key];
  }

  /* ---------- IDA* ---------- */
  function now() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }

  var FACE0 = MOVES18.map(function (m) { return m.charAt(0); });
  var CH_I = new Int32Array(18), CH_G = new Int32Array(18); /* 子节点排序暂存 */

  function solveFromCube(cube, pairKey, opts) {
    opts = opts || {};
    var pair = PAIR_BY_KEY[pairKey] || PAIR_BY_KEY.FL;
    /* 十字颜色可指定：换色后十字改做在对应面（如黄十字 = D 面），
       但对的选择与「角/棱归位」目标无关，故四对 F2L 对任意颜色都成立。 */
    var color = opts.color || "w";
    var crossTbl = CS.table(color);
    var pairTbl = pairTable(pair);
    var goalCross = crossStartEnc(color);
    var goalPair = pairTbl.goal;

    /* 十字起始编码必须「由打乱正向步进」得出，不能读 cube。
       ⚠ 少传 opts.moves 会退化成 crossStartEnc（等于假设十字已是还原态），
       求解器会照样返回 ok=true，但末态十字根本没还原 —— 这是最容易踩的坑。 */
    var startCross = opts.moves ? crossEncFromMoves(opts.moves, color) : crossStartEnc(color);
    var startPair = pairEncOf(cube, pair);

    /* 普通十字解（回退用）：调用方应通过 opts.plainCross 传入，
       否则这里无法给出针对原始打乱的合法十字解。 */
    var plainCross = opts.plainCross || [];

    var maxDepth = opts.maxDepth || 16;
    /* 默认允许连续同面：XCROSS 解法常含 R U R' 这类组合，禁掉会让解法变长且不好做。
       需要 WCA 风格（无同面/对面相邻）时可传 allowSameFace:false。 */
    var allowSameFace = opts.allowSameFace !== false;
    var nodeBudget = opts.nodeBudget || 6000000;
    var timeBudget = (opts.timeBudget === undefined) ? 1200 : opts.timeBudget;
    var t0 = now();

    if (startCross === goalCross && startPair === goalPair)
      return { ok: true, moves: [], length: 0, crossLength: plainCross.length, note: "已还原" };

    var nodes = 0, iterNodes = 0;
    var path = [];
    var bound = Math.max(crossTbl[startCross], pairTbl.dist[startPair]);
    /* 每层迭代独立的节点上限：否则「证明 depth-1 无解」会吃掉全部预算，
       真正有解的最后一层反而没钱可用。剩余预算仍受全局 timeBudget 硬约束。
       注意 nodes 也必须每层清零 —— 否则跨层累加会把 nodeBudget 提前耗尽，
       后面真正有解的那几层连一个节点都跑不到，直接退化成常规十字解。 */
    var iterCap = opts.iterNodes || 800000;

    /* 返回 true 表示找到解（解在共享数组 path 的 [0, depth) 区间）；
       返回 -1 表示预算耗尽；返回数字表示「下一个迭代下界」。 */
    function dfs(c, p, depth, b, prevFace) {
      /* 命中目标：必须先丢弃 path 尾部残留。path 是全局共享数组，同一层里
         上一轮兄弟分支探索时会在更深处写过 path[depth]；若这里直接 return true，
         path.length 会保留那个旧值，最终解就会多出一步无效移动（曾导致约 0.5% 的解
         末尾带一步多余转动，跑完“看着到目标、实际十字没好”）。 */
      if (c === goalCross && p === goalPair) { path.length = depth; return true; }
      if (++nodes > nodeBudget) return -1;
      if (++iterNodes > iterCap) return -1;
      if (now() - t0 > timeBudget) return -1;
      var cd = crossTbl[c], pd = pairTbl.dist[p];
      var nh = cd > pd ? cd : pd;
      if (depth + nh > b) return depth + nh;

      /* 收集合法子节点并按「距离下降量」贪心排序：越优先尝试越容易在当前界内早命中解 */
      var n = 0, minEx = 1e9;
      for (var i = 0; i < 18; i++) {
        if (!allowSameFace && FACE0[i] === prevFace) continue;
        var nc = crossStep(c, MOVES18[i]);
        var np = pairTbl.trans[i][p];
        var gain = (pd - pairTbl.dist[np]) * 4 + (cd - crossTbl[nc]);
        var k = n++;
        while (k > 0 && CH_G[k - 1] < gain) { CH_G[k] = CH_G[k - 1]; CH_I[k] = CH_I[k - 1]; k--; }
        CH_G[k] = gain; CH_I[k] = i;
      }
      for (var t = 0; t < n; t++) {
        var mi = CH_I[t], mv = MOVES18[mi];
        path[depth] = mv;
        var r = dfs(crossStep(c, mv), pairTbl.trans[mi][p], depth + 1, b, FACE0[mi]);
        if (r === true) return true;   /* 截断只由命中目标那一层负责，见上面 */
        if (r === -1) return -1;
        if (r < minEx) minEx = r;
      }
      return minEx;
    }

    var timedOut = false;
    while (bound <= maxDepth) {
      path.length = 0;
      iterNodes = 0;
      nodes = 0;
      var r = dfs(startCross, startPair, 0, bound, "");
      if (r === true) {
        var sol = path.slice();
        return {
          ok: true, moves: sol, length: sol.length,
          crossLength: plainCross.length,
          note: "已合并首对 " + pair.label + "（" + sol.length + " 步）"
        };
      }
      /* r === -1 有两种情况：
         · 本层节点上限用尽 → 只是本层放弃，继续加深到下一层再试；
         · 全局时间耗尽 → 才真正回退到常规十字解。 */
      if (now() - t0 > timeBudget) { timedOut = true; break; }
      /* 全局时间未耗尽却返回 -1 ⇒ 是本层节点上限用尽：必须把下界推进一层，
         否则会卡在同一层反复空转，永远够不到有解的更深层。 */
      bound = (r === -1) ? bound + 1 : r;
    }
    return {
      ok: false, moves: plainCross.slice(), length: plainCross.length, crossLength: plainCross.length,
      note: timedOut ? "XCROSS 计算超时，已给出常规十字解（未合并首对）"
                     : "未找到更优 XCROSS（超过深度上限），已给出常规十字解"
    };
  }

  /* 对外：从打乱 moves 直接算 XCROSS */
  function solve(scramble, pairKey, opts) {
    opts = opts || {};
    var moves = Array.isArray(scramble) ? scramble.slice()
      : String(scramble).trim().split(/\s+/).filter(Boolean);
    var cube = R.applyAlg(R.newCube(), moves.join(" "));
    /* 常规十字解（针对原始打乱，等价于把 cube 还原的十字部分） */
    var plainCross = CS.solve("w", moves);
    return solveFromCube(cube, pairKey, {
      moves: moves,
      plainCross: plainCross,
      color: opts.color,
      maxDepth: opts.maxDepth, nodeBudget: opts.nodeBudget, timeBudget: opts.timeBudget
    });
  }

  root.XCross = {
    PAIRS: PAIRS,
    PAIR_BY_KEY: PAIR_BY_KEY,
    solve: solve,
    solveFromCube: solveFromCube,
    _debug: {
      crossStep: crossStep, crossEncFromCube: crossEncFromCube, crossStartEnc: crossStartEnc,
      pairEncOf: pairEncOf, pairTable: pairTable
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
