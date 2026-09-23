/*
 * 魔方计时器 PWA Service Worker
 * 放在站点根目录，作用域为 '/'，以便缓存计时器依赖的跨路径资源
 * （/assets/*、/tools/cfop/* 等 GitHub Pages 无法用 Service-Worker-Allowed 头放宽作用域）。
 * 控制范围刻意只覆盖「计时器应用壳 + 其声明的依赖」，不接管全站其他页面。
 */
const CACHE = 'fto-timer-v1';

// 预缓存清单：计时器页本身 + 它直接依赖的全部站点级资源
const APP_SHELL = [
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
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/offline.html'
];

const SHELL_SET = new Set(APP_SHELL);

// 仅接管「计时器目录」及其声明的依赖，避免影响全站其他页面
function isOurConcern(pathname) {
  if (pathname.startsWith('/tools/timer/')) return true;
  if (SHELL_SET.has(pathname)) return true;
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })
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
  if (url.origin !== self.location.origin) return; // 不碰跨域（云同步等）
  if (!isOurConcern(url.pathname)) return;          // 不接管非计时器资源

  // 导航请求：network-first，离线时回退缓存的计时器页，再回退 offline 兜底页
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
            .then(function (r) { return r || caches.match('/tools/timer/index.html'); })
            .then(function (r) { return r || caches.match('/offline.html'); });
        })
    );
    return;
  }

  // 静态资源：cache-first，命中后立即返回，同时后台拉取新版本更新缓存（stale-while-revalidate）
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
