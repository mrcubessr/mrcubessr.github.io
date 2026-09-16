/* =============================================================
 * account.js — 全站统一账号（单例）
 * -------------------------------------------------------------
 * 把 class-teach 已有的 GitHub 账号体系抽成全站通用：
 *   · 登录方式 A：OAuth 设备流（填一次 client_id，无 client secret）
 *   · 登录方式 B：手动开通（直接填 owner/repo/token，自用测试最快）
 *   · 登录后自动确保私有仓库存在（OAuth 模式）
 *   · 状态变更广播 window 事件 'account:change' + Account.onChange
 *
 * 迁移：首次读取时若新键为空但存在 class-teach 旧键（gh_token/gh_owner/gh_repo），
 *       自动继承，已登录用户不会被登出。
 * 安全：token 仅存本机 localStorage，请用「仅授权该仓库」的 fine-grained token。
 * ============================================================= */
(function (global) {
  'use strict';

  var DEFAULT_REPO = 'mrcubessr-site-sync';
  var DEFAULT_BRANCH = 'main';

  var K = {
    token: 'acct_token', owner: 'acct_owner', repo: 'acct_repo',
    branch: 'acct_branch', login: 'acct_login', clientId: 'acct_client_id', mode: 'acct_mode'
  };
  // class-teach 旧键（用于一次性继承）
  var LEG = { token: 'gh_token', owner: 'gh_owner', repo: 'gh_repo' };

  function ls(k, d) { try { return localStorage.getItem(k) || d || ''; } catch (e) { return d || ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  /** 仅继承旧 class-teach 登录信息（若新键为空） */
  function migrateLegacy() {
    if (ls(K.token)) return;
    var t = ls(LEG.token); if (!t) return;
    lsSet(K.token, t);
    lsSet(K.owner, ls(LEG.owner));
    lsSet(K.repo, ls(LEG.repo) || DEFAULT_REPO);
    lsSet(K.branch, DEFAULT_BRANCH);
    // login 未知，用 owner 顶上（owner 一般就是用户名）
    lsSet(K.login, ls(LEG.owner));
    lsSet(K.mode, 'legacy');
  }

  var state = null; // 缓存 {login, owner, repo, branch, token, mode}
  var listeners = [];

  function readState() {
    migrateLegacy();
    return {
      token: ls(K.token),
      owner: ls(K.owner),
      repo: ls(K.repo) || DEFAULT_REPO,
      branch: ls(K.branch) || DEFAULT_BRANCH,
      login: ls(K.login),
      mode: ls(K.mode) || (ls(K.token) ? 'manual' : '')
    };
  }
  function writeState(s) {
    lsSet(K.token, s.token); lsSet(K.owner, s.owner); lsSet(K.repo, s.repo);
    lsSet(K.branch, s.branch); lsSet(K.login, s.login); lsSet(K.mode, s.mode);
    state = s;
  }
  function emit() {
    try { global.dispatchEvent(new CustomEvent('account:change', { detail: Account.get() })); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(Account.get()); } catch (e) {} });
  }

  var Account = {
    /** 当前账号（不含完整 token 语义，供 UI 展示） */
    get: function () {
      if (!state) state = readState();
      return state;
    },
    isLoggedIn: function () { var s = Account.get(); return !!(s.token && s.owner && s.repo); },
    /** 供 CloudStore 使用的配置 */
    cloudConfig: function () {
      var s = Account.get();
      return { owner: s.owner, repo: s.repo, branch: s.branch, token: s.token };
    },
    /** 把当前账号写入 CloudStore（每次登录/登出后调用） */
    applyToCloudStore: function () {
      if (global.CloudStore) global.CloudStore.config(Account.cloudConfig());
    },

    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    /* ---- 登录方式 B：手动开通（填 token） ---- */
    loginManual: function (o) {
      o = o || {};
      var owner = (o.owner || '').trim();
      var repo = (o.repo || DEFAULT_REPO).trim();
      var token = (o.token || '').trim();
      var branch = (o.branch || DEFAULT_BRANCH).trim();
      if (!owner || !token) return Promise.reject(new Error('请填写 用户名 与 令牌'));
      var CS = global.CloudStore;
      if (!CS) return Promise.reject(new Error('cloud-store.js 未加载'));
      CS.config({ owner: owner, repo: repo, branch: branch, token: token });

      // 先探仓库：不存在则尝试自动建（fine-grained 令牌无建仓权限时会失败 → 给明确指引）
      return CS.checkRepo(owner, repo, token).then(function (r) {
        if (r && r.ok) return null;                 // 仓库可访问，继续
        if (r && r.missing) {
          return CS.ensureRepo(token, repo).then(function () { return null; })
            .catch(function () {
              throw new Error('仓库 ' + owner + '/' + repo + ' 不存在，且当前令牌无法自动创建。' +
                '请到 GitHub 右上角 + → New repository，名称填 ' + repo +
                '、勾选 Private 和 Add a README file 创建后，再回来连接。');
            });
        }
        throw new Error('无法访问仓库 ' + owner + '/' + repo + ' ' + ((r && r.error) || '') +
          '。请确认：①令牌授权了该仓库 ②权限为 Contents: Read and write ③令牌未过期。');
      }).then(function () {
        // 校验令牌并取真实登录名
        return CS.getLogin(token).then(function (login) {
          writeState({ token: token, owner: owner, repo: repo, branch: branch, login: login, mode: 'manual' });
          Account.applyToCloudStore();
          emit();
          return { login: login, owner: owner, repo: repo };
        }, function (err) {
          // 令牌可能无 user 读权限，退化为用 owner 作 login
          writeState({ token: token, owner: owner, repo: repo, branch: branch, login: owner, mode: 'manual' });
          Account.applyToCloudStore();
          emit();
          return { login: owner, owner: owner, repo: repo, warn: err && err.message };
        });
      });
    },

    /* ---- 登录方式 A：OAuth 设备流 ---- */
    /**
     * @param {object} o {clientId, onCode({user_code, verification_uri, expires_in})}
     * @returns Promise<{login, owner, repo}>
     */
    loginOAuth: function (o) {
      o = o || {};
      var clientId = (o.clientId || '').trim() || ls(K.clientId);
      if (!clientId) return Promise.reject(new Error('缺少 OAuth App 的 client_id'));
      lsSet(K.clientId, clientId);
      var CS = global.CloudStore;
      if (!CS) return Promise.reject(new Error('cloud-store.js 未加载'));

      return CS.oauthDeviceCode(clientId, 'repo').then(function (d) {
        if (!d || !d.device_code) throw new Error('申请设备码失败：' + (d && (d.error_description || d.error) || ''));
        if (typeof o.onCode === 'function') {
          o.onCode({ user_code: d.user_code, verification_uri: d.verification_uri || 'https://github.com/login/device', expires_in: d.expires_in });
        }
        return poll(clientId, d.device_code, (d.interval || 5) * 1000);
      }).then(function (token) {
        return CS.getLogin(token).then(function (login) {
          return CS.ensureRepo(token, DEFAULT_REPO).then(function () {
            writeState({ token: token, owner: login, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, login: login, mode: 'oauth' });
            Account.applyToCloudStore();
            emit();
            return { login: login, owner: login, repo: DEFAULT_REPO };
          });
        });
      });
    },

    logout: function () {
      [K.token, K.owner, K.repo, K.branch, K.login, K.mode].forEach(function (k) { lsSet(k, ''); });
      // 同时清掉 class-teach 旧键，避免被重新继承
      [LEG.token, LEG.owner, LEG.repo].forEach(function (k) { lsSet(k, ''); });
      state = null;
      Account.applyToCloudStore();
      emit();
    },

    DEFAULT_REPO: DEFAULT_REPO,
    DEFAULT_BRANCH: DEFAULT_BRANCH,
    clientId: function (v) {
      if (v === undefined) return ls(K.clientId);
      lsSet(K.clientId, v); return v;
    }
  };

  // 轮询换取 token
  function poll(clientId, deviceCode, interval) {
    var CS = global.CloudStore;
    var deadline = Date.now() + 10 * 60 * 1000; // 最多等 10 分钟
    function once() {
      if (Date.now() > deadline) return Promise.reject(new Error('登录超时，请重试'));
      return CS.oauthDeviceToken(clientId, deviceCode).then(function (r) {
        if (r && r.access_token) return r.access_token;
        if (r && r.error === 'authorization_pending') {
          return new Promise(function (res, rej) { setTimeout(function () { once().then(res, rej); }, interval); });
        }
        throw new Error('授权失败：' + (r && (r.error_description || r.error) || '未知错误'));
      });
    }
    return once();
  }

  // 启动时同步一次到 CloudStore（若已登录）
  try {
    if (Account.isLoggedIn()) Account.applyToCloudStore();
    else if (global.CloudStore) global.CloudStore.config({ owner: ls(K.owner), repo: ls(K.repo) || DEFAULT_REPO, branch: DEFAULT_BRANCH, token: '' });
  } catch (e) {}

  global.Account = Account;
})(typeof window !== 'undefined' ? window : this);
