/* =============================================================
 * account-ui.js — 导航账号位 + 账号面板（自注入样式，无需改页面 CSS）
 * -------------------------------------------------------------
 * 依赖（由 sync-boot.js 按序加载）：cloud-store / account / cb-config / cb-auth / cb-store / sync-engine
 * 行为：
 *   · 导航 .nav-inner 内追加「账号」按钮（未登录=登录 / 已登录=手机号或 @login + 状态点）
 *   · 点击打开面板：
 *       - 主方式：手机号 或 邮箱 + 验证码（注册即登录，无需记密码）
 *         默认邮箱（零短信成本），可切到手机号
 *       - 高级折叠：GitHub 仓库手动开通（作者自用/备用通道）
 *   · 若页面无导航，降级为右下角浮动按钮，保证入口可达
 * ============================================================= */
(function (global) {
  'use strict';
  var AC = function () { return global.Account; };
  var CB = function () { return global.CBAuth; };
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
    '.acct-modal .sub a{color:var(--brand)}',
    '.acct-sec{border-top:1px solid var(--line);margin-top:14px;padding-top:14px}',
    '.acct-sec h4{margin:0 0 8px;font-size:14px}',
    '.acct-f{display:block;margin-bottom:9px;font-size:12.5px;color:var(--fg-2)}',
    '.acct-f input{display:block;width:100%;margin-top:4px;padding:9px 10px;font:inherit;font-size:14px;',
    'color:var(--fg);background:var(--surface-2);border:1px solid var(--line-2);border-radius:0}',
    '.acct-f input:focus{outline:none;border-color:var(--brand)}',
    '.acct-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.acct-code-row{display:flex;gap:8px;align-items:stretch}',
    '.acct-code-row input{flex:1 1 auto;min-width:0}',
    '.acct-code-row button{flex:0 0 auto;white-space:nowrap}',
    '.acct-btn{padding:9px 14px;font:inherit;font-size:13px;cursor:pointer;border-radius:0;',
    'background:var(--brand);color:var(--on-brand);border:1px solid var(--brand)}',
    '.acct-btn:hover{filter:brightness(1.08)}',
    '.acct-btn.ghost{background:var(--surface-2);color:var(--fg-2);border:1px solid var(--line-2)}',
    '.acct-btn.ghost:hover{color:var(--on-brand);background:var(--brand);border-color:var(--brand)}',
    '.acct-btn.danger{background:transparent;color:var(--red);border:1px solid var(--red)}',
    '.acct-btn:disabled{opacity:.5;cursor:default;filter:none}',
    '.acct-msg{margin-top:10px;font-size:12.5px;color:var(--fg-3);line-height:1.6}',
    '.acct-msg.err{color:var(--red)}.acct-msg.ok{color:var(--green)}',
    '.acct-code{font-size:26px;font-weight:700;letter-spacing:3px;text-align:center;padding:12px;',
    'background:var(--surface-2);border:1px dashed var(--line-2);margin:8px 0}',
    '.acct-scope{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13px;border-bottom:1px solid var(--line)}',
    '.acct-scope:last-child{border-bottom:none}',
    '.acct-scope .nm{flex:1 1 auto}',
    '.acct-scope .tm{font-size:11.5px;color:var(--fg-3)}',
    '.acct-empty{font-size:12.5px;color:var(--fg-3)}',
    '.acct-backend{display:inline-block;margin-bottom:8px;padding:2px 8px;font-size:11.5px;',
    'color:var(--fg-3);border:1px solid var(--line-2);background:var(--surface-2)}',
    '.acct-uid{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--fg-3);',
    'word-break:break-all;user-select:all;cursor:text}',
    '.acct-fold{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}',
    '.acct-fold>summary{cursor:pointer;font-size:13px;color:var(--fg-2);list-style:none}',
    '.acct-fold>summary::-webkit-details-marker{display:none}',
    '.acct-fold>summary::before{content:"▸ ";color:var(--fg-3)}',
    '.acct-fold[open]>summary::before{content:"▾ "}',
    '.acct-tabs{display:flex;gap:0;margin:2px 0 12px;border:1px solid var(--line-2)}',
    '.acct-tab{flex:1 1 0;padding:9px 8px;font:inherit;font-size:13px;cursor:pointer;text-align:center;',
    'background:var(--surface-2);color:var(--fg-2);border:none;border-right:1px solid var(--line-2)}',
    '.acct-tab:last-child{border-right:none}',
    '.acct-tab.is-on{background:var(--brand);color:var(--on-brand)}',
    '.acct-tab small{display:block;margin-top:2px;font-size:10.5px;opacity:.75}',
    '.acct-tip{font-size:12px;color:var(--fg-3);line-height:1.6;margin:-4px 0 8px}'
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
  /** 13812345678 → 138****5678 */
  function maskPhone(p) {
    p = String(p || '').replace(/^\+86/, '');
    if (p.length < 7) return p;
    return p.slice(0, 3) + '****' + p.slice(-4);
  }
  /** tester@qq.com → te***@qq.com */
  function maskEmail(e) {
    e = String(e || '');
    var i = e.indexOf('@');
    if (i < 2) return e;
    var name = e.slice(0, i), dom = e.slice(i);
    return name.slice(0, 2) + '***' + dom;
  }
  /** 已登录时显示的账号名（优先手机号，其次邮箱） */
  function accountName(u) {
    u = u || {};
    if (u.phone) return maskPhone(u.phone);
    if (u.email) return maskEmail(u.email);
    return '我的账号';
  }

  /* ---------------- 面板 ---------------- */
  var mask = null;
  var cdTimer = null;      // 验证码倒计时
  var cdLeft = 0;
  var curChannel = 'email';// 当前登录通道：email | phone（默认邮箱，零短信成本）

  function closePanel() { if (mask) { mask.remove(); mask = null; } }

  function openPanel() {
    closePanel();
    mask = document.createElement('div');
    mask.className = 'acct-mask';
    mask.innerHTML = '<div class="acct-modal" role="dialog" aria-modal="true" aria-label="账号与同步"></div>';
    mask.addEventListener('click', function (e) { if (e.target === mask) closePanel(); });
    document.body.appendChild(mask);
    renderPanel();

    var off1 = SE() && SE().onStatus ? SE().onStatus(function () { if (mask) renderPanel(); }) : function () {};
    var off2 = function () { if (mask) renderPanel(); };
    if (AC() && AC().onChange) AC().onChange(off2);
    if (CB() && CB().onChange) CB().onChange(off2);
    var obs = new MutationObserver(function () { if (!mask) { off1(); try { obs.disconnect(); } catch (e) {} } });
    try { obs.observe(document.body, { childList: true }); } catch (e) {}
  }

  function msg(m, text, cls) {
    var e = m.querySelector('#acMsg');
    if (!e) return;
    e.className = 'acct-msg ' + (cls || '');
    e.textContent = text || '';
  }

  function statusRows() {
    var S = SE();
    var status = (S && S.status) ? S.status() : {};
    return Object.keys(status).map(function (id) {
      var s = status[id] || {};
      var cls = s.state === 'syncing' ? 'is-sync' : s.state === 'error' ? 'is-err' : (s.lastTs ? 'is-ok' : '');
      var txt = s.state === 'syncing' ? '同步中…' : s.state === 'error' ? ('出错：' + (s.error || '')) : ago(s.lastTs);
      return '<div class="acct-scope"><span class="acct-dot ' + cls + '"></span>' +
        '<span class="nm">' + esc(s.label || id) + '</span><span class="tm">' + esc(txt) + '</span></div>';
    }).join('');
  }

  function renderPanel() {
    if (!mask) return;
    var m = mask.querySelector('.acct-modal');
    var A = AC(), C = CB();

    // ① Supabase 账号已登录
    if (C && C.isLoggedIn()) {
      var u = C.get().user || {};
      var be = (SE() && SE().backend) ? SE().backend() : '';
      m.innerHTML =
        '<h3>' + esc(accountName(u)) + '</h3>' +
        '<div class="acct-backend">云端：' + (be === 'supabase' ? 'Supabase' : 'GitHub 仓库') + '</div>' +
        '<div class="sub">数据已绑定到你的账号，换设备用同一手机号 / 邮箱登录即可恢复。</div>' +
        '<div class="acct-sec"><h4>本页同步状态</h4>' +
        (statusRows() || '<div class="acct-empty">本页没有需要同步的功能（其它页面各自同步自己的数据）。</div>') +
        '</div>' +
        '<div class="acct-row">' +
        '<button class="acct-btn" id="acPull">立即拉取</button>' +
        '<button class="acct-btn ghost" id="acPush">强制上传</button>' +
        '<button class="acct-btn ghost" id="acForce">强制下载</button>' +
        '<button class="acct-btn danger" id="acOut">退出登录</button>' +
        '</div>' +
        '<div class="acct-sec"><div class="acct-uid">UID：' + esc(u.uid || '') + '　（管理员配置需要它）</div></div>' +
        '<div class="acct-msg">本页只同步本页用到的功能；要同步其它功能，打开对应页面即可。' +
        '<a href="/account-help.html" target="_blank" rel="noopener">使用教程</a></div>' +
        '<div class="acct-msg" id="acMsg"></div>';
      wireLogged(m, 'cb');
      return;
    }

    // ② GitHub 账号已登录（旧通道）
    if (A && A.isLoggedIn()) {
      var st = A.get();
      m.innerHTML =
        '<h3>已登录 @' + esc(st.login || st.owner) + '</h3>' +
        '<div class="acct-backend">云端：GitHub 仓库 ' + esc(st.owner) + '/' + esc(st.repo) + '</div>' +
        '<div class="sub">这是备用同步通道。推荐改用手机号 / 邮箱登录，更方便。</div>' +
        '<div class="acct-sec"><h4>本页同步状态</h4>' +
        (statusRows() || '<div class="acct-empty">本页没有需要同步的功能。</div>') +
        '</div>' +
        '<div class="acct-row">' +
        '<button class="acct-btn" id="acPull">立即拉取</button>' +
        '<button class="acct-btn ghost" id="acPush">强制上传</button>' +
        '<button class="acct-btn ghost" id="acForce">强制下载</button>' +
        '<button class="acct-btn danger" id="acOut">退出登录</button>' +
        '</div>' +
        '<div class="acct-msg"><a href="/account-help.html" target="_blank" rel="noopener">使用教程</a></div>' +
        '<div class="acct-msg" id="acMsg"></div>';
      wireLogged(m, 'gh');
      return;
    }

    // ③ 未登录：手机号 / 邮箱验证码登录为主，GitHub 折叠为高级
    var cbOk = !!(C && C.configured());
    var ch = curChannel;
    var head = '<h3>登录 / 注册</h3>' +
      '<div class="sub"><b>不用记密码</b>：填手机号或邮箱 → 收验证码 → 登录。' +
      '首次登录会自动创建账号。<a href="/account-help.html" target="_blank" rel="noopener">使用教程</a></div>';

    var otpSec = cbOk
      ? '<div class="acct-sec">' +
        '<div class="acct-tabs">' +
        '<button type="button" class="acct-tab' + (ch === 'email' ? ' is-on' : '') + '" id="acTabEmail">' +
        '邮箱<small>免费，推荐</small></button>' +
        '<button type="button" class="acct-tab' + (ch === 'phone' ? ' is-on' : '') + '" id="acTabPhone">' +
        '手机号<small>短信(付费)</small></button>' +
        '</div>' +
        '<div class="acct-tip" id="acTip">' + (ch === 'email'
          ? '验证码发到邮箱，不产生短信费用；收不到请检查垃圾邮件。'
          : '手机号验证码走 Supabase 短信服务（需另购 SMS provider），可能产生费用；否则请用邮箱登录。') + '</div>' +
        '<label class="acct-f">' + (ch === 'email' ? '邮箱地址' : '手机号') +
        '<input id="acAccount" type="' + (ch === 'email' ? 'email' : 'tel') + '" ' +
        'inputmode="' + (ch === 'email' ? 'email' : 'numeric') + '" ' +
        (ch === 'phone' ? 'maxlength="11" ' : '') +
        'autocomplete="' + (ch === 'email' ? 'email' : 'tel') + '" ' +
        'placeholder="' + (ch === 'email' ? 'you@example.com' : '11 位手机号') + '"></label>' +
        '<label class="acct-f">验证码' +
        '<div class="acct-code-row"><input id="acOtp" inputmode="numeric" maxlength="10" placeholder="4-10 位验证码">' +
        '<button class="acct-btn ghost" id="acSend" type="button">获取验证码</button></div></label>' +
        '<div class="acct-row"><button class="acct-btn" id="acLogin">登录 / 注册</button></div>' +
        '</div>'
      : '<div class="acct-sec"><div class="acct-msg err">账号登录尚未开通：需要在 assets/js/cb-config.js 填入 Supabase 的 supabaseUrl 与 anonKey。' +
        '<a href="/account-help.html" target="_blank" rel="noopener">查看配置教程</a></div></div>';

    var ghSec = '<details class="acct-fold"' + (cbOk ? '' : ' open') + '><summary>高级：用 GitHub 仓库同步（备用通道）</summary>' +
      '<div style="margin-top:10px">' +
      '<label class="acct-f">GitHub 用户名<input id="acOwner" placeholder="如 mrcubessr" value="' + esc(A && A.get ? A.get().owner : '') + '"></label>' +
      '<label class="acct-f">同步仓库（不会自动创建）<input id="acRepo" value="' + esc((A && A.get && A.get().repo) || 'mrcubessr-site-sync') + '"></label>' +
      '<label class="acct-f">访问令牌（fine-grained，仅授权本仓库）<input id="acToken" type="password" placeholder="ghp_ / github_pat_..."></label>' +
      '<div class="acct-row"><button class="acct-btn ghost" id="acManual">连接并开通</button></div>' +
      '<div class="acct-msg">仓库需先在 GitHub 建好（Private + 勾 Add a README），令牌权限选 <b>Contents: Read and write</b>。</div>' +
      '</div></details>';

    m.innerHTML = head + otpSec + ghSec + '<div class="acct-msg" id="acMsg"></div>';
    if (cbOk) wireOtp(m);
    wireGithub(m);
  }

  /* ---------------- 手机号 / 邮箱验证码登录 ---------------- */
  function startCountdown(m) {
    var btn = m.querySelector('#acSend');
    if (!btn) return;
    cdLeft = 60;
    if (cdTimer) clearInterval(cdTimer);
    btn.disabled = true;
    btn.textContent = cdLeft + ' 秒后重发';
    cdTimer = setInterval(function () {
      cdLeft--;
      if (cdLeft <= 0) {
        clearInterval(cdTimer); cdTimer = null;
        if (btn) { btn.disabled = false; btn.textContent = '重新获取'; }
        return;
      }
      if (btn) btn.textContent = cdLeft + ' 秒后重发';
    }, 1000);
  }

  function setChannel(m, ch) {
    if (ch === curChannel) return;
    curChannel = ch;
    renderPanel();
    var acc = m.querySelector('#acAccount');
    if (acc) acc.focus();
  }

  function acctPlaceholder() {
    return curChannel === 'email' ? '手机号或邮箱' : '手机号';
  }

  function wireOtp(m) {
    var C = CB();
    var tE = m.querySelector('#acTabEmail');
    var tP = m.querySelector('#acTabPhone');
    if (tE) tE.onclick = function () { setChannel(m, 'email'); };
    if (tP) tP.onclick = function () { setChannel(m, 'phone'); };

    m.querySelector('#acSend').onclick = function () {
      var val = (m.querySelector('#acAccount').value || '').trim();
      if (!val) { msg(m, '请先填写' + acctPlaceholder(), 'err'); return; }
      var b = this; b.disabled = true; b.textContent = '发送中…';
      msg(m, '正在发送验证码…');
      C.sendCode(val, curChannel).then(function () {
        msg(m, curChannel === 'email' ? '验证码已发送到邮箱，请查收（注意垃圾邮件）' : '验证码已发送，请查收短信', 'ok');
        startCountdown(m);
        var otp = m.querySelector('#acOtp'); if (otp) otp.focus();
      }).catch(function (e) {
        b.disabled = false; b.textContent = '获取验证码';
        msg(m, '发送失败：' + (e && e.message ? e.message : e), 'err');
      });
    };

    m.querySelector('#acLogin').onclick = function () {
      var code = (m.querySelector('#acOtp').value || '').trim();
      if (!code) { msg(m, '请输入验证码', 'err'); return; }
      var b = this; b.disabled = true;
      msg(m, '正在验证…');
      C.verifyCode(code).then(function (user) {
        msg(m, '登录成功' + (user ? '：' + accountName(user) : ''), 'ok');
        setTimeout(function () { renderPanel(); refreshChip(); }, 400);
      }).catch(function (e) {
        b.disabled = false;
        msg(m, '验证失败：' + (e && e.message ? e.message : e), 'err');
      });
    };

    // 回车直接触发登录
    var acc = m.querySelector('#acAccount');
    var otp = m.querySelector('#acOtp');
    if (otp) otp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var l = m.querySelector('#acLogin'); if (l) l.click(); }
    });
    if (acc) acc.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var s = m.querySelector('#acSend'); if (s && !s.disabled) s.click(); }
    });
  }

  /* ---------------- GitHub 手动开通（备用） ---------------- */
  function wireGithub(m) {
    var A = AC();
    var btn = m.querySelector('#acManual');
    if (!btn || !A) return;
    btn.onclick = function () {
      var b = this; b.disabled = true; msg(m, '正在连接…');
      A.loginManual({
        owner: (m.querySelector('#acOwner').value || '').trim(),
        repo: (m.querySelector('#acRepo').value || '').trim(),
        token: (m.querySelector('#acToken').value || '').trim()
      }).then(function (r) {
        msg(m, '已开通为 @' + r.login + (r.warn ? '（警告：' + r.warn + '）' : ''), 'ok');
        setTimeout(function () { renderPanel(); refreshChip(); }, 400);
      }).catch(function (e) { msg(m, '开通失败：' + (e && e.message || e), 'err'); b.disabled = false; });
    };
  }

  /* ---------------- 已登录 ---------------- */
  function wireLogged(m, kind) {
    var S = SE();
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
      if (!confirm('退出后本机数据仍保留，但不再同步。确定退出？')) return;
      if (kind === 'cb' && CB()) CB().signOut();
      else if (AC()) AC().logout();
      renderPanel(); refreshChip();
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
    var A = AC(), C = CB();
    var s = chipState();
    var txt = '登录', title = '登录后可跨设备同步数据';

    if (C && C.isLoggedIn()) {
      var u = C.get().user || {};
      txt = accountName(u);
      title = '已登录（' + (u.uid || '') + '）· 账号与同步设置';
    } else if (A && A.isLoggedIn()) {
      var st = A.get();
      txt = '@' + (st.login || st.owner);
      title = 'GitHub 同步 · 账号与同步设置';
    }

    chip.innerHTML = (txt === '登录') ? '登录' : '<span class="acct-dot ' + s.cls + '"></span>' + esc(txt);
    chip.title = title;
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
    if (CB() && CB().onChange) CB().onChange(refreshChip);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  global.AccountUI = { open: openPanel, close: closePanel, refresh: refreshChip };
})(typeof window !== 'undefined' ? window : this);
