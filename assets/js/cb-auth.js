/* =============================================================
 * cb-auth.js — CloudBase 账号（手机号 / 邮箱验证码，注册即登录，免记密码）
 * -------------------------------------------------------------
 * 依赖：assets/js/cb-config.js（先于本文件加载）
 *
 * 设计：
 *   · 支持两种通道：手机号短信验证码（收费）与邮箱验证码（免费）
 *     两者仅在「发送验证码」时参数不同，校验/注册/登录流程完全一致
 *   · 用户不存在时自动注册（智能注册并登录）
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
    user: null,      // { uid, phone, email, nickName }
    error: '',
    pending: null    // 待验证句柄：{ channel, account, verifyOtp? , legacy? , info? }
  };
  var subs = [];
  var sdkPromise = null;

  function cfg() { return global.CB_CONFIG || {}; }

  function emit() {
    try { global.dispatchEvent(new CustomEvent('cb:change', { detail: CBAuth.get() })); } catch (e) {}
    subs.forEach(function (fn) { try { fn(CBAuth.get()); } catch (e) {} });
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

  function normEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  /** 自动识别通道：手机号 / 邮箱 */
  function detectChannel(account) {
    var a = String(account || '').trim();
    if (RE_EMAIL.test(a)) return 'email';
    if (/^(\+?86)?\d{11}$/.test(a.replace(/[\s-]/g, ''))) return 'phone';
    return '';
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
    var md = u.user_metadata || {};
    return {
      uid: u.uid || u.id || u.user_id || '',
      phone: u.phone || md.phone || u.phone_number || '',
      email: u.email || md.email || '',
      nickName: md.nickName || md.nickname || u.nickName || u.nickname || ''
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
    detectChannel: detectChannel,

    /**
     * 发送验证码（用户不存在时会在 verifyCode 阶段自动注册）
     * @param {string} account 手机号或邮箱
     * @param {string} [channel] 'phone' | 'email'，不传则自动识别
     */
    sendCode: function (account, channel) {
      var ch = channel || detectChannel(account);
      if (!ch) {
        return Promise.reject(new Error('请填写正确的手机号或邮箱地址'));
      }
      var acc = (ch === 'email') ? normEmail(account) : normPhone(account, false);
      if (ch === 'phone' && !/^\d{11}$/.test(acc.replace(/^\+86/, ''))) {
        return Promise.reject(new Error('请填写正确的 11 位手机号'));
      }
      if (ch === 'email' && !RE_EMAIL.test(acc)) {
        return Promise.reject(new Error('请填写正确的邮箱地址'));
      }

      state.pending = null;
      return ensure().then(function (auth) {
        function doSend(a) {
          // 新版 v2：signInWithOtp（返回 { verification_id, is_user, verifyOtp }）
          if (typeof auth.signInWithOtp === 'function') {
            var payload = (ch === 'email') ? { email: a } : { phone: a };
            return auth.signInWithOtp(payload);
          }
          // 兜底：老版 getVerification
          var arg = (ch === 'email') ? { email: a } : { phone_number: a };
          return auth.getVerification(arg).then(function (info) {
            var d = (info && info.data) ? info.data : info;
            return { data: { legacy: true, info: d, channel: ch, account: a } };
          });
        }

        return doSend(acc).then(function (r) {
          if (r && r.error) {
            var m = String(r.error.message || '');
            // 手机号格式问题：自动重试 +86 前缀
            if (ch === 'phone' && /手机号|格式|phone|区号/i.test(m)) {
              return doSend(normPhone(account, true)).then(unwrap, function () { throw new Error(m); });
            }
            throw new Error(m || '验证码发送失败');
          }
          return unwrap(r);
        });
      }).then(function (data) {
        state.pending = {
          channel: ch,
          account: acc,
          data: data,
          verifyOtp: (data && typeof data.verifyOtp === 'function') ? data.verifyOtp : null,
          legacy: !!(data && data.legacy),
          info: (data && data.info) || data,
          verification_id: (data && (data.verification_id || data.verificationId)) || ''
        };
        return data;
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

      var auth = state.auth;

      function finish(r) {
        var d = unwrap(r);
        var u = d.user || (d.session && d.session.user) || null;
        state.pending = null;
        if (u) {
          state.user = toUser(u);
          state.error = '';
          emit();
          return state.user;
        }
        return refresh().then(function () { emit(); return state.user; });
      }

      // 新版：pending.verifyOtp
      if (pending.verifyOtp) {
        return pending.verifyOtp({ token: code }).then(finish);
      }

      // 兜底 1：老版 signInWithSms（仅手机号）
      if (pending.legacy && pending.channel === 'phone' && auth &&
          typeof auth.signInWithSms === 'function') {
        return auth.signInWithSms({
          verificationInfo: pending.info,
          verificationCode: code,
          phoneNum: pending.account
        }).then(function () { state.pending = null; return refresh(); });
      }

      // 兜底 2：verify → signIn / signUp（手机号与邮箱通用，见官方 signup 文档）
      if (pending.legacy && auth && typeof auth.verify === 'function') {
        var vid = pending.verification_id || (pending.info && pending.info.verification_id);
        if (!vid) return Promise.reject(new Error('验证码会话已失效，请重新获取'));
        return auth.verify({ verification_id: vid, verification_code: code })
          .then(function (r) {
            var d = unwrap(r);
            var vtoken = d.verification_token || d.verificationToken;
            var isUser = !!(pending.info && pending.info.is_user);
            if (isUser && typeof auth.signIn === 'function') {
              return auth.signIn({ username: pending.account, verification_token: vtoken });
            }
            if (typeof auth.signUp !== 'function') {
              return Promise.reject(new Error('当前 SDK 不支持注册，请升级 @cloudbase/js-sdk'));
            }
            var su = { verification_code: code, verification_token: vtoken };
            if (pending.channel === 'email') su.email = pending.account;
            else su.phone_number = pending.account;
            return auth.signUp(su);
          })
          .then(finish, function (e) {
            // 已注册用户走 signUp 会报错，退回 signIn
            if (auth && typeof auth.signIn === 'function') {
              return auth.verify({ verification_id: vid, verification_code: code })
                .then(function (r) {
                  var d = unwrap(r);
                  return auth.signIn({
                    username: pending.account,
                    verification_token: d.verification_token || d.verificationToken
                  });
                }).then(finish);
            }
            throw e;
          });
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
