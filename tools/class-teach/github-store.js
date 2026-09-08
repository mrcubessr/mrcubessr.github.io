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

  global.GitHubStore = {
    config: config, getConfig: getConfig, isReady: isReady,
    load: load, save: save, saveToken: saveToken, loadToken: loadToken
  };
})(typeof window !== 'undefined' ? window : this);
