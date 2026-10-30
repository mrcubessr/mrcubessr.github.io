/* =============================================================
 * suan24.js — 24 点精确分数求解器（浏览器 / Node 双端可用）
 * -------------------------------------------------------------
 * 功能：
 *   Suan24.solve(nums, target)      -> 枚举全部不同解 + 结构元数据
 *   Suan24.checkAnswer(nums, expr)  -> 校验用户表达式是否=24且恰好用完4数
 *   Suan24.fracStr(f)               -> 分数转字符串
 *
 * 算法来源（已改写合并，保留出处）：
 *   - 精确分数引擎 + 全解枚举：seekerlee/suan24 (WTFPL)
 *     https://github.com/seekerlee/suan24
 *   - 表达式"项收集"规范化去重/去括号：Yuanbest583/24GameSolver (MIT)
 *     https://github.com/Yuanbest583/24GameSolver
 * 重实现为纯 JS（无 TS / 无模块系统依赖），便于直接 <script> 引入。
 * ============================================================= */
(function (global) {
  'use strict';

  /* ---------------- 精确分数 ---------------- */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function F(n, d) {
    n = n | 0; d = (d === undefined || d === null) ? 1 : (d | 0);
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d); return { n: n / g, d: d / g };
  }
  function fadd(a, b) { return F(a.n * b.d + a.d * b.n, a.d * b.d); }
  function fsub(a, b) { return F(a.n * b.d - a.d * b.n, a.d * b.d); }
  function fmul(a, b) { return F(a.n * b.n, a.d * b.d); }
  function fdiv(a, b) { if (!b || b.n === 0) return null; return F(a.n * b.d, a.d * b.n); }
  function feq(a, b) { return a.n * b.d === a.d * b.n; }
  function fneg(a) { return F(-a.n, a.d); }
  function fracStr(a) { return a.d === 1 ? String(a.n) : a.n + '/' + a.d; }

  /* ---------------- 表达式树 ---------------- */
  function num(n) { return { t: 'num', v: F(n, 1) }; }
  function op(o, l, r) { return { t: 'op', op: o, l: l, r: r }; }

  function sameExp(p, q) {
    if (p.t !== q.t) return false;
    if (p.t === 'num') return feq(p.v, q.v);
    return p.op === q.op && sameExp(p.l, q.l) && sameExp(p.r, q.r);
  }

  // 枚举所有树（suan24 风格，带无序对数去重）
  function joinAll(exps, used, out) {
    if (exps.length === 1) { out.push(exps[0]); return; }
    for (var i = 0; i < exps.length; i++) {
      for (var j = 0; j < exps.length; j++) {
        if (i === j) continue;
        var li = exps[i], rj = exps[j];
        var dup = false;
        for (var k = 0; k < used.length; k++) {
          var pr = used[k];
          if ((sameExp(pr[0], li) && sameExp(pr[1], rj)) || (sameExp(pr[0], rj) && sameExp(pr[1], li))) { dup = true; break; }
        }
        if (dup) continue;
        var nu = used.concat([[li, rj]]);
        var rest = [];
        for (var m = 0; m < exps.length; m++) if (m !== i && m !== j) rest.push(exps[m]);
        var a = li, b = rj;
        var av = evalNode(a), bv = evalNode(b);
        if (!av || !bv) continue;
        var cands = [['+', op('+', a, b)], ['-', op('-', a, b)], ['*', op('*', a, b)]];
        var bd = (bv.n !== 0) ? fdiv(av, bv) : null; if (bd) cands.push(['/', op('/', a, b)]);
        for (var x = 0; x < cands.length; x++) joinAll(rest.concat([cands[x][1]]), nu, out);
        if (!sameExp(a, b)) {
          var cands2 = [['-', op('-', b, a)]];
          var ad = (av.n !== 0) ? fdiv(bv, av) : null; if (ad) cands2.push(['/', op('/', b, a)]);
          for (var y = 0; y < cands2.length; y++) joinAll(rest.concat([cands2[y][1]]), nu, out);
        }
      }
    }
  }

  function evalNode(n) {
    if (n.t === 'num') return n.v;
    var l = evalNode(n.l), r = evalNode(n.r);
    if (!l || !r) return null;
    if (n.op === '+') return fadd(l, r);
    if (n.op === '-') return fsub(l, r);
    if (n.op === '*') return fmul(l, r);
    if (n.op === '/') return fdiv(l, r);
    return null;
  }

  /* ---------------- 项收集规范化（Yuanbest583 思路） ---------------- */
  function precOf(op) { return (op === '+' || op === '-') ? 1 : 2; }

  function canonical(node, parentPrec) {
    if (node.t === 'num') return { id: fracStr(node.v), disp: fracStr(node.v), prec: 99 };
    var isAdd = (node.op === '+' || node.op === '-');
    var terms = [];
    collect(node, isAdd ? '+' : '*', terms, false);
    var pos = terms.filter(function (t) { return !t.inv; })
      .sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); });
    var neg = terms.filter(function (t) { return t.inv; })
      .sort(function (a, b) { return a.id.localeCompare(b.id, undefined, { numeric: true }); });
    var id = (isAdd ? 'A' : 'M') + '(P:' + pos.map(function (t) { return t.id; }).join(',') +
      ';N:' + neg.map(function (t) { return t.id; }).join(',') + ')';
    var disp = '';
    var symAdd = isAdd ? '+' : '×';
    var symSub = isAdd ? '-' : '÷';
    if (pos.length) {
      disp = pos[0].disp;
      for (var i = 1; i < pos.length; i++) disp += ' ' + symAdd + ' ' + pos[i].disp;
      for (var j = 0; j < neg.length; j++) disp += ' ' + symSub + ' ' + neg[j].disp;
    } else {
      disp = (isAdd ? '-' : '1 ÷ ') + neg[0].disp;
      for (var k = 1; k < neg.length; k++) disp += ' ' + symSub + ' ' + neg[k].disp;
    }
    if (parentPrec && precOf(node.op) < parentPrec) disp = '(' + disp + ')';
    return { id: id, disp: disp, prec: precOf(node.op) };
  }

  function collect(node, targetOp, terms, inv) {
    if (node.t === 'num') { terms.push({ id: fracStr(node.v), disp: fracStr(node.v), inv: inv }); return; }
    var canMerge = (targetOp === '+' && (node.op === '+' || node.op === '-')) ||
      (targetOp === '*' && (node.op === '*' || node.op === '/'));
    if (canMerge) {
      collect(node.l, targetOp, terms, inv);
      var nx = (node.op === '-' || node.op === '/') ? !inv : inv;
      collect(node.r, targetOp, terms, nx);
    } else {
      var sub = canonical(node, targetOp === '+' ? 1 : 2);
      terms.push({ id: sub.id, disp: sub.disp, inv: inv });
    }
  }

  /* ---------------- 主求解 ---------------- */
  function solve(nums, target) {
    target = (target === undefined || target === null) ? 24 : target;
    var exps = nums.map(num);
    var all = [];
    joinAll(exps, [], all);
    var seen = {};
    var sols = [];
    var integerOnly = false, noDivision = false, anyNeg = false;
    for (var t = 0; t < all.length; t++) {
      var tree = all[t];
      var val = evalNode(tree);
      if (!val || !feq(val, F(target, 1))) continue;
      var c = canonical(tree, 0);
      if (seen[c.id]) continue;
      seen[c.id] = true;
      var mf = false, md = false, mn = false;
      (function walk(n) {
        var v = evalNode(n);
        if (v) { if (v.d !== 1) mf = true; if (v.n < 0) mn = true; }
        if (n.t === 'op') { if (n.op === '/') md = true; walk(n.l); walk(n.r); }
      })(tree);
      if (!mf) integerOnly = true;
      if (!md) noDivision = true;
      if (mn) anyNeg = true;
      sols.push({ text: c.disp, requiresFraction: mf, usesDivision: md, anyNegative: mn, tree: tree });
    }
    return {
      hasSolution: sols.length > 0,
      count: sols.length,
      solutions: sols,
      integerOnly: integerOnly,
      noDivision: noDivision,
      requiresFraction: !integerOnly,
      anyNegative: anyNeg,
      maxDigit: Math.max.apply(null, nums)
    };
  }

  /* ---------------- 可分步复现的合并步骤（供 UI 提示 / 分步演示） ---------------- */
  var OP_SYM24 = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  // 后序遍历表达式树：子步骤在前，最后是本次合并
  function collectSteps(node, steps) {
    if (!node || node.t !== 'op') return;                 // 数字节点没有步骤
    collectSteps(node.l, steps);
    collectSteps(node.r, steps);
    var lv = evalNode(node.l), rv = evalNode(node.r), vv = evalNode(node);
    if (!lv || !rv || !vv) return;
    var a = fracStr(lv), b = fracStr(rv), result = fracStr(vv);
    steps.push({ op: node.op, a: a, b: b, result: result, expr: a + ' ' + OP_SYM24[node.op] + ' ' + b + ' = ' + result });
  }

  // 返回"按点击顺序可复现"的合并步骤；无解返回 null
  function planSteps(nums, target) {
    target = (target === undefined || target === null) ? 24 : target;
    var r = solve(nums, target);
    if (!r.hasSolution) return null;
    var steps = [];
    collectSteps(r.solutions[0].tree, steps);
    return steps;
  }

  /* ---------------- 用户答案校验 ---------------- */
  function tokenize(s) {
    var toks = [], i = 0;
    var map = { '×': '*', '÷': '/', '（': '(', '）': ')', '−': '-', '＋': '+' };
    while (i < s.length) {
      var ch = s[i];
      if (ch in map) ch = map[ch];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (ch >= '0' && ch <= '9') {
        var j = i; while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
        toks.push({ t: 'num', v: parseInt(s.slice(i, j), 10) }); i = j; continue;
      }
      if ('+-*/()'.indexOf(ch) >= 0) { toks.push({ t: ch }); i++; continue; }
      toks.push({ t: 'err', v: ch }); i++;
    }
    return toks;
  }

  function parseExpr(toks, p) {
    var left = parseTerm(toks, p);
    while (p.i < toks.length) {
      var tk = toks[p.i];
      if (tk.t === '+' || tk.t === '-') {
        p.i++; var r = parseTerm(toks, p); if (!left || !r) return null;
        left = { val: tk.t === '+' ? fadd(left.val, r.val) : fsub(left.val, r.val), nums: left.nums.concat(r.nums) };
      } else break;
    }
    return left;
  }
  function parseTerm(toks, p) {
    var left = parseFactor(toks, p);
    while (p.i < toks.length) {
      var tk = toks[p.i];
      if (tk.t === '*' || tk.t === '/') {
        p.i++; var r = parseFactor(toks, p); if (!left || !r) return null;
        if (tk.t === '*') left = { val: fmul(left.val, r.val), nums: left.nums.concat(r.nums) };
        else { var d = fdiv(left.val, r.val); if (!d) return { divzero: true, nums: (left ? left.nums : []).concat(r.nums) }; left = { val: d, nums: left.nums.concat(r.nums) }; }
      } else break;
    }
    return left;
  }
  function parseFactor(toks, p) {
    var tk = toks[p.i];
    if (!tk) return null;
    if (tk.t === 'num') { p.i++; return { val: F(tk.v, 1), nums: [tk.v] }; }
    if (tk.t === '-') { p.i++; var f = parseFactor(toks, p); if (!f) return null; return { val: fneg(f.val), nums: f.nums }; }
    if (tk.t === '(') {
      p.i++; var e = parseExpr(toks, p); if (!e) return null;
      if (p.i >= toks.length || toks[p.i].t !== ')') return null; p.i++; return e;
    }
    return null;
  }

  function checkAnswer(nums, expr) {
    var toks = tokenize(String(expr));
    if (toks.some(function (t) { return t.t === 'err'; })) return { ok: false, reason: '含有无法识别的字符' };
    var p = { i: 0 };
    var r = parseExpr(toks, p);
    if (!r) return { ok: false, reason: '表达式格式有误' };
    if (p.i !== toks.length) return { ok: false, reason: '表达式有多余内容' };
    if (r.divzero) return { ok: false, reason: '出现除以 0' };
    var used = r.nums.slice().sort(function (a, b) { return a - b; });
    var given = nums.slice().sort(function (a, b) { return a - b; });
    for (var i = 0; i < 4; i++) if (used[i] !== given[i]) return { ok: false, reason: '数字使用不正确（须恰好用一次给定的四个数）' };
    if (feq(r.val, F(24, 1))) return { ok: true, value: '24' };
    return { ok: false, reason: '结果 = ' + fracStr(r.val) + ' ≠ 24' };
  }

  var API = { solve: solve, checkAnswer: checkAnswer, fracStr: fracStr, F: F, planSteps: planSteps, version: '1.0.1' };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.Suan24 = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
