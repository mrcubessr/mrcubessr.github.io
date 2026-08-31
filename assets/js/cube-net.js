
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
  // 内旋基准：以整体旋转与面转动交换律 M∘f==m(f)∘M 求解验证（D4 全变换枚举唯一解）
  //   新U 读原D面 90°CW、新D 读原U面 90°CCW、F/R/B/L 读对应面 180°
  rotateM() {
    const n = this.size - 1;
    const u = this.faces.U, d = this.faces.D, ff = this.faces.F;
    const b = this.faces.B, r = this.faces.R, l = this.faces.L;
    const rot = (m) => m.map((row, i) => row.map((_, j) => m[n - i][n - j])); // 180°
    const cw  = (m) => m.map((row, i) => row.map((_, j) => m[n - j][i]));     // 90°CW
    const ccw = (m) => m.map((row, i) => row.map((_, j) => m[j][n - i]));     // 90°CCW
    const rotV = (m) => m.map((row, i) => m[n - i]);                          // 垂直翻转 i->n-i
    this.faces = {
      U: cw(d),
      D: ccw(u),
      F: rot(r),
      R: rot(ff),
      B: rotV(l),
      L: rotV(b),
    };
  }

  getFace(face) { return this.faces[face]; }

  // 黄顶蓝前：绕 x 轴（R-L 方向）180°，新U=原D、新F=原B、新R=原R
  // 内旋基准：与标准坐标系对拍（pycuber x2），U/D 面原样承接、F/B/R/L 面 180° 内旋
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

  // 黄顶橘前：红前姿态再绕 U-D 轴（原D顶轴）180°，新U=原D、新F=原L（橙前）、新R=原B
  // 内旋基准：与标准坐标系对拍（pycuber y2），U/D 面 180° 内旋、F/B/R/L 面原样承接
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
            // 基准：E与D同向（WCA）。E CW(=D CW方向)：新F=旧L同序、新R=旧F同序、新B=旧R反序、新L=旧B反序
            // E CCW(=D CCW方向)：新F=旧R同序、新R=旧B反序、新B=旧L反序、新L=旧F同序
            const frow=this.faces.F[m], rrow=this.faces.R[m], brow=this.faces.B[m], lrow=this.faces.L[m];
            const f=frow.slice(), r=rrow.slice(), b=brow.slice(), l=lrow.slice();
            for(let i=0;i<s;i++){
                if(dir===1){ frow[i]=l[i]; rrow[i]=f[i]; brow[i]=r[s-1-i]; lrow[i]=b[s-1-i]; }
                else { frow[i]=r[i]; rrow[i]=b[s-1-i]; brow[i]=l[s-1-i]; lrow[i]=f[i]; }
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
      // 标准R CW: U→F(同), F→D(同), D→B(反), B→U(反);  B 用右列
      // 标准R CCW: U→B(反), B→D(反), D→F(同), F→U(同)
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][n];
        const b = this.faces.F[i][n];
        const c = this.faces.D[i][n];
        const d = this.faces.B[n - i][n];
        if (dir === 1) {
          this.faces.U[i][n] = b;
          this.faces.F[i][n] = c;
          this.faces.D[i][n] = d;
          this.faces.B[n - i][n] = a;
        } else {
          this.faces.U[i][n] = d;
          this.faces.B[n - i][n] = c;
          this.faces.D[i][n] = b;
          this.faces.F[i][n] = a;
        }
      }
    } else if (face === 'L') {
      // 标准L CW: U→F(同), F→D(同), D→B(反), B→U(反);  B 用左列
      // 标准L CCW: U→B(反), B→D(反), D→F(同), F→U(同)
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][0];
        const b = this.faces.F[i][0];
        const c = this.faces.D[i][0];
        const d = this.faces.B[n - i][0];
        if (dir === 1) {
          this.faces.F[i][0] = a;
          this.faces.D[i][0] = b;
          this.faces.B[n - i][0] = c;
          this.faces.U[i][0] = d;
        } else {
          this.faces.U[i][0] = b;
          this.faces.F[i][0] = c;
          this.faces.D[i][0] = d;
          this.faces.B[n - i][0] = a;
        }
      }
    } else if (face === 'U') {
      // 标准U CW: F→R(同), R→B(反), B→L(反), L→F(同)  即 新F=旧R, 新L=旧F, 新B=旧L反, 新R=旧B反
      // 标准U CCW: F→L(同), L→B(反), B→R(反), R→F(同)  即 新F=旧L, 新R=旧F, 新B=旧R反, 新L=旧B反
      const uf = [], ur = [], ub = [], ul = [];
      for (let i = 0; i < s; i++) {
        uf.push(this.faces.F[0][i]); ur.push(this.faces.R[0][i]);
        ub.push(this.faces.B[0][i]); ul.push(this.faces.L[0][i]);
      }
      for (let i = 0; i < s; i++) {
        if (dir === 1) {
          this.faces.F[0][i] = ur[i];
          this.faces.L[0][i] = uf[i];
          this.faces.B[0][i] = ul[n - i];
          this.faces.R[0][i] = ub[n - i];
        } else {
          this.faces.F[0][i] = ul[i];
          this.faces.R[0][i] = uf[i];
          this.faces.B[0][i] = ur[n - i];
          this.faces.L[0][i] = ub[n - i];
        }
      }
    } else if (face === 'D') {
      // 标准D CW: F→R(同), R→B(反), B→L(反), L→F(同)
      // 标准D CCW: F→L(同), L→B(反), B→R(反), R→F(同)
      const df = [], dr = [], db = [], dl = [];
      for (let i = 0; i < s; i++) {
        df.push(this.faces.F[n][i]); dr.push(this.faces.R[n][i]);
        db.push(this.faces.B[n][i]); dl.push(this.faces.L[n][i]);
      }
      for (let i = 0; i < s; i++) {
        if (dir === 1) {
          this.faces.F[n][i] = dl[i];
          this.faces.R[n][i] = df[i];
          this.faces.B[n][i] = dr[n - i];
          this.faces.L[n][i] = db[n - i];
        } else {
          this.faces.F[n][i] = dr[i];
          this.faces.L[n][i] = df[i];
          this.faces.B[n][i] = dl[n - i];
          this.faces.R[n][i] = db[n - i];
        }
      }
    } else if (face === 'F') {
      // 标准F CW: U→R(同), R→D(反), D→L(同), L→U(反)  即 新R=旧U, 新D=旧R反, 新L=旧D, 新U=旧L反
      // 标准F CCW: U→L(反), L→D(同), D→R(反), R→U(同)  即 新U=旧R反, 新L=旧U, 新D=旧L, 新R=旧D反
      const fu = [], fr = [], fd = [], fl = [];
      for (let i = 0; i < s; i++) {
        fu.push(this.faces.U[n][i]); fr.push(this.faces.R[i][0]);
        fd.push(this.faces.D[0][i]); fl.push(this.faces.L[i][n]);
      }
      for (let i = 0; i < s; i++) {
        if (dir === 1) {
          this.faces.R[i][0] = fu[i];
          this.faces.D[0][i] = fr[n - i];
          this.faces.L[i][n] = fd[i];
          this.faces.U[n][i] = fl[n - i];
        } else {
          this.faces.U[n][i] = fr[i];
          this.faces.L[i][n] = fu[n - i];
          this.faces.D[0][i] = fl[i];
          this.faces.R[i][0] = fd[n - i];
        }
      }
    } else if (face === 'B') {
      // 标准B CW: U→R(同), R→D(反), D→L(同), L→U(反)  即 新R=旧U, 新D=旧R反, 新L=旧D, 新U=旧L反
      // 标准B CCW: U→L(反), L→D(同), D→R(反), R→U(同)  即 新U=旧R, 新R=旧D反, 新D=旧L, 新L=旧U反
      const bu = [], bl = [], bd = [], br = [];
      for (let i = 0; i < s; i++) {
        bu.push(this.faces.U[0][i]); bl.push(this.faces.L[i][0]);
        bd.push(this.faces.D[n][i]); br.push(this.faces.R[i][n]);
      }
      for (let i = 0; i < s; i++) {
        if (dir === 1) {
          this.faces.R[i][n] = bu[i];
          this.faces.D[n][i] = br[n - i];
          this.faces.L[i][0] = bd[i];
          this.faces.U[0][i] = bl[n - i];
        } else {
          this.faces.U[0][i] = br[i];
          this.faces.R[i][n] = bd[n - i];
          this.faces.D[n][i] = bl[i];
          this.faces.L[i][0] = bu[n - i];
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
