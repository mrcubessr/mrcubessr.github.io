/** ur-cube.js - UR 训练页公共魔方模拟与展开图绘制
 * 由 tools/practice/index.html 移植：parseFormula / Cube / solveState / drawExpansion / drawFace / FACE_COLORS
 * 用法：<canvas class="ur-cube" data-formula="D L2 B2 ..."></canvas>
 */
const PRIME_CHARS = new Set(["'", "\u2019", "\u2018", "\u201B", "`", "\u02BC", "\u02C8", "\uFF07", "\u00B4", "\u2035", "\u2032"]);
const FACES = { U: 0, D: 1, F: 2, B: 3, R: 4, L: 5 };

// 解析一行公式，返回 move 列表 [{face:0..5, prime:bool, dbl:bool}]
function parseFormula(str) {
  const moves = [];
  const s = String(str);
  let i = 0;
  function parseGroup() {
    // 当前字符必须是 '('，递归解析到匹配 ')'
    const group = [];
    i++; // skip '('
    while (i < s.length && s[i] !== ')') {
      if (s[i] === ' ') { i++; continue; }
      if (s[i] === '(') {
        const sub = parseGroup();
        // 读取重复次数
        let rep = 1;
        if (i < s.length && /\d/.test(s[i])) {
          rep = parseInt(s[i], 10);
          i++;
        }
        for (let k = 0; k < rep; k++) group.push(...sub);
      } else {
        const tok = parseToken();
        if (tok) group.push(tok);
      }
    }
    i++; // skip ')'
    return group;
  }
  function parseToken() {
    const ch = s[i];
    const face = FACES[ch.toUpperCase()];
    if (face === undefined) { i++; return null; }
    i++;
    let prime = false;
    if (i < s.length && PRIME_CHARS.has(s[i])) { prime = true; i++; }
    let dbl = false;
    if (i < s.length && s[i] === '2') { dbl = true; i++; }
    return { face, prime, dbl };
  }
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(') {
      const g = parseGroup();
      // 读取组重复次数
      let rep = 1;
      if (i < s.length && /\d/.test(s[i])) {
        rep = parseInt(s[i], 10);
        i++;
      }
      for (let k = 0; k < rep; k++) moves.push(...g);
    } else {
      const tok = parseToken();
      if (tok) moves.push(tok);
    }
  }
  return moves;
}

// 规范化公式显示文本：压缩多余空格、统一 move 间距，保留原大小写与撇号变体
function normalizeFormulaText(str) {
  const s = String(str).trim();
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(' || ch === ')') { toks.push(ch); i++; continue; }
    if (/\d/.test(ch)) {
      let num = ch; i++;
      while (i < s.length && /\d/.test(s[i])) { num += s[i]; i++; }
      // 序号点：数字紧跟 "." 时保留（如 "1. R U" 的序号与点）
      if (i < s.length && s[i] === '.') { num += s[i]; i++; }
      // 数字紧跟完整 move 时作为其指数后缀（R 2 -> R2）；否则独立（序号/组重复次数）
      const last = toks[toks.length - 1];
      if (last && last !== '(' && last !== ')' && /[a-zA-Z]$/.test(last)) {
        toks[toks.length - 1] = last + num;
      } else {
        toks.push(num);
      }
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let t = ch; i++;
      // 宽层 w/W 与字母一体，如 Rw/Lw 不可拆分
      if (i < s.length && (s[i] === 'w' || s[i] === 'W')) { t += s[i]; i++; }
      if (i < s.length && PRIME_CHARS.has(s[i])) { t += s[i]; i++; }
      if (i < s.length && s[i] === '2') { t += s[i]; i++; }
      toks.push(t);
      continue;
    }
    if (PRIME_CHARS.has(ch)) {
      // 单独出现的撇号：粘贴常把 "R '" 拆开，若前一个是完整 move 则合并回去
      const last = toks[toks.length - 1];
      if (last && last !== '(' && last !== ')' && /[a-zA-Z]$/.test(last)) {
        toks[toks.length - 1] = last + ch;
      }
      i++;
      continue;
    }
    i++; // 未知字符跳过
  }
  let out = '';
  for (const t of toks) {
    if (t === '(') { out += '('; }
    else if (t === ')') { out += ')'; }
    else if (/^\d+$/.test(t)) { out += t; }       // 组重复次数紧贴右括号（纯数字）
    else if (/^\d+\.$/.test(t)) { out += t + ' '; } // 行首序号前缀带空格（如 "2. "）
    else {
      if (out && !out.endsWith('(') && !out.endsWith(' ')) out += ' ';
      out += t;
    }
  }
  return out;
}

// ========== 魔方模拟（移植自 cube_scramble_viewer 的 Cube 类） ==========
class Cube {
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
    const u = this.faces.U, d = this.faces.D, ff = this.faces.F;
    const b = this.faces.B, r = this.faces.R, l = this.faces.L;
    this.faces = {
      U: d.map((row, i) => row.map((_, j) => d[n - j][n - i])),
      D: u.map((row, i) => row.map((_, j) => u[n - j][n - i])),
      F: r.map((row, i) => row.map((_, j) => r[n - i][n - j])),
      R: ff.map((row, i) => row.map((_, j) => ff[n - i][j])),
      B: l.map((row, i) => row.map((_, j) => l[n - i][n - j])),
      L: b.map((row, i) => row.map((_, j) => b[n - i][n - j])),
    };
  }

  getFace(face) { return this.faces[face]; }

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

  _moveEdges(face, dir) {
    const s = this.size;
    const n = s - 1;

    if (face === 'R') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][n];
        const b = this.faces.F[i][n];
        const c = this.faces.D[i][n];
        const d = this.faces.B[s - 1 - i][0];
        if (dir === 1) { // CW: U→F→D→B→U
          this.faces.U[i][n] = d;
          this.faces.F[i][n] = a;
          this.faces.D[i][n] = b;
          this.faces.B[s - 1 - i][0] = c;
        } else { // CCW
          this.faces.U[i][n] = b;
          this.faces.F[i][n] = c;
          this.faces.D[i][n] = d;
          this.faces.B[s - 1 - i][0] = a;
        }
      }
    } else if (face === 'L') {
      for (let i = 0; i < s; i++) {
        const a = this.faces.U[i][0];
        const b = this.faces.B[s - 1 - i][n];
        const c = this.faces.D[i][0];
        const d = this.faces.F[i][0];
        if (dir === 1) { // CW: U→B→D→F→U
          this.faces.U[i][0] = d;
          this.faces.B[s - 1 - i][n] = a;
          this.faces.D[i][0] = b;
          this.faces.F[i][0] = c;
        } else {
          this.faces.U[i][0] = b;
          this.faces.B[s - 1 - i][n] = c;
          this.faces.D[i][0] = d;
          this.faces.F[i][0] = a;
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

// 展开图配色：与 cube_scramble_viewer standard 方案一致
const FACE_COLORS = { U: '#F9F9F9', D: '#F2F215', F: '#58D568', B: '#1C5FFE', R: '#ED3030', L: '#FFAF1C' };

function solveState(formulaStr, size, orientation) {
  const moves = parseFormula(formulaStr);
  const cube = new Cube(size || 2); // 始终按白顶绿前坐标系构造与执行
  const FACE_NAMES = ['U', 'D', 'F', 'B', 'R', 'L'];
  if (orientation === 'yellow-red') {
    // 黄顶红前 = 原D顶、原R前：公式 move X 映射为白顶绿前 move map[X] 后执行，最后整体旋转坐标系渲染
    const MOVE_MAP = { U: 'D', D: 'U', F: 'R', B: 'L', R: 'F', L: 'B' };
    for (const mv of moves) {
      cube.applyMove({ face: MOVE_MAP[FACE_NAMES[mv.face]], dir: mv.dbl ? 2 : (mv.prime ? -1 : 1) });
    }
    cube.rotateM();
  } else {
    for (const mv of moves) {
      cube.applyMove({ face: FACE_NAMES[mv.face], dir: mv.dbl ? 2 : (mv.prime ? -1 : 1) });
    }
  }
  return cube;
}

// ========== 渲染 ==========
const A4_W = 1240, A4_H = 1754; // 150dpi

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 展开图：十字布局（U 上，L F R B 中排，D 下），参考 cube_scramble_viewer 的 drawCube/drawFace 风格
// 贴纸 2x2（二阶）/ 3x3（三阶）、贴纸间 2px 间隙、圆角 radius=3；深色面底板；白色贴纸 0.5px #ccc 描边；无面字母标签
function drawExpansion(ctx, cube, cx, cy, size) {
  const s = size || 2;
  const stickerSize = s === 3 ? 28 : 43;  // 二阶贴纸 43（较原 48 缩小 10%）；三阶 28 以适配行高
  const gap = 8;                          // 面间距
  const faceSize = stickerSize * s;
  const h = faceSize / 2;

  // 以 F 面中心 (cx, cy) 为锚点，计算各面左上角（标准十字）
  const fx = cx - h, fy = cy - h;
  const facePositions = {
    U: { x: fx, y: fy - faceSize - gap },                      // 上
    L: { x: fx - faceSize - gap, y: fy },                      // 左
    F: { x: fx, y: fy },                                       // 中
    R: { x: fx + faceSize + gap, y: fy },                      // 右
    B: { x: fx + 2 * (faceSize + gap), y: fy },                // 最右
    D: { x: fx, y: fy + faceSize + gap },                      // 下
  };

  for (const face of Object.keys(facePositions)) {
    drawFace(ctx, face, cube, facePositions[face].x, facePositions[face].y, stickerSize, s);
  }
}

function drawFace(ctx, face, cube, ox, oy, stickerSize, size) {
  const s = size || 2;
  const faceData = cube.faces[face];
  const faceSize = stickerSize * s;

  // 面底板：深色，比面大 1px 形成深色边框
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(ox - 1, oy - 1, faceSize + 2, faceSize + 2);

  // 2x2 贴纸：贴纸间 2px 间隙（1px 偏移 + 尺寸减 2）
  for (let r = 0; r < s; r++) {
    for (let c = 0; c < s; c++) {
      const colorKey = faceData[r][c];
      const stickerColor = FACE_COLORS[colorKey] || '#ddd';
      const x = ox + c * stickerSize + 1;
      const y = oy + r * stickerSize + 1;
      const ss = stickerSize - 2;
      const radius = 3;

      // 圆角矩形贴纸
      ctx.fillStyle = stickerColor;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + ss - radius, y);
      ctx.quadraticCurveTo(x + ss, y, x + ss, y + radius);
      ctx.lineTo(x + ss, y + ss - radius);
      ctx.quadraticCurveTo(x + ss, y + ss, x + ss - radius, y + ss);
      ctx.lineTo(x + radius, y + ss);
      ctx.quadraticCurveTo(x, y + ss, x, y + ss - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // 白色贴纸加描边便于区分
      if (stickerColor === '#FFFFFF' || stickerColor === '#fff') {
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
}

/* ========== UR 页动态展开图（三阶，白顶绿前，自适应容器宽度） ========== */
function drawURCube(canvas, formulaStr) {
  var state = solveState(formulaStr, 3, 'white-green');
  var dpr = window.devicePixelRatio || 1;
  var cssW = canvas.clientWidth || 240;
  var faceSize = 28 * 3;
  var gap = 8;
  // 展开图实际范围：横向 L/F/R/B 四面 + 3 间隙 = 360；纵向 U/F/D 三面 + 2 间隙 = 268
  var totalW = 4 * faceSize + 3 * gap;
  var totalH = 3 * faceSize + 2 * gap;
  var offsetX = (totalW - totalH) / 2;   // 横向多出的部分左右均分，保证内容居中
  var ctx = canvas.getContext('2d');
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssW * totalH / totalW * dpr));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr, dpr);
  ctx.scale(cssW / totalW, cssW / totalW);
  drawExpansion(ctx, state, totalW / 2 - offsetX, totalH / 2, 3);
}

function initURCubes(root) {
  var scope = root || document;
  var cvs = scope.querySelectorAll ? scope.querySelectorAll('.ur-cube') : [];
  Array.prototype.forEach.call(cvs, function (cv) {
    var f = cv.getAttribute('data-formula');
    if (f) { try { drawURCube(cv, f); } catch (e) {} }
  });
}

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initURCubes(); });
  } else {
    initURCubes();
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { initURCubes(); }, 120);
  });
})();
