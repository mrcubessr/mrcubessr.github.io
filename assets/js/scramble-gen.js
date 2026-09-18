/* =========================================================
   assets/js/scramble-gen.js — 公共打乱生成模块
   练习题生成器 / 打乱训练器 共用，避免重复内嵌生成逻辑。
   暴露：window.ScrambleGen = { simple, wca, buildFaceSequence, genWcaInline }

   · simple({size, mode, length, count}) -> string[]
       mode: 'all' = 六面标准（覆盖 R U F L B D 各面）；'ruf' = RUF 入门
       采用覆盖式贪心生成：保证所选字母集合每个至少出现一次。
   · wca({size, length, count}) -> string[]
       比赛级真实随机打乱：三阶默认 20 步禁止同轴相邻；二阶默认 11 步仅用 R U F。
       优先复用 TimerScramble.gen（/tools/timer/scramble.js），缺失时内联回退。
   ========================================================= */
(function (root) {
  "use strict";

  var FACES = ['R', 'U', 'F', 'L', 'D', 'B'];
  var AXIS_OPP = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };
  var WCA_AXIS = { U: "y", D: "y", R: "x", L: "x", F: "z", B: "z" };
  var SUF = ["", "'", "2"];

  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 判断某一步能否接在当前序列后（覆盖式训练规则：禁同面相邻、禁同轴对面相邻、禁隔一步同面） */
  function isValidNext(seq, f) {
    var last = seq[seq.length - 1];
    var prev = seq[seq.length - 2];
    if (f === last) return false;
    if (last && AXIS_OPP[f] === last) return false;
    if (f === prev) return false;
    return true;
  }

  /* 覆盖式生成：保证 allowed 中每个面至少出现一次 */
  function buildFaceSequence(length, allowed) {
    allowed = allowed || FACES;
    for (var attempt = 0; attempt < 400; attempt++) {
      var seq = [], missing = {}, missCount = allowed.length;
      for (var z = 0; z < allowed.length; z++) missing[allowed[z]] = true;
      var failed = false;
      for (var i = 0; i < length; i++) {
        var slotsLeft = length - i, pool;
        if (slotsLeft <= missCount) {
          pool = []; for (var k in missing) if (missing[k]) pool.push(k);
          pool = shuffle(pool);
        } else if (missCount > 0 && Math.random() < 0.55) {
          var m = [], o = [];
          for (var k2 in missing) if (missing[k2]) m.push(k2);
          for (var a2 = 0; a2 < allowed.length; a2++) if (!missing[allowed[a2]]) o.push(allowed[a2]);
          pool = shuffle(m).concat(shuffle(o));
        } else {
          pool = shuffle(allowed);
        }
        var picked = null;
        for (var p = 0; p < pool.length; p++) { if (isValidNext(seq, pool[p])) { picked = pool[p]; break; } }
        if (picked === null) { failed = true; break; }
        seq.push(picked);
        if (missing[picked]) { delete missing[picked]; missCount--; }
      }
      if (!failed && missCount === 0) return seq;
    }
    // 兜底
    var fb = shuffle(allowed);
    while (fb.length < length) {
      var c = shuffle(allowed).filter(function (f) { return isValidNext(fb, f); });
      fb.push(c.length ? c[0] : allowed[(Math.random() * allowed.length) | 0]);
    }
    return fb;
  }

  /* WCA 风格内联回退（无 TimerScramble 时） */
  function genWcaInline(event, n) {
    n = n > 0 ? n : (event === '2x2' ? 11 : 20);
    if (event === '2x2') {
      var F = ['R', 'U', 'F'], out = [], prev = '';
      for (var i = 0; i < n; i++) { var f; do { f = pick(F); } while (f === prev); out.push(f + pick(SUF)); prev = f; }
      return out;
    }
    var F6 = ['U', 'D', 'R', 'L', 'F', 'B'], o = [], pa = '';
    for (var j = 0; j < n; j++) { var g; do { g = pick(F6); } while (WCA_AXIS[g] === pa); o.push(g + pick(SUF)); pa = WCA_AXIS[g]; }
    return o;
  }

  function simple(opts) {
    opts = opts || {};
    var size = (opts.size === '2' || opts.size === 2) ? 2 : 3;
    var mode = opts.mode === 'ruf' ? 'ruf' : 'all';
    var length = opts.length ? parseInt(opts.length, 10) : (size === 2 ? 10 : 6);
    var count = opts.count ? parseInt(opts.count, 10) : 10;
    var allowed = mode === 'ruf' ? ['R', 'U', 'F'] : FACES;
    var out = [];
    for (var i = 0; i < count; i++) {
      var seq = buildFaceSequence(length, allowed);
      out.push(seq.map(function (f) { return f + pick(SUF); }).join(' '));
    }
    return out;
  }

  function wca(opts) {
    opts = opts || {};
    var size = (opts.size === '2' || opts.size === 2) ? 2 : 3;
    var steps = opts.length ? parseInt(opts.length, 10) : (size === 2 ? 11 : 20);
    var count = opts.count ? parseInt(opts.count, 10) : 10;
    var event = size === 2 ? '2x2' : '3x3';
    var out = [];
    for (var i = 0; i < count; i++) {
      var arr = (root.TimerScramble && root.TimerScramble.gen)
        ? root.TimerScramble.gen(event, steps)
        : genWcaInline(event, steps);
      out.push(arr.join(' '));
    }
    return out;
  }

  root.ScrambleGen = {
    simple: simple,
    wca: wca,
    buildFaceSequence: buildFaceSequence,
    genWcaInline: genWcaInline
  };
})(typeof window !== "undefined" ? window : globalThis);
