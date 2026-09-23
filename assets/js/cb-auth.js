/* =============================================================
 * cb-auth.js — Supabase 账号（邮箱 / 手机号验证码，注册即登录，免记密码）
 * -------------------------------------------------------------
 * 依赖：assets/js/cb-config.js（先于本文件加载）
 *
 * 设计：
 *   · 支持两种通道：邮箱验证码（免费）与手机号短信验证码（Supabase 短信需另购 SMS provider）
 *     两者仅「发送验证码」目标不同，校验/登录流程完全一致（signInWithOtp → verifyOtp）
 *   · 用户不存在时 shouldCreateUser:true 自动注册并登录
 *   · 会话由 SDK 持久化（Supabase 默认 localStorage 存储，自动续期）
 *   · 状态变更广播 window 事件 'sb:change'（并附带 'cb:change' 以兼容旧监听）
 *   · 未配置 url/key 时，所有登录相关方法 reject 并给出指引，不影响页面其它功能
 *
 * 版本：使用 @supabase/supabase-js v2（UMD 全局名 window.supabase）
 * 对外：ensure / sendCode / verifyCode / getUser / signOut / isLoggedIn / onChange / client / refresh
 * ============================================================= */
(function (global) {
  'use strict';

  /* 兜底 SDK：仅在 cb-config 既没配 sdkUrl 也没配 sdkFallbackUrl 时使用。
     仍然写死具体版本号，绝不使用 `@2` 这类浮动标签（上游一发新版就会换掉用户手里的代码）。 */
  var DEFAULT_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js';

  /* 超时：单次登录/验证码请求到点就中断并给出可操作提示，避免"一直转圈、用户不知道发生了什么" */
  var REQ_TIMEOUT_MS = 20000;
  var SDK_TIMEOUT_MS = 15000;
  var TIMEOUT_MARK = '__wb_timeout__';

  var state = {
    sdkReady: false,
    client: null,          // supabase 客户端
    user: null,            // { uid, phone, email, nickName }
    error: '',
    pending: null          // 待验证句柄：{ channel, account }
  };
  var subs = [];
  var sdkPromise = null;

  function cfg() { return global.CB_CONFIG || {}; }

  function emit() {
    var snap = CBAuth.get();
    try { global.dispatchEvent(new CustomEvent('sb:change', { detail: snap })); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent('cb:change', { detail: snap })); } catch (e) {}
    subs.forEach(function (fn) { try { fn(snap); } catch (e) {} });
  }

  /** 规范化手机号：支持 11 位国内号，可带 +86 */
  function normPhone(phone, withCode) {
    var p = String(phone || '').replace(/[\s-]/g, '');
    if (p.indexOf('+') === 0) return withCode ? p : p.replace(/^\+86/, '');
    if (/^86\d{11}$/.test(p)) p = p.slice(2);
    if (!/^\d{11}$/.test(p)) return p;
    return withCode ? ('+86 ' + p) : p;
  }

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function normEmail(email) { return String(email || '').trim().toLowerCase(); }

  /** 自动识别通道：手机号 / 邮箱 */
  function detectChannel(account) {
    var a = String(account || '').trim();
    if (RE_EMAIL.test(a)) return 'email';
    if (/^(\+?86)?\d{11}$/.test(a.replace(/[\s-]/g, ''))) return 'phone';
    return '';
  }

  /* ---------- 错误汉化：把英文/原始报错翻成"看得懂 + 知道怎么办"的中文 ----------
     匹配优先看结构特征（name / status / code），其次才看文案：
     网络层失败在浏览器里文案各不相同（Chrome "Failed to fetch"、Safari "Load failed"、
     Firefox "NetworkError..."），但 supabase-js 一律包成 AuthRetryableFetchError + status 0。 */
  function friendly(e) {
    var raw = (e && e.message) ? String(e.message) : String(e || '');
    var name = (e && e.name) ? String(e.name) : '';
    var code = (e && e.code) ? String(e.code) : '';
    var status = (e && typeof e.status === 'number') ? e.status : null;
    var m = raw.toLowerCase();
    var isNet = (name === 'AuthRetryableFetchError') || status === 0 ||
      m.indexOf('failed to fetch') >= 0 || m.indexOf('load failed') >= 0 ||
      m.indexOf('networkerror') >= 0 || m.indexOf('network request failed') >= 0 ||
      m.indexOf('fetch failed') >= 0;
    var head = '';
    if (m.indexOf(TIMEOUT_MARK) >= 0 || m.indexOf('aborted') >= 0) {
      head = '连接登录服务超时（' + (REQ_TIMEOUT_MS / 1000) + " 秒无响应）。请检查网络后重试。";
    } else if (isNet) {
      head = "连不上登录服务（网络层失败）。请换一个网络重试（Wi-Fi ↔ 移动数据）；若开着代理 / VPN / 广告拦截，请先关掉。";
    } else if (code === 'email_address_not_authorized' || m.indexOf('email address not authorized') >= 0 ||
               code === 'unexpected_failure' || m.indexOf('error sending magic link') >= 0 ||
               m.indexOf('error sending confirmation') >= 0 || m.indexOf('error sending recovery') >= 0) {
      head = "验证码邮件发不出去。Supabase 默认邮件服务只允许发给项目团队成员、且每小时限 2 封 —— " +
             "请改用「使用密码登录」，或先在 Supabase 配置自定义 SMTP。";
    } else if (code === 'over_email_send_rate_limit' || m.indexOf('for security purposes') >= 0 ||
               m.indexOf('email rate limit') >= 0) {
      head = "验证码发送太频繁（免费邮件服务每小时限 2 封）。请稍后再试，或改用「使用密码登录」。";
    } else if (code === 'over_request_rate_limit' || status === 429) {
      head = "请求过于频繁，请稍等一会儿再试。";
    } else if (code === 'invalid_credentials' || m.indexOf('invalid login credentials') >= 0) {
      head = "邮箱或密码不正确。若这个号当初是用验证码注册、还没设过密码，请先用验证码登录一次并在面板里设置密码。";
    } else if (code === 'email_not_confirmed' || m.indexOf('email not confirmed') >= 0) {
      head = "该邮箱还没通过验证。请先用验证码登录一次完成验证，或去 Supabase 后台手动确认该用户。";
    } else if (code === 'user_already_exists' || m.indexOf('already registered') >= 0) {
      head = "该账号已存在，请直接登录。";
    } else if (code === 'otp_expired' || m.indexOf('token has expired') >= 0 ||
               m.indexOf('invalid token') >= 0 || m.indexOf('token is invalid') >= 0) {
      head = "验证码不正确或已过期，请重新获取。";
    }
    if (!head) return raw || '未知错误';   /* 已是中文可读的（配置/加载类）原样透出 */
    return head + "（原始提示：" + raw + "）";
  }

  /* ---------- 带超时的 fetch：交给 supabase-js 当底层请求实现 ---------- */
  function timedFetch(input, init) {
    var base = global.fetch;
    if (!base) return Promise.reject(new Error('当前浏览器不支持 fetch，无法登录'));
    if (typeof AbortController === 'undefined') return base(input, init);

    var ctl = new AbortController();
    var init2 = Object.assign({}, init || {}, { signal: ctl.signal });
    /* 尊重上层（supabase-js）已有的取消信号，转发到我们自己的 controller */
    if (init && init.signal) {
      if (init.signal.aborted) { try { ctl.abort(); } catch (e) {} }
      else {
        try { init.signal.addEventListener('abort', function () { try { ctl.abort(); } catch (e) {} }); } catch (e) {}
      }
    }
    var timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, REQ_TIMEOUT_MS);

    return base(input, init2).then(function (r) { clearTimeout(timer); return r; },
      function (e) {
        clearTimeout(timer);
        if (ctl.signal.aborted && !(init && init.signal && init.signal.aborted)) {
          throw new Error(TIMEOUT_MARK + " 请求 " + (REQ_TIMEOUT_MS / 1000) + " 秒无响应");
        }
        throw e;
      });
  }

  function loadSdk(urls) {
    if (global.supabase && global.supabase.createClient) return Promise.resolve(global.supabase);
    if (sdkPromise) return sdkPromise;
    var list = (urls && urls.length) ? urls : sdkSources();

    function loadOne(url) {
      return new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        var done = false;
        var t = setTimeout(function () {
          if (done) return; done = true;
          rej(new Error('登录组件加载超时：' + url));
        }, SDK_TIMEOUT_MS);
        s.onload = function () { if (done) return; done = true; clearTimeout(t); res(global.supabase || null); };
        s.onerror = function () { if (done) return; done = true; clearTimeout(t); rej(new Error('资源加载失败：' + url)); };
        document.head.appendChild(s);
      });
    }

    /* 逐个源尝试：自托管 → 固定版本 CDN 兜底 */
    sdkPromise = list.reduce(function (p, url) {
      return p.catch(function () { return loadOne(url); });
    }, Promise.reject(new Error('start')))
      .then(function (sb) {
        if (!sb || !sb.createClient) throw new Error('Supabase SDK 未加载（资源加载了但不是预期的库）');
        return sb;
      })
      .catch(function () {
        sdkPromise = null;   /* 允许"重试"再次尝试，而不是永久失败 */
        throw new Error('登录组件（Supabase SDK）加载失败：请刷新页面重试；若反复失败，可能是该资源被网络或浏览器插件拦截。');
      });
    return sdkPromise;
  }

  /* 可用的 SDK 源：优先站点自托管，其次固定版本 CDN */
  function sdkSources() {
    var c = cfg();
    var list = [];
    if (c.sdkUrl) list.push(c.sdkUrl);
    if (c.sdkFallbackUrl && c.sdkFallbackUrl !== c.sdkUrl) list.push(c.sdkFallbackUrl);
    if (!list.length) list.push(DEFAULT_SDK);
    return list;
  }

  /** 初始化并拿到 client（幂等） */
  function ensure() {
    var c = cfg();
    if (!c.supabaseUrl || !c.anonKey) {
      return Promise.reject(new Error('尚未配置 Supabase：请在 assets/js/cb-config.js 填入 supabaseUrl 与 anonKey'));
    }
    if (!c.enabled) return Promise.reject(new Error('账号登录未启用'));
    if (state.client) return Promise.resolve(state.client);

    return loadSdk().then(function (sb) {
      /* global.fetch：给所有 Supabase 请求套上超时，避免网络抽风时无限转圈 */
      var client = sb.createClient(c.supabaseUrl, c.anonKey, { global: { fetch: timedFetch } });
      state.client = client;
      state.sdkReady = true;
      state.error = '';
      return client;
    });
  }

  function toUser(u) {
    if (!u) return null;
    var md = u.user_metadata || {};
    return {
      uid: u.id || u.uid || u.user_id || '',
      phone: u.phone || '',
      email: u.email || '',
      nickName: md.nickName || md.nickname || ''
    };
  }

  /** 拉取当前登录态（页面加载时调用一次） */
  function refresh() {
    var c = cfg();
    if (!c.enabled || !c.supabaseUrl || !c.anonKey) return Promise.resolve(null);
    return ensure().then(function (client) {
      if (!client.auth || typeof client.auth.getUser !== 'function') return null;
      return client.auth.getUser().then(function (r) {
        if (r && r.error) throw r.error;
        state.user = toUser(r && r.data && r.data.user);
        state.error = '';
        emit();
        return state.user;
      });
    }).catch(function (e) {
      // 未登录也会走到这里（无会话），不算致命错误
      state.user = null;
      state.error = e && e.message ? e.message : String(e || '');
      emit();
      return null;
    });
  }

  var CBAuth = {
    configured: function () {
      var c = cfg();
      return !!(c.enabled && c.supabaseUrl && c.anonKey);
    },
    /** 当前状态副本 */
    get: function () {
      return {
        ready: state.sdkReady,
        user: state.user,
        error: state.error,
        configured: CBAuth.configured()
      };
    },
    isLoggedIn: function () { return !!(state.user && state.user.uid); },
    uid: function () { return state.user ? state.user.uid : ''; },
    isAdmin: function () {
      var c = cfg();
      var u = CBAuth.uid();
      return !!(u && c.adminUids && c.adminUids.indexOf(u) >= 0);
    },
    ensure: ensure,
    refresh: refresh,
    detectChannel: detectChannel,
    client: function () { return state.client; },

    /**
     * 发送验证码（用户不存在时会在 verifyCode 阶段自动注册）
     * @param {string} account 手机号或邮箱
     * @param {string} [channel] 'phone' | 'email'，不传则自动识别
     */
    sendCode: function (account, channel) {
      var ch = channel || detectChannel(account);
      if (!ch) return Promise.reject(new Error('请填写正确的手机号或邮箱地址'));
      var acc = (ch === 'email') ? normEmail(account) : normPhone(account, false);
      if (ch === 'phone' && !/^\d{11}$/.test(acc.replace(/^\+86/, ''))) {
        return Promise.reject(new Error('请填写正确的 11 位手机号'));
      }
      if (ch === 'email' && !RE_EMAIL.test(acc)) {
        return Promise.reject(new Error('请填写正确的邮箱地址'));
      }

      state.pending = null;
      return ensure().then(function (client) {
        return client.auth.signInWithOtp({
          [ch === 'email' ? 'email' : 'phone']: acc,
          options: { shouldCreateUser: true }
        }).then(function (r) {
          if (r && r.error) throw r.error;          /* 原样抛出，交给外层 friendly() 翻译 */
          state.pending = { channel: ch, account: acc };
          return r && r.data;
        });
      }).catch(function (e) {
        throw new Error(friendly(e));
      });
    },

    /**
     * 校验验证码并完成登录/注册
     * @param {string} token 验证码
     */
    verifyCode: function (token) {
      if (!state.pending) return Promise.reject(new Error('请先获取验证码'));
      var pending = state.pending;
      var code = String(token || '').trim();
      if (!/^\d{4,10}$/.test(code)) return Promise.reject(new Error('请输入验证码（4-10 位数字）'));

      var client = state.client;
      if (!client || !client.auth) return Promise.reject(new Error('账号未初始化'));

      var accountKey = pending.channel === 'email' ? 'email' : 'phone';
      // Supabase 邮箱 OTP 校验：手填 6 位码时 type 应为 'email'；
      // 'magiclink' 仅用于 PKCE/链接回调场景。手机号仍为 'sms'。
      var codeType = pending.channel === 'email' ? 'email' : 'sms';
      function tryVerify(type) {
        return client.auth.verifyOtp({
          [accountKey]: pending.account,
          token: code,
          type: type
        }).then(function (r) {
          if (r && r.error) throw r.error;
          return r;
        });
      }

      // 若项目仍开启「Confirm email」，新用户首次会走 Confirm signup 模板，
      // 此时同一段 6 位码还能用 type='signup' 再验证一次，作兜底尝试。
      return tryVerify(codeType).catch(function (err) {
        if (pending.channel === 'email') {
          return tryVerify('signup').catch(function () { throw err; });
        }
        throw err;
      }).then(function (r) {
        state.pending = null;
        return refresh().then(function () { emit(); return state.user; });
      }).catch(function (e) {
        throw new Error(friendly(e));
      });
    },

    /**
     * 邮箱 + 密码登录（免验证码，适合换设备）
     * @param {string} email
     * @param {string} password
     */
    loginWithPassword: function (email, password) {
      var acc = normEmail(email);
      if (!RE_EMAIL.test(acc)) return Promise.reject(new Error('请填写正确的邮箱地址'));
      if (!password || password.length < 6) return Promise.reject(new Error('密码至少 6 位'));
      return ensure().then(function (client) {
        return client.auth.signInWithPassword({ email: acc, password: password }).then(function (r) {
          if (r && r.error) throw r.error;
          return refresh().then(function () { emit(); return state.user; });
        });
      }).catch(function (e) {
        throw new Error(friendly(e));
      });
    },

    /**
     * 为已登录账号设置 / 修改密码（无需输旧密码，当前会话即凭证）
     * 适用于：此前用验证码注册、尚未设过密码的账号。
     * @param {string} newPassword
     */
    setPassword: function (newPassword) {
      if (!CBAuth.isLoggedIn()) return Promise.reject(new Error('请先登录'));
      if (!newPassword || newPassword.length < 6) return Promise.reject(new Error('密码至少 6 位'));
      var client = state.client;
      if (!client || !client.auth) return Promise.reject(new Error('账号未初始化'));
      return client.auth.updateUser({ password: newPassword }).then(function (r) {
        if (r && r.error) throw r.error;
        return true;
      }).catch(function (e) {
        throw new Error(friendly(e));
      });
    },

    /** 连通性自检：短超时探一次 /auth/v1/health，只用于提示"网络是否通"，不阻塞登录。
        返回 Promise<boolean>（true = 能连上登录服务）。 */
    probe: function (timeoutMs) {
      var c = cfg();
      if (!c.supabaseUrl || !global.fetch) return Promise.resolve(false);
      var tmo = timeoutMs || 6000;
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) { try { ctl.abort(); } catch (e) {} } }, tmo);
      var url = String(c.supabaseUrl).replace(/\/+$/, '') + '/auth/v1/health';
      return global.fetch(url, {
        method: 'GET',
        headers: { apikey: c.anonKey || '' },        /* 不带 apikey 会得到 401，会被误判为"不通" */
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) { clearTimeout(timer); return !!(r && r.ok); },
        function () { clearTimeout(timer); return false; });
    },
    /** 把原始报错翻译成可读中文（面板/其它调用方都可复用） */
    friendlyError: friendly,

    signOut: function () {
      var client = state.client;
      var p = (client && client.auth && typeof client.auth.signOut === 'function')
        ? client.auth.signOut().catch(function () {}) : Promise.resolve();
      return p.then(function () {
        state.user = null;
        state.pending = null;
        emit();
      });
    },

    onChange: function (fn) {
      if (typeof fn === 'function') subs.push(fn);
      return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
    },

    /** 供数据存储层使用：拿到 client 实例（用于 from()） */
    app: function () { return state.client; },
    /** 内部状态（调试/测试用） */
    _state: state
  };

  global.CBAuth = CBAuth;

  // 页面加载后自动恢复会话
  try {
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { refresh(); });
      } else {
        refresh();
      }
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
