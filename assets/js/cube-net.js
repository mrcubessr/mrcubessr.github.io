
// ===== 统一基准模块 v2 =====
// practice 页已验证 Cube 类（标准 WCA U/D 方向）+ net 中层/宽转/整体转 + 修正版 parseScrambleNet
const NET_COLORS = { U:'#FFFFFF', D:'#FFD500', F:'#009E60', B:'#0051BA', R:'#C41E3A', L:'#FF5800' };

﻿class Cube {
  constructor(size, orientation) {
    this.size = size;
    this.faces = {};
    // 拿法说明：white-green=白顶绿前（标准 WCA）；yellow-red=黄顶红前
    // 黄顶红前不在此处做整体旋转初始化（会导致 _moveEdges 邻接边索引错位）。
    // 正确实现：solveState 中按白顶绿前坐标系执行映射公式，最后统一 rotateM 渲染。
    for (const face of ['U', 'D', 'F', 'B', 'R', 'L']) {
      this.faces[face] = [];
      for (let r = 0; r < size; r++) {
        this.faces[face][r] = [];
        for (let c = 0; c < size; c++) {
          this.faces[face][r][c] = face;
        }
      }
    }
  }

  // 整体旋转坐标系 M:(x,y,z)->(z,-y,x)：黄顶红前 = 原D顶、原R前
  // 新U=原D、新D=原U、新F=原R、新R=原F、新B=原L、新L=原B
  rotateM() {
    const n = this.size - 1;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    const u = this.faces.U, d = this.faces.D, ff = this.faces.F;
    const b = this.faces.B, r = this.faces.R, l = this.faces.L;
    this.faces = {
      U: rot(d), D: rot(u), F: rot(r), R: rot(ff), B: rot(l), L: rot(b),
    };
  }

  getFace(face) { return this.faces[face]; }

  // 黄顶蓝前：绕 x 轴（R-L 方向）180°，新U=原D、新F=原B、新R=原R
  rotateX180() {
    const n = this.size - 1;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j]));
    this.faces = {
      U: rot(this.faces.D), D: rot(this.faces.U),
      F: rot(this.faces.B), B: rot(this.faces.F),
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

  rotateFaceCW(face) {
    const s = this.size;
    const m = this.faces[face];
    const n = [];
    for (let r = 0; r < s; r++) {
      n[r] = [];
      for (let c = 0; c < s; c++) {
        n[r][c] = m[s - 1 - c][r];
      }
    }
    this.faces[face] = n;
  }

  rotateFaceCCW(face) {
    const s = this.size;
    const m = this.faces[face];
    const n = [];
    for (let r = 0; r < s; r++) {
      n[r] = [];
      for (let c = 0; c < s; c++) {
        n[r][c] = m[c][s - 1 - r];
      }
    }
    this.faces[face] = n;
  }

  applyMove(move) {
    const face = move.face;
    const dir = move.dir; // 1 = CW, -1 = CCW, 2 = double

    if (face === 'M' || face === 'E' || face === 'S') {
      this._moveMiddle(face, dir);
      return;
    }

    const doCW = () => {
      this.rotateFaceCW(face);
      this._moveEdges(face, 1);
    };
    const doCCW = () => {
      this.rotateFaceCCW(face);
      this._moveEdges(face, -1);
    };

    if (dir === 2) {
      doCW(); doCW();
    } else if (dir === 1) {
      doCW();
    } else {
      doCCW();
    }
  }


    // 中层转动（标准方向：M与L同向、E与D同向、S与F同向；dir: 1=CW, -1=CCW, 2=double）
    _moveMiddle(axis, dir){
        if(dir===2 || dir===-2){
            const d = dir>0 ? 1 : -1;
            this._moveMiddle(axis, d);
            this._moveMiddle(axis, d);
            return;
        }
        const s=this.size, n=s-1, m=Math.floor(s/2);
        if(axis==='M'){
            // 基准（由面环+WCA分解推导）：M沿R'方向，环 U→F→D→B→U。
            // M CW(=L CW)：U→F同序、F→D同序、D→B翻转、B→U翻转
            // M'(逆环)：U→B翻转、B→D翻转、D→F同序、F→U同序
            for(let i=0;i<s;i++){
                const a=this.faces.U[i][m], b=this.faces.F[i][m], c=this.faces.D[i][m], d=this.faces.B[s-1-i][m];
                if(dir===1){ this.faces.U[i][m]=d; this.faces.F[i][m]=a; this.faces.D[i][m]=b; this.faces.B[s-1-i][m]=c; }
                else { this.faces.B[s-1-i][m]=a; this.faces.D[i][m]=d; this.faces.F[i][m]=c; this.faces.U[i][m]=b; }
            }
        } else if(axis==='E'){
            // 基准：E沿U'方向。E CW(=U CCW)环 F→R→B→L→F，全同序；E'(=U CW)环 F→L→B→R→F，全同序
            for(let i=0;i<s;i++){
                const a=this.faces.F[m][i], b=this.faces.R[m][i], c=this.faces.B[m][i], d=this.faces.L[m][i];
                if(dir===1){ this.faces.F[m][i]=d; this.faces.R[m][i]=a; this.faces.B[m][i]=b; this.faces.L[m][i]=c; }
                else { this.faces.F[m][i]=b; this.faces.R[m][i]=c; this.faces.B[m][i]=d; this.faces.L[m][i]=a; }
            }
        } else if(axis==='S'){
            // 基准：S沿F方向。S CW(=F CW)环 U→R同序、R→D翻转、D→L同序、L→U翻转；S'(=F CCW)环 U→L翻转、L→D同序、D→R翻转、R→U同序
            const u=[], r=[], d=[], l=[];
            for(let i=0;i<s;i++){ u.push(this.faces.U[m][i]); r.push(this.faces.R[i][m]); d.push(this.faces.D[m][i]); l.push(this.faces.L[i][m]); }
            if(dir===1){ for(let i=0;i<s;i++){ this.faces.R[i][m]=u[i]; this.faces.D[m][s-1-i]=r[i]; this.faces.L[i][m]=d[i]; this.faces.U[m][s-1-i]=l[i]; } }
            else { for(let i=0;i<s;i++){ this.faces.L[i][m]=u[s-1-i]; this.faces.D[m][i]=l[i]; this.faces.R[i][m]=d[s-1-i]; this.faces.U[m][i]=r[i]; } }
        }
    }

    applyAlg(alg){
        for(const mv of parseScrambleNet(alg)){
            if(mv.mid) this._moveMiddle(mv.mid, mv.dir);
            else this.applyMove(mv);
        }
    }
  _moveEdges(face, dir) {
    const s = this.size;
    const n = s - 1;

    if (face === 'R') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][n];
        const b = this.faces.F[i][n];
        const c = this.faces.D[i][n];
        const d = this.faces.B[s - 1 - i][0];
        if (dir === 1) { // CW: U→B→D→F→U
          this.faces.U[i][n] = b;
          this.faces.F[i][n] = c;
          this.faces.D[i][n] = d;
          this.faces.B[s - 1 - i][0] = a;
        } else { // CCW: U→F→D→B→U
          this.faces.U[i][n] = d;
          this.faces.F[i][n] = a;
          this.faces.D[i][n] = b;
          this.faces.B[s - 1 - i][0] = c;
        }
      }
    } else if (face === 'L') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][0];
        const b = this.faces.B[s - 1 - i][n];
        const c = this.faces.D[i][0];
        const d = this.faces.F[i][0];
        if (dir === 1) { // CW: U→F→D→B→U
          this.faces.U[i][0] = b;
          this.faces.F[i][0] = a;
          this.faces.D[i][0] = d;
          this.faces.B[s - 1 - i][n] = c;
        } else { // CCW: U→B→D→F→U
          this.faces.U[i][0] = d;
          this.faces.B[s - 1 - i][n] = a;
          this.faces.D[i][0] = b;
          this.faces.F[i][0] = c;
        }
      }
    } else if (face === 'U') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.F[0][i];
        const b = this.faces.R[0][i];
        const c = this.faces.B[0][i];
        const d = this.faces.L[0][i];
        if (dir === 1) { // CW: F→L→B→R→F
          this.faces.F[0][i] = b;
          this.faces.L[0][i] = a;
          this.faces.B[0][i] = d;
          this.faces.R[0][i] = c;
        } else { // CCW: F→R→B→L→F
          this.faces.F[0][i] = d;
          this.faces.R[0][i] = a;
          this.faces.B[0][i] = b;
          this.faces.L[0][i] = c;
        }
      }
    } else if (face === 'D') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.F[n][i];
        const b = this.faces.L[n][i];
        const c = this.faces.B[n][i];
        const d = this.faces.R[n][i];
        if (dir === 1) { // CW: F→R→B→L→F
          this.faces.F[n][i] = b;
          this.faces.R[n][i] = a;
          this.faces.B[n][i] = d;
          this.faces.L[n][i] = c;
        } else { // CCW: F→L→B→R→F
          this.faces.F[n][i] = d;
          this.faces.L[n][i] = a;
          this.faces.B[n][i] = b;
          this.faces.R[n][i] = c;
        }
      }
    } else if (face === 'F') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[n][i];
        const b = this.faces.R[i][0];
        const c = this.faces.D[0][s - 1 - i];
        const d = this.faces.L[s - 1 - i][n];
        if (dir === 1) { // CW: U→R→D→L→U
          this.faces.U[n][i] = d;
          this.faces.R[i][0] = a;
          this.faces.D[0][s - 1 - i] = b;
          this.faces.L[s - 1 - i][n] = c;
        } else {
          this.faces.U[n][i] = b;
          this.faces.R[i][0] = c;
          this.faces.D[0][s - 1 - i] = d;
          this.faces.L[s - 1 - i][n] = a;
        }
      }
    } else if (face === 'B') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[0][s - 1 - i];
        const b = this.faces.L[i][0];
        const c = this.faces.D[n][i];
        const d = this.faces.R[s - 1 - i][n];
        if (dir === 1) { // CW: U→L→D→R→U
          this.faces.U[0][s - 1 - i] = d;
          this.faces.L[i][0] = a;
          this.faces.D[n][i] = b;
          this.faces.R[s - 1 - i][n] = c;
        } else {
          this.faces.U[0][s - 1 - i] = b;
          this.faces.L[i][0] = c;
          this.faces.D[n][i] = d;
          this.faces.R[s - 1 - i][n] = a;
        }
      }
    }
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
// orientation: 'white-green'（默认）| 'yellow-red' | 'yellow-blue'
// 映射表含义：黄顶红前/黄顶蓝前坐标下的字母 -> 等价的标准白顶绿前坐标字母（物理等价）
// yellow-red  = 整体旋转 M (x,y,z)->(z,-y,x)：新U=原D 新F=原R 新R=原F 新B=原L 新L=原B
//   x轴->新z轴、y轴->新-x轴、z轴->新-y轴；M<->S、E 反向；x<->z、y/y'、z<->x
// yellow-blue = 绕 x 轴 180°：新U=原D 新F=原B 新R=原R；M 保持、E/S 反向、y/z 反向
var ORIENT_MAP = {
  'yellow-red': {
    map: { R:'F', L:'B', U:'D', D:'U', F:'R', B:'L',
           M:'S', S:'M', E:'E',
           x:'z', y:'y', z:'x',
           r:'f', f:'r', u:'d', d:'u', l:'b', b:'l' },
    rev: { E:1, y:1, u:1, d:1, l:1, b:1 }
  },
  'yellow-blue': {
    map: { R:'R', L:'L', U:'D', D:'U', F:'B', B:'F',
           M:'M', E:'E', S:'S',
           x:'x', y:'y', z:'z',
           r:'r', l:'l', u:'d', d:'u', f:'b', b:'f' },
    rev: { E:1, S:1, y:1, z:1, u:1, d:1 }
  },
  'yellow-green': {
    map: { R:'L', L:'R', U:'D', D:'U', F:'F', B:'B',
           M:'M', E:'E', S:'S',
           x:'x', y:'y', z:'z',
           r:'l', l:'r', u:'d', d:'u', f:'f', b:'b' },
    rev: { M:1, E:1, x:1, y:1, u:1, d:1 }
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
// orientation: 'white-green' | 'yellow-red' | 'yellow-blue'，决定整体旋转渲染
function drawScrambleNet(alg, canvasId, orientation) {
    const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : (canvasId || document.getElementById("player"));
    if(!canvas) return;
    const cube = new Cube(3);
    cube.applyAlg(alg);
    if (orientation === 'yellow-red') cube.rotateM();
    else if (orientation === 'yellow-blue') cube.rotateX180();
    else if (orientation === 'yellow-green') cube.rotateZ180();
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
