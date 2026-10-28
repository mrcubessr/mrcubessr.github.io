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
 *
 * 【2026-10-28 首屏优化】
 *   ① 原实现用 `chain = chain.then(loadScript)` 逐个串行加载，8 个文件
 *      = 8 次串行往返。弱网下光排队就 1 秒以上，且这些请求会跟首屏的
 *      CSS/字体抢带宽。现改为「并行下载 + 按序执行」：
 *      动态插入的 <script> 设 async=false 即按插入顺序执行（in-order），
 *      下载却是并行的 —— 8 次往返压成 1 次，执行顺序与原来完全一致。
 *   ② 启动时机从「立即」改为「DOMContentLoaded 后的空闲时段」。
 *      同步模块（账号按钮、云同步引擎）不在首屏关键路径上，
 *      没必要跟首页内容抢带宽。SyncBoot.ready() 在此之前就已可用，
 *      回调照常排队，flush 时统一执行 —— 对页面侧完全透明。
 *   ⚠️ 本文件必须继续留在 <head> 同步引入：页面内的 SyncBoot.ready(...)
 *      是紧跟着它执行的内联脚本，延后到 body 末尾会 ReferenceError。
 * ============================================================= */
(function (global) {
  'use strict';

  var FILES = [
    '/assets/js/cloud-store.js',
    '/assets/js/account.js',
    '/assets/js/cb-config.js',
    '/assets/js/cb-auth.js',
    '/assets/js/cb-store.js',
    '/assets/js/sync-engine.js',
    '/assets/js/ls-provider.js',
    '/assets/js/account-ui.js'
  ];

  var loaded = false;
  var started = false;
  var queue = [];
  var err = null;

  /* 并行下载、按插入顺序执行。任何单个失败都记下来，但不阻断其余文件
     —— 原来一失败整条链就断，账号按钮等其余能力跟着一起没。 */
  function loadAll() {
    return new Promise(function (resolve, reject) {
      var left = 0;
      var failed = null;
      var scheduled = 0;

      function tick() {
        left--;
        if (left === 0) {
          if (failed) reject(failed);
          else resolve();
        }
      }

      FILES.forEach(function (src) {
        /* 页面已手动引入过同名脚本则跳过（沿用原行为） */
        if (document.querySelector('script[src="' + src + '"]')) return;
        scheduled++;
        var s = document.createElement('script');
        s.src = src;
        s.async = false;   /* in-order：并行下载，按插入顺序执行 */
        s.onload = tick;
        s.onerror = function () {
          failed = failed || new Error('加载失败：' + src);
          tick();
        };
        document.head.appendChild(s);
      });

      left = scheduled;
      if (left === 0) resolve();
    });
  }

  function flush() {
    loaded = true;
    try { global.dispatchEvent(new CustomEvent('sync:ready')); } catch (e) {}
    var q = queue.slice(); queue = [];
    q.forEach(function (fn) { try { fn(err); } catch (e) { console.error(e); } });
  }

  function start() {
    if (started) return;
    started = true;
    loadAll().then(flush, function (e) {
      err = e;
      console.error('[sync-boot]', e);
      flush();
    });
  }

  /* 首屏优先：DOM 就绪后再挑空闲时段启动，不跟首屏资源抢带宽。
     requestIdleCallback 的 timeout 兜底 2s，保证慢设备/后台标签页也会跑。 */
  function schedule() {
    var kick = function () {
      if ('requestIdleCallback' in global) {
        global.requestIdleCallback(start, { timeout: 2000 });
      } else {
        setTimeout(start, 200);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', kick);
    } else {
      kick();
    }
  }

  schedule();

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
