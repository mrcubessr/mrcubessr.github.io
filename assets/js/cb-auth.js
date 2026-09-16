/* =============================================================
 * cb-auth.js — CloudBase 手机号账号（注册即登录，免记密码）
 * -------------------------------------------------------------
 * 依赖：assets/js/cb-config.js（先于本文件加载）
 *
 * 设计：
 *   · 手机号 + 短信验证码登录；用户不存在时 SDK 自动注册（智能注册并登录）
 *   · 会话由 SDK 自己持久化（access_token 2h / refresh_token 30d，自动续期）
 *   · 状态变更广播 window 事件 'cb:change' + CBAuth.onChange
 *   · 未配置 env/key 时，所有登录相关方法 reject 并给出指引，不影响页面其它功能
 *
 * 对外：ensure / sendCode / verifyCode / getUser / signOut / isLoggedIn / onChange
 * ============================================================= */
(function (global) {
  'use strict';

  var DEFAULT_SDK = 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@2/dist/cloudbase.full.js';

  var state = {
    sdkReady: false,
    app: null,
    auth: null,
    user: null,      // { uid, phone, nickName }
    error: '',
    pending: null    // 待验证的 verifyOtp 句柄
  };
  var subs = [];
  var sdkPromise = null;

  function cfg() { return global.CB_CONFIG || {}; }

  function emit() {
    try { global.dispatchEvent(new CustomEvent('cb:change', { detail: CBAuth.get() })); } catch (e) {}
    subs.forEach(function (fn) { try { fn(CBAuth.get()); } catch (e) {} });
  }

  /** 规范化手机号：支持 11 位国内号，可带 +86 */
  function norm(phone, withCode) {
    var p = String(phone || '').replace(/[\s-]/g, '');
    if (p.indexOf('+') === 0) return withCode ? p : p.replace(/^\+86/, '');
    if (/^86\d{11}$/.test(p)) p = p.slice(2);
    if (!/^\d{11}$/.test(p)) return p;
    return withCode ? ('+86 ' + p) : p;
  }

  function loadSdk(url) {
    if (global.cloudbase) return Promise.resolve(global.cloudbase);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = url || DEFAULT_SDK;
      s.async = true;
      s.onload = function () { res(global.cloudbase || null); };
      s.onerror = function () { rej(new Error('CloudBase SDK 加载失败（检查网络或 SDK 地址）')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  /** 初始化并拿到 auth（幂等） */
  function ensure() {
    var c = cfg();
    if (!c.enabled) return Promise.reject(new Error('CloudBase 账号未启用'));
    if (!c.env || !c.publishableKey) {
      return Promise.reject(new Error('尚未配置 CloudBase：请在 assets/js/cb-config.js 填入 env 与 publishableKey'));
    }
    if (state.sdkReady && state.auth) return Promise.resolve(state.auth);

    return loadSdk(c.sdkUrl).then(function (cb) {
      if (!cb) throw new Error('CloudBase SDK 未加载');
      var app = cb.init({
        env: c.env,
        region: c.region || 'ap-shanghai',
        accessKey: c.publishableKey,
        auth: { detectSessionInUrl: true }
      });
      // v2.24+ 是属性 app.auth；旧版是方法 app.auth()
      var a = app.auth;
      var auth = (typeof a === 'function') ? a.call(app) : a;
      if (!auth) throw new Error('CloudBase auth 模块不可用');
      state.app = app;
      state.auth = auth;
      state.sdkReady = true;
      state.error = '';
      return auth;
    });
  }

  /** SDK 返回统一为 {data,error} */
  function unwrap(r) {
    if (!r) throw new Error('无响应');
    if (r.error) {
      var e = r.error;
      throw new Error(e.message || e.code || '操作失败');
    }
    return r.data || {};
  }

  function toUser(u) {
    if (!u) return null;
    return {
      uid: u.uid || u.id || u.user_id || '',
      phone: u.phone || (u.user_metadata && u.user_metadata.phone) || '',
      nickName: (u.user_metadata && (u.user_metadata.nickName || u.user_metadata.nickname)) ||
                u.nickName || u.nickname || ''
    };
  }

  /** 拉取当前登录态（页面加载时调用一次） */
  function refresh() {
    var c = cfg();
    if (!c.enabled || !c.env || !c.publishableKey) return Promise.resolve(null);
    return ensure().then(function (auth) {
      if (typeof auth.getUser !== 'function') return null;
      return auth.getUser().then(function (r) {
        var d = unwrap(r);
        state.user = toUser(d.user || d);
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
      return !!(c.enabled && c.env && c.publishableKey);
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

    /**
     * 发送短信验证码（用户不存在时会在 verifyCode 阶段自动注册）
     * @param {string} phone 11 位手机号
     */
    sendCode: function (phone) {
      var p = norm(phone, false);
      if (!/^\d{11}$/.test(p.replace('+86', ''))) {
        return Promise.reject(new Error('请填写正确的 11 位手机号'));
      }
      state.pending = null;
      return ensure().then(function (auth) {
        function doSend(ph) {
          if (typeof auth.signInWithOtp === 'function') return auth.signInWithOtp({ phone: ph });
          // 兜底：老版本用 getVerification + signInWithSms
          return auth.getVerification({ phone_number: ph }).then(function (info) {
            return { data: { legacy: true, info: info, phone: ph } };
          });
        }
        // 先按纯号码发；若报格式错误，自动重试 +86 前缀
        return doSend(p).then(function (r) {
          if (r && r.error) {
            var m = String(r.error.message || '');
            if (/手机号|格式|phone/i.test(m)) {
              return doSend(norm(phone, true)).then(unwrap, function () { throw new Error(m); });
            }
            throw new Error(m || '验证码发送失败');
          }
          return unwrap(r);
        });
      }).then(function (data) {
        state.pending = data;
        return data;
      });
    },

    /**
     * 校验验证码并完成登录/注册
     * @param {string} token 6 位验证码
     */
    verifyCode: function (token) {
      if (!state.pending) return Promise.reject(new Error('请先获取验证码'));
      var pending = state.pending;
      var code = String(token || '').trim();
      if (!/^\d{4,8}$/.test(code)) return Promise.reject(new Error('请输入验证码（4-8 位数字）'));

      var auth = state.auth;
      function finish(r) {
        var d = unwrap(r);
        var u = d.user || (d.session && d.session.user) || null;
        if (u) state.user = toUser(u);
        else return refresh().then(function () { state.pending = null; emit(); return state.user; });
        state.pending = null;
        state.error = '';
        emit();
        return state.user;
      }

      // 新版：pending.verifyOtp
      if (pending && typeof pending.verifyOtp === 'function') {
        return pending.verifyOtp({ token: code }).then(finish);
      }
      // 兜底：老版 signInWithSms
      if (pending && pending.legacy && auth && typeof auth.signInWithSms === 'function') {
        return auth.signInWithSms({
          verificationInfo: pending.info,
          verificationCode: code,
          phoneNum: pending.phone
        }).then(function () { state.pending = null; return refresh(); });
      }
      return Promise.reject(new Error('验证码校验不可用，请刷新页面重试'));
    },

    signOut: function () {
      var auth = state.auth;
      var p = (auth && typeof auth.signOut === 'function')
        ? auth.signOut().catch(function () {}) : Promise.resolve();
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

    /** 供数据存储层使用：拿到 app 实例（用于 database()） */
    app: function () { return state.app; },
    /** 内部状态（调试/测试用） */
    _state: state
  };

  global.CBAuth = CBAuth;

  // 页面加载后自动恢复会话
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { refresh(); });
    } else {
      refresh();
    }
  } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
