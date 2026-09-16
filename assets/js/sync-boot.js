/* =============================================================
 * sync-boot.js — 同步能力启动器（页面唯一需要引入的全局脚本）
 * -------------------------------------------------------------
 * 按序加载 cloud-store → account → sync-engine → account-ui，
 * 加载完成后：
 *   · 派发 window 事件 'sync:ready'
 *   · 执行 SyncBoot.ready(cb) 排队的回调（各功能在此注册 Provider）
 *
 * 页面用法：
 *   <script src="/assets/js/sync-boot.js"></script>
 *   <script>
 *     SyncBoot.ready(function () {
 *       SyncEngine.register({ id:'srs', label:'记忆卡', path:'srs.json',
 *         getSnapshot: ..., applySnapshot: ..., subscribe: ... });
 *     });
 *   </script>
 * ============================================================= */
(function (global) {
  'use strict';

  var FILES = [
    '/assets/js/cloud-store.js',
    '/assets/js/account.js',
    '/assets/js/sync-engine.js',
    '/assets/js/ls-provider.js',
    '/assets/js/account-ui.js'
  ];

  var loaded = false;
  var queue = [];
  var err = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      // 已存在同名脚本（页面手动引入过）则跳过
      var exist = document.querySelector('script[src="' + src + '"]');
      if (exist) return res();
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  function flush() {
    loaded = true;
    try { global.dispatchEvent(new CustomEvent('sync:ready')); } catch (e) {}
    var q = queue.slice(); queue = [];
    q.forEach(function (fn) { try { fn(err); } catch (e) { console.error(e); } });
  }

  var chain = Promise.resolve();
  FILES.forEach(function (f) {
    chain = chain.then(function () { return loadScript(f); });
  });
  chain.then(flush, function (e) { err = e; console.error('[sync-boot]', e); flush(); });

  global.SyncBoot = {
    /** 模块就绪后回调；已就绪则立即执行 */
    ready: function (cb) {
      if (typeof cb !== 'function') return;
      if (loaded) { try { cb(err); } catch (e) { console.error(e); } return; }
      queue.push(cb);
    },
    isReady: function () { return loaded; }
  };
})(typeof window !== 'undefined' ? window : this);
