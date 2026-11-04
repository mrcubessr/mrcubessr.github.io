/* =========================================================
   组练习页 · 手机端单屏交互（UF / UR 共用）
   ---------------------------------------------------------
   目标：手机端像计时器 App（cstimer 那样）——主屏只做计时、不上下滚动。
   布局由 practice.css 的 ≤640px 块承担，本模块只负责三块「可折叠」交互：
     ① 展开图   ：默认收起成一条按钮，点击展开；展开时按可见容器重绘
     ② 练习顺序 ：默认只显示「当前 + 后 2 个」，点「展开全部」看全部
     ③ 参考公式 ：默认收起，点按钮开全屏浮层，顶栏「关闭 ✕」或 Esc 关闭

   要点 / 红线（改动前必读）：
   - 所有视觉状态只加 class（is-open / is-far / order-collapsed），样式全部
     写在 @media (max-width:640px) 内 → 桌面端（含 v2.0.58 三栏单屏）零影响。
   - 顺序链只做 CSS 隐藏，绝不移除 DOM：uf/ur-ref.js 靠 .order-tag 取本组
     全部编码来渲染参考公式表，删了公式表就空了。
   - 不碰 .timer-display 的 mousedown / 键盘绑定（计时核心一律不动）。
   - 注入的控件（diagram-toggle / order-more / ref-sheet-bar）在媒体查询外
     默认 display:none —— 横屏或大屏会自动隐身，不会漏到桌面布局里。
   - 展开图包一层 .diagram-stage：drawScrambleNet 读「canvas 父元素 rect」
     定尺寸，父元素里若还塞着切换按钮，可用高度被按钮吃掉、图会被切边。

   加载位置：uf/ur-ref.js、uf/ur-timer.js 之后（theme.js 之前）。
   ========================================================= */
(function () {
  'use strict';

  var MQ = '(max-width: 640px)';
  var LS_DIAGRAM = 'pc-diagram-open';   // 展开图展开状态（跨次练习记住）

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MQ).matches);
  }

  /* ---------- ① 展开图：默认收起，点击展开 ---------- */
  function setupDiagram() {
    var card = document.querySelector('.pc-card--diagram');
    if (!card) return;
    var canvas = card.querySelector('canvas.ur-cube');
    if (!canvas) return;

    // canvas 装进独立舞台：尺寸只由舞台决定，不受切换按钮挤压
    var stage = document.createElement('div');
    stage.className = 'diagram-stage';
    card.appendChild(stage);
    stage.appendChild(canvas);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'diagram-toggle';
    card.insertBefore(btn, card.firstChild);

    var open = false;
    try { open = localStorage.getItem(LS_DIAGRAM) === '1'; } catch (e) {}

    function redraw() {
      if (typeof drawScrambleNet !== 'function') return;
      try {
        drawScrambleNet(
          canvas.getAttribute('data-formula') || '',
          canvas,
          canvas.getAttribute('data-orientation') || 'yellow-red'
        );
      } catch (e) { /* 画不出来也不能影响计时 */ }
    }
    function paint() {
      card.classList.toggle('is-open', open);
      btn.textContent = open ? '收起展开图' : '展开图';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      // 展开后舞台才有尺寸，此时按可见容器重算（折叠态画出来是 0 尺寸）
      if (open) redraw();
    }

    btn.addEventListener('click', function () {
      open = !open;
      try { localStorage.setItem(LS_DIAGRAM, open ? '1' : '0'); } catch (e) {}
      paint();
    });

    // 换拿法后若正展开则重绘（页面内联脚本先绑 change，本监听后执行）
    var sel = document.getElementById('orientationSelect');
    if (sel) {
      sel.addEventListener('change', function () { if (open) redraw(); });
    }
    var rt = 0;
    window.addEventListener('resize', function () {
      if (!open) return;
      clearTimeout(rt);
      rt = setTimeout(redraw, 180);
    });

    paint();
  }

  /* ---------- ② 练习顺序链：默认 当前 + 后 2 个 ---------- */
  function setupOrder() {
    var list = document.querySelector('.order-list');
    if (!list) return;
    var card = list.closest ? list.closest('.pc-card') : list.parentNode;
    if (!card) return;
    card.classList.add('order-card');

    var kids = list.children, i, el;
    var tags = [];
    for (i = 0; i < kids.length; i++) {
      if (kids[i].classList.contains('order-tag')) tags.push(kids[i]);
    }
    if (!tags.length) return;

    // 「当前」在生成器里固定打在第 1 个；这里不假设，按 .current 实算
    var cur = 0;
    for (i = 0; i < tags.length; i++) {
      if (tags[i].classList.contains('current')) { cur = i; break; }
    }
    var limit = cur + 2;   // 当前 + 后 2 个（共 3 个）

    var ti = -1, prevArrow = null;
    for (i = 0; i < kids.length; i++) {
      el = kids[i];
      if (el.classList.contains('order-tag')) {
        ti++;
        if (ti > limit) {
          el.classList.add('is-far');
          if (prevArrow) prevArrow.classList.add('is-far');  // 它前面的箭头一起收
        }
        prevArrow = null;
      } else {
        prevArrow = el;   // 箭头
      }
    }

    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'order-more';
    function paint() {
      var all = card.classList.contains('is-open');
      more.textContent = all ? '收起' : '展开全部';
      card.classList.toggle('order-collapsed', !all);
    }
    more.addEventListener('click', function () {
      card.classList.toggle('is-open');
      paint();
    });
    list.parentNode.insertBefore(more, list.nextSibling);
    paint();
  }

  /* ---------- ③ 参考公式：默认收起，点开为全屏浮层 ---------- */
  function setupRef() {
    var ref = document.querySelector('.pc-ref');
    if (!ref) return;
    var btn = ref.querySelector('.ref-toggle');
    var panel = ref.querySelector('.ref-panel');
    if (!btn || !panel) return;

    // uf-ref.js 会把切换按钮隐藏、面板强制常驻展开（桌面右竖条需要）。
    // 手机端改成「按钮 + 浮层」：按钮的显示由 CSS !important 抢回，
    // 面板的显示交回 CSS（uf-ref 已清空 inline display）。
    if (!btn.textContent.replace(/\s/g, '')) btn.textContent = '参考公式';

    var bar = document.createElement('div');
    bar.className = 'ref-sheet-bar';
    bar.innerHTML =
      '<span class="ref-sheet-title">参考公式</span>' +
      '<button type="button" class="ref-sheet-close" aria-label="关闭参考公式">关闭 ✕</button>';
    ref.appendChild(bar);   // .pc-ref 的子节点，不会被 renderPanel 的 innerHTML 冲掉

    function setOpen(on) {
      ref.classList.toggle('is-open', on);
      btn.textContent = on ? '收起参考公式' : '参考公式';
      document.body.classList.toggle('has-ref-open', on);
    }

    btn.addEventListener('click', function () {
      setOpen(!ref.classList.contains('is-open'));
    });
    bar.querySelector('.ref-sheet-close').addEventListener('click', function () {
      setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && ref.classList.contains('is-open')) {
        setOpen(false);
      }
    });

    setOpen(false);
  }

  /* 只在手机视口下装配；桌面端保持原样（样式也全在媒体查询内） */
  function boot() {
    if (!isMobile()) return;
    setupDiagram();
    setupOrder();
    setupRef();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
