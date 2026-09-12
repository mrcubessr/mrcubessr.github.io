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
      { id: '3x3', label: '三阶', href: '/tools/3x3' },
      { label: '二阶', soon: true },
      { label: '金字塔', soon: true },
      { label: '三盲', soon: true },
      { id: 'fto', label: 'FTO', href: '/fto' }
    ]},
    { id: 'tools', label: '个人训练工具', children: [
      { id: 'scramble-ur',      label: 'UR公式训练',       href: '/tools/scramble-ur' },
      { id: 'scramble-uf',      label: 'UF公式训练',       href: '/tools/scramble-uf' },
      { id: 'bldtrainer',       label: '三盲读码还原',     href: '/tools/bldtrainer' },
      { id: 'bld-trainer',      label: '记忆编码训练',     href: '/tools/bld-trainer' },
      { id: '3bld',             label: '三盲出题器',       href: '/tools/3bld' },
      { id: '2x2',              label: '二阶练习',         href: '/tools/2x2' },
      { id: 'corner-trainer',   label: '角块编码',         href: '/tools/corner-trainer' },
      { id: 'edge-trainer',     label: '棱块编码',         href: '/tools/edge-trainer' },
      { id: 'kmap',             label: '知识地图',         href: '/tools/kmap' },
      { id: 'invert',           label: '逆序转换',         href: '/tools/invert' },
      { id: 'bldscramble',      label: '盲拧打乱生成器',   href: '/tools/bldscramble' },
      { id: 'scramble-trainer', label: '打乱公式训练',     href: '/tools/scramble-trainer' },
      { id: 'practice',         label: '练习纸生成',       href: '/tools/practice' },
      { id: 'edge-printout',    label: '出题打印',         href: '/tools/edge-printout' },
      { id: '3x3teach',         label: '三阶魔方教学',     href: '/tools/3x3teach' },
      { id: 'class-teach',      label: '魔方课堂教学系统', href: '/tools/class-teach' }
    ]},
    { id: 'links', label: '外链', children: [
      { id: 'nav', label: '工具导航', href: '/tools/nav' }
    ]}
  ];

  /* 目录名与菜单 id 不一致时的别名表 */
  var NAV_ALIAS = {
    'bld-trainer': 'bld-trainer'
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

    h += '</div></div></nav>';
    return h;
  }

  /* ---------------------------------------------------------
     当前页判定：body[data-nav] > URL 兜底 > 别名表
     --------------------------------------------------------- */
  function resolveCurrent() {
    var fromBody = document.body.getAttribute('data-nav');
    if (fromBody) return fromBody;

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

  /* 开关单个下拉，并同步 aria-expanded */
  function setDropOpen(drop, open) {
    if (open) { drop.classList.add('open'); } else { drop.classList.remove('open'); }
    var t = drop.querySelector(':scope > .nav-drop-toggle');
    if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
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

    /* 汉堡菜单 */
    if (toggleBtn && linksBox) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = linksBox.classList.toggle('open');
        toggleBtn.classList.toggle('open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
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
      if (linksBox) {
        linksBox.classList.remove('open');
        if (toggleBtn) {
          toggleBtn.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', '打开菜单');
        }
      }
    });

    /* Esc 全局关闭 */
    document.addEventListener('keydown', function (e) {
      var k = e.key || '';
      if (k === 'Escape' || k === 'Esc' || e.keyCode === 27) {
        closeAllDrops(nav);
        if (linksBox) {
          linksBox.classList.remove('open');
          if (toggleBtn) {
            toggleBtn.classList.remove('open');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.setAttribute('aria-label', '打开菜单');
          }
        }
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
        var parentToggle = drop.querySelector(':scope > .nav-drop-toggle');
        if (parentToggle) parentToggle.classList.add('active');
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
     交互控件 ARIA 状态同步（阶段四 · 可访问性收尾）
     分段按钮 / 选项卡原本只用 .active 类表达选中态，屏幕阅读器读不到。
     这里统一补 aria-pressed，并用 MutationObserver 跟随 .active 类变化自动同步，
     不改动任何页面自有 JS、视觉或键盘交互。
     覆盖：.seg__btn（分段单选）、.stu-tab（学生选项卡）、.tab（选项卡）、.nbtn（视图切换）
     --------------------------------------------------------- */
  var ARIA_TOGGLE_SEL = '.seg__btn, .stu-tab, .tab, .nbtn';

  function syncToggleAria(el) {
    el.setAttribute('aria-pressed', el.classList.contains('active') ? 'true' : 'false');
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
    ensureFavicon();
    initAriaState(document);
    var placeholder = document.querySelector('[data-site-nav]');
    if (placeholder && !document.getElementById('siteNav')) {
      placeholder.innerHTML = buildNav();
    }

    var nav = document.getElementById('siteNav');
    if (!nav) return;
    bindNav(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
