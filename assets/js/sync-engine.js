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
 *   比较基准 = localStamp(id) = max(本机最后修改时间, 上次同步 _ts)，
 *   即「本机数据真正的版本」，而不是只看「上次同步时间」——
 *   否则本机刚改的新数据会被云端的中间版本顶掉（丢数据）。
 *   · 登录成功 / 周期(5min) → pullAll：远端 _ts > localStamp ⇒ 应用远端，否则本机已是最新
 *   · 本地变更 → 防抖 3s → push：远端 _ts > localStamp 说明云端更新 ——
 *     「远端优先」先应用远端，绝不静默覆盖（remotekept）；否则正常上传
 *   · 写冲突 409 → 重新读取并按同样规则重试一次
 *   · forcePushAll 为危险路径（盲目覆盖云端），必须由 UI 二次确认后才调用
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

  /** 后端选择：CloudBase（手机号账号）优先，否则 GitHub（手动 token） */
  function backend() {
    if (global.CBAuth && global.CBAuth.isLoggedIn() && global.CbStore && global.CbStore.isReady()) {
      return global.CbStore;
    }
    if (global.Account && global.Account.isLoggedIn() && global.CloudStore && global.CloudStore.isReady()) {
      return global.CloudStore;
    }
    return null;
  }
  function CS() { return backend() || global.CloudStore || global.CbStore; }
  function AC() { return global.Account; }
  /** 当前使用的后端名：'supabase' | 'github' | '' */
  function backendName() {
    if (!backend()) return '';
    return (backend() === global.CbStore) ? 'supabase' : 'github';
  }
  function ready() { return !!backend(); }

  function tsKey(id) { return 'sync_ts_' + id; }
  function getTs(id) { try { return parseInt(localStorage.getItem(tsKey(id)) || '0', 10) || 0; } catch (e) { return 0; } }
  function setTs(id, v) { try { localStorage.setItem(tsKey(id), String(v)); } catch (e) {} }

  /* 本机数据的「最后修改时间」。
     仅看 lastTs（上次同步时间）会误判：本机改动后 lastTs 不更新，
     于是「本机刚改的新版」会被当成旧版而被云端中间版本顶掉 → 丢数据。
     用 max(lastTs, 本地最后修改) 作为本机数据版本，才是真正的「最新版」比较。 */
  function modKey(id) { return 'sync_mod_' + id; }
  function getMod(id) { try { return parseInt(localStorage.getItem(modKey(id)) || '0', 10) || 0; } catch (e) { return 0; } }
  function setMod(id, v) { try { localStorage.setItem(modKey(id), String(v)); } catch (e) {} }
  /** 本机数据版本戳：取「本机最后修改」与「已同步基线」的较大者 */
  function localStamp(id) { return Math.max(getTs(id), getMod(id)); }

  function setStat(id, s) {
    stat[id] = Object.assign({ label: (providers[id] && providers[id].label) || id }, stat[id] || {}, s);
    emit();
  }
  /** 记录某次操作的结果（供面板展示「已下载/已上传/已是最新/出错」） */
  function setResult(id, kind, detail) {
    var base = stat[id] || (stat[id] = {});
    base.label = base.label || (providers[id] && providers[id].label) || id;
    base.result = { kind: kind, detail: detail || '', at: Date.now() };
    emit();
  }
  function emit() {
    try { global.dispatchEvent(new CustomEvent('sync:status', { detail: SyncEngine.status() })); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(SyncEngine.status()); } catch (e) {} });
  }
  function wrap(data) { return { _v: FILE_VER, _ts: Date.now(), data: data }; }

  /* ---------------- 单个 scope 的推拉 ---------------- */

  /** 拉取单个 scope：远端更新则写回本地；返回结构化结果 */
  function pullScope(p, force) {
    if (!ready()) return Promise.resolve({ id: p.id, kind: 'skipped', detail: '未就绪' });
    setStat(p.id, { state: 'syncing', error: '' });
    return CS().read(p.path).then(function (r) {
      if (!r || !r.data) { // 云端还没有这个文件 → 把本地推上去
        setTs(p.id, 0);
        return pushScope(p, true).then(function () {
          return { id: p.id, kind: 'uploaded-new', detail: '云端无数据，已上传本机' };
        });
      }
      var remoteTs = r.data._ts || 0;
      var localTs = localStamp(p.id);   // 本机数据的真实版本（含未同步的本地改动）
      if (!force && remoteTs <= localTs) {
        setStat(p.id, { state: 'idle', lastTs: getTs(p.id) });
        setResult(p.id, 'uptodate', '本机已是最新');
        return { id: p.id, kind: 'uptodate', detail: '本机已是最新' };
      }
      applying[p.id] = true;
      return Promise.resolve(p.applySnapshot(r.data.data))
        .then(function () {
          setTs(p.id, remoteTs);
          setStat(p.id, { state: 'idle', lastTs: remoteTs, error: '' });
          setResult(p.id, 'downloaded', '已从云端更新');
          return { id: p.id, kind: 'downloaded', detail: '已从云端更新' };
        })
        .catch(function (e) {
          setStat(p.id, { state: 'error', error: e && e.message || String(e) });
          setResult(p.id, 'error', e && e.message || String(e));
          throw e;
        })
        .then(function (v) { applying[p.id] = false; return v; },
          function (e) { applying[p.id] = false; throw e; });
    }).catch(function (e) {
      setStat(p.id, { state: 'error', error: e && e.message || String(e) });
      setResult(p.id, 'error', e && e.message || String(e));
      return { id: p.id, kind: 'error', detail: e && e.message || String(e) };
    });
  }

  /** 上传单个 scope：LWW；非强制时若远端比本机已同步的还新，则先应用远端（绝不覆盖更新的云端） */
  function pushScope(p, force) {
    if (!ready()) return Promise.resolve({ id: p.id, kind: 'skipped', detail: '未就绪' });
    setStat(p.id, { state: 'syncing', error: '' });
    return Promise.resolve(p.getSnapshot()).then(function (snap) {
      var payload = wrap(snap);
      return CS().read(p.path).then(function (r) {
        var remoteTs = (r && r.data && r.data._ts) || 0;
        var localTs = localStamp(p.id);   // 本机数据的真实版本（含未同步的本地改动）
        // 云端比「本机数据」更新（不只是比上次同步新）→ 远端优先，先应用，绝不覆盖更新的云端
        if (!force && remoteTs > localTs) {
          applying[p.id] = true;
          return Promise.resolve(p.applySnapshot(r.data.data)).then(function () {
            setTs(p.id, remoteTs);
            setStat(p.id, { state: 'idle', lastTs: remoteTs, error: '' });
            setResult(p.id, 'remotekept', '云端更新，已保留云端');
            return { id: p.id, kind: 'remotekept', detail: '云端更新，已保留云端' };
          }).then(function (v) { applying[p.id] = false; return v; },
            function (e) { applying[p.id] = false; throw e; });
        }
        return writeWithRetry(p, payload, 0).then(function () {
          setResult(p.id, 'uploaded', '已备份到云端');
          return { id: p.id, kind: 'uploaded', detail: '已备份到云端' };
        });
      });
    }).catch(function (e) {
      setStat(p.id, { state: 'error', error: e && e.message || String(e) });
      setResult(p.id, 'error', e && e.message || String(e));
      return { id: p.id, kind: 'error', detail: e && e.message || String(e) };
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
          p.subscribe(function () {
            if (applying[p.id]) return;          // 正在应用远端，不算本机改动
            setMod(p.id, Date.now());            // 记录本机修改时间，供「最新版」判定
            schedulePush(p);
          });
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

    /** 登录 / 手动触发：全量拉取本站已注册的所有 scope（只应用比本机新的） */
    pullAll: function (force) {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return pullScope(p, force).catch(function () { return { id: p.id, kind: 'error', detail: '拉取失败' }; });
      }));
    },

    /** 全量上传（安全：云端更新时自动保留云端，不会用旧本机覆盖） */
    pushAll: function () {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return pushScope(p, false).catch(function () { return { id: p.id, kind: 'error', detail: '上传失败' }; });
      }));
    },

    /** 全量强制上传（危险：盲目覆盖云端，UI 必须二次确认后才调用） */
    forcePushAll: function () {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return pushScope(p, true).catch(function () { return { id: p.id, kind: 'error', detail: '上传失败' }; });
      }));
    },

    /** 安全双向同步：先拉云端更新，再推本机改动（均为 LWW，不丢数据） */
    syncAll: function () {
      if (!ready()) return Promise.resolve({ pull: [], push: [] });
      return SyncEngine.pullAll().then(function (pull) {
        return SyncEngine.pushAll().then(function (push) {
          return { pull: pull, push: push };
        });
      });
    },

    /** 检测「上传会覆盖云端较新数据」的 scope，供 UI 二次确认时列出 */
    conflictScopes: function () {
      if (!ready()) return Promise.resolve([]);
      return Promise.all(SyncEngine.providers().map(function (p) {
        return CS().read(p.path).then(function (r) {
          var remoteTs = (r && r.data && r.data._ts) || 0;
          var localTs = localStamp(p.id);   // 与 pushScope 同口径，避免漏报/误报
          if (remoteTs > localTs) return { id: p.id, label: p.label, remoteTs: remoteTs, lastTs: localTs };
          return null;
        }).catch(function () { return null; });
      })).then(function (arr) { return arr.filter(Boolean); });
    },

    /** 单个 scope 的安全同步（绝不盲覆盖：以最新版为准） */
    pull: function (id) { var p = providers[id]; return p ? pullScope(p, false) : Promise.resolve(null); },
    push: function (id) { var p = providers[id]; return p ? pushScope(p, false) : Promise.resolve(null); },
    /** 危险：无条件用云端覆盖本机（必须由用户二次确认后调用） */
    forcePull: function (id) { var p = providers[id]; return p ? pullScope(p, true) : Promise.resolve(null); },
    /** 危险：无条件用本机覆盖云端（必须由用户二次确认后调用） */
    forcePush: function (id) { var p = providers[id]; return p ? pushScope(p, true) : Promise.resolve(null); },

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
    /** 当前使用的后端：'cloudbase' | 'github' | ''（未登录） */
    backend: backendName,

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

  /* ---------------- 账号状态联动（CloudBase / GitHub 通用） ---------------- */
  function onAuthChange() {
    if (AC() && AC().isLoggedIn()) {
      try { AC().applyToCloudStore(); } catch (e) {}
    }
    if (ready()) {
      SyncEngine.start();
      SyncEngine.pullAll();
    } else {
      SyncEngine.stop();
      Object.keys(stat).forEach(function (id) { stat[id] = Object.assign({}, stat[id], { state: 'idle', error: '' }); });
      emit();
    }
  }
  try {
    global.addEventListener('account:change', onAuthChange);   // GitHub 账号
    global.addEventListener('sb:change', onAuthChange);          // Supabase 账号
    global.addEventListener('cb:change', onAuthChange);          // 兼容旧监听
  } catch (e) {}

  // 若脚本加载时已登录，启动一次
  try { if (ready()) { SyncEngine.start(); } } catch (e) {}
  // CloudBase 会话是异步恢复的，恢复后再拉一次
  try {
    if (global.CBAuth && global.CBAuth.onChange) {
      global.CBAuth.onChange(function () { if (ready()) { SyncEngine.start(); SyncEngine.pullAll(); } });
    }
  } catch (e) {}

  global.SyncEngine = SyncEngine;
})(typeof window !== 'undefined' ? window : this);
