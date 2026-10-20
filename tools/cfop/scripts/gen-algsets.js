/* =========================================================================
   gen-algsets.js — 生成 ZBLL / 二阶 EG / Square-1 / 五魔方 4LLL 四套公式库
   -------------------------------------------------------------------------
   数据来源：Nexus Timer 开源算法库（bryanlundberg/NexusTimer，
   packages/algorithms/src/data/*.ts，GPL-3.0）。本脚本只提取「公式文本」这一
   功能信息，并自行模拟推导案例状态图，不搬运其代码。

   复用 tools/cfop/js/rubik-core.js 的 3x3 贴纸模型；
   中层 M/E/S、整体转体 x/y/z、宽步法 r l u d f b / Rw 在解析器内展开成基本步，
   不动被其它训练器共用的 rubik-core.js。

   关键处理：源数据的 setup 只与列表中「某一条」公式配对（88% 的 case 至少有一条
   公式能把 setup 态复原，但未必是第一条）。因此逐条用魔方模型模拟校验，
   把可复原的公式提到首位；12% 全部对不上的 case 改用「首公式取逆」自造案例状态，
   保证页面上「显示的案例」一定能被「默认公式」复原。

   用法：node tools/cfop/scripts/gen-algsets.js
   输出：tools/cfop/data/{zbll,eg,sq1,mega}.json
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:/魔方站点备份/fto-site';
const SRC = path.join(ROOT, '.workbuddy/outputs/nt_src');
const OUT = path.join(ROOT, 'tools/cfop/data');

/* ---------- ① 载入 rubik-core ---------- */
const RC_PATH = path.join(ROOT, 'tools/cfop/js/rubik-core.js');
vm.runInThisContext(fs.readFileSync(RC_PATH, 'utf8'), { filename: RC_PATH });
const RC = globalThis.RubikCore;

/* ---------- ② 中层转动 M / E / S（环序法，与 rubik-core 的 U/D/L/R/F/B 同法推导） ---------- */
const MIDROW = [3, 4, 5];   // 中间行
const MIDCOL = [1, 4, 7];   // 中间列
const g3 = (c, f, idx) => [c[f][idx[0]], c[f][idx[1]], c[f][idx[2]]];
function s3(c, f, idx, a) { c[f][idx[0]] = a[0]; c[f][idx[1]] = a[1]; c[f][idx[2]] = a[2]; }
const rev = (a) => [a[2], a[1], a[0]];

/* M（like L，环序 U→F→D→B→U，走各面中间列；D→B 与 B→U 反序） */
function M(c) {
  const u = g3(c, 'U', MIDCOL), f = g3(c, 'F', MIDCOL), d = g3(c, 'D', MIDCOL), b = g3(c, 'B', MIDCOL);
  s3(c, 'F', MIDCOL, u); s3(c, 'D', MIDCOL, f); s3(c, 'B', MIDCOL, rev(d)); s3(c, 'U', MIDCOL, rev(b));
}
/* E（like D，环序 F→R→B→L→F，走各面中间行，全正序） */
function E(c) {
  const f = g3(c, 'F', MIDROW), r = g3(c, 'R', MIDROW), b = g3(c, 'B', MIDROW), l = g3(c, 'L', MIDROW);
  s3(c, 'R', MIDROW, f); s3(c, 'B', MIDROW, r); s3(c, 'L', MIDROW, b); s3(c, 'F', MIDROW, l);
}
/* S（like F，环序 U→R→D→L→U；U/D 走中间行、R/L 走中间列；R→D 与 L→U 反序） */
function S(c) {
  const u = g3(c, 'U', MIDROW), r = g3(c, 'R', MIDCOL), d = g3(c, 'D', MIDROW), l = g3(c, 'L', MIDCOL);
  s3(c, 'R', MIDCOL, u); s3(c, 'D', MIDROW, rev(r)); s3(c, 'L', MIDCOL, d); s3(c, 'U', MIDROW, rev(l));
}

/* ---------- ③ 步法解析与展开 ---------- */
/* 宽步法 = 外层面 + 相邻中层；整体转体 = 三层一起。
   ⚠️ 这里必须是 {face,n} / {slice,n} 对象（不是数组），applyToken 直接读 .face / .slice；
   早期版本写成 [['R'],['M',3]] 数组 → applyToken 读到 undefined → 整条 token 变空操作，
   导致所有带 r/l/u/d/f/b/x/y/z 的 setup 静默失效（v2.0.46 ZBLL 51 条错图的根因）。 */
const UNIT = {
  r: [{ face: 'R', n: 1 }, { slice: 'M', n: 3 }],
  l: [{ face: 'L', n: 1 }, { slice: 'M', n: 1 }],
  u: [{ face: 'U', n: 1 }, { slice: 'E', n: 3 }],
  d: [{ face: 'D', n: 1 }, { slice: 'E', n: 1 }],
  f: [{ face: 'F', n: 1 }, { slice: 'S', n: 1 }],
  b: [{ face: 'B', n: 1 }, { slice: 'S', n: 3 }],
  x: [{ face: 'R', n: 1 }, { slice: 'M', n: 3 }, { face: 'L', n: 3 }],
  y: [{ face: 'U', n: 1 }, { slice: 'E', n: 3 }, { face: 'D', n: 3 }],
  z: [{ face: 'F', n: 1 }, { slice: 'S', n: 1 }, { face: 'B', n: 3 }]
};
const SLICE = { M, E, S };
const invUnit = (u) => ({ face: u.face, slice: u.slice, n: (4 - u.n) % 4 });

function tokenUnits(tok) {
  const m = /^([UDLRFBMESxyz])([w]?)([0-9]?)([']?)$/i.exec(String(tok).trim());
  if (!m) return null;
  const L = m[1], wideMark = !!m[2], isLower = L >= 'a' && L <= 'z';
  const turns = m[3] ? parseInt(m[3], 10) : 1, prime = !!m[4];
  const U = L.toUpperCase();
  /* 整体转体 / 宽步法：整体一起转，取逆时各片分别取逆（互不重叠，顺序无关） */
  if (/^[XYZ]$/.test(U) || ((wideMark || isLower) && /^[UDLRFB]$/.test(U))) {
    const seq = UNIT[U.toLowerCase()];
    const out = [];
    for (let t = 0; t < turns; t++) out.push(...(prime ? seq.map(invUnit).reverse() : seq));
    return out;
  }
  if (/^[MES]$/.test(U)) {                       // 中层（M/E/S 与 m/e/s 同义）
    let n = turns % 4; if (prime) n = (4 - n) % 4;
    return n ? [{ slice: U, n }] : [];
  }
  let n = turns % 4; if (prime) n = (4 - n) % 4;   // 基本面（含 R3 / U2' 这类写法）
  return n ? [{ face: U, n }] : [];
}
function applyToken(c, tok) {
  const units = tokenUnits(tok);
  if (!units) return false;
  for (const u of units) {
    if (u.slice) { if (u.n) { for (let i = 0; i < u.n; i++) SLICE[u.slice](c); } }
    else if (u.n) { for (let i = 0; i < u.n; i++) RC.apply(c, u.face); }
  }
  return true;
}
function applyAlg(c, alg) {
  const bad = [];
  String(alg || '').split(/\s+/).forEach((t) => { if (t && !applyToken(c, t)) bad.push(t); });
  return bad;
}
const invTok = (t) => (t.endsWith("'") ? t.slice(0, -1) : t + "'");
const invertAlg = (alg) => String(alg).split(/\s+/).filter(Boolean).map(invTok).reverse().join(' ');

/* ---------- ④ 复原判定 ---------- */
const CORN = [0, 2, 6, 8];
const UP = 'w';                 // rubik-core 的 SOLVED.U
const DOWN = 'y';               // rubik-core 的 SOLVED.D
function allSolved(c) { return RC.isSolved(c); }
/* 最后一层复原：U 面单色且必须是顶色 + 四个侧面顶行各自单色
   （允许 AUF / 底层整体转动 —— ZBLL 只要求最后一层到位）。
   ⚠️ 必须校验 U 面颜色 == 顶色：早期只看「U 面单色」，整块转体后顶面其实是侧面
   也会被判过关，于是产出把 F2L 画到顶上的错图。 */
function llSolved(c) {
  if (c.U[0] !== UP) return false;
  if (!c.U.every((x) => x === UP)) return false;
  return ['F', 'R', 'B', 'L'].every((f) => c[f][0] === c[f][1] && c[f][1] === c[f][2]);
}
/* 状态本身是不是一个「可信的最后一层案例」：底面单色 + 四个侧面底行单色。
   ZBLL 还要求顶面四条棱已翻正（棱位是顶色），否则图与「ZBLL」名不符。
   opt.is2 = 二阶（用 3x3 模型的 8 个角）：只看角块，不看中心/棱。 */
function llCase(c, opt) {
  opt = opt || {};
  if (opt.is2) {
    if (!CORN.every((i) => c.D[i] === c.D[0])) return false;
    for (const f of ['F', 'R', 'B', 'L']) {
      if (c[f][6] !== c[f][8]) return false;
    }
    return true;
  }
  if (c.U[4] !== UP) return false;
  if (!c.D.every((x) => x === c.D[0])) return false;
  for (const f of ['F', 'R', 'B', 'L']) {
    if (c[f][6] !== c[f][7] || c[f][7] !== c[f][8]) return false;
  }
  if (opt.needEo && [1, 3, 5, 7].some((i) => c.U[i] !== UP)) return false;
  return true;
}
/* 2x2（用 3x3 模型表示，只看 8 个角块贴纸） */
function cornersSolved(c) {
  return ['U', 'D', 'F', 'R', 'B', 'L'].every((f) => CORN.every((i) => c[f][i] === c[f][0]));
}

/* ---------- ⑤ facelets ---------- */
const FILLER = { F: 'g', B: 'b', L: 'o', R: 'r' };
/* 3x3 顶面图：约定与 cube-art.js 完全一致（uf/ub/ul/ur 取各面自身视图的顶层三位） */
function face3(c, top) {
  const arm = (f) => {
    let s = '';
    for (let i = 0; i < 3; i++) { const ch = c[f][i]; s += ch === top ? 'y' : ch; }
    return s + FILLER[f].repeat(6);
  };
  return {
    'data-us': c.U.map((ch) => (ch === top ? 'y' : 'l')).join(''),
    'data-uf': arm('F'), 'data-ub': arm('B'), 'data-ul': arm('L'), 'data-ur': arm('R')
  };
}
/* 2x2 顶面图：us 4 贴 + 四臂各 2 贴（去掉每臂中间的棱） */
function face2(c, top) {
  const arm = (f) => [c[f][0], c[f][2]].map((ch) => (ch === top ? 'y' : ch)).join('');
  return {
    'data-us': [c.U[0], c.U[2], c.U[6], c.U[8]].map((ch) => (ch === top ? 'y' : 'l')).join(''),
    'data-uf': arm('F'), 'data-ub': arm('B'), 'data-ul': arm('L'), 'data-ur': arm('R')
  };
}

/* ---------- ⑥ 读 .ts 源 ---------- */
function loadTs(file) {
  let s = fs.readFileSync(path.join(SRC, file), 'utf8');
  s = s.replace(/^\s*import type[^\n]*\n/gm, '');
  const m = /export const\s+(\w+)(\s*:\s*[^=]+)?\s*=/i.exec(s);
  if (!m) throw new Error('找不到导出常量：' + file);
  s = s.replace(m[0], 'const ' + m[1] + ' =');
  s += `\n;__OUT__ = ${m[1]};`;
  const sb = { __OUT__: null };
  vm.createContext(sb); vm.runInContext(s, sb, { filename: file });
  return sb.__OUT__;
}
const algsOf = (c) => (c.algs || []).map((a) => String(a.moves).trim()).filter(Boolean);

/* ---------- ⑦ 「状态 + 公式列表」对齐：把可复原的公式排到前面 ---------- */
/* 返回 {state, algs, verified, mode, setup, sane}
   候选状态两个：① 源数据 setup 造出的态；② 首公式取逆自造态。
   优先选「可复原」且通过 saneFn（确实是一个最后一层案例）的候选；
   两个都不可信时退回第一个可复原的候选，保证永远有图可画。 */
function buildCandidate(setup) {
  const s = RC.newCube(); applyAlg(s, setup);
  return s;
}
function tryCandidate(state, rawAlgs, solvedFn) {
  const ok = [], no = [];
  for (const a of rawAlgs) {
    const k = RC.clone(state); applyAlg(k, a);
    (solvedFn(k) ? ok : no).push(a);
  }
  return { ok: ok.concat(no), verified: ok.length };
}
function alignStateAndAlgs(rawAlgs, setup, solvedFn, saneFn) {
  const invFirst = invertAlg(rawAlgs[0]);
  const cands = [];
  if (setup) cands.push({ state: buildCandidate(setup), setup, mode: 'setup' });
  cands.push({ state: buildCandidate(invFirst), setup: invFirst, mode: 'inverse' });

  let fallback = null;
  for (const cd of cands) {
    const t = tryCandidate(cd.state, rawAlgs, solvedFn);
    if (!t.verified) continue;
    const sane = saneFn ? !!saneFn(cd.state) : true;
    const rec = { state: cd.state, algs: t.ok, verified: t.verified, mode: cd.mode, setup: cd.setup, sane };
    if (sane) return rec;
    if (!fallback) fallback = rec;
  }
  if (fallback) return fallback;
  return { state: cands[cands.length - 1].state, algs: rawAlgs.slice(), verified: 0, mode: 'raw', setup: invFirst, sane: false };
}

/* ---------- ⑧ 四套数据 ---------- */
const ZBLL_FILES = [['zbll-t.ts', 'T'], ['zbll-u.ts', 'U'], ['zbll-l.ts', 'L'], ['zbll-h.ts', 'H'],
['zbll-pi.ts', 'Pi'], ['zbll-s.ts', 'S'], ['zbll-as.ts', 'As']];
function buildZBLL() {
  const cases = []; let bySetup = 0, byInverse = 0, insane = 0; const badTok = new Set();
  const badIds = [];
  for (const [file, tag] of ZBLL_FILES) {
    for (const c of loadTs(file)) {
      const raw = algsOf(c); if (!raw.length) continue;
      /* ZBLL 只要求最后一层复原（源数据中少数公式会留下底层整体转动，不影响 LL 判定）；
         saneFn 保证案例态本身是「底面完整 + 顶面棱已翻正」的真 ZBLL 态。 */
      const r = alignStateAndAlgs(raw, c.setup, llSolved, (s) => llCase(s, { needEo: true }));
      if (r.mode === 'setup') bySetup++; else byInverse++;
      if (!r.sane) { insane++; badIds.push(tag + ' ' + c.name); }
      applyAlg(RC.newCube(), c.setup).forEach((t) => badTok.add(t));
      cases.push({
        id: String(c.name).replace(/^ZBLL\s+/i, ''),
        subgroup: tag, setup: r.setup,
        facelets: face3(r.state, 'w'),
        orientations: [{ name: '', algs: r.algs }]
      });
    }
  }
  console.log(`  ZBLL  ${cases.length} 条 · 案例态取自源 setup ${bySetup} 条 / 取自首公式取逆 ${byInverse} 条 / 仍不可信 ${insane} 条`);
  if (insane) console.log('      不可信：' + badIds.slice(0, 8).join(' · '));
  if (badTok.size) console.log('      未识别记号: ' + [...badTok].slice(0, 10).join(' '));
  return { set: 'zbll', count: cases.length, cases };
}

function buildEG() {
  const cases = []; let vAll = 0, insane = 0; const badIds = [];
  for (const [file, tag] of [['cll.ts', 'CLL'], ['eg-1.ts', 'EG-1'], ['eg-2.ts', 'EG-2']]) {
    for (const c of loadTs(file)) {
      const raw = algsOf(c); if (!raw.length) continue;
      /* 源数据无 setup：用「公式取逆」造态（构造上必被该公式复原）。
         但公式开头若带整体转体 x / z，取逆后整个立方体是转过来的 → 顶面图会画错。
         判据用中心块：2x2 的公式只用面转（不含 M/E/S），所以「U 中心仍是顶色、
         D 中心仍是底色」等价于「没有 x / z 转体」（y 转体只是视角旋转，无害）。
         取第一条满足的公式并提到首位。⚠️ 不能用「底层单色」做判据 —— EG-1 是一层
         角块已换位、EG-2 是底层成条，底层本来就不单色。 */
      let picked = -1, state = null;
      for (let i = 0; i < raw.length; i++) {
        const s = RC.newCube(); applyAlg(s, invertAlg(raw[i]));
        if (s.U[4] === UP && s.D[4] === DOWN) { picked = i; state = s; break; }
      }
      if (picked < 0) {
        insane++; badIds.push(tag + ' ' + c.name);
        picked = 0; state = RC.newCube(); applyAlg(state, invertAlg(raw[0]));
      }
      const ordered = [raw[picked]].concat(raw.filter((_, i) => i !== picked));
      const t = tryCandidate(state, ordered, cornersSolved);
      if (t.verified) vAll++;
      cases.push({
        id: String(c.name), subgroup: tag, setup: invertAlg(ordered[0]),
        facelets: face2(state, 'w'),
        orientations: [{ name: '', algs: t.ok }]
      });
    }
  }
  console.log(`  EG    ${cases.length} 条 · 2x2 角块校验通过 ${vAll} 条 · 视角不可信 ${insane} 条`);
  if (insane) console.log('      不可信：' + badIds.slice(0, 8).join(' · '));
  return { set: 'eg', count: cases.length, cases };
}

function buildSQ1() {
  const cases = [];
  for (const file of ['sq1cs.ts', 'sq1co.ts', 'sq1cp.ts', 'sq1eo.ts', 'sq1ep.ts', 'sq1parity.ts']) {
    for (const c of loadTs(file)) {
      const algs = algsOf(c); if (!algs.length) continue;
      let id = String(c.name);
      cases.push({
        id, subgroup: c.group || '其它', setup: c.setup || '',
        facelets: null, orientations: [{ name: '', algs }]
      });
    }
  }
  /* id 去重：同名的不同阶段加阶段后缀 */
  const seen = new Map();
  for (const c of cases) {
    const n = (seen.get(c.id) || 0) + 1; seen.set(c.id, n);
    if (n > 1) c.id = c.id + ' · ' + c.subgroup;
  }
  console.log(`  SQ1   ${cases.length} 条 · Square-1 记法（(a,b) 转层 / 切），无状态图`);
  return { set: 'sq1', count: cases.length, cases };
}

function buildMEGA() {
  const cases = [];
  for (const file of ['megaminx-eo.ts', 'megaminx-co.ts', 'megaminx-cp.ts', 'megaminx-ep.ts']) {
    for (const c of loadTs(file)) {
      const algs = algsOf(c); if (!algs.length) continue;
      cases.push({
        id: String(c.name).replace(/^Megaminx\s+/i, ''),
        subgroup: String(c.group || '').replace(/^Megaminx\s+/i, ''),
        setup: '', facelets: null, orientations: [{ name: '', algs }]
      });
    }
  }
  console.log(`  MEGA  ${cases.length} 条 · 4LLL，无状态图`);
  return { set: 'mega', count: cases.length, cases };
}

module.exports = { RC, applyAlg, invertAlg, applyToken, tokenUnits, face3, face2, allSolved, llSolved, llCase, cornersSolved, loadTs, algsOf, alignStateAndAlgs, SRC };

/* ---------- ⑨ 输出 ---------- */
if (require.main !== module) return;
console.log('生成四套公式库 JSON：');
for (const s of [buildZBLL(), buildEG(), buildSQ1(), buildMEGA()]) {
  const seen = new Map();
  s.cases.forEach((c) => seen.set(c.id, (seen.get(c.id) || 0) + 1));
  const dup = [...seen.entries()].filter(([, n]) => n > 1);
  if (dup.length) console.log('  ⚠ ' + s.set + ' 仍有重复 id：' + dup.slice(0, 4).map(([k]) => k).join(', '));
  const groups = [...new Set(s.cases.map((c) => c.subgroup))];
  const algTot = s.cases.reduce((n, c) => n + (c.orientations[0].algs.length || 0), 0);
  console.log(`  → ${s.set}.json  ${s.cases.length} 条 / ${algTot} 个公式 / ${groups.length} 组：${groups.join(' · ')}`);
  const p = path.join(OUT, s.set + '.json');
  fs.writeFileSync(p, JSON.stringify(s), 'utf8');
  console.log(`     写出 ${(fs.statSync(p).size / 1024).toFixed(1)} KB`);
}
