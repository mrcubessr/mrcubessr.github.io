/*!
 * 二阶盲拧：编码 ⇄ 状态 ⇄ 打乱
 * ------------------------------------------------------------------
 * 设计要点
 * 1) 编码分两部分：**位置循环** + **扭角**。
 *    直接把贴纸循环读出来会因为翻色把链拉得很长（实测 15 字母），
 *    所以先按朝向把每个角"摆正"（untwist），得到纯置换再读码，
 *    循环长度必然 ≤ 7；扭角单独用「字母+扭数」标注。
 * 2) 状态用 24 个贴纸位表示（与站点 bld-scramble-core 的 corner 数组同构），
 *    贴纸位编号：UBL(0-2) UBR(3-5) UFR(6-8) UFL(9-11) DFL(12-14) DFR(15-17) DBR(18-20) DBL(21-23)
 * 3) 求解用二阶专用 IDA*（cp/co 双剪枝表），最优解 ≤ 11 步，实测 < 10ms。
 *    不用三阶 min2phase：它要求棱块状态合法，二阶角状态为奇置换时要人为交换两条棱，
 *    解会从 1 步膨胀到 18 步。
 * 4) 字母表沿用站点 Speffz 变体（缓冲 UFR，J = UFR 的 U 面贴纸）。
 */
(function (global) {
  'use strict';

  // ===== 字母 ↔ 贴纸位 =====
  var L2S = { J:6,K:7,L:8, G:3,H:4,I:5, A:9,B:10,C:11, D:0,E:1,F:2,
              X:15,Y:16,Z:17, W:12,M:13,N:14, R:18,S:19,T:20, O:21,P:22,Q:23 };
  var S2L = {}; for (var k in L2S) S2L[L2S[k]] = k;

  // 追踪顺序：缓冲 UFR 在前，其余按站点 CORNER_ORDER
  var CH = 'JKLGHIABCDEFXYZWMNRSTOPQ';
  var STARTS = ['J','G','A','D','X','W','R','O'];       // 8 个角块的高色字母
  var POSNAME = ['UBL','UBR','UFR','UFL','DFL','DFR','DBR','DBL'];
  var BLOCK_OF_POS = { UBL:0, UBR:1, UFR:2, UFL:3, DFL:4, DFR:5, DBR:6, DBL:7 };

  /* 角位内三个贴纸位的「顺时针序号」。
     面序固定为 (U/D, B|F, R|L)，但从角外侧看顺时针排列有两种：
     UBL U→L→B、UBR U→B→R、UFR U→R→F、UFL U→F→L、
     DFL D→L→F、DFR D→F→R、DBR D→R→B、DBL D→B→L
     故偶数位（UBL/UFR/DFL/DBR）是 [0,2,1]，奇数位是 [0,1,2]。
     这张表必须与站点 corner 数组一致，否则扭角会算反。 */
  var CS = [[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2]];
  var CS_INV = CS.map(function (a) { var v=[0,0,0]; a.forEach(function (x,i){ v[x]=i; }); return v; });

  // 块 → 高色字母（用于把扭角写成 JK 这种字母对）
  var BLOCK_LETTER = ['D','G','J','A','W','X','R','O'];  // UBL,UBR,UFR,UFL,DFL,DFR,DBR,DBL
  // 块 → 三个贴纸字母（顺序与贴纸位一致）
  var BLOCK_LETTERS = ['DEF','GHI','JKL','ABC','WMN','XYZ','RST','OPQ'];

  var idState = function () { var a = new Array(24); for (var i=0;i<24;i++) a[i]=i; return a; };

  // ===== 状态 ↔ cp/co =====
  function toCubie(corner) {
    var cp = [], co = [];
    for (var i = 0; i < 8; i++) {
      var s = corner[3*i], b = Math.floor(s/3), j0 = s - 3*b;
      cp.push(b);
      co.push(((CS[i][0] - CS[b][j0]) % 3 + 3) % 3);
    }
    return { cp: cp, co: co };
  }
  function fromCubie(cp, co) {
    var c = new Array(24);
    for (var i = 0; i < 8; i++) {
      var b = cp[i], o = co[i] || 0;
      for (var j = 0; j < 3; j++) c[3*i + CS_INV[i][(CS[b][j] + o) % 3]] = 3*b + j;
    }
    return c;
  }

  // 摆正：清掉所有扭角，只留位置置换
  function untwist(corner) {
    var cp = toCubie(corner).cp, c = idState();
    for (var i = 0; i < 8; i++) {
      var b = cp[i];
      for (var j = 0; j < 3; j++) c[3*i + CS_INV[i][CS[b][j]]] = 3*b + j;
    }
    return c;
  }
  // 在摆正状态上施加扭角
  function applyTwist(flat, co) {
    var c = idState();
    for (var i = 0; i < 8; i++) {
      var o = co[i] || 0, b = Math.floor(flat[3*i]/3);
      for (var j = 0; j < 3; j++) c[3*i + CS_INV[i][(CS[b][j] + o) % 3]] = 3*b + j;
    }
    return c;
  }

  // ===== 位置循环编码 =====
  function encodePos(flat) {
    var tk = {}, k;
    for (k in L2S) tk[k] = S2L[flat[L2S[k]]];
    var read = {}, cycles = [];
    for (var i = 0; i < CH.length; i += 3) {
      var start = CH[i];
      if (read[start] || read[CH[i+1]] || read[CH[i+2]]) continue;
      var chain = [start], cur = start, g = 0;
      while (tk[cur] !== start && g++ < 8) { cur = tk[cur]; chain.push(cur); }
      if (chain.length === 1) { read[CH[i]] = read[CH[i+1]] = read[CH[i+2]] = 1; continue; }
      for (var j = 0; j < chain.length; j++) read[chain[j]] = 1;
      cycles.push(chain.slice(1).join(''));
    }
    return cycles;
  }

  /* 位置编码 → 摆正状态。
     首段不一定从缓冲块起（缓冲归位时循环从别处开始），
     所以每段都回溯尝试 8 个起点，取第一个能补成合法状态的分法。

     ⚠ 记法本身是有歧义的：缓冲块 J 归位时，剩下的循环从别的角起笔，
     同一个字符串（如 "D"）既可能读成「J↔D」（缓冲参与），
     也可能读成「G↔D」（缓冲已归位）。两种读法都能补成合法状态。
     默认按标准盲拧习惯优先「缓冲参与」；用户若明确知道自己这一把
     缓冲块已归位，传 opts.bufferSolved 即可把 J 排除出候选起点。 */
  function decodePos(segments, opts) {
    var segs = segments.map(function (s) { return String(s).toUpperCase().replace(/[^A-Z]/g,''); })
                       .filter(Boolean);
    var starts = (opts && opts.bufferSolved)
      ? STARTS.filter(function (s) { return s !== 'J'; })
      : STARTS;

    function build(p2s) {
      var c = idState(), done = new Array(8).fill(false), i, k;
      for (i = 0; i < 8; i++) {
        var f = null;
        for (k = 0; k < 3; k++) if (p2s[3*i+k] !== undefined) { f = { k: k, s: p2s[3*i+k] }; break; }
        if (!f) continue;
        var b = Math.floor(f.s/3), j0 = f.s - 3*b;
        var o = ((CS[i][f.k] - CS[b][j0]) % 3 + 3) % 3;
        for (var j = 0; j < 3; j++) c[3*i + CS_INV[i][(CS[b][j] + o) % 3]] = 3*b + j;
        done[i] = true;
      }
      var used = {};
      for (i = 0; i < 8; i++) if (done[i]) used[Math.floor(c[3*i]/3)] = 1;
      for (i = 0; i < 8; i++) if (!done[i] && !used[i]) { for (k=0;k<3;k++) c[3*i+k]=3*i+k; used[i]=1; }
      return c;
    }
    function valid(c) {
      var seen = {}, i;
      for (i = 0; i < 8; i++) {
        var g0 = Math.floor(c[3*i]/3), g1 = Math.floor(c[3*i+1]/3), g2 = Math.floor(c[3*i+2]/3);
        if (g0 !== g1 || g1 !== g2 || seen[g0]) return false;
        seen[g0] = 1;
      }
      return true;
    }

    var res = null;
    (function rec(si, p2s, used) {
      if (res) return;
      if (si === segs.length) {
        var c = build(p2s);
        if (!valid(c)) return;
        for (var kk in p2s) if (c[+kk] !== p2s[kk]) return;
        res = c; return;
      }
      var seg = segs[si];
      for (var si2 = 0; si2 < starts.length; si2++) {
        var start = starts[si2];
        if (used[start]) continue;
        // 两种写法都要认：
        //   "XRG" 省略起笔（J→X→R→G），"GDA" 把起笔也写全（G→D→A）。
        // 判据是段首字母是否正好等于候选起点。
        var chain = seg.charAt(0) === start
          ? seg.split('')
          : [start].concat(seg.split(''));
        // 用户可能把「终点」也写回来（如 "JDJ" / "XRG…G"），去重
        if (chain.length > 1 && chain[chain.length-1] === chain[0]) chain.pop();
        if (chain.length < 2) continue;
        var bad = false, ii;
        for (ii = 0; ii < chain.length; ii++) {
          if (used[chain[ii]] || L2S[chain[ii]] === undefined) { bad = true; break; }
        }
        // 位置循环里相邻两个字母必须来自不同的角块：同一个角的三个字母
        // 连起来（如 "ABC"、"JK"）其实是「扭角」，不是位置置换 —— 放行的话
        // 会被解成一个只带朝向、位置全对的假状态，最后被扭角栏清零，
        // 结果是「输入 ABC 却提示这是复原态」，非常误导。
        if (!bad) {
          for (ii = 0; ii < chain.length; ii++) {
            var pA = Math.floor(L2S[chain[ii]] / 3);
            var pB = Math.floor(L2S[chain[(ii + 1) % chain.length]] / 3);
            if (pA === pB) { bad = true; break; }
          }
        }
        if (bad) continue;
        var p2 = {}, key;
        for (key in p2s) p2[key] = p2s[key];
        for (ii = 0; ii < chain.length - 1; ii++) {
          var a = L2S[chain[ii]], b = L2S[chain[ii+1]];
          if (p2[a] !== undefined && p2[a] !== b) { bad = true; break; }
          p2[a] = b;
        }
        if (bad) continue;
        var a0 = L2S[chain[chain.length-1]], b0 = L2S[start];
        if (p2[a0] !== undefined && p2[a0] !== b0) continue;
        p2[a0] = b0;
        var u2 = {}, k2;
        for (k2 in used) u2[k2] = used[k2];
        for (ii = 0; ii < chain.length; ii++) u2[chain[ii]] = 1;
        rec(si + 1, p2, u2);
        if (res) return;
      }
    })(0, {}, {});

    if (!res) throw new Error('编码无法解析为合法状态：位置循环里相邻的两个字母必须来自不同的角块。'
      + '同一个角的三个字母连在一起（如 ABC、JK）属于扭角，请写到扭角栏。');
    return res;
  }

  // ===== 二阶求解器（cp/co + IDA*） =====
  var MAP = {
    U: [9,11,10, 0,2,1, 3,5,4, 6,8,7, 12,13,14, 15,16,17, 18,19,20, 21,22,23],
    D: [0,1,2, 3,4,5, 6,7,8, 9,10,11, 21,23,22, 12,14,13, 15,17,16, 18,20,19],
    F: [0,1,2, 3,4,5, 11,10,9, 14,13,12, 17,16,15, 8,7,6, 18,19,20, 21,22,23],
    B: [5,4,3, 20,19,18, 6,7,8, 9,10,11, 12,13,14, 15,16,17, 23,22,21, 2,1,0],
    R: [0,1,2, 7,6,8, 16,15,17, 9,10,11, 12,13,14, 19,18,20, 4,3,5, 21,22,23],
    L: [22,21,23, 3,4,5, 6,7,8, 1,0,2, 10,9,11, 15,16,17, 18,19,20, 13,12,14]
  };
  var applyMap = function (arr, m) { var o = new Array(arr.length); for (var i=0;i<arr.length;i++) o[i]=arr[m[i]]; return o; };

  var FACT = [1,1,2,6,24,120,720,5040];
  function cpIdx(cp) {
    var idx = 0;
    for (var i = 0; i < 7; i++) {
      var n = 0;
      for (var j = i+1; j < 8; j++) if (cp[j] < cp[i]) n++;
      idx += n * FACT[7-i];
    }
    return idx;
  }
  function cpFromIdx(idx) {
    var cp = [], avail = [0,1,2,3,4,5,6,7];
    for (var i = 0; i < 8; i++) {
      var f = FACT[7-i], d = Math.floor(idx / f); idx %= f;
      cp.push(avail.splice(d,1)[0]);
    }
    return cp;
  }
  function coIdx(co) {
    var idx = 0, p = 1;
    for (var i = 0; i < 7; i++) { idx += co[i]*p; p *= 3; }
    return idx;
  }
  function coFromIdx(idx) {
    var co = [], s = 0;
    for (var i = 0; i < 7; i++) { var v = idx % 3; co.push(v); s += v; idx = (idx - v)/3; }
    co.push((3 - s % 3) % 3);
    return co;
  }

  var MOVES = [], MOVE_FACE = [], MOVE_CNT = [];
  ['U','R','F','D','L','B'].forEach(function (f) {
    ['', '2', "'"].forEach(function (s) {
      MOVES.push(f + s);
      MOVE_FACE.push(f);
      MOVE_CNT.push(s === "'" ? 3 : (s === '2' ? 2 : 1));
    });
  });

  var CO_MOVE = null, CP_MOVE = null, CO_PRUN = null, CP_PRUN = null;

  function buildTables() {
    if (CO_MOVE) return;
    CO_MOVE = new Int16Array(2187 * 18);
    CP_MOVE = new Int32Array(40320 * 18);
    var i, mi, t, co0 = [0,0,0,0,0,0,0,0];

    for (i = 0; i < 2187; i++) {
      var corner = fromCubie([0,1,2,3,4,5,6,7], coFromIdx(i));
      for (mi = 0; mi < 18; mi++) {
        var c = corner;
        for (t = 0; t < MOVE_CNT[mi]; t++) c = applyMap(c, MAP[MOVE_FACE[mi]]);
        CO_MOVE[i*18+mi] = coIdx(toCubie(c).co);
      }
    }
    for (i = 0; i < 40320; i++) {
      var corner2 = fromCubie(cpFromIdx(i), co0);
      for (mi = 0; mi < 18; mi++) {
        var c2 = corner2;
        for (t = 0; t < MOVE_CNT[mi]; t++) c2 = applyMap(c2, MAP[MOVE_FACE[mi]]);
        CP_MOVE[i*18+mi] = cpIdx(toCubie(c2).cp);
      }
    }

    // BFS 剪枝表
    CO_PRUN = new Uint8Array(2187).fill(255); CO_PRUN[0] = 0;
    var frontier = [0], depth = 0;
    while (frontier.length) {
      var next = [];
      for (var fi = 0; fi < frontier.length; fi++) {
        var s = frontier[fi];
        for (mi = 0; mi < 18; mi++) {
          var ns = CO_MOVE[s*18+mi];
          if (CO_PRUN[ns] === 255) { CO_PRUN[ns] = depth+1; next.push(ns); }
        }
      }
      frontier = next; depth++;
    }
    CP_PRUN = new Uint8Array(40320).fill(255); CP_PRUN[0] = 0;
    frontier = [0]; depth = 0;
    while (frontier.length) {
      var next2 = [];
      for (var fj = 0; fj < frontier.length; fj++) {
        var s2 = frontier[fj];
        for (mi = 0; mi < 18; mi++) {
          var ns2 = CP_MOVE[s2*18+mi];
          if (CP_PRUN[ns2] === 255) { CP_PRUN[ns2] = depth+1; next2.push(ns2); }
        }
      }
      frontier = next2; depth++;
    }
  }

  var OPP = { U:'D', D:'U', R:'L', L:'R', F:'B', B:'F' };
  function ida(cpI, coI, maxDepth) {
    var path = [];
    function dfs(cp, co, depth, limit, lastFace) {
      var h = Math.max(CP_PRUN[cp], CO_PRUN[co]);
      if (depth + h > limit) return false;
      if (h === 0 && depth > 0) return true;
      for (var mi = 0; mi < 18; mi++) {
        var f = MOVE_FACE[mi];
        if (f === lastFace) continue;
        if (lastFace && OPP[lastFace] === f && f < lastFace) continue;
        path.push(MOVES[mi]);
        if (dfs(CP_MOVE[cp*18+mi], CO_MOVE[co*18+mi], depth+1, limit, f)) return true;
        path.pop();
      }
      return false;
    }
    for (var limit = 0; limit <= maxDepth; limit++) {
      path = [];
      if (dfs(cpI, coI, 0, limit, '')) return path.slice();
    }
    return null;
  }

  function solveCorner(corner) {
    buildTables();
    var cc = toCubie(corner), cpi = cpIdx(cc.cp), coi = coIdx(cc.co);
    if (cpi === 0 && coi === 0) return [];
    return ida(cpi, coi, 11);
  }

  var invertMoves = function (ms) {
    return ms.slice().reverse().map(function (m) {
      return m.charAt(m.length-1) === "'" ? m.charAt(0) : (m.charAt(m.length-1) === '2' ? m : m + "'");
    });
  };

  // ===== 对外：编码 ↔ 打乱 =====
  // 位置编码串：'-' 或 ',' 分隔多个循环；空格只作视觉分隔，不参与切分
  // （否则用户写 "X R G" 会被当成三个循环）
  function parsePosString(str) {
    return String(str || '').toUpperCase()
      .replace(/[^A-Z\-,]/g, '')
      .split(/[-,]+/)
      .map(function (s) { return s.replace(/[^A-Z]/g, ''); })
      .filter(Boolean);
  }
  // 扭角串：支持 "J1 G2"（字母+扭数）、"JK GH"（字母对）、"UFR1 UBR2"（角位+扭数）
  function parseTwistString(str) {
    var out = [], s = String(str || '').toUpperCase().replace(/[，,、]/g, ' ').trim();
    if (!s) return out;
    var toks = s.split(/\s+/).filter(Boolean);
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      var mPos = t.match(/^(UBL|UBR|UFR|UFL|DFL|DFR|DBR|DBL)\s*([+-]?\d)$/);
      if (mPos) { out.push({ pos: mPos[1], n: ((+mPos[2]) % 3 + 3) % 3 }); continue; }
      var mNum = t.match(/^([A-Z])([+-]?\d)$/);
      if (mNum) {
        var pi = posOfLetter(mNum[1]);
        if (pi < 0) throw new Error('未知字母 ' + mNum[1]);
        out.push({ pos: POSNAME[pi], n: ((+mNum[2]) % 3 + 3) % 3 });
        continue;
      }
      var mPair = t.match(/^([A-Z])([A-Z])$/);
      if (mPair) {
        var p1 = posOfLetter(mPair[1]), p2 = posOfLetter(mPair[2]);
        if (p1 < 0 || p1 !== p2) throw new Error('扭角「' + t + '」两个字母必须属于同一个角位');
        var kk = L2S[mPair[1]] - 3*p1;        // 第一个字母 = 该角位的第几号贴纸位
        var jj = L2S[mPair[2]] - 3*p1;        // 第二个字母 = 落在该位的贴纸在本块的序号
        var nn = ((CS[p1][kk] - CS[p1][jj]) % 3 + 3) % 3;
        out.push({ pos: POSNAME[p1], n: nn });
        continue;
      }
      throw new Error('无法识别的扭角写法「' + t + '」');
    }
    return out;
  }
  function blockOfLetter(ch) {
    for (var i = 0; i < 8; i++) if (BLOCK_LETTERS[i].indexOf(ch) >= 0) return i;
    return -1;
  }
  // 字母 → 贴纸位所属的「角位」索引（扭角是位置的属性，不是块的属性）
  function posOfLetter(ch) {
    var s = L2S[ch];
    return s === undefined ? -1 : Math.floor(s / 3);
  }

  function codeToScramble(posStr, twistStr, opts) {
    opts = opts || {};
    var segs = parsePosString(posStr);
    var twists = parseTwistString(twistStr);
    if (!segs.length && !twists.length) return { moves: [], corner: idState(), empty: true };
    var corner = decodePos(segs, opts);
    var co = [0,0,0,0,0,0,0,0], sumCo = 0;
    for (var i = 0; i < twists.length; i++) {
      var idx = BLOCK_OF_POS[twists[i].pos];
      // 同一角位写了多次时累加（模 3）：写「J1 J1」应理解为扭 2 次，
      // 而不是被后一次覆盖成 1 次 —— 否则报错里的「共扭几次」会数错。
      co[idx] = (co[idx] + twists[i].n) % 3;
    }
    for (i = 0; i < 8; i++) sumCo += co[i];
    if (sumCo % 3 !== 0) {
      throw new Error('扭角总和不成立：当前共扭 ' + sumCo + ' 次，必须是 3 的倍数。'
        + '二阶里单个角扭 1 次或 2 次都不可达，至少要三个角一起扭。');
    }
    corner = applyTwist(corner, co);
    var sol = solveCorner(corner);
    if (sol === null) throw new Error('求解失败（状态不可达）');
    return { moves: invertMoves(sol), corner: corner, empty: sol.length === 0 };
  }

  function scrambleToCode(moves) {
    var corner = idState(), list = String(moves || '').trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < list.length; i++) {
      var m = list[i], f = m.charAt(0);
      if (!MAP[f]) continue;
      var cnt = m.charAt(m.length-1) === "'" ? 3 : (m.charAt(m.length-1) === '2' ? 2 : 1);
      for (var t = 0; t < cnt; t++) corner = applyMap(corner, MAP[f]);
    }
    var code = stateToCode(corner);
    code.corner = corner;   // 同时给出状态本体，便于做「状态级」自检（字符串相同≠状态相同）
    return code;
  }

  function stateToCode(corner) {
    var flat = untwist(corner), cc = toCubie(corner);
    var pos = encodePos(flat), twist = [];
    for (var i = 0; i < 8; i++) {
      if (cc.co[i]) {
        // 用「角位的高色字母 + 扭数」标注，如 G1 = UBR 位置的角扭 1 次。
        // 不用字母对：角块被置换后，位置字母和块字母不是一回事，混用会标错。
        twist.push({ pos: POSNAME[i], n: cc.co[i], pair: BLOCK_LETTER[i] + cc.co[i] });
      }
    }
    return { pos: pos, twist: twist };
  }

  global.Bld2 = {
    codeToScramble: codeToScramble,
    scrambleToCode: scrambleToCode,
    stateToCode: stateToCode,
    solveCorner: solveCorner,
    buildTables: buildTables,
    parsePosString: parsePosString,
    parseTwistString: parseTwistString,
    // 供页面展示
    L2S: L2S, S2L: S2L, POSNAME: POSNAME, BLOCK_LETTERS: BLOCK_LETTERS, BLOCK_LETTER: BLOCK_LETTER
  };
})(typeof window !== 'undefined' ? window : this);
