/* =============================================================
 * vip-gate.js — 教练专用功能门禁（v2.0.37）
 * -------------------------------------------------------------
 * 用途：把一批工具划为「教练专用」。未开通者**可见不可用**，
 *       显示开通说明与管理员联系方式，引导其联系开通。
 *
 * 三种工作模式（同一份代码，按页面自动切换）：
 *   ① 私密页 Gate 模式：页面加载即遮罩，鉴权通过才解除
 *   ② 链接增强模式（任意页）：指向私密页的链接自动加角标 + 拦截点击
 *   ③ 联系我们注入：[data-contact] 占位 → 渲染联系方式区
 *
 * ⚠️ 安全边界（务必理解后再使用）：
 *   本站托管于 GitHub Pages，属**纯静态公开仓库**，页面文件任何人可直接请求。
 *   本模块是**前端软拦截**，作用是「告知 + 引导付费」，不是加密、不是鉴权墙。
 *   它能拦住绝大多数普通访客，但无法阻止会看源码/直接抓 HTML 的技术人员。
 *   真正机密的内容不要放在本站任何页面里。
 *
 * 设计要点：
 *   - 本文件在 <head> 内同步执行：命中私密页时立即给 <html> 加 vip-locking，
 *     配合 CSS 让 body 在渲染第一帧就不可见，避免内容"闪一下"再被遮住。
 *   - 登录依赖（cb-config / supabase SDK / cb-auth）**按需动态加载**，
 *     公开页不会因为引入了本脚本而拖慢加载。
 *   - 站长邮箱本地豁免：即使 Supabase 不可达，站长自己也能正常使用。
 * ============================================================= */
(function (global) {
  'use strict';

  var doc = global.document;

  /* ---------------------------------------------------------
     配置区（改这里即可，无需动其它文件）
     --------------------------------------------------------- */

  /** 管理员联系方式 —— 浮层、联系我们区块共用单一来源 */
  var CONTACT = {
    wechat: 'gamejia001',
    email: '380972743@qq.com'
  };

  /** 站长邮箱：命中即本地放行（不查表、不依赖网络），
      保证 Supabase 故障或离线时站长自己仍能使用全部工具。 */
  var OWNER_EMAILS = ['380972743@qq.com', 'gamejia@qq.com'];

  /** Supabase 白名单表名（建表 SQL 见 docs/vip-access.sql） */
  var ACCESS_TABLE = 'vip_access';

  var CSS_URL = '/assets/css/vip-gate.css?v=2.0.43';

  /* 私密页清单。键 = 规范化路径，值 = 展示名。
     ⚠️ 精确到具体页面，不要写目录前缀。
     v2.0.53：权限门槛已取消，所有原「教练专用」工具对全员开放，
        故清单置空 —— 以下任何页面不再弹开通浮层、指向它们的链接不再被拦截。
        （如需重新启用门禁，把页面路径填回此处即可，其余逻辑无需改动。） */
  var VIP_PAGES = {};

  /* ---------------------------------------------------------
     工具函数
     --------------------------------------------------------- */

  /** 把 href / location 统一规范化成 /xxx/index.html 形式 */
  function normPath(p) {
    if (!p) return '';
    var s = String(p);
    /* 绝对 URL 取 pathname 部分 */
    var m = s.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (m) s = m[1];
    var cut = s.search(/[?#]/);
    if (cut >= 0) s = s.slice(0, cut);
    s = s.replace(/\/+$/, '');
    if (s === '') return '/index.html';
    if (/\.html?$/i.test(s)) return s;
    return s + '/index.html';
  }

  function currentPath() {
    return normPath(global.location ? global.location.pathname : '');
  }

  function vipName(path) {
    return VIP_PAGES[path] || '';
  }

  function isVipPath(path) {
    return Object.prototype.hasOwnProperty.call(VIP_PAGES, path);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 轮询等待某个全局符号出现（带超时），返回 Promise<boolean> */
  function waitGlobal(test, timeoutMs) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + (timeoutMs || 15000);
      (function tick() {
        var ok = false;
        try { ok = !!test(); } catch (e) { ok = false; }
        if (ok) { resolve(true); return; }
        if (Date.now() > deadline) { resolve(false); return; }
        setTimeout(tick, 80);
      })();
    });
  }

  /**
   * 确保某个依赖就绪：已就绪直接通过；否则按需插入 <script> 并**等待符号出现**。
   *
   * ⚠️ 关键教训（v2.0.37 实测踩到）：
   *   不能把「<script> 标签已在 DOM 里」当作「脚本已执行完」。
   *   sync-boot.js 会在 DOMContentLoaded 前后按序动态插入 cb-config / cb-auth 等标签，
   *   两个加载器同时存在时，`querySelector('script[src=...]')` 会命中**正在下载中**的标签，
   *   一旦据此提前 resolve，鉴权就会在 CB_CONFIG 尚未定义时抢跑 ——
   *   表现为 configured() 返回 false、浮层误报「站点未配置账号服务」。
   *   唯一可靠的判据是「全局符号是否已存在」。
   */
  function waitOrLoad(test, src) {
    if (test()) return Promise.resolve(true);
    if (!doc.querySelector('script[src="' + src + '"]')) {
      var el = doc.createElement('script');
      el.src = src;
      el.async = false;
      (doc.head || doc.documentElement).appendChild(el);
    }
    /* 标签已由别人插入时不再重复插入，只等它就位 */
    return waitGlobal(test, 15000);
  }

  /** 按需加载登录依赖（cb-config → supabase SDK → cb-auth），逐项确认符号就绪 */
  function loadAuthDeps() {
    return waitOrLoad(function () { return !!global.CB_CONFIG; }, '/assets/js/cb-config.js')
      .then(function () {
        var sdk = (global.CB_CONFIG && global.CB_CONFIG.sdkUrl) || '/assets/js/supabase-2.117.1.min.js';
        return waitOrLoad(function () { return !!global.supabase; }, sdk);
      })
      .then(function () {
        return waitOrLoad(function () {
          return !!(global.CBAuth && global.CBAuth.configured);
        }, '/assets/js/cb-auth.js');
      });
  }

  function ensureCSS() {
    if (doc.querySelector('link[data-vip-gate]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    link.setAttribute('data-vip-gate', '');
    (doc.head || doc.documentElement).appendChild(link);
  }

  /* ---------------------------------------------------------
     模式 ①：私密页 Gate
     --------------------------------------------------------- */

  var gateEl = null;

  function gateReturnUrl() {
    return (global.location && (global.location.pathname + global.location.search)) || '/';
  }

  function buildGate(html) {
    if (gateEl && gateEl.parentNode) { gateEl.innerHTML = html; return gateEl; }
    gateEl = doc.createElement('div');
    gateEl.className = 'vip-gate';
    gateEl.setAttribute('role', 'dialog');
    gateEl.setAttribute('aria-modal', 'true');
    gateEl.innerHTML = html;
    (doc.body || doc.documentElement).appendChild(gateEl);
    return gateEl;
  }

  function removeGate() {
    var root = doc.documentElement;
    if (root) root.classList.remove('vip-locking');
    if (gateEl && gateEl.parentNode) gateEl.parentNode.removeChild(gateEl);
    gateEl = null;
  }

  function contactHTML() {
    return ''
      + '<div class="vip-contact">'
      + '  <p class="vip-contact__lead">微信扫码添加管理员：</p>'
      + '  <div class="vip-qr">'
      + '    <img class="vip-qr__img" src="/assets/images/wechat-qrcode.png" alt="微信二维码：魔方先生Jack，扫码添加" loading="lazy" decoding="async" width="180" height="180">'
      + '    <span class="vip-qr__cap">魔方先生Jack</span>'
      + '  </div>'
      + '  <p class="vip-contact__lead vip-contact__lead--sub">或复制账号 / 邮箱联系：</p>'
      + '  <div class="vip-contact__row">'
      + '    <span class="vip-contact__k">微信</span>'
      + '    <code class="vip-contact__v" id="vipWx">' + esc(CONTACT.wechat) + '</code>'
      + '    <button type="button" class="vip-copy" data-copy="' + esc(CONTACT.wechat) + '">复制</button>'
      + '  </div>'
      + '  <div class="vip-contact__row">'
      + '    <span class="vip-contact__k">邮箱</span>'
      + '    <a class="vip-contact__v" href="mailto:' + esc(CONTACT.email) + '">' + esc(CONTACT.email) + '</a>'
      + '  </div>'
      + '</div>';
  }

  function bindCopy(scope) {
    var btns = (scope || doc).querySelectorAll('.vip-copy');
    btns.forEach(function (b) {
      if (b.getAttribute('data-bound')) return;
      b.setAttribute('data-bound', '1');
      b.addEventListener('click', function () {
        var text = b.getAttribute('data-copy') || '';
        var done = function () {
          var old = b.textContent;
          b.textContent = '已复制';
          setTimeout(function () { b.textContent = old; }, 1600);
        };
        /* 优先异步剪贴板；失败降级 execCommand（file:// 或权限被拒时走得通） */
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text, done, b); });
        } else {
          legacyCopy(text, done, b);
        }
      });
    });
  }

  function legacyCopy(text, done, btn) {
    try {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      doc.body.appendChild(ta);
      ta.select();
      var ok = doc.execCommand && doc.execCommand('copy');
      doc.body.removeChild(ta);
      ok ? done() : alert('复制失败，请手动选择文本复制');
    } catch (e) {
      alert('复制失败，请手动选择文本复制');
    }
  }

  /** 未登录：邮箱验证码登录表单 */
  function renderLogin(name) {
    var h = ''
      + '<div class="vip-card">'
      + '  <div class="vip-badge">教练专用</div>'
      + '  <h2 class="vip-title">' + esc(name) + '</h2>'
      + '  <p class="vip-desc">该功能属于<b>教练专属工具</b>，需开通后使用。</p>'
      + '  <div class="vip-form" id="vipForm">'
      + '    <input class="vip-input" id="vipEmail" type="email" inputmode="email" autocomplete="email" placeholder="你的邮箱">'
      + '    <div class="vip-form__row">'
      + '      <input class="vip-input" id="vipCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位验证码">'
      + '      <button type="button" class="vip-btn vip-btn--ghost" id="vipSend">获取验证码</button>'
      + '    </div>'
      + '    <p class="vip-hint" id="vipHint"></p>'
      + '    <button type="button" class="vip-btn vip-btn--primary" id="vipLogin">登录并验证权限</button>'
      + '  </div>'
      + contactHTML()
      + '  <a class="vip-back" href="/">← 返回首页</a>'
      + '</div>';
    buildGate(h);

    var emailEl = doc.getElementById('vipEmail');
    var codeEl = doc.getElementById('vipCode');
    var sendBtn = doc.getElementById('vipSend');
    var loginBtn = doc.getElementById('vipLogin');
    var hint = doc.getElementById('vipHint');
    var CB = global.CBAuth;

    function say(m, bad) {
      if (!hint) return;
      hint.textContent = m || '';
      hint.className = bad ? 'vip-hint is-bad' : 'vip-hint';
    }

    if (sendBtn) {
      var cooling = 0;
      sendBtn.addEventListener('click', function () {
        if (cooling > 0) return;
        var v = (emailEl && emailEl.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { say('请填写正确的邮箱地址', true); return; }
        say('正在发送…');
        CB.sendCode(v, 'email').then(function () {
          say('验证码已发送到 ' + v + '，请查收（含垃圾邮件）');
          cooling = 60;
          sendBtn.disabled = true;
          var t = setInterval(function () {
            cooling--;
            if (cooling <= 0) { clearInterval(t); sendBtn.disabled = false; sendBtn.textContent = '获取验证码'; }
            else { sendBtn.textContent = cooling + ' 秒后重发'; }
          }, 1000);
        }, function (e) {
          say((e && e.message) || '发送失败，请稍后再试', true);
        });
      });
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        var code = (codeEl && codeEl.value || '').trim();
        if (!/^\d{4,10}$/.test(code)) { say('请输入邮箱收到的验证码', true); return; }
        say('正在验证…');
        loginBtn.disabled = true;
        CB.verifyCode(code).then(function () {
          return judge();
        }, function (e) {
          loginBtn.disabled = false;
          say((e && e.message) || '验证码不正确或已过期', true);
        });
      });
    }

    bindCopy(gateEl);
  }

  /** 已登录但未开通 */
  function renderDenied(name, who) {
    var h = ''
      + '<div class="vip-card">'
      + '  <div class="vip-badge">教练专用</div>'
      + '  <h2 class="vip-title">' + esc(name) + '</h2>'
      + '  <p class="vip-desc">该功能属于<b>教练专属工具</b>，当前账号尚未开通。</p>'
      + '  <p class="vip-who">当前账号：<code>' + esc(who) + '</code></p>'
      + contactHTML()
      + '  <div class="vip-acts">'
      + '    <button type="button" class="vip-btn vip-btn--primary" id="vipRecheck">我刚开通了，重新检测</button>'
      + '    <button type="button" class="vip-btn vip-btn--ghost" id="vipSwitch">换个账号</button>'
      + '  </div>'
      + '  <a class="vip-back" href="/">← 返回首页</a>'
      + '</div>';
    buildGate(h);
    bindCopy(gateEl);

    var r = doc.getElementById('vipRecheck');
    if (r) r.addEventListener('click', function () { r.disabled = true; r.textContent = '检测中…'; judge(); });
    var s = doc.getElementById('vipSwitch');
    if (s) s.addEventListener('click', function () {
      if (global.CBAuth && global.CBAuth.signOut) {
        global.CBAuth.signOut().then(function () { renderLogin(name); }, function () { renderLogin(name); });
      } else {
        renderLogin(name);
      }
    });
  }

  /** 服务不可用 */
  function renderError(name, msg) {
    var h = ''
      + '<div class="vip-card">'
      + '  <div class="vip-badge">教练专用</div>'
      + '  <h2 class="vip-title">' + esc(name) + '</h2>'
      + '  <p class="vip-desc">权限校验服务暂时不可用，无法确认开通状态。</p>'
      + '  <p class="vip-err">' + esc(msg || '') + '</p>'
      + contactHTML()
      + '  <div class="vip-acts">'
      + '    <button type="button" class="vip-btn vip-btn--primary" id="vipRetry">重试</button>'
      + '  </div>'
      + '  <a class="vip-back" href="/">← 返回首页</a>'
      + '</div>';
    buildGate(h);
    bindCopy(gateEl);
    var r = doc.getElementById('vipRetry');
    if (r) r.addEventListener('click', function () { r.disabled = true; judge(); });
  }

  function renderLoading(name) {
    var h = ''
      + '<div class="vip-card vip-card--plain">'
      + '  <div class="vip-badge">教练专用</div>'
      + '  <h2 class="vip-title">' + esc(name) + '</h2>'
      + '  <p class="vip-desc">正在校验使用权限…</p>'
      + '</div>';
    buildGate(h);
  }

  /* ---------------------------------------------------------
     鉴权判定
     --------------------------------------------------------- */

  function lowerEq(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function isOwner(user) {
    var mail = user && (user.email || '');
    if (!mail) return false;
    for (var i = 0; i < OWNER_EMAILS.length; i++) {
      if (lowerEq(mail, OWNER_EMAILS[i])) return true;
    }
    return false;
  }

  /** 查白名单表。RLS 限制只能读到"自己那一行"，查不到 = 未开通。 */
  function queryRow() {
    var CB = global.CBAuth;
    var client = CB && CB.client ? CB.client() : null;
    if (!client) return Promise.reject(new Error('账号服务未初始化'));

    var q = client.from(ACCESS_TABLE).select('active, expires_at');
    /* maybeSingle 在少数旧版本 SDK 上可能不存在，做一次降级 */
    var p = (typeof q.maybeSingle === 'function') ? q.maybeSingle() : q.limit(1);

    return Promise.resolve(p).then(function (r) {
      if (r && r.error) throw new Error(r.error.message || String(r.error));
      var d = r && r.data;
      if (Array.isArray(d)) d = d.length ? d[0] : null;
      return d || null;
    });
  }

  function rowIsValid(row) {
    if (!row) return false;
    if (row.active === false) return false;
    if (row.expires_at) {
      var t = Date.parse(row.expires_at);
      if (!isNaN(t) && t < Date.now()) return false;
    }
    return true;
  }

  function judge() {
    var name = vipName(currentPath()) || '教练专用工具';
    var CB = global.CBAuth;

    if (!CB || !CB.configured || !CB.configured()) {
      renderError(name, '站点未配置账号服务，无法校验权限。');
      return Promise.resolve(false);
    }

    return CB.refresh().then(function (user) {
      user = user || (CB.get ? CB.get().user : null);

      if (!user || !user.uid) { renderLogin(name); return false; }

      /* 站长本地豁免：断网也能用自己的工具 */
      if (isOwner(user)) { removeGate(); return true; }

      return queryRow().then(function (row) {
        if (rowIsValid(row)) { removeGate(); return true; }
        renderDenied(name, user.email || user.phone || '(未绑定邮箱)');
        return false;
      }, function (e) {
        renderError(name, (e && e.message) || String(e));
        return false;
      });
    }, function (e) {
      renderError(name, (e && e.message) || String(e));
      return false;
    });
  }

  /* ---------------------------------------------------------
     模式 ②：链接增强（给指向私密页的链接加角标并拦截）
     --------------------------------------------------------- */

  /** 私密页入口：先加锁 → 显示 loading → 等登录依赖就位 → 判定 */
  function startGate() {
    var root = doc.documentElement;
    if (root) root.classList.add('vip-locking');
    var name = vipName(currentPath()) || '教练专用工具';
    renderLoading(name);

    loadAuthDeps().then(function () {
      /* loadAuthDeps 只负责"尽量等就位"、不抛错；这里统一兜底判定 */
      if (!global.CBAuth || !global.CB_CONFIG) {
        renderError(name, '登录组件加载失败或超时，请检查网络后重试。');
        return false;
      }
      return judge();
    }, function (e) {
      renderError(name, '登录组件加载失败：' + ((e && e.message) || String(e)) + '。请检查网络后重试。');
    });
  }

  var BADGE_TEXT = '专用';

  function markLinks(root) {
    var links = (root || doc).querySelectorAll('a[href]');
    links.forEach(function (a) {
      if (a.getAttribute('data-vip-done')) return;
      var p = normPath(a.getAttribute('href'));
      if (!p || !isVipPath(p)) return;
      a.setAttribute('data-vip-done', '1');
      a.classList.add('is-vip-link');
      if (!a.getAttribute('title')) a.setAttribute('title', '教练专用功能 · 需开通使用');

      /* 角标：只在还没加过时插入 */
      if (!a.querySelector('.vip-tag')) {
        var tag = doc.createElement('span');
        tag.className = 'vip-tag';
        tag.textContent = BADGE_TEXT;
        a.appendChild(tag);
      }

      a.addEventListener('click', function (e) {
        /* 放行新窗口打开的原生行为之外的普通跳转 */
        e.preventDefault();
        e.stopPropagation();
        showTeaser(vipName(p) || '教练专用工具');
      });
    });
  }

  var teaserEl = null;

  function showTeaser(name) {
    closeTeaser();
    teaserEl = doc.createElement('div');
    teaserEl.className = 'vip-teaser';
    teaserEl.setAttribute('role', 'dialog');
    teaserEl.innerHTML = ''
      + '<div class="vip-teaser__box">'
      + '  <button type="button" class="vip-teaser__x" aria-label="关闭">×</button>'
      + '  <div class="vip-badge">教练专用</div>'
      + '  <h3 class="vip-teaser__t">' + esc(name) + '</h3>'
      + '  <p class="vip-teaser__d">这是<b>教练专属工具</b>，提供给在本站赞助 / 支持服务器费用的朋友使用。</p>'
      + contactHTML()
      + '  <a class="vip-back" href="/">← 返回首页</a>'
      + '</div>';
    doc.body.appendChild(teaserEl);
    teaserEl.addEventListener('click', function (e) {
      if (e.target === teaserEl) closeTeaser();
    });
    var x = teaserEl.querySelector('.vip-teaser__x');
    if (x) x.addEventListener('click', closeTeaser);
    bindCopy(teaserEl);
  }

  function closeTeaser() {
    if (teaserEl && teaserEl.parentNode) teaserEl.parentNode.removeChild(teaserEl);
    teaserEl = null;
  }

  /* ---------------------------------------------------------
     模式 ③：联系我们区块
     --------------------------------------------------------- */

  function renderContactBlocks() {
    var nodes = doc.querySelectorAll('[data-contact]');
    nodes.forEach(function (n) {
      if (n.getAttribute('data-contact-done')) return;
      n.setAttribute('data-contact-done', '1');
      var variant = n.getAttribute('data-contact') || 'card';
      n.className = (n.className ? n.className + ' ' : '') + 'vip-contactbox vip-contactbox--' + esc(variant);
      n.innerHTML = ''
        + (variant === 'card' ? '<h2 class="vip-contactbox__h">联系管理员</h2>' : '')
        + '<p class="vip-contactbox__lead">教练专属工具开通 / 站点赞助 / 功能建议，都可以直接找我：</p>'
        + contactHTML();
      bindCopy(n);
    });
  }

  /* ---------------------------------------------------------
     启动
     --------------------------------------------------------- */

  function boot() {
    ensureCSS();
    var path = currentPath();

    if (isVipPath(path)) {
      startGate();
      return;      /* 私密页不放行时也仍要能返回首页，浮层里已提供 */
    }

    /* 其余页面：给链接加角标 + 注入联系我们（如页面放了占位） */
    markLinks(doc);
    renderContactBlocks();

    /* 导航是 JS 注入的（可能晚于本脚本），用 MutationObserver 跟进 */
    if (global.MutationObserver) {
      var mo = new global.MutationObserver(function (muts) {
        var touched = false;
        muts.forEach(function (m) {
          if (m.type === 'childList' && m.addedNodes.length) touched = true;
        });
        if (touched) markLinks(doc);
      });
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      /* 导航稳定后停止观察，避免长期开销 */
      setTimeout(function () { try { mo.disconnect(); } catch (e) {} }, 12000);
    }

    doc.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.keyCode === 27) && teaserEl) closeTeaser();
    });
  }

  /* head 内同步执行时 body 尚未就绪，等 DOMContentLoaded 再做 DOM 操作；
     Gate 的 vip-locking class 则已由样式保证第一帧即隐藏内容。 */
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 对外暴露少量能力，便于日后调试或扩展（不依赖时也不影响页面） */
  global.VipGate = {
    isVipPath: isVipPath,
    normPath: normPath,
    name: vipName,
    recheck: judge,
    contact: CONTACT
  };
})(window);
