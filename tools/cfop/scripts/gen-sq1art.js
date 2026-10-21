/* =============================================================================
   gen-sq1art.js —— 为 sq1.json 的每条案例生成「上下两层」示意图，写回 art 字段
   -----------------------------------------------------------------------------
   两类图：
     ① 打方形（*Slices，169 条）：按 case 名里的两个标准形状名（Kite / Star / Scallop…）
        直接画两个形状轮廓。形状名 → bit pattern 取自公开的形状穷举表（1=角 0=棱，
        2 角 8 棱 / 3 角 6 棱 / 4 角 4 棱 / 5 角 2 棱 / 6 角 0 棱，共 29 种）。
     ② 其余 76 条（CO/CP/EO/EP/Parity）：跑 setup 得到真实状态，逐块上色 ——
        位置与方向都对 = 绿，位置对但翻转 = 黄，位置不对 = 灰。

   几何模型（用「cube shape 必须画成正方形」校验过）：
     一层 = 12 个 30° 单元；角块占 2 单元、外缘两条直边中间折成 90°；棱块占 1 单元。
     取内切半径 d=1：单元边界顶点 r1 = 1/cos15° = 1.0353，角块折角顶点 r2 = √2。
     下层按「从下往上看」镜像绘制，与真机翻转看底层一致。

   配色走 CSS 类（写在 cfop-trainer.css ⑩ 节），随深浅主题切换。

   用法：node tools/cfop/scripts/gen-sq1art.js
         node tools/cfop/scripts/gen-sq1art.js --preview   （只输出预览页，不改数据）
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'sq1.json');
const PREVIEW = process.argv.includes('--preview');

/* ---------- ① 形状名 → bit pattern ---------- */
const SHAPE = {
  star: '111111',
  '8': '1100000000', '7-1': '1010000000', '6-2': '1001000000',
  '5-3': '1000100000', '4-4': '1000010000',
  '6': '111000000', 'right 5-1': '110100000', 'right 4-2': '110010000',
  '3-3': '110001000', 'left 4-2': '110000100', 'left 5-1': '110000010',
  '4-1-1': '101010000', '3-1-2': '101001000', '3-2-1': '101000100',
  '2-2-2': '100100100',
  scallop: '11110000', 'right pawn': '11101000', shield: '11100100',
  'left pawn': '11100010', muffin: '11011000', 'left fist': '11010100',
  kite: '11010010', barrel: '11001100', 'right fist': '11001010',
  square: '10101010',
  pair: '1111100', 'perpendicular edges': '1111010', 'parallel edges': '1110110'
};
const shapeKey = (raw) => String(raw).trim().toLowerCase()
  .replace(/\s+(odd|even)$/, '')
  .replace(/\bpaw\b/g, 'pawn');

/* ---------- ② 几何 ---------- */
const R1 = 1 / Math.cos(Math.PI / 12);
const R2 = Math.SQRT2;
const STEP = 30;

function unitsOfPattern(pat) {
  const units = [];
  pat.split('').forEach((ch, pi) => {
    const n = ch === '1' ? 2 : 1;
    for (let k = 0; k < n; k++) units.push(pi);
  });
  if (units.length !== 12) throw new Error('bit pattern 长度不对: ' + pat);
  return units;
}

/* 每 30° 一个顶点：跨块 = r1，块内 = r2 */
function ringPts(units, cx, cy, rad, mirror) {
  const out = [];
  for (let k = 0; k < 12; k++) {
    const prev = units[(k + 11) % 12], cur = units[k];
    const rr = prev === cur ? R2 : R1;
    const t = (k * STEP - 90) * Math.PI / 180;
    let x = Math.cos(t) * rr * rad / R2;
    const y = Math.sin(t) * rr * rad / R2;
    if (mirror) x = -x;
    out.push([cx + x, cy + y]);
  }
  return out;
}
const fmt = (n) => String(Math.round(n * 10) / 10);
const ptStr = (pts) => pts.map((p) => fmt(p[0]) + ',' + fmt(p[1])).join(' ');

/* 去掉共线点，缩短 points 串 */
function dropCollinear(pts) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 0.35) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

/* 一层拆成「块」：{pid, slots[]}（slots = 30° 格序号） */
function piecesOf(units) {
  const list = [];
  for (let k = 0; k < 12; k++) {
    if (list.length && list[list.length - 1].pid === units[k]) list[list.length - 1].slots.push(k);
    else list.push({ pid: units[k], slots: [k] });
  }
  if (list.length > 1 && list[0].pid === list[list.length - 1].pid) {
    list[0].slots = list[list.length - 1].slots.concat(list[0].slots);
    list.pop();
  }
  return list;
}

/* 形状轮廓（只画外框） */
function outlineSvg(units, cx, cy, rad, mirror) {
  const pts = dropCollinear(ringPts(units, cx, cy, rad, mirror));
  return '<polygon class="sq1-sh" points="' + ptStr(pts) + '"/>';
}

/* 逐块上色的状态图。
   SQ1 的四步（CO → CP → EO → EP）是分阶段练的，前一步做完后剩下的块本来就是乱的，
   所以只给「这一步关心的块」上色，其余统一画成中性浅灰（表示此步不关心）。
   focus: { type:'c'|'e'|'all', mode:'flip'|'pos'|'both' } */
function stateLayerSvg(units, st, side, cx, cy, rad, mirror, focus) {
  const home = HOME[side];
  const out = [];
  const ring = ringPts(units, cx, cy, rad, mirror);
  for (const p of piecesOf(units)) {
    const slots = p.slots.slice().sort((a, b) => a - b);
    const pts = [[cx, cy]];
    for (let i = 0; i < slots.length; i++) {
      const k = slots[i];
      pts.push(ring[k]);
      pts.push(ring[(k + 1) % 12]);
    }
    const kind = p.pid[0];
    const watched = focus.type === 'all' || focus.type === kind;
    let cls = 'sq1-n';
    if (watched) {
      const hs = home[p.pid];
      const okPos = hs && slots.length === hs.size && slots.every((k) => hs.has(k));
      const okFlip = st.flip[p.pid] === 0;
      if (focus.mode === 'flip') cls = okFlip ? 'sq1-g' : 'sq1-y';
      else if (focus.mode === 'pos') cls = okPos ? 'sq1-g' : 'sq1-b';
      else cls = okPos ? (okFlip ? 'sq1-g' : 'sq1-y') : 'sq1-b';
    }
    out.push('<polygon class="' + cls + '" points="' + ptStr(pts) + '"/>');
  }
  const ring2 = dropCollinear(ringPts(units, cx, cy, rad, mirror));
  out.push('<polygon class="sq1-ol" points="' + ptStr(ring2) + '"/>');
  return out.join('');
}

/* subgroup → 该步关心什么 */
const FOCUS = {
  'Corner Orientation': { type: 'c', mode: 'flip' },
  'Corner Permutation': { type: 'c', mode: 'pos' },
  'Edge Orientation': { type: 'e', mode: 'flip' },
  'Edge Permutation': { type: 'e', mode: 'pos' },
  'Parity': { type: 'all', mode: 'both' }
};

/* ---------- ③ SQ1 模拟器（/ 规则与转层方向已用 237/245 条 setup+公式回归校验） ---------- */
function newState() {
  const mk = (base) => {
    const o = [];
    for (let i = 0; i < 4; i++) {
      const c = 'c' + (base + i), e = 'e' + (base + i);
      o.push(c, c, c, c, e, e);
    }
    return o;
  };
  const flip = {};
  for (let i = 0; i < 8; i++) { flip['c' + i] = 0; flip['e' + i] = 0; }
  return { top: mk(0), bot: mk(4), flip };
}
const shift = (a, n) => { const m = ((n % 24) + 24) % 24; return a.slice(24 - m).concat(a.slice(0, 24 - m)); };
const revArr = (a) => a.slice().reverse();

function run(st0, text) {
  const st = { top: st0.top.slice(), bot: st0.bot.slice(), flip: Object.assign({}, st0.flip) };
  for (const raw of String(text).match(/\([^)]*\)|\//g) || []) {
    const t = raw.trim();
    if (t === '/') {
      const movers = new Set(st.top.slice(12).concat(st.bot.slice(12)));
      const top = revArr(st.bot.slice(0, 12)).concat(st.top.slice(12));
      const bot = revArr(st.top.slice(0, 12)).concat(st.bot.slice(12));
      st.top = top; st.bot = bot;
      for (const id of movers) if (st.flip[id] !== undefined) st.flip[id] ^= 1;
    } else {
      const m = /^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(t);
      if (!m) return null;
      st.top = shift(st.top, parseInt(m[1], 10) * 2);
      st.bot = shift(st.bot, -parseInt(m[2], 10) * 2);
    }
  }
  return st;
}

const latticeOf = (half) => {
  const units = [];
  for (let k = 0; k < 12; k++) units.push(half[k * 2]);
  return units;
};
const HOME = (() => {
  const s = newState();
  const build = (arr) => {
    const m = {};
    for (let i = 0; i < 24; i++) {
      const id = arr[i];
      if (!m[id]) m[id] = new Set();
      m[id].add(Math.floor(i / 2));
    }
    return m;
  };
  return { top: build(s.top), bot: build(s.bot) };
})();

/* ---------- ④ 组装 ---------- */
const CX = [18.5, 56.5], CY = 37.5, RAD = 17.4;

function artForShapeCase(id) {
  const pats = id.split(' / ').map((x) => SHAPE[shapeKey(x)]);
  if (pats.some((p) => !p)) return null;
  const cell = pats.map((pat, i) => outlineSvg(unitsOfPattern(pat), CX[i], CY, RAD, i === 1));
  return wrap(cell);
}
function artForStateCase(st, focus) {
  const cell = [st.top, st.bot].map((half, i) => stateLayerSvg(
    latticeOf(half), st, i === 0 ? 'top' : 'bot', CX[i], CY, RAD, i === 1, focus));
  return wrap(cell);
}
const wrap = (cell) => '<svg class="cfop-net cfop-net--sq1" viewBox="0 0 75 75" aria-hidden="true">'
  + cell[0] + cell[1] + '</svg>';

/* ---------- ⑤ 主流程 ---------- */
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
let shapeOk = 0, shapeMiss = 0, stateOk = 0, stateFail = 0;
const miss = [], failed = [];
const samples = [];

for (const c of data.cases) {
  const isShape = /Slice(s)?$/.test(c.subgroup);
  let art = null;
  if (isShape) {
    art = artForShapeCase(c.id);
    if (art) shapeOk++; else { shapeMiss++; miss.push(c.id); }
  } else {
    const st = run(newState(), c.setup);
    if (st) { art = artForStateCase(st, FOCUS[c.subgroup] || { type: 'all', mode: 'both' }); stateOk++; } else { stateFail++; failed.push(c.id); }
  }
  c.art = art || null;
  if (samples.length < 12 && ['Kite / Kite', 'Star / 6-2', 'Square / Right paw', 'Barrel / Barrel',
    'Perpendicular Edges / 3-1-2', '2-2', 'Adj / Opp', 'H / H', 'Solved / Opp', 'Opp Parity',
    '3-1-2 / Perpendicular Edges', 'Muffin / Square'].includes(c.id)) samples.push(c);
}

console.log('形状图', shapeOk, '条；未匹配形状名', shapeMiss, miss.slice(0, 6).join(' | '));
console.log('状态图', stateOk, '条；setup 解析失败', stateFail, failed.slice(0, 6).join(' | '));

if (PREVIEW) {
  const cells = samples.map((c) => `<div class="c"><div class="art">${c.art}</div><div class="nm">${c.id}</div><div class="sb">${c.subgroup}</div></div>`).join('');
  const html = `<!doctype html><meta charset=utf-8><style>
    :root{--face-u:#EFF2F7;--face-d:#FFD500;--face-f:#00A650;--fg-2:#5B6474;--fg-3:#8A93A6;--bg:#fff;--fg:#1b1c18}
    body{margin:0;background:var(--bg);font:14px/1.4 system-ui;color:var(--fg);display:flex;flex-wrap:wrap;gap:18px;padding:20px}
    .c{width:150px;text-align:center}
    .art{width:150px;height:150px;border:1px solid #ddd;border-radius:10px;padding:4px}
    .art svg{width:100%;height:100%}
    .nm{margin-top:6px;font-weight:600}.sb{color:#888;font-size:12px}
    .sq1-sh{fill:#EFF2F7;fill-opacity:.75;stroke:#5B6474;stroke-width:1.3;stroke-linejoin:round}
    .sq1-ol{fill:none;stroke:#5B6474;stroke-width:1.3;stroke-linejoin:round}
    .sq1-g{fill:#00A650;stroke:#5B6474;stroke-width:.5}
    .sq1-y{fill:#FFD500;stroke:#5B6474;stroke-width:.5}
    .sq1-b{fill:#B9C0CC;stroke:#5B6474;stroke-width:.5}
  </style>${cells}`;
  try {
    fs.writeFileSync(path.join(__dirname, '..', '..', '..', '.workbuddy', 'outputs', 'sq1_preview.html'), html);
    console.log('预览已写 .workbuddy/outputs/sq1_preview.html');
  } catch (e) {
    console.log('!! 预览写不出（本机没有 .workbuddy/outputs，属正常）：', e.code || e.message);
  }
} else {
  fs.writeFileSync(DATA, JSON.stringify(data));
  console.log('sq1.json 体积', (fs.statSync(DATA).size / 1024).toFixed(1), 'KB');
}
