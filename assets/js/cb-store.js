/* =============================================================
 * cb-store.js — CloudBase 数据存储层（每个用户一份数据）
 * -------------------------------------------------------------
 * 依赖：cb-config.js / cb-auth.js（先于本文件加载）
 *
 * 数据模型：集合 sync_data（默认）
 *   文档：{ _id: '<uid>__<scope>', userId, scope, data, updatedAt }
 *   安全规则（控制台配置）：
 *     { "read":  "doc.userId == auth.uid || auth.uid in ['<管理员uid>']",
 *       "write": "doc.userId == auth.uid" }
 *
 * 对外接口与 cloud-store.js 对齐，便于同步引擎切换后端：
 *   read(path) → Promise<{data, sha} | null>
 *   write(obj, path, sha) → Promise
 *   readUser(uid, path) → 管理员读取他人数据
 * ============================================================= */
(function (global) {
  'use strict';

  function cfg() { return global.CB_CONFIG || {}; }
  function A() { return global.CBAuth; }

  function scopeOf(path) {
    return String(path || '').replace(/\.json$/i, '');
  }

  function db() {
    var app = A() && A().app();
    if (!app) throw new Error('CloudBase 尚未初始化，请先登录');
    return (typeof app.database === 'function') ? app.database() : app.database;
  }

  function coll() {
    return db().collection((cfg().collection) || 'sync_data');
  }

  function uid() {
    var u = A() && A().uid();
    if (!u) throw new Error('未登录');
    return u;
  }

  /** 查询一条记录（返回原始文档或 null） */
  function findOne(userId, scope) {
    return coll().where({ userId: userId, scope: scope }).limit(1).get()
      .then(function (r) {
        var list = (r && r.data) || [];
        return list.length ? list[0] : null;
      });
  }

  var CbStore = {
    isReady: function () {
      return !!(A() && A().isLoggedIn() && A().app());
    },

    /** 读取自己某个 scope 的数据 */
    read: function (path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return findOne(uid(), scopeOf(path)).then(function (doc) {
        if (!doc) return null;
        var payload = doc.data;
        if (payload && typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (e) { payload = null; }
        }
        if (!payload) return null;
        return { data: payload, sha: doc._id };
      });
    },

    /** 写入自己某个 scope 的数据 */
    write: function (obj, path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      var u = uid(), sc = scopeOf(path);
      var body = { data: obj, updatedAt: Date.now() };
      return findOne(u, sc).then(function (doc) {
        if (doc) {
          return coll().doc(doc._id).update(body).then(function (r) {
            if (r && r.code && r.code !== 0) throw new Error(r.message || r.code);
            return { ok: true, updated: true };
          });
        }
        return coll().add({
          _id: u + '__' + sc,
          userId: u,
          scope: sc,
          data: obj,
          updatedAt: Date.now()
        }).then(function (r) {
          // Web SDK 新建文档 id 在 result._id
          if (r && r.code && r.code !== 0) throw new Error(r.message || r.code);
          return { ok: true, created: true, id: (r && r._id) || (u + '__' + sc) };
        });
      });
    },

    /** 管理员读取指定用户的数据（用于 admin.html） */
    readUser: function (userId, path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return findOne(userId, scopeOf(path)).then(function (doc) {
        if (!doc) return null;
        var payload = doc.data;
        if (payload && typeof payload === 'string') {
          try { payload = JSON.parse(payload); } catch (e) { payload = null; }
        }
        if (!payload) return null;
        return { data: payload, sha: doc._id, updatedAt: doc.updatedAt };
      });
    },

    /** 列出某个 scope 下所有用户的记录（管理员用；受安全规则限制，一般仅管理员可成功） */
    listUserIds: function (path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return coll().where({ scope: scopeOf(path) }).limit(100).get()
        .then(function (r) {
          return ((r && r.data) || []).map(function (d) {
            return { userId: d.userId, updatedAt: d.updatedAt, scope: d.scope };
          });
        });
    },

    scopeOf: scopeOf
  };

  global.CbStore = CbStore;
})(typeof window !== 'undefined' ? window : this);
