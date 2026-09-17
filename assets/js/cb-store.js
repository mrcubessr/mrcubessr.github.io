/* =============================================================
 * cb-store.js — Supabase 数据存储层（每个用户一份数据）
 * -------------------------------------------------------------
 * 依赖：cb-config.js / cb-auth.js（先于本文件加载）
 *
 * 数据模型：表 sync_data（默认）
 *   列：id text PK, user_id uuid, scope text, data jsonb, updated_at bigint
 *   RLS（控制台配置）：
 *     using (auth.uid() = user_id) with check (auth.uid() = user_id)
 *     管理员另开 policy：auth.uid() = '<管理员 uuid>'
 *
 * 对外接口与 cloud-store.js 对齐，便于同步引擎切换后端：
 *   read(path) → Promise<{data, sha} | null>
 *   write(obj, path) → Promise
 *   readUser(uid, path) → 管理员读取他人数据
 * ============================================================= */
(function (global) {
  'use strict';

  function cfg() { return global.CB_CONFIG || {}; }
  function A() { return global.CBAuth; }

  function scopeOf(path) {
    return String(path || '').replace(/\.json$/i, '');
  }

  function client() {
    var a = A();
    var c = a && a.client();
    if (!c) throw new Error('Supabase 尚未初始化，请先登录');
    return c;
  }

  function table() {
    return client().from(cfg().collection || 'sync_data');
  }

  function uid() {
    var u = A() && A().uid();
    if (!u) throw new Error('未登录');
    return u;
  }

  /** 解析一行文档为 {data, sha}；无数据返回 null */
  function parseRow(doc) {
    if (!doc) return null;
    var payload = doc.data;
    if (payload && typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { payload = null; }
    }
    if (!payload) return null;
    return { data: payload, sha: doc.id };
  }

  var CbStore = {
    isReady: function () {
      return !!(A() && A().isLoggedIn() && A().client());
    },

    /** 读取自己某个 scope 的数据 */
    read: function (path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return table().select('*')
        .eq('user_id', uid()).eq('scope', scopeOf(path))
        .maybeSingle().then(function (r) {
          if (r && r.error) throw new Error(r.error.message || r.error.code);
          return parseRow(r && r.data);
        });
    },

    /** 写入自己某个 scope 的数据（upsert，按 id 主键） */
    write: function (obj, path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      var u = uid(), sc = scopeOf(path);
      var row = {
        id: u + '__' + sc,
        user_id: u,
        scope: sc,
        data: obj,
        updated_at: Date.now()
      };
      return table().upsert(row, { onConflict: 'id' }).then(function (r) {
        if (r && r.error) throw new Error(r.error.message || r.error.code);
        return { ok: true, created: !!(r && r.data && Array.isArray(r.data) && r.data.length === 0), id: row.id };
      });
    },

    /** 管理员读取指定用户的数据（用于 admin.html） */
    readUser: function (userId, path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return table().select('*')
        .eq('user_id', userId).eq('scope', scopeOf(path))
        .maybeSingle().then(function (r) {
          if (r && r.error) throw new Error(r.error.message || r.error.code);
          var parsed = parseRow(r && r.data);
          if (!parsed) return null;
          parsed.updatedAt = (r && r.data) ? r.data.updated_at : 0;
          return parsed;
        });
    },

    /** 列出某个 scope 下所有用户的记录（管理员用；受 RLS 限制，一般仅管理员可成功） */
    listUserIds: function (path) {
      if (!CbStore.isReady()) return Promise.reject(new Error('未登录'));
      return table().select('user_id, updated_at, scope')
        .eq('scope', scopeOf(path)).limit(100).then(function (r) {
          if (r && r.error) throw new Error(r.error.message || r.error.code);
          return ((r && r.data) || []).map(function (d) {
            return { userId: d.user_id, updatedAt: d.updated_at, scope: d.scope };
          });
        });
    },

    scopeOf: scopeOf
  };

  global.CbStore = CbStore;
})(typeof window !== 'undefined' ? window : this);
