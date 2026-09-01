/*
 * cube-model.js — 三阶魔方纯逻辑模型（浏览器 / Node 通用）
 * 坐标系（魔方自身局部坐标，固定不变）：
 *   +y = 黄(顶)   -y = 白(底)
 *   +z = 蓝(前)   -z = 绿(后)
 *   +x = 红(右)   -x = 橘(左)
 * 使用整数坐标与整数旋转，避免浮点误差。
 */
(function (global) {
  'use strict';

  // ---- 整数 90° 旋转族 ----
  // 命名 "x-" 表示绕 +x 轴旋转 -90°；"x+" 表示绕 +x 轴 +90°。其余类推。
  const ROT = {
    'x-': ([x, y, z]) => [x, z, -y],
    'x+': ([x, y, z]) => [x, -z, y],
    'y-': ([x, y, z]) => [-z, y, x],
    'y+': ([x, y, z]) => [z, y, -x],
    'z-': ([x, y, z]) => [y, -x, z],
    'z+': ([x, y, z]) => [-y, x, z],
  };

  const AXIS_INDEX = { x: 0, y: 1, z: 2 };

  // 面 -> [轴, 层]  （R/L/U/D/F/B 为转层；X/Y/Z 为整体转体，层=0）
  const FACE_AXIS_LAYER = {
    R: ['x', 1], L: ['x', -1], M: ['x', 0],
    U: ['y', 1], D: ['y', -1], E: ['y', 0],
    F: ['z', 1], B: ['z', -1], S: ['z', 0],
    X: ['x', 0], Y: ['y', 0], Z: ['z', 0],
  };

  const COLOR = {
    '黄': '#FFD400', '白': '#F5F5F5',
    '蓝': '#1E6BFF', '绿': '#0Faa3c',
    '红': '#E8321F', '橘': '#FF7A00',
  };
  // 法向 -> 颜色（魔方自身局部坐标，固定）
  const FACE_COLOR = {
    '1,0,0': '红', '-1,0,0': '橘',
    '0,1,0': '黄', '0,-1,0': '白',
    '0,0,1': '蓝', '0,0,-1': '绿',
  };

  function key(v) { return v.join(','); }

  // 解析单个移动记号 -> {axis, layer, prime, double}
  function parseToken(tok) {
    tok = tok.trim();
    if (!tok) return null;
    let face = tok[0];
    let rest = tok.slice(1);
    let prime = false, dbl = false;
    if (rest.endsWith("'")) { prime = true; rest = rest.slice(0, -1); }
    if (rest === '2') { dbl = true; }
    const fl = FACE_AXIS_LAYER[face];
    if (!fl) throw new Error('未知移动: ' + tok);
    // X/Y/Z 为整体转体（影响全部 26 块）；M/E/S 为中间层切片（仅 layer=0 的那一层）
    const whole = (face === 'X' || face === 'Y' || face === 'Z');
    return { axis: fl[0], layer: fl[1], prime: prime, double: dbl, whole: whole };
  }

  // 解析整条公式字符串 -> token 数组
  function parseSeq(str) {
    return str.split(/\s+/).map(parseToken).filter(Boolean);
  }

  // ---- Cube 状态 ----
  // 每个 cubie: { p:[x,y,z], s:[{n:[nx,ny,nz], c:颜色}] }
  function solvedState() {
    const cubies = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // 中心块不建模（固定）
          const s = [];
          if (x !== 0) s.push({ n: [x, 0, 0], c: FACE_COLOR[[x, 0, 0].join(',')] });
          if (y !== 0) s.push({ n: [0, y, 0], c: FACE_COLOR[[0, y, 0].join(',')] });
          if (z !== 0) s.push({ n: [0, 0, z], c: FACE_COLOR[[0, 0, z].join(',')] });
          cubies.push({ p: [x, y, z], s: s });
        }
    return cubies;
  }

  function cloneState(st) {
    return st.map(c => ({ p: c.p.slice(), s: c.s.map(k => ({ n: k.n.slice(), c: k.c })) }));
  }

  // 对单个 cubie 应用沿 axis 的 ROT(dir)
  function rotateCubie(cubie, axis, rotName) {
    const r = ROT[rotName];
    cubie.p = r(cubie.p);
    for (const k of cubie.s) k.n = r(k.n);
  }

  // 应用一个移动记号（原地修改 state）
  function applyMove(state, tok) {
    const m = (typeof tok === 'string') ? parseToken(tok) : tok;
    const ai = AXIS_INDEX[m.axis];
    const rotName = m.axis + (m.prime ? '+' : '-'); // ROT 名：x-/x+ 等
    const times = m.double ? 2 : 1;
    const affected = [];
    for (let i = 0; i < state.length; i++) {
      if (m.whole || state[i].p[ai] === m.layer) affected.push(state[i]);
    }
    for (let t = 0; t < times; t++) {
      for (const c of affected) rotateCubie(c, m.axis, rotName);
    }
    return state;
  }

  function applySeq(state, seq) {
    const tokens = (typeof seq === 'string') ? parseSeq(seq) : seq;
    for (const t of tokens) applyMove(state, t);
    return state;
  }

  // 是否完全复原：每个贴纸的颜色必须等于其法向对应的固定面色
  function isSolved(state) {
    for (const c of state) {
      for (const k of c.s) {
        if (k.c !== FACE_COLOR[k.n.join(',')]) return false;
      }
    }
    return true;
  }

  // 随机打乱（返回移动数组，不改变 state；调用方自行 applySeq）
  function scramble(n) {
    const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
    const mods = ['', "'", '2'];
    const seq = [];
    let last = '';
    for (let i = 0; i < (n || 25); i++) {
      let f;
      do { f = faces[Math.floor(Math.random() * faces.length)]; } while (f === last);
      last = f;
      seq.push(f + mods[Math.floor(Math.random() * mods.length)]);
    }
    return seq;
  }

  // 取某位置、某法向上的颜色（渲染用）
  function colorAt(state, pos, normal) {
    for (const c of state) {
      if (c.p[0] === pos[0] && c.p[1] === pos[1] && c.p[2] === pos[2]) {
        for (const k of c.s) if (k.n.join(',') === normal.join(',')) return k.c;
      }
    }
    return null;
  }

  // 第三课「拼小花」高亮：仅保留 白/黄 中心 + 含白色的棱块，其余置灰。
  // 依据 cubie 的贴纸内容判断（与位置无关，转层/打乱后依旧稳定）。
  function isFlowerKeyCubie(c) {
    const colors = c.s.map(function (k) { return k.c; });
    if (c.s.length === 1) {
      // 中心块：白心 / 黄心
      return colors.indexOf('白') >= 0 || colors.indexOf('黄') >= 0;
    }
    if (c.s.length === 2) {
      // 棱块：含白色的（即四个有白色的棱块）
      return colors.indexOf('白') >= 0;
    }
    return false; // 角块：置灰
  }

  // 第五课「复原白色一层」高亮：在第四课基础上再加 4 个含白色的角块。
  // 即：黄色中心（方位参照）+ 任何含白色贴纸的块（白心、白棱、白角）保留本色，其余置灰。
  function isWhiteLayerKeyCubie(c) {
    const colors = c.s.map(function (k) { return k.c; });
    if (c.s.length === 1 && colors[0] === '黄') return true; // 黄心：方位参照
    return colors.indexOf('白') >= 0; // 白心 / 白棱 / 白角
  }

  // 第六课「复原前两层」高亮：保留 6 个中心块（黄心/白心/蓝绿红橘侧中心，二层需有中心块）、
  // 白层棱与角（白心已在中心块处理）、中层 4 个棱块（含黄/不含白）；顶层黄棱/黄角仍置灰，循序渐进。
  function isTwoLayerKeyCubie(c) {
    const colors = c.s.map(function (k) { return k.c; });
    if (c.s.length === 1) return true;                              // 6 个中心块全部保留本色
    if (colors.indexOf('白') >= 0) return true;                       // 白层棱/角
    if (c.s.length === 2 && colors.indexOf('黄') < 0) return true;    // 中层棱（不含白、不含黄）
    return false;                                                     // 顶层黄棱/黄角置灰
  }

  // 第七课「顶面黄十字」高亮：前两层沿用第六课 twoLayer（18 块全色）；
  // 顶层只保留黄色中心块（已在 twoLayer 的中心块中）与四个黄色棱块的“黄面”，
  // 其余（黄棱侧面、黄角）置灰，凸显黄色十字。
  // 返回 true=整块真色；返回 {keep:['黄']}=只保留指定颜色的贴纸，其余置灰。
  function isYellowCrossKeyCubie(c) {
    if (isTwoLayerKeyCubie(c)) return true;                       // 前两层不变
    const colors = c.s.map(function (k) { return k.c; });
    if (c.s.length === 2 && colors.indexOf('黄') >= 0) return { keep: ['黄'] }; // 仅黄面本色
    return false;                                                   // 其余置灰
  }

  // 第八课「顶层黄色面」高亮：前两层沿用 twoLayer（18 块全色）；
  // 顶层所有含黄色的块（4 个黄棱 + 4 个黄角）都只保留“黄面”，使顶面成为完整一片黄，
  // 其余侧面置灰，强调“把顶层染黄”。
  function isYellowFaceKeyCubie(c) {
    if (isTwoLayerKeyCubie(c)) return true;                       // 前两层不变
    const colors = c.s.map(function (k) { return k.c; });
    if (colors.indexOf('黄') >= 0) return { keep: ['黄'] };       // 顶层含黄的棱/角：仅黄面本色
    return false;
  }

  // 第九课「找眼睛」高亮：前两层沿用 twoLayer（18 块全色）；
  // 顶层四棱同第8课（仅黄面本色）；顶层四角全部填色（三面本色），便于识别“眼睛”(相邻角同色)。
  function isEyesKeyCubie(c) {
    if (isTwoLayerKeyCubie(c)) return true;                       // 前两层不变
    const colors = c.s.map(function (k) { return k.c; });
    if (c.s.length === 3 && colors.indexOf('黄') >= 0) return true; // 顶层四角：全色填充
    if (colors.indexOf('黄') >= 0) return { keep: ['黄'] };       // 顶层四棱：仅黄面（同第8课）
    return false;
  }

  const API = {
    ROT, AXIS_INDEX, FACE_AXIS_LAYER, COLOR, FACE_COLOR,
    solvedState, cloneState, applyMove, applySeq, isSolved, scramble,
    parseToken, parseSeq, colorAt, key, isFlowerKeyCubie, isWhiteLayerKeyCubie, isTwoLayerKeyCubie, isYellowCrossKeyCubie, isYellowFaceKeyCubie, isEyesKeyCubie,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.CubeModel = API;
})(typeof window !== 'undefined' ? window : globalThis);
