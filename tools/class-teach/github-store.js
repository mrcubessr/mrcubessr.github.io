// github-store.js — 用 GitHub 私有仓库当"云端数据库"（单人自用版，无需后端）
// 原理：通过 GitHub Contents API 把数据以 JSON 文件读写到你的私有仓库。
// 数据落在 GitHub 服务器上 = 云端；换设备带同一 token 登录即同步。
// 注意：token 会出现在前端代码中（纯静态站无后端可藏），仅限自用 + 细粒度 token 只授权一个仓库。
(function (global) {
  'use strict';
  var apiBase = 'https://api.github.com';
  var cfg = { owner: '', repo: '', path: 'class-teach/data.json', branch: 'main', token: '' };

  function loadToken() { try { return localStorage.getItem('gh_token') || ''; } catch (e) { return ''; } }
  function saveToken(t) { try { if (t) localStorage.setItem('gh_token', t); else localStorage.removeItem('gh_token'); } catch (e) {} }

  function config(c) {
    if (c) for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) cfg[k] = c[k];
    if (!cfg.token) cfg.token = loadToken();
  }
  function getConfig() { return cfg; }
  function isReady() { return !!(cfg.owner && cfg.repo && cfg.token); }

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

  // 读取文件：返回 { data: 已解析对象, sha } 或 null（文件不存在）
  function load() {
    if (!isReady()) return Promise.reject(new Error('未配置 GitHub 仓库或令牌'));
    var url = apiBase + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' +
      encodeURIComponent(cfg.path) + '?ref=' + cfg.branch;
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json' }
    }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) return res.json().then(function (e) { throw new Error('GitHub 读取失败(' + res.status + ')：' + (e && e.message || '')); },
        function () { throw new Error('GitHub 读取失败(' + res.status + ')'); });
      return res.json();
    }).then(function (data) {
      if (!data) return null;
      return { data: JSON.parse(b64ToUtf8(data.content)), sha: data.sha };
    });
  }

  // 保存对象：自动处理新建/更新（更新需 sha）
  function save(obj) {
    if (!isReady()) return Promise.reject(new Error('未配置 GitHub 仓库或令牌'));
    function doPut(sha) {
      var payload = { message: 'class-teach data sync', content: utf8ToB64(JSON.stringify(obj)) };
      if (sha) payload.sha = sha;
      return fetch(apiBase + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodeURIComponent(cfg.path), {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + cfg.token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error('GitHub 写入失败(' + res.status + ')：' + (e && e.message || '')); },
          function () { throw new Error('GitHub 写入失败(' + res.status + ')'); });
        return res.json();
      });
    }
    // 先取 sha（文件存在则更新，否则新建）
    return load().then(function (r) { return doPut(r ? r.sha : null); }, function (err) {
      // 404 = 文件不存在，直接新建；其他错误抛出
      if (err && /读取失败\(404\)/.test(err.message)) return doPut(null);
      throw err;
    });
  }

  // ===== OAuth 设备流（Device Flow，免 client secret，纯前端可用）=====
  // 申请设备码：返回 { device_code, user_code, verification_uri, expires_in, interval }
  function oauthDeviceCode(clientId, scope) {
    return fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: scope || 'repo' })
    }).then(function (r) { return r.json(); });
  }
  // 轮询换取令牌：成功返回 { access_token }；未授权返回 { error:'authorization_pending' }
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
  // 用令牌取登录名（owner）
  function getLogin(token) {
    return fetch(apiBase + '/user', {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.login) throw new Error('无法读取 GitHub 账号');
      return d.login;
    });
  }
  // 自动建私有仓库（已存在则忽略）。返回 Promise<boolean>（true=新建）
  function ensureRepo(token, name) {
    return fetch(apiBase + '/user/repos', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, private: true, auto_init: true, description: 'class-teach 备份（自动同步）' })
    }).then(function (r) {
      if (r.status === 201 || r.status === 200) return true;
      if (r.status === 422) return false; // 已存在
      return r.json().then(function (e) { throw new Error('建仓库失败(' + r.status + ')：' + (e && e.message || '')); },
        function () { throw new Error('建仓库失败(' + r.status + ')'); });
    });
  }
  function saveClientId(id) { try { if (id) localStorage.setItem('gh_client_id', id); else localStorage.removeItem('gh_client_id'); } catch (e) {} }
  function loadClientId() { try { return localStorage.getItem('gh_client_id') || ''; } catch (e) { return ''; } }

  global.GitHubStore = {
    config: config, getConfig: getConfig, isReady: isReady,
    load: load, save: save, saveToken: saveToken, loadToken: loadToken,
    oauthDeviceCode: oauthDeviceCode, oauthDeviceToken: oauthDeviceToken,
    getLogin: getLogin, ensureRepo: ensureRepo,
    saveClientId: saveClientId, loadClientId: loadClientId
  };
})(typeof window !== 'undefined' ? window : this);
