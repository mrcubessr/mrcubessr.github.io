/* =========================================================
   tools/timer/personal.js — 计时器「个性化」设置（v2.0.60）
   ---------------------------------------------------------
   职责边界：只管**计时器页面的观感**（颜色 / 字体 / 密度 / 动效），
   不碰计时逻辑、成绩数据、三盲参数 —— 那些归 timer.js。

   与全站配色（assets/js/palette.js）的关系：
     全站 palette 决定整站底色与品牌色（data-palette / data-theme）；
     本文件只在**计时器页内部**覆盖若干局部变量（--tm-*），
     两者各写各的层，互不覆盖；本页不设置时全部回落令牌，观感与从前一致。

   存储：写进 timer.js 已持久化的 opt.personal（localStorage 键
   timer_options_v1）。**刻意不新增 localStorage 键** ——
   该键已在 LSProvider 同步白名单里，个性化会随成绩一起云同步/跨设备，
   且不必再改一次同步清单（改漏一个键 = 该类数据永不进快照）。

   对外：window.TimerPersonal = { apply, getCfg, setCfg, reset, mount }
   依赖：window.TimerOpt（timer.js 暴露的 { get, save, applyFontScale }）
   ========================================================= */
(function () {
  'use strict';

  var LS_OPT = 'timer_options_v1';

  /* ---------------- 默认值（空字符串 = 「自动」，回落设计令牌） ---------------- */
  var DEFAULTS = {
    accent: '',        /* 强调色 */
    timeColor: '',     /* 计时数字 */
    stageBg: '',       /* 舞台底色 */
    stageBg2: '',      /* 舞台渐变第二色（空 = 与底色同，视觉为纯色） */
    ready: '',         /* 就绪 */
    warn: '',          /* 观察剩 3 秒 */
    danger: '',        /* 观察超时 / DNF */
    timeWeight: 800,   /* 计时数字字重 */
    timeTrack: 2,      /* 字距 px */
    timeFont: 'mono',  /* mono | sans */
    uiScale: 1,        /* 界面文字缩放 0.85~1.4 */
    density: 'normal', /* compact | normal | loose */
    hideNet: false,    /* 隐藏打乱展开图 */
    reduceMotion: false
  };

  /* ---------------- 一键配色预设（只给颜色，不动字号） ----------------
     未列出的字段 = 空 = 自动（跟随当前明暗主题），保证深浅色都不翻车。 */
  var PRESETS = [
    { id: 'auto',    name: '默认',     sw: ['#5B8DEF', '#A78BFA', '#0B0D14'], cfg: {} },
    { id: 'speed',   name: '竞速红',   sw: ['#E5484D', '#FF8A8A', '#1A0E10'], cfg: { accent: '#E5484D', stageBg: '#1A0E10', stageBg2: '#2A1418' } },
    { id: 'green',   name: '荧光绿',   sw: ['#30A46C', '#7CE7A8', '#0C1712'], cfg: { accent: '#30A46C', stageBg: '#0C1712', stageBg2: '#132420' } },
    { id: 'violet',  name: '紫霞',     sw: ['#8E4EC6', '#C9AEFF', '#140E1C'], cfg: { accent: '#8E4EC6', stageBg: '#140E1C', stageBg2: '#211634' } },
    { id: 'amber',   name: '琥珀暖',   sw: ['#E09A52', '#F5C88A', '#171208'], cfg: { accent: '#E09A52', stageBg: '#171208', stageBg2: '#241C0E' } },
    { id: 'teal',    name: '青碧',     sw: ['#0FA5A5', '#7FE3E0', '#07161A'], cfg: { accent: '#0FA5A5', stageBg: '#07161A', stageBg2: '#0E2A30' } },
    { id: 'gray',    name: '极简灰',   sw: ['#8B8D98', '#C2C5CE', '#101215'], cfg: { accent: '#8B8D98', stageBg: '#101215', stageBg2: '#191C21' } },
    { id: 'contrast',name: '高对比',   sw: ['#0057FF', '#FFD400', '#FFFFFF'], cfg: { accent: '#0057FF', stageBg: '#FFFFFF', stageBg2: '#F0F2F6', timeColor: '#000000' } }
  ];

  /* ---------------- 小工具 ---------------- */
  function clamp(v, lo, hi, dft) {
    v = Number(v);
    if (!isFinite(v)) return dft;
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function isHex(s) { return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.trim()); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function optObj() {
    return (window.TimerOpt && window.TimerOpt.get) ? window.TimerOpt.get() : null;
  }

  /* ---------------- 读取配置（首屏同步版：不等 timer.js，直接读 LS） --------
     首屏就要把颜色写上，否则会闪一下默认色。timer.js 的 opt 还没就绪时
     也能读，因为两者是同一个 localStorage 键、personal 是其中的独立字段。 */
  function readCfg() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS_OPT) || '{}'); } catch (e) { raw = {}; }
    var p = (raw && raw.personal && typeof raw.personal === 'object') ? raw.personal : {};
    var out = {};
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      out[k] = (p[k] !== undefined && p[k] !== null) ? p[k] : DEFAULTS[k];
    }
    /* 逐项消毒：坏值一律回落默认，避免一个脏字段让整页变样 */
    ['accent', 'timeColor', 'stageBg', 'stageBg2', 'ready', 'warn', 'danger'].forEach(function (k) {
      if (!isHex(out[k])) out[k] = '';
    });
    out.timeWeight = clamp(out.timeWeight, 100, 900, 800);
    out.timeTrack = clamp(out.timeTrack, -2, 12, 2);
    out.timeFont = (out.timeFont === 'sans') ? 'sans' : 'mono';
    out.uiScale = clamp(out.uiScale, 0.85, 1.4, 1);
    out.density = ({ compact: 1, normal: 1, loose: 1 }[out.density]) ? out.density : 'normal';
    out.hideNet = !!out.hideNet;
    out.reduceMotion = !!out.reduceMotion;
    return out;
  }

  var cfg = readCfg();
  var host = null;

  /* ---------------- 应用到页面 ---------------- */
  function apply() {
    var r = document.documentElement;
    var b = document.body;

    /* 颜色：空 = 自动 → 写空串让 CSS 回落令牌（setProperty('') 即移除内联值） */
    setVar(r, '--tm-accent', cfg.accent);
    setVar(r, '--tm-time-color', cfg.timeColor);
    setVar(r, '--tm-stage-bg', cfg.stageBg);
    /* 渐变第二色：未填时跟随底色，视觉即纯色 */
    setVar(r, '--tm-stage-bg2', cfg.stageBg2 || cfg.stageBg || '');
    setVar(r, '--tm-state-ready', cfg.ready);
    setVar(r, '--tm-state-warn', cfg.warn);
    setVar(r, '--tm-state-danger', cfg.danger);

    /* 字体 */
    r.style.setProperty('--tm-time-weight', String(Math.round(cfg.timeWeight)));
    r.style.setProperty('--tm-time-track', cfg.timeTrack + 'px');
    r.style.setProperty('--tm-time-font', cfg.timeFont === 'sans' ? 'var(--font-sans)' : 'var(--font-mono)');
    r.style.setProperty('--tm-ui-scale', String(cfg.uiScale));

    /* 密度：主区间距 + 舞台最小高度（手机单屏下舞台由 flex 接管，仍受 min-height 影响） */
    var d = cfg.density;
    r.style.setProperty('--tm-gap', d === 'compact' ? '8px' : (d === 'loose' ? '20px' : '14px'));
    r.style.setProperty('--tm-stage-minh', d === 'compact' ? '160px' : (d === 'loose' ? '300px' : '220px'));

    if (b) {
      b.classList.toggle('tm-p-hide-net', !!cfg.hideNet);
      b.classList.toggle('tm-p-reduce-motion', !!cfg.reduceMotion);
    }
  }
  function setVar(r, name, val) {
    if (isHex(val)) r.style.setProperty(name, val);
    else r.style.removeProperty(name);   /* 自动：交回 CSS 的 var(--token) 回落 */
  }

  /* ---------------- 持久化 ---------------- */
  function persist() {
    var o = optObj();
    if (!o) return false;                 /* timer.js 还没起来：只改内存，不落盘 */
    o.personal = cfg;
    if (window.TimerOpt.save) window.TimerOpt.save();
    return true;
  }
  function setField(k, v) {
    cfg[k] = v;
    apply();
    persist();
  }

  /* ---------------- 面板 ---------------- */
  /* 取色器行：色块 + 名称 + 「自动」复位 */
  function colorRow(list) {
    var h = '';
    list.forEach(function (it) {
      var v = cfg[it.key];
      h += '<div class="tm-p-row">' +
        '<label class="tm-p-row__k" for="tm-p-' + it.key + '">' + esc(it.name) + '</label>' +
        '<div class="tm-p-row__v">' +
          '<input class="tm-p-color" type="color" id="tm-p-' + it.key + '" data-pk="' + it.key + '"' +
            ' value="' + esc(isHex(v) ? v : it.fallback) + '" aria-label="' + esc(it.name) + '">' +
          '<button type="button" class="btn btn--sm btn--ghost tm-p-auto" data-pauto="' + it.key + '"' +
            (isHex(v) ? '' : ' disabled') + '>自动</button>' +
        '</div>' +
      '</div>';
    });
    return h;
  }
  function segHTML(name, key, opts) {
    var h = '<div class="tm-p-row"><span class="tm-p-row__k">' + esc(name) + '</span>' +
      '<div class="tm-p-row__v"><div class="seg tm-p-seg" data-pseg="' + key + '" role="group" aria-label="' + esc(name) + '">';
    opts.forEach(function (o) {
      h += '<button type="button" class="seg__btn" data-pv="' + esc(String(o.v)) + '">' + esc(o.t) + '</button>';
    });
    return h + '</div></div></div>';
  }

  function buildPanel() {
    var presets = '';
    PRESETS.forEach(function (p) {
      presets += '<button type="button" class="tm-p-preset" data-ppreset="' + esc(p.id) + '"' +
        ' style="--sw1:' + p.sw[0] + ';--sw2:' + p.sw[1] + ';--sw3:' + p.sw[2] + '">' +
        '<span class="tm-p-preset__sw" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="tm-p-preset__nm">' + esc(p.name) + '</span>' +
      '</button>';
    });

    host.innerHTML =
      '<div class="tm-p">' +
        '<div class="tm-p-grp">' +
          '<div class="tm-p-grp__hd"><span class="tm-p-grp__t">配色预设</span>' +
            '<span class="tm-p-grp__h">一键换风格，也可在下方便宜微调每一项</span></div>' +
          '<div class="tm-p-presets" role="group" aria-label="配色预设">' + presets + '</div>' +
        '</div>' +

        '<div class="tm-p-grp">' +
          '<div class="tm-p-grp__hd"><span class="tm-p-grp__t">颜色微调</span>' +
            '<span class="tm-p-grp__h">「自动」= 跟随站点明暗主题</span></div>' +
          colorRow([
            { key: 'accent',    name: '强调色',   fallback: '#5B8DEF' },
            { key: 'timeColor', name: '计时数字', fallback: '#e8ecf5' },
            { key: 'stageBg',   name: '舞台底色', fallback: '#151a24' },
            { key: 'stageBg2',  name: '渐变第二色', fallback: '#1d2431' },
            { key: 'ready',     name: '就绪',     fallback: '#30a46c' },
            { key: 'warn',      name: '观察告警', fallback: '#e0a020' },
            { key: 'danger',    name: '超时/DNF', fallback: '#e5484d' }
          ]) +
        '</div>' +

        '<div class="tm-p-grp">' +
          '<div class="tm-p-grp__hd"><span class="tm-p-grp__t">字体</span>' +
            '<span class="tm-p-grp__h">打乱公式 / 计时数字的大小用上方滑块</span></div>' +
          segHTML('数字字重', 'timeWeight', [
            { v: 300, t: '细' }, { v: 400, t: '常规' }, { v: 500, t: '中等' }, { v: 700, t: '粗' }, { v: 800, t: '特粗' }
          ]) +
          segHTML('数字字距', 'timeTrack', [
            { v: 0, t: '紧凑' }, { v: 2, t: '标准' }, { v: 5, t: '宽松' }
          ]) +
          segHTML('数字字体', 'timeFont', [
            { v: 'mono', t: '等宽' }, { v: 'sans', t: '无衬线' }
          ]) +
          '<div class="tm-p-row">' +
            '<label class="tm-p-row__k" for="tm-p-ui">界面文字</label>' +
            '<div class="tm-p-row__v">' +
              '<input class="tm-font-field__range" type="range" id="tm-p-ui" data-pscale="uiScale"' +
                ' min="0.85" max="1.4" step="0.05" value="' + cfg.uiScale + '">' +
              '<span class="tm-font-field__v" id="tm-p-ui-val">' + Math.round(cfg.uiScale * 100) + '%</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="tm-p-grp">' +
          '<div class="tm-p-grp__hd"><span class="tm-p-grp__t">显示与密度</span></div>' +
          segHTML('布局密度', 'density', [
            { v: 'compact', t: '紧凑' }, { v: 'normal', t: '标准' }, { v: 'loose', t: '宽松' }
          ]) +
          '<div class="tm-p-row"><span class="tm-p-row__k">打乱展开图</span><div class="tm-p-row__v">' +
            '<label class="tm-check"><input type="checkbox" id="tm-p-net" data-pcheck="hideNet"' +
            (cfg.hideNet ? ' checked' : '') + '><span>隐藏（省出舞台空间）</span></label></div></div>' +
          '<div class="tm-p-row"><span class="tm-p-row__k">动效</span><div class="tm-p-row__v">' +
            '<label class="tm-check"><input type="checkbox" id="tm-p-motion" data-pcheck="reduceMotion"' +
            (cfg.reduceMotion ? ' checked' : '') + '><span>减少动效（低性能设备更跟手）</span></label></div></div>' +
        '</div>' +

        '<div class="tm-p-grp">' +
          '<div class="tm-p-grp__hd"><span class="tm-p-grp__t">配置</span>' +
            '<span class="tm-p-grp__h">随成绩一起云同步，换设备自动带走</span></div>' +
          '<div class="tm-settings-row">' +
            '<button class="btn btn--sm btn--secondary" id="tm-p-export" type="button">导出配置</button>' +
            '<button class="btn btn--sm btn--secondary" id="tm-p-import" type="button">导入配置</button>' +
            '<button class="btn btn--sm btn--ghost" id="tm-p-reset" type="button">恢复默认</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    bindPanel();
    syncPanel();
  }

  function bindPanel() {
    host.addEventListener('click', function (e) {
      var pre = e.target.closest ? e.target.closest('[data-ppreset]') : null;
      if (pre) { applyPreset(pre.getAttribute('data-ppreset')); return; }

      var seg = e.target.closest ? e.target.closest('[data-pseg] .seg__btn') : null;
      if (seg) {
        var box = seg.parentNode;
        var key = box.getAttribute('data-pseg');
        var raw = seg.getAttribute('data-pv');
        var val = (key === 'timeWeight' || key === 'timeTrack') ? Number(raw) : raw;
        setField(key, val);
        syncPanel();
        return;
      }

      var au = e.target.closest ? e.target.closest('[data-pauto]') : null;
      if (au) {
        setField(au.getAttribute('data-pauto'), '');
        buildPanel();     /* 复位后要刷新取色器色块与「自动」按钮禁用态 */
        return;
      }

      if (e.target.closest && e.target.closest('#tm-p-reset')) { reset(); return; }
      if (e.target.closest && e.target.closest('#tm-p-export')) { exportCfg(); return; }
      if (e.target.closest && e.target.closest('#tm-p-import')) { pickImport(); return; }
    });

    host.addEventListener('input', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-pk')) {
        setField(t.getAttribute('data-pk'), t.value);
        var au = t.parentNode.querySelector('[data-pauto]');
        if (au) au.disabled = false;
        return;
      }
      if (t && t.getAttribute && t.getAttribute('data-pscale')) {
        var v = clamp(t.value, 0.85, 1.4, 1);
        cfg.uiScale = v;
        var lab = document.getElementById('tm-p-ui-val');
        if (lab) lab.textContent = Math.round(v * 100) + '%';
        apply();
        persist();
        return;
      }
      if (t && t.getAttribute && t.getAttribute('data-pcheck')) {
        setField(t.getAttribute('data-pcheck'), !!t.checked);
      }
    });

    host.addEventListener('change', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-pcheck')) {
        setField(t.getAttribute('data-pcheck'), !!t.checked);
      }
    });
  }

  /* 把面板控件同步成当前配置（打开设置 / 导入 / 复位后都要调） */
  function syncPanel() {
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('[data-pseg]'), function (box) {
      var key = box.getAttribute('data-pseg');
      var cur = String(cfg[key]);
      Array.prototype.forEach.call(box.children, function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-pv') === cur);
      });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-pk]'), function (inp) {
      var k = inp.getAttribute('data-pk');
      var au = inp.parentNode.querySelector('[data-pauto]');
      if (au) au.disabled = !isHex(cfg[k]);
    });
    var ui = document.getElementById('tm-p-ui');
    if (ui) ui.value = String(cfg.uiScale);
    var lab = document.getElementById('tm-p-ui-val');
    if (lab) lab.textContent = Math.round(cfg.uiScale * 100) + '%';
    var net = document.getElementById('tm-p-net');
    if (net) net.checked = !!cfg.hideNet;
    var mo = document.getElementById('tm-p-motion');
    if (mo) mo.checked = !!cfg.reduceMotion;
    /* 预设高亮：与当前颜色完全一致才亮（自定义过就不亮，避免误导） */
    Array.prototype.forEach.call(host.querySelectorAll('[data-ppreset]'), function (b) {
      b.classList.toggle('is-active', matchPreset(b.getAttribute('data-ppreset')));
    });
  }

  function matchPreset(id) {
    var p = null;
    PRESETS.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return false;
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      var want = (p.cfg[k] !== undefined) ? p.cfg[k] : DEFAULTS[k];
      if (String(cfg[k]) !== String(want)) return false;
    }
    return true;
  }

  function applyPreset(id) {
    var p = null;
    PRESETS.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      cfg[k] = (p.cfg[k] !== undefined) ? p.cfg[k] : DEFAULTS[k];
    }
    apply();
    persist();
    buildPanel();     /* 取色器色块要跟着变 */
  }

  function reset() {
    for (var k in DEFAULTS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) cfg[k] = DEFAULTS[k];
    }
    apply();
    persist();
    buildPanel();
  }

  /* ---------------- 导入 / 导出 ---------------- */
  function exportCfg() {
    var o = optObj();
    var payload = {
      app: 'fto-timer', kind: 'timer-personal', version: 1,
      at: new Date().toISOString(),
      personal: cfg,
      /* 顺带带上两个字号滑块，换设备时一并还原 */
      scales: {
        scramble: (o && typeof o.scrambleScale === 'number') ? o.scrambleScale : 1,
        time: (o && typeof o.timeScale === 'number') ? o.timeScale : 1
      }
    };
    var txt = JSON.stringify(payload, null, 2);
    var a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(txt);
    a.download = 'timer-personal.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function pickImport() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        var ok = importText(String(fr.result || ''));
        alert(ok ? '个性化配置已导入。' : '这个文件不是本站导出的个性化配置，未做任何改动。');
      };
      fr.readAsText(f);
    });
    inp.click();
  }

  function importText(txt) {
    var d = null;
    try { d = JSON.parse(txt); } catch (e) { return false; }
    if (!d || d.kind !== 'timer-personal' || !d.personal) return false;
    var p = d.personal;
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      if (p[k] !== undefined && p[k] !== null) cfg[k] = p[k];
    }
    /* 重新消毒一遍再落地，导入的文件可能被手改坏 */
    cfg = sanitize(cfg);
    apply();
    persist();

    /* 字号滑块：写回 opt 并让 timer.js 重新渲染（它负责那两个变量） */
    var o = optObj();
    if (o && d.scales) {
      if (typeof d.scales.scramble === 'number') o.scrambleScale = clamp(d.scales.scramble, 0.8, 2.5, 1);
      if (typeof d.scales.time === 'number') o.timeScale = clamp(d.scales.time, 0.8, 2.5, 1);
      if (window.TimerOpt.save) window.TimerOpt.save();
      if (window.TimerOpt.applyFontScale) window.TimerOpt.applyFontScale();
      syncScaleInputs();
    }
    buildPanel();
    return true;
  }

  /* 把两个字号滑块的 UI 同步到 opt 当前值（导入后要刷新） */
  function syncScaleInputs() {
    var o = optObj();
    if (!o) return;
    var a = document.getElementById('tm-font-scramble');
    var b = document.getElementById('tm-font-time');
    if (a) a.value = String(o.scrambleScale);
    if (b) b.value = String(o.timeScale);
  }

  function sanitize(p) {
    var out = {};
    for (var k in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
      out[k] = (p[k] !== undefined && p[k] !== null) ? p[k] : DEFAULTS[k];
    }
    ['accent', 'timeColor', 'stageBg', 'stageBg2', 'ready', 'warn', 'danger'].forEach(function (k) {
      if (!isHex(out[k])) out[k] = '';
    });
    out.timeWeight = clamp(out.timeWeight, 100, 900, 800);
    out.timeTrack = clamp(out.timeTrack, -2, 12, 2);
    out.timeFont = (out.timeFont === 'sans') ? 'sans' : 'mono';
    out.uiScale = clamp(out.uiScale, 0.85, 1.4, 1);
    out.density = ({ compact: 1, normal: 1, loose: 1 }[out.density]) ? out.density : 'normal';
    out.hideNet = !!out.hideNet;
    out.reduceMotion = !!out.reduceMotion;
    return out;
  }

  /* ---------------- 启动 ---------------- */
  function mount() {
    host = document.getElementById('tm-personal-host');
    if (!host) return;
    buildPanel();
  }

  /* 首屏立即应用（不等 DOMContentLoaded，避免闪一下默认色） */
  apply();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* 跨标签页同步：另一个标签改了设置，这边跟着变 */
  window.addEventListener('storage', function (e) {
    if (e.key !== LS_OPT) return;
    cfg = readCfg();
    apply();
    if (host) { buildPanel(); }
  });

  window.TimerPersonal = {
    get: function () { return cfg; },
    apply: apply,
    sync: function () { if (host) syncPanel(); },
    reset: reset,
    importText: importText,
    presets: PRESETS
  };
})();
