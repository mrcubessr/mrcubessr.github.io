/* ===== 全站统一导航：数据驱动注入 + 静态导航兼容 ===== */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     菜单数据（全站唯一来源）
     增删 / 排序菜单只改这里，页面无需任何改动。
     --------------------------------------------------------- */
  var NAV_DATA = [
    { id: 'home', label: '首页', href: '/' },
    { id: 'tutorial', label: '教程', children: [
      { id: '3x3', label: '三阶', href: '/tools/3x3/' },
      { label: '二阶', soon: true },
      { label: '金字塔', soon: true },
      { id: '3bld', label: '三盲', href: '/tools/3bld/' },
      { id: 'fto', label: 'FTO', href: '/fto' }
    ]},
    { id: 'cfop', label: 'CFOP公式库', href: '/tools/cfop/' },
    { id: 'tools', label: '个人训练工具', children: [
      { id: 'timer',            label: '计时器',           href: '/tools/timer' },
      { id: 'invert',           label: '逆序转换',         href: '/tools/invert' },
      { id: 'scramble-trainer', label: '打乱公式训练',     href: '/tools/scramble-trainer' },
      { id: 'srs',              label: '记忆卡片 SRS',     href: '/tools/srs/' },
      { id: '3x3teach',         label: '三阶魔方教学',     href: '/tools/3x3teach' },
      { id: 'class-teach',      label: '魔方课堂教学系统', href: '/tools/class-teach' }
    ]},
    { id: 'links', label: '外链', children: [
      { id: 'nav', label: '工具导航', href: '/tools/nav' }
    ]}
  ];

  /* 目录名与菜单 id 不一致时的别名表。
     三盲相关工具页统一归属到「教程 → 三盲」，打开任一工具页时高亮三盲。 */
  var NAV_ALIAS = {
    'bld-trainer': '3bld',
    '3bld-home': '3bld',
    '3bld-assoc': '3bld',
    'scramble-uf': '3bld',
    'scramble-ur': '3bld',
    'bldtrainer': '3bld',
    'corner-trainer': '3bld',
    'edge-trainer': '3bld',
    'edge-printout': '3bld',
    'kmap': '3bld',
    'practice': '3bld',
    'bldscramble': '3bld',
    '2x2': '3bld'
  };

  /* ---------------------------------------------------------
     渲染导航 HTML
     结构与类名被 site-nav.css 依赖，请勿改动。
     --------------------------------------------------------- */
  function buildNav() {
    var h = '<nav class="site-nav" id="siteNav" aria-label="主导航">';
    h += '<div class="nav-inner">';
    h += '<a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>';
    h += '<button class="nav-toggle-btn" id="navToggle" type="button" aria-label="打开菜单" aria-expanded="false" aria-controls="navLinks">';
    h += '<span></span><span></span><span></span>';
    h += '</button>';
    h += '<div class="nav-links" id="navLinks">';

    for (var i = 0; i < NAV_DATA.length; i++) {
      var item = NAV_DATA[i];

      /* 无 children：普通链接 */
      if (!item.children) {
        h += '<a href="' + item.href + '" class="nav-link" data-nav="' + item.id + '">' + item.label + '</a>';
        continue;
      }

      /* 有 children：下拉 */
      h += '<div class="nav-drop">';
      h += '<span class="nav-link nav-drop-toggle" data-nav="' + item.id + '" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">' + item.label + ' <span class="caret">▾</span></span>';
      h += '<div class="nav-menu">';
      for (var j = 0; j < item.children.length; j++) {
        var child = item.children[j];
        if (child.soon) {
          /* 必须是 <a>：CSS 选择器 .nav-menu a 依赖 */
          h += '<a class="nav-soon" title="即将上线">' + child.label + '</a>';
        } else {
          h += '<a href="' + child.href + '" data-nav="' + child.id + '">' + child.label + '</a>';
        }
      }
      h += '</div></div>';
    }

    /* 手机端抽屉里的「主题」项：桌面端由导航右上的图标按钮承担，此项在桌面隐藏。
       文案由 theme.js 的 syncButtons() 写入，显示的是「点一下会切到哪个模式」。 */
    h += '<button type="button" class="nav-link nav-theme-item" id="navThemeItem" data-theme-toggle></button>';

    h += '</div></div></nav>';
    return h;
  }

  /* ---------------------------------------------------------
     当前页判定：body[data-nav] > URL 兜底 > 别名表
     --------------------------------------------------------- */
  function resolveCurrent() {
    var fromBody = document.body.getAttribute('data-nav');
    if (fromBody) return NAV_ALIAS[fromBody] || fromBody;

    var path = window.location.pathname.replace(/\/+$/, '');
    var seg = path.split('/').filter(function (s) { return !!s; });

    if (seg.length === 0) return 'home';
    if (seg[0] === 'fto') return 'fto';        /* 修复 /fto/tcp 等页无高亮 */
    if (seg[0] === 'tools') {
      var id = seg[1] || '';
      if (!id) return null;
      return NAV_ALIAS[id] || id;
    }
    return null;
  }

  /* ---------------------------------------------------------
     侧栏分组的展开状态记忆
     侧栏模式下二级菜单默认收起，只有当前页所在的分组自动展开。
     用户手动点开的分组要记住，否则每次换页都被打回默认态。
     存 localStorage（键带版本号，方便日后改结构时整体作废）。
     --------------------------------------------------------- */
  var NAV_OPEN_KEY = 'site_nav_open_v1';
  var navOpenMemo = {};

  function readOpenState() {
    try {
      var raw = localStorage.getItem(NAV_OPEN_KEY);
      var m = raw ? JSON.parse(raw) : null;
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }      /* 隐私模式 / 禁用存储时静默降级 */
  }

  function saveDropOpen(id, open) {
    if (!id) return;
    navOpenMemo[id] = !!open;
    try { localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(navOpenMemo)); } catch (e) {}
  }

  /* 菜单 id → 显示名，用于窄屏顶部条的面包屑 */
  function findLabel(id) {
    for (var i = 0; i < NAV_DATA.length; i++) {
      var it = NAV_DATA[i];
      if (it.id === id) return it.label;
      if (it.children) {
        for (var j = 0; j < it.children.length; j++) {
          if (it.children[j].id === id) return it.children[j].label;
        }
      }
    }
    return '';
  }

  /* 开关单个下拉，并同步 aria-expanded */
  function setDropOpen(drop, open) {
    if (open) { drop.classList.add('open'); } else { drop.classList.remove('open'); }
    var t = drop.querySelector(':scope > .nav-drop-toggle');
    if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* 窄屏抽屉的统一开关：菜单面板 + 遮罩 + 汉堡按钮三处状态一起切。
     必须是模块级函数 —— initNav 里「点主题后收起抽屉」也要用到，
     否则只清了 .open 而漏掉 body.nav-drawer-open，遮罩会留在屏幕上。 */
  function setDrawer(open) {
    var linksBox = document.getElementById('navLinks');
    var toggleBtn = document.getElementById('navToggle');
    if (linksBox) linksBox.classList.toggle('open', open);
    if (document.body) document.body.classList.toggle('nav-drawer-open', open);
    if (toggleBtn) {
      toggleBtn.classList.toggle('open', open);
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggleBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    }
  }

  function closeAllDrops(nav) {
    nav.querySelectorAll('.nav-drop').forEach(function (d) { setDropOpen(d, false); });
  }

  /* ---------------------------------------------------------
     绑定交互（注入完成后调用）
     --------------------------------------------------------- */
  function bindNav(nav) {
    var toggleBtn = document.getElementById('navToggle');
    var linksBox = document.getElementById('navLinks');
    var drops = nav.querySelectorAll('.nav-drop');

    navOpenMemo = readOpenState();

    /* 先套用记住的分组展开状态 */
    drops.forEach(function (drop) {
      var toggle = drop.querySelector(':scope > .nav-drop-toggle');
      if (!toggle) return;
      var key = toggle.getAttribute('data-nav');
      if (key && typeof navOpenMemo[key] === 'boolean') setDropOpen(drop, navOpenMemo[key]);
    });

    /* 汉堡菜单 */
    if (toggleBtn && linksBox) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setDrawer(!linksBox.classList.contains('open'));
      });
    }

    /* 下拉菜单：点击 / 键盘（Enter、Space、Escape），同层互斥 */
    drops.forEach(function (drop) {
      var toggle = drop.querySelector(':scope > .nav-drop-toggle');
      if (!toggle) return;

      function toggleDrop() {
        var isOpen = drop.classList.contains('open');
        /* 关闭父级作用域下的同级下拉 */
        var scope = drop.parentElement.closest('.nav-drop') || nav;
        scope.querySelectorAll(':scope > .nav-drop').forEach(function (d) { setDropOpen(d, false); });
        /* 同样关闭 .nav-menu 容器下的同级下拉 */
        var menu = drop.parentElement;
        if (menu && menu.classList && menu.classList.contains('nav-menu')) {
          menu.querySelectorAll(':scope > .nav-drop').forEach(function (d) { setDropOpen(d, false); });
        }
        if (!isOpen) setDropOpen(drop, true);

        /* 记住用户的手动选择（只在真正切换时写，避免初始化误覆盖） */
        var key = toggle.getAttribute('data-nav');
        if (key) saveDropOpen(key, !isOpen);
      }

      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDrop();
      });

      toggle.addEventListener('keydown', function (e) {
        var k = e.key || '';
        var code = e.keyCode;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar' || code === 13 || code === 32) {
          e.preventDefault();
          e.stopPropagation();
          toggleDrop();
        } else if (k === 'Escape' || k === 'Esc' || code === 27) {
          if (drop.classList.contains('open')) {
            e.preventDefault();
            setDropOpen(drop, false);
          }
        }
      });
    });

    /* 点击外部关闭 */
    document.addEventListener('click', function () {
      closeAllDrops(nav);
      setDrawer(false);
    });

    /* Esc 全局关闭 */
    document.addEventListener('keydown', function (e) {
      var k = e.key || '';
      if (k === 'Escape' || k === 'Esc' || e.keyCode === 27) {
        closeAllDrops(nav);
        setDrawer(false);
      }
    });

    /* 当前页高亮：命中项加 .active + aria-current，祖先下拉同步高亮 */
    var current = resolveCurrent();
    if (!current) return;

    nav.querySelectorAll('[data-nav]').forEach(function (el) {
      if (el.getAttribute('data-nav') !== current) return;
      el.classList.add('active');
      el.setAttribute('aria-current', 'page');

      var drop = el.closest('.nav-drop');
      while (drop) {
        /* 侧栏模式下二级菜单默认收起；当前页所在的分组自动展开，
           否则用户看不到自己处在哪一节。
           例外：用户手动收起过该分组（存储里有显式 false）→ 尊重用户选择。 */
        var dt = drop.querySelector(':scope > .nav-drop-toggle');
        var dkey = dt ? dt.getAttribute('data-nav') : null;
        var explicit = (dkey && typeof navOpenMemo[dkey] === 'boolean');
        if (!explicit) drop.classList.add('open');
        if (dt) dt.classList.add('active');
        drop = drop.parentElement.closest('.nav-drop');
      }
    });
  }

  /* ---------------------------------------------------------
     初始化
     新机制：[data-site-nav] 占位符 → 注入
     旧机制：页面自带静态 <nav id="siteNav"> → 原样绑定，不改 DOM
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     全站 favicon：集中在公共脚本注入，避免逐页改 <head>。
     生成文件见仓库根 favicon.svg（魔方主题等距立方体）。
     --------------------------------------------------------- */
  function ensureFavicon() {
    if (document.querySelector('link[rel="icon"]')) return;
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = '/favicon.svg';
    document.head.appendChild(link);
  }

  /* ---------------------------------------------------------
     工作台骨架样式：运行时注入 assets/css/site-shell.css
     把顶部导航条改造成「左侧常驻导航 + 右侧主体」的工作台布局。
     在这里注入而不是逐页加 <link>，是为了让全站 80 个页面零改动。
     详见 assets/css/site-shell.css 文件头说明。
     --------------------------------------------------------- */
  function ensureShellCSS() {
    if (document.querySelector('link[data-site-shell]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/site-shell.css';
    link.setAttribute('data-site-shell', '');
    document.head.appendChild(link);
  }

  /* ---------------------------------------------------------
     交互控件 ARIA 状态同步（阶段四 · 可访问性收尾）
     分段按钮 / 选项卡原本只用 .active 类表达选中态，屏幕阅读器读不到。
     这里统一补 aria-pressed，并用 MutationObserver 跟随 .active 类变化自动同步，
     不改动任何页面自有 JS、视觉或键盘交互。
     覆盖：.seg__btn（分段单选）、.stu-tab（学生选项卡）、.tab（选项卡）、.nbtn（视图切换）
     --------------------------------------------------------- */
  var ARIA_TOGGLE_SEL = '.seg__btn, .stu-tab, .tab, .nbtn';

  /* 选中态类名有 .active 与 .is-active 两种历史写法（组件库统一用的是 .is-active，
     见 _design/components-preview.html 与 tools/cfop/js/cfop-ui.js），两种都要认，
     否则 aria-pressed 永远算出 false，屏幕阅读器读不到选中项。 */
  function isToggleOn(el) {
    return el.classList.contains('active') || el.classList.contains('is-active');
  }

  function syncToggleAria(el) {
    el.setAttribute('aria-pressed', isToggleOn(el) ? 'true' : 'false');
  }

  function initAriaState(root) {
    root = root || document;
    function apply(el) {
      if (el.nodeType === 1 && el.matches && el.matches(ARIA_TOGGLE_SEL)) {
        var g = el.parentElement;
        if (g && !g.hasAttribute('data-aria-group')) g.setAttribute('data-aria-group', '1');
        if (el.tagName !== 'BUTTON' && !el.hasAttribute('role')) el.setAttribute('role', 'button');
        syncToggleAria(el);
      }
    }
    function scan(scope) { (scope || root).querySelectorAll(ARIA_TOGGLE_SEL).forEach(apply); }
    scan();
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            apply(m.target);
          } else if (m.type === 'childList') {
            m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { apply(n); scan(n); } });
          }
        });
      });
      mo.observe(root.documentElement, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
    }
  }

  function initNav() {
    ensureShellCSS();
    ensureFavicon();
    initAriaState(document);
    var placeholder = document.querySelector('[data-site-nav]');
    if (placeholder && !document.getElementById('siteNav')) {
      placeholder.innerHTML = buildNav();
    }

    var nav = document.getElementById('siteNav');
    if (!nav) return;
    bindNav(nav);

    /* 手机端抽屉里的「主题」项：接上 theme.js 引擎（浅色 ↔ 深色），
       点完顺手收起抽屉，好让用户立刻看到整页换了主题。
       注意：主题按钮自身会 stopPropagation，所以收抽屉要单独绑。 */
    var themeItem = document.getElementById('navThemeItem');
    if (themeItem && window.Theme && window.Theme.attach) {
      window.Theme.attach(themeItem);
      themeItem.addEventListener('click', function () {
        setDrawer(false);
      });
    }

    /* 窄屏顶部条的空间只够放一处文字：把站点全名换成「当前所在页」，
       窄屏下用 CSS 切换显示（桌面端仍显示全名，逻辑见 site-shell.css）。
       找不到对应菜单项时不写属性 → CSS 回退显示站点全名。 */
    var crumb = findLabel(resolveCurrent());
    if (crumb) {
      var logo = nav.querySelector('.nav-logo');
      if (logo) logo.setAttribute('data-crumb', crumb);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
