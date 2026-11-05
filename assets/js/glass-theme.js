/* =========================================================
   玻璃外观引擎 · glass-theme.js
   ---------------------------------------------------------
   给站点加一层「可自定义的玻璃主题」：
     背景（极光 / 自定义图片）→ 玻璃面（模糊、浓度、高光、保真度）
     → 内容面（可独立配置）→ 界面配色（品牌色 / 光标色）

   与既有引擎的关系：
     theme.js   管明度（data-theme = light/dark）
     palette.js 管配色方案（data-palette = inknight…）
     本文件     管玻璃材质（data-glass / data-g-wall + --g-* 变量）
   三者正交，互不覆盖：玻璃只往 html 上写 --g-*，不碰任何 --* 令牌
   （唯一的例外是「全局 UI 配色」，那是用户显式要求改品牌色）。

   首屏防闪：真正决定"开不开 / 用哪张底"的两个小键
   （mf_glass_on / mf_glass_wall）由 <head> 里的一段内联脚本同步读；
   本文件用 defer 加载，只负责把具体数值画上去。图片 dataURL 体积大，
   绝不能进首屏内联脚本里 JSON.parse（会把首帧拖慢上百毫秒）。

   存储：
     mf_glass_on    '1' | '0'
     mf_glass_wall  'aurora' | 'aurora-b' | 'none' | 'image'
     mf_glass_v1    JSON，全部数值 + 图片 dataURL
   ========================================================= */
(function () {
  'use strict';

  var KEY_ON = 'mf_glass_on';
  var KEY_WALL = 'mf_glass_wall';
  var KEY = 'mf_glass_v1';
  var CSS_UI = '/assets/css/glass-ui.css';

  var root = document.documentElement;
  if (!root || !document.body) { /* 极端情况下 body 还没出来，等 DOMContentLoaded */ }

  /* ---------------- 默认值 ---------------- */
  /* 深色 / 浅色各存一套：玻璃在两种底色上是两种物理，
     同一组数值不可能同时好看（深色要少白、浅色要多白）。 */
  function profileDark() {
    return {
      color: '#ffffff', alpha: 14, blur: 20, hi: 28, floor: 36, scrim: 22,
      radius: 14, sidebarRadius: 0,
      wallBlur: 0, wallBright: 100, wallSat: 100, wallOpacity: 100,
      contentAlpha: 30, contentColor: '#ffffff'
    };
  }
  function profileLight() {
    return {
      color: '#ffffff', alpha: 62, blur: 20, hi: 55, floor: 42, scrim: 10,
      radius: 14, sidebarRadius: 0,
      wallBlur: 0, wallBright: 100, wallSat: 100, wallOpacity: 100,
      contentAlpha: 40, contentColor: '#ffffff'
    };
  }
  function defaults() {
    return {
      on: true,
      wall: 'aurora',          /* aurora | aurora-b | none | image */
      img: '',                 /* dataURL 或 http(s) 地址 */
      imgName: '',
      imgLuma: null,           /* 图片平均亮度 0~1，用于"自动适配" */
      autoLuma: true,          /* 换图时自动把暗化层调到能读的值 */
      contentOn: false,
      uiColor: '',             /* 空 = 跟随站点配色方案 */
      caretColor: '',
      extra: '',               /* 额外补雾化的 CSS 选择器 */
      dark: profileDark(),
      light: profileLight()
    };
  }

  /* ---------------- 读取 / 合并 / 保存 ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function readState() {
    var s = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var m = JSON.parse(raw);
        if (m && typeof m === 'object') {
          /* 逐字段合并：旧版本存下来的结构也要能用，缺的字段用默认值补齐 */
          for (var k in s) {
            if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
            if (k === 'dark' || k === 'light') {
              for (var kk in s[k]) {
                if (m[k] && Object.prototype.hasOwnProperty.call(m[k], kk)) s[k][kk] = m[k][kk];
              }
            } else {
              s[k] = m[k];
            }
          }
        }
      }
    } catch (e) { /* 隐私模式 / JSON 坏了都退回默认 */ }
    /* 两个小键是首屏内联脚本的真源，读到以后覆盖一次，避免两份状态不一致 */
    try {
      var on = localStorage.getItem(KEY_ON);
      if (on === '0') s.on = false;
      else if (on === '1') s.on = true;
      var w = localStorage.getItem(KEY_WALL);
      if (w === 'aurora' || w === 'aurora-b' || w === 'none' || w === 'image') s.wall = w;
    } catch (e2) {}
    return s;
  }

  var state = readState();
  var saveTimer = 0;

  function save(now) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    function run() {
      try {
        localStorage.setItem(KEY_ON, state.on ? '1' : '0');
        localStorage.setItem(KEY_WALL, state.wall);
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* 图片过大把配额撑爆：退化成"本次可用、下次不记"，并告诉用户 */
        try {
          localStorage.setItem(KEY_ON, state.on ? '1' : '0');
          localStorage.setItem(KEY_WALL, state.wall);
        } catch (e2) {}
        if (!save.warned) {
          save.warned = true;
          toast('图片太大，浏览器存不下。换一张小一点的图，或改用「图片地址」。');
        }
      }
    }
    if (now) run(); else saveTimer = setTimeout(run, 260);
  }

  /* ---------------- 颜色工具 ---------------- */
  function hex2rgb(h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = 'ffffff';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(r, g, b) {
    function p(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
    return '#' + p(r) + p(g) + p(b);
  }
  function mix(hex, target, amount) {
    var a = hex2rgb(hex), b = hex2rgb(target);
    return rgb2hex(a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount);
  }
  function luma(hex) {
    var c = hex2rgb(hex);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  }
  function rgba(hex, a) {
    var c = hex2rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* ---------------- 图片亮度 → 自动适配暗化层 ----------------
     用户传进来的图可能是白底 / 很亮的（比如公式参考图），
     深色主题在亮图上会"玻璃发白、白字看不见"。这里量一下平均亮度，
     把暗化层顶到能读的下限 —— 这是"自定义图片"能不能用的关键一步，
     不做的话用户换一张亮图就会觉得"主题坏了"。 */
  function hasLuma() {
    return typeof state.imgLuma === 'number' && state.imgLuma >= 0;
  }

  function minScrim(luma) {
    if (typeof luma !== 'number' || isNaN(luma)) return null;
    if (mode() === 'light') {
      /* 浅色主题靠"白纱"提亮：图越暗，白纱越厚 */
      return Math.max(6, Math.min(42, Math.round((1 - luma) * 62)));
    }
    /* 深色主题靠"黑纱"压暗：图越亮，黑纱越厚 */
    return Math.max(14, Math.min(72, Math.round(luma * 95)));
  }

  function detectLuma(src, cb) {
    var img = new Image();
    try { img.crossOrigin = 'anonymous'; } catch (e) {}
    img.onload = function () {
      try {
        var w = Math.min(64, img.naturalWidth || 64);
        var h = Math.min(64, img.naturalHeight || 64);
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        var d = ctx.getImageData(0, 0, w, h).data;
        var sum = 0, n = 0;
        for (var i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          n++;
        }
        cb(n ? sum / n / 255 : null);
      } catch (e) {
        cb(null);   /* 跨域图片被 canvas 污染，读不到像素 */
      }
    };
    img.onerror = function () { cb(null); };
    img.src = src;
  }

  /* 换图之后统一走这里：量亮度 → 写下限 → 重画 */
  function adaptToImage(src) {
    detectLuma(src, function (luma) {
      if (typeof luma === 'number') {
        state.imgLuma = Math.round(luma * 100) / 100;
        if (state.autoLuma) {
          var p = prof();
          p.scrim = minScrim(state.imgLuma);
          /* 亮图在深色主题下还要把面板"垫实"一点，否则卡片里的白字飘 */
          if (mode() === 'dark' && state.imgLuma > 0.6) {
            p.floor = Math.max(p.floor, 50);
          }
        }
      } else {
        /* -1 = 读过但读不到（跨域 / 解码失败）。用哨兵值避免每次进页面都重试 */
        state.imgLuma = -1;
        toast('这张图跨域读不到亮度，暗化层请手动调一下');
      }
      apply();
      save(true);
    });
  }

  /* ---------------- 当前明度 / 配色 ---------------- */
  function mode() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function paletteOff() {
    var p = root.getAttribute('data-palette') || '';
    return p === 'projector' || p === 'paper';   /* 投屏 / 纸感：玻璃必须关 */
  }
  function prof() { return state[mode()]; }

  /* ---------------- 应用 ---------------- */
  var OWN_VARS = [
    '--g-alpha', '--g-tint-rgb', '--g-floor', '--g-hi', '--g-scrim',
    '--g-blur-bar', '--g-blur-panel', '--g-r', '--g-r-sm', '--g-r-lg',
    '--g-r-sidebar', '--g-wall-blur', '--g-wall-bright', '--g-wall-sat',
    '--g-wall-opacity', '--g-wall-scale',
    '--g-card-bg', '--g-panel-bg',
    '--brand', '--brand-strong', '--brand-soft', '--brand-line',
    '--nav-accent', '--glow', '--on-brand', 'caret-color'
  ];

  function clearVars() {
    for (var i = 0; i < OWN_VARS.length; i++) root.style.removeProperty(OWN_VARS[i]);
  }

  function setVar(name, value) {
    root.style.setProperty(name, value);
  }

  function apply(opts) {
    var silent = opts && opts.silent;

    root.setAttribute('data-glass', state.on ? 'on' : 'off');
    root.setAttribute('data-g-wall', state.wall);

    if (!state.on) { clearVars(); paintWall(); syncUI(); return; }

    /* 投屏 / 纸感：把内联值全撤掉，让 glass.css 里的护栏生效。
       内联样式优先级高于样式表，不撤就等于把护栏顶掉了。 */
    if (paletteOff()) { clearVars(); paintWall(); syncUI(); return; }

    var p = prof();
    var tint = hex2rgb(p.color);

    setVar('--g-tint-rgb', tint[0] + ' ' + tint[1] + ' ' + tint[2]);
    setVar('--g-alpha', String(p.alpha / 100));
    setVar('--g-floor', String(p.floor / 100));
    setVar('--g-hi', String(p.hi / 100));
    setVar('--g-scrim', mode() === 'light'
      ? 'rgba(255,255,255,' + (p.scrim / 100 * 0.55).toFixed(3) + ')'
      : 'rgba(0,0,0,' + (p.scrim / 100).toFixed(3) + ')');

    setVar('--g-blur-bar', p.blur + 'px');
    setVar('--g-blur-panel', (p.blur + 4) + 'px');

    setVar('--g-r', p.radius + 'px');
    setVar('--g-r-sm', Math.max(0, p.radius - 4) + 'px');
    setVar('--g-r-lg', (p.radius + 4) + 'px');
    setVar('--g-r-sidebar', p.sidebarRadius + 'px');

    setVar('--g-wall-blur', p.wallBlur + 'px');
    setVar('--g-wall-bright', String(p.wallBright / 100));
    setVar('--g-wall-sat', String(p.wallSat / 100));
    setVar('--g-wall-opacity', String(p.wallOpacity / 100));
    /* 模糊半径越大，视口四边的透明毛边越宽，缩放系数跟着走 */
    setVar('--g-wall-scale', p.wallBlur > 0 ? (1 + p.wallBlur / 240).toFixed(3) : '1');

    /* 内容面独立配置：直接改写两张合成变量（CSS 里的 color-mix 让位给内联值） */
    if (state.contentOn) {
      var edge = Math.min(100, p.floor + 16);
      var cc = 'rgba(' + hex2rgb(p.contentColor).join(',') + ',' + (p.contentAlpha / 100) + ')';
      setVar('--g-card-bg', 'color-mix(in srgb, var(--surface) ' + (p.floor * 100) + '%, ' + cc + ')');
      setVar('--g-panel-bg', 'color-mix(in srgb, var(--surface) ' + edge + '%, ' + cc + ')');
    } else {
      root.style.removeProperty('--g-card-bg');
      root.style.removeProperty('--g-panel-bg');
    }

    /* 全局 UI 配色（可选）：覆盖品牌色家族 */
    if (state.uiColor) {
      var u = state.uiColor;
      setVar('--brand', u);
      setVar('--brand-strong', mix(u, '#000000', 0.18));
      setVar('--brand-soft', rgba(u, 0.14));
      setVar('--brand-line', rgba(u, 0.30));
      setVar('--nav-accent', mix(u, '#ffffff', 0.18));
      setVar('--glow', '0 6px 22px ' + rgba(u, 0.28));
      setVar('--on-brand', luma(u) > 0.62 ? '#0B0D14' : '#FFFFFF');
    } else {
      root.style.removeProperty('--brand');
      root.style.removeProperty('--brand-strong');
      root.style.removeProperty('--brand-soft');
      root.style.removeProperty('--brand-line');
      root.style.removeProperty('--nav-accent');
      root.style.removeProperty('--glow');
      root.style.removeProperty('--on-brand');
    }

    if (state.caretColor) setVar('caret-color', state.caretColor);
    else root.style.removeProperty('caret-color');

    paintWall();
    paintExtra();
    if (!silent) syncUI();
  }

  /* ---------------- 背景图片层 ---------------- */
  var wallDiv = null;

  function ensureWall() {
    if (wallDiv && wallDiv.parentNode) return wallDiv;
    wallDiv = document.createElement('div');
    wallDiv.className = 'gx-wall';
    wallDiv.setAttribute('aria-hidden', 'true');
    /* 挂在 body 末尾：避开 `body > :first-child` 这类选择器 */
    document.body.appendChild(wallDiv);
    return wallDiv;
  }

  function cssUrl(u) {
    return 'url("' + String(u).replace(/["\\]/g, '') + '")';
  }

  function paintWall() {
    if (!document.body) return;
    var el = ensureWall();
    if (state.wall === 'image' && state.img) {
      el.style.backgroundImage = cssUrl(state.img);
    } else {
      el.style.backgroundImage = 'none';
    }
  }

  /* ---------------- 额外补雾化的选择器 ----------------
     用户在面板里填 `.my-panel, #someBox`，就给这些元素补上玻璃模糊。
     站点 119 个页面里各页自绘的面板类名不一，与其逐个改 CSS，
     不如留一个"补丁口"：用户自己填，填错也不影响主样式。 */
  function sanitizeSel(s) {
    return String(s || '')
      .split(',')
      .map(function (x) { return x.trim(); })
      .filter(function (x) {
        if (!x || x.length > 120) return false;
        /* 只允许选择器字符，挡住 { } ; @ url( 这类能逃出规则的输入 */
        return /^[A-Za-z0-9_\-.\[\]=\"'\s>+~:()*#]+$/.test(x) && !/[{};@]/.test(x) && x.indexOf('url(') < 0;
      })
      .join(',');
  }

  function paintExtra() {
    var id = 'gxExtraStyle';
    var el = document.getElementById(id);
    var sel = sanitizeSel(state.extra);
    if (!state.on || !sel) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent =
      'html[data-glass="on"] ' + sel + '{' +
      '-webkit-backdrop-filter:var(--g-filter-panel);backdrop-filter:var(--g-filter-panel);}';
  }

  /* ---------------- 轻提示（不引入第三方） ---------------- */
  function toast(msg) {
    var t = document.getElementById('gxToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'gxToast';
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1400;' +
        'max-width:86vw;padding:10px 14px;border-radius:10px;font-size:13px;line-height:1.5;' +
        'color:#fff;background:rgba(20,24,38,.94);border:1px solid rgba(255,255,255,.14);' +
        'box-shadow:0 12px 40px rgba(0,0,0,.45);transition:opacity .2s ease';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.__h);
    t.__h = setTimeout(function () { t.style.opacity = '0'; }, 3200);
  }

  /* ---------------- 面板 ---------------- */
  var mask = null, panel = null, uiLoaded = false;

  function loadUI(cb) {
    if (uiLoaded) { cb(); return; }
    var l = document.querySelector('link[data-glass-ui]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = CSS_UI;
      l.setAttribute('data-glass-ui', '');
      l.addEventListener('load', function () { uiLoaded = true; cb(); });
      l.addEventListener('error', function () { uiLoaded = true; cb(); });
      document.head.appendChild(l);
    } else {
      uiLoaded = true; cb();
    }
  }

  var GLASS_COLORS = ['#ffffff', '#0b0d14', '#64b4ff', '#a78bfa', '#ffc857', '#ff9ecd'];
  var UI_COLORS = ['#5B8DEF', '#34D399', '#A78BFA', '#FFC857', '#F472B6', '#22D3EE'];
  var CARET_COLORS = ['#ffffff', '#0b0d14', '#5B8DEF', '#34D399', '#FFC857', '#F472B6'];

  function swatches(list, cur, attr) {
    var h = '';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      h += '<button type="button" class="gx-sw__b" style="--c:' + c + '" data-gx-sw="' + attr + '" data-v="' + c + '"' +
        ' aria-pressed="' + (String(cur).toLowerCase() === c.toLowerCase() ? 'true' : 'false') + '"' +
        ' aria-label="' + c + '" title="' + c + '"></button>';
    }
    return h;
  }

  function colorRow(label, list, cur, attr) {
    return '<div class="gx-row">' +
      '<div class="gx-row__h">' + label + '</div>' +
      '<div class="gx-sw">' + swatches(list, cur, attr) +
        '<label class="gx-sw__pick" title="自定义颜色">' +
          '<input type="color" data-gx-color="' + attr + '" value="' + (cur && /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff') + '" aria-label="' + label + '自定义">' +
        '</label>' +
      '</div></div>';
  }

  function sliderRow(key, label, min, max, unit, tip, gate) {
    var p = prof();
    return '<div class="gx-row"' + (gate ? ' data-gx-gate="' + gate + '"' : '') + '>' +
      '<div class="gx-row__h">' + label + '<b data-gx-out="' + key + '">' + p[key] + unit + '</b></div>' +
      '<input type="range" min="' + min + '" max="' + max + '" step="1" value="' + p[key] + '"' +
      ' data-gx-range="' + key + '" data-unit="' + unit + '" aria-label="' + label + '">' +
      (tip ? '<p class="gx-row__tip">' + tip + '</p>' : '') +
      '</div>';
  }

  function buildPanel() {
    var p = prof();
    var wrap = document.createElement('div');

    wrap.innerHTML =
      '<div class="gx-mask" data-gx-close hidden></div>' +
      '<div class="gx-panel" id="gxPanel" role="dialog" aria-modal="false" aria-label="玻璃外观设置" tabindex="-1" hidden>' +
        '<div class="gx-hd">' +
          '<span class="gx-hd__t">玻璃外观</span>' +
          '<span class="gx-hd__s" data-gx-modename></span>' +
          '<button type="button" class="gx-x" data-gx-close aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="gx-bd">' +

          /* ---- 开关 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-seg" role="group" aria-label="玻璃开关">' +
              '<button type="button" class="gx-seg__b" data-gx-on="1">开启玻璃</button>' +
              '<button type="button" class="gx-seg__b" data-gx-on="0">关闭（原样）</button>' +
            '</div>' +
          '</div>' +

          /* ---- 背景 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-sec__t">背景</div>' +
            '<div class="gx-seg" role="group" aria-label="背景类型">' +
              '<button type="button" class="gx-seg__b" data-gx-wall="aurora">极光 A</button>' +
              '<button type="button" class="gx-seg__b" data-gx-wall="aurora-b">极光 B</button>' +
              '<button type="button" class="gx-seg__b" data-gx-wall="none">纯色</button>' +
              '<button type="button" class="gx-seg__b" data-gx-wall="image">我的图片</button>' +
            '</div>' +
            '<div class="gx-row" data-gx-gate="image">' +
              '<div class="gx-imgrow">' +
                '<div class="gx-imgrow__pv" data-gx-pv></div>' +
                '<div class="gx-imgrow__meta">' +
                  '<span class="gx-imgrow__nm" data-gx-imgname>未选择图片</span>' +
                  '<span class="gx-imgrow__hint">建议横图 ≥1600px，会自动压缩到 1920px 内</span>' +
                '</div>' +
                '<button type="button" class="gx-mini" data-gx-upload>选择</button>' +
                '<button type="button" class="gx-mini" data-gx-clearimg>清除</button>' +
              '</div>' +
              '<div class="gx-url">' +
                '<input type="text" data-gx-imgurl placeholder="或粘贴图片地址 https://…" aria-label="图片地址">' +
                '<button type="button" class="gx-mini" data-gx-applyurl>用这张</button>' +
              '</div>' +
              '<input type="file" accept="image/*" data-gx-file hidden>' +
            '</div>' +
            sliderRow('wallBlur', '图片模糊', 0, 40, 'px', '', 'image') +
            sliderRow('wallBright', '图片亮度', 40, 160, '%', '', 'image') +
            sliderRow('wallSat', '图片饱和度', 0, 200, '%', '', 'image') +
            sliderRow('wallOpacity', '图片不透明度', 30, 100, '%', '', 'image') +
            '<div class="gx-row" data-gx-gate="image">' +
              '<div class="gx-row__h">自动适配图片亮度' +
                '<b data-gx-luma>—</b></div>' +
              '<div class="gx-seg" role="group" aria-label="自动适配图片亮度">' +
                '<button type="button" class="gx-seg__b" data-gx-auto="1">开</button>' +
                '<button type="button" class="gx-seg__b" data-gx-auto="0">关</button>' +
              '</div>' +
              '<p class="gx-row__tip">换图时量一下平均亮度，自动把暗化层（必要时连保真度）顶到能读的下限 —— 白底图片在深色主题里就靠它救。</p>' +
            '</div>' +
            sliderRow('scrim', '暗化层', 0, 80, '%', '压暗背景，让玻璃上的字立得住。0 = 最通透，也最容易看不清。') +
          '</div>' +

          /* ---- 玻璃 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-sec__t">玻璃</div>' +
            colorRow('玻璃颜色', GLASS_COLORS, p.color, 'color') +
            sliderRow('alpha', '玻璃透明度', 0, 80, '%', '深色底要少、浅色底要多 —— 两套数值分开存。') +
            sliderRow('blur', '雾化（模糊半径）', 0, 48, 'px', '16–24 是甜点区；越大越雾，也越吃性能。') +
            sliderRow('hi', '顶部高光', 0, 80, '%', '湿玻璃的关键。拉到 0 试试：面板会立刻糊进背景。') +
            sliderRow('floor', '玻璃保真度', 0, 100, '%', '面板里"实色"的占比：越高越清楚，越低越透。') +
            sliderRow('radius', '面板圆角', 0, 24, 'px', '') +
            sliderRow('sidebarRadius', '侧边栏圆角', 0, 24, 'px', '') +
          '</div>' +

          /* ---- 内容面 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-sec__t">内容面</div>' +
            '<div class="gx-seg" role="group" aria-label="内容面独立配置">' +
              '<button type="button" class="gx-seg__b" data-gx-content="0">跟随玻璃</button>' +
              '<button type="button" class="gx-seg__b" data-gx-content="1">独立配置</button>' +
            '</div>' +
            '<div class="gx-row" data-gx-gate="contentOn">' +
              '<div class="gx-row__h">内容面底色</div>' +
              '<div class="gx-sw">' + swatches(GLASS_COLORS, p.contentColor, 'contentColor') +
                '<label class="gx-sw__pick" title="自定义"><input type="color" data-gx-color="contentColor" value="' + p.contentColor + '" aria-label="内容面底色自定义"></label>' +
              '</div>' +
            '</div>' +
            sliderRow('contentAlpha', '内容面透明度', 0, 100, '%', '', 'contentOn') +
          '</div>' +

          /* ---- 界面配色 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-sec__t">界面配色</div>' +
            colorRow('全局 UI 配色', UI_COLORS, state.uiColor || '', 'uiColor') +
            '<p class="gx-row__tip">一处覆盖：按钮、链接、选中态、侧栏高亮。不选 = 跟随上方「配色方案」。</p>' +
            colorRow('光标颜色', CARET_COLORS, state.caretColor || '', 'caretColor') +
          '</div>' +

          /* ---- 高级 ---- */
          '<div class="gx-sec">' +
            '<div class="gx-sec__t">高级</div>' +
            '<div class="gx-row">' +
              '<div class="gx-row__h">额外补雾化的选择器</div>' +
              '<div class="gx-url">' +
                '<input type="text" data-gx-extra placeholder="例如 .my-panel, #toolBox" aria-label="额外补雾化的选择器">' +
              '</div>' +
              '<p class="gx-row__tip">有些工具页的面板是各页自绘的，类名不在主题里。把它们的类名填进来，就一起上玻璃（逗号分隔）。</p>' +
            '</div>' +
          '</div>' +

        '</div>' +
        '<div class="gx-ft">' +
          '<button type="button" class="gx-btn" data-gx-reset>恢复默认</button>' +
          '<button type="button" class="gx-btn gx-btn--primary" data-gx-close>完成</button>' +
        '</div>' +
      '</div>';

    mask = wrap.firstChild;
    panel = wrap.lastChild;
    document.body.appendChild(mask);
    document.body.appendChild(panel);

    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', onChange);
    mask.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) close();
    });
    syncUI();
  }

  /* ---------------- 面板事件 ---------------- */
  function onClick(e) {
    var t = e.target;
    if (!t.closest) return;

    if (t.closest('[data-gx-close]')) { close(); return; }

    var on = t.closest('[data-gx-on]');
    if (on) { state.on = on.getAttribute('data-gx-on') === '1'; apply(); save(); return; }

    var wall = t.closest('[data-gx-wall]');
    if (wall) {
      var pickW = wall.getAttribute('data-gx-wall');
      if (pickW === 'image' && !state.img) {
        /* 还没有图：不切模式，直接弹文件选择；选完 readImage 会自动切到图片模式 */
        var fi0 = panel.querySelector('[data-gx-file]');
        if (fi0) fi0.click();
        return;
      }
      state.wall = pickW;
      /* 切回图片模式时，按记下的亮度再校一次暗化层 */
      if (pickW === 'image' && state.autoLuma && hasLuma()) {
        var msW = minScrim(state.imgLuma);
        if (msW !== null) prof().scrim = msW;
      }
      apply(); save(); return;
    }

    var ct = t.closest('[data-gx-content]');
    if (ct) { state.contentOn = ct.getAttribute('data-gx-content') === '1'; apply(); save(); return; }

    var au = t.closest('[data-gx-auto]');
    if (au) {
      state.autoLuma = au.getAttribute('data-gx-auto') === '1';
      if (state.autoLuma && hasLuma()) {
        var msA = minScrim(state.imgLuma);
        if (msA !== null) prof().scrim = msA;
      }
      apply(); save(); return;
    }

    var sw = t.closest('[data-gx-sw]');
    if (sw) {
      var attr = sw.getAttribute('data-gx-sw');
      var v = sw.getAttribute('data-v');
      if (attr === 'uiColor' || attr === 'caretColor') state[attr] = (state[attr] === v ? '' : v);
      else prof()[attr] = v;
      apply(); save(); return;
    }

    if (t.closest('[data-gx-upload]')) {
      var fi = panel.querySelector('[data-gx-file]');
      if (fi) fi.click();
      return;
    }
    if (t.closest('[data-gx-clearimg]')) {
      state.img = '';
      state.imgName = '';
      if (state.wall === 'image') state.wall = 'aurora';
      apply(); save(); return;
    }
    if (t.closest('[data-gx-applyurl]')) {
      var inp = panel.querySelector('[data-gx-imgurl]');
      var u = inp ? inp.value.trim() : '';
      if (!u) { toast('先粘贴一个图片地址'); return; }
      if (!/^(https?:\/\/|\/)/i.test(u)) { toast('图片地址要以 http(s):// 或 / 开头'); return; }
      state.img = u;
      state.imgName = u.split('/').pop().slice(0, 40) || '远程图片';
      state.wall = 'image';
      apply(); save();
      adaptToImage(u);          /* 能读到像素就顺手把暗化层调好 */
      toast('已应用图片地址');
      return;
    }
    if (t.closest('[data-gx-reset]')) {
      if (!window.confirm('恢复玻璃外观的默认设置？（不会动配色方案与明暗）')) return;
      state = defaults();
      save(true);
      apply();
      toast('已恢复默认');
      return;
    }
  }

  function onInput(e) {
    var t = e.target;

    var r = t.closest && t.closest('[data-gx-range]');
    if (r) {
      var key = r.getAttribute('data-gx-range');
      prof()[key] = +r.value;
      apply({ silent: true });
      save();
      syncOut(key);
      return;
    }

    var c = t.closest && t.closest('[data-gx-color]');
    if (c) {
      var attr = c.getAttribute('data-gx-color');
      if (attr === 'uiColor' || attr === 'caretColor') state[attr] = c.value;
      else prof()[attr] = c.value;
      apply({ silent: true });
      save();
      syncUI();
      return;
    }

    var x = t.closest && t.closest('[data-gx-extra]');
    if (x) {
      state.extra = x.value;
      apply({ silent: true });
      save();
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t.closest && t.closest('[data-gx-file]')) {
      var f = t.files && t.files[0];
      if (f) readImage(f);
    }
  }

  /* ---------------- 图片读取与压缩 ----------------
     上传的图一律重编码为 JPEG（≤1920px，质量 0.82）：
     localStorage 只有 ~5MB，原图动辄 3–8MB，直接存会把整个存储顶爆，
     连"玻璃开关"都一起存不进去。 */
  function readImage(file) {
    if (!/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    if (file.size > 12 * 1024 * 1024) { toast('图片超过 12MB，先压缩一下再选'); return; }
    var fr = new FileReader();
    fr.onerror = function () { toast('读取失败，换一张试试'); };
    fr.onload = function () {
      var img = new Image();
      img.onerror = function () { toast('这张图解码失败，换一张'); };
      img.onload = function () {
        try {
          var max = 1920;
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w > max || h > max) {
            var k = Math.min(max / w, max / h);
            w = Math.round(w * k); h = Math.round(h * k);
          }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var data = cv.toDataURL('image/jpeg', 0.82);
          /* 还是太大就降一档质量重来一次 */
          if (data.length > 1400000) data = cv.toDataURL('image/jpeg', 0.7);
          state.img = data;
          state.imgName = (file.name || '本地图片').slice(0, 40) + '（' + w + '×' + h + '）';
          state.wall = 'image';
          apply();
          save(true);
          adaptToImage(data);
          toast('已换好背景图');
        } catch (err) {
          toast('压缩失败，可能是浏览器限制，换一张试试');
        }
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  /* ---------------- UI 同步 ---------------- */
  function syncOut(key) {
    if (!panel) return;
    var out = panel.querySelector('[data-gx-out="' + key + '"]');
    var inp = panel.querySelector('[data-gx-range="' + key + '"]');
    if (out && inp) out.textContent = inp.value + (inp.getAttribute('data-unit') || '');
  }

  function syncUI() {
    if (!panel) return;
    var p = prof();

    /* 分段按钮 */
    press('[data-gx-on="1"]', state.on);
    press('[data-gx-on="0"]', !state.on);
    press('[data-gx-wall="' + state.wall + '"]', true);
    press('[data-gx-content="1"]', state.contentOn);
    press('[data-gx-content="0"]', !state.contentOn);
    press('[data-gx-auto="1"]', state.autoLuma !== false);
    press('[data-gx-auto="0"]', state.autoLuma === false);

    /* 图片亮度读数 */
    var lum = panel.querySelector('[data-gx-luma]');
    if (lum) {
      lum.textContent = hasLuma()
        ? Math.round(state.imgLuma * 100) + '%'
        : '—';
    }

    /* 滑块 */
    var rs = panel.querySelectorAll('[data-gx-range]');
    for (var i = 0; i < rs.length; i++) {
      var k = rs[i].getAttribute('data-gx-range');
      if (typeof p[k] === 'number') rs[i].value = p[k];
      syncOut(k);
    }

    /* 色板 */
    var sws = panel.querySelectorAll('[data-gx-sw]');
    for (var j = 0; j < sws.length; j++) {
      var attr = sws[j].getAttribute('data-gx-sw');
      var cur = (attr === 'uiColor' || attr === 'caretColor') ? (state[attr] || '') : p[attr];
      sws[j].setAttribute('aria-pressed', String(String(cur).toLowerCase() === sws[j].getAttribute('data-v').toLowerCase()));
    }
    var cs = panel.querySelectorAll('[data-gx-color]');
    for (var m = 0; m < cs.length; m++) {
      var a2 = cs[m].getAttribute('data-gx-color');
      var v2 = (a2 === 'uiColor' || a2 === 'caretColor') ? (state[a2] || '#5b8def') : p[a2];
      if (/^#[0-9a-f]{6}$/i.test(v2)) cs[m].value = v2;
    }

    /* 背景图片 */
    var pv = panel.querySelector('[data-gx-pv]');
    if (pv) pv.style.backgroundImage = (state.wall === 'image' && state.img) ? cssUrl(state.img) : 'none';
    var nm = panel.querySelector('[data-gx-imgname]');
    if (nm) nm.textContent = state.imgName || (state.img ? '已设置图片' : '未选择图片');
    var url = panel.querySelector('[data-gx-imgurl]');
    if (url && /^(https?:\/\/|\/)/i.test(state.img) && url.value !== state.img) url.value = state.img;

    var ex = panel.querySelector('[data-gx-extra]');
    if (ex && document.activeElement !== ex) ex.value = state.extra || '';

    /* 按模式显隐的行 */
    var gates = {
      image: state.wall === 'image',
      contentOn: !!state.contentOn
    };
    var gs = panel.querySelectorAll('[data-gx-gate]');
    for (var n = 0; n < gs.length; n++) {
      var g = gs[n].getAttribute('data-gx-gate');
      gs[n].style.display = gates[g] ? '' : 'none';
    }

    var mn = panel.querySelector('[data-gx-modename]');
    if (mn) mn.textContent = mode() === 'light' ? '浅色 · 独立参数' : '深色 · 独立参数';
  }

  function press(sel, on) {
    var el = panel.querySelector(sel);
    if (el) el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /* ---------------- 开关面板 ---------------- */
  function open() {
    if (!document.body) return;
    loadUI(function () {
      if (!panel) buildPanel();
      mask.hidden = false;
      panel.hidden = false;
      syncUI();
      /* 关掉手机抽屉，否则面板被压在下面 */
      var links = document.getElementById('navLinks');
      if (links && links.classList.contains('open')) {
        links.classList.remove('open');
        document.body.classList.remove('nav-drawer-open');
      }
      try { panel.focus({ preventScroll: true }); } catch (e) { panel.focus(); }
    });
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    if (mask) mask.hidden = true;
    save(true);
  }

  /* ---------------- 入口按钮 ---------------- */
  var ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
    '<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M3 9h18" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M7.5 13.5h9M7.5 16.5h5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';

  function injectBtn() {
    var inner = document.querySelector('#siteNav .nav-inner');
    if (!inner) return false;
    var b = inner.querySelector('.nav-glass-btn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-glass-btn';
      b.id = 'siteGlassBtn';
      b.innerHTML = ICON;
      b.title = '玻璃外观（背景图 / 模糊 / 配色）';
      b.setAttribute('aria-label', '玻璃外观设置');
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (panel && !panel.hidden) close(); else open();
      });
      var tb = inner.querySelector('.nav-theme-btn');
      if (tb && tb.parentNode === inner) inner.insertBefore(b, tb.nextSibling);
      else inner.appendChild(b);
    }
    b.setAttribute('data-on', state.on ? '1' : '0');
    return true;
  }

  function boot() {
    apply({ silent: true });
    /* 老数据 / 别处写入的图片：亮度还不知道就补量一次（量不到会记 -1，不再重试） */
    if (state.wall === 'image' && state.img && state.autoLuma && typeof state.imgLuma !== 'number') {
      adaptToImage(state.img);
    }
    /* ?glassui=1 直接打开面板（截图 / 分享 / 演示用） */
    if (/(?:^|[?&])glassui=1(?:&|$)/.test(location.search)) {
      setTimeout(open, 80);
    }
    if (injectBtn()) return;
    if (!('MutationObserver' in window)) return;
    var mo = new MutationObserver(function () { if (injectBtn()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { injectBtn(); mo.disconnect(); }, 5000);
  }

  /* 明度 / 配色方案变化：配置是两套参数 + 投屏纸张要关玻璃，
     所以必须重新 apply 一次，不能只靠 CSS。 */
  if ('MutationObserver' in window) {
    var last = root.getAttribute('data-theme') + '|' + (root.getAttribute('data-palette') || '');
    new MutationObserver(function () {
      var now = root.getAttribute('data-theme') + '|' + (root.getAttribute('data-palette') || '');
      if (now === last) return;
      last = now;
      /* 明暗切换 = 换了一套参数；图片亮度对暗化层的要求也跟着反过来了 */
      if (state.autoLuma && state.wall === 'image' && hasLuma()) {
        var ms = minScrim(state.imgLuma);
        if (ms !== null) prof().scrim = ms;
      }
      apply();
      var b = document.getElementById('siteGlassBtn');
      if (b) b.setAttribute('data-on', state.on ? '1' : '0');
    }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  }

  /* 跨标签页同步 */
  window.addEventListener('storage', function (e) {
    if (!e || (e.key !== KEY && e.key !== KEY_ON && e.key !== KEY_WALL)) return;
    state = readState();
    apply();
  });

  /* 对外 API：给别的脚本/控制台留个口子（调试、批量切） */
  window.GlassTheme = {
    open: open,
    close: close,
    enable: function (v) { state.on = !!v; apply(); save(true); },
    set: function (k, v) { state[k] = v; apply(); save(true); },
    state: function () { return clone(state); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
