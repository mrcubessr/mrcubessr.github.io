/* =========================================================
   cube-art.js — CFOP 案例配图渲染器（复刻 speedcubedb 原站样式）
   两个渲染器：
     · flatCase(facelets) — 顶面平面示意图（OLL / PLL）
         data-us/ub/uf/ul/ur 五面：中央 3×3 = us；四周一圈 = ub/uf/ul/ur 之顶层 3 贴
     · isoCube(fl)        — 等轴立体魔方（F2L / Advanced F2L）
         fl 为 45 字符：前三组 9 = 可见的 顶面 / 左侧面 / 右侧面（行主序），后两组隐藏
   配色全部走 tokens.css 的 --face-*，随深浅主题自动切换。
   ========================================================= */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  /* 色字母 → tokens 变量（U白 D黄 F绿 B蓝 R红 L橙；l=中立灰） */
  var TOKEN = { w: "--face-u", y: "--face-d", g: "--face-f", b: "--face-b", r: "--face-r", o: "--face-l" };
  var FALLBACK = { w: "#F5F7FA", y: "#FFD500", g: "#00A650", b: "#0F5BD6", r: "#E02B2B", o: "#FF8A1F" };

  function fillOf(ch) {
    var t = TOKEN[ch];
    if (!t) return "var(--fg-3,#8A93A6)";               /* l 或未知 → 中立中灰 */
    return "var(" + t + "," + FALLBACK[ch] + ")";
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function put(parent, tag, attrs, ch) {
    var e = svgEl(tag, attrs);
    if (ch != null) e.setAttribute("style", "fill:" + fillOf(ch));
    parent.appendChild(e);
    return e;
  }
  function rect(parent, x, y, w, h, rx, ch) {
    return put(parent, "rect", { x: r(x), y: r(y), width: r(w), height: r(h), rx: r(rx) }, ch);
  }
  function r(n) { return Math.round(n * 1000) / 1000; }

  /* ---------------- ① 顶面平面示意图（OLL / PLL） ---------------- */
  var F = { origin: 9.3056, cell: 17.5, pitch: 19.4444, strip: 6.389, edge: 0.972, rx: 2 };
  function str(facelets, key) {
    if (!facelets) return "";
    return facelets[key] || facelets["data-" + key] || "";
  }
  function flatCase(facelets) {
    var us = str(facelets, "us");
    if (!us || us.length < 9) return null;
    var svg = svgEl("svg", { class: "cfop-net cfop-net--flat", viewBox: "0 0 75 75", "aria-hidden": "true" });

    /* 黑色底板（十字形） */
    var body = svgEl("g", { class: "cfop-cube-body" });
    put(body, "rect", { x: 8.333, y: 8.333, width: 58.333, height: 58.333 });
    put(body, "rect", { x: 8.333, y: 0, width: 58.333, height: 8.333 });
    put(body, "rect", { x: 8.333, y: 66.667, width: 58.333, height: 8.333 });
    put(body, "rect", { x: 0, y: 8.333, width: 8.333, height: 58.333 });
    put(body, "rect", { x: 66.667, y: 8.333, width: 8.333, height: 58.333 });
    svg.appendChild(body);

    /* 中央 3×3 顶面 */
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        var i = row * 3 + col;
        rect(svg, F.origin + col * F.pitch, F.origin + row * F.pitch, F.cell, F.cell, F.rx, us[i]);
      }
    }
    /* 四周侧面顶层贴纸（上=ub 下=uf 左=ul 右=ur，各取前 3）
       注意 jcube 的 ub / ur 存的是「站在该面外侧正对看」的自然序：
         ub = UBR,UB,UBL   ur = UFR,UR,UBR
       而展开到平面上之后（四面绕各自与 U 的公共棱向外翻 90°）：
         上臂左→右 = UBL,UB,UBR   右臂上→下 = UBR,UR,UFR
       所以 ub / ur 必须反序取，否则顶角会贴出「橙+红」这类对面色组合
       （T-perm 等案例会立刻看出镜像错误）。uf / ul 的自然序恰好等于展开序。 */
    var strips = [
      { s: str(facelets, "ub"), horiz: true, y: F.edge, rev: true },
      { s: str(facelets, "uf"), horiz: true, y: 75 - F.edge - F.strip, rev: false },
      { s: str(facelets, "ul"), horiz: false, x: F.edge, rev: false },
      { s: str(facelets, "ur"), horiz: false, x: 75 - F.edge - F.strip, rev: true }
    ];
    strips.forEach(function (st) {
      for (var k = 0; k < 3; k++) {
        var cur = st.s[st.rev ? 2 - k : k] || "l";
        if (st.horiz) rect(svg, F.origin + k * F.pitch, st.y, F.cell, F.strip, 1.8, cur);
        else rect(svg, st.x, F.origin + k * F.pitch, F.strip, F.cell, 1.8, cur);
      }
    });
    return svg;
  }

  /* ---------------- ② 等轴立体魔方（F2L / Advanced F2L） ---------------- */
  /* 三个可见面的四边形（坐标取自原站 svg.js 投影，75×75 画布） */
  var QUAD = {
    top:   [[33.8967, 4.2753], [70.4131, 11.8423], [46.6097, 28.3353], [5.1747, 16.1854]],
    left:  [[5.1747, 16.1854], [46.6097, 28.3353], [45.3785, 72.2769], [9.8634, 55.5157]],
    right: [[46.6097, 28.3353], [70.4131, 11.8423], [66.3289, 49.2971], [45.3785, 72.2769]]
  };
  function bilerp(q, u, v) {
    var A = q[0], B = q[1], C = q[2], D = q[3];
    var x = (1 - u) * (1 - v) * A[0] + u * (1 - v) * B[0] + u * v * C[0] + (1 - u) * v * D[0];
    var y = (1 - u) * (1 - v) * A[1] + u * (1 - v) * B[1] + u * v * C[1] + (1 - u) * v * D[1];
    return [r(x), r(y)];
  }
  function isoFace(svg, q, face) {
    var INSET = 0.02;
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 3; col++) {
        var u0 = col / 3 + INSET, u1 = (col + 1) / 3 - INSET;
        var v0 = row / 3 + INSET, v1 = (row + 1) / 3 - INSET;
        var pts = [bilerp(q, u0, v0), bilerp(q, u1, v0), bilerp(q, u1, v1), bilerp(q, u0, v1)]
          .map(function (p) { return p[0] + "," + p[1]; }).join(" ");
        put(svg, "polygon", { points: pts }, face[row * 3 + col] || "l");
      }
    }
  }
  /* ---------------- ③ 平面六面展开图（Cross Trainer 用） ----------------
     十字形展开网：U 顶 / L F R B 中行（白顶绿前朝向）/ D 底。
     输入为 rubik-core 的 cube 对象 { U,D,L,R,F,B }，每个面 9 格行主序。
     直接绘制各面 3×3 贴纸，面与面之间留 1 格缝隙以区分。 */
  var NET = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  var CELL = 18, GAP = 6, STEP = CELL * 3 + GAP;     /* 每面格宽 + 面间缝 */
  var NET_W = 4 * STEP - GAP, NET_H = 3 * STEP - GAP;
  function flatNet(cube) {
    if (!cube) return null;
    var svg = svgEl("svg", { class: "cfop-net cfop-net--cross", viewBox: "0 0 " + NET_W + " " + NET_H, "aria-hidden": "true" });
    ["U", "L", "F", "R", "B", "D"].forEach(function (face) {
      var p = NET[face];
      var ox = p[0] * STEP, oy = p[1] * STEP;
      var arr = cube[face];
      if (!arr || arr.length < 9) return;
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          var ch = arr[row * 3 + col] || "l";
          rect(svg, ox + col * CELL, oy + row * CELL, CELL, CELL, 2.4, ch);
        }
      }
    });
    return svg;
  }

  function isoCube(fl) {
    if (!fl || fl.length < 27) return null;
    var svg = svgEl("svg", { class: "cfop-net cfop-net--iso", viewBox: "0 0 75 75", "aria-hidden": "true" });
    /* 立方体本体（黑），带浅描边以便深色主题下可辨 */
    var body = svgEl("g", { class: "cfop-cube-body" });
    ["top", "left", "right"].forEach(function (k) {
      put(body, "polygon", { points: QUAD[k].map(function (p) { return p[0] + "," + p[1]; }).join(" ") });
    });
    svg.appendChild(body);
    /* 贴纸：前三组 = 顶 / 左 / 右 */
    isoFace(svg, QUAD.top, fl.slice(0, 9));
    isoFace(svg, QUAD.left, fl.slice(9, 18));
    isoFace(svg, QUAD.right, fl.slice(18, 27));
    return svg;
  }

  window.CubeArt = { flatCase: flatCase, isoCube: isoCube, flatNet: flatNet };
})();
