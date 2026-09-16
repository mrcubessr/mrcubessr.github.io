/* =============================================================
 * 拿法朝向变换（cross trainer）
 * -------------------------------------------------------------
 * 求解器与打乱都工作在标准坐标系：白顶(U) 绿前(F)。
 * 用户若想用别的拿法（如「黄顶绿前」）做十字，需要把解法做共轭变换：
 *     newAlg = R · alg · R⁻¹
 * 其中 R 是从标准朝向到目标朝向的整体旋转。刚体旋转保持手性，
 * 因此变换只替换面名、不改变转动方向（顺/逆/180 不变）。
 *
 * 公开：Orient.mapFor(topKey, frontKey) / Orient.transform(alg, map)
 *       Orient.ALL / Orient.solve(topKey, frontKey)
 * ============================================================= */
(function (root) {
  'use strict';

  /* 标准坐标系：颜色 → 所在面（与 cross-solver.js 的 COLORS 一致） */
  var COLOR_FACE = { w: 'U', y: 'D', g: 'F', b: 'B', r: 'R', o: 'L' };
  var FACE_COLOR = { U: 'w', D: 'y', F: 'g', B: 'b', R: 'r', L: 'o' };
  var OPP = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
  var POS_NAME = { U: '顶面', D: '底面', F: '前面', B: '后面', L: '左面', R: '右面' };
  var FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

  /* 三个整体旋转生成元，写法为「旧位置 → 新位置」。
     方向与 rubik-core.js 的单面转动严格对齐（以代码为事实来源）：
       U 转动：新 F.t = 旧 R.t  ⇒ R→F，F→L，L→B，B→R
       R 转动：新 U.r = 旧 F.r  ⇒ F→U，U→B，B→D，D→F
       F 转动：新 R.l = 旧 U.b  ⇒ U→R，R→D，D→L，L→U
     故：
       x（绕 R 轴，同 R 方向）：F→U U→B B→D D→F，R/L 不动
       y（绕 U 轴，同 U 方向）：R→F F→L L→B B→R，U/D 不动
       z（绕 F 轴，同 F 方向）：U→R R→D D→L L→U，F/B 不动  */
  var GENS = {
    x: { F: 'U', U: 'B', B: 'D', D: 'F', R: 'R', L: 'L' },
    y: { R: 'F', F: 'L', L: 'B', B: 'R', U: 'U', D: 'D' },
    z: { U: 'R', R: 'D', D: 'L', L: 'U', F: 'F', B: 'B' }
  };

  /* state：位置 → 当前占据该位置的「标准面」 */
  function applyGen(state, g) {
    var out = {};
    FACES.forEach(function (p) { out[g[p]] = state[p]; });
    return out;
  }

  function identity() {
    var s = {};
    FACES.forEach(function (p) { s[p] = p; });
    return s;
  }

  function stateKey(s) {
    return FACES.map(function (p) { return s[p]; }).join('');
  }

  /** 全部 24 种朝向：{ state, seq, map }，map 为「标准面 → 新位置」 */
  var ALL = (function () {
    var seen = {}, out = [], queue = [{ state: identity(), seq: [] }];
    seen[stateKey(identity())] = 1;
    while (queue.length) {
      var cur = queue.shift();
      var map = {};
      FACES.forEach(function (p) { map[cur.state[p]] = p; });   // 标准面 → 位置
      out.push({ state: cur.state, seq: cur.seq.slice(), map: map });
      Object.keys(GENS).forEach(function (k) {
        var ns = applyGen(cur.state, GENS[k]);
        var key = stateKey(ns);
        if (seen[key]) return;
        seen[key] = 1;
        queue.push({ state: ns, seq: cur.seq.concat([k]) });
      });
    }
    return out;
  })();

  /** 按「顶面颜色 + 前面颜色」查找朝向 */
  function solve(topKey, frontKey) {
    var wantTop = COLOR_FACE[topKey], wantFront = COLOR_FACE[frontKey];
    for (var i = 0; i < ALL.length; i++) {
      var s = ALL[i].state;
      if (s.U === wantTop && s.F === wantFront) return ALL[i];
    }
    return null;
  }

  /** 取面映射：标准面 → 目标位置 */
  function mapFor(topKey, frontKey) {
    var o = solve(topKey, frontKey);
    return o ? o.map : null;
  }

  /* ---------- 公式变换 ---------- */
  function val(suf) { return suf === "'" ? 3 : suf === '2' ? 2 : 1; }
  function sufOf(v) { return v === 1 ? '' : v === 2 ? '2' : "'"; }

  /** 合并相邻同面转动（U U → U2，U U' → 消去） */
  function simplify(moves) {
    var out = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!/^[UDLRFB](['2]?)$/.test(m)) continue;   /* 跳过非法记号，避免污染后续合并 */
      var f = m[0], s = m.slice(1);
      var last = out[out.length - 1];
      if (last && last[0] === f) {
        var sum = (val(last.slice(1)) + val(s)) % 4;
        if (sum === 0) out.pop();
        else out[out.length - 1] = f + sufOf(sum);
      } else out.push(m);
    }
    return out;
  }

  /**
   * 把公式变换到目标拿法
   * @param {string[]|string} alg
   * @param {object} map 标准面 → 新位置
   */
  function transform(alg, map) {
    var moves = Array.isArray(alg) ? alg.slice() : String(alg).trim().split(/\s+/).filter(Boolean);
    return simplify(moves.map(function (m) {
      var f = m[0].toUpperCase();
      var nf = map[f];
      if (!nf) return m;
      return nf + m.slice(1);
    }));
  }

  /** 合法前面色：排除顶面与其对面 */
  function validFronts(topKey) {
    var f = COLOR_FACE[topKey];
    return Object.keys(COLOR_FACE).filter(function (k) {
      return COLOR_FACE[k] !== f && COLOR_FACE[k] !== OPP[f];
    });
  }

  root.Orient = {
    COLOR_FACE: COLOR_FACE, FACE_COLOR: FACE_COLOR, OPP: OPP, POS_NAME: POS_NAME,
    ALL: ALL, solve: solve, mapFor: mapFor, transform: transform,
    simplify: simplify, validFronts: validFronts
  };
})(window);
