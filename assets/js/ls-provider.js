/* =============================================================
 * ls-provider.js — 通用 localStorage 同步 Provider
 * -------------------------------------------------------------
 * 适用于以 localStorage 存数据的功能（计时、各训练器、scramble 统计等）。
 * 由 sync-boot.js 加载，页面只需：
 *   SyncBoot.ready(function(){
 *     LSProvider.register({ id:'timer', label:'计时', path:'timer.json',
 *                           keys:['timer_data_v2','timer_options_v1'] });
 *   });
 *
 * 本地变更感知：统一包装 Storage.prototype.setItem/removeItem，
 * 命中本 scope 关注的键即通知引擎（引擎内防抖 3s 上传）。
 * 快照形态：{ key: 原始字符串 }（原样存取，不做 JSON 假设，最安全）。
 * ============================================================= */
(function (global) {
  'use strict';

  /* ---- 全局写监听（只包一次） ---- */
  var watchers = []; // { keys:Set|null, cb }
  var patched = false;

  function fire(k) {
    for (var i = 0; i < watchers.length; i++) {
      var w = watchers[i];
      if (!w.keys || w.keys.has(k)) { try { w.cb(k); } catch (e) {} }
    }
  }

  function patchStorage() {
    if (patched) return;
    patched = true;
    try {
      var P = global.Storage && global.Storage.prototype;
      if (!P) return;
      var oSet = P.setItem, oRm = P.removeItem;
      P.setItem = function (k, v) { var r = oSet.apply(this, arguments); fire(String(k)); return r; };
      P.removeItem = function (k) { var r = oRm.apply(this, arguments); fire(String(k)); return r; };
    } catch (e) { console.warn('[ls-provider] 无法监听 localStorage 写入', e); }
  }

  function LSProvider_register(o) {
    if (!o || !o.id || !o.keys || !o.keys.length) throw new Error('LSProvider 需要 id 与 keys');
    var keys = o.keys.slice();
    var keySet = new Set();
    keys.forEach(function (k) { keySet.add(k); });

    var listeners = [];
    function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

    patchStorage();
    watchers.push({ keys: keySet, cb: function () { notify(); } });

    function doRegister() {
      if (!global.SyncEngine) { console.warn('[ls-provider] SyncEngine 未就绪'); return; }
      global.SyncEngine.register({
        id: o.id,
        label: o.label || o.id,
        path: o.path || (o.id + '.json'),
        getSnapshot: function () {
          var snap = {};
          keys.forEach(function (k) {
            try { snap[k] = localStorage.getItem(k); } catch (e) { snap[k] = null; }
          });
          return Promise.resolve(snap);
        },
        applySnapshot: function (data) {
          if (!data) return Promise.resolve();
          Object.keys(data).forEach(function (k) {
            if (!keySet.has(k)) return; // 只回写本 scope 关注的键
            try {
              if (data[k] == null) localStorage.removeItem(k);
              else localStorage.setItem(k, data[k]);
            } catch (e) {}
          });
          return Promise.resolve();
        },
        subscribe: function (cb) {
          if (typeof cb === 'function') listeners.push(cb);
          return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
        }
      });
    }

    if (global.SyncBoot && !global.SyncBoot.isReady()) global.SyncBoot.ready(doRegister);
    else doRegister();
  }

  global.LSProvider = { register: LSProvider_register };
})(typeof window !== 'undefined' ? window : this);
