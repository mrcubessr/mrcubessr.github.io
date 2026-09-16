/* =============================================================
 * SRS · 同步 Provider
 * -------------------------------------------------------------
 * 把记忆卡数据（decks/cards/reviews/settings）接入全站账号同步。
 * 需在 db.js 之后、SyncBoot 就绪后加载。
 *
 * 本地变更感知：包装 SRSDB 的写方法，写成功后通知引擎（引擎内防抖 3s 上传）。
 * 远端数据应用：DB.restore(data,'replace')（LWW：以云端为准整体替换）。
 * ============================================================= */
(function (global) {
  'use strict';
  var DB = global.SRSDB;
  if (!DB) { console.warn('[srs-sync] SRSDB 未加载，跳过注册'); return; }

  var listeners = [];
  function notify() {
    listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  }

  // 包装写操作，成功后广播变更
  ['putCard', 'putCards', 'addReview', 'delCard', 'delCards',
    'putDeck', 'delDeck', 'clearCards', 'setSetting', 'restore', 'wipe'
  ].forEach(function (m) {
    var orig = DB[m];
    if (typeof orig !== 'function') return;
    DB[m] = function () {
      return orig.apply(DB, arguments).then(function (r) { notify(); return r; });
    };
  });

  function register() {
    if (!global.SyncEngine) { console.warn('[srs-sync] SyncEngine 未就绪'); return; }
    global.SyncEngine.register({
      id: 'srs',
      label: '记忆卡（SRS）',
      path: 'srs.json',
      getSnapshot: function () { return DB.dump(); },
      applySnapshot: function (data) {
        if (!data || !data.decks) return Promise.resolve();
        return DB.restore(data, 'replace');
      },
      subscribe: function (cb) {
        if (typeof cb === 'function') listeners.push(cb);
        return function () { var i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
      }
    });
  }

  if (global.SyncBoot) global.SyncBoot.ready(register);
  else register();
})(typeof window !== 'undefined' ? window : this);
