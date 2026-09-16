/* =============================================================
 * cloud-store.js — 全站通用「云存储」层（GitHub 私有仓库当数据库）
 * -------------------------------------------------------------
 * 由 tools/class-teach/github-store.js 升格而来，供全站账号同步复用。
 * 纯静态站无后端：token 落在浏览器 localStorage，仅授权单一私有仓库。
 *
 * 相比旧版新增：
 *   · 多路径读写 read(path) / write(obj, path, sha)（每个功能一个文件）
 *   · meta.json 读写 readMeta()/writeMeta()（记录各 scope 同步时间）
 *   · 自动建仓 ensureRepo、Device Flow OAuth、getLogin
 *
 * 兼容旧 API：load()/save(obj) 仍走 cfg.path，class-teach 可继续调用。
 * ============================================================= */
(function (global) {
  'use strict';
  var apiBase = 'https://api.github.com';
  var cfg = { owner: '', repo: '', path: 'data.json', branch: 'main', token: '' };

  var META_PATH = 'meta.json';

  function loadToken() { try { return localStorage.getItem('gh_token') || ''; } catch (e) { return ''; } }
  function saveToken(t) { try { if (t) localStorage.setItem('gh_token', t); else localStorage.removeItem('gh_token'); } catch (e) {} }

  function config(c) {
    if (c) for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cfg[k] = c[k];
    if (!cfg.token) cfg.token = loadToken();
  }
  function getConfig() { return cfg; }
  function isReady() {
    if (cfg.owner && cfg.repo && cfg.token) return true;
    // token 可能后写入，兜底再取一次
    if (!cfg.token) cfg.token = loadToken();
    return !!(cfg.owner && cfg.repo && cfg.token);
  }

  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function ghHeaders() {
    return { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json' };
  }
  function fileUrl(path) {
    return apiBase + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
      encodeURIComponent(path) + '?ref=' + cfg.branch;
  }
  function fileUrlNoRef(path) {
    return apiBase + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodeURIComponent(path);
  }

  /**
   * 通用读取：返回 { data: 已解析对象, sha } 或 null（文件不存在）
   * @param {string} [path] 省略则用 cfg.path
   */
  function read(path) {
    if (!isReady()) return Promise.reject(new Error('未配置 GitHub 仓库或令牌'));
    return fetch(fileUrl(path || cfg.path), { headers: ghHeaders() })
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) return res.json().then(function (e) {
          throw new Error('GitHub 读取失败(' + res.status + ')：' + (e && e.message || ''));
        }, function () { throw new Error('GitHub 读取失败(' + res.status + ')'); });
        return res.json();
      })
      .then(function (data) {
        if (!data) return null;
        try { return { data: JSON.parse(b64ToUtf8(data.content)), sha: data.sha }; }
        catch (e) { return null; }
      });
  }

  function doPut(obj, path, sha, message) {
    var payload = { message: message || 'mrcubessr-site data sync', content: utf8ToB64(JSON.stringify(obj)) };
    if (sha) payload.sha = sha;
    return fetch(fileUrlNoRef(path), {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (e) {
        var err = new Error('GitHub 写入失败(' + res.status + ')：' + (e && e.message || ''));
        err.status = res.status;
        throw err;
      }, function () {
        var err2 = new Error('GitHub 写入失败(' + res.status + ')');
        err2.status = res.status;
        throw err2;
      });
      return res.json();
    });
  }

  /**
   * 通用写入：自动处理新建/更新（更新需 sha）
   * @param {object} obj
   * @param {string} [path] 省略则用 cfg.path
   * @param {string} [sha]  已知 sha 可跳过一次读取；传 null/'auto' 则自动取
   */
  function write(obj, path, sha) {
    if (!isReady()) return Promise.reject(new Error('未配置 GitHub 仓库或令牌'));
    var p = path || cfg.path;
    if (sha) return doPut(obj, p, sha);
    return read(p).then(function (r) { return doPut(obj, p, r ? r.sha : null); }, function (err) {
      if (err && /读取失败\(404\)/.test(err.message)) return doPut(obj, p, null);
      throw err;
    });
  }

  // ===== meta.json：记录各 scope 的同步时间戳 =====
  function readMeta() {
    return read(META_PATH).then(function (r) { return (r && r.data) || {}; },
      function () { return {}; });
  }
  function writeMeta(obj) {
    return read(META_PATH).then(function (r) {
      return doPut(obj, META_PATH, r ? r.sha : null, 'mrcubessr-site meta sync');
    });
  }

  // ===== 兼容旧 API（class-teach 在用）=====
  function load() { return read(cfg.path); }
  function save(obj) { return write(obj, cfg.path); }

  // ===== OAuth 设备流（Device Flow，免 client secret，纯前端可用）=====
  function oauthDeviceCode(clientId, scope) {
    return fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: scope || 'repo' })
    }).then(function (r) { return r.json(); });
  }
  function oauthDeviceToken(clientId, deviceCode) {
    return fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: clientId, device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    }).then(function (r) { return r.json(); });
  }
  function getLogin(token) {
    return fetch(apiBase + '/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.login) throw new Error('无法读取 GitHub 账号');
      return d.login;
    });
  }
  /** 自动建私有仓库（已存在则忽略）。返回 Promise<boolean>（true=新建） */
  function ensureRepo(token, name, description) {
    return fetch(apiBase + '/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name, private: true, auto_init: true,
        description: description || 'mrcubessr-site 数据同步（自动创建）'
      })
    }).then(function (r) {
      if (r.status === 201 || r.status === 200) return true;
      if (r.status === 422) return false; // 已存在
      return r.json().then(function (e) {
        throw new Error('建仓库失败(' + r.status + ')：' + (e && e.message || ''));
      }, function () { throw new Error('建仓库失败(' + r.status + ')'); });
    });
  }

  /**
   * 检查仓库是否可访问（手动开通前先探一次，避免「登录成功但同步一直失败」）
   * @returns Promise<{ok:boolean, missing?:boolean, private?:boolean, error?:string}>
   */
  function checkRepo(owner, repo, token) {
    var o = owner || cfg.owner, r = repo || cfg.repo, t = token || cfg.token;
    if (!o || !r) return Promise.reject(new Error('缺少仓库信息（owner/repo）'));
    return fetch(apiBase + '/repos/' + o + '/' + r, {
      headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/vnd.github+json' }
    }).then(function (res) {
      if (res.ok) {
        return res.json().then(function (d) {
          return { ok: true, private: !!d.private, fullName: d.full_name };
        }, function () { return { ok: true }; });
      }
      if (res.status === 404) return { ok: false, missing: true };
      if (res.status === 401 || res.status === 403) {
        return res.json().then(function (e) {
          return { ok: false, error: '(' + res.status + ') ' + ((e && e.message) || '令牌无效或无权访问该仓库') };
        }, function () { return { ok: false, error: '(' + res.status + ') 令牌无效或无权访问该仓库' }; });
      }
      return res.json().then(function (e) {
        return { ok: false, error: '(' + res.status + ') ' + ((e && e.message) || '') };
      }, function () { return { ok: false, error: '(' + res.status + ')' }; });
    });
  }

  function saveClientId(id) { try { if (id) localStorage.setItem('gh_client_id', id); else localStorage.removeItem('gh_client_id'); } catch (e) {} }
  function loadClientId() { try { return localStorage.getItem('gh_client_id') || ''; } catch (e) { return ''; } }

  global.CloudStore = {
    config: config, getConfig: getConfig, isReady: isReady,
    read: read, write: write,
    readMeta: readMeta, writeMeta: writeMeta,
    load: load, save: save,
    saveToken: saveToken, loadToken: loadToken,
    oauthDeviceCode: oauthDeviceCode, oauthDeviceToken: oauthDeviceToken,
    getLogin: getLogin, ensureRepo: ensureRepo, checkRepo: checkRepo,
    saveClientId: saveClientId, loadClientId: loadClientId
  };
  // 旧名兼容：class-teach 里的 github-store.js 暴露的是 GitHubStore
  if (!global.GitHubStore) global.GitHubStore = global.CloudStore;
})(typeof window !== 'undefined' ? window : this);
