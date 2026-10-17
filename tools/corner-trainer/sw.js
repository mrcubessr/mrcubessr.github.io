/*
 * 角块编码识别训练 PWA Service Worker
 * 放在 tools/corner-trainer/ 目录下，作用域天然限定为 /tools/corner-trainer/，
 * 与根目录的计时器 PWA（sw.js，作用域 '/'）互不干扰 —— 两个应用各自独立缓存与离线。
 *
 * v1（2026-10-17）：初版。预缓存本页壳资源，支持离线答题。
 *   ⚠️ 凡动到 SHELL 里的文件，都要递增 CACHE —— 否则已「添加到主屏幕」的旧壳
 *   不会触发重新 install，用户看到的还是旧页面。
 *   策略沿用计时器 sw.js：导航 network-first（离线回退缓存页），
 *   静态资源 stale-while-revalidate（cache-first + 后台更新）。
 */
const CACHE = 'fto-corner-v1';

// 本页壳：页面本体 + 它直接依赖的站点级资源（导航条/主题/调色板/同步/图标）
const APP_SHELL = [
  '/tools/corner-trainer/',
  '/tools/corner-trainer/index.html',
  '/tools/corner-trainer/manifest.webmanifest',
  '/assets/js/theme.js',
  '/assets/js/palette.js',
  '/assets/js/sync-boot.js',
  '/assets/js/site-nav.js',
  '/assets/css/site-nav.css',
  '/assets/css/components.css',
  '/assets/css/site-layout.css',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/offline.html',
];

const SHELL_SET = new Set(APP_SHELL);

// 仅接管本页目录及其声明的依赖，不影响全站其它页面
function isOurConcern(pathname) {
  if (pathname.startsWith('/tools/corner-trainer/')) return true;
  if (SHELL_SET.has(pathname)) return true;
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // 单个资源 404 不应让整个 install 失败 → 逐个 add 并吞掉个别错误
        return Promise.all(APP_SHELL.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        // 只清理本应用自己的旧版本缓存，绝不删计时器 PWA 的缓存
        return Promise.all(
          keys.filter(function (k) {
            return k.startsWith('fto-corner-') && k !== CACHE;
          }).map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;  // 不碰跨域（云同步等）
  if (!isOurConcern(url.pathname)) return;           // 不接管非本应用资源

  // 导航请求：network-first，离线时回退缓存的本页，再回退 offline 兜底页
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req)
            .then(function (r) { return r || caches.match('/tools/corner-trainer/index.html'); })
            .then(function (r) { return r || caches.match('/offline.html'); });
        })
    );
    return;
  }

  // 静态资源：cache-first 命中即返回，同时后台拉新版本更新缓存
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
