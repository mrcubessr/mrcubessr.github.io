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

  var DEFAULT_SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

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

  function loadSdk(url) {
    if (global.supabase && global.supabase.createClient) return Promise.resolve(global.supabase);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url || DEFAULT_SDK;
      s.async = true;
      s.onload = function () { res(global.supabase || null); };
      s.onerror = function () { rej(new Error('Supabase SDK 加载失败（检查网络或 SDK 地址）')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  /** 初始化并拿到 client（幂等） */
  function ensure() {
    var c = cfg();
    if (!c.supabaseUrl || !c.anonKey) {
      return Promise.reject(new Error('尚未配置 Supabase：请在 assets/js/cb-config.js 填入 supabaseUrl 与 anonKey'));
    }
    if (!c.enabled) return Promise.reject(new Error('账号登录未启用'));
    if (state.client) return Promise.resolve(state.client);

    return loadSdk(c.sdkUrl).then(function (sb) {
      if (!sb || !sb.createClient) throw new Error('Supabase SDK 未加载');
      var client = sb.createClient(c.supabaseUrl, c.anonKey);
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
          if (r && r.error) throw new Error(r.error.message || '验证码发送失败');
          state.pending = { channel: ch, account: acc };
          return r && r.data;
        });
      }).catch(function (e) {
        throw new Error(e && e.message ? e.message : e);
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
      if (!/^\d{4,8}$/.test(code)) return Promise.reject(new Error('请输入验证码（4-8 位数字）'));

      var client = state.client;
      if (!client || !client.auth) return Promise.reject(new Error('账号未初始化'));

      return client.auth.verifyOtp({
        [pending.channel === 'email' ? 'email' : 'phone']: pending.account,
        token: code,
        type: pending.channel === 'email' ? 'email' : 'sms'
      }).then(function (r) {
        if (r && r.error) throw new Error(r.error.message || '验证失败');
        state.pending = null;
        return refresh().then(function () { emit(); return state.user; });
      }).catch(function (e) {
        throw new Error(e && e.message ? e.message : e);
      });
    },

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
