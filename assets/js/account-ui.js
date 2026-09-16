/* =============================================================
 * account-ui.js — 导航账号位 + 账号面板（自注入样式，无需改页面 CSS）
 * -------------------------------------------------------------
 * 依赖（由 sync-boot.js 按序加载）：cloud-store / account / sync-engine
 * 行为：
 *   · 导航 .nav-inner 内追加「账号」按钮（未登录=登录同步 / 已登录=@login+状态点）
 *   · 点击打开面板：手动开通 / GitHub 一键登录 / 各功能同步状态 / 强制同步 / 登出
 *   · 若页面无导航，降级为右下角浮动按钮，保证入口可达
 * ============================================================= */
(function (global) {
  'use strict';
  var AC = function () { return global.Account; };
  var SE = function () { return global.SyncEngine; };

  var STYLE_ID = 'acct-ui-style';
  var CSS = [
    '.acct-chip{display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:6px 12px;',
    'font:inherit;font-size:13px;line-height:1;color:var(--fg-2);background:var(--surface-2);',
    'border:1px solid var(--line-2);border-radius:0;cursor:pointer;white-space:nowrap}',
    '.acct-chip:hover{color:var(--on-brand);background:var(--brand);border-color:var(--brand)}',
    '.acct-dot{width:7px;height:7px;flex:0 0 auto;background:var(--fg-3)}',
    '.acct-dot.is-ok{background:var(--green)}',
    '.acct-dot.is-sync{background:var(--amber)}',
    '.acct-dot.is-err{background:var(--red)}',
    '.acct-fab{position:fixed;right:14px;bottom:14px;z-index:60;padding:9px 14px;font:inherit;font-size:13px;',
    'color:var(--on-brand);background:var(--brand);border:1px solid var(--brand);border-radius:0;cursor:pointer}',
    '.acct-mask{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.55);display:flex;',
    'align-items:center;justify-content:center;padding:16px}',
    '.acct-modal{width:100%;max-width:520px;max-height:86vh;overflow:auto;background:var(--surface);',
    'border:1px solid var(--line);border-radius:0;padding:20px;color:var(--fg)}',
    '.acct-modal h3{margin:0 0 4px;font-size:17px}',
    '.acct-modal .sub{color:var(--fg-3);font-size:12.5px;margin-bottom:14px;line-height:1.6}',
    '.acct-sec{border-top:1px solid var(--line);margin-top:14px;padding-top:14px}',
    '.acct-sec h4{margin:0 0 8px;font-size:14px}',
    '.acct-f{display:block;margin-bottom:9px;font-size:12.5px;color:var(--fg-2)}',
    '.acct-f input{display:block;width:100%;margin-top:4px;padding:8px 10px;font:inherit;font-size:13px;',
    'color:var(--fg);background:var(--surface-2);border:1px solid var(--line-2);border-radius:0}',
    '.acct-f input:focus{outline:none;border-color:var(--brand)}',
    '.acct-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.acct-btn{padding:8px 14px;font:inherit;font-size:13px;cursor:pointer;border-radius:0;',
    'background:var(--brand);color:var(--on-brand);border:1px solid var(--brand)}',
    '.acct-btn:hover{filter:brightness(1.08)}',
    '.acct-btn.ghost{background:var(--surface-2);color:var(--fg-2);border:1px solid var(--line-2)}',
    '.acct-btn.ghost:hover{color:var(--on-brand);background:var(--brand);border-color:var(--brand)}',
    '.acct-btn.danger{background:transparent;color:var(--red);border:1px solid var(--red)}',
    '.acct-btn:disabled{opacity:.5;cursor:default}',
    '.acct-msg{margin-top:10px;font-size:12.5px;color:var(--fg-3);line-height:1.6}',
    '.acct-msg.err{color:var(--red)}.acct-msg.ok{color:var(--green)}',
    '.acct-code{font-size:26px;font-weight:700;letter-spacing:3px;text-align:center;padding:12px;',
    'background:var(--surface-2);border:1px dashed var(--line-2);margin:8px 0}',
    '.acct-scope{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13px;border-bottom:1px solid var(--line)}',
    '.acct-scope:last-child{border-bottom:none}',
    '.acct-scope .nm{flex:1 1 auto}',
    '.acct-scope .tm{font-size:11.5px;color:var(--fg-3)}',
    '.acct-empty{font-size:12.5px;color:var(--fg-3)}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ago(ts) {
    if (!ts) return '从未同步';
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return new Date(ts).toLocaleString();
  }

  /* ---------------- 面板 ---------------- */
  var mask = null;

  function closePanel() { if (mask) { mask.remove(); mask = null; } }

  function openPanel() {
    closePanel();
    mask = document.createElement('div');
    mask.className = 'acct-mask';
    mask.innerHTML = '<div class="acct-modal" role="dialog" aria-modal="true" aria-label="账号与同步"></div>';
    mask.addEventListener('click', function (e) { if (e.target === mask) closePanel(); });
    document.body.appendChild(mask);
    renderPanel();

    // 状态变化实时刷新面板
    var off1 = SE() && SE().onStatus ? SE().onStatus(function () { if (mask) renderPanel(); }) : function () {};
    var off2 = function () { if (mask) renderPanel(); };
    AC() && AC().onChange(off2);
    var obs = new MutationObserver(function () { if (!mask) { off1(); try { obs.disconnect(); } catch (e) {} } });
    try { obs.observe(document.body, { childList: true }); } catch (e) {}
  }

  function renderPanel() {
    if (!mask) return;
    var m = mask.querySelector('.acct-modal');
    var A = AC(), S = SE();
    var logged = A && A.isLoggedIn();
    var st = A && A.get();

    if (!logged) {
      m.innerHTML =
        '<h3>账号与跨设备同步</h3>' +
        '<div class="sub">登录后，本站各功能的数据会存到你的 GitHub 私有仓库，' +
        '换设备用同一账号登录即可自动恢复。<b>初期为手动开通</b>，不会自动注册。</div>' +

        '<div class="acct-sec">' +
        '<h4>方式一 · 手动开通（自测最快）</h4>' +
        '<label class="acct-f">GitHub 用户名<input id="acOwner" placeholder="如 mrcubessr" value="' + esc(st && st.owner) + '"></label>' +
        '<label class="acct-f">同步仓库（会自动创建）<input id="acRepo" value="' + esc((st && st.repo) || 'fto-site-sync') + '"></label>' +
        '<label class="acct-f">访问令牌（fine-grained，仅授权本仓库）<input id="acToken" type="password" placeholder="ghp_ / github_pat_..."></label>' +
        '<div class="acct-row"><button class="acct-btn" id="acManual">连接并开通</button></div>' +
        '</div>' +

        '<div class="acct-sec">' +
        '<h4>方式二 · GitHub 一键登录</h4>' +
        '<label class="acct-f">OAuth App 的 client_id（只需填一次）<input id="acCid" value="' + esc(A && A.clientId ? A.clientId() : '') + '"></label>' +
        '<div class="acct-row"><button class="acct-btn ghost" id="acOauth">获取设备码</button></div>' +
        '<div class="acct-msg">如何获取：GitHub 头像 → Settings → Developer settings → OAuth Apps → New OAuth App，' +
        'Authorization callback URL 留空。创建后复制 Client ID。</div>' +
        '</div>' +
        '<div class="acct-msg" id="acMsg"></div>';
      wireLogin(m);
      return;
    }

    // 已登录
    var status = (S && S.status) ? S.status() : {};
    var rows = Object.keys(status).map(function (id) {
      var s = status[id] || {};
      var cls = s.state === 'syncing' ? 'is-sync' : s.state === 'error' ? 'is-err' : (s.lastTs ? 'is-ok' : '');
      var txt = s.state === 'syncing' ? '同步中…' : s.state === 'error' ? ('出错：' + (s.error || '')) : ago(s.lastTs);
      return '<div class="acct-scope"><span class="acct-dot ' + cls + '"></span>' +
        '<span class="nm">' + esc(s.label || id) + '</span><span class="tm">' + esc(txt) + '</span></div>';
    }).join('');

    m.innerHTML =
      '<h3>已登录 @' + esc(st.login || st.owner) + '</h3>' +
      '<div class="sub">同步仓库：<b>' + esc(st.owner) + '/' + esc(st.repo) + '</b>（' + esc(st.branch || 'main') + ' 分支）</div>' +
      '<div class="acct-sec"><h4>各功能同步状态</h4>' +
      (rows || '<div class="acct-empty">本页没有需要同步的功能（其它页面各自同步自己的数据）。</div>') +
      '</div>' +
      '<div class="acct-row">' +
      '<button class="acct-btn" id="acPull">立即拉取</button>' +
      '<button class="acct-btn ghost" id="acPush">强制上传全部</button>' +
      '<button class="acct-btn ghost" id="acForce">强制下载全部</button>' +
      '<button class="acct-btn danger" id="acOut">退出登录</button>' +
      '</div>' +
      '<div class="acct-msg" id="acMsg"></div>';
    wireLogged(m);
  }

  function msg(m, text, cls) {
    var e = m.querySelector('#acMsg');
    if (!e) return;
    e.className = 'acct-msg ' + (cls || '');
    e.textContent = text || '';
  }

  function wireLogin(m) {
    var A = AC();
    m.querySelector('#acManual').onclick = function () {
      var b = this; b.disabled = true; msg(m, '正在连接…');
      A.loginManual({
        owner: m.querySelector('#acOwner').value,
        repo: m.querySelector('#acRepo').value,
        token: m.querySelector('#acToken').value
      }).then(function (r) {
        msg(m, '已开通为 @' + r.login + (r.warn ? '（警告：' + r.warn + '）' : ''), 'ok');
        setTimeout(function () { renderPanel(); refreshChip(); }, 400);
      }).catch(function (e) { msg(m, '开通失败：' + (e && e.message || e), 'err'); b.disabled = false; });
    };
    m.querySelector('#acOauth').onclick = function () {
      var cid = m.querySelector('#acCid').value.trim();
      if (!cid) { msg(m, '请先填写 client_id', 'err'); return; }
      msg(m, '正在申请设备码…');
      A.loginOAuth({
        clientId: cid,
        onCode: function (d) {
          msg(m, '');
          var box = document.createElement('div');
          box.innerHTML = '<div class="acct-sec"><h4>请在 GitHub 输入此设备码</h4>' +
            '<div class="acct-code">' + esc(d.user_code) + '</div>' +
            '<div class="acct-msg">打开 <a href="' + esc(d.verification_uri) + '" target="_blank" rel="noopener">' +
            esc(d.verification_uri) + '</a> 输入上方编码完成授权，本页会自动继续。</div></div>';
          m.appendChild(box);
        }
      }).then(function (r) {
        msg(m, '已登录为 @' + r.login, 'ok');
        setTimeout(function () { renderPanel(); refreshChip(); }, 400);
      }).catch(function (e) { msg(m, '登录失败：' + (e && e.message || e), 'err'); });
    };
  }

  function wireLogged(m) {
    var S = SE(), A = AC();
    m.querySelector('#acPull').onclick = function () {
      var b = this; b.disabled = true; msg(m, '拉取中…');
      S.pullAll().then(function (r) { msg(m, '已拉取 ' + (r || []).length + ' 项', 'ok'); b.disabled = false; renderPanel(); })
        .catch(function (e) { msg(m, '拉取失败：' + e.message, 'err'); b.disabled = false; });
    };
    m.querySelector('#acPush').onclick = function () {
      var b = this; b.disabled = true; msg(m, '上传中…');
      S.pushAll().then(function (r) { msg(m, '已上传 ' + (r || []).length + ' 项', 'ok'); b.disabled = false; renderPanel(); })
        .catch(function (e) { msg(m, '上传失败：' + e.message, 'err'); b.disabled = false; });
    };
    m.querySelector('#acForce').onclick = function () {
      var b = this; b.disabled = true; msg(m, '下载中…');
      S.pullAll(true).then(function (r) { msg(m, '已下载 ' + (r || []).length + ' 项', 'ok'); b.disabled = false; renderPanel(); })
        .catch(function (e) { msg(m, '下载失败：' + e.message, 'err'); b.disabled = false; });
    };
    m.querySelector('#acOut').onclick = function () {
      if (!confirm('退出登录后本机数据仍保留，但不再同步。确定退出？')) return;
      A.logout(); renderPanel(); refreshChip();
    };
  }

  /* ---------------- 导航账号位 ---------------- */
  function chipState() {
    var S = SE();
    var st = (S && S.status) ? S.status() : {};
    var cls = '';
    var anyErr = false, anySync = false, anyTs = 0;
    Object.keys(st).forEach(function (id) {
      var s = st[id] || {};
      if (s.state === 'error') anyErr = true;
      if (s.state === 'syncing') anySync = true;
      if (s.lastTs) anyTs = Math.max(anyTs, s.lastTs);
    });
    if (anyErr) cls = 'is-err'; else if (anySync) cls = 'is-sync'; else if (anyTs) cls = 'is-ok';
    return { cls: cls };
  }

  function refreshChip() {
    var chip = document.getElementById('acctChip');
    if (!chip) return;
    var A = AC();
    var logged = A && A.isLoggedIn();
    var st = A ? A.get() : {};
    var s = chipState();
    chip.innerHTML = logged
      ? '<span class="acct-dot ' + s.cls + '"></span>@' + esc(st.login || st.owner)
      : '登录同步';
    chip.title = logged ? '账号与同步设置' : '登录后可跨设备同步数据';
  }

  function ensureChip() {
    if (document.getElementById('acctChip')) return true;
    var inner = document.querySelector('.nav-inner');
    if (inner) {
      var chip = document.createElement('button');
      chip.id = 'acctChip'; chip.type = 'button'; chip.className = 'acct-chip';
      chip.addEventListener('click', openPanel);
      inner.appendChild(chip);
      refreshChip();
      return true;
    }
    return false;
  }

  function boot() {
    injectStyle();
    var tries = 0;
    (function attempt() {
      if (ensureChip()) { bindUpdates(); return; }
      if (++tries > 40) { // 约 10s 后仍无导航 → 右下角浮动入口
        var fab = document.createElement('button');
        fab.className = 'acct-fab'; fab.id = 'acctChip'; fab.textContent = '账号同步';
        fab.addEventListener('click', openPanel);
        document.body.appendChild(fab);
        refreshChip();
        bindUpdates();
        return;
      }
      setTimeout(attempt, 250);
    })();
  }

  function bindUpdates() {
    if (SE() && SE().onStatus) SE().onStatus(refreshChip);
    if (AC() && AC().onChange) AC().onChange(refreshChip);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  global.AccountUI = { open: openPanel, close: closePanel, refresh: refreshChip };
})(typeof window !== 'undefined' ? window : this);
