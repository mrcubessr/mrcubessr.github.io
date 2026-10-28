/*
 * 魔方训练站 · 全站 PWA Service Worker
 * 放在站点根目录，作用域为 '/'。
 *
 * 【2026-10-18 改造：从「只服务计时器」升级为「服务全站」】
 * 旧版用 isOurConcern() 把接管范围限制在 /tools/timer/ + 预缓存清单，
 * 于是除计时器外的 200+ 个页面完全没有离线能力与资源缓存。
 * 现改为接管整个同源 GET 请求，并按资源类型分策略：
 *   ① 导航请求（页面 HTML）：network-first —— 在线永远拿最新，离线才回退缓存/兜底页；
 *   ② 静态资源（css/js/图片/字体/数据）：stale-while-revalidate —— 秒开 + 后台静默更新；
 *   ③ 其余（含 /api/ 代理、非 GET、跨域）：不接管，直接放行。
 *
 * ⚠️ 作用域隔离（勿改）：站内共 3 个 PWA，各自独立作用域 ——
 *   根 sw.js（本文件，scope '/'）、tools/corner-trainer/sw.js（scope 该目录）、
 *   tools/edge-trainer/sw.js（scope 该目录）。
 *   对 corner/edge 目录下的页面，由「作用域更长」的专属 SW 接管，本文件不冲突。
 *   因此 activate 清理缓存必须按前缀过滤，绝不能无差别删除其他 PWA 的缓存。
 */
/* 【版本管理】本文件只放当前生效的策略与常量，历史变更全部记在
   docs/sw-changelog.md（原来把 150 行 changelog 堆在这里，代码要到第 164 行才开始）。
   规则不变：**凡是改动 APP_SHELL 清单里的文件，都要递增下面的 CACHE 常量**，
   否则已安装的 PWA 用户会一直拿到旧缓存。 */
const CACHE = 'fto-timer-v36';

/* 运行时缓存：装「用户实际访问过」的页面与资源，与版本化的外壳缓存分开。
   分开的理由：外壳缓存按版本整批作废，运行时缓存靠 stale-while-revalidate
   后台更新即可，不需要跟着版本号一起丢；且裁剪容量时不会误删外壳。 */
const RT_CACHE = 'fto-site-rt-v1';
const RT_MAX = 300; // 运行时缓存条目上限，超出后淘汰最早写入的

// 预缓存清单：计时器应用壳 + 全站共享的站点级资源（注入型 CSS 也在内）
const APP_SHELL = [
  '/',
  '/index.html',
  '/assets/css/pages/home.css',
  '/tools/timer/',
  '/tools/timer/index.html',
  '/tools/timer/timer.js',
  '/tools/timer/timer.css',
  '/tools/timer/scramble.js',
  '/tools/timer/stats.js',
  '/tools/timer/bld-stats.js',
  '/assets/js/theme.js',
  '/assets/js/sync-boot.js',
  '/assets/js/site-nav.js',
  '/assets/js/bld-engine.js',
  '/assets/js/cube-net.js',
  '/tools/cfop/js/cfop-ui.js',
  '/assets/css/site-nav.css',
  '/assets/css/components.css',
  '/assets/css/site-layout.css',
  '/assets/css/site-shell.css',
  '/assets/css/site-wide.css',
  '/assets/css/palettes.css',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/offline.html',
  '/manifest.webmanifest'
];

/* 不接管的路径前缀：这些是动态接口，缓存会返回脏数据 */
const NO_CACHE_PREFIX = [
  '/api/',
  '/vercel-proxy/api/',
  /* v2.0.37：全站公告数据。它是"改完就想让用户立刻看到"的内容，
     而 .json 命中 STATIC_RE 会走 stale-while-revalidate —— 用户第一次
     拿到旧副本，要点第二次刷新才看得见新公告。这里放行让它每次走网络。 */
  '/assets/data/announcements.json'
];

/* 按扩展名判定为「静态资源」→ 走 stale-while-revalidate */
const STATIC_RE = /\.(?:css|js|mjs|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|mp3|mp4|wasm)$/i;

function isNoCache(pathname) {
  for (var i = 0; i < NO_CACHE_PREFIX.length; i++) {
    if (pathname.indexOf(NO_CACHE_PREFIX[i]) === 0) return true;
  }
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        /* 逐个 add 并吞掉单个失败：cache.addAll 会因任意一个 404 整批失败，
           导致整个 SW 装不上、PWA 完全不可用（corner/edge 的 SW 已采用此写法）。 */
        return Promise.all(APP_SHELL.map(function (u) {
          return cache.add(u).catch(function (e) {
            console.warn('[sw] precache skip', u, e && e.message);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys
            /* ⚠️ 必须按前缀过滤：caches 是同源共享的，无差别删除会把
               tools/corner-trainer/sw.js（fto-corner-v1）与
               tools/edge-trainer/sw.js（fto-edge-v1）的缓存一起清掉，
               导致那两个独立 PWA 离线失效。 */
            .filter(function (k) { return k.indexOf('fto-timer-') === 0 && k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

function trimRuntime(cache) {
  /* 容量裁剪：只在超限时才遍历，避免每次请求都查全量 key */
  return cache.keys().then(function (keys) {
    if (keys.length <= RT_MAX) return;
    var drop = keys.slice(0, keys.length - RT_MAX);
    return Promise.all(drop.map(function (k) { return cache.delete(k); }));
  }).catch(function () { /* 裁剪失败不影响主流程 */ });
}

function putRuntime(req, res) {
  caches.open(RT_CACHE).then(function (c) {
    c.put(req, res).then(function () { return trimRuntime(c); });
  }).catch(function () {});
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;   // 不碰跨域（云同步等）
  if (isNoCache(url.pathname)) return;                // 动态接口放行

  // ① 导航请求：network-first —— 在线取最新，离线依次回退「本页缓存 → offline 兜底」
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          if (res && res.status === 200) putRuntime(req, res.clone());
          return res;
        })
        .catch(function () {
          return caches.match(req)
            .then(function (r) { return r || caches.match('/offline.html'); })
            .then(function (r) { return r || new Response('离线', { status: 503 }); });
        })
    );
    return;
  }

  // ② 静态资源：stale-while-revalidate —— 命中即返回，同时后台拉新版本更新缓存
  if (STATIC_RE.test(url.pathname) || url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) putRuntime(req, res.clone());
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // ③ 其余同源 GET（无扩展名的目录请求等）：不接管，走浏览器默认
});
