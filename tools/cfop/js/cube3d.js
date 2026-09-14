/* =========================================================
   cube3d.js — 自包含 3D 魔方渲染器（正投影 + 背面剔除 + 画家算法）
   用途：Cross Trainer 的立体视图（替代六面展开图），可拖拽旋转看到全部 6 面。
   输入为 6 面 facelet 对象 { U,R,F,D,L,B }，每面 9 格（行主序，字符串或字符数组均可）。
   配色走 tokens.css 的 --face-*，随深浅主题切换。
   ========================================================= */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var D2R = Math.PI / 180;

  var TOKEN = { w: "--face-u", y: "--face-d", g: "--face-f", b: "--face-b", r: "--face-r", o: "--face-l" };
  var FALLBACK = { w: "#F5F7FA", y: "#FFD500", g: "#00A650", b: "#0F5BD6", r: "#E02B2B", o: "#FF8A1F" };
  function fillOf(ch) {
    var t = TOKEN[ch];
    if (!t) return "var(--fg-3,#8A93A6)";
    return "var(" + t + "," + FALLBACK[ch] + ")";
  }

  /* 面 → 贴纸平面映射：(u,v) ∈ [-1,1]²（u=列方向，v=行方向，自左而右 / 自上而下）
     返回单位立方体上的 [x,y,z]。朝向遵循标准 facelet 约定。 */
  var MAP = {
    U: function (u, v) { return [u, 1, v]; },     /* 行0=后 */
    D: function (u, v) { return [u, -1, -v]; },   /* 行0=前 */
    F: function (u, v) { return [u, -v, 1]; },    /* 行0=上 */
    B: function (u, v) { return [-u, -v, -1]; },  /* 行0=上 */
    R: function (u, v) { return [1, -v, u]; },    /* 列0=前 */
    L: function (u, v) { return [-1, -v, -u]; }   /* 列0=后 */
  };
  var NORMAL = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };

  function rot3(p, yaw, pitch) {
    var cy = Math.cos(yaw * D2R), sy = Math.sin(yaw * D2R);
    var cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
    var x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy, y1 = p[1];
    var y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
    return [x1, y2, z2];
  }
  function r(n) { return Math.round(n * 100) / 100; }

  /* 渲染可见的面（远→近），每面：先整面黑底再贴 inset 贴纸 */
  function render(cube, opts) {
    opts = opts || {};
    var yaw = opts.yaw || 0, pitch = opts.pitch || 0, size = opts.size || 220;
    var scale = size * 0.265, cx = size / 2, cy = size / 2;
    var INSET = 0.035;

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "c3-view");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("aria-label", "3D 魔方立体视图，可拖拽旋转");

    function proj(q) {
      var p = rot3(q, yaw, pitch);
      return r(cx + p[0] * scale) + "," + r(cy - p[1] * scale);
    }
    function poly(parent, pts, ch) {
      var e = document.createElementNS(NS, "polygon");
      e.setAttribute("points", pts.map(proj).join(" "));
      if (ch != null) e.setAttribute("style", "fill:" + fillOf(ch));
      else e.setAttribute("class", "c3-body");
      parent.appendChild(e);
    }

    var faces = [];
    Object.keys(MAP).forEach(function (f) {
      var n = rot3(NORMAL[f], yaw, pitch);
      if (n[2] <= 0.001) return;                       /* 背面剔除 */
      var raw = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (uv) {
        return MAP[f](uv[0], uv[1]);                   /* 未旋转的 3D 顶点 */
      });
      var depth = 0;
      raw.forEach(function (q) { depth += rot3(q, yaw, pitch)[2]; });
      faces.push({ f: f, raw: raw, depth: depth / 4 });
    });
    faces.sort(function (a, b) { return a.depth - b.depth; });   /* 远→近 */

    faces.forEach(function (fc) {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "c3-face");
      /* 整面黑底（形成贴纸间隙） */
      poly(g, fc.raw, null);
      /* 9 张贴纸 */
      var arr = cube[fc.f] || "";
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          var u0 = -1 + (col / 3) * 2 + INSET, u1 = -1 + ((col + 1) / 3) * 2 - INSET;
          var v0 = -1 + (row / 3) * 2 + INSET, v1 = -1 + ((row + 1) / 3) * 2 - INSET;
          var pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(function (uv) {
            return MAP[fc.f](uv[0], uv[1]);
          });
          poly(g, pts, arr[row * 3 + col] || "l");
        }
      }
      svg.appendChild(g);
    });
    return svg;
  }

  window.Cube3D = { render: render };
})();
