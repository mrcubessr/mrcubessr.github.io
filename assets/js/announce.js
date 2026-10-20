/* =============================================================
 * announce.js — 全站公告（v2.0.37）
 * -------------------------------------------------------------
 * 数据：assets/data/announcements.json（改那个文件即可更新公告，不用改代码）
 *
 * 两种呈现：
 *   ① 首页完整公告区 —— 页面里放 <div data-announce></div>
 *   ② 全站顶部横幅 —— 自动注入，显示在导航占位符之后
 *      ⚠️ 必须是**插入 [data-site-nav] 占位符之后**而不是 body 最前面：
 *      窄屏下导航是 fixed 顶部条，占位符用 min-height:60px 把高度还给文档流，
 *      横幅若插在它前面就会被那条 fixed 顶栏盖住。
 *      桌面侧栏同理避开：body 的 border-left 已经让出了 240px，
 *      普通流元素自然从侧栏右侧开始，不会被盖。
 *
 * 关闭记忆：localStorage['site_announce_closed_v1'] 存 JSON {id: version}。
 *   用户关过某条就不再显示这条；换新公告（改 id）或改 version 后会重新出现。
 * ============================================================= */
(function (global) {
  'use strict';

  var doc = global.document;
  var DATA_URL = '/assets/data/announcements.json';
  var CLOSE_KEY = 'site_announce_closed_v1';
  var CSS_URL = '/assets/css/announce.css';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureCSS() {
    if (doc.querySelector('link[data-announce-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    link.setAttribute('data-announce-css', '');
    (doc.head || doc.documentElement).appendChild(link);
  }

  function readClosed() {
    try {
      var raw = global.localStorage.getItem(CLOSE_KEY);
      var m = raw ? JSON.parse(raw) : null;
      return (m && typeof m === 'object') ? m : {};
    } catch (e) { return {}; }      /* 隐私模式下静默降级 */
  }

  function markClosed(id, ver) {
    try {
      var m = readClosed();
      m[id] = ver;
      global.localStorage.setItem(CLOSE_KEY, JSON.stringify(m));
    } catch (e) {}
  }

  function itemHTML(it, opts) {
    opts = opts || {};
    var cls = 'ann-item ann-item--' + (it.level || 'info');
    if (opts.compact) cls += ' ann-item--compact';
    var h = '<article class="' + cls + '" data-ann-id="' + esc(it.id) + '">';
    h += '<div class="ann-head">';
    h += '<span class="ann-level">' + (it.level === 'highlight' ? '公告' : it.level === 'warn' ? '注意' : '通知') + '</span>';
    if (it.date) h += '<time class="ann-date">' + esc(it.date) + '</time>';
    h += '</div>';
    h += '<h3 class="ann-title">' + esc(it.title) + '</h3>';
    var body = String(it.text || '').split('\n').map(function (p) {
      return '<p class="ann-p">' + esc(p) + '</p>';
    }).join('');
    h += '<div class="ann-body">' + body + '</div>';
    if (it.cta && it.cta.href) {
      h += '<a class="ann-cta" href="' + esc(it.cta.href) + '">' + esc(it.cta.label || '了解详情') + '</a>';
    }
    h += '</article>';
    return h;
  }

  function renderHome(data) {
    var nodes = doc.querySelectorAll('[data-announce]');
    if (!nodes.length) return;
    var items = (data.items || []).filter(function (it) { return it.home !== false; });
    nodes.forEach(function (n) {
      n.className = (n.className ? n.className + ' ' : '') + 'ann-list';
      if (!items.length) { n.innerHTML = ''; return; }
      n.innerHTML = items.map(function (it) { return itemHTML(it); }).join('');
    });
  }

  function renderBar(data) {
    /* 只取第一条 bar:true 且未被关闭的公告 */
    var items = (data.items || []).filter(function (it) { return it.bar === true; });
    if (!items.length) return;
    var closed = readClosed();
    var ver = data.version || 1;
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (String(closed[items[i].id]) !== String(ver)) { it = items[i]; break; }
    }
    if (!it) return;

    ensureCSS();

    var bar = doc.createElement('div');
    bar.className = 'ann-bar ann-bar--' + (it.level || 'info');
    bar.setAttribute('data-ann-id', it.id);
    bar.innerHTML = ''
      + '<span class="ann-bar__badge">公告</span>'
      + '<span class="ann-bar__t">' + esc(it.title) + '</span>'
      + '<a class="ann-bar__more" href="/#announce">详情</a>'
      + '<button type="button" class="ann-bar__x" aria-label="关闭公告">×</button>';

    /* 插到导航占位符之后；没有占位符时退回到 body 最前面 */
    var anchor = doc.querySelector('[data-site-nav]');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    } else {
      doc.body.insertBefore(bar, doc.body.firstChild);
    }

    var x = bar.querySelector('.ann-bar__x');
    if (x) {
      x.addEventListener('click', function () {
        markClosed(it.id, ver);
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      });
    }
  }

  function boot() {
    if (!global.fetch) return;
    global.fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (data) {
        if (!data || !data.items) return;
        ensureCSS();
        renderHome(data);
        renderBar(data);
      })
      .catch(function () {
        /* 公告是增强功能，读取失败（离线/文件缺失）必须静默降级，不能报错干扰页面 */
      });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
