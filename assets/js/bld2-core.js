/*!
 * 二阶盲拧：编码 ⇄ 状态 ⇄ 打乱
 * ------------------------------------------------------------------
 * 固定持握：黄顶（U）红前（F）绿右（R），白底（D）橘后（B）蓝左（L）。
 *
 * ① 字母表（每个角按「从角外侧看绕角一圈」排，第 0 个落在 U/D 面）
 *    UBL 黄蓝橘 DEF   UBR 黄橘绿 GHI   UFR 黄绿红 JKL(缓冲)   UFL 黄红蓝 ABC
 *    DFL 白蓝红 WMN   DFR 白红绿 XYZ(定位)  DBR 白绿橘 RST   DBL 白橘蓝 OPQ
 *
 * ② 编码就是「直接读高位贴纸」，不做 untwist：
 *    在角位 p 读高位（U/D 面）贴纸得字母 L，L 属于哪个角块就走到那个角位继续读。
 *    读到缓冲块 J 时循环结束，不写这个字母。
 *    一个角块「原位但翻了」时高位读到的是它自己的另一个字母：
 *        顺翻 → 位置字母 + 第 2 个字母（DEF → DE）
 *        逆翻 → 位置字母 + 第 3 个字母（DEF → DF）
 *    这条在 8 个角上统一成立。
 *
 * ③ 定位块 XYZ（白红绿 / DFR）是坐标锚点：
 *    打乱后先把它摆回 DFR（白朝下、红朝前、绿朝右），再从这个坐标系读码。
 *    所以锚点坐标系里 XYZ 永远在原位未翻，编码里不会出现 X/Y/Z。
 *    打乱本身在固定「黄顶红前」坐标系里做，故打乱态 = 锚点态整体旋转一次，
 *    这样才练得到「找 XYZ 并摆正」这一步。
 *
 * ④ 借位顺序：G → D → A → W → O → R。
 *
 * ⑤ 扭角定义：co = 高位贴纸上是该角块的第几个字母（0/1/2）。
 *    注意不能沿用站点三阶那套 CS 表 —— 那张表在 4 个角上是反的，
 *    用它算跨角位的朝向会把扭角读成另一个字母。
 *
 * ⑥ 两处记法固有的歧义（编码本身看不出来，只能靠枚举 + 反向验收）：
 *    · 缓冲块是否已经复原（复原了就不写它的字母）；
 *    · 缓冲循环在哪一位结束（闭合字母不写，没有分隔符）。
 *    另外缓冲块所在角位的朝向也读不出来，用「扭角总和 ≡ 0」反推。
 *
 * ⑦ 贴纸位布局是「面索引」：贴纸位 3i+t 就是位置 i 的面 FACES[i][t]。
 *    复原态不是 [0..23]，而是 3i+CS_INV[i][t] —— 直接写 [0..23] 会得到
 *    一个「角块全部扭转」的状态，这是上一版读码全错的根因。
 */
(function (global) {
  'use strict';

  var POSNAME = ['UBL','UBR','UFR','UFL','DFL','DFR','DBR','DBL'];
  var BUFFER = 2;   // UFR，缓冲块 J
  var ANCHOR = 5;   // DFR，定位块 XYZ

  var CW = [
    ['D','E','F'], ['G','H','I'], ['J','K','L'], ['A','B','C'],
    ['W','M','N'], ['X','Y','Z'], ['R','S','T'], ['O','P','Q']
  ];

  /* 角位内三个贴纸位。slot = 3*i + CS[i][k]，其中 3*i+k 对应面 FACES[i][k]。
     UBL=[U,B,L] UBR=[U,B,R] UFR=[U,F,R] UFL=[U,F,L]
     DFL=[D,F,L] DFR=[D,F,R] DBR=[D,B,R] DBL=[D,B,L] */
  var CS = [[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2],[0,2,1],[0,1,2]];

  var L2S = {}, S2L = {}, LPC = {}, LK = {};
  (function () {
    for (var i = 0; i < 8; i++) {
      for (var k = 0; k < 3; k++) {
        var slot = 3 * i + CS[i][k];
        var ch = CW[i][k];
        L2S[ch] = slot; S2L[slot] = ch; LPC[ch] = i; LK[ch] = k;
      }
    }
  })();

  var BREAK_ORDER = [1, 0, 3, 4, 7, 6];   // G, D, A, W, O, R

  var CS_INV = CS.map(function (a) { var v=[0,0,0]; a.forEach(function (x,i){ v[x]=i; }); return v; });

  /* 复原态：贴纸位 3i+t 上是「位置 i 的角块中、贴在面 FACES[i][t] 上的那个字母」。
     所以不是简单的 [0..23] —— 那会把角块摆成扭转状态。 */
  var idState = function () {
    var a = new Array(24);
    for (var i = 0; i < 8; i++) for (var t = 0; t < 3; t++) a[3*i + t] = 3*i + CS_INV[i][t];
    return a;
  };

  // ===== 状态 ↔ cp/co =====
  /* co[i] = 位置 i 高位贴纸上是本块的第几个字母。
     块 b 的第 j 个字母放在位置 i 的第 (j - co) 个字母位（mod 3）。 */
  function toCubie(corner) {
    var cp = [], co = [];
    for (var i = 0; i < 8; i++) {
      var s = corner[3*i];
      cp.push(Math.floor(s/3));
      co.push(s % 3);
    }
    return { cp: cp, co: co };
  }
  function fromCubie(cp, co) {
    var c = new Array(24);
    for (var i = 0; i < 8; i++) {
      var b = cp[i], o = co[i] || 0;
      for (var j = 0; j < 3; j++) {
        var k = ((j - o) % 3 + 3) % 3;
        c[3*i + CS[i][k]] = 3*b + j;
      }
    }
    return c;
  }
  // 位置 p 高位贴纸上的字母（贴纸值是 3*块号 + 该块第几个字母）
  function readLetter(corner, p) {
    var v = corner[3*p];
    return CW[Math.floor(v / 3)][v % 3];
  }

  // ===== 24 个整体旋转 =====
  var PXYZ = [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1],[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]];
  var FACES = [['U','B','L'],['U','B','R'],['U','F','R'],['U','F','L'],
               ['D','F','L'],['D','F','R'],['D','B','R'],['D','B','L']];
  var FVEC = { U:[0,1,0], D:[0,-1,0], R:[1,0,0], L:[-1,0,0], F:[0,0,1], B:[0,0,-1] };
  var FKEYS = ['U','D','R','L','F','B'];

  function buildPerm(M) {
    var mul = function (v) {
      return [ M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],
               M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],
               M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2] ];
    };
    var same = function (a, b) { return a[0]===b[0] && a[1]===b[1] && a[2]===b[2]; };
    var pOf = [], fOf = {}, perm = new Array(24), p, q, k, fi, gi;
    for (p = 0; p < 8; p++) {
      var v = mul(PXYZ[p]);
      for (q = 0; q < 8; q++) if (same(PXYZ[q], v)) { pOf[p] = q; break; }
    }
    for (fi = 0; fi < 6; fi++) {
      var w = mul(FVEC[FKEYS[fi]]);
      for (gi = 0; gi < 6; gi++) if (same(FVEC[FKEYS[gi]], w)) { fOf[FKEYS[fi]] = FKEYS[gi]; break; }
    }
    for (p = 0; p < 8; p++) {
      q = pOf[p];
      for (k = 0; k < 3; k++) perm[3*p + k] = 3*q + FACES[q].indexOf(fOf[FACES[p][k]]);
    }
    return perm;
  }

  var ROTS = (function () {
    var out = [];
    var perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    var sgn = [1,-1,-1,1,1,-1];
    for (var a = 0; a < 6; a++) {
      for (var b = 0; b < 8; b++) {
        var prod = 1;
        for (var j = 0; j < 3; j++) if ((b >> j) & 1) prod = -prod;
        if (sgn[a] * prod !== 1) continue;
        var M = [[0,0,0],[0,0,0],[0,0,0]];
        for (var j2 = 0; j2 < 3; j2++) M[j2][perms[a][j2]] = ((b >> j2) & 1) ? -1 : 1;
        out.push(buildPerm(M));
      }
    }
    return out;
  })();

  // 贴纸位 s 上的东西搬到 perm[s]
  function applyPerm(corner, perm) {
    var out = new Array(24);
    for (var s = 0; s < 24; s++) out[perm[s]] = corner[s];
    return out;
  }
  function isIdentityPerm(perm) {
    for (var s = 0; s < 24; s++) if (perm[s] !== s) return false;
    return true;
  }
  // 把 XYZ 摆回 DFR 且不翻的那一次整体旋转
  function findAnchorRot(corner) {
    for (var r = 0; r < ROTS.length; r++) {
      var cc = toCubie(applyPerm(corner, ROTS[r]));
      if (cc.cp[ANCHOR] === ANCHOR && cc.co[ANCHOR] === 0) return r;
    }
    return -1;
  }

  // ===== 状态 → 编码 =====
  function nextBreak(assigned) {
    for (var bi = 0; bi < BREAK_ORDER.length; bi++) {
      if (!assigned[BREAK_ORDER[bi]]) return BREAK_ORDER[bi];
    }
    return -1;
  }

  function encodeGroups(corner) {
    var cc = toCubie(corner);
    if (cc.cp[ANCHOR] !== ANCHOR || cc.co[ANCHOR] !== 0)
      throw new Error('定位块 XYZ 不在原位，无法在锚点坐标系里读码');

    var assigned = [false,false,false,false,false,false,false,false];
    assigned[ANCHOR] = true;
    if (cc.cp[BUFFER] === BUFFER && cc.co[BUFFER] === 0) assigned[BUFFER] = true;

    var groups = [], buf = [];
    var flush = function () { if (buf.length) { groups.push(buf.join('')); buf = []; } };
    var cur = assigned[BUFFER] ? nextBreak(assigned) : BUFFER;
    var guard = 0;

    while (cur >= 0 && guard++ < 80) {
      var q = cc.cp[cur], o = cc.co[cur];
      if (q === cur) {
        // 原位：翻角写「位置字母 + 高位读到的字母」，没翻就跳过
        if (o !== 0) { buf.push(CW[cur][0]); buf.push(CW[cur][o]); }
        assigned[cur] = true;
        flush();
        cur = nextBreak(assigned);
        continue;
      }
      if (q === BUFFER) {
        // 下一个就是缓冲块：这个字母不写，循环到此结束
        assigned[cur] = true;
        flush();
        cur = nextBreak(assigned);
        continue;
      }
      buf.push(readLetter(corner, cur));
      assigned[cur] = true;
      cur = q;
      if (assigned[cur]) { flush(); cur = nextBreak(assigned); }   // 回到本循环起点
    }
    flush();
    return groups;
  }

  function encodeState(corner) { return encodeGroups(corner).join(''); }

  // ===== 编码 → 状态 =====
  function parseCode(str) {
    return String(str || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  }

  var MASK_POS = [0,1,2,3,4,6,7];

  /* 码里不写「已复原」的角，所以解码端得自己推断哪些角位被跳过：
     枚举跳过集（7 个非锚点角，128 种），逐个确定性解码，
     再要求「跳过的角恰好就是解完后复原的角」——不动点条件。 */
  function decodeCore(letters, skipMask, splitAt) {
    var cp = [0,1,2,3,4,5,6,7], co = [0,0,0,0,0,0,0,0];
    var pre = [], assigned = [], used = [], p;
    for (p = 0; p < 8; p++) {
      pre[p] = (p === ANCHOR) || !!(skipMask & (1 << p));
      assigned[p] = pre[p];
      used[p] = pre[p];
    }
    var groups = [], i = 0, ok = true, guard = 0;
    var bufCycle = !pre[BUFFER];          // 缓冲块没复原 → 第一段是缓冲循环

    function place(pos, ch) {
      var q = LPC[ch];
      if (used[q]) { ok = false; return; }
      cp[pos] = q; co[pos] = LK[ch];
      used[q] = true; assigned[pos] = true;
    }
    var bufPos = -1;
    function closeBufferCycle() {
      // 缓冲循环的最后一块：该位置上放的是缓冲块，编码里没写它的字母，
      // 所以它的朝向也读不出来 —— 先记下位置，最后用「扭角总和 ≡ 0」补。
      if (cur < 0 || assigned[cur] || used[BUFFER]) { ok = false; return; }
      cp[cur] = BUFFER; co[cur] = 0;
      assigned[cur] = true; used[BUFFER] = true;
      bufPos = cur;
      cur = nextBreak(assigned);
    }

    var cur = pre[BUFFER] ? nextBreak(assigned) : BUFFER;

    while (i < letters.length) {
      if (!ok) return null;
      if (bufCycle && i === splitAt) { closeBufferCycle(); bufCycle = false; }
      if (!ok) return null;
      if (cur < 0 || guard++ > 60) return null;

      var ch = letters[i];
      var isTwist = (i + 1 < letters.length) && LPC[letters[i+1]] === LPC[ch];
      if (isTwist) {
        if (LPC[ch] !== cur) return null;
        if (ch !== CW[cur][0]) return null;
        place(cur, letters[i+1]);
        if (!ok) return null;
        groups.push(ch + letters[i+1]);
        i += 2;
        cur = nextBreak(assigned);
        bufCycle = false;               // 翻角一定结束当前段
        if (pre[BUFFER] === false && splitAt === i) { /* 已自然结束 */ }
      } else {
        if (LPC[ch] === cur) return null;   // 原位翻角必须写两个字母
        place(cur, ch);
        if (!ok) return null;
        groups.push(ch);
        i += 1;
        var nx = LPC[ch];
        if (nx === BUFFER || assigned[nx]) { cur = nextBreak(assigned); bufCycle = false; }
        else cur = nx;
      }
    }
    if (bufCycle) { closeBufferCycle(); if (!ok) return null; }

    // 缓冲块所在角位的朝向：由「扭角总和必须是 3 的倍数」反推
    if (bufPos >= 0) {
      var s2 = 0;
      for (p = 0; p < 8; p++) if (p !== bufPos) s2 += co[p];
      co[bufPos] = (3 - s2 % 3) % 3;
    }

    // 不动点条件：假定跳过的角 ⇔ 解完之后真的复原的角
    for (p = 0; p < 8; p++) {
      if ((cp[p] === p && co[p] === 0) !== pre[p]) return null;
    }
    return { cp: cp, co: co, groups: groups };
  }

  function sortLetters(str) { return String(str).split('').sort().join(''); }
  function sameCode(a, b) {
    return a === b || (a.length === b.length && sortLetters(a) === sortLetters(b));
  }

  /* 编码 → 状态。
     记法本身有两处不确定：
       ① 缓冲块是否已经复原（复原了就不写它的字母，编码看不出区别）；
       ② 缓冲循环在哪一位结束（不写闭合字母，所以没有分隔符）。
     两处都枚举，最后用「把解出的状态重新读一遍码，必须和输入一致」来验收。 */
  function decodeCode(str, opts) {
    opts = opts || {};
    var letters = parseCode(str), t;
    for (t = 0; t < letters.length; t++) {
      if (L2S[letters[t]] === undefined) throw new Error('不认识的字母「' + letters[t] + '」');
      if (LPC[letters[t]] === ANCHOR)
        throw new Error('编码里不应该出现 X / Y / Z：XYZ 是定位块，摆正之后它已经在原位了');
    }
    if (!letters.length) return { corner: idState(), groups: [] };
    var want = letters.join('');

    var bufferModes = opts.bufferSolved === true ? [true] : (opts.bufferSolved === false ? [false] : [false, true]);
    var splits = [-1];
    for (var k = 1; k <= letters.length; k++) splits.push(k);

    for (var bm = 0; bm < bufferModes.length; bm++) {
      var bufSolved = bufferModes[bm];
      for (var m = 0; m < 128; m++) {
        var skip = 0;
        for (var b = 0; b < 7; b++) if (m & (1 << b)) skip |= (1 << MASK_POS[b]);
        if (bufSolved) skip |= (1 << BUFFER);
        else skip &= ~(1 << BUFFER);

        for (var si = 0; si < splits.length; si++) {
          var r = decodeCore(letters, skip, splits[si]);
          if (!r) continue;
          var seen = [], p, bad = false;
          for (p = 0; p < 8; p++) seen[p] = false;
          for (p = 0; p < 8; p++) { if (seen[r.cp[p]]) { bad = true; break; } seen[r.cp[p]] = true; }
          if (bad) continue;
          var sum = 0;
          for (p = 0; p < 8; p++) sum += r.co[p];
          if (sum % 3 !== 0) continue;
          var corner = fromCubie(r.cp, r.co);
          var got;
          try { got = encodeState(corner); } catch (e) { continue; }
          if (!sameCode(got, want)) continue;
          return { corner: corner, groups: r.groups, code: got, bufferSolved: bufSolved };
        }
      }
    }
    throw new Error('这串编码解不出合法的二阶状态。常见原因：某个循环漏写了字母、'
      + '翻角没有成对出现（二阶扭角总和必须是 3 的倍数）、或者字母写重复了。');
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
    // 每层单独一套缓冲，递归时不会互相覆盖
    var kidsD = [], coD = [], mvD = [];
    for (var d0 = 0; d0 <= maxDepth + 2; d0++) {
      kidsD.push(new Array(18)); coD.push(new Array(18)); mvD.push(new Array(18));
    }

    function dfs(cp, co, depth, limit, lastFace) {
      var kids = kidsD[depth], hbuf = coD[depth], mbuf = mvD[depth];
      var h = Math.max(CP_PRUN[cp], CO_PRUN[co]);
      if (depth + h > limit) return false;
      if (h === 0 && depth > 0) return true;
      // 按子节点启发值排序，优先走离目标近的分支
      var n = 0;
      for (var mi = 0; mi < 18; mi++) {
        var f = MOVE_FACE[mi];
        if (f === lastFace) continue;
        if (lastFace && OPP[lastFace] === f && f < lastFace) continue;
        var ncp = CP_MOVE[cp*18+mi], nco = CO_MOVE[co*18+mi];
        var nh = CP_PRUN[ncp] > CO_PRUN[nco] ? CP_PRUN[ncp] : CO_PRUN[nco];
        if (depth + 1 + nh > limit) continue;
        kids[n] = ncp; hbuf[n] = nco; mbuf[n] = mi; n++;
      }
      for (var a = 1; a < n; a++) {
        var kc = kids[a], kh = hbuf[a], km = mbuf[a], b = a - 1;
        while (b >= 0 && (CP_PRUN[kids[b]] > CO_PRUN[hbuf[b]] ? CP_PRUN[kids[b]] : CO_PRUN[hbuf[b]]) > (CP_PRUN[kc] > CO_PRUN[kh] ? CP_PRUN[kc] : CO_PRUN[kh])) {
          kids[b+1] = kids[b]; hbuf[b+1] = hbuf[b]; mbuf[b+1] = mbuf[b]; b--;
        }
        kids[b+1] = kc; hbuf[b+1] = kh; mbuf[b+1] = km;
      }
      for (var j = 0; j < n; j++) {
        path.push(MOVES[mbuf[j]]);
        if (dfs(kids[j], hbuf[j], depth+1, limit, MOVE_FACE[mbuf[j]])) return true;
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

  function applyMoves(corner, list) {
    var c = corner;
    for (var i = 0; i < list.length; i++) {
      var m = String(list[i]).trim(), f = m.charAt(0);
      if (!MAP[f]) continue;
      var last = m.charAt(m.length-1);
      var cnt = last === "'" ? 3 : (last === '2' ? 2 : 1);
      for (var t = 0; t < cnt; t++) c = applyMap(c, MAP[f]);
    }
    return c;
  }

  function codeOf(corner) {
    var r = findAnchorRot(corner);
    if (r < 0) return { code: '', groups: [], rot: -1, ok: false };
    var anchor = applyPerm(corner, ROTS[r]);
    var groups;
    try { groups = encodeGroups(anchor); } catch (e) { return { code: '', groups: [], rot: r, ok: false }; }
    return { code: groups.join(''), groups: groups, rot: r, ok: true };
  }

  // ===== 对外 =====

  /* codeToScramble(code, opts)
     opts.keepAnchor === true：打乱后 XYZ 仍在原位（不练「找 XYZ」）
     否则在 23 个把 XYZ 挪走的整体旋转里挑解最短的那个 */
  function codeToScramble(code, opts) {
    opts = opts || {};
    var dec = decodeCode(code, { bufferSolved: opts.bufferSolved });
    var target = dec.corner;
    var groups = dec.groups;
    var want = groups.join('');

    buildTables();

    // 先用剪枝表给 24 个整体旋转各估一个下界，按下界排序后只解最靠前的几个
    var cand = [];
    for (var r = 0; r < ROTS.length; r++) {
      if (isIdentityPerm(ROTS[r]) && !opts.keepAnchor) continue;
      var rot = applyPerm(target, ROTS[r]);
      var cc = toCubie(rot);
      var cpi = cpIdx(cc.cp), coi = coIdx(cc.co);
      if (cpi === 0 && coi === 0) {
        return { moves: [], corner: rot, anchorCorner: target, code: want,
                 groups: groups, rot: r, empty: true };
      }
      cand.push({ r: r, rot: rot, lb: Math.max(CP_PRUN[cpi], CO_PRUN[coi]) });
    }
    cand.sort(function (a, b) { return a.lb - b.lb; });

    var best = null;
    for (var i = 0; i < cand.length && i < 4; i++) {
      var sol = solveCorner(cand[i].rot);
      if (sol === null) continue;
      var scramble = invertMoves(sol);
      var chk = codeOf(applyMoves(idState(), scramble));
      if (chk.code !== want) continue;
      best = { sol: sol, scramble: scramble, rot: cand[i].r, state: cand[i].rot };
      break;
    }
    if (!best) throw new Error('求解失败：这个状态在二阶上不可达');

    return {
      moves: best.scramble,
      corner: best.state,
      anchorCorner: target,
      code: want,
      groups: groups,
      rot: best.rot,
      empty: best.scramble.length === 0
    };
  }

  function scrambleToCode(moves) {
    var list = typeof moves === 'string' ? String(moves).trim().split(/\s+/).filter(Boolean) : moves.slice();
    var raw = applyMoves(idState(), list);
    var r = findAnchorRot(raw);
    var anchor = r < 0 ? raw : applyPerm(raw, ROTS[r]);
    var groups = [];
    try { groups = encodeGroups(anchor); } catch (e) { groups = []; }
    return { code: groups.join(''), groups: groups, corner: raw, anchorCorner: anchor, rot: r, anchorOk: r >= 0 };
  }

  // 字母 → 所在面 → 中文颜色（页面展示用）
  var LCOLOR = {}, FCOLOR = { U:'黄', D:'白', F:'红', B:'橘', R:'绿', L:'蓝' };
  var FACES2 = [['U','B','L'],['U','B','R'],['U','F','R'],['U','F','L'],
                ['D','F','L'],['D','F','R'],['D','B','R'],['D','B','L']];
  (function () {
    for (var i = 0; i < 8; i++) {
      for (var k = 0; k < 3; k++) LCOLOR[CW[i][k]] = FACES2[i][CS[i][k]];
    }
  })();

  global.Bld2 = {
    codeToScramble: codeToScramble,
    scrambleToCode: scrambleToCode,
    encodeState: encodeState,
    encodeGroups: encodeGroups,
    decodeCode: decodeCode,
    parseCode: parseCode,
    solveCorner: solveCorner,
    buildTables: buildTables,
    toCubie: toCubie,
    fromCubie: fromCubie,
    findAnchorRot: findAnchorRot,
    CW: CW, POSNAME: POSNAME, BREAK_ORDER: BREAK_ORDER,
    L2S: L2S, S2L: S2L, LPC: LPC, LK: LK,
    LCOLOR: LCOLOR, FCOLOR: FCOLOR,
    BUFFER: BUFFER, ANCHOR: ANCHOR, ROTS: ROTS
  };
})(typeof window !== 'undefined' ? window : this);
