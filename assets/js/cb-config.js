/* =============================================================
 * cb-config.js — 腾讯云开发 CloudBase 接入配置
 * -------------------------------------------------------------
 * ⚠️ 部署前必须把下面的 env / publishableKey 填好（见 account-help.html 教程）：
 *
 *   1. env（环境 ID）
 *      云开发平台 → 环境概览 → 环境 ID，形如 fto-site-3gxxxxxxxx
 *      ⚠️ 短信验证码仅支持「上海」地域，环境地域必须是 ap-shanghai
 *
 *   2. publishableKey（可公开的前端密钥）
 *      云开发平台 → 环境 → API Key 配置 → 生成 Publishable Key
 *      只能生成一次、永久有效，请妥善保存
 *
 *   3. 控制台还要做两件事（否则会报 CORS / 未开启登录方式）
 *      · 环境配置 → 安全配置 → 添加网站域名（你的站点域名，10 分钟生效）
 *      · 身份认证 → 登录方式 → 开启「短信验证码登录」
 *
 * 说明：publishableKey 是设计上可暴露在浏览器里的公开密钥，
 *       真正的数据隔离由数据库安全规则保证（见教程文档）。
 * ============================================================= */
(function (global) {
  'use strict';

  global.CB_CONFIG = {
    /** 是否启用 CloudBase 账号（填好 env 与 key 后自动生效） */
    enabled: true,

    /** 环境 ID（必填） */
    env: '',

    /** 地域：短信验证码仅支持 ap-shanghai */
    region: 'ap-shanghai',

    /** Publishable Key（必填，可公开） */
    publishableKey: '',

    /** SDK 地址：固定 2.x（latest 已指向 v3，API 不兼容） */
    sdkUrl: 'https://cdn.jsdelivr.net/npm/@cloudbase/js-sdk@2/dist/cloudbase.full.js',

    /** 存放用户同步数据的集合名 */
    collection: 'sync_data',

    /** 管理员 uid 列表：填进去后，这些人可以在 admin.html 查看他人数据
     *  uid 获取方式：用该账号登录后，打开右上角账号面板，底部显示「UID：xxx」 */
    adminUids: []
  };
})(typeof window !== 'undefined' ? window : this);
