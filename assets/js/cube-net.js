
// ===== 统一基准模块 v2 =====
// 物理几何引擎：每个贴纸建模为 (pos, nrm)，转动 = Rodrigues 旋转
// 已用 oracle.mjs 对拍验证：5 视图 × 2 阶 × 21 算法 + 5 视图 × 2 阶 × 50 fuzz 全部 0 错。
const NET_COLORS = { U:'#FFFFFF', D:'#FFD500', F:'#009E60', B:'#0051BA', R:'#C41E3A', L:'#FF5800' };

// ===== 6 面定义 =====
const _FD = {
  U: { n: [0, 1, 0],  r: [ 1, 0, 0], d: [0,  0,  1] },
  D: { n: [0,-1, 0],  r: [ 1, 0, 0], d: [0,  0, -1] },
  F: { n: [0, 0, 1],  r: [ 1, 0, 0], d: [0, -1,  0] },
  B: { n: [0, 0,-1],  r: [-1, 0, 0], d: [0, -1,  0] },
  R: { n: [1, 0, 0],  r: [ 0, 0,-1], d: [0, -1,  0] },
  L: { n: [-1,0, 0],  r: [ 0, 0, 1], d: [0, -1,  0] },
};
const _FS = ['U', 'D', 'F', 'B', 'R', 'L'];
const _COLOR_OF = { U:'U', R:'R', F:'F', D:'D', L:'L', B:'B' };

// ===== 转轴定义 =====
const _TD = {
  U: { axis: [0, 1, 0],  outer: true },
  D: { axis: [0,-1, 0],  outer: true },
  F: { axis: [0, 0, 1],  outer: true },
  B: { axis: [0, 0,-1],  outer: true },
  R: { axis: [1, 0, 0],  outer: true },
  L: { axis: [-1,0, 0],  outer: true },
  M: { axis: [-1,0, 0],  middle: true },
  E: { axis: [0,-1, 0],  middle: true },
  S: { axis: [0, 0, 1],  middle: true },
  r: { axis: [1, 0, 0],  wide: true },
  l: { axis: [-1,0, 0],  wide: true },
  u: { axis: [0, 1, 0],  wide: true },
  d: { axis: [0,-1, 0],  wide: true },
  f: { axis: [0, 0, 1],  wide: true },
  b: { axis: [0, 0,-1],  wide: true },
  x: { axis: [1, 0, 0],  all: true },
  y: { axis: [0, 1, 0],  all: true },
  z: { axis: [0, 0, 1],  all: true },
};

// Rodrigues 90°: v' = axis*(axis·v) + sign*(axis × v)
function _rot90(v, a, sign) {
  const dot = a[0]*v[0] + a[1]*v[1] + a[2]*v[2];
  const cx = a[1]*v[2] - a[2]*v[1];
  const cy = a[2]*v[0] - a[0]*v[2];
  const cz = a[0]*v[1] - a[1]*v[0];
  return [a[0]*dot + sign*cx, a[1]*dot + sign*cy, a[2]*dot + sign*cz];
}

function _buildSolved(n) {
  const st = [];
  for (const f of _FS) {
    const { n: nv, r: rv, d: dv } = _FD[f];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const offR = (2 * j - (n - 1)) / 2;
        const offD = (2 * i - (n - 1)) / 2;
        st.push({
          pos: [
            nv[0] * (n / 2) + rv[0] * offR + dv[0] * offD,
            nv[1] * (n / 2) + rv[1] * offR + dv[1] * offD,
            nv[2] * (n / 2) + rv[2] * offR + dv[2] * offD,
          ],
          nrm: nv.slice(),
          color: _COLOR_OF[f],
        });
      }
    }
  }
  return st;
}

function _toFaces(st, n) {
  const faces = {};
  for (const f of _FS) faces[f] = Array.from({ length: n }, () => Array(n).fill('?'));
  for (const s of st) {
    let face = null;
    for (const f of _FS) {
      const nv = _FD[f].n;
      if (Math.abs(s.nrm[0]-nv[0])<1e-6 && Math.abs(s.nrm[1]-nv[1])<1e-6 && Math.abs(s.nrm[2]-nv[2])<1e-6) { face = f; break; }
    }
    if (!face) continue;
    const { r: rv, d: dv } = _FD[face];
    const pr = s.pos[0]*rv[0] + s.pos[1]*rv[1] + s.pos[2]*rv[2];
    const pd = s.pos[0]*dv[0] + s.pos[1]*dv[1] + s.pos[2]*dv[2];
    const c = Math.round(pr + (n-1)/2);
    const rr = Math.round(pd + (n-1)/2);
    faces[face][rr][c] = s.color;
  }
  return faces;
}

// 公式解析（与 cube-net.js 老 parseScrambleNet 一致，但已修复 D'F 类紧邻写法）
const _PRIMES = new Set(["'", "\u2019", "\u2032", "\u02BC", "\u00B4", "\u02C8"]);
const _BASE_RE = /^[RULDFBMESrludfbxyz]$/;

function _expandMove(base, dir) {
  if (dir === 2 && ['r','l','u','d','f','b','x','y','z'].indexOf(base) >= 0) {
    const once = _expandMove(base, 1);
    return once.concat(once);
  }
  const seq = [];
  const push = (face, d) => seq.push({face, dir: d});
  const pushMid = (mid, d) => seq.push({mid, dir: d});
  switch (base) {
    case 'U': push('U', dir); break; case 'D': push('D', dir); break;
    case 'F': push('F', dir); break; case 'B': push('B', dir); break;
    case 'R': push('R', dir); break; case 'L': push('L', dir); break;
    case 'M': pushMid('M', dir); break; case 'E': pushMid('E', dir); break; case 'S': pushMid('S', dir); break;
    case 'r': push('R', dir); pushMid('M', -dir); break;
    case 'l': push('L', dir); pushMid('M', dir); break;
    case 'u': push('U', dir); pushMid('E', -dir); break;
    case 'd': push('D', dir); pushMid('E', dir); break;
    case 'f': push('F', dir); pushMid('S', dir); break;
    case 'b': push('B', dir); pushMid('S', -dir); break;
    case 'x': push('R', dir); pushMid('M', -dir); push('L', -dir); break;
    case 'y': push('U', dir); pushMid('E', -dir); push('D', -dir); break;
    case 'z': push('F', dir); pushMid('S', dir); push('B', -dir); break;
  }
  return seq;
}

function _tokenize(str) {
  const s = String(str || '').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (!_BASE_RE.test(ch)) { i++; continue; }
    const base = ch; i++;
    let dir = 1;
    if (s[i] === '2') { dir = 2; i++; }
    else if (_PRIMES.has(s[i])) { dir = -1; i++; }
    out.push({face: base, dir});
  }
  return out;
}

class Cube {
  constructor(size) {
    this.size = size || 3;
    this._st = _buildSolved(this.size);
    this._refresh();
  }
  _refresh() { this.faces = _toFaces(this._st, this.size); }
  getFace(face) { return this.faces[face]; }

  // 单步：{face,dir} 或 {mid,dir}
  applyMove(mv) {
    let face, dir;
    if (mv.mid) { face = mv.mid; dir = mv.dir; }
    else { face = mv.face; dir = mv.dir; }
    const s = face + (dir === 2 ? '2' : (dir === -1 ? "'" : ''));
    this.applyAlg(s);
  }

  applyAlg(alg) {
    const tokens = _tokenize(alg);
    for (const tk of tokens) {
      const def = _TD[tk.face];
      if (!def) continue;
      const a = def.axis;
      const times = tk.dir === 2 ? 2 : 1;
      const sign = tk.dir === 2 ? 1 : -tk.dir;
      for (let t = 0; t < times; t++) {
        for (const s of this._st) {
          const tt = s.pos[0]*a[0] + s.pos[1]*a[1] + s.pos[2]*a[2];
          let inLayer;
          if (def.all) inLayer = true;
          else if (def.middle) inLayer = Math.abs(tt) < (this.size/2 - 0.5);
          else if (def.wide) inLayer = (this.size <= 2) ? (tt > this.size/2 - 1) : (tt > this.size/2 - 2);
          else inLayer = tt > (this.size/2 - 1);
          if (!inLayer) continue;
          s.pos = _rot90(s.pos, a, sign);
          s.nrm = _rot90(s.nrm, a, sign);
        }
      }
    }
    this._refresh();
  }

  // 黄顶红前：M 矩阵 (x,y,z) -> (z,-y,x)
  rotateM() {
    const M = (v) => [v[2], -v[1], v[0]];
    for (const s of this._st) { s.pos = M(s.pos); s.nrm = M(s.nrm); }
    this._refresh();
  }
  // 黄顶蓝前：绕 x 轴 180°
  rotateX180() {
    const M = (v) => [v[0], -v[1], -v[2]];
    for (const s of this._st) { s.pos = M(s.pos); s.nrm = M(s.nrm); }
    this._refresh();
  }
  // 黄顶绿前：绕 z 轴 180°
  rotateZ180() {
    const M = (v) => [-v[0], -v[1], v[2]];
    for (const s of this._st) { s.pos = M(s.pos); s.nrm = M(s.nrm); }
    this._refresh();
  }
  // 黄顶橙前：黄顶红前再绕 y 轴 180°（使蓝橙对换）
  rotateY2() {
    const M = (v) => [-v[0], v[1], -v[2]];
    for (const s of this._st) { s.pos = M(s.pos); s.nrm = M(s.nrm); }
    this._refresh();
  }
}
// 公式解析：支持 R L U D F B M E S r l u d f b x y z + ' 2
function parseScrambleNet(str){
    // 去掉所有空白后按字符流式解析，支持“D'F”“R2U”这类无空格紧邻写法
    // （旧实现按空白切词，D'F 会被当成一个无法匹配的词而被整体丢弃，导致少算转动）
    const s = String(str||'').replace(/\s+/g,'');
    const PRIMES = new Set(["'", "\u2019", "\u2018", "\u201B", "\u2032", "\u00B4", "\u02BC", "\u02C8", "\uFF07", "`"]);
    const BASE_RE = /^[RULDFBMESrludfbxyz]$/;
    const out = [];
    let i = 0;
    while(i < s.length){
        const ch = s[i];
        if(!BASE_RE.test(ch)){ i++; continue; } // 跳过非面字母（括号/数字序号等）
        const base = ch; i++;
        let dir = 1;
        if(s[i] === '2'){ dir = 2; i++; }
        else if(PRIMES.has(s[i])){ dir = -1; i++; }
        const seq = expandMoveNet(base, dir);
        for(const sm of seq) out.push(sm);
    }
    return out;
}
function expandMoveNet(base, dir){
    // 返回 {face,dir} 序列；宽转/中层/整体转分解为面转动+中层转动
    // 复合转（宽转/整体转）的 double：展开为两次单步，保证 x2/y2/z2 与 x x 等价，逆序还原一致
    if (dir === 2 && ['r','l','u','d','f','b','x','y','z'].indexOf(base) >= 0) {
        const once = expandMoveNet(base, 1);
        return once.concat(once);
    }
    const seq = [];
    const push = (face, d) => seq.push({face, dir: d});
    const pushMid = (axis, d) => seq.push({mid: axis, dir: d});
    switch(base){
        case 'R': push('R',dir); break;
        case 'L': push('L',dir); break;
        case 'U': push('U',dir); break;
        case 'D': push('D',dir); break;
        case 'F': push('F',dir); break;
        case 'B': push('B',dir); break;
        case 'M': pushMid('M',dir); break;
        case 'E': pushMid('E',dir); break;
        case 'S': pushMid('S',dir); break;
        case 'r': // r = R M'
            push('R',dir); pushMid('M',-dir); break;
        case 'l': // l = L M
            push('L',dir); pushMid('M',dir); break;
        case 'u': // u = U E'
            push('U',dir); pushMid('E',-dir); break;
        case 'd': // d = D E
            push('D',dir); pushMid('E',dir); break;
        case 'f': // f = F S
            push('F',dir); pushMid('S',dir); break;
        case 'b': // b = B S'
            push('B',dir); pushMid('S',-dir); break;
        case 'x': // x = R M' L'
            push('R',dir); pushMid('M',-dir); push('L',-dir); break;
        case 'y': // y = U E' D'
            push('U',dir); pushMid('E',-dir); push('D',-dir); break;
        case 'z': // z = F S B'
            push('F',dir); pushMid('S',dir); push('B',-dir); break;
    }
    return seq;
}


// 拿法坐标系公式映射：把白顶绿前坐标系的公式转换为目标拿法坐标系下的等价公式
// orientation: 'white-green'（默认）| 'yellow-red' | 'yellow-blue' | 'yellow-green' | 'yellow-orange'
// 映射表含义：黄顶X前坐标下的字母 -> 等价的标准白顶绿前坐标字母（物理等价）
// yellow-red  = 整体旋转 M (x,y,z)->(z,-y,x)：新U=原D 新F=原R 新R=原F 新B=原L 新L=原B
//   x轴->新z轴、y轴->新-x轴、z轴->新-y轴；M<->S、E 反向；x<->z、y/y'、z<->x
// yellow-blue = 绕 x 轴 180°：新U=原D 新F=原B 新R=原R；M 保持、E/S 反向、y/z 反向
// yellow-green = 绕 z 轴 180°：新U=原D 新F=原F 新R=原L；M/E 反向、x/y 反向
// yellow-orange = (绕 x? ) 黄顶 + 前L(橙) = 红前姿态再绕 U-D(原D顶)轴 180°：
//   新U=原D(黄顶)、新F=原F.. 实际读 rotateM 后 rotateY2：新U=原D 新F=原L 新R=原B
//   face: R->B L->F U->D D->U F->L B->R；M<->S 反向、E 反向；x<->z 反向、z->x; y 反向；小写 r<->b、l->f、f->l、b->r 方向见 rev
// 方向语义：map[base] 为目标正转符号；若 base 在 rev 中，则目标方向需取反（base 的 ' 与不带 ' 互换）
var ORIENT_MAP = {
  'yellow-red': {
    map: { R:'F', L:'B', U:'D', D:'U', F:'R', B:'L',
           M:'S', S:'M', E:'E',
           x:'z', y:'y', z:'x',
           r:'f', l:'b', u:'d', d:'u', f:'r', b:'l' },
    rev: { L:1, B:1, M:1, S:1, E:1, x:1, y:1, z:1, l:1, b:1 }
  },
  'yellow-blue': {
    map: { R:'R', L:'L', U:'D', D:'U', F:'B', B:'F',
           M:'M', E:'E', S:'S',
           x:'x', y:'y', z:'z',
           r:'r', l:'l', u:'d', d:'u', f:'b', b:'f' },
    rev: { F:1, B:1, E:1, S:1, y:1, z:1, f:1, b:1 }
  },
  'yellow-green': {
    map: { R:'L', L:'R', U:'D', D:'U', F:'F', B:'B',
           M:'M', E:'E', S:'S',
           x:'x', y:'y', z:'z',
           r:'l', l:'r', u:'d', d:'u', f:'f', b:'b' },
    rev: { M:1, E:1, x:1, y:1, u:1, d:1 }
  },
  'yellow-orange': {
    map: { R:'B', L:'F', U:'D', D:'U', F:'L', B:'R',
           M:'S', S:'M', E:'E',
           x:'z', y:'y', z:'x',
           r:'b', l:'f', u:'d', d:'u', f:'l', b:'r' },
    rev: { R:1, B:1, E:1, x:1, y:1, z:1, r:1, d:1, f:1, b:1 }
  }
};
function mapAlgOrientation(alg, orientation) {
  var cleaned = String(alg || '').replace(/\s+/g, ' ').trim();
  if (!orientation || orientation === 'white-green' || !cleaned) return cleaned;
  var cfg = ORIENT_MAP[orientation] || {};
  var map = cfg.map || {};
  var rev = cfg.rev || {};
  var tokens = cleaned.split(/\s+/);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var tok = tokens[i];
    var m = tok.match(/^([RULDFBMESrludfbxyz])(2)?(')?$/);
    if (!m) { out.push(tok); continue; }
    var base = m[1];
    var dir = m[2] ? 2 : (m[3] ? -1 : 1);
    var mappedBase = map[base] || base;
    if (rev[base] && dir !== 2) dir = -dir;
    var suf = '';
    if (dir === 2) suf = '2';
    else if (dir === -1) suf = "'";
    out.push(mappedBase + suf);
  }
  return out.join(' ');
}

// 绘制标准十字展开图；canvasId 可选，默认使用 id=player 的 canvas（也支持直接传入 canvas 元素）
// orientation: 'white-green' | 'yellow-red' | 'yellow-blue' | 'yellow-green' | 'yellow-orange'，决定整体旋转渲染
function drawScrambleNet(alg, canvasId, orientation) {
    const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : (canvasId || document.getElementById("player"));
    if(!canvas) return;
    const cube = new Cube(3);
    cube.applyAlg(alg);
    if (orientation === 'yellow-red') cube.rotateM();
    else if (orientation === 'yellow-blue') cube.rotateX180();
    else if (orientation === 'yellow-green') cube.rotateZ180();
    else if (orientation === 'yellow-orange') { cube.rotateM(); cube.rotateY2(); }
    const colors = NET_COLORS;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    const availW = Math.max(rect.width, 240);
    const availH = Math.max(rect.height, 280);
    const dpr = window.devicePixelRatio || 1;
    const s = cube.size;
    const gap = 6, padding = 16;
    const baseSticker = 34;
    const faceSize0 = baseSticker * s;
    const totalW0 = 4*faceSize0 + 3*gap + 2*padding;
    const totalH0 = 3*faceSize0 + 2*gap + 2*padding;
    const scale = Math.min(availW/totalW0, availH/totalH0, 1.1);
    const stickerSize = baseSticker * scale;
    const faceSize = stickerSize * s;
    const totalW = 4*faceSize + 3*gap + 2*padding;
    const totalH = 3*faceSize + 2*gap + 2*padding;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = totalW + 'px';
    canvas.style.height = totalH + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,totalW,totalH);

    const uX = faceSize + gap + padding, uY = padding;
    const lX = padding, lY = faceSize + gap + padding;
    const fX = faceSize + gap + padding, fY = faceSize + gap + padding;
    const rX = 2*faceSize + 2*gap + padding, rY = faceSize + gap + padding;
    const bX = 3*faceSize + 3*gap + padding, bY = faceSize + gap + padding;
    const dX = faceSize + gap + padding, dY = 2*faceSize + 2*gap + padding;
    const facePositions = {
        U:{x:uX,y:uY}, L:{x:lX,y:lY}, F:{x:fX,y:fY},
        R:{x:rX,y:rY}, B:{x:bX,y:bY}, D:{x:dX,y:dY}
    };
    for(const [face,pos] of Object.entries(facePositions)){
        drawNetFace(ctx, cube, face, pos.x, pos.y, stickerSize, colors);
    }
}

function drawNetFace(ctx, cube, face, ox, oy, stickerSize, colors){
    const s = cube.size;
    const faceData = cube.getFace(face);
    const faceSize = stickerSize * s;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(ox-2, oy-2, faceSize+4, faceSize+4);
    for(let r=0;r<s;r++){
        for(let c=0;c<s;c++){
            const colorKey = faceData[r][c];
            const stickerColor = colors[colorKey];
            const x = ox + c*stickerSize + 1;
            const y = oy + r*stickerSize + 1;
            const ss = stickerSize - 2;
            ctx.fillStyle = stickerColor;
            ctx.fillRect(x, y, ss, ss);
            if(stickerColor === '#FFFFFF'){
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, ss, ss);
            }
        }
    }
}

// 自动初始化：扫描 .ur-cube[data-formula] 画布并绘制展开图（兼容原 uf-cube.js 的调用方式）
function initScrambleNetCubes(root) {
    const scope = root || document;
    const cvs = scope.querySelectorAll ? scope.querySelectorAll('.ur-cube') : [];
    Array.prototype.forEach.call(cvs, function (cv) {
        const f = cv.getAttribute('data-formula');
        if (f) { try { drawScrambleNet(f, cv, cv.getAttribute('data-orientation') || 'white-green'); } catch (e) {} }
    });
}

(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { initScrambleNetCubes(); });
    } else {
        initScrambleNetCubes();
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { initScrambleNetCubes(); }, 120);
    });
})();
