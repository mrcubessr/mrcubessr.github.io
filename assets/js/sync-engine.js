/* =============================================================
 * sync-engine.js — 全站统一同步引擎
 * -------------------------------------------------------------
 * 依赖：assets/js/cloud-store.js、assets/js/account.js（先于本文件引入）
 *
 * 每个功能注册一个 Provider：
 *   SyncEngine.register({
 *     id: 'srs',                      // 唯一
 *     label: '记忆卡',                 // 面板展示名
 *     path: 'srs.json',               // 仓库内文件
 *     getSnapshot: () => Promise<obj>,// 本地数据 → 可序列化对象
 *     applySnapshot: (obj) => Promise,// 远端对象 → 写回本地
 *     subscribe: (cb) => unsub        // 本地变更回调（触发防抖上传）
 *   });
 *
 * 策略（用户已拍板：LWW 最后写入胜）
 *   · 登录成功 / 周期(5min) → pullAll：远端 _ts > 本机已同步 ts ⇒ 应用远端
 *   · 本地变更 → 防抖 3s → push：以 now 写入；若远端比本机已同步的还新，
 *     说明另一台设备刚写过 —— 此时「远端优先」先应用远端，避免静默覆盖
 *   · 写冲突 409 → 重新读取并按同样规则重试一次
 *   · 强制上传/下载按钮处理极端情况
 * ============================================================= */
(function (global) {
  'use strict';

  var PUSH_DEBOUNCE = 3000;   // 本地变更后防抖上传
  var PULL_INTERVAL = 300000; // 周期拉取 5 分钟
  var FILE_VER = 1;

  var providers = {};   // id -> provider
  var timers = {};      // id -> push debounce timer
  var applying = {};    // id -> bool，应用远端期间抑制回弹上传
  var stat = {};        // id -> {state,lastTs,error,label}
  var listeners = [];
  var started = false;
  var pullTimer = null;

  function CS() { return global.CloudStore; }
  function AC() { return global.Account; }
  function ready() {
    return !!(CS() && AC() && AC().isLoggedIn() && CS().isReady());
  }

  function tsKey(id) { return 'sync_ts_' + id; }
  function getTs(id) { try { return parseInt(localStorage.getItem(tsKey(id)) || '0', 10) || 0; } catch (e) { return 0; } }
  function setTs(id, v) { try { localStorage.setItem(tsKey(id), String(v)); } catch (e) {} }

  function setStat(id, s) {
    stat[id] = Object.assign({ label: (providers[id] && providers[id].label) || id }, stat[id] || {}, s);
    emit();
  }
  function emit() {
    try { global.dispatchEvent(new CustomEvent('sync:status', { detail: SyncEngine.status() })); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(SyncEngine.status()); } catch (e) {} });
  }
  function wrap(data) { return { _v: FILE_VER, _ts: Date.now(), data: data }; }

  /* ---------------- 单个 scope 的推拉 ---------------- */

  /** 拉取单个 scope：远端更新则写回本地 */
  function pullScope(p, force) {
    if (!ready()) return Promise.resolve(null);
    setStat(p.id, { state: 'syncing', error: '' });
    return CS().read(p.path).then(function (r) {
      if (!r || !r.data) { // 云端还没有这个文件 → 把本地推上去
        setTs(p.id, 0);
        return pushScope(p, true).then(function () { return 'pushed-new'; });
      }
      var remoteTs = r.data._ts || 0;
      var localTs = getTs(p.id);
      if (!force && remoteTs <= localTs) { setStat(p.id, { state: 'idle', lastTs: localTs }); return 'up-to-date'; }
      applying[p.id] = true;
      return Promise.resolve(p.applySnapshot(r.data.data))
        .then(function () {
          setTs(p.id, remoteTs);
          setStat(p.id, { state: 'idle', lastTs: remoteTs, error: '' });
          return 'applied';
        })
        .catch(function (e) {
          setStat(p.id, { state: 'error', error: e && e.message || String(e) });
          throw e;
        })
        .then(function (v) { applying[p.id] = false; return v; },
          function (e) { applying[p.id] = false; throw e; });
    }).catch(function (e) {
      setStat(p.id, { state: 'error', error: e && e.message || String(e) });
      return null;
    });
  }

  /** 上传单个 scope：LWW；若远端比本机已同步的还新，则先应用远端（远端优先） */
  function pushScope(p, force) {
    if (!ready()) return Promise.resolve(null);
    setStat(p.id, { state: 'syncing', error: '' });
    return Promise.resolve(p.getSnapshot()).then(function (snap) {
      var payload = wrap(snap);
      return CS().read(p.path).then(function (r) {
        var remoteTs = (r && r.data && r.data._ts) || 0;
        var localTs = getTs(p.id);
        // 远端有本机没见过的新数据，且非强制上传 → 远端优先，先应用
        if (!force && remoteTs > localTs) {
          applying[p.id] = true;
          return Promise.resolve(p.applySnapshot(r.data.data)).then(function () {
            setTs(p.id, remoteTs);
            setStat(p.id, { state: 'idle', lastTs: remoteTs, error: '' });
            return 'remote-newer-applied';
          }).then(function (v) { applying[p.id] = false; return v; },
            function (e) { applying[p.id] = false; throw e; });
        }
        return writeWithRetry(p, payload, 0);
      });
    }).catch(function (e) {
      setStat(p.id, { state: 'error', error: e && e.message || String(e) });
      return null;
    });
  }

  function writeWithRetry(p, payload, attempt) {
    var sha = null;
    return CS().read(p.path).then(function (r) {
      sha = r ? r.sha : null;
      return CS().write(payload, p.path, sha);
    }).then(function () {
      setTs(p.id, payload._ts);
      setStat(p.id, { state: 'idle', lastTs: payload._ts, error: '' });
      return 'pushed';
    }).catch(function (e) {
      // 409 并发：重读一次再写（LWW：仍以本机 now 时间戳为准）
      if ((e && e.status === 409 || /\(409\)/.test((e && e.message) || '')) && attempt < 1) {
        return writeWithRetry(p, wrap(payload.data), attempt + 1);
      }
      throw e;
    });
  }

  function schedulePush(p) {
    if (timers[p.id]) clearTimeout(timers[p.id]);
    timers[p.id] = setTimeout(function () {
      timers[p.id] = null;
      if (applying[p.id]) return; // 正在应用远端，忽略回弹
      pushScope(p);
    }, PUSH_DEBOUNCE);
  }

  /* ---------------- 对外 API ---------------- */

  var SyncEngine = {
    register: function (p) {
      if (!p || !p.id) throw new Error('Provider 需要 id');
      p.path = p.path || (p.id + '.json');
      p.label = p.label || p.id;
      providers[p.id] = p;
      stat[p.id] = stat[p.id] || { state: 'idle', lastTs: getTs(p.id), error: '', label: p.label };

      // 订阅本地变更 → 防抖上传
      if (typeof p.subscribe === 'function') {
        try {
          p.subscribe(function () { if (!applying[p.id]) schedulePush(p); });
        } catch (e) { /* 订阅失败不影响其它功能 */ }
      }

      // 已登录则立即拉一次
      if (ready()) pullScope(p);
      emit();
      return p;
    },

    unregister: function (id) {
      if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; }
      delete providers[id];
      emit();
    },

    providers: function () { return Object.keys(providers).map(function (k) { return providers[k]; }); },

    /** 登录 / 手动触发：全量拉取本站已注册的所有 scope */
    pullAll: function (force) {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return pullScope(p, force).catch(function () { return null; });
      }));
    },

    /** 全量强制上传 */
    pushAll: function () {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return pushScope(p, true).catch(function () { return null; });
      }));
    },

    pull: function (id) { var p = providers[id]; return p ? pullScope(p, true) : Promise.resolve(null); },
    push: function (id) { var p = providers[id]; return p ? pushScope(p, true) : Promise.resolve(null); },

    status: function () {
      var out = {};
      Object.keys(providers).forEach(function (id) {
        out[id] = Object.assign({ lastTs: getTs(id) }, stat[id] || {});
      });
      return out;
    },
    onStatus: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    isReady: ready,

    /** 启动周期拉取（登录后可调用；引擎也会在登录事件时自动调用） */
    start: function () {
      if (started) return;
      started = true;
      if (pullTimer) clearInterval(pullTimer);
      pullTimer = setInterval(function () {
        if (!ready()) return;
        if (global.document && global.document.hidden) return; // 后台标签页不打扰
        SyncEngine.pullAll();
      }, PULL_INTERVAL);
    },
    stop: function () {
      started = false;
      if (pullTimer) { clearInterval(pullTimer); pullTimer = null; }
    }
  };

  /* ---------------- 账号状态联动 ---------------- */
  function onAccountChange() {
    if (AC() && AC().isLoggedIn()) {
      AC().applyToCloudStore();
      SyncEngine.start();
      SyncEngine.pullAll();
    } else {
      SyncEngine.stop();
      Object.keys(stat).forEach(function (id) { stat[id] = Object.assign({}, stat[id], { state: 'idle', error: '' }); });
      emit();
    }
  }
  try {
    global.addEventListener('account:change', onAccountChange);
  } catch (e) {}

  // 若脚本加载时已登录，启动一次
  try { if (ready()) { SyncEngine.start(); } } catch (e) {}

  global.SyncEngine = SyncEngine;
})(typeof window !== 'undefined' ? window : this);
