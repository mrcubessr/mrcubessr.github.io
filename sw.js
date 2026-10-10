/*
 * 魔方计时器 PWA Service Worker
 * 放在站点根目录，作用域为 '/'，以便缓存计时器依赖的跨路径资源
 * （/assets/*、/tools/cfop/* 等 GitHub Pages 无法用 Service-Worker-Allowed 头放宽作用域）。
 * 控制范围刻意只覆盖「计时器应用壳 + 其声明的依赖」，不接管全站其他页面。
 */
/* v7（2026-10-10）：修复同步引擎「空数据覆盖非空」导致两端成绩互删的 bug——
   新增空覆盖铁律（emptykept 分支）、同步面板「用本机/云端覆盖」强制按钮、
   计时器同步后自动重读列表；同步相关 sync-engine.js / ls-provider.js / account-ui.js
   及 timer.js 均变更，故递增。
   静态资源走的是 stale-while-revalidate（cache-first + 后台更新），不递增版本号的话
   已安装的 PWA 首次打开会先拿到旧的 timer.js，第二次才更新；
   递增版本号可让 SW 重新 install + activate，一次性丢弃旧缓存。
   沿用 v3 的规矩：**凡是动到 APP_SHELL 里的文件，都要递增这个版本号。** */
const CACHE = 'fto-timer-v7';

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
