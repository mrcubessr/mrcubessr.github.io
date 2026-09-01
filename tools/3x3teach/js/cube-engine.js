/*
 * cube-engine.js — 三阶魔方 3D 渲染与动画引擎 (基于 Three.js r128)
 * 依赖：THREE (全局)、CubeModel (全局)
 * 设计要点：
 *   - cubeGroup 永远保持单位变换；所有"转层/整体转体"都通过模型在魔方局部坐标系内完成，
 *     视觉上通过绕局部轴旋转 pivot 实现动画，结束后按模型状态重排每个 cubie 的位置与贴纸颜色。
 *   - 摄像机固定为"学生第一视角"（黄顶 / 蓝前 / 红右），握持(X/Y/Z)只是整体转体，
 *     会改变魔方相对相机的外观（如"黄面朝前"= X+）。
 */
(function (global) {
  'use strict';
  const CM = global.CubeModel;

  const FACE_ORDER = ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1'];
  const DARK = 0x111418;
  const INNER = 0x1b1f24;
  const GRAY = 0x9aa0a6;   // 高亮模式下非重点块的灰色

  // 绕世界轴 axis（'x'|'y'|'z'）旋转弧度 ang，作用于连续坐标向量 [x,y,z]。
  // 与 cube-model 的 ROT 族符号一致：如 ang=+PI/2 绕 x 轴 => (x,-z,y)。
  function rotVec(v, axis, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    if (axis === 'x') return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
    if (axis === 'y') return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; // z
  }
  function faceLetter(axis, layer) {
    if (axis === 'x') return layer === 1 ? 'R' : (layer === -1 ? 'L' : 'M');
    if (axis === 'y') return layer === 1 ? 'U' : (layer === -1 ? 'D' : 'E');
    return layer === 1 ? 'F' : (layer === -1 ? 'B' : 'S');
  }
  function inverseTok(tok) { return tok.endsWith("'") ? tok.slice(0, -1) : tok + "'"; }

  function CubeEngine(container, opts) {
    opts = opts || {};
    this.container = container;
    this.spacing = 1.0;
    this.cubieSize = 0.94;
    this.state = CM.solvedState();
    this.cubieMeshes = [];
    this.pivot = null;
    this.anim = null;          // 当前动画
    this.queue = [];           // 待播放序列
    this.onStep = null;
    this.onDone = null;
    this.raycaster = null;     // 自由拖拽拾取用
    this.onTwist = null;       // 拖拽转动某一层后回调(token, steps)
    this.highlight = null;     // 高亮谓词：fn(cubie)->true 表示该块保留本色，否则置灰
    this.defaultCam = { theta: Math.PI * 0.25, phi: Math.PI * 0.30, radius: 7.2 };
    this.cam = Object.assign({}, this.defaultCam);
    this._initThree();
    this._buildCube();
    this._bindEvents();
    this._loop();
  }

  CubeEngine.prototype._initThree = function () {
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 600;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(5, 8, 6);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-6, -3, -5);
    this.scene.add(dir2);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
    this.pivot = new THREE.Group();
    this.cubeGroup.add(this.pivot);

    this._updateCamera();
  };

  CubeEngine.prototype._buildCube = function () {
    const size = this.cubieSize;
    const geo = new THREE.BoxGeometry(size, size, size);
    // 圆角感：用稍微缩放的子方块做边框不可行，直接用 6 材质
    for (let i = 0; i < this.state.length; i++) {
      const mats = FACE_ORDER.map(function () {
        return new THREE.MeshLambertMaterial({ color: DARK });
      });
      const mesh = new THREE.Mesh(geo, mats);
      mesh.userData.idx = i;
      this.cubeGroup.add(mesh);
      this.cubieMeshes.push(mesh);
    }
    this.syncAll();
  };

  // 根据模型状态刷新所有 cubie 的位置与颜色
  CubeEngine.prototype.syncAll = function () {
    for (let i = 0; i < this.state.length; i++) {
      this._syncMesh(i);
    }
  };

  CubeEngine.prototype._syncMesh = function (i) {
    const c = this.state[i];
    const mesh = this.cubieMeshes[i];
    mesh.position.set(c.p[0] * this.spacing, c.p[1] * this.spacing, c.p[2] * this.spacing);
    mesh.quaternion.identity();
    const hl = this.highlight;
    const h = hl ? hl(c) : true;   // 无高亮 => 整块真色
    const colorByNormal = {};
    for (const k of c.s) {
      const trueCol = CM.COLOR[k.c] || DARK;
      let real;
      if (h === true) real = true;
      else if (h === false) real = false;
      else if (typeof h === 'object' && h.keep) real = h.keep.indexOf(k.c) >= 0; // 仅保留指定颜色的贴纸
      else real = !!h;
      colorByNormal[k.n.join(',')] = real ? trueCol : GRAY;
    }
    const mats = mesh.material;
    for (let f = 0; f < FACE_ORDER.length; f++) {
      const col = colorByNormal[FACE_ORDER[f]];
      mats[f].color.set(col || INNER);
    }
  };

  // 设置/清除高亮谓词（传入 null 即清除）
  CubeEngine.prototype.setHighlight = function (fn) {
    this.highlight = (typeof fn === 'function') ? fn : null;
    this.syncAll();
  };
  CubeEngine.prototype.clearHighlight = function () {
    this.highlight = null;
    this.syncAll();
  };

  // 计算某移动记号对应的视觉旋转角度（弧度）与轴
  CubeEngine.prototype._moveAngle = function (tok) {
    const m = (typeof tok === 'string') ? CM.parseToken(tok) : tok;
    const rotName = m.axis + (m.prime ? '+' : '-');
    const sign = rotName.endsWith('-') ? -1 : 1;
    let ang = sign * Math.PI / 2;
    if (m.double) ang *= 2;
    return { axis: m.axis, angle: ang, layer: m.layer, whole: m.whole };
  };

  // 立即（无动画）应用一个移动并刷新
  CubeEngine.prototype.applyMove = function (tok) {
    CM.applyMove(this.state, tok);
    this.syncAll();
  };

  CubeEngine.prototype.applySeq = function (seq) {
    CM.applySeq(this.state, seq);
    this.syncAll();
  };

  // 设置状态（从外部状态数组）
  CubeEngine.prototype.setState = function (state) {
    this.state = state;
    this.syncAll();
  };

  CubeEngine.prototype.getState = function () { return this.state; };
  CubeEngine.prototype.isSolved = function () { return CM.isSolved(this.state); };
  CubeEngine.prototype.reset = function () { this.state = CM.solvedState(); this.syncAll(); };
  CubeEngine.prototype.scramble = function (n) {
    const seq = CM.scramble(n);
    this.applySeq(seq);
    return seq;
  };

  // 动画播放单个移动
  CubeEngine.prototype.playMove = function (tok, duration, onComplete) {
    if (this.anim) { // 先收尾当前动画
      this._finishAnim();
    }
    const info = this._moveAngle(tok);
    const ai = CM.AXIS_INDEX[info.axis];
    const affected = [];
    for (let i = 0; i < this.state.length; i++) {
      if (info.whole || info.layer === 0 || this.state[i].p[ai] === info.layer) affected.push(i);
    }
    // 先把受影响的 mesh 挂到 pivot（保留世界变换）
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);
    for (const i of affected) this.pivot.attach(this.cubieMeshes[i]);

    // 更新模型逻辑（在动画前完成，结束后按新状态重排）
    CM.applyMove(this.state, tok);

    const self = this;
    this.anim = {
      axis: info.axis,
      from: 0,
      to: info.angle,
      start: performance.now(),
      duration: duration || 320,
      affected: affected,
      onComplete: onComplete,
    };
  };

  CubeEngine.prototype._finishAnim = function () {
    if (!this.anim) return;
    const a = this.anim;
    const cb = a.onComplete;
    this.anim = null;
    if (cb) cb();   // 先更新模型（自由拖拽提交时在此施加转动）
    // 受影响的 mesh 归还 cubeGroup 并按（已更新的）模型状态重排
    this.pivot.rotation[a.axis] = a.to;
    this.pivot.updateMatrixWorld(true);
    for (const i of a.affected) {
      this.cubeGroup.attach(this.cubieMeshes[i]);
      this._syncMesh(i);
    }
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);
  };

  // 顺序播放一串移动
  CubeEngine.prototype.playSeq = function (seq, opts) {
    opts = opts || {};
    const tokens = (typeof seq === 'string') ? CM.parseSeq(seq) : seq;
    const dur = opts.duration || 320;
    this._gap = (typeof opts.gap === 'number') ? opts.gap : 60;
    const self = this;
    this.queue = tokens.slice();
    this.onStep = opts.onStep || null;
    this.onDone = opts.onDone || null;
    this._nextInQueue(dur);
  };

  CubeEngine.prototype._nextInQueue = function (dur) {
    const self = this;
    if (this.queue.length === 0) {
      const done = this.onDone;
      this.onDone = null; this.onStep = null;
      this._gap = 60;
      if (done) done();
      return;
    }
    const tok = this.queue.shift();
    this.playMove(tok, dur, function () {
      if (self.onStep) self.onStep(tok);
      // 短暂间隔后播放下一个
      setTimeout(function () { self._nextInQueue(dur); }, self._gap);
    });
  };

  // ---- 相机控制 ----
  CubeEngine.prototype._updateCamera = function () {
    const r = this.cam.radius;
    const t = this.cam.theta, p = this.cam.phi;
    const x = r * Math.sin(p) * Math.sin(t);
    const y = r * Math.cos(p);
    const z = r * Math.sin(p) * Math.cos(t);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  };

  CubeEngine.prototype.resetView = function () {
    this.cam = Object.assign({}, this.defaultCam);
    this._updateCamera();
  };

  CubeEngine.prototype.rotateView = function (dx, dy) {
    this.cam.theta -= dx * 0.008;
    this.cam.phi -= dy * 0.008;
    const eps = 0.12;
    this.cam.phi = Math.max(eps, Math.min(Math.PI - eps, this.cam.phi));
    this._updateCamera();
  };

  CubeEngine.prototype.zoom = function (delta) {
    this.cam.radius *= (1 + delta * 0.0012);
    this.cam.radius = Math.max(4.2, Math.min(14, this.cam.radius));
    this._updateCamera();
  };

  // ---- 交互事件：空白拖拽环视视角 + 抓面拖拽转动该层 ----
  CubeEngine.prototype._bindEvents = function () {
    const self = this;
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    el.style.display = 'block';
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';

    let mode = null;            // 'orbit' | 'pending' | 'twist' | null
    let sx = 0, sy = 0;         // 指针起点（clientX/Y）
    let twist = null;           // 当前扭层状态
    let hitInfo = null;         // 指针按下时拾取到的贴纸信息

    function onDown(e) {
      if (self.anim) self._finishAnim();   // 提交进行中的动画/拖拽
      mode = null; sx = e.clientX; sy = e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const hit = self._pick(e);
      if (hit) { mode = 'pending'; hitInfo = hit; }
      else { mode = 'orbit'; el.style.cursor = 'grabbing'; }
    }
    function onMove(e) {
      if (mode === 'orbit') {
        self.rotateView(e.clientX - sx, e.clientY - sy);
        sx = e.clientX; sy = e.clientY;
        return;
      }
      if (mode === 'pending') {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.hypot(dx, dy) < 8) return;        // 阈值，避免误触
        twist = self._decideTwist(hitInfo, dx, dy);
        if (!twist) { mode = 'orbit'; el.style.cursor = 'grabbing'; return; }
        mode = 'twist'; el.style.cursor = 'grabbing';
        self._beginTwist(twist);
      }
      if (mode === 'twist' && twist) {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        const proj = dx * twist.sdx + dy * twist.sdy;   // 沿所选转动屏幕方向的投影
        const frac = Math.max(-2, Math.min(2, proj / twist.maxProj));
        twist.frac = frac;
        self.pivot.rotation.set(0, 0, 0);
        self.pivot.rotation[twist.axis] = frac * twist.fullAngle;
      }
    }
    function onUp(e) {
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      el.style.cursor = 'grab';
      if (mode === 'twist' && twist) {
        const snap = Math.round(twist.frac);
        self._snapTwist(twist, snap);
      }
      mode = null; twist = null; hitInfo = null;
    }

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoom(e.deltaY);
    }, { passive: false });
    window.addEventListener('resize', function () { self._resize(); });
  };

  // 屏幕坐标 -> 世界拾取，返回 {point, normal(世界单位向量), idx, p(网格位置)}
  CubeEngine.prototype._pick = function (e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const hits = this.raycaster.intersectObjects(this.cubieMeshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    const m = new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld);
    const n = h.face.normal.clone().applyMatrix3(m).normalize();
    const idx = h.object.userData.idx;
    return { point: h.point.clone(), normal: n, idx: idx, p: this.state[idx].p.slice() };
  };

  // 世界坐标点 -> 屏幕像素 [x,y]（y 向下，与指针事件一致）
  CubeEngine.prototype._toScreen = function (v) {
    const p = new THREE.Vector3(v[0], v[1], v[2]).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return [rect.left + (p.x * 0.5 + 0.5) * rect.width, rect.top + (-p.y * 0.5 + 0.5) * rect.height];
  };

  // 根据点击的贴纸与拖拽方向，选出最匹配的转动（候选：与该面垂直的两轴 × 两个方向）
  CubeEngine.prototype._decideTwist = function (hit, dx, dy) {
    const perp = ['x', 'y', 'z'].filter(function (a) { return Math.abs(hit.normal[a]) < 0.5; });
    const ai2 = CM.AXIS_INDEX;
    let best = null, bestScore = 0;
    for (let i = 0; i < perp.length; i++) {
      const ax = perp[i];
      const layer = hit.p[ai2[ax]];
      for (let d = 0; d < 2; d++) {
        const tok = faceLetter(ax, layer) + (d === 1 ? "'" : '');
        const info = this._moveAngle(tok);
        const p2 = rotVec([hit.point.x, hit.point.y, hit.point.z], info.axis, info.angle);
        const s0 = this._toScreen([hit.point.x, hit.point.y, hit.point.z]);
        const s1 = this._toScreen(p2);
        const disp = [s1[0] - s0[0], s1[1] - s0[1]];
        const score = dx * disp[0] + dy * disp[1];
        if (score > bestScore) {
          bestScore = score;
          const len = Math.hypot(disp[0], disp[1]) || 1;
          best = {
            axis: info.axis, fullAngle: info.angle, tok: tok,
            sdx: disp[0] / len, sdy: disp[1] / len, maxProj: len, frac: 0,
            affected: this._layerCubies(info.axis, layer),
          };
        }
      }
    }
    if (!best || bestScore <= 0) return null;
    return best;
  };

  CubeEngine.prototype._layerCubies = function (axis, layerVal) {
    const ai = CM.AXIS_INDEX[axis];
    const out = [];
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i].p[ai] === layerVal) out.push(i);
    }
    return out;
  };

  CubeEngine.prototype._beginTwist = function (twist) {
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);
    for (let k = 0; k < twist.affected.length; k++) this.pivot.attach(this.cubieMeshes[twist.affected[k]]);
  };

  // 松手时把当前部分角度吸附到最近的 90° 整数倍并提交到模型
  CubeEngine.prototype._snapTwist = function (twist, snap) {
    const fromA = twist.frac * twist.fullAngle;
    const toA = snap * twist.fullAngle;
    const self = this;
    if (snap === 0) {
      this.anim = { axis: twist.axis, from: fromA, to: 0, start: performance.now(), duration: 140, affected: twist.affected, onComplete: null };
      return;
    }
    const steps = Math.abs(snap);
    const applied = snap > 0 ? twist.tok : inverseTok(twist.tok);
    this.anim = {
      axis: twist.axis, from: fromA, to: toA, start: performance.now(), duration: 160,
      affected: twist.affected,
      onComplete: function () {
        for (let k = 0; k < steps; k++) CM.applyMove(self.state, applied);
        if (self.onTwist) self.onTwist(applied, steps);
      },
    };
  };

  CubeEngine.prototype._resize = function () {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ---- 渲染循环 ----
  CubeEngine.prototype._loop = function () {
    const self = this;
    function frame() {
      requestAnimationFrame(frame);
      if (self.anim) {
        const a = self.anim;
        const t = Math.min(1, (performance.now() - a.start) / a.duration);
        const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
        self.pivot.rotation[a.axis] = a.from + (a.to - a.from) * e;
        if (t >= 1) {
          self.pivot.rotation[a.axis] = a.to;
          self._finishAnim();
        }
      }
      self.renderer.render(self.scene, self.camera);
    }
    frame();
  };

  global.CubeEngine = CubeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
