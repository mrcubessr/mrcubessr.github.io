/* ===== 全站统一导航交互 ===== */
(function () {
  'use strict';

  function initNav() {
    var nav = document.getElementById('siteNav');
    if (!nav) return;

    var toggleBtn = document.getElementById('navToggle');
    var linksBox = document.getElementById('navLinks');

    // 汉堡菜单
    if (toggleBtn && linksBox) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = linksBox.classList.toggle('open');
        toggleBtn.classList.toggle('open', open);
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // 下拉菜单：点击切换
    var drops = nav.querySelectorAll('.nav-drop');
    drops.forEach(function (drop) {
      var toggle = drop.querySelector('.nav-drop-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = drop.classList.contains('open');
        // 关闭其它下拉
        drops.forEach(function (d) { d.classList.remove('open'); });
        if (!isOpen) drop.classList.add('open');
      });
    });

    // 点击外部关闭
    document.addEventListener('click', function () {
      drops.forEach(function (d) { d.classList.remove('open'); });
      if (linksBox) {
        linksBox.classList.remove('open');
        if (toggleBtn) {
          toggleBtn.classList.remove('open');
          toggleBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // 当前页高亮：根据 body[data-nav] 或 URL 匹配
    var current = document.body.getAttribute('data-nav');
    if (!current) {
      var path = window.location.pathname.replace(/\/$/, '');
      var seg = path.split('/').filter(Boolean);
      if (seg.length === 0) current = 'home';
      else if (seg[0] === 'fto') current = seg[1] || 'tcp';
      else if (seg[0] === 'tools') current = seg[1] || '';
    }
    if (current) {
      nav.querySelectorAll('[data-nav]').forEach(function (el) {
        if (el.getAttribute('data-nav') === current) {
          el.classList.add('active');
          // 若在子菜单中，同时高亮父级
          var drop = el.closest('.nav-drop');
          if (drop) {
            var parentToggle = drop.querySelector('.nav-drop-toggle');
            if (parentToggle) parentToggle.classList.add('active');
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
