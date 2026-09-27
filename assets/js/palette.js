/* =========================================================
   全站配色方案引擎 · palette.js
   ---------------------------------------------------------
   与 theme.js 的关系：theme.js 负责「明度」(auto/light/dark → data-theme)，
   本文件负责「配色方案」(→ data-palette)，两者正交、互不覆盖。
   CSS 定义在 assets/css/palettes.css（方案色）+ palette-ui.css（面板外观）。

   1) 首屏同步：必须在 <head> 内同步引入（不要 defer），
      在 <body> 绘制前把 data-palette 写到 <html> 上，避免闪一下默认配色。
   2) 持久化：localStorage['mf_palette']；跨标签页通过 storage 事件同步。
   3) 入口：侧栏/顶部条的主题按钮 → 打开配色面板（不再是 auto→light→dark 循环，
      明暗切换面板里有第三个分段按钮）。
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'mf_palette';
  var CSS_UI = '/assets/css/palette-ui.css';

  /* ---------------- 方案清单（面板数据，palettes.css 的注释要同步） ---------------- */
  var LIST = [
    { id: '',         name: '曜石蓝',     desc: '深色 · 夜间训练',         pa: '#5B8DEF', pb: '#A78BFA', pc: '#0B0D14', mode: 'dark'  },
    /* pa/pb/pc = 主色 / 辅色 / 底色，都取该方案推荐明度下真实存在的 token 值 */
    { id: 'classroom',name: '课堂白',     desc: '浅色 · 白天 / 教室电脑',   pa: '#2F57AE', pb: '#0F7A38', pc: '#F2F5FA', mode: 'light' },
    { id: 'inknight', name: '暖夜墨',     desc: '深色 · 低蓝光护眼',       pa: '#E09A52', pb: '#C9AEFF', pc: '#131009', mode: 'dark'  },
    { id: 'projector',name: '投屏高对比', desc: '浅色 · 投影 / 电视大屏',   pa: '#0032A0', pb: '#B0001F', pc: '#FFFFFF', mode: 'light' },
    { id: 'paper',    name: '纸感米黄',   desc: '浅色 · 出卷 / 打印资料',   pa: '#1F6B4F', pb: '#8A6100', pc: '#F7F3E9', mode: 'light' },
    { id: 'classic',  name: '经典六色',   desc: '深色 · 品牌 / 招生展示',   pa: '#3B8CE8', pb: '#FFD500', pc: '#0D1014', mode: 'dark'  }
  ];
  var IDS = (function () {
    var a = {};
    for (var i = 0; i < LIST.length; i++) a[LIST[i].id] = LIST[i];
    return a;
  })();

  var root = document.documentElement;
  var panel = null;
  var mask = null;

  function readPref() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  function apply(v) {
    if (v && IDS[v]) {
      root.setAttribute('data-palette', v);
    } else {
      root.removeAttribute('data-palette'); /* 未选 = 默认配色（曜石蓝 / 课堂白） */
      v = '';
    }
    return v;
  }

  /* ---------------- 首屏同步应用（防 FOUC） ---------------- */
  apply(readPref());

  /* ---------------- 面板 ---------------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function swatchHTML(it) {
    return '<i></i><i></i><i></i>';
  }

  function buildPanel() {
    var cards = '';
    for (var i = 0; i < LIST.length; i++) {
      var it = LIST[i];
      cards += '<button type="button" class="pal-card" data-pal="' + esc(it.id) + '"' +
        ' role="radio" aria-checked="false" style="--pa:' + it.pa + ';--pb:' + it.pb + ';--pc:' + it.pc + '">' +
        '<span class="pal-card__sw" aria-hidden="true">' + swatchHTML(it) + '</span>' +
        '<span class="pal-card__nm">' + esc(it.name) + '</span>' +
        '<span class="pal-card__ds">' + esc(it.desc) + '</span>' +
        '</button>';
    }

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="pal-mask" hidden></div>' +
      /* 必须自带 hidden：.pal-panel 有显式盒模型样式，光靠 UA 的 [hidden]
         规则的优先级压不住它，不加这个属性面板会首屏就挂在右上角。 */
      '<div class="pal-panel" id="palPanel" role="dialog" aria-modal="false" aria-label="配色方案" tabindex="-1" hidden>' +
        '<div class="pal-panel__hd">' +
          '<span class="pal-panel__title">配色方案</span>' +
          '<button type="button" class="pal-panel__x" data-pal-close aria-label="关闭配色面板" title="关闭">✕</button>' +
        '</div>' +
        '<div class="pal-panel__bd">' +
          '<div class="pal-sec">' +
            '<div class="pal-sec__lab">配色</div>' +
            '<div class="pal-grid" role="radiogroup" aria-label="配色方案">' + cards + '</div>' +
          '</div>' +
          '<div class="pal-sec">' +
            '<div class="pal-sec__lab">明暗</div>' +
            '<div class="pal-seg" role="group" aria-label="明暗">' +
              '<button type="button" class="pal-seg__b" data-pal-mode="auto">跟随系统</button>' +
              '<button type="button" class="pal-seg__b" data-pal-mode="light">浅色</button>' +
              '<button type="button" class="pal-seg__b" data-pal-mode="dark">深色</button>' +
            '</div>' +
          '</div>' +
          '<p class="pal-tip">配色与明暗各自独立保存，手机 / 平板 / 电脑同一账号同一浏览器内保持同步。' +
          '「投影」场景建议用「投屏高对比」，晚上给孩子练建议「暖夜墨」。</p>' +
        '</div>' +
      '</div>';

    mask = wrap.firstChild;
    panel = wrap.lastChild;
    document.body.appendChild(mask);
    document.body.appendChild(panel);

    /* —— 事件 —— */
    mask.addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-pal-close]')) { close(); return; }

      var card = e.target.closest('.pal-card');
      if (card) {
        pick(card.getAttribute('data-pal') || '');
        return;
      }
      var mb = e.target.closest('[data-pal-mode]');
      if (mb) {
        setMode(mb.getAttribute('data-pal-mode'));
        syncUI();
      }
    });

    /* 打开面板：拦截主题按钮（theme.js 给 .nav-theme-btn 绑了明度循环、
       site-nav.js 给 .nav-theme-item 绑了 Theme.attach，
       这里在捕获阶段掐断，改由面板统一处理） */
    document.addEventListener('click', function (e) {
      var hit = e.target.closest ? e.target.closest('.nav-theme-btn, .nav-theme-item') : null;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      closeDrawerIfOpen();
      open();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) close();
    });

    syncUI();
  }

  /* ---------------- 状态读写 ---------------- */
  function pick(id) {
    id = apply(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch (e) {}
    /* 选配色时顺带切到该配色推荐的明暗 */
    var meta = IDS[id];
    if (meta && meta.mode && window.Theme && window.Theme.get && window.Theme.get() !== meta.mode) {
      window.Theme.set(meta.mode);
    }
    flashAnim();
    syncUI();
  }

  function setMode(mode) {
    if (window.Theme && window.Theme.set) window.Theme.set(mode);
    else {
      try { localStorage.setItem('theme', mode); } catch (e) {}
      window.location.reload();
    }
  }

  function syncUI() {
    if (!panel) return;
    var cur = readPref();
    var cards = panel.querySelectorAll('.pal-card');
    for (var i = 0; i < cards.length; i++) {
      var on = (cards[i].getAttribute('data-pal') || '') === cur;
      cards[i].classList.toggle('is-active', on);
      cards[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    var mode = (window.Theme && window.Theme.get) ? window.Theme.get() : 'auto';
    var mbs = panel.querySelectorAll('[data-pal-mode]');
    for (var j = 0; j < mbs.length; j++) {
      var on2 = mbs[j].getAttribute('data-pal-mode') === mode;
      mbs[j].classList.toggle('is-active', on2);
      mbs[j].setAttribute('aria-pressed', on2 ? 'true' : 'false');
    }
    relabel();
  }

  /* 窄屏抽屉里点「配色」时也把抽屉收起来，否则面板被抽屉压在下面。
     与 site-nav.js 的 setDrawer(false) 三处状态保持一致。 */
  function closeDrawerIfOpen() {
    var links = document.getElementById('navLinks');
    if (links && links.classList.contains('open')) {
      links.classList.remove('open');
      document.body.classList.remove('nav-drawer-open');
      var tb = document.getElementById('navToggle');
      if (tb) {
        tb.classList.remove('open');
        tb.setAttribute('aria-expanded', 'false');
        tb.setAttribute('aria-label', '打开菜单');
      }
    }
  }

  /* 手机抽屉里的 .nav-theme-item 也当「打开配色」用（原来只在桌面显示图标） */
  function relabel() {
    var items = document.querySelectorAll('.nav-theme-item');
    for (var i = 0; i < items.length; i++) {
      items[i].textContent = '配色';
      items[i].setAttribute('title', '配色方案（点击打开）');
    }
    /* 这里必须幂等：syncUI() → relabel()，而 syncUI 会被选中、切明暗、
       跨标签 storage、Theme.onChange 反复调用。原来写成
       title = title + ' · …' 会无限拼接，标题越滚越长。 */
    var btns = document.querySelectorAll('.nav-theme-btn');
    for (var k = 0; k < btns.length; k++) {
      var t = btns[k].getAttribute('title') || '配色方案';
      if (t.indexOf('打开配色方案') < 0) {
        btns[k].setAttribute('title', t + '（打开配色方案）');
        btns[k].setAttribute('aria-label', t + '（打开配色方案）');
      }
    }
  }

  function open() {
    if (!panel) return;
    syncUI();
    panel.hidden = false;
    mask.hidden = false;
    /* 下一帧再加 is-open，保证 transition 生效 */
    requestAnimationFrame(function () {
      panel.classList.add('is-open');
      mask.classList.add('is-open');
    });
    try { panel.focus(); } catch (e) {}
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    mask.classList.remove('is-open');
    panel.hidden = true;
    mask.hidden = true;
  }

  /* 切换配色的瞬间给个 240ms 底色渐变 */
  var animTimer = null;
  function flashAnim() {
    root.classList.add('pal-anim');
    clearTimeout(animTimer);
    animTimer = setTimeout(function () { root.classList.remove('pal-anim'); }, 260);
  }

  /* ---------------- 兜底注入面板样式（没有侧栏的独立页也能用） ---------------- */
  function injectUI() {
    if (document.querySelector('link[data-palette-ui]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS_UI;
    l.setAttribute('data-palette-ui', '');
    document.head.appendChild(l);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    injectUI();
    if (!document.body) return;
    buildPanel();
    if (window.Theme && window.Theme.onChange) {
      window.Theme.onChange(function () { syncUI(); });
    }
    relabel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ---------------- 跨标签页同步 ---------------- */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    apply(readPref());
    syncUI();
  });

  /* 给外部脚本一个只读入口（便于验证脚本 / 其它页复用） */
  window.Palette = {
    list: LIST,
    get: function () { return readPref(); },
    set: function (id) { pick(id); },
    open: open,
    close: close,
    panel: function () { return panel; }
  };
})();
