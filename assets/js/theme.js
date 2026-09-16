/* =========================================================
   全站主题引擎 · theme.js
   ---------------------------------------------------------
   职责：
   1) 首屏同步应用主题 —— 本文件必须放在 <head> 内以「同步脚本」方式
      引入（不要加 defer / async）。同步执行能在浏览器绘制 <body> 之前
      就把 data-theme 写好，避免浅色用户进站时先闪一下深色（FOUC）。
   2) 三态偏好：auto（跟随系统）/ light（浅色）/ dark（深色）。
      存储键沿用历史值 localStorage['theme']，与既有 light/dark 数据兼容。
   3) 监听系统主题变化，pref=auto 时实时跟随；跨标签页同步。
   4) 向导航栏注入直角风格切换按钮（无需逐页改 HTML）。
      页面内已有的主题按钮（如 CFOP 的 #themeBtn）通过 Theme.attach()
      复用同一份状态，不再各写一套。
   ---------------------------------------------------------
   颜色仍然全部由 tokens.css 的 :root / [data-theme="light"] 承担，
   本文件只负责「决定用哪套」和「把决定持久化」。
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'theme';
  var PREFS = ['auto', 'light', 'dark'];

  /* ---------------- 偏好读取 ---------------- */
  function readPref() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'auto' || v === 'light' || v === 'dark') return v;
    } catch (e) { /* 隐私模式下 localStorage 可能不可用 */ }
    return 'auto';
  }

  function systemDark() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return true; }
  }

  function resolve(p) {
    return p === 'auto' ? (systemDark() ? 'dark' : 'light') : p;
  }

  var pref = readPref();
  var listeners = [];

  /* ---------------- 应用主题（首屏同步调用） ---------------- */
  function paint() {
    var root = document.documentElement;
    var mode = resolve(pref);
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-pref', pref);
    /* 让原生控件（滚动条 / 表单 / 日期选择器）跟随当前主题 */
    try { root.style.colorScheme = mode; } catch (e) {}
    return mode;
  }

  function emit() {
    var mode = resolve(pref);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](mode, pref); } catch (e) {}
    }
  }

  /* 立即执行 —— 这是防闪烁的关键，别挪到 DOMContentLoaded 里 */
  paint();

  /* ---------------- 按钮图标与文案 ---------------- */
  var ICONS = {
    auto: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
          '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
          '<path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
           '<circle cx="12" cy="12" r="4.3" fill="currentColor"/>' +
           '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
           '<path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3' +
           'M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/></g></svg>',
    dark: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
          '<path d="M20.6 14.7A8.7 8.7 0 0 1 9.3 3.4a8.7 8.7 0 1 0 11.3 11.3z" fill="currentColor"/></svg>'
  };
  var LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

  /* ---------------- 同步所有按钮外观 ---------------- */
  function syncButtons() {
    var mode = resolve(pref);
    var btns = document.querySelectorAll('.nav-theme-btn, [data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.classList.contains('nav-theme-btn')) {
        b.innerHTML = ICONS[pref];
        b.setAttribute('data-pref', pref);
        b.setAttribute('title', '主题：' + LABEL[pref] + '（点击切换）');
        b.setAttribute('aria-label', '主题：' + LABEL[pref] + '，点击切换');
      } else {
        /* 页面内旧按钮：沿用「图标 + 文字」的旧观感，避免既有页面布局跳动 */
        b.textContent = mode === 'light' ? '🌙 深色' : '☀ 浅色';
        b.setAttribute('aria-label', '切换到' + (mode === 'light' ? '深色' : '浅色') + '主题');
      }
    }
  }

  /* ---------------- 对外 API ---------------- */
  var Theme = {
    storageKey: KEY,

    /** 当前偏好：'auto' | 'light' | 'dark' */
    get: function () { return pref; },

    /** 当前实际生效主题：'light' | 'dark' */
    mode: function () { return resolve(pref); },

    /** 设置偏好 */
    set: function (p) {
      if (PREFS.indexOf(p) < 0) p = 'auto';
      pref = p;
      try { localStorage.setItem(KEY, p); } catch (e) {}
      paint();
      syncButtons();
      emit();
    },

    /** 循环：auto → light → dark → auto（导航按钮的点击行为） */
    next: function () {
      Theme.set(PREFS[(PREFS.indexOf(pref) + 1) % PREFS.length]);
    },

    /** 严格在 light / dark 之间翻转（页面内二态按钮的点击行为） */
    toggle: function () {
      Theme.set(resolve(pref) === 'dark' ? 'light' : 'dark');
    },

    /** 把页面内已有按钮接上引擎（统一状态，不重复实现） */
    attach: function (el) {
      if (!el || el.__themeBound) return;
      el.__themeBound = true;
      if (!el.hasAttribute('data-theme-toggle')) el.setAttribute('data-theme-toggle', '');
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        Theme.toggle();
      });
      syncButtons();
    },

    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }
  };

  /* ---------------- 导航栏切换按钮 ---------------- */
  function makeButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nav-theme-btn';
    b.id = 'siteThemeBtn';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      Theme.next();
    });
    syncButtons();
    return b;
  }

  function injectNavButton() {
    var inner = document.querySelector('#siteNav .nav-inner');
    if (!inner || inner.querySelector('.nav-theme-btn')) return !!(inner && inner.querySelector('.nav-theme-btn'));
    var btn = makeButton();
    inner.appendChild(btn);
    syncButtons();
    return true;
  }

  function boot() {
    if (injectNavButton()) return;
    if (!('MutationObserver' in window)) return;
    /* 导航由 site-nav.js 注入，注入时机取决于脚本加载顺序，
       用 MutationObserver 等它出现，最多等 5 秒。 */
    var mo = new MutationObserver(function () {
      if (injectNavButton()) mo.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () {
      injectNavButton();
      mo.disconnect();
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ---------------- 系统主题跟随 ---------------- */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () {
      if (pref !== 'auto') return;
      paint();
      syncButtons();
      emit();
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  /* ---------------- 多标签页同步 ---------------- */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    pref = readPref();
    paint();
    syncButtons();
    emit();
  });

  window.Theme = Theme;
})();
