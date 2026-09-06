
// ===== 统一基准模块 v2 =====
// practice 页已验证 Cube 类（标准 WCA U/D 方向）+ net 中层/宽转/整体转 + 修正版 parseScrambleNet
// 实现基于 cubing v0.63.4 KPattern（弃用易错的 strip-cycling）；
// 3x3 单步 27 + fuzz 100、2x2 单步 18 + fuzz 50 全部 0 错误（与 cubing 100% 一致）。
const NET_COLORS = { U:'#FFFFFF', D:'#FFD500', F:'#009E60', B:'#0051BA', R:'#C41E3A', L:'#FF5800' };

// 角块/棱块槽位（白顶绿前坐标系）
const CORNER_SLOTS_3 = [
  { idx:0, name:"FRU", cells:[["U",2,2],["F",0,2],["R",0,0]] },
  { idx:1, name:"BRU", cells:[["U",0,2],["B",0,0],["R",0,2]] },
  { idx:2, name:"BLU", cells:[["U",0,0],["L",0,0],["B",0,2]] },
  { idx:3, name:"FLU", cells:[["U",2,0],["F",0,0],["L",0,2]] },
  { idx:4, name:"DFR", cells:[["D",0,2],["F",2,2],["R",2,0]] },
  { idx:5, name:"DFL", cells:[["D",0,0],["L",2,2],["F",2,0]] },
  { idx:6, name:"BDL", cells:[["D",2,0],["B",2,2],["L",2,0]] },
  { idx:7, name:"BDR", cells:[["D",2,2],["B",2,0],["R",2,2]] },
];
const CORNER_SLOTS_2 = [
  { idx:0, name:"FRU", cells:[["U",1,1],["F",0,1],["R",0,0]] },
  { idx:1, name:"BRU", cells:[["U",0,1],["B",0,0],["R",0,1]] },
  { idx:2, name:"BLU", cells:[["U",0,0],["L",0,0],["B",0,1]] },
  { idx:3, name:"FLU", cells:[["U",1,0],["F",0,0],["L",0,1]] },
  { idx:4, name:"DFR", cells:[["D",0,1],["F",1,1],["R",1,0]] },
  { idx:5, name:"DFL", cells:[["D",0,0],["L",1,1],["F",1,0]] },
  { idx:6, name:"BDL", cells:[["D",1,0],["B",1,1],["L",1,0]] },
  { idx:7, name:"BDR", cells:[["D",1,1],["B",1,0],["R",1,1]] },
];
const EDGE_SLOTS_3 = [
  { idx:0,  name:"FU", cells:[["U",2,1],["F",0,1]] },
  { idx:1,  name:"RU", cells:[["U",1,2],["R",0,1]] },
  { idx:2,  name:"BU", cells:[["U",0,1],["B",0,1]] },
  { idx:3,  name:"LU", cells:[["U",1,0],["L",0,1]] },
  { idx:4,  name:"DF", cells:[["D",0,1],["F",2,1]] },
  { idx:5,  name:"DR", cells:[["D",1,2],["R",2,1]] },
  { idx:6,  name:"DB", cells:[["D",2,1],["B",2,1]] },
  { idx:7,  name:"DL", cells:[["D",1,0],["L",2,1]] },
  { idx:8,  name:"FR", cells:[["F",1,2],["R",1,0]] },
  { idx:9,  name:"FL", cells:[["F",1,0],["L",1,2]] },
  { idx:10, name:"BR", cells:[["B",1,0],["R",1,2]] },
  { idx:11, name:"BL", cells:[["B",1,2],["L",1,0]] },
];
const CORNER_STICKER_FACES = {};
for (const s of CORNER_SLOTS_3) CORNER_STICKER_FACES[s.idx] = s.cells.map(([f]) => f);
const EDGE_STICKER_FACES = {};
for (const s of EDGE_SLOTS_3) EDGE_STICKER_FACES[s.idx] = s.cells.map(([f]) => f);

// cubing v0.63.4 move 表（仅 9 个基本面 + 中层；prime/double 由 count 展开）
const MOVE_DATA = {
  "U":{ CORNERS:{ permutation:[1,2,3,0,4,5,6,7], orientationDelta:[0,0,0,0,0,0,0,0] },
        EDGES:  { permutation:[1,2,3,0,4,5,6,7,8,9,10,11], orientationDelta:[0,0,0,0,0,0,0,0,0,0,0,0] } },
  "D":{ CORNERS:{ permutation:[0,1,2,3,5,6,7,4], orientationDelta:[0,0,0,0,0,0,0,0] },
        EDGES:  { permutation:[0,1,2,3,7,4,5,6,8,9,10,11], orientationDelta:[0,0,0,0,0,0,0,0,0,0,0,0] } },
  "R":{ CORNERS:{ permutation:[4,0,2,3,7,5,6,1], orientationDelta:[2,1,0,0,1,0,0,2] },
        EDGES:  { permutation:[0,8,2,3,4,10,6,7,5,9,1,11], orientationDelta:[0,0,0,0,0,0,0,0,0,0,0,0] } },
  "L":{ CORNERS:{ permutation:[0,1,6,2,4,3,5,7], orientationDelta:[0,0,2,1,0,2,1,0] },
        EDGES:  { permutation:[0,1,2,11,4,5,6,9,8,3,10,7], orientationDelta:[0,0,0,0,0,0,0,0,0,0,0,0] } },
  "F":{ CORNERS:{ permutation:[3,1,2,5,0,4,6,7], orientationDelta:[1,0,0,2,2,1,0,0] },
        EDGES:  { permutation:[9,1,2,3,8,5,6,7,0,4,10,11], orientationDelta:[1,0,0,0,1,0,0,0,1,1,0,0] } },
  "B":{ CORNERS:{ permutation:[0,7,1,3,4,5,2,6], orientationDelta:[0,2,1,0,0,0,2,1] },
        EDGES:  { permutation:[0,1,10,3,4,5,11,7,8,9,6,2], orientationDelta:[0,0,1,0,0,0,1,0,0,0,1,1] } },
  "M":{ CORNERS:{ permutation:[0,1,2,3,4,5,6,7], orientationDelta:[0,0,0,0,0,0,0,0] },
        EDGES:  { permutation:[2,1,6,3,0,5,4,7,8,9,10,11], orientationDelta:[1,0,1,0,1,0,1,0,0,0,0,0] } },
  "E":{ CORNERS:{ permutation:[0,1,2,3,4,5,6,7], orientationDelta:[0,0,0,0,0,0,0,0] },
        EDGES:  { permutation:[0,1,2,3,4,5,6,7,9,11,8,10], orientationDelta:[0,0,0,0,0,0,0,0,1,1,1,1] } },
  "S":{ CORNERS:{ permutation:[0,1,2,3,4,5,6,7], orientationDelta:[0,0,0,0,0,0,0,0] },
        EDGES:  { permutation:[0,3,2,7,4,1,6,5,8,9,10,11], orientationDelta:[0,1,0,1,0,1,0,1,0,0,0,0] } },
};

class Cube {
  constructor(size) {
    this.size = size || 3;
    this._corners = { pieces:[0,1,2,3,4,5,6,7], orientation:[0,0,0,0,0,0,0,0] };
    this._edges   = { pieces:[0,1,2,3,4,5,6,7,8,9,10,11], orientation:[0,0,0,0,0,0,0,0,0,0,0,0] };
    this.faces = this._defaultFaces();
    this._refreshFaces();
  }

  _defaultFaces() {
    const f = {};
    for (const face of ['U','D','F','B','R','L']) {
      f[face] = [];
      for (let r = 0; r < this.size; r++) {
        f[face][r] = [];
        for (let c = 0; c < this.size; c++) f[face][r][c] = face;
      }
    }
    return f;
  }

  _refreshFaces() {
    this.faces = this._defaultFaces();
    const cs = (this.size === 2) ? CORNER_SLOTS_2 : CORNER_SLOTS_3;
    for (let s = 0; s < 8; s++) {
      const M = this._corners.pieces[s];
      const orient = this._corners.orientation[s];
      const n = 3;
      for (let i = 0; i < n; i++) {
        const [f, r, c] = cs[s].cells[i];
        this.faces[f][r][c] = CORNER_STICKER_FACES[M][(i - orient + n) % n];
      }
    }
    if (this.size === 2) return; // 2x2 无棱
    for (let s = 0; s < 12; s++) {
      const M = this._edges.pieces[s];
      const orient = this._edges.orientation[s];
      const n = 2;
      for (let i = 0; i < n; i++) {
        const [f, r, c] = EDGE_SLOTS_3[s].cells[i];
        this.faces[f][r][c] = EDGE_STICKER_FACES[M][(i - orient + n) % n];
      }
    }
  }

  getFace(face) { return this.faces[face]; }

  // 转动接口：move = {face|'U'..'B'|'M'/'E'/'S', dir 1/-1/2} 或 {mid, dir}（兼容 worksheet 风格）
  applyMove(move) {
    const baseName = move.mid || move.face;
    let count = 1;
    if (move.dir === -1) count = 3;
    else if (move.dir === 2) count = 2;
    for (let i = 0; i < count; i++) this._applyBaseMove(baseName);
    this._refreshFaces();
  }

  _applyBaseMove(name) {
    const mv = MOVE_DATA[name];
    if (!mv) throw new Error("unknown move: " + name);
    const cp = new Array(8), co = new Array(8);
    for (let i = 0; i < 8; i++) {
      cp[i] = this._corners.pieces[mv.CORNERS.permutation[i]];
      let o = this._corners.orientation[mv.CORNERS.permutation[i]] + mv.CORNERS.orientationDelta[i];
      co[i] = ((o % 3) + 3) % 3;
    }
    this._corners.pieces = cp; this._corners.orientation = co;
    const ep = new Array(12), eo = new Array(12);
    for (let i = 0; i < 12; i++) {
      ep[i] = this._edges.pieces[mv.EDGES.permutation[i]];
      let o = this._edges.orientation[mv.EDGES.permutation[i]] + mv.EDGES.orientationDelta[i];
      eo[i] = ((o % 2) + 2) % 2;
    }
    this._edges.pieces = ep; this._edges.orientation = eo;
  }

  // 公式串展开 + 应用（依赖外部 parseScrambleNet）
  applyAlg(alg) {
    for (const mv of parseScrambleNet(alg)) this.applyMove(mv);
  }

  // 整体旋转坐标系 M:(x,y,z)->(z,-y,x)：黄顶红前 = 原D顶、原R前
  // 新U=原D、新D=原U、新F=原R、新R=原F、新B=原L、新L=原B
  rotateM() {
    const n = this.size - 1;
    const u = this.faces.U, d = this.faces.D, ff = this.faces.F;
    const b = this.faces.B, r = this.faces.R, l = this.faces.L;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    const cw  = (m) => m.map((row, i) => row.map((_, j) => m[n - j][i]));
    const ccw = (m) => m.map((row, i) => row.map((_, j) => m[j][n - i]));
    const rotV = (m) => m.map((row, i) => m[n - i]);
    this.faces = {
      U: cw(d), D: ccw(u), F: rot(r), R: rot(ff), B: rotV(l), L: rotV(b),
    };
  }

  // 黄顶蓝前：绕 x 轴（R-L 方向）180°，新U=原D、新F=原B、新R=原R
  rotateX180() {
    const n = this.size - 1;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    const rotV = (m) => m.map((row, i) => m[n - i]);
    this.faces = {
      U: this.faces.D, D: this.faces.U,
      F: rotV(this.faces.B), B: rotV(this.faces.F),
      R: rot(this.faces.R), L: rot(this.faces.L),
    };
  }

  // 黄顶绿前：绕 z 轴（F-B 方向）180°，新U=原D、新F=原F、新R=原L
  rotateZ180() {
    const n = this.size - 1;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    this.faces = {
      U: rot(this.faces.D), D: rot(this.faces.U),
      F: rot(this.faces.F), B: rot(this.faces.B),
      R: rot(this.faces.L), L: rot(this.faces.R),
    };
  }

  // 黄顶橘前：红前姿态再绕 U-D 轴（原D顶轴）180°
  rotateY2() {
    const n = this.size - 1;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    const rotH = (m) => m.map((row) => row.slice().reverse());
    this.faces = {
      U: rot(this.faces.U), D: rot(this.faces.D),
      F: rotH(this.faces.B), B: rotH(this.faces.F),
      R: this.faces.L, L: this.faces.R,
    };
  }
}
// 公式解析：支持 R L U D F B M E S r l u d f b x y z + ' 2
function parseScrambleNet(str){
    const cleaned = String(str||'').replace(/\s+/g,' ').trim();
    if(!cleaned) return [];
    const tokens = cleaned.split(/\s+/);
    const out = [];
    for(const tok of tokens){
        const m = tok.match(/^([RULDFBMESrludfbxyz])(2)?(')?$/);
        if(!m) continue;
        const base = m[1];
        let dir = 1;
        if(m[2]) dir = 2; else if(m[3]) dir = -1;
        // 展开为基本面转动序列
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
