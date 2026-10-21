/* ===== 全站统一导航：数据驱动注入 + 静态导航兼容 ===== */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     菜单数据（全站唯一来源）
     增删 / 排序菜单只改这里，页面无需任何改动。
     --------------------------------------------------------- */
  var NAV_DATA = [
    { id: 'home', label: '首页', href: '/' },
    { id: 'tutorial', label: '魔方教程与公式库', children: [
      { id: '3x3', label: '三阶', href: '/tools/3x3/' },
      /* 三阶 ZBLL（v2.0.46）：472 条最后一层一步到位公式 + 训练器，
         与 OLL / PLL 同走 CFOP 训练器骨架，项目归属三阶。 */
      { id: 'zbll', label: '三阶 ZBLL', href: '/tools/cfop/zbll-trainer.html' },
      /* 盲拧（v2.0.44：由「三盲」改名并对外开放）—— 三阶魔方盲拧项目主页，
         公式库（棱 / 角查询）与全套盲拧训练工具都收敛到这一页。 */
      { id: '3bld', label: '盲拧', href: '/tools/3bld/' },
      /* 盲拧公式训练器（角/棱 + 高阶角心/翼棱/棱心/中棱六体系）：
         v2.0.44 从独立顶级项并入「盲拧」项目下，按项目组织（公式库 + 训练工具同页）。 */
      { id: 'ft', label: '盲拧公式训练器', href: '/tools/ft/' },
      /* 二阶 EG（v2.0.46）：CLL / EG-1 / EG-2 共 120 条，二阶高阶解法。 */
      { id: 'eg', label: '二阶 EG', href: '/tools/cfop/eg-trainer.html' },
      { id: 'sq1', label: 'Square-1', href: '/tools/sq1/' },
      { id: 'mega', label: '五魔方', href: '/tools/mega/' },
      { id: 'fto', label: 'FTO', href: '/fto' },
      { label: '金字塔', soon: true },
      { label: '斜转', soon: true },
      { label: '高阶魔方', soon: true }
    ]},
    /* 魔方教练工具箱：原「个人训练工具」+「三盲训练」两个分组于 v2.0.26 合并为一处，
       页面上写 data-nav="coach"（旧值 tools / 3bld-tools 由 NAV_ALIAS 兜底映射）。
       v2.0.44：公开工具删除「难度分级标准」（相关说明并入三阶魔方盲拧计时器）；
       教练专用移除「三盲总览」（三盲已对外开放，归入「教程 → 盲拧」）。 */
    { id: 'coach', label: '魔方教练工具箱', children: [
      /* —— 公开工具（任何人可直接使用） —— */
      { id: 'timer',            label: '计时器',           href: '/tools/timer' },
      { id: 'invert',           label: '逆序转换',         href: '/tools/invert' },
      { id: 'scramble-trainer', label: '打乱公式训练',     href: '/tools/scramble-trainer' },
      { id: 'bldtrainer',       label: '读码还原',         href: '/tools/bldtrainer/' },
      { id: 'corner-trainer',   label: '角块训练',         href: '/tools/corner-trainer/' },
      { id: 'edge-trainer',     label: '棱块训练',         href: '/tools/edge-trainer/' },
      { id: 'bldscramble',      label: '定向打乱',         href: '/tools/bldscramble/' },
      { id: 'nav',              label: '工具导航',         href: '/tools/nav' },
      /* —— 教练专用（v2.0.37 权限划分）——
         以下 9 项属于专项功能，需联系管理员开通后方可使用。
         ⚠️ 这里**只做视觉分组与跳转目标**，真正的拦截在 assets/js/vip-gate.js：
         它按 VIP_PAGES 清单判定，目标页面会显示开通浮层（含联系方式）。
         新增/调整专用工具时，两边要同步改：这里决定展示，那边决定拦截。 */
      { label: '教练专用 · 需开通', sep: true },
      { id: '2x2',            label: '二阶公式练习',   href: '/tools/2x2/' },
      { id: 'bld-trainer',    label: '盲拧编码记忆',   href: '/tools/bld-trainer/' },
      { id: 'edge-printout',  label: '棱块出题器',     href: '/tools/edge-printout/' },
      { id: 'practice',       label: '练习题生成器',   href: '/tools/practice/' },
      { id: 'kmap',           label: '二阶知识地图',   href: '/tools/kmap/' },
      { id: 'bld-kmap',       label: '三阶知识地图',   href: '/tools/bld-kmap/' },
      { id: '3x3teach',       label: '三阶趣味课堂',   href: '/tools/3x3teach' },
      { id: 'class-teach',    label: '魔方课堂教学系统', href: '/tools/class-teach' },
      { id: 'srs',            label: '记忆卡片 SRS',   href: '/tools/srs/' }
    ]}
  ];

  /* 目录名与菜单 id 不一致时的别名表。
     现在三盲相关工具在侧栏里有独立的「三盲训练」分组，每个工具页直接高亮自己，
     所以这里不再把三盲工具映射到 3bld。仅保留确实需要别名兜底的情况。 */
  var NAV_ALIAS = {
    /* CFOP公式库（/tools/cfop/）已于 2026-10-14 并入「教程 → 三阶」：
       cfop 各子页 body 都带 data-nav="3x3" 直接高亮；这里兜底
       URL 判定（老书签/漏写 data-nav 的页面），映射到三阶。 */
    'cfop': '3x3',
    /* v2.0.26 导航合并：「个人训练工具」+「三盲训练」→「魔方教练工具箱」。
       旧页面 body 上的 data-nav="tools" / "3bld-tools" 走这里映射到新 id，
       否则这些页面会整条导航没有一个高亮项。 */
    'tools': 'coach',
    '3bld-tools': 'coach',
    /* 高阶盲拧分组已删除：四阶中心块/翼棱旧页、UF/UR 连拧页
       一并归入「盲拧公式训练器」（公式已并入该训练器）。 */
    '4bld-tools': 'ft',
    '4bld-center': 'ft',
    '4bld-wing': 'ft',
    'scramble-uf': 'ft',
    'scramble-ur': 'ft'
  };

  /* ---------------------------------------------------------
     渲染导航 HTML
     结构与类名被 site-nav.css 依赖，请勿改动。
     --------------------------------------------------------- */
  function buildNav() {
    var h = '<nav class="site-nav" id="siteNav" aria-label="主导航">';
    h += '<div class="nav-inner">';
    h += '<a class="nav-logo" href="/">魔方先生SSR魔方训练中心</a>';
    /* 侧栏收起按钮（v2.0.28）：放在侧栏自身右上角，不再占用页面内容区。
       窄屏顶部条模式下由 CSS 隐藏（桌面断点才显示）。 */
    h += '<button class="nav-collapse-btn" id="navCollapse" type="button" aria-label="收起侧栏" aria-expanded="true" title="收起侧栏">';
    h += '<span aria-hidden="true">«</span>';
    h += '</button>';
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
        } else if (child.sep) {
          /* 分组小标题（v2.0.37）：把「教练专用」与公开工具在视觉上切开。
             用 <div> 而非 <a>：不可点击，也不参与 .nav-menu a 的通用样式。 */
          h += '<div class="nav-menu-sep" role="presentation">' + child.label + '</div>';
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

  /* 菜单列较长时（例如「三盲训练」分组展开后多达 12 项，另有「高阶盲拧(4×4)」5 项），
     把当前页项滚到容器可视区内，避免用户打开抽屉后还要自己找。
     只滚动 .nav-links 自身（不用 scrollIntoView），不会带动页面滚动。 */
  function scrollActiveIntoView() {
    var linksBox = document.getElementById('navLinks');
    if (!linksBox) return;
    /* 取 DOM 里最后一个 .active —— 父分组标题也带 .active，子项在其后，
       所以最后一个才是「当前页」本身，滚动目标必须用它。 */
    var acts = linksBox.querySelectorAll('.active');
    var act = acts.length ? acts[acts.length - 1] : null;
    if (!act) return;
    var box = linksBox.getBoundingClientRect();
    var r = act.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) {
      linksBox.scrollTop += (r.top - box.top) - (box.height - r.height) / 2;
    }
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
    /* 打开后再滚，等一帧让 .open 引发的布局稳定下来 */
    if (open) {
      window.requestAnimationFrame(scrollActiveIntoView);
    }
  }

  /* ---------------------------------------------------------
     侧栏收起（v2.0.28）
     入口按钮在侧栏自身右上角（buildNav 注入的 #navCollapse）；
     收起后左侧边缘浮出「展开」条（#navExpandTab，由本文件注入到
     body，不属于任何页面内容 —— 页面零改动，全站一致）。
     状态类 body.nav-hidden + 存储记忆；只在桌面断点生效
     （CSS 见 site-shell.css ⑪）：窄屏顶部条 + 抽屉不参与收起。

     ⚠️ v2.0.39 记忆键从 localStorage 改为 sessionStorage：
     原实现用 localStorage **永久**记住「收起」。一旦收起就再也回不来 ——
     页面上只剩左缘一条 24px 的淡色窄条，几乎无人发现，
     用户只能反馈「主页导航不见了」且无从自己恢复。
     改为会话级后：本次浏览内保持收起（便于腾出内容宽度），
     关掉标签页 / 重开网站自动恢复展开 —— 导航自己会回来。
     同时启动时清掉旧的 localStorage 键，避免老用户继续被隐藏。
     --------------------------------------------------------- */
  var NAV_HIDDEN_KEY = 'site_nav_hidden_v2';
  var NAV_HIDDEN_LEGACY_KEY = 'site_nav_hidden_v1';

  function isNavHidden() {
    try {
      /* 一次性清理旧版永久记忆键 */
      try { localStorage.removeItem(NAV_HIDDEN_LEGACY_KEY); } catch (e2) {}
      return sessionStorage.getItem(NAV_HIDDEN_KEY) === '1';
    } catch (e) { return false; }      /* 隐私模式 / 禁用存储时静默降级 */
  }

  function setNavHidden(hidden) {
    try { sessionStorage.setItem(NAV_HIDDEN_KEY, hidden ? '1' : '0'); } catch (e) {}
    if (document.body) { document.body.classList.toggle('nav-hidden', hidden); }
    var cb = document.getElementById('navCollapse');
    if (cb) {
      cb.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      cb.setAttribute('aria-label', hidden ? '展开侧栏' : '收起侧栏');
      cb.title = hidden ? '展开侧栏' : '收起侧栏';
    }
  }

  function ensureExpandTab() {
    var tab = document.getElementById('navExpandTab');
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.id = 'navExpandTab';
      tab.className = 'nav-expand-tab';
      tab.setAttribute('aria-label', '展开侧栏');
      tab.title = '展开侧栏';
      tab.innerHTML = '<span class="nav-expand-tab__txt" aria-hidden="true">导航</span>'
                    + '<span class="nav-expand-tab__arrow" aria-hidden="true">&raquo;</span>';
      tab.addEventListener('click', function () { setNavHidden(false); });
      document.body.appendChild(tab);
    }
    return tab;
  }

  function initNavCollapse() {
    ensureExpandTab();
    setNavHidden(isNavHidden());
    var cb = document.getElementById('navCollapse');
    if (cb) {
      cb.addEventListener('click', function (e) {
        /* 必须阻止冒泡：bindNav 里有「点外部关抽屉」的 document 监听 */
        e.stopPropagation();
        setNavHidden(!isNavHidden());
      });
    }
  }

  function closeAllDrops(nav) {
    nav.querySelectorAll('.nav-drop').forEach(function (d) { setDropOpen(d, false); });
  }

  function isDesktop() {
    return window.innerWidth > 1024;
  }

  /* 判断某个下拉分组是否包含当前页（用于桌面侧栏常驻展开） */
  function dropHasActive(drop) {
    return !!drop.querySelector('.nav-menu a.active, .nav-menu .active');
  }

  /* ---------------------------------------------------------
     绑定交互（注入完成后调用）
     --------------------------------------------------------- */
  function bindNav(nav) {
    var toggleBtn = document.getElementById('navToggle');
    var linksBox = document.getElementById('navLinks');
    var drops = nav.querySelectorAll('.nav-drop');

    navOpenMemo = readOpenState();

    /* 桌面侧栏模式下：默认只展开当前页所在分组，避免所有分组同时撑开导致侧栏溢出屏幕。
       用户点击仍可临时展开其他分组；跳转到新页面后再次仅保留当前分组展开。 */
    if (isDesktop()) {
      drops.forEach(function (drop) { setDropOpen(drop, false); });
    } else {
      /* 窄屏/抽屉模式：应用记住的分组展开状态 */
      drops.forEach(function (drop) {
        var toggle = drop.querySelector(':scope > .nav-drop-toggle');
        if (!toggle) return;
        var key = toggle.getAttribute('data-nav');
        if (key && typeof navOpenMemo[key] === 'boolean') setDropOpen(drop, navOpenMemo[key]);
      });
    }

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

        /* 桌面侧栏：当前页所在分组「展开状态下」不允许被点关，避免用户把导航点没。
           ⚠️ 必须同时判断 drop.classList.contains('open')：
           当它已被别的分组挤关（accordion）时点它，应该是「重新展开」而不是无响应。 */
        if (isDesktop() && isOpen && dropHasActive(drop)) {
          return;
        }

        /* accordion：同容器内只保留一个分组展开，避免多个分组同时撑开侧栏。
           ⚠️ 必须用 drop.parentElement 作为作用域 —— 顶层分组的父节点是
           .nav-links（不是 .nav-drop），旧写法 `closest('.nav-drop') || nav`
           会让 scope 落到 nav 上，而 nav 的直接子级里没有 .nav-drop，
           于是「同级互斥」静默失效、多个分组一起展开。 */
        var container = drop.parentElement;
        if (container) {
          container.querySelectorAll(':scope > .nav-drop').forEach(function (d) {
            if (d !== drop) setDropOpen(d, false);
          });
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
        /* 当前页所在分组强制展开（桌面侧栏下保持常驻可见），
           用户手动收起状态在这里被覆盖：当前分组必须让用户看得见。 */
        setDropOpen(drop, true);
        var dt = drop.querySelector(':scope > .nav-drop-toggle');
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
     全站 PWA manifest：集中在公共脚本注入，避免逐页改 <head>。
     ⚠️ 已有 rel=manifest 的页面不覆盖 —— 计时器、角块训练、棱块训练
     三页各自声明了专属 manifest（三个独立 PWA 作用域），
     重复声明两个 manifest 会让浏览器取第一个、行为不确定。
     根 manifest 为站点级（scope '/'），计时器那份在 /tools/timer/。
     --------------------------------------------------------- */
  function ensureManifest() {
    if (document.querySelector('link[rel="manifest"]')) return;
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    document.head.appendChild(link);
  }

  /* ---------------------------------------------------------
     全站 Service Worker 注册（根 sw.js，作用域 '/'）。
     ⚠️ 两个跳过条件：
     ① 非 https 不注册 —— file:// 下 Chrome 直接抛 SecurityError；
     ② corner-trainer / edge-trainer 有各自作用域的专属 SW，
        这两目录的页面由「作用域更长」的专属 SW 接管，不重复注册根 SW。
     --------------------------------------------------------- */
  var SW_SKIP_PREFIX = ['/tools/corner-trainer/', '/tools/edge-trainer/'];

  function ensureServiceWorker() {
    if (location.protocol !== 'https:') return;
    if (!('serviceWorker' in navigator)) return;
    for (var i = 0; i < SW_SKIP_PREFIX.length; i++) {
      if (location.pathname.indexOf(SW_SKIP_PREFIX[i]) === 0) return;
    }
    /* 注册失败（旧浏览器 / 隐私模式）不能影响页面本身功能 */
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

  /* ---------------------------------------------------------
     配色方案层：运行时注入 assets/css/palettes.css
     6 套配色（data-palette ↔ localStorage['mf_palette']）由主题按钮旁的
     「配色方案」面板切换，与明度（data-theme）正交。
     排在 site-shell.css 之前：palettes 只覆盖 tokens，后面各层都引用变量。
     面板自身的外观样式在 assets/css/palette-ui.css，由 palette.js 注入
     （键名同为 data-palette-ui，两处注入互斥、不会重复加载）。
     --------------------------------------------------------- */
  function ensurePaletteCSS() {
    if (document.querySelector('link[data-palette-tokens]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/palettes.css';
    link.setAttribute('data-palette-tokens', '');
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
     宽屏横版铺满样式：运行时注入 assets/css/site-wide.css
     侧栏占掉 240px 后，各页原有的容器限宽（900~1280 居中）会在宽屏上
     留下大片空白、内容挤成一根竖条。本层只放开这些容器的 max-width，
     页面内部的卡片网格本来就是自适应多列，放开后自动变"横版"。
     必须排在 site-shell.css 之后加载（同特异性靠后覆盖）。
     详见 assets/css/site-wide.css 文件头说明。
     --------------------------------------------------------- */
  function ensureWideCSS() {
    if (document.querySelector('link[data-site-wide]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/site-wide.css';
    link.setAttribute('data-site-wide', '');
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
    ensurePaletteCSS();
    ensureShellCSS();
    ensureWideCSS();
    ensureFavicon();
    ensureManifest();
    ensureServiceWorker();
    initAriaState(document);
    var placeholder = document.querySelector('[data-site-nav]');
    if (placeholder && !document.getElementById('siteNav')) {
      placeholder.innerHTML = buildNav();
    }

    var nav = document.getElementById('siteNav');
    if (!nav) return;
    bindNav(nav);
    initNavCollapse();

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
