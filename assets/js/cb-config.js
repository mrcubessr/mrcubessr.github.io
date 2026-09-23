/* =============================================================
 * cb-config.js — Supabase 接入配置（账号登录 + 跨设备同步）
 * -------------------------------------------------------------
 * ⚠️ 部署前必须填入：
 *   1. supabaseUrl：项目 URL（Project Settings → API → Project URL）
 *   2. anonKey：公开的 anon key（Settings → API → anon public）
 *
 * 两者都可安全暴露在前端；真正的数据隔离由数据库 Row Level Security（RLS）保证。
 * 未填时账号登录自动隐藏并提示配置，不影响页面其它功能。
 * ============================================================= */
(function (global) {
  'use strict';

  global.CB_CONFIG = {
    /** 是否启用账号登录（填好 url 与 key 后自动生效） */
    get enabled() {
      return !!(this.supabaseUrl && this.anonKey);
    },

    /** Supabase 项目 URL（必填） */
    supabaseUrl: 'https://pjgkevyhhnswknvwgvar.supabase.co',

    /** 公开的 anon key（必填，可暴露在前端） */
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqZ2tldnloaG5zd2tudndndmFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2Mjk2NTUsImV4cCI6MjEwNTIwNTY1NX0.68Qua_WLoA6dbSm2bZnrg8NYI1KmOIoqIoVW0-SG3dk',

    /** 登录 SDK：**固定版本 + 自托管**（UMD 全局名 window.supabase，MIT License）。
     *  为什么不再用 CDN 的 `@2` 浮动标签：
     *   ① 浮动标签 = 上游一发新版，用户下次刷新就换掉手里的代码，出问题无法追溯（曾疑似故障源）；
     *   ② jsdelivr 与本站不同源，国内经常单独打不开；自托管后它跟页面走同一条路——页面能打开，它就能加载。
     *  升级方式：新版放到 assets/js/supabase-<版本>.min.js → 改下面两行。 */
    sdkUrl: '/assets/js/supabase-2.117.1.min.js',

    /** 自托管资源加载失败时的兜底（同版本；仍不使用浮动标签） */
    sdkFallbackUrl: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.min.js',

    /** 存放用户同步数据的表名 */
    collection: 'sync_data',

    /** 管理员 uid 列表：填进去后，这些人可以在 admin.html 查看他人数据
     *  uid 获取方式：用该账号登录后，打开右上角账号面板，底部显示「UID：xxx」 */
    adminUids: []
  };
})(typeof window !== 'undefined' ? window : this);
